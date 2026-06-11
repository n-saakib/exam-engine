import { defineHandler } from "@/server/http/defineHandler";
import { getContainer } from "@/server/container";
import { runMigrations } from "@/server/boot";
import { ExportQuerySchema } from "@/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/export?format=json|csv&scope=history|all
 *
 * Validates params and gathers ALL data BEFORE writing the response body so
 * we can still return a proper JSON error envelope if something goes wrong
 * (09 §7.5 — can't send an error mid-stream).
 *
 * - format=json  → Content-Type: application/json, full structured export
 * - format=csv   → Content-Type: text/csv, one row per completed exam
 * - scope=all    → includes settings + per-question detail (json only)
 */
export const GET = defineHandler({
  query: ExportQuerySchema,
  handler: async ({ query }) => {
    runMigrations();
    const { services } = getContainer();

    // Build the entire payload synchronously before writing a single byte.
    const format = (query.format ?? "json") as "json" | "csv";
    const scope = (query.scope ?? "history") as "history" | "all";
    const result = services.export.build(format, scope);

    return new Response(result.body, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(Buffer.byteLength(result.body, "utf8")),
      },
    });
  },
});
