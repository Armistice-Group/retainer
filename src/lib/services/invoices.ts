import "server-only";
import { Prisma, type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { projectVisibilityWhere } from "@/lib/project-access";
import { notify, getOrgAdminUserIds, getOrgOwnerEmail } from "@/lib/notifications";
import { postToSlack } from "@/lib/slack";
import { sendEmail } from "@/lib/email";
import { InvoiceStatusEmail } from "@/emails/invoice-status-email";
import { formatCurrency } from "@/lib/format";
import { getOrigin } from "@/lib/url";
import { daysOverdue } from "@/lib/invoice-aging";

export class InvoiceError extends Error {}

// Shared by the web UI (setInvoiceStatusAction) and the MCP
// mark_invoice_sent/mark_invoice_paid tools — same notification behavior
// (in-app, Slack, email) regardless of which surface changed the status.
export async function notifyInvoiceStatusChange(
  org: { id: string; name: string; slackWebhookUrl: string | null },
  invoice: {
    id: string;
    number: string;
    total: Prisma.Decimal;
    currency: string;
    client: { name: string };
  },
  status: "SENT" | "PAID"
) {
  const origin = await getOrigin();
  const invoiceUrl = `${origin}/invoices/${invoice.id}`;
  const total = formatCurrency(invoice.total, invoice.currency);
  const verb = status === "PAID" ? "was paid" : "was sent";
  const message = `Invoice ${invoice.number} for ${invoice.client.name} ${verb} (${total}).`;

  const adminIds = await getOrgAdminUserIds(prisma, org.id);
  await notify(prisma, {
    orgId: org.id,
    userIds: adminIds,
    type: status === "PAID" ? "INVOICE_PAID" : "INVOICE_SENT",
    message,
    link: `/invoices/${invoice.id}`,
  });

  await postToSlack(org.slackWebhookUrl, message);

  const ownerEmail = await getOrgOwnerEmail(prisma, org.id);
  if (ownerEmail) {
    await sendEmail({
      to: ownerEmail,
      subject: `${status === "PAID" ? "Paid" : "Sent"}: invoice ${invoice.number}`,
      react: InvoiceStatusEmail({
        orgName: org.name,
        invoiceNumber: invoice.number,
        clientName: invoice.client.name,
        total,
        status: status === "PAID" ? "paid" : "sent",
        invoiceUrl,
        origin,
      }),
    });
  }
}

// Called once a day by the recurring-invoices cron job. overdueNotifiedAt is
// the actual idempotency guard (so a cron that fires twice in one day, or
// retries, never double-notifies); daysOverdue >= 1 just means "don't fire
// before an invoice is actually overdue." That combination also correctly
// catches invoices that were already overdue before this feature shipped —
// they get one notification on the next run instead of never, since they'll
// never again be "exactly" one day overdue.
export async function notifyNewlyOverdueInvoices(now = new Date()) {
  const sentInvoices = await prisma.invoice.findMany({
    where: { status: "SENT", overdueNotifiedAt: null },
    include: {
      client: { select: { name: true } },
      org: { select: { id: true, name: true, slackWebhookUrl: true } },
    },
  });

  const newlyOverdue = sentInvoices.filter((inv) => daysOverdue(inv.dueDate, now) >= 1);

  for (const invoice of newlyOverdue) {
    const total = formatCurrency(invoice.total, invoice.currency);
    const message = `Invoice ${invoice.number} for ${invoice.client.name} is now overdue (${total}).`;

    const adminIds = await getOrgAdminUserIds(prisma, invoice.orgId);
    if (adminIds.length > 0) {
      await notify(prisma, {
        orgId: invoice.orgId,
        userIds: adminIds,
        type: "INVOICE_OVERDUE",
        message,
        link: `/invoices/${invoice.id}`,
      });
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { overdueNotifiedAt: now },
    });

    await postToSlack(invoice.org.slackWebhookUrl, message);
  }

  return newlyOverdue.length;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function recomputeInvoiceTotals(tx: Prisma.TransactionClient, invoiceId: string) {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { lineItems: true },
  });

  const subtotal = invoice.lineItems.reduce((sum, li) => sum + Number(li.amount), 0);
  const taxRate = Number(invoice.taxRate);
  const taxAmount = round2((subtotal * taxRate) / 100);
  const total = round2(subtotal + taxAmount);

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { subtotal: round2(subtotal), taxAmount, total },
  });
}

export type GenerateInvoiceContext = {
  orgId: string;
  defaultCurrency: string;
  actorId: string;
  role: Role;
};

export type GenerateInvoiceInput = {
  clientId: string;
  timeEntryIds: string[];
  milestoneIds: string[];
  expenseIds: string[];
  issueDate: string;
  dueDate: string;
  paymentTerms?: "DUE_ON_RECEIPT" | "NET15" | "NET30" | "NET45" | "NET60" | "NET90" | "CUSTOM";
  poNumber?: string | null;
  taxRate: number;
  notes?: string | null;
};

