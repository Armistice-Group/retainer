"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { invoiceVisibilityWhere } from "@/lib/project-access";
import { generateInvoiceSchema, paymentTermsValues } from "@/lib/validations/invoice";
import {
  generateInvoice,
  createCustomInvoice,
  recomputeInvoiceTotals,
  round2,
  InvoiceError,
  notifyInvoiceStatusChange,
  invoiceStatusChangeError,
  canChangeInvoiceStatusByKey,
  releaseInvoicedWork,
  voidInvoice,
} from "@/lib/services/invoices";
import {
  pushInvoiceToQuickBooks,
  syncInvoiceStatusFromQuickBooks,
  QuickBooksError,
} from "@/lib/services/quickbooks-sync";
import { markInvoicePaidInFull, PaymentError } from "@/lib/services/payments";
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

/** A draft invoice for amounts typed in (a set fee, a deposit), not
 * logged work. */
export async function createCustomInvoiceAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();
  const str = (key: string) => String(formData.get(key) ?? "").trim();
  const deposit = formData.get("deposit") === "on";
  // Deposits become client credit, which only owners and admins manage.
  if (deposit && !canChangeInvoiceStatusByKey(role)) {
    return { error: "Only owners and admins can create deposit invoices." };
  }
  const descriptions = formData.getAll("lineDescription").map(String);
  const amounts = formData.getAll("lineAmount").map(String);
  const termsRaw = str("paymentTerms");
  const paymentTerms = paymentTermsValues.find((t) => t === termsRaw) ?? null;
  const taxRate = Number(str("taxRate") || 0);

  let invoice;
  try {
    invoice = await createCustomInvoice(
      { orgId: org.id, defaultCurrency: org.defaultCurrency, actorId: user.id, role },
      {
        clientId: str("clientId"),
        lines: descriptions.map((description, i) => ({ description, amount: amounts[i] ?? "" })),
        deposit,
        projectId: ["", "none"].includes(str("projectId")) ? null : str("projectId"),
        issueDate: str("issueDate"),
        dueDate: str("dueDate") || null,
        paymentTerms,
        poNumber: str("poNumber"),
        taxRate,
        notes: str("notes"),
      }
    );
  } catch (err) {
    if (err instanceof InvoiceError) return { error: err.message };
    throw err;
  }

  revalidatePath("/invoices");
  revalidatePath(`/clients/${invoice.clientId}`);
  redirect(`/invoices/${invoice.id}`);
}

export async function updateInvoiceMetaAction(
  invoiceId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();

  const invoice = await prisma.invoice.findFirst({ where: visibleInvoice(invoiceId, org.id, user.id, role) });
  if (!invoice || invoice.orgId !== org.id) return { error: "Invoice not found." };
  if (invoice.status !== "DRAFT") return { error: "Only draft invoices can be edited." };

  const issueDate = String(formData.get("issueDate") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  const taxRate = Number(formData.get("taxRate"));
  const notes = (formData.get("notes") as string) || null;
  const paymentTermsRaw = formData.get("paymentTerms") as string;
  const paymentTerms = paymentTermsValues.includes(
    paymentTermsRaw as (typeof paymentTermsValues)[number]
  )
    ? (paymentTermsRaw as (typeof paymentTermsValues)[number])
    : "NET30";
  // "PO-4821" and "4821" both print as "PO 4821" on the PDF.
  const poNumber = String(formData.get("poNumber") ?? "").trim().replace(/^PO[\s#:-]*/i, "") || null;

  const fieldErrors: Record<string, string[]> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) fieldErrors.issueDate = ["Pick an issue date."];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) fieldErrors.dueDate = ["Pick a due date."];
  else if (issueDate && dueDate < issueDate) fieldErrors.dueDate = ["The due date can't be before the issue date."];
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) fieldErrors.taxRate = ["Use a tax rate from 0 to 100."];
  if (Object.keys(fieldErrors).length) return { fieldErrors };

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
  return { saved: true };
}

