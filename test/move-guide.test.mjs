// The move guide: each game says the move it wants as a gesture, and range.js turns that gesture into
// a start pose, an end pose and the path of the moving hand, foot or hips. No camera and no drawing.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LM } from "../src/lib/motion/landmarks.js";
import { BODY, cueGestures, rangeOf } from "../src/lib/motion/range.js";
import { SPEC_VERSION, DEFAULT_HERO, DEFAULT_RIVAL } from "../src/lib/spec/contract.js";
import { MOVE_POSES } from "../src/lib/stage/coach.js";
import { EXERCISES } from "../src/lib/templates/circuit.js";
import { ZONES } from "../src/lib/templates/keeper.js";
import { TEMPLATES, defaultTuning, templateInfo } from "../src/lib/templates/index.js";
import { REACTION_MS as REACTIONS, STRIKE_MOVES } from "../src/lib/templates/shared.js";

const REACTION_MS = REACTIONS.quick;
// The games that call a body move. The rest are played by aim, by place or by a free choice of move.
const TEMPLATES_CUED = ["bout", "pads", "keeper", "matka", "blades", "sights", "handi", "oars", "rickshaw", "rally", "circuit"];

function specOf(template, tuning = {}, seed = 7) {
  return {
    specVersion: SPEC_VERSION, template: template.id, title: "Test", objective: "Test.", seed,
    skin: { world: "downtown", style: "bright", hero: { ...DEFAULT_HERO }, rival: { ...DEFAULT_RIVAL } },
    tuning: { ...defaultTuning(template), ...tuning },
  };
}

// Plays a round with the template's own bot, as simulate does, and hands each moment to look.
function play(template, { seed = 7, ms = 90000, look = () => {} } = {}) {
  const state = template.create(specOf(template, {}, seed));
  let pending = [];
  for (let t = 0; t < ms && state.status === "playing"; t += 20) {
    const wanted = template.bot(state, "quick");
    look(state, wanted);
    if (wanted && !pending.some((item) => item.action === wanted)) pending.push({ action: wanted, at: t + REACTION_MS });
    for (const item of pending.filter((entry) => entry.at <= t)) template.act(state, item.action);
    pending = pending.filter((entry) => entry.at > t);
    template.step(state, 20);
  }
  return state;
}

const demoOf = (template, gesture) => template.bindings.find((binding) => binding.gesture === gesture)?.demo ?? gesture;
const hips = (points) => ({ x: (points[LM.leftHip].x + points[LM.rightHip].x) / 2, y: (points[LM.leftHip].y + points[LM.rightHip].y) / 2 });
const pathOf = (range, end) => range.paths.find((path) => path.end === end)?.points;
const finish = (range, end) => pathOf(range, end).at(-1);
const begin = (range, end) => pathOf(range, end)[0];

