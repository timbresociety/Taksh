// Turns a stream of calibrated poses into discrete gesture events.
// Every gesture is a gate with separate enter and exit thresholds, so holding a position or
// hovering at a threshold fires once. A gate only rearms after the body has clearly left it.
import { ARM_POINTS, CORE_POINTS, LEG_POINTS, LM, mid, visibility } from "./landmarks.js";

// All distances are in torso lengths measured at calibration.
export const THRESHOLDS = {
  step: { enter: 0.6, exit: 0.35 },
  hand: { enter: 0.85, exit: 0.5 },
  kick: { enter: 0.8, exit: 0.5, lift: 0.22 },
  knee: { enter: 0.55, exit: 0.3, otherMax: 0.35 },
  jump: { enter: 0.24, exit: 0.1, feet: 0.14 },
  burpee: { enter: 0.95, exit: 0.35 },
};

const DWELL_MS = 50;
const REARM_MS = 90;
const MIN_CONFIDENCE = 0.55;
const LOST_AFTER_MS = 600;
const BURPEE_GRACE_MS = 3500; // a plank hides most of the body from the camera
const STILL_SPEED = 0.35; // torso lengths per second
const BASELINE_RATE = 0.02;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

export class Gate {
  constructor({ enter, exit, dwellMs = DWELL_MS, rearmMs = REARM_MS }) {
    Object.assign(this, { enter, exit, dwellMs, rearmMs });
    this.held = false;
    this.aboveSince = null;
    this.belowSince = null;
  }

  // Low-confidence frames neither fire nor rearm. A flicker mid-hold cannot cause a double count.
  update(value, reliable, t) {
    if (!reliable) {
      this.aboveSince = null;
      this.belowSince = null;
      return false;
    }
    if (this.held) {
      if (value > this.exit) {
        this.belowSince = null;
        return false;
      }
      this.belowSince ??= t;
      if (t - this.belowSince >= this.rearmMs) {
        this.held = false;
        this.aboveSince = null;
      }
      return false;
    }
    if (value < this.enter) {
      this.aboveSince = null;
      return false;
    }
    this.aboveSince ??= t;
    if (t - this.aboveSince < this.dwellMs) return false;
    this.held = true;
    this.belowSince = null;
    return true;
  }
}

export class GestureEngine {
  constructor(calibration) {
    this.cal = { ...calibration };
    this.gates = {
      hand_left: new Gate(THRESHOLDS.hand),
      hand_right: new Gate(THRESHOLDS.hand),
      kick_left: new Gate(THRESHOLDS.kick),
      kick_right: new Gate(THRESHOLDS.kick),
      knee_left: new Gate(THRESHOLDS.knee),
      knee_right: new Gate(THRESHOLDS.knee),
      jump: new Gate(THRESHOLDS.jump),
      burpee: new Gate(THRESHOLDS.burpee),
    };
    this.zone = 0;
    this.lastCoreAt = null;
    this.lastHip = null;
    this.tracking = "searching";
  }

  // Returns { events, tracking, features }. Pass null points when no pose was detected.
  push(points, t) {
    const coreVisibility = points ? visibility(points, CORE_POINTS) : 0;
    if (coreVisibility >= MIN_CONFIDENCE) {
      this.lastCoreAt = t;
    } else {
      const graceMs = this.gates.burpee.held ? BURPEE_GRACE_MS : LOST_AFTER_MS;
      if (this.lastCoreAt === null || t - this.lastCoreAt > graceMs) this.tracking = "lost";
      return { events: [], tracking: this.tracking, features: null };
    }

    const features = this.measure(points);
    const legsVisible = features.legVisibility >= MIN_CONFIDENCE;
    this.tracking = legsVisible ? "good" : "partial";

    const events = [];
    const emit = (gesture, value, enter, seen, extra) => {
      const margin = clamp01(0.6 + (0.4 * (value - enter)) / Math.max(enter * 0.5, 0.01));
      events.push({ gesture, t, confidence: Number((seen * margin).toFixed(2)), ...extra });
    };

    const check = (gate, gesture, value, seen, enabled = true) => {
      const reliable = seen >= MIN_CONFIDENCE;
      const fired = this.gates[gate].update(enabled ? value : 0, reliable, t);
      if (fired) emit(gesture, value, this.gates[gate].enter, seen);
    };

    const f = features;
    check("burpee", "burpee", f.burpee, Math.min(f.coreVisibility, f.armVisibility));
    const lowered = this.gates.burpee.held || f.shoulderDrop > 0.5;
    const airborne = f.hipRise > THRESHOLDS.jump.enter * 0.8;

    check("jump", "jump", f.feetLifted ? f.hipRise : 0, f.legVisibility, !lowered);
    check("hand_left", "hand_left", f.reachLeft, f.leftHandVisibility, !lowered);
    check("hand_right", "hand_right", f.reachRight, f.rightHandVisibility, !lowered);
    check("kick_left", "kick_left", f.kickLeft, f.legVisibility, !lowered);
    check("kick_right", "kick_right", f.kickRight, f.legVisibility, !lowered);
    check("knee_left", "high_knee", f.kneeLeft, f.legVisibility, !lowered && !airborne && f.kneeRight < THRESHOLDS.knee.otherMax && f.kickLeft < THRESHOLDS.kick.exit);
    check("knee_right", "high_knee", f.kneeRight, f.legVisibility, !lowered && !airborne && f.kneeLeft < THRESHOLDS.knee.otherMax && f.kickRight < THRESHOLDS.kick.exit);

    if (!lowered) this.updateZone(f, emit);
    this.adaptBaseline(f, t, events.length > 0);
    return { events, tracking: this.tracking, features: f };
  }

