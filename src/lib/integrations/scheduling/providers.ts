import "server-only";
import { requestPublicJson, SafeFetchError } from "@/lib/safe-fetch";
import { calendlyInviteeToBooking, cleanText, type IncomingBooking } from "./parse";

// API clients for Cal.com (API v2, cloud or self-hosted) and Calendly (API
// v2). They read the account and its event types, create and remove our
// webhook, and (Calendly without webhooks) pull recent bookings. Nothing
// here books, cancels or changes a meeting.

export class SchedulingProviderError extends Error {}
/** Calendly answered that webhooks need a paid plan. */
export class WebhooksNeedPaidPlanError extends SchedulingProviderError {}

export type ProviderEventType = {
  externalId: string;
  name: string;
  slug: string | null;
  bookingUrl: string | null;
  active: boolean;
};

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const MAX_PAGES = 10;

// ── Cal.com ────────────────────────────────────────────────────────────────

export const CALCOM_CLOUD_API = "https://api.cal.com";
/** Booking-related webhook triggers we subscribe to. */
export const CALCOM_TRIGGERS = ["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"] as const;
const CALCOM_EXTRA_TRIGGERS = ["BOOKING_REQUESTED", "BOOKING_REJECTED", "BOOKING_NO_SHOW_UPDATED"] as const;
/** The event-types endpoint answers in the shape of the version asked for.
 * 2024-06-14 is widely deployed (self-hosted instances included). */
const CALCOM_EVENT_TYPES_VERSION = "2024-06-14";

/** "https://api.cal.com/" or "https://cal.example.com/api/v2" → the API root
 * (without /v2). */
export function calcomApiBase(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, "") || CALCOM_CLOUD_API;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/v[12]$/i, "");
}

async function calcom(
  base: string,
  apiKey: string,
  path: string,
  opts: { method?: "GET" | "POST" | "DELETE"; body?: unknown; version?: string } = {}
) {
  try {
    const res = await requestPublicJson(`${base}/v2${path}`, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(opts.version ? { "cal-api-version": opts.version } : {}),
      },
      body: opts.body,
      what: "Cal.com",
      timeoutMs: 20_000,
    });
    return obj(res);
  } catch (err) {
    if (err instanceof SafeFetchError) {
      const hint = /answered 401|answered 403/.test(err.message) ? " Check the API key." : "";
      throw new SchedulingProviderError(`${err.message}${hint}`);
    }
    throw err;
  }
}

/** Checks a Cal.com API key and returns who it belongs to. */
export async function checkCalcom(baseUrl: string, apiKey: string) {
  const base = calcomApiBase(baseUrl);
  const me = obj((await calcom(base, apiKey, "/me")).data);
  if (me.id === undefined) throw new SchedulingProviderError("Cal.com didn't say whose API key this is.");
  return {
    base,
    userId: String(me.id),
    email: cleanText(me.email, 254),
    name: cleanText(me.name, 200) ?? cleanText(me.username, 200),
    username: cleanText(me.username, 200),
  };
}

export async function listCalcomEventTypes(baseUrl: string, apiKey: string, username: string | null) {
  const res = await calcom(calcomApiBase(baseUrl), apiKey, "/event-types", { version: CALCOM_EVENT_TYPES_VERSION });
  // 2024-06-14: data is the list. Older shapes: data.eventTypeGroups[].eventTypes.
  const data = res.data;
  const raw = Array.isArray(data) ? data : arr(obj(data).eventTypeGroups).flatMap((g) => arr(obj(g).eventTypes));
  const out: ProviderEventType[] = [];
  for (const item of raw.map(obj)) {
    if (item.id === undefined) continue;
    const slug = cleanText(item.slug, 200);
    const bookingUrl =
      cleanText(item.bookingUrl, 500) ??
      (username && slug && calcomApiBase(baseUrl) === CALCOM_CLOUD_API ? `https://cal.com/${username}/${slug}` : null);
    out.push({
      externalId: String(item.id),
      name: cleanText(item.title, 200) ?? slug ?? `Event type ${item.id}`,
      slug,
      bookingUrl,
      active: item.hidden !== true,
    });
  }
  return out;
}

/** Creates the webhook in Cal.com; returns its id. Older instances that
 * don't know the extra triggers get the three booking ones. */
export async function createCalcomWebhook(baseUrl: string, apiKey: string, url: string, secret: string) {
  const base = calcomApiBase(baseUrl);
  const attempt = (triggers: readonly string[]) =>
    calcom(base, apiKey, "/webhooks", {
      method: "POST",
      body: { subscriberUrl: url, triggers, active: true, secret },
    });
  let res;
  try {
    res = await attempt([...CALCOM_TRIGGERS, ...CALCOM_EXTRA_TRIGGERS]);
  } catch (err) {
    if (!(err instanceof SchedulingProviderError) || !/answered 400/.test(err.message)) throw err;
    res = await attempt(CALCOM_TRIGGERS);
  }
  const id = obj(res.data).id;
  if (id === undefined) throw new SchedulingProviderError("Cal.com didn't return the new webhook's id.");
  return String(id);
}

export async function deleteCalcomWebhook(baseUrl: string, apiKey: string, webhookId: string) {
  await calcom(calcomApiBase(baseUrl), apiKey, `/webhooks/${encodeURIComponent(webhookId)}`, { method: "DELETE" });
}

// ── Calendly ───────────────────────────────────────────────────────────────

