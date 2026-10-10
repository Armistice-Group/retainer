import "server-only";
import { Prisma, type PaymentSource, type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendAlert } from "@/lib/alerts";
import { formatCurrency } from "@/lib/format";
import { toISODate } from "@/lib/date";
import { balanceCents, toCents } from "@/lib/invoice-balance";
import { invoiceVisibilityWhere, projectVisibilityWhere } from "@/lib/project-access";
import {
  dueDateFor,
  resolvePaymentTerms,
  type DefaultPaymentTerms,
  type PaymentTermsValue,
} from "@/lib/payment-terms";
import { notifyInvoiceStatusChange, round2 } from "@/lib/services/invoices";

// Payments, deposits and client credit — the one place invoice balances
// change, shared by the app, the API, the MCP server, the Stripe webhook and
// the Mercury/QuickBooks syncs.
//
// An invoice's balance is total − amountPaid − creditApplied, where
// amountPaid sums its Payment rows and creditApplied its CreditApplication
// rows (both kept in step here, inside the same transaction). A sent invoice
// becomes PAID when the balance reaches zero and goes back to SENT if a
// payment or credit is removed.
//
// A client's available credit (per currency) is: payments on their deposit
// invoices + issued credit notes + anything paid past an invoice's total
// (only integrations can overpay), minus credit already applied.
//
// Every write takes row locks in the same order — client, then invoice — so
// two payments or credit applications for the same client can't interleave.

export class PaymentError extends Error {}

/** Who's acting; actorId is null for webhooks and syncs. */
export type PaymentContext = { orgId: string; actorId: string | null };

/** Owners and admins record and delete payments, apply credit and issue
 * credit notes — the same people who can mark an invoice paid. */
export function canManagePayments(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}

type Tx = Prisma.TransactionClient;

async function lockClient(tx: Tx, clientId: string) {
  await tx.$queryRaw`SELECT 1 FROM "Client" WHERE "id" = ${clientId} FOR UPDATE`;
}

async function lockInvoice(tx: Tx, invoiceId: string) {
  await tx.$queryRaw`SELECT 1 FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE`;
}

const money = (cents: number, currency: string) => formatCurrency(cents / 100, currency);

/** Parses an amount typed or sent in, to whole cents. */
export function parseAmountCents(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[,\s$]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  // More than two decimals is a typo, not a fraction of a cent.
  if (Math.abs(n * 100 - cents) > 1e-6) return null;
  if (cents > 99_999_999_999) return null;
  return cents;
}

