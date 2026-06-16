# F4 — Exam Engine

> **Milestone:** M2 ("Take an exam end-to-end") · **Depends on:** F2, F3 · **Blocks:** F5, F6, F7
> Plan F4: "The core loop: one question at a time with flagging, reveal, and pause." **This is the heart of the product — treat it as the highest-risk feature and test it hardest.**

---

## Goal

Run a full exam session: create it (load set, shuffle, snapshot), present one question at a time with a progress bar / navigator / timer, let the user select, flag, give up (reveal), navigate freely, and pause (saving full state to SQLite). Everything autosaves so the session is always resumable. Submitting hands off to F5.

## Plan Requirements
- Progress bar: question index, flagged count, elapsed timer.
- Question navigator: numbered buttons, colour-coded by state.
- Flag button per question — mark for review, jump back freely.
- Give up / Submit button: on no selection, label "Give up" — reveals answer, all option explanations, and Tips immediately. On ≥1 selection, label "Submit" — commits the current selection and reveals per-option detail inline (does not auto-advance). On the last question, also opens the existing exam-submit dialog.
- Pause saves full state to SQLite (answers, flags, time, position).
- **(§5)** Timed mode toggle (pause pauses the timer); progressive explanation reveal; shuffle questions (and options).

## Acceptance Criteria
- Starting an exam creates an `in_progress` session with a question snapshot; the client receives a live DTO **without** correct answers.
- Exactly one question shows at a time; the navigator lets the user jump to any question; colours reflect answered/flagged/revealed/current/unanswered.
- The progress bar shows index, % answered, and flagged count; the timer counts (down if timed, up if not) and **stops when paused**.
- Flagging toggles per question and updates the navigator + flagged count.
- Give up (no selection) reveals the correct answer, every option's explanation, and Tips for that question, and marks it "revealed" (excluded from the correct/incorrect tally).
- Submitting a question (≥1 selected) commits the current selection, reveals inline per-option detail (progressive: correctness first, explanations behind an expander), and — on the last question — also opens the exam-submit dialog so the user can finalize.
- Pausing flushes state; on refresh/resume the exact position, answers, flags, reveals, and elapsed time are restored.
- Submitting the exam grades it and routes to results.

---

## Tasks

### Backend — session creation & snapshot
- [ ] **F4-T1** (L) `ExamEngine.createSession({ quesPath, setId?, mode, options })`: pick/load set (via F3), apply seeded question shuffle (if enabled), build the **snapshot** (presentation order; option order if `shuffle_options`), compute timer limit, persist session + blank `session_answers` in a transaction.
- [ ] **F4-T2** (M) Snapshot builder per [`02-data-model.md` §5](../02-data-model.md): includes `correctAnswer`/`explanations`/`Tips` for grading, plus `order`/`optionOrder`.
- [ ] **F4-T3** (S) Seeded RNG so shuffle is reproducible from `shuffle_seed` (testability + integrity).
- [ ] **F4-T4** (S) Timer limit derivation: per-set/explicit `timerMinutes` or untimed; store `timer_enabled`/`timer_limit_ms`.
- [ ] **F4-T5** (S) `422 UNSUPPORTED_QUESTION_TYPE` when the set declares a not-yet-implemented type.

### Backend — live state & updates
- [ ] **F4-T6** (M) Live-DTO mapper: strip `correctAnswer`/`explanations`/`Tips` for unrevealed questions; include them only for revealed ones (and when completed). **Enforced server-side.**
- [ ] **F4-T7** (M) `POST /api/sessions` route → `201` live DTO; handles `SETS_EXHAUSTED`.
- [ ] **F4-T8** (M) `GET /api/sessions/:id` → live DTO; redirect hint if not in progress.
- [ ] **F4-T9** (L) `PATCH /api/sessions/:id` (autosave): partial update of `currentIndex`, `elapsedMs` (clamp to limit if timed), and per-question `selected`/`flagged`/`revealed`/`timeSpentMs`/`locked`. Idempotent. `reveal:true` attaches+returns correct data for that question; monotonic.
- [ ] **F4-T10** (S) `SessionManager`: persistence helpers, `listInProgress`, autosave write path, crash-safe reconstruction.

### Backend — grading & submit
- [ ] **F4-T11** (L) `ScoreCalculator` (pure): grade snapshot+answers → per-question outcome (`correct|incorrect|revealed|unanswered`) and totals + `score_percent`. Single-choice now; structured so multi is a later branch.
- [ ] **F4-T12** (M) `POST /api/sessions/:id/submit`: grade, write score fields + outcomes, set `status=completed`, insert `set_completion` (F3-T8), return results DTO. `409` if already completed.
- [ ] **F4-T13** (S) `DELETE /api/sessions/:id` (discard) — answers cascade; `409` if completed.

