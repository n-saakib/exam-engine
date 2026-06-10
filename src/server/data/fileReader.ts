import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Result for one file discovered by the reader. Parse errors are collected here
 * (never thrown) so a single bad file never aborts a scan.
 */
export interface FileReadResult {
  /** Absolute path to the file. */
  filePath: string;
  /** Parsed JSON object (null if the file could not be parsed). */
  raw: unknown | null;
  /** SHA-256 hex digest of the raw file bytes. */
  hash: string;
  /** Parse error message, if any. */
  parseError?: string;
}

/**
 * Walk `dir` recursively and return every `*.json` file path, sorted
 * lexicographically for deterministic ordering.
 */
function walkJson(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walkJson(full));
    } else if (e.isFile() && e.name.endsWith(".json")) {
      out.push(full);
    }
  }
  return out.sort();
}

/**
 * Read a single `.json` file: compute its SHA-256 hash from raw bytes, then
 * attempt JSON.parse. Returns `{ raw: null, parseError }` on failure — never
 * throws.
 */
export function readJsonFile(filePath: string): FileReadResult {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(filePath);
  } catch (e) {
    // File vanished between listing and reading — treat as empty/error.
    const hash = crypto.createHash("sha256").digest("hex");
    return {
      filePath,
      raw: null,
      hash,
      parseError: `Could not read file: ${(e as Error).message}`,
    };
  }

  const hash = crypto.createHash("sha256").update(bytes).digest("hex");

  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8"));
  } catch (e) {
    return {
      filePath,
      raw: null,
      hash,
      parseError: `JSON parse error: ${(e as Error).message}`,
    };
  }

  return { filePath, raw, hash };
}

/**
 * Recursively walk `rootDir` (and the optional `extraDir`) for `*.json` files,
 * read + hash each one, and return per-file results. Parse errors are collected
 * without aborting the walk.
 *
 * @param rootDir   Primary root (EXAMS_ROOT).
 * @param extraDir  Optional secondary root (e.g. data/uploads/).
 */
export function readAllJsonFiles(
  rootDir: string,
  extraDir?: string,
): FileReadResult[] {
  const files = walkJson(rootDir);
  if (extraDir) files.push(...walkJson(extraDir));
  // De-duplicate in case roots overlap.
  const unique = [...new Set(files)].sort();
  return unique.map((fp) => readJsonFile(fp));
}
