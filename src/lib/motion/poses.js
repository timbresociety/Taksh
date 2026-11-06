// The pose library. Each pose gives the direction of the upper arm and forearm on each side, as
// screen vectors with y up and the player's left at negative x. The camera matcher and the rig on
// screen both read this one table, so what the character shows is exactly what is scored.
const OUT = [1, 0];
const UP = [0, 1];
const DOWN = [0, -1];
const OUT_UP = [0.71, 0.71];
const OUT_DOWN = [0.71, -0.71];
const IN_DOWN = [-0.71, -0.71];
const IN = [-1, 0];

const mirror = ([x, y]) => [-x, y];
const pose = (id, label, right, left = right) => ({
  id,
  label,
  arms: { right: { upper: right[0], lower: right[1] }, left: { upper: mirror(left[0]), lower: mirror(left[1]) } },
});

export const POSES = [
  pose("airplane", "Airplane", [OUT, OUT]),
  pose("touchdown", "Touchdown", [UP, UP]),
  pose("goal_post", "Goal Post", [OUT, UP]),
  pose("hips", "Hands on Hips", [OUT_DOWN, IN_DOWN]),
  pose("victory", "Victory", [OUT_UP, OUT_UP]),
  pose("point_right", "Point Right", [OUT, OUT], [DOWN, DOWN]),
  pose("point_left", "Point Left", [DOWN, DOWN], [OUT, OUT]),
  pose("guard_up", "Fists Up", [OUT_DOWN, [-0.3, 0.95]]),
  pose("wide_low", "Low Wings", [OUT_DOWN, OUT_DOWN]),
  pose("chest", "Arms Crossed", [DOWN, IN]),
];

const unit = (x, y) => {
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
};
const cosine = (a, b) => a[0] * b[0] + a[1] * b[1];

// 1 is an exact match. Pass the player's joints in the mirrored square-unit space.
export function poseSimilarity(joints, target) {
  const limb = (from, to) => unit(to.x - from.x, from.y - to.y);
  const parts = [
    [limb(joints.leftShoulder, joints.leftElbow), target.arms.left.upper],
    [limb(joints.leftElbow, joints.leftWrist), target.arms.left.lower],
    [limb(joints.rightShoulder, joints.rightElbow), target.arms.right.upper],
    [limb(joints.rightElbow, joints.rightWrist), target.arms.right.lower],
  ];
  return Math.min(...parts.map(([seen, wanted]) => cosine(seen, wanted)));
}
