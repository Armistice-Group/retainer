import "server-only";
import { prisma } from "@/lib/prisma";
import {
  canWrite,
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

export type SyncResult = { created: number; updated: number; skipped: number };

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

  const result: SyncResult = { created: 0, updated: 0, skipped: 0 };
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
        data: { externalUrl: issue.url, lastSyncedAt: new Date() },
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
  return result;
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
      await updateIssue(token, task.externalLink.externalId, fields);
      await prisma.externalTaskLink.update({
        where: { id: task.externalLink.id },
        data: { lastSyncedAt: new Date() },
      });
    } else if (!task.externalLink) {
      const issue = await createIssue(token, scopeOf(ctx.link), fields);
      await prisma.externalTaskLink.create({
        data: {
          taskId: task.id,
          source: "linear",
          externalId: issue.id,
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
