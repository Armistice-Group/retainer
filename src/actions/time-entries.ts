"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org-context";
import { timeEntrySchema } from "@/lib/validations/time-entry";
import {
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  TimeEntryError,
  type TimeEntryContext,
} from "@/lib/services/time-entries";
import type { ActionState } from "@/actions/auth";

async function buildContext(): Promise<TimeEntryContext> {
  const { org, user, role } = await requireOrgContext();
  return {
    orgId: org.id,
    slackWebhookUrl: org.slackWebhookUrl,
    actorId: user.id,
    actorName: user.name ?? null,
    role,
  };
}

function parseTimeEntryForm(formData: FormData) {
  return timeEntrySchema.safeParse({
    projectId: formData.get("projectId"),
    taskId: formData.get("taskId") || "",
    date: formData.get("date"),
    hours: formData.get("hours"),
    description: formData.get("description"),
    billable: formData.get("billable") === "on",
    userId: formData.get("userId") || "",
    rateOverride: formData.get("rateOverride") || "",
  });
}

export async function createTimeEntryAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parseTimeEntryForm(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const ctx = await buildContext();
  try {
    await createTimeEntry(ctx, {
      projectId: parsed.data.projectId,
      taskId: parsed.data.taskId || null,
      date: parsed.data.date,
      hours: parsed.data.hours,
      description: parsed.data.description || null,
      billable: parsed.data.billable,
      userId: parsed.data.userId || null,
      rateOverride: parsed.data.rateOverride === "" ? null : parsed.data.rateOverride,
    });
  } catch (err) {
    if (err instanceof TimeEntryError) return { error: err.message };
    throw err;
  }

  revalidatePath("/time");
  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath("/dashboard");
  return null;
}

export async function updateTimeEntryAction(
  timeEntryId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parseTimeEntryForm(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const ctx = await buildContext();
  try {
    await updateTimeEntry(ctx, timeEntryId, {
      projectId: parsed.data.projectId,
      taskId: parsed.data.taskId || null,
      date: parsed.data.date,
      hours: parsed.data.hours,
      description: parsed.data.description || null,
      billable: parsed.data.billable,
      userId: parsed.data.userId || null,
      rateOverride: parsed.data.rateOverride === "" ? null : parsed.data.rateOverride,
    });
  } catch (err) {
    if (err instanceof TimeEntryError) return { error: err.message };
    throw err;
  }

  revalidatePath("/time");
  revalidatePath("/dashboard");
  return null;
}

export async function deleteTimeEntryAction(timeEntryId: string) {
  const ctx = await buildContext();
  await deleteTimeEntry(ctx, timeEntryId);
  revalidatePath("/time");
  revalidatePath("/dashboard");
}
