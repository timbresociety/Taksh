import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Calibrator } from "../src/lib/motion/calibrate.js";
import { GestureEngine } from "../src/lib/motion/gestures.js";
import { LM, LandmarkSmoother } from "../src/lib/motion/landmarks.js";
import { BODIES, playTimeline } from "./helpers/body.mjs";

function calibrate(body) {
  const calibrator = new Calibrator();
  let result = null;
  playTimeline(body, [[2400, {}]], (points, t) => {
    if (!result?.done) result = calibrator.push(points, t);
  });
  assert.equal(result.done, true, `calibration failed: ${result.message}`);
  return result.calibration;
}

function run(body, timeline, options) {
  const engine = new GestureEngine(calibrate(body));
  const smoother = new LandmarkSmoother();
  const events = [];
  const tracking = [];
  playTimeline(
    body,
    [[500, {}], ...timeline, [500, {}]],
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
