// Compresses the CC0 source packs in .asset-src into web-ready files in public/assets, and writes
// public/assets/manifest.json. Run `npm run assets` after fetching packs. See assets/README.md.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, meshopt, prune, resample, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { CATALOG, KITS } from "../assets/catalog.mjs";

const SOURCE = ".asset-src/itch";
const OUT = "public/assets";

function walk(dir, pattern, found = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, pattern, found);
    else if (pattern.test(name)) found.push(path);
  }
  return found;
}

const index = new Map();
function locate(pack, file, within) {
  if (!index.has(pack)) index.set(pack, walk(join(SOURCE, pack), /\.(gltf|glb)$/i));
  const match = index.get(pack).find((path) => basename(path) === file && (!within || path.includes(within)));
  if (!match) throw new Error(`Missing ${pack}/${within ?? ""}/${file}`);
  return match;
}

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const images = new Map();
function findImage(pack, uri) {
  if (!images.has(pack)) images.set(pack, walk(join(SOURCE, pack), /\.(png|jpe?g)$/i));
  const name = basename(decodeURIComponent(uri)).replace(/_png\.png$/i, ".png");
  return images.get(pack).find((path) => basename(path) === name);
}

// Packs keep textures in a shared folder away from each .gltf, so references are resolved by name.
async function read(source, pack) {
  if (source.endsWith(".glb")) return io.read(source);
  const json = JSON.parse(readFileSync(source, "utf8"));
  const resources = {};
  for (const buffer of json.buffers ?? []) resources[buffer.uri] = new Uint8Array(readFileSync(join(dirname(source), decodeURIComponent(buffer.uri))));
  for (const image of json.images ?? []) {
    const path = findImage(pack, image.uri);
    if (!path) throw new Error(`Missing texture ${image.uri} for ${source}`);
    resources[image.uri] = new Uint8Array(readFileSync(path));
  }
  return io.readJSON({ json, resources });
}

async function convert(source, pack, target, { textureSize = 1024, keepMesh = true } = {}) {
  const document = await read(source, pack);
  const root = document.getRoot();
  if (!keepMesh) {
    for (const mesh of root.listMeshes()) mesh.dispose();
    for (const texture of root.listTextures()) texture.dispose();
    for (const material of root.listMaterials()) material.dispose();
  }
  const steps = [dedup(), prune({ keepAttributes: true, keepLeaves: !keepMesh })];
  if (keepMesh) {
    steps.push(textureCompress({ encoder: sharp, targetFormat: "webp", resize: [textureSize, textureSize], quality: 82 }));
    steps.push(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  } else steps.push(resample());
  await document.transform(...steps);
  mkdirSync(dirname(target), { recursive: true });
  await io.write(target, document);
  return statSync(target).size;
}

// Merges every model in a pack into one file, so its shared textures ship once. Each model becomes
// a named node that the stage clones on demand.
async function buildKit(kit) {
  const target = new Document();
  const scene = target.createScene(kit.id);
  const names = [];
  const seen = new Set();
  for (const pack of kit.packs) {
    if (!index.has(pack)) index.set(pack, walk(join(SOURCE, pack), /\.(gltf|glb)$/i));
    for (const path of index.get(pack)) {
      const name = basename(path).replace(/\.(gltf|glb)$/i, "");
      if (kit.within && !path.includes(kit.within)) continue;
      if (kit.skip?.test(name) || seen.has(name)) continue;
      seen.add(name);
      let document;
      try {
        document = await read(path, pack);
      } catch (error) {
        console.log(`Skipped ${name}: ${error.code ?? error.message}`);
        continue;
      }
      const map = mergeDocuments(target, document);
      const merged = map.get(document.getRoot().listScenes()[0]);
      const holder = target.createNode(name);
      for (const child of merged.listChildren()) holder.addChild(child);
      merged.dispose();
      scene.addChild(holder);
      names.push(name);
    }
  }
  // These packs use vertex colour as a weathering mask for an Unreal material, not as colour.
  if (kit.maskColours) {
    for (const mesh of target.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) primitive.setAttribute("COLOR_0", null);
  }
  target.getRoot().setDefaultScene(scene);
  for (const buffer of target.getRoot().listBuffers().slice(1)) buffer.dispose();
  const single = target.getRoot().listBuffers()[0];
  for (const accessor of target.getRoot().listAccessors()) accessor.setBuffer(single);
  await target.transform(
    dedup(),
    prune({ keepAttributes: true, keepLeaves: true }),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [kit.textureSize ?? 1024, kit.textureSize ?? 1024], quality: 80 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  const file = join(OUT, `${kit.id}.glb`);
  mkdirSync(dirname(file), { recursive: true });
  await io.write(file, target);
  return { names, size: statSync(file).size };
}

const only = process.argv[2];
const manifest = { generated: "npm run assets", licence: "CC0 1.0, Quaternius", items: {}, kits: {} };
let total = 0;
for (const item of CATALOG) {
  const target = join(OUT, `${item.id}.glb`);
  manifest.items[item.id] = { url: `/assets/${item.id}.glb`, pack: item.pack, kind: item.kind, source: item.file };
  if (only && !item.id.startsWith(only)) { if (existsSync(target)) total += statSync(target).size; continue; }
  const size = await convert(locate(item.pack, item.file, item.within), item.pack, target, item.options);
  total += size;
  console.log(`${item.id} ${(size / 1024).toFixed(0)} KB`);
}
const previous = existsSync(join(OUT, "manifest.json")) ? JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8")) : { kits: {} };
for (const kit of KITS) {
  if (only && !kit.id.startsWith(only)) {
    if (previous.kits[kit.id]) { manifest.kits[kit.id] = previous.kits[kit.id]; total += statSync(join(OUT, `${kit.id}.glb`)).size; }
    continue;
  }
  const { names, size } = await buildKit(kit);
  manifest.kits[kit.id] = { url: `/assets/${kit.id}.glb`, packs: kit.packs, models: names };
  total += size;
  console.log(`${kit.id} ${names.length} models, ${(size / 1048576).toFixed(1)} MB`);
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`${(total / 1048576).toFixed(1)} MB total`);
