// Counter Bout: slip or duck the rival's telegraphed shots, then punch while they are open.
import { REACTION_MS, createRandom } from "./shared.js";

const ATTACKS = { left: "slip_right", right: "slip_left", high: "duck" };
const OPEN_MS = 1100;
const DOWN_MS = 2600;
const KNOCKDOWNS_TO_WIN = 3;

export default {
  id: "bout",
  name: "Counter Bout",
  pitch: "Lean and duck under the rival's shots, then land your own.",
  kind: "Arms",
  space: "Stand up",
  length: "60 s",
  framing: "upper",
  rival: true,
  score: "landed",
  actions: [
    { id: "jab", label: "Jab", key: "j", keyLabel: "J" },
    { id: "cross", label: "Cross", key: "k", keyLabel: "K" },
    { id: "slip_left", label: "Slip left", key: "a", keyLabel: "A" },
    { id: "slip_right", label: "Slip right", key: "d", keyLabel: "D" },
    { id: "duck", label: "Duck", key: "s", keyLabel: "S" },
    { id: "block", label: "Block", key: " ", keyLabel: "Space" },
  ],
  bindings: [
    { gesture: "punch_left", action: "jab", exercise: "Jab" },
    { gesture: "punch_right", action: "cross", exercise: "Cross" },
    { gesture: "hook_left", action: "jab", exercise: "Hook" },
    { gesture: "hook_right", action: "cross", exercise: "Hook" },
    { gesture: "lean_left", action: "slip_left", exercise: "Side lean" },
    { gesture: "lean_right", action: "slip_right", exercise: "Side lean" },
    { gesture: "squat_down", action: "duck", exercise: "Squat" },
    { gesture: "guard", action: "block", exercise: "Guard up" },
  ],
  tuning: {
    durationS: { label: "Round length", unit: "s", min: 20, max: 120, default: 60, higherIsHarder: false, whole: true },
    warningMs: { label: "Warning before a shot", unit: "ms", min: 500, max: 2000, default: 1100, higherIsHarder: false, whole: true },
    restMs: { label: "Time between shots", unit: "ms", min: 400, max: 2500, default: 1200, higherIsHarder: false, whole: true },
    rivalHealth: { label: "Rival health", unit: "", min: 40, max: 200, default: 150, higherIsHarder: true, whole: true },
  },

  create(spec) {
    const { durationS, warningMs, restMs, rivalHealth } = spec.tuning;
    return {
      status: "playing", t: 0, durationMs: durationS * 1000, warningMs, restMs, rivalHealth, rivalMax: rivalHealth, health: 100, rng: createRandom(spec.seed),
      attack: null, restLeft: 1400, openMs: 0, defence: null, defenceMs: 0, landed: 0, dodged: 0, hurt: 0, knockdowns: 0, score: 0, downMs: 0,
    };
  },

  act(state, action) {
    if (state.downMs > 0) return [];
    if (action === "jab" || action === "cross") {
      const events = [{ type: "throw", punch: action }];
      if (state.openMs <= 0) return events;
      const damage = action === "cross" ? 10 : 7;
      state.rivalHealth -= damage;
      state.landed += 1;
      state.score += damage * 10;
      events.push({ type: "land", punch: action });
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
    // A move made against a shot in the air holds until that shot lands, so reading it early pays.
    state.defence = action;
    state.defenceMs = state.attack ? state.attack.windupMs - state.attack.ms + 200 : 500;
    return [{ type: "defend", move: action }];
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;
    state.openMs = Math.max(0, state.openMs - dtMs);
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
        if (state.defence === wanted) {
          state.dodged += 1;
          state.score += 50;
          state.openMs = OPEN_MS;
          events.push({ type: "dodge" });
        } else if (state.defence === "block") {
          state.health -= 4;
          events.push({ type: "blocked" });
        } else {
          state.health -= 15;
          state.hurt += 1;
          events.push({ type: "hurt" });
        }
        state.attack = null;
        state.restLeft = state.restMs;
      }
    } else if (state.openMs <= 0) {
      state.restLeft -= dtMs;
      if (state.restLeft <= 0) {
        state.attack = { side: state.rng.pick(Object.keys(ATTACKS)), ms: 0, windupMs: state.warningMs };
        events.push({ type: "windup", side: state.attack.side });
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
    extra: state.attack ? { left: "Slip right", right: "Slip left", high: "Duck" }[state.attack.side] : state.openMs > 0 ? "Punch now" : null,
  }),

  result: (state) => ({
    outcome: state.knockdowns >= KNOCKDOWNS_TO_WIN ? "win" : state.health <= 0 ? "lose" : "complete",
    score: state.score,
    stats: [
      { label: "Punches landed", value: state.landed },
      { label: "Knockdowns", value: state.knockdowns },
      { label: "Dodged", value: state.dodged },
      { label: "Hits taken", value: state.hurt },
    ],
  }),

  bot(state, skill) {
    if (state.attack) {
      const left = state.attack.windupMs - state.attack.ms;
      return left < REACTION_MS[skill] + 200 ? ATTACKS[state.attack.side] : null;
    }
    return state.openMs > 250 ? "cross" : null;
  },
};
