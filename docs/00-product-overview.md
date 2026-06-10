# CertPrep — Product Overview

> **Status:** Planning · **Audience:** Product + Engineering · **Source of truth for scope:** this document + [`_docs/CertPrep_Product_Plan.docx`](../_docs/CertPrep_Product_Plan.docx)

CertPrep is a **local-first, domain-agnostic exam practice platform**. You load JSON question sets, take timed exams, track your history, and review detailed per-option explanations — all without a server account or an internet connection.

---

## 1. Vision

A single tool that grows with your study goals. It begins with AWS Solutions Architect Associate (SAA) prep but generalises to **any** multiple-choice domain — DevOps, software engineering, interview prep — because **the JSON format is the contract**. Everything else adapts to it.

The guiding promise: **adding a new domain is a JSON + folder operation, never a code change.**

---

## 2. Goals & Non-Goals

### Goals (MVP)
- Run entirely locally (`npm start`) at `http://localhost:3000`, fully offline.
- Drive the entire exam catalogue from `exam-paths.json` + the `Exams/` folder.
- Deliver a focused exam loop: one question at a time, flagging, give-up reveal, pause/resume.
- Persist everything (in-progress exams, history, notes, settings) in a single portable SQLite file that survives refresh and restart.
- Give detailed, educational results: per-option explanations, tips, filters, retake.
- Track history with rich filtering and aggregate stats.

### Non-Goals (MVP)
- **No authentication / multi-user.** Single local user. (Multi-profile is long-term.)
- **No cloud sync / hosting.** Optional backup is long-term.
- **No question authoring UI.** Sets are authored as JSON by hand for now. (Editor is long-term.)
- **No auto-grading of free-text.** Free-text/interview mode is medium-term and self-graded.
- **No telemetry / analytics phone-home.** Ever.

---

## 3. Target Users (Personas)

| Persona | Description | Primary needs |
|---|---|---|
| **The Certifier** (primary) | Studying for a specific cert (AWS SAA). Wants timed, realistic practice and to find weak areas. | Timed mock exams, history trends, retake-incorrects, detailed explanations. |
| **The Interviewer** (medium-term) | Prepping for SWE/system-design interviews. | Free-text self-graded questions, notes, tagging. |
| **The Author** (you) | Writes question sets in JSON. | A format that is forgiving, validated, and zero-config to publish (drop a file in a folder). |

All three are the **same single local user** wearing different hats. The product optimises for a fast, private, friction-free solo study loop.

---

## 4. Product Principles

1. **Local-first & private.** No network dependency after install. Data never leaves the machine unless the user explicitly exports it.
2. **JSON is the contract.** The catalogue, navigation, and questions are data. Code reads data; it does not hardcode domains.
3. **Backward-compatible by default.** New question capabilities (e.g. `questionType`) are additive — an absent field always has a sensible default.
4. **The study loop is sacred.** The exam screen is distraction-free and fast. Everything else (history, settings) orbits it.
5. **Explanations over scores.** A wrong answer is a teaching moment: every option is explained, not just marked.
6. **Portable & durable.** The entire state is one `.db` file plus the `Exams/` folder. Copy them and you've backed up everything.
7. **Resumable.** Life interrupts study. Any exam can be paused and resumed exactly where it left off.

---

## 5. Scope Map (Plan → This Repo)

The product plan defines eight MVP features plus a set of recommended enhancements and a multi-horizon roadmap. They map to our docs as follows:

| Plan item | Where it lives in these docs |
|---|---|
| F1 App shell & navigation | [`features/F1-app-shell-navigation.md`](features/F1-app-shell-navigation.md) |
| F2 Domain selector | [`features/F2-domain-selector.md`](features/F2-domain-selector.md) |
| F3 Question set loader | [`features/F3-question-set-loader.md`](features/F3-question-set-loader.md) |
| F4 Exam engine | [`features/F4-exam-engine.md`](features/F4-exam-engine.md) |
| F5 Results screen | [`features/F5-results-screen.md`](features/F5-results-screen.md) |
| F6 Paused exams | [`features/F6-paused-exams.md`](features/F6-paused-exams.md) |
| F7 History | [`features/F7-history.md`](features/F7-history.md) |
| F8 Settings | [`features/F8-settings.md`](features/F8-settings.md) |
| Plan §5 enhancements (timed mode, retake-incorrects, progressive reveal, shuffle, domain icons) | Folded into the relevant feature files; tracked in [`05-feature-roadmap.md`](05-feature-roadmap.md) |
| Project scaffolding (implied, not numbered) | [`features/F0-foundation-setup.md`](features/F0-foundation-setup.md) |
| Roadmap (short/medium/long term) | [`07-post-mvp-roadmap.md`](07-post-mvp-roadmap.md) |

