// Baseline Rally: toss to serve, then swing on the beat. First to the target score wins the match.
import { REACTION_MS, createRandom, moveCue } from "./shared.js";

const FLIGHT_MS = 1100;

function serveReady(state) {
  state.phase = "serve";
  state.tossMs = 0;
  state.ball = null;
  state.rallyLength = 0;
}

function send(state, side, flightMs) {
  state.ball = { side, flightMs, ms: 0 };
  state.phase = "incoming";
}

function rivalReturn(state, events) {
  state.rallyLength += 1;
  if (state.rng.next() < state.rivalMiss + state.rallyLength * 0.02) {
    state.you += 1;
    events.push({ type: "point", who: "you" });
    afterPoint(state, events);
    return;
  }
  state.phase = "outgoing";
  state.outgoingMs = state.flightMs * 0.8;
}

function afterPoint(state, events) {
  if (state.you >= state.target || state.rival >= state.target) {
    state.status = "ended";
    events.push({ type: "end" });
    return;
  }
  serveReady(state);
}

// The move the point is waiting on, for the guide: a hand up to toss, a swing to serve, then a swing on
// the side the ball comes to.
function rallyCue(state) {
  if (state.phase === "serve") return moveCue(["reach_up_left", "reach_up_right"], 0, "Toss");
  if (state.phase === "tossed") return moveCue(["swing_left", "swing_right"], 1 - state.tossMs / 900, "Swing");
  if (state.phase === "incoming" && state.ball) return moveCue(`swing_${state.ball.side}`, state.ball.ms / state.ball.flightMs, "Swing");
  return null;
}

export default {
  id: "rally",
  name: "Baseline Rally",
  pitch: "Lift your free hand to toss, then swing as the ball arrives.",
  kind: "Arms",
  space: "Stand up",
  length: "First to 5",
  framing: "upper",
  rival: true,
  score: "points",
  actions: [
    { id: "toss", label: "Toss to serve", key: "w", keyLabel: "W" },
    { id: "swing_left", label: "Swing left", key: "a", keyLabel: "A" },
    { id: "swing_right", label: "Swing right", key: "d", keyLabel: "D" },
  ],
  bindings: [
    { gesture: "reach_up_left", action: "toss", exercise: "Overhead reach" },
    { gesture: "reach_up_right", action: "toss", exercise: "Overhead reach" },
    { gesture: "swing_left", action: "swing_left", exercise: "Arm swing" },
    { gesture: "swing_right", action: "swing_right", exercise: "Arm swing" },
  ],
  tuning: {
    target: { label: "Points to win", unit: "", min: 3, max: 9, default: 5, higherIsHarder: true, whole: true },
    flightMs: { label: "Ball travel time", unit: "ms", min: 700, max: 1800, default: FLIGHT_MS, higherIsHarder: false, whole: true },
    windowMs: { label: "Swing window", unit: "ms", min: 200, max: 700, default: 420, higherIsHarder: false, whole: true },
    rivalMiss: { label: "Rival misses", unit: "", min: 0.03, max: 0.5, default: 0.1, higherIsHarder: false },
  },

  create(spec) {
    const state = {
      status: "playing", t: 0, phase: "serve", you: 0, rival: 0, hits: 0, perfects: 0, score: 0, best: 0, rallyLength: 0, tossMs: 0, outgoingMs: 0, ball: null,
      rng: createRandom(spec.seed), ...spec.tuning,
    };
    return state;
  },

  act(state, action) {
    if (action === "toss" && state.phase === "serve") {
      state.phase = "tossed";
      state.tossMs = 900;
      return [{ type: "toss" }];
    }
    if (action !== "swing_left" && action !== "swing_right") return [];
    const side = action === "swing_left" ? "left" : "right";
    const events = [];
    if (state.phase === "tossed") {
      state.hits += 1;
      events.push({ type: "serve", side });
      rivalReturn(state, events);
      return events;
    }
    if (state.phase !== "incoming" || !state.ball) return [{ type: "swing", side }];
    const offset = Math.abs(state.ball.flightMs - state.ball.ms);
    if (offset > state.windowMs / 2 || state.ball.side !== side) return [{ type: "swing", side }];
    const perfect = offset < state.windowMs / 6;
    state.hits += 1;
    state.perfects += perfect ? 1 : 0;
    state.score += perfect ? 30 : 15;
    state.ball = null;
    events.push({ type: perfect ? "perfect" : "hit", side });
    rivalReturn(state, events);
    state.best = Math.max(state.best, state.rallyLength);
    return events;
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;
    if (state.phase === "tossed") {
      state.tossMs -= dtMs;
      if (state.tossMs <= 0) serveReady(state);
    }
    if (state.phase === "outgoing") {
      state.outgoingMs -= dtMs;
      if (state.outgoingMs <= 0) {
        send(state, state.rng.next() < 0.5 ? "left" : "right", state.flightMs);
        events.push({ type: "incoming", side: state.ball.side });
      }
    }
    if (state.phase === "incoming" && state.ball) {
      state.ball.ms += dtMs;
      if (state.ball.ms > state.ball.flightMs + state.windowMs / 2) {
        state.rival += 1;
        events.push({ type: "point", who: "rival" });
        afterPoint(state, events);
      }
    }
    return events;
  },

  hud: (state) => ({ score: state.you, label: "You", clock: `${state.you} : ${state.rival}`, cue: rallyCue(state) }),

  result: (state) => ({
    outcome: state.you >= state.target ? "win" : "lose",
    score: state.score + state.you * 50,
    stats: [
      { label: "Match", value: `${state.you} : ${state.rival}` },
      { label: "Hits", value: state.hits },
      { label: "Perfect hits", value: state.perfects },
    ],
  }),

  bot(state, skill) {
    if (state.phase === "serve") return "toss";
    if (state.phase === "tossed") return "swing_right";
    if (state.phase !== "incoming" || !state.ball) return null;
    return state.ball.flightMs - state.ball.ms <= REACTION_MS[skill] ? `swing_${state.ball.side}` : null;
  },
};
