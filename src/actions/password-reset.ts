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

// Per-IP cap on "Forgot password?" requests, in memory: a self-hosted
// instance is one process, and a restart only resets the allowance. The
// per-account cap (selfServiceResetLimited) is the durable one.
const IP_LIMIT = 10;
const IP_WINDOW_MS = 60 * 60 * 1000;
const ipHits = new Map<string, number[]>();

function ipLimited(ip: string) {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  if (ipHits.size > 10_000) ipHits.clear();
  return hits.length > IP_LIMIT;
}

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
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (ipLimited(ip)) return { sent: true };

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

export type ResetLinkResult = { url: string; expiresIn: string } | { error: string };

/** Settings → Members: an owner or admin makes a reset link to hand to a
 * member (works without email). Admins can't do it for owners, nobody for
 * themselves, and not for anyone who has to sign in with SSO. */
export async function createPasswordResetLinkAction(membershipId: string): Promise<ResetLinkResult> {
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

  return { url: `${await getOrigin()}/login/reset/${token}`, expiresIn: "24 hours" };
}
