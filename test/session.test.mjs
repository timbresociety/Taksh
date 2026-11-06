import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameSession } from "../src/lib/game/session.js";
import { createFixtureProvider } from "../src/lib/pipeline/provider-fixture.js";
import { validateSpec } from "../src/lib/spec/validate.js";
import { TEMPLATES } from "../src/lib/templates/index.js";

const provider = createFixtureProvider();

async function specFor(idea) {
  const { data } = await provider.complete({ stage: "generate", input: { idea } });
  return validateSpec(data).spec;
}

const guard = await specFor("escape a robot");
const runner = await specFor("a train chase");
const hop = await specFor("hop across platforms");

function tickFor(session, ms) {
  const outcomes = [];
  for (let t = 0; t < ms; t += 20) outcomes.push(...session.tick(20));
  return outcomes;
}

function playing(spec = guard, options) {
  const session = new GameSession(spec, options);
  tickFor(session, 3100);
  return session;
}

describe("session", () => {
  it("counts down before the clock starts", () => {
    const session = new GameSession(guard);
    tickFor(session, 2900);
    assert.equal(session.phase, "countdown");
    assert.equal(session.state.t, 0);
    tickFor(session, 200);
    assert.equal(session.phase, "playing");
  });

  it("maps a gesture through the template's bindings", () => {
    const session = playing();
    session.handleGesture({ gesture: "step_right", confidence: 0.9, t: 1 });
    assert.equal(session.state.lane, 2);
    assert.equal(session.movements[0].used, true);
  });

  it("ignores a move with no meaning in this game", () => {
    const session = playing();
    session.handleGesture({ gesture: "hand_left", confidence: 0.9, t: 1 });
    assert.equal(session.state.lane, 1);
    assert.deepEqual(session.movements, []);
    assert.equal(session.result().actions, 0);
  });

  it("a spec cannot rebind the controls", () => {
    const session = playing({ ...guard, bindings: [{ gesture: "burpee", action: "left" }] });
    session.handleGesture({ gesture: "burpee", confidence: 0.9, t: 1 });
    assert.equal(session.state.lane, 1);
  });

  it("shows a bound move made during the countdown without acting on it", () => {
    const session = new GameSession(guard);
    session.handleGesture({ gesture: "step_right", confidence: 0.9, t: 1 });
    assert.equal(session.state.lane, 1);
    assert.equal(session.movements[0].used, false);
  });

  it("keyboard and gesture reach the same action", () => {
    const session = playing();
    session.handleKey("left");
    assert.equal(session.state.lane, 0);
    assert.equal(session.movements[0].used, true);
  });

  it("keys do nothing before the game starts", () => {
    const session = new GameSession(guard);
    session.handleKey("left");
    assert.equal(session.state.lane, 1);
  });

  it("two gestures on one action within a moment count once", () => {
    const session = playing(runner);
    session.handleGesture({ gesture: "high_knee", confidence: 0.9, t: 1 });
    session.handleGesture({ gesture: "jump", confidence: 0.9, t: 2 });
    assert.equal(session.result().actions, 1);
  });

  it("the same gesture twice is two real moves", () => {
    const session = playing();
    session.handleGesture({ gesture: "step_right", confidence: 0.9, t: 1 });
    session.handleGesture({ gesture: "step_left", confidence: 0.9, t: 2 });
    session.handleGesture({ gesture: "step_left", confidence: 0.9, t: 3 });
    assert.equal(session.state.lane, 0);
    assert.equal(session.result().actions, 3);
  });

  it("a held squat charges and standing launches, by body or by key", () => {
    for (const [press, release] of [
      [(session) => session.handleGesture({ gesture: "squat_down", confidence: 0.9, t: 1 }), (session) => session.handleGesture({ gesture: "squat_up", confidence: 0.9, t: 2 })],
      [(session) => session.handleKey("charge"), (session) => session.handleKey("charge_release")],
    ]) {
      const session = playing(hop);
      press(session);
      tickFor(session, 700);
      assert.ok(session.state.chargeMs > 0);
      release(session);
      const events = tickFor(session, 40);
      assert.ok(events.some((event) => event.type === "launch"));
      assert.ok(session.state.flight);
    }
  });

  it("hidden gestures act but stay out of the movement log", () => {
    const session = playing(hop);
    session.handleGesture({ gesture: "squat_down", confidence: 0.9, t: 1 });
    tickFor(session, 300);
    session.handleGesture({ gesture: "squat_up", confidence: 0.9, t: 2 });
    assert.equal(session.state.charging, false);
    assert.deepEqual(session.movements.map((item) => item.label), ["Squat"]);
  });

  it("reports the action and the template's events to the next tick", () => {
    const session = playing();
    session.handleKey("right");
    const types = session.tick(20).map((event) => event.type);
    assert.deepEqual(types.slice(0, 2), ["action", "move"]);
    assert.deepEqual(session.tick(20).filter((event) => event.type === "move"), []);
  });

  it("pauses on lost tracking: the clock stops and nothing can land", () => {
    const session = playing(guard, { usesCamera: true });
    const frozenAt = session.state.t;
    session.setTracking("lost");
    const outcomes = tickFor(session, 30000);
    assert.equal(session.phase, "paused");
    assert.equal(session.state.t, frozenAt);
    assert.deepEqual(outcomes, []);
  });

  it("ignores gestures while paused", () => {
    const session = playing(guard, { usesCamera: true });
    session.setTracking("lost");
    session.handleGesture({ gesture: "step_left", confidence: 0.9, t: 1 });
    assert.equal(session.state.lane, 1);
  });

  it("a partial view keeps playing", () => {
    const session = playing(guard, { usesCamera: true });
    session.setTracking("partial");
    assert.equal(session.phase, "playing");
  });

  it("resumes only after tracking has been stable, with a countdown", () => {
    const session = playing(guard, { usesCamera: true });
    session.setTracking("lost");
    tickFor(session, 1000);
    for (let t = 0; t < 800; t += 20) {
      session.setTracking("good");
      session.tick(20);
    }
    assert.equal(session.phase, "paused");
    assert.ok(session.countdownMs > 0);
    tickFor(session, 2100);
    assert.equal(session.phase, "playing");
  });

  it("a flicker back to lost restarts the wait", () => {
    const session = playing(guard, { usesCamera: true });
    session.setTracking("lost");
    session.setTracking("good");
    tickFor(session, 300);
    session.setTracking("lost");
    session.setTracking("good");
    tickFor(session, 300);
    session.setTracking("good");
    assert.equal(session.countdownMs, null);
  });

  it("keyboard play never pauses for tracking", () => {
    const session = playing();
    session.setTracking("lost");
    assert.equal(session.phase, "playing");
  });

  it("ends when the template ends, and tracking cannot reopen it", () => {
    const session = playing(guard, { usesCamera: true });
    const outcomes = tickFor(session, guard.tuning.durationS * 1000 + 200);
    assert.equal(session.phase, "ended");
    assert.ok(outcomes.some((event) => event.type === "end"));
    session.setTracking("lost");
    assert.equal(session.phase, "ended");
    assert.equal(session.result().actions, 0);
  });
});

describe("every template runs through a session", () => {
  for (const template of TEMPLATES) {
    it(`${template.id} takes its bot's actions as keys, and reports a hud and a result`, async () => {
      const spec = await specFor(template.name);
      assert.equal(spec.template, template.id);
      const session = playing(spec);
      for (let t = 0; t < 20000 && session.phase === "playing"; t += 20) {
        const action = template.bot(session.state, "quick");
        if (action) session.handleKey(action);
        session.tick(20);
        assert.equal(typeof session.hud().score, "number");
      }
      const result = session.result();
      assert.ok(result.actions > 0);
      assert.equal(typeof result.score, "number");
      assert.ok(result.stats.length > 0);
    });
  }
});
