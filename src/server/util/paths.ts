import "server-only";

import fs from "node:fs";
import path from "node:path";

import { AppError } from "@/server/http/errors";

/**
 * Resolve `candidate` against the sandbox `root` and guarantee the result stays
 * inside `root`. Throws `AppError('PATH_TRAVERSAL', …)` on any escape. Consumed
 * by PathResolver (F2), the catalogue upload target, and the Settings
 * `exams_root` validator (F3/F8) — `exams_root` is validated BEFORE it is
 * persisted, not just when used (09 §7.5).
 *
 * Defends against: `../../etc/passwd`, URL-encoded `%2e%2e`, absolute candidate
 * paths, and "valid relative that escapes after resolve". Symlink escapes are
 * caught via `fs.realpathSync` when both ends exist on disk.
 *
 * @param root      Absolute (or cwd-relative) sandbox root.
 * @param candidate Untrusted path (relative or absolute).
 * @returns The resolved absolute path, guaranteed within `root`.
 */
export function resolveUnderRoot(root: string, candidate: string): string {
  const absRoot = path.resolve(root);

  // Decode percent-encodings first so `%2e%2e%2f` can't smuggle a `../`.
  // `decodeURIComponent` can throw on malformed input — treat that as traversal.
  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    throw new AppError("PATH_TRAVERSAL", `Malformed path: ${candidate}`, 400, {
      root: absRoot,
      candidate,
    });
  }

  // Reject NUL bytes outright (path APIs choke / can be abused).
  if (decoded.includes("\0")) {
    throw new AppError("PATH_TRAVERSAL", "Path contains a null byte", 400, {
      root: absRoot,
    });
  }

  // An absolute candidate is resolved as-is; a relative one against the root.
  const resolved = path.resolve(absRoot, decoded);

  if (!isWithin(absRoot, resolved)) {
    throw new AppError(
      "PATH_TRAVERSAL",
      `Path escapes the allowed root: ${candidate}`,
      400,
      { root: absRoot, resolved },
    );
  }

  // Symlink check: if the resolved target (or its nearest existing ancestor)
  // realpaths to somewhere outside the root, reject. Skip if nothing exists yet
  // (e.g. an upload target that has not been created) — the textual check above
  // already constrains it.
  const realResolved = realpathOfNearestExisting(resolved);
  if (realResolved !== null) {
    const realRoot = realpathOfNearestExisting(absRoot) ?? absRoot;
    if (!isWithin(realRoot, realResolved)) {
      throw new AppError(
        "PATH_TRAVERSAL",
        `Path resolves (via symlink) outside the allowed root: ${candidate}`,
        400,
        { root: absRoot, resolved: realResolved },
      );
    }
  }

  return resolved;
}

/** True iff `child` is `parent` itself or a descendant of it. */
function isWithin(parent: string, child: string): boolean {
  if (child === parent) return true;
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * realpath of `target`, or of its nearest existing ancestor, or null if even the
 * root of the path doesn't exist. Lets us catch symlink escapes for paths that
 * may be partially non-existent (e.g. a not-yet-created upload file).
 */
function realpathOfNearestExisting(target: string): string | null {
  let current = target;
  for (;;) {
    try {
      return fs.realpathSync(current);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}
