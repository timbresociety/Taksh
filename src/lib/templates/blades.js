// Blade March: raiders close in from four sides. Slash the ones at your sides, jump at the ones above and
// duck under the ones below, guard the heavy blows, and march on to a boss at the end of the road.
import { BOSS_TUNING, bossCall, bossHealthLeft, bossWants, createBoss, defendBoss, hitBoss, stepBoss } from "./bosses.js";
import { REACTION_MS, STRIKE_CALLS, createRandom, strikeActions, strikeBindings } from "./shared.js";

export const SIDES = ["left", "right", "up", "down"];
export const REACH_MS = 1000; // the last stretch of an approach, when a raider is close enough to cut
export const GUARD_MS = 700;
const MARCH_MS = 2200;
const INVINCIBLE_MS = 700;
const FINALE_MS = 2600; // the boss gets to fall before the round ends
const FIRST_WAVE = 4;

// A part of the figure counts as whichever edge it sits nearest.
const sideOf = (x, y) => (Math.abs(x) >= Math.abs(y) ? (x < 0 ? "left" : "right") : y > 0 ? "up" : "down");

function spawn(state) {
  const { rng } = state;
  const free = SIDES.filter((side) => !state.enemies.some((enemy) => enemy.side === side));
  if (!free.length) return false;
  const side = rng.pick(free);
  const heavy = state.wave > 1 && rng.next() < 0.22;
  state.enemies.push({ id: state.nextId++, side, heavy, kind: heavy ? "heavy" : "raider", ms: 0, arriveMs: state.approachMs + (heavy ? 500 : 0) });
  state.waveLeft -= 1;
  return true;
}

function hurt(state, events, cause) {
  if (state.invincibleMs > 0) return;
  state.lives -= 1;
  state.hurt += 1;
  state.combo = 0;
  state.invincibleMs = INVINCIBLE_MS;
  events.push({ type: "hurt", cause });
}

function bossEvents(state, list, events) {
  for (const event of list) {
    if (event.type === "boss_strike") hurt(state, events, event.kind);
    if (event.type === "boss_hit") state.score += 60;
    if (event.type === "boss_part") state.score += 300;
    if (event.type === "boss_parry" || event.type === "boss_blocked") state.score += 120;
    if (event.type === "boss_down") {
      state.score += 2000 + state.lives * 300;
      state.won = true;
      state.finaleMs = FINALE_MS;
    }
    events.push(event);
  }
}

