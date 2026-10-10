// Client share links with email verification and expiry, from the
// client's side (no login). Org E's "gated" client requires verification.
//
// Email isn't configured in the e2e server, so nobody new can ask for a
// code there: the pages fail closed. The code form itself is exercised the
// way a real visitor reaches it — with the challenge cookie set when a code
// was requested — by writing that code request straight into the database
// (only hashes are stored, as the app does). Nothing in the app is
// test-only.
import { createHash, randomBytes } from "crypto";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { E } from "./fixtures";
import { sql } from "./helpers";

const sha256 = (raw: string) => createHash("sha256").update(raw).digest("hex");

const CLIENT_PAGE = `/share/client/${E.gated.shareToken}`;
const PROJECT_PAGE = `/share/${E.gatedProject.shareToken}`;
const CLIENT_PDF = `${CLIENT_PAGE}/invoices/${E.invoice.id}/pdf`;
const PROJECT_PDF = `${PROJECT_PAGE}/invoices/${E.invoice.id}/pdf`;
const CLIENT_DOC = `/api/share/client/${E.gated.shareToken}/documents/${E.document.id}`;
const PROJECT_DOC = `/api/share/${E.gatedProject.shareToken}/documents/${E.document.id}`;
const CLIENT_PAY = `/api/share/client/${E.gated.shareToken}/invoices/${E.invoice.id}/pay`;

const UNAVAILABLE = `This page needs email verification, which isn't available right now. Contact ${E.org.name}.`;

/** What a visitor must not see before verifying. */
const SECRETS = [E.gated.name, E.gatedProject.name, E.invoice.number, E.document.fileName];

async function expectNothingLeaks(page: Page) {
  const text = await page.locator("body").innerText();
  for (const secret of SECRETS) expect(text, secret).not.toContain(secret);
}

/** Types a code and submits it, waiting for the answer (the form clears
 * itself once the server action has run). */
async function submitCode(page: Page, code: string, { accepted = false } = {}) {
  const input = page.getByLabel("Code");
  await input.fill(code);
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/share/")),
    page.getByRole("button", { name: "Verify" }).click(),
  ]);
  // A refused code: wait for the form to clear before the next one is typed.
  if (!accepted) await expect(input).toHaveValue("");
}

/** Puts a seeded contact back as seeded and signs them out, so a retried
 * test starts from the same place. */
