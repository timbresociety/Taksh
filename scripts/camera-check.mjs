// Runs the real camera path with a video file standing in for the webcam: Chrome's fake capture
// device, local MediaPipe, calibration and gesture recognition, in the input lab.
// It proves the wiring on real human pixels. It is not a substitute for a person at a webcam.
//
//   node scripts/camera-check.mjs <clip.mjpeg> <seconds> <trace-out.json>
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const [clip, seconds = "20", traceOut] = process.argv.slice(2);
const base = process.env.TAKSH_URL ?? "http://localhost:3100";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${clip}`, "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["camera"], acceptDownloads: true });
const page = await context.newPage();
page.on("pageerror", (error) => console.log("pageerror:", error.message));

await page.goto(`${base}/debug`);
await page.click("text=Start camera");

const seen = new Set();
const startedAt = Date.now();
let calibratedAt = null;
let lastStatus = "";
let peakFps = 0;
let tracking = {};

while (Date.now() - startedAt < Number(seconds) * 1000) {
  const status = await page.textContent('[data-testid="lab-status"]');
  if (status !== lastStatus) {
    lastStatus = status;
    console.log(`${((Date.now() - startedAt) / 1000).toFixed(1)}s  status: ${status}`);
  }
  if (!calibratedAt && status.startsWith("Calibrated")) calibratedAt = Date.now();
  peakFps = Math.max(peakFps, Number(await page.textContent('[data-testid="lab-fps"]')));
  const state = await page.textContent('[data-testid="lab-tracking"]');
  tracking[state] = (tracking[state] ?? 0) + 1;
  for (const row of await page.$$eval('[data-testid="lab-log"] li', (items) => items.map((item) => item.textContent))) {
    if (!seen.has(row)) {
      seen.add(row);
    }
  }
  await page.waitForTimeout(200);
}

console.log({ calibrated: Boolean(calibratedAt), peakFps, tracking, runsOn: await page.textContent(".lab__stats div:nth-child(4) dd") });
if (traceOut && calibratedAt) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("text=Save trace")]);
  await download.saveAs(traceOut);
  console.log(`trace saved to ${traceOut}`);
}
await page.screenshot({ path: traceOut ? traceOut.replace(/\.json$/, ".png") : "camera-check.png" });
await browser.close();