const CALENDLY_API = "https://api.calendly.com";
export const CALENDLY_EVENTS = [
  "invitee.created",
  "invitee.canceled",
  "invitee_no_show.created",
  "invitee_no_show.deleted",
];

async function calendly(token: string, pathOrUrl: string, init: { method?: string; body?: unknown } = {}) {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${CALENDLY_API}${pathOrUrl}`;
  // Only ever Calendly's own API.
  if (!url.startsWith(`${CALENDLY_API}/`)) throw new SchedulingProviderError("Unexpected Calendly address.");
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new SchedulingProviderError("Couldn't reach Calendly.");
  }
  if (res.status === 204) return { status: 204, body: {} as Record<string, unknown> };
  const text = await res.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    body = obj(JSON.parse(text));
  } catch {
    // not JSON
  }
  if (!res.ok) {
    const message = (cleanText(body.message, 300) ?? cleanText(body.title, 100) ?? "").replace(/\.+$/, "");
    if (res.status === 403 && /upgrade/i.test(message)) {
      throw new WebhooksNeedPaidPlanError(`Calendly: ${message}`);
    }
    const hint = res.status === 401 ? " Check the personal access token." : "";
    throw Object.assign(
      new SchedulingProviderError(`Calendly answered ${res.status}${message ? `: ${message}` : ""}.${hint}`),
      { status: res.status }
    );
  }
  return { status: res.status, body };
}

/** Checks a Calendly personal access token; returns the user and org. */
export async function checkCalendly(token: string) {
  const me = obj((await calendly(token, "/users/me")).body.resource);
  const uri = cleanText(me.uri, 300);
  const org = cleanText(me.current_organization, 300);
  if (!uri || !org) throw new SchedulingProviderError("Calendly didn't say whose token this is.");
  return {
    userUri: uri,
    orgUri: org,
    email: cleanText(me.email, 254),
    name: cleanText(me.name, 200),
  };
}

async function calendlyPaged(token: string, path: string, params: Record<string, string>) {
  const items: Record<string, unknown>[] = [];
  let next: string | null = `${path}?${new URLSearchParams({ ...params, count: "100" })}`;
  for (let i = 0; next && i < MAX_PAGES; i++) {
    const { body }: { body: Record<string, unknown> } = await calendly(token, next);
    items.push(...arr(body.collection).map(obj));
    next = cleanText(obj(body.pagination).next_page, 2000);
  }
  return items;
}

export async function listCalendlyEventTypes(token: string, userUri: string) {
  const rows = await calendlyPaged(token, "/event_types", { user: userUri });
  return rows
    .filter((r) => typeof r.uri === "string")
    .map((r): ProviderEventType => ({
      externalId: String(r.uri),
      name: cleanText(r.name, 200) ?? "Event type",
      slug: cleanText(r.slug, 200),
      bookingUrl: cleanText(r.scheduling_url, 500),
      active: r.active !== false,
    }));
}

/** Subscribes our webhook URL to the user's bookings; returns the
 * subscription URI. Throws WebhooksNeedPaidPlanError on free plans. */
export async function createCalendlyWebhook(
  token: string,
  ids: { userUri: string; orgUri: string },
  url: string,
  signingKey: string
) {
  const body = {
    url,
    events: CALENDLY_EVENTS,
    organization: ids.orgUri,
    user: ids.userUri,
    scope: "user",
    signing_key: signingKey,
  };
  try {
    const res = await calendly(token, "/webhook_subscriptions", { method: "POST", body });
    return String(obj(res.body.resource).uri ?? "");
  } catch (err) {
    // 409: this exact URL is already subscribed (a half-finished earlier
    // attempt). Remove it and subscribe again with the new signing key.
    if ((err as { status?: number }).status !== 409) throw err;
    const existing = await calendlyPaged(token, "/webhook_subscriptions", {
      organization: ids.orgUri,
      user: ids.userUri,
      scope: "user",
    });
    for (const sub of existing) {
      if (sub.callback_url === url && typeof sub.uri === "string") await deleteCalendlyWebhook(token, sub.uri);
    }
    const res = await calendly(token, "/webhook_subscriptions", { method: "POST", body });
    return String(obj(res.body.resource).uri ?? "");
  }
}

export async function deleteCalendlyWebhook(token: string, subscriptionUri: string) {
  await calendly(token, subscriptionUri, { method: "DELETE" });
}

/** For accounts without webhooks: the user's bookings that start between
 * `from` and `to`, with their invitees. Only events changed since
 * `changedSince` have their invitees fetched (one call each). */
export async function pullCalendlyBookings(
  token: string,
  userUri: string,
  window: { from: Date; to: Date; changedSince: Date | null; maxEvents?: number }
) {
  const events = await calendlyPaged(token, "/scheduled_events", {
    user: userUri,
    min_start_time: window.from.toISOString(),
    max_start_time: window.to.toISOString(),
    sort: "start_time:asc",
  });
  const out: IncomingBooking[] = [];
  let fetched = 0;
  for (const ev of events) {
    const updated = typeof ev.updated_at === "string" ? new Date(ev.updated_at) : null;
    if (window.changedSince && updated && updated < window.changedSince) continue;
    if (fetched >= (window.maxEvents ?? 200)) break;
    if (typeof ev.uri !== "string") continue;
    fetched++;
    const invitees = await calendlyPaged(token, `${ev.uri.replace(CALENDLY_API, "")}/invitees`, {});
    for (const inv of invitees) {
      const booking = calendlyInviteeToBooking({ ...inv, scheduled_event: ev });
      if (!booking) continue;
      out.push(booking);
    }
  }
  return out;
}
