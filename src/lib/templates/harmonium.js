// Harmonium Hop: painted keys slide down four columns. The body is the keyboard: left foot, left
// hand, right hand, right foot, and each key played sounds its own note of the tune.
import { REACTION_MS, createRandom } from "./shared.js";

export const COLUMNS = ["foot_left", "hand_left", "hand_right", "foot_right"];
const IS_FOOT = [true, false, false, true];
const MIN_GAP_MS = 560;
const FOOT_GAP_MS = 820; // one foot has to come down before the other can lift
const SAME_GAP_MS = 820; // a limb has to drop back before it can rise again
const PERFECT_SHARE = 0.45;
const HAND_LAG_MS = 200; // a lifted hand is held back this long in case the other hand is on its way

// Scale degrees of a five note scale, as semitones above the tonic.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
const BAR_CELLS = ["xxxx", "xx.x", "x.xx", "x.x.", "xxx."];
const SHAPES = [[1, 2, 1, 2], [0, 1, 2, 3], [3, 2, 1, 0], [1, 0, 2, 3], [2, 3, 1, 0], [0, 3, 1, 2]];
const CONTOURS = [[0, 1, 2, 3], [4, 3, 2, 1], [2, 3, 4, 3], [0, 2, 1, 3], [5, 4, 3, 2]];

const beatMs = (bpm) => 60000 / bpm;

function allowed(keys, column, at) {
  const before = keys.at(-1);
  if (!before) return true;
  const gap = at - before.at;
  if (gap < MIN_GAP_MS) return false;
  if (IS_FOOT[column] && IS_FOOT[before.column] && gap < FOOT_GAP_MS) return false;
  const same = keys.findLast((key) => key.column === column);
  return !same || at - same.at >= SAME_GAP_MS;
}

// Two bars of a shape and a contour, then the same two bars answered from the other side of the body.
export function buildChart(rng, { bpm, durationMs, leadMs }) {
  const beat = beatMs(bpm);
  const keys = [];
  const lastAt = durationMs - beat * 2;
  let at = leadMs;
  let phrase = 0;
  while (at < lastAt) {
    const shape = rng.pick(SHAPES);
    const contour = rng.pick(CONTOURS);
    const cell = rng.pick(phrase < 2 ? BAR_CELLS.slice(3) : BAR_CELLS);
    for (let bar = 0; bar < 4; bar += 1) {
      const flipped = bar >= 2;
      let step = 0;
      for (let slot = 0; slot < 4; slot += 1, at += beat) {
        if (cell[slot] !== "x" || at > lastAt) continue;
        const raw = shape[step % shape.length];
        const column = flipped ? 3 - raw : raw;
        const pitch = SCALE[(contour[step % contour.length] + (flipped ? 1 : 0)) % SCALE.length];
        step += 1;
        const when = Math.round(at);
        if (allowed(keys, column, when)) keys.push({ id: keys.length + 1, at: when, column, pitch, kind: `c${column}` });
      }
    }
    phrase += 1;
  }
  return keys;
}

