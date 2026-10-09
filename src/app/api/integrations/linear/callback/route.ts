import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  exchangeCodeForToken,
  fetchWorkspace,
  tokenColumns,
  verifyOAuthState,
} from "@/lib/integrations/linear";
import { getRequestOrigin } from "@/lib/url";

export async function GET(req: Request) {
  const origin = await getRequestOrigin();
  const settingsUrl = (status: "connected" | "error") =>
    NextResponse.redirect(`${origin}/settings/integrations?linear=${status}`);

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
    const tokens = await exchangeCodeForToken(code, redirectUri);
    const workspace = await fetchWorkspace(tokens.accessToken);
    const workspaceName = workspace.name;
    const linearOrgId = workspace.id;

    await prisma.linearConnection.upsert({
      where: { orgId: verified.orgId },
      create: {
        orgId: verified.orgId,
        workspaceName,
        linearOrgId,
        ...tokenColumns(tokens),
        connectedById: session.user.id,
      },
      update: {
        workspaceName,
        linearOrgId,
        ...tokenColumns(tokens),
        connectedById: session.user.id,
      },
    });
  } catch {
    return settingsUrl("error");
  }

  return settingsUrl("connected");
}
