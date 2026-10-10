import "server-only";
import { prisma } from "@/lib/prisma";
import { sendAlert } from "@/lib/alerts";
import { isEmailConfigured } from "@/lib/email";
import {
  defaultInvoiceRecipients,
  emailInvoice,
  InvoiceDeliveryError,
} from "@/lib/services/invoice-delivery";

// Scheduled sending: an owner or admin picks when a draft goes out, and the
// hourly job emails it then — the same emailInvoice() path as "Email to
// client", to the client's default invoice recipients. Sending moves the
// issue date to the day it goes out and the due date with it (keeping the
// same number of days between them, i.e. the payment terms), so a draft
// written on the 20th and sent on the 1st isn't already 11 days into its
// terms.
//
// If it can't be sent (email isn't set up, the client has no address, the
// email failed), nothing changes silently: the invoice stays a draft with
// its dates and schedule as they were, the reason is saved on it
// (scheduledSendError, shown on the invoice), owners and admins are alerted,
// and it isn't retried until someone reschedules or sends it.

export class ScheduleError extends Error {}

const DAY_MS = 86_400_000;

function dayOf(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Schedules (or reschedules) a draft. Callers check the role and that the
 * invoice is visible to the actor. */
export async function scheduleInvoiceSend(
  ctx: { orgId: string; actorId: string },
  invoiceId: string,
  sendAt: Date,
  now = new Date()
) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { _count: { select: { lineItems: true } } },
  });
  if (!invoice || invoice.orgId !== ctx.orgId) throw new ScheduleError("Invoice not found.");
  if (invoice.status !== "DRAFT") throw new ScheduleError("Only draft invoices can be scheduled.");
  if (invoice._count.lineItems === 0) {
    throw new ScheduleError("Add at least one line item before scheduling it.");
  }
  if (Number.isNaN(sendAt.getTime())) throw new ScheduleError("Pick a date and time to send it.");
  // A few minutes' grace for "now"; anything earlier is a mistake.
  if (sendAt.getTime() < now.getTime() - 10 * 60_000) {
    throw new ScheduleError("Pick a time in the future.");
  }
  if (sendAt.getTime() > now.getTime() + 366 * DAY_MS) {
    throw new ScheduleError("Schedule it at most a year ahead.");
  }
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { scheduledSendAt: sendAt, scheduledSendById: ctx.actorId, scheduledSendError: null },
  });
}

export async function cancelScheduledSend(ctx: { orgId: string }, invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.orgId !== ctx.orgId) throw new ScheduleError("Invoice not found.");
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { scheduledSendAt: null, scheduledSendById: null, scheduledSendError: null },
  });
}

/** Hourly: emails every draft whose scheduled time has passed. */
export async function sendScheduledInvoices(now = new Date()) {
  const due = await prisma.invoice.findMany({
    where: { status: "DRAFT", scheduledSendAt: { lte: now }, scheduledSendError: null },
    select: { id: true },
    orderBy: { scheduledSendAt: "asc" },
  });
  let sent = 0;
  let failed = 0;
  for (const { id } of due) {
    const result = await sendOne(id, now);
    if (result === "sent") sent++;
    else if (result === "failed") failed++;
  }
  return { sent, failed };
}

async function sendOne(invoiceId: string, now: Date): Promise<"sent" | "failed" | "skipped"> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: { select: { name: true } } },
  });
  if (!invoice || invoice.status !== "DRAFT" || !invoice.scheduledSendAt) return "skipped";
  const scheduledFor = invoice.scheduledSendAt;

  // Claim it: an overlapping run (or a person pressing send right now) sees
  // it as no longer scheduled.
  const claimed = await prisma.invoice.updateMany({
    where: { id: invoiceId, status: "DRAFT", scheduledSendAt: scheduledFor, scheduledSendError: null },
    data: { scheduledSendAt: null },
  });
  if (!claimed.count) return "skipped";

  const original = { issueDate: invoice.issueDate, dueDate: invoice.dueDate };
  const termsDays = Math.max(
    0,
    Math.round((dayOf(invoice.dueDate).getTime() - dayOf(invoice.issueDate).getTime()) / DAY_MS)
  );
  const issueDate = dayOf(now);
  const dueDate = new Date(issueDate.getTime() + termsDays * DAY_MS);

  let reason: string;
  try {
    const to = await defaultInvoiceRecipients(invoice.clientId);
    if (!(await isEmailConfigured())) {
      reason = "email isn't set up on this instance (Settings → Integrations)";
    } else if (to.length === 0) {
      reason = `${invoice.client.name} has no invoice contact, billing email or email address`;
    } else {
      const scheduler = invoice.scheduledSendById
        ? await prisma.user.findUnique({ where: { id: invoice.scheduledSendById }, select: { email: true } })
        : null;
      const owner = scheduler
        ? null
        : await prisma.membership.findFirst({
            where: { orgId: invoice.orgId, role: "OWNER" },
            orderBy: { createdAt: "asc" },
            include: { user: { select: { email: true } } },
          });
      // The email shows the new due date, so move the dates first.
      await prisma.invoice.update({ where: { id: invoiceId }, data: { issueDate, dueDate } });
      await emailInvoice(
        { orgId: invoice.orgId, actorId: null, replyTo: scheduler?.email ?? owner?.user.email ?? null },
        invoiceId,
        { to, message: null }
      );
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { scheduledSendById: null, scheduledSendError: null },
      });
      return "sent";
    }
  } catch (err) {
    if (err instanceof InvoiceDeliveryError) {
      reason = err.message.startsWith("The email couldn't be sent")
        ? "the email couldn't be delivered"
        : err.message.charAt(0).toLowerCase() + err.message.slice(1).replace(/\.$/, "");
    } else {
      console.error("[scheduled-invoices] Send failed", invoiceId, err);
      reason = "something went wrong while sending it";
    }
  }

  // Not sent: put everything back as it was, say why, and alert. (If it
  // did go out and something after that failed, it's sent — leave it.)
  const current = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true } });
  if (current?.status !== "DRAFT") return current ? "sent" : "skipped";
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      ...original,
      scheduledSendAt: scheduledFor,
      scheduledSendError: reason.charAt(0).toUpperCase() + reason.slice(1) + ".",
    },
  });
  await sendAlert({
    orgId: invoice.orgId,
    event: "INVOICE_SEND_FAILED",
    message: `Invoice ${invoice.number} for ${invoice.client.name} was scheduled to send but wasn't sent: ${reason}. It's still a draft — send it from the invoice, or schedule it again once that's fixed.`,
    link: `/invoices/${invoice.id}`,
  });
  return "failed";
}
