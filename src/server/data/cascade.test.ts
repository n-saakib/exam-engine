import { afterEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/server/test/makeTestDb";

/**
 * Guards the per-connection `PRAGMA foreign_keys = ON` (09 §7.2). If that pragma
 * is ever dropped, ON DELETE CASCADE silently no-ops and this test fails — the
 * cheapest early-warning for a high-risk regression.
 */
describe("FK cascade", () => {
  let t: TestDb;
  afterEach(() => t?.cleanup());

  it("foreign_keys pragma is ON for the connection", () => {
    t = makeTestDb();
    const fk = t.db.pragma("foreign_keys", { simple: true });
    expect(fk).toBe(1);
  });

  it("deleting a session cascades to its answers", () => {
    t = makeTestDb();
    const sessionId = "sess-1";

    t.db
      .prepare(
        `INSERT INTO exam_sessions
           (id, status, ques_path, domain_label, set_id, set_title, difficulty,
            question_snapshot, total_questions, created_at, updated_at)
         VALUES (?, 'in_progress', 'p', 'd', 's', 't', 'Easy', '[]', 2, 'now', 'now')`,
      )
      .run(sessionId);

    const insertAnswer = t.db.prepare(
      `INSERT INTO session_answers (session_id, question_id) VALUES (?, ?)`,
    );
    insertAnswer.run(sessionId, 1);
    insertAnswer.run(sessionId, 2);

    const before = t.db
      .prepare("SELECT COUNT(*) AS c FROM session_answers WHERE session_id = ?")
      .get(sessionId) as { c: number };
    expect(before.c).toBe(2);

    t.db.prepare("DELETE FROM exam_sessions WHERE id = ?").run(sessionId);

    const after = t.db
      .prepare("SELECT COUNT(*) AS c FROM session_answers WHERE session_id = ?")
      .get(sessionId) as { c: number };
    expect(after.c).toBe(0);
  });
});