describe("range of motion", () => {
  const cuedGestures = new Set();
  for (const id of TEMPLATES_CUED) {
    const template = templateInfo(id);
    for (const { gesture, demo } of template.bindings) cuedGestures.add(demo ?? gesture);
  }

  it("every move a cued game binds has a guide that goes somewhere, inside a body's reach", () => {
    for (const gesture of cuedGestures) {
      const range = rangeOf(gesture);
      assert.ok(range, `${gesture} has no guide`);
      assert.ok(range.paths.length > 0, `${gesture} has no path`);
      const moved = Object.values(LM).some((index) => {
        const a = range.start.points[index];
        const b = range.end.points[index];
        return Math.hypot(a.x - b.x, a.y - b.y) > 0.05;
      });
      assert.ok(moved, `${gesture} starts where it ends`);
      for (const skeleton of [range.start, range.end]) {
        for (const index of Object.values(LM)) {
          const point = skeleton.points[index];
          assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `${gesture} joint ${index}`);
        }
      }
      for (const path of range.paths) {
        for (const point of path.points) {
          assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `${gesture} path`);
          assert.ok(Math.abs(point.x) < 3.5 && point.y > -3 && point.y < 4, `${gesture} leaves the body's reach: ${point.x}, ${point.y}`);
        }
      }
      for (const value of Object.values(range.box)) assert.ok(Number.isFinite(value), `${gesture} box`);
      assert.ok(range.end.lit.length > 0, `${gesture} lights no limb`);
    }
  });

  it("starts from standing, shoulders level at the origin, in torso lengths like the coach's ghost", () => {
    const range = rangeOf("hand_left");
    const { points } = range.start;
    assert.ok(Math.abs((points[LM.leftShoulder].y + points[LM.rightShoulder].y) / 2) < 0.01);
    assert.ok(Math.abs((points[LM.leftShoulder].x + points[LM.rightShoulder].x) / 2) < 0.01);
    assert.ok(Math.abs(hips(points).y - 1) < 0.01, "the hips sit one torso below the shoulders");
    assert.ok(points[LM.leftShoulder].x < 0, "the player's left is the screen's left");
    assert.ok(points[LM.leftAnkle].y > 2, "the feet stand on the floor below");
  });

  it("each move goes the way it says", () => {
    assert.ok(finish(rangeOf("step_left"), BODY).x < -0.8);
    assert.ok(finish(rangeOf("step_right"), BODY).x > 0.8);
    assert.ok(finish(rangeOf("jump"), BODY).y < begin(rangeOf("jump"), BODY).y - 0.4, "a jump lifts the hips");
    assert.ok(finish(rangeOf("squat_down"), BODY).y > begin(rangeOf("squat_down"), BODY).y + 0.3, "a squat drops them");
    for (const [gesture, wrist] of [["punch_left", LM.leftWrist], ["punch_right", LM.rightWrist]]) {
      const path = rangeOf(gesture).paths.find((item) => item.end === wrist);
      assert.ok(path.toward > 0.3, `${gesture} comes at the screen`);
      assert.ok(finish(rangeOf(gesture), wrist).z > begin(rangeOf(gesture), wrist).z + 0.3);
    }
    assert.ok(finish(rangeOf("punch_right"), LM.rightWrist).x < begin(rangeOf("punch_right"), LM.rightWrist).x - 0.1, "a cross comes in to the middle");
    assert.equal(rangeOf("hook_left").paths.every((path) => !path.toward), true, "a hook swings across, not at you");
    for (const end of [LM.leftWrist, LM.rightWrist]) assert.ok(finish(rangeOf("hands_up"), end).y < -0.8, "both hands end above the head");
    assert.ok(finish(rangeOf("still_reach_up_left"), LM.leftWrist).x < -0.8, "the keeper's top corner is up and out");
    assert.ok(finish(rangeOf("kick_left"), LM.leftAnkle).x < -1);
    assert.ok(finish(rangeOf("lean_left"), LM.nose).x < -0.4, "a lean tips the head over");
    assert.ok(finish(rangeOf("hook_left"), LM.leftElbow).x < begin(rangeOf("hook_left"), LM.leftElbow).x, "a hook swings the elbow out");
    const uppercut = rangeOf("uppercut_right");
    assert.ok(finish(uppercut, LM.rightWrist).y < begin(uppercut, LM.rightWrist).y - 0.6, "an uppercut drives up from the dip");
  });

  it("a speed move is a path to sweep fast, from its wind-up across to its finish", () => {
    for (const gesture of ["slash_left", "slash_right", "swing_left", "swing_right", "uppercut_left", "uppercut_right"]) assert.equal(rangeOf(gesture).fast, true, gesture);
    for (const gesture of ["step_left", "jump", "punch_left", "hands_up", "guard"]) assert.equal(rangeOf(gesture).fast, false, gesture);
    const left = rangeOf("slash_left").paths[0].points;
    assert.ok(left.at(-1).x < left[0].x - 1, "a slash left sweeps to the left");
    const right = rangeOf("slash_right").paths[0].points;
    assert.ok(right.at(-1).x > right[0].x + 1, "a slash right sweeps to the right");
  });

  it("is built once per move, and from the coach's poses as they are now", () => {
    assert.equal(rangeOf("jump"), rangeOf("jump"));
    assert.equal(rangeOf("not_a_move"), null);
    MOVE_POSES.test_reach = (p) => ({ aims: [["upperarm_r", [-1, 0, 0], p], ["lowerarm_r", [-1, 0, 0], p]] });
    try {
      const range = rangeOf("test_reach");
      assert.ok(range, "a pose added to the coach gets a guide with no copy kept here");
      assert.ok(finish(range, LM.leftWrist).x < -1.2);
    } finally {
      delete MOVE_POSES.test_reach;
    }
  });

  it("running on the spot borrows the knee lift, since the coach shows it with a clip", () => {
    assert.ok(rangeOf("run_step"));
    assert.ok(finish(rangeOf("run_step"), LM.leftKnee).y < begin(rangeOf("run_step"), LM.leftKnee).y - 0.4);
  });

  it("a cue names one move or several", () => {
    assert.deepEqual(cueGestures(null), []);
    assert.deepEqual(cueGestures({ gesture: "jump" }), ["jump"]);
    assert.deepEqual(cueGestures({ gesture: ["swing_left", "swing_right"] }), ["swing_left", "swing_right"]);
  });
});

