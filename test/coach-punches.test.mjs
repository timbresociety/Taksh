import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MOVE_POSES, nearness } from "../src/lib/stage/coach.js";

// The demo's arm, rebuilt from its bone directions with the coach's own shares of the arm. x is out to
// the punching side, y up, z toward the camera, all from the shoulder in arm lengths.
function armAt(gesture, p) {
  const pose = MOVE_POSES[gesture](p);
  const bone = gesture.endsWith("left") ? "r" : "l";
  const out = gesture.endsWith("left") ? -1 : 1;
  const [, upper] = pose.aims.find(([name]) => name === `upperarm_${bone}`);
  const [, lower] = pose.aims.find(([name]) => name === `lowerarm_${bone}`);
  const elbow = upper.map((value) => value * 0.52);
  const fist = elbow.map((value, i) => value + lower[i] * 0.48);
  const outward = ([x, y, z]) => ({ x: x * out, y, z });
  return { elbow: outward(elbow), fist: outward(fist), pose };
}

const steps = Array.from({ length: 41 }, (_, i) => i / 40);

describe("the coach's straight punches", () => {
  for (const [gesture, name] of [["punch_left", "jab"], ["punch_right", "cross"]]) {
    it(`the ${name} starts from a guard: fist up by the chin, elbow tucked down and forward`, () => {
      const { fist, elbow } = armAt(gesture, 0);
      assert.ok(fist.y > 0.05 && fist.x < 0 && fist.z > 0.4, "fist up, just inside the shoulder, in front");
      assert.ok(elbow.y < -0.2 && elbow.z > 0.25, "elbow down and forward, not hanging at the ribs");
    });

    it(`the ${name} drives the fist at the camera and keeps the elbow under it`, () => {
      const guard = armAt(gesture, 0).fist;
      const reach = Math.max(...steps.map((p) => armAt(gesture, p).fist.z));
      assert.ok(reach - guard.z > 0.3, "the fist travels toward the camera");
      for (const p of steps) {
        const { fist, elbow } = armAt(gesture, p);
        assert.ok(elbow.y < fist.y, `elbow under the fist at ${p}`);
        assert.ok(elbow.z < fist.z, `elbow behind the fist at ${p}`);
        assert.ok(fist.x <= guard.x + 0.05, `the fist never swings out to the side at ${p}`);
      }
    });

    it(`the ${name} goes out and comes back fast on one straight line`, () => {
      const from = armAt(gesture, 0).fist;
      const to = armAt(gesture, 0.4).fist;
      const line = ["x", "y", "z"].map((axis) => to[axis] - from[axis]);
      const length = Math.hypot(...line);
      for (const p of steps) {
        const { fist } = armAt(gesture, p);
        const offset = ["x", "y", "z"].map((axis) => fist[axis] - from[axis]);
        const along = offset.reduce((sum, value, i) => sum + value * line[i], 0) / length;
        const off = Math.sqrt(Math.max(0, offset.reduce((sum, value) => sum + value * value, 0) - along * along));
        assert.ok(off < 0.01, `the fist is on the line at ${p}`);
      }
      assert.deepEqual(armAt(gesture, 0.65).fist, armAt(gesture, 0).fist, "home again well before the loop ends");
    });

    it(`the ${name} is shown from three-quarters on its own side`, () => {
      const { pose } = armAt(gesture, 0.4);
      assert.ok(Math.abs(pose.view) > 0.3);
      assert.equal(Math.sign(pose.view), gesture.endsWith("left") ? -1 : 1);
    });
  }

  it("the jab goes straight ahead; the cross turns the body and comes in toward the middle", () => {
    const jab = armAt("punch_left", 0.4);
    const cross = armAt("punch_right", 0.4);
    assert.ok(Math.abs(jab.fist.x - armAt("punch_left", 0).fist.x) < 0.06, "no sideways travel in the jab");
    assert.ok(Math.abs(jab.pose.turn) < 0.25);
    assert.ok(cross.fist.x < -0.2, "the cross fist ends inside its shoulder, toward the middle");
    assert.ok(Math.abs(cross.pose.turn) >= 0.4, "the hips and shoulders turn into the cross");
    assert.ok(Math.sign(cross.pose.turn) !== Math.sign(jab.pose.turn), "each punch turns its own shoulder forward");
  });

  it("hooks and uppercuts still start from the guard and are shown from the front", () => {
    for (const gesture of ["hook_left", "hook_right", "uppercut_left", "uppercut_right"]) {
      assert.deepEqual(MOVE_POSES[gesture](0).aims, MOVE_POSES[gesture.startsWith("hook") ? gesture : gesture.replace("uppercut", "hook")](0).aims);
      assert.equal(MOVE_POSES[gesture](0.4).view ?? 0, 0);
    }
    const hook = armAt("hook_left", 0.45);
    assert.ok(hook.elbow.x > 0.3, "a hook still lifts the elbow out to the side");
  });

  it("draws a point ahead of the body bigger, the further ahead it is", () => {
    assert.equal(nearness(0), 1);
    assert.equal(nearness(-0.3), 1);
    assert.ok(nearness(0.5) > nearness(0.3) && nearness(0.3) > 1.3);
    assert.ok(Number.isFinite(nearness(5)));
  });
});
