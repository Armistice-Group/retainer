"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org-context";
import { clockFields, timeEntrySchema } from "@/lib/validations/time-entry";
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

/** A refusal tied to one field shows under that field. */
function entryError(err: TimeEntryError): ActionState {
  return err.field ? { fieldErrors: { [err.field]: [err.message] } } : { error: err.message };
}

function parseTimeEntryForm(formData: FormData) {
  return timeEntrySchema.safeParse({
    projectId: formData.get("projectId"),
    taskId: formData.get("taskId") || "",
    date: formData.get("date"),
    hours: formData.get("hours"),
    startTime: formData.get("startTime") || "",
    endTime: formData.get("endTime") || "",
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
  let warnings: string[];
  try {
    ({ warnings } = await createTimeEntry(ctx, {
      projectId: parsed.data.projectId,
      taskId: parsed.data.taskId || null,
      date: parsed.data.date,
      ...clockFields(parsed.data),
      description: parsed.data.description || null,
      billable: parsed.data.billable,
      userId: parsed.data.userId || null,
      rateOverride: parsed.data.rateOverride === "" ? null : parsed.data.rateOverride,
    }));
  } catch (err) {
    if (err instanceof TimeEntryError) return entryError(err);
    throw err;
  }

  revalidatePath("/time");
  revalidatePath("/tasks");
  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath("/dashboard");
  return warnings.length ? { warnings } : null;
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
  let warnings: string[];
  try {
    ({ warnings } = await updateTimeEntry(ctx, timeEntryId, {
      projectId: parsed.data.projectId,
      taskId: parsed.data.taskId || null,
      date: parsed.data.date,
      ...clockFields(parsed.data),
      description: parsed.data.description || null,
      billable: parsed.data.billable,
      userId: parsed.data.userId || null,
      rateOverride: parsed.data.rateOverride === "" ? null : parsed.data.rateOverride,
    }));
  } catch (err) {
    if (err instanceof TimeEntryError) return entryError(err);
    throw err;
  }

  revalidatePath("/time");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return warnings.length ? { warnings } : null;
}

export async function deleteTimeEntryAction(timeEntryId: string) {
  const ctx = await buildContext();
  await deleteTimeEntry(ctx, timeEntryId);
  revalidatePath("/time");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}
