// Fixture provider: canned stand-ins for the model, used when no credentials are configured.
// It exists to exercise the runtime and the UI. Keyword matching here says nothing about how well
// a real model reads intent, and every response is labelled source: "fixture" all the way to the UI.
import { castFor } from "../spec/cast.js";
import { SPEC_VERSION, WORLDS } from "../spec/contract.js";
import { templateInfo } from "../templates/index.js";
import { WORLD_WORDS, bestTemplate, clarifyOptions } from "./match.js";

export const FIXTURE_MODEL = "fixture-v3";

const STYLE_WORDS = [
  ["toon", /\b(toon|cartoon)\b/i],
  ["neon", /\b(neon|cyber\w*)\b/i],
  ["pixel", /\b(pixel\w*|retro)\b/i],
  ["comic", /\bcomic\w*\b/i],
  ["clay", /\bclay\b/i],
];

const COLOURS = { red: "#e5383b", orange: "#ff8c2f", yellow: "#ffd23f", green: "#2fbf71", blue: "#2f6bff", purple: "#8a5cff", pink: "#ff4f9a", black: "#16181f", white: "#f5f7fb" };

// Each refusal carries what the move works, so the closest game keeps the player's body goal:
// push-ups still get an upper-body game, never the runner.
const UNSUPPORTED = [
  [/swim|butterfly stroke/i, "swimming strokes", "upper body"],
  [/handstand|backflip|cartwheel|somersault/i, "inverted moves", "jump"],
  [/push.?up/i, "floor exercises", "upper body"],
  [/plank|sit.?up|crunch/i, "floor exercises", "core"],
  [/yoga/i, "floor exercises", "poses"],
  [/two.?player|multiplayer|with a friend|versus my/i, "playing with a second person", ""],
  [/dumbbell|kettlebell/i, "tracking objects you hold", "for my arms"],
  [/juggl|hold(ing)? a/i, "tracking objects you hold", "catch"],
];

const firstMatch = (words, text) => words.find(([, pattern]) => pattern.test(text))?.[0];

const pickWorld = (text) => firstMatch(WORLD_WORDS, text) ?? "downtown";
const pickStyle = (text) => firstMatch(STYLE_WORDS, text) ?? "bright";

function brief(text, template) {
  return { template: template.id, world: pickWorld(text), style: pickStyle(text), goal: template.pitch };
}

const none = { requested: "", closest: "" };

// The body comes first: an idea that names a body part, an exercise or a mechanic goes straight to
// its best game. Only an idea with nothing to go on gets a question, and never twice.
function fixtureIntent({ idea, clarification }) {
  const text = [idea, clarification].filter(Boolean).join(" ");
  const blocked = UNSUPPORTED.find(([pattern]) => pattern.test(text));
  const pick = bestTemplate(blocked ? `${text} ${blocked[2]}` : text);
  const body = pick.reading;
  if (blocked) {
    const closest = pick.template;
    return {
      status: "unsupported",
      brief: brief(text, closest),
      body,
      question: "",
      options: [],
      unsupported: { requested: blocked[1], closest: `${closest.name}: ${closest.pitch}` },
    };
  }
  if (!pick.evidence && !clarification) {
    return {
      status: "clarify",
      brief: brief(text, pick.template),
      body,
      question: "What do you want to work?",
      options: clarifyOptions(body),
      unsupported: none,
    };
  }
  return { status: "ready", brief: brief(text, pick.template), body, question: "", options: [], unsupported: none };
}

const seedFrom = (text) => [...text].reduce((seed, letter) => (seed * 31 + letter.charCodeAt(0)) % 100000, 7);

function fixtureSpec({ idea, clarification, brief: gameBrief }) {
  const text = [idea, clarification].filter(Boolean).join(" ");
  const template = templateInfo(gameBrief?.template) ?? bestTemplate(text).template;
  const world = WORLDS.find((item) => item.id === pickWorld(`${text} ${gameBrief?.world ?? ""}`));
  return {
    specVersion: SPEC_VERSION,
    template: template.id,
    title: `${world.label} ${template.name}`,
    objective: template.pitch,
    seed: seedFrom(text),
    skin: { world: world.id, style: pickStyle(`${text} ${gameBrief?.style ?? ""}`), ...castFor({ text, template: template.id }) },
    tuning: [],
  };
}

const STEP = 0.25; // a quarter of a field's range is enough for a player to feel
const timeOrSpeed = (field) => /^(ms|s|m\/s)/.test(field.unit);

// Moves each field toward the hard or easy end, as its own higherIsHarder says.
function retune(spec, harder, fields) {
  const tuning = { ...spec.tuning };
  for (const [key, field] of fields) {
    const toward = harder === field.higherIsHarder ? 1 : -1;
    const moved = spec.tuning[key] + toward * STEP * (field.max - field.min);
    const inRange = Math.min(field.max, Math.max(field.min, moved));
    tuning[key] = field.whole ? Math.round(inRange) : Number(inRange.toFixed(3));
  }
  return tuning;
}

function readDifficulty(request, template) {
  const fields = Object.entries(template.tuning);
  const hardWords = /\b(hard|harder|tough\w*|fast|faster|quick\w*|less time)\b/i;
  const easyWords = /\b(easy|easier|slow\w*|longer|more time|more warning)\b/i;
  if (!hardWords.test(request) && !easyWords.test(request)) return null;
  // "Faster" and "more time" are about the clock, so they leave lives and sizes alone.
  const aboutTime = /\b(fast|faster|quick\w*|slow\w*|longer|time|warning)\b/i.test(request);
  const timed = fields.filter(([, field]) => timeOrSpeed(field));
  return { harder: hardWords.test(request), fields: aboutTime && timed.length ? timed : fields };
}

function fixtureRevision({ spec, request }) {
  const next = structuredClone(spec);
  const notes = [];
  const style = firstMatch(STYLE_WORDS, request);
  if (style && style !== spec.skin.style) {
    next.skin.style = style;
    notes.push(`Switched the look to ${style}.`);
  }
  const world = firstMatch(WORLD_WORDS, request);
  if (world && world !== spec.skin.world) {
    next.skin.world = world;
    notes.push(`Moved the game to ${WORLDS.find((item) => item.id === world).label}.`);
  }
  const colour = Object.keys(COLOURS).find((name) => new RegExp(`\\b${name}\\b`, "i").test(request));
  if (colour) {
    const who = /\b(rival|opponent|enemy)\b/i.test(request) ? "rival" : "hero";
    next.skin[who].top = COLOURS[colour];
    notes.push(`Dressed the ${who} in ${colour}.`);
  }
  const lookChanged = notes.length > 0;

  const difficulty = readDifficulty(request, templateInfo(spec.template));
  if (difficulty) {
    next.tuning = retune(spec, difficulty.harder, difficulty.fields);
    notes.push(difficulty.harder ? "Made it harder." : "Made it easier.");
  }

  const changeKind = lookChanged && difficulty ? "both" : lookChanged ? "look" : "gameplay";
  const changeSummary = notes.join(" ") || "The fixture does not understand that request.";
  return { changeKind, changeSummary, spec: { ...next, tuning: Object.entries(next.tuning).map(([key, value]) => ({ key, value })) } };
}

export function createFixtureProvider() {
  return {
    source: "fixture",
    model: FIXTURE_MODEL,
    async complete({ stage, input }) {
      const data = { intent: fixtureIntent, generate: fixtureSpec, revise: fixtureRevision }[stage](input);
      return { data: structuredClone(data), ms: 0, usage: null };
    },
  };
}
