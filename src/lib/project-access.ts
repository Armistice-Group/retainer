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
