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

export const issuedDecision = (requestId) => issued.get(requestId);
