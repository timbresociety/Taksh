import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Calibrator } from "../src/lib/motion/calibrate.js";
import { GestureEngine, THRESHOLDS, personalLevel } from "../src/lib/motion/gestures.js";
import { LM, LandmarkSmoother } from "../src/lib/motion/landmarks.js";
import { POSES } from "../src/lib/motion/poses.js";
import { GESTURES } from "../src/lib/spec/contract.js";
import { templateInfo } from "../src/lib/templates/index.js";
import { BODIES, playTimeline } from "./helpers/body.mjs";

function calibrate(body, { framing, hide = [] } = {}) {
  const calibrator = new Calibrator({ framing });
  let result = null;
  playTimeline(body, [[2400, { hide }]], (points, t) => {
    if (!result?.done) result = calibrator.push(points, t);
  });
  assert.equal(result.done, true, `calibration failed: ${result.message}`);
  return result.calibration;
}

function run(body, timeline, { framing, hide = [], moves, ...options } = {}) {
  const engine = new GestureEngine(calibrate(body, { framing, hide }), { framing, moves });
  const smoother = new LandmarkSmoother();
  const events = [];
  const tracking = [];
  playTimeline(
    body,
    [[500, { hide }], ...timeline, [500, { hide }]],
    (points, t) => {
      const result = engine.push(points ? smoother.push(points, t) : null, t);
      events.push(...result.events);
      tracking.push(result.tracking);
    },
    options,
  );
  return { events, tracking, names: events.map((event) => event.gesture) };
}

const ramp = (key, from, to) => (p) => ({ [key]: from + (to - from) * p });
const rampOut = (key, peak, ms = 260) => [
  [ms, ramp(key, 0, peak)],
  [ms, ramp(key, peak, 0)],
];

const MOVES = {
  hand_left: rampOut("leftHandOut", 1.15),
  hand_right: rampOut("rightHandOut", 1.15),
  kick_left: rampOut("leftKick", 1.25),
  kick_right: rampOut("rightKick", 1.25),
  high_knee: rampOut("leftKnee", 0.85),
  jump: [
    [180, (p) => ({ rise: 0.55 * p, feetRise: 0.5 * p })],
    [180, (p) => ({ rise: 0.55 * (1 - p), feetRise: 0.5 * (1 - p) })],
  ],
  burpee: [
    [500, (p) => ({ drop: 1.3 * p, handsDown: p > 0.4 })],
    [700, { drop: 1.3, handsDown: true }],
    [500, (p) => ({ drop: 1.3 * (1 - p), handsDown: p < 0.5 })],
  ],
};

describe("each gesture counts exactly once, at any body scale", () => {
  for (const [bodyName, body] of Object.entries(BODIES)) {
    for (const [gesture, timeline] of Object.entries(MOVES)) {
      it(`${gesture} on ${bodyName}`, () => {
        assert.deepEqual(run(body, timeline).names, [gesture]);
      });
    }
  }
});

describe("stepping follows the player's own left and right", () => {
  it("fires a step out and a marked step back", () => {
    const { events } = run(BODIES.midRange, [
      [300, ramp("x", 0, -0.9)],
      [600, { x: -0.9 }],
      [300, ramp("x", -0.9, 0)],
    ]);
    assert.deepEqual(events.map((e) => e.gesture), ["step_left", "step_right"]);
    assert.equal(events[1].returning, true);
  });

  it("the right side is not mirrored by mistake", () => {
    const { names } = run(BODIES.midRange, [[300, ramp("x", 0, 0.9)], [400, { x: 0.9 }]]);
    assert.equal(names[0], "step_right");
  });
});

describe("rearming", () => {
  it("holding a position counts once", () => {
    const { names } = run(BODIES.midRange, [
      [250, ramp("leftHandOut", 0, 1.15)],
      [3000, { leftHandOut: 1.15 }],
      [250, ramp("leftHandOut", 1.15, 0)],
    ]);
    assert.deepEqual(names, ["hand_left"]);
  });

  it("hovering at the threshold counts once", () => {
    const hover = (p) => ({ leftHandOut: 0.85 + Math.sin(p * 60) * 0.12 });
    const { names } = run(BODIES.midRange, [[250, ramp("leftHandOut", 0, 0.85)], [3000, hover], [250, ramp("leftHandOut", 0.85, 0)]]);
    assert.deepEqual(names, ["hand_left"]);
  });

  it("a confidence flicker during a hold does not double count", () => {
    const flicker = (p) => ({ leftHandOut: 1.2, hide: Math.floor(p * 12) % 2 ? [LM.leftWrist] : [] });
    const { names } = run(BODIES.midRange, [[250, ramp("leftHandOut", 0, 1.2)], [2000, flicker], [250, ramp("leftHandOut", 1.2, 0)]]);
    assert.deepEqual(names, ["hand_left"]);
  });

  it("a real repeat counts twice", () => {
    const { names } = run(BODIES.midRange, [...MOVES.hand_left, [300, {}], ...MOVES.hand_left]);
    assert.deepEqual(names, ["hand_left", "hand_left"]);
  });

  it("alternating high knees count every lift", () => {
    const { names } = run(BODIES.midRange, [
      ...rampOut("leftKnee", 0.85, 200),
      ...rampOut("rightKnee", 0.85, 200),
      ...rampOut("leftKnee", 0.85, 200),
      ...rampOut("rightKnee", 0.85, 200),
    ]);
    assert.deepEqual(names, ["high_knee", "high_knee", "high_knee", "high_knee"]);
  });
});

