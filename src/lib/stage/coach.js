// The teacher: one rigged character that shows a move on a loop, facing the player like a mirror.
// Moves are posed from bone directions rather than clips, so each uses the side the game means and
// moves the library has no clip for, like an uppercut, still look right. The same poses serve the games.
import * as THREE from "three";
import { LM, SKELETON } from "../motion/landmarks.js";
import { POSES } from "../motion/poses.js";
import { aimBone, createCharacter } from "./character.js";

const LOOP_S = 2.2;
const AIM = new THREE.Vector3();
const JOINT = new THREE.Vector3();
const DEMO = "rgba(255,255,255,0.7)";
const TRAIL_POINTS = 70;
const TRAVEL_SAMPLES = 24;
const MOVING_SHARE = 0.5;
const STILL_M = 0.01;
const CARRIED_M = 0.15;
const TURNED = 0.3;

// The tracker's joints on the rig, so the demonstration is drawn exactly like the player's own skeleton.
// The player's left is the rig's right, because it faces them.
const JOINT_BONES = {
  [LM.nose]: "Head",
  [LM.leftShoulder]: "upperarm_r", [LM.rightShoulder]: "upperarm_l",
  [LM.leftElbow]: "lowerarm_r", [LM.rightElbow]: "lowerarm_l",
  [LM.leftWrist]: "hand_r", [LM.rightWrist]: "hand_l",
  [LM.leftHip]: "thigh_r", [LM.rightHip]: "thigh_l",
  [LM.leftKnee]: "calf_r", [LM.rightKnee]: "calf_l",
  [LM.leftAnkle]: "foot_r", [LM.rightAnkle]: "foot_l",
};

// The ends of the body a move can be about, each with the joints that lead to it.
const FEET = [LM.leftAnkle, LM.rightAnkle];
const HANDS = [LM.leftWrist, LM.rightWrist];
const LIMB_CHAINS = {
  [LM.leftWrist]: [LM.leftShoulder, LM.leftElbow, LM.leftWrist], [LM.rightWrist]: [LM.rightShoulder, LM.rightElbow, LM.rightWrist],
  [LM.leftAnkle]: [LM.leftHip, LM.leftKnee, LM.leftAnkle], [LM.rightAnkle]: [LM.rightHip, LM.rightKnee, LM.rightAnkle],
  [LM.nose]: [LM.nose],
};


const lerp = (a, b, t) => a + (b - a) * t;
const blend = (a, b, t) => a.map((value, i) => lerp(value, b[i], t));
const smooth = (t) => t * t * (3 - 2 * Math.min(1, Math.max(0, t)));
// Rests, strikes fast, holds a beat, then eases home.
const strike = (p) => (p < 0.25 ? 0 : p < 0.36 ? smooth((p - 0.25) / 0.11) : p < 0.56 ? 1 : p < 0.82 ? 1 - smooth((p - 0.56) / 0.26) : 0);
const rise = (p) => (p < 0.2 ? 0 : p < 0.4 ? smooth((p - 0.2) / 0.2) : p < 0.7 ? 1 : p < 0.9 ? 1 - smooth((p - 0.7) / 0.2) : 0);

// The player's left is on the left of the screen, which is the right arm of a rig facing them.
const facing = (side) => ({ bone: side === "left" ? "r" : "l", out: side === "left" ? -1 : 1 });

function arm(side, upper, lower, weight = 1) {
  const { bone } = facing(side);
  return [[`upperarm_${bone}`, upper, weight], [`lowerarm_${bone}`, lower, weight]];
}

function leg(side, thigh, calf, weight = 1) {
  const { bone } = facing(side);
  return [[`thigh_${bone}`, thigh, weight], [`calf_${bone}`, calf, weight]];
}

const guardUpper = (out) => [out * 0.28, -0.9, 0.35];
const guardLower = (out) => [-out * 0.38, 0.85, 0.35];
const guardArm = (side) => {
  const { out } = facing(side);
  return arm(side, guardUpper(out), guardLower(out));
};
const other = (side) => (side === "left" ? "right" : "left");

