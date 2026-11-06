// Marine Drive and Chowpatty at dusk: the sea wall, its tetrapods, the lamps of the Queen's Necklace,
// and the sand with its carts and umbrellas.
import * as THREE from "three";
import { forge, part } from "./forge.js";
import { halo, lightPool } from "./fire.js";
import { signboard } from "./paint.js";
import { cart } from "./mumbai.js";

const CONCRETE = "#a7a59c";
const SAND = "#d9b77e";
const WARM = "#ffb95e";

const up = new THREE.Vector3(0, 1, 0);
function aimedAt(x, y, z) {
  const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(x, y, z).normalize()));
  return [euler.x, euler.y, euler.z];
}

// Four stubby legs from one centre: three down and one up, the way they lie on the rocks.
const LEGS = [[0, 1, 0], [0.943, -0.333, 0], [-0.471, -0.333, 0.816], [-0.471, -0.333, -0.816]];

function oneTetrapod(b, colour = CONCRETE) {
  b.ball(0.3, colour, { detail: 0, at: [0, 0, 0] });
  for (const [x, y, z] of LEGS) b.cyl(0.33, 0.56, colour, { top: 0.17, segments: 7, at: [x * 0.3, y * 0.3, z * 0.3], turn: aimedAt(x, y, z) });
}

export function tetrapod(b) {
  b.within({ at: [0, 0.48, 0] }, oneTetrapod);
  return b;
}

// A heap along the wall, length metres of it, centred on the origin. Stained dark where the tide reaches.
export function tetrapods(b, length = 17) {
  const random = (i) => Math.abs(Math.sin(i * 78.233) * 43758.5453) % 1;
  for (let i = 0; i < length * 1.4; i += 1) {
    const z = -length / 2 + (i / (length * 1.4)) * length;
    const row = i % 3;
    b.within({ at: [row * 1.15 - 1.1 + random(i) * 0.4, 0.42 + (row === 1 ? 0.24 : 0) + random(i + 3) * 0.2, z], turn: [random(i + 1) * 6, random(i + 2) * 6, random(i + 5) * 6], scale: 1.1 + random(i + 7) * 0.5 }, (inner) => oneTetrapod(inner, row === 0 ? "#8c8b84" : i % 2 ? CONCRETE : "#b6b4ab"));
  }
  return b;
}

// The low wall people sit on, with the sea on its -x side.
export function seawall(b, length = 34) {
  const z = length / 2;
  b.slab(-0.4, 0.4, 0, 0.62, -z, z, "#b5b2a7");
  b.slab(-0.48, 0.48, 0.62, 0.72, -z, z, "#cfccc0");
  for (let at = -z + 1; at < z; at += 2) b.slab(-0.405, 0.405, 0.02, 0.6, at - 0.03, at + 0.03, "#94928a");
  return b;
}

// A tall lamp with its arm over the +x side.
export function lamp(b) {
  const steel = "#5d6068";
  b.cyl(0.11, 8, steel, { top: 0.06, at: [0, 4, 0], segments: 8 });
  b.cyl(0.2, 0.7, steel, { top: 0.13, at: [0, 0.35, 0], segments: 8 });
  b.tube([[0, 7.9, 0], [0.1, 8.5, 0], [0.7, 8.8, 0], [1.5, 8.7, 0]], 0.05, steel, { steps: 8, sides: 5 });
  b.box(0.7, 0.1, 0.26, "#383b42", { at: [1.5, 8.72, 0] });
  b.box(0.56, 0.1, 0.18, "#ffd9a0", { at: [1.5, 8.64, 0], glow: true });
  const light = halo(2.4, WARM);
  light.position.set(1.5, 8.58, 0);
  const pool = lightPool(5, WARM, 0.3);
  pool.position.set(1.5, 0.05, 0);
  return b.finish(light, pool);
}