export default {
  id: "blades",
  name: "Blade March",
  pitch: "Slash the raiders at your sides, jump at the ones above, duck the ones below, guard the heavy blows, and bring down the boss.",
  kind: "Arms",
  space: "Stand up",
  length: "2 min",
  framing: "full", // a jump needs the feet in view
  rival: true,
  score: "raiders",
  actions: [
    ...strikeActions(),
    { id: "guard", label: "Guard", key: " ", keyLabel: "Space" },
  ],
  bindings: [
    ...strikeBindings(),
    { gesture: "guard", action: "guard", exercise: "Guard up" },
  ],
  tuning: {
    waves: { label: "Waves before the boss", unit: "", min: 1, max: 8, default: 3, higherIsHarder: true, whole: true },
    approachMs: { label: "Time a raider takes to reach you", unit: "ms", min: 1500, max: 4000, default: 2600, higherIsHarder: false, whole: true },
    gapMs: { label: "Time between raiders", unit: "ms", min: 500, max: 2500, default: 1200, higherIsHarder: false, whole: true },
    lives: { label: "Lives", unit: "", min: 1, max: 6, default: 4, higherIsHarder: false, whole: true },
    ...BOSS_TUNING,
  },

  create(spec) {
    const { waves, approachMs, gapMs, lives, boss, bossHealth, bossWarnMs } = spec.tuning;
    return {
      status: "playing", t: 0, stage: "march", wave: 1, waves, waveLeft: FIRST_WAVE, approachMs, gapMs, lives, startLives: lives, rng: createRandom(spec.seed),
      bossNumber: boss, bossHealth, bossWarnMs, boss: null, enemies: [], nextId: 1, nextMs: 1200, marchMs: 0, distance: 0, guardMs: 0, invincibleMs: 0, finaleMs: 0, won: false,
      cut: 0, blocked: 0, hurt: 0, swings: 0, combo: 0, best: 0, score: 0,
    };
  },

  act(state, action) {
    if (state.finaleMs > 0) return [];
    if (action === "guard") {
      state.guardMs = GUARD_MS;
      if (state.boss) defendBoss(state.boss);
      return [{ type: "guard" }];
    }
    const side = action.replace("slash_", "");
    if (!SIDES.includes(side)) return [];
    state.swings += 1;
    const events = [{ type: "slash", side }];
    if (state.boss) {
      bossEvents(state, hitBoss(state.boss, side), events);
      return events;
    }
    const target = state.enemies.find((enemy) => enemy.side === side && enemy.arriveMs - enemy.ms <= REACH_MS);
    if (!target) return events;
    if (target.heavy) {
      events.push({ type: "clang", side });
      return events;
    }
    state.enemies = state.enemies.filter((enemy) => enemy !== target);
    state.cut += 1;
    state.combo += 1;
    state.best = Math.max(state.best, state.combo);
    state.score += Math.round(100 * (1 + Math.min(state.combo, 15) * 0.1));
    events.push({ type: "cut", side, id: target.id });
    return events;
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;
    state.guardMs = Math.max(0, state.guardMs - dtMs);
    state.invincibleMs = Math.max(0, state.invincibleMs - dtMs);

    if (state.finaleMs > 0) {
      state.finaleMs -= dtMs;
      if (state.finaleMs <= 0) {
        state.status = "ended";
        events.push({ type: "end" });
      }
      return events;
    }

    if (state.stage === "march") {
      if (state.marchMs > 0) {
        state.marchMs -= dtMs;
        state.distance += dtMs * 0.004;
        if (state.marchMs <= 0) {
          if (state.wave >= state.waves) {
            state.stage = "boss";
            state.boss = createBoss(state.bossNumber, { health: state.bossHealth, warnMs: state.bossWarnMs, slots: SIDES, slotFor: sideOf, rng: state.rng });
            events.push({ type: "boss_enter", id: state.boss.id });
          } else {
            state.wave += 1;
            state.waveLeft = FIRST_WAVE + state.wave - 1;
            state.nextMs = 500;
            events.push({ type: "wave", wave: state.wave });
          }
        }
      } else {
        state.nextMs -= dtMs;
        if (state.waveLeft > 0 && state.nextMs <= 0 && spawn(state)) {
          state.nextMs = state.gapMs;
          events.push({ type: "raider", side: state.enemies.at(-1).side, heavy: state.enemies.at(-1).heavy });
        }
        for (const enemy of state.enemies) enemy.ms += dtMs;
        for (const enemy of state.enemies.filter((item) => item.ms >= item.arriveMs)) {
          if (enemy.heavy && state.guardMs > 0) {
            state.blocked += 1;
            state.score += 200;
            events.push({ type: "blocked", side: enemy.side, id: enemy.id });
          } else {
            events.push({ type: "struck", side: enemy.side, id: enemy.id, heavy: enemy.heavy });
            hurt(state, events, "raider");
          }
        }
        state.enemies = state.enemies.filter((enemy) => enemy.ms < enemy.arriveMs);
        if (state.waveLeft <= 0 && !state.enemies.length) {
          state.marchMs = MARCH_MS;
          events.push({ type: "march" });
        }
      }
    } else {
      bossEvents(state, stepBoss(state.boss, dtMs), events);
    }

    if (state.lives <= 0) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud(state) {
    const inReach = state.enemies.filter((enemy) => enemy.arriveMs - enemy.ms <= REACH_MS).sort((a, b) => a.arriveMs - a.ms - (b.arriveMs - b.ms))[0];
    const say = { defend: "Guard", strike: (side) => STRIKE_CALLS[side], sleeping: (side) => STRIKE_CALLS[side] };
    return {
      score: state.score, label: "Score", lives: state.lives, maxLives: state.startLives,
      clock: state.boss ? state.boss.name : `Wave ${state.wave} of ${state.waves}`,
      bars: state.boss ? [{ label: state.boss.name, value: bossHealthLeft(state.boss) }] : undefined,
      extra: state.boss ? bossCall(state.boss, say) : inReach ? (inReach.heavy ? "Guard" : STRIKE_CALLS[inReach.side]) : state.combo > 1 ? `${state.combo} in a row` : null,
    };
  },

  result: (state) => ({
    outcome: state.won ? "win" : state.lives <= 0 ? "lose" : "complete",
    score: state.score,
    stats: [
      { label: "Raiders cut", value: state.cut },
      { label: "Heavy blows blocked", value: state.blocked },
      { label: "Hits taken", value: state.hurt },
      { label: "Best run", value: state.best },
    ],
  }),

  bot(state, skill) {
    if (state.boss) {
      const wanted = bossWants(state.boss, skill);
      return wanted === "defend" ? "guard" : wanted && `slash_${wanted}`;
    }
    const left = (enemy) => enemy.arriveMs - enemy.ms;
    const heavy = state.enemies.find((enemy) => enemy.heavy && left(enemy) <= REACTION_MS[skill] + GUARD_MS * 0.5);
    if (heavy) return "guard";
    const raider = state.enemies.filter((enemy) => !enemy.heavy && left(enemy) <= REACH_MS).sort((a, b) => left(a) - left(b))[0];
    return raider ? `slash_${raider.side}` : null;
  },
};
