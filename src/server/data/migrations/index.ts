/**
 * Embedded migration registry — the runtime source of migrations.
 *
 * The SQL is inlined here (rather than read from the sibling `.sql` files at
 * runtime) so the bundle is self-contained: no dynamic `fs`/`path` ops in the
 * server/instrumentation trace (which kept `next build` from tracing the whole
 * project), and no dependency on `src/` being present in a standalone deploy.
 *
 * The `.sql` files remain the human-authored, reviewable source of truth and the
 * DDL spec artifact; `migrations.drift.test.ts` asserts this inlined SQL matches
 * the corresponding `.sql` file byte-for-byte, so they can never silently drift.
 *
 * To add a migration: create `NNNN_name.sql`, then add an entry here with its
 * version, name, and SQL, and the drift test keeps the two in lockstep.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

const M0001_INIT = `-- 0001_init — CertPrep MVP schema (data model 02 §3.1 + the §3.1.1 refinements).
--
-- NOTE: connection pragmas (journal_mode=WAL, foreign_keys=ON) are set per
-- connection in src/server/data/db.ts, NOT here. The \`schema_migrations\` table
-- is created/managed by the migration runner (src/server/data/migrate.ts), which
-- also wraps this whole file in a single transaction. This file is pure DDL.

-- Key/value app + user settings. Values are JSON-encoded.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Index of every discovered question set (filesystem + uploads).
CREATE TABLE set_catalog (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id         TEXT    NOT NULL,
  set_title      TEXT    NOT NULL,
  difficulty     TEXT    NOT NULL,
  ques_path      TEXT    NOT NULL,                    -- leaf path from exam-paths.json
  file_path      TEXT    NOT NULL UNIQUE,             -- absolute path to the .json file
  question_count INTEGER NOT NULL,
  content_hash   TEXT    NOT NULL,                    -- sha256 of file contents
  source         TEXT    NOT NULL DEFAULT 'filesystem'
                   CHECK (source IN ('filesystem', 'upload')),
  status         TEXT    NOT NULL DEFAULT 'ok'
                   CHECK (status IN ('ok', 'warning', 'error')),
  diagnostics    TEXT,                                -- JSON array of validation messages
  discovered_at  TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);
CREATE INDEX idx_catalog_ques_path ON set_catalog(ques_path);
CREATE INDEX idx_catalog_set_id    ON set_catalog(set_id);

-- Which sets have been completed for a given path (drives repeat-avoidance).
CREATE TABLE set_completion (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  ques_path            TEXT NOT NULL,
  set_id               TEXT NOT NULL,
  completed_session_id TEXT,                          -- soft reference (intentionally NOT a hard FK)
  completed_at         TEXT NOT NULL
);
CREATE INDEX idx_completion_path     ON set_completion(ques_path);
CREATE INDEX idx_completion_path_set ON set_completion(ques_path, set_id);

-- One attempt at a set. The unit of history. Snapshot makes it self-contained.
CREATE TABLE exam_sessions (
  id                TEXT PRIMARY KEY,                 -- uuid
  status            TEXT    NOT NULL DEFAULT 'in_progress'
                      CHECK (status IN ('in_progress', 'completed', 'discarded')),
  ques_path         TEXT    NOT NULL,
  domain_label      TEXT    NOT NULL,                 -- "Cloud / AWS / SAA / Easy"
  set_id            TEXT    NOT NULL,
  set_title         TEXT    NOT NULL,
  difficulty        TEXT    NOT NULL
                      CHECK (difficulty IN ('Easy', 'Medium', 'Hard', 'Mock')),
  question_snapshot TEXT    NOT NULL,                 -- JSON: ordered questions as presented
  total_questions   INTEGER NOT NULL,
  timer_enabled     INTEGER NOT NULL DEFAULT 0,
  timer_limit_ms    INTEGER,                          -- null = untimed
  time_elapsed_ms   INTEGER NOT NULL DEFAULT 0,
  current_index     INTEGER NOT NULL DEFAULT 0,
  shuffle_seed      TEXT,
  mode              TEXT    NOT NULL DEFAULT 'full'
                      CHECK (mode IN ('full', 'retake_all', 'retake_incorrect')),
  origin_session_id TEXT,                             -- FK to exam_sessions.id when a retake
  score_percent     REAL,
  correct_count     INTEGER,
  incorrect_count   INTEGER,
  revealed_count    INTEGER,
  unanswered_count  INTEGER,
  is_bookmarked     INTEGER NOT NULL DEFAULT 0,
  note              TEXT,
  created_at        TEXT    NOT NULL,
  started_at        TEXT,
  updated_at        TEXT    NOT NULL,
  completed_at      TEXT,
  -- Contradictory-state guard: a timed session must carry a limit.
  CHECK (timer_enabled = 0 OR timer_limit_ms IS NOT NULL)
);
CREATE INDEX idx_sessions_status       ON exam_sessions(status);
CREATE INDEX idx_sessions_ques_path    ON exam_sessions(ques_path);
CREATE INDEX idx_sessions_completed_at ON exam_sessions(completed_at);

-- Per-question state within a session.
CREATE TABLE session_answers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       TEXT    NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_id      INTEGER NOT NULL,                  -- matches question.id in the snapshot
  selected_options TEXT    NOT NULL DEFAULT '[]',     -- JSON array (single = one element)
  is_flagged       INTEGER NOT NULL DEFAULT 0,
  is_revealed      INTEGER NOT NULL DEFAULT 0,        -- "gave up"
  is_correct       INTEGER,                           -- null until graded
  confidence       TEXT    CHECK (confidence IS NULL OR confidence IN ('easy', 'medium', 'hard')),
  time_spent_ms    INTEGER NOT NULL DEFAULT 0,
  answered_at      TEXT,
  UNIQUE (session_id, question_id)
);
CREATE INDEX idx_answers_session ON session_answers(session_id);
`;

const M0002_DROP_CONFIDENCE = `-- 0002_drop_confidence — drop the per-question confidence column that was
-- shipped in MVP as a short-term-roadmap feature. The corresponding UI
-- (ConfidenceRating), types (Confidence enum, LiveAnswer.confidence, etc.),
-- store action (setConfidence), and route write (applyUpdate) are removed in
-- the same change; this migration keeps the schema honest.
--
-- The CHECK constraint on \`confidence\` is part of the column definition, so
-- dropping the column drops the constraint automatically. No explicit
-- DROP CONSTRAINT is needed (and SQLite doesn't support it standalone).
ALTER TABLE session_answers DROP COLUMN confidence;
`;

/** All migrations, ascending by version. */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "0001_init", sql: M0001_INIT },
  { version: 2, name: "0002_drop_confidence", sql: M0002_DROP_CONFIDENCE },
];
