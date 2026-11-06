// Every template is played by its own simulated player, so "this game works" is measured, not assumed.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareSpecs } from "../src/lib/spec/compare.js";
import { DEFAULT_HERO, DEFAULT_RIVAL, GESTURES, SPEC_VERSION, contractText, gestureInfo } from "../src/lib/spec/contract.js";
import { validateSpec } from "../src/lib/spec/validate.js";
import { TEMPLATES, defaultTuning, simulate, templateInfo } from "../src/lib/templates/index.js";
import { COACH, RAMP_M, ROOF, surfaceAt } from "../src/lib/templates/runner.js";

const CAP_MS = 240000; // simulate()'s own limit; a player who never loses an endless game reaches it

function specOf(template, tuning = {}, seed = 7) {
  return {
    specVersion: SPEC_VERSION,
    template: template.id,
    title: "Test",
    objective: "Test the game.",
    seed,
    skin: { world: "downtown", style: "bright", hero: { ...DEFAULT_HERO }, rival: { ...DEFAULT_RIVAL } },
    tuning: { ...defaultTuning(template), ...tuning },
  };
}

const endless = (template) => template.length === "Endless";

// Steps a game while calling one action again and again, with the bot playing around it, and
// reports whether the action ever changed anything. Functions (the seeded random) do not serialise.
function actionTakesEffect(template, action, seed = 7) {
  const state = template.create(specOf(template, {}, seed));
  for (let t = 0; t < 60000 && state.status === "playing"; t += 20) {
    const wanted = template.bot(state, "quick");
    if (wanted && wanted !== action) template.act(state, wanted);
    const before = JSON.stringify(state);
    template.act(state, action);
    if (JSON.stringify(state) !== before) return true;
    template.step(state, 20);
  }
  return false;
}

for (const template of TEMPLATES) {
  describe(template.id, () => {
    for (const skill of ["quick", "casual"]) {
      it(`a ${skill} player finishes and scores`, () => {
        const result = simulate(template, specOf(template), { skill });
        assert.ok(result.score > 0, `score ${result.score}`);
        assert.ok(result.actions > 0);
        if (!endless(template)) assert.ok(result.ms < CAP_MS, `still playing after ${result.ms}ms`);
        assert.ok(["win", "lose", "complete"].includes(result.outcome));
        assert.ok(result.stats.length > 0);
      });
    }

    it("the same seed plays the same game", () => {
      const spec = specOf(template, {}, 42);
      for (const skill of ["quick", "casual"]) {
        assert.deepEqual(simulate(template, structuredClone(spec), { skill }), simulate(template, structuredClone(spec), { skill }));
      }
    });

    if (endless(template)) {
      it("an endless game ends when the player does nothing", () => {
        const state = template.create(specOf(template));
        for (let t = 0; t < 60000 && state.status === "playing"; t += 20) template.step(state, 20);
        assert.equal(state.status, "ended");
      });
    }

    for (const [key, field] of Object.entries(template.tuning)) {
      for (const end of ["min", "max"]) {
        it(`${key} at its ${end} (${field[end]}) validates and runs`, () => {
          const check = validateSpec(specOf(template, { [key]: field[end] }));
          assert.deepEqual(check.errors, []);
          assert.equal(check.spec.tuning[key], field[end]);
          for (const skill of ["quick", "casual"]) assert.ok(simulate(template, check.spec, { skill }).score > 0, skill);
        });
      }

      it(`${key} refuses a value past either end`, () => {
        for (const value of [field.min - 1, field.max + 1]) {
          const check = validateSpec(specOf(template, { [key]: value }));
          assert.equal(check.ok, false);
          assert.ok(check.errors.some((error) => error.includes(`tuning.${key}`)), check.errors.join(" | "));
        }
      });

      it(`${key} is described for the prompt`, () => {
        assert.equal(typeof field.label, "string");
        assert.equal(typeof field.higherIsHarder, "boolean");
        assert.ok(field.min <= field.default && field.default <= field.max);
        assert.ok(contractText().includes(`${key}: ${field.label}`));
      });
    }

    it("every binding names a real gesture", () => {
      for (const { gesture, exercise } of template.bindings) {
        assert.ok(gestureInfo(gesture), `${gesture} is not in GESTURES`);
        assert.ok(exercise);
      }
    });

    it("no gesture is bound twice", () => {
      const gestures = template.bindings.map((binding) => binding.gesture);
      assert.equal(new Set(gestures).size, gestures.length);
    });

    // Some templates treat any unknown action as a miss, so doing something is not proof on its own.
    for (const action of new Set(template.bindings.map((binding) => binding.action))) {
      it(`really handles ${action}`, () => {
        const declared = template.actions.flatMap(({ id, hold }) => (hold ? [id, `${id}_release`] : [id]));
        assert.ok(declared.includes(action), `${action} is not one of ${declared}`);
        assert.equal(actionTakesEffect(template, action), true);
      });
    }

    for (const { id } of template.actions) {
      it(`its ${id} key does something`, () => {
        assert.equal(actionTakesEffect(template, id), true);
      });
    }

    it("every action can be reached by keyboard and by body", () => {
      const bound = new Set(template.bindings.map((binding) => binding.action));
      for (const action of template.actions) {
        assert.ok(action.key && action.keyLabel, action.id);
        assert.ok(bound.has(action.id), `${action.id} has no gesture`);
      }
    });

    it("keys do not clash", () => {
      const keys = template.actions.map((action) => action.key);
      assert.equal(new Set(keys).size, keys.length);
    });

    it("says what kind of camera view it needs", () => {
      assert.ok(["full", "upper"].includes(template.framing));
      assert.ok(template.name && template.pitch && template.score);
    });

    it("draws a hud from a fresh game", () => {
      assert.equal(typeof template.hud(template.create(specOf(template))).score, "number");
    });
  });
}

