# Friction log

Written as the work happened, on 6 and 7 November 2026 (UTC), with `@arkiv-network/sdk` 1.0.1 and viem 2 in a JavaScript (not TypeScript) Next.js 16 app. Each entry says what got in the way, what we did about it, and how to see it yourself.

`npm run arkiv:probe` (`scripts/arkiv-probe.mjs`) is read-only and prints the live counts, query times and rate-limit headers quoted below.

## Every break, in one table

| What broke | What we expected | What happened | How to reproduce |
| --- | --- | --- | --- |
| Reads without an access key | Reads keep working at hackathon load, or a documented limit | `429 ANON_COST_LIMITED` after about 1,000 queries per client address, for about 10 minutes. In a judge-style walkthrough on 2026-11-06 it ran out 5 minutes after a reset and failed 2 of 22 steps | The `curl` loop under "The public endpoint runs out of query budget" |
| The access key in errors | The key kept out of logs | `error.message` from viem prints the RPC URL, with the key in its path | The 4-line script under "The access key is in the URL" |
| Funding a dev wallet from a script | A faucet an agent or CI job can call | `401 {"error":"Unauthorized"}` without a signed-in Hub session | `curl -X POST https://hub.arkiv.network/api/faucet -H 'content-type: application/json' -d '{"recipient":"0x0000000000000000000000000000000000000001","captchaToken":"x"}'` |
| A write from an unfunded wallet | An error that says the wallet has no tGLM | `Execution error without revert data` | `createEntity` from `privateKeyToAccount(generatePrivateKey())` on Rabdi |
| Two writes at once from one wallet | Both land, or an error that names the nonce | One fails with `Execution error without revert data`, the same words an unfunded wallet gets. Seen live on 2 of 8 rival decisions on 2026-11-07. Fixed with viem's `nonceManager` on the account (`src/lib/arkiv/store.js`) | Three `createEntity` calls from one `privateKeyToAccount(key)` in a `Promise.all`: not all land. With `privateKeyToAccount(key, { nonceManager })`, 3 of 3 do |
| A read during a 429, with viem's default retries | The request fails fast | Every route hung over 2 minutes, because viem sleeps the full `Retry-After: 761` before retrying | Any query through `http()` (default `retryCount: 3`) while the budget is spent |
| `ne` and `not` filters | Exported, as `llms.txt` lists them | Not in `@arkiv-network/sdk/query` 1.0.1 | `node -e "import('@arkiv-network/sdk/query').then(m => console.log('ne' in m, 'not' in m))"` prints `false false` |
| A `bigint` for a `u64` column | Accepted, since `1n` fits a `u64` | `SchemaMismatchError` at runtime: a bare `bigint` is a `u256` | `test/arkiv.test.mjs`, "stores a game spec as bytes and reads it back", which writes `publishedAt: 1n` |

## The public endpoint runs out of query budget, and the app has to say so

This was the friction that cost the most. Without an access key, the public endpoint gives a budget of query cost. When it's spent, every `arkiv_query` answers:

```text
HTTP/2 429
ratelimit: limit=10000, remaining=0, reset=565
retry-after: 565
{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota"}
```

That one was at 22:20 UTC on 2026-11-06. Each query costs 10 (the `Arkiv-Cost` header), so the budget is about 1,000 queries, and the wait was 565 s here and 761 s in an earlier window that day. It's separate from a request rate limit (`ratelimit: limit=2000, remaining=…, reset=10`) that we never hit. `eth_*` calls aren't in the budget: block numbers, balances and receipts kept working through every 429.

The budget seems to be per client address, not per app. Several agents and dev servers on one machine shared it, and it ran out within the first hour of testing, counting about 310 queries of our own probing. A deploy on shared hosting would share it with strangers, and so would judges on one conference network running the README query.

To reproduce, run the README's query in a loop until it flips. This spends the budget for your network for about ten minutes:

```bash
for i in $(seq 1100); do curl -s -o /dev/null -w "%{http_code}\n" https://rpc.rabdi.db-chain.testnet.arkiv.network \
  -H "content-type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"arkiv_query\",\"params\":[\"arkiv.schema = str('taksh.games.v1')\",{\"select\":{\"key\":true},\"limit\":\"0x1\"}]}"; done | uniq -c
```

What we changed:

