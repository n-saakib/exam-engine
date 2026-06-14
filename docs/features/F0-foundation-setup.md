# F0 — Foundation & Setup (Next.js)

> **Milestone:** M0 ("It boots") · **Depends on:** nothing · **Blocks:** everything
> Refined for Next.js — read [`09-nextjs-refinement.md`](../09-nextjs-refinement.md) first. This is the scaffold every other feature (and the F1∥F2∥F3 parallel agents) builds on, so it must be correct and green before anything branches off it.

---

## Goal

Stand up a single **Next.js (App Router, TypeScript)** project so that `npm install && npm run dev` serves an empty shell at `localhost:3000`, the SQLite DB is created and migrated on boot (via `instrumentation.ts`), and `GET /api/health` responds. Establish the shared zod contracts, the error envelope, design tokens, the typed `apiClient` + React Query, and the Vitest harness that F1–F8 assume.

## Acceptance Criteria

- `npm install` installs the single package.
- `npm run dev` runs `next dev` on `:3000` with HMR (screens **and** `/api`); no second process, no proxy.
- `npm start` runs `next build` (or assumes it) then `next start` on `:3000` serving the same app.
- On boot, `data/certprep.db` is created (if absent) and `0001_init.sql` is applied inside a transaction; re-running is a no-op (idempotent). `PRAGMA integrity_check` runs first; corruption → friendly fatal.
- `GET /api/health` → `200 { status, version, schemaVersion, examsRoot, setsIndexed }`.
- A bad request to a stub endpoint returns the standard error envelope `{ "error": { code, message, details } }`.
- `npm test` runs and passes a trivial unit test, a health-check integration test (handler invoked directly), and a client render test.
- `npm run typecheck` and `npm run lint` pass.

---

## Tasks

### Project scaffolding
- [ ] **F0-T26 → DO FIRST** (S) **Native build smoke:** confirm `better-sqlite3` installs and opens a DB on this machine (WSL2/Node 22). Pin Node major (`.nvmrc` / `engines`), pin `better-sqlite3`, add a `rebuild` script + troubleshooting note. *(Moved to the top per `08` §7 — a native-build failure blocks everything.)*
- [ ] **F0-T1** (M) Scaffold Next.js App Router + TS (`create-next-app`-equivalent): `next`, `react`, `react-dom`, TypeScript, Tailwind, ESLint. `src/` dir, `@/*`→`src/*` path alias. Root `package.json` scripts: `dev`, `build`, `start`, `test`, `test:e2e`, `lint`, `typecheck`, `validate`.
- [ ] **F0-T2** (S) `next.config.ts`: `serverExternalPackages: ['better-sqlite3']`; React strict mode. Extend `.gitignore`: `data/`, `.next/`, `node_modules/`, `*.db`, `*.db-*` (WAL/SHM), `coverage/`, `playwright-report/`, `test-results/`.
- [ ] **F0-T3** (S) `tsconfig.json` strict; ensure `src/domain/types.ts` is import-safe from both server and client (type-only).
- [ ] **F0-T4** (S) ESLint + Prettier; an import rule (or `import 'server-only'` discipline) keeping `src/server/**` out of Client Components.

### Data layer (server)
- [ ] **F0-T8** (M) `src/server/data/db.ts` — `import 'server-only'`; `better-sqlite3` opened via a **`globalThis` singleton** (HMR-safe); set `PRAGMA journal_mode=WAL` and **`PRAGMA foreign_keys=ON` on every open** ([`09` §5, §7.2](../09-nextjs-refinement.md)).
- [ ] **F0-T9** (M) `src/server/data/migrate.ts` — runner: create `schema_migrations`, apply unapplied numbered SQL files **in a transaction**, write the version row only on commit; idempotent.
- [ ] **F0-T10** (M) `src/server/data/migrations/0001_init.sql` — all MVP tables from [`02-data-model.md` §3.1](../02-data-model.md) **plus the §3.1.1 refinements**: enum CHECKs (`status`/`mode`/`difficulty`/catalog `status`/`source`), the `timer_enabled ⇒ timer_limit_ms` CHECK, and `CREATE INDEX idx_completion_path_set ON set_completion(ques_path, set_id)`.
- [ ] **F0-T8b** (S) `src/server/boot.ts` — `integrityCheck()`, `runMigrations()`, `bootScan()` (bootScan is a no-op stub until F3); all idempotent.
- [ ] **F0-T7** (S) `instrumentation.ts` (repo root) — `register()` guarded to `process.env.NEXT_RUNTIME==='nodejs'`, dynamically imports and runs `boot.ts`. Enable `instrumentationHook` if the Next version requires it.

