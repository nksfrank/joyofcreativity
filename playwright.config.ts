import { defineConfig, devices } from "@playwright/test";
import { BASE_URL } from "./e2e/server";

// The dev server is started and torn down by e2e/global-setup.ts /
// global-teardown.ts on a per-checkout port (see e2e/server.ts) rather than by a
// `webServer` block: `astro dev` daemonizes, which Playwright's launcher misreads
// as an early exit, and a shared 4321 can be a frozen or foreign-code server.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
