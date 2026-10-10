import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { sendAlert } from "@/lib/alerts";
import { recordAuditEvent } from "@/lib/audit";
import { isPublicEmailDomain } from "@/lib/free-email-domains";
import { getOrigin } from "@/lib/url";
import {
  checkCalcom,
  checkCalendly,
  createCalcomWebhook,
  createCalendlyWebhook,
  deleteCalcomWebhook,
  deleteCalendlyWebhook,
  listCalcomEventTypes,
  listCalendlyEventTypes,
  pullCalendlyBookings,
  SchedulingProviderError,
  WebhooksNeedPaidPlanError,
  CALCOM_CLOUD_API,
  type ProviderEventType,
} from "@/lib/integrations/scheduling/providers";
import {
  draftClientIdentity,
  draftDescription,
  emailDomain,
  EVENT_TYPE_PURPOSES,
  parseCalcomWebhook,
  parseCalendlyWebhook,
  PROVIDER_SLUGS,
  SCHEDULING_PROVIDER_LABELS,
  SLUG_FOR,
  verifyCalcomSignature,
  verifyCalendlySignature,
  type BookingStatusValue,
  type EventTypePurpose,
  type IncomingBooking,
  type SchedulingProviderId,
  type WebhookEvent,
} from "@/lib/integrations/scheduling/parse";
import type { Prisma, Role, SchedulingConnection } from "@/generated/prisma/client";

// Cal.com and Calendly. Bookings arrive by webhook (or, for Calendly accounts
// without webhooks, an hourly pull) and are stored as Booking rows:
//   - from a known contact: linked to that contact's client;
//   - from someone new: a draft client (status LEAD) is created with them as
//     its contact, or an existing draft from the same email or company
//     domain gets the booking; owners and admins get a NEW_LEAD alert;
//   - event types mapped to Ignore are dropped.
// Owners and admins then make each draft a client, merge it into one, or
// discard it (restorable for 30 days, then purged by the hourly job).

export class SchedulingError extends Error {}

export type SchedulingActor = { orgId: string; actorId: string; role: Role };

/** Discarded drafts are deleted this long after. */
export const DISCARD_PURGE_DAYS = 30;
const DAY_MS = 86_400_000;
/** Calendly pull window. */
const PULL_PAST_DAYS = 2;
const PULL_FUTURE_DAYS = 180;

function requireAdmin(actor: Pick<SchedulingActor, "role">) {
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
    throw new SchedulingError("Only owners and admins can do that.");
  }
}

export const hashWebhookToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newSecret = () => randomBytes(24).toString("base64url");

export function webhookUrl(origin: string, provider: SchedulingProviderId, token: string) {
  return `${origin.replace(/\/+$/, "")}/api/webhooks/scheduling/${SLUG_FOR[provider]}/${token}`;
}

/** The webhook URL and secret to show in settings (owners and admins). */
export function connectionWebhook(
  conn: Pick<SchedulingConnection, "provider" | "webhookToken" | "webhookSecret">,
  origin: string
) {
  return {
    url: webhookUrl(origin, conn.provider as SchedulingProviderId, decrypt(conn.webhookToken)),
    secret: decrypt(conn.webhookSecret),
  };
}

// ── Connections ────────────────────────────────────────────────────────────

async function existingConnection(orgId: string, provider: SchedulingProviderId) {
  return prisma.schedulingConnection.findUnique({ where: { orgId_provider: { orgId, provider } } });
}

/** Removes a webhook we created at the provider. Best effort. */
async function removeProviderWebhook(conn: SchedulingConnection) {
  if (!conn.webhookId) return;
  try {
    const token = decrypt(conn.apiToken);
    if (conn.provider === "CALCOM") await deleteCalcomWebhook(conn.baseUrl ?? CALCOM_CLOUD_API, token, conn.webhookId);
    else await deleteCalendlyWebhook(token, conn.webhookId);
  } catch (err) {
    console.warn("[scheduling] Couldn't remove the provider webhook", conn.id, err);
  }
}

