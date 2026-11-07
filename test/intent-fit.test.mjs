// A player arrives with a body goal first and a world and mechanic second. These pin the body focus
// read from the bindings, the matcher that reads an idea, and both intent paths that use it.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clarifyIdea, generateGame } from "../src/lib/pipeline/pipeline.js";
import { INTENT_SCHEMA } from "../src/lib/pipeline/prompts.js";
import { bestTemplate, clarifyOptions, matchTemplates, readBody } from "../src/lib/pipeline/match.js";
import { createFixtureProvider } from "../src/lib/pipeline/provider-fixture.js";
import { GESTURES, contractText } from "../src/lib/spec/contract.js";
import { AVOID_WORDS, FOCUS_WORDS, conflicts, focusText, gestureFocus, templateFocus } from "../src/lib/templates/focus.js";
import { TEMPLATES, templateInfo } from "../src/lib/templates/index.js";

const fixtures = createFixtureProvider();
const UPPER = ["pads", "flyer", "chop", "rally", "oars", "rangoli", "dabba", "popup", "poses"];
const usesLegs = (id) => templateFocus(id).legs;

describe("body focus comes from the bindings", () => {
  it("every gesture, and every move a game binds, is tagged", () => {
    for (const gesture of GESTURES) assert.ok(gestureFocus(gesture.id), gesture.id);
    for (const template of TEMPLATES) {
      for (const binding of template.bindings) assert.ok(gestureFocus(binding.gesture), `${template.id} ${binding.gesture}`);
    }
  });

  it("the arms-only games use no legs, and the upper-body list is exactly them", () => {
    assert.deepEqual(TEMPLATES.filter((template) => !usesLegs(template.id)).map((template) => template.id).sort(), [...UPPER].sort());
  });

  it("Counter Bout steps and ducks, so it is not arms only; Pad Rounds is", () => {
    assert.equal(usesLegs("bout"), true);
    assert.equal(usesLegs("pads"), false);
    assert.ok(templateFocus("pads").regions.includes("arms"));
  });

  it("Koli Race is the one that fits a chair", () => {
    assert.deepEqual(TEMPLATES.filter((template) => templateFocus(template.id).seated).map((template) => template.id), ["oars"]);
  });

  it("knows which games jump and which run", () => {
    assert.equal(templateFocus("lane_runner").jumps, true);
    assert.equal(templateFocus("lane_runner").runs, true);
    assert.equal(templateFocus("matka").jumps, true);
    assert.equal(templateFocus("pads").jumps, false);
    assert.equal(templateFocus("rickshaw").runs, true);
  });

  it("the model sees each game's body line", () => {
    const text = contractText();
    for (const template of TEMPLATES) assert.ok(text.includes(`Body: ${focusText(template.id)}`), template.id);
    assert.match(focusText("oars"), /no legs.*fits a chair/);
  });

  it("an upper-body ask conflicts with every leg game and no arm game", () => {
    for (const template of TEMPLATES) {
      assert.equal(Boolean(conflicts(template.id, { focus: ["upper"] })), usesLegs(template.id), template.id);
    }
  });
});

