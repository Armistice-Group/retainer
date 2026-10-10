// Cal.com and Calendly webhook payloads (and Calendly API rows), turned into
// one shape. Pure: no database, no network. Signature checks live here too.
//
// Cal.com (https://cal.com/docs/developing/guides/automation/webhooks):
//   body  { triggerEvent, createdAt, payload: { uid, eventTypeId, type,
//           title, startTime, endTime, organizer, attendees, responses,
//           location, metadata.videoCallUrl, status, rescheduleUid, ... } }
//   header X-Cal-Signature-256: hex HMAC-SHA256 of the raw body, keyed with
//           the webhook's secret.
// Calendly (https://developer.calendly.com/api-docs):
//   body  { event: "invitee.created" | "invitee.canceled" |
//           "invitee_no_show.created" | "invitee_no_show.deleted",
//           created_at, payload: <invitee, with scheduled_event embedded> }
//   header Calendly-Webhook-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256
//           of "<t>.<raw body>", keyed with the subscription's signing key>.

import { createHmac, timingSafeEqual } from "node:crypto";
import { isPublicEmailDomain } from "@/lib/free-email-domains";

export const SCHEDULING_PROVIDERS = ["CALCOM", "CALENDLY"] as const;
export type SchedulingProviderId = (typeof SCHEDULING_PROVIDERS)[number];

export const SCHEDULING_PROVIDER_LABELS: Record<SchedulingProviderId, string> = {
  CALCOM: "Cal.com",
  CALENDLY: "Calendly",
};

/** URL slug ↔ provider, for /api/webhooks/scheduling/<slug>/<token>. */
export const PROVIDER_SLUGS: Record<string, SchedulingProviderId> = { calcom: "CALCOM", calendly: "CALENDLY" };
export const SLUG_FOR: Record<SchedulingProviderId, string> = { CALCOM: "calcom", CALENDLY: "calendly" };

export const EVENT_TYPE_PURPOSES = ["INTAKE", "CLIENTS", "IGNORE"] as const;
export type EventTypePurpose = (typeof EVENT_TYPE_PURPOSES)[number];
export const PURPOSE_LABELS: Record<EventTypePurpose, string> = {
  INTAKE: "Intake (new clients)",
  CLIENTS: "Existing clients",
  IGNORE: "Ignore",
};

export type BookingStatusValue = "SCHEDULED" | "CANCELLED" | "RESCHEDULED" | "NO_SHOW";

export type Answer = { question: string; answer: string };

export type IncomingBooking = {
  externalId: string;
  /** Calendly: the scheduled event's URI. */
  externalEventId: string | null;
  eventType: { externalId: string; name: string | null; slug: string | null } | null;
  title: string;
  startAt: Date;
  endAt: Date;
  status: BookingStatusValue;
  invitee: { name: string | null; email: string | null; phone: string | null; timeZone: string | null };
  hostEmail: string | null;
  joinUrl: string | null;
  location: string | null;
  answers: Answer[];
  /** Keys (Cal.com field slugs) alongside each answer, for the company question. */
  answerKeys: (string | null)[];
  cancelReason: string | null;
  /** A reschedule: the booking this one replaces. */
  replacesExternalId: string | null;
};

export type WebhookEvent =
  | { kind: "booking"; booking: IncomingBooking }
  | { kind: "status"; externalId: string; status: BookingStatusValue }
  | { kind: "ping" }
  | { kind: "ignored"; reason: string };

// ── Small helpers ──────────────────────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Plain text: no control characters or markup-ish brackets, trimmed, capped. */
export function cleanText(v: unknown, max = 500): string | null {
  if (v === null || v === undefined) return null;
  let s: string;
  if (typeof v === "string") s = v;
  else if (typeof v === "number" || typeof v === "boolean") s = String(v);
  else if (Array.isArray(v))
    s = v
      .map((x) => cleanText(x, max) ?? "")
      .filter(Boolean)
      .join(", ");
  else if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // Cal.com: { value, optionValue } (location) or { firstName, lastName } (name).
    if ("firstName" in o || "lastName" in o)
      s = [o.firstName, o.lastName].filter((x) => typeof x === "string").join(" ");
    else if ("value" in o) return cleanText(o.optionValue ? `${o.value} (${o.optionValue})` : o.value, max);
    else return null;
  } else return null;
  s = s
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function email(v: unknown) {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254 ? s : null;
}

