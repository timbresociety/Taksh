// A Mumbai street, modelled from memory of the real thing rather than from any one vehicle or brand.
// Vehicles point their nose at -z, so a runner sees their tails. Stalls and buildings face +z.
import { hazardStripes, numberPlate, routeBoard, signboard } from "./paint.js";
import { coach } from "./rails.js";

const WHEEL = "#1c1d21";
const HUB = "#8d9099";
const CHROME = "#c9ced6";
const GLASS = "#22323f";
const TAXI_YELLOW = "#f6c21c";

function wheel(b, x, y, z, radius, width = 0.18) {
  b.cyl(radius, width, WHEEL, { at: [x, y, z], turn: [0, 0, Math.PI / 2], segments: 12 });
  b.cyl(radius * 0.5, width + 0.02, HUB, { at: [x, y, z], turn: [0, 0, Math.PI / 2], segments: 8 });
}

export function cone(b) {
  b.box(0.42, 0.04, 0.42, "#18181c", { at: [0, 0.02, 0] });
  b.cyl(0.17, 0.62, "#ff6a13", { top: 0.035, at: [0, 0.35, 0] });
  b.cyl(0.118, 0.13, "#f5f5f0", { top: 0.082, at: [0, 0.36, 0], segments: 10 });
  return b;
}

// Three cones and a striped pole: low enough to jump, wide enough to fill a lane.
export function cones(b) {
  for (const x of [-0.8, 0, 0.8]) {
    b.box(0.36, 0.04, 0.36, "#18181c", { at: [x, 0.02, 0] });
    b.cyl(0.15, 0.82, "#ff6a13", { top: 0.03, at: [x, 0.45, 0] });
    b.cyl(0.105, 0.16, "#f5f5f0", { top: 0.075, at: [x, 0.46, 0] });
  }
  b.card(1.7, 0.16, hazardStripes("barrier", "#ffd21f", "#17171b", { slant: 48 }), { at: [0, 0.78, 0.09] });
  b.box(1.7, 0.14, 0.05, "#ffd21f", { at: [0, 0.78, 0.05] });
  return b;
}

export function barricade(b) {
  const stripes = hazardStripes("roadworks", "#f4f1e8", "#d8231f", { slant: 64 });
  for (const y of [0.92, 0.52]) {
    b.box(1.9, 0.26, 0.05, "#f4f1e8", { at: [0, y, 0] });
    for (const face of [-1, 1]) b.card(1.9, 0.26, stripes, { at: [0, y, face * 0.03], turn: [0, face > 0 ? 0 : Math.PI, 0] });
  }
  for (const x of [-0.82, 0.82]) {
    b.box(0.08, 1.06, 0.08, "#c2bdb0", { at: [x, 0.53, 0] });
    b.box(0.09, 0.09, 0.8, "#2c2d33", { at: [x, 0.045, 0] });
    b.box(0.34, 0.14, 0.46, "#b08a5a", { at: [x, 0.16, 0.2] });
  }
  return b;
}

// The "work in progress" board that stands in front of every dug-up road in the city.
export function board(b) {
  const words = signboard({ name: "kaam", text: "KAAM CHALU HAI", sub: "काम चालू है", bg: "#ffd21f", ink: "#c0141b", border: "#17171b", width: 512, height: 320 });
  const stripes = hazardStripes("board", "#ffd21f", "#17171b", { slant: 48 });
  b.box(2.1, 1.34, 0.1, "#ffd21f", { at: [0, 1.7, 0] });
  for (const face of [-1, 1]) {
    b.card(2.04, 1.28, words, { at: [0, 1.7, face * 0.06], turn: [0, face > 0 ? 0 : Math.PI, 0] });
    b.card(2.1, 0.3, stripes, { at: [0, 0.82, face * 0.03], turn: [0, face > 0 ? 0 : Math.PI, 0] });
  }
  b.box(2.1, 0.3, 0.05, "#ffd21f", { at: [0, 0.82, 0] });
  for (const x of [-0.9, 0.9]) {
    b.box(0.1, 2.44, 0.1, "#3a3b42", { at: [x, 1.22, -0.02] });
    b.box(0.12, 0.1, 1.1, "#3a3b42", { at: [x, 0.05, 0] });
    for (const z of [-0.36, 0.36]) b.box(0.42, 0.2, 0.3, "#b08a5a", { at: [x, 0.2, z] });
  }
  for (const x of [-0.9, 0.9]) b.ball(0.09, "#ff3b1f", { at: [x, 2.5, 0], glow: true });
  return b;
}