describe("reading the body out of an idea", () => {
  const cases = [
    ["upper body, no running", ["upper"], ["running"]],
    ["no running or jumping", [], ["running", "jumping"]],
    ["I want an upper body game with no legs, not a runner", ["upper"], ["legs", "running"]],
    ["non-impact game for my shoulders", ["shoulders"], ["impact"]],
    ["I can't stand up, I use a wheelchair", ["seated"], []],
    ["I want to train my arms", ["arms"], []],
    ["leg day on the moon", ["legs"], []],
    ["no jumping, just punching", [], ["jumping"]],
    ["bad knees", [], ["impact"]],
    ["A fishing boat race where I pump my arms to row", [], []],
    // Other ways people rule things out.
    ["nothing that uses my legs", [], ["legs"]],
    ["everything except legs", [], ["legs"]],
    ["anything but a runner", [], ["running"]],
    ["a game that isn't running", [], ["running"]],
    ["something other than jumping", [], ["jumping"]],
    ["I'm tired of runner games", [], ["running"]],
    ["no arms, legs only", ["legs"], []],
    ["I don't mind running", [], []],
    // A hurt leg is never a request for a legs game.
    ["my legs are injured", [], ["legs"]],
    ["I have a broken leg, something for my arms", ["arms"], ["legs"]],
    ["recovering from knee surgery", [], ["legs"]],
    // A bare body part is a goal unless a mechanic is using the word.
    ["shoulders and arms", ["shoulders", "arms"], []],
    ["flap my arms and fly", [], []],
  ];
  for (const [idea, focus, avoid] of cases) {
    it(`"${idea}"`, () => {
      const reading = readBody(idea);
      assert.deepEqual(reading.focus.sort(), [...focus].sort());
      assert.deepEqual(reading.avoid.sort(), [...avoid].sort());
    });
  }

  it("a negation keeps what follows the turn", () => {
    assert.match(readBody("no jumping, just punching").positive, /punching/);
    assert.doesNotMatch(readBody("not a runner").positive, /runner/);
  });
});

describe("the matcher", () => {
  const picks = [
    ["I want an upper body workout in a space world", UPPER],
    ["arms only boxing game", ["pads"]],
    ["seated, arms only", ["oars"]],
    ["boxing", ["pads", "bout"]],
    ["a runner in Mumbai", ["lane_runner"]],
    ["upper body cardio", ["oars"]],
    ["full body workout", ["circuit"]],
    ["core workout", ["oars", "rickshaw"]],
    ["seated boxing", ["pads"]],
    // A named exercise goes to the game that really has it.
    ["jumping jacks", ["circuit"]],
    ["jump over gaps", ["hop"]],
  ];
  for (const [idea, allowed] of picks) {
    it(`"${idea}" picks ${allowed.join(" or ")}`, () => {
      const { template, evidence } = bestTemplate(idea);
      assert.ok(allowed.includes(template.id), template.id);
      assert.equal(evidence, true);
    });
  }

  it("something for my legs gets a game that uses them", () => {
    assert.ok(usesLegs(bestTemplate("something for my legs").template.id));
  });

  const armsOnly = [
    "I want to train my arms",
    "upper body, no running",
    "a game for my upper body, no running",
    "I want an upper body game with no legs, not a runner",
    "a running game but just arms",
    "upper body jumping game",
    "seated dodging in a wheelchair",
    "upper body workout on the moon",
    "nothing that uses my legs",
    "everything except legs",
    "I have a broken leg",
  ];
  for (const idea of armsOnly) {
    it(`"${idea}" never offers a game that needs legs`, () => {
      const ranked = matchTemplates(idea);
      assert.ok(ranked.length > 0);
      for (const { template } of ranked) assert.equal(usesLegs(template.id), false, template.id);
    });
  }

  it("no running and no jumping rule those games out", () => {
    for (const { template } of matchTemplates("no running or jumping, I want to punch")) {
      assert.equal(templateFocus(template.id).runs || templateFocus(template.id).jumps, false, template.id);
    }
  });

  it("the runner is never the default", () => {
    for (const idea of ["", "make me a cool workout game", "something fun", "a game in Mumbai", "I want to train"]) {
      assert.notEqual(bestTemplate(idea).template.id, "lane_runner", idea);
    }
  });

  it("an idea with nothing to go on is only a guess", () => {
    assert.equal(bestTemplate("make me a cool workout game").evidence, false);
    assert.equal(bestTemplate("a game in Mumbai").evidence, false);
  });

  it("explains its pick", () => {
    const [top] = matchTemplates("arms only boxing game");
    assert.ok(top.why.includes("mechanic"));
    assert.ok(top.score > 0);
  });

  it("asks with answers that cover the body, each a different game", () => {
    const options = clarifyOptions();
    assert.equal(options.length, 4);
    const ids = options.map((option) => TEMPLATES.find((template) => option.includes(`(${template.name})`)).id);
    assert.equal(new Set(ids).size, 4);
    assert.match(options[0], /^Upper body/);
    assert.equal(usesLegs(ids[0]), false);
    assert.match(options[1], /^Legs/);
    assert.equal(usesLegs(ids[1]), true);
    assert.ok(templateFocus(ids[2]).cardio);
    assert.ok(!ids.includes("lane_runner"));
  });

  it("answers leave out what the idea ruled out", () => {
    for (const option of clarifyOptions({ avoid: ["jumping", "running"] })) {
      const template = TEMPLATES.find((item) => option.includes(`(${item.name})`));
      assert.equal(templateFocus(template.id).jumps || templateFocus(template.id).runs, false, option);
    }
  });
});

