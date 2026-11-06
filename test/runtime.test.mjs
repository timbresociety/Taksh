import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { simulate } from "../src/lib/runtime/bot.js";
import { applyAction, createRound, stepRound } from "../src/lib/runtime/engine.js";
import { compareSpecs } from "../src/lib/spec/compare.js";
import { PLAYER_PROFILES } from "../src/lib/spec/contract.js";
import { validateSpec } from "../src/lib/spec/validate.js";
import { createFixtureProvider } from "../src/lib/pipeline/provider-fixture.js";

const provider = createFixtureProvider();

async function fixture(idea) {
  const { data } = await provider.complete({ stage: "generate", input: { idea } });
  return data;
}

function runTo(round, t) {
  const outcomes = [];
  while (round.t < t && round.status === "playing") outcomes.push(...stepRound(round, 20));
  return outcomes;
}

function tinySpec(events, overrides = {}) {
  return {
    events: events.map((event) => ({ telegraphMs: 1500, windowMs: 800, ...event })),
    scoring: { targetHit: 100, targetMiss: 0, targetMissCostsLife: false, hazardAvoided: 50, hazardHit: -25, comboBonus: 10 },
    end: { type: "lives", lives: 3, durationMs: 20000, winScore: 0 },
    ...overrides,
  };
}

describe("goalkeeper rule: moving into the lane scores", () => {
  const shot = { atMs: 4000, kind: "target", requires: "position", lane: 0 };

  it("saves when the keeper reaches the lane in the window", () => {
    const round = createRound(tinySpec([shot]));
    runTo(round, 3700);
    const outcomes = applyAction(round, "move_left");
    assert.equal(outcomes[0].type, "hit");
    assert.equal(round.score, 100);
  });

  it("concedes when the keeper stays put", () => {
    const round = createRound(tinySpec([shot]));
    assert.equal(runTo(round, 5000)[0].type, "miss");
  });
});

describe("dodge rule: leaving the telegraphed lane avoids the attack", () => {
  const attack = { atMs: 4000, kind: "hazard", requires: "position", lane: 1 };

  it("avoids when the player has left the lane at impact", () => {
    const round = createRound(tinySpec([attack]));
    runTo(round, 3000);
    applyAction(round, "move_right");
    assert.equal(runTo(round, 4100)[0].type, "avoid");
    assert.equal(round.lives, 3);
  });

  it("hurts and costs a life when the player stays", () => {
    const round = createRound(tinySpec([attack]));
    assert.equal(runTo(round, 4100)[0].type, "hurt");
    assert.equal(round.lives, 2);
  });
});

describe("action events", () => {
  const sweep = { atMs: 4000, kind: "hazard", requires: "up", lane: null };

  it("counts an action inside the window", () => {
    const round = createRound(tinySpec([sweep]));
    runTo(round, 3900);
    assert.equal(applyAction(round, "up")[0].type, "avoid");
  });

  it("ignores an action before the window", () => {
    const round = createRound(tinySpec([sweep]));
    runTo(round, 3000);
    applyAction(round, "up");
    assert.equal(runTo(round, 4600)[0].type, "hurt");
  });
});

describe("round ending", () => {
  it("stops when lives run out", () => {
    const hits = [4000, 6000, 8000].map((atMs) => ({ atMs, kind: "hazard", requires: "position", lane: 1 }));
    const round = createRound(tinySpec(hits));
    runTo(round, 9000);
    assert.equal(round.result.outcome, "lose");
  });
});

describe("validator", () => {
  it("accepts every fixture and a quick player clears them", async () => {
    for (const idea of ["goalkeeper", "escape a robot", "boxing", "hurdles"]) {
      const spec = await fixture(idea);
      const check = validateSpec(spec);
      assert.deepEqual(check.errors, [], idea);
      assert.equal(simulate(spec, PLAYER_PROFILES.quick).failures.length, 0, idea);
    }
  });

  const broken = async (mutate) => {
    const spec = await fixture("escape a robot");
    mutate(spec);
    return validateSpec(spec);
  };

  const cases = {
    "a future spec version": [(s) => (s.specVersion = 2), /specVersion/],
    "an unknown gesture": [(s) => (s.movementBindings[0].gesture = "backflip"), /Unknown gesture/],
    "a gesture bound to a forbidden action": [(s) => (s.movementBindings[0] = { gesture: "burpee", action: "up" }), /can only bind/],
    "a telegraph below the bound": [(s) => (s.events[3].telegraphMs = 200), /telegraphMs/],
    "events too close together": [(s) => (s.events[5].atMs = s.events[4].atMs + 100), /apart/],
    "an event that starts too early": [(s) => (s.events[0].atMs = 2000), /appears before/],
    "an event past the end": [(s) => (s.events.at(-1).atMs = s.end.durationMs), /before end/],
    "a position event without a lane": [(s) => (s.events[0].lane = null), /lane/],
    "a missing binding": [(s) => (s.movementBindings = s.movementBindings.filter((b) => b.action !== "down")), /no gesture is bound/],
    "a bad colour": [(s) => (s.artStyle.palette.hazard = "red"), /palette\.hazard/],
    "a round that is too long": [(s) => (s.end.durationMs = 200000), /durationMs/],
  };
  for (const [name, [mutate, pattern]] of Object.entries(cases)) {
    it(`rejects ${name}`, async () => {
      const check = await broken(mutate);
      assert.equal(check.ok, false);
      assert.ok(check.errors.some((error) => pattern.test(error)), check.errors.join(" | "));
    });
  }

  it("rejects timing no human could reach, even inside every bound", async () => {
    const check = await broken((spec) => {
      const lanes = [0, 2];
      spec.events = spec.events.map((event, i) => ({ ...event, kind: "target", requires: "position", lane: lanes[i % 2], telegraphMs: 700, windowMs: 300, atMs: 3000 + i * 900 }));
    });
    assert.equal(check.ok, false);
    assert.ok(check.errors.some((error) => /cannot be cleared/.test(error)), check.errors.join(" | "));
  });
});

describe("revision changes measurable gameplay", () => {
  it("more warning raises hazard warning and lets a casual player clear more", async () => {
    const spec = await fixture("escape a robot");
    const { data } = await provider.complete({ stage: "revise", input: { spec, request: "give me more time to dodge" } });
    const { changes, rulesChanged } = compareSpecs(spec, data.spec);
    assert.equal(rulesChanged, true);
    const warning = changes.find((change) => change.key === "hazardWarningMs");
    assert.ok(warning.after > warning.before * 1.3);
    assert.ok(simulate(data.spec, PLAYER_PROFILES.casual).clearRate >= simulate(spec, PLAYER_PROFILES.casual).clearRate);
  });
});
