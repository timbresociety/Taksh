// Games seen from behind the player, down three lanes.
import * as THREE from "three";
import { LANE_WIDTH, Pool, blink, damp, laneX } from "./shared.js";

const JUMP_MS = 620;
const ROAD_WIDTH = LANE_WIDTH * 3 + 0.8;

// An overhead bar that reads at a glance as "go under this".
function barrier(world) {
  const group = new THREE.Group();
  const stripe = world.material(world.data.accent, { emissive: world.data.accent, emissiveIntensity: 0.35 });
  const dark = world.material("#20232b");
  const bar = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH - 0.1, 0.62, 0.28), stripe);
  bar.position.y = 1.72;
  group.add(bar);
  for (const x of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.1, 0.2), dark);
    post.position.set((x * (LANE_WIDTH - 0.3)) / 2, 1.05, 0);
    group.add(post);
  }
  return world.dress(group);
}

export const lane_runner = {
  async build({ scene, camera, world, hero, fx, focusShadow, accent }) {
    const road = world.road(ROAD_WIDTH);
    const side = world.strip();
    scene.add(road.mesh, side.group);
    const items = new THREE.Group();
    scene.add(items);
    const obstacles = new Pool(items, (item) => (item.kind === "high" ? barrier(world) : item.kind === "low" ? world.role("low", 1.9) : world.role("wall", LANE_WIDTH - 0.1)));
    const coins = new Pool(items, () => world.role("pickup", 0.7));

    hero.root.rotation.y = Math.PI;
    hero.play("Sprint_Loop");
    let x = 0;
    let cameraX = 0;

    return {
      update(state, dt, elapsed) {
        side.scroll(state.distance);
        road.scroll(state.distance);
        obstacles.sync(state.obstacles, (object, item) => object.position.set(laneX(item.lane), 0, -item.z));
        coins.sync(state.coins.map((coin) => ({ ...coin, kind: "coin" })), (object, item) => {
          object.position.set(laneX(item.lane), 0.75 + Math.sin(elapsed * 4 + item.id) * 0.08, -item.z);
          object.rotation.y = elapsed * 3.4 + item.id;
        });

        x = damp(x, laneX(state.lane), 14, dt);
        const lift = state.jumpMs > 0 ? Math.sin(Math.PI * (1 - state.jumpMs / JUMP_MS)) * 1.45 : 0;
        hero.root.position.set(x, lift, 0);
        hero.root.rotation.z = (laneX(state.lane) - x) * -0.09;
        if (state.jumpMs <= 0 && state.rollMs <= 0 && state.status === "playing") hero.loop("Sprint_Loop", { speed: Math.min(1.5, state.speed / 11) });
        blink(hero.root, state.invincibleMs, elapsed);

        cameraX = damp(cameraX, x * 0.6, 6, dt);
        camera.position.set(cameraX, 3.5, 6.6);
        camera.lookAt(cameraX, 1.3, -9);
        focusShadow(0, 0, -6);
      },
      event(event) {
        const at = hero.root.position;
        if (event.type === "jump") hero.play("Jump_Start", { once: true, speed: 2.2, fade: 0.08, then: "Jump_Loop" });
        if (event.type === "roll") hero.play("Roll", { once: true, speed: 1.5, fade: 0.08 });
        if (event.type === "coin") fx.burst({ x: at.x, y: 1, z: -0.6 }, accent, 10);
        if (event.type === "hurt") {
          fx.shake(0.5);
          fx.flash("#ff3b4e", 0.32);
        }
        if (event.type === "end") hero.play("Death01", { once: true });
      },
    };
  },
};

export const guard = {
  async build({ scene, camera, world, hero, fx, focusShadow, accent }) {
    const road = world.road(ROAD_WIDTH);
    scene.add(road.mesh, world.ring({ inner: 13 }));
    const items = new THREE.Group();
    scene.add(items);
    const incoming = new Pool(items, (item) => (item.kind === "hazard" ? world.role("hazard", 1.2) : world.role("pickup", 0.9)));
    const warn = [0, 1, 2].map((lane) => {
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(LANE_WIDTH - 0.15, 3.4), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0 }));
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(laneX(lane), 0.05, -0.8);
      tile.userData.keepMaterial = true;
      scene.add(tile);
      return tile;
    });

    hero.root.rotation.y = Math.PI;
    hero.play("Idle_Loop");
    let x = 0;

    return {
      update(state, dt, elapsed) {
        incoming.sync(state.incoming.filter((item) => !item.resolved || item.ms < item.warningMs + 150), (object, item) => {
          const progress = item.ms / item.warningMs;
          const arc = Math.sin(Math.min(1, progress) * Math.PI) * 2.2;
          object.position.set(laneX(item.lane), 0.8 + arc, -34 * (1 - progress));
          object.rotation.y = elapsed * 4;
        });
        for (const [lane, tile] of warn.entries()) {
          const next = state.incoming.find((item) => !item.resolved && item.lane === lane);
          const urgent = next ? Math.min(1, next.ms / next.warningMs) : 0;
          tile.material.color.set(next?.kind === "hazard" ? "#ff3b4e" : accent);
          tile.material.opacity = damp(tile.material.opacity, urgent * 0.55, 12, dt);
        }
        const moving = Math.abs(laneX(state.lane) - x) > 0.15;
        x = damp(x, laneX(state.lane), 12, dt);
        hero.root.position.x = x;
        if (state.status === "playing") hero.loop(moving ? "Jog_Fwd_Loop" : "Idle_Loop", { fade: 0.1 });
        camera.position.set(x * 0.35, 3.1, 6.2);
        camera.lookAt(x * 0.35, 1.3, -10);
        focusShadow(0, 0, -6);
      },
      event(event) {
        const at = { x: event.lane === undefined ? 0 : laneX(event.lane), y: 1.1, z: 0 };
        if (event.type === "catch") {
          fx.burst(at, accent);
          hero.play("Interact", { once: true, speed: 1.6, then: "Idle_Loop" });
        }
        if (event.type === "hurt") {
          fx.burst(at, "#ff3b4e");
          fx.shake(0.5);
          fx.flash("#ff3b4e", 0.32);
          hero.play("Hit_Chest", { once: true, then: "Idle_Loop" });
        }
        if (event.type === "end") hero.play("Yes", { once: true });
      },
    };
  },
};
