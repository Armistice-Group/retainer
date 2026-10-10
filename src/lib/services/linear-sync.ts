import "server-only";
import { prisma } from "@/lib/prisma";
import { notifyTaskComment } from "@/lib/services/task-followers";
import { mentionsToPlain } from "@/lib/mentions";
import {
  canWrite,
  createComment,
  createIssue,
  fetchComment,
  fetchIssue,
  fetchWorkspace,
  findUserIdByEmail,
  getLinearAccessToken,
  listScopedIssues,
  listTeamCommentsSince,
  mapLinearStateType,
  stateIdForStatus,
  updateIssue,
  type IssueScope,
  type LinearComment,
  type LinearIssue,
  type LinearIssueWithScope,
} from "@/lib/integrations/linear";
import type { ExternalProjectLink, LinearConnection } from "@/generated/prisma/client";
import { dueDateData } from "@/lib/services/deadlines";

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
  /** Linear comments brought in as task comments. */
  comments: number;
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

  const members = await orgMembers(ctx.project.orgId);

  const result: SyncResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    stale: 0,
    comments: 0,
    pushed: 0,
    pushFailed: 0,
    pushError: null,
  };
  for (const issue of issues) {
    result[await applyIssue(projectId, issue, members)]++;
  }

  // Comments changed since the last sync (all of them the first time) on
  // this project's linked issues. The first pull is a backfill, so it
  // doesn't notify anyone.
  const since = ctx.link.lastSyncedAt;
  const comments = await listTeamCommentsSince(token, ctx.link.externalId, since);
  const taskByIssue = await linkedTasksByIssue(projectId);
  for (const comment of comments) {
    const taskId = comment.issue ? taskByIssue.get(comment.issue.id) : undefined;
    if (!taskId) continue;
    if (await importLinearComment(taskId, comment, members, { notify: !!since })) {
      result.comments++;
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
 * the first time, then updates title, description, due date, status, and
 * assignee.
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
    const fields = {
      title: task.title,
      description: task.description,
      dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
      stateId,
      assigneeId,
    };

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
    const text = mentionsToPlain(comment.body);
    const body = comment.author?.name ? `**${comment.author.name}:** ${text}` : text;
    const created = await createComment(token, issueLink.externalId, body);
    const save = () =>
      prisma.taskComment.update({
        where: { id: comment.id },
        data: { externalId: created.id, externalUrl: created.url },
      });
    try {
      await save();
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
      // A webhook imported our own comment back first; drop that copy.
      await prisma.taskComment.deleteMany({ where: { externalId: created.id, source: "linear" } });
      await save();
    }
    return { pushed: true };
  } catch (err) {
    console.warn("[linear] Couldn't push comment", commentId, err);
    return { pushed: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

type OrgMembers = { userIdByEmail: Map<string, string>; soloUserId: string | null };

async function orgMembers(orgId: string): Promise<OrgMembers> {
  const members = await prisma.membership.findMany({
    where: { orgId },
    include: { user: { select: { id: true, email: true } } },
  });
  return {
    userIdByEmail: new Map(members.map((m) => [m.user.email.toLowerCase(), m.user.id])),
    // Solo org: every issue is that person's, whoever Linear says it's assigned to.
    soloUserId: members.length === 1 ? members[0].user.id : null,
  };
}

/** Creates or updates the task mirroring one issue in `projectId`. An issue
 * already linked to a task in a different project is left there. */
async function applyIssue(
  projectId: string,
  issue: LinearIssue,
  members: OrgMembers,
): Promise<"created" | "updated" | "skipped"> {
  const assigneeId =
    members.soloUserId ??
    (issue.assignee?.email
      ? (members.userIdByEmail.get(issue.assignee.email.toLowerCase()) ?? null)
      : null);
  const fields = {
    title: issue.title,
    description: issue.description,
    dueDate: issue.dueDate ? new Date(`${issue.dueDate}T00:00:00Z`) : null,
    status: mapLinearStateType(issue.state.type),
    assigneeId,
  };

  const existing = await prisma.externalTaskLink.findUnique({
    where: { source_externalId: { source: "linear", externalId: issue.id } },
    include: { task: { select: { projectId: true } } },
  });

  if (existing && existing.task.projectId !== projectId) return "skipped";
  if (existing) {
    const current = await prisma.task.findUnique({
      where: { id: existing.taskId },
      select: { dueDate: true },
    });
    await prisma.task.update({
      where: { id: existing.taskId },
      // A changed due date gets its own reminders.
      data: { ...fields, ...dueDateData(current?.dueDate ?? null, fields.dueDate) },
    });
    await prisma.externalTaskLink.update({
      where: { id: existing.id },
      data: { externalKey: issue.identifier, externalUrl: issue.url, lastSyncedAt: new Date() },
    });
    return "updated";
  }
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
  return "created";
}

async function linkedTasksByIssue(projectId: string) {
  const links = await prisma.externalTaskLink.findMany({
    where: { source: "linear", task: { projectId } },
    select: { externalId: true, taskId: true },
  });
  return new Map(links.map((l) => [l.externalId, l.taskId]));
}

/** Saves a Linear comment on the task, unless it's already here (pulled in
 * before, or the copy of a comment posted from here). Returns whether it
 * added one. */
async function importLinearComment(
  taskId: string,
  comment: LinearComment,
  members: OrgMembers,
  opts: { notify: boolean },
) {
  const existing = await prisma.taskComment.findUnique({ where: { externalId: comment.id } });
  if (existing) {
    // Edited in Linear: keep pulled-in comments current. Ours stay as written.
    if (existing.source === "linear" && existing.body !== comment.body) {
      await prisma.taskComment.update({ where: { id: existing.id }, data: { body: comment.body } });
    }
    return false;
  }

  const email = comment.user?.email?.toLowerCase();
  const authorId = email ? (members.userIdByEmail.get(email) ?? null) : null;
  const authorName = comment.user?.name ?? comment.botActor?.name ?? "Linear";
  try {
    await prisma.taskComment.create({
      data: {
        taskId,
        body: comment.body,
        source: "linear",
        externalId: comment.id,
        externalUrl: comment.url,
        externalAuthor: authorName,
        authorId,
        createdAt: new Date(comment.createdAt),
      },
    });
  } catch (err) {
    // Lost a race with another delivery or a push saving the same id.
    if ((err as { code?: string }).code === "P2002") return false;
    throw err;
  }

  if (opts.notify) {
    await notifyTaskComment({
      taskId,
      authorId,
      authorName,
      body: comment.body,
      where: " in Linear",
    });
  }
  return true;
}

function issueInScope(link: ExternalProjectLink, issue: LinearIssueWithScope) {
  if (link.externalId !== issue.team.id) return false;
  if (link.linearProjectId && link.linearProjectId !== issue.project?.id) return false;
  if (link.labelIds.length && !issue.labels.nodes.some((l) => link.labelIds.includes(l.id))) {
    return false;
  }
  return true;
}

/** Connections a webhook from this Linear organization belongs to. Older
 * connections don't know their Linear org id yet; look it up once. */
async function connectionsForLinearOrg(linearOrgId: string) {
  const unknown = await prisma.linearConnection.findMany({ where: { linearOrgId: null } });
  for (const connection of unknown) {
    try {
      const workspace = await fetchWorkspace(await getLinearAccessToken(connection));
      await prisma.linearConnection.update({
        where: { id: connection.id },
        data: { linearOrgId: workspace.id },
      });
    } catch (err) {
      console.warn("[linear] Couldn't look up workspace for connection", connection.id, err);
    }
  }
  return prisma.linearConnection.findMany({ where: { linearOrgId } });
}

export type LinearWebhookPayload = {
  action: "create" | "update" | "remove" | string;
  type: string;
  organizationId: string;
  data: { id: string; issueId?: string };
};

// Webhooks can beat our own write of a pushed comment's id; a short wait
// lets that land so the copy isn't imported back.
const ECHO_GRACE_MS = 1500;

/** Applies a Linear webhook delivery (Issue or Comment events) to every
 * connected org in that Linear workspace. Fetches the current object
 * rather than trusting the payload, so ordering and partial payloads don't
 * matter. */
export async function handleLinearWebhook(payload: LinearWebhookPayload) {
  if (payload.type !== "Issue" && payload.type !== "Comment") return { handled: false };
  const connections = await connectionsForLinearOrg(payload.organizationId);

  for (const connection of connections) {
    await prisma.linearConnection.update({
      where: { id: connection.id },
      data: { lastWebhookAt: new Date() },
    });
    try {
      if (payload.type === "Issue") await handleIssueEvent(connection, payload);
      else await handleCommentEvent(connection, payload);
    } catch (err) {
      console.warn("[linear] Webhook handling failed", payload.type, payload.data.id, err);
    }
  }
  return { handled: connections.length > 0 };
}

async function handleIssueEvent(connection: LinearConnection, payload: LinearWebhookPayload) {
  if (payload.action === "remove") return; // Stale-task cleanup handles removals.
  const token = await getLinearAccessToken(connection);
  const issue = await fetchIssue(token, payload.data.id);
  if (!issue) return;

  const members = await orgMembers(connection.orgId);
  const existing = await prisma.externalTaskLink.findFirst({
    where: { source: "linear", externalId: issue.id, task: { project: { orgId: connection.orgId } } },
    include: { task: { select: { projectId: true } } },
  });
  if (existing) {
    await applyIssue(existing.task.projectId, issue, members);
    return;
  }
  // New to us: goes to the first project whose link it matches.
  const links = await prisma.externalProjectLink.findMany({
    where: { source: "linear", externalId: issue.team.id, project: { orgId: connection.orgId } },
    orderBy: { createdAt: "asc" },
  });
  const link = links.find((l) => issueInScope(l, issue));
  if (link) await applyIssue(link.projectId, issue, members);
}

async function handleCommentEvent(connection: LinearConnection, payload: LinearWebhookPayload) {
  if (payload.action === "remove") {
    await prisma.taskComment.deleteMany({
      where: {
        externalId: payload.data.id,
        source: "linear",
        task: { project: { orgId: connection.orgId } },
      },
    });
    return;
  }

  await new Promise((r) => setTimeout(r, ECHO_GRACE_MS));
  const token = await getLinearAccessToken(connection);
  const comment = await fetchComment(token, payload.data.id);
  if (!comment?.issue) return;
  const link = await prisma.externalTaskLink.findFirst({
    where: {
      source: "linear",
      externalId: comment.issue.id,
      task: { project: { orgId: connection.orgId } },
    },
  });
  if (!link) return;
  await importLinearComment(link.taskId, comment, await orgMembers(connection.orgId), {
    notify: payload.action === "create",
  });
}
