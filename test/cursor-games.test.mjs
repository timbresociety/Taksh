// The four cursor games, played headless. test/templates.test.mjs runs the checks every template shares;
// this file holds what is particular to these: hands as cursors, with no click anywhere.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { onDot, practiceMoves } from "../src/lib/game/practice.js";
import { DEFAULT_HERO, DEFAULT_RIVAL, GESTURES, SPEC_VERSION } from "../src/lib/spec/contract.js";
import { STARTER_LOOKS } from "../src/lib/spec/starter.js";
import { SCREEN_RATIO } from "../src/lib/templates/chop.js";
import { screenGap } from "../src/lib/templates/cursors.js";
import { BOSSES } from "../src/lib/templates/bosses.js";
import { KINDS as DABBA_KINDS } from "../src/lib/templates/dabba.js";
import { KINDS as POPUP_KINDS, RISE_MS, SLOTS } from "../src/lib/templates/popup.js";
import { CENTRE, PATTERNS, ROOF_Y, TRAY_Y, WALL_X, traysOf } from "../src/lib/templates/rangoli.js";
import { BOSS_FRAMES, CLAW_MS, FAR_Z, LINE_Z, MAX_UP as SIGHT_MAX_UP, MIDDLE, MOST as SIGHT_MOST, KINDS as SIGHT_KINDS, SIGHT_RADIUS, partSpot, partsInReach } from "../src/lib/templates/sights.js";
import { defaultTuning, simulate, templateInfo } from "../src/lib/templates/index.js";

const sights = templateInfo("sights");
const rangoli = templateInfo("rangoli");
const dabba = templateInfo("dabba");
const popup = templateInfo("popup");
const GAMES = [sights, rangoli, dabba, popup];
const PX = 1 / 540; // one pixel on a 1080p screen, in the half screen heights the field measures in
const MIN_TARGET_PX = 60;
const TOP_REACH = 0.8;

function specOf(template, tuning = {}, seed = 7) {
  return {
    specVersion: SPEC_VERSION, template: template.id, title: "Test", objective: "Test.", seed,
    skin: { world: "downtown", style: "bright", hero: { ...DEFAULT_HERO }, rival: { ...DEFAULT_RIVAL } },
    tuning: { ...defaultTuning(template), ...tuning },
  };
}

const types = (events) => events.map((event) => event.type);
const run = (template, state, ms, each = () => {}) => {
  const events = [];
  for (let t = 0; t < ms && state.status === "playing"; t += 20) {
    each(state);
    events.push(...template.step(state, 20));
  }
  return events;
};

// A hand has a speed, and a player takes a moment to see where to go. Hands stay on their own side of the
// body unless there is only one. pick answers where a hand wants to be.
function playByHand(template, spec, pick, { sides = ["right"], speed = 2.6, reactionMs = 300, each = () => {}, maxMs = 300000 } = {}) {
  const state = template.create(spec);
  const hands = { left: { x: -0.4, y: -0.3 }, right: { x: 0.4, y: -0.3 } };
  const goals = { left: null, right: null };
  let looked = 0;
  while (state.status === "playing" && state.t < maxMs) {
    if (state.t - looked >= reactionMs) {
      looked = state.t;
      for (const side of sides) goals[side] = pick(state, side, sides.length > 1);
    }
    for (const side of sides) {
      const goal = goals[side];
      if (!goal) continue;
      const gap = screenGap(goal, hands[side]);
      const share = gap > 0 ? Math.min(1, (speed * 0.02) / gap) : 1;
      hands[side] = { x: hands[side].x + (goal.x - hands[side].x) * share, y: hands[side].y + (goal.y - hands[side].y) * share };
    }
    template.aim(state, { left: sides.includes("left") ? hands.left : null, right: sides.includes("right") ? hands.right : null });
    each(state);
    template.step(state, 20);
  }
  return { state, result: template.result(state) };
}

const mine = (items, side, both) => (both ? items.filter((item) => (side === "left" ? item.x <= 0.05 : item.x >= -0.05)) : items);
const nearest = (items, side, state) => [...items].sort((a, b) => screenGap(a, state.cursors[side]) - screenGap(b, state.cursors[side]))[0] ?? null;

describe("every cursor game", () => {
  for (const template of GAMES) {
    it(`${template.id}: a quick player wins and a casual one scores, on several seeds`, () => {
      for (const seed of [1, 7, 42, 2024]) {
        const quick = simulate(template, specOf(template, {}, seed), { skill: "quick" });
        assert.equal(quick.outcome, "win", `seed ${seed}: ${JSON.stringify(quick)}`);
        assert.ok(simulate(template, specOf(template, {}, seed), { skill: "casual" }).score > 0, `seed ${seed}`);
      }
    });

    it(`${template.id} takes hand positions, and only real moves besides`, () => {
      assert.equal(typeof template.aim, "function");
      const known = new Set(GESTURES.map((gesture) => gesture.id));
      for (const { gesture } of template.bindings) assert.ok(known.has(gesture), gesture);
    });

    it(`${template.id}: raising both hands means nothing, because hands are cursors`, () => {
      assert.ok(!template.bindings.some(({ gesture }) => gesture === "hands_up"));
    });

    it(`${template.id}: a pitch is one plain sentence, and it has a starter look`, () => {
      assert.equal(template.pitch.match(/[.!?]/g).length, 1);
      assert.ok(template.pitch.endsWith("."));
      assert.ok(STARTER_LOOKS[template.id]);
    });

    it(`${template.id}: a player who does nothing does not win`, () => {
      const state = template.create(specOf(template));
      run(template, state, 300000);
      assert.notEqual(template.result(state).outcome, "win");
    });

    it(`${template.id}: a lost hand is forgotten, and a pointer at rest is not`, () => {
      const state = template.create(specOf(template));
      template.aim(state, { left: { x: -0.3, y: 0 }, right: { x: 0.3, y: 0 } });
      run(template, state, 1000);
      assert.equal(state.cursors.left.live, true, "nothing was sent, and the cursor stays");
      template.aim(state, { left: null, right: { x: 0.3, y: 0 } });
      assert.equal(state.cursors.left.live, false);
      assert.equal(state.cursors.right.live, true);
    });

    it(`${template.id}: a state that has been through JSON still has a bot, as the browser test reads it`, () => {
      const state = template.create(specOf(template));
      run(template, state, 6000, (live) => {
        const wanted = template.bot(live, "quick");
        if (wanted) template.act(live, wanted);
      });
      template.bot(JSON.parse(JSON.stringify(state)), "quick");
    });
  }
});

