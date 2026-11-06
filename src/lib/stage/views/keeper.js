// Last Line: the goal seen from behind the keeper, cut into nine zones that each show the move saving
// them. The zone a shot is going to lights up while the striker lines it up.
import * as THREE from "three";
import { ZONES } from "../../templates/keeper.js";
import { createCharacter } from "../character.js";
import { MOVE_POSES, applyPose } from "../coach.js";
import { damp, gloves } from "./shared.js";

const GOAL = { half: 3.7, height: 3.3, z: 1.7, depth: 1.7 };
const CELL = { width: (GOAL.half * 2) / 3, height: GOAL.height / 3 };
// Colour is the limb, so a hand reads the same colour whether it goes up or out, and the icon is the move.
const COLOURS = { tl: "#17b6a7", ml: "#17b6a7", tr: "#e8407f", mr: "#e8407f", bl: "#ff7a1a", br: "#8a5cff", tc: "#eea200", mc: "#2f80ff", bc: "#3cb043" };
const LAYOUT = Object.fromEntries(ZONES.map((zone, index) => {
  const row = Math.floor(index / 3);
  const col = index % 3;
  return [zone.id, { row, col, side: col - 1, x: (col - 1) * CELL.width, y: GOAL.height - (row + 0.5) * CELL.height }];
}));
// Where the ball meets the keeper. The middle column aims at the body: above the head, the chest, the shins.
const TARGET = {
  tl: [-2.1, 2.55], tc: [0, 2.6], tr: [2.1, 2.55],
  ml: [-2.2, 1.45], mc: [0, 1.32], mr: [2.2, 1.45],
  bl: [-1.9, 0.45], bc: [0, 0.42], br: [1.9, 0.45],
};
// Nobody stands straight behind the keeper, where a ball at their feet would sit on the hero's head.
const STRIKER_SPOTS = [[-6.2, -15], [-2.6, -18], [5.8, -15.5]];
const STRIKERS = STRIKER_SPOTS.length;
const SHOT_FROM_Y = 0.25;
const MEET_Z = 0.85;
const SAVE_S = 0.75;
const KICK_S = 0.5;
// A save is made when it is called, so the ball rushes to the glove to meet it, quicker from close in.
const RUSH = { minS: 0.14, maxS: 0.36, metresPerS: 34 };
// What meets the ball in each zone: a hand, both hands together, or a foot.
const HIT_BONES = {
  tl: ["hand_l"], ml: ["hand_l"], tr: ["hand_r"], mr: ["hand_r"],
  tc: ["hand_l", "hand_r"], mc: ["hand_l", "hand_r"], bc: ["hand_l", "hand_r"],
  bl: ["foot_l"], br: ["foot_r"],
};
const AWAY_S = 0.55;
const BALLS = 3;
// A ball at real size is a dot from the far end of the pitch, so it is drawn bigger the further it is
// from the camera, keeping about the size it has at the goal line, and never more than this many times.
const BALL_SEEN_AT_M = 7.5;
const BALL_MAX_SCALE = 2.8;
const PITCH = { width: 11, length: 34 };
const EYE = new THREE.Vector3(0, 2.3, 7.8);
const LOOK = new THREE.Vector3(0, 1.95, -6);
const LEAN = 1; // the hero faces the strikers, so this sign tips the head toward the side it names

