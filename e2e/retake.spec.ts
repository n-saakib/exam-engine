/**
 * CertPrep E2E retake test.
 *
 * Documents the cross-module retake-incorrect flow:
 *   1. Open home, navigate to an Easy set, start exam.
 *   2. Answer two questions incorrectly (q1 → A, q2 → A).
 *      - The real Easy set has q1 correct=B ("What does IAM stand for?") and
 *        q2 correct=C ("Which IAM entity..."), so picking "A" for both is
 *        deterministically wrong.
 *   3. Submit the exam.
 *   4. On the results page, click "Retake incorrect only".
 *   5. Verify the new exam has exactly 2 questions, and that they match the
 *      two wrong questions from the original (q1 and q2).
 *
 * Environment: `webServer` in playwright.config.ts boots `next start` on :3001
 * with a fresh temp SQLite DB and EXAMS_ROOT pointing at the repo's Exams/.
 * Run `npm run build` first, then `npm run test:e2e`.
 */

import { test, expect } from "@playwright/test";

import { waitForExamScreen, selectOptionByKey } from "./helpers";

test.describe("retake", () => {
  test("retake-incorrect only includes the wrong questions from the original", async ({
    page,
  }) => {
    // ── Step 0: health check ──────────────────────────────────────────────────
    const health = await page.request.get("/api/health");
    expect(health.ok()).toBeTruthy();

    // ── Step 1: Home page + navigate cascading dropdowns → Easy ───────────────
    await page.goto("/");
    await expect(page).toHaveTitle(/CertPrep/i);

    const level0 = page.getByTestId("level-0");
    await expect(level0).toBeVisible({ timeout: 15_000 });
    await level0.getByRole("combobox").selectOption({ value: "cloud" });

    const level1 = page.getByTestId("level-1");
    await expect(level1).toBeVisible();
    await level1.getByRole("combobox").selectOption({ value: "aws" });

    const level2 = page.getByTestId("level-2");
    await expect(level2).toBeVisible();
    await level2.getByRole("combobox").selectOption({ value: "saa" });

    const level3 = page.getByTestId("level-3");
    await expect(level3).toBeVisible();
    await level3.getByRole("combobox").selectOption({ value: "easy" });

    // ── Step 2: Start the exam ───────────────────────────────────────────────
    const leafPanel = page.getByTestId("leaf-panel");
    await expect(leafPanel).toBeVisible({ timeout: 10_000 });

    const startButton = page.getByRole("button", { name: /Start Exam/i });
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();
    await startButton.click();

    await page.waitForURL(/\/exam\/[a-zA-Z0-9-]+/, { timeout: 20_000 });
    const examUrl = page.url();
    const examId = examUrl.split("/exam/")[1]!;
    expect(examId).toBeTruthy();

    await waitForExamScreen(page);

    // ── Step 3: Capture the question-text of Q1 and Q2 (to verify later) ────
    const questionText = page.getByTestId("question-text");
    await expect(questionText).toBeVisible();
    await expect(questionText).toContainText(/Q1\./);
    const q1Text = (await questionText.textContent())?.trim() ?? "";

    // ── Step 4: Answer Q1 INCORRECTLY (pick A — correct answer is B for the
    //   first IAM question, so A is guaranteed wrong) ────────────────────────
    await selectOptionByKey(page, "A");

    // ── Step 5: Move to Q2 and answer INCORRECTLY (A — correct is C) ─────────
    const nextButton = page.getByRole("button", { name: /^Next$/i });
    await expect(nextButton).toBeVisible();
    await nextButton.click();
    await expect(questionText).toContainText(/Q2\./);
    const q2Text = (await questionText.textContent())?.trim() ?? "";
    await selectOptionByKey(page, "A");

    // ── Step 6: Jump to the last question via the navigator and submit ───────
    const navigator = page.getByTestId("question-navigator");
    await expect(navigator).toBeVisible();
    const navQ10 = navigator.getByRole("button", { name: /Question 10/i });
    await expect(navQ10).toBeVisible();
    await navQ10.click();
    await expect(questionText).toContainText(/Q10\./);

    const submitExamBtn = page.getByRole("button", { name: /^Submit exam$/i });
    await expect(submitExamBtn).toBeVisible();
    await submitExamBtn.click();

    // Confirm the submit dialog.
    const submitDialog = page.getByRole("dialog");
    await expect(submitDialog).toBeVisible({ timeout: 5_000 });
    const confirmSubmitBtn = submitDialog.getByRole("button", { name: /^Submit exam$/i });
    await expect(confirmSubmitBtn).toBeVisible();
    await confirmSubmitBtn.click();

    // Wait for the results page.
    await page.waitForURL(/\/results\/[a-zA-Z0-9-]+/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Your Results/i })).toBeVisible();

    // ── Step 7: Click "Retake incorrect only" ────────────────────────────────
    const actionsSection = page.getByLabel("Session actions");
    await expect(actionsSection).toBeVisible();

    const retakeIncorrectBtn = actionsSection.getByRole("button", {
      name: /Retake.*incorrect/i,
    });
    await expect(retakeIncorrectBtn).toBeVisible();
    await retakeIncorrectBtn.click();

    // Wait for navigation to a new /exam/:id (the retake).
    await page.waitForURL(/\/exam\/[a-zA-Z0-9-]+/, { timeout: 20_000 });
    const retakeUrl = page.url();
    const retakeId = retakeUrl.split("/exam/")[1]!;
    expect(retakeId).not.toBe(examId);

    await waitForExamScreen(page);

    // ── Step 8: Verify the retake has exactly 2 questions and they match q1+q2 ──
    const retakeNavigator = page.getByTestId("question-navigator");
    await expect(retakeNavigator).toBeVisible();
    const retakeNavButtons = retakeNavigator.getByRole("button");
    // Exactly 2 questions in the retake (the two wrong ones).
    await expect(retakeNavButtons).toHaveCount(2);

    // Both retake questions should be the ones we answered wrong.
    // Walk through the navigator and collect each question-text.
    const retakeQuestion1 = page.getByTestId("question-text");
    const retakeQ1Text = (await retakeQuestion1.textContent())?.trim() ?? "";

    // The first retake question text should match (a substring of) Q1's text.
    // We strip the "Q1." / "Q1 of 10 " prefix because the retake renumbers.
    expect(stripQPrefix(retakeQ1Text)).toBe(stripQPrefix(q1Text));

    // Move to retake Q2 and verify it matches the original Q2.
    const retakeNext = page.getByRole("button", { name: /^Next$/i });
    if (await retakeNext.isVisible().catch(() => false)) {
      await retakeNext.click();
      const retakeQ2Text = (await retakeQuestion1.textContent())?.trim() ?? "";
      expect(stripQPrefix(retakeQ2Text)).toBe(stripQPrefix(q2Text));
    }

    // ── Cleanup: discard the retake session ─────────────────────────────────
    // Without this the retake leaves an in-progress session in the DB, which
    // gates the Start Exam button on the home page (`gatedByResume` rule).
    // Subsequent spec files (e.g. the spine) would then fail at the Start
    // Exam step because the button is replaced with "Continue in Resume".
    // DELETE /api/sessions/:id is a direct API call (no UI dependency).
    await page.request.delete(`/api/sessions/${retakeId}`);
  });
});

/**
 * Strip a leading "Q1." / "Q1 of 10 " / similar prefix from a question text
 * so we can compare question bodies across the original and retake exams (the
 * retake renumbers its questions, so the "Q1" prefix changes).
 */
function stripQPrefix(text: string): string {
  return text.replace(/^Q\d+(?:\s*of\s*\d+)?\s*\.?\s*/i, "").trim();
}
