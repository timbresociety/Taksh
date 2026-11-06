// Helpers every view uses.
import * as THREE from "three";

export const LANE_WIDTH = 2.2;
export const laneX = (lane) => (lane - 1) * LANE_WIDTH;
export const damp = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-rate * dt));

// Keeps one object per live game item, and reuses objects as items come and go.
export class Pool {
  constructor(parent, make) {
    Object.assign(this, { parent, make, live: new Map(), spare: new Map() });
  }

  sync(items, place) {
    const seen = new Set();
    for (const item of items) {
      seen.add(item.id);
      let entry = this.live.get(item.id);
      if (!entry) {
        const kind = item.kind ?? "any";
        const object = this.spare.get(kind)?.pop() ?? this.make(item);
        object.visible = true;
        if (!object.parent) this.parent.add(object);
        entry = { object, kind };
        this.live.set(item.id, entry);
      }
      place(entry.object, item);
    }
    for (const [id, entry] of this.live) {
      if (seen.has(id)) continue;
      entry.object.visible = false;
      this.spare.set(entry.kind, [...(this.spare.get(entry.kind) ?? []), entry.object]);
      this.live.delete(id);
    }
  }
}

// Bones carry the rig's scale, so a prop is resized to stay true to metres once it is attached.
export function holdOnBone(bone, object, offset = [0, 0, 0]) {
  bone.updateWorldMatrix(true, false);
  const scale = new THREE.Vector3();
  bone.getWorldScale(scale);
  object.scale.multiplyScalar(1 / scale.x);
  object.position.set(...offset).multiplyScalar(1 / scale.x);
  bone.add(object);
}

export function gloves(character, colour, world) {
  for (const side of ["l", "r"]) {
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.095, 20, 14), world.material(colour, { roughness: 0.35 }));
    glove.castShadow = true;
    world.dress(glove);
    holdOnBone(character.bones.get(`hand_${side}`), glove);
  }
}

// A flat word on a card, used for the punch names on pads.
export function wordCard(text, colour) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const pen = canvas.getContext("2d");
  pen.font = "800 58px system-ui, sans-serif";
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  pen.fillStyle = colour;
  pen.fillText(text, 128, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, fog: false }));
  sprite.userData.keepMaterial = true;
  sprite.scale.set(0.9, 0.45, 1);
  return sprite;
}

export function blink(root, invincibleMs, elapsed) {
  root.visible = invincibleMs <= 0 || Math.sin(elapsed * 34) > -0.2;
}
