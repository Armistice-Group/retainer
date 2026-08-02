import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForIdToken, verifyIdToken, verifyOAuthState } from "@/lib/integrations/sso";
import { getOrigin } from "@/lib/url";

const TICKET_TTL_MS = 60 * 1000;

export async function GET(req: Request) {
  const origin = await getOrigin();
  const loginError = (message: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return loginError("sso-failed");

  const verified = verifyOAuthState(state);
  if (!verified) return loginError("sso-failed");

  const connection = await prisma.ssoConnection.findUnique({ where: { orgId: verified.orgId } });
  if (!connection || !connection.enabled) return loginError("sso-failed");

  try {
    const redirectUri = `${origin}/api/sso/callback`;
    const idToken = await exchangeCodeForIdToken(connection, code, redirectUri);
    const identity = await verifyIdToken(connection, idToken);

    let user = await prisma.user.findUnique({ where: { email: identity.email } });
    if (!user) {
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email: identity.email, name: identity.name || identity.email, passwordHash: null },
        });
        await tx.membership.create({
          data: { userId: created.id, orgId: verified.orgId, role: "MEMBER" },
        });
        return created;
      });
    } else {
      const membership = await prisma.membership.findUnique({
        where: { userId_orgId: { userId: user.id, orgId: verified.orgId } },
      });
      if (!membership) {
        await prisma.membership.create({
          data: { userId: user.id, orgId: verified.orgId, role: "MEMBER" },
        });
      }
    }

    const token = randomUUID();
    await prisma.ssoLoginTicket.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + TICKET_TTL_MS) },
    });

    return NextResponse.redirect(`${origin}/login/sso/complete/${token}`);
  } catch {
    return loginError("sso-failed");
  }
}
