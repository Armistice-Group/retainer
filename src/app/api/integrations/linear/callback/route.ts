import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import {
  exchangeCodeForToken,
  fetchWorkspaceName,
  verifyOAuthState,
} from "@/lib/integrations/linear";
import { getOrigin } from "@/lib/url";

export async function GET(req: Request) {
  const origin = await getOrigin();
  const settingsUrl = (status: "connected" | "error") =>
    NextResponse.redirect(`${origin}/settings?linear=${status}`);

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) return settingsUrl("error");

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
    const redirectUri = `${origin}/api/integrations/linear/callback`;
    const accessToken = await exchangeCodeForToken(code, redirectUri);
    const workspaceName = await fetchWorkspaceName(accessToken);

    await prisma.linearConnection.upsert({
      where: { orgId: verified.orgId },
      create: {
        orgId: verified.orgId,
        workspaceName,
        accessToken: encrypt(accessToken),
        connectedById: session.user.id,
      },
      update: {
        workspaceName,
        accessToken: encrypt(accessToken),
        connectedById: session.user.id,
      },
    });
  } catch {
    return settingsUrl("error");
  }

  return settingsUrl("connected");
}
