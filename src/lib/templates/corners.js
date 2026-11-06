// Four Corners: the screen has four quadrants, and each limb fires into one. Every shot finds the enemy
// in its corner by itself. Both hands up throws a grenade, and a jump clears what rolls at you.
import { BOSS_TUNING, bossCall, bossHealthLeft, bossWants, createBoss, defendBoss, hitBoss, stepBoss } from "./bosses.js";
import { REACTION_MS, createRandom } from "./shared.js";

export const QUADRANTS = ["tl", "tr", "bl", "br"];
export const JUMP_MS = 720;
export const ROLL_MS = 2800;
const INVINCIBLE_MS = 700;
const FINALE_MS = 2600;
const GRENADE_DAMAGE = 3;
const QUADRANT_NAMES = { tl: "top left", tr: "top right", bl: "bottom left", br: "bottom right" };

const quadrantOf = (x, y) => `${y >= 0 ? "t" : "b"}${x < 0 ? "l" : "r"}`;

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

function spawn(state) {
  const free = QUADRANTS.filter((quadrant) => !state.enemies.some((enemy) => enemy.quadrant === quadrant));
  if (!free.length) return false;
  const quadrant = state.rng.pick(free);
  state.enemies.push({ id: state.nextId++, quadrant, ms: 0, lifeMs: state.windowMs });
  state.toSpawn -= 1;
  return true;
}

