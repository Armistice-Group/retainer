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
import { emailStatus, fromAddress, isEmailConfigured, trySendEmail } from "@/lib/email";
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
  if (error) {
    const { provider } = await emailStatus();
    return { error: `${provider === "smtp" ? "The SMTP server" : "Resend"} said: ${error}` };
  }
  return { emailSent: true, saved: true };
}

// "billing@example.com" or "Acme Consulting <billing@example.com>".
const FROM_RE = /^(?:[^<>]*<\s*[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+\s*>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;

/** Saves how email is sent: Resend or an SMTP server, and the from address.
 * Fields set in .env are left alone; a blank key or password keeps the
 * saved one. */
export async function saveEmailSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { role } = await requireOrgContext();
  requireRole(role, ["OWNER"]);
  const fields = Object.fromEntries((await describeIntegration("email")).map((f) => [f.key, f]));
  const get = (key: string) => ((formData.get(key) as string | null) ?? "").trim();
  const stored = (key: string) => fields[key]?.source != null;

  const provider = get("EMAIL_PROVIDER") === "smtp" ? "smtp" : "resend";
  const from = get("EMAIL_FROM");
  const fieldErrors: Record<string, string[]> = {};
  if (from && !FROM_RE.test(from)) {
    fieldErrors.EMAIL_FROM = ["Use an address, like billing@example.com or Acme <billing@example.com>."];
  }
  if (provider === "smtp") {
    if (!get("SMTP_HOST") && fields.SMTP_HOST?.source !== "env") fieldErrors.SMTP_HOST = ["Enter the server, like smtp.postmarkapp.com."];
    const port = get("SMTP_PORT");
    if (port && !(/^\d+$/.test(port) && Number(port) >= 1 && Number(port) <= 65535)) {
      fieldErrors.SMTP_PORT = ["Enter a port number, usually 587 or 465."];
    }
    if (!from && !get("SMTP_USER").includes("@") && fields.EMAIL_FROM?.source !== "env") {
      fieldErrors.EMAIL_FROM = ["Enter the address to send as."];
    }
  } else if (!get("RESEND_API_KEY") && !stored("RESEND_API_KEY")) {
    fieldErrors.RESEND_API_KEY = ["Paste your Resend API key (starts with re_)."];
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const updates: Partial<Record<ConfigKey, string | undefined>> = {
    EMAIL_PROVIDER: provider,
    EMAIL_FROM: from,
    // Moved to EMAIL_FROM.
    RESEND_FROM_EMAIL: "",
  };
  if (provider === "smtp") {
    updates.SMTP_HOST = get("SMTP_HOST");
    updates.SMTP_PORT = get("SMTP_PORT");
    updates.SMTP_USER = get("SMTP_USER");
    updates.SMTP_PASSWORD = get("SMTP_PASSWORD") || undefined;
  } else {
    updates.RESEND_API_KEY = get("RESEND_API_KEY") || undefined;
  }
  for (const key of Object.keys(updates) as ConfigKey[]) {
    if (fields[key]?.source === "env") delete updates[key];
  }
  await saveConfigs(updates);
  revalidatePath("/", "layout");
  return (await isEmailConfigured()) ? { saved: true } : { error: "Saved, but email still isn't complete." };
}
