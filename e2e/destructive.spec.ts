/**
 * CertPrep E2E destructive-ops test.
 *
 * Documents the cross-module "destructive reset" guard (HIGH-5):
 *   1. POST /api/progress/reset with `{ scope: "all" }` (no `confirm: true`)
 *      must be REJECTED — the user's history must be preserved.
 *   2. After providing `confirm: true`, the same payload is accepted and
 *      the history is cleared.
 *
 * These are direct API tests using Playwright's `request` fixture against the
 * running Next.js server (boot by playwright.config.ts). UI flows for the
 * destructive ops are out of scope here — the test is purely a guard that
 * the API enforces the confirm-before-destructive contract.
 *
 * Environment: `webServer` in playwright.config.ts boots `next start` on :3001
 * with a fresh temp SQLite DB and EXAMS_ROOT pointing at the repo's Exams/.
 * Run `npm run build` first, then `npm run test:e2e`.
 */

import { test, expect } from "@playwright/test";

test.describe("destructive reset", () => {
  test("POST /api/progress/reset {scope: 'all'} without confirm:true is rejected and history is preserved", async ({
    request,
  }) => {
    // ── 1. Health check + create some history first ───────────────────────────
    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();

    // Create a session + submit it so the DB has at least one completed row.
    const create = await request.post("/api/sessions", {
      data: {
        quesPath: "Exams/Cloud/AWS/Solutions-Architect-Associate/Easy",
        options: { seed: "destructive-test" },
      },
    });
    expect(create.ok()).toBeTruthy();
    const session = (await create.json()) as { id: string };

    // Answer one question (any answer is fine — the goal is just to have a
    // completed row in the DB, not to test scoring).
    await request.patch(`/api/sessions/${session.id}`, {
      data: { answer: { questionId: 1, selected: ["A"] } },
    });

    // Submit so it becomes "completed" and counts toward history.
    const submit = await request.post(`/api/sessions/${session.id}/submit`, {
      data: {},
    });
    expect(submit.ok()).toBeTruthy();

    // Sanity: history now has at least 1 entry.
    const histBefore = await request.get("/api/history");
    expect(histBefore.ok()).toBeTruthy();
    const before = (await histBefore.json()) as { items: unknown[]; total: number };
    expect(before.total).toBeGreaterThanOrEqual(1);

    // ── 2. Attempt destructive reset WITHOUT confirm: true → must be rejected ─
    const resetRes = await request.post("/api/progress/reset", {
      data: { scope: "all" },
    });
    // HIGH-5 contract: the route must REJECT (400) destructive scopes without
    // explicit `confirm: true`. This is a strict assertion — a regression that
    // silently accepts the request (even if it does nothing destructive) fails
    // this test, which is the whole point.
    expect(resetRes.ok()).toBeFalsy();
    expect(resetRes.status()).toBe(400);
    const histAfter = await request.get("/api/history");
    const after = (await histAfter.json()) as { total: number };
    expect(after.total).toBe(before.total);
  });

  test("POST /api/progress/reset {scope: 'all', confirm: true} clears history", async ({
    request,
  }) => {
    // ── 1. Health check + seed history ───────────────────────────────────────
    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();

    const create = await request.post("/api/sessions", {
      data: {
        quesPath: "Exams/Cloud/AWS/Solutions-Architect-Associate/Easy",
        options: { seed: "destructive-confirm" },
      },
    });
    expect(create.ok()).toBeTruthy();
    const session = (await create.json()) as { id: string };
    await request.patch(`/api/sessions/${session.id}`, {
      data: { answer: { questionId: 1, selected: ["A"] } },
    });
    const submit = await request.post(`/api/sessions/${session.id}/submit`, {
      data: {},
    });
    expect(submit.ok()).toBeTruthy();

    const histBefore = await request.get("/api/history");
    const before = (await histBefore.json()) as { total: number };
    expect(before.total).toBeGreaterThanOrEqual(1);

    // ── 2. Reset WITH confirm: true → must be accepted, history cleared ─────
    const resetRes = await request.post("/api/progress/reset", {
      data: { scope: "all", confirm: true },
    });
    expect(resetRes.ok()).toBeTruthy();

    const histAfter = await request.get("/api/history");
    const after = (await histAfter.json()) as { total: number };
    expect(after.total).toBe(0);
  });
});
