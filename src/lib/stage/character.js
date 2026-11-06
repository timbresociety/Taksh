// A rigged human: one body, optional hair, and the shared 65-bone skeleton that every clip in the
// animation library targets, so any clip plays on any character with no retargeting.
import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { loadAsset } from "./assets.js";
import { WEAR } from "./props/wear.js";

const HAIR_FILES = { "simple-parted": "hair-simpleparted", long: "hair-long", buns: "hair-buns", buzzed: "hair-buzzed", "buzzed-female": "hair-buzzedfemale" };
const BODY_FILES = {
  "athlete-female": { file: "body-female", sex: "female", clothed: true },
  "athlete-male": { file: "body-male", sex: "male", clothed: true },
  "ranger-female": { file: "outfit-female-ranger", sex: "female" },
  "ranger-male": { file: "outfit-male-ranger", sex: "male" },
  "peasant-female": { file: "outfit-female-peasant", sex: "female" },
  "peasant-male": { file: "outfit-male-peasant", sex: "male" },
  // Working clothes, on the plain body so every clip still fits. The cut hems the skin underneath, and
  // the real tunic and trousers from the villager outfit go over it, re-tailored by CLOTHES.
  dabbawala: { file: "body-male", sex: "male", clothed: true, hair: "buzzed", outfit: { top: "#f6f2e6", bottom: "#efe9da", shoes: "#5c3a20", cut: { sleeve: 0.74, topHem: 0.2, bottomHem: -0.875, shoe: -0.975 } } },
  fisherman: { file: "body-male", sex: "male", clothed: true, hair: "buzzed", outfit: { top: "#8fb4c2", bottom: "#2d4f9e", shoes: "#000000", cut: { sleeve: 0.3, topHem: 0.2, bottomHem: -0.3, shoe: -9 } } },
};

