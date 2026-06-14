# CertPrep

**A local-first, domain-agnostic exam-practice app.** Load JSON question sets, take
timed exams one question at a time, review detailed per-option explanations, and
track your history — all offline, no account, no network. It ships with an AWS
Solutions Architect Associate (SAA) set and generalises to **any** multiple-choice
domain, because **the JSON format is the contract**: adding a domain is a
*drop-in-a-folder* operation, not a code change.

Built as a single **Next.js (App Router, TypeScript) + SQLite** application — one
process, one port, runs at `http://localhost:3000`.

```
pick a domain → start an exam → answer / flag / give-up → pause & resume
            → submit → results with explanations → retake (all or just the ones you missed)
```

---

## Quick start

Two helper scripts run the app either way. Both are **interactive**, or pass
**`-y`** to accept every default and just run:

```bash
# Without Docker — installs deps if needed, builds, and serves on :3000
./scripts/run-local.sh -y          # interactive: ./scripts/run-local.sh   (add --dev for hot reload)

# With Docker — builds the image and runs a container (localhost-only, persistent DB)
./scripts/run-docker.sh -y         # interactive: ./scripts/run-docker.sh
```

Then open **http://localhost:3000**.

> Requires **Node.js 22** (for the local path) and/or **Docker** (for the container path).
> On first boot the app creates and migrates `data/certprep.db` automatically and scans
> `Exams/` for question sets.

<details>
<summary>Manual (no scripts)</summary>

```bash
npm install                       # installs deps + builds the better-sqlite3 native addon
npm run dev                       # development: next dev (HMR) on :3000
# — or —
npm run build && npm run start    # production build + serve on :3000
```
</details>

---

## Features

| | Feature | What it does |
|---|---|---|
| **Domain selector** | Cascading dropdowns built entirely from `exam-paths.json` — any depth, zero code to add a domain. |
| **Question catalogue** | Scans, validates, and indexes every set under `Exams/`; one bad file never breaks the catalogue; drag-and-drop upload. |
| **Exam engine** | One question at a time, flag for review, **give up** to reveal the answer + every option's explanation, free navigation, a timer, and **autosave** (survives refresh, crash, and tab-close). |
| **Results** | Score breakdown (correct / incorrect / revealed / unanswered), a fully-explained per-question review, filters, bookmark + note, and **retake just the ones you got wrong**. |
| **Resume** | Every in-progress exam is listed and resumable to the exact spot; discard what you don't want. |
| **History & stats** | Filterable history with totals, average, best, and a **streak**; drill into any past exam. |
| **Settings** | Point at your own `Exams/` folder, set exam defaults (timer, shuffle, progressive reveal), export history (JSON/CSV), reset progress, and theme (system/light/dark). |

**Principles:** local-first & private (no telemetry, ever) · JSON is the contract
· the study loop is sacred (the exam screen is fast and distraction-free) ·
explanations over scores · portable (copy `data/certprep.db` + `Exams/` and you've
backed up everything).

> **MVP scope note:** every question renders as a **checkbox group**, regardless of
> whether it's a `single`- or `multi`-type question. The user is never told which
> is which — this trains choice elimination. The correct answer is always a JSON
> array of option keys (e.g. `["B"]` for single, `["A","B"]` for multi). The
> grader uses set equality: selecting more than the correct options on a `single`
> question scores `incorrect`. See ADR-13 in `docs/01-architecture.md`.

---

## How it works

One Next.js process renders the React screens **and** serves the JSON API (Route
Handlers under `src/app/api/**`); `better-sqlite3` holds runtime state in a single
SQLite file. The layering is strict:

```
Presentation (React screens, "use client")
      ↓ fetch /api/*
API          (Route Handlers — validation, status codes, error envelope)
      ↓
Logic        (services — scoring, catalogue, sessions; no SQL, no HTTP)
      ↓
Data         (repositories + better-sqlite3 + migrations; the only place with SQL)
```

Two decisions are load-bearing:

- **Snapshot-into-session:** when an exam starts, the exact questions (and order)
  are snapshotted onto the session. Editing or deleting a set mid-exam — or years
  later — never corrupts an in-progress exam or a history detail view.
- **Answers hidden until revealed:** the live exam payload omits `correctAnswer` /
  `explanations` entirely until you give up or submit; this is enforced server-side
  in one mapper, never trusted to the client.

The full design lives in [`docs/`](docs/) — start with
[`docs/README.md`](docs/README.md), then
[`docs/09-nextjs-refinement.md`](docs/09-nextjs-refinement.md) (the authoritative
architecture).

---

## Configuration

All settings have working defaults; nothing is required to run. Override via env
(copy `.env.example` → `.env`) or, at runtime, in the **Settings** screen:

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port to listen on. |
| `DB_PATH` | `./data/certprep.db` | SQLite database file. `uploadsRoot` is its sibling `…/uploads`. |
| `EXAMS_ROOT` | `./Exams` | Folder scanned for question sets. The user-set `exams_root` in Settings overrides this at runtime. |
| `EXAM_PATHS_FILE` | `./exam-paths.json` | The navigation tree. |
| `LOG_LEVEL` | `info` | `error` \| `warn` \| `info` \| `debug`. |

---

## Project layout

```
src/
├── app/                 Screens (pages) + the JSON API (api/**/route.ts)
├── server/              Logic + Data (import 'server-only'; never reaches the client)
│   ├── services/        scoreCalculator (pure), examEngine, setCatalog, statsService, …
│   ├── data/            db.ts, migrations/, fileReader.ts, repos/
│   └── http/            AppError, defineHandler, respond
├── domain/              zod schemas + z.infer<> DTO types (client-safe)
├── lib/                 apiClient, queryKeys, providers
├── components/          shared UI primitives
└── features/ hooks/ store/   feature UIs, hooks, the zustand exam store
instrumentation.ts       runs migrations + the boot scan on server start
Exams/                   authored question sets (the content)
exam-paths.json          the cascading navigation tree
data/                    runtime SQLite DB (gitignored, created on boot)
Dockerfile · scripts/    container build + run helpers
docs/                    product & engineering design docs
```

