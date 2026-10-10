import "server-only";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { sendAlert } from "@/lib/alerts";

/** Links people ask for themselves ("Forgot password?"). */
export const SELF_SERVICE_RESET_TTL_MS = 60 * 60 * 1000;
/** Links an owner/admin creates to hand over by chat or in person. */
export const ADMIN_RESET_TTL_MS = 24 * 60 * 60 * 1000;
/** Self-service emails per account per hour; further requests are dropped
 * silently (the response is the same either way). */
const SELF_SERVICE_PER_HOUR = 3;

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

/** True when this account already got its hourly allowance of reset emails. */
export async function selfServiceResetLimited(userId: string) {
  const recent = await prisma.passwordResetToken.count({
    where: {
      userId,
      createdById: null,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  return recent >= SELF_SERVICE_PER_HOUR;
}

/** Issues a single-use reset token and returns the raw value (only ever put
 * in the link — the database keeps a SHA-256 of it). Any older unused
 * tokens for the account stop working. */
export async function issuePasswordResetToken(
  userId: string,
  { ttlMs, createdById = null }: { ttlMs: number; createdById?: string | null }
) {
  const raw = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    }),
    prisma.passwordResetToken.create({
      data: {
        tokenHash: hashToken(raw),
        userId,
        createdById,
        expiresAt: new Date(now.getTime() + ttlMs),
      },
    }),
  ]);
  return raw;
}

/** The unused, unexpired token for a raw link value, with its user. */
export async function findValidResetToken(raw: string) {
  if (!raw || raw.length > 200) return null;
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) return null;
  return record;
}

/** Sets the new password and uses up the token. Also signs the account out
 * everywhere (sessionVersion) and drops its other reset and login links.
 * Two-factor settings and passkeys are left exactly as they were. Returns
 * false if the token was already used (e.g. a double submit). */
export async function consumePasswordReset(tokenId: string, userId: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: tokenId, userId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;
    await tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
    const user = await tx.user.update({
      where: { id: userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
      select: { email: true },
    });
    await tx.magicLinkToken.deleteMany({ where: { email: user.email, usedAt: null } });
    return true;
  });
}

async function orgIdsOf(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { orgId: true },
  });
  return memberships.map((m) => m.orgId);
}

/** Audit + security alert for a completed reset, in every org the person
 * belongs to. Never throws. */
export async function recordPasswordReset(user: { id: string; name: string; email: string }, viaAdminLink: boolean) {
  const orgIds = await orgIdsOf(user.id);
  await recordAuditEvent(prisma, {
    orgIds,
    actorId: user.id,
    action: "password_reset",
    entityType: "User",
    entityId: user.id,
    entityLabel: user.email,
  });
  for (const orgId of orgIds) {
    await sendAlert({
      orgId,
      event: "SECURITY_ALERT",
      notificationType: "SECURITY_ALERT",
      message: `${user.name} reset their password${viaAdminLink ? " with a link an admin created" : ""}. Their other sessions were signed out.`,
      link: `/settings/audit?action=password_reset`,
      excludeUserId: user.id,
    });
  }
}

/** Audit + security alert for an owner/admin creating a reset link. */
export async function recordResetLinkCreated(params: {
  orgId: string;
  actor: { id: string; name: string | null | undefined };
  target: { id: string; name: string; email: string };
}) {
  await recordAuditEvent(prisma, {
    orgIds: [params.orgId],
    actorId: params.actor.id,
    action: "password_reset_link",
    entityType: "User",
    entityId: params.target.id,
    entityLabel: params.target.email,
  });
  await sendAlert({
    orgId: params.orgId,
    event: "SECURITY_ALERT",
    notificationType: "SECURITY_ALERT",
    message: `${params.actor.name ?? "Someone"} created a password reset link for ${params.target.name}.`,
    link: `/settings/audit?action=password_reset_link`,
    excludeUserId: params.actor.id,
  });
}
