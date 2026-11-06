// Koli Race: painted fishing boats on a channel cut through whatever world this is, seen from the stern.
import * as THREE from "three";
import { steering } from "../../templates/drive.js";
import { CHANNEL } from "../../templates/oars.js";
import { createCharacter } from "../character.js";
import { MOVE_POSES, applyPose } from "../coach.js";
import { forge } from "../props/forge.js";
import { Pool, damp } from "./shared.js";

const WATER_WIDTH = (CHANNEL + 1.1) * 2;
const WATER_LENGTH = 260;
const RIPPLE_M = 13;
const SHOW_AHEAD = 130;
const SHOW_BEHIND = 12;
const LENGTH = 5.2;
const SEAT = 0.1;
const CREWS = [
  { hull: "#1763a8", band: "#ffd23f", rail: "#f4efe2", flag: "#e8407f" },
  { hull: "#0f7a5c", band: "#f4efe2", rail: "#ff7a1a", flag: "#ffd23f" },
  { hull: "#a8201f", band: "#16b8ff", rail: "#f4efe2", flag: "#35d07f" },
  { hull: "#55308f", band: "#ff7a1a", rail: "#ffd23f", flag: "#16b8ff" },
];

// s runs from the stern at 0 to the bow at 1: a narrow sharp boat with its nose thrown up.
const beam = (s) => 0.82 * Math.sin(Math.PI * (0.14 + 0.85 * s)) ** 0.75;
const sheer = (s) => 0.62 + 0.75 * s ** 3 + 0.16 * (1 - s) ** 2;
const keel = (s) => -0.08 + 0.42 * s ** 4;

// One band of the hull, from t0 up to t1 of the way from keel to rail. Each side has an outer and an
// inner skin with its own points, because a shared point would average the two normals away.
function hullBand(t0, t1) {
  const stations = 18;
  const rows = 3;
  const points = [];
  const faces = [];
  for (const [side, inner] of [[-1, false], [-1, true], [1, false], [1, true]]) {
    const base = points.length / 3;
    for (let i = 0; i <= stations; i += 1) {
      const s = i / stations;
      for (let j = 0; j <= rows; j += 1) {
        const t = t0 + ((t1 - t0) * j) / rows;
        points.push(side * beam(s) * Math.sin((t * Math.PI) / 2) ** 0.7, keel(s) + (sheer(s) - keel(s)) * t, LENGTH * (0.5 - s));
      }
    }
    const outward = side > 0 !== inner;
    for (let i = 0; i < stations; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const a = base + i * (rows + 1) + j;
        const b = a + rows + 1;
        if (outward) faces.push(a, b, a + 1, b, b + 1, a + 1);
        else faces.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((points.length / 3) * 2).fill(0), 2));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return geometry;
}

function hull(look) {
  const b = forge();
  b.add(hullBand(0, 0.58), look.hull);
  b.add(hullBand(0.58, 0.8), look.band);
  b.add(hullBand(0.8, 1), look.rail);
  b.box(1, 0.05, 3.3, "#7a5230", { at: [0, 0.14, 0.15] });
  for (const z of [-0.85, 1.05]) b.box(1.32, 0.06, 0.28, "#9a6c3e", { at: [0, 0.4, z] });
  b.box(0.08, 1.1, 0.1, look.rail, { at: [0, 1.25, -2.46], turn: [-0.5, 0, 0] });
  // The tall pole at the stern with the crew's flag, which is how a Koli boat is known from far off.
  b.cyl(0.03, 2.6, "#6b4526", { at: [0, 1.5, 2.2] });
  b.plate([[0, 0], [0.85, 0.2], [0, 0.42]], 0.02, look.flag, { at: [0, 2.35, 2.2] });
  b.plate([[0, 0], [0.6, 0.15], [0, 0.3]], 0.02, look.band, { at: [0, 1.95, 2.2] });
  return b.finish();
}

function oar(world) {
  const pivot = new THREE.Group();
  const wood = world.material("#b98a55");
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.9, 8), wood);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 1.1;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.2), world.material("#e8e0cc"));
  blade.position.x = 2.5;
  pivot.add(shaft, blade);
  pivot.traverse((node) => {
    node.castShadow = true;
  });
  return pivot;
}

