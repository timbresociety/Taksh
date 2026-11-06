// What a player can ask for and play the same minute: a world, an art style or a character, made only
// of parts the game already has. Checked on the server after the model drafts it, and again by
// validateSpec whenever a spec carrying it loads, so nothing a client sends is trusted unchecked.
import { BODIES, HAIR, SKIN_TONES, STYLES, WORLDS } from "../spec/contract.js";
import { PROP_NAMES } from "../stage/props/index.js";
import { LOOKS } from "../stage/styles.js";
import { checkWorld } from "../stage/world-check.js";
import { WORLD_LOOKS } from "../stage/worlds.js";
import { MADE_ID } from "./made-id.js";

const COLOUR = /^#[0-9a-f]{6}$/i;
const isColour = (value) => typeof value === "string" && COLOUR.test(value);
const isText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const inRange = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const BASE_WORLDS = WORLDS.map((world) => world.id);
const BASE_STYLES = STYLES.map((style) => style.id);

// Every part a world already uses for a role, exactly as written there. A made world may only cast
// from these, so every model it asks for exists, at a size that has already been seen in play.
const CAST = ["far", "near", "low", "wall", "high", "pickup", "hazard"];
export const ROLE_PARTS = Object.fromEntries(CAST.map((role) => [
  role,
  [...new Set(BASE_WORLDS.flatMap((id) => [WORLD_LOOKS[id][role] ?? []].flat()))].filter((entry) => entry !== "house").sort(),
]));
const ROLE_COUNTS = { far: [1, 8], near: [1, 12], low: [1, 5], wall: [1, 4], high: [0, 3] };

// What each kit holds, as far as a made world can reach: every part a base world uses, since a made
// world keeps its base's lines, walls and backdrop.
const KIT_MODELS = {};
const baseEntries = BASE_WORLDS.flatMap((id) => {
  const look = WORLD_LOOKS[id];
  return [...[...CAST, "behind", "walls"].flatMap((key) => [look[key] ?? []].flat()), ...(look.lines ?? []).flatMap((line) => [line.entry].flat())];
});
for (const entry of baseEntries.filter((item) => item !== "house")) {
  const [kit, name] = entry.split("@")[0].split(":");
  if (kit === "proc") continue;
  (KIT_MODELS[kit] ??= new Set()).add(name);
}

export const slug = (text) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "made";
export { MADE_ID };

export function worldLook(made) {
  const base = WORLD_LOOKS[made.base];
  const parts = CAST.flatMap((role) => [made[role] ?? []].flat());
  const kits = [...new Set([...base.kits, ...parts.filter((entry) => !entry.startsWith("proc:")).map((entry) => entry.split(":")[0])])];
  return {
    ...base,
    kits,
    sky: made.sky, haze: made.haze, ground: made.ground, path: made.path, line: made.line, accent: made.accent,
    sun: { ...base.sun, colour: made.sun.colour, power: made.sun.power },
    fill: { sky: made.fill.sky, ground: made.fill.ground, power: made.fill.power },
    far: made.far, near: made.near, low: made.low, wall: made.wall,
    high: made.high?.length ? made.high : base.high,
    pickup: made.pickup, hazard: made.hazard,
  };
}

export function checkMadeWorld(made) {
  const problems = [];
  if (!made || typeof made !== "object") return ["The world is missing."];
  if (!MADE_ID.test(made.id ?? "") || !made.id.startsWith("made-world-")) problems.push("id is not a made-world id.");
  if (!isText(made.label, 30)) problems.push("label must be text of at most 30 characters.");
  if (!isText(made.blurb, 90)) problems.push("blurb must be text of at most 90 characters.");
  if (!BASE_WORLDS.includes(made.base)) problems.push(`base "${made.base}" is not a world: use one of ${BASE_WORLDS.join(", ")}.`);
  if (!Array.isArray(made.sky) || made.sky.length !== 2 || !made.sky.every(isColour)) problems.push("sky must be two #rrggbb colours, top then horizon.");
  for (const key of ["haze", "ground", "path", "line", "accent"]) if (!isColour(made[key])) problems.push(`${key} must be a #rrggbb colour.`);
  if (!isColour(made.sun?.colour) || !inRange(made.sun?.power, 0.8, 4)) problems.push("sun needs a colour and a power from 0.8 to 4.");
  if (!isColour(made.fill?.sky) || !isColour(made.fill?.ground) || !inRange(made.fill?.power, 0.8, 2.2)) problems.push("fill needs sky and ground colours and a power from 0.8 to 2.2.");
  for (const [role, [min, max]] of Object.entries(ROLE_COUNTS)) {
    const list = made[role] ?? [];
    if (!Array.isArray(list) || list.length < min || list.length > max) {
      problems.push(`${role} must list ${min} to ${max} parts.`);
      continue;
    }
    for (const entry of list) if (!ROLE_PARTS[role].includes(entry)) problems.push(`${role} part "${entry}" is not in the catalogue for ${role}.`);
  }
  for (const role of ["pickup", "hazard"]) if (!ROLE_PARTS[role].includes(made[role])) problems.push(`${role} "${made[role]}" is not in the catalogue for ${role}.`);
  if (problems.length) return problems;
  return checkWorld(made.label, worldLook(made), { props: PROP_NAMES, models: KIT_MODELS });
}