const POTHOLE_RIM = [[-0.86, -0.1], [-0.6, -0.56], [-0.05, -0.68], [0.5, -0.6], [0.88, -0.2], [0.8, 0.32], [0.42, 0.66], [-0.2, 0.62], [-0.66, 0.46]];

function lying(b, points, scale, y, colour, options) {
  b.plate(points.map(([x, z]) => [x * scale, z * scale]), 0.02, colour, { at: [0, y, 0], turn: [-Math.PI / 2, 0, 0], ...options });
}

function potholeBase(b) {
  lying(b, POTHOLE_RIM, 1.08, 0.05, "#6b6a68");
  lying(b, POTHOLE_RIM, 0.96, 0.064, "#26262a");
  lying(b, POTHOLE_RIM, 0.74, 0.078, "#121215");
  // Crumbled lumps of tarmac thrown up around the edge.
  for (const [x, z, r] of [[-0.84, 0.24, 0.1], [0.92, 0.12, 0.08], [0.3, -0.76, 0.09], [-0.42, -0.66, 0.07], [0.58, 0.68, 0.06]]) {
    b.ball(r, "#4d4c4c", { detail: 0, at: [x, 0.08, z], scale: [1.2, 0.6, 1] });
  }
}

export function pothole(b) {
  potholeBase(b);
  return b;
}

export function puddle(b) {
  potholeBase(b);
  lying(b, POTHOLE_RIM, 0.72, 0.09, "#6f8ea3", { metal: true });
  return b;
}

function cow(b, sitting) {
  const hide = "#efe8da";
  const belly = "#d8cdb9";
  const drop = sitting ? -0.56 : 0;
  b.ball(0.5, hide, { at: [0, 1 + drop, 0.12], scale: [0.86, 0.92, 1.72] });
  b.ball(0.26, belly, { at: [0, 0.82 + drop, 0.1], scale: [1.2, 0.8, 2.6] });
  // The hump and dewlap are what make it read as a zebu rather than a farmyard cow.
  b.ball(0.26, hide, { at: [0, 1.42 + drop, -0.42], scale: [0.9, 0.8, 1] });
  b.ball(0.22, hide, { at: [0, 1.22 + drop, -0.8], scale: [0.86, 1, 1.5] });
  b.ball(0.13, belly, { at: [0, 0.98 + drop, -0.84], scale: [0.5, 1.3, 1.5] });
  b.box(0.27, 0.3, 0.42, hide, { at: [0, 1.26 + drop, -1.08], turn: [0.4, 0, 0] });
  b.box(0.21, 0.17, 0.16, "#c9a48d", { at: [0, 1.15 + drop, -1.27], turn: [0.4, 0, 0] });
  b.ball(0.04, "#17120f", { at: [-0.135, 1.31 + drop, -1.14] });
  b.ball(0.04, "#17120f", { at: [0.135, 1.31 + drop, -1.14] });
  for (const x of [-1, 1]) {
    b.tube([[x * 0.1, 1.4 + drop, -1], [x * 0.2, 1.52 + drop, -1.02], [x * 0.2, 1.68 + drop, -0.98]], 0.032, "#57402c", { steps: 6 });
    b.box(0.2, 0.08, 0.12, hide, { at: [x * 0.22, 1.36 + drop, -0.94], turn: [0, 0, x * -0.4] });
  }
  // A marigold garland, the way street cows are often dressed.
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    b.ball(0.05, i % 2 ? "#ff9d13" : "#ffc21f", { detail: 0, at: [Math.cos(angle) * 0.2, 1.12 + drop + Math.sin(angle) * 0.2, -0.72] });
  }
  b.tube([[0, 1.24 + drop, 0.92], [0.06, 0.9 + drop, 1.02], [0.04, 0.54 + drop, 1]], 0.022, belly, { steps: 6 });
  b.ball(0.06, "#57402c", { at: [0.04, 0.5 + drop, 1], scale: [1, 1.6, 1] });
  for (const [x, z] of [[-0.24, -0.46], [0.24, -0.46], [-0.24, 0.68], [0.24, 0.68]]) {
    if (sitting) {
      b.box(0.17, 0.15, 0.56, belly, { at: [x * 1.4, 0.08, z * 0.94], turn: [0, x > 0 ? -0.22 : 0.22, 0] });
    } else {
      b.cyl(0.075, 0.8, hide, { top: 0.1, at: [x, 0.44, z] });
      b.cyl(0.08, 0.1, "#2a241f", { at: [x, 0.05, z] });
    }
  }
  return b;
}
export const cowStanding = (b) => cow(b, false);
export const cowSitting = (b) => cow(b, true);

