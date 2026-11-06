import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPublicClient, createWalletClient, ExpirationTime, SchemaMismatchError } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { custom, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Games, SCORE_DAYS, Scores, cleanName, daysLeft, fitStr, gameValues, plainRow, readScope, readSpecBytes, scoreValues, specHash, stableJson } from "../src/lib/arkiv/schema.js";
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

  it("takes a Swarm reference on a game, and still writes one without", async () => {
    const swarmRef = "c".repeat(64);
    const values = gameValues({ spec, hash: "b".repeat(64), author: "Ravi", source: "claude", swarmRef });
    assert.equal(values.swarmRef, swarmRef);
    await reachesTransport(Games, values);
    assert.equal("swarmRef" in gameValues({ spec, hash: "b".repeat(64), author: "Ravi", source: "claude", swarmRef: null }), false);
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
    assert.match(gamesQuery(reader, OWNER, { template: "pads", world: "moon" }).toString(), /template = str\('pads'\) AND world = str\('moon'\)/);
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

describe("arkiv lifetimes", () => {
  it("counts whole days left from 2 s blocks, never below zero", () => {
    const day = 86400 / 2;
    assert.equal(daysLeft(1000 + SCORE_DAYS * day, 1000), 30);
    assert.equal(daysLeft(1000 + day - 1, 1000), 0);
    assert.equal(daysLeft(10n, 500), 0); // read after it expired, before the node dropped it
    // ExpirationTime.max() on a game, as read on 2026-11-06: about six months.
    assert.equal(daysLeft(8167433, 308735), 181);
  });
});

describe("arkiv deadline", async () => {
  const { READ_MS, arkiv, withDeadline } = await import("../src/lib/arkiv/store.js");
  // A node that accepts the request and never answers, like the public endpoint sleeping on a 429.
  const stuck = createPublicClient({ chain, transport: custom({ request: () => new Promise(() => {}) }) });

  it("gives up on a never-resolving query with an exposed 503", async () => {
    const started = Date.now();
    await assert.rejects(arkiv(scoreQuery(stuck, OWNER, { template: "hop" }).fetch(), "read the board", 80), (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.expose, true);
      assert.match(error.message, /longer than 0.08 s to read the board/);
      return true;
    });
    assert.ok(Date.now() - started < 1000);
  });

  it("names a 429, a refused key and a timeout, and never prints the RPC URL", async () => {
    const { arkivMessage } = await import("../src/lib/arkiv/store.js");
    const { HttpRequestError } = await import("viem");
    // How the SDK throws: its own error, with viem's HTTP error as the cause. The key sits in the URL.
    const http = (status) => Object.assign(new Error("query failed"), { cause: new HttpRequestError({ status, url: "https://rpc.example/secret-key" }) });
    const saved = process.env.ARKIV_ACCESS_KEY;
    try {
      delete process.env.ARKIV_ACCESS_KEY;
      assert.match(arkivMessage(http(429)), /public endpoint is rate limiting this server, which has no ARKIV_ACCESS_KEY, so this is unavailable/);
      process.env.ARKIV_ACCESS_KEY = "secret-key";
      assert.match(arkivMessage(http(429)), /rate limiting this server's access key/);
      assert.match(arkivMessage(http(401), "the board is off"), /^Arkiv refused this server's ARKIV_ACCESS_KEY, so the board is off\.$/);
      assert.equal(arkivMessage(new Error("socket hang up")), "Arkiv did not respond, so this is unavailable right now.");
      for (const status of [401, 429, 500]) assert.doesNotMatch(arkivMessage(http(status)), /secret-key|rpc\.example/);
    } finally {
      if (saved === undefined) delete process.env.ARKIV_ACCESS_KEY;
      else process.env.ARKIV_ACCESS_KEY = saved;
    }
    const timedOut = await arkiv(new Promise(() => {}), "read the board", 20).catch((error) => error);
    assert.equal(arkivMessage(timedOut, "this is the starter game"), "Arkiv took longer than 0.02 s to read the board, so this is the starter game.");
  });

  it("passes a value through and keeps reads at about 10 s", async () => {
    assert.equal(await withDeadline(Promise.resolve(7), 50, "late"), 7);
    assert.equal(READ_MS, 10_000);
  });
});
