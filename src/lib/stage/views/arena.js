// Games on one fixed patch of ground.
import * as THREE from "three";
import { POSES } from "../../motion/poses.js";
import { aimBone } from "../character.js";
import { MOVE_POSES, applyPose } from "../coach.js";
import boutRules from "../../templates/bout.js";
import { damp, gloves, holdOnBone } from "./shared.js";

const flat = (width, depth, material, y = 0.03) => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
};

function ringPlatform(world) {
  const { accent, platform } = world.data;
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 7), world.material(platform[0]));
  floor.position.y = -0.25;
  floor.receiveShadow = true;
  group.add(floor);
  for (const [x, z] of [[-3.3, -3.3], [3.3, -3.3], [-3.3, 3.3], [3.3, 3.3]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.7, 12), world.material(accent));
    post.position.set(x, 0.85, z);
    group.add(post);
  }
  for (const height of [0.65, 1.05, 1.45]) {
    for (const [x, z, turn] of [[0, -3.3, 0], [-3.3, 0, Math.PI / 2], [3.3, 0, Math.PI / 2]]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 6.6, 8), world.material("#f5f7fb"));
      rope.rotation.set(0, turn, Math.PI / 2);
      rope.position.set(x, height, z);
      group.add(rope);
    }
  }
  return world.dress(group);
}

// A low round stage for games with one character on show.
function podium(world) {
  const [top, side] = world.data.platform;
  const group = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.4, 40), world.material(side));
  stem.position.y = -0.2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.05, 8, 60), world.material(world.data.accent, { emissive: world.data.accent, emissiveIntensity: 0.6 }));
  rim.rotation.x = Math.PI / 2;
  const cap = new THREE.Mesh(new THREE.CircleGeometry(2.25, 40), world.material(top));
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = 0.002;
  cap.receiveShadow = true;
  group.add(stem, rim, cap);
  return world.dress(group);
}

function racket(world) {
  const group = new THREE.Group();
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.016, 8, 26), world.material("#f5f7fb"));
  head.scale.y = 1.25;
  head.position.y = 0.42;
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  strings.scale.y = 1.25;
  strings.position.y = 0.42;
  strings.userData.keepMaterial = true;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.3, 8), world.material("#20232b"));
  grip.position.y = 0.13;
  group.add(head, strings, grip);
  return world.dress(group);
}

const COURT_LENGTH = 15;
const SIDE_X = { left: -2.3, right: 2.3 };

