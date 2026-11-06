# Friction log

Written as the work happened, on 6 November 2026, with `@arkiv-network/sdk` 1.0.1 and viem 2 in a JavaScript (not TypeScript) Next.js 16 app.

## The faucet can't be scripted

This one stopped the work. The integration was built by an agent with no browser, so it made a fresh wallet with viem and tried to fund it over HTTP. `hub.arkiv.network/faucet` is a client-rendered page. Its script posts `{ recipient, captchaToken }` to `/api/faucet`, and that endpoint answers `401 {"error":"Unauthorized"}` without a signed-in session. So funding a dev wallet needs a person with a browser, a Hub login and a CAPTCHA. Everything up to the write ran without funds. The first real write had to wait for someone to fund the wallet by hand.

I understand why a faucet has a CAPTCHA. But hackathon teams set up wallets from scripts and CI, and a small grant per access key, claimable over HTTP, would remove a blocking step.

## An unfunded write says nothing useful

With 0 tGLM, `createEntity` throws `EntityMutationError: Transaction failed: Execution error without revert data`. The errors page says this error covers "has no tGLM", but the message itself doesn't. I first read it as a bad encoding. Now `src/lib/arkiv/store.js` checks the balance when a write fails, and if it's zero the UI says "The writer wallet 0x… has no tGLM. Fund it at the faucet." A balance check inside the SDK's error path would save every project the same detour.

## Access keys need the same login

Without an access key, `rabdi({ accessKey: "" })` logs a rate-limit warning on every server start. Getting a key goes through the same Hub login as the faucet. The public endpoint worked fine for reads during development, so this cost nothing in practice. It's another step that a script can't take, though.

## `ne` and `not` are documented but not exported

`llms.txt` lists `ne` and `not` among the filter functions. In 1.0.1, `@arkiv-network/sdk/query` exports `and, or, eq, gt, gte, lt, lte, between, startsWith, exists, hasType, asc, desc` and no `ne` or `not`. I didn't need them, but I checked before writing a query that excludes keyboard scores, and wrote it as `eq("mode", "camera")` instead.

## No sort by creation time

`$createdAt` can't be sorted on, and the sort page says so. A gallery wants newest first, so the games schema has its own `publishedAt` column (`u64`, Unix seconds) to sort on. That's one more attribute per entity, and it's a clock the server sets, not the chain.

Sort takes one key, so tied scores come back in the node's order. A tiebreak on time would need sorting in JavaScript after the fetch.

## Typed values in plain JavaScript

The docs promise compile-time errors for a wrong value type or a filter on an unindexed column. In a JS project those checks don't exist, so mistakes only show up as runtime errors. Two caught me or nearly did:

- A bare `bigint` is a `u256`. `publishedAt: BigInt(seconds)` fails a `u64` column with `SchemaMismatchError`. It has to be `u64(BigInt(seconds))`. `test/arkiv.test.mjs` now checks this.
- `str` is 128 bytes, not characters. A Devanagari title would be cut short, so titles go through a byte-aware `fitStr`.

The SDK's runtime checks run before anything is sent, and they were good. A wallet client on a transport that throws lets a test confirm that the values fit the schema with no network at all. I'd like that to be a documented pattern, or a `checkValues(schema, values)` export.

## Rows need flattening for JSON

Each column comes back as `{ type, value }`, and `u64`, `count` and `blockNumber` come back as `bigint`, which `Response.json` can't serialise. Every API route needs a small mapper. `plainRow` in `schema.js` does it.

## Default retries make failures slow

The viem `http()` transport retries three times with backoff. Against a dead endpoint, one board read would hang for many seconds before the UI could say "unavailable". The client now uses `http(undefined, { timeout: 8000, retryCount: 1 })`. Worth a line in the "Connect to Arkiv" page for server use.

## What was easy

Named schemas with `.indexed()`, the builder's `toString()`, and `withCount()` made the leaderboard short. The query text comes back with every board response and shows under "Query sent to Arkiv" on the result screen. `ownedBy` made the trust rule one line.
