import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { originFromHeaders } from "@/lib/request-origin";

const PUBLIC_URL_KEY = "publicUrl";

/** The origin the current request was made to — whatever address the
 * browser is actually on (localhost, hp.local, a real domain), via the
 * reverse proxy's X-Forwarded-* headers when present. Use for redirects the
 * browser follows right away (SSO/OAuth round trips, passkeys, pay links):
 * those must come back to the same host the flow started on. */
export async function getRequestOrigin() {
  return originFromHeaders(await headers()) ?? "http://localhost:3000";
}

/** Normalizes user input to a bare origin ("https://x.example.com"), or null
 * if it isn't an http(s) URL. */
export function normalizeOrigin(raw: string) {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function getConfiguredPublicUrl() {
  const row = await prisma.instanceSetting.findUnique({ where: { key: PUBLIC_URL_KEY } });
  return row?.value ?? null;
}

export async function setPublicUrl(origin: string) {
  await prisma.instanceSetting.upsert({
    where: { key: PUBLIC_URL_KEY },
    create: { key: PUBLIC_URL_KEY, value: origin },
    update: { value: origin },
  });
}

/** Base URL for links that leave the browser — emails, invite/share/review
 * links people copy and send. These can't trust the request's Host header
 * (a forged one would put an attacker's domain into a login email), so they
 * use AUTH_URL if set, else the URL the admin confirmed at setup (Settings →
 * General), and only fall back to the request origin if neither exists. */
export async function getOrigin() {
  if (process.env.AUTH_URL) return new URL(process.env.AUTH_URL).origin;
  return (await getConfiguredPublicUrl()) ?? (await getRequestOrigin());
}
