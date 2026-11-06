# How Taksh uses Arkiv

Arkiv holds what in Taksh has to outlive one browser tab or one server instance: the scores people post, the games they share, the day's challenge, and the 0G rival's ledger. The app keeps no other database. Column-by-column schemas are in `schema.md`, and `why-arkiv.md` covers what we kept off Arkiv.

Live on Rabdi at 22:24 UTC on 2026-11-06, from `npm run arkiv:probe`: 4 scores, 6 published games, 1 daily challenge, 8 rival decisions and 1 spent round, all owned by the writer `0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30`. Each query took 267 to 693 ms.

## Every Arkiv feature we use, and what the player sees

| Arkiv feature | Where | What the player sees |
| --- | --- | --- |
| Indexed `eq` filters | `scoreQuery`, `gamesQuery` in `src/lib/arkiv/store.js` | Each chip on the board ("All Sky Hop", "diwali, bright", "This exact game", "Camera only", "Today's challenge") and in the gallery (a game, a world) is one more `eq` in the query. |
| `gt` on an indexed `i32`, and `count()` | `postScore` | "Posted. You are #2 of 2 on the 2026-11-06 challenge." The rank is the count of scores above yours, plus one. |
| `orderBy(desc(…))` | board and gallery | Best score first. Newest game first, on `publishedAt`. |
| `withCount()` | board, gallery | "4 scores match" under the board. "Shared games (6)" on the gallery. |
| `select` projection | `gamesQuery` | The gallery reads every column but the spec bytes: 1,903 bytes for 6 games. |
| `bytes` column | `spec` on games and daily | `/games/<key>` plays the exact spec that was published, 569 bytes for the newest. |
| `getEntity(key)` | `readGame` | A shared link opens one game by its entity key, from any node. |
| `ownedBy` | every read | Only our writer's rows show. Anyone can tag an entity `taksh.scores.v1`, and it won't reach the board. |
| `$expiresAt` and lifetimes | `daysLeft` in `src/lib/arkiv/schema.js` | Each score row says "Expires in 29 d", and the board says it holds the last 30 days. Each gallery card says "182 days left". |
| `blockNumber` on a query | board | "read at block 308755". |
| `toString()` on a query | board, daily board | "Query sent to Arkiv" shows the exact query text. |
| The transaction hash | `create` | "See the transaction" links to the Rabdi explorer after a post. |

## The filters, and whether they fit

An index costs gas on every write, so a column is indexed only if a control filters on it. We dropped the two indexes nothing used, `style` on games and `requestId` on rival decisions. The same 569-byte game cost 529,291 gas to publish with the `style` index and 513,942 without it.

| Schema | Indexed column | The control that filters on it |
| --- | --- | --- |
| `taksh.scores.v1` | `template` | The board on every result screen, "All <game>". |
| | `world`, `style` | The "<world>, <style>" chip: the same look as the round you just played. |
| | `specHash` | "This exact game". It's also how a published game gets its own board. |
| | `mode` | "Camera only", since keyboard scores are easier. |
| | `score` | The rank after a post, `score > yours`. A filter needs an index, and sorting alone wouldn't. |
| | `daily` | "Today's challenge" and `/daily/<date>`. |
| `taksh.games.v1` | `template` | The game row on `/games`. |
| | `world` | The world row on `/games`. Both rows combine into one query. |
| | `specHash` | Publish looks for the same spec first and returns that entity instead of paying for a copy. |
| `taksh.daily.v1` | `date` | Today's card and every `/daily/<date>`. |
| `taksh.rival.decisions.v1` | `roundId` | The upload check reads one round's decisions. |
| `taksh.rival.spent.v1` | `roundId` | The upload check refuses a round that's already stored. |

The board query for "This exact game", as the result screen prints it:

```text
arkiv.schema = str('taksh.scores.v1') AND template = str('poses') AND specHash = str('860d…9f60') AND $owner = addr(0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30) ORDER BY score:i32 DESC
```

The gallery filtered by game and world, which `/games?template=bout&world=downtown` runs:

```text
arkiv.schema = str('taksh.games.v1') AND template = str('bout') AND world = str('downtown') AND $owner = addr(0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30) ORDER BY publishedAt:u64 DESC
```

## Who can edit each entity

Every entity is created by the writer wallet and owned by it. The app calls only `createEntity`. It never updates, extends, deletes or transfers one (`grep -rn "updateEntity\|deleteEntity\|extendEntity\|changeOwnership" src` finds nothing). Players post without a wallet, so they own nothing on Arkiv and can't edit anything there.

That fits what each entity is:

- **A score** is a record of a round. Nobody should change it after it's posted, including us.
- **A published game** is fixed so its board means something. The board for "this exact game" is keyed by `specHash`, so an edited spec would be a different game. A changed game is published again as a new entity.
- **The day's challenge** is fixed once stored, so everyone on the day's board played the same spec.
- **The rival ledger** is write-once by design: the server checks a round against what it really served, and a `spent` entity marks it stored.

Where a player should be able to edit, we used something else. A game's ENS name is owned by the address its creator gives, and they can change its records in any ENS app (`why-arkiv.md`).

## When each entity expires

