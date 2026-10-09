"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org-context";
import {
  addCalendarFeed,
  CalendarError,
  forgetSeriesRules,
  ignoreMeeting,
  logMeeting,
  removeCalendarFeed,
  syncFeed,
} from "@/lib/services/calendar";
import { prisma } from "@/lib/prisma";
import type { ActionState } from "@/actions/auth";
import type { TimeEntryContext } from "@/lib/services/time-entries";

async function context(): Promise<TimeEntryContext> {
  const { org, user, role } = await requireOrgContext();
  return {
    orgId: org.id,
    slackWebhookUrl: org.slackWebhookUrl,
    actorId: user.id,
    actorName: user.name ?? null,
    role,
  };
}

function done() {
  revalidatePath("/profile");
  revalidatePath("/time");
}

export async function addCalendarFeedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await context();
  try {
    await addCalendarFeed(ctx, {
      name: String(formData.get("name") ?? ""),
      url: String(formData.get("url") ?? ""),
    });
  } catch (err) {
    if (err instanceof CalendarError) return { error: err.message };
    throw err;
  }
  done();
  return { saved: true };
}

export async function removeCalendarFeedAction(feedId: string) {
  await removeCalendarFeed(await context(), feedId);
  done();
}

export async function syncCalendarFeedAction(feedId: string): Promise<{ added?: number; error?: string }> {
  const ctx = await context();
  const feed = await prisma.calendarFeed.findUnique({ where: { id: feedId } });
  if (!feed || feed.userId !== ctx.actorId) return { error: "Calendar not found." };
  const result = await syncFeed(feedId);
  done();
  return result;
}

export async function logMeetingAction(
  eventId: string,
  input: { projectId: string; billable: boolean; date: string; remember: boolean }
): Promise<{ error?: string; alsoLogged?: number }> {
  try {
    const result = await logMeeting(await context(), eventId, input);
    done();
    return { alsoLogged: result.alsoLogged };
  } catch (err) {
    if (err instanceof CalendarError) return { error: err.message };
    throw err;
  }
}

export async function ignoreMeetingAction(eventId: string, remember: boolean): Promise<{ error?: string }> {
  try {
    await ignoreMeeting(await context(), eventId, remember);
    done();
    return {};
  } catch (err) {
    if (err instanceof CalendarError) return { error: err.message };
    throw err;
  }
}

export async function forgetSeriesRuleAction(ruleId?: string) {
  const ctx = await context();
  await forgetSeriesRules(ctx.actorId, ruleId);
  done();
}
