// Blade March: raiders close in down a road, then the road ends at a boss. The bosses and the masked
// fighters live here because Four Corners fights the same ones.
import * as THREE from "three";
import { BOSSES } from "../../templates/bosses.js";
import { REACH_MS } from "../../templates/blades.js";
import { createCharacter } from "../character.js";
import { addCrown, addHeads, addHorns } from "../props/bosses.js";
import { ARROW_COLOURS, arrowGlow, arrowTexture } from "./matka.js";
import { damp, holdOnBone, wordCard } from "./shared.js";

const SLASH_CLIPS = { left: "Sword_Regular_B", right: "Sword_Regular_A", up: "Sword_Regular_C", down: "Sword_Attack" };
const RAIDERS = 5;
const SIDE_PATHS = {
  left: { from: [-8.5, 0, -11], to: [-1.7, 0, -0.6], turn: 0.75 },
  right: { from: [8.5, 0, -11], to: [1.7, 0, -0.6], turn: -0.75 },
  up: { from: [0, 7, -13], to: [0, 1.9, -2], turn: 0 },
  down: { from: [0.4, 0, -15], to: [0.4, 0, -2], turn: 0 },
};
const SIDE_CLIPS = { left: "Jog_Fwd_Loop", right: "Jog_Fwd_Loop", up: "Jump_Loop", down: "Crouch_Fwd_Loop" };

export function sword(world, length = 1.05) {
  const group = new THREE.Group();
  const steel = world.material("#dfe6ee", { metalness: 0.75, roughness: 0.28 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, length, 0.012), steel);
  blade.position.y = 0.13 + length / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), steel);
  tip.position.y = 0.13 + length + 0.06;
  tip.scale.z = 0.3;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.05), world.material("#d9a441", { metalness: 0.6, roughness: 0.35 }));
  guard.position.y = 0.12;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.17, 8), world.material("#4a2a18"));
  grip.position.y = 0.03;
  group.add(blade, tip, guard, grip);
  return world.dress(group);
}

function maskTexture(colour) {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const pen = canvas.getContext("2d");
  pen.fillStyle = colour;
  pen.beginPath();
  pen.ellipse(96, 96, 84, 92, 0, 0, Math.PI * 2);
  pen.fill();
  pen.lineWidth = 7;
  pen.strokeStyle = "#17110d";
  pen.stroke();
  pen.fillStyle = "#17110d";
  for (const dir of [-1, 1]) {
    pen.beginPath();
    pen.moveTo(96 + dir * 16, 72);
    pen.lineTo(96 + dir * 62, 58);
    pen.lineTo(96 + dir * 54, 92);
    pen.lineTo(96 + dir * 20, 92);
    pen.closePath();
    pen.fill();
  }
  pen.fillRect(70, 132, 52, 12);
  pen.fillStyle = "#fff4d6";
  for (const dir of [-1, 1]) {
    pen.beginPath();
    pen.arc(96 + dir * 38, 78, 7, 0, Math.PI * 2);
    pen.fill();
  }
  pen.fillRect(90, 30, 12, 44);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A painted mask over the face, so a fighter reads as a raider whatever body the rival was given.
function mask(character, world, colour) {
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.31), new THREE.MeshBasicMaterial({ map: maskTexture(colour), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false }));
  face.userData.keepMaterial = true;
  holdOnBone(character.bones.get("Head"), face, [0, 0.09, 0.115]);
}

// Extra copies of the rival. The stage animates its own cast, so the view updates these.
export async function fighterCrew({ world, rival, spec, count, weapon }) {
  const copies = await Promise.all(Array.from({ length: count - 1 }, () => createCharacter(spec.skin.rival)));
  return [rival, ...copies].map((character, index) => {
    world.dress(character.root);
    mask(character, world, ["#d8342c", "#e8b923", "#2f9e8f", "#7a4fd0", "#f07a1f"][index % 5]);
    if (weapon) holdOnBone(character.bones.get("hand_r"), weapon(world));
    character.root.visible = false;
    return { character, enemyId: null, busyMs: 0 };
  });
}

const BOSS_LOOKS = {
  ravana: { body: "athlete-male", hair: "none", skinTone: "#a86e4a", hairColour: "#16100c", top: "#8a1420", bottom: "#d9a441", shoes: "#5a1220" },
  kumbhakarna: { body: "athlete-male", hair: "buzzed", skinTone: "#6e4630", hairColour: "#16100c", top: "#3a5a3a", bottom: "#c8742b", shoes: "#2a1408" },
};

