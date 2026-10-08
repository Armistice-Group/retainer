"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { parseLocalDate } from "@/lib/date";
import { alignToInterval, nextRunDate } from "@/lib/billing-interval";
import { recurringInvoiceScheduleSchema, billingCycleSchema } from "@/lib/validations/recurring-invoice";
import type { ActionState } from "@/actions/auth";

export async function createRecurringScheduleAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const parsed = recurringInvoiceScheduleSchema.safeParse({
    clientId: formData.get("clientId"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    retainerHours: formData.get("retainerHours") || "",
    interval: formData.get("interval") || "MONTHLY",
    dueInDays: formData.get("dueInDays") || 30,
    autoSend: formData.get("autoSend") === "on",
    startDate: formData.get("startDate"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const client = await prisma.client.findUnique({ where: { id: parsed.data.clientId } });
  if (!client || client.orgId !== org.id) return { error: "Client not found." };

  await prisma.recurringInvoiceSchedule.create({
    data: {
      orgId: org.id,
      clientId: parsed.data.clientId,
      description: parsed.data.description,
      amount: parsed.data.amount,
      retainerHours: parsed.data.retainerHours === "" ? null : parsed.data.retainerHours,
      interval: parsed.data.interval,
      dueInDays: parsed.data.dueInDays,
      autoSend: parsed.data.autoSend,
      nextRunAt: alignToInterval(parseLocalDate(parsed.data.startDate), parsed.data.interval),
    },
  });

  revalidatePath(`/clients/${parsed.data.clientId}`);
  return null;
}

export async function pauseRecurringScheduleAction(scheduleId: string, clientId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const schedule = await prisma.recurringInvoiceSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule || schedule.orgId !== org.id) throw new Error("Schedule not found.");

  await prisma.recurringInvoiceSchedule.update({ where: { id: scheduleId }, data: { active: false } });
  revalidatePath(`/clients/${clientId}`);
}

export async function resumeRecurringScheduleAction(scheduleId: string, clientId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const schedule = await prisma.recurringInvoiceSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule || schedule.orgId !== org.id) throw new Error("Schedule not found.");

  await prisma.recurringInvoiceSchedule.update({ where: { id: scheduleId }, data: { active: true } });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteRecurringScheduleAction(scheduleId: string, clientId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const schedule = await prisma.recurringInvoiceSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule || schedule.orgId !== org.id) throw new Error("Schedule not found.");

  await prisma.recurringInvoiceSchedule.delete({ where: { id: scheduleId } });
  revalidatePath(`/clients/${clientId}`);
}

/** Creates or replaces the client's billing cycle (one per client). */
export async function saveBillingCycleAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const parsed = billingCycleSchema.safeParse({
    clientId: formData.get("clientId"),
    interval: formData.get("interval"),
    paymentTerms: formData.get("paymentTerms") || "NET30",
    autoSend: formData.get("autoSend") === "on",
    startDate: formData.get("startDate"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const client = await prisma.client.findUnique({ where: { id: parsed.data.clientId } });
  if (!client || client.orgId !== org.id) return { error: "Client not found." };

  const start = alignToInterval(parseLocalDate(parsed.data.startDate), parsed.data.interval);
  const data = {
    interval: parsed.data.interval,
    anchorDay: start.getDate(),
    paymentTerms: parsed.data.paymentTerms,
    autoSend: parsed.data.autoSend,
    nextRunAt: start,
    active: true,
  };

  await prisma.clientBillingCycle.upsert({
    where: { clientId: client.id },
    create: { ...data, orgId: org.id, clientId: client.id },
    update: data,
  });

  revalidatePath(`/clients/${client.id}`);
  return { saved: true };
}

async function requireBillingCycle(clientId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);
  const cycle = await prisma.clientBillingCycle.findUnique({ where: { clientId } });
  if (!cycle || cycle.orgId !== org.id) throw new Error("Billing cycle not found.");
  return cycle;
}

export async function setBillingCycleActiveAction(clientId: string, active: boolean) {
  const cycle = await requireBillingCycle(clientId);
  // Resuming a cycle whose run date passed while paused shouldn't fire
  // immediately for the gap — move it to its next future run date.
  let nextRunAt = cycle.nextRunAt;
  while (active && nextRunAt <= new Date()) {
    nextRunAt = nextRunDate(nextRunAt, cycle.interval, cycle.anchorDay);
  }
  await prisma.clientBillingCycle.update({ where: { id: cycle.id }, data: { active, nextRunAt } });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteBillingCycleAction(clientId: string) {
  const cycle = await requireBillingCycle(clientId);
  await prisma.clientBillingCycle.delete({ where: { id: cycle.id } });
  revalidatePath(`/clients/${clientId}`);
}
