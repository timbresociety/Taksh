// The four newer games and their bosses, played headless. test/templates.test.mjs runs the checks every
// template shares; this file holds what is particular to each of these.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_HERO, DEFAULT_RIVAL, SPEC_VERSION } from "../src/lib/spec/contract.js";
import { BOSSES, MIN_WARN_MS, bossWants, createBoss, defendBoss, hitBoss, isExposed, stepBoss } from "../src/lib/templates/bosses.js";
import { REACTION_MS, createRandom } from "../src/lib/templates/shared.js";
import { defaultTuning, simulate, templateInfo } from "../src/lib/templates/index.js";

const matka = templateInfo("matka");
const harmonium = templateInfo("harmonium");
const chop = templateInfo("chop");
const blades = templateInfo("blades");
const NEW_GAMES = [matka, harmonium, chop, blades];
const LOCKED = new Set(["step_left", "step_right", "jump", "squat_down", "reach_up_left", "reach_up_right", "hands_up", "lift_left", "lift_right", "slash_left", "slash_right", "slash_up", "slash_down", "punch_left", "punch_right", "guard", "run_step"]);

function specOf(template, tuning = {}, seed = 7) {
  return {
    specVersion: SPEC_VERSION, template: template.id, title: "Test", objective: "Test.", seed,
    skin: { world: "downtown", style: "bright", hero: { ...DEFAULT_HERO }, rival: { ...DEFAULT_RIVAL } },
    tuning: { ...defaultTuning(template), ...tuning },
  };
}

const run = (template, state, ms, each = () => {}) => {
  const events = [];
  for (let t = 0; t < ms && state.status === "playing"; t += 20) {
    each(state);
    events.push(...template.step(state, 20));
  }
  return events;
};
const types = (events) => events.map((event) => event.type);

describe("every new game", () => {
  for (const template of NEW_GAMES) {
    it(`${template.id} uses only locked moves`, () => {
      for (const { gesture } of template.bindings) assert.ok(LOCKED.has(gesture), gesture);
    });

    it(`${template.id}: a quick player wins and a casual one scores, on several seeds`, () => {
      for (const seed of [1, 7, 42, 2024]) {
        const quick = simulate(template, specOf(template, {}, seed), { skill: "quick" });
        assert.equal(quick.outcome, "win", `seed ${seed}: ${JSON.stringify(quick)}`);
        assert.ok(simulate(template, specOf(template, {}, seed), { skill: "casual" }).score > 0, `seed ${seed}`);
      }
    });

    it(`${template.id}: a pitch is one plain sentence`, () => {
      assert.equal(template.pitch.match(/[.!?]/g).length, 1);
      assert.ok(template.pitch.endsWith("."));
    });
  }

  it("a player who does nothing does not win", () => {
    for (const template of NEW_GAMES) {
      const state = template.create(specOf(template));
      run(template, state, 240000);
      assert.notEqual(template.result(state).outcome, "win", template.id);
    }
  });
});

