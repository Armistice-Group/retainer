"use server";

import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { getOrigin } from "@/lib/url";
import { rateLimited, requestIp } from "@/lib/rate-limit";
import { ShareCodeEmail } from "@/emails/share-code-email";
import {
  SHARE_CODE_MAX_ATTEMPTS,
  SHARE_CODE_TTL_MS,
  SHARE_SESSION_TTL_MS,
  challengeCookieName,
  hashesEqual,
  newRandomToken,
  newShareCode,
  resolveShare,
  sessionCookieName,
  sha256,
  shareCodeHash,
  shareCookieOptions,
  shareUnavailableMessage,
  verificationRequired,
  type ShareKind,
} from "@/lib/share-gate";

// The public side of share-page verification: no login, so every input is
// untrusted and every answer avoids saying whether an address is on file.

export type ShareGateState = { error?: string; sent?: boolean; restart?: boolean } | null;

const HOUR = 60 * 60 * 1000;
/** Code emails per IP per hour, across all clients. */
const SEND_PER_IP = 20;
/** Code emails per address per client per hour. */
const SEND_PER_EMAIL = 5;
/** Code guesses per IP per hour (each code also allows only 5). */
const VERIFY_PER_IP = 50;

const NOT_AVAILABLE = "This link isn't available.";
const TOO_MANY_REQUESTS = "Too many requests. Wait a while and try again.";
const WRONG_CODE = "That code is wrong or has expired.";
const TOO_MANY_TRIES = "Too many wrong codes. Ask for a new code.";

function parseKind(kind: string): ShareKind | null {
  return kind === "client" || kind === "project" ? kind : null;
}

/** Step 1: the visitor's email. Sends a code only when it's a contact of
 * this client, but answers the same either way. */