> **F0** is added by us: the product plan assumes a working scaffold, but the scaffold itself (tooling, DB bootstrap, migration runner, base server + client, design tokens) is real work and is sequenced first.

---

## 6. Success Criteria (MVP "Definition of Done")

The MVP is complete when a user can, with no code changes and no internet:

1. Run `npm install && npm start`, open `localhost:3000`, and see their domain tree built from `exam-paths.json`.
2. Drill through cascading dropdowns to a difficulty leaf and start an exam from a not-yet-completed set.
3. Answer questions one at a time, flag some, give up on one (revealing explanations), and navigate freely via the question navigator.
4. Pause mid-exam, refresh the browser, resume from the Paused list, and find every answer/flag/timer value intact.
5. Submit and see a score summary plus a filterable, fully-explained detailed review.
6. Bookmark the result, add a note, and retake **only the incorrect** questions.
7. Open History, filter by difficulty and score range, and see aggregate stats (total exams, average, best, streak).
8. Change the `Exams/` root path and export history as JSON/CSV from Settings.

Each feature file restates its own, finer-grained Definition of Done.

---

## 7. Key Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Question JSON drifts or is malformed | Exam can't load / crashes | Strict schema validation on scan with per-file error surfacing (never crash the catalogue for one bad file). See [`02-data-model.md`](02-data-model.md). |
| A set's JSON is edited/deleted **after** an exam started | In-progress exam or history detail breaks | **Snapshot questions into the session** at start. History never depends on live files. See [`01-architecture.md` §8](01-architecture.md). |
| `better-sqlite3` native build issues across machines | Can't start app | Document Node version, provide rebuild script, pin version. See [`features/F0-foundation-setup.md`](features/F0-foundation-setup.md). |
| Scope creep from the roadmap into MVP | MVP never ships | Roadmap items are explicitly fenced off in [`07-post-mvp-roadmap.md`](07-post-mvp-roadmap.md); schema is forward-designed so they need no migration pain. |
| Path traversal via Exams root / uploads | Reads outside intended folder | Resolve & sandbox all paths under the configured root; validate uploads. See [`01-architecture.md` §10](01-architecture.md). |

---

## 8. Glossary

| Term | Meaning |
|---|---|
| **Domain** | Top-level study area (Cloud, DevOps, SWE, Interview). |
| **Path / quesPath** | A leaf in `exam-paths.json` pointing to a folder of question JSON files (e.g. `Exams/Cloud/AWS/Solutions-Architect-Associate/Easy`). |
| **Set** | One JSON file = one question set, identified by `setId` and `setTitle`. |
| **Session** | One attempt at a set (in-progress, completed, or discarded). The unit of history. |
| **Snapshot** | The frozen copy of questions (and their presentation order) stored on a session at start. |
| **Reveal / Give up** | Showing the correct answer + all explanations for a question without scoring it as a normal answer. |
| **Leaf** | A terminal node in the path tree that has a `quesPath` and therefore can start an exam. |

---

## 9. Document Map

Read in this order:

1. **This file** — what & why.
2. [`01-architecture.md`](01-architecture.md) — how the system is shaped (read before coding anything).
3. [`02-data-model.md`](02-data-model.md) — the schema and JSON contracts.
4. [`03-api-specification.md`](03-api-specification.md) — the server contract.
5. [`04-frontend-architecture.md`](04-frontend-architecture.md) — the client shape.
6. [`05-feature-roadmap.md`](05-feature-roadmap.md) — the build order and dependency graph.
7. [`features/`](features/) — pick a feature and implement its task list.
8. [`06-testing-strategy.md`](06-testing-strategy.md) and [`07-post-mvp-roadmap.md`](07-post-mvp-roadmap.md) — supporting plans.
