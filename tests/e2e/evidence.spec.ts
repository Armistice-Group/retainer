// Evidence on time entries (API and the Time page), the time detail on a
// client's invoices, and client logos (uploaded or from their website).
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { A, STORAGE, USERS } from "./fixtures";
import { bearer, json, sql } from "./helpers";

const ownerA = bearer(USERS.A.OWNER.apiKey);
const memberA = bearer(USERS.A.MEMBER.apiKey);
const ownerB = bearer(USERS.B.OWNER.apiKey);

// A 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const png = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

/** A fresh timed entry of the owner's on the clocked project. */
async function newEntry(request: APIRequestContext, date: string) {
  const res = await request.post("/api/v1/time-entries", {
    headers: ownerA,
    data: { projectId: A.clockProject.id, date, startTime: "09:00", endTime: "10:00", description: "Evidence test" },
  });
  expect(res.status()).toBe(201);
  return (await json(res)).timeEntry.id as string;
}

async function attach(request: APIRequestContext, entryId: string, name: string, clientVisible: boolean) {
  const res = await request.post(`/api/v1/time-entries/${entryId}/attachments`, {
    headers: ownerA,
    multipart: { file: png(name), clientVisible: String(clientVisible) },
  });
  expect(res.status()).toBe(201);
  return (await json(res)).attachments[0] as { id: string; fileName: string; clientVisible: boolean };
}

