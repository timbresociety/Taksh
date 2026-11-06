// A synthetic human for gesture tests. It emits raw MediaPipe-shaped landmarks in un-mirrored image
// coordinates, so tests exercise the same normalisation path as a real camera frame.
import { LM, normalizeLandmarks } from "../../src/lib/motion/landmarks.js";

const SLOTS = 33;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296 - 0.5;
  };
}

// pose fields are in torso lengths, in the player's frame: negative x is the player's left.
// leftArm and rightArm place a raised arm by hand: { wrist: [x, y, z], elbow: [x, y] } as offsets from
// that shoulder, with y growing downward and negative z toward the camera. The elbow defaults to halfway.
export function rawPose(body, pose = {}) {
  const { torso, centerX, hipY, aspect } = body;
  const {
    x = 0,
    rise = 0,
    drop = 0,
    leftHandOut = 0,
    rightHandOut = 0,
    leftKick = 0,
    rightKick = 0,
    leftKnee = 0,
    rightKnee = 0,
    feetRise = 0,
    handsDown = false,
    lean = 0,
    leftArm = null,
    rightArm = null,
    hide = [],
    vis = 0.95,
  } = pose;

  // Player-frame positions, with y growing downward as in the image.
  const hip = { x, y: -rise + drop * 1.1 };
  const shoulderY = hip.y - 1 + drop * 0.25;
  const thigh = 0.85;
  const shin = 0.85;

  const side = (dir, handOut, kick, knee, arm) => {
    const hipSide = { x: hip.x + dir * 0.22, y: hip.y };
    const shoulder = { x: hip.x + dir * 0.45 + lean, y: shoulderY };
    const handHangs = handOut === 0 && !handsDown;
    const wrist = arm
      ? { x: shoulder.x + arm.wrist[0], y: shoulder.y + arm.wrist[1], z: arm.wrist[2] ?? 0 }
      : handsDown
        ? { x: hip.x + dir * 0.4, y: 1.75 }
        : handHangs
          ? { x: shoulder.x + dir * 0.08, y: shoulderY + 1.15 }
          : { x: shoulder.x + dir * handOut, y: shoulderY + 0.25 };
    const elbow = arm?.elbow
      ? { x: shoulder.x + arm.elbow[0], y: shoulder.y + arm.elbow[1] }
      : { x: (shoulder.x + wrist.x) / 2, y: (shoulder.y + wrist.y) / 2 };

    const ankleFloor = 1.7 - feetRise;
    const kneePoint = { x: hipSide.x + dir * kick * 0.5, y: hip.y + thigh * (1 - knee) - kick * 0.1 };
    const ankle = {
      x: hipSide.x + dir * kick,
      y: knee > 0 ? kneePoint.y + shin : ankleFloor - kick * 0.45,
    };
    return { hipSide, shoulder, elbow, wrist, knee: kneePoint, ankle };
  };

  const left = side(-1, leftHandOut, leftKick, leftKnee, leftArm);
  const right = side(1, rightHandOut, rightKick, rightKnee, rightArm);

  const points = Array.from({ length: SLOTS }, () => ({ x: 0, y: 0 }));
  const put = (index, point) => {
    points[index] = point;
  };
  put(LM.nose, { x: hip.x + lean, y: shoulderY - 0.4 });
  put(LM.leftShoulder, left.shoulder);
  put(LM.rightShoulder, right.shoulder);
  put(LM.leftElbow, left.elbow);
  put(LM.rightElbow, right.elbow);
  put(LM.leftWrist, left.wrist);
  put(LM.rightWrist, right.wrist);
  put(LM.leftHip, left.hipSide);
  put(LM.rightHip, right.hipSide);
  put(LM.leftKnee, left.knee);
  put(LM.rightKnee, right.knee);
  put(LM.leftAnkle, left.ankle);
  put(LM.rightAnkle, right.ankle);

  // Image x is un-mirrored, so the player's left sits at larger x. Torso is in frame-height units.
  return points.map((point, index) => ({
    x: centerX - (point.x * torso) / aspect,
    y: hipY + point.y * torso,
    visibility: hide.includes(index) ? 0.1 : vis,
    z: ((point.z ?? 0) * torso) / aspect,
  }));
}

export const BODIES = {
  midRange: { torso: 0.22, centerX: 0.5, hipY: 0.55, aspect: 16 / 9 },
  farAway: { torso: 0.15, centerX: 0.5, hipY: 0.6, aspect: 16 / 9 },
  closeUp: { torso: 0.28, centerX: 0.5, hipY: 0.48, aspect: 16 / 9 },
  squareCamera: { torso: 0.22, centerX: 0.5, hipY: 0.55, aspect: 4 / 3 },
};

// Plays a timeline of [durationMs, pose or (progress) => pose] through a sink at 30fps with sensor noise.
export function playTimeline(body, timeline, sink, { noise = 0.0025, seed = 7, startT = 0 } = {}) {
  const random = seeded(seed);
  let t = startT;
  for (const [durationMs, pose] of timeline) {
    const frames = Math.round(durationMs / 33);
    for (let frame = 0; frame < frames; frame += 1) {
      const current = typeof pose === "function" ? pose(frame / Math.max(1, frames - 1)) : pose;
      if (current === null) {
        sink(null, t);
      } else {
        const raw = rawPose(body, current).map((point) => ({
          ...point,
          x: point.x + random() * noise,
          y: point.y + random() * noise,
        }));
        sink(normalizeLandmarks(raw, body.aspect), t);
      }
      t += 33;
    }
  }
  return t;
}
