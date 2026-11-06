import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { costOf, msUntilReset, ogHeaders, setOgSession, signInAvailable } from "../src/lib/og/session.js";
import { transcribe0g } from "../src/lib/pipeline/provider-0g.js";

describe("0g player session", () => {
  it("attaches the session only while a player is signed in", () => {
    setOgSession("s-1");
    assert.deepEqual(ogHeaders(), { "x-0g-session": "s-1" });
    setOgSession(null);
    assert.deepEqual(ogHeaders(), {});
  });

  it("offers sign-in only on the origins 0G's login accepts", () => {
    assert.equal(signInAvailable({ hostname: "localhost", port: "3000" }), true);
    assert.equal(signInAvailable({ hostname: "localhost", port: "5173" }), true);
    assert.equal(signInAvailable({ hostname: "localhost", port: "3100" }), false);
    assert.equal(signInAvailable({ hostname: "taksh.vercel.app", port: "" }), false);
    assert.equal(signInAvailable(undefined), false);
  });

  it("counts down to the 00:00 UTC credit refresh", () => {
    assert.equal(msUntilReset(Date.UTC(2026, 10, 7, 18, 30)), 5.5 * 3600 * 1000);
    assert.equal(msUntilReset(Date.UTC(2026, 10, 7, 0, 0)), 24 * 3600 * 1000);
  });

  it("adds up 0G costs and skips calls with none", () => {
    assert.equal(costOf([{ costUsd: 0.25 }, { safeStop: "lost" }, { costUsd: 0.5 }]), 0.75);
    assert.equal(costOf(undefined), 0);
  });

  it("voice paid by a player blames their credits", async () => {
    const fetch = async () => ({ ok: false, status: 402, json: async () => ({}) });
    await assert.rejects(transcribe0g(new Blob(["x"], { type: "audio/webm" }), { apiKey: "s", payer: "user", fetch }), /credits are used up/);
  });
});
