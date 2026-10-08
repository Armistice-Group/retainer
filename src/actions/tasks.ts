"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { canViewProject } from "@/lib/project-access";
import {
  taskSchema,
  taskUpdateSchema,
  taskStatusValues,
  taskCommentSchema,
} from "@/lib/validations/task";
import { notify } from "@/lib/notifications";
import type { ActionState } from "@/actions/auth";
import { soloMemberId } from "@/lib/org";
import { pushCommentToLinear, pushTaskToLinear } from "@/lib/services/linear-sync";

export async function createTaskAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();

  const parsed = taskSchema.safeParse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    description: formData.get("description"),
    assigneeId: formData.get("assigneeId"),
    estimatedHours: formData.get("estimatedHours") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
  if (!project || project.orgId !== org.id) return { error: "Project not found." };
  if (!(await canViewProject(project, user.id, role))) return { error: "Project not found." };

  const task = await prisma.task.create({
    data: {
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      assigneeId: parsed.data.assigneeId || (await soloMemberId(org.id)),
      estimatedHours: parsed.data.estimatedHours ?? null,
    },
  });
  // Projects linked to Linear get a matching issue (best effort).
  await pushTaskToLinear(task.id);

  // No point notifying someone about a task they just assigned themselves.
  if (task.assigneeId && task.assigneeId !== user.id) {
    await notify(prisma, {
      orgId: org.id,
      userIds: [task.assigneeId],
      type: "TASK_ASSIGNED",
      message: `You were assigned "${task.title}" on ${project.name}.`,
      link: `/projects/${project.id}?task=${task.id}`,
    });
  }

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath("/dashboard");
  return null;
}

export async function updateTaskAction(
  taskId: string,
  projectId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();

  const parsed = taskUpdateSchema.safeParse({
    projectId,
    title: formData.get("title"),
    description: formData.get("description"),
    estimatedHours: formData.get("estimatedHours") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) return { error: "Project not found." };
  if (!(await canViewProject(project, user.id, role))) return { error: "Project not found." };

  await prisma.task.update({
    where: { id: taskId, projectId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      estimatedHours: parsed.data.estimatedHours ?? null,
    },
  });
  await pushTaskToLinear(taskId);

  revalidatePath(`/projects/${projectId}`);
  return null;
}

export async function updateTaskStatusAction(taskId: string, projectId: string, status: string) {
  const { org, user, role } = await requireOrgContext();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");
  if (!(await canViewProject(project, user.id, role))) throw new Error("Project not found.");
  if (!taskStatusValues.includes(status as (typeof taskStatusValues)[number])) {
    throw new Error("Invalid status.");
  }

  await prisma.task.update({
    where: { id: taskId, projectId },
    data: { status: status as (typeof taskStatusValues)[number] },
  });
  await pushTaskToLinear(taskId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

export async function assignTaskAction(taskId: string, projectId: string, assigneeId: string) {
  const { org, user, role } = await requireOrgContext();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");
  if (!(await canViewProject(project, user.id, role))) throw new Error("Project not found.");

  const task = await prisma.task.update({
    where: { id: taskId, projectId },
    data: { assigneeId: assigneeId || null },
  });
  await pushTaskToLinear(taskId);

  if (task.assigneeId) {
    await notify(prisma, {
      orgId: org.id,
      userIds: [task.assigneeId],
      type: "TASK_ASSIGNED",
      message: `You were assigned "${task.title}" on ${project.name}.`,
      link: `/projects/${project.id}?task=${task.id}`,
    });
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

export async function deleteTaskAction(taskId: string, projectId: string) {
  const { org, user, role } = await requireOrgContext();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");
  if (!(await canViewProject(project, user.id, role))) throw new Error("Project not found.");

  await prisma.task.delete({ where: { id: taskId, projectId } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

export async function addTaskCommentAction(
  taskId: string,
  projectId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();

  const parsed = taskCommentSchema.safeParse({
    body: formData.get("body"),
    postToLinear: formData.get("postToLinear") === "on",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) return { error: "Project not found." };
  if (!(await canViewProject(project, user.id, role))) return { error: "Project not found." };
  const task = await prisma.task.findUnique({ where: { id: taskId, projectId } });
  if (!task) return { error: "Task not found." };

  const comment = await prisma.taskComment.create({
    data: { taskId, authorId: user.id, body: parsed.data.body },
  });
  // Comments stay internal unless the author opts in on a Linear-linked task.
  if (parsed.data.postToLinear) await pushCommentToLinear(comment.id);

  if (task.assigneeId && task.assigneeId !== user.id) {
    await notify(prisma, {
      orgId: org.id,
      userIds: [task.assigneeId],
      type: "TASK_COMMENTED",
      message: `${user.name ?? "Someone"} commented on "${task.title}".`,
      link: `/projects/${projectId}?task=${taskId}`,
    });
  }

  revalidatePath(`/projects/${projectId}`);
  return null;
}

/** Removes the comment here only — a copy already posted to Linear stays. */
export async function deleteTaskCommentAction(commentId: string, projectId: string) {
  const { org, user, role } = await requireOrgContext();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");
  if (!(await canViewProject(project, user.id, role))) throw new Error("Project not found.");

  const comment = await prisma.taskComment.findUnique({
    where: { id: commentId },
    include: { task: { select: { projectId: true } } },
  });
  if (!comment || comment.task.projectId !== projectId) throw new Error("Comment not found.");
  const canModerate = role === "OWNER" || role === "ADMIN";
  if (comment.authorId !== user.id && !canModerate) throw new Error("Not allowed.");

  await prisma.taskComment.delete({ where: { id: commentId } });
  revalidatePath(`/projects/${projectId}`);
}
