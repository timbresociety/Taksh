// The five things a player can ask for. Each kind says what the model must return, what it is shown
// (the live catalogue, so prompts never drift from the game), and how its answer is checked and
// turned into a result. World, style and character are data and playable at once; a boss or a game
// needs code, so its design is checked and queued for a build, with the closest thing to play today.
import { BODIES, CLOTH_COLOURS, GESTURES, HAIR, HAIR_COLOURS, SKIN_TONES, STYLES, WORLDS } from "../spec/contract.js";
import { LOOKS } from "../stage/styles.js";
import { WORLD_LOOKS } from "../stage/worlds.js";
import { BOSSES } from "../templates/bosses.js";
import { TEMPLATES, templateInfo } from "../templates/index.js";
import { MATERIALS, ROLE_PARTS, checkMadeCharacter, checkMadeStyle, checkMadeWorld, characterSkin, slug } from "./made.js";

export const KIND_IDS = ["world", "style", "character", "boss", "game"];

const text = { type: "string" };
const number = { type: "number" };
const colour = { type: "string" }; // #rrggbb; checked in code, like every range, so the schema stays portable
const list = (items) => ({ type: "array", items });
const choice = (values) => ({ type: "string", enum: values });
const object = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

// Every answer has the same envelope, so the workflow treats all kinds alike.
const envelope = (item) => object({
  decision: choice(["make", "reuse"]),
  reuse: text, // the existing thing that already answers it, when decision is reuse; otherwise ""
  note: text, // one sentence to the player about what they got
  needs: list(text), // what would need new code or models to match the request fully; may be empty
  item,
});

// Gestures a design may use. Slash up and down are left out on purpose: players mix them up with left
// and right swipes, so up is a jump and down is a duck.
const AVOID = new Set(["slash_up", "slash_down"]);
export const DESIGN_GESTURES = GESTURES.filter((gesture) => !gesture.hidden && !AVOID.has(gesture.id));
const RELIABLE = new Set(["jump", "squat_down", "step_left", "step_right", "hands_up", "run_step", "guard", "punch_left", "punch_right", "slash_left", "slash_right", "swing_left", "swing_right"]);
const NEEDS_FULL = /^(jump|squat|step|run_step|high_knee|lift|kick|burpee|jumping_jack|step_jack|bounce|butt_kick|lunge|side_lunge|skater|toe_touch|windmill|cross_crunch)/;
const ATTACKS = ["sweep", "slam", "wave", "volley"];
const MOODS = ["idle", "windup", "stun", "sleep"];

const nonEmpty = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const madeId = (kind, label) => `made-${kind}-${slug(label ?? "")}-${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;

function worldCatalogue() {
  const worlds = WORLDS.map((world) => {
    const look = WORLD_LOOKS[world.id];
    return `- ${world.id} (${world.label}: ${world.blurb}). sky ${look.sky.join(" → ")}, haze ${look.haze}, ground ${look.ground}, road ${look.path}, line ${look.line}, accent ${look.accent}, sun ${look.sun.colour} at ${look.sun.power}, fill ${look.fill.sky}/${look.fill.ground} at ${look.fill.power}`;
  }).join("\n");
  const parts = Object.entries(ROLE_PARTS).map(([role, entries]) => `- ${role}: ${entries.join(", ")}`).join("\n");
  return `Base worlds, with their palettes:\n${worlds}\n\nParts you may cast in each role (write them exactly as shown):\n${parts}`;
}

function styleCatalogue() {
  const styles = STYLES.map((style) => `- ${style.id} (${style.label}: ${style.blurb}): ${JSON.stringify(LOOKS[style.id])}`).join("\n");
  return `Existing styles, with their settings:\n${styles}\n\nMaterials: ${MATERIALS.join(", ")}. Set every post field; 0 turns an effect off. inkColour is used only when ink is above 0.`;
}

function characterCatalogue() {
  return [
    `Bodies: ${BODIES.map((body) => `${body.id} (${body.label}${body.clothed ? ", takes clothing colours" : ", fully modelled, clothing colours do not show"})`).join("; ")}`,
    `Hairstyles: ${HAIR.join(", ")}`,
    `Skin tones: ${SKIN_TONES.join(", ")}`,
    `Hair colours often used: ${HAIR_COLOURS.join(", ")}`,
    `Clothing colours often used: ${CLOTH_COLOURS.join(", ")} (any #rrggbb works)`,
  ].join("\n");
}

