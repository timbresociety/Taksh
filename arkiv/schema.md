# Schemas

Taksh writes five kinds of entity. Scores, games and daily challenges are defined in `src/lib/arkiv/schema.js`, the rival ledger in `src/lib/arkiv/ledger.js`. All are named schemas, so every entity carries an indexed `arkiv.schema` tag. The name ends in `.v1`. If the shape changes, a `.v2` schema starts a new board and old entities stay readable under `.v1` until they expire. A new optional column is not a shape change: entities written before it still match the schema, so it stays `.v1`. That is how `swarmRef` was added to games and `daily` to scores.

Every read also filters on `$owner`, the server's writer wallet. Arkiv is public and anyone can write an entity tagged `taksh.scores.v1`, so the tag alone can't be trusted.

An index costs extra on every write, so a column is indexed only if some query filters on it. Sorting doesn't need an index.

## `taksh.scores.v1`: one finished round

| Column | Type | Indexed | Why |
| --- | --- | --- | --- |
| `template` | `str` | yes | Every board is per game template, such as `hop` or `poses`. |
| `world` | `str` | yes | The "same world and style" board filters on it. |
| `style` | `str` | yes | Same as `world`. |
| `specHash` | `str` | yes | SHA-256 of the spec as sorted JSON, 64 hex characters. The "this exact game" board filters on it, and it ties a score to a published game without a second lookup. |
| `mode` | `str` | yes | `camera` or `keyboard`. The "camera only" board filters on it, since keyboard scores are easier. |
| `score` | `i32` | yes | The board sorts on it. It's indexed because the rank after a post counts scores greater than yours (`score > i32(n)`), and a filter needs an index. |
| `player` | `str` | no | Display name, cut to 24 characters. Shown, never filtered. |
| `outcome` | `str` | no | `win`, `lose` or `complete`. Shown only. |
| `actions` | `i32` | no | Moves the player made. Shown only. |
| `durationMs` | `i32` | no | Length of the round in game time. Shown only. |
| `daily` | `str`, optional | yes | The UTC date (`YYYY-MM-DD`) of a daily-challenge round, unset on every other round. Today's board is `eq("daily", date)`, and so is the rank after a daily post. Optional, so scores from before the daily challenge still read under `.v1`, and other rounds don't pay for an empty indexed value. |

Lifetime: 30 days (`ExpirationTime.fromDays(30)`). The board is a rolling monthly board, and Arkiv drops old scores by itself, so no cleanup job is needed.

The board query, as `toString()` prints it:

```text
arkiv.schema = str('taksh.scores.v1') AND template = str('poses') AND specHash = str('860d…9f60') AND $owner = addr(0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30) ORDER BY score:i32 DESC
```

It runs with `.limit(10).withCount()`, so one request returns the top ten and the total that match.

The daily board drops the template, since a day has one game:

```text
arkiv.schema = str('taksh.scores.v1') AND daily = str('2026-11-07') AND $owner = addr(0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30) ORDER BY score:i32 DESC
```

The server sets `daily` only on a score whose spec hashes to that day's challenge, and only for today or yesterday, so a round started just before midnight still counts.

## `taksh.games.v1`: one published game

