import "server-only";
import { prisma } from "@/lib/prisma";

type Rate = { toString(): string } | number | null | undefined;

/** A person's default hourly bill rate: their own, else the org's, else 0. */
export function resolveBillRate(memberRate: Rate, orgRate: Rate): number {
  if (memberRate != null) return Number(memberRate);
  if (orgRate != null) return Number(orgRate);
  return 0;
}

/** The rate someone starts at when they're put on a project in this org. */
export async function defaultBillRateFor(orgId: string, userId: string): Promise<number> {
  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { billRate: true, org: { select: { defaultBillRate: true } } },
  });
  return resolveBillRate(membership?.billRate, membership?.org.defaultBillRate);
}
