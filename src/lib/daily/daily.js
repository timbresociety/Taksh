// Today's challenge: one game per UTC date. Pure, so the browser, the server and the tests agree on
// what "today" is and which game a date falls back to.
import { starterSpec } from "../spec/starter.js";

export const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

// UTC, so every server instance and every player switches to the next game at the same moment.
export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

export const dayNumber = (date) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

export const addDays = (date, days) => dayKey(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);

export const msUntilNextDay = (now = Date.now()) => DAY_MS - (now % DAY_MS);

// A real calendar date, not just the right shape: "2026-02-30" is refused.
export const isDate = (value) => DATE.test(value ?? "") && dayKey(Date.parse(`${value}T00:00:00Z`) || 0) === value;

// 0G turns the theme into a game. The brief pins the template, so the day's game is always one we can build.
export const THEMES = [
  { idea: "Dahi Handi on a crowded Mumbai street, climb the human tower and break the pot", template: "handi", world: "mumbai", style: "comic" },
  { idea: "Slice flying mangoes at a Mumbai fruit stall before they hit the ground", template: "chop", world: "mumbai", style: "bright" },
  { idea: "Row a Koli fishing boat along Marine Drive at sunset", template: "oars", world: "marine_drive", style: "toon" },
  { idea: "Hop across Diwali rooftops from diya to diya", template: "hop", world: "diwali", style: "bright" },
  { idea: "Keep the beat on matka pots at a village festival", template: "matka", world: "village", style: "toon" },
  { idea: "Run a dabbawala's lunch route and catch every tiffin", template: "dabba", world: "mumbai", style: "toon" },
  { idea: "Box a rival under neon lights in a space station ring", template: "bout", world: "station", style: "neon" },
  { idea: "Save shots in a pixel forest goal", template: "guard", world: "forest", style: "pixel" },
  { idea: "Steer a kaali peeli rickshaw through Mumbai traffic", template: "rickshaw", world: "mumbai", style: "bright" },
  { idea: "Strike the poses a dancer calls on Juhu beach", template: "poses", world: "marine_drive", style: "bright" },
  { idea: "Break rangoli tiles with a paddle and ball on Diwali night", template: "rangoli", world: "diwali", style: "bright" },
  { idea: "Whack the monkeys popping out of potholes in the village", template: "popup", world: "village", style: "bright" },
  { idea: "A cardio circuit on the moon, low gravity and quick reps", template: "circuit", world: "moon", style: "toon" },
  { idea: "Duel Ravana's blades on a Diwali night, comic style", template: "blades", world: "diwali", style: "comic" },
];

export function themeFor(date) {
  const theme = THEMES[((dayNumber(date) % THEMES.length) + THEMES.length) % THEMES.length];
  return { ...theme, brief: { template: theme.template, world: theme.world, style: theme.style, goal: theme.idea } };
}

// Without 0G or Arkiv, every instance still serves the same game for a date: the theme's template,
// its starter look, seeded by the date.
export function fallbackSpec(date) {
  return starterSpec(themeFor(date).template, dayNumber(date));
}

// Two instances can both write a challenge for one date. Everyone takes the earliest: lowest
// $createdAt block, then lowest key when both landed in one block.
export function pickEarliest(rows) {
  const block = (row) => (row.$createdAt == null ? null : BigInt(row.$createdAt));
  return [...rows].sort((a, b) => {
    const [x, y] = [block(a), block(b)];
    if (x !== y) {
      if (x == null) return 1;
      if (y == null) return -1;
      return x < y ? -1 : 1;
    }
    return a.$key.toLowerCase() < b.$key.toLowerCase() ? -1 : 1;
  })[0] ?? null;
}
