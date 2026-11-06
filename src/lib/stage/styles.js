// An art style is two things: how materials are redrawn, and one full-screen pass over the finished
// picture. Models are shared between stages, so materials are converted into copies, never changed.
import * as THREE from "three";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";

export const LOOKS = {
  bright: { material: "standard", post: { saturation: 1.12, vignette: 0.16 }, bloom: 0.08, exposure: 0.96 },
  toon: { material: "toon", post: { ink: 1, saturation: 1.22 }, exposure: 1.05 },
  neon: {
    material: "neon", post: { ink: 0.9, inkColour: "#3fe9ff", saturation: 1.35, vignette: 0.3 }, bloom: 0.85, exposure: 1,
    sky: ["#05010f", "#26086a"], haze: "#10042e", light: 0.32,
  },
  pixel: { material: "standard", post: { pixel: 5, posterise: 7, saturation: 1.25 }, exposure: 1.05 },
  comic: { material: "toon", post: { ink: 1, posterise: 5, halftone: 1, saturation: 1.3 }, exposure: 1.1 },
  clay: { material: "clay", post: { grain: 0.035, vignette: 0.28, saturation: 0.82 }, exposure: 1.08, light: 0.92 },
};

let bands = null;
function toonBands() {
  if (bands) return bands;
  bands = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 165, 165, 165, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  bands.minFilter = THREE.NearestFilter;
  bands.magFilter = THREE.NearestFilter;
  bands.needsUpdate = true;
  return bands;
}

const SHARED = ["map", "color", "transparent", "opacity", "alphaTest", "side", "alphaMap", "normalMap"];

function redraw(source, kind) {
  const base = Object.fromEntries(SHARED.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
  let next;
  if (kind === "toon") next = new THREE.MeshToonMaterial({ ...base, normalMap: null, gradientMap: toonBands() });
  if (kind === "clay") next = new THREE.MeshStandardMaterial({ ...base, normalMap: null, roughness: 1, metalness: 0 });
  if (kind === "neon") {
    next = new THREE.MeshStandardMaterial({ ...base, normalMap: null, roughness: 0.45, metalness: 0.2 });
    next.color = source.color.clone().multiplyScalar(0.12);
    next.emissive = source.color.clone();
    next.emissiveMap = source.map ?? null;
    next.emissiveIntensity = 0.2;
  }
  next.onBeforeCompile = source.onBeforeCompile;
  next.customProgramCacheKey = source.customProgramCacheKey;
  return next;
}

// A dressed character owns its material, so its copy is made fresh; kit materials are cached.
const converted = new Map();
export function applyLook(root, styleId) {
  const { material: kind } = LOOKS[styleId];
  if (kind === "standard") return;
  const cache = converted.get(styleId) ?? new WeakMap();
  converted.set(styleId, cache);
  root.traverse((node) => {
    if (!node.isMesh || node.userData.keepMaterial) return;
    if (!cache.has(node.material)) cache.set(node.material, redraw(node.material, kind));
    node.material = cache.get(node.material);
  });
}

const FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tColor, tDepth;
  uniform vec2 uSize;
  uniform vec3 uInkColour, uFlashColour;
  uniform float uNear, uFar, uPixel, uInk, uPosterise, uHalftone, uVignette, uSaturation, uGrain, uFlash, uTime;

  float distanceAt(vec2 uv) {
    float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
  }
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec2 uv = vUv;
    if (uPixel > 0.0) {
      vec2 cells = uSize / uPixel;
      uv = (floor(uv * cells) + 0.5) / cells;
    }
    vec3 colour = texture2D(tColor, uv).rgb;

    float grey = luma(colour);
    colour = max(mix(vec3(grey), colour, uSaturation), 0.0);

    if (uPosterise > 0.0) {
      vec3 shown = pow(colour, vec3(0.4545));
      colour = pow(floor(shown * uPosterise + 0.5) / uPosterise, vec3(2.2));
    }

    if (uHalftone > 0.0) {
      float angle = 0.6;
      vec2 cell = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * (vUv * uSize) / 6.0;
      float dot_ = length(fract(cell) - 0.5);
      float shade = 1.0 - clamp(pow(luma(colour), 0.4545), 0.0, 1.0);
      colour *= 1.0 - uHalftone * 0.55 * step(dot_, shade * 0.62);
    }

    if (uInk > 0.0) {
      vec2 step_ = (uPixel > 0.0 ? uPixel : 1.4) / uSize;
      float here = distanceAt(uv);
      float around = distanceAt(uv + vec2(step_.x, 0.0)) + distanceAt(uv - vec2(step_.x, 0.0))
        + distanceAt(uv + vec2(0.0, step_.y)) + distanceAt(uv - vec2(0.0, step_.y));
      float edge = smoothstep(0.012, 0.04, abs(around - 4.0 * here) / here);
      colour = mix(colour, uInkColour, edge * uInk);
    }

    vec2 centred = vUv - 0.5;
    colour *= 1.0 - uVignette * smoothstep(0.25, 0.75, length(centred));
    if (uGrain > 0.0) colour *= 1.0 + (noise(vUv * uSize + uTime) - 0.5) * uGrain * 2.0;
    colour = mix(colour, uFlashColour, uFlash);
    gl_FragColor = vec4(colour, 1.0);
  }
`;

const VERTEX = "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

// Draws the scene into a target that keeps its depth, then applies the style. Ink lines need depth,
// which the composer's own buffers do not hold.
export class StylePass extends Pass {
  constructor(scene, camera, styleId) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1) });
    const post = LOOKS[styleId].post;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        uSize: { value: new THREE.Vector2(1, 1) },
        uInkColour: { value: new THREE.Color(post.inkColour ?? "#15121f") },
        uFlashColour: { value: new THREE.Color("#ffffff") },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uPixel: { value: post.pixel ?? 0 },
        uInk: { value: post.ink ?? 0 },
        uPosterise: { value: post.posterise ?? 0 },
        uHalftone: { value: post.halftone ?? 0 },
        uVignette: { value: post.vignette ?? 0 },
        uSaturation: { value: post.saturation ?? 1 },
        uGrain: { value: post.grain ?? 0 },
        uFlash: { value: 0 },
        uTime: { value: 0 },
      },
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(width, height) {
    this.target.setSize(width, height);
    this.material.uniforms.uSize.value.set(width, height);
  }

  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