---

## Commands

| Command | What it does |
|---|---|
| `./scripts/run-local.sh [-y]` | Install (if needed) + build + serve, or `--dev`. |
| `./scripts/run-docker.sh [-y]` | Build the image + run the container. |
| `npm run dev` | `next dev` (HMR) on :3000. |
| `npm run build` / `npm run start` | Production build / serve. |
| `npm test` | Vitest (server + client). **310 tests.** |
| `npm run test:e2e` | Playwright end-to-end spine test. |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` / ESLint. |
| `npm run validate` | Validate every `Exams/**/*.json` against the schema. |
| `npm run rebuild` | Rebuild the `better-sqlite3` native addon (after a Node upgrade). |

### Running in Docker

`./scripts/run-docker.sh` builds a multi-stage image (the Next.js *standalone*
server, non-root, with a `/api/health` healthcheck) and runs it with the host port
bound to **`127.0.0.1` only**. The SQLite DB persists in a Docker volume (or a host
dir via `--data-dir`). Question sets are baked into the image; bind-mount your own
with `--mount-exams`. Flags: `--port`, `--data-dir`, `--mount-exams`,
`--rebuild|--no-build`, `--name`, `--tag` (`-h` for full help).

---

## Authoring question sets

The catalogue is pure data. To add content you **drop a JSON file into a folder**
and, for a new path, add one entry to `exam-paths.json` — no app code changes.

### 1. Place the file

```bash
# Existing AWS SAA Easy set
Exams/Cloud/AWS/Solutions-Architect-Associate/Easy/aws_saa_s3_basics_set2_easy.json

# A brand-new provider/cert
mkdir -p Exams/Cloud/Azure/Administrator/Easy
```

File-naming convention (advisory — the catalogue keys on path + `setId`, not the name):
`{provider}_{exam-code}_{topic}_{set-number}_{difficulty}.json`
(e.g. `aws_saa_iam_ec2_set1_easy.json`; Mock sets omit difficulty).

### 2. Question set JSON format

```json
{
  "setId": "550e8400-e29b-41d4-a716-446655440000",
  "setTitle": "IAM and EC2 Fundamentals - Set 1",
  "difficulty": "Easy",
  "questions": [
    {
      "id": 1,
      "questionText": "Which AWS service manages user access and permissions?",
      "options": {
        "A": "AWS Key Management Service (KMS)",
        "B": "AWS Identity and Access Management (IAM)",
        "C": "AWS Secrets Manager",
        "D": "AWS Certificate Manager"
      },
      "correctAnswer": ["B"],
      "explanations": {
        "A": { "description": "KMS", "reason": "Manages encryption keys, not user access." },
        "B": { "description": "IAM", "reason": "Manages users, groups, roles, and permissions." },
        "C": { "description": "Secrets Manager", "reason": "Stores secrets like DB passwords." },
        "D": { "description": "Certificate Manager", "reason": "Provisions SSL/TLS certificates." }
      },
      "Tips": "IAM = Identity & Access Management. Think 'Users & Permissions'."
    }
  ]
}
```

- **setId** — UUID identifying the set (unique per set). **setTitle** — human title.
- **difficulty** — one of `Easy` · `Medium` · `Hard` · `Mock` (case-insensitive).
- **questions[]** — each has an integer **id** (unique within the set),
  **questionText**, **options** (2–6 keys, single uppercase letters),
  **correctAnswer** (a JSON **array** of option keys — length 1 for `single`,
  length ≥ 1 for `multi`; see ADR-13), **explanations** (one `{description, reason}`
  per option; a missing one is a *warning*, not a failure), and an optional **Tips** string.

Validate before committing: `npm run validate` (add `--strict-correct-answer` to
fail any file whose `correctAnswer` is not an array).

### 3. Wire it into the navigation (`exam-paths.json`)

Each node has a `label` (the prompt for choosing among its children), child nodes
with a `title` (how they appear as an option), and a `quesPath` at the leaf:

```json
{
  "version": 1,
  "label": "Choose a domain for exam",
  "cloud": {
    "title": "Cloud Certificate Exams",
    "label": "Choose the cloud provider",
    "aws": {
      "title": "Amazon Web Services (AWS)",
      "label": "Choose a certification",
      "saa": {
        "title": "AWS Solutions Architect Associate",
        "label": "Choose difficulty level",
        "easy":   { "title": "Easy",   "quesPath": "Exams/Cloud/AWS/Solutions-Architect-Associate/Easy" },
        "medium": { "title": "Medium", "quesPath": "Exams/Cloud/AWS/Solutions-Architect-Associate/Medium" }
      }
    }
  }
}
```

Adding a whole new provider/cert is the same shape — a new nested object with a
`quesPath` leaf. The selector renders one dropdown per level automatically, to any
depth, with no code change.

### Authoring best practices

- ✅ Clear, unambiguous question text · detailed explanations for **every** option,
  not just the right one · memorable Tips · a fresh UUID per set · 2-space JSON.
- ❌ Don't reuse `setId`s across sets · don't skip explanations · don't ship
  free-text "select all" answers (single-answer only for now).

---

## Status

MVP complete: all features above are implemented and on `main`, with **310**
unit/integration/component tests plus a Playwright E2E spine, all green. See
[`docs/`](docs/) for the design, decisions, and post-MVP roadmap.
