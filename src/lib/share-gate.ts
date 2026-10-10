import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/email";
import { getRequestOrigin } from "@/lib/url";
import type { ShareVerificationMode } from "@/generated/prisma/client";

// Email verification for client share pages (/share/client/<token> and
// /share/<token> for that client's projects). When it's on for a client, a
// visitor types their email; if it belongs to one of the client's contacts
// they get a 6-digit code, and entering it sets a cookie backed by a
// ShareSession row. Invoice (/i/) and estimate (/e/) links are never gated.

export const SHARE_CODE_TTL_MS = 10 * 60 * 1000;
export const SHARE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SHARE_CODE_MAX_ATTEMPTS = 5;
/** lastSeenAt is only written when it's at least this stale. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export type ShareKind = "client" | "project";

export const sessionCookieName = (clientId: string) => `cshare_${clientId}`;
export const challengeCookieName = (clientId: string) => `cshare_code_${clientId}`;

export function sha256(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

/** The stored form of a code: tied to its challenge, so equal codes on two
 * challenges hash differently. */
export function shareCodeHash(challengeHash: string, code: string) {
  return sha256(`${challengeHash}:${code}`);
}

export function hashesEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function newShareCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function newRandomToken() {
  return randomBytes(32).toString("base64url");
}

export function shareUnavailableMessage(orgName: string) {
  return `This page needs email verification, which isn't available right now. Contact ${orgName}.`;
}

export function verificationRequired(orgDefault: boolean, mode: ShareVerificationMode) {
  return mode === "ON" ? true : mode === "OFF" ? false : orgDefault;
}

export function isShareExpired(expiresAt: Date | null | undefined, now = new Date()) {
  return !!expiresAt && expiresAt.getTime() <= now.getTime();
}

const orgSelect = {
  id: true,
  name: true,
  logoUrl: true,
  logoData: true,
  logoContentType: true,
  requireShareVerification: true,
} as const;

const clientSelect = {
  id: true,
  name: true,
  orgId: true,
  shareVerification: true,
  org: { select: orgSelect },
} as const;

export type ShareTarget = {
  kind: ShareKind;
  token: string;
  /** Where the share page lives, e.g. /share/client/<token>. */
  path: string;
  expired: boolean;
  client: {
    id: string;
    name: string;
    orgId: string;
    shareVerification: ShareVerificationMode;
    org: {
      id: string;
      name: string;
      logoUrl: string | null;
      logoData: Uint8Array | null;
      logoContentType: string | null;
      requireShareVerification: boolean;
    };
  };
};

/** The client behind a share token (client or project link), or null if the
 * token matches nothing. Expired links come back with `expired: true`. */
export async function resolveShare(kind: ShareKind, token: string): Promise<ShareTarget | null> {
  if (!token || token.length > 200) return null;
  if (kind === "client") {
    const client = await prisma.client.findUnique({
      where: { shareToken: token },
      select: { ...clientSelect, shareExpiresAt: true },
    });
    if (!client) return null;
    const { shareExpiresAt, ...rest } = client;
    return {
      kind,
      token,
      path: `/share/client/${encodeURIComponent(token)}`,
      expired: isShareExpired(shareExpiresAt),
      client: rest,
    };
  }
  const project = await prisma.project.findUnique({
    where: { shareToken: token },
    select: { shareExpiresAt: true, client: { select: clientSelect } },
  });
  if (!project) return null;
  return {
    kind,
    token,
    path: `/share/${encodeURIComponent(token)}`,
    expired: isShareExpired(project.shareExpiresAt),
    client: project.client,
  };
}

export type ShareAccess =
  /** Verification is off for this client. */
  | { state: "open" }
  /** A verified contact. */
  | { state: "verified"; contactName: string }
  /** Ask for the code (a code request is pending in this browser). */
  | { state: "code" }
  /** Ask for an email address. */
  | { state: "email" }
  /** Verification is on but email isn't set up: closed. */
  | { state: "unavailable" };

export function accessGranted(access: ShareAccess) {
  return access.state === "open" || access.state === "verified";
}

/** The verified contact for this browser and client, from the session
 * cookie, or null. A session only counts while its contact still has the
 * address that was verified. */
