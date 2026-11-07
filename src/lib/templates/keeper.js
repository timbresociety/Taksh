// Last Line: stand in a goal cut into nine zones, and save each shot with the one move its zone asks
// for. The zone lights up while the striker lines the shot up, so there is time to read it and move.
import { createRandom, moveCue } from "./shared.js";

// The goal in reading order, as the player sees it in the mirrored picture: their left is the screen's
// left. One move per zone, and this table is the only place a zone's move is chosen: the actions, keys,
// bindings and the view all follow it. The owner left the middle open; fists to the chin read cleanly
// on camera and looks like blocking a shot at the chest.
export const ZONES = [
  { id: "tl", label: "Top left", key: "q", gesture: "reach_up_left", exercise: "Left hand up and out" },
  { id: "tc", label: "Top", key: "w", gesture: "hands_up", exercise: "Both hands above your head" },
  { id: "tr", label: "Top right", key: "e", gesture: "reach_up_right", exercise: "Right hand up and out" },
  { id: "ml", label: "Left", key: "a", gesture: "hand_left", exercise: "Left arm out sideways" },
  { id: "mc", label: "Middle", key: "s", gesture: "guard", exercise: "Both fists to your chin" },
  { id: "mr", label: "Right", key: "d", gesture: "hand_right", exercise: "Right arm out sideways" },
  { id: "bl", label: "Bottom left", key: "z", gesture: "kick_left", exercise: "Left leg out" },
  { id: "bc", label: "Bottom", key: "x", gesture: "squat_down", exercise: "Squat" },
  { id: "br", label: "Bottom right", key: "c", gesture: "kick_right", exercise: "Right leg out" },
];
export const ZONE_IDS = ZONES.map((zone) => zone.id);
export const zoneInfo = (id) => ZONES.find((zone) => zone.id === id);

export const MIN_LEAD_MS = 2200; // from the zone lighting up to the ball arriving, never less than this
const WARN_SHARE = 0.4; // of that lead, the striker lines the shot up for this share before kicking
const LAST_LEAD_SHARE = 0.85; // the strikers warm up gently, and the last shots get this share of the time
const LAST_GAP_SHARE = 0.75;
const MIN_GAP_MS = 900;
const FIRST_SHOT_MS = 2000;
const FINALE_MS = 2600;
const BOT_WAITS = 0.4; // of the flight, so the bot's saves are seen meeting a ball in the air
const WAIT_RECHECK_MS = 250; // a 0G striker with no plan looks again this often
const MAX_WAIT_MS = 20000; // and after this long with no plan, the match ends rather than hang
const HISTORY = 8;

// Returns null when a 0G striker has nothing planned. It waits rather than pick a zone itself.
function spawn(state) {
  const played = 1 - state.toSpawn / state.total;
  // Never the same zone twice running, so every shot asks for a fresh move.
  if (state.rival === "0g") while (state.plan[0] === state.lastZone) state.plan.shift();
  const zone = state.rival === "0g" ? state.plan.shift() : state.rng.pick(ZONE_IDS.filter((id) => id !== state.lastZone));
  if (!zone) return null;
  const lifeMs = Math.max(MIN_LEAD_MS, Math.round(state.leadMs * (1 - (1 - LAST_LEAD_SHARE) * played)));
  const shot = { id: state.nextId++, zone, ms: 0, kickMs: Math.round(lifeMs * WARN_SHARE), lifeMs, kicked: false };
  state.shots.push(shot);
  state.lastZone = zone;
  state.toSpawn -= 1;
  return shot;
}

// A 0G striker with nothing planned and the goal empty, while there are shots still to take.
const waitingOnPlan = (state) => state.rival === "0g" && state.status === "playing" && state.finaleMs <= 0 && !state.shots.length && !state.plan.length && state.toSpawn > 0;

