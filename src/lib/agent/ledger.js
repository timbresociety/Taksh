// What /api/rival/decide really got back from 0G, by request ID. An episode is only stored if every
// plan in it is one of these, so nobody can put made-up 0G decisions on 0G Storage under our wallet.
// ponytail: in-memory and per server process, bounded to the last 5000 decisions.
// Next bundles each route on its own, so a plain module Map would be one copy per route. globalThis
// is the one place /api/rival/decide and /api/rival/episode both see.
const issued = (globalThis.__takshRivalLedger ??= new Map());
const LIMIT = 5000;

export function recordDecision(requestId, decision) {
  issued.set(requestId, decision);
  if (issued.size > LIMIT) issued.delete(issued.keys().next().value);
}

// A decision backs one stored episode, once. It is spent only after the upload succeeds, so a round
// that failed to store (an empty wallet, say) can be sent again.
// ponytail: not bound to the caller. Add a per-round nonce from /api/rival/decide if rounds get stolen.
export const issuedDecision = (requestId) => {
  const decision = issued.get(requestId);
  return decision && !decision.spent ? decision : undefined;
};

export function spendDecisions(requestIds) {
  for (const id of requestIds) {
    const decision = issued.get(id);
    if (decision) decision.spent = true;
  }
}
