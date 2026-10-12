import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrgAdminUserIds } from "@/lib/notifications";
import { sendAlert } from "@/lib/alerts";
import { checkBudgets } from "@/lib/services/budget-alerts";
import { assertWeekEditable, TimesheetError } from "@/lib/services/timesheets";
import { canViewProject } from "@/lib/project-access";
import {
  clockHours,
  clockSpanMinutes,
  formatClockRange,
  maxClockHours,
  MINUTES_PER_DAY,
} from "@/lib/clock-time";
import type { Role, TimeEntry } from "@/generated/prisma/client";

export class TimeEntryError extends Error {
  /** The input field the problem is with, when there is one. */
  field?: "hours" | "startTime" | "endTime";
  constructor(message: string, field?: TimeEntryError["field"]) {
    super(message);
    this.field = field;
  }
}

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
  /** May be left out when start and end are given: it's worked out from them. */
  hours?: number | null;
  /** Wall-clock start/end in minutes after midnight; both or neither. */
  startMinute?: number | null;
  endMinute?: number | null;
  description?: string | null;
  billable: boolean;
  userId?: string | null;
  rateOverride?: number | null;
};

/** A saved entry plus anything worth telling the person (it still saved). */
export type TimeEntryResult = { entry: TimeEntry; warnings: string[] };

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

/** The project, if it's in the org and the actor can see it. */
async function assertProject(ctx: TimeEntryContext, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== ctx.orgId) throw new TimeEntryError("Project not found.");
  if (!(await canViewProject(project, ctx.actorId, ctx.role))) {
    throw new TimeEntryError("Project not found.");
  }
  return project;
}

/**
 * The hours and clock times to store: checks start/end come as a pair, works
 * out hours from them when none were given (rounded per the org), refuses
 * hours longer than the span, and enforces the client's "require start and
 * end times".
 */
async function resolveClock(
  ctx: TimeEntryContext,
  project: { clientId: string },
  input: TimeEntryInput
) {
  const start = input.startMinute ?? null;
  const end = input.endMinute ?? null;
  for (const [value, field] of [[start, "startTime"], [end, "endTime"]] as const) {
    if (value != null && (!Number.isInteger(value) || value < 0 || value >= MINUTES_PER_DAY)) {
      throw new TimeEntryError("Use a time of day, e.g. 09:30.", field);
    }
  }
  if ((start == null) !== (end == null)) {
    throw new TimeEntryError(
      "Give both a start and an end time, or neither.",
      start == null ? "startTime" : "endTime"
    );
  }

  if (start == null || end == null) {
    const client = await prisma.client.findUnique({
      where: { id: project.clientId },
      select: { requireClockTimes: true },
    });
    if (client?.requireClockTimes) {
      throw new TimeEntryError("This client needs a start and end time on every entry.", "startTime");
    }
    if (input.hours == null) throw new TimeEntryError("Enter the hours worked.", "hours");
    return { hours: input.hours, startMinute: null, endMinute: null };
  }

  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { clockRoundingMinutes: true },
  });
  const rounding = org?.clockRoundingMinutes ?? 15;
  if (input.hours == null) {
    const hours = clockHours(clockSpanMinutes(start, end), rounding);
    return { hours, startMinute: start, endMinute: end };
  }
  const max = maxClockHours(start, end, rounding);
  if (input.hours > max + 1e-9) {
    throw new TimeEntryError(
      `Hours can't be more than the time between start and end (${max}h).`,
      "hours"
    );
  }
  return { hours: input.hours, startMinute: start, endMinute: end };
}

const DAY_MS = 86_400_000;

/**
 * "Overlaps 09:00–10:30 on Acme · Website" for each of the person's other
 * timed entries that shares time with this one — the same day, or the day
 * either side when one of them runs past midnight.
 */
export async function clockOverlapWarnings(entry: TimeEntry): Promise<string[]> {
  if (entry.startMinute == null || entry.endMinute == null) return [];
  const others = await prisma.timeEntry.findMany({
    where: {
      orgId: entry.orgId,
      userId: entry.userId,
      id: { not: entry.id },
      startMinute: { not: null },
      date: {
        gte: new Date(entry.date.getTime() - DAY_MS),
        lte: new Date(entry.date.getTime() + DAY_MS),
      },
    },
    select: {
      date: true,
      startMinute: true,
      endMinute: true,
      project: { select: { name: true, client: { select: { name: true } } } },
    },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
  });

  // Minutes from midnight at the start of this entry's date.
  const span = (date: Date, start: number, end: number) => {
    const offset = Math.round((date.getTime() - entry.date.getTime()) / DAY_MS) * MINUTES_PER_DAY;
    return [offset + start, offset + start + clockSpanMinutes(start, end)] as const;
  };
  const [from, to] = span(entry.date, entry.startMinute, entry.endMinute);
  const warnings: string[] = [];
  for (const other of others) {
    if (other.startMinute == null || other.endMinute == null) continue;
    const [otherFrom, otherTo] = span(other.date, other.startMinute, other.endMinute);
    if (otherFrom < to && from < otherTo) {
      const sameDay = other.date.getTime() === entry.date.getTime();
      warnings.push(
        `Overlaps ${formatClockRange(other.startMinute, other.endMinute)}` +
          (sameDay ? "" : ` (${other.date.toISOString().slice(0, 10)})`) +
          ` on ${other.project.client.name} · ${other.project.name}`
      );
    }
  }
  return warnings;
}

