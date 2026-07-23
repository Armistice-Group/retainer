"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { taskSchema, taskStatusValues } from "@/lib/validations/task";
import { notify } from "@/lib/notifications";
import type { ActionState } from "@/actions/auth";

export async function createTaskAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await requireOrgContext();

  const parsed = taskSchema.safeParse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    description: formData.get("description"),
    assigneeId: formData.get("assigneeId"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
  if (!project || project.orgId !== org.id) return { error: "Project not found." };

  const task = await prisma.task.create({
    data: {
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      assigneeId: parsed.data.assigneeId || null,
    },
  });

  if (task.assigneeId) {
    await notify(prisma, {
      orgId: org.id,
      userIds: [task.assigneeId],
      type: "TASK_ASSIGNED",
      message: `You were assigned "${task.title}" on ${project.name}.`,
      link: `/projects/${project.id}`,
    });
  }

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath("/dashboard");
  return null;
}

export async function updateTaskStatusAction(taskId: string, projectId: string, status: string) {
  const { org } = await requireOrgContext();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");
  if (!taskStatusValues.includes(status as (typeof taskStatusValues)[number])) {
    throw new Error("Invalid status.");
  }

  await prisma.task.update({
    where: { id: taskId, projectId },
    data: { status: status as (typeof taskStatusValues)[number] },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

export async function assignTaskAction(taskId: string, projectId: string, assigneeId: string) {
  const { org } = await requireOrgContext();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");

  const task = await prisma.task.update({
    where: { id: taskId, projectId },
    data: { assigneeId: assigneeId || null },
  });

  if (task.assigneeId) {
    await notify(prisma, {
      orgId: org.id,
      userIds: [task.assigneeId],
      type: "TASK_ASSIGNED",
      message: `You were assigned "${task.title}" on ${project.name}.`,
      link: `/projects/${project.id}`,
    });
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

export async function deleteTaskAction(taskId: string, projectId: string) {
  const { org } = await requireOrgContext();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");

  await prisma.task.delete({ where: { id: taskId, projectId } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}
