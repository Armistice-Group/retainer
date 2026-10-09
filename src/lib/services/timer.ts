import "server-only";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/lib/project-access";
import { createTimeEntry, type TimeEntryContext } from "@/lib/services/time-entries";

export class TimerError extends Error {}

export type TimerContext = TimeEntryContext;

// Rounds to the nearest 0.01h (36 seconds) — matches the Decimal(5,2)
// precision TimeEntry.hours is stored at, so what gets logged is exactly
// what a human reviewing the entry later would see and expect.
function hoursBetween(start: Date, end: Date) {
  const ms = Math.max(0, end.getTime() - start.getTime());
  return Math.round((ms / 3_600_000) * 100) / 100;
}

// Stops whatever timer is currently running for this user (if any) and logs
// it as a real TimeEntry. Called both from the explicit "stop" action and
// from "start" when a second timer is started — a person is only ever doing
// one thing at a time, so starting a new one finishes the old one instead of
// blocking or silently overwriting it.
export async function stopActiveTimer(ctx: TimerContext, today: string) {
  const existing = await prisma.activeTimer.findUnique({ where: { userId: ctx.actorId } });
  if (!existing || existing.orgId !== ctx.orgId) return null;

  const hours = hoursBetween(existing.startedAt, new Date());

  // Log first, so a refusal (say, the week's timesheet is locked) leaves the
  // timer running instead of losing the time.
  const entry =
    hours < 0.01
      ? null
      : await createTimeEntry(ctx, {
          projectId: existing.projectId,
          taskId: existing.taskId,
          date: today,
          hours,
          description: existing.description,
          billable: existing.billable,
        });
  await prisma.activeTimer.delete({ where: { id: existing.id } });
  return entry;
}

export async function discardActiveTimer(ctx: TimerContext) {
  await prisma.activeTimer.deleteMany({ where: { userId: ctx.actorId, orgId: ctx.orgId } });
}

export async function startTimer(
  ctx: TimerContext,
  input: {
    projectId: string;
    taskId?: string | null;
    description?: string | null;
    billable: boolean;
  },
  today: string
) {
  const project = await prisma.project.findUnique({ where: { id: input.projectId } });
  if (!project || project.orgId !== ctx.orgId) throw new TimerError("Project not found.");
  if (!(await canViewProject(project, ctx.actorId, ctx.role))) {
    throw new TimerError("Project not found.");
  }
  if (input.taskId) {
    const task = await prisma.task.findUnique({ where: { id: input.taskId } });
    if (!task || task.projectId !== input.projectId) throw new TimerError("Task not found.");
  }

  // A user's timer is app-wide (unique on userId alone, not per-org), so a
  // running timer from any org gets stopped and logged before the new one
  // starts — including one started under a different active org.
  const existing = await prisma.activeTimer.findUnique({ where: { userId: ctx.actorId } });
  if (existing) {
    await stopActiveTimer({ ...ctx, orgId: existing.orgId }, today);
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