describe("hop's charge", () => {
  const hop = templateInfo("hop");

  it("a release only launches after a charge", () => {
    const state = hop.create(specOf(hop));
    assert.deepEqual(hop.act(state, "charge_release"), []);
    assert.equal(state.flight, null);
  });

  it("charge_release is bound to standing up, and launches further the longer you squat", () => {
    assert.equal(hop.bindings.find((binding) => binding.gesture === "squat_up").action, "charge_release");
    const launch = (ms) => {
      const state = hop.create(specOf(hop));
      hop.act(state, "charge");
      for (let t = 0; t < ms; t += 20) hop.step(state, 20);
      return hop.act(state, "charge_release")[0].power;
    };
    assert.ok(launch(1000) > launch(300));
  });

  it("a twitch of a squat does not launch", () => {
    const state = hop.create(specOf(hop));
    hop.act(state, "charge");
    hop.step(state, 20);
    assert.deepEqual(hop.act(state, "charge_release"), []);
    assert.equal(state.flight, null);
  });
});

// Found while writing these tests, and left for the template owner. See the note in gestures.test.mjs.
describe("reading a shot early", () => {
  it("a slip held until the shot lands still dodges it", () => {
    const bout = templateInfo("bout");
    const state = bout.create(specOf(bout, { warningMs: 2000 }));
    while (!state.attack) bout.step(state, 20);
    const wanted = { left: "slip_right", right: "slip_left", high: "duck" }[state.attack.side];
    bout.step(state, 400); // the player reacts in good time, and stays leaned until the shot lands
    bout.act(state, wanted);
    const events = [];
    while (state.attack) events.push(...bout.step(state, 20));
    assert.ok(events.some((event) => event.type === "dodge"), events.map((event) => event.type).join());
  });
});