export async function connectCalcom(
  actor: SchedulingActor,
  input: { baseUrl: string; apiKey: string; createWebhook: boolean }
) {
  requireAdmin(actor);
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new SchedulingError("Paste a Cal.com API key.");
  let me;
  try {
    me = await checkCalcom(input.baseUrl || CALCOM_CLOUD_API, apiKey);
  } catch (err) {
    if (err instanceof SchedulingProviderError) throw new SchedulingError(`Couldn't connect: ${err.message}`);
    throw err;
  }
  const prior = await existingConnection(actor.orgId, "CALCOM");
  if (prior) await removeProviderWebhook(prior);
  // Keep the webhook URL and secret across reconnects, so a webhook added
  // by hand in Cal.com keeps working.
  const token = prior ? decrypt(prior.webhookToken) : newSecret();
  const secret = prior ? decrypt(prior.webhookSecret) : newSecret();
  let webhookId: string | null = null;
  let lastError: string | null = null;
  if (input.createWebhook) {
    try {
      webhookId = await createCalcomWebhook(me.base, apiKey, webhookUrl(await getOrigin(), "CALCOM", token), secret);
    } catch (err) {
      if (!(err instanceof SchedulingProviderError)) throw err;
      lastError = `Couldn't create the webhook in Cal.com (${err.message}). Add it by hand with the URL and secret below.`;
    }
  }
  const data = {
    baseUrl: me.base,
    apiToken: encrypt(apiKey),
    accountName: me.name ?? me.username,
    accountEmail: me.email,
    externalUserId: me.userId,
    externalOrgId: me.username,
    webhookTokenHash: hashWebhookToken(token),
    webhookToken: encrypt(token),
    webhookSecret: encrypt(secret),
    webhookId,
    mode: "WEBHOOK",
    lastError,
    connectedById: actor.actorId,
  };
  const conn = await prisma.schedulingConnection.upsert({
    where: { orgId_provider: { orgId: actor.orgId, provider: "CALCOM" } },
    create: { orgId: actor.orgId, provider: "CALCOM", ...data },
    update: data,
  });
  await refreshEventTypesFor(conn).catch((err) => console.warn("[scheduling] Event types", err));
  return conn;
}

export async function connectCalendly(actor: SchedulingActor, input: { token: string }) {
  requireAdmin(actor);
  const token = input.token.trim();
  if (!token) throw new SchedulingError("Paste a Calendly personal access token.");
  let me;
  try {
    me = await checkCalendly(token);
  } catch (err) {
    if (err instanceof SchedulingProviderError) throw new SchedulingError(`Couldn't connect: ${err.message}`);
    throw err;
  }
  const prior = await existingConnection(actor.orgId, "CALENDLY");
  if (prior) await removeProviderWebhook(prior);
  // A fresh URL and signing key each time: Calendly keeps one subscription
  // per URL, and we always create it ourselves.
  const pathToken = newSecret();
  const signingKey = newSecret();
  let webhookId: string | null = null;
  let mode = "WEBHOOK";
  let lastError: string | null = null;
  try {
    webhookId = await createCalendlyWebhook(
      token,
      { userUri: me.userUri, orgUri: me.orgUri },
      webhookUrl(await getOrigin(), "CALENDLY", pathToken),
      signingKey
    );
  } catch (err) {
    if (!(err instanceof SchedulingProviderError)) throw err;
    mode = "POLLING";
    if (!(err instanceof WebhooksNeedPaidPlanError)) {
      lastError = `Couldn't set up the Calendly webhook (${err.message}). Checking for new bookings every hour instead.`;
    }
  }
  const data = {
    baseUrl: null,
    apiToken: encrypt(token),
    accountName: me.name,
    accountEmail: me.email,
    externalUserId: me.userUri,
    externalOrgId: me.orgUri,
    webhookTokenHash: hashWebhookToken(pathToken),
    webhookToken: encrypt(pathToken),
    webhookSecret: encrypt(signingKey),
    webhookId,
    mode,
    lastError,
    connectedById: actor.actorId,
    // A new account (or a reconnect) starts the pull over.
    lastSyncedAt: null,
  };
  const conn = await prisma.schedulingConnection.upsert({
    where: { orgId_provider: { orgId: actor.orgId, provider: "CALENDLY" } },
    create: { orgId: actor.orgId, provider: "CALENDLY", ...data },
    update: data,
  });
  await refreshEventTypesFor(conn).catch((err) => console.warn("[scheduling] Event types", err));
  return conn;
}

/** Removes the connection and the webhook we created. Bookings and draft
 * clients stay. */
export async function disconnectScheduling(actor: SchedulingActor, provider: string) {
  requireAdmin(actor);
  const conn = await prisma.schedulingConnection.findFirst({ where: { orgId: actor.orgId, provider } });
  if (!conn) return;
  await removeProviderWebhook(conn);
  await prisma.schedulingConnection.delete({ where: { id: conn.id } });
}

/** A new webhook secret (Cal.com, set up by hand). The old one stops working. */
export async function rotateCalcomSecret(actor: SchedulingActor) {
  requireAdmin(actor);
  const conn = await existingConnection(actor.orgId, "CALCOM");
  if (!conn) throw new SchedulingError("Connect Cal.com first.");
  if (conn.webhookId) throw new SchedulingError("This webhook was created for you; reconnect to replace it.");
  await prisma.schedulingConnection.update({ where: { id: conn.id }, data: { webhookSecret: encrypt(newSecret()) } });
}

export async function setCompanyQuestion(actor: SchedulingActor, provider: string, question: string) {
  requireAdmin(actor);
  const conn = await prisma.schedulingConnection.findFirst({ where: { orgId: actor.orgId, provider } });
  if (!conn) throw new SchedulingError("Not connected.");
  const value = question.trim().slice(0, 200) || null;
  await prisma.schedulingConnection.update({ where: { id: conn.id }, data: { companyQuestion: value } });
}

