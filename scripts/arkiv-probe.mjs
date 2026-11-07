// npm run arkiv:probe. Reads Taksh's entities on Rabdi and prints what the docs in arkiv/ quote:
// live counts per schema, how long each query took, spec sizes, days left, and the rate-limit
// headers the RPC sent. Read-only. Uses ARKIV_ACCESS_KEY if it is set, and never prints it.
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { desc, eq } from "@arkiv-network/sdk/query";
import { http } from "viem";
import { DEFAULT_WRITER, Daily, Games, Scores, daysLeft } from "../src/lib/arkiv/schema.js";
import { Decisions, Spent } from "../src/lib/arkiv/ledger.js";
import { dayKey } from "../src/lib/daily/daily.js";

const owner = process.env.ARKIV_WRITER_ADDRESS || DEFAULT_WRITER;
const keyed = Boolean(process.env.ARKIV_ACCESS_KEY?.trim());
let last = null;
const reader = createPublicClient({
  chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY?.trim() ?? "" }),
  transport: http(undefined, {
    timeout: 15_000,
    retryCount: 0,
    onFetchResponse: (response) => {
      last = { status: response.status, rateLimit: response.headers.get("ratelimit"), retryAfter: response.headers.get("retry-after"), cost: response.headers.get("arkiv-cost") };
    },
  }),
});

async function timed(label, run) {
  const started = performance.now();
  try {
    const value = await run();
    console.log(`${label.padEnd(34)} ${String(Math.round(performance.now() - started)).padStart(5)} ms  ${value}`);
  } catch (error) {
    // Only the status and the node's own words: viem's message holds the URL, and the key is in it.
    console.log(`${label.padEnd(34)} failed: HTTP ${last?.status ?? "?"}${last?.retryAfter ? `, Retry-After ${last.retryAfter} s` : ""} (${error.details ?? error.cause?.details ?? error.shortMessage})`);
  }
}

console.log(`Rabdi, writer ${owner}, ${keyed ? "with an access key" : "public endpoint, no access key"}\n`);
for (const [name, schema] of [["taksh.scores.v1", Scores], ["taksh.games.v1", Games], ["taksh.daily.v1", Daily], ["taksh.rival.decisions.v1", Decisions], ["taksh.rival.spent.v1", Spent]]) {
  await timed(`count ${name}`, async () => `${await reader.count().from(schema).ownedBy(owner).fetch()} live`);
}
await timed("board: top 10, hop", async () => {
  const page = await reader.select({ score: true, $expiresAt: true }).from(Scores).ownedBy(owner).where(eq("template", "hop")).orderBy(desc("score")).limit(10).withCount().fetch();
  return `${page.entities.length} rows of ${page.count}, days left ${page.entities.map((e) => daysLeft(e.$expiresAt, page.blockNumber)).join(", ") || "-"}`;
});
await timed(`daily board: ${dayKey()}`, async () => {
  const page = await reader.select({ score: true }).from(Scores).ownedBy(owner).where(eq("daily", dayKey())).orderBy(desc("score")).limit(10).withCount().fetch();
  return `${page.count} scores`;
});
await timed("gallery: newest 30", async () => {
  const page = await reader.select({ $key: true, world: true, $expiresAt: true }).from(Games).ownedBy(owner).orderBy(desc("publishedAt")).limit(30).withCount().fetch();
  const worlds = Object.entries(Object.groupBy(page.entities, (e) => e.world.value)).map(([world, games]) => `${world} ${games.length}`);
  return `${page.count} games (${worlds.join(", ")}), days left ${Math.min(...page.entities.map((e) => daysLeft(e.$expiresAt, page.blockNumber)))} to ${Math.max(...page.entities.map((e) => daysLeft(e.$expiresAt, page.blockNumber)))}`;
});
await timed("one game by key, with its spec", async () => {
  const { entities } = await reader.select({ $key: true }).from(Games).ownedBy(owner).orderBy(desc("publishedAt")).limit(1).fetch();
  if (!entities[0]) return "no games";
  const game = await reader.getEntity(entities[0].$key, Games);
  return `spec ${(game.spec.value.length - 2) / 2} bytes`;
});
await timed("daily challenges stored", async () => {
  const { entities } = await reader.select({ date: true, spec: true }).from(Daily).ownedBy(owner).limit(20).fetch();
  return entities.map((e) => `${e.date.value} (spec ${(e.spec.value.length - 2) / 2} bytes)`).join(", ") || "none";
});
console.log(`\nLast response: HTTP ${last?.status}, RateLimit "${last?.rateLimit}", Arkiv-Cost ${last?.cost} per query.`);
