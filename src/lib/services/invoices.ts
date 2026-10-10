import "server-only";
import { invoiceableTimeWhere } from "@/lib/services/timesheets";
import {
  dueDateFor,
  resolvePaymentTerms,
  type DefaultPaymentTerms,
  type PaymentTermsValue,
} from "@/lib/payment-terms";
import { Prisma, type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { projectVisibilityWhere } from "@/lib/project-access";
import { sendAlert } from "@/lib/alerts";
import { formatCurrency } from "@/lib/format";
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
  const total = formatCurrency(invoice.total, invoice.currency);
  const verb = status === "PAID" ? "was paid" : "was sent";
  await sendAlert({
    orgId: org.id,
    event: status === "PAID" ? "INVOICE_PAID" : "INVOICE_SENT",
    message: `Invoice ${invoice.number} for ${invoice.client.name} ${verb} (${total}).`,
    link: `/invoices/${invoice.id}`,
  });
  // A sent or paid invoice's PDF goes to the org's filing folder, if set up.
  const { fileInvoice } = await import("@/lib/services/filing");
  await fileInvoice(invoice.id);
}

/** Only owners and admins can send, mark paid or void an invoice — in the
 * app, the API and the MCP server alike. Members can generate and edit
 * drafts. */
export function canChangeInvoiceStatusByKey(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}

/** Why an invoice can't move from `from` to `to` by hand, or null if it can:
 * draft → sent, sent → paid, draft or sent → void. */
export function invoiceStatusChangeError(
  from: "DRAFT" | "SENT" | "PAID" | "VOID",
  to: "DRAFT" | "SENT" | "PAID" | "VOID"
): string | null {
  if (to === "SENT" && from !== "DRAFT") return "Only draft invoices can be sent.";
  if (to === "PAID" && from !== "SENT") return "Only sent invoices can be marked paid.";
  if (to === "VOID" && from !== "DRAFT" && from !== "SENT") {
    return from === "VOID" ? "This invoice is already void." : "Paid invoices can't be voided.";
  }
  if (to === "DRAFT") return "Invoices can't be moved back to draft.";
  return null;
}

/** Unlinks the time entries, milestones and expenses billed on an invoice
 * (or on one of its line items) so they're unbilled again. The line items
 * themselves are left alone. */
export async function releaseInvoicedWork(
  tx: Prisma.TransactionClient,
  scope: { invoiceId: string } | { lineItemId: string }
) {
  const where =
    "invoiceId" in scope
      ? { invoiceLineItem: { invoiceId: scope.invoiceId } }
      : { invoiceLineItemId: scope.lineItemId };
  const [timeEntries, milestones, expenses] = await Promise.all([
    tx.timeEntry.updateMany({ where, data: { invoiceLineItemId: null } }),
    tx.milestone.updateMany({ where, data: { invoiceLineItemId: null, invoicedAt: null } }),
    tx.expense.updateMany({ where, data: { invoiceLineItemId: null, invoicedAt: null } }),
  ]);
  return { timeEntries: timeEntries.count, milestones: milestones.count, expenses: expenses.count };
}

/** Voids a draft or sent invoice — the one path the app, API and MCP server
 * all use. Its time, milestones and expenses go back to unbilled so they can
 * be invoiced again; the voided invoice keeps its line items as a record.
 * Throws InvoiceError if the invoice can't be voided. */
export async function voidInvoice(orgId: string, invoiceId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, orgId } });
    if (!invoice) throw new InvoiceError("Invoice not found.");
    const statusError = invoiceStatusChangeError(invoice.status, "VOID");
    if (statusError) throw new InvoiceError(statusError);
    // Conditional on the status we checked, so a concurrent payment or void
    // can't slip in between.
    const { count } = await tx.invoice.updateMany({
      where: { id: invoiceId, status: invoice.status },
      data: { status: "VOID" },
    });
    if (count === 0) throw new InvoiceError("This invoice changed while voiding it. Try again.");
    const released = await releaseInvoicedWork(tx, { invoiceId });
    const updated = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    return { invoice: updated, released };
  });
  // A filed copy is refreshed so it shows VOID.
  const { fileInvoice } = await import("@/lib/services/filing");
  await fileInvoice(invoiceId);
  return result;
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

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { overdueNotifiedAt: now },
    });
    await sendAlert({
      orgId: invoice.orgId,
      event: "INVOICE_OVERDUE",
      message,
      link: `/invoices/${invoice.id}`,
    });
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
  /** Defaults to the issue date plus the payment terms. */
  dueDate?: string;
  /** Defaults to the project's terms when every item is from one project
   * that sets them, else the client's, else the org's. */
  paymentTerms?: PaymentTermsValue;
  poNumber?: string | null;
  taxRate: number;
  notes?: string | null;
};

export async function generateInvoice(ctx: GenerateInvoiceContext, input: GenerateInvoiceInput) {
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client || client.orgId !== ctx.orgId) throw new InvoiceError("Client not found.");

  const approval = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.orgId },
    select: { timesheetApproval: true },
  });
  const entries = await prisma.timeEntry.findMany({
    where: {
      id: { in: input.timeEntryIds },
      orgId: ctx.orgId,
      billable: true,
      invoiceLineItemId: null,
      project: { clientId: client.id, ...projectVisibilityWhere(ctx.actorId, ctx.role) },
      AND: [invoiceableTimeWhere(ctx.orgId, approval.timesheetApproval)],
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

  const itemProjects = [...entries, ...milestones, ...expenses].map((i) => i.project);
  const onlyProject =
    new Set(itemProjects.map((p) => p.id)).size === 1 ? itemProjects[0] : null;
  let paymentTerms: PaymentTermsValue | undefined = input.paymentTerms;
  if (!paymentTerms) {
    const orgTerms = await prisma.organization.findUniqueOrThrow({
      where: { id: ctx.orgId },
      select: { defaultPaymentTerms: true },
    });
    paymentTerms = resolvePaymentTerms({
      project: onlyProject?.paymentTerms as DefaultPaymentTerms | null | undefined,
      client: client.paymentTerms as DefaultPaymentTerms | null,
      org: orgTerms.defaultPaymentTerms as DefaultPaymentTerms,
    });
  }
  const dueDate = input.dueDate ?? dueDateFor(input.issueDate, paymentTerms);
  if (!dueDate) throw new InvoiceError("Custom payment terms need a due date.");

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
        dueDate: new Date(dueDate),
        paymentTerms,
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
    // Return the invoice with its computed subtotal, tax and total.
    return tx.invoice.findUniqueOrThrow({ where: { id: created.id } });
  });

  return invoice;
}