// ── Event types ────────────────────────────────────────────────────────────

async function listProviderEventTypes(conn: SchedulingConnection): Promise<ProviderEventType[]> {
  const token = decrypt(conn.apiToken);
  if (conn.provider === "CALCOM") {
    return listCalcomEventTypes(conn.baseUrl ?? CALCOM_CLOUD_API, token, conn.externalOrgId);
  }
  if (!conn.externalUserId) throw new SchedulingProviderError("Reconnect Calendly.");
  return listCalendlyEventTypes(token, conn.externalUserId);
}

/** Upsert that survives two deliveries creating the same event type at
 * once (Prisma's upsert isn't atomic): the loser re-reads the winner's row. */
async function upsertEventType(
  conn: SchedulingConnection,
  t: { externalId: string; name: string; slug: string | null; bookingUrl?: string | null },
  update: Prisma.SchedulingEventTypeUpdateInput
) {
  const where = { connectionId_externalId: { connectionId: conn.id, externalId: t.externalId } };
  const create = {
    orgId: conn.orgId,
    connectionId: conn.id,
    externalId: t.externalId,
    name: t.name,
    slug: t.slug,
    bookingUrl: t.bookingUrl ?? null,
  };
  try {
    return await prisma.schedulingEventType.upsert({ where, create, update });
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    return prisma.schedulingEventType.update({ where, data: update });
  }
}

/** Pulls the account's event types; keeps each one's mapping. */
async function refreshEventTypesFor(conn: SchedulingConnection) {
  const types = await listProviderEventTypes(conn);
  for (const t of types) {
    await upsertEventType(conn, t, { name: t.name, slug: t.slug, bookingUrl: t.bookingUrl });
  }
  return types.length;
}

export async function refreshEventTypes(actor: SchedulingActor, provider: string) {
  requireAdmin(actor);
  const conn = await prisma.schedulingConnection.findFirst({ where: { orgId: actor.orgId, provider } });
  if (!conn) throw new SchedulingError("Not connected.");
  try {
    return await refreshEventTypesFor(conn);
  } catch (err) {
    if (err instanceof SchedulingProviderError) throw new SchedulingError(err.message);
    throw err;
  }
}

export async function updateEventTypeMapping(
  actor: SchedulingActor,
  eventTypeId: string,
  input: { purpose: string; projectId: string | null; billable: boolean }
) {
  requireAdmin(actor);
  if (!(EVENT_TYPE_PURPOSES as readonly string[]).includes(input.purpose)) {
    throw new SchedulingError("Choose what this event type is for.");
  }
  const type = await prisma.schedulingEventType.findFirst({ where: { id: eventTypeId, orgId: actor.orgId } });
  if (!type) throw new SchedulingError("Event type not found.");
  let projectId: string | null = null;
  if (input.projectId && input.purpose !== "IGNORE") {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, orgId: actor.orgId, status: { not: "ARCHIVED" } },
      select: { id: true },
    });
    if (!project) throw new SchedulingError("Project not found.");
    projectId = project.id;
  }
  return prisma.schedulingEventType.update({
    where: { id: type.id },
    data: { purpose: input.purpose as EventTypePurpose, projectId, billable: input.billable },
  });
}

// ── Booking links ──────────────────────────────────────────────────────────

/** An https:// link (or empty to clear). */
export function normalizeBookingUrl(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SchedulingError("Enter a full link, starting with https://.");
  }
  if (url.protocol !== "https:") throw new SchedulingError("The link must start with https://.");
  if (url.username || url.password) throw new SchedulingError("Links with a username or password aren't allowed.");
  if (value.length > 500) throw new SchedulingError("That link is too long.");
  return url.toString();
}

export async function setOrgBookingUrl(actor: SchedulingActor, raw: string) {
  requireAdmin(actor);
  await prisma.organization.update({ where: { id: actor.orgId }, data: { bookingUrl: normalizeBookingUrl(raw) } });
}

export async function setClientBookingUrl(actor: SchedulingActor, clientId: string, raw: string) {
  requireAdmin(actor);
  const client = await prisma.client.findFirst({ where: { id: clientId, orgId: actor.orgId }, select: { id: true } });
  if (!client) throw new SchedulingError("Client not found.");
  await prisma.client.update({ where: { id: client.id }, data: { bookingUrl: normalizeBookingUrl(raw) } });
}

// ── Webhooks ───────────────────────────────────────────────────────────────

export type WebhookResult = { status: number; body: Record<string, unknown> };

