import "server-only";
import ical, { type VEvent } from "node-ical";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { notify } from "@/lib/notifications";
import { fetchPublicText, normalizePublicUrl, SafeFetchError } from "@/lib/safe-fetch";
import { isPublicEmailDomain } from "@/lib/free-email-domains";
import { projectVisibilityWhere } from "@/lib/project-access";
import { createTimeEntry, TimeEntryError, type TimeEntryContext } from "@/lib/services/time-entries";

export class CalendarError extends Error {}

/** How far back a sync looks for meetings to sort. */
export const LOOKBACK_DAYS = 14;
const DAY_MS = 86_400_000;
const MIN_MINUTES = 5;
const MAX_HOURS = 10;
const NUDGE_EVERY_MS = 20 * 60 * 60 * 1000;

type Ctx = TimeEntryContext;

// ── Feeds ────────────────────────────────────────────────────────────────

export async function addCalendarFeed(ctx: Ctx, input: { name: string; url: string }) {
  let url: URL;
  try {
    url = normalizePublicUrl(input.url);
  } catch (err) {
    throw new CalendarError(err instanceof Error ? err.message : "That isn't a valid link.");
  }
  const count = await prisma.calendarFeed.count({ where: { userId: ctx.actorId, orgId: ctx.orgId } });
  if (count >= 5) throw new CalendarError("You can connect up to 5 calendars.");

  // Make sure it's actually a calendar before saving it.
  const text = await download(url.toString());
  parse(text);

  const feed = await prisma.calendarFeed.create({
    data: {
      orgId: ctx.orgId,
      userId: ctx.actorId,
      name: input.name.trim().slice(0, 80) || url.hostname,
      url: encrypt(url.toString()),
    },
  });
  await syncFeed(feed.id, { text });
  return feed;
}

export async function removeCalendarFeed(ctx: Ctx, feedId: string) {
  const feed = await prisma.calendarFeed.findUnique({ where: { id: feedId } });
  if (!feed || feed.userId !== ctx.actorId) throw new CalendarError("Calendar not found.");
  // Logged meetings keep their time entries; the meetings themselves go.
  await prisma.calendarFeed.delete({ where: { id: feedId } });
}

async function download(url: string) {
  try {
    const text = await fetchPublicText(url);
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      throw new CalendarError(
        "That link didn't return a calendar. Use the calendar's secret iCal (.ics) address."
      );
    }
    return text;
  } catch (err) {
    if (err instanceof SafeFetchError) throw new CalendarError(err.message);
    throw err;
  }
}

function parse(text: string) {
  try {
    return ical.sync.parseICS(text);
  } catch {
    throw new CalendarError("Couldn't read that calendar.");
  }
}

// ── Sync ─────────────────────────────────────────────────────────────────

const str = (v: unknown): string =>
  typeof v === "string" ? v : v && typeof v === "object" && "val" in v ? String((v as { val: unknown }).val) : "";

function emailOf(value: unknown) {
  const raw = str(value).replace(/^mailto:/i, "").trim().toLowerCase();
  return raw.includes("@") ? raw : null;
}

function attendeeList(event: VEvent) {
  const list = event.attendee ? (Array.isArray(event.attendee) ? event.attendee : [event.attendee]) : [];
  return list.map((a) => ({
    email: emailOf(a),
    partstat: typeof a === "object" && a && "params" in a ? (a.params as { PARTSTAT?: string }).PARTSTAT : undefined,
    cutype: typeof a === "object" && a && "params" in a ? (a.params as { CUTYPE?: string }).CUTYPE : undefined,
  }));
}

type Occurrence = { uid: string; title: string; location: string | null; start: Date; end: Date; attendees: string[] };

