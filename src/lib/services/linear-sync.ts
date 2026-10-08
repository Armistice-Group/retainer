import "server-only";
import { prisma } from "@/lib/prisma";
import {
  canWrite,
  createComment,
  createIssue,
  findUserIdByEmail,
  getLinearAccessToken,
  listScopedIssues,
  mapLinearStateType,
  stateIdForStatus,
  updateIssue,
  type IssueScope,
} from "@/lib/integrations/linear";
import type { ExternalProjectLink } from "@/generated/prisma/client";

export class LinearSyncError extends Error {}

function scopeOf(link: ExternalProjectLink): IssueScope {
  return { teamId: link.externalId, projectId: link.linearProjectId, labelIds: link.labelIds };
}

async function linearContext(projectId: string) {
  const link = await prisma.externalProjectLink.findUnique({ where: { projectId } });
  if (!link || link.source !== "linear") return null;
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const connection = await prisma.linearConnection.findUnique({ where: { orgId: project.orgId } });
  if (!connection) return null;
  return { link, project, connection };
}

export type SyncResult = {
  created: number;
  updated: number;
  skipped: number;
  /** Tasks pulled in earlier whose issue no longer matches the link's
   * filters (e.g. after narrowing it to a Linear project or labels). */
  stale: number;
  /** Open tasks created here with no issue yet, sent to Linear as new issues. */
  pushed: number;
  pushFailed: number;
  /** Why the first failed push failed, for showing to the user. */
  pushError: string | null;
};

/** Pulls the issues matching a project's Linear link (team + optional Linear
 * project / labels) into its tasks. An issue already linked to a task in a
 * different Consultainer project is left there and counted as skipped. */