describe("false positives", () => {
  it("standing with sensor noise fires nothing", () => {
    assert.deepEqual(run(BODIES.farAway, [[8000, {}]], { noise: 0.006 }).names, []);
  });

  it("a small sway fires nothing", () => {
    assert.deepEqual(run(BODIES.midRange, [[3000, (p) => ({ x: Math.sin(p * 12) * 0.25 })]]).names, []);
  });

  it("a low-confidence hand never counts", () => {
    const { names } = run(BODIES.midRange, [[300, (p) => ({ leftHandOut: 1.2 * p, hide: [LM.leftWrist] })], [800, { leftHandOut: 1.2, hide: [LM.leftWrist] }]]);
    assert.ok(!names.includes("hand_left"));
  });

  it("a shallow squat is not a burpee", () => {
    const { names } = run(BODIES.midRange, [[400, ramp("drop", 0, 0.55)], [400, ramp("drop", 0.55, 0)]]);
    assert.ok(!names.includes("burpee"));
  });
});

describe("tracking", () => {
  it("reports lost when the pose disappears, then recovers", () => {
    const { tracking } = run(BODIES.midRange, [[1000, null], [500, {}]]);
    assert.ok(tracking.includes("lost"));
    assert.equal(tracking.at(-1), "good");
  });

  it("a brief dropout does not count as lost", () => {
    assert.ok(!run(BODIES.midRange, [[300, null]]).tracking.includes("lost"));
  });

  it("the low phase of a burpee does not read as lost", () => {
    const hidden = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip];
    const { tracking, names } = run(BODIES.midRange, [
      [500, (p) => ({ drop: 1.3 * p, handsDown: p > 0.4 })],
      [1500, { drop: 1.3, handsDown: true, hide: hidden }],
      [500, (p) => ({ drop: 1.3 * (1 - p), handsDown: p < 0.5 })],
    ]);
    assert.ok(!tracking.includes("lost"));
    assert.deepEqual(names, ["burpee"]);
  });
});

describe("calibration", () => {
  it("asks a player who is too close to step back", () => {
    const calibrator = new Calibrator();
    let message = "";
    playTimeline({ ...BODIES.midRange, torso: 0.4, hipY: 0.45 }, [[200, {}]], (points, t) => {
      message = calibrator.push(points, t).message;
    });
    assert.match(message, /step back/i);
  });

  it("restarts if the player moves during the hold", () => {
    const calibrator = new Calibrator();
    let result;
    playTimeline(BODIES.midRange, [[800, {}], [100, { x: 0.5 }]], (points, t) => {
      result = calibrator.push(points, t);
    });
    assert.equal(result.done, false);
    assert.ok(result.progress < 0.1);
  });
});

// The engine reads every move it knows and the session keeps the ones a game binds, so the new moves
// are checked inside a game that uses them: there, they must read as that move and nothing else.
// Games ask for the moves they bind, so these tests listen to everything the engine can report.
const hearAll = (body, timeline, options) => run(body, timeline, { ...options, moves: "all" });

function playedIn(game, body, timeline, options) {
  const bound = new Set(Array.isArray(game) ? game : templateInfo(game).bindings.map((binding) => binding.gesture));
  return hearAll(body, timeline, options).names.filter((name) => bound.has(name));
}

const mix = (from, to, p) => from.map((value, index) => value + ((to[index] ?? value) - value) * p);
const armBetween = (from, to, p) => ({ wrist: mix(from.wrist, to.wrist, p), elbow: mix(from.elbow, to.elbow, p) });

// Moves both arms between named shapes, so a timeline reads like the exercise it describes.
const move = (ms, from, to) => [ms, (p) => ({ leftArm: armBetween(from.leftArm, to.leftArm, p), rightArm: armBetween(from.rightArm, to.rightArm, p) })];
const hold = (ms, shape) => [ms, shape];
const moveOne = (ms, shape, side, to) => move(ms, shape, { ...shape, [side]: to });

