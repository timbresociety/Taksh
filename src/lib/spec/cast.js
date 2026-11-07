// Who the player plays as, and who they face, chosen from the idea instead of always the same athlete.
// A role the player names wins (a dabbawala, a Koli fisherman, Ravana), then any he or she in the words,
// then the game's own theme. With nothing to go on the pick still varies with the idea, so no one body
// is everybody's default.
import { DEFAULT_HERO, DEFAULT_RIVAL, SKIN_TONES } from "./contract.js";

// Roles, by the bodies that have them. A role with no female body is male whatever the words say.
const ROLES = [
  ["ravana", /\b(ravana?|demon king|ten[- ]headed|lanka)\b/i],
  ["dabbawala", /\b(dabba ?wala|dabbawalla|tiffins?|lunch ?box(es)?)\b/i],
  ["fisherman", /\b(fisher(man|men|folk)?|koli|fishing|boat ?man)\b/i],
  ["ranger", /\b(rangers?|archers?|hunters?|explorers?|scouts?|hikers?|trekk?ers?)\b/i],
  ["peasant", /\b(villagers?|farmers?|peasants?|gaon)\b/i],
];
const ONE_BODY = { ravana: "ravana", dabbawala: "dabbawala", fisherman: "fisherman" };

const FEMALE = /\b(she|her|hers|herself|woman|women|girls?|lad(y|ies)|queen|princess|mother|mom|mum|maa|aunty|auntie|grand(ma|mother)|granny|aaji|nani|dadi|sisters?|didi|female|heroine)\b/i;
const MALE = /\b(he|him|his|himself|man|men|boys?|guys?|king|prince|father|dad|papa|uncle|grand(pa|father)|nana|dada|brothers?|bhai|male)\b/i;

// A game whose world has its own people starts with one of them.
const THEMES = { oars: "fisherman", dabba: "dabbawala", popup: "peasant" };

// Clothes the player names, as the nearest colour the bodies wear.
const COLOURS = [
  [/\bred\b/i, "#ff4f6d"], [/\bblue\b/i, "#2f6bff"], [/\bgreen\b/i, "#21c48d"], [/\b(yellow|gold(en)?)\b/i, "#ffd23f"],
  [/\b(purple|violet)\b/i, "#8b5cf6"], [/\bwhite\b/i, "#f5f7fb"], [/\b(black|dark)\b/i, "#141a33"], [/\b(orange|saffron)\b/i, "#ff8a3d"],
];

// The words after "against", "versus" or "fight" are about the rival, not the player.
const AGAINST = /\b(against|vs\.?|versus|fight(?:ing)?|beat(?:ing)?|defeat(?:ing)?|rival|opponent|enemy)\b/i;

// A small stable number from the words, so the same idea always casts the same way.
function hashOf(text) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function roleOf(text) {
  return ROLES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function sexOf(text) {
  const female = FEMALE.test(text);
  const male = MALE.test(text);
  return female === male ? null : female ? "female" : "male";
}

function bodyFor(role, sex) {
  if (ONE_BODY[role]) return ONE_BODY[role];
  return `${role ?? "athlete"}-${sex}`;
}

function look(body, sex, key, top) {
  const female = sex === "female";
  return {
    ...(female ? DEFAULT_HERO : DEFAULT_RIVAL),
    body,
    hair: female ? (key % 2 ? "long" : "buns") : key % 2 ? "simple-parted" : "buzzed",
    skinTone: SKIN_TONES[key % SKIN_TONES.length],
    top: top ?? (female ? DEFAULT_HERO.top : DEFAULT_RIVAL.top),
  };
}

// The hero and the rival for an idea (and the game it became). Plain words in, two looks out.
export function castFor({ text = "", template = null } = {}) {
  const words = String(text);
  const split = words.search(AGAINST);
  const mine = split >= 0 ? words.slice(0, split) : words;
  const theirs = split >= 0 ? words.slice(split) : "";
  const key = hashOf(`${words}|${template ?? ""}`);

  const role = roleOf(mine) ?? (theirs ? null : THEMES[template] ?? null);
  const sex = ONE_BODY[role] ? "male" : sexOf(mine) ?? (key % 2 ? "male" : "female");
  const top = COLOURS.find(([pattern]) => pattern.test(mine))?.[1] ?? null;
  const hero = look(bodyFor(role, sex), sex, key, top);

  const theirRole = roleOf(theirs);
  const theirSex = ONE_BODY[theirRole] ? "male" : sexOf(theirs) ?? (sex === "male" ? "female" : "male");
  let rival = look(bodyFor(theirRole, theirSex), theirSex, key >>> 3, theirSex === "female" ? DEFAULT_HERO.top : DEFAULT_RIVAL.top);
  // Two of the same body side by side would be hard to tell apart.
  if (rival.body === hero.body) rival = look(bodyFor(null, sex === "male" ? "female" : "male"), sex === "male" ? "female" : "male", key >>> 3);
  if (rival.top === hero.top) rival = { ...rival, top: hero.top === DEFAULT_RIVAL.top ? DEFAULT_HERO.top : DEFAULT_RIVAL.top };
  return { hero, rival };
}

// Whether the words say anything about who to play as, so a model's own choice can be checked.
export function namesSomeone(text = "") {
  const words = String(text);
  const split = words.search(AGAINST);
  const mine = split >= 0 ? words.slice(0, split) : words;
  return Boolean(roleOf(mine) || sexOf(mine));
}