type LineInput = { id?: string; description: string; quantity: number; rate: number };

/**
 * Saves a draft's whole line table at once: edits, new lines and removed
 * ones (whose time, milestones and expenses become unbilled again). One
 * save, so an edit in one row is never lost by saving another.
 */
export async function saveInvoiceLinesAction(
  invoiceId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();
  const invoice = await prisma.invoice.findFirst({
    where: visibleInvoice(invoiceId, org.id, user.id, role),
    include: { lineItems: { select: { id: true } } },
  });
  if (!invoice || invoice.orgId !== org.id) return { error: "Invoice not found." };
  if (invoice.status !== "DRAFT") return { error: "Only draft invoices can be edited." };

  let lines: LineInput[];
  let removed: string[];
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
    removed = JSON.parse(String(formData.get("removed") ?? "[]"));
    if (!Array.isArray(lines) || !Array.isArray(removed)) throw new Error();
  } catch {
    return { error: "Couldn't read the lines. Reload the page and try again." };
  }

  const known = new Set(invoice.lineItems.map((l) => l.id));
  for (const [i, line] of lines.entries()) {
    const n = i + 1;
    const description = typeof line.description === "string" ? line.description.trim() : "";
    if (!description) return { error: `Line ${n} needs a description.` };
    if (description.length > 500) return { error: `Line ${n}'s description is too long (500 characters at most).` };
    if (!Number.isFinite(line.quantity)) return { error: `Line ${n} needs a quantity.` };
    if (!Number.isFinite(line.rate)) return { error: `Line ${n} needs a rate.` };
    if (Math.abs(line.quantity) > 1_000_000 || Math.abs(line.rate) > 100_000_000) {
      return { error: `Line ${n}'s numbers are too large.` };
    }
    if (line.id && !known.has(line.id)) return { error: "A line was changed elsewhere. Reload the page." };
    line.description = description;
  }
  if (removed.some((id) => typeof id !== "string" || !known.has(id))) {
    return { error: "A line was changed elsewhere. Reload the page." };
  }

  await prisma.$transaction(async (tx) => {
    for (const lineItemId of removed) {
      await releaseInvoicedWork(tx, { lineItemId });
      await tx.invoiceLineItem.delete({ where: { id: lineItemId, invoiceId } });
    }
    for (const [sortOrder, line] of lines.entries()) {
      const data = {
        description: line.description,
        quantity: round2(line.quantity),
        rate: round2(line.rate),
        amount: round2(line.quantity * line.rate),
        sortOrder,
      };
      if (line.id) await tx.invoiceLineItem.update({ where: { id: line.id, invoiceId }, data });
      else await tx.invoiceLineItem.create({ data: { ...data, invoiceId } });
    }
    await recomputeInvoiceTotals(tx, invoiceId);
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { saved: true };
}

export async function setInvoiceStatusAction(
  invoiceId: string,
  status: "DRAFT" | "SENT" | "PAID" | "VOID",
  formData?: FormData
) {
  const { org, user, role } = await requireOrgContext();
  // Owners and admins only, as on the API and MCP server; members can
  // generate and edit drafts.
  if (!canChangeInvoiceStatusByKey(role)) {
    throw new Error("Only owners and admins can send, mark paid or void invoices.");
  }
  const invoice = await prisma.invoice.findFirst({
    where: visibleInvoice(invoiceId, org.id, user.id, role),
    include: { client: true },
  });
  if (!invoice || invoice.orgId !== org.id) throw new Error("Invoice not found.");
  const statusError = invoiceStatusChangeError(invoice.status, status);
  if (statusError) throw new Error(statusError);

  if (status === "VOID") {
    // Releases the invoice's time, milestones and expenses and refreshes a
    // filed copy — shared with the API and MCP server.
    try {
      await voidInvoice(org.id, invoiceId);
    } catch (err) {
      if (err instanceof InvoiceError) throw new Error(err.message);
      throw err;
    }
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/invoices");
    revalidatePath("/time");
    return;
  }

  if (status === "PAID") {
    // "Mark as paid" records a payment for the whole balance still due —
    // the invoice turns PAID (with its alert) through the payment.
    try {
      await markInvoicePaidInFull({ orgId: org.id, actorId: user.id }, invoiceId, {
        method: (formData?.get("paymentMethod") as string) || null,
      });
    } catch (err) {
      if (err instanceof PaymentError) throw new Error(err.message);
      throw err;
    }
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/invoices");
    revalidatePath(`/clients/${invoice.clientId}`);
    return;
  }

  if (status === "SENT") {
    const lineItemCount = await prisma.invoiceLineItem.count({ where: { invoiceId } });
    if (lineItemCount === 0) throw new Error("Add at least one line item before sending.");
  }

  await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");

  if (status === "SENT") {
    await notifyInvoiceStatusChange(org, invoice, status);
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
  if (!canChangeInvoiceStatusByKey(role)) {
    return { error: "Only owners and admins can send invoices." };
  }
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
    await releaseInvoicedWork(tx, { invoiceId });
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
  if (!canChangeInvoiceStatusByKey(role)) return { error: "Only owners and admins can send invoices." };
  const to = [
    ...formData.getAll("to").map(String),
    ...String(formData.get("extra") ?? "").split(/[\s,;]+/),
  ].filter(Boolean);
  try {
    await emailInvoice({ orgId: org.id, actorId: user.id }, invoiceId, {
      to,
      message: (formData.get("message") as string | null) ?? null,
      attachPdf: formData.get("attachPdf") === "on",
      // Only asked when the invoice has hourly time to list.
      ...(formData.get("timeDetailAsked") ? { timeDetail: formData.get("timeDetail") === "on" } : {}),
    });
  } catch (err) {
    if (err instanceof InvoiceDeliveryError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { saved: true };
}

/**
 * The client-facing link, for sharing by hand. On a draft it sends the
 * invoice first (owners and admins), so there's always a way to get an
 * invoice to the client, even without email set up.
 */
export async function invoiceClientLinkAction(
  invoiceId: string
): Promise<{ url?: string; error?: string; sent?: boolean }> {
  const { org, user, role } = await requireOrgContext();
  const invoice = await prisma.invoice.findFirst({
    where: visibleInvoice(invoiceId, org.id, user.id, role),
    include: { client: true },
  });
  if (!invoice || invoice.orgId !== org.id) return { error: "Invoice not found." };
  if (invoice.status === "VOID") return { error: "This invoice is void." };
  let sent = false;
  if (invoice.status === "DRAFT") {
    if (!canChangeInvoiceStatusByKey(role)) return { error: "Only owners and admins can send invoices." };
    const lineItemCount = await prisma.invoiceLineItem.count({ where: { invoiceId } });
    if (lineItemCount === 0) return { error: "Add at least one line item before sending." };
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "SENT" } });
    await notifyInvoiceStatusChange(org, invoice, "SENT");
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/invoices");
    sent = true;
  }
  const { viewUrl } = await invoiceLinks(invoiceId);
  return { url: viewUrl, sent };
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

/** Whether this invoice carries its timesheet (the time detail page on the
 * PDF and the client link), overriding the client's default. Anyone can
 * change a draft's; once sent, owners and admins. */
export async function setInvoiceTimeDetailAction(invoiceId: string, include: boolean): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();
  const invoice = await prisma.invoice.findFirst({ where: visibleInvoice(invoiceId, org.id, user.id, role) });
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.status !== "DRAFT" && !canChangeInvoiceStatusByKey(role)) {
    return { error: "Only owners and admins can change a sent invoice." };
  }
  await prisma.invoice.update({ where: { id: invoiceId }, data: { timeDetail: include } });
  revalidatePath(`/invoices/${invoiceId}`);
  return { saved: true };
}
