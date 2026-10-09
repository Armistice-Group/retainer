import "server-only";
import { prisma } from "@/lib/prisma";
import { notify, getOrgAdminUserIds } from "@/lib/notifications";
import { postToSlack } from "@/lib/slack";
import { checkBudgets } from "@/lib/services/budget-alerts";
import { assertWeekEditable, TimesheetError } from "@/lib/services/timesheets";
import { canViewProject } from "@/lib/project-access";
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

export function timeEntryWhere(params: {
  orgId: string;
  actorId: string;
  role: Role;
  teamView: boolean;
  weekStart: Date;
  weekEnd: Date;
  filterUserId?: string;
}) {
  const { orgId, actorId, role, teamView, weekStart, weekEnd, filterUserId } = params;
  const useTeamScope = canManageTeam(role) && teamView;
  return useTeamScope
    ? {
        orgId,
        date: { gte: weekStart, lt: weekEnd },
        ...(filterUserId ? { userId: filterUserId } : {}),
      }
    : { orgId, userId: actorId, date: { gte: weekStart, lt: weekEnd } };
}

/** assertWeekEditable, reported as a TimeEntryError. */
async function assertWeekOpen(
  ctx: TimeEntryContext,
  userId: string,
  date: Date
): Promise<Date | null> {
  try {
    return await assertWeekEditable(ctx, userId, date);
  } catch (err) {
    if (err instanceof TimesheetError) throw new TimeEntryError(err.message);
    throw err;
  }
}

async function assertTask(taskId: string | null | undefined, projectId: string) {
  if (!taskId) return;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.projectId !== projectId) throw new TimeEntryError("Task not found.");
}

export async function createTimeEntry(ctx: TimeEntryContext, input: TimeEntryInput) {
  const project = await prisma.project.findUnique({ where: { id: input.projectId } });
  if (!project || project.orgId !== ctx.orgId) throw new TimeEntryError("Project not found.");
  if (!(await canViewProject(project, ctx.actorId, ctx.role))) {
    throw new TimeEntryError("Project not found.");
  }

  await assertTask(input.taskId, input.projectId);

  const manage = canManageTeam(ctx.role);
  const targetUserId = manage && input.userId ? input.userId : ctx.actorId;

  const approvedAt = await assertWeekOpen(ctx, targetUserId, new Date(input.date));

  const entry = await prisma.timeEntry.create({
    data: {
      approvedAt,
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

  await checkBudgets(entry.projectId, [entry.taskId]);
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
  await assertWeekOpen(ctx, existing.userId, existing.date);
  const approvedAt = await assertWeekOpen(ctx, targetUserId, new Date(input.date));

  const updated = await prisma.timeEntry.update({
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
      approvedAt,
    },
  });
  // Moving an entry changes the old project/task's totals as well.
  await checkBudgets(updated.projectId, [updated.taskId, existing.taskId]);
  if (existing.projectId !== updated.projectId) await checkBudgets(existing.projectId);
  return updated;
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

  await assertWeekOpen(ctx, existing.userId, existing.date);
  await prisma.timeEntry.delete({ where: { id: timeEntryId } });
  await checkBudgets(existing.projectId, [existing.taskId]);
}
