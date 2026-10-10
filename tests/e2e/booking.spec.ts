// Cal.com / Calendly intake: signed booking webhooks create draft clients
// (status LEAD) for people we don't know, attach bookings from known
// contacts to their client, refuse bad signatures, and are idempotent.
// Drafts can't be invoiced, members can't make/merge/discard them, and an
// upcoming calendar meeting shows on /calendar but not in the meetings inbox.
import { createHmac, randomBytes } from "crypto";
import { test as base, expect, type APIRequestContext, type PlaywrightWorkerArgs } from "@playwright/test";
import { A, BOOKING, STORAGE, USERS } from "./fixtures";
import { bearer, callAction, expectRefused, json, mcpOk, sql } from "./helpers";

type Sessions = { owner: APIRequestContext; member: APIRequestContext };

function session(storageState: string) {
  return async (
    { playwright, baseURL }: PlaywrightWorkerArgs & { baseURL: string | undefined },
    provide: (ctx: APIRequestContext) => Promise<void>
  ) => {
    const ctx = await playwright.request.newContext({ baseURL, storageState });
    await provide(ctx);
    await ctx.dispose();
  };
}

const test = base.extend<Sessions>({
  owner: session(STORAGE.ownerA),
  member: session(STORAGE.memberA),
});

const CALCOM_URL = `/api/webhooks/scheduling/calcom/${BOOKING.calcom.token}`;
const CALENDLY_URL = `/api/webhooks/scheduling/calendly/${BOOKING.calendly.token}`;

/** A unique suffix per test, so parallel tests never share an email/domain. */
const unique = () => randomBytes(5).toString("hex");

function calcomBody(opts: {
  uid: string;
  email: string;
  name: string;
  company?: string;
  trigger?: string;
  eventTypeId?: number;
}) {
  const start = new Date(Date.now() + 4 * 86_400_000);
  start.setUTCHours(14, 0, 0, 0);
  return JSON.stringify({
    triggerEvent: opts.trigger ?? "BOOKING_CREATED",
    createdAt: new Date().toISOString(),
    payload: {
      uid: opts.uid,
      bookingId: 1,
      eventTypeId: opts.eventTypeId ?? 4242,
      type: "intro-call",
      eventTitle: "Intro call",
      title: `Intro call between ${USERS.A.OWNER.name} and ${opts.name}`,
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + 30 * 60_000).toISOString(),
      organizer: { email: USERS.A.OWNER.email, name: USERS.A.OWNER.name },
      attendees: [{ email: opts.email, name: opts.name, timeZone: "Europe/Berlin" }],
      responses: {
        name: { label: "your_name", value: opts.name },
        email: { label: "email_address", value: opts.email },
        ...(opts.company ? { company: { label: "Company name", value: opts.company } } : {}),
        notes: { label: "What can we help with?", value: "We need a <b>new</b> website." },
      },
      metadata: { videoCallUrl: "https://app.cal.com/video/e2e" },
      status: "ACCEPTED",
    },
  });
}

const calcomSign = (body: string, secret: string = BOOKING.calcom.secret) =>
  createHmac("sha256", secret).update(body).digest("hex");

async function postCalcom(request: APIRequestContext, body: string, signature = calcomSign(body)) {
  return request.post(CALCOM_URL, {
    headers: { "Content-Type": "application/json", "X-Cal-Signature-256": signature },
    data: body,
  });
}

async function leadsWithEmail(email: string) {
  return sql<{ id: string; name: string; status: string; website: string | null; description: string | null }>(
    `SELECT c.id, c.name, c.status, c.website, c.description FROM "Client" c
     WHERE c."orgId" = $1 AND c.status = 'LEAD'
       AND EXISTS (SELECT 1 FROM "Contact" k WHERE k."clientId" = c.id AND lower(k.email) = lower($2))`,
    ["e2e_org_a", email]
  );
}

async function booking(externalId: string) {
  const [row] = await sql<{ clientId: string | null; status: string; createdLead: boolean }>(
    `SELECT "clientId", status, "createdLead" FROM "Booking" WHERE "orgId" = 'e2e_org_a' AND "externalId" = $1`,
    [externalId]
  );
  return row;
}

