"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org-context";
import {
  createEstimate,
  createProjectFromEstimate,
  deleteEstimate,
  duplicateEstimate,
  emailEstimate,
  EstimateError,
  markEstimateResponse,
  markEstimateSent,
  updateEstimate,
  type EstimateContext,
} from "@/lib/services/estimates";
import { estimateInputSchema } from "@/lib/validations/estimate";
import type { ActionState } from "@/actions/auth";

async function context(): Promise<EstimateContext> {
  const { org, user, role } = await requireOrgContext();
  return { orgId: org.id, actorId: user.id, role };
}

function errorMessage(err: unknown): string {
  if (err instanceof EstimateError) return err.message;
  throw err;
}

/** Create (estimateId null) or update a draft estimate. The form posts its
 * fields as one JSON `payload` (line items are a dynamic list). */
export async function saveEstimateAction(
  estimateId: string | null,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await context();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Couldn't read the form. Reload and try again." };
  }
  const parsed = estimateInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path[0] === "lineItems" && typeof issue.path[1] === "number" ? `Line ${issue.path[1] + 1}: ` : "";
    return { error: `${where}${issue?.message ?? "Check the form."}` };
  }
  let id: string;
  try {
    const estimate = estimateId
      ? await updateEstimate(ctx, estimateId, parsed.data)
      : await createEstimate(ctx, parsed.data);
    id = estimate.id;
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/estimates");
  redirect(`/estimates/${id}`);
}

export async function emailEstimateAction(
  estimateId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await context();
  const to = [
    ...formData.getAll("to").map(String),
    ...String(formData.get("extra") ?? "")
      .split(/[,;\s]+/)
      .filter(Boolean),
  ];
  try {
    await emailEstimate(ctx, estimateId, { to, message: String(formData.get("message") ?? "") });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath("/estimates");
  return { saved: true };
}

/** Marks a draft sent and returns the client link to copy. */
export async function estimateClientLinkAction(estimateId: string): Promise<{ url?: string; error?: string }> {
  const ctx = await context();
  try {
    const { url } = await markEstimateSent(ctx, estimateId);
    revalidatePath(`/estimates/${estimateId}`);
    revalidatePath("/estimates");
    return { url };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function duplicateEstimateAction(estimateId: string) {
  const ctx = await context();
  let id: string;
  try {
    id = (await duplicateEstimate(ctx, estimateId)).id;
  } catch (err) {
    throw new Error(errorMessage(err));
  }
  revalidatePath("/estimates");
  redirect(`/estimates/${id}/edit`);
}

export async function deleteEstimateAction(estimateId: string) {
  const ctx = await context();
  try {
    await deleteEstimate(ctx, estimateId);
  } catch (err) {
    throw new Error(errorMessage(err));
  }
  revalidatePath("/estimates");
  redirect("/estimates");
}

export async function markEstimateResponseAction(
  estimateId: string,
  decision: "ACCEPTED" | "DECLINED",
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await context();
  try {
    await markEstimateResponse(ctx, estimateId, decision, {
      name: String(formData.get("name") ?? ""),
      note: String(formData.get("note") ?? ""),
    });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath("/estimates");
  return { saved: true };
}

export async function createProjectFromEstimateAction(estimateId: string) {
  const ctx = await context();
  let projectId: string;
  try {
    projectId = (await createProjectFromEstimate(ctx, estimateId)).id;
  } catch (err) {
    throw new Error(errorMessage(err));
  }
  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}
