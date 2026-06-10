import { test, expect } from "@playwright/test";

/**
 * Placeholder smoke spec so the Playwright harness has something to run. The full
 * spine test is authored in F4/integration. Skipped by default to keep CI fast
 * and avoid requiring a running server during the F0 scaffold.
 */
test.describe("smoke", () => {
  test.skip("home renders and /api/health is 200", async ({ page, request }) => {
    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "CertPrep" })).toBeVisible();
  });
});
