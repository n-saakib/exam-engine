/**
 * CertPrep E2E spine test — the one browser-level guard for the core journey.
 *
 * Journey: Home → select domain → start exam → answer/flag/commit →
 *          pause → resume → submit → results (filter) → retake incorrect →
 *          history stats updated.
 *
 * Note on the per-question button: there is no separate "reveal" action
 * anymore. Committing an answer (≥1 selected) or giving up (0 selected)
 * both surface the explanation immediately. The dialog text for the
 * 0-selected branch is "Give up on this question?" (not "Reveal the
 * answer?"). data-testid="revealed-detail" is preserved on the visible
 * explanation panel so e2e selectors remain stable.
 *
 * Design principles:
 *  - One test, sequential steps — the entire spine in one `test()` so a
 *    mid-flow break is immediately visible in CI.
 *  - Web-first assertions only (`expect(locator).toBeVisible()` etc.). No
 *    `waitForTimeout` / arbitrary sleeps; Playwright auto-waits.
 *  - Stable selectors: role/label/text preferred; `data-testid` used sparingly
 *    for elements that have them (question-text, option-list, question-navigator,
 *    revealed-detail, leaf-panel already exist on key elements). The
 *    `revealed-detail` testid is kept for selector stability even though
 *    the underlying concept ("the question's answer is now visible") is no
 *    longer called "reveal" in product copy.
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

      // The leaf summary (role=status) should show set count info. There may
      // be multiple role=status elements inside the leaf panel (e.g. a "you
      // have a paused exam" notice left over from a previous spec run that
      // didn't clean up its in-progress session), so filter for the one
      // showing the sets/remaining text.
      const leafStatus = leafPanel.getByRole("status").filter({ hasText: /set/i });
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

      // With 0 selected the per-question button is labeled "Give up".
      // Clicking it opens a confirm dialog ("Give up on this question?")
      // because giving up with no interaction is a deliberate action.
      const giveUpButton = page.getByRole("button", { name: /^Give up$/i });
      await expect(giveUpButton).toBeVisible();
      await giveUpButton.click();

      // A dialog asks to confirm giving up.
      const giveUpDialog = page.getByRole("dialog");
      await expect(giveUpDialog).toBeVisible({ timeout: 5_000 });
      await expect(giveUpDialog).toContainText(/Give up on this question/i);
      // Confirm the give-up.
      const giveUpConfirmBtn = giveUpDialog.getByRole("button", { name: /^Give up$/i });
      await expect(giveUpConfirmBtn).toBeVisible();
      await giveUpConfirmBtn.click();

      // After giving up, the explanation panel becomes visible immediately.
      // data-testid="revealed-detail" is preserved on the panel for selector
      // stability (the component was renamed internally but kept the testid).
      const revealedDetail = page.getByTestId("revealed-detail");
      await expect(revealedDetail).toBeVisible({ timeout: 10_000 });
      await expect(revealedDetail).toContainText(/Correct answer:/i);

      // The button now reflects the committed state — "Submitted", disabled.
      await expect(page.getByRole("button", { name: /^Submitted$/i })).toBeVisible();

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

      // Q3 was the "current" question at pause time, so on resume it has
      // status="current" in the palette (the highest-priority swatch). To
      // assert the gave-up state cleanly, navigate to a different question
      // first — then the swatch collapses to its derived state.
      // Use a strict end-anchor to avoid matching "Question 10".
      const navQ1 = navigator.getByRole("button", { name: /^Question 1(,|$)/i });
      await expect(navQ1).toBeVisible();
      await navQ1.click();
      await expect(questionText).toContainText(/Q1\./);

      // Q3's navigator button should now carry "gave up" in its aria-label
      // and data-status="gave_up" — the gave-up state is a first-class
      // outcome (alongside correct and incorrect), surfaced in the live
      // palette and persisted to the DB as is_gave_up. There is no
      // "revealed" status anymore.
      const navQ3 = navigator.getByRole("button", { name: /Question 3/i });
      await expect(navQ3).toBeVisible();
      const navQ3Label = await navQ3.getAttribute("aria-label");
      expect(navQ3Label).toMatch(/gave up/i);
      // data-status is the source of truth for the swatch colour and is one
      // of the 7 NavStatus values. The user gave up on Q3 with no selection,
      // so the status should be "gave_up".
      await expect(navQ3).toHaveAttribute("data-status", "gave_up");

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

      // Four-way breakdown is present (Correct / Incorrect / Gave up / Flagged).
      const breakdown = scoreSummary.getByLabel("Question breakdown");
      await expect(breakdown).toBeVisible();
      // Use exact: true to avoid "Correct" matching "Incorrect" substring
      await expect(breakdown.getByText("Correct", { exact: true })).toBeVisible();
      await expect(breakdown.getByText("Incorrect", { exact: true })).toBeVisible();
      await expect(breakdown.getByText("Gave up", { exact: true })).toBeVisible();
      await expect(breakdown.getByText("Flagged", { exact: true })).toBeVisible();

      // ── Step 16: Per-question detail is shown ───────────────────────────────
      const reviewSection = page.getByLabel("Detailed question review");
      await expect(reviewSection).toBeVisible();

      // "Question review" heading
      await expect(page.getByRole("heading", { name: /Question review/i })).toBeVisible();

      // The filter bar (tablist) is visible with All / Correct / Incorrect /
      // Gave up / Flagged — the post-submit outcome set is now {correct,
      // incorrect, gave_up}, so "Correct" is a first-class filter alongside
      // "Incorrect" and "Gave up".
      const filterBar = page.getByRole("tablist", { name: /Filter questions by outcome/i });
      await expect(filterBar).toBeVisible();

      // ── Step 17: Filter by "Gave up" — the gave-up question (Q3) shows ──────
      // Q3 was a give-up, so it must appear under its own "Gave up" filter.
      const gaveUpFilterBtn = filterBar.getByRole("tab", { name: /Gave up/i });
      await expect(gaveUpFilterBtn).toBeVisible();
      await gaveUpFilterBtn.click();
      await expect(gaveUpFilterBtn).toHaveAttribute("aria-selected", "true");

      // After filtering with "Gave up", the review list should still contain
      // at least one card (we gave up Q3): assert the section isn't the empty state.
      await expect(reviewSection).not.toContainText(/no questions/i, { timeout: 5_000 });

      // Reset filter to "All"
      await filterBar.getByRole("tab", { name: /^All/i }).click();

      // ── Step 18: Retake incorrect → new /exam/:id ───────────────────────────
      const actionsSection = page.getByLabel("Session actions");
      await expect(actionsSection).toBeVisible();

      // "Retake incorrect only" button — may be disabled if all correct; check either way.
      // We answered Q1 (possibly correct) + Q2 (flagged + answered) + Q3 (gave up) +
      // Q4–Q10 (unanswered = incorrect). There will be incorrect+gave-up >= 1.
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
        // (only incorrect + gave-up questions are included; correct answers are
        // not re-included regardless of whether they were committed in-exam).
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