describe("the fixture path goes straight to the best fit", () => {
  const ideas = [
    ["I want an upper body workout in a space world", UPPER, "station"],
    ["arms only boxing game", ["pads"]],
    ["seated, arms only", ["oars"]],
    ["upper body, no running", UPPER],
    ["I want to train my arms", UPPER],
    ["boxing", ["pads", "bout"]],
    ["a runner in Mumbai", ["lane_runner"], "mumbai"],
    ["leg day on the moon", ["hop"], "moon"],
  ];
  for (const [idea, allowed, world] of ideas) {
    it(`"${idea}" is ready, and builds ${allowed.join(" or ")}`, async () => {
      const intent = await clarifyIdea({ idea }, fixtures);
      assert.equal(intent.status, "ready");
      const game = await generateGame({ idea, brief: intent.brief }, fixtures);
      assert.equal(game.ok, true);
      assert.ok(allowed.includes(game.spec.template), game.spec.template);
      if (world) assert.equal(game.spec.skin.world, world);
    });
  }

  it("something for my legs builds a legs game", async () => {
    const intent = await clarifyIdea({ idea: "something for my legs" }, fixtures);
    assert.equal(intent.status, "ready");
    assert.ok(usesLegs(intent.brief.template));
  });

  it("a free-text answer is read again, so 'just my arms' never ends in a runner", async () => {
    const idea = "make me a cool workout game";
    const asked = await clarifyIdea({ idea }, fixtures);
    assert.equal(asked.status, "clarify");
    for (const clarification of ["just my arms please", "upper body", "arms only"]) {
      const answered = await clarifyIdea({ idea, clarification }, fixtures);
      assert.equal(answered.status, "ready");
      assert.equal(usesLegs(answered.brief.template), false, clarification);
    }
  });

  it("an answer that says nothing still ends ready, never on the runner", async () => {
    const answered = await clarifyIdea({ idea: "make me a cool workout game", clarification: "whatever" }, fixtures);
    assert.equal(answered.status, "ready");
    assert.notEqual(answered.brief.template, "lane_runner");
  });

  it("a refused move keeps the body goal in its closest game", async () => {
    for (const idea of ["push ups for my upper body", "dumbbell curls in space", "a plank challenge"]) {
      const intent = await clarifyIdea({ idea }, fixtures);
      assert.equal(intent.status, "unsupported", idea);
      assert.equal(usesLegs(intent.brief.template), false, `${idea}: ${intent.brief.template}`);
      assert.match(intent.unsupported.closest, new RegExp(templateInfo(intent.brief.template).name));
    }
  });

  it("returns the body it read", async () => {
    const intent = await clarifyIdea({ idea: "upper body, no running" }, fixtures);
    assert.deepEqual(intent.body, { focus: ["upper"], avoid: ["running"] });
  });
});