describe("targets a hand can reach", () => {
  const across = (radius) => (radius * 2) / PX;

  it("every target is at least 60 px across on a 1080p screen", () => {
    for (const { radius } of [...Object.values(SIGHT_KINDS), ...Object.values(DABBA_KINDS), ...Object.values(POPUP_KINDS)]) assert.ok(across(radius) >= MIN_TARGET_PX, `${radius}`);
    assert.ok(across(SIGHT_RADIUS) >= MIN_TARGET_PX);
  });

  it("every pop-up slot sits below the top of the tracker's reach, in a hand's own half", () => {
    for (const { x, y } of SLOTS) {
      assert.ok(y + POPUP_KINDS.monkey.radius <= TOP_REACH, `${x}, ${y}`);
      assert.ok(Math.abs(x) >= 0.2);
    }
  });

  it("ghouls stay below the top of the tracker's reach for a whole game", () => {
    const state = sights.create(specOf(sights, { waves: 4, walkMs: 20000 }));
    run(sights, state, 60000, (live) => {
      live.lives = 4;
      for (const enemy of live.enemies) assert.ok(enemy.y <= TOP_REACH && Math.abs(enemy.x) <= 0.8, `${enemy.x}, ${enemy.y}`);
    });
  });

  it("every part of every boss can be reached", () => {
    for (const [index, { id }] of BOSSES.entries()) {
      const { parts } = BOSSES[index];
      for (const [x, y] of parts) {
        const spot = partSpot({ id }, { x, y });
        assert.ok(spot.y <= TOP_REACH && Math.abs(spot.x) <= 0.8, `${id} ${x}, ${y}`);
      }
      assert.ok(BOSS_FRAMES[id]);
    }
  });

  it("the first ghouls, dabbas and monkeys come on each hand's own side, in turn", () => {
    const firstX = (template, list, count, tuning) => {
      const state = template.create(specOf(template, tuning));
      const seen = new Map();
      for (let t = 0; t < 12000 && seen.size < count; t += 20) {
        template.step(state, 20);
        for (const item of list(state)) if (!seen.has(item.id)) seen.set(item.id, item.x);
      }
      return [...seen.values()].slice(0, count);
    };
    for (const xs of [firstX(sights, (state) => state.enemies, 4, { walkMs: 20000 }), firstX(dabba, (state) => state.items, 4, {}), firstX(popup, (state) => state.pops, 4, {})]) {
      for (let i = 1; i < xs.length; i += 1) assert.notEqual(Math.sign(xs[i]), Math.sign(xs[i - 1]), xs.join());
    }
  });
});

describe("played by hand, with no keys", () => {
  const sightGoal = (state, side, both) => {
    const { boss } = state;
    if (boss) {
      if (boss.attack?.answer === "strike") return null; // the shot in the air is the test below
      return nearest(mine(partsInReach(boss).map((part) => partSpot(boss, part)), side, both), side, state);
    }
    return nearest(mine(state.enemies, side, both), side, state);
  };
  const sightJumps = (state) => {
    const wanted = sights.bot(state, "quick");
    if (wanted === "jump") sights.act(state, wanted);
  };

  it("one pointer alone beats Twin Sights, on every boss", () => {
    for (const boss of [1, 2, 3]) {
      const { result } = playByHand(sights, specOf(sights, { boss, lives: 6 }), sightGoal, { each: sightJumps });
      assert.equal(result.outcome, "win", `boss ${boss}: ${JSON.stringify(result)}`);
    }
  });

  it("two hands take Twin Sights faster than one", () => {
    const one = playByHand(sights, specOf(sights, { lives: 6 }), sightGoal, { each: sightJumps });
    const two = playByHand(sights, specOf(sights, { lives: 6 }), sightGoal, { sides: ["left", "right"], each: sightJumps });
    assert.equal(two.result.outcome, "win");
    assert.ok(two.state.t < one.state.t, `${two.state.t} against ${one.state.t}`);
  });

  const trayGoal = (state, side, both) => {
    const ball = state.balls[0];
    if (!ball) return null;
    const halves = both ? (side === "left" ? ball.x <= 0 : ball.x > 0) : true;
    return halves ? { x: ball.x, y: -0.5 } : null;
  };

  it("a hand following the ball keeps Rangoli Breaker alive, and a second hand adds a tray", () => {
    const { state, result } = playByHand(rangoli, specOf(rangoli, { patterns: 1 }), trayGoal, { reactionMs: 120, maxMs: 200000 });
    assert.ok(state.broken > 10, JSON.stringify(result));
    assert.ok(state.bounces > 8);
    const two = playByHand(rangoli, specOf(rangoli, { patterns: 1 }), trayGoal, { reactionMs: 120, sides: ["left", "right"], maxMs: 200000 });
    assert.equal(two.result.outcome, "win", JSON.stringify(two.result));
  });

  const dabbaGoal = (state, side, both) => {
    const wanted = state.items.filter((item) => item.kind !== "hazard" && item.y < 0.75 && (!both || !item.owner || item.owner === side));
    return wanted.sort((a, b) => a.y - b.y)[0] ?? null;
  };

  it("one pointer catches most of Dabba Catch, and two hands catch more", () => {
    const one = playByHand(dabba, specOf(dabba), dabbaGoal);
    const two = playByHand(dabba, specOf(dabba), dabbaGoal, { sides: ["left", "right"] });
    assert.ok(one.state.caught >= one.state.dropped * 0.6, JSON.stringify(one.result));
    assert.ok(two.state.caught >= one.state.caught, JSON.stringify(two.result));
  });

  const popupGoal = (state, side, both) => nearest(mine(state.pops.filter((pop) => pop.kind !== "cat"), side, both), side, state);

  it("one pointer holds Pop-Up Patrol, and two hands let fewer get away", () => {
    const one = playByHand(popup, specOf(popup), popupGoal);
    const two = playByHand(popup, specOf(popup), popupGoal, { sides: ["left", "right"] });
    assert.notEqual(one.result.outcome, "lose", JSON.stringify(one.result));
    assert.ok(two.state.escaped <= one.state.escaped, `${two.state.escaped} against ${one.state.escaped}`);
  });
});

