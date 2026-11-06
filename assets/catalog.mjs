// Every shipped asset and where it came from. All packs are CC0 1.0 by Quaternius.
const BASE = "universalbasecharacters";
const OUTFITS = "modularcharacteroutfitsfantasy";

const characters = [
  { id: "character/body-female", pack: BASE, file: "Superhero_Female_FullBody.gltf", within: "Godot - UE" },
  { id: "character/body-male", pack: BASE, file: "Superhero_Male_FullBody.gltf", within: "Godot - UE" },
].map((item) => ({ kind: "body", options: { textureSize: 1024 }, ...item }));

const hair = ["Hair_SimpleParted", "Hair_Long", "Hair_BuzzedFemale", "Hair_Buzzed", "Hair_Buns", "Hair_Beard", "Eyebrows_Female", "Eyebrows_Regular"].map((name) => ({
  id: `character/${name.toLowerCase().replace("_", "-")}`, kind: "hair", pack: BASE, file: `${name}.gltf`, within: "Rigged to Head Bone", options: { textureSize: 512 },
}));

const outfits = ["Female_Peasant", "Female_Ranger", "Male_Peasant", "Male_Ranger"].map((name) => ({
  id: `character/outfit-${name.toLowerCase().replace("_", "-")}`, kind: "outfit", pack: OUTFITS, file: `${name}.gltf`, within: "Outfits", options: { textureSize: 1024 },
}));

const animation = [
  { id: "anim/library-1", pack: "universalanimationlibrary", file: "UAL1_Standard.glb" },
  { id: "anim/library-2", pack: "universalanimationlibrary2", file: "UAL2_Standard.glb" },
].map((item) => ({ kind: "animation", options: { keepMesh: false }, ...item }));

export const CATALOG = [...characters, ...hair, ...outfits, ...animation];

// Each kit ships every model in its packs as one file. A model is reached by its source file name.
export const KITS = [
  { id: "kit/nature", packs: ["stylizednaturemegakit"] },
  { id: "kit/props", packs: ["fantasypropsmegakit"] },
  { id: "kit/scifi", packs: ["scifiessentialskit", "modularscifimegakit"], skip: /^(Gun_|Character)/ },
  { id: "kit/city", packs: ["downtowncitymegakit"], maskColours: true },
  { id: "kit/village", packs: ["medievalvillagemegakit"] },
];