function scripted(...replies) {
  const calls = [];
  return {
    calls,
    source: "stub",
    model: "stub",
    async complete(request) {
      calls.push(request);
      return { data: structuredClone(replies[Math.min(calls.length - 1, replies.length - 1)]) };
    },
  };
}

const none = { requested: "", closest: "" };
const answer = (template, fields = {}) => ({
  status: "ready",
  brief: { template, world: "station", style: "bright", goal: "Play." },
  body: { focus: [], avoid: [] },
  question: "",
  options: [],
  unsupported: none,
  ...fields,
});

describe("the model path checks the model's pick against the body", () => {
  it("swaps a leg game for the best upper-body fit", async () => {
    const result = await clarifyIdea({ idea: "I want an upper body workout in a space world" }, scripted(answer("lane_runner")));
    assert.equal(result.status, "ready");
    assert.ok(UPPER.includes(result.brief.template), result.brief.template);
    assert.equal(result.brief.world, "station");
    assert.deepEqual(result.swapped, { from: "lane_runner", why: "it needs your legs" });
  });

  it("trusts the model's structured focus when the idea has no body words", async () => {
    const reply = answer("guard", { body: { focus: ["seated"], avoid: [] } });
    const result = await clarifyIdea({ idea: "a game for my grandad" }, scripted(reply));
    assert.equal(usesLegs(result.brief.template), false);
  });

  it("honours the model's avoid list", async () => {
    const reply = answer("handi", { body: { focus: [], avoid: ["jumping"] } });
    const result = await clarifyIdea({ idea: "a festival game" }, scripted(reply));
    assert.equal(templateFocus(result.brief.template).jumps, false);
  });

  it("keeps a pick that fits", async () => {
    const result = await clarifyIdea({ idea: "boxing" }, scripted(answer("bout")));
    assert.equal(result.brief.template, "bout");
    assert.equal(result.swapped, undefined);
  });

  it("an idea with a body goal is answered, not asked about", async () => {
    const reply = answer("lane_runner", { status: "clarify", question: "Which?", options: ["Running", "Hopping"] });
    const result = await clarifyIdea({ idea: "something for my upper body" }, scripted(reply));
    assert.equal(result.status, "ready");
    assert.equal(result.question, undefined);
    assert.equal(usesLegs(result.brief.template), false);
  });

  it("a second question is turned into a pick made from the idea and the answer", async () => {
    const reply = answer("lane_runner", { status: "clarify", question: "Again?", options: ["a"] });
    const result = await clarifyIdea({ idea: "make me a game", clarification: "punching" }, scripted(reply));
    assert.equal(result.status, "ready");
    assert.equal(result.brief.template, "pads");
  });

  it("a swapped closest game is described as itself", async () => {
    const reply = answer("lane_runner", { status: "unsupported", unsupported: { requested: "push-ups", closest: "Local Dash: run." } });
    const result = await clarifyIdea({ idea: "push ups for my upper body" }, scripted(reply));
    const template = templateInfo(result.brief.template);
    assert.equal(usesLegs(template.id), false);
    assert.equal(result.unsupported.closest, `${template.name}: ${template.pitch}`);
  });

  it("asks the model for focus and avoid in words code can check", () => {
    const { body } = INTENT_SCHEMA.properties;
    assert.deepEqual(body.properties.focus.items.enum, FOCUS_WORDS);
    assert.deepEqual(body.properties.avoid.items.enum, AVOID_WORDS);
    assert.deepEqual(body.required, ["focus", "avoid"]);
  });

  it("uses only schema keywords the providers' strict mode accepts", () => {
    const allowed = new Set(["type", "properties", "required", "additionalProperties", "items", "enum"]);
    const walk = (node) => {
      for (const [key, value] of Object.entries(node)) {
        assert.ok(allowed.has(key), key);
        if (key === "properties") Object.values(value).forEach(walk);
        if (key === "items") walk(value);
      }
    };
    walk(INTENT_SCHEMA);
  });
});
