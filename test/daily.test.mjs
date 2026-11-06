import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPublicClient, createWalletClient, ExpirationTime, SchemaMismatchError } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { custom } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Daily, Scores, dailyValues, readScope, scoreValues } from "../src/lib/arkiv/schema.js";
import { dailyQuery, scoreQuery } from "../src/lib/arkiv/store.js";
import { THEMES, addDays, dayKey, fallbackSpec, isDate, msUntilNextDay, pickEarliest, themeFor } from "../src/lib/daily/daily.js";
import { resolveDaily } from "../src/lib/daily/server.js";
import { validateSpec } from "../src/lib/spec/validate.js";
import { starterSpec } from "../src/lib/spec/starter.js";

const offline = custom({ request: async ({ method }) => { throw new Error(`offline:${method}`); } });
const chain = rabdi({ accessKey: "test-key" });
const reader = createPublicClient({ chain, transport: offline });
const writer = createWalletClient({ chain, transport: offline, account: privateKeyToAccount(`0x${"11".repeat(32)}`) });
const OWNER = "0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30";

describe("daily date keying", () => {
  it("keys by UTC date, whatever the local time", () => {
    assert.equal(dayKey(Date.UTC(2026, 10, 7, 0, 0, 0)), "2026-11-07");
    assert.equal(dayKey(Date.UTC(2026, 10, 7, 23, 59, 59, 999)), "2026-11-07");
    assert.equal(dayKey(Date.UTC(2026, 10, 8)), "2026-11-08");
  });

  it("steps across month and year ends", () => {
    assert.equal(addDays("2026-11-01", -1), "2026-10-31");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2028-03-01", -1), "2028-02-29");
  });

  it("counts down to the next UTC midnight", () => {
    assert.equal(msUntilNextDay(Date.UTC(2026, 10, 7, 23, 0)), 3_600_000);
    assert.equal(msUntilNextDay(Date.UTC(2026, 10, 7)), 86_400_000);
  });

  it("accepts only real dates", () => {
    assert.equal(isDate("2026-11-07"), true);
    for (const bad of ["2026-02-30", "2026-13-01", "26-11-07", "2026-11-07' OR 1=1", "", undefined]) assert.equal(isDate(bad), false, bad);
  });
});

describe("daily fallback", () => {
  it("gives every instance the same valid starter game for a date", () => {
    const one = fallbackSpec("2026-11-07");
    assert.deepEqual(fallbackSpec("2026-11-07"), one);
    assert.equal(validateSpec(one).ok, true);
    assert.equal(one.template, themeFor("2026-11-07").template);
    assert.notDeepEqual(fallbackSpec("2026-11-08"), one);
  });

  it("has a buildable theme for every day of the cycle", () => {
    for (let day = 0; day < THEMES.length; day += 1) {
      const date = addDays("2026-11-07", day);
      assert.equal(validateSpec(starterSpec(themeFor(date).template, 1)).ok, true, date);
    }
    assert.notEqual(themeFor("2026-11-07").idea, themeFor("2026-11-08").idea);
  });

  const made = { spec: starterSpec("hop", 7), requestId: "req-0g-1" };
  const deps = (over = {}) => ({ read: async () => null, write: async () => ({ key: "0xmine" }), make: async () => made, create: true, ...over });

  it("serves the starter game, with no request ID, when 0G is not the provider", async () => {
    let wrote = false;
    const challenge = await resolveDaily("2026-11-07", deps({ make: async () => null, write: async () => { wrote = true; } }));
    assert.equal(challenge.source, "starter");
    assert.equal(challenge.requestId, null);
    assert.deepEqual(challenge.spec, fallbackSpec("2026-11-07"));
    assert.match(challenge.reason, /0G is not connected/);
    assert.equal(wrote, false);
  });

  it("serves the starter game when Arkiv is down, without asking 0G", async () => {
    let asked = false;
    const challenge = await resolveDaily("2026-11-07", deps({ read: async () => { throw new Error("rpc down"); }, make: async () => { asked = true; return made; } }));
    assert.equal(challenge.source, "starter");
    assert.match(challenge.reason, /Arkiv did not respond/);
    assert.equal(asked, false);
  });

  it("serves the starter game when 0G fails or writes are off", async () => {
    assert.match((await resolveDaily("2026-11-07", deps({ make: async () => { throw new Error("402"); } }))).reason, /0G could not make/);
    assert.match((await resolveDaily("2026-11-07", deps({ write: null }))).reason, /writes are off/);
    assert.match((await resolveDaily("2026-11-07", deps({ write: async () => { throw new Error("no gas"); } }))).reason, /could not store/);
  });

  it("never makes a game for a past date", async () => {
    let asked = false;
    const challenge = await resolveDaily("2026-11-06", deps({ create: false, make: async () => { asked = true; return made; } }));
    assert.equal(challenge.source, "starter");
    assert.equal(asked, false);
  });
});