describe("Local Dash has height", () => {
  const runner = templateInfo("lane_runner");
  const fresh = (changes = {}) => Object.assign(runner.create(specOf(runner)), { obstacles: [], coins: [], platforms: [], nextRowZ: 1e6 }, changes);
  const run = (state, ms) => {
    const events = [];
    for (let t = 0; t < ms; t += 20) events.push(...runner.step(state, 20));
    return events;
  };
  const train = (lane, z, length = COACH) => ({ id: 1, kind: "train1", lane, z, length, coaches: 1 });
  const ramp = (lane, z) => ({ id: 2, kind: "ramp", lane, z, length: RAMP_M });

  it("climbs a ramp onto a roof, and drops when the train ends", () => {
    const state = fresh({ lane: 1, ramp: 0, platforms: [ramp(1, 2), train(1, 2 + RAMP_M)] });
    run(state, 1200);
    assert.equal(state.y, ROOF);
    assert.equal(state.lives, state.startLives);
    const events = run(state, 2400);
    assert.equal(state.y, 0);
    assert.ok(events.some((event) => event.type === "land"));
    assert.ok(state.roofMetres > COACH - 3);
  });

  it("a train front costs a life and moves the player to a lane they can stand in", () => {
    const state = fresh({ lane: 1, platforms: [train(1, 3)] });
    const events = run(state, 500);
    assert.ok(events.some((event) => event.type === "hurt"));
    assert.equal(state.lives, state.startLives - 1);
    assert.notEqual(state.lane, 1);
  });

  it("the side of a train stops a lane change, without costing a life", () => {
    const state = fresh({ lane: 1, platforms: [train(2, -5, 40)] });
    assert.equal(runner.act(state, "right")[0].type, "bump");
    assert.equal(state.lane, 1);
    assert.equal(state.lives, state.startLives);
  });

  it("from a roof a player can step across to the next roof or down to the street", () => {
    const state = fresh({ lane: 1, y: ROOF, platforms: [train(1, -5, 40), train(2, -5, 40)] });
    runner.act(state, "right");
    assert.equal(state.lane, 2);
    runner.act(state, "left");
    runner.act(state, "left");
    assert.equal(state.lane, 0);
    run(state, 800);
    assert.equal(state.y, 0);
  });

  it("the street cannot touch a player on the roof, and a roof obstacle still can", () => {
    const street = fresh({ lane: 1, y: ROOF, platforms: [train(1, -5, 60)], obstacles: [{ id: 5, kind: "wall", lane: 1, z: 3, y: 0, passed: false }] });
    run(street, 500);
    assert.equal(street.lives, street.startLives);
    const roof = fresh({ lane: 1, y: ROOF, platforms: [train(1, -5, 60)], obstacles: [{ id: 5, kind: "low", lane: 1, z: 3, y: ROOF, passed: false }] });
    run(roof, 500);
    assert.equal(roof.lives, roof.startLives - 1);
  });

  it("jumps a roof obstacle the same as a street one", () => {
    const state = fresh({ lane: 1, y: ROOF, ramp: 0, platforms: [train(1, -5, 60)], obstacles: [{ id: 5, kind: "low", lane: 1, z: 2.6, y: ROOF, passed: false }] });
    runner.act(state, "jump");
    run(state, 500);
    assert.equal(state.lives, state.startLives);
  });

  it("rolling in the air dives back down", () => {
    const state = fresh();
    runner.act(state, "jump");
    run(state, 200);
    runner.act(state, "roll");
    assert.ok(state.vy < 0);
  });

  it("no train section ever fills all three lanes", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = runner.create({ ...specOf(runner, { trainShare: 0.7 }), seed });
      for (let t = 0; t < 40000; t += 200) {
        runner.step(state, 200);
        state.lives = 3;
        for (let z = 0; z < 90; z += 3) {
          const open = [0, 1, 2].some((lane) => surfaceAt(state, lane, z) === 0 || state.platforms.some((part) => part.kind === "ramp" && part.lane === lane && z >= part.z && z <= part.z + part.length));
          const roofs = [0, 1, 2].filter((lane) => surfaceAt(state, lane, z) === ROOF).length;
          assert.ok(open || roofs < 3, `seed ${seed} z ${z}`);
        }
      }
    }
  });

  it("a quick player reaches the roofs and lasts", () => {
    const result = simulate(runner, { ...specOf(runner, { trainShare: 0.7 }), seed: 11 }, { maxMs: 60000 });
    const roof = result.stats.find((stat) => stat.label === "On the roofs").value;
    assert.ok(parseInt(roof, 10) > 30, roof);
    assert.ok(result.ms >= 30000, `lasted ${result.ms}`);
  });
});

