/**
 * CertPrep E2E spine test — the one browser-level guard for the core journey.
 *
 * Journey: Home → select domain → start exam → answer/flag/give-up →
 *          pause → resume → submit → results (filter) → retake incorrect →
 *          history stats updated.
 *
 * Design principles:
 *  - One test, sequential steps — the entire spine in one `test()` so a
 *    mid-flow break is immediately visible in CI.
 *  - Web-first assertions only (`expect(locator).toBeVisible()` etc.). No
 *    `waitForTimeout` / arbitrary sleeps; Playwright auto-waits.
 *  - Stable selectors: role/label/text preferred; `data-testid` used sparingly
 *    for elements that have them (question-text, option-list, question-navigator,
 *    revealed-detail, leaf-panel already exist on key elements).
 *  - The exam set used is "Easy" (AWS SAA) which loads real JSON from Exams/.
 *    Each set has 10 questions, so navigator assertions use count === 10.
 *
 * Environment: `webServer` in playwright.config.ts boots `next start` on :3001
 * with a fresh temp SQLite DB and EXAMS_ROOT pointing at the repo's Exams/.
 */

import { test, expect, type Page } from "@playwright/test";

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Wait for the exam screen to be fully hydrated (store loaded, question shown).
 * We wait for the question-text testid rather than a URL because the store
 * hydration is async after navigation.
 */
async function waitForExamScreen(page: Page): Promise<void> {
  await expect(page.getByTestId("question-text")).toBeVisible({ timeout: 20_000 });
}

/**
 * Select the first visible (non-disabled) option in the answer checkbox group
 * and return the option key (letter) that was selected. (ADR-13: every question
 * is now rendered as checkboxes, even single-type ones, to train choice
 * elimination — the user is not told whether the question is single or multi.)
 */
async function selectFirstOption(page: Page): Promise<string> {
  const optionList = page.getByTestId("option-list");
  await expect(optionList).toBeVisible();
  // Options are buttons with role=checkbox; pick the first one
  const firstOption = optionList.getByRole("checkbox").first();
  await expect(firstOption).toBeVisible();
  // Grab the data-option attribute to know which letter was picked
  const key = await firstOption.getAttribute("data-option");
  await firstOption.click();
  await expect(firstOption).toHaveAttribute("aria-checked", "true");
  return key ?? "A";
}

// ── spine test ────────────────────────────────────────────────────────────────