function date(v: unknown) {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function httpsUrl(v: unknown) {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
}

export function emailDomain(address: string | null | undefined) {
  if (!address) return null;
  const at = address.lastIndexOf("@");
  return at > 0
    ? address
        .slice(at + 1)
        .trim()
        .toLowerCase()
    : null;
}

// ── Signatures ─────────────────────────────────────────────────────────────

function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export function signCalcom(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyCalcomSignature(rawBody: string, header: string | null, secret: string) {
  if (!header || !secret) return false;
  return safeEqualHex(header.trim().toLowerCase(), signCalcom(rawBody, secret));
}

/** How old a Calendly signature may be. Calendly's own examples use three
 * minutes; this allows for clock drift and queueing on either side. Replays
 * inside it are harmless (processing is idempotent). */
export const CALENDLY_TOLERANCE_MS = 10 * 60 * 1000;

export function signCalendly(rawBody: string, key: string, t: number) {
  return `t=${t},v1=${createHmac("sha256", key).update(`${t}.${rawBody}`).digest("hex")}`;
}

export function verifyCalendlySignature(rawBody: string, header: string | null, key: string, now = Date.now()) {
  if (!header || !key) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return false;
  if (Math.abs(now - t * 1000) > CALENDLY_TOLERANCE_MS) return false;
  const expected = createHmac("sha256", key).update(`${t}.${rawBody}`).digest("hex");
  return safeEqualHex(String(parts.v1).toLowerCase(), expected);
}

// ── Cal.com ────────────────────────────────────────────────────────────────

/** Booking-form fields Cal.com always has; they aren't "answers". */
const CALCOM_SYSTEM_FIELDS = new Set([
  "name",
  "email",
  "location",
  "guests",
  "rescheduleReason",
  "attendeePhoneNumber",
]);

export function parseCalcomWebhook(body: unknown): WebhookEvent {
  const root = obj(body);
  const trigger = String(root.triggerEvent ?? "");
  if (trigger === "PING" || (!trigger && root.payload === undefined)) return { kind: "ping" };
  // MEETING_STARTED / MEETING_ENDED are flat (no payload wrapper).
  const p = root.payload !== undefined ? obj(root.payload) : root;

  if (trigger === "BOOKING_NO_SHOW_UPDATED") {
    const uid = cleanText(p.bookingUid, 200);
    if (!uid) return { kind: "ignored", reason: "no booking uid" };
    const noShow = arr(p.attendees).some((a) => obj(a).noShow === true);
    return { kind: "status", externalId: uid, status: noShow ? "NO_SHOW" : "SCHEDULED" };
  }

  const status: BookingStatusValue | null =
    trigger === "BOOKING_CREATED" || trigger === "BOOKING_REQUESTED" || trigger === "BOOKING_RESCHEDULED"
      ? "SCHEDULED"
      : trigger === "BOOKING_CANCELLED" || trigger === "BOOKING_REJECTED"
        ? "CANCELLED"
        : null;
  if (!status) return { kind: "ignored", reason: `event ${trigger || "(none)"}` };

  const uid = cleanText(p.uid, 200);
  const startAt = date(p.startTime);
  const endAt = date(p.endTime);
  if (!uid || !startAt || !endAt) return { kind: "ignored", reason: "missing uid or times" };

  const attendee = obj(arr(p.attendees)[0]);
  const responses = obj(p.responses);
  const answers: Answer[] = [];
  const answerKeys: (string | null)[] = [];
  for (const [key, raw] of Object.entries(responses)) {
    if (CALCOM_SYSTEM_FIELDS.has(key)) continue;
    const r = obj(raw);
    if (r.isHidden === true) continue;
    const answer = cleanText("value" in r ? r.value : raw, 2000);
    if (!answer) continue;
    const label = cleanText(r.label, 200);
    answers.push({ question: label && !/^[a-z_]+$/.test(label) ? label : humanize(key), answer });
    answerKeys.push(key);
    if (answers.length >= 30) break;
  }
  const nameResponse = cleanText(obj(responses.name).value ?? responses.name, 200);
  const phone =
    cleanText(attendee.phoneNumber, 50) ??
    cleanText(obj(responses.attendeePhoneNumber).value, 50) ??
    cleanText(p.smsReminderNumber, 50);
  const metadata = obj(p.metadata);
  const videoUrl = httpsUrl(metadata.videoCallUrl) ?? httpsUrl(obj(p.videoCallData).url);
  const location = cleanText(p.location, 300);
  const eventTypeId = p.eventTypeId !== undefined && p.eventTypeId !== null ? String(p.eventTypeId) : null;
  const rescheduleUid = cleanText(p.rescheduleUid, 200);

  return {
    kind: "booking",
    booking: {
      externalId: uid,
      externalEventId: null,
      eventType: eventTypeId
        ? {
            externalId: eventTypeId,
            name: cleanText(p.eventTitle, 200) ?? cleanText(p.type, 200),
            slug: cleanText(p.type, 200),
          }
        : null,
      title: cleanText(p.title, 300) ?? cleanText(p.eventTitle, 300) ?? "Booking",
      startAt,
      endAt,
      status,
      invitee: {
        name: cleanText(attendee.name, 200) ?? nameResponse,
        email: email(attendee.email) ?? email(obj(responses.email).value),
        phone,
        timeZone: cleanText(attendee.timeZone, 64),
      },
      hostEmail: email(obj(p.organizer).email),
      joinUrl: videoUrl ?? (location ? httpsUrl(location) : null),
      location: location && !location.startsWith("integrations:") ? location : null,
      answers,
      answerKeys,
      cancelReason: cleanText(p.cancellationReason, 500),
      replacesExternalId:
        trigger === "BOOKING_RESCHEDULED" && rescheduleUid && rescheduleUid !== uid ? rescheduleUid : null,
    },
  };
}

function humanize(key: string) {
  const s = key
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "Answer";
}

// ── Calendly ───────────────────────────────────────────────────────────────

/** An invitee (webhook payload, or an API invitee with `scheduled_event`
 * attached) as a booking. */
export function calendlyInviteeToBooking(invitee: unknown, opts: { canceled?: boolean } = {}): IncomingBooking | null {
  const p = obj(invitee);
  const ev = obj(p.scheduled_event);
  const uri = cleanText(p.uri, 300);
  const startAt = date(ev.start_time);
  const endAt = date(ev.end_time);
  if (!uri || !startAt || !endAt) return null;
  const answers: Answer[] = [];
  const answerKeys: (string | null)[] = [];
  const qa = arr(p.questions_and_answers)
    .map(obj)
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
  for (const q of qa) {
    const question = cleanText(q.question, 200);
    const answer = cleanText(q.answer, 2000);
    if (!question || !answer) continue;
    answers.push({ question, answer });
    answerKeys.push(null);
    if (answers.length >= 30) break;
  }
  const phoneAnswer = answers.find((a) => /phone/i.test(a.question))?.answer ?? null;
  const loc = obj(ev.location);
  const host = obj(arr(ev.event_memberships)[0]);
  const status = String(p.status ?? "");
  const canceled = opts.canceled || status === "canceled" || String(ev.status ?? "") === "canceled";
  const cancellation = obj(p.cancellation);
  const eventTypeUri = cleanText(ev.event_type, 300);
  const name = cleanText(p.name, 200) ?? cleanText([p.first_name, p.last_name].filter(Boolean).join(" "), 200);
  return {
    externalId: uri,
    externalEventId: cleanText(ev.uri, 300),
    eventType: eventTypeUri ? { externalId: eventTypeUri, name: cleanText(ev.name, 200), slug: null } : null,
    title: cleanText(ev.name, 300) ?? "Booking",
    startAt,
    endAt,
    status: canceled
      ? p.rescheduled === true
        ? "RESCHEDULED"
        : "CANCELLED"
      : p.no_show && typeof p.no_show === "object"
        ? "NO_SHOW"
        : "SCHEDULED",
    invitee: {
      name,
      email: email(p.email),
      phone: cleanText(p.text_reminder_number, 50) ?? (phoneAnswer ? phoneAnswer.slice(0, 50) : null),
      timeZone: cleanText(p.timezone, 64),
    },
    hostEmail: email(host.user_email),
    joinUrl: httpsUrl(loc.join_url),
    location: cleanText(loc.location, 300),
    answers,
    answerKeys,
    cancelReason: cleanText(cancellation.reason, 500),
    replacesExternalId: cleanText(p.old_invitee, 300),
  };
}

export function parseCalendlyWebhook(body: unknown): WebhookEvent {
  const root = obj(body);
  const event = String(root.event ?? "");
  const p = obj(root.payload);
  if (event === "invitee.created" || event === "invitee.canceled") {
    const booking = calendlyInviteeToBooking(p, { canceled: event === "invitee.canceled" });
    return booking ? { kind: "booking", booking } : { kind: "ignored", reason: "missing invitee or times" };
  }
  if (event === "invitee_no_show.created" || event === "invitee_no_show.deleted") {
    // payload: { uri (the no-show), invitee (the invitee URI), created_at }
    const invitee = cleanText(p.invitee, 300);
    if (!invitee) return { kind: "ignored", reason: "no invitee" };
    return { kind: "status", externalId: invitee, status: event.endsWith("created") ? "NO_SHOW" : "SCHEDULED" };
  }
  return { kind: "ignored", reason: `event ${event || "(none)"}` };
}

// ── Drafting a client from a booking ───────────────────────────────────────

const COMPANY_QUESTION = /\b(company|organi[sz]ation|business|employer|firm|agency|brand)\b/i;

/** The company name a booking gives, from the configured question (its
 * label or Cal.com slug, case-insensitive) or one that looks like it. */
export function companyFromAnswers(
  booking: Pick<IncomingBooking, "answers" | "answerKeys">,
  configured: string | null | undefined
) {
  const want = configured?.trim().toLowerCase();
  const idx = booking.answers.findIndex((a, i) =>
    want
      ? a.question.toLowerCase() === want || booking.answerKeys[i]?.toLowerCase() === want
      : COMPANY_QUESTION.test(a.question) || COMPANY_QUESTION.test(booking.answerKeys[i] ?? "")
  );
  if (idx < 0) return null;
  const answer = booking.answers[idx].answer.split("\n")[0].trim();
  // A one-line name, not a paragraph.
  return answer && answer.length <= 120 ? answer : null;
}

/** "acme-labs.co.uk" → "Acme Labs". */
export function nameFromDomain(domain: string) {
  const parts = domain
    .toLowerCase()
    .replace(/^www\./, "")
    .split(".");
  // Drop the public suffix: one label, or two for ccTLD pairs like co.uk.
  let core = parts.length > 1 ? parts.slice(0, -1) : parts;
  if (core.length > 1 && /^(co|com|org|net|ac|gov|ltd|plc)$/.test(core[core.length - 1])) core = core.slice(0, -1);
  const label = core[core.length - 1] ?? domain;
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** What to call a draft client, and its website, from a booking. */
export function draftClientIdentity(
  booking: Pick<IncomingBooking, "answers" | "answerKeys" | "invitee">,
  companyQuestion: string | null | undefined
) {
  const domain = emailDomain(booking.invitee.email);
  const companyDomain = domain && !isPublicEmailDomain(domain) ? domain : null;
  const company = companyFromAnswers(booking, companyQuestion);
  const name =
    company ??
    (companyDomain ? nameFromDomain(companyDomain) : null) ??
    booking.invitee.name ??
    booking.invitee.email ??
    "New client";
  return { name: name.slice(0, 200), website: companyDomain, companyDomain };
}

/** The draft client's notes: when and how they booked, and their answers. */
export function draftDescription(
  booking: Pick<IncomingBooking, "answers" | "startAt" | "title">,
  source: string,
  timeZone = "UTC"
) {
  const when = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(booking.startAt);
  const lines = [`Booked "${booking.title}" through ${source} for ${when} (${timeZone} time).`];
  for (const a of booking.answers) lines.push(`${a.question}: ${a.answer}`);
  const text = lines.join("\n");
  return text.length > 2000 ? `${text.slice(0, 1999)}…` : text;
}
