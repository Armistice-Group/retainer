import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emailDomain } from "@/lib/org";
import { notify, getOrgAdminUserIds } from "@/lib/notifications";
import {
  exchangeCodeForIdToken,
  unsealSsoFlow,
  verifyIdToken,
  verifyOAuthState,
  SSO_CALLBACK_PATH,
  SSO_FLOW_COOKIE,
} from "@/lib/integrations/sso";
import { getOrigin } from "@/lib/url";

const TICKET_TTL_MS = 60 * 1000;

export async function GET(req: Request) {
  const origin = await getOrigin();
  const cookieStore = await cookies();
  const flow = unsealSsoFlow(cookieStore.get(SSO_FLOW_COOKIE)?.value);
  // Single use — clear it whatever happens next.
  cookieStore.delete({ name: SSO_FLOW_COOKIE, path: SSO_CALLBACK_PATH });

  const loginError = (code: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(code)}`);

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return loginError("sso-failed");
  // State must match the one this browser was handed when it started the
  // login, not just carry a valid signature.
  if (!flow || flow.state !== state) return loginError("sso-failed");

  const verified = verifyOAuthState(state);
  if (!verified) return loginError("sso-failed");

  const connection = await prisma.ssoConnection.findUnique({ where: { orgId: verified.orgId } });
  if (!connection || !connection.enabled) return loginError("sso-failed");

  let identity;
  try {
    const redirectUri = `${origin}${SSO_CALLBACK_PATH}`;
    const idToken = await exchangeCodeForIdToken(connection, code, redirectUri, flow.codeVerifier);
    identity = await verifyIdToken(connection, idToken, flow.nonce);
  } catch (err) {
    console.warn("[sso] Sign-in failed", err);
    return loginError("sso-failed");
  }

  const domain = emailDomain(identity.email);
  if (connection.allowedDomains.length > 0 && (!domain || !connection.allowedDomains.includes(domain))) {
    return loginError("sso-domain-not-allowed");
  }

  let user = await prisma.user.findUnique({ where: { email: identity.email } });
  const membership = user
    ? await prisma.membership.findUnique({
        where: { userId_orgId: { userId: user.id, orgId: connection.orgId } },
      })
    : null;

  if (!membership) {
    if (!connection.autoProvision) return loginError("sso-no-account");

    user = await prisma.$transaction(async (tx) => {
      const member =
        user ??
        (await tx.user.create({
          data: { email: identity.email, name: identity.name || identity.email, passwordHash: null },
        }));
      await tx.membership.create({
        data: { userId: member.id, orgId: connection.orgId, role: connection.defaultRole },
      });
      return member;
    });

    const adminIds = await getOrgAdminUserIds(prisma, connection.orgId, user.id);
    await notify(prisma, {
      orgId: connection.orgId,
      userIds: adminIds,
      type: "MEMBER_JOINED",
      message: `${user.name} joined your organization via SSO.`,
      link: "/settings/members",
    });
  }

  const token = randomUUID();
  await prisma.ssoLoginTicket.create({
    data: { token, userId: user!.id, expiresAt: new Date(Date.now() + TICKET_TTL_MS) },
  });

  return NextResponse.redirect(`${origin}/login/sso/complete/${token}`);
}
