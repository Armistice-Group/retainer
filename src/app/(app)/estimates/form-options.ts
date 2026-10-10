import "server-only";
import { prisma } from "@/lib/prisma";
import { projectVisibilityWhere } from "@/lib/project-access";
import type { Role } from "@/generated/prisma/client";

/** Clients and the projects this person can see, for the estimate form. */
export async function estimateFormOptions(orgId: string, userId: string, role: Role) {
  const [clients, projects] = await Promise.all([
    prisma.client.findMany({
      // Discarded drafts aren't offered; other drafts are (an estimate is
      // often the next step after an intake call).
      where: { orgId, NOT: { status: "LEAD", leadDiscardedAt: { not: null } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true },
    }),
    prisma.project.findMany({
      where: { orgId, status: { not: "ARCHIVED" }, ...projectVisibilityWhere(userId, role) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, clientId: true },
    }),
  ]);
  return {
    clients: clients.map((c) => ({ id: c.id, name: c.status === "LEAD" ? `${c.name} (draft client)` : c.name })),
    projects,
  };
}