describe("Counter Bout rules", () => {
  const bout = templateInfo("bout");
  const dodge = (state) => {
    while (!state.attack) bout.step(state, 20);
    bout.act(state, { left: "slip_right", right: "slip_left", high: "duck" }[state.attack.side]);
    while (state.attack) bout.step(state, 20);
  };

  it("a punch always lands, with no dodge first", () => {
    const state = bout.create(specOf(bout));
    assert.ok(bout.act(state, "jab").some((event) => event.type === "land"));
    assert.equal(state.landed, 1);
  });

  it("a dodge makes the next punch hit twice as hard", () => {
    const plain = bout.create(specOf(bout));
    const countered = bout.create(specOf(bout));
    bout.act(plain, "cross");
    dodge(countered);
    bout.act(countered, "cross");
    assert.equal(countered.rivalMax - countered.rivalHealth, (plain.rivalMax - plain.rivalHealth) * 2);
  });

  it("tells the player the move to make, not the side of the shot", () => {
    const state = bout.create(specOf(bout));
    while (!state.attack) bout.step(state, 20);
    assert.match(bout.hud(state).extra, /^(Lean left|Lean right|Duck)$/);
  });

  it("holding down a key cannot outrun an arm", () => {
    const state = bout.create(specOf(bout));
    bout.act(state, "jab");
    assert.deepEqual(bout.act(state, "jab"), []);
  });
});

describe("Lane Guard fast feet", () => {
  const guard = templateInfo("guard");
  const catchOne = (state) => {
    state.incoming.push({ id: 99, kind: "target", lane: state.lane, ms: 0, warningMs: 100, resolved: false });
    guard.step(state, 120);
    return state.score;
  };

  it("doubles points while the feet are burning", () => {
    const plain = catchOne(guard.create(specOf(guard)));
    const state = guard.create(specOf(guard));
    guard.act(state, "feet");
    assert.equal(catchOne(state), plain * 2);
  });

  it("the fire goes out when the feet stop", () => {
    const state = guard.create(specOf(guard));
    guard.act(state, "feet");
    for (let t = 0; t < 1200; t += 20) guard.step(state, 20);
    assert.equal(state.fireMs, 0);
  });
});

