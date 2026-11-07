// Twin Sights: ghouls walk up the road from the distance, and each hand carries an aim circle over its
// own half of the screen. Anything held under the circle of its half is locked and shot by itself. A
// ghoul that reaches the player claws them. Waves come first, then a boss, whose parts are targets too.
// A squat throws a grenade and a jump clears what rolls at you. Raising the hands only moves the sights.
import { BOSS_TUNING, bossCall, bossHealthLeft, bossWants, createBoss, defendBoss, hitBoss, isExposed, stepBoss } from "./bosses.js";
import { SCREEN_RATIO } from "./chop.js";
import { SIDES, aimCursors, handsOnScreen, newCursors, placeCursor, screenGap, settleCursors } from "./cursors.js";
import { REACTION_MS, clamp, createRandom, moveCue } from "./shared.js";

export const JUMP_MS = 720;
export const SIGHT_RADIUS = 0.17; // in half screen heights, about 180 px across on a 1080p screen
// A hand reaches across the body slowly and the tracker mixes up crossed hands, so each hand keeps to
// its own half. They share a thin strip down the middle, where the boss keeps its own head.
export const MIDDLE = 0.08;
// pace is a share of the walk time, size scales the body, chest is the height a sight locks at, in metres
// on a body of size 1, and radius is the least a target is ever drawn, however far away.
export const KINDS = {
  shambler: { radius: 0.08, hp: 1, points: 60, pace: 1, size: 1, chest: 1.12 },
  runner: { radius: 0.08, hp: 1, points: 90, pace: 0.45, size: 0.95, chest: 1.2 },
  brute: { radius: 0.1, hp: 2, points: 140, pace: 1.3, size: 1.35, chest: 1.1 },
};
export const MOST = { runner: 3, brute: 2 }; // the view keeps only so many of each body
export const MAX_UP = 6;
// The road the ghouls walk, in metres: they come out of the distance at FAR_Z and claw at LINE_Z.
// A ghoul keeps to a lane on its own side, drifting in towards the player as it nears.
export const FAR_Z = -14;
export const LINE_Z = 0.2;
const LANES = [2, 2.9, 3.8]; // the parked cars of a street start beyond 5
export const CLOSE_IN = 0.7;
const BODY_RADIUS = 0.42; // how wide a body reads to a sight, in metres
// The camera that watches the waves. The view stands its camera here, so a screen spot worked out
// below is where the body is drawn.
export const CAMERA = { y: 3, z: 7.6, pitch: 0.12, fov: 46 };
const TAN = Math.tan((CAMERA.fov / 2) * (Math.PI / 180));
const QUADRANTS = ["tl", "tr", "bl", "br"];
const ROLL_MS = 2800;
const INVINCIBLE_MS = 700;
const FINALE_MS = 2600;
export const CLAW_MS = 900; // from reaching the player to the claw landing: a last moment to shoot it
export const STAGGER_MS = 650;
const KNOCK_BACK = 0.9;
const GRENADE_DAMAGE = 3;
const FIRST_WAVE = 5;
const WAVE_REST_MS = 1800;
const BOT_WAITS_Z = -3;
const FLICK_REACH = 0.3; // a swipe read from the body finishes what a hand had nearly reached
const VOLLEY_SHARE = 0.6; // a shot in the air is on its way, so it locks sooner
const VOLLEY_SPOTS = { tl: [-0.5, 0.45], tr: [0.5, 0.45], bl: [-0.5, -0.2], br: [0.5, -0.2] };

// Where each boss stands on the field, so a part can be aimed at. The view's cameras are set to match.
export const BOSS_FRAMES = {
  ravana: { cx: 0, cy: 0.14, x: 0.36, y: 0.25 }, // the heads touch: a head is about 0.08 wide on screen
  kumbhakarna: { cx: 0, cy: -0.07, x: 0.33, y: 0.5 },
  serpent: { cx: 0, cy: 0.05, x: 0.62, y: 0.6 },
};

const quadrantOf = (x, y) => `${y >= 0 ? "t" : "b"}${x < 0 ? "l" : "r"}`;

