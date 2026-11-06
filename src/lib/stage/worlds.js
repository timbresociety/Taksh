// A world is data: its light, its ground, and which kit models play each role in a game. Views ask
// for roles ("low", "pickup"), so every game works in every world.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { createRandom } from "../templates/shared.js";
import { loadAsset } from "./assets.js";
import { clock, screen } from "./props/fire.js";
import { fireworks, skyLanterns } from "./props/fireworks.js";
import { makeProp, propHabit } from "./props/index.js";
import { seafrontBackdrop } from "./props/seafront.js";

// "kit:Model" keeps a model's real size; "kit:Model@2" scales it to two metres tall. "proc:Name" works
// the same way for a model built in code, from the registry in props/index.js.
//
// Beyond the roles, a world may set:
//   clear        how far from the road's centre the scattered scenery starts, in a lane game
//   farWidth     half the room a far model needs, measured from the kerb side
//   behind       models for a further row, behindSpacing apart
//   nearGap      metres between scattered near models, and nearDepth their [front, back] in a side-on game
//   farSides, nearSides   which sides of the road carry them, when one side is the sea
//   noFarInLayers, keepInRing(x, z)   what to leave out of a side-on game or an arena, for the same reason
//   lines        scenery set out at a fixed spacing: { entry, every, x, sides, from, to, mirror, depth }.
//                x is the distance from the road in a lane game; depth is the distance behind the
//                player in a side-on game, and a line without one is left out there.
//   backdrop     (kind, helpers) => object, for what is neither a line nor a scatter
//   show         (helpers) => [{ group, update }], for animated things in the sky
export const WORLD_LOOKS = {
  downtown: {
    kits: ["city", "props"], sky: ["#3f9df0", "#e3f4ff"], haze: "#cfe6f7", hazeRange: [45, 190],
    sun: { colour: "#fff1d6", power: 3.2, from: [24, 40, 20] }, fill: { sky: "#d9edff", ground: "#8a8f98", power: 1.5 },
    ground: "#7b828c", path: "#3e444e", line: "#f6f7fb", accent: "#ffcf33", platform: ["#c9ced6", "#6e7682"],
    far: ["city:Building_Large_2", "city:Building_Medium_2_001", "city:Building_Small_1"], farSpacing: 22,
    near: ["city:Prop_Planter_Single", "city:Prop_Bollard", "props:Bench", "props:Stall_Empty"],
    low: ["props:Crate_Wooden@1", "city:Prop_Planter_Single@0.85", "props:Barrel@1"],
    wall: ["props:Stall_Cart_Empty@2.5", "props:Stall_Empty@2.6"], pickup: "props:Coin@0.62", hazard: "props:Barrel@1.1",
    train: "proc:coach", ramp: "proc:ramp",
  },
  forest: {
    kits: ["nature", "props"], sky: ["#3f9fe0", "#d9f1e4"], haze: "#c6e6cf", hazeRange: [34, 170],
    sun: { colour: "#fff0c4", power: 3, from: [-18, 36, 16] }, fill: { sky: "#dff4ff", ground: "#5f7a3c", power: 1.6 },
    ground: "#6fa64a", path: "#a6814f", line: "#d9bd8a", accent: "#ffe066", platform: ["#7cc25a", "#7b5a3a"],
    far: ["nature:CommonTree_1", "nature:CommonTree_2", "nature:CommonTree_3", "nature:Pine_1", "nature:Pine_2", "nature:Pine_3", "nature:TwistedTree_1"], farSpacing: 7,
    near: ["nature:Bush_Common", "nature:Bush_Common_Flowers", "nature:Fern_1", "nature:Flower_3_Group", "nature:Flower_4_Group", "nature:Rock_Medium_1", "nature:Grass_Common_Tall", "nature:Mushroom_Common"],
    low: ["nature:Rock_Medium_1@1", "nature:Rock_Medium_2@0.9", "nature:Bush_Common@1"],
    wall: ["nature:Rock_Medium_3@2.6", "nature:Rock_Medium_1@2.7"], pickup: "props:Coin@0.62", hazard: "nature:Rock_Medium_2@1",
    train: "proc:coach", ramp: "proc:ramp",
  },
  station: {
    kits: ["scifi"], sky: ["#0a1030", "#2c5fa8"], haze: "#22345e", hazeRange: [30, 130], stars: true,
    sun: { colour: "#d8ecff", power: 2.6, from: [10, 30, 24] }, fill: { sky: "#9fc4ff", ground: "#39424f", power: 1.7 },
    ground: "#4a5564", path: "#2c3442", line: "#4fe6ff", accent: "#4fe6ff", platform: ["#b6c4d6", "#3d4757"],
    far: ["scifi:Prop_SatelliteDish", "scifi:Prop_Crate_Large", "scifi:Prop_Shelves_WideTall"], farSpacing: 16,
    walls: ["scifi:WallAstra_Straight_Window@8", "scifi:WallAstra_Straight@8", "scifi:WallBand_Straight@8"], wallLength: 10.6,
    near: ["scifi:Prop_Crate", "scifi:Prop_Barrel_Large", "scifi:Prop_Computer", "scifi:Prop_Crate_Tarp", "scifi:Prop_Locker"],
    low: ["scifi:Prop_Crate@1", "scifi:Prop_Barrel2_Closed@1", "scifi:Prop_Ammo@0.9"],
    wall: ["scifi:Prop_Crate_Large@2.5", "scifi:Prop_Shelves_WideTall@2.6"], pickup: "scifi:Prop_KeyCard@0.6", hazard: "scifi:Enemy_EyeDrone@1.1",
    train: "proc:coach", ramp: "proc:ramp",
  },
  moon: {
    kits: ["nature", "scifi"], sky: ["#02030a", "#1b2036"], haze: "#141827", hazeRange: [50, 200], stars: true, planet: true,
    sun: { colour: "#ffffff", power: 3.6, from: [-30, 26, 18] }, fill: { sky: "#8c97b8", ground: "#3a3a42", power: 1 },
    ground: "#8a8a90", path: "#6d6d74", line: "#c9ccd4", accent: "#7dd3ff", platform: ["#a5a5ac", "#55555d"], grey: true,
    far: ["nature:Rock_Medium_1@7", "nature:Rock_Medium_2@9", "nature:Rock_Medium_3@6", "scifi:Prop_SatelliteDish"], farSpacing: 13,
    near: ["nature:Pebble_Round_1", "nature:Pebble_Square_2", "nature:Rock_Medium_2@1", "scifi:Prop_Crate", "scifi:Prop_Barrel_Large"],
    low: ["nature:Rock_Medium_2@0.95", "scifi:Prop_Crate@1"], wall: ["nature:Rock_Medium_1@2.6", "scifi:Prop_Crate_Large@2.5"],
    pickup: "scifi:Prop_KeyCard@0.6", hazard: "scifi:Enemy_EyeDrone@1.1",
    train: "proc:coach", ramp: "proc:ramp",
  },
  village: {
    kits: ["village", "props", "nature"], sky: ["#7cc0e8", "#fdf0d0"], haze: "#efe3c8", hazeRange: [30, 130],
    sun: { colour: "#ffe9c2", power: 3, from: [22, 30, -8] }, fill: { sky: "#e2efff", ground: "#8f7d5e", power: 1.6 },
    ground: "#8cae5c", path: "#b3a48d", line: "#d8cdb9", accent: "#ffcf5c", platform: ["#c7b89f", "#6f5a44"], houses: true,
    far: ["house", "house", "nature:CommonTree_2", "nature:CommonTree_4"], farSpacing: 11,
    near: ["village:Prop_Wagon", "village:Prop_WoodenFence_Single", "props:Barrel", "props:Crate_Wooden", "props:Stall_Empty", "nature:Bush_Common"],
    low: ["props:Crate_Wooden@1", "props:Barrel@1", "village:Prop_Crate@0.95"],
    wall: ["village:Prop_Wagon@2.4", "props:Stall_Cart_Empty@2.5"], pickup: "props:Coin@0.62", hazard: "props:Barrel@1.1",
    train: "proc:coach", ramp: "proc:ramp",
  },
  sunset: {
    kits: ["nature", "props"], sky: ["#3a2a78", "#ffb36b"], haze: "#f4a877", hazeRange: [22, 110],
    sun: { colour: "#ffb070", power: 3.4, from: [-34, 12, -26] }, fill: { sky: "#b49be0", ground: "#6b4a3a", power: 1.8 },
    ground: "#7f7a45", path: "#c98f5e", line: "#ffd9a6", accent: "#ffd166", platform: ["#e8a970", "#6a4a3e"],
    far: ["nature:TwistedTree_1", "nature:TwistedTree_2", "nature:DeadTree_1", "nature:CommonTree_5", "nature:Pine_4"], farSpacing: 10,
    near: ["nature:Grass_Wispy_Tall", "nature:Fern_1", "nature:Bush_Common", "props:Bench", "nature:Flower_4_Group", "nature:Rock_Medium_3"],
    low: ["nature:Rock_Medium_2@0.95", "props:Barrel@1"], wall: ["nature:Rock_Medium_3@2.6", "props:Stall_Empty@2.6"],
    pickup: "props:Coin@0.62", hazard: "nature:Rock_Medium_2@1",
    train: "proc:coach", ramp: "proc:ramp",
  },
  mumbai: {
    kits: ["city", "props"], sky: ["#7fb2d6", "#f4e6cf"], haze: "#ecdfc6", hazeRange: [40, 190],
    sun: { colour: "#fff0d0", power: 2.8, from: [20, 38, 16] }, fill: { sky: "#f2e8d6", ground: "#8e8474", power: 1.5 },
    ground: "#8f8879", path: "#444346", line: "#f2efe6", accent: "#ffc21f", platform: ["#c4b89e", "#7a1f26"], patched: true,
    far: ["proc:chawl0", "proc:chawl1", "proc:chawl2", "proc:chawl3"], farSpacing: 16.5, farWidth: 2,
    behind: ["city:Building_Large_2", "city:Building_Medium_2_001", "city:Building_Small_1"], behindSpacing: 26,
    near: ["proc:vadastall", "proc:bhajistall", "proc:chaistall", "proc:cow", "proc:cowsitting", "proc:sign0", "proc:sign1", "proc:sign2", "proc:sign3", "proc:barricade", "proc:cone", "proc:board"],
    nearGap: 6.5, clear: 9.4,
    lines: [
      { entry: "proc:kerb", every: 34, x: 8.6 },
      { entry: "proc:pole", every: 24, x: 9.1, depth: -4.5 },
      { entry: ["proc:taxi", "proc:auto", "proc:auto"], every: 15, x: 5.9, from: 4 },
      { entry: "proc:bus", every: 85, x: 5.9, from: 42, sides: [1] },
      { entry: "proc:puddle", every: 43, x: 6.2, from: 12, sides: [-1] },
    ],
    backdrop: streetBackdrop,
    low: ["proc:pothole", "proc:puddle", "proc:cones@1", "proc:barricade@1", "proc:cowsitting@1"],
    wall: ["proc:board@2.5", "proc:auto@2.1", "proc:taxi@1.75"], pickup: "proc:vadapav@0.6", hazard: "proc:cone@1.1",
    train: "proc:local", ramp: "proc:ramp",
  },
  marine_drive: {
    kits: ["props"], sky: ["#29306f", "#ff9a5c"], haze: "#e29a78", hazeRange: [55, 300],
    sun: { colour: "#ffae73", power: 2.6, from: [-46, 14, -30] }, fill: { sky: "#9a8fd8", ground: "#7a5a4a", power: 1.9 },
    ground: "#a0978a", path: "#46454e", line: "#ece4d4", accent: "#ffb95e", platform: ["#e3d3b0", "#55607a"],
    far: ["proc:deco0", "proc:deco1", "proc:deco2"], farSpacing: 18, farWidth: 4, farSides: [1],
    near: ["proc:palm", "proc:palm2", "props:Bench", "proc:bhelcart", "proc:palm", "proc:kulficart", "proc:umbrella"], nearGap: 8, nearSides: [1], nearDepth: [-8.5, -3], clear: 6.2,
    lines: [
      { entry: "proc:seawall", every: 34, x: 8.9, sides: [-1], to: 130, depth: -9 },
      { entry: "proc:tetrapods", every: 17, x: 11.6, sides: [-1], to: 136, depth: -11.6 },
      { entry: "proc:lamp", every: 13, x: 7.9, sides: [-1], mirror: true, depth: -7.9 },
      { entry: "proc:chowpatty", every: 400, x: 21.5, sides: [-1], mirror: true, from: 148, depth: -21.5 }, // runs along the road, so it is not turned to face it
    ],
    keepInRing: (x, z) => z > -9, noFarInLayers: true,
    backdrop: seafrontBackdrop,
    low: ["proc:tetrapod@1", "props:Barrel@1"], wall: ["proc:bhelcart@2.5", "proc:kulficart@2.5"], pickup: "proc:kulfi@0.7", hazard: "proc:tetrapod@1.1",
    train: "proc:coach", ramp: "proc:ramp",
  },
  diwali: {
    kits: ["village", "nature"], sky: ["#060824", "#3a1f5e"], haze: "#2a1a44", hazeRange: [26, 150], stars: true, houses: true, lights: true,
    sun: { colour: "#9fb2ff", power: 1, from: [18, 34, 16] }, fill: { sky: "#7a6cc8", ground: "#d0813a", power: 1.45 },
    ground: "#4b4a3e", path: "#7a5a44", line: "#ffcf7a", accent: "#ffb02e", platform: ["#d8b48a", "#6e2a4f"],
    far: ["house", "house", "house", "nature:CommonTree_2"], farSpacing: 11,
    near: ["proc:diyaring", "proc:rangoli0", "proc:kandil0", "proc:anaar", "proc:rangoli1", "proc:kandil1", "proc:chakri", "proc:rangoli2", "proc:ladi", "proc:rangoli3", "proc:kandil2", "proc:toran", "proc:diyaring", "proc:kandil3"], nearGap: 5.5,
    lines: [{ entry: "proc:festoon", every: 34, x: 0, sides: [1], from: 8, mirror: true }],
    show: () => [fireworks(), skyLanterns()],
    low: ["proc:crackers@1"], wall: ["proc:kandilstall@2.5", "proc:mithaistall@2.5"], pickup: "proc:diya@0.5", hazard: "proc:sutli@1.1",
    train: "proc:coach", ramp: "proc:ramp",
  },
};

