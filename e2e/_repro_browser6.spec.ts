import { test, expect } from "@playwright/test";

test("submit without answering any question", async ({ page }) => {
  const failedRequests: string[] = [];
  const pageErrors: string[] = [];
  const consoleMsgs: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("response", async (resp) => {
    if (resp.status() >= 400) {
      let body = "";
      try { body = await resp.text(); } catch {}
      failedRequests.push(`${resp.status()} ${resp.request().method()} ${resp.url()}\n  body: ${body.substring(0, 500)}`);
    }
  });

  await page.goto("/");
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

  // Don't answer anything. Skip to last.
  const navigator = page.getByTestId("question-navigator");
  const navQ10 = navigator.getByRole("button", { name: /Question 10/i });
  await navQ10.click();

  const submitBtn = page.getByRole("button", { name: /^Submit exam$/i });
  await submitBtn.click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: /^Submit exam$/i });
  await confirm.click();

  try {
    await page.waitForURL(/\/results\//, { timeout: 10_000 });
  } catch {}

  console.log("=== PAGE ERRORS ===");
  for (const l of pageErrors) console.log(l);
  console.log("=== FAILED REQUESTS ===");
  for (const l of failedRequests) console.log(l);
  console.log("=== CONSOLE ===");
  for (const l of consoleMsgs) console.log(l);
  console.log("=== URL ===", page.url());
});
