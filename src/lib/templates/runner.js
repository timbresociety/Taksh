// Local Dash: run three lanes through a city with height in it. Parked trains fill lanes end to end,
// so you go around them or climb a ramp and run along the roofs, until the train ends and you drop.
import { REACTION_MS, createRandom } from "./shared.js";

const LANES = 3;
const ROLL_MS = 620;
const PLAYER_Z = 0;
const SPAWN_Z = 90;
const HIT_RANGE = 1.1;
const GRAVITY = 30; // m/s², a little heavier than real, because a jump has to feel sharp at running speed
const JUMP_SPEED = 10.6;
const DIVE_SPEED = 18;
const CLIMB = 0.7; // the highest lip a runner takes in stride
const CLEARS = 0.75; // how far above a low obstacle a jump has to be
const LEVEL = 2.2; // anything further above or below is on another level and cannot touch you
const FIRE_MS = 1100;
const FIRST_TRAIN_M = 60; // a player learns the street before the first train

export const ROOF = 3.4;
export const COACH = 18;
export const RAMP_M = 8;

const STREET_KINDS = ["low", "high", "wall"]; // jump it, roll under it, or leave the lane
const ROOF_KINDS = ["low", "high"]; // a roof is one lane wide, so nothing up there may need a side step

// The ground height under a lane, this far ahead of the player.
export function surfaceAt(state, lane, ahead = PLAYER_Z) {
  let height = 0;
  for (const part of state.platforms) {
    if (part.lane !== lane || ahead < part.z || ahead > part.z + part.length) continue;
    height = Math.max(height, part.kind === "ramp" ? (ROOF * (ahead - part.z)) / part.length : ROOF);
  }
  return height;
}

function addCoins(state, lane, z, y, count = 4, spacing = 3) {
  for (let i = 0; i < count; i += 1) state.coins.push({ id: state.nextId++, lane, z: z + i * spacing, y: typeof y === "function" ? y(i) : y, taken: false });
}

function addRow(state) {
  const { rng } = state;
  const open = rng.int(LANES);
  for (let lane = 0; lane < LANES; lane += 1) {
    if (lane === open) continue;
    if (rng.next() < 0.75) state.obstacles.push({ id: state.nextId++, kind: rng.pick(STREET_KINDS), lane, z: state.nextRowZ, y: 0, passed: false });
  }
  if (rng.next() < 0.7) addCoins(state, open, state.nextRowZ - 6, 0.75);
  state.nextRowZ += state.gap;
}

// One or two trains side by side, always leaving a lane free on the street. The ramped train is the
// reward route: coins run up the ramp and along the roof, past low things to jump and bars to roll under.
function addTrains(state) {
  const { rng } = state;
  const start = state.nextRowZ;
  const free = rng.int(LANES);
  const lanes = [0, 1, 2].filter((lane) => lane !== free);
  const used = rng.next() < 0.5 ? lanes : [rng.pick(lanes)];
  const coaches = 1 + rng.int(3);
  const length = coaches * COACH;
  const ramped = rng.pick(used);

  for (const lane of used) {
    const front = start + (lane === ramped ? RAMP_M : 0);
    state.platforms.push({ id: state.nextId++, kind: `train${coaches}`, lane, z: front, length, coaches });
  }
  state.platforms.push({ id: state.nextId++, kind: "ramp", lane: ramped, z: start, length: RAMP_M });
  addCoins(state, ramped, start + 1, (i) => 0.75 + (ROOF * (1 + i * 2)) / RAMP_M, 4, 2);

  const roofStart = start + RAMP_M;
  for (let z = roofStart + 7; z < roofStart + length - 5; z += COACH) {
    if (rng.next() < 0.7) state.obstacles.push({ id: state.nextId++, kind: rng.pick(ROOF_KINDS), lane: ramped, z, y: ROOF, passed: false });
    addCoins(state, ramped, z + 4, ROOF + 0.75);
  }

  // The street lane beside the train still has to be run, but never needs a sideways step.
  for (let z = start + state.gap / 2; z < roofStart + length; z += state.gap) {
    if (rng.next() < 0.6) state.obstacles.push({ id: state.nextId++, kind: rng.pick(ROOF_KINDS), lane: free, z, y: 0, passed: false });
  }
  state.nextRowZ = roofStart + length + state.gap;
}

