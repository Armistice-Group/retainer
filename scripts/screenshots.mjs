// Regenerates docs/screenshots/*.png (the README and the website's tour and
// scenarios) against a running instance seeded with prisma/seed-demo.ts.
// Use a production build (no dev-mode badge):
//
//   DATABASE_URL=... BASE_URL=http://localhost:3000 node scripts/screenshots.mjs
import { chromium } from "playwright";
import pg from "pg";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const id = async (sql, arg) => (await db.query(sql, [arg])).rows[0]?.id;
const project = await id(`select id from "Project" where name = $1`, "Patient Scheduling Rebuild");
const client = await id(`select id from "Client" where name = $1`, "Tidewater Logistics");
const invoice = await id(`select id from "Invoice" where number = $1`, "NWL-0004");
const atlas = await id(`select id from "Client" where name = $1`, "Atlas Robotics");
await db.end();

const shots = [
  ["dashboard", "/dashboard"],
  // Last week, so it's full whatever day this runs.
  ["time", `/time?week=${new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)}`],
  ["project", `/projects/${project}`],
  ["client", `/clients/${client}`],
  ["invoices", "/invoices"],
  ["invoice", `/invoices/${invoice}`],
];

const browser = await chromium.launch();
for (const scheme of ["dark", "light"]) {
  const ctx = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}login-${scheme}.png` });
  await page.fill("#email", "maya@northwind.example");
  await page.fill("#password", "password123");
  await page.click("button:has-text('Log in')");
  await page.waitForURL("**/dashboard");
  for (const [name, path] of shots) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}${name}-${scheme}.png` });
    console.log(`${name}-${scheme}.png`);
  }
  const shot = async (name) => {
    await page.waitForTimeout(400); // let dialogs and sheets finish animating
    await page.screenshot({ path: `${OUT}${name}-${scheme}.png` });
    console.log(`${name}-${scheme}.png`);
  };

  // Each pass starts with email not set up, so the setup scene shows the form.
  const reset = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await reset.connect();
  await reset.query(`DELETE FROM "InstanceSetting" WHERE key ~ '^config:(EMAIL_|SMTP_|RESEND_)'`);
  await reset.end();
  await page.waitForTimeout(16_000); // the server caches settings for 15s

  // Scenarios on the website, in the order a new user meets them.
  // 1. Email, set up from the browser (saved, so the invoice dialog below works).
  await page.goto(`${BASE}/settings/integrations`, { waitUntil: "networkidle" });
  await shot("integrations");
  await page.goto(`${BASE}/settings/integrations?open=email`, { waitUntil: "networkidle" });
  const panel = page.getByRole("dialog");
  if (await panel.getByRole("button", { name: "Change settings" }).count()) {
    await panel.getByRole("button", { name: "Change settings" }).click();
  }
  await panel.getByRole("radio", { name: /^SMTP/ }).check();
  await panel.getByLabel("SMTP server").fill("smtp.postmarkapp.com");
  await panel.getByLabel("Port").fill("587");
  await panel.getByLabel("Username").fill("pm-server-token");
  await panel.getByLabel("Password").fill("pm-server-token");
  await panel.getByLabel("From address").fill("Northwind Labs <billing@northwind.example>");
  await shot("email-setup");
  await panel.getByRole("button", { name: "Save" }).click();
  await panel.getByText("Saved.").waitFor();

  // 2. A deposit before kickoff: a set amount, no logged work needed.
  await page.goto(`${BASE}/invoices/new?clientId=${atlas}&mode=amount`, { waitUntil: "networkidle" });
  await page.getByLabel("Line 1 description").fill("Fleet Dashboard phase 2 — initial deposit (50%)");
  await page.getByLabel("Line 1 amount").fill("9,000.00");
  await page.getByRole("checkbox", { name: /This is a deposit/ }).check();
  await page.getByLabel("Notes").fill("Covers the first four weeks of phase 2. Applied to the phase 2 invoices as credit.");
  await shot("deposit");

  // 3. Emailing an invoice with the PDF attached and the timesheet on.
  await page.goto(`${BASE}/invoices/${invoice}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Email again|Email to client/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: /Attach the PDF/ }).check();
  await dialog.getByLabel("Message (optional)").fill("Hi Ken — September's invoice is attached, with the timesheet. Thanks!");
  await shot("email-invoice");
  await page.keyboard.press("Escape");

  // 4. What the client sees: the invoice link, with its timesheet.
  const guest = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const view = await guest.newPage();
  await view.goto(`${BASE}/i/demo-atlas-invoice`, { waitUntil: "networkidle" });
  // Headless Chromium draws the embedded PDF as a blank box.
  await view.addStyleTag({ content: `:has(> iframe[src*="/pdf"]), iframe[src*="/pdf"] { display: none !important; }` });
  await view.screenshot({ path: `${OUT}client-invoice-${scheme}.png` });
  console.log(`client-invoice-${scheme}.png`);
  await guest.close();

  // The demo has eight weeks of time; a longer range would understate utilization.
  const since = new Date(Date.now() - 56 * 86_400_000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  await page.goto(`${BASE}/reports?from=${since}&to=${until}`, { waitUntil: "networkidle" });
  await shot("reports");
  const signedIn = await ctx.storageState();
  await ctx.close();

  // 5. The phone app (Android-sized).
  const phone = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    storageState: signedIn,
  });
  const mobile = await phone.newPage();
  await mobile.goto(`${BASE}/m`, { waitUntil: "networkidle" });
  await mobile.screenshot({ path: `${OUT}phone-${scheme}.png` });
  console.log(`phone-${scheme}.png`);
  await phone.close();
}
await browser.close();