/** Handles one delivery to /api/webhooks/scheduling/<slug>/<token>. */
export async function handleSchedulingWebhook(
  slug: string,
  token: string,
  rawBody: string,
  headers: Headers
): Promise<WebhookResult> {
  const provider = PROVIDER_SLUGS[slug];
  if (!provider || !token || token.length > 200) return { status: 404, body: { error: "Not found" } };
  const conn = await prisma.schedulingConnection.findUnique({ where: { webhookTokenHash: hashWebhookToken(token) } });
  if (!conn || conn.provider !== provider) return { status: 404, body: { error: "Not found" } };

  const secret = decrypt(conn.webhookSecret);
  const ok =
    provider === "CALCOM"
      ? verifyCalcomSignature(rawBody, headers.get("x-cal-signature-256"), secret)
      : verifyCalendlySignature(rawBody, headers.get("calendly-webhook-signature"), secret);
  if (!ok) return { status: 401, body: { error: "Bad signature" } };

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Bad payload" } };
  }
  const event = provider === "CALCOM" ? parseCalcomWebhook(json) : parseCalendlyWebhook(json);
  await prisma.schedulingConnection.update({
    where: { id: conn.id },
    data: { lastWebhookAt: new Date(), ...(conn.mode === "WEBHOOK" && conn.lastError ? { lastError: null } : {}) },
  });
  const result = await processEvent(conn, event);
  return { status: 200, body: { ok: true, ...result } };
}

async function processEvent(conn: SchedulingConnection, event: WebhookEvent) {
  switch (event.kind) {
    case "ping":
      return { handled: "ping" };
    case "ignored":
      return { handled: false, reason: event.reason };
    case "status":
      return { handled: "status", updated: await setBookingStatus(conn, event.externalId, event.status) };
    case "booking":
      return ingestBooking(conn, event.booking);
  }
}

async function setBookingStatus(conn: SchedulingConnection, externalId: string, status: BookingStatusValue) {
  const where: Prisma.BookingWhereInput = { orgId: conn.orgId, provider: conn.provider, externalId };
  // Un-marking a no-show only undoes a no-show.
  const { count } = await prisma.booking.updateMany({
    where:
      status === "SCHEDULED" ? { ...where, status: "NO_SHOW" } : { ...where, status: { in: ["SCHEDULED", "NO_SHOW"] } },
    data: { status },
  });
  return count;
}

/** Statuses a later delivery may not undo (a replayed "created" after the
 * cancellation, say). */
const FINAL: BookingStatusValue[] = ["CANCELLED", "RESCHEDULED"];

function bookingFields(b: IncomingBooking) {
  return {
    title: b.title,
    eventTypeName: b.eventType?.name ?? null,
    startAt: b.startAt,
    endAt: b.endAt,
    inviteeName: b.invitee.name,
    inviteeEmail: b.invitee.email,
    inviteePhone: b.invitee.phone,
    timeZone: b.invitee.timeZone,
    joinUrl: b.joinUrl,
    location: b.location,
    answers: b.answers as unknown as Prisma.InputJsonValue,
    hostEmail: b.hostEmail,
    externalEventId: b.externalEventId,
    ...(b.cancelReason ? { cancelReason: b.cancelReason } : {}),
  };
}

/** Stores (or updates) one booking and works out its client. Idempotent on
 * the provider's booking id. */
export async function ingestBooking(conn: SchedulingConnection, b: IncomingBooking) {
  const key = { orgId: conn.orgId, provider: conn.provider, externalId: b.externalId };

  // Its event type, and what it's for.
  let eventType = null;
  if (b.eventType) {
    eventType = await upsertEventType(
      conn,
      { externalId: b.eventType.externalId, name: b.eventType.name ?? b.title, slug: b.eventType.slug },
      {}
    );
  }
  const purpose = (eventType?.purpose ?? "INTAKE") as EventTypePurpose;

  // A reschedule: the old booking is done, and its client carries over.
  let carried: { clientId: string | null; contactId: string | null } | null = null;
  if (b.replacesExternalId) {
    const old = await prisma.booking.findUnique({
      where: { orgId_provider_externalId: { ...key, externalId: b.replacesExternalId } },
      select: { id: true, clientId: true, contactId: true },
    });
    if (old) {
      await prisma.booking.update({ where: { id: old.id }, data: { status: "RESCHEDULED" } });
      await hideCancelledMeetings(old.id);
      carried = { clientId: old.clientId, contactId: old.contactId };
    }
  }

  const existing = await prisma.booking.findUnique({ where: { orgId_provider_externalId: key } });
  if (purpose === "IGNORE" && !existing) return { handled: "ignored-event-type" };

  if (existing) {
    const status = FINAL.includes(existing.status) && b.status === "SCHEDULED" ? existing.status : b.status;
    const updated = await prisma.booking.update({
      where: { id: existing.id },
      data: { ...bookingFields(b), status, eventTypeId: eventType?.id ?? existing.eventTypeId },
    });
    if (status !== "SCHEDULED" && status !== "NO_SHOW") await hideCancelledMeetings(updated.id);
    else await linkCalendarMeetings(updated);
    return { handled: "updated", bookingId: updated.id };
  }

  let booking;
  try {
    booking = await prisma.booking.create({
      data: {
        ...key,
        ...bookingFields(b),
        status: b.status,
        connectionId: conn.id,
        eventTypeId: eventType?.id ?? null,
        hostUserId: await hostUserId(conn.orgId, b.hostEmail),
      },
    });
  } catch (err) {
    // The same delivery arriving twice at once: the other one has it.
    if ((err as { code?: string }).code === "P2002") return { handled: "duplicate" };
    throw err;
  }

  const match = carried?.clientId
    ? { clientId: carried.clientId, contactId: carried.contactId, createdLead: false, revived: false }
    : await resolveClient(conn, b, purpose);
  if (match.clientId) {
    booking = await prisma.booking.update({
      where: { id: booking.id },
      data: { clientId: match.clientId, contactId: match.contactId, createdLead: match.createdLead },
    });
  }
  if (b.status === "SCHEDULED") await linkCalendarMeetings(booking);

  if ((match.createdLead || match.revived) && match.clientId) {
    await alertNewLead(conn, b, match.clientId, match.revived);
  }
  return {
    handled: "created",
    bookingId: booking.id,
    clientId: match.clientId,
    createdLead: match.createdLead,
  };
}

