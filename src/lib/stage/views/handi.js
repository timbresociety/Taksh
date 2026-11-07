// Dahi Handi: a human tower in matching shirts, a pot of curd on a rope, and the hero climbing to it.
// A card beside the tower always names the next move, and every move answers with a word of its own.
import * as THREE from "three";
import { LEAN_AT, atTop, potHeight, wobbling } from "../../templates/handi.js";
import { MOVE_POSES, applyPose } from "../coach.js";
import { forge } from "../props/forge.js";
import { damp } from "./shared.js";

const TIER_H = 1.4; // a shoulder to the next pair of feet
const RING_STEP = 0.56; // how far each tier stands in from the one under it
const PERSON_M = 0.95;
const POT_ABOVE = 2.5;
const SIDE_X = 2.1; // where the climber waits, beside the tower
const CLIMB_S = 0.45;
const DOWN_S = 0.8;
const LEAP_S = 0.5;
const STEADY_S = 0.5;
const TOP_HOLD_S = 1.4; // the hero stays up with the broken pot a moment before the next tower is built
const POT_BACK_S = 2.4;
const POP_S = 0.9;
const CHEER_S = 2.2;
const TIER_BEND = 0.08;
const CROWD = 16;
const SHARDS = 9;
const MIN_BACK = 9;
const FRAME_SLACK = 1.3; // of the span from the hero's feet to the top of the pot
const SHIRTS = ["#e8791a", "#d8342c", "#f2b705", "#1f8f6a"];
const SKINS = ["#a86e4a", "#6e4630", "#d9a074"];
const GO = "#1f8f4a";
const STOP = "#b5121f";
const GOLD = "#c75a00";
const CALM = "#1f6fb5";

// A word on a rounded card, drawn on top of everything. Long words shrink to fit the card.
function sign(word, fill) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 208;
  const pen = canvas.getContext("2d");
  pen.fillStyle = fill;
  pen.beginPath();
  pen.roundRect(10, 10, 620, 188, 36);
  pen.fill();
  pen.strokeStyle = "#fff4d6";
  pen.lineWidth = 10;
  pen.stroke();
  let size = 120;
  pen.font = `900 ${size}px system-ui, sans-serif`;
  while (pen.measureText(word).width > 560 && size > 40) {
    size -= 6;
    pen.font = `900 ${size}px system-ui, sans-serif`;
  }
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  pen.fillStyle = "#fff4d6";
  pen.fillText(word, 320, 110);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, fog: false, toneMapped: false }));
  sprite.userData.keepMaterial = true;
  sprite.renderOrder = 8;
  sprite.visible = false;
  return sprite;
}

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

