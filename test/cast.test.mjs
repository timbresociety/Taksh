import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { castFor, namesSomeone } from "../src/lib/spec/cast.js";
import { BODIES, HAIR } from "../src/lib/spec/contract.js";
import { generateGame } from "../src/lib/pipeline/pipeline.js";
import { createFixtureProvider } from "../src/lib/pipeline/provider-fixture.js";
import { starterSpec } from "../src/lib/spec/starter.js";
import { TEMPLATES } from "../src/lib/templates/index.js";

const heroOf = (text, template) => castFor({ text, template }).hero.body;

describe("casting from the idea", () => {
  it("takes the body the player names", () => {
    assert.equal(heroOf("a boxing game where I play a man in Mumbai"), "athlete-male");
    assert.equal(heroOf("she runs through the forest"), "athlete-female");
    assert.equal(heroOf("my grandma dodging traffic"), "athlete-female");
    assert.equal(heroOf("a dabbawala racing tiffins across town"), "dabbawala");
    assert.equal(heroOf("I am a Koli fisherman rowing home"), "fisherman");
    assert.equal(heroOf("play as Ravana smashing pots"), "ravana");
    assert.equal(heroOf("a woman ranger in the jungle"), "ranger-female");
    assert.equal(heroOf("a farmer woman catching mangoes"), "peasant-female");
    assert.match(heroOf("a village farmer catching mangoes"), /^peasant-(fe)?male$/);
  });

  it("reads the rival from the words after against or fight", () => {
    const { hero, rival } = castFor({ text: "a girl boxing against Ravana" });
    assert.equal(hero.body, "athlete-female");
    assert.equal(rival.body, "ravana");
    const twins = castFor({ text: "a man fighting a man" });
    assert.notEqual(twins.hero.body, twins.rival.body, "the two are easy to tell apart");
  });

  it("does not make the same athlete everyone's default", () => {
    const ideas = ["punch pads", "upper body workout in space", "a runner in Mumbai", "slice fruit", "catch the tiffins", "row a boat", "dodge and counter", "jump the gaps", "fly through the sky", "keep goal"];
    const bodies = new Set(ideas.map((idea) => heroOf(idea)));
    assert.ok(bodies.size > 1, `every idea cast the same body: ${[...bodies]}`);
    assert.ok(ideas.some((idea) => heroOf(idea) === "athlete-male"), "some unsaid ideas cast a man");
    assert.equal(heroOf("punch pads"), heroOf("punch pads"), "the same idea casts the same way");
  });

  it("starts a themed game with its own people", () => {
    assert.equal(heroOf("", "oars"), "fisherman");
    assert.equal(heroOf("", "dabba"), "dabbawala");
    assert.equal(heroOf("a woman catching tiffins", "dabba"), "dabbawala", "a named role still wins");
  });

  it("only casts bodies and hair that exist", () => {
    const ids = new Set(BODIES.map((body) => body.id));
    for (const text of ["", "she", "he", "a ranger", "villager woman", "dabbawala", "against a fisherman", "Ravana"]) {
      const { hero, rival } = castFor({ text });
      for (const look of [hero, rival]) {
        assert.ok(ids.has(look.body), `${text}: ${look.body}`);
        assert.ok(HAIR.includes(look.hair), `${text}: ${look.hair}`);
      }
    }
  });

  it("knows when the words say who to play as", () => {
    assert.equal(namesSomeone("a boxing game"), false);
    assert.equal(namesSomeone("a boxing game as a woman"), true);
    assert.equal(namesSomeone("boxing against Ravana"), false, "that names the rival, not the player");
  });
});

describe("where heroes come from", () => {
  it("the game shelf is not all one athlete", () => {
    const bodies = new Set(TEMPLATES.map((template) => starterSpec(template.id, 1).skin.hero.body));
    assert.ok(bodies.size >= 3, [...bodies].join(", "));
  });

  it("a game made without a model casts from the idea", async () => {
    const result = await generateGame({ idea: "a man boxing on Marine Drive", brief: { template: "pads", world: "marine_drive" } }, createFixtureProvider());
    assert.equal(result.ok, true);
    assert.equal(result.spec.skin.hero.body, "athlete-male");
  });

  it("holds a model to the player's words, and leaves its own casting alone otherwise", async () => {
    const stub = (hero) => ({ source: "stub", model: "stub", async complete() {
      const spec = starterSpec("pads", 3);
      return { data: { ...spec, skin: { ...spec.skin, hero: { ...spec.skin.hero, body: hero } }, tuning: [] }, ms: 1 };
    } });
    const told = await generateGame({ idea: "I want to box as a grandma", brief: { template: "pads" } }, stub("athlete-male"));
    assert.equal(told.spec.skin.hero.body, "athlete-female");
    const free = await generateGame({ idea: "a boxing game", brief: { template: "pads" } }, stub("ranger-male"));
    assert.equal(free.spec.skin.hero.body, "ranger-male");
  });
});