const SIZE = { ravana: 3, kumbhakarna: 3 };

// Ten heads on one body, nine in the fan and the king's own in the middle, in two rows so that every
// corner of the screen has a head in it. Each one looks around, flinches and goes out on its own.
async function ravanaFigure({ scene, world, boss, hero, fx, z }) {
  const character = await createCharacter(BOSS_LOOKS.ravana);
  const fan = addHeads(character, boss.parts.length - 1, { separate: true });
  fan.children.at(-1).visible = false; // the yoke follows a single row, and these necks replace it
  world.dress(fan);
  world.dress(addCrown(character));
  world.dress(character.root);
  character.root.scale.setScalar(SIZE.ravana);
  character.root.position.set(0, 0, z);
  scene.add(character.root);
  character.play("Sword_Idle");
  const blade = sword(world, 1.5);
  blade.scale.setScalar(2.1);
  holdOnBone(character.bones.get("hand_r"), blade);

  const neckMaterial = world.material(BOSS_LOOKS.ravana.skinTone);
  const collar = world.material("#e8b23a", { metalness: 0.6, roughness: 0.35 });
  const heads = boss.parts.map((part, index) => {
    const own = index === boss.parts.length - 1;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.22, 1, 10), neckMaterial);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 16), collar);
    world.dress(neck);
    world.dress(ring);
    if (!own) scene.add(neck, ring);
    return { object: own ? null : fan.heads[index], neck, ring, own, flinch: 0, fall: 0, seed: index * 1.7, at: new THREE.Vector3(), yaw: 0, pitch: 0 };
  });

  const chest = new THREE.Vector3();
  const lean = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(0, 0, 1);
  const heroAt = new THREE.Vector3();
  let lastMood = null;
  let rise = 0;

  return {
    root: character.root,
    extras: heads.flatMap((head) => [head.neck, head.ring]),
    centre: new THREE.Vector3(0, 5.3, z),
    camera: { position: [0, 2.2, 4.3], look: [0, 3.35, z] },
    spotOf(part, out) {
      return out.copy(heads[part.id].at);
    },
    update(state, dt, elapsed) {
      character.update(dt);
      // He strides up the road, heads and all, rather than rising through it.
      rise = damp(rise, 1, 1.6, dt);
      character.root.position.z = z - (1 - rise) * 22;
      character.root.updateMatrixWorld(true);
      character.bones.get("spine_03").getWorldPosition(chest);
      hero.root.getWorldPosition(heroAt);
      if (state.mood !== lastMood) {
        if (state.mood === "enter") character.play("Walk_Formal_Loop", { speed: 0.8 });
        if (lastMood === "enter") character.play("Sword_Idle", { fade: 0.3 });
        if (state.mood === "windup" && state.attack) character.play(state.attack.answer === "defend" ? "Sword_Attack" : "Spell_Simple_Shoot", { once: true, speed: 1000 / state.attack.warnMs, fade: 0.2, then: "Sword_Idle" });
        if (state.mood === "fallen") character.play("Death01", { once: true, fade: 0.3 });
        lastMood = state.mood;
      }
      for (const [index, head] of heads.entries()) {
        const part = state.parts[index];
        const down = part.hp <= 0;
        const open = !down && state.open === index;
        head.fall = damp(head.fall, down ? 1 : 0, 5, dt);
        head.flinch = Math.max(0, head.flinch - dt * 3.5);
        if (head.own) {
          character.bones.get("Head").getWorldPosition(head.at);
          continue;
        }
        // Every head has its own mind until the king attacks, then they all turn on the player.
        const attacking = state.mood === "windup" && !down;
        const wander = Math.sin(elapsed * (0.55 + index * 0.06) + head.seed) * 0.6;
        head.object.getWorldPosition(head.at);
        const atPlayer = Math.atan2(heroAt.x - head.at.x, heroAt.z - head.at.z);
        head.yaw = damp(head.yaw, attacking ? atPlayer : wander, 5, dt);
        head.pitch = damp(head.pitch, attacking ? 0.42 : 0.12 + Math.sin(elapsed * 0.8 + head.seed) * 0.12, 7, dt);
        const sway = Math.sin(elapsed * 0.9 + head.seed) * 0.022;
        head.object.position.set(part.x * 0.94 + sway, (part.y + 0.3) * 0.46 - Math.abs(part.x) * 0.13 + Math.cos(elapsed * 1.2 + head.seed) * 0.015 - head.fall * 0.3, -Math.abs(part.x) * 0.08 - head.flinch * 0.12);
        head.object.rotation.set(head.pitch - head.flinch * 0.7 + head.fall * 0.95, head.yaw * (1 - head.fall), head.fall * (part.x < 0 ? 0.6 : -0.6));
        head.object.scale.setScalar((open ? 1.5 + Math.sin(elapsed * 7) * 0.05 : 1.2) * (1 - head.fall * 0.2));

        lean.copy(head.at).sub(chest);
        const length = lean.length() - 0.34;
        lean.normalize();
        head.neck.position.copy(chest).addScaledVector(lean, length / 2);
        head.neck.scale.set(1, length, 1);
        head.neck.quaternion.setFromUnitVectors(up, lean);
        head.ring.position.copy(chest).addScaledVector(lean, length);
        head.ring.quaternion.setFromUnitVectors(forward, lean);
      }
    },
    event(event, boss) {
      if (event.type === "boss_hit") {
        heads[event.part].flinch = 1;
        // Events arrive a frame after the state, so the blow that ends him must not stand him back up.
        if (boss.mood !== "fallen") character.play("Hit_Head", { once: true, speed: 1.6, fade: 0.06, then: "Sword_Idle" });
      }
      if (event.type === "boss_part") {
        fx.burst(heads[event.part].at, "#ffd86b", 44);
        fx.shake(0.3);
      }
    },
  };
}

