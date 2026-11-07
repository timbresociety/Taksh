// What /api/rival/decide really got back from 0G, by request ID and round. An episode is stored only
// if its plans are these, so nobody can put made-up or borrowed 0G decisions on 0G Storage.
//
// With ARKIV_PRIVATE_KEY set, every decision is also written to Arkiv (src/lib/arkiv/ledger.js), so
// a round can be checked by whichever server instance gets the upload. Memory is the cache, and
// the guard against two uploads of one round racing on the same instance. Next bundles each route
// on its own, so the maps sit on globalThis, the one place both rival routes see.
// ponytail: two instances racing on one round can both store it, seconds apart. Harmless: same
// round, same score. A compare-and-set store would close it.
import { readRound, writeDecision, writeSpent } from "../arkiv/ledger.js";
import { arkivCause } from "../arkiv/store.js";

const issued = (globalThis.__takshRivalLedger ??= new Map()); // requestId -> decision
const rounds = (globalThis.__takshRivalRounds ??= new Map()); // roundId -> "pending" | "spent"
const LIMIT = 5000;
export const ROUND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const bound = (map) => {
  if (map.size > LIMIT) map.delete(map.keys().next().value);
};
const onArkiv = () => Boolean(process.env.ARKIV_PRIVATE_KEY);

// The server picks a round's ID on its first decision; the browser sends it back on the rest.
export function roundIdFor(sent) {
  return typeof sent === "string" && ROUND_ID.test(sent) && rounds.get(sent) !== "spent" ? sent : globalThis.crypto.randomUUID();
}

// Returns the Arkiv write, or null with Arkiv off. The route runs it after the response.
export function recordDecision(requestId, decision) {
  issued.set(requestId, decision);
  bound(issued);
  return onArkiv() ? writeDecision(requestId, decision) : null;
}

// Everything known about a round: its decisions in the order they were served, and whether it is
// already stored. It starts when its first decision was asked for, on the server's clock.
export async function loadRound(roundId) {
  const local = [...issued].filter(([, decision]) => decision.roundId === roundId).map(([requestId, decision]) => ({ requestId, ...decision }));
  const none = { records: [], spent: false, full: false };
  // An Arkiv outage or 429 leaves this instance's own memory, so a round served here still stores.
  let reason = onArkiv() ? null : "Arkiv writes are off on this server";
  const remote = onArkiv()
    ? await readRound(roundId).catch((error) => {
        reason = arkivCause(error);
        console.error("rival ledger read failed:", reason);
        return none;
      })
    : none;
  const records = [...new Map([...remote.records, ...local].map((record) => [record.requestId, record])).values()].sort((a, b) => a.issuedAt - b.issuedAt);
  return {
    roundId,
    records,
    spent: remote.spent || rounds.get(roundId) === "spent",
    full: remote.full,
    // What the player is shown: how many decisions came back from Arkiv, one to open, or why none did.
    arkiv: { read: remote.records.length, key: remote.records.find((record) => record.key)?.key ?? null, reason },
    startedAt: records.length ? Math.min(...records.map((record) => record.askedAt)) : null,
  };
}

// Claims a round for one upload. Call it in the same synchronous step as checkEpisode.
export function reserveRound(roundId) {
  if (rounds.has(roundId)) return false;
  rounds.set(roundId, "pending");
  bound(rounds);
  return true;
}

export function releaseRound(roundId) {
  if (rounds.get(roundId) === "pending") rounds.delete(roundId);
}

// Returns the Arkiv write, or null. Memory says spent at once, so this instance refuses a repeat.
export function spendRound(roundId, rootHash) {
  rounds.set(roundId, "spent");
  return onArkiv() ? writeSpent(roundId, rootHash) : null;
}
