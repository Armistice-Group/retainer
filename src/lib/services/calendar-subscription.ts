import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getOrigin } from "@/lib/url";
import { getCalendarItems, type CalendarItem, type CalendarViewer } from "@/lib/services/calendar-items";

// A person's secret iCal feed of their deadlines (see CalendarSubscription).
// The token is only ever shown once; we keep its SHA-256. Meetings are never
// in it — they come from the person's own calendar already.

const DAY_MS = 86_400_000;
// Calendar apps poll every few minutes to hours; each feed is built at most
// once every few minutes per process. Cleared whenever a token changes, so
// a revoked address stops working right away.
const CACHE_MS = 5 * 60_000;
const MAX_CACHED = 500;
const feedCache = new Map<string, { body: string; at: number }>();
/** How far back and ahead the feed reaches. */
const PAST_DAYS = 60;
const FUTURE_DAYS = 400;

export function hashCalendarToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function calendarFeedUrl(token: string) {
  return `${await getOrigin()}/api/calendar/${token}.ics`;
}

/** Creates the person's feed for this org, or replaces its token (the old
 * address stops working). Returns the new address. */
export async function regenerateCalendarSubscription(userId: string, orgId: string) {
  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashCalendarToken(token);
  await prisma.calendarSubscription.upsert({
    where: { userId_orgId: { userId, orgId } },
    create: { userId, orgId, tokenHash },
    update: { tokenHash, createdAt: new Date(), lastFetchedAt: null },
  });
  feedCache.clear();
  return calendarFeedUrl(token);
}

export async function revokeCalendarSubscription(userId: string, orgId: string) {
  await prisma.calendarSubscription.deleteMany({ where: { userId, orgId } });
  feedCache.clear();
}

/** The viewer behind a feed token, with their current role — or null when
 * the token is unknown or they've left the org. */
export async function viewerForToken(token: string): Promise<(CalendarViewer & { orgName: string; id: string; lastFetchedAt: Date | null }) | null> {
  const sub = await prisma.calendarSubscription.findUnique({
    where: { tokenHash: hashCalendarToken(token) },
    select: { id: true, userId: true, orgId: true, lastFetchedAt: true, org: { select: { name: true } } },
  });
  if (!sub) return null;
  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: sub.userId, orgId: sub.orgId } },
    select: { role: true },
  });
  if (!membership) return null;
  return {
    id: sub.id,
    orgId: sub.orgId,
    userId: sub.userId,
    role: membership.role,
    orgName: sub.org.name,
    lastFetchedAt: sub.lastFetchedAt,
  };
}

// ── iCalendar ────────────────────────────────────────────────────────────

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 75 octets (RFC 5545 §3.1). */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + n > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compact = (day: string) => day.replace(/-/g, "");
const nextDay = (day: string) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);

export function buildIcs(items: CalendarItem[], opts: { calendarName: string; origin: string; now?: Date }) {
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Consultainer//Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.calendarName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const item of items) {
    const title = item.done ? `${item.title} (done)` : item.title;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.key.replace(/[^A-Za-z0-9:_-]/g, "-")}@consultainer`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(item.day)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(item.day))}`,
      `SUMMARY:${escapeText(title)}`,
      ...(item.detail ? [`DESCRIPTION:${escapeText(item.detail)}`] : []),
      `URL:${opts.origin}${item.href}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** The feed's body for a viewer, worked out from what they can see now. */
export async function calendarFeedBody(viewer: CalendarViewer & { orgName: string }, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const items = await getCalendarItems(viewer, {
    from: new Date(today - PAST_DAYS * DAY_MS).toISOString().slice(0, 10),
    to: new Date(today + FUTURE_DAYS * DAY_MS).toISOString().slice(0, 10),
    // Everything but meetings (they're in the person's own calendar).
    types: ["task", "milestone", "project", "invoice", "scheduled_send", "recurring", "billing_cycle", "estimate"],
    tasks: "mine",
    timeZone: "UTC",
  });
  return buildIcs(items, {
    calendarName: `Consultainer — ${viewer.orgName}`,
    origin: await getOrigin(),
    now,
  });
}

/** The feed for a token (cached briefly), or null for an unknown token. */
export async function feedForToken(token: string, now = new Date()) {
  const key = hashCalendarToken(token);
  const hit = feedCache.get(key);
  if (hit && now.getTime() - hit.at < CACHE_MS) return hit.body;

  const viewer = await viewerForToken(token);
  if (!viewer) {
    feedCache.delete(key);
    return null;
  }
  const body = await calendarFeedBody(viewer, now);
  if (feedCache.size >= MAX_CACHED) feedCache.delete(feedCache.keys().next().value!);
  feedCache.set(key, { body, at: now.getTime() });
  // "Last used" for the profile page, at most hourly.
  if (!viewer.lastFetchedAt || now.getTime() - viewer.lastFetchedAt.getTime() > 3_600_000) {
    await prisma.calendarSubscription
      .update({ where: { id: viewer.id }, data: { lastFetchedAt: now } })
      .catch(() => {});
  }
  return body;
}
