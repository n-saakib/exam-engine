import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { config } from "@/server/config";
import { getDb } from "@/server/data/db";
import { runMigrations, schemaVersion } from "@/server/boot";
import type { Health } from "@/domain/types";

// DB-backed route → Node.js runtime (never edge); dynamic so reads aren't cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_VERSION = process.env.npm_package_version ?? "0.1.0";

/** Count catalogued sets; 0 until F3 populates set_catalog. */
function countSetsIndexed(): number {
  try {
    const row = getDb()
      .prepare("SELECT COUNT(*) AS c FROM set_catalog")
      .get() as { c: number } | undefined;
    return row?.c ?? 0;
  } catch {
    // Table may not exist if migrations somehow have not run; report 0.
    return 0;
  }
}

export const GET = defineHandler({
  handler: async () => {
    // Idempotent guard: ensure migrations have run even if register() was bypassed.
    runMigrations();

    const body: Health = {
      status: "ok",
      version: APP_VERSION,
      schemaVersion: schemaVersion(),
      examsRoot: config.examsRoot,
      setsIndexed: countSetsIndexed(),
    };
    return json(body);
  },
});
