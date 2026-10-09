import "server-only";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/lib/project-access";
import { notifyTaskComment, setWatching } from "@/lib/services/task-followers";
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
  sharedWithClient: boolean;
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
    sharedWithClient: comment.sharedWithClient,
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

/** Adds an internal comment and notifies the assignee, watchers and anyone
 * @mentioned (`@[Name](user:<id>)`). With `postToLinear`,
 * a task mirrored to a Linear issue also gets the comment there (best
 * effort); on unlinked tasks the flag does nothing. */
export async function addTaskComment(
  ctx: TaskCommentContext,
  taskId: string,
  input: { body: string; postToLinear: boolean; shareWithClient?: boolean }
) {
  const task = await requireTask(ctx, taskId);

  const created = await prisma.taskComment.create({
    data: {
      taskId,
      authorId: ctx.actorId,
      body: input.body,
      // Only meaningful while the project shares its tasks; harmless otherwise.
      sharedWithClient: !!input.shareWithClient,
    },
  });
  if (input.postToLinear) await pushCommentToLinear(created.id);

  await notifyTaskComment({
    taskId,
    authorId: ctx.actorId,
    authorName: ctx.actorName ?? "Someone",
    body: input.body,
  });

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

/** Follow or unfollow a task's comments. */
export async function setTaskWatching(ctx: TaskCommentContext, taskId: string, watching: boolean) {
  const task = await requireTask(ctx, taskId);
  await setWatching(taskId, ctx.actorId, watching);
  return { projectId: task.projectId, watching };
}

/** Show or hide a comment on the project's share page. Same rule as
 * deleting: its author, or an owner/admin. */
export async function setCommentShared(ctx: TaskCommentContext, commentId: string, shared: boolean) {
  const comment = await prisma.taskComment.findUnique({ where: { id: commentId } });
  if (!comment) throw new TaskCommentError("Comment not found.");
  const task = await requireTask(ctx, comment.taskId).catch(() => {
    throw new TaskCommentError("Comment not found.");
  });
  const canModerate = ctx.role === "OWNER" || ctx.role === "ADMIN";
  if (comment.authorId !== ctx.actorId && !canModerate) {
    throw new TaskCommentError("Only the author or an admin can change this.", "forbidden");
  }
  await prisma.taskComment.update({ where: { id: commentId }, data: { sharedWithClient: shared } });
  return { projectId: task.projectId };
}
