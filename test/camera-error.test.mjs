import assert from "node:assert/strict";
import { test } from "node:test";
import { cameraProblem } from "../src/lib/motion/camera-error.js";

const named = (name) => ({ name });

test("an insecure address points to localhost on the running port", () => {
  assert.match(cameraProblem(named("InsecureContextError"), "3100"), /http:\/\/localhost:3100/);
});

test("each known failure gets its own instruction", () => {
  const names = ["InsecureContextError", "NotAllowedError", "NotFoundError", "NotReadableError", "PoseTrackerError"];
  const messages = names.map((name) => cameraProblem(named(name)));
  assert.equal(new Set(messages).size, names.length);
});

test("a blocked camera mentions the system setting as well as the site", () => {
  assert.match(cameraProblem(named("NotAllowedError")), /System Settings/);
});

test("an unknown failure keeps its name so it can be reported", () => {
  assert.match(cameraProblem(named("AbortError")), /AbortError/);
});
