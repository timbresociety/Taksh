// What practice teaches, checked against how each game is really played. A game with hand cursors
// teaches the cursors; a game played by moves teaches moves it can show.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cursorTrial } from "../src/lib/game/cursor-lesson.js";
import { onTray, playsWithCursors, practiceMoves } from "../src/lib/game/practice.js";
import { DEMO_KINDS } from "../src/lib/motion/lesson-draw.js";
import { DEFAULT_HERO, DEFAULT_RIVAL, SPEC_VERSION } from "../src/lib/spec/contract.js";
import { MOVE_CLIPS, MOVE_POSES } from "../src/lib/stage/coach.js";
import { TEMPLATES, defaultTuning, templateInfo } from "../src/lib/templates/index.js";

const chop = templateInfo("chop");
const FRAME_MS = 33;

const specOf = (template, tuning = {}) => ({
  specVersion: SPEC_VERSION, template: template.id, title: "Test", objective: "Test.", seed: 7,
  skin: { world: "downtown", style: "bright", hero: { ...DEFAULT_HERO }, rival: { ...DEFAULT_RIVAL } },
  tuning: { ...defaultTuning(template), ...tuning },
});

// One hand moving in a straight line from `from` to `to` over `ms`, a camera frame at a time.
function stroke(trial, dot, side, from, to, ms, { start = 1000, aspect = 16 / 9 } = {}) {
  const said = [];
  const frames = Math.max(1, Math.round(ms / FRAME_MS));
  for (let i = 0; i <= frames; i += 1) {
    const k = i / frames;
    const at = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
    said.push(trial.push({ left: null, right: null, [side]: at }, start + i * FRAME_MS, aspect, dot));
  }
  return said;
}

describe("every lesson matches the game's real input", () => {
  for (const template of TEMPLATES) {
    if (template.teachesItsOwnMoves) continue;
    for (const usesCamera of [true, false]) {
      const moves = practiceMoves(template, usesCamera);
      const mode = usesCamera ? "camera" : "keyboard";

      it(`${template.id} on the ${mode} has a lesson`, () => assert.ok(moves.length > 0));

      it(`${template.id} on the ${mode}: every move to copy has a demo the coach can play`, () => {
        for (const move of moves.filter((item) => !item.dots && !item.keyOnly)) {
          const demo = move.demo ?? move.gesture;
          assert.ok(typeof MOVE_POSES[demo] === "function" || MOVE_CLIPS[demo], `${template.id}: ${demo}`);
        }
      });

      if (!playsWithCursors(template)) continue;

      it(`${template.id} on the ${mode} starts with its cursors and never shows a slash`, () => {
        assert.ok(moves[0].dots?.length > 0, "a cursor step comes first");
        assert.ok(DEMO_KINDS.includes(moves[0].gesture), moves[0].gesture);
        assert.ok(!moves.some((move) => move.gesture.startsWith("slash_")));
      });
    }
  }

  it("every game with hand cursors says what the hands do in the brief, and none says slash or swipe", () => {
    for (const template of TEMPLATES.filter(playsWithCursors)) {
      for (const action of template.actions) {
        const own = template.bindings.filter((binding) => binding.action === action.id);
        if (!own.every((binding) => binding.gesture.startsWith("slash_"))) continue;
        const said = template.handCursors?.controls?.[action.id];
        assert.ok(said, `${template.id}: ${action.id}`);
        assert.doesNotMatch(said, /slash|swipe/i);
      }
    }
  });

  it("mirror match shows each pose as it calls it, so it says it teaches its own moves", () => {
    const poses = templateInfo("poses");
    assert.equal(poses.teachesItsOwnMoves, true);
    assert.deepEqual(practiceMoves(poses, true), []);
  });
});

describe("the chop shop slice lesson, scored by the game's own cut", () => {
  const [step] = practiceMoves(chop, true);
  const [left, right, either] = step.dots;

  it("a fast hand through the fruit cuts it, in any direction", () => {
    const across = cursorTrial(step, chop, specOf(chop));
    assert.ok(stroke(across, right, "right", { x: right.x - 0.4, y: right.y }, { x: right.x + 0.4, y: right.y }, 120).includes("hit"));
    const upward = cursorTrial(step, chop, specOf(chop));
    assert.ok(stroke(upward, right, "right", { x: right.x, y: right.y - 0.5 }, { x: right.x, y: right.y + 0.5 }, 150).includes("hit"));
  });

  it("a slow hand goes through without a cut, and is told to go faster", () => {
    const said = stroke(cursorTrial(step, chop, specOf(chop)), left, "left", { x: left.x - 0.3, y: left.y }, { x: left.x + 0.3, y: left.y }, 2500);
    assert.ok(!said.includes("hit"));
    assert.ok(said.includes("slow"));
  });

  it("a fruit of one hand's colour wants that hand, and the white one takes either", () => {
    const wrong = stroke(cursorTrial(step, chop, specOf(chop)), left, "right", { x: left.x - 0.4, y: left.y }, { x: left.x + 0.4, y: left.y }, 120);
    assert.ok(wrong.includes("wrong") && !wrong.includes("hit"));
    for (const side of ["left", "right"]) {
      assert.ok(stroke(cursorTrial(step, chop, specOf(chop)), either, side, { x: -0.4, y: either.y }, { x: 0.4, y: either.y }, 120).includes("hit"), side);
    }
  });

  it("follows the game's tuning: a pass fast enough at the default is too slow for a harder round", () => {
    const pass = (trial) => stroke(trial, right, "right", { x: right.x - 0.4, y: right.y }, { x: right.x + 0.4, y: right.y }, 500);
    assert.ok(pass(cursorTrial(step, chop, specOf(chop))).includes("hit"));
    assert.ok(!pass(cursorTrial(step, chop, specOf(chop, { handSpeed: 4 }))).includes("hit"));
  });

  it("one swipe counts once, even if it carries on into the next fruit", () => {
    const trial = cursorTrial(step, chop, specOf(chop));
    const said = stroke(trial, either, "right", { x: -0.6, y: either.y }, { x: 0.6, y: either.y }, 200);
    assert.equal(said.filter((word) => word === "hit").length, 1);
  });
});

describe("the rangoli tray lesson", () => {
  const rangoli = templateInfo("rangoli");
  const [step] = practiceMoves(rangoli, true);

  it("the tray counts by where it is along the floor, however high the hand is", () => {
    const [left] = step.dots;
    assert.ok(onTray({ x: left.x + 0.05, y: 0.6 }, left));
    assert.ok(onTray({ x: left.x, y: -0.9 }, left));
    assert.ok(!onTray({ x: left.x + 0.2, y: left.y }, left));
    assert.ok(!onTray(null, left));
  });

  it("each mark wants the tray of its colour", () => {
    const [left] = step.dots;
    const trial = cursorTrial(step, rangoli, specOf(rangoli));
    assert.equal(trial.push({ left: null, right: { x: left.x, y: 0 } }, 1000, 16 / 9, left), null);
    assert.equal(trial.push({ left: { x: left.x, y: 0 }, right: null }, 1033, 16 / 9, left), "hit");
  });

  it("on the keyboard every mark takes the mouse", () => {
    const [mouse] = practiceMoves(rangoli, false);
    const trial = cursorTrial(mouse, rangoli, specOf(rangoli));
    assert.equal(trial.push({ left: null, right: { x: mouse.dots[0].x, y: 0.3 } }, 1000, 1.4, mouse.dots[0]), "hit");
  });
});
