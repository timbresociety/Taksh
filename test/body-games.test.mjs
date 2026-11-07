// The games built on the fast moves and the whole body, played headless. test/templates.test.mjs runs the
// checks every template shares; this file holds what is particular to each of these. None of it is a
// camera: the drive path is fed readings by hand, and test/cardio.test.mjs is what reads a body.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { practiceMoves } from "../src/lib/game/practice.js";
import { GameSession } from "../src/lib/game/session.js";
import { CARDIO_MOVES, LOCKED_MOVES } from "../src/lib/motion/gestures.js";
import { clarifyIdea } from "../src/lib/pipeline/pipeline.js";
import { createFixtureProvider } from "../src/lib/pipeline/provider-fixture.js";
import { DEFAULT_HERO, DEFAULT_RIVAL, SPEC_VERSION, gestureInfo } from "../src/lib/spec/contract.js";
import { STARTER_LOOKS, starterSpec } from "../src/lib/spec/starter.js";
import { MOVE_POSES } from "../src/lib/stage/coach.js";
import { EXERCISES, calledExercise, repsFor } from "../src/lib/templates/circuit.js";
import { LEAN_AT, potHeight, wobbling } from "../src/lib/templates/handi.js";
import { MIN_LEAD_MS, ZONES } from "../src/lib/templates/keeper.js";
import { TEMPLATES, defaultTuning, simulate, templateInfo } from "../src/lib/templates/index.js";

const keeper = templateInfo("keeper");
const oars = templateInfo("oars");
const rickshaw = templateInfo("rickshaw");
const handi = templateInfo("handi");
const circuit = templateInfo("circuit");
const BODY_GAMES = [keeper, oars, rickshaw, handi, circuit];
const MIN_WARNING_MS = 900;

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
    each(state, t);
    events.push(...template.step(state, 20));
  }
  return events;
};
const types = (events) => events.map((event) => event.type);

// A press every so often, as a player would make them.
const tapping = (template, action, everyMs) => (state, t) => {
  if (t % everyMs === 0) template.act(state, action);
};