function punch(side, p) {
  const { out } = facing(side);
  const t = strike(p);
  return {
    aims: [...arm(side, blend(guardUpper(out), [out * 0.55, -0.05, 0.85], t), blend(guardLower(out), [out * 0.55, 0, 0.85], t)), ...guardArm(other(side))],
    turn: -out * 0.45 * t,
  };
}

function hook(side, p) {
  const { out } = facing(side);
  const t = strike(p);
  return {
    aims: [...arm(side, blend(guardUpper(out), [out * 0.9, -0.15, 0.4], t), blend(guardLower(out), [-out, 0.02, 0.3], t)), ...guardArm(other(side))],
    turn: -out * 0.6 * t,
  };
}

// The fist dips first, then drives straight up the centre with the elbow still bent, legs lifting it.
function uppercut(side, p) {
  const { out } = facing(side);
  const load = p < 0.25 ? smooth(p / 0.25) : 1;
  const drive = strike(p);
  const low = [blend(guardUpper(out), [out * 0.22, -0.95, 0.05], load), blend(guardLower(out), [-out * 0.1, -0.15, 1], load)];
  return {
    aims: [...arm(side, blend(low[0], [out * 0.08, -0.5, 0.86], drive), blend(low[1], [-out * 0.18, 1, 0.2], drive)), ...guardArm(other(side))],
    turn: -out * 0.4 * drive,
    y: -0.1 * load * (1 - drive),
  };
}

function guardUp(p) {
  const t = rise(p);
  return { aims: ["left", "right"].flatMap((side) => {
    const { out } = facing(side);
    return arm(side, guardUpper(out), guardLower(out), t);
  }) };
}

function reach(sides, p) {
  const t = rise(p);
  return { aims: sides.flatMap((side) => {
    const { out } = facing(side);
    return arm(side, [out * 0.28, 1, 0.05], [out * 0.1, 1, 0], t);
  }) };
}

function lift(side, p) {
  const { out } = facing(side);
  return { aims: leg(side, [out * 0.08, -0.12, 1], [0, -1, 0.05], rise(p)) };
}

function kick(side, p) {
  const { out } = facing(side);
  return { aims: leg(side, [out, -0.45, 0.1], [out, -0.5, 0.1], strike(p)) };
}

function handOut(side, p) {
  const { out } = facing(side);
  return { aims: arm(side, [out, 0, 0.1], [out, 0, 0.1], strike(p)) };
}

// A slash uses the far arm, so it crosses the body and the direction is easy to read.
const SLASHES = {
  left: { side: "right", from: [1, 0.25, 0.65], to: [-1, -0.15, 0.65] },
  right: { side: "left", from: [-1, 0.25, 0.65], to: [1, -0.15, 0.65] },
  up: { side: "right", from: [0.2, -1, 0.6], to: [0.15, 1, 0.3] },
  down: { side: "right", from: [0.15, 1, 0.3], to: [0.2, -1, 0.6] },
};

function slash(way, p) {
  const { side, from, to } = SLASHES[way];
  const wind = p < 0.25 ? smooth(p / 0.25) : p > 0.8 ? 1 - smooth((p - 0.8) / 0.2) : 1;
  const swept = p < 0.3 ? 0 : p < 0.42 ? smooth((p - 0.3) / 0.12) : 1;
  const direction = blend(from, to, swept);
  return { aims: arm(side, direction, direction, wind) };
}

function squat(p) {
  const t = rise(p);
  return {
    aims: ["left", "right"].flatMap((side) => {
      const { out } = facing(side);
      return [...leg(side, [out * 0.3, -0.35, 0.9], [out * 0.08, -1, -0.28], t), ...arm(side, [out * 0.1, -0.2, 1], [out * 0.05, 0, 1], t)];
    }),
    y: -0.26 * t,
  };
}

function jump(p) {
  const air = p < 0.3 || p > 0.7 ? 0 : Math.sin(((p - 0.3) / 0.4) * Math.PI);
  return {
    aims: ["left", "right"].flatMap((side) => {
      const { out } = facing(side);
      return [...leg(side, [out * 0.12, -0.8, 0.5], [out * 0.04, -1, -0.45], air), ...arm(side, [out * 0.7, 0.5, 0.1], [out * 0.5, 0.8, 0.1], air)];
    }),
    y: 0.38 * air,
  };
}