/** yyyy-mm-dd → a date-only value (UTC midnight), or today. */
function dateOnly(value: Date | string | null | undefined) {
  if (!value) return new Date(`${toISODate(new Date())}T00:00:00Z`);
  if (value instanceof Date) return new Date(`${toISODate(value)}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new PaymentError("Enter the date as yyyy-mm-dd.");
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new PaymentError("Enter a valid date.");
  return d;
}

/**
 * Client credit available, per currency, in cents. Reads inside the given
 * transaction so callers holding the client lock see a consistent figure.
 */
export async function clientCreditCents(db: Tx | typeof prisma, clientId: string) {
  const rows = await db.$queryRaw<{ currency: string; cents: bigint | number | null }[]>`
    SELECT "currency", ROUND(SUM("amount") * 100)::bigint AS "cents" FROM (
      SELECT p."currency", p."amount"
        FROM "Payment" p JOIN "Invoice" i ON i."id" = p."invoiceId"
        WHERE p."clientId" = ${clientId} AND i."kind" = 'DEPOSIT'
      UNION ALL
      SELECT "currency", "amount" FROM "CreditNote"
        WHERE "clientId" = ${clientId} AND "status" = 'ISSUED'
      UNION ALL
      SELECT "currency", GREATEST(0, "amountPaid" + "creditApplied" - "total") FROM "Invoice"
        WHERE "clientId" = ${clientId} AND "kind" = 'STANDARD' AND "status" <> 'VOID'
      UNION ALL
      SELECT "currency", -"amount" FROM "CreditApplication" WHERE "clientId" = ${clientId}
    ) t
    GROUP BY "currency"`;
  const credit = new Map<string, number>();
  for (const r of rows) {
    const cents = Number(r.cents ?? 0);
    if (cents !== 0) credit.set(r.currency, cents);
  }
  return credit;
}

/** Available client credit as [{ currency, amount }], for display and the API. */
export async function clientCredit(clientId: string) {
  const credit = await clientCreditCents(prisma, clientId);
  return [...credit.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([currency, cents]) => ({ currency, amount: cents / 100 }));
}

/** Re-sums an invoice's payments and credit and moves it between SENT and
 * PAID to match. Call with the invoice locked. */
async function settle(tx: Tx, invoiceId: string) {
  const before = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const [paid, credited] = await Promise.all([
    tx.payment.aggregate({ where: { invoiceId }, _sum: { amount: true } }),
    tx.creditApplication.aggregate({ where: { invoiceId }, _sum: { amount: true } }),
  ]);
  const amountPaid = toCents(paid._sum.amount ?? 0) / 100;
  const creditApplied = toCents(credited._sum.amount ?? 0) / 100;
  const balance = balanceCents({ total: before.total, amountPaid, creditApplied });

  let status = before.status;
  let paidAt = before.paidAt;
  if (before.status === "SENT" && balance <= 0) {
    status = "PAID";
    paidAt = new Date();
  } else if (before.status === "PAID" && balance > 0) {
    status = "SENT";
    paidAt = null;
  }
  const after = await tx.invoice.update({
    where: { id: invoiceId },
    data: { amountPaid, creditApplied, status, paidAt },
  });
  return {
    invoice: after,
    becamePaid: before.status !== "PAID" && after.status === "PAID",
    reopened: before.status === "PAID" && after.status === "SENT",
  };
}

/** Alerts and refiling after an invoice's balance changed (outside the
 * transaction; never throws). */
async function afterBalanceChange(
  invoiceId: string,
  change: { becamePaid: boolean; paymentCents?: number }
) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { client: { select: { name: true } }, org: { select: { id: true, name: true, slackWebhookUrl: true } } },
    });
    if (!invoice) return;
    if (change.becamePaid) {
      // Also files the paid invoice's PDF.
      await notifyInvoiceStatusChange(invoice.org, invoice, "PAID");
      return;
    }
    if (change.paymentCents) {
      await sendAlert({
        orgId: invoice.orgId,
        event: "PAYMENT_RECEIVED",
        message: `${money(change.paymentCents, invoice.currency)} received for invoice ${invoice.number} from ${invoice.client.name} (${money(Math.max(0, balanceCents(invoice)), invoice.currency)} still due).`,
        link: `/invoices/${invoice.id}`,
      });
    }
    const { fileInvoice } = await import("@/lib/services/filing");
    await fileInvoice(invoice.id);
  } catch (err) {
    console.warn("[payments] Follow-up after a balance change failed", invoiceId, err);
  }
}

function notOpenMessage(status: string) {
  switch (status) {
    case "DRAFT":
      return "Send the invoice before recording a payment.";
    case "PAID":
      return "This invoice is already paid in full.";
    case "VOID":
      return "This invoice is void.";
    default:
      return "This invoice isn't open for payment.";
  }
}

export type RecordPaymentInput = {
  invoiceId: string;
  /** Currency units, e.g. 1250.5. */
  amount: number | string;
  /** yyyy-mm-dd or a Date; defaults to today. */
  receivedAt?: Date | string | null;
  source?: PaymentSource;
  method?: string | null;
  reference?: string | null;
  note?: string | null;
  /** Idempotency key for integrations (e.g. "stripe:pi_123"): recording the
   * same one twice returns the first payment instead. */
  externalId?: string | null;
  /** Integrations record what actually arrived, even past the balance (or on
   * an invoice already marked paid); the excess becomes client credit.
   * People can't overpay by hand. */
  allowOverpayment?: boolean;
};

/**
 * Records money received against an invoice. The invoice becomes PAID once
 * its balance reaches zero; INVOICE_PAID fires then, PAYMENT_RECEIVED for a
 * part payment. Throws PaymentError when it can't be recorded.
 */
export async function recordPayment(ctx: PaymentContext, input: RecordPaymentInput) {
  const amountCents = parseAmountCents(input.amount);
  if (amountCents === null) throw new PaymentError("Enter an amount greater than zero, to the cent.");
  const receivedAt = dateOnly(input.receivedAt);
  const clip = (s: string | null | undefined, max: number) => (s?.trim() ? s.trim().slice(0, max) : null);

  const result = await prisma
    .$transaction(async (tx) => {
      if (input.externalId) {
        const existing = await tx.payment.findUnique({ where: { externalId: input.externalId } });
        if (existing) return { duplicate: true as const, payment: existing };
      }
      const found = await tx.invoice.findFirst({
        where: { id: input.invoiceId, orgId: ctx.orgId },
        select: { clientId: true },
      });
      if (!found) throw new PaymentError("Invoice not found.");
      await lockClient(tx, found.clientId);
      await lockInvoice(tx, input.invoiceId);
      if (input.externalId) {
        // Re-checked under the lock: a concurrent delivery may have won.
        const existing = await tx.payment.findUnique({ where: { externalId: input.externalId } });
        if (existing) return { duplicate: true as const, payment: existing };
      }
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId } });
      const open = invoice.status === "SENT" || (input.allowOverpayment && invoice.status === "PAID");
      if (!open) throw new PaymentError(notOpenMessage(invoice.status));
      const balance = balanceCents(invoice);
      if (!input.allowOverpayment && amountCents > balance) {
        throw new PaymentError(
          `That's more than the ${money(Math.max(0, balance), invoice.currency)} still due on this invoice.`
        );
      }

      const payment = await tx.payment.create({
        data: {
          orgId: ctx.orgId,
          invoiceId: invoice.id,
          clientId: invoice.clientId,
          amount: amountCents / 100,
          currency: invoice.currency,
          receivedAt,
          source: input.source ?? "MANUAL",
          method: clip(input.method, 100),
          reference: clip(input.reference, 200),
          note: clip(input.note, 1000),
          externalId: input.externalId ?? null,
          recordedById: ctx.actorId,
        },
      });
      const settled = await settle(tx, invoice.id);
      return { duplicate: false as const, payment, ...settled };
    })
    .catch((err) => {
      // Two deliveries racing past both checks: the unique key decides.
      if (
        input.externalId &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return prisma.payment
          .findUniqueOrThrow({ where: { externalId: input.externalId } })
          .then((payment) => ({ duplicate: true as const, payment }));
      }
      throw err;
    });

  if (result.duplicate) {
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: result.payment.invoiceId } });
    return { payment: result.payment, invoice, duplicate: true, becamePaid: false };
  }
  await afterBalanceChange(result.invoice.id, { becamePaid: result.becamePaid, paymentCents: amountCents });
  return { payment: result.payment, invoice: result.invoice, duplicate: false, becamePaid: result.becamePaid };
}