export const rally = {
  usesRival: true,
  async build({ scene, camera, world, hero, rival, fx, focusShadow, accent }) {
    const surface = world.material(world.data.path);
    const line = new THREE.MeshBasicMaterial({ color: world.data.line });
    line.userData = {};
    const court = new THREE.Group();
    court.add(flat(8.6, COURT_LENGTH + 1.4, surface));
    for (const [w, d, x, z] of [[8.2, 0.07, 0, COURT_LENGTH / 2], [8.2, 0.07, 0, -COURT_LENGTH / 2], [0.07, COURT_LENGTH, 4.1, 0], [0.07, COURT_LENGTH, -4.1, 0], [8.2, 0.07, 0, 3.6], [8.2, 0.07, 0, -3.6], [0.07, 7.2, 0, 0]]) {
      const stripe = flat(w, d, line, 0.04);
      stripe.position.x = x;
      stripe.position.z = z;
      stripe.userData.keepMaterial = true;
      court.add(stripe);
    }
    const net = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.9, 0.04), world.material("#f5f7fb", { transparent: true, opacity: 0.55 }));
    net.position.y = 0.45;
    court.add(net);
    world.dress(court);
    scene.add(court, world.ring({ inner: 13 }));

    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 12), world.material("#e9ff3a", { emissive: "#e9ff3a", emissiveIntensity: 0.55 }));
    ball.castShadow = true;
    world.dress(ball);
    scene.add(ball);
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.5, 32), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9 }));
    marker.rotation.x = -Math.PI / 2;
    marker.userData.keepMaterial = true;
    scene.add(marker);

    holdOnBone(hero.bones.get("hand_r"), racket(world));
    holdOnBone(rival.bones.get("hand_r"), racket(world));
    hero.root.rotation.y = Math.PI;
    hero.root.position.z = 6.6;
    rival.root.position.z = -6.6;
    hero.play("Sword_Idle");
    rival.play("Sword_Idle");
    let heroX = 0;
    let rivalX = 0;
    let swungFrom = null;

    return {
      update(state, dt) {
        const targetX = state.ball ? SIDE_X[state.ball.side] * 0.8 : 0;
        heroX = damp(heroX, targetX, 5, dt);
        hero.root.position.x = heroX;
        rival.root.position.x = rivalX = damp(rivalX, Math.sin(state.t / 900) * 1.6, 3, dt);

        const start = new THREE.Vector3(rivalX, 1.3, -6.2);
        const home = new THREE.Vector3(heroX + 0.3, 1.3, 6.2);
        if (state.phase === "incoming" && state.ball) {
          const p = Math.min(1.1, state.ball.ms / state.ball.flightMs);
          const landing = new THREE.Vector3(SIDE_X[state.ball.side], 1.15, 6.2);
          ball.position.lerpVectors(start, landing, p);
          ball.position.y += Math.sin(Math.min(1, p) * Math.PI) * 1.5;
          marker.visible = true;
          marker.position.set(landing.x, 0.05, landing.z);
          marker.scale.setScalar(1.8 - Math.min(1, p) * 0.8);
        } else if (state.phase === "outgoing") {
          const p = 1 - state.outgoingMs / (state.flightMs * 0.8);
          ball.position.lerpVectors(swungFrom ?? home, start, p);
          ball.position.y += Math.sin(p * Math.PI) * 1.5;
          marker.visible = false;
        } else if (state.phase === "tossed") {
          const p = 1 - state.tossMs / 900;
          ball.position.copy(home);
          ball.position.y += Math.sin(p * Math.PI) * 1.5;
          marker.visible = false;
        } else {
          ball.position.copy(home);
          marker.visible = false;
        }
        camera.position.set(heroX * 0.3, 3.3, 11);
        camera.lookAt(heroX * 0.2, 1, -2);
        focusShadow(0, 0, 0);
      },
      event(event) {
        const swing = () => hero.play(event.side === "left" ? "Sword_Regular_B" : "Sword_Regular_A", { once: true, speed: 1.7, fade: 0.06, then: "Sword_Idle" });
        if (event.type === "toss") hero.play("OverhandThrow", { once: true, speed: 1.5, fade: 0.08, then: "Sword_Idle" });
        if (["serve", "hit", "perfect", "swing"].includes(event.type)) swing();
        if (["serve", "hit", "perfect"].includes(event.type)) {
          swungFrom = ball.position.clone();
          fx.burst(ball.position, event.type === "perfect" ? accent : "#ffffff", event.type === "perfect" ? 30 : 12);
        }
        if (event.type === "incoming") rival.play("Sword_Regular_A", { once: true, speed: 1.7, then: "Sword_Idle" });
        if (event.type === "point") {
          if (event.who === "you") {
            fx.flash(accent, 0.18);
            rival.play("Hit_Chest", { once: true, then: "Sword_Idle" });
          } else {
            fx.shake(0.25);
            hero.play("Idle_No_Loop", { once: true, then: "Sword_Idle" });
          }
        }
      },
    };
  },
};

const PUNCH_CLIPS = { jab: "Punch_Jab", cross: "Punch_Cross", hook: "Melee_Hook", uppercut: "Idle_Loop" };
const UPPERCUT_MS = 520;
const PUNCH_COLOURS = { jab: "#35d0ff", cross: "#ff5c8a", hook: "#ffd23f", uppercut: "#7dff8a" };

// Forearms up in front of the chin, the stance between punches. Runs after the clip has posed the rig.
function fightingStance(character, facing, weight) {
  const forward = new THREE.Vector3(0, 0, facing);
  for (const side of ["l", "r"]) {
    const out = (side === "l" ? 1 : -1) * facing;
    aimBone(character.bones.get(`upperarm_${side}`), new THREE.Vector3(out * 0.5, -0.8, facing * 0.35), weight);
    aimBone(character.bones.get(`lowerarm_${side}`), new THREE.Vector3(-out * 0.32, 0.8, facing * 0.55).add(forward.clone().multiplyScalar(0.2)), weight);
  }
}