function bossCatalogue() {
  const bosses = BOSSES.map((boss, index) => `- ${index + 1} ${boss.name}: ${boss.parts.length} parts, opens by ${boss.opening}, hittable while ${boss.exposed.join("/")}, toughness ${boss.toughness}, rests ${boss.restMs.join("/")} ms, phases ${boss.patterns.map((pattern) => pattern.join("+")).join(" | ")}`).join("\n");
  return `Existing bosses (the number is what standIn uses):\n${bosses}\n\nAttacks: sweep, slam and wave are heavy blows the player guards against (or jumps and ducks in Blade March); volley is thrown at one side and the player slashes that side. Moods a part can be hit in: ${MOODS.join(", ")}. Games with bosses: blades (Blade March), sights (Twin Sights).`;
}

function gameCatalogue() {
  const templates = TEMPLATES.map((template) => `- ${template.id} (${template.name}, ${template.kind}, ${template.framing} framing): ${template.pitch} Moves: ${[...new Set(template.bindings.map((binding) => binding.gesture))].join(", ")}`).join("\n");
  const gestures = DESIGN_GESTURES.map((gesture) => `- ${gesture.id}${RELIABLE.has(gesture.id) ? " (most reliable)" : ""}: ${gesture.cue}`).join("\n");
  return `Templates the game can already play:\n${templates}\n\nGestures a design may use:\n${gestures}\n\nKeys: arrow keys, space, and single letters. Each move needs its own key.`;
}

function triageCatalogue() {
  return [
    `Worlds today: ${WORLDS.map((world) => world.label).join(", ")}`,
    `Art styles today: ${STYLES.map((style) => style.label).join(", ")}`,
    `Bosses today: ${BOSSES.map((boss) => boss.name).join(", ")}`,
    `Games today: ${TEMPLATES.map((template) => `${template.name} (${template.pitch})`).join("; ")}`,
  ].join("\n");
}

export const TRIAGE_SCHEMA = object({
  kind: choice(KIND_IDS),
  decision: choice(["go", "decline"]),
  reason: text, // when declining: one kind sentence to the player saying why and what they could ask instead
  brief: text, // the request restated plainly, with anything copied from an existing work made original
});

export function triageCatalogueText() {
  return triageCatalogue();
}