// open leaves the back off, so whoever is driving can be seen from behind.
export function auto(b, { open = false } = {}) {
  const black = "#17181c";
  const shell = [[-1.32, 0.34], [-1.32, 0.72], [-1.14, 1.02], [-0.92, 1.02], [-0.72, 0.72], [0.34, 0.72], [0.42, 0.96], [1.26, 0.96], [1.3, 0.34]];
  b.profile(shell, 1.28, black);
  b.slab(-0.6, 0.6, 0.66, 0.74, -0.72, 0.42, "#2a2b30");
  // The driver's bench and passenger seat, which show through the open sides.
  b.slab(-0.54, 0.54, 0.72, 1, 0.4, 0.94, "#6b3b24");
  if (!open) b.slab(-0.54, 0.54, 0.98, 1.42, 0.86, 1.02, "#6b3b24");
  b.slab(-0.34, 0.34, 0.72, 0.96, -0.5, -0.16, "#6b3b24");
  // The yellow hood: a curved roof over the frame.
  const roof = [[-1.14, 1.54], [-0.9, 1.72], [1, 1.74], [1.3, 1.56], [1.3, 1.5], [-1.14, 1.48]];
  b.profile(roof, 1.3, TAXI_YELLOW);
  if (open) for (const x of [-0.6, 0.6]) b.box(0.06, 0.54, 0.06, TAXI_YELLOW, { at: [x, 1.23, 1.24] });
  else {
    b.profile([[0.44, 0.96], [0.44, 1.5], [1.28, 1.5], [1.28, 0.96]], 1.26, TAXI_YELLOW);
    b.slab(-0.34, 0.34, 1.12, 1.42, 1.27, 1.31, GLASS);
  }
  for (const x of [-0.62, 0.62]) {
    b.box(0.05, 0.56, 0.05, black, { at: [x, 1.26, -1.03], turn: [0.34, 0, 0] });
    b.box(0.05, 0.8, 0.05, black, { at: [x, 1.12, 0.42] });
  }
  b.box(1.16, 0.46, 0.03, "#7fa6b6", { at: [0, 1.28, -1.03], turn: [0.34, 0, 0] });
  b.box(0.9, 0.05, 0.05, CHROME, { at: [0, 1.06, -0.9] });
  b.cyl(0.085, 0.06, "#ffe9a8", { at: [0, 0.86, -1.34], turn: [Math.PI / 2, 0, 0], glow: true });
  // Three wheels: one under the nose, two at the back.
  b.slab(-0.14, 0.14, 0.44, 0.56, -1.32, -0.9, black);
  wheel(b, 0, 0.23, -1.08, 0.23, 0.13);
  for (const x of [-0.62, 0.62]) wheel(b, x, 0.23, 0.72, 0.23, 0.14);
  for (const x of [-0.54, 0.54]) b.box(0.13, 0.07, 0.03, "#ff3a2c", { at: [x, 0.72, 1.31], glow: true });
  b.card(0.5, 0.17, numberPlate("auto", "MH 02 R 7421"), { at: [0, 0.5, 1.315] });
  return b;
}

export function taxi(b) {
  const black = "#141519";
  const body = [[-2, 0.34], [-2.02, 0.68], [-1.94, 0.82], [-1, 0.9], [1.28, 0.9], [2, 0.84], [2.04, 0.68], [2, 0.34]];
  b.profile(body, 1.56, black);
  // A boxy cabin, with its roof in taxi yellow and windows wrapped between the pillars.
  const cabin = [[-1, 0.9], [-0.54, 1.36], [0.84, 1.38], [1.3, 0.9]];
  b.profile(cabin, 1.36, GLASS);
  b.profile([[-0.6, 1.33], [-0.54, 1.42], [0.86, 1.44], [0.92, 1.33]], 1.42, TAXI_YELLOW);
  const pillars = [[[-1, 0.9], [-0.54, 1.38], [-0.42, 1.38], [-0.86, 0.9]], [[0.06, 0.9], [0.06, 1.38], [0.18, 1.38], [0.18, 0.9]], [[1.16, 0.9], [0.72, 1.38], [0.84, 1.38], [1.3, 0.9]]];
  for (const pillar of pillars) b.profile(pillar, 1.4, TAXI_YELLOW);
  for (const x of [-1, 1]) b.box(0.03, 0.05, 2.1, CHROME, { at: [x * 0.79, 0.7, 0] });
  for (const z of [-2.06, 2.06]) b.box(1.58, 0.1, 0.08, CHROME, { at: [0, 0.48, z] });
  // The upright grille and round lamps give the 1960s saloon away from any distance.
  b.box(0.74, 0.2, 0.04, CHROME, { at: [0, 0.68, -2.03] });
  for (const x of [-0.58, 0.58]) {
    b.cyl(0.1, 0.04, "#ffeeb0", { at: [x, 0.7, -2.03], turn: [Math.PI / 2, 0, 0], glow: true });
    b.box(0.16, 0.2, 0.03, "#ff3a2c", { at: [x, 0.7, 2.05], glow: true });
  }
  b.card(0.5, 0.16, numberPlate("taxi", "MH 01 T 3360"), { at: [0, 0.68, 2.05] });
  for (const z of [-1.26, 1.3]) for (const x of [-0.68, 0.68]) wheel(b, x, 0.31, z, 0.31, 0.2);
  return b;
}