// The trainer holds each pad out at arm's length, on the side the punch goes to, so it sits in the open
// beside the player rather than behind their own head. The player's left is the trainer's right. A jab or
// a cross goes at the screen, so its pad is held right in front of the player instead.
const TRAINER_X = 0.2;
const PLAYER_X = -0.3; // where the hero stands
const PAD_Z = -1.05;
const PAD_OUT = 0.42;
const IN_FRONT = new Set(["jab", "cross"]);
const padSpot = (pad) => new THREE.Vector3((IN_FRONT.has(pad.punch) ? PLAYER_X : TRAINER_X) + pad.side * PAD_OUT, pad.height, PAD_Z);
const shoulderTo = new THREE.Vector3();

function holdPad(trainer, pad) {
  const side = padSpot(pad).x < TRAINER_X ? "r" : "l";
  const upper = trainer.bones.get(`upperarm_${side}`);
  if (!upper) return;
  const reach = padSpot(pad).sub(upper.getWorldPosition(shoulderTo));
  aimBone(upper, reach, 0.9);
  aimBone(trainer.bones.get(`lowerarm_${side}`), reach.clone().add(new THREE.Vector3(0, 0.15, 0)), 0.9);
}

export const pads = {
  usesRival: true,
  mirrorsArms: true,
  async build({ scene, camera, world, hero, rival, fx, focusShadow }) {
    scene.add(ringPlatform(world), world.ring({ inner: 10 }));
    gloves(hero, "#ff3b4e", world);
    gloves(rival, "#f1ece0", world);
    hero.root.rotation.y = Math.PI;
    hero.root.position.set(PLAYER_X, 0, 1);
    rival.root.position.set(TRAINER_X, 0, -1.5);
    hero.play("Idle_Loop");
    rival.play("Idle_Loop");

    const group = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.09, 30), world.material("#ffffff"));
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = true;
    const timer = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 40), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
    timer.userData.keepMaterial = true;
    group.add(disc, timer);
    // The pad says where and when, by its colour and its ring. The guide by the player says which punch.
    world.dress(group);
    scene.add(group);
    let swingMs = 0;
    let uppercutMs = 0;
    let shownId = null;

    return {
      update(state, dt) {
        swingMs = Math.max(0, swingMs - dt * 1000);
        group.visible = Boolean(state.pad);
        if (state.pad) {
          const { pad } = state;
          group.position.copy(padSpot(pad));
          timer.scale.setScalar(1.7 - (pad.ms / pad.lifeMs) * 0.7 + 0.0001);
          timer.material.opacity = 0.9;
          if (shownId !== pad.id) {
            shownId = pad.id;
            disc.material = disc.material.clone();
            disc.material.color.set(PUNCH_COLOURS[pad.punch]);
            timer.material.color.set(PUNCH_COLOURS[pad.punch]);
          }
        }
        if (swingMs <= 0) fightingStance(hero, -1, 0.85);
        fightingStance(rival, 1, 0.6);
        if (state.pad) holdPad(rival, state.pad);
        // The library has no uppercut, so it is posed over the idle clip.
        uppercutMs = Math.max(0, uppercutMs - dt * 1000);
        if (uppercutMs > 0) applyPose(hero, MOVE_POSES.uppercut_right(0.12 + 0.7 * (1 - uppercutMs / UPPERCUT_MS)), { flip: true });
        camera.position.set(1.5, 2, 4);
        camera.lookAt(-0.15, 1.2, -0.7);
        focusShadow(0, 0, 0);
      },
      event(event) {
        if (["hit", "wrong", "swing"].includes(event.type)) {
          swingMs = 480;
          if (event.punch === "uppercut") uppercutMs = UPPERCUT_MS;
          hero.play(PUNCH_CLIPS[event.punch], { once: true, speed: 1.9, fade: 0.05, then: "Idle_Loop" });
        }
        if (event.type === "hit") {
          fx.burst(group.position, PUNCH_COLOURS[event.punch], 22);
          fx.shake(0.1);
        }
        if (event.type === "wrong") fx.flash("#ff3b4e", 0.14);
      },
    };
  },
};

// Counter Bout. The rival's shots are posed by hand, not played from clips, so each one comes from the
// hand on its side and lands exactly when the game says it does. A shot at the player's left comes from
// the rival's right hand, which is on the left of the screen, and is dodged by stepping right.
const HERO_X = -0.3;
const RIVAL_Z = -0.75;
const STEP_X = 0.75;
const CHAMBER = 0.72; // the share of the warning spent winding up; the rest is the swing
const SAFE = { left: 1, right: -1 };
const HAND = { left: "r", right: "l" };
const OPEN_GOLD = "#ffae00";
const DANGER_RED = "#ff2a3d";
const ease = (value) => value * value * (3 - 2 * value);

