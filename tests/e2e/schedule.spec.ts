// Calendar, due dates, deliverables and the calendar subscription feed:
// the /calendar page for an owner and a member (confidential projects and
// invoice dates stay hidden from the member), the secret iCal feed, task
// due-date validation on the API, and non-billable deliverables never being
// invoiced.
import { test, expect, type Page } from "@playwright/test";
import { A, SCHEDULE, STORAGE, USERS } from "./fixtures";
import { bearer, json, mcp, sql } from "./helpers";

const ownerA = bearer(USERS.A.OWNER.apiKey);
const inv = A.invoices;

/** YYYY-MM-DD, n days from today (UTC), like the seed's dates. */
function dayFromNow(n: number) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The agenda for the month holding the day n days from now. */
function agendaFor(n: number, extra = "") {
  return `/calendar?view=agenda&month=${dayFromNow(n).slice(0, 7)}${extra}`;
}

async function mainText(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBe(200);
  await expect(page.getByRole("heading", { name: "Calendar", level: 1 })).toBeVisible();
  return page.locator("main").innerText();
}

// Days with something seeded on them; seeded invoices are due in 29 days.
const SEEDED_DAYS = [
  SCHEDULE.openTaskDueIn,
  SCHEDULE.secretTaskDueIn,
  SCHEDULE.secretMilestone.dueIn,
  SCHEDULE.deliverable.dueIn,
  29,
];

test.describe("calendar page as an owner", () => {
  test.use({ storageState: STORAGE.ownerA });

  test("loads, in both views, and shows confidential deadlines and invoice dates", async ({ page }) => {
    await mainText(page, "/calendar");
    const tasks = await mainText(page, agendaFor(SCHEDULE.secretTaskDueIn, "&tasks=all"));
    expect(tasks).toContain(A.secretTask.title);
    const milestones = await mainText(page, agendaFor(SCHEDULE.secretMilestone.dueIn));
    expect(milestones).toContain(SCHEDULE.secretMilestone.name);
    const invoices = await mainText(page, agendaFor(29));
    expect(invoices).toContain(`Invoice ${inv.secret.number} due`);
    // Billing items are filterable for owners.
    await expect(page.getByRole("button", { name: "Invoices due" })).toBeVisible();
  });
});

test.describe("calendar page as a member", () => {
  test.use({ storageState: STORAGE.memberA });

  test("loads and shows the member's own task", async ({ page }) => {
    await mainText(page, "/calendar");
    const text = await mainText(page, agendaFor(SCHEDULE.openTaskDueIn));
    expect(text).toContain(A.openTask.title);
  });

  test("never shows the confidential project's tasks or milestones, or invoice dates", async ({ page }) => {
    const secrets = [
      A.secretProject.name,
      A.secretTask.title,
      SCHEDULE.secretMilestone.name,
      SCHEDULE.deliverable.name,
      inv.secret.number,
      inv.secretSent.number,
      inv.openDraft.number,
    ];
    const paths = new Set<string>();
    for (const n of SEEDED_DAYS) {
      paths.add(agendaFor(n, "&tasks=all"));
      paths.add(`/calendar?month=${dayFromNow(n).slice(0, 7)}&tasks=all`);
    }
    // Asking for billing types or the confidential project by hand changes nothing.
    paths.add(agendaFor(29, `&types=invoice,scheduled_send,estimate&tasks=all`));
    paths.add(agendaFor(SCHEDULE.secretTaskDueIn, `&project=${A.secretProject.id}&tasks=all`));
    for (const path of paths) {
      const text = await mainText(page, path);
      for (const secret of secrets) expect(text, `${secret} on ${path}`).not.toContain(secret);
      expect(text, path).not.toMatch(/Invoice [A-Z]-\d+ due/);
    }
    await expect(page.getByRole("button", { name: "Invoices due" })).toHaveCount(0);
  });
});

