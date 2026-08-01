"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";

export async function disconnectQuickBooksAction() {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  await prisma.quickBooksConnection.deleteMany({ where: { orgId: org.id } });
  revalidatePath("/settings");
}

export async function disconnectGithubAction() {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  await prisma.githubConnection.deleteMany({ where: { orgId: org.id } });
  revalidatePath("/settings");
}
