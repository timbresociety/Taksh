// 0G provider. Calls the 0G Compute Router (OpenAI-compatible) on the private tier, so prompts are
// served only by TEE (TeeML) providers. Server-side only: the sk- key never reaches the client.
// Every reply carries x_0g_trace, which is passed up as `trace` so the UI can show the request ID.
export const OG_BASE_URL = "https://router-api.0g.ai/v1";
export const OG_DEFAULT_MODEL = "glm-5.3";
export const OG_TRUST_MODE = "private";

const MAX_TOKENS = { intent: 4000, generate: 16000, revise: 16000, rival: 400 };
// Thinking stays off: with it on, generate took 31 to 39 s and still made the same mistakes (eval, 2026-11-06).
// ponytail: fixed USD-per-1M-token ceilings, filtered by the router before failover. Move to env when a pricier model is needed.
const MAX_PRICE = { prompt: "3", completion: "10" };
const TIMEOUT_MS = 120000;

export function createOgProvider({ model = process.env.OG_MODEL || OG_DEFAULT_MODEL, apiKey = process.env.OG_API_KEY, fetch = globalThis.fetch } = {}) {
  return {
    source: "0g",
    model,
    trustMode: OG_TRUST_MODE,
    async complete({ stage, system, user, schema }) {
      const startedAt = Date.now();
      const body = {
        model,
        max_tokens: MAX_TOKENS[stage],
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: `taksh_${stage}`, strict: true, schema } },
      };
      const json = await post(fetch, apiKey, body);
      const choice = json.choices?.[0];
      if (choice?.finish_reason === "length") throw ogError("The model ran out of room before finishing.", 502, json);
      const text = choice?.message?.content;
      if (!text) throw ogError("The model returned no text.", 502, json);
      return { data: parseJson(text, json), ms: Date.now() - startedAt, usage: json.usage, trace: readTrace(json) };
    },
  };
}

async function post(fetch, apiKey, body, retried = false) {
  const response = await fetch(`${OG_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-0G-Provider-Trust-Mode": OG_TRUST_MODE,
      "X-0G-Provider-Max-Price-Usd-Prompt": MAX_PRICE.prompt,
      "X-0G-Provider-Max-Price-Usd-Completion": MAX_PRICE.completion,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await response.json().catch(() => ({}));
  if (response.ok) return json;

  // 429 and 502/503 can clear in seconds. Everything else needs a changed request, per the router docs.
  if (!retried && [429, 502, 503].includes(response.status)) {
    const wait = Math.min(Number(response.headers.get("retry-after")) || 1, 5) * 1000;
    await new Promise((resolve) => setTimeout(resolve, wait));
    return post(fetch, apiKey, body, true);
  }
  throw ogError(MESSAGES[response.status] ?? "The game generator did not respond. Try again.", response.status, json);
}

// What the player sees. Exposed because none of it leaks a key or a prompt.
const MESSAGES = {
  401: "The 0G API key was rejected. Check OG_API_KEY.",
  402: "The 0G compute balance is empty. Top it up at pc.0g.ai.",
  429: "0G is rate limiting this app. Wait a few seconds and try again.",
  503: "No private 0G provider is free right now. Try again in a minute.",
};

function ogError(message, status, json) {
  const requestId = json?.request_id ?? json?.x_0g_trace?.request_id;
  return Object.assign(new Error(message), { status, expose: true, requestId, code: json?.error?.code });
}

function parseJson(text, json) {
  try {
    return JSON.parse(text);
  } catch {
    throw ogError("The model returned malformed JSON.", 502, json);
  }
}

// The router reports cost in USD micro-units today, though its docs still describe neuron. Read both.
export function readTrace(json) {
  const trace = json.x_0g_trace;
  if (!trace?.request_id) return null;
  const billing = trace.billing ?? {};
  const usdMicro = billing.total_cost_usd_micro ?? (billing.currency === "usd" ? billing.total_cost : null);
  return {
    requestId: trace.request_id,
    provider: trace.provider ?? null,
    trustMode: OG_TRUST_MODE,
    costUsd: usdMicro == null ? null : Number(usdMicro) / 1e6,
    costNeuron: usdMicro == null ? billing.total_cost ?? null : null,
  };
}

// The model list needs no key. A model counts only if it has a TeeML provider, or private requests would 503.
export async function check0g({ model = process.env.OG_MODEL || OG_DEFAULT_MODEL, fetch = globalThis.fetch } = {}) {
  if (!process.env.OG_API_KEY) return { ok: false, model, reason: "OG_API_KEY is not set." };
  try {
    const response = await fetch(`${OG_BASE_URL}/models`, { signal: AbortSignal.timeout(10000) });
    const { data = [] } = await response.json();
    const entry = data.find((item) => item.id === model);
    if (!entry) return { ok: false, model, reason: `0G does not serve ${model}.` };
    if (entry.verifiability !== "TeeML") return { ok: false, model, reason: `${model} has no private (TeeML) provider on 0G.` };
    return { ok: true, model };
  } catch (error) {
    return { ok: false, model, reason: `0G router unreachable: ${error.message}` };
  }
}

// Speech to text on the same private tier, so a spoken idea is heard only inside a TEE.
export const OG_SPEECH_MODEL = "whisper-large-v3";

export async function transcribe0g(audio, { apiKey = process.env.OG_API_KEY, fetch = globalThis.fetch } = {}) {
  const form = new FormData();
  form.append("model", OG_SPEECH_MODEL);
  // Chrome records webm, Safari mp4. Whisper reads the format from the file name.
  form.append("file", audio, audio.type.includes("mp4") ? "idea.mp4" : "idea.webm");
  const response = await fetch(`${OG_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "X-0G-Provider-Trust-Mode": OG_TRUST_MODE },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw ogError(MESSAGES[response.status] ?? "0G could not hear that. Try again, or type it.", response.status, json);
  return { text: (json.text ?? "").trim(), trace: readTrace(json) };
}
