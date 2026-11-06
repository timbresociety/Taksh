// Regression tests on landmarks that MediaPipe produced from real footage in a real browser.
// See test/traces/README.md for where each trace came from.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { replayTrace } from "../src/lib/motion/replay.js";

const load = async (name) => replayTrace(JSON.parse(await readFile(new URL(`./traces/${name}.json`, import.meta.url))));
const named = (events, gesture) => events.filter((event) => event.gesture === gesture);
const loadAll = async (name) => replayTrace({ ...JSON.parse(await readFile(new URL(`./traces/${name}.json`, import.meta.url))), moves: "all" });

describe("real footage", () => {
  it("counts each of six real burpees once, and never reads the low phase as lost", async () => {
    const { events, tracking } = await load("real-burpees-and-jacks");
    assert.equal(named(events, "burpee").length, 6);
    assert.equal(tracking.lost ?? 0, 0);
  });

  it("does not turn jumping jacks into steps, kicks or knees", async () => {
    const { events } = await load("real-burpees-and-jacks");
    for (const gesture of ["step_left", "step_right", "kick_left", "kick_right", "high_knee"]) {
      assert.equal(named(events, gesture).length, 0, gesture);
    }
  });

  it("counts all eight real jumping jacks, counted separately from the raw landmarks", async () => {
    const { events } = await loadAll("real-burpees-and-jacks");
    assert.equal(named(events, "jumping_jack").length, 8);
  });

  it("reads each real burpee's reach to the floor as one toe touch, with no stutter", async () => {
    const { events } = await loadAll("real-burpees-and-jacks");
    assert.equal(named(events, "toe_touch").length, 6);
  });

  it("finds none of the moves that are not in the footage", async () => {
    const { events } = await loadAll("real-burpees-and-jacks");
    for (const gesture of ["lunge", "side_lunge_left", "side_lunge_right", "skater_left", "skater_right", "windmill_left", "windmill_right", "cross_crunch_left", "cross_crunch_right", "curl_left", "curl_right", "wood_chop", "butt_kick_left", "butt_kick_right"]) {
      assert.equal(named(events, gesture).length, 0, gesture);
    }
  });

  it("counts a second person's burpee once", async () => {
    const { events } = await load("real-burpee-second-person");
    assert.deepEqual(events.map((event) => event.gesture), ["burpee"]);
  });
});

describe("real footage with metric depth", () => {
  const moves = "all";
  const replay = async (framing) => replayTrace({ ...JSON.parse(await readFile(new URL("./traces/real-jacks-with-depth.json", import.meta.url))), framing, moves });

  for (const framing of ["full", "upper"]) {
    it(`arms swinging through jacks and burpees are never punches, in ${framing} framing`, async () => {
      const { events } = await replay(framing);
      assert.deepEqual(events.filter((event) => event.gesture.startsWith("punch")), []);
    });
  }

  it("still reads the burpees and arm swings in the same footage", async () => {
    const { events } = await replay("full");
    assert.ok(named(events, "burpee").length >= 6);
    assert.ok(named(events, "hands_up").length >= 4);
  });
});

describe("real person's image panned through MediaPipe", () => {
  it("reads steps, returns and jumps in order, and ignores a small sway", async () => {
    const { events } = await load("panned-steps-and-jumps");
    assert.deepEqual(events.map((event) => event.gesture), ["step_left", "step_right", "step_right", "step_left", "jump", "jump"]);
    assert.deepEqual(events.map((event) => Boolean(event.returning)), [false, true, false, true, false, false]);
  });
});