const REST = { leftArm: { wrist: [-0.08, 1.15, 0], elbow: [-0.04, 0.57] }, rightArm: { wrist: [0.08, 1.15, 0], elbow: [0.04, 0.57] } };
const FISTS = { leftArm: { wrist: [0.25, 0.05, 0], elbow: [-0.05, 0.6] }, rightArm: { wrist: [-0.25, 0.05, 0], elbow: [0.05, 0.6] } };
const JAB = { leftArm: { wrist: [0.05, 0.1, -1.1], elbow: [0, 0.4] }, rightArm: { wrist: [-0.05, 0.1, -1.1], elbow: [0, 0.4] } };
const HOOK_START = { leftArm: { wrist: [-0.3, 0.1, 0], elbow: [-0.45, 0.3] }, rightArm: { wrist: [0.3, 0.1, 0], elbow: [0.45, 0.3] } };
const HOOK_END = { leftArm: { wrist: [1.1, 0.1, 0], elbow: [0.3, 0.15] }, rightArm: { wrist: [-1.1, 0.1, 0], elbow: [-0.3, 0.15] } };
const LOADED = { leftArm: { wrist: [0.1, 0.5, 0], elbow: [-0.1, 0.8] }, rightArm: { wrist: [-0.1, 0.5, 0], elbow: [0.1, 0.8] } };
const CHIN = { leftArm: { wrist: [0.15, -0.5, 0], elbow: [-0.05, 0.2] }, rightArm: { wrist: [-0.15, -0.5, 0], elbow: [0.05, 0.2] } };
const WIDE = { leftArm: { wrist: [-1.1, 0.4, 0], elbow: [-0.5, 0.4] }, rightArm: { wrist: [1.1, 0.4, 0], elbow: [0.5, 0.4] } };
const ACROSS = { leftArm: { wrist: [0.8, 0.4, 0], elbow: [0.3, 0.4] }, rightArm: { wrist: [-0.8, 0.4, 0], elbow: [-0.3, 0.4] } };
const OVERHEAD = { leftArm: { wrist: [-0.1, -0.9, 0], elbow: [-0.1, -0.45] }, rightArm: { wrist: [0.1, -0.9, 0], elbow: [0.1, -0.45] } };
const WINGS_UP = { leftArm: { wrist: [-1, -0.5, 0], elbow: [-0.5, -0.25] }, rightArm: { wrist: [1, -0.5, 0], elbow: [0.5, -0.25] } };
const WINGS_DOWN = { leftArm: { wrist: [-0.9, 0.7, 0], elbow: [-0.45, 0.35] }, rightArm: { wrist: [0.9, 0.7, 0], elbow: [0.45, 0.35] } };
const PUMP_DOWN = { leftArm: { wrist: [-0.1, 0.6, 0], elbow: [-0.2, 0.4] }, rightArm: { wrist: [0.1, 0.6, 0], elbow: [0.2, 0.4] } };
const PUMP_LEFT = { ...PUMP_DOWN, leftArm: { wrist: [-0.1, -0.5, 0], elbow: [-0.2, 0.1] } };
const PUMP_RIGHT = { ...PUMP_DOWN, rightArm: { wrist: [0.1, -0.5, 0], elbow: [0.2, 0.1] } };

// One arm travels and returns, from and back to a position raised slowly enough to mean nothing.
const oneArm = (side, start, end, outMs, backMs, leadIn = 900) => [
  moveOne(leadIn, REST, side, start[side]),
  hold(200, { ...REST, [side]: start[side] }),
  move(outMs, { ...REST, [side]: start[side] }, { ...REST, [side]: end[side] }),
  move(backMs, { ...REST, [side]: end[side] }, { ...REST, [side]: start[side] }),
  hold(200, { ...REST, [side]: start[side] }),
  move(leadIn, { ...REST, [side]: start[side] }, REST),
];

const dropWith = (shape, depth, p) => ({ ...shape, drop: depth * p });
const squat = (depth = 0.6, shape = FISTS) => [
  move(900, REST, shape),
  [350, (p) => dropWith(shape, depth, p)],
  hold(500, { ...shape, drop: depth }),
  [350, (p) => dropWith(shape, depth, 1 - p)],
  move(900, shape, REST),
];

const armsOf = (pose, length = 0.55) => {
  const arm = ({ upper, lower }) => ({ elbow: [upper[0] * length, -upper[1] * length], wrist: [(upper[0] + lower[0]) * length, -(upper[1] + lower[1]) * length, 0] });
  return { leftArm: arm(pose.arms.left), rightArm: arm(pose.arms.right) };
};
const strike = (pose, holdMs = 1500) => [move(350, REST, armsOf(pose)), hold(holdMs, armsOf(pose)), move(350, armsOf(pose), REST)];

