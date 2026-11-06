import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PROP_NAMES } from "../src/lib/stage/props/index.js";
import { checkWorld, roadBlockers } from "../src/lib/stage/world-check.js";
import { WORLD_LOOKS } from "../src/lib/stage/worlds.js";
import { WORLDS } from "../src/lib/spec/contract.js";

const nodeNames = (file) => {
  const data = readFileSync(file);
  return new Set(JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString("utf8")).nodes.map((node) => node.name));
};
const models = Object.fromEntries(readdirSync("public/assets/kit").filter((file) => file.endsWith(".glb")).map((file) => [file.replace(".glb", ""), nodeNames(`public/assets/kit/${file}`)]));
const check = (id, world) => checkWorld(id, world, { props: PROP_NAMES, models });

describe("worlds", () => {
  it("every world on offer has a look, and every look is on offer", () => {
    assert.deepEqual(WORLDS.map((world) => world.id).sort(), Object.keys(WORLD_LOOKS).sort());
  });

  for (const [id, world] of Object.entries(WORLD_LOOKS)) {
    it(`${id} fills every role with something that exists`, () => {
      assert.deepEqual(check(id, world), []);
    });
  }

  it("names what is wrong with a broken world", () => {
    const { mumbai } = WORLD_LOOKS;
    assert.match(check("x", { ...mumbai, low: [] })[0], /low role/);
    assert.match(check("x", { ...mumbai, path: "red" })[0], /path is not a colour/);
    assert.match(check("x", { ...mumbai, hazard: "proc:nothing@1" }).join(), /no prop called nothing/);
    assert.match(check("x", { ...mumbai, hazard: "scifi:Prop_Crate@1" }).join(), /needs the scifi kit/);
    assert.match(check("x", { ...mumbai, hazard: "props:Nothing@1" }).join(), /props kit has no Nothing/);
    assert.match(check("x", { ...mumbai, line: mumbai.path }).join(), /lane lines/);
    assert.match(check("x", { ...mumbai, hazard: mumbai.pickup }).join(), /look the same/);
  });
});

describe("the road", () => {
  const block = (width, height, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, 1));
    mesh.position.set(x, y, z);
    mesh.name = "block";
    return mesh;
  };
  const sceneWith = (...meshes) => {
    const scene = new THREE.Scene();
    const scenery = new THREE.Group();
    scenery.name = "scenery";
    scenery.add(...meshes);
    scene.add(scenery);
    return scene;
  };

  it("finds scenery standing in the road", () => {
    assert.deepEqual(roadBlockers(sceneWith(block(1, 2, 1, 1, -20)), 3.7), ["block, 1.0 by 2.0 by 1.0 m, at x 1.0, z -20.0"]);
  });

  it("finds sand lying flat across the road", () => {
    assert.equal(roadBlockers(sceneWith(block(40, 0.05, 0, 0.02, -60)), 3.7).length, 1);
  });

  it("lets a pool of lamplight lie on the road, since nothing there can be hit", () => {
    const pool = block(10, 0.01, 0, 0.05, -60);
    pool.userData.light = true;
    assert.deepEqual(roadBlockers(sceneWith(pool), 3.7), []);
  });

  it("finds tassels hanging low over the road, and lets bunting high above it pass", () => {
    assert.equal(roadBlockers(sceneWith(block(1, 4, 0, 3.5, -30)), 3.7).length, 1);
    assert.deepEqual(roadBlockers(sceneWith(block(12, 0.2, 0, 7, -30)), 3.7), []);
  });

  it("lets the road run under an arch, whose box fills the road but whose faces do not", () => {
    const arch = new THREE.Mesh(mergeGeometries([[0.4, 9, 0.4, -5.5, 4.5], [0.4, 9, 0.4, 5.5, 4.5], [11.4, 0.4, 0.4, 0, 9.2]].map(([width, height, depth, x, y]) => new THREE.BoxGeometry(width, height, depth).translate(x, y, 0))));
    arch.position.z = -30;
    assert.deepEqual(roadBlockers(sceneWith(arch), 3.7), []);
  });

  it("ignores ground lying under the road", () => {
    assert.deepEqual(roadBlockers(sceneWith(block(17, 0.001, 0, 0, -60)), 3.7), []);
  });

  it("leaves the pavement and anything behind the camera alone", () => {
    assert.deepEqual(roadBlockers(sceneWith(block(2, 3, 6, 1.5, -20), block(2, 3, 0, 1.5, 40)), 3.7), []);
  });
});
