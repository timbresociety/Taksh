// Turns a stream of calibrated poses into discrete gesture events.
// Every gesture is a gate with separate enter and exit thresholds, so holding a position or
// hovering at a threshold fires once. A gate only rearms after the body has clearly left it.
import { ARM_POINTS, CORE_POINTS, LEG_POINTS, LM, distance, mid, visibility } from "./landmarks.js";
import { POSES, poseSimilarity } from "./poses.js";

// All distances are in torso lengths measured at calibration.
export const THRESHOLDS = {
  step: { enter: 0.6, exit: 0.35 },
  hand: { enter: 0.85, exit: 0.5 },
  kick: { enter: 0.8, exit: 0.5, lift: 0.22 },
  knee: { enter: 0.55, exit: 0.3, otherMax: 0.35 },
  jump: { enter: 0.24, exit: 0.1, feet: 0.14 },
  burpee: { enter: 0.95, exit: 0.35 },
  squat: { enter: 0.36, exit: 0.18 },
  lean: { enter: 0.3, exit: 0.14 },
  punch: { enter: 0.55, exit: 0.3 }, // the arm pointing at the camera; see forward() in measure
  hook: { enter: 0.3, exit: 0.08 }, // wrist past the chest centre at shoulder height
  uppercut: { enter: 3, exit: 1 }, // torso lengths per second, upward
  swing: { enter: 2.8, exit: 1 }, // torso lengths per second, sideways
  reach: { enter: 0.55, exit: 0.25 },
  lift: { enter: 0.5, exit: 0.25, otherMax: 0.2 }, // one leg up, the other foot on the floor
  slash: { speed: 2.6, travel: 0.7, settle: 1, coolMs: 240, reverseMs: 400 }, // torso lengths, and per second
  run: { swing: 0.16 }, // how far one foot must pass the other to count as a stride
  wings: { enter: 0.15, exit: -0.3, rearmMs: 40 },
  guard: { enter: 0.05, exit: -0.12 },
  pose: { similarity: 0.8, exit: 0.62, holdMs: 240, rearmMs: 150 },
};

// What the engine reports unless told otherwise. A game passes the moves it binds, because one arm
// movement can honestly be a swing, a slash and a pose at once, and only the game knows which it wants.
export const CLASSIC_MOVES = ["step_left", "step_right", "jump", "high_knee", "hand_left", "hand_right", "kick_left", "kick_right", "burpee"];

const DWELL_MS = 50;
const REARM_MS = 90;
const BOTH_HANDS_RISING = 1.5; // torso lengths per second; both hands rising is a guard, not an uppercut
const MIN_CONFIDENCE = 0.55;
const LOST_AFTER_MS = 600;
const BURPEE_GRACE_MS = 3500; // a plank hides most of the body from the camera
const STILL_SPEED = 0.35; // torso lengths per second
const BASELINE_RATE = 0.02;

const BOTH_HANDS_MS = 200; // one hand arrives first, so a single lift waits this long for the other
const RUN_WINDOW_MS = 1500;
const WORLD_TORSO_M = 0.5; // MediaPipe sizes its metric skeleton to a typical adult
const PUNCH_MAX_RISE = 0.35; // torso lengths above the shoulder; higher is arms going overhead
const PUNCH_MAX_DROP = 3; // torso lengths per second; a hand swinging past the shoulder this fast is no punch

const SHOULDER_POINTS = [LM.leftShoulder, LM.rightShoulder];

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const clampUnit = (value) => Math.min(1, Math.max(-1, value));

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

// A hand stroke across the body. It fires as soon as the hand has travelled far enough, so a slash
// lands while the arm is still moving. The way back is ignored, or every slash would count twice.
class Stroke {
  constructor() {
    this.path = null;
    this.quietUntil = 0;
    this.last = null;
  }