describe("matka", () => {
  const chartOf = (tuning = {}, seed = 7) => matka.create(specOf(matka, tuning, seed)).chart;

  it("the same seed writes the same chart, and another seed a different one", () => {
    assert.deepEqual(chartOf(), chartOf());
    assert.notDeepEqual(chartOf({}, 7).map((pot) => pot.dir), chartOf({}, 8).map((pot) => pot.dir));
  });

  it("every pot sits on the half-beat grid of its tempo", () => {
    for (const bpm of [70, 92, 130]) {
      const half = 60000 / bpm / 2;
      for (const pot of chartOf({ bpm })) {
        const off = pot.at / half - Math.round(pot.at / half);
        assert.ok(Math.abs(off) * half < 2, `${pot.at} at ${bpm} bpm`);
      }
    }
  });

  it("charts leave room for a slash and its way back, even at the top tempo", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const chart = chartOf({ bpm: 130 }, seed);
      for (let i = 1; i < chart.length; i += 1) {
        assert.ok(chart[i].at - chart[i - 1].at >= 460);
        if (chart[i].dir === chart[i - 1].dir) assert.ok(chart[i].at - chart[i - 1].at >= 640);
      }
    }
  });

  it("charts are phrases, so a bar's pattern comes back rather than being noise", () => {
    const beat = 60000 / 92;
    const chart = chartOf({ durationS: 150 });
    const barOf = (pot) => Math.floor((pot.at - chart[0].at) / (beat * 4) + 0.01);
    const shapes = new Map();
    for (const pot of chart) shapes.set(barOf(pot), [...(shapes.get(barOf(pot)) ?? []), Math.round((pot.at - chart[0].at) / (beat / 2)) % 8]);
    const seen = [...shapes.values()].map((slots) => slots.join());
    assert.ok(new Set(seen).size < seen.length / 2, `${new Set(seen).size} shapes in ${seen.length} bars`);
  });

  it("a pot is on screen for its whole approach, at least 1.2 seconds", () => {
    assert.equal(matka.tuning.approachMs.min, 1200);
    const state = matka.create(specOf(matka, { approachMs: 1200 }));
    const first = state.chart[0];
    assert.ok(first.at >= 1200);
    while (!state.pots.includes(first)) matka.step(state, 20);
    assert.ok(first.at - state.t >= 1180);
  });

  it("grades by timing, and a combo grows and breaks", () => {
    const hit = (offset) => {
      const state = matka.create(specOf(matka, { windowMs: 200 }));
      const pot = state.chart[0];
      while (state.t < pot.at + offset) matka.step(state, 10);
      return matka.act(state, `slash_${pot.dir}`)[0].type;
    };
    assert.equal(hit(0), "perfect");
    assert.equal(hit(60), "perfect");
    assert.equal(hit(150), "good");
    assert.equal(hit(-150), "good");

    const state = matka.create(specOf(matka));
    for (const pot of state.chart.slice(0, 3)) {
      while (state.t < pot.at) matka.step(state, 10);
      matka.act(state, `slash_${pot.dir}`);
    }
    assert.equal(state.combo, 3);
    const next = state.chart[3];
    const events = run(matka, state, next.at - state.t + 400);
    assert.ok(types(events).includes("miss"));
    assert.equal(state.combo, 0);
  });

  it("the wrong slash on a pot breaks the combo and leaves the pot; a slash at nothing costs nothing", () => {
    const state = matka.create(specOf(matka));
    const pot = state.chart[0];
    assert.equal(matka.act(state, "slash_left")[0].type, "swing");
    while (state.t < pot.at) matka.step(state, 10);
    state.combo = 5;
    const wrong = ["left", "right", "up", "down"].find((dir) => dir !== pot.dir);
    assert.equal(matka.act(state, `slash_${wrong}`)[0].type, "wrong");
    assert.equal(state.combo, 0);
    assert.ok(state.pots.includes(pot));
  });
});

describe("harmonium", () => {
  it("columns run left foot, left hand, right hand, right foot", () => {
    const bound = harmonium.actions.map(({ id }) => harmonium.bindings.find((binding) => binding.action === id).gesture);
    assert.deepEqual(bound, ["lift_left", "reach_up_left", "reach_up_right", "lift_right"]);
  });

  it("charts give a foot time to come down", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { chart } = harmonium.create(specOf(harmonium, { bpm: 100 }, seed));
      const feet = new Set([0, 3]);
      for (let i = 1; i < chart.length; i += 1) {
        const gap = chart[i].at - chart[i - 1].at;
        assert.ok(gap >= 560);
        if (feet.has(chart[i].column) && feet.has(chart[i - 1].column)) assert.ok(gap >= 820);
      }
    }
  });

  it("every column gets used", () => {
    const { chart } = harmonium.create(specOf(harmonium));
    assert.deepEqual([...new Set(chart.map((key) => key.column))].sort(), [0, 1, 2, 3]);
  });

  it("a key only counts in its own column, and a played key carries its note", () => {
    const state = harmonium.create(specOf(harmonium));
    const key = state.chart[0];
    while (state.t < key.at) harmonium.step(state, 10);
    const other = harmonium.actions[(key.column + 1) % 4].id;
    assert.equal(harmonium.act(state, other)[0].type, "stray");
    const [played] = harmonium.act(state, harmonium.actions[key.column].id);
    assert.equal(played.type, "perfect");
    assert.equal(played.pitch, key.pitch);
  });

  it("a hand, which the camera reports late, still lands on the line", () => {
    const state = harmonium.create(specOf(harmonium));
    const key = state.chart.find((item) => item.column === 1 || item.column === 2);
    while (state.t < key.at + 200) harmonium.step(state, 10);
    state.keys = state.keys.filter((item) => item === key);
    assert.equal(harmonium.act(state, harmonium.actions[key.column].id)[0].type, "perfect");
  });
});