// A sign with an arrow, for the way to dodge, or words, for the call to hit back. Drawn once, outlined
// so it reads over any world.
function signCard(text, colour, arrow = null, size = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const pen = canvas.getContext("2d");
  pen.translate(256, 0);
  pen.fillStyle = colour;
  pen.strokeStyle = "rgba(0, 0, 0, 0.8)";
  pen.lineWidth = 12;
  pen.lineJoin = "round";
  if (arrow) {
    pen.save();
    pen.translate(0, text ? 84 : 128);
    pen.rotate({ left: Math.PI, right: 0, down: Math.PI / 2, up: -Math.PI / 2 }[arrow]);
    pen.beginPath();
    for (const [x, y] of [[-74, -24], [8, -24], [8, -62], [82, 0], [8, 62], [8, 24], [-74, 24]]) pen.lineTo(x, y);
    pen.closePath();
    pen.stroke();
    pen.fill();
    pen.restore();
  }
  if (!text) return spriteOf(canvas, size);
  // Long words shrink to fit the card rather than run off its edges.
  pen.font = "900 66px system-ui, sans-serif";
  const fits = Math.min(66, Math.floor((66 * 470) / pen.measureText(text).width));
  pen.font = `900 ${fits}px system-ui, sans-serif`;
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  const y = arrow ? 206 : 128;
  pen.strokeText(text, 0, y);
  pen.fillText(text, 0, y);
  return spriteOf(canvas, size);
}

function spriteOf(canvas, size) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, fog: false }));
  sprite.userData.keepMaterial = true;
  sprite.renderOrder = 10;
  sprite.scale.set(size, size / 2, 1);
  sprite.visible = false;
  return sprite;
}

const overlay = (geometry, colour) => {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
  mesh.userData.keepMaterial = true;
  mesh.renderOrder = 6;
  return mesh;
};

// The rival's arm posed from its shoulder: o is the side the arm is on, +1 to the right of the screen.
function poseArm(character, side, upper, lower, weight) {
  if (weight <= 0.001) return;
  aimBone(character.bones.get(`upperarm_${side}`), upper, weight);
  aimBone(character.bones.get(`lowerarm_${side}`), lower, weight);
}

// One shot, from its wind-up to its swing. wind and swing each run from 0 to 1.
function poseShot(rival, side, wind, swing, weight) {
  if (side === "high") {
    // Both fists go up over the head and hammer down at the player's: the one shot to duck.
    for (const [hand, o] of [["r", -1], ["l", 1]]) {
      poseArm(rival, hand, new THREE.Vector3(o * 0.25, 0.95, -0.15), new THREE.Vector3(-o * 0.15, 0.9, 0.3), wind * weight);
      poseArm(rival, hand, new THREE.Vector3(o * 0.12, 0.2, 1), new THREE.Vector3(-o * 0.12, -0.2, 1), swing * weight);
    }
    return;
  }
  // A hook: the elbow swings out to the side and back, then the fist sweeps across at head height.
  const o = SAFE[side] * -1;
  poseArm(rival, HAND[side], new THREE.Vector3(o * 0.9, 0.05, -0.35), new THREE.Vector3(o * 0.15, 0.25, 0.95), wind * weight);
  poseArm(rival, HAND[side], new THREE.Vector3(-o * 0.3, 0.05, 1), new THREE.Vector3(-o * 0.85, 0.05, 0.5), swing * weight);
}

