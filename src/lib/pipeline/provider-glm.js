// GLM-5.3 provider, through Z.ai's OpenAI-compatible chat API. Server-side only: the key comes from
// the environment and never reaches the client.
//
// GLM always thinks before it answers, and at high effort that can take minutes, so the reply is
// streamed: reasoning arrives as it is produced, which keeps the connection busy, and only the answer
// is kept. The API has a JSON mode but no schema mode, so the schema goes into the system prompt and
// the caller validates the result in code, as it does for every provider.

export const DEFAULT_MODEL = "glm-5.3";
export const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";
const DEFAULT_TIMEOUT_MS = 240000; // under a Vercel function's 300 s, so a slow call fails cleanly and is retried

// Effort per stage: reading a request is quick, drafting needs real thought.
const EFFORT = { intent: "low", generate: "high", revise: "high", triage: "low", draft: "high", repair: "high" };
const MAX_TOKENS = { intent: 8000, triage: 8000 };

// A failure says whether trying again could help, so a workflow step knows whether to retry.
export class ProviderError extends Error {
  constructor(message, { status = null, retryable = false, retryAfterMs = null, reason = null } = {}) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.reason = reason ?? (status === 401 || status === 403 ? "setup" : null); // setup: a key or account problem, not the request
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

export function schemaInstruction(schema) {
  return [
    "Answer with one JSON object and nothing else: no markdown fences, no text before or after it.",
    "It must match this JSON Schema exactly, with every required field present and no extra fields:",
    JSON.stringify(schema),
  ].join("\n");
}

// Models sometimes wrap JSON in a fence or add a sentence despite JSON mode.
export function parseJsonReply(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {}
    }
    throw new ProviderError("The model's answer was not valid JSON.", { retryable: true });
  }
}

function failure(status, body, headers) {
  const detail = body?.error?.message ?? body?.message ?? "";
  if (status === 429) {
    const seconds = Number(headers.get("retry-after"));
    return new ProviderError(`GLM is rate limited. ${detail}`.trim(), { status, retryable: true, retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 30000 });
  }
  if (status >= 500) return new ProviderError(`GLM failed (${status}). ${detail}`.trim(), { status, retryable: true });
  return new ProviderError(`GLM refused the request (${status}). ${detail}`.trim(), { status, retryable: false, reason: status === 401 || status === 403 ? "setup" : "request" });
}

// Reads an OpenAI-style event stream and returns the answer text, the finish reason and usage.
async function readStream(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = 0;
  let finish = null;
  let usage = null;
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      const choice = event.choices?.[0];
      if (choice?.delta?.content) content += choice.delta.content;
      if (choice?.delta?.reasoning_content) reasoning += choice.delta.reasoning_content.length;
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (event.usage) usage = event.usage;
    }
  }
  return { content, finish, usage, reasoningChars: reasoning };
}

export function createGlmProvider({
  apiKey = process.env.ZAI_API_KEY,
  model = process.env.GLM_MODEL || DEFAULT_MODEL,
  baseUrl = process.env.GLM_BASE_URL || DEFAULT_BASE_URL,
  timeoutMs = Number(process.env.GLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  effort = {},
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    source: "glm",
    model,
    async complete({ stage, system, user, schema }) {
      if (!apiKey) throw new ProviderError("ZAI_API_KEY is not set.", { retryable: false, reason: "setup" });
      const startedAt = Date.now();
      let response;
      try {
        response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: `${system}\n\n${schemaInstruction(schema)}` },
              { role: "user", content: user },
            ],
            thinking: { type: "enabled" },
            reasoning_effort: effort[stage] ?? EFFORT[stage] ?? "high",
            response_format: { type: "json_object" },
            max_tokens: MAX_TOKENS[stage] ?? 32000,
            stream: true,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
        throw new ProviderError(timedOut ? `GLM did not answer within ${Math.round(timeoutMs / 1000)} s.` : `Could not reach GLM: ${error.message}`, { retryable: true });
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw failure(response.status, body, response.headers);
      }

      let reply;
      try {
        reply = await readStream(response.body);
      } catch (error) {
        const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
        throw new ProviderError(timedOut ? `GLM was still thinking after ${Math.round(timeoutMs / 1000)} s.` : `The GLM stream broke: ${error.message}`, { retryable: true });
      }
      if (reply.finish === "length") throw new ProviderError("GLM ran out of room before finishing.", { retryable: true });
      if (reply.finish === "sensitive") throw new ProviderError("GLM declined this request. Try rewording it.", { retryable: false, reason: "declined" });
      if (!reply.content.trim()) throw new ProviderError("GLM returned no answer.", { retryable: true });
      return { data: parseJsonReply(reply.content), ms: Date.now() - startedAt, usage: reply.usage, reasoningChars: reply.reasoningChars };
    },
  };
}

export const glmConfigured = () => Boolean(process.env.ZAI_API_KEY);