describe("chop", () => {
  const withFruit = (at = { x: 0, y: 0.3 }, tuning = {}) => {
    const state = chop.create(specOf(chop, { bombChance: 0, ...tuning }));
    while (!state.items.length) chop.step(state, 20);
    Object.assign(state.items[0], { ...at, vx: 0, vy: 0 });
    state.items.splice(1);
    return state;
  };
  // Passes a hand across x over time, with the field stepping as it would between camera frames.
  const sweep = (state, { y = 0.3, from = -0.5, to = 0.5, ms = 120, side = "right" } = {}) => {
    const steps = Math.ceil(ms / 20);
    const events = [];
    for (let i = 0; i <= steps; i += 1) {
      chop.aim(state, { left: null, right: null, [side]: { x: from + ((to - from) * i) / steps, y } });
      for (const item of state.items) Object.assign(item, { vy: 0 });
      events.push(...chop.step(state, 20));
    }
    return events;
  };

  it("exports aim, and field and hands share a range", () => {
    assert.equal(typeof chop.aim, "function");
    const state = chop.create(specOf(chop));
    run(chop, state, 8000);
    for (const item of state.items) assert.ok(Math.abs(item.x) <= 1.2 && item.y <= 1);
  });

  it("a fast hand through a fruit cuts it", () => {
    const state = withFruit();
    const events = sweep(state);
    assert.ok(types(events).includes("cut"));
    assert.equal(state.cut, 1);
  });

  it("a resting hand on a fruit does not cut it", () => {
    const state = withFruit();
    for (let i = 0; i < 40; i += 1) {
      chop.aim(state, { left: null, right: { x: 0, y: 0.3 } });
      state.items[0].vy = 0;
      chop.step(state, 20);
    }
    assert.equal(state.cut, 0);
  });

  it("a slow hand through a fruit does not cut it", () => {
    const state = withFruit();
    sweep(state, { ms: 1400 });
    assert.equal(state.cut, 0);
  });

  it("the left hand cuts as well as the right, and a lost hand is forgotten", () => {
    const state = withFruit();
    assert.ok(types(sweep(state, { side: "left" })).includes("cut"));
    chop.aim(state, { left: null, right: null });
    assert.equal(state.hands.left.live, false);
  });

  it("one jump of a tracked hand from far away is not a stroke through everything", () => {
    const state = withFruit({ x: 0, y: 0.3 });
    chop.aim(state, { left: null, right: { x: -0.9, y: -0.9 } });
    chop.aim(state, { left: null, right: { x: 0.9, y: 0.9 } });
    assert.equal(state.cut, 0);
  });

  it("cutting a firecracker costs a life and ends the game at zero", () => {
    const state = chop.create(specOf(chop, { bombChance: 40, lives: 1 }));
    while (!state.items.some((item) => item.bomb)) chop.step(state, 20);
    const bomb = state.items.find((item) => item.bomb);
    state.items = [bomb];
    Object.assign(bomb, { x: 0, y: 0.3, vx: 0, vy: 0 });
    const events = [...sweep(state), ...chop.step(state, 20)];
    assert.ok(types(events).includes("blast"));
    assert.equal(state.lives, 0);
    assert.equal(state.status, "ended");
    assert.equal(chop.result(state).outcome, "lose");
  });

  it("the slice action takes the nearest fruit and never a firecracker", () => {
    const state = chop.create(specOf(chop, { bombChance: 0 }));
    state.items = [
      { id: 90, kind: "bomb", bomb: true, x: 0, y: 0, vx: 0, vy: 0, radius: 0.09, turn: 0, spin: 0 },
      { id: 91, kind: "mango", bomb: false, x: 0.8, y: 0.6, vx: 0, vy: 0, radius: 0.1, turn: 0, spin: 0 },
    ];
    assert.equal(chop.act(state, "slice")[0].type, "cut");
    assert.deepEqual(state.items.map((item) => item.id), [90]);
    assert.equal(state.lives, 3);
    assert.equal(chop.act(state, "slice")[0].type, "swing");
  });

  it("with a hand on screen, a slash read from the body only reaches what is near the hand", () => {
    const state = withFruit({ x: 0.8, y: 0.6 });
    chop.aim(state, { left: null, right: { x: -0.8, y: -0.5 } });
    assert.equal(chop.act(state, "slice")[0].type, "swing");
    assert.equal(state.cut, 0);
  });
});