export const bout = {
  usesRival: true,
  mirrorsArms: true,
  async build({ scene, camera, world, hero, rival, fx, focusShadow, accent }) {
    scene.add(ringPlatform(world), world.ring({ inner: 10 }));
    gloves(hero, "#ff3b4e", world);
    const rivalGloves = gloves(rival, "#2f6bff", world);
    const glowOf = Object.fromEntries(Object.entries(rivalGloves).map(([hand, glove]) => [hand, { glove, emissive: glove.material.emissive?.clone(), intensity: glove.material.emissiveIntensity ?? 0 }]));
    hero.root.rotation.y = Math.PI;
    hero.root.position.set(HERO_X, 0, 1);
    rival.root.position.z = RIVAL_Z;
    hero.play("Idle_Loop");
    rival.play("Idle_Loop");

    // Where the shot lands: a red patch over the side of the head it is aimed at, deepening as the shot
    // comes in. The arrow on the other side points the way out; the guide by the player shows the move.
    const danger = overlay(new THREE.PlaneGeometry(1, 1), DANGER_RED);
    const signs = {
      slip_left: signCard("", "#ffffff", "left", 1.15),
      slip_right: signCard("", "#ffffff", "right", 1.15),
      duck: signCard("", "#ffffff", "down", 1.15),
    };
    // After a dodge the rival is off balance: a gold arrow points from the player at it, and fades as
    // the chance runs out. The gloves glow gold too.
    const openSign = signCard("", OPEN_GOLD, "up", 1.5);
    scene.add(danger, openSign, ...Object.values(signs));

    // The punch that landed and what it took, rising off the rival.
    const cards = new Map();
    const floating = [];
    const cardFor = (text, colour) => {
      const key = `${text}|${colour}`;
      if (!cards.has(key)) {
        const card = signCard(text, colour, null, 0.95);
        scene.add(card);
        cards.set(key, card);
      }
      return cards.get(key);
    };

    const head = hero.bones.get("Head");
    const headAt = new THREE.Vector3();
    let aimedAt = null;
    let x = 0;
    let rivalX = 0;
    let swingMs = 0;
    let uppercutMs = 0;
    let flinch = 0;
    let flinchSide = 0;
    let riseMs = 0;
    let stance = 1;
    let follow = { side: null, amount: 0, dodged: false };
    const thinking = { x: 0, bob: 0, turn: 0 }; // footwork while 0G plans, eased so a shot never snaps in

    return {
      update(state, dt, elapsed) {
        const ms = dt * 1000;
        swingMs = Math.max(0, swingMs - ms);
        riseMs = Math.max(0, riseMs - ms);
        flinch = damp(flinch, 0, 7, dt);
        follow.amount = damp(follow.amount, 0, follow.dodged ? 3 : 6, dt);

        // The hero steps the whole body, not a lean, the way the player does.
        const slip = state.defence === "slip_left" ? -1 : state.defence === "slip_right" ? 1 : 0;
        x = damp(x, slip * STEP_X, 14, dt);
        hero.root.position.x = HERO_X + x;
        const ducking = state.defence === "duck";
        if (swingMs <= 0 && state.status === "playing") hero.loop(ducking ? "Crouch_Idle_Loop" : "Idle_Loop", { fade: 0.08 });
        if (swingMs <= 0 && !ducking) fightingStance(hero, -1, 0.85);
        // The library has no uppercut, so it is posed over the idle clip.
        uppercutMs = Math.max(0, uppercutMs - ms);
        if (uppercutMs > 0) applyPose(hero, MOVE_POSES.uppercut_right(0.12 + 0.7 * (1 - uppercutMs / UPPERCUT_MS)), { flip: true });

        // The rival's own pose, eased in and out around a knockdown so nothing snaps.
        const down = state.downMs > 0 || riseMs > 0 || (state.status === "ended" && state.knockdowns >= 3);
        stance = damp(stance, down ? 0 : 1, 8, dt);
        const attack = state.attack;
        const open = state.openMs > 0 && !attack;
        const wind = attack ? ease(Math.min(1, attack.ms / (attack.windupMs * CHAMBER))) : 0;
        const swing = attack ? ease(Math.max(0, (attack.ms / attack.windupMs - CHAMBER) / (1 - CHAMBER))) : 0;
        if (open) {
          // Guard dropped, leaning in and swaying: the opening to punch into.
          for (const [hand, o] of [["r", -1], ["l", 1]]) poseArm(rival, hand, new THREE.Vector3(o * 0.3, -1, 0.15), new THREE.Vector3(o * 0.1, -1, 0.35), 0.85 * stance);
        } else {
          fightingStance(rival, 1, (state.guarding ? 1 : 0.85) * stance);
        }
        if (attack) poseShot(rival, attack.side, wind, swing, stance);
        else if (follow.side) poseShot(rival, follow.side, follow.amount, follow.amount, stance);

        const shotSide = attack?.side ?? (follow.amount > 0.05 ? follow.side : null);
        const twist = shotSide && shotSide !== "high" ? -SAFE[shotSide] : 0;
        const winding = attack ? wind : 0;
        const swung = attack ? swing : follow.amount;
        const think = boutRules.thinking(state);
        for (const key of ["x", "bob", "turn"]) thinking[key] = damp(thinking[key], think?.[key] ?? 0, 6, dt);
        rival.root.rotation.y = twist * (0.4 * winding - 0.75 * swung) + flinchSide * flinch * 0.35 + thinking.turn;
        rival.root.rotation.x = (shotSide === "high" ? -0.15 * winding + 0.25 * swung : 0.08 * swung) - 0.2 * flinch + (open ? 0.12 : 0);
        rival.root.rotation.z = open ? Math.sin(elapsed * 8) * 0.07 : 0;
        rivalX = damp(rivalX, x * 0.35, 3, dt);
        rival.root.position.x = rivalX + thinking.x;
        rival.root.position.y = thinking.bob * stance;
        rival.root.position.z = RIVAL_Z + 0.3 * swung - 0.18 * flinch;

        // The glove that is about to hit glows hotter as the shot comes, and both glow gold while open.
        for (const [hand, { glove, emissive, intensity }] of Object.entries(glowOf)) {
          if (!glove.material.emissive) continue;
          const lit = attack && (attack.side === "high" || HAND[attack.side] === hand);
          if (lit) {
            glove.material.emissive.set(DANGER_RED);
            glove.material.emissiveIntensity = 0.6 + 1.6 * wind * (0.75 + 0.25 * Math.sin(elapsed * 30));
          } else if (open) {
            glove.material.emissive.set(OPEN_GOLD);
            glove.material.emissiveIntensity = 0.8 + 0.4 * Math.sin(elapsed * 14);
          } else {
            glove.material.emissive.copy(emissive);
            glove.material.emissiveIntensity = intensity;
          }
        }

        for (const sign of Object.values(signs)) sign.visible = false;
        danger.material.opacity = 0;
        if (attack) {
          const progress = attack.ms / attack.windupMs;
          // Where the head was as the shot started, so stepping or ducking out of the patch reads.
          if (aimedAt !== attack) {
            aimedAt = attack;
            if (head) head.getWorldPosition(headAt);
            else headAt.set(hero.root.position.x, 1.6, 1);
            headAt.x += HERO_X - hero.root.position.x;
          }
          const high = attack.side === "high";
          const offset = high ? 0 : -SAFE[attack.side] * 0.24;
          const pulse = 0.75 + 0.25 * Math.sin(elapsed * 22);
          const baseX = headAt.x;
          danger.position.set(baseX + offset, headAt.y + (high ? 0.08 : -0.05), headAt.z);
          danger.scale.set(high ? 1.15 : 0.5, high ? 0.3 : 0.8, 1);
          danger.material.opacity = (0.18 + 0.32 * progress) * pulse;
          danger.lookAt(camera.position);

          const sign = signs[high ? "duck" : SAFE[attack.side] > 0 ? "slip_right" : "slip_left"];
          sign.visible = true;
          if (high) sign.position.set(baseX, headAt.y + 0.62, headAt.z);
          else sign.position.set(baseX + SAFE[attack.side] * (SAFE[attack.side] > 0 ? 1.35 : 0.95), headAt.y - 0.2, headAt.z);
          sign.material.opacity = Math.min(1, progress * 5);
        }

        openSign.visible = open;
        if (open) {
          const left = state.openMs / state.openMaxMs;
          const beat = 1 + Math.sin(elapsed * 14) * 0.06;
          // Between the player and the rival, pointing at it: the way to throw.
          openSign.position.set((HERO_X + rivalX) / 2, 1.35, (1 + RIVAL_Z) / 2);
          openSign.scale.set(1.5 * beat, 0.75 * beat, 1);
          openSign.material.opacity = 0.35 + 0.65 * left;
        }

        for (let index = floating.length - 1; index >= 0; index -= 1) {
          const item = floating[index];
          item.ms += ms;
          const p = item.ms / 750;
          item.card.position.set(item.x, 1.45 + p * 0.4, RIVAL_Z + 0.2);
          item.card.material.opacity = 1 - Math.max(0, p - 0.5) * 2;
          if (p >= 1) {
            item.card.visible = false;
            floating.splice(index, 1);
          }
        }

        camera.position.set(1.7 + x * 0.3, 2, 3.9);
        camera.lookAt(-0.25 + x * 0.15, 1.2, -0.6);
        focusShadow(0, 0, 0);
      },
      event(event) {
        if (event.type === "throw") {
          swingMs = 480;
          if (event.punch === "uppercut") uppercutMs = UPPERCUT_MS;
          hero.play(PUNCH_CLIPS[event.punch], { once: true, speed: 1.9, fade: 0.05, then: "Idle_Loop" });
        }
        if (event.type === "land") {
          const colour = event.counter ? OPEN_GOLD : PUNCH_COLOURS[event.punch];
          fx.burst({ x: rivalX, y: 1.5, z: RIVAL_Z + 0.3 }, colour, event.counter ? 34 : 18);
          fx.shake(event.counter ? 0.22 : 0.12);
          if (event.counter) fx.flash(OPEN_GOLD, 0.16);
          flinch = event.counter ? 1 : 0.6;
          flinchSide = event.punch === "hook" ? (Math.random() < 0.5 ? -1 : 1) : event.punch === "jab" ? 1 : -1;
          const card = cardFor(`${event.punch.toUpperCase()} -${event.damage}${event.counter ? " x2" : ""}`, colour);
          const already = floating.find((item) => item.card === card);
          if (already) already.ms = 0;
          else floating.push({ card, ms: 0, x: rivalX + 0.65 + Math.random() * 0.2 });
          card.visible = true;
        }
        if (event.type === "dodge" || event.type === "hurt") follow = { side: event.side, amount: 1, dodged: event.type === "dodge" };
        if (event.type === "dodge") fx.flash(accent, 0.12);
        if (event.type === "hurt") {
          swingMs = 420;
          fx.shake(0.4);
          fx.flash(DANGER_RED, 0.3);
          hero.play("Hit_Head", { once: true, speed: 1.4, fade: 0.05, then: "Idle_Loop" });
        }
        if (event.type === "knockdown") {
          follow = { side: null, amount: 0, dodged: false };
          for (const item of floating) item.card.visible = false;
          floating.length = 0;
          fx.burst({ x: rivalX, y: 1.3, z: RIVAL_Z }, accent, 50);
          fx.flash("#ffffff", 0.3);
          rival.play("Death01", { once: true, fade: 0.12 });
        }
        if (event.type === "rise") {
          riseMs = 1300;
          rival.play("LayToIdle", { once: true, speed: 1.3, then: "Idle_Loop" });
        }
      },
    };
  },
};

