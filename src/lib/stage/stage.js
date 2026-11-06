// Hosts any game: one renderer, world, art style and cast, with a per-template view drawing the state.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { createCharacter } from "./character.js";
import { LOOKS, StylePass, applyLook } from "./styles.js";
import { VIEWS, showcase } from "./views/index.js";
import { loadWorld } from "./worlds.js";

const SHADOW_REACH = 26;

class Sparks {
  constructor(scene) {
    this.items = [];
    this.geometry = new THREE.BufferGeometry();
    this.capacity = 240;
    this.positions = new Float32Array(this.capacity * 3).fill(-999);
    this.colours = new Float32Array(this.capacity * 3);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colours, 3));
    const dot = document.createElement("canvas");
    dot.width = 32;
    dot.height = 32;
    const pen = dot.getContext("2d");
    pen.fillStyle = "#fff";
    pen.arc(16, 16, 14, 0, Math.PI * 2);
    pen.fill();
    this.points = new THREE.Points(this.geometry, new THREE.PointsMaterial({ size: 0.13, map: new THREE.CanvasTexture(dot), alphaTest: 0.4, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
    this.points.frustumCulled = false;
    this.points.userData.keepMaterial = true;
    scene.add(this.points);
    this.next = 0;
  }

  burst(at, colour, count = 26) {
    const tone = new THREE.Color(colour);
    for (let i = 0; i < count; i += 1) {
      this.items[this.next] = {
        x: at.x, y: at.y, z: at.z, life: 0.5 + Math.random() * 0.4,
        vx: (Math.random() - 0.5) * 7, vy: Math.random() * 6 + 1, vz: (Math.random() - 0.5) * 7,
      };
      this.colours.set([tone.r, tone.g, tone.b], this.next * 3);
      this.next = (this.next + 1) % this.capacity;
    }
    this.geometry.attributes.color.needsUpdate = true;
  }

  update(dt) {
    this.items.forEach((item, index) => {
      if (!item) return;
      item.life -= dt;
      item.vy -= 14 * dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.z += item.vz * dt;
      this.positions.set(item.life > 0 ? [item.x, item.y, item.z] : [-999, -999, -999], index * 3);
    });
    this.geometry.attributes.position.needsUpdate = true;
  }
}

// The stage makes its own canvas inside host. A lost context can't be revived, and React may mount
// the same element twice, so a canvas never outlives its stage.
export async function createStage(host, spec, { preview = false } = {}) {
  const look = LOOKS[spec.skin.style];
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  host.replaceChildren(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: "high-performance", preserveDrawingBuffer: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = look.exposure ?? 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.3, 600);

  const restyle = (object) => {
    applyLook(object, spec.skin.style);
    return object;
  };
  const world = await loadWorld(spec.skin.world, restyle);
  const { data } = world;
  const lightScale = look.light ?? 1;

  // Metal models read as black without something to reflect.
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.2 * lightScale;
  scene.background = new THREE.Color(look.haze ?? data.haze);
  scene.fog = new THREE.Fog(look.haze ?? data.haze, ...data.hazeRange);
  scene.add(world.sky(look));
  scene.add(world.ground());
  scene.add(new THREE.HemisphereLight(data.fill.sky, data.fill.ground, data.fill.power * lightScale));

  const sun = new THREE.DirectionalLight(data.sun.colour, data.sun.power * lightScale);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -SHADOW_REACH, right: SHADOW_REACH, top: SHADOW_REACH, bottom: -SHADOW_REACH, near: 1, far: 160 });
  scene.add(sun, sun.target);
  const focusShadow = (x, y, z) => {
    sun.target.position.set(x, y, z);
    sun.position.set(x + data.sun.from[0], y + data.sun.from[1], z + data.sun.from[2]);
  };
  focusShadow(0, 0, 0);

  const view = preview ? showcase : VIEWS[spec.template];
  const [hero, rival] = await Promise.all([
    createCharacter(spec.skin.hero),
    view.usesRival ? createCharacter(spec.skin.rival) : null,
  ]);
  for (const member of [hero, rival]) if (member) {
    restyle(member.root);
    scene.add(member.root);
  }

  const sparks = new Sparks(scene);
  const fx = { burst: (at, colour, count) => sparks.burst(at, colour, count), shake: (amount) => { shake = Math.max(shake, amount); }, flash: (colour, amount = 0.4) => { style.material.uniforms.uFlashColour.value.set(colour); style.material.uniforms.uFlash.value = amount; } };
  let shake = 0;

  const composer = new EffectComposer(renderer);
  const style = new StylePass(scene, camera, spec.skin.style);
  composer.addPass(style);
  if (look.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), look.bloom, 0.6, 0.72));
  composer.addPass(new OutputPass());

  const drawn = await view.build({ scene, camera, world, hero, rival, fx, focusShadow, spec, accent: data.accent });

  function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resize();

  let elapsed = 0;
  return {
    resize,
    // Call once per frame. dtMs is real time, so the scene keeps breathing while the game is paused.
    frame(state, dtMs) {
      const dt = dtMs / 1000;
      elapsed += dt;
      hero.update(dt);
      rival?.update(dt);
      drawn.update(state, dt, elapsed);
      sparks.update(dt);
      if (shake > 0.002) {
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
        shake *= 0.86;
      }
      const uniforms = style.material.uniforms;
      uniforms.uFlash.value *= 0.86;
      uniforms.uTime.value = elapsed;
      composer.render();
    },
    event: (event, state) => drawn.event?.(event, state),
    dispose() {
      composer.dispose();
      style.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // a page may only hold a few live contexts, and previews come and go
      canvas.remove();
    },
  };
}
