import { test, expect } from "@playwright/test";

test("aggressive: answer all, give up on half, flag several, submit", async ({ page }) => {
  const failedRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(`pageerror: ${err.message}`));
  page.on("response", async (resp) => {
    if (resp.status() >= 400) {
      let body = "";
      try { body = await resp.text(); } catch {}
      failedRequests.push(`${resp.status()} ${resp.request().method()} ${resp.url()}\n  body: ${body.substring(0, 500)}`);
    }
  });

  // Enable shuffle via PATCH
  await page.request.patch("/api/settings", { data: { shuffle_options: true } });

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

  // Loop through all 10 questions
  for (let i = 0; i < 10; i++) {
    if (i % 2 === 0) {
      // Even: select the first option, flag it
      const first = page.getByTestId("option-list").getByRole("checkbox").first();
      await first.click();
      // flag
      const flagBtn = page.getByRole("button", { name: /^Flag$/i });
      if (await flagBtn.isVisible()) await flagBtn.click();
    } else if (i % 3 === 0) {
      // give up
      const giveUpButton = page.getByRole("button", { name: /^Give up$/i });
      if (await giveUpButton.isVisible()) {
        await giveUpButton.click();
        const dialog = page.getByRole("dialog");
        if (await dialog.isVisible()) {
          const reveal = dialog.getByRole("button", { name: /^Reveal$/i });
          if (await reveal.isVisible()) await reveal.click();
        }
      }
    }

    if (i < 9) {
      // Go to next
      const nextButton = page.getByRole("button", { name: /^Next$/i });
      if (await nextButton.isVisible()) await nextButton.click();
    } else {
      const submitBtn = page.getByRole("button", { name: /^Submit exam$/i });
      if (await submitBtn.isVisible()) await submitBtn.click();
    }
  }

  // Submit confirmation dialog
  const submitDialog = page.getByRole("dialog");
  if (await submitDialog.isVisible()) {
    const confirm = submitDialog.getByRole("button", { name: /^Submit exam$/i });
    await confirm.click();
  }

  try {
    await page.waitForURL(/\/results\//, { timeout: 10_000 });
  } catch {}

  console.log("=== PAGE ERRORS ===");
  for (const l of pageErrors) console.log(l);
  console.log("=== FAILED REQUESTS ===");
  for (const l of failedRequests) console.log(l);
  console.log("=== URL ===", page.url());
});
