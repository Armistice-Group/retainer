"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { strongPasswordSchema } from "@/lib/validations/password";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { getOrigin } from "@/lib/url";
import { isLocalLoginBlocked } from "@/lib/integrations/sso-policy";
import { rateLimited, requestIp } from "@/lib/rate-limit";
import { PasswordResetEmail } from "@/emails/password-reset-email";
import {
  ADMIN_RESET_TTL_MS,
  SELF_SERVICE_RESET_TTL_MS,
  consumePasswordReset,
  findValidResetToken,
  issuePasswordResetToken,
  recordPasswordReset,
  recordResetLinkCreated,
  selfServiceResetLimited,
} from "@/lib/password-reset";

export type PasswordResetState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  sent?: boolean;
  done?: boolean;
} | null;

// Per-IP cap on "Forgot password?" requests (lib/rate-limit, kept in the
// database). The per-account cap (selfServiceResetLimited) is separate.
const IP_LIMIT = 10;
const IP_WINDOW_MS = 60 * 60 * 1000;

/** "Forgot password?" on the login page. Always answers the same way,
 * whether or not the account exists, so it can't be used to find out who
 * has one; the email itself goes out after the response. */
export async function requestPasswordResetAction(
  _prev: PasswordResetState,
  formData: FormData
): Promise<PasswordResetState> {
  const email = ((formData.get("email") as string) || "").toLowerCase().trim();
  if (!z.email().safeParse(email).success) {
    return { fieldErrors: { email: ["Enter a valid email"] } };
  }
  if (!(await isEmailConfigured())) {
    return { error: "Email isn't set up on this server. Ask an owner or admin for a reset link." };
  }

  const h = await headers();
  const ip = requestIp(h) ?? "unknown";
  if (await rateLimited(`password-reset:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS)) return { sent: true };

  const origin = await getOrigin();
  after(async () => {
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return;
      // SSO-only accounts sign in through the identity provider; a local
      // password would be refused at login anyway.
      if (await isLocalLoginBlocked(user.id)) return;
      if (await selfServiceResetLimited(user.id)) return;

      const token = await issuePasswordResetToken(user.id, { ttlMs: SELF_SERVICE_RESET_TTL_MS });
      await sendEmail({
        to: user.email,
        subject: "Reset your Consultainer password",
        react: PasswordResetEmail({
          name: user.name,
          resetUrl: `${origin}/login/reset/${token}`,
          origin,
          expiresIn: "1 hour",
        }),
      });
    } catch (err) {
      console.warn("[password-reset] Failed to send reset email", err);
    }
  });

  return { sent: true };
}

const resetSchema = z
  .object({ password: strongPasswordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

/** The reset page's form: sets the new password from a valid link. */
export async function resetPasswordAction(
  _prev: PasswordResetState,
  formData: FormData
): Promise<PasswordResetState> {
  const raw = (formData.get("token") as string) || "";
  const record = await findValidResetToken(raw);
  if (!record) return { error: "This reset link is invalid or has expired. Request a new one." };

  const parsed = resetSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  if (await isLocalLoginBlocked(record.userId)) {
    return { error: "Your organization requires signing in with SSO, so there's no password to reset." };
  }

  const ok = await consumePasswordReset(record.id, record.userId, parsed.data.password);
  if (!ok) return { error: "This reset link is invalid or has expired. Request a new one." };

  await recordPasswordReset(record.user, !!record.createdById);
  return { done: true };
}

export type ResetLinkResult =
  | {
      url: string;
      expiresIn: string;
      /** Set when the link was emailed to them. */
      emailedTo?: string;
      /** Asked to email it, but sending failed — share `url` yourself. */
      emailFailed?: boolean;
    }
  | { error: string };

/** Settings → Members: an owner or admin makes a reset link for a member —
 * emailed to them when email is set up and `delivery` is "email", otherwise
 * shown to copy and hand over. Admins can't do it for owners, nobody for
 * themselves, and not for anyone who has to sign in with SSO. */
export async function createPasswordResetLinkAction(
  membershipId: string,
  delivery: "copy" | "email" = "copy"
): Promise<ResetLinkResult> {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const target = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!target || target.orgId !== org.id) return { error: "Member not found." };
  if (target.userId === user.id) {
    return { error: "Change your own password from your Profile." };
  }
  if (target.role === "OWNER" && role !== "OWNER") {
    return { error: "Only an owner can create a reset link for an owner." };
  }
  if (await isLocalLoginBlocked(target.userId)) {
    return {
      error: `${target.user.name} signs in with SSO — reset their password in your identity provider.`,
    };
  }

  const token = await issuePasswordResetToken(target.userId, {
    ttlMs: ADMIN_RESET_TTL_MS,
    createdById: user.id,
  });
  await recordResetLinkCreated({
    orgId: org.id,
    actor: { id: user.id, name: user.name },
    target: target.user,
  });

  const origin = await getOrigin();
  const url = `${origin}/login/reset/${token}`;
  if (delivery !== "email") return { url, expiresIn: "24 hours" };

  if (!(await isEmailConfigured())) {
    return { url, expiresIn: "24 hours", emailFailed: true };
  }
  const sent = await sendEmail({
    to: target.user.email,
    subject: "Reset your Consultainer password",
    react: PasswordResetEmail({
      name: target.user.name,
      resetUrl: url,
      origin,
      expiresIn: "24 hours",
      createdBy: { name: user.name ?? "An admin", orgName: org.name },
    }),
  });
  return sent
    ? { url, expiresIn: "24 hours", emailedTo: target.user.email }
    : { url, expiresIn: "24 hours", emailFailed: true };
}
