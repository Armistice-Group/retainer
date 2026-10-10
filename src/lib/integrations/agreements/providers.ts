import "server-only";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { getConfig, getConfigs } from "@/lib/instance-config";
import { fetchPublicBytes, SafeFetchError } from "@/lib/safe-fetch";
import type { AgreementConnection } from "@/generated/prisma/client";
import {
  docuSignAppBase,
  documensoAppBase,
  IRONCLAD_HOSTS,
  isDocuSignBaseUri,
  parseDocuSignEnvelopes,
  parseDocuSignUserInfo,
  parseDocumensoDocuments,
  parseIroncladRecords,
  type AgreementProviderId,
  type PulledAgreement,
} from "./parse";

// Read-only clients for the three e-signature providers: list completed
// agreements, fetch one, download its signed PDF. Nothing here ever creates
// or sends anything at the provider.

export class AgreementProviderError extends Error {}

/** Signed PDFs bigger than this aren't cached (they still open in the provider). */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_PAGES = 50;
/** How far back the first sync looks. */
export const FIRST_SYNC_LOOKBACK_DAYS = 3 * 365;

function trimBody(text: string) {
  return text.replace(/\s+/g, " ").slice(0, 200);
}

async function jsonOrThrow(res: Response, label: string) {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AgreementProviderError(`${label} answered ${res.status}${text ? `: ${trimBody(text)}` : ""}`);
  }
  return res.json();
}

async function bytesOrThrow(res: Response, label: string) {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AgreementProviderError(`${label} answered ${res.status}${text ? `: ${trimBody(text)}` : ""}`);
  }
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_PDF_BYTES) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  return bytes.length > MAX_PDF_BYTES ? null : bytes;
}

// ── DocuSign (OAuth authorization code grant) ───────────────────────────────

const DOCUSIGN_SCOPE = "signature extended";

export async function isDocuSignConfigured() {
  const c = await getConfigs(["DOCUSIGN_CLIENT_ID", "DOCUSIGN_CLIENT_SECRET"]);
  return !!c.DOCUSIGN_CLIENT_ID && !!c.DOCUSIGN_CLIENT_SECRET;
}

export async function docuSignEnvironment() {
  return (await getConfig("DOCUSIGN_ENVIRONMENT")) === "production" ? "production" : "demo";
}

async function docuSignAuthHost() {
  return (await docuSignEnvironment()) === "production"
    ? "https://account.docusign.com"
    : "https://account-d.docusign.com";
}

async function docuSignCredentials() {
  const c = await getConfigs(["DOCUSIGN_CLIENT_ID", "DOCUSIGN_CLIENT_SECRET"]);
  if (!c.DOCUSIGN_CLIENT_ID || !c.DOCUSIGN_CLIENT_SECRET) {
    throw new AgreementProviderError("DocuSign isn't set up on this instance yet.");
  }
  return { clientId: c.DOCUSIGN_CLIENT_ID, clientSecret: c.DOCUSIGN_CLIENT_SECRET };
}

