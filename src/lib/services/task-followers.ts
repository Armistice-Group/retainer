import "server-only";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { mentionedUserIds } from "@/lib/mentions";

/** Org members who can see the project, i.e. who can be @mentioned on its
 * tasks: everyone for an open project; for a confidential one, its members
 * plus owners and admins. */
export async function mentionableUsers(project: {
  id: string;
  orgId: string;
  confidential: boolean;
}) {
  const memberships = await prisma.membership.findMany({
    where: {
      orgId: project.orgId,
      ...(project.confidential
        ? {
            OR: [
              { role: { in: ["OWNER", "ADMIN"] } },
              { user: { projectMembers: { some: { projectId: project.id } } } },
            ],
          }
        : {}),
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return memberships.map((m) => m.user);
}

export async function setWatching(taskId: string, userId: string, watching: boolean) {
  if (watching) {
    await prisma.taskWatcher.upsert({
      where: { taskId_userId: { taskId, userId } },
      create: { taskId, userId },
      update: {},
    });
  } else {
    await prisma.taskWatcher.deleteMany({ where: { taskId, userId } });
  }
}

/** Notifies everyone a new comment concerns: people @mentioned in it get a
 * mention; the assignee and watchers get a comment notification. The author
 * is never notified. The author (when a member) and anyone mentioned start
 * watching the task. Mentions of people who can't see the project are
 * ignored. */
export async function notifyTaskComment(params: {
  taskId: string;
  authorId: string | null;
  authorName: string;
  body: string;
  /** e.g. " in Linear" */
  where?: string;
}) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: params.taskId },
    include: { project: true, watchers: { select: { userId: true } } },
  });
  const allowed = new Set((await mentionableUsers(task.project)).map((u) => u.id));
  const mentioned = mentionedUserIds(params.body).filter(
    (id) => allowed.has(id) && id !== params.authorId
  );

  for (const userId of [...mentioned, ...(params.authorId ? [params.authorId] : [])]) {
    if (allowed.has(userId)) await setWatching(task.id, userId, true);
  }

  const link = `/projects/${task.projectId}?task=${task.id}`;
  const where = params.where ?? "";
  await notify(prisma, {
    orgId: task.project.orgId,
    userIds: mentioned,
    type: "TASK_MENTIONED",
    message: `${params.authorName} mentioned you on "${task.title}"${where}.`,
    link,
  });
  const followers = [task.assigneeId, ...task.watchers.map((w) => w.userId)].filter(
    (id): id is string =>
      !!id && id !== params.authorId && !mentioned.includes(id) && allowed.has(id)
  );
  await notify(prisma, {
    orgId: task.project.orgId,
    userIds: followers,
    type: "TASK_COMMENTED",
    message: `${params.authorName} commented on "${task.title}"${where}.`,
    link,
  });
}