export function bus(b) {
  const red = "#c8201f";
  const cream = "#f2e6c8";
  const [x, len] = [1.25, 4.8];
  b.slab(-x, x, 0.42, 1.06, -len, len, red);
  b.slab(-x, x, 1.06, 1.14, -len, len, cream);
  b.slab(-x + 0.05, x - 0.05, 1.14, 2.02, -len + 0.05, len - 0.05, GLASS);
  b.slab(-x, x, 2.02, 2.42, -len, len, red);
  b.slab(-x, x, 2.42, 2.5, -len, len, cream);
  b.slab(-x + 0.05, x - 0.05, 2.5, 3.3, -len + 0.05, len - 0.05, GLASS);
  b.slab(-x, x, 3.3, 3.96, -len, len, red);
  b.slab(-x + 0.08, x - 0.08, 3.96, 4.06, -len + 0.08, len - 0.08, "#e3dccb");
  // Pillars between the windows, on both decks, so the glass reads as separate panes.
  for (let z = -len; z <= len + 0.01; z += 1.2) {
    for (const side of [-1, 1]) {
      b.slab(side * x - 0.03, side * x + 0.03, 1.14, 2.02, z - 0.07, z + 0.07, red);
      b.slab(side * x - 0.03, side * x + 0.03, 2.5, 3.3, z - 0.07, z + 0.07, red);
    }
  }
  for (const y of [1.58, 2.9]) for (const side of [-1, 1]) b.slab(side * x - 0.01, side * x + 0.01, y - 0.02, y + 0.02, -len, len, "#d7d7d7");
  // A dark doorway at the back left and the front left.
  for (const z of [-3.9, 3.6]) b.slab(-x - 0.02, -x + 0.02, 0.5, 2, z - 0.55, z + 0.55, "#14171c");
  for (const z of [-len - 0.02, len + 0.02]) {
    b.slab(-x, x, 1.14, 2.02, z - 0.02, z + 0.02, "#2a3a46");
    b.slab(-0.04, 0.04, 1.14, 2.02, z - 0.03, z + 0.03, red);
    b.card(0.9, 0.34, routeBoard("bus", "123  LIMITED"), { at: [0, 2.2, z + Math.sign(z) * 0.03], turn: [0, z > 0 ? 0 : Math.PI, 0] });
  }
  for (const side of [-1, 1]) b.box(0.24, 0.16, 0.04, "#ffeeb0", { at: [side * 0.94, 0.72, -len - 0.02], glow: true });
  for (const side of [-1, 1]) b.box(0.2, 0.3, 0.04, "#ff3a2c", { at: [side * 0.98, 0.8, len + 0.02], glow: true });
  b.slab(-x, x, 0.34, 0.5, -len - 0.04, len + 0.04, "#23252b");
  for (const z of [-2.9, 3.1]) for (const side of [-1, 1]) wheel(b, side * (x - 0.14), 0.5, z, 0.5, 0.26);
  return b;
}

export function localTrain(b) {
  coach(b, { lower: "#7a1f26", belt: "#efe2bf", upper: "#7a1f26", band: "#f4c21c", roof: "#a9a59a", rib: "#8f8c82", inside: "#3b4a48", route: routeBoard("local", "ANDHERI  SLOW") });
  return b;
}

