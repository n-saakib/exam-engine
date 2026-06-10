# F5 — Results Screen

> **Milestone:** M2 · **Depends on:** F4 · **Blocks:** F7 (which reuses this screen)
> Plan F5: "Summary and detailed review at the end of each exam."

---

## Goal

After submit, show a score summary and a detailed, filterable, fully-explained review of every question. Offer the study-loop actions: bookmark, add note, retake (all or **incorrect only**), and return home. The same screen serves history detail (F7).

## Plan Requirements
- Short summary: score %, correct / incorrect / revealed / unanswered, time taken.
- Detailed view: every question with your answer, correct answer, all explanations, tips.
- Filter detailed view: incorrect only, revealed only, or all.
- Actions: bookmark, add note, retake this set, return to home.
- **(§5)** Retake incorrects only — the most efficient study loop.

## Acceptance Criteria
- The summary shows score %, the four-way breakdown (correct/incorrect/revealed/unanswered), and time taken (vs limit if timed).
- The detailed list shows, per question: your answer, the correct answer, all per-option explanations, and Tips, with correct/incorrect/revealed styling.
- Filters switch the detailed list between All / Incorrect only / Revealed only (and Flagged).
- Bookmark toggles and a note can be added/edited inline; both persist.
- "Retake all" and "Retake incorrect only" each start a new session and navigate to it.
- The screen works both immediately post-exam and when opened from History.

---

## Tasks

### Backend
- [ ] **F5-T1** (M) `GET /api/sessions/:id/results` → results DTO ([`03-api-specification.md` §5.1](../03-api-specification.md)) with answers + explanations + per-question `outcome`.
- [ ] **F5-T2** (S) `PATCH /api/sessions/:id/review` → set `is_bookmarked` / `note`; works on completed (and in-progress) sessions.
- [ ] **F5-T3** (M) `POST /api/sessions/:id/retake { scope, options }`: `all` → fresh session for the set; `incorrect` → new snapshot containing only origin questions whose outcome was `incorrect`/`revealed`; set `origin_session_id`; `409` if `incorrect` scope but none qualify.
- [ ] **F5-T4** (S) Retake-incorrect snapshot builder (reuses ExamEngine snapshot path with a filtered question list).

### Frontend
- [ ] **F5-T5** (M) `<ResultsScreen mode>` route at `/results/:id` (and reused at `/history/:id`).
- [ ] **F5-T6** (M) `<ScoreSummaryCard>`: %, four-way breakdown, time taken vs limit, difficulty/domain header.
- [ ] **F5-T7** (M) `<QuestionReviewList>` + `<QuestionReviewCard>`: your vs correct answer, all explanations, Tips, outcome styling.
- [ ] **F5-T8** (M) `<DetailFilterBar>`: All / Incorrect only / Revealed only / Flagged — client-side filter over the DTO.
- [ ] **F5-T9** (M) `<ResultsActions>`: `<BookmarkToggle>` (optimistic), `<NoteEditor>` (debounced save), `<RetakeMenu>` (all/incorrect), Home button.
- [ ] **F5-T10** (S) `useResults(id)`, `useReview(id)` mutation, `useRetake(id)` mutation; invalidate `['history']`/`['stats']` after review changes.

### §5 enhancement
- [ ] **F5-T11** (S) Wire "Retake incorrect only" prominently as the primary study-loop CTA; disable when no incorrect/revealed exist.

---

## Testing
- [ ] Integration: results DTO matches the graded session; outcomes correct for a seeded session with one incorrect + one revealed + one unanswered.
- [ ] Integration: retake `all` creates a full new session; retake `incorrect` creates a session whose snapshot = the incorrect+revealed subset; `409` when none.
- [ ] Integration: review PATCH persists bookmark/note.
- [ ] Component: filters show the right subset; bookmark toggle optimistic + rollback; note saves; retake buttons call the right endpoint and navigate.

## Definition of Done
- [ ] Summary + detailed review + filters all correct and explained.
- [ ] Bookmark/note persist; retake (all + incorrect) work end-to-end.
- [ ] Screen reused cleanly by History detail.
- [ ] Tests green; walkthrough recorded.
