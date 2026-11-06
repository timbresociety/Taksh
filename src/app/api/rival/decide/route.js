import { after } from "next/server";
import { brainFor, cleanObservation, rivalMessage, rivalSchema } from "@/lib/agent/rival";
import { createBudget } from "@/lib/agent/budget";
import { recordDecision, roundIdFor } from "@/lib/agent/ledger";
import { badRequest, providerFor, readText } from "../../_shared";

export const dynamic = "force-dynamic";

// A round asks about once every 4 s, so this fits a few players at once.
const spend = createBudget(60);

// One decision for the 0G rival. Without 0G it answers 503, and the rival waits.
export async function POST(request) {
  try {
    // A signed-in player pays for their rival from their own iAI credits.
    const provider = await providerFor(request);
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
    // 1 reply in 26 on 2026-11-07 had no usable move. That is no decision: the browser logs a safe stop and asks again.
    if (!plan.length) return Response.json({ error: "0G sent no usable plan.", requestId: reply.trace?.requestId }, { status: 502 });
    // glm-5.3 sometimes sends "..." for a text field. Drop it rather than show it.
    const words = (value) => (/\p{L}/u.test(value ?? "") ? value : "");
    const read = words(reply.data.read);
    const taunt = words(reply.data.taunt);
    // issuedAt is when the plan left this server. The game can't have used it any earlier than that.
    if (reply.trace?.requestId) {
      // The Arkiv write takes about 8 s, longer than the browser waits, so it runs after the reply.
      const write = recordDecision(reply.trace.requestId, { roundId, template: raw.template, askedAt, issuedAt: Date.now(), plan, read, observation, trace: reply.trace });
      if (write) after(() => write.catch((error) => console.error("rival ledger write failed:", error.shortMessage ?? error.message)));
    }
    return Response.json({ ...reply.data, plan, read, taunt, roundId, ms: reply.ms, trace: reply.trace });
  } catch (error) {
    return Response.json({ error: error.expose ? error.message : "The 0G rival did not answer." }, { status: error.status ?? 502 });
  }
}
