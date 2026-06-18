import { test, expect } from "@playwright/test";

test("reproduce submit error with shuffle on", async ({ page, request }) => {
  // Health
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();

  // Create a session with shuffleOptions enabled (the user's reported scenario)
  const create = await request.post("/api/sessions", {
    data: {
      quesPath: "Exams/Cloud/AWS/Solutions-Architect-Associate/Easy",
      options: { shuffleOptions: true },
    },
  });
  expect(create.ok()).toBeTruthy();
  const sess = await create.json();
  const sid = sess.id;
  console.log("session id:", sid, "questions:", sess.questions.length);

  // Answer Q1 with A
  const qid1 = sess.questions[0].id;
  const patch1 = await request.patch(`/api/sessions/${sid}`, {
    data: { answer: { questionId: qid1, selected: ["A"] } },
  });
  console.log("patch1 status:", patch1.status());

  // Give up on Q2 (no selection, revealed=true, gaveUp=true)
  const qid2 = sess.questions[1].id;
  const patch2 = await request.patch(`/api/sessions/${sid}`, {
    data: { answer: { questionId: qid2, selected: [], revealed: true, gaveUp: true } },
  });
  console.log("patch2 status:", patch2.status());

  // Submit and capture the full response
  const submit = await request.post(`/api/sessions/${sid}/submit`, { data: {} });
  const status = submit.status();
  const body = await submit.text();
  console.log("=== SUBMIT RESPONSE ===");
  console.log("status:", status);
  console.log("body (first 500 chars):", body.substring(0, 500));
  if (!submit.ok()) {
    console.log("=== FULL BODY ===");
    console.log(body);
  }
});
