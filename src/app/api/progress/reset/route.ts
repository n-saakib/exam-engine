import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { getContainer } from "@/server/container";
import { runMigrations } from "@/server/boot";
import { ResetScopeSchema } from "@/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/progress/reset
 *
 * Resets progress with one of three scopes (02 §6.2, 03 §7):
 *
 * - `path`    → delete set_completion rows for a specific quesPath (history kept).
 * - `all`     → delete all exam_sessions (answers cascade), set_completion.
 *              Settings and set_catalog are preserved.
 * - `factory` → `all` + also reset settings to defaults.
 *
 * The entire operation is wrapped in a single SQLite transaction so a partial
 * failure never leaves the database in an inconsistent state.
 */
export const POST = defineHandler({
  body: ResetScopeSchema,
  handler: async ({ body }) => {
    runMigrations();
    const { repos } = getContainer();

    // All mutations inside one transaction.
    const db = repos.session.db;

    const result = db.transaction(() => {
      let sessions = 0;
      let completion = 0;

      if (body.scope === "path") {
        completion = repos.completion.deleteByPath(body.quesPath);
        // history/sessions are intentionally kept
      } else if (body.scope === "all" || body.scope === "factory") {
        sessions = repos.session.deleteAll();
        completion = repos.completion.deleteAll();

        if (body.scope === "factory") {
          repos.settings.reset();
        }
      }

      return { sessions, completion };
    })();

    return json({
      cleared: {
        sessions: result.sessions,
        completion: result.completion,
      },
    });
  },
});