const SIDES = ["left", "right", "up", "down"];
const sideOf = (x, y) => (Math.abs(x) >= Math.abs(y) ? (x < 0 ? "left" : "right") : y > 0 ? "up" : "down");
const newBoss = (number, overrides = {}) => createBoss(number, { health: 2, warnMs: MIN_WARN_MS, slots: SIDES, slotFor: sideOf, rng: createRandom(5), ...overrides });

// Plays a boss straight, answering everything it does, with a body's pace.
function beat(boss, skill = "quick") {
  let hurt = 0;
  let down = false;
  for (let t = 0; t < 300000 && !down; t += 20) {
    const wanted = bossWants(boss, skill);
    const events = wanted === "defend" ? (defendBoss(boss), []) : wanted ? hitBoss(boss, wanted) : [];
    events.push(...stepBoss(boss, 20));
    hurt += types(events).filter((type) => type === "boss_strike").length;
    down = types(events).includes("boss_down");
  }
  return { hurt, down };
}

describe("bosses", () => {
  for (const [index, info] of BOSSES.entries()) {
    const number = index + 1;

    it(`${info.name} can be beaten, and stays down`, () => {
      const boss = newBoss(number);
      const { hurt, down } = beat(boss);
      assert.ok(down);
      assert.equal(hurt, 0);
      assert.equal(boss.mood, "fallen");
      assert.deepEqual(stepBoss(boss, 20), []);
    });

    it(`${info.name} telegraphs every attack for at least 900 ms, even at the lowest tuning`, () => {
      const boss = newBoss(number);
      for (let t = 0; t < 120000; t += 20) {
        for (const event of stepBoss(boss, 20)) if (event.type === "boss_windup") assert.ok(event.warnMs >= 900, `${event.kind} ${event.warnMs}`);
        if (isExposed(boss) && boss.blowMs <= 0 && t % 2000 === 0) hitBoss(boss, boss.parts[boss.open].slot);
        if (boss.mood === "fallen") break;
      }
    });

    it(`${info.name} has phases that follow its losses`, () => {
      const boss = newBoss(number);
      const seen = new Set([boss.phase]);
      while (boss.mood !== "fallen") {
        const wanted = bossWants(boss, "quick");
        if (wanted === "defend") defendBoss(boss);
        else if (wanted) hitBoss(boss, wanted);
        stepBoss(boss, 20);
        seen.add(boss.phase);
      }
      assert.deepEqual([...seen].sort(), [0, 1, 2]);
    });

    it(`${info.name} hurts a player who does nothing`, () => {
      const boss = newBoss(number);
      const events = [];
      for (let t = 0; t < 30000; t += 20) events.push(...stepBoss(boss, 20));
      assert.ok(types(events).includes("boss_strike"));
    });

    it(`${info.name} can be fought from Blade March`, () => {
      const result = simulate(blades, specOf(blades, { boss: number }), { skill: "quick" });
      assert.equal(result.outcome, "win", JSON.stringify(result));
    });
  }

  it("Ravana has ten heads, each with its own health, and they fall in turn with his own last", () => {
    const boss = newBoss(1);
    assert.equal(boss.parts.length, 10);
    stepBoss(boss, 3100);
    const order = [];
    while (boss.mood !== "fallen") {
      boss.attack = null;
      boss.mood = "idle";
      boss.blowMs = 0;
      const open = boss.open;
      hitBoss(boss, boss.parts[open].slot);
      if (boss.parts[open].hp === 0) order.push(open);
    }
    assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("one head at a time takes damage, and a strike at the wrong side does nothing", () => {
    const boss = newBoss(1);
    stepBoss(boss, 3100);
    const wrong = SIDES.find((side) => side !== boss.parts[0].slot);
    assert.deepEqual(hitBoss(boss, wrong), []);
    assert.equal(boss.parts[0].hp, boss.parts[0].maxHp);
    hitBoss(boss, boss.parts[0].slot);
    assert.equal(boss.parts[0].hp, boss.parts[0].maxHp - 1);
    assert.equal(boss.parts[1].hp, boss.parts[1].maxHp);
  });

  it("a held key is no faster than a body", () => {
    const boss = newBoss(1);
    stepBoss(boss, 3100);
    hitBoss(boss, boss.parts[0].slot);
    assert.deepEqual(hitBoss(boss, boss.parts[0].slot), []);
  });

  it("Kumbhakarna sleeps, wakes by himself, and only takes damage asleep or winded", () => {
    const boss = newBoss(2);
    assert.equal(boss.mood, "sleep");
    const events = [];
    for (let t = 0; t < 9000; t += 20) events.push(...stepBoss(boss, 20));
    assert.ok(types(events).includes("boss_wake"));
    while (boss.mood !== "idle") stepBoss(boss, 20);
    assert.deepEqual(types(hitBoss(boss, boss.parts[0].slot)), ["boss_shrug"]);
    while (!boss.attack) stepBoss(boss, 20);
    while (boss.attack?.answer !== "defend" || boss.attack.warnMs - boss.attack.ms > 300) stepBoss(boss, 20);
    defendBoss(boss);
    const after = [];
    while (boss.mood === "windup") after.push(...stepBoss(boss, 20));
    assert.ok(types(after).includes("boss_blocked"));
    assert.equal(boss.mood, "stun");
    assert.equal(types(hitBoss(boss, boss.parts[0].slot))[0], "boss_hit");
  });

  it("a hit wakes a sleeping giant early", () => {
    const boss = newBoss(2);
    hitBoss(boss, boss.parts[0].slot);
    let woke = false;
    for (let t = 0; t < 1000; t += 20) woke ||= types(stepBoss(boss, 20)).includes("boss_wake");
    assert.ok(woke);
  });

  it("the serpent dives when a knot goes, and can't be hit under water", () => {
    const boss = newBoss(3, { health: 1 });
    stepBoss(boss, 3000);
    const events = hitBoss(boss, boss.parts[0].slot);
    boss.blowMs = 0;
    if (!types(events).includes("boss_dive")) {
      boss.blowMs = 0;
      events.push(...hitBoss(boss, boss.parts[0].slot));
    }
    assert.ok(types(events).includes("boss_dive"));
    boss.blowMs = 0;
    assert.deepEqual(types(hitBoss(boss, boss.parts[boss.open].slot)), ["boss_shrug"]);
  });

  it("a volley is stopped by striking its slot, and a blow by defending in time", () => {
    const boss = newBoss(1);
    stepBoss(boss, 3100);
    const until = (answer) => {
      for (let t = 0; t < 30000 && boss.attack?.answer !== answer; t += 20) {
        if (boss.attack?.answer === "strike") hitBoss(boss, boss.attack.slot);
        if (boss.attack?.answer === "defend") defendBoss(boss);
        stepBoss(boss, 20);
      }
    };
    until("strike");
    assert.deepEqual(types(hitBoss(boss, boss.attack.slot)), ["boss_parry"]);
    assert.equal(boss.attack, null);
    until("defend");
    const { warnMs } = boss.attack;
    defendBoss(boss); // far too early: a guard does not last the whole telegraph
    const events = [];
    for (let t = 0; t < warnMs + 40 && boss.attack; t += 20) events.push(...stepBoss(boss, 20));
    assert.ok(types(events).includes("boss_strike"));
  });

  it("the boss tuning is a whole number that selects one", () => {
    for (const template of [blades]) {
      assert.equal(template.tuning.boss.whole, true);
      assert.deepEqual([template.tuning.boss.min, template.tuning.boss.max], [1, BOSSES.length]);
      for (const [index, { id }] of BOSSES.entries()) {
        const state = template.create(specOf(template, { boss: index + 1 }));
        for (let t = 0; t < 240000 && !state.boss && state.status === "playing"; t += 20) {
          const wanted = template.bot(state, "quick");
          if (wanted) template.act(state, wanted);
          template.step(state, 20);
        }
        assert.equal(state.boss.id, id);
      }
    }
  });
});

describe("blades", () => {
  const raider = (state, side, { heavy = false, left = 500 } = {}) => {
    state.nextMs = 1e9;
    state.enemies = [{ id: 99, side, heavy, kind: heavy ? "heavy" : "raider", ms: 2000 - left, arriveMs: 2000 }];
  };

  it("enemies come from all four sides, and a heavy one appears by the second wave", () => {
    const state = blades.create(specOf(blades));
    const seen = new Set();
    let heavy = false;
    for (let t = 0; t < 120000 && !state.boss; t += 20) {
      for (const enemy of state.enemies) {
        seen.add(enemy.side);
        heavy ||= enemy.heavy;
      }
      const wanted = blades.bot(state, "quick");
      if (wanted) blades.act(state, wanted);
      blades.step(state, 20);
    }
    assert.deepEqual([...seen].sort(), [...SIDES].sort());
    assert.ok(heavy);
  });

  it("only the matching slash cuts a raider down", () => {
    const state = blades.create(specOf(blades));
    raider(state, "left");
    assert.ok(!types(blades.act(state, "slash_right")).includes("cut"));
    assert.equal(state.enemies.length, 1);
    assert.ok(types(blades.act(state, "slash_left")).includes("cut"));
    assert.equal(state.enemies.length, 0);
  });

  it("a slash at a far raider cuts air", () => {
    const state = blades.create(specOf(blades));
    raider(state, "up", { left: 1800 });
    assert.ok(!types(blades.act(state, "slash_up")).includes("cut"));
  });

  it("a raider who gets through hurts", () => {
    const state = blades.create(specOf(blades));
    raider(state, "down", { left: 40 });
    const lives = state.lives;
    assert.ok(types(run(blades, state, 100)).includes("hurt"));
    assert.equal(state.lives, lives - 1);
  });

  it("a heavy blow rings off a slash and is stopped by a guard in time, but nothing else stops it", () => {
    const blocked = blades.create(specOf(blades));
    raider(blocked, "right", { heavy: true, left: 300 });
    assert.ok(types(blades.act(blocked, "slash_right")).includes("clang"));
    blades.act(blocked, "guard");
    assert.ok(types(run(blades, blocked, 400)).includes("blocked"));

    const open = blades.create(specOf(blades));
    raider(open, "right", { heavy: true, left: 100 });
    assert.ok(types(run(blades, open, 200)).includes("hurt"));
  });

  it("a guard does not stop an ordinary raider", () => {
    const state = blades.create(specOf(blades));
    raider(state, "left", { left: 100 });
    blades.act(state, "guard");
    assert.ok(types(run(blades, state, 200)).includes("hurt"));
  });

  it("guard answers a boss's blow, and the finale waits for the boss to fall", () => {
    const result = simulate(blades, specOf(blades, { waves: 1, boss: 1, bossHealth: 1 }), { skill: "quick" });
    assert.equal(result.outcome, "win");
  });
});

describe("REACTION_MS still covers the timing the bots are built on", () => {
  it("a quick player's reaction fits inside the smallest timing window", () => {
    assert.ok(REACTION_MS.quick <= matka.tuning.approachMs.min);
  });
});
