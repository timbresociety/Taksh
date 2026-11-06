// Browser-only loader for the compressed CC0 assets in public/assets. Files load once and are shared.
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

export function loadAsset(id) {
  if (!cache.has(id)) cache.set(id, loader.loadAsync(`/assets/${id}.glb`));
  return cache.get(id);
}
