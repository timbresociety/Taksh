import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { cleanCover, gameFiles, readCover, tar } from "../src/lib/swarm/bee.js";

const webp = readFileSync(new URL("../public/previews/game-bout.webp", import.meta.url));

describe("swarm", () => {
  it("builds a tar the system tar unpacks byte for byte", () => {
    const dir = mkdtempSync(join(tmpdir(), "taksh-tar-"));
    const files = gameFiles({ spec: { title: "Moon <Hop>", objective: "Jump" }, cover: new Uint8Array(webp), author: "Ravi", playUrl: "https://taksh.example/games" });
    writeFileSync(join(dir, "game.tar"), tar(files));
    execFileSync("tar", ["-xf", "game.tar"], { cwd: dir });
    assert.deepEqual(readFileSync(join(dir, "cover.webp")), webp);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "spec.json"), "utf8")).title, "Moon <Hop>");
    assert.match(readFileSync(join(dir, "index.html"), "utf8"), /<title>Moon &#60;Hop&#62;<\/title>/);
  });

  it("draws the cover again, so bytes after a valid image don't reach Swarm", async () => {
    const tail = Buffer.from("<script>alert(1)</script>");
    const cleaned = await cleanCover(`data:image/webp;base64,${Buffer.concat([webp, tail]).toString("base64")}`);
    assert.ok(cleaned && !Buffer.from(cleaned).includes(tail));
    assert.equal(await cleanCover(`data:image/webp;base64,${Buffer.from("RIFF\0\0\0\0WEBPjunkjunk").toString("base64")}`), null);
  });

  it("takes only a webp cover under 200 KB", () => {
    assert.equal(readCover(`data:image/webp;base64,${webp.toString("base64")}`)?.length, webp.length);
    assert.equal(readCover("data:image/png;base64,iVBORw0KGgo="), null);
    assert.equal(readCover("data:image/webp;base64,!!not base64!!"), null);
    assert.equal(readCover(`data:image/webp;base64,${Buffer.from("RIFF0000WAVE").toString("base64")}`), null);
    assert.equal(readCover(`data:image/webp;base64,${Buffer.alloc(300 * 1024).toString("base64")}`), null);
  });
});
