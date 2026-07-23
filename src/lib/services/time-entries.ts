import "server-only";
import { prisma } from "@/lib/prisma";
import { notify, getOrgAdminUserIds } from "@/lib/notifications";
import { postToSlack } from "@/lib/slack";
import type { Role } from "@/generated/prisma/client";

export class TimeEntryError extends Error {}

export type TimeEntryContext = {
  orgId: string;
  slackWebhookUrl: string | null;
  actorId: string;
  actorName: string | null;
  role: Role;
};

export type TimeEntryInput = {
  projectId: string;
  taskId?: string | null;
  date: string;
  hours: number;
  description?: string | null;
  billable: boolean;
  userId?: string | null;
  rateOverride?: number | null;
};

function canManageTeam(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}

async function assertTask(taskId: string | null | undefined, projectId: string) {
  if (!taskId) return;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.projectId !== projectId) throw new TimeEntryError("Task not found.");
}

export async function createTimeEntry(ctx: TimeEntryContext, input: TimeEntryInput) {
  const project = await prisma.project.findUnique({ where: { id: input.projectId } });
  if (!project || project.orgId !== ctx.orgId) throw new TimeEntryError("Project not found.");

  await assertTask(input.taskId, input.projectId);

  const manage = canManageTeam(ctx.role);
  const targetUserId = manage && input.userId ? input.userId : ctx.actorId;

  const entry = await prisma.timeEntry.create({
    data: {
      orgId: ctx.orgId,
      projectId: input.projectId,
      userId: targetUserId,
      taskId: input.taskId || null,
      date: new Date(input.date),
      hours: input.hours,
      description: input.description || null,
      billable: input.billable,
      rateOverride: manage && input.rateOverride != null ? input.rateOverride : null,
    },
  });

  const adminIds = await getOrgAdminUserIds(prisma, ctx.orgId, ctx.actorId);
  if (adminIds.length > 0) {
    const message = `${ctx.actorName ?? "Someone"} logged ${input.hours}h on ${project.name}.`;
    await notify(prisma, {
      orgId: ctx.orgId,
      userIds: adminIds,
      type: "TIME_LOGGED",
      message,
      link: `/projects/${project.id}`,
    });
    await postToSlack(ctx.slackWebhookUrl, message);
  }

  return entry;
}

export async function updateTimeEntry(
  ctx: TimeEntryContext,
  timeEntryId: string,
  input: TimeEntryInput
) {
  const existing = await prisma.timeEntry.findUnique({ where: { id: timeEntryId } });
  if (!existing || existing.orgId !== ctx.orgId) throw new TimeEntryError("Entry not found.");

  const manage = canManageTeam(ctx.role);
  if (existing.userId !== ctx.actorId && !manage) {
    throw new TimeEntryError("You can only edit your own time entries.");
  }
  if (existing.invoiceLineItemId) {
    throw new TimeEntryError("This entry has already been invoiced and can't be edited.");
  }

  await assertTask(input.taskId, input.projectId);

  const targetUserId = manage && input.userId ? input.userId : existing.userId;

  return prisma.timeEntry.update({
    where: { id: timeEntryId },
    data: {
      projectId: input.projectId,
      userId: targetUserId,
      taskId: input.taskId || null,
      date: new Date(input.date),
      hours: input.hours,
      description: input.description || null,
      billable: input.billable,
      rateOverride: manage ? (input.rateOverride ?? null) : existing.rateOverride,
    },
  });
}

export async function deleteTimeEntry(ctx: TimeEntryContext, timeEntryId: string) {
  const existing = await prisma.timeEntry.findUnique({ where: { id: timeEntryId } });
  if (!existing || existing.orgId !== ctx.orgId) throw new TimeEntryError("Entry not found.");

  const manage = canManageTeam(ctx.role);
  if (existing.userId !== ctx.actorId && !manage) {
    throw new TimeEntryError("You can only delete your own time entries.");
  }
  if (existing.invoiceLineItemId) {
    throw new TimeEntryError("This entry has already been invoiced and can't be deleted.");
  }

  await prisma.timeEntry.delete({ where: { id: timeEntryId } });
}
