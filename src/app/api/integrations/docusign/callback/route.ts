import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { verifyOAuthState } from "@/lib/integrations/oauth-state";
import { exchangeDocuSignCode, fetchDocuSignAccount } from "@/lib/integrations/agreements/providers";
import { getRequestOrigin } from "@/lib/url";

export async function GET(req: Request) {
  const origin = await getRequestOrigin();
  const back = (status: "connected" | "error" | "denied") =>
    NextResponse.redirect(`${origin}/settings/agreements?docusign=${status}`);

  const { searchParams } = new URL(req.url);
  if (searchParams.get("error")) return back("denied");
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return back("error");

  const verified = verifyOAuthState(state);
  if (!verified) return back("error");

  const session = await auth();
  if (!session?.user?.id) return back("error");
  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: session.user.id, orgId: verified.orgId } },
  });
  if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) return back("error");

  try {
    const tokens = await exchangeDocuSignCode(code, `${origin}/api/integrations/docusign/callback`);
    const account = await fetchDocuSignAccount(tokens.accessToken);
    const data = {
      accountId: account.accountId,
      accountName: account.accountName ?? account.email,
      baseUrl: account.baseUri,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      accessTokenExpiresAt: tokens.expiresAt,
      connectedById: session.user.id,
      lastError: null,
    };
    const where = { orgId_provider: { orgId: verified.orgId, provider: "DOCUSIGN" } };
    const existing = await prisma.agreementConnection.findUnique({ where, select: { accountId: true } });
    await prisma.agreementConnection.upsert({
      where,
      create: { orgId: verified.orgId, provider: "DOCUSIGN", ...data },
      // A different DocuSign account starts from the beginning.
      update: { ...data, ...(existing?.accountId !== account.accountId ? { syncCursor: null } : {}) },
    });
  } catch (err) {
    console.warn("[docusign] Connect failed", err);
    return back("error");
  }
  return back("connected");
}
