# CertPrep — Post-MVP Roadmap

> Everything beyond the MVP, by horizon, with the architectural hook that makes each one cheap to add. The schema and layering ([`01-architecture.md`](01-architecture.md), [`02-data-model.md`](02-data-model.md)) were forward-designed so these land without painful rewrites.

> **Fence:** none of this is MVP. Build [`05-feature-roadmap.md`](05-feature-roadmap.md) first. This doc exists so MVP decisions don't paint us into a corner.

---

## 1. Short Term (Weeks 1–4 after MVP)

| Feature | What | Hook already in place |
|---|---|---|
| **Keyboard shortcuts** | `1–4`/`A–D` select, `Enter` submit/next, `N`/`P` navigate, `F` flag, `G` give up; "?" cheat-sheet. | Exam store actions already map 1:1 to keys; `useKeyboardShortcuts` stub in F4. |
| **Per-question confidence rating** | Easy/Medium/Hard as *felt*, captured per question. | `session_answers.confidence` column ships in MVP; UI is `<ConfidenceRating>`. |
| **Single-result PDF export** | Export one exam's results as PDF. | Results DTO is complete; add a print stylesheet + `window.print()` or a PDF lib. |
| **Home quick-stats widget** | Last score, next set to take, current streak. | `/api/stats` + `/api/exam-paths` `remainingSets`; `<QuickStatsWidget>` placeholder in F2. |

---

## 2. Medium Term (Months 1–3)

| Feature | What | Hook already in place |
|---|---|---|
| **Spaced repetition engine** | Track per-question performance; surface weak questions more often. | `question_performance` table designed (§3.2 data model); StatsService extends. |
| **Multi-select question type** | "Select all that apply" (common in AWS SAA). | `questionType: "multi"`, `correctAnswer` as array, ScoreCalculator set-equality + partial credit already specced. |
| **Interview / freetext mode** | Open-ended, no auto-grade, self-rated after revealing a model answer. | `questionType: "freetext"`; reveal flow + self-rating reuse the give-up + confidence machinery. |
| **Question-linked notes** | Per-question notes that resurface on future appearances. | `question_notes` table designed; notes UI generalises from result-level notes. |
| **Tag system** | Filter exams by topic tag across sets. | `tags`/`set_tags` tables designed; history filters extend. |
| **Progress dashboard** | Score-over-time, weak-topic heatmap, time-per-question charts. | All inputs already captured: `score_percent`, `completed_at`, `time_spent_ms`, confidence, (later) tags. |

---

## 3. Long Term (Months 3–12)

| Feature | What | Hook / consideration |
|---|---|---|
| **Question editor UI** | Create/edit sets in-app, export back to JSON. | Must round-trip the exact JSON contract; validation reuses the loader's zod schema. Writes to `Exams/` (or uploads) → triggers rescan. |
| **AI-assisted explanations** | "Explain differently" per question via an *optional* user-supplied LLM API key. | Stays opt-in and local-config; key stored in `settings` (never committed); the only feature that touches the network — keep it isolated and clearly flagged. |
| **Sync / backup** | Optional export to private S3 / Google Drive. | Builds on the existing full-state export; remains opt-in; never on by default (privacy principle). |
| **Multi-profile support** | Separate history/progress per named profile. | Biggest schema impact: add `profile_id` to runtime tables, or one DB file per profile (preferred — keeps the "one portable file" model per profile). Decide before this lands. |
| **Community question sets** | Browse/download sets from a hosted registry. | Download → validate via the same loader → drop into `Exams/`. Registry is read-only fetch; sets remain plain JSON. |
| **Ordered-steps question type** | Drag-and-drop sequence questions. | `questionType: "ordered"`, `correctAnswer` as ordered array; ScoreCalculator sequence match; new `<OrderedOptions>` component. |

---

## 4. Architectural Watch-Items (decide before building these)

| Item | Trigger | Decision needed |
|---|---|---|
| **Multi-profile data model** | Before multi-profile | One DB per profile (recommended — preserves portability) vs `profile_id` columns. |
| **Network egress** | Before AI explanations / sync | Keep all network strictly opt-in, isolated in a dedicated service, never on the exam hot path; make it obvious in the UI when data would leave the machine. |
| **Question normalisation** | Before SR + dashboard at scale | SR/dashboard query per-question performance heavily; revisit whether to index questions in SQLite (still keeping JSON as source of truth). |
| **Migration complexity** | When forward-designed tables activate | Each ships its own numbered migration; keep forward-only + document the file-copy backup/restore path. |

---

## 5. Explicitly Not Planned

- Real-time collaboration / multi-user concurrency (contradicts local-first single-user).
- Server-side accounts or cloud hosting of the app itself.
- Telemetry / analytics that phone home.

These would change the product's identity; if ever revisited, they start a new product plan, not a roadmap item.
