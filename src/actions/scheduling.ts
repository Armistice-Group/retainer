"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org-context";
import {
  connectCalcom,
  connectCalendly,
  discardDraft,
  disconnectScheduling,
  mergeDraft,
  promoteDraft,
  refreshEventTypes,
  restoreDraft,
  rotateCalcomSecret,
  SchedulingError,
  setClientBookingUrl,
  setCompanyQuestion,
  setOrgBookingUrl,
  syncSchedulingNow,
  updateEventTypeMapping,
  type SchedulingActor,
} from "@/lib/services/scheduling";
import type { ActionState } from "@/actions/auth";

async function actor(): Promise<SchedulingActor> {
  const { org, user, role } = await requireOrgContext();
  return { orgId: org.id, actorId: user.id, role };
}

async function attempt(fn: () => Promise<unknown>, paths: string[] = []): Promise<ActionState> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof SchedulingError) return { error: err.message };
    throw err;
  }
  revalidatePath("/settings/scheduling");
  for (const p of paths) revalidatePath(p);
  return { saved: true };
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

// ── Settings ───────────────────────────────────────────────────────────────

export async function connectCalcomAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  return attempt(() =>
    connectCalcom(a, {
      baseUrl: field(formData, "baseUrl"),
      apiKey: field(formData, "apiKey"),
      createWebhook: formData.get("createWebhook") === "on",
    })
  );
}

export async function connectCalendlyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  return attempt(() => connectCalendly(a, { token: field(formData, "token") }));
}

export async function disconnectSchedulingAction(provider: string) {
  await disconnectScheduling(await actor(), provider);
  revalidatePath("/settings/scheduling");
}

export async function syncSchedulingNowAction(provider: string): Promise<ActionState> {
  const a = await actor();
  return attempt(() => syncSchedulingNow(a, provider), ["/clients"]);
}

export async function refreshEventTypesAction(provider: string): Promise<ActionState> {
  const a = await actor();
  return attempt(() => refreshEventTypes(a, provider));
}

export async function rotateCalcomSecretAction(): Promise<ActionState> {
  const a = await actor();
  return attempt(() => rotateCalcomSecret(a));
}

export async function updateEventTypeAction(
  eventTypeId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const a = await actor();
  return attempt(() =>
    updateEventTypeMapping(a, eventTypeId, {
      purpose: field(formData, "purpose"),
      projectId: field(formData, "projectId") || null,
      billable: formData.get("billable") === "on",
    })
  );
}

export async function setCompanyQuestionAction(
  provider: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const a = await actor();
  return attempt(() => setCompanyQuestion(a, provider, field(formData, "companyQuestion")));
}

export async function setOrgBookingUrlAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  return attempt(() => setOrgBookingUrl(a, field(formData, "bookingUrl")));
}

export async function setClientBookingUrlAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const a = await actor();
  return attempt(() => setClientBookingUrl(a, clientId, field(formData, "bookingUrl")), [`/clients/${clientId}`]);
}

// ── Draft clients ──────────────────────────────────────────────────────────

function revalidateClient(clientId: string) {
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
}

export async function promoteDraftAction(clientId: string): Promise<ActionState> {
  const a = await actor();
  const r = await attempt(() => promoteDraft(a, clientId));
  revalidateClient(clientId);
  return r;
}

export async function discardDraftAction(clientId: string): Promise<ActionState> {
  const a = await actor();
  const r = await attempt(() => discardDraft(a, clientId));
  revalidateClient(clientId);
  return r;
}

export async function restoreDraftAction(clientId: string): Promise<ActionState> {
  const a = await actor();
  const r = await attempt(() => restoreDraft(a, clientId));
  revalidateClient(clientId);
  return r;
}

export async function mergeDraftAction(clientId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  // Checked before the form is read (mergeDraft checks again).
  if (a.role !== "OWNER" && a.role !== "ADMIN") return { error: "Only owners and admins can do that." };
  const targetId = typeof formData?.get === "function" ? field(formData, "targetId") : "";
  if (!targetId) return { error: "Pick the client to merge into." };
  let target;
  try {
    target = await mergeDraft(a, clientId, targetId);
  } catch (err) {
    if (err instanceof SchedulingError) return { error: err.message };
    throw err;
  }
  revalidatePath("/clients");
  revalidatePath(`/clients/${target.id}`);
  redirect(`/clients/${target.id}`);
}
