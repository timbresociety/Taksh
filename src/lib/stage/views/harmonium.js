// Harmonium Hop: a giant painted harmonium stands up behind the road, its keys sliding down the
// bellows board. The player's limbs are strung to its four columns like a puppet's.
import * as THREE from "three";
import { startBeat, stopBeat, syncBeat, playReed } from "../../game/sound.js";
import { aimBone } from "../character.js";
import { arrowGlow } from "./matka.js";
import { Pool, damp, wordCard } from "./shared.js";

const COLUMN_X = [-2.7, -0.9, 0.9, 2.7];
const COLOURS = ["#ff7a1a", "#17b6a7", "#e8407f", "#7a5cff"];
const NAMES = ["LEFT FOOT", "LEFT HAND", "RIGHT HAND", "RIGHT FOOT"];
const LIMB_BONE = ["foot_l", "hand_l", "hand_r", "foot_r"];
const BOARD_LENGTH = 13;
const TILT = 0.86; // from upright, so the board leans away from the camera
const LINE = { y: 2.75, z: -2.2 }; // above the player's head, so no key is ever hidden by the body
const KEY_DEPTH = 1.2;

function drawHand(pen) {
  pen.beginPath();
  pen.ellipse(0, 16, 34, 38, 0, 0, Math.PI * 2);
  pen.fill();
  for (const [x, height, turn] of [[-27, 44, -0.16], [-9, 56, -0.04], [9, 56, 0.04], [27, 46, 0.16]]) {
    pen.save();
    pen.translate(x, -12);
    pen.rotate(turn);
    pen.fillRect(-7.5, -height, 15, height);
    pen.beginPath();
    pen.arc(0, -height, 7.5, 0, Math.PI * 2);
    pen.fill();
    pen.restore();
  }
}

function drawFoot(pen) {
  pen.beginPath();
  pen.ellipse(0, 18, 26, 46, 0, 0, Math.PI * 2);
  pen.fill();
  for (const [x, y, r] of [[-22, -40, 11], [-3, -46, 9], [12, -44, 8], [24, -38, 7], [33, -30, 6]]) {
    pen.beginPath();
    pen.arc(x, y, r, 0, Math.PI * 2);
    pen.fill();
  }
}

// Mirrored, so a left foot looks like a left foot and the two ends of the keyboard match.
export function drawLimb(pen, column, size, x, y) {
  pen.save();
  pen.translate(x, y);
  pen.scale(((column < 2 ? 1 : -1) * size) / 100, size / 100);
  (column === 0 || column === 3 ? drawFoot : drawHand)(pen);
  pen.restore();
}

function keyTexture(column) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 220;
  const pen = canvas.getContext("2d");
  pen.fillStyle = COLOURS[column];
  pen.fillRect(0, 0, 320, 220);
  pen.strokeStyle = "#fff4d6";
  pen.lineWidth = 8;
  pen.strokeRect(12, 12, 296, 196);
  pen.fillStyle = "#fff4d6";
  for (let x = 30; x < 300; x += 26) {
    for (const y of [24, 196]) {
      pen.beginPath();
      pen.arc(x, y, 3.5, 0, Math.PI * 2);
      pen.fill();
    }
  }
  drawLimb(pen, column, 118, 160, 118);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function plateTexture(column) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 192;
  const pen = canvas.getContext("2d");
  pen.fillStyle = "#2a1408";
  pen.fillRect(0, 0, 384, 192);
  pen.fillStyle = COLOURS[column];
  pen.fillRect(8, 8, 368, 176);
  pen.fillStyle = "#fff8e6";
  drawLimb(pen, column, 84, 192, 82);
  pen.font = "800 40px system-ui, sans-serif";
  pen.textAlign = "center";
  pen.fillText(NAMES[column], 192, 174);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeKey(column, world, texture) {
  const wood = world.material("#7a4422", { roughness: 0.75 });
  const top = new THREE.MeshBasicMaterial({ map: texture, fog: false, toneMapped: false });
  const key = new THREE.Mesh(new THREE.BoxGeometry(1.6, KEY_DEPTH, 0.24), [wood, wood, wood, wood, top, wood]);
  key.castShadow = true;
  key.userData.keepMaterial = true;
  return key;
}