test.describe("Cal.com webhook", () => {
  test("a booking from someone unknown creates one draft client with them as contact, even when delivered twice", async ({
    request,
  }) => {
    const s = unique();
    const email = `jane.${s}@globex-${s}.io`;
    const body = calcomBody({ uid: `uid-new-${s}`, email, name: "Jane Doe", company: `Globex ${s}` });

    const first = await postCalcom(request, body);
    expect(first.status()).toBe(200);
    expect((await json(first)).createdLead).toBe(true);
    const again = await postCalcom(request, body);
    expect(again.status()).toBe(200);

    const leads = await leadsWithEmail(email);
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe(`Globex ${s}`);
    expect(leads[0].website).toBe(`globex-${s}.io`);
    // Answers are kept as plain text.
    expect(leads[0].description).toContain("What can we help with?: We need a new website.");
    expect(leads[0].description).not.toContain("<b>");
    const contacts = await sql(`SELECT name, email FROM "Contact" WHERE "clientId" = $1`, [leads[0].id]);
    expect(contacts).toEqual([{ name: "Jane Doe", email }]);
    expect(await sql(`SELECT 1 FROM "Booking" WHERE "externalId" = $1`, [`uid-new-${s}`])).toHaveLength(1);
    // Owners and admins are alerted.
    expect(
      await sql(`SELECT 1 FROM "Notification" WHERE type = 'NEW_LEAD' AND "userId" = $1 AND link = $2`, [
        USERS.A.OWNER.id,
        `/clients/${leads[0].id}`,
      ])
    ).toHaveLength(1);
  });

  test("a second person from the same company joins the same draft", async ({ request }) => {
    const s = unique();
    await postCalcom(request, calcomBody({ uid: `uid-co1-${s}`, email: `ann@co-${s}.io`, name: "Ann" }));
    await postCalcom(request, calcomBody({ uid: `uid-co2-${s}`, email: `ben@co-${s}.io`, name: "Ben" }));
    const [ann] = await leadsWithEmail(`ann@co-${s}.io`);
    const [ben] = await leadsWithEmail(`ben@co-${s}.io`);
    expect(ann?.id).toBeTruthy();
    expect(ben?.id).toBe(ann.id);
  });

  test("a booking from a known contact goes on their client, with no draft", async ({ request }) => {
    const uid = `uid-known-${unique()}`;
    const res = await postCalcom(
      request,
      calcomBody({ uid, email: BOOKING.knownContact.email.toUpperCase(), name: BOOKING.knownContact.name })
    );
    expect(res.status()).toBe(200);
    const row = await booking(uid);
    expect(row.clientId).toBe(A.client.id);
    expect(row.createdLead).toBe(false);
    expect(await leadsWithEmail(BOOKING.knownContact.email)).toHaveLength(0);
  });

  test("a bad or missing signature is refused and changes nothing", async ({ request }) => {
    const s = unique();
    const email = `eve@evil-${s}.io`;
    const body = calcomBody({ uid: `uid-bad-${s}`, email, name: "Eve" });
    expect((await postCalcom(request, body, "0".repeat(64))).status()).toBe(401);
    expect((await postCalcom(request, body, calcomSign(body, "wrong-secret"))).status()).toBe(401);
    expect(
      (await request.post(CALCOM_URL, { headers: { "Content-Type": "application/json" }, data: body })).status()
    ).toBe(401);
    // The Calendly URL for the same org doesn't accept a Cal.com signature.
    expect(
      (await request.post(CALENDLY_URL, { data: body, headers: { "X-Cal-Signature-256": calcomSign(body) } })).status()
    ).toBe(401);
    expect(await leadsWithEmail(email)).toHaveLength(0);
    expect(await booking(`uid-bad-${s}`)).toBeUndefined();
  });

  test("an unknown token is 404; unknown event types and pings are acknowledged", async ({ request }) => {
    const body = calcomBody({ uid: `uid-404-${unique()}`, email: "x@y-404.io", name: "X" });
    expect(
      (
        await request.post("/api/webhooks/scheduling/calcom/not-a-real-token", {
          data: body,
          headers: { "X-Cal-Signature-256": calcomSign(body) },
        })
      ).status()
    ).toBe(404);
    for (const raw of [
      JSON.stringify({ triggerEvent: "RECORDING_READY", createdAt: new Date().toISOString(), payload: {} }),
      JSON.stringify({ triggerEvent: "PING", createdAt: new Date().toISOString(), payload: {} }),
    ]) {
      const res = await postCalcom(request, raw);
      expect(res.status()).toBe(200);
    }
  });

  test("an event type mapped to Ignore isn't brought in", async ({ request }) => {
    const s = unique();
    const uid = `uid-ignored-${s}`;
    const email = `ivy@ignored-${s}.io`;
    const res = await postCalcom(
      request,
      calcomBody({ uid, email, name: "Ivy", eventTypeId: Number(BOOKING.ignoredEventType.externalId) })
    );
    expect(res.status()).toBe(200);
    expect(await booking(uid)).toBeUndefined();
    expect(await leadsWithEmail(email)).toHaveLength(0);
  });

  test("a cancellation marks the booking, and a replayed creation doesn't undo it", async ({ request }) => {
    const s = unique();
    const uid = `uid-cancel-${s}`;
    const email = `carl@cancel-${s}.io`;
    await postCalcom(request, calcomBody({ uid, email, name: "Carl" }));
    await postCalcom(request, calcomBody({ uid, email, name: "Carl", trigger: "BOOKING_CANCELLED" }));
    expect((await booking(uid)).status).toBe("CANCELLED");
    await postCalcom(request, calcomBody({ uid, email, name: "Carl" }));
    expect((await booking(uid)).status).toBe("CANCELLED");
  });
});

