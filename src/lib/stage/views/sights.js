// Twin Sights: ghouls walk up the road out of the distance, a circle on each hand, then a boss. The
// ghouls are our own rigged bodies, greyed and dressed in rags, each kind with its own walk and eyes.
import * as THREE from "three";
import { BOSSES } from "../../templates/bosses.js";
import { CAMERA, CLOSE_IN, FAR_Z, JUMP_MS, KINDS, LINE_Z, SIGHT_RADIUS, marksOf, partSpot, volleySpot } from "../../templates/sights.js";
import { createCharacter } from "../character.js";
import { bossPreview, makeBossFigure, makeTelegraph } from "./blades.js";
import { HAND_COLOURS, arcRing, armReach, bannerCard, fieldOf, glowMaterial } from "./cursors.js";
import { damp, holdOnBone } from "./shared.js";

const AIM_Z = -4; // the depth the hero's arms point at
const MISSILE_Z = -2;
const HERO_Z = 1.2;
const BOSS_Z = -4.6;
const PIN_Z = BOSS_Z; // the heads sit beside his own, in the plane of his body
// Further back than the sword games stand, so a whole boss fits below the top of a hand's reach.
const BOSS_SHOTS = {
  ravana: { eye: [0, 2.7, 9.6], look: [0, 4.1, BOSS_Z], drop: 0.42 }, // a head hangs from its neck, so it is pinned lower down
  kumbhakarna: { eye: [0, 2.6, 8.4], look: [0, 3.6, BOSS_Z], drop: 0 },
  serpent: { eye: [0, 2.6, 8.8], look: [0, 3.4, BOSS_Z], drop: 0 },
};
const WAVE_EYE = [0, CAMERA.y, CAMERA.z];
const WAVE_LOOK = [0, CAMERA.y - Math.sin(CAMERA.pitch) * 20, CAMERA.z - Math.cos(CAMERA.pitch) * 20];

// Three kinds that read apart at a glance: by walk, by size, by the colour of their rags and of their
// eyes. stride is how far the walk clip goes in a second at its own speed, in metres, so the feet keep
// to the road. An outfit body is repainted over its own texture, which stays on as light and shade.
const GHOULS = {
  shambler: {
    count: 6, walk: "Zombie_Walk_Fwd_Loop", stride: 0.92, eyes: "#c6ff3a", ichor: "#9dff5a",
    look: { body: "peasant-male", hair: "simple-parted", skinTone: "#9cb487", hairColour: "#55553f" },
    paint: { skin: "#9cb487", top: "#c0703a", bottom: "#625c4c", shoes: "#3a3128" },
  },
  runner: {
    count: 3, walk: "Jog_Fwd_Loop", stride: 2.5, eyes: "#ffb12e", ichor: "#ffd34a",
    look: { body: "athlete-female", hair: "long", skinTone: "#a9c4b6", hairColour: "#262b22", top: "#2aa198", bottom: "#3b3550", shoes: "#24242a" },
  },
  brute: {
    count: 2, walk: "Zombie_Walk_Fwd_Loop", stride: 0.92, eyes: "#ff3b3b", ichor: "#ff7a4a", plates: true,
    look: { body: "ranger-male", hair: "buzzed", skinTone: "#9d8db8", hairColour: "#26202c" },
    paint: { skin: "#9d8db8", top: "#6a3f8a", bottom: "#3c3a46", shoes: "#2a2226", trim: "#8a6a4a" },
  },
};
const DEATH_SPEED = 1.3;
const DRUM_RADIUS = 0.55;
const ROLL_FROM = -30;
const SINK_AFTER = 1.5;
const GONE_AFTER = 3.1;

function pistol(world) {
  const group = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.24), world.material("#22242c", { metalness: 0.6, roughness: 0.4 }));
  slide.position.set(0, 0.06, 0.09);
  group.add(slide, new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.11, 0.05), world.material("#7a4a26")));
  return world.dress(group);
}

// An oil drum on its side, rolled down the middle of the road. Its stripes turn, so it reads as rolling.
function drum(world) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(DRUM_RADIUS, DRUM_RADIUS, 1.5, 20), world.material("#c23b22", { metalness: 0.35, roughness: 0.5 }));
  body.rotation.z = Math.PI / 2;
  group.add(body);
  for (const at of [-0.62, -0.2, 0.2, 0.62]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(DRUM_RADIUS + 0.015, 0.035, 6, 24), world.material(Math.abs(at) > 0.5 ? "#2a2a2e" : "#ffd23f", { metalness: 0.5, roughness: 0.4 }));
    hoop.rotation.y = Math.PI / 2;
    hoop.position.x = at;
    group.add(hoop);
  }
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.14, DRUM_RADIUS * 2.02), world.material("#ffd23f"));
  group.add(band);
  return world.dress(group);
}

function sightTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const pen = canvas.getContext("2d");
  pen.translate(128, 128);
  // Drawn twice, dark then white: the white takes the hand's colour and the dark edge keeps it off a bright sky.
  for (const [ink, grow] of [["#0a0a12", 4], ["#ffffff", 0]]) {
    pen.strokeStyle = ink;
    pen.fillStyle = ink;
    pen.lineWidth = 11 + grow * 2;
    pen.beginPath();
    pen.arc(0, 0, 116, 0, Math.PI * 2);
    pen.stroke();
    pen.beginPath();
    pen.arc(0, 0, 9 + grow, 0, Math.PI * 2);
    pen.fill();
    for (let i = 0; i < 4; i += 1) {
      pen.rotate(Math.PI / 2);
      pen.fillRect(-5 - grow, -116, 10 + grow * 2, 40 + grow);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Paints one part of an outfit a flat colour, keeping its texture only as light and shade, the way the
// plain bodies are dressed. The painted bodies take their colours at birth and are left alone.
function repaint(mesh, colour) {
  const material = mesh.material.clone();
  const uniforms = { uPaint: { value: new THREE.Color(colour) } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uPaint;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = uPaint * (0.55 + dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)) * 0.9);")
      .replace("#include <emissivemap_fragment>", "totalEmissiveRadiance = diffuseColor.rgb * emissive.r;");
  };
  material.customProgramCacheKey = () => "taksh-ghoul";
  mesh.material = material;
}

const PARTS = [[/Regular/, "skin"], [/Acc|Bracer|Belt|Pauldron/, "trim"], [/Arms|Body/, "top"], [/Legs/, "bottom"], [/Feet|Boots/, "shoes"]];

function sicken(root, paint) {
  root.traverse((node) => {
    if (!node.isMesh || node.material.customProgramCacheKey?.() === "taksh-dress" || /^(Eyes|Eyebrows|Hair)/.test(node.name)) return;
    const [, part] = PARTS.find(([test]) => test.test(node.material.name + " " + node.name)) ?? [];
    if (part) repaint(node, paint[part] ?? paint.top);
  });
}

// Eyes that glow, so a ghoul still reads in the dark worlds and through the heavier styles.
function glowingEyes(root, colour) {
  root.traverse((node) => {
    if (!node.isMesh || node.name !== "Eyes") return;
    node.material = new THREE.MeshBasicMaterial({ color: colour, toneMapped: false });
    node.userData.keepMaterial = true;
  });
}

// Scrap iron strapped over a brute's chest and shoulders. It is knocked off by the first hit.
function scrapPlates(character, world) {
  const iron = world.material("#6d4a30", { metalness: 0.55, roughness: 0.6 });
  const rivet = world.material("#c9a86a", { metalness: 0.7, roughness: 0.35 });
  const plates = [];
  const plate = (bone, size, offset, tilt = [0, 0, 0]) => {
    const group = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(...size), iron);
    group.add(slab);
    for (const side of [-1, 1]) {
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), rivet);
      stud.position.set(side * size[0] * 0.36, size[1] * 0.3, size[2] / 2);
      group.add(stud);
    }
    group.rotation.set(...tilt);
    world.dress(group);
    holdOnBone(character.bones.get(bone), group, offset);
    plates.push(group);
  };
  plate("spine_03", [0.34, 0.3, 0.05], [0, 0.08, 0.15]);
  plate("clavicle_l", [0.16, 0.05, 0.2], [0.12, 0.06, 0], [0, 0, 0.3]);
  plate("clavicle_r", [0.16, 0.05, 0.2], [-0.12, 0.06, 0], [0, 0, -0.3]);
  return plates;
}

async function makeGhoul(kind, world) {
  const info = GHOULS[kind];
  const character = await createCharacter(info.look);
  if (info.paint) sicken(character.root, info.paint);
  glowingEyes(character.root, info.eyes);
  const plates = info.plates ? scrapPlates(character, world) : [];
  world.dress(character.root);
  character.root.scale.setScalar(KINDS[kind].size);
  character.root.visible = false;
  return { character, kind, plates, id: null, doing: null, dyingMs: -1, yaw: 0 };
}

