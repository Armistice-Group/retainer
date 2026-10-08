import "server-only";
import { createHash, randomBytes } from "crypto";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { encrypt, decrypt } from "@/lib/crypto";
import type { SsoConnection } from "@/generated/prisma/client";

export { signOAuthState, verifyOAuthState } from "@/lib/integrations/oauth-state";

export class SsoError extends Error {}

/** The IdP didn't vouch for the email — distinct so the login page can tell
 * the admin which setting to change. */
export class SsoUnverifiedEmailError extends SsoError {}

export const SSO_CALLBACK_PATH = "/api/sso/callback";

export type OidcDiscovery = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
};

/** Standard OIDC discovery — fetches the provider's published config rather
 * than requiring an admin to hand-enter each endpoint URL. */
export async function discoverOidc(issuer: string): Promise<OidcDiscovery> {
  const base = issuer.replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SsoError(`Couldn't reach ${base}/.well-known/openid-configuration.`);
  }
  if (!res.ok) {
    throw new SsoError(`Couldn't fetch OIDC discovery document (${res.status}).`);
  }
  const data = (await res.json()) as {
    issuer?: string;
    authorization_endpoint?: string;
    token_endpoint?: string;
    jwks_uri?: string;
  };
  if (!data.authorization_endpoint || !data.token_endpoint || !data.jwks_uri) {
    throw new SsoError("OIDC discovery document is missing required endpoints.");
  }
  return {
    // The ID token's `iss` claim must match the provider's own canonical
    // issuer exactly (Auth0, for one, includes a trailing slash) — use the
    // discovered value, not whatever the admin typed.
    issuer: data.issuer ?? base,
    authorizationEndpoint: data.authorization_endpoint,
    tokenEndpoint: data.token_endpoint,
    jwksUri: data.jwks_uri,
  };
}

/** Per-login secrets that must survive the round trip to the IdP but never
 * travel through it: the PKCE verifier and the ID-token nonce. Kept in an
 * encrypted, httpOnly cookie alongside the state value, which also binds the
 * callback to the browser that started the login (login-CSRF protection). */
export type SsoFlow = { state: string; codeVerifier: string; nonce: string };

export const SSO_FLOW_COOKIE = "sso_flow";
export const SSO_FLOW_TTL_SECONDS = 10 * 60;

export function createSsoFlow(state: string): SsoFlow {
  return {
    state,
    codeVerifier: randomBytes(32).toString("base64url"),
    nonce: randomBytes(16).toString("base64url"),
  };
}

export function sealSsoFlow(flow: SsoFlow) {
  return encrypt(JSON.stringify(flow));
}

export function unsealSsoFlow(value: string | undefined): SsoFlow | null {
  if (!value) return null;
  try {
    const flow = JSON.parse(decrypt(value)) as Partial<SsoFlow>;
    if (!flow.state || !flow.codeVerifier || !flow.nonce) return null;
    return flow as SsoFlow;
  } catch {
    return null;
  }
}

export function getAuthorizationUrl(connection: SsoConnection, flow: SsoFlow, redirectUri: string) {
  const url = new URL(connection.authorizationEndpoint);
  url.searchParams.set("client_id", connection.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", flow.state);
  url.searchParams.set("nonce", flow.nonce);
  url.searchParams.set(
    "code_challenge",
    createHash("sha256").update(flow.codeVerifier).digest("base64url")
  );
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeCodeForIdToken(
  connection: SsoConnection,
  code: string,
  redirectUri: string,
  codeVerifier: string
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
      code_verifier: codeVerifier,
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
 * checks issuer/audience/nonce — this is the step that actually proves the
 * token came from the org's real identity provider, for this login attempt,
 * and wasn't forged or replayed. */
export async function verifyIdToken(
  connection: SsoConnection,
  idToken: string,
  expectedNonce: string
): Promise<SsoIdentity> {
  const { payload } = await jwtVerify(idToken, jwksFor(connection.jwksUri), {
    issuer: connection.issuer,
    audience: connection.clientId,
  });

  if (payload.nonce !== expectedNonce) throw new SsoError("SSO ID token nonce mismatch.");

  const email = typeof payload.email === "string" ? payload.email : null;
  if (!email) throw new SsoError("SSO identity provider did not return an email claim.");
  // The email is how an IdP identity is matched to an existing account
  // (including the local admin), so an address the IdP itself says it
  // hasn't verified isn't trusted unless the admin opted in. Providers that
  // omit the claim entirely (some only issue verified addresses) are allowed.
  const unverified = payload.email_verified === false || payload.email_verified === "false";
  if (unverified && !connection.trustEmails) {
    throw new SsoUnverifiedEmailError("SSO identity provider reports this email as unverified.");
  }

  const name = typeof payload.name === "string" ? payload.name : null;
  return { email: email.toLowerCase().trim(), name };
}

/** Normalizes the admin's comma/space/newline-separated domain list. */
export function parseDomainList(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean)
    )
  );
}
