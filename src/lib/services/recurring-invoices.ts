import "server-only";
import { prisma } from "@/lib/prisma";
import { addDays } from "@/lib/date";
import { nextRunDate } from "@/lib/billing-interval";
import { sendAlert } from "@/lib/alerts";
import { formatCurrency } from "@/lib/format";
import { autoSendInvoice } from "@/lib/services/invoice-delivery";
import type { RecurringInvoiceSchedule } from "@/generated/prisma/client";

async function generateFromSchedule(schedule: RecurringInvoiceSchedule, now: Date) {
  const issueDate = now;
  const dueDate = addDays(issueDate, schedule.dueInDays);
  const amount = Number(schedule.amount);

  const invoice = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: schedule.orgId } });
    const number = `${org.invoicePrefix}-${String(org.nextInvoiceNumber).padStart(4, "0")}`;

    const created = await tx.invoice.create({
      data: {
        orgId: schedule.orgId,
        clientId: schedule.clientId,
        number,
        // Always a draft first; autoSend emails it (and marks it sent) below.
        status: "DRAFT",
        issueDate,
        dueDate,
        currency: org.defaultCurrency,
        subtotal: amount,
        total: amount,
        recurringScheduleId: schedule.id,
        retainerHoursIncluded: schedule.retainerHours,
      },
    });

    await tx.organization.update({
      where: { id: schedule.orgId },
      data: { nextInvoiceNumber: { increment: 1 } },
    });

    await tx.invoiceLineItem.create({
      data: {
        invoiceId: created.id,
        description: schedule.description,
        quantity: 1,
        rate: amount,
        amount,
        sortOrder: 0,
      },
    });

    await tx.recurringInvoiceSchedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: now, nextRunAt: nextRunDate(schedule.nextRunAt, schedule.interval) },
    });

    return created;
  });

  const withClient = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoice.id },
    include: { client: true },
  });

  // Same path as billing cycles: an auto-send schedule emails the invoice to
  // the client (alerting if it can't); a draft gets the "review and send"
  // alert.
  if (schedule.autoSend) {
    await autoSendInvoice(schedule.orgId, invoice.id, "recurring");
  } else {
    const total = formatCurrency(withClient.total, withClient.currency);
    await sendAlert({
      orgId: schedule.orgId,
      event: "RECURRING_INVOICE_GENERATED",
      message: `Recurring invoice ${withClient.number} for ${withClient.client.name} was generated as a draft — review and send (${total}).`,
      link: `/invoices/${invoice.id}`,
    });
  }

  return invoice;
}

export type RecurringRunResult = {
  scheduleId: string;
  ok: boolean;
  invoiceId?: string;
  error?: string;
};

// Runs every due schedule and advances each independently — one schedule's
// failure (e.g. a client that got deleted out from under it) shouldn't block
// the rest from generating.
export async function runDueRecurringSchedules(now = new Date()): Promise<RecurringRunResult[]> {
  const due = await prisma.recurringInvoiceSchedule.findMany({
    where: { active: true, nextRunAt: { lte: now } },
  });

  const results: RecurringRunResult[] = [];
  for (const schedule of due) {
    try {
      const invoice = await generateFromSchedule(schedule, now);
      results.push({ scheduleId: schedule.id, ok: true, invoiceId: invoice.id });
    } catch (err) {
      results.push({
        scheduleId: schedule.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
