// Fixture provider: canned stand-ins for the model, used when no credentials are configured.
// It exists to exercise the runtime and the UI. Keyword matching here says nothing about how well
// a real model reads intent, and every response is labelled source: "fixture" all the way to the UI.
import { DEFAULT_HERO, DEFAULT_RIVAL, SPEC_VERSION, WORLDS } from "../spec/contract.js";
import { TEMPLATES, templateInfo } from "../templates/index.js";

export const FIXTURE_MODEL = "fixture-v2";

// First match wins, so an idea that mentions two games gets the one earlier in this list.
const TEMPLATE_WORDS = [
  ["sights", /\b(sights?|crosshairs?|aim\w*|shoot\w*|guns?|grenades?|lock on)\b/i],
  ["rangoli", /\b(rangoli|bricks?|tiles?|paddle and ball|ball and paddle)\b/i],
  ["dabba", /\b(dabbas?|tiffins?|catch\w*|lunch ?box\w*)\b/i],
  ["popup", /\b(whack\w*|pop.?ups?|potholes?|monkeys?)\b/i],
  ["rickshaw", /\b(rickshaws?|auto rally|tuk.?tuks?)\b/i],
  ["oars", /\b(boats?|oars?|rowing|koli|paddl\w*|fishing|pump\w*)\b/i],
  ["handi", /\b(dahi|handi|govindas?|janmashtami|human (tower|pyramid)|pyramid)\b/i],
  ["circuit", /\b(cardio|circuit|reps|exercises|couch)\b/i],
  ["keeper", /\b(top corners?|corners? of (the|a) goal|(nine )?zones? of (the|a) goal|goal.?line|last line)\b/i],
  ["lane_runner", /\b(run\w*|lanes?|trains?|chas(e|es|ed|ing))\b/i],
  ["hop", /\b(jump\w*|moon|hop|hops|hopping|platforms?)\b/i],
  ["rally", /\b(tennis|rally|rallies|rackets?)\b/i],
  ["pads", /\b(pads?|punch\w*)\b/i],
  ["chop", /\b(chop\w*|slic\w+|fruit\w*|mangoes|mango)\b/i],
  ["blades", /\b(swords?|blades?|slash\w*|melee|ravana)\b/i],
  ["bout", /\b(box\w*|fight\w*|rivals?)\b/i],
  ["flyer", /\b(fly|flying|flies|birds?|flap\w*|wings?)\b/i],
  ["poses", /\b(pose|poses|posing|copy\w*|danc\w+|mirror\w*)\b/i],
  ["guard", /\b(goal.?keep\w*|keepers?|save|saves|saving|dodg\w+|robots?)\b/i],
  ["matka", /\b(matka|pots?|rhythm|dhol|drums?)\b/i],
  ["harmonium", /\b(harmonium|piano|keyboard|melody|tune)\b/i],
];

