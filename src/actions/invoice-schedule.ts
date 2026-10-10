"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { invoiceVisibilityWhere } from "@/lib/project-access";
import { canChangeInvoiceStatusByKey } from "@/lib/services/invoices";
import {
  cancelScheduledSend,
  scheduleInvoiceSend,
  ScheduleError,
} from "@/lib/services/scheduled-invoices";
import type { ActionState } from "@/actions/auth";

// Scheduling a draft to be emailed later is sending, so it's for owners and
// admins, like the Send and Email actions.

async function visibleDraft(invoiceId: string) {
  const { org, user, role } = await requireOrgContext();
  if (!canChangeInvoiceStatusByKey(role)) {
    return { error: "Only owners and admins can schedule invoices." } as const;
  }
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, orgId: org.id, ...invoiceVisibilityWhere(user.id, role) },
    select: { id: true },
  });
  if (!invoice) return { error: "Invoice not found." } as const;
  return { orgId: org.id, actorId: user.id } as const;
}

export async function scheduleInvoiceSendAction(
  invoiceId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await visibleDraft(invoiceId);
  if ("error" in ctx) return { error: ctx.error };
  // The browser turns the picked local date and time into an ISO instant.
  const raw = String(formData.get("sendAt") ?? "");
  const sendAt = new Date(raw);
  if (!raw || Number.isNaN(sendAt.getTime())) return { error: "Pick a date and time to send it." };
  try {
    await scheduleInvoiceSend(ctx, invoiceId, sendAt);
  } catch (err) {
    if (err instanceof ScheduleError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { saved: true };
}

export async function cancelScheduledSendAction(invoiceId: string) {
  const ctx = await visibleDraft(invoiceId);
  if ("error" in ctx) throw new Error(ctx.error);
  await cancelScheduledSend(ctx, invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}
