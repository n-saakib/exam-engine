# F8 — Settings

> **Milestone:** M3 · **Depends on:** F1, F3, F7 · **Blocks:** —
> Plan F8: "Configuration and data management." Built last so the things it configures (sources, exam defaults, history) already exist.

---

## Goal

A settings screen to configure the question-set source (filesystem path or upload mode), exam defaults (timer, show-count, shuffle, progressive reveal, theme), and manage data (export history JSON/CSV, reset progress per path, full/factory reset). Surface catalogue diagnostics for problem files.

## Plan Requirements
- Question set source: set Exams/ root path or switch to upload mode.
- Exam defaults: timer on/off, show question count before starting.
- Data management: export history (JSON/CSV), reset progress per path, full reset.

## Acceptance Criteria
- Changing the Exams root path persists and triggers a rescan; an invalid path is rejected with a clear message.
- Switching to upload mode reveals the drag-and-drop uploader (F3) and lists uploaded sets.
- Exam defaults (timer on/off + minutes, show-count, shuffle questions/options, progressive reveal, theme) persist and are honoured by F4.
- Export produces a valid JSON or CSV download of history (and full-state JSON).
- "Reset progress (this path)" clears only that path's completion (history kept); "Full reset" clears history/progress (settings kept); "Factory reset" also restores default settings — each behind a confirmation.
- Catalogue diagnostics list invalid/warning files with reasons.

---

## Tasks

### Backend
- [ ] **F8-T1** (M) `GET /api/settings` (seed defaults) + `PUT /api/settings` (partial) per [`02-data-model.md` §4](../02-data-model.md).
- [ ] **F8-T2** (M) On `exams_root`/`source_mode` change → validate path (must resolve to a directory under sandbox) → trigger rescan → return `{ settings, scan }`; invalid → `400`.
- [ ] **F8-T3** (M) `POST /api/progress/reset { scope: "path"|"all"|"factory", quesPath? }` → returns `{ cleared }`; transactional.
- [ ] **F8-T4** (L) `GET /api/export?format=json|csv&scope=history|all` (`ExportService`): JSON full/structured; CSV flat history rows; correct `Content-Disposition`/MIME; streamed.
- [ ] **F8-T5** (S) Reuse `GET /api/catalog/diagnostics` (F3) for the problems panel.

### Frontend
- [ ] **F8-T6** (M) `<SettingsScreen>` at `/settings`; sections below; `useSettings()`/`useUpdateSettings()` (from F1).
- [ ] **F8-T7** (M) `<SourceSettings>`: Exams root input (with validation feedback) + filesystem/upload mode toggle + rescan button (shows scan summary); drag-drop uploader + uploaded-sets list in upload mode.
- [ ] **F8-T8** (M) `<ExamDefaultsSettings>`: timer on/off + default minutes, show-count-before-start, shuffle questions/options, progressive reveal.
- [ ] **F8-T9** (M) `<DataManagement>`: export buttons (JSON/CSV) → download; reset-progress-per-path (path picker) ; full reset; factory reset — each with a confirm dialog and clear copy about consequences.
- [ ] **F8-T10** (S) `<CatalogDiagnostics>`: list problem files + reasons; "rescan" action.
- [ ] **F8-T11** (S) `<Appearance>`: theme selector (system/light/dark) — wired to F1 `<ThemeProvider>`.

---

## Testing
- [ ] Integration: `PUT /settings` updates only provided keys; changing `exams_root` triggers rescan; invalid root → `400`.
- [ ] Integration: `progress/reset` scopes — `path` keeps history but clears that path's completion; `all` clears sessions/answers/completion; `factory` also resets settings.
- [ ] Integration: export JSON parses and round-trips history; CSV has one row per completed exam with expected columns.
- [ ] Component: source path validation feedback; defaults persist and reflect on reload; reset confirmations required; diagnostics render.
- [ ] Cross-feature: a default toggled here (e.g. shuffle, timer) is honoured by a new F4 session.

## Definition of Done
- [ ] Source config (path + upload) works and rescans; defaults persist and drive F4.
- [ ] Export (JSON/CSV) and all three reset scopes work with confirmations.
- [ ] Diagnostics surface problem files.
- [ ] Tests green; walkthrough recorded.
- [ ] **Update `CLAUDE.md`** if the settings/source behaviour changes how exam paths or the Exams root are interpreted.
