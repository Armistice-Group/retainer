"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { generateInvoiceSchema } from "@/lib/validations/invoice";
import { notify, getOrgAdminUserIds, getOrgOwnerEmail } from "@/lib/notifications";
import { postToSlack } from "@/lib/slack";
import { sendEmail } from "@/lib/email";
import { InvoiceStatusEmail } from "@/emails/invoice-status-email";
import { formatCurrency } from "@/lib/format";
import { getOrigin } from "@/lib/url";
import {
  generateInvoice,
  recomputeInvoiceTotals,
  round2,
  InvoiceError,
} from "@/lib/services/invoices";
import { pushInvoiceToQuickBooks, QuickBooksError } from "@/lib/services/quickbooks-sync";
import { getInvoiceGateBlockers, type InvoiceGateBlocker } from "@/lib/services/code-health";
import type { ActionState } from "@/actions/auth";

export async function generateInvoiceAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await requireOrgContext();

  const parsed = generateInvoiceSchema.safeParse({
    clientId: formData.get("clientId"),
    timeEntryIds: formData.getAll("timeEntryIds"),
    milestoneIds: formData.getAll("milestoneIds"),
    issueDate: formData.get("issueDate"),
    dueDate: formData.get("dueDate"),
    taxRate: formData.get("taxRate") || org.defaultTaxRate.toString(),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let invoice;
  try {
    invoice = await generateInvoice(
      { orgId: org.id, defaultCurrency: org.defaultCurrency },
      parsed.data
    );
  } catch (err) {
    if (err instanceof InvoiceError) return { error: err.message };
    throw err;
  }

  revalidatePath("/invoices");
  revalidatePath("/time");
  redirect(`/invoices/${invoice.id}`);
}

export async function updateInvoiceMetaAction(invoiceId: string, formData: FormData) {
  const { org } = await requireOrgContext();

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.orgId !== org.id) throw new Error("Invoice not found.");
  if (invoice.status !== "DRAFT") throw new Error("Only draft invoices can be edited.");

  const issueDate = formData.get("issueDate") as string;
  const dueDate = formData.get("dueDate") as string;
  const taxRate = Number(formData.get("taxRate"));
  const notes = (formData.get("notes") as string) || null;

  if (!issueDate || !dueDate || Number.isNaN(taxRate)) {
    throw new Error("Please fill in all required fields.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { issueDate: new Date(issueDate), dueDate: new Date(dueDate), taxRate, notes },
    });
    await recomputeInvoiceTotals(tx, invoiceId);
  });

  revalidatePath(`/invoices/${invoiceId}`);
}

export async function updateLineItemAction(
  lineItemId: string,
  invoiceId: string,
  formData: FormData
) {
  const { org } = await requireOrgContext();
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.orgId !== org.id) throw new Error("Invoice not found.");
  if (invoice.status !== "DRAFT") throw new Error("Only draft invoices can be edited.");

  const description = formData.get("description") as string;
  const quantity = Number(formData.get("quantity"));
  const rate = Number(formData.get("rate"));

  if (!description || Number.isNaN(quantity) || Number.isNaN(rate)) {
    throw new Error("Invalid line item values.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.update({
      where: { id: lineItemId, invoiceId },
      data: { description, quantity: round2(quantity), rate: round2(rate), amount: round2(quantity * rate) },
    });
    await recomputeInvoiceTotals(tx, invoiceId);
  });

  revalidatePath(`/invoices/${invoiceId}`);
}

export async function addManualLineItemAction(invoiceId: string, formData: FormData) {
  const { org } = await requireOrgContext();
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lineItems: true },
  });
  if (!invoice || invoice.orgId !== org.id) throw new Error("Invoice not found.");
  if (invoice.status !== "DRAFT") throw new Error("Only draft invoices can be edited.");

  const description = formData.get("description") as string;
  const quantity = Number(formData.get("quantity"));
  const rate = Number(formData.get("rate"));

  if (!description || Number.isNaN(quantity) || Number.isNaN(rate)) {
    throw new Error("Invalid line item values.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.create({
      data: {
        invoiceId,
        description,
        quantity: round2(quantity),
        rate: round2(rate),
        amount: round2(quantity * rate),
        sortOrder: invoice.lineItems.length,
      },
    });
    await recomputeInvoiceTotals(tx, invoiceId);
  });

  revalidatePath(`/invoices/${invoiceId}`);
}

