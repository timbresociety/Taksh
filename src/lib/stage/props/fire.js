// Everything that burns: flames, soft glows and sparks. All of it moves on the GPU from one shared
// clock, so a hundred diyas cost no per-frame work, and each flickers out of step with its neighbours.
import * as THREE from "three";

export const clock = { value: 0 };
// Point sprites are sized in pixels, so they need the height of the picture to stay true to metres.
export const screen = { value: 720 };
const flameTexture = { value: null };

function radial(stops, size = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const pen = canvas.getContext("2d");
  const gradient = pen.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, colour] of stops) gradient.addColorStop(at, colour);
  pen.fillStyle = gradient;
  pen.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeFlameTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const pen = canvas.getContext("2d");
  const drop = (scale, colour) => {
    pen.save();
    pen.translate(64, 120);
    pen.scale(scale, scale);
    pen.fillStyle = colour;
    pen.beginPath();
    pen.moveTo(0, -112);
    pen.bezierCurveTo(10, -80, 28, -52, 26, -26);
    pen.bezierCurveTo(24, -6, 10, 0, 0, 0);
    pen.bezierCurveTo(-10, 0, -24, -6, -26, -26);
    pen.bezierCurveTo(-28, -52, -10, -80, 0, -112);
    pen.fill();
    pen.restore();
  };
  pen.filter = "blur(3px)";
  drop(1, "#ff7a12");
  drop(0.74, "#ffc22e");
  drop(0.44, "#fff6d6");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const FLAME_VERTEX = /* glsl */ `
  uniform float uClock, uScreen, uSize;
  varying float vFlicker;
  void main() {
    // Keyed off where it stands, so no list of flames is needed and no two burn alike.
    vec4 world = modelMatrix * vec4(position, 1.0);
    float seed = world.x * 3.1 + world.z * 1.7 + world.y * 5.3;
    float flicker = 0.9 + 0.14 * sin(uClock * 11.0 + seed) + 0.08 * sin(uClock * 23.0 + seed * 1.7);
    vFlicker = flicker;
    float scale = length(modelMatrix[1].xyz);
    vec4 view = viewMatrix * world;
    view.y += uSize * scale * 0.4;
    gl_PointSize = uSize * scale * flicker * projectionMatrix[1][1] * uScreen * 0.5 / max(0.3, -view.z);
    gl_Position = projectionMatrix * view;
  }`;
const FLAME_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  varying float vFlicker;
  void main() {
    vec2 at = gl_PointCoord;
    at.x = (at.x - 0.5) * (1.5 - 0.5 * vFlicker) + 0.5;
    gl_FragColor = vec4(texture2D(uMap, at).rgb * 1.25, 1.0);
  }`;

const flameMaterials = new Map();
function flameMaterial(size) {
  if (!flameMaterials.has(size)) {
    flameTexture.value ??= makeFlameTexture();
    flameMaterials.set(size, new THREE.ShaderMaterial({
      vertexShader: FLAME_VERTEX, fragmentShader: FLAME_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uClock: clock, uScreen: screen, uSize: { value: size }, uMap: flameTexture },
    }));
  }
  return flameMaterials.get(size);
}

// Every flame in a prop is one point in one draw call, whether it is a single diya or a ring of them.
export function flames(places, size = 0.2) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(places.flat()), 3));
  const points = new THREE.Points(geometry, flameMaterial(size));
  points.frustumCulled = false;
  return points;
}

const halos = new Map();
// A soft ball of light around a lamp, cheap stand-in for real light at night.
export function halo(size, colour = "#ffb45a") {
  if (!halos.has(colour)) halos.set(colour, new THREE.SpriteMaterial({ map: radial([[0, colour], [0.3, `${colour}66`], [1, `${colour}00`]]), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.8 }));
  const sprite = new THREE.Sprite(halos.get(colour));
  sprite.scale.set(size, size, 1);
  return sprite;
}

const pools = new Map();
// A warm patch on the ground under a lamp or diya. Lit by hand, because real lights would cost every
// material in the scene a little, and the point of these worlds is that there are hundreds of lamps.
export function lightPool(radius, colour = "#ffb45a", strength = 0.5) {
  const key = `${colour}${strength}`;
  if (!pools.has(key)) pools.set(key, new THREE.MeshBasicMaterial({ map: radial([[0, colour], [0.45, `${colour}55`], [1, `${colour}00`]], 128), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: strength }));
  const mesh = new THREE.Mesh(poolGeometry(), pools.get(key));
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(radius * 2);
  mesh.position.y = 0.05;
  mesh.userData.keepMaterial = true;
  mesh.userData.flat = true;
  mesh.userData.light = true;
  return mesh;
}

let plane = null;
const poolGeometry = () => (plane ??= new THREE.PlaneGeometry(1, 1));

const SPARK_VERTEX = /* glsl */ `
  attribute vec3 seed;
  uniform float uClock, uScreen, uSize, uLife, uSpin;
  varying float vAge;
  void main() {
    float offset = modelMatrix[3].x * 0.37 + modelMatrix[3].z * 0.71;
    float age = fract(uClock / uLife + seed.x + offset);
    vAge = age;
    float angle = seed.y * 6.2832;
    vec3 at;
    if (uSpin > 0.5) {
      // Thrown off the rim of a spinning wheel: out along the tangent, then falling.
      float rim = angle + uClock * 14.0 - age * 2.0;
      float reach = 0.1 + age * (0.5 + seed.z * 0.5);
      at = vec3(cos(rim) * reach, 0.1 + age * 0.22 - age * age * 0.26, sin(rim) * reach);
    } else {
      // A fountain: up fast, spreading, then dropping back.
      float speed = 1.6 + seed.z * 2.6;
      float spread = 0.14 + seed.z * 0.3;
      at = vec3(cos(angle) * spread * age * 2.4, speed * age * 1.5 - 3.0 * age * age, sin(angle) * spread * age * 2.4);
    }
    vec4 view = modelViewMatrix * vec4(at, 1.0);
    gl_PointSize = uSize * (1.0 - age * 0.55) * length(modelMatrix[1].xyz) * projectionMatrix[1][1] * uScreen * 0.5 / max(0.5, -view.z);
    gl_Position = projectionMatrix * view;
  }`;
const SPARK_FRAGMENT = /* glsl */ `
  varying float vAge;
  void main() {
    float round_ = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
    vec3 hot = mix(vec3(1.0, 0.82, 0.42), vec3(1.0, 0.32, 0.05), vAge);
    gl_FragColor = vec4(hot * 1.3 * round_ * (1.0 - vAge * vAge), 1.0);
  }`;

const sparkMaterials = new Map();
function sparkMaterial(spin) {
  if (!sparkMaterials.has(spin)) {
    sparkMaterials.set(spin, new THREE.ShaderMaterial({
      vertexShader: SPARK_VERTEX, fragmentShader: SPARK_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uClock: clock, uScreen: screen, uSize: { value: spin ? 0.05 : 0.06 }, uLife: { value: spin ? 0.7 : 1.1 }, uSpin: { value: spin ? 1 : 0 } },
    }));
  }
  return sparkMaterials.get(spin);
}

const sparkGeometries = new Map();
function sparkGeometry(count) {
  if (!sparkGeometries.has(count)) {
    const geometry = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < seeds.length; i += 1) seeds[i] = Math.random();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 3));
    sparkGeometries.set(count, geometry);
  }
  return sparkGeometries.get(count);
}

export function sparks({ spin = false, count = 90 } = {}) {
  const points = new THREE.Points(sparkGeometry(count), sparkMaterial(spin));
  points.frustumCulled = false;
  return points;
}
