import { z } from "zod";

import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { getContainer } from "@/server/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GetSetsQuery = z.object({
  quesPath: z.string().min(1, "quesPath is required"),
  includeCompleted: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
});

export const GET = defineHandler({
  query: GetSetsQuery,
  handler: async ({ query }) => {
    const { setCatalog } = getContainer().services;
    const result = setCatalog.listForPath(query.quesPath);

    // If includeCompleted=false, filter out completed items but keep counts correct.
    const items =
      query.includeCompleted === false
        ? result.items.filter((i) => !i.completed)
        : result.items;

    return json({
      items: items.map((i) => ({
        setId: i.setId,
        setTitle: i.setTitle,
        difficulty: i.difficulty,
        questionCount: i.questionCount,
        completed: i.completed,
        lastAttemptAt: i.lastAttemptAt,
        updatedSinceAttempt: i.updatedSinceAttempt,
        status: i.status,
      })),
      total: result.total,
      remaining: result.remaining,
      exhausted: result.exhausted,
    });
  },
});
