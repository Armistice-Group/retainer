"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org-context";
import { startTimer, stopActiveTimer, discardActiveTimer, TimerError } from "@/lib/services/timer";
import type { TimerContext } from "@/lib/services/timer";

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

export type TimerActionState = { error?: string } | null;

export async function startTimerAction(
  projectId: string,
  taskId: string | null,
  description: string | null,
  billable: boolean,
  today: string
): Promise<TimerActionState> {
  const ctx = await buildContext();
  try {
    await startTimer(ctx, { projectId, taskId, description, billable }, today);
  } catch (err) {
    if (err instanceof TimerError) return { error: err.message };
    throw err;
  }
  revalidatePath("/", "layout");
  return null;
}

export async function stopTimerAction(today: string) {
  const ctx = await buildContext();
  await stopActiveTimer(ctx, today);
  revalidatePath("/", "layout");
  revalidatePath("/time");
}

export async function discardTimerAction() {
  const ctx = await buildContext();
  await discardActiveTimer(ctx);
  revalidatePath("/", "layout");
}
