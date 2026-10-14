"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org-context";
import {
  startTimer,
  stopActiveTimer,
  discardActiveTimer,
  updateActiveTimer,
  TimerError,
} from "@/lib/services/timer";
import { prisma } from "@/lib/prisma";
import { formatSpan } from "@/lib/clock-time";
import type { TimerContext } from "@/lib/services/timer";
import { TimeEntryError } from "@/lib/services/time-entries";

async function buildContext(): Promise<TimerContext> {
  const { org, user, role } = await requireOrgContext();
  return {
    orgId: org.id,
    slackWebhookUrl: org.slackWebhookUrl,
    actorId: user.id,
    actorName: user.name ?? null,
    role,
  };
}

export type TimerActionState = { error?: string; warnings?: string[]; message?: string } | null;

/** What a stop did, for a toast: "Logged 1h 05m on Website", or that a
 * timer under a minute isn't logged. */
async function describeStop(
  running: { projectId: string; startedAt: Date } | null,
  logged: boolean
): Promise<string | null> {
  if (!running) return null;
  const minutes = Math.max(1, Math.round((Date.now() - running.startedAt.getTime()) / 60_000));
  if (!logged) return "Under a minute, so nothing was logged";
  const project = await prisma.project.findUnique({ where: { id: running.projectId }, select: { name: true } });
  return `Logged ${formatSpan(minutes)} on ${project?.name ?? "the project"}`;
}

/** stopActiveTimer logs anything from 36 seconds up. */
function longEnoughToLog(startedAt: Date) {
  return Date.now() - startedAt.getTime() >= 36_000;
}

async function runningTimer(userId: string) {
  return prisma.activeTimer.findUnique({ where: { userId }, select: { projectId: true, startedAt: true } });
}

export async function startTimerAction(
  projectId: string,
  taskId: string | null,
  description: string | null,
  billable: boolean,
  timeZone: string
): Promise<TimerActionState> {
  const ctx = await buildContext();
  const before = await runningTimer(ctx.actorId);
  try {
    await startTimer(ctx, { projectId, taskId, description, billable }, { timeZone });
  } catch (err) {
    if (err instanceof TimerError || err instanceof TimeEntryError) return { error: err.message };
    throw err;
  }
  revalidatePath("/", "layout");
  // Starting one timer stops the other: say what happened to it.
  const stopped = await describeStop(before, !!before && longEnoughToLog(before.startedAt));
  return stopped ? { message: `${stopped}. Timer started.` } : { message: "Timer started" };
}

/** Changes the running timer's project, task, description or billable. */
export async function updateTimerAction(
  projectId: string,
  taskId: string | null,
  description: string | null,
  billable: boolean
): Promise<TimerActionState> {
  const ctx = await buildContext();
  try {
    await updateActiveTimer(ctx, { projectId, taskId, description, billable });
  } catch (err) {
    if (err instanceof TimerError) return { error: err.message };
    throw err;
  }
  revalidatePath("/", "layout");
  return { message: "Timer updated" };
}

/** timeZone: the browser's IANA zone, so the entry's start and end are its local times. */
export async function stopTimerAction(timeZone: string): Promise<TimerActionState> {
  const ctx = await buildContext();
  const before = await runningTimer(ctx.actorId);
  let warnings: string[] = [];
  let logged = false;
  try {
    const result = await stopActiveTimer(ctx, { timeZone });
    logged = !!result;
    warnings = result?.warnings ?? [];
  } catch (err) {
    if (err instanceof TimeEntryError) return { error: err.message };
    throw err;
  }
  revalidatePath("/", "layout");
  revalidatePath("/time");
  const message = await describeStop(before, logged);
  return { warnings, ...(message ? { message } : {}) };
}

export async function discardTimerAction() {
  const ctx = await buildContext();
  await discardActiveTimer(ctx);
  revalidatePath("/", "layout");
}