export default {
  id: "corners",
  name: "Four Corners",
  pitch: "Raise a hand or lift a leg to shoot into that corner, throw both hands up for a grenade, and jump what rolls at you.",
  kind: "Whole body",
  space: "Stand back",
  length: "2 min",
  framing: "full",
  rival: true,
  score: "enemies",
  actions: [
    { id: "shoot_tl", label: "Top left", key: "q", keyLabel: "Q" },
    { id: "shoot_tr", label: "Top right", key: "e", keyLabel: "E" },
    { id: "shoot_bl", label: "Bottom left", key: "z", keyLabel: "Z" },
    { id: "shoot_br", label: "Bottom right", key: "c", keyLabel: "C" },
    { id: "grenade", label: "Grenade", key: "g", keyLabel: "G" },
    { id: "jump", label: "Jump", key: " ", keyLabel: "Space" },
  ],
  bindings: [
    { gesture: "reach_up_left", action: "shoot_tl", exercise: "Left hand reach" },
    { gesture: "reach_up_right", action: "shoot_tr", exercise: "Right hand reach" },
    { gesture: "lift_left", action: "shoot_bl", exercise: "Left leg lift" },
    { gesture: "lift_right", action: "shoot_br", exercise: "Right leg lift" },
    { gesture: "hands_up", action: "grenade", exercise: "Both hands up" },
    { gesture: "jump", action: "jump", exercise: "Jump" },
  ],
  tuning: {
    enemies: { label: "Enemies before the boss", unit: "", min: 6, max: 40, default: 16, higherIsHarder: true, whole: true },
    windowMs: { label: "Time before an enemy fires", unit: "ms", min: 1400, max: 4500, default: 2600, higherIsHarder: false, whole: true },
    gapMs: { label: "Time between enemies", unit: "ms", min: 500, max: 2200, default: 1100, higherIsHarder: false, whole: true },
    rollMs: { label: "Time between rolling obstacles", unit: "ms", min: 4000, max: 14000, default: 7000, higherIsHarder: false, whole: true },
    grenades: { label: "Grenades", unit: "", min: 1, max: 5, default: 2, higherIsHarder: false, whole: true },
    lives: { label: "Lives", unit: "", min: 1, max: 6, default: 4, higherIsHarder: false, whole: true },
    ...BOSS_TUNING,
    boss: { ...BOSS_TUNING.boss, default: 3 },
  },

  create(spec) {
    const { enemies, windowMs, gapMs, rollMs, grenades, lives, boss, bossHealth, bossWarnMs } = spec.tuning;
    return {
      status: "playing", t: 0, stage: "corners", toSpawn: enemies, total: enemies, windowMs, gapMs, rollMs, grenades, startGrenades: grenades, lives, startLives: lives, rng: createRandom(spec.seed),
      bossNumber: boss, bossHealth, bossWarnMs, boss: null, enemies: [], rolls: [], nextId: 1, nextMs: 1200, nextRollMs: rollMs * 0.6, jumpMs: 0, invincibleMs: 0, introMs: 0, finaleMs: 0, won: false,
      downed: 0, cleared: 0, wasted: 0, hurt: 0, thrown: 0, combo: 0, best: 0, score: 0,
    };
  },

  act(state, action) {
    if (state.finaleMs > 0) return [];
    if (action === "jump") {
      state.jumpMs = JUMP_MS;
      if (state.boss) defendBoss(state.boss);
      return [{ type: "jump" }];
    }
    if (action === "grenade") {
      if (state.grenades <= 0) {
        state.wasted += 1;
        return [{ type: "empty" }];
      }
      state.grenades -= 1;
      state.thrown += 1;
      const events = [{ type: "grenade", hit: state.enemies.map((enemy) => enemy.quadrant) }];
      state.downed += state.enemies.length;
      state.score += state.enemies.length * 80;
      state.enemies = [];
      if (state.boss) bossEvents(state, hitBoss(state.boss, null, { force: true, damage: GRENADE_DAMAGE }), events);
      return events;
    }
    const quadrant = action.replace("shoot_", "");
    if (!QUADRANTS.includes(quadrant)) return [];
    const events = [{ type: "shot", quadrant }];
    if (state.boss) {
      bossEvents(state, hitBoss(state.boss, quadrant), events);
      return events;
    }
    const enemy = state.enemies.find((item) => item.quadrant === quadrant);
    if (!enemy) {
      state.wasted += 1;
      state.combo = 0;
      return events;
    }
    state.enemies = state.enemies.filter((item) => item !== enemy);
    state.downed += 1;
    state.combo += 1;
    state.best = Math.max(state.best, state.combo);
    state.score += Math.round((60 + 60 * (1 - enemy.ms / enemy.lifeMs)) * (1 + Math.min(state.combo, 15) * 0.1));
    events.push({ type: "hit", quadrant, id: enemy.id });
    return events;
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;
    state.jumpMs = Math.max(0, state.jumpMs - dtMs);
    state.invincibleMs = Math.max(0, state.invincibleMs - dtMs);

    if (state.finaleMs > 0) {
      state.finaleMs -= dtMs;
      if (state.finaleMs <= 0) {
        state.status = "ended";
        events.push({ type: "end" });
      }
      return events;
    }

    if (state.stage === "corners") {
      state.nextMs -= dtMs;
      if (state.toSpawn > 0 && state.nextMs <= 0 && spawn(state)) {
        state.nextMs = state.gapMs * state.rng.range(0.8, 1.2);
        events.push({ type: "enemy", quadrant: state.enemies.at(-1).quadrant });
      }
      state.nextRollMs -= dtMs;
      if (state.toSpawn > 0 && state.nextRollMs <= 0) {
        state.nextRollMs = state.rollMs;
        state.rolls.push({ id: state.nextId++, ms: 0, arriveMs: ROLL_MS });
        events.push({ type: "roll" });
      }
      for (const enemy of state.enemies) enemy.ms += dtMs;
      for (const enemy of state.enemies.filter((item) => item.ms >= item.lifeMs)) {
        events.push({ type: "fire", quadrant: enemy.quadrant, id: enemy.id });
        hurt(state, events, "enemy");
      }
      state.enemies = state.enemies.filter((enemy) => enemy.ms < enemy.lifeMs);
      for (const roll of state.rolls) roll.ms += dtMs;
      for (const roll of state.rolls.filter((item) => item.ms >= item.arriveMs)) {
        if (state.jumpMs > 0) {
          state.cleared += 1;
          state.score += 100;
          events.push({ type: "clear" });
        } else hurt(state, events, "roll");
      }
      state.rolls = state.rolls.filter((roll) => roll.ms < roll.arriveMs);
      if (state.toSpawn <= 0 && !state.enemies.length && !state.rolls.length) {
        state.stage = "boss";
        state.boss = createBoss(state.bossNumber, { health: state.bossHealth, warnMs: state.bossWarnMs, slots: QUADRANTS, slotFor: quadrantOf, rng: state.rng });
        events.push({ type: "boss_enter", id: state.boss.id });
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
    const say = { defend: "Jump", strike: (quadrant) => `Shoot ${QUADRANT_NAMES[quadrant]}`, sleeping: (quadrant) => `Shoot ${QUADRANT_NAMES[quadrant]}` };
    const roll = state.rolls.find((item) => item.arriveMs - item.ms < 1200);
    return {
      score: state.score, label: "Score", lives: state.lives, maxLives: state.startLives,
      clock: state.boss ? state.boss.name : `${state.toSpawn + state.enemies.length} left`,
      bars: state.boss ? [{ label: state.boss.name, value: bossHealthLeft(state.boss) }] : undefined,
      extra: state.boss ? bossCall(state.boss, say) : roll ? "Jump" : `Grenades: ${state.grenades}`,
    };
  },

  result: (state) => ({
    outcome: state.won ? "win" : state.lives <= 0 ? "lose" : "complete",
    score: state.score,
    stats: [
      { label: "Enemies down", value: state.downed },
      { label: "Jumped", value: state.cleared },
      { label: "Grenades thrown", value: state.thrown },
      { label: "Hits taken", value: state.hurt },
    ],
  }),

  bot(state, skill) {
    const roll = state.rolls.find((item) => item.arriveMs - item.ms <= REACTION_MS[skill] + JUMP_MS * 0.5);
    if (roll) return "jump";
    if (state.boss) {
      const wanted = bossWants(state.boss, skill);
      return wanted === "defend" ? "jump" : wanted && `shoot_${wanted}`;
    }
    if (state.enemies.length >= 3 && state.grenades > 0) return "grenade";
    const oldest = [...state.enemies].sort((a, b) => b.ms - a.ms)[0];
    return oldest ? `shoot_${oldest.quadrant}` : null;
  },
};
