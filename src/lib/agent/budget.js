// A global cap on paid calls per minute, whoever is asking. Client IDs can be faked, so this is what
// actually bounds what a stranger can spend from the 0G balance or the storage wallet.
// ponytail: in-memory and per server process, swap for a shared store if this runs on more than one.
export function createBudget(perMinute) {
  const recent = [];
  return function spend(now = Date.now()) {
    while (recent.length && now - recent[0] > 60000) recent.shift();
    if (recent.length >= perMinute) throw Object.assign(new Error("Taksh is busy. Try again in a minute."), { status: 429, expose: true });
    recent.push(now);
  };
}