export async function docuSignAuthorizationUrl(state: string, redirectUri: string) {
  const { clientId } = await docuSignCredentials();
  const url = new URL(`${await docuSignAuthHost()}/oauth/auth`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DOCUSIGN_SCOPE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

async function docuSignTokenRequest(body: URLSearchParams) {
  const { clientId, clientSecret } = await docuSignCredentials();
  const res = await fetch(`${await docuSignAuthHost()}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const data = (await jsonOrThrow(res, "DocuSign")) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + Number(data.expires_in ?? 3600) * 1000),
  };
}

export function exchangeDocuSignCode(code: string, redirectUri: string) {
  return docuSignTokenRequest(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri })
  );
}

/** Which DocuSign account the token belongs to, and its API host. */
export async function fetchDocuSignAccount(accessToken: string) {
  const res = await fetch(`${await docuSignAuthHost()}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const info = parseDocuSignUserInfo(await jsonOrThrow(res, "DocuSign"));
  if (!info) throw new AgreementProviderError("DocuSign didn't return an account for this user.");
  if (!isDocuSignBaseUri(info.baseUri)) {
    throw new AgreementProviderError("DocuSign returned an unexpected account address.");
  }
  return info;
}

async function docuSignAccessToken(conn: AgreementConnection) {
  if (!conn.accessToken) throw new AgreementProviderError("Reconnect DocuSign.");
  if (conn.accessTokenExpiresAt && conn.accessTokenExpiresAt.getTime() - 2 * 60 * 1000 > Date.now()) {
    return decrypt(conn.accessToken);
  }
  if (!conn.refreshToken) throw new AgreementProviderError("DocuSign access expired. Reconnect DocuSign.");
  let refreshed;
  try {
    refreshed = await docuSignTokenRequest(
      new URLSearchParams({ grant_type: "refresh_token", refresh_token: decrypt(conn.refreshToken) })
    );
  } catch (err) {
    throw new AgreementProviderError(
      `DocuSign access expired. Reconnect DocuSign. (${err instanceof Error ? err.message : "refresh failed"})`
    );
  }
  const data = {
    accessToken: encrypt(refreshed.accessToken),
    ...(refreshed.refreshToken ? { refreshToken: encrypt(refreshed.refreshToken) } : {}),
    accessTokenExpiresAt: refreshed.expiresAt,
  };
  await prisma.agreementConnection.update({ where: { id: conn.id }, data });
  // The same row is used for the rest of this sync (PDF downloads): keep it
  // current so the rotated refresh token isn't reused.
  Object.assign(conn, data);
  return refreshed.accessToken;
}

async function docuSignContext(conn: AgreementConnection) {
  if (!conn.baseUrl || !conn.accountId || !isDocuSignBaseUri(conn.baseUrl)) {
    throw new AgreementProviderError("Reconnect DocuSign.");
  }
  return {
    token: await docuSignAccessToken(conn),
    apiBase: `${conn.baseUrl}/restapi/v2.1/accounts/${encodeURIComponent(conn.accountId)}`,
    appBase: docuSignAppBase(await docuSignEnvironment()),
  };
}

async function docuSignList(conn: AgreementConnection, since: Date) {
  const ctx = await docuSignContext(conn);
  const items: PulledAgreement[] = [];
  let start: number | null = 0;
  for (let page = 0; start !== null && page < MAX_PAGES; page++) {
    const url = new URL(`${ctx.apiBase}/envelopes`);
    url.searchParams.set("from_date", since.toISOString());
    url.searchParams.set("status", "completed");
    url.searchParams.set("include", "recipients");
    url.searchParams.set("count", "100");
    url.searchParams.set("start_position", String(start));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/json" } });
    const parsed = parseDocuSignEnvelopes(await jsonOrThrow(res, "DocuSign"), ctx);
    items.push(...parsed.items);
    start = parsed.nextStart;
  }
  return items;
}

async function docuSignOne(conn: AgreementConnection, envelopeId: string) {
  const ctx = await docuSignContext(conn);
  const res = await fetch(`${ctx.apiBase}/envelopes/${encodeURIComponent(envelopeId)}?include=recipients`, {
    headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/json" },
  });
  if (res.status === 404 || res.status === 400) return null;
  const envelope = await jsonOrThrow(res, "DocuSign");
  return parseDocuSignEnvelopes({ envelopes: [envelope] }, ctx).items[0] ?? null;
}

// ── Documenso (API key; cloud or self-hosted) ───────────────────────────────

function documensoBase(conn: Pick<AgreementConnection, "baseUrl">) {
  return documensoAppBase(conn.baseUrl ?? "");
}

async function documensoGet(base: string, apiKey: string, path: string, opts: { maxBytes?: number } = {}) {
  try {
    return await fetchPublicBytes(`${base}/api/v2${path}`, {
      headers: { Authorization: apiKey, Accept: path.includes("/download") ? "application/pdf" : "application/json" },
      maxBytes: opts.maxBytes ?? 10 * 1024 * 1024,
      timeoutMs: 30_000,
      what: "Documenso",
    });
  } catch (err) {
    if (err instanceof SafeFetchError) throw new AgreementProviderError(err.message);
    throw err;
  }
}

async function documensoJson(base: string, apiKey: string, path: string) {
  const { bytes } = await documensoGet(base, apiKey, path);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new AgreementProviderError("Documenso didn't answer with JSON. Check the URL points at your Documenso instance.");
  }
}

/** Checks a Documenso URL and API key work before saving them. */
export async function checkDocumenso(baseUrl: string, apiKey: string) {
  const base = documensoAppBase(baseUrl);
  await documensoJson(base, apiKey, "/document?page=1&perPage=1&status=COMPLETED");
  return base;
}

async function documensoList(conn: AgreementConnection, since: Date | null) {
  if (!conn.accessToken) throw new AgreementProviderError("Reconnect Documenso.");
  const base = documensoBase(conn);
  const apiKey = decrypt(conn.accessToken);
  const items: PulledAgreement[] = [];
  let page: number | null = 1;
  // Documenso can't filter by completion date, so walk every completed
  // document (newest first) and keep the ones changed since last time.
  for (let i = 0; page !== null && i < MAX_PAGES; i++) {
    const body = await documensoJson(base, apiKey, `/document?status=COMPLETED&perPage=100&page=${page}&orderByDirection=desc`);
    const parsed = parseDocumensoDocuments(body, { appBase: base });
    items.push(...parsed.items.filter((a) => !since || !a.changedAt || a.changedAt >= since));
    page = parsed.nextPage;
  }
  return items;
}

async function documensoOne(conn: AgreementConnection, id: string) {
  if (!conn.accessToken) throw new AgreementProviderError("Reconnect Documenso.");
  if (!/^\d+$/.test(id)) return null;
  const base = documensoBase(conn);
  let doc: unknown;
  try {
    doc = await documensoJson(base, decrypt(conn.accessToken), `/document/${id}`);
  } catch (err) {
    if (err instanceof AgreementProviderError && /answered 40[04]/.test(err.message)) return null;
    throw err;
  }
  return parseDocumensoDocuments({ data: [doc] }, { appBase: base }).items[0] ?? null;
}

// ── Ironclad (OAuth client credentials) ─────────────────────────────────────

const IRONCLAD_SCOPE = "public.records.readRecords public.records.readAttachments";

export function ironcladHost(region: string | null | undefined) {
  return IRONCLAD_HOSTS[region ?? "na1"] ?? IRONCLAD_HOSTS.na1;
}

async function ironcladTokenRequest(host: string, clientId: string, clientSecret: string) {
  const res = await fetch(`https://${host}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: IRONCLAD_SCOPE,
    }),
  });
  const data = (await jsonOrThrow(res, "Ironclad")) as { access_token: string; expires_in?: number };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + Number(data.expires_in ?? 21600) * 1000),
  };
}

function ironcladHeaders(token: string, actAsEmail: string | null) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...(actAsEmail ? { "x-as-user-email": actAsEmail } : {}),
  };
}

/** Checks Ironclad credentials (gets a token, reads one record) before saving. */
export async function checkIronclad(input: { region: string; clientId: string; clientSecret: string; actAsEmail: string }) {
  const host = ironcladHost(input.region);
  const token = await ironcladTokenRequest(host, input.clientId, input.clientSecret);
  const res = await fetch(`https://${host}/public/api/v1/records?page=0&pageSize=1`, {
    headers: ironcladHeaders(token.accessToken, input.actAsEmail),
  });
  await jsonOrThrow(res, "Ironclad");
  return { host, token };
}

async function ironcladAccessToken(conn: AgreementConnection) {
  if (conn.accessToken && conn.accessTokenExpiresAt && conn.accessTokenExpiresAt.getTime() - 5 * 60 * 1000 > Date.now()) {
    return decrypt(conn.accessToken);
  }
  if (!conn.clientId || !conn.clientSecret) throw new AgreementProviderError("Reconnect Ironclad.");
  const token = await ironcladTokenRequest(ironcladHost(conn.accountId), conn.clientId, decrypt(conn.clientSecret));
  const data = { accessToken: encrypt(token.accessToken), accessTokenExpiresAt: token.expiresAt };
  await prisma.agreementConnection.update({ where: { id: conn.id }, data });
  Object.assign(conn, data);
  return token.accessToken;
}

async function ironcladList(conn: AgreementConnection, since: Date | null) {
  const host = ironcladHost(conn.accountId);
  const token = await ironcladAccessToken(conn);
  const items: PulledAgreement[] = [];
  let page: number | null = 0;
  for (let i = 0; page !== null && i < MAX_PAGES; i++) {
    const url = new URL(`https://${host}/public/api/v1/records`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("sortField", "lastUpdated");
    url.searchParams.set("sortDirection", "ASC");
    if (since) url.searchParams.set("lastUpdated", since.toISOString());
    const res = await fetch(url, { headers: ironcladHeaders(token, conn.actAsEmail) });
    const parsed = parseIroncladRecords(await jsonOrThrow(res, "Ironclad"), { host });
    items.push(...parsed.items);
    page = parsed.nextPage;
  }
  return items;
}

async function ironcladOne(conn: AgreementConnection, id: string) {
  const host = ironcladHost(conn.accountId);
  const token = await ironcladAccessToken(conn);
  const res = await fetch(`https://${host}/public/api/v1/records/${encodeURIComponent(id)}`, {
    headers: ironcladHeaders(token, conn.actAsEmail),
  });
  if (res.status === 404 || res.status === 400) return null;
  const record = await jsonOrThrow(res, "Ironclad");
  return parseIroncladRecords({ list: [record] }, { host }).items[0] ?? null;
}

// ── Common entry points ─────────────────────────────────────────────────────

/** Completed agreements changed since `since` (or the lookback window). */
export async function listCompletedAgreements(conn: AgreementConnection, since: Date | null) {
  switch (conn.provider as AgreementProviderId) {
    case "DOCUSIGN":
      return docuSignList(conn, since ?? new Date(Date.now() - FIRST_SYNC_LOOKBACK_DAYS * 86_400_000));
    case "DOCUMENSO":
      return documensoList(conn, since);
    case "IRONCLAD":
      return ironcladList(conn, since);
    default:
      throw new AgreementProviderError("Unknown provider.");
  }
}

/** One agreement by its provider id; null if it doesn't exist or isn't signed. */
export async function fetchAgreement(conn: AgreementConnection, externalId: string) {
  switch (conn.provider as AgreementProviderId) {
    case "DOCUSIGN":
      return docuSignOne(conn, externalId);
    case "DOCUMENSO":
      return documensoOne(conn, externalId);
    case "IRONCLAD":
      return ironcladOne(conn, externalId);
    default:
      return null;
  }
}

/** The signed PDF's bytes, or null when there's none or it's too large. */
export async function downloadSignedPdf(conn: AgreementConnection, agreement: Pick<PulledAgreement, "downloadUrl">) {
  if (!agreement.downloadUrl) return null;
  switch (conn.provider as AgreementProviderId) {
    case "DOCUSIGN": {
      const ctx = await docuSignContext(conn);
      // Only to this account's own API.
      if (!agreement.downloadUrl.startsWith(`${ctx.apiBase}/`)) return null;
      const res = await fetch(agreement.downloadUrl, { headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/pdf" } });
      return bytesOrThrow(res, "DocuSign");
    }
    case "DOCUMENSO": {
      if (!conn.accessToken) return null;
      const base = documensoBase(conn);
      if (!agreement.downloadUrl.startsWith(`${base}/api/v2/`)) return null;
      try {
        const { bytes } = await fetchPublicBytes(agreement.downloadUrl, {
          headers: { Authorization: decrypt(conn.accessToken), Accept: "application/pdf" },
          maxBytes: MAX_PDF_BYTES,
          timeoutMs: 60_000,
          what: "Documenso",
        });
        return bytes;
      } catch (err) {
        if (err instanceof SafeFetchError) {
          if (/too large/.test(err.message)) return null;
          throw new AgreementProviderError(err.message);
        }
        throw err;
      }
    }
    case "IRONCLAD": {
      const token = await ironcladAccessToken(conn);
      const res = await fetch(agreement.downloadUrl, {
        headers: { ...ironcladHeaders(token, conn.actAsEmail), Accept: "application/pdf, */*" },
      });
      return bytesOrThrow(res, "Ironclad");
    }
    default:
      return null;
  }
}
