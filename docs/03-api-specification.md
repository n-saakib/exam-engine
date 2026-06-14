# CertPrep — API Specification

> The HTTP contract between the React client and the server. All endpoints are under `/api`, same-origin, JSON in/out. No auth (local single-user). Referenced by every feature file.
>
> ⚠️ **Implemented as Next.js Route Handlers** (`src/app/api/**/route.ts`), not Express — see [`09` §6](09-nextjs-refinement.md) for the file map and these contract changes (all from `08`): `POST /api/scan`→**`/api/catalog/scan`**, `POST /api/sets/upload`→**`/api/catalog/upload`**, `PUT /api/settings`→**`PATCH /api/settings`**, plus the now-specified **`GET /api/sessions`** contract ([`09` §8](09-nextjs-refinement.md)) and the **timer `elapsedMs` = absolute/replace, server-clamped** semantics ([`09` §7.1](09-nextjs-refinement.md)). The payloads/status codes below are otherwise authoritative and unchanged.

---

## 1. Conventions

- **Base URL:** `/api` (same origin in prod; Vite proxies it in dev).
- **Content type:** `application/json` for requests/responses, except export downloads (`text/csv`, `application/json` attachment) and uploads (`multipart/form-data`).
- **IDs:** session ids are UUID strings; catalogue ids are integers; `set_id`/`ques_path` are strings.
- **Timestamps:** ISO-8601 UTC strings.
- **Success envelope:** endpoints return the resource directly (or `{ items, total }` for lists). No redundant `{ data: ... }` wrapper.
- **Error envelope (always):**
  ```json
  { "error": { "code": "MACHINE_CODE", "message": "human readable", "details": { } } }
  ```
- **Status codes:** `200` ok, `201` created, `204` no content, `400` validation, `404` not found, `409` conflict (e.g. exhausted/duplicate), `422` unprocessable (valid JSON, bad semantics), `500` internal.
- **Validation:** every request body/query is zod-validated by `validate()` middleware; failures → `400` with `details` listing field errors.

### Error codes (canonical)
`VALIDATION_ERROR`, `EXAM_PATHS_INVALID`, `PATH_NOT_FOUND`, `PATH_TRAVERSAL`, `SET_NOT_FOUND`, `SET_AMBIGUOUS`, `SETS_EXHAUSTED`, `SESSION_NOT_FOUND`, `SESSION_NOT_IN_PROGRESS`, `SESSION_ALREADY_COMPLETED`, `UNSUPPORTED_QUESTION_TYPE`, `UPLOAD_REJECTED`, `INTERNAL`. (`PATH_TRAVERSAL` and `SET_AMBIGUOUS` added per [`09` §6–7.5](09-nextjs-refinement.md).)

---

## 2. Endpoint Index

| Method | Path | Purpose | Feature |
|---|---|---|---|
| `GET` | `/api/health` | liveness + schema/version info | F0 |
| `GET` | `/api/exam-paths` | the navigation tree (+ leaf availability) | F2 |
| `POST` | `/api/scan` | rescan filesystem into catalogue | F3 |
| `GET` | `/api/sets` | list sets for a path (with completion state) | F3 |
| `GET` | `/api/sets/:setId` | fetch a full set (authoring/preview) | F3 |
| `POST` | `/api/sets/upload` | upload set JSON file(s) | F3 |
| `GET` | `/api/catalog/diagnostics` | invalid/warning files report | F3/F8 |
| `POST` | `/api/sessions` | start a new exam (create session) | F4 |
| `GET` | `/api/sessions` | list sessions (filter by status) | F6/F7 |
| `GET` | `/api/sessions/:id` | get live session state (answers hidden) | F4/F6 |
| `PATCH` | `/api/sessions/:id` | update answer/flag/reveal/position/time | F4 |
| `POST` | `/api/sessions/:id/submit` | grade & complete | F4/F5 |
| `DELETE` | `/api/sessions/:id` | discard an in-progress session | F6 |
| `GET` | `/api/sessions/:id/results` | full graded detail (answers shown) | F5/F7 |
| `PATCH` | `/api/sessions/:id/review` | bookmark / note on a completed session | F5/F7 |
| `POST` | `/api/sessions/:id/retake` | create a retake (all / incorrect) | F5/F7 |
| `GET` | `/api/history` | filtered completed-exam list | F7 |
| `GET` | `/api/stats` | aggregate stats | F7 |
| `GET` | `/api/settings` | read all settings | F8 |
| `PUT` | `/api/settings` | update settings (partial) | F8 |
| `POST` | `/api/progress/reset` | reset completion for a path / all | F8 |
| `GET` | `/api/export` | export history (JSON or CSV) | F8 |

