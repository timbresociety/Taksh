// Player requests: the checks on what the model makes, the GLM provider, the prompts and the steps.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.TAKSH_PROVIDER = "fixture";

const { KINDS, KIND_IDS, DESIGN_GESTURES, TRIAGE_SCHEMA } = await import("../src/lib/requests/kinds.js");
const { checkMade, checkMadeStyle, checkMadeWorld, worldLook, ROLE_PARTS } = await import("../src/lib/requests/made.js");
const { fixtureDraft, fixtureTriage } = await import("../src/lib/requests/fixtures.js");
const { draftPrompt, triagePrompt } = await import("../src/lib/requests/prompt.js");
const { starterSpec } = await import("../src/lib/spec/starter.js");
const { validateSpec } = await import("../src/lib/spec/validate.js");
const { checkStep, classify, draftStep, resultStep, triageStep } = await import("../src/workflows/request-steps.js");

const made = (kind, text) => KINDS[kind].finish(fixtureDraft({ kind, text }));
const goodWorld = () => made("world", "a Goa beach at sunset").item;
const goodStyle = () => made("style", "black and white noir").item;

describe("made worlds", () => {
  it("accepts a world cast from the catalogue", () => {
    for (const text of ["a Goa beach", "a snowy mountain road", "a cyberpunk market", "a moon colony", "a diwali night street", "anywhere"]) {
      assert.deepEqual(made("world", text).problems, [], text);
    }
  });

  it("refuses parts that are not in the catalogue for their role", () => {
    const world = { ...goodWorld(), low: ["proc:spaceship@1"], pickup: "props:Barrel@1.1" };
    const problems = checkMadeWorld(world);
    assert.ok(problems.some((problem) => problem.includes("proc:spaceship@1")));
    assert.ok(problems.some((problem) => problem.includes("pickup")));
  });

  it("refuses lane lines that vanish into the road", () => {
    const world = { ...goodWorld(), line: goodWorld().path };
    assert.ok(checkMadeWorld(world).some((problem) => problem.includes("lane lines")));
  });

  it("keeps the base world's layout and loads every kit a part needs", () => {
    const world = { ...goodWorld(), far: ["nature:Pine_1"] };
    const look = worldLook(world);
    assert.ok(look.kits.includes("nature"));
    assert.ok(look.lines?.length, "the sea front's lines carry over");
  });

  it("never offers houses, which need a world built for them", () => {
    assert.ok(!Object.values(ROLE_PARTS).flat().includes("house"));
  });
});

describe("made styles", () => {
  it("accepts every shipped style rebuilt as a made one", async () => {
    const { LOOKS } = await import("../src/lib/stage/styles.js");
    for (const [id, look] of Object.entries(LOOKS)) {
      const post = { saturation: 1, vignette: 0, ink: 0, inkColour: "#15121f", posterise: 0, halftone: 0, pixel: 0, grain: 0, ...look.post };
      const item = { id: "made-style-test-abcd", label: id, blurb: "test", base: id, material: look.material, post, bloom: look.bloom ?? 0, exposure: look.exposure ?? 1, light: look.light ?? 1 };
      assert.deepEqual(checkMadeStyle(item), [], id);
    }
  });

  it("refuses a style too dark or too noisy to play", () => {
    assert.ok(checkMadeStyle({ ...goodStyle(), exposure: 0.7, light: 0.4 }).some((problem) => problem.includes("too dark")));
    const noisy = { ...goodStyle(), post: { ...goodStyle().post, pixel: 8, posterise: 3, grain: 0.08, halftone: 1 } };
    assert.ok(checkMadeStyle(noisy).some((problem) => problem.includes("stacked")));
  });
});

describe("designs that need a build", () => {
  it("refuses slash up and slash down, and upper framing with jumps", () => {
    const draft = fixtureDraft({ kind: "game", text: "a game" });
    draft.item.moves[0] = { gesture: "slash_up", does: "x", cue: "Swipe up", key: "W" };
    draft.item.framing = "upper";
    const { problems } = KINDS.game.finish(draft);
    assert.ok(problems.some((problem) => problem.includes("slash_up")));
    assert.ok(problems.some((problem) => problem.includes("full framing")));
    assert.ok(!DESIGN_GESTURES.some((gesture) => gesture.id === "slash_down"));
  });

  it("refuses a boss that gets more patient as it breaks, or attacks without a tell", () => {
    const draft = fixtureDraft({ kind: "boss", text: "a boss" });
    draft.item.restMs = [1500, 2000, 2500];
    draft.item.tells = [];
    const { problems } = KINDS.boss.finish(draft);
    assert.ok(problems.some((problem) => problem.includes("restMs")));
    assert.ok(problems.some((problem) => problem.includes("tell")));
  });

  it("offers the closest thing to play today", () => {
    const boss = made("boss", "a monsoon robot");
    assert.deepEqual(boss.problems, []);
    assert.equal(KINDS.boss.standIn(boss.item).template, "blades");
    assert.equal(KINDS.game.standIn(made("game", "a lane game").item).template, "lane_runner");
  });
});

