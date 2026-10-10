import "server-only";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

/**
 * Prisma `where` fragment restricting a project query to what this actor can
 * see: everything for OWNER/ADMIN, or non-confidential projects plus any
 * confidential ones they're explicitly assigned to (need-to-know) otherwise.
 * Spread into any `project.findMany`/`include: { projects: {...} }` call.
 */
export function projectVisibilityWhere(userId: string, role: Role) {
  if (role === "OWNER" || role === "ADMIN") return {};
  return {
    OR: [{ confidential: false }, { members: { some: { userId } } }],
  };
}

/**
 * Prisma `where` fragment for invoices this actor can see: all for
 * OWNER/ADMIN; otherwise none with a line on a confidential project they
 * aren't on (an invoice's lines and total would reveal that project's work).
 */
export function invoiceVisibilityWhere(userId: string, role: Role) {
  if (role === "OWNER" || role === "ADMIN") return {};
  return {
    NOT: {
      lineItems: { some: { project: { confidential: true, members: { none: { userId } } } } },
    },
  };
}

export async function canViewProject(
  project: { id: string; confidential: boolean },
  userId: string,
  role: Role
): Promise<boolean> {
  if (role === "OWNER" || role === "ADMIN") return true;
  if (!project.confidential) return true;
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId } },
  });
  return !!membership;
}

/**
 * Whether a task on this project can be assigned to `userId`: they must be a
 * member of the project's organization and able to see the project (so a
 * confidential project's tasks only go to people on it, or owners/admins).
 */
export async function canAssignOnProject(
  project: { id: string; orgId: string; confidential: boolean },
  userId: string
): Promise<boolean> {
  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId: project.orgId } },
  });
  if (!membership) return false;
  return canViewProject(project, userId, membership.role);
}