// A giant asleep on the road. He rolls to his feet slowly, and every blow leaves him winded.
async function giantFigure({ scene, world, boss, fx, z }) {
  const character = await createCharacter(BOSS_LOOKS.kumbhakarna);
  world.dress(character.root);
  character.root.scale.setScalar(SIZE.kumbhakarna);
  character.root.position.set(0, 0, z);
  scene.add(character.root);
  character.play("Death01", { once: true, fade: 0 });

  world.dress(addHorns(character));
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), world.material("#3a5a3a"));
  belly.scale.set(1, 1.05, 1.05);
  world.dress(belly);
  holdOnBone(character.bones.get("spine_02"), belly, [0, 0, 0.1]);

  const snores = [0, 1, 2].map((index) => {
    const card = wordCard("Z", "#ffffff");
    card.scale.set(1.3, 0.65, 1);
    card.visible = false;
    scene.add(card);
    return { card, seed: index / 3 };
  });
  let lastMood = "sleep";

  return {
    root: character.root,
    extras: snores.map((item) => item.card),
    centre: new THREE.Vector3(0, 3.3, z),
    camera: { position: [0, 2.2, 4.3], look: [0, 3.2, z] },
    spotOf(part, out) {
      return out.set(part.x * 2.9, 3.1 + part.y * 2.5, z + 1.4);
    },
    update(state, dt, elapsed) {
      character.update(dt);
      const asleep = state.mood === "sleep";
      for (const { card, seed } of snores) {
        const p = (elapsed * 0.32 + seed) % 1;
        card.visible = asleep;
        card.position.set(-2 + p * 1.5, 2 + p * 3, z);
        card.material.opacity = 1 - p;
        card.scale.set(0.8 + p * 1.2, 0.4 + p * 0.6, 1);
      }
      if (state.mood === lastMood) return;
      if (state.mood === "wake") character.play("LayToIdle", { once: true, speed: 0.75, fade: 0.2, then: "Zombie_Idle_Loop" });
      if (state.mood === "windup" && state.attack) character.play("Sword_Attack", { once: true, speed: 900 / state.attack.warnMs, fade: 0.25, then: "Zombie_Idle_Loop" });
      if (state.mood === "stun") character.play("Zombie_Scratch", { once: true, speed: 0.8, fade: 0.2, then: "Zombie_Idle_Loop" });
      if (state.mood === "fallen") character.play("Death01", { once: true, speed: 0.7, fade: 0.3 });
      lastMood = state.mood;
    },
    event(event) {
      if (event.type === "boss_part") {
        fx.burst(character.bones.get("spine_02").getWorldPosition(new THREE.Vector3()), "#ffd86b", 40);
        fx.shake(0.25);
      }
      if (["boss_strike", "boss_blocked"].includes(event.type) && event.kind === "slam") fx.shake(0.9);
    },
  };
}

