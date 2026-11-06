// Chop Shop: a fruit stall across the street, fruit flying up off it, and a trail behind each hand.
// The game's field is the screen itself, so an item is placed from its screen position at any depth.
import * as THREE from "three";
import { aimBone } from "../character.js";
import { Pool, damp, wordCard } from "./shared.js";

const STALL_Z = -6;
const FRONT_Z = -1.2; // fruit comes forward from the stall to here at the top of its arc
const TRAIL_POINTS = 22;
const TRAIL_SECONDS = 0.3;
const TRAIL_WIDTH = 0.1;

const FLESH = { mango: "#ffb21f", coconut: "#fbf6ea", watermelon: "#f2384f", pineapple: "#ffe066" };
const RIND = { mango: "#f27d1a", coconut: "#5a3a22", watermelon: "#1f7a3a", pineapple: "#c98a2a" };

function stripes(base, line) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const pen = canvas.getContext("2d");
  pen.fillStyle = base;
  pen.fillRect(0, 0, 128, 64);
  pen.fillStyle = line;
  for (let x = 0; x < 128; x += 16) pen.fillRect(x, 0, 7, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function diamonds(base, line) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const pen = canvas.getContext("2d");
  pen.fillStyle = base;
  pen.fillRect(0, 0, 128, 128);
  pen.strokeStyle = line;
  pen.lineWidth = 5;
  for (let i = -128; i < 256; i += 32) {
    pen.beginPath();
    pen.moveTo(i, 0);
    pen.lineTo(i + 128, 128);
    pen.moveTo(i + 128, 0);
    pen.lineTo(i, 128);
    pen.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Each fruit is modelled at a radius of one, and scaled to its size in the game.
function fruitModel(kind, world) {
  const group = new THREE.Group();
  const ball = new THREE.SphereGeometry(1, 22, 16);
  if (kind === "mango") {
    const body = new THREE.Mesh(ball, world.material(RIND.mango, { roughness: 0.45 }));
    body.scale.set(0.8, 1.05, 0.8);
    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), world.material("#e8473a", { roughness: 0.45 }));
    blush.position.set(0.28, 0.42, 0.2);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), world.material("#5a3a22"));
    stalk.position.y = 1.1;
    group.add(body, blush, stalk);
  }
  if (kind === "coconut") {
    const body = new THREE.Mesh(ball, world.material(RIND.coconut, { roughness: 1 }));
    group.add(body);
    for (const [x, y] of [[-0.25, 0.86], [0.25, 0.86], [0, 0.98]]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), world.material("#23150c"));
      eye.position.set(x, y * 0.72, 0.68);
      group.add(eye);
    }
  }
  if (kind === "watermelon") group.add(new THREE.Mesh(ball, world.material("#ffffff", { map: stripes("#2f9e4a", "#14592b"), roughness: 0.5 })));
  if (kind === "pineapple") {
    const body = new THREE.Mesh(ball, world.material("#ffffff", { map: diamonds("#e0a22a", "#8a5a14"), roughness: 0.8 }));
    body.scale.set(0.82, 1, 0.82);
    group.add(body);
    const leaf = world.material("#2f8f3f");
    for (let i = 0; i < 7; i += 1) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.9, 5), leaf);
      const turn = (i / 7) * Math.PI * 2;
      blade.position.set(Math.cos(turn) * 0.16, 1.28, Math.sin(turn) * 0.16);
      blade.rotation.set(Math.sin(turn) * 0.4, 0, -Math.cos(turn) * 0.4);
      group.add(blade);
    }
  }
  if (kind === "bomb") {
    // A red string firecracker with a lit fuse, so it can't be taken for fruit.
    const paper = world.material("#d6161f", { roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.7, 16), paper);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.42, 16), world.material("#ffd21f"));
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), world.material("#2a1a10"));
    fuse.position.y = 1.15;
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: "#fff2a8", fog: false, toneMapped: false }));
    spark.position.y = 1.5;
    spark.userData.keepMaterial = true;
    group.add(body, band, fuse, spark);
    group.userData.spark = spark;
  }
  return world.dress(group);
}

function halfModel(kind, world) {
  const group = new THREE.Group();
  const rind = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), world.material(RIND[kind]));
  const flesh = new THREE.Mesh(new THREE.CircleGeometry(0.98, 22), world.material(FLESH[kind], { roughness: 0.4, side: THREE.DoubleSide }));
  flesh.rotation.x = Math.PI / 2;
  group.add(rind, flesh);
  return world.dress(group);
}

