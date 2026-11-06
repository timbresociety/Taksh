# Schemas

Taksh writes four kinds of entity. Scores and games are defined in `src/lib/arkiv/schema.js`, the rival ledger in `src/lib/arkiv/ledger.js`. Both are named schemas, so every entity carries an indexed `arkiv.schema` tag. The name ends in `.v1`. If the shape changes, a `.v2` schema starts a new board and old entities stay readable under `.v1` until they expire.

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

Lifetime: 30 days (`ExpirationTime.fromDays(30)`). The board is a rolling monthly board, and Arkiv drops old scores by itself, so no cleanup job is needed.

The board query, as `toString()` prints it:

```text
arkiv.schema = str('taksh.scores.v1') AND template = str('poses') AND specHash = str('860d…9f60') AND $owner = addr(0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30) ORDER BY score:i32 DESC
```

It runs with `.limit(10).withCount()`, so one request returns the top ten and the total that match.

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
