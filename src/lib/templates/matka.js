// Matka Beats: painted clay pots swing in on a dhol beat. Slash the side pots, jump for the high ones and
// duck for the low ones, on the beat.
import { REACTION_MS, STRIKE_CALLS, STRIKE_GESTURES, createRandom, moveCue, strikeActions, strikeBindings } from "./shared.js";

export const DIRS = ["left", "right", "up", "down"];
const MIRROR = { left: "right", right: "left", up: "down", down: "up" };
const MIN_GAP_MS = 460; // a slash and its way back are one movement, so the next pot waits
const SAME_GAP_MS = 640; // the same slash twice needs the hand to come all the way back
const BODY_GAP_MS = 900; // a jump or a duck needs time to land or stand back up
const BODY_LATE_MS = 200; // the body is read once the hips have moved, a little after the beat was meant
const PERFECT_SHARE = 0.45;
const SLOTS_PER_BAR = 8; // half beats

// Rhythm cells over one bar. The second is the 3+3+2 the dhol itself plays.
const EASY_CELLS = ["x...x...", "x.x.x...", "x...x.x."];
const FULL_CELLS = ["x.x.x.x.", "x..x..x.", "x.x...x.", "x..x.x.."];
const MOTIFS = [["left", "right"], ["up", "down"], ["left", "up", "right", "down"], ["right", "left", "up"], ["left", "left", "right", "right"], ["up", "left", "up", "right"]];

const barMs = (bpm) => (60000 / bpm) * 4;
const BODY = new Set(["up", "down"]);
const lateBy = (pot, windowMs) => windowMs + (BODY.has(pot.dir) ? BODY_LATE_MS : 0);

// Each phrase is four bars: a statement, its mirror, the statement again, and a sparser answer. A
// player learns the pattern in the first bar and is rewarded for it, which random pots never allow.
export function buildChart(rng, { bpm, durationMs, leadMs }) {
  const slotMs = barMs(bpm) / SLOTS_PER_BAR;
  const pots = [];
  let bar = 0;
  let phrase = 0;
  const lastAt = durationMs - barMs(bpm);
  while (leadMs + bar * barMs(bpm) < lastAt) {
    const cell = rng.pick(phrase < 2 ? EASY_CELLS : FULL_CELLS);
    const motif = rng.pick(MOTIFS);
    const answer = rng.pick(EASY_CELLS);
    const plan = [[cell, motif], [cell, motif.map((dir) => MIRROR[dir])], [cell, motif], [answer, [...motif].reverse()]];
    for (const [pattern, dirs] of plan) {
      let step = 0;
      for (let slot = 0; slot < SLOTS_PER_BAR; slot += 1) {
        if (pattern[slot] !== "x") continue;
        const at = Math.round(leadMs + bar * barMs(bpm) + slot * slotMs);
        if (at > lastAt) break;
        const before = pots.at(-1);
        let dir = dirs[step % dirs.length];
        step += 1;
        if (before && at - before.at < MIN_GAP_MS) continue;
        if (before?.dir === dir && at - before.at < SAME_GAP_MS) dir = MIRROR[dir];
        if (before && (BODY.has(dir) || BODY.has(before.dir)) && at - before.at < BODY_GAP_MS) continue;
        pots.push({ id: pots.length + 1, at, dir, kind: dir });
      }
      bar += 1;
    }
    phrase += 1;
  }
  return pots;
}