function lean(side, p) {
  const { out } = facing(side);
  return { aims: [["spine_02", [out * 0.55, 1, 0], rise(p)]] };
}

function burpee(p) {
  const t = rise(p);
  return {
    aims: ["left", "right"].flatMap((side) => {
      const { out } = facing(side);
      return [...leg(side, [out * 0.25, -0.2, 1], [out * 0.05, -1, -0.5], t), ...arm(side, [out * 0.15, -0.8, 0.6], [out * 0.1, -1, 0.2], t)];
    }),
    y: -0.5 * t,
  };
}

function flap(p) {
  const beat = Math.abs(Math.sin(p * Math.PI * 2));
  return { aims: ["left", "right"].flatMap((side) => {
    const { out } = facing(side);
    const direction = [out, beat * 1.1 - 0.4, 0.05];
    return arm(side, direction, direction);
  }) };
}

function stepTo(side, p) {
  return { aims: [], x: facing(side).out * 0.6 * rise(p) };
}

const both = (make) => ["left", "right"].flatMap((side) => make(side, facing(side).out));
const handsOverhead = (out, t) => arm(out < 0 ? "left" : "right", [out * 0.55, 0.85, 0.05], [out * 0.25, 1, 0], t);

function jumpingJack(p) {
  const t = rise(p);
  return { aims: both((side, out) => [...leg(side, [out * 0.42, -1, 0.05], [out * 0.32, -1, 0], t), ...handsOverhead(out, t)]), y: 0.05 * t };
}

function stepJack(p) {
  const t = rise(p);
  return { aims: [...leg("left", [-0.55, -1, 0.05], [-0.42, -1, 0], t), ...both((side, out) => handsOverhead(out, t))] };
}

function squatJump(p) {
  return p < 0.42 ? squat(0.2 + (p / 0.42) * 0.3) : jump(0.3 + ((p - 0.42) / 0.58) * 0.4);
}

function ropeSkip(p) {
  return { aims: both((side, out) => arm(side, [out * 0.25, -1, 0.1], [out * 0.7, -0.2, 0.3])), y: 0.16 * Math.abs(Math.sin(p * Math.PI * 6)) };
}

// The arms trade places over and over, like running arms or a quick "which one" with both palms.
function armPump(p) {
  const beat = Math.sin(p * Math.PI * 6);
  return { aims: both((side, out) => {
    const lead = out < 0 ? beat : -beat;
    return arm(side, [out * 0.2, -1, 0.15 + lead * 0.35], [out * 0.1, lead * 0.8, 0.8]);
  }) };
}

function buttKick(side, p) {
  const { out } = facing(side);
  return { aims: leg(side, [out * 0.05, -1, -0.08], [out * 0.02, 0.45, -1], strike(p)) };
}

function lunge(p) {
  const t = rise(p);
  return { aims: [...leg("left", [-0.1, -0.62, 0.8], [-0.03, -1, -0.05], t), ...leg("right", [0.1, -0.8, -0.55], [0.03, -0.35, -1], t)], y: -0.3 * t };
}

function sideLunge(side, p) {
  const { out } = facing(side);
  const t = rise(p);
  return { aims: [...leg(side, [out * 0.8, -0.65, 0.25], [out * 0.05, -1, -0.1], t), ...leg(other(side), [-out * 0.7, -0.75, 0], [-out * 0.7, -0.75, 0], t)], x: out * 0.3 * t, y: -0.28 * t };
}

function skater(side, p) {
  const { out } = facing(side);
  const t = rise(p);
  return {
    aims: [...leg(side, [out * 0.12, -0.8, 0.45], [out * 0.04, -1, -0.2], t), ...leg(other(side), [out * 0.35, -0.75, -0.55], [out * 0.25, -0.55, -0.8], t),
      ...arm(side, [-out * 0.4, -0.7, 0.5], [-out * 0.3, -0.2, 0.9], t), ...arm(other(side), [-out * 0.5, -0.8, -0.3], [-out * 0.4, -0.8, -0.2], t)],
    x: out * 0.55 * t,
  };
}

