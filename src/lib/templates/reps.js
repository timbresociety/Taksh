// Speed Pump: alternate your hands up and down as fast as you can before the clock runs out.
export default {
  id: "reps",
  name: "Speed Pump",
  pitch: "Pump your arms up and down, one then the other, as fast as you can.",
  kind: "Hands only",
  space: "Sit-down OK",
  length: "15 s",
  framing: "upper",
  score: "reps",
  actions: [
    { id: "pump_left", label: "Left hand up", key: "ArrowLeft", keyLabel: "←" },
    { id: "pump_right", label: "Right hand up", key: "ArrowRight", keyLabel: "→" },
  ],
  bindings: [
    { gesture: "pump_left", action: "pump_left", exercise: "Alternating arm pump" },
    { gesture: "pump_right", action: "pump_right", exercise: "Alternating arm pump" },
  ],
  tuning: {
    durationS: { label: "Round length", unit: "s", min: 10, max: 60, default: 15, higherIsHarder: false, whole: true },
    goal: { label: "Rep goal", unit: "reps", min: 10, max: 120, default: 30, higherIsHarder: true, whole: true },
  },

  create(spec) {
    const { durationS, goal } = spec.tuning;
    return { status: "playing", t: 0, durationMs: durationS * 1000, goal, reps: 0, last: null, score: 0, recent: [], peak: 0 };
  },

  act(state, action) {
    if (action === state.last) return [{ type: "same" }];
    state.last = action;
    state.reps += 1;
    state.score = state.reps;
    state.recent.push(state.t);
    return [{ type: "rep", side: action === "pump_left" ? "left" : "right" }];
  },

  step(state, dtMs) {
    state.t += dtMs;
    state.recent = state.recent.filter((t) => state.t - t < 2000);
    state.peak = Math.max(state.peak, state.recent.length / 2);
    if (state.t < state.durationMs) return [];
    state.status = "ended";
    return [{ type: "end" }];
  },

  hud: (state) => ({ score: state.reps, label: "Reps", clock: `${Math.max(0, Math.ceil((state.durationMs - state.t) / 1000))}s`, meter: Math.min(1, state.reps / state.goal), extra: `${(state.recent.length / 2).toFixed(1)} per second` }),

  result: (state) => ({
    outcome: state.reps >= state.goal ? "win" : "complete",
    score: state.reps,
    stats: [
      { label: "Reps", value: state.reps },
      { label: "Goal", value: state.goal },
      { label: "Peak pace", value: `${state.peak.toFixed(1)} per second` },
    ],
  }),

  bot: (state) => (state.last === "pump_left" ? "pump_right" : "pump_left"),
};
