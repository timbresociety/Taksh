// Pop-Up Patrol: monkeys are after the snacks. They pop out of windows and potholes around the screen, and
// a hand reaching one sends it packing before it hides with what it took. The cat lives here, so leave it be.
import { aimCursors, cursorGap, handsOnScreen, liveCursors, newCursors, screenGap, settleCursors } from "./cursors.js";
import { clamp, createRandom } from "./shared.js";

// Windows in two rows up the house front, potholes in the road. Each column sits well inside one hand's side.
export const SLOTS = [
  ...[-0.62, -0.22, 0.22, 0.62].flatMap((x) => [{ x, y: 0.5, hole: false }, { x, y: 0.02, hole: false }]),
  ...[-0.72, -0.32, 0.32, 0.72].map((x) => ({ x, y: -0.52, hole: true })),
];
export const KINDS = {
  monkey: { radius: 0.13, points: 20, pace: 1 },
  crow: { radius: 0.11, points: 30, pace: 0.8 },
  langur: { radius: 0.12, points: 60, pace: 0.62 },
  cat: { radius: 0.09, points: 0, pace: 1.1 },
};
export const ROUNDS = ["Morning patrol", "Noon raid", "Night watch"];
export const HAND_RADIUS = 0.1;
export const RISE_MS = 200;
const BOP_REACH = 0.3; // a swipe read from the body forgives a hand that only came close
const INVINCIBLE_MS = 500;
const ROUND_PACE = [1.2, 1, 0.85]; // how long they stay up
const ROUND_GAP = [1.4, 1.5, 1]; // a first round to learn in, and the noon raid sends two at a time
const FIRST_CAT_MS = 9000;
const BEST_COMBO = 10;

const sideOf = (slot) => (SLOTS[slot].x < 0 ? -1 : 1);

function raise(state, side) {
  const { rng } = state;
  const taken = new Set(state.pops.map((pop) => pop.slot));
  // The first few come up near the middle of each hand's side.
  const inner = state.raised < 4;
  const free = SLOTS.flatMap((slot, index) => (!taken.has(index) && sideOf(index) === side && !(inner && slot.y > 0.2) ? [index] : []));
  if (!free.length) return;
  const slot = rng.pick(free);
  const cat = state.t > FIRST_CAT_MS && rng.next() * 100 < state.catChance;
  const kind = cat ? "cat" : rng.next() < 0.08 + state.round * 0.05 ? "langur" : rng.next() < 0.3 ? "crow" : "monkey";
  const { radius, pace } = KINDS[kind];
  const { x, y } = SLOTS[slot];
  // A hand already there when the cat comes up did nothing wrong, so it must leave and come back to count.
  const resting = liveCursors(state).filter((hand) => screenGap({ x, y }, state.cursors[hand]) <= radius + HAND_RADIUS);
  state.pops.push({ id: state.nextId++, slot, kind, x, y, radius, ms: 0, upMs: state.upMs * pace * ROUND_PACE[state.round], resting });
  state.raised += 1;
  if (!cat) state.thieves += 1;
}

function send(state) {
  const { rng } = state;
  const side = state.raised % 2 ? 1 : -1;
  raise(state, side);
  if (state.round === 1) raise(state, -side);
  if (state.round === 2 && rng.next() < 0.45) raise(state, rng.next() < 0.5 ? -1 : 1);
}

function bop(state, pop, side, events) {
  state.pops = state.pops.filter((other) => other !== pop);
  state.bopped += 1;
  state.combo += 1;
  state.best = Math.max(state.best, state.combo);
  state.score += Math.round(KINDS[pop.kind].points * (1 + Math.min(state.combo, BEST_COMBO) * 0.2) * (pop.ms < pop.upMs / 2 ? 1.5 : 1));
  events.push({ type: "bop", id: pop.id, kind: pop.kind, slot: pop.slot, side, x: pop.x, y: pop.y, count: state.combo });
}

function reach(state, events) {
  for (const side of liveCursors(state)) {
    const cursor = state.cursors[side];
    for (const pop of [...state.pops]) {
      if (pop.ms < RISE_MS / 2) continue;
      const touching = cursorGap(pop, cursor) <= pop.radius + HAND_RADIUS;
      if (pop.kind !== "cat") {
        if (touching) bop(state, pop, side, events);
        continue;
      }
      if (!touching) pop.resting = pop.resting.filter((hand) => hand !== side);
      else if (!pop.resting.includes(side) && state.invincibleMs <= 0) {
        state.pops = state.pops.filter((other) => other !== pop);
        state.lives -= 1;
        state.startled += 1;
        state.combo = 0;
        state.invincibleMs = INVINCIBLE_MS;
        events.push({ type: "startle", id: pop.id, slot: pop.slot, x: pop.x, y: pop.y }, { type: "hurt", cause: "cat" });
      }
    }
  }
}

