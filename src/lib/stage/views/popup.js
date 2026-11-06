// Pop-Up Patrol: a two-storey house front across the street with real holes for windows, and potholes in
// the road before it. Whoever is up comes out from behind the sill, so nothing has to be faked.
import * as THREE from "three";
import { HAND_RADIUS, RISE_MS, ROUNDS, SLOTS } from "../../templates/popup.js";
import { arcRing, armReach, bannerCard, fieldOf, handRings } from "./cursors.js";
import { Pool, damp } from "./shared.js";

const EYE = [0, 2.3, 6.4];
const LOOK_AT = [0, 2.2, -5];
const WALL_Z = -5.2;
const WINDOW_Z = WALL_Z - 0.55; // who stands in a window stands inside the room
const HOLE_Z = -1.5;
const WINDOW_HALF = [1.15, 1.02];
const WALL_DEPTH = 0.5;
const WALL_HEIGHT = 6.6;

const part = (geometry, material, at, scale) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...at);
  if (scale) mesh.scale.set(...scale);
  return mesh;
};

// Each is modelled round a head of radius one at the origin, and a neck going down behind the sill.
function monkey(world, fur, face) {
  const group = new THREE.Group();
  const ball = new THREE.SphereGeometry(1, 20, 14);
  const hair = world.material(fur, { roughness: 0.9 });
  const skin = world.material(face, { roughness: 0.7 });
  const dark = world.material("#1b1310");
  group.add(part(ball, hair, [0, 0, 0]), part(ball, hair, [0, -2, -0.2], [1, 1.4, 0.9]));
  group.add(part(ball, skin, [0, -0.18, 0.62], [0.72, 0.62, 0.5]), part(ball, skin, [-0.34, 0.26, 0.66], [0.42, 0.42, 0.34]), part(ball, skin, [0.34, 0.26, 0.66], [0.42, 0.42, 0.34]));
  for (const side of [-1, 1]) {
    group.add(part(ball, skin, [side * 1.08, 0.1, 0], [0.34, 0.42, 0.2]), part(ball, dark, [side * 0.34, 0.28, 1], [0.13, 0.15, 0.1]));
    const arm = part(ball, hair, [side * 1.2, -1.1, 0.5], [0.3, 0.85, 0.3]);
    arm.rotation.z = side * 0.25;
    group.add(arm);
  }
  group.add(part(ball, dark, [0, -0.28, 1.02], [0.3, 0.05, 0.1]));
  return group;
}

function crow(world) {
  const group = new THREE.Group();
  const ball = new THREE.SphereGeometry(1, 18, 12);
  const black = world.material("#23252e", { roughness: 0.4, metalness: 0.2 });
  group.add(part(ball, black, [0, 0, 0]), part(ball, black, [0, -1.7, -0.3], [1.05, 1.5, 1]));
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.2, 10), world.material("#ffb21f", { roughness: 0.5 }));
  beak.position.set(0, -0.1, 1.2);
  beak.rotation.x = Math.PI / 2;
  group.add(beak);
  for (const side of [-1, 1]) {
    group.add(part(ball, world.material("#fff8ea"), [side * 0.46, 0.3, 0.78], [0.25, 0.25, 0.2]), part(ball, world.material("#14100a"), [side * 0.48, 0.3, 0.97], [0.12, 0.12, 0.08]));
    const wing = part(ball, black, [side * 1.2, -1.2, -0.2], [0.34, 1.1, 0.6]);
    wing.rotation.z = side * 0.5;
    group.add(wing);
  }
  return group;
}

function langur(world) {
  const group = monkey(world, "#e8e2d2", "#23201e");
  const gold = world.material("#ffcf3a", { metalness: 0.7, roughness: 0.25 });
  group.add(part(new THREE.CylinderGeometry(0.62, 0.74, 0.5, 6), gold, [0, 1.02, 0]));
  for (const side of [-1, 0, 1]) {
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 6), gold);
    point.position.set(side * 0.42, 1.44, 0.2);
    group.add(point);
  }
  return group;
}

// White with a red collar and a bell, so nothing else on the street could be taken for it.
function cat(world) {
  const group = new THREE.Group();
  const ball = new THREE.SphereGeometry(1, 20, 14);
  const white = world.material("#fbf8f1", { roughness: 0.8 });
  const pink = world.material("#ff9db4");
  const dark = world.material("#1b1310");
  group.add(part(ball, white, [0, 0, 0], [1.1, 0.95, 1]), part(ball, white, [0, -1.9, -0.2], [0.95, 1.3, 0.9]));
  group.add(part(new THREE.TorusGeometry(0.76, 0.13, 8, 22), world.material("#e11d33"), [0, -0.92, 0], [1, 1, 1]));
  group.children.at(-1).rotation.x = Math.PI / 2;
  group.add(part(ball, world.material("#ffd23f", { metalness: 0.6, roughness: 0.3 }), [0, -1.02, 0.78], [0.2, 0.2, 0.2]));
  group.add(part(ball, pink, [0, -0.08, 0.98], [0.13, 0.1, 0.08]));
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 4), white);
    ear.position.set(side * 0.66, 0.96, 0);
    ear.rotation.z = side * -0.3;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4), pink);
    inner.position.set(side * 0.66, 0.9, 0.16);
    inner.rotation.z = side * -0.3;
    group.add(ear, inner, part(ball, dark, [side * 0.42, 0.14, 0.9], [0.13, 0.17, 0.08]));
    for (const lift of [0.1, -0.16]) {
      const whisker = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.03, 0.03), dark);
      whisker.position.set(side * 0.8, lift - 0.06, 0.82);
      whisker.rotation.z = side * lift * 0.9;
      group.add(whisker);
    }
  }
  return group;
}

