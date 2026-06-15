import { test, expect } from "@playwright/test";

/**
 * Smoke spec — exercises the two most critical user-visible surfaces so a
 * failed build / broken server is caught at PR time:
 *
 *   1. The health probe returns 200 (the Next.js route handler is wired up).
 *   2. The home page renders the "CertPrep" heading (the App Router root
 *      renders without throwing).
 *
 * The Playwright config (`playwright.config.ts`) boots `next start` on :3001
 * with a fresh temp DB and the real `Exams/` corpus via the `webServer` block,
 * so this spec is self-contained — run `npm run build` first, then
 * `npm run test:e2e`.
 */
test.describe("smoke", () => {
  test("home renders and /api/health is 200", async ({ page, request }) => {
    // 1. Health probe — must be 200 with the literal "ok" status payload.
    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();
    expect(health.status()).toBe(200);
    const body = await health.json();
    expect(body).toMatchObject({ status: "ok" });
    expect(typeof body.version).toBe("string");
    expect(typeof body.setsIndexed).toBe("number");

    // 2. Home page renders the CertPrep heading.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "CertPrep" })).toBeVisible();
  });
});