export function deco(b, { wall, trim, accent, floors = 6, seed = 1 }) {
  const half = 8;
  const depth = 9;
  const storey = 3.1;
  const height = floors * storey + 1;
  const random = (i) => Math.abs(Math.sin((i + seed * 3.7) * 12.9898) * 43758.5453) % 1;
  b.slab(-half + 1.4, half - 1.4, 0, height, -depth, 0, wall);
  b.slab(-half, half, 0, height, -depth, -1.4, wall);
  // Curved corners, the signature of the Marine Drive blocks, with their balconies wrapping round.
  for (const side of [-1, 1]) {
    b.cyl(1.4, height, wall, { at: [side * (half - 1.4), height / 2, -1.4], segments: 16 });
    for (let storeyAt = 1; storeyAt < floors; storeyAt += 1) {
      const y = storeyAt * storey;
      b.cyl(1.68, 0.14, trim, { at: [side * (half - 1.4), y, -1.4], segments: 16 });
      b.torus(1.62, 0.04, accent, { at: [side * (half - 1.4), y + 0.95, -1.4], turn: [Math.PI / 2, 0, 0], segments: 18, sides: 4 });
    }
    b.slab(side * 3 - 0.22, side * 3 + 0.22, 0, height + 1.2, -0.1, 0.3, trim);
  }
  // Windows sit behind eyebrow ledges. Evening: some are lit, and a lit room is the point of the view.
  for (let f = 0; f < floors; f += 1) {
    const y = f * storey + 1;
    for (let i = 0; i < 7; i += 1) {
      const x = -5.1 + i * 1.7;
      const lit = random(f * 7 + i) > 0.42 && f > 0;
      b.slab(x - 0.55, x + 0.55, y, y + 1.5, 0.01, 0.04, lit ? (random(i + f) > 0.5 ? "#ffd58a" : "#ffc26b") : "#2a3644", { glow: lit });
      b.slab(x - 0.68, x + 0.68, y + 1.6, y + 1.7, 0, 0.4, trim);
    }
  }
  b.slab(-3, 3, 0, 3, 0, 0.12, accent);
  b.slab(-1.1, 1.1, 0, 2.5, 0.12, 0.16, "#3a2f2a");
  // A stepped crown over the middle bay.
  for (const [w, top] of [[2.8, 1.4], [1.8, 2.4], [0.9, 3.4]]) b.slab(-w, w, height, height + top, -0.9, 0.05, wall);
  b.slab(-half, half, height - 0.2, height + 0.16, -depth, 0.08, trim);
  return b;
}

