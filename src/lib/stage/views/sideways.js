// Games seen side-on, travelling to the right.
import * as THREE from "three";
import { aimBone } from "../character.js";
import { Pool, blink, damp } from "./shared.js";

const CEILING = 10;
const FLIGHT_MS = 700;

function pillar(world, width) {
  const [top, side] = world.data.platform;
  const group = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(width / 2, width / 2, 0.34, 28), world.material(top));
  cap.position.y = -0.17;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(width / 2 - 0.02, width * 0.22, 9, 20), world.material(side));
  stem.position.y = -4.84;
  group.add(cap, stem);
  return world.dress(group);
}

export const hop = {
  async build({ scene, camera, world, hero, fx, focusShadow, accent }) {
    const backdrop = world.layers();
    backdrop.group.position.y = -7;
    scene.add(backdrop.group);
    scene.children.find((child) => child.isMesh && child.geometry.type === "PlaneGeometry").position.y = -7;
    const platforms = new Pool(scene, (item) => pillar(world, item.width));

    hero.root.rotation.y = Math.PI / 2;
    hero.play("Idle_Loop");
    let cameraX = 0;
    let dropMs = 0;

    return {
      update(state, dt) {
        platforms.sync(state.platforms, (object, item) => object.position.set(item.x, 0, 0));
        let y = 0;
        if (state.flight) {
          const { flight } = state;
          const progress = Math.min(1, flight.ms / FLIGHT_MS);
          y = Math.sin(progress * Math.PI) * (0.7 + (flight.to - flight.from) * 0.16);
        }
        dropMs = Math.max(0, dropMs - dt * 1000);
        hero.root.position.set(state.x, y - (dropMs > 0 ? (1 - dropMs / 500) * 3 : 0), 0);
        const squash = state.charging ? 1 - (state.chargeMs / 1400) * 0.16 : 1;
        hero.root.scale.set(1, damp(hero.root.scale.y, squash, 18, dt), 1);
        cameraX = damp(cameraX, state.x + 2, 4, dt);
        camera.position.set(cameraX, 2.4, 8.6);
        camera.lookAt(cameraX, 1.3, 0);
        backdrop.scroll(cameraX);
        focusShadow(cameraX, 0, 0);
      },
      event(event) {
        const at = { x: hero.root.position.x, y: 0.2, z: 0 };
        if (event.type === "charge") hero.play("Crouch_Idle_Loop", { fade: 0.1 });
        if (event.type === "launch") hero.play("NinjaJump_Start", { once: true, speed: 1.5, fade: 0.06, then: "Jump_Loop" });
        if (event.type === "land" || event.type === "perfect") {
          fx.burst(at, event.type === "perfect" ? accent : "#ffffff", event.type === "perfect" ? 30 : 14);
          hero.play("Jump_Land", { once: true, speed: 1.6, fade: 0.06, then: "Idle_Loop" });
        }
        if (event.type === "short") hero.play("Idle_Loop");
        if (event.type === "fall") {
          dropMs = 500;
          fx.shake(0.3);
          hero.play("Idle_Loop");
        }
      },
    };
  },
};

function archway(world, gapSize) {
  const group = new THREE.Group();
  const [, side] = world.data.platform;
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(gapSize / 2, 0.17, 12, 40), world.material(world.data.accent, { emissive: world.data.accent, emissiveIntensity: 0.7 }));
  hoop.rotation.y = 0.6; // turned toward the side-on camera so the gap reads as a gap
  group.add(hoop);
  for (const dir of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 14, 14), world.material(side));
    beam.position.y = dir * (gapSize / 2 + 7);
    group.add(beam);
  }
  return world.dress(group);
}

export const flyer = {
  async build({ scene, camera, world, hero, fx, focusShadow, accent, spec }) {
    const backdrop = world.layers();
    scene.add(backdrop.group);
    const gates = new Pool(scene, () => archway(world, spec.tuning.gapSize));

    hero.root.rotation.y = Math.PI / 2;
    hero.root.scale.setScalar(1.45);
    hero.play("Swim_Fwd_Loop");
    const arms = [hero.bones.get("upperarm_l"), hero.bones.get("upperarm_r")];
    const reach = [new THREE.Vector3(), new THREE.Vector3()];
    let beat = 0;
    let travelled = 0;

    return {
      update(state, dt, elapsed) {
        travelled += state.status === "playing" ? state.speed * dt : 0;
        gates.sync(state.gates, (object, item) => object.position.set(item.x, item.y, 0));
        hero.root.position.set(0, state.y - 1.2, 0);
        hero.root.rotation.z = THREE.MathUtils.clamp(state.velocity * 0.05, -0.4, 0.4);
        beat = damp(beat, 0, 5, dt);
        const wing = 0.25 + beat * 1.1 + Math.sin(elapsed * 3) * 0.08;
        reach[0].set(0, wing, -1);
        reach[1].set(0, wing, 1);
        arms.forEach((bone, index) => aimBone(bone, reach[index], 0.9));
        blink(hero.root, state.invincibleMs, elapsed);
        camera.position.set(3.2, 5.1, 13.5);
        camera.lookAt(3.2, 5, 0);
        backdrop.scroll(travelled);
        focusShadow(3, 3, 0);
      },
      event(event) {
        const at = hero.root.position;
        if (event.type === "flap") beat = 1;
        if (event.type === "gate") fx.burst({ x: at.x, y: at.y + 1, z: 0 }, accent);
        if (event.type === "hurt") {
          fx.shake(0.45);
          fx.flash("#ff3b4e", 0.32);
        }
      },
    };
  },
};

export { CEILING };
