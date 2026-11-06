// What Taksh stores on Arkiv, and how a score or a game turns into an entity. Pure, so the browser
// can hash a spec the same way the server does, and tests run without a network.
import { bytes, defineSchema, i32, str, u64 } from "@arkiv-network/sdk/schema";
import { STYLES, WORLDS } from "../spec/contract.js";
import { templateInfo } from "../templates/index.js";
import { isDate } from "../daily/daily.js";

// The dev writer wallet. A fresh clone with no key still reads the live board through it.
export const DEFAULT_WRITER = "0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30";
export const EXPLORER = "https://rabdi.explorer.arkiv.network";
export const MAX_NAME = 24;
// A score lives 30 days, so every board is the last month of play. The UI says so.
export const SCORE_DAYS = 30;
const BLOCK_SECONDS = 2; // Rabdi's block time, the SDK's BLOCK_TIME

// Whole days until an entity expires, from its $expiresAt block and the block the read was made at.
export const daysLeft = (expiresAt, block) => Math.max(0, Math.floor(((Number(expiresAt) - Number(block)) * BLOCK_SECONDS) / 86400));
const MAX_STR_BYTES = 128;

// Only the columns a query filters on are indexed. Sorting works on any column but bytes.
export const Scores = defineSchema("taksh.scores.v1", {
  template: str().indexed(),
  world: str().indexed(),
  style: str().indexed(),
  specHash: str().indexed(),
  mode: str().indexed(),
  score: i32().indexed(),
  player: str(),
  outcome: str(),
  actions: i32(),
  durationMs: i32(),
  // The UTC date of a daily-challenge round, so today's board is one eq(). Optional, so every score
  // posted before the daily challenge still reads under this schema, and other rounds leave it unset.
  daily: str().indexed().optional(),
});

export const Games = defineSchema("taksh.games.v1", {
  template: str().indexed(),
  world: str().indexed(),
  style: str().indexed(),
  specHash: str().indexed(),
  title: str(),
  author: str(),
  source: str(),
  publishedAt: u64(),
  spec: bytes(),
  // The game's Swarm collection: cover.webp, spec.json and index.html. Optional, so games
  // published before Swarm still read under this schema.
  swarmRef: str().optional(),
});

// Today's challenge: the game 0G made for one UTC date. Every instance reads it, so everyone plays the same game.
export const Daily = defineSchema("taksh.daily.v1", {
  date: str().indexed(),
  theme: str(),
  requestId: str(), // 0G's request ID for the call that made the spec
  spec: bytes(),
});

// Same JSON for the same spec, whatever order its keys were built in.
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// Lowercase hex, 64 characters, so it fits an indexed str column.
export async function specHash(spec) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJson(spec)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// str columns hold 128 bytes, not characters, so cut on a character boundary.
export function fitStr(text, maxBytes = MAX_STR_BYTES) {
  const encoder = new TextEncoder();
  let out = "";
  for (const char of String(text)) {
    if (encoder.encode(out + char).length > maxBytes) break;
    out += char;
  }
  return out;
}

export function cleanName(raw) {
  const name = String(raw ?? "").replace(/[\p{C}]/gu, "").trim().slice(0, MAX_NAME);
  return name || "anon";
}

const wholeNumber = (value, max = 2_147_483_647) => (Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0);
const OUTCOMES = ["win", "lose", "complete"];

export function scoreValues({ spec, hash, result, mode, player, daily }) {
  return {
    ...(isDate(daily) && { daily }),
    template: spec.template,
    world: spec.skin.world,
    style: spec.skin.style,
    specHash: hash,
    mode: mode === "camera" ? "camera" : "keyboard",
    score: wholeNumber(result?.score),
    player: cleanName(player),
    outcome: OUTCOMES.includes(result?.outcome) ? result.outcome : "complete",
    actions: wholeNumber(result?.actions),
    durationMs: wholeNumber(result?.ms),
  };
}

export function gameValues({ spec, hash, author, source, swarmRef, now = Date.now() }) {
  return {
    template: spec.template,
    world: spec.skin.world,
    style: spec.skin.style,
    specHash: hash,
    title: fitStr(spec.title),
    author: cleanName(author),
    source: fitStr(source ?? "template", 32),
    publishedAt: u64(BigInt(Math.floor(now / 1000))), // a bare bigint would be a u256
    spec: new TextEncoder().encode(stableJson(spec)),
    ...(swarmRef && { swarmRef }),
  };
}

export function dailyValues({ date, theme, requestId, spec }) {
  return { date, theme: fitStr(theme), requestId: fitStr(requestId, 64), spec: new TextEncoder().encode(stableJson(spec)) };
}

// bytes come back as hex.
export function readSpecBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const raw = new Uint8Array(clean.match(/../g)?.map((pair) => parseInt(pair, 16)) ?? []);
  return JSON.parse(new TextDecoder().decode(raw));
}

// Typed values arrive as { type, value }. The UI wants plain JSON, and bigint can't be serialised.
export function plainRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([name, cell]) => {
      const value = cell && typeof cell === "object" && "value" in cell ? cell.value : cell;
      return [name.replace(/^\$/, ""), typeof value === "bigint" ? Number(value) : value];
    }),
  );
}

export const ENTITY_KEY = /^0x[0-9a-f]{64}$/i;
export const SPEC_HASH = /^[0-9a-f]{64}$/;

// A board's scope from query parameters. Anything unknown is refused, not passed to the node.
// A daily board is one date across the day's game, so it needs no template.
export function readScope(params) {
  const daily = params.get("daily");
  if (daily) {
    if (!isDate(daily)) throw new Error(`Unknown daily "${daily}".`);
    const mode = params.get("mode");
    if (mode && mode !== "camera" && mode !== "keyboard") throw new Error(`Unknown mode "${mode}".`);
    return mode ? { daily, mode } : { daily };
  }
  const scope = { template: params.get("template") };
  if (!templateInfo(scope.template)) throw new Error(`Unknown template "${scope.template}".`);
  const checks = {
    world: (v) => WORLDS.some((w) => w.id === v),
    style: (v) => STYLES.some((s) => s.id === v),
    hash: (v) => SPEC_HASH.test(v),
    mode: (v) => v === "camera" || v === "keyboard",
  };
  for (const [name, ok] of Object.entries(checks)) {
    const value = params.get(name);
    if (!value) continue;
    if (!ok(value)) throw new Error(`Unknown ${name} "${value}".`);
    scope[name] = value;
  }
  return scope;
}