async function hostUserId(orgId: string, hostEmail: string | null) {
  if (!hostEmail) return null;
  const m = await prisma.membership.findFirst({
    where: { orgId, user: { email: { equals: hostEmail, mode: "insensitive" } } },
    select: { userId: true },
  });
  return m?.userId ?? null;
}

type Match = { clientId: string | null; contactId: string | null; createdLead: boolean; revived: boolean };

/** Finds the booking's client, or drafts one. Runs under a per-org advisory
 * lock so two bookings from the same new person can't draft two clients. */
async function resolveClient(
  conn: SchedulingConnection,
  b: IncomingBooking,
  purpose: EventTypePurpose
): Promise<Match> {
  const none: Match = { clientId: null, contactId: null, createdLead: false, revived: false };
  const email = b.invitee.email;
  if (!email) return none;
  const domain = emailDomain(email);
  const orgId = conn.orgId;

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`scheduling:${orgId}`}))`;

      // 1. A known contact (or the client's own address).
      const contact = await tx.contact.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, client: { orgId } },
        orderBy: [{ client: { status: "asc" } }, { createdAt: "asc" }],
        select: { id: true, clientId: true, client: { select: { status: true, leadDiscardedAt: true } } },
      });
      if (contact) {
        const revived = await reviveIfDiscarded(tx, contact.clientId, contact.client);
        return { clientId: contact.clientId, contactId: contact.id, createdLead: false, revived };
      }
      const byClientEmail = await tx.client.findFirst({
        where: {
          orgId,
          OR: [
            { email: { equals: email, mode: "insensitive" } },
            { billingEmail: { equals: email, mode: "insensitive" } },
          ],
        },
        select: { id: true, status: true, leadDiscardedAt: true },
      });
      if (byClientEmail) {
        const revived = await reviveIfDiscarded(tx, byClientEmail.id, byClientEmail);
        return { clientId: byClientEmail.id, contactId: null, createdLead: false, revived };
      }

      // Someone from your own team booking themselves isn't a client.
      const ownDomains = await orgDomains(tx, orgId);
      const members = await tx.membership.count({
        where: { orgId, user: { email: { equals: email, mode: "insensitive" } } },
      });
      if (members > 0 || (domain && ownDomains.has(domain))) return none;

      const companyDomain = domain && !isPublicEmailDomain(domain) ? domain : null;
      const contactData = {
        name: b.invitee.name ?? email.split("@")[0],
        email,
        phone: b.invitee.phone,
      };

      // 2. A draft from the same company: add them to it.
      if (companyDomain) {
        const drafts = await tx.client.findMany({
          where: { orgId, status: "LEAD" },
          select: {
            id: true,
            website: true,
            leadDiscardedAt: true,
            status: true,
            contacts: { select: { email: true } },
          },
        });
        const same = drafts.find(
          (d) => hostOf(d.website) === companyDomain || d.contacts.some((c) => emailDomain(c.email) === companyDomain)
        );
        if (same) {
          const created = await tx.contact.create({ data: { clientId: same.id, ...contactData } });
          const revived = await reviveIfDiscarded(tx, same.id, same);
          return { clientId: same.id, contactId: created.id, createdLead: false, revived };
        }

        // 3. Existing-client event types: the company's client, if exactly one.
        if (purpose === "CLIENTS") {
          const clients = await tx.client.findMany({
            where: { orgId, status: { not: "LEAD" } },
            select: { id: true, website: true, email: true, billingEmail: true, contacts: { select: { email: true } } },
          });
          const hits = clients.filter(
            (c) =>
              hostOf(c.website) === companyDomain ||
              [c.email, c.billingEmail, ...c.contacts.map((x) => x.email)].some((e) => emailDomain(e) === companyDomain)
          );
          if (hits.length === 1) return { clientId: hits[0].id, contactId: null, createdLead: false, revived: false };
        }
      }

      // Cancelled before we ever saw it: nothing to review.
      if (b.status !== "SCHEDULED") return none;

      // 4. A new draft client.
      const identity = draftClientIdentity(b, conn.companyQuestion);
      const source = SCHEDULING_PROVIDER_LABELS[conn.provider as SchedulingProviderId] ?? conn.provider;
      const tz = validZone(b.invitee.timeZone) ?? "UTC";
      const client = await tx.client.create({
        data: {
          orgId,
          name: identity.name,
          website: identity.website,
          email,
          phone: b.invitee.phone,
          description: draftDescription(b, source, tz),
          status: "LEAD",
          leadSource: source,
          leadBookedAt: new Date(),
          contacts: { create: { ...contactData, isPrimary: true } },
        },
        include: { contacts: { select: { id: true } } },
      });
      return { clientId: client.id, contactId: client.contacts[0]?.id ?? null, createdLead: true, revived: false };
    },
    { timeout: 15_000 }
  );
}

async function reviveIfDiscarded(
  tx: Prisma.TransactionClient,
  clientId: string,
  client: { status: string; leadDiscardedAt: Date | null }
) {
  if (client.status !== "LEAD" || !client.leadDiscardedAt) return false;
  await tx.client.update({ where: { id: clientId }, data: { leadDiscardedAt: null, leadBookedAt: new Date() } });
  return true;
}

async function orgDomains(tx: Prisma.TransactionClient, orgId: string) {
  const [org, members] = await Promise.all([
    tx.organization.findUnique({ where: { id: orgId }, select: { domain: true } }),
    tx.membership.findMany({ where: { orgId }, select: { user: { select: { email: true } } } }),
  ]);
  const out = new Set<string>();
  if (org?.domain) out.add(org.domain.toLowerCase());
  for (const m of members) {
    const d = emailDomain(m.user.email);
    if (d && !isPublicEmailDomain(d)) out.add(d);
  }
  return out;
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

function validZone(tz: string | null) {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

async function alertNewLead(conn: SchedulingConnection, b: IncomingBooking, clientId: string, revived: boolean) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  const source = SCHEDULING_PROVIDER_LABELS[conn.provider as SchedulingProviderId] ?? conn.provider;
  const who = b.invitee.name ?? b.invitee.email ?? "Someone";
  const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(
    b.startAt
  );
  await sendAlert({
    orgId: conn.orgId,
    event: "NEW_LEAD",
    message: revived
      ? `${who} booked another call through ${source}; their discarded draft client ${client?.name ?? ""} is back in Drafts.`
      : `${who} booked a call through ${source}. ${client?.name ?? "A draft client"} was added to Drafts for you to review.`,
    link: `/clients/${clientId}`,
    details: [
      `${b.title}, ${when} UTC`,
      ...(b.invitee.email ? [b.invitee.email] : []),
      ...(b.eventType?.name && b.eventType.name !== b.title ? [`Event type: ${b.eventType.name}`] : []),
    ],
  });
}

// ── Calendar meetings ──────────────────────────────────────────────────────

/** Links calendar meetings that are this booking (same start, the invitee
 * among the attendees) to it. */
export async function linkCalendarMeetings(booking: {
  id: string;
  orgId: string;
  startAt: Date;
  inviteeEmail: string | null;
}) {
  if (!booking.inviteeEmail) return;
  await prisma.calendarEvent.updateMany({
    where: {
      bookingId: null,
      start: booking.startAt,
      attendees: { has: booking.inviteeEmail.toLowerCase() },
      feed: { orgId: booking.orgId },
    },
    data: { bookingId: booking.id },
  });
}

/** A cancelled or moved booking: its meetings that nobody sorted yet leave
 * the inbox (marked ignored, so the next calendar sync doesn't bring them
 * back). */
async function hideCancelledMeetings(bookingId: string) {
  await prisma.calendarEvent.updateMany({
    where: { bookingId, status: { in: ["UPCOMING", "PENDING"] } },
    data: { status: "IGNORED" },
  });
}

/** For calendar sync: the booking a meeting is, if any. */
export async function bookingForMeeting(orgId: string, start: Date, attendees: string[]) {
  if (!attendees.length) return null;
  return prisma.booking.findFirst({
    where: { orgId, startAt: start, inviteeEmail: { in: attendees } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      clientId: true,
      client: { select: { name: true, status: true } },
      eventType: { select: { name: true, purpose: true, projectId: true, billable: true } },
      provider: true,
    },
  });
}

// ── Polling (Calendly without webhooks) and upkeep ─────────────────────────

export async function syncSchedulingConnection(conn: SchedulingConnection, now = new Date()) {
  let pulled = 0;
  try {
    await refreshEventTypesFor(conn);
    if (conn.provider === "CALENDLY" && conn.mode === "POLLING") {
      if (!conn.externalUserId) throw new SchedulingProviderError("Reconnect Calendly.");
      const bookings = await pullCalendlyBookings(decrypt(conn.apiToken), conn.externalUserId, {
        from: new Date(now.getTime() - PULL_PAST_DAYS * DAY_MS),
        to: new Date(now.getTime() + PULL_FUTURE_DAYS * DAY_MS),
        changedSince: conn.lastSyncedAt ? new Date(conn.lastSyncedAt.getTime() - 60 * 60 * 1000) : null,
      });
      for (const b of bookings) {
        await ingestBooking(conn, b);
        pulled++;
      }
    }
    await prisma.schedulingConnection.update({
      where: { id: conn.id },
      data: {
        lastSyncedAt: now,
        // A sync that worked clears the last error, except the note that the
        // Calendly webhook couldn't be set up (still true while polling).
        lastError: conn.mode === "POLLING" && conn.lastError?.startsWith("Couldn't set up") ? conn.lastError : null,
      },
    });
    return { pulled };
  } catch (err) {
    const message = err instanceof SchedulingProviderError ? err.message : "Couldn't sync.";
    if (!(err instanceof SchedulingProviderError)) console.warn("[scheduling] Sync failed", conn.id, err);
    await prisma.schedulingConnection.update({ where: { id: conn.id }, data: { lastError: message } });
    return { pulled, error: message };
  }
}

export async function syncSchedulingNow(actor: SchedulingActor, provider: string) {
  requireAdmin(actor);
  const conn = await prisma.schedulingConnection.findFirst({ where: { orgId: actor.orgId, provider } });
  if (!conn) throw new SchedulingError("Not connected.");
  const r = await syncSchedulingConnection(conn);
  if (r.error) throw new SchedulingError(r.error);
  return r;
}

/** Discarded drafts older than DISCARD_PURGE_DAYS (and without estimates or
 * agreements, which would go with them) are deleted. */
export async function purgeDiscardedDrafts(now = new Date()) {
  const cutoff = new Date(now.getTime() - DISCARD_PURGE_DAYS * DAY_MS);
  const stale = await prisma.client.findMany({
    where: {
      status: "LEAD",
      leadDiscardedAt: { lt: cutoff },
      estimates: { none: {} },
      agreements: { none: {} },
      projects: { none: {} },
      invoices: { none: {} },
    },
    select: { id: true, orgId: true, name: true },
    take: 500,
  });
  for (const c of stale) {
    await prisma.client.delete({ where: { id: c.id } });
  }
  return stale.length;
}

/** Hourly: every connection, then the purge. */
export async function syncAllScheduling() {
  const conns = await prisma.schedulingConnection.findMany();
  let pulled = 0;
  let failed = 0;
  for (const c of conns) {
    const r = await syncSchedulingConnection(c);
    pulled += r.pulled;
    if (r.error) failed++;
  }
  const purged = await purgeDiscardedDrafts();
  return { connections: conns.length, pulled, failed, purged };
}

// ── Draft clients ──────────────────────────────────────────────────────────

async function ownDraft(actor: SchedulingActor, clientId: string) {
  requireAdmin(actor);
  const client = await prisma.client.findFirst({ where: { id: clientId, orgId: actor.orgId } });
  if (!client) throw new SchedulingError("Client not found.");
  if (client.status !== "LEAD") throw new SchedulingError("That isn't a draft client.");
  return client;
}

/** "Make client": the draft becomes an active client. */
export async function promoteDraft(actor: SchedulingActor, clientId: string) {
  const client = await ownDraft(actor, clientId);
  return prisma.client.update({ where: { id: client.id }, data: { status: "ACTIVE", leadDiscardedAt: null } });
}

/** Hides a draft from Drafts. Restorable until it's purged. */
export async function discardDraft(actor: SchedulingActor, clientId: string) {
  const client = await ownDraft(actor, clientId);
  return prisma.client.update({ where: { id: client.id }, data: { leadDiscardedAt: new Date() } });
}

export async function restoreDraft(actor: SchedulingActor, clientId: string) {
  const client = await ownDraft(actor, clientId);
  return prisma.client.update({ where: { id: client.id }, data: { leadDiscardedAt: null } });
}

/** Moves a draft's contacts, bookings, links, documents, credentials,
 * agreements and estimates to an existing client, then deletes the draft. A
 * contact whose email the target already has isn't copied; its bookings go
 * to the target's contact. */
export async function mergeDraft(actor: SchedulingActor, draftId: string, targetId: string) {
  const draft = await ownDraft(actor, draftId);
  if (draftId === targetId) throw new SchedulingError("Pick a different client.");
  const target = await prisma.client.findFirst({ where: { id: targetId, orgId: actor.orgId } });
  if (!target) throw new SchedulingError("Client not found.");
  const blockers = await prisma.client.findUnique({
    where: { id: draft.id },
    select: { _count: { select: { projects: true, invoices: true, payments: true, creditNotes: true } } },
  });
  const c = blockers?._count;
  if (c && (c.projects || c.invoices || c.payments || c.creditNotes)) {
    throw new SchedulingError("This draft already has projects or invoices. Make it a client instead.");
  }

  await prisma.$transaction(async (tx) => {
    const [draftContacts, targetContacts] = await Promise.all([
      tx.contact.findMany({ where: { clientId: draft.id } }),
      tx.contact.findMany({ where: { clientId: target.id }, select: { id: true, email: true } }),
    ]);
    const byEmail = new Map(targetContacts.filter((t) => t.email).map((t) => [t.email!.toLowerCase(), t.id]));
    for (const contact of draftContacts) {
      const dup = contact.email ? byEmail.get(contact.email.toLowerCase()) : undefined;
      if (dup) {
        await tx.booking.updateMany({ where: { contactId: contact.id }, data: { contactId: dup } });
      } else {
        await tx.contact.update({ where: { id: contact.id }, data: { clientId: target.id, isPrimary: false } });
      }
    }
    const move = { where: { clientId: draft.id }, data: { clientId: target.id } };
    await tx.booking.updateMany(move);
    await tx.link.updateMany(move);
    await tx.clientDocument.updateMany(move);
    await tx.vaultLink.updateMany(move);
    await tx.agreement.updateMany(move);
    await tx.estimate.updateMany(move);
    await tx.paymentMethod.updateMany(move);
    if (!target.description && draft.description) {
      await tx.client.update({ where: { id: target.id }, data: { description: draft.description } });
    }
    await tx.client.delete({ where: { id: draft.id } });
  });
  await recordAuditEvent(prisma, {
    orgIds: [actor.orgId],
    actorId: actor.actorId,
    action: "merge",
    entityType: "Client",
    entityId: target.id,
    entityLabel: `Draft ${draft.name} merged into ${target.name}`,
  });
  return target;
}

// ── Reads ──────────────────────────────────────────────────────────────────

/** Bookings for a client page, soonest upcoming first, then recent. */
export async function clientBookings(orgId: string, clientId: string, now = new Date()) {
  const [upcoming, past] = await Promise.all([
    prisma.booking.findMany({
      where: { orgId, clientId, endAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 20,
      include: { contact: { select: { name: true } }, hostUser: { select: { name: true } } },
    }),
    prisma.booking.findMany({
      where: { orgId, clientId, endAt: { lt: now } },
      orderBy: { startAt: "desc" },
      take: 10,
      include: { contact: { select: { name: true } }, hostUser: { select: { name: true } } },
    }),
  ]);
  return { upcoming, past };
}

/** Bookings visible to someone: owners and admins see all of the org's;
 * others the ones they host. */
export function bookingVisibilityWhere(viewer: {
  orgId: string;
  userId: string;
  role: Role;
}): Prisma.BookingWhereInput {
  return viewer.role === "OWNER" || viewer.role === "ADMIN"
    ? { orgId: viewer.orgId }
    : { orgId: viewer.orgId, hostUserId: viewer.userId };
}

export async function listBookings(
  viewer: { orgId: string; userId: string; role: Role },
  q: { from?: Date; to?: Date; clientId?: string; status?: BookingStatusValue; limit?: number } = {}
) {
  return prisma.booking.findMany({
    where: {
      ...bookingVisibilityWhere(viewer),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to ? { startAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } } : {}),
    },
    orderBy: { startAt: "asc" },
    take: Math.min(Math.max(q.limit ?? 100, 1), 500),
    include: { client: { select: { id: true, name: true, status: true } } },
  });
}

/** Settings page data (owners and admins). */
export async function schedulingSettings(actor: SchedulingActor) {
  requireAdmin(actor);
  const [connections, eventTypes, projects, org, origin] = await Promise.all([
    prisma.schedulingConnection.findMany({ where: { orgId: actor.orgId } }),
    prisma.schedulingEventType.findMany({ where: { orgId: actor.orgId }, orderBy: { name: "asc" } }),
    prisma.project.findMany({
      where: { orgId: actor.orgId, status: { in: ["ACTIVE", "ON_HOLD"] } },
      select: { id: true, name: true, client: { select: { name: true } } },
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: actor.orgId }, select: { bookingUrl: true } }),
    getOrigin(),
  ]);
  return {
    origin,
    orgBookingUrl: org.bookingUrl,
    projects: projects.map((p) => ({ id: p.id, label: `${p.client.name} — ${p.name}` })),
    connections: connections.map((c) => ({
      id: c.id,
      provider: c.provider as SchedulingProviderId,
      baseUrl: c.baseUrl,
      accountName: c.accountName,
      accountEmail: c.accountEmail,
      mode: c.mode,
      webhookCreated: !!c.webhookId,
      companyQuestion: c.companyQuestion,
      lastWebhookAt: c.lastWebhookAt,
      lastSyncedAt: c.lastSyncedAt,
      lastError: c.lastError,
      webhook: connectionWebhook(c, origin),
      eventTypes: eventTypes
        .filter((t) => t.connectionId === c.id)
        .map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          bookingUrl: t.bookingUrl,
          purpose: t.purpose as EventTypePurpose,
          projectId: t.projectId,
          billable: t.billable,
        })),
    })),
  };
}
