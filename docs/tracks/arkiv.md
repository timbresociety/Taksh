# Arkiv tracks

Source: ETHGlobal Mumbai prize page, copied verbatim into `prizes.md` on 2026-11-06. Arkiv has four tracks and two Swarm bonuses. A team can win one Arkiv track, and the Swarm bonus can come on top. Taksh enters one: **Build on Arkiv (from scratch)**.

The answers judges read are in `arkiv/`: `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` and `schema.md`. The README has the writer wallet and the query to run.

Live on Rabdi at 00:11 UTC on 2026-11-07 (`npm run arkiv:probe`): 8 scores, 8 published games, 2 daily challenges, 38 rival decisions and 6 spent rounds, all owned by the writer `0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30`.

---

## Track 1: Mirror something Ethereum depends on ($4,000). Skipping

> ### 🪞 Mirror something Ethereum depends on - $4,000
>
> - 1st place: $3,000
> - 2nd place: $1,000
> Pick public data that Ethereum apps and developers rely on, and mirror it into Arkiv entities that anyone can query without asking you for access.
> Example: Sourcify's API looks up its 7.9 million verified Ethereum mainnet contracts by address. We mirrored them to Arkiv at sourcify.arkiv.network, and now anyone can filter them by name, ABI, compiler version, deployer and more.
> Ideas: token lists, chain and RPC registries, address labels, wallet ratings, function signatures.
> How we judge:
> Arkiv feedback (25%): /arkiv/friction.md
> What should we improve today to make Arkiv better: something that got in your way, or something we don't have yet that would make building easier?
> When something broke, what did you expect, what happened, and how can we reproduce it?
> Reach (25%): /arkiv/reach.md
> How many people or projects already use or depend on this data?
> Who would use your copy on Arkiv after Mumbai, and for what?
> Why Arkiv (25%): /arkiv/why-arkiv.md
> If this data sat in Postgres or any other database instead of Arkiv, what could people no longer do?
> What can people do with your copy on Arkiv that they can't do with the original source today?
> Data quality (25%): /arkiv/data-quality.md
> Is the data up to date, and how does your import keep it that way?
> Can people filter it the way they actually search for it?
>
> **Qualification Requirements**
>
> Built from scratch at ETHGlobal Mumbai, following ETHGlobal's rules.
> The data's license allows republishing. Link it in your README.
> Not Sourcify data, from any chain.
> Your import script is in the repo, and we can re-run it.
> Your project writes to Arkiv's current testnet (see the docs) with @arkiv-network/sdk or the JSON-RPC API, and a feature or query people use reads the data from Arkiv.
> In your README: the wallet address(es) that wrote your entities, and one query we can run.
> /arkiv/schema.md: your entities, the fields you query, who owns them and when they expire. /arkiv/friction.md: your feedback.
> One file per criterion in How we judge, at the path next to it, answering its questions with links, numbers or a query we can run.
> A public repo with an open-source license. Say how you used AI, as ETHGlobal's rules require.
> Each team can win one Arkiv track prize; the Arkiv + Swarm bonus can come on top of it.

### Why we skip it

1. Taksh mirrors no public Ethereum data. Its entities are its own scores and games.
2. A team can win only one Arkiv track, and Build on Arkiv fits what we built.

---

## Track 2: Build on Arkiv (from scratch) ($4,000). Entering

