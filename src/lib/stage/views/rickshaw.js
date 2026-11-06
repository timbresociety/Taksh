// Auto Rally: an auto rickshaw from behind, on three lanes of traffic with a dirt shoulder on the left.
import * as THREE from "three";
import { LANE_X, ROAD } from "../../templates/rickshaw.js";
import { Pool, damp } from "./shared.js";

const ROAD_WIDTH = 6.6; // the three traffic lanes, and the world's own ground is the shoulder beside them
const ROAD_X = LANE_X[2];
const SHOW_AHEAD = 150;
const SHOW_BEHIND = 14;
const STEER_ROLL = 0.08;
const STEER_TURN = 0.16;
const MODELS = { taxi: "proc:taxi", auto: "proc:auto", bus: "proc:bus" };

function checkpoint(world, accent) {
  const group = new THREE.Group();
  const span = ROAD * 2 + 2;
  const pole = world.material("#2b2d33");
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.6, 0.3), pole);
    post.position.set((side * span) / 2, 2.8, 0);
    group.add(post);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const pen = canvas.getContext("2d");
  const paint = (word) => {
    pen.fillStyle = "#16181f";
    pen.fillRect(0, 0, 1024, 128);
    pen.fillStyle = accent;
    for (let i = 0; i < 16; i += 2) pen.fillRect(i * 64, 0, 64, 14);
    for (let i = 1; i < 16; i += 2) pen.fillRect(i * 64, 114, 64, 14);
    pen.font = "900 84px system-ui, sans-serif";
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillStyle = "#fff8e6";
    pen.fillText(word, 512, 66);
  };
  paint("CHECKPOINT");
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(span, 1.1, 0.1), new THREE.MeshBasicMaterial({ map, toneMapped: false }));
  banner.position.y = 5.1;
  banner.userData.keepMaterial = true;
  group.add(banner);
  world.dress(group);
  return { group, last() {
    paint("FINISH");
    map.needsUpdate = true;
  } };
}

export const rickshaw = {
  async build({ scene, camera, world, hero, fx, focusShadow, accent }) {
    const road = world.road(ROAD_WIDTH);
    road.mesh.position.x = ROAD_X;
    const side = world.strip();
    const items = new THREE.Group();
    scene.add(road.mesh, side.group, items);

    const traffic = new Pool(items, (item) => {
      if (MODELS[item.kind]) return world.pieceOf(MODELS[item.kind], 2);
      return item.kind === "wall" ? world.role("wall", 2.2) : world.role(item.kind, item.kind === "low" ? 1.6 : 1);
    });
    const fares = new Pool(items, () => world.role("pickup", 0.8));

    // The driver sits up front under the hood, so the auto is the part of the hero the player follows.
    const rig = new THREE.Group();
    const auto = world.pieceOf("proc:rallyauto", 1.7);
    rig.add(auto);
    hero.root.position.set(0, 0.34, -0.4);
    hero.root.rotation.y = Math.PI;
    hero.root.scale.setScalar(0.86);
    hero.play("Driving_Loop");
    rig.add(hero.root);
    scene.add(rig);

    const gate = checkpoint(world, accent);
    scene.add(gate.group);

    let x = 0;
    let turn = 0;
    let cameraX = 0;
    let dust = 0;
    let lastDone = false;

    return {
      update(state, dt, elapsed) {
        const { distance } = state;
        side.scroll(distance);
        road.scroll(distance);
        traffic.sync(state.items.filter((item) => item.at - distance < SHOW_AHEAD && item.at - distance > -SHOW_BEHIND), (object, item) => {
          object.position.set(item.x, 0, -(item.at - distance));
        });
        fares.sync(state.fares.filter((fare) => fare.at - distance < SHOW_AHEAD && fare.at - distance > -SHOW_BEHIND), (object, fare) => {
          object.position.set(fare.x, 0.7 + Math.sin(elapsed * 4 + fare.id) * 0.1, -(fare.at - distance));
          object.rotation.y = elapsed * 3 + fare.id;
        });

        const gateAt = Math.min(state.leg + 1, state.legs) * state.legM;
        gate.group.position.z = -(gateAt - distance);
        if (!lastDone && state.leg + 1 >= state.legs) {
          lastDone = true;
          gate.last();
        }

        const moved = (state.x - x) / Math.max(dt, 0.001);
        x = state.x;
        turn = damp(turn, Math.max(-1, Math.min(1, moved / 4.6)), 9, dt);
        const shake = state.speed > 1 ? Math.sin(elapsed * 31) * 0.012 : 0;
        rig.position.set(x, shake + Math.abs(Math.sin(elapsed * 9)) * 0.006 * state.speed, 0);
        rig.rotation.set(0, -turn * STEER_TURN, -turn * STEER_ROLL);
        rig.visible = state.invincibleMs <= 0 || Math.sin(elapsed * 34) > -0.2;

        dust -= dt * state.speed;
        if (dust <= 0 && state.speed > 3) {
          dust = 3;
          fx.burst({ x, y: 0.2, z: 1.6 }, world.data.grey ? "#c9ccd4" : "#b9a58a", 3);
        }

        cameraX = damp(cameraX, x * 0.65, 6, dt);
        camera.position.set(cameraX, 3.3, 6.8);
        camera.lookAt(cameraX, 1.2, -10);
        focusShadow(0, 0, -6);
      },
      event(event, state) {
        if (event.type === "coin") fx.burst({ x: event.x, y: 1, z: -0.6 }, accent, 14);
        if (event.type === "near") fx.burst({ x: state.x, y: 0.8, z: 0 }, "#ffffff", 10);
        if (event.type === "bump") fx.shake(0.2);
        if (event.type === "gate" || event.type === "finish") {
          fx.flash(accent, 0.3);
          for (const sideX of [-3, 0, 3]) fx.burst({ x: sideX, y: 3.4, z: -1 }, accent, 34);
        }
        if (event.type === "hurt") {
          fx.shake(0.55);
          fx.flash("#ff3b4e", 0.32);
          fx.burst({ x: state.x, y: 1, z: -1.2 }, "#ffb02e", 26);
        }
      },
    };
  },
};