// Where the painted clothes stop, in bind coordinates: how far down the arm a sleeve reaches, and the
// heights of the top's hem, the bottom's hem and the top of the shoe.
const SPORTSWEAR = { sleeve: 0.36, topHem: 0.08, bottomHem: -0.46, shoe: -0.86 };
// Nothing worn at all, for a head on its own.
const BARE = { sleeve: -1, topHem: 9, bottomHem: 9, shoe: -9 };

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
  const cut = look.cut ?? SPORTSWEAR;
  const material = mesh.material.clone();
  const uniforms = {
    uSkin: { value: new THREE.Color(look.skinTone) },
    uTop: { value: new THREE.Color(look.top) },
    uBottom: { value: new THREE.Color(look.bottom) },
    uShoes: { value: new THREE.Color(look.shoes) },
    uCut: { value: new THREE.Vector4(cut.sleeve, cut.topHem, cut.bottomHem, cut.shoe) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBind;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBind;\nuniform vec3 uSkin, uTop, uBottom, uShoes;\nuniform vec4 uCut;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float edge = 0.006;
        float x = abs(vBind.x);
        float shade = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        vec3 skin = uSkin * (0.55 + shade * 0.9);
        float collar = 0.71 - 0.07 * (1.0 - smoothstep(0.0, 0.09, x));
        float top = smoothstep(uCut.y - edge, uCut.y + edge, vBind.y) * (1.0 - smoothstep(collar - edge, collar + edge, vBind.y)) * (1.0 - smoothstep(uCut.x, uCut.x + edge, x));
        float bottom = smoothstep(uCut.z - edge, uCut.z + edge, vBind.y) * (1.0 - smoothstep(0.1 - edge, 0.1 + edge, vBind.y));
        float shoes = 1.0 - smoothstep(uCut.w - edge, uCut.w + edge, vBind.y);
        vec3 cloth = uTop * top + uBottom * bottom * (1.0 - top) + uShoes * shoes;
        float worn = clamp(top + bottom + shoes, 0.0, 1.0);
        diffuseColor.rgb = mix(skin, cloth * (0.86 + shade * 0.22), worn);`,
      )
      // Neon glows from the texture, which is the bare body, so the glow has to take the painted colour.
      .replace("#include <emissivemap_fragment>", "totalEmissiveRadiance = diffuseColor.rgb * emissive.r;");
  };
  material.customProgramCacheKey = () => "taksh-dress";
  mesh.material = material;
  return uniforms;
}

// What each working outfit does to the villager's clothes. Heights are metres above the soles.
//   hollow     the part of the plain body to remove, because it is bigger than the clothes over it
//   waist, hem cloth below the waist is pulled down to the hem, for a kurta or a full-length pyjama
//   flare      how much wider it gets on the way down
//   cutAt      cloth below this height is folded up to it, for a lungi tied up over the knee
//   texture    how much of the old garment's texture still shows, as light and shade
const CLOTHES = {
  dabbawala: {
    hollow: { from: 0.26, to: 1.47, width: 0.36 },
    garments: [
      { part: /Body/, colour: "#f4f0e4", waist: 0.98, hem: 0.56, flare: 1.1, texture: 0.3 },
      { part: /Legs/, colour: "#ece6d6", waist: 0.72, hem: 0.1, texture: 0.3 },
    ],
  },
  fisherman: {
    hollow: { from: 0.56, to: 1.47, width: 0.36 },
    garments: [
      { part: /Body/, colour: "#8fb4c2", texture: 0.6 },
      { part: /Legs/, colour: "#2d4f9e", check: "#d8362a", cutAt: 0.58, texture: 0.5 },
    ],
  },
};

// Re-cuts a garment in metres, in the rest pose. The vertices keep their skin weights, so a lengthened
// hem still swings with the legs it was tied to.
function tailor(mesh, rest, { waist, hem, flare = 1, cutAt, hollow }) {
  const geometry = mesh.geometry.clone();
  const toRest = rest.get(mesh.skeleton.bones[0].name).clone().multiply(mesh.skeleton.boneInverses[0]).multiply(mesh.bindMatrix);
  const fromRest = toRest.clone().invert();
  const source = geometry.attributes.position;
  const baked = new Float32Array(source.count * 3);
  const at = new THREE.Vector3();
  const lowest = new THREE.Box3().setFromBufferAttribute(source).applyMatrix4(toRest).min.y;
  const gone = new Uint8Array(source.count);
  for (let i = 0; i < source.count; i += 1) {
    at.fromBufferAttribute(source, i).applyMatrix4(toRest);
    gone[i] = at.y < cutAt || (hollow && at.y > hollow.from && at.y < hollow.to && Math.abs(at.x) < hollow.width) ? 1 : 0;
    // Folding the crossing triangles to one height is what gives a straight hem, not a ragged one.
    if (at.y < cutAt) at.y = cutAt;
    if (hem !== undefined && at.y < waist) {
      const down = (waist - at.y) / (waist - lowest);
      at.y = waist - down * (waist - hem);
      at.x *= 1 + (flare - 1) * down;
      at.z *= 1 + (flare - 1) * down;
    }
    at.applyMatrix4(fromRest).toArray(baked, i * 3);
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(baked, 3));
  if (cutAt !== undefined || hollow) {
    const faces = geometry.index;
    const kept = [];
    for (let i = 0; i < faces.count; i += 3) {
      const face = [faces.getX(i), faces.getX(i + 1), faces.getX(i + 2)];
      if (!face.every((vertex) => gone[vertex])) kept.push(...face);
    }
    geometry.setIndex(kept);
  }
  mesh.geometry = geometry;
}

// Dyes a garment: its texture stays as light and shade, its colour is replaced, and an optional check
// is woven in from the rest-pose position, so the pattern stays on the cloth as it moves.
function dye(mesh, { colour, check, texture = 0.75 }) {
  const material = mesh.material.clone();
  const uniforms = { uCloth: { value: new THREE.Color(colour) }, uWeft: { value: new THREE.Color(check ?? colour) }, uWoven: { value: check ? 1 : 0 }, uShading: { value: texture } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWeave;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWeave = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWeave;\nuniform vec3 uCloth, uWeft;\nuniform float uWoven, uShading;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float shade = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        float threads = step(0.5, fract(vWeave.x * 7.0)) + step(0.5, fract(vWeave.y * 7.0));
        vec3 woven = mix(uCloth, uWeft, uWoven * threads * 0.5);
        diffuseColor.rgb = woven * (1.0 - uShading * 0.4 + shade * uShading);`,
      );
  };
  material.customProgramCacheKey = () => "taksh-dye";
  mesh.material = material;
}

function clothesFor(pieces, source, bones, rest) {
  const clothes = cloneSkinned(source);
  const meshes = [];
  clothes.traverse((node) => {
    if (node.isMesh) meshes.push(node);
  });
  for (const mesh of meshes) {
    const piece = pieces.find((item) => item.part.test(mesh.name));
    if (!piece) {
      mesh.visible = false;
      continue;
    }
    tailor(mesh, rest, piece);
    dye(mesh, piece);
  }
  rebind(clothes, bones);
  return clothes;
}

