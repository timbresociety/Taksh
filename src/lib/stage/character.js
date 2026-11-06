// A rigged human: one body, optional hair, and the shared 65-bone skeleton that every clip in the
// animation library targets, so any clip plays on any character with no retargeting.
import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { loadAsset } from "./assets.js";

const HAIR_FILES = { "simple-parted": "hair-simpleparted", long: "hair-long", buns: "hair-buns", buzzed: "hair-buzzed", "buzzed-female": "hair-buzzedfemale" };
const BODY_FILES = {
  "athlete-female": { file: "body-female", sex: "female", clothed: true },
  "athlete-male": { file: "body-male", sex: "male", clothed: true },
  "ranger-female": { file: "outfit-female-ranger", sex: "female" },
  "ranger-male": { file: "outfit-male-ranger", sex: "male" },
  "peasant-female": { file: "outfit-female-peasant", sex: "female" },
  "peasant-male": { file: "outfit-male-peasant", sex: "male" },
};

let library = null;

export function loadClips() {
  library ??= Promise.all([loadAsset("anim/library-1"), loadAsset("anim/library-2")]).then((files) => {
    const clips = new Map();
    for (const file of files) for (const clip of file.animations) clips.set(clip.name, clip);
    return clips;
  });
  return library;
}

// Parts ship with their own copy of the skeleton, so they are rebound to the body's bones by name.
function rebind(part, bones) {
  part.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    const mapped = node.skeleton.bones.map((bone) => bones.get(bone.name) ?? bone);
    node.bind(new THREE.Skeleton(mapped, node.skeleton.boneInverses), node.bindMatrix);
  });
}

function prepare(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.frustumCulled = false;
  });
}