describe("every body game", () => {
  for (const template of BODY_GAMES) {
    it(`${template.id} binds only moves the contract knows, and none of them hidden`, () => {
      for (const { gesture } of template.bindings) assert.ok(gestureInfo(gesture), gesture);
      for (const { gesture } of template.bindings) assert.ok(!gestureInfo(gesture).hidden, gesture);
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

    it(`${template.id} has a starter look that validates`, () => {
      assert.ok(STARTER_LOOKS[template.id]);
      assert.equal(starterSpec(template.id, 5).template, template.id);
    });

    it(`${template.id}: a player who does nothing does not win, and the game still ends`, () => {
      const state = template.create(specOf(template));
      run(template, state, 900000);
      assert.equal(state.status, "ended");
      assert.notEqual(template.result(state).outcome, "win");
    });
  }

  it("Four Corners has left the shelf, and Last Line took its place", () => {
    assert.equal(templateInfo("corners"), undefined);
    assert.ok(!TEMPLATES.some((template) => template.name === "Four Corners"));
    assert.equal(STARTER_LOOKS.corners, undefined);
  });
});

for (const [template, speedKey, beatAction] of [[oars, "arms", "row"], [rickshaw, "legs", "throttle"]]) {
  describe(`${template.id} drive`, () => {
    const reading = (beats, tilt = 0) => ({ speed: { legs: 0, flap: 0, arms: 0, [speedKey]: beats }, tilt });
    const quiet = (state) => {
      state.hazards = [];
      state.items = [];
    };

    it("a speed reading moves it with no key at all", () => {
      const state = template.create(specOf(template));
      quiet(state);
      run(template, state, 6000, (live) => template.drive(live, reading(3)));
      assert.ok(state.distance > 20, `moved ${state.distance}`);
    });

    it("keys alone move it, and at the same speed as a body going at the same rate", () => {
      const byKeys = template.create(specOf(template));
      const byBody = template.create(specOf(template));
      quiet(byKeys);
      quiet(byBody);
      run(template, byKeys, 8000, tapping(template, beatAction, 500));
      run(template, byBody, 8000, (live) => template.drive(live, reading(2)));
      assert.ok(Math.abs(byKeys.speed - byBody.speed) < byBody.speed * 0.1, `${byKeys.speed} against ${byBody.speed}`);
    });

    it("a move and its reading are the same beat, and do not add up", () => {
      const both = template.create(specOf(template));
      const reading_only = template.create(specOf(template));
      quiet(both);
      quiet(reading_only);
      run(template, both, 6000, (live, t) => {
        template.drive(live, reading(2));
        tapping(template, beatAction, 500)(live, t);
      });
      run(template, reading_only, 6000, (live) => template.drive(live, reading(2)));
      assert.ok(Math.abs(both.speed - reading_only.speed) < 0.3, `${both.speed} against ${reading_only.speed}`);
    });

    it("stopping stops it", () => {
      const state = template.create(specOf(template));
      quiet(state);
      run(template, state, 5000, (live) => template.drive(live, reading(3)));
      const moving = state.speed;
      run(template, state, 5000, (live) => template.drive(live, reading(0)));
      assert.ok(state.speed < moving * 0.1, `${state.speed} after ${moving}`);
    });

    it("going faster than the top speed asks for adds nothing", () => {
      const fast = template.create(specOf(template));
      const faster = template.create(specOf(template));
      quiet(fast);
      quiet(faster);
      run(template, fast, 6000, (live) => template.drive(live, reading(fast.fullBeats)));
      run(template, faster, 6000, (live) => template.drive(live, reading(fast.fullBeats * 3)));
      assert.ok(Math.abs(fast.speed - faster.speed) < 0.01);
    });

    it("a lean steers each way on camera", () => {
      for (const [tilt, sign] of [[-0.8, -1], [0.8, 1]]) {
        const state = template.create(specOf(template));
        quiet(state);
        const from = state.x;
        run(template, state, 800, (live) => template.drive(live, reading(3, tilt)));
        assert.equal(Math.sign(state.x - from), sign);
      }
    });

    it("a small lean turns less than a big one", () => {
      const moved = (tilt) => {
        const state = template.create(specOf(template));
        quiet(state);
        const from = state.x;
        run(template, state, 300, (live) => template.drive(live, reading(3, tilt)));
        return Math.abs(state.x - from);
      };
      assert.ok(moved(0.25) < moved(1));
    });

    it("a held key steers until it is let go, with no camera", () => {
      const state = template.create(specOf(template));
      quiet(state);
      run(template, state, 2000, tapping(template, beatAction, 300));
      const from = state.x;
      template.act(state, "left");
      run(template, state, 300, tapping(template, beatAction, 300));
      assert.ok(state.x < from);
      template.act(state, "left_release");
      const stopped = state.x;
      run(template, state, 300, tapping(template, beatAction, 300));
      assert.equal(state.x, stopped);
    });

    it("letting go of one key leaves the other held", () => {
      const state = template.create(specOf(template));
      template.act(state, "left");
      template.act(state, "right");
      template.act(state, "left_release");
      assert.equal(state.driver.held, 1);
    });

    it("a lean move on camera has no release, so it cannot stick the steering over", () => {
      const state = template.create(specOf(template));
      quiet(state);
      template.drive(state, reading(3, 0));
      template.act(state, "left");
      assert.equal(state.driver.held, 0);
      const from = state.x;
      run(template, state, 1000, (live) => template.drive(live, reading(3, 0)));
      assert.equal(state.x, from);
    });

    it("keys take back over when the camera stops reading", () => {
      const state = template.create(specOf(template));
      quiet(state);
      template.drive(state, reading(3, 0.9));
      run(template, state, 600);
      template.act(state, "right");
      assert.equal(state.driver.held, 1);
    });

    it("a whole game can be played through the session on the drive path alone", () => {
      const session = new GameSession(specOf(template), { usesCamera: true });
      session.tick(3100);
      for (let t = 0; t < 180000 && session.phase === "playing"; t += 20) {
        const { state } = session;
        // Steers for the middle of the road, and leaves the hazards to fall where they may.
        session.handleDrive(reading(state.fullBeats, Math.max(-1, Math.min(1, -state.x))));
        session.tick(20);
      }
      assert.ok(session.state.distance > 200, `got ${session.state.distance} m`);
    });

    it("the bound move reaches the game as a beat through the session", () => {
      const session = new GameSession(specOf(template), { usesCamera: true });
      session.tick(3100);
      const { gesture } = template.bindings.find((binding) => binding.action === beatAction);
      session.handleGesture({ gesture, t: 0, confidence: 0.9 });
      assert.equal(session.state.driver.beats.length, 1);
    });
  });
}

describe("Koli Race", () => {
  it("the owner's spec: pumping arms row, a side bend steers", () => {
    assert.equal(oars.bindings.find((binding) => binding.action === "row").gesture, "arm_pump");
    assert.deepEqual(oars.bindings.filter((binding) => binding.gesture.startsWith("lean")).map((binding) => binding.action), ["left", "right"]);
  });

  it("a hazard slows the boat, and only once", () => {
    const state = oars.create(specOf(oars));
    state.hazards = [{ id: 900, kind: "buoy", x: 0, at: 30, half: 0.6, hit: false }];
    const events = run(oars, state, 6000, tapping(oars, "row", 200));
    assert.equal(types(events).filter((type) => type === "hurt").length, 1);
    assert.equal(state.bumps, 1);
  });

  it("no row of hazards shuts the channel", () => {
    for (const seed of [1, 7, 42, 2024, 99]) {
      const state = oars.create(specOf(oars, {}, seed));
      const rows = Map.groupBy(state.hazards, (item) => item.at);
      for (const [, row] of rows) {
        const edges = row.map((item) => [item.x - item.half, item.x + item.half]).sort((a, b) => a[0] - b[0]);
        let widest = edges[0][0] + 3.4;
        edges.forEach(([, right], index) => {
          widest = Math.max(widest, (edges[index + 1]?.[0] ?? 3.4) - right);
        });
        assert.ok(widest > 1.24, `seed ${seed}: widest gap ${widest}`);
      }
    }
  });

  it("nothing is on the water until the player has their stroke", () => {
    const state = oars.create(specOf(oars));
    assert.ok(state.hazards.every((item) => item.at >= 60));
  });

  it("every hazard shows up at least the full warning ahead of top speed", () => {
    assert.ok((60 / oars.tuning.topSpeed.max) * 1000 > MIN_WARNING_MS);
  });

  it("the finish decides the place, and the crews wait a while for a last boat", () => {
    const state = oars.create(specOf(oars));
    state.hazards = [];
    run(oars, state, 240000);
    assert.equal(state.status, "ended");
    assert.equal(oars.result(state).outcome, "lose");
  });

  it("a slower crew can be passed, and passing scores", () => {
    const state = oars.create(specOf(oars, { rivalPace: 0.55 }));
    state.hazards = [];
    const events = run(oars, state, 240000, tapping(oars, "row", 200));
    assert.ok(types(events).includes("pass"));
    assert.equal(oars.result(state).outcome, "win");
  });

  it("a shoal gives a surge past top speed", () => {
    const state = oars.create(specOf(oars));
    state.hazards = [];
    state.fish = [];
    run(oars, state, 6000, tapping(oars, "row", 200));
    const flat = state.speed;
    state.fish = [{ id: 901, x: state.x, at: state.distance + 2, taken: false }];
    run(oars, state, 1200, tapping(oars, "row", 200));
    assert.ok(state.speed > flat * 1.05, `${state.speed} after ${flat}`);
  });
});

describe("Auto Rally", () => {
  it("the owner's spec: running is the throttle, a side bend steers", () => {
    assert.equal(rickshaw.bindings.find((binding) => binding.action === "throttle").gesture, "run_step");
    assert.deepEqual(rickshaw.bindings.filter((binding) => binding.gesture.startsWith("lean")).map((binding) => binding.action), ["left", "right"]);
  });

  it("traffic stays out of the shoulder and what stands still stays on it", () => {
    const state = rickshaw.create(specOf(rickshaw));
    for (const item of state.items) assert.equal(item.lane === 0, !item.moving, JSON.stringify(item));
  });

  it("every row of traffic leaves a lane open", () => {
    for (const seed of [1, 7, 42, 2024, 99]) {
      const state = rickshaw.create(specOf(rickshaw, {}, seed));
      const rows = Map.groupBy(state.items.filter((item) => item.moving), (item) => item.at);
      for (const [, row] of rows) assert.ok(row.length <= 2, `seed ${seed}`);
    }
  });

  it("a crash costs a life and most of the speed, and blinks the auto through", () => {
    const state = rickshaw.create(specOf(rickshaw));
    state.items = [{ id: 900, kind: "taxi", lane: 2, x: state.x, at: state.distance + 12, moving: false, hit: false, passed: false }];
    const lives = state.lives;
    const events = run(rickshaw, state, 4000, tapping(rickshaw, "throttle", 200));
    assert.ok(types(events).includes("hurt"));
    assert.equal(state.lives, lives - 1);
  });

  it("a pothole jolts without costing a life", () => {
    const state = rickshaw.create(specOf(rickshaw));
    state.items = [{ id: 900, kind: "low", lane: 0, x: state.x, at: state.distance + 12, moving: false, hit: false, passed: false }];
    const lives = state.lives;
    const events = run(rickshaw, state, 4000, tapping(rickshaw, "throttle", 200));
    assert.ok(types(events).includes("bump"));
    assert.equal(state.lives, lives);
  });

  it("a checkpoint buys another leg, and the clock ends a stalled rally", () => {
    const state = rickshaw.create(specOf(rickshaw));
    state.items = [];
    state.distance = state.legM - 0.5;
    state.speed = 10;
    const before = state.clockMs;
    run(rickshaw, state, 200);
    assert.equal(state.leg, 1);
    assert.ok(state.clockMs > before);
    run(rickshaw, state, 240000);
    assert.equal(state.status, "ended");
    assert.notEqual(rickshaw.result(state).outcome, "win");
  });

  it("the traffic never starts closer than the full warning at top speed", () => {
    const closing = rickshaw.tuning.topSpeed.max - rickshaw.tuning.traffic.min;
    assert.ok((70 / closing) * 1000 > MIN_WARNING_MS);
  });

  it("the quick bot gets round on most roads, not just the seeds it was tuned on", () => {
    let wins = 0;
    for (let seed = 100; seed < 120; seed += 1) if (simulate(rickshaw, specOf(rickshaw, {}, seed), { skill: "quick" }).outcome === "win") wins += 1;
    assert.ok(wins >= 18, `${wins} of 20`);
  });
});

describe("Last Line", () => {
  // A match with the strikers held back and one shot already lined up at the zone given.
  const withShot = (zone, tuning) => {
    const state = keeper.create(specOf(keeper, tuning));
    state.nextMs = 1e9;
    state.shots = [{ id: 50, zone, ms: 0, kickMs: 1500, lifeMs: 3800, kicked: false }];
    return state;
  };

  it("the owner's nine zones, each with its own move", () => {
    const wanted = {
      tl: "reach_up_left", tc: "hands_up", tr: "reach_up_right",
      ml: "hand_left", mc: "guard", mr: "hand_right",
      bl: "kick_left", bc: "squat_down", br: "kick_right",
    };
    assert.deepEqual(ZONES.map((zone) => zone.id), Object.keys(wanted));
    for (const [zone, gesture] of Object.entries(wanted)) {
      assert.equal(keeper.bindings.find((binding) => binding.gesture === gesture).action, `save_${zone}`);
    }
    assert.equal(keeper.bindings.length, 9);
  });

  it("each zone is saved by its own move and by no other", () => {
    for (const { id } of ZONES) {
      for (const other of ZONES) {
        const state = withShot(id);
        const saved = types(keeper.act(state, `save_${other.id}`)).includes("save");
        assert.equal(saved, other.id === id, `${other.id} on a shot at ${id}`);
        assert.equal(state.shots.length, saved ? 0 : 1);
      }
    }
  });

  it("a wrong move saves nothing and costs no life, and the right move still saves after it", () => {
    const state = withShot("tc");
    const lives = state.lives;
    assert.ok(types(keeper.act(state, "save_mc")).includes("wrong_zone")); // fists pass the chin on the way up
    assert.equal(state.lives, lives);
    assert.equal(state.shots.length, 1);
    assert.ok(types(keeper.act(state, "save_tc")).includes("save"));
    assert.equal(state.lives, lives);
  });

  it("a move with no shot coming costs nothing at all", () => {
    const state = keeper.create(specOf(keeper));
    const count = () => ({ lives: state.lives, combo: state.combo, score: state.score, wrong: state.wrong, saved: state.saved });
    const before = count();
    for (const { id } of ZONES) assert.deepEqual(types(keeper.act(state, `save_${id}`)), ["reach"]);
    assert.deepEqual(count(), before);
  });

  it("a shot left alone is a goal", () => {
    const state = withShot("bl");
    const lives = state.lives;
    assert.ok(types(run(keeper, state, 3900)).includes("goal"));
    assert.equal(state.lives, lives - 1);
  });

  it("the zone lights up well before the kick, and the kick well before the ball arrives", () => {
    const state = keeper.create(specOf(keeper));
    const seen = [];
    for (let t = 0; t < 20000 && seen.length < 3; t += 20) {
      for (const event of keeper.step(state, 20)) if (["aim", "kick", "goal"].includes(event.type)) seen.push({ type: event.type, t });
    }
    assert.deepEqual(seen.map((event) => event.type), ["aim", "kick", "goal"]);
    assert.ok(seen[1].t - seen[0].t >= 1200, `lit ${seen[1].t - seen[0].t}ms before the kick`);
    assert.ok(seen[2].t - seen[0].t >= 3600, `lit ${seen[2].t - seen[0].t}ms before it arrived`);
  });

  it("plays gentler than the old match: fewer shots, a longer warning, a longer gap", () => {
    const { shots, leadMs, gapMs } = keeper.tuning;
    assert.ok(shots.default <= 24 && leadMs.default >= 3600 && gapMs.default >= 2000);
  });

  it("one zone at a time, and the strikers only warm up a little", () => {
    const state = keeper.create(specOf(keeper));
    const leads = new Map();
    run(keeper, state, 300000, (live) => {
      assert.ok(live.shots.length <= 1);
      const shot = live.shots[0];
      if (shot) leads.set(shot.id, shot.lifeMs);
      if (shot?.kicked) keeper.act(live, `save_${shot.zone}`);
    });
    assert.equal(keeper.result(state).outcome, "win");
    const [first, ...rest] = leads.values();
    assert.equal(leads.size, keeper.tuning.shots.default);
    assert.ok(rest.at(-1) < first && rest.at(-1) >= first * 0.8, `${first} to ${rest.at(-1)}`);
  });

  it("no shot is ever lit for less than the minimum, at every corner of the tuning", () => {
    const fields = Object.entries(keeper.tuning);
    for (let corner = 0; corner < 2 ** fields.length; corner += 1) {
      const tuning = Object.fromEntries(fields.map(([key, field], i) => [key, corner & (1 << i) ? field.max : field.min]));
      const state = keeper.create(specOf(keeper, tuning));
      let lead = Infinity;
      let warning = Infinity;
      run(keeper, state, 600000, (live) => {
        const shot = live.shots[0];
        if (!shot) return;
        lead = Math.min(lead, shot.lifeMs);
        warning = Math.min(warning, shot.kickMs);
        if (shot.kicked) keeper.act(live, `save_${shot.zone}`);
      });
      assert.equal(state.status, "ended", JSON.stringify(tuning));
      assert.ok(lead >= MIN_LEAD_MS, `${lead}ms at ${JSON.stringify(tuning)}`);
      assert.ok(warning >= 800, `${warning}ms before the kick at ${JSON.stringify(tuning)}`);
    }
  });

  it("never asks for the same zone twice running", () => {
    const state = keeper.create(specOf(keeper));
    const byShot = new Map();
    run(keeper, state, 300000, (live) => {
      const shot = live.shots[0];
      if (shot) byShot.set(shot.id, shot.zone);
      if (shot?.kicked) keeper.act(live, `save_${shot.zone}`);
    });
    const zones = [...byShot.values()];
    assert.equal(zones.length, keeper.tuning.shots.default);
    assert.ok(zones.every((zone, i) => zone !== zones[i - 1]));
    assert.ok(new Set(zones).size >= 8, `${new Set(zones).size} zones used`);
  });

  it("the keys sit like the goal, Q W E over A S D over Z X C, and the key bar shows all nine", () => {
    assert.equal(keeper.actions.map((action) => action.key).join(""), "qweasdzxc");
    assert.deepEqual(keeper.hud(keeper.create(specOf(keeper))).keys, keeper.actions.map((action) => action.id));
  });

  it("every move has a coach demo, a cue and a plain name for the brief", () => {
    for (const { gesture, exercise } of keeper.bindings) {
      assert.equal(typeof MOVE_POSES[gesture], "function", gesture);
      assert.ok(gestureInfo(gesture).cue, gesture);
      assert.ok(exercise, gesture);
    }
  });

  it("practice shows each zone as a held pose, with the top corners out on the diagonal", () => {
    for (const { gesture, demo } of keeper.bindings) {
      assert.equal(typeof MOVE_POSES[demo], "function", gesture);
      // Mid loop the pose is fully in, and at the start and end of the loop it is fully out: no swing between.
      const weights = (p) => MOVE_POSES[demo](p).aims.map(([, , weight]) => weight);
      assert.ok(weights(0.5).every((weight) => weight === 1), gesture);
      assert.ok(weights(0.05).every((weight) => weight === 0) && weights(0.95).every((weight) => weight === 0), gesture);
    }
    for (const side of ["left", "right"]) {
      const [[, upper]] = MOVE_POSES[`still_reach_up_${side}`](0.5).aims;
      assert.ok(Math.abs(upper[0]) > 0.5 && upper[1] > 0.5, `${side} arm points up and out`);
    }
  });

  it("a quick bot saves every shot", () => {
    for (const seed of [1, 7, 42]) {
      const result = simulate(keeper, specOf(keeper, {}, seed), { skill: "quick" });
      assert.equal(result.outcome, "win");
      assert.equal(result.stats.find((stat) => stat.label === "Saves").value, keeper.tuning.shots.default);
    }
  });
});

describe("Dahi Handi", () => {
  const climbed = (state) => {
    handi.act(state, "climb");
    return state;
  };

  it("a jump climbs and both hands up steadies, the two moves a laptop camera reads best", () => {
    assert.deepEqual(handi.bindings.map(({ gesture, action }) => [gesture, action]), [["jump", "climb"], ["hands_up", "steady"]]);
  });

  it("practice teaches each move once, with its own demo and its own key", () => {
    for (const usesCamera of [true, false]) {
      const moves = practiceMoves(handi, usesCamera);
      assert.deepEqual(moves.map((move) => move.gesture), ["jump", "hands_up"]);
      assert.deepEqual(moves.map((move) => move.action.keyLabel), ["Space", "H"]);
      for (const { demo } of moves) assert.equal(typeof MOVE_POSES[demo], "function", demo);
    }
  });

  it("a jump climbs a tier and sets the tower wobbling, and the guide turns to hands up", () => {
    const state = handi.create(specOf(handi));
    assert.equal(handi.hud(state).cue.gesture, "jump");
    assert.equal(handi.hud(state).extra, null, "the guide shows the move, not words");
    assert.equal(types(handi.act(state, "climb"))[0], "climb");
    assert.equal(state.tier, 1);
    assert.ok(wobbling(state));
    assert.ok(Math.abs(state.sway) < LEAN_AT, "a climb alone never sets off the shout");
    assert.equal(handi.hud(state).cue.gesture, "hands_up");
  });

  it("a jump while it wobbles climbs nothing and costs nothing", () => {
    const state = climbed(handi.create(specOf(handi)));
    const { sway, lives, score } = state;
    assert.deepEqual(types(handi.act(state, "climb")), ["shaky"]);
    assert.equal(state.tier, 1);
    assert.deepEqual([state.sway, state.lives, state.score], [sway, lives, score]);
  });

  it("hands up stands the tower straight, and it stays straight however long the next jump takes", () => {
    const state = climbed(handi.create(specOf(handi)));
    assert.equal(types(handi.act(state, "steady"))[0], "clear");
    assert.equal(state.sway, 0);
    run(handi, state, 20000);
    assert.equal(state.sway, 0);
    assert.equal(handi.hud(state).cue.gesture, "jump");
    handi.act(state, "climb");
    assert.equal(state.tier, 2);
  });

  it("arms can only go up so fast", () => {
    const state = climbed(handi.create(specOf(handi)));
    handi.act(state, "steady");
    climbed(state);
    assert.deepEqual(handi.act(state, "steady"), []);
    assert.ok(wobbling(state));
  });

  it("a wobble grows by itself, the shout gives a full warning, and the tower falls a tier for a life", () => {
    const state = climbed(climbed(handi.create(specOf(handi, { swayRate: handi.tuning.swayRate.max }))));
    assert.equal(state.tier, 1, "the second jump was too soon");
    let warned = null;
    const events = run(handi, state, 20000, (live, t) => {
      if (warned === null && Math.abs(live.sway) >= LEAN_AT) warned = t;
      if (live.falls) live.status = "paused";
    });
    state.status = "playing";
    const fell = events.findIndex((event) => event.type === "fall");
    assert.ok(fell >= 0);
    assert.equal(state.tier, 0);
    assert.equal(state.lives, state.startLives - 1);
    assert.equal(handi.hud(state).extra, "Tower fell. Regroup");
    assert.equal(handi.hud(state).cue, null);
    assert.ok(state.t - warned >= MIN_WARNING_MS, `${state.t - warned} ms`);
  });

  it("the climber regroups after a fall and can climb again, and enough falls lose the round", () => {
    const state = handi.create(specOf(handi, { lives: 2 }));
    const events = run(handi, state, 120000, (live) => {
      if (!wobbling(live)) handi.act(live, "climb");
    });
    assert.equal(state.status, "ended");
    assert.equal(handi.result(state).outcome, "lose");
    assert.ok(types(events).filter((type) => type === "fall").length === 2);
    assert.ok(state.climbed >= 2, "it climbed again after the first fall");
  });

  it("a jump from the top smashes the pot, the hero comes down, and the next pot hangs a tier higher", () => {
    const state = handi.create(specOf(handi, { pots: 2, tiers: 2 }));
    state.tier = 2;
    assert.equal(handi.hud(state).cue.gesture, "jump");
    const events = handi.act(state, "climb");
    assert.deepEqual(types(events), ["leap", "smash"]);
    assert.equal(events[1].last, false);
    assert.deepEqual([state.broken, state.tier, state.pot, state.won], [1, 0, 1, false]);
    assert.equal(potHeight(state), 3);
    assert.equal(handi.hud(state).extra, "Pot smashed!");
    assert.equal(handi.hud(state).cue, null);
    assert.deepEqual(handi.act(state, "climb"), [], "the crew is still building the next tower");
    assert.ok(types(run(handi, state, 3000)).includes("ready"));
    state.tier = 3;
    assert.equal(handi.act(state, "climb")[1].last, true);
    assert.equal(state.won, true);
    run(handi, state, 5000);
    assert.equal(handi.result(state).outcome, "win");
  });

  it("the clock ends a round that is not finished, and that is not a win", () => {
    const state = handi.create(specOf(handi, { durationS: 45 }));
    const events = run(handi, state, 60000);
    assert.equal(state.t, 45000);
    assert.ok(types(events).includes("timeout"));
    assert.equal(handi.result(state).outcome, "complete");
  });

  it("the last pot's celebration plays out even with the clock run down", () => {
    const state = handi.create(specOf(handi, { pots: 1 }));
    state.tier = potHeight(state);
    state.t = state.durationMs - 100;
    handi.act(state, "climb");
    run(handi, state, 1000);
    assert.equal(state.status, "playing");
    run(handi, state, 5000);
    assert.equal(handi.result(state).outcome, "win");
  });

  it("the guide on screen always shows the move the bot would make", () => {
    const state = handi.create(specOf(handi));
    run(handi, state, 60000, (live) => {
      const wanted = handi.bot(live, "quick");
      const cue = handi.hud(live).cue;
      if (wanted === "climb") assert.equal(cue.gesture, "jump");
      if (wanted === "steady") assert.equal(cue.gesture, "hands_up");
      if (wanted) handi.act(live, wanted);
    });
    assert.equal(handi.result(state).outcome, "win");
  });

  it("a jump and a hands up through the session climb and steady", () => {
    const session = new GameSession(specOf(handi), { usesCamera: true });
    session.tick(3100);
    session.handleGesture({ gesture: "jump", t: 0, confidence: 0.9 });
    assert.equal(session.state.tier, 1);
    session.tick(400);
    session.handleGesture({ gesture: "hands_up", t: 400, confidence: 0.9 });
    assert.equal(session.state.sway, 0);
    session.tick(400);
    session.handleGesture({ gesture: "jump", t: 800, confidence: 0.9 });
    assert.equal(session.state.tier, 2);
  });
});

describe("Cardio Circuit", () => {
  const atSet = (state) => {
    run(circuit, state, 8000, (live) => {
      if (live.phase === "set") live.status = "paused";
    });
    state.status = "playing";
    return state;
  };

  it("the deck covers every locked and every cardio move", () => {
    const bound = new Set(circuit.bindings.map((binding) => binding.gesture));
    for (const move of [...LOCKED_MOVES, ...CARDIO_MOVES]) assert.ok(bound.has(move), move);
  });

  it("a full round meets every exercise, once", () => {
    const state = circuit.create(specOf(circuit, { sets: circuit.tuning.sets.max }));
    assert.equal(new Set(state.round).size, EXERCISES.length);
  });

  it("a round starts gently and builds", () => {
    const state = circuit.create(specOf(circuit));
    const levels = state.round.map((id) => EXERCISES.find((item) => item.id === id).level);
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  });

  it("different seeds meet different moves", () => {
    const a = circuit.create(specOf(circuit, {}, 1)).round;
    const b = circuit.create(specOf(circuit, {}, 2)).round;
    assert.notDeepEqual(a, b);
  });

  it("every exercise has a key of its own and a pose or clip to show", async () => {
    const keys = EXERCISES.map((exercise) => exercise.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const { key } of circuit.actions) assert.ok(key);
  });

  it("the called move counts, and damages the king", () => {
    const state = atSet(circuit.create(specOf(circuit)));
    const exercise = calledExercise(state);
    const health = state.health;
    assert.deepEqual(types(circuit.act(state, exercise.id)), ["rep"]);
    assert.equal(state.done, 1);
    assert.ok(state.health < health);
  });

  it("a move that isn't called is ignored and costs nothing", () => {
    const state = atSet(circuit.create(specOf(circuit)));
    const other = EXERCISES.find((item) => item.id !== calledExercise(state).id);
    const health = state.health;
    assert.deepEqual(circuit.act(state, other.id), []);
    assert.equal(state.done, 0);
    assert.equal(state.health, health);
    assert.equal(state.offCall, 1);
  });

  it("a rep during the rest doesn't count", () => {
    const state = circuit.create(specOf(circuit));
    assert.equal(state.phase, "rest");
    assert.deepEqual(circuit.act(state, calledExercise(state).id), []);
  });

  it("a key held down or mashed can't outrun a body", () => {
    const state = atSet(circuit.create(specOf(circuit)));
    state.round[state.index] = "reach";
    circuit.act(state, "reach");
    circuit.act(state, "reach");
    assert.equal(state.done, 1);
    run(circuit, state, 500);
    circuit.act(state, "reach");
    assert.equal(state.done, 2);
  });

  it("fast moves ask for more beats and hard moves for fewer reps", () => {
    const beats = EXERCISES.find((item) => item.beats);
    const hard = EXERCISES.find((item) => item.hard);
    const plain = EXERCISES.find((item) => !item.beats && !item.hard);
    assert.ok(repsFor(beats, 6) > repsFor(plain, 6));
    assert.ok(repsFor(hard, 6) < repsFor(plain, 6));
  });

  it("both sides of an exercise count through the session", () => {
    const session = new GameSession(specOf(circuit), { usesCamera: true });
    session.tick(3100);
    atSet(session.state);
    session.state.round[session.state.index] = "curl";
    session.handleGesture({ gesture: "curl_left", t: 0, confidence: 0.9 });
    session.tick(600);
    session.handleGesture({ gesture: "curl_right", t: 1, confidence: 0.9 });
    assert.equal(session.state.done, 2);
  });

  it("a finished set moves to the next exercise, after a rest", () => {
    const state = atSet(circuit.create(specOf(circuit, { reps: 3 })));
    const first = calledExercise(state);
    state.done = repsFor(first, 3) - 1;
    const events = circuit.act(state, first.id);
    assert.ok(types(events).includes("set_done"));
    assert.equal(state.phase, "rest");
    assert.equal(state.index, 1);
  });

  it("a set that runs out heals him, and moves on with no other penalty", () => {
    const state = atSet(circuit.create(specOf(circuit)));
    state.health -= 1;
    const health = state.health;
    assert.ok(types(run(circuit, state, state.setMs + 100)).includes("short"));
    assert.ok(state.health > health);
    assert.equal(state.index, 1);
  });

  it("the warning before a set is never under the full time", () => {
    assert.ok(circuit.tuning.restMs.min >= MIN_WARNING_MS);
  });

  const dropping = (sets) => {
    const state = circuit.create(specOf(circuit));
    run(circuit, state, 900000, (live) => {
      if (live.index < sets) return;
      const wanted = circuit.bot(live, "casual");
      if (wanted) circuit.act(live, wanted);
    });
    return circuit.result(state).outcome;
  };

  it("a beginner can drop a set and still knock him out", () => {
    assert.equal(dropping(1), "win");
  });

  it("dropping more than that finishes the workout, and is never a loss", () => {
    assert.equal(dropping(3), "complete");
  });

  it("the hud shows the one key that matters", () => {
    const state = atSet(circuit.create(specOf(circuit)));
    assert.deepEqual(circuit.hud(state).keys, [calledExercise(state).id]);
  });
});

describe("the fixture picks these games from an idea", () => {
  for (const [idea, id] of [
    ["Save shots flying at the nine zones of the goal.", "keeper"],
    ["A fishing boat race where I pump my arms.", "oars"],
    ["Drive an auto rickshaw by running on the spot.", "rickshaw"],
    ["Climb a human pyramid and break the dahi handi.", "handi"],
    ["A cardio circuit that counts my reps.", "circuit"],
  ]) {
    it(`"${idea}" is ${id}`, async () => {
      assert.equal((await clarifyIdea({ idea }, createFixtureProvider())).brief.template, id);
    });
  }
});
