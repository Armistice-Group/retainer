import { defineConfig, devices } from "@playwright/test";

// End-to-end tests: the production build (`next start`) against a throwaway
// Postgres that tests/e2e/seed.ts wipes and fills. See README → "Running the
// tests". Every value below is a test-only default; CI sets the same ones.
const PORT = Number(process.env.E2E_PORT ?? 3130);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

process.env.DATABASE_URL ??= "postgresql://app:app@localhost:55510/consultainer_test?schema=public";
process.env.E2E_BASE_URL = BASE_URL;

const serverEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-auth-secret-not-for-production-use",
  // base64 of 32 bytes, as the app requires.
  INTEGRATION_ENCRYPTION_KEY:
    process.env.INTEGRATION_ENCRYPTION_KEY ?? "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
  CRON_SECRET: process.env.CRON_SECRET ?? "e2e-cron-secret",
  AUTH_URL: BASE_URL,
  // Integrations (email, Stripe, S3, Google...) stay unconfigured on purpose.
};

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }], ["list"]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Seeds the database and logs each role in once (storageState files).
    { name: "setup", testMatch: /global\.setup\.ts/, fullyParallel: false },
    {
      name: "api",
      testMatch: /(api|mcp|actions|features|vault-links)\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "chromium",
      testMatch: /(ui|smoke|share-gate|schedule)\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: serverEnv,
    stdout: "ignore",
    stderr: "pipe",
  },
});