### API layer (Route Handlers)
- [ ] **F0-T11** (S) `src/server/http/errors.ts` — `AppError(code, message, httpStatus, details?)` + the canonical `ERROR_CODES` ([`09` §6](../09-nextjs-refinement.md)).
- [ ] **F0-T12** (M) `src/server/http/defineHandler.ts` + `respond.ts` — wrapper that zod-parses `body`/`query`/`params`, calls the handler, and maps `AppError`/`ZodError`→`{ error: {...} }` with the right status (`ZodError`→`400 VALIDATION_ERROR`); `json()`/`created()`/`noContent()` helpers.
- [ ] **F0-T13** (S) `src/app/api/health/route.ts` — `GET` → `{ status:'ok', version, schemaVersion, examsRoot, setsIndexed }`; `runtime='nodejs'`, `dynamic='force-dynamic'`.
- [ ] **F0-T14** (S) `src/server/container.ts` — composition root: assemble the resolved config (env floor + future DB overrides) and wire repos→services (mostly empty stubs now; real wiring as services land).
- [ ] **F0-T5** (M) `src/server/config.ts` — env + defaults: `PORT`(3000), `DB_PATH`(`./data/certprep.db`), `EXAMS_ROOT`(`./Exams`), `EXAM_PATHS_FILE`(`./exam-paths.json`), `LOG_LEVEL`. `.env.example` committed.

### Shared contracts
- [ ] **F0-T15** (M) `src/domain/schemas.ts` — zod schemas for the **question set** (incl. `questionType` default `'single'`, 2–6 single-letter option keys, `correctAnswer` ∈ keys, layered hard-error vs warning rules) and **`exam-paths.json`** (recursive node grammar, optional `icon`, `"version": 1` with unknown-version fallback) per [`02` §1–2](../02-data-model.md).
- [ ] **F0-T16** (M) `src/domain/types.ts` — DTO types as **`z.infer<>`** (live session DTO, results DTO, history row, session-list row, settings) — **no hand-declared interfaces** ([`09` §7.7](../09-nextjs-refinement.md)). Add `resolveUnderRoot(root, candidate)` path-sandbox helper + `PATH_TRAVERSAL` usage stub in `src/server/http` (or a `paths.ts` util) for F2/F3 to consume.
- [ ] **F0-T2b** (S) Seed/keep the real `exam-paths.json` with `"version": 1` added (back-compatible).

### Client skeleton
- [ ] **F0-T17** (M) Root `src/app/layout.tsx` (`<html>` + `globals.css` + providers + a no-FOUC theme `<script>`) and a placeholder `src/app/page.tsx`. `not-found.tsx`.
- [ ] **F0-T18** (M) Tailwind set up; `tailwind.config.ts` with the **semantic tokens** from [`04` §6](../04-frontend-architecture.md); `globals.css` defines the CSS variables for `:root` and `[data-theme="dark"]` (incl. outcome/navigator tokens: correct/incorrect/revealed/flagged/current).
- [ ] **F0-T19** (S) `src/lib/apiClient.ts` — typed `fetch` wrapper, base `/api`, throws `ApiError` carrying `code`/`message`/`details`/`status`.
- [ ] **F0-T20** (S) `src/lib/providers.tsx` (`"use client"`) — `QueryClientProvider` (+ sensible defaults; `['session',id]` will use `staleTime:Infinity` later) and `src/lib/queryKeys.ts`.
- [ ] **F0-T21** (M) Base component primitives: `Button`, `Card`, `Dialog` (Radix), `Toast`, `Spinner`, `EmptyState` — typed, token-themed, keyboard-accessible (enough to be usable; polished in F1).
- [ ] **F0-T22** (S) App Router placeholder pages for every route in [`04` §2](../04-frontend-architecture.md) (`exam/[id]`, `results/[id]`, `history`, `history/[id]`, `resume`, `settings`) so links resolve.

### Test harness
- [ ] **F0-T23** (M) Vitest config (projects: node env for `src/server/**`, jsdom for client); `makeTestDb()` helper (temp file, runs migrations, returns a `getDb`/repos handle, **`foreign_keys` ON**).
- [ ] **F0-T24** (S) One API integration test: invoke the `health` Route Handler with a `Request` and assert the shape; one error-envelope test (a handler that throws `AppError` yields the documented JSON).
- [ ] **F0-T25** (S) React Testing Library set up; one trivial render test of the shell.
- [ ] **F0-T26b** (S) Playwright installed + `playwright.config.ts` stub (spine test authored in F4/integration).

### Ops / docs
- [ ] **F0-T27** (S) Root `README` "how to run" (dev vs start, Node version, `rebuild`, `npm run validate`).

---

## Testing
- [ ] Migration runner: applies `0001_init`; second run is a no-op (assert one `schema_migrations` row).
- [ ] FK cascade smoke (guards the per-connection pragma): insert a session + answers, delete the session, assert answers gone.
- [ ] `/api/health` integration test returns the expected shape.
- [ ] Error envelope test: a route that throws `AppError` yields the documented JSON.
- [ ] Client renders the shell without crashing.

## Definition of Done
- [ ] `npm run dev` and `npm start` both serve `:3000`; DB bootstraps + migrates idempotently on boot.
- [ ] Shared zod schemas/types compile and import cleanly from both a Route Handler and a Client Component (types only on the client).
- [ ] `better-sqlite3` is never bundled (server-external) and never imported by a client module (`server-only` guard holds).
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all green.
- [ ] **Update [`../../CLAUDE.md`](../../CLAUDE.md)** to document the new Next.js app structure (`src/app`, `src/server`, `src/domain`, `data/`) — a significant repo-structure change per its self-maintenance rule.
