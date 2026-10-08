// Regenerates docs/screenshots/*.png against a running instance seeded with
// prisma/seed-demo.ts. Use a production build (no dev-mode badge):
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
await db.end();

const shots = [
  ["dashboard", "/dashboard"],
  ["time", "/time"],
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
  await ctx.close();
}
await browser.close();
