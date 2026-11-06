// Swarm from the command line, through the Bee node in BEE_URL (reads .env.local):
//   npm run swarm -- status            the node's wallet, balances and postage batches
//   npm run swarm -- stamp [days]      buy the smallest batch (depth 17) that lasts that many days, 30 by default
//   npm run swarm -- upload <file.webp> upload one game collection (that cover, a sample spec, a page)
//   npm run swarm -- read <reference>  read cover.webp and spec.json back through the public gateway
import { readFileSync } from "node:fs";
import { GATEWAY, gameFiles, swarmUrl, uploadCollection } from "../src/lib/swarm/bee.js";

const bee = (process.env.BEE_URL || "http://localhost:1633").replace(/\/$/, "");
const [command, arg] = process.argv.slice(2);
const get = async (path) => {
  const response = await fetch(`${bee}${path}`);
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
};
const bzz = (plur) => `${(Number(plur) / 1e16).toFixed(4)} xBZZ`;

if (command === "status") {
  // An unfunded node answers /addresses but not /wallet or /stamps.
  const [{ ethereum }, wallet, stamps] = await Promise.all([get("/addresses"), get("/wallet").catch(() => null), get("/stamps").catch(() => ({ stamps: [] }))]);
  console.log(`node wallet ${ethereum}`);
  console.log(wallet ? `xDAI ${(Number(wallet.nativeTokenBalance) / 1e18).toFixed(4)}, ${bzz(wallet.bzzBalance)}` : "not funded yet: send it xDAI and xBZZ on Gnosis");
  for (const s of stamps.stamps) console.log(`batch ${s.batchID} depth ${s.depth} usable ${s.usable} ttl ${Math.round(s.batchTTL / 86400)} days`);
} else if (command === "stamp") {
  const days = Number(arg || 30);
  const { currentPrice } = await get("/chainstate");
  // Gnosis makes a block every 5 s. The amount is what one chunk pays for its whole life.
  const amount = BigInt(currentPrice) * BigInt(Math.ceil((days * 86400) / 5));
  const depth = 17;
  console.log(`buying depth ${depth} for ${days} days, about ${bzz(amount * 2n ** BigInt(depth))}. This waits for the chain, a minute or two.`);
  const response = await fetch(`${bee}/stamps/${amount}/${depth}`, { method: "POST", signal: AbortSignal.timeout(600000) });
  if (!response.ok) throw new Error(`stamp: ${response.status} ${await response.text()}`);
  const { batchID, txHash } = await response.json();
  console.log(`batch ${batchID}\ntx ${txHash}\nPut SWARM_BATCH_ID=${batchID} in .env.local.`);
} else if (command === "upload") {
  if (!process.env.SWARM_BATCH_ID) throw new Error("SWARM_BATCH_ID is not set. Run npm run swarm -- stamp first.");
  const cover = new Uint8Array(readFileSync(arg || "public/previews/game-bout.webp"));
  const spec = { title: "Swarm check", objective: "A sample collection uploaded by scripts/swarm.mjs." };
  const reference = await uploadCollection(gameFiles({ spec, cover, author: "scripts/swarm.mjs" }), "index.html", { ...process.env, BEE_URL: bee });
  console.log(`reference ${reference}\nopen ${swarmUrl(reference)}`);
} else if (command === "read") {
  for (const path of ["cover.webp", "spec.json"]) {
    const response = await fetch(swarmUrl(arg, path), { signal: AbortSignal.timeout(60000) });
    const bytes = new Uint8Array(await response.arrayBuffer());
    console.log(`${GATEWAY}/bzz/${arg}/${path}: ${response.status}, ${bytes.length} bytes${path.endsWith(".json") && response.ok ? `, ${new TextDecoder().decode(bytes).slice(0, 80)}` : ""}`);
  }
} else {
  console.log("Usage: npm run swarm -- status | stamp [days] | upload <file.webp> | read <reference>");
}