export async function generateInvoice(ctx: GenerateInvoiceContext, input: GenerateInvoiceInput) {
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client || client.orgId !== ctx.orgId) throw new InvoiceError("Client not found.");

  const entries = await prisma.timeEntry.findMany({
    where: {
      id: { in: input.timeEntryIds },
      orgId: ctx.orgId,
      billable: true,
      invoiceLineItemId: null,
      project: { clientId: client.id, ...projectVisibilityWhere(ctx.actorId, ctx.role) },
    },
    include: { project: true, user: true },
  });

  const milestones = await prisma.milestone.findMany({
    where: {
      id: { in: input.milestoneIds },
      invoiceLineItemId: null,
      completedAt: { not: null },
      project: {
        clientId: client.id,
        orgId: ctx.orgId,
        ...projectVisibilityWhere(ctx.actorId, ctx.role),
      },
    },
    include: { project: true },
  });

  const expenses = await prisma.expense.findMany({
    where: {
      id: { in: input.expenseIds },
      invoiceLineItemId: null,
      status: "APPROVED",
      project: {
        clientId: client.id,
        orgId: ctx.orgId,
        ...projectVisibilityWhere(ctx.actorId, ctx.role),
      },
    },
    include: { project: true },
  });

  if (entries.length === 0 && milestones.length === 0 && expenses.length === 0) {
    throw new InvoiceError(
      "No eligible unbilled time entries, milestones, or expenses were selected."
    );
  }

  const projectMembers = await prisma.projectMember.findMany({
    where: { projectId: { in: [...new Set(entries.map((e) => e.projectId))] } },
  });
  const standardRateFor = (projectId: string, userId: string) =>
    Number(
      projectMembers.find((pm) => pm.projectId === projectId && pm.userId === userId)
        ?.billRate ?? 0
    );

  type GroupKey = string;
  const groups = new Map<
    GroupKey,
    { projectId: string; userId: string; hours: number; rate: number; label: string }
  >();

  for (const entry of entries) {
    const rate =
      entry.rateOverride != null
        ? Number(entry.rateOverride)
        : standardRateFor(entry.projectId, entry.userId);
    const key = `${entry.projectId}:${entry.userId}:${rate}`;
    const existing = groups.get(key);
    if (existing) {
      existing.hours += Number(entry.hours);
    } else {
      groups.set(key, {
        projectId: entry.projectId,
        userId: entry.userId,
        hours: Number(entry.hours),
        rate,
        label: `${entry.project.name} — ${entry.user.name}`,
      });
    }
  }

  const invoice = await prisma.$transaction(async (tx) => {
    const orgRow = await tx.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
    const number = `${orgRow.invoicePrefix}-${String(orgRow.nextInvoiceNumber).padStart(4, "0")}`;

    const created = await tx.invoice.create({
      data: {
        orgId: ctx.orgId,
        clientId: client.id,
        number,
        status: "DRAFT",
        issueDate: new Date(input.issueDate),
        dueDate: new Date(input.dueDate),
        paymentTerms: input.paymentTerms ?? "NET30",
        poNumber: input.poNumber || null,
        taxRate: input.taxRate,
        currency: ctx.defaultCurrency,
        notes: input.notes || null,
      },
    });

    await tx.organization.update({
      where: { id: ctx.orgId },
      data: { nextInvoiceNumber: { increment: 1 } },
    });

    const overheadMultiplier = 1 + Number(orgRow.overheadPercent) / 100;

    let sortOrder = 0;
    for (const group of groups.values()) {
      const billedRate = round2(group.rate * overheadMultiplier);
      const amount = round2(group.hours * billedRate);
      const lineItem = await tx.invoiceLineItem.create({
        data: {
          invoiceId: created.id,
          projectId: group.projectId,
          description: group.label,
          quantity: round2(group.hours),
          rate: billedRate,
          amount,
          sortOrder: sortOrder++,
        },
      });

      const groupEntryIds = entries
        .filter((e) => {
          const rate =
            e.rateOverride != null
              ? Number(e.rateOverride)
              : standardRateFor(e.projectId, e.userId);
          return (
            e.projectId === group.projectId && e.userId === group.userId && rate === group.rate
          );
        })
        .map((e) => e.id);

      await tx.timeEntry.updateMany({
        where: { id: { in: groupEntryIds } },
        data: { invoiceLineItemId: lineItem.id },
      });
    }

    for (const milestone of milestones) {
      const amount = round2(Number(milestone.amount));
      const lineItem = await tx.invoiceLineItem.create({
        data: {
          invoiceId: created.id,
          projectId: milestone.projectId,
          description: `${milestone.project.name} — Milestone: ${milestone.name}`,
          quantity: 1,
          rate: amount,
          amount,
          sortOrder: sortOrder++,
        },
      });

      await tx.milestone.update({
        where: { id: milestone.id },
        data: { invoiceLineItemId: lineItem.id, invoicedAt: new Date() },
      });
    }

    for (const expense of expenses) {
      const amount = round2(Number(expense.amount));
      const lineItem = await tx.invoiceLineItem.create({
        data: {
          invoiceId: created.id,
          projectId: expense.projectId,
          description: `${expense.project.name} — Expense: ${expense.description}`,
          quantity: 1,
          rate: amount,
          amount,
          sortOrder: sortOrder++,
        },
      });

      await tx.expense.update({
        where: { id: expense.id },
        data: { invoiceLineItemId: lineItem.id, invoicedAt: new Date() },
      });
    }

    await recomputeInvoiceTotals(tx, created.id);
    return created;
  });

  return invoice;
}