/** Owners and admins can log time for someone else, but only a member of the org. */
async function assertMember(orgId: string, userId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!membership) throw new TimeEntryError("That person isn't a member of this organization.");
}

export async function createTimeEntry(
  ctx: TimeEntryContext,
  input: TimeEntryInput
): Promise<TimeEntryResult> {
  const project = await assertProject(ctx, input.projectId);

  await assertTask(input.taskId, input.projectId);
  const clock = await resolveClock(ctx, project, input);

  const manage = canManageTeam(ctx.role);
  const targetUserId = manage && input.userId ? input.userId : ctx.actorId;
  if (targetUserId !== ctx.actorId) await assertMember(ctx.orgId, targetUserId);

  const approvedAt = await assertWeekOpen(ctx, targetUserId, new Date(input.date));

  const entry = await prisma.timeEntry.create({
    data: {
      approvedAt,
      orgId: ctx.orgId,
      projectId: input.projectId,
      userId: targetUserId,
      taskId: input.taskId || null,
      date: new Date(input.date),
      ...clock,
      description: input.description || null,
      billable: input.billable,
      rateOverride: manage && input.rateOverride != null ? input.rateOverride : null,
    },
  });

  // Only when someone else would hear about it (not a solo owner's own time).
  const adminIds = await getOrgAdminUserIds(prisma, ctx.orgId, ctx.actorId);
  if (adminIds.length > 0) {
    await sendAlert({
      orgId: ctx.orgId,
      event: "TIME_LOGGED",
      message: `${ctx.actorName ?? "Someone"} logged ${clock.hours}h on ${project.name}.`,
      link: `/projects/${project.id}`,
      excludeUserId: ctx.actorId,
    });
  }

  await checkBudgets(entry.projectId, [entry.taskId]);
  return { entry, warnings: await clockOverlapWarnings(entry) };
}

export async function updateTimeEntry(
  ctx: TimeEntryContext,
  timeEntryId: string,
  input: TimeEntryInput
): Promise<TimeEntryResult> {
  const existing = await prisma.timeEntry.findUnique({ where: { id: timeEntryId } });
  if (!existing || existing.orgId !== ctx.orgId) throw new TimeEntryError("Entry not found.");

  const manage = canManageTeam(ctx.role);
  if (existing.userId !== ctx.actorId && !manage) {
    throw new TimeEntryError("You can only edit your own time entries.");
  }
  if (existing.invoiceLineItemId) {
    throw new TimeEntryError("This entry has already been invoiced and can't be edited.");
  }

  const project =
    input.projectId !== existing.projectId
      ? await assertProject(ctx, input.projectId)
      : await prisma.project.findUniqueOrThrow({
          where: { id: existing.projectId },
          select: { clientId: true },
        });
  await assertTask(input.taskId, input.projectId);
  const clock = await resolveClock(ctx, project, input);

  const targetUserId = manage && input.userId ? input.userId : existing.userId;
  if (targetUserId !== existing.userId) await assertMember(ctx.orgId, targetUserId);
  await assertWeekOpen(ctx, existing.userId, existing.date);
  const approvedAt = await assertWeekOpen(ctx, targetUserId, new Date(input.date));

  const updated = await prisma.timeEntry.update({
    where: { id: timeEntryId },
    data: {
      projectId: input.projectId,
      userId: targetUserId,
      taskId: input.taskId || null,
      date: new Date(input.date),
      ...clock,
      description: input.description || null,
      billable: input.billable,
      rateOverride: manage ? (input.rateOverride ?? null) : existing.rateOverride,
      approvedAt,
    },
  });
  // Moving an entry changes the old project/task's totals as well.
  await checkBudgets(updated.projectId, [updated.taskId, existing.taskId]);
  if (existing.projectId !== updated.projectId) await checkBudgets(existing.projectId);
  return { entry: updated, warnings: await clockOverlapWarnings(updated) };
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
