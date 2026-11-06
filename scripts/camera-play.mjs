// Plays a full round in camera mode with a video file standing in for the webcam, through the real
// UI: idea, calibration, countdown, round, pause on lost tracking, and the result screen.
//
//   node scripts/camera-play.mjs <clip.mjpeg> <idea> <shots-dir>
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const [clip, idea, shots = "camera-shots"] = process.argv.slice(2);
const base = process.env.TAKSH_URL ?? "http://localhost:3100";
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${clip}`, "--enable-unsafe-swiftshader"],
});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["camera"] })).newPage();
const problems = [];
page.on("pageerror", (error) => problems.push(error.message));

await page.goto(base);
await page.fill("#idea", idea);
await page.click('button[type="submit"]');
await page.waitForSelector('[data-testid="game-title"]');
await page.click("text=Play with camera");
await page.waitForSelector('[data-testid="calibrate-status"]');

const started = Date.now();
const elapsed = () => ((Date.now() - started) / 1000).toFixed(1).padStart(5);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}/calibrate.png` });
await page.waitForSelector('[data-testid="play"]', { timeout: 60000 });
console.log(`${elapsed()}s calibrated, round loading`);

let phase = null;
let pauses = 0;
const seen = new Set();
let shotPlaying = false;
let everTracked = false;
let shotPaused = false;
while (Date.now() - started < 130000) {
  if (await page.$('[data-testid="result-score"]')) break;
  const now = await page.getAttribute('[data-testid="play"]', "data-phase").catch(() => null);
  if (now && now !== phase) {
    console.log(`${elapsed()}s phase: ${now}`);
    if (now === "paused") pauses += 1;
    phase = now;
  }
  const state = await page.textContent(".pip__state").catch(() => "");
  if (state === "Tracking" || state === "Legs not in view") everTracked = true;
  const list = await page.$$eval('[data-testid="movements"] li', (items) => items.map((item) => `${item.textContent} used=${item.dataset.used}`)).catch(() => []);
  for (const movement of list.slice(0, 1)) {
    if (!seen.has(movement)) {
      seen.add(movement);
      console.log(`${elapsed()}s movement: ${movement}`);
    }
    seen.clear();
    seen.add(movement);
  }
  if (phase === "playing" && !shotPlaying && list.length) {
    shotPlaying = true;
    await page.screenshot({ path: `${shots}/playing.png` });
  }
  if (phase === "paused" && !shotPaused) {
    shotPaused = true;
    await page.screenshot({ path: `${shots}/paused.png` });
  }
  await page.waitForTimeout(100);
}

if (!everTracked) problems.push("tracking was never live during the round");
const score = await page.textContent('[data-testid="result-score"]').catch(() => "no result");
const headline = await page.textContent('[data-testid="result-headline"]').catch(() => "");
console.log({ headline, score, pauses, problems });
await page.screenshot({ path: `${shots}/result.png` });

// Revise, then replay on the same camera session without recalibrating.
if (await page.$("#revision")) {
  await page.fill("#revision", "Give me more time to dodge");
  await page.click("text=Change it");
  await page.waitForSelector('[data-testid="revision"]');
  console.log("revision:", (await page.textContent('[data-testid="revision"]')).slice(0, 120));
  await page.click("text=Play the new version");
  await page.waitForSelector('[data-phase="playing"]', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const replayState = await page.textContent(".pip__state");
  console.log("replay running in camera mode, tracking:", replayState);
  if (replayState === "Looking for you") problems.push("tracking died on replay");
}
console.log(problems.length ? `FAIL: ${problems.join("; ")}` : "camera flow ok");
process.exitCode = problems.length ? 1 : 0;
await browser.close();
