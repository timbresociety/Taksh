// Cardio Circuit: the hero shows each exercise like a mirror, and Aalsi Raja, a giant lazy sofa with a
// crown, takes every rep the player lands.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BOSS_NAME, calledExercise, repsFor } from "../../templates/circuit.js";
import { MOVE_POSES, applyPose } from "../coach.js";
import { damp } from "./shared.js";

const LOOP_S = 2.2;
const SOFA_Z = -6.5;
const SOFA_SCALE = 1.55;
const CUSHIONS = 9;
const ORBS = 8;
const ORB_S = 0.34;
const FLY_S = 1.3;
const HERO_X = -3;
const HERO_Z = 2.6;
const CROWN_Y = 3.95;
const EYE_Y = 3;
const MOUTH_Y = 2.48;

function soft(world, width, height, depth, colour) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 3, Math.min(width, height, depth) * 0.22), world.material(colour, { roughness: 0.85 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function eyeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const pen = canvas.getContext("2d");
  pen.fillStyle = "#fbf6ea";
  pen.beginPath();
  pen.arc(64, 64, 60, 0, Math.PI * 2);
  pen.fill();
  pen.fillStyle = "#16120f";
  pen.beginPath();
  pen.arc(64, 74, 26, 0, Math.PI * 2);
  pen.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The Couch King: buttoned velvet, a sagging seat, cushions that come off, and two heavy eyelids.
function makeSofa(world) {
  const group = new THREE.Group();
  const velvet = "#7a2240";
  const dark = "#4d1429";
  const seat = soft(world, 4.8, 0.8, 2.2, velvet);
  seat.position.set(0, 0.8, 0);
  const back = soft(world, 4.8, 2.9, 0.7, velvet);
  back.position.set(0, 2.25, -0.9);
  group.add(seat, back);
  for (const side of [-1, 1]) {
    const arm = soft(world, 0.8, 1.5, 2.5, dark);
    arm.position.set(side * 2.65, 1.15, 0);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.42, 10), world.material("#d9a441", { metalness: 0.5, roughness: 0.4 }));
    foot.position.set(side * 2.5, 0.21, 0.9);
    const rear = foot.clone();
    rear.position.z = -0.9;
    group.add(arm, foot, rear);
  }
  const crown = new THREE.Group();
  const gold = world.material("#ffcf33", { metalness: 0.65, roughness: 0.3 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.66, 0.32, 18), gold);
  crown.add(band);
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2;
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 6), gold);
    point.position.set(Math.cos(angle) * 0.68, 0.34, Math.sin(angle) * 0.68);
    crown.add(point);
  }
  crown.position.set(0, CROWN_Y, -0.9);
  crown.rotation.z = 0.14;
  group.add(crown);

  // Each lid hangs from the top of its eye, and only ever comes down so far.
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.42, 28), new THREE.MeshBasicMaterial({ map: eyeTexture(), toneMapped: false }));
    eye.userData.keepMaterial = true;
    eye.position.set(side * 1, EYE_Y, -0.53);
    const lid = new THREE.Mesh(new THREE.CircleGeometry(0.46, 24, Math.PI, Math.PI), world.material(velvet));
    lid.position.set(side * 1, EYE_Y + 0.44, -0.52);
    group.add(eye, lid);
    return lid;
  });
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.02), world.material("#2a0b16"));
  mouth.position.set(0, MOUTH_Y, -0.54);
  group.add(mouth);

  const colours = ["#e8b923", "#2f9e8f", "#f07a1f", "#c8407f", "#6f7bd0"];
  const cushions = Array.from({ length: CUSHIONS }, (_, index) => {
    const pillow = soft(world, 1.1, 0.42, 0.95, colours[index % colours.length]);
    const row = Math.floor(index / 3);
    pillow.position.set(((index % 3) - 1) * 1.45, 1.32 + row * 0.42, 0.25 - row * 0.28);
    pillow.rotation.set(0.05 * (index % 2), 0.2 * ((index % 3) - 1), 0.06 * ((index % 2) - 0.5));
    group.add(pillow);
    return { pillow, home: pillow.position.clone(), turn: pillow.rotation.clone(), flying: 0 };
  });
  return { group: world.dress(group), cushions, lids: eyes, mouth, crown };
}

