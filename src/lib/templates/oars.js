// Koli Race: fishing boats race down a channel. Pumping arms pull the oars, a side bend steers, and the
// shoals give a surge. The course comes from the seed, and the rival crews row it at their own pace.
import { addBeat, botSteer, clearLine, createDriver, readBody, steerKey, steering, stepDriver } from "./drive.js";
import { clamp, createRandom } from "./shared.js";

export const CHANNEL = 3.4; // how far from the middle a boat can go
const BOAT_HALF = 0.62;
const HIT_RANGE = 1.5;
const FIRST_ROW_M = 60; // a player finds their stroke before the first hazard
const LAST_ROW_M = 40;
const STEER_MPS = 3.8;
const PICK_RANGE = 1.3;
const SURGE_MS = 1400;
const SURGE = 1.16;
const BUMP_MS = 900;
const BUMP_LOSS = 0.45;
const SPEED_UP = 1.8;
const SLOW_DOWN = 0.9;
const FINALE_MS = 3200;
const GRACE_MS = 9000; // how long the crews wait at the line for the last boat
const CALL_MS = 1800; // well past the 900 ms every warning has to give
const HAZARD_HALF = { buoy: 0.6, log: 1.35 };
const SPREAD = [0, 0.07, 0.14]; // the crews row at this much less than the leader
const LANES = [-2.7, 2.7, 1];
const HEAD_START_M = [0, 0, 8]; // the slowest crew starts ahead, or four boats will not fit across the line
const WORDS = ["1st", "2nd", "3rd", "4th"];

function layCourse(state) {
  const { rng, gap, finishM } = state;
  for (let at = FIRST_ROW_M; at < finishM - LAST_ROW_M; at += gap * rng.range(0.8, 1.2)) {
    const open = rng.range(-2.4, 2.4);
    const kind = rng.next() < 0.4 ? "log" : "buoy";
    const half = HAZARD_HALF[kind];
    const room = (side) => CHANNEL * side - open;
    for (const side of [-1, 1]) {
      if (Math.abs(room(side)) < half * 2 + 1.5 || rng.next() < 0.25) continue;
      const x = open + side * rng.range(half + 1.5, Math.abs(room(side)) - half + 0.2);
      state.hazards.push({ id: state.nextId++, kind, x: clamp(x, -CHANNEL, CHANNEL), at, half, hit: false });
    }
    if (rng.next() < 0.6) for (let i = 0; i < 3; i += 1) state.fish.push({ id: state.nextId++, x: open, at: at - 14 + i * 4, taken: false });
  }
}

const placeOf = (state) => 1 + state.rivals.filter((rival) => rival.distance > state.distance).length;
const aheadOf = (state, distance, reach) => state.hazards.filter((item) => !item.hit && item.at > distance && item.at < distance + reach);

// The word that matters most: the turn to make, or the arms if the boat has stopped.
function callOut(state) {
  const reach = (state.speed * CALL_MS) / 1000;
  const block = aheadOf(state, state.distance, reach).find((item) => Math.abs(item.x - state.x) < item.half + BOAT_HALF);
  if (block) return block.x > state.x ? "Lean left" : "Lean right";
  return state.speed < state.top * 0.4 ? "Pump your arms" : null;
}