// The pot in pieces, flung out from where it hung.
function shards(world) {
  return Array.from({ length: SHARDS }, (_, i) => {
    const b = forge();
    b.box(0.26, 0.2, 0.05, i % 3 ? "#b5552a" : "#f2e2c0");
    const piece = world.dress(b.finish());
    piece.visible = false;
    piece.userData.spin = new THREE.Vector3();
    piece.userData.velocity = new THREE.Vector3();
    return piece;
  });
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

    // Crowd on the ground, cheering in a loose ring, and jumping for joy when a pot goes.
    const cheerer = SHIRTS.map((shirt, index) => world.dress(climber(shirt, SKINS[index % SKINS.length], { cheering: true })));
    const crowd = [];
    for (let i = 0; i < CROWD; i += 1) {
      const angle = Math.PI * (1.1 + (i / (CROWD - 1)) * 0.8);
      const radius = 5.6 + (i % 3) * 0.7;
      const person = cheerer[i % cheerer.length].clone(true);
      person.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius - 0.5);
      person.rotation.y = -angle - Math.PI / 2;
      scene.add(person);
      crowd.push(person);
    }

    const pot = world.dress(potModel());
    scene.add(pot);
    const sling = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), world.material("#d9c79c"));
    scene.add(world.dress(sling));
    const pieces = shards(world);
    scene.add(...pieces);

    hero.root.rotation.y = Math.PI;
    // A marker over the hero's head in the hero's own shirt colour, seen through the crowd, so a player can find
    // themselves on a tower of dozens.
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 4), new THREE.MeshBasicMaterial({ color: spec.skin.hero.top ?? accent, depthTest: false, fog: false, toneMapped: false }));
    marker.rotation.x = Math.PI;
    marker.renderOrder = 8;
    marker.userData.keepMaterial = true;
    scene.add(marker);
    hero.play("Idle_Loop");

    // The guide by the player shows the next move. The pops answer the move just made.
    const pops = { up: sign("UP A TIER", GO), shaky: sign("TOO WOBBLY", STOP), steady: sign("STEADY", CALM), saved: sign("SAVED", CALM), fell: sign("FELL", STOP), smash: sign("SMASH!", GOLD) };
    const popAt = new Map();
    scene.add(...Object.values(pops));
    // One answer at a time, so a quick pair of moves never stacks two words over the hero.
    const pop = (card, at, big = 1) => {
      for (const shown of popAt.keys()) shown.visible = false;
      popAt.clear();
      card.position.copy(at);
      card.userData.big = big;
      popAt.set(card, POP_S);
    };

    let shownTier = 0;
    let shownHeight = potHeight({ tiers, pot: 0 });
    let move = 0;
    let moveS = CLIMB_S;
    let rising = true;
    const moveFrom = new THREE.Vector3();
    let leap = 0;
    let steady = 0;
    let topHold = 0;
    let smashS = 0;
    let cheer = 0;
    let sway = 0;
    let topY = 0;
    let eyeY = 4;
    let back = MIN_BACK;
    let pose = null;
    const seat = new THREE.Vector3();
    const place = new THREE.Vector3();
    const popFrom = new THREE.Vector3();

    const standOn = (tier, height, out) => {
      if (tier === 0) return out.set(SIDE_X, 0, 1.2);
      layers[tier - 1].getWorldPosition(out);
      out.y += TIER_H + 0.02;
      out.z += (height - tier) * RING_STEP + 0.1; // on the shoulders at the face of the tower, towards the player
      return out;
    };
    const potYFor = (height) => (height + 1) * TIER_H + POT_ABOVE - 1.1;
    const animate = (name) => {
      if (name === pose) return;
      pose = name;
      hero.play(name, { fade: 0.15 });
    };

    return {
      update(state, dt, elapsed) {
        // After a pot breaks the hero stays up there with it a moment, and only then is the next tower built.
        topHold = Math.max(0, topHold - dt);
        const height = topHold > 0 ? shownHeight : potHeight(state);
        const tier = topHold > 0 ? shownTier : state.tier;
        shownHeight = height;
        raise(height);
        topY = damp(topY, potYFor(height), 3, dt);

        sway = damp(sway, state.sway, 10, dt);
        const shiver = Math.abs(state.sway) >= LEAN_AT ? Math.sin(elapsed * 26) * 0.02 : 0;
        base.rotation.z = -sway * TIER_BEND - shiver;
        for (const layer of layers) layer.rotation.z = -sway * TIER_BEND;
        base.updateMatrixWorld(true);

        standOn(tier, height, place);
        if (tier !== shownTier) {
          moveFrom.copy(hero.root.position);
          rising = tier > shownTier;
          moveS = rising ? CLIMB_S : DOWN_S;
          move = moveS;
          shownTier = tier;
        }
        move = Math.max(0, move - dt);
        if (move > 0) {
          const p = 1 - move / moveS;
          seat.lerpVectors(moveFrom, place, rising ? p : p * p * (3 - 2 * p));
          if (rising) seat.y += Math.sin(p * Math.PI) * 0.9;
        } else seat.copy(place);
        leap = Math.max(0, leap - dt);
        if (leap > 0) seat.y += Math.sin((1 - leap / LEAP_S) * Math.PI) * 0.8;
        hero.root.position.copy(seat);
        marker.position.set(seat.x, seat.y + 2.25 + Math.abs(Math.sin(elapsed * 4)) * 0.15, seat.z);
        marker.rotation.y = elapsed * 2;
        marker.scale.setScalar(back / 12);
        marker.visible = state.finaleMs <= 0 && tier < height; // right under the pot, the hero needs no finding
        hero.root.rotation.z = tier ? -sway * TIER_BEND * tier : 0;

        // Crouched and ready while the tower stands straight, upright and holding on while it wobbles.
        const playing = state.phase === "climb" && state.finaleMs <= 0 && topHold <= 0;
        if (move <= 0 && leap <= 0) animate(playing && !wobbling(state) ? "Crouch_Idle_Loop" : "Idle_Loop");
        steady = Math.max(0, steady - dt);
        if (steady > 0 || state.finaleMs > 0 || topHold > 0) applyPose(hero, MOVE_POSES.hands_up(0.5), { flip: true });

        const swing = Math.sin(elapsed * 1.5) * 0.14;
        smashS = Math.max(0, smashS - dt);
        pot.visible = smashS <= 0 && state.finaleMs <= 0;
        // The pot swells a little in time while one more jump would break it.
        const ready = playing && atTop(state) && !wobbling(state);
        pot.scale.setScalar(ready ? 1 + Math.abs(Math.sin(elapsed * 5)) * 0.12 : 1);
        pot.position.set(swing, topY, 0);
        pot.rotation.z = swing * 0.5;
        sling.visible = pot.visible;
        sling.position.set(swing * 0.5, topY + 0.95, 0);
        sling.rotation.z = -swing * 0.5;
        for (const piece of pieces) {
          if (!piece.visible) continue;
          const { velocity, spin } = piece.userData;
          velocity.y -= 9.8 * dt;
          piece.position.addScaledVector(velocity, dt);
          piece.rotation.x += spin.x * dt;
          piece.rotation.z += spin.z * dt;
          if (piece.position.y < 0.05) piece.visible = false;
        }

        cheer = Math.max(0, cheer - dt);
        crowd.forEach((person, i) => {
          person.position.y = cheer > 0 ? Math.abs(Math.sin(elapsed * 9 + i * 1.7)) * 0.4 * Math.min(1, cheer) : 0;
        });

        // Both ends of the climb stay in frame: the hero's feet and the pot they are climbing to.
        const low = Math.min(seat.y, place.y) - 0.3;
        const high = topY + 1.4;
        const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        back = damp(back, Math.max(MIN_BACK, ((high - low) / 2) * FRAME_SLACK / half), 2.4, dt);
        eyeY = damp(eyeY, (low + high) / 2 + 0.2, 2.4, dt);
        camera.position.set(0.6, eyeY, back);
        camera.lookAt(0, eyeY, 0);
        focusShadow(0, 0, 0);

        const cardScale = back / 12;
        for (const [card, left] of popAt) {
          const life = left - dt;
          if (life <= 0) {
            card.visible = false;
            popAt.delete(card);
            continue;
          }
          popAt.set(card, life);
          const p = 1 - life / POP_S;
          card.visible = true;
          card.position.y += dt * 1.2;
          card.material.opacity = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
          const size = cardScale * card.userData.big * (0.8 + Math.min(1, p * 5) * 0.2);
          card.scale.set(2.6 * size, 0.85 * size, 1);
        }
      },
      event(event, state) {
        const at = hero.root.position;
        // Above the marker, over where the hero is going rather than where they were.
        standOn(state.tier, potHeight(state), popFrom);
        popFrom.y += 3 + 0.4 * (back / 12);
        popFrom.z += 0.4;
        if (event.type === "climb") {
          hero.play("NinjaJump_Start", { once: true, speed: 1.6, fade: 0.06, then: "Idle_Loop" });
          pose = "Idle_Loop";
          fx.burst({ x: at.x, y: at.y + 1, z: at.z + 0.2 }, accent, 16);
          pop(pops.up, popFrom);
        }
        if (event.type === "clear") {
          steady = STEADY_S;
          fx.burst({ x: at.x, y: at.y + 2, z: at.z }, "#a8e8ff", event.close ? 26 : 10);
          if (event.needed) pop(event.close ? pops.saved : pops.steady, popFrom);
        }
        if (event.type === "shaky") {
          fx.shake(0.12);
          pop(pops.shaky, popFrom);
        }
        if (event.type === "fall") {
          hero.play("Hit_Knockback", { once: true, speed: 1.3, fade: 0.06, then: "Idle_Loop" });
          pose = "Idle_Loop";
          fx.shake(0.6);
          fx.flash("#ff3b4e", 0.32);
          pop(pops.fell, popFrom, 1.2);
        }
        if (event.type === "leap") {
          leap = LEAP_S;
          hero.play("NinjaJump_Start", { once: true, speed: 1.4, fade: 0.06, then: "Idle_Loop" });
          pose = "Idle_Loop";
        }
        if (event.type === "smash") {
          smashS = event.last ? Infinity : POT_BACK_S;
          topHold = event.last ? 0 : TOP_HOLD_S;
          cheer = CHEER_S;
          fx.flash("#fff8e6", 0.6);
          fx.shake(0.4);
          const y = topY;
          fx.burst({ x: 0, y, z: 0 }, "#fbf6ea", 90);
          fx.burst({ x: 0, y, z: 0 }, "#b5552a", 40);
          fx.burst({ x: 0, y, z: 0 }, "#ffd23f", 40);
          pieces.forEach((piece, i) => {
            const angle = (i / SHARDS) * Math.PI * 2;
            piece.visible = true;
            piece.position.set(pot.position.x, y, 0);
            piece.userData.velocity.set(Math.cos(angle) * 3, 2.5 + (i % 3), Math.sin(angle) * 2);
            piece.userData.spin.set(4 + i, 0, 3 - i);
          });
          pop(pops.smash, popFrom.set(0, y + 0.9, 0.6), 1.6);
        }
        if (event.type === "end" && state.lives <= 0) hero.play("Death01", { once: true });
      },
    };
  },
};