---

## 3. Catalogue & Navigation

### `GET /api/exam-paths`
Returns the parsed tree plus, for each leaf, whether any sets exist and how many remain unattempted.

**200**
```json
{
  "tree": { "label": "Choose a domain for exam", "cloud": { "...": "..." } },
  "leaves": [
    {
      "quesPath": "Exams/Cloud/AWS/Solutions-Architect-Associate/Easy",
      "domainLabel": "Cloud / AWS / AWS Solutions Architect Associate / Easy",
      "icon": "cloud",
      "totalSets": 3,
      "completedSets": 1,
      "remainingSets": 2,
      "exhausted": false
    }
  ]
}
```
**Errors:** `500 EXAM_PATHS_INVALID` if the file can't be parsed/validated (message lists the problems).

### `POST /api/scan`
Rescans the configured Exams root (and uploads) and rebuilds `set_catalog`. Idempotent.

**Body (optional):** `{ "quesPath"?: string }` — limit scan to one subtree.
**200**
```json
{ "scanned": 12, "added": 2, "updated": 1, "removed": 0, "errors": 1,
  "diagnostics": [ { "filePath": "...", "status": "error", "messages": ["..."] } ] }
```

### `GET /api/sets?quesPath=...`
Lists catalogued sets for a leaf path with completion + drift state.

**Query:** `quesPath` (required), `includeCompleted` (bool, default true).
**200**
```json
{
  "items": [
    { "setId": "e823...", "setTitle": "IAM & EC2 Easy Set 1", "difficulty": "Easy",
      "questionCount": 10, "completed": true, "lastAttemptAt": "2026-05-30T...",
      "updatedSinceAttempt": false, "status": "ok" }
  ],
  "total": 3,
  "remaining": 2,
  "exhausted": false
}
```
**Errors:** `404 PATH_NOT_FOUND`.

### `GET /api/sets/:setId`
Full set incl. questions (for authoring/preview; **not** the exam path). `409` if `setId` is ambiguous (duplicate across files) — `details.candidates` lists file paths.

### `POST /api/sets/upload`
`multipart/form-data`, field `files` (one or more `.json`). Validates, stores under `data/uploads/`, catalogues them.
**201** `{ "accepted": [...], "rejected": [ { "name": "...", "reason": "..." } ] }`
**Errors:** `400 UPLOAD_REJECTED` (wrong type / too large / invalid JSON).

### `GET /api/catalog/diagnostics`
All files currently flagged `warning`/`error` with messages (drives the Settings "problems" panel).

---

## 4. Exam Sessions (the core loop)

### `POST /api/sessions` — start an exam
Creates a session: picks/loads a set, applies shuffle, snapshots questions, persists blank answers.

**Body**
```jsonc
{
  "quesPath": "Exams/Cloud/AWS/Solutions-Architect-Associate/Easy",  // required
  "setId": "e823...",          // optional; omit ⇒ server picks next unattempted set
  "mode": "full",              // full | retake_all | retake_incorrect (retake via /retake)
  "options": {
    "timerEnabled": true,      // defaults from settings
    "timerMinutes": 20,        // optional override; null ⇒ untimed or derived
    "shuffleQuestions": false, // defaults from settings
    "shuffleOptions": false
  }
}
```
**201** → a **live session DTO** (see §4.1). **Correct answers and explanations are omitted.**
**Errors:** `404 PATH_NOT_FOUND` / `SET_NOT_FOUND`; `409 SETS_EXHAUSTED` (all sets done — client offers reset); `422 UNSUPPORTED_QUESTION_TYPE` (set declares a not-yet-implemented type).