// Where a point on the road lands on the screen, for the camera above.
export function project(x, height, z) {
  const up = height - CAMERA.y;
  const back = z - CAMERA.z;
  const sin = Math.sin(CAMERA.pitch);
  const cos = Math.cos(CAMERA.pitch);
  const depth = -up * sin - back * cos;
  return { x: x / (depth * TAN * SCREEN_RATIO), y: (up * cos - back * sin) / (depth * TAN), depth };
}

// The half of the screen a hand looks after.
export const owns = (side, x) => Math.abs(x) <= MIDDLE || (side === "left" ? x < 0 : x > 0);
export const halfOf = (x) => (x < 0 ? "left" : "right");
// Once both hands have been seen, each keeps to its half for the rest of the game, so a hand the tracker
// drops for a moment can't hand its side to the other. A pointer, or a player using one hand, has the whole screen.
const split = (state) => state.twoHanded;

export function partSpot(boss, part) {
  const frame = BOSS_FRAMES[boss.id];
  return { x: frame.cx + part.x * frame.x, y: frame.cy + part.y * frame.y };
}

export function volleySpot(boss) {
  const { attack } = boss;
  const [x, y] = VOLLEY_SPOTS[attack.slot];
  const p = Math.min(1, (attack.ms / attack.warnMs) * 1.5); // it settles in its corner with time left to hit it
  const { cy } = BOSS_FRAMES[boss.id];
  return { x: x * p, y: cy + (y - cy) * p };
}

// The boss's own head goes last, however the others are taken.
export function partsInReach(boss) {
  const living = boss.parts.filter((part) => part.hp > 0);
  return living.length > 1 ? living.filter((part) => part !== boss.parts.at(-1)) : living;
}

// Everything that can be shot right now, each with the object that holds its lock.
function targetsOf(state) {
  const { boss } = state;
  if (!boss) return state.enemies.map((enemy) => ({ x: enemy.x, y: enemy.y, radius: enemy.radius, holder: enemy, needMs: state.lockMs, enemy }));
  const list = [];
  if (boss.attack?.answer === "strike") list.push({ ...volleySpot(boss), radius: 0.12, holder: boss.attack, needMs: state.lockMs * VOLLEY_SHARE, volley: true });
  if (isExposed(boss)) for (const part of partsInReach(boss)) list.push({ ...partSpot(boss, part), radius: 0.1, holder: part, needMs: state.lockMs, part });
  return list;
}

// What the view rings on screen, with how far along each lock is.
export const marksOf = (state) => targetsOf(state).map(({ x, y, radius, holder, needMs, enemy }) => ({ x, y, radius, lock: Math.min(1, (holder.lockMs ?? 0) / needMs), id: enemy?.id ?? null }));

const covers = (state, side, target) => state.cursors[side].live && (!split(state) || owns(side, target.x)) && screenGap(target, state.cursors[side]) <= SIGHT_RADIUS + target.radius * 0.6;

// The most pressing first: a shot in the air, then whatever is nearest to clawing.
const urgency = (target) => (target.volley ? 1e9 : 0) + (target.enemy ? target.enemy.z * 100 + (target.enemy.kind === "runner" ? 300 : 0) : 0);

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

// A ghoul's place on the screen follows from its place on the road.
function placeOnScreen(enemy) {
  const { size, chest, radius } = KINDS[enemy.kind];
  const at = project(enemy.lane, chest * size, enemy.z);
  const feet = project(enemy.lane, 0, enemy.z);
  Object.assign(enemy, { x: at.x, y: at.y, feetX: feet.x, feetY: feet.y, radius: Math.max(radius, (BODY_RADIUS * size) / (at.depth * TAN)) });
}

function laneAt(enemy) {
  const along = clamp((enemy.z - FAR_Z) / (LINE_Z - FAR_Z), 0, 1);
  return enemy.farLane * (1 - along * (1 - CLOSE_IN));
}