> ### 🧩 Build on Arkiv (from scratch) - $4,000
>
> - 1st place: $3,000
> - 2nd place: $1,000
> Build a new app whose data lives in Arkiv. You query its entities with SQL-like filters, and each one has an owner wallet and an expiration you choose.
> Some directions:
> Agents: ephemeral coordination state: tasks, bids and claims that agents share, query and let expire.
> Markets: listings or offers that expire at their deadline.
> Publishing and media: posts, profiles and follows that any app can read.
> Names and identity: profiles or service directories keyed by ENS names.
> How we judge:
> Arkiv feedback (25%): /arkiv/friction.md
> What should we improve today to make Arkiv better: something that got in your way, or something we don't have yet that would make building easier?
> When something broke, what did you expect, what happened, and how can we reproduce it?
> Reach (25%): /arkiv/reach.md
> Who is it for, and would they use it?
> Can they try it today, and will you keep building it after Mumbai?
> Why Arkiv (25%): /arkiv/why-arkiv.md
> If you swapped Arkiv for Postgres or any other database, what would your users lose?
> What did you keep off Arkiv, and why?
> How you use Arkiv (25%): /arkiv/how-you-use-arkiv.md
> Do the things you filter on, who can edit each entity, and when it expires fit what your app does?
> Does each Arkiv feature you use change something your users see?
>
> **Qualification Requirements**
>
> Built from scratch at ETHGlobal Mumbai, following ETHGlobal's rules.
> Your app writes to Arkiv's current testnet (see the docs) with @arkiv-network/sdk or the JSON-RPC API, and at least one feature users see reads its data from Arkiv.
> In your README: the wallet address(es) that wrote your entities, and one query we can run.
> /arkiv/schema.md: your entities, the fields you query, who owns them and when they expire. /arkiv/friction.md: your feedback.
> One file per criterion in How we judge, at the path next to it, answering its questions with links, numbers or a query we can run.
> A public repo with an open-source license. Say how you used AI, as ETHGlobal's rules require.
> Not counted: the SDK installed but never used to read, or Arkiv used only as a log that nothing reads.
> Each team can win one Arkiv track prize; the Arkiv + Swarm bonus can come on top of it.

### Where we stand

**Have it:**

1. **The app's data lives in Arkiv.** Five schemas: scores, published games, the day's challenge, and the 0G rival's decisions and spent rounds. Taksh keeps no other database.
2. **Filters players use.** Every chip on the result-screen board ("This exact game", "Camera only", "Today's challenge") and in the gallery (game, world) is one `eq` in the query. The rank after a post is a `gt` count.
3. **Expiry that fits, and shows.** Scores live 30 days, so the board is the last month of play, and each row says "Expires in 30 d". Shared games live 182 days, and each gallery card counts them down. The daily challenge lives 8 days, the rival ledger 1 to 2 hours.
4. **Owner on every read.** One writer wallet owns every entity, and every read filters on `$owner`, so anyone tagging an entity `taksh.scores.v1` can't reach the board. Players post without a wallet.
5. **All four judging files, with numbers.** `friction.md` has a table of 7 breaks, each with expected, what happened and a repro. The others have measured gas, query times and live counts.

**Not used:**

- `updateEntity`, `extendEntity`, `deleteEntity`, `changeOwnership`. Every entity is write-once, by design. Popular games aren't kept alive past 182 days yet.
- Wallet-owned player data. Players don't own their scores, because posting needs no wallet.

**Qualification:**

| Rule | Status |
| --- | --- |
| From scratch at ETHGlobal Mumbai | ✅ First commit `353aa24`, 2026-11-06 05:49 IST |
| Writes to Rabdi with `@arkiv-network/sdk`, a feature users see reads it | ✅ `createEntity` in `src/lib/arkiv/store.js`. The board, gallery, shared game and daily boards all read live |
| README: writer wallet and one query | ✅ Wallet linked to the explorer. The `curl` query returns the top scores, with sample output |
| `arkiv/schema.md` and `arkiv/friction.md` | ✅ |
| One file per criterion, with links, numbers or a query | ✅ The four files in `arkiv/` |
| Public repo, open-source license, AI use stated | ✅ `timbresociety/Taksh`, MIT, README "Licence and AI use" |
| Judges see it on the default branch | ⏳ Waits on PR https://github.com/timbresociety/Taksh/pull/11 into `ketan`, then `ketan` into `main` |

---

## Track 3: Build on Arkiv (existing projects) ($4,000). Not eligible

