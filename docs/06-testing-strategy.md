# CertPrep — Testing Strategy

> How we keep a local-first app correct without over-engineering. The bias: **test the logic that's easy to get wrong and expensive to get wrong** (scoring, validation, snapshotting, completion), and smoke-test the rest.
>
> ⚠️ **Next.js amendments — see [`09` §10](09-nextjs-refinement.md):** API integration tests invoke **Route Handlers** directly with a `Request` (or `next-test-api-route-handler`) instead of supertest/Express; component tests run under Vitest + jsdom with `next/navigation` mocked; the one Playwright E2E spine boots `next start`. The testing *priorities* (ScoreCalculator first, snapshot-integrity regression, autosave idempotency, path-traversal vectors, streak math) are unchanged.

---

## 1. Testing Pyramid (for this app)

```
        ╱╲        E2E (few)         — one happy-path "take an exam end-to-end"
       ╱──╲       Integration       — API endpoints against a temp SQLite DB
      ╱────╲      Component (client) — key screens with mocked apiClient
     ╱──────╲     Unit (many)        — services (esp. ScoreCalculator), validators, repos
```

- **Most value, least cost:** unit tests on the **Logic layer** (pure or near-pure), where the gnarly rules live.
- **Integration tests** prove the API contract in [`03-api-specification.md`](03-api-specification.md) against a real (temporary) SQLite file — this is where snapshotting, autosave idempotency, and completion logic are validated for real.
- **Component tests** cover the exam screen interactions and the cascading selector.
- **One E2E** guards the spine so refactors can't silently break "start → answer → submit → results."

---

## 2. Tooling

| Layer | Tool | Notes |
|---|---|---|
| Server unit + integration | **Vitest** (or Jest) + **supertest** | Vitest keeps one test runner across client/server. |
| Test DB | **better-sqlite3** against a temp file or `:memory:` | Each integration test gets a fresh migrated DB. |
| Schema | **zod** schemas reused as the validation under test | Test fixtures (good/bad sets) live in `server/test/fixtures/`. |
| Client component | **Vitest + React Testing Library** | Mock `apiClient`; assert behaviour, not implementation. |
| E2E | **Playwright** | Boots the prod server against a seeded temp DB + fixture Exams folder. |
| Coverage | Vitest coverage (c8) | Target: high on services, pragmatic elsewhere. |

---

## 3. What to Test, by Layer

### 3.1 Logic services (unit) — the priority
- **ScoreCalculator** (pure): single-choice correct/incorrect; revealed counts as "revealed" not "incorrect"; unanswered counts; percentage rounding; **multi-select** set-equality + partial credit (when added); empty/edge sets. *This module gets the most tests in the codebase.*
- **PathResolver:** valid tree → leaves; missing `label`/`title`; dangling `quesPath`; sandbox/path-traversal rejection; arbitrary depth.
- **SetCatalog/Loader validation:** good set passes; each hard-fail rule (bad `correctAnswer` key, duplicate `id`, missing options) excludes the file with a reason; warnings (missing explanation key) catalogue with annotation; one bad file doesn't abort the scan.
- **ExamEngine:** snapshot is built in presentation order; seeded shuffle is reproducible; `pickNextUnattempted` skips completed sets and signals exhaustion; retake-incorrect builds the right subset; live DTO **omits** correct answers until reveal.
- **SessionManager:** autosave is idempotent; reveal is monotonic; pause/resume preserves state; discard cascades.
- **StatsService:** average/best/streak math, including streak across day boundaries and gaps.

### 3.2 Data layer (unit/integration)
- Migration runner applies `0001_init` cleanly and is idempotent (re-run = no-op).
- Repos: round-trip insert/read; cascade delete of answers with session; unique constraints (`set_completion`, `session_answers`).

### 3.3 API (integration)
For each endpoint in the spec: happy path + the documented error codes. Critical cases:
- `POST /sessions` → `201` with **no** `correctAnswer` in payload; `409 SETS_EXHAUSTED` when all completed.
- `PATCH /sessions/:id` → autosave idempotent; `reveal:true` returns correct data for that question only; `409` when not in progress.
- `POST /sessions/:id/submit` → score matches ScoreCalculator; inserts `set_completion`; second submit → `409`.
- `GET /history` → filters and sorting honoured; pagination `total` correct.
- `PUT /settings` → changing `exams_root` triggers rescan; invalid root → `400`.
- Path-traversal attempts on `quesPath`/upload targets → rejected.

### 3.4 Client (component)
- `<DomainSelector>`: levels appear progressively; Start enabled only at a leaf with remaining sets; renders purely from JSON (drive it with a fixture tree of unusual depth).
- `<ExamScreen>` via the store: selecting answers, flagging, give-up reveal, navigator colour states, timer pause; autosave PATCH is debounced and flushed on pause.
- `<ResultsScreen>`: filter (incorrect/revealed/all) shows the right subset; retake actions call the right endpoint.
- `<HistoryScreen>`: filter changes re-query; inline note/bookmark optimistic update + rollback.

### 3.5 E2E (one spine test)
Seed a temp DB + a fixture `Exams/` folder + `exam-paths.json`; via the browser: navigate the selector → start → answer a few, flag one, give up on one → pause → resume → submit → verify summary numbers → open results detail → retake incorrect. Assert the history row and stats updated.

---

## 4. Fixtures

- `server/test/fixtures/exam-paths/` — valid tree, deep tree, broken tree (missing label, dangling path).
- `server/test/fixtures/sets/` — `valid_single.json`, `missing_explanation.json` (warning), `bad_correct_key.json` (error), `duplicate_ids.json` (error), `multi_unsupported.json` (`422` path), the real `aws_saa_*` sets for realism.
- A `makeTestDb()` helper: temp file, run migrations, return repos.
- A `seedSession()` helper to create in-progress/completed sessions for history/results tests.

---

## 5. Conventions & CI

- Tests colocated (`*.test.ts(x)`) or under `__tests__/`; fixtures under `test/fixtures`.
- **Deterministic:** seed all shuffles in tests; freeze time (`vi.useFakeTimers`) for timer/streak tests.
- **Isolated:** every integration test gets its own temp DB; no shared global state.
- **CI** (GitHub Actions or local `npm test`): typecheck → lint → unit → integration → build → (optional) E2E. Native `better-sqlite3` rebuild step pinned to the Node version (see [`features/F0-foundation-setup.md`](features/F0-foundation-setup.md)).

---

## 6. Per-Feature Testing Requirements

Each feature file lists its own test tasks. The **non-negotiables**:
- Any new **service rule** → unit test.
- Any new **endpoint** → integration test (happy + documented errors).
- Any new **interactive screen** → at least one component test of the primary interaction.
- **Scoring or snapshot changes** → expand ScoreCalculator/ExamEngine tests first (these are the highest-risk areas).
