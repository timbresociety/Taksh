import { replayEpisode } from "@/lib/game/session";
import { uploadEpisode } from "@/lib/agent/storage";
import { MAX_EPISODE_BYTES, checkEpisode } from "@/lib/agent/episode";
import { validateSpec } from "@/lib/spec/validate";
import { createBudget } from "@/lib/agent/budget";
import { releaseDecisions, spendDecisions } from "@/lib/agent/ledger";

export const dynamic = "force-dynamic";

// Each upload is a testnet transaction from the storage wallet.
const spend = createBudget(10);

// Stores a finished 0G-rival round on 0G Storage, after checking it and replaying it.
export async function POST(request) {
  try {
    const text = await request.text();
    if (text.length > MAX_EPISODE_BYTES) return Response.json({ error: "That episode is too large to store." }, { status: 413 });
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
      const replayed = replayEpisode(episode);
      const stored = await uploadEpisode({ ...episode, replayed, storedAt: new Date().toISOString() });
      spendDecisions(ids);
      return Response.json({ ...stored, replayed });
    } catch (error) {
      releaseDecisions(ids);
      throw error;
    }
  } catch (error) {
    return Response.json({ error: error.expose ? error.message : "0G Storage did not respond.", rootHash: error.rootHash }, { status: error.status ?? 502 });
  }
}