describe("daily race rule", () => {
  const row = (key, block) => ({ $key: key, $createdAt: block });

  it("takes the earliest block, then the lowest key", () => {
    assert.equal(pickEarliest([row("0xb", 12n), row("0xa", 15n)]).$key, "0xb");
    assert.equal(pickEarliest([row("0xC", 12n), row("0xa", 12n), row("0xb", 12n)]).$key, "0xa");
    assert.equal(pickEarliest([row("0xa", undefined), row("0xb", 3n)]).$key, "0xb");
    assert.equal(pickEarliest([]), null);
  });

  it("reads a stored challenge instead of making one", async () => {
    let asked = false;
    const stored = { key: "0xfirst", date: "2026-11-07", theme: "t", requestId: "req-a", spec: starterSpec("chop", 1) };
    const challenge = await resolveDaily("2026-11-07", { read: async () => stored, write: async () => {}, make: async () => { asked = true; }, create: true });
    assert.equal(challenge.key, "0xfirst");
    assert.equal(challenge.source, "0g");
    assert.equal(asked, false);
  });

  it("drops its own game when another instance stored one while 0G was working", async () => {
    const theirs = { key: "0xtheirs", date: "2026-11-07", theme: "t", requestId: "req-theirs", spec: starterSpec("chop", 1) };
    const reads = [null, theirs];
    let wrote = false;
    const challenge = await resolveDaily("2026-11-07", {
      read: async () => reads.shift(),
      write: async () => { wrote = true; },
      make: async () => ({ spec: starterSpec("hop", 2), requestId: "req-mine" }),
      create: true,
    });
    assert.equal(challenge.key, "0xtheirs");
    assert.equal(challenge.requestId, "req-theirs");
    assert.equal(wrote, false);
  });

  it("serves the earliest after both instances wrote", async () => {
    const earlier = { key: "0xearlier", date: "2026-11-07", theme: "t", requestId: "req-earlier", spec: starterSpec("chop", 1) };
    const reads = [null, null, earlier];
    const challenge = await resolveDaily("2026-11-07", {
      read: async () => reads.shift(),
      write: async () => ({ key: "0xmine" }),
      make: async () => ({ spec: starterSpec("hop", 2), requestId: "req-mine" }),
      create: true,
    });
    assert.equal(challenge.key, "0xearlier");
  });

  it("serves its own write when the read lags behind it", async () => {
    const spec = starterSpec("hop", 2);
    const challenge = await resolveDaily("2026-11-07", { read: async () => null, write: async () => ({ key: "0xmine" }), make: async () => ({ spec, requestId: "req-mine" }), create: true });
    assert.equal(challenge.key, "0xmine");
    assert.equal(challenge.requestId, "req-mine");
    assert.equal(challenge.source, "0g");
  });
});