test.describe("Calendly webhook", () => {
  function calendlyBody(s: string) {
    const start = new Date(Date.now() + 5 * 86_400_000);
    start.setUTCHours(17, 0, 0, 0);
    return JSON.stringify({
      event: "invitee.created",
      created_at: new Date().toISOString(),
      payload: {
        uri: `https://api.calendly.com/scheduled_events/EV${s}/invitees/IN${s}`,
        email: `pat.${s}@gmail.com`,
        name: `Pat ${s}`,
        status: "active",
        questions_and_answers: [{ question: "Organisation", answer: `Initech ${s}`, position: 0 }],
        timezone: "America/New_York",
        scheduled_event: {
          uri: `https://api.calendly.com/scheduled_events/EV${s}`,
          name: "Discovery call",
          start_time: start.toISOString(),
          end_time: new Date(start.getTime() + 30 * 60_000).toISOString(),
          event_type: "https://api.calendly.com/event_types/E2E",
          location: { type: "zoom", join_url: "https://zoom.us/j/e2e" },
          event_memberships: [{ user_email: USERS.A.OWNER.email }],
        },
      },
    });
  }
  const sign = (body: string, t = Math.floor(Date.now() / 1000)) =>
    `t=${t},v1=${createHmac("sha256", BOOKING.calendly.secret).update(`${t}.${body}`).digest("hex")}`;

  test("a signed invitee.created creates a draft named from the organisation answer", async ({ request }) => {
    const s = unique();
    const body = calendlyBody(s);
    const res = await request.post(CALENDLY_URL, {
      headers: { "Content-Type": "application/json", "Calendly-Webhook-Signature": sign(body) },
      data: body,
    });
    expect(res.status()).toBe(200);
    const [lead] = await leadsWithEmail(`pat.${s}@gmail.com`);
    expect(lead.name).toBe(`Initech ${s}`);
    // Free-mail domains never become the website.
    expect(lead.website).toBeNull();
  });

  test("an old or forged signature is refused", async ({ request }) => {
    const s = unique();
    const body = calendlyBody(s);
    const stale = sign(body, Math.floor(Date.now() / 1000) - 3600);
    for (const signature of [stale, "t=1,v1=abc", ""]) {
      const res = await request.post(CALENDLY_URL, {
        headers: { "Content-Type": "application/json", "Calendly-Webhook-Signature": signature },
        data: body,
      });
      expect(res.status()).toBe(401);
    }
    expect(await leadsWithEmail(`pat.${s}@gmail.com`)).toHaveLength(0);
  });
});

