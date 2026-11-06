// Dabba Catch: tiffins, snacks and trouble fall from the delivery rack, and a hand reaches them to catch
// them. Each hand has a colour of its own, so with both in view the left takes teal and the right saffron,
// like two mouse buttons with no click. With one hand in view it takes anything.
import { SCREEN_RATIO } from "./chop.js";
import { aimCursors, cursorGap, handsOnScreen, liveCursors, newCursors, screenGap, settleCursors } from "./cursors.js";
import { clamp, createRandom } from "./shared.js";

export const KINDS = {
  tiffin_left: { radius: 0.13, points: 20, owner: "left" },
  tiffin_right: { radius: 0.13, points: 20, owner: "right" },
  snack: { radius: 0.11, points: 10, owner: null },
  hazard: { radius: 0.1, points: 0, owner: null },
};
export const HAND_RADIUS = 0.1;
export const SHIFTS = ["Morning run", "Lunch rush", "Evening trains"];
const TOP_Y = 1.15;
const FLOOR_Y = -1.12;
const VISIBLE_Y = 0.8;
const SCOOP_REACH = 0.3; // a swipe read from the body forgives a hand that only came close
const INVINCIBLE_MS = 600;
const SHIFT_PACE = [1, 1.18, 1.36];
const SWAY = 0.2;

function drop(state, side, { swings = false, crossed = false } = {}) {
  const { rng } = state;
  const hazard = state.t > 5000 && rng.next() * 100 < state.hazardChance * (state.shift ? 1 : 0.5);
  const kind = hazard ? "hazard" : rng.next() < 0.3 ? "snack" : side < 0 ? "tiffin_left" : "tiffin_right";
  const x = (crossed ? -side : side) * rng.range(0.2, 0.68);
  const { radius, owner } = KINDS[kind];
  state.items.push({
    id: state.nextId++, kind, owner, radius, x, baseX: x, y: TOP_Y, ms: 0, swings, spin: rng.range(-2, 2), turn: rng.range(0, 6.28),
    fall: state.fallSpeed * SHIFT_PACE[state.shift] * rng.range(0.9, 1.1), brushed: false,
  });
  if (hazard) state.hazards += 1;
  else state.dropped += 1;
}

function send(state) {
  const { rng } = state;
  const side = state.sent % 2 ? 1 : -1; // turn about, so neither hand has to cross in the first seconds
  state.sent += 1;
  if (state.shift === 0) drop(state, side);
  if (state.shift === 1) {
    drop(state, -1);
    drop(state, 1);
  }
  if (state.shift === 2) drop(state, rng.next() < 0.5 ? -1 : 1, { swings: true, crossed: rng.next() < 0.4 });
}

function catchItem(state, item, side, events) {
  state.items = state.items.filter((other) => other !== item);
  state.caught += 1;
  state.combo += 1;
  state.best = Math.max(state.best, state.combo);
  state.score += Math.round(KINDS[item.kind].points * (1 + Math.min(state.combo, 10) * 0.2));
  events.push({ type: "catch", kind: item.kind, owner: item.owner, side, x: item.x, y: item.y, count: state.combo });
}

// With both hands in view a tiffin passes through the wrong one, so the right one can still get it.
const wrongHand = (state, item, side) => item.owner && item.owner !== side && liveCursors(state).length > 1;

function reach(state, events) {
  for (const side of liveCursors(state)) {
    const cursor = state.cursors[side];
    for (const item of [...state.items]) {
      if (cursorGap(item, cursor) > item.radius + HAND_RADIUS) continue;
      if (item.kind === "hazard") {
        if (state.invincibleMs > 0) continue;
        state.items = state.items.filter((other) => other !== item);
        state.lives -= 1;
        state.burnt += 1;
        state.combo = 0;
        state.invincibleMs = INVINCIBLE_MS;
        events.push({ type: "blast", x: item.x, y: item.y }, { type: "hurt", cause: "hazard" });
      } else if (wrongHand(state, item, side)) {
        if (!item.brushed) events.push({ type: "wrong", side, x: item.x, y: item.y });
        item.brushed = true;
      } else catchItem(state, item, side, events);
    }
  }
}

