import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

const KEY_PREFIX = "ch_live_";

export function hashApiKey(rawKey: string) {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateApiKey() {
  const secret = randomBytes(24).toString("base64url");
  const raw = `${KEY_PREFIX}${secret}`;
  return { raw, prefix: raw.slice(0, 12) };
}

export type ApiAuthContext = {
  orgId: string;
  defaultCurrency: string;
  slackWebhookUrl: string | null;
  invoicePrefix: string;
  actorId: string;
  actorName: string | null;
  role: Role;
};

export async function authenticateApiRequest(req: Request): Promise<ApiAuthContext | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const rawKey = match[1].trim();
  const keyHash = hashApiKey(rawKey);

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: true, org: true },
  });
  if (!apiKey || apiKey.revokedAt) return null;

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: apiKey.userId, orgId: apiKey.orgId } },
  });
  if (!membership) return null;

  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    orgId: apiKey.orgId,
    defaultCurrency: apiKey.org.defaultCurrency,
    slackWebhookUrl: apiKey.org.slackWebhookUrl,
    invoicePrefix: apiKey.org.invoicePrefix,
    actorId: apiKey.userId,
    actorName: apiKey.user.name,
    role: membership.role,
  };
}

export function unauthorized() {
  return Response.json({ error: "Missing or invalid API key." }, { status: 401 });
}

export function forbidden(message = "You don't have permission to do that.") {
  return Response.json({ error: message }, { status: 403 });
}

/** Share links (client and project portals) are managed by owners and admins
 * only, so other roles' keys get rows without the shareToken field. */
export function hideShareToken<T extends { shareToken: string | null }>(
  row: T,
  role: Role
): T | Omit<T, "shareToken"> {
  if (role === "OWNER" || role === "ADMIN") return row;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { shareToken, ...rest } = row;
  return rest;
}
