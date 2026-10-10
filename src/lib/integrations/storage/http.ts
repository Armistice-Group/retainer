import "server-only";
import { ProviderError, type ProviderTokens } from "./types";

/** fetch() for provider APIs: JSON in and out, errors as ProviderError with
 * the provider's message. `notFound` → null instead of throwing. */
export async function api<T>(
  url: string,
  init: RequestInit & { token?: string; json?: unknown } = {},
  opts: { nullOn?: number[] } = {}
): Promise<T | null> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(url, { ...init, headers, body, signal: AbortSignal.timeout(15_000) });
  if (opts.nullOn?.includes(res.status)) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      message = j.error_description || j.error?.message || j.message || j.error_summary || (typeof j.error === "string" ? j.error : message);
    } catch {
      // not JSON
    }
    throw new ProviderError(`${res.status}: ${message}`);
  }
  if (res.status === 204) return null;
  return (await res.json()) as T;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

/** Standard OAuth 2.0 token request (form-encoded, client credentials in
 * the body, or as Basic auth when `basic`). */
export async function tokenRequest(
  url: string,
  params: Record<string, string>,
  client: { id: string; secret: string; basic?: boolean; json?: boolean }
): Promise<ProviderTokens & { raw: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  let body: string;
  if (client.basic) {
    headers.Authorization = `Basic ${Buffer.from(`${client.id}:${client.secret}`).toString("base64")}`;
  }
  const all = client.basic ? params : { ...params, client_id: client.id, client_secret: client.secret };
  if (client.json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(all);
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(all).toString();
  }
  const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(15_000) });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & Record<string, unknown>;
  if (!res.ok || !data.access_token) {
    throw new ProviderError(data.error_description || data.error || `Token request failed (${res.status}).`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    scope: data.scope ?? null,
    raw: data,
  };
}
