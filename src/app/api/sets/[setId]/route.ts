import { z } from "zod";

import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { getContainer } from "@/server/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SetIdParams = z.object({
  setId: z.string().min(1),
});

export const GET = defineHandler({
  params: SetIdParams,
  handler: async ({ params }) => {
    const { setCatalog } = getContainer().services;
    const set = setCatalog.loadSet(params.setId);
    return json(set);
  },
});