// A sight is a fixed picture on the lens, and the lock on a target is drawn round the target.
function sightMark(camera, colour) {
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: sightTexture(), color: colour, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  mark.userData.keepMaterial = true;
  mark.renderOrder = 14;
  mark.visible = false;
  camera.add(mark);
  return mark;
}

function tracer() {
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), new THREE.MeshBasicMaterial({ color: "#fff2a8", transparent: true, opacity: 0, fog: false, toneMapped: false }));
  line.userData.keepMaterial = true;
  return line;
}

export const sights = {
  async build({ scene, camera, world, hero, fx, focusShadow, spec }) {
    const road = world.road(11);
    const side = world.strip();
    side.scroll(0);
    scene.add(road.mesh, side.group, camera);

    for (const bone of ["hand_r", "hand_l"]) holdOnBone(hero.bones.get(bone), pistol(world));
    hero.root.rotation.y = Math.PI;
    hero.root.position.set(0, 0, HERO_Z);
    hero.play("Pistol_Idle_Loop");

    const field = fieldOf(camera);
    const reach = armReach(hero);
    const banner = bannerCard(camera, field);
    const marks = { left: sightMark(camera, HAND_COLOURS.left), right: sightMark(camera, HAND_COLOURS.right) };

    // Every body is made up front and reused, since a skinned body is too dear to make mid-game.
    const ghouls = (await Promise.all(Object.entries(GHOULS).flatMap(([kind, { count }]) => Array.from({ length: count }, () => makeGhoul(kind, world))))).map((ghoul) => {
      scene.add(ghoul.character.root);
      return ghoul;
    });
    const byId = new Map();
    const free = (kind) => ghouls.find((ghoul) => ghoul.kind === kind && ghoul.id === null && ghoul.dyingMs < 0)
      ?? ghouls.filter((ghoul) => ghoul.kind === kind && ghoul.dyingMs >= 0).sort((a, b) => b.dyingMs - a.dyingMs)[0];

    const fall = (id) => {
      const ghoul = byId.get(id);
      if (!ghoul) return null;
      byId.delete(id);
      ghoul.id = null;
      ghoul.dyingMs = 0;
      ghoul.character.play("Death01", { once: true, speed: DEATH_SPEED, fade: 0.08 });
      return ghoul;
    };

    // One ring for each target: it shows what can be shot, and closes as the lock builds.
    const locks = Array.from({ length: 12 }, () => {
      const track = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 40), glowMaterial("#ffffff", { opacity: 0.55 }));
      track.userData.keepMaterial = true;
      track.renderOrder = 11;
      const arc = arcRing("#ffe27a", 0.22);
      const group = new THREE.Group();
      group.add(track, arc);
      group.visible = false;
      camera.add(group);
      return { group, arc };
    });

    const rolling = new Map();
    const barrels = [drum(world), drum(world)];
    for (const barrel of barrels) {
      barrel.visible = false;
      scene.add(barrel);
    }
    const shot = tracer();
    scene.add(shot);
    let shotLife = 0;

    const number = spec.tuning.boss;
    const { id: bossId } = BOSSES[number - 1];
    const pin = (part, out) => {
      const { x, y } = partSpot({ id: bossId }, part);
      field.atDepth(x, y, PIN_Z, out).y -= BOSS_SHOTS[bossId].drop;
      return out;
    };
    const figure = await makeBossFigure(number, { scene, world, boss: bossPreview(number), hero, fx, z: BOSS_Z, pin });
    const telegraph = makeTelegraph({ scene, target: { word: "JUMP" } });
    const missile = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshBasicMaterial({ color: "#ff8a1f", fog: false, toneMapped: false }));
    missile.userData.keepMaterial = true;
    missile.visible = false;
    scene.add(missile);

    let bossShot = 0;
    let bossShown = false;
    const up = new THREE.Vector3(0, 1, 0);
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const spot = new THREE.Vector3();
    const eye = new THREE.Vector3();
    const look = new THREE.Vector3();
    const telegraphAt = new THREE.Vector3(0, 2.9, HERO_Z);
    // Where a shot lands: on the ghoul's own chest when there is one, or on the field.
    const chestOf = (id, x, y, out) => {
      const ghoul = byId.get(id);
      if (ghoul) return ghoul.character.bones.get("spine_03").getWorldPosition(out);
      return field.atDepth(x, y, AIM_Z, out);
    };
    const fireTracer = (sideName, target) => {
      hero.bones.get(sideName === "left" ? "hand_l" : "hand_r").getWorldPosition(from);
      to.copy(target).sub(from);
      shot.position.copy(from).addScaledVector(to, 0.5);
      shot.scale.set(1, to.length(), 1);
      shot.quaternion.setFromUnitVectors(up, to.normalize());
      shotLife = 1;
    };

    const walkGhouls = (state, dt) => {
      // A ghoul gone from the game without word of it, as when a game is cut short, falls all the same.
      const alive = new Set(state.enemies.map((enemy) => enemy.id));
      for (const id of [...byId.keys()]) if (!alive.has(id)) fall(id);
      for (const enemy of state.enemies) {
        let ghoul = byId.get(enemy.id);
        if (!ghoul) {
          ghoul = free(enemy.kind);
          if (!ghoul) continue;
          for (const [id, held] of byId) if (held === ghoul) byId.delete(id);
          Object.assign(ghoul, { id: enemy.id, doing: null, dyingMs: -1 });
          for (const plate of ghoul.plates) plate.visible = true;
          byId.set(enemy.id, ghoul);
        }
        const { root } = ghoul.character;
        root.visible = true;
        field.onFloor(enemy.feetX, enemy.feetY, 0, root.position);
        // Hit, clawing or walking, each with its own clip. A walk is sped to the ghoul's own pace.
        const doing = enemy.staggerMs > 0 ? "hit" : enemy.z >= LINE_Z ? "claw" : "walk";
        if (doing !== ghoul.doing) {
          ghoul.doing = doing;
          const info = GHOULS[enemy.kind];
          if (doing === "hit") ghoul.character.play("Hit_Knockback", { once: true, speed: 1.3, fade: 0.06 });
          if (doing === "claw") ghoul.character.play("Zombie_Scratch", { once: true, speed: 1.5, fade: 0.12 });
          if (doing === "walk") {
            const walk = ghoul.character.play(info.walk, { speed: enemy.speed / (info.stride * KINDS[enemy.kind].size), fade: 0.2 });
            walk.time = Math.random() * walk.getClip().duration; // or a crowd walks in step
          }
        }
        const heading = doing === "claw" ? Math.atan2(-root.position.x, HERO_Z - root.position.z) : Math.atan2(-enemy.farLane * (1 - CLOSE_IN), LINE_Z - FAR_Z);
        ghoul.yaw = damp(ghoul.yaw, heading, 8, dt);
        root.rotation.y = ghoul.yaw;
      }
      for (const ghoul of ghouls) {
        if (ghoul.dyingMs >= 0) {
          ghoul.dyingMs += dt;
          const { root } = ghoul.character;
          if (ghoul.dyingMs > SINK_AFTER) root.position.y -= dt * 1.1;
          if (ghoul.dyingMs > GONE_AFTER) {
            ghoul.dyingMs = -1;
            root.visible = false;
          }
        }
        if (ghoul.character.root.visible) ghoul.character.update(dt);
      }
    };

    return {
      update(state, dt, elapsed) {
        bossShot += ((state.boss ? 1 : 0) - bossShot) * (1 - Math.exp(-1.8 * dt));
        eye.set(...WAVE_EYE).lerp(from.set(...BOSS_SHOTS[bossId].eye), bossShot);
        look.set(...WAVE_LOOK).lerp(to.set(...BOSS_SHOTS[bossId].look), bossShot);
        camera.position.copy(eye);
        camera.lookAt(look);
        camera.updateMatrixWorld();

        walkGhouls(state, dt);

        for (const [sideName, mark] of Object.entries(marks)) {
          const cursor = state.cursors[sideName];
          mark.visible = cursor.live;
          if (cursor.live) field.onLens(mark, cursor.x, cursor.y, SIGHT_RADIUS);
        }
        const targets = marksOf(state);
        for (const [index, lock] of locks.entries()) {
          const target = targets[index];
          lock.group.visible = Boolean(target);
          if (!target) continue;
          field.onLens(lock.group, target.x, target.y, target.radius * 1.3);
          lock.arc.fill(target.lock);
        }
        reach(state.cursors, dt, (cursor, out) => field.atDepth(cursor.x, cursor.y, AIM_Z, out));

        const live = new Set(state.rolls.map((roll) => roll.id));
        for (const [id, barrel] of rolling) {
          if (live.has(id)) continue;
          barrel.visible = false;
          rolling.delete(id);
        }
        for (const roll of state.rolls) {
          let barrel = rolling.get(roll.id);
          if (!barrel) {
            barrel = barrels.find((item) => !item.visible);
            if (!barrel) continue;
            barrel.visible = true;
            rolling.set(roll.id, barrel);
          }
          const p = roll.ms / roll.arriveMs;
          barrel.position.set(0, DRUM_RADIUS, ROLL_FROM + (HERO_Z - ROLL_FROM) * p);
          barrel.rotation.x = (barrel.position.z - ROLL_FROM) / DRUM_RADIUS; // rolled, not slid
        }

        const near = state.rolls.find((roll) => roll.arriveMs - roll.ms < 1500);
        telegraphAt.y = 3.7 - 0.8 * bossShot; // up in the sky, clear of the ghouls coming out of the distance
        telegraph.update(state.boss?.attack ?? (near ? { answer: "defend", ms: near.ms - (near.arriveMs - 1500), warnMs: 1500 } : null), telegraphAt);

        hero.root.position.y = state.jumpMs > 0 ? Math.sin(Math.PI * (1 - state.jumpMs / JUMP_MS)) * 1.3 : 0;
        hero.root.visible = !(state.invincibleMs > 0 && Math.sin(elapsed * 34) < -0.2);
        shotLife = Math.max(0, shotLife - dt * 9);
        shot.material.opacity = shotLife;

        if (state.boss) {
          if (!bossShown) {
            bossShown = true;
            figure.root.visible = true;
            for (const extra of figure.extras) extra.visible = true;
          }
          figure.update(state.boss, dt, elapsed);
          const volley = state.boss.attack?.answer === "strike";
          missile.visible = volley;
          if (volley) {
            const { x, y } = volleySpot(state.boss);
            field.atDepth(x, y, MISSILE_Z, missile.position);
            missile.scale.setScalar(field.size(0.12, camera.position.z - MISSILE_Z) / 0.42);
            missile.rotation.y = elapsed * 5;
          }
        }
        banner.update(dt);
        focusShadow(0, 0, -3);
      },
      event(event, state) {
        if (event.type === "shot") {
          fireTracer(event.side, event.id === null ? field.atDepth(event.x, event.y, state.boss ? PIN_Z : AIM_Z, spot) : chestOf(event.id, event.x, event.y, spot));
          hero.play("Pistol_Shoot", { once: true, speed: 2.4, fade: 0.05, then: "Pistol_Idle_Loop" });
        }
        if (event.type === "hit") {
          const ghoul = byId.get(event.id);
          fx.burst(chestOf(event.id, event.x, event.y, spot), GHOULS[event.kind].ichor, 16);
          for (const plate of ghoul?.plates ?? []) {
            if (plate.visible) fx.burst(plate.getWorldPosition(spot), "#a0704a", 10);
            plate.visible = false;
          }
        }
        if (event.type === "downed" || event.type === "claw") {
          fx.burst(chestOf(event.id, event.x, event.y, spot), GHOULS[event.kind].ichor, event.type === "downed" ? 30 : 12);
          fall(event.id);
        }
        if (event.type === "grenade") {
          hero.play("OverhandThrow", { once: true, speed: 1.6, fade: 0.05, then: "Pistol_Idle_Loop" });
          fx.flash("#fff2c4", 0.6);
          fx.shake(0.6);
          for (const { id, x, y } of event.hit) {
            fx.burst(chestOf(id, x, y, spot), "#ffb02e", 36);
            fall(id);
          }
        }
        if (event.type === "empty") fx.flash("#808080", 0.08);
        if (event.type === "jump") hero.play("Jump_Start", { once: true, speed: 2, fade: 0.06, then: "Pistol_Idle_Loop" });
        if (event.type === "wave") banner.say(`Wave ${event.wave}`);
        if (event.type === "hurt") {
          fx.shake(0.55);
          fx.flash("#ff3b4e", 0.34);
          hero.play("Hit_Chest", { once: true, speed: 1.4, fade: 0.05, then: "Pistol_Idle_Loop" });
        }
        if (event.type === "boss_enter") {
          fx.flash("#ffffff", 0.3);
          banner.say(state.boss.name, 2);
        }
        if (event.type === "boss_blocked" || event.type === "boss_parry") fx.burst({ x: 0, y: 1.6, z: 0.6 }, "#a8e8ff", 40);
        if (event.type === "boss_hit") fx.burst(pin(state.boss.parts[event.part], spot), "#ffd86b", 18);
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
