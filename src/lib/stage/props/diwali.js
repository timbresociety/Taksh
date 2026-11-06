// Diwali night: oil lamps, rangoli, marigolds and lanterns, and the crackers that go with them.
import { part } from "./forge.js";
import { flames, halo, lightPool, sparks } from "./fire.js";
import { RANGOLI_COUNT, rangoliArt, signboard } from "./paint.js";
import { cart } from "./mumbai.js";

const CLAY = "#b5582c";
const MARIGOLD = ["#ff9d13", "#ffc21f", "#ff7a12"];
const LEAF = "#2f8f3f";
const BAMBOO = "#c4a15e";
const BULBS = ["#ffd98a", "#ffd98a", "#ff7a4a", "#7cff9b", "#ffd98a", "#ff6fa8", "#8fd6ff"];

function bowl(b) {
  b.lathe([[0.001, 0], [0.05, 0.002], [0.078, 0.03], [0.08, 0.05], [0.066, 0.05], [0.045, 0.02], [0.001, 0.018]], CLAY, { segments: 10 });
  // The pinched lip the wick lies on.
  b.cone(0.03, 0.06, CLAY, { segments: 6, at: [0.08, 0.04, 0], turn: [0, 0, -Math.PI / 2], scale: [1, 1, 0.6] });
  b.cyl(0.06, 0.006, "#d7a53a", { at: [0, 0.04, 0], segments: 8 });
}

export function diya(b) {
  bowl(b);
  return b.finish(flames([[0.09, 0.06, 0]], 0.13));
}

// A ring of diyas around a marigold, the way they are set out on a doorstep.
export function diyaRing(b, count = 7) {
  const places = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const [x, z] = [Math.cos(angle) * 0.46, Math.sin(angle) * 0.46];
    b.within({ at: [x, 0, z], turn: [0, -angle, 0], scale: 1.5 }, bowl);
    places.push([x + Math.cos(angle) * 0.13, 0.09, z + Math.sin(angle) * 0.13]);
  }
  for (let i = 0; i < 8; i += 1) b.ball(0.05, MARIGOLD[i % 3], { detail: 0, at: [Math.cos(i * 0.785) * 0.16, 0.04, Math.sin(i * 0.785) * 0.16] });
  b.ball(0.08, "#ff5a1f", { at: [0, 0.05, 0] });
  return b.finish(flames(places, 0.2), lightPool(1.5, "#ffa64a", 0.5));
}

export function rangoli(b, index = 0) {
  b.card(2.6, 2.6, rangoliArt(index % RANGOLI_COUNT), { at: [0, 0.045, 0], turn: [-Math.PI / 2, 0, 0], lying: true });
  // Diyas around the rim keep it readable in the dark.
  const places = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const [x, z] = [Math.cos(angle) * 1.46, Math.sin(angle) * 1.46];
    b.within({ at: [x, 0, z], turn: [0, -angle, 0], scale: 1.4 }, bowl);
    places.push([x + Math.cos(angle) * 0.12, 0.08, z + Math.sin(angle) * 0.12]);
  }
  return b.finish(flames(places, 0.2), lightPool(2.4, "#ffb45a", 0.28));
}

const hang = (x0, x1, y, sag, t) => [x0 + (x1 - x0) * t, y - sag * 4 * t * (1 - t)];

// A line of marigolds with mango leaves, swagged between two points.
function garland(b, x0, x1, y, sag, z = 0, count = 26) {
  for (let i = 0; i <= count; i += 1) {
    const [x, at] = hang(x0, x1, y, sag, i / count);
    b.ball(0.085, MARIGOLD[i % 3], { detail: 0, at: [x, at, z] });
    if (i % 3 === 0) b.box(0.05, 0.24, 0.02, LEAF, { at: [x, at - 0.17, z], turn: [0, 0, 0.1] });
  }
}

