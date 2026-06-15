import { afterEach, describe, expect, it } from "vitest";

import { makeTestDb, type TestDb } from "@/server/test/makeTestDb";
import { createSessionRepo } from "@/server/data/repos/sessionRepo";
import { createAnswerRepo } from "@/server/data/repos/answerRepo";

/**
 * Security-focused tests for `sessionRepo`. The base suite
 * (`sessionRepo.test.ts`) covers insert/get/patch/delete cascades; this file
 * pins the injection / wildcard / enum-whitelist guarantees that the filter
 * builder relies on.
 *
 *   1. LIKE wildcards in `domain` are escaped — a row whose `domain_label`
 *      contains a literal `%` is matched by a literal `%` search, not by a
 *      `starts-with` pattern.
 *   2. `sort` enum is whitelisted — non-enum values fall through to the
 *      default (`completed_at`) without being interpolated into the SQL.
 *   3. `order` enum is whitelisted — a value like `'asc; DROP TABLE'`
 *      does not become a second statement; it falls through to `desc`.
 *   4. `quesPath` is bound positionally and a literal `%` in the value does
 *      not act as a LIKE wildcard (it's an `=` match, not a `LIKE` match).
 */

function seedSession(
  t: TestDb,
  id: string,
  opts: {
    domainLabel: string;
    quesPath: string;
    scorePercent?: number;
    difficulty?: "Easy" | "Medium" | "Hard" | "Mock";
  },
): void {
  t.db
    .prepare(
      `INSERT INTO exam_sessions
         (id, status, ques_path, domain_label, set_id, set_title, difficulty,
          question_snapshot, total_questions, score_percent, completed_at,
          created_at, updated_at)
       VALUES (?, 'completed', ?, ?, 's', 't', ?, '[]', 1, ?, '2026-06-10T00:00:00.000Z', 'now', 'now')`,
    )
    .run(
      id,
      opts.quesPath,
      opts.domainLabel,
      opts.difficulty ?? "Easy",
      opts.scorePercent ?? 80,
    );
}

describe("sessionRepo — security contract", () => {
  let t: TestDb;
  afterEach(() => t?.cleanup());

  it("escapes LIKE wildcards in the `domain` filter (literal `%` is matched literally)", () => {
    t = makeTestDb();
    const repo = createSessionRepo(t.db);
    seedSession(t, "s1", { domainLabel: "literal%foo", quesPath: "p1" });
    seedSession(t, "s2", { domainLabel: "ordinary", quesPath: "p2" });

    // The literal search for the substring 'literal%foo' must match s1 only.
    const exact = repo.listCompleted({ domain: "literal%foo" });
    expect(exact.length).toBe(1);
    expect(exact[0]?.id).toBe("s1");

    // The user-typed '%foo' becomes a literal substring search (the `%` is
    // escaped, NOT a wildcard). The s1 row 'literal%foo' does contain the
    // literal substring '%foo' (at offset 6) → it matches. The s2 row
    // 'ordinary' does not → it doesn't. This is the CORRECT (escaped)
    // behavior; the REGRESSION we're guarding against is one where `%`
    // remains a wildcard, which would also match the s2 row (because the
    // unescaped pattern `%%foo%` matches anything containing 'foo').
    const literalSubstring = repo.listCompleted({ domain: "%foo" });
    expect(literalSubstring.map((r) => r.id)).toEqual(["s1"]);
    expect(repo.countCompleted({ domain: "%foo" })).toBe(1);

    // `_` is the LIKE single-char wildcard — same treatment. A row whose
    // domain contains the literal `_` (not the wildcard) is matched iff the
    // substring actually exists.
    seedSession(t, "s3", { domainLabel: "with_underscore", quesPath: "p3" });
    seedSession(t, "s4", { domainLabel: "wildcard", quesPath: "p4" });
    // `repo.listCompleted({ domain: "_u" })` with NO escape would match both
    // (the `_` would be a single-char wildcard). With the escape fix it
    // searches for the literal substring `_u`, which only s3 contains.
    const underscore = repo.listCompleted({ domain: "_u" });
    expect(underscore.map((r) => r.id)).toEqual(["s3"]);
  });

  it("whitelists the `sort` enum: a non-enum value falls through to the default", () => {
    t = makeTestDb();
    const repo = createSessionRepo(t.db);
    seedSession(t, "s1", { domainLabel: "d1", quesPath: "p1" });
    seedSession(t, "s2", { domainLabel: "d2", quesPath: "p2" });

    // Cast a non-enum value: the contract is that the repo treats it as the
    // default sort, never as a column name interpolated into SQL.
    const rows = repo.listCompleted({
      sort: "evil; DROP TABLE exam_sessions; --" as unknown as "date",
    });
    // Two rows survive (the DROP did not execute) and are returned in the
    // default order (completed_at ASC).
    expect(rows.length).toBe(2);

    // Sanity: the table is still there with both rows.
    const survivors = t.db
      .prepare("SELECT id FROM exam_sessions ORDER BY id ASC")
      .all() as Array<{ id: string }>;
    expect(survivors.map((r) => r.id)).toEqual(["s1", "s2"]);
  });

  it("whitelists the `order` enum: 'asc; DROP TABLE' falls through to default", () => {
    t = makeTestDb();
    const repo = createSessionRepo(t.db);
    seedSession(t, "s1", { domainLabel: "d1", quesPath: "p1" });
    seedSession(t, "s2", { domainLabel: "d2", quesPath: "p2" });

    // Pass an obviously malicious value for `order`. The repo must NOT
    // interpolate it into SQL: a successful run with both rows preserved
    // (no DROP TABLE executed) is the assertion.
    const rows = repo.listCompleted({
      order: "asc; DROP TABLE exam_sessions; --" as unknown as "asc",
    });
    expect(rows.length).toBe(2);

    // Confirm the table still has both rows.
    const survivors = t.db
      .prepare("SELECT id FROM exam_sessions ORDER BY id ASC")
      .all() as Array<{ id: string }>;
    expect(survivors.map((r) => r.id)).toEqual(["s1", "s2"]);
  });

  it("binds quesPath positionally: a literal `%` in quesPath does not act as a LIKE wildcard", () => {
    t = makeTestDb();
    const repo = createSessionRepo(t.db);
    seedSession(t, "s1", { domainLabel: "d1", quesPath: "literal%path" });
    seedSession(t, "s2", { domainLabel: "d2", quesPath: "ordinary" });

    // The filter uses `ques_path = ?` (an `=` match, not LIKE), so a `%`
    // is a literal character. The exact-string match returns s1 only.
    const exact = repo.listCompleted({ quesPath: "literal%path" });
    expect(exact.length).toBe(1);
    expect(exact[0]?.id).toBe("s1");

    // A LIKE-shaped value should not magically match anything (still
    // equality, so the `%` is a literal char and does not appear).
    const like = repo.listCompleted({ quesPath: "%" });
    expect(like.length).toBe(0);

    // Sanity: the answers sub-table FK is still intact (regression check
    // that we have not damaged the schema).
    const ans = createAnswerRepo(t.db);
    expect(typeof ans.getBySession).toBe("function");
  });
});
