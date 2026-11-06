// Picks the provider once per server process. TAKSH_PROVIDER=fixture forces fixtures.
import { checkClaude, createClaudeProvider } from "./provider-claude.js";
import { createFixtureProvider } from "./provider-fixture.js";

let cached = null;

export async function getProvider() {
  cached ??= resolveProvider();
  return cached;
}

async function resolveProvider() {
  if (process.env.TAKSH_PROVIDER === "fixture") {
    return { provider: createFixtureProvider(), reason: "TAKSH_PROVIDER is set to fixture." };
  }
  const check = await checkClaude();
  if (check.ok) return { provider: createClaudeProvider({ model: check.model }), reason: null };
  return { provider: createFixtureProvider(), reason: check.reason };
}