describe("move cues", () => {
  it("every cued game asks only for moves it binds, each with a guide, and urgency from 0 to 1", () => {
    for (const id of TEMPLATES_CUED) {
      const template = templateInfo(id);
      const bound = new Set(template.bindings.map((binding) => binding.gesture));
      let cues = 0;
      for (const seed of [3, 7]) {
        play(template, { seed, look: (state) => {
          const { cue } = template.hud(state);
          if (!cue) return;
          cues += 1;
          const gestures = cueGestures(cue);
          assert.ok(gestures.length > 0, id);
          for (const gesture of gestures) {
            assert.ok(bound.has(gesture), `${id} cues ${gesture}, which it doesn't bind`);
            assert.ok(rangeOf(demoOf(template, gesture)), `${id}: ${gesture} has no guide`);
          }
          assert.ok(cue.urgency >= 0 && cue.urgency <= 1, `${id} urgency ${cue.urgency}`);
        } });
      }
      assert.ok(cues > 0, `${id} never cued a move`);
    }
  });

  it("games played by aim or by place need no guide", () => {
    for (const template of TEMPLATES.filter((item) => !TEMPLATES_CUED.includes(item.id))) {
      play(template, { ms: 20000, look: (state) => assert.equal(template.hud(state).cue ?? null, null, template.id) });
    }
  });

  it("the guide shows the move the bot is about to make", () => {
    for (const id of ["bout", "pads", "keeper", "matka", "handi"]) {
      const template = templateInfo(id);
      let agreed = 0;
      play(template, { look: (state, wanted) => {
        const { cue } = template.hud(state);
        if (!wanted || !cue) return;
        const actions = cueGestures(cue).map((gesture) => template.bindings.find((binding) => binding.gesture === gesture).action);
        assert.ok(actions.includes(wanted), `${id}: the bot wants ${wanted}, the guide shows ${cueGestures(cue)}`);
        agreed += 1;
      } });
      assert.ok(agreed > 0, id);
    }
  });

  it("no cued game spells the move in its HUD words while it cues", () => {
    const words = /step left|step right|duck|jab|cross|hook|uppercut|slash|lean|pump|hands up|jump|guard|squat|toss|swing|run on|hand up|arm out|leg out|fists/i;
    for (const id of TEMPLATES_CUED) {
      const template = templateInfo(id);
      play(template, { ms: 40000, look: (state) => {
        const { cue, extra } = template.hud(state);
        if (cue && extra) assert.doesNotMatch(extra, words, `${id} says "${extra}"`);
      } });
    }
  });

  it("Pad Rounds picks the arm from the punch and the pad's side", () => {
    const pads = templateInfo("pads");
    const state = pads.create(specOf(pads));
    for (const [punch, side, gesture] of [["jab", -1, "punch_left"], ["cross", 1, "punch_right"], ["hook", -1, "hook_left"], ["hook", 1, "hook_right"], ["uppercut", 1, "uppercut_right"]]) {
      state.pad = { id: 1, punch, side, height: 1.3, ms: 400, lifeMs: 1600 };
      const { cue, extra } = pads.hud(state);
      assert.equal(cue.gesture, gesture);
      assert.equal(cue.urgency, 0.25);
      assert.equal(cue.label.toLowerCase(), punch);
      assert.notEqual(extra, punch);
    }
  });

  it("Last Line asks for its zone's move, and only the zone's own move", () => {
    const keeper = templateInfo("keeper");
    for (const zone of ZONES) {
      const state = keeper.create(specOf(keeper));
      state.shots = [{ id: 1, zone: zone.id, ms: 950, kickMs: 1500, lifeMs: 3800, kicked: false }];
      assert.equal(keeper.hud(state).cue.gesture, zone.gesture);
      assert.equal(keeper.hud(state).extra, null);
      assert.equal(keeper.hud(state).cue.urgency, 0.25);
    }
    assert.equal(keeper.hud(keeper.create(specOf(keeper))).cue, null);
  });

  it("Matka Beats and Blade March cue the strike for the next pot or raider", () => {
    const matka = templateInfo("matka");
    const state = matka.create(specOf(matka));
    for (const { dir, gesture } of STRIKE_MOVES) {
      state.pots = [{ id: 1, at: state.t + 400, dir, kind: dir }];
      assert.equal(matka.hud(state).cue.gesture, gesture);
    }
    state.pots = [{ id: 1, at: state.t + state.approachMs, dir: "left", kind: "left" }];
    assert.equal(matka.hud(state).cue, null, "a pot only just swinging in is not called yet");

    const blades = templateInfo("blades");
    const march = blades.create(specOf(blades));
    march.enemies = [{ id: 1, side: "up", heavy: false, ms: 900, arriveMs: 1500 }];
    assert.equal(blades.hud(march).cue.gesture, "jump");
    march.enemies = [{ id: 1, side: "left", heavy: true, ms: 900, arriveMs: 1500 }];
    assert.equal(blades.hud(march).cue.gesture, "guard");
    march.enemies = [];
    assert.equal(blades.hud(march).cue, null);
  });

  it("Twin Sights cues a jump for a barrel and a squat for a crowd, and leaves aiming to the hands", () => {
    const sights = templateInfo("sights");
    const state = sights.create(specOf(sights));
    state.rolls = [{ id: 1, ms: 9000, arriveMs: 9600 }];
    assert.equal(sights.hud(state).cue.gesture, "jump");
    assert.equal(sights.hud(state).extra, `Grenades: ${state.grenades}`);
  });

  it("the drives cue a lean round a block and the arms or legs when stopped", () => {
    for (const [id, stopped] of [["oars", "arm_pump"], ["rickshaw", "run_step"]]) {
      const template = templateInfo(id);
      const state = template.create(specOf(template));
      state.speed = 0;
      assert.equal(template.hud(state).cue?.gesture, stopped, id);
    }
    const oars = templateInfo("oars");
    const boat = oars.create(specOf(oars));
    boat.speed = boat.top;
    boat.hazards = [{ id: 1, kind: "rock", x: boat.x + 0.2, at: boat.distance + 4, half: 1, hit: false }];
    assert.equal(oars.hud(boat).cue.gesture, "lean_left", "a rock a little to the right is passed on the left");
    assert.equal(oars.hud(boat).extra, null);

    const rickshaw = templateInfo("rickshaw");
    const auto = rickshaw.create(specOf(rickshaw));
    auto.speed = auto.top;
    auto.items = [{ id: 1, kind: "wall", lane: 0, x: auto.x - 0.3, at: auto.distance + 6, moving: false, hit: false, passed: false }];
    assert.equal(rickshaw.hud(auto).cue.gesture, "lean_right");
    assert.match(rickshaw.hud(auto).extra, /^Leg 1 of/, "the leg count stays, the turn is the guide's");
  });

  it("Baseline Rally cues the toss, then the swing on the ball's side", () => {
    const rally = templateInfo("rally");
    const state = rally.create(specOf(rally));
    assert.deepEqual(rally.hud(state).cue.gesture, ["reach_up_left", "reach_up_right"]);
    rally.act(state, "toss");
    assert.deepEqual(rally.hud(state).cue.gesture, ["swing_left", "swing_right"]);
    state.phase = "incoming";
    state.ball = { side: "right", flightMs: 1000, ms: 500 };
    assert.equal(rally.hud(state).cue.gesture, "swing_right");
    assert.equal(rally.hud(state).cue.urgency, 0.5);
  });

  it("Cardio Circuit cues the called exercise's moves, the next one early during the rest", () => {
    const circuit = templateInfo("circuit");
    const state = circuit.create(specOf(circuit));
    const exercise = EXERCISES.find((item) => item.id === state.round[state.index]);
    const resting = circuit.hud(state);
    assert.deepEqual(resting.cue.gesture, exercise.moves);
    assert.equal(resting.cue.label, exercise.label);
    assert.equal(resting.cue.urgency, 0);
    assert.doesNotMatch(resting.extra, new RegExp(exercise.label));
  });

  it("Counter Bout cues nothing outside a shot", () => {
    const bout = templateInfo("bout");
    const state = bout.create(specOf(bout));
    assert.equal(bout.hud(state).cue, null);
  });
});
