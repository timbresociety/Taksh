// The range of motion a move asks for, as flat 2D skeletons: where the body starts, where it ends,
// and the path the hand or foot takes between them. Built from the coach's own poses (MOVE_POSES) by
// plain forward kinematics over the bone directions, with fixed bone lengths, so the play screen can
// draw a move with no rig and no WebGL. Points are in torso lengths from the standing shoulders, y down,
// the player's left on the screen's left: the convention coach.ghost() uses, so drawGhost places them.
// Each point also keeps z, toward the camera, so a punch thrown at the screen still has a path to draw.
import { MOVE_POSES } from "../stage/coach.js";
import { LM } from "./landmarks.js";

// A body in torso lengths, close enough to a real one that the guide sits over the player.
const SHOULDER_HALF = 0.37;
const HIP_HALF = 0.19;
const NOSE_UP = 0.45;
const UPPER_ARM = 0.58;
const FOREARM = 0.5;
const THIGH = 0.85;
const SHIN = 0.83;
const RIG_TORSO_M = 0.5; // the coach's poses move the whole body in metres; this turns them to torso lengths

const SAMPLES = 24;
const PATH_POINTS = 16;
const STILL = 0.05; // torso lengths; anything that travels less is holding still
const MOVING_SHARE = 0.5;
const CARRIED = 0.3; // torso lengths of the whole body moving, as in a step, a jump or a squat
const SPEED_END = 0.5; // a speed move has swept by here in every coach loop

// Moves read by speed, not by where the limb ends up, so the guide is a path to sweep fast.
const FAST = /^(slash|swing|uppercut)_/;
// Moves the coach shows with a clip rather than a pose, drawn with the pose closest to them.
const STAND_INS = { run_step: "high_knee" };

// The rig faces the player, so its right side is the player's left.
const ARMS = { r: [LM.leftShoulder, LM.leftElbow, LM.leftWrist], l: [LM.rightShoulder, LM.rightElbow, LM.rightWrist] };
const LEGS = { r: [LM.leftHip, LM.leftKnee, LM.leftAnkle], l: [LM.rightHip, LM.rightKnee, LM.rightAnkle] };
const OUT = { r: -1, l: 1 };
// Each limb that can carry a move, by the joints that can travel: the hand or foot, or the elbow or
// knee when that is what moves most, as in a hook that swings the elbow out.
const LIMBS = [ARMS.r, ARMS.l, LEGS.r, LEGS.l, [LM.nose]];
const FEET = [LM.leftAnkle, LM.rightAnkle, LM.leftKnee, LM.rightKnee];
export const BODY = "body"; // the path of the hips, for a move that carries the whole body

const norm = (v) => {
  const length = Math.hypot(...v);
  return length < 1e-6 ? null : v.map((value) => value / length);
};
// The bone turned toward where the pose aims it, by its weight, as aimBone's slerp does.
const toward = (from, to, weight) => {
  const target = norm(to);
  if (!target || weight <= 0) return from;
  return norm(from.map((value, i) => value + (target[i] - value) * Math.min(1, weight))) ?? target;
};
const turnFlat = (v, angle) => [v[0] * Math.cos(angle) - v[1] * Math.sin(angle), v[0] * Math.sin(angle) + v[1] * Math.cos(angle), v[2]];

// One pose as a skeleton. y is up inside, and flipped to screen y on the way out.
export function skeletonOf(pose) {
  const aims = new Map();
  for (const [bone, direction, weight] of pose.aims ?? []) (aims.get(bone) ?? aims.set(bone, []).get(bone)).push([direction, weight]);
  const aimed = (bone, start) => (aims.get(bone) ?? []).reduce((current, [direction, weight]) => toward(current, direction, weight), start);

  const turn = Math.cos(pose.turn ?? 0); // a turn toward the camera narrows the shoulders and hips
  const root = [(pose.x ?? 0) / RIG_TORSO_M, (pose.y ?? 0) / RIG_TORSO_M];
  const hip = [root[0], -1 + root[1], 0];
  const spine = aimed("spine_02", [0, 1, 0]);
  const tilt = Math.atan2(-spine[0], spine[1]);
  const rise = Math.hypot(spine[0], spine[1]);
  const plus = (a, b, scale = 1) => a.map((value, i) => value + b[i] * scale);
  const shoulder = plus(hip, spine);
  const across = (half) => turnFlat([half * turn, 0, 0], tilt);
  const points = [];
  const put = (index, [x, y, z]) => {
    points[index] = { x, y: -y, z };
  };
  const nose = turnFlat([0, NOSE_UP * Math.max(0.4, rise), 0], tilt);
  put(LM.nose, plus(shoulder, nose));

  for (const side of ["r", "l"]) {
    const out = OUT[side];
    const [s, e, w] = ARMS[side];
    const at = plus(shoulder, across(SHOULDER_HALF), out);
    // Arms hang a little out at rest, and lean with the chest when nothing aims them.
    const upper = aimed(`upperarm_${side}`, turnFlat([out * 0.12, -1, 0], tilt));
    const lower = aimed(`lowerarm_${side}`, upper);
    const elbow = plus(at, upper, UPPER_ARM);
    put(s, at);
    put(e, elbow);
    put(w, plus(elbow, lower, FOREARM));

    const [h, k, a] = LEGS[side];
    const hipAt = plus(hip, [HIP_HALF * turn * out, 0, 0]);
    const thigh = aimed(`thigh_${side}`, [out * 0.03, -1, 0]);
    const calf = aimed(`calf_${side}`, thigh);
    const knee = plus(hipAt, thigh, THIGH);
    put(h, hipAt);
    put(k, knee);
    put(a, plus(knee, calf, SHIN));
  }
  return points;
}

