// Who the player plays as, and who they face. Some games always have their own people: Koli Race is
// rowed by a Koli fisherman and Dabba Catch is run by a dabbawala, and Ravana waits in the ring in the
// boxing games unless the player names someone else. Otherwise a role the player names wins (a ranger,
// a villager, Ravana), then any he or she in the words. With nothing said the hero is a man, unless the
// game or the idea feels feminine (Rangoli Breaker, a dance).
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

// Games whose hero is always their own person, whatever the words.
const ALWAYS = { oars: "fisherman", dabba: "dabbawala" };
// A game whose world has its own people starts with one of them unless the player names another.
const THEMES = { popup: "peasant" };
// The rival a game starts with unless the player names one.
const RIVALS = { bout: "ravana", pads: "ravana" };
// What makes a hero a woman when nobody said: a game or an idea that feels feminine.
const FEMININE_GAMES = new Set(["rangoli"]);
const FEMININE = /\b(danc\w*|garba|dandiya|zumba|aerobics|ballet|rangoli|mehe?n?di)\b/i;

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

  const role = ALWAYS[template] ?? roleOf(mine) ?? THEMES[template] ?? null;
  const feminine = FEMININE_GAMES.has(template) || FEMININE.test(mine);
  const sex = ONE_BODY[role] ? "male" : sexOf(mine) ?? (feminine ? "female" : "male");
  const top = COLOURS.find(([pattern]) => pattern.test(mine))?.[1] ?? null;
  const hero = look(bodyFor(role, sex), sex, key, top);

  const named = roleOf(theirs);
  const theirRole = named ?? (sexOf(theirs) ? null : RIVALS[template] ?? null);
  const theirSex = ONE_BODY[theirRole] ? "male" : sexOf(theirs) ?? "male";
  let rival = look(bodyFor(theirRole, theirSex), theirSex, key >>> 3, DEFAULT_RIVAL.top);
  // Ravana can't box Ravana: one of a kind faces an athlete instead.
  if (ONE_BODY[rival.body] && rival.body === hero.body) rival = look("athlete-male", "male", key >>> 3, DEFAULT_RIVAL.top);
  // Two athletes alike are told apart by their clothes and hair.
  if (rival.top === hero.top) rival = { ...rival, top: hero.top === DEFAULT_RIVAL.top ? "#ffd23f" : DEFAULT_RIVAL.top };
  if (rival.body === hero.body && rival.hair === hero.hair) rival = { ...rival, hair: hero.hair === "buzzed" ? "simple-parted" : "buzzed" };
  return { hero, rival };
}
