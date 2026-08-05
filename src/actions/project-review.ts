"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function approveContractorAction(token: string) {
  const member = await prisma.projectMember.findUnique({ where: { approvalToken: token } });
  if (!member || member.approvalStatus !== "PENDING") {
    throw new Error("This review link is no longer valid.");
  }
  await prisma.projectMember.update({
    where: { id: member.id },
    data: { approvalStatus: "APPROVED", approvalRespondedAt: new Date() },
  });
  revalidatePath(`/review/${token}`);
  revalidatePath(`/projects/${member.projectId}`);
}

export async function rejectContractorAction(token: string) {
  const member = await prisma.projectMember.findUnique({ where: { approvalToken: token } });
  if (!member || member.approvalStatus !== "PENDING") {
    throw new Error("This review link is no longer valid.");
  }
  await prisma.projectMember.update({
    where: { id: member.id },
    data: { approvalStatus: "REJECTED", approvalRespondedAt: new Date() },
  });
  revalidatePath(`/review/${token}`);
  revalidatePath(`/projects/${member.projectId}`);
}