export async function pullLinearIssues(projectId: string): Promise<SyncResult> {
  const ctx = await linearContext(projectId);
  if (!ctx)
    throw new LinearSyncError("This project isn't linked to Linear, or Linear isn't connected.");

  const token = await getLinearAccessToken(ctx.connection);
  const issues = await listScopedIssues(token, scopeOf(ctx.link));

  const members = await prisma.membership.findMany({
    where: { orgId: ctx.project.orgId },
    include: { user: { select: { id: true, email: true } } },
  });
  const userIdByEmail = new Map(members.map((m) => [m.user.email.toLowerCase(), m.user.id]));
  // Solo org: every issue is that person's, whoever Linear says it's assigned to.
  const soloUserId = members.length === 1 ? members[0].user.id : null;

  const result: SyncResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    stale: 0,
    pushed: 0,
    pushFailed: 0,
    pushError: null,
  };
  for (const issue of issues) {
    const assigneeId =
      soloUserId ??
      (issue.assignee?.email
        ? (userIdByEmail.get(issue.assignee.email.toLowerCase()) ?? null)
        : null);
    const fields = {
      title: issue.title,
      description: issue.description,
      status: mapLinearStateType(issue.state.type),
      assigneeId,
    };

    const existing = await prisma.externalTaskLink.findUnique({
      where: { source_externalId: { source: "linear", externalId: issue.id } },
      include: { task: { select: { projectId: true } } },
    });

    if (existing && existing.task.projectId !== projectId) {
      result.skipped++;
    } else if (existing) {
      await prisma.task.update({ where: { id: existing.taskId }, data: fields });
      await prisma.externalTaskLink.update({
        where: { id: existing.id },
        data: { externalKey: issue.identifier, externalUrl: issue.url, lastSyncedAt: new Date() },
      });
      result.updated++;
    } else {
      await prisma.task.create({
        data: {
          projectId,
          ...fields,
          externalLink: {
            create: {
              source: "linear",
              externalId: issue.id,
              externalKey: issue.identifier,
              externalUrl: issue.url,
              lastSyncedAt: new Date(),
            },
          },
        },
      });
      result.created++;
    }
  }

  await prisma.externalProjectLink.update({
    where: { id: ctx.link.id },
    data: { lastSyncedAt: new Date() },
  });
  result.stale = (await staleTasks(projectId, new Set(issues.map((i) => i.id)))).length;

  // The other direction: open tasks that never got an issue — created
  // before the project was linked, or while a push was failing.
  if (ctx.link.pushChanges && canWrite(ctx.connection)) {
    const unlinked = await prisma.task.findMany({
      where: { projectId, externalLink: null, status: { not: "DONE" } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    for (const task of unlinked) {
      const push = await pushTaskToLinear(task.id);
      if (push.pushed) {
        result.pushed++;
      } else {
        result.pushFailed++;
        result.pushError ??= push.reason ?? null;
      }
    }
  }
  return result;
}

/** Linear-linked tasks in the project whose issue isn't in `matchingIds`. */
async function staleTasks(projectId: string, matchingIds: Set<string>) {
  const linked = await prisma.task.findMany({
    where: { projectId, externalLink: { is: { source: "linear" } } },
    select: {
      id: true,
      externalLink: { select: { externalId: true } },
      _count: { select: { timeEntries: true } },
    },
  });
  return linked.filter((t) => !matchingIds.has(t.externalLink!.externalId));
}

/** Deletes tasks pulled in from Linear that no longer match the link's
 * filters. Tasks with time logged against them are kept (deleting would
 * detach those hours from the task) and counted instead. Nothing is changed
 * in Linear. */
export async function removeStaleLinearTasks(projectId: string) {
  const ctx = await linearContext(projectId);
  if (!ctx)
    throw new LinearSyncError("This project isn't linked to Linear, or Linear isn't connected.");

  const token = await getLinearAccessToken(ctx.connection);
  const issues = await listScopedIssues(token, scopeOf(ctx.link));
  const stale = await staleTasks(projectId, new Set(issues.map((i) => i.id)));
  const removable = stale.filter((t) => t._count.timeEntries === 0).map((t) => t.id);

  if (removable.length) {
    await prisma.task.deleteMany({ where: { id: { in: removable }, projectId } });
  }
  return { removed: removable.length, keptWithTime: stale.length - removable.length };
}

/** Mirrors a task to Linear after it's created or changed in Consultainer:
 * creates the issue (in the link's team / Linear project, with its labels)
 * the first time, then updates title, description, status, and assignee.
 * Best effort — a Linear outage or a read-only connection never blocks the
 * change in Consultainer itself; the reason is returned for logging. */
export async function pushTaskToLinear(
  taskId: string,
): Promise<{ pushed: boolean; reason?: string }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { externalLink: true, assignee: { select: { email: true } } },
  });
  if (!task) return { pushed: false, reason: "task not found" };

  const ctx = await linearContext(task.projectId);
  if (!ctx || !ctx.link.pushChanges) return { pushed: false, reason: "not linked" };
  if (!canWrite(ctx.connection)) return { pushed: false, reason: "read-only connection" };

  try {
    const token = await getLinearAccessToken(ctx.connection);
    const [stateId, assigneeId] = await Promise.all([
      stateIdForStatus(token, ctx.link.externalId, task.status),
      task.assignee ? findUserIdByEmail(token, task.assignee.email) : Promise.resolve(null),
    ]);
    const fields = { title: task.title, description: task.description, stateId, assigneeId };

    if (task.externalLink?.source === "linear") {
      const issue = await updateIssue(token, task.externalLink.externalId, fields);
      await prisma.externalTaskLink.update({
        where: { id: task.externalLink.id },
        data: {
          ...(issue ? { externalKey: issue.identifier, externalUrl: issue.url } : {}),
          lastSyncedAt: new Date(),
        },
      });
    } else if (!task.externalLink) {
      const issue = await createIssue(token, scopeOf(ctx.link), fields);
      await prisma.externalTaskLink.create({
        data: {
          taskId: task.id,
          source: "linear",
          externalId: issue.id,
          externalKey: issue.identifier,
          externalUrl: issue.url,
          lastSyncedAt: new Date(),
        },
      });
    }
    return { pushed: true };
  } catch (err) {
    console.warn("[linear] Couldn't push task", taskId, err);
    return { pushed: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Whether a comment on this task can be posted to its Linear issue: the task
 * mirrors an issue, and the project link pushes changes over a connection
 * that can write. */
export async function canPushCommentsToLinear(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { externalLink: true },
  });
  if (task?.externalLink?.source !== "linear") return false;
  const ctx = await linearContext(task.projectId);
  return !!ctx && ctx.link.pushChanges && canWrite(ctx.connection);
}

/** Posts a task comment to the task's Linear issue, attributed to its author
 * in the body (Linear shows the connected account as the poster). Best
 * effort, like pushTaskToLinear — the comment is already saved here. */
export async function pushCommentToLinear(
  commentId: string,
): Promise<{ pushed: boolean; reason?: string }> {
  const comment = await prisma.taskComment.findUnique({
    where: { id: commentId },
    include: { author: { select: { name: true } }, task: { include: { externalLink: true } } },
  });
  if (!comment) return { pushed: false, reason: "comment not found" };
  const issueLink = comment.task.externalLink;
  if (issueLink?.source !== "linear") return { pushed: false, reason: "task not linked" };

  const ctx = await linearContext(comment.task.projectId);
  if (!ctx || !ctx.link.pushChanges) return { pushed: false, reason: "not linked" };
  if (!canWrite(ctx.connection)) return { pushed: false, reason: "read-only connection" };

  try {
    const token = await getLinearAccessToken(ctx.connection);
    const body = comment.author?.name
      ? `**${comment.author.name}:** ${comment.body}`
      : comment.body;
    const created = await createComment(token, issueLink.externalId, body);
    await prisma.taskComment.update({
      where: { id: comment.id },
      data: { externalId: created.id, externalUrl: created.url },
    });
    return { pushed: true };
  } catch (err) {
    console.warn("[linear] Couldn't push comment", commentId, err);
    return { pushed: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
