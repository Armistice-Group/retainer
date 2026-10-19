"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { normalizeOrigin, setPublicUrl } from "@/lib/url";
import {
  INTEGRATION_FIELDS,
  describeIntegration,
  saveConfigs,
  type ConfigKey,
  type Integration,
} from "@/lib/instance-config";
import type { ActionState } from "@/actions/auth";
import { fromAddress, trySendEmail } from "@/lib/email";
import { TestEmail } from "@/emails/test-email";
import { getOrigin } from "@/lib/url";

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

/** Saves an integration's instance-wide credentials from Settings. Fields set
 * in the server environment are skipped (env always wins); a blank secret
 * keeps the stored one, a blank non-secret clears it. */
export async function saveIntegrationCredentialsAction(
  integration: Integration,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { role } = await requireOrgContext();
  requireRole(role, ["OWNER"]);
  if (!(integration in INTEGRATION_FIELDS)) return { error: "Unknown integration." };

  const updates: Partial<Record<ConfigKey, string | undefined>> = {};
  const fields = await describeIntegration(integration);
  for (const field of fields) {
    if (field.source === "env") continue;
    const value = ((formData.get(field.key) as string | null) ?? "").trim();
    if (field.options && value && !field.options.includes(value)) {
      return { fieldErrors: { [field.key]: ["Pick one of the options."] } };
    }
    updates[field.key as ConfigKey] = field.secret && !value ? undefined : value;
  }
  await saveConfigs(updates);

  // Integration cards, the Payments tab, and email-dependent bits of the
  // login page all read these.
  revalidatePath("/", "layout");
  return { saved: true };
}

export async function removeIntegrationCredentialsAction(integration: Integration) {
  const { role } = await requireOrgContext();
  requireRole(role, ["OWNER"]);
  if (!(integration in INTEGRATION_FIELDS)) return;
  await saveConfigs(
    Object.fromEntries(INTEGRATION_FIELDS[integration].map((f) => [f.key, ""])) as Partial<
      Record<ConfigKey, string>
    >
  );
  revalidatePath("/", "layout");
}

/** Emails the signed-in owner or admin, and says what Resend answered. */
export async function sendTestEmailAction(): Promise<ActionState> {
  const { role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);
  if (!user.email) return { error: "Your account has no email address." };
  const [from, origin] = await Promise.all([fromAddress(), getOrigin()]);
  const { error } = await trySendEmail({
    to: user.email,
    subject: "Test email from Consultainer",
    react: TestEmail({ fromAddress: from, origin }),
  });
  if (error) return { error: `Resend said: ${error}` };
  return { emailSent: true, saved: true };
}