const EXERCISES = {
  squat: ["hop", squat(), ["squat_down", "squat_up"]],
  "squat as a duck": ["bout", squat(), ["squat_down"]],
  "step left as a dodge": ["bout", [[300, ramp("x", 0, -0.9)], [400, { x: -0.9 }], [300, ramp("x", -0.9, 0)]], ["step_left", "step_right"]],
  "step right as a dodge": ["bout", [[300, ramp("x", 0, 0.9)], [400, { x: 0.9 }], [300, ramp("x", 0.9, 0)]], ["step_right", "step_left"]],
  "a lean is not a dodge": ["bout", [[260, ramp("lean", 0, -0.5)], [300, { lean: -0.5 }], [260, ramp("lean", -0.5, 0)]], []],
  punch_left: ["pads", oneArm("leftArm", FISTS, JAB, 120, 200), ["punch_left"]],
  punch_right: ["pads", oneArm("rightArm", FISTS, JAB, 120, 200), ["punch_right"]],
  hook_left: ["pads", oneArm("leftArm", HOOK_START, HOOK_END, 200, 300), ["hook_left"]],
  hook_right: ["pads", oneArm("rightArm", HOOK_START, HOOK_END, 200, 300), ["hook_right"]],
  uppercut_left: ["pads", oneArm("leftArm", LOADED, CHIN, 170, 500), ["uppercut_left"]],
  uppercut_right: ["pads", oneArm("rightArm", LOADED, CHIN, 170, 500), ["uppercut_right"]],
  guard: [["guard"], [move(900, REST, FISTS), hold(500, FISTS), move(900, FISTS, REST)], ["guard"]],
  swing_left: ["rally", oneArm("rightArm", WIDE, ACROSS, 250, 900), ["swing_left"]],
  swing_right: ["rally", oneArm("leftArm", WIDE, ACROSS, 250, 900), ["swing_right"]],
  reach_up_left: ["rally", [moveOne(700, REST, "leftArm", OVERHEAD.leftArm), hold(400, { ...REST, leftArm: OVERHEAD.leftArm }), move(700, { ...REST, leftArm: OVERHEAD.leftArm }, REST)], ["reach_up_left"]],
  reach_up_right: ["rally", [moveOne(700, REST, "rightArm", OVERHEAD.rightArm), hold(400, { ...REST, rightArm: OVERHEAD.rightArm }), move(700, { ...REST, rightArm: OVERHEAD.rightArm }, REST)], ["reach_up_right"]],
  flap: ["flyer", [move(400, REST, WINGS_UP), move(250, WINGS_UP, WINGS_DOWN), move(300, WINGS_DOWN, REST)], ["flap"]],
};

describe("each exercise reads as itself in the game that uses it, at any body scale", () => {
  for (const [bodyName, body] of Object.entries(BODIES)) {
    for (const [name, [templateId, timeline, expected]] of Object.entries(EXERCISES)) {
      it(`${name} on ${bodyName}`, () => {
        assert.deepEqual(playedIn(templateId, body, timeline), expected);
      });
    }
  }
});

describe("exercise gates", () => {
  const body = BODIES.midRange;

  it("a fist at the shoulder with the elbow hanging and no depth is not a punch", () => {
    const flat = { leftArm: { wrist: [0.05, 0.1, 0], elbow: [0, 0.4] }, rightArm: JAB.rightArm };
    assert.deepEqual(playedIn("pads", body, oneArm("leftArm", FISTS, flat, 120, 200)), []);
  });

  it("two punches count twice", () => {
    const punch = oneArm("leftArm", FISTS, JAB, 120, 200, 400);
    assert.deepEqual(playedIn("bout", body, [...punch, hold(300, REST), ...punch]).filter((name) => name === "punch_left"), ["punch_left", "punch_left"]);
  });

  it("holding a punch out counts once", () => {
    const out = { ...REST, leftArm: JAB.leftArm };
    const start = { ...REST, leftArm: FISTS.leftArm };
    const names = playedIn("pads", body, [moveOne(900, REST, "leftArm", FISTS.leftArm), move(120, start, out), hold(3000, out), move(200, out, start), move(900, start, REST)]);
    assert.deepEqual(names, ["punch_left"]);
  });

  it("holding a guard counts once", () => {
    assert.deepEqual(playedIn(["guard"], body, [move(900, REST, FISTS), hold(3000, FISTS), move(900, FISTS, REST)]), ["guard"]);
  });

  it("a held squat reports going down and coming up once each", () => {
    const names = playedIn("hop", body, [move(900, REST, FISTS), [350, (p) => dropWith(FISTS, 0.6, p)], hold(3000, { ...FISTS, drop: 0.6 }), [350, (p) => dropWith(FISTS, 0.6, 1 - p)], move(900, FISTS, REST)]);
    assert.deepEqual(names, ["squat_down", "squat_up"]);
  });

  it("a shallow dip is not a squat", () => {
    assert.deepEqual(playedIn("hop", body, squat(0.2)), []);
  });

  it("raising the arms is not a flap; the beat down is", () => {
    // hearAll() always ends at rest, so the arms do come down, but only after this timeline is over.
    const flaps = hearAll(body, [move(400, REST, WINGS_UP), hold(1000, WINGS_UP)]).events.filter((event) => event.gesture === "flap");
    assert.equal(flaps.length, 1);
    assert.ok(flaps[0].t > 1800);
    const beats = [move(400, REST, WINGS_UP), move(250, WINGS_UP, WINGS_DOWN), move(300, WINGS_DOWN, WINGS_UP), move(250, WINGS_UP, WINGS_DOWN), move(300, WINGS_DOWN, REST)];
    assert.deepEqual(playedIn("flyer", body, beats), ["flap", "flap"]);
  });

  it("a low-confidence wrist never punches", () => {
    const timeline = oneArm("leftArm", FISTS, JAB, 120, 200).map(([ms, pose]) => [ms, typeof pose === "function" ? (p) => ({ ...pose(p), hide: [LM.leftWrist] }) : { ...pose, hide: [LM.leftWrist] }]);
    assert.deepEqual(playedIn("pads", body, timeline), []);
  });

  it("every gesture the engine can report is in the contract", () => {
    const known = new Set(GESTURES.map((gesture) => gesture.id));
    for (const [, timeline] of Object.values(EXERCISES)) {
      for (const name of hearAll(body, timeline).names) assert.ok(known.has(name), name);
    }
  });
});

