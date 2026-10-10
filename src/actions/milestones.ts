"use server";

import { revalidatePath } from "next/cache";
import { deleteStoredFile, storeFile, type StoredFile } from "@/lib/file-storage";
import { uploadLimitBytes } from "@/lib/services/documents";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { canViewProject } from "@/lib/project-access";
import { milestoneSchema, completeMilestoneSchema } from "@/lib/validations/milestone";
import { dueDateValue } from "@/lib/validations/task";
import { milestoneDueDateData } from "@/lib/services/deadlines";
import type { ActionState } from "@/actions/auth";
import type { Role } from "@/generated/prisma/client";

// Milestones are billing terms (or, when not billable, deliverables): only
// owners and admins add, edit, complete, reopen or delete them (members see
// them read-only).
async function requireProject(projectId: string, orgId: string, userId: string, role: Role) {
  requireRole(role, ["OWNER", "ADMIN"]);
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== orgId) throw new Error("Project not found.");
  if (!(await canViewProject(project, userId, role))) throw new Error("Project not found.");
  return project;
}

export async function createMilestoneAction(
  projectId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();
  await requireProject(projectId, org.id, user.id, role);

  const parsed = milestoneSchema.safeParse({
    projectId,
    name: formData.get("name"),
    description: formData.get("description"),
    billable: formData.get("kind") !== "deliverable",
    amount: formData.get("amount"),
    dueDate: formData.get("dueDate"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const count = await prisma.milestone.count({ where: { projectId } });

  await prisma.milestone.create({
    data: {
      projectId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      billable: parsed.data.billable,
      amount: parsed.data.amount,
      dueDate: dueDateValue(parsed.data.dueDate) ?? null,
      sortOrder: count,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  return null;
}

export async function updateMilestoneAction(
  milestoneId: string,
  projectId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();
  await requireProject(projectId, org.id, user.id, role);

  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
  if (!milestone || milestone.projectId !== projectId) return { error: "Milestone not found." };
  if (milestone.invoicedAt) {
    return { error: "This milestone has already been invoiced and can't be edited." };
  }

  const parsed = milestoneSchema.safeParse({
    projectId,
    name: formData.get("name"),
    description: formData.get("description"),
    billable: formData.get("kind") !== "deliverable",
    amount: formData.get("amount"),
    dueDate: formData.get("dueDate"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  await prisma.milestone.update({
    where: { id: milestoneId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      billable: parsed.data.billable,
      amount: parsed.data.amount,
      ...milestoneDueDateData(milestone.dueDate, dueDateValue(parsed.data.dueDate) ?? null),
    },
  });

  revalidatePath(`/projects/${projectId}`);
  return null;
}

export async function deleteMilestoneAction(milestoneId: string, projectId: string) {
  const { org, user, role } = await requireOrgContext();
  await requireProject(projectId, org.id, user.id, role);

  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
  if (!milestone || milestone.projectId !== projectId) throw new Error("Milestone not found.");
  if (milestone.invoicedAt) throw new Error("This milestone has already been invoiced.");

  await prisma.milestone.delete({ where: { id: milestoneId } });
  revalidatePath(`/projects/${projectId}`);
}

const ALLOWED_EVIDENCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

export async function completeMilestoneAction(
  projectId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();
  await requireProject(projectId, org.id, user.id, role);

  const parsed = completeMilestoneSchema.safeParse({
    milestoneId: formData.get("milestoneId"),
    completionNote: formData.get("completionNote"),
    completionUrl: formData.get("completionUrl"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const milestone = await prisma.milestone.findUnique({
    where: { id: parsed.data.milestoneId },
  });
  if (!milestone || milestone.projectId !== projectId) return { error: "Milestone not found." };
  if (milestone.completedAt) return { error: "This milestone is already marked complete." };

  const file = formData.get("evidenceFile");
  let fileName: string | null = null;
  let stored: StoredFile = { fileData: null, storageKey: null };
  let fileContentType: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_EVIDENCE_TYPES.has(file.type)) {
      return { error: "Evidence file must be a PNG, JPEG, WebP, or PDF." };
    }
    if (file.size > uploadLimitBytes()) {
      return { error: `Evidence file must be under ${uploadLimitBytes() / 1024 / 1024}MB.` };
    }
    fileName = file.name;
    stored = await storeFile(Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      keyPrefix: `orgs/${org.id}/milestones`,
      fileName: file.name,
    });
    fileContentType = file.type;
  }

  await prisma.milestone.update({
    where: { id: milestone.id },
    data: {
      completedAt: new Date(),
      completedById: user.id,
      completionNote: parsed.data.completionNote,
      completionUrl: parsed.data.completionUrl || null,
      completionFileName: fileName,
      completionFileData: stored.fileData,
      completionStorageKey: stored.storageKey,
      completionFileContentType: fileContentType,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  return null;
}

export async function reopenMilestoneAction(milestoneId: string, projectId: string) {
  const { org, user, role } = await requireOrgContext();
  await requireProject(projectId, org.id, user.id, role);

  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
  if (!milestone || milestone.projectId !== projectId) throw new Error("Milestone not found.");
  if (milestone.invoicedAt) throw new Error("This milestone has already been invoiced.");

  await prisma.milestone.update({
    where: { id: milestoneId },
    data: {
      completedAt: null,
      completedById: null,
      completionNote: null,
      completionUrl: null,
      completionFileName: null,
      completionFileData: null,
      completionStorageKey: null,
      completionFileContentType: null,
    },
  });
  await deleteStoredFile({ storageKey: milestone.completionStorageKey });

  revalidatePath(`/projects/${projectId}`);
}
