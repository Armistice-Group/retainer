import "server-only";
import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { render } from "@react-email/render";
import { getConfigs } from "@/lib/instance-config";
import type { ReactElement } from "react";

// Outgoing email goes through Resend's API or any SMTP server (Postmark,
// SES, Mailgun, Google Workspace, Microsoft 365, your own). Settings come
// from .env or Settings → Integrations (see lib/instance-config).

export type EmailProvider = "resend" | "smtp";

const KEYS = [
  "EMAIL_PROVIDER",
  "EMAIL_FROM",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
] as const;

async function emailSettings() {
  const c = await getConfigs(KEYS);
  // Unset: SMTP when only SMTP is filled in, else Resend (what it always was).
  const provider: EmailProvider =
    c.EMAIL_PROVIDER === "smtp" || c.EMAIL_PROVIDER === "resend"
      ? c.EMAIL_PROVIDER
      : c.SMTP_HOST && !c.RESEND_API_KEY
        ? "smtp"
        : "resend";
  // RESEND_FROM_EMAIL is the older name for EMAIL_FROM.
  const from = c.EMAIL_FROM || c.RESEND_FROM_EMAIL || null;
  return { ...c, provider, from };
}

/** Email is optional on a self-hosted instance. Without it, flows that would
 * send a link (invites, contractor reviews) surface the link in the UI to
 * share manually, and email-only features (magic-link login) are hidden. */
export async function isEmailConfigured() {
  const s = await emailSettings();
  return s.provider === "smtp" ? !!s.SMTP_HOST && !!s.from : !!s.RESEND_API_KEY;
}

/** Which service sends mail and as whom, for Settings. */
export async function emailStatus() {
  const s = await emailSettings();
  return {
    provider: s.provider,
    configured: await isEmailConfigured(),
    from: await fromAddress(),
    host: s.provider === "smtp" ? (s.SMTP_HOST ?? null) : null,
  };
}

const RESEND_TEST_SENDER = "Consultainer <onboarding@resend.dev>";

/** The address mail is sent as. Resend has a test sender to fall back on;
 * SMTP servers need a real address, so the username stands in if it is one. */
export async function fromAddress() {
  const s = await emailSettings();
  if (s.from) return s.from;
  if (s.provider === "smtp") return s.SMTP_USER?.includes("@") ? s.SMTP_USER : "";
  return RESEND_TEST_SENDER;
}

// Clients are rebuilt when the settings change.
let resend: { key: string; client: Resend } | null = null;
let smtp: { key: string; transport: Transporter } | null = null;

function smtpTransport(s: Awaited<ReturnType<typeof emailSettings>>) {
  const port = Number(s.SMTP_PORT) || 587;
  const key = JSON.stringify([s.SMTP_HOST, port, s.SMTP_USER, s.SMTP_PASSWORD]);
  if (!smtp || smtp.key !== key) {
    smtp?.transport.close();
    smtp = {
      key,
      transport: nodemailer.createTransport({
        host: s.SMTP_HOST,
        port,
        // 465 is TLS from the start; anything else upgrades with STARTTLS
        // when the server offers it.
        secure: port === 465,
        auth: s.SMTP_USER ? { user: s.SMTP_USER, pass: s.SMTP_PASSWORD ?? "" } : undefined,
        // A wrong host or port fails within seconds, not minutes.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    };
  }
  return smtp.transport;
}

export type EmailAttachment = { filename: string; content: Buffer; contentType?: string };
type EmailInput = {
  to: string;
  subject: string;
  react: ReactElement;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

/** Sends one email and says why when it didn't go (for the test button). */
export async function trySendEmail({ to, subject, react, replyTo, attachments }: EmailInput): Promise<{ error?: string }> {
  if (!(await isEmailConfigured())) return { error: "Email isn't set up." };
  const s = await emailSettings();
  const from = await fromAddress();
  const html = await render(react);

  if (s.provider === "smtp") {
    try {
      await smtpTransport(s).sendMail({ from, to, subject, html, replyTo, attachments });
      return {};
    } catch (err) {
      console.warn("Failed to send email via SMTP", err);
      return { error: err instanceof Error ? err.message : "The SMTP server refused the email." };
    }
  }

  if (!resend || resend.key !== s.RESEND_API_KEY) {
    resend = { key: s.RESEND_API_KEY!, client: new Resend(s.RESEND_API_KEY!) };
  }
  try {
    const { error } = await resend.client.emails.send({
      from,
      to,
      subject,
      html,
      replyTo,
      attachments: attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    });
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
