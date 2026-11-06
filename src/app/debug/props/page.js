"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createCharacter } from "@/lib/stage/character";
import { addCrown, addHeads, addHorns } from "@/lib/stage/props/bosses";
import { PROP_NAMES, makeProp } from "@/lib/stage/props/index";
import { applyLook } from "@/lib/stage/styles";
import { WORLD_LOOKS } from "@/lib/stage/worlds";

const LOOK = { hair: "buzzed", skinTone: "#a86e4a", hairColour: "#16100c", top: "#000000", bottom: "#000000", shoes: "#000000" };

// Lines up procedural props beside a 1.8m character, so scale and detail can be judged up close.
// Query: props (comma list, default all), cast (comma list of bodies, or "ravana"), clip, style, world,
// gap, camera ("x,y,z,atX,atY,atZ"), and fov.
export default function PropsReview() {
  const host = useRef(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const style = query.get("style") ?? "bright";
    const id = query.get("world") ?? "mumbai";
    const data = WORLD_LOOKS[id];
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    host.current.replaceChildren(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(query.get("sky") ?? "#b9c9d4");
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.25;
    scene.add(new THREE.HemisphereLight("#f2f4ff", "#8a8474", 1.7));
    const sun = new THREE.DirectionalLight("#fff4df", 2.8);
    sun.position.set(14, 26, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 120 });
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#c2c0b8" }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const names = query.get("props")?.split(",").filter(Boolean) ?? (query.has("cast") ? [] : PROP_NAMES);
    const gap = Number(query.get("gap") ?? 1);
    let x = 0;
    const row = names.map((name) => {
      const object = makeProp(name, { id, data });
      const width = object.userData.size[0];
      object.position.x = x + width / 2;
      x += width + gap;
      object.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = !node.userData.flat;
        node.receiveShadow = true;
      });
      applyLook(object, style);
      scene.add(object);
      return object;
    });
    for (const object of row) object.position.x -= x / 2;

    const camera = new THREE.PerspectiveCamera(Number(query.get("fov") ?? 32), innerWidth / innerHeight, 0.1, 400);
    const view = query.get("camera")?.split(",").map(Number) ?? [0, 3, Math.max(8, x * 1.1), 0, 1, 0];
    camera.position.set(view[0], view[1], view[2]);
    camera.lookAt(view[3], view[4], view[5]);

    const cast = [];
    let alive = true;
    (async () => {
      const bodies = (query.get("cast") ?? "athlete-male").split(",");
      const made = await Promise.all(bodies.map((body) => createCharacter({ ...LOOK, body: body === "ravana" ? "peasant-male" : body })));
      made.forEach((character, index) => {
        character.root.position.x = (index - (made.length - 1) / 2) * Number(query.get("spacing") ?? 1.4) - (names.length ? x / 2 + 1 : 0);
        if (bodies[index] === "ravana") {
          addHeads(character, 10, { separate: query.has("separate") });
          addCrown(character);
          addHorns(character);
          character.root.scale.setScalar(Number(query.get("boss") ?? 1));
        }
        applyLook(character.root, style);
        scene.add(character.root);
        character.play(query.get("clip") ?? "Idle_Loop");
        cast.push(character);
      });
      window.__rigReady = true;
    })().catch((error) => {
      console.error(error);
      window.__rigError = `${error.message}\n${error.stack}`;
    });

    let last = performance.now();
    function frame(now = last) {
      if (!alive) return;
      for (const character of cast) character.update((now - last) / 1000);
      last = now;
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    frame();
    return () => {
      alive = false;
      renderer.dispose();
    };
  }, []);

  return <div ref={host} style={{ position: "fixed", inset: 0 }} />;
}