### 4.1 Live session DTO (answers hidden)
Used by `GET /api/sessions/:id` and the create response. The exam screen never receives correct answers for unrevealed questions.
```jsonc
{
  "id": "8f1c...",
  "status": "in_progress",
  "quesPath": "...",
  "domainLabel": "Cloud / AWS / SAA / Easy",
  "setTitle": "IAM & EC2 Easy Set 1",
  "difficulty": "Easy",
  "mode": "full",
  "totalQuestions": 10,
  "currentIndex": 3,
  "timer": { "enabled": true, "limitMs": 1200000, "elapsedMs": 240000 },
  "questions": [
    {
      "id": 7, "order": 1, "questionType": "single",
      "questionText": "...",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "optionOrder": ["A","B","C","D"],
      // NO correctAnswer / explanations / Tips here unless revealed:
      "answer": { "selected": ["A"], "flagged": true, "revealed": false,
                  "confidence": null, "timeSpentMs": 18000 }
    }
  ],
  "createdAt": "...", "startedAt": "...", "updatedAt": "..."
}
```
> When `answer.revealed === true` for a question, the server **does** include `correctAnswer`, `explanations`, and `Tips` for that question only.

### `GET /api/sessions/:id`
Returns the live session DTO (§4.1). `404 SESSION_NOT_FOUND`. If `status !== in_progress`, returns the DTO but clients should route to results.

### `PATCH /api/sessions/:id` — autosave updates
The exam screen's workhorse. Accepts a **partial** update for a question and/or session-level fields. Debounced by the client. Idempotent.

**Body (any subset)**
```jsonc
{
  "currentIndex": 4,                 // navigation
  "elapsedMs": 252000,               // timer tick (server clamps to limit if timed)
  "answer": {                        // per-question update
    "questionId": 7,
    "selected": ["B"],               // replaces selection; [] clears
    "flagged": true,
    "revealed": true,                // "give up" — irreversible; server attaches correct data
    "confidence": "medium",
    "timeSpentMs": 23000
  }
}
```
**200** → updated live session DTO (with revealed question now carrying correct data).
**Errors:** `404 SESSION_NOT_FOUND`; `409 SESSION_NOT_IN_PROGRESS` (already submitted/discarded).
**Semantics:**
- `revealed: true` is monotonic (cannot be un-revealed) and marks the question as not counting toward score (counts as "revealed", see scoring).
- Submitting a selection does not auto-lock in MVP unless `lockOnSubmit` is set per question — the plan's "Submit locks selection and reveals per-option detail inline" is the **per-question submit** variant; see F4 for the two interaction models. The PATCH supports an optional `"locked": true`.

### `POST /api/sessions/:id/submit` — finish & grade
Grades the whole session from its snapshot, writes score fields, sets `status=completed`, inserts `set_completion`.

**Body (optional):** `{ "elapsedMs": 254000 }` (final timer value).
**200** → **results DTO** (§5.1).
**Errors:** `404`; `409 SESSION_ALREADY_COMPLETED`.

### `DELETE /api/sessions/:id` — discard
Discards an in-progress session (answers cascade). **204**. `409` if already completed (use history delete instead, if offered).

---

## 5. Results & Review

### `GET /api/sessions/:id/results`
Full graded detail — **answers and explanations included** — for the results screen and history detail.

### 5.1 Results DTO
```jsonc
{
  "id": "8f1c...",
  "status": "completed",
  "domainLabel": "Cloud / AWS / SAA / Easy",
  "setTitle": "IAM & EC2 Easy Set 1",
  "difficulty": "Easy",
  "mode": "full",
  "summary": {
    "scorePercent": 80,
    "correct": 8, "incorrect": 1, "revealed": 1, "unanswered": 0,
    "total": 10,
    "timeTakenMs": 254000,
    "timerLimitMs": 1200000
  },
  "isBookmarked": false,
  "note": null,
  "completedAt": "...",
  "questions": [
    {
      "id": 7, "order": 1, "questionType": "single",
      "questionText": "...",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correctAnswer": ["B"],     // ADR-13: unified array shape (length 1 for single, ≥ 1 for multi)
      "yourAnswer": ["A"],
      "outcome": "incorrect",          // correct | incorrect | revealed | unanswered
      "flagged": true,
      "confidence": "medium",
      "explanations": { "A": { "description": "...", "reason": "..." }, "...": {} },
      "Tips": "..."
    }
  ]
}
```

### `PATCH /api/sessions/:id/review` — bookmark / note
**Body:** `{ "isBookmarked"?: boolean, "note"?: string|null }`. **200** → updated review fields. Works on completed sessions (and is allowed on in-progress for note jotting).

### `POST /api/sessions/:id/retake` — retake this set
Creates a **new** session referencing the original via `origin_session_id`.

