// Lane Guard: things come at you down three lanes. Step in front of what you want and away from
// what you don't. A goalkeeper saves shots this way; a robot escape dodges beams.
import { clamp, createRandom } from "./shared.js";

const LANES = 3;
const FIRE_MS = 1100; // how long one stride keeps the feet burning

function addWave(state) {
  const { rng } = state;
  const kind = rng.next() < state.hazardShare ? "hazard" : "target";
  state.incoming.push({ id: state.nextId++, kind, lane: rng.int(LANES), ms: 0, warningMs: state.warningMs, resolved: false });
}

export default {
  id: "guard",
  name: "Lane Guard",
  pitch: "Step into the lane to catch what you want and out of it to dodge the rest, with fast feet for double points.",
  kind: "Full body",
  space: "Needs space",
  length: "45 s",
  framing: "full",
  score: "catches",
  actions: [
    { id: "left", label: "Move left", key: "ArrowLeft", keyLabel: "←" },
    { id: "right", label: "Move right", key: "ArrowRight", keyLabel: "→" },
    { id: "feet", label: "Fast feet", key: "f", keyLabel: "F" },
  ],
  bindings: [
    { gesture: "step_left", action: "left", exercise: "Side step" },
    { gesture: "step_right", action: "right", exercise: "Side step" },
    { gesture: "run_step", action: "feet", exercise: "Run on the spot" },
  ],
  tuning: {
    durationS: { label: "Round length", unit: "s", min: 20, max: 120, default: 45, higherIsHarder: false, whole: true },
    warningMs: { label: "Warning time", unit: "ms", min: 900, max: 3500, default: 1900, higherIsHarder: false, whole: true },
    gapMs: { label: "Time between shots", unit: "ms", min: 500, max: 2600, default: 1300, higherIsHarder: false, whole: true },
    hazardShare: { label: "Share of hazards", unit: "", min: 0, max: 0.8, default: 0.35, higherIsHarder: true },
    lives: { label: "Lives", unit: "", min: 1, max: 5, default: 3, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { durationS, lives, ...rest } = spec.tuning;
    return { status: "playing", t: 0, durationMs: durationS * 1000, lives, startLives: lives, lane: 1, incoming: [], nextId: 1, nextWaveMs: 900, rng: createRandom(spec.seed), fireMs: 0, caught: 0, missed: 0, dodged: 0, hurt: 0, combo: 0, best: 0, score: 0, ...rest };
  },

  act(state, action) {
    if (action === "feet") {
      state.fireMs = FIRE_MS;
      return [{ type: "stride" }];
    }
    state.lane = clamp(state.lane + (action === "left" ? -1 : 1), 0, LANES - 1);
    return [{ type: "move" }];
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;
    state.nextWaveMs -= dtMs;
    state.fireMs = Math.max(0, state.fireMs - dtMs);
    const points = state.fireMs > 0 ? 2 : 1;
    if (state.nextWaveMs <= 0 && state.t < state.durationMs - state.warningMs) {
      addWave(state);
      state.nextWaveMs = state.gapMs;
    }
    for (const item of state.incoming) {
      item.ms += dtMs;
      if (item.resolved || item.ms < item.warningMs) continue;
      item.resolved = true;
      const here = item.lane === state.lane;
      if (item.kind === "target") {
        if (here) {
          state.caught += 1;
          state.combo += 1;
          state.best = Math.max(state.best, state.combo);
          state.score += 10 * Math.min(state.combo, 5) * points;
          events.push({ type: "catch", lane: item.lane });
        } else {
          state.missed += 1;
          state.combo = 0;
          events.push({ type: "miss", lane: item.lane });
        }
      } else if (here) {
        state.hurt += 1;
        state.lives -= 1;
        state.combo = 0;
        events.push({ type: "hurt", lane: item.lane });
      } else {
        state.dodged += 1;
        state.score += 5 * points;
        events.push({ type: "dodge", lane: item.lane });
      }
    }
    state.incoming = state.incoming.filter((item) => item.ms < item.warningMs + 400);
    if (state.lives <= 0 || state.t >= state.durationMs) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud: (state) => ({ score: state.score, label: "Score", clock: `${Math.max(0, Math.ceil((state.durationMs - state.t) / 1000))}s`, lives: state.lives, maxLives: state.startLives, meter: state.fireMs / FIRE_MS, extra: state.fireMs > 0 ? "Double points" : state.combo > 1 ? `${state.combo} in a row` : null }),

  result: (state) => ({
    outcome: state.lives <= 0 ? "lose" : "complete",
    score: state.score,
    stats: [
      { label: "Caught", value: state.caught },
      { label: "Dodged", value: state.dodged },
      { label: "Missed", value: state.missed },
      { label: "Hits taken", value: state.hurt },
    ],
  }),

  bot(state) {
    const next = state.incoming.filter((item) => !item.resolved).sort((a, b) => a.warningMs - a.ms - (b.warningMs - b.ms))[0];
    const feet = state.fireMs < 300 ? "feet" : null;
    if (!next) return feet;
    const wantHere = next.kind === "target" ? state.lane === next.lane : state.lane !== next.lane;
    if (wantHere) return feet;
    if (next.kind === "target") return next.lane < state.lane ? "left" : "right";
    return state.lane === 0 ? "right" : "left";
  },
};
