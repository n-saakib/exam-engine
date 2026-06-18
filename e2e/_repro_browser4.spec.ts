import { test, expect } from "@playwright/test";

test("user-reported: shuffle options on, give up mid-exam, submit", async ({ page }) => {
  const failedRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(`pageerror: ${err.message}`));
  page.on("response", async (resp) => {
    if (resp.status() >= 400) {
      let body = "";
      try { body = await resp.text(); } catch {}
      failedRequests.push(`${resp.status()} ${resp.request().method()} ${resp.url()}\n  body: ${body.substring(0, 300)}`);
    }
  });
  page.on("requestfailed", (req) => {
    failedRequests.push(`FAILED ${req.method()} ${req.url()} ${req.failure()?.errorText ?? ""}`);
  });

  // First, enable shuffle_options in settings
  const settingsRes = await page.request.put("/api/settings", { data: { shuffle_options: true } });
  console.log("settings update:", settingsRes.status(), await settingsRes.text().then(t => t.substring(0, 200)));

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

  // Q1: select option, reveal it via Submit (NOT give up)
  const first = page.getByTestId("option-list").getByRole("checkbox").first();
  await first.click();
  // Don't actually click submit per question, just give up on the rest
  const nextButton = page.getByRole("button", { name: /^Next$/i });
  await nextButton.click();

  // Q2: give up
  const giveUpButton = page.getByRole("button", { name: /^Give up$/i });
  await giveUpButton.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Reveal$/i }).click();
  await expect(page.getByTestId("revealed-detail")).toBeVisible();

  // Move to last
  const navigator = page.getByTestId("question-navigator");
  const navQ10 = navigator.getByRole("button", { name: /Question 10/i });
  await navQ10.click();

  const submitBtn = page.getByRole("button", { name: /^Submit exam$/i });
  await submitBtn.click();
  const submitDialog = page.getByRole("dialog");
  const confirm = submitDialog.getByRole("button", { name: /^Submit exam$/i });
  await confirm.click();

  try {
    await page.waitForURL(/\/results\//, { timeout: 10_000 });
  } catch {}

  console.log("=== PAGE ERRORS ===");
  for (const l of pageErrors) console.log(l);
  console.log("=== FAILED REQUESTS ===");
  for (const l of failedRequests) console.log(l);
  console.log("=== URL ===", page.url());

  // If we're on /results/, try interacting with filter bar
  if (page.url().includes("/results/")) {
    // Test filter "gave up" - this is what user would do
    const filterBar = page.getByRole("tablist", { name: /Filter/i });
    const gaveUpTab = filterBar.getByRole("tab", { name: /Gave up/i });
    if (await gaveUpTab.isVisible()) {
      await gaveUpTab.click();
      console.log("=== clicked Gave up tab, OK ===");
    }
  }
});