// A hand cart under a striped sheet: the common body of every street stall.
export function cart(b, { width, canopy, sign, shelf = "#b98a52" }) {
  const half = width / 2;
  const depth = 0.55;
  b.slab(-half, half, 0.62, 0.92, -depth, depth, shelf);
  b.slab(-half - 0.04, half + 0.04, 0.92, 0.98, -depth - 0.04, depth + 0.04, "#d8dade");
  b.slab(-half, half, 0.3, 0.62, -depth + 0.04, depth - 0.04, "#7a4f2c");
  b.slab(-half + 0.1, half - 0.1, 0.34, 0.86, depth - 0.01, depth + 0.01, "#ad7c45");
  for (const x of [-half + 0.28, half - 0.28]) wheel(b, x, 0.3, depth + 0.02, 0.3, 0.09);
  for (const x of [-half + 0.28, half - 0.28]) wheel(b, x, 0.3, -depth - 0.02, 0.3, 0.09);
  for (const [x, z] of [[-half + 0.05, -depth + 0.05], [half - 0.05, -depth + 0.05], [-half + 0.05, depth - 0.05], [half - 0.05, depth - 0.05]]) b.box(0.06, 1.46, 0.06, "#4a4d55", { at: [x, 1.66, z] });
  const stripes = Math.round(width / 0.32);
  for (let i = 0; i < stripes; i += 1) {
    const x0 = -half - 0.1 + ((width + 0.2) * i) / stripes;
    const x1 = -half - 0.1 + ((width + 0.2) * (i + 1)) / stripes;
    b.profile([[-depth - 0.3, 2.36], [0, 2.52], [depth + 0.5, 2.26], [depth + 0.5, 2.22], [0, 2.46], [-depth - 0.3, 2.3]], x1 - x0, canopy[i % 2], { at: [(x0 + x1) / 2, 0, 0] });
  }
  b.box(width * 0.92, 0.46, 0.05, "#fff", { at: [0, 2.04, depth + 0.4], scale: [1, 1, 1] });
  b.card(width * 0.92, 0.46, sign, { at: [0, 2.04, depth + 0.43] });
  b.card(width * 0.92, 0.46, sign, { at: [0, 2.04, depth + 0.37], turn: [0, Math.PI, 0] });
}

export function vadaStall(b) {
  cart(b, { width: 2.2, canopy: ["#ffb300", "#d8231f"], sign: signboard({ name: "vada", text: "VADA PAV", sub: "वडा पाव", bg: "#ffb300", ink: "#a20f14" }) });
  // The deep black kadhai, with vadas frying in it.
  b.lathe([[0.001, 0.98], [0.3, 1], [0.48, 1.12], [0.52, 1.22], [0.5, 1.22], [0.3, 1.08], [0.001, 1.08]], "#1b1b1f", { at: [-0.5, 0, 0], segments: 16 });
  b.cyl(0.46, 0.02, "#b5791c", { at: [-0.5, 1.17, 0], segments: 14 });
  for (const [x, z] of [[-0.68, 0.1], [-0.44, -0.14], [-0.36, 0.16], [-0.62, -0.14]]) b.ball(0.09, "#c98a2a", { at: [x, 1.2, z], scale: [1, 0.85, 1] });
  b.cyl(0.15, 0.26, "#3a3b42", { top: 0.2, at: [-0.5, 0.86, 0], segments: 8 });
  // A heap of pav on one side and a tray of finished vadas on the other.
  b.box(0.7, 0.05, 0.5, "#d8dade", { at: [0.5, 1.01, 0], metal: true });
  for (const [x, z, y] of [[0.3, -0.12, 0], [0.5, -0.12, 0], [0.7, -0.12, 0], [0.3, 0.12, 0], [0.5, 0.12, 0], [0.7, 0.12, 0], [0.4, 0, 0.12], [0.6, 0, 0.12]]) b.ball(0.11, "#e6b673", { detail: 1, at: [x, 1.1 + y, z], scale: [1, 0.72, 1] });
  return b;
}

export function bhajiStall(b) {
  cart(b, { width: 2.5, canopy: ["#1f8f5f", "#f4efe2"], sign: signboard({ name: "bhaji", text: "PAV BHAJI", sub: "पाव भाजी", bg: "#1f8f5f", ink: "#fff6d8", border: "#0e3a27" }) });
  // The big tawa is the whole stall: a wide shallow steel pan, bhaji heaped in the middle.
  b.lathe([[0.001, 1.02], [0.72, 1.03], [0.86, 1.1], [0.88, 1.13], [0.85, 1.13], [0.7, 1.07], [0.001, 1.06]], "#a6abb3", { at: [-0.26, 0, 0], segments: 20, metal: true });
  b.lathe([[0.7, 1.07], [0.52, 1.1], [0.28, 1.2], [0.001, 1.24]], "#c8481c", { at: [-0.26, 0, 0], segments: 14 });
  for (const [x, z] of [[-0.42, 0.14], [-0.04, -0.2], [-0.52, -0.16]]) b.ball(0.05, "#7ba33a", { detail: 0, at: [x, 1.2, z] });
  b.ball(0.09, "#f7efd2", { detail: 0, at: [-0.26, 1.25, 0], scale: [1, 0.6, 1] });
  for (let i = 0; i < 6; i += 1) b.box(0.3, 0.09, 0.14, i % 2 ? "#d9984a" : "#e8b36b", { at: [0.86, 1.03 + (i % 3) * 0.1, -0.16 + Math.floor(i / 3) * 0.24], turn: [0, 0.12 * i, 0] });
  // Steel tins of butter and water, and the long spatula.
  for (const [x, r] of [[0.62, 0.1], [0.92, 0.09]]) b.cyl(r, 0.2, "#c9ced6", { at: [x, 1.06, 0.34], segments: 10, metal: true });
  b.box(0.05, 0.02, 0.5, "#8d9099", { at: [-0.1, 1.2, 0.36], turn: [0, 0.5, 0] });
  return b;
}