/** "Mark as paid": records a payment for whatever is still due. A sent
 * invoice with nothing left to pay (fully credited, or a zero total) is just
 * marked paid. */
export async function markInvoicePaidInFull(
  ctx: PaymentContext,
  invoiceId: string,
  opts: { method?: string | null; receivedAt?: Date | string | null } = {}
) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, orgId: ctx.orgId } });
  if (!invoice) throw new PaymentError("Invoice not found.");
  if (invoice.status !== "SENT") {
    throw new PaymentError(
      invoice.status === "PAID" ? "This invoice is already paid in full." : "Only sent invoices can be marked paid."
    );
  }
  const balance = balanceCents(invoice);
  if (balance <= 0) {
    const settled = await prisma.$transaction(async (tx) => {
      await lockClient(tx, invoice.clientId);
      await lockInvoice(tx, invoiceId);
      return settle(tx, invoiceId);
    });
    if (settled.becamePaid) await afterBalanceChange(invoiceId, { becamePaid: true });
    return { payment: null, invoice: settled.invoice, duplicate: false, becamePaid: settled.becamePaid };
  }
  const result = await recordPayment(ctx, {
    invoiceId,
    amount: balance / 100,
    receivedAt: opts.receivedAt,
    method: opts.method,
  });
  // Keep the invoice's own "payment method" field for older views/exports.
  if (opts.method?.trim()) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { paymentMethod: opts.method.trim().slice(0, 100) } });
  }
  return result;
}

/** Fails (rolling back) if the client's credit in this currency went
 * negative — i.e. credit that was already spent is being taken away. */
async function assertCreditNotOverspent(tx: Tx, clientId: string, currency: string, message: string) {
  const credit = await clientCreditCents(tx, clientId);
  if ((credit.get(currency) ?? 0) < 0) throw new PaymentError(message);
}

/**
 * Deletes a payment recorded by mistake; the invoice reopens if it was paid.
 * Audited like every Payment write. A deposit payment whose credit has
 * already been applied elsewhere can't be removed until that's undone.
 */
