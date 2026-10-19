import "server-only";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { getConfig } from "@/lib/instance-config";
import type { ReactElement } from "react";

let client: Resend | null = null;

/** Email is optional on a self-hosted instance. Without it, flows that would
 * send a link (invites, contractor reviews) surface the link in the UI to
 * share manually, and email-only features (magic-link login) are hidden. */
export async function isEmailConfigured() {
  return !!(await getConfig("RESEND_API_KEY"));
}

// API key from .env or Settings → Integrations (see lib/instance-config);
// the client is rebuilt if the key changes.
let clientKey: string | null = null;
async function getClient() {
  const key = await getConfig("RESEND_API_KEY");
  if (!key) return null;
  if (!client || clientKey !== key) {
    client = new Resend(key);
    clientKey = key;
  }
  return client;
}

const DEFAULT_FROM = "Consultainer <onboarding@resend.dev>";

/** The address mail is sent as. */
export async function fromAddress() {
  return (await getConfig("RESEND_FROM_EMAIL")) || DEFAULT_FROM;
}

type EmailInput = { to: string; subject: string; react: ReactElement; replyTo?: string };

/** Sends one email and says why when it didn't go (for the test button). */
export async function trySendEmail({ to, subject, react, replyTo }: EmailInput): Promise<{ error?: string }> {
  const resend = await getClient();
  if (!resend) return { error: "Email isn't set up." };

  const from = await fromAddress();
  const html = await render(react);

  try {
    const { error } = await resend.emails.send({ from, to, subject, html, replyTo });
    if (error) {
      console.warn("Resend returned an error", error);
      return { error: error.message || error.name || "Resend refused the email." };
    }
    return {};
  } catch (err) {
    console.warn("Failed to send email via Resend", err);
    return { error: err instanceof Error ? err.message : "Couldn't reach Resend." };
  }
}

export async function sendEmail(input: EmailInput) {
  return !(await trySendEmail(input)).error;
}
