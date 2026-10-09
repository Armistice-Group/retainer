"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org-context";
import {
  recallTimesheet,
  reviewTimesheet,
  submitTimesheet,
  TimesheetError,
  type TimesheetContext,
} from "@/lib/services/timesheets";
import type { ActionState } from "@/actions/auth";

async function context(): Promise<TimesheetContext> {
  const { org, user, role } = await requireOrgContext();
  return { orgId: org.id, actorId: user.id, actorName: user.name ?? null, role };
}

function done() {
  revalidatePath("/time");
  revalidatePath("/invoices/new");
}

export async function submitTimesheetAction(week: string): Promise<ActionState> {
  try {
    await submitTimesheet(await context(), week);
  } catch (err) {
    if (err instanceof TimesheetError) return { error: err.message };
    throw err;
  }
  done();
  return null;
}

export async function recallTimesheetAction(week: string): Promise<ActionState> {
  try {
    await recallTimesheet(await context(), week);
  } catch (err) {
    if (err instanceof TimesheetError) return { error: err.message };
    throw err;
  }
  done();
  return null;
}

export async function reviewTimesheetAction(
  timesheetId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const approve = formData.get("decision") === "approve";
  try {
    await reviewTimesheet(await context(), timesheetId, {
      approve,
      note: (formData.get("note") as string | null) ?? null,
    });
  } catch (err) {
    if (err instanceof TimesheetError) return { error: err.message };
    throw err;
  }
  done();
  return { saved: true };
}