  update(vx, vy, seconds, t) {
    const { speed, travel, settle, coolMs, reverseMs } = THRESHOLDS.slash;
    const pace = Math.hypot(vx, vy);
    if (t < this.quietUntil) return null;
    if (!this.path) {
      if (pace < speed) return null;
      this.path = { x: 0, y: 0 };
    }
    if (pace < settle) {
      this.path = null;
      return null;
    }
    this.path.x += vx * seconds;
    this.path.y += vy * seconds;
    if (Math.hypot(this.path.x, this.path.y) < travel) return null;

    const horizontal = Math.abs(this.path.x) >= Math.abs(this.path.y);
    const direction = horizontal ? (this.path.x < 0 ? "left" : "right") : this.path.y < 0 ? "up" : "down";
    this.path = null;
    this.quietUntil = t + coolMs;
    const reversed = this.last && t - this.last.t < reverseMs && this.last.direction === OPPOSITE[direction];
    this.last = reversed ? null : { direction, t };
    return reversed ? null : direction;
  }
}

const OPPOSITE = { left: "right", right: "left", up: "down", down: "up" };

const slashPace = (f, axis, sign) => (f.handSpeed ? Math.max(sign * f.handSpeed.left[axis], sign * f.handSpeed.right[axis], 0) : 0);

// The moves every new game is built from. They are big and mostly across the camera's view, so they
// read well from a player standing far back on a laptop camera.
export const LOCKED_MOVES = [
  "step_left", "step_right", "jump", "squat_down",
  "reach_up_left", "reach_up_right", "hands_up", "lift_left", "lift_right",
  "slash_left", "slash_right", "slash_up", "slash_down",
  "punch_left", "punch_right", "guard", "run_step",
];

// The live reading behind each gated move, for practice meters and the input lab.
export const MOVE_READINGS = {
  step_left: { gate: "step", read: (f) => -f.hipOffset },
  step_right: { gate: "step", read: (f) => f.hipOffset },
  jump: { gate: "jump", read: (f) => (f.feetLifted ? f.hipRise : 0) },
  squat_down: { gate: "squat", read: (f) => f.squat },
  lean_left: { gate: "lean", read: (f) => -f.lean },
  lean_right: { gate: "lean", read: (f) => f.lean },
  punch_left: { gate: "punch", read: (f) => f.punchLeft },
  punch_right: { gate: "punch", read: (f) => f.punchRight },
  hook_left: { gate: "hook", read: (f) => f.hookLeft },
  hook_right: { gate: "hook", read: (f) => f.hookRight },
  uppercut_left: { gate: "uppercut", read: (f) => f.riseLeft },
  uppercut_right: { gate: "uppercut", read: (f) => f.riseRight },
  reach_up_left: { gate: "reach", read: (f) => f.heightLeft },
  reach_up_right: { gate: "reach", read: (f) => f.heightRight },
  hands_up: { gate: "reach", read: (f) => Math.min(f.heightLeft, f.heightRight) },
  lift_left: { gate: "lift", read: (f) => f.liftLeft },
  lift_right: { gate: "lift", read: (f) => f.liftRight },
  guard: { gate: "guard", read: (f) => f.guard },
  slash_left: { gate: "slash", read: (f) => slashPace(f, "x", -1) },
  slash_right: { gate: "slash", read: (f) => slashPace(f, "x", 1) },
  slash_up: { gate: "slash", read: (f) => slashPace(f, "y", -1) },
  slash_down: { gate: "slash", read: (f) => slashPace(f, "y", 1) },
  run_step: { gate: "run", read: (f) => f.cadence },
  hand_left: { gate: "hand", read: (f) => f.reachLeft },
  hand_right: { gate: "hand", read: (f) => f.reachRight },
  high_knee: { gate: "knee", read: (f) => Math.max(f.kneeLeft, f.kneeRight) },
};

// Practice can only make a move easier to trigger, and never down into the noise of standing still.
const LOWEST_SHARE = 0.5;
const PEAK_SHARE = 0.7;

// The peak a player reached in practice, turned into an enter level for that move's gate.
export function personalLevel(gesture, peak) {
  const reading = MOVE_READINGS[gesture];
  if (!reading) return null;
  const { enter } = THRESHOLDS[reading.gate];
  if (enter === undefined) return null; // slashes and strides are speeds, and speed is not personal
  return Math.min(enter, Math.max(enter * LOWEST_SHARE, peak * PEAK_SHARE));
}

// The value a reading must reach. Steps and strides have no gate of their own to ask.
const FIXED_LEVELS = { slash: THRESHOLDS.slash.speed, run: 2, step: THRESHOLDS.step.enter };