const WORLD_WORDS = [
  ["diwali", /\b(diwali|diyas?|firecrackers?|rangoli|ravana|ramayana)\b/i],
  ["marine_drive", /\b(marine drive|juhu|chowpatty|beach|sea.?front|queen'?s necklace)\b/i],
  ["mumbai", /\b(mumbai|bombay|vada pav|pav bhaji|rickshaws?|kaali peeli|dabbawala)\b/i],
  ["downtown", /\bcity\b/i],
  ["forest", /\b(forest|jungle)\b/i],
  ["station", /\b(space|station)\b/i],
  ["moon", /\bmoon\b/i],
  ["village", /\b(village|medieval)\b/i],
  ["sunset", /\b(sunset|park)\b/i],
];

const STYLE_WORDS = [
  ["toon", /\b(toon|cartoon)\b/i],
  ["neon", /\b(neon|cyber\w*)\b/i],
  ["pixel", /\b(pixel\w*|retro)\b/i],
  ["comic", /\bcomic\w*\b/i],
  ["clay", /\bclay\b/i],
];

const COLOURS = { red: "#e5383b", orange: "#ff8c2f", yellow: "#ffd23f", green: "#2fbf71", blue: "#2f6bff", purple: "#8a5cff", pink: "#ff4f9a", black: "#16181f", white: "#f5f7fb" };

const UNSUPPORTED = [
  [/swim|butterfly stroke/i, "swimming strokes"],
  [/handstand|backflip|cartwheel|somersault/i, "inverted moves"],
  [/push.?up|plank|sit.?up|crunch|yoga/i, "floor exercises"],
  [/two.?player|multiplayer|with a friend|versus my/i, "playing with a second person"],
  [/juggl|dumbbell|kettlebell|hold(ing)? a/i, "tracking objects you hold"],
];

const CLARIFY_OPTIONS = [
  ["lane_runner", "Running and dodging"],
  ["pads", "Punching pads"],
  ["guard", "Saving shots"],
  ["hop", "Hopping across platforms"],
];

const FALLBACK_TEMPLATE = "lane_runner";

const firstMatch = (words, text) => words.find(([, pattern]) => pattern.test(text))?.[0];

// A template's own name wins, so an answer like "Saving shots (Lane Guard)" cannot route by accident.
function pickTemplate(text) {
  const named = TEMPLATES.find((template) => text.toLowerCase().includes(template.name.toLowerCase()));
  return named?.id ?? firstMatch(TEMPLATE_WORDS, text);
}

const pickWorld = (text) => firstMatch(WORLD_WORDS, text) ?? "downtown";
const pickStyle = (text) => firstMatch(STYLE_WORDS, text) ?? "bright";

function brief(text, templateId) {
  const template = templateInfo(templateId);
  return { template: template.id, world: pickWorld(text), style: pickStyle(text), goal: template.pitch };
}

function fixtureIntent({ idea, clarification }) {
  const text = [idea, clarification].filter(Boolean).join(" ");
  const blocked = UNSUPPORTED.find(([pattern]) => pattern.test(text));
  const templateId = pickTemplate(text);
  if (blocked) {
    const closest = templateInfo(templateId ?? FALLBACK_TEMPLATE);
    return {
      status: "unsupported",
      brief: brief(text, closest.id),
      question: "",
      options: [],
      unsupported: { requested: blocked[1], closest: `${closest.name}: ${closest.pitch}` },
    };
  }
  if (!templateId) {
    return {
      status: "clarify",
      brief: brief(text, FALLBACK_TEMPLATE),
      question: "What should your body be doing in this game?",
      options: CLARIFY_OPTIONS.map(([id, label]) => `${label} (${templateInfo(id).name})`),
      unsupported: { requested: "", closest: "" },
    };
  }
  return { status: "ready", brief: brief(text, templateId), question: "", options: [], unsupported: { requested: "", closest: "" } };
}

const seedFrom = (text) => [...text].reduce((seed, letter) => (seed * 31 + letter.charCodeAt(0)) % 100000, 7);

function fixtureSpec({ idea, clarification, brief: gameBrief }) {
  const text = [idea, clarification].filter(Boolean).join(" ");
  const template = templateInfo(gameBrief?.template) ?? templateInfo(pickTemplate(text) ?? FALLBACK_TEMPLATE);
  const world = WORLDS.find((item) => item.id === pickWorld(`${text} ${gameBrief?.world ?? ""}`));
  return {
    specVersion: SPEC_VERSION,
    template: template.id,
    title: `${world.label} ${template.name}`,
    objective: template.pitch,
    seed: seedFrom(text),
    skin: { world: world.id, style: pickStyle(`${text} ${gameBrief?.style ?? ""}`), hero: DEFAULT_HERO, rival: DEFAULT_RIVAL },
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

// A rule, not a judgment: lost the last run, the first field gets a quarter easier; otherwise the first
// two get a quarter harder. Enough to exercise the level screen without a model.
function fixtureLevel({ spec, runs }) {
  const template = templateInfo(spec.template);
  const lost = runs.at(-1)?.outcome === "lose";
  const fields = Object.entries(template.tuning).slice(0, lost ? 1 : 2);
  const tuning = fields.map(([key, field]) => {
    const step = ((field.max - field.min) / 4) * (field.higherIsHarder === lost ? -1 : 1);
    const value = Math.min(field.max, Math.max(field.min, spec.tuning[key] + step));
    return { key, value: field.whole ? Math.round(value) : value };
  });
  const why = lost ? "You lost the last run, so this eases off." : `You scored ${runs.at(-1)?.score ?? 0}, so this pushes harder.`;
  return { headline: lost ? "A gentler level." : "A harder level.", tuning, changes: tuning.map(({ key }) => ({ key, why })) };
}

export function createFixtureProvider() {
  return {
    source: "fixture",
    model: FIXTURE_MODEL,
    async complete({ stage, input }) {
      const data = { intent: fixtureIntent, generate: fixtureSpec, revise: fixtureRevision, level: fixtureLevel }[stage](input);
      return { data: structuredClone(data), ms: 0, usage: null };
    },
  };
}