export default {
  id: "harmonium",
  name: "Harmonium Hop",
  pitch: "Lift the foot or hand for each painted key as it reaches the line, and play the tune with your body.",
  kind: "Whole body",
  space: "Stand back",
  length: "60 s",
  framing: "full",
  score: "keys",
  actions: [
    { id: "foot_left", label: "Left foot", key: "d", keyLabel: "D" },
    { id: "hand_left", label: "Left hand", key: "f", keyLabel: "F" },
    { id: "hand_right", label: "Right hand", key: "j", keyLabel: "J" },
    { id: "foot_right", label: "Right foot", key: "k", keyLabel: "K" },
  ],
  bindings: [
    { gesture: "lift_left", action: "foot_left", exercise: "Left leg lift" },
    { gesture: "reach_up_left", action: "hand_left", exercise: "Left hand reach" },
    { gesture: "reach_up_right", action: "hand_right", exercise: "Right hand reach" },
    { gesture: "lift_right", action: "foot_right", exercise: "Right leg lift" },
  ],
  tuning: {
    durationS: { label: "Tune length", unit: "s", min: 30, max: 150, default: 60, higherIsHarder: false, whole: true },
    bpm: { label: "Beats per minute", unit: "bpm", min: 50, max: 100, default: 72, higherIsHarder: true, whole: true },
    travelMs: { label: "Time a key takes to slide down", unit: "ms", min: 1400, max: 4000, default: 2400, higherIsHarder: false, whole: true },
    windowMs: { label: "Timing allowance", unit: "ms", min: 160, max: 420, default: 300, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { durationS, bpm, travelMs, windowMs } = spec.tuning;
    const durationMs = durationS * 1000;
    const leadMs = Math.ceil((travelMs + 600) / (beatMs(bpm) * 4)) * beatMs(bpm) * 4;
    const chart = buildChart(createRandom(spec.seed), { bpm, durationMs, leadMs });
    return {
      status: "playing", t: 0, durationMs, bpm, travelMs, windowMs, chart, keys: [], next: 0, total: chart.length, pressed: [0, 0, 0, 0],
      perfect: 0, good: 0, missed: 0, stray: 0, combo: 0, best: 0, score: 0,
    };
  },

  act(state, action) {
    const column = COLUMNS.indexOf(action);
    if (column === -1) return [];
    state.pressed[column] = 240;
    // Late is measured from the end of the hold-back, so a body and a key both land on the line.
    const lag = IS_FOOT[column] ? 0 : HAND_LAG_MS;
    const off = (key) => (state.t - key.at > 0 ? Math.max(0, state.t - key.at - lag) : key.at - state.t);
    const key = state.keys.filter((item) => item.column === column && off(item) <= state.windowMs).sort((a, b) => off(a) - off(b))[0];
    if (!key) {
      state.stray += 1;
      return [{ type: "stray", column }];
    }
    const grade = off(key) <= state.windowMs * PERFECT_SHARE ? "perfect" : "good";
    state[grade] += 1;
    state.combo += 1;
    state.best = Math.max(state.best, state.combo);
    state.score += Math.round((grade === "perfect" ? 100 : 50) * (1 + Math.min(state.combo, 20) * 0.05));
    state.keys = state.keys.filter((item) => item !== key);
    return [{ type: grade, column, pitch: key.pitch, combo: state.combo }];
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;
    state.pressed = state.pressed.map((ms) => Math.max(0, ms - dtMs));
    while (state.next < state.chart.length && state.chart[state.next].at - state.travelMs <= state.t) {
      state.keys.push(state.chart[state.next]);
      state.next += 1;
    }
    const gone = (key) => state.t - key.at > state.windowMs + (IS_FOOT[key.column] ? 0 : HAND_LAG_MS);
    for (const key of state.keys.filter(gone)) {
      state.missed += 1;
      state.combo = 0;
      events.push({ type: "miss", column: key.column });
    }
    state.keys = state.keys.filter((key) => !gone(key));
    if (state.t >= state.durationMs) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud: (state) => ({ score: state.score, label: "Score", clock: `${Math.max(0, Math.ceil((state.durationMs - state.t) / 1000))}s`, extra: state.combo > 1 ? `${state.combo} in tune` : null }),

  result(state) {
    return {
      outcome: state.perfect + state.good >= state.total * 0.6 ? "win" : "complete",
      score: state.score,
      stats: [
        { label: "Perfect", value: state.perfect },
        { label: "Good", value: state.good },
        { label: "Missed", value: state.missed },
        { label: "Best run", value: state.best },
      ],
    };
  },

  bot(state, skill) {
    const key = state.keys[0];
    if (!key) return null;
    const lead = skill === "quick" ? REACTION_MS.quick : REACTION_MS.casual - 110;
    return key.at - state.t <= lead ? COLUMNS[key.column] : null;
  },
};