export default {
  id: "popup",
  name: "Pop-Up Patrol",
  pitch: "Reach the monkeys popping out of windows and potholes before they hide with the snacks, and leave the cat alone.",
  kind: "Arms",
  space: "Stand up",
  length: "60 s",
  framing: "upper",
  score: "monkeys",
  actions: [{ id: "shoo", label: "Shoo", key: " ", keyLabel: "Space" }],
  bindings: [
    { gesture: "slash_left", action: "shoo", exercise: "Hand swipe" },
    { gesture: "slash_right", action: "shoo", exercise: "Hand swipe" },
  ],
  tuning: {
    durationS: { label: "Round length", unit: "s", min: 20, max: 120, default: 60, higherIsHarder: false, whole: true },
    upMs: { label: "Time before one hides", unit: "ms", min: 900, max: 3200, default: 2000, higherIsHarder: false, whole: true },
    gapMs: { label: "Time between pop-ups", unit: "ms", min: 500, max: 2200, default: 1150, higherIsHarder: false, whole: true },
    catChance: { label: "Share of cats", unit: "%", min: 0, max: 40, default: 14, higherIsHarder: true, whole: true },
    lives: { label: "Snacks to guard", unit: "", min: 2, max: 8, default: 6, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { durationS, upMs, gapMs, catChance, lives } = spec.tuning;
    return {
      status: "playing", t: 0, durationMs: durationS * 1000, upMs, gapMs, catChance, lives, startLives: lives, rng: createRandom(spec.seed),
      round: 0, pops: [], cursors: newCursors(), nextId: 1, nextMs: 800, raised: 0, invincibleMs: 0,
      thieves: 0, bopped: 0, escaped: 0, startled: 0, combo: 0, best: 0, score: 0,
    };
  },

  handCursors: {
    lesson: {
      kind: "aim",
      cue: "Each hand moves its own ring, and a ring that reaches a monkey shoos it. Reach each dot with the ring of the same colour.",
      mouseCue: "The mouse moves your ring. Reach each dot, the way you shoo monkeys.",
    },
    keys: { shoo: "Space shoos the monkey next to your ring." },
    controls: { shoo: "Reach the monkey with a hand" },
  },
  aim: aimCursors,

  // With no hand on screen the one nearest to hiding goes. With one, a swipe only reaches what is near it,
  // and never the cat.
  act(state, action) {
    if (action !== "shoo") return [];
    const hands = handsOnScreen(state);
    const thieves = state.pops.filter((pop) => pop.kind !== "cat" && pop.ms >= RISE_MS / 2).sort((a, b) => a.upMs - a.ms - (b.upMs - b.ms));
    const events = [];
    if (!hands.length) {
      if (thieves.length) bop(state, thieves[0], "key", events);
      return events;
    }
    for (const side of liveCursors(state)) {
      const pop = thieves.find((entry) => state.pops.includes(entry) && screenGap(entry, state.cursors[side]) <= BOP_REACH);
      if (pop) bop(state, pop, side, events);
    }
    return events;
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;
    state.invincibleMs = Math.max(0, state.invincibleMs - dtMs);

    const round = clamp(Math.floor((state.t / state.durationMs) * ROUNDS.length), 0, ROUNDS.length - 1);
    if (round !== state.round) {
      state.round = round;
      events.push({ type: "round", round, name: ROUNDS[round] });
    }

    state.nextMs -= dtMs;
    if (state.nextMs <= 0 && state.t < state.durationMs - 2000) {
      const before = state.pops.length;
      send(state);
      state.nextMs = state.gapMs * state.rng.range(0.85, 1.15) * ROUND_GAP[state.round];
      for (const pop of state.pops.slice(before)) events.push({ type: "pop", id: pop.id, kind: pop.kind, hole: SLOTS[pop.slot].hole });
    }

    for (const pop of state.pops) pop.ms += dtMs;
    reach(state, events);
    settleCursors(state);

    for (const pop of state.pops.filter((entry) => entry.ms >= entry.upMs)) {
      if (pop.kind === "cat") continue;
      state.lives -= 1;
      state.escaped += 1;
      state.combo = 0;
      events.push({ type: "miss", id: pop.id, slot: pop.slot }, { type: "stolen", x: pop.x, y: pop.y });
    }
    state.pops = state.pops.filter((pop) => pop.ms < pop.upMs);

    if (state.lives <= 0 || state.t >= state.durationMs) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud: (state) => ({
    score: state.score, label: "Score", clock: `${Math.max(0, Math.ceil((state.durationMs - state.t) / 1000))}s`, lives: state.lives, maxLives: state.startLives,
    extra: state.combo > 1 ? `${state.combo} in a row` : ROUNDS[state.round],
  }),

  result: (state) => ({
    outcome: state.lives <= 0 ? "lose" : state.bopped >= state.thieves * 0.6 ? "win" : "complete",
    score: state.score,
    stats: [
      { label: "Sent packing", value: state.bopped },
      { label: "Got away", value: state.escaped },
      { label: "Best run", value: state.best },
      { label: "Cats startled", value: state.startled },
    ],
  }),

  bot: (state) => (state.pops.some((pop) => pop.kind !== "cat" && pop.ms >= RISE_MS) ? "shoo" : null),
};
