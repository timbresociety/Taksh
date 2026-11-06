// Dahi Handi: a human tower stands under a pot of curd hung over the street. Jump to climb a tier, and
// each climb sets the tower wobbling: throw both hands up to steady it before the next jump. A jump
// from the top smashes the pot, and each pot hangs a tier higher than the one before.
//
// The two moves take turns, and the screen always says which one is next. A hands up stands the
// tower dead straight, and it stays that way until the next jump, so a player who reads "Jump" late is
// never caught out by a wobble that came back on its own. A jump while the tower wobbles climbs
// nothing and costs nothing, because the call already said hands up. A wobble left alone grows until
// the tower falls, which drops the climber a tier and costs a life.
import { createRandom } from "./shared.js";

export const STEADY_BELOW = 0.3; // the crew lets the climber up only while the tower stands this straight
export const LEAN_AT = 0.7; // where the crowd starts shouting, a full warning before the tower goes
const FALL_AT = 1;
const SHOVE = 0.38; // every climb sets the tower wobbling past the steady line, so a hands up comes between jumps
const SHOVE_PER_TIER = 0.02;
const STEADY_MS = 350; // arms cannot go up again any sooner
const FALL_SETTLE_MS = 1800;
const BETWEEN_POTS_MS = 2600;
const FINALE_MS = 3200;
const SAVE_POINTS = 50;

export const potHeight = (state) => state.tiers + state.pot; // tiers under this pot
export const wobbling = (state) => Math.abs(state.sway) >= STEADY_BELOW;
export const atTop = (state) => state.tier >= potHeight(state);
const rate = (state) => state.swayRate * (0.7 + (0.5 * state.tier) / potHeight(state));
const secondsLeft = (state) => Math.max(0, Math.ceil((state.durationMs - state.t) / 1000));

function smash(state, events) {
  state.broken += 1;
  state.score += 1000 + state.lives * 200 + secondsLeft(state) * 10;
  state.sway = 0;
  events.push({ type: "smash", pot: state.pot, last: state.broken >= state.pots });
  if (state.broken >= state.pots) {
    state.won = true;
    state.finaleMs = FINALE_MS;
    return;
  }
  state.pot += 1;
  state.tier = 0;
  state.phase = "between";
  state.phaseMs = BETWEEN_POTS_MS;
}

