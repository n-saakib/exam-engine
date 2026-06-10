# F3 — Question Set Loader

> **Milestone:** M1 · **Depends on:** F0 · **Blocks:** F4, F8
> Plan F3: "Discovers and tracks all JSON sets under the configured Exams/ root."

---

## Goal

Discover, validate, and catalogue every question set under the configured Exams root (and uploads). Track which sets have been completed per path to avoid repeats, prompt to reset when a path is exhausted, and support both filesystem access and drag-and-drop upload. One bad file never breaks the catalogue.

## Plan Requirements
- Auto-detect all `.json` files under `Exams/` on startup.
- Track completed sets per path in SQLite to avoid repeats.
- Prompt to reset when all sets in a path are exhausted.
- Support local filesystem via Node.js API **and** drag-and-drop UI upload.

## Acceptance Criteria
- On boot (and on demand), all `*.json` under the Exams root are scanned into `set_catalog`.
- Valid sets are catalogued; invalid sets are excluded with a per-file reason; warnings are catalogued + annotated. The scan never throws on a single bad file.
- `GET /api/sets?quesPath=...` lists sets with completion + drift state and remaining/exhausted counts.
- Completing an exam marks its set complete for that path; starting a new exam from the path picks an unattempted set; when none remain, the API signals exhaustion and the UI offers reset.
- Uploading `.json` files validates and catalogues them under `uploads/`.

---

## Tasks

### Backend — scanning & validation
- [ ] **F3-T1** (M) `fileReader.ts`: recursive walk of the Exams root for `*.json`; read + guarded `JSON.parse`; sha256 content hash.
- [ ] **F3-T2** (M) Validate each file against the question-set zod schema ([`02-data-model.md` §1.2](../02-data-model.md)); classify `ok | warning | error` with messages.
- [ ] **F3-T3** (M) `setCatalogRepo` + upsert-by-`file_path`; mark removed files; record `diagnostics`.
- [ ] **F3-T4** (M) `SetCatalog` service: `scan(quesPath?)`, `listForPath(quesPath)`, `loadSet(setId|filePath)`, `pickNextUnattempted(quesPath)`, `isExhausted(quesPath)`.
- [ ] **F3-T5** (S) `questionType` handling: accept `single`/absent; catalogue other types but mark `status=warning` "unsupported type — engine pending" (so `POST /sessions` can return `422` cleanly).
- [ ] **F3-T6** (S) Scan on boot (after migrations) + map duplicate `set_id`s to a warning.

### Backend — completion tracking
- [ ] **F3-T7** (M) `completionRepo`: record completion (`ques_path`, `set_id`, `completed_session_id`); list completed `set_id`s per path; delete-by-path (reset).
- [ ] **F3-T8** (S) Hook: on `POST /sessions/:id/submit` (F4), insert completion. (Defined here, consumed by F4.)
- [ ] **F3-T9** (S) Exhaustion signal in `pickNextUnattempted` → `409 SETS_EXHAUSTED` when empty.

### Backend — API
- [ ] **F3-T10** (M) `GET /api/sets?quesPath=` → items with `completed`, `lastAttemptAt`, `updatedSinceAttempt`, `status`; `remaining`, `exhausted`.
- [ ] **F3-T11** (S) `GET /api/sets/:setId` (full set; `409` on ambiguous duplicate).
- [ ] **F3-T12** (M) `POST /api/scan` (optional `quesPath`) → `{ scanned, added, updated, removed, errors, diagnostics }`.
- [ ] **F3-T13** (S) `GET /api/catalog/diagnostics` → all warning/error files (drives F8 panel).

### Backend — uploads
- [ ] **F3-T14** (M) `POST /api/sets/upload` (`multipart/form-data`): restrict to `.json`, size cap, validate, store under `data/uploads/`, catalogue; return accepted/rejected.
- [ ] **F3-T15** (S) Path-traversal/sandbox guard on upload targets and Exams root.

### Frontend (hooks; UI mostly in F2/F8)
- [ ] **F3-T16** (S) `useSets(quesPath)` query; `useScan()` mutation; `useUploadSets()` mutation.
- [ ] **F3-T17** (S) Reset-progress dialog (shared) wired to `POST /api/progress/reset { scope: "path" }` (UI lives in F8; trigger from F2 exhausted state).
- [ ] **F3-T18** (S) Drag-and-drop upload component (used in F8 upload mode).

---

## §5 / forward-compat notes
- `updatedSinceAttempt` uses `content_hash` drift (data model §6.3) — informational only; never mutates past sessions.
- Unsupported `questionType` is catalogued (not hidden) so authors can stage future sets.

## Testing
- [ ] Unit: validator passes a good set; excludes `bad_correct_key`/`duplicate_ids` with reasons; warns on `missing_explanation`; one bad file doesn't abort a multi-file scan.
- [ ] Unit: `pickNextUnattempted` skips completed sets; signals exhaustion when all done.
- [ ] Integration: `POST /scan` indexes the real `aws_saa_*` sets; `GET /sets?quesPath=` reflects completion after a seeded completed session.
- [ ] Integration: upload accepts valid JSON, rejects non-JSON/oversized/invalid.
- [ ] Security: traversal attempt in `quesPath`/upload is rejected.

## Definition of Done
- [ ] Catalogue scans on boot + on demand; resilient to bad files; diagnostics surfaced.
- [ ] Completion tracking drives repeat-avoidance and exhaustion → reset.
- [ ] Filesystem **and** upload sources both work.
- [ ] Tests green; walkthrough recorded.