/** Finished, timed, attended meetings in the window — one per occurrence. */
function occurrences(data: ReturnType<typeof parse>, me: string, from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const component of Object.values(data)) {
    if (!component || component.type !== "VEVENT") continue;
    const base = component as VEvent;
    if (base.recurrenceid) continue; // Overrides come through their base event.
    let instances;
    try {
      instances = ical.expandRecurringEvent(base, { from, to });
    } catch {
      continue;
    }
    for (const inst of instances) {
      const ev = inst.event;
      if (inst.isFullDay) continue;
      if (ev.status === "CANCELLED") continue;
      if (ev.transparency === "TRANSPARENT") continue;
      const start = new Date(inst.start);
      const end = new Date(inst.end ?? inst.start);
      if (end > to || end <= start) continue; // Only meetings that are over.
      const minutes = (end.getTime() - start.getTime()) / 60000;
      if (minutes < MIN_MINUTES || minutes > MAX_HOURS * 60) continue;
      const people = attendeeList(ev);
      if (people.some((p) => p.email === me && p.partstat === "DECLINED")) continue;
      out.push({
        uid: base.uid,
        title: str(inst.summary || ev.summary).trim().slice(0, 300) || "(no title)",
        location: str(ev.location).trim().slice(0, 300) || null,
        start,
        end,
        attendees: [
          ...new Set(
            people
              .filter((p) => p.email && p.email !== me && p.cutype !== "ROOM" && p.cutype !== "RESOURCE")
              .map((p) => p.email!)
          ),
        ],
      });
    }
  }
  return out;
}

/** Pulls a feed's recent meetings in: new ones become PENDING (with a
 * suggested project) or are sorted by the person's remembered series
 * rules; pending ones that vanished from the calendar are dropped. */
export async function syncFeed(feedId: string, opts: { text?: string; now?: Date } = {}) {
  const feed = await prisma.calendarFeed.findUnique({
    where: { id: feedId },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!feed) return { added: 0 };
  const now = opts.now ?? new Date();
  const from = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);

  let found: Occurrence[];
  try {
    const text = opts.text ?? (await download(decrypt(feed.url)));
    found = occurrences(parse(text), feed.user.email.toLowerCase(), from, now);
  } catch (err) {
    const message = err instanceof CalendarError ? err.message : "Couldn't sync this calendar.";
    await prisma.calendarFeed.update({ where: { id: feedId }, data: { lastError: message } });
    if (!(err instanceof CalendarError)) console.warn("[calendar] Sync failed", feedId, err);
    return { added: 0, error: message };
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: feed.userId, orgId: feed.orgId } },
  });
  if (!membership) return { added: 0 };
  const ctx: Ctx = {
    orgId: feed.orgId,
    actorId: feed.userId,
    actorName: feed.user.name,
    role: membership.role,
    slackWebhookUrl: null,
  };

  const existing = await prisma.calendarEvent.findMany({
    where: { feedId, start: { gte: from } },
    select: { id: true, uid: true, start: true, status: true },
  });
  const key = (uid: string, start: Date) => `${uid}|${start.toISOString()}`;
  const seen = new Set(found.map((o) => key(o.uid, o.start)));
  const known = new Map(existing.map((e) => [key(e.uid, e.start), e]));
  const suggester = await makeSuggester(ctx);
  const rules = new Map(
    (await prisma.calendarRule.findMany({ where: { userId: feed.userId, kind: "SERIES" } })).map((r) => [
      r.value,
      r,
    ])
  );

  let added = 0;
  for (const occ of found) {
    const prior = known.get(key(occ.uid, occ.start));
    if (prior) {
      if (prior.status === "PENDING") {
        await prisma.calendarEvent.update({
          where: { id: prior.id },
          data: { title: occ.title, location: occ.location, end: occ.end, attendees: occ.attendees },
        });
      }
      continue;
    }
    const suggestion = await suggester(occ);
    const created = await prisma.calendarEvent.create({
      data: {
        feedId,
        userId: feed.userId,
        uid: occ.uid,
        title: occ.title,
        location: occ.location,
        start: occ.start,
        end: occ.end,
        attendees: occ.attendees,
        suggestedProjectId: suggestion?.projectId ?? null,
        suggestionReason: suggestion?.reason ?? null,
      },
    });
    const rule = rules.get(occ.uid);
    if (rule) {
      // Remembered series: sort it the same way without asking.
      try {
        if (rule.projectId) {
          await logMeeting(ctx, created.id, {
            projectId: rule.projectId,
            billable: true,
            date: created.start.toISOString().slice(0, 10),
          });
        } else {
          await prisma.calendarEvent.update({ where: { id: created.id }, data: { status: "IGNORED" } });
        }
        continue;
      } catch (err) {
        // e.g. the project's gone or the week is locked — leave it to sort.
        console.warn("[calendar] Rule couldn't apply", created.id, err);
      }
    }
    added++;
  }

  // Meetings cancelled or deleted since: drop them if nobody sorted them.
  const gone = existing.filter((e) => e.status === "PENDING" && !seen.has(key(e.uid, e.start)));
  if (gone.length) {
    await prisma.calendarEvent.deleteMany({ where: { id: { in: gone.map((g) => g.id) } } });
  }

  await prisma.calendarFeed.update({
    where: { id: feedId },
    data: { lastSyncedAt: now, lastError: null },
  });
  await nudge(feed.id, feed.userId, feed.orgId, feed.lastNudgedAt, now);
  return { added };
}