function toeTouch(p) {
  const t = rise(p);
  return { aims: [["spine_02", [0, 0.2, 1], t], ...both((side, out) => arm(side, [out * 0.08, -1, 0.3], [out * 0.04, -1, 0.1], t))], y: -0.08 * t };
}

function windmill(side, p) {
  const { out } = facing(side);
  const t = rise(p);
  return { aims: [["spine_02", [out * 0.55, 0.3, 0.8], t], ...arm(other(side), [out * 0.45, -1, 0.3], [out * 0.25, -1, 0.1], t), ...arm(side, [out * 0.3, 1, 0], [out * 0.15, 1, 0], t)], y: -0.08 * t };
}

function crossCrunch(side, p) {
  const { out } = facing(side);
  const t = rise(p);
  return { aims: [["spine_02", [out * 0.28, 1, 0.3], t], ...leg(side, [-out * 0.2, -0.1, 1], [out * 0.02, -1, 0.05], t), ...arm(other(side), [out * 0.75, -0.55, 0.5], [-out * 0.25, 0.9, 0.3], t)] };
}

function twist(side, p) {
  const { out } = facing(side);
  const t = rise(p);
  return { aims: both((armSide, armOut) => arm(armSide, [armOut * 0.35, -0.8, 0.4], [-armOut * 0.45, 0.1, 0.9])), turn: out * 0.75 * t };
}

function curl(side, p) {
  const { out } = facing(side);
  return { aims: arm(side, [out * 0.12, -1, 0.1], [out * 0.08, 1, 0.3], rise(p)) };
}

function woodChop(p) {
  const wind = p < 0.25 ? smooth(p / 0.25) : p > 0.8 ? 1 - smooth((p - 0.8) / 0.2) : 1;
  const swept = p < 0.32 ? 0 : p < 0.44 ? smooth((p - 0.32) / 0.12) : 1;
  return { aims: both((side, out) => {
    const direction = blend([-out * 0.12, 1, 0.3], [-out * 0.12, -0.8, 0.65], swept);
    return arm(side, direction, direction, wind);
  }), y: -0.14 * swept * wind };
}

const heldPose = (pose) => (p) => {
  const t = rise(p);
  return { aims: ["left", "right"].flatMap((side) => {
    const { upper, lower } = pose.arms[side];
    return arm(side, [upper[0], upper[1], 0.05], [lower[0], lower[1], 0.05], t);
  }) };
};

// A game read by where a limb ends up shows only that place: the pose snaps in, holds, and snaps back,
// so no swing on the way is mistaken for the move. Each is sampled where its move peaks.
const snapped = (p) => (p > 0.12 && p < 0.88 ? 1 : 0);
const still = (make, peak) => (p) => {
  const t = snapped(p);
  const pose = make(peak);
  return { ...pose, aims: pose.aims.map(([bone, direction, weight]) => [bone, direction, weight * t]), y: (pose.y ?? 0) * t, x: (pose.x ?? 0) * t };
};
const diagonal = (side) => () => {
  const { out } = facing(side);
  return { aims: arm(side, [out * 0.75, 0.7, 0.05], [out * 0.75, 0.7, 0]) };
};
const STILL_POSES = {
  still_reach_up_left: still(diagonal("left"), 0),
  still_reach_up_right: still(diagonal("right"), 0),
  still_hands_up: still((p) => reach(["left", "right"], p), 0.55),
  still_hand_left: still((p) => handOut("left", p), 0.45),
  still_hand_right: still((p) => handOut("right", p), 0.45),
  still_guard: still((p) => guardUp(p), 0.55),
  still_kick_left: still((p) => kick("left", p), 0.45),
  still_kick_right: still((p) => kick("right", p), 0.45),
  still_squat_down: still(squat, 0.55),
};

