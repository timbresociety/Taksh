// Rangoli Breaker: the courtyard from above, a rangoli of powder tiles laid on it, and a brass tray for
// each hand. The camera is high and steep, so a tile on the floor stays round where the game says it is.
import * as THREE from "three";
import { BALL_RADIUS, CENTRE, ROOF_Y, TRAY_Y, WALL_X, patternOf, traysOf } from "../../templates/rangoli.js";
import { HAND_COLOURS, armReach, bannerCard, fieldOf } from "./cursors.js";
import { Pool, damp } from "./shared.js";

const POWDER = ["#ff2f7e", "#ffb21f", "#22c7a9", "#7a4dff", "#ff6a2b", "#2f8bff"];
const EYE = [0, 15.5, 5.2];
const LOOK_AT = [0, 0, -0.6];
const TILE_HEIGHT = 0.14;
const BALL_LIFT = 0.42;
const COURT_BOTTOM = -0.98;
const MARIGOLD = "#ff9a1f";

function flower(world, colour, centre) {
  const group = new THREE.Group();
  const petal = new THREE.SphereGeometry(0.36, 10, 8);
  for (let i = 0; i < 7; i += 1) {
    const mesh = new THREE.Mesh(petal, world.material(colour, { roughness: 0.85 }));
    const turn = (i / 7) * Math.PI * 2;
    mesh.position.set(Math.cos(turn) * 0.56, 0, Math.sin(turn) * 0.56);
    group.add(mesh);
  }
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), world.material(centre, { roughness: 0.7 }));
  heart.position.y = 0.16;
  group.add(heart);
  return group;
}

// A tile is a mound of powder in a chalk ring, modelled at a radius of one. Its sides show which ring it is in.
function tileModel(tile, world) {
  const group = new THREE.Group();
  const sides = [24, 6, 8, 5, 12, 6][tile.tone % 6];
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1, 1, sides), world.material(POWDER[tile.tone % POWDER.length], { roughness: 0.9 }));
  const chalk = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.3, sides), world.material("#fff8ea", { roughness: 1 }));
  chalk.position.y = -0.34;
  group.add(body, chalk);
  if (tile.marigold) {
    const bloom = flower(world, MARIGOLD, "#ffe066");
    bloom.position.y = 0.72;
    bloom.scale.setScalar(1.05);
    group.add(bloom);
  }
  if (tile.maxHp > 1) {
    const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.5, 6), world.material("#fff2c4", { metalness: 0.5, roughness: 0.3 }));
    stud.position.y = 0.66;
    group.add(stud);
    group.userData.stud = stud;
  }
  return world.dress(group);
}

function trayModel(world) {
  const group = new THREE.Group();
  const brass = world.material("#e2a93a", { metalness: 0.7, roughness: 0.3 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 0.42), brass);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.4, 0.12), world.material("#fff0b8", { metalness: 0.6, roughness: 0.3 }));
  lip.position.set(0, 0.1, -0.24);
  group.add(bar, lip);
  return world.dress(group);
}

// The floor of the court is the same four corners as the game's walls, wherever the camera puts them.
function courtFloor(field, world, colour) {
  const corners = [[-WALL_X, ROOF_Y], [WALL_X, ROOF_Y], [-WALL_X, COURT_BOTTOM], [WALL_X, COURT_BOTTOM]].map(([x, y]) => field.onFloor(x, y, 0.03, new THREE.Vector3()));
  const geometry = new THREE.BufferGeometry().setFromPoints(corners);
  geometry.setIndex([0, 2, 1, 1, 2, 3]);
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), 2));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, world.material(colour, { roughness: 0.95 }));
  mesh.userData.flat = true;
  return { mesh: world.dress(mesh), corners };
}

// Marigolds strung along the court's edge, so the walls the ball bounces off can be seen.
function garlandLine(from, to, world) {
  const group = new THREE.Group();
  const length = from.distanceTo(to);
  const count = Math.round(length / 0.62);
  const tones = [world.material(MARIGOLD, { roughness: 0.85 }), world.material("#ffd23f", { roughness: 0.85 })];
  const bead = new THREE.SphereGeometry(0.3, 10, 8);
  for (let i = 0; i <= count; i += 1) {
    const mesh = new THREE.Mesh(bead, tones[i % 2]);
    mesh.position.lerpVectors(from, to, i / count);
    mesh.position.y = 0.26;
    group.add(mesh);
  }
  return world.dress(group);
}

