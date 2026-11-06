// The pure half of the ENS integration: spec to text records and back, labels, limits and config.
// Nothing here touches a chain.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalize } from "viem/ens";
import { CREATOR_TOKEN_ROLES, PUBLIC_RPCS, ROLES, admin, ensConfig, rpcUrls } from "../src/lib/ens/chain.js";
import { KEYS, MAX_LABEL, MAX_SPEC_BYTES, recordsToSpec, slugLabel, specToRecords } from "../src/lib/ens/records.js";
import { starterSpec } from "../src/lib/spec/starter.js";
import { validateSpec } from "../src/lib/spec/validate.js";
import { TEMPLATES } from "../src/lib/templates/index.js";

const asTexts = (records) => Object.fromEntries(records);

describe("spec and text records", () => {
  it("round-trips every starter game through its records and still validates", () => {
    for (const template of TEMPLATES) {
      const spec = starterSpec(template.id, 11);
      const records = specToRecords(spec, "https://taksh.example/play/x.taksh-games.eth");
      const back = validateSpec(recordsToSpec(asTexts(records)));
      assert.ok(back.ok, `${template.id}: ${back.errors.join("; ")}`);
      assert.deepEqual(back.spec, spec);
    }
  });

  it("writes the readable fields next to the spec", () => {
    const spec = starterSpec("hop", 1);
    const texts = asTexts(specToRecords(spec));
    assert.equal(texts[KEYS.template], "hop");
    assert.equal(texts[KEYS.world], spec.skin.world);
    assert.equal(texts[KEYS.style], spec.skin.style);
    assert.equal(texts[KEYS.title], spec.title);
    assert.equal(texts[KEYS.description], spec.objective);
    assert.equal(texts[KEYS.url], undefined, "no url record without an origin");
  });

  it("lets an edited field record override the spec, so the owner can restyle a game in any ENS app", () => {
    const spec = starterSpec("hop", 1);
    const texts = { ...asTexts(specToRecords(spec)), [KEYS.world]: "moon", [KEYS.style]: "neon", [KEYS.title]: "Moon Hop" };
    const back = validateSpec(recordsToSpec(texts));
    assert.ok(back.ok);
    assert.equal(back.spec.skin.world, "moon");
    assert.equal(back.spec.skin.style, "neon");
    assert.equal(back.spec.title, "Moon Hop");
  });

  it("ignores empty field records and refuses names without a game", () => {
    const spec = starterSpec("hop", 1);
    const texts = { ...asTexts(specToRecords(spec)), [KEYS.world]: "" };
    assert.equal(recordsToSpec(texts).skin.world, spec.skin.world);
    assert.throws(() => recordsToSpec({}), /No Taksh game/);
    assert.throws(() => recordsToSpec({ [KEYS.spec]: "{nope" }), /not valid JSON/);
    assert.throws(() => recordsToSpec({ [KEYS.spec]: "[1]" }), /not a spec/);
  });

  it("leaves a bad world record for the validator to reject", () => {
    const texts = { ...asTexts(specToRecords(starterSpec("hop", 1))), [KEYS.world]: "atlantis" };
    assert.equal(validateSpec(recordsToSpec(texts)).ok, false);
  });

  it("refuses a spec too large to publish", () => {
    const spec = { ...starterSpec("hop", 1), objective: "x".repeat(MAX_SPEC_BYTES) };
    assert.throws(() => specToRecords(spec), (error) => error.status === 400 && /too large/.test(error.message));
  });
});

describe("labels", () => {
  it("slugs titles into ENS labels that are already normalised", () => {
    const cases = [
      ["Moon Hop", "moon-hop"],
      ["  Sky   Hop!! ", "sky-hop"],
      ["Café Dash", "cafe-dash"],
      ["--Diwali__Night--", "diwali-night"],
      ["Level 2", "level-2"],
    ];
    for (const [title, label] of cases) {
      assert.equal(slugLabel(title), label);
      assert.equal(normalize(`${label}.taksh-games.eth`), `${label}.taksh-games.eth`);
    }
  });

  it("caps the length without leaving a trailing hyphen", () => {
    const label = slugLabel(`${"a".repeat(MAX_LABEL - 1)} b`);
    assert.ok(label.length <= MAX_LABEL);
    assert.ok(!label.endsWith("-"));
  });

  it("refuses a title with nothing to slug", () => {
    assert.throws(() => slugLabel("!!!"), (error) => error.status === 400);
    assert.throws(() => slugLabel("मुंबई"), (error) => error.status === 400);
  });
});

describe("config and roles", () => {
  it("says why ENS is off instead of failing", () => {
    assert.match(ensConfig({}).reason, /ENS_PARENT_NAME/);
    assert.match(ensConfig({ ENS_PARENT_NAME: "a.b.eth" }).reason, /second-level/);
    assert.match(ensConfig({ ENS_PARENT_NAME: "games.eth", ENS_CHAIN: "nowhere" }).reason, /no deployment/);
    const ready = ensConfig({ ENS_PARENT_NAME: "Taksh-Games.eth" });
    assert.equal(ready.reason, undefined);
    assert.equal(ready.parent, "taksh-games.eth");
  });

  it("gives creators the .eth registrant roles and nothing on the registry root", () => {
    assert.equal(ROLES.setResolver, 1n << 24n);
    assert.equal(admin(ROLES.setResolver), 1n << 152n);
    assert.equal(ROLES.canTransferAdmin, (1n << 28n) << 128n);
    assert.equal(CREATOR_TOKEN_ROLES & ROLES.registrar, 0n);
    assert.ok(CREATOR_TOKEN_ROLES & ROLES.setResolver);
  });

  it("tries ENS_RPC_URL first, then keyless public RPCs, and viem's rate-limited default last", () => {
    const urls = rpcUrls(ensConfig({ ENS_PARENT_NAME: "games.eth", ENS_RPC_URL: "https://mine.example" }));
    assert.deepEqual(urls, ["https://mine.example", ...PUBLIC_RPCS.sepolia, undefined]);
    assert.deepEqual(rpcUrls(ensConfig({ ENS_PARENT_NAME: "games.eth", ENS_RPC_URL: PUBLIC_RPCS.sepolia[0] })), [...PUBLIC_RPCS.sepolia, undefined]);
  });
});