const box = new THREE.Box3();
const centre = new THREE.Vector3();
const size = new THREE.Vector3();

// Moves a model so it stands on the origin, so props of any pivot place the same way.
function grounded(model, height, maxWidth) {
  box.setFromObject(model);
  box.getSize(size);
  const scale = Math.min(height ? height / size.y : 1, maxWidth ? maxWidth / Math.max(size.x, size.z) : Infinity);
  box.getCenter(centre);
  model.position.set(-centre.x, -box.min.y, -centre.z);
  const holder = new THREE.Group();
  holder.add(model);
  holder.scale.setScalar(scale);
  return holder;
}

function speckled(base, { line, dash = false, repeat = [1, 1], patched = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const pen = canvas.getContext("2d");
  pen.fillStyle = base;
  pen.fillRect(0, 0, 256, 256);
  const random = createRandom(11);
  for (let i = 0; i < 2600; i += 1) {
    pen.fillStyle = random.next() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
    const r = random.range(1, 6);
    pen.fillRect(random.range(0, 256), random.range(0, 256), r, r);
  }
  // Years of repairs: rectangles of newer tarmac, darker than the road around them.
  if (patched) {
    for (let i = 0; i < 7; i += 1) {
      pen.fillStyle = i % 3 ? "rgba(20,20,24,0.3)" : "rgba(120,116,110,0.22)";
      pen.fillRect(random.range(10, 200), random.range(0, 230), random.range(24, 70), random.range(16, 60));
    }
  }
  if (dash) {
    pen.fillStyle = line;
    for (const x of [256 / 3, (256 * 2) / 3]) for (let y = 0; y < 256; y += 64) pen.fillRect(x - 2, y, 4, 34);
    pen.fillRect(2, 0, 5, 256);
    pen.fillRect(249, 0, 5, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 8;
  return texture;
}

function skyDome(top, horizon, { stars, planet }) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, stars: { value: stars ? 1 : 0 } },
    vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      varying vec3 vDir; uniform vec3 top, horizon; uniform float stars;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.98, 78.23, 37.71))) * 43758.5453); }
      void main() {
        float rise = clamp(vDir.y * 1.6 + 0.05, 0.0, 1.0);
        vec3 colour = mix(horizon, top, pow(rise, 0.7));
        float star = step(0.9975, hash(floor(vDir * 210.0))) * stars * smoothstep(0.02, 0.2, vDir.y);
        gl_FragColor = vec4(colour + star, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), material);
  dome.userData.keepMaterial = true;
  dome.renderOrder = -1;
  const group = new THREE.Group();
  group.add(dome);
  if (planet) {
    const world = new THREE.Mesh(new THREE.SphereGeometry(46, 32, 24), new THREE.MeshBasicMaterial({ color: "#5fa8e8", fog: false }));
    world.position.set(120, 150, -300);
    world.userData.keepMaterial = true;
    group.add(world);
  }
  return group;
}

