import "server-only";
import { Prisma, type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { projectVisibilityWhere } from "@/lib/project-access";

export class InvoiceError extends Error {}

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
  issueDate: string;
  dueDate: string;
  taxRate: number;
  notes?: string | null;
};

export async function generateInvoice(ctx: GenerateInvoiceContext, input: GenerateInvoiceInput) {
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client || client.orgId !== ctx.orgId) throw new InvoiceError("Client not found.");

  const entries = await prisma.timeEntry.findMany({
    where: {
      id: { in: input.timeEntryIds },
      orgId: ctx.orgId,
      billable: true,
      invoiceLineItemId: null,
      project: { clientId: client.id, ...projectVisibilityWhere(ctx.actorId, ctx.role) },
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

  if (entries.length === 0 && milestones.length === 0) {
    throw new InvoiceError("No eligible unbilled time entries or milestones were selected.");
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
        dueDate: new Date(input.dueDate),
        taxRate: input.taxRate,
        currency: ctx.defaultCurrency,
        notes: input.notes || null,
      },
    });

    await tx.organization.update({
      where: { id: ctx.orgId },
      data: { nextInvoiceNumber: { increment: 1 } },
    });

    let sortOrder = 0;
    for (const group of groups.values()) {
      const amount = round2(group.hours * group.rate);
      const lineItem = await tx.invoiceLineItem.create({
        data: {
          invoiceId: created.id,
          projectId: group.projectId,
          description: group.label,
          quantity: round2(group.hours),
          rate: group.rate,
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

    await recomputeInvoiceTotals(tx, created.id);
    return created;
  });

  return invoice;
}
