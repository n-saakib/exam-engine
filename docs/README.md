# CertPrep — Product & Engineering Docs

This folder is the complete plan for **CertPrep**, a local-first, domain-agnostic exam practice platform. It turns the product brief in [`../_docs/CertPrep_Product_Plan.docx`](../_docs/CertPrep_Product_Plan.docx) into an implementable architecture, a feature-by-feature build plan, and per-feature task breakdowns.

> **Status:** Implementation in progress on **Next.js** (App Router) + SQLite. The original Express + Vite runtime was refined to a single Next.js app — **read [`09-nextjs-refinement.md`](09-nextjs-refinement.md) first**, then `00`–`02`. The repo also contains the question-set data (`Exams/`, `exam-paths.json`) the app reads.

---

## Start here

| Read | Doc | What it answers |
|---|---|---|
| 1 | [`00-product-overview.md`](00-product-overview.md) | What is CertPrep, for whom, what's in/out of MVP, success criteria. |
| 2 | [`01-architecture.md`](01-architecture.md) | **How the system is shaped** — layers, runtime, project layout, key decisions. Read before coding. |
| 3 | [`02-data-model.md`](02-data-model.md) | SQLite schema + the JSON contracts (question sets, `exam-paths.json`). |
| 4 | [`03-api-specification.md`](03-api-specification.md) | Every HTTP endpoint, payload, and error. |
| 5 | [`04-frontend-architecture.md`](04-frontend-architecture.md) | React structure, state strategy, components, design tokens. |
| 6 | [`05-feature-roadmap.md`](05-feature-roadmap.md) | **Build order**, dependency graph, milestones. |
| 7 | [`features/`](features/) | Pick a feature → implement its small-task checklist. |
| 8 | [`06-testing-strategy.md`](06-testing-strategy.md) · [`07-post-mvp-roadmap.md`](07-post-mvp-roadmap.md) | How we test; what comes after MVP. |
| 9 | [`08-analysis-review.md`](08-analysis-review.md) | **Pre-implementation review** — gaps, risks, and an actionable checklist to close before/while building. Read before F4. |
| ★ | [`09-nextjs-refinement.md`](09-nextjs-refinement.md) | **Authoritative delta** — the Express→Next.js pivot, the `src/` layout, the better-sqlite3⨯Next gotchas, the endpoint→Route-Handler map, and the `08` findings promoted to decisions (timer model, FK-per-connection, path-traversal, enum CHECKs). **Read before `01`/`03`/`04`/`F0`.** |

---

## The MVP at a glance

A single **Next.js** process renders the React screens and serves the JSON API (Route Handlers) at `localhost:3000`; state lives in one SQLite file; question content lives in JSON under `Exams/`. The promise: **add a domain by dropping in JSON + a folder (and one `exam-paths.json` edit) — never app code.**

```
F0 Foundation → F1 Shell → (F2 Selector ∥ F3 Loader) → F4 Exam engine → F5 Results
                                                          ↘ F6 Paused
                                              F5/F4 → F7 History → F8 Settings
```

| ID | Feature | Doc |
|---|---|---|
| F0 | Foundation & setup | [features/F0-foundation-setup.md](features/F0-foundation-setup.md) |
| F1 | App shell & navigation | [features/F1-app-shell-navigation.md](features/F1-app-shell-navigation.md) |
| F2 | Domain selector | [features/F2-domain-selector.md](features/F2-domain-selector.md) |
| F3 | Question set loader | [features/F3-question-set-loader.md](features/F3-question-set-loader.md) |
| F4 | Exam engine (core loop) | [features/F4-exam-engine.md](features/F4-exam-engine.md) |
| F5 | Results screen | [features/F5-results-screen.md](features/F5-results-screen.md) |
| F6 | Paused exams | [features/F6-paused-exams.md](features/F6-paused-exams.md) |
| F7 | History | [features/F7-history.md](features/F7-history.md) |
| F8 | Settings | [features/F8-settings.md](features/F8-settings.md) |

Milestones: **M0** boots → **M1** pick an exam → **M2** take one end-to-end → **M3** track & manage. See [`05-feature-roadmap.md`](05-feature-roadmap.md).

---

## Key decisions (the ones that shape everything)

- **Single Next.js (App Router) process** renders screens + serves the `/api` Route Handlers on `:3000` (`npm start` → `next start`; `next dev` in dev — no proxy). *(Refined from Express + Vite — see [`09`](09-nextjs-refinement.md).)*
- **`better-sqlite3` (synchronous)** in the Node runtime — simplest correct code for a single local user; migrations on boot via `instrumentation.ts`.
- **TypeScript end-to-end + shared zod schemas** — one typed contract for client and server.
- **Snapshot questions into each session** — in-progress exams and history are immune to file edits/deletes. *(The most important data-integrity decision — see [ADR-4](01-architecture.md#12-architecture-decision-records-summary).)*
- **No separate "paused" state** — `in_progress` + reliable autosave = always resumable.
- **`questionType` defaults to `single`** — backward-compatible path to multi/ordered/freetext.

Full list: [`01-architecture.md` §12](01-architecture.md#12-architecture-decision-records-summary).

---

## How to use these docs to implement

1. Read `00` → `01` → `02` → `03` → `04` once for context.
2. Open [`05-feature-roadmap.md`](05-feature-roadmap.md) and start at **F0**.
3. For each feature: work its task checklist top-to-bottom; satisfy its Acceptance Criteria; meet its Definition of Done (incl. tests).
4. When repo structure, exam paths, or the question format change, **update [`../CLAUDE.md`](../CLAUDE.md)** (it self-maintains those topics) and the relevant doc here.

---

## Document conventions

- Task IDs: `F<feature>-T<n>` (e.g. `F4-T11`); sizes `(S/M/L)`.
- Layer terms (Presentation/API/Logic/Data) are defined in [`01-architecture.md` §3](01-architecture.md).
- The API spec is the contract; the executable version is `server/src/domain/schemas.ts` (zod) once F0 lands.
- Diagrams are Mermaid (render on GitHub).
