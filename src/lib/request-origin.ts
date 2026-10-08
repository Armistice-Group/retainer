// No server-only/next/headers imports — also used by the edge-safe proxy.

/** The origin the browser actually used for this request: the reverse
 * proxy's X-Forwarded-Host/-Proto when present, else the Host header. Next's
 * own `req.url` reflects the internal listen address (0.0.0.0, localhost in a
 * container) and must not be used to build browser-facing URLs. */
export function originFromHeaders(headers: Headers, fallbackProto = "http") {
  const host = headers.get("x-forwarded-host")?.split(",")[0].trim() || headers.get("host");
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || fallbackProto;
  return host ? `${proto}://${host}` : null;
}