function frond(length, droop, width) {
  const geometry = new THREE.BoxGeometry(width, 0.03, length, 1, 1, 7);
  geometry.translate(0, 0, -length / 2);
  const at = geometry.attributes.position;
  for (let i = 0; i < at.count; i += 1) {
    const t = -at.getZ(i) / length;
    at.setX(i, at.getX(i) * Math.sin(Math.min(1, t * 1.6 + 0.12) * Math.PI) * 1.2);
    at.setY(i, at.getY(i) + 0.5 * t - droop * t * t);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function palm(b, seed = 1) {
  const lean = seed % 2 ? 0.5 : -0.6;
  const top = 6.8 + (seed % 3) * 0.7;
  b.tube([[0, 0, 0], [lean * 0.2, top * 0.4, 0], [lean * 0.7, top * 0.75, 0.1], [lean, top, 0.1]], 0.15, "#7c6547", { sides: 6, steps: 8 });
  b.cyl(0.24, 0.5, "#7c6547", { top: 0.16, at: [0, 0.25, 0], segments: 7 });
  for (let i = 0; i < 10; i += 1) {
    const turn = (i / 10) * Math.PI * 2;
    b.add(frond(2.9 + (i % 3) * 0.3, 2.1 + (i % 2) * 0.5, 0.5), i % 2 ? "#2f8a4c" : "#3ea35a", { at: [lean, top, 0.1], turn: [0, turn, 0] });
  }
  for (const [x, z] of [[0.18, 0.1], [-0.1, 0.2], [0, -0.12]]) b.ball(0.13, "#6a4a2a", { at: [lean + x, top - 0.18, 0.1 + z] });
  return b;
}

export function bhelCart(b) {
  cart(b, { width: 2.3, canopy: ["#e8322c", "#ffd23f"], sign: signboard({ name: "bhel", text: "BHEL PURI", sub: "भेळ पुरी", bg: "#e8322c", ink: "#fff6d8", border: "#ffd23f" }) });
  // The great steel bowl of puffed rice is the whole silhouette.
  b.lathe([[0.001, 1], [0.34, 1.02], [0.5, 1.18], [0.52, 1.24], [0.5, 1.24], [0.34, 1.1]], "#c2c7cf", { at: [-0.3, 0, 0], segments: 16, metal: true });
  b.ball(0.47, "#efe2ba", { at: [-0.3, 1.2, 0], scale: [1, 0.46, 1] });
  for (const [x, z, colour] of [[-0.36, 0.1, "#2e9c4c"], [-0.18, -0.16, "#c9371f"], [-0.5, -0.1, "#2e9c4c"], [-0.2, 0.2, "#d68b2a"]]) b.ball(0.05, colour, { detail: 0, at: [x, 1.38, z] });
  for (const [x, colour] of [[0.32, "#7a2a1a"], [0.62, "#3b7f2c"], [0.92, "#c98a2a"]]) {
    b.cyl(0.13, 0.14, "#c2c7cf", { at: [x, 1.05, 0.22], segments: 10, metal: true });
    b.cyl(0.12, 0.02, colour, { at: [x, 1.12, 0.22], segments: 10 });
  }
  for (let i = 0; i < 4; i += 1) b.cone(0.05, 0.16, "#e9dcb4", { at: [0.5 + i * 0.14, 1.06, -0.2], turn: [Math.PI, 0, 0], segments: 6 });
  return b;
}

export function kulfiCart(b) {
  cart(b, { width: 1.9, canopy: ["#f4efe2", "#2f6bff"], shelf: "#d94a5a", sign: signboard({ name: "kulfi", text: "KULFI", sub: "मटका कुल्फी", bg: "#f4efe2", ink: "#c0141b", border: "#2f6bff" }) });
  // The red clay matka, wrapped in sacking, that keeps the moulds cold.
  b.lathe([[0.001, 0.98], [0.26, 1], [0.38, 1.2], [0.34, 1.42], [0.2, 1.52], [0.22, 1.56], [0.001, 1.56]], "#a84c2a", { at: [-0.3, 0, 0], segments: 14 });
  b.torus(0.36, 0.05, "#c9b58a", { at: [-0.3, 1.24, 0], turn: [Math.PI / 2, 0, 0], segments: 14, sides: 4 });
  for (let i = 0; i < 5; i += 1) {
    b.cone(0.05, 0.18, i % 2 ? "#f7e3a8" : "#fff4dc", { at: [0.16 + i * 0.12, 1.12, 0.14], turn: [Math.PI, 0, 0], segments: 6 });
    b.box(0.015, 0.1, 0.015, "#c9a36b", { at: [0.16 + i * 0.12, 1.24, 0.14] });
  }
  return b;
}

const SHADE_COLOURS = [["#e8322c", "#ffd23f"], ["#2f6bff", "#f5f7fb"], ["#21a07a", "#ffb300"], ["#e05ca8", "#f5f7fb"]];

export function umbrella(b, index = 0) {
  const [first, second] = SHADE_COLOURS[index % SHADE_COLOURS.length];
  const sides = 8;
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2;
    const c = ((i + 1) / sides) * Math.PI * 2;
    // Each wedge is its own colour, so the shade reads as striped from any side.
    const rim = 1.3;
    const geometry = new THREE.BufferGeometry();
    const tip = [0, 2.74, 0];
    const left = [Math.cos(a) * rim, 2.2, Math.sin(a) * rim];
    const right = [Math.cos(c) * rim, 2.2, Math.sin(c) * rim];
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([...tip, ...right, ...left, ...tip, ...left, ...right], 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    geometry.computeVertexNormals();
    b.add(geometry, i % 2 ? first : second);
  }
  b.cyl(0.035, 2.72, "#d8d8d8", { at: [0, 1.36, 0], segments: 6 });
  b.ball(0.05, "#fff", { at: [0, 2.78, 0] });
  return b;
}

const KITE_COLOURS = [["#e8322c", "#ffd23f"], ["#2f6bff", "#ffffff"], ["#21c48d", "#ff4f8e"]];

// A paper patang on a long line. A separate part, so it can dip and wander on the wind.
export function kite(index, line = 11) {
  const [first, second] = KITE_COLOURS[index % KITE_COLOURS.length];
  const paper = part((b) => {
    b.plate([[0, 0.64], [0.5, 0], [0, -0.64]], 0.02, first);
    b.plate([[0, 0.64], [-0.5, 0], [0, -0.64]], 0.02, second);
    b.plate([[-0.14, -0.62], [0.14, -0.62], [0, -0.9]], 0.02, second);
    b.box(0.02, 1.3, 0.03, "#7c5a35", { at: [0, 0, 0.02] });
  });
  paper.rotation.x = -0.3;
  paper.userData.sway = { amount: 0.28, speed: 1.1 + index * 0.3 };
  const string = part((b) => b.tube([[0, 0, 0], [0.7, -line * 0.5, 0.2], [1.4, -line, 0.3]], 0.01, "#f5f7fb", { sides: 3, steps: 6 }));
  paper.add(string);
  return paper;
}

// The little hand-turned roundabout from the sands: a painted top, and a ring of wooden horses.
function spinner() {
  const top = part((b) => {
    const colours = ["#e8322c", "#ffd23f", "#2f6bff", "#21a07a"];
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      b.cone(2.2, 1, colours[i % 4], { segments: 12, at: [0, 3.05, 0], turn: [0, a, 0] });
    }
    b.cyl(2.2, 0.24, "#ffd23f", { at: [0, 2.46, 0], segments: 16 });
    b.ball(0.16, "#ffd23f", { at: [0, 3.68, 0] });
    b.cyl(0.08, 2.4, "#c9ced6", { at: [0, 1.28, 0], segments: 8 });
    b.cyl(1.9, 0.12, "#a3753f", { at: [0, 0.4, 0], segments: 16 });
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const [x, z] = [Math.cos(a) * 1.5, Math.sin(a) * 1.5];
      const colour = ["#f5f7fb", "#ffb300", "#ff6fa8"][i % 3];
      b.cyl(0.025, 2, "#ffd23f", { at: [x, 1.46, z], segments: 6 });
      b.within({ at: [x, 0.92 + (i % 2) * 0.16, z], turn: [0, -a, 0] }, (horse) => {
        horse.box(0.2, 0.26, 0.74, colour);
        horse.box(0.16, 0.42, 0.2, colour, { at: [0, 0.26, -0.4], turn: [0.4, 0, 0] });
        horse.box(0.14, 0.14, 0.3, colour, { at: [0, 0.48, -0.5] });
        for (const [dx, dz] of [[-0.08, -0.28], [0.08, -0.28], [-0.08, 0.28], [0.08, 0.28]]) horse.box(0.06, 0.34, 0.07, colour, { at: [dx, -0.26, dz] });
        horse.box(0.21, 0.08, 0.3, "#c0141b", { at: [0, 0.15, 0] });
      });
    }
  });
  top.userData.spin = [0, 0.7, 0];
  return top;
}

