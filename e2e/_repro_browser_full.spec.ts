import { test, expect } from "@playwright/test";

test("full user flow: answer, give up, submit, capture all errors", async ({ page }) => {
  const failedRequests: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("response", async (resp) => {
    if (resp.status() >= 400) {
      let body = "";
      try { body = await resp.text(); } catch {}
      failedRequests.push(`${resp.status()} ${resp.request().method()} ${resp.url()}\n  body: ${body.substring(0, 500)}`);
    }
  });

  // Configure: enable shuffle options + start an exam
  const settingsRes = await page.request.patch("http://localhost:3003/api/settings", { data: { shuffle_options: true, timer_enabled: true } });
  console.log("settings update:", settingsRes.status());

  await page.goto("http://localhost:3003/");
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

  // Q1: select first option
  await page.getByTestId("option-list").getByRole("checkbox").first().click();
  // Go to Q2
  await page.getByRole("button", { name: /^Next$/i }).click();
  // Q2: give up
  await page.getByRole("button", { name: /^Give up$/i }).click();
  let d = page.getByRole("dialog");
  if (await d.isVisible()) {
    await d.getByRole("button", { name: /^Reveal$/i }).click();
  }
  // Q3: skip
  await page.getByRole("button", { name: /^Next$/i }).click();
  // Q3: also give up
  await page.getByRole("button", { name: /^Give up$/i }).click();
  d = page.getByRole("dialog");
  if (await d.isVisible()) {
    await d.getByRole("button", { name: /^Reveal$/i }).click();
  }
  // Go to Q10
  const navigator = page.getByTestId("question-navigator");
  await navigator.getByRole("button", { name: /Question 10/i }).click();

  // Submit
  await page.getByRole("button", { name: /^Submit exam$/i }).click();
  const submitDialog = page.getByRole("dialog");
  await submitDialog.getByRole("button", { name: /^Submit exam$/i }).click();

  try {
    await page.waitForURL(/\/results\//, { timeout: 10_000 });
  } catch {}

  console.log("=== PAGE ERRORS ===");
  for (const l of pageErrors) console.log(l);
  console.log("=== CONSOLE ERRORS ===");
  for (const l of consoleErrors) console.log(l);
  console.log("=== FAILED REQUESTS ===");
  for (const l of failedRequests) console.log(l);
  console.log("=== URL ===", page.url());
});