export function chaiStall(b) {
  const wood = "#8a5a32";
  b.slab(-0.8, 0.8, 0, 0.98, -0.5, 0.5, wood);
  b.slab(-0.86, 0.86, 0.98, 1.04, -0.56, 0.56, "#e4dcc8");
  b.slab(-0.78, 0.78, 0.1, 0.88, 0.5, 0.52, "#2e7fb0");
  b.slab(-0.8, -0.74, 1.04, 2.2, -0.5, -0.44, wood);
  b.slab(0.74, 0.8, 1.04, 2.2, -0.5, -0.44, wood);
  b.slab(-0.8, -0.74, 1.04, 2.2, 0.44, 0.5, wood);
  b.slab(0.74, 0.8, 1.04, 2.2, 0.44, 0.5, wood);
  b.profile([[-0.7, 2.28], [0.92, 2.14], [0.92, 2.2], [-0.7, 2.34]], 1.9, "#3f6f8c");
  const sign = signboard({ name: "chai", text: "CUTTING CHAI", sub: "कटिंग चाय", bg: "#2e7fb0", ink: "#fff6d8", border: "#0e2c3f" });
  b.box(1.6, 0.34, 0.04, "#2e7fb0", { at: [0, 2.0, 0.5] });
  b.card(1.56, 0.32, sign, { at: [0, 2.0, 0.53] });
  // A blackened kettle on a stove, and glasses set out in a row.
  b.cyl(0.13, 0.12, "#3a3b42", { at: [-0.4, 1.1, 0], segments: 8 });
  b.lathe([[0.001, 1.16], [0.17, 1.17], [0.2, 1.28], [0.14, 1.42], [0.05, 1.46], [0.001, 1.47]], "#6c6d73", { at: [-0.4, 0, 0], metal: true });
  b.tube([[-0.22, 1.26, 0], [-0.1, 1.34, 0], [-0.06, 1.42, 0]], 0.022, "#6c6d73", { steps: 5 });
  b.torus(0.12, 0.012, "#3a3b42", { at: [-0.4, 1.5, 0], arc: Math.PI, sides: 4, segments: 8 });
  for (let i = 0; i < 6; i += 1) b.cyl(0.03, 0.09, i % 2 ? "#a8622a" : "#c07a35", { top: 0.036, at: [0.08 + i * 0.1, 1.09, 0.22], segments: 7 });
  // The bench out front, where people stand and drink.
  b.slab(-0.7, 0.7, 0.42, 0.48, 1, 1.32, "#a3753f");
  for (const x of [-0.6, 0.6]) b.slab(x - 0.04, x + 0.04, 0, 0.42, 1.04, 1.28, "#6d4a28");
  return b;
}

