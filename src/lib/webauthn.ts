import "server-only";
import { randomUUID } from "crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { getRequestOrigin } from "@/lib/url";

export const RP_NAME = "Consultainer";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const LOGIN_TICKET_TTL_MS = 30 * 1000;

async function rpConfig() {
  const origin = await getRequestOrigin();
  const rpID = new URL(origin).hostname;
  return { origin, rpID };
}

async function storeChallenge(challenge: string, userId: string | null) {
  const { id } = await prisma.webAuthnChallenge.create({
    data: { challenge, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
  return id;
}

/** Consumes (and deletes) a stored challenge — single use, like the magic-link tokens. */
export async function consumeChallenge(challengeId: string) {
  const record = await prisma.webAuthnChallenge.findUnique({ where: { id: challengeId } });
  if (!record) return null;
  await prisma.webAuthnChallenge.delete({ where: { id: challengeId } });
  if (record.expiresAt < new Date()) return null;
  return record;
}

export async function buildRegistrationOptions(userId: string, userEmail: string, userName: string) {
  const { rpID } = await rpConfig();
  const existing = await prisma.authenticator.findMany({ where: { userId } });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: new TextEncoder().encode(userId),
    userName: userEmail,
    userDisplayName: userName,
    attestationType: "none",
    excludeCredentials: existing.map((a) => ({
      id: a.credentialId,
      transports: a.transports ? (a.transports.split(",") as AuthenticatorTransportFuture[]) : undefined,
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });

  const challengeId = await storeChallenge(options.challenge, userId);
  return { options, challengeId };
}

export async function verifyRegistration(
  challengeId: string,
  userId: string,
  response: Parameters<typeof verifyRegistrationResponse>[0]["response"]
) {
  const challenge = await consumeChallenge(challengeId);
  if (!challenge || challenge.userId !== userId) {
    throw new Error("This registration request expired. Try again.");
  }

  const { origin, rpID } = await rpConfig();
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Couldn't verify this passkey. Try again.");
  }

  const { credential } = verification.registrationInfo;
  return prisma.authenticator.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: credential.transports?.join(",") ?? null,
    },
  });
}

export async function buildAuthenticationOptions() {
  const { rpID } = await rpConfig();
  // No allowCredentials — discoverable/usernameless flow, the authenticator
  // itself lists which of its resident keys match this rpID.
  // User verification (PIN or biometric) is required at sign-in: that's what
  // makes a passkey sign-in two factors, so it skips the authenticator code.
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
  });
  const challengeId = await storeChallenge(options.challenge, null);
  return { options, challengeId };
}

export async function verifyAuthentication(
  challengeId: string,
  response: Parameters<typeof verifyAuthenticationResponse>[0]["response"]
) {
  const challenge = await consumeChallenge(challengeId);
  if (!challenge) throw new Error("This login request expired. Try again.");

  const authenticator = await prisma.authenticator.findUnique({
    where: { credentialId: response.id },
  });
  if (!authenticator) throw new Error("This passkey isn't registered.");

  const { origin, rpID } = await rpConfig();
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: authenticator.credentialId,
      publicKey: new Uint8Array(authenticator.publicKey),
      counter: Number(authenticator.counter),
      transports: authenticator.transports
        ? (authenticator.transports.split(",") as AuthenticatorTransportFuture[])
        : undefined,
    },
  });

  if (!verification.verified) {
    throw new Error("Couldn't verify this passkey.");
  }

  await prisma.authenticator.update({
    where: { id: authenticator.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
  });

  return authenticator;
}

/**
 * Issues a short-lived, single-use ticket proving WebAuthn verification just
 * succeeded for this user. NextAuth exposes a public POST endpoint for every
 * Credentials provider, so the "passkey" provider's authorize() can't trust a
 * bare credentialId (not a secret) — it must consume one of these instead,
 * exactly like the magic-link provider consumes a token.
 */
export async function issueLoginTicket(userId: string) {
  const ticket = randomUUID();
  await prisma.webAuthnChallenge.create({
    data: { challenge: ticket, userId, expiresAt: new Date(Date.now() + LOGIN_TICKET_TTL_MS) },
  });
  return ticket;
}

export async function consumeLoginTicket(ticket: string) {
  const record = await prisma.webAuthnChallenge.findFirst({
    where: { challenge: ticket, userId: { not: null } },
  });
  if (!record) return null;
  await prisma.webAuthnChallenge.delete({ where: { id: record.id } });
  if (record.expiresAt < new Date()) return null;
  return record.userId;
}
