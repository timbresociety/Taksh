// What the cursor games draw alike. The game's field is the screen itself, so an item is placed from its
// screen position at any depth, and anything that must sit exactly under a hand is drawn on the lens.
import * as THREE from "three";
import { aimBone } from "../character.js";
import { damp } from "./shared.js";

export const HAND_COLOURS = { left: "#26e0cc", right: "#ffae1f" };

const LENS_DISTANCE = 1;
const ARC_SEGMENTS = 40;

export const glowMaterial = (colour, extra) => new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false, ...extra });

export function fieldOf(camera) {
  const ray = new THREE.Vector3();
  const halfHeight = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const cast = (x, y) => ray.set(x, y, 0.5).unproject(camera).sub(camera.position);
  return {
    // Where a field position lands on a plane at depth z, or on a floor at height y, for the camera as it stands.
    atDepth: (x, y, z, out) => {
      cast(x, y);
      return out.copy(camera.position).addScaledVector(ray, (z - camera.position.z) / ray.z);
    },
    onFloor: (x, y, height, out) => {
      cast(x, y);
      return out.copy(camera.position).addScaledVector(ray, (height - camera.position.y) / ray.y);
    },
    // How big a field radius is at a given distance from the camera.
    size: (radius, distance) => radius * distance * halfHeight(),
    onLens: (object, x, y, radius) => {
      const half = halfHeight() * LENS_DISTANCE;
      object.position.set(x * half * camera.aspect, y * half, -LENS_DISTANCE);
      object.scale.setScalar(radius * half);
    },
  };
}

// A ring that fills as it goes. Drawing fewer of its segments is the whole animation.
export function arcRing(colour, thickness = 0.14) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(1 - thickness, 1, ARC_SEGMENTS, 1, Math.PI / 2), glowMaterial(colour));
  ring.userData.keepMaterial = true;
  ring.renderOrder = 12;
  ring.fill = (share) => ring.geometry.setDrawRange(0, Math.round(share * ARC_SEGMENTS) * 6);
  return ring;
}

// The ring under each hand, in the hand's own colour.
export function handRings(camera, field, radius) {
  const rings = Object.fromEntries(Object.entries(HAND_COLOURS).map(([side, colour]) => {
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), glowMaterial(colour));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), glowMaterial(colour));
    const halo = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), glowMaterial("#0a0a12", { opacity: 0.18 }));
    // A dark edge, because a saffron ring on a saffron sky is a hand the player has lost.
    const edge = new THREE.Mesh(new THREE.RingGeometry(0.74, 1.08, 40), glowMaterial("#0a0a12", { opacity: 0.6 }));
    const group = new THREE.Group();
    group.add(halo, edge, ring, dot);
    for (const [order, mesh] of [halo, edge, ring, dot].entries()) {
      mesh.userData.keepMaterial = true;
      mesh.renderOrder = 13 + order;
    }
    group.visible = false;
    camera.add(group);
    return [side, group];
  }));
  return {
    update(cursors, pulse = {}) {
      for (const [side, group] of Object.entries(rings)) {
        const cursor = cursors[side];
        group.visible = cursor.live;
        if (cursor.live) field.onLens(group, cursor.x, cursor.y, radius * (1 + (pulse[side] ?? 0) * 0.35));
      }
    },
  };
}

// The hero's arms reach for the cursors, and fall back when a hand is lost.
export function armReach(hero) {
  const weight = { left: 0, right: 0 };
  const toHand = new THREE.Vector3();
  const shoulder = new THREE.Vector3();
  return (cursors, dt, spotOf) => {
    for (const side of ["left", "right"]) {
      const cursor = cursors[side];
      weight[side] = damp(weight[side], cursor.live ? 1 : 0, 14, dt);
      if (weight[side] < 0.01) continue;
      const bone = side === "left" ? "l" : "r";
      const upper = hero.bones.get(`upperarm_${bone}`);
      upper.getWorldPosition(shoulder);
      spotOf(cursor, toHand).sub(shoulder);
      aimBone(upper, toHand, weight[side]);
      aimBone(hero.bones.get(`lowerarm_${bone}`), toHand, weight[side]);
    }
  };
}

// A line of words across the top of the screen for a new round, on its own plate so it reads over anything.
export function bannerCard(camera, field) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 192;
  const pen = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1875), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  card.userData.keepMaterial = true;
  card.renderOrder = 18;
  card.visible = false;
  camera.add(card);
  let life = 0;
  return {
    say(words, seconds = 1.6) {
      pen.clearRect(0, 0, 1024, 192);
      pen.fillStyle = "rgba(10, 10, 18, 0.74)";
      pen.beginPath();
      pen.roundRect(8, 8, 1008, 176, 40);
      pen.fill();
      pen.font = "900 104px system-ui, sans-serif";
      pen.textAlign = "center";
      pen.textBaseline = "middle";
      pen.fillStyle = "#fff4d6";
      pen.fillText(words, 512, 100, 960);
      texture.needsUpdate = true;
      life = seconds;
    },
    update(dt) {
      life -= dt;
      card.visible = life > 0;
      if (!card.visible) return;
      field.onLens(card, 0, 0.3, 1.25);
      card.material.opacity = Math.min(1, life * 3);
    },
  };
}