describe("sights", () => {
  // One ghoul standing still on the road, so a test can hold a hand on it. Screen spots follow from
  // the road, so the state is stepped once to work its spot out.
  const withGhoul = (tuning, { lane = 2.5, z = -6, kind = "shambler", speed = 0 } = {}) => {
    const state = sights.create(specOf(sights, { walkMs: 20000, ...tuning }));
    state.nextMs = 1e9;
    state.nextRollMs = 1e9;
    state.toSpawn = 1;
    const { hp } = SIGHT_KINDS[kind];
    state.enemies = [{ id: 50, kind, hp, maxHp: hp, ms: 0, lockMs: 0, farLane: lane, lane, z, speed, staggerMs: 0, clawMs: 0 }];
    sights.step(state, 0);
    return state;
  };
  const spotOf = (state) => (state.enemies[0] ? { x: state.enemies[0].x, y: state.enemies[0].y } : null);
  const far = { left: { x: -0.9, y: -0.6 }, right: { x: 0.9, y: -0.6 } };

  it("a target held under a circle is shot once the lock time is up, with no click", () => {
    const state = withGhoul({ lockMs: 400 });
    const at = spotOf(state);
    const events = run(sights, state, 380, (live) => sights.aim(live, { left: null, right: at }));
    assert.ok(!types(events).includes("shot"));
    const later = run(sights, state, 80, (live) => sights.aim(live, { left: null, right: at }));
    assert.ok(types(later).includes("shot"));
    assert.ok(types(later).includes("downed"));
  });

  it("with both hands up, a ghoul is shot by the hand of its own half", () => {
    for (const lane of [2.5, -2.5]) {
      const state = withGhoul({ lockMs: 300 }, { lane });
      const mine = lane < 0 ? "left" : "right";
      const hands = { ...far, [mine]: spotOf(state) };
      const events = run(sights, state, 400, (live) => sights.aim(live, hands));
      assert.equal(events.find((event) => event.type === "shot").side, mine);
    }
  });

  it("a ghoul on the left never locks under the right sight, nor one on the right under the left", () => {
    // Close to the middle, where the other hand's sight reaches it once it is pushed to the edge of its half.
    for (const lane of [-2, 2]) {
      const state = withGhoul({ lockMs: 300 }, { lane, z: FAR_Z });
      const ghoul = state.enemies[0];
      assert.ok(Math.abs(ghoul.x) > MIDDLE && Math.abs(ghoul.x) < MIDDLE + SIGHT_RADIUS / SCREEN_RATIO, `${ghoul.x}`);
      const other = lane < 0 ? "right" : "left";
      const hands = { ...far, [other]: spotOf(state) };
      const events = run(sights, state, 2000, (live) => sights.aim(live, hands));
      assert.ok(!types(events).includes("shot"), `lane ${lane}`);
      assert.equal(ghoul.lockMs, 0);
      assert.ok(screenGap(ghoul, state.cursors[other]) < SIGHT_RADIUS, "the sight is right over it, and still does not lock");
    }
  });

  it("one hand alone, or a pointer, reaches the whole screen", () => {
    const state = withGhoul({ lockMs: 300 }, { lane: -2.5 });
    const events = run(sights, state, 400, (live) => sights.aim(live, { left: null, right: spotOf(live) }));
    assert.equal(events.find((event) => event.type === "shot").side, "right");
  });

  it("a hand the tracker drops for a moment does not hand its half to the other", () => {
    const state = withGhoul({ lockMs: 300 }, { lane: -2.5 });
    sights.aim(state, { left: { x: -0.5, y: 0 }, right: { x: 0.5, y: 0 } });
    const events = run(sights, state, 400, (live) => sights.aim(live, { left: null, right: spotOf(live) }));
    assert.ok(!types(events).includes("shot"));
  });

  it("with both hands up, each sight is held inside its own half, with a thin strip shared", () => {
    const state = sights.create(specOf(sights));
    sights.aim(state, { left: { x: 0.6, y: 0.1 }, right: { x: -0.7, y: -0.2 } });
    assert.equal(state.cursors.left.x, MIDDLE);
    assert.equal(state.cursors.right.x, -MIDDLE);
    assert.equal(state.cursors.left.y, 0.1);
    sights.aim(state, { left: { x: -0.4, y: 0 }, right: { x: 0.5, y: 0 } });
    assert.deepEqual([state.cursors.left.x, state.cursors.right.x], [-0.4, 0.5]);
    sights.aim(state, { left: null, right: { x: -0.7, y: 0 } });
    assert.equal(state.cursors.right.x, -MIDDLE, "the other hand dropping out does not free this one");
  });

  it("keys send each half's sight to that half, and the sight rides along on its ghoul", () => {
    const state = sights.create(specOf(sights));
    state.nextMs = 1e9;
    state.nextRollMs = 1e9;
    const { hp } = SIGHT_KINDS.shambler;
    state.enemies = [-2.5, 2.5].map((lane, index) => ({ id: 60 + index, kind: "shambler", hp, maxHp: hp, ms: 0, lockMs: 0, farLane: lane, lane, z: -8, speed: 1.2, staggerMs: 0, clawMs: 0 }));
    sights.step(state, 0);
    sights.act(state, "snap");
    assert.deepEqual([state.cursors.left.x, state.cursors.right.x], state.enemies.map((enemy) => enemy.x));
    sights.step(state, 200);
    assert.deepEqual([state.cursors.left.y, state.cursors.right.y], state.enemies.map((enemy) => enemy.y), "the sights moved with the ghouls");
    const events = run(sights, state, 600);
    assert.equal(types(events).filter((type) => type === "downed").length, 2);
  });

  it("both circles on a target in the middle strip lock it twice as fast", () => {
    const state = atBoss({ boss: 1, lockMs: 400 });
    const part = state.boss.parts[8];
    const spot = partSpot(state.boss, part);
    assert.ok(Math.abs(spot.x) <= MIDDLE);
    run(sights, state, 260, (live) => sights.aim(live, { left: spot, right: spot }));
    assert.ok(part.hp < part.maxHp);
  });

  it("a circle passing over a target does not shoot it, and a lock slips away when the circle leaves", () => {
    const state = withGhoul({ lockMs: 400 });
    const at = spotOf(state);
    run(sights, state, 200, (live) => sights.aim(live, { left: null, right: at }));
    assert.ok(state.enemies[0].lockMs > 100);
    const away = run(sights, state, 400, (live) => sights.aim(live, { left: null, right: { x: -0.8, y: -0.5 } }));
    assert.ok(!types(away).includes("shot"));
    assert.equal(state.enemies[0].lockMs, 0);
  });

  it("a hand's wobble does not break a lock, even at the circle's edge", () => {
    const state = withGhoul({ lockMs: 400 });
    const at = spotOf(state);
    const edge = (SIGHT_RADIUS * 0.95) / SCREEN_RATIO;
    let tick = 0;
    const events = run(sights, state, 600, (live) => {
      tick += 1;
      const wobble = (tick % 2 ? 6 : -6) * PX;
      sights.aim(live, { left: null, right: { x: at.x + edge + wobble / SCREEN_RATIO, y: at.y + wobble } });
    });
    assert.ok(types(events).includes("shot"));
  });

  it("a sight held on a ghoul walking up the road locks it", () => {
    const state = withGhoul({ lockMs: 420 }, { kind: "runner", z: -4, speed: 2.6 });
    const events = run(sights, state, 600, (live) => sights.aim(live, { left: far.left, right: spotOf(live) }));
    assert.ok(types(events).includes("downed"));
  });

  it("a brute takes two locks, and staggers back from the first", () => {
    const state = withGhoul({ lockMs: 300 }, { kind: "brute", speed: 1 });
    const brute = state.enemies[0];
    const events = run(sights, state, 340, (live) => sights.aim(live, { left: null, right: spotOf(live) }));
    assert.deepEqual(types(events).filter((type) => ["hit", "downed"].includes(type)), ["hit"]);
    const hitAt = brute.z;
    run(sights, state, 200, (live) => sights.aim(live, { left: null, right: { x: -0.8, y: -0.6 } }));
    assert.ok(brute.z < hitAt, "knocked back");
    const later = run(sights, state, 800, (live) => sights.aim(live, { left: null, right: spotOf(live) }));
    assert.ok(types(later).includes("downed"));
  });

  it("ghouls walk up out of the distance, growing as they come", () => {
    const state = withGhoul({}, { z: FAR_Z, speed: 1.2 });
    const ghoul = state.enemies[0];
    const start = { y: ghoul.y, radius: ghoul.radius, x: ghoul.x };
    run(sights, state, 10000);
    assert.ok(ghoul.z > FAR_Z + 10 && ghoul.z < LINE_Z);
    assert.ok(ghoul.y < start.y, "lower on the screen, as it is nearer");
    assert.ok(ghoul.radius > start.radius);
    assert.ok(ghoul.x > start.x, "and further out from the middle");
  });

  it("a ghoul that reaches the player claws and costs a life, unless it is shot first", () => {
    const state = withGhoul({}, { z: LINE_Z - 0.2, speed: 2 });
    const events = run(sights, state, 300 + CLAW_MS);
    assert.ok(types(events).includes("claw"));
    assert.equal(state.hurt, 1);
    assert.equal(state.lives, state.startLives - 1);
    assert.equal(state.enemies.length, 0);

    const saved = withGhoul({ lockMs: 300 }, { z: LINE_Z });
    const late = run(sights, saved, CLAW_MS, (live) => sights.aim(live, { left: null, right: spotOf(live) }));
    assert.ok(types(late).includes("downed"));
    assert.equal(saved.hurt, 0);
  });

  it("ghouls come on both halves in turn, and each keeps to its own half all the way up the road", () => {
    const state = sights.create(specOf(sights, { waves: 6, lives: 6 }));
    const sides = new Map();
    run(sights, state, 240000, (live) => {
      live.lives = 6;
      for (const enemy of live.enemies) {
        const side = Math.sign(enemy.farLane);
        if (!sides.has(enemy.id)) sides.set(enemy.id, side);
        assert.equal(Math.sign(enemy.x), side, `${enemy.id} crossed over`);
        assert.ok(Math.abs(enemy.x) > MIDDLE, `${enemy.id} in the middle at ${enemy.x}`);
      }
    });
    const list = [...sides.values()];
    assert.ok(list.length > 30);
    const left = list.filter((side) => side < 0).length;
    assert.ok(Math.abs(left * 2 - list.length) <= 1, `${left} of ${list.length} on the left`);
  });

  it("never more ghouls up at once than the view keeps bodies for", () => {
    const state = sights.create(specOf(sights, { waves: 6, lives: 6, gapMs: 600, walkMs: 20000 }));
    let most = 0;
    run(sights, state, 200000, (live) => {
      live.lives = 6;
      most = Math.max(most, live.enemies.length);
      for (const [kind, cap] of Object.entries(SIGHT_MOST)) assert.ok(live.enemies.filter((enemy) => enemy.kind === kind).length <= cap, kind);
    });
    assert.equal(most, SIGHT_MAX_UP);
    assert.ok(SIGHT_MAX_UP <= 8);
  });

  it("a squat throws a grenade, which drops every ghoul on the road, and the stock runs out", () => {
    assert.equal(sights.bindings.find(({ gesture }) => gesture === "squat_down").action, "grenade");
    const state = withGhoul({ grenades: 1 });
    state.enemies.push({ ...state.enemies[0], id: 51, kind: "brute", hp: 2, maxHp: 2, farLane: -3, lane: -3 });
    const [blast] = sights.act(state, "grenade");
    assert.equal(blast.type, "grenade");
    assert.deepEqual(blast.hit.map((item) => item.id), [50, 51]);
    assert.equal(state.enemies.length, 0);
    assert.equal(state.downed, 2);
    assert.deepEqual(types(sights.act(state, "grenade")), ["empty"]);
  });

  it("a jump clears what rolls at you, and standing still does not", () => {
    assert.equal(sights.bindings.find(({ gesture }) => gesture === "jump").action, "jump");
    const roll = (jump) => {
      const state = withGhoul({});
      state.rolls = [{ id: 70, ms: 0, arriveMs: 400 }];
      if (jump) sights.act(state, "jump");
      return types(run(sights, state, 500));
    };
    assert.ok(roll(true).includes("clear"));
    assert.ok(roll(false).includes("hurt"));
  });

  it("a swipe near a target finishes its lock, and far from one does nothing", () => {
    const near = withGhoul({ lockMs: 800 });
    const at = spotOf(near);
    sights.aim(near, { left: null, right: { x: at.x + 0.12, y: at.y } });
    sights.act(near, "snap");
    assert.ok(types(sights.step(near, 20)).includes("shot"));

    const away = withGhoul({ lockMs: 800 });
    sights.aim(away, { left: null, right: { x: -0.8, y: -0.6 } });
    sights.act(away, "snap");
    assert.ok(!types(sights.step(away, 20)).includes("shot"));
  });

  function atBoss(tuning) {
    const state = sights.create(specOf(sights, { waves: 1, ...tuning }));
    for (let t = 0; t < 120000 && !state.boss; t += 20) {
      const wanted = sights.bot(state, "quick");
      if (wanted) sights.act(state, wanted);
      sights.step(state, 20);
    }
    while (state.boss.mood === "enter") sights.step(state, 20);
    state.boss.restMs = 1e9;
    return state;
  }

  it("Ravana's heads can be shot in any order, the one aimed at going first, and his own goes last", () => {
    const state = atBoss({ boss: 1, bossHealth: 1 });
    const { boss } = state;
    assert.equal(boss.parts.length, 10);
    assert.ok(!partsInReach(boss).includes(boss.parts[9]));
    for (const id of [6, 2, 8, 0, 5, 1, 3, 7, 4]) {
      if (boss.parts[id].hp === 0) continue; // a circle held on after a kill takes the head beside it too
      const spot = partSpot(boss, boss.parts[id]);
      const hits = run(sights, state, 900, (live) => sights.aim(live, { left: null, right: spot })).filter((event) => event.type === "boss_hit");
      assert.equal(hits[0].part, id, `head ${id}`);
      if (boss.parts.slice(0, 9).some((part) => part.hp > 0)) assert.ok(boss.parts[9].hp > 0, "his own head waits for the rest");
    }
    if (boss.mood !== "fallen") {
      const events = run(sights, state, 900, (live) => sights.aim(live, { left: null, right: partSpot(boss, boss.parts[9]) }));
      assert.ok(types(events).includes("boss_down"));
    }
    assert.equal(boss.mood, "fallen");
  });

  it("with both hands up, a boss's part is only locked by the sight of its own half", () => {
    const state = atBoss({ boss: 2 });
    const { boss } = state;
    const calf = boss.parts.find((part) => part.bone === "calf_l");
    const spot = partSpot(boss, calf);
    assert.ok(spot.x < -MIDDLE && boss.mood === "sleep");
    run(sights, state, 900, (live) => sights.aim(live, { left: far.left, right: spot }));
    assert.equal(calf.hp, calf.maxHp, "the right sight is held at the strip, over the calf, and does nothing");
    run(sights, state, 900, (live) => sights.aim(live, { left: spot, right: far.right }));
    assert.ok(calf.hp < calf.maxHp);
  });

  it("the heads sit side by side, and a circle over two locks the one nearest its middle", () => {
    const spots = BOSSES[0].parts.map(([x, y]) => partSpot({ id: "ravana" }, { x, y }));
    assert.ok(screenGap(spots[6], spots[4]) < SIGHT_RADIUS * 2, "neighbours are close enough to touch");
    const state = atBoss({ boss: 1, bossHealth: 1 });
    const [near, far] = [state.boss.parts[6], state.boss.parts[4]];
    const a = partSpot(state.boss, near);
    const b = partSpot(state.boss, far);
    const aim = { x: a.x + (b.x - a.x) * 0.35, y: a.y + (b.y - a.y) * 0.35 };
    const hits = run(sights, state, 500, (live) => sights.aim(live, { left: null, right: aim })).filter((event) => event.type === "boss_hit");
    assert.deepEqual(hits.map((event) => event.part), [6]);
  });

  it("a shot in the air can be shot down, and costs a life if it isn't", () => {
    const volley = (hold) => {
      const state = atBoss({ boss: 1, bossWarnMs: 1400 });
      const { boss } = state;
      boss.attack = { kind: "volley", answer: "strike", slot: "tl", ms: 0, warnMs: 1400 };
      boss.mood = "windup";
      return types(run(sights, state, 1600, (live) => {
        if (hold) sights.aim(live, { left: null, right: { x: -0.5, y: 0.45 } });
      }));
    };
    assert.ok(volley(true).includes("boss_parry"));
    assert.ok(volley(false).includes("hurt"));
  });

  it("a jump answers a boss's blow", () => {
    const state = atBoss({ boss: 1 });
    state.boss.attack = { kind: "sweep", answer: "defend", slot: "tl", ms: 0, warnMs: 600 };
    state.boss.mood = "windup";
    run(sights, state, 300);
    sights.act(state, "jump");
    assert.ok(types(run(sights, state, 400)).includes("boss_blocked"));
  });

  it("Kumbhakarna can only be hurt while he is asleep or winded", () => {
    const state = atBoss({ boss: 2 });
    state.boss.mood = "idle";
    const spot = partSpot(state.boss, state.boss.parts[0]);
    run(sights, state, 900, (live) => sights.aim(live, { left: null, right: spot }));
    assert.equal(state.boss.parts[0].hp, state.boss.parts[0].maxHp);
  });
});