describe("contract", () => {
  it("GESTURES has no repeats", () => {
    const ids = GESTURES.map((gesture) => gesture.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("the prompt text lists every template", () => {
    for (const template of TEMPLATES) assert.ok(contractText().includes(`- ${template.id} (${template.name})`));
  });

  it("the default spec of every template validates", () => {
    for (const template of TEMPLATES) assert.deepEqual(validateSpec(specOf(template)).errors, [], template.id);
  });
});

describe("validator", () => {
  const runner = templateInfo("lane_runner");

  it("takes tuning as a { key, value } list and returns an object with every key", () => {
    const check = validateSpec({ ...specOf(runner), tuning: [{ key: "lives", value: 2 }] });
    assert.deepEqual(check.errors, []);
    assert.deepEqual(check.spec.tuning, { ...defaultTuning(runner), lives: 2 });
  });

  it("takes its own output back unchanged", () => {
    const { spec } = validateSpec(specOf(runner));
    assert.deepEqual(validateSpec(spec).spec, spec);
  });

  it("rounds a field that has to be whole", () => {
    assert.equal(validateSpec(specOf(runner, { lives: 2.4 })).spec.tuning.lives, 2);
  });

  const cases = {
    "not an object": [() => null, /not an object/],
    "an old spec version": [(s) => ({ ...s, specVersion: 1 }), /specVersion/],
    "a template that does not exist": [(s) => ({ ...s, template: "chess" }), /template "chess"/],
    "a missing title": [(s) => ({ ...s, title: " " }), /title/],
    "a missing objective": [(s) => ({ ...s, objective: undefined }), /objective/],
    "a seed that is not whole": [(s) => ({ ...s, seed: 1.5 }), /seed/],
    "an unknown world": [(s) => ({ ...s, skin: { ...s.skin, world: "mars" } }), /skin\.world/],
    "an unknown style": [(s) => ({ ...s, skin: { ...s.skin, style: "chalk" } }), /skin\.style/],
    "a missing hero": [(s) => ({ ...s, skin: { ...s.skin, hero: undefined } }), /skin\.hero is missing/],
    "an unknown body": [(s) => ({ ...s, skin: { ...s.skin, rival: { ...s.skin.rival, body: "dragon" } } }), /skin\.rival\.body/],
    "unknown hair": [(s) => ({ ...s, skin: { ...s.skin, hero: { ...s.skin.hero, hair: "mohawk" } } }), /skin\.hero\.hair/],
    "a bad colour": [(s) => ({ ...s, skin: { ...s.skin, hero: { ...s.skin.hero, top: "red" } } }), /skin\.hero\.top/],
    "a tuning key from another template": [(s) => ({ ...s, tuning: [{ key: "warningMs", value: 1000 }] }), /tuning\.warningMs does not exist/],
    "tuning that is not a number": [(s) => ({ ...s, tuning: [{ key: "lives", value: "3" }] }), /tuning\.lives/],
    "tuning that names an inherited key": [(s) => ({ ...s, tuning: [{ key: "toString", value: 1 }] }), /tuning\.toString does not exist/],
    "a binding on the spec": [(s) => ({ ...s, bindings: [] }), /bindings is not part/],
    "a key on the skin": [(s) => ({ ...s, skin: { ...s.skin, gesture: "jump" } }), /skin\.gesture is not part/],
    "a key on a character": [(s) => ({ ...s, skin: { ...s.skin, hero: { ...s.skin.hero, gesture: "jump" } } }), /skin\.hero\.gesture is not part/],
  };
  for (const [name, [mutate, pattern]] of Object.entries(cases)) {
    it(`rejects ${name}`, () => {
      const check = validateSpec(mutate(specOf(runner)));
      assert.equal(check.ok, false);
      assert.equal(check.spec, null);
      assert.ok(check.errors.some((error) => pattern.test(error)), check.errors.join(" | "));
    });
  }

  it("lists every problem at once, so one repair can fix them all", () => {
    const spec = specOf(runner);
    spec.title = "";
    spec.skin.world = "mars";
    assert.equal(validateSpec(spec).errors.length, 2);
  });

  it("refuses tuning no player could score in, even inside every range", () => {
    const flyer = templateInfo("flyer");
    const hardest = Object.fromEntries(Object.entries(flyer.tuning).map(([key, field]) => [key, field.higherIsHarder ? field.max : field.min]));
    const check = validateSpec(specOf(flyer, hardest));
    assert.equal(check.ok, false);
    assert.ok(check.errors.some((error) => /cannot score/.test(error)), check.errors.join(" | "));
  });
});

describe("compareSpecs", () => {
  const guard = templateInfo("guard");
  const base = validateSpec(specOf(guard)).spec;

  it("reports nothing for an identical spec", () => {
    assert.deepEqual(compareSpecs(base, structuredClone(base)), { changes: [], rulesChanged: false, lookChanged: false });
  });

  it("measures a tuning change", () => {
    const { changes, rulesChanged, lookChanged } = compareSpecs(base, { ...base, tuning: { ...base.tuning, warningMs: 3000 } });
    assert.deepEqual(changes, [{ key: "warningMs", label: "Warning time", before: 1900, after: 3000, unit: "ms" }]);
    assert.equal(rulesChanged, true);
    assert.equal(lookChanged, false);
  });

  it("a skin or title change is a look change, not a rule change", () => {
    for (const next of [{ ...base, skin: { ...base.skin, world: "moon" } }, { ...base, title: "New" }]) {
      const { rulesChanged, lookChanged } = compareSpecs(base, next);
      assert.equal(rulesChanged, false);
      assert.equal(lookChanged, true);
    }
  });

  it("a new template is one change, by name", () => {
    const pads = validateSpec(specOf(templateInfo("pads"))).spec;
    const { changes, rulesChanged } = compareSpecs(base, pads);
    assert.equal(rulesChanged, true);
    assert.deepEqual(changes.map((change) => [change.before, change.after]), [["Lane Guard", "Pad Rounds"]]);
  });
});

describe("tuning changes what a player experiences", () => {
  it("a tougher rival takes longer to put down", () => {
    const bout = templateInfo("bout");
    assert.ok(simulate(bout, specOf(bout, { rivalHealth: 200 })).ms > simulate(bout, specOf(bout, { rivalHealth: 40 })).ms);
  });

  it("a longer round means more pads", () => {
    const pads = templateInfo("pads");
    assert.ok(simulate(pads, specOf(pads, { durationS: 60 })).score > simulate(pads, specOf(pads, { durationS: 20 })).score);
  });
});

describe("clearRoad", () => {
  it("removes scenery on the road ahead, and keeps what stands beside it or behind the camera", async () => {
    const { clearRoad } = await import("../src/lib/stage/views/shared.js");
    const at = (x, z) => ({ position: { x, z } });
    const kept = [at(9, -20), at(0, 8)];
    const scenery = { children: [at(0, -15), at(4, -30), ...kept], remove(item) { this.children = this.children.filter((other) => other !== item); } };
    clearRoad(scenery, 7.4);
    assert.deepEqual(scenery.children, kept);
  });
});