const MAKERS = { monkey: (world) => monkey(world, "#8a5a33", "#e9c39a"), crow, langur, cat };
const BURST = { monkey: "#ffd86b", crow: "#c8d4ff", langur: "#fff2a8" };

// The wall is built round its windows, in strips, so the rooms behind can be seen into.
function houseFront(field, world) {
  const group = new THREE.Group();
  const [top, side] = world.data.platform;
  const wall = world.material(top, { roughness: 0.85 });
  const trim = world.material(side, { roughness: 0.7 });
  const frame = world.material(world.data.accent, { roughness: 0.5 });
  const room = new THREE.MeshBasicMaterial({ color: "#100c14", fog: false });
  const windows = SLOTS.filter((slot) => !slot.hole).map((slot) => field.atDepth(slot.x, slot.y, WALL_Z, new THREE.Vector3()));
  // The camera looks slightly down, so each row's windows sit a little apart from the row above.
  const rows = Map.groupBy(windows, (at) => Math.round(at.y * 10));
  const ys = [...rows.values()].map((row) => row[0].y).sort((a, b) => a - b);
  const [halfWide, halfTall] = WINDOW_HALF;
  const edge = Math.max(...windows.map((at) => at.x)) + halfWide + 5;
  const block = (fromX, toX, fromY, toY) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(toX - fromX, toY - fromY, WALL_DEPTH), wall);
    mesh.position.set((fromX + toX) / 2, (fromY + toY) / 2, WALL_Z);
    group.add(mesh);
  };
  // Bands above, between and below the rows, then piers beside each window.
  const stops = [0, ...ys.flatMap((y) => [y - halfTall, y + halfTall]), WALL_HEIGHT];
  for (let i = 0; i < stops.length; i += 2) block(-edge, edge, stops[i], stops[i + 1]);
  for (const row of rows.values()) {
    const { y } = row[0];
    const columns = [-edge, ...row.map((at) => at.x).sort((a, b) => a - b).flatMap((x) => [x - halfWide, x + halfWide]), edge];
    for (let i = 0; i < columns.length; i += 2) block(columns[i], columns[i + 1], y - halfTall, y + halfTall);
  }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(edge * 2, WALL_HEIGHT), room);
  back.position.set(0, WALL_HEIGHT / 2, WALL_Z - 1.4);
  back.userData.keepMaterial = true;
  group.add(back);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(edge * 2 + 0.4, 0.34, 0.9), trim);
  cornice.position.set(0, WALL_HEIGHT + 0.1, WALL_Z);
  group.add(cornice);
  for (const at of windows) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(halfWide * 2 + 0.4, 0.18, 0.8), frame);
    sill.position.set(at.x, at.y - halfTall - 0.02, WALL_Z + 0.2);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(halfWide * 2 + 0.3, 0.2, 0.6), frame);
    lintel.position.set(at.x, at.y + halfTall + 0.06, WALL_Z + 0.12);
    group.add(sill, lintel);
    for (const dir of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, halfTall * 2, 0.6), frame);
      post.position.set(at.x + dir * (halfWide + 0.04), at.y, WALL_Z + 0.1);
      const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.72, halfTall * 2 - 0.1, 0.08), trim);
      shutter.position.set(at.x + dir * (halfWide + 0.48), at.y, WALL_Z + 0.32);
      group.add(post, shutter);
    }
  }
  return world.dress(group);
}

function potholes(field, world) {
  const group = new THREE.Group();
  const dark = new THREE.MeshBasicMaterial({ color: "#0c0a0e", fog: false });
  const rim = world.material(world.data.platform[1], { roughness: 1 });
  for (const slot of SLOTS.filter((item) => item.hole)) {
    const at = field.atDepth(slot.x, slot.y, HOLE_Z, new THREE.Vector3());
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.72, 26), dark);
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(at.x, 0.05, HOLE_Z);
    hole.userData.keepMaterial = true;
    hole.userData.flat = true;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.12, 8, 26), rim);
    lip.rotation.x = Math.PI / 2;
    lip.scale.z = 0.6;
    lip.position.set(at.x, 0.07, HOLE_Z);
    group.add(hole, lip);
  }
  return world.dress(group);
}

