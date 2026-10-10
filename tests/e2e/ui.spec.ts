// Pages in a real browser: what members can see and click, confidential
// projects, voiding an invoice, the forgot-password flow and required 2FA.
import { test, expect } from "@playwright/test";
import { A, STORAGE, TWO_FACTOR_USER } from "./fixtures";
import { logIn, sql } from "./helpers";

const inv = A.invoices;
const STATUS_BUTTONS = ["Mark as sent", "Mark as paid", "Void"];

test.describe("as a member", () => {
  test.use({ storageState: STORAGE.memberA });

  test("there are no Send / Mark paid / Void buttons on invoices", async ({ page }) => {
    for (const id of [inv.memberTarget.id, inv.memberDraft.id]) {
      await page.goto(`/invoices/${id}`);
      await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();
      for (const name of STATUS_BUTTONS) {
        await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
      }
      await expect(page.getByRole("button", { name: /Email to client|Email again/ })).toHaveCount(0);
    }
  });

  test("the confidential project and its invoices appear nowhere", async ({ page }) => {
    const secrets = [A.secretProject.name, A.secretTask.title, inv.secret.number, inv.secretSent.number];
    for (const path of ["/dashboard", "/projects", "/invoices", `/clients/${A.client.id}`, "/tasks", "/time"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      const text = await page.locator("body").innerText();
      for (const secret of secrets) expect(text, `${secret} on ${path}`).not.toContain(secret);
    }
  });

  test("the confidential project, its invoice and the invoice PDF are not found", async ({ page }) => {
    for (const path of [`/projects/${A.secretProject.id}`, `/invoices/${inv.secret.id}`]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.locator("body")).not.toContainText(A.secretProject.name);
    }
    const pdf = await page.request.get(`/invoices/${inv.secret.id}/pdf`);
    expect([403, 404]).toContain(pdf.status());
    expect(pdf.headers()["content-type"]).not.toContain("pdf");
  });

  test("the reports page is for owners and admins", async ({ page }) => {
    const res = await page.goto("/reports");
    expect(res?.status()).toBe(404);
  });
});

test.describe("as an owner", () => {
  test.use({ storageState: STORAGE.ownerA });

  test("the status buttons are there", async ({ page }) => {
    await page.goto(`/invoices/${inv.memberTarget.id}`);
    await expect(page.getByRole("button", { name: "Mark as paid" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Void", exact: true })).toBeVisible();
    await page.goto(`/invoices/${inv.memberDraft.id}`);
    await expect(page.getByRole("button", { name: "Mark as sent" })).toBeVisible();
  });

  test("the confidential project is listed and its PDF downloads", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText(A.secretProject.name)).toBeVisible();
    const pdf = await page.request.get(`/invoices/${inv.secret.id}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
  });

  test("voiding an invoice releases its time entries", async ({ page }) => {
    await page.goto(`/invoices/${inv.uiVoid.id}`);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Void", exact: true }).click();
    await expect(page.getByText("VOID", { exact: false }).first()).toBeVisible();
    await expect
      .poll(async () => (await sql<{ status: string }>(`SELECT status FROM "Invoice" WHERE id = $1`, [inv.uiVoid.id]))[0].status)
      .toBe("VOID");
    const entries = await sql<{ invoiceLineItemId: string | null }>(
      `SELECT "invoiceLineItemId" FROM "TimeEntry" WHERE id = ANY($1)`,
      [A.uiVoidEntries]
    );
    expect(entries).toHaveLength(A.uiVoidEntries.length);
    expect(entries.every((e) => e.invoiceLineItemId === null)).toBe(true);
    // The status buttons are gone once it's void.
    await expect(page.getByRole("button", { name: "Void", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark as paid" })).toHaveCount(0);
  });
});

test.describe("logged out", () => {
  test("the forgot-password form renders", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByText("Reset your password")).toBeVisible();
    // Email isn't configured in tests, so it says who to ask instead.
    await expect(page.getByText(/ask an owner or admin of your organization/)).toBeVisible();
  });

  test("a bad reset link shows a message, not an error page", async ({ page }) => {
    const res = await page.goto("/login/reset/not-a-real-token");
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("body")).toContainText(/invalid|expired/i);
  });

  test("an org that requires 2FA sends a user without it to /two-factor-setup", async ({ page }) => {
    await logIn(page, TWO_FACTOR_USER.email);
    await page.waitForURL("**/two-factor-setup");
    await expect(page.getByRole("heading", { name: "Set up two-factor authentication" })).toBeVisible();
    // Every app page bounces back there until it's set up.
    for (const path of ["/dashboard", "/invoices", "/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/two-factor-setup$/);
    }
  });
});

test.describe("export", () => {
  test.describe("as a member", () => {
    test.use({ storageState: STORAGE.memberA });
    test("can't download the organization or a client", async ({ page }) => {
      expect((await page.request.get("/api/export/org")).status()).toBe(403);
      expect((await page.request.get(`/api/export/clients/${A.client.id}`)).status()).toBeGreaterThanOrEqual(403);
    });
  });

  test.describe("as an admin", () => {
    test.use({ storageState: STORAGE.adminA });
    test("can export a client but not the whole organization", async ({ page }) => {
      expect((await page.request.get("/api/export/org")).status()).toBe(403);
      const res = await page.request.get(`/api/export/clients/${A.client.id}`);
      expect(res.status()).toBe(200);
      expect((await res.body()).subarray(0, 2).toString()).toBe("PK");
    });
  });

  test.describe("as an owner", () => {
    test.use({ storageState: STORAGE.ownerA });
    test("downloads everything as a ZIP", async ({ page }) => {
      const res = await page.request.get("/api/export/org");
      expect(res.status()).toBe(200);
      expect((await res.body()).subarray(0, 2).toString()).toBe("PK");
    });
  });
});
