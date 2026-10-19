// Everyday flows that used to feel awkward: what you typed survives a refused
// save, saves say what they did, times can be typed loosely, and the dialog
// starts where you left off.
import { test, expect } from "@playwright/test";
import { A, STORAGE, USERS } from "./fixtures";
import { sql } from "./helpers";

test.describe("logging time", () => {
  test.use({ storageState: STORAGE.ownerA });

  test("a refused save keeps everything typed", async ({ page }) => {
    await page.goto("/time?week=2025-07-07");
    await page.getByRole("button", { name: "Log time", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Project" }).click();
    await page.getByRole("option", { name: `${A.clockClient.name} — ${A.clockProject.name}` }).click();
    await dialog.getByLabel("Date").fill("2025-07-08");
    await dialog.getByLabel(/^Start/).fill("09:00");
    await dialog.getByLabel(/^End/).fill("10:00");
    await dialog.getByLabel("Hours").fill("1.5");
    await dialog.getByLabel("Description").fill("Kept after an error");
    await dialog.getByLabel("Billable").uncheck();
    await dialog.getByRole("button", { name: "Log time" }).click();

    await expect(dialog.getByText(/more than the time between start and end/).first()).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Project" })).toContainText(A.clockProject.name);
    await expect(dialog.getByLabel("Date")).toHaveValue("2025-07-08");
    await expect(dialog.getByLabel("Description")).toHaveValue("Kept after an error");
    await expect(dialog.getByLabel("Billable")).not.toBeChecked();

    await dialog.getByLabel("Hours").fill("1");
    await dialog.getByRole("button", { name: "Log time" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Logged 1h on .*Tue, Jul 8/)).toBeVisible();
  });

  test("times can be typed loosely, and the dialog starts on the last project and the viewed week", async ({
    page,
  }) => {
    await page.goto("/time?week=2025-07-14");
    await page.getByRole("button", { name: "Log time", exact: true }).click();
    const dialog = page.getByRole("dialog");
    // The owner's most recent entry is on the clocked project (seeded today).
    await expect(dialog.getByRole("combobox", { name: "Project" })).not.toContainText("Select a project");
    await expect(dialog.getByLabel("Date")).toHaveValue("2025-07-14");

    await dialog.getByLabel(/^Start/).fill("930");
    await dialog.getByLabel(/^End/).fill("1115");
    await dialog.getByLabel("Description").click();
    await expect(dialog.getByLabel(/^Start/)).toHaveValue("09:30");
    await expect(dialog.getByLabel(/^End/)).toHaveValue("11:15");
    await expect(dialog.getByLabel("Hours")).toHaveValue("1.75");
    await expect(dialog.getByText("1h 45m.")).toBeVisible();

    await dialog.getByLabel(/^Start/).fill("2pm");
    await dialog.getByLabel(/^End/).fill("3:20pm");
    await dialog.getByLabel("Description").click();
    await expect(dialog.getByLabel(/^Start/)).toHaveValue("14:00");
    await expect(dialog.getByLabel("Hours")).toHaveValue("1.25");
    await expect(dialog.getByText(/rounded to the nearest 15 min/)).toBeVisible();
  });

  test("each day has its own quick add, and deleting says so", async ({ page }) => {
    const [{ id }] = await sql<{ id: string }>(
      `INSERT INTO "TimeEntry" (id, "orgId", "projectId", "userId", date, hours, billable, description, "updatedAt")
       VALUES ('e2e_te_flow_delete', $1, $2, $3, '2025-07-23', 2, true, 'Delete me', now()) RETURNING id`,
      ["e2e_org_a", A.openProject.id, USERS.A.OWNER.id]
    );
    await page.goto("/time?week=2025-07-21");
    await expect(page.getByRole("button", { name: /Log time on Monday, Jul 21/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Log time on Sunday, Jul 27/ })).toBeVisible();

    page.once("dialog", (d) => d.accept());
    const row = page.getByRole("listitem").filter({ hasText: "Delete me" });
    await row.getByRole("button", { name: "Delete time entry" }).click();
    await expect(page.getByText(`Deleted 2h on ${A.openProject.name}`)).toBeVisible();
    expect(await sql(`SELECT 1 FROM "TimeEntry" WHERE id = $1`, [id])).toEqual([]);
  });

  test("Log time on a project page opens the dialog on that project", async ({ page }) => {
    await page.goto(`/projects/${A.openProject.id}`);
    await page.getByRole("link", { name: "Log time" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("combobox", { name: "Project" })).toContainText(A.openProject.name);
  });
});

test.describe("client views", () => {
  const INVOICE = A.invoices.secret.id;
  const TOKEN = "e2e-view-views-filter";
  let before: { viewCount: number; firstViewedAt: Date | null; lastViewedAt: Date | null; viewAlertedAt: Date | null };
  test.beforeAll(async () => {
    [before] = await sql(`SELECT "viewCount", "firstViewedAt", "lastViewedAt", "viewAlertedAt" FROM "Invoice" WHERE id = $1`, [INVOICE]);
    await sql(`UPDATE "Invoice" SET "viewToken" = $2 WHERE id = $1`, [INVOICE, TOKEN]);
  });
  test.afterAll(async () => {
    await sql(`DELETE FROM "InvoiceEvent" WHERE "invoiceId" = $1 AND type IN ('VIEWED', 'PDF_VIEWED')`, [INVOICE]);
    await sql(
      `UPDATE "Invoice" SET "viewToken" = NULL, "viewCount" = $2, "firstViewedAt" = $3, "lastViewedAt" = $4, "viewAlertedAt" = $5 WHERE id = $1`,
      [INVOICE, before.viewCount, before.firstViewedAt, before.lastViewedAt, before.viewAlertedAt]
    );
  });

  test("link previews and scripts opening the PDF don't count; a browser does", async ({ playwright }) => {
    const count = async () =>
      (await sql<{ viewCount: number }>(`SELECT "viewCount" FROM "Invoice" WHERE id = $1`, [INVOICE]))[0].viewCount;
    const start = await count();
    for (const ua of ["curl/8.7.1", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", "python-requests/2.32.3"]) {
      const ctx = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL, userAgent: ua });
      expect((await ctx.get(`/i/${TOKEN}/pdf`)).status()).toBe(200);
      await ctx.dispose();
    }
    expect(await count()).toBe(start);

    const browser = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL,
      userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
    });
    await browser.get(`/i/${TOKEN}/pdf`);
    await browser.dispose();
    expect(await count()).toBe(start + 1);
  });
});

