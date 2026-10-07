import "server-only";
import { Resend } from "resend";
import { render } from "@react-email/render";
import type { ReactElement } from "react";

let client: Resend | null = null;

/** Email is optional on a self-hosted instance. Without it, flows that would
 * send a link (invites, contractor reviews) surface the link in the UI to
 * share manually, and email-only features (magic-link login) are hidden. */
export function isEmailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

function getClient() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export async function sendEmail({
  to,
  subject,
  react,
  replyTo,
}: {
  to: string;
  subject: string;
  react: ReactElement;
  replyTo?: string;
}) {
  const resend = getClient();
  if (!resend) return false;

  const from = process.env.RESEND_FROM_EMAIL || "Consultainer <onboarding@resend.dev>";
  const html = await render(react);

  try {
    const { error } = await resend.emails.send({ from, to, subject, html, replyTo });
    if (error) {
      console.warn("Resend returned an error", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Failed to send email via Resend", err);
    return false;
  }
}
