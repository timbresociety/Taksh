import { getProvider } from "@/lib/pipeline/provider";
import { RIVAL_SCHEMA, RIVAL_SYSTEM, rivalMessage } from "@/lib/agent/rival";
import { badRequest } from "../../_shared";

export const dynamic = "force-dynamic";

// One decision for the 0G rival. Without 0G it answers 503, and the rival holds its guard.
export async function POST(request) {
  try {
    const { provider } = await getProvider();
    if (provider.source !== "0g") return Response.json({ error: "The 0G rival needs OG_API_KEY." }, { status: 503 });
    const observation = await request.json().catch(() => null);
    if (!observation || !Array.isArray(observation.lastShots)) throw badRequest("Send the fight as JSON.");
    const reply = await provider.complete({ stage: "rival", system: RIVAL_SYSTEM, user: rivalMessage(observation), schema: RIVAL_SCHEMA });
    return Response.json({ ...reply.data, ms: reply.ms, trace: reply.trace });
  } catch (error) {
    return Response.json({ error: error.expose ? error.message : "The 0G rival did not answer." }, { status: error.status ?? 502 });
  }
}
