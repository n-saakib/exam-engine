import { test, expect } from "@playwright/test";

test("drive the actual exam page through submit, watch errors", async ({ page }) => {
  const consoleLogs: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => pageErrors.push(`pageerror: ${err.message}`));

  // Capture failed network responses
  const failedRequests: string[] = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400) {
      failedRequests.push(`${resp.status()} ${resp.request().method()} ${resp.url()}`);
    }
  });

  await page.goto("/");
  // Pick Cloud > AWS > SAA > Easy
  const level0 = page.getByTestId("level-0");
  await level0.getByRole("combobox").selectOption({ value: "cloud" });
  const level1 = page.getByTestId("level-1");
  await level1.getByRole("combobox").selectOption({ value: "aws" });
  const level2 = page.getByTestId("level-2");
  await level2.getByRole("combobox").selectOption({ value: "saa" });
  const level3 = page.getByTestId("level-3");
  await level3.getByRole("combobox").selectOption({ value: "easy" });

  const startButton = page.getByRole("button", { name: /Start Exam/i });
  await startButton.click();
  await page.waitForURL(/\/exam\/[a-zA-Z0-9-]+/, { timeout: 20_000 });
  await expect(page.getByTestId("question-text")).toBeVisible();

  // Answer Q1: pick first option
  const first = page.getByTestId("option-list").getByRole("checkbox").first();
  await first.click();

  // Go to Q2
  const nextButton = page.getByRole("button", { name: /^Next$/i });
  await nextButton.click();

  // Give up on Q2
  const giveUpButton = page.getByRole("button", { name: /^Give up$/i });
  await giveUpButton.click();
  const revealDialog = page.getByRole("dialog");
  await revealDialog.getByRole("button", { name: /^Reveal$/i }).click();

  // Go to last question
  const navigator = page.getByTestId("question-navigator");
  const navQ10 = navigator.getByRole("button", { name: /Question 10/i });
  await navQ10.click();

  // Submit
  const submitBtn = page.getByRole("button", { name: /^Submit exam$/i });
  await submitBtn.click();
  const submitDialog = page.getByRole("dialog");
  const confirmBtn = submitDialog.getByRole("button", { name: /^Submit exam$/i });
  await confirmBtn.click();

  // Wait for navigation to results
  try {
    await page.waitForURL(/\/results\//, { timeout: 10_000 });
  } catch (e) {
    console.log("=== DID NOT NAVIGATE TO /results/ ===");
  }

  // Dump logs
  console.log("=== CONSOLE LOGS ===");
  for (const l of consoleLogs) console.log(l);
  console.log("=== PAGE ERRORS ===");
  for (const l of pageErrors) console.log(l);
  console.log("=== FAILED REQUESTS ===");
  for (const l of failedRequests) console.log(l);
  console.log("=== CURRENT URL ===");
  console.log(page.url());

  // Screenshot
  await page.screenshot({ path: "/tmp/after-submit.png", fullPage: true });
});
