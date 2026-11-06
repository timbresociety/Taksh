// Copies the MediaPipe runtime out of node_modules and fetches the pose models,
// so pose tracking runs entirely from this app's own origin at play time.
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public/mediapipe");
const MODELS = ["lite", "full"].map((size) => ({
  file: `pose_landmarker_${size}.task`,
  url: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${size}/float16/latest/pose_landmarker_${size}.task`,
}));

await mkdir(path.join(out, "wasm"), { recursive: true });
await cp(path.join(root, "node_modules/@mediapipe/tasks-vision/wasm"), path.join(out, "wasm"), { recursive: true });
console.log("copied wasm runtime");

for (const model of MODELS) {
  const target = path.join(out, model.file);
  const existing = await stat(target).catch(() => null);
  if (existing?.size > 1_000_000) {
    console.log(`have ${model.file}`);
    continue;
  }
  const res = await fetch(model.url);
  if (!res.ok) throw new Error(`${model.file}: HTTP ${res.status}`);
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
  console.log(`fetched ${model.file}`);
}