function makeMat(world) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(10.5, 56), world.material(world.data.path, { roughness: 0.92 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.02, -2);
  mesh.receiveShadow = true;
  const inner = new THREE.Mesh(new THREE.RingGeometry(2, 2.14, 48), world.material(world.data.accent, { emissive: world.data.accent, emissiveIntensity: 0.25 }));
  inner.rotation.x = -Math.PI / 2;
  inner.position.set(HERO_X, 0.04, HERO_Z);
  const group = new THREE.Group();
  group.add(mesh, inner);
  return world.dress(group);
}

// The name of the exercise, big enough to read from where a player stands.
function callBoard() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const pen = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, fog: false, toneMapped: false }));
  sprite.userData.keepMaterial = true;
  sprite.renderOrder = 8;
  sprite.scale.set(6.4, 1.6, 1);
  return {
    sprite,
    paint(title, line, done, wanted) {
      pen.clearRect(0, 0, 1024, 256);
      pen.fillStyle = "rgba(16, 12, 10, 0.78)";
      pen.beginPath();
      pen.roundRect(8, 8, 1008, 240, 34);
      pen.fill();
      pen.textAlign = "center";
      pen.textBaseline = "middle";
      pen.fillStyle = "#ffd23f";
      pen.font = "800 40px system-ui, sans-serif";
      pen.fillText(line, 512, 54);
      pen.fillStyle = "#fff8e6";
      pen.font = "900 92px system-ui, sans-serif";
      pen.fillText(title, 512, 130, 960);
      const shown = Math.min(wanted, 12);
      const lit = Math.round((done / Math.max(wanted, 1)) * shown);
      for (let i = 0; i < shown; i += 1) {
        pen.fillStyle = i < lit ? "#35d07f" : "rgba(255,255,255,0.22)";
        pen.beginPath();
        pen.arc(512 + (i - (shown - 1) / 2) * 44, 208, 14, 0, Math.PI * 2);
        pen.fill();
      }
      texture.needsUpdate = true;
    },
  };
}

function orb() {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshBasicMaterial({ color: "#ffe45e", fog: false, toneMapped: false }));
  mesh.userData.keepMaterial = true;
  mesh.visible = false;
  return mesh;
}

