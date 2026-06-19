-- 0005_drop_revealed_unanswered_counts — fold "revealed" and "unanswered"
-- into the post-submit outcome model (now: correct | incorrect | gave_up).
--
-- The per-question live-exam flag `session_answers.is_revealed` is kept —
-- it controls answer visibility during the exam and remains a first-class
-- exam interaction. Only the aggregate count columns on `exam_sessions`
-- are dropped here, since the post-submit outcomes they tallied no longer
-- exist as first-class values.
--
-- Forward-only: ALTER TABLE … DROP COLUMN requires SQLite ≥ 3.35; the
-- project ships better-sqlite3 12.x which bundles SQLite 3.45+. No backfill
-- is needed — sessions in flight simply grade under the new 3-outcome model
-- when submitted.
ALTER TABLE exam_sessions DROP COLUMN revealed_count;
ALTER TABLE exam_sessions DROP COLUMN unanswered_count;
