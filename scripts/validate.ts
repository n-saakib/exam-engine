/**
 * Standalone validator: checks every Exams/**\/*.json against the question-set
 * schema (reusing the shared zod schema — no duplicate rules). Run via
 * `npm run validate`. Exit code 1 if any file has a hard error; warnings are
 * reported but don't fail the run. Pure node/tsx — never touches the DB.
 *
 * Flags:
 *   --strict-correct-answer  Reject any file whose `correctAnswer` is a string
 *                            (post ADR-13 migration, every JSON file MUST use
 *                            a string[]). Default mode stays permissive so any
 *                            in-flight migration can validate file-by-file.
 */
import fs from "node:fs";
import path from "node:path";
import { validateQuestionSet } from "../src/domain/schemas";

const EXAMS_ROOT = path.resolve(
  process.cwd(),
  process.env.EXAMS_ROOT?.trim() || "./Exams",
);

const STRICT_CORRECT_ANSWER = process.argv.includes("--strict-correct-answer");

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

function main(): void {
  const files = findJsonFiles(EXAMS_ROOT).sort();
  if (files.length === 0) {
    console.log(`No JSON files found under ${EXAMS_ROOT}`);
    return;
  }

  let errorCount = 0;
  let warningCount = 0;

  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      errorCount++;
      console.error(`✗ ${rel}\n    not valid JSON: ${(e as Error).message}`);
      continue;
    }

    const result = validateQuestionSet(raw);
    const errors = [...result.diagnostics.filter((d) => d.severity === "error")];
    const warnings = [...result.diagnostics.filter((d) => d.severity === "warning")];

    // Strict mode (opt-in): every `correctAnswer` MUST be an array of ≥1 key.
    if (STRICT_CORRECT_ANSWER) {
      const parsed = result.data;
      if (parsed) {
        parsed.questions.forEach((q, idx) => {
          if (typeof q.correctAnswer === "string") {
            errors.push({
              severity: "error",
              path: `questions.${idx}.correctAnswer`,
              message: `correctAnswer must be an array of keys (run scripts/migrate-correctAnswer.ts --write to migrate)`,
            });
          }
        });
      }
    }

    if (errors.length > 0) {
      errorCount += errors.length;
      console.error(`✗ ${rel}`);
      for (const d of errors) console.error(`    error  ${d.path ?? ""} ${d.message}`);
    } else {
      const suffix = warnings.length > 0 ? ` (${warnings.length} warning(s))` : "";
      console.log(`✓ ${rel}${suffix}`);
    }
    for (const d of warnings) {
      warningCount++;
      console.warn(`    warn   ${d.path ?? ""} ${d.message}`);
    }
  }

  const mode = STRICT_CORRECT_ANSWER ? " [strict-correct-answer]" : "";
  console.log(
    `\n${files.length} file(s)${mode}: ${errorCount} error(s), ${warningCount} warning(s).`,
  );
  if (errorCount > 0) process.exitCode = 1;
}

main();