describe("specs carrying made things", () => {
  it("play in a made world and style", () => {
    const spec = starterSpec("lane_runner", 7);
    const world = goodWorld();
    const style = goodStyle();
    const check = validateSpec({ ...spec, made: { world, style }, skin: { ...spec.skin, world: world.id, style: style.id } });
    assert.equal(check.ok, true, check.errors.join("; "));
    assert.equal(check.spec.made.world.id, world.id);
  });

  it("refuse a tampered made world, or a made id with nothing behind it", () => {
    const spec = starterSpec("lane_runner", 7);
    const world = { ...goodWorld(), hazard: "proc:anything" };
    assert.equal(validateSpec({ ...spec, made: { world }, skin: { ...spec.skin, world: world.id } }).ok, false);
    assert.equal(validateSpec({ ...spec, skin: { ...spec.skin, world: "made-world-ghost-abcd" } }).ok, false);
    assert.deepEqual(checkMade({ boss: {} }), ["made.boss is not something a spec can carry."]);
  });
});

describe("prompts", () => {
  it("give the model the shared rules, the kind's skill and the live catalogue", async () => {
    for (const kind of KIND_IDS) {
      const prompt = await draftPrompt(kind);
      assert.ok(prompt.includes("Make it original"), kind);
      assert.ok(prompt.includes("## Catalogue"), kind);
      assert.ok(!prompt.startsWith("---"), "front matter is for Claude Code, not the model");
    }
    assert.ok((await draftPrompt("world")).includes("proc:metrobar"));
    assert.ok((await draftPrompt("game")).includes("(most reliable)"));
    assert.ok((await triagePrompt()).includes("Blade March"));
  });
});

describe("request steps", () => {
  it("triage, draft, check and finish a request on the fixture provider", async () => {
    assert.equal(fixtureTriage({ text: "a dragon boss" }).kind, "boss");
    const triage = await triageStep({ text: "a Goa beach at sunset", kind: null });
    assert.equal(triage.data.kind, "world");
    const draft = await draftStep({ kind: "world", text: "a Goa beach at sunset", brief: triage.data.brief });
    const check = await checkStep({ kind: "world", draft: draft.data });
    assert.deepEqual(check.problems, []);
    const outcome = await resultStep({ kind: "world", triage, draft, check, attempts: 1, startedAt: Date.now() });
    assert.equal(outcome.status, "ready");
    assert.equal(outcome.playable, true);
    assert.match(outcome.item.id, /^made-world-/);
  });

  it("keeps a made thing's id through a repair", async () => {
    const first = await checkStep({ kind: "style", draft: fixtureDraft({ kind: "style", text: "noir" }) });
    const again = await checkStep({ kind: "style", draft: fixtureDraft({ kind: "style", text: "noir" }), previous: first.item });
    assert.equal(again.item.id, first.item.id);
    assert.deepEqual((await checkStep({ kind: "style", draft: { decision: "make" } })).problems, ["The answer has no item."]);
  });
});

describe("why a request gave up", () => {
  const fail = (status, message = "x") => Object.assign(new Error(message), status ? { status } : {});

  it("does not retry a key, balance or bad-request problem", () => {
    assert.deepEqual(classify(fail(401)), { retry: false, reason: "setup" });
    assert.deepEqual(classify(fail(402)), { retry: false, reason: "setup" }); // an empty 0G balance
    assert.deepEqual(classify(fail(400)), { retry: false, reason: "request" });
    assert.deepEqual(classify(fail(null, "The model declined this idea. Try rewording it.")), { retry: false, reason: "declined" });
  });

  it("retries what may clear: rate limits, busy providers, timeouts and broken replies", () => {
    for (const error of [fail(429), fail(502), fail(503), fail(null, "The operation was aborted due to timeout"), fail(null, "The model returned malformed JSON.")]) {
      assert.equal(classify(error).retry, true, error.message);
    }
  });
});

describe("schemas", () => {
  // Claude and the 0G router both take a strict JSON Schema, but not every keyword. Ranges, formats and
  // counts are checked in code instead, so the same schema works on either.
  it("use only keywords every provider accepts, with every field required", () => {
    const walk = (node, where) => {
      for (const key of Object.keys(node)) assert.ok(["type", "properties", "required", "additionalProperties", "items", "enum"].includes(key), `${where} uses ${key}`);
      if (node.type === "object") {
        assert.equal(node.additionalProperties, false, where);
        assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort(), where);
        for (const [name, child] of Object.entries(node.properties)) walk(child, `${where}.${name}`);
      }
      if (node.items) walk(node.items, `${where}[]`);
    };
    for (const kind of KIND_IDS) walk(KINDS[kind].schema, kind);
    walk(TRIAGE_SCHEMA, "triage");
  });
});