export const KINDS = {
  world: {
    label: "World",
    playable: true,
    schema: envelope(object({
      label: text, blurb: text, base: choice(WORLDS.map((world) => world.id)),
      sky: list(colour), haze: colour, ground: colour, path: colour, line: colour, accent: colour,
      sun: object({ colour, power: number }), fill: object({ sky: colour, ground: colour, power: number }),
      far: list(choice(ROLE_PARTS.far)), near: list(choice(ROLE_PARTS.near)), low: list(choice(ROLE_PARTS.low)), wall: list(choice(ROLE_PARTS.wall)),
      high: list(choice(ROLE_PARTS.high)), pickup: choice(ROLE_PARTS.pickup), hazard: choice(ROLE_PARTS.hazard),
    })),
    catalogue: worldCatalogue,
    finish(draft, previous) {
      const item = { ...draft.item, id: previous?.id ?? madeId("world", draft.item?.label) };
      return { item, problems: checkMadeWorld(item) };
    },
  },
  style: {
    label: "Art style",
    playable: true,
    schema: envelope(object({
      label: text, blurb: text, base: choice(STYLES.map((style) => style.id)), material: choice(MATERIALS),
      post: object({ saturation: number, vignette: number, ink: number, inkColour: colour, posterise: number, halftone: number, pixel: number, grain: number }),
      bloom: number, exposure: number, light: number,
    })),
    catalogue: styleCatalogue,
    finish(draft, previous) {
      const item = { ...draft.item, id: previous?.id ?? madeId("style", draft.item?.label) };
      return { item, problems: checkMadeStyle(item) };
    },
  },
  character: {
    label: "Character",
    playable: true,
    schema: envelope(object({
      name: text, blurb: text, body: choice(BODIES.map((body) => body.id)), hair: choice(HAIR),
      skinTone: colour, hairColour: colour, top: colour, bottom: colour, shoes: colour,
    })),
    catalogue: characterCatalogue,
    finish(draft) {
      const item = { ...draft.item };
      const problems = checkMadeCharacter(item);
      return { item: problems.length ? item : { ...item, skin: characterSkin(item) }, problems };
    },
  },
  boss: {
    label: "Boss",
    playable: false,
    schema: envelope(object({
      name: text, pitch: text, look: text,
      parts: list(object({ name: text, where: text })),
      toughness: number, opening: choice(["enter", "sleep"]), exposed: list(choice(MOODS)),
      phases: list(list(choice(ATTACKS))),
      restMs: list(number),
      tells: list(object({ attack: choice(ATTACKS), tell: text })),
      games: list(choice(["blades", "sights"])),
      standIn: { type: "integer" },
    })),
    catalogue: bossCatalogue,
    finish(draft) {
      const item = draft.item ?? {};
      const problems = [];
      if (!nonEmpty(item.name, 30)) problems.push("name must be text of at most 30 characters.");
      if (!nonEmpty(item.pitch, 160)) problems.push("pitch must be one sentence of at most 160 characters.");
      if (!nonEmpty(item.look, 600)) problems.push("look must describe the figure in at most 600 characters.");
      if (!Array.isArray(item.parts) || item.parts.length < 3 || item.parts.length > 10) problems.push("parts must list 3 to 10 parts.");
      else if (!item.parts.every((part) => nonEmpty(part?.name, 30) && nonEmpty(part?.where, 120))) problems.push("each part needs a name and where it sits.");
      if (typeof item.toughness !== "number" || item.toughness < 1 || item.toughness > 2) problems.push("toughness must be from 1 to 2.");
      if (!["enter", "sleep"].includes(item.opening)) problems.push("opening must be enter or sleep.");
      if (!Array.isArray(item.exposed) || !item.exposed.length || !item.exposed.every((mood) => MOODS.includes(mood))) problems.push(`exposed must list moods from ${MOODS.join(", ")}.`);
      if (item.opening === "sleep" && !item.exposed?.includes("sleep")) problems.push("a boss that opens asleep must be hittable while asleep.");
      if (!Array.isArray(item.phases) || item.phases.length !== 3 || !item.phases.every((phase) => Array.isArray(phase) && phase.length >= 1 && phase.length <= 3 && phase.every((attack) => ATTACKS.includes(attack)))) problems.push("phases must be three lists of one to three attacks.");
      if (!Array.isArray(item.restMs) || item.restMs.length !== 3 || !item.restMs.every((ms) => typeof ms === "number" && ms >= 1200 && ms <= 2600)) problems.push("restMs must be three numbers from 1200 to 2600.");
      else if (item.restMs[1] > item.restMs[0] || item.restMs[2] > item.restMs[1]) problems.push("restMs must not grow from one phase to the next.");
      const used = new Set((item.phases ?? []).flat());
      for (const attack of used) if (!item.tells?.some((tell) => tell.attack === attack && nonEmpty(tell.tell, 160))) problems.push(`the ${attack} attack needs a tell the player can see coming.`);
      if (!Array.isArray(item.games) || !item.games.length) problems.push("games must name blades, sights or both.");
      if (!Number.isInteger(item.standIn) || item.standIn < 1 || item.standIn > BOSSES.length) problems.push(`standIn must be 1 to ${BOSSES.length}.`);
      return { item, problems };
    },
    standIn: (item) => ({ template: item.games?.[0] ?? "blades", tuning: { boss: item.standIn }, label: `${BOSSES[item.standIn - 1]?.name ?? "the first boss"} in ${templateInfo(item.games?.[0] ?? "blades")?.name}` }),
  },
  game: {
    label: "Game",
    playable: false,
    schema: envelope(object({
      name: text, pitch: text, closest: choice(TEMPLATES.map((template) => template.id)), whyNew: text,
      framing: choice(["full", "upper"]), lengthS: { type: "integer" },
      moves: list(object({ gesture: choice(DESIGN_GESTURES.map((gesture) => gesture.id)), does: text, cue: text, key: text })),
      loop: text, onboarding: list(text), scoring: text, ramp: text, ending: text, risks: list(text),
    })),
    catalogue: gameCatalogue,
    finish(draft) {
      const item = draft.item ?? {};
      const problems = [];
      if (!nonEmpty(item.name, 30)) problems.push("name must be text of at most 30 characters.");
      if (!nonEmpty(item.pitch, 160)) problems.push("pitch must be one sentence of at most 160 characters.");
      if (!templateInfo(item.closest)) problems.push(`closest "${item.closest}" is not a template.`);
      if (!["full", "upper"].includes(item.framing)) problems.push("framing must be full or upper.");
      if (!Number.isInteger(item.lengthS) || item.lengthS < 30 || item.lengthS > 150) problems.push("lengthS must be a whole number of seconds from 30 to 150.");
      const moves = Array.isArray(item.moves) ? item.moves : [];
      if (moves.length < 1 || moves.length > 6) problems.push("moves must list 1 to 6 moves.");
      const known = new Set(DESIGN_GESTURES.map((gesture) => gesture.id));
      for (const move of moves) {
        if (AVOID.has(move?.gesture)) problems.push(`${move.gesture} is not allowed: use jump for up and squat_down for down.`);
        else if (!known.has(move?.gesture)) problems.push(`gesture "${move?.gesture}" is not a known gesture.`);
        if (!nonEmpty(move?.cue, 90)) problems.push(`the ${move?.gesture} move needs a one-line cue.`);
        if (!nonEmpty(move?.key, 12)) problems.push(`the ${move?.gesture} move needs a keyboard key.`);
      }
      const keys = moves.map((move) => String(move?.key).toLowerCase());
      if (new Set(keys).size !== keys.length) problems.push("each move needs its own key.");
      const gestures = moves.map((move) => move?.gesture);
      if (new Set(gestures).size !== gestures.length) problems.push("a gesture appears twice.");
      if (item.framing === "upper" && moves.some((move) => NEEDS_FULL.test(move?.gesture ?? ""))) problems.push("a game with jumps, squats, steps or leg moves needs full framing.");
      if (!Array.isArray(item.onboarding) || item.onboarding.length < 3 || item.onboarding.length > 5) problems.push("onboarding must be three to five steps.");
      for (const key of ["whyNew", "loop", "scoring", "ramp", "ending"]) if (!nonEmpty(item[key], 600)) problems.push(`${key} must be filled in.`);
      if (!Array.isArray(item.risks) || !item.risks.length) problems.push("risks must name at least one webcam risk and how the design avoids it.");
      return { item, problems };
    },
    standIn: (item) => ({ template: item.closest, tuning: {}, label: templateInfo(item.closest)?.name ?? item.closest }),
  },
};

export const kindInfo = (id) => (Object.hasOwn(KINDS, id) ? KINDS[id] : null);
