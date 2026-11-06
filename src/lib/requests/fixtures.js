// Canned answers for request stages, so the workflow, the API and the UI run without a model key. Like
// the game fixtures, they say nothing about how well a real model answers, and results are labelled
// source: "fixture" all the way to the player.
import { BODIES, STYLES } from "../spec/contract.js";
import { LOOKS } from "../stage/styles.js";
import { WORLD_LOOKS } from "../stage/worlds.js";
import { ROLE_PARTS } from "./made.js";

const KIND_WORDS = [
  ["boss", /\b(boss|villain|monster|enemy|demon|dragon|giant|robot)\b/i],
  ["style", /\b(style|look like|looks like|watercolou?r|noir|vhs|retro|sketch|painted|cartoon|anime)\b/i],
  ["character", /\b(character|hero|outfit|dress|costume|player as|play as|avatar)\b/i],
  ["game", /\b(game where|new game|mode|mechanic|minigame|sport)\b/i],
  ["world", /\b(world|place|map|level|beach|city|street|forest|mountain|desert|snow|temple|market|space)\b/i],
];

const BASE_WORDS = [
  ["marine_drive", /\b(beach|sea|goa|coast|shore)\b/i],
  ["forest", /\b(forest|jungle|mountain|snow|himalaya\w*|hill)\b/i],
  ["station", /\b(space|station|cyber\w*|future|neon)\b/i],
  ["moon", /\b(moon|mars|planet)\b/i],
  ["diwali", /\b(diwali|festival|night|lights?)\b/i],
  ["village", /\b(village|old town|fort)\b/i],
  ["mumbai", /\b(mumbai|street|market|bazaar)\b/i],
];

const firstMatch = (table, text, fallback) => table.find(([, pattern]) => pattern.test(text))?.[0] ?? fallback;
const titleFrom = (text, words = 3) => text.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter((word) => word.length > 2).slice(0, words).map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(" ") || "Your Request";

export function fixtureTriage({ text, kind }) {
  return { kind: kind ?? firstMatch(KIND_WORDS, text, "world"), decision: "go", reason: "", brief: text };
}

function world(text) {
  const base = firstMatch(BASE_WORDS, text, "downtown");
  const look = WORLD_LOOKS[base];
  const cast = (role, max) => [look[role] ?? []].flat().filter((entry) => ROLE_PARTS[role].includes(entry)).slice(0, max);
  return {
    label: titleFrom(text, 2), blurb: `${text.slice(0, 60)}, built on ${base.replace("_", " ")}`.slice(0, 90), base,
    sky: [...look.sky], haze: look.haze, ground: look.ground, path: look.path, line: look.line, accent: look.accent,
    sun: { colour: look.sun.colour, power: look.sun.power }, fill: { ...look.fill },
    far: cast("far", 8).length ? cast("far", 8) : [ROLE_PARTS.far[0]], near: cast("near", 12), low: cast("low", 5), wall: cast("wall", 4), high: cast("high", 3),
    pickup: [look.pickup].flat()[0], hazard: [look.hazard].flat()[0],
  };
}

function style(text) {
  const base = /\b(noir|black and white|grey|gray)\b/i.test(text) ? "bright" : /\b(neon|cyber)\b/i.test(text) ? "neon" : "toon";
  const look = LOOKS[base];
  const noir = base === "bright";
  return {
    label: titleFrom(text, 2), blurb: `${STYLES.find((item) => item.id === base).blurb}, reworked`.slice(0, 80), base, material: look.material,
    post: { saturation: noir ? 0 : look.post.saturation ?? 1, vignette: noir ? 0.35 : look.post.vignette ?? 0, ink: look.post.ink ?? 0, inkColour: look.post.inkColour ?? "#15121f", posterise: look.post.posterise ?? 0, halftone: look.post.halftone ?? 0, pixel: look.post.pixel ?? 0, grain: noir ? 0.04 : look.post.grain ?? 0 },
    bloom: look.bloom ?? 0, exposure: look.exposure ?? 1, light: look.light ?? 1,
  };
}

function character(text) {
  const female = /\b(she|her|girl|woman|queen|grandma|mother|female)\b/i.test(text);
  return {
    name: titleFrom(text, 2), blurb: `Made from your request: ${text.slice(0, 80)}`.slice(0, 120),
    body: BODIES[female ? 0 : 1]?.id ?? BODIES[0].id, hair: female ? "long" : "buzzed",
    skinTone: "#d9a074", hairColour: "#16100c", top: /\bblue\b/i.test(text) ? "#2f6bff" : "#ff4f6d", bottom: "#1f2a55", shoes: "#f5f7fb",
  };
}

function boss(text) {
  return {
    name: titleFrom(text, 2), pitch: "A towering foe that hurls storms at your sides and slams the ground.",
    look: `An original figure based on: ${text.slice(0, 200)}. Tall and wide, with glowing weak points that go dark as they break.`,
    parts: [{ name: "Left fist", where: "left hand, held high" }, { name: "Right fist", where: "right hand, held high" }, { name: "Chest core", where: "centre of the chest" }, { name: "Face", where: "the head, last to fall" }],
    toughness: 1.5, opening: "enter", exposed: ["idle", "stun"],
    phases: [["slam", "volley"], ["volley", "slam", "volley"], ["slam", "volley", "volley"]], restMs: [2400, 1900, 1500],
    tells: [{ attack: "slam", tell: "raises both fists over its head" }, { attack: "volley", tell: "one side glows before it throws" }],
    games: ["blades", "sights"], standIn: 2,
  };
}

function game(text) {
  return {
    name: titleFrom(text, 2), pitch: "Jump the low ones, duck the high ones and step to the clear lane.", closest: "lane_runner",
    whyNew: "Fixture answer: a real model explains here what no template can do.", framing: "full", lengthS: 60,
    moves: [
      { gesture: "jump", does: "clears a low obstacle", cue: "Jump with both feet", key: "ArrowUp" },
      { gesture: "squat_down", does: "ducks under a high bar", cue: "Bend your knees and sink your hips", key: "ArrowDown" },
      { gesture: "step_left", does: "moves one lane left", cue: "Step your whole body to your left", key: "ArrowLeft" },
      { gesture: "step_right", does: "moves one lane right", cue: "Step your whole body to your right", key: "ArrowRight" },
    ],
    loop: "Obstacles come down three lanes. Clear each with the move it asks for.", onboarding: ["Only low obstacles for ten seconds, with JUMP on screen.", "High bars join, with DUCK on screen.", "Lane blocks join once the player has cleared five."],
    scoring: "Ten points an obstacle, double after five in a row.", ramp: "Faster every twenty seconds.", ending: "Sixty seconds or three hits.",
    risks: ["Jumps need the feet in view, so the game asks for full framing before it starts."],
  };
}

const DRAFTS = { world, style, character, boss, game };

export function fixtureDraft({ kind, text }) {
  return { decision: "make", reuse: "", note: "This was made by the offline stand-in, not the live model.", needs: [], item: DRAFTS[kind](text) };
}
