// Picks the provider: 0G when OG_API_KEY is set, then Claude, then fixtures. A fallback is checked again after a minute.
// TAKSH_PROVIDER=0g|claude|fixture forces one. A forced provider that can't be reached falls to fixtures.
import { checkClaude, createClaudeProvider } from "./provider-claude.js";
import { createFixtureProvider } from "./provider-fixture.js";
import { check0g, createOgProvider } from "./provider-0g.js";

// A reached provider is kept for the process, and so is a forced TAKSH_PROVIDER=fixture. A fallback
// is checked again after a minute, so one slow 0G /models answer doesn't leave the whole process on
// fixtures, or on Claude, until it restarts.
const RETRY_FALLBACK_MS = 60_000;
let cached = null;

export async function getProvider() {
  if (cached && (cached.kept || Date.now() - cached.at < RETRY_FALLBACK_MS)) return cached.promise;
  const entry = { at: Date.now(), kept: false };
  entry.promise = resolveProvider().then((result) => {
    entry.kept = result.reason === null || process.env.TAKSH_PROVIDER === "fixture";
    return result;
  });
  cached = entry;
  return entry.promise;
}

// reason is null only for the provider we meant to use. Claude standing in for a configured 0G
// carries 0G's failure, so /api/status shows it and the next minute tries 0G again.
export async function resolveProvider({ og = check0g, claude = checkClaude } = {}) {
  const forced = process.env.TAKSH_PROVIDER;
  if (forced === "fixture") {
    return { provider: createFixtureProvider(), reason: "TAKSH_PROVIDER is set to fixture." };
  }
  const reasons = [];
  if (!forced || forced === "0g") {
    const check = await og();
    if (check.ok) return { provider: createOgProvider({ model: check.model }), reason: null };
    reasons.push(check.reason);
  }
  if (!forced || forced === "claude") {
    const check = await claude();
    const ogFailed = reasons.length > 0 && Boolean(process.env.OG_API_KEY);
    if (check.ok) return { provider: createClaudeProvider({ model: check.model }), reason: ogFailed ? `On Claude until 0G answers. ${reasons.join(" ")}` : null };
    reasons.push(check.reason);
  }
  return { provider: createFixtureProvider(), reason: reasons.join(" ") };
}
