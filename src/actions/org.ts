"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole, ACTIVE_ORG_COOKIE } from "@/lib/org-context";
import { orgGeneralSchema, orgSecuritySchema } from "@/lib/validations/invoice";
import { emailDomain, isClaimableDomain } from "@/lib/org";
import { sendEmail } from "@/lib/email";
import { InviteEmail } from "@/emails/invite-email";
import { getOrigin } from "@/lib/url";
import type { ActionState } from "@/actions/auth";
import type { Role } from "@/generated/prisma/client";
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

export async function updateOrgGeneralAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const parsed = orgGeneralSchema.safeParse({
    name: formData.get("name"),
    invoicePrefix: formData.get("invoicePrefix"),
    defaultCurrency: formData.get("defaultCurrency"),
    defaultTaxRate: formData.get("defaultTaxRate"),
    overheadPercent: formData.get("overheadPercent"),
    expenseApprovalThreshold: formData.get("expenseApprovalThreshold"),
    externalBillingLabel: formData.get("externalBillingLabel"),
    externalBillingUrl: formData.get("externalBillingUrl"),
    slackWebhookUrl: formData.get("slackWebhookUrl"),
    defaultPaymentTerms: formData.get("defaultPaymentTerms") || undefined,
    timesheetApproval: formData.get("timesheetApproval") || undefined,
    brandColor: formData.get("brandColor"),
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
      overheadPercent: parsed.data.overheadPercent,
      expenseApprovalThreshold: parsed.data.expenseApprovalThreshold,
      externalBillingLabel: parsed.data.externalBillingLabel || null,
      externalBillingUrl: parsed.data.externalBillingUrl || null,
      slackWebhookUrl: parsed.data.slackWebhookUrl || null,
      defaultPaymentTerms: parsed.data.defaultPaymentTerms,
      timesheetApproval: parsed.data.timesheetApproval,
      brandColor: parsed.data.brandColor || null,
    },
  });

  revalidatePath("/settings");
  return null;
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export async function uploadOrgLogoAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file." };
  }
  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    return { error: "Logo must be a PNG, JPEG, WebP, or SVG image." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { error: "Logo must be under 2MB." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await prisma.organization.update({
    where: { id: org.id },
    data: { logoData: bytes, logoContentType: file.type },
  });

  revalidatePath("/", "layout");
  return null;
}

export async function removeOrgLogoAction() {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  await prisma.organization.update({
    where: { id: org.id },
    data: { logoData: null, logoContentType: null, logoUrl: null },
  });
  revalidatePath("/", "layout");
}

export async function updateAppBrandingAction(formData: FormData) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      appBranding: formData.get("appBranding") === "on",
      appAccentFromBrand: formData.get("appAccentFromBrand") === "on",
    },
  });
  // Sidebar, login page, and accent color all live in layouts.
  revalidatePath("/", "layout");
}

export async function updateOrgSecurityAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const parsed = orgSecuritySchema.safeParse({
    domain: formData.get("domain"),
    autoJoinDomain: formData.get("autoJoinDomain") === "on",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const newDomain = parsed.data.domain || null;
  if (newDomain && newDomain !== org.domain) {
    // Only allow claiming a domain you can actually prove ownership of —
    // otherwise anyone could type in another company's domain and start
    // auto-joining their teammates into this org.
    if (!user.email || emailDomain(user.email) !== newDomain) {
      return {
        fieldErrors: {
          domain: ["You can only set a domain that matches your own email address."],
        },
      };
    }
    if (!isClaimableDomain(newDomain)) {
      return {
        fieldErrors: { domain: ["Free email providers can't be used as an org domain."] },
      };
    }
    const taken = await prisma.organization.findUnique({ where: { domain: newDomain } });
    if (taken && taken.id !== org.id) {
      return { fieldErrors: { domain: ["This domain is already claimed by another organization."] } };
    }
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      domain: newDomain,
      autoJoinDomain: parsed.data.autoJoinDomain,
    },
  });

  revalidatePath("/settings/security");
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
  const inviteUrl = `${origin}/invite/${invite.token}`;
  const emailSent = await sendEmail({
    to: email,
    subject: `You're invited to join ${org.name} on Consultainer`,
    react: InviteEmail({
      orgName: org.name,
      inviterName: user.name ?? "A teammate",
      inviteUrl,
      origin,
    }),
  });

  revalidatePath("/settings/members");
  return { inviteUrl, emailSent };
}

export async function revokeInviteAction(inviteId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  await prisma.invite.delete({
    where: { id: inviteId, orgId: org.id },
  });

  revalidatePath("/settings/members");
}

/**
 * Loads a membership another owner/admin wants to change or remove. Admins
 * can't act on owners; owners can, but never on the last owner left.
 */
async function requireManageableMember(
  membershipId: string,
  orgId: string,
  actorRole: Role
) {
  const target = await prisma.membership.findUnique({ where: { id: membershipId } });
  if (!target || target.orgId !== orgId) throw new Error("Member not found.");
  if (target.role === "OWNER") {
    if (actorRole !== "OWNER") throw new Error("Only an owner can change or remove an owner.");
    const owners = await prisma.membership.count({ where: { orgId, role: "OWNER" } });
    if (owners <= 1) throw new Error("An organization needs at least one owner.");
  }
  return target;
}

export async function updateMemberRoleAction(membershipId: string, newRole: "ADMIN" | "MEMBER") {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);
  // Server actions take untrusted input: nobody can grant OWNER this way.
  if (newRole !== "ADMIN" && newRole !== "MEMBER") throw new Error("Invalid role.");
  await requireManageableMember(membershipId, org.id, role);

  await prisma.membership.update({
    where: { id: membershipId, orgId: org.id },
    data: { role: newRole },
  });

  revalidatePath("/settings/members");
}

export async function updateMemberEmploymentTypeAction(
  membershipId: string,
  employmentType: "EMPLOYEE" | "CONTRACTOR"
) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  await prisma.membership.update({
    where: { id: membershipId, orgId: org.id },
    data: { employmentType },
  });

  revalidatePath("/settings/members");
}

export async function removeMemberAction(membershipId: string) {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const target = await requireManageableMember(membershipId, org.id, role);
  if (target.userId === user.id) throw new Error("You can't remove yourself.");

  await prisma.membership.delete({ where: { id: membershipId } });
  revalidatePath("/settings/members");
}

export async function setMemberCostRateAction(membershipId: string, value: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);
  const membership = await prisma.membership.findUnique({ where: { id: membershipId } });
  if (!membership || membership.orgId !== org.id) throw new Error("Member not found.");
  const trimmed = value.trim();
  const rate = trimmed === "" ? null : Number(trimmed);
  if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100000)) {
    throw new Error("Enter an hourly cost of 0 or more.");
  }
  await prisma.membership.update({ where: { id: membershipId }, data: { costRate: rate } });
  revalidatePath("/settings/members");
  revalidatePath("/reports");
}
