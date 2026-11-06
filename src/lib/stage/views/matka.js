// Matka Beats: clay pots ride a garland line down the street and swing into a marigold gate.
import * as THREE from "three";
import { startBeat, stopBeat, syncBeat } from "../../game/sound.js";
import { Pool, damp, holdOnBone, wordCard } from "./shared.js";

export const ARROW_COLOURS = { left: "#16b8ff", right: "#ff3f8e", up: "#ffc21f", down: "#35d07f" };
const ARROW_TURN = { left: Math.PI, right: 0, up: Math.PI / 2, down: -Math.PI / 2 };

// Where each pot lands. All four sit above the player's head, so the body never hides the beat.
const SPOTS = { left: [-2.15, 2.75], right: [2.15, 2.75], up: [0, 3.75], down: [0, 1.95] };
const GATE_Z = -1.6;
const FAR_Z = -30;
const LINE_Y = 8.2;

const SLASH_CLIPS = { left: "Sword_Regular_B", right: "Sword_Regular_A", up: "Sword_Regular_C", down: "Sword_Attack" };

// A fat arrow on a round plate, in the colour of its direction. Made to read from across a room.
export function arrowTexture(dir, { plate = "#fff6e4", ink = "#1b1412" } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const pen = canvas.getContext("2d");
  pen.translate(128, 128);
  pen.fillStyle = plate;
  pen.beginPath();
  pen.arc(0, 0, 122, 0, Math.PI * 2);
  pen.fill();
  pen.lineWidth = 10;
  pen.strokeStyle = ink;
  pen.stroke();
  pen.rotate(-ARROW_TURN[dir]);
  pen.beginPath();
  for (const [x, y] of [[-92, -34], [8, -34], [8, -82], [98, 0], [8, 82], [8, 34], [-92, 34]]) pen.lineTo(x, y);
  pen.closePath();
  pen.fillStyle = ARROW_COLOURS[dir];
  pen.fill();
  pen.lineWidth = 12;
  pen.lineJoin = "round";
  pen.strokeStyle = ink;
  pen.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const POT_SHAPE = [[0, -0.46], [0.2, -0.45], [0.4, -0.3], [0.5, -0.06], [0.47, 0.16], [0.32, 0.33], [0.2, 0.4], [0.2, 0.46], [0.27, 0.5], [0.23, 0.53], [0.15, 0.48]];

function potPaint() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const pen = canvas.getContext("2d");
  pen.fillStyle = "#b85a2c";
  pen.fillRect(0, 0, 64, 256);
  for (const [y, h, colour] of [[52, 10, "#f5e2b8"], [66, 5, "#7a2318"], [176, 5, "#7a2318"], [184, 10, "#f5e2b8"]]) {
    pen.fillStyle = colour;
    pen.fillRect(0, y, 64, h);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

// Neon's bloom turns a white face into a lamp and washes the arrow out of it.
export const arrowGlow = (spec) => (spec.skin.style === "neon" ? 0.55 : 1);

function makePot(dir, world, paint, rope, glow) {
  const group = new THREE.Group();
  const swing = new THREE.Group(); // hangs from the top of the rope, so the whole pot can rock
  swing.position.y = LINE_Y;
  group.add(swing);
  const shape = POT_SHAPE.map(([x, y]) => new THREE.Vector2(x, y));
  const pot = new THREE.Mesh(new THREE.LatheGeometry(shape, 22), world.material("#ffffff", { map: paint, roughness: 0.82 }));
  pot.castShadow = true;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.42, 28), new THREE.MeshBasicMaterial({ map: arrowTexture(dir), fog: false, toneMapped: false }));
  face.material.color.setScalar(glow);
  face.position.set(0, -0.03, 0.5);
  face.userData.keepMaterial = true;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 5), rope);
  cord.position.y = 0.5;
  group.userData = { swing, pot, face, cord };
  swing.add(pot, face, cord);
  world.dress(group);
  return group;
}

