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
import { pushTaskToLinear } from "@/lib/services/linear-sync";
import { checkBudgets } from "@/lib/services/budget-alerts";
import {
  addTaskComment,
  deleteTaskComment,
  TaskCommentError,
  type TaskCommentContext,
  setTaskWatching,
} from "@/lib/services/task-comments";

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

  revalidatePath("/tasks");
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
  await checkBudgets(projectId, [taskId]);

  revalidatePath(`/projects/${projectId}`);

  revalidatePath("/tasks");
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

  revalidatePath("/tasks");
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

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function deleteTaskAction(taskId: string, projectId: string) {
  const { org, user, role } = await requireOrgContext();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");
  if (!(await canViewProject(project, user.id, role))) throw new Error("Project not found.");

  await prisma.task.delete({ where: { id: taskId, projectId } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
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

  try {
    // Comments stay internal unless the author opts in on a Linear-linked task.
    await addTaskComment(commentContext(org.id, user, role), taskId, parsed.data);
  } catch (err) {
    if (err instanceof TaskCommentError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  return null;
}

export async function deleteTaskCommentAction(commentId: string, projectId: string) {
  const { org, user, role } = await requireOrgContext();
  await deleteTaskComment(commentContext(org.id, user, role), commentId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
}

export async function setTaskWatchingAction(taskId: string, projectId: string, watching: boolean) {
  const { org, user, role } = await requireOrgContext();
  await setTaskWatching(commentContext(org.id, user, role), taskId, watching);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
}

function commentContext(
  orgId: string,
  user: { id: string; name?: string | null },
  role: TaskCommentContext["role"]
): TaskCommentContext {
  return { orgId, actorId: user.id, actorName: user.name ?? null, role };
}
