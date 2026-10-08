import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import type { QuickBooksConnection } from "@/generated/prisma/client";

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPE = "com.intuit.quickbooks.accounting";
const STATE_TTL_MS = 10 * 60 * 1000;

export class QuickBooksError extends Error {}

/** Signs a short-lived { orgId, nonce, exp } payload so the OAuth callback can
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

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new QuickBooksError("AUTH_SECRET is not configured.");
  return secret;
}

/** Whether this instance has OAuth app credentials for the integration —
 * without them the Connect flow can't start. */
export function isQuickBooksConfigured() {
  return !!process.env.QUICKBOOKS_CLIENT_ID && !!process.env.QUICKBOOKS_CLIENT_SECRET;
}

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new QuickBooksError(`${name} is not configured.`);
  return value;
}

function apiBase() {
  const environment = process.env.QUICKBOOKS_ENVIRONMENT ?? "sandbox";
  return environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

function basicAuthHeader() {
  const clientId = env("QUICKBOOKS_CLIENT_ID");
  const clientSecret = env("QUICKBOOKS_CLIENT_SECRET");
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export function getAuthorizationUrl(state: string, redirectUri: string) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", env("QUICKBOOKS_CLIENT_ID"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

async function requestTokens(body: URLSearchParams) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new QuickBooksError(`QuickBooks token request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as TokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export function exchangeCodeForTokens(code: string, redirectUri: string) {
  return requestTokens(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    })
  );
}

function refreshTokens(refreshToken: string) {
  return requestTokens(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  );
}

/** Returns a usable access token, refreshing (and persisting the rotated tokens) if needed. */
export async function getValidAccessToken(connection: QuickBooksConnection) {
  const bufferMs = 2 * 60 * 1000;
  if (connection.accessTokenExpiresAt.getTime() - bufferMs > Date.now()) {
    return decrypt(connection.accessToken);
  }

  const refreshed = await refreshTokens(decrypt(connection.refreshToken));
  await prisma.quickBooksConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encrypt(refreshed.accessToken),
      refreshToken: encrypt(refreshed.refreshToken),
      accessTokenExpiresAt: refreshed.expiresAt,
    },
  });
  return refreshed.accessToken;
}

async function qboFetch(
  connection: QuickBooksConnection,
  path: string,
  init?: RequestInit
) {
  const accessToken = await getValidAccessToken(connection);
  const res = await fetch(`${apiBase()}/v3/company/${connection.realmId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new QuickBooksError(`QuickBooks API request to ${path} failed (${res.status}): ${text}`);
  }

  return res.json();
}

type QboClient = {
  name: string;
  email: string | null;
};

export async function findOrCreateCustomer(
  connection: QuickBooksConnection,
  client: QboClient,
  existingCustomerId: string | null
) {
  if (existingCustomerId) return existingCustomerId;

  const escapedName = client.name.replace(/'/g, "\\'");
  const query = await qboFetch(
    connection,
    `/query?query=${encodeURIComponent(`select Id from Customer where DisplayName = '${escapedName}'`)}`
  );
  const existing = query?.QueryResponse?.Customer?.[0];
  if (existing?.Id) return existing.Id as string;

  const created = await qboFetch(connection, "/customer", {
    method: "POST",
    body: JSON.stringify({
      DisplayName: client.name,
      ...(client.email ? { PrimaryEmailAddr: { Address: client.email } } : {}),
    }),
  });
  return created.Customer.Id as string;
}

const DEFAULT_ITEM_NAME = "Consulting Services";

export async function findOrCreateDefaultItem(connection: QuickBooksConnection) {
  if (connection.defaultItemId) return connection.defaultItemId;

  const query = await qboFetch(
    connection,
    `/query?query=${encodeURIComponent(`select Id from Item where Name = '${DEFAULT_ITEM_NAME}'`)}`
  );
  const existing = query?.QueryResponse?.Item?.[0];
  let itemId: string;

  if (existing?.Id) {
    itemId = existing.Id;
  } else {
    const incomeAccounts = await qboFetch(
      connection,
      `/query?query=${encodeURIComponent(
        "select Id from Account where AccountType = 'Income' maxresults 1"
      )}`
    );
    const incomeAccountId = incomeAccounts?.QueryResponse?.Account?.[0]?.Id;
    if (!incomeAccountId) {
      throw new QuickBooksError(
        "Couldn't find an income account in QuickBooks to attach the default service item to."
      );
    }

    const created = await qboFetch(connection, "/item", {
      method: "POST",
      body: JSON.stringify({
        Name: DEFAULT_ITEM_NAME,
        Type: "Service",
        IncomeAccountRef: { value: incomeAccountId },
      }),
    });
    itemId = created.Item.Id;
  }

  await prisma.quickBooksConnection.update({
    where: { id: connection.id },
    data: { defaultItemId: itemId },
  });
  return itemId;
}

export type QboInvoiceLineItem = {
  description: string;
  quantity: number;
  rate: number;
};

export type QboInvoiceStatus = {
  balance: number;
  totalAmt: number;
  emailStatus: string;
};

export async function fetchInvoiceStatus(
  connection: QuickBooksConnection,
  quickbooksInvoiceId: string
): Promise<QboInvoiceStatus> {
  const data = await qboFetch(connection, `/invoice/${quickbooksInvoiceId}`);
  return {
    balance: Number(data.Invoice.Balance ?? 0),
    totalAmt: Number(data.Invoice.TotalAmt ?? 0),
    emailStatus: String(data.Invoice.EmailStatus ?? "NotSet"),
  };
}

export async function createInvoice(
  connection: QuickBooksConnection,
  params: {
    customerId: string;
    itemId: string;
    lineItems: QboInvoiceLineItem[];
    dueDate: Date;
    docNumber: string;
  }
) {
  const created = await qboFetch(connection, "/invoice", {
    method: "POST",
    body: JSON.stringify({
      CustomerRef: { value: params.customerId },
      DocNumber: params.docNumber,
      DueDate: params.dueDate.toISOString().slice(0, 10),
      Line: params.lineItems.map((item) => ({
        Amount: Math.round(item.quantity * item.rate * 100) / 100,
        DetailType: "SalesItemLineDetail",
        Description: item.description,
        SalesItemLineDetail: {
          ItemRef: { value: params.itemId },
          Qty: item.quantity,
          UnitPrice: item.rate,
        },
      })),
    }),
  });
  return created.Invoice.Id as string;
}