async function nudge(feedId: string, userId: string, orgId: string, last: Date | null, now: Date) {
  if (last && now.getTime() - last.getTime() < NUDGE_EVERY_MS) return;
  const pending = await prisma.calendarEvent.count({ where: { userId, status: "PENDING" } });
  if (pending === 0) return;
  await notify(prisma, {
    orgId,
    userIds: [userId],
    type: "MEETINGS_TO_SORT",
    message: `You have ${pending} meeting${pending === 1 ? "" : "s"} to sort into projects.`,
    link: "/time?view=meetings",
  });
  await prisma.calendarFeed.update({ where: { id: feedId }, data: { lastNudgedAt: now } });
}

/** Hourly: every feed in the instance. */
export async function syncAllFeeds() {
  const feeds = await prisma.calendarFeed.findMany({ select: { id: true } });
  let added = 0;
  let failed = 0;
  for (const f of feeds) {
    const r = await syncFeed(f.id);
    added += r.added;
    if ("error" in r && r.error) failed++;
  }
  return { feeds: feeds.length, added, failed };
}

// ── Suggestions ──────────────────────────────────────────────────────────

function domainOf(email: string | null | undefined) {
  return email?.split("@")[1]?.toLowerCase() ?? null;
}

function hostOf(website: string | null) {
  if (!website) return null;
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return null;
  }
}

/** Builds a project suggester for one person: same series as before, then
 * attendee domains matching a client, then the title naming a project or
 * client. */
async function makeSuggester(ctx: Ctx) {
  const [projects, clients, members, recent] = await Promise.all([
    prisma.project.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE", ...projectVisibilityWhere(ctx.actorId, ctx.role) },
      select: { id: true, name: true, clientId: true },
    }),
    prisma.client.findMany({
      where: { orgId: ctx.orgId },
      select: {
        id: true,
        name: true,
        email: true,
        billingEmail: true,
        website: true,
        contacts: { select: { email: true } },
      },
    }),
    prisma.membership.findMany({
      where: { orgId: ctx.orgId },
      select: { user: { select: { email: true } } },
    }),
    prisma.timeEntry.findMany({
      where: { orgId: ctx.orgId, userId: ctx.actorId },
      orderBy: { date: "desc" },
      take: 200,
      select: { projectId: true },
    }),
  ]);
  const activeIds = new Set(projects.map((p) => p.id));
  const ownDomains = new Set(members.map((m) => domainOf(m.user.email)).filter(Boolean));
  const clientByDomain = new Map<string, string>();
  for (const c of clients) {
    const domains = [
      domainOf(c.email),
      domainOf(c.billingEmail),
      hostOf(c.website),
      ...c.contacts.map((x) => domainOf(x.email)),
    ];
    for (const d of domains) {
      if (d && !isPublicEmailDomain(d) && !ownDomains.has(d)) clientByDomain.set(d, c.id);
    }
  }
  const recentRank = new Map<string, number>();
  recent.forEach((e, i) => {
    if (!recentRank.has(e.projectId)) recentRank.set(e.projectId, i);
  });
  const projectFor = (clientId: string) =>
    projects
      .filter((p) => p.clientId === clientId)
      .sort((a, b) => (recentRank.get(a.id) ?? 1e9) - (recentRank.get(b.id) ?? 1e9))[0];
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  return async (occ: Occurrence): Promise<{ projectId: string; reason: string } | null> => {
    const series = await prisma.calendarEvent.findFirst({
      where: { userId: ctx.actorId, uid: occ.uid, status: "LOGGED", projectId: { not: null } },
      orderBy: { start: "desc" },
      select: { projectId: true },
    });
    if (series?.projectId && activeIds.has(series.projectId)) {
      return { projectId: series.projectId, reason: "Same as earlier meetings in this series" };
    }

    for (const email of occ.attendees) {
      const d = domainOf(email);
      const clientId = d ? clientByDomain.get(d) : undefined;
      const project = clientId ? projectFor(clientId) : undefined;
      if (project) return { projectId: project.id, reason: `Attendees from ${d} (${clientName.get(clientId!)})` };
    }

    const title = occ.title.toLowerCase();
    const byName = projects
      .filter((p) => p.name.length >= 4 && title.includes(p.name.toLowerCase()))
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (byName) return { projectId: byName.id, reason: `Title mentions ${byName.name}` };
    for (const c of clients) {
      if (c.name.length >= 4 && title.includes(c.name.toLowerCase())) {
        const project = projectFor(c.id);
        if (project) return { projectId: project.id, reason: `Title mentions ${c.name}` };
      }
    }
    return null;
  };
}

