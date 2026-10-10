"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org-context";
import {
  createVaultLink,
  deleteVaultLink,
  updateVaultLink,
  VaultLinkError,
  type VaultLinkContext,
  type VaultLinkInput,
} from "@/lib/services/vault-links";
import type { ActionState } from "@/actions/auth";

async function context(): Promise<VaultLinkContext> {
  const { org, user, role } = await requireOrgContext();
  return { orgId: org.id, actorId: user.id, role };
}

function revalidate(clientId: string, ...projectIds: (string | null | undefined)[]) {
  revalidatePath(`/clients/${clientId}`);
  for (const id of new Set(projectIds)) if (id) revalidatePath(`/projects/${id}`);
}

/** A form field. Server actions take whatever the caller serialised, so a
 * plain object is read the same way (and anything else counts as empty). */
function field(form: FormData | Record<string, unknown>, name: string): string | null | undefined {
  if (form instanceof FormData) return form.has(name) ? String(form.get(name) ?? "") : undefined;
  if (form && typeof form === "object" && name in form) {
    const v = form[name];
    return v == null ? null : String(v);
  }
  return undefined;
}

function input(formData: FormData | Record<string, unknown>): VaultLinkInput {
  const projectId = field(formData, "projectId");
  return {
    // " " is the picker's "Whole client" option.
    projectId: projectId === undefined ? undefined : projectId?.trim() || null,
    label: (field(formData, "label") ?? "").slice(0, 500),
    note: (field(formData, "note") ?? "").slice(0, 5000),
    url: (field(formData, "url") ?? "").slice(0, 5000),
    itemKind: field(formData, "itemKind")?.trim() || null,
  };
}

export async function addVaultLinkAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData | Record<string, unknown>
): Promise<ActionState> {
  try {
    const link = await createVaultLink(await context(), clientId, input(formData));
    revalidate(clientId, link.projectId);
  } catch (err) {
    if (err instanceof VaultLinkError) return { error: err.message };
    throw err;
  }
  return { saved: true };
}

export async function updateVaultLinkAction(
  id: string,
  _prev: ActionState,
  formData: FormData | Record<string, unknown>
): Promise<ActionState> {
  try {
    const { before, after } = await updateVaultLink(await context(), id, input(formData));
    revalidate(after.clientId, before.projectId, after.projectId);
  } catch (err) {
    if (err instanceof VaultLinkError) return { error: err.message };
    throw err;
  }
  return { saved: true };
}

export async function deleteVaultLinkAction(id: string) {
  try {
    const link = await deleteVaultLink(await context(), id);
    revalidate(link.clientId, link.projectId);
  } catch (err) {
    if (err instanceof VaultLinkError) return;
    throw err;
  }
}
