// What a character wears or carries that the rig cannot: rigid pieces that ride on one bone.
import * as THREE from "three";
import { addCrown, addHeads } from "./bosses.js";
import { forge } from "./forge.js";

// Sets object on a bone so that, in the rest pose, it stands at the bone plus at (metres, world axes)
// and upright. The rest pose is used rather than the current one, so it does not matter what clip is
// playing, or how much a boss has been scaled up.
export function wearOnBone(character, boneName, object, at = [0, 0, 0]) {
  const rest = character.rest.get(boneName);
  const place = new THREE.Matrix4().makeTranslation(...new THREE.Vector3().setFromMatrixPosition(rest).add(new THREE.Vector3(...at)).toArray());
  rest.clone().invert().multiply(place).decompose(object.position, object.quaternion, object.scale);
  character.bones.get(boneName).add(object);
  return object;
}

const STEEL = "#c7ccd4";

// The white boat-shaped cap, worn low: long front to back, narrow, and creased down the middle.
export function gandhiCap(b) {
  const white = "#f7f4ea";
  b.profile([[-0.13, -0.012], [0.13, -0.012], [0.118, 0.042], [-0.118, 0.042]], 0.175, white);
  b.profile([[-0.118, 0.042], [0.118, 0.042], [0.09, 0.07], [-0.09, 0.07]], 0.15, white);
  b.box(0.156, 0.008, 0.2, "#d9d4c4", { at: [0, 0.07, 0] });
  return b;
}

// A long wooden crate of tiffins, the load a dabbawala walks through the city with.
export function tiffinCrate(b) {
  const wood = "#a97b47";
  // A cloth ring under the crate is what makes it possible to balance at all.
  b.torus(0.085, 0.024, "#b9a27f", { at: [0, 0.03, 0], turn: [Math.PI / 2, 0, 0], segments: 12, sides: 5 });
  b.box(0.78, 0.04, 0.42, wood, { at: [0, 0.075, 0] });
  for (const z of [-0.2, 0.2]) b.box(0.78, 0.1, 0.03, "#8a5f33", { at: [0, 0.135, z] });
  for (const x of [-0.38, 0.38]) b.box(0.03, 0.1, 0.42, "#8a5f33", { at: [x, 0.135, 0] });
  const lids = ["#d8231f", "#2f6bff", "#21a07a", "#ffb300"];
  for (let i = 0; i < 4; i += 1) {
    for (const z of [-0.09, 0.09]) {
      const x = -0.255 + i * 0.17;
      const layers = 3 + ((i + (z > 0 ? 1 : 0)) % 2);
      for (let layer = 0; layer < layers; layer += 1) b.cyl(0.074, 0.062, layer % 2 ? "#aeb4bc" : STEEL, { at: [x, 0.13 + layer * 0.064, z], segments: 10, metal: true });
      const top = 0.13 + layers * 0.064;
      b.cyl(0.05, 0.016, lids[(i + (z > 0 ? 2 : 0)) % 4], { top: 0.066, at: [x, top - 0.024, z], segments: 10 });
      b.torus(0.04, 0.006, "#8d9099", { at: [x, top - 0.008, z], arc: Math.PI, sides: 4, segments: 8 });
      for (const side of [-1, 1]) b.box(0.008, top - 0.12, 0.012, "#8d9099", { at: [x + side * 0.08, (top + 0.12) / 2, z] });
    }
  }
  return b;
}

export function headCloth(b) {
  const [red, deep] = ["#d8362a", "#a81f1c"];
  for (let i = 0; i < 3; i += 1) b.torus(0.098 - i * 0.008, 0.021, i % 2 ? red : deep, { at: [0, i * 0.03, 0], turn: [Math.PI / 2 + (i - 1) * 0.08, 0, 0], segments: 14, sides: 6 });
  b.ball(0.094, deep, { at: [0, 0.046, 0], scale: [1, 0.5, 1.08] });
  b.ball(0.036, deep, { at: [0.07, 0.04, -0.07] });
  b.box(0.05, 0.13, 0.012, red, { at: [0.09, -0.02, -0.09], turn: [0.1, 0.6, 0.2] });
  return b;
}

// A coil of net over the shoulder: many fine strands rather than one rope, with a few corks showing.
export function netCoil(b) {
  const strands = ["#8d9a6b", "#a7b184", "#77855a"];
  for (let i = 0; i < 9; i += 1) {
    const a = i * 2.4;
    b.torus(0.17 + (i % 3) * 0.016, 0.012, strands[i % 3], { at: [Math.cos(a) * 0.022, -0.17 + Math.sin(a) * 0.012, Math.sin(a) * 0.012], turn: [0, Math.PI / 2, 0.3 * Math.sin(i)], segments: 18, sides: 4 });
  }
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 1;
    b.cyl(0.026, 0.05, "#e86a22", { at: [0.03, -0.17 + Math.sin(a) * 0.18, Math.cos(a) * 0.18], turn: [0, 0, Math.PI / 2], segments: 7 });
  }
  return b;
}

const piece = (build) => {
  const made = build(forge());
  return made.isObject3D ? made : made.finish();
};

// Each outfit's rigid parts, by body id. The offsets are measured from the rest pose.
export const WEAR = {
  dabbawala(character) {
    wearOnBone(character, "Head", piece(gandhiCap), [0, 0.15, 0.012]);
    character.steady.push(wearOnBone(character, "Head", piece(tiffinCrate), [0, 0.2, 0.012]));
  },
  fisherman(character) {
    wearOnBone(character, "Head", piece(headCloth), [0, 0.105, 0.015]);
    wearOnBone(character, "clavicle_l", piece(netCoil), [0.17, -0.02, 0]);
  },
  // Nine more heads beside his own, merged so the row costs a few draw calls, and his own crowned.
  ravana(character) {
    addHeads(character, 9);
    addCrown(character);
  },
};