export async function removeLineItemAction(lineItemId: string, invoiceId: string) {
  const { org } = await requireOrgContext();
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.orgId !== org.id) throw new Error("Invoice not found.");
  if (invoice.status !== "DRAFT") throw new Error("Only draft invoices can be edited.");

  await prisma.$transaction(async (tx) => {
    await tx.timeEntry.updateMany({
      where: { invoiceLineItemId: lineItemId },
      data: { invoiceLineItemId: null },
    });
    await tx.milestone.updateMany({
      where: { invoiceLineItemId: lineItemId },
      data: { invoiceLineItemId: null, invoicedAt: null },
    });
    await tx.invoiceLineItem.delete({ where: { id: lineItemId, invoiceId } });
    await recomputeInvoiceTotals(tx, invoiceId);
  });

  revalidatePath(`/invoices/${invoiceId}`);
}

async function notifyInvoiceStatusChange(
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

export async function setInvoiceStatusAction(
  invoiceId: string,
  status: "DRAFT" | "SENT" | "PAID" | "VOID"
) {
  const { org } = await requireOrgContext();
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true },
  });
  if (!invoice || invoice.orgId !== org.id) throw new Error("Invoice not found.");

  await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");

  if (status === "SENT" || status === "PAID") {
    await notifyInvoiceStatusChange(org, invoice, status);
  }
}

export type SendInvoiceState = {
  error?: string;
  blockers?: InvoiceGateBlocker[];
} | null;

/** Same as setInvoiceStatusAction(id, "SENT"), but checks each gated
 * project's latest AI Code Health scan first. A blocked send isn't silently
 * refused — the caller can resubmit with `override=true` to send anyway. */
export async function sendInvoiceAction(
  invoiceId: string,
  _prevState: SendInvoiceState,
  formData: FormData
): Promise<SendInvoiceState> {
  const { org } = await requireOrgContext();
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true },
  });
  if (!invoice || invoice.orgId !== org.id) return { error: "Invoice not found." };
  if (invoice.status !== "DRAFT") return { error: "Only draft invoices can be sent." };

  const lineItemCount = await prisma.invoiceLineItem.count({ where: { invoiceId } });
  if (lineItemCount === 0) {
    return { error: "Add at least one line item before sending." };
  }

  const override = formData.get("override") === "true";
  if (!override) {
    const blockers = await getInvoiceGateBlockers(invoiceId);
    if (blockers.length > 0) return { blockers };
  }

  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "SENT" } });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  await notifyInvoiceStatusChange(org, invoice, "SENT");

  return null;
}

export async function deleteInvoiceAction(invoiceId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.orgId !== org.id) throw new Error("Invoice not found.");
  if (invoice.status !== "DRAFT") throw new Error("Only draft invoices can be deleted.");

  await prisma.$transaction(async (tx) => {
    await tx.timeEntry.updateMany({
      where: { invoiceLineItem: { invoiceId } },
      data: { invoiceLineItemId: null },
    });
    await tx.milestone.updateMany({
      where: { invoiceLineItem: { invoiceId } },
      data: { invoiceLineItemId: null, invoicedAt: null },
    });
    await tx.invoice.delete({ where: { id: invoiceId } });
  });

  revalidatePath("/invoices");
  redirect("/invoices");
}

// Signature matches useActionState's (prevState, formData) contract even though this action ignores both.
export async function pushToQuickBooksAction(
  invoiceId: string,
  _prevState: ActionState, // eslint-disable-line @typescript-eslint/no-unused-vars
  _formData: FormData // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<ActionState> {
  const { org } = await requireOrgContext();

  try {
    await pushInvoiceToQuickBooks(org.id, invoiceId);
  } catch (err) {
    if (err instanceof QuickBooksError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/invoices/${invoiceId}`);
  return null;
}
