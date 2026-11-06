// What /api/rival/decide really got back from 0G, by request ID, and the round each decision belongs
// to. An episode is stored only if every plan in it is one of these, all from one round, so nobody
// can put made-up or borrowed 0G decisions on 0G Storage under our wallet.
// ponytail: in-memory and per server process, bounded. Next bundles each route on its own, so a plain
// module Map would be one copy per route. globalThis is the one place both routes see.
const issued = (globalThis.__takshRivalLedger ??= new Map());
const rounds = (globalThis.__takshRivalRounds ??= new Map());
const LIMIT = 5000;

const bound = (map) => {
  if (map.size > LIMIT) map.delete(map.keys().next().value);
};

// A round opens on its first decision. Its start time is the server's, so a stored round can't claim
// more game time than really passed.
export function openRound(roundId, now = Date.now()) {
  const known = rounds.get(roundId);
  if (known && !known.state) return roundId;
  const id = globalThis.crypto.randomUUID();
  rounds.set(id, { startedAt: now, requestIds: [] });
  bound(rounds);
  return id;
}

export function recordDecision(requestId, decision) {
  issued.set(requestId, decision);
  rounds.get(decision.roundId)?.requestIds.push(requestId);
  bound(issued);
}

export const issuedDecision = (requestId) => {
  const decision = issued.get(requestId);
  return decision && !decision.state ? decision : undefined;
};

export const openRoundInfo = (roundId) => {
  const round = rounds.get(roundId);
  return round && !round.state ? round : undefined;
};

// A round and its decisions back one stored episode, once. checkEpisode reserves them in the same
// synchronous step as the check, so two uploads racing can't both pass. A failed upload releases them,
// so a round that failed to store (an empty wallet, say) can be sent again.
function mark(roundId, requestIds, state) {
  const round = rounds.get(roundId);
  if (round) round.state = state;
  for (const id of requestIds) {
    const decision = issued.get(id);
    if (decision) decision.state = state;
  }
}
export const reserveRound = (roundId, requestIds) => mark(roundId, requestIds, "pending");
export const releaseRound = (roundId, requestIds) => mark(roundId, requestIds, undefined);
export const spendRound = (roundId, requestIds) => mark(roundId, requestIds, "spent");
