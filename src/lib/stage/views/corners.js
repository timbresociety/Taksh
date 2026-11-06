// Four Corners: the screen is cut in four, and every limb fires into its own corner.
import * as THREE from "three";
import { JUMP_MS } from "../../templates/corners.js";
import { makeBossFigure, bossPreview, fighterCrew, makeTelegraph } from "./blades.js";
import { drawLimb } from "./harmonium.js";
import { damp, holdOnBone } from "./shared.js";

const QUADRANTS = ["tl", "tr", "bl", "br"];
const LIMBS = { bl: 0, tl: 1, tr: 2, br: 3 }; // the columns drawLimb knows: left foot, left hand, right hand, right foot
const NAMES = { tl: "LEFT HAND", tr: "RIGHT HAND", bl: "LEFT FOOT", br: "RIGHT FOOT" };
const COLOURS = { tl: "#17b6a7", tr: "#e8407f", bl: "#ff7a1a", br: "#7a5cff" };
const ROOST = { tl: [-4.6, 4.5, -6], tr: [4.6, 4.5, -6], bl: [-4.2, 0, -5], br: [4.2, 0, -5] };
const FIGHTERS = 4;

function pistol(world) {
  const group = new THREE.Group();
  const dark = world.material("#22242c", { metalness: 0.6, roughness: 0.4 });
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.24), dark);
  slide.position.set(0, 0.06, 0.09);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.11, 0.05), world.material("#7a4a26"));
  group.add(slide, grip);
  return world.dress(group);
}

// A timber lookout, so the top two corners have someone in them in every world.
function tower(world, x, z, height) {
  const group = new THREE.Group();
  const wood = world.material("#6b4526", { roughness: 0.9 });
  for (const [dx, dz] of [[-0.9, -0.7], [0.9, -0.7], [-0.9, 0.7], [0.9, 0.7]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, height, 0.2), wood);
    leg.position.set(dx, height / 2, dz);
    group.add(leg);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 1.9), wood);
  deck.position.y = height;
  group.add(deck);
  for (const y of [height * 0.35, height * 0.72]) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 0.08), wood);
    brace.position.set(0, y, 0.72);
    group.add(brace);
  }
  group.position.set(x, 0, z);
  return world.dress(group);
}

function badgeTexture(quadrant) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const pen = canvas.getContext("2d");
  pen.fillStyle = "rgba(16, 12, 10, 0.72)";
  pen.beginPath();
  pen.roundRect(6, 6, 244, 244, 26);
  pen.fill();
  pen.lineWidth = 8;
  pen.strokeStyle = COLOURS[quadrant];
  pen.stroke();
  pen.fillStyle = "#fff8e6";
  drawLimb(pen, LIMBS[quadrant], 82, 128, 104);
  pen.font = "800 30px system-ui, sans-serif";
  pen.textAlign = "center";
  pen.fillText(NAMES[quadrant], 128, 218);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function reticleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const pen = canvas.getContext("2d");
  pen.translate(128, 128);
  pen.strokeStyle = "#ffffff";
  pen.lineWidth = 14;
  pen.beginPath();
  pen.arc(0, 0, 96, 0, Math.PI * 2);
  pen.stroke();
  for (let i = 0; i < 4; i += 1) {
    pen.rotate(Math.PI / 2);
    pen.fillStyle = "#ffffff";
    pen.fillRect(-7, -124, 14, 54);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The four quadrants are drawn on the camera, so they stay put whatever the world does behind them.
function makeOverlay(camera) {
  const group = new THREE.Group();
  group.position.z = -1;
  camera.add(group);
  const flat = (geometry, colour, opacity, order) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    mesh.userData.keepMaterial = true;
    mesh.renderOrder = order;
    group.add(mesh);
    return mesh;
  };
  const across = flat(new THREE.PlaneGeometry(1, 1), "#fff8e6", 0.75, 20);
  const down = flat(new THREE.PlaneGeometry(1, 1), "#fff8e6", 0.75, 20);
  const panels = Object.fromEntries(QUADRANTS.map((quadrant) => [quadrant, flat(new THREE.PlaneGeometry(1, 1), COLOURS[quadrant], 0, 19)]));
  const badges = Object.fromEntries(QUADRANTS.map((quadrant) => {
    const badge = flat(new THREE.PlaneGeometry(1, 1), "#ffffff", 1, 21);
    badge.material.map = badgeTexture(quadrant);
    return [quadrant, badge];
  }));

  return {
    // cross is where the four corners meet, from -1 to 1 on each axis.
    update(cross, glow) {
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const halfWidth = halfHeight * camera.aspect;
      const cx = cross.x * halfWidth;
      const cy = cross.y * halfHeight;
      across.scale.set(halfWidth * 2, 0.005, 1);
      across.position.set(0, cy, 0);
      down.scale.set(0.005, halfHeight * 2, 1);
      down.position.set(cx, 0, 0);
      for (const quadrant of QUADRANTS) {
        const sideX = quadrant[1] === "l" ? -1 : 1;
        const sideY = quadrant[0] === "t" ? 1 : -1;
        const width = halfWidth - sideX * cx;
        const height = halfHeight - sideY * cy;
        const panel = panels[quadrant];
        panel.scale.set(width, height, 1);
        panel.position.set(cx + (sideX * width) / 2, cy + (sideY * height) / 2, 0);
        panel.material.opacity = glow[quadrant] * 0.3;
        const badge = badges[quadrant];
        const size = 0.19 * (1 + glow[quadrant] * 0.12);
        badge.scale.set(size, size, 1);
        badge.position.set(sideX * (halfWidth - 0.14), sideY * halfHeight * 0.5, 0);
      }
    },
  };
}

