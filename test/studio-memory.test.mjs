// The studio survives a refresh: the step is in the address and the state is kept for the tab.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadStudio, memoryKey, resumeStep, saveStudio, searchForStep, stepFromSearch } from "../src/lib/game/studio-memory.js";

const memory = () => {
  const items = new Map();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)), items };
};
const game = { spec: { template: "pads" }, source: "0g" };

describe("the studio's address", () => {
  it("names each step but the first, and keeps the rest of the query", () => {
    assert.equal(searchForStep("", "brief"), "?step=brief");
    assert.equal(searchForStep("?step=brief", "idea"), "");
    assert.equal(searchForStep("?e2e=1&step=brief", "result"), "?e2e=1&step=result");
    assert.equal(stepFromSearch("?step=result"), "result");
    assert.equal(stepFromSearch("?step=nowhere"), null);
  });

  it("each page remembers its own studio", () => {
    assert.notEqual(memoryKey("/"), memoryKey("/play/moon-hop.taksh.eth"));
  });
});

describe("coming back after a refresh", () => {
  it("returns to the step the address shows when there is something to show", () => {
    assert.equal(resumeStep({ game }, "brief"), "brief");
    assert.equal(resumeStep({ game, result: { score: 40 } }, "result"), "result");
    assert.equal(resumeStep({ game }, null, "brief"), "brief", "a page opened on a game starts on its brief");
    assert.equal(resumeStep({ game }, null), "idea", "back to the home page's own address is the idea, with the game kept");
  });

  it("a step that needs the camera or a live round comes back as the brief", () => {
    for (const step of ["calibrate", "practice", "play"]) assert.equal(resumeStep({ game }, step), "brief");
  });

  it("without a game there is only the idea, and without a round no result", () => {
    assert.equal(resumeStep({}, "brief"), "idea");
    assert.equal(resumeStep({ game }, "result"), "brief");
    assert.equal(resumeStep({ game }, "idea"), "idea");
  });

  it("what was saved comes back as it was", () => {
    const storage = memory();
    const state = { draft: { idea: "box on a rooftop", clarification: "" }, game, runs: [{ score: 12 }], practised: { pads: {} } };
    assert.equal(saveStudio(storage, memoryKey("/"), state), true);
    assert.deepEqual(loadStudio(storage, memoryKey("/")), state);
    assert.equal(loadStudio(storage, memoryKey("/daily")), null);
  });

  it("a full or blocked storage lets the result go first, then gives up without breaking anything", () => {
    const storage = memory();
    storage.setItem = (key, value) => {
      if (value.includes("bigResult")) throw new Error("QuotaExceededError");
      storage.items.set(key, value);
    };
    saveStudio(storage, "k", { game, result: { bigResult: true } });
    assert.deepEqual(loadStudio(storage, "k"), { game, result: null });
    const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } };
    assert.equal(saveStudio(blocked, "k", { game }), false);
    assert.equal(loadStudio(blocked, "k"), null);
    assert.equal(loadStudio(null, "k"), null);
  });

  it("an entry from another version, or broken JSON, is ignored", () => {
    const storage = memory();
    storage.setItem("k", JSON.stringify({ version: 0, state: { game } }));
    assert.equal(loadStudio(storage, "k"), null);
    storage.setItem("k", "{not json");
    assert.equal(loadStudio(storage, "k"), null);
  });
});