export default {
  id: "handi",
  name: "Dahi Handi",
  pitch: "Jump to climb the human tower, throw both hands up to steady it when it wobbles, and jump from the top to smash the pot.",
  kind: "Whole body",
  space: "Needs space",
  length: "90 s",
  framing: "full",
  score: "pots",
  actions: [
    { id: "climb", label: "Climb", key: " ", keyLabel: "Space" },
    { id: "steady", label: "Steady the tower", key: "h", keyLabel: "H" },
  ],
  // A squat jump never fired on real movement and a flap fired with every hands up, so the tower asks
  // for the two moves a laptop camera reads best, one for the legs and one for the arms.
  bindings: [
    { gesture: "jump", action: "climb", exercise: "Jump", demo: "jump" },
    { gesture: "hands_up", action: "steady", exercise: "Both hands up", demo: "hands_up" },
  ],
  tuning: {
    pots: { label: "Pots to break", unit: "", min: 1, max: 5, default: 3, higherIsHarder: true, whole: true },
    tiers: { label: "Tiers under the first pot", unit: "", min: 2, max: 5, default: 3, higherIsHarder: true, whole: true },
    durationS: { label: "Round length", unit: "s", min: 45, max: 180, default: 90, higherIsHarder: false, whole: true },
    swayRate: { label: "How fast the tower wobbles", unit: "", min: 0.06, max: 0.25, default: 0.14, higherIsHarder: true },
    lives: { label: "Falls before the tower gives up", unit: "", min: 1, max: 5, default: 3, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { pots, tiers, durationS, swayRate, lives } = spec.tuning;
    return {
      status: "playing", t: 0, rng: createRandom(spec.seed), pots, tiers, durationMs: durationS * 1000, swayRate, lives, startLives: lives,
      pot: 0, tier: 0, phase: "climb", phaseMs: 0, sway: 0, steadyMs: 0, finaleMs: 0, won: false,
      climbed: 0, shaky: 0, saves: 0, falls: 0, steadied: 0, broken: 0, score: 0,
    };
  },

  act(state, action) {
    if (state.finaleMs > 0 || state.phase !== "climb") return [];
    if (action === "steady") {
      if (state.steadyMs > 0) return [];
      state.steadyMs = STEADY_MS;
      state.steadied += 1;
      const close = Math.abs(state.sway) >= LEAN_AT;
      if (close) {
        state.saves += 1;
        state.score += SAVE_POINTS;
      }
      const needed = wobbling(state);
      state.sway = 0;
      return [{ type: "clear", close, needed }];
    }
    if (action !== "climb") return [];
    if (wobbling(state)) {
      state.shaky += 1;
      return [{ type: "shaky" }];
    }
    const events = [];
    if (atTop(state)) {
      events.push({ type: "leap", tier: state.tier });
      smash(state, events);
      return events;
    }
    state.tier += 1;
    state.climbed += 1;
    state.score += 100 * state.tier;
    // A climb never shoves the tower as far as the shout, so the shout always means the player waited.
    const lean = state.rng.next() < 0.5 ? -1 : 1;
    state.sway = lean * Math.min(LEAN_AT - 0.1, SHOVE + SHOVE_PER_TIER * state.tier);
    events.push({ type: "climb", tier: state.tier, top: atTop(state) });
    return events;
  },

  step(state, dtMs) {
    const events = [];
    const seconds = dtMs / 1000;
    state.t += dtMs;
    state.steadyMs = Math.max(0, state.steadyMs - dtMs);

    // The last pot's celebration plays out in full, whatever the clock says.
    if (state.finaleMs > 0) {
      state.sway *= Math.exp(-3 * seconds);
      state.finaleMs -= dtMs;
      if (state.finaleMs <= 0) {
        state.status = "ended";
        events.push({ type: "end" });
      }
      return events;
    }

    if (state.t >= state.durationMs) {
      state.status = "ended";
      events.push({ type: "timeout" }, { type: "end" });
      return events;
    }

    if (state.phase !== "climb") {
      state.phaseMs -= dtMs;
      if (state.phaseMs <= 0) {
        state.phase = "climb";
        events.push({ type: "ready", tier: state.tier });
      }
      return events;
    }

    // Only a climb sets the tower wobbling, and it wobbles faster the higher the climber is.
    if (state.tier > 0 && state.sway !== 0) state.sway += Math.sign(state.sway) * rate(state) * seconds;
    if (Math.abs(state.sway) >= FALL_AT) {
      state.lives -= 1;
      state.falls += 1;
      state.tier = Math.max(0, state.tier - 1);
      state.sway = 0;
      state.phase = "fallen";
      state.phaseMs = FALL_SETTLE_MS;
      events.push({ type: "fall", tier: state.tier });
      if (state.lives <= 0) {
        state.status = "ended";
        events.push({ type: "end" });
      }
    }
    return events;
  },

  hud(state) {
    const height = potHeight(state);
    let call = "Jump to climb";
    if (state.won) call = "You did it!";
    else if (state.phase === "between") call = "Pot smashed!";
    else if (state.phase === "fallen") call = "Tower fell. Regroup";
    else if (Math.abs(state.sway) >= LEAN_AT) call = "Hands up now!";
    else if (wobbling(state)) call = "Hands up to steady";
    else if (atTop(state)) call = "Jump to smash the pot";
    return {
      score: state.score, label: "Score", lives: state.lives, maxLives: state.startLives,
      clock: `Pot ${Math.min(state.pot + 1, state.pots)}/${state.pots} · ${secondsLeft(state)}s`,
      extra: call,
      bars: [
        { label: `Climb ${Math.min(state.tier, height)} of ${height}`, value: Math.min(1, state.tier / height) },
        { label: "Wobble", value: Math.min(1, Math.abs(state.sway)) },
      ],
    };
  },

  result: (state) => ({
    outcome: state.won ? "win" : state.lives <= 0 ? "lose" : "complete",
    score: state.score,
    stats: [
      { label: "Pots smashed", value: state.broken },
      { label: "Tiers climbed", value: state.climbed },
      { label: "Last-second saves", value: state.saves },
      { label: "Falls", value: state.falls },
    ],
  }),

  // Does what the call says: hands up while the tower wobbles, and a jump once it stands straight.
  bot(state) {
    if (state.finaleMs > 0 || state.phase !== "climb") return null;
    if (wobbling(state)) return state.steadyMs <= 0 ? "steady" : null;
    return "climb";
  },
};