// The base body wears nothing but underwear, so sportswear is painted on in the shader. Edges are cut
// in the bind pose, where every body stands in the same T, so the hems stay put however the rig moves.
// Bind positions are quantised to -1..1 from the soles to the crown.
function dress(mesh, look) {
  const material = mesh.material.clone();
  const uniforms = {
    uSkin: { value: new THREE.Color(look.skinTone) },
    uTop: { value: new THREE.Color(look.top) },
    uBottom: { value: new THREE.Color(look.bottom) },
    uShoes: { value: new THREE.Color(look.shoes) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBind;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBind;\nuniform vec3 uSkin, uTop, uBottom, uShoes;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float edge = 0.006;
        float x = abs(vBind.x);
        float shade = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        vec3 skin = uSkin * (0.55 + shade * 0.9);
        float collar = 0.71 - 0.07 * (1.0 - smoothstep(0.0, 0.09, x));
        float top = smoothstep(0.08 - edge, 0.08 + edge, vBind.y) * (1.0 - smoothstep(collar - edge, collar + edge, vBind.y)) * (1.0 - smoothstep(0.36, 0.36 + edge, x));
        float bottom = smoothstep(-0.46 - edge, -0.46 + edge, vBind.y) * (1.0 - smoothstep(0.1 - edge, 0.1 + edge, vBind.y));
        float shoes = 1.0 - smoothstep(-0.86 - edge, -0.86 + edge, vBind.y);
        vec3 cloth = uTop * top + uBottom * bottom * (1.0 - top) + uShoes * shoes;
        float worn = clamp(top + bottom + shoes, 0.0, 1.0);
        diffuseColor.rgb = mix(skin, cloth * (0.86 + shade * 0.22), worn);`,
      );
  };
  material.customProgramCacheKey = () => "taksh-dress";
  mesh.material = material;
  return uniforms;
}

// Hair textures are grey so that one tint can colour them.
function tint(root, colour) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.material = node.material.clone();
    node.material.color = new THREE.Color(colour);
  });
}

// Outfit files stop at the neck or hide the face, so they borrow the head of the matching base body:
// only the triangles driven by the head and neck survive.
function borrowHead(bodyScene, bones, look) {
  const head = cloneSkinned(bodyScene);
  head.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    if (!/Superhero|SuperHero|Retopology/.test(node.name + node.geometry.name)) return;
    const names = node.skeleton.bones.map((bone) => bone.name);
    const keep = new Set(names.flatMap((name, index) => (/^(Head|neck_01)$/.test(name) ? [index] : [])));
    const joints = node.geometry.attributes.skinIndex;
    const weights = node.geometry.attributes.skinWeight;
    const onHead = (vertex) => {
      let total = 0;
      for (let slot = 0; slot < 4; slot += 1) if (keep.has(joints.getComponent(vertex, slot))) total += weights.getComponent(vertex, slot);
      return total > 0.5;
    };
    const source = node.geometry.index;
    const kept = [];
    for (let i = 0; i < source.count; i += 3) {
      const face = [source.getX(i), source.getX(i + 1), source.getX(i + 2)];
      if (face.every(onHead)) kept.push(...face);
    }
    node.geometry = node.geometry.clone();
    node.geometry.setIndex(kept);
    dress(node, { skinTone: look.skinTone, top: look.skinTone, bottom: look.skinTone, shoes: look.skinTone });
  });
  rebind(head, bones);
  return head;
}

const dropHood = (root) => root.traverse((node) => {
  if (node.isMesh && /hood/i.test(node.name)) node.visible = false;
});

export function aimBone(bone, direction, weight = 1) {
  const child = bone.children.find((item) => item.isBone);
  if (!child) return;
  bone.updateWorldMatrix(true, false);
  const start = bone.getWorldPosition(scratch.a);
  const end = child.getWorldPosition(scratch.b);
  const current = end.sub(start).normalize();
  const turn = scratch.q.setFromUnitVectors(current, scratch.c.copy(direction).normalize());
  const world = bone.getWorldQuaternion(scratch.w);
  const target = scratch.t.copy(turn).multiply(world);
  const parent = bone.parent.getWorldQuaternion(scratch.p).invert();
  bone.quaternion.slerp(parent.multiply(target), weight);
  bone.updateWorldMatrix(false, true);
}

const scratch = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Quaternion(), t: new THREE.Quaternion(), p: new THREE.Quaternion() };

export async function createCharacter(look) {
  const body = BODY_FILES[look.body];
  const hairFile = HAIR_FILES[look.hair];
  const [source, base, clips, hair] = await Promise.all([
    loadAsset(`character/${body.file}`),
    loadAsset(`character/body-${body.sex}`),
    loadClips(),
    hairFile ? loadAsset(`character/${hairFile}`) : null,
  ]);
  const root = cloneSkinned(source.scene);
  const bones = new Map();
  root.traverse((node) => {
    if (node.isBone) bones.set(node.name, node);
    if (body.clothed && node.isSkinnedMesh && /Superhero|SuperHero|Retopology/.test(node.name + node.geometry.name)) dress(node, look);
  });
  if (!body.clothed) {
    dropHood(root);
    root.add(borrowHead(base.scene, bones, look));
  }
  if (hair) {
    const copy = cloneSkinned(hair.scene);
    rebind(copy, bones);
    tint(copy, look.hairColour);
    root.add(copy);
  }
  prepare(root);

  const mixer = new THREE.AnimationMixer(root);
  let current = null;
  let currentName = null;

  function play(name, { once = false, fade = 0.18, speed = 1, then = null } = {}) {
    const clip = clips.get(name);
    if (!clip) throw new Error(`No clip named ${name}`);
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.timeScale = speed;
    if (current && current !== action) current.crossFadeTo(action, fade, false);
    action.play();
    current = action;
    currentName = name;
    if (once && then) {
      const done = (event) => {
        if (event.action !== action) return;
        mixer.removeEventListener("finished", done);
        if (current === action) play(then, { fade });
      };
      mixer.addEventListener("finished", done);
    }
    return action;
  }

  // A looping clip is only restarted when it really changes, so views can call this every frame.
  const loop = (name, options) => {
    if (currentName !== name) play(name, options);
  };

  return { root, bones, mixer, play, loop, update: (delta) => mixer.update(delta), clipNames: () => [...clips.keys()] };
}
