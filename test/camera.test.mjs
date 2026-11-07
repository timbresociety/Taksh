import assert from "node:assert/strict";
import { test } from "node:test";
import { openCamera, savedCamera, videoConstraints } from "../src/lib/motion/camera.js";

const memory = (value) => {
  const items = new Map(value ? [["taksh.camera", value]] : []);
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, v), removeItem: (k) => items.delete(k) };
};

// Fake mediaDevices: records each request, and fails any exact deviceId it doesn't know.
const media = (known = []) => {
  const asked = [];
  return {
    asked,
    async getUserMedia({ video }) {
      asked.push(video);
      const id = video.deviceId?.exact;
      if (id && !known.includes(id)) throw Object.assign(new Error("gone"), { name: "OverconstrainedError" });
      return { id: id ?? "default" };
    },
  };
};

test("with no saved camera it asks for the front camera at 1280x720, 30 fps, as before", async () => {
  const devices = media();
  assert.equal((await openCamera(devices, memory())).id, "default");
  assert.deepEqual(devices.asked, [videoConstraints(null)]);
  assert.equal(devices.asked[0].facingMode, "user");
  assert.equal(devices.asked[0].width.ideal, 1280);
});

test("a saved camera opens by exact id", async () => {
  const devices = media(["iphone"]);
  assert.equal((await openCamera(devices, memory("iphone"))).id, "iphone");
  assert.deepEqual(devices.asked[0].deviceId, { exact: "iphone" });
});

test("a saved camera that is gone falls back to the default and is forgotten", async () => {
  const storage = memory("iphone");
  const devices = media();
  assert.equal((await openCamera(devices, storage)).id, "default");
  assert.equal(devices.asked.length, 2);
  assert.equal(savedCamera(storage), null);
});

test("a blocked camera is not retried on the default", async () => {
  const devices = {
    async getUserMedia() {
      throw Object.assign(new Error("no"), { name: "NotAllowedError" });
    },
  };
  await assert.rejects(openCamera(devices, memory("iphone")), { name: "NotAllowedError" });
});
