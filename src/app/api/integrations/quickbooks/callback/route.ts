import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { exchangeCodeForTokens, verifyOAuthState } from "@/lib/integrations/quickbooks";
import { getOrigin } from "@/lib/url";

export async function GET(req: Request) {
  const origin = await getOrigin();
  const settingsUrl = (status: "connected" | "error") =>
    NextResponse.redirect(`${origin}/settings/integrations?quickbooks=${status}`);

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const realmId = searchParams.get("realmId");

  if (!code || !state || !realmId) return settingsUrl("error");

  const verified = verifyOAuthState(state);
  if (!verified) return settingsUrl("error");

  const session = await auth();
  if (!session?.user?.id) return settingsUrl("error");

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: session.user.id, orgId: verified.orgId } },
  });
  if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
    return settingsUrl("error");
  }

  try {
    const redirectUri = `${origin}/api/integrations/quickbooks/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    await prisma.quickBooksConnection.upsert({
      where: { orgId: verified.orgId },
      create: {
        orgId: verified.orgId,
        realmId,
        accessToken: encrypt(tokens.accessToken),
        refreshToken: encrypt(tokens.refreshToken),
        accessTokenExpiresAt: tokens.expiresAt,
        connectedById: session.user.id,
      },
      update: {
        realmId,
        accessToken: encrypt(tokens.accessToken),
        refreshToken: encrypt(tokens.refreshToken),
        accessTokenExpiresAt: tokens.expiresAt,
        connectedById: session.user.id,
        defaultItemId: null,
      },
    });
  } catch {
    return settingsUrl("error");
  }

  return settingsUrl("connected");
}
