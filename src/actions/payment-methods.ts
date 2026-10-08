"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import {
  PAYMENT_TYPE_VALUES,
  validatePaymentDetails,
  type PaymentMethodType,
} from "@/lib/payment-methods";
import type { ActionState } from "@/actions/auth";

function revalidate(clientId: string | null) {
  revalidatePath(clientId ? `/clients/${clientId}` : "/settings/payments");
  revalidatePath("/dashboard");
}

/** Creates (no methodId) or updates a payment method — org default when
 * clientId is empty, otherwise a client-specific one. */
export async function savePaymentMethodAction(
  target: { clientId: string | null; methodId: string | null },
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const type = formData.get("type") as PaymentMethodType;
  if (!PAYMENT_TYPE_VALUES.includes(type)) return { error: "Choose a payment type." };

  if (target.clientId) {
    const client = await prisma.client.findUnique({ where: { id: target.clientId } });
    if (!client || client.orgId !== org.id) return { error: "Client not found." };
  }

  const raw = Object.fromEntries(
    [...formData.entries()].filter(([k]) => k.startsWith("d_")).map(([k, v]) => [k.slice(2), v])
  );
  const { details, errors } = validatePaymentDetails(type, raw);
  if (Object.keys(errors).length) {
    const values = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)]));
    return { fieldErrors: errors, values };
  }

  const data = {
    type,
    label: ((formData.get("label") as string) || "").trim().slice(0, 80) || null,
    details,
    showOnPdf: formData.get("showOnPdf") === "on",
  };

  if (target.methodId) {
    const existing = await prisma.paymentMethod.findUnique({ where: { id: target.methodId } });
    if (!existing || existing.orgId !== org.id) return { error: "Payment method not found." };
    await prisma.paymentMethod.update({ where: { id: existing.id }, data });
  } else {
    const count = await prisma.paymentMethod.count({
      where: { orgId: org.id, clientId: target.clientId },
    });
    await prisma.paymentMethod.create({
      data: { ...data, orgId: org.id, clientId: target.clientId, sortOrder: count },
    });
  }

  revalidate(target.clientId);
  return { saved: true };
}

export async function deletePaymentMethodAction(methodId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);
  const method = await prisma.paymentMethod.findUnique({ where: { id: methodId } });
  if (!method || method.orgId !== org.id) throw new Error("Payment method not found.");
  await prisma.paymentMethod.delete({ where: { id: methodId } });
  revalidate(method.clientId);
}

/** Moves a method one place up or down within its list. */
export async function movePaymentMethodAction(methodId: string, direction: "up" | "down") {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);
  const method = await prisma.paymentMethod.findUnique({ where: { id: methodId } });
  if (!method || method.orgId !== org.id) throw new Error("Payment method not found.");

  const list = await prisma.paymentMethod.findMany({
    where: { orgId: org.id, clientId: method.clientId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const i = list.findIndex((m) => m.id === methodId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await prisma.$transaction(
    list.map((m, idx) => prisma.paymentMethod.update({ where: { id: m.id }, data: { sortOrder: idx } }))
  );
  revalidate(method.clientId);
}
