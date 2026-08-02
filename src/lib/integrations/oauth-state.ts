import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return secret;
}

/** Signs a short-lived { orgId, nonce, exp } payload so an OAuth callback can
 * trust which org initiated the connection without relying solely on the
 * session cookie (defense in depth against CSRF / cross-tenant mixups). */
export function signOAuthState(orgId: string) {
  const payload = JSON.stringify({
    orgId,
    nonce: randomBytes(8).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const signature = createHmac("sha256", authSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(state: string): { orgId: string } | null {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", authSecret()).update(encoded).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof payload.orgId !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return { orgId: payload.orgId };
  } catch {
    return null;
  }
}