export default {
  id: "dabba",
  name: "Dabba Catch",
  pitch: "Reach for the falling tiffins with the hand of their colour, grab the snacks with either, and keep clear of the trouble.",
  kind: "Arms",
  space: "Stand up",
  length: "60 s",
  framing: "upper",
  score: "tiffins",
  actions: [{ id: "scoop", label: "Scoop", key: " ", keyLabel: "Space" }],
  bindings: [
    { gesture: "slash_left", action: "scoop", exercise: "Hand swipe" },
    { gesture: "slash_right", action: "scoop", exercise: "Hand swipe" },
  ],
  tuning: {
    durationS: { label: "Round length", unit: "s", min: 20, max: 120, default: 60, higherIsHarder: false, whole: true },
    dropMs: { label: "Time between drops", unit: "ms", min: 600, max: 2200, default: 1250, higherIsHarder: false, whole: true },
    fallSpeed: { label: "Fall speed", unit: "", min: 0.35, max: 1, default: 0.55, higherIsHarder: true },
    hazardChance: { label: "Share of trouble", unit: "%", min: 0, max: 40, default: 16, higherIsHarder: true, whole: true },
    lives: { label: "Lives", unit: "", min: 1, max: 5, default: 3, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { durationS, dropMs, fallSpeed, hazardChance, lives } = spec.tuning;
    return {
      status: "playing", t: 0, durationMs: durationS * 1000, dropMs, fallSpeed, hazardChance, lives, startLives: lives, rng: createRandom(spec.seed),
      shift: 0, items: [], cursors: newCursors(), nextId: 1, nextMs: 700, sent: 0, invincibleMs: 0,
      dropped: 0, hazards: 0, caught: 0, lost: 0, burnt: 0, combo: 0, best: 0, score: 0,
    };
  },

  aimsByReaching: true,
  aim: aimCursors,

  // With no hand on screen the lowest thing worth having is taken. With one, a swipe only reaches what is
  // near it, and never trouble.
  act(state, action) {
    if (action !== "scoop") return [];
    const hands = handsOnScreen(state);
    const wanted = state.items.filter((item) => item.kind !== "hazard" && item.y < VISIBLE_Y).sort((a, b) => a.y - b.y);
    const events = [];
    if (!hands.length) {
      if (wanted.length) catchItem(state, wanted[0], "key", events);
      return events;
    }
    for (const side of liveCursors(state)) {
      const item = wanted.find((entry) => state.items.includes(entry) && !wrongHand(state, entry, side) && screenGap(entry, state.cursors[side]) <= SCOOP_REACH);
      if (item) catchItem(state, item, side, events);
    }
    return events;
  },

  step(state, dtMs) {
    const events = [];
    const dt = dtMs / 1000;
    state.t += dtMs;
    state.invincibleMs = Math.max(0, state.invincibleMs - dtMs);

    const shift = clamp(Math.floor((state.t / state.durationMs) * SHIFTS.length), 0, SHIFTS.length - 1);
    if (shift !== state.shift) {
      state.shift = shift;
      events.push({ type: "shift", shift, name: SHIFTS[shift] });
    }

    state.nextMs -= dtMs;
    if (state.nextMs <= 0 && state.t < state.durationMs - 2600) {
      state.nextMs = state.dropMs * state.rng.range(0.85, 1.15) * (state.shift === 1 ? 1.5 : 1);
      send(state);
      events.push({ type: "toss" });
    }

    for (const item of state.items) {
      item.ms += dtMs;
      item.y -= item.fall * dt;
      item.turn += item.spin * dt;
      if (item.swings) item.x = clamp(item.baseX + (Math.sin(item.ms / 520) * SWAY) / SCREEN_RATIO * 2, -0.9, 0.9);
    }
    reach(state, events);
    settleCursors(state);

    for (const item of state.items.filter((entry) => entry.y < FLOOR_Y)) {
      if (item.kind === "hazard") continue;
      state.lost += 1;
      state.combo = 0;
      events.push({ type: "drop", kind: item.kind, x: item.x });
    }
    state.items = state.items.filter((item) => item.y >= FLOOR_Y);

    if (state.lives <= 0 || state.t >= state.durationMs) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud: (state) => ({
    score: state.score, label: "Score", clock: `${Math.max(0, Math.ceil((state.durationMs - state.t) / 1000))}s`, lives: state.lives, maxLives: state.startLives,
    extra: state.combo > 1 ? `${state.combo} in a row` : SHIFTS[state.shift],
  }),

  result: (state) => ({
    outcome: state.lives <= 0 ? "lose" : state.caught >= state.dropped * 0.6 ? "win" : "complete",
    score: state.score,
    stats: [
      { label: "Caught", value: state.caught },
      { label: "Dropped", value: state.lost },
      { label: "Best run", value: state.best },
      { label: "Trouble touched", value: state.burnt },
    ],
  }),

  bot: (state) => (state.items.some((item) => item.kind !== "hazard" && item.y < VISIBLE_Y - 0.1) ? "scoop" : null),
};
