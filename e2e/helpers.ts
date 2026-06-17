/**
 * E2E test helpers — small, focused Playwright primitives that the spine test
 * (and any future e2e specs) can share. The helpers are intentionally narrow:
 *
 *   - `waitForExamScreen` — wait for the exam screen to be fully hydrated
 *     (store loaded, the first question text is on the page).
 *   - `selectFirstOption` — click the first enabled option in the answer
 *     checkbox group and return the option key (A, B, C, D) that was picked.
 *     Works for both `single` and `multi` question types (ADR-13 renders
 *     every question as checkboxes).
 */

import { expect, type Page } from "@playwright/test";

/**
 * Wait for the exam screen to be fully hydrated (store loaded, question shown).
 * We wait for the question-text testid rather than a URL because the store
 * hydration is async after navigation.
 */
export async function waitForExamScreen(page: Page): Promise<void> {
  await expect(page.getByTestId("question-text")).toBeVisible({ timeout: 20_000 });
}

/**
 * Select the first visible (non-disabled) option in the answer checkbox group
 * and return the option key (letter) that was selected. (ADR-13: every question
 * is now rendered as checkboxes, even single-type ones, to train choice
 * elimination — the user is not told whether the question is single or multi.)
 */
export async function selectFirstOption(page: Page): Promise<string> {
  const optionList = page.getByTestId("option-list");
  await expect(optionList).toBeVisible();
  // Options are buttons with role=checkbox; pick the first one.
  const firstOption = optionList.getByRole("checkbox").first();
  await expect(firstOption).toBeVisible();
  // Grab the data-option attribute to know which letter was picked.
  const key = await firstOption.getAttribute("data-option");
  await firstOption.click();
  await expect(firstOption).toHaveAttribute("aria-checked", "true");
  return key ?? "A";
}

/**
 * Click the option whose `data-option` attribute equals the given underlying
 * key (e.g. "A", "B", "C", "D"). Use this when the test wants to drive the
 * underlying selection regardless of the chip label the user sees — e.g. when
 * asserting on a specific underlying key in test fixtures.
 *
 * Note: chips are rendered in fixed A, B, C, D order (ADR-15) and the chip's
 * `data-label` attribute is the visible label, while `data-option` is the
 * underlying key the snapshot maps to that display position. To click the
 * chip the user sees as "A" (regardless of underlying shuffle), use
 * `selectOptionByLabel` instead.
 */
export async function selectOptionByKey(page: Page, key: string): Promise<void> {
  const optionList = page.getByTestId("option-list");
  await expect(optionList).toBeVisible();
  const target = optionList.locator(`[data-option="${key}"]`).first();
  await expect(target).toBeVisible();
  await target.click();
  await expect(target).toHaveAttribute("aria-checked", "true");
}

/**
 * Click the option whose visible chip label equals the given letter (e.g.
 * "A"). The chip label is the display letter the user sees on screen, which
 * maps to an underlying key via the snapshot's `optionOrder`. Use this when
 * the test wants to mirror the user's intent — "click the first option" —
 * regardless of how the underlying keys are shuffled.
 */
export async function selectOptionByLabel(page: Page, label: string): Promise<void> {
  const optionList = page.getByTestId("option-list");
  await expect(optionList).toBeVisible();
  const target = optionList.locator(`[data-label="${label}"]`).first();
  await expect(target).toBeVisible();
  await target.click();
  await expect(target).toHaveAttribute("aria-checked", "true");
}
