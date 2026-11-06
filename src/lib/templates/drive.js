// What the driven games share. Speed and steering arrive two ways: the camera reads them on every frame
// through template.drive, and without a camera each press of a key is one beat and two keys steer. On
// camera the bound move fires the same beat the reading already holds, so a driver takes the higher of
// the two rather than adding them.
import { REACTION_MS } from "./shared.js";

const BEAT_WINDOW_MS = 1500; // the window the camera counts beats over, so a key and a body feel alike
const CAMERA_MS = 300; // a reading stands this long, so a dropped frame or two doesn't stall the boat
const NEAR_ENOUGH = 0.3;

export const createDriver = () => ({ beats: [], bodyBeats: 0, tilt: 0, held: 0, cameraMs: 0, rate: 0 });

export function addBeat(driver, t) {
  driver.beats.push(t);
}

export function readBody(driver, beats, tilt) {
  driver.bodyBeats = beats;
  driver.tilt = tilt;
  driver.cameraMs = CAMERA_MS;
}

// A key steers until it is let go. A lean has no release, so on camera only the reading steers.
export function steerKey(driver, action) {
  if (driver.cameraMs > 0) return;
  if (action === "left") driver.held = -1;
  if (action === "right") driver.held = 1;
  if ((action === "left_release" && driver.held < 0) || (action === "right_release" && driver.held > 0)) driver.held = 0;
}

export function stepDriver(driver, t, dtMs) {
  driver.cameraMs = Math.max(0, driver.cameraMs - dtMs);
  while (driver.beats.length && t - driver.beats[0] > BEAT_WINDOW_MS) driver.beats.shift();
  driver.rate = Math.max(driver.beats.length / (BEAT_WINDOW_MS / 1000), driver.cameraMs > 0 ? driver.bodyBeats : 0);
}

export const steering = (driver) => (driver.cameraMs > 0 ? driver.tilt : driver.held);

// The nearest line that misses every block, for the bots and the rival boats.
export function clearLine(x, blocks, { limit, clearance }) {
  const safe = (at) => blocks.every((block) => Math.abs(at - block.x) >= block.half + clearance);
  for (let offset = 0; offset <= limit * 2; offset += 0.2) {
    for (const at of [x + offset, x - offset]) if (Math.abs(at) <= limit && safe(at)) return at;
  }
  return x;
}

// Which key a player presses or lets go to reach a line, allowing for how far they drift while reacting.
export function botSteer(driver, x, target, rate, skill) {
  const gap = target - x;
  const coast = (rate * REACTION_MS[skill]) / 1000 + 0.1;
  if (driver.held < 0 && gap > -coast) return "left_release";
  if (driver.held > 0 && gap < coast) return "right_release";
  if (driver.held === 0 && gap < -NEAR_ENOUGH) return "left";
  if (driver.held === 0 && gap > NEAR_ENOUGH) return "right";
  return null;
}
