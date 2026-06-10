# F6 — Paused Exams

> **Milestone:** M3 · **Depends on:** F4 · **Blocks:** —
> Plan F6: "Resume or discard any exam you stepped away from."

---

## Goal

List every in-progress exam with enough context to choose, and let the user resume exactly where they left off or discard it. A session's slot clears automatically once it's completed or discarded.

## Plan Requirements
- Lists all in-progress exams with domain path, % answered, time elapsed, date paused.
- Resume or discard from the list.
- Slot is cleared automatically once the exam is completed or discarded.

## Acceptance Criteria
- `/resume` lists all `status = in_progress` sessions, newest activity first, each showing domain path, % answered, elapsed time, and last-paused date.
- "Resume" opens `/exam/:id` at the exact saved position/answers/flags/time.
- "Discard" asks for confirmation, then removes the session (it disappears from the list and the Resume badge count drops).
- Completing or discarding a session removes it from this list automatically (it's just `status` changing / row deletion — no extra bookkeeping).
- Empty state when there are no in-progress sessions.

---

## Tasks

### Backend
- [ ] **F6-T1** (M) `GET /api/sessions?status=in_progress` → list rows with `domainLabel`, `percentAnswered`, `timeElapsedMs`, `pausedAt` (use `updated_at` as "last active"), `setTitle`, `difficulty`. (Reuses `SessionManager.listInProgress` from F4.)
- [ ] **F6-T2** (S) Compute `percentAnswered` server-side (answered/total from `session_answers`).
- [ ] **F6-T3** (S) `DELETE /api/sessions/:id` (discard) — defined in F4; ensure it invalidates the in-progress count and cascades answers.

### Frontend
- [ ] **F6-T4** (M) `<ResumeScreen>` at `/resume` with `useInProgressSessions()` query.
- [ ] **F6-T5** (M) `<PausedExamList>` + `<PausedExamRow>`: domain path, % answered (progress chip), elapsed, paused date.
- [ ] **F6-T6** (S) `<ResumeButton>` → navigate `/exam/:id`.
- [ ] **F6-T7** (S) `<DiscardButton>` → confirm dialog → `DELETE`; optimistic removal; rollback on error; invalidate `['inProgressCount']`.
- [ ] **F6-T8** (S) `<EmptyState>` for no paused exams.

---

## Testing
- [ ] Integration: list returns only in-progress sessions with correct `percentAnswered`; completed/discarded excluded.
- [ ] Integration: discard removes the session and its answers; in-progress count drops.
- [ ] Component: rows render context fields; resume navigates; discard confirms + removes optimistically.
- [ ] Cross-feature: completing an exam (F4 submit) removes it from the resume list (it becomes `completed`).

## Definition of Done
- [ ] Paused list shows accurate context; resume restores exact state; discard works with confirmation.
- [ ] Slots clear automatically on completion/discard; Resume badge stays in sync.
- [ ] Tests green; walkthrough recorded.