export const poses = {
  async build({ scene, camera, world, hero, fx, focusShadow, accent }) {
    scene.add(podium(world), world.ring({ inner: 9 }));
    hero.play("Idle_Loop");
    // The character faces the player like a mirror, so the arm on the left of the screen is its right.
    const limbs = [["left", "r"], ["right", "l"]];
    let shown = null;
    let blend = 0;

    return {
      update(state, dt, elapsed) {
        if (shown !== state.pose) {
          shown = state.pose;
          blend = 0;
        }
        blend = damp(blend, 1, 12, dt);
        const pose = POSES.find((item) => item.id === state.pose);
        for (const [screen, side] of limbs) {
          const { upper, lower } = pose.arms[screen];
          aimBone(hero.bones.get(`upperarm_${side}`), new THREE.Vector3(upper[0], upper[1], 0.12), blend);
          aimBone(hero.bones.get(`lowerarm_${side}`), new THREE.Vector3(lower[0], lower[1], 0.16), blend);
        }
        camera.position.set(Math.sin(elapsed * 0.2) * 0.25, 1.45, 3.5);
        camera.lookAt(0, 1.05, 0);
        focusShadow(0, 0, 0);
      },
      event(event) {
        if (event.type === "match") {
          fx.burst({ x: 0, y: 1.5, z: 0.4 }, accent, 28);
          fx.flash(accent, 0.12);
        }
      },
    };
  },
};

// The character on show while choosing a look.
export const showcase = {
  async build({ scene, camera, world, hero, focusShadow }) {
    scene.add(podium(world), world.ring({ inner: 9 }));
    hero.play("Idle_Loop");
    return {
      update(_, dt, elapsed) {
        hero.root.rotation.y = Math.sin(elapsed * 0.5) * 0.55;
        camera.position.set(0, 1.5, 4.5);
        camera.lookAt(0, 1.05, 0);
        focusShadow(0, 0, 0);
      },
    };
  },
};
