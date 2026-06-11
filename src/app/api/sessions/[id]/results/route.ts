import { z } from "zod";

import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { runMigrations } from "@/server/boot";
import { getContainer } from "@/server/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdParams = z.object({ id: z.string().min(1) });

/**
 * GET /api/sessions/:id/results — full graded results DTO (answers + explanations
 * included) for the results screen and history detail (F5-T1, 03 §5).
 * 404 SESSION_NOT_FOUND.
 */
export const GET = defineHandler({
  params: IdParams,
  handler: async ({ params }) => {
    runMigrations();
    const results = getContainer().services.examEngine.getResults(params.id);
    return json(results);
  },
});
