"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { normalizeOrigin, setPublicUrl } from "@/lib/url";
import type { ActionState } from "@/actions/auth";

export async function savePublicUrlAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { role } = await requireOrgContext();
  requireRole(role, ["OWNER"]);

  const origin = normalizeOrigin((formData.get("publicUrl") as string) || "");
  if (!origin) {
    return { fieldErrors: { publicUrl: ["Enter a full URL, like https://time.example.com"] } };
  }

  await setPublicUrl(origin);
  revalidatePath("/settings");
  return { saved: true };
}