export const popup = {
  async build({ scene, camera, world, hero, fx, focusShadow }) {
    const frame = () => {
      camera.position.set(...EYE);
      camera.lookAt(...LOOK_AT);
      camera.updateMatrixWorld();
    };
    frame();
    camera.updateProjectionMatrix();
    const road = world.road(18);
    scene.add(road.mesh, world.ring({ inner: 14 }), camera);
    const field = fieldOf(camera);
    const rings = handRings(camera, field, HAND_RADIUS);
    const banner = bannerCard(camera, field);
    const reach = armReach(hero);
    const spot = new THREE.Vector3();

    const items = new THREE.Group();
    scene.add(items);
    const pool = new Pool(items, (pop) => world.dress(MAKERS[pop.kind](world)));
    const timers = Array.from({ length: 6 }, () => {
      const ring = arcRing("#ffe27a", 0.16);
      ring.visible = false;
      camera.add(ring);
      return ring;
    });

    // What was knocked out of a window keeps going for a moment after the game has let go of it.
    const fallers = [];
    const pulse = { left: 0, right: 0 };

    hero.root.rotation.y = Math.PI;
    hero.root.position.set(0, 0, 2.8);
    hero.play("Idle_Loop");
    let built = false;
    let shownRound = null;
    let lean = 0;

    return {
      update(state, dt, elapsed) {
        frame();
        if (!built) {
          built = true;
          scene.add(houseFront(field, world), potholes(field, world));
        }

        pool.sync(state.pops, (object, pop) => {
          const { hole } = SLOTS[pop.slot];
          const z = hole ? HOLE_Z : WINDOW_Z;
          field.atDepth(pop.x, pop.y, z, object.position);
          const size = field.size(pop.radius, camera.position.z - z) * 0.74;
          const rise = Math.min(1, pop.ms / RISE_MS);
          const leaving = Math.min(1, Math.max(0, (pop.upMs - pop.ms) / RISE_MS));
          const shown = Math.min(rise, leaving);
          object.scale.setScalar(size);
          object.position.y -= (1 - shown) * size * 3.4;
          object.rotation.set(0, Math.sin(elapsed * 2.2 + pop.id) * 0.3, Math.sin(elapsed * 3 + pop.id) * 0.08);
        });

        const thieves = state.pops.filter((pop) => pop.kind !== "cat");
        for (const [index, ring] of timers.entries()) {
          const pop = thieves[index];
          ring.visible = Boolean(pop);
          if (!pop) continue;
          field.onLens(ring, pop.x, pop.y, pop.radius * 1.25);
          ring.fill(1 - pop.ms / pop.upMs);
          ring.material.color.set(pop.upMs - pop.ms < 600 ? "#ff4a3a" : "#ffe27a");
        }

        for (const side of ["left", "right"]) pulse[side] = Math.max(0, pulse[side] - dt * 5);
        rings.update(state.cursors, pulse);
        reach(state.cursors, dt, (cursor, out) => field.atDepth(cursor.x, cursor.y, HOLE_Z, out));
        const { left, right } = state.cursors;
        lean = damp(lean, left.live !== right.live ? (left.live ? left.x : right.x) * 0.5 : 0, 6, dt);
        hero.root.rotation.y = Math.PI + lean;

        for (const faller of fallers) {
          faller.life -= dt;
          faller.v.y -= 16 * dt;
          faller.object.position.addScaledVector(faller.v, dt);
          faller.object.rotation.z += faller.spin * dt;
          faller.object.visible = faller.life > 0;
        }
        while (fallers.length && fallers[0].life <= 0) {
          const { object } = fallers.shift();
          object.removeFromParent();
        }

        if (shownRound !== state.round) {
          shownRound = state.round;
          banner.say(ROUNDS[state.round]);
        }
        banner.update(dt);
        focusShadow(0, 0, -3);
      },
      event(event) {
        if (event.type === "bop") {
          const { hole } = SLOTS[event.slot];
          const z = hole ? HOLE_Z : WINDOW_Z + 0.5;
          field.atDepth(event.x, event.y, z, spot);
          fx.burst(spot, BURST[event.kind], 22);
          fx.shake(0.08);
          const object = world.dress(MAKERS[event.kind](world));
          object.position.copy(spot);
          object.scale.setScalar(field.size(0.11, camera.position.z - z) * 0.74);
          scene.add(object);
          fallers.push({ object, life: 0.6, spin: event.x < 0 ? 9 : -9, v: new THREE.Vector3(event.x < 0 ? -3 : 3, 4.5, 1) });
          if (event.side in pulse) pulse[event.side] = 1;
          hero.play("Interact", { once: true, speed: 2.4, fade: 0.05, then: "Idle_Loop" });
        }
        if (event.type === "startle") {
          field.atDepth(event.x, event.y, HOLE_Z, spot);
          fx.burst(spot, "#ffffff", 40);
          fx.flash("#ff3b4e", 0.34);
          fx.shake(0.45);
          hero.play("Hit_Chest", { once: true, speed: 1.4, then: "Idle_Loop" });
        }
        if (event.type === "stolen") {
          fx.flash("#ff8a3a", 0.16);
          hero.play("Idle_No_Loop", { once: true, speed: 1.6, fade: 0.1, then: "Idle_Loop" });
        }
        if (event.type === "end") hero.play("Yes", { once: true });
      },
    };
  },
};
