import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { InvoiceEmail } from "@/emails/invoice-email";
import { sendAlert } from "@/lib/alerts";
import { orgLogoUrl } from "@/lib/branding";
import { formatCurrency, formatDate } from "@/lib/format";
import { getOrigin } from "@/lib/url";
import { daysOverdue } from "@/lib/invoice-aging";
import { notifyInvoiceStatusChange } from "@/lib/services/invoices";
import type { InvoiceEventType } from "@/generated/prisma/client";

export class InvoiceDeliveryError extends Error {}

const ALERT_AGAIN_AFTER_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The invoice's client link token, created on first use. */
export async function ensureViewToken(invoiceId: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: { viewToken: true },
  });
  if (invoice.viewToken) return invoice.viewToken;
  const token = randomBytes(18).toString("base64url");
  await prisma.invoice.update({ where: { id: invoiceId }, data: { viewToken: token } });
  return token;
}

export async function invoiceLinks(invoiceId: string) {
  const token = await ensureViewToken(invoiceId);
  const origin = await getOrigin();
  return {
    token,
    viewUrl: `${origin}/i/${token}`,
    pixelUrl: `${origin}/i/${token}/open.gif`,
  };
}

/** Where an invoice email goes by default: the client's contacts marked
 * "receives invoices", else its billing email, else its main email. */
export async function defaultInvoiceRecipients(clientId: string) {
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    include: { contacts: { where: { receivesInvoices: true, email: { not: null } } } },
  });
  const contacts = client.contacts.map((c) => c.email!.toLowerCase());
  if (contacts.length) return [...new Set(contacts)];
  const fallback = client.billingEmail || client.email;
  return fallback ? [fallback.toLowerCase()] : [];
}

async function loadInvoice(invoiceId: string) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true, org: true, _count: { select: { lineItems: true } } },
  });
}

async function deliver(
  invoice: NonNullable<Awaited<ReturnType<typeof loadInvoice>>>,
  to: string[],
  opts: { message: string | null; reminder?: number; replyTo?: string | null }
) {
  const { viewUrl, pixelUrl } = await invoiceLinks(invoice.id);
  const origin = await getOrigin();
  const logo = orgLogoUrl(invoice.org);
  const total = formatCurrency(invoice.total, invoice.currency);
  const subject = opts.reminder
    ? `Reminder: invoice ${invoice.number} from ${invoice.org.name} is overdue`
    : `Invoice ${invoice.number} from ${invoice.org.name} — ${total}`;

  const sent: string[] = [];
  for (const recipient of to) {
    const ok = await sendEmail({
      to: recipient,
      subject,
      replyTo: opts.replyTo ?? undefined,
      react: InvoiceEmail({
        orgName: invoice.org.name,
        logoUrl: logo ? (logo.startsWith("/") ? `${origin}${logo}` : logo) : null,
        invoiceNumber: invoice.number,
        total,
        dueDate: formatDate(invoice.dueDate),
        message: opts.message,
        viewUrl,
        pixelUrl,
        reminder: opts.reminder,
      }),
    });
    if (ok) sent.push(recipient);
  }
  return sent;
}

/** Emails a client their invoice with a link to view and pay it. A draft is
 * marked sent first (with the usual "invoice sent" alert). With no actor
 * (a recurring schedule or billing cycle sending on its own), replies go to
 * `replyTo` and the activity log says it was sent automatically. */
