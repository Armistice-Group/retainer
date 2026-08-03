import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export async function issueMagicLinkToken(email: string, ttlMs = 5 * 60 * 1000) {
  const token = randomUUID();
  await prisma.magicLinkToken.create({
    data: { token, email, expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}
