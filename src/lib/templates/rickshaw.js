// Auto Rally: an auto rickshaw on a stage rally through traffic. Running on the spot is the throttle, a
// side bend steers, and each checkpoint buys the clock another leg. Fares on the road buy a little more.
import { addBeat, botSteer, clearLine, createDriver, readBody, steerKey, steering, stepDriver } from "./drive.js";
import { clamp, createRandom, moveCue } from "./shared.js";

export const ROAD = 3.5; // how far from the middle the auto can go
export const LANE_X = [-3.3, -1.1, 1.1, 3.3];
const AUTO_HALF = 0.55; // narrower than the auto, so a scrape along a bus is forgiven
const AUTO_LENGTH = 1.4;
const FIRST_ROW_M = 70; // the road is empty until the player has the throttle
const STEER_MPS = 4.6;
const SPEED_UP = 1.5;
const SLOW_DOWN = 0.8;
const SIZES = { taxi: [0.85, 2.1], auto: [0.72, 1.4], bus: [1.15, 4.4], wall: [1.15, 1.4], low: [0.8, 0.8], hazard: [0.5, 0.5] };
const VEHICLES = ["taxi", "auto", "taxi", "auto", "bus"];
const CRASH_LOSS = 0.25;
const JOLT_LOSS = 0.65;
const INVINCIBLE_MS = 1400;
const NEAR_MISS = 0.5;
const PICK_RANGE = 1.4;
const FARE_MS = 1000;
const FINALE_MS = 2800;
const CALL_MS = 1600; // well past the 900 ms every warning has to give

// Three lanes of traffic, all at one speed so a row stays a row, and a shoulder on the left where
// everything that stands still is kept, out of the traffic's way. A row always leaves a lane open.
function layRoad(state) {
  const { rng, gap, finishM } = state;
  const add = (kind, lane, at, moving) => state.items.push({ id: state.nextId++, kind, lane, x: LANE_X[lane], at, moving, hit: false, passed: false });
  for (let at = FIRST_ROW_M; at < finishM + 40; at += gap * rng.range(0.8, 1.2)) {
    const open = [1, 2, 3];
    const lane = open.splice(rng.int(3), 1)[0];
    add(rng.pick(VEHICLES), lane, at, true);
    if (rng.next() < 0.3) add(rng.pick(VEHICLES.slice(0, 2)), open.splice(rng.int(2), 1)[0], at, true);
    const roll = rng.next();
    if (roll < 0.35) add("wall", 0, at + gap / 2, false);
    else if (roll < 0.75) add(rng.pick(["low", "hazard"]), 0, at + gap / 2, false);
    if (rng.next() < 0.55) {
      const free = LANE_X[rng.pick(open)];
      for (let i = 0; i < 3; i += 1) state.fares.push({ id: state.nextId++, x: free, at: at - 8 + i * 4, taken: false });
    }
  }
}

// What will reach the auto soon, however fast each of them is going.
function comingUp(state, seconds) {
  return state.items.filter((item) => {
    if (item.hit || item.passed) return false;
    const closing = state.speed - (item.moving ? state.traffic : 0);
    const ahead = item.at - state.distance;
    return ahead > -SIZES[item.kind][1] - AUTO_LENGTH && ahead < Math.max(closing, 2) * seconds + SIZES[item.kind][1] + AUTO_LENGTH;
  });
}

const blocks = (items) => items.map((item) => ({ x: item.x, half: SIZES[item.kind][0] }));
const crashes = (item) => item.moving || item.kind === "wall";

// The move that matters most, for the guide: the turn to make, or the legs if the auto has stopped.
function callOut(state) {
  const block = comingUp(state, CALL_MS / 1000).find((item) => Math.abs(item.x - state.x) < SIZES[item.kind][0] + AUTO_HALF);
  if (block) return moveCue(block.x > state.x ? "lean_left" : "lean_right", 0.6);
  return state.speed < state.top * 0.3 ? moveCue("run_step") : null;
}