export default {
  id: "matka",
  name: "Matka Beats",
  pitch: "Slash the clay pots at your sides, jump for the high ones and duck for the low ones, right on the dhol beat.",
  kind: "Arms",
  space: "Stand up",
  length: "60 s",
  framing: "full", // a jump needs the feet in view
  score: "pots",
  actions: strikeActions(),
  bindings: strikeBindings(),
  tuning: {
    durationS: { label: "Song length", unit: "s", min: 30, max: 150, default: 60, higherIsHarder: false, whole: true },
    bpm: { label: "Beats per minute", unit: "bpm", min: 70, max: 130, default: 92, higherIsHarder: true, whole: true },
    approachMs: { label: "Time a pot takes to swing in", unit: "ms", min: 1200, max: 3200, default: 2000, higherIsHarder: false, whole: true },
    windowMs: { label: "Timing allowance", unit: "ms", min: 120, max: 360, default: 240, higherIsHarder: false, whole: true },
  },

  create(spec) {
    const { durationS, bpm, approachMs, windowMs } = spec.tuning;
    const durationMs = durationS * 1000;
    const leadMs = Math.ceil((approachMs + 600) / barMs(bpm)) * barMs(bpm); // the dhol plays a bar or two before the first pot lands
    const chart = buildChart(createRandom(spec.seed), { bpm, durationMs, leadMs });
    return {
      status: "playing", t: 0, durationMs, bpm, approachMs, windowMs, chart, pots: [], next: 0, total: chart.length,
      perfect: 0, good: 0, missed: 0, wrong: 0, swings: 0, combo: 0, best: 0, score: 0,
    };
  },

  act(state, action) {
    const dir = action.replace("slash_", "");
    if (!DIRS.includes(dir)) return [];
    state.swings += 1;
    const near = state.pots.filter((pot) => pot.at - state.t <= state.windowMs && state.t - pot.at <= lateBy(pot, state.windowMs)).sort((a, b) => Math.abs(a.at - state.t) - Math.abs(b.at - state.t));
    if (!near.length) return [{ type: "swing", dir }];
    const pot = near.find((item) => item.dir === dir);
    if (!pot) {
      state.wrong += 1;
      state.combo = 0;
      return [{ type: "wrong", dir }];
    }
    const off = state.t - pot.at;
    const grade = Math.abs(off) <= state.windowMs * PERFECT_SHARE ? "perfect" : "good";
    state[grade] += 1;
    state.combo += 1;
    state.best = Math.max(state.best, state.combo);
    state.score += Math.round((grade === "perfect" ? 100 : 50) * (1 + Math.min(state.combo, 20) * 0.05));
    state.pots = state.pots.filter((item) => item !== pot);
    return [{ type: grade, dir, off, combo: state.combo }];
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;
    while (state.next < state.chart.length && state.chart[state.next].at - state.approachMs <= state.t) {
      state.pots.push(state.chart[state.next]);
      state.next += 1;
    }
    for (const pot of state.pots) {
      if (state.t - pot.at <= lateBy(pot, state.windowMs)) continue;
      state.missed += 1;
      state.combo = 0;
      events.push({ type: "miss", dir: pot.dir });
    }
    state.pots = state.pots.filter((pot) => state.t - pot.at <= lateBy(pot, state.windowMs));
    if (state.t >= state.durationMs) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  // The next pot's move is drawn by the guide as well as on its pot, so a new player learns the four
  // arrows in a bar.
  hud(state) {
    const lead = state.approachMs * 0.6;
    const next = state.pots.filter((pot) => pot.at - state.t <= lead)[0];
    return {
      score: state.score, label: "Score", clock: `${Math.max(0, Math.ceil((state.durationMs - state.t) / 1000))}s`, extra: state.combo > 1 ? `${state.combo} combo` : null,
      cue: next ? moveCue(STRIKE_GESTURES[next.dir], 1 - (next.at - state.t) / lead, STRIKE_CALLS[next.dir]) : null,
    };
  },

  result(state) {
    const landed = state.perfect + state.good;
    return {
      outcome: landed >= state.total * 0.6 ? "win" : "complete",
      score: state.score,
      stats: [
        { label: "Perfect", value: state.perfect },
        { label: "Good", value: state.good },
        { label: "Missed", value: state.missed },
        { label: "Best combo", value: state.best },
      ],
    };
  },

  // Rhythm is anticipated, not reacted to, so a casual player is simply a little late rather than a
  // whole reaction time late.
  bot(state, skill) {
    const pot = state.pots[0];
    if (!pot) return null;
    const lead = skill === "quick" ? REACTION_MS.quick : REACTION_MS.casual - 90;
    return pot.at - state.t <= lead ? `slash_${pot.dir}` : null;
  },
};