export async function emailInvoice(
  ctx: { orgId: string; actorId: string | null; replyTo?: string | null },
  invoiceId: string,
  input: { to: string[]; message?: string | null }
) {
  const invoice = await loadInvoice(invoiceId);
  if (!invoice || invoice.orgId !== ctx.orgId) throw new InvoiceDeliveryError("Invoice not found.");
  if (invoice.status === "VOID") throw new InvoiceDeliveryError("This invoice is void.");
  if (invoice._count.lineItems === 0) {
    throw new InvoiceDeliveryError("Add at least one line item before sending.");
  }
  if (!(await isEmailConfigured())) {
    throw new InvoiceDeliveryError(
      "Email isn't set up on this instance. Copy the client link instead, or set up email under Settings → Integrations."
    );
  }
  const to = [...new Set(input.to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (to.length === 0) throw new InvoiceDeliveryError("Add at least one recipient.");
  const bad = to.find((e) => !EMAIL_RE.test(e));
  if (bad) throw new InvoiceDeliveryError(`"${bad}" isn't an email address.`);
  if (to.length > 20) throw new InvoiceDeliveryError("Send to at most 20 people at once.");

  const actor = ctx.actorId
    ? await prisma.user.findUnique({ where: { id: ctx.actorId }, select: { email: true } })
    : null;
  const sent = await deliver(invoice, to, {
    message: input.message?.trim() || null,
    replyTo: actor?.email ?? ctx.replyTo,
  });
  if (sent.length === 0) throw new InvoiceDeliveryError("The email couldn't be sent. Try again.");

  await prisma.invoiceEvent.create({
    data: {
      invoiceId,
      type: "EMAILED",
      recipients: sent,
      actorId: ctx.actorId,
      detail: ctx.actorId ? null : AUTO_SENT_DETAIL,
    },
  });
  if (invoice.status === "DRAFT") {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "SENT" } });
    await notifyInvoiceStatusChange(invoice.org, invoice, "SENT");
  }
  return { sent };
}

/** InvoiceEvent.detail on an EMAILED event sent by a schedule, not a person. */
export const AUTO_SENT_DETAIL = "auto";

/** For recurring schedules and billing cycles set to send automatically:
 * emails a freshly generated draft to the client's default recipients (the
 * same ones the Email to client dialog starts with), which marks it sent. If
 * it can't be emailed — email isn't set up, the client has no address, or
 * delivery failed — it's still marked sent, and the org is alerted to send
 * it themselves. Never throws for delivery problems. */
export async function autoSendInvoice(
  orgId: string,
  invoiceId: string,
  source: "recurring" | "billing cycle"
): Promise<{ emailed: string[] } | { emailed: null; reason: string }> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { client: true, org: true },
  });
  // Replies go to the org's first owner, as nobody pressed send.
  const owner = await prisma.membership.findFirst({
    where: { orgId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { email: true } } },
  });

  let reason: string;
  try {
    const to = await defaultInvoiceRecipients(invoice.clientId);
    if (!(await isEmailConfigured())) {
      reason = "email isn't set up on this instance";
    } else if (to.length === 0) {
      reason = `${invoice.client.name} has no invoice contact, billing email or email address`;
    } else {
      const { sent } = await emailInvoice(
        { orgId, actorId: null, replyTo: owner?.user.email ?? null },
        invoiceId,
        { to, message: null }
      );
      return { emailed: sent };
    }
  } catch (err) {
    if (!(err instanceof InvoiceDeliveryError)) throw err;
    reason = err.message.startsWith("The email couldn't be sent")
      ? "the email couldn't be delivered"
      : err.message.charAt(0).toLowerCase() + err.message.slice(1).replace(/\.$/, "");
  }

  // Not emailed: mark it sent anyway (that's what the schedule asked for),
  // with the usual "invoice sent" alert, then say why it wasn't emailed.
  const { count } = await prisma.invoice.updateMany({
    where: { id: invoiceId, status: "DRAFT" },
    data: { status: "SENT" },
  });
  if (count) await notifyInvoiceStatusChange(invoice.org, invoice, "SENT");
  await sendAlert({
    orgId,
    event: "RECURRING_INVOICE_GENERATED",
    message: `Invoice ${invoice.number} for ${invoice.client.name} was generated by its ${source === "recurring" ? "recurring schedule" : "billing cycle"} and marked sent, but it wasn't emailed: ${reason}. Send it to the client yourself: copy its client link, or email it from the invoice once that's fixed.`,
    link: `/invoices/${invoice.id}`,
  });
  return { emailed: null, reason };
}

/** Records a client opening an invoice and alerts the org on the first open
 * (and again if it's opened after a day). Opens by members of the org are
 * ignored, so previewing the client link yourself doesn't count. */
