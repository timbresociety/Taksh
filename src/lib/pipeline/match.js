// Picks the game that fits an idea. The body comes first: what the player wants to work, and what they
// want to leave out, decides which games are allowed at all. Mechanic words then score the games
// that are left, and world words break near ties. It is deterministic, so the fixture uses it to
// choose and the model path uses it to check the model's choice.
import { TEMPLATES } from "../templates/index.js";
import { fits, gestureFocus, templateFocus } from "../templates/focus.js";

export const WORLD_WORDS = [
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

export const readWorld = (text) => WORLD_WORDS.find(([, pattern]) => pattern.test(text))?.[0];

// Words for what the player does. Each hit is worth its weight, and every hit counts, so an idea
// that names a game twice beats one passing word for another.
const MECHANICS = [
  ["sights", /\b(sights?|crosshairs?|aim\w*|shoot\w*|guns?|grenades?|lock on|ghouls?|zombies?)\b/gi],
  ["rangoli", /\b(rangoli|bricks?|tiles?|breakout)\b/gi],
  ["rangoli", /\b(paddle and ball|ball and paddle)\b/gi, 2],
  ["dabba", /\b(dabbas?|tiffins?|catch\w*|lunch ?box\w*)\b/gi],
  ["popup", /\b(whack\w*|pop.?ups?|potholes?|monkeys?)\b/gi],
  ["rickshaw", /\b(rickshaws?|auto rally|tuk.?tuks?|driv\w+)\b/gi],
  ["oars", /\b(boats?|oars?|row|rowing|koli|paddl\w*|fishing|pump\w*|canoe\w*|kayak\w*)\b/gi],
  ["handi", /\b(dahi|handi|govindas?|janmashtami|human (tower|pyramid)|pyramid)\b/gi],
  ["circuit", /\b(cardio|circuit|reps|exercises|couch|hiit|coach)\b/gi],
  ["keeper", /\b(top corners?|corners? of (the|a) goal|(nine )?zones? of (the|a) goal|goal.?line|last line)\b/gi, 3],
  // "train" only as the thing on rails, so "train my arms" never reads as a runner.
  ["lane_runner", /\b(run|runs|runner|runners|running|lanes?|chas(e|es|ed|ing)|sprint\w*|parkour|subway|trains|(a|the|on|of) train)\b/gi],
  ["lane_runner", /\bdodg\w+/gi, 0.5],
  ["hop", /\b(jump\w*|hop|hops|hopping|platforms?|bounc\w*|leap\w*)\b/gi],
  ["rally", /\b(tennis|rally|rallies|rackets?|badminton|ping.?pong)\b/gi],
  ["pads", /\b(pads?|punch\w*|jab\w*|mitts?|speed bag)\b/gi],
  ["pads", /\bbox\w*/gi],
  ["chop", /\b(chop\w*|slic\w+|fruit\w*|mangoes|mango|watermelons?|ninja)\b/gi],
  ["blades", /\b(swords?|blades?|slash\w*|melee|ravana|raiders?)\b/gi],
  ["bout", /\b(box\w*|fight\w*|rivals?|slip\w*|spar\w*|opponents?|counter\w*)\b/gi],
  ["flyer", /\b(fly|flying|flies|birds?|flap\w*|wings?|soar\w*)\b/gi],
  ["poses", /\b(pose|poses|posing|copy\w*|danc\w+|mirror\w*|statues?)\b/gi],
  ["guard", /\b(goal.?keep\w*|keepers?|save|saves|saving|dodg\w+|robots?)\b/gi],
  ["matka", /\b(matka|pots?|rhythm|dhol|drums?)\b/gi],
  ["matka", /\bbeats?\b/gi, 0.5],
  ["matka", /\bmusic\w*/gi, 0.5],
  ["harmonium", /\b(harmonium|piano|keyboard|melody|tune|songs?)\b/gi],
  ["harmonium", /\bmusic\w*/gi, 0.5],
];

// Exercise names. A game earns a little for each one it really binds, read from its bindings.
const EXERCISES = [
  [/\bsquats?\b/i, ["squat_down"]],
  [/\blunges?\b/i, ["lunge", "side_lunge_left", "side_lunge_right"]],
  [/\bjumping jacks?\b/i, ["jumping_jack"]],
  [/\bburpees?\b/i, ["burpee"]],
  [/\bhigh knees?\b/i, ["high_knee"]],
  [/\bkicks?\b/i, ["kick_left", "kick_right", "butt_kick_left", "butt_kick_right"]],
  [/\bcurls?\b/i, ["curl_left", "curl_right"]],
  [/\b(punch\w*|jabs?|hooks?|uppercuts?)\b/i, ["punch_left", "punch_right", "hook_left", "hook_right", "uppercut_left", "uppercut_right"]],
  [/\b(twist\w*|rotation)\b/i, ["twist_left", "twist_right"]],
  [/\b(side bends?|lean\w*|bend\w* sideways)\b/i, ["lean_left", "lean_right"]],
  [/\bjump\w*\b/i, ["jump", "squat_jump"]],
  [/\b(skip\w*|rope)\b/i, ["bounce"]],
  [/\b(step\w*|side steps?)\b/i, ["step_left", "step_right"]],
  [/\b(run\w* on the spot|fast feet)\b/i, ["run_step"]],
  [/\b(raise|reach\w*|overhead)\b/i, ["reach_up_left", "reach_up_right", "hands_up"]],
  [/\b(arm pumps?|pump\w*)\b/i, ["arm_pump"]],
  [/\bflap\w*\b/i, ["flap"]],
  [/\b(swipe\w*|slash\w*)\b/i, ["slash_left", "slash_right"]],
];

const THEMES = {
  mumbai: ["rickshaw", "dabba", "popup", "chop", "handi"],
  marine_drive: ["oars"],
  diwali: ["rangoli", "matka", "blades"],
  station: ["bout"],
  moon: ["hop"],
  forest: ["flyer"],
  sunset: ["rally"],
};

// When nothing in the idea tells two games apart, the one that works the asked-for body hardest goes
// first. The runner is last, so it is only ever picked because something asked for it.
const LEAD = ["pads", "circuit", "hop", "oars", "flyer", "keeper", "chop", "rickshaw", "rally", "guard", "bout", "harmonium", "dabba", "popup", "rangoli", "poses", "matka", "blades", "sights", "handi", "lane_runner"];

// Body words. A region only counts as a target when the idea aims at it ("train my arms", "arms only"),
// so "pump my arms" in a rowing idea stays a mechanic.
const UPPER_PART = "(arms?|biceps?|triceps?|forearms?|shoulders?|delts|chest|pecs)";
const AIMED = new RegExp(
  `\\b(train\\w*|work\\w*( out)?|exercis\\w*|ton\\w*|strengthen\\w*|build\\w*|for|focus\\w*( on)?|target\\w*|us(e|ing)|just|only|with)\\s+(on\\s+)?(my|the|your|out my|just my|only my)?\\s*${UPPER_PART}\\b|\\b${UPPER_PART}\\s+(only|day|workouts?|exercises?|training|game)\\b|\\b(just|only)\\s+(my\\s+|the\\s+)?hands\\b|\\bhands\\s+only\\b`,
  "gi",
);
const PART_FOCUS = (part) => (/^(should|delt)/.test(part) ? "shoulders" : /^(chest|pec)/.test(part) ? "chest" : "arms");

const BODY = [
  ["upper", /\bupper\b/i],
  ["core", /\b(core|abs|obliques?|six.?pack|waist|belly|tummy|side bends?)\b/i],
  ["legs", /\b(legs?|leg day|lower[ -]?body|glutes?|thighs?|quads?|hamstrings?|calves|squats|lunges)\b/i],
  ["cardio", /\b(cardio|sweat\w*|heart rate|calories|hiit|endurance|out of breath|fat burn\w*|burn fat)\b/i],
  ["full", /\b(full[ -]?body|whole[ -]?body|total[ -]?body|every muscle|head to toe|arms and legs|legs and arms)\b/i],
  ["seated", /\b(seated|sitting|sit down|chairs?|wheelchairs?|desk)\b/i],
];
const LOW_IMPACT = /\b(low[ -]?impact|bad knees?|knee pain|sore knees?|knee injur\w*|downstairs neighbou?rs?)\b/i;

// "no running", "not a runner", "without my legs", "I can't jump". A negation reaches forward to the
// first thing it can rule out, and on through "or" and "and" to the next ones, never past punctuation
// or a turn like "but" or "just". So "non-impact game for my shoulders" still asks for shoulders.
const NEGATION = /\b(no|not|non|without|never|avoid\w*|minus|nothing with|don['’]?t|do not|doesn['’]?t|won['’]?t|can['’]?t|cannot|hate|zero)\b/gi;
const CLAUSE_END = /[.,;!?]|\b(but|just|only|instead|rather|so|then|while|though|except|please|because)\b/i;
const NEGATABLE = [
  ["running", /\b(run\w*|sprint\w*|jog\w*)\b/i],
  ["jumping", /\b(jump\w*|hop\w*|bounc\w*|leap\w*|skipping)\b/i],
  ["legs", /\b(legs?|feet|foot|squat\w*|lunge\w*|kick\w*|steps?|stepping|lower[ -]?body)\b/i],
  ["impact", /\b(impact|knees?)\b/i],
];
const NEGATED_STANDING = /\bstand\w*/i;
const once = (pattern) => new RegExp(pattern.source, "i");
const TERMS = [...NEGATABLE.map(([, pattern]) => pattern), NEGATED_STANDING, ...MECHANICS.map(([, pattern]) => once(pattern))];
const isTerm = (word) => TERMS.some((pattern) => pattern.test(word));
const LINKS = new Set(["or", "and", "nor", "&"]);
const REACH = 6; // words a negation looks ahead for something to rule out

function negatedClauses(text) {
  const clauses = [];
  for (const match of text.matchAll(NEGATION)) {
    const from = match.index + match[0].length;
    let rest = text.slice(from);
    const stop = rest.search(CLAUSE_END);
    if (stop >= 0) rest = rest.slice(0, stop);
    const words = [...rest.matchAll(/\S+/g)];
    let last = words.slice(0, REACH).findIndex(([word]) => isTerm(word));
    if (last < 0) continue;
    while (LINKS.has(words[last + 1]?.[0].toLowerCase()) && words[last + 2] && isTerm(words[last + 2][0])) last += 2;
    const end = from + words[last].index + words[last][0].length;
    clauses.push({ start: match.index, end, text: text.slice(from, end).trim() });
  }
  return clauses;
}

const unique = (items) => [...new Set(items)];

// What the idea asks of the body. positive is the idea with every negated clause taken out.
export function readBody(text = "") {
  const clauses = negatedClauses(text);
  let positive = text;
  for (const clause of [...clauses].reverse()) positive = `${positive.slice(0, clause.start)} ${positive.slice(clause.end)}`;
  const negated = clauses.map((clause) => clause.text).join(" ; ");

  const focus = BODY.filter(([, pattern]) => pattern.test(positive)).map(([id]) => id);
  for (const match of positive.matchAll(AIMED)) {
    const part = match[0].match(new RegExp(UPPER_PART, "i"))?.[0] ?? "arms";
    focus.push(/hands/i.test(match[0]) ? "arms" : PART_FOCUS(part.toLowerCase()));
  }
  const avoid = NEGATABLE.filter(([, pattern]) => clauses.some((clause) => pattern.test(clause.text))).map(([id]) => id);
  if (LOW_IMPACT.test(positive)) avoid.push("impact");
  if (clauses.some((clause) => NEGATED_STANDING.test(clause.text))) focus.push("seated");
  return { focus: unique(focus), avoid: unique(avoid), positive, negated };
}

const count = (pattern, text) => (text.match(pattern) ?? []).length;

function mechanicScores(text) {
  const scores = new Map();
  for (const [id, pattern, weight = 1] of MECHANICS) {
    const hits = count(pattern, text);
    if (hits) scores.set(id, (scores.get(id) ?? 0) + hits * weight);
  }
  return scores;
}

const bindsAny = (template, gestures) => template.bindings.some((binding) => gestures.includes(binding.gesture));

// The part of a game's moves that work a region, so a game of side bends outranks one with two hooks.
const share = (template, region) => template.bindings.filter((binding) => gestureFocus(binding.gesture)?.regions.includes(region)).length / template.bindings.length;

function focusBonus(template, focus) {
  const fit = templateFocus(template.id);
  let bonus = 0;
  if (focus.includes("shoulders") && fit.regions.includes("shoulders")) bonus += 1;
  if (focus.includes("chest") && fit.regions.includes("chest")) bonus += 2;
  if (focus.includes("core") && fit.regions.includes("core")) bonus += 1 + 2 * share(template, "core");
  if (focus.includes("cardio") && fit.cardio) bonus += 3;
  if (focus.includes("full") && fit.legs && fit.arms) bonus += 3;
  if (focus.includes("legs") && !fit.arms) bonus += 2;
  if (focus.includes("seated") && fit.seated) bonus += 2;
  return bonus;
}

// The body reading the idea gives, with anything the caller already knows (a model's structured
// answer) added. The idea's own focus wins; a caller's focus is only used when the idea names none.
export function readIdea(text, known = {}) {
  const said = readBody(text);
  const focus = said.focus.length ? said.focus : unique(known.focus ?? []);
  const avoid = unique([...said.avoid, ...(known.avoid ?? [])]);
  return { ...said, focus, avoid };
}

// Every game that fits the body reading, best first, each with its score and the reasons for it.
// A reading nothing can satisfy (legs only, but no legs) drops the focus before it drops the avoids.
export function matchTemplates(text, known = {}) {
  const reading = readIdea(text, known);
  let allowed = TEMPLATES.filter((template) => fits(template.id, reading));
  if (!allowed.length) allowed = TEMPLATES.filter((template) => fits(template.id, { avoid: reading.avoid }));
  if (!allowed.length) allowed = TEMPLATES;

  const lower = reading.positive.toLowerCase();
  const scores = mechanicScores(reading.positive);
  const against = mechanicScores(reading.negated);
  const world = readWorld(reading.positive);

  return allowed
    .map((template) => {
      const why = [];
      let score = 0;
      if (lower.includes(template.name.toLowerCase())) {
        score += 20;
        why.push("named");
      }
      const mechanic = (scores.get(template.id) ?? 0) * 3 - (against.get(template.id) ?? 0) * 3;
      if (mechanic) why.push(mechanic > 0 ? "mechanic" : "asked not to");
      score += mechanic;
      const moves = EXERCISES.filter(([pattern, gestures]) => pattern.test(reading.positive) && bindsAny(template, gestures)).length;
      if (moves) why.push("moves");
      score += moves;
      const bonus = focusBonus(template, reading.focus);
      if (bonus) why.push("body");
      score += bonus;
      if (world && THEMES[world]?.includes(template.id)) {
        score += 1;
        why.push("world");
      }
      score += (LEAD.length - LEAD.indexOf(template.id)) / 100;
      return { template, score: Number(score.toFixed(2)), why };
    })
    .sort((a, b) => b.score - a.score);
}

// The single best fit, and whether the idea gave anything to choose on. With nothing to go on the
// pick is only a guess, so the caller should ask instead.
export function bestTemplate(text, known = {}) {
  const ranked = matchTemplates(text, known);
  const reading = readIdea(text, known);
  const [best] = ranked;
  const evidence = reading.focus.length > 0 || reading.avoid.length > 0 || best.why.some((reason) => reason !== "world");
  return { template: best.template, why: best.why, evidence, reading: { focus: reading.focus, avoid: reading.avoid }, ranked };
}

// Answers that cover the body, one game each: upper body, legs, cardio, then whole body. Each names
// its game, so choosing it routes straight there, and anything the idea ruled out stays out.
const BUCKETS = [
  ["Upper body", "upper"],
  ["Legs", "legs"],
  ["Cardio", "cardio"],
  ["Whole body", "full"],
];

export function clarifyOptions({ avoid = [] } = {}) {
  const chosen = [];
  for (const [label, focus] of BUCKETS) {
    const pick = matchTemplates("", { focus: [focus], avoid }).find(({ template }) => !chosen.some((item) => item.template === template));
    if (pick && fits(pick.template.id, { focus: [focus], avoid })) chosen.push({ label, template: pick.template });
  }
  return chosen.map(({ label, template }) => `${label} (${template.name})`);
}
