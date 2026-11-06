import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { Calibrator } from "../src/lib/motion/calibrate.js";
import { CURSOR, RECORDED_MOVES, REACTION_CLIPS, SPEED_INPUTS } from "../src/lib/motion/catalogue.js";
import { HandCursors } from "../src/lib/motion/cursor.js";
import { CARDIO_MOVES, GestureEngine, LOCKED_MOVES, MOVE_READINGS } from "../src/lib/motion/gestures.js";
import { LandmarkSmoother } from "../src/lib/motion/landmarks.js";
import { onDot, practiceMoves } from "../src/lib/game/practice.js";
import { templateInfo } from "../src/lib/templates/index.js";
import { GESTURES, gestureInfo } from "../src/lib/spec/contract.js";
import { BODIES, playTimeline } from "./helpers/body.mjs";

const body = BODIES.midRange;
const ALL = [...LOCKED_MOVES, ...CARDIO_MOVES, "flap", "guard_end"];

function calibrate() {
  const calibrator = new Calibrator({ framing: "full" });
  let result = null;
  playTimeline(body, [[2400, {}]], (points, t) => {
    if (!result?.done) result = calibrator.push(points, t);
  });
  return result.calibration;
}

function run(timeline, moves = ALL) {
  const engine = new GestureEngine(calibrate(), { framing: "full", moves });
  const smoother = new LandmarkSmoother();
  const names = [];
  const features = [];
  playTimeline(body, [[500, {}], ...timeline, [500, {}]], (points, t) => {
    const result = engine.push(smoother.push(points, t), t);
    names.push(...result.events.map((event) => event.gesture));
    if (result.features) features.push(result.features);
  });
  return { names, features };
}

const held = (pose, ms = 400) => [[220, (p) => scaled(pose, p)], [ms, pose], [220, (p) => scaled(pose, 1 - p)]];
const scaled = (pose, p) => Object.fromEntries(Object.entries(pose).map(([key, value]) => [key, typeof value === "number" ? value * p : value]));
const armsUp = { leftArm: { wrist: [-0.2, -1.2] }, rightArm: { wrist: [0.2, -1.2] } };

const MOVES = {
  jumping_jack: held({ leftFootOut: 0.4, rightFootOut: 0.4, ...armsUp }),
  step_jack: held({ leftFootOut: 0.6, ...armsUp }),
  butt_kick_left: held({ leftHeel: 0.8 }),
  butt_kick_right: held({ rightHeel: 0.8 }),
  lunge: held({ drop: 0.4, leftHeel: 0.25 }),
  side_lunge_left: held({ x: -0.5, drop: 0.35, leftFootOut: 0.3 }),
  side_lunge_right: held({ x: 0.5, drop: 0.35, rightFootOut: 0.3 }),
  skater_left: held({ x: -0.7, rightHeel: 0.35 }),
  skater_right: held({ x: 0.7, leftHeel: 0.35 }),
  toe_touch: held({ handsDown: true, drop: 0.2 }),
  windmill_left: held({ rightArm: { wrist: [-0.85, 2.6] } }),
  windmill_right: held({ leftArm: { wrist: [0.85, 2.6] } }),
  cross_crunch_left: held({ leftKnee: 0.7, rightArm: { wrist: [-0.7, 0.6], elbow: [-0.65, 1.2] } }),
  cross_crunch_right: held({ rightKnee: 0.7, leftArm: { wrist: [0.7, 0.6], elbow: [0.65, 1.2] } }),
  twist_left: held({ turn: 0.4 }),
  twist_right: held({ turn: -0.4 }),
  curl_left: held({ leftArm: { wrist: [0.05, 0.1], elbow: [0.02, 0.8] } }),
  curl_right: held({ rightArm: { wrist: [-0.05, 0.1], elbow: [-0.02, 0.8] } }),
};