const hipsOf = (points) => ({ x: (points[LM.leftHip].x + points[LM.rightHip].x) / 2, y: (points[LM.leftHip].y + points[LM.rightHip].y) / 2, z: (points[LM.leftHip].z + points[LM.rightHip].z) / 2 });
// Travel counts depth too: a jab thrown at the screen barely moves across it, but it moves.
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const flatGap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const TOWARD = 1.5; // a path that comes this many times further toward the camera than across is drawn as coming at you
const spread = (path) => Math.max(...path.map((point) => gap(point, path[0])));

function poseFor(gesture) {
  const make = MOVE_POSES[gesture] ?? MOVE_POSES[STAND_INS[gesture]];
  return typeof make === "function" ? make : null;
}

function build(gesture) {
  const make = poseFor(gesture);
  if (!make) return null;
  const at = (p) => skeletonOf(make(p));
  const loop = Array.from({ length: SAMPLES }, (_, step) => at(step / SAMPLES));

  // What travels: the hips when the whole body goes, and each hand, foot or head that moves on its own.
  const body = loop.map(hipsOf);
  const carried = spread(body) >= CARRIED;
  const relative = (joint) => loop.map((points, i) => ({ x: points[joint].x - body[i].x, y: points[joint].y - body[i].y, z: points[joint].z - body[i].z }));
  const travelOf = (joint) => spread(relative(joint));
  const flatTravelOf = (joint) => Math.max(...relative(joint).map((point, _, all) => flatGap(point, all[0])));
  const own = LIMBS.map((chain) => {
    const joints = chain.length > 1 ? chain.slice(1) : chain;
    const scored = joints.map((index) => ({ index, flat: flatTravelOf(index), full: travelOf(index) }));
    const best = (key) => scored.reduce((top, item) => (item[key] > top[key] + 0.02 ? item : top));
    // An arm is shown by the joint that travels most, counting depth, so a jab at the screen shows the
    // fist. A leg is shown by what crosses the screen most: a knee lift shows the knee rising, not the
    // foot swinging toward the camera under it.
    const leg = chain === LEGS.r || chain === LEGS.l;
    const pick = leg && best("flat").flat >= STILL ? best("flat") : best("full");
    return { chain, joint: pick.index, travel: Math.max(...scored.map((item) => item.full)) };
  });
  const most = Math.max(...own.map(({ travel }) => travel));
  let limbs = most < STILL ? [] : own.filter(({ travel }) => travel >= most * MOVING_SHARE);
  if (carried) limbs = limbs.filter(({ joint }) => !FEET.includes(joint) && joint !== LM.nose); // the hips' arrow says it
  if (!limbs.length && !carried) limbs = own.slice(0, 2); // a twist turns the chest, and the hands show it
  const moving = limbs.map(({ joint }) => joint);
  const tracked = carried ? [BODY, ...moving] : moving;
  const where = (points, end) => (end === BODY ? hipsOf(points) : points[end]);
  const reach = (from, points) => tracked.reduce((sum, end) => sum + gap(where(points, end), where(from, end)), 0);

  // A held move runs from standing to its peak. A speed move runs from its wind-up to its finish.
  const fast = FAST.test(gesture);
  let startP = 0;
  let endP = 0;
  if (fast) {
    endP = SPEED_END;
    const finish = at(endP);
    let far = -1;
    for (let step = 0; step / SAMPLES < endP; step += 1) {
      const d = reach(finish, loop[step]);
      if (d > far + 1e-6) [far, startP] = [d, step / SAMPLES];
    }
  } else {
    let far = -1;
    loop.forEach((points, step) => {
      const d = reach(loop[0], points);
      if (d > far + 1e-6) [far, endP] = [d, step / SAMPLES];
    });
  }

  const start = at(startP);
  const end = at(endP);
  const frames = Array.from({ length: PATH_POINTS + 1 }, (_, i) => at(startP + ((endP - startP) * i) / PATH_POINTS));
  const paths = tracked.map((which) => {
    const points = [];
    for (const frame of frames) {
      const point = where(frame, which);
      if (!points.length || gap(point, points.at(-1)) > 0.01) points.push({ x: point.x, y: point.y, z: point.z });
    }
    const depth = points.length > 1 ? points.at(-1).z - points[0].z : 0;
    const across = points.length > 1 ? flatGap(points.at(-1), points[0]) : 0;
    const hand = which === LM.leftWrist || which === LM.rightWrist; // punches are the moves thrown at the screen
    return { end: which, points, toward: hand && depth > 0.2 && depth > across * TOWARD ? depth : 0 };
  });
  const lit = [...new Set([...limbs.flatMap(({ chain }) => chain), ...(carried ? [...LEGS.r, ...LEGS.l] : [])])];
  const all = [...start, ...end, ...paths.flatMap((path) => path.points)].filter(Boolean);
  const box = {
    minX: Math.min(...all.map((point) => point.x)), maxX: Math.max(...all.map((point) => point.x)),
    minY: Math.min(...all.map((point) => point.y)), maxY: Math.max(...all.map((point) => point.y)),
  };
  return { gesture, fast, start: { points: start, lit }, end: { points: end, lit }, paths, box };
}

const cache = new Map();

// The guide for one move, or null when the coach has no pose for it. Built once per move.
export function rangeOf(gesture) {
  if (!cache.has(gesture)) cache.set(gesture, build(gesture));
  return cache.get(gesture);
}

// A cue names one move, or several when any of them answers it.
export const cueGestures = (cue) => (cue ? [cue.gesture].flat().filter(Boolean) : []);