describe("poses", () => {
  for (const pose of POSES) {
    for (const [bodyName, body] of Object.entries(BODIES)) {
      it(`${pose.id} counts once on ${bodyName}`, () => {
        assert.deepEqual(playedIn("poses", body, strike(pose)), [`pose_${pose.id}`]);
      });
    }

    it(`${pose.id} held for five seconds with noisy sensors counts once`, () => {
      assert.deepEqual(playedIn("poses", BODIES.midRange, strike(pose, 5000), { noise: 0.006 }), [`pose_${pose.id}`]);
    });
  }

  it("a pose only counts once it has been held", () => {
    const [airplane] = POSES;
    const arms = armsOf(airplane);
    assert.deepEqual(playedIn("poses", BODIES.midRange, [move(90, REST, arms), hold(60, arms), move(90, arms, REST)]), []);
  });

  it("leaving a pose and striking it again counts twice", () => {
    const [airplane] = POSES;
    const names = playedIn("poses", BODIES.midRange, [...strike(airplane, 600), hold(300, REST), ...strike(airplane, 600)]);
    assert.deepEqual(names, ["pose_airplane", "pose_airplane"]);
  });

  it("moving from one pose to another counts each", () => {
    const [from, to] = POSES.map((pose) => armsOf(pose));
    const names = playedIn("poses", BODIES.midRange, [move(350, REST, from), hold(600, from), move(350, from, to), hold(600, to), move(350, to, REST)]);
    assert.deepEqual(names, ["pose_airplane", "pose_touchdown"]);
  });

  it("a hand flickering out of confidence during a hold does not count again", () => {
    const [airplane] = POSES;
    const arms = armsOf(airplane);
    const flicker = (p) => ({ ...arms, hide: Math.floor(p * 12) % 2 ? [LM.leftWrist] : [] });
    assert.deepEqual(playedIn("poses", BODIES.midRange, [move(350, REST, arms), hold(500, arms), [2000, flicker], move(350, arms, REST)]), ["pose_airplane"]);
  });
});

