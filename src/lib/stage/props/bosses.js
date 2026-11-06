// Parts that turn a rigged character into a boss. All of them ride on the head bone, so they nod and
// turn with it, and all are sized for a 1.8m body, so scale the character and they follow.
//
//   world.dress(addHeads(hero, 10));
//   world.dress(addCrown(hero));
//   hero.root.scale.setScalar(2.8);
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { forge } from "./forge.js";
import { wearOnBone } from "./wear.js";

const GOLD = "#e8b23a";
const DEEP_GOLD = "#b57f1e";
const RUBY = "#d21f3c";
const EMERALD = "#17a673";

const HEAD_TOP = 0.165;

// A tall tiered mukut rather than a king's ring of spikes: it is the shape that says "epic" at a glance.
function crown(b, { radius = 0.112, tall = 0.3 } = {}) {
  b.lathe([[radius, 0], [radius * 1.02, 0.05], [radius * 0.84, 0.07], [radius * 0.9, tall * 0.4], [radius * 0.6, tall * 0.46], [radius * 0.66, tall * 0.72], [radius * 0.34, tall * 0.78], [radius * 0.36, tall * 0.9], [0.008, tall]], GOLD, { segments: 12, metal: true });
  b.torus(radius, 0.012, DEEP_GOLD, { at: [0, 0.008, 0], turn: [Math.PI / 2, 0, 0], segments: 16, sides: 5, metal: true });
  b.torus(radius * 0.88, 0.01, DEEP_GOLD, { at: [0, tall * 0.4, 0], turn: [Math.PI / 2, 0, 0], segments: 14, sides: 5, metal: true });
  // Petals around the band, and a jewel at the front of each tier.
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    b.plate([[-0.03, 0], [0.03, 0], [0, 0.085]], 0.012, i % 2 ? GOLD : DEEP_GOLD, { at: [Math.sin(angle) * radius, 0.05, Math.cos(angle) * radius], turn: [-0.2, angle, 0], metal: true });
  }
  b.ball(0.02, RUBY, { at: [0, 0.05, radius * 1.05] });
  b.ball(0.014, EMERALD, { at: [0, tall * 0.5, radius * 0.72] });
  b.ball(0.012, RUBY, { at: [0, tall * 0.8, radius * 0.4] });
  return b;
}

// A head in the fan: slightly smaller the further out, sinking on a gentle arc and turned away from the
// middle, so that the row reads as one great many-faced figure, not a shelf of copies.
function fanPlace(index, side) {
  const step = index + 1;
  return {
    x: side * (0.2 * step - 0.006 * step * step),
    y: -0.012 * step * step + 0.015 * step,
    z: -0.018 * step,
    yaw: side * 0.14 * step,
    size: 1 - 0.035 * step,
  };
}

// Extra heads fanned out from the main one, half on each side. Ten gives the classic Ravana row. By
// default the copies are merged per material, so ten heads and ten crowns cost a few draw calls. With
// separate: true each is its own object in fan.heads, for a game where heads flinch or fall one by one.
export function addHeads(character, count = 10, { crowns = true, separate = false } = {}) {
  const fan = new THREE.Group();
  const sides = [-1, 1];
  const places = [];
  for (let i = 0; i < Math.ceil(count / 2); i += 1) for (const side of sides) if (places.length < count) places.push(fanPlace(i, side));
  const matrix = new THREE.Matrix4();
  const placed = ({ x, y, z, yaw, size }) => matrix.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(size, size, size));
  const parts = character.rigidHead();

  if (separate) {
    fan.heads = places.map((place) => {
      const head = new THREE.Group();
      head.applyMatrix4(placed(place));
      for (const { geometry, material } of parts) head.add(new THREE.Mesh(geometry, material));
      fan.add(head);
      return head;
    });
  } else {
    for (const { geometry, material } of parts) fan.add(new THREE.Mesh(mergeGeometries(places.map((place) => geometry.clone().applyMatrix4(placed(place))), false), material));
  }
  const gilt = forge();
  if (crowns) {
    if (separate) {
      const worn = crown(forge(), { tall: 0.24 }).finish();
      for (const head of fan.heads) {
        const copy = worn.clone(true);
        copy.position.set(0, HEAD_TOP * 0.82, 0.008);
        copy.scale.setScalar(1.05);
        head.add(copy);
      }
    } else {
      for (const { x, y, z, yaw, size } of places) gilt.within({ at: [x, y + HEAD_TOP * size * 0.82, z + 0.008], turn: [0, yaw, 0], scale: size * 1.05 }, (inner) => crown(inner, { tall: 0.24 }));
    }
  }
  // A gold yoke under the necks, so the row grows from the shoulders instead of hanging in the air.
  for (const side of sides) {
    const row = places.filter((place) => Math.sign(place.x) === side).map(({ x, y, z }) => [x, y - 0.12, z - 0.01]);
    gilt.tube([[0, -0.14, 0], ...row], 0.022, DEEP_GOLD, { sides: 6, steps: 24, metal: true });
    for (const [x, y, z] of row) gilt.torus(0.062, 0.016, GOLD, { at: [x, y + 0.012, z], turn: [Math.PI / 2, 0, 0], segments: 12, sides: 5, metal: true });
  }
  fan.add(gilt.finish());
  fan.traverse((node) => {
    node.castShadow = true;
    node.frustumCulled = false;
  });
  return wearOnBone(character, "Head", fan);
}

export function addCrown(character, { radius = 0.118, tall = 0.36 } = {}) {
  const made = crown(forge(), { radius, tall }).finish();
  made.traverse((node) => {
    node.castShadow = true;
    node.frustumCulled = false;
  });
  return wearOnBone(character, "Head", made, [0, HEAD_TOP * 0.74, 0.008]);
}

// A horn is a stack of short tapering sections along a sweep, thinning to a point.
function horn(b, side, length, colour) {
  const steps = 8;
  const pathAt = (t) => [side * (0.08 + t * length * 0.8), 0.1 + Math.sin(t * 1.9) * length * 0.72, 0.02 - t * t * length * 0.18];
  for (let i = 0; i < steps; i += 1) {
    const [a, c] = [pathAt(i / steps), pathAt((i + 1) / steps)];
    const direction = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const height = direction.length();
    const turn = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    const thick = 0.05 * (1 - i / steps) + 0.004;
    const thin = 0.05 * (1 - (i + 1) / steps) + 0.002;
    b.cyl(thick, height * 1.1, i < 3 ? "#3a2a22" : colour, { top: thin, at: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], turn: [turn.x, turn.y, turn.z], segments: 7 });
  }
}

export function addHorns(character, { length = 0.42, colour = "#e8dcc0" } = {}) {
  const parts = forge();
  for (const side of [-1, 1]) horn(parts, side, length, colour);
  const made = parts.finish();
  made.traverse((node) => {
    node.castShadow = true;
    node.frustumCulled = false;
  });
  return wearOnBone(character, "Head", made);
}