// An electric pole, the wires it carries towards the next pole (span metres along -z), and the
// knot of cable drops that every Mumbai pole collects.
export function pole(b, span = 24) {
  const grey = "#7b7a74";
  const top = 7.6;
  b.cyl(0.13, top, grey, { top: 0.08, at: [0, top / 2, 0], segments: 8 });
  for (const y of [top - 0.5, top - 1.3]) {
    b.box(2.1, 0.09, 0.09, "#4a4b52", { at: [0, y, 0] });
    for (const x of [-0.95, -0.4, 0.4, 0.95]) b.cyl(0.04, 0.12, "#e4e0d2", { at: [x, y + 0.1, 0], segments: 6 });
  }
  b.box(0.5, 0.74, 0.3, "#5a6066", { at: [0, 3.2, 0.16] });
  b.box(0.54, 0.05, 0.34, "#3d4247", { at: [0, 3.6, 0.16] });
  const rand = (i) => Math.sin(i * 12.9898) * 0.5;
  for (const [i, x] of [-0.95, -0.4, 0.4, 0.95].entries()) {
    for (const [j, y] of [top - 0.38, top - 1.18].entries()) {
      b.tube([[x, y, 0], [x + 0.1, y - 0.5 - i * 0.05, -span * 0.3], [x - 0.05, y - 0.8 - j * 0.1, -span * 0.55], [x, y - 0.3, -span * 0.85], [x, y, -span]], 0.016, "#1f1f22", { steps: 12, sides: 3 });
    }
  }
  // The tangle: loops and drops hanging between the arms and the box.
  for (let i = 0; i < 9; i += 1) {
    const x = rand(i + 1) * 1.6;
    b.tube([[x * 0.5, top - 1.3, 0.04], [x, top - 2.1 - Math.abs(rand(i + 3)) * 1.4, 0.2 + rand(i + 5) * 0.2], [x * 0.3, 4 + rand(i) * 0.4, 0.16], [rand(i + 7) * 0.2, 3.56, 0.16]], 0.016, i % 3 ? "#1f1f22" : "#3a2f2a", { steps: 8, sides: 3 });
  }
  b.torus(0.3, 0.02, "#1f1f22", { at: [0.34, 5.1, 0.12], turn: [0.4, 0.5, 0], sides: 3, segments: 10 });
  b.torus(0.22, 0.02, "#2b2420", { at: [-0.24, 5.5, 0.14], turn: [1.1, 0, 0.3], sides: 3, segments: 10 });
  return b;
}

const SHOP_SIGNS = [
  { name: "sai", text: "SAI TAILORS", sub: "साई टेलर्स", bg: "#ffcf33", ink: "#1b2f7a", border: "#1b2f7a" },
  { name: "ganesh", text: "GANESH KIRANA", sub: "गणेश किराना", bg: "#e84a33", ink: "#fff6d8", border: "#fff6d8" },
  { name: "zatpat", text: "ZATPAT XEROX", sub: "झटपट झेरॉक्स", bg: "#2e9c6a", ink: "#fff", border: "#0d3f2a" },
  { name: "bombay", text: "NEW BOMBAY MOBILE", sub: "मोबाईल रिपेअर", bg: "#2559c9", ink: "#ffe15a", border: "#fff" },
  { name: "laxmi", text: "LAXMI SWEETS", sub: "लक्ष्मी स्वीट्स", bg: "#f7eed4", ink: "#b3171f", border: "#b3171f" },
  { name: "hotel", text: "HOTEL ANNAPURNA", sub: "शुद्ध शाकाहारी", bg: "#7a1f26", ink: "#ffe15a", border: "#ffe15a" },
];
export const shopSign = (index) => signboard(SHOP_SIGNS[index % SHOP_SIGNS.length]);

export function signPost(b, index) {
  const sign = shopSign(index);
  for (const x of [-1.2, 1.2]) b.box(0.08, 3.4, 0.06, "#3f4046", { at: [x, 1.7, -0.07] });
  b.box(2.8, 1.05, 0.06, "#2a2b30", { at: [0, 2.9, 0] });
  b.card(2.72, 0.98, sign, { at: [0, 2.9, 0.035] });
  return b;
}

const CLOTHES = ["#d8231f", "#2f6bff", "#ffd23f", "#f5f7fb", "#21a07a", "#e05ca8", "#ff8a1f"];

