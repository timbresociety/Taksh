// Proves a world works: its data, its road, and every game in it. Needs a running app:
// PORT=3000 npm run world:check -- mumbai
// Writes a contact sheet of every game in that world to e2e-shots/, for a person to look at.
import { mkdir, readFile, readdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { STYLES } from "../src/lib/spec/contract.js";
import { PROP_NAMES } from "../src/lib/stage/props/index.js";
import { checkWorld } from "../src/lib/stage/world-check.js";
import { WORLD_LOOKS } from "../src/lib/stage/worlds.js";
import { TEMPLATES } from "../src/lib/templates/index.js";

const PORT = process.env.PORT ?? 3000;
const OUT = "e2e-shots";
const TILE = { width: 480, height: 270 };
const COLUMNS = 4;
const PLAY_MS = 2500;

const id = process.argv[2];
if (!WORLD_LOOKS[id]) {
  console.error(`Name a world: ${Object.keys(WORLD_LOOKS).join(", ")}`);
  process.exit(2);
}

async function kitModels() {
  const models = {};
  for (const file of (await readdir("public/assets/kit")).filter((name) => name.endsWith(".glb"))) {
    const data = await readFile(`public/assets/kit/${file}`);
    models[file.replace(".glb", "")] = new Set(JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString("utf8")).nodes.map((node) => node.name));
  }
  return models;
}

const problems = checkWorld(id, WORLD_LOOKS[id], { props: PROP_NAMES, models: await kitModels() });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });

async function shot(template, style) {
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/debug/stage?${new URLSearchParams({ template, world: id, style })}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__rigReady || window.__rigError, null, { timeout: 60000 }).catch(() => errors.push("never finished loading"));
  await page.waitForTimeout(PLAY_MS);
  const state = await page.evaluate(() => ({ error: window.__rigError ?? null, frames: window.__stageFrames ?? 0, blockers: window.__roadBlockers?.() ?? [] }));
  if (state.error) errors.push(state.error.slice(0, 200));
  if (!state.frames) errors.push("drew no frames");
  for (const blocker of state.blockers) problems.push(`${id}: ${blocker} stands in the road in ${template}`);
  for (const error of errors) problems.push(`${id}: ${template} in ${style}: ${error}`);
  const image = await page.screenshot({ type: "png" });
  await page.close();
  console.log(`${errors.length ? "FAIL" : "pass"}  ${template} in ${style}`);
  return sharp(image).resize(TILE.width, TILE.height).png().toBuffer();
}

const tiles = [];
for (const template of TEMPLATES) tiles.push(await shot(template.id, "bright"));
for (const style of STYLES.filter((item) => item.id !== "bright")) tiles.push(await shot("lane_runner", style.id));
await browser.close();

await mkdir(OUT, { recursive: true });
const sheet = `${OUT}/world-${id}.png`;
await sharp({ create: { width: TILE.width * COLUMNS, height: TILE.height * Math.ceil(tiles.length / COLUMNS), channels: 3, background: "#000" } })
  .composite(tiles.map((input, index) => ({ input, left: (index % COLUMNS) * TILE.width, top: Math.floor(index / COLUMNS) * TILE.height })))
  .png()
  .toFile(sheet);

const found = [...new Set(problems)];
for (const problem of found) console.error(`  ${problem}`);
console.log(`\n${found.length ? `${found.length} problems` : "No problems"} in ${id}. Look at ${sheet} before calling it done.`);
process.exit(found.length ? 1 : 0);
