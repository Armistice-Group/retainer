// Every main page loads for an owner (and the everyday ones for a member)
// with no server error, no uncaught exception and nothing in the console.
import { test, expect, type Page } from "@playwright/test";
import { A, BOOKING, STORAGE } from "./fixtures";

const OWNER_PAGES = [
  "/dashboard",
  "/welcome",
  "/clients",
  "/clients/new",
  "/clients/import",
  `/clients/${A.client.id}`,
  `/clients/${A.client.id}/edit`,
  "/projects",
  "/projects/new",
  `/projects/${A.openProject.id}`,
  `/projects/${A.openProject.id}/edit`,
  `/projects/${A.secretProject.id}`,
  "/tasks",
  "/time",
  "/calendar",
  "/calendar?view=agenda",
  "/invoices",
  "/invoices/new",
  `/invoices/new?clientId=${A.client.id}`,
  `/invoices/${A.invoices.openDraft.id}`,
  `/invoices/${A.invoices.secret.id}`,
  `/invoices/${A.invoices.mcpPaid.id}`,
  "/estimates",
  "/estimates/new",
  "/reports",
  "/notifications",
  "/profile",
  "/settings",
  "/settings/members",
  "/settings/security",
  "/settings/integrations",
  "/settings/payments",
  "/settings/alerts",
  "/settings/audit",
  "/settings/agreements",
  "/settings/scheduling",
  "/clients?view=drafts",
  `/clients/${BOOKING.draft.id}`,
  `/clients/${BOOKING.draft.id}/edit`,
  "/settings/import",
  "/settings/export",
];

const MEMBER_PAGES = [
  "/dashboard",
  "/clients",
  "/clients?view=drafts",
  `/clients/${BOOKING.draft.id}`,
  `/clients/${A.client.id}`,
  "/projects",
  `/projects/${A.openProject.id}`,
  "/tasks",
  "/time",
  "/calendar",
  "/invoices",
  `/invoices/${A.invoices.openDraft.id}`,
  "/estimates",
  "/notifications",
  "/profile",
  "/settings",
];

async function visitCleanly(page: Page, path: string) {
  const problems: string[] = [];
  const onConsole = (msg: { type(): string; text(): string }) => {
    if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
  };
  const onPageError = (err: Error) => problems.push(`uncaught: ${err.message}`);
  const onResponse = (res: { status(): number; url(): string }) => {
    if (res.status() >= 500) problems.push(`${res.status()} ${res.url()}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);
  try {
    const res = await page.goto(path, { waitUntil: "load" });
    expect(res?.status(), `${path} status`).toBeLessThan(400);
    expect(new URL(page.url()).pathname, `${path} redirected`).toBe(path.split("?")[0]);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
  expect(problems, path).toEqual([]);
}

test.describe("owner", () => {
  test.use({ storageState: STORAGE.ownerA });
  for (const path of OWNER_PAGES) {
    test(`loads ${path}`, async ({ page }) => {
      await visitCleanly(page, path);
    });
  }
});

test.describe("member", () => {
  test.use({ storageState: STORAGE.memberA });
  for (const path of MEMBER_PAGES) {
    test(`loads ${path}`, async ({ page }) => {
      await visitCleanly(page, path);
    });
  }
});