export function merryGo(b) {
  b.cyl(2.3, 0.3, "#c9b58a", { at: [0, 0.15, 0], segments: 18 });
  b.cyl(0.26, 0.5, "#4a4d55", { at: [0, 0.4, 0], segments: 8 });
  return b.finish(spinner());
}

const SAND_EDGE = [[-13, -26], [-10, -22], [-11, -12], [-9, -2], [-10.5, 10], [-9.5, 20], [-12, 26], [14, 26], [12, 18], [15, 8], [13, -4], [15, -14], [12, -22], [14, -26]];

// A stretch of Juhu-style sand, up to the sea on its -x side, with everything that sells on it.
export function chowpatty(b) {
  b.plate(SAND_EDGE.map(([x, z]) => [x, -z]), 0.1, SAND, { at: [0, 0.07, 0], turn: [-Math.PI / 2, 0, 0] });
  for (const [x, z, w, d] of [[2, -8, 9, 7], [-4, 9, 8, 9], [5, 12, 7, 6]]) b.cyl(1, 0.03, "#cfa96e", { at: [x, 0.13, z], scale: [w / 2, 1, d / 2], segments: 12 });
  const umbrellas = [[-6, -15, 0], [-2, -18, 1], [3, -12, 2], [6, -18, 3], [-8, 4, 1], [-4, 15, 2], [1, 20, 0], [7, 4, 3]];
  for (const [x, z, index] of umbrellas) {
    b.within({ at: [x, 0.1, z] }, (inner) => {
      umbrella(inner, index);
      inner.box(0.5, 0.24, 1.4, "#3f6fb5", { at: [1.1, 0.14, 0.2] });
    });
  }
  b.within({ at: [8.5, 0.1, -2], turn: [0, -Math.PI / 2, 0] }, bhelCart);
  b.within({ at: [8.5, 0.1, 9], turn: [0, -Math.PI / 2, 0] }, kulfiCart);
  const ride = merryGo(forge());
  ride.position.set(-1, 0.1, -3);
  const kites = [[-8, 13, -8], [-2, 16, 6], [-11, 12, 14]].map(([x, y, z], index) => {
    const flying = kite(index);
    flying.position.set(x, y, z);
    return flying;
  });
  return b.finish(ride, ...kites);
}

