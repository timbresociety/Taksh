// Every write costs the writer wallet gas. X-Forwarded-For can be spoofed, so the per-client gap only
// slows honest clients. The global budget is what caps the wallet, whoever is asking.
// ponytail: in-memory and per server process, swap for a shared store if this runs on more than one.
const lastWrite = new Map();
const recent = [];
const GLOBAL_WRITES_PER_MINUTE = 20;
export function throttle(request, ms = 4000, now = Date.now()) {
  while (recent.length && now - recent[0] > 60000) recent.shift();
  if (recent.length >= GLOBAL_WRITES_PER_MINUTE) throw tooMany("Taksh is busy posting to Arkiv. Try again in a minute.");
  for (const [key, at] of lastWrite) if (now - at >= ms) lastWrite.delete(key);
  const client = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (lastWrite.has(client)) throw tooMany("Slow down: one post every few seconds.");
  lastWrite.set(client, now);
  recent.push(now);
}


const tooMany = (message) => Object.assign(new Error(message), { status: 429, expose: true });
