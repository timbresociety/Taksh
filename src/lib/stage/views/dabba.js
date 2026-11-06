// Dabba Catch: a delivery rack across the top of the screen, tiffins and trouble falling from it.
import * as THREE from "three";
import { HAND_RADIUS, SHIFTS } from "../../templates/dabba.js";
import { HAND_COLOURS, armReach, bannerCard, fieldOf, glowMaterial, handRings } from "./cursors.js";
import { Pool, wordCard } from "./shared.js";

const ITEM_Z = -1.6;
const RACK_Z = -2.6;
const RACK_Y = 0.98;

function tiffin(owner, world) {
  const group = new THREE.Group();
  const steel = world.material("#d6dbe2", { metalness: 0.75, roughness: 0.28 });
  const band = world.material(HAND_COLOURS[owner], { roughness: 0.45 });
  const tier = new THREE.CylinderGeometry(0.62, 0.62, 0.44, 22);
  for (const y of [-0.52, 0, 0.52]) {
    const pot = new THREE.Mesh(tier, steel);
    pot.position.y = y;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.645, 0.645, 0.18, 22), band);
    stripe.position.y = y;
    group.add(pot, stripe);
  }
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.62, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  lid.scale.y = 0.34;
  lid.position.y = 0.74;
  group.add(lid);
  for (const side of [-1, 1]) {
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.7, 0.18), world.material("#8a919b", { metalness: 0.7, roughness: 0.35 }));
    clamp.position.set(side * 0.68, 0.06, 0);
    group.add(clamp);
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 8, 22, Math.PI), world.material("#8a919b", { metalness: 0.7, roughness: 0.35 }));
  handle.position.y = 0.8;
  group.add(handle);
  return world.dress(group);
}

// Pickups and hazards come from the world, at the world's own size, so each is brought to a radius of one.
function fromWorld(role, world) {
  const model = world.role(role, 2);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const middle = box.getCenter(new THREE.Vector3());
  const group = new THREE.Group();
  const scale = 2 / Math.max(size.x, size.y, size.z);
  model.position.sub(middle);
  group.add(model);
  group.scale.setScalar(scale);
  const outer = new THREE.Group();
  outer.add(group);
  return outer;
}

function hazardModel(world) {
  const group = fromWorld("hazard", world);
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.55, 36), glowMaterial("#ff2438", { opacity: 0.95 }));
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.3), glowMaterial("#ff2438", { opacity: 0.95 }));
  bar.rotation.z = Math.PI / 4;
  for (const mesh of [halo, bar]) {
    mesh.userData.keepMaterial = true;
    mesh.renderOrder = 7;
  }
  group.add(halo, bar);
  group.userData.halo = halo;
  return group;
}

// Timber and steel across the top, hung with the day's tiffins.
function rack(field, world) {
  const group = new THREE.Group();
  const left = field.atDepth(-1, RACK_Y, RACK_Z, new THREE.Vector3());
  const span = -left.x * 2 + 2;
  const [top, side] = world.data.platform;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.32, 0.5), world.material(side, { roughness: 0.8 }));
  beam.position.set(0, left.y, RACK_Z);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(span, 0.1, 0.6), world.material(top, { roughness: 0.6 }));
  rail.position.set(0, left.y - 0.2, RACK_Z);
  group.add(beam, rail);
  for (const x of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, left.y, 0.3), world.material(side, { roughness: 0.8 }));
    post.position.set(x * (-left.x + 0.2), left.y / 2, RACK_Z);
    group.add(post);
  }
  for (let i = 0; i < 10; i += 1) {
    const hanging = tiffin(i % 2 ? "left" : "right", world);
    hanging.scale.setScalar(0.2);
    hanging.position.set((i - 4.5) * (span / 11), left.y - 0.5, RACK_Z);
    group.add(hanging);
  }
  return world.dress(group);
}