### Frontend — exam store & screen
- [ ] **F4-T14** (L) Zustand `ExamStore` per [`04-frontend-architecture.md` §8](../04-frontend-architecture.md): load DTO → state; actions (`select`, `toggleFlag`, `reveal`, `goTo`, `tick`, `pause`); **debounced autosave** with forced flush on reveal/pause/submit/route-leave.
- [ ] **F4-T15** (M) `<ExamScreen>` shell: loads session, guards non-in-progress → `/results/:id`, route-leave warning.
- [ ] **F4-T16** (M) `<QuestionPanel>` + `<OptionList>`/`<OptionItem>`: single-choice radios; respects `optionOrder`; post-reveal/lock shows per-option correctness styling.
- [ ] **F4-T17** (M) `<QuestionNavigator>`: numbered buttons colour-coded across the **7-state** palette (`current | gave_up | answered_correct | answered_incorrect | answered_pending | flagged | unanswered`); jump to any question. The `gave_up` and `answered_correct|incorrect` states are derived client-side from `(revealed, gaveUp, selected, correctAnswer)` (post-ADR-14); see F4-T22 for the give-up intent capture and F4-T23 for the progressive reveal.
- [ ] **F4-T18** (M) `<ProgressBar>`: index, % answered, flagged count.
- [ ] **F4-T19** (S) `<FlagButton>`, `<PrevButton>`, `<SubmitOrNextButton>` wiring.
- [ ] **F4-T20** (M) `<SubmitExamDialog>`: confirm finish; show unanswered + flagged counts; calls submit → navigate `/results/:id`.

### §5 enhancements
- [ ] **F4-T21** (M) `<ExamTimer>`: counts down (timed) / up (untimed); `pause()` stops the tick; resume continues; visible countdown; auto-submit (or prompt) at zero (configurable).
- [ ] **F4-T22** (M) `<SubmitOrGiveUpButton>` + `<RevealedDetail>`: label "Give up" when no options are selected (reveal only — sets `gaveUp: true` on the answer, post-ADR-14), label "Submit" when ≥1 option is selected (commit + reveal; on the last question also opens the exam-submit dialog). Mark revealed. The keyboard `G` shortcut sets `gaveUp: true` for the current question (always a give-up because the keyboard handler doesn't know about the user's selection — actually it does, via `s.answers[qid]?.selected.length`, so the same `gaveUp: !hasSelection` rule applies).
- [ ] **F4-T23** (M) **Progressive reveal**: after reveal/lock, show correct/incorrect first; explanations behind a "Show explanations" expander when `progressive_reveal` is on.
- [ ] **F4-T24** (S) Shuffle wiring: `shuffleQuestions`/`shuffleOptions` from settings/overrides flow into `createSession`.
- [ ] ~~**F4-T25**~~ — removed. The per-question confidence rating (column + UI + store action) was speculative and was dropped in the post-MVP cleanup; the schema, types, and store are now confidence-free.
- [ ] **F4-T26** (S) `useKeyboardShortcuts` stub mapping store actions to keys (full shortcuts ship short-term; wire the seam now).

### Pause/resume
- [ ] **F4-T27** (S) `<PauseButton>`: force-flush autosave, then navigate Home/Resume; session stays `in_progress`.
- [ ] **F4-T28** (S) Resume path: `GET /sessions/:id` rehydrates the store to the exact saved position/time.

---

## Testing (heaviest coverage in the app)
- [ ] **ScoreCalculator** unit suite: correct/incorrect/unanswered; revealed excluded from correct/incorrect; rounding; all-correct/all-wrong; empty selection; (structure ready for multi).
- [ ] **ExamEngine** unit: snapshot order; seeded shuffle reproducible; live DTO omits answers until reveal; `pickNextUnattempted`/exhaustion (with F3); retake subset (with F5).
- [ ] **Autosave/PATCH** integration: idempotent repeated PATCH; `reveal:true` returns correct data; clamps `elapsedMs` to limit; `409` when not in progress.
- [ ] **Submit** integration: score equals ScoreCalculator; `set_completion` inserted; second submit `409`.
- [ ] **Resume** integration: pause → fetch → state identical (answers/flags/reveal/index/elapsed).
- [ ] Component: navigator colour states; flag toggles count; timer pauses on pause; progressive reveal expander; give-up reveals detail.

## Definition of Done
- [ ] Full loop works: start → answer/flag/reveal/navigate → pause → resume → submit → results.
- [ ] State survives browser refresh mid-exam (autosave + snapshot).
- [ ] Correct answers never reach the client before reveal/submit (verified at the network level).
- [ ] Timer, shuffle, progressive reveal all functional and settings-driven.
- [ ] Heavy test suite green (esp. ScoreCalculator); walkthrough recorded.