function bulbs(b, from, to, count) {
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    b.ball(0.05, BULBS[i % BULBS.length], { detail: 0, glow: true, at: from.map((value, axis) => value + (to[axis] - value) * t) });
  }
}

function kandilBody(b, first, second, y) {
  // Two pyramids of paper around a lit middle: the shape every Maharashtrian balcony hangs out.
  b.cone(0.26, 0.28, first, { segments: 8, at: [0, y + 0.2, 0], glow: true });
  b.cone(0.26, 0.28, second, { segments: 8, at: [0, y - 0.2, 0], turn: [Math.PI, 0, 0], glow: true });
  b.cyl(0.27, 0.12, "#fff0b8", { segments: 8, at: [0, y, 0], glow: true });
  for (const x of [-0.14, -0.05, 0.05, 0.14]) b.box(0.04, 0.44, 0.012, x > 0 ? first : second, { at: [x, y - 0.58, 0], glow: true });
}

const KANDIL_COLOURS = [["#ff3b5c", "#ff9d13"], ["#ffc21f", "#ff5a1f"], ["#ff4fa8", "#8b5cf6"], ["#21d09a", "#ffc21f"]];

export function kandilPost(b, index = 0) {
  const [first, second] = KANDIL_COLOURS[index % KANDIL_COLOURS.length];
  b.cyl(0.05, 4.2, BAMBOO, { top: 0.04, at: [0, 2.1, 0], segments: 7 });
  b.box(1.1, 0.05, 0.05, BAMBOO, { at: [0.45, 4.05, 0] });
  b.box(0.012, 0.3, 0.012, "#3a2a1a", { at: [0.86, 3.9, 0] });
  b.within({ at: [0.86, 0, 0] }, (inner) => kandilBody(inner, first, second, 3.5));
  const light = halo(1.9, "#ffa24a");
  light.position.set(0.86, 3.5, 0);
  const pool = lightPool(2, "#ff9a4a", 0.3);
  pool.position.set(0.5, 0.05, 0);
  return b.finish(light, pool);
}

// Bamboo posts either side of the street, with marigold swags and lamps strung over the road between.
export function festoon(b) {
  // It spans the road, so all of it has to clear a runner on a train roof and the camera behind them.
  const half = 5.6;
  const height = 9.4;
  for (const x of [-half, half]) {
    b.cyl(0.09, height, BAMBOO, { top: 0.06, at: [x, height / 2, 0], segments: 7 });
    for (const y of [1.6, 3.4, 5.2, 7]) b.cyl(0.1, 0.04, "#8f6f3a", { at: [x, y, 0], segments: 7 });
    for (const [dz, turn] of [[-0.4, 0.5], [0.4, -0.5]]) b.box(0.12, 0.42, 0.03, LEAF, { at: [x, height + 0.1, dz * 0.4], turn: [turn, 0, 0] });
  }
  garland(b, -half, half, height - 0.3, 1, 0, 44);
  garland(b, -half, half, height - 0.8, 1.4, 0.06, 44);
  for (let i = 0; i <= 28; i += 1) {
    const [x, y] = hang(-half, half, height - 0.1, 0.7, i / 28);
    b.ball(0.06, BULBS[i % BULBS.length], { detail: 0, glow: true, at: [x, y, -0.05] });
  }
  // Lanterns hang outside the lanes. One over the road fills the view as the camera reaches it.
  for (const [i, x] of [-4.7, 4.7].entries()) {
    const [first, second] = KANDIL_COLOURS[i];
    b.within({ at: [x, 0, 0] }, (inner) => kandilBody(inner, first, second, 7.2));
  }
  return b;
}

export function toranDoor(b) {
  b.slab(-1.2, -1.06, 0, 2.7, -0.07, 0.07, "#6d4a28");
  b.slab(1.06, 1.2, 0, 2.7, -0.07, 0.07, "#6d4a28");
  b.slab(-1.3, 1.3, 2.7, 2.86, -0.1, 0.1, "#6d4a28");
  garland(b, -1.2, 1.2, 2.66, 0.2, 0.1, 16);
  for (const x of [-1.13, 1.13]) for (let y = 0.3; y < 2.6; y += 0.17) b.ball(0.07, MARIGOLD[Math.floor(y * 6) % 3], { detail: 0, at: [x, y, 0.1] });
  return b;
}