const SERPENT_SEGMENTS = 150;
const SERPENT_FINS = 26;
const SERPENT_BAND = 11; // every so many beads a pale ring, so the body reads as scales and not as beads

const serpentRadius = (s) => 0.26 + Math.sin(Math.min(1, s * 1.08) * Math.PI) * 0.72;

// A viper's head: flat and wide at the back, heavy brow, and a jaw that drops open for the warning.
function serpentHead(world, dark, pale, ball) {
  const head = new THREE.Group();
  const part = (material, scale, position) => {
    const mesh = new THREE.Mesh(ball, material);
    mesh.scale.set(...scale);
    mesh.position.set(...position);
    return mesh;
  };
  const gullet = world.material("#8c1c2e", { roughness: 0.7 });
  const fang = world.material("#fff6e0", { roughness: 0.3 });
  head.add(part(dark, [1.3, 0.72, 1.45], [0, 0, 0]), part(dark, [0.92, 0.34, 1.35], [0, 0.04, 1.15]), part(gullet, [0.78, 0.14, 1.15], [0, -0.26, 1.05]));

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.32, -0.1);
  jaw.add(part(pale, [0.84, 0.17, 1.4], [0, -0.06, 1.2]), part(gullet, [0.66, 0.08, 1.1], [0, 0.08, 1.15]));
  head.add(jaw);

  for (const side of [-1, 1]) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.72, 8), fang);
    tooth.rotation.x = Math.PI;
    tooth.position.set(side * 0.5, -0.46, 1.86);
    const brow = part(dark, [0.5, 0.15, 0.62], [side * 0.62, 0.58, 0.72]);
    brow.rotation.z = side * -0.42;
    const eye = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: "#ffdf3d", fog: false, toneMapped: false }));
    eye.scale.setScalar(0.24);
    eye.position.set(side * 0.8, 0.34, 0.82);
    eye.userData.keepMaterial = true;
    const slit = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: "#14100a", fog: false, toneMapped: false }));
    slit.scale.set(0.05, 0.2, 0.05);
    slit.position.set(side * 0.86, 0.34, 1.03);
    slit.userData.keepMaterial = true;
    head.add(tooth, brow, eye, slit);
    for (let i = 0; i < 3; i += 1) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.9 - i * 0.3, 4), pale);
      fin.position.set(side * (1.15 + i * 0.1), 0.42 - i * 0.48, -0.55 - i * 0.12);
      fin.rotation.z = side * (-1.05 - i * 0.42);
      head.add(fin);
    }
  }
  return { head, jaw };
}

