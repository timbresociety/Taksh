// Dahi Handi: a human tower climbs to a pot of curd hung over the street. A squat jump timed to the call
// takes the climber up a tier, and hands up or a flap steadies the tower when it leans. The last leap
// breaks the pot, and each pot hangs a tier higher than the one before.
import { REACTION_MS, createRandom } from "./shared.js";

export const LEAN_AT = 0.55; // where the crowd starts shouting, a full warning before the tower goes
const FALL_AT = 1;
const SETTLE_MS = 1300;
const FALL_SETTLE_MS = 2000;
const GRACE_MS = 300; // a squat starts before the shout, so a jump a little early still counts
const PERFECT = [0.15, 0.7]; // the stretch of the window that scores best
const SHOVE = 0.14;
const STEADY_MS = 350; // arms cannot go up again any sooner
const STEADY_KEEP = 0.25;
const QUIET = 0.12;
const STALLED_AT = 2; // windows missed in a row before a crew on the ground gets restless
const FINALE_MS = 3000;
const BETWEEN_POTS_MS = 2600;

export const potHeight = (state) => state.tiers + state.pot; // tiers under this pot
const rate = (state) => state.swayRate * (0.7 + (0.5 * state.tier) / potHeight(state));

// A shove never carries the tower past the shouting point, so it can't take the warning away.
function shove(state, amount) {
  const lean = state.sway + (state.sway >= 0 ? 1 : -1) * amount;
  state.sway = Math.sign(lean) * Math.min(Math.abs(lean), Math.max(Math.abs(state.sway), LEAN_AT));
}

function settle(state, ms) {
  state.phase = "settle";
  state.phaseMs = ms;
}

function nextPot(state, events) {
  state.broken += 1;
  state.score += 1000 + state.lives * 200;
  events.push({ type: "smash", pot: state.pot });
  if (state.broken >= state.pots) {
    state.won = true;
    state.finaleMs = FINALE_MS;
    return;
  }
  state.pot += 1;
  state.tier = 0;
  state.sway = 0;
  settle(state, BETWEEN_POTS_MS);
}