**Body**
```jsonc
{ "scope": "incorrect", "options": { "shuffleQuestions": true } }
// scope: "all" (whole set fresh) | "incorrect" (only incorrect+revealed from origin)
```
**201** → new live session DTO. For `incorrect`, the new snapshot contains only the questions whose origin outcome was `incorrect` or `revealed`. `409` if scope `incorrect` but there were none.

---

## 6. History & Stats

### `GET /api/history`
Filtered, sorted list of **completed** sessions for the History screen.

**Query params** (all optional):
| Param | Type | Notes |
|---|---|---|
| `domain` | string | match on domain segment |
| `quesPath` | string | exact leaf |
| `difficulty` | Easy\|Medium\|Hard\|Mock | |
| `scoreMin`,`scoreMax` | number | 0–100 |
| `dateFrom`,`dateTo` | ISO date | by `completedAt` |
| `bookmarked` | bool | bookmarked only |
| `sort` | `date`\|`score`\|`difficulty` | default `date` |
| `order` | `asc`\|`desc` | default `desc` |
| `limit`,`offset` | number | pagination |

**200**
```json
{
  "items": [
    { "id": "8f1c...", "domainLabel": "Cloud / AWS / SAA / Easy",
      "difficulty": "Easy", "setTitle": "IAM & EC2 Easy Set 1",
      "scorePercent": 80, "timeTakenMs": 254000,
      "completedAt": "2026-05-30T...", "isBookmarked": false, "hasNote": true }
  ],
  "total": 42
}
```

### `GET /api/stats`
Aggregate stats for the History header and the home quick-stats widget (short-term).

**Query (optional):** same filters as history (stats over the filtered set).
**200**
```json
{
  "totalExams": 42,
  "averageScore": 73.4,
  "bestScore": 96,
  "currentStreakDays": 5,
  "longestStreakDays": 11,
  "lastExam": { "id": "8f1c...", "scorePercent": 80, "completedAt": "..." },
  "byDifficulty": { "Easy": { "count": 12, "avg": 82 }, "Medium": { "count": 18, "avg": 71 } }
}
```

---

## 7. Settings, Progress, Export

### `GET /api/settings`
**200** → the full settings object (see [`02-data-model.md` §4](02-data-model.md)).

### `PUT /api/settings`
**Body:** partial settings object; only provided keys are updated.
**200** → full updated settings.
**Side effect:** changing `exams_root` or `source_mode` triggers a rescan (response includes `{ settings, scan: {...} }`).
**Errors:** `400 VALIDATION_ERROR` (e.g. `exams_root` doesn't resolve to a directory).

### `POST /api/progress/reset`
**Body:** `{ "scope": "path", "quesPath": "..." }` or `{ "scope": "all" }` or `{ "scope": "factory" }`.
- `path` → delete `set_completion` for the path (history kept).
- `all` → delete all sessions/answers/completion/notes (settings kept).
- `factory` → `all` + reset settings to defaults.
**200** → `{ "cleared": { "sessions": 40, "completion": 8 } }`.

### `GET /api/export?format=json|csv&scope=history|all`
Streams a download.
- `format=json` → full structured export (`Content-Disposition: attachment`).
- `format=csv` → flat history rows (one row per completed exam).
- `scope=all` → includes settings + per-question detail (JSON only).

### `GET /api/health`
**200** `{ "status": "ok", "version": "0.1.0", "schemaVersion": 3, "examsRoot": "...", "setsIndexed": 12 }`.

---

## 8. Contract Notes for Implementers

- **Answer hiding is enforced server-side.** The mapper that builds the live DTO (§4.1) strips `correctAnswer`/`explanations`/`Tips` unless that question's `revealed` (or session `completed`). Never rely on the client to hide them.
- **Autosave is `PATCH /sessions/:id`**, debounced ~300–500ms client-side and also flushed on blur/navigation/pause. The endpoint must be cheap and idempotent.
- **Grading lives only in `submit`** (and per-question reveal for outcome display). The client never computes the official score — it only renders what `submit`/`results` return. (ScoreCalculator is the single source of truth — see [`01-architecture.md` §4](01-architecture.md).)
- **Pagination defaults:** `limit=50, offset=0` for history; lists return `total` for the UI.
- **All list endpoints are read-only and side-effect-free** except `POST /scan`, `POST /sessions`, `PATCH`, `submit`, `retake`, `DELETE`, `PUT /settings`, `POST /progress/reset`.

This contract is intentionally complete enough that client and server can be built in parallel against it; the shared zod schemas in `server/src/domain/schemas.ts` are the executable version of this document.
