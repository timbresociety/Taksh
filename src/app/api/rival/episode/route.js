import { after } from "next/server";
import { uploadEpisode } from "@/lib/agent/storage";
import { MAX_EPISODE_BYTES, checkEpisode } from "@/lib/agent/episode";
import { validateSpec } from "@/lib/spec/validate";
import { createBudget } from "@/lib/agent/budget";
import { ROUND_ID, loadRound, releaseRound, reserveRound, spendRound } from "@/lib/agent/ledger";
import { readText } from "../../_shared";

export const dynamic = "force-dynamic";

// Each upload is a testnet transaction from the storage wallet.
const spend = createBudget(10);
// A wait for a late decision holds the request 9 s, so waits get their own cap.
const wait = createBudget(30);

// Stores a finished 0G-rival round on 0G Storage, after checkEpisode has checked and replayed it.
export async function POST(request) {
  try {
    const text = await readText(request, MAX_EPISODE_BYTES);
    let raw = null;
    try {
      raw = JSON.parse(text);
    } catch {}
    const checked = validateSpec(raw?.spec);
    if (!checked.ok) return Response.json({ error: "That is not a Taksh episode." }, { status: 400 });
    if (!ROUND_ID.test(raw.roundId ?? "")) return Response.json({ error: "This episode has no round ID." }, { status: 400 });

    // A decision reaches Arkiv about 8 s after it was served, so the last one of a round may not be
    // readable yet. Wait once for it rather than refuse an honest round. Only a round the server knows,
    // missing one or two, is worth the wait: the rest would be refused anyway.
    let round = await loadRound(raw.roundId);
    const known = new Set(round.records.map((record) => record.requestId));
    const unknown = (Array.isArray(raw.decisions) ? raw.decisions : []).filter((decision) => decision?.requestId && !known.has(decision.requestId));
    if (round.records.length && unknown.length && unknown.length <= 2) {
      wait();
      await new Promise((done) => setTimeout(done, 9000));
      round = await loadRound(raw.roundId);
    }

    // No await between the check and the reservation, so two uploads here can't both pass.
    const episode = checkEpisode(raw, checked.spec, round);
    if (!reserveRound(episode.roundId)) return Response.json({ error: "This round is already being stored." }, { status: 409 });
    try {
      spend();
      const stored = await uploadEpisode({ ...episode, storedAt: new Date().toISOString() });
      const write = spendRound(episode.roundId, stored.rootHash);
      if (write) after(() => write.catch((error) => console.error("rival spent write failed:", error.shortMessage ?? error.message)));
      // The score here is the server's replay. Show this one, not the browser's.
      return Response.json({ ...stored, replayed: episode.replayed });
    } catch (error) {
      releaseRound(episode.roundId);
      throw error;
    }
  } catch (error) {
    return Response.json({ error: error.expose ? error.message : "0G Storage did not respond.", rootHash: error.rootHash }, { status: error.status ?? 502 });
  }
}
