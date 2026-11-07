import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { castFor } from "../src/lib/spec/cast.js";
import { BODIES, HAIR } from "../src/lib/spec/contract.js";
import { generateGame } from "../src/lib/pipeline/pipeline.js";
import { createFixtureProvider } from "../src/lib/pipeline/provider-fixture.js";
import { starterSpec } from "../src/lib/spec/starter.js";
import { TEMPLATES } from "../src/lib/templates/index.js";

const heroOf = (text, template) => castFor({ text, template }).hero.body;
const rivalOf = (text, template) => castFor({ text, template }).rival.body;

describe("casting", () => {
  it("is a man when nobody said, unless the game or the idea feels feminine", () => {
    for (const idea of ["punch pads", "upper body workout in space", "a runner in Mumbai", "slice fruit", "jump the gaps", "keep goal"]) assert.equal(heroOf(idea), "athlete-male", idea);
    assert.equal(heroOf("", "rangoli"), "athlete-female");
    assert.equal(heroOf("a dance game at a wedding"), "athlete-female");
    assert.equal(heroOf("garba night at Diwali"), "athlete-female");
  });

  it("takes the role or the he or she the player names", () => {
    assert.equal(heroOf("she runs through the forest"), "athlete-female");
    assert.equal(heroOf("my grandma dodging traffic"), "athlete-female");
    assert.equal(heroOf("a man doing a dance"), "athlete-male", "said beats felt");
    assert.equal(heroOf("a woman ranger in the jungle"), "ranger-female");
    assert.equal(heroOf("a farmer catching mangoes"), "peasant-male");
    assert.equal(heroOf("play as Ravana smashing pots"), "ravana");
  });

  it("always rows Koli Race as the fisherman and runs Dabba Catch as the dabbawala", () => {
    assert.equal(heroOf("", "oars"), "fisherman");
    assert.equal(heroOf("a woman rowing a race", "oars"), "fisherman");
    assert.equal(heroOf("a ranger rowing", "oars"), "fisherman");
    assert.equal(heroOf("", "dabba"), "dabbawala");
    assert.equal(heroOf("a girl catching tiffins", "dabba"), "dabbawala");
  });

  it("puts Ravana in the ring for the boxing games unless the player names a rival", () => {
    assert.equal(rivalOf("", "bout"), "ravana");
    assert.equal(rivalOf("boxing on Marine Drive", "pads"), "ravana");
    assert.equal(rivalOf("boxing against a ranger", "bout"), "ranger-male");
    assert.equal(rivalOf("boxing against a woman", "bout"), "athlete-female");
    assert.equal(heroOf("play as Ravana", "bout"), "ravana");
    assert.equal(rivalOf("play as Ravana", "bout"), "athlete-male", "Ravana can't box Ravana");
    assert.notEqual(rivalOf("", "lane_runner"), "ravana", "other games keep an athlete");
  });

  it("keeps two athletes easy to tell apart", () => {
    const { hero, rival } = castFor({ text: "a man fighting a man" });
    assert.equal(hero.body, rival.body);
    assert.ok(hero.top !== rival.top && hero.hair !== rival.hair);
  });

  it("only casts bodies and hair that exist", () => {
    const ids = new Set(BODIES.map((body) => body.id));
    for (const template of [null, ...TEMPLATES.map((item) => item.id)]) {
      for (const text of ["", "she", "he", "a ranger", "villager woman", "against a fisherman", "Ravana", "a dance"]) {
        const { hero, rival } = castFor({ text, template });
        for (const look of [hero, rival]) {
          assert.ok(ids.has(look.body), `${template} ${text}: ${look.body}`);
          assert.ok(HAIR.includes(look.hair), `${template} ${text}: ${look.hair}`);
        }
      }
    }
  });
});

describe("where heroes come from", () => {
  it("the game shelf follows the same rules", () => {
    const shelf = Object.fromEntries(TEMPLATES.map((template) => [template.id, starterSpec(template.id, 1).skin]));
    assert.equal(shelf.oars.hero.body, "fisherman");
    assert.equal(shelf.dabba.hero.body, "dabbawala");
    assert.equal(shelf.bout.rival.body, "ravana");
    assert.equal(shelf.pads.rival.body, "ravana");
    assert.equal(shelf.rangoli.hero.body, "athlete-female");
    assert.equal(shelf.lane_runner.hero.body, "athlete-male");
  });

  it("a game made without a model casts from the idea", async () => {
    const result = await generateGame({ idea: "a girl boxing on Marine Drive", brief: { template: "bout", world: "marine_drive" } }, createFixtureProvider());
    assert.equal(result.ok, true);
    assert.equal(result.spec.skin.hero.body, "athlete-female");
    assert.equal(result.spec.skin.rival.body, "ravana");
  });

  it("holds a model to the game's rules and the player's words", async () => {
    const stub = (template, hero) => ({ source: "stub", model: "stub", async complete() {
      const spec = starterSpec(template, 3);
      return { data: { ...spec, skin: { ...spec.skin, hero: { ...spec.skin.hero, body: hero } }, tuning: [] }, ms: 1 };
    } });
    assert.equal((await generateGame({ idea: "I want to box as a grandma", brief: { template: "pads" } }, stub("pads", "athlete-male"))).spec.skin.hero.body, "athlete-female");
    assert.equal((await generateGame({ idea: "a rowing race", brief: { template: "oars" } }, stub("oars", "athlete-female"))).spec.skin.hero.body, "fisherman");
    const kept = await generateGame({ idea: "a boxing game", brief: { template: "pads" } }, stub("pads", "athlete-male"));
    assert.equal(kept.spec.skin.hero.body, "athlete-male");
    assert.equal(kept.spec.skin.rival.body, "ravana");
  });
});