// A wooden gate hung with marigolds, with a ring where each pot will land.
function gate(world, accent) {
  const group = new THREE.Group();
  const wood = world.material("#6b3b1e", { roughness: 0.9 });
  for (const x of [-3.7, 3.7]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 6.2, 10), wood);
    post.position.set(x, 3.1, GATE_Z);
    group.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(8, 0.26, 0.26), wood);
  beam.position.set(0, 6.1, GATE_Z);
  group.add(beam);
  const flower = new THREE.IcosahedronGeometry(0.12, 1);
  const petals = [world.material("#ff9d1c"), world.material("#ffd21f")];
  for (let i = 0; i <= 42; i += 1) {
    const x = -3.6 + (i / 42) * 7.2;
    const dip = Math.abs(Math.sin((i / 42) * Math.PI * 3)) * 0.55;
    const bloom = new THREE.Mesh(flower, petals[i % 2]);
    bloom.position.set(x, 6.02 - dip, GATE_Z + 0.08);
    group.add(bloom);
  }
  world.dress(group);
  const rings = Object.fromEntries(Object.entries(SPOTS).map(([dir, [x, y]]) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.045, 8, 40), new THREE.MeshBasicMaterial({ color: ARROW_COLOURS[dir], transparent: true, opacity: 0.85, fog: false, toneMapped: false }));
    ring.position.set(x, y, GATE_Z);
    ring.userData.keepMaterial = true;
    group.add(ring);
    return [dir, ring];
  }));
  return { group, rings };
}

// A garland line overhead, so a pot always has something to swing from.
function garlandLines(world, accent) {
  const group = new THREE.Group();
  const line = world.material("#3a2a22");
  const flag = new THREE.PlaneGeometry(0.34, 0.42);
  const flags = ["#ff5c3a", "#ffc21f", "#2fbf9b", "#f5efe0"].map((colour) => world.material(colour, { side: THREE.DoubleSide }));
  for (const x of [-1.2, 1.2]) {
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 34, 5), line);
    wire.rotation.x = Math.PI / 2;
    wire.position.set(x, LINE_Y, (GATE_Z + FAR_Z) / 2);
    group.add(wire);
    for (let i = 0; i < 26; i += 1) {
      const pennant = new THREE.Mesh(flag, flags[i % 4]);
      pennant.position.set(x, LINE_Y - 0.25, GATE_Z - 1 - i * 1.15);
      group.add(pennant);
    }
  }
  return world.dress(group);
}

function stick(world) {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.62, 8), world.material("#d9a441"));
  shaft.position.y = 0.26;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), world.material("#d9382e"));
  tip.position.y = 0.58;
  group.add(shaft, tip);
  return world.dress(group);
}

