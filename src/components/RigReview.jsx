"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createCharacter } from "@/lib/stage/character";

const SKIN = ["#f2c9a5", "#d9a074", "#a86e4a", "#6e4630"];
const CAST = [
  { look: { body: "athlete-female", hair: "buns", skinTone: SKIN[1], hairColour: "#2b1c14", top: "#ff4f6d", bottom: "#1f2a55", shoes: "#f5f7fb" }, clip: "Idle_Loop" },
  { look: { body: "athlete-male", hair: "buzzed", skinTone: SKIN[2], hairColour: "#16100c", top: "#2f6bff", bottom: "#141a33", shoes: "#ffd23f" }, clip: "Punch_Cross" },
  { look: { body: "athlete-female", hair: "long", skinTone: SKIN[0], hairColour: "#c8742b", top: "#21c48d", bottom: "#ffffff", shoes: "#141a33" }, clip: "Sprint_Loop" },
  { look: { body: "ranger-male", hair: "simple-parted", skinTone: SKIN[3], hairColour: "#16100c", top: "#000000", bottom: "#000000", shoes: "#000000" }, clip: "Jump_Loop" },
  { look: { body: "ranger-female", hair: "long", skinTone: SKIN[1], hairColour: "#5d3a1e", top: "#000000", bottom: "#000000", shoes: "#000000" }, clip: "Idle_Loop" },
  { look: { body: "peasant-male", hair: "buzzed", skinTone: SKIN[0], hairColour: "#5d3a1e", top: "#000000", bottom: "#000000", shoes: "#000000" }, clip: "Dance_Loop" },
  { look: { body: "peasant-female", hair: "buns", skinTone: SKIN[2], hairColour: "#16100c", top: "#000000", bottom: "#000000", shoes: "#000000" }, clip: "Idle_Loop" },
];

export default function RigReview() {
  const canvas = useRef(null);

  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ canvas: canvas.current, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(canvas.current.clientWidth, canvas.current.clientHeight, false);
    renderer.shadowMap.enabled = true;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#9fc9ee");
    const camera = new THREE.PerspectiveCamera(32, canvas.current.clientWidth / canvas.current.clientHeight, 0.1, 100);
    camera.position.set(0, 1.25, 9.6);
    camera.lookAt(0, 0.95, 0);
    scene.add(new THREE.HemisphereLight("#ffffff", "#7d8fa3", 1.5));
    const sun = new THREE.DirectionalLight("#fff4df", 2.6);
    sun.position.set(3, 6, 5);
    sun.castShadow = true;
    sun.shadow.camera.left = -6;
    sun.shadow.camera.right = 6;
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: "#d9e4ef" }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    let alive = true;
    const cast = [];
    Promise.all(CAST.map(({ look }) => createCharacter(look))).then((made) => {
      made.forEach((character, i) => {
        character.root.position.x = (i - (made.length - 1) / 2) * 1.25;
        scene.add(character.root);
        character.play(CAST[i].clip);
        cast.push(character);
      });
      window.__rigReady = true;
    }).catch((error) => {
      window.__rigError = error.message;
    });

    const clock = new THREE.Clock();
    function frame() {
      if (!alive) return;
      const delta = clock.getDelta();
      for (const character of cast) character.update(delta);
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    frame();
    return () => {
      alive = false;
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvas} style={{ width: "100vw", height: "100vh", display: "block" }} />;
}
