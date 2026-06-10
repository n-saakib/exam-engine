# F2 — Domain Selector (Cascading Dropdowns)

> **Milestone:** M1 · **Depends on:** F0, F1 · **Blocks:** F4
> Plan F2: "Reads `exam-paths.json` and renders the full domain tree. Zero code changes needed to add new domains."

---

## Goal

Render the navigation tree from `exam-paths.json` as a series of cascading dropdowns. Each level appears only after the one above it is chosen; labels and option titles come entirely from the JSON; reaching a leaf enables "Start exam." Supports arbitrary depth and optional domain icons.

## Plan Requirements
- Each dropdown level appears only after the level above is selected.
- Labels and titles driven entirely from the JSON.
- Start exam button activates at a leaf path.
- Supports any depth: domain → provider → cert → difficulty.
- **(§5 enhancement)** Domain icons — visual differentiation between Cloud, DevOps, SWE, Interview Prep.

## Acceptance Criteria
- The first dropdown shows the root `label` and one option per child `title`.
- Selecting an option reveals the next level's dropdown (its `label` + child `title`s), recursively, to any depth.
- At a leaf, the selector shows a summary ("N sets · M remaining") and enables Start.
- Changing a higher-level selection resets all lower levels.
- The last selected path is remembered across refresh (via `last_selected_path` setting).
- Domain icons render when a node declares `icon`; a default icon otherwise.
- A malformed `exam-paths.json` shows a clear error (not a blank screen).

---

## Tasks

### Backend — path resolution
- [ ] **F2-T1** (M) `PathResolver` service: read + zod-validate `exam-paths.json`; expose the tree and a flat list of leaves with `quesPath`, `domainLabel`, `icon`.
- [ ] **F2-T2** (M) `GET /api/exam-paths` route returning `{ tree, leaves[] }` with per-leaf `totalSets/completedSets/remainingSets/exhausted` (joins SetCatalog + set_completion — coordinate with F3; until F3 lands, return counts as `null`).
- [ ] **F2-T3** (S) Path sandboxing: resolve `quesPath` under the Exams root; dangling/escaping paths flagged as warnings, not crashes.
- [ ] **F2-T4** (S) `EXAM_PATHS_INVALID` error path with actionable messages.

### Frontend — cascading UI
- [ ] **F2-T5** (M) `useExamPaths()` query (`['examPaths']`).
- [ ] **F2-T6** (L) `<DomainSelector>` driving N `<CascadingDropdown>` levels from the tree; pure function of JSON (no hardcoded domain knowledge).
- [ ] **F2-T7** (M) `<CascadingDropdown>`: renders the current node's `label` as prompt and children `title`s as options; emits selection; accessible/keyboard-navigable (reuse F0 `Select`).
- [ ] **F2-T8** (S) Reset-lower-levels logic when a higher level changes.
- [ ] **F2-T9** (M) `<LeafSummary>`: shows `remainingSets`/`totalSets` and the difficulty; handles `exhausted` (offers reset → F8/F3 dialog).
- [ ] **F2-T10** (S) `<StartExamButton>`: enabled only at a leaf with `remainingSets > 0`; calls `POST /api/sessions { quesPath }` → navigate `/exam/:id`; on `409 SETS_EXHAUSTED`, open reset dialog.
- [ ] **F2-T11** (S) Persist selection to `last_selected_path` (debounced) and rehydrate on load (with F1).

### §5 enhancement — domain icons
- [ ] **F2-T12** (S) `icon` added to the `exam-paths` schema (optional).
- [ ] **F2-T13** (S) `<DomainIcon>` component + icon token map (Cloud/DevOps/SWE/Interview + default).

### Home composition
- [ ] **F2-T14** (S) `<HomeScreen>` composes `<DomainSelector>` (+ a placeholder `<QuickStatsWidget>` slot for the short-term roadmap feature).

---

## Testing
- [ ] Component: feed a fixture tree of unusual depth (e.g. 5 levels) — dropdowns appear progressively; titles/labels come from JSON; changing a parent resets children.
- [ ] Component: Start disabled until a leaf with remaining sets is selected.
- [ ] Unit: `PathResolver` flattens leaves; rejects missing `label`/`title`; flags dangling `quesPath`.
- [ ] Integration: `GET /api/exam-paths` returns the AWS SAA tree with four leaves; `EXAM_PATHS_INVALID` on a broken fixture.
- [ ] Persistence: selecting a path writes `last_selected_path`; reload rehydrates it.

## Definition of Done
- [ ] Selector renders any-depth tree purely from JSON; **zero code change** needed to add a new domain (prove with a fixture that adds a Azure/DevOps branch).
- [ ] Start launches a session at a leaf; exhausted path is handled gracefully.
- [ ] Icons render; selection persists across refresh.
- [ ] Tests green; walkthrough recorded.
