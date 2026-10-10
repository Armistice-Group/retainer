"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org-context";
import {
  AgreementError,
  connectDocumenso,
  connectIronclad,
  disconnectAgreementProvider,
  linkAgreement,
  setAgreementDismissed,
  syncOrgAgreements,
  unlinkAgreement,
  type AgreementActor,
} from "@/lib/services/agreements";
import type { ActionState } from "@/actions/auth";

async function actor(): Promise<AgreementActor> {
  const { org, user, role } = await requireOrgContext();
  return { orgId: org.id, actorId: user.id, role };
}

function revalidate(clientId?: string | null, projectId?: string | null) {
  revalidatePath("/settings/agreements");
  if (clientId) revalidatePath(`/clients/${clientId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

async function attempt(fn: () => Promise<unknown>): Promise<ActionState> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof AgreementError) return { error: err.message };
    throw err;
  }
  return { saved: true };
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

export async function connectDocumensoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const result = await attempt(() =>
    connectDocumenso(a, { baseUrl: field(formData, "baseUrl"), apiKey: field(formData, "apiKey") })
  );
  revalidate();
  return result;
}

export async function connectIroncladAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const result = await attempt(() =>
    connectIronclad(a, {
      region: field(formData, "region"),
      clientId: field(formData, "clientId"),
      clientSecret: field(formData, "clientSecret"),
      actAsEmail: field(formData, "actAsEmail"),
    })
  );
  revalidate();
  return result;
}

export async function disconnectAgreementProviderAction(provider: string) {
  await disconnectAgreementProvider(await actor(), provider);
  revalidate();
}

export async function syncAgreementsNowAction() {
  await syncOrgAgreements(await actor());
  revalidate();
}

export async function linkAgreementAction(
  agreementId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const a = await actor();
  const clientId = field(formData, "clientId").trim();
  if (!clientId) return { error: "Pick a client." };
  // " " is the picker's "Whole client" option.
  const projectId = field(formData, "projectId").trim() || null;
  try {
    const { before, after } = await linkAgreement(a, agreementId, { clientId, projectId });
    revalidate(after.clientId, after.projectId);
    // A re-link moves it off the previous client/project page too.
    if (before.clientId) revalidatePath(`/clients/${before.clientId}`);
    if (before.projectId) revalidatePath(`/projects/${before.projectId}`);
  } catch (err) {
    if (err instanceof AgreementError) return { error: err.message };
    throw err;
  }
  return { saved: true };
}

export async function unlinkAgreementAction(agreementId: string) {
  const before = await unlinkAgreement(await actor(), agreementId);
  revalidate(before.clientId, before.projectId);
}

export async function dismissAgreementAction(agreementId: string) {
  await setAgreementDismissed(await actor(), agreementId, true);
  revalidate();
}

export async function restoreAgreementAction(agreementId: string) {
  await setAgreementDismissed(await actor(), agreementId, false);
  revalidate();
}