> ### 🧩 Build on Arkiv (existing projects) - $4,000
>
> 🆕  This prize is only available to Continuity Track participants →
> - 1st place: $3,000
> - 2nd place: $1,000
> Already building a product? Bring it to ETHGlobal Mumbai and move part of its data into Arkiv. You query Arkiv entities with SQL-like filters, and each one has an owner wallet and an expiration you choose.
> Some directions:
> Data your users own: profiles, posts or settings that stay with each user's wallet and that other apps can read.
> Shared state: listings, orders or tasks that several parties query, and that expire when they are done.
> Agents: ephemeral coordination state that your agents share, query and let expire.
> How we judge:
> Arkiv feedback (25%): /arkiv/friction.md
> What should we improve today to make Arkiv better: something that got in your way, or something we don't have yet that would make adding Arkiv easier?
> When something broke, what did you expect, what happened, and how can we reproduce it?
> Reach (25%): /arkiv/reach.md
> Who uses your product today, and will they use the part on Arkiv?
> Will it ship to them after Mumbai?
> Why Arkiv (25%): /arkiv/why-arkiv.md
> If this data stayed in your current database, what would your users lose?
> What did you keep off Arkiv, and why?
> How you use Arkiv (25%): /arkiv/how-you-use-arkiv.md
> Do the things you filter on, who can edit each entity, and when it expires fit what your product does?
> Does each Arkiv feature you use change something your users see?
>
> **Qualification Requirements**
>
> An existing project in ETHGlobal's Continuity batch, following ETHGlobal's rules.
> The Arkiv part is new work done at ETHGlobal Mumbai. In your README, say what existed before the event and what you added; we judge only what you added.
> Your app writes to Arkiv's current testnet (see the docs) with @arkiv-network/sdk or the JSON-RPC API, and at least one feature users see reads its data from Arkiv.
> In your README: the wallet address(es) that wrote your entities, and one query we can run.
> /arkiv/schema.md: your entities, the fields you query, who owns them and when they expire. /arkiv/friction.md: your feedback.
> One file per criterion in How we judge, at the path next to it, answering its questions with links, numbers or a query we can run.
> A public repo with an open-source license. Say how you used AI, as ETHGlobal's rules require.
> Not counted: the SDK installed but never used to read, or Arkiv used only as a log that nothing reads.
> Each team can win one Arkiv track prize; the Arkiv + Swarm bonus can come on top of it.

### Why we skip it

1. Only Continuity Track teams can enter. Taksh is a new project.

---

## Track 4: Node tooling ($2,000). Skipping

> ### 🛠️ Node tooling - $2,000
>
> Build a tool for the people who run Arkiv nodes. Two directions:
> Operator dashboard: a collector that runs next to a node and shows how many days are left before the disk is full (with an alert), requests and latency per method, peers, sync, CPU and memory.
> Slow query finder: load data into your own node and measure which query shapes are slow. Run it only on your own node, never on a public endpoint.
> For reference: nodes.arkiv.network shows Arkiv's community nodes from the outside. You don't have to rebuild it: use it as a guide, and show what only a tool next to the node can see.
> How we judge:
> Arkiv feedback (25%): /arkiv/friction.md
> What should we improve today to make running or querying an Arkiv node better: something that got in your way, or something we don't have yet?
> When something broke, what did you expect, what happened, and how can we reproduce it?
> Real use (25%): /arkiv/real-use.md
> Would people who run Arkiv nodes, or Arkiv's engineers, actually use this?
> What does it tell them that they need to know?
> What's new (25%): /arkiv/whats-new.md
> What does it show or find that the node's built-in tools don't?
> Is it more than putting an existing dashboard together?
> Easy to run (25%): /arkiv/easy-to-run.md
> Can someone else install and run it from your README in a few minutes?
> Does the README say what it needs and what to do when it fails?
>
> **Qualification Requirements**
>
> Built from scratch at ETHGlobal Mumbai: a new repo that runs next to the node. A pull request to an existing repo is not from scratch.
> It works against an Arkiv node in your demo. A node on your own machine is enough.
> In your README: which node you used, and how to reproduce the demo. If your tool writes Arkiv entities, also the wallet address(es) that wrote them and a /arkiv/schema.md.
> /arkiv/friction.md: your feedback on running and querying the node.
> One file per criterion in How we judge, at the path next to it, answering its questions with links, numbers or a query we can run.
> Slow query shapes you find go to us privately (we will share how at the Arkiv booth), never into your public repo, /arkiv/friction.md or demo.
> A public repo with an open-source license. Say how you used AI, as ETHGlobal's rules require.
> Each team can win one Arkiv track prize; the Arkiv + Swarm bonus can come on top of it.

### Why we skip it

1. Taksh is a game, not a tool for node operators. We run no node.
2. One Arkiv track per team, and Build on Arkiv is ours.