export async function recordInvoiceView(
  invoiceId: string,
  type: Extract<InvoiceEventType, "EMAIL_OPENED" | "VIEWED" | "PDF_VIEWED">,
  request: { headers: Headers }
) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { client: { select: { name: true } } },
    });
    if (!invoice || invoice.status === "DRAFT") return;
    if (await viewerIsOrgMember(invoice.orgId)) return;

    const now = new Date();
    const h = request.headers;
    await prisma.invoiceEvent.create({
      data: {
        invoiceId,
        type,
        ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
        userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      },
    });
    const alert =
      !invoice.viewAlertedAt || now.getTime() - invoice.viewAlertedAt.getTime() > ALERT_AGAIN_AFTER_MS;
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        firstViewedAt: invoice.firstViewedAt ?? now,
        lastViewedAt: now,
        viewCount: { increment: 1 },
        ...(alert ? { viewAlertedAt: now } : {}),
      },
    });
    if (!alert) return;

    const how =
      type === "EMAIL_OPENED"
        ? "opened the invoice email for"
        : type === "PDF_VIEWED"
          ? "opened the PDF of"
          : "viewed";
    const again = invoice.firstViewedAt ? " again" : "";
    await sendAlert({
      orgId: invoice.orgId,
      event: "INVOICE_VIEWED",
      message: `${invoice.client.name} ${how} invoice ${invoice.number}${again} (${formatCurrency(invoice.total, invoice.currency)}, ${invoice.status === "PAID" ? "paid" : `due ${formatDate(invoice.dueDate)}`}).`,
      link: `/invoices/${invoice.id}`,
    });
  } catch (err) {
    console.warn("[invoice-delivery] Couldn't record view", invoiceId, err);
  }
}

async function viewerIsOrgMember(orgId: string) {
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    if (!session?.user?.id) return false;
    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: session.user.id, orgId } },
    });
    return !!membership;
  } catch {
    return false;
  }
}

/** Daily: emails clients about overdue invoices at each of the org's
 * reminder thresholds (e.g. 3, 7, 14 days), once per threshold. Only the
 * highest threshold reached is sent, so turning reminders on doesn't send a
 * backlog. */
export async function sendOverdueReminders(now = new Date()) {
  if (!(await isEmailConfigured())) return { sent: 0 };
  const invoices = await prisma.invoice.findMany({
    where: {
      status: "SENT",
      dueDate: { lt: now },
      client: { invoiceReminders: true },
      org: { overdueReminderDays: { isEmpty: false } },
    },
    include: {
      client: true,
      org: true,
      _count: { select: { lineItems: true } },
      events: { where: { type: "REMINDED" }, select: { detail: true } },
    },
  });

  let sent = 0;
  for (const invoice of invoices) {
    const overdue = daysOverdue(invoice.dueDate, now);
    const threshold = [...invoice.org.overdueReminderDays]
      .sort((a, b) => b - a)
      .find((d) => overdue >= d);
    if (!threshold) continue;
    const already = new Set(invoice.events.map((e) => Number(e.detail)));
    // Skip if this or a later threshold already went out.
    if ([...already].some((d) => d >= threshold)) continue;

    const to = await defaultInvoiceRecipients(invoice.clientId);
    if (to.length === 0) continue;
    const delivered = await deliver(invoice, to, { message: null, reminder: overdue });
    if (delivered.length === 0) continue;
    await prisma.invoiceEvent.create({
      data: {
        invoiceId: invoice.id,
        type: "REMINDED",
        recipients: delivered,
        detail: String(threshold),
      },
    });
    sent++;
  }
  return { sent };
}

/** A client-visible invoice by its link token (not drafts). */
export async function getInvoiceByViewToken(token: string) {
  if (!token || token.length > 64) return null;
  const invoice = await prisma.invoice.findUnique({
    where: { viewToken: token },
    include: {
      client: true,
      org: { include: { mercuryConnection: { select: { destinationAccountId: true } } } },
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: { timeEntries: { select: { id: true } } },
      },
    },
  });
  if (!invoice || invoice.status === "DRAFT") return null;
  return invoice;
}
