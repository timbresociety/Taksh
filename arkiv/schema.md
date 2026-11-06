# Schemas

Taksh writes two kinds of entity, defined in `src/lib/arkiv/schema.js`. Both are named schemas, so every entity carries an indexed `arkiv.schema` tag. The name ends in `.v1`. If the shape changes, a `.v2` schema starts a new board and old entities stay readable under `.v1` until they expire.

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

## Values that need care

- `publishedAt` is written as `u64(…)`. A bare `bigint` is a `u256` and fails the schema. A test checks this.
- `str` limits count UTF-8 bytes. Titles go through `fitStr`, which stops before the character that would pass 128 bytes.
- Scores are rounded and clamped to the `i32` range before they're written.
