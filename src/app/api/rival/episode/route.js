import { replayEpisode } from "@/lib/game/session";
import { uploadEpisode } from "@/lib/agent/storage";
import { validateSpec } from "@/lib/spec/validate";
import { createBudget } from "@/lib/agent/budget";

export const dynamic = "force-dynamic";

// Each upload is a testnet transaction from the storage wallet.
const spend = createBudget(10);

// Stores a finished 0G-rival round on 0G Storage, after checking it replays to the result it claims.
export async function POST(request) {
  try {
    const episode = await request.json();
    const checked = validateSpec(episode?.spec);
    if (!checked.ok || !Array.isArray(episode.dts) || !Array.isArray(episode.log) || !Array.isArray(episode.decisions)) {
      return Response.json({ error: "That is not a Taksh episode." }, { status: 400 });
    }
    const replayed = replayEpisode({ spec: checked.spec, options: episode.options, dts: episode.dts, log: episode.log });
    spend();
    const stored = await uploadEpisode({ version: 1, ...episode, spec: checked.spec, replayed });
    return Response.json({ ...stored, replayed });
  } catch (error) {
    return Response.json({ error: error.expose ? error.message : "0G Storage did not respond.", rootHash: error.rootHash }, { status: error.status ?? 502 });
  }
}