export default {
  id: "oars",
  name: "Koli Race",
  pitch: "Pump your arms to pull the oars, bend sideways to steer your fishing boat, and beat the other crews to the line.",
  kind: "Cardio",
  space: "Fits a chair",
  length: "90 s",
  framing: "upper",
  score: "metres",
  actions: [
    { id: "row", label: "Pull the oars", key: " ", keyLabel: "Space" },
    { id: "left", label: "Steer left", key: "ArrowLeft", keyLabel: "←", hold: true },
    { id: "right", label: "Steer right", key: "ArrowRight", keyLabel: "→", hold: true },
  ],
  bindings: [
    { gesture: "arm_pump", action: "row", exercise: "Arm pump" },
    { gesture: "lean_left", action: "left", exercise: "Side bend" },
    { gesture: "lean_right", action: "right", exercise: "Side bend" },
  ],
  tuning: {
    courseM: { label: "Race length", unit: "m", min: 250, max: 900, default: 520, higherIsHarder: true, whole: true },
    topSpeed: { label: "Top speed", unit: "m/s", min: 6, max: 11, default: 8.5, higherIsHarder: true },
    fullBeats: { label: "Arm beats a second for top speed", unit: "", min: 2, max: 4, default: 3, higherIsHarder: true },
    rivalPace: { label: "Pace of the best crew, as a share of top speed", unit: "", min: 0.55, max: 0.95, default: 0.84, higherIsHarder: true },
    gap: { label: "Water between hazards", unit: "m", min: 20, max: 60, default: 32, higherIsHarder: false },
  },

  create(spec) {
    const { courseM, topSpeed, fullBeats, rivalPace, gap } = spec.tuning;
    const state = {
      status: "playing", t: 0, rng: createRandom(spec.seed), nextId: 1, finishM: courseM, top: topSpeed, fullBeats, gap, driver: createDriver(),
      x: 0, speed: 0, distance: 0, surgeMs: 0, bumpMs: 0, finaleMs: 0, lateMs: null, finished: false, won: false, place: LANES.length + 1, hazards: [], fish: [],
      rivals: SPREAD.map((less, index) => ({ id: index, x: LANES[index], aim: LANES[index], distance: HEAD_START_M[index], speed: 0, pace: (rivalPace - less) * topSpeed, finishMs: null })),
      caught: 0, bumps: 0, passes: 0, score: 0,
    };
    layCourse(state);
    return state;
  },

  act(state, action) {
    if (state.finished) return [];
    if (action === "row") {
      addBeat(state.driver, state.t);
      return [{ type: "stroke" }];
    }
    steerKey(state.driver, action);
    return [];
  },

  drive(state, { speed, tilt }) {
    readBody(state.driver, speed.arms, tilt);
  },

  step(state, dtMs) {
    const events = [];
    const seconds = dtMs / 1000;
    state.t += dtMs;
    stepDriver(state.driver, state.t, dtMs);
    state.surgeMs = Math.max(0, state.surgeMs - dtMs);
    state.bumpMs = Math.max(0, state.bumpMs - dtMs);

    for (const rival of state.rivals) {
      rival.speed += (rival.pace - rival.speed) * (1 - Math.exp(-SPEED_UP * seconds));
      rival.distance += rival.speed * seconds;
      const line = clearLine(rival.aim, aheadOf(state, rival.distance, 24), { limit: CHANNEL, clearance: BOAT_HALF + 0.2 });
      rival.x += clamp(line - rival.x, -STEER_MPS * 0.6 * seconds, STEER_MPS * 0.6 * seconds);
      if (rival.finishMs === null && rival.distance >= state.finishM) rival.finishMs = state.t;
    }

    if (state.finished) {
      state.speed *= Math.exp(-1.2 * seconds);
      state.distance += state.speed * seconds;
      state.finaleMs -= dtMs;
      if (state.finaleMs <= 0) {
        state.status = "ended";
        events.push({ type: "end" });
      }
      return events;
    }

    const power = clamp(state.driver.rate / state.fullBeats, 0, 1);
    const target = state.top * power * (state.surgeMs > 0 ? SURGE : 1);
    state.speed += (target - state.speed) * (1 - Math.exp(-(target > state.speed ? SPEED_UP : SLOW_DOWN) * seconds));
    const before = state.distance;
    state.distance += state.speed * seconds;
    state.x = clamp(state.x + steering(state.driver) * STEER_MPS * (0.3 + (0.7 * state.speed) / state.top) * seconds, -CHANNEL, CHANNEL);
    state.score += state.distance - before;

    for (const item of state.hazards) {
      if (item.hit || state.bumpMs > 0 || Math.abs(item.at - state.distance) > HIT_RANGE || Math.abs(item.x - state.x) > item.half + BOAT_HALF) continue;
      item.hit = true;
      state.bumpMs = BUMP_MS;
      state.bumps += 1;
      state.speed *= BUMP_LOSS;
      events.push({ type: "hurt", kind: item.kind });
    }
    for (const item of state.fish) {
      if (item.taken || Math.abs(item.at - state.distance) > PICK_RANGE || Math.abs(item.x - state.x) > PICK_RANGE) continue;
      item.taken = true;
      state.caught += 1;
      state.score += 25;
      state.surgeMs = SURGE_MS;
      events.push({ type: "coin", x: item.x });
    }

    const place = placeOf(state);
    if (place < state.place) {
      state.passes += 1;
      state.score += 50;
      events.push({ type: "pass" });
    }
    state.place = place;

    if (state.distance >= state.finishM) {
      state.finished = true;
      state.won = place === 1;
      state.finaleMs = FINALE_MS;
      state.score += (LANES.length + 1 - place) * 200;
      events.push({ type: "finish", place });
    } else if (state.rivals.every((rival) => rival.finishMs !== null)) {
      state.lateMs = (state.lateMs ?? GRACE_MS) - dtMs;
      if (state.lateMs <= 0) {
        state.status = "ended";
        events.push({ type: "end" });
      }
    }
    return events;
  },

  hud: (state) => ({
    score: Math.floor(state.score), label: "Score", clock: `${WORDS[state.place - 1]} · ${Math.max(0, Math.ceil(state.finishM - state.distance))} m`,
    meter: Math.min(1, state.speed / state.top), extra: state.finished ? (state.won ? "First home" : `${WORDS[state.place - 1]} home`) : callOut(state),
  }),

  result: (state) => ({
    outcome: state.won ? "win" : state.finished ? "complete" : "lose",
    score: Math.floor(state.score),
    stats: [
      { label: "Place", value: state.finished ? WORDS[state.place - 1] : "Did not finish" },
      { label: "Time", value: `${(state.t / 1000).toFixed(1)} s` },
      { label: "Fish", value: state.caught },
      { label: "Bumps", value: state.bumps },
    ],
  }),

  bot(state, skill) {
    if (state.finished) return null;
    const reach = state.speed * 2.2 + 8;
    const line = clearLine(state.x, aheadOf(state, state.distance, reach), { limit: CHANNEL, clearance: BOAT_HALF + 0.25 });
    return botSteer(state.driver, state.x, line, STEER_MPS, skill) ?? "row";
  },
};
