/**
 * One-off migration: rewrite every `correctAnswer` under `Exams/`
 * (recursively, every `*.json`) to a `string[]`, per ADR-13 (unified array shape).
 *
 * Recognised string shapes (the only ones that exist in the corpus as of this
 * migration):
 *   - Single A-Z letter:         "A"            -> ["A"]
 *   - "X and Y" / "X and Y and Z"                -> ["X","Y",...]
 *   - "X, Y" / "X, Y, Z" (comma-joined)         -> ["X","Y","Z"]  (warns)
 *   - Already an array:                          -> pass-through
 *
 * Any other shape aborts the run with a clear error. If the resulting array
 * has length >= 2, the question's `questionType` is auto-promoted to "multi"
 * (this fixes the 3 currently-broken questions, which never set `multi`).
 *
 * Idempotent: array values are skipped on re-run.
 *
 * Usage:
 *   npx tsx scripts/migrate-correctAnswer.ts --dry-run   # default
 *   npx tsx scripts/migrate-correctAnswer.ts --write
 *
 * EXAMS_ROOT env var overrides the default `./Exams` directory.
 */
import fs from "node:fs";
import path from "node:path";

const REPO = process.cwd();
const EXAMS_ROOT = path.resolve(
  REPO,
  process.env.EXAMS_ROOT?.trim() || "./Exams",
);
const DRY_RUN = !process.argv.includes("--write");

// A single A–Z letter (case-insensitive — we uppercase the output).
const SINGLE_KEY = /^[A-Z]$/i;
// "A and B" or "A and B and C"  (whitespace around "and" required).
const AND_JOINED = /^[A-Z](?:\s+and\s+[A-Z])+$/i;
// "A, B" or "A,B,C"  (whitespace around commas optional).
const COMMA_JOINED = /^[A-Z](?:\s*,\s*[A-Z])+$/i;

function parseStringCorrectAnswer(s: string): string[] | null {
  const t = s.trim();
  if (SINGLE_KEY.test(t)) return [t.toUpperCase()];
  if (AND_JOINED.test(t)) {
    // Split on " and " (case-insensitive, whitespace-flexible) and uppercase
    // each token. We deliberately do NOT regex-extract `[A-Z]` from the full
    // string: doing so picks up the letters inside the word "and" itself.
    return t
      .split(/\s+and\s+/i)
      .map((p) => p.trim().toUpperCase());
  }
  if (COMMA_JOINED.test(t)) {
    return t
      .split(/\s*,\s*/)
      .map((p) => p.trim().toUpperCase());
  }
  return null;
}

function findJsonFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findJsonFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

interface Counts {
  filesTouched: number;
  questionsTouched: number;
  promotedToMulti: number;
  commaWarnings: number;
}

const counts: Counts = {
  filesTouched: 0,
  questionsTouched: 0,
  promotedToMulti: 0,
  commaWarnings: 0,
};
const errors: string[] = [];

for (const file of findJsonFiles(EXAMS_ROOT).sort()) {
  const rel = path.relative(REPO, file);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  let fileDirty = false;

  for (const q of raw.questions ?? []) {
    if (q == null || typeof q !== "object") continue;
    const ca = q.correctAnswer;
    if (Array.isArray(ca)) continue; // already migrated — idempotent
    if (typeof ca !== "string") {
      errors.push(`${rel}: question ${q.id}: correctAnswer is neither string nor array (${typeof ca})`);
      continue;
    }
    const parsed = parseStringCorrectAnswer(ca);
    if (parsed === null) {
      errors.push(
        `${rel}: question ${q.id}: correctAnswer ${JSON.stringify(ca)} is not a recognised key list — manual fix required (expected "A", "A and B", or ["A","B"])`,
      );
      continue;
    }
    if (COMMA_JOINED.test(ca.trim())) counts.commaWarnings++;
    q.correctAnswer = parsed;
    if (parsed.length >= 2 && q.questionType !== "multi") {
      q.questionType = "multi";
      counts.promotedToMulti++;
      console.warn(
        `[promote] ${rel}: question ${q.id} auto-promoted single → multi (correctAnswer ${JSON.stringify(parsed)})`,
      );
    }
    fileDirty = true;
    counts.questionsTouched++;
  }

  if (fileDirty) {
    counts.filesTouched++;
    if (DRY_RUN) {
      console.log(`[dry-run] would update ${rel}`);
    } else {
      // No trailing newline: the corpus files don't carry one and adding it
      // would produce a noisy `+1` line per file in the diff.
      fs.writeFileSync(file, JSON.stringify(raw, null, 2), "utf8");
      console.log(`[write]    updated ${rel}`);
    }
  }
}

const mode = DRY_RUN ? "dry-run" : "write";
console.log(
  `\n[${mode}] ${counts.filesTouched} file(s), ${counts.questionsTouched} question(s) updated, ${counts.promotedToMulti} promoted to "multi", ${counts.commaWarnings} comma-joined warning(s).`,
);

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (DRY_RUN) console.log("\n(dry-run) re-run with --write to apply changes.");
