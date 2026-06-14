# CertPrep — Pre-Implementation Analysis & Review

> **Status:** Review (pre-implementation) · **Audience:** Product + Engineering · **Purpose:** Findings from a phased critical review of the planning docs (`00`–`07` + `features/`) before any code is written.

This document records gaps, risks, and refinements found while reviewing the CertPrep plan. The plan is mature — these are refinements, not a redesign. Items are ordered by confidence (issues found independently in multiple docs first) and tagged with the source doc/section so they can be traced and closed.

Each actionable item is a checkbox. Close it by either fixing the referenced doc or consciously accepting the risk (note the decision next to the box).

---

## 1. Convergent findings (flagged across multiple docs — highest confidence)

These surfaced independently in two or more areas of the review. They are the gaps most worth closing **before F4 starts**.

### 1.1 Timer persistence & resume is unspecified — **blocking**
*Cited by: architecture (ADR-5, §9), frontend (§7–8), API (timer expiry), data-model (timestamps), testing (timer resume), roadmap (F4 risk).*

No doc defines how elapsed time accumulates across pause/resume or survives a refresh/crash. This blocks `ExamEngine`, the autosave PATCH contract, and the client timer.

- [ ] Add a timing model: server-authoritative `elapsed_seconds` (or `time_elapsed_ms`) on `exam_sessions`, incremented server-side from the timestamp delta on each autosave PATCH — never trust a client-supplied absolute. (`02-data-model.md`, `03-api-specification.md`)
- [ ] Specify whether `elapsedMs` in the PATCH body is **replace** or **add** semantics (must be explicit for idempotency on retry). (`03-api-specification.md` §autosave)
- [ ] Define timer-expiry behavior when `elapsedMs >= timerLimitMs`: auto-submit, return `timerExpired: true` signal, or passive clamp. (`03-api-specification.md`, `features/F4-exam-engine.md`)
- [ ] Define the acceptable data-loss window on resume (debounce interval + 1 tick) and state it. (`01-architecture.md` ADR-5)