export async function deletePayment(ctx: PaymentContext, paymentId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id: paymentId, orgId: ctx.orgId } });
    if (!payment) throw new PaymentError("Payment not found.");
    await lockClient(tx, payment.clientId);
    await lockInvoice(tx, payment.invoiceId);
    await tx.payment.delete({ where: { id: payment.id } });
    await assertCreditNotOverspent(
      tx,
      payment.clientId,
      payment.currency,
      "Credit from this payment has already been applied to other invoices. Remove that credit from them first."
    );
    const settled = await settle(tx, payment.invoiceId);
    return { payment, ...settled };
  });
  await afterBalanceChange(result.invoice.id, { becamePaid: false });
  return result;
}

/**
 * Spends client credit on a sent invoice. Credit only applies in the
 * invoice's currency, never to a deposit invoice, and never past the
 * balance.
 */
export async function applyCredit(
  ctx: PaymentContext,
  input: { invoiceId: string; amount: number | string; note?: string | null }
) {
  const amountCents = parseAmountCents(input.amount);
  if (amountCents === null) throw new PaymentError("Enter an amount greater than zero, to the cent.");
  const result = await prisma.$transaction(async (tx) => {
    const found = await tx.invoice.findFirst({
      where: { id: input.invoiceId, orgId: ctx.orgId },
      select: { clientId: true },
    });
    if (!found) throw new PaymentError("Invoice not found.");
    await lockClient(tx, found.clientId);
    await lockInvoice(tx, input.invoiceId);
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId } });
    return applyCreditLocked(tx, ctx, invoice, amountCents, input.note ?? null);
  });
  await afterBalanceChange(result.invoice.id, { becamePaid: result.becamePaid });
  return result;
}

async function applyCreditLocked(
  tx: Tx,
  ctx: PaymentContext,
  invoice: { id: string; clientId: string; kind: string; status: string; currency: string; total: Prisma.Decimal; amountPaid: Prisma.Decimal; creditApplied: Prisma.Decimal },
  amountCents: number,
  note: string | null
) {
  if (invoice.kind === "DEPOSIT") throw new PaymentError("Credit can't be applied to a deposit invoice.");
  if (invoice.status !== "SENT") {
    throw new PaymentError("Credit can only be applied to a sent invoice that isn't paid in full.");
  }
  const balance = balanceCents(invoice);
  if (amountCents > balance) {
    throw new PaymentError(`That's more than the ${money(Math.max(0, balance), invoice.currency)} still due on this invoice.`);
  }
  const available = (await clientCreditCents(tx, invoice.clientId)).get(invoice.currency) ?? 0;
  if (amountCents > available) {
    throw new PaymentError(
      available > 0
        ? `This client only has ${money(available, invoice.currency)} of credit available.`
        : `This client has no ${invoice.currency} credit available.`
    );
  }
  const application = await tx.creditApplication.create({
    data: {
      orgId: ctx.orgId,
      clientId: invoice.clientId,
      invoiceId: invoice.id,
      amount: amountCents / 100,
      currency: invoice.currency,
      note: note?.trim() ? note.trim().slice(0, 500) : null,
      appliedById: ctx.actorId,
    },
  });
  const settled = await settle(tx, invoice.id);
  return { application, ...settled };
}

/** Takes applied credit back off an invoice (it returns to the client's
 * available credit); the invoice reopens if that leaves a balance. */
export async function removeCreditApplication(ctx: PaymentContext, applicationId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const application = await tx.creditApplication.findFirst({ where: { id: applicationId, orgId: ctx.orgId } });
    if (!application) throw new PaymentError("Credit application not found.");
    await lockClient(tx, application.clientId);
    await lockInvoice(tx, application.invoiceId);
    await tx.creditApplication.delete({ where: { id: application.id } });
    const settled = await settle(tx, application.invoiceId);
    return { application, ...settled };
  });
  await afterBalanceChange(result.invoice.id, { becamePaid: false });
  return result;
}

export type IssueCreditNoteInput = {
  clientId: string;
  /** Optional invoice it's issued against (must be this client's). */
  invoiceId?: string | null;
  amount: number | string;
  reason: string;
  issueDate?: Date | string | null;
  /** Apply it to the invoice straight away (up to the invoice's balance). */
  applyToInvoice?: boolean;
};

/** Issues a credit note (CN-0001, …): credit the client can spend on any
 * of their sent invoices in the same currency. */