describe("daily on Arkiv", () => {
  async function reachesTransport(schema, values) {
    await assert.rejects(writer.createEntity(schema, values, { expiration: ExpirationTime.fromDays(1) }), (error) => {
      assert.ok(!(error instanceof SchemaMismatchError), error.message);
      return true;
    });
  }

  it("stores a challenge that fits its schema", async () => {
    await reachesTransport(Daily, dailyValues({ date: "2026-11-07", theme: "x".repeat(300), requestId: "req-1", spec: starterSpec("hop", 1) }));
  });

  it("tags a daily score with its date, and only a real date", async () => {
    const spec = starterSpec("hop", 1);
    const base = { spec, hash: "a".repeat(64), result: { score: 10 }, mode: "camera", player: "Asha" };
    const daily = scoreValues({ ...base, daily: "2026-11-07" });
    assert.equal(daily.daily, "2026-11-07");
    await reachesTransport(Scores, daily);
    assert.equal("daily" in scoreValues(base), false);
    assert.equal("daily" in scoreValues({ ...base, daily: "nope" }), false);
    await reachesTransport(Scores, scoreValues(base));
  });

  it("builds the daily board and challenge queries", () => {
    assert.equal(
      scoreQuery(reader, OWNER, { daily: "2026-11-07" }).toString(),
      `arkiv.schema = str('taksh.scores.v1') AND daily = str('2026-11-07') AND $owner = addr(${OWNER}) ORDER BY score:i32 DESC`,
    );
    assert.equal(dailyQuery(reader, OWNER, "2026-11-07").toString(), `arkiv.schema = str('taksh.daily.v1') AND date = str('2026-11-07') AND $owner = addr(${OWNER})`);
  });

  it("reads a daily scope and refuses a bad date", () => {
    assert.deepEqual(readScope(new URLSearchParams({ daily: "2026-11-07" })), { daily: "2026-11-07" });
    assert.deepEqual(readScope(new URLSearchParams({ daily: "2026-11-07", mode: "camera" })), { daily: "2026-11-07", mode: "camera" });
    assert.throws(() => readScope(new URLSearchParams({ daily: "2026-11-07') OR 1=1" })), /Unknown daily/);
  });
});

describe("daily cache window", async () => {
  const { dailyChallenge, inWindow } = await import("../src/lib/daily/server.js");
  const now = Date.UTC(2026, 10, 7, 12);

  it("covers today and the 8 days a challenge lives, nothing else", () => {
    assert.equal(inWindow("2026-11-07", now), true);
    assert.equal(inWindow("2026-10-30", now), true);
    assert.equal(inWindow("2026-10-29", now), false);
    assert.equal(inWindow("2026-11-08", now), false);
  });

  it("answers an expired date with its starter game, without reading Arkiv", async () => {
    const challenge = await dailyChallenge("1999-01-01", now);
    assert.equal(challenge.source, "starter");
    assert.equal(challenge.requestId, null);
    assert.deepEqual(challenge.spec, fallbackSpec("1999-01-01"));
    assert.match(challenge.hash, /^[0-9a-f]{64}$/);
  });
});

describe("daily generation retry", async () => {
  const { makeWithRetry } = await import("../src/lib/daily/server.js");
  const made = { spec: starterSpec("hop", 3), requestId: "req-2" };

  it("retries once after a try that never finishes", async () => {
    let tries = 0;
    const once = () => (++tries === 1 ? new Promise(() => {}) : Promise.resolve(made));
    assert.deepEqual(await makeWithRetry({}, {}, once, 50), made);
    assert.equal(tries, 2);
  });

  it("gives up after two failed tries, so the starter game is served", async () => {
    let tries = 0;
    const once = async () => { tries += 1; throw new Error("503"); };
    await assert.rejects(makeWithRetry({}, {}, once, 50), /503/);
    assert.equal(tries, 2);
    const challenge = await resolveDaily("2026-11-07", { read: async () => null, write: async () => ({}), make: () => makeWithRetry({}, {}, () => new Promise(() => {}), 30), create: true });
    assert.equal(challenge.source, "starter");
    assert.match(challenge.reason, /took longer than 0.03 s twice/);
  });
});
