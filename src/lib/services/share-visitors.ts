import "server-only";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/email";
import { verificationRequired } from "@/lib/share-gate";
import type { ShareVerificationMode } from "@/generated/prisma/client";

/** What the client page's share-link card needs about email verification:
 * the setting, whether email is set up, and who has verified (live
 * sessions only, most recently seen first). Owners/admins only — the
 * caller checks. */
export async function clientShareCardData(
  org: { requireShareVerification: boolean },
  client: { id: string; shareVerification: ShareVerificationMode }
) {
  const now = new Date();
  const [emailConfigured, sessions] = await Promise.all([
    isEmailConfigured(),
    prisma.shareSession.findMany({
      where: { clientId: client.id, expiresAt: { gt: now } },
      orderBy: { lastSeenAt: "desc" },
      take: 20,
      select: { id: true, email: true, lastSeenAt: true, contact: { select: { name: true } } },
    }),
  ]);
  return {
    now,
    verification: {
      mode: client.shareVerification,
      orgDefault: org.requireShareVerification,
      required: verificationRequired(org.requireShareVerification, client.shareVerification),
      emailConfigured,
    },
    visitors: sessions.map((s) => ({
      id: s.id,
      contactName: s.contact.name,
      email: s.email,
      lastSeenAt: s.lastSeenAt,
    })),
  };
}