export default {
  id: "rickshaw",
  name: "Auto Rally",
  pitch: "Run on the spot to open the throttle, bend sideways to weave your auto through traffic, and reach each checkpoint before the clock runs out.",
  kind: "Cardio",
  space: "Needs space",
  length: "2 min",
  framing: "full",
  score: "fares",
  actions: [
    { id: "throttle", label: "Throttle", key: " ", keyLabel: "Space" },
    { id: "left", label: "Steer left", key: "ArrowLeft", keyLabel: "←", hold: true },
    { id: "right", label: "Steer right", key: "ArrowRight", keyLabel: "→", hold: true },
  ],
  bindings: [
    { gesture: "run_step", action: "throttle", exercise: "Run on the spot" },
    { gesture: "lean_left", action: "left", exercise: "Side bend" },
    { gesture: "lean_right", action: "right", exercise: "Side bend" },
  ],
  tuning: {
    legs: { label: "Legs in the rally", unit: "", min: 2, max: 8, default: 5, higherIsHarder: true, whole: true },
    legM: { label: "Length of each leg", unit: "m", min: 180, max: 450, default: 300, higherIsHarder: true, whole: true },
    topSpeed: { label: "Top speed", unit: "m/s", min: 10, max: 18, default: 14, higherIsHarder: true },
    fullBeats: { label: "Steps a second for top speed", unit: "", min: 2, max: 4.5, default: 3, higherIsHarder: true },
    traffic: { label: "Speed of the traffic", unit: "m/s", min: 3, max: 8, default: 6, higherIsHarder: false },
    gap: { label: "Road between traffic", unit: "m", min: 24, max: 70, default: 40, higherIsHarder: false },
    spareS: { label: "Spare time on each leg", unit: "s", min: 2, max: 16, default: 8, higherIsHarder: false },
    lives: { label: "Crashes before the auto gives up", unit: "", min: 1, max: 6, default: 4, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { legs, legM, topSpeed, fullBeats, traffic, gap, spareS, lives } = spec.tuning;
    const legMs = (legM / topSpeed + spareS) * 1000;
    const state = {
      status: "playing", t: 0, rng: createRandom(spec.seed), nextId: 1, legs, legM, finishM: legs * legM, top: topSpeed, fullBeats, traffic, gap, legMs, driver: createDriver(),
      x: LANE_X[2], speed: 0, distance: 0, leg: 0, clockMs: legMs + spareS * 1000, lives, startLives: lives, invincibleMs: 0, finaleMs: 0, won: false, items: [], fares: [],
      taken: 0, crashes: 0, nearMisses: 0, topReached: 0, score: 0,
    };
    layRoad(state);
    return state;
  },

  act(state, action) {
    if (state.finaleMs > 0) return [];
    if (action === "throttle") {
      addBeat(state.driver, state.t);
      return [{ type: "stride" }];
    }
    steerKey(state.driver, action);
    return [];
  },

  drive(state, { speed, tilt }) {
    readBody(state.driver, speed.legs, tilt);
  },

  step(state, dtMs) {
    const events = [];
    const seconds = dtMs / 1000;
    state.t += dtMs;
    stepDriver(state.driver, state.t, dtMs);
    state.invincibleMs = Math.max(0, state.invincibleMs - dtMs);
    for (const item of state.items) if (item.moving) item.at += state.traffic * seconds;

    if (state.finaleMs > 0) {
      state.speed *= Math.exp(-1.4 * seconds);
      state.distance += state.speed * seconds;
      state.finaleMs -= dtMs;
      if (state.finaleMs <= 0) {
        state.status = "ended";
        events.push({ type: "end" });
      }
      return events;
    }

    const target = state.top * clamp(state.driver.rate / state.fullBeats, 0, 1);
    state.speed += (target - state.speed) * (1 - Math.exp(-(target > state.speed ? SPEED_UP : SLOW_DOWN) * seconds));
    state.topReached = Math.max(state.topReached, state.speed);
    state.distance += state.speed * seconds;
    state.x = clamp(state.x + steering(state.driver) * STEER_MPS * Math.min(1, 0.25 + state.speed / 6) * seconds, -ROAD, ROAD);
    state.clockMs -= dtMs;

    for (const item of state.items) {
      if (item.hit || item.passed) continue;
      const [half, length] = SIZES[item.kind];
      const ahead = item.at - state.distance;
      const side = Math.abs(item.x - state.x) - half - AUTO_HALF;
      if (Math.abs(ahead) < length + AUTO_LENGTH && side < 0) {
        item.hit = true;
        if (state.invincibleMs > 0) continue;
        if (item.kind === "low" || item.kind === "hazard") {
          state.speed *= JOLT_LOSS;
          events.push({ type: "bump" });
          continue;
        }
        state.lives -= 1;
        state.crashes += 1;
        state.speed *= CRASH_LOSS;
        state.invincibleMs = INVINCIBLE_MS;
        events.push({ type: "hurt", kind: item.kind });
      } else if (ahead < -length - AUTO_LENGTH) {
        item.passed = true;
        if (item.moving && side < NEAR_MISS) {
          state.nearMisses += 1;
          state.score += 40;
          events.push({ type: "near", x: item.x });
        }
      }
    }
    for (const fare of state.fares) {
      if (fare.taken || Math.abs(fare.at - state.distance) > PICK_RANGE || Math.abs(fare.x - state.x) > PICK_RANGE) continue;
      fare.taken = true;
      state.taken += 1;
      state.score += 30;
      state.clockMs += FARE_MS;
      events.push({ type: "coin", x: fare.x });
    }
    state.items = state.items.filter((item) => item.at > state.distance - 30);
    state.fares = state.fares.filter((fare) => !fare.taken && fare.at > state.distance - 30);

    if (state.distance >= (state.leg + 1) * state.legM) {
      state.leg += 1;
      state.score += 250;
      if (state.leg >= state.legs) {
        state.won = true;
        state.score += state.lives * 200 + Math.floor(state.clockMs / 100);
        state.finaleMs = FINALE_MS;
        events.push({ type: "finish" });
        return events;
      }
      state.clockMs += state.legMs;
      events.push({ type: "gate", leg: state.leg });
    }

    if (state.lives <= 0 || state.clockMs <= 0) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud: (state) => ({
    score: state.score, label: "Score", clock: `${Math.max(0, Math.ceil(state.clockMs / 1000))} s`, lives: state.lives, maxLives: state.startLives,
    meter: Math.min(1, state.speed / state.top), extra: state.won ? "Rally done" : `Leg ${Math.min(state.legs, state.leg + 1)} of ${state.legs}`,
    cue: state.won ? null : callOut(state),
  }),

  result: (state) => ({
    outcome: state.won ? "win" : state.lives <= 0 ? "lose" : "complete",
    score: state.score,
    stats: [
      { label: "Legs", value: `${state.leg} of ${state.legs}` },
      { label: "Fares", value: state.taken },
      { label: "Near misses", value: state.nearMisses },
      { label: "Crashes", value: state.crashes },
    ],
  }),

  bot(state, skill) {
    if (state.finaleMs > 0) return null;
    const near = comingUp(state, 1.7);
    const room = { limit: ROAD, clearance: AUTO_HALF + 0.4 };
    const hard = clearLine(state.x, blocks(near.filter(crashes)), room);
    const line = clearLine(hard, blocks(near), room); // a pothole is worth missing, but not by hitting a bus
    return botSteer(state.driver, state.x, line, STEER_MPS, skill) ?? "throttle";
  },
};