export const matka = {
  async build({ scene, camera, world, hero, fx, focusShadow, spec, accent }) {
    const road = world.road(9);
    const side = world.strip();
    side.scroll(0);
    scene.add(road.mesh, side.group);
    const { group: arch, rings } = gate(world, accent);
    scene.add(arch, garlandLines(world, accent));

    const paint = potPaint();
    const glow = arrowGlow(spec);
    const rope = world.material("#d8c7a2");
    const items = new THREE.Group();
    scene.add(items);
    const pots = new Pool(items, (item) => makePot(item.dir, world, paint, rope, glow));

    // Grades pop up where the pot broke, so the eye does not have to leave the action.
    const grades = Object.fromEntries([["perfect", "PERFECT", "#fff1a8"], ["good", "GOOD", "#ffffff"], ["miss", "MISS", "#ff5a5a"]].map(([grade, text, colour]) => {
      const card = wordCard(text, colour);
      card.scale.set(2.2, 1.1, 1);
      card.visible = false;
      scene.add(card);
      return [grade, { card, life: 0 }];
    }));
    const shards = Array.from({ length: 18 }, () => {
      const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.15), world.material("#b85a2c"));
      shard.visible = false;
      world.dress(shard);
      scene.add(shard);
      return { shard, v: new THREE.Vector3(), life: 0 };
    });
    let nextShard = 0;

    holdOnBone(hero.bones.get("hand_r"), stick(world));
    holdOnBone(hero.bones.get("hand_l"), stick(world));
    hero.root.rotation.y = Math.PI;
    hero.root.position.set(0, 0, 1);
    hero.play("Idle_Loop");
    let playing = false;
    let bob = 0;

    const place = (object, pot, state) => {
      const p = 1 - (pot.at - state.t) / state.approachMs;
      const eased = Math.min(1.1, p) ** 1.5;
      const [x, y] = SPOTS[pot.dir];
      const z = FAR_Z + (GATE_Z - FAR_Z) * eased;
      const lift = Math.sin(Math.min(1, p) * Math.PI * 0.5 + Math.PI * 0.5) ** 2 * 1.3; // rides high, then swoops down into the ring
      const height = y + lift;
      object.position.set(x * (0.35 + 0.65 * eased), 0, z);
      const { swing, pot: body, face, cord } = object.userData;
      swing.rotation.x = Math.sin(p * 9) * 0.05 * (1 - p);
      swing.rotation.z = Math.sin(p * 7 + pot.id) * 0.07 * (1 - p);
      const drop = LINE_Y - height;
      body.position.y = -drop;
      face.position.y = -drop - 0.03;
      cord.scale.y = drop - 0.5;
      cord.position.y = -(drop - 0.5) / 2;
      const size = 1.9 - 0.9 * eased; // a far pot is drawn large, so its arrow is readable sooner
      body.scale.setScalar(size);
      face.scale.setScalar(size);
      face.position.z = 0.5 * size;
    };

    return {
      update(state, dt, elapsed) {
        if (state.status === "playing" && state.t > 0) {
          if (!playing) startBeat(state.bpm);
          playing = true;
          syncBeat(state.t);
        } else if (playing) {
          playing = false;
          stopBeat();
        }
        pots.sync(state.pots, (object, pot) => place(object, pot, state));

        // The rings breathe on the beat, so the eye can count in without hearing the drum.
        const beat = (state.t / (60000 / state.bpm)) % 1;
        const pulse = state.t > 0 ? Math.max(0, 1 - beat * 3) : 0;
        const next = state.pots[0];
        for (const [dir, ring] of Object.entries(rings)) {
          const called = next?.dir === dir && next.at - state.t < state.approachMs * 0.5;
          ring.scale.setScalar(1 + pulse * 0.07 + (called ? 0.14 : 0));
          ring.material.opacity = called ? 1 : 0.5;
        }
        bob = damp(bob, pulse * 0.05, 20, dt);
        hero.root.position.y = bob;

        for (const entry of Object.values(grades)) {
          entry.life -= dt;
          entry.card.visible = entry.life > 0;
          entry.card.position.y += dt * 0.7;
          entry.card.material.opacity = Math.min(1, entry.life * 3);
        }
        for (const item of shards) {
          if (item.life <= 0) continue;
          item.life -= dt;
          item.v.y -= 11 * dt;
          item.shard.position.addScaledVector(item.v, dt);
          item.shard.rotation.x += dt * 9;
          item.shard.rotation.y += dt * 7;
          item.shard.visible = item.life > 0;
        }
        camera.position.set(0, 2.5, 7.4);
        camera.lookAt(0, 3.05, -6);
        focusShadow(0, 0, -5);
      },
      event(event) {
        if (["perfect", "good", "wrong", "swing"].includes(event.type)) hero.play(SLASH_CLIPS[event.dir], { once: true, speed: 2.1, fade: 0.05, then: "Idle_Loop" });
        const landed = event.type === "perfect" || event.type === "good";
        if (landed || event.type === "miss") {
          const [x, y] = SPOTS[event.dir];
          const entry = grades[event.type];
          entry.life = 0.65;
          entry.card.position.set(x, y + 0.9, GATE_Z + 0.2);
        }
        if (landed) {
          const [x, y] = SPOTS[event.dir];
          fx.burst({ x, y, z: GATE_Z }, event.type === "perfect" ? "#ffd86b" : "#d9713c", event.type === "perfect" ? 40 : 22);
          for (let i = 0; i < 6; i += 1) {
            const item = shards[nextShard];
            nextShard = (nextShard + 1) % shards.length;
            item.shard.position.set(x, y, GATE_Z);
            item.v.set((Math.random() - 0.5) * 7, Math.random() * 5 + 1, (Math.random() - 0.2) * 5);
            item.life = 0.8;
            item.shard.visible = true;
          }
          fx.shake(event.type === "perfect" ? 0.08 : 0.04);
        }
        if (event.type === "miss") fx.flash("#ff3b4e", 0.1);
        if (event.type === "end") {
          stopBeat();
          hero.play("Yes", { once: true });
        }
      },
    };
  },
};
