"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { parseLocalDate } from "@/lib/date";
import { recurringInvoiceScheduleSchema } from "@/lib/validations/recurring-invoice";
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
      nextRunAt: parseLocalDate(parsed.data.startDate),
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