| Column | Type | Indexed | Why |
| --- | --- | --- | --- |
| `template` | `str` | yes | The gallery filters by template. |
| `world` | `str` | yes | Kept indexed so a gallery can filter by world. No page uses it yet. |
| `style` | `str` | yes | Same as `world`. |
| `specHash` | `str` | yes | Publishing the same spec twice finds the first entity with `eq("specHash", …)` and returns it instead of paying for a copy. |
| `title` | `str` | no | The game's title, cut to 128 bytes on a character boundary. |
| `author` | `str` | no | Display name of whoever published it. |
| `source` | `str` | no | Where the spec came from: `template`, `claude` or `fixture`. |
| `publishedAt` | `u64` | no | Unix seconds. The gallery sorts on it, newest first, because `$createdAt` can't be sorted on. |
| `spec` | `bytes` | no (can't be) | The whole validated game spec as sorted JSON. A spec is about 1 to 2 KB, well over the 128-byte `str` limit and well under the 128 KiB `bytes` limit. |

Lifetime: the maximum, about 182 days (`ExpirationTime.max()`). A shared link should keep working for months. It can be extended later with `extendEntity`.

The gallery selects every column except `spec`, so a page of thirty games doesn't download thirty specs. Opening a game reads one entity with `getEntity(key, Games)`, checks `$owner`, decodes the bytes and validates the spec again before it plays.

## `taksh.daily.v1`: one day's challenge

| Column | Type | Indexed | Why |
| --- | --- | --- | --- |
| `date` | `str` | yes | The UTC date, `YYYY-MM-DD`. Every read is `eq("date", …)`. |
| `theme` | `str` | no | The idea 0G was given, such as "Dahi Handi on a crowded Mumbai street". Shown on the home card. |
| `requestId` | `str` | no | 0G's request ID for the call that made the spec. Shown on the home card, so a judge can look the call up. |
| `spec` | `bytes` | no (can't be) | The validated game spec as sorted JSON, like a published game. |

Lifetime: 8 days (`ExpirationTime.fromDays(8)`). The app reads today's and yesterday's challenge. Eight days keeps a week of past challenges readable from the RPC, with a day of slack for time zones. The scores outlive it, at 30 days, so an old board still reads after its game has expired. It then shows the date's starter title.

The first request of a UTC day reads `eq("date", today)`. If nothing is stored, it asks 0G for a game from the day's theme, validates it, reads again, and writes only if still nothing is there. Two instances can still both write in the seconds between their read and write. Everyone then takes the earliest: lowest `$createdAt` block, then lowest key if both landed in one block. `$createdAt` can't be sorted on, so the read fetches up to ten and picks in code (`pickEarliest` in `src/lib/daily/daily.js`).

Nothing is written without 0G. With no 0G, no writer key or no Arkiv, the server serves a starter game picked from the date. Every instance picks the same one, and the screen says why. It has no request ID, and none is shown.

## `taksh.rival.decisions.v1`: one plan 0G served the rival

| Column | Type | Indexed | Why |
| --- | --- | --- | --- |
| `roundId` | `str` | yes | The upload check reads a whole round with `eq("roundId", …)`. A UUID the server picks on the round's first decision. |
| `requestId` | `str` | yes | 0G's request ID for the call. Kept indexed so one decision can be looked up. |
| `askedAt` | `u64` | no | Unix ms when the server asked 0G. The earliest one is when the round started, on the server's clock. |
| `issuedAt` | `u64` | no | Unix ms when the plan left the server. The real-time and missing-plan checks use it. |
| `record` | `bytes` | no (can't be) | The plan, the model's read, the observation it saw and the 0G trace, as JSON. |

Lifetime: one hour. A round has to be uploaded within 5 minutes of ending, so after that its records have no use.

One read returns at most 100 entities, the node's limit. A 120 s round asks 0G about 30 times.

## `taksh.rival.spent.v1`: one round already on 0G Storage

| Column | Type | Indexed | Why |
| --- | --- | --- | --- |
| `roundId` | `str` | yes | The upload check counts spent entities with `eq("roundId", …)` and refuses the round if there is one. |
| `rootHash` | `str` | no | The 0G Storage root hash the round was stored under. |
| `storedAt` | `u64` | no | Unix ms. |

Lifetime: two hours, longer than the decisions it guards.

## Values that need care

- `publishedAt`, `askedAt`, `issuedAt` and `storedAt` are written as `u64(…)`. A bare `bigint` is a `u256` and fails the schema. A test checks this.
- `str` limits count UTF-8 bytes. Titles go through `fitStr`, which stops before the character that would pass 128 bytes.
- Scores are rounded and clamped to the `i32` range before they're written.
