// Builds chunky low-poly props from primitives. Colours live in one shared palette texture, so a whole
// prop merges into one mesh and one draw call, and art styles convert it like any textured kit model.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const CELL = 8;
const GRID = 32;

function makePalette() {
  const canvas = document.createElement("canvas");
  canvas.width = CELL * GRID;
  canvas.height = CELL * GRID;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Mipmaps would bleed one colour into the next.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  return { pen: canvas.getContext("2d"), texture, cells: new Map() };
}

let palette = null;
function paletteCell(colour) {
  palette ??= makePalette();
  const { cells, pen, texture } = palette;
  if (!cells.has(colour)) {
    const index = Math.min(cells.size, GRID * GRID - 1);
    const x = (index % GRID) * CELL;
    const y = Math.floor(index / GRID) * CELL;
    pen.fillStyle = colour;
    pen.fillRect(x, y, CELL, CELL);
    texture.needsUpdate = true;
    cells.set(colour, [(x + CELL / 2) / (CELL * GRID), 1 - (y + CELL / 2) / (CELL * GRID)]);
  }
  return cells.get(colour);
}

const ATLAS = 2048;
let atlas = null;
function makeAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { pen: canvas.getContext("2d"), texture, regions: new Map(), x: 0, y: 0, row: 0 };
}

// Painted details share one big canvas, so signs and rangoli cost no extra materials. Regions pack in
// rows, and each is painted once, the first time something asks for it.
export function artRegion(name, width, height, paint) {
  atlas ??= makeAtlas();
  if (atlas.regions.has(name)) return atlas.regions.get(name);
  const gap = 6;
  if (atlas.x + width + gap > ATLAS) {
    atlas.x = 0;
    atlas.y += atlas.row + gap;
    atlas.row = 0;
  }
  const { pen } = atlas;
  pen.save();
  pen.translate(atlas.x, atlas.y);
  pen.beginPath();
  pen.rect(0, 0, width, height);
  pen.clip();
  paint(pen, width, height);
  pen.restore();
  const region = { u0: atlas.x / ATLAS, u1: (atlas.x + width) / ATLAS, v0: 1 - (atlas.y + height) / ATLAS, v1: 1 - atlas.y / ATLAS };
  atlas.regions.set(name, region);
  atlas.x += width + gap;
  atlas.row = Math.max(atlas.row, height);
  atlas.texture.needsUpdate = true;
  return region;
}

const materials = {};
const LAYERS = {
  solid: () => new THREE.MeshStandardMaterial({ map: palette.texture, roughness: 0.74 }),
  metal: () => new THREE.MeshStandardMaterial({ map: palette.texture, roughness: 0.32, metalness: 0.75 }),
  // Lights stay lit in every style, so they are never redrawn. Above 1 so bloom can catch them.
  glow: () => new THREE.MeshBasicMaterial({ map: palette.texture, color: new THREE.Color(1.7, 1.7, 1.7) }),
  art: () => new THREE.MeshStandardMaterial({ map: atlas.texture, roughness: 0.8, alphaTest: 0.4, side: THREE.DoubleSide }),
};
const materialFor = (layer) => (materials[layer] ??= LAYERS[layer]());

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const euler = new THREE.Euler();
const stretch = new THREE.Vector3();

function place(geometry, { at = [0, 0, 0], turn = [0, 0, 0], scale = [1, 1, 1] }) {
  euler.set(...turn);
  rotation.setFromEuler(euler);
  matrix.compose(position.set(...at), rotation, typeof scale === "number" ? stretch.setScalar(scale) : stretch.set(...scale));
  geometry.applyMatrix4(matrix);
  return geometry;
}

function flat(geometry) {
  const plain = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(plain.attributes)) if (!["position", "normal", "uv"].includes(name)) plain.deleteAttribute(name);
  plain.clearGroups();
  return plain;
}