describe("cardio moves", () => {
  for (const [gesture, timeline] of Object.entries(MOVES)) {
    it(`reads ${gesture} once`, () => {
      assert.equal(run(timeline, [gesture]).names.filter((name) => name === gesture).length, 1);
    });
  }

  it("standing still fires nothing", () => {
    assert.deepEqual(run([[4000, {}]]).names, []);
  });

  it("every cardio move can be told how it is doing, and has words to teach it", () => {
    for (const gesture of CARDIO_MOVES) {
      assert.ok(gestureInfo(gesture)?.cue, `${gesture} has no cue`);
      if (!["squat_jump", "arm_pump", "wood_chop"].includes(gesture)) assert.ok(MOVE_READINGS[gesture], `${gesture} has no reading`);
    }
  });

  it("a plain squat is not a lunge, and a plain jump is not a squat jump", () => {
    assert.equal(run(held({ drop: 0.45 }), ["lunge"]).names.length, 0);
    assert.equal(run(held({ rise: 0.5, feetRise: 0.4 }, 200), ["squat_jump"]).names.length, 0);
  });

  it("a jump straight out of a squat is a squat jump", () => {
    const timeline = [[300, (p) => ({ drop: 0.5 * p })], [300, { drop: 0.5 }], [200, (p) => ({ drop: 0.5 * (1 - p) })], [220, { rise: 0.5, feetRise: 0.4 }]];
    assert.deepEqual(run(timeline, ["squat_jump"]).names, ["squat_jump"]);
  });

  it("hands up on their own are not a jack, and one foot out is not a full jack", () => {
    assert.equal(run(held(armsUp), ["jumping_jack", "step_jack"]).names.length, 0);
    assert.equal(run(MOVES.step_jack, ["jumping_jack"]).names.length, 0);
    assert.equal(run(MOVES.jumping_jack, ["step_jack"]).names.length, 0);
  });

  it("both hands chopping down together are a wood chop, and one hand is only a slash", () => {
    const hands = (y) => ({ leftArm: { wrist: [0.38, y] }, rightArm: { wrist: [-0.38, y] } });
    const chop = [[1500, (p) => hands(1.15 - 1.35 * p)], [170, (p) => hands(-0.2 + 1.4 * p)], [900, hands(1.2)]];
    assert.deepEqual(run(chop, ["wood_chop"]).names, ["wood_chop"]);
    const one = (y) => ({ rightArm: { wrist: [-0.08, y] } });
    assert.deepEqual(run([[1500, (p) => one(1.15 - 1.35 * p)], [170, (p) => one(-0.2 + 1.4 * p)], [900, one(1.2)]], ["wood_chop"]).names, []);
  });

  it("a guard reports when it drops, so a game can hold it", () => {
    const guard = { leftArm: { wrist: [0.4, -0.35] }, rightArm: { wrist: [-0.4, -0.35] } };
    assert.deepEqual(run([[300, (p) => ({ leftArm: { wrist: [0.4 - 0.32 * (1 - p), 1.15 - 1.5 * p] }, rightArm: { wrist: [-0.4 + 0.32 * (1 - p), 1.15 - 1.5 * p] } })], [400, guard]], ["guard", "guard_end"]).names, ["guard", "guard_end"]);
  });
});

describe("the jab", () => {
  const guard = (x, y) => ({ wrist: [x, y], elbow: [x * 0.5, 0.5] });
  const fromGuard = (side, out) => {
    const key = `${side}Arm`;
    const dir = side === "left" ? -1 : 1;
    const inward = -dir * 0.38;
    return [[900, (p) => ({ [key]: guard(dir * 0.08 + (inward - dir * 0.08) * p, 1.15 - 1.5 * p) })], [200, { [key]: guard(inward, -0.35) }], [180, (p) => ({ [key]: guard(inward + (dir * out - inward) * p, -0.35 + 0.35 * p) })], [250, { [key]: guard(dir * out, 0) }]];
  };

  it("reads a fist going out from guard and slightly to the side, with no depth at all", () => {
    assert.deepEqual(run(fromGuard("left", 0.75), ["punch_left", "punch_right"]).names, ["punch_left"]);
    assert.deepEqual(run(fromGuard("right", 0.75), ["punch_left", "punch_right"]).names, ["punch_right"]);
  });

  it("an arm that drifts out without leaving guard is not a jab", () => {
    const arm = (angle) => ({ leftArm: { wrist: [-1.15 * Math.sin(angle), 1.15 * Math.cos(angle)] } });
    assert.deepEqual(run([[700, (p) => arm(p * 1.5)], [300, arm(1.5)]], ["punch_left"]).names, []);
  });
});

