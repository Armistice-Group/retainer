"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { projectSchema, projectMemberSchema } from "@/lib/validations/project";
import { notify } from "@/lib/notifications";
import { canViewProject } from "@/lib/project-access";
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
    },
  });

  // A non-admin creator of a confidential project must stay able to see it —
  // visibility is need-to-know via ProjectMember, so without this they'd
  // immediately lose access to the project they just made.
  if (parsed.data.confidential && role !== "OWNER" && role !== "ADMIN") {
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
    },
  });

  if (parsed.data.confidential && role !== "OWNER" && role !== "ADMIN") {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: user.id } },
      create: { projectId, userId: user.id, billRate: 0, currency: org.defaultCurrency },
      update: {},
    });
  }

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
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
  if (!project || project.orgId !== org.id) return { error: "Project not found." };
  if (!(await canViewProject(project, user.id, role))) return { error: "Project not found." };

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: parsed.data.userId, orgId: org.id } },
  });
  if (!membership) return { error: "That person is not a member of this organization." };

  const existing = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: { projectId: parsed.data.projectId, userId: parsed.data.userId },
    },
  });

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: { projectId: parsed.data.projectId, userId: parsed.data.userId },
    },
    create: {
      projectId: parsed.data.projectId,
      userId: parsed.data.userId,
      billRate: parsed.data.billRate,
      currency: parsed.data.currency,
    },
    update: {
      billRate: parsed.data.billRate,
      currency: parsed.data.currency,
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
