import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config stub (F0). The spine E2E test (select → start → answer/flag/
 * give-up → pause → resume → submit → results → retake-incorrect) is authored in
 * F4/integration. `webServer` boots `next start` on :3000 so a future spec can
 * run against the real app; for now `e2e/` holds only a smoke placeholder.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
