"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { generateShareToken } from "@/lib/services/project-share";
import { parseShareExpiry } from "@/lib/share-gate";

/** Generate or regenerate the project link, with an optional expiry
 * ("Expires" on the card). */
export async function generateShareLinkAction(projectId: string, formData?: FormData) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");
  const shareExpiresAt = parseShareExpiry(formData);

  await prisma.project.update({
    where: { id: projectId },
    data: { shareToken: generateShareToken(), shareExpiresAt },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function revokeShareLinkAction(projectId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");

  await prisma.project.update({ where: { id: projectId }, data: { shareToken: null, shareExpiresAt: null } });
  revalidatePath(`/projects/${projectId}`);
}

export async function setShareTasksAction(projectId: string, shareTasks: boolean) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");

  await prisma.project.update({ where: { id: projectId }, data: { shareTasks } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
}
