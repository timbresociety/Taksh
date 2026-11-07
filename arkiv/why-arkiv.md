# Why Arkiv

Taksh keeps five kinds of record on Arkiv: scores, published games, the day's challenge, and the two halves of the 0G rival's ledger. Everything else lives somewhere chosen for it, or stays in the browser. This page says what a player would lose if Arkiv were swapped for Postgres, and what we kept off Arkiv and why.

Numbers here come from `npm run arkiv:probe` and the two writes made on 2026-11-06 at blocks 308766 and 308778. The schemas are in `schema.md`.

## What a player loses if this were Postgres

**A board they can check without us.** After a post, the result screen links to the transaction on the Rabdi explorer ("See the transaction"). Anyone can run the query in the README against the public RPC and get the same top ten we show, filtered to our writer `0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30`. With Postgres the board is whatever our server says it is, and there's nothing to check it against.

**A shared game that outlives our server.** `/games/<key>` is an Arkiv entity key. The spec is in the entity's `spec` bytes (569 bytes for the newest game), so `getEntity(key)` on any Rabdi node returns the game, whether or not Taksh is running. Another app can list `taksh.games.v1` and build its own gallery. With Postgres, the link dies with our database, and nobody else can read it.

**A board that forgets on its own.** Scores live 30 days, so every board is the last month of play. The board says so, and each row shows how many days it has left. The day's challenge lives 8 days and the rival ledger an hour. Arkiv drops them itself. Postgres can do the same with a cron job, so here the player loses nothing they'd see, and we'd gain a job to run.

**One daily game and one ledger across server instances.** On Vercel, two requests can land on two instances that share no memory. Today's game and the rival's decisions are on Arkiv, so every instance serves the same spec and checks a round against the same decisions. Postgres would do this just as well. What Arkiv saves is the account, the connection string and the migration, and it adds that the data is public.

## What Postgres would do better

We chose Arkiv knowing this list, and the docs say where each one shows.

- **Writes are slow.** A write waits for its receipt, about 8 s (7.7 s for a score post and 7.7 s for a publish, measured on 2026-11-06). The button says "Writing to Arkiv" meanwhile. Postgres answers in milliseconds.
- **No compare-and-set.** Two instances that race on the day's first request can both store a challenge, so every reader picks the earliest (`pickEarliest`). Publishing checks `specHash` and then writes, so two publishes of one spec in the same seconds can both land. A unique index in Postgres closes both.
- **One sort key.** Tied scores come back in the node's order, and `$createdAt` can't be sorted on, so games carry their own `publishedAt`.
- **A query budget.** The public endpoint gives an address without an access key about 1,000 queries (10,000 cost units at 10 a query) before it answers `429 ANON_COST_LIMITED` for about ten minutes. See `friction.md`.
- **Gas on every write.** A score costs 230,660 gas and a publish of a 569-byte spec 513,942, at 1 gwei: 0.00023 and 0.00051 tGLM. The writer's 9.99 tGLM covers about 43,000 score posts. It's free on testnet, but it's why writes are throttled to one per client every 4 s and 20 a minute in total.

## What we kept off Arkiv, and why

| What | Where it lives | Why not Arkiv |
| --- | --- | --- |
| A published game's cover, `spec.json` and `index.html` | Swarm, on Gnosis mainnet (`src/lib/swarm/bee.js`). The Arkiv entity keeps the collection's reference in `swarmRef`. | The gallery shows the cover as an `<img>`, so it needs a URL a browser can load, which a gateway gives and an RPC doesn't. A cover is a 640×360 WebP of 10 to 69 KB (measured on the 21 template previews). In the entity, a page of 30 games would pull up to 2 MB through the RPC, against about 320 bytes a game now (1,903 bytes for the 6 live games from `/api/arkiv/games`). Swarm content doesn't expire after six months. Arkiv keeps what gets queried, and Swarm keeps the files. |
| A game's ENS name, such as `moon-hop.taksh-games.eth` | ENSv2 on Sepolia (`src/lib/ens/`) | An ENS name is owned by the address the creator gives, and they can edit its records in any ENS app. Posting to Arkiv needs no wallet, so our writer owns every Taksh entity and a player can't edit one. ENS gives the creator ownership. Arkiv gives everyone the shared, filtered list. |
| A 0G rival round, replayed and stored | 0G Storage on Galileo (`src/lib/agent/storage.js`), by root hash | An episode can be up to 512 KB and is meant to be kept. Arkiv holds the one-hour ledger the server checks a round against before storing it, then a `spent` entity so it isn't stored twice. |
| Keys: `ARKIV_PRIVATE_KEY`, `ARKIV_ACCESS_KEY`, 0G and ENS keys | Server environment only | Arkiv is public. The writer key signs on the server and never reaches the browser. |
| The camera, pose landmarks and traces | The browser. MediaPipe runs locally (`src/lib/motion/feed.js`), and traces are saved to `traces/`, which git ignores. | They record a real body. Nothing about how someone moved leaves their machine, only the score they choose to post. |
| The player's name between rounds | `localStorage` in the browser | It's a convenience for the next post, not a record. It goes on Arkiv only inside a score the player posts. |
| The prompt that makes a game | 0G Private Computer, inside a TEE | The idea a player types is sent to the model, not stored. The day's challenge keeps only 0G's request ID and the resulting spec. |

## The trade-offs we accepted

Anyone can write an entity tagged `taksh.scores.v1`, so every read filters on `$owner`. Scores are what the browser reports: the server checks that the spec is a real, playable game, but it can't replay a round, so the board is a demo board and the README says so. The RPC can be slow, down or rate limiting, so the game plays without it and each page says which of those happened.