- **Name the cause on every page.** All Arkiv errors go through `arkivCause` in `src/lib/arkiv/store.js`. The board, the gallery, a shared game, the daily board and today's card all say "Arkiv's public endpoint is rate limiting this server, which has no ARKIV_ACCESS_KEY", instead of "Arkiv did not respond". Before, only the API routes did.
- **Don't fail a post that already landed.** Because a 429 stops queries but not transactions, a score post during one wrote its entity (tx [`0x0813e2be…`](https://rabdi.explorer.arkiv.network/tx/0x0813e2bea9d05f28ed7e3038e8eeea2a16ad15ee7adf7f81b33479699b862c1e)) and then failed the two `count()` calls that work out the rank. The player saw an error for a score that was on chain, and a retry would post it twice. The 2026-11-06 daily board shows it: two `fm-probe` rows at 1234, from one post that answered with the rank and one at 22:24:58 UTC that answered `429` after 8.7 s. Now the post returns its key and transaction, and the board says "Posted" and that the rank can't be counted right now.
- **Read `ARKIV_ACCESS_KEY`.** `connect()` passes it, trimmed, to `rabdi({ accessKey })`. With a key set, a 429 says the key is being rate limited, not the public endpoint.

With the captain's access key the same walkthrough passed 22 of 22. The keyed endpoint sends `ratelimit: limit=5000, remaining=…, reset=6`, and there was no query budget to run out.

The Rabdi indexer answered `arkiv_query` with no `RateLimit` header while we were testing, at `https://indexer.rabdi.db-chain.testnet.arkiv.network/api/entity-explorer/rpc`, the endpoint the explorer itself uses. It returned the same 8 scores as the RPC at the same block. It doesn't serve `arkiv_getEntity` or `eth_*` ("Method not found"), so it can stand in for queries, not for writes. If it's meant for public reads, a line in the docs would give every app a fallback for its boards. If it isn't, it's a way around the budget that nobody intended.

I'd like the 429 to include the cost of the query that tripped it and the window length, and the SDK to throw a named `RateLimitedError` with `retryAfter`. Right now the cause is three levels down a viem `HttpRequestError`, and the SDK warns once at startup and never again.

## The access key is in the URL, and viem prints the URL

`rabdi({ accessKey })` puts the key in the RPC path: `https://rpc.rabdi.db-chain.testnet.arkiv.network/<key>`. viem's `getUrl` hides a username and password in a URL, but not a path, so every `HttpRequestError` message carries the key:

```js
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http } from "viem";
const client = createPublicClient({ chain: rabdi({ accessKey: "fake-key-123" }), transport: http(undefined, { retryCount: 0 }) });
await client.getBlockNumber().catch((e) => console.log(e.message.includes("fake-key-123"))); // true
```

A server that logs `error.message`, or sends it to the browser, leaks the key. Our routes log only `shortMessage` ("HTTP request failed.") and build their own text from the status, and `test/arkiv.test.mjs` checks that no message contains the URL. A header (`Authorization: Bearer`) would keep the key out of logs. Failing that, the SDK could redact the path in its errors.

A wrong key answers `401 {"error":"INVALID_KEY","message":"unknown API key"}` in about 1.6 s. The app says "Arkiv refused this server's ARKIV_ACCESS_KEY". Repro: `ARKIV_ACCESS_KEY=nope npm run arkiv:probe`.

## The faucet can't be scripted

This one stopped the work. The integration was built by an agent with no browser, so it made a fresh wallet with viem and tried to fund it over HTTP. `hub.arkiv.network/faucet` is a client-rendered page. Its script posts `{ recipient, captchaToken }` to `/api/faucet`, and that endpoint answers `401 {"error":"Unauthorized"}` without a signed-in session. So funding a dev wallet needs a person with a browser, a Hub login and a CAPTCHA. Everything up to the first write ran without funds, and then waited for someone to fund the wallet by hand.

Access keys go through the same Hub login. So the two things a hackathon agent needs to move past the public endpoint, funds and a key, both need a person. I understand why a faucet has a CAPTCHA, but a small grant per access key, claimable over HTTP, would remove a blocking step.

How far the funds go: a score post used 230,660 gas and a publish with a 569-byte spec 513,942 gas, at 1 gwei. That's 0.00023 and 0.00051 tGLM, so the writer's 9.99 tGLM covers about 43,000 score posts.

