// Counter Bout: punch whenever you like. When a warning shows, step or duck the way it says, and the
// rival is left open: your punches hit twice as hard until it recovers. Punches always land, so the
// player never wonders why nothing happened.
import { REACTION_MS, createRandom } from "./shared.js";

// A shot's side is the side of the player it comes at, so they step the other way. "high" is at the head.
const ATTACKS = { left: "slip_right", right: "slip_left", high: "duck" };
export const CALLS = { slip_left: "← Step left", slip_right: "Step right →", duck: "Duck ↓" };
const OPPOSITE = { slip_left: "slip_right", slip_right: "slip_left" };
// Bigger punches hit harder. The rival hits about as hard as a hook, so a round is won by trading well.
const DAMAGE = { jab: 5, cross: 6, hook: 8, uppercut: 10 };
const RIVAL_DAMAGE = 8;
const COUNTER_MS = 2200;
const PUNCH_GAP_MS = 320; // one punch per arm movement, however quickly the keys are pressed
const DOWN_MS = 2600;
const KNOCKDOWNS_TO_WIN = 3;
const GUARD_RECHECK_MS = 250; // a rival waiting on its brain looks again this often
const HISTORY = 8;

export default {
  id: "bout",
  name: "Counter Bout",
  pitch: "Jab, cross, hook and uppercut. When a warning shows, step or duck the way it says, then hit back twice as hard.",
  kind: "Arms",
  space: "Stand up",
  length: "60 s",
  framing: "upper",
  rival: true,
  score: "landed",
  actions: [
    { id: "jab", label: "Jab", key: "j", keyLabel: "J" },
    { id: "cross", label: "Cross", key: "k", keyLabel: "K" },
    { id: "hook", label: "Hook", key: "u", keyLabel: "U" },
    { id: "uppercut", label: "Uppercut", key: "i", keyLabel: "I" },
    { id: "slip_left", label: "Step left", key: "a", keyLabel: "A" },
    { id: "slip_right", label: "Step right", key: "d", keyLabel: "D" },
    { id: "duck", label: "Duck", key: "s", keyLabel: "S" },
  ],
  // A side step, not a lean: a lean is small on camera and easy to make by accident while punching.
  bindings: [
    { gesture: "punch_left", action: "jab", exercise: "Jab" },
    { gesture: "punch_right", action: "cross", exercise: "Cross" },
    { gesture: "hook_left", action: "hook", exercise: "Hook" },
    { gesture: "hook_right", action: "hook", exercise: "Hook" },
    { gesture: "uppercut_left", action: "uppercut", exercise: "Uppercut" },
    { gesture: "uppercut_right", action: "uppercut", exercise: "Uppercut" },
    { gesture: "step_left", action: "slip_left", exercise: "Side step" },
    { gesture: "step_right", action: "slip_right", exercise: "Side step" },
    { gesture: "squat_down", action: "duck", exercise: "Squat" },
  ],
  tuning: {
    durationS: { label: "Round length", unit: "s", min: 20, max: 120, default: 60, higherIsHarder: false, whole: true },
    warningMs: { label: "Warning before a shot", unit: "ms", min: 500, max: 2000, default: 1100, higherIsHarder: false, whole: true },
    restMs: { label: "Time between shots", unit: "ms", min: 400, max: 2500, default: 1200, higherIsHarder: false, whole: true },
    rivalHealth: { label: "Rival health", unit: "", min: 40, max: 200, default: 150, higherIsHarder: true, whole: true },
  },

  // rival: "random" picks each shot from the seed. "0g" throws only what its 0G brain planned, and with
  // no plan it holds its guard. That is the safe stop: it never makes up a decision of its own.
  create(spec, { rival = "random" } = {}) {
    const { durationS, warningMs, restMs, rivalHealth } = spec.tuning;
    return {
      rival, plan: [], guarding: false, history: [],
      status: "playing", t: 0, durationMs: durationS * 1000, warningMs, restMs, rivalHealth, rivalMax: rivalHealth, health: 100, rng: createRandom(spec.seed),
      attack: null, restLeft: 1400, openMs: 0, openMaxMs: COUNTER_MS, punchWaitMs: 0, defence: null, defenceMs: 0, landed: 0, counters: 0, dodged: 0, hurt: 0, knockdowns: 0, score: 0, downMs: 0,
    };
  },

  act(state, action) {
    if (state.downMs > 0) return [];
    if (action in DAMAGE) {
      if (state.punchWaitMs > 0) return [];
      state.punchWaitMs = PUNCH_GAP_MS;
      // A 0G rival with no plan holds its guard, and punches don't get through. Otherwise a browser
      // that stops asking 0G would get a rival that never hits back.
      if (state.guarding) return [{ type: "throw", punch: action }];
      const events = [{ type: "throw", punch: action }];
      const counter = state.openMs > 0;
      const damage = DAMAGE[action] * (counter ? 2 : 1);
      state.rivalHealth -= damage;
      state.landed += 1;
      if (counter) state.counters += 1;
      state.score += damage * 10;
      events.push({ type: "land", punch: action, damage, counter });
      // The rival goes down each time a third of their health is gone, and gets up until the last.
      const lost = state.rivalMax - Math.max(0, state.rivalHealth);
      if (lost >= (state.rivalMax / KNOCKDOWNS_TO_WIN) * (state.knockdowns + 1)) {
        state.knockdowns += 1;
        state.score += 500;
        state.openMs = 0;
        state.attack = null;
        events.push({ type: "knockdown" });
        if (state.knockdowns >= KNOCKDOWNS_TO_WIN) {
          state.status = "ended";
          events.push({ type: "end" });
        } else state.downMs = DOWN_MS;
      }
      return events;
    }
    // Coming back to the middle after a step is a step the other way. While the first step still
    // holds against a shot it is only the way back, or stepping out and back in would undo the dodge.
    if (state.defenceMs > 0 && state.defence === OPPOSITE[action]) return [];
    // A move made against a shot in the air holds until that shot lands, so reading it early pays.
    state.defence = action;
    state.defenceMs = state.attack ? state.attack.windupMs - state.attack.ms + 200 : 500;
    return [{ type: "defend", move: action }];
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;
    state.openMs = Math.max(0, state.openMs - dtMs);
    state.punchWaitMs = Math.max(0, state.punchWaitMs - dtMs);
    state.defenceMs = Math.max(0, state.defenceMs - dtMs);
    if (state.defenceMs === 0) state.defence = null;
    if (state.downMs > 0) {
      state.downMs -= dtMs;
      if (state.downMs <= 0) {
        state.restLeft = state.restMs;
        events.push({ type: "rise" });
      }
    } else if (state.attack) {
      state.attack.ms += dtMs;
      if (state.attack.ms >= state.attack.windupMs) {
        const wanted = ATTACKS[state.attack.side];
        state.history = [...state.history, { side: state.attack.side, dodged: state.defence === wanted }].slice(-HISTORY);
        if (state.defence === wanted) {
          state.dodged += 1;
          state.score += 50;
          state.openMs = COUNTER_MS;
          events.push({ type: "dodge", side: state.attack.side });
        } else {
          state.health -= RIVAL_DAMAGE;
          state.hurt += 1;
          events.push({ type: "hurt", side: state.attack.side });
        }
        state.attack = null;
        state.restLeft = state.restMs;
      }
    } else if (state.openMs <= 0) {
      state.restLeft -= dtMs;
      if (state.restLeft <= 0) {
        const side = state.rival === "0g" ? state.plan.shift() : state.rng.pick(Object.keys(ATTACKS));
        if (side) {
          state.guarding = false;
          state.attack = { side, ms: 0, windupMs: state.warningMs };
          events.push({ type: "windup", side: state.attack.side });
        } else {
          if (!state.guarding) events.push({ type: "guard" });
          state.guarding = true;
          state.restLeft = GUARD_RECHECK_MS;
        }
      }
    }
    if (state.health <= 0 || state.t >= state.durationMs) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud: (state) => ({
    score: state.score, label: "Score", clock: `${Math.max(0, Math.ceil((state.durationMs - state.t) / 1000))}s`,
    bars: [{ label: "You", value: Math.max(0, state.health) / 100 }, { label: "Rival", value: Math.max(0, state.rivalHealth) / state.rivalMax }],
    extra: state.attack ? CALLS[ATTACKS[state.attack.side]] : state.openMs > 0 ? "Hit now! x2" : state.guarding ? "Guard up" : null,
    tone: state.attack ? "danger" : state.openMs > 0 ? "open" : null,
    keys: ["jab", "cross", "hook", "uppercut", "slip_left", "slip_right", "duck"],
  }),

  result: (state) => ({
    outcome: state.knockdowns >= KNOCKDOWNS_TO_WIN ? "win" : state.health <= 0 ? "lose" : "complete",
    score: state.score,
    stats: [
      { label: "Punches landed", value: state.landed },
      { label: "Counters", value: state.counters },
      { label: "Knockdowns", value: state.knockdowns },
      { label: "Dodged", value: state.dodged },
      { label: "Hits taken", value: state.hurt },
    ],
  }),

  // How long after a shot showed that this move answered it, or null when it doesn't answer one.
  reactionMs: (state, action) => (state.attack && ATTACKS[state.attack.side] === action ? state.attack.ms : null),

  // The 0G brain's plan. Only known sides get in, whatever the model sent.
  plan(state, sides) {
    state.plan = sides.filter((side) => side in ATTACKS).slice(0, 4);
  },

  // The brain asks again while one shot is still queued, so the next plan lands before the queue runs dry.
  needsPlan: (state) => state.plan.length <= 1 && !state.attack,

  // What the 0G brain sees: the fight so far, and which of its shots the player read.
  observe: (state) => ({
    secondsLeft: Math.max(0, Math.ceil((state.durationMs - state.t) / 1000)),
    playerHealth: Math.max(0, state.health),
    rivalHealth: Math.max(0, Math.round((state.rivalHealth / state.rivalMax) * 100)),
    knockdowns: state.knockdowns,
    lastShots: state.history,
    queued: state.plan.length,
  }),

  bot(state, skill) {
    if (state.attack) {
      const left = state.attack.windupMs - state.attack.ms;
      return left < REACTION_MS[skill] + 200 ? ATTACKS[state.attack.side] : null;
    }
    if (state.punchWaitMs > 0) return null;
    return state.openMs > 0 ? "uppercut" : ["jab", "cross", "hook"][state.landed % 3];
  },
};
