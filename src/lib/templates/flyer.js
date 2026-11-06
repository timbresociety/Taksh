// Wing Beat: flap your arms to stay in the air and fly through the gaps in each gate.
import { REACTION_MS, clamp, createRandom } from "./shared.js";

const CEILING = 10;
const SPAWN_X = 26;
const PLAYER_X = 0;
const HALF_BODY = 0.45;

function addGate(state) {
  const { rng, gapSize } = state;
  const lastY = state.gates.at(-1)?.y ?? 5;
  const y = clamp(lastY + rng.range(-state.drift, state.drift), gapSize / 2 + 0.6, CEILING - gapSize / 2 - 0.6);
  state.gates.push({ id: state.nextId++, x: state.nextGateX, y, passed: false });
  state.nextGateX += state.spacing;
}

export default {
  id: "flyer",
  name: "Wing Beat",
  pitch: "Lift your arms and beat them down to fly through every gap.",
  kind: "Arms",
  space: "Stand up",
  length: "Endless",
  framing: "upper",
  score: "gates",
  actions: [{ id: "flap", label: "Flap", key: " ", keyLabel: "Space" }],
  bindings: [{ gesture: "flap", action: "flap", exercise: "Lateral arm raise" }],
  tuning: {
    gapSize: { label: "Gap height", unit: "m", min: 2.6, max: 5.5, default: 3.8, higherIsHarder: false },
    speed: { label: "Flying speed", unit: "m/s", min: 2.5, max: 7, default: 3.6, higherIsHarder: true },
    gravity: { label: "Gravity", unit: "m/s²", min: 5, max: 14, default: 8, higherIsHarder: true },
    lives: { label: "Lives", unit: "", min: 1, max: 5, default: 3, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { gapSize, speed, gravity, lives } = spec.tuning;
    const state = {
      status: "playing", t: 0, y: 5, velocity: 0, gapSize, speed, gravity, lives, startLives: lives, spacing: 9, drift: 2.2,
      gates: [], nextGateX: 16, nextId: 1, rng: createRandom(spec.seed), passed: 0, flaps: 0, score: 0, invincibleMs: 0,
    };
    while (state.nextGateX < SPAWN_X) addGate(state);
    return state;
  },

  act(state, action) {
    if (action !== "flap") return [];
    state.velocity = Math.max(state.velocity, 0) * 0.3 + state.gravity * 0.5;
    state.flaps += 1;
    return [{ type: "flap" }];
  },

  step(state, dtMs) {
    const events = [];
    const seconds = dtMs / 1000;
    state.t += dtMs;
    state.invincibleMs = Math.max(0, state.invincibleMs - dtMs);
    state.velocity -= state.gravity * seconds;
    state.y += state.velocity * seconds;
    const travel = state.speed * seconds;
    state.nextGateX -= travel;

    const hurt = () => {
      if (state.invincibleMs > 0) return;
      state.lives -= 1;
      state.invincibleMs = 1500;
      events.push({ type: "hurt" });
    };
    if (state.y < 0.4) {
      state.y = 0.4;
      state.velocity = state.gravity * 0.55;
      hurt();
    }
    if (state.y > CEILING - 0.4) {
      state.y = CEILING - 0.4;
      state.velocity = Math.min(0, state.velocity);
    }

    for (const gate of state.gates) {
      gate.x -= travel;
      if (gate.passed || Math.abs(gate.x - PLAYER_X) > 0.5) continue;
      if (Math.abs(state.y - gate.y) > state.gapSize / 2 - HALF_BODY) {
        gate.passed = true;
        hurt();
      } else if (gate.x <= PLAYER_X) {
        gate.passed = true;
        state.passed += 1;
        state.score += 10;
        events.push({ type: "gate" });
      }
    }
    state.gates = state.gates.filter((gate) => gate.x > -8);
    while (state.nextGateX < SPAWN_X) addGate(state);

    if (state.lives <= 0) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud: (state) => ({ score: state.score, label: "Score", clock: `${state.passed} gates`, lives: state.lives, maxLives: state.startLives }),

  result: (state) => ({
    outcome: "complete",
    score: state.score,
    stats: [
      { label: "Gates", value: state.passed },
      { label: "Flaps", value: state.flaps },
    ],
  }),

  bot(state, skill) {
    const gate = state.gates.find((item) => !item.passed && item.x > -0.5);
    const target = gate ? gate.y - 0.4 : 5;
    const lag = REACTION_MS[skill] / 1000;
    const predicted = state.y + state.velocity * lag - 0.5 * state.gravity * lag * lag;
    return predicted < target ? "flap" : null;
  },
};