  // The floor space has three zones with hysteresis, so lanes stay in step with where the player
  // stands. Coming back to the middle is a step too, marked so the input lab can tell it apart.
  updateZone(f, emit) {
    const { enter, exit } = THRESHOLDS.step;
    const offset = f.hipOffset;
    const magnitude = Math.abs(offset);
    if (this.zone === 0 && magnitude >= enter) {
      this.zone = Math.sign(offset);
      emit(this.zone < 0 ? "step_left" : "step_right", magnitude, enter, f.coreVisibility, { zone: this.zone });
    } else if (this.zone !== 0 && (Math.sign(offset) !== this.zone || magnitude <= exit)) {
      const gesture = this.zone < 0 ? "step_right" : "step_left";
      this.zone = 0;
      emit(gesture, enter, enter, f.coreVisibility, { zone: 0, returning: true });
    }
  }

  measure(points) {
    const { cal } = this;
    const u = cal.torso;
    const hip = mid(points[LM.leftHip], points[LM.rightHip]);
    const shoulder = mid(points[LM.leftShoulder], points[LM.rightShoulder]);
    const leftAnkle = points[LM.leftAnkle];
    const rightAnkle = points[LM.rightAnkle];
    const leftWrist = points[LM.leftWrist];
    const rightWrist = points[LM.rightWrist];

    const hipRise = (cal.hipY - hip.y) / u;
    const leftFootRise = (cal.ankleY - leftAnkle.y) / u;
    const rightFootRise = (cal.ankleY - rightAnkle.y) / u;
    const shoulderDrop = (shoulder.y - cal.shoulderY) / u;
    const handsLow = Math.max(leftWrist.y, rightWrist.y) > cal.kneeY - 0.25 * u;

    const handHeightOk = (wrist) => wrist.y < hip.y + 0.1 * u;
    const reach = (from, to) => (handHeightOk(to.wrist) ? (to.dir * (to.wrist.x - from.x)) / u : 0);
    const kick = (ankle, otherAnkle, dir) => {
      const lift = (otherAnkle.y - ankle.y) / u;
      return lift >= THRESHOLDS.kick.lift ? (dir * (ankle.x - hip.x)) / u : 0;
    };
    const kneeLift = (knee, thigh) => 1 - (knee.y - hip.y) / thigh;

    return {
      hipOffset: (hip.x - cal.hipX) / u,
      reachLeft: reach(points[LM.leftShoulder], { wrist: leftWrist, dir: -1 }),
      reachRight: reach(points[LM.rightShoulder], { wrist: rightWrist, dir: 1 }),
      kickLeft: kick(leftAnkle, rightAnkle, -1),
      kickRight: kick(rightAnkle, leftAnkle, 1),
      kneeLeft: kneeLift(points[LM.leftKnee], cal.thighLeft),
      kneeRight: kneeLift(points[LM.rightKnee], cal.thighRight),
      hipRise,
      feetLifted: Math.min(leftFootRise, rightFootRise) >= THRESHOLDS.jump.feet,
      shoulderDrop,
      burpee: handsLow ? shoulderDrop : 0,
      scale: Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y) / u,
      coreVisibility: visibility(points, CORE_POINTS),
      legVisibility: visibility(points, LEG_POINTS),
      armVisibility: visibility(points, ARM_POINTS),
      leftHandVisibility: points[LM.leftWrist].v,
      rightHandVisibility: points[LM.rightWrist].v,
      hip,
      shoulderY: shoulder.y,
      ankleY: (leftAnkle.y + rightAnkle.y) / 2,
    };
  }

  // Slow drift correction while standing still, because players creep toward or away from the
  // screen. It only moves vertical baselines; lane zones stay anchored to the calibrated spot.
  adaptBaseline(f, t, fired) {
    const last = this.lastHip;
    this.lastHip = { x: f.hip.x, y: f.hip.y, t };
    if (!last || fired || t <= last.t) return;

    const speed = Math.hypot(f.hip.x - last.x, f.hip.y - last.y) / this.cal.torso / ((t - last.t) / 1000);
    const atRest = Object.values(this.gates).every((gate) => !gate.held);
    const nearNeutral = Math.abs(f.hipRise) < 0.2 && f.shoulderDrop < 0.2;
    if (speed > STILL_SPEED || !atRest || !nearNeutral) return;

    this.cal.hipY += (f.hip.y - this.cal.hipY) * BASELINE_RATE;
    this.cal.shoulderY += (f.shoulderY - this.cal.shoulderY) * BASELINE_RATE;
    this.cal.ankleY += (f.ankleY - this.cal.ankleY) * BASELINE_RATE;
  }
}
