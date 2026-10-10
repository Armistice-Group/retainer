import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { InvalidTwoFactorCodeError, verifyLoginTwoFactor } from "@/lib/two-factor";

/**
 * The second step of "Continue with Google" for an account with an
 * authenticator app. Google's callback doesn't create a session for these
 * accounts at all: the signIn callback issues one of these tickets and
 * redirects to /login/two-factor/<ticket>, and only the "google-two-factor"
 * provider — which needs the ticket AND a valid code — creates the session.
 * So there's no half-signed-in cookie to replay against pages, server
 * actions, API routes or the MCP endpoint.
 */
const TICKET_TTL_MS = 10 * 60 * 1000;
/** Wrong codes allowed per ticket before it's thrown away (sign in with
 * Google again to get a new one). */
export const MAX_TICKET_ATTEMPTS = 5;

function hashTicket(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

/** Issues a single-use ticket for this user and returns the raw value (only
 * ever put in the redirect URL — the database keeps a SHA-256). */
export async function issueTwoFactorLoginTicket(userId: string) {
  const raw = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.$transaction([
    // One pending Google sign-in per account; expired ones are cleaned up too.
    prisma.twoFactorLoginTicket.deleteMany({
      where: { OR: [{ userId }, { expiresAt: { lt: now } }] },
    }),
    prisma.twoFactorLoginTicket.create({
      data: { tokenHash: hashTicket(raw), userId, expiresAt: new Date(now.getTime() + TICKET_TTL_MS) },
    }),
  ]);
  return raw;
}

/** Whether a raw ticket is still usable (for the code page to show the
 * form or an "expired" message). */
export async function twoFactorLoginTicketValid(raw: string) {
  if (!raw || raw.length > 200) return false;
  const record = await prisma.twoFactorLoginTicket.findUnique({
    where: { tokenHash: hashTicket(raw) },
    select: { expiresAt: true, failedAttempts: true },
  });
  return !!record && record.expiresAt > new Date() && record.failedAttempts < MAX_TICKET_ATTEMPTS;
}

/**
 * Checks the code for a ticket. Returns the user id and uses up the ticket
 * on success; returns null for an unknown/expired/used ticket; throws
 * InvalidTwoFactorCodeError for a wrong code (counting the attempt and
 * dropping the ticket after MAX_TICKET_ATTEMPTS).
 */
export async function redeemTwoFactorLoginTicket(raw: string, code: string) {
  if (!raw || raw.length > 200) return null;
  const record = await prisma.twoFactorLoginTicket.findUnique({
    where: { tokenHash: hashTicket(raw) },
  });
  if (!record) return null;
  if (record.expiresAt < new Date() || record.failedAttempts >= MAX_TICKET_ATTEMPTS) {
    await prisma.twoFactorLoginTicket.deleteMany({ where: { id: record.id } });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    select: { id: true, twoFactorEnabled: true, twoFactorSecret: true },
  });
  if (!user) return null;

  // 2FA turned off since the ticket was issued: the Google step alone was
  // all this account needed, but stay strict and make them start over.
  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    await prisma.twoFactorLoginTicket.deleteMany({ where: { id: record.id } });
    return null;
  }

  const ok = await verifyLoginTwoFactor(user.id, user.twoFactorSecret, code);
  if (!ok) {
    const updated = await prisma.twoFactorLoginTicket.updateMany({
      where: { id: record.id },
      data: { failedAttempts: { increment: 1 } },
    });
    if (updated.count === 0) return null;
    throw new InvalidTwoFactorCodeError();
  }

  // Claim it exactly once (two submits racing with the same valid code).
  const claimed = await prisma.twoFactorLoginTicket.deleteMany({
    where: { id: record.id, failedAttempts: { lt: MAX_TICKET_ATTEMPTS } },
  });
  if (claimed.count !== 1) return null;
  return user.id;
}