test.describe("Google sign-in from Settings", () => {
  test.use({ storageState: STORAGE.ownerA });
  test.afterEach(async () => {
    await sql(`DELETE FROM "InstanceSetting" WHERE key IN ('config:AUTH_GOOGLE_ID', 'config:AUTH_GOOGLE_SECRET')`);
  });

  test("saving the client ID and secret puts Continue with Google on the login page", async ({ page, browser }) => {
    const login = await browser.newPage({ storageState: { cookies: [], origins: [] } });
    await login.goto("/login");
    await expect(login.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);

    await page.goto("/settings/integrations");
    await page.getByRole("button", { name: "Set up Google sign-in" }).click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("/api/auth/callback/google").first()).toBeVisible();
    await panel.getByLabel("Client ID").fill("e2e-client.apps.googleusercontent.com");
    await panel.getByLabel("Client secret").fill("e2e-google-secret");
    await panel.getByRole("button", { name: "Save credentials" }).click();
    await expect(panel.getByText("Credentials saved.")).toBeVisible();

    await login.reload();
    await expect(login.getByRole("button", { name: "Continue with Google" })).toBeVisible();

    // Removing them takes it off again (through the app, which also clears
    // its cache of saved credentials).
    page.once("dialog", (d) => d.accept());
    await panel.getByRole("button", { name: "Remove" }).click();
    await expect(panel.getByLabel("Client ID")).toBeVisible();
    await login.reload();
    await expect(login.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
    await login.close();
  });
});