test.describe("calendar subscription feed", () => {
  test("a valid token returns the member's deadlines as iCalendar", async ({ request }) => {
    const res = await request.get(`/api/calendar/${SCHEDULE.memberFeedToken}.ics`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("END:VCALENDAR");
    expect(body).toContain(`UID:task:${A.openTask.id}@consultainer`);
    expect(body).toContain(`DTSTART;VALUE=DATE:${dayFromNow(SCHEDULE.openTaskDueIn).replace(/-/g, "")}`);
    // Confidential work and invoice dates (owners/admins only) stay out.
    for (const secret of [A.secretTask.title, SCHEDULE.secretMilestone.name, SCHEDULE.deliverable.name, inv.secret.number]) {
      expect(body).not.toContain(secret);
    }
  });

  test("a bad or unknown token is not found", async ({ request }) => {
    for (const token of ["nope", "x".repeat(40), `${SCHEDULE.memberFeedToken}x`]) {
      const res = await request.get(`/api/calendar/${token}.ics`);
      expect(res.status(), token).toBe(404);
      expect(await res.text()).not.toContain("VCALENDAR");
    }
  });

  test("needs no session (not redirected to log in)", async ({ request }) => {
    const res = await request.get(`/api/calendar/${SCHEDULE.memberFeedToken}.ics`, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });
});

test.describe("task due dates over the API", () => {
  test("invalid due dates are refused with 422", async ({ request }) => {
    for (const dueDate of ["next tuesday", "2026-02-30", "31/12/2026", 20261231]) {
      const res = await request.post(`/api/v1/projects/${A.openProject.id}/tasks`, {
        headers: ownerA,
        data: { title: `Bad due date ${dueDate}`, dueDate },
      });
      expect(res.status(), String(dueDate)).toBe(422);
    }
    const none = await sql(`SELECT 1 FROM "Task" WHERE title LIKE 'Bad due date%'`);
    expect(none).toHaveLength(0);
  });

  test("a valid due date is saved, changed and cleared", async ({ request }) => {
    const created = await request.post(`/api/v1/projects/${A.openProject.id}/tasks`, {
      headers: ownerA,
      data: { title: "Task with a due date", dueDate: "2030-01-15" },
    });
    expect(created.status()).toBe(201);
    const { task } = await json(created);
    expect(task.dueDate).toMatch(/^2030-01-15/);

    const bad = await request.patch(`/api/v1/tasks/${task.id}`, { headers: ownerA, data: { dueDate: "soon" } });
    expect(bad.status()).toBe(422);

    const moved = await request.patch(`/api/v1/tasks/${task.id}`, {
      headers: ownerA,
      data: { dueDate: "2030-02-01" },
    });
    expect(moved.status()).toBe(200);
    expect((await json(moved)).task.dueDate).toMatch(/^2030-02-01/);

    const cleared = await request.patch(`/api/v1/tasks/${task.id}`, { headers: ownerA, data: { dueDate: null } });
    expect(cleared.status()).toBe(200);
    expect((await json(cleared)).task.dueDate).toBeNull();
  });
});

test.describe("deliverables are never invoiced", () => {
  test("generating an invoice from a deliverable is refused (API and MCP)", async ({ request }) => {
    const res = await request.post("/api/v1/invoices/generate", {
      headers: ownerA,
      data: { clientId: A.client.id, milestoneIds: [SCHEDULE.deliverable.id], issueDate: dayFromNow(0) },
    });
    expect(res.status()).toBe(422);

    const r = await mcp(request, USERS.A.OWNER.apiKey, "generate_invoice", {
      clientId: A.client.id,
      milestoneIds: [SCHEDULE.deliverable.id],
      issueDate: dayFromNow(0),
    });
    expect(r.isError).toBe(true);

    const [row] = await sql<{ invoiceLineItemId: string | null }>(
      `SELECT "invoiceLineItemId" FROM "Milestone" WHERE id = $1`,
      [SCHEDULE.deliverable.id]
    );
    expect(row.invoiceLineItemId).toBeNull();
  });

  test.describe("in the browser", () => {
    test.use({ storageState: STORAGE.ownerA });

    test("isn't offered on the new invoice page", async ({ page }) => {
      const res = await page.goto(`/invoices/new?clientId=${A.client.id}`);
      expect(res?.status()).toBe(200);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("main")).not.toContainText(SCHEDULE.deliverable.name);
    });
  });
});
