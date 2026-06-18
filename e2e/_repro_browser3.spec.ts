import { test, expect } from "@playwright/test";

test("drive the actual exam with FULL answers + flag + give up", async ({ page }) => {
  const failedRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(`pageerror: ${err.message}`));
  page.on("response", (resp) => {
    if (resp.status() >= 400) {
      failedRequests.push(`${resp.status()} ${resp.request().method()} ${resp.url()}`);
    }
  });
  page.on("requestfailed", (req) => {
    failedRequests.push(`FAILED ${req.method()} ${req.url()} ${req.failure()?.errorText ?? ""}`);
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

  // Answer all 10 questions
  for (let i = 0; i < 10; i++) {
    // Pick the first option
    const first = page.getByTestId("option-list").getByRole("checkbox").first();
    await first.click();
    // Click Next (or Submit on Q10)
    if (i < 9) {
      const nextButton = page.getByRole("button", { name: /^Next$/i });
      await nextButton.click();
    } else {
      const submitBtn = page.getByRole("button", { name: /^Submit exam$/i });
      await submitBtn.click();
    }
  }

  // Confirm submit
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: /^Submit exam$/i });
  await confirm.click();

  try {
    await page.waitForURL(/\/results\//, { timeout: 10_000 });
  } catch (e) {
    console.log("=== DID NOT NAVIGATE ===");
  }

  console.log("=== PAGE ERRORS ===");
  for (const l of pageErrors) console.log(l);
  console.log("=== FAILED REQUESTS ===");
  for (const l of failedRequests) console.log(l);
  console.log("=== URL ===", page.url());
});
