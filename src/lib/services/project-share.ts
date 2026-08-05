import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export function generateShareToken() {
  return randomBytes(24).toString("base64url");
}

export async function getProjectByShareToken(token: string) {
  const project = await prisma.project.findUnique({
    where: { shareToken: token },
    include: {
      client: true,
      org: true,
      milestones: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!project) return null;

  const [loggedAgg, billedAgg, paidAgg] = await Promise.all([
    prisma.timeEntry.aggregate({ where: { projectId: project.id }, _sum: { hours: true } }),
    prisma.invoiceLineItem.aggregate({
      where: { projectId: project.id, invoice: { status: { in: ["SENT", "PAID"] } } },
      _sum: { amount: true },
    }),
    prisma.invoiceLineItem.aggregate({
      where: { projectId: project.id, invoice: { status: "PAID" } },
      _sum: { amount: true },
    }),
  ]);

  return {
    project,
    loggedHours: Number(loggedAgg._sum.hours ?? 0),
    totalBilled: Number(billedAgg._sum.amount ?? 0),
    totalPaid: Number(paidAgg._sum.amount ?? 0),
  };
}
