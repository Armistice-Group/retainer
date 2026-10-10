import "server-only";
import { randomBytes } from "crypto";

/**
 * Lets the CURRENT session survive a User.sessionVersion bump (password
 * change, "Sign out other sessions") while every other session is dropped.
 *
 * The jwt callback rejects any token whose sessionVersion doesn't match the
 * database. To re-issue just this browser's token with the new version, the
 * server action that bumps the version grants a one-time "carry" and passes
 * it to next-auth's update(), which runs the jwt callback in-process with
 * trigger "update". The carry never leaves the server (update() calls Auth
 * directly, not over HTTP), is single use, tied to the user, and lives for a
 * few seconds — so the public POST /api/auth/session (which also reaches the
 * jwt callback with trigger "update") can't be used to revive a signed-out
 * session.
 */
const CARRY_TTL_MS = 15 * 1000;

type Carry = { userId: string; version: number; expiresAt: number };
const globalForCarry = globalThis as unknown as { __sessionCarries?: Map<string, Carry> };
const carries = (globalForCarry.__sessionCarries ??= new Map<string, Carry>());

export function grantSessionCarry(userId: string, version: number) {
  const now = Date.now();
  for (const [key, c] of carries) if (c.expiresAt < now) carries.delete(key);
  const nonce = randomBytes(24).toString("base64url");
  carries.set(nonce, { userId, version, expiresAt: now + CARRY_TTL_MS });
  return nonce;
}

/** The session version this token may move to, or null. Always single use. */
export function takeSessionCarry(nonce: unknown, userId: string): number | null {
  if (typeof nonce !== "string") return null;
  const carry = carries.get(nonce);
  if (!carry) return null;
  carries.delete(nonce);
  if (carry.userId !== userId || carry.expiresAt < Date.now()) return null;
  return carry.version;
}
