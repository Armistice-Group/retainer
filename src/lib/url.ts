import "server-only";
import { headers } from "next/headers";

/** The instance's public origin. Prefers AUTH_URL so links and OAuth/SSO
 * redirect URIs stay stable behind reverse proxies that don't forward
 * Host/X-Forwarded-* headers; falls back to the request's own host. */
export async function getOrigin() {
  if (process.env.AUTH_URL) return new URL(process.env.AUTH_URL).origin;
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