function serpentFigure({ scene, world, boss, fx, z }) {
  const group = new THREE.Group();
  group.position.z = z;
  scene.add(group);
  const dark = world.material("#123f52", { roughness: 0.36, metalness: 0.25 });
  const pale = world.material("#7fd8c8", { roughness: 0.45 });
  const ball = new THREE.SphereGeometry(1, 14, 10);
  const segments = Array.from({ length: SERPENT_SEGMENTS }, (_, index) => {
    const body = new THREE.Mesh(ball, index % SERPENT_BAND < 2 ? pale : dark);
    body.castShadow = index % 3 === 0;
    group.add(body);
    return body;
  });
  const fin = new THREE.ConeGeometry(0.34, 1, 4);
  const fins = Array.from({ length: SERPENT_FINS }, () => {
    const spike = new THREE.Mesh(fin, pale);
    group.add(spike);
    return spike;
  });

  const { head, jaw } = serpentHead(world, dark, pale, ball);
  head.scale.setScalar(1.2);
  group.add(head);

  const knots = boss.parts.map(() => {
    const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), new THREE.MeshBasicMaterial({ color: "#7fa8c4", fog: false, toneMapped: false }));
    knot.userData.keepMaterial = true;
    group.add(knot);
    return knot;
  });
  world.dress(group);

  // The drowned road, and rain over everything.
  const flood = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: "#2f7f9c", transparent: true, opacity: 0, roughness: 0.15, metalness: 0.3 }));
  flood.rotation.x = -Math.PI / 2;
  flood.position.y = 0.16;
  flood.userData.keepMaterial = true;
  scene.add(flood);
  const drops = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i += 1) drops.set([(Math.random() - 0.5) * 26, Math.random() * 12, z + 6 - Math.random() * 16], i * 3);
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute("position", new THREE.BufferAttribute(drops, 3));
  const rain = new THREE.Points(rainGeometry, new THREE.PointsMaterial({ color: "#c8ecff", size: 0.06, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
  rain.userData.keepMaterial = true;
  rain.frustumCulled = false;
  scene.add(rain);

  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 8 }, () => new THREE.Vector3()));
  // The body stays low and wide so the head, up above it, is always in shot.
  const spot = (part) => [part.x * 5, 2.1 + part.y * 2];
  const anchors = [[-7, -1.6], ...boss.parts.slice(0, 4).map(spot), [2.6, 3.2], [0.9, 3.6], [0, 4.2]];
  const point = new THREE.Vector3();
  const facing = new THREE.Vector3();
  let sink = 1;
  let flash = 0;

  return {
    root: group,
    extras: [flood, rain],
    centre: new THREE.Vector3(0, 2.8, z),
    camera: { position: [0, 2.2, 4.6], look: [0, 3.2, z] },
    spotOf(part, out) {
      return out.copy(knots[part.id].position).add(group.position);
    },
    update(state, dt, elapsed) {
      sink = damp(sink, state.mood === "dive" || state.mood === "fallen" ? 1 : 0, state.mood === "fallen" ? 0.9 : 2.2, dt);
      group.position.y = sink * -10;
      flood.material.opacity = damp(flood.material.opacity, 0.78, 1.2, dt);
      flash = Math.max(0, flash - dt * 4);

      anchors.forEach(([x, y], index) => {
        const wave = Math.sin(elapsed * 1.3 + index * 1.1);
        curve.points[index].set(x + wave * 0.26, y + Math.cos(elapsed * 1.1 + index) * 0.2, Math.sin(elapsed * 0.8 + index * 0.9) * 0.7);
      });
      for (const [index, body] of segments.entries()) {
        const s = index / (SERPENT_SEGMENTS - 1);
        curve.getPoint(s * 0.96, point);
        body.position.copy(point);
        body.scale.setScalar(serpentRadius(s));
      }
      for (const [index, spike] of fins.entries()) {
        const s = (index + 1.5) / (SERPENT_FINS + 2);
        const radius = serpentRadius(s);
        curve.getPoint(s * 0.96, point);
        spike.position.set(point.x, point.y + radius * 1.05, point.z - radius * 0.2);
        spike.scale.set(radius, radius * 0.95, radius);
      }
      curve.getPoint(1, head.position);
      head.position.z += 1;
      const warning = state.mood === "windup";
      facing.set(Math.sin(elapsed * 0.6) * 0.45, 0, 1);
      head.rotation.y = damp(head.rotation.y, Math.atan2(facing.x, facing.z), 3, dt);
      head.rotation.x = damp(head.rotation.x, warning ? -0.1 : 0.22, 4, dt);
      jaw.rotation.x = damp(jaw.rotation.x, warning ? 0.85 : 0.22 + Math.sin(elapsed * 1.4) * 0.06, 7, dt);

      for (const [index, knot] of knots.entries()) {
        const part = state.parts[index];
        const down = part.hp <= 0;
        const open = !down && state.open === index;
        const [x, y] = index === 4 ? [head.position.x, head.position.y + 1.5] : [curve.points[index + 1].x, curve.points[index + 1].y];
        knot.position.set(x, y, curve.points[Math.min(index + 1, 7)].z + 1.1);
        knot.rotation.y = elapsed * 2 + index;
        knot.material.color.set(open ? "#ffe27a" : "#7fa8c4");
        knot.scale.setScalar(down ? 0.001 : (open ? 1.05 + Math.sin(elapsed * 9) * 0.1 : 0.6) + flash * (open ? 0.5 : 0));
      }

      const { position } = rainGeometry.attributes;
      for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i) - dt * 15;
        position.setY(i, y < 0 ? 12 : y);
      }
      position.needsUpdate = true;
    },
    event(event) {
      if (event.type === "boss_hit") flash = 1;
      if (event.type === "boss_part") {
        fx.burst(knots[event.part].position.clone().add(group.position), "#d7f7ff", 44);
        fx.shake(0.3);
      }
      if (event.type === "boss_dive") fx.burst({ x: 0, y: 0.4, z: z + 1 }, "#a8e8ff", 60);
    },
  };
}

