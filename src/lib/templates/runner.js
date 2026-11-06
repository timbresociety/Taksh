// Lane Dash: run forever down three lanes, changing lane, jumping and rolling past obstacles.
import { REACTION_MS, clamp, createRandom } from "./shared.js";

const LANES = 3;
const JUMP_MS = 620;
const ROLL_MS = 620;
const PLAYER_Z = 0;
const SPAWN_Z = 90;
const HIT_RANGE = 1.1;

const KINDS = ["low", "high", "wall"]; // jump it, roll under it, or leave the lane

function addRow(state) {
  const { rng } = state;
  const open = rng.int(LANES);
  const row = [];
  for (let lane = 0; lane < LANES; lane += 1) {
    if (lane === open) continue;
    if (rng.next() < 0.75) row.push({ id: state.nextId++, kind: rng.pick(KINDS), lane, z: state.nextRowZ, passed: false });
  }
  state.obstacles.push(...row);
  if (rng.next() < 0.7) {
    for (let i = 0; i < 4; i += 1) state.coins.push({ id: state.nextId++, lane: open, z: state.nextRowZ - 6 + i * 3, taken: false });
  }
  state.nextRowZ += state.gap;
}

export default {
  id: "lane_runner",
  name: "Lane Dash",
  pitch: "Run three lanes. Step, jump and squat past everything in your way.",
  kind: "Full body",
  space: "Needs space",
  length: "Endless",
  framing: "full",
  score: "metres",
  actions: [
    { id: "left", label: "Move left", key: "ArrowLeft", keyLabel: "←" },
    { id: "right", label: "Move right", key: "ArrowRight", keyLabel: "→" },
    { id: "jump", label: "Jump", key: "ArrowUp", keyLabel: "↑" },
    { id: "roll", label: "Roll", key: "ArrowDown", keyLabel: "↓" },
  ],
  bindings: [
    { gesture: "step_left", action: "left", exercise: "Side step" },
    { gesture: "step_right", action: "right", exercise: "Side step" },
    { gesture: "jump", action: "jump", exercise: "Jump" },
    { gesture: "high_knee", action: "jump", exercise: "High knee" },
    { gesture: "squat_down", action: "roll", exercise: "Squat" },
  ],
  tuning: {
    speed: { label: "Starting speed", unit: "m/s", min: 7, max: 16, default: 10, higherIsHarder: true },
    ramp: { label: "Speed gain", unit: "m/s each 10s", min: 0, max: 1.5, default: 0.5, higherIsHarder: true },
    gap: { label: "Space between rows", unit: "m", min: 14, max: 36, default: 22, higherIsHarder: false },
    lives: { label: "Lives", unit: "", min: 1, max: 5, default: 3, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { speed, ramp, gap, lives } = spec.tuning;
    const state = {
      status: "playing", t: 0, score: 0, distance: 0, coinsTaken: 0, speed, ramp, gap, lives, startLives: lives,
      lane: 1, jumpMs: 0, rollMs: 0, invincibleMs: 0, obstacles: [], coins: [], nextId: 1, nextRowZ: 34, rng: createRandom(spec.seed),
    };
    while (state.nextRowZ < SPAWN_Z) addRow(state);
    return state;
  },

  act(state, action) {
    if (action === "left") state.lane = clamp(state.lane - 1, 0, LANES - 1);
    if (action === "right") state.lane = clamp(state.lane + 1, 0, LANES - 1);
    if (action === "jump" && state.jumpMs <= 0) {
      state.jumpMs = JUMP_MS;
      state.rollMs = 0;
      return [{ type: "jump" }];
    }
    if (action === "roll" && state.rollMs <= 0) {
      state.rollMs = ROLL_MS;
      state.jumpMs = 0;
      return [{ type: "roll" }];
    }
    return [{ type: "move" }];
  },

  step(state, dtMs) {
    const events = [];
    const seconds = dtMs / 1000;
    state.t += dtMs;
    state.speed += (state.ramp / 10) * seconds;
    const travel = state.speed * seconds;
    state.distance += travel;
    state.score = Math.floor(state.distance) + state.coinsTaken * 10;
    state.jumpMs = Math.max(0, state.jumpMs - dtMs);
    state.rollMs = Math.max(0, state.rollMs - dtMs);
    state.invincibleMs = Math.max(0, state.invincibleMs - dtMs);

    for (const item of state.obstacles) {
      item.z -= travel;
      if (item.passed || Math.abs(item.z - PLAYER_Z) > HIT_RANGE || item.lane !== state.lane) continue;
      const cleared = (item.kind === "low" && state.jumpMs > 0) || (item.kind === "high" && state.rollMs > 0);
      if (cleared) {
        item.passed = true;
        events.push({ type: "clear" });
      } else if (state.invincibleMs <= 0) {
        item.passed = true;
        state.lives -= 1;
        state.invincibleMs = 1200;
        events.push({ type: "hurt" });
      }
    }
    for (const coin of state.coins) {
      coin.z -= travel;
      if (!coin.taken && coin.lane === state.lane && Math.abs(coin.z - PLAYER_Z) < 1 && state.rollMs <= 0) {
        coin.taken = true;
        state.coinsTaken += 1;
        events.push({ type: "coin" });
      }
    }
    state.obstacles = state.obstacles.filter((item) => item.z > -12);
    state.coins = state.coins.filter((coin) => coin.z > -12 && !coin.taken);
    state.nextRowZ -= travel;
    while (state.nextRowZ < SPAWN_Z) addRow(state);

    if (state.lives <= 0) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud: (state) => ({ score: state.score, label: "Score", clock: `${Math.floor(state.distance)} m`, lives: state.lives, maxLives: state.startLives }),

  result: (state) => ({
    outcome: "complete",
    score: state.score,
    stats: [
      { label: "Distance", value: `${Math.floor(state.distance)} m` },
      { label: "Coins", value: state.coinsTaken },
      { label: "Top speed", value: `${state.speed.toFixed(1)} m/s` },
    ],
  }),

  bot(state, skill) {
    // A player commits early enough that their reaction lands the move just before the obstacle.
    const commitAt = state.speed * ((REACTION_MS[skill] + 220) / 1000);
    const ahead = state.obstacles.filter((item) => !item.passed && item.z > PLAYER_Z && item.z < commitAt * 1.8);
    const mine = ahead.find((item) => item.lane === state.lane);
    if (!mine) return null;
    if (mine.kind === "low") return mine.z < commitAt ? "jump" : null;
    if (mine.kind === "high") return mine.z < commitAt ? "roll" : null;
    const blocked = (lane) => ahead.some((item) => item.lane === lane && item.kind === "wall");
    if (state.lane > 0 && !blocked(state.lane - 1)) return "left";
    if (state.lane < LANES - 1 && !blocked(state.lane + 1)) return "right";
    return state.lane > 0 ? "left" : "right";
  },
};
