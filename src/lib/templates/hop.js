// Sky Hop: squat to charge, stand to launch. Land on the next platform before the clock runs out.
import { REACTION_MS, clamp, createRandom } from "./shared.js";

const CHARGE_MS = 1400; // a full charge
const MAX_RANGE = 9;
const FLIGHT_MS = 700;

function nextPlatform(state, from) {
  const { rng, spacing, width } = state;
  return { id: state.nextId++, x: from + rng.range(spacing * 0.65, spacing * 1.35), width: rng.range(width * 0.75, width * 1.25) };
}

export default {
  id: "hop",
  name: "Sky Hop",
  pitch: "Squat to charge. Stand tall to launch. Land on the next platform.",
  kind: "Full body",
  space: "Needs space",
  length: "60 s",
  framing: "full",
  score: "hops",
  actions: [{ id: "charge", label: "Charge, release to hop", key: " ", keyLabel: "Space", hold: true }],
  bindings: [
    { gesture: "squat_down", action: "charge", exercise: "Squat" },
    { gesture: "squat_up", action: "charge_release", exercise: "Stand up" },
  ],
  tuning: {
    durationS: { label: "Round length", unit: "s", min: 20, max: 120, default: 60, higherIsHarder: false, whole: true },
    spacing: { label: "Gap between platforms", unit: "m", min: 3, max: 7, default: 4.6, higherIsHarder: true },
    width: { label: "Platform size", unit: "m", min: 1, max: 3, default: 1.8, higherIsHarder: false },
  },

  create(spec) {
    const { durationS, spacing, width } = spec.tuning;
    const state = {
      status: "playing", t: 0, durationMs: durationS * 1000, spacing, width, rng: createRandom(spec.seed), nextId: 1,
      x: 0, platforms: [{ id: 0, x: 0, width: 2.4 }], at: 0, chargeMs: 0, charging: false, flight: null, hops: 0, best: 0, streak: 0, falls: 0, score: 0,
    };
    for (let i = 0; i < 4; i += 1) state.platforms.push(nextPlatform(state, state.platforms.at(-1).x));
    return state;
  },

  act(state, action) {
    if (action === "charge" && !state.flight) {
      state.charging = true;
      return [{ type: "charge" }];
    }
    if (action === "charge_release" && state.charging) {
      state.charging = false;
      const power = clamp(state.chargeMs / CHARGE_MS, 0, 1);
      state.chargeMs = 0;
      if (power < 0.08) return [];
      state.flight = { from: state.x, to: state.x + power * MAX_RANGE, ms: 0 };
      return [{ type: "launch", power }];
    }
    return [];
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;
    if (state.charging) state.chargeMs = Math.min(CHARGE_MS, state.chargeMs + dtMs);
    if (state.flight) {
      const { flight } = state;
      flight.ms += dtMs;
      const progress = clamp(flight.ms / FLIGHT_MS, 0, 1);
      state.x = flight.from + (flight.to - flight.from) * progress;
      if (progress >= 1) {
        state.flight = null;
        const landing = state.platforms.findIndex((p, index) => index > state.at && Math.abs(p.x - state.x) <= p.width / 2 + 0.25);
        const stayed = Math.abs(state.platforms[state.at].x - state.x) <= state.platforms[state.at].width / 2 + 0.25;
        if (landing > -1) {
          const clean = Math.abs(state.platforms[landing].x - state.x) < state.platforms[landing].width / 4;
          state.hops += landing - state.at;
          state.streak += 1;
          state.best = Math.max(state.best, state.streak);
          state.score += (clean ? 15 : 10) * Math.min(state.streak, 5);
          state.at = landing;
          state.x = state.platforms[landing].x;
          while (state.platforms.length - state.at < 5) state.platforms.push(nextPlatform(state, state.platforms.at(-1).x));
          events.push({ type: clean ? "perfect" : "land" });
        } else if (stayed) {
          state.x = state.platforms[state.at].x;
          events.push({ type: "short" });
        } else {
          state.falls += 1;
          state.streak = 0;
          state.x = state.platforms[state.at].x;
          events.push({ type: "fall" });
        }
      }
    }
    if (state.t >= state.durationMs) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud: (state) => ({ score: state.score, label: "Score", clock: `${Math.max(0, Math.ceil((state.durationMs - state.t) / 1000))}s`, meter: state.chargeMs / CHARGE_MS, extra: state.streak > 1 ? `${state.streak} in a row` : null }),

  result: (state) => ({
    outcome: "complete",
    score: state.score,
    stats: [
      { label: "Platforms", value: state.hops },
      { label: "Best streak", value: state.best },
      { label: "Falls", value: state.falls },
    ],
  }),

  bot(state, skill) {
    if (state.flight) return null;
    const target = state.platforms[state.at + 1];
    const wanted = ((target.x - state.x) / MAX_RANGE) * CHARGE_MS;
    if (!state.charging) return "charge";
    return state.chargeMs >= wanted - REACTION_MS[skill] ? "charge_release" : null;
  },
};
