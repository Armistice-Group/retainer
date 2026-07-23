"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole, ACTIVE_ORG_COOKIE } from "@/lib/org-context";
import { orgSettingsSchema } from "@/lib/validations/invoice";
import { sendEmail } from "@/lib/email";
import { InviteEmail } from "@/emails/invite-email";
import { getOrigin } from "@/lib/url";
import type { ActionState } from "@/actions/auth";
import { randomUUID } from "crypto";

export async function switchOrgAction(orgId: string) {
  const { memberships } = await requireOrgContext();
  const isMember = memberships.some((m) => m.orgId === orgId);
  if (!isMember) throw new Error("You are not a member of that organization.");

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  revalidatePath("/", "layout");
}

export async function updateOrgSettingsAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const parsed = orgSettingsSchema.safeParse({
    name: formData.get("name"),
    invoicePrefix: formData.get("invoicePrefix"),
    defaultCurrency: formData.get("defaultCurrency"),
    defaultTaxRate: formData.get("defaultTaxRate"),
    externalBillingLabel: formData.get("externalBillingLabel"),
    externalBillingUrl: formData.get("externalBillingUrl"),
    slackWebhookUrl: formData.get("slackWebhookUrl"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      name: parsed.data.name,
      invoicePrefix: parsed.data.invoicePrefix,
      defaultCurrency: parsed.data.defaultCurrency,
      defaultTaxRate: parsed.data.defaultTaxRate,
      externalBillingLabel: parsed.data.externalBillingLabel || null,
      externalBillingUrl: parsed.data.externalBillingUrl || null,
      slackWebhookUrl: parsed.data.slackWebhookUrl || null,
    },
  });

  revalidatePath("/settings");
  return null;
}

export async function createInviteAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const email = (formData.get("email") as string)?.toLowerCase().trim();
  const inviteRole = (formData.get("role") as string) || "MEMBER";

  if (!email || !email.includes("@")) {
    return { fieldErrors: { email: ["Enter a valid email"] } };
  }
  if (!["ADMIN", "MEMBER"].includes(inviteRole)) {
    return { error: "Invalid role" };
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);

  const invite = await prisma.invite.create({
    data: {
      token: randomUUID(),
      email,
      role: inviteRole as "ADMIN" | "MEMBER",
      orgId: org.id,
      invitedById: user.id,
      expiresAt,
    },
  });

  const origin = await getOrigin();
  await sendEmail({
    to: email,
    subject: `You're invited to join ${org.name} on Retainer`,
    react: InviteEmail({
      orgName: org.name,
      inviterName: user.name ?? "A teammate",
      inviteUrl: `${origin}/invite/${invite.token}`,
    }),
  });

  revalidatePath("/settings/members");
  return null;
}

export async function revokeInviteAction(inviteId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  await prisma.invite.delete({
    where: { id: inviteId, orgId: org.id },
  });

  revalidatePath("/settings/members");
}

export async function updateMemberRoleAction(membershipId: string, newRole: "ADMIN" | "MEMBER") {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  await prisma.membership.update({
    where: { id: membershipId, orgId: org.id },
    data: { role: newRole },
  });

  revalidatePath("/settings/members");
}

export async function removeMemberAction(membershipId: string) {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const target = await prisma.membership.findUnique({ where: { id: membershipId } });
  if (!target || target.orgId !== org.id) throw new Error("Member not found.");
  if (target.userId === user.id) throw new Error("You can't remove yourself.");

  await prisma.membership.delete({ where: { id: membershipId } });
  revalidatePath("/settings/members");
}