describe("rangoli", () => {
  const start = (tuning, seed) => {
    const state = rangoli.create(specOf(rangoli, tuning, seed));
    while (!state.balls.length) rangoli.step(state, 20);
    return state;
  };

  it("a hand at the edge of the screen keeps the whole tray inside the court, and it still reaches the wall", () => {
    const state = start();
    for (const x of [-1, 1]) {
      rangoli.aim(state, { left: null, right: { x, y: 0 } });
      rangoli.step(state, 20);
      const [tray] = traysOf(state);
      assert.ok(Math.abs(tray.x) + tray.half <= WALL_X + 1e-9);
      assert.ok(Math.abs(WALL_X * x - tray.x) <= tray.half + 1e-9, "a ball running down the wall still lands on the tray");
    }
  });

  it("every pattern is a real ring of tiles inside the walls, none touching", () => {
    for (let first = 0; first < PATTERNS.length; first += 1) {
      const state = rangoli.create(specOf(rangoli, {}, 1));
      state.first = first;
      state.tiles = [];
      state.pattern = 0;
      let seed = 2;
      while (state.first !== first || !state.tiles.length) {
        const made = rangoli.create(specOf(rangoli, {}, seed));
        seed += 1;
        if (made.first === first) Object.assign(state, made);
      }
      assert.ok(state.tiles.length >= 25);
      for (const [index, tile] of state.tiles.entries()) {
        assert.ok(Math.abs(tile.x) < WALL_X && tile.y + tile.radius < ROOF_Y, `${tile.x}, ${tile.y}`);
        assert.ok(tile.y - tile.radius > TRAY_Y + 0.3);
        for (const other of state.tiles.slice(index + 1)) assert.ok(screenGap(tile, other) >= (tile.radius + other.radius) * 0.9, `pattern ${first}: tiles ${tile.id} and ${other.id}`);
      }
      assert.ok(state.tiles.some((tile) => tile.marigold));
    }
  });

  it("the ball serves by itself, with no click", () => {
    const state = rangoli.create(specOf(rangoli));
    const events = run(rangoli, state, 1400);
    assert.ok(types(events).includes("serve"));
    assert.equal(state.balls.length, 1);
    assert.ok(state.balls[0].vy > 0);
  });

  it("a tray follows its hand, and with two hands there are two trays", () => {
    const state = start();
    assert.deepEqual(traysOf(state).map((tray) => tray.side), ["right"]);
    rangoli.aim(state, { left: { x: -0.4, y: 0.2 }, right: { x: 0.3, y: -0.5 } });
    assert.deepEqual(traysOf(state).map(({ side, x }) => [side, x]), [["left", -0.4], ["right", 0.3]]);
    rangoli.aim(state, { left: { x: -0.4, y: 0.2 }, right: null });
    assert.deepEqual(traysOf(state).map((tray) => tray.side), ["left"]);
  });

  it("a ball over a tray bounces, and the edge of a tray turns it", () => {
    const hit = (offset) => {
      const state = start();
      rangoli.aim(state, { left: null, right: { x: 0, y: 0 } });
      Object.assign(state.balls[0], { x: offset, y: TRAY_Y + 0.08, vx: 0, vy: -state.speed });
      return { state, events: run(rangoli, state, 120) };
    };
    assert.ok(types(hit(0).events).includes("bounce"));
    const { state } = hit(0.15);
    assert.ok(state.balls[0].vx > 0);
    assert.ok(state.balls[0].vy > 0);
  });

  it("a ball the tray misses costs a life, and the next one serves", () => {
    const state = start();
    rangoli.aim(state, { left: null, right: { x: -0.6, y: 0 } });
    Object.assign(state.balls[0], { x: 0.6, y: TRAY_Y - 0.1, vx: 0, vy: -state.speed });
    const lives = state.lives;
    const events = run(rangoli, state, 2000);
    assert.ok(types(events).includes("fall"));
    assert.ok(types(events).includes("serve"));
    assert.equal(state.lives, lives - 1);
  });

  it("the ball breaks a tile and bounces back, and a two-hit tile cracks first", () => {
    const state = start();
    const tile = [...state.tiles].sort((a, b) => a.y - b.y)[0];
    tile.hp = 2;
    tile.maxHp = 2;
    const fire = () => {
      Object.assign(state.balls[0], { x: tile.x, y: tile.y - tile.radius - 0.1, vx: 0, vy: state.speed });
      return types(run(rangoli, state, 120));
    };
    assert.ok(fire().includes("crack"));
    assert.ok(state.balls[0].vy < 0);
    assert.ok(fire().includes("tile"));
    assert.ok(!state.tiles.includes(tile));
  });

  it("the ball never leaves the court, and never runs flat", () => {
    const state = start();
    run(rangoli, state, 30000, (live) => {
      const [ball] = live.balls;
      if (ball) rangoli.aim(live, { left: null, right: { x: ball.x, y: -0.5 } });
      for (const item of live.balls) {
        assert.ok(Math.abs(item.x) <= WALL_X + 1e-9 && item.y <= ROOF_Y + 1e-9);
        assert.ok(Math.abs(item.vy) >= live.speed * 0.33);
      }
    });
  });

  it("a marigold's garland widens the trays when a tray or a hand reaches it", () => {
    const state = start();
    const width = traysOf(state)[0].half;
    rangoli.aim(state, { left: null, right: { x: 0.2, y: 0.1 } });
    state.garlands = [{ id: 99, x: 0.2, y: 0.12, kind: "garland" }];
    assert.ok(types(rangoli.step(state, 20)).includes("garland"));
    assert.ok(traysOf(state)[0].half > width);
    for (const tile of state.tiles) tile.marigold = false;
    run(rangoli, state, 10000, (live) => { if (live.balls[0]) rangoli.aim(live, { left: null, right: { x: live.balls[0].x, y: 0 } }); });
    assert.equal(traysOf(state)[0].half, width);
  });

  it("the last tiles go with the rest, the next pattern is laid, and the last one wins", () => {
    const state = start({ patterns: 2 });
    const first = state.tiles[0].id;
    state.tiles.splice(3);
    const events = run(rangoli, state, 2000);
    assert.ok(types(events).includes("cleared"));
    assert.ok(types(events).includes("pattern"));
    assert.equal(state.pattern, 1);
    assert.ok(state.tiles.length > 20 && state.tiles[0].id !== first);
    state.tiles.splice(3);
    run(rangoli, state, 3000);
    assert.equal(rangoli.result(state).outcome, "win");
  });

  it("the keys move a tray only while no hand is on screen", () => {
    const state = start();
    rangoli.act(state, "left");
    assert.ok(state.cursors.right.x < 0);
    rangoli.aim(state, { left: null, right: { x: 0.5, y: 0 } });
    rangoli.act(state, "left");
    assert.equal(state.cursors.right.x, 0.5);
  });

  it("the pattern centre leaves room above the trays", () => {
    assert.ok(CENTRE.y - 0.55 > TRAY_Y);
  });
});