// Strung along the eaves and gables of a village house of the given number of storeys. The warm block
// inside shows through the kit's open windows, so every room looks lit.
export function houseLights(b, storeys = 1) {
  const eaves = storeys * 3.1;
  b.box(3.7, eaves - 0.3, 5.7, "#a8652c", { at: [0, eaves / 2, 0], glow: true });
  for (const x of [-2.5, 2.5]) bulbs(b, [x, eaves + 0.1, -3.2], [x, eaves + 0.1, 3.2], 22);
  for (const z of [-3.42, 3.42]) {
    bulbs(b, [-2.6, eaves + 0.08, z], [0, eaves + 2.32, z], 13);
    bulbs(b, [2.6, eaves + 0.08, z], [0, eaves + 2.32, z], 13);
    bulbs(b, [-2.6, eaves + 0.06, z], [2.6, eaves + 0.06, z], 18);
  }
  garland(b, -1.3, 1.3, 2.9, 0.26, 3.5, 18);
  return b;
}

// Red crackers in a long plait, hung from a stand with the tail just catching.
export function ladi(b) {
  b.cyl(0.04, 2.5, BAMBOO, { at: [0, 1.25, 0], segments: 6 });
  b.box(0.8, 0.05, 0.05, BAMBOO, { at: [0.3, 2.46, 0] });
  for (let i = 0; i < 24; i += 1) {
    const y = 2.4 - i * 0.075;
    for (const side of [-1, 1]) b.box(0.15, 0.036, 0.036, i % 4 === 0 ? "#ffd23f" : "#d8231f", { at: [0.62 + side * 0.08, y, 0], turn: [0, 0, side * 0.55] });
  }
  b.cyl(0.012, 1.8, "#3a2a1a", { at: [0.62, 1.5, 0], segments: 4 });
  const fizz = sparks({ count: 40 });
  fizz.position.set(0.62, 0.56, 0);
  fizz.scale.setScalar(0.4);
  return b.finish(fizz);
}

export function anaar(b) {
  // The flowerpot firework: a clay cone that throws up a fountain of sparks.
  b.cyl(0.17, 0.34, "#c9402a", { top: 0.06, at: [0, 0.17, 0], segments: 10 });
  b.cyl(0.16, 0.08, "#ffd23f", { top: 0.135, at: [0, 0.1, 0], segments: 10 });
  const fountain = sparks({ count: 130 });
  fountain.position.y = 0.34;
  return b.finish(fountain, lightPool(1.8, "#ffc05a", 0.45), halo(1.3, "#ffb04a"));
}

export function chakri(b) {
  const wheel = part((inner) => {
    inner.torus(0.13, 0.03, "#2fb35c", { at: [0, 0, 0], turn: [Math.PI / 2, 0, 0], segments: 14, sides: 5 });
    inner.torus(0.08, 0.025, "#ffd23f", { at: [0, 0, 0], turn: [Math.PI / 2, 0, 0], segments: 12, sides: 5 });
    inner.cyl(0.03, 0.05, "#d8231f", { segments: 6 });
  });
  wheel.position.y = 0.06;
  wheel.scale.setScalar(2);
  wheel.userData.spin = [0, 16, 0];
  b.cyl(0.05, 0.01, "#544", { at: [0, 0.005, 0], segments: 6 });
  return b.finish(wheel, sparks({ spin: true, count: 110 }), lightPool(1.3, "#ffd05a", 0.4));
}

