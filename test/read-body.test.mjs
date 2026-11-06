import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readBytes, readText } from "../src/lib/read-body.js";

// A chunked upload: no Content-Length, the body arrives a piece at a time.
function chunked(pieces, onPull = () => {}) {
  const body = new ReadableStream({
    pull(controller) {
      onPull();
      const piece = pieces.shift();
      if (piece) controller.enqueue(piece);
      else controller.close();
    },
  });
  return new Request("http://x/", { method: "POST", body, duplex: "half" });
}

describe("readBytes", () => {
  it("stops reading a chunked body as soon as it passes the cap", async () => {
    let pulls = 0;
    const pieces = Array.from({ length: 100 }, () => new Uint8Array(1000));
    await assert.rejects(readBytes(chunked(pieces, () => (pulls += 1)), 2500), (error) => error.status === 413);
    assert.ok(pulls <= 4, `read ${pulls} chunks of 100`);
  });

  it("refuses a declared length over the cap without reading", async () => {
    const request = new Request("http://x/", { method: "POST", body: "x".repeat(10), headers: { "content-length": "999999" } });
    await assert.rejects(readBytes(request, 100), (error) => error.status === 413);
  });

  it("returns the whole body under the cap", async () => {
    const text = await readText(chunked([new TextEncoder().encode('{"a":'), new TextEncoder().encode("1}")]), 100);
    assert.equal(text, '{"a":1}');
    assert.equal((await readBytes(new Request("http://x/", { method: "POST" }), 10)).length, 0);
  });
});