export async function makeBossFigure(number, context) {
  const { id } = BOSSES[number - 1];
  const build = { ravana: ravanaFigure, kumbhakarna: giantFigure, serpent: serpentFigure }[id];
  const figure = await build(context);
  figure.root.visible = false;
  for (const extra of figure.extras) extra.visible = false;
  return figure;
}

// Boss parts are drawn from a stub until the real state exists, so a figure can be built up front.
export const bossPreview = (number) => ({
  parts: BOSSES[number - 1].parts.map(([x, y], id) => ({ id, x, y, hp: 1, maxHp: 1 })),
});

// A word and a ring around the player's feet for what must be defended, closing as the blow comes.
// The one word that has to be read over anything, so it brings its own plate.
function alarmCard(word) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 208;
  const pen = canvas.getContext("2d");
  pen.fillStyle = "#b5121f";
  pen.beginPath();
  pen.roundRect(10, 10, 492, 188, 36);
  pen.fill();
  pen.strokeStyle = "#fff4d6";
  pen.lineWidth = 10;
  pen.stroke();
  pen.font = "900 120px system-ui, sans-serif";
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  pen.fillStyle = "#fff4d6";
  pen.fillText(word, 256, 110);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, fog: false, toneMapped: false }));
  sprite.userData.keepMaterial = true;
  sprite.renderOrder = 8;
  return sprite;
}

export function makeTelegraph({ scene, target }) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 56), new THREE.MeshBasicMaterial({ color: "#ff3b4e", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.userData.keepMaterial = true;
  scene.add(ring);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), new THREE.MeshBasicMaterial({ color: "#ff3b4e", transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.05;
  floor.userData.keepMaterial = true;
  scene.add(floor);
  const word = alarmCard(target.word);
  word.scale.set(2.2, 0.9, 1);
  word.visible = false;
  scene.add(word);
  return {
    update(attack, at) {
      const live = attack?.answer === "defend";
      word.visible = Boolean(live);
      ring.material.opacity = live ? 0.95 : 0;
      floor.material.opacity = live ? 0.28 : 0;
      if (!live) return;
      const left = 1 - attack.ms / attack.warnMs;
      ring.scale.setScalar(1.25 + left * 5);
      ring.position.x = at.x;
      ring.position.z = at.z;
      floor.position.x = at.x;
      floor.position.z = at.z;
      word.position.set(at.x, at.y, at.z);
    },
  };
}

function slashArc(world) {
  const arc = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 40, 1, -1, 2), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false, toneMapped: false }));
  arc.userData.keepMaterial = true;
  return arc;
}

const ARC_TURN = { left: Math.PI, right: 0, up: Math.PI / 2, down: -Math.PI / 2 };
const HEAVY_WORD = "GUARD";

