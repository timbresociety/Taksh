// What makes a world safe to ship, as checks a machine can run. Games ask a world for roles, so a role
// that is missing or points at nothing breaks every game at once. Runs in tests and scripts/world-check.mjs.
import * as THREE from "three";

export const ROLES = ["far", "near", "low", "wall", "pickup", "hazard", "train", "ramp"];
const COLOURS = ["ground", "path", "line", "accent", "haze"];
const MIN_LINE_CONTRAST = 1.5; // lane lines have to read against the road
const MIN_ACCENT_CONTRAST = 1.5;
const CLEARANCE = 4.2; // metres of open air above the road; anything higher, like bunting, may cross it
const ROAD_SURFACE = 0.03; // just above the road, so ground lying under it does not count
const ROAD_AHEAD = 170;
const BEHIND_CAMERA = 16;

const luminance = (hex) => {
  const channels = new THREE.Color(hex);
  return 0.2126 * channels.r + 0.7152 * channels.g + 0.0722 * channels.b;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

const entriesOf = (world) => [
  ...[...ROLES, "high"].flatMap((role) => [world[role] ?? []].flat()), // high is optional: a plain bar stands in
  ...[world.behind, world.walls].flatMap((list) => list ?? []),
  ...(world.lines ?? []).flatMap((line) => [line.entry].flat()),
];

// models maps each kit to the names inside it, and props lists the models built in code.
export function checkWorld(id, world, { props, models }) {
  const problems = [];
  for (const role of ROLES) {
    if (![world[role] ?? []].flat().length) problems.push(`${id}: nothing fills the ${role} role`);
  }
  for (const key of COLOURS) {
    if (!/^#[0-9a-f]{6}$/i.test(world[key] ?? "")) problems.push(`${id}: ${key} is not a colour`);
  }
  if (problems.length) return problems;

  for (const entry of entriesOf(world)) {
    const [source, name] = entry.split("@")[0].split(":");
    if (entry === "house") {
      if (!world.houses) problems.push(`${id}: uses houses without setting houses: true`);
    } else if (source === "proc") {
      if (!props.includes(name)) problems.push(`${id}: no prop called ${name}`);
    } else if (!world.kits.includes(source)) {
      problems.push(`${id}: ${entry} needs the ${source} kit, which this world does not load`);
    } else if (!models[source]?.has(name)) {
      problems.push(`${id}: the ${source} kit has no ${name}`);
    }
  }
  if (contrast(world.line, world.path) < MIN_LINE_CONTRAST) problems.push(`${id}: lane lines are too close to the road colour`);
  if (contrast(world.accent, world.path) < MIN_ACCENT_CONTRAST) problems.push(`${id}: the accent is too close to the road colour`);
  if ([world.pickup].flat().some((entry) => [world.hazard].flat().includes(entry))) problems.push(`${id}: a pickup and a hazard look the same`);
  return problems;
}

// True if any of a mesh's real faces enter the corridor. Its box is not enough: an arch's box fills the
// road while the road runs clear underneath it.
function entersCorridor(mesh, corridor) {
  if (!new THREE.Box3().setFromObject(mesh).intersectsBox(corridor)) return false;
  const { attributes: { position }, index } = mesh.geometry;
  if (mesh.isInstancedMesh) return true;
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const triangle = new THREE.Triangle(...corners);
  const count = index ? index.count : position.count;
  for (let first = 0; first + 2 < count; first += 3) {
    corners.forEach((corner, offset) => corner.fromBufferAttribute(position, index ? index.getX(first + offset) : first + offset).applyMatrix4(mesh.matrixWorld));
    if (corridor.intersectsTriangle(triangle)) return true;
  }
  return false;
}

// Scenery standing in the player's way, on a built scene: the air above the road, ahead of the camera.
export function roadBlockers(scene, roadHalfWidth) {
  const corridor = new THREE.Box3(new THREE.Vector3(-roadHalfWidth, ROAD_SURFACE, -ROAD_AHEAD), new THREE.Vector3(roadHalfWidth, CLEARANCE, BEHIND_CAMERA));
  const blockers = new Set();
  scene.updateMatrixWorld(true);
  scene.traverse((group) => {
    if (group.name !== "scenery") return;
    group.traverse((node) => {
      if (!node.isMesh || node.userData.light || !entersCorridor(node, corridor)) return;
      const box = new THREE.Box3().setFromObject(node);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      blockers.add(`${node.name || node.parent?.name || "unnamed"}, ${size.x.toFixed(1)} by ${size.y.toFixed(1)} by ${size.z.toFixed(1)} m, at x ${centre.x.toFixed(1)}, z ${centre.z.toFixed(1)}`);
    });
  });
  return [...blockers];
}