// An old chawl: long open galleries along the front of every floor, rooms behind, laundry out on the
// lines, and shops on the street. Faded paint, because the sea air eats it.
export function chawl(b, { wall, trim, stain, floors = 4, bays = 6, seed = 1 }) {
  const bay = 2.5;
  const width = bays * bay;
  const half = width / 2;
  const depth = 7;
  const floor = 3;
  const height = floors * floor + 0.6;
  const random = (i) => Math.abs(Math.sin((i + seed * 7.1) * 91.17)) % 1;
  b.slab(-half, half, 0, height, -depth, -0.9, wall);
  b.slab(-half - 0.14, half + 0.14, height - 0.1, height + 0.28, -depth - 0.14, -0.76, trim);
  // Roof clutter: water tanks and a stair head.
  b.cyl(0.9, 1.4, "#2c2d33", { at: [-half + 3, height + 0.98, -4], segments: 10 });
  b.cyl(0.8, 1.2, "#2c2d33", { at: [half - 3.4, height + 0.88, -5], segments: 10 });
  b.slab(0.6, 3.4, height + 0.28, height + 2.2, -5.4, -2.8, wall);
  for (let storey = 0; storey < floors; storey += 1) {
    const y = storey * floor;
    if (storey > 0) {
      // Gallery: slab, posts and a railing of thin bars.
      b.slab(-half - 0.1, half + 0.1, y - 0.14, y + 0.02, -0.9, 0.6, trim);
      for (let i = 0; i <= bays; i += 1) b.slab(-half + i * bay - 0.11, -half + i * bay + 0.11, y, y + floor - 0.12, 0.38, 0.6, trim);
      b.slab(-half, half, y + 0.96, y + 1.04, 0.5, 0.56, "#4c5157");
      b.slab(-half, half, y + 0.14, y + 0.2, 0.5, 0.56, "#4c5157");
      for (let x = -half + 0.2; x < half; x += 0.34) b.slab(x - 0.02, x + 0.02, y + 0.14, y + 1, 0.51, 0.55, "#4c5157");
    }
    for (let i = 0; i < bays; i += 1) {
      const x = -half + (i + 0.5) * bay;
      const r = random(storey * 17 + i);
      if (storey === 0) {
        // Rolled shutters and an awning for the shop below.
        b.slab(x - 1.1, x + 1.1, 0.1, 2.5, -0.92, -0.86, r > 0.5 ? "#5c6168" : "#7e8388");
        for (let y2 = 0.3; y2 < 2.5; y2 += 0.26) b.slab(x - 1.1, x + 1.1, y2, y2 + 0.04, -0.86, -0.84, "#4a4e55");
        continue;
      }
      const door = i % 2 === 0;
      b.slab(x - (door ? 0.95 : 0.5), x - (door ? 0.05 : -0.5), y + 0.02, y + 2.2, -0.92, -0.86, door ? "#7a4b2a" : "#1f2a33");
      b.slab(x + 0.2, x + 1, y + 0.9, y + 2.1, -0.92, -0.86, "#1f2a33");
      for (const dx of [0.47, 0.73]) b.slab(x + dx - 0.02, x + dx + 0.02, y + 0.9, y + 2.1, -0.87, -0.84, "#56606a");
      // The washing line runs in front of the railing, with whatever is drying today.
      if (r > 0.4) {
        const line = y + 1.9;
        b.slab(x - 1.2, x + 1.2, line - 0.01, line + 0.01, 0.62, 0.64, "#2c2d33");
        for (let c = 0; c < 4; c += 1) {
          const colour = CLOTHES[Math.floor(random(i * 7 + c + storey * 3) * CLOTHES.length)];
          const tall = 0.5 + random(c + i) * 0.5;
          b.slab(x - 1 + c * 0.54, x - 0.6 + c * 0.54, line - tall, line, 0.62, 0.64, colour);
        }
      }
    }
  }
  // Painted shop boards along the street front.
  for (let i = 0; i < bays; i += 2) {
    const x = -half + (i + 1) * bay;
    b.slab(x - 2.3, x + 2.3, 2.62, 3.1, -0.9, -0.74, "#2a2b30");
    b.card(4.5, 0.44, shopSign(seed + i / 2), { at: [x, 2.86, -0.72] });
  }
  // Stains running down from the roof line and each gallery.
  for (let i = 0; i < 14; i += 1) {
    const x = -half + random(i + 40) * width;
    b.slab(x, x + 0.22 + random(i) * 0.4, height - 1.6 - random(i + 2) * 3, height - 0.1, -0.895, -0.88, stain);
  }
  return b;
}

export function kerb(b, length = 34) {
  for (let z = 0; z < length; z += 1.7) {
    b.slab(-0.14, 0.14, 0, 0.14, -z - 1.7, -z - 0.85, "#f4c21c");
    b.slab(-0.14, 0.14, 0, 0.14, -z - 0.85, -z, "#16171b");
  }
  return b;
}

export function vadaPav(b) {
  // A pickup, so it is drawn big and plain: a square-cornered pav, split around a golden vada that
  // bulges out of it, with red chutney and a fried green chilli.
  const pav = "#e8b878";
  const crust = "#c98a44";
  b.box(1.04, 0.3, 1.04, pav, { at: [0, 0.2, 0] });
  b.box(1, 0.06, 1, crust, { at: [0, 0.05, 0] });
  b.ball(0.56, pav, { at: [0, 0.96, 0], scale: [1, 0.5, 1] });
  b.ball(0.5, crust, { at: [0, 1.04, 0], scale: [0.9, 0.42, 0.9] });
  b.ball(0.6, "#e0a51c", { at: [0, 0.58, 0], scale: [1, 0.46, 1] });
  b.cyl(0.54, 0.05, "#c93a1c", { at: [0, 0.72, 0], segments: 12 });
  b.tube([[0.62, 0.5, -0.3], [0.8, 0.62, 0], [0.62, 0.76, 0.32]], 0.075, "#49a12c", { steps: 6, sides: 5 });
  return b;
}
