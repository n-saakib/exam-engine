import { test, expect } from "@playwright/test";

test("multi-answer question: select 2 options, give up, submit", async ({ page }) => {
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

  // Start with a Mock set which has multi questions
  const create = await page.request.post("http://localhost:3003/api/sessions", { data: { quesPath: "Exams/Cloud/AWS/Solutions-Architect-Associate/Mock", setId: "aws_saa_exam_style_set1" } });
  console.log("create:", create.status());
  const sess = await create.json();
  const sid = sess.id;
  console.log("session:", sid, "questions:", sess.questions.length, "first type:", sess.questions[0].questionType);

  // Find a multi question
  const multiQ = sess.questions.find((q: any) => q.questionType === "multi");
  if (!multiQ) {
    console.log("no multi question in this set");
    return;
  }
  console.log("multi Q id:", multiQ.id, "correctAnswer:", multiQ.correctAnswer);

  // The live DTO hides correctAnswer for unrevealed questions — we just have options
  // For a multi question, select 2 options then submit the exam
  // First navigate to the multi question
  // (in a UI flow, the user would click through questions)
  // For this test, just submit a few PATCHes
  const patch1 = await page.request.patch(`http://localhost:3003/api/sessions/${sid}`, {
    data: { answer: { questionId: multiQ.id, selected: ["A", "C"] } },
  });
  console.log("patch1:", patch1.status());

  // Submit the exam
  const submit = await page.request.post(`http://localhost:3003/api/sessions/${sid}/submit`, { data: {} });
  console.log("submit:", submit.status());
  const body = await submit.text();
  try {
    const j = JSON.parse(body);
    if (j.summary) {
      console.log("summary:", JSON.stringify(j.summary));
      const myQ = j.questions.find((q: any) => q.id === multiQ.id);
      console.log("multi Q result:", JSON.stringify({ outcome: myQ.outcome, yourAnswer: myQ.yourAnswer, correctAnswer: myQ.correctAnswer, gaveUp: myQ.gaveUp }));
    } else {
      console.log("response:", j);
    }
  } catch (e) {
    console.log("raw body:", body.substring(0, 300));
  }

  console.log("=== PAGE ERRORS ===");
  for (const l of pageErrors) console.log(l);
  console.log("=== CONSOLE ERRORS ===");
  for (const l of consoleErrors) console.log(l);
  console.log("=== FAILED REQUESTS ===");
  for (const l of failedRequests) console.log(l);
});
