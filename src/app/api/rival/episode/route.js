import { uploadEpisode } from "@/lib/agent/storage";
import { MAX_EPISODE_BYTES, checkEpisode } from "@/lib/agent/episode";
import { validateSpec } from "@/lib/spec/validate";
import { createBudget } from "@/lib/agent/budget";
import { releaseRound, spendRound } from "@/lib/agent/ledger";
import { readText } from "../../_shared";

export const dynamic = "force-dynamic";

// Each upload is a testnet transaction from the storage wallet.
const spend = createBudget(10);

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
    const episode = checkEpisode(raw, checked.spec);
    const ids = episode.decisions.map((decision) => decision.requestId);
    try {
      spend();
      const stored = await uploadEpisode({ ...episode, storedAt: new Date().toISOString() });
      spendRound(episode.roundId, ids);
      // The score here is the server's replay. Show this one, not the browser's.
      return Response.json({ ...stored, replayed: episode.replayed });
    } catch (error) {
      releaseRound(episode.roundId, ids);
      throw error;
    }
  } catch (error) {
    return Response.json({ error: error.expose ? error.message : "0G Storage did not respond.", rootHash: error.rootHash }, { status: error.status ?? 502 });
  }
}