export async function issueCreditNote(ctx: PaymentContext, input: IssueCreditNoteInput) {
  const amountCents = parseAmountCents(input.amount);
  if (amountCents === null) throw new PaymentError("Enter an amount greater than zero, to the cent.");
  const reason = input.reason?.trim();
  if (!reason) throw new PaymentError("Give a reason for the credit note.");
  if (reason.length > 2000) throw new PaymentError("Keep the reason under 2,000 characters.");
  const issueDate = dateOnly(input.issueDate);

  const result = await prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({ where: { id: input.clientId, orgId: ctx.orgId } });
    if (!client) throw new PaymentError("Client not found.");
    const linked = input.invoiceId
      ? await tx.invoice.findFirst({ where: { id: input.invoiceId, orgId: ctx.orgId, clientId: client.id } })
      : null;
    if (input.invoiceId && !linked) throw new PaymentError("That invoice isn't one of this client's.");
    if (linked && (linked.status === "DRAFT" || linked.status === "VOID")) {
      throw new PaymentError("Credit notes can only reference a sent or paid invoice.");
    }

    await lockClient(tx, client.id);
    if (linked) await lockInvoice(tx, linked.id);
    const org = await tx.organization.update({
      where: { id: ctx.orgId },
      data: { nextCreditNoteNumber: { increment: 1 } },
      select: { nextCreditNoteNumber: true, defaultCurrency: true },
    });
    const number = `CN-${String(org.nextCreditNoteNumber - 1).padStart(4, "0")}`;
    const currency = linked?.currency ?? org.defaultCurrency;
    const note = await tx.creditNote.create({
      data: {
        orgId: ctx.orgId,
        clientId: client.id,
        invoiceId: linked?.id ?? null,
        number,
        amount: amountCents / 100,
        currency,
        reason,
        issueDate,
        createdById: ctx.actorId,
      },
    });

    let applied: Awaited<ReturnType<typeof applyCreditLocked>> | null = null;
    if (input.applyToInvoice && linked && linked.status === "SENT" && linked.kind === "STANDARD") {
      const fresh = await tx.invoice.findUniqueOrThrow({ where: { id: linked.id } });
      const toApply = Math.min(amountCents, balanceCents(fresh));
      if (toApply > 0) applied = await applyCreditLocked(tx, ctx, fresh, toApply, `Credit note ${number}`);
    }
    return { creditNote: note, applied };
  });
  if (result.applied) {
    await afterBalanceChange(result.applied.invoice.id, { becamePaid: result.applied.becamePaid });
  }
  return result;
}

/** Voids a credit note. Only while its credit hasn't been spent: if the
 * client's credit would go negative, remove the credit from invoices first. */
export async function voidCreditNote(ctx: PaymentContext, creditNoteId: string) {
  return prisma.$transaction(async (tx) => {
    const note = await tx.creditNote.findFirst({ where: { id: creditNoteId, orgId: ctx.orgId } });
    if (!note) throw new PaymentError("Credit note not found.");
    if (note.status === "VOID") throw new PaymentError("This credit note is already void.");
    await lockClient(tx, note.clientId);
    const updated = await tx.creditNote.update({
      where: { id: note.id },
      data: { status: "VOID", voidedAt: new Date() },
    });
    await assertCreditNotOverspent(
      tx,
      note.clientId,
      note.currency,
      "This credit has already been applied to invoices. Remove it from them first, then void the credit note."
    );
    return updated;
  });
}

export type DepositInvoiceContext = {
  orgId: string;
  defaultCurrency: string;
  actorId: string;
  role: Role;
};

export type DepositInvoiceInput = {
  clientId: string;
  /** Optional: names the deposit, keeps a confidential project's deposit
   * hidden like its other invoices, and is the base for `percent`. */
  projectId?: string | null;
  description?: string | null;
  /** A fixed amount, or… */
  amount?: number | string | null;
  /** …a percentage of the project's flat fee (e.g. 50 for "50% up front"). */
  percent?: number | string | null;
  issueDate: string;
  dueDate?: string | null;
  paymentTerms?: PaymentTermsValue | null;
  notes?: string | null;
};

/**
 * Creates a draft deposit (advance) invoice with one line. Once paid, its
 * payments become client credit to apply to later invoices — the deposit
 * itself is never "used up" by the invoice it was for.
 */
