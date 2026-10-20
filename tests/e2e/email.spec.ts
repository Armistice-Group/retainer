// Outgoing email set up from the app: Resend or any SMTP server, with a test
// send. Email is instance-wide, so this project runs after the others (see
// playwright.config.ts) and turns it off again at the end.
import { test, expect } from "@playwright/test";
import { A, STORAGE, USERS } from "./fixtures";
import { bearer, sql } from "./helpers";
import { smtpSink } from "./smtp-sink";

test.describe.configure({ mode: "serial" });
test.use({ storageState: STORAGE.ownerA });

let sink: Awaited<ReturnType<typeof smtpSink>>;
test.beforeAll(async () => {
  sink = await smtpSink();
});
test.afterAll(async () => {
  await sink.close();
  await sql(`DELETE FROM "InstanceSetting" WHERE key ~ '^config:(EMAIL_|SMTP_|RESEND_)'`);
});

test("the welcome page asks the owner to set up email first", async ({ page }) => {
  await page.goto("/welcome");
  await expect(page.getByText("First, set up email")).toBeVisible();
  await expect(page.getByRole("radio", { name: /^SMTP/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Set up email" })).toBeVisible();
});

test("SMTP: what's wrong is said, then a test email arrives", async ({ page, browser }) => {
  await page.goto("/settings/integrations?open=email");
  const panel = page.getByRole("dialog");
  await panel.getByRole("radio", { name: /^SMTP/ }).check();
  await panel.getByLabel("Port").fill("abc");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByText("Enter the server, like smtp.postmarkapp.com.")).toBeVisible();
  await expect(panel.getByText("Enter a port number, usually 587 or 465.")).toBeVisible();

  await panel.getByLabel("SMTP server").fill("127.0.0.1");
  await panel.getByLabel("Port").fill(String(sink.port));
  await panel.getByLabel("Username").fill("e2e-user");
  await panel.getByLabel("Password").fill("e2e-pass");
  await panel.getByLabel("From address").fill("Consultainer Tests <billing@e2e.test>");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByText("Saved. Send yourself a test to check it works.")).toBeVisible();

  await panel.getByRole("button", { name: "Send a test email" }).click();
  await expect(panel.getByText(`Sent to ${USERS.A.OWNER.email}`)).toBeVisible();
  const sent = sink.messages.at(-1)!;
  expect(sent.to.join()).toContain(USERS.A.OWNER.email);
  expect(sent.from).toContain("billing@e2e.test");
  expect(sent.data).toContain("Subject: Test email from Consultainer");

  await page.keyboard.press("Escape");
  await expect(page.locator("#email")).toContainText("SMTP");
  // Email login links come on with it.
  const login = await browser.newPage({ storageState: { cookies: [], origins: [] } });
  await login.goto("/login");
  await expect(login.getByRole("button", { name: /login link/i })).toBeVisible();
  await login.close();
});

test("a sample invoice email goes to any address, with no invoice needed", async ({ page }) => {
  await page.goto("/settings/integrations?open=email");
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Send a test to").fill("not an address");
  await panel.getByRole("button", { name: "Send a sample invoice email" }).click();
  await expect(panel.getByText("Enter one email address, like you@example.com.")).toBeVisible();
  const before = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM "Invoice"`);
  await panel.getByLabel("Send a test to").fill("kim@client.e2e.test");
  await panel.getByRole("button", { name: "Send a sample invoice email" }).click();
  await expect(panel.getByText("Sent to kim@client.e2e.test")).toBeVisible();
  const sent = sink.messages.at(-1)!;
  expect(sent.to.join()).toContain("kim@client.e2e.test");
  expect(sent.data).toMatch(/Subject: =?.*Sample/);
  expect(await sql(`SELECT count(*)::int AS n FROM "Invoice"`)).toEqual(before);
});

test("an invoice can go out with its PDF attached", async ({ page, request }) => {
  const created = await request.post("/api/v1/invoices/custom", {
    headers: bearer(USERS.A.OWNER.apiKey),
    data: { clientId: A.client.id, lines: [{ description: "E2E attach PDF", amount: 42 }], issueDate: "2026-01-05" },
  });
  const { invoice } = await created.json();
  try {
    await page.goto(`/invoices/${invoice.id}`);
    await page.getByRole("button", { name: "Email to client" }).click();
    const dialog = page.getByRole("dialog");
    // A set amount has no hourly time, so there's no timesheet to offer.
    await expect(dialog.getByText("Include the timesheet")).toHaveCount(0);
    await dialog.getByLabel("Other recipients").fill("ap@client.e2e.test");
    for (const box of await dialog.getByRole("checkbox", { name: /@/ }).all()) await box.uncheck();
    await dialog.getByRole("checkbox", { name: /Attach the PDF/ }).check();
    await dialog.getByRole("button", { name: "Send invoice" }).click();
    await expect(page.getByText(`Invoice ${invoice.number} emailed.`)).toBeVisible();
    // The "invoice sent" alert to the owner follows it.
    const sent = sink.messages.find((m) => m.to.join().includes("ap@client.e2e.test"))!;
    expect(sent.to).toHaveLength(1);
    expect(sent.data).toContain("application/pdf");
    expect(sent.data).toContain(`${invoice.number}.pdf`);
  } finally {
    await sql(`DELETE FROM "Invoice" WHERE id = $1`, [invoice.id]);
  }
});

test("a send the server refuses shows its reason", async ({ page }) => {
  await page.goto("/settings/integrations?open=email");
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "Change settings" }).click();
  // Nothing listens on port 1.
  await panel.getByLabel("Port").fill("1");
  await panel.getByRole("button", { name: "Save" }).click();
  await panel.getByRole("button", { name: "Send a test email" }).click();
  await expect(panel.getByText(/^The SMTP server said: .*ECONNREFUSED/)).toBeVisible({ timeout: 15_000 });
});

test("removing the settings turns email off", async ({ page }) => {
  await page.goto("/settings/integrations?open=email");
  const panel = page.getByRole("dialog");
  page.once("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "Remove" }).click();
  await expect(panel.getByRole("radio", { name: /^Resend/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#email")).toContainText("Not set up");
});