export async function currentShareSession(clientId: string) {
  const raw = (await cookies()).get(sessionCookieName(clientId))?.value;
  if (!raw || raw.length > 200) return null;
  const session = await prisma.shareSession.findUnique({
    where: { tokenHash: sha256(raw) },
    include: { contact: { select: { id: true, name: true, email: true, clientId: true } } },
  });
  const now = new Date();
  if (!session || session.clientId !== clientId || session.expiresAt <= now) return null;
  const { contact } = session;
  if (
    contact.clientId !== clientId ||
    !contact.email ||
    contact.email.trim().toLowerCase() !== session.email.toLowerCase()
  ) {
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await prisma.shareSession
      .update({ where: { id: session.id }, data: { lastSeenAt: now } })
      .catch(() => {});
  }
  return session;
}

/** Who may see a share page right now. Fails closed: with verification on
 * and email not set up, nobody new gets in (an already verified browser,
 * or one holding a code that was already sent, still can). */
export async function getShareAccess(target: ShareTarget): Promise<ShareAccess> {
  const { client } = target;
  if (!verificationRequired(client.org.requireShareVerification, client.shareVerification)) {
    return { state: "open" };
  }
  const session = await currentShareSession(client.id);
  if (session) return { state: "verified", contactName: session.contact.name };
  const challenge = (await cookies()).get(challengeCookieName(client.id))?.value;
  if (challenge) return { state: "code" };
  if (!(await isEmailConfigured())) return { state: "unavailable" };
  return { state: "email" };
}

/** For route handlers under a share link (PDFs, document downloads, Pay
 * now): the same check as the page. Null when the link doesn't exist, has
 * expired, or the visitor hasn't verified. */
export async function authorizeShareRequest(kind: ShareKind, token: string) {
  const target = await resolveShare(kind, token);
  if (!target || target.expired) return null;
  const access = await getShareAccess(target);
  return accessGranted(access) ? target : null;
}

/** Cookie options for the share cookies: Secure when the browser is on
 * https, and sent on top-level navigation from emails (Lax). */
export async function shareCookieOptions(maxAgeMs: number) {
  const origin = await getRequestOrigin();
  return {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

/** Ends every share session (and pending code) for a client — used when its
 * link is regenerated or revoked, or verification is turned off. */
export async function endClientShareSessions(clientIds: string[]) {
  if (clientIds.length === 0) return 0;
  const [sessions] = await prisma.$transaction([
    prisma.shareSession.deleteMany({ where: { clientId: { in: clientIds } } }),
    prisma.shareCode.deleteMany({ where: { clientId: { in: clientIds } } }),
  ]);
  return sessions.count;
}

/** After the org default changes: clients that no longer require
 * verification lose their sessions, so turning it back on later asks
 * everyone again. */
export async function endSessionsWhereVerificationOff(orgId: string, orgDefault: boolean) {
  const clients = await prisma.client.findMany({
    where: {
      orgId,
      OR: [{ shareVerification: "OFF" }, ...(orgDefault ? [] : [{ shareVerification: "INHERIT" as const }])],
      shareSessions: { some: {} },
    },
    select: { id: true },
  });
  return endClientShareSessions(clients.map((c) => c.id));
}

// ─── Link expiry ─────────────────────────────────────────────────────────────

export const SHARE_EXPIRY_CHOICES = ["never", "7", "30", "90", "custom"] as const;

/** Reads the "Expires" fields of a generate/regenerate form. Custom dates
 * run through the end of that day (UTC). Throws on a bad or past date. */
export function parseShareExpiry(formData: FormData | undefined, now = new Date()): Date | null {
  const choice = String(formData?.get("expires") ?? "never");
  if (choice === "never" || !SHARE_EXPIRY_CHOICES.includes(choice as never)) return null;
  if (choice === "custom") {
    const raw = String(formData?.get("expiresOn") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("Pick the date the link should expire.");
    const end = new Date(`${raw}T23:59:59.999Z`);
    if (Number.isNaN(end.getTime()) || end <= now) {
      throw new Error("Pick an expiry date in the future.");
    }
    return end;
  }
  return new Date(now.getTime() + Number(choice) * 24 * 60 * 60 * 1000);
}