// Hair textures are grey so that one tint can colour them.
function tint(root, colour) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.material = node.material.clone();
    node.material.color = new THREE.Color(colour);
  });
}

// The triangles of a full body that are driven by the head and neck.
function headFaces(node) {
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
  return kept;
}

// Outfit files stop at the neck or hide the face, so they borrow the head of the matching base body:
// only the triangles driven by the head and neck survive.
function borrowHead(bodyScene, bones, look) {
  const head = cloneSkinned(bodyScene);
  head.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    if (!/Superhero|SuperHero|Retopology/.test(node.name + node.geometry.name)) return;
    const kept = headFaces(node);
    node.geometry = node.geometry.clone();
    node.geometry.setIndex(kept);
    dress(node, { skinTone: look.skinTone, top: look.skinTone, bottom: look.skinTone, shoes: look.skinTone });
  });
  rebind(head, bones);
  return head;
}

// The same head as plain meshes, in metres around the Head bone at rest, so copies can be set down
// anywhere near it. Baking the bind pose into the vertices is what makes them rigid.
function rigidHead(bodyScene, look, rest) {
  const scene = cloneSkinned(bodyScene);
  const parts = [];
  const headRest = rest.get("Head");
  const middle = new THREE.Vector3().setFromMatrixPosition(headRest);
  scene.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    const toRest = headRest.clone().multiply(node.skeleton.boneInverses[node.skeleton.bones.findIndex((bone) => bone.name === "Head")]).multiply(node.bindMatrix);
    const skin = /Superhero|SuperHero|Retopology/.test(node.name + node.geometry.name);
    const geometry = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      const source = node.geometry.getAttribute(name);
      const values = new Float32Array(source.count * source.itemSize);
      for (let i = 0; i < source.count; i += 1) for (let c = 0; c < source.itemSize; c += 1) values[i * source.itemSize + c] = source.getComponent(i, c);
      geometry.setAttribute(name, new THREE.BufferAttribute(values, source.itemSize));
    }
    const faces = skin ? headFaces(node) : [...node.geometry.index.array];
    geometry.setIndex(faces);
    geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(-middle.x, -middle.y, -middle.z).multiply(toRest));
    if (skin) dress(node, { skinTone: look.skinTone, top: look.skinTone, bottom: look.skinTone, shoes: look.skinTone, cut: BARE });
    parts.push({ geometry: geometry.toNonIndexed(), material: node.material });
  });
  return parts;
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

export async function createCharacter(chosen) {
  const body = BODY_FILES[chosen.body];
  const look = { ...chosen, ...body.outfit, hair: body.hair ?? chosen.hair };
  const hairFile = HAIR_FILES[look.hair];
  const [source, base, clips, hair, garments] = await Promise.all([
    loadAsset(`character/${body.file}`),
    loadAsset(`character/body-${body.sex}`),
    loadClips(),
    hairFile ? loadAsset(`character/${hairFile}`) : null,
    CLOTHES[chosen.body] ? loadAsset(`character/outfit-${body.sex}-peasant`) : null,
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
  // Kept so that anything worn later lands in the same place, whatever the rig is doing by then.
  root.updateWorldMatrix(true, true);
  const rest = new Map([...bones].map(([name, bone]) => [name, bone.matrixWorld.clone()]));
  const character = { root, bones, rest, steady: [], rigidHead: () => rigidHead(base.scene, look, rest) };
  if (garments) {
    const outfit = CLOTHES[look.body];
    root.traverse((node) => {
      if (node.isSkinnedMesh && /Superhero|SuperHero|Retopology/.test(node.name + node.geometry.name)) tailor(node, rest, { hollow: outfit.hollow });
    });
    root.add(clothesFor(outfit.garments, garments.scene, bones, rest));
  }
  WEAR[look.body]?.(character);
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

  // A load balanced on the head stays level however the head nods: that is the skill of carrying one.
  function update(delta) {
    mixer.update(delta);
    if (!character.steady.length) return;
    root.updateWorldMatrix(true, true);
    root.getWorldQuaternion(scratch.w);
    for (const item of character.steady) item.quaternion.copy(item.parent.getWorldQuaternion(scratch.p).invert()).multiply(scratch.w);
  }

  return Object.assign(character, { mixer, play, loop, update, clipNames: () => [...clips.keys()] });
}
