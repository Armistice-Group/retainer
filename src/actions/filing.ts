"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { catchUpFiling, FilingError, setUpFiling, turnOffFiling, updateFilingOptions } from "@/lib/services/filing";
import type { ActionState } from "@/actions/auth";

async function admin() {
  const ctx = await requireOrgContext();
  requireRole(ctx.role, ["OWNER", "ADMIN"]);
  return ctx;
}

export async function setUpFilingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user } = await admin();
  try {
    await setUpFiling(
      { orgId: org.id, actorId: user.id },
      {
        provider: String(formData.get("provider") ?? ""),
        rootName: String(formData.get("rootName") ?? ""),
        fileInvoices: formData.get("fileInvoices") === "on",
        fileDocuments: formData.get("fileDocuments") === "on",
      }
    );
  } catch (err) {
    if (err instanceof FilingError) return { error: err.message };
    throw err;
  }
  revalidatePath("/settings/integrations");
  return { saved: true };
}

export async function updateFilingOptionsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org } = await admin();
  await updateFilingOptions(org.id, {
    fileInvoices: formData.get("fileInvoices") === "on",
    fileDocuments: formData.get("fileDocuments") === "on",
  });
  revalidatePath("/settings/integrations");
  return { saved: true };
}

export async function turnOffFilingAction() {
  const { org } = await admin();
  await turnOffFiling(org.id);
  revalidatePath("/settings/integrations");
}

export async function fileEverythingNowAction(): Promise<{ filed: number }> {
  const { org } = await admin();
  const r = await catchUpFiling(org.id);
  revalidatePath("/settings/integrations");
  return { filed: r.filed };
}
