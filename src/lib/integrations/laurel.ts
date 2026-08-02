import "server-only";
import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import type { LaurelConnection } from "@/generated/prisma/client";

// Confirmed against Laurel's public developer docs (developer.laurel.ai).
// The Time/Ingestion service *endpoint paths* (e.g. "list pending time
// entries") are NOT public — Laurel's docs say those are provisioned
// per-customer by their solutions delivery team once you have a real
// customer/client ID pair. Don't add guessed paths here; extend this file
// once Laurel provides them. See Linear ARM-63.
const TOKEN_URL = "https://identity.laurel.ai/api/v1/oauth/token";
const AUDIENCE = "https://timeautomation.com";

export const TIME_SERVICE_BASE = "https://api.laurel.ai/time/";
export const INGESTION_SERVICE_BASE = "https://api.laurel.ai/ingestion/";
export const IDENTITY_SERVICE_BASE = "https://identity.laurel.ai";

export class LaurelError extends Error {}

export type LaurelCredentials = { customerId: string; clientId: string; clientSecret: string };

/** Client-credentials grant — confirmed request/response shape from Laurel's
 * auth guide. Returns a short-lived (docs: 24h) bearer token; callers should
 * fetch a fresh one per use rather than caching across requests for now. */
export async function fetchAccessToken(creds: LaurelCredentials) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audience: AUDIENCE,
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LaurelError(`Laurel token request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
  };
  if (!data.access_token) {
    throw new LaurelError("Laurel token request did not return an access token.");
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 86400 };
}

/** Verifies stored credentials actually authenticate — the one thing we can
 * confirm end-to-end without Laurel-provided endpoint paths. */
export async function testConnection(connection: LaurelConnection) {
  await fetchAccessToken({
    customerId: connection.customerId,
    clientId: connection.clientId,
    clientSecret: decrypt(connection.clientSecret),
  });
}

export async function connectionForOrg(orgId: string) {
  return prisma.laurelConnection.findUnique({ where: { orgId } });
}
