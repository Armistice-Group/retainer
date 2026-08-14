import "server-only";
import { prisma } from "@/lib/prisma";
import { addDays, addMonths } from "@/lib/date";
import { notify, getOrgAdminUserIds } from "@/lib/notifications";
import { postToSlack } from "@/lib/slack";
import type { RecurringInvoiceSchedule } from "@/generated/prisma/client";

function advance(nextRunAt: Date, interval: "WEEKLY" | "MONTHLY") {
  return interval === "WEEKLY" ? addDays(nextRunAt, 7) : addMonths(nextRunAt, 1);
}

async function generateFromSchedule(schedule: RecurringInvoiceSchedule, now: Date) {
  const issueDate = now;
  const dueDate = addDays(issueDate, schedule.dueInDays);
  const status = schedule.autoSend ? "SENT" : "DRAFT";
  const amount = Number(schedule.amount);

  const invoice = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: schedule.orgId } });
    const number = `${org.invoicePrefix}-${String(org.nextInvoiceNumber).padStart(4, "0")}`;

    const created = await tx.invoice.create({
      data: {
        orgId: schedule.orgId,
        clientId: schedule.clientId,
        number,
        status,
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
      data: { lastRunAt: now, nextRunAt: advance(schedule.nextRunAt, schedule.interval) },
    });

    return created;
  });

  const client = await prisma.client.findUniqueOrThrow({ where: { id: schedule.clientId } });
  const verb = schedule.autoSend ? "generated and sent" : "generated as a draft — review and send";
  const message = `Recurring invoice ${invoice.number} for ${client.name} was ${verb} ($${amount.toFixed(2)}).`;

  const adminIds = await getOrgAdminUserIds(prisma, schedule.orgId);
  if (adminIds.length > 0) {
    await notify(prisma, {
      orgId: schedule.orgId,
      userIds: adminIds,
      type: "RECURRING_INVOICE_GENERATED",
      message,
      link: `/invoices/${invoice.id}`,
    });
  }

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: schedule.orgId },
    select: { slackWebhookUrl: true },
  });
  await postToSlack(org.slackWebhookUrl, message);

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