// A street is wider than its three lanes: tarmac runs out to the kerbs, where the parked traffic stands.
function streetBackdrop(kind, { data, dress }) {
  const group = new THREE.Group();
  if (kind !== "strip") return group;
  const [width, length] = [17, 420];
  const map = speckled(data.path, { repeat: [1, length / 17], patched: data.patched });
  const tarmac = new THREE.Mesh(new THREE.PlaneGeometry(width, length), new THREE.MeshStandardMaterial({ map, roughness: 0.95 }));
  tarmac.rotation.x = -Math.PI / 2;
  tarmac.position.set(0, -0.012, -length / 2 + 30);
  tarmac.userData.flat = true;
  tarmac.receiveShadow = true;
  group.add(dress(tarmac));
  return group;
}

// Kit parts arrive quantised, so they are widened to floats before their transforms can be baked in.
function bakedGeometry(mesh) {
  const geometry = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const source = mesh.geometry.getAttribute(name);
    const values = new Float32Array(source.count * source.itemSize);
    for (let i = 0; i < source.count; i += 1) for (let c = 0; c < source.itemSize; c += 1) values[i * source.itemSize + c] = source.getComponent(i, c);
    geometry.setAttribute(name, new THREE.BufferAttribute(values, source.itemSize));
  }
  geometry.setIndex(mesh.geometry.index ? [...mesh.geometry.index.array] : null);
  geometry.applyMatrix4(mesh.matrixWorld);
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

