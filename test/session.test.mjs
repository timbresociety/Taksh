import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameSession } from "../src/lib/game/session.js";
import { createFixtureProvider } from "../src/lib/pipeline/provider-fixture.js";

const { data: spec } = await createFixtureProvider().complete({ stage: "generate", input: { idea: "escape a robot" } });

function tickFor(session, ms) {
  const outcomes = [];
  for (let t = 0; t < ms; t += 20) outcomes.push(...session.tick(20));
  return outcomes;
}

describe("session", () => {
  it("counts down before the clock starts", () => {
    const session = new GameSession(spec);
    tickFor(session, 2900);
    assert.equal(session.phase, "countdown");
    assert.equal(session.round.t, 0);
    tickFor(session, 200);
    assert.equal(session.phase, "playing");
  });

  it("maps a gesture through the spec's bindings", () => {
    const session = new GameSession(spec);
    tickFor(session, 3100);
    session.handleGesture({ gesture: "step_right", confidence: 0.9, t: 1 });
    assert.equal(session.round.lane, 2);
    assert.equal(session.movements[0].used, true);
  });

  it("shows an unbound gesture without acting on it", () => {
    const session = new GameSession(spec);
    tickFor(session, 3100);
    session.handleGesture({ gesture: "hand_left", confidence: 0.9, t: 1 });
    assert.equal(session.round.lane, 1);
    assert.equal(session.movements[0].used, false);
  });

  it("keyboard and gesture reach the same action", () => {
    const session = new GameSession(spec);
    tickFor(session, 3100);
    session.handleKey("move_left");
    assert.equal(session.round.lane, 0);
  });

  it("two gestures on one action within a moment count once", () => {
    const session = new GameSession(spec);
    tickFor(session, 3100);
    session.handleGesture({ gesture: "high_knee", confidence: 0.9, t: 1 });
    session.handleGesture({ gesture: "jump", confidence: 0.9, t: 2 });
    assert.equal(session.actionsTaken.filter((item) => item.action === "up").length, 1);
  });

  it("pauses on lost tracking: the clock stops and events cannot land", () => {
    const session = new GameSession(spec, { usesCamera: true });
    tickFor(session, 3100);
    const frozenAt = session.round.t;
    session.setTracking("lost");
    const outcomes = tickFor(session, 30000);
    assert.equal(session.phase, "paused");
    assert.equal(session.round.t, frozenAt);
    assert.deepEqual(outcomes, []);
  });

  it("ignores gestures while paused", () => {
    const session = new GameSession(spec, { usesCamera: true });
    tickFor(session, 3100);
    session.setTracking("lost");
    session.handleGesture({ gesture: "step_left", confidence: 0.9, t: 1 });
    assert.equal(session.round.lane, 1);
  });

  it("resumes only after tracking has been stable, with a countdown", () => {
    const session = new GameSession(spec, { usesCamera: true });
    tickFor(session, 3100);
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
    const session = new GameSession(spec, { usesCamera: true });
    tickFor(session, 3100);
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
    const session = new GameSession(spec);
    tickFor(session, 3100);
    session.setTracking("lost");
    assert.equal(session.phase, "playing");
  });
});