function pitchTexture(data) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 1024;
  const pen = canvas.getContext("2d");
  pen.fillStyle = data.path;
  pen.fillRect(0, 0, 512, 1024);
  for (let band = 0; band < 8; band += 1) {
    pen.fillStyle = band % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
    pen.fillRect(0, band * 128, 512, 128);
  }
  pen.strokeStyle = data.line;
  pen.lineWidth = 7;
  pen.strokeRect(8, 8, 496, 1008);
  pen.strokeRect(70, 716, 372, 300);
  pen.strokeRect(160, 900, 192, 116);
  pen.beginPath();
  pen.arc(256, 716, 92, Math.PI, 0);
  pen.stroke();
  pen.fillStyle = data.line;
  pen.beginPath();
  pen.arc(256, 800, 8, 0, Math.PI * 2);
  pen.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function goalFrame(world) {
  const group = new THREE.Group();
  const white = world.material("#f4f4ef", { roughness: 0.4 });
  const { half, height, z } = GOAL;
  const bar = (length, x, y, turn) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, length, 12), white);
    mesh.position.set(x, y, z);
    mesh.rotation.z = turn;
    group.add(mesh);
  };
  bar(height, -half, height / 2, 0);
  bar(height, half, height / 2, 0);
  bar(half * 2 + 0.16, 0, height, Math.PI / 2);
  world.dress(group);
  return group;
}

function ballTexture(base, mark) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const pen = canvas.getContext("2d");
  pen.fillStyle = base;
  pen.fillRect(0, 0, 256, 128);
  pen.fillStyle = mark;
  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i < 6; i += 1) {
      const x = i * 44 + (row % 2) * 22 + 10;
      const y = 22 + row * 42;
      pen.beginPath();
      for (let side = 0; side < 5; side += 1) pen.lineTo(x + Math.cos(side * 1.257) * 11, y + Math.sin(side * 1.257) * 11);
      pen.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeBall(world) {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 18), new THREE.MeshStandardMaterial({ map: ballTexture("#f6f4ec", "#1b1c22"), roughness: 0.5 }));
  ball.visible = false;
  return world.dress(ball);
}


function reticleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const pen = canvas.getContext("2d");
  pen.translate(128, 128);
  pen.strokeStyle = "#ffffff";
  pen.lineWidth = 14;
  pen.beginPath();
  pen.arc(0, 0, 96, 0, Math.PI * 2);
  pen.stroke();
  for (let i = 0; i < 4; i += 1) {
    pen.rotate(Math.PI / 2);
    pen.fillStyle = "#ffffff";
    pen.fillRect(-7, -124, 14, 54);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}