export const circuit = {
  async build({ scene, camera, world, hero, fx, focusShadow, accent }) {
    scene.add(makeMat(world), world.ring({ inner: 12 }));
    const sofa = makeSofa(world);
    sofa.group.position.set(2.2, 0, SOFA_Z);
    sofa.group.scale.setScalar(SOFA_SCALE);
    sofa.group.rotation.y = -0.22;
    scene.add(sofa.group);

    hero.root.position.set(HERO_X, 0, HERO_Z);
    hero.play("Idle_Loop");

    const board = callBoard();
    board.sprite.position.set(0, 5.9, 0);
    scene.add(board.sprite);
    const orbs = Array.from({ length: ORBS }, () => ({ mesh: orb(), s: 0 }));
    for (const item of orbs) scene.add(item.mesh);

    let shown = null;
    let move = null;
    let started = 0;
    let clip = "Idle_Loop";
    let thump = 0;
    let lastLoop = -1;
    let topple = 0;
    let boardKey = "";
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const sofaAt = new THREE.Vector3(2.2, 3.6, SOFA_Z + 1.4);

    const paintBoard = (state, exercise) => {
      const done = state.phase === "set" ? state.done : 0;
      const wanted = exercise ? repsFor(exercise, state.reps) : 0;
      const key = `${exercise?.id}-${state.phase}-${done}-${state.won}`;
      if (key === boardKey) return;
      boardKey = key;
      if (state.won) board.paint(`${BOSS_NAME} is out`, "KNOCKED OUT", 1, 1);
      else if (!exercise) board.paint("Round done", "WELL DONE", 1, 1);
      else board.paint(exercise.label, state.phase === "rest" ? "GET READY" : "GO", done, wanted);
    };

    return {
      update(state, dt, elapsed) {
        const exercise = calledExercise(state);
        if (exercise && exercise.id !== shown) {
          shown = exercise.id;
          started = elapsed;
          lastLoop = -1;
        }

        // Both sides of an exercise take turns, one whole loop each.
        const loop = Math.floor((elapsed - started) / LOOP_S);
        if (exercise && loop !== lastLoop) {
          lastLoop = loop;
          move = exercise.moves[loop % exercise.moves.length];
        }
        const pose = move && MOVE_POSES[move]?.(((elapsed - started) % LOOP_S) / LOOP_S);
        const wantedClip = state.won ? "Yes" : move && !pose ? "Jog_Fwd_Loop" : "Idle_Loop";
        if (wantedClip !== clip && wantedClip !== "Yes") {
          clip = wantedClip;
          hero.play(clip, { fade: 0.15 });
        }
        hero.root.position.set(HERO_X + (pose?.x ?? 0), pose?.y ?? 0, HERO_Z);
        hero.root.rotation.y = pose?.turn ?? 0;
        hero.root.updateMatrixWorld(true);
        if (pose && !state.won) applyPose(hero, pose);

        // A cushion comes off for each ninth of his health, and flies off rather than vanishing.
        const left = Math.ceil((state.health / state.maxHealth) * CUSHIONS);
        for (const [index, item] of sofa.cushions.entries()) {
          const gone = index >= left;
          if (gone && !item.flying && item.pillow.visible) item.flying = 0.001;
          if (!gone && !item.pillow.visible) {
            item.pillow.visible = true;
            item.flying = 0;
            item.pillow.position.copy(item.home);
            item.pillow.rotation.copy(item.turn);
          }
          if (item.flying) {
            item.flying += dt;
            const p = item.flying / FLY_S;
            item.pillow.position.set(item.home.x * (1 + p * 1.6), item.home.y + Math.sin(p * Math.PI) * 2.4 - p * p * 2, item.home.z + p * 5.5);
            item.pillow.rotation.x += dt * 8;
            item.pillow.rotation.z += dt * 5;
            if (p >= 1) {
              item.pillow.visible = false;
              item.flying = 0;
            }
          }
        }

        thump = damp(thump, 0, 9, dt);
        const breathe = Math.sin(elapsed * 1.1) * 0.012;
        sofa.group.scale.set(SOFA_SCALE * (1 + thump * 0.08), SOFA_SCALE * (1 + breathe - thump * 0.12), SOFA_SCALE * (1 + thump * 0.05));
        const asleep = state.phase === "rest" && !state.won;
        for (const lid of sofa.lids) lid.scale.y = damp(lid.scale.y, thump > 0.2 ? 0.25 : asleep ? 1.6 : 0.9, 8, dt);
        sofa.mouth.scale.y = 1 + thump * 8;

        if (state.won) topple = damp(topple, 1, 2.4, dt);
        sofa.group.rotation.x = -topple * 1.25;
        sofa.group.position.y = -topple * 0.8;
        sofa.crown.position.y = CROWN_Y + topple * 0.3;

        for (const item of orbs) {
          if (item.s <= 0) continue;
          item.s -= dt;
          const p = 1 - item.s / ORB_S;
          item.mesh.position.lerpVectors(from, to, p);
          item.mesh.position.y += Math.sin(p * Math.PI) * 1.1;
          if (item.s <= 0) {
            item.mesh.visible = false;
            thump = 1;
            fx.burst(to, "#ffe45e", 16);
          }
        }

        paintBoard(state, exercise);
        camera.position.set(0, 3, 10.4);
        camera.lookAt(0, 2.3, -2);
        focusShadow(0, 0, -2);
      },
      event(event, state) {
        if (event.type === "rep") {
          from.set(hero.root.position.x, 1.4, HERO_Z);
          to.copy(sofaAt);
          const free = orbs.find((item) => item.s <= 0);
          if (free) {
            free.s = ORB_S;
            free.mesh.visible = true;
          }
        }
        if (event.type === "set_done") {
          fx.flash(accent, 0.22);
          fx.burst({ x: HERO_X, y: 2, z: HERO_Z }, accent, 34);
        }
        if (event.type === "short") fx.flash("#808080", 0.12);
        if (event.type === "boss_down") {
          fx.flash("#ffffff", 0.5);
          fx.shake(0.7);
          hero.play("Yes", { once: true });
          for (const x of [-1, 2, 5]) fx.burst({ x, y: 3, z: SOFA_Z + 1 }, "#ffb02e", 50);
        }
        if (event.type === "end" && !state.won) hero.play("Idle_Loop");
      },
    };
  },
};
