// The long walkable coach and the ramp up to it. Every world has both, in its own colours, because the
// runner climbs onto them. Sizes here are promises to the game: the roof is flat at exactly this height.
export const TRAIN = { width: 2.2, height: 3.4, length: 18 };
export const RAMP = { width: 2.1, height: 3.4, length: 8 };

const WINDOW = [0.95, 2.35];
const DOOR_TOP = 2.72;
const FLOOR = 0.82;

// One side of the coach, as panels around door and window openings, so the dark interior shows through.
function coachSide(b, side, { lower, belt, upper, band, grille = "#3a3f47" }) {
  const half = TRAIN.width / 2;
  const outer = side * half;
  const inner = side * (half - 0.09);
  const [x0, x1] = side > 0 ? [inner, outer] : [outer, inner];
  const doors = [-7.1, -2.4, 2.4, 7.1];
  const halfDoor = 0.62;
  const end = TRAIN.length / 2;
  const edges = [-end, ...doors.flatMap((door) => [door - halfDoor, door + halfDoor]), end];
  for (let i = 0; i < edges.length; i += 2) {
    const [from, to] = [edges[i], edges[i + 1]];
    b.slab(x0, x1, FLOOR, 1.42, from, to, lower);
    b.slab(x0, x1, 1.42, 1.52, from, to, band);
    // Windows: a run of openings with bars, split by narrow cream piers.
    const panes = Math.max(1, Math.round((to - from) / 1.5));
    const pane = (to - from) / panes;
    for (let p = 0; p <= panes; p += 1) {
      const z = from + p * pane;
      const a = p === 0 ? z : z - 0.1;
      const c = p === panes ? z : z + 0.1;
      b.slab(x0, x1, 1.52, WINDOW[1], a, c, belt);
    }
    b.slab(x0, x1, 1.52, 1.62, from, to, belt);
    for (const y of [1.84, 2.04, 2.22]) b.slab(x0 + 0.02, x1 - 0.02, y - 0.015, y + 0.015, from, to, grille);
    b.slab(x0, x1, WINDOW[1], DOOR_TOP, from, to, belt);
  }
  for (const door of doors) {
    // The doorway stays open: a step, and the grab pole every commuter hangs from.
    b.slab(side > 0 ? x1 - 0.5 : x0, side > 0 ? x1 : x0 + 0.5, FLOOR - 0.06, FLOOR, door - halfDoor, door + halfDoor, "#2a2d33");
    b.cyl(0.028, DOOR_TOP - FLOOR, "#f1c21b", { at: [outer - side * 0.05, (DOOR_TOP + FLOOR) / 2, door], segments: 6 });
  }
  b.slab(x0, x1, DOOR_TOP, 3.26, -end, end, upper);
}

function bogie(b, z, frame, wheel) {
  b.slab(-0.9, 0.9, 0.42, 0.62, z - 1.5, z + 1.5, frame);
  for (const dz of [-1, 1]) for (const x of [-0.78, 0.78]) {
    b.cyl(0.42, 0.14, wheel, { at: [x, 0.42, z + dz], turn: [0, 0, Math.PI / 2], segments: 14 });
    b.cyl(0.2, 0.16, "#8d9099", { at: [x, 0.42, z + dz], turn: [0, 0, Math.PI / 2], segments: 8 });
  }
}

// The nose of the coach, facing +z or -z. A flat front keeps the roof line honest from behind.
function coachEnd(b, face, { nose, upper, band, lamp, route }) {
  const z = face * (TRAIN.length / 2);
  const [z0, z1] = [z - 0.06, z + 0.06];
  const half = TRAIN.width / 2;
  b.slab(-half, half, FLOOR, 1.52, z0, z1, nose);
  b.slab(-half, half, 1.42, 1.52, z0 - 0.01, z1 + 0.01, band);
  b.slab(-half, half, 1.52, 2.32, z0, z1, upper);
  b.slab(-half, half, 2.32, 3.26, z0, z1, nose);
  for (const x of [-0.56, 0.56]) b.slab(x - 0.4, x + 0.4, 1.62, 2.24, z + face * 0.06, z + face * 0.08, "#20303a");
  for (const x of [-0.66, 0.66]) b.cyl(0.1, 0.05, lamp, { at: [x, 1.14, z + face * 0.08], turn: [Math.PI / 2, 0, 0], segments: 10, glow: true });
  b.cyl(0.11, 0.05, lamp, { at: [0, 3.02, z + face * 0.08], turn: [Math.PI / 2, 0, 0], segments: 10, glow: true });
  if (route) b.card(1.3, 0.3, route, { at: [0, 2.56, z + face * 0.08], turn: [0, face > 0 ? 0 : Math.PI, 0] });
  b.slab(-0.7, 0.7, 0.55, FLOOR, z0, z1, "#23262c");
}

export function coach(b, colours) {
  const { lower, belt, upper, band, roof, frame = "#22252b", wheel = "#34373f", inside = "#2a2e34" } = colours;
  const half = TRAIN.width / 2;
  const end = TRAIN.length / 2;
  b.slab(-half + 0.08, half - 0.08, FLOOR, 3.26, -end + 0.03, end - 0.03, inside);
  b.slab(-half, half, 0.62, FLOOR, -end, end, frame);
  for (const z of [-5.8, 5.8]) bogie(b, z, frame, wheel);
  // Boxes under the floor, between the bogies, stop it reading as a floating slab.
  b.slab(-0.8, 0.8, 0.3, 0.62, -3.6, 3.6, "#2c2f36");
  coachSide(b, -1, colours);
  coachSide(b, 1, colours);
  coachEnd(b, -1, { ...colours, nose: colours.nose ?? lower, upper: colours.nose ?? lower, lamp: "#ffeeb0" });
  coachEnd(b, 1, { ...colours, nose: colours.nose ?? lower, upper: colours.nose ?? lower, lamp: "#d42a16" });
  // The roof is the running surface, so it stays flat: just a slab and two thin gutters.
  b.slab(-half - 0.02, half + 0.02, 3.26, TRAIN.height, -end, end, roof);
  for (const x of [-half + 0.14, half - 0.14]) b.slab(x - 0.03, x + 0.03, TRAIN.height, TRAIN.height + 0.015, -end + 0.2, end - 0.2, colours.rib ?? roof);
  return b;
}

// Starts at the origin and rises towards -z, so a runner heading down the lane climbs it and steps
// straight onto the coach that starts where the ramp ends.
export function ramp(b, { side, deck, stripe, frame = "#2a2d33" }) {
  const { width, height, length } = RAMP;
  const rise = (z) => (height * -z) / length;
  b.profile([[0, 0], [-length, height], [-length, 0]], width, side);
  // A deck on top, standing proud of the sides, and rungs that mark the slope from far away.
  const slope = Math.atan2(height, length);
  const along = Math.hypot(height, length);
  b.box(width + 0.08, 0.06, along, deck, { at: [0, height / 2, -length / 2], turn: [slope, 0, 0] });
  for (let z = -0.5; z > -length + 0.2; z -= 0.75) b.box(width + 0.08, 0.04, 0.28, stripe, { at: [0, rise(z) + 0.03, z], turn: [slope, 0, 0] });
  for (const x of [-1, 1]) b.slab(x * (width / 2) - 0.05, x * (width / 2) + 0.05, 0, 0.14, -length, 0, frame);
  return b;
}
