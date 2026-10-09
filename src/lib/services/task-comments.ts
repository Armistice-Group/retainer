import "server-only";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/lib/project-access";
import { notify } from "@/lib/notifications";
import { pushCommentToLinear } from "@/lib/services/linear-sync";
import type { Role } from "@/generated/prisma/client";

export class TaskCommentError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" = "not_found"
  ) {
    super(message);
  }
}

export type TaskCommentContext = {
  orgId: string;
  actorId: string;
  actorName: string | null;
  role: Role;
};

async function requireTask(ctx: TaskCommentContext, taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { project: true } });
  if (!task || task.project.orgId !== ctx.orgId) throw new TaskCommentError("Task not found.");
  if (!(await canViewProject(task.project, ctx.actorId, ctx.role))) {
    throw new TaskCommentError("Task not found.");
  }
  return task;
}

function serialize(comment: {
  id: string;
  body: string;
  createdAt: Date;
  source: string;
  externalUrl: string | null;
  externalAuthor: string | null;
  author: { id: string; name: string } | null;
}) {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: comment.author,
    // "app" (written here) or "linear" (pulled in from the Linear issue,
    // with the Linear user's name in authorName even when author is null).
    source: comment.source,
    authorName: comment.author?.name ?? comment.externalAuthor,
    linearUrl: comment.externalUrl,
  };
}

const commentInclude = { author: { select: { id: true, name: true } } } as const;

export async function listTaskComments(ctx: TaskCommentContext, taskId: string) {
  await requireTask(ctx, taskId);
  const comments = await prisma.taskComment.findMany({
    where: { taskId },
    include: commentInclude,
    orderBy: { createdAt: "asc" },
  });
  return comments.map(serialize);
}

/** Adds an internal comment and notifies the assignee. With `postToLinear`,
 * a task mirrored to a Linear issue also gets the comment there (best
 * effort); on unlinked tasks the flag does nothing. */
export async function addTaskComment(
  ctx: TaskCommentContext,
  taskId: string,
  input: { body: string; postToLinear: boolean }
) {
  const task = await requireTask(ctx, taskId);

  const created = await prisma.taskComment.create({
    data: { taskId, authorId: ctx.actorId, body: input.body },
  });
  if (input.postToLinear) await pushCommentToLinear(created.id);

  if (task.assigneeId && task.assigneeId !== ctx.actorId) {
    await notify(prisma, {
      orgId: ctx.orgId,
      userIds: [task.assigneeId],
      type: "TASK_COMMENTED",
      message: `${ctx.actorName ?? "Someone"} commented on "${task.title}".`,
      link: `/projects/${task.projectId}?task=${taskId}`,
    });
  }

  const comment = await prisma.taskComment.findUniqueOrThrow({
    where: { id: created.id },
    include: commentInclude,
  });
  return { projectId: task.projectId, comment: serialize(comment) };
}

/** Removes the comment here only — a copy already posted to Linear stays.
 * Authors can delete their own; owners and admins can delete any. */
export async function deleteTaskComment(ctx: TaskCommentContext, commentId: string) {
  const comment = await prisma.taskComment.findUnique({ where: { id: commentId } });
  if (!comment) throw new TaskCommentError("Comment not found.");
  const task = await requireTask(ctx, comment.taskId).catch(() => {
    throw new TaskCommentError("Comment not found.");
  });
  const canModerate = ctx.role === "OWNER" || ctx.role === "ADMIN";
  if (comment.authorId !== ctx.actorId && !canModerate) {
    throw new TaskCommentError(
      "Only the author or an admin can delete this comment.",
      "forbidden"
    );
  }
  await prisma.taskComment.delete({ where: { id: commentId } });
  return { projectId: task.projectId };
}