## An unfunded write says nothing useful

With 0 tGLM, `createEntity` throws `EntityMutationError: Transaction failed: Execution error without revert data`. The errors page says this error covers "has no tGLM", but the message doesn't. I first read it as a bad encoding. Now `create` in `src/lib/arkiv/store.js` checks the balance when a write fails, and if it's zero the UI says "The writer wallet 0x… has no tGLM. Fund it at https://hub.arkiv.network/faucet." A balance check inside the SDK's error path would save every project the same detour.

## Default retries made failures hang

The viem `http()` transport retries three times with backoff. Against a dead endpoint, one board read hung for many seconds before the UI could say "unavailable". `retryCount: 1` wasn't enough either. Once the budget runs out, the endpoint sends `Retry-After: 761`, and viem waits the full Retry-After before its retry. The 8 s timeout covers each attempt, not that wait, so every route on the server hung for over two minutes.

The transport now uses `http(undefined, { timeout: 8000, retryCount: 0 })`, and every read and write also races a hard deadline: 10 s for reads, and 25 s for writes, which wait for a receipt. A 429 now comes back to the player in under a second. Worth a line in the "Connect to Arkiv" page for server use.

## `ne` and `not` are documented but not exported

`llms.txt` lists `ne` and `not` among the filter functions. In 1.0.1, `@arkiv-network/sdk/query` exports `and, or, eq, gt, gte, lt, lte, between, startsWith, exists, hasType, asc, desc`, and no `ne` or `not`. I didn't need them, but I checked before writing a query that excludes keyboard scores, and wrote it as `eq("mode", "camera")` instead. Check: `node -e "import('@arkiv-network/sdk/query').then(m => console.log('ne' in m, 'not' in m))"` prints `false false`.

## No sort by creation time, and one sort key

`$createdAt` can't be sorted on, and the sort page says so. A gallery wants newest first, so the games schema has its own `publishedAt` column (`u64`, Unix seconds) to sort on. That's one more attribute per entity, and it's a clock the server sets, not the chain.

Sort takes one key, so tied scores come back in the node's order. A tiebreak on time would need sorting in JavaScript after the fetch. The daily challenge has the same problem the other way round: to pick the earliest of two racing entities, the read fetches up to ten and picks in code (`pickEarliest`).

## No compare-and-set

Two server instances that race on the day's first request can both store a challenge, and two publishes of one spec can both pass the `specHash` lookup before either write lands. There's no create-if-absent, so we read, write and read again, and every reader takes the earliest. It works, but a conditional create (fail if an entity with this indexed value exists from this owner) would make the daily challenge one write.

## Typed values in plain JavaScript

The docs promise compile-time errors for a wrong value type or a filter on an unindexed column. In a JS project those checks don't exist, so mistakes only show up at runtime. Two caught me or nearly did:

- A bare `bigint` is a `u256`. `publishedAt: BigInt(seconds)` fails a `u64` column with `SchemaMismatchError`. It has to be `u64(BigInt(seconds))`. `test/arkiv.test.mjs` checks this.
- `str` is 128 bytes, not characters. A Devanagari title would be cut short, so titles go through a byte-aware `fitStr`.

The SDK's runtime checks run before anything is sent, and they were good. A wallet client on a transport that throws lets a test confirm that values fit the schema with no network at all. I'd like that to be a documented pattern, or a `checkValues(schema, values)` export.

## Rows need flattening, and expiry is in blocks

Each column comes back as `{ type, value }`, and `u64`, `count` and `blockNumber` come back as `bigint`, which `Response.json` can't serialise. Every API route needs a small mapper (`plainRow` in `schema.js`).

`$expiresAt` is a block number. To show "30 d" next to a score posted today, the server takes the query's own `blockNumber`, subtracts, and multiplies by the 2 s block time (`daysLeft` in `schema.js`). That's cheap, but a `$expiresAtTime` projection, or `blockTime` on the query result, would save every app the same arithmetic and the hard-coded 2.

## What was easy

Named schemas with `.indexed()`, the builder's `toString()`, and `withCount()` made the leaderboard short. The query text comes back with every board response and shows under "Query sent to Arkiv" on the result screen. `ownedBy` made the trust rule one line. Optional columns (`daily` on scores, `swarmRef` on games) let the schemas grow without a `.v2`, and every entity written before still reads.
