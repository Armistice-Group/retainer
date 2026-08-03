"use server";

import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uniqueOrgSlug, findAutoJoinOrg, emailDomain, isClaimableDomain } from "@/lib/org";
import { signupSchema, loginSchema, acceptInviteSchema } from "@/lib/validations/auth";
import { notify, getOrgAdminUserIds } from "@/lib/notifications";
import { TwoFactorRequiredError, InvalidTwoFactorCodeError } from "@/lib/two-factor";
import { sendEmail } from "@/lib/email";
import { MagicLinkEmail } from "@/emails/magic-link-email";
import { VerifySignupEmail } from "@/emails/verify-signup-email";
import { getOrigin } from "@/lib/url";
import { issueMagicLinkToken } from "@/lib/magic-link";

export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  requiresTwoFactor?: boolean;
  magicLinkSent?: boolean;
  pendingVerification?: boolean;
  emailChangePending?: boolean;
} | null;

export async function signInWithGoogleAction(callbackUrl: string) {
  await signIn("google", { redirectTo: callbackUrl || "/dashboard" });
}

export async function requestMagicLinkAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = ((formData.get("email") as string) || "").toLowerCase().trim();
  if (!email || !email.includes("@")) {
    return { fieldErrors: { email: ["Enter a valid email"] } };
  }

  // Always report success regardless of whether the account exists, so this
  // can't be used to enumerate registered emails.
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await issueMagicLinkToken(email, 15 * 60 * 1000);

    const origin = await getOrigin();
    await sendEmail({
      to: email,
      subject: "Your Consultainer login link",
      react: MagicLinkEmail({ loginUrl: `${origin}/login/magic/${token}` }),
    });
  }

  return { magicLinkSent: true };
}

export async function signupAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = signupSchema.safeParse({
    orgName: formData.get("orgName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { orgName, name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { fieldErrors: { email: ["An account with this email already exists."] } };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const autoJoinOrg = await findAutoJoinOrg(email);
  const domain = emailDomain(email);
  const claimableDomain = !autoJoinOrg && domain && isClaimableDomain(domain) ? domain : null;

  if (autoJoinOrg || claimableDomain) {
    // Typing an email doesn't prove you own it — without this, anyone could
    // join an existing org (or squat a domain for a fake one) just by
    // entering someone else's address here. Gate behind a confirmation
    // click before anything (user, org, membership) is actually created.
    const token = randomUUID();
    await prisma.pendingSignup.create({
      data: {
        token,
        email,
        name,
        passwordHash,
        orgName,
        autoJoinOrgId: autoJoinOrg?.id ?? null,
        claimableDomain,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const origin = await getOrigin();
    await sendEmail({
      to: email,
      subject: autoJoinOrg
        ? `Confirm your email to join ${autoJoinOrg.name} on Consultainer`
        : `Confirm your email to create ${orgName} on Consultainer`,
      react: VerifySignupEmail({
        verifyUrl: `${origin}/signup/verify/${token}`,
        orgName: autoJoinOrg?.name ?? orgName,
        joiningExisting: !!autoJoinOrg,
      }),
    });

    return { pendingVerification: true };
  }

  const slug = await uniqueOrgSlug(orgName);
  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName, slug } });
    const user = await tx.user.create({ data: { name, email, passwordHash } });
    await tx.membership.create({
      data: { userId: user.id, orgId: org.id, role: "OWNER" },
    });
  });

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Try logging in." };
    }
    throw err;
  }

  return null;
}

export async function loginAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const callbackUrl = (formData.get("callbackUrl") as string) || "/dashboard";
  const code = (formData.get("code") as string) || undefined;

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      code,
      redirectTo: callbackUrl,
    });
  } catch (err) {
    if (err instanceof TwoFactorRequiredError) {
      return { requiresTwoFactor: true };
    }
    if (err instanceof InvalidTwoFactorCodeError) {
      return {
        requiresTwoFactor: true,
        fieldErrors: { code: ["Invalid code. Try again."] },
      };
    }
    if (err instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw err;
  }

  return null;
}

export async function acceptInviteAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const token = formData.get("token") as string | null;
  if (!token) return { error: "This invite link is invalid or has expired." };

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return { error: "This invite link is invalid or has expired." };
  }
  if (!invite.email) {
    return { error: "This invite is missing an email address." };
  }

  const email = invite.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  let joined = false;

  // An existing account just accepts the invite — no new credentials needed,
  // so the stricter password schema only applies to genuinely new accounts.
  const parsed = user
    ? acceptInviteSchema.pick({ name: true }).safeParse({ name: formData.get("name") })
    : acceptInviteSchema.safeParse({
        name: formData.get("name"),
        password: formData.get("password"),
      });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { name } = parsed.data;
  let password: string | undefined;

  if (user) {
    const alreadyMember = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: user.id, orgId: invite.orgId } },
    });
    if (!alreadyMember) {
      await prisma.membership.create({
        data: { userId: user.id, orgId: invite.orgId, role: invite.role },
      });
      joined = true;
    }
  } else {
    password = (parsed.data as unknown as { password: string }).password;
    const passwordHash = await bcrypt.hash(password, 12);
    user = await prisma.user.create({
      data: { email, name, passwordHash },
    });
    await prisma.membership.create({
      data: { userId: user.id, orgId: invite.orgId, role: invite.role },
    });
    joined = true;
  }

  await prisma.invite.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });

  if (joined) {
    const adminIds = await getOrgAdminUserIds(prisma, invite.orgId);
    await notify(prisma, {
      orgId: invite.orgId,
      userIds: adminIds,
      type: "MEMBER_JOINED",
      message: `${user.name} joined your organization.`,
      link: "/settings/members",
    });
  }

  try {
    await signIn("credentials", { email, password: password ?? "", redirectTo: "/dashboard" });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invite accepted. Please log in." };
    }
    throw err;
  }

  return null;
}

export async function createOrgAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgName = (formData.get("orgName") as string)?.trim();
  if (!orgName || orgName.length < 2) {
    return { fieldErrors: { orgName: ["Organization name is required"] } };
  }

  const slug = await uniqueOrgSlug(orgName);

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName, slug } });
    await tx.membership.create({
      data: { userId: session.user.id, orgId: org.id, role: "OWNER" },
    });
  });

  redirect("/dashboard");
}
