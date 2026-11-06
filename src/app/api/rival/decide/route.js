import { getProvider } from "@/lib/pipeline/provider";
import { RIVAL_SCHEMA, RIVAL_SYSTEM, cleanObservation, rivalMessage } from "@/lib/agent/rival";
import { createBudget } from "@/lib/agent/budget";
import { openRound, recordDecision } from "@/lib/agent/ledger";
import { badRequest } from "../../_shared";

export const dynamic = "force-dynamic";

// A round asks about once every 4 s, so this fits a few players at once.
const spend = createBudget(60);

// One decision for the 0G rival. Without 0G it answers 503, and the rival holds its guard.
export async function POST(request) {
  try {
    const { provider } = await getProvider();
    if (provider.source !== "0g") return Response.json({ error: "The 0G rival needs OG_API_KEY." }, { status: 503 });
    const text = await request.text();
    if (text.length > 4000) throw badRequest("That fight is too large.");
    let raw = null;
    try {
      raw = JSON.parse(text);
    } catch {}
    const observation = cleanObservation(raw);
    if (!observation) throw badRequest("Send the fight as JSON.");
    spend();
    const roundId = openRound(typeof raw.roundId === "string" ? raw.roundId : null);
    const askedAt = Date.now();
    const reply = await provider.complete({ stage: "rival", system: RIVAL_SYSTEM, user: rivalMessage(observation), schema: RIVAL_SCHEMA });
    const plan = reply.data.plan.filter((side) => ["left", "right", "high"].includes(side)).slice(0, 4);
    // issuedAt is when the plan left this server. The game can't have used it any earlier than that.
    if (reply.trace?.requestId) recordDecision(reply.trace.requestId, { roundId, askedAt, issuedAt: Date.now(), plan, read: reply.data.read, observation, trace: reply.trace });
    return Response.json({ ...reply.data, plan, roundId, ms: reply.ms, trace: reply.trace });
  } catch (error) {
    return Response.json({ error: error.expose ? error.message : "The 0G rival did not answer." }, { status: error.status ?? 502 });
  }
}