function pickKind(state) {
  const { rng } = state;
  if (state.wave === 1 && state.spawned < 4) return "shambler";
  const alive = (kind) => state.enemies.filter((enemy) => enemy.kind === kind).length;
  const wanted = rng.next() < 0.2 + state.wave * 0.06 ? "brute" : rng.next() < 0.35 ? "runner" : "shambler";
  return alive(wanted) < (MOST[wanted] ?? MAX_UP) ? wanted : "shambler";
}

function spawn(state) {
  const { rng } = state;
  const side = state.spawned % 2 ? 1 : -1; // turn about, so both hands always have work
  const kind = pickKind(state);
  // A lane of its own if one is free, or else the lane whose last ghoul is furthest up the road, so a
  // runner does not catch one up and walk through it.
  const lead = (lane) => Math.min(Infinity, ...state.enemies.filter((enemy) => Math.abs(enemy.farLane - side * lane) < 0.6).map((enemy) => enemy.z - FAR_Z));
  const open = LANES.filter((lane) => lead(lane) === Infinity);
  const lane = open.length ? rng.pick(open) : [...LANES].sort((a, b) => lead(b) - lead(a))[0];
  const farLane = side * (lane + rng.range(-0.2, 0.2));
  const { hp, pace } = KINDS[kind];
  const enemy = {
    id: state.nextId++, kind, hp, maxHp: hp, ms: 0, lockMs: 0, farLane, z: FAR_Z, lane: farLane,
    speed: (LINE_Z - FAR_Z) / ((state.walkMs * pace) / 1000), staggerMs: 0, clawMs: 0,
  };
  placeOnScreen(enemy);
  state.enemies.push(enemy);
  state.spawned += 1;
  state.toSpawn -= 1;
}

function downed(state, enemy, events) {
  state.enemies = state.enemies.filter((item) => item !== enemy);
  state.downed += 1;
  state.combo += 1;
  state.best = Math.max(state.best, state.combo);
  state.score += Math.round(KINDS[enemy.kind].points * (1 + Math.min(state.combo, 15) * 0.1));
  events.push({ type: "downed", id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y });
}

function shoot(state, target, side, events) {
  target.holder.lockMs = 0;
  events.push({ type: "shot", side, x: target.x, y: target.y, id: target.enemy?.id ?? null });
  if (target.volley) {
    bossEvents(state, hitBoss(state.boss, state.boss.attack.slot), events);
    return;
  }
  if (target.part) {
    state.boss.open = target.part.id;
    bossEvents(state, hitBoss(state.boss, target.part.slot), events);
    return;
  }
  const { enemy } = target;
  enemy.hp -= 1;
  if (enemy.hp > 0) {
    enemy.staggerMs = STAGGER_MS;
    enemy.clawMs = 0;
    events.push({ type: "hit", id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y });
    return;
  }
  downed(state, enemy, events);
}

// Anything under a circle locks, faster under two, and slips back when the circle leaves it. Ravana's
// heads sit side by side, so a circle over two of them locks only the one nearest its middle.
function holdLocks(state, dtMs, events) {
  const targets = targetsOf(state);
  const aimedPart = Object.fromEntries(SIDES.map((side) => {
    const covered = targets.filter((target) => target.part && covers(state, side, target));
    const gap = (target) => screenGap(target, state.cursors[side]);
    return [side, covered.sort((a, b) => gap(a) - gap(b))[0] ?? null];
  }));
  for (const target of targets) {
    const under = SIDES.filter((side) => covers(state, side, target) && (!target.part || aimedPart[side] === target));
    const { holder } = target;
    holder.lockMs = under.length ? (holder.lockMs ?? 0) + dtMs * under.length : Math.max(0, (holder.lockMs ?? 0) - dtMs * 2);
    if (holder.lockMs < target.needMs) continue;
    if (target.part && state.boss.blowMs > 0) continue; // a part can only take so many blows, so the lock waits
    shoot(state, target, under[0] ?? halfOf(target.x), events);
    if (state.boss?.mood === "fallen") return;
  }
}

