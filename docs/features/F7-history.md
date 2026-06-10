# F7 — History

> **Milestone:** M3 · **Depends on:** F4, F5 · **Blocks:** F8 (export/reset operate on history)
> Plan F7: "Full exam history with filtering, notes, and bookmarks."

---

## Goal

A complete, filterable record of completed exams with inline notes/bookmarks, drill-down to the detailed results view (reusing F5), retake options, and aggregate stats across the (filtered) history.

## Plan Requirements
- List sorted by date: domain, cert, difficulty, score %, date, time taken.
- Filters: domain, cert, difficulty, score range, date range, bookmarked only.
- Click any row: short summary + View details + Retake options.
- Inline: add/edit note, toggle bookmark directly from the list.
- Aggregate stats: total exams, average score, best score, streak.

## Acceptance Criteria
- `/history` lists completed sessions with domain, cert, difficulty, score %, date, and time taken, sorted by date (desc) by default.
- All filters work and combine: domain, cert, difficulty, score range, date range, bookmarked-only; sorting by date/score/difficulty.
- Expanding a row shows a short summary with "View details" (→ `/history/:id`, the F5 screen) and Retake (all/incorrect).
- Notes and bookmarks are editable inline and persist.
- An aggregate stats bar shows total exams, average score, best score, and streak — computed over the current filter.

---

## Tasks

### Backend
- [ ] **F7-T1** (L) `GET /api/history` with the full filter/sort/pagination param set ([`03-api-specification.md` §6](../03-api-specification.md)); returns rows + `total`.
- [ ] **F7-T2** (M) `StatsService.aggregate(filters)`: total, average, best, `currentStreakDays`, `longestStreakDays`, `byDifficulty`, `lastExam` — honouring the same filters.
- [ ] **F7-T3** (M) `GET /api/stats` route (shared with the home quick-stats widget).
- [ ] **F7-T4** (S) Reuse `PATCH /sessions/:id/review` (F5) for inline note/bookmark.
- [ ] **F7-T5** (S) Reuse `POST /sessions/:id/retake` (F5) for row-level retake.
- [ ] **F7-T6** (S) Indices verified for filter/sort performance (`status`, `completed_at`, `ques_path`).

### Frontend
- [ ] **F7-T7** (M) `<HistoryScreen>` at `/history`; `useHistory(filters)` + `useStats(filters)` keyed by the filter object.
- [ ] **F7-T8** (L) `<HistoryFilterBar>`: domain, cert, difficulty, score range (slider/inputs), date range, bookmarked toggle, sort control. Maps 1:1 to query params.
- [ ] **F7-T9** (M) `<HistoryTable>` + `<HistoryRow>`: columns per the plan; row expansion → summary + View details + Retake.
- [ ] **F7-T10** (M) `<AggregateStatsBar>`: total / average / best / streak (updates with filters).
- [ ] **F7-T11** (S) Inline `<NoteEditor>` + `<BookmarkToggle>` reused from F5; optimistic updates; invalidate `['history']`/`['stats']`.
- [ ] **F7-T12** (S) Pagination / "load more"; empty + loading states.

---

## Testing
- [ ] Integration: each filter narrows results correctly; combined filters intersect; sorting honoured; `total`/pagination correct.
- [ ] Unit: streak math (consecutive days, gaps, same-day multiple exams, timezone via UTC day boundaries); average/best.
- [ ] Integration: stats honour the same filters as the list.
- [ ] Component: filter changes re-query; inline note/bookmark optimistic + rollback; row expand → details/retake.

## Definition of Done
- [ ] Filterable, sortable, paginated history with inline notes/bookmarks.
- [ ] Drill-down reuses the F5 results screen; retake works from a row.
- [ ] Aggregate stats correct and filter-aware (streak math unit-tested).
- [ ] Tests green; walkthrough recorded.
