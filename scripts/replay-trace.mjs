// Replays a trace saved from the input lab, so a problem seen on the demo laptop can be reproduced
// and turned into a test without standing in front of a camera.
//
//   npm run replay -- traces/taksh-trace-123.json
import { readFile } from "node:fs/promises";
import { replayTrace } from "../src/lib/motion/replay.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run replay -- <trace.json>");
  process.exit(2);
}

const trace = JSON.parse(await readFile(file, "utf8"));
const { events, tracking } = replayTrace(trace);
const counts = {};
for (const event of events) {
  counts[event.gesture] = (counts[event.gesture] ?? 0) + 1;
  console.log(`${(event.at / 1000).toFixed(2).padStart(8)}s  ${event.gesture.padEnd(12)} ${event.confidence}${event.returning ? "  (back to middle)" : ""}`);
}
console.log(`\n${trace.frames.length} frames`, { tracking, gestures: counts });