export const MOVE_POSES = {
  ...STILL_POSES,
  step_left: (p) => stepTo("left", p),
  step_right: (p) => stepTo("right", p),
  jump,
  squat_down: squat,
  squat_up: squat,
  high_knee: (p) => lift("left", p),
  lift_left: (p) => lift("left", p),
  lift_right: (p) => lift("right", p),
  lean_left: (p) => lean("left", p),
  lean_right: (p) => lean("right", p),
  punch_left: (p) => punch("left", p),
  punch_right: (p) => punch("right", p),
  hook_left: (p) => hook("left", p),
  hook_right: (p) => hook("right", p),
  uppercut_left: (p) => uppercut("left", p),
  uppercut_right: (p) => uppercut("right", p),
  guard: guardUp,
  reach_up_left: (p) => reach(["left"], p),
  reach_up_right: (p) => reach(["right"], p),
  hands_up: (p) => reach(["left", "right"], p),
  slash_left: (p) => slash("left", p),
  slash_right: (p) => slash("right", p),
  slash_up: (p) => slash("up", p),
  slash_down: (p) => slash("down", p),
  swing_left: (p) => slash("left", p),
  swing_right: (p) => slash("right", p),
  hand_left: (p) => handOut("left", p),
  hand_right: (p) => handOut("right", p),
  kick_left: (p) => kick("left", p),
  kick_right: (p) => kick("right", p),
  jumping_jack: jumpingJack,
  step_jack: stepJack,
  squat_jump: squatJump,
  bounce: ropeSkip,
  arm_pump: armPump,
  butt_kick_left: (p) => buttKick("left", p),
  butt_kick_right: (p) => buttKick("right", p),
  lunge,
  side_lunge_left: (p) => sideLunge("left", p),
  side_lunge_right: (p) => sideLunge("right", p),
  skater_left: (p) => skater("left", p),
  skater_right: (p) => skater("right", p),
  toe_touch: toeTouch,
  windmill_left: (p) => windmill("left", p),
  windmill_right: (p) => windmill("right", p),
  cross_crunch_left: (p) => crossCrunch("left", p),
  cross_crunch_right: (p) => crossCrunch("right", p),
  twist_left: (p) => twist("left", p),
  twist_right: (p) => twist("right", p),
  curl_left: (p) => curl("left", p),
  curl_right: (p) => curl("right", p),
  wood_chop: woodChop,
  flap,
  burpee,
  ...Object.fromEntries(POSES.map((pose) => [`pose_${pose.id}`, heldPose(pose)])),
};

// Clips that say a move better than a pose can.
const MOVE_CLIPS = { run_step: "Jog_Fwd_Loop" };

// Call after the character's own update, so the pose lands on top of whatever clip is playing.
export function applyPose(character, pose, { flip = false } = {}) {
  for (const [name, direction, weight] of pose.aims) {
    const bone = character.bones.get(flip ? swapSide(name) : name);
    if (!bone || weight <= 0) continue;
    AIM.set(direction[0], direction[1], flip ? -direction[2] : direction[2]);
    aimBone(bone, AIM, weight);
  }
}

// Seen from behind the rig's left is on the screen's left, where a mirror rig has its right.
const swapSide = (name) => name.replace(/_([lr])$/, (_, side) => (side === "l" ? "_r" : "_l"));

const ARM_SEGMENTS = {
  left: [[LM.leftShoulder, LM.leftElbow, "upperarm"], [LM.leftElbow, LM.leftWrist, "lowerarm"]],
  right: [[LM.rightShoulder, LM.rightElbow, "upperarm"], [LM.rightElbow, LM.rightWrist, "lowerarm"]],
};
const WORLD_TORSO_M = 0.5;

// Puts the player's real arms on the rig. A mirror rig faces them; flip is for a hero seen from behind.
export function mirrorArms(character, points, { flip = false, weight = 0.75, torso = 0.25 } = {}) {
  for (const side of ["left", "right"]) {
    for (const [from, to, part] of ARM_SEGMENTS[side]) {
      const start = points[from];
      const end = points[to];
      if (Math.min(start.v, end.v) < 0.5) continue;
      const depth = start.w === undefined ? (start.z - end.z) / torso : (start.w - end.w) / WORLD_TORSO_M;
      const name = `${part}_${facing(side).bone}`;
      const bone = character.bones.get(flip ? swapSide(name) : name);
      if (!bone) continue;
      AIM.set((end.x - start.x) / torso, (start.y - end.y) / torso, flip ? -depth : depth);
      if (AIM.lengthSq() > 1e-6) aimBone(bone, AIM, weight);
    }
  }
}

