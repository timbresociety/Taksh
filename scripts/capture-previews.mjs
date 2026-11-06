// Saves the stills on the game shelf and the world and style pickers, drawn by the real renderer with
// each game's own bot playing. Needs a running app: PORT=3000 npm run previews
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { STARTER_LOOKS } from "../src/lib/spec/starter.js";
import { STYLES, WORLDS } from "../src/lib/spec/contract.js";

const PORT = process.env.PORT ?? 3000;
const OUT = "public/previews";
mkdirSync(OUT, { recursive: true });

const shots = [
  ...Object.entries(STARTER_LOOKS).map(([template, look]) => ({ name: `game-${template}`, query: { template, ...look }, wait: 8200, width: 800 })),
  ...WORLDS.map((world) => ({ name: `world-${world.id}`, query: { preview: "1", world: world.id, style: "bright" }, wait: 1500, width: 320 })),
  ...STYLES.map((style) => ({ name: `style-${style.id}`, query: { preview: "1", world: "forest", style: style.id }, wait: 1500, width: 320 })),
];

// ONLY=game-keeper,world-moon recaptures just those stills.
const only = process.env.ONLY?.split(",");

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
for (const shot of shots.filter((item) => !only || only.includes(item.name))) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(`http://localhost:${PORT}/debug/stage?${new URLSearchParams(shot.query)}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__rigReady || window.__rigError, null, { timeout: 60000 });
  await page.waitForTimeout(shot.wait);
  const picture = await page.screenshot({ timeout: 60000 });
  await sharp(picture).resize(shot.width).webp({ quality: 78 }).toFile(`${OUT}/${shot.name}.webp`);
  console.log(shot.name);
  await page.close();
}
await browser.close();
