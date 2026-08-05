"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { canViewProject } from "@/lib/project-access";
import { expenseSchema } from "@/lib/validations/expense";
import type { ActionState } from "@/actions/auth";
import type { Role } from "@/generated/prisma/client";

async function requireProject(projectId: string, orgId: string, userId: string, role: Role) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== orgId) throw new Error("Project not found.");
  if (!(await canViewProject(project, userId, role))) throw new Error("Project not found.");
  return project;
}

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_RECEIPT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

export async function logExpenseAction(
  projectId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();
  await requireProject(projectId, org.id, user.id, role);

  const parsed = expenseSchema.safeParse({
    projectId,
    description: formData.get("description"),
    category: formData.get("category"),
    amount: formData.get("amount"),
    incurredAt: formData.get("incurredAt"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const file = formData.get("receiptFile");
  let receiptFileName: string | null = null;
  let receiptFileData: Buffer<ArrayBuffer> | null = null;
  let receiptContentType: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_RECEIPT_TYPES.has(file.type)) {
      return { error: "Receipt must be a PNG, JPEG, WebP, or PDF." };
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      return { error: "Receipt must be under 5MB." };
    }
    receiptFileName = file.name;
    receiptFileData = Buffer.from(await file.arrayBuffer());
    receiptContentType = file.type;
  }

  const isManager = role === "OWNER" || role === "ADMIN";
  const autoApproved = isManager || parsed.data.amount <= Number(org.expenseApprovalThreshold);

  await prisma.expense.create({
    data: {
      orgId: org.id,
      projectId,
      description: parsed.data.description,
      category: parsed.data.category || null,
      amount: parsed.data.amount,
      incurredAt: new Date(parsed.data.incurredAt),
      submittedById: user.id,
      status: autoApproved ? "APPROVED" : "PENDING",
      approvedById: isManager && autoApproved ? user.id : null,
      approvedAt: isManager && autoApproved ? new Date() : null,
      receiptFileName,
      receiptFileData,
      receiptContentType,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  return null;
}

export async function approveExpenseAction(expenseId: string, projectId: string) {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense || expense.orgId !== org.id || expense.projectId !== projectId) {
    throw new Error("Expense not found.");
  }
  if (expense.status !== "PENDING") throw new Error("This expense isn't pending approval.");

  await prisma.expense.update({
    where: { id: expenseId },
    data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date() },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function rejectExpenseAction(expenseId: string, projectId: string) {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense || expense.orgId !== org.id || expense.projectId !== projectId) {
    throw new Error("Expense not found.");
  }
  if (expense.status !== "PENDING") throw new Error("This expense isn't pending approval.");

  await prisma.expense.update({
    where: { id: expenseId },
    data: { status: "REJECTED", approvedById: user.id, approvedAt: new Date() },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteExpenseAction(expenseId: string, projectId: string) {
  const { org, role, user } = await requireOrgContext();

  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense || expense.orgId !== org.id || expense.projectId !== projectId) {
    throw new Error("Expense not found.");
  }
  const isManager = role === "OWNER" || role === "ADMIN";
  if (expense.submittedById !== user.id && !isManager) {
    throw new Error("You can only delete your own expenses.");
  }
  if (expense.invoiceLineItemId) {
    throw new Error("This expense has already been invoiced and can't be deleted.");
  }

  await prisma.expense.delete({ where: { id: expenseId } });
  revalidatePath(`/projects/${projectId}`);
}