export const dabba = {
  async build({ scene, camera, world, hero, fx, focusShadow }) {
    camera.position.set(0, 2.45, 5.1);
    camera.lookAt(0, 2.05, -6);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const road = world.road(16);
    scene.add(road.mesh, world.ring({ inner: 13 }), camera);
    const field = fieldOf(camera);
    const rings = handRings(camera, field, HAND_RADIUS);
    const banner = bannerCard(camera, field);
    const reach = armReach(hero);
    const spot = new THREE.Vector3();

    const items = new THREE.Group();
    scene.add(items);
    const pool = new Pool(items, (item) => {
      if (item.kind === "hazard") return hazardModel(world);
      return item.kind === "snack" ? world.dress(fromWorld("pickup", world)) : tiffin(item.owner, world);
    });

    const word = wordCard("+20", "#fff1a8");
    word.scale.set(1.2, 0.6, 1);
    word.visible = false;
    scene.add(word);
    let wordLife = 0;
    const pulse = { left: 0, right: 0 };

    hero.root.rotation.y = Math.PI;
    hero.root.position.set(0, 0, 1.9);
    hero.play("Idle_Loop");
    let racked = false;
    let shownShift = null;

    return {
      update(state, dt, elapsed) {
        camera.position.set(0, 2.45, 5.1);
        camera.lookAt(0, 2.05, -6);
        camera.updateMatrixWorld();
        if (!racked) {
          racked = true;
          scene.add(rack(field, world));
        }

        pool.sync(state.items, (object, item) => {
          field.atDepth(item.x, item.y, ITEM_Z, object.position);
          object.scale.setScalar(field.size(item.radius, camera.position.z - ITEM_Z));
          const { halo } = object.userData;
          // Trouble turns inside its warning, which stays square to the player.
          (halo ? object.children[0] : object).rotation.set(Math.sin(item.turn) * 0.3, item.turn, Math.sin(item.turn * 0.7) * 0.22);
          halo?.scale.setScalar(1 + Math.sin(elapsed * 9) * 0.1);
        });

        for (const side of ["left", "right"]) pulse[side] = Math.max(0, pulse[side] - dt * 5);
        rings.update(state.cursors, pulse);
        reach(state.cursors, dt, (cursor, out) => field.atDepth(cursor.x, cursor.y, ITEM_Z, out));

        wordLife -= dt;
        word.visible = wordLife > 0;
        word.position.y += dt * 0.7;
        if (shownShift !== state.shift) {
          shownShift = state.shift;
          banner.say(SHIFTS[state.shift]);
        }
        banner.update(dt);
        focusShadow(0, 0, -2);
      },
      event(event) {
        if (event.type === "catch") {
          field.atDepth(event.x, event.y, ITEM_Z, spot);
          fx.burst(spot, event.owner ? HAND_COLOURS[event.owner] : "#ffe27a", 18);
          if (event.side in pulse) pulse[event.side] = 1;
          if (event.count > 2 && event.count % 5 === 0) {
            word.material.map.dispose();
            word.material.map = wordCard(`${event.count}!`, "#fff1a8").material.map;
            word.position.copy(spot);
            wordLife = 0.8;
          }
          hero.play("Interact", { once: true, speed: 2.4, fade: 0.05, then: "Idle_Loop" });
        }
        if (event.type === "wrong") {
          field.atDepth(event.x, event.y, ITEM_Z, spot);
          fx.burst(spot, "#ffffff", 8);
        }
        if (event.type === "blast") {
          field.atDepth(event.x, event.y, ITEM_Z, spot);
          fx.burst(spot, "#ffb02e", 50);
          fx.burst(spot, "#ff3b1e", 40);
          fx.flash("#ffb02e", 0.5);
          fx.shake(0.6);
          hero.play("Hit_Chest", { once: true, speed: 1.4, then: "Idle_Loop" });
        }
        if (event.type === "end") hero.play("Yes", { once: true });
      },
    };
  },
};
