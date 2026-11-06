// Dahi Handi: a human tower in matching shirts, a pot of curd on a rope, and the hero climbing to it.
import * as THREE from "three";
import { LEAN_AT, potHeight } from "../../templates/handi.js";
import { MOVE_POSES, applyPose } from "../coach.js";
import { forge } from "../props/forge.js";
import { alarmCard } from "./blades.js";
import { damp } from "./shared.js";

const TIER_H = 1.4; // a shoulder to the next pair of feet
const RING_STEP = 0.56; // how far each tier stands in from the one under it
const PERSON_M = 0.95;
const POT_ABOVE = 2.5;
const SIDE_X = 2.1; // where the climber waits, beside the tower
const CLIMB_S = 0.45;
const STEADY_S = 0.5;
const POT_BACK_S = 2.2;
const TIER_BEND = 0.055;
const CROWD = 16;
const SHIRTS = ["#e8791a", "#d8342c", "#f2b705", "#1f8f6a"];
const SKINS = ["#a86e4a", "#6e4630", "#d9a074"];

// A climber in a team shirt with a headband, arms out to the shoulders either side. They stand far
// enough back that one merged shape reads, and a tower needs dozens of them.
function climber(shirt, skin, { cheering = false } = {}) {
  const b = forge();
  for (const x of [-0.13, 0.13]) {
    b.cyl(0.075, 0.5, "#21314f", { top: 0.09, at: [x, 0.27, 0] });
    b.cyl(0.09, 0.42, "#21314f", { top: 0.11, at: [x, 0.72, 0] });
    b.box(0.13, 0.08, 0.26, "#1a1a20", { at: [x, 0.04, 0.05] });
  }
  b.cyl(0.21, 0.56, shirt, { top: 0.26, at: [0, 1.17, 0], segments: 12 });
  b.ball(0.27, shirt, { at: [0, 1.42, 0], scale: [1, 0.4, 0.75] });
  b.cyl(0.07, 0.1, skin, { at: [0, 1.5, 0] });
  b.ball(0.135, skin, { at: [0, 1.65, 0.01], detail: 2 });
  b.ball(0.139, "#1a120c", { at: [0, 1.69, -0.01], scale: [1, 0.72, 1], detail: 2 });
  b.torus(0.137, 0.022, "#f4efe2", { at: [0, 1.67, 0], turn: [Math.PI / 2, 0, 0] });
  for (const x of [-1, 1]) {
    if (cheering) {
      b.cyl(0.055, 0.42, shirt, { at: [x * 0.33, 1.56, 0], turn: [0, 0, x * -0.5] });
      b.cyl(0.048, 0.42, skin, { at: [x * 0.45, 1.94, 0], turn: [0, 0, x * -0.15] });
    } else {
      b.cyl(0.055, 0.46, shirt, { at: [x * 0.4, 1.42, 0], turn: [0, 0, x * 1.32] });
      b.cyl(0.048, 0.42, skin, { at: [x * 0.74, 1.46, 0], turn: [0, 0, x * 1.5] });
    }
  }
  return b.finish();
}

function potModel() {
  const b = forge();
  b.lathe([[0, -0.46], [0.24, -0.42], [0.42, -0.2], [0.46, 0.02], [0.36, 0.24], [0.2, 0.34], [0.23, 0.42], [0.28, 0.46]], "#b5552a", { segments: 16 });
  b.torus(0.44, 0.03, "#f2e2c0", { at: [0, 0.02, 0], turn: [Math.PI / 2, 0, 0], segments: 20 });
  b.torus(0.38, 0.022, "#ffd23f", { at: [0, -0.14, 0], turn: [Math.PI / 2, 0, 0], segments: 20 });
  // A garland of marigolds round the neck, and curd at the brim.
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    b.ball(0.07, i % 2 ? "#ff8a1f" : "#ffd23f", { at: [Math.cos(angle) * 0.27, 0.34, Math.sin(angle) * 0.27] });
  }
  b.ball(0.22, "#fbf6ea", { at: [0, 0.48, 0], scale: [1, 0.3, 1] });
  return b.finish();
}