function addSection(state) {
  const ahead = state.distance + state.nextRowZ;
  if (ahead > FIRST_TRAIN_M && state.rng.next() < state.trainShare) addTrains(state);
  else addRow(state);
}

// A train front at speed. The hit moves the player to the nearest lane they can stand in.
function crash(state, events) {
  if (state.invincibleMs <= 0) {
    state.lives -= 1;
    state.invincibleMs = 1200;
    events.push({ type: "hurt" });
  }
  const lanes = [0, 1, 2].filter((lane) => surfaceAt(state, lane) - state.y <= CLIMB);
  lanes.sort((a, b) => Math.abs(a - state.lane) - Math.abs(b - state.lane));
  if (lanes.length) state.lane = lanes[0];
}

export default {
  id: "lane_runner",
  name: "Local Dash",
  pitch: "Dodge through three lanes of street, then climb the ramps and run along the roofs of parked trains.",
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
    { id: "feet", label: "Fast feet", key: "f", keyLabel: "F" },
  ],
  bindings: [
    { gesture: "step_left", action: "left", exercise: "Side step" },
    { gesture: "step_right", action: "right", exercise: "Side step" },
    { gesture: "jump", action: "jump", exercise: "Jump" },
    { gesture: "squat_down", action: "roll", exercise: "Squat" },
    { gesture: "run_step", action: "feet", exercise: "Run on the spot" },
  ],
  tuning: {
    speed: { label: "Starting speed", unit: "m/s", min: 7, max: 16, default: 10, higherIsHarder: true },
    ramp: { label: "Speed gain", unit: "m/s each 10s", min: 0, max: 1.5, default: 0.5, higherIsHarder: true },
    gap: { label: "Space between rows", unit: "m", min: 14, max: 36, default: 22, higherIsHarder: false },
    trainShare: { label: "Share of trains", unit: "", min: 0, max: 0.7, default: 0.35, higherIsHarder: true },
    lives: { label: "Lives", unit: "", min: 1, max: 5, default: 3, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { speed, ramp, gap, lives, trainShare } = spec.tuning;
    const state = {
      status: "playing", t: 0, score: 0, distance: 0, coinsTaken: 0, roofMetres: 0, speed, ramp, gap, trainShare, lives, startLives: lives,
      lane: 1, y: 0, vy: 0, grounded: true, rollMs: 0, fireMs: 0, invincibleMs: 0, obstacles: [], coins: [], platforms: [], nextId: 1, nextRowZ: 34, rng: createRandom(spec.seed),
    };
    while (state.nextRowZ < SPAWN_Z) addSection(state);
    return state;
  },

  act(state, action) {
    if (action === "feet") {
      state.fireMs = FIRE_MS;
      return [{ type: "stride" }];
    }
    if (action === "left" || action === "right") {
      const lane = state.lane + (action === "left" ? -1 : 1);
      if (lane < 0 || lane >= LANES) return [{ type: "move" }];
      if (surfaceAt(state, lane) - state.y > CLIMB) return [{ type: "bump", side: action }]; // the side of a train
      state.lane = lane;
      return [{ type: "move" }];
    }
    if (action === "jump" && state.grounded) {
      state.vy = JUMP_SPEED;
      state.grounded = false;
      state.rollMs = 0;
      return [{ type: "jump" }];
    }
    if (action === "roll" && state.rollMs <= 0) {
      state.rollMs = ROLL_MS;
      if (!state.grounded) state.vy = -DIVE_SPEED; // rolling in the air means get down now
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
    state.rollMs = Math.max(0, state.rollMs - dtMs);
    state.fireMs = Math.max(0, state.fireMs - dtMs);
    state.invincibleMs = Math.max(0, state.invincibleMs - dtMs);

    for (const part of state.platforms) part.z -= travel;
    const floor = surfaceAt(state, state.lane);
    if (floor - state.y > CLIMB) crash(state, events);
    const under = surfaceAt(state, state.lane);
    if (state.grounded && under < state.y - 0.05) state.grounded = false; // ran off the end
    if (state.grounded) state.y = under;
    else {
      state.vy -= GRAVITY * seconds;
      state.y += state.vy * seconds;
      if (state.y <= under && state.vy <= 0) {
        state.y = under;
        state.vy = 0;
        state.grounded = true;
        events.push({ type: "land" });
      }
    }
    if (state.y >= ROOF - 0.1) state.roofMetres += travel;

    for (const item of state.obstacles) {
      item.z -= travel;
      if (item.passed || Math.abs(item.z - PLAYER_Z) > HIT_RANGE || item.lane !== state.lane) continue;
      const above = state.y - item.y;
      if (Math.abs(above) > LEVEL) continue;
      const cleared = (item.kind === "low" && above >= CLEARS) || (item.kind === "high" && state.rollMs > 0);
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
      if (!coin.taken && coin.lane === state.lane && Math.abs(coin.z - PLAYER_Z) < 1 && Math.abs(state.y + 0.75 - coin.y) < 1.3 && state.rollMs <= 0) {
        coin.taken = true;
        state.coinsTaken += state.fireMs > 0 ? 2 : 1;
        events.push({ type: "coin" });
      }
    }
    state.score = Math.floor(state.distance) + state.coinsTaken * 10;
    state.obstacles = state.obstacles.filter((item) => item.z > -12);
    state.coins = state.coins.filter((coin) => coin.z > -12 && !coin.taken);
    state.platforms = state.platforms.filter((part) => part.z + part.length > -16);
    state.nextRowZ -= travel;
    while (state.nextRowZ < SPAWN_Z) addSection(state);

    if (state.lives <= 0) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud: (state) => ({ score: state.score, label: "Score", clock: `${Math.floor(state.distance)} m`, lives: state.lives, maxLives: state.startLives, meter: state.fireMs / FIRE_MS, extra: state.fireMs > 0 ? "Double coins" : null }),

  result: (state) => ({
    outcome: "complete",
    score: state.score,
    stats: [
      { label: "Distance", value: `${Math.floor(state.distance)} m` },
      { label: "On the roofs", value: `${Math.floor(state.roofMetres)} m` },
      { label: "Coins", value: state.coinsTaken },
      { label: "Top speed", value: `${state.speed.toFixed(1)} m/s` },
    ],
  }),

  bot(state, skill) {
    // A player commits early enough that their reaction lands the move just before the obstacle.
    const commitAt = state.speed * ((REACTION_MS[skill] + 220) / 1000);
    const sight = commitAt * 1.8;
    const ahead = state.obstacles.filter((item) => !item.passed && item.z > PLAYER_Z && item.z < sight && Math.abs(state.y - item.y) <= LEVEL);
    const trainFront = (lane) => {
      for (let z = 1; z < sight; z += 1) if (surfaceAt(state, lane, z) - Math.max(state.y, surfaceAt(state, lane, z - 1)) > CLIMB) return true;
      return false;
    };
    const blocked = (lane) => trainFront(lane) || surfaceAt(state, lane) - state.y > CLIMB || ahead.some((item) => item.lane === lane && item.kind === "wall");
    const mine = ahead.find((item) => item.lane === state.lane);

    if (trainFront(state.lane) || mine?.kind === "wall") {
      const options = [state.lane - 1, state.lane + 1].filter((lane) => lane >= 0 && lane < LANES && !blocked(lane));
      if (options.length) return options[0] < state.lane ? "left" : "right";
      return null; // boxed in by a train alongside, so wait for the lane to open
    }
    if (mine?.kind === "low") return mine.z < commitAt ? "jump" : null;
    if (mine?.kind === "high") return mine.z < commitAt ? "roll" : null;
    // The roofs are the better route, so a player heads for a ramp they can reach.
    const ramp = state.platforms.find((part) => part.kind === "ramp" && part.z > commitAt && part.z < sight * 2);
    if (ramp && ramp.lane !== state.lane && state.grounded) {
      const lane = state.lane + Math.sign(ramp.lane - state.lane);
      if (!blocked(lane)) return lane < state.lane ? "left" : "right";
    }
    return state.fireMs < 300 ? "feet" : null;
  },
};