test.describe("draft clients", () => {
  const draftStatus = async (id: string) =>
    (
      await sql<{ status: string; discarded: boolean }>(
        `SELECT status, "leadDiscardedAt" IS NOT NULL AS discarded FROM "Client" WHERE id = $1`,
        [id]
      )
    )[0];

  test("members can't make a draft a client, merge it or discard it", async ({ member }) => {
    const id = BOOKING.draft.id;
    await expectRefused(member, "scheduling.ts", "promoteDraftAction", [id]);
    await expectRefused(member, "scheduling.ts", "discardDraftAction", [id]);
    await expectRefused(member, "scheduling.ts", "mergeDraftAction", [id, null, { targetId: A.client.id }]);
    expect(await draftStatus(id)).toEqual({ status: "LEAD", discarded: false });
    expect(await sql(`SELECT 1 FROM "Client" WHERE id = $1`, [id])).toHaveLength(1);
  });

  test("an owner can discard, restore and make a draft a client", async ({ owner, request }) => {
    const s = unique();
    const email = `olga@owner-flow-${s}.io`;
    await postCalcom(request, calcomBody({ uid: `uid-flow-${s}`, email, name: "Olga" }));
    const [lead] = await leadsWithEmail(email);
    await callAction(owner, "scheduling.ts", "discardDraftAction", [lead.id]);
    expect(await draftStatus(lead.id)).toEqual({ status: "LEAD", discarded: true });
    await callAction(owner, "scheduling.ts", "restoreDraftAction", [lead.id]);
    expect(await draftStatus(lead.id)).toEqual({ status: "LEAD", discarded: false });
    await callAction(owner, "scheduling.ts", "promoteDraftAction", [lead.id]);
    expect(await draftStatus(lead.id)).toEqual({ status: "ACTIVE", discarded: false });
  });

  test("drafts can't be invoiced over the API, and MCP lists them as drafts", async ({ request }) => {
    const ownerA = bearer(USERS.A.OWNER.apiKey);
    const res = await request.post("/api/v1/invoices/generate", {
      headers: ownerA,
      data: { clientId: BOOKING.draft.id, timeEntryIds: [A.unbilledEntries[0]], issueDate: "2026-10-01" },
    });
    expect(res.status()).toBe(422);
    expect((await json(res)).error).toMatch(/draft client/i);
    expect(await sql(`SELECT 1 FROM "Invoice" WHERE "clientId" = $1`, [BOOKING.draft.id])).toHaveLength(0);

    const drafts = await mcpOk(request, USERS.A.OWNER.apiKey, "list_clients", { status: "LEAD" });
    const ids = (drafts as { id: string; draft: boolean }[]).map((c) => c.id);
    expect(ids).toContain(BOOKING.draft.id);
    expect((drafts as { draft: boolean }[]).every((c) => c.draft)).toBe(true);
  });

  test("the API lists drafts with a filter and marks them", async ({ request }) => {
    const ownerA = bearer(USERS.A.OWNER.apiKey);
    const leads = (await json(await request.get("/api/v1/clients?status=LEAD", { headers: ownerA }))).clients as {
      id: string;
      status: string;
      draft: boolean;
    }[];
    expect(leads.map((c) => c.id)).toContain(BOOKING.draft.id);
    expect(leads.every((c) => c.status === "LEAD" && c.draft)).toBe(true);
    const active = (await json(await request.get("/api/v1/clients?status=ACTIVE", { headers: ownerA }))).clients as {
      id: string;
    }[];
    expect(active.map((c) => c.id)).not.toContain(BOOKING.draft.id);
    expect((await request.get("/api/v1/clients?status=NOPE", { headers: ownerA })).status()).toBe(422);
    // Draft status can't be set by hand.
    expect(
      (await request.post("/api/v1/clients", { headers: ownerA, data: { name: "Sneaky", status: "LEAD" } })).status()
    ).toBe(422);
  });

  test("bookings are listed for the host and owners, not other members", async ({ request }) => {
    const all = (await json(await request.get("/api/v1/bookings", { headers: bearer(USERS.A.OWNER.apiKey) })))
      .bookings as { id: string }[];
    expect(all.map((b) => b.id)).toContain(BOOKING.draftBooking.id);
    const member = (await json(await request.get("/api/v1/bookings", { headers: bearer(USERS.A.MEMBER.apiKey) })))
      .bookings as { id: string }[];
    expect(member.map((b) => b.id)).not.toContain(BOOKING.draftBooking.id);
  });
});

test.describe("upcoming meetings", () => {
  test.use({ storageState: STORAGE.ownerA });

  test("show on the calendar but not in the meetings inbox", async ({ page }) => {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() + BOOKING.upcomingMeeting.inDays);
    const res = await page.goto(`/calendar?view=agenda&month=${day.toISOString().slice(0, 7)}`);
    expect(res?.status()).toBe(200);
    const agenda = page.locator("main");
    await expect(agenda.getByText(BOOKING.upcomingMeeting.title).first()).toBeVisible();
    await expect(agenda.getByRole("link", { name: new RegExp(BOOKING.upcomingMeeting.title) })).toContainText(
      "Upcoming"
    );

    expect((await page.goto("/time?view=meetings"))?.status()).toBe(200);
    await expect(page.getByText("All caught up")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(BOOKING.upcomingMeeting.title);
  });

  test("the draft client's page shows the banner and its booking", async ({ page }) => {
    expect((await page.goto(`/clients/${BOOKING.draft.id}`))?.status()).toBe(200);
    await expect(
      page
        .locator("main")
        .getByText(/Draft client from Cal\.com/)
        .first()
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Make client" })).toBeVisible();
    await expect(page.locator("main")).toContainText(BOOKING.draftBooking.title);
    // No billing, share link or projects for a draft.
    await expect(page.locator("main").getByRole("link", { name: "New project" })).toHaveCount(0);
  });
});