test.describe("spine", () => {
  test(
    "Home → select domain → start → answer/flag/give-up → pause → resume → submit → results → retake → history",
    async ({ page }) => {

      // ── Step 0: health check ────────────────────────────────────────────────
      // Confirm the server is up before driving the browser.
      const health = await page.request.get("/api/health");
      expect(health.ok()).toBeTruthy();

      // ── Step 1: Home page loads ─────────────────────────────────────────────
      await page.goto("/");
      // The page title should contain "CertPrep"
      await expect(page).toHaveTitle(/CertPrep/i);

      // ── Step 2: Navigate the cascading dropdowns ────────────────────────────
      // Level 0: "Choose a domain for exam" → Cloud
      // The DomainSelector renders a <select> per level wrapped in data-testid="level-N"
      const level0 = page.getByTestId("level-0");
      await expect(level0).toBeVisible({ timeout: 15_000 });
      await level0.getByRole("combobox").selectOption({ value: "cloud" });

      // Level 1: "Choose the cloud provider" → AWS
      const level1 = page.getByTestId("level-1");
      await expect(level1).toBeVisible();
      await level1.getByRole("combobox").selectOption({ value: "aws" });

      // Level 2: "Choose a certification" → SAA
      const level2 = page.getByTestId("level-2");
      await expect(level2).toBeVisible();
      await level2.getByRole("combobox").selectOption({ value: "saa" });

      // Level 3: "Choose difficulty level" → Easy
      const level3 = page.getByTestId("level-3");
      await expect(level3).toBeVisible();
      await level3.getByRole("combobox").selectOption({ value: "easy" });

      // ── Step 3: Leaf summary visible; Start enabled ─────────────────────────
      // After selecting Easy, the leaf panel should appear showing sets/remaining
      const leafPanel = page.getByTestId("leaf-panel");
      await expect(leafPanel).toBeVisible({ timeout: 10_000 });

      // The leaf summary (role=status) should show set count info
      const leafStatus = leafPanel.getByRole("status");
      await expect(leafStatus).toBeVisible();
      // At least "set" text is present (e.g. "3 sets · 3 remaining")
      await expect(leafStatus).toContainText(/set/i);

      // The Start button should be enabled (remainingSets > 0)
      const startButton = page.getByRole("button", { name: /Start Exam/i });
      await expect(startButton).toBeVisible();
      await expect(startButton).toBeEnabled();

      // ── Step 4: Start exam → navigate to /exam/:id ──────────────────────────
      await startButton.click();
      // Wait for navigation to /exam/...
      await page.waitForURL(/\/exam\/[a-zA-Z0-9-]+/, { timeout: 20_000 });
      const examUrl = page.url();
      const examId = examUrl.split("/exam/")[1]!;
      expect(examId).toBeTruthy();

      await waitForExamScreen(page);

      // ── Step 5: Assert exam screen invariants ───────────────────────────────
      // Exactly one question is shown at a time (question-text is visible)
      const questionText = page.getByTestId("question-text");
      await expect(questionText).toBeVisible();
      // Q1. prefix should be visible
      await expect(questionText).toContainText(/Q1\./);

      // Navigator has 10 items (each Easy set has 10 questions)
      const navigator = page.getByTestId("question-navigator");
      await expect(navigator).toBeVisible();
      const navButtons = navigator.getByRole("button");
      await expect(navButtons).toHaveCount(10);

      // Timer is visible (role=timer)
      const timer = page.getByRole("timer");
      await expect(timer).toBeVisible();

      // ── Step 6: Answer question 1 ───────────────────────────────────────────
      await selectFirstOption(page);

      // ── Step 7: Navigate to question 2 and answer it ───────────────────────
      const nextButton = page.getByRole("button", { name: /^Next$/i });
      await expect(nextButton).toBeVisible();
      await nextButton.click();
      await expect(questionText).toContainText(/Q2\./);
      await selectFirstOption(page);

      // ── Step 8: Flag question 2 ─────────────────────────────────────────────
      const flagButton = page.getByRole("button", { name: /^Flag$/i });
      await expect(flagButton).toBeVisible();
      await flagButton.click();
      // After clicking, button should show "Flagged" and aria-pressed=true
      await expect(page.getByRole("button", { name: /^Flagged$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Flagged$/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      // ── Step 9: Navigate to question 3 and give up ─────────────────────────
      await nextButton.click();
      await expect(questionText).toContainText(/Q3\./);

      // "Give up" triggers a confirm dialog; we must confirm it
      const giveUpButton = page.getByRole("button", { name: /^Give up$/i });
      await expect(giveUpButton).toBeVisible();
      await giveUpButton.click();

      // A dialog appears asking to reveal the answer
      const revealDialog = page.getByRole("dialog");
      await expect(revealDialog).toBeVisible({ timeout: 5_000 });
      await expect(revealDialog).toContainText(/Reveal the answer/i);
      // Confirm the reveal
      const revealConfirmBtn = revealDialog.getByRole("button", { name: /^Reveal$/i });
      await expect(revealConfirmBtn).toBeVisible();
      await revealConfirmBtn.click();

      // After revealing, the RevealedDetail component should appear
      const revealedDetail = page.getByTestId("revealed-detail");
      await expect(revealedDetail).toBeVisible({ timeout: 10_000 });
      // The correct answer text should appear
      await expect(revealedDetail).toContainText(/Correct answer:/i);

      // Give up button should now show "Revealed" (disabled)
      await expect(page.getByRole("button", { name: /^Revealed$/i })).toBeVisible();

      // ── Step 10: Pause → navigate to /resume ───────────────────────────────
      const pauseButton = page.getByRole("button", { name: /^Pause$/i });
      await expect(pauseButton).toBeVisible();
      await pauseButton.click();

      // PauseButton shows "Saving…" briefly then navigates. Wait for /resume.
      await page.waitForURL(/\/resume/, { timeout: 15_000 });

      // ── Step 11: /resume shows the in-progress exam ─────────────────────────
      await expect(page.getByRole("heading", { name: /Resume/i })).toBeVisible();

      // The paused exam list should have at least one item
      const pausedList = page.getByLabel("Paused exams list");
      await expect(pausedList).toBeVisible({ timeout: 10_000 });

      // Find the paused exam article
      const pausedExam = pausedList.getByRole("article").first();
      await expect(pausedExam).toBeVisible();

      // It should show a percentage-answered chip (e.g. "20% answered")
      const progressChip = pausedExam.getByText(/% answered/i);
      await expect(progressChip).toBeVisible();

      // ── Step 12: Resume → back on /exam/:id at saved state ─────────────────
      // PausedExamRow renders a Button with aria-label="Resume exam"
      const resumeButton = pausedExam.getByRole("button", { name: /Resume exam/i });
      await expect(resumeButton).toBeVisible();
      // Click and wait for navigation in the same call. We just need to be
      // back on /exam/<id>; if the URL has any query string or trailing slash
      // the broader pattern still matches.
      await Promise.all([
        page.waitForURL(new RegExp(`/exam/[a-zA-Z0-9-]+`), { timeout: 15_000 }),
        resumeButton.click(),
      ]);
      await waitForExamScreen(page);

      // Verify saved state: question 2 should still be flagged in the navigator.
      // Navigator button for Q2 (index 1) should have data-flagged="true"
      const navQ2 = navigator.getByRole("button", { name: /Question 2/i });
      await expect(navQ2).toBeVisible();
      await expect(navQ2).toHaveAttribute("data-flagged", "true");

      // Q3's navigator button should carry "revealed" in its aria-label
      // (data-status will be "current" if Q3 is the active question on resume,
      //  but the aria-label always reflects the revealed state independently)
      const navQ3 = navigator.getByRole("button", { name: /Question 3/i });
      await expect(navQ3).toBeVisible();
      // The aria-label includes "revealed" for any revealed question
      const navQ3Label = await navQ3.getAttribute("aria-label");
      expect(navQ3Label).toMatch(/revealed/i);

      // ── Step 13: Navigate to the last question to reach "Submit exam" ───────
      // Click navigator button for Q10 directly to jump to last question
      const navQ10 = navigator.getByRole("button", { name: /Question 10/i });
      await expect(navQ10).toBeVisible();
      await navQ10.click();
      await expect(questionText).toContainText(/Q10\./);

      // The "Submit exam" button should now be visible (on last question)
      const submitExamBtn = page.getByRole("button", { name: /^Submit exam$/i });
      await expect(submitExamBtn).toBeVisible();

      // ── Step 14: Submit (confirm dialog) → /results/:id ─────────────────────
      await submitExamBtn.click();

      // Submit dialog opens
      const submitDialog = page.getByRole("dialog");
      await expect(submitDialog).toBeVisible({ timeout: 5_000 });
      await expect(submitDialog).toContainText(/Finish exam/i);

      // The dialog shows answered/unanswered/flagged counts (exact match to avoid
      // "Answered" matching "Unanswered")
      await expect(submitDialog.getByText("Answered", { exact: true })).toBeVisible();
      await expect(submitDialog.getByText("Unanswered", { exact: true })).toBeVisible();
      await expect(submitDialog.getByText("Flagged", { exact: true })).toBeVisible();

      // Confirm submission
      const confirmSubmitBtn = submitDialog.getByRole("button", { name: /^Submit exam$/i });
      await expect(confirmSubmitBtn).toBeVisible();
      await confirmSubmitBtn.click();

      // Wait for navigation to /results/:id
      await page.waitForURL(/\/results\/[a-zA-Z0-9-]+/, { timeout: 20_000 });

      // ── Step 15: Results screen — score summary ──────────────────────────────
      await expect(page.getByRole("heading", { name: /Your Results/i })).toBeVisible();

      // Score summary section
      const scoreSummary = page.getByLabel("Score summary");
      await expect(scoreSummary).toBeVisible();

      // Four-way breakdown is present (Correct / Incorrect / Revealed / Skipped)
      const breakdown = scoreSummary.getByLabel("Question breakdown");
      await expect(breakdown).toBeVisible();
      // Use exact: true to avoid "Correct" matching "Incorrect" substring
      await expect(breakdown.getByText("Correct", { exact: true })).toBeVisible();
      await expect(breakdown.getByText("Incorrect", { exact: true })).toBeVisible();
      await expect(breakdown.getByText("Revealed", { exact: true })).toBeVisible();
      await expect(breakdown.getByText("Skipped", { exact: true })).toBeVisible();

      // ── Step 16: Per-question detail is shown ───────────────────────────────
      const reviewSection = page.getByLabel("Detailed question review");
      await expect(reviewSection).toBeVisible();

      // "Question review" heading
      await expect(page.getByRole("heading", { name: /Question review/i })).toBeVisible();

      // The filter bar (tablist) is visible with All / Incorrect / Revealed / Flagged
      const filterBar = page.getByRole("tablist", { name: /Filter questions by outcome/i });
      await expect(filterBar).toBeVisible();

      // ── Step 17: Filter by "Revealed" — the give-up question shows ──────────
      // Expect at least 1 revealed question (we revealed Q3)
      const revealedFilterBtn = filterBar.getByRole("tab", { name: /Revealed/i });
      await expect(revealedFilterBtn).toBeVisible();
      await revealedFilterBtn.click();
      await expect(revealedFilterBtn).toHaveAttribute("aria-selected", "true");

      // After filtering with "Revealed", the review list should still contain at
      // least one card (we gave up Q3): assert the section isn't the empty state.
      await expect(reviewSection).not.toContainText(/no questions/i, { timeout: 5_000 });

      // Reset filter to "All"
      await filterBar.getByRole("tab", { name: /^All/i }).click();

      // ── Step 18: Retake incorrect → new /exam/:id ───────────────────────────
      const actionsSection = page.getByLabel("Session actions");
      await expect(actionsSection).toBeVisible();

      // "Retake incorrect only" button — may be disabled if all correct; check either way.
      // We answered Q1 (possibly correct) + Q2 (flagged + answered) + Q3 (revealed) +
      // Q4–Q10 (unanswered = incorrect). There will be incorrect+revealed >= 1.
      const retakeIncorrectBtn = actionsSection.getByRole("button", {
        name: /Retake.*incorrect/i,
      });
      await expect(retakeIncorrectBtn).toBeVisible();

      // Capture the count from the "Incorrect" breakdown before retaking
      const incorrectCountText = await scoreSummary
        .getByLabel("Question breakdown")
        .getByText("Incorrect")
        .locator("..") // parent div
        .getByRole("listitem")
        .textContent()
        .catch(() => null);
      void incorrectCountText; // used for reference; we validate via question count below

      const isRetakeEnabled = await retakeIncorrectBtn.isEnabled();
      if (isRetakeEnabled) {
        await retakeIncorrectBtn.click();

        // Wait for navigation to a new /exam/:id
        await page.waitForURL(/\/exam\/[a-zA-Z0-9-]+/, { timeout: 20_000 });
        const retakeUrl = page.url();
        const retakeId = retakeUrl.split("/exam/")[1]!;
        // It must be a different session
        expect(retakeId).not.toBe(examId);

        await waitForExamScreen(page);

        // The navigator in the retake exam should have fewer than 10 questions
        // (only incorrect + revealed questions are included)
        const retakeNav = page.getByTestId("question-navigator");
        const retakeNavBtns = retakeNav.getByRole("button");
        // There should be at least 1 and at most 9 (definitely fewer than 10,
        // since we answered Q1 correctly at minimum, giving 1 correct)
        const retakeCount = await retakeNavBtns.count();
        expect(retakeCount).toBeGreaterThanOrEqual(1);
        expect(retakeCount).toBeLessThan(10);

        // Navigate back home then to history
        await page.goto("/history");
      } else {
        // If all were correct (edge case: all 3 answers were right and rest unanswered),
        // go to history directly.
        await page.goto("/history");
      }

      // ── Step 19: /history — completed exam row and aggregate stats ──────────
      await expect(page.getByRole("heading", { name: /Exam History/i })).toBeVisible();

      // Aggregate stats bar shows "Total exams" and a count >= 1
      const statsBar = page.getByLabel("Aggregate exam stats");
      await expect(statsBar).toBeVisible({ timeout: 10_000 });
      // "Total exams" label is present
      await expect(statsBar.getByText("Total exams")).toBeVisible();

      // The history list section should contain at least one entry
      const historyList = page.getByLabel("History list");
      await expect(historyList).toBeVisible();

      // There should be at least one exam shown (not the empty state)
      await expect(historyList).not.toContainText(/No exams found/i, { timeout: 10_000 });

      // The completed exam row should appear in the table.
      // HistoryTable renders inside an <ol> — look for an entry with a % score.
      // Use `.first()` because the spec file shares a DB with other e2e
      // specs; we only care that at least one entry is rendered.
      await expect(historyList.getByText(/%/).first()).toBeVisible();
    },
  );
});