describe("dabba", () => {
  const item = (state, kind, x = 0.4, y = 0) => {
    const { radius, owner } = DABBA_KINDS[kind];
    state.nextMs = 1e9;
    state.items = [{ id: 60, kind, owner, radius, x, baseX: x, y, ms: 0, swings: false, spin: 0, turn: 0, fall: 0, brushed: false }];
    return state;
  };
  const both = (left, right) => ({ left, right });
  const away = { x: -0.9, y: -0.9 };

  it("a hand that reaches a tiffin catches it, with no click", () => {
    const state = item(dabba.create(specOf(dabba)), "tiffin_right");
    dabba.aim(state, both(null, { x: 0.4, y: 0 }));
    assert.ok(types(dabba.step(state, 20)).includes("catch"));
    assert.equal(state.caught, 1);
    assert.equal(state.items.length, 0);
  });

  it("a fast hand can't pass through a tiffin between frames", () => {
    const state = item(dabba.create(specOf(dabba)), "snack");
    dabba.aim(state, both(null, { x: 0.25, y: 0 }));
    dabba.step(state, 20);
    dabba.aim(state, both(null, { x: 0.55, y: 0 }));
    assert.ok(types(dabba.step(state, 20)).includes("catch"));
  });

  it("with both hands in view each hand takes its own colour, and the wrong one lets it through", () => {
    const state = item(dabba.create(specOf(dabba)), "tiffin_left");
    dabba.aim(state, both({ x: -0.9, y: -0.9 }, { x: 0.4, y: 0 }));
    assert.ok(types(dabba.step(state, 20)).includes("wrong"));
    assert.equal(state.items.length, 1);
    assert.ok(!types(dabba.step(state, 20)).includes("wrong"), "it says so once");
    dabba.aim(state, both({ x: 0.4, y: 0 }, { x: 0.9, y: -0.9 }));
    assert.equal(dabba.step(state, 20).find((event) => event.type === "catch").side, "left");
  });

  it("with one hand in view it takes any colour, so a pointer alone can play", () => {
    const state = item(dabba.create(specOf(dabba)), "tiffin_left");
    dabba.aim(state, both(null, { x: 0.4, y: 0 }));
    assert.ok(types(dabba.step(state, 20)).includes("catch"));
  });

  it("a snack goes to either hand", () => {
    for (const hands of [both({ x: 0.4, y: 0 }, away), both(away, { x: 0.4, y: 0 })]) {
      const state = item(dabba.create(specOf(dabba)), "snack");
      dabba.aim(state, hands);
      assert.ok(types(dabba.step(state, 20)).includes("catch"));
    }
  });

  it("trouble costs a life, and the game ends with none left", () => {
    const state = item(dabba.create(specOf(dabba, { lives: 1 })), "hazard");
    dabba.aim(state, both(null, { x: 0.4, y: 0 }));
    const events = dabba.step(state, 20);
    assert.ok(types(events).includes("blast"));
    assert.equal(state.status, "ended");
    assert.equal(dabba.result(state).outcome, "lose");
  });

  it("what isn't caught is dropped, and breaks the run", () => {
    const state = item(dabba.create(specOf(dabba)), "tiffin_right", 0.4, -1.1);
    state.items[0].fall = 1;
    state.combo = 4;
    assert.ok(types(run(dabba, state, 200)).includes("drop"));
    assert.equal(state.combo, 0);
  });

  it("the three shifts come in turn, and the second sends one to each hand at once", () => {
    const state = dabba.create(specOf(dabba, { hazardChance: 0 }));
    const shifts = types(run(dabba, state, 60000)).filter((type) => type === "shift");
    assert.equal(shifts.length, 2);
    const rush = dabba.create(specOf(dabba, { hazardChance: 0 }));
    rush.t = rush.durationMs / 2;
    rush.nextMs = 0;
    dabba.step(rush, 20);
    assert.equal(rush.shift, 1);
    assert.deepEqual(rush.items.map((entry) => Math.sign(entry.x)).sort(), [-1, 1]);
  });

  it("no trouble falls in the first seconds", () => {
    const state = dabba.create(specOf(dabba, { hazardChance: 40 }));
    run(dabba, state, 5000, (live) => assert.equal(live.hazards, 0));
  });

  it("the scoop key takes the lowest catch and never trouble", () => {
    const state = dabba.create(specOf(dabba));
    item(state, "hazard", 0, 0);
    state.items.push({ ...state.items[0], id: 61, kind: "snack", owner: null, y: 0.5 }, { ...state.items[0], id: 62, kind: "snack", owner: null, y: 0.2 });
    assert.equal(dabba.act(state, "scoop")[0].type, "catch");
    assert.deepEqual(state.items.map((entry) => entry.id).sort(), [60, 61]);
  });

  it("with a hand on screen, a swipe only reaches what is near the hand", () => {
    const state = item(dabba.create(specOf(dabba)), "snack", 0.6, 0.5);
    dabba.aim(state, both(null, { x: -0.6, y: -0.5 }));
    assert.deepEqual(dabba.act(state, "scoop"), []);
    dabba.aim(state, both(null, { x: 0.5, y: 0.35 }));
    assert.equal(dabba.act(state, "scoop")[0].type, "catch");
  });
});