export const rangoli = {
  async build({ scene, camera, world, hero, fx, focusShadow }) {
    camera.position.set(...EYE);
    camera.lookAt(...LOOK_AT);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    scene.add(camera, world.ring({ inner: 15 }));
    const field = fieldOf(camera);
    const banner = bannerCard(camera, field);
    const spot = new THREE.Vector3();

    let court = null;
    const items = new THREE.Group();
    scene.add(items);
    const tiles = new Pool(items, (tile) => tileModel(tile, world));
    const balls = new Pool(items, () => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), world.material("#ffd65c", { metalness: 0.75, roughness: 0.22 }));
      return world.dress(ball);
    });
    const garlands = new Pool(items, () => world.dress(flower(world, MARIGOLD, "#ffe066")));
    const trays = { left: trayModel(world), right: trayModel(world) };
    const trims = Object.fromEntries(Object.entries(trays).map(([side, tray]) => {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: HAND_COLOURS[side], fog: false, toneMapped: false }));
      trim.position.set(0, 0.2, 0.22);
      trim.userData.keepMaterial = true;
      tray.add(trim);
      tray.visible = false;
      scene.add(tray);
      return [side, trim];
    }));
    const glow = { left: 0, right: 0 };

    hero.root.rotation.y = Math.PI;
    hero.root.scale.setScalar(1.7); // the camera is high, and the player should still read as a person
    hero.play("Idle_Loop");
    const reach = armReach(hero);
    let heroX = 0;
    let shownPattern = null;

    return {
      update(state, dt, elapsed) {
        camera.position.set(...EYE);
        camera.lookAt(...LOOK_AT);
        camera.updateMatrixWorld();

        // The camera's aspect is only known after the first resize, so the court is laid on the first frame.
        if (!court) {
          court = courtFloor(field, world, world.data.path);
          scene.add(court.mesh);
          const [a, b, c, d] = court.corners;
          scene.add(garlandLine(a, b, world), garlandLine(a, c, world), garlandLine(b, d, world));
        }

        tiles.sync(state.tiles, (object, tile) => {
          field.onFloor(tile.x, tile.y, TILE_HEIGHT, object.position);
          const size = field.size(tile.radius, camera.position.y - TILE_HEIGHT);
          object.scale.set(size, size * 0.36, size);
          if (object.userData.stud) object.userData.stud.visible = tile.hp > 1;
        });
        balls.sync(state.balls, (object, ball) => {
          field.onFloor(ball.x, ball.y, BALL_LIFT, object.position);
          object.scale.setScalar(field.size(BALL_RADIUS, camera.position.y - BALL_LIFT));
        });
        garlands.sync(state.garlands, (object, garland) => {
          field.onFloor(garland.x, garland.y, 0.5, object.position);
          object.scale.setScalar(field.size(0.09, camera.position.y));
          object.rotation.y = elapsed * 2.4;
        });

        const shown = traysOf(state);
        for (const [side, tray] of Object.entries(trays)) {
          const entry = shown.find((item) => item.side === side);
          tray.visible = Boolean(entry);
          glow[side] = Math.max(0, glow[side] - dt * 6);
          if (!entry) continue;
          field.onFloor(entry.x, TRAY_Y - 0.02, 0.2, tray.position);
          const span = field.onFloor(entry.x + entry.half, TRAY_Y - 0.02, 0.2, spot).x - tray.position.x;
          tray.scale.set(span, 1 + glow[side] * 0.7, 1 + glow[side] * 0.4);
          trims[side].visible = shown.length > 1;
        }

        // The player stands below the court, under their trays.
        const middle = shown.reduce((sum, item) => sum + item.x, 0) / shown.length;
        heroX = damp(heroX, middle, 8, dt);
        field.onFloor(heroX, COURT_BOTTOM + 0.1, 0, hero.root.position);
        reach(state.cursors, dt, (cursor, out) => field.onFloor(cursor.x, TRAY_Y, 1.1, out));

        if (shownPattern !== state.pattern) {
          shownPattern = state.pattern;
          banner.say(patternOf(state).name);
        }
        banner.update(dt);
        focusShadow(0, 0, CENTRE.y - 1);
      },
      event(event) {
        if (event.type === "tile" || event.type === "crack") {
          field.onFloor(event.x, event.y, TILE_HEIGHT, spot);
          fx.burst(spot, POWDER[event.tone % POWDER.length], event.type === "tile" ? 26 : 10);
          if (event.type === "tile") fx.shake(0.06);
        }
        if (event.type === "bounce") {
          glow[event.side] = 1;
          field.onFloor(event.x, TRAY_Y, 0.4, spot);
          fx.burst(spot, "#ffe9a8", 8);
        }
        if (event.type === "garland") fx.flash(MARIGOLD, 0.18);
        if (event.type === "cleared") {
          fx.flash("#fff2c4", 0.3);
          for (const { x, y, tone } of event.tiles) fx.burst(field.onFloor(x, y, TILE_HEIGHT, spot), POWDER[tone % POWDER.length], 22);
          hero.play("Yes", { once: true, then: "Idle_Loop" });
        }
        if (event.type === "fall") fx.shake(0.3);
        if (event.type === "hurt") {
          fx.flash("#ff3b4e", 0.3);
          hero.play("Hit_Chest", { once: true, speed: 1.4, fade: 0.05, then: "Idle_Loop" });
        }
      },
    };
  },
};