// A long wooden fruit stall with a striped awning, the width of the street.
function stall(world) {
  const group = new THREE.Group();
  const wood = world.material("#7a4a26", { roughness: 0.85 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(14, 1.1, 1.5), wood);
  counter.position.set(0, 0.55, STALL_Z);
  counter.castShadow = true;
  group.add(counter);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.14, 1.65), world.material("#ffc21f"));
  trim.position.set(0, 1.14, STALL_Z);
  group.add(trim);
  const piles = ["mango", "watermelon", "pineapple", "coconut"];
  for (let i = 0; i < 26; i += 1) {
    const fruit = fruitModel(piles[i % 4], world);
    fruit.scale.setScalar(0.2);
    fruit.position.set(-6.4 + i * 0.51, 1.32 + (i % 3) * 0.05, STALL_Z + (i % 2) * 0.3 - 0.15);
    group.add(fruit);
  }
  const awning = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.1, 2.6), world.material("#ffffff", { map: stripes("#e23a3a", "#fff1d6") }));
  awning.position.set(0, 4.6, STALL_Z - 0.4);
  awning.rotation.x = 0.16;
  group.add(awning);
  for (const x of [-7, 7]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.6, 8), wood);
    post.position.set(x, 2.3, STALL_Z);
    group.add(post);
  }
  return world.dress(group);
}

// A ribbon behind one hand, from a list of recent points. The tail thins out and fades.
function trail(colour) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(TRAIL_POINTS * 2 * 3);
  const shades = new Float32Array(TRAIL_POINTS * 2 * 4);
  const tone = new THREE.Color(colour);
  for (let i = 0; i < TRAIL_POINTS * 2; i += 1) shades.set([tone.r, tone.g, tone.b, 0], i * 4);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(shades, 4));
  const order = [];
  for (let i = 0; i < TRAIL_POINTS - 1; i += 1) order.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  geometry.setIndex(order);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.userData.keepMaterial = true;
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.115, 24), new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthTest: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  marker.renderOrder = 9;
  marker.userData.keepMaterial = true;
  return { mesh, marker, points: [] };
}

