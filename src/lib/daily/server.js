// Server-only. Today's challenge: read it from Arkiv, or make it on 0G, store it and read again, so
// every instance serves the earliest stored game for the date.
import { specHash } from "../arkiv/schema.js";
import { canWrite, readDaily, writeDaily } from "../arkiv/store.js";
import { generateGame } from "../pipeline/pipeline.js";
import { getProvider } from "../pipeline/provider.js";
import { addDays, dayKey, fallbackSpec, themeFor } from "./daily.js";

// read(date) -> stored | null, write(input) -> { key } | null when writes are off,
// make(theme) -> { spec, requestId } | null when 0G isn't the provider. create is false for past dates.
export async function resolveDaily(date, { read, write, make, create }) {
  const theme = themeFor(date);
  const fallback = (reason) => ({ date, theme: theme.idea, spec: fallbackSpec(date), source: "starter", requestId: null, key: null, reason });
  const stored = (entity) => ({ ...entity, source: "0g", reason: null });

  let found;
  try {
    found = await read(date);
  } catch {
    return fallback("Arkiv did not respond, so this is the starter game for today.");
  }
  if (found) return stored(found);
  if (!create) return fallback("No 0G challenge was stored for this date, so this was the starter game.");
  if (!write) return fallback("Arkiv writes are off on this server, so today's game can't be shared and this is the starter game.");

  let made;
  try {
    made = await make(theme);
  } catch (error) {
    return fallback(`0G could not make today's game (${error.message}), so this is the starter game.`);
  }
  if (!made) return fallback("0G is not connected, so this is the starter game for today.");

  // Another instance may have stored one while 0G was working. Take theirs and drop ours.
  const raced = await read(date).catch(() => null);
  if (raced) return stored(raced);
  let written;
  try {
    written = await write({ date, theme: theme.idea, requestId: made.requestId, spec: made.spec });
  } catch {
    return fallback("Arkiv could not store today's game, so this is the starter game.");
  }
  // Read again: if two instances wrote, both now serve the earliest. A read that lags the write serves ours.
  const settled = await read(date).catch(() => null);
  return stored(settled ?? { key: written.key, date, theme: theme.idea, requestId: made.requestId, spec: made.spec });
}

async function make(theme) {
  const { provider } = await getProvider();
  if (provider.source !== "0g") return null;
  const generated = await generateGame({ idea: theme.idea, brief: theme.brief }, provider);
  if (!generated.ok) throw new Error(`the game failed validation: ${generated.errors[0]}`);
  const requestId = generated.traces?.at(-1)?.requestId;
  if (!requestId) throw new Error("0G returned no request ID");
  return { spec: generated.spec, requestId };
}

const live = { read: readDaily, write: writeDaily, make };

// One resolve per date per instance at a time. A stored 0G game is kept; a starter game is retried
// after two minutes, so a 0G or Arkiv hiccup at midnight doesn't stick for the day.
// ponytail: per-process cache, one entry per date. Prune old dates if a process lives for months.
const RETRY_MS = 120_000;
const cache = new Map();

export function dailyChallenge(date, now = Date.now()) {
  const hit = cache.get(date);
  if (hit && (hit.kept || now - hit.at < RETRY_MS)) return hit.promise;
  const entry = { at: now, kept: false };
  const deps = { ...live, write: canWrite() ? live.write : null, create: date === dayKey(now) };
  entry.promise = resolveDaily(date, deps).then(async (challenge) => {
    entry.kept = challenge.source === "0g";
    return { ...challenge, hash: await specHash(challenge.spec) };
  });
  cache.set(date, entry);
  return entry.promise;
}

// A round started before midnight can still post to yesterday's board.
export const openDates = (now = Date.now()) => [dayKey(now), addDays(dayKey(now), -1)];
