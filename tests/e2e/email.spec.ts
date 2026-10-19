// Outgoing email set up from the app: Resend or any SMTP server, with a test
// send. Email is instance-wide, so this project runs after the others (see
// playwright.config.ts) and turns it off again at the end.
import { test, expect } from "@playwright/test";
import { STORAGE, USERS } from "./fixtures";
import { sql } from "./helpers";
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
