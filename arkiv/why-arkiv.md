# Why Arkiv

Taksh needed somewhere to put scores and shared games. Before Arkiv it had no backend storage, only a Next.js server that calls a model. The choices were a hosted database, a smart contract, or Arkiv.

A hosted database would have worked, but it adds an account, a connection string and a schema migration to a hackathon project. The data would also be ours alone. A contract fits badly. A leaderboard is a sorted, filtered list, and on a plain EVM chain that means writing an indexer or a subgraph next to the contract.

Arkiv fit what the data actually is:

- **The queries are the feature.** A board is "this template, maybe this world and style, maybe this exact spec, best score first, top ten, plus a total". That's indexed `eq` filters, `orderBy(desc("score"))` and `withCount()`. No indexer to run.
- **The data should expire.** A monthly board should forget old rounds. A 30-day lifetime does that with no cleanup job, and a shared game gets about six months, extendable.
- **A shared game is a link anyone can check.** A published spec is an entity anyone can read by key, from our app or straight from the RPC. Another project could build its own gallery or board from `taksh.games.v1` and `taksh.scores.v1` without asking us.
- **It's Ethereum tooling.** The SDK is viem plus a schema. A server wallet signs writes the same way it would sign any transaction.

The trade-offs we accepted: anyone can write entities with our tag, so every read filters by owner. Reads go through a public RPC that can be slow or down, so the game has to work without it. Scores come from the browser, and nothing on chain proves them.