describe("speed and tilt", () => {
  const steps = (beats, ms, make) => Array.from({ length: beats }, (_, beat) => [ms, make(beat % 2 === 0)]);

  it("reports how fast each fast move is going, and only those", () => {
    const legs = run(steps(10, 200, (left) => (left ? { leftHeel: 0.3 } : { rightHeel: 0.3 })));
    assert.ok(Math.max(...legs.features.map((f) => f.speed.legs)) >= 3, "running reads as speed");
    const hand = (up) => ({ wrist: up ? [0, -0.1] : [0, 0.75], elbow: [0.1, 0.6] });
    const arms = run(steps(10, 200, (left) => ({ leftArm: hand(left), rightArm: hand(!left) })));
    assert.ok(Math.max(...arms.features.map((f) => f.speed.arms)) >= 3, "pumping arms read as speed");
    assert.ok(arms.names.includes("arm_pump"));
    assert.equal(Math.max(...arms.features.map((f) => f.speed.legs)), 0);
  });

  it("a rope skip is a bounce, and counts as legs", () => {
    const { names, features } = run(steps(10, 170, (up) => (up ? { rise: 0.14, feetRise: 0.14 } : {})));
    assert.ok(names.filter((name) => name === "bounce").length >= 4);
    assert.ok(Math.max(...features.map((f) => f.speed.legs)) >= 2);
  });

  it("speed fades when the player stops", () => {
    const { features } = run([...steps(8, 200, (left) => (left ? { leftHeel: 0.3 } : { rightHeel: 0.3 })), [2000, {}]]);
    assert.equal(features.at(-1).speed.legs, 0);
  });

  it("tilt follows a side bend, rests at zero, and stops at the ends", () => {
    const tilted = (lean) => run([[300, (p) => ({ lean: lean * p })], [300, { lean }]]).features.reduce((far, f) => (Math.abs(f.tilt) > Math.abs(far) ? f.tilt : far), 0);
    assert.equal(run([[1000, {}]]).features.at(-1).tilt, 0);
    assert.ok(tilted(-0.3) < -0.3 && tilted(-0.3) > -0.8);
    assert.equal(tilted(0.9), 1);
  });

  it("only moves that can be done fast feed speed", () => {
    const fast = Object.values(SPEED_INPUTS).flatMap((input) => input.moves);
    assert.deepEqual(fast.sort(), ["arm_pump", "bounce", "flap", "run_step"]);
  });
});

describe("hand cursors", () => {
  const seen = { left: 1, right: 1 };

  it("a hand raised in front of its shoulder reaches its practice dot, and a hand at rest does not", () => {
    const { dots } = practiceMoves(templateInfo("dabba"), true)[0];
    const hit = (pose) => {
      const { cursor } = run([[600, pose]], []).features.at(-30);
      return dots.map((dot) => onDot(cursor[dot.hand], dot, body.aspect));
    };
    assert.deepEqual(hit({ leftArm: { wrist: [-0.1, 0.1] }, rightArm: { wrist: [0.1, 0.1] } }), [true, true]);
    assert.deepEqual(hit({}), [false, false]);
  });

  it("each hand has its own cursor, and a comfortable reach gets to the edge", () => {
    const cursors = new HandCursors().push({ left: { x: -0.85, y: 0 }, right: { x: 0.2, y: 0.85 } }, seen);
    assert.equal(cursors.left.x, -1);
    assert.equal(cursors.right.y, 1);
    assert.ok(cursors.right.x > 0.2 && cursors.right.x < 0.3);
  });

  it("a still hand holds its place through tracker noise, and a moving one follows at once", () => {
    const cursors = new HandCursors();
    const start = cursors.push({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } }, seen).left;
    assert.deepEqual(cursors.push({ left: { x: 0.004, y: -0.004 }, right: { x: 0, y: 0 } }, seen).left, start);
    assert.equal(cursors.push({ left: { x: 0.2, y: 0 }, right: { x: 0, y: 0 } }, seen).left.x, 0.25);
  });

  it("a hand the tracker has lost reads as gone rather than frozen", () => {
    const cursors = new HandCursors();
    cursors.push({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } }, seen);
    assert.equal(cursors.push({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } }, { left: 0.1, right: 1 }).left, null);
  });

  it("the engine reports both cursors from a real pose", () => {
    const { features } = run([[300, {}]]);
    assert.ok(features.at(-1).cursor.left && features.at(-1).cursor.right);
  });
});

describe("the recorded library", () => {
  const library = readdirSync("public/assets/anim").filter((file) => file.endsWith(".glb")).flatMap((file) => {
    const data = readFileSync(`public/assets/anim/${file}`);
    return JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString("utf8")).animations.map((clip) => clip.name);
  });
  const recorded = [...new Set(library)].filter((clip) => clip !== "A_TPose");
  const mapped = [...Object.values(RECORDED_MOVES).flat(), ...REACTION_CLIPS];

  it("accounts for every recorded clip, once", () => {
    assert.equal(recorded.length, 84);
    assert.deepEqual(recorded.filter((clip) => !mapped.includes(clip)), []);
    assert.deepEqual(mapped.filter((clip) => !recorded.includes(clip)), []);
    assert.equal(new Set(mapped).size, mapped.length);
  });

  it("maps clips only to inputs the engine has", () => {
    const known = new Set(GESTURES.map((gesture) => gesture.id));
    for (const input of Object.keys(RECORDED_MOVES)) assert.ok(input === CURSOR || known.has(input), `${input} is not a move`);
  });
});
