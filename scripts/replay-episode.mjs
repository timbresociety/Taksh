// Downloads a 0G-rival round from 0G Storage by its root hash, or reads a saved episode file, and plays
// it again from the seed and the recorded steps. Exits 1 if the replay disagrees with what was stored.
//   npm run replay-episode -- 0x<rootHash>
//   npm run replay-episode -- episode.json
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { replayEpisode } from "../src/lib/game/session.js";
import { downloadEpisode } from "../src/lib/agent/storage.js";

const source = process.argv[2];
if (!source) {
  console.error("Usage: npm run replay-episode -- <rootHash | episode.json>");
  process.exit(2);
}
const episode = existsSync(source) ? JSON.parse(await readFile(source, "utf8")) : await downloadEpisode(source);
const result = replayEpisode(episode);
const decided = episode.decisions.filter((decision) => decision.requestId);
const stops = episode.decisions.filter((decision) => decision.safeStop);

console.log(`${episode.spec.title}: ${episode.dts.length} steps, ${episode.log.length} moves and plans`);
console.log(`0G decisions: ${decided.length}, safe stops: ${stops.length}`);
for (const decision of decided) console.log(`  t=${(decision.t / 1000).toFixed(1)}s  ${decision.plan.join(",").padEnd(16)} ${decision.requestId}  "${decision.read}"`);
console.log(`Replayed: ${result.outcome}, score ${result.score}`);
if (episode.replayed && JSON.stringify(episode.replayed) !== JSON.stringify(result)) {
  console.error(`Stored result was ${JSON.stringify(episode.replayed)}. The replay does not match.`);
  process.exit(1);
}
console.log(episode.replayed ? "Matches the stored result." : "No stored result to compare.");