// The next shot waits for this one to be settled, so there is only ever one zone to read.
function settle(state) {
  const played = 1 - state.toSpawn / state.total;
  state.nextMs = Math.max(MIN_GAP_MS, state.gapMs * (1 - (1 - LAST_GAP_SHARE) * played) * state.rng.range(0.9, 1.1));
}

function finish(state) {
  if (state.lives > 0) {
    state.won = true;
    state.score += 1000 + state.lives * 300;
  }
  state.finaleMs = FINALE_MS;
}

export default {
  id: "keeper",
  name: "Last Line",
  pitch: "Guard a goal cut into nine zones and save each shot with the move its zone lights up: a hand up for a top corner, an arm out for a side, a leg out for a low corner, both hands up, fists to the chin or a squat.",
  kind: "Whole body",
  space: "Stand back",
  length: "2 min",
  framing: "full",
  rival: true,
  score: "saves",
  actions: ZONES.map(({ id, label, key }) => ({ id: `save_${id}`, label, key, keyLabel: key.toUpperCase() })),
  bindings: ZONES.map(({ id, gesture, exercise }) => ({ gesture, action: `save_${id}`, exercise, demo: `still_${gesture}` })),
  tuning: {
    shots: { label: "Shots in the match", unit: "", min: 6, max: 48, default: 24, higherIsHarder: true, whole: true },
    leadMs: { label: "Time from the warning to the ball arriving", unit: "ms", min: 2600, max: 6000, default: 3800, higherIsHarder: false, whole: true },
    gapMs: { label: "Time between shots", unit: "ms", min: 1000, max: 4000, default: 2200, higherIsHarder: false, whole: true },
    lives: { label: "Goals before you lose", unit: "", min: 1, max: 6, default: 4, higherIsHarder: false, whole: true },
  },

  // rival: "random" picks each zone from the seed. "0g" shoots only where its 0G brain planned, and
  // with no plan it waits. That is the safe stop: it never makes up a shot of its own.
  create(spec, { rival = "random" } = {}) {
    const { shots, leadMs, gapMs, lives } = spec.tuning;
    return {
      rival, plan: [], waiting: false, waitedMs: 0, history: [],
      status: "playing", t: 0, toSpawn: shots, total: shots, leadMs, gapMs, lives, startLives: lives, rng: createRandom(spec.seed),
      shots: [], lastZone: null, nextId: 1, nextMs: FIRST_SHOT_MS, finaleMs: 0, won: false,
      saved: 0, wrong: 0, hurt: 0, combo: 0, best: 0, score: 0,
    };
  },

  act(state, action) {
    if (state.finaleMs > 0) return [];
    const zone = action.replace("save_", "");
    if (!ZONE_IDS.includes(zone)) return [];
    const events = [{ type: "reach", zone }];
    // A move with nothing coming is only the keeper shaping up, and costs nothing.
    if (!state.shots.length) return events;
    const shot = state.shots.find((item) => item.zone === zone);
    if (!shot) {
      // The wrong move saves nothing, and the ball still coming is the whole price. Moves brush past
      // each other on the way, too: fists pass the chin on their way above the head.
      state.wrong += 1;
      events.push({ type: "wrong_zone", zone, wanted: state.shots[0].zone });
      return events;
    }
    state.shots = state.shots.filter((item) => item !== shot);
    state.history = [...state.history, { zone, saved: true }].slice(-HISTORY);
    state.saved += 1;
    state.combo += 1;
    state.best = Math.max(state.best, state.combo);
    state.score += Math.round(100 * (1 + Math.min(state.combo, 10) * 0.1));
    events.push({ type: "save", zone, id: shot.id, kicked: shot.kicked });
    settle(state);
    return events;
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;

    if (state.finaleMs > 0) {
      state.finaleMs -= dtMs;
      if (state.finaleMs <= 0) {
        state.status = "ended";
        events.push({ type: "end" });
      }
      return events;
    }

    if (!state.shots.length && state.toSpawn > 0) {
      state.nextMs -= dtMs;
      if (state.nextMs <= 0) {
        const shot = spawn(state);
        state.waiting = !shot;
        if (shot) {
          state.waitedMs = 0;
          events.push({ type: "aim", zone: shot.zone, id: shot.id });
        } else {
          state.waitedMs += WAIT_RECHECK_MS - state.nextMs;
          state.nextMs = WAIT_RECHECK_MS;
        }
      }
    }
    for (const shot of state.shots) {
      shot.ms += dtMs;
      if (!shot.kicked && shot.ms >= shot.kickMs) {
        shot.kicked = true;
        events.push({ type: "kick", zone: shot.zone, id: shot.id });
      }
    }
    for (const shot of state.shots.filter((item) => item.ms >= item.lifeMs)) {
      events.push({ type: "goal", zone: shot.zone, id: shot.id });
      state.history = [...state.history, { zone: shot.zone, saved: false }].slice(-HISTORY);
      state.lives -= 1;
      state.hurt += 1;
      state.combo = 0;
      events.push({ type: "hurt", cause: "shot" });
      settle(state);
    }
    state.shots = state.shots.filter((shot) => shot.ms < shot.lifeMs);

    if (state.lives <= 0 || state.waitedMs >= MAX_WAIT_MS) {
      state.status = "ended";
      events.push({ type: "end" });
    } else if (state.toSpawn <= 0 && !state.shots.length) finish(state);
    return events;
  },

  hud(state) {
    const shot = state.shots[0];
    const zone = shot && zoneInfo(shot.zone);
    return {
      score: state.score, label: "Score", lives: state.lives, maxLives: state.startLives,
      clock: state.won ? "Full time" : `${state.toSpawn + state.shots.length} left`,
      extra: state.won ? "Clean hands" : zone ? null : state.waiting || waitingOnPlan(state) ? "Striker thinking on 0G…" : "Get set",
      cue: zone && state.finaleMs <= 0 ? moveCue(zone.gesture, shot.ms / shot.lifeMs) : null,
      keys: ZONES.map(({ id }) => `save_${id}`), // all nine, which the key bar lays out like the goal
    };
  },

  result: (state) => ({
    outcome: state.won ? "win" : state.lives <= 0 ? "lose" : "complete",
    score: state.score,
    stats: [
      { label: "Saves", value: state.saved },
      { label: "Best run", value: state.best },
      { label: "Goals let in", value: state.hurt },
    ],
  }),

  // How long after a zone lit up that this move saved it, or null when it doesn't save one.
  reactionMs: (state, action) => state.shots.find((shot) => `save_${shot.zone}` === action)?.ms ?? null,

  // While 0G's next plan is on its way the striker sways on its feet. Motion only: it never shoots.
  thinking: (state) => (waitingOnPlan(state) ? { x: Math.sin(state.t / 700) * 0.25, bob: Math.abs(Math.sin(state.t / 340)) * 0.05, turn: Math.sin(state.t / 1200) * 0.15 } : null),

  // The 0G brain's plan. Only known zones get in, whatever the model sent.
  plan(state, zones) {
    state.plan = zones.filter((zone) => ZONE_IDS.includes(zone)).slice(0, 4);
  },

  // Asks while the goal is empty and one planned shot is left, so the next plan lands in time.
  needsPlan: (state) => state.plan.length <= 1 && !state.shots.length && state.toSpawn > state.plan.length,

  // What the 0G brain sees: the match so far, and which of its shots the keeper saved.
  observe: (state) => ({
    shotsLeft: state.toSpawn,
    lives: state.lives,
    saves: state.saved,
    lastShots: state.history,
    queued: state.plan.length,
  }),

  // Waits until the ball is on its way, as a player watching the striker might, then makes the move.
  bot(state) {
    if (state.finaleMs > 0) return null;
    const shot = state.shots[0];
    if (!shot || shot.ms < shot.kickMs + (shot.lifeMs - shot.kickMs) * BOT_WAITS) return null;
    return `save_${shot.zone}`;
  },
};
