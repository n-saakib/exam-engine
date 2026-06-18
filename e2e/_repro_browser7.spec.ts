import { test, expect } from "@playwright/test";

test("submit with body containing invalid data", async ({ page }) => {
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

  // Create a session via API
  const create = await page.request.post("/api/sessions", { data: { quesPath: "Exams/Cloud/AWS/Solutions-Architect-Associate/Easy" } });
  const sess = await create.json();
  const sid = sess.id;

  // Try various invalid submit bodies
  const tests = [
    { name: "empty body", body: undefined },
    { name: "negative elapsed", body: { elapsedMs: -100 } },
    { name: "non-integer elapsed", body: { elapsedMs: 1.5 } },
    { name: "string elapsed", body: { elapsedMs: "abc" } },
    { name: "huge elapsed", body: { elapsedMs: 9999999999999 } },
    { name: "extra field", body: { elapsedMs: 0, foo: "bar" } },
    { name: "garbage json", body: undefined, raw: "not json" },
  ];

  for (const t of tests) {
    let res;
    if (t.raw) {
      res = await page.request.post(`/api/sessions/${sid}/submit`, { headers: { "content-type": "application/json" }, data: t.raw });
    } else {
      res = await page.request.post(`/api/sessions/${sid}/submit`, { data: t.body });
    }
    console.log(`${t.name}: ${res.status()}`);
  }

  console.log("=== PAGE ERRORS ===");
  for (const l of pageErrors) console.log(l);
});