describe("popup", () => {
  const up = (state, kind, slot = 0, { ms = RISE_MS, upMs = 1500, resting = [] } = {}) => {
    state.nextMs = 1e9;
    const { x, y } = SLOTS[slot];
    state.pops = [{ id: 70, slot, kind, x, y, radius: POPUP_KINDS[kind].radius, ms, upMs, resting }];
    return state;
  };
  const at = (slot) => ({ x: SLOTS[slot].x, y: SLOTS[slot].y });

  it("a hand that reaches a monkey sends it off, with no click", () => {
    const state = up(popup.create(specOf(popup)), "monkey");
    popup.aim(state, { left: at(0), right: null });
    assert.ok(types(popup.step(state, 20)).includes("bop"));
    assert.equal(state.bopped, 1);
  });

  it("either hand will do", () => {
    for (const hands of [{ left: at(0), right: null }, { left: null, right: at(0) }]) {
      const state = up(popup.create(specOf(popup)), "crow");
      popup.aim(state, hands);
      assert.ok(types(popup.step(state, 20)).includes("bop"));
    }
  });

  it("a monkey that hides in time takes a snack", () => {
    const state = up(popup.create(specOf(popup)), "monkey", 0, { ms: 1400 });
    const lives = state.lives;
    assert.ok(types(run(popup, state, 200)).includes("miss"));
    assert.equal(state.lives, lives - 1);
    assert.equal(state.escaped, 1);
  });

  it("the cat costs a snack if a hand arrives, and nothing if it is left alone", () => {
    const touched = up(popup.create(specOf(popup)), "cat");
    const lives = touched.lives;
    popup.aim(touched, { left: null, right: at(0) });
    assert.ok(types(popup.step(touched, 20)).includes("startle"));
    assert.equal(touched.lives, lives - 1);

    const left = up(popup.create(specOf(popup)), "cat", 0, { ms: 1400 });
    assert.ok(!types(run(left, left, 0)).includes("miss"));
    const events = run(popup, left, 300);
    assert.ok(!types(events).includes("miss"));
    assert.equal(left.lives, lives);
    assert.equal(left.pops.length, 0);
  });

  it("a cat that comes up under a resting hand does no harm until the hand leaves and comes back", () => {
    const state = up(popup.create(specOf(popup)), "cat", 0, { resting: ["right"] });
    popup.aim(state, { left: null, right: at(0) });
    assert.ok(!types(popup.step(state, 20)).includes("startle"));
    popup.aim(state, { left: null, right: { x: 0.8, y: -0.6 } });
    popup.step(state, 20);
    popup.aim(state, { left: null, right: at(0) });
    assert.ok(types(popup.step(state, 20)).includes("startle"));
  });

  it("no cat comes up in the first seconds", () => {
    const state = popup.create(specOf(popup, { catChance: 40 }));
    run(popup, state, 8000, (live) => assert.ok(!live.pops.some((pop) => pop.kind === "cat")));
  });

  it("the noon raid sends one to each side at once", () => {
    const state = popup.create(specOf(popup, { catChance: 0 }));
    state.t = state.durationMs / 2;
    state.nextMs = 0;
    popup.step(state, 20);
    assert.equal(state.round, 1);
    assert.deepEqual(state.pops.map((pop) => Math.sign(pop.x)).sort(), [-1, 1]);
  });

  it("two pop-ups never share a slot", () => {
    const state = popup.create(specOf(popup, { gapMs: 500, upMs: 3200 }));
    run(popup, state, 30000, (live) => {
      live.lives = 5;
      assert.equal(new Set(live.pops.map((pop) => pop.slot)).size, live.pops.length);
    });
  });

  it("the shoo key takes the one nearest to hiding and never the cat", () => {
    const state = up(popup.create(specOf(popup)), "cat", 0, { ms: 1000 });
    state.pops.push({ ...state.pops[0], id: 71, slot: 1, kind: "monkey", ms: 300 }, { ...state.pops[0], id: 72, slot: 2, kind: "monkey", ms: 900 });
    assert.equal(popup.act(state, "shoo")[0].id, 72);
    assert.deepEqual(state.pops.map((pop) => pop.id), [70, 71]);
  });

  it("with a hand on screen, a swipe only reaches what is near the hand", () => {
    const state = up(popup.create(specOf(popup)), "monkey", 0);
    popup.aim(state, { left: null, right: { x: 0.8, y: -0.6 } });
    assert.deepEqual(popup.act(state, "shoo"), []);
    const { x, y } = SLOTS[0];
    popup.aim(state, { left: null, right: { x: x + 0.1, y: y - 0.1 } });
    assert.equal(popup.act(state, "shoo")[0].type, "bop");
  });
});

