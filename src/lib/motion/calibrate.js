// Calibration: checks framing, waits for a still neutral stance, then records the player's own
// proportions. Every gesture threshold is expressed in multiples of the torso length measured here.
import { CORE_POINTS, LEG_POINTS, ARM_POINTS, LM, distance, mid, visibility } from "./landmarks.js";

const HOLD_MS = 1800;
const MIN_VISIBILITY = 0.6;
const MAX_SWAY = 0.09; // torso lengths
const MIN_TORSO = 0.11; // fractions of frame height; smaller means too far to track limbs well
const MAX_TORSO = 0.34; // larger means the feet cannot stay in frame through a jump

const SHOULDERS = [LM.leftShoulder, LM.rightShoulder];

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function measure(points) {
  const shoulder = mid(points[LM.leftShoulder], points[LM.rightShoulder]);
  const hip = mid(points[LM.leftHip], points[LM.rightHip]);
  const ankleY = (points[LM.leftAnkle].y + points[LM.rightAnkle].y) / 2;
  const kneeY = (points[LM.leftKnee].y + points[LM.rightKnee].y) / 2;
  return {
    torso: distance(shoulder, hip),
    hipX: hip.x,
    hipY: hip.y,
    shoulderX: shoulder.x,
    shoulderY: shoulder.y,
    ankleY,
    kneeY,
    thighLeft: Math.abs(points[LM.leftKnee].y - hip.y),
    thighRight: Math.abs(points[LM.rightKnee].y - hip.y),
  };
}

// Arm games only need the upper body in view, so a laptop on a desk or a seated player can calibrate.
function framingIssue(points, framing) {
  const full = framing === "full";
  if (!points) return "Step into the camera's view.";
  if (full && visibility(points, CORE_POINTS) < MIN_VISIBILITY) return "Face the camera so your shoulders and hips are visible.";
  if (!full && visibility(points, SHOULDERS) < MIN_VISIBILITY) return "Face the camera so your shoulders are visible.";
  if (full && visibility(points, LEG_POINTS) < MIN_VISIBILITY) return "Step back until your feet are in frame.";
  if (visibility(points, ARM_POINTS) < MIN_VISIBILITY) return "Keep both hands in view.";
  const { torso } = measure(points);
  if (torso < MIN_TORSO) return "Move closer to the camera.";
  if (full && torso > MAX_TORSO) return "Step back from the camera.";
  if (points[LM.nose].y < 0.05) return "Tilt the camera down or step back. Your head is at the top edge.";
  if (full && Math.max(points[LM.leftAnkle].y, points[LM.rightAnkle].y) > 0.97) return "Step back. Your feet are at the bottom edge.";
  return null;
}

export class Calibrator {
  constructor({ framing = "full" } = {}) {
    this.framing = framing;
    this.samples = [];
    this.startedAt = null;
  }

  // Returns { done, progress, message, calibration }. Pass null when no pose is detected.
  push(points, t) {
    const issue = framingIssue(points, this.framing);
    if (issue) {
      this.reset();
      return { done: false, progress: 0, message: issue };
    }

    const sample = measure(points);
    if (this.samples.length) {
      const anchor = this.samples[0];
      const sway = Math.hypot(sample.hipX - anchor.hipX, sample.hipY - anchor.hipY) / anchor.torso;
      if (sway > MAX_SWAY) {
        this.reset();
        return { done: false, progress: 0, message: "Hold still with your arms at your sides." };
      }
    }

    this.startedAt ??= t;
    this.samples.push(sample);
    const progress = Math.min(1, (t - this.startedAt) / HOLD_MS);
    if (progress < 1) return { done: false, progress, message: "Hold still." };

    const calibration = Object.fromEntries(
      Object.keys(sample).map((key) => [key, average(this.samples.map((item) => item[key]))]),
    );
    return { done: true, progress: 1, message: "Calibrated.", calibration };
  }

  reset() {
    this.samples = [];
    this.startedAt = null;
  }
}