export const blades = {
  usesRival: true,
  async build({ scene, camera, world, hero, rival, fx, focusShadow, spec }) {
    const road = world.road(11);
    const side = world.strip();
    side.scroll(0);
    scene.add(road.mesh, side.group);
    holdOnBone(hero.bones.get("hand_r"), sword(world));
    hero.root.rotation.y = Math.PI;
    hero.play("Sword_Idle");

    const crew = await fighterCrew({ world, rival, spec, count: RAIDERS, weapon: sword });
    for (const { character } of crew) scene.add(character.root);
    const textures = Object.fromEntries(Object.keys(ARROW_COLOURS).map((dir) => [dir, arrowTexture(dir)]));
    const tags = crew.map(() => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.left, transparent: true, depthTest: false, fog: false, toneMapped: false }));
      sprite.material.color.setScalar(arrowGlow(spec));
      sprite.userData.keepMaterial = true;
      sprite.renderOrder = 6;
      sprite.visible = false;
      scene.add(sprite);
      return sprite;
    });
    const guardWord = alarmCard(HEAVY_WORD);
    guardWord.scale.set(1.6, 0.65, 1);
    guardWord.visible = false;
    scene.add(guardWord);

    const arc = slashArc(world);
    scene.add(arc);
    let arcLife = 0;

    const number = spec.tuning.boss;
    const stub = bossPreview(number);
    const bossZ = -4.2;
    const figure = await makeBossFigure(number, { scene, world, boss: stub, hero, fx, z: bossZ });
    const target = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.left, transparent: true, depthTest: false, fog: false, toneMapped: false }));
    target.material.color.setScalar(arrowGlow(spec));
    target.userData.keepMaterial = true;
    target.renderOrder = 7;
    target.visible = false;
    scene.add(target);
    const telegraph = makeTelegraph({ scene, target: { word: "GUARD" } });
    const missile = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshBasicMaterial({ color: "#ff8a1f", fog: false, toneMapped: false }));
    missile.userData.keepMaterial = true;
    missile.visible = false;
    scene.add(missile);

    let facing = 0;
    let shot = 0; // 0 is the road, 1 is the boss
    const eye = new THREE.Vector3();
    const look = new THREE.Vector3();
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const spot = new THREE.Vector3();
    const heroHead = new THREE.Vector3(0, 2.1, 0);
    let shownBoss = false;
    let marching = false;

    return {
      update(state, dt, elapsed) {
        side.scroll(state.distance);
        road.scroll(state.distance);

        // Fighters are lent out to raiders by id, and stay with one through its fall.
        const live = new Set(state.enemies.map((enemy) => enemy.id));
        for (const fighter of crew) {
          if (fighter !== crew[0]) fighter.character.update(dt);
          fighter.busyMs = Math.max(0, fighter.busyMs - dt * 1000);
          if (fighter.enemyId !== null && !live.has(fighter.enemyId) && fighter.busyMs <= 0) {
            fighter.enemyId = null;
            fighter.character.root.visible = false;
          }
        }
        for (const enemy of state.enemies) {
          let fighter = crew.find((item) => item.enemyId === enemy.id);
          if (!fighter) {
            fighter = crew.find((item) => item.enemyId === null);
            if (!fighter) continue;
            fighter.enemyId = enemy.id;
            fighter.character.root.visible = true;
            fighter.character.root.scale.setScalar(enemy.heavy ? 1.4 : 1);
            fighter.character.play(enemy.heavy ? "Zombie_Walk_Fwd_Loop" : SIDE_CLIPS[enemy.side], { fade: 0.05 });
          }
          const path = SIDE_PATHS[enemy.side];
          const p = Math.min(1, enemy.ms / enemy.arriveMs);
          const root = fighter.character.root;
          root.position.set(...path.from).lerp(to.set(...path.to), p);
          if (enemy.side === "up") root.position.y += Math.sin(p * Math.PI) * 1.2;
          root.rotation.y = Math.atan2(-root.position.x, -root.position.z);
          const tag = tags[crew.indexOf(fighter)];
          const inReach = enemy.arriveMs - enemy.ms <= REACH_MS;
          tag.material.map = textures[enemy.side];
          tag.visible = !enemy.heavy;
          tag.position.set(root.position.x, root.position.y + (enemy.side === "up" ? 2 : 2.25), root.position.z);
          const near = 1 + (1 - p) * 2.2; // a far raider's arrow is drawn large, like a far pot's
          tag.scale.setScalar((inReach ? 1.1 + Math.sin(elapsed * 12) * 0.1 : 0.75) * near);
          tag.material.opacity = inReach ? 1 : 0.72;
          if (enemy.heavy) {
            guardWord.visible = true;
            guardWord.position.set(root.position.x, root.position.y + 3.1, root.position.z);
          }
        }
        for (const [index, fighter] of crew.entries()) if (fighter.enemyId === null || !live.has(fighter.enemyId)) tags[index].visible = false;
        if (!state.enemies.some((enemy) => enemy.heavy)) guardWord.visible = false;

        // The player turns toward whatever is nearest.
        const nearest = [...state.enemies].sort((a, b) => a.arriveMs - a.ms - (b.arriveMs - b.ms))[0];
        facing = damp(facing, nearest ? SIDE_PATHS[nearest.side].turn : 0, 6, dt);
        hero.root.rotation.y = Math.PI + facing;
        const blink = state.invincibleMs > 0 && Math.sin(elapsed * 34) < -0.2;
        hero.root.visible = !blink;
        if (state.marchMs > 0 !== marching) {
          marching = !marching;
          hero.play(marching ? "Jog_Fwd_Loop" : "Sword_Idle", { fade: 0.15 });
        }

        arcLife = Math.max(0, arcLife - dt * 6);
        arc.material.opacity = arcLife;

        // The boss.
        if (state.boss) {
          if (!shownBoss) {
            shownBoss = true;
            figure.root.visible = true;
            for (const extra of figure.extras) extra.visible = true;
          }
          figure.update(state.boss, dt, elapsed);
          const { boss } = state;
          const part = boss.parts[boss.open];
          const attack = boss.attack;
          telegraph.update(attack, heroHead);
          if (attack?.answer === "strike") {
            const p = attack.ms / attack.warnMs;
            figure.spotOf(part, from);
            to.set(...{ left: [-1.3, 1.5, 0.2], right: [1.3, 1.5, 0.2], up: [0, 2.6, 0.2], down: [0, 0.5, 0.2] }[attack.slot]);
            missile.position.lerpVectors(from, to, p);
            missile.visible = true;
            missile.scale.setScalar(0.8 + p * 0.8);
            target.visible = true;
            target.material.map = textures[attack.slot];
            target.position.copy(missile.position);
            target.position.y += 0.9;
            target.scale.setScalar(1.3);
          } else {
            missile.visible = false;
            const showMark = boss.mood !== "enter" && boss.mood !== "wake" && boss.mood !== "fallen" && boss.mood !== "dive" && !attack;
            target.visible = showMark;
            if (showMark) {
              figure.spotOf(part, spot);
              target.material.map = textures[part.slot];
              target.position.copy(spot);
              target.position.z += 0.8;
              target.scale.setScalar(1.25 + Math.sin(elapsed * 9) * 0.1);
            }
          }
        } else telegraph.update(null, heroHead);

        shot = damp(shot, state.boss ? 1 : 0, 1.8, dt);
        eye.set(0, 2.5, 4.7).lerp(from.set(...figure.camera.position), shot);
        look.set(0, 1.7, -6).lerp(to.set(...figure.camera.look), shot);
        camera.position.copy(eye);
        camera.lookAt(look);
        focusShadow(0, 0, -3);
      },
      event(event, state) {
        if (event.type === "slash") {
          hero.play(SLASH_CLIPS[event.side], { once: true, speed: 2.1, fade: 0.05, then: "Sword_Idle" });
          arc.position.set(0, 1.35, -0.8);
          arc.rotation.set(0, 0, ARC_TURN[event.side]);
          arcLife = 0.9;
        }
        if (event.type === "guard") hero.play("Sword_Block", { once: true, speed: 1.6, fade: 0.05, then: "Sword_Idle" });
        if (event.type === "cut") {
          const fighter = crew.find((item) => item.enemyId === event.id);
          if (fighter) {
            fighter.busyMs = 900;
            fighter.character.play("Death01", { once: true, speed: 1.6, fade: 0.06 });
            fx.burst({ ...fighter.character.root.position, y: fighter.character.root.position.y + 1.2 }, "#ffd86b", 26);
          }
          fx.shake(0.12);
        }
        if (event.type === "clang") fx.burst({ x: 0, y: 1.6, z: -1 }, "#ffffff", 12);
        if (event.type === "blocked") {
          const fighter = crew.find((item) => item.enemyId === event.id);
          if (fighter) {
            fighter.busyMs = 1000;
            fighter.character.play("Hit_Knockback", { once: true, speed: 1.3, fade: 0.05 });
          }
          fx.burst({ x: 0, y: 1.5, z: -0.8 }, "#a8e8ff", 34);
          fx.shake(0.25);
        }
        if (event.type === "struck") {
          const fighter = crew.find((item) => item.enemyId === event.id);
          if (fighter) {
            fighter.busyMs = 700;
            fighter.character.play("Sword_Attack", { once: true, speed: 1.8, fade: 0.05 });
          }
        }
        if (event.type === "hurt") {
          fx.shake(0.55);
          fx.flash("#ff3b4e", 0.34);
          hero.play("Hit_Chest", { once: true, speed: 1.4, fade: 0.05, then: "Sword_Idle" });
        }
        if (event.type === "boss_blocked" || event.type === "boss_parry") fx.burst({ x: 0, y: 1.6, z: -0.6 }, "#a8e8ff", 40);
        if (event.type === "boss_enter") fx.flash("#ffffff", 0.3);
        if (event.type === "boss_hit") {
          const part = state.boss.parts[event.part];
          figure.spotOf(part, spot);
          fx.burst(spot, "#ffd86b", 18);
        }
        if (event.type === "boss_down") {
          fx.flash("#ffffff", 0.5);
          hero.play("Yes", { once: true });
        }
        if (state.boss) figure.event(event, state.boss);
        if (event.type === "end" && !state.won) hero.play("Death01", { once: true });
      },
    };
  },
};
