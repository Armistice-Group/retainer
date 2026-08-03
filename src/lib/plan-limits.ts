import "server-only";
import { prisma } from "@/lib/prisma";

// Matches the limits advertised on the pricing page (landing-page.tsx) — keep
// these in sync if that copy changes.
export const FREE_CLIENT_LIMIT = 2;
export const FREE_MEMBER_LIMIT = 1;

export async function canAddClient(orgId: string, plan: "FREE" | "PAID") {
  if (plan === "PAID") return true;
  const count = await prisma.client.count({ where: { orgId } });
  return count < FREE_CLIENT_LIMIT;
}

export async function canAddMember(orgId: string, plan: "FREE" | "PAID") {
  if (plan === "PAID") return true;
  const count = await prisma.membership.count({ where: { orgId } });
  return count < FREE_MEMBER_LIMIT;
}

export const UPGRADE_MESSAGE_CLIENTS = `Free plan is limited to ${FREE_CLIENT_LIMIT} clients. Upgrade in Settings → Billing to add more.`;
export const UPGRADE_MESSAGE_MEMBERS = `Free plan is limited to ${FREE_MEMBER_LIMIT} team member. Upgrade in Settings → Billing to invite more.`;