export function forge() {
  const layers = new Map();
  let frame = null;

  function store(layer, geometry, options) {
    if (!layers.has(layer)) layers.set(layer, []);
    place(geometry, options);
    if (frame) geometry.applyMatrix4(frame);
    layers.get(layer).push(geometry);
    return api;
  }

  function add(geometry, colour, options = {}) {
    const plain = flat(geometry);
    const [u, v] = paletteCell(colour);
    const uv = plain.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, u, v);
    return store(options.glow ? "glow" : options.metal ? "metal" : "solid", plain, options);
  }

  const api = {
    add,
    box: (w, h, d, colour, options) => add(new THREE.BoxGeometry(w, h, d), colour, options),
    // A box given by its extents, which reads better than centres for buildings.
    slab(x0, x1, y0, y1, z0, z1, colour, options) {
      return add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), colour, { ...options, at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
    },
    cyl: (radius, height, colour, { top = radius, segments = 10, ...options } = {}) => add(new THREE.CylinderGeometry(top, radius, height, segments), colour, options),
    ball: (radius, colour, { detail = 1, ...options } = {}) => add(new THREE.IcosahedronGeometry(radius, detail), colour, options),
    cone: (radius, height, colour, { segments = 8, ...options } = {}) => add(new THREE.ConeGeometry(radius, height, segments), colour, options),
    torus: (radius, thickness, colour, { arc = Math.PI * 2, segments = 16, sides = 6, ...options } = {}) => add(new THREE.TorusGeometry(radius, thickness, sides, segments, arc), colour, options),
    // [[radius, y], ...] spun around the y axis.
    lathe: (points, colour, { segments = 12, ...options } = {}) => add(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments), colour, options),
    // A flat outline [[x, y], ...] thickened along z and centred on it.
    plate(points, depth, colour, { bevel = 0, ...options } = {}) {
      const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 6 });
      geometry.translate(0, 0, -depth / 2);
      return add(geometry, colour, options);
    },
    // A side view [[z, y], ...] thickened across x. Vehicle bodies are drawn this way, nose towards -z.
    profile(points, width, colour, options = {}) {
      const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
      geometry.translate(0, 0, -width / 2);
      geometry.rotateY(-Math.PI / 2);
      return add(geometry, colour, options);
    },
    // A rope through [[x, y, z], ...]. Few sides, because it is only ever seen from a distance.
    tube(points, radius, colour, { sides = 4, steps = 12, ...options } = {}) {
      const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
      return add(new THREE.TubeGeometry(curve, steps, radius, sides), colour, options);
    },
    // A painted card from the art atlas.
    card(width, height, region, options = {}) {
      const geometry = flat(new THREE.PlaneGeometry(width, height));
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i += 1) uv.setXY(i, region.u0 + uv.getX(i) * (region.u1 - region.u0), region.v0 + uv.getY(i) * (region.v1 - region.v0));
      return store(options.lying ? "flatArt" : "art", geometry, options);
    },
    // Runs build with everything it adds moved, so one prop can be set down inside another.
    within({ at = [0, 0, 0], turn = [0, 0, 0], scale = 1 }, build) {
      const outer = frame;
      const local = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...turn)), new THREE.Vector3(scale, scale, scale));
      frame = outer ? outer.clone().multiply(local) : local;
      build(api);
      frame = outer;
      return api;
    },
    // Merges everything added so far, one mesh per material. Anything in extras (spinning parts, flames)
    // is added as it is, and does not count towards the size used to fit the prop.
    finish(...extras) {
      const group = new THREE.Group();
      const box = new THREE.Box3();
      for (const [layer, parts] of layers) {
        const geometry = mergeGeometries(parts, false);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        box.union(geometry.boundingBox);
        const mesh = new THREE.Mesh(geometry, materialFor(layer === "flatArt" ? "art" : layer));
        if (layer === "glow") mesh.userData.keepMaterial = true;
        if (layer === "glow" || layer === "flatArt") mesh.userData.flat = true;
        group.add(mesh);
      }
      if (extras.length) group.add(...extras);
      const size = box.getSize(new THREE.Vector3());
      group.userData.size = size.toArray();
      return group;
    },
  };
  return api;
}

// A plain mesh that uses the palette, for a part that has to move on its own.
export function part(build) {
  const parts = forge();
  build(parts);
  const group = parts.finish();
  group.userData = {};
  return group;
}