async function resetContact(c: { id: string; name: string; email: string }) {
  await sql(
    `INSERT INTO "Contact" (id, "clientId", name, email) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
    [c.id, E.gated.id, c.name, c.email]
  );
  await sql(`DELETE FROM "ShareSession" WHERE "contactId" = $1`, [c.id]);
  await sql(`DELETE FROM "ShareCode" WHERE "contactId" = $1`, [c.id]);
}

/** A pending code request for `contactId`, as requestShareCodeAction makes
 * it, with the challenge cookie in the browser. */
async function pendingCode(context: BrowserContext, baseURL: string, contactId: string, email: string, code: string) {
  const challenge = randomBytes(32).toString("base64url");
  const challengeHash = sha256(challenge);
  await sql(
    `INSERT INTO "ShareCode" (id, "challengeHash", "codeHash", email, "expiresAt", "clientId", "contactId")
     VALUES ($1, $2, $3, $4, now() + interval '10 minutes', $5, $6)`,
    [`e2e_code_${challenge.slice(0, 12)}`, challengeHash, sha256(`${challengeHash}:${code}`), email, E.gated.id, contactId]
  );
  await context.addCookies([{ name: `cshare_code_${E.gated.id}`, value: challenge, url: baseURL }]);
  return challengeHash;
}

/** A verified session for `contactId`, as verifyShareCodeAction makes it. */
async function verifiedSession(context: BrowserContext, baseURL: string, contactId: string, email: string) {
  const raw = randomBytes(32).toString("base64url");
  const id = `e2e_ss_${raw.slice(0, 12)}`;
  await sql(
    `INSERT INTO "ShareSession" (id, "tokenHash", email, "expiresAt", "clientId", "contactId")
     VALUES ($1, $2, $3, now() + interval '30 days', $4, $5)`,
    [id, sha256(raw), email, E.gated.id, contactId]
  );
  await context.addCookies([{ name: `cshare_${E.gated.id}`, value: raw, url: baseURL }]);
  return id;
}

test.describe("email verification on", () => {
  test("pages fail closed without email set up, and show nothing", async ({ page }) => {
    for (const path of [CLIENT_PAGE, PROJECT_PAGE]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByText(UNAVAILABLE)).toBeVisible();
      await expect(page.getByRole("textbox")).toHaveCount(0);
      await expectNothingLeaks(page);
    }
  });

  test("PDFs, documents and Pay now refuse a visitor who hasn't verified", async ({ page }) => {
    for (const path of [CLIENT_PDF, PROJECT_PDF, CLIENT_DOC, PROJECT_DOC]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(404);
      expect(res.headers()["content-type"] ?? "", path).not.toContain("application/pdf");
    }
    const pay = await page.request.get(CLIENT_PAY, { maxRedirects: 0 });
    expect(pay.status()).toBe(303);
    expect(pay.headers()["location"]).toMatch(new RegExp(`${CLIENT_PAGE}$`));
  });

  test("the code flow: wrong code, right code, then the pages and files open", async ({ page, context, baseURL }) => {
    const c = E.contacts.code;
    await resetContact(c);
    const challengeHash = await pendingCode(context, baseURL!, c.id, c.email, "424242");

    await page.goto(CLIENT_PAGE);
    await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
    await expect(page.getByText("If that address is on file, we've sent a code to it.")).toBeVisible();
    await expectNothingLeaks(page);

    await submitCode(page, "111111");
    await expect(page.getByText("That code is wrong or has expired.")).toBeVisible();

    await submitCode(page, "424242", { accepted: true });
    await expect(page.getByRole("heading", { name: E.gated.name })).toBeVisible();
    await expect(page.getByText(`Verified as ${c.name}.`)).toBeVisible();

    const [code] = await sql<{ usedAt: Date | null; attempts: number }>(
      `SELECT "usedAt", attempts FROM "ShareCode" WHERE "challengeHash" = $1`,
      [challengeHash]
    );
    expect(code.usedAt).not.toBeNull();
    expect(code.attempts).toBe(2);
    const sessions = await sql(`SELECT 1 FROM "ShareSession" WHERE "contactId" = $1`, [c.id]);
    expect(sessions.length).toBe(1);
    const audit = await sql(
      `SELECT 1 FROM "AuditLog" WHERE "orgId" = $1 AND action = 'share_verify' AND "entityId" = $2 AND via = 'share'`,
      [E.org.id, E.gated.id]
    );
    expect(audit.length).toBeGreaterThan(0);

    // The cookie is httpOnly and covers the client's project links too.
    const cookie = (await context.cookies()).find((k) => k.name === `cshare_${E.gated.id}`);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    await page.goto(PROJECT_PAGE);
    await expect(page.getByRole("heading", { name: E.gatedProject.name })).toBeVisible();

    for (const path of [CLIENT_PDF, PROJECT_PDF]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-type"]).toContain("application/pdf");
    }
    for (const path of [CLIENT_DOC, PROJECT_DOC]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(200);
    }

    // The code can't be used twice.
    const again = await sql(`SELECT "usedAt" FROM "ShareCode" WHERE "challengeHash" = $1 AND "usedAt" IS NULL`, [
      challengeHash,
    ]);
    expect(again.length).toBe(0);
  });

  test("five wrong codes use the code up", async ({ page, context, baseURL }) => {
    const c = E.contacts.attempts;
    await resetContact(c);
    await pendingCode(context, baseURL!, c.id, c.email, "135790");
    await page.goto(CLIENT_PAGE);
    for (let i = 0; i < 4; i++) {
      await submitCode(page, `00000${i}`);
      await expect(page.getByText("That code is wrong or has expired.")).toBeVisible();
    }
    await submitCode(page, "000009");
    await expect(page.getByText("Too many wrong codes. Ask for a new code.")).toBeVisible();

    // Even the right code no longer works.
    await submitCode(page, "135790");
    await expect(page.getByText("Too many wrong codes. Ask for a new code.")).toBeVisible();
    await expectNothingLeaks(page);
    const sessions = await sql(`SELECT 1 FROM "ShareSession" WHERE "contactId" = $1`, [c.id]);
    expect(sessions.length).toBe(0);
  });

  test("a removed contact loses access", async ({ page, context, baseURL }) => {
    const c = E.contacts.removed;
    await resetContact(c);
    const sessionId = await verifiedSession(context, baseURL!, c.id, c.email);
    await page.goto(CLIENT_PAGE);
    await expect(page.getByRole("heading", { name: E.gated.name })).toBeVisible();

    await sql(`DELETE FROM "Contact" WHERE id = $1`, [c.id]);
    expect((await sql(`SELECT 1 FROM "ShareSession" WHERE id = $1`, [sessionId])).length).toBe(0);

    await page.goto(CLIENT_PAGE);
    await expect(page.getByText(UNAVAILABLE)).toBeVisible();
    await expectNothingLeaks(page);
    expect((await page.request.get(CLIENT_PDF)).status()).toBe(404);
  });

  test("a contact whose email changed loses access", async ({ page, context, baseURL }) => {
    const c = E.contacts.renamed;
    await resetContact(c);
    await verifiedSession(context, baseURL!, c.id, c.email);
    await page.goto(PROJECT_PAGE);
    await expect(page.getByRole("heading", { name: E.gatedProject.name })).toBeVisible();

    await sql(`UPDATE "Contact" SET email = $1 WHERE id = $2`, ["someone-else@gamma.test", c.id]);
    await page.goto(PROJECT_PAGE);
    await expect(page.getByText(UNAVAILABLE)).toBeVisible();
    await expectNothingLeaks(page);
  });

  test("the invoice link stays open and doesn't link to the gated pages", async ({ page }) => {
    const res = await page.goto(`/i/${E.invoice.viewToken}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByText(E.invoice.number).first()).toBeVisible();
    const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    for (const href of hrefs) expect(href).not.toContain("/share/");
  });
});

test.describe("expired links", () => {
  test("show a polite page with no client data", async ({ page }) => {
    for (const path of [`/share/client/${E.expired.shareToken}`, `/share/${E.expiredProject.shareToken}`]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
      await expect(page.getByText(`This link has expired. Ask ${E.org.name} for a new one.`)).toBeVisible();
      const text = await page.locator("body").innerText();
      expect(text).not.toContain(E.expired.name);
      expect(text).not.toContain(E.expiredProject.name);
    }
  });

  test("their files are refused too", async ({ page }) => {
    const res = await page.request.get(`/api/share/client/${E.expired.shareToken}/documents/${E.document.id}`);
    expect(res.status()).toBe(404);
  });
});