export function kulfi(b) {
  // A pickup, so it is big and plain: a tapered kulfi on a stick, with a band of pistachio.
  b.box(0.1, 0.5, 0.05, "#c9a36b", { at: [0, 0.25, 0] });
  b.lathe([[0.04, 0.42], [0.26, 0.5], [0.3, 0.72], [0.24, 1.1], [0.16, 1.36], [0.001, 1.42]], "#f7e3a8", { segments: 10 });
  b.lathe([[0.31, 0.72], [0.285, 0.92]], "#7cb342", { segments: 10 });
  for (const [x, y] of [[0.15, 1.2], [-0.12, 1.28], [0.02, 1.34]]) b.ball(0.04, "#c0392b", { detail: 0, at: [x, y, 0.1] });
  return b;
}

function seaTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const pen = canvas.getContext("2d");
  const gradient = pen.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#1c4f6e");
  gradient.addColorStop(0.5, "#235e74");
  gradient.addColorStop(1, "#1c4f6e");
  pen.fillStyle = gradient;
  pen.fillRect(0, 0, 512, 512);
  let seed = 3;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 620; i += 1) {
    const x = next() * 512;
    const y = next() * 512;
    const length = 14 + next() * 60;
    pen.strokeStyle = ["rgba(160,214,224,0.24)", "rgba(255,196,130,0.34)", "rgba(10,42,66,0.4)"][i % 3];
    pen.lineWidth = 1 + next() * 2.4;
    pen.beginPath();
    pen.moveTo(x, y);
    pen.quadraticCurveTo(x + length / 2, y - 3, x + length, y);
    pen.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

// The far side of the bay, painted on a curved band: towers, and the necklace of lamps along their feet.
function necklaceBand() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 256;
  const pen = canvas.getContext("2d");
  let seed = 7;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let x = 0; x < 2048;) {
    // The skyline climbs towards one end, like the towers at Nariman Point. Dusk flattens it to shapes.
    const climb = Math.max(0, 1 - Math.abs(x / 1400 - 1));
    const width = 12 + next() * 26;
    const height = 18 + next() * 26 + climb * climb * climb * 140 * (0.6 + next() * 0.5);
    const tone = ["#7d5a86", "#73527f", "#88628a"][Math.floor(next() * 3)];
    const body = pen.createLinearGradient(0, 222 - height, 0, 222);
    body.addColorStop(0, tone);
    body.addColorStop(1, "#a86a76");
    pen.fillStyle = body;
    pen.fillRect(x, 222 - height, width, height);
    for (let y = 222 - height + 5; y < 216; y += 7) {
      for (let wx = x + 2; wx < x + width - 2; wx += 5) {
        if (next() < 0.3) {
          pen.fillStyle = next() < 0.85 ? "rgba(255,214,146,0.85)" : "rgba(200,232,255,0.7)";
          pen.fillRect(wx, y, 2, 3);
        }
      }
    }
    x += width + next() * 5;
  }
  for (let x = 0; x < 2048; x += 7) {
    const y = 226 + Math.sin(x / 300) * 2;
    const glow = pen.createRadialGradient(x, y, 0, x, y, 6);
    glow.addColorStop(0, "rgba(255,226,150,1)");
    glow.addColorStop(0.4, "rgba(255,180,84,0.65)");
    glow.addColorStop(1, "rgba(255,160,60,0)");
    pen.fillStyle = glow;
    pen.fillRect(x - 6, y - 6, 12, 12);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Faces the view: straight ahead for a side-on game, and off to the seaward side for a runner.
function bay(facing) {
  const span = 2.6;
  const radius = 330;
  const geometry = new THREE.CylinderGeometry(radius, radius, 46, 40, 1, true, -span / 2 + Math.PI + facing, span);
  const band = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: necklaceBand(), side: THREE.BackSide, transparent: true, fog: false, depthWrite: false }));
  band.position.y = 21;
  band.userData.keepMaterial = true;
  band.userData.flat = true;
  return band;
}

