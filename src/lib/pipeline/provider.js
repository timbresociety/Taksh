// Picks the provider once per server process: 0G when OG_API_KEY is set, then Claude, then fixtures.
// TAKSH_PROVIDER=0g|claude|fixture forces one. A forced provider that can't be reached falls to fixtures.
import { checkClaude, createClaudeProvider } from "./provider-claude.js";
import { createFixtureProvider } from "./provider-fixture.js";
import { check0g, createOgProvider } from "./provider-0g.js";

let cached = null;
let cachedAt = 0;
const RETRY_FALLBACK_MS = 60000;

// A fallback is checked again after a minute, so one slow 0G /models answer doesn't leave the
// whole process on fixtures.
export async function getProvider() {
  if (cached && Date.now() - cachedAt > RETRY_FALLBACK_MS && (await cached).reason) cached = null;
  if (!cached) {
    cached = resolveProvider();
    cachedAt = Date.now();
  }
  return cached;
}

async function resolveProvider() {
  const forced = process.env.TAKSH_PROVIDER;
  if (forced === "fixture") {
    return { provider: createFixtureProvider(), reason: "TAKSH_PROVIDER is set to fixture." };
  }
  const reasons = [];
  if (!forced || forced === "0g") {
    const check = await check0g();
    if (check.ok) return { provider: createOgProvider({ model: check.model }), reason: null };
    reasons.push(check.reason);
  }
  if (!forced || forced === "claude") {
    const check = await checkClaude();
    if (check.ok) return { provider: createClaudeProvider({ model: check.model }), reason: null };
    reasons.push(check.reason);
  }
  return { provider: createFixtureProvider(), reason: reasons.join(" ") };
}
