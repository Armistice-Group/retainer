"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { encrypt } from "@/lib/crypto";
import { emailDomain, isClaimableDomain } from "@/lib/org";
import {
  discoverOidc,
  getAuthorizationUrl,
  signOAuthState,
  SsoError,
} from "@/lib/integrations/sso";
import { getOrigin } from "@/lib/url";
import type { ActionState } from "@/actions/auth";

export async function connectSsoAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const issuer = ((formData.get("issuer") as string) || "").trim();
  const clientId = ((formData.get("clientId") as string) || "").trim();
  const clientSecret = ((formData.get("clientSecret") as string) || "").trim();

  if (!issuer || !clientId || !clientSecret) {
    return { error: "All three fields are required." };
  }
  if (!org.domain) {
    return {
      error:
        "Set an organization domain first (above) — SSO signs people in by matching their email domain.",
    };
  }

  let discovery;
  try {
    discovery = await discoverOidc(issuer);
  } catch (err) {
    return {
      error:
        err instanceof SsoError
          ? err.message
          : "Couldn't reach that issuer's OIDC discovery document. Check the URL.",
    };
  }

  await prisma.ssoConnection.upsert({
    where: { orgId: org.id },
    create: {
      orgId: org.id,
      issuer,
      clientId,
      clientSecret: encrypt(clientSecret),
      authorizationEndpoint: discovery.authorizationEndpoint,
      tokenEndpoint: discovery.tokenEndpoint,
      jwksUri: discovery.jwksUri,
      connectedById: user.id,
    },
    update: {
      issuer,
      clientId,
      clientSecret: encrypt(clientSecret),
      authorizationEndpoint: discovery.authorizationEndpoint,
      tokenEndpoint: discovery.tokenEndpoint,
      jwksUri: discovery.jwksUri,
      connectedById: user.id,
    },
  });

  revalidatePath("/settings/security");
  return null;
}

export async function disconnectSsoAction() {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  await prisma.ssoConnection.deleteMany({ where: { orgId: org.id } });
  revalidatePath("/settings/security");
}

export async function setSsoEnabledAction(enabled: boolean) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  await prisma.ssoConnection.updateMany({ where: { orgId: org.id }, data: { enabled } });
  revalidatePath("/settings/security");
}

export async function startSsoLoginAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = ((formData.get("email") as string) || "").toLowerCase().trim();
  const domain = emailDomain(email);
  if (!domain || !isClaimableDomain(domain)) {
    return { fieldErrors: { email: ["Enter your work email."] } };
  }

  const org = await prisma.organization.findUnique({ where: { domain } });
  const connection = org
    ? await prisma.ssoConnection.findUnique({ where: { orgId: org.id } })
    : null;

  if (!connection || !connection.enabled) {
    return { fieldErrors: { email: ["No SSO connection found for this email's domain."] } };
  }

  const origin = await getOrigin();
  const redirectUri = `${origin}/api/sso/callback`;
  const state = signOAuthState(org!.id);

  redirect(getAuthorizationUrl(connection, state, redirectUri));
}
