"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { encrypt } from "@/lib/crypto";
import {
  createSsoFlow,
  discoverOidc,
  getAuthorizationUrl,
  parseDomainList,
  sealSsoFlow,
  signOAuthState,
  SsoError,
  SSO_CALLBACK_PATH,
  SSO_FLOW_COOKIE,
  SSO_FLOW_TTL_SECONDS,
} from "@/lib/integrations/sso";
import { getOrigin } from "@/lib/url";
import type { ActionState } from "@/actions/auth";

/** Creates or updates the org's OIDC connection. On update the client secret
 * may be left blank to keep the stored one. */
export async function saveSsoConnectionAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const issuer = ((formData.get("issuer") as string) || "").trim();
  const clientId = ((formData.get("clientId") as string) || "").trim();
  const clientSecret = ((formData.get("clientSecret") as string) || "").trim();
  const displayName = ((formData.get("displayName") as string) || "").trim().slice(0, 60) || null;
  const allowedDomains = parseDomainList((formData.get("allowedDomains") as string) || "");
  const autoProvision = formData.get("autoProvision") === "on";
  const enforced = formData.get("enforced") === "on";
  const defaultRole = formData.get("defaultRole") === "ADMIN" ? "ADMIN" : "MEMBER";

  const existing = await prisma.ssoConnection.findUnique({ where: { orgId: org.id } });

  const fieldErrors: Record<string, string[]> = {};
  if (!issuer) fieldErrors.issuer = ["Issuer URL is required."];
  else if (!/^https?:\/\//.test(issuer)) fieldErrors.issuer = ["Must start with https://"];
  if (!clientId) fieldErrors.clientId = ["Client ID is required."];
  if (!clientSecret && !existing) fieldErrors.clientSecret = ["Client secret is required."];
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

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

  const data = {
    issuer: discovery.issuer,
    clientId,
    authorizationEndpoint: discovery.authorizationEndpoint,
    tokenEndpoint: discovery.tokenEndpoint,
    jwksUri: discovery.jwksUri,
    displayName,
    allowedDomains,
    autoProvision,
    enforced,
    defaultRole,
    connectedById: user.id,
  } as const;

  if (existing) {
    await prisma.ssoConnection.update({
      where: { id: existing.id },
      data: { ...data, ...(clientSecret ? { clientSecret: encrypt(clientSecret) } : {}) },
    });
  } else {
    await prisma.ssoConnection.create({
      data: { ...data, orgId: org.id, clientSecret: encrypt(clientSecret) },
    });
  }

  revalidatePath("/settings/security");
  return { saved: true };
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

/** Starts an OIDC login for one of the connections listed on the login page. */
export async function startSsoLoginAction(formData: FormData) {
  const connectionId = (formData.get("connectionId") as string) || "";
  const connection = connectionId
    ? await prisma.ssoConnection.findUnique({ where: { id: connectionId } })
    : null;
  if (!connection || !connection.enabled) redirect("/login?error=sso-failed");

  const origin = await getOrigin();
  const flow = createSsoFlow(signOAuthState(connection.orgId));

  (await cookies()).set(SSO_FLOW_COOKIE, sealSsoFlow(flow), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: SSO_CALLBACK_PATH,
    maxAge: SSO_FLOW_TTL_SECONDS,
  });

  redirect(getAuthorizationUrl(connection, flow, `${origin}${SSO_CALLBACK_PATH}`));
}
