// Picks the provider once per server process. TAKSH_PROVIDER=fixture forces fixtures. GLM-5.3 is used
// whenever ZAI_API_KEY is set (or TAKSH_PROVIDER=glm), then Claude, then fixtures.
import { checkClaude, createClaudeProvider } from "./provider-claude.js";
import { createFixtureProvider } from "./provider-fixture.js";
import { createGlmProvider, glmConfigured } from "./provider-glm.js";

let cached = null;

export async function getProvider() {
  cached ??= resolveProvider();
  return cached;
}

async function resolveProvider() {
  const wanted = process.env.TAKSH_PROVIDER;
  if (wanted === "fixture") {
    return { provider: createFixtureProvider(), reason: "TAKSH_PROVIDER is set to fixture." };
  }
  if (wanted === "glm" || (!wanted && glmConfigured())) {
    if (glmConfigured()) return { provider: createGlmProvider(), reason: null };
    return { provider: createFixtureProvider(), reason: "TAKSH_PROVIDER is glm but ZAI_API_KEY is not set." };
  }
  const check = await checkClaude();
  if (check.ok) return { provider: createClaudeProvider({ model: check.model }), reason: null };
  return { provider: createFixtureProvider(), reason: check.reason };
}