export const chop = {
  async build({ scene, camera, world, hero, fx, focusShadow, accent }) {
    const road = world.road(16);
    scene.add(road.mesh, world.ring({ inner: 13 }), stall(world));

    const items = new THREE.Group();
    scene.add(items);
    const fruit = new Pool(items, (item) => fruitModel(item.kind, world));
    const halves = Array.from({ length: 16 }, () => ({ model: null, kind: null, life: 0, v: new THREE.Vector3(), spin: new THREE.Vector3() }));
    const halfModels = new Map();
    const takeHalf = (kind) => {
      const spare = halfModels.get(kind) ?? [];
      const model = spare.pop() ?? halfModel(kind, world);
      halfModels.set(kind, spare);
      model.visible = true;
      if (!model.parent) scene.add(model);
      return model;
    };

    const hands = { left: trail("#7df3ff"), right: trail("#ffe27a") };
    const keyStroke = trail("#ffffff");
    for (const { mesh, marker } of [...Object.values(hands), keyStroke]) {
      scene.add(mesh);
      camera.add(marker);
    }
    scene.add(camera);

    const bonus = wordCard("x2", "#fff1a8");
    bonus.scale.set(1.4, 0.7, 1);
    bonus.visible = false;
    scene.add(bonus);
    let bonusLife = 0;

    hero.root.rotation.y = Math.PI;
    hero.root.position.set(0, 0, 1.9);
    hero.play("Idle_Loop");
    const planeAt = new THREE.Vector3();
    const ray = new THREE.Vector3();
    const reachTarget = { left: 0, right: 0 };
    let now = 0;

    // Where a field position lands on a plane at depth z, for the camera as it stands.
    const toWorld = (x, y, z, out) => {
      ray.set(x, y, 0.5).unproject(camera).sub(camera.position);
      return out.copy(camera.position).addScaledVector(ray, (z - camera.position.z) / ray.z);
    };

    return {
      update(state, dt, elapsed) {
        now = elapsed;
        camera.position.set(0, 2.45, 5.1);
        camera.lookAt(0, 2.05, -6);
        camera.updateMatrixWorld();

        fruit.sync(state.items, (object, item) => {
          const height = Math.min(1, (item.y + 0.3) / 0.8);
          const z = STALL_Z + (FRONT_Z - STALL_Z) * height;
          toWorld(item.x, item.y, z, object.position);
          const size = item.radius * (camera.position.z - z) * 0.5;
          object.scale.setScalar(size);
          // A firecracker stays fuse up, so the spark is what catches the eye; fruit tumbles.
          if (object.userData.spark) {
            object.rotation.set(0, item.turn, Math.sin(item.turn) * 0.4);
            object.userData.spark.scale.setScalar(1.1 + Math.sin(elapsed * 40 + item.id) * 0.5);
          } else object.rotation.set(item.turn * 0.6, item.turn, 0);
        });

        for (const half of halves) {
          if (half.life <= 0) continue;
          half.life -= dt;
          half.v.y -= 9 * dt;
          half.model.position.addScaledVector(half.v, dt);
          half.model.rotation.x += half.spin.x * dt;
          half.model.rotation.z += half.spin.z * dt;
          if (half.life <= 0) {
            half.model.visible = false;
            halfModels.get(half.kind).push(half.model);
          }
        }

        // Each hand leaves a ribbon on a plane just past the player, and the arm reaches for it.
        for (const [side, entry] of Object.entries(hands)) {
          const hand = state.hands[side];
          entry.marker.visible = hand.live;
          if (hand.live) {
            entry.points.push({ at: toWorld(hand.x, hand.y, FRONT_Z, new THREE.Vector3()), t: elapsed });
            const distance = 1;
            const halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
            entry.marker.position.set(hand.x * halfHeight * camera.aspect, hand.y * halfHeight, -distance);
            entry.marker.scale.setScalar(0.32 + Math.min(1, hand.speed / 4) * 0.2);
          }
          reachTarget[side] = damp(reachTarget[side], hand.live ? 1 : 0, 14, dt);
          if (reachTarget[side] > 0.01) {
            const bone = side === "left" ? "l" : "r";
            const toHand = toWorld(hand.x, hand.y, FRONT_Z, planeAt).sub(hero.bones.get(`upperarm_${bone}`).getWorldPosition(new THREE.Vector3()));
            aimBone(hero.bones.get(`upperarm_${bone}`), toHand, reachTarget[side]);
            aimBone(hero.bones.get(`lowerarm_${bone}`), toHand, reachTarget[side]);
          }
        }
        for (const entry of [...Object.values(hands), keyStroke]) drawTrail(entry, elapsed);

        bonusLife -= dt;
        bonus.visible = bonusLife > 0;
        bonus.position.y += dt * 0.6;
        focusShadow(0, 0, -2);
      },
      event(event) {
        if (event.type === "cut") {
          const at = toWorld(event.x, event.y, FRONT_Z - 1.2, new THREE.Vector3());
          fx.burst(at, FLESH[event.kind], 22);
          for (const dir of [-1, 1]) {
            const half = halves.find((item) => item.life <= 0);
            if (!half) break;
            half.kind = event.kind;
            half.model = takeHalf(event.kind);
            half.model.scale.setScalar(0.3);
            half.model.position.copy(at);
            half.model.rotation.set(0, 0, event.angle + (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
            half.v.set(dir * 2.6 + event.vx, 2 + event.vy, 0.4);
            half.spin.set(dir * 3, 0, dir * 5);
            half.life = 1;
          }
          // A cut from a key has no hand to follow, so the stroke is drawn across the fruit.
          if (event.side === "key") {
            const span = 0.16;
            for (let i = 0; i <= 8; i += 1) keyStroke.points.push({ at: toWorld(event.x + (i / 8 - 0.5) * span, event.y + (i / 8 - 0.5) * span * 1.6, FRONT_Z, new THREE.Vector3()), t: now - (8 - i) * 0.004 });
          }
          if (event.count > 1) {
            bonus.material.map.dispose();
            const next = wordCard(`x${event.count}`, "#fff1a8");
            bonus.material.map = next.material.map;
            bonus.position.copy(at);
            bonus.position.y += 0.6;
            bonusLife = 0.7;
          }
          hero.play(Math.random() < 0.5 ? "Sword_Regular_A" : "Sword_Regular_B", { once: true, speed: 2.2, fade: 0.05, then: "Idle_Loop" });
        }
        if (event.type === "blast") {
          const at = toWorld(event.x, event.y, FRONT_Z - 1, new THREE.Vector3());
          fx.burst(at, "#ffb02e", 50);
          fx.burst(at, "#ff3b1e", 40);
          fx.flash("#ffb02e", 0.5);
          fx.shake(0.6);
          hero.play("Hit_Chest", { once: true, speed: 1.4, then: "Idle_Loop" });
        }
        if (event.type === "end") hero.play("Yes", { once: true });
      },
    };
  },
};

function drawTrail(entry, now) {
  entry.points = entry.points.filter((point) => now - point.t < TRAIL_SECONDS).slice(-TRAIL_POINTS);
  const { position, color } = entry.mesh.geometry.attributes;
  const count = entry.points.length;
  for (let i = 0; i < TRAIL_POINTS; i += 1) {
    const point = entry.points[Math.min(i, count - 1)];
    const before = entry.points[Math.max(0, Math.min(i, count - 1) - 1)];
    if (!point) {
      color.setW(i * 2, 0);
      color.setW(i * 2 + 1, 0);
      continue;
    }
    const age = (now - point.t) / TRAIL_SECONDS;
    const dx = point.at.x - (before?.at.x ?? point.at.x);
    const dy = point.at.y - (before?.at.y ?? point.at.y);
    const length = Math.hypot(dx, dy) || 1;
    const width = TRAIL_WIDTH * (1 - age);
    position.setXYZ(i * 2, point.at.x - (dy / length) * width, point.at.y + (dx / length) * width, point.at.z);
    position.setXYZ(i * 2 + 1, point.at.x + (dy / length) * width, point.at.y - (dx / length) * width, point.at.z);
    const alpha = i < count ? 0.95 * (1 - age) : 0;
    color.setW(i * 2, alpha);
    color.setW(i * 2 + 1, alpha);
  }
  position.needsUpdate = true;
  color.needsUpdate = true;
}