export async function requestShareCodeAction(
  kindRaw: string,
  token: string,
  _prev: ShareGateState,
  formData: FormData
): Promise<ShareGateState> {
  const kind = parseKind(kindRaw);
  const target = kind ? await resolveShare(kind, token) : null;
  if (!target || target.expired) return { error: NOT_AVAILABLE };
  const { client } = target;
  if (!verificationRequired(client.org.requireShareVerification, client.shareVerification)) {
    redirect(target.path);
  }
  if (!(await isEmailConfigured())) return { error: shareUnavailableMessage(client.org.name) };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.email().safeParse(email).success || email.length > 320) {
    return { error: "Enter a valid email address." };
  }

  const h = await headers();
  const ip = requestIp(h);
  if (await rateLimited(`share-code:ip:${ip ?? "unknown"}`, SEND_PER_IP, HOUR)) {
    return { error: TOO_MANY_REQUESTS };
  }
  if (await rateLimited(`share-code:email:${client.id}:${email}`, SEND_PER_EMAIL, HOUR)) {
    return { error: TOO_MANY_REQUESTS };
  }

  // Every request gets a challenge cookie, matched or not, so the next step
  // looks the same whether a code was sent.
  const challenge = newRandomToken();
  const challengeHash = sha256(challenge);
  (await cookies()).set(
    challengeCookieName(client.id),
    challenge,
    await shareCookieOptions(SHARE_CODE_TTL_MS)
  );

  const contact = await prisma.contact.findFirst({
    where: { clientId: client.id, email: { equals: email, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!contact) return { sent: true };

  const code = newShareCode();
  const now = new Date();
  await prisma.$transaction([
    // Only the newest code works.
    prisma.shareCode.updateMany({
      where: { clientId: client.id, contactId: contact.id, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.shareCode.deleteMany({
      where: { clientId: client.id, expiresAt: { lt: new Date(now.getTime() - 24 * HOUR) } },
    }),
    prisma.shareCode.create({
      data: {
        challengeHash,
        codeHash: shareCodeHash(challengeHash, code),
        email,
        clientId: client.id,
        contactId: contact.id,
        ip,
        expiresAt: new Date(now.getTime() + SHARE_CODE_TTL_MS),
      },
    }),
  ]);

  const origin = await getOrigin();
  // After the response, so a match doesn't take visibly longer.
  after(async () => {
    try {
      await sendEmail({
        to: email,
        subject: `Your code for ${client.org.name}`,
        react: ShareCodeEmail({ code, orgName: client.org.name, name: contact.name, origin }),
      });
    } catch (err) {
      console.warn("[share-gate] Failed to send code email", err);
    }
  });
  return { sent: true };
}

/** Step 2: the code. On success, sets the 30-day session cookie and reloads
 * the page. */
export async function verifyShareCodeAction(
  kindRaw: string,
  token: string,
  _prev: ShareGateState,
  formData: FormData
): Promise<ShareGateState> {
  const kind = parseKind(kindRaw);
  const target = kind ? await resolveShare(kind, token) : null;
  if (!target || target.expired) return { error: NOT_AVAILABLE };
  const { client } = target;
  if (!verificationRequired(client.org.requireShareVerification, client.shareVerification)) {
    redirect(target.path);
  }

  const jar = await cookies();
  const challenge = jar.get(challengeCookieName(client.id))?.value;
  if (!challenge || challenge.length > 200) {
    return { error: "Your code has expired. Ask for a new one.", restart: true };
  }
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from the email." };

  const h = await headers();
  const ip = requestIp(h);
  if (await rateLimited(`share-verify:ip:${ip ?? "unknown"}`, VERIFY_PER_IP, HOUR)) {
    return { error: TOO_MANY_REQUESTS };
  }

  const challengeHash = sha256(challenge);
  const record = await prisma.shareCode.findUnique({
    where: { challengeHash },
    include: { contact: { select: { id: true, name: true, email: true, clientId: true } } },
  });
  const now = new Date();
  if (!record || record.clientId !== client.id || record.usedAt || record.expiresAt <= now) {
    return { error: WRONG_CODE, restart: true };
  }

  // Use up one try before comparing, so parallel guesses can't exceed it.
  const tried = await prisma.shareCode.updateMany({
    where: { id: record.id, usedAt: null, attempts: { lt: SHARE_CODE_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (tried.count !== 1) return { error: TOO_MANY_TRIES, restart: true };

  if (!hashesEqual(shareCodeHash(challengeHash, code), record.codeHash)) {
    return record.attempts + 1 >= SHARE_CODE_MAX_ATTEMPTS
      ? { error: TOO_MANY_TRIES, restart: true }
      : { error: WRONG_CODE };
  }

  const claimed = await prisma.shareCode.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  const { contact } = record;
  if (
    claimed.count !== 1 ||
    contact.clientId !== client.id ||
    !contact.email ||
    contact.email.trim().toLowerCase() !== record.email
  ) {
    return { error: WRONG_CODE, restart: true };
  }

  const raw = newRandomToken();
  await prisma.shareSession.create({
    data: {
      tokenHash: sha256(raw),
      email: record.email,
      clientId: client.id,
      contactId: contact.id,
      ip,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      expiresAt: new Date(now.getTime() + SHARE_SESSION_TTL_MS),
    },
  });
  jar.set(sessionCookieName(client.id), raw, await shareCookieOptions(SHARE_SESSION_TTL_MS));
  jar.set(challengeCookieName(client.id), "", await shareCookieOptions(0));

  await recordAuditEvent(prisma, {
    orgIds: [client.orgId],
    actorId: null,
    via: "share",
    action: "share_verify",
    entityType: "Client",
    entityId: client.id,
    entityLabel: `${contact.name} (${record.email}) on ${client.name}`,
  });

  redirect(target.path);
}

/** "Use a different email": drops the pending code request. */
export async function restartShareGateAction(kindRaw: string, token: string) {
  const kind = parseKind(kindRaw);
  const target = kind ? await resolveShare(kind, token) : null;
  if (!target) redirect("/");
  (await cookies()).set(challengeCookieName(target.client.id), "", await shareCookieOptions(0));
  redirect(target.path);
}