// Two poles and a rope between them, sagging to where the pot hangs.
function rigging(world, height) {
  const b = forge();
  const span = 7.5;
  for (const x of [-span, span]) {
    b.cyl(0.14, height + 1, "#5b3a22", { top: 0.1, at: [x, (height + 1) / 2, -0.4] });
    b.cyl(0.32, 0.16, "#4a2f1b", { at: [x, 0.08, -0.4] });
  }
  b.tube([[-span, height + 0.8, -0.4], [-span / 2, height + 0.3, -0.2], [0, height, 0], [span / 2, height + 0.3, -0.2], [span, height + 0.8, -0.4]], 0.03, "#d9c79c", { steps: 24 });
  for (let i = -6; i <= 6; i += 1) {
    if (i === 0) continue;
    const t = Math.abs(i) / 6;
    b.ball(0.11, i % 2 ? "#ff8a1f" : "#ffd23f", { at: [i * (span / 6.4), height + t * t * 0.8 - 0.1, -0.2 * t] });
  }
  return world.dress(b.finish());
}

function plaza(world) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(7, 48), world.material(world.data.platform[0], { roughness: 0.9 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.receiveShadow = true;
  return world.dress(mesh);
}

export const handi = {
  async build({ scene, camera, world, hero, fx, focusShadow, spec, accent }) {
    const { tiers, pots } = spec.tuning;
    const highest = tiers + pots - 1;
    scene.add(plaza(world), world.ring({ inner: 12 }), rigging(world, (highest + 1) * TIER_H + POT_ABOVE));

    const shapes = SHIRTS.flatMap((shirt) => SKINS.map((skin) => world.dress(climber(shirt, skin))));
    const shirtOf = (tier, index) => shapes[(tier % SHIRTS.length) * SKINS.length + (index % SKINS.length)];

    // Each tier hangs from the one below, so a lean bends the whole tower rather than tipping a pole.
    const base = new THREE.Group();
    scene.add(base);
    const layers = [];
    let holder = base;
    for (let tier = 0; tier < highest; tier += 1) {
      const layer = new THREE.Group();
      layer.position.y = tier ? TIER_H : 0;
      holder.add(layer);
      holder = layer;
      layers.push(layer);
    }
    let built = 0;
    const raise = (count) => {
      if (count === built) return;
      built = count;
      layers.forEach((layer, tier) => {
        layer.clear();
        if (tier + 1 < layers.length) layer.add(layers[tier + 1]);
        if (tier >= count) return;
        const radius = (count - 1 - tier) * RING_STEP;
        const people = Math.max(1, Math.round((Math.PI * 2 * radius) / PERSON_M));
        for (let i = 0; i < people; i += 1) {
          const angle = (i / people) * Math.PI * 2 + tier * 0.4;
          const person = shirtOf(tier, i).clone(true);
          person.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
          person.rotation.y = angle + Math.PI;
          layer.add(person);
        }
      });
    };

    // Crowd on the ground, cheering in a loose ring.
    const cheerer = SHIRTS.map((shirt, index) => world.dress(climber(shirt, SKINS[index % SKINS.length], { cheering: true })));
    for (let i = 0; i < CROWD; i += 1) {
      const angle = Math.PI * (1.1 + (i / (CROWD - 1)) * 0.8);
      const radius = 5.6 + (i % 3) * 0.7;
      const person = cheerer[i % cheerer.length].clone(true);
      person.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius - 0.5);
      person.rotation.y = -angle - Math.PI / 2;
      scene.add(person);
    }

    const pot = world.dress(potModel());
    scene.add(pot);
    const sling = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), world.material("#d9c79c"));
    scene.add(world.dress(sling));

    hero.root.rotation.y = Math.PI;
    hero.play("Idle_Loop");
    const words = { lean: alarmCard("HANDS UP"), jump: alarmCard("JUMP") };
    for (const card of Object.values(words)) {
      card.scale.set(2.6, 1.05, 1);
      card.visible = false;
      scene.add(card);
    }

    let shownTier = -1;
    let climb = 0;
    const climbFrom = new THREE.Vector3();
    let steady = 0;
    let sway = 0;
    let topY = 0;
    let eyeY = 2.6;
    let wasPhase = null;
    let smashS = 0;
    const seat = new THREE.Vector3();
    const place = new THREE.Vector3();
    const wordAt = new THREE.Vector3();

    const standOn = (state, out) => {
      if (state.tier === 0) return out.set(SIDE_X, 0, 1.2);
      layers[state.tier - 1].getWorldPosition(out);
      out.y += TIER_H + 0.02;
      out.z += (potHeight(state) - state.tier) * RING_STEP + 0.3; // on the face of the tower, towards the player
      return out;
    };

    return {
      update(state, dt, elapsed) {
        const needed = potHeight(state);
        raise(needed);
        const potY = (needed + 1) * TIER_H + POT_ABOVE - 1.1;
        topY = damp(topY, potY, 3, dt);

        sway = damp(sway, state.sway, 10, dt);
        const shiver = Math.abs(state.sway) >= LEAN_AT ? Math.sin(elapsed * 26) * 0.02 : 0;
        base.rotation.z = -sway * TIER_BEND - shiver;
        for (const layer of layers) layer.rotation.z = -sway * TIER_BEND;
        base.updateMatrixWorld(true);

        standOn(state, place);
        if (state.tier !== shownTier) {
          if (shownTier >= 0) {
            climbFrom.copy(hero.root.position);
            climb = CLIMB_S;
          }
          shownTier = state.tier;
        }
        climb = Math.max(0, climb - dt);
        if (climb > 0) {
          const p = 1 - climb / CLIMB_S;
          seat.lerpVectors(climbFrom, place, p);
          seat.y += Math.sin(p * Math.PI) * 0.9;
        } else seat.copy(place);
        hero.root.position.copy(seat);
        hero.root.rotation.z = state.tier ? -sway * TIER_BEND * state.tier : 0;
        if (state.phase !== wasPhase && climb <= 0 && state.finaleMs <= 0) {
          wasPhase = state.phase;
          hero.play(state.phase === "call" ? "Crouch_Idle_Loop" : "Idle_Loop", { fade: 0.12 });
        }
        steady = Math.max(0, steady - dt);
        if (steady > 0) applyPose(hero, MOVE_POSES.hands_up(0.5), { flip: true });
        if (state.finaleMs > 0) applyPose(hero, MOVE_POSES.hands_up(0.5), { flip: true });

        const swing = Math.sin(elapsed * 1.5) * 0.14;
        smashS = Math.max(0, smashS - dt);
        pot.visible = smashS <= 0 && state.finaleMs <= 0;
        pot.position.set(swing, topY, 0);
        pot.rotation.z = swing * 0.5;
        sling.visible = pot.visible;
        sling.scale.y = 1;
        sling.position.set(swing * 0.5, topY + 0.95, 0);
        sling.rotation.z = -swing * 0.5;

        const leaning = Math.abs(state.sway) >= LEAN_AT;
        wordAt.set(seat.x > 1 ? seat.x - 3.4 : seat.x + 2.8, seat.y + 1.2, 1.2);
        words.lean.visible = leaning;
        words.jump.visible = !leaning && state.phase === "window";
        words.lean.position.copy(wordAt);
        words.jump.position.copy(wordAt);

        eyeY = damp(eyeY, Math.max(2.4, seat.y + 0.8), 2.4, dt);
        const back = 8.6 + needed * 0.75;
        camera.position.set(0.6, eyeY - 0.2, back);
        // The pot is the point of it, so it stays in frame however low the climb has got.
        const reach = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * back;
        camera.lookAt(0, Math.max(eyeY + 0.35, topY - reach * 0.68), 0);
        focusShadow(0, 0, 0);
      },
      event(event, state) {
        const at = hero.root.position;
        if (event.type === "climb" || event.type === "perfect") {
          hero.play("NinjaJump_Start", { once: true, speed: 1.6, fade: 0.06, then: "Idle_Loop" });
          fx.burst({ x: at.x, y: at.y + 1, z: at.z + 0.2 }, event.type === "perfect" ? "#ffd23f" : accent, event.type === "perfect" ? 30 : 14);
        }
        if (event.type === "clear") {
          steady = STEADY_S;
          fx.burst({ x: at.x, y: at.y + 2, z: at.z }, "#a8e8ff", event.close ? 26 : 10);
        }
        if (event.type === "wrong" || event.type === "miss") fx.shake(0.16);
        if (event.type === "fall") {
          hero.play("Hit_Knockback", { once: true, speed: 1.3, fade: 0.06, then: "Idle_Loop" });
          fx.shake(0.6);
          fx.flash("#ff3b4e", 0.32);
        }
        if (event.type === "smash") {
          smashS = POT_BACK_S;
          fx.flash("#fff8e6", 0.6);
          fx.shake(0.4);
          const y = topY;
          fx.burst({ x: 0, y, z: 0 }, "#fbf6ea", 80);
          fx.burst({ x: 0, y, z: 0 }, "#b5552a", 40);
          fx.burst({ x: 0, y, z: 0 }, "#ffd23f", 30);
        }
        if (event.type === "end" && !state.won) hero.play("Death01", { once: true });
      },
    };
  },
};