describe("moves that used to be missed or double counted", () => {
  const body = BODIES.midRange;
  const legs = [LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle];
  const hips = [LM.leftHip, LM.rightHip];
  const hide = [...legs, ...hips];

  it("a squat with the arms hanging is a squat", () => {
    const down = [[350, ramp("drop", 0, 0.6)], [500, { drop: 0.6 }], [350, ramp("drop", 0.6, 0)]];
    assert.deepEqual(playedIn("hop", body, down), ["squat_down", "squat_up"]);
  });

  it("an upper-body player with hips out of view can step aside", () => {
    const step = [[300, (p) => ({ x: -0.9 * p, hide })], [400, { x: -0.9, hide }], [300, (p) => ({ x: -0.9 * (1 - p), hide })]];
    assert.deepEqual(playedIn("bout", body, step, { framing: "upper", hide }), ["step_left", "step_right"]);
  });

  it("an upper-body player leaning with hips out of view does not step", () => {
    const slip = [[260, (p) => ({ lean: -0.3 * p, hide })], [300, { lean: -0.3, hide }], [260, (p) => ({ lean: -0.3 * (1 - p), hide })]];
    assert.deepEqual(playedIn("bout", body, slip, { framing: "upper", hide }), []);
  });

  it("an upper-body player with hips out of view can duck", () => {
    const low = (p) => ({ ...FISTS, drop: 0.6 * p, hide });
    const names = playedIn("bout", body, [move(900, REST, FISTS), [350, low], [500, () => low(1)], [350, (p) => low(1 - p)]], { framing: "upper", hide });
    assert.ok(names.includes("squat_down"));
  });

  it("one bad frame during a held pose does not count again", () => {
    const [airplane] = POSES;
    const arms = armsOf(airplane);
    const glitch = (p) => (Math.abs(p - 0.5) < 0.01 ? { ...arms, leftArm: { wrist: [-0.3, 1, 0], elbow: [-0.1, 0.5] } } : arms);
    assert.deepEqual(playedIn("poses", body, [move(350, REST, arms), hold(500, arms), [2000, glitch], hold(500, arms), move(350, arms, REST)]), ["pose_airplane"]);
  });

  it("hovering at the edge of a pose counts once", () => {
    const [airplane] = POSES;
    const arms = armsOf(airplane);
    // The forearm tips about 30 to 42 degrees from level, either side of the 37 degree limit.
    const tip = (p) => {
      const degrees = 36 + 6 * Math.sin(p * Math.PI * 8);
      const dy = 0.55 * Math.sin((degrees * Math.PI) / 180);
      const dx = 0.55 * Math.cos((degrees * Math.PI) / 180);
      return { ...arms, leftArm: { elbow: arms.leftArm.elbow, wrist: [-0.55 - dx, -dy, 0] } };
    };
    assert.deepEqual(playedIn("poses", body, [move(350, REST, arms), hold(500, arms), [4000, tip], move(350, arms, REST)]), ["pose_airplane"]);
  });
});

describe("upper-body framing", () => {
  const legs = [LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle];
  const hips = [LM.leftHip, LM.rightHip];
  const options = { framing: "upper", hide: legs };
  const withHidden = (timeline, hide) => timeline.map(([ms, pose]) => [ms, typeof pose === "function" ? (p) => ({ ...pose(p), hide }) : { ...pose, hide }]);

  it("calibrates with the legs out of view, where full framing asks you to step back", () => {
    assert.ok(calibrate(BODIES.closeUp, options).torso > 0);
    const calibrator = new Calibrator({ framing: "full" });
    let message = "";
    playTimeline(BODIES.midRange, [[200, { hide: legs }]], (points, t) => {
      message = calibrator.push(points, t).message;
    });
    assert.match(message, /feet are in frame/);
  });

  it("invisible legs still track as good, and the arms still play", () => {
    const { tracking, names } = hearAll(BODIES.midRange, withHidden(EXERCISES.reach_up_left[1], legs), options);
    assert.ok(tracking.length > 0);
    assert.ok(tracking.every((state) => state === "good"), [...new Set(tracking)].join());
    assert.ok(names.includes("reach_up_left"));
  });

  it("the same view in a full-body game is only partial", () => {
    const body = BODIES.midRange;
    const engine = new GestureEngine(calibrate(body), { moves: "all" });
    const states = new Set();
    playTimeline(body, [[500, { hide: legs }]], (points, t) => states.add(engine.push(points, t).tracking));
    assert.deepEqual([...states], ["partial"]);
  });

  it("hips out of view still track as good, because the shoulders anchor an upper-body game", () => {
    const { tracking } = hearAll(BODIES.midRange, [[800, { hide: [...legs, ...hips] }]], { framing: "upper", hide: [...legs, ...hips] });
    assert.ok(tracking.every((state) => state === "good"));
  });

  it("losing the shoulders is lost", () => {
    const hide = [...legs, LM.leftShoulder, LM.rightShoulder];
    const { tracking } = hearAll(BODIES.midRange, [[1200, { hide }]], options);
    assert.equal(tracking.at(-1), "good");
    assert.ok(tracking.includes("lost"));
  });

  it("leg moves cannot fire from legs nobody can see", () => {
    const { names } = hearAll(BODIES.midRange, withHidden(MOVES.kick_left, legs), options);
    assert.ok(!names.includes("kick_left"));
  });
});

