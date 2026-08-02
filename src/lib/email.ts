import "server-only";
import { Resend } from "resend";
import { render } from "@react-email/render";
import type { ReactElement } from "react";

let client: Resend | null = null;

function getClient() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string;
  subject: string;
  react: ReactElement;
}) {
  const resend = getClient();
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipping email "${subject}" to ${to}. Add RESEND_API_KEY and RESEND_FROM_EMAIL to send for real.`
    );
    return;
  }

  const from = process.env.RESEND_FROM_EMAIL || "Consultainer <onboarding@resend.dev>";
  const html = await render(react);

  try {
    const { error } = await resend.emails.send({ from, to, subject, html });
    if (error) console.warn("Resend returned an error", error);
  } catch (err) {
    console.warn("Failed to send email via Resend", err);
  }
}
