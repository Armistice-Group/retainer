import "server-only";
import { prisma } from "@/lib/prisma";
import { projectVisibilityWhere } from "@/lib/project-access";
import type { Role } from "@/generated/prisma/client";

/** Clients and the projects this person can see, for the estimate form. */
export async function estimateFormOptions(orgId: string, userId: string, role: Role) {
  const [clients, projects] = await Promise.all([
    prisma.client.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      where: { orgId, status: { not: "ARCHIVED" }, ...projectVisibilityWhere(userId, role) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, clientId: true },
    }),
  ]);
  return { clients, projects };
}
