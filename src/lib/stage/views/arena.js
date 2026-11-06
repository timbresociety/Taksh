// Games on one fixed patch of ground.
import * as THREE from "three";
import { POSES } from "../../motion/poses.js";
import { aimBone } from "../character.js";
import { MOVE_POSES, applyPose } from "../coach.js";
import { damp, gloves, holdOnBone, wordCard } from "./shared.js";

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

export const pads = {
  usesRival: true,
  mirrorsArms: true,
  async build({ scene, camera, world, hero, rival, fx, focusShadow }) {
    scene.add(ringPlatform(world), world.ring({ inner: 10 }));
    gloves(hero, "#ff3b4e", world);
    hero.root.rotation.y = Math.PI;
    hero.root.position.set(-0.3, 0, 1);
    rival.root.position.set(0.2, 0, -1.5);
    hero.play("Idle_Loop");
    rival.play("Idle_FoldArms_Loop");

    const group = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.09, 30), world.material("#ffffff"));
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = true;
    const timer = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 40), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
    timer.userData.keepMaterial = true;
    group.add(disc, timer);
    const cards = Object.fromEntries(Object.entries(PUNCH_COLOURS).map(([punch, colour]) => {
      const card = wordCard(punch.toUpperCase(), colour);
      card.position.set(0, 0.62, 0);
      card.visible = false;
      group.add(card);
      return [punch, card];
    }));
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
          group.position.set(-0.2 + pad.side * 0.5, pad.height, -0.2);
          timer.scale.setScalar(1.7 - (pad.ms / pad.lifeMs) * 0.7 + 0.0001);
          timer.material.opacity = 0.9;
          if (shownId !== pad.id) {
            shownId = pad.id;
            for (const [punch, card] of Object.entries(cards)) card.visible = punch === pad.punch;
            disc.material = disc.material.clone();
            disc.material.color.set(PUNCH_COLOURS[pad.punch]);
            timer.material.color.set(PUNCH_COLOURS[pad.punch]);
          }
        }
        if (swingMs <= 0) fightingStance(hero, -1, 0.85);
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

export const bout = {
  usesRival: true,
  mirrorsArms: true,
  async build({ scene, camera, world, hero, rival, fx, focusShadow, accent }) {
    scene.add(ringPlatform(world), world.ring({ inner: 10 }));
    gloves(hero, "#ff3b4e", world);
    gloves(rival, "#2f6bff", world);
    hero.root.rotation.y = Math.PI;
    hero.root.position.z = 1;
    rival.root.position.z = -0.75;
    hero.play("Idle_Loop");
    rival.play("Idle_Loop");

    const warn = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.66, 40), new THREE.MeshBasicMaterial({ color: "#ff3b4e", transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false }));
    warn.userData.keepMaterial = true;
    warn.renderOrder = 5;
    scene.add(warn);
    let x = 0;
    let lean = 0;
    let swingMs = 0;
    let rivalBusyMs = 0;

    return {
      update(state, dt) {
        swingMs = Math.max(0, swingMs - dt * 1000);
        rivalBusyMs = Math.max(0, rivalBusyMs - dt * 1000);
        const slip = state.defence === "slip_left" ? -1 : state.defence === "slip_right" ? 1 : 0;
        x = damp(x, slip * 0.6, 16, dt);
        lean = damp(lean, slip * 0.28, 16, dt);
        hero.root.position.x = x - 0.3;
        hero.root.rotation.z = -lean;
        const ducking = state.defence === "duck";
        if (swingMs <= 0 && state.status === "playing") hero.loop(ducking ? "Crouch_Idle_Loop" : "Idle_Loop", { fade: 0.08 });
        if (swingMs <= 0 && !ducking) fightingStance(hero, -1, 0.85);
        if (rivalBusyMs <= 0 && state.downMs <= 0 && !state.attack) fightingStance(rival, 1, 0.85);

        const attack = state.attack;
        warn.material.opacity = attack ? 0.9 : 0;
        if (attack) {
          const progress = attack.ms / attack.windupMs;
          const spot = { left: [-0.6, 1.45], right: [0.6, 1.45], high: [0, 1.85] }[attack.side];
          warn.position.set(spot[0] - 0.1, spot[1], 0);
          warn.scale.setScalar(2.1 - progress * 1.4);
          warn.lookAt(camera.position);
        }
        camera.position.set(1.7 + x * 0.3, 2, 3.9);
        camera.lookAt(-0.25 + x * 0.15, 1.2, -0.6);
        focusShadow(0, 0, 0);
      },
      event(event) {
        if (event.type === "throw") {
          swingMs = 480;
          hero.play(PUNCH_CLIPS[event.punch], { once: true, speed: 1.9, fade: 0.05, then: "Idle_Loop" });
        }
        if (event.type === "land") {
          fx.burst({ x: 0, y: 1.5, z: -0.45 }, accent, 18);
          fx.shake(0.12);
          rivalBusyMs = 420;
          rival.play("Hit_Head", { once: true, speed: 1.5, fade: 0.05, then: "Idle_Loop" });
        }
        if (event.type === "windup") {
          rivalBusyMs = 1000;
          rival.play(event.side === "high" ? "Punch_Cross" : "Melee_Hook", { once: true, speed: 0.95, then: "Idle_Loop" });
        }
        if (event.type === "dodge") fx.flash(accent, 0.1);
        if (event.type === "hurt") {
          swingMs = 420;
          fx.shake(0.45);
          fx.flash("#ff3b4e", 0.32);
          hero.play("Hit_Head", { once: true, speed: 1.4, fade: 0.05, then: "Idle_Loop" });
        }
        if (event.type === "knockdown") {
          rivalBusyMs = 2600;
          fx.burst({ x: 0, y: 1.3, z: -0.75 }, accent, 50);
          fx.flash("#ffffff", 0.3);
          rival.play("Death01", { once: true, fade: 0.08 });
        }
        if (event.type === "rise") rival.play("LayToIdle", { once: true, speed: 1.3, then: "Idle_Loop" });
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
