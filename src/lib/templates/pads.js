// Pad Rounds: pads light up around you. Throw the punch each pad asks for before it vanishes.
import { createRandom } from "./shared.js";

const PUNCHES = ["jab", "cross", "hook", "uppercut"];

function spawn(state) {
  state.pad = { id: state.nextId++, punch: state.rng.pick(PUNCHES), side: state.rng.pick([-1, 1]), height: state.rng.range(1.1, 1.6), ms: 0, lifeMs: state.lifeMs };
}

export default {
  id: "pads",
  name: "Pad Rounds",
  pitch: "Throw the punch each pad calls for before it disappears.",
  kind: "Arms",
  space: "Stand up",
  length: "60 s",
  framing: "upper",
  rival: true,
  score: "pads",
  actions: [
    { id: "jab", label: "Jab", key: "j", keyLabel: "J" },
    { id: "cross", label: "Cross", key: "k", keyLabel: "K" },
    { id: "hook", label: "Hook", key: "u", keyLabel: "U" },
    { id: "uppercut", label: "Uppercut", key: "i", keyLabel: "I" },
  ],
  bindings: [
    { gesture: "punch_left", action: "jab", exercise: "Jab" },
    { gesture: "punch_right", action: "cross", exercise: "Cross" },
    { gesture: "hook_left", action: "hook", exercise: "Hook" },
    { gesture: "hook_right", action: "hook", exercise: "Hook" },
    { gesture: "uppercut_left", action: "uppercut", exercise: "Uppercut" },
    { gesture: "uppercut_right", action: "uppercut", exercise: "Uppercut" },
  ],
  tuning: {
    durationS: { label: "Round length", unit: "s", min: 20, max: 120, default: 60, higherIsHarder: false, whole: true },
    lifeMs: { label: "Time per pad", unit: "ms", min: 700, max: 3000, default: 1600, higherIsHarder: false, whole: true },
    restMs: { label: "Rest between pads", unit: "ms", min: 100, max: 1200, default: 350, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { durationS, lifeMs, restMs } = spec.tuning;
    const state = { status: "playing", t: 0, durationMs: durationS * 1000, lifeMs, restMs, restLeft: 800, pad: null, nextId: 1, rng: createRandom(spec.seed), hits: 0, misses: 0, wrong: 0, combo: 0, best: 0, score: 0 };
    return state;
  },

  act(state, action) {
    if (!state.pad) return [{ type: "swing", punch: action }];
    if (action !== state.pad.punch) {
      state.wrong += 1;
      state.combo = 0;
      return [{ type: "wrong", punch: action }];
    }
    const speed = 1 - state.pad.ms / state.pad.lifeMs;
    state.hits += 1;
    state.combo += 1;
    state.best = Math.max(state.best, state.combo);
    state.score += Math.round((10 + speed * 20) * Math.min(1 + state.combo * 0.1, 3));
    const { side } = state.pad;
    state.pad = null;
    state.restLeft = state.restMs;
    return [{ type: "hit", punch: action, side }];
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;
    if (state.pad) {
      state.pad.ms += dtMs;
      if (state.pad.ms >= state.pad.lifeMs) {
        state.misses += 1;
        state.combo = 0;
        state.pad = null;
        state.restLeft = state.restMs;
        events.push({ type: "miss" });
      }
    } else {
      state.restLeft -= dtMs;
      if (state.restLeft <= 0) {
        spawn(state);
        events.push({ type: "pad", punch: state.pad.punch });
      }
    }
    if (state.t >= state.durationMs) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud: (state) => ({ score: state.score, label: "Score", clock: `${Math.max(0, Math.ceil((state.durationMs - state.t) / 1000))}s`, extra: state.pad ? state.pad.punch : state.combo > 1 ? `${state.combo} combo` : null }),

  result: (state) => ({
    outcome: "complete",
    score: state.score,
    stats: [
      { label: "Pads hit", value: state.hits },
      { label: "Missed", value: state.misses },
      { label: "Best combo", value: state.best },
    ],
  }),

  bot: (state) => state.pad?.punch ?? null,
};