function tracer() {
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), new THREE.MeshBasicMaterial({ color: "#fff2a8", transparent: true, opacity: 0, fog: false, toneMapped: false }));
  line.userData.keepMaterial = true;
  return line;
}

export const corners = {
  usesRival: true,
  async build({ scene, camera, world, hero, rival, fx, focusShadow, spec }) {
    const road = world.road(11);
    const side = world.strip();
    side.scroll(0);
    scene.add(road.mesh, side.group, camera);
    for (const quadrant of ["tl", "tr"]) {
      const [x, y, z] = ROOST[quadrant];
      scene.add(tower(world, x, z, y));
    }
    for (const quadrant of ["bl", "br"]) {
      const [x, , z] = ROOST[quadrant];
      const cover = world.role("low", 1.8);
      cover.position.set(x, 0, z + 0.9);
      scene.add(cover);
    }

    holdOnBone(hero.bones.get("hand_r"), pistol(world));
    hero.root.rotation.y = Math.PI;
    hero.root.position.set(0, 0, 1.2);
    hero.play("Pistol_Idle_Loop");

    const crew = await fighterCrew({ world, rival, spec, count: FIGHTERS, weapon: pistol });
    for (const { character } of crew) scene.add(character.root);
    const seats = Object.fromEntries(QUADRANTS.map((quadrant, index) => [quadrant, crew[index]]));

    const overlay = makeOverlay(camera);
    const glow = { tl: 0, tr: 0, bl: 0, br: 0 };
    const reticles = Object.fromEntries(QUADRANTS.map((quadrant) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: reticleTexture(), color: COLOURS[quadrant], transparent: true, depthTest: false, fog: false, toneMapped: false }));
      sprite.userData.keepMaterial = true;
      sprite.renderOrder = 15;
      sprite.visible = false;
      scene.add(sprite);
      return [quadrant, sprite];
    }));

    const rolling = new Map();
    const barrels = [world.role("hazard", 1.3), world.role("hazard", 1.3)];
    for (const barrel of barrels) {
      barrel.visible = false;
      scene.add(barrel);
    }
    const shot = tracer();
    scene.add(shot);
    let shotLife = 0;

    const number = spec.tuning.boss;
    const figure = await makeBossFigure(number, { scene, world, boss: bossPreview(number), hero, fx, z: -4.6 });
    const telegraph = makeTelegraph({ scene, target: { word: "JUMP" } });
    const missile = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshBasicMaterial({ color: "#ff8a1f", fog: false, toneMapped: false }));
    missile.userData.keepMaterial = true;
    missile.visible = false;
    scene.add(missile);

    let jumpLift = 0;
    let turn = 0;
    let aim = "neutral";
    let bossShot = 0;
    let bossShown = false;
    const up = new THREE.Vector3(0, 1, 0);
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const spot = new THREE.Vector3();
    const eye = new THREE.Vector3();
    const look = new THREE.Vector3();
    const cross = new THREE.Vector3();
    const flatCross = new THREE.Vector2();
    const telegraphAt = new THREE.Vector3(0, 2.9, 1.2);

    const fireTracer = (target) => {
      hero.bones.get("hand_r").getWorldPosition(from);
      to.copy(target).sub(from);
      shot.position.copy(from).addScaledVector(to, 0.5);
      shot.scale.set(1, to.length(), 1);
      shot.quaternion.setFromUnitVectors(up, to.normalize());
      shotLife = 1;
    };

    const targetOf = (quadrant, state) => {
      if (state.boss) {
        const { boss } = state;
        if (boss.attack?.answer === "strike" && boss.attack.slot === quadrant) return missile.position;
        return figure.spotOf(boss.parts[boss.open], spot);
      }
      const [x, y, z] = ROOST[quadrant];
      return spot.set(x, y + 1.2, z);
    };

    return {
      update(state, dt, elapsed) {
        for (const fighter of crew) {
          if (fighter !== crew[0]) fighter.character.update(dt);
          fighter.busyMs = Math.max(0, fighter.busyMs - dt * 1000);
        }

        for (const quadrant of QUADRANTS) {
          const enemy = state.enemies.find((item) => item.quadrant === quadrant);
          const fighter = seats[quadrant];
          const root = fighter.character.root;
          const [x, y, z] = ROOST[quadrant];
          const reticle = reticles[quadrant];
          let heat = 0;
          if (enemy) {
            if (fighter.enemyId !== enemy.id) {
              fighter.enemyId = enemy.id;
              root.visible = true;
              fighter.character.play("Pistol_Idle_Loop", { fade: 0.05 });
            }
            const rising = Math.min(1, enemy.ms / 300);
            root.position.set(x, y - (1 - rising) * 1.6, z);
            root.rotation.y = Math.atan2(-x, 1.2 - z);
            const left = 1 - enemy.ms / enemy.lifeMs;
            reticle.visible = true;
            reticle.position.set(x, y + 1.15, z + 0.3);
            reticle.scale.setScalar(1.5 + left * 1.7);
            reticle.material.opacity = 0.65 + (1 - left) * 0.35;
            heat = 0.35 + (1 - left) * 0.65;
          } else {
            reticle.visible = false;
            if (fighter.busyMs <= 0 && fighter.enemyId !== null) {
              fighter.enemyId = null;
              root.visible = false;
            }
          }
          if (state.boss) {
            const { boss } = state;
            if (boss.attack?.slot === quadrant && boss.attack.answer === "strike") heat = 1;
            else if (!boss.attack && boss.parts[boss.open].slot === quadrant && !["enter", "wake", "dive", "fallen"].includes(boss.mood)) heat = 0.6;
          }
          glow[quadrant] = damp(glow[quadrant], heat, 12, dt);
        }

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
          barrel.position.set(0, 0, -30 + 31.2 * p);
          barrel.rotation.x = p * 26;
        }

        const near = state.rolls.find((roll) => roll.arriveMs - roll.ms < 1500);
        const attack = state.boss?.attack ?? (near ? { answer: "defend", ms: near.ms - (near.arriveMs - 1500), warnMs: 1500 } : null);
        telegraph.update(attack, telegraphAt);

        jumpLift = state.jumpMs > 0 ? Math.sin(Math.PI * (1 - state.jumpMs / JUMP_MS)) * 1.3 : 0;
        hero.root.position.y = jumpLift;
        turn = damp(turn, { left: -0.5, right: 0.5, neutral: 0 }[aim], 10, dt);
        hero.root.rotation.y = Math.PI + turn;
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
          const { boss } = state;
          const volley = boss.attack?.answer === "strike" ? boss.attack : null;
          missile.visible = Boolean(volley);
          if (volley) {
            const p = volley.ms / volley.warnMs;
            figure.spotOf(boss.parts[boss.open], from);
            to.set(volley.slot[1] === "l" ? -1.6 : 1.6, volley.slot[0] === "t" ? 2.6 : 0.8, 1);
            missile.position.lerpVectors(from, to, p);
            missile.scale.setScalar(0.9 + p * 0.9);
          }
        }

        bossShot = damp(bossShot, state.boss ? 1 : 0, 1.8, dt);
        eye.set(0, 2.4, 7.4).lerp(from.set(...figure.camera.position), bossShot);
        look.set(0, 2.9, -5).lerp(to.set(...figure.camera.look), bossShot);
        camera.position.copy(eye);
        camera.lookAt(look);
        camera.updateMatrixWorld();

        // The corners meet at the middle of the screen, and at the middle of a boss once one is here.
        cross.copy(figure.centre).project(camera);
        flatCross.set(cross.x * bossShot, cross.y * bossShot);
        overlay.update(flatCross, glow);
        focusShadow(0, 0, -3);
      },
      event(event, state) {
        if (event.type === "shot") {
          const quadrant = event.quadrant;
          aim = quadrant[1] === "l" ? "left" : "right";
          hero.play(quadrant[0] === "t" ? "Pistol_Aim_Up" : "Pistol_Aim_Down", { once: true, speed: 2.2, fade: 0.05, then: "Pistol_Idle_Loop" });
          fireTracer(targetOf(quadrant, state));
          glow[quadrant] = 1;
          setTimeout(() => {
            aim = "neutral";
          }, 260);
        }
        if (event.type === "hit" || event.type === "grenade") {
          const list = event.type === "hit" ? [event.quadrant] : event.hit;
          for (const quadrant of list) {
            const fighter = seats[quadrant];
            fighter.busyMs = 900;
            fighter.character.play("Death01", { once: true, speed: 1.7, fade: 0.05 });
            const [x, y, z] = ROOST[quadrant];
            fx.burst({ x, y: y + 1.1, z }, "#ffd86b", 28);
          }
        }
        if (event.type === "grenade") {
          hero.play("OverhandThrow", { once: true, speed: 1.6, fade: 0.05, then: "Pistol_Idle_Loop" });
          fx.flash("#fff2c4", 0.6);
          fx.shake(0.6);
          for (const [x, y, z] of Object.values(ROOST)) fx.burst({ x, y: y + 1, z }, "#ffb02e", 40);
        }
        if (event.type === "empty") fx.flash("#808080", 0.08);
        if (event.type === "jump") hero.play("Jump_Start", { once: true, speed: 2, fade: 0.06, then: "Pistol_Idle_Loop" });
        if (event.type === "fire") {
          const [x, y, z] = ROOST[event.quadrant];
          seats[event.quadrant].busyMs = 500;
          seats[event.quadrant].character.play("Pistol_Shoot", { once: true, speed: 1.6, fade: 0.05 });
          fx.burst({ x, y: y + 1.3, z: z + 0.4 }, "#ff5a3a", 16);
        }
        if (event.type === "hurt") {
          fx.shake(0.55);
          fx.flash("#ff3b4e", 0.34);
          hero.play("Hit_Chest", { once: true, speed: 1.4, fade: 0.05, then: "Pistol_Idle_Loop" });
        }
        if (event.type === "boss_enter") fx.flash("#ffffff", 0.3);
        if (event.type === "boss_hit") {
          figure.spotOf(state.boss.parts[event.part], spot);
          fx.burst(spot, "#ffd86b", 18);
        }
        if (event.type === "boss_blocked" || event.type === "boss_parry") fx.burst({ x: 0, y: 1.6, z: 0.6 }, "#a8e8ff", 40);
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
