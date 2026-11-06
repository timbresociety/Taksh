// Mirror Match: copy each pose your character strikes, as many as you can before time is up.
import { POSES } from "../motion/poses.js";
import { REACTION_MS, createRandom } from "./shared.js";

function nextPose(state) {
  let id = state.rng.pick(POSES).id;
  while (id === state.pose) id = state.rng.pick(POSES).id;
  state.pose = id;
  state.poseMs = 0;
}

export default {
  id: "poses",
  name: "Mirror Match",
  pitch: "Your character strikes a pose. Copy it with your whole upper body.",
  kind: "Upper body",
  space: "Stand up",
  length: "30 s",
  framing: "upper",
  score: "poses",
  actions: POSES.map((pose, index) => ({ id: `pose_${pose.id}`, label: pose.label, key: String((index + 1) % 10), keyLabel: String((index + 1) % 10) })),
  bindings: POSES.map((pose) => ({ gesture: `pose_${pose.id}`, action: `pose_${pose.id}`, exercise: pose.label })),
  tuning: {
    durationS: { label: "Round length", unit: "s", min: 15, max: 90, default: 30, higherIsHarder: false, whole: true },
    skipMs: { label: "Time before a pose changes", unit: "ms", min: 2500, max: 10000, default: 6000, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { durationS, skipMs } = spec.tuning;
    const state = { status: "playing", t: 0, durationMs: durationS * 1000, skipMs, rng: createRandom(spec.seed), pose: null, poseMs: 0, matched: 0, skipped: 0, score: 0, fastest: null };
    nextPose(state);
    return state;
  },

  act(state, action) {
    if (action !== `pose_${state.pose}`) return [];
    state.matched += 1;
    state.score += Math.round(100 * (1 - (state.poseMs / state.skipMs) * 0.6));
    state.fastest = state.fastest === null ? state.poseMs : Math.min(state.fastest, state.poseMs);
    const matched = state.pose;
    nextPose(state);
    return [{ type: "match", pose: matched }];
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;
    state.poseMs += dtMs;
    if (state.poseMs >= state.skipMs) {
      state.skipped += 1;
      nextPose(state);
      events.push({ type: "skip", pose: state.pose });
    }
    if (state.t >= state.durationMs) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud: (state) => ({ score: state.matched, label: "Poses", clock: `${Math.max(0, Math.ceil((state.durationMs - state.t) / 1000))}s`, meter: 1 - state.poseMs / state.skipMs, extra: POSES.find((pose) => pose.id === state.pose).label }),

  result: (state) => ({
    outcome: "complete",
    score: state.score,
    stats: [
      { label: "Poses matched", value: state.matched },
      { label: "Skipped", value: state.skipped },
      { label: "Fastest", value: state.fastest === null ? "None" : `${(state.fastest / 1000).toFixed(1)}s` },
    ],
  }),

  bot: (state, skill) => (state.poseMs > REACTION_MS[skill] * 3 ? `pose_${state.pose}` : null),
};