function makeBoat(world, look, rower) {
  const group = new THREE.Group();
  const body = world.dress(hull(look));
  group.add(body);
  rower.root.position.set(0, SEAT, 0.32);
  rower.root.rotation.y = Math.PI;
  group.add(rower.root);
  const oars = [-1, 1].map((side) => {
    const pivot = oar(world);
    pivot.position.set(side * 0.74, 0.74, 0.1);
    pivot.scale.x = side;
    group.add(pivot);
    return world.dress(pivot);
  });
  return { group, oars, rower, phase: Math.random() };
}

function pullOars(boat, rate, dt) {
  boat.phase = (boat.phase + (rate * dt) / 6) % 1;
  const pull = Math.sin(boat.phase * Math.PI * 6);
  boat.oars.forEach((pivot, index) => {
    const lead = index ? -pull : pull;
    pivot.rotation.y = lead * 0.5 * pivot.scale.x;
    pivot.rotation.z = (0.24 + Math.max(0, lead) * 0.16) * -pivot.scale.x;
  });
  applyPose(boat.rower, MOVE_POSES.arm_pump(boat.phase), { flip: true });
}

function rippleTexture(colour, light) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const pen = canvas.getContext("2d");
  pen.fillStyle = colour;
  pen.fillRect(0, 0, 256, 256);
  pen.strokeStyle = light;
  pen.lineCap = "round";
  for (let i = 0; i < 90; i += 1) {
    const x = (i * 73) % 256;
    const y = (i * 151) % 256;
    pen.globalAlpha = 0.18 + (i % 4) * 0.1;
    pen.lineWidth = 2 + (i % 3);
    pen.beginPath();
    pen.moveTo(x, y);
    pen.quadraticCurveTo(x + 14, y - 5, x + 30 + (i % 5) * 6, y);
    pen.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(WATER_WIDTH / RIPPLE_M, WATER_LENGTH / RIPPLE_M);
  texture.anisotropy = 8;
  return texture;
}

// Water takes a little of each world's sky, so the moon's is pale and Diwali's is dark.
function channel(world) {
  const { data } = world;
  const base = new THREE.Color("#1a7f96").lerp(new THREE.Color(data.sky[1]), 0.3);
  const map = rippleTexture(`#${base.getHexString()}`, "#e6fbff");
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WATER_WIDTH, WATER_LENGTH), new THREE.MeshStandardMaterial({ map, roughness: 0.32, metalness: 0.08 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.03, -WATER_LENGTH / 2 + 20);
  water.receiveShadow = true;
  const group = new THREE.Group();
  group.add(water);
  for (const side of [-1, 1]) {
    const quay = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, WATER_LENGTH), world.material(data.platform[0]));
    quay.position.set(side * (WATER_WIDTH / 2 + 0.5), 0.24, -WATER_LENGTH / 2 + 20);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, WATER_LENGTH), world.material(data.platform[1]));
    face.position.set(side * (WATER_WIDTH / 2 + 0.03), 0.13, -WATER_LENGTH / 2 + 20);
    group.add(quay, face);
  }
  return { group: world.dress(group), scroll: (distance) => { map.offset.y = distance / RIPPLE_M; } };
}

function finishGate(world) {
  const group = new THREE.Group();
  const span = WATER_WIDTH + 1.4;
  const pole = world.material("#2b2d33");
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 5.4, 0.28), pole);
    post.position.set((side * span) / 2, 2.7, 0);
    group.add(post);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const pen = canvas.getContext("2d");
  for (let x = 0; x < 32; x += 1) {
    for (let y = 0; y < 4; y += 1) {
      pen.fillStyle = (x + y) % 2 ? "#ffffff" : "#16181f";
      pen.fillRect(x * 32, y * 32, 32, 32);
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(span, 0.9, 0.08), new THREE.MeshStandardMaterial({ map }));
  banner.position.y = 5;
  group.add(banner);
  return world.dress(group);
}