export class GestureEngine {
  constructor(calibration, { framing = "full", moves = CLASSIC_MOVES, personal = {} } = {}) {
    this.cal = { ...calibration, startTorso: calibration.torso };
    this.framing = framing;
    this.moves = moves === "all" ? null : new Set(moves);
    this.gates = {
      hand_left: new Gate(THRESHOLDS.hand),
      hand_right: new Gate(THRESHOLDS.hand),
      kick_left: new Gate(THRESHOLDS.kick),
      kick_right: new Gate(THRESHOLDS.kick),
      knee_left: new Gate(THRESHOLDS.knee),
      knee_right: new Gate(THRESHOLDS.knee),
      jump: new Gate(THRESHOLDS.jump),
      burpee: new Gate(THRESHOLDS.burpee),
      squat: new Gate(THRESHOLDS.squat),
      lean_left: new Gate(THRESHOLDS.lean),
      lean_right: new Gate(THRESHOLDS.lean),
      punch_left: new Gate(THRESHOLDS.punch),
      punch_right: new Gate(THRESHOLDS.punch),
      hook_left: new Gate(THRESHOLDS.hook),
      hook_right: new Gate(THRESHOLDS.hook),
      uppercut_left: new Gate(THRESHOLDS.uppercut),
      uppercut_right: new Gate(THRESHOLDS.uppercut),
      swing_left: new Gate(THRESHOLDS.swing),
      swing_right: new Gate(THRESHOLDS.swing),
      reach_up_left: new Gate(THRESHOLDS.reach),
      reach_up_right: new Gate(THRESHOLDS.reach),
      hands_up: new Gate(THRESHOLDS.reach),
      lift_left: new Gate(THRESHOLDS.lift),
      lift_right: new Gate(THRESHOLDS.lift),
      wings: new Gate(THRESHOLDS.wings),
      guard: new Gate(THRESHOLDS.guard),
    };
    this.personalise(personal);
    this.strokes = { left: new Stroke(), right: new Stroke() };
    this.waitingLift = null;
    this.runSide = null;
    this.strides = [];
    this.held = { pose: null, since: 0, fired: false };
    this.lastWrists = null;
    this.zone = 0;
    this.lastCoreAt = null;
    this.lastHip = null;
    this.tracking = "searching";
  }

  // Scales a gate's exit with its enter, so a lowered move still has to be clearly left to rearm.
  personalise(levels) {
    const gatesFor = { high_knee: ["knee_left", "knee_right"], squat_down: ["squat"] };
    for (const [gesture, level] of Object.entries(levels)) {
      for (const name of gatesFor[gesture] ?? [gesture]) {
        const gate = this.gates[name];
        if (!gate) continue;
        gate.exit *= level / gate.enter;
        gate.enter = level;
      }
    }
  }

  // How close the live reading is to firing this move: 1 means it fires.
  meter(gesture, features) {
    const reading = MOVE_READINGS[gesture];
    if (!reading || !features) return 0;
    return Math.max(0, reading.read(features) / this.level(gesture));
  }

  // The value this move's reading has to reach for this player right now.
  level(gesture) {
    const gate = this.gates[gesture === "squat_down" ? "squat" : gesture];
    const { gate: kind } = MOVE_READINGS[gesture];
    return gate?.enter ?? FIXED_LEVELS[kind] ?? THRESHOLDS[kind].enter;
  }