// The sea and the bay. kind says which way the view looks, so the water always lies on the far side
// of the wall: to the left of a runner, and behind everything in a side-on or arena game.
export function seafrontBackdrop(kind, { dress, onFrame, proc }) {
  const group = new THREE.Group();
  const texture = seaTexture();
  const size = 900;
  texture.repeat.set(size / 26, size / 26);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.38, metalness: 0.15 }));
  water.rotation.x = -Math.PI / 2;
  const shore = kind === "strip" ? 9.8 : kind === "layers" ? 10 : 16;
  if (kind === "strip") water.position.set(-shore - size / 2, 0.05, 0);
  else water.position.set(0, 0.05, -shore - size / 2);
  water.receiveShadow = true;
  water.userData.flat = true;
  group.add(dress(water));
  group.add(bay(kind === "strip" ? 0.86 : 0));
  // The sun going down over the water, a little to seaward of the view.
  const sun = halo(90, "#ffd9a0");
  const heading = kind === "strip" ? -0.66 : -0.25;
  sun.position.set(Math.sin(heading) * 300, 26, -Math.cos(heading) * 300);
  group.add(sun);
  onFrame((dt, elapsed) => {
    texture.offset.set(Math.sin(elapsed * 0.11) * 0.03, elapsed * 0.012);
  });
  if (kind === "ring") {
    // No looping scenery in an arena, so the wall and its rocks are set down once.
    for (let x = -68; x <= 68; x += 34) {
      const wall = proc("proc:seawall");
      wall.rotation.y = Math.PI / 2;
      wall.position.set(x, 0, -shore + 0.4);
      const rocks = proc("proc:tetrapods");
      rocks.rotation.y = -Math.PI / 2;
      rocks.position.set(x, 0, -shore - 1.6);
      group.add(wall, rocks);
    }
    for (const x of [-22, -7, 7, 22]) {
      const light = proc("proc:lamp");
      light.position.set(x, 0, -shore + 1.2);
      light.rotation.y = -Math.PI / 2;
      group.add(light);
    }
  }
  return group;
}