| Entity | Lifetime | Why that length | What the player sees |
| --- | --- | --- | --- |
| Score | 30 days | A rolling monthly board. Arkiv drops old scores itself, so there's no cleanup job. | "Expires in N d" on each row, and "this board is the last month of play". |
| Published game | About 182.5 days, the most Arkiv allows (`ExpirationTime.max()`) | A shared link should work for months. | "N days left" on each gallery card. An expired key opens "No live game has that key. It may have expired." |
| Daily challenge | 8 days | The app reads today and yesterday. `/daily/<date>` reads up to 8 days back, with a day of slack. | Older dates say "This challenge has expired from Arkiv, so this is the date's starter game." The scores outlive it, so an old board still reads. |
| Rival decision | 1 hour | A round has to be uploaded within 5 minutes of ending. After that its decisions have no use. | Nothing directly. A round stored on 0G Storage was checked against them. |
| Spent round | 2 hours | Longer than the decisions it guards. | A second upload of the same round is refused. |

One mismatch we know of: nothing extends a game. A game people still play on day 183 stops loading. `extendEntity` on each open would keep popular games alive, at the cost of a write per play. We haven't needed it yet: the oldest game was published at 08:10 UTC on 2026-11-06.

## Writes

All writes go through a route on the server, signed by one writer wallet whose key is in `ARKIV_PRIVATE_KEY`. Each one waits for its receipt, about 8 s.

- `POST /api/arkiv/scores` takes the spec that was played, the result, the input mode and a name. The server validates the spec with the same validator that gates every game, hashes it, and creates a `Scores` entity. Two `count()` calls then work out the rank. 230,660 gas.
- `POST /api/arkiv/games` validates the spec and looks for an entity with the same `specHash`. If none exists, it creates a `Games` entity with the spec as `bytes`. Publishing the same game twice returns the first entity, in 326 ms instead of 7.7 s. About 514,000 gas for a 569-byte spec.
- `GET /api/daily`, on the first request of a UTC day, reads `eq("date", today)`. If nothing is stored, it asks 0G for a game from the day's theme, reads again, and creates a `Daily` entity only if another instance hasn't stored one meanwhile. Each instance keeps the result in memory, so later requests cost no query.
- A score posted on a daily round carries `daily = <date>`. The server checks that the spec hashes to that date's challenge before it sets the column.

Each client gets one write every four seconds and the server 20 a minute, because each write costs the writer gas.

## The 0G rival's ledger

When you fight the 0G rival, the round can be stored on 0G Storage. The server only stores a round whose plans are ones 0G really returned to it, so it needs a record of every decision it served. On Vercel the upload can land on a different instance from the one that served the plans, and instances share no memory. So the record lives on Arkiv:

- `POST /api/rival/decide` writes one `taksh.rival.decisions.v1` entity per 0G decision. The write takes about 8 s, so it runs in `after()`, once the plan is already back in the browser.
- `POST /api/rival/episode` reads every decision for the round with `eq("roundId", …)` and checks the round against them. If a decision the browser sent isn't readable yet, it waits 9 s once and reads again.
- Once the round is on 0G Storage, a `taksh.rival.spent.v1` entity marks it stored, so a second upload of the same round is refused on any instance.

Memory on each instance is a cache in front of this. If Arkiv can't be read, the check uses this instance's memory, so a round served and uploaded here still stores. Two instances racing on one round can both store it, seconds apart, with the same score.

## Trust

Arkiv is public, so every read filters on `$owner`. A shared spec is validated again on read, because the bytes came from a public chain. Scores are what the browser reports. The server checks that the spec is a real, playable game, but it can't replay the round. This is a demo leaderboard, and the README says so.

## When Arkiv is not there

Every failure says which of these it is, from `arkivCause` in `src/lib/arkiv/store.js`. The game, revise and replay keep working in all of them.

- **No `ARKIV_PRIVATE_KEY`:** the board and gallery still read the default writer's data, and Post and Publish say "Arkiv writes are off".
- **The public endpoint's query budget is spent (no `ARKIV_ACCESS_KEY`):** it answers `429 ANON_COST_LIMITED` for about ten minutes. Pages say "Arkiv's public endpoint is rate limiting this server, which has no ARKIV_ACCESS_KEY", in 0.3 to 0.4 s. A post that lands during one still says "Posted", with the transaction, and that the rank can't be counted right now.
- **A wrong `ARKIV_ACCESS_KEY`:** "Arkiv refused this server's ARKIV_ACCESS_KEY".
- **The RPC is down or slow:** reads give up after 10 s and writes after 25 s, and the page says how long it waited.
- **An unfunded wallet:** the error names the wallet and the faucet.
- **No 0G, no writer key, or no Arkiv for today's challenge:** every instance serves the same starter game, picked from the date, and the home card says which is missing. A daily score is then refused with that reason, since the server can't check it against the day's game.

## Code

- `src/lib/arkiv/schema.js`: schemas, encoding, spec hash, days left. Pure, shared by the server and browser.
- `src/lib/arkiv/store.js`: clients, queries, writes, and `arkivCause`. Server only.
- `src/lib/arkiv/ledger.js`: the rival ledger schemas, writes and the round read. Server only.
- `src/lib/daily/daily.js` and `src/lib/daily/server.js`: the daily challenge.
- `src/app/api/arkiv/`: the routes. `src/components/ArkivBoard.jsx`: the board and publish panel. `src/app/games/`: the gallery and shared game pages.
- `scripts/arkiv-probe.mjs`: `npm run arkiv:probe`, the live numbers.
- `test/arkiv.test.mjs` and `test/daily.test.mjs`: encoding, schema fit, exact query text, days left and error messages, with no network.
