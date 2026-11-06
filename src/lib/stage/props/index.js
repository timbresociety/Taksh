// The procedural props, by name. "proc:auto" in a world entry resolves here, just as "kit:Model" resolves
// to a glTF. Each prop is built once and cloned, so repeated use shares its geometry and materials.
import { forge } from "./forge.js";
import * as diwali from "./diwali.js";
import * as mumbai from "./mumbai.js";
import { coach, ramp } from "./rails.js";
import * as sea from "./seafront.js";

export { RAMP, TRAIN } from "./rails.js";

const CHAWLS = [
  { wall: "#b7c4a4", trim: "#efe6d0", stain: "#9dab8b", seed: 1 },
  { wall: "#d9b48a", trim: "#f1e9d6", stain: "#bd9a72", floors: 3, seed: 2 },
  { wall: "#a9c0cc", trim: "#ece4cf", stain: "#8fa7b4", seed: 3 },
  { wall: "#d6a3a0", trim: "#f2e8d8", stain: "#ba8a87", floors: 5, seed: 4 },
];

const DECOS = [
  { wall: "#efe2c6", trim: "#fff7e6", accent: "#c9744a", seed: 1 },
  { wall: "#e8c4b4", trim: "#fff2e6", accent: "#6b8f9c", floors: 5, seed: 2 },
  { wall: "#c9dcc8", trim: "#f6f6ea", accent: "#c98a3a", floors: 7, seed: 3 },
];

// These two take their colours from the world, so one model serves every palette.
const worldCoach = (b, { data }) => coach(b, { lower: data.platform[1], belt: data.platform[0], upper: data.platform[1], band: data.accent, roof: data.platform[0] });
const worldRamp = (b, { data }) => ramp(b, { side: data.platform[1], deck: data.platform[0], stripe: data.accent });

const PROPS = {
  coach: worldCoach,
  ramp: worldRamp,
  cone: mumbai.cone,
  cones: mumbai.cones,
  barricade: mumbai.barricade,
  board: mumbai.board,
  metrobar: (b) => mumbai.workBar(b, "metro"),
  bmcbar: (b) => mumbai.workBar(b, "bmc"),
  pothole: mumbai.pothole,
  puddle: mumbai.puddle,
  cow: mumbai.cowStanding,
  cowsitting: mumbai.cowSitting,
  auto: mumbai.auto,
  rallyauto: (b) => mumbai.auto(b, { open: true }),
  taxi: mumbai.taxi,
  bus: mumbai.bus,
  local: mumbai.localTrain,
  vadastall: mumbai.vadaStall,
  bhajistall: mumbai.bhajiStall,
  chaistall: mumbai.chaiStall,
  pole: (b) => mumbai.pole(b),
  kerb: (b) => mumbai.kerb(b),
  vadapav: mumbai.vadaPav,
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].map((index) => [`sign${index}`, (b) => mumbai.signPost(b, index)])),
  ...Object.fromEntries(CHAWLS.map((look, index) => [`chawl${index}`, (b) => mumbai.chawl(b, look)])),
  tetrapod: sea.tetrapod,
  tetrapods: (b) => sea.tetrapods(b),
  seawall: (b) => sea.seawall(b),
  lamp: sea.lamp,
  palm: (b) => sea.palm(b, 1),
  palm2: (b) => sea.palm(b, 2),
  bhelcart: sea.bhelCart,
  kulficart: sea.kulfiCart,
  umbrella: (b) => sea.umbrella(b, 0),
  merrygo: sea.merryGo,
  chowpatty: sea.chowpatty,
  kulfi: sea.kulfi,
  ...Object.fromEntries(DECOS.map((look, index) => [`deco${index}`, (b) => sea.deco(b, look)])),
  diya: diwali.diya,
  diyaring: (b) => diwali.diyaRing(b),
  ...Object.fromEntries([0, 1, 2, 3].map((index) => [`rangoli${index}`, (b) => diwali.rangoli(b, index)])),
  ...Object.fromEntries([0, 1, 2, 3].map((index) => [`kandil${index}`, (b) => diwali.kandilPost(b, index)])),
  festoon: diwali.festoon,
  toran: diwali.toranDoor,
  houselights1: (b) => diwali.houseLights(b, 1),
  houselights2: (b) => diwali.houseLights(b, 2),
  ladi: diwali.ladi,
  anaar: diwali.anaar,
  chakri: diwali.chakri,
  crackers: diwali.crackerBoxes,
  sutli: diwali.sutliBomb,
  kandilstall: diwali.kandilStall,
  mithaistall: diwali.mithaiStall,
};

export const PROP_NAMES = Object.keys(PROPS);

const PER_WORLD = new Set(["coach", "ramp"]);

// How a prop sits beside a road: vehicles lie along it, and small round things can face anywhere.
// Everything else has a front, which is turned to the road.
const ALONG = new Set(["auto", "rallyauto", "taxi", "bus", "local", "coach", "cow", "cowsitting", "seawall", "kerb", "tetrapods"]);
const ANYWAY = new Set(["cone", "pothole", "puddle", "tetrapod", "diya", "diyaring", "rangoli0", "rangoli1", "rangoli2", "rangoli3", "anaar", "chakri", "umbrella", "merrygo", "palm", "palm2"]);
export const propHabit = (name) => (ALONG.has(name) ? "along" : ANYWAY.has(name) ? "any" : "faces");

const built = new Map();

// world is { id, data }. height and maxWidth work like "kit:Model@2", except that the width limit is
// across the lane only: a long vehicle should fit between the lines, and may run as far back as it likes.
export function makeProp(name, world, height, maxWidth) {
  if (!PROPS[name]) throw new Error(`No procedural prop named ${name}`);
  const key = PER_WORLD.has(name) ? `${name}:${world.id}` : name;
  if (!built.has(key)) {
    const made = PROPS[name](forge(), world);
    built.set(key, made.isObject3D ? made : made.finish());
  }
  const original = built.get(key);
  const copy = original.clone(true);
  const [width, tall] = original.userData.size;
  copy.scale.setScalar(Math.min(height ? height / tall : 1, maxWidth ? maxWidth / width : Infinity));
  return copy;
}
