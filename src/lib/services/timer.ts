import "server-only";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/lib/project-access";
import { createTimeEntry, type TimeEntryContext } from "@/lib/services/time-entries";
import { MINUTES_PER_DAY, wallClockIn } from "@/lib/clock-time";

export class TimerError extends Error {}

export type TimerContext = TimeEntryContext;

export type StopTimerOptions = {
  /** ISO date to log the entry under; defaults to the day it started. */
  date?: string | null;
  /** IANA zone the start/end times are recorded in (the person's browser); UTC if unknown. */
  timeZone?: string | null;
};

// Stops whatever timer is currently running for this user (if any) and logs
// it as a real TimeEntry. Called both from the explicit "stop" action and
// from "start" when a second timer is started — a person is only ever doing
// one thing at a time, so starting a new one finishes the old one instead of
// blocking or silently overwriting it.
//
// The entry records when it was worked: the start as a wall-clock time in
// the given zone, and the end as the start plus the elapsed minutes. Hours
// are those minutes exactly (to the cent, never rounded to the org's
// increment), so they always match the times shown next to them. A timer
// left running past 24 hours can't be expressed as times of day, so that
// one is logged with hours only.
export async function stopActiveTimer(ctx: TimerContext, options: StopTimerOptions = {}) {
  const existing = await prisma.activeTimer.findUnique({ where: { userId: ctx.actorId } });
  if (!existing || existing.orgId !== ctx.orgId) return null;

  const elapsedMinutes = Math.max(0, Date.now() - existing.startedAt.getTime()) / 60_000;
  const start = wallClockIn(existing.startedAt, options.timeZone);
  const minutes = Math.max(1, Math.round(elapsedMinutes));
  const timed = minutes <= MINUTES_PER_DAY;

  // Log first, so a refusal (say, the week's timesheet is locked) leaves the
  // timer running instead of losing the time. Under 36 seconds isn't logged.
  const result =
    elapsedMinutes < 0.6
      ? null
      : await createTimeEntry(ctx, {
          projectId: existing.projectId,
          taskId: existing.taskId,
          date: options.date || start.date,
          hours: Math.round(((timed ? minutes : elapsedMinutes) / 60) * 100) / 100,
          startMinute: timed ? start.minute : null,
          endMinute: timed ? (start.minute + minutes) % MINUTES_PER_DAY : null,
          description: existing.description,
          billable: existing.billable,
        });
  await prisma.activeTimer.delete({ where: { id: existing.id } });
  return result;
}

export async function discardActiveTimer(ctx: TimerContext) {
  await prisma.activeTimer.deleteMany({ where: { userId: ctx.actorId, orgId: ctx.orgId } });
}

/** Checks a project (and task) the actor may time. */
async function assertTimerTarget(ctx: TimerContext, projectId: string, taskId?: string | null) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== ctx.orgId) throw new TimerError("Project not found.");
  if (!(await canViewProject(project, ctx.actorId, ctx.role))) {
    throw new TimerError("Project not found.");
  }
  if (taskId) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.projectId !== projectId) throw new TimerError("Task not found.");
  }
  return project;
}

/** Changes what the running timer is for, keeping when it started. */
export async function updateActiveTimer(
  ctx: TimerContext,
  input: { projectId: string; taskId?: string | null; description?: string | null; billable: boolean }
) {
  const existing = await prisma.activeTimer.findUnique({ where: { userId: ctx.actorId } });
  if (!existing || existing.orgId !== ctx.orgId) throw new TimerError("No timer is running.");
  await assertTimerTarget(ctx, input.projectId, input.taskId);
  return prisma.activeTimer.update({
    where: { id: existing.id },
    data: {
      projectId: input.projectId,
      taskId: input.taskId || null,
      description: input.description || null,
      billable: input.billable,
    },
  });
}

export async function startTimer(
  ctx: TimerContext,
  input: {
    projectId: string;
    taskId?: string | null;
    description?: string | null;
    billable: boolean;
  },
  stopOptions: StopTimerOptions = {}
) {
  await assertTimerTarget(ctx, input.projectId, input.taskId);

  // A user's timer is app-wide (unique on userId alone, not per-org), so a
  // running timer from any org gets stopped and logged before the new one
  // starts — including one started under a different active org.
  const existing = await prisma.activeTimer.findUnique({ where: { userId: ctx.actorId } });
  if (existing) {
    await stopActiveTimer({ ...ctx, orgId: existing.orgId }, stopOptions);
  }

  return prisma.activeTimer.create({
    data: {
      orgId: ctx.orgId,
      userId: ctx.actorId,
      projectId: input.projectId,
      taskId: input.taskId || null,
      description: input.description || null,
      billable: input.billable,
    },
  });
}
