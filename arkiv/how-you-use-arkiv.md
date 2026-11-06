# How Taksh uses Arkiv

Arkiv holds what in Taksh has to outlive one browser tab or one server instance: the scores people post, the games they share, the day's challenge, and the 0G rival's ledger. The app keeps no other database. The schemas are in `arkiv/schema.md`.

## Writes

Both writes go through a route on the server, signed by one writer wallet whose key is in `ARKIV_PRIVATE_KEY`:

- `POST /api/arkiv/scores` takes the spec that was played, the result, the input mode and a name. The server validates the spec with the same validator that gates every game, hashes it, and calls `createEntity(Scores, …)` with a 30-day lifetime. It then makes two `count()` calls to work out the rank: scores on that template greater than yours, and the total.
- `POST /api/arkiv/games` validates the spec and looks for an entity with the same `specHash`. If none exists, it calls `createEntity(Games, …)` with the spec as `bytes` and the maximum lifetime. Publishing the same game twice returns the first entity.

- `GET /api/daily`, on the first request of a UTC day, reads `eq("date", today)` from `taksh.daily.v1`. If nothing is stored, it asks 0G for a game from the day's theme, reads again, and calls `createEntity(Daily, …)` with an 8-day lifetime only if another instance hasn't stored one meanwhile. Each instance keeps the result in memory, so later requests cost nothing.
- A score posted on a daily round carries `daily = <date>`. The server checks that the spec hashes to that date's challenge before it sets the column.

Each client gets one write every four seconds, because each write costs the writer wallet gas.

## The 0G rival's ledger

When you fight the 0G rival, the round can be stored on 0G Storage. The server only stores a round whose plans are ones 0G really returned to it, so it needs a record of every decision it served. On Vercel the upload can land on a different instance from the one that served the plans, and instances share no memory. So the record lives on Arkiv:

- `POST /api/rival/decide` writes one `taksh.rival.decisions.v1` entity per 0G decision, with a one-hour lifetime. The write takes about 8 s, so it runs in `after()`, once the plan is already back in the browser.
- `POST /api/rival/episode` reads every decision for the round with `eq("roundId", …)` and checks the round against them. If a decision the browser sent isn't readable yet, it waits 9 s once and reads again.
- Once the round is on 0G Storage, a `taksh.rival.spent.v1` entity marks it stored, so a second upload of the same round is refused on any instance.

Memory on each instance is a cache in front of this. Two instances racing on one round can both store it, seconds apart, with the same score. A compare-and-set store would close that.

## Reads the player sees

- **The leaderboard** on the result screen. `GET /api/arkiv/scores` builds `select(...).from(Scores).ownedBy(writer).where(eq("template", …))`, with extra `eq` filters on `world`, `style`, `specHash` or `mode` depending on the tab, then `.orderBy(desc("score")).limit(10).withCount()`. It reads again after you post, and your row shows in bold with your rank.
- **The gallery** at `/games`. It's a server component that runs `select(...).from(Games).ownedBy(writer)`, optionally with `eq("template", …)`, sorted by `publishedAt`. It leaves out the `spec` bytes.
- **Today's challenge** on the home page. The card shows the date, the game's title, the 0G request ID, the time until the next game and a link to yesterday's board, all from the `taksh.daily.v1` entity. `/daily` opens the game. Every instance serves the earliest entity for the date, so everyone plays the same spec.
- **The daily board.** A daily round's result screen opens on "Today's challenge": `eq("daily", date)`, best score first. After you post, your rank is counted on that board, not the whole template. `/daily/<date>` shows any day's board, which is where the home card's "Yesterday's board" goes.
- **A shared game** at `/games/<key>`. `getEntity(key, Games)` reads it, checks that `$owner` is the writer, decodes the spec and validates it again. Then the normal game flow opens on it, so the player can change the world and style, play with the camera or keyboard, and post a score that links back through `specHash`.

## Trust

Arkiv is public, so every read filters on `$owner`. A shared spec is validated again on read, because the bytes came from a public chain. Scores are what the browser reports. The server checks that the spec is a real, playable game, but it can't replay the round. This is a demo leaderboard, and the docs say so.

## When Arkiv is not there

- No `ARKIV_PRIVATE_KEY`: the board and gallery still read the default writer's data, and Post and Publish return "Arkiv writes are off".
- The RPC is down or slow: every read gives up after 10 s and every write after 25 s (`withDeadline` in `store.js`). Routes then return `{ available: false }`, the result screen says "Leaderboard unavailable", and the game, revise and replay all still work.
- The public endpoint is rate limiting (no `ARKIV_ACCESS_KEY`): it answers `429` with a Retry-After of minutes. The transport doesn't retry, so the route answers at once, and the message says to set the key.
- An unfunded wallet: the error names the wallet and the faucet.
- No 0G, no writer key, or no Arkiv for today's challenge: every instance serves the same starter game, picked from the date, and the home card says which of the three is missing. No request ID is shown, because none exists.

## Code

- `src/lib/arkiv/schema.js`: schemas, encoding, spec hash. Pure, shared by the server and browser.
- `src/lib/arkiv/store.js`: clients, queries, writes. Server only.
- `src/lib/arkiv/ledger.js`: the rival ledger schemas, writes and the round read. Server only.
- `src/lib/daily/daily.js`: date keys, themes, the starter fallback and the race rule. Pure.
- `src/lib/daily/server.js`: read, make on 0G, store, read again. Server only.
- `src/app/api/arkiv/`: the routes.
- `src/components/ArkivBoard.jsx`: the leaderboard and publish panel.
- `src/app/games/`: the gallery and shared game pages.
- `test/arkiv.test.mjs`: encoding, schema fit and exact query text, with no network.
- `test/daily.test.mjs`: date keys, the fallback, the race rule and the daily queries, with no network.