function moveEnemies(state, dtMs, events) {
  const dt = dtMs / 1000;
  for (const enemy of state.enemies) {
    enemy.ms += dtMs;
    if (enemy.staggerMs > 0) {
      enemy.staggerMs -= dtMs;
      enemy.z = Math.max(FAR_Z, enemy.z - (KNOCK_BACK * dtMs) / STAGGER_MS);
    } else if (enemy.z < LINE_Z) enemy.z = Math.min(LINE_Z, enemy.z + enemy.speed * dt);
    else enemy.clawMs += dtMs;
    enemy.lane = laneAt(enemy);
    placeOnScreen(enemy);
  }
  for (const enemy of state.enemies.filter((item) => item.clawMs >= CLAW_MS)) {
    events.push({ type: "claw", id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y });
    hurt(state, events, "claw");
  }
  state.enemies = state.enemies.filter((enemy) => enemy.clawMs < CLAW_MS);
}

// A keyed sight rides on the ghoul it was sent to, since keys can't follow one up the road.
function followKeyed(state) {
  for (const side of SIDES) {
    const cursor = state.cursors[side];
    const enemy = cursor.keyed && state.enemies.find((item) => item.id === state.riding[side]);
    if (enemy) Object.assign(cursor, { x: enemy.x, y: enemy.y });
  }
}

