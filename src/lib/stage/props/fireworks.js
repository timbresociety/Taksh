// The sky over Diwali: rockets that climb and burst, and paper lanterns drifting up. One Points object
// each, updated on the CPU, because a few hundred sparks cost less than any per-burst object would.
import * as THREE from "three";
import { createRandom } from "../../templates/shared.js";

const BURST_COLOURS = ["#ff4a6e", "#ffd23f", "#4fe6ff", "#7cff6b", "#ff8a1f", "#c78bff", "#ffffff"];
const CAPACITY = 1400;
const GRAVITY = 7;

function dotTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const pen = canvas.getContext("2d");
  const gradient = pen.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "#fff");
  gradient.addColorStop(0.3, "#fff");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  pen.fillStyle = gradient;
  pen.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

function lanternTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const pen = canvas.getContext("2d");
  const gradient = pen.createLinearGradient(0, 8, 0, 56);
  gradient.addColorStop(0, "#ff7a2a");
  gradient.addColorStop(1, "#ffe08a");
  pen.fillStyle = gradient;
  pen.beginPath();
  pen.moveTo(16, 6);
  pen.lineTo(48, 6);
  pen.lineTo(42, 58);
  pen.lineTo(22, 58);
  pen.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// around says where the show may appear, as an angle range measured from straight ahead (-z).
export function fireworks({ around = [-1.1, 1.1], distance = [80, 160], height = [26, 54], every = 0.9 } = {}) {
  const random = createRandom(53);
  const group = new THREE.Group();
  const positions = new Float32Array(CAPACITY * 3).fill(-9999);
  const colours = new Float32Array(CAPACITY * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 2.6, map: dotTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, sizeAttenuation: true }));
  points.frustumCulled = false;
  group.add(points);

  const sparks = new Array(CAPACITY).fill(null);
  let next = 0;
  const spawn = (spark) => {
    sparks[next] = spark;
    next = (next + 1) % CAPACITY;
  };

  const tone = new THREE.Color();
  function burst(at, kind) {
    const count = 120 + random.int(70);
    const [first, second] = [random.pick(BURST_COLOURS), random.pick(BURST_COLOURS)];
    for (let i = 0; i < count; i += 1) {
      // Points spread evenly over a sphere, so the burst has a clean round edge.
      const y = 1 - (2 * (i + 0.5)) / count;
      const ring = Math.sqrt(1 - y * y);
      const turn = i * 2.39996;
      const speed = kind === "ring" ? 22 : 16 + random.range(0, 8);
      tone.set(i % 2 ? first : second);
      spawn({
        x: at.x, y: at.y, z: at.z, vx: Math.cos(turn) * ring * speed, vy: (kind === "ring" ? y * 3 : y * speed), vz: Math.sin(turn) * ring * speed,
        life: 1.5 + random.range(0, 0.7), age: 0, r: tone.r, g: tone.g, b: tone.b, drag: 1.7,
      });
    }
  }

  const rockets = [];
  let wait = 0.2;
  function launch() {
    const angle = random.range(...around);
    const reach = random.range(...distance);
    const peak = random.range(...height);
    rockets.push({ x: Math.sin(angle) * reach, y: 2, z: -Math.cos(angle) * reach, vy: 34 + random.range(0, 12), vx: random.range(-3, 3), peak, trail: 0 });
  }

  function update(dt) {
    wait -= dt;
    if (wait <= 0) {
      launch();
      wait = every * random.range(0.5, 1.5);
    }
    for (let i = rockets.length - 1; i >= 0; i -= 1) {
      const rocket = rockets[i];
      rocket.y += rocket.vy * dt;
      rocket.x += rocket.vx * dt;
      spawn({ x: rocket.x, y: rocket.y, z: rocket.z, vx: 0, vy: -3, vz: 0, life: 0.45, age: 0, r: 1, g: 0.72, b: 0.36, drag: 0 });
      if (rocket.y >= rocket.peak) {
        burst(rocket, random.next() < 0.3 ? "ring" : "ball");
        rockets.splice(i, 1);
      }
    }
    for (let i = 0; i < CAPACITY; i += 1) {
      const spark = sparks[i];
      if (!spark) continue;
      spark.age += dt;
      const fade = 1 - spark.age / spark.life;
      if (fade <= 0) {
        sparks[i] = null;
        positions[i * 3 + 1] = -9999;
        continue;
      }
      const slow = Math.exp(-spark.drag * dt);
      spark.vx *= slow;
      spark.vy = spark.vy * slow - GRAVITY * dt;
      spark.vz *= slow;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.z += spark.vz * dt;
      positions.set([spark.x, spark.y, spark.z], i * 3);
      // Additive, so fading to black is fading out.
      const light = fade * fade * 2.4;
      colours.set([spark.r * light, spark.g * light, spark.b * light], i * 3);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }

  return { group, update };
}

// Paper lanterns released from the ground, drifting up and sideways on the wind.
export function skyLanterns({ count = 30, around = [-1.2, 1.2], distance = [40, 150], top = 60 } = {}) {
  const random = createRandom(71);
  const positions = new Float32Array(count * 3);
  const items = Array.from({ length: count }, () => {
    const angle = random.range(...around);
    const reach = random.range(...distance);
    return { x: Math.sin(angle) * reach, z: -Math.cos(angle) * reach, y: random.range(6, top), rise: random.range(0.9, 1.8), phase: random.range(0, 6.28) };
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 1.5, map: lanternTexture(), transparent: true, depthWrite: false, fog: false, alphaTest: 0.3 }));
  points.frustumCulled = false;
  return {
    group: points,
    update(dt, elapsed) {
      items.forEach((item, i) => {
        item.y += item.rise * dt;
        if (item.y > top) item.y = 6;
        positions.set([item.x + Math.sin(elapsed * 0.3 + item.phase) * 2.4, item.y, item.z], i * 3);
      });
      geometry.attributes.position.needsUpdate = true;
    },
  };
}