export default {
  id: "handi",
  name: "Dahi Handi",
  pitch: "Squat jump on the call to climb the human tower, throw your hands up to steady it, and leap to break the pot.",
  kind: "Whole body",
  space: "Needs space",
  length: "90 s",
  framing: "full",
  score: "pots",
  actions: [
    { id: "climb", label: "Climb", key: " ", keyLabel: "Space" },
    { id: "steady", label: "Steady the tower", key: "h", keyLabel: "H" },
  ],
  bindings: [
    { gesture: "squat_jump", action: "climb", exercise: "Squat jump" },
    { gesture: "hands_up", action: "steady", exercise: "Both hands up" },
    { gesture: "flap", action: "steady", exercise: "Flap" },
  ],
  tuning: {
    pots: { label: "Pots to break", unit: "", min: 1, max: 5, default: 3, higherIsHarder: true, whole: true },
    tiers: { label: "Tiers under the first pot", unit: "", min: 2, max: 5, default: 3, higherIsHarder: true, whole: true },
    callMs: { label: "Warning before a climb", unit: "ms", min: 900, max: 2600, default: 1400, higherIsHarder: false, whole: true },
    windowMs: { label: "Time to make the jump", unit: "ms", min: 1500, max: 4500, default: 2600, higherIsHarder: false, whole: true },
    swayRate: { label: "How fast the tower leans", unit: "", min: 0.08, max: 0.4, default: 0.17, higherIsHarder: true },
    lives: { label: "Falls before the tower gives up", unit: "", min: 1, max: 5, default: 3, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { pots, tiers, callMs, windowMs, swayRate, lives } = spec.tuning;
    return {
      status: "playing", t: 0, rng: createRandom(spec.seed), pots, tiers, callMs, windowMs, swayRate, lives, startLives: lives,
      pot: 0, tier: 0, stalled: 0, phase: "settle", phaseMs: SETTLE_MS, sway: 0.05, lean: 1, steadyMs: 0, finaleMs: 0, won: false,
      climbed: 0, perfects: 0, slips: 0, falls: 0, steadied: 0, broken: 0, score: 0,
    };
  },

  act(state, action) {
    if (state.finaleMs > 0) return [];
    if (action === "steady") {
      state.steadied += 1;
      if (state.steadyMs > 0) return [];
      state.steadyMs = STEADY_MS;
      const close = Math.abs(state.sway) >= LEAN_AT;
      if (close) state.score += 60;
      state.sway *= STEADY_KEEP;
      if (Math.abs(state.sway) < QUIET) state.lean = state.rng.next() < 0.5 ? -1 : 1;
      return [{ type: "clear", close }];
    }
    if (action !== "climb") return [];
    const onTime = state.phase === "window" || (state.phase === "call" && state.phaseMs <= GRACE_MS);
    if (!onTime) {
      state.slips += 1;
      shove(state, SHOVE);
      return [{ type: "wrong" }];
    }
    const share = state.phase === "call" ? 0 : 1 - state.phaseMs / state.windowMs;
    const perfect = share >= PERFECT[0] && share <= PERFECT[1];
    if (perfect) state.perfects += 1;
    const events = [{ type: perfect ? "perfect" : "climb", tier: state.tier + 1 }];
    if (state.tier >= potHeight(state)) {
      nextPot(state, events);
      return events;
    }
    state.tier += 1;
    state.climbed += 1;
    state.stalled = 0;
    state.score += (perfect ? 150 : 100) * state.tier;
    shove(state, SHOVE);
    settle(state, SETTLE_MS);
    return events;
  },

  step(state, dtMs) {
    const events = [];
    const seconds = dtMs / 1000;
    state.t += dtMs;
    state.steadyMs = Math.max(0, state.steadyMs - dtMs);

    if (state.finaleMs > 0) {
      state.sway *= Math.exp(-3 * seconds);
      state.finaleMs -= dtMs;
      if (state.finaleMs <= 0) {
        state.status = "ended";
        events.push({ type: "end" });
      }
      return events;
    }

    state.phaseMs -= dtMs;
    if (state.phaseMs <= 0) {
      if (state.phase === "settle") {
        state.phase = "call";
        state.phaseMs = state.callMs;
        events.push({ type: "call", last: state.tier >= potHeight(state) });
      } else if (state.phase === "call") {
        state.phase = "window";
        state.phaseMs = state.windowMs;
      } else {
        state.slips += 1;
        state.stalled += 1;
        shove(state, SHOVE);
        settle(state, SETTLE_MS);
        events.push({ type: "miss" });
      }
    }

    // Nothing leans until someone is on it, or the crew has been left waiting, and it leans harder the higher they are.
    if (state.tier > 0 || state.stalled >= STALLED_AT) state.sway += (state.sway === 0 ? state.lean : Math.sign(state.sway)) * rate(state) * seconds;
    if (Math.abs(state.sway) >= FALL_AT) {
      state.lives -= 1;
      state.falls += 1;
      state.tier = Math.max(0, state.tier - 1);
      state.sway = 0;
      settle(state, FALL_SETTLE_MS);
      events.push({ type: "fall", tier: state.tier });
      if (state.lives <= 0) {
        state.status = "ended";
        events.push({ type: "end" });
      }
    }
    return events;
  },

  hud(state) {
    const leaning = Math.abs(state.sway) >= LEAN_AT;
    const last = state.tier >= potHeight(state);
    const words = { settle: `Tier ${state.tier} of ${potHeight(state)}`, call: "Squat", window: last ? "Leap for the pot" : "Jump" };
    return {
      score: state.score, label: "Score", clock: `Pot ${Math.min(state.pot + 1, state.pots)} of ${state.pots}`, lives: state.lives, maxLives: state.startLives,
      meter: state.phase === "window" ? state.phaseMs / state.windowMs : 0, extra: state.won ? "The pot is broken" : leaning ? "Hands up" : words[state.phase],
      bars: [{ label: "Lean", value: Math.min(1, Math.abs(state.sway)) }],
    };
  },

  result: (state) => ({
    outcome: state.won ? "win" : state.lives <= 0 ? "lose" : "complete",
    score: state.score,
    stats: [
      { label: "Pots broken", value: state.broken },
      { label: "Tiers climbed", value: state.climbed },
      { label: "Clean jumps", value: state.perfects },
      { label: "Falls", value: state.falls },
    ],
  }),

  bot(state, skill) {
    if (state.finaleMs > 0) return null;
    if (Math.abs(state.sway) >= LEAN_AT - 0.1 && state.steadyMs <= 0) return "steady";
    if (state.phase === "window" && 1 - state.phaseMs / state.windowMs >= PERFECT[0] - REACTION_MS[skill] / state.windowMs) return "climb";
    return null;
  },
};
