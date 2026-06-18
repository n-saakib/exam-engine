import { test, expect } from "@playwright/test";

test("submit with body that fails validation", async ({ page }) => {
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

  // Try with elapsedMs = null
  const create = await page.request.post("/api/sessions", { data: { quesPath: "Exams/Cloud/AWS/Solutions-Architect-Associate/Easy" } });
  const sess = await create.json();
  const sid = sess.id;

  const tests: Array<{name: string; body: any; headers?: any}> = [
    { name: "null elapsedMs", body: { elapsedMs: null } },
    { name: "array elapsedMs", body: { elapsedMs: [1, 2, 3] } },
    { name: "object elapsedMs", body: { elapsedMs: { foo: 1 } } },
    { name: "boolean elapsedMs", body: { elapsedMs: true } },
    { name: "NaN elapsedMs", body: { elapsedMs: NaN } },
    { name: "Infinity elapsedMs", body: { elapsedMs: Infinity } },
  ];

  for (const t of tests) {
    const res = await page.request.post(`/api/sessions/${sid}/submit`, { data: t.body });
    console.log(`${t.name}: ${res.status()}`);
  }

  console.log("=== PAGE ERRORS ===");
  for (const l of pageErrors) console.log(l);
  console.log("=== FAILED REQUESTS ===");
  for (const l of failedRequests) console.log(l);
});
