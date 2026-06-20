# Question Set Authoring Template

A reusable pattern for creating question sets in this app's exam folders
(any `Exams/.../<cert>/<difficulty>/`). The authoritative schema reference
is [`docs/02-data-model.md`](./02-data-model.md) §1 — if this file and
that document disagree, the data-model doc wins.

A complete, copy-ready example lives at [`set.template.json`](./set.template.json)
sibling to this file.

---

## File naming

Convention (advisory — the catalog keys on path + `setId`, not the filename):

```
{provider}_{exam-code}_{topic}_{set-number}_{difficulty}.json
```

- Mock sets omit the difficulty segment, e.g. `aws_saa_iam_ec2_set1.json`.
- Place the file under `Easy/`, `Medium/`, `Hard/`, or `Mock/` based on the
  intended difficulty.

## Required fields

| Field | Type | Notes |
|---|---|---|
| `setId` | string (UUID) | Unique across the whole corpus. Generate with `node -e "console.log(crypto.randomUUID())"`. Never reuse, even across certifications. |
| `setTitle` | string | Human-readable title shown in the UI. |
| `difficulty` | string | `Easy` \| `Medium` \| `Hard` \| `Mock` (case-insensitive; normalised to canonical casing). |
| `questions` | array | Non-empty. Each entry has the per-question fields below. |

## Per-question fields

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Unique within the set. Must be positive. |
| `questionText` | string | Non-empty. |
| `options` | object | 2–6 keys, each a single uppercase letter `A`–`Z`. Values are the option text. |
| `correctAnswer` | **string[]** | **See the rule below — this is the most common mistake.** |
| `explanations` | object | One `{ description, reason }` per option key. Missing entries are a validator warning, not a hard failure. |
| `questionType` | string (optional) | Defaults to `"single"`. Set to `"multi"` for select-all-that-apply. |
| `Tips` | string (optional) | A mnemonic or short hint to remember the concept. |

---

## The two rules that get violated most often

### 1. `correctAnswer` is **always** a JSON array

```jsonc
// ✅ single-answer question (correctAnswer length = 1)
"correctAnswer": ["B"]

// ✅ multi-answer question (correctAnswer length ≥ 1)
"correctAnswer": ["A", "C"]

// ❌ bare string — validator emits an error in strict mode
"correctAnswer": "B"
```

This is the unified array shape from **ADR-13**. The validator
(`scripts/validate.ts`) accepts both shapes in default mode for backward
compatibility, but `--strict-correct-answer` rejects any string form. New
files must use the array form.

If you have a legacy file with string `correctAnswer` values, run:

```bash
EXAMS_ROOT=<dir containing the file> \
  npx tsx scripts/migrate-correctAnswer.ts --write
```

### 2. `explanations` must cover **every** option key

```jsonc
"options": { "A": "...", "B": "...", "C": "...", "D": "..." },
"explanations": {
  "A": { "description": "...", "reason": "..." },
  "B": { "description": "...", "reason": "..." },
  "C": { "description": "...", "reason": "..." },
  "D": { "description": "...", "reason": "..." }
}
```

A missing explanation is a **warning**, not a failure — the file still
loads — but pedagogically every distractor deserves a short reason. Don't
ship explanations that only justify the correct option.

## Validate before committing

```bash
# Default mode — schema + warnings
EXAMS_ROOT=./Exams/Cloud/AWS/Solutions-Architect-Associate \
  npm run validate

# Strict mode — also fails any file with a string correctAnswer
EXAMS_ROOT=./Exams/Cloud/AWS/Solutions-Architect-Associate \
  npx tsx scripts/validate.ts --strict-correct-answer
```

Expected output: `N file(s): 0 error(s), 0 warning(s).`

## Adding a whole new certification path

1. Create the directory tree, e.g. `Exams/Cloud/Azure/Administrator/Easy`.
2. Drop the JSON set(s) into the appropriate difficulty folder.
3. Add a leaf entry to `exam-paths.json` (repo root) pointing at the
   difficulty directory. See `README.md` §3 for the exact shape.

No application code changes are required — the catalog scanner walks
`Exams/` recursively (`src/server/data/fileReader.ts`).

## Best practices

- ✅ Clear, unambiguous question text.
- ✅ Detailed explanations for **every** option, not just the right one.
- ✅ Memorable `Tips`.
- ✅ A fresh UUID per `setId` — never reuse.
- ✅ 2-space JSON, no trailing newline.
- ❌ Don't ship free-text "select all" answers; multi-answer must use the
  `["A", "C"]` array shape with `questionType: "multi"`.
- ❌ Don't put a set directly under the cert folder — always nest under a
  difficulty folder (`Easy/`, `Medium/`, `Hard/`, `Mock/`) so the catalog
  can pick a `ques_path` that matches a leaf in `exam-paths.json`.
