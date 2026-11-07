import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOgProvider, readTrace, transcribe0g } from "../src/lib/pipeline/provider-0g.js";

const TRACE = { request_id: "req-1", provider: "0xabc", billing: { currency: "usd", total_cost: "9763", total_cost_usd_micro: "9763" } };
const reply = (content, extra = {}) => ({ choices: [{ finish_reason: "stop", message: { content } }], usage: { total_tokens: 5 }, x_0g_trace: TRACE, ...extra });

// A fetch stand-in that answers from a queue and records every request.
function stubFetch(...answers) {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push({ url, init, body: init.body && JSON.parse(init.body) });
    const { status = 200, json, headers = {} } = answers.shift();
    return { ok: status < 400, status, json: async () => json, headers: new Headers(headers) };
  };
  return { fetch, seen };
}

const call = (provider, stage = "generate") => provider.complete({ stage, system: "sys", user: "idea", schema: { type: "object" } });

describe("0g provider", () => {
  it("sends a private, price-capped, schema-bound request and returns the trace", async () => {
    const { fetch, seen } = stubFetch({ json: reply('{"a":1}') });
    const result = await call(createOgProvider({ apiKey: "sk-test", model: "glm-5.3", fetch }));

    assert.deepEqual(result.data, { a: 1 });
    assert.deepEqual(result.trace, { requestId: "req-1", provider: "0xabc", trustMode: "private", costUsd: 0.009763, costNeuron: null });
    const { url, init, body } = seen[0];
    assert.equal(url, "https://router-api.0g.ai/v1/chat/completions");
    assert.equal(init.headers.Authorization, "Bearer sk-test");
    assert.equal(init.headers["X-0G-Provider-Trust-Mode"], "private");
    assert.ok(init.headers["X-0G-Provider-Max-Price-Usd-Completion"]);
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.strict, true);
    assert.deepEqual(body.messages.map((m) => m.role), ["system", "user"]);
  });

  it("keeps thinking off on every stage, which is what keeps generation under 10 s", async () => {
    const { fetch, seen } = stubFetch({ json: reply("{}") }, { json: reply("{}") });
    const provider = createOgProvider({ apiKey: "k", fetch });
    await call(provider, "intent");
    await call(provider, "generate");
    assert.deepEqual(seen.map((request) => request.body.chat_template_kwargs.enable_thinking), [false, false]);
  });

  it("an empty balance becomes a message the player can act on, with the request ID", async () => {
    const { fetch } = stubFetch({ status: 402, json: { error: { code: "insufficient_balance" }, request_id: "req-402" } });
    await assert.rejects(call(createOgProvider({ apiKey: "k", fetch })), (error) => {
      assert.match(error.message, /balance is empty/);
      assert.equal(error.status, 402);
      assert.equal(error.expose, true);
      assert.equal(error.requestId, "req-402");
      return true;
    });
  });

  it("retries a 503 once, then gives up", async () => {
    const busy = { status: 503, json: { error: { code: "no_provider_for_trust_mode" } }, headers: { "retry-after": "0" } };
    const ok = stubFetch(busy, { json: reply('{"b":2}') });
    assert.deepEqual((await call(createOgProvider({ apiKey: "k", fetch: ok.fetch }))).data, { b: 2 });
    assert.equal(ok.seen.length, 2);

    const down = stubFetch(busy, busy);
    await assert.rejects(call(createOgProvider({ apiKey: "k", fetch: down.fetch })), /No private 0G provider/);
    assert.equal(down.seen.length, 2);
  });

  it("does not retry a bad key", async () => {
    const { fetch, seen } = stubFetch({ status: 401, json: {} });
    await assert.rejects(call(createOgProvider({ apiKey: "k", fetch })), /API key was rejected/);
    assert.equal(seen.length, 1);
  });

  it("a reply cut off by the token limit is an error, not half a game", async () => {
    const { fetch } = stubFetch({ json: { ...reply(""), choices: [{ finish_reason: "length", message: { content: "" } }] } });
    await assert.rejects(call(createOgProvider({ apiKey: "k", fetch })), /ran out of room/);
  });

  it("reads cost in neuron when the router reports it that way", () => {
    const trace = readTrace({ x_0g_trace: { request_id: "r", billing: { total_cost: "1935800000000000" } } });
    assert.equal(trace.costUsd, null);
    assert.equal(trace.costNeuron, "1935800000000000");
    assert.equal(readTrace({}), null);
  });

  it("transcribes on the private tier, naming the file by what the browser recorded", async () => {
    const seen = [];
    const fetch = async (url, init) => {
      seen.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ text: "  A boxing game in Mumbai. ", x_0g_trace: TRACE }) };
    };
    const result = await transcribe0g(new Blob(["x"], { type: "audio/mp4" }), { apiKey: "k", fetch });
    assert.equal(result.text, "A boxing game in Mumbai.");
    assert.equal(result.trace.requestId, "req-1");
    const { url, init } = seen[0];
    assert.equal(url, "https://router-api.0g.ai/v1/audio/transcriptions");
    assert.equal(init.headers["X-0G-Provider-Trust-Mode"], "private");
    assert.equal(init.body.get("model"), "whisper-large-v3");
    assert.equal(init.body.get("file").name, "idea.mp4");
  });

  it("a failed transcription says what to do, and keeps the request ID", async () => {
    const fetch = async () => ({ ok: false, status: 402, json: async () => ({ request_id: "req-9" }) });
    await assert.rejects(transcribe0g(new Blob(["x"], { type: "audio/webm" }), { apiKey: "k", fetch }), (error) => {
      assert.match(error.message, /balance is empty/);
      assert.equal(error.requestId, "req-9");
      return true;
    });
  });
});

describe("0g provider paid by a signed-in player", () => {
  it("sends the player's session token and blames their credits, not the app key", async () => {
    const { fetch, seen } = stubFetch({ status: 402, json: { error: { code: "insufficient_balance" } } });
    await assert.rejects(call(createOgProvider({ apiKey: "session-1", payer: "user", fetch })), /credits are used up/);
    assert.equal(seen[0].init.headers.Authorization, "Bearer session-1");

    const expired = stubFetch({ status: 401, json: {} });
    await assert.rejects(call(createOgProvider({ apiKey: "old", payer: "user", fetch: expired.fetch })), /sign-in expired/);
  });
});
