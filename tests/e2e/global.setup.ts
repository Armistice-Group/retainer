import { execFileSync } from "child_process";
import { test as setup, expect } from "@playwright/test";
import { ORG_D_PEOPLE, STORAGE, USERS } from "./fixtures";
import { logIn } from "./helpers";

setup("seed the database", async () => {
  setup.setTimeout(60_000);
  execFileSync("npx", ["tsx", "tests/e2e/seed.ts"], { stdio: "inherit", env: process.env });
});

const logins: [string, string][] = [
  [USERS.A.OWNER.email, STORAGE.ownerA],
  [USERS.A.ADMIN.email, STORAGE.adminA],
  [USERS.A.MEMBER.email, STORAGE.memberA],
  [USERS.B.OWNER.email, STORAGE.ownerB],
  [ORG_D_PEOPLE.admin.email, STORAGE.adminD],
];

for (const [email, file] of logins) {
  setup(`log in as ${email}`, async ({ page }) => {
    // Seeding runs first (tests in this file run in order).
    await logIn(page, email);
    await page.waitForURL("**/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
    await page.context().storageState({ path: file });
  });
}
