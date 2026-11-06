// MediaPipe Pose landmark indices, and conversion from raw image coordinates to a mirrored,
// square-unit space: the player's left is screen left, and x and y share one scale.

export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
};

export const SKELETON = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
];

export const CORE_POINTS = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip];
export const LEG_POINTS = [LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle];
export const ARM_POINTS = [LM.leftWrist, LM.rightWrist];
const TRACKED_POINTS = Object.values(LM);

export function normalizeLandmarks(raw, aspect) {
  return raw.map((point) => ({
    x: (1 - point.x) * aspect,
    y: point.y,
    v: point.visibility ?? 0,
  }));
}

export function visibility(points, indices) {
  return Math.min(...indices.map((index) => points[index].v));
}

export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// One Euro filter: smooths jitter when a joint is still, and stays responsive when it moves fast.
class OneEuro {
  constructor(minCutoff, beta) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.value = null;
    this.derivative = 0;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value, dt) {
    if (this.value === null) {
      this.value = value;
      return value;
    }
    const rawDerivative = (value - this.value) / dt;
    this.derivative += OneEuro.alpha(1, dt) * (rawDerivative - this.derivative);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.derivative);
    this.value += OneEuro.alpha(cutoff, dt) * (value - this.value);
    return this.value;
  }
}

export class LandmarkSmoother {
  constructor({ minCutoff = 1.6, beta = 6 } = {}) {
    this.filters = new Map(
      TRACKED_POINTS.map((index) => [index, [new OneEuro(minCutoff, beta), new OneEuro(minCutoff, beta)]]),
    );
    this.lastT = null;
  }

  push(points, t) {
    const dt = this.lastT === null ? 1 / 30 : Math.max(0.001, (t - this.lastT) / 1000);
    this.lastT = t;
    const out = points.slice();
    for (const [index, [fx, fy]] of this.filters) {
      const point = points[index];
      out[index] = { x: fx.filter(point.x, dt), y: fy.filter(point.y, dt), v: point.v };
    }
    return out;
  }
}
