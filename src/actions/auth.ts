"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uniqueOrgSlug } from "@/lib/org";
import { loginSchema, acceptInviteSchema } from "@/lib/validations/auth";
import { notify, getOrgAdminUserIds } from "@/lib/notifications";
import { TwoFactorRequiredError, InvalidTwoFactorCodeError } from "@/lib/two-factor";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { MagicLinkEmail } from "@/emails/magic-link-email";
import { getOrigin } from "@/lib/url";
import { issueMagicLinkToken } from "@/lib/magic-link";
import { SsoRequiredError } from "@/lib/integrations/sso-policy";

export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  requiresTwoFactor?: boolean;
  magicLinkSent?: boolean;
  emailChangePending?: boolean;
  saved?: boolean;
  inviteUrl?: string;
  emailSent?: boolean;
  /** Submitted values echoed back on a validation error, so a form can
   * refill fields (React resets uncontrolled forms after an action). */
  values?: Record<string, string>;
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
  if (!(await isEmailConfigured())) {
    return { error: "Email isn't configured on this instance." };
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
      react: MagicLinkEmail({ loginUrl: `${origin}/login/magic/${token}`, origin }),
    });
  }

  return { magicLinkSent: true };
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
    if (err instanceof SsoRequiredError) {
      return { error: "Your organization requires signing in with SSO." };
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