export const oars = {
  usesRival: true,
  async build({ scene, camera, world, hero, rival, fx, focusShadow, spec, accent }) {
    const water = channel(world);
    const side = world.strip();
    const items = new THREE.Group();
    scene.add(water.group, side.group, items);

    const copies = await Promise.all([createCharacter(spec.skin.rival), createCharacter(spec.skin.rival)]);
    const crews = [rival, ...copies];
    crews.forEach((character) => {
      world.dress(character.root);
      character.play("Sitting_Idle_Loop");
    });
    hero.play("Sitting_Idle_Loop");
    const mine = makeBoat(world, CREWS[0], hero);
    const others = crews.map((character, index) => makeBoat(world, CREWS[index + 1], character));
    scene.add(mine.group, ...others.map((boat) => boat.group));

    const hazards = new Pool(items, (item) => (item.kind === "log" ? world.role("low", 2.6) : world.role("hazard", 1.15)));
    const fish = new Pool(items, () => world.role("pickup", 0.7));
    const gate = finishGate(world);
    scene.add(gate);

    let x = 0;
    let heel = 0;
    let cameraX = 0;
    let foam = 0;

    return {
      update(state, dt, elapsed) {
        const { distance, driver } = state;
        side.scroll(distance);
        water.scroll(distance);
        const close = (item) => item.at - distance < SHOW_AHEAD && item.at - distance > -SHOW_BEHIND;
        hazards.sync(state.hazards.filter(close), (object, item) => {
          object.position.set(item.x, 0.05 + Math.sin(elapsed * 1.8 + item.id) * 0.05, -(item.at - distance));
          object.rotation.z = Math.sin(elapsed * 1.3 + item.id) * 0.05;
        });
        fish.sync(state.fish.filter((item) => !item.taken && close(item)), (object, item) => {
          object.position.set(item.x, 0.55 + Math.sin(elapsed * 3 + item.id) * 0.12, -(item.at - distance));
          object.rotation.y = elapsed * 2.6 + item.id;
        });
        gate.position.z = -(state.finishM - distance);

        x = state.x;
        heel = damp(heel, steering(driver), 8, dt);
        mine.group.position.set(x, 0.1 + Math.sin(elapsed * 2.1) * 0.03, 0);
        mine.group.rotation.set(Math.sin(elapsed * 1.7) * 0.012, -heel * 0.2, -heel * 0.09);
        pullOars(mine, driver.rate, dt);
        mine.group.visible = state.bumpMs <= 0 || Math.sin(elapsed * 34) > -0.2;

        for (const [index, boat] of others.entries()) {
          const crew = state.rivals[index];
          if (index > 0) boat.rower.update(dt);
          boat.group.visible = crew.distance - distance < SHOW_AHEAD && crew.distance - distance > -SHOW_BEHIND;
          boat.group.position.set(crew.x, 0.1 + Math.sin(elapsed * 2 + index) * 0.03, -(crew.distance - distance));
          pullOars(boat, (crew.speed / state.top) * state.fullBeats, dt);
        }

        foam -= dt * state.speed;
        if (foam <= 0 && state.speed > 1) {
          foam = 2.4;
          fx.burst({ x: x + (Math.random() - 0.5) * 0.8, y: 0.1, z: 2.6 }, "#e8f8ff", 4);
        }

        cameraX = damp(cameraX, x * 0.55, 5, dt);
        camera.position.set(cameraX, 3.7, 8.4);
        camera.lookAt(cameraX, 1, -12);
        focusShadow(0, 0, -6);
      },
      event(event, state) {
        if (event.type === "stroke") for (const sideX of [-2.7, 2.7]) fx.burst({ x: state.x + sideX, y: 0.1, z: 0.3 }, "#dff6ff", 5);
        if (event.type === "coin") fx.burst({ x: state.x, y: 1, z: -1 }, accent, 16);
        if (event.type === "pass") fx.burst({ x: state.x, y: 2, z: 0 }, accent, 26);
        if (event.type === "hurt") {
          fx.shake(0.45);
          fx.flash("#ff3b4e", 0.28);
        }
        if (event.type === "finish") {
          fx.flash(accent, 0.35);
          for (const sideX of [-3, 0, 3]) fx.burst({ x: sideX, y: 3, z: -3 }, event.place === 1 ? "#ffd23f" : accent, 40);
        }
      },
    };
  },
};