// ── Sorting ──────────────────────────────────────────────────────────────

async function ownPending(ctx: Ctx, eventId: string) {
  const event = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!event || event.userId !== ctx.actorId) throw new CalendarError("Meeting not found.");
  if (event.status !== "PENDING") throw new CalendarError("That meeting is already sorted.");
  return event;
}

export function meetingHours(event: { start: Date; end: Date }) {
  return Math.round(((event.end.getTime() - event.start.getTime()) / 3_600_000) * 100) / 100;
}

/** Logs a meeting as a time entry on a project. With `remember`, future
 * meetings in the series go there too, and other unsorted ones in it now. */
export async function logMeeting(
  ctx: Ctx,
  eventId: string,
  input: {
    projectId: string;
    taskId?: string | null;
    billable: boolean;
    /** yyyy-mm-dd the entry is dated — the meeting's local day. */
    date: string;
    description?: string | null;
    remember?: boolean;
  }
) {
  const event = await ownPending(ctx, eventId);
  let entry;
  try {
    entry = await createTimeEntry(ctx, {
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      date: input.date,
      hours: meetingHours(event),
      description: input.description?.trim() || event.title,
      billable: input.billable,
    });
  } catch (err) {
    if (err instanceof TimeEntryError) throw new CalendarError(err.message);
    throw err;
  }
  await prisma.calendarEvent.update({
    where: { id: event.id },
    data: { status: "LOGGED", projectId: input.projectId, timeEntryId: entry.id },
  });

  let alsoLogged = 0;
  if (input.remember) {
    await rememberSeries(ctx.actorId, event.uid, input.projectId);
    const others = await prisma.calendarEvent.findMany({
      where: { userId: ctx.actorId, uid: event.uid, status: "PENDING", id: { not: event.id } },
    });
    for (const other of others) {
      try {
        await logMeeting(ctx, other.id, {
          projectId: input.projectId,
          taskId: input.taskId,
          billable: input.billable,
          date: other.start.toISOString().slice(0, 10),
        });
        alsoLogged++;
      } catch {
        // Leave it to sort by hand.
      }
    }
  }
  return { entry, alsoLogged };
}

/** Marks a meeting as not project work. With `remember`, the series too. */
export async function ignoreMeeting(ctx: Ctx, eventId: string, remember = false) {
  const event = await ownPending(ctx, eventId);
  await prisma.calendarEvent.update({ where: { id: event.id }, data: { status: "IGNORED" } });
  if (remember) {
    await rememberSeries(ctx.actorId, event.uid, null);
    await prisma.calendarEvent.updateMany({
      where: { userId: ctx.actorId, uid: event.uid, status: "PENDING" },
      data: { status: "IGNORED" },
    });
  }
}

async function rememberSeries(userId: string, uid: string, projectId: string | null) {
  await prisma.calendarRule.upsert({
    where: { userId_kind_value: { userId, kind: "SERIES", value: uid } },
    create: { userId, kind: "SERIES", value: uid, projectId },
    update: { projectId },
  });
}

/** Forget remembered series (all, or one). */
export async function forgetSeriesRules(userId: string, ruleId?: string) {
  await prisma.calendarRule.deleteMany({ where: { userId, ...(ruleId ? { id: ruleId } : {}) } });
}

export async function pendingMeetings(userId: string, orgId: string) {
  return prisma.calendarEvent.findMany({
    where: { userId, status: "PENDING", feed: { orgId } },
    orderBy: { start: "desc" },
    take: 200,
  });
}
