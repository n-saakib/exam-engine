import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { AppError } from "@/server/http/errors";
import { created } from "@/server/http/respond";
import { defineHandler } from "@/server/http/defineHandler";
import { validateQuestionSet } from "@/domain/schemas";
import { resolveUnderRoot } from "@/server/util/paths";
import { getContainer } from "@/server/container";
import { config } from "@/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Wrapped in defineHandler so thrown AppErrors (wrong type / too large / all
// rejected) become the standard { error } envelope with the right status code
// instead of an unhandled 500. Multipart is read from `req` inside the handler
// (no body schema, so defineHandler does not consume the request body).
export const POST = defineHandler({
  handler: ({ req }) => handleUpload(req),
});

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB

interface AcceptedFile {
  name: string;
  setId: string;
  setTitle: string;
}

interface RejectedFile {
  name: string;
  reason: string;
}

async function handleUpload(req: Request): Promise<Response> {
  const uploadsRoot = config.uploadsRoot;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    throw new AppError("UPLOAD_REJECTED", "Request must be multipart/form-data", 400);
  }

  const fileEntries = formData.getAll("files");
  if (fileEntries.length === 0) {
    throw new AppError("UPLOAD_REJECTED", "No files provided in the 'files' field", 400);
  }

  const accepted: AcceptedFile[] = [];
  const rejected: RejectedFile[] = [];

  // Ensure uploads directory exists.
  fs.mkdirSync(uploadsRoot, { recursive: true });

  const { setCatalog } = getContainer().services;

  for (const entry of fileEntries) {
    if (!(entry instanceof File)) {
      rejected.push({ name: String(entry), reason: "Invalid file entry" });
      continue;
    }

    const name = entry.name;

    // Must be a .json file.
    if (!name.toLowerCase().endsWith(".json")) {
      rejected.push({ name, reason: "Only .json files are accepted" });
      continue;
    }

    // Size cap: 1 MB.
    if (entry.size > MAX_FILE_SIZE) {
      rejected.push({
        name,
        reason: `File too large (${entry.size} bytes; max ${MAX_FILE_SIZE} bytes)`,
      });
      continue;
    }

    // Read the file bytes.
    let bytes: ArrayBuffer;
    try {
      bytes = await entry.arrayBuffer();
    } catch {
      rejected.push({ name, reason: "Could not read file data" });
      continue;
    }

    const text = Buffer.from(bytes).toString("utf8");

    // Must be valid JSON.
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      rejected.push({ name, reason: "File is not valid JSON" });
      continue;
    }

    // Must pass question-set validation (at least no hard errors).
    const validation = validateQuestionSet(raw);
    if (!validation.ok || !validation.data) {
      const messages = validation.diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => d.message)
        .join("; ");
      rejected.push({ name, reason: `Validation failed: ${messages}` });
      continue;
    }

    // Determine safe storage path: use a hash-prefixed filename to avoid collisions.
    const hash = crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
    const safeName = `${hash}_${path.basename(name)}`;

    let destPath: string;
    try {
      destPath = resolveUnderRoot(uploadsRoot, safeName);
    } catch {
      rejected.push({ name, reason: "Invalid upload target path" });
      continue;
    }

    // Symlink guard: refuse to overwrite a pre-existing symlink at the
    // destination. `fs.writeFileSync` would follow the symlink, which could
    // point OUTSIDE the uploads root and overwrite an arbitrary file.
    //
    // Use `lstatSync` (not `existsSync`) because `existsSync` follows
    // symlinks and returns false for a broken symlink — we still want to
    // refuse the upload in that case. `lstatSync` reports the symlink
    // itself regardless of whether the target exists.
    try {
      const lst = fs.lstatSync(destPath);
      if (lst.isSymbolicLink()) {
        rejected.push({
          name,
          reason: "Refusing to overwrite a pre-existing symlink at the upload target",
        });
        continue;
      }
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") {
        // lstat failed for some reason other than "doesn't exist" — treat
        // as unsafe; refuse the upload.
        rejected.push({
          name,
          reason: `Could not stat the upload target: ${err.message}`,
        });
        continue;
      }
      // ENOENT: no existing entry — safe to write.
    }

    // Write the file.
    try {
      fs.writeFileSync(destPath, text, "utf8");
    } catch (e) {
      rejected.push({ name, reason: `Could not save file: ${(e as Error).message}` });
      continue;
    }

    // Scan just this newly uploaded file into the catalogue.
    try {
      await setCatalog.scan();
    } catch {
      // Non-fatal: file is on disk, scan will pick it up on next boot/manual scan.
    }

    accepted.push({
      name,
      setId: validation.data.setId,
      setTitle: validation.data.setTitle,
    });
  }

  if (accepted.length === 0 && rejected.length > 0) {
    throw new AppError(
      "UPLOAD_REJECTED",
      "All uploaded files were rejected",
      400,
      { rejected },
    );
  }

  return created({ accepted, rejected });
}
