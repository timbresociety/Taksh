// Checks a spec before it can load, and returns it in the form the session expects: tuning as an
// object with every key present. A failure lists every problem, so one repair can fix them all.
import { BODIES, GAME_SPEC_SCHEMA, HAIR, SPEC_VERSION, STYLES, WORLDS } from "./contract.js";
import { defaultTuning, simulate, templateInfo } from "../templates/index.js";

const COLOUR = /^#[0-9a-f]{6}$/i;

function checkCharacter(character, where, errors) {
  if (!character || typeof character !== "object") {
    errors.push(`${where} is missing.`);
    return;
  }
  if (!BODIES.some((body) => body.id === character.body)) errors.push(`${where}.body "${character.body}" is not a known body.`);
  if (!HAIR.includes(character.hair)) errors.push(`${where}.hair "${character.hair}" is not a known hairstyle.`);
  for (const key of ["skinTone", "hairColour", "top", "bottom", "shoes"]) {
    if (!COLOUR.test(character[key] ?? "")) errors.push(`${where}.${key} must be a #rrggbb colour.`);
  }
}

// The schema already says this to a model, but a spec can also arrive from a client. Bindings and
// gestures belong to the template, so a spec that tries to name its own is refused, not ignored.
function checkKnownKeys(value, schema, where, errors) {
  if (schema.type !== "object" || !value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(schema.properties, key)) errors.push(`${where}${key} is not part of a game spec.`);
    else checkKnownKeys(value[key], schema.properties[key], `${where}${key}.`, errors);
  }
}

function readTuning(spec, template, errors) {
  const given = Array.isArray(spec.tuning) ? Object.fromEntries(spec.tuning.map((item) => [item?.key, item?.value])) : spec.tuning ?? {};
  const tuning = defaultTuning(template);
  for (const [key, value] of Object.entries(given)) {
    const field = Object.hasOwn(template.tuning, key) ? template.tuning[key] : null;
    if (!field) {
      errors.push(`tuning.${key} does not exist on ${template.id}.`);
    } else if (typeof value !== "number" || Number.isNaN(value) || value < field.min || value > field.max) {
      errors.push(`tuning.${key} must be between ${field.min} and ${field.max}; got ${value}.`);
    } else tuning[key] = field.whole ? Math.round(value) : value;
  }
  return tuning;
}

export function validateSpec(input) {
  const errors = [];
  const template = templateInfo(input?.template);
  if (!input || typeof input !== "object") return { ok: false, errors: ["The spec is not an object."], spec: null };
  checkKnownKeys(input, GAME_SPEC_SCHEMA, "", errors);
  if (input.specVersion !== SPEC_VERSION) errors.push(`specVersion must be ${SPEC_VERSION}.`);
  if (!template) errors.push(`template "${input.template}" does not exist.`);
  for (const key of ["title", "objective"]) {
    if (typeof input[key] !== "string" || !input[key].trim()) errors.push(`${key} must be text.`);
  }
  if (!Number.isInteger(input.seed)) errors.push("seed must be a whole number.");
  if (!WORLDS.some((world) => world.id === input.skin?.world)) errors.push(`skin.world "${input.skin?.world}" is not a known world.`);
  if (!STYLES.some((style) => style.id === input.skin?.style)) errors.push(`skin.style "${input.skin?.style}" is not a known style.`);
  checkCharacter(input.skin?.hero, "skin.hero", errors);
  checkCharacter(input.skin?.rival, "skin.rival", errors);
  const tuning = template ? readTuning(input, template, errors) : {};
  if (errors.length) return { ok: false, errors, spec: null };

  const spec = { ...input, tuning };
  const proof = simulate(template, spec, { skill: "quick", maxMs: 90000 });
  if (proof.score <= 0) return { ok: false, errors: ["A skilled player cannot score in this game. Make the tuning easier."], spec: null };
  return { ok: true, errors: [], spec };
}

export { GAME_SPEC_SCHEMA };