describe("locked moves", () => {
  const body = BODIES.farAway;
  const ALL = ["punch_left", "punch_right", "guard", "reach_up_left", "reach_up_right", "hands_up", "lift_left", "lift_right", "jump", "slash_left", "slash_right", "slash_up", "slash_down", "run_step"];
  const moved = (timeline, options) => run(body, timeline, { moves: ALL, ...options }).names;
  const OVERHEAD = [0.1, -1.1];
  // The right arm eases between hanging and a held position, too slowly to count as anything.
  const slowly = (x, back = false) => [[1500, (p) => {
    const share = back ? 1 - p : p;
    return { rightArm: { wrist: [x * share + -0.08 * (1 - share), 1.15 + (0.3 - 1.15) * share] } };
  }]];

  // Fists at the chin, a forearm nearer the camera than the shoulders, as a real guard reads.
  const guardUp = (left, right = [-0.35, 0.1, -0.6]) => ({ leftArm: { wrist: left, elbow: [0.1, 0.5] }, rightArm: { wrist: right, elbow: [-0.1, 0.5] } });
  const CHIN = [0.35, 0.1, -0.6];

  it("a fist raised to the chin and held there is not a punch, though it sits ahead of the shoulder", () => {
    const raise = [[500, (p) => ({ leftArm: { wrist: [-0.08 + 0.43 * p, 1.15 - 1.05 * p, -0.6 * p], elbow: [0.1, 0.5] } })], [1500, { leftArm: { wrist: CHIN, elbow: [0.1, 0.5] } }]];
    assert.equal(run(body, raise, { moves: ALL, metric: true }).names.includes("punch_left"), false);
  });

  it("one fist out from guard is a punch, with the other fist still at the chin", () => {
    const jab = [[900, guardUp(CHIN)], [150, (p) => guardUp([0.35 - 1.1 * p, 0.1 - 0.05 * p, -0.6 - 0.3 * p])], [200, guardUp([-0.75, 0.05, -0.9])]];
    const names = run(body, jab, { moves: ALL, metric: true }).names;
    assert.ok(names.includes("punch_left"));
    assert.equal(names.includes("punch_right"), false);
  });

  it("does not read a guard as a punch, because the upper arm still hangs", () => {
    const names = moved([[300, (p) => ({ leftArm: { wrist: [0.25, 1.1 - 0.95 * p], elbow: [0.1, 0.6] } })], [600, { leftArm: { wrist: [0.25, 0.15], elbow: [0.1, 0.6] } }]]);
    assert.equal(names.includes("punch_left"), false);
  });

  it("reads metric depth the same from near and far", () => {
    const punch = [[200, (p) => ({ leftArm: { wrist: [0.1, 0.5 - 0.4 * p, -1.1 * p], elbow: [0.15, 0.6] } })], [250, { leftArm: { wrist: [0.1, 0.1, -1.1], elbow: [0.15, 0.6] } }]];
    for (const place of [BODIES.farAway, BODIES.closeUp]) {
      assert.ok(run(place, punch, { moves: ALL, metric: true }).names.includes("punch_left"));
    }
  });

  it("both hands up is one move, and fires neither single lift", () => {
    const names = moved([[250, (p) => ({ leftArm: { wrist: [OVERHEAD[0] * p, 1.1 + (OVERHEAD[1] - 1.1) * p] }, rightArm: { wrist: [-OVERHEAD[0] * p, 1.1 + (OVERHEAD[1] - 1.1) * p] } })], [400, { leftArm: { wrist: OVERHEAD }, rightArm: { wrist: [-OVERHEAD[0], OVERHEAD[1]] } }]]);
    assert.deepEqual(names.filter((name) => name.startsWith("reach") || name === "hands_up"), ["hands_up"]);
  });

  it("one hand up is that hand", () => {
    const names = moved([[250, (p) => ({ rightArm: { wrist: [-OVERHEAD[0] * p, 1.1 + (OVERHEAD[1] - 1.1) * p] } })], [500, { rightArm: { wrist: [-OVERHEAD[0], OVERHEAD[1]] } }]]);
    assert.deepEqual(names.filter((name) => name.startsWith("reach") || name === "hands_up"), ["reach_up_right"]);
  });

  it("a leg lift is that leg, and a jump is neither", () => {
    assert.ok(moved(rampOut("leftKnee", 0.85)).includes("lift_left"));
    assert.ok(moved(rampOut("rightKnee", 0.85)).includes("lift_right"));
    const jumped = moved(MOVES.jump);
    assert.ok(jumped.includes("jump"));
    assert.equal(jumped.some((name) => name.startsWith("lift")), false);
  });

  it("slashes in the direction travelled, and ignores the hand coming back", () => {
    const across = (from, to, ms) => [ms, (p) => ({ rightArm: { wrist: [from + (to - from) * p, 0.3] } })];
    const names = moved([...slowly(0.9), across(0.9, -0.9, 170), [100, { rightArm: { wrist: [-0.9, 0.3] } }], across(-0.9, 0.9, 170), ...slowly(0.9, true)]);
    assert.deepEqual(names.filter((name) => name.startsWith("slash")), ["slash_left"]);
  });

  it("swinging a hand out to its own side to wind up is not a slash", () => {
    const across = (from, to, ms) => [ms, (p) => ({ rightArm: { wrist: [from + (to - from) * p, 0.3] } })];
    const names = moved([...slowly(0.3), across(0.3, 0.9, 170), [100, { rightArm: { wrist: [0.9, 0.3] } }], across(0.9, -0.9, 170), [1200, { rightArm: { wrist: [-0.9, 0.3] } }]]);
    assert.deepEqual(names.filter((name) => name.startsWith("slash")), ["slash_left"]);
  });

  it("a backhand from across the body counts, and so does the way back after a long pause", () => {
    const across = (from, to, ms) => [ms, (p) => ({ rightArm: { wrist: [from + (to - from) * p, 0.3] } })];
    const names = moved([...slowly(-0.9), across(-0.9, 0.9, 170), [1200, { rightArm: { wrist: [0.9, 0.3] } }], across(0.9, -0.9, 170), ...slowly(-0.9, true)]);
    assert.deepEqual(names.filter((name) => name.startsWith("slash")), ["slash_right", "slash_left"]);
  });

  it("the hand coming back most of a second later is still the way back", () => {
    const across = (from, to, ms) => [ms, (p) => ({ rightArm: { wrist: [from + (to - from) * p, 0.3] } })];
    const names = moved([...slowly(0.9), across(0.9, -0.9, 170), [700, { rightArm: { wrist: [-0.9, 0.3] } }], across(-0.9, 0.9, 170), ...slowly(0.9, true)]);
    assert.deepEqual(names.filter((name) => name.startsWith("slash")), ["slash_left"]);
  });

  it("a small hop that barely lifts the feet is still a jump", () => {
    const hop = [[250, (p) => ({ rise: 0.27 * p, feetRise: 0.13 * p })], [250, (p) => ({ rise: 0.27 * (1 - p), feetRise: 0.13 * (1 - p) })], [400, {}]];
    assert.ok(moved(hop).includes("jump"));
  });

  it("both hands slashing the same way at once are one slash", () => {
    const hands = (y) => ({ leftArm: { wrist: [-0.08, y] }, rightArm: { wrist: [-0.08, y] } });
    const names = moved([[1500, (p) => hands(1.15 - 1.35 * p)], [170, (p) => hands(-0.2 + 1.4 * p)], [900, hands(1.2)]]);
    assert.deepEqual(names.filter((name) => name.startsWith("slash")), ["slash_down"]);
  });

  it("a slow arm movement is not a slash", () => {
    const names = moved([...slowly(0.9), [1500, (p) => ({ rightArm: { wrist: [0.9 - 1.8 * p, 0.3] } })], ...slowly(-0.9, true)]);
    assert.equal(names.some((name) => name.startsWith("slash")), false);
  });

  it("running on the spot counts each stride, and standing still counts none", () => {
    const stride = (key) => [[130, ramp(key, 0, 0.5)], [130, ramp(key, 0.5, 0)]];
    const names = moved([...stride("leftKnee"), ...stride("rightKnee"), ...stride("leftKnee"), ...stride("rightKnee")]);
    assert.equal(names.filter((name) => name === "run_step").length, 3);
    assert.equal(moved([[1500, {}]]).length, 0);
  });

  it("a weak move a player can do in practice fires after their level is set", () => {
    const weak = rampOut("leftKnee", 0.38);
    assert.equal(moved(weak).includes("lift_left"), false);
    const engine = new GestureEngine(calibrate(body), { moves: ALL, personal: { lift_left: personalLevel("lift_left", 0.38) } });
    const smoother = new LandmarkSmoother();
    const seen = [];
    playTimeline(body, [[300, {}], ...weak, [300, {}]], (points, t) => seen.push(...engine.push(smoother.push(points, t), t).events.map((event) => event.gesture)));
    assert.ok(seen.includes("lift_left"));
  });

  it("a personal level cannot sink into the noise of standing still", () => {
    assert.equal(personalLevel("lift_left", 0.01), THRESHOLDS.lift.enter * 0.5);
    assert.equal(personalLevel("lift_left", 5), THRESHOLDS.lift.enter);
  });

  it("measures an arms-only player by the shoulders when the hips are hidden", () => {
    const hips = [LM.leftHip, LM.rightHip];
    const seen = calibrate(BODIES.midRange, { framing: "upper" });
    const hidden = calibrate(BODIES.midRange, { framing: "upper", hide: hips });
    assert.ok(Math.abs(hidden.torso - hidden.shoulderWidth * 1.4) < 1e-9);
    assert.notEqual(seen.torso, hidden.torso);
  });

  it("gives each hand a position inside the unit square for aiming", () => {
    const engine = new GestureEngine(calibrate(body), { moves: ALL });
    let aim = null;
    playTimeline(body, [[300, { rightArm: { wrist: [1.2, -0.2] } }]], (points, t) => {
      aim = engine.push(points, t).features.aim;
    });
    assert.ok(aim.right.x > 0.5 && aim.right.x <= 1);
    assert.ok(aim.right.y > 0);
    assert.ok(aim.left.y < 0);
  });
});