export function crackerBoxes(b) {
  const labels = [["#d8231f", "#ffd23f"], ["#2f6bff", "#ffd23f"], ["#21a07a", "#ff5a7a"], ["#ffb300", "#c0141b"], ["#8b3df0", "#fff"]];
  const stack = [[-0.56, 0, 0.74, 0.34, 0.66], [0.42, 0, 0.92, 0.42, 0.74], [-0.42, 0.34, 0.62, 0.3, 0.56], [0.4, 0.42, 0.74, 0.34, 0.62], [0, 0.72, 0.84, 0.26, 0.58]];
  stack.forEach(([x, y, w, h, d], i) => {
    const [body, band] = labels[i];
    const turn = [0, (i - 2) * 0.09, 0];
    b.box(w, h, d, body, { at: [x, y + h / 2, 0], turn });
    b.box(w + 0.01, h * 0.3, d + 0.01, band, { at: [x, y + h / 2, 0], turn });
  });
  return b;
}

export function sutliBomb(b) {
  // A hazard, so it is drawn to be recognised at speed: a twine-bound ball with a burning fuse.
  b.ball(0.5, "#b08a5a", { at: [0, 0.5, 0] });
  for (let i = 0; i < 5; i += 1) {
    b.torus(0.5, 0.034, "#5a3d1f", { at: [0, 0.5, 0], turn: [Math.PI / 2 + (i - 2) * 0.36, 0, 0], segments: 18, sides: 4 });
    b.torus(0.5, 0.034, "#6e4d28", { at: [0, 0.5, 0], turn: [0, (i - 2) * 0.36, 0], segments: 18, sides: 4 });
  }
  b.tube([[0, 0.98, 0], [0.08, 1.14, 0.02], [0.2, 1.2, 0]], 0.022, "#2a1d12", { steps: 5 });
  return b.finish(flames([[0.2, 1.22, 0]], 0.3));
}

export function kandilStall(b) {
  cart(b, { width: 2.1, canopy: ["#d8231f", "#ffc21f"], sign: signboard({ name: "kandil", text: "AKASH KANDIL", sub: "आकाश कंदील", bg: "#ffc21f", ink: "#a20f14" }) });
  for (const [i, x] of [-0.7, 0, 0.7].entries()) b.within({ at: [x, 0.02, 0.4], scale: 0.8 }, (inner) => kandilBody(inner, ...KANDIL_COLOURS[i], 2.26));
  for (let i = 0; i < 5; i += 1) b.box(0.3, 0.3, 0.3, KANDIL_COLOURS[i % 4][0], { at: [-0.7 + i * 0.34, 1.13, -0.2], turn: [0, 0.4 * i, 0] });
  return b;
}

const SWEETS = ["#f7c6d9", "#ffe28a", "#fff7e8", "#a6d98a", "#e8a24a", "#c96a2c"];

export function mithaiStall(b) {
  cart(b, { width: 2.4, canopy: ["#8b1a4f", "#ffc21f"], sign: signboard({ name: "mithai", text: "MITHAI", sub: "दिवाळी फराळ", bg: "#8b1a4f", ink: "#ffe28a", border: "#ffc21f" }) });
  // Trays of sweets, in pyramids, because a stall is sold by its stacks.
  for (let t = 0; t < 4; t += 1) {
    const x = -0.84 + t * 0.56;
    b.box(0.5, 0.03, 0.74, "#d8dade", { at: [x, 1, 0], metal: true });
    for (let i = 0; i < 9; i += 1) b.ball(0.07, SWEETS[(t + (i % 2)) % SWEETS.length], { detail: 0, at: [x - 0.14 + (i % 3) * 0.14, 1.06, -0.2 + Math.floor(i / 3) * 0.2] });
    for (let i = 0; i < 4; i += 1) b.ball(0.07, SWEETS[(t + 1) % SWEETS.length], { detail: 0, at: [x - 0.07 + (i % 2) * 0.14, 1.16, -0.1 + Math.floor(i / 2) * 0.2] });
    b.ball(0.07, SWEETS[(t + 2) % SWEETS.length], { detail: 0, at: [x, 1.26, 0] });
  }
  return b;
}
