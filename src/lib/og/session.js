// The signed-in player's 0G session, for any browser call that spends 0G compute. Kept outside React and
// Privy so plain modules (the rival brain, the mic) can attach it without importing either.
let current = null;

export function setOgSession(session) {
  current = session;
}

// The server bills the player's iAI credits when this header is present, and the app's key when it isn't.
export const ogHeaders = () => (current ? { "x-0g-session": current } : {});

// 0G's Privy app only accepts these origins, so sign-in, and the gate that asks for it, exist only here.
export function signInAvailable(location = globalThis.location) {
  return location?.hostname === "localhost" && ["3000", "3001", "5173"].includes(location.port);
}

// iAI credits refresh at 00:00 UTC and unused ones expire, so the time left is the reason to play today.
export function msUntilReset(now = Date.now()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime() - now;
}

// Sums the 0G cost (USD) of a game build's traces or a round's rival decisions.
export const costOf = (items = []) => items.reduce((sum, item) => sum + (item?.costUsd ?? 0), 0);
