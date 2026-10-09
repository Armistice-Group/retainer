"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { checkBudgets } from "@/lib/services/budget-alerts";
import { projectSchema, projectMemberSchema } from "@/lib/validations/project";
import { notify } from "@/lib/notifications";
import { canViewProject } from "@/lib/project-access";
import { sendEmail } from "@/lib/email";
import { ContractorReviewEmail } from "@/emails/contractor-review-email";
import { getOrigin } from "@/lib/url";
import type { ActionState } from "@/actions/auth";

export async function createProjectAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();

  const parsed = projectSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    description: formData.get("description"),
    status: formData.get("status") || "ACTIVE",
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    confidential: formData.get("confidential") === "on",
    budgetHours: formData.get("budgetHours") || undefined,
    billingType: formData.get("billingType") || "HOURLY",
    flatFeeAmount: formData.get("flatFeeAmount") || undefined,
    paymentTerms: formData.get("paymentTerms") ?? undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const client = await prisma.client.findUnique({ where: { id: parsed.data.clientId } });
  if (!client || client.orgId !== org.id) return { error: "Client not found." };

  const project = await prisma.project.create({
    data: {
      orgId: org.id,
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      status: parsed.data.status,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      confidential: parsed.data.confidential,
      budgetHours: parsed.data.budgetHours ?? null,
      billingType: parsed.data.billingType,
      flatFeeAmount: parsed.data.billingType === "FLAT_FEE" ? (parsed.data.flatFeeAmount ?? null) : null,
      paymentTerms: parsed.data.paymentTerms,
    },
  });

  // A non-admin creator of a confidential project must stay able to see it —
  // visibility is need-to-know via ProjectMember, so without this they'd
  // immediately lose access to the project they just made. Separately, a
  // solo org has no one to pick from an "add team member" dialog anyway,
  // so the sole member goes on every project automatically.
  const memberCount = await prisma.membership.count({ where: { orgId: org.id } });
  const soloOrg = memberCount === 1;
  const nonAdminConfidentialCreator =
    parsed.data.confidential && role !== "OWNER" && role !== "ADMIN";
  if (soloOrg || nonAdminConfidentialCreator) {
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: user.id, billRate: 0, currency: org.defaultCurrency },
    });
  }

  revalidatePath("/projects");
  revalidatePath(`/clients/${parsed.data.clientId}`);
  redirect(`/projects/${project.id}`);
}

export async function updateProjectAction(
  projectId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();

  const existing = await prisma.project.findUnique({ where: { id: projectId } });
  if (!existing || existing.orgId !== org.id) return { error: "Project not found." };
  if (!(await canViewProject(existing, user.id, role))) return { error: "Project not found." };

  const parsed = projectSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    description: formData.get("description"),
    status: formData.get("status") || "ACTIVE",
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    confidential: formData.get("confidential") === "on",
    budgetHours: formData.get("budgetHours") || undefined,
    billingType: formData.get("billingType") || "HOURLY",
    flatFeeAmount: formData.get("flatFeeAmount") || undefined,
    paymentTerms: formData.get("paymentTerms") ?? undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const client = await prisma.client.findUnique({ where: { id: parsed.data.clientId } });
  if (!client || client.orgId !== org.id) return { error: "Client not found." };

  await prisma.project.update({
    where: { id: projectId, orgId: org.id },
    data: {
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      status: parsed.data.status,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      confidential: parsed.data.confidential,
      budgetHours: parsed.data.budgetHours ?? null,
      billingType: parsed.data.billingType,
      flatFeeAmount: parsed.data.billingType === "FLAT_FEE" ? (parsed.data.flatFeeAmount ?? null) : null,
      paymentTerms: parsed.data.paymentTerms,
    },
  });

  if (parsed.data.confidential && role !== "OWNER" && role !== "ADMIN") {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: user.id } },
      create: { projectId, userId: user.id, billRate: 0, currency: org.defaultCurrency },
      update: {},
    });
  }

  await checkBudgets(projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return null;
}

export async function deleteProjectAction(projectId: string, clientId: string) {
  const { org, user, role } = await requireOrgContext();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");
  if (!(await canViewProject(project, user.id, role))) throw new Error("Project not found.");

  await prisma.project.delete({ where: { id: projectId, orgId: org.id } });
  revalidatePath("/projects");
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function addProjectMemberAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();

  const parsed = projectMemberSchema.safeParse({
    projectId: formData.get("projectId"),
    userId: formData.get("userId"),
    billRate: formData.get("billRate"),
    currency: formData.get("currency") || "USD",
    requiresApproval: formData.get("requiresApproval") === "on",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    include: { client: { include: { contacts: true } } },
  });
  if (!project || project.orgId !== org.id) return { error: "Project not found." };
  if (!(await canViewProject(project, user.id, role))) return { error: "Project not found." };

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: parsed.data.userId, orgId: org.id } },
    include: { user: true },
  });
  if (!membership) return { error: "That person is not a member of this organization." };

  const existing = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: { projectId: parsed.data.projectId, userId: parsed.data.userId },
    },
  });

  const requestApproval =
    parsed.data.requiresApproval &&
    membership.employmentType === "CONTRACTOR" &&
    (!existing || existing.approvalStatus === "NOT_REQUIRED");
  const approvalToken = requestApproval ? randomBytes(24).toString("base64url") : undefined;

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: { projectId: parsed.data.projectId, userId: parsed.data.userId },
    },
    create: {
      projectId: parsed.data.projectId,
      userId: parsed.data.userId,
      billRate: parsed.data.billRate,
      currency: parsed.data.currency,
      ...(requestApproval
        ? {
            approvalStatus: "PENDING",
            approvalToken,
            approvalRequestedAt: new Date(),
          }
        : {}),
    },
    update: {
      billRate: parsed.data.billRate,
      currency: parsed.data.currency,
      ...(requestApproval
        ? {
            approvalStatus: "PENDING",
            approvalToken,
            approvalRequestedAt: new Date(),
          }
        : {}),
    },
  });

  if (!existing) {
    await notify(prisma, {
      orgId: org.id,
      userIds: [parsed.data.userId],
      type: "PROJECT_ASSIGNED",
      message: `You were added to ${project.name}.`,
      link: `/projects/${project.id}`,
    });
  }

  if (requestApproval && approvalToken) {
    const primaryContact =
      project.client.contacts.find((c) => c.isPrimary && c.email) ??
      project.client.contacts.find((c) => c.email);
    if (primaryContact?.email) {
      const origin = await getOrigin();
      await sendEmail({
        to: primaryContact.email,
        subject: `Review ${membership.user.name} for ${project.name}`,
        react: ContractorReviewEmail({
          orgName: org.name,
          clientName: project.client.name,
          contractorName: membership.user.name,
          projectName: project.name,
          reviewUrl: `${origin}/review/${approvalToken}`,
          origin,
        }),
      });
    }
  }

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return null;
}

export async function removeProjectMemberAction(projectMemberId: string, projectId: string) {
  const { org, user, role } = await requireOrgContext();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");
  if (!(await canViewProject(project, user.id, role))) throw new Error("Project not found.");

  await prisma.projectMember.delete({ where: { id: projectMemberId } });
  revalidatePath(`/projects/${projectId}`);
}
