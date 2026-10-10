"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { invoiceVisibilityWhere } from "@/lib/project-access";
import { paymentTermsValues } from "@/lib/validations/invoice";
import {
  applyCredit,
  canManagePayments,
  createDepositInvoice,
  deletePayment,
  issueCreditNote,
  PaymentError,
  recordPayment,
  removeCreditApplication,
  voidCreditNote,
} from "@/lib/services/payments";
import type { ActionState } from "@/actions/auth";

const ONLY_ADMINS = "Only owners and admins can record payments and manage credit.";

/** Owner/admin context, or an error state. The invoice (if given) must be in
 * the org and visible to them. */
async function managerContext(invoiceId?: string) {
  const { org, user, role } = await requireOrgContext();
  if (!canManagePayments(role)) return { error: ONLY_ADMINS } as const;
  if (invoiceId) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId: org.id, ...invoiceVisibilityWhere(user.id, role) },
      select: { id: true, clientId: true },
    });
    if (!invoice) return { error: "Invoice not found." } as const;
    return { org, user, role, invoice } as const;
  }
  return { org, user, role, invoice: null } as const;
}

function refresh(invoiceId: string | null, clientId: string | null) {
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  if (clientId) revalidatePath(`/clients/${clientId}`);
  revalidatePath("/dashboard");
}

const str = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v : null;
};

export async function recordPaymentAction(
  invoiceId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await managerContext(invoiceId);
  if ("error" in ctx) return { error: ctx.error };
  try {
    await recordPayment(
      { orgId: ctx.org.id, actorId: ctx.user.id },
      {
        invoiceId,
        amount: str(formData, "amount") ?? "",
        receivedAt: str(formData, "receivedAt") || null,
        method: str(formData, "method"),
        reference: str(formData, "reference"),
        note: str(formData, "note"),
      }
    );
  } catch (err) {
    if (err instanceof PaymentError) return { error: err.message };
    throw err;
  }
  refresh(invoiceId, ctx.invoice!.clientId);
  return { saved: true };
}

export type LedgerActionResult = { error?: string };

export async function deletePaymentAction(paymentId: string, invoiceId: string): Promise<LedgerActionResult> {
  const ctx = await managerContext(invoiceId);
  if ("error" in ctx) return { error: ctx.error };
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, invoiceId, orgId: ctx.org.id } });
  if (!payment) return { error: "Payment not found." };
  try {
    await deletePayment({ orgId: ctx.org.id, actorId: ctx.user.id }, paymentId);
  } catch (err) {
    if (err instanceof PaymentError) return { error: err.message };
    throw err;
  }
  refresh(invoiceId, ctx.invoice!.clientId);
  return {};
}

export async function applyCreditAction(
  invoiceId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await managerContext(invoiceId);
  if ("error" in ctx) return { error: ctx.error };
  try {
    await applyCredit(
      { orgId: ctx.org.id, actorId: ctx.user.id },
      { invoiceId, amount: str(formData, "amount") ?? "", note: str(formData, "note") }
    );
  } catch (err) {
    if (err instanceof PaymentError) return { error: err.message };
    throw err;
  }
  refresh(invoiceId, ctx.invoice!.clientId);
  return { saved: true };
}

export async function removeCreditApplicationAction(
  applicationId: string,
  invoiceId: string
): Promise<LedgerActionResult> {
  const ctx = await managerContext(invoiceId);
  if ("error" in ctx) return { error: ctx.error };
  const application = await prisma.creditApplication.findFirst({
    where: { id: applicationId, invoiceId, orgId: ctx.org.id },
  });
  if (!application) return { error: "Credit application not found." };
  try {
    await removeCreditApplication({ orgId: ctx.org.id, actorId: ctx.user.id }, applicationId);
  } catch (err) {
    if (err instanceof PaymentError) return { error: err.message };
    throw err;
  }
  refresh(invoiceId, ctx.invoice!.clientId);
  return {};
}

export async function issueCreditNoteAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const invoiceIdRaw = str(formData, "invoiceId");
  const invoiceId = invoiceIdRaw && invoiceIdRaw !== "none" ? invoiceIdRaw : null;
  const ctx = await managerContext(invoiceId ?? undefined);
  if ("error" in ctx) return { error: ctx.error };
  try {
    await issueCreditNote(
      { orgId: ctx.org.id, actorId: ctx.user.id },
      {
        clientId,
        invoiceId,
        amount: str(formData, "amount") ?? "",
        reason: str(formData, "reason") ?? "",
        issueDate: str(formData, "issueDate") || null,
        applyToInvoice: formData.get("applyToInvoice") === "on",
      }
    );
  } catch (err) {
    if (err instanceof PaymentError) return { error: err.message };
    throw err;
  }
  refresh(invoiceId, clientId);
  return { saved: true };
}

export async function voidCreditNoteAction(creditNoteId: string, clientId: string): Promise<LedgerActionResult> {
  const ctx = await managerContext();
  if ("error" in ctx) return { error: ctx.error };
  let note;
  try {
    note = await voidCreditNote({ orgId: ctx.org.id, actorId: ctx.user.id }, creditNoteId);
  } catch (err) {
    if (err instanceof PaymentError) return { error: err.message };
    throw err;
  }
  refresh(note.invoiceId, clientId);
  return {};
}

export async function createDepositInvoiceAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await managerContext();
  if ("error" in ctx) return { error: ctx.error };
  const termsRaw = str(formData, "paymentTerms");
  const paymentTerms = paymentTermsValues.find((t) => t === termsRaw) ?? null;
  const by = str(formData, "by");
  let invoice;
  try {
    invoice = await createDepositInvoice(
      { orgId: ctx.org.id, defaultCurrency: ctx.org.defaultCurrency, actorId: ctx.user.id, role: ctx.role },
      {
        clientId,
        // "none" is the picker's "No project".
        projectId: [null, "", "none"].includes(str(formData, "projectId")) ? null : str(formData, "projectId"),
        description: str(formData, "description"),
        amount: by === "percent" ? null : str(formData, "amount"),
        percent: by === "percent" ? str(formData, "percent") : null,
        issueDate: str(formData, "issueDate") ?? "",
        dueDate: paymentTerms === "CUSTOM" ? str(formData, "dueDate") : null,
        paymentTerms,
        notes: str(formData, "notes"),
      }
    );
  } catch (err) {
    if (err instanceof PaymentError) return { error: err.message };
    throw err;
  }
  revalidatePath("/invoices");
  revalidatePath(`/clients/${clientId}`);
  redirect(`/invoices/${invoice.id}`);
}
