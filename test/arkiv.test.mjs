import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPublicClient, createWalletClient, ExpirationTime, SchemaMismatchError } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { custom, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Games, Scores, cleanName, fitStr, gameValues, plainRow, readScope, readSpecBytes, scoreValues, specHash, stableJson } from "../src/lib/arkiv/schema.js";
import { gamesQuery, scoreQuery } from "../src/lib/arkiv/store.js";
import { starterSpec } from "../src/lib/spec/starter.js";

// No network: every request fails, so a write that gets as far as the transport passed the SDK's checks.
const offline = custom({ request: async ({ method }) => { throw new Error(`offline:${method}`); } });
const chain = rabdi({ accessKey: "test-key" });
const reader = createPublicClient({ chain, transport: offline });
const writer = createWalletClient({ chain, transport: offline, account: privateKeyToAccount(`0x${"11".repeat(32)}`) });
const OWNER = "0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30";
const spec = starterSpec("hop", 42);

async function reachesTransport(schema, values) {
  await assert.rejects(writer.createEntity(schema, values, { expiration: ExpirationTime.fromDays(1) }), (error) => {
    assert.ok(!(error instanceof SchemaMismatchError), error.message);
    return true;
  });
}

describe("arkiv encoding", () => {
  it("hashes a spec the same whatever its key order", async () => {
    const reordered = Object.fromEntries(Object.entries(spec).reverse());
    assert.equal(stableJson(reordered), stableJson(spec));
    const hash = await specHash(spec);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(await specHash(reordered), hash);
    assert.notEqual(await specHash({ ...spec, seed: 43 }), hash);
  });

  it("cuts str values on a character boundary within 128 bytes", () => {
    const long = "म".repeat(100); // 3 bytes each
    const cut = fitStr(long);
    assert.ok(new TextEncoder().encode(cut).length <= 128);
    assert.equal(cut, "म".repeat(42));
    assert.equal(fitStr("short"), "short");
  });

  it("cleans player names", () => {
    assert.equal(cleanName("  Asha\u0000\n "), "Asha");
    assert.equal(cleanName(""), "anon");
    assert.equal(cleanName("x".repeat(80)).length, 24);
  });

  it("turns a result into score values that fit the schema", async () => {
    const values = scoreValues({ spec, hash: "a".repeat(64), result: { score: 120.6, actions: -3, ms: 61000, outcome: "nope" }, mode: "webcam", player: "Asha" });
    assert.deepEqual(values, {
      template: "hop", world: spec.skin.world, style: spec.skin.style, specHash: "a".repeat(64), mode: "keyboard",
      score: 121, player: "Asha", outcome: "complete", actions: 0, durationMs: 61000,
    });
    await reachesTransport(Scores, values);
  });

  it("stores a game spec as bytes and reads it back", async () => {
    const values = gameValues({ spec, hash: "b".repeat(64), author: "Ravi", source: "claude", now: 1_700_000_000_000 });
    assert.deepEqual(readSpecBytes(toHex(values.spec)), JSON.parse(stableJson(spec)));
    assert.equal(values.publishedAt.value, 1_700_000_000n);
    await reachesTransport(Games, values);
    // The check above can fail: a bare bigint is a u256, not the u64 the column wants.
    await assert.rejects(writer.createEntity(Games, { ...values, publishedAt: 1n }, { expiration: ExpirationTime.fromDays(1) }), SchemaMismatchError);
  });

  it("flattens typed rows for JSON", () => {
    assert.deepEqual(plainRow({ $key: "0x1", score: { type: "i32", value: 5 }, publishedAt: { type: "u64", value: 9n } }), { key: "0x1", score: 5, publishedAt: 9 });
  });
});

describe("arkiv queries", () => {
  it("reads a scope from query parameters and refuses unknown values", () => {
    const params = (o) => new URLSearchParams(o);
    assert.deepEqual(readScope(params({ template: "hop", world: "moon", style: "neon", mode: "camera" })), { template: "hop", world: "moon", style: "neon", mode: "camera" });
    assert.throws(() => readScope(params({ template: "tetris" })), /Unknown template/);
    assert.throws(() => readScope(params({ template: "hop", world: "mars" })), /Unknown world/);
    assert.throws(() => readScope(params({ template: "hop", hash: "') OR 1=1" })), /Unknown hash/);
  });

  it("builds the board query: our writer, indexed filters, best score first", () => {
    const all = scoreQuery(reader, OWNER, { template: "hop" }).toString();
    assert.equal(all, `arkiv.schema = str('taksh.scores.v1') AND template = str('hop') AND $owner = addr(${OWNER}) ORDER BY score:i32 DESC`);
    const narrow = scoreQuery(reader, OWNER, { template: "hop", world: "moon", style: "neon", hash: "c".repeat(64), mode: "camera" }).toString();
    assert.match(narrow, /world = str\('moon'\) AND style = str\('neon'\) AND specHash = str\('c{64}'\) AND mode = str\('camera'\)/);
  });

  it("lists games newest first, optionally for one template", () => {
    assert.equal(gamesQuery(reader, OWNER).toString(), `arkiv.schema = str('taksh.games.v1') AND $owner = addr(${OWNER}) ORDER BY publishedAt:u64 DESC`);
    assert.match(gamesQuery(reader, OWNER, { template: "pads" }).toString(), /template = str\('pads'\)/);
  });
});

describe("arkiv write throttle", async () => {
  const { throttle } = await import("../src/lib/arkiv/throttle.js");
  const from = (ip) => ({ headers: new Headers({ "x-forwarded-for": ip }) });

  it("caps total writes per minute even when every request claims a new IP", () => {
    const start = 1_000_000_000;
    let accepted = 0;
    for (let i = 0; i < 50; i += 1) {
      try {
        throttle(from(`10.0.0.${i}`), 4000, start + i);
        accepted += 1;
      } catch (error) {
        assert.equal(error.status, 429);
      }
    }
    assert.equal(accepted, 20);
    assert.doesNotThrow(() => throttle(from("10.0.1.1"), 4000, start + 61000));
  });
});
