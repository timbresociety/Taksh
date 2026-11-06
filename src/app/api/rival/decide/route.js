import { after } from "next/server";
import { getProvider } from "@/lib/pipeline/provider";
import { brainFor, cleanObservation, rivalMessage, rivalSchema } from "@/lib/agent/rival";
import { createBudget } from "@/lib/agent/budget";
import { recordDecision, roundIdFor } from "@/lib/agent/ledger";
import { badRequest, readText } from "../../_shared";

export const dynamic = "force-dynamic";

// A round asks about once every 4 s, so this fits a few players at once.
const spend = createBudget(60);

// One decision for the 0G rival. Without 0G it answers 503, and the rival waits.
export async function POST(request) {
  try {
    const { provider } = await getProvider();
    if (provider.source !== "0g") return Response.json({ error: "The 0G rival needs OG_API_KEY." }, { status: 503 });
    const text = await readText(request, 4000);
    let raw = null;
    try {
      raw = JSON.parse(text);
    } catch {}
    const brain = brainFor(raw?.template);
    if (!brain) throw badRequest("This game has no 0G rival.");
    const observation = cleanObservation(brain, raw);
    if (!observation) throw badRequest("Send the match as JSON.");
    spend();
    const roundId = roundIdFor(raw.roundId);
    const askedAt = Date.now();
    const reply = await provider.complete({ stage: "rival", system: brain.system, user: rivalMessage(observation), schema: rivalSchema(brain) });
    const plan = reply.data.plan.filter((move) => brain.moves.includes(move)).slice(0, 4);
    // issuedAt is when the plan left this server. The game can't have used it any earlier than that.
    if (reply.trace?.requestId) {
      // The Arkiv write takes about 8 s, longer than the browser waits, so it runs after the reply.
      const write = recordDecision(reply.trace.requestId, { roundId, template: raw.template, askedAt, issuedAt: Date.now(), plan, read: reply.data.read, observation, trace: reply.trace });
      if (write) after(() => write.catch((error) => console.error("rival ledger write failed:", error.shortMessage ?? error.message)));
    }
    return Response.json({ ...reply.data, plan, roundId, ms: reply.ms, trace: reply.trace });
  } catch (error) {
    return Response.json({ error: error.expose ? error.message : "The 0G rival did not answer." }, { status: error.status ?? 502 });
  }
}
