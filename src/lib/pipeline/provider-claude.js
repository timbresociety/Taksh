// Claude provider. Server-side only: credentials come from the environment and never reach the client.
import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-opus-5-5";

// Low effort keeps the intent step fast. Generation needs enough thought to fit the idea to a template.
const EFFORT = { intent: "low", generate: "medium", revise: "medium", level: "low" };
const MAX_TOKENS = { intent: 4000, generate: 16000, revise: 16000, level: 1500 };

export function createClaudeProvider({ model = process.env.TAKSH_MODEL || DEFAULT_MODEL, effort = {}, client = new Anthropic() } = {}) {
  return {
    source: "claude",
    model,
    async complete({ stage, system, user, schema }) {
      const startedAt = Date.now();
      const response = await client.beta.messages.create({
        model,
        max_tokens: MAX_TOKENS[stage],
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        messages: [{ role: "user", content: user }],
        output_config: {
          effort: effort[stage] ?? EFFORT[stage],
          format: { type: "json_schema", schema },
        },
      });

      if (response.stop_reason === "refusal") throw new Error("The model declined this idea. Try rewording it.");
      if (response.stop_reason === "max_tokens") throw new Error("The model ran out of room before finishing.");

      const block = response.content.find((item) => item.type === "text");
      if (!block) throw new Error("The model returned no text.");
      return { data: JSON.parse(block.text), ms: Date.now() - startedAt, usage: response.usage };
    },
  };
}

// Confirms the configured model is reachable with this project's own credentials.
export async function checkClaude(model = process.env.TAKSH_MODEL || DEFAULT_MODEL) {
  try {
    await new Anthropic().models.retrieve(model);
    return { ok: true, model };
  } catch (error) {
    return { ok: false, model, reason: error.message.split("\n")[0] };
  }
}