// A house is dozens of kit parts, but only a handful of materials, so it can be a handful of draw calls.
function mergedByMaterial(group) {
  group.updateMatrixWorld(true);
  const lists = new Map();
  group.traverse((node) => {
    if (!node.isMesh) return;
    if (!lists.has(node.material)) lists.set(node.material, []);
    lists.get(node.material).push(bakedGeometry(node));
  });
  const merged = new THREE.Group();
  for (const [material, parts] of lists) merged.add(new THREE.Mesh(mergeGeometries(parts, false), material));
  merged.userData = { ...group.userData };
  return merged;
}

export async function loadWorld(id, look) {
  const data = WORLD_LOOKS[id];
  const files = new Map(await Promise.all(data.kits.map(async (kit) => [kit, (await loadAsset(`kit/${kit}`)).scene])));

  function piece(entry, maxWidth) {
    const [path, height] = entry.split("@");
    const [kit, name] = path.split(":");
    if (kit === "proc") return makeProp(name, { id, data }, height ? Number(height) : null, maxWidth);
    const source = files.get(kit).getObjectByName(name);
    if (!source) throw new Error(`Kit ${kit} has no model named ${name}`);
    const copy = cloneSkinned(source);
    copy.position.set(0, 0, 0);
    copy.rotation.set(0, 0, 0);
    return grounded(copy, height ? Number(height) : null, maxWidth);
  }

  // The village kit is modular, so its houses are assembled from wall and roof pieces. Assembling one
  // is slow and a street only needs a few designs, so each is built once and copied.
  const houses = [];
  function house(random) {
    if (houses.length >= 6) {
      const copy = random.pick(houses);
      return copy.clone(true);
    }
    const made = mergedByMaterial(assembleHouse(random));
    if (data.lights) made.add(makeProp(`houselights${made.userData.storeys}`, { id, data }));
    houses.push(made);
    return made.clone(true);
  }

  function assembleHouse(random) {
    const group = new THREE.Group();
    const brick = random.next() < 0.4;
    const walls = brick ? ["village:Wall_UnevenBrick_Window_Wide_Round", "village:Wall_UnevenBrick_Door_Round"] : ["village:Wall_Plaster_Window_Wide_Round", "village:Wall_Plaster_Door_Round", "village:Wall_Plaster_WoodGrid"];
    const wall = (x, z, turn, storey) => {
      const part = piece(random.pick(walls));
      part.position.set(x, storey * 3.1, z);
      part.rotation.y = turn;
      group.add(part);
    };
    const storeys = 1 + random.int(2);
    for (let storey = 0; storey < storeys; storey += 1) {
      for (const x of [-1, 1]) {
        wall(x, 3, 0, storey);
        wall(x, -3, Math.PI, storey);
      }
      for (const z of [-2, 0, 2]) {
        wall(-2, z, -Math.PI / 2, storey);
        wall(2, z, Math.PI / 2, storey);
      }
    }
    const roof = piece("village:Roof_RoundTiles_4x6");
    roof.position.y = storeys * 3.1 - 0.5;
    group.add(roof);
    for (const z of [-2.9, 2.9]) {
      const gable = piece("village:Roof_Front_Brick4");
      gable.position.set(0, storeys * 3.1, z);
      group.add(gable);
    }
    group.userData.storeys = storeys;
    return group;
  }

  const moving = [];
  const onFrame = [];

  function dress(object) {
    object.traverse((node) => {
      if (node.userData.spin || node.userData.sway) moving.push(node);
      if (!node.isMesh) return;
      node.castShadow = !node.userData.flat;
      node.receiveShadow = true;
      if (data.grey && /Rock|Pebble/.test(node.material.name)) {
        node.material = node.material.clone();
        node.material.map = null;
        node.material.color.set("#8f8f97");
      }
    });
    look(object);
    return object;
  }

  const random = createRandom(29);
  const entryFor = (entry, maxWidth) => dress(entry === "house" ? house(random) : piece(entry, maxWidth));

  // Faces a model at the road, or lays it along the road, on the given side of it.
  function turnBeside(entry, side) {
    const name = entry.startsWith("proc:") ? entry.slice(5).split("@")[0] : null;
    const habit = name ? propHabit(name) : "any";
    if (habit === "along") return side > 0 ? Math.PI : 0;
    if (habit === "faces") return side > 0 ? -Math.PI / 2 : Math.PI / 2;
    return random.range(0, 6.28);
  }

  const backdrop = (kind) => data.backdrop?.(kind, { data, dress, onFrame: (update) => onFrame.push(update), proc: entryFor });

  function eachLinePlace(length, visit) {
    for (const line of data.lines ?? []) {
      for (const side of line.sides ?? [-1, 1]) {
        for (let at = line.from ?? 0; at < (line.to ?? length); at += line.every) visit(line, side, at, random.pick([line.entry].flat()));
      }
    }
  }

  // Scenery beside a straight course. It loops, so a run can go on forever on a fixed set of models.
  function strip({ length = 170, clear = data.clear ?? 7 } = {}) {
    const group = new THREE.Group();
    const items = [];
    const add = (entry, x, z, turn) => {
      const object = entryFor(entry);
      object.position.x = x;
      object.rotation.y = turn;
      group.add(object);
      items.push({ object, z });
    };
    if (data.backdrop) group.add(backdrop("strip"));
    eachLinePlace(length, (line, side, z, entry) => add(entry, side * line.x, z, line.mirror ? (side > 0 ? Math.PI : 0) : turnBeside(entry, side)));
    for (const side of [-1, 1]) {
      if (data.walls) for (let z = 0; z < length; z += data.wallLength) add(random.pick(data.walls), side * (clear + 5), z, 0);
      if ((data.farSides ?? [side]).includes(side)) {
        for (let z = 0; z < length; z += data.farSpacing) {
          const far = random.pick(data.far);
          const width = data.farWidth ?? (far.startsWith("city:Building") ? 11 : 4);
          add(far, side * (data.walls ? clear + 3 : clear + 4 + width + random.range(0, 2)), z, side > 0 ? -Math.PI / 2 : Math.PI / 2);
        }
      }
      if (data.behind) for (let z = 0; z < length; z += data.behindSpacing) add(random.pick(data.behind), side * (clear + 27), z, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      if ((data.nearSides ?? [side]).includes(side)) {
        for (let z = 2; z < length; z += data.nearGap ?? 7) {
          const near = random.pick(data.near);
          add(near, side * (clear + random.range(0, 3)), z + random.range(0, 4), near.startsWith("proc:") ? turnBeside(near, side) : random.range(0, 6.28));
        }
      }
    }
    return {
      group,
      scroll(distance) {
        for (const item of items) item.object.position.z = -(((item.z - distance) % length) + length) % length + 16;
      },
    };
  }

  // A backdrop behind a side-on game, in layers that loop around the camera.
  function layers({ length = 120 } = {}) {
    const group = new THREE.Group();
    const items = [];
    if (data.walls) {
      for (let x = 0; x < length; x += data.wallLength) {
        const object = entryFor(random.pick(data.walls));
        object.position.z = -15;
        object.rotation.y = Math.PI / 2;
        group.add(object);
        items.push({ object, x });
      }
    }
    if (data.backdrop) group.add(backdrop("layers"));
    eachLinePlace(length, (line, side, x, entry) => {
      if (line.depth === undefined || side !== (line.sides ?? [1])[0]) return;
      const object = entryFor(entry);
      object.position.z = line.depth;
      object.rotation.y = -Math.PI / 2;
      group.add(object);
      items.push({ object, x });
    });
    if (data.behind) {
      for (let x = 0; x < length; x += data.behindSpacing) {
        const object = entryFor(random.pick(data.behind));
        object.position.z = -62;
        group.add(object);
        items.push({ object, x });
      }
    }
    for (const [near, far] of data.noFarInLayers ? [] : [[-16, -34], [-40, -70]]) {
      for (let x = 0; x < length; x += data.farSpacing) {
        const object = entryFor(random.pick(data.far));
        object.position.z = data.walls ? -13 : random.range(near, far);
        object.rotation.y = random.range(-0.4, 0.4);
        group.add(object);
        items.push({ object, x: x + random.range(0, data.farSpacing / 2) });
      }
    }
    const [front, back] = data.nearDepth ?? [-5, -12];
    for (let x = 0; x < length; x += 6) {
      const entry = random.pick(data.near);
      const object = entryFor(entry);
      object.position.z = random.range(back, front);
      if (entry.startsWith("proc:")) object.rotation.y = propHabit(entry.slice(5).split("@")[0]) === "along" ? Math.PI / 2 : 0;
      group.add(object);
      items.push({ object, x: x + random.range(0, 3) });
    }
    return {
      group,
      scroll(cameraX) {
        for (const item of items) item.object.position.x = cameraX + ((((item.x - cameraX) % length) + length) % length) - length / 2;
      },
    };
  }

  // Scenery around a fixed arena, leaving the middle clear.
  function ring({ inner = 12, count = 44 } = {}) {
    const group = new THREE.Group();
    if (data.backdrop) {
      // Views clear the middle of a ring by position, so the backdrop hangs from a point outside it.
      const anchor = new THREE.Group();
      anchor.position.z = 60;
      const scene = backdrop("ring");
      scene.position.z = -60;
      anchor.add(scene);
      group.add(anchor);
    }
    if (data.walls) {
      const radius = inner + 8;
      const sides = Math.ceil((Math.PI * 2 * radius) / data.wallLength);
      for (let i = 0; i < sides; i += 1) {
        const angle = (i / sides) * Math.PI * 2;
        const wall = entryFor(random.pick(data.walls));
        wall.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        wall.rotation.y = -angle;
        group.add(wall);
      }
    }
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + random.range(-0.1, 0.1);
      const far = i % 3 !== 0;
      const entry = random.pick(far ? data.far : data.near);
      const radius = far ? inner + (data.walls ? 3 : 15 + random.range(0, 14)) : inner + random.range(0, 4);
      const [x, z] = [Math.cos(angle) * radius, Math.sin(angle) * radius];
      if (data.keepInRing && !data.keepInRing(x, z)) continue;
      const object = entryFor(entry);
      object.position.set(x, 0, z);
      object.rotation.y = -angle - Math.PI / 2;
      group.add(object);
    }
    return group;
  }

  return {
    id, data,
    role(role, maxWidth = 2) {
      // A coach and its ramp are as long as they are, and are never squeezed into a lane.
      const entry = random.pick([data[role]].flat());
      const object = entryFor(entry, role === "train" || role === "ramp" ? undefined : maxWidth);
      // Procedural pickups are drawn to be recognised, so they keep their own colours.
      if (role === "pickup" && !entry.startsWith("proc:")) {
        object.traverse((node) => {
          if (!node.isMesh) return;
          node.material = new THREE.MeshStandardMaterial({ color: data.accent, emissive: data.accent, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.35 });
        });
        look(object);
      }
      return object;
    },
    pieceOf: (entry, maxWidth) => entryFor(entry, maxWidth),
    sky(style) {
      const dome = skyDome(style.sky?.[0] ?? data.sky[0], style.sky?.[1] ?? data.sky[1], data);
      for (const item of data.show?.() ?? []) {
        dome.add(item.group);
        onFrame.push(item.update);
      }
      return dome;
    },
    // For a world with moving parts. Everything that burns runs on the GPU, off this one clock.
    update(dt, elapsed) {
      clock.value = elapsed;
      screen.value = window.innerHeight * Math.min(window.devicePixelRatio, 1.5);
      for (const node of moving) {
        if (node.userData.spin) {
          node.rotation.x += node.userData.spin[0] * dt;
          node.rotation.y += node.userData.spin[1] * dt;
          node.rotation.z += node.userData.spin[2] * dt;
        } else {
          const { amount, speed } = node.userData.sway;
          node.rotation.z = Math.sin(elapsed * speed) * amount;
          node.rotation.y = Math.sin(elapsed * speed * 0.6 + 1) * amount * 0.5;
        }
      }
      for (const update of onFrame) update(dt, elapsed);
    },
    ground(size = 700) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: speckled(data.ground, { repeat: [size / 12, size / 12] }), roughness: 1 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -0.03;
      mesh.receiveShadow = true;
      look(mesh);
      return mesh;
    },
    // The running surface, with lane lines drawn into a texture that slides under the player.
    road(width, length = 240) {
      const map = speckled(data.path, { line: data.line, dash: true, repeat: [1, length / 16], patched: data.patched });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), new THREE.MeshStandardMaterial({ map, roughness: 0.9 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.02, -length / 2 + 20);
      mesh.receiveShadow = true;
      look(mesh);
      return { mesh, scroll: (distance) => { map.offset.y = distance / 16; } };
    },
    strip, layers, ring,
    material: (colour, extra) => new THREE.MeshStandardMaterial({ color: colour, roughness: 0.65, ...extra }),
    dress,
  };
}
