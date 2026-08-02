import "server-only";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { decrypt } from "@/lib/crypto";
import type { SsoConnection } from "@/generated/prisma/client";

export { signOAuthState, verifyOAuthState } from "@/lib/integrations/oauth-state";

export class SsoError extends Error {}

export type OidcDiscovery = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
};

/** Standard OIDC discovery — fetches the provider's published config rather
 * than requiring an admin to hand-enter each endpoint URL. */
export async function discoverOidc(issuer: string): Promise<OidcDiscovery> {
  const base = issuer.replace(/\/$/, "");
  const res = await fetch(`${base}/.well-known/openid-configuration`);
  if (!res.ok) {
    throw new SsoError(`Couldn't fetch OIDC discovery document (${res.status}).`);
  }
  const data = (await res.json()) as {
    authorization_endpoint?: string;
    token_endpoint?: string;
    jwks_uri?: string;
  };
  if (!data.authorization_endpoint || !data.token_endpoint || !data.jwks_uri) {
    throw new SsoError("OIDC discovery document is missing required endpoints.");
  }
  return {
    authorizationEndpoint: data.authorization_endpoint,
    tokenEndpoint: data.token_endpoint,
    jwksUri: data.jwks_uri,
  };
}

export function getAuthorizationUrl(connection: SsoConnection, state: string, redirectUri: string) {
  const url = new URL(connection.authorizationEndpoint);
  url.searchParams.set("client_id", connection.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForIdToken(
  connection: SsoConnection,
  code: string,
  redirectUri: string
) {
  const res = await fetch(connection.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      redirect_uri: redirectUri,
      client_id: connection.clientId,
      client_secret: decrypt(connection.clientSecret),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SsoError(`SSO token exchange failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { id_token?: string; error?: string };
  if (!data.id_token) {
    throw new SsoError(data.error ?? "SSO token exchange did not return an ID token.");
  }
  return data.id_token;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(jwksUri: string) {
  let jwks = jwksCache.get(jwksUri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUri));
    jwksCache.set(jwksUri, jwks);
  }
  return jwks;
}

export type SsoIdentity = { email: string; name: string | null };

/** Verifies the ID token's signature against the IdP's published JWKS, and
 * checks issuer/audience — this is the step that actually proves the token
 * came from the org's real identity provider and wasn't forged. */
export async function verifyIdToken(connection: SsoConnection, idToken: string): Promise<SsoIdentity> {
  const { payload } = await jwtVerify(idToken, jwksFor(connection.jwksUri), {
    issuer: connection.issuer,
    audience: connection.clientId,
  });

  const email = typeof payload.email === "string" ? payload.email : null;
  if (!email) throw new SsoError("SSO identity provider did not return an email claim.");

  const name = typeof payload.name === "string" ? payload.name : null;
  return { email: email.toLowerCase().trim(), name };
}