export async function createDepositInvoice(ctx: DepositInvoiceContext, input: DepositInvoiceInput) {
  const client = await prisma.client.findFirst({ where: { id: input.clientId, orgId: ctx.orgId } });
  if (!client) throw new PaymentError("Client not found.");
  const project = input.projectId
    ? await prisma.project.findFirst({
        where: {
          id: input.projectId,
          orgId: ctx.orgId,
          clientId: client.id,
          ...projectVisibilityWhere(ctx.actorId, ctx.role),
        },
      })
    : null;
  if (input.projectId && !project) throw new PaymentError("Project not found for this client.");

  let amountCents: number | null;
  const percentRaw = input.percent === "" ? null : input.percent;
  if (percentRaw != null) {
    const percent = Number(percentRaw);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      throw new PaymentError("Enter a percentage between 0 and 100.");
    }
    if (!project?.flatFeeAmount) {
      throw new PaymentError("A percentage needs a project with a flat fee. Enter an amount instead.");
    }
    amountCents = Math.round(toCents(project.flatFeeAmount) * (percent / 100));
    if (amountCents <= 0) throw new PaymentError("That works out to nothing. Enter an amount instead.");
  } else {
    amountCents = parseAmountCents(input.amount);
    if (amountCents === null) throw new PaymentError("Enter an amount greater than zero, to the cent.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) throw new PaymentError("Enter the issue date as yyyy-mm-dd.");
  let paymentTerms: PaymentTermsValue | undefined = input.paymentTerms ?? undefined;
  if (!paymentTerms) {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: ctx.orgId },
      select: { defaultPaymentTerms: true },
    });
    paymentTerms = resolvePaymentTerms({
      project: project?.paymentTerms as DefaultPaymentTerms | null | undefined,
      client: client.paymentTerms as DefaultPaymentTerms | null,
      org: org.defaultPaymentTerms as DefaultPaymentTerms,
    });
  }
  const dueDate = input.dueDate || dueDateFor(input.issueDate, paymentTerms);
  if (!dueDate) throw new PaymentError("Custom payment terms need a due date.");

  const description =
    input.description?.trim().slice(0, 500) ||
    (project ? `${project.name} — Deposit` : "Deposit");
  const amount = round2(amountCents / 100);

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.update({
      where: { id: ctx.orgId },
      data: { nextInvoiceNumber: { increment: 1 } },
      select: { invoicePrefix: true, nextInvoiceNumber: true },
    });
    const number = `${org.invoicePrefix}-${String(org.nextInvoiceNumber - 1).padStart(4, "0")}`;
    return tx.invoice.create({
      data: {
        orgId: ctx.orgId,
        clientId: client.id,
        number,
        kind: "DEPOSIT",
        status: "DRAFT",
        issueDate: new Date(input.issueDate),
        dueDate: new Date(dueDate),
        paymentTerms,
        currency: ctx.defaultCurrency,
        notes: input.notes?.trim() ? input.notes.trim().slice(0, 2000) : null,
        subtotal: amount,
        taxAmount: 0,
        total: amount,
        lineItems: {
          create: [{ description, quantity: 1, rate: amount, amount, projectId: project?.id ?? null, sortOrder: 0 }],
        },
      },
    });
  });
}

/** An invoice's payments and applied credit, newest first, for display and
 * the API. Callers check the invoice is visible to the viewer first. */
export async function invoiceLedger(invoiceId: string) {
  const [payments, credits, creditNotes] = await Promise.all([
    prisma.payment.findMany({
      where: { invoiceId },
      include: { recordedBy: { select: { name: true } } },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.creditApplication.findMany({
      where: { invoiceId },
      include: { appliedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.creditNote.findMany({ where: { invoiceId }, orderBy: { createdAt: "desc" } }),
  ]);
  return { payments, credits, creditNotes };
}

/** API/MCP shape of an invoice's money: amounts as strings to the cent,
 * like the other decimal fields. */
export function invoiceMoneyFields(invoice: {
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  creditApplied: Prisma.Decimal;
  status: string;
}) {
  // A void invoice owes nothing.
  const balance = invoice.status === "VOID" ? 0 : Math.max(0, balanceCents(invoice));
  return {
    amountPaid: (toCents(invoice.amountPaid) / 100).toFixed(2),
    creditApplied: (toCents(invoice.creditApplied) / 100).toFixed(2),
    balanceDue: (balance / 100).toFixed(2),
  };
}

/** Credit notes this actor can see: all for owners/admins; for members,
 * none issued against an invoice they can't see (one touching a
 * confidential project they aren't on). */
export function creditNoteVisibilityWhere(userId: string, role: Role) {
  if (role === "OWNER" || role === "ADMIN") return {};
  return { OR: [{ invoiceId: null }, { invoice: invoiceVisibilityWhere(userId, role) }] };
}