test.describe("evidence API", () => {
  test("upload, list, download, share and delete", async ({ request }) => {
    const entryId = await newEntry(request, "2025-05-05");
    const attachment = await attach(request, entryId, "dashboard.png", true);
    expect(attachment).toMatchObject({ fileName: "dashboard.png", clientVisible: true });

    const { timeEntries } = await json(
      await request.get(`/api/v1/time-entries?from=2025-05-05&to=2025-05-05`, { headers: ownerA })
    );
    const listed = timeEntries.find((e: { id: string }) => e.id === entryId);
    expect(listed.attachments).toEqual([expect.objectContaining({ id: attachment.id, contentType: "image/png" })]);

    const file = await request.get(`/api/v1/time-entries/${entryId}/attachments/${attachment.id}`, {
      headers: ownerA,
    });
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toBe("image/png");
    expect(file.headers()["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.compare(await file.body(), PNG)).toBe(0);

    const patched = await request.patch(`/api/v1/time-entries/${entryId}/attachments/${attachment.id}`, {
      headers: ownerA,
      data: { clientVisible: false },
    });
    expect((await json(patched)).attachment.clientVisible).toBe(false);

    const removed = await request.delete(`/api/v1/time-entries/${entryId}/attachments/${attachment.id}`, {
      headers: ownerA,
    });
    expect(removed.status()).toBe(200);
    expect(await sql(`SELECT id FROM "TimeEntryAttachment" WHERE id = $1`, [attachment.id])).toEqual([]);
  });

  test("the file's real type decides, not its name", async ({ request }) => {
    const entryId = await newEntry(request, "2025-05-06");
    const res = await request.post(`/api/v1/time-entries/${entryId}/attachments`, {
      headers: ownerA,
      multipart: { file: { name: "notes.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") } },
    });
    expect(res.status()).toBe(422);
    expect((await json(res)).error).toBe("notes.png isn't a PNG, JPEG, GIF, WebP or PDF.");
  });

  test("members see but can't change someone else's evidence; other orgs see nothing", async ({ request }) => {
    const entryId = await newEntry(request, "2025-05-07");
    const attachment = await attach(request, entryId, "proof.png", false);
    const path = `/api/v1/time-entries/${entryId}/attachments`;

    expect((await request.get(path, { headers: memberA })).status()).toBe(200);
    const add = await request.post(path, { headers: memberA, multipart: { file: png("mine.png") } });
    expect(add.status()).toBe(403);
    const del = await request.delete(`${path}/${attachment.id}`, { headers: memberA });
    expect(del.status()).toBe(403);

    expect((await request.get(path, { headers: ownerB })).status()).toBe(404);
    expect((await request.get(`${path}/${attachment.id}`, { headers: ownerB })).status()).toBe(404);
    expect((await request.post(path, { headers: ownerB, multipart: { file: png("x.png") } })).status()).toBe(404);
  });
});

test.describe("time detail on invoices", () => {
  test("lists the billed time and opens only evidence marked for the client", async ({ request }) => {
    await sql(`UPDATE "Client" SET "invoiceTimeDetail" = true WHERE id = $1`, [A.clockClient.id]);
    try {
      const entryId = await newEntry(request, "2025-05-12");
      const shown = await attach(request, entryId, "shown-to-client.png", true);
      const hidden = await attach(request, entryId, "internal-only.png", false);

      const generated = await request.post("/api/v1/invoices/generate", {
        headers: ownerA,
        data: { clientId: A.clockClient.id, timeEntryIds: [entryId], issueDate: "2025-05-31" },
      });
      expect(generated.status()).toBe(201);
      const invoiceId = (await json(generated)).invoice.id as string;
      const token = `e2e-view-${invoiceId}`;
      await sql(`UPDATE "Invoice" SET status = 'SENT', "viewToken" = $2 WHERE id = $1`, [invoiceId, token]);

      const page = await (await request.get(`/i/${token}`)).text();
      expect(page).toContain("Time detail");
      expect(page).toContain("09:00–10:00");
      expect(page).toContain("shown-to-client.png");
      expect(page).not.toContain("internal-only.png");

      expect((await request.get(`/i/${token}/evidence/${shown.id}`)).status()).toBe(200);
      expect((await request.get(`/i/${token}/evidence/${hidden.id}`)).status()).toBe(404);
      // Not through another invoice's link.
      expect((await request.get(`/i/e2e-view-inv-e-gated/evidence/${shown.id}`)).status()).toBe(404);

      // The PDF gets a second page.
      const pdf = await request.get(`/i/${token}/pdf`);
      expect(pdf.headers()["content-type"]).toBe("application/pdf");
      expect((await pdf.body()).toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(2);

      // Turned off, the client sees neither.
      await sql(`UPDATE "Client" SET "invoiceTimeDetail" = false WHERE id = $1`, [A.clockClient.id]);
      expect(await (await request.get(`/i/${token}`)).text()).not.toContain("Time detail");
      expect((await request.get(`/i/${token}/evidence/${shown.id}`)).status()).toBe(404);
    } finally {
      await sql(`UPDATE "Client" SET "invoiceTimeDetail" = false WHERE id = $1`, [A.clockClient.id]);
    }
  });
});

test.describe("on the Time page", () => {
  test.use({ storageState: STORAGE.ownerA });
  test.afterEach(async () => {
    await sql(`UPDATE "Client" SET "invoiceTimeDetail" = false WHERE id = $1`, [A.client.id]);
  });

  test("evidence picked while logging time is saved and can be shared", async ({ page }) => {
    // Sharing is offered only when the client shows time detail.
    await sql(`UPDATE "Client" SET "invoiceTimeDetail" = true WHERE id = $1`, [A.client.id]);
    await page.goto("/time?week=2025-06-02");
    await page.getByRole("button", { name: "Log time" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Project" }).click();
    await page.getByRole("option", { name: `${A.client.name} — ${A.openProject.name}` }).click();
    await dialog.getByLabel("Date").fill("2025-06-03");
    await dialog.getByLabel("Hours").fill("1");
    await dialog.getByLabel("Description").fill("Evidence via dialog");
    await dialog.getByLabel("Add evidence files").setInputFiles([png("before.png"), png("after.png")]);
    await expect(dialog.getByText("before.png")).toBeVisible();
    await dialog.getByRole("button", { name: "Remove after.png" }).click();
    await dialog.getByRole("button", { name: "Log time" }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByRole("listitem").filter({ hasText: "Evidence via dialog" });
    await row.getByRole("button", { name: "Evidence (1)" }).click();
    const evidence = page.getByRole("dialog");
    await expect(evidence.getByRole("img", { name: "before.png" })).toBeVisible();
    await evidence.getByLabel("Client can see it").check();
    await expect
      .poll(async () => (await sql<{ v: boolean }>(`SELECT "clientVisible" v FROM "TimeEntryAttachment" WHERE "fileName" = 'before.png'`))[0]?.v)
      .toBe(true);

    await evidence.getByLabel("Add evidence files").setInputFiles(png("later.png"));
    await expect(evidence.getByRole("img", { name: "later.png" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(row.getByRole("button", { name: "Evidence (2)" })).toBeVisible();
  });
});

test.describe("client logos", () => {
  test.use({ storageState: STORAGE.ownerA });

  let site: http.Server;
  let origin: string;
  test.beforeAll(async () => {
    // A stand-in client website: an SVG icon linked from <head>.
    site = http.createServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<html><head><link rel="icon" href="/brand/icon.svg" type="image/svg+xml"></head></html>`);
      } else if (req.url === "/brand/icon.svg") {
        res.writeHead(200, { "Content-Type": "image/svg+xml" });
        res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f60"/></svg>`);
      } else {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
  });
  test.afterAll(() => new Promise<void>((resolve) => site.close(() => resolve())));

  test("a new client's website icon becomes its logo; an upload replaces it", async ({ page }) => {
    const name = `Logo Co ${Date.now()}`;
    await page.goto("/clients/new");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Website").fill(origin);
    await page.getByRole("button", { name: "Create client" }).click();
    await page.waitForURL(/\/clients\/[^/]+\?new=1/);
    const clientId = new URL(page.url()).pathname.split("/").pop()!;

    await expect
      .poll(async () => (await sql<{ source: string }>(`SELECT source FROM "ClientLogo" WHERE "clientId" = $1`, [clientId]))[0]?.source)
      .toBe("website");
    const [logo] = await sql<{ sourceUrl: string; contentType: string }>(
      `SELECT "sourceUrl", "contentType" FROM "ClientLogo" WHERE "clientId" = $1`,
      [clientId]
    );
    expect(logo).toEqual({ sourceUrl: `${origin}/brand/icon.svg`, contentType: "image/svg+xml" });

    await page.goto("/clients");
    const avatar = page.getByRole("link", { name }).locator("img");
    await expect(avatar).toHaveAttribute("src", new RegExp(`^/api/clients/${clientId}/logo\\?v=\\d+$`));
    const served = await page.request.get((await avatar.getAttribute("src"))!);
    expect(served.headers()["content-type"]).toBe("image/svg+xml");
    expect(served.headers()["content-security-policy"]).toContain("sandbox");

    await page.goto(`/clients/${clientId}/edit`);
    await expect(page.getByText("The icon from the client's website.")).toBeVisible();
    await page.getByLabel("Logo image").setInputFiles(png("logo.png"));
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("Uploaded.")).toBeVisible();
    const [uploaded] = await sql<{ source: string; contentType: string }>(
      `SELECT source, "contentType" FROM "ClientLogo" WHERE "clientId" = $1`,
      [clientId]
    );
    expect(uploaded).toEqual({ source: "upload", contentType: "image/png" });

    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("No logo yet.")).toBeVisible();
    expect(await sql(`SELECT 1 FROM "ClientLogo" WHERE "clientId" = $1`, [clientId])).toEqual([]);
  });

  test("only the client's org can load its logo", async ({ playwright }) => {
    await sql(
      `INSERT INTO "ClientLogo" ("clientId", data, "contentType", source, "updatedAt")
       VALUES ($1, $2, 'image/png', 'upload', now()) ON CONFLICT ("clientId") DO NOTHING`,
      [A.client.id, PNG]
    );
    const path = `/api/clients/${A.client.id}/logo`;
    try {
      const own = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL, storageState: STORAGE.ownerA });
      expect((await own.get(path)).headers()["content-type"]).toBe("image/png");
      const other = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL, storageState: STORAGE.ownerB });
      expect((await other.get(path)).status()).toBe(404);
      const anonymous = await playwright.request.newContext({
        baseURL: process.env.E2E_BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      const res = await anonymous.get(path, { maxRedirects: 0 });
      expect(res.headers()["content-type"] ?? "").not.toBe("image/png");
      await Promise.all([own.dispose(), other.dispose(), anonymous.dispose()]);
    } finally {
      await sql(`DELETE FROM "ClientLogo" WHERE "clientId" = $1`, [A.client.id]);
    }
  });

  test("the billing card says where invoices go", async ({ page }) => {
    await page.goto(`/clients/${A.client.id}`);
    const billing = page.locator("[data-slot=card]").filter({ hasText: "Invoices are emailed to" });
    await expect(billing).toContainText("ap@alpha.test");
    await expect(billing).toContainText("(client email)");
  });
});