export const POST_RANGES = {
  saturation: [0, 1.6], vignette: [0, 0.5], ink: [0, 1], posterise: [0, 12], halftone: [0, 1], pixel: [0, 8], grain: [0, 0.08],
};
export const MATERIALS = ["standard", "toon", "clay", "neon"];

export function styleLook(made) {
  const base = LOOKS[made.base];
  const post = { ...made.post };
  if (!post.posterise) delete post.posterise;
  if (!post.pixel) delete post.pixel;
  return {
    material: made.material, post, bloom: made.bloom, exposure: made.exposure, light: made.light,
    ...(made.material === "neon" && base.sky ? { sky: base.sky, haze: base.haze } : {}),
  };
}

export function checkMadeStyle(made) {
  const problems = [];
  if (!made || typeof made !== "object") return ["The style is missing."];
  if (!MADE_ID.test(made.id ?? "") || !made.id.startsWith("made-style-")) problems.push("id is not a made-style id.");
  if (!isText(made.label, 24)) problems.push("label must be text of at most 24 characters.");
  if (!isText(made.blurb, 80)) problems.push("blurb must be text of at most 80 characters.");
  if (!BASE_STYLES.includes(made.base)) problems.push(`base "${made.base}" is not a style: use one of ${BASE_STYLES.join(", ")}.`);
  if (!MATERIALS.includes(made.material)) problems.push(`material must be one of ${MATERIALS.join(", ")}.`);
  const post = made.post ?? {};
  for (const [key, [min, max]] of Object.entries(POST_RANGES)) if (!inRange(post[key], min, max)) problems.push(`post.${key} must be from ${min} to ${max}.`);
  if (!isColour(post.inkColour)) problems.push("post.inkColour must be a #rrggbb colour.");
  if (inRange(post.posterise, 0.01, 2.99)) problems.push("post.posterise must be 0 (off) or 3 to 12.");
  if (inRange(post.pixel, 0.01, 1.99)) problems.push("post.pixel must be 0 (off) or 2 to 8.");
  if (!inRange(made.bloom, 0, 1)) problems.push("bloom must be from 0 to 1.");
  if (!inRange(made.exposure, 0.7, 1.3)) problems.push("exposure must be from 0.7 to 1.3.");
  if (!inRange(made.light, 0.25, 1.2)) problems.push("light must be from 0.25 to 1.2.");
  if (problems.length) return problems;
  // A player has to see the next obstacle from across the room.
  // Neon models light themselves, so a neon world may be dark as long as the glow carries the shapes.
  if (made.material !== "neon" && made.exposure * made.light < 0.5) problems.push("The style is too dark to play: raise exposure or light so exposure × light is at least 0.5.");
  if (made.material === "neon" && made.bloom < 0.3 && post.ink < 0.5) problems.push("A neon style needs bloom of 0.3 or more, or ink of 0.5 or more, so shapes still read.");
  const noise = (post.pixel >= 2 ? post.pixel / 8 : 0) + (post.posterise >= 3 ? (12 - post.posterise) / 9 : 0) + post.grain / 0.08 + post.halftone;
  if (noise > 1.8) problems.push("Too many effects are stacked: the scene turns to mush. Drop one of pixel, posterise, grain or halftone.");
  return problems;
}

export function checkMadeCharacter(made) {
  const problems = [];
  if (!made || typeof made !== "object") return ["The character is missing."];
  if (!isText(made.name, 30)) problems.push("name must be text of at most 30 characters.");
  if (!isText(made.blurb, 120)) problems.push("blurb must be text of at most 120 characters.");
  if (!BODIES.some((body) => body.id === made.body)) problems.push(`body "${made.body}" is not a body: use one of ${BODIES.map((body) => body.id).join(", ")}.`);
  if (!HAIR.includes(made.hair)) problems.push(`hair "${made.hair}" is not a hairstyle: use one of ${HAIR.join(", ")}.`);
  for (const key of ["skinTone", "hairColour", "top", "bottom", "shoes"]) if (!isColour(made[key])) problems.push(`${key} must be a #rrggbb colour.`);
  return problems;
}

export const characterSkin = ({ body, hair, skinTone, hairColour, top, bottom, shoes }) => ({ body, hair, skinTone, hairColour, top, bottom, shoes });

// A spec may carry the made world and style it uses. Checked whole, so one repair can fix everything.
export function checkMade(made) {
  if (made === undefined) return [];
  if (!made || typeof made !== "object" || Array.isArray(made)) return ["made must be an object."];
  const problems = [];
  for (const key of Object.keys(made)) if (!["world", "style"].includes(key)) problems.push(`made.${key} is not something a spec can carry.`);
  if (made.world !== undefined) problems.push(...checkMadeWorld(made.world).map((problem) => `made.world: ${problem}`));
  if (made.style !== undefined) problems.push(...checkMadeStyle(made.style).map((problem) => `made.style: ${problem}`));
  return problems;
}

// Puts a spec's made world and style where the stage looks things up. Browser only, after checking.
export function registerMade(spec) {
  if (spec.made?.world) WORLD_LOOKS[spec.made.world.id] = worldLook(spec.made.world);
  if (spec.made?.style) LOOKS[spec.made.style.id] = styleLook(spec.made.style);
}

export { SKIN_TONES };