export default {
  id: "sights",
  name: "Twin Sights",
  pitch: "Ghouls walk up the road at you, so hold your left hand's circle on the ones to the left and your right hand's on the ones to the right, squat for a grenade, jump what rolls at you, and take the boss apart.",
  kind: "Whole body",
  space: "Stand back",
  length: "2 min",
  framing: "full",
  score: "ghouls",
  actions: [
    { id: "snap", label: "Next target", key: "f", keyLabel: "F" },
    { id: "grenade", label: "Grenade", key: "g", keyLabel: "G" },
    { id: "jump", label: "Jump", key: " ", keyLabel: "Space" },
  ],
  bindings: [
    { gesture: "slash_left", action: "snap", exercise: "Hand swipe" },
    { gesture: "slash_right", action: "snap", exercise: "Hand swipe" },
    { gesture: "squat_down", action: "grenade", exercise: "Squat" },
    { gesture: "jump", action: "jump", exercise: "Jump" },
  ],
  tuning: {
    waves: { label: "Waves before the boss", unit: "", min: 1, max: 6, default: 3, higherIsHarder: true, whole: true },
    lockMs: { label: "Time to lock a target", unit: "ms", min: 200, max: 900, default: 420, higherIsHarder: true, whole: true },
    walkMs: { label: "Time for a ghoul to walk up to you", unit: "ms", min: 6000, max: 20000, default: 10000, higherIsHarder: false, whole: true },
    gapMs: { label: "Time between ghouls", unit: "ms", min: 600, max: 3000, default: 1300, higherIsHarder: false, whole: true },
    rollMs: { label: "Time between rolling obstacles", unit: "ms", min: 4000, max: 14000, default: 8000, higherIsHarder: false, whole: true },
    grenades: { label: "Grenades", unit: "", min: 1, max: 5, default: 3, higherIsHarder: false, whole: true },
    lives: { label: "Lives", unit: "", min: 1, max: 6, default: 4, higherIsHarder: false, whole: true },
    ...BOSS_TUNING,
  },

  create(spec) {
    const { waves, lockMs, walkMs, gapMs, rollMs, grenades, lives, boss, bossHealth, bossWarnMs } = spec.tuning;
    return {
      status: "playing", t: 0, stage: "waves", wave: 1, waves, toSpawn: FIRST_WAVE, spawned: 0, lockMs, walkMs, gapMs, rollMs, grenades, startGrenades: grenades, lives, startLives: lives, rng: createRandom(spec.seed),
      bossNumber: boss, bossHealth, bossWarnMs, boss: null, enemies: [], rolls: [], cursors: newCursors(), riding: { left: null, right: null }, nextId: 1, nextMs: 1400, nextRollMs: rollMs * 0.75, restMs: 0, jumpMs: 0, invincibleMs: 0, finaleMs: 0, won: false,
      downed: 0, cleared: 0, wasted: 0, hurt: 0, thrown: 0, combo: 0, best: 0, score: 0,
    };
  },

  handCursors: {
    lesson: {
      kind: "aim",
      cue: "Your left hand's ring takes the left side, and your right hand's the right. Hold a ring on a ghoul to shoot it. Reach each dot with the ring of the same colour.",
      mouseCue: "The mouse moves your sight. Hold it on a ghoul to shoot it. Reach each dot.",
    },
    keys: { snap: "F locks on to the ghoul nearest your sight." },
    controls: { snap: "Hold a hand's circle on a ghoul" },
  },
  aim(state, hands) {
    aimCursors(state, hands);
    if (handsOnScreen(state).length === 2) state.twoHanded = true;
    if (state.status !== "playing" || (!hands.left && !hands.right)) return;
    // A real hand takes over from the keys.
    for (const side of SIDES) if (state.cursors[side].keyed) Object.assign(state.cursors[side], { live: false, keyed: false });
    if (!split(state)) return;
    const { left, right } = state.cursors;
    left.x = Math.min(left.x, MIDDLE);
    right.x = Math.max(right.x, -MIDDLE);
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
      const events = [{ type: "grenade", hit: state.enemies.map(({ id, kind, x, y }) => ({ id, kind, x, y })) }];
      state.downed += state.enemies.length;
      state.score += state.enemies.length * 80;
      state.enemies = [];
      if (state.boss) bossEvents(state, hitBoss(state.boss, null, { force: true, damage: GRENADE_DAMAGE }), events);
      return events;
    }
    if (action !== "snap") return [];
    const targets = targetsOf(state).sort((a, b) => urgency(b) - urgency(a));
    const hands = handsOnScreen(state);
    if (!targets.length) return [];
    // With no hand on screen the key sends each half's sight to what is most pressing in that half.
    if (!hands.length) {
      for (const side of SIDES) {
        if (targets.some((target) => covers(state, side, target))) continue;
        const target = targets.find((item) => halfOf(item.x) === side);
        if (!target) continue;
        placeCursor(state, target.x, target.y, side);
        state.riding[side] = target.enemy?.id ?? null;
      }
      return [];
    }
    // With a hand up, a swipe only finishes a lock close to a hand, in that hand's half, or a move read
    // from the body would shoot across the whole screen.
    const reach = (target) => Math.min(...SIDES.map((side) => {
      const cursor = state.cursors[side];
      return cursor.live && (!split(state) || owns(side, target.x)) ? screenGap(target, cursor) : Infinity;
    }));
    const near = [...targets].sort((a, b) => reach(a) - reach(b))[0];
    if (reach(near) <= FLICK_REACH) near.holder.lockMs = near.needMs;
    return [];
  },

  step(state, dtMs) {
    const events = [];
    state.t += dtMs;
    state.jumpMs = Math.max(0, state.jumpMs - dtMs);
    state.invincibleMs = Math.max(0, state.invincibleMs - dtMs);
    settleCursors(state);

    if (state.finaleMs > 0) {
      state.finaleMs -= dtMs;
      if (state.finaleMs <= 0) {
        state.status = "ended";
        events.push({ type: "end" });
      }
      return events;
    }

    if (state.stage === "waves") {
      moveEnemies(state, dtMs, events);
      if (state.restMs > 0) {
        state.restMs -= dtMs;
        if (state.restMs <= 0) {
          state.wave += 1;
          state.toSpawn = FIRST_WAVE + (state.wave - 1) * 2;
          state.nextMs = 400;
          events.push({ type: "wave", wave: state.wave });
        }
      } else {
        state.nextMs -= dtMs;
        if (state.toSpawn > 0 && state.nextMs <= 0 && state.enemies.length < MAX_UP) {
          spawn(state);
          const fresh = state.enemies.at(-1);
          state.nextMs = state.gapMs * state.rng.range(0.8, 1.2);
          events.push({ type: "enemy", id: fresh.id, kind: fresh.kind });
        }
        state.nextRollMs -= dtMs;
        if (state.toSpawn > 0 && state.nextRollMs <= 0) {
          state.nextRollMs = state.rollMs;
          state.rolls.push({ id: state.nextId++, ms: 0, arriveMs: ROLL_MS });
          events.push({ type: "roll" });
        }
      }
      for (const roll of state.rolls) roll.ms += dtMs;
      for (const roll of state.rolls.filter((item) => item.ms >= item.arriveMs)) {
        if (state.jumpMs > 0) {
          state.cleared += 1;
          state.score += 100;
          events.push({ type: "clear" });
        } else hurt(state, events, "roll");
      }
      state.rolls = state.rolls.filter((roll) => roll.ms < roll.arriveMs);
      followKeyed(state);
      holdLocks(state, dtMs, events);
      if (state.toSpawn <= 0 && !state.enemies.length && !state.rolls.length && state.restMs <= 0) {
        if (state.wave < state.waves) state.restMs = WAVE_REST_MS;
        else {
          state.stage = "boss";
          state.boss = createBoss(state.bossNumber, { health: state.bossHealth, warnMs: state.bossWarnMs, slots: QUADRANTS, slotFor: quadrantOf, rng: state.rng });
          events.push({ type: "boss_enter", id: state.boss.id });
        }
      }
    } else {
      bossEvents(state, stepBoss(state.boss, dtMs), events);
      if (state.finaleMs <= 0) holdLocks(state, dtMs, events);
    }

    if (state.lives <= 0) {
      state.status = "ended";
      events.push({ type: "end" });
    }
    return events;
  },

  hud(state) {
    // Aiming is the hands' own cursor, so only the body moves get the guide: a jump and a grenade squat.
    const say = { defend: null, strike: () => "Shoot it down", sleeping: () => "Aim now" };
    const roll = state.rolls.find((item) => item.arriveMs - item.ms < 1200);
    const answer = state.boss?.attack?.answer;
    const bossSays = answer === "strike" || answer === "defend" ? bossCall(state.boss, say) : state.boss?.mood === "sleep" ? say.sleeping() : null;
    const crowd = state.grenades > 0 && state.enemies.filter((enemy) => enemy.z > LINE_Z - 4).length >= 3;
    const call = state.boss ? bossSays : null;
    const attack = state.boss?.attack;
    const cue = answer === "defend" ? moveCue("jump", attack.ms / attack.warnMs) : !state.boss && roll ? moveCue("jump", 1 - (roll.arriveMs - roll.ms) / 1200) : !state.boss && crowd ? moveCue("squat_down", 0.3) : null;
    return {
      score: state.score, label: "Score", lives: state.lives, maxLives: state.startLives,
      clock: state.boss ? state.boss.name : `Wave ${state.wave} of ${state.waves}`,
      bars: state.boss ? [{ label: state.boss.name, value: bossHealthLeft(state.boss) }] : undefined,
      extra: call ?? `Grenades: ${state.grenades}`,
      cue,
    };
  },

  result: (state) => ({
    outcome: state.won ? "win" : state.lives <= 0 ? "lose" : "complete",
    score: state.score,
    stats: [
      { label: "Ghouls down", value: state.downed },
      { label: "Jumped", value: state.cleared },
      { label: "Grenades thrown", value: state.thrown },
      { label: "Hits taken", value: state.hurt },
    ],
  }),

  bot(state, skill) {
    const roll = state.rolls.find((item) => item.arriveMs - item.ms <= REACTION_MS[skill] + JUMP_MS * 0.5);
    if (roll) return "jump";
    if (state.boss && bossWants(state.boss, skill) === "defend") return "jump";
    if (state.grenades > 0 && state.enemies.filter((enemy) => enemy.z > LINE_Z - 4).length >= 3) return "grenade";
    // Sends on any sight that has work in its half and nothing under it. It lets a ghoul walk out of
    // the distance first, as a player waits to see what is coming.
    const targets = targetsOf(state).filter((target) => !target.enemy || target.enemy.z > BOT_WAITS_Z);
    const idle = SIDES.some((side) => targets.some((target) => halfOf(target.x) === side) && !targets.some((target) => covers(state, side, target)));
    return idle ? "snap" : null;
  },
};