export async function createCoach(host, look, { accent = "#e9ff3a" } = {}) {
  const canvas = document.createElement("canvas");
  const lines = document.createElement("canvas");
  host.append(canvas, lines);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  scene.add(new THREE.HemisphereLight("#ffffff", "#54618a", 1.9));
  const sun = new THREE.DirectionalLight("#fff3df", 2.6);
  sun.position.set(2.5, 6, 5);
  sun.castShadow = true;
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const character = await createCharacter(look);
  scene.add(character.root);

  let last = performance.now();
  let elapsed = 0;
  let raf = 0;
  let gesture = null;
  let started = 0;
  let body = null;
  let clip = "Idle_Loop";
  let lit = [];
  let trails = new Map();
  let loopAt = 0;
  let unit = 1;
  character.play(clip);

  // Joints in metres, y down, with x and y on the same scale as the tracker's.
  function readJoints() {
    const points = [];
    character.root.updateMatrixWorld(true);
    for (const [index, name] of Object.entries(JOINT_BONES)) {
      const bone = character.bones.get(name);
      if (!bone) continue;
      bone.getWorldPosition(JOINT);
      points[index] = { x: JOINT.x, y: -JOINT.y, z: JOINT.z };
    }
    return points;
  }

  // The limbs that really travel in a move. A guard arm is posed too, but it holds still. When the whole
  // body is carried, in a step or a jump, the legs are doing it whatever the arms do.
  function movingEnds(id) {
    const make = MOVE_POSES[id];
    if (!make) return MOVE_CLIPS[id] ? FEET : [];
    const root = character.root;
    root.position.set(0, 0, 0);
    root.rotation.y = 0;
    const seen = new Map();
    let carried = 0;
    let turned = 0;
    for (let step = 0; step < TRAVEL_SAMPLES; step += 1) {
      const pose = make(step / TRAVEL_SAMPLES);
      carried = Math.max(carried, Math.abs(pose.x ?? 0), Math.abs(pose.y ?? 0));
      turned = Math.max(turned, Math.abs(pose.turn ?? 0));
      character.update(0);
      root.updateMatrixWorld(true);
      applyPose(character, pose);
      const points = readJoints();
      for (const end of Object.keys(LIMB_CHAINS)) (seen.get(end) ?? seen.set(end, []).get(end)).push(points[end]);
    }
    const spread = (values) => Math.max(...values) - Math.min(...values);
    const travel = [...seen].map(([end, path]) => [Number(end), Math.hypot(...["x", "y", "z"].map((axis) => spread(path.map((point) => point[axis]))))]);
    const most = Math.max(...travel.map(([, metres]) => metres));
    const moving = most < STILL_M ? [] : travel.filter(([, metres]) => metres >= most * MOVING_SHARE).map(([end]) => end);
    if (!moving.length && turned >= TURNED) return HANDS; // a twist turns the whole chest, and the hands show it
    return carried >= CARRIED_M ? [...new Set([...moving, ...FEET])] : moving;
  }

  const onScreen = (point, width, height) => {
    JOINT.set(point.x, -point.y, point.z).project(camera);
    return [((JOINT.x + 1) / 2) * width, ((1 - JOINT.y) / 2) * height];
  };

  function strokeChain(ctx, points, chain, width, height) {
    ctx.beginPath();
    chain.forEach((index, i) => {
      const [x, y] = onScreen(points[index], width, height);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // The player's own skeleton is drawn the same way, so what they see here is what they are matching.
  function drawLines(points) {
    const ratio = Math.min(devicePixelRatio, 2);
    const width = Math.round(host.clientWidth * ratio);
    const height = Math.round(host.clientHeight * ratio);
    if (lines.width !== width || lines.height !== height) Object.assign(lines, { width, height });
    const ctx = lines.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const stroke = Math.max(3, height * 0.01);

    ctx.strokeStyle = DEMO;
    ctx.lineWidth = stroke;
    for (const pair of SKELETON) strokeChain(ctx, points, pair, width, height);
    const [headX, headY] = onScreen(points[LM.nose], width, height);
    ctx.beginPath();
    ctx.arc(headX, headY, stroke * 2.2, 0, Math.PI * 2);
    ctx.stroke();

    // The limb doing the move, and the path its hand or foot takes.
    for (const end of gesture?.startsWith("still_") ? [] : lit) {
      const trail = trails.get(end) ?? [];
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = stroke * 0.7;
      for (let i = 1; i < trail.length; i += 1) {
        ctx.globalAlpha = (i / trail.length) * 0.9;
        strokeChain(ctx, [trail[i - 1], trail[i]], [0, 1], width, height);
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = stroke * 1.7;
      strokeChain(ctx, points, LIMB_CHAINS[end], width, height);
      const [x, y] = onScreen(points[end], width, height);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, stroke * 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = host;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // A narrow panel backs the camera off, so a raised arm never leaves the frame.
    const distance = Math.max(4.9, 4.2 / camera.aspect);
    camera.position.set(0, 1.25, distance);
    camera.lookAt(0, 1.14, 0);
    camera.updateProjectionMatrix();
  }

  function frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;
    character.update(dt);
    const root = character.root;
    root.position.set(0, 0, 0);
    root.rotation.y = 0;
    if (body) mirrorArms(character, body.points, { torso: body.torso });
    else if (gesture && MOVE_POSES[gesture]) {
      const pose = MOVE_POSES[gesture](((elapsed - started) % LOOP_S) / LOOP_S);
      root.position.set(pose.x ?? 0, pose.y ?? 0, 0);
      root.rotation.y = pose.turn ?? 0;
      root.updateMatrixWorld(true);
      applyPose(character, pose);
    }
    const points = readJoints();
    if (Math.floor((elapsed - started) / LOOP_S) !== loopAt) {
      loopAt = Math.floor((elapsed - started) / LOOP_S);
      trails = new Map();
    }
    for (const end of lit) {
      const trail = trails.get(end) ?? [];
      trail.push({ ...points[end] });
      if (trail.length > TRAIL_POINTS) trail.shift();
      trails.set(end, trail);
    }
    latest = points;
    renderer.render(scene, camera);
    drawLines(points);
    raf = requestAnimationFrame(frame);
  }

  // Measured standing, before any move, and every ghost is sized from it.
  character.update(0.016);
  const standing = readJoints();
  const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const standingShoulders = middle(standing[LM.leftShoulder], standing[LM.rightShoulder]);
  const standingHips = middle(standing[LM.leftHip], standing[LM.rightHip]);
  unit = Math.hypot(standingShoulders.x - standingHips.x, standingShoulders.y - standingHips.y);
  let latest = standing;

  resize();
  frame();

  return {
    resize,
    // The demonstration as a skeleton in torso lengths from the standing shoulders, for drawing over
    // the player's own picture. lit names the joints doing the move.
    ghost() {
      const points = [];
      latest.forEach((point, index) => {
        points[index] = { x: (point.x - standingShoulders.x) / unit, y: (point.y - standingShoulders.y) / unit };
      });
      return { points, lit: lit.flatMap((end) => LIMB_CHAINS[end]) };
    },
    // Restarts the loop, so pressing a key always plays the move from the top.
    show(next) {
      gesture = next;
      body = null;
      started = elapsed;
      trails = new Map();
      loopAt = 0;
      lit = movingEnds(next);
      const wanted = MOVE_CLIPS[next] ?? "Idle_Loop";
      if (wanted !== clip) character.play(wanted);
      clip = wanted;
    },
    // Live arms take over from the demonstration while a body is passed in.
    follow(points, torso) {
      body = points ? { points, torso } : null;
      if (points) lit = [];
    },
    dispose() {
      cancelAnimationFrame(raf);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      lines.remove();
    },
  };
}