function harmoniumBody(world) {
  const group = new THREE.Group();
  const teak = world.material("#5a2f16", { roughness: 0.6 });
  const dark = world.material("#2a1408", { roughness: 0.8 });
  const brass = world.material("#d9a441", { metalness: 0.6, roughness: 0.35 });

  // The sloped board, in its own frame: y runs up the slope, x across, z out of it.
  const board = new THREE.Group();
  board.position.set(0, LINE.y, LINE.z);
  board.rotation.x = -TILT;
  const back = new THREE.Mesh(new THREE.BoxGeometry(8, BOARD_LENGTH + 1.4, 0.3), teak);
  back.position.set(0, BOARD_LENGTH / 2 - 0.2, -0.3);
  back.receiveShadow = true;
  board.add(back);
  for (const [index, x] of COLUMN_X.entries()) {
    const groove = new THREE.Mesh(new THREE.BoxGeometry(1.68, BOARD_LENGTH + 0.8, 0.04), world.material(COLOURS[index], { roughness: 0.9 }));
    groove.material.color.lerp(new THREE.Color("#2a1408"), 0.8);
    groove.position.set(x, BOARD_LENGTH / 2, -0.13);
    board.add(groove);
  }
  for (const x of [-3.9, 3.9]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, BOARD_LENGTH + 1.4, 0.5), brass);
    rail.position.set(x, BOARD_LENGTH / 2 - 0.2, -0.1);
    board.add(rail);
  }

  // The ivory row under the name plates, which is what makes the whole thing read as a harmonium.
  const ivory = world.material("#f4ead2", { roughness: 0.4 });
  const ebony = world.material("#1c1210", { roughness: 0.5 });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(8, 0.84, 0.3), teak);
  bed.position.set(0, -1.32, -0.14);
  board.add(bed);
  for (let i = 0; i < 22; i += 1) {
    const x = -3.57 + i * 0.34;
    const white = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.68, 0.1), ivory);
    white.position.set(x, -1.32, 0.04);
    board.add(white);
    if (i === 21 || ![0, 1, 3, 4, 5].includes(i % 7)) continue;
    const black = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.4, 0.12), ebony);
    black.position.set(x + 0.17, -1.17, 0.12);
    board.add(black);
  }

  // The case and bellows below the line, folded like the real thing.
  const face = new THREE.Mesh(new THREE.BoxGeometry(8.2, LINE.y, 0.8), teak);
  face.position.set(0, LINE.y / 2, LINE.z - 0.5);
  group.add(face, board);
  for (let y = 0.25; y < LINE.y - 0.9; y += 0.32) {
    const fold = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.16, 0.14), dark);
    fold.position.set(0, y, LINE.z - 0.04);
    group.add(fold);
  }
  world.dress(group);
  return { group, board };
}

