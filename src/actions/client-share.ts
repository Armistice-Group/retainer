"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { generateShareToken } from "@/lib/services/project-share";

export async function generateClientShareLinkAction(clientId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || client.orgId !== org.id) throw new Error("Client not found.");

  await prisma.client.update({
    where: { id: clientId },
    data: { shareToken: generateShareToken() },
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function revokeClientShareLinkAction(clientId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || client.orgId !== org.id) throw new Error("Client not found.");

  await prisma.client.update({ where: { id: clientId }, data: { shareToken: null } });
  revalidatePath(`/clients/${clientId}`);
}