  // Returns { events, tracking, features }. Pass null points when no pose was detected.
  push(points, t) {
    const anchor = this.framing === "full" ? CORE_POINTS : SHOULDER_POINTS;
    const coreVisibility = points ? visibility(points, anchor) : 0;
    if (coreVisibility >= MIN_CONFIDENCE) {
      this.lastCoreAt = t;
    } else {
      const graceMs = this.gates.burpee.held ? BURPEE_GRACE_MS : LOST_AFTER_MS;
      if (this.lastCoreAt === null || t - this.lastCoreAt > graceMs) this.tracking = "lost";
      return { events: [], tracking: this.tracking, features: null };
    }

    this.frameT = t;
    const features = this.measure(points);
    const legsVisible = features.legVisibility >= MIN_CONFIDENCE;
    this.tracking = legsVisible || this.framing !== "full" ? "good" : "partial";

    const events = [];
    const emit = (gesture, value, enter, seen, extra) => {
      if (this.moves && !this.moves.has(gesture)) return;
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

    const grounded = !lowered && !airborne;
    check("lift_left", "lift_left", f.liftLeft, f.legVisibility, grounded);
    check("lift_right", "lift_right", f.liftRight, f.legVisibility, grounded);
    this.readStrides(f, t, emit);

    if (!lowered) this.updateZone(f, emit);
    this.readExercises(f, points, t, check, emit);
    this.adaptBaseline(f, t, events.length > 0);
    return { events, tracking: this.tracking, features: f };
  }

  // Arm and torso exercises. Each is gated like the moves above; a squat and a flap also report the
  // moment they are released, because those games act on the way back up or down.
  readExercises(f, points, t, check, emit) {
    const hands = Math.min(f.leftHandVisibility, f.rightHandVisibility);
    const torso = this.framing === "full" ? f.coreVisibility : f.shoulderVisibility;
    const squatting = this.gates.squat.held;
    check("squat", "squat_down", f.squat, torso);
    if (squatting && !this.gates.squat.held) emit("squat_up", THRESHOLDS.squat.enter, THRESHOLDS.squat.enter, torso);

    check("lean_left", "lean_left", -f.lean, torso);
    check("lean_right", "lean_right", f.lean, torso);
    check("punch_left", "punch_left", f.punchLeft, f.leftHandVisibility);
    check("punch_right", "punch_right", f.punchRight, f.rightHandVisibility);
    check("hook_left", "hook_left", f.hookLeft, f.leftHandVisibility);
    check("hook_right", "hook_right", f.hookRight, f.rightHandVisibility);
    // A fist coming back from a punch or hook is rising too, and is not an uppercut.
    const armBusy = (side) => this.gates[`punch_${side}`].held || this.gates[`hook_${side}`].held;
    check("uppercut_left", "uppercut_left", f.riseLeft, f.leftHandVisibility, !armBusy("left"));
    check("uppercut_right", "uppercut_right", f.riseRight, f.rightHandVisibility, !armBusy("right"));
    check("swing_left", "swing_left", -f.sweep, hands);
    check("swing_right", "swing_right", f.sweep, hands);
    this.readLifts(f, t, hands, emit);
    this.readSlashes(f, t, emit);
    check("guard", "guard", f.guard, hands);

    const raised = this.gates.wings.held;
    this.gates.wings.update(Math.min(f.heightLeft, f.heightRight), hands >= MIN_CONFIDENCE, t);
    if (raised && !this.gates.wings.held) emit("flap", THRESHOLDS.wings.enter, THRESHOLDS.wings.enter, hands);

    if (hands >= MIN_CONFIDENCE) this.readPose(points, t, hands, emit);
  }

  // Both arms going up is its own move, so a lone hand waits a moment to see if the other follows.
  readLifts(f, t, hands, emit) {
    const update = (name, value, seen) => this.gates[name].update(value, seen >= MIN_CONFIDENCE, t);
    const left = update("reach_up_left", f.heightLeft, f.leftHandVisibility);
    const right = update("reach_up_right", f.heightRight, f.rightHandVisibility);
    const both = update("hands_up", Math.min(f.heightLeft, f.heightRight), hands);
    const { enter } = this.gates.reach_up_left;

    if (both) {
      this.waitingLift = null;
      emit("hands_up", Math.min(f.heightLeft, f.heightRight), enter, hands);
      return;
    }
    if (left || right) this.waitingLift ??= { side: left ? "left" : "right", t };
    if (this.waitingLift && t - this.waitingLift.t >= BOTH_HANDS_MS) {
      const { side } = this.waitingLift;
      this.waitingLift = null;
      emit(`reach_up_${side}`, side === "left" ? f.heightLeft : f.heightRight, enter, side === "left" ? f.leftHandVisibility : f.rightHandVisibility);
    }
  }

  readSlashes(f, t, emit) {
    const fired = new Set(); // both hands going the same way at once is one slash
    for (const side of ["left", "right"]) {
      const seen = side === "left" ? f.leftHandVisibility : f.rightHandVisibility;
      if (seen < MIN_CONFIDENCE || !f.handSpeed) continue;
      const { x, y, seconds } = f.handSpeed[side];
      const direction = this.strokes[side].update(x, y, seconds, t);
      if (!direction || fired.has(direction)) continue;
      fired.add(direction);
      emit(`slash_${direction}`, Math.hypot(x, y), THRESHOLDS.slash.speed, seen, { hand: side });
    }
  }

  // Running on the spot is feet trading places, read from how far one foot passes the other.
  readStrides(f, t, emit) {
    while (this.strides.length && t - this.strides[0] > RUN_WINDOW_MS) this.strides.shift();
    f.cadence = this.strides.length / (RUN_WINDOW_MS / 1000);
    if (f.legVisibility < MIN_CONFIDENCE) return;
    const side = f.footGap > THRESHOLDS.run.swing ? "left" : f.footGap < -THRESHOLDS.run.swing ? "right" : null;
    if (!side || side === this.runSide) return;
    const first = this.runSide === null;
    this.runSide = side;
    if (first) return;
    this.strides.push(t);
    emit("run_step", Math.abs(f.footGap), THRESHOLDS.run.swing, f.legVisibility, { side });
  }

  // A pose counts once it has been held briefly, and again only after the player has left it.
  readPose(points, t, seen, emit) {
    const joints = {
      leftShoulder: points[LM.leftShoulder], leftElbow: points[LM.leftElbow], leftWrist: points[LM.leftWrist],
      rightShoulder: points[LM.rightShoulder], rightElbow: points[LM.rightElbow], rightWrist: points[LM.rightWrist],
    };
    const { similarity, exit, holdMs, rearmMs } = THRESHOLDS.pose;
    const { held } = this;
    if (held.fired) {
      const target = POSES.find((pose) => pose.id === held.pose);
      if (poseSimilarity(joints, target) >= exit) {
        held.leftAt = null;
        return;
      }
      held.leftAt ??= t;
      if (t - held.leftAt < rearmMs) return;
    }

    let match = null;
    let best = similarity;
    for (const pose of POSES) {
      const score = poseSimilarity(joints, pose);
      if (score >= best) {
        best = score;
        match = pose.id;
      }
    }
    if (match !== held.pose || held.fired) this.held = { pose: match, since: t, fired: false, leftAt: null };
    if (match && !this.held.fired && t - this.held.since >= holdMs) {
      this.held.fired = true;
      emit(`pose_${match}`, best, similarity, seen);
    }
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

    const leftShoulder = points[LM.leftShoulder];
    const rightShoulder = points[LM.rightShoulder];
    const nose = points[LM.nose];
    const elbowUp = (elbow) => elbow.y < shoulder.y + 0.4 * u;
    const nearShoulderHeight = (wrist) => Math.abs(wrist.y - shoulder.y) < 0.6 * u;
    // Depth is the weakest thing the tracker reports, so a punch has a second witness: an arm aimed at
    // the camera looks short in the image. The elbow tells it from a guard, where the fist is close but
    // the upper arm still hangs at full length.
    const upperArm = cal.upperArm ?? 0.6 * u;
    const armLength = cal.armLength ?? 1.15 * u;
    const depth = (from, wrist) => (from.w === undefined ? ((from.z ?? 0) - (wrist.z ?? 0)) / u : (from.w - wrist.w) / WORLD_TORSO_M);
    const shortening = (from, elbow, wrist) => Math.min(1 - distance(from, elbow) / upperArm, 1 - distance(from, wrist) / armLength);
    const forward = (from, elbow, wrist) => {
      if (!nearShoulderHeight(wrist) || from.y - wrist.y > PUNCH_MAX_RISE * u || Math.abs(wrist.x - from.x) >= 0.7 * u) return 0;
      return Math.max(depth(from, wrist), shortening(from, elbow, wrist));
    };
    const across = (wrist, elbow, dir) => (nearShoulderHeight(wrist) && elbowUp(elbow) ? (dir * (wrist.x - shoulder.x)) / u : 0);

    // Hand speeds are measured against the shoulders, so moving the whole body is not a swing.
    const now = { t: this.frameT, left: leftWrist, right: rightWrist, body: shoulder };
    const before = this.lastWrists;
    this.lastWrists = now;
    const seconds = before ? Math.max(0.001, (now.t - before.t) / 1000) : null;
    const velocity = (side, axis) => (seconds ? (now[side][axis] - before[side][axis] - (now.body[axis] - before.body[axis])) / u / seconds : 0);
    const fastest = (a, b) => (Math.abs(a) > Math.abs(b) ? a : b);
    // A punch goes forward. Arms swinging through shoulder height read as depth, and swing fast up or down.
    const straight = (side) => Math.abs(velocity(side, "y")) < PUNCH_MAX_DROP;
    const handSpeed = seconds && { left: { x: velocity("left", "x"), y: velocity("left", "y"), seconds }, right: { x: velocity("right", "x"), y: velocity("right", "y"), seconds } };
    const aimAt = (wrist) => ({ x: clampUnit((wrist.x - shoulder.x) / (armLength * 1.2)), y: clampUnit((shoulder.y + 0.3 * u - wrist.y) / (armLength * 1.2)) });
    const legLift = (knee, foot, otherFoot) => (otherFoot < THRESHOLDS.lift.otherMax ? Math.max(knee, foot) : 0);
    const rising = (side, other, wrist) => (Math.abs(wrist.x - shoulder.x) < 0.9 * u && wrist.y < shoulder.y + 0.5 * u && -velocity(other, "y") < BOTH_HANDS_RISING ? -velocity(side, "y") : 0);
    const upper = this.framing !== "full"; // the hips may be below the frame, so the shoulders stand in

    // Both arms reading forward at once is arms going up together, not a punch. In a real session four
    // in five depth readings were this.
    const forwardLeft = straight("left") ? forward(leftShoulder, points[LM.leftElbow], leftWrist) : 0;
    const forwardRight = straight("right") ? forward(rightShoulder, points[LM.rightElbow], rightWrist) : 0;
    const together = Math.min(forwardLeft, forwardRight) >= THRESHOLDS.punch.exit;

    return {
      squat: upper ? shoulderDrop : Math.max(leftWrist.y, rightWrist.y) > cal.kneeY + 0.5 * u ? 0 : (hip.y - cal.hipY) / u,
      lean: upper ? (shoulder.x - cal.shoulderX) / u : (shoulder.x - hip.x) / u,
      punchLeft: together ? 0 : forwardLeft,
      punchRight: together ? 0 : forwardRight,
      hookLeft: across(leftWrist, points[LM.leftElbow], 1),
      hookRight: across(rightWrist, points[LM.rightElbow], -1),
      riseLeft: rising("left", "right", leftWrist),
      riseRight: rising("right", "left", rightWrist),
      sweep: fastest(velocity("left", "x"), velocity("right", "x")),
      heightLeft: (shoulder.y - leftWrist.y) / u,
      heightRight: (shoulder.y - rightWrist.y) / u,
      guard: 0.6 - Math.max(distance(leftWrist, nose), distance(rightWrist, nose)) / u,
      hipOffset: (hip.x - cal.hipX) / u,
      reachLeft: reach(points[LM.leftShoulder], { wrist: leftWrist, dir: -1 }),
      reachRight: reach(points[LM.rightShoulder], { wrist: rightWrist, dir: 1 }),
      kickLeft: kick(leftAnkle, rightAnkle, -1),
      kickRight: kick(rightAnkle, leftAnkle, 1),
      kneeLeft: kneeLift(points[LM.leftKnee], cal.thighLeft),
      kneeRight: kneeLift(points[LM.rightKnee], cal.thighRight),
      liftLeft: legLift(kneeLift(points[LM.leftKnee], cal.thighLeft), leftFootRise, rightFootRise),
      liftRight: legLift(kneeLift(points[LM.rightKnee], cal.thighRight), rightFootRise, leftFootRise),
      footGap: leftFootRise - rightFootRise,
      cadence: 0,
      handSpeed,
      aim: { left: aimAt(leftWrist), right: aimAt(rightWrist) },
      hipRise,
      feetLifted: Math.min(leftFootRise, rightFootRise) >= THRESHOLDS.jump.feet,
      shoulderDrop,
      burpee: handsLow ? shoulderDrop : 0,
      scale: Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y) / cal.startTorso,
      coreVisibility: visibility(points, CORE_POINTS),
      shoulderVisibility: visibility(points, SHOULDER_POINTS),
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
    // Standing closer or further makes the player a different size in the image, and every reading
    // is measured in that size.
    if (this.framing === "full") this.cal.torso += (f.scale * this.cal.startTorso - this.cal.torso) * BASELINE_RATE;
  }
}