describe("teaching a game played by reaching", () => {
  const taught = (id, usesCamera) => practiceMoves(templateInfo(id), usesCamera).map((move) => move.gesture);

  for (const id of ["sights", "dabba", "popup"]) {
    it(`${id} teaches the reach first on camera, and no swipe`, () => {
      const moves = taught(id, true);
      assert.equal(moves[0], "aim");
      assert.ok(!moves.some((gesture) => gesture.startsWith("slash_")));
    });
  }

  for (const id of ["sights", "rangoli", "dabba", "popup", "chop"]) {
    it(`${id} teaches the mouse and then its keys on the keyboard, and no swipe to copy`, () => {
      const moves = practiceMoves(templateInfo(id), false);
      assert.ok(moves[0].dots.length > 0);
      assert.equal(moves[0].label, "Move the mouse");
      assert.ok(moves[0].dots.every((dot) => dot.hand === null), "the mouse is the only ring");
      assert.ok(!moves.some((move) => move.gesture.startsWith("slash_")));
      const keys = moves.filter((move) => move.keyOnly);
      assert.ok(keys.length > 0);
      for (const key of keys) assert.ok(templateInfo(id).actions.includes(key.action) && key.cue.length > 0, key.gesture);
    });
  }

  it("twin sights still teaches its squat and jump", () => {
    assert.deepEqual(taught("sights", true), ["aim", "squat_down", "jump"]);
    assert.deepEqual(taught("sights", false), ["aim", "key_snap", "squat_down", "jump"]);
  });

  it("twin sights teaches that each hand takes its own half, and the other games keep the plain cue", () => {
    const [reach] = practiceMoves(templateInfo("sights"), true);
    assert.match(reach.cue, /left hand.*left side.*right hand.*right/i);
    assert.deepEqual(reach.dots.map((dot) => [dot.hand, Math.sign(dot.x)]), [["left", -1], ["right", 1]]);
    assert.notEqual(practiceMoves(templateInfo("dabba"), true)[0].cue, reach.cue);
  });

  it("chop shop teaches the hands it is played with: a slice through fruit, not a slash to copy", () => {
    assert.deepEqual(taught("chop", true), ["slice"]);
    const [slice] = practiceMoves(templateInfo("chop"), true);
    assert.deepEqual(slice.dots.map((dot) => dot.hand), ["left", "right", null]);
    assert.match(slice.cue, /fast through the fruit/i);
    assert.deepEqual(taught("chop", false), ["slice", "key_slice"]);
  });

  it("rangoli breaker slides its trays along the floor, to a mark left and then right", () => {
    assert.deepEqual(taught("rangoli", true), ["slide"]);
    const [slide] = practiceMoves(rangoli, true);
    assert.ok(slide.dots.every((dot) => dot.y === TRAY_Y));
    assert.deepEqual(slide.dots.map((dot) => [dot.hand, Math.sign(dot.x)]), [["left", -1], ["right", 1], [null, 0]]);
    assert.deepEqual(taught("rangoli", false), ["slide", "key_left", "key_right"]);
  });

  it("gives each hand one dot, and a dot only counts for a hand that reached it", () => {
    const [left, right] = practiceMoves(templateInfo("dabba"), true)[0].dots;
    assert.deepEqual([left.hand, right.hand], ["left", "right"]);
    assert.ok(onDot({ x: left.x + 0.05, y: left.y }, left, 16 / 9));
    assert.ok(!onDot({ x: right.x, y: right.y }, left, 16 / 9));
    assert.ok(!onDot(null, left, 16 / 9));
  });
});
