# F1 — App Shell & Navigation

> **Milestone:** M1 · **Depends on:** F0 · **Blocks:** F2, F8 (and provides the frame for all screens)
> Plan F1: "Core scaffolding and persistent state management."

---

## Goal

The persistent application frame: a menubar (Home, Resume, History, Settings), client routing between screens, theming, and app state that survives refresh (backed by SQLite via `/api/settings`). Runs entirely in the browser at `localhost:3000`.

## Plan Requirements (verbatim intent)
- Menubar: Home, Resume paused exam, History, Settings.
- Persistent app state via SQLite (survives refresh).
- Runs entirely in the browser at `localhost:3000` — just `npm start`.

## Acceptance Criteria
- A persistent `<MenuBar>` is visible on every screen with working links to Home, Resume, History, Settings.
- The **Resume** item shows a live badge with the count of in-progress sessions (0 hidden or shown as empty).
- Refreshing the browser preserves theme and last-selected domain path (read from `/api/settings`).
- Theme toggle (system/light/dark) persists and applies immediately.
- Unknown routes render a friendly NotFound.

---

## Tasks

### Layout & navigation
- [ ] **F1-T1** (M) `<AppLayout>` with header/menubar + `<Outlet/>` content region; responsive, calm spacing per design tokens.
- [ ] **F1-T2** (M) `<MenuBar>` with the four destinations; active-route highlighting; keyboard focusable.
- [ ] **F1-T3** (S) Wire React Router routes to real screen components (replace F0 placeholders): Home, Exam, Results, History, Resume, Settings, NotFound.
- [ ] **F1-T4** (S) `<NotFound>` screen + redirect helpers.

### Persistent state
- [ ] **F1-T5** (M) Settings read/write hooks: `useSettings()` (React Query `['settings']`) + `useUpdateSettings()` mutation (PUT, optimistic).
- [ ] **F1-T6** (S) Rehydrate `last_selected_path` and `theme` on app load from settings.
- [ ] **F1-T7** (S) `inProgressCount` query (`GET /api/sessions?status=in_progress`, count only) powering the Resume badge; invalidated by F4/F6 mutations.

### Theming
- [ ] **F1-T8** (M) `<ThemeProvider>` — sets `data-theme` from the `theme` setting; `system` follows `prefers-color-scheme`; CSS variables defined in F0 tokens.
- [ ] **F1-T9** (S) Theme switcher control (lives in Settings; quick-toggle optional in menubar).

### Shell services
- [ ] **F1-T10** (S) `<ToastProvider>` finalized (from F0 stub) + `useToast()`.
- [ ] **F1-T11** (S) `<ErrorBoundary>` around the router with a recoverable fallback.
- [ ] **F1-T12** (S) `<GlobalDialogs>` host for confirm/exhausted/discard dialogs reused by F2/F4/F6/F8.

### Backend (small)
- [ ] **F1-T13** (S) Ensure `GET /api/settings` returns defaults when keys are unset (seed defaults on first read per [`02-data-model.md` §4](../02-data-model.md)).
- [ ] **F1-T14** (S) `GET /api/sessions?status=in_progress` supports a lightweight count (or reuse the list `total`).

---

## Testing
- [ ] Component: menubar renders all destinations; active link reflects route; Resume badge reflects `inProgressCount`.
- [ ] Theme: switching theme sets `data-theme` and persists via the settings mutation.
- [ ] Integration: `GET /api/settings` returns seeded defaults on a fresh DB.
- [ ] Refresh persistence: with a seeded `last_selected_path`, Home rehydrates it (covered jointly with F2).

## Definition of Done
- [ ] Menubar + routing + theme + persistence all working and tested.
- [ ] Resume badge wired to live count.
- [ ] No screen renders outside `<AppLayout>`; error boundary and toasts available app-wide.
- [ ] Acceptance criteria walkthrough recorded.
