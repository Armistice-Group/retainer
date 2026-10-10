"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { invoiceVisibilityWhere } from "@/lib/project-access";
import { generateInvoiceSchema, paymentTermsValues } from "@/lib/validations/invoice";
import {
  generateInvoice,
  recomputeInvoiceTotals,
  round2,
  InvoiceError,
  notifyInvoiceStatusChange,
  invoiceStatusChangeError,
} from "@/lib/services/invoices";
import { fileInvoice } from "@/lib/services/filing";
import {
  pushInvoiceToQuickBooks,
  syncInvoiceStatusFromQuickBooks,
  QuickBooksError,
} from "@/lib/services/quickbooks-sync";
import type { ActionState } from "@/actions/auth";
import type { Role } from "@/generated/prisma/client";
import {
  emailInvoice,
  invoiceLinks,
  InvoiceDeliveryError,
} from "@/lib/services/invoice-delivery";

/**
 * Where-clause for an invoice this actor may act on: in their org and visible
 * to them (members don't see invoices touching confidential projects they
 * aren't on) — anything else reads as "not found".
 */
function visibleInvoice(invoiceId: string, orgId: string, userId: string, role: Role) {
  return { id: invoiceId, orgId, ...invoiceVisibilityWhere(userId, role) };
}

export async function generateInvoiceAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();

  const parsed = generateInvoiceSchema.safeParse({
    clientId: formData.get("clientId"),
    timeEntryIds: formData.getAll("timeEntryIds"),
    milestoneIds: formData.getAll("milestoneIds"),
    expenseIds: formData.getAll("expenseIds"),
    issueDate: formData.get("issueDate"),
    dueDate: formData.get("dueDate"),
    paymentTerms: formData.get("paymentTerms") || undefined,
    poNumber: formData.get("poNumber"),
    taxRate: formData.get("taxRate") || org.defaultTaxRate.toString(),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let invoice;
  try {
    invoice = await generateInvoice(
      { orgId: org.id, defaultCurrency: org.defaultCurrency, actorId: user.id, role },
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
  const { org, user, role } = await requireOrgContext();

  const invoice = await prisma.invoice.findFirst({ where: visibleInvoice(invoiceId, org.id, user.id, role) });
  if (!invoice || invoice.orgId !== org.id) throw new Error("Invoice not found.");
  if (invoice.status !== "DRAFT") throw new Error("Only draft invoices can be edited.");

  const issueDate = formData.get("issueDate") as string;
  const dueDate = formData.get("dueDate") as string;
  const taxRate = Number(formData.get("taxRate"));
  const notes = (formData.get("notes") as string) || null;
  const paymentTermsRaw = formData.get("paymentTerms") as string;
  const paymentTerms = paymentTermsValues.includes(
    paymentTermsRaw as (typeof paymentTermsValues)[number]
  )
    ? (paymentTermsRaw as (typeof paymentTermsValues)[number])
    : "NET30";
  const poNumber = (formData.get("poNumber") as string) || null;

  if (!issueDate || !dueDate || Number.isNaN(taxRate)) {
    throw new Error("Please fill in all required fields.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        issueDate: new Date(issueDate),
        dueDate: new Date(dueDate),
        taxRate,
        notes,
        paymentTerms,
        poNumber,
      },
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
  const { org, user, role } = await requireOrgContext();
  const invoice = await prisma.invoice.findFirst({ where: visibleInvoice(invoiceId, org.id, user.id, role) });
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
  const { org, user, role } = await requireOrgContext();
  const invoice = await prisma.invoice.findFirst({
    where: visibleInvoice(invoiceId, org.id, user.id, role),
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
  const { org, user, role } = await requireOrgContext();
  const invoice = await prisma.invoice.findFirst({ where: visibleInvoice(invoiceId, org.id, user.id, role) });
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

export async function setInvoiceStatusAction(
  invoiceId: string,
  status: "DRAFT" | "SENT" | "PAID" | "VOID",
  formData?: FormData
) {
  const { org, user, role } = await requireOrgContext();
  const invoice = await prisma.invoice.findFirst({
    where: visibleInvoice(invoiceId, org.id, user.id, role),
    include: { client: true },
  });
  if (!invoice || invoice.orgId !== org.id) throw new Error("Invoice not found.");
  // Any member can send, mark paid or void in the app (the invoice page shows
  // them those buttons); keys need owner/admin, see the MCP tools.
  const statusError = invoiceStatusChangeError(invoice.status, status);
  if (statusError) throw new Error(statusError);
  if (status === "SENT") {
    const lineItemCount = await prisma.invoiceLineItem.count({ where: { invoiceId } });
    if (lineItemCount === 0) throw new Error("Add at least one line item before sending.");
  }

  const paymentMethod =
    status === "PAID" ? (formData?.get("paymentMethod") as string) || null : undefined;

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status,
      // invoiceStatusChangeError only allows SENT → PAID and PAID → nothing, so
      // paidAt only ever needs setting here.
      ...(status === "PAID" ? { paidAt: new Date() } : {}),
      ...(paymentMethod !== undefined ? { paymentMethod } : {}),
    },
  });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");

  if (status === "SENT" || status === "PAID") {
    await notifyInvoiceStatusChange(org, invoice, status);
  } else if (status === "VOID") {
    // A filed copy is refreshed so it shows VOID.
    await fileInvoice(invoiceId);
  }
}

export type SendInvoiceState = {
  error?: string;
} | null;

// Signature matches useActionState's (prevState, formData) contract even though this action ignores both.
export async function sendInvoiceAction(
  invoiceId: string,
  _prevState: SendInvoiceState, // eslint-disable-line @typescript-eslint/no-unused-vars
  _formData: FormData // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<SendInvoiceState> {
  const { org, user, role } = await requireOrgContext();
  const invoice = await prisma.invoice.findFirst({
    where: visibleInvoice(invoiceId, org.id, user.id, role),
    include: { client: true },
  });
  if (!invoice || invoice.orgId !== org.id) return { error: "Invoice not found." };
  if (invoice.status !== "DRAFT") return { error: "Only draft invoices can be sent." };

  const lineItemCount = await prisma.invoiceLineItem.count({ where: { invoiceId } });
  if (lineItemCount === 0) {
    return { error: "Add at least one line item before sending." };
  }

  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "SENT" } });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  await notifyInvoiceStatusChange(org, invoice, "SENT");

  return null;
}

export async function deleteInvoiceAction(invoiceId: string) {
  const { org, user, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const invoice = await prisma.invoice.findFirst({ where: visibleInvoice(invoiceId, org.id, user.id, role) });
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
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  try {
    await pushInvoiceToQuickBooks(org.id, invoiceId);
  } catch (err) {
    if (err instanceof QuickBooksError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/invoices/${invoiceId}`);
  return null;
}

// Signature matches useActionState's (prevState, formData) contract even though this action ignores both.
export async function syncQuickBooksStatusAction(
  invoiceId: string,
  _prevState: ActionState, // eslint-disable-line @typescript-eslint/no-unused-vars
  _formData: FormData // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<ActionState> {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  try {
    await syncInvoiceStatusFromQuickBooks(org.id, invoiceId);
  } catch (err) {
    if (err instanceof QuickBooksError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/invoices/${invoiceId}`);
  return null;
}

export async function emailInvoiceAction(
  invoiceId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();
  if (role !== "OWNER" && role !== "ADMIN") return { error: "Only owners and admins can send invoices." };
  const to = [
    ...formData.getAll("to").map(String),
    ...String(formData.get("extra") ?? "").split(/[\s,;]+/),
  ].filter(Boolean);
  try {
    await emailInvoice({ orgId: org.id, actorId: user.id }, invoiceId, {
      to,
      message: (formData.get("message") as string | null) ?? null,
    });
  } catch (err) {
    if (err instanceof InvoiceDeliveryError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { saved: true };
}

/** The client-facing link for a sent invoice, for sharing by hand. */
export async function invoiceClientLinkAction(invoiceId: string): Promise<{ url?: string; error?: string }> {
  const { org, user, role } = await requireOrgContext();
  const invoice = await prisma.invoice.findFirst({ where: visibleInvoice(invoiceId, org.id, user.id, role) });
  if (!invoice || invoice.orgId !== org.id) return { error: "Invoice not found." };
  if (invoice.status === "DRAFT") return { error: "Send the invoice first." };
  const { viewUrl } = await invoiceLinks(invoiceId);
  return { url: viewUrl };
}

export async function saveReminderSettingsAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);
  const parts = String(formData.get("reminderDays") ?? "")
    .split(/[\s,;]+/)
    .filter(Boolean);
  const days = parts.map(Number);
  if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 365) || days.length > 10) {
    return { fieldErrors: { reminderDays: ["Use up to 10 whole numbers of days, 1–365."] } };
  }
  await prisma.organization.update({
    where: { id: org.id },
    data: { overdueReminderDays: [...new Set(days)].sort((a, b) => a - b) },
  });
  revalidatePath("/settings/payments");
  return { saved: true };
}
