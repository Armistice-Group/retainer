import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

export const ACTIVE_ORG_COOKIE = "activeOrgId";

/** Two-factor is satisfied by an authenticator app (TOTP), or by having
 * signed in through the org's SSO (the identity provider owns MFA then).
 * Passkeys don't count: password sign-in never asks for one, and they're
 * accepted without user verification, so a passkey isn't reliably a second
 * factor. */
export function meetsTwoFactorRequirement(user: {
  twoFactorEnabled?: boolean;
  signInMethod?: string | null;
}) {
  return user.twoFactorEnabled === true || user.signInMethod === "sso";
}

export async function requireOrgContext({
  allowMissingTwoFactor = false,
}: {
  /** Only for the two-factor setup page itself. */
  allowMissingTwoFactor?: boolean;
} = {}) {
  const session = await auth();
  // No session here despite getting past the proxy means the cookie is
  // stale (password reset, deleted account): clear it, then log in.
  if (!session?.user?.id) redirect("/login/expired");
  const userId = session.user.id;

  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) redirect("/onboarding");

  // Any org that requires two-factor gates the whole app (not just that
  // org's pages) until it's set up — server-side, for pages, server actions
  // and route handlers that go through here. API keys don't (lib/api-auth).
  if (
    !allowMissingTwoFactor &&
    memberships.some((m) => m.org.requireTwoFactor) &&
    !meetsTwoFactorRequirement(session.user)
  ) {
    redirect("/two-factor-setup");
  }

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const active = memberships.find((m) => m.orgId === activeOrgId) ?? memberships[0];

  return {
    user: session.user,
    org: active.org,
    role: active.role as Role,
    memberships,
  };
}

export function requireRole(role: Role, allowed: Role[]) {
  if (!allowed.includes(role)) {
    throw new Error("You do not have permission to perform this action.");
  }
}