### 1.2 Snapshot integrity has no regression test — **high**
*Cited by: data-model (#5), testing (#5), architecture (ADR-4).*

ADR-4 ("snapshot questions into the session") is called the most important data-integrity decision, but only snapshot *construction* is tested.

- [ ] Add an integration test: create session → mutate/delete the source JSON → submit → assert score and history detail come from the snapshot, not the live file. Use a temp Exams root; mark as a regression guard. (`06-testing-strategy.md` §3)
- [ ] Add a test that shuffled option order correctly maps back to original answers at grade time (silent mis-grade risk). (`06-testing-strategy.md`, `features/F4-exam-engine.md`)
- [ ] Document the snapshot JSON column shape inline in the data-model doc (currently only pointed to). (`02-data-model.md` §3)

### 1.3 Path-traversal under-specified — **high (security)**
*Cited by: API (P1), architecture (P4), testing (#4), product (risk).*

`quesPath` is an untrusted input across 5+ endpoints; there is no error code, no enumerated attack vectors, and the user-configurable Exams root is not validated before being persisted.

- [ ] Add a `PATH_TRAVERSAL` (or `FORBIDDEN`) code to the canonical error list and a validation-middleware note. (`03-api-specification.md` §error model)
- [ ] Validate that a Settings-changed `EXAMS_ROOT` resolves under a fixed allowed ancestor **before** writing it to the `settings` table — not just when using it. (`01-architecture.md` §10)
- [ ] Enumerate the test vectors: `../../etc/passwd`, URL-encoded `%2e%2e`, absolute paths, valid-relative-but-escapes-after-resolve, and symlinks. Each is a separate `PathResolver` test. (`06-testing-strategy.md` §3)
- [ ] Quantify the upload size cap (e.g., 1 MB) — currently prose only. (`01-architecture.md` §10.5)

### 1.4 Autosave loses answers on hard tab-close — **high**
*Cited by: frontend (P1), architecture (ADR-5), roadmap (F4 risk).*

Debounced autosave does not survive an immediate tab close; the only unrecoverable user-action data loss in the design.

- [ ] Specify a `beforeunload` handler + `navigator.sendBeacon` (or `flushSync` PATCH) as a first-class requirement. (`04-frontend-architecture.md` §8)
- [ ] Add an early **spike task** (no later than F1) to validate the React Router v6 flush-then-navigate / `useBlocker` pattern — it is easy to get subtly wrong and sits inside an already-large L task. (`features/F4-exam-engine.md` T14/T27)

### 1.5 zod-as-contract is asserted, not verified — **medium**
*Cited by: API (#2), testing (#3).*

Client component tests mock `apiClient` entirely; nothing proves a server response parses against the client's schema. Drift is caught only if all types are `z.infer<>`.

- [ ] Mandate that all server response types are `z.infer<>` from the schemas, not hand-declared interfaces. (`01-architecture.md` §10.3)
- [ ] Add one contract test: parse a known-good server response fixture through the client-side schema, assert no parse errors. (`06-testing-strategy.md` §3)
- [ ] Add a test that validates the real `exam-paths.json` against the schema (unit tests use fixtures only). (`06-testing-strategy.md`)

---

## 2. Product findings
*Source: `00-product-overview.md`, `07-post-mvp-roadmap.md`.*

- [ ] **Content coverage (critical):** all 12 existing question files are IAM+EC2 only; AWS SAA spans 7+ domains. A user exhausts the catalogue in under an hour. Define a minimum viable content set before any sharing. (No content roadmap exists today.)
- [ ] **"Bookmark" is undefined** in the Glossary but appears in DoD #6 — make it testable. (`00-product-overview.md` §6, §8)
- [ ] **Multi-select deferred but SAA-real:** Mock exams in MVP are single-answer only and not fully exam-realistic. State this expectation explicitly. (`07-post-mvp-roadmap.md`)
- [ ] **Add `npm run validate`:** a standalone JSON validator reusing the zod schemas serves the Author persona and mitigates the JSON-drift risk at near-zero cost. (currently no authoring-time validation)
- [ ] **F8 scope disproportionate:** consider shipping export-only as part of F7 and deferring the "change Exams root" setting (introduces an orphaned-session edge case with no defined behavior).
- [ ] **Missing DoD coverage:** no criterion covers malformed-file error states or the empty-folder ("no questions available") state.
- [ ] **MVP is single-persona (Certifier).** Interviewer/Author are roadmap personas — guard against engineers reading them as MVP requirements.

---

## 3. Architecture findings
*Source: `01-architecture.md`.*

- [ ] **`SetCatalog` straddles Logic/Data:** it both reads files and maintains the `set_catalog` table. Split into `setCatalogRepo` (all SQL) + `SetCatalogService` (orchestration, no SQL). (§3, §4, §5.1)
- [ ] **Add `PRAGMA journal_mode=WAL`** as a required boot pragma (atomic crash recovery, non-blocking reads). (§5)
- [ ] **Backup is not atomic:** `cp certprep.db` on a live DB can capture corruption. Recommend `VACUUM INTO` (hot) or "stop app before copying." (§10.6)
- [ ] **No corrupt-DB boot path:** add a boot-time `PRAGMA integrity_check` with a graceful user-facing error. (§5.3)
- [ ] **`exam-paths.json` has no `version` field** and `PathResolver` has no unknown-version fallback. Add `"version": 1`. (§1, §10.1)
- [ ] **"Add a domain = JSON + folder" is overstated** — it also requires an `exam-paths.json` edit. Correct the framing or auto-generate the tree from the folder structure. (product §1, architecture §1)
- [ ] **Config merge (env floor + DB override) has no home** — assemble a resolved config object in `container.ts` at startup rather than coupling every service to both sources. (§10.1)
- [ ] **`ExamEngine` will accumulate `questionType` branches** — use a strategy/handler dispatch, not a growing switch. (ADR-8)

---

## 4. Data-model findings
*Source: `02-data-model.md`.*

- [ ] **`PRAGMA foreign_keys = ON` is connection-scoped** in better-sqlite3 — must be re-applied on every connection open, or all `ON DELETE CASCADE` silently stops working. Highest-risk correctness issue (manifests only on discard/delete). (§3.1)
- [ ] **No CHECK constraints on enum columns** (`status`, `mode`, `difficulty`) — a `'in-progress'` vs `'in_progress'` typo is silently accepted and breaks filtering. One-line fix in `0001_init.sql`. (§3.1)
- [ ] **`question_notes`/`question_performance` bind on author-mutable `(set_id, question_id)`** — renumbering a set silently mis-maps notes. Consider a stable app-assigned question identity. (§3.2, §7)
- [ ] **`set_completion.completed_session_id` is labeled FK in the ER diagram but has no `REFERENCES`** (intentional soft ref) — fix the diagram label; document the null-case semantics. (§3.1, §6.1)
- [ ] **Add composite index `(ques_path, set_id)`** for the repeat-avoidance query (current single-column index is weaker). (§6.1)
- [ ] **No CHECK enforcing score fields NOT NULL when `status='completed'`** — validate at the submit handler. (§3.1)
- [ ] **Contradictory states unguarded:** `timer_enabled=1` + `timer_limit_ms=NULL`. Add a CHECK or handler validation. (§3.1)
- [ ] **`correctAnswer` is polymorphic in the snapshot** (string for single, array for multi) — validate at the snapshot-creation boundary, not just at file load. (§1.1, §5)
- [ ] **Confirm migrations run inside a transaction** with `schema_migrations` updated only on commit (interrupted migration → unknown partial state). (§5.3)
- [ ] **No drift between docs and real data** — the sample question JSON and `exam-paths.json` match their documented contracts. ✓

---

## 5. API findings
*Source: `03-api-specification.md`.*

- [ ] **`PUT /api/settings` should be `PATCH`** — it is described as a partial update; `PUT` implies full replacement. (§7)
- [ ] **`GET /api/sessions` has no documented contract** — no query params, response DTO, or pagination, despite being a primary read path. (F6/F7)
- [ ] **`POST /api/sets/upload` collides with `GET /api/sets/:setId`** (the literal `"upload"` matches `:setId`). Move to `POST /api/catalog/upload` and group with `scan`/`diagnostics`. (§sets)
- [ ] **Missing response shapes:** `GET /api/sets/:setId`, `GET /api/catalog/diagnostics`, `PATCH /api/sessions/:id/review` return bodies are unspecified. (§4)
- [ ] **State-machine gaps:** `discarded → *` transitions undocumented; submitting a discarded session falls into a wrong/empty error code. Prefer a unified `SESSION_NOT_IN_PROGRESS`. (§4.1)
- [ ] **RPC-ish endpoints:** consider `POST /api/catalog/scan` (vs `/api/scan`) and `DELETE /api/progress` (vs `/api/progress/reset`) for consistency. (§endpoints)
- [ ] **`mode` on `POST /api/sessions`** should reject `retake_*` values (those go via `/retake`). Enumerate enum values in the spec, not just the data model. (§sessions)
- [ ] **Streaming `GET /api/export`** must detect errors before headers are sent (can't return a JSON error envelope mid-stream). (§export)
- [ ] **Concurrency (multi-tab):** no version/ETag on the session DTO — document the reliance on SQLite write serialization + last-write-wins. (§autosave)

---

## 6. Frontend findings
*Source: `04-frontend-architecture.md`.*

- [ ] **React Query `refetchOnWindowFocus` will stomp the Zustand store** for the in-progress session — set `staleTime: Infinity` (or disable focus refetch) for the `['session', id]` key during an active exam. (§7)
- [ ] **`reveal()` must cancel the pending debounced PATCH** and fire one immediate full-state PATCH, or a late selection PATCH can overwrite `revealed: true`. (§8)
- [ ] **Within-page focus management missing:** on `N`/`P` or navigator click, move focus to the question/first option — keyboard users are otherwise stranded in the navigator. (§9)
- [ ] **Navigator color-coding conveys state by color alone** — add `aria-label` ("Question 3, flagged, answered") and a non-color indicator. (§4.2)
- [ ] **Zustand selector discipline:** `tick()` at 1 Hz will re-render all subscribers unless components use narrow selectors with shallow equality; `ExamTimer` should be the only subscriber to `timer.elapsedMs`. (§8)
- [ ] **Theme FOUC:** `ThemeProvider` reads server-fetched settings — cache the theme token in `localStorage` and read it synchronously in `index.html`. (§6)
- [ ] **Use a headless library** (Radix/Headless UI) for `Dialog`/`Modal` focus-trapping rather than rolling a custom trap. (§5)
- [ ] **`StartExamButton`** needs a disabled/loading state during `POST /api/sessions` to prevent double-submit. (§4)
- [ ] **History filter object** must have stable identity (`useState`/`useReducer`, not inline) or React Query keys miss the cache every render. (§4.5)

---

## 7. Build-plan findings
*Source: `05-feature-roadmap.md`, `features/F0`–`F8`.*

- [ ] **True critical path is F0→F1→F2→F4→F5, not F0→F1→F3→F4→F5.** F2's frontend is gated on F1's shell; F3 finishes earlier and is not the bottleneck. Update the roadmap framing. (`05-feature-roadmap.md` §2)
- [ ] **Move `better-sqlite3` native build (F0-T26) to the top of F0.** On WSL2 (the actual platform) a native-build failure blocks everything; it is currently the last F0 task. (`features/F0-foundation-setup.md`)
- [ ] **Split F4** into F4-alpha (createSession + question delivery + submit + grade — closes M2 as a skeleton) and F4-beta (timer, shuffle, autosave robustness, progressive reveal). F4 is the critical-path bottleneck and highest-risk feature with no mid-point checkpoint. (`features/F4-exam-engine.md`)
- [ ] **F2-T10 ownership is ambiguous between M1 and M2** — the M1 gate says "Start button not yet functional" but F2's DoD says "Start launches a session," and the endpoint lives in F4-T7. Pick one source of truth. (`features/F2-domain-selector.md`)
- [ ] **F3-T8 (completion insert on submit) has split ownership** with F4-T12 — define the `completionRepo.record(quesPath, setId, sessionId)` signature in F0 shared contracts so both implement against it. (`features/F3`, `features/F4`)
- [ ] **Oversized L-tasks** to consider splitting: F4-T1 (createSession bundles pick/load/shuffle/snapshot/persist), F3-T4 (five service methods in one task), F5-T4 (retake-incorrect — re-size to M). (feature files)
- [ ] **Shared-route surface:** `GET /api/sessions` is touched in F1 (count), F4 (list), and F6 — assign sequencing ownership so it isn't built twice incompatibly. (`features/F1`, `F4`, `F6`)
- [ ] **Add a timer/auto-submit spike** alongside the autosave spike (§1.4) — the "prompt vs auto-submit at zero" variant has no task. (`features/F4-exam-engine.md`)

---

## 8. What's already strong (keep as-is)

- Four-layer dependency rule with explicit per-layer "must NOT" constraints, pure `ScoreCalculator`, repository pattern + composition root — testable by design.
- Snapshot-into-session (ADR-4) and "no separate paused state" (ADR-5) are the right calls.
- `127.0.0.1` binding, no `eval`/dynamic require of content, CORS off by default.
- Single Vitest runner across client+server; Supertest for HTTP; `:memory:` SQLite; deliberate single E2E spine.
- ScoreCalculator is the best-tested area in the plan (single/multi/revealed/unanswered/rounding).
- No drift between the documented JSON contracts and the real `Exams/` data.
- F0 tasks are uniformly well-sized and atomic; M0–M1 gates are objective and demoable.

---

## 9. Recommended sequence to close

1. **Write the timer/session-timing spec** (§1.1) — unblocks the most downstream work.
2. **Add three F0/F1 spikes:** native-build smoke (move F0-T26 first), autosave flush-on-navigate, timer-resume round-trip.
3. **Land the cheap correctness fixes:** `PRAGMA foreign_keys` per connection, enum CHECKs, WAL, `PATCH /api/settings`, path-traversal code + vectors.
4. **Define "Bookmark"** and add `npm run validate`.
5. **Split F4** into alpha/beta for an earlier demoable M2.
6. **Establish a minimum viable content set** beyond IAM+EC2 before any sharing.

> **Review method:** phased multi-agent review — product (`00`,`07`) → technical foundation in parallel (`01` architecture, `02` data-model, `03` API, `04` frontend) → delivery in parallel (`05`+`features/`, `06` testing). Findings are advisory; close each box by fixing the source doc or recording an accepted-risk decision.
