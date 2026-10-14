// The phone companion: installable (manifest, icons, service worker), the
// /m views, and screenshots shared from Android's share sheet landing as
// evidence.
import { test, expect } from "@playwright/test";
import { A, STORAGE, USERS } from "./fixtures";
import { sql } from "./helpers";

const PHONE = { viewport: { width: 412, height: 915 }, hasTouch: true };
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("installing", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the manifest, icons and service worker load without signing in", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
    expect(manifest.status()).toBe(200);
    const body = await manifest.json();
    expect(body).toMatchObject({ start_url: "/m", display: "standalone" });
    expect(body.share_target).toMatchObject({ action: "/m/share", method: "POST" });
    expect(body.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);

    const icon = await request.get(body.icons.find((i: { sizes: string }) => i.sizes === "512x512").src);
    expect(icon.headers()["content-type"]).toBe("image/png");

    const sw = await request.get("/sw.js", { maxRedirects: 0 });
    expect(sw.status()).toBe(200);
    expect(await sw.text()).toContain("share-inbox");
  });

  test("the phone view asks you to sign in first", async ({ page }) => {
    await page.goto("/m");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fm/);
  });
});

test.describe("the phone view", () => {
  // One person's timer and entries: one test at a time.
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: STORAGE.adminA, ...PHONE });

  const ENTRY = "e2e_te_phone_recent";
  test.beforeEach(async () => {
    await sql(`DELETE FROM "ActiveTimer" WHERE "userId" = $1`, [USERS.A.ADMIN.id]);
    await sql(
      `INSERT INTO "TimeEntry" (id, "orgId", "projectId", "userId", date, hours, billable, description, "updatedAt")
       VALUES ($1, 'e2e_org_a', $2, $3, CURRENT_DATE, 1.5, true, 'Phone review', now())
       ON CONFLICT (id) DO UPDATE SET date = CURRENT_DATE`,
      [ENTRY, A.openProject.id, USERS.A.ADMIN.id]
    );
  });
  test.afterEach(async () => {
    await sql(`DELETE FROM "ActiveTimer" WHERE "userId" = $1`, [USERS.A.ADMIN.id]);
    await sql(`DELETE FROM "TimeEntry" WHERE "userId" = $1 AND "projectId" = $2 AND date = CURRENT_DATE`, [
      USERS.A.ADMIN.id,
      A.openProject.id,
    ]);
  });

  test("today: one tap starts a recent project, Stop says what it logged", async ({ page }) => {
    await page.goto("/m");
    await expect(page.getByRole("region", { name: "Today" }).getByText("Phone review")).toBeVisible();
    const timer = page.getByRole("region", { name: "Timer" });
    await timer.getByRole("button", { name: new RegExp(A.openProject.name) }).click();
    await expect(page.getByText("Timer started")).toBeVisible();
    await expect(timer.getByRole("button", { name: "Stop and log" })).toBeVisible();

    await timer.getByRole("button", { name: "Stop and log" }).click();
    await expect(page.getByText("Under a minute, so nothing was logged")).toBeVisible();
    await expect(timer.getByText("Not running")).toBeVisible();
  });

  test("Log time from the home-screen shortcut opens the dialog", async ({ page }) => {
    await page.goto("/m?log=1");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Log time" })).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Project" })).toContainText(A.openProject.name);
  });

  test("a screenshot shared to the app is added to an entry", async ({ page }) => {
    await page.goto("/m/share");
    await expect(page.getByText("Nothing shared yet")).toBeVisible();
    // Wait for the service worker to take charge of the page, then share
    // to it the way Android's share sheet does.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve));
      }
    });
    // Android submits the share as a form navigation; do the same.
    await page.evaluate((bytes) => {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/m/share";
      form.enctype = "multipart/form-data";
      const input = document.createElement("input");
      input.type = "file";
      input.name = "files";
      const files = new DataTransfer();
      files.items.add(new File([new Uint8Array(bytes)], "Screenshot_20261014.png", { type: "image/png" }));
      input.files = files.files;
      form.append(input);
      document.body.append(form);
      form.submit();
    }, [...PNG]);
    await expect(page).toHaveURL(/\/m\/share\?received=1$/);
    await expect(page.getByText("1 file shared")).toBeVisible();
    await page
      .getByRole("region", { name: "Add to an entry" })
      .getByRole("button", { name: /Phone review/ })
      .click();
    await expect(page.getByText(new RegExp(`Added to ${A.openProject.name}`))).toBeVisible();
    await expect(page).toHaveURL(/\/m$/);

    const rows = await sql<{ fileName: string }>(
      `SELECT "fileName" FROM "TimeEntryAttachment" WHERE "timeEntryId" = $1`,
      [ENTRY]
    );
    expect(rows.map((r) => r.fileName)).toEqual(["Screenshot_20261014.png"]);
    // Used up: the inbox is empty again.
    await page.goto("/m/share");
    await expect(page.getByText("Nothing shared yet")).toBeVisible();
  });

  test("owed lists sent invoices with a balance", async ({ page }) => {
    await page.goto("/m/invoices");
    await expect(page.getByRole("heading", { name: "Owed" })).toBeVisible();
    await expect(page.getByText(/Outstanding|Nothing outstanding/).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(412);
  });
});

test.describe("as a member", () => {
  test.use({ storageState: STORAGE.memberA, ...PHONE });

  test("there's no Owed tab, and the page says why", async ({ page }) => {
    await page.goto("/m");
    await expect(page.getByRole("navigation", { name: "Phone" }).getByRole("link", { name: "Owed" })).toHaveCount(0);
    await page.goto("/m/invoices");
    await expect(page.getByText("Only owners and admins can see invoices")).toBeVisible();
  });
});
