-- 0002_drop_confidence — drop the per-question confidence column that was
-- shipped in MVP as a short-term-roadmap feature. The corresponding UI
-- (ConfidenceRating), types (Confidence enum, LiveAnswer.confidence, etc.),
-- store action (setConfidence), and route write (applyUpdate) are removed in
-- the same change; this migration keeps the schema honest.
--
-- The CHECK constraint on `confidence` is part of the column definition, so
-- dropping the column drops the constraint automatically. No explicit
-- DROP CONSTRAINT is needed (and SQLite doesn't support it standalone).
ALTER TABLE session_answers DROP COLUMN confidence;