---

## Bonus: Arkiv + Swarm (from scratch) ($500). Not ready

> ### 🐝 Arkiv + Swarm bonus (from scratch) - $500
>
> Use Swarm (ethswarm.org) in your project in a meaningful way, and you are also in the running for $500. For example, keep the files your users see on Swarm and point to them from your Arkiv entities, or upload them encrypted so only the people who get the reference can open them. The most useful integration wins. It comes on top of any track prize: you can win a track and this bonus.
> To enter: when you submit a from-scratch project to Mirror, Build on Arkiv or Node tooling, also select this bonus. Arkiv's prizes count as one partner prize on ETHGlobal, so it does not use another of your three picks. Existing projects have their own Arkiv + Swarm bonus.
>
> **Qualification Requirements**
>
> Your project uses both Arkiv and Swarm. A project that uses only Swarm does not qualify.
> /arkiv/swarm.md in your repo, with:
> What you keep on Swarm, what you keep on Arkiv, and which entity field holds the Swarm reference or feed.
> One Arkiv entity key and the Swarm reference it points to, with a link we can open.
> The postage stamp batch ID you uploaded with and the wallet that bought it (or who gave you the batch), and the Bee node or service you uploaded through.
> The files in your repo that upload to Swarm and read from it.
> Steps to run one upload and one read yourself, what they need, and what we should see.
> The moment in your demo video where Swarm is used.
> What got in your way with Swarm.
> Careful: an encrypted Swarm reference contains its key, and Arkiv entities are public. Never store one in an entity as it is: encrypt it first or keep it off Arkiv.

### Where we stand

**Have it:**

1. **The field.** `taksh.games.v1` has a `swarmRef` column, and `src/lib/swarm/bee.js` uploads a game's cover, `spec.json` and `index.html`.

**Not yet:**

- No live game carries a Swarm reference: 0 of 8 at 00:11 UTC on 2026-11-07.
- No `arkiv/swarm.md`. Swarm is a separate task, so this file doesn't cover it.

**Qualification:**

| Rule | Status |
| --- | --- |
| Uses both Arkiv and Swarm | ⏳ Code is in. No published game has a `swarmRef` yet |
| `arkiv/swarm.md` with entity key, reference, stamp batch, files, steps, demo moment, friction | ❌ Not written |

---

## Bonus: Arkiv + Swarm (existing projects) ($500). Not eligible

> ### 🐝 Arkiv + Swarm bonus (existing projects) - $500
>
> 🆕  This prize is only available to Continuity Track participants →
> Use Swarm (ethswarm.org) in what you add to your product at ETHGlobal Mumbai, and you are also in the running for $500. For example, keep the files your users see on Swarm and point to them from your Arkiv entities, or upload them encrypted so only the people who get the reference can open them. The most useful integration wins. It comes on top of the Build on Arkiv prize for existing projects: you can win both.
> To enter: when you submit your project to Build on Arkiv (existing projects), also select this bonus. Arkiv's prizes count as one partner prize on ETHGlobal, so it does not use another of your three picks.
>
> **Qualification Requirements**
>
> An existing project in ETHGlobal's Continuity batch that uses both Arkiv and Swarm. A project that uses only Swarm does not qualify.
> How Swarm works with your Arkiv entities is new work done at ETHGlobal Mumbai. In /arkiv/swarm.md, say what existed before the event; we judge only what you added.
> /arkiv/swarm.md in your repo, with:
> What you keep on Swarm, what you keep on Arkiv, and which entity field holds the Swarm reference or feed.
> One Arkiv entity key and the Swarm reference it points to, with a link we can open.
> The postage stamp batch ID you uploaded with and the wallet that bought it (or who gave you the batch), and the Bee node or service you uploaded through.
> The files in your repo that upload to Swarm and read from it.
> Steps to run one upload and one read yourself, what they need, and what we should see.
> The moment in your demo video where Swarm is used.
> What got in your way with Swarm.
> Careful: an encrypted Swarm reference contains its key, and Arkiv entities are public. Never store one in an entity as it is: encrypt it first or keep it off Arkiv.

### Why we skip it

1. Only Continuity Track teams can enter. Taksh is a new project.