export const keeper = {
  usesRival: true,
  async build({ scene, camera, world, hero, rival, fx, focusShadow, spec }) {
    const side = world.strip();
    side.scroll(0);
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.width, PITCH.length), new THREE.MeshStandardMaterial({ map: pitchTexture(world.data), roughness: 0.95 }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(0, 0.02, GOAL.z + 2 - PITCH.length / 2);
    pitch.receiveShadow = true;
    scene.add(side.group, world.dress(pitch), goalFrame(world), camera);

    gloves(hero, "#f4f1e4", world);
    hero.root.rotation.y = Math.PI;
    hero.root.position.set(0, 0, 1.2);
    hero.play("Idle_Loop");

    const copies = await Promise.all(Array.from({ length: STRIKERS - 1 }, () => createCharacter(spec.skin.rival)));
    const strikers = [rival, ...copies].map((character, index) => {
      world.dress(character.root);
      const [x, z] = STRIKER_SPOTS[index];
      character.root.position.set(x, 0, z);
      character.root.rotation.y = Math.atan2(-x, 1.2 - z);
      scene.add(character.root);
      character.play("Idle_Loop");
      return { character, x, z, kick: 0 };
    });

    const reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: reticleTexture(), transparent: true, depthTest: false, fog: false, toneMapped: false }));
    reticle.userData.keepMaterial = true;
    reticle.renderOrder = 15;
    reticle.visible = false;
    scene.add(reticle);

    // Live balls by shot, and the ones already saved or scored, which finish their path on their own.
    const balls = Array.from({ length: BALLS }, () => makeBall(world));
    scene.add(...balls);
    const flying = new Map();
    const shooter = new Map();
    const parting = [];

    let saving = null;
    let turn = 0;
    let lastStriker = 0;
    const spot = new THREE.Vector3();

    const footOf = (striker, out) => out.set(striker.x * 0.96, SHOT_FROM_Y, striker.z + 0.7);
    const ballPath = (from, [tx, ty], p, out) => {
      out.set(from.x + (tx - from.x) * p, from.y + (ty - from.y) * p + Math.sin(p * Math.PI) * 1.1, from.z + (MEET_Z - from.z) * p);
      return out;
    };
    const bone = new THREE.Vector3();
    const hitPoint = (zone, out) => {
      const names = HIT_BONES[zone].filter((name) => hero.bones.get(name));
      if (!names.length) return out.set(...TARGET[zone], MEET_Z);
      out.set(0, 0, 0);
      for (const name of names) out.add(hero.bones.get(name).getWorldPosition(bone));
      return out.divideScalar(names.length);
    };
    // The ball meets whatever the move put in its way, then flies off over the bar or out wide.
    const part = (ball, zone) => {
      const [tx, ty] = TARGET[zone];
      const out = LAYOUT[zone].side || (LAYOUT[zone].row === 0 ? 0 : 0.6);
      const to = hitPoint(zone, new THREE.Vector3());
      const rushS = THREE.MathUtils.clamp(ball.position.distanceTo(to) / RUSH.metresPerS, RUSH.minS, RUSH.maxS);
      parting.push({ ball, from: ball.position.clone(), to, follow: zone, burst: COLOURS[zone], rushS, s: 0, away: new THREE.Vector3(tx * 2 + out * 3, ty + 3.2, -7) });
    };
    const strikerFor = (id) => strikers[shooter.get(id) ?? 1];

    return {
      update(state, dt, elapsed) {
        for (const striker of strikers) {
          if (striker.character !== rival) striker.character.update(dt);
          striker.kick = Math.max(0, striker.kick - dt);
          if (striker.kick > 0) applyPose(striker.character, MOVE_POSES.kick_right(0.2 + 0.5 * (1 - striker.kick / KICK_S)));
        }

        const live = new Set(state.shots.map((shot) => shot.id));
        for (const [id, ball] of flying) {
          if (live.has(id)) continue;
          if (!parting.some((item) => item.ball === ball)) ball.visible = false;
          flying.delete(id);
        }
        const shot = state.shots[0];
        if (shot) {
          let ball = flying.get(shot.id);
          if (!ball) {
            ball = balls.find((item) => !item.visible);
            if (ball) {
              ball.visible = true;
              flying.set(shot.id, ball);
            }
          }
          const striker = strikerFor(shot.id);
          const from = footOf(striker, spot);
          const [tx, ty] = TARGET[shot.zone];
          if (ball) {
            if (shot.ms < shot.kickMs) {
              // Lined up at the striker's feet, with a little bounce so the eye finds who is shooting.
              ball.position.copy(from);
              ball.position.y += Math.abs(Math.sin(elapsed * 6)) * 0.2;
            } else {
              ballPath(from, TARGET[shot.zone], (shot.ms - shot.kickMs) / (shot.lifeMs - shot.kickMs), ball.position);
              ball.rotation.x = elapsed * 9;
              ball.rotation.z = elapsed * 5;
            }
          }
          if (ball) ball.scale.setScalar(THREE.MathUtils.clamp(ball.position.distanceTo(EYE) / BALL_SEEN_AT_M, 1, BALL_MAX_SCALE));
          const p = shot.ms / shot.lifeMs;
          reticle.visible = true;
          reticle.material.color.set(COLOURS[shot.zone]);
          reticle.position.set(tx, ty, GOAL.z - 0.1);
          reticle.scale.setScalar(0.7 + (1 - p) * 0.5);
          reticle.material.opacity = 0.6 + p * 0.4;
        } else reticle.visible = false;

        for (let i = parting.length - 1; i >= 0; i -= 1) {
          const item = parting[i];
          item.s += dt;
          if (item.follow && item.s < item.rushS) hitPoint(item.follow, item.to);
          if (item.burst && item.s >= item.rushS) {
            fx.burst(item.to, item.burst, 30);
            item.burst = null;
          }
          if (item.s < item.rushS) item.ball.position.lerpVectors(item.from, item.to, item.s / item.rushS);
          else if (item.s < item.rushS + AWAY_S) item.ball.position.lerpVectors(item.to, item.away, (item.s - item.rushS) / AWAY_S);
          else {
            item.ball.visible = false;
            parting.splice(i, 1);
          }
          item.ball.rotation.x += dt * 14;
        }

        // A save throws the keeper toward the zone, and the zone's move is posed on top of whatever plays.
        const root = hero.root;
        let x = 0;
        let lift = 0;
        let roll = 0;
        let brace = 0;
        if (saving) {
          saving.s += dt;
          const p = saving.s / SAVE_S;
          if (p >= 1) saving = null;
          else {
            const amount = Math.min(1, p / 0.25) * (p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35);
            const eased = amount * amount * (3 - 2 * amount);
            const { row, side: sideX } = LAYOUT[saving.zone];
            const gesture = ZONES.find((zone) => zone.id === saving.zone).gesture;
            const pose = MOVE_POSES[gesture](0.5);
            applyPose(hero, { aims: pose.aims.map(([bone, direction, weight]) => [bone, direction, weight * eased]) }, { flip: true });
            x = sideX * [1.35, 1.0, 0.55][row] * eased;
            lift = ((row === 0 ? (sideX ? 0.3 : 0.45) : 0) + (pose.y ?? 0) * 1.4) * eased;
            // A block at the chest is hidden from behind, so the shot rocks the keeper back a little.
            if (saving.zone === "mc") brace = 0.2 * eased;
            // Into the top corners the whole body tips with the arm; a leg out tips the body the other way.
            roll = LEAN * sideX * [0.42, 0.16, -0.2][row] * eased;
          }
        }
        turn = damp(turn, x, 18, dt);
        root.position.set(turn, lift, 1.2);
        root.rotation.z = roll;
        root.rotation.x = brace;

        camera.position.copy(EYE);
        camera.lookAt(LOOK);
        camera.updateMatrixWorld();
        focusShadow(0, 0, -3);
      },
      event(event, state) {
        if (event.type === "aim") {
          lastStriker = (lastStriker + 1) % STRIKERS;
          shooter.set(event.id, lastStriker);
          if (shooter.size > 8) shooter.delete(shooter.keys().next().value);
        }
        if (event.type === "kick") strikerFor(event.id).kick = KICK_S;
        if (event.type === "reach") {
          saving = { zone: event.zone, s: 0 };
          if (event.zone === "tc") hero.play("Jump_Start", { once: true, speed: 1.8, fade: 0.08, then: "Idle_Loop" });
        }
        if (event.type === "save") {
          if (!event.kicked) strikerFor(event.id).kick = KICK_S;
          const ball = flying.get(event.id);
          if (ball) part(ball, event.zone);
        }
        if (event.type === "goal") {
          const ball = flying.get(event.id);
          if (ball) {
            const [x, y] = TARGET[event.zone];
            parting.push({ ball, from: ball.position.clone(), to: new THREE.Vector3(x * 1.1, y, GOAL.z + GOAL.depth - 0.3), rushS: 0.2, s: 0, away: new THREE.Vector3(x * 1.1, 0.25, GOAL.z + GOAL.depth - 0.4) });
            fx.burst({ x, y, z: GOAL.z + GOAL.depth - 0.2 }, "#ff5a3a", 22);
          }
        }
        if (event.type === "hurt") {
          fx.shake(0.5);
          fx.flash("#ff3b4e", 0.3);
          hero.play("Hit_Chest", { once: true, speed: 1.4, fade: 0.05, then: "Idle_Loop" });
        }
        if (event.type === "end") hero.play(state.won ? "Yes" : "Death01", { once: true });
      },
    };
  },
};