export const harmonium = {
  async build({ scene, camera, world, hero, fx, focusShadow, spec, accent }) {
    scene.add(world.ring({ inner: 13 }));
    const stageFloor = new THREE.Mesh(new THREE.CircleGeometry(5.6, 48), world.material(world.data.platform[0]));
    stageFloor.rotation.x = -Math.PI / 2;
    stageFloor.position.set(0, 0.02, 2.4);
    stageFloor.receiveShadow = true;
    world.dress(stageFloor);
    scene.add(stageFloor);

    const { group: body, board } = harmoniumBody(world);
    scene.add(body);
    const textures = COLOURS.map((_, column) => keyTexture(column));
    const keys = new Pool(board, (item) => makeKey(item.column, world, textures[item.column]));

    // Name plates along the line: each column says which limb plays it, and lights when it does.
    const plates = COLUMN_X.map((x, column) => {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.86), new THREE.MeshBasicMaterial({ map: plateTexture(column), fog: false, toneMapped: false }));
      plate.material.color.setScalar(arrowGlow(spec));
      plate.position.set(x, -0.5, 0.06);
      plate.userData.keepMaterial = true;
      board.add(plate);
      return plate;
    });
    const line = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.12, 0.1), new THREE.MeshBasicMaterial({ color: "#fff4d6", fog: false, toneMapped: false }));
    line.material.color.multiplyScalar(arrowGlow(spec));
    line.position.set(0, 0, 0.1);
    line.userData.keepMaterial = true;
    board.add(line);

    // A string from each plate to the limb that plays it, in that column's colour.
    const strings = COLUMN_X.map((_, column) => {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 6), new THREE.MeshBasicMaterial({ color: COLOURS[column], fog: false, toneMapped: false }));
      cord.userData.keepMaterial = true;
      scene.add(cord);
      return cord;
    });
    const cuffs = LIMB_BONE.map((name, column) => {
      const cuff = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), new THREE.MeshBasicMaterial({ color: COLOURS[column], fog: false, toneMapped: false }));
      cuff.userData.keepMaterial = true;
      scene.add(cuff);
      return cuff;
    });

    const grades = Object.fromEntries([["perfect", "PERFECT", "#fff1a8"], ["good", "GOOD", "#ffffff"], ["miss", "MISS", "#ff5a5a"]].map(([grade, text, colour]) => {
      const card = wordCard(text, colour);
      card.scale.set(1.8, 0.9, 1);
      card.visible = false;
      scene.add(card);
      return [grade, { card, life: 0 }];
    }));

    hero.root.rotation.y = Math.PI;
    hero.root.position.set(0, 0, 2.5);
    hero.play("Idle_Loop");
    const raise = [0, 0, 0, 0];
    let playing = false;
    const up = new THREE.Vector3(0, 1, 0);
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const anchor = new THREE.Vector3();

    return {
      update(state, dt) {
        if (state.status === "playing" && state.t > 0) {
          if (!playing) startBeat(state.bpm, { soft: true });
          playing = true;
          syncBeat(state.t);
        } else if (playing) {
          playing = false;
          stopBeat();
        }
        keys.sync(state.keys, (object, key) => {
          const p = 1 - (key.at - state.t) / state.travelMs;
          object.position.set(COLUMN_X[key.column], KEY_DEPTH / 2 + BOARD_LENGTH * (1 - p), 0.02);
        });

        // Limbs are posed on top of the idle clip, because nothing in the library lifts one leg.
        for (let column = 0; column < 4; column += 1) raise[column] = damp(raise[column], state.pressed[column] > 0 ? 1 : 0, state.pressed[column] > 0 ? 26 : 9, dt);
        for (const [column, side, out] of [[1, "l", -1], [2, "r", 1]]) {
          aimBone(hero.bones.get(`upperarm_${side}`), new THREE.Vector3(out * 0.25, 1, -0.1), raise[column]);
          aimBone(hero.bones.get(`lowerarm_${side}`), new THREE.Vector3(out * 0.12, 1, -0.05), raise[column]);
        }
        for (const [column, side, out] of [[0, "l", -1], [3, "r", 1]]) {
          aimBone(hero.bones.get(`thigh_${side}`), new THREE.Vector3(out * 0.25, -0.35, -0.9), raise[column]);
          aimBone(hero.bones.get(`calf_${side}`), new THREE.Vector3(out * 0.1, -1, 0.1), raise[column]);
        }

        hero.root.updateMatrixWorld(true);
        for (const [column, name] of LIMB_BONE.entries()) {
          hero.bones.get(name).getWorldPosition(to);
          cuffs[column].position.copy(to);
          plates[column].getWorldPosition(from);
          from.y -= 0.4;
          anchor.copy(to).sub(from);
          const cord = strings[column];
          cord.position.copy(from).addScaledVector(anchor, 0.5);
          cord.scale.set(1 + raise[column] * 1.4, anchor.length(), 1 + raise[column] * 1.4);
          cord.quaternion.setFromUnitVectors(up, anchor.normalize());
          const lit = 1 + raise[column] * 0.08;
          plates[column].scale.set(lit, lit, 1);
        }

        for (const entry of Object.values(grades)) {
          entry.life -= dt;
          entry.card.visible = entry.life > 0;
          entry.card.position.y += dt * 0.7;
          entry.card.material.opacity = Math.min(1, entry.life * 3);
        }
        camera.position.set(0, 3, 8.6);
        camera.lookAt(0, 2.35, -3);
        focusShadow(0, 0, -2);
      },
      event(event) {
        const landed = event.type === "perfect" || event.type === "good";
        if (landed) playReed(event.pitch);
        if (landed || event.type === "miss") {
          const entry = grades[event.type];
          entry.life = 0.6;
          entry.card.position.set(COLUMN_X[event.column], LINE.y + 1.2, LINE.z + 0.9);
        }
        if (landed) fx.burst({ x: COLUMN_X[event.column], y: LINE.y + 0.2, z: LINE.z + 0.6 }, COLOURS[event.column], event.type === "perfect" ? 30 : 14);
        if (event.type === "end") {
          stopBeat();
          hero.play("Yes", { once: true });
        }
      },
    };
  },
};
