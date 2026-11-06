# ENSv2 in Taksh, for judges

Taksh turns a typed idea into a fitness game you play with your body. On ENS, a published game is a name, and `/play/<name>` rebuilds the game from that name's text records on every visit. The game exists nowhere else. The 0G rival that boxes you in Counter Bout has its own name, and every round it fights gets a name under it.

Everything here runs on Sepolia against the ENSv2 contracts from the Sepolia (ENSv2) deployment table. Open any name at `/name/<name>` in the app to see its registry path, owner, token roles, emancipation, resolver roles and records, all read from the chain on that request. The table below follows the order of the "Best Use of ENSv2" prize text. Line numbers are for commit `9f96cc2`.

## Names to open

| Name | What it shows |
| --- | --- |
| `taksh-games.eth` | The parent, bought through the ENSv2 ETH Registrar. Its resolver holds an ENSIP-26 `agent-context` for the game generator agent |
| `mumbai-monsoon-bout.taksh-games.eth` | A published game. `/play/mumbai-monsoon-bout.taksh-games.eth` loads it from its records |
| `ens-split-mw5jtipa.taksh-games.eth` | A game published with the smaller record layout, 4.13M gas |
| `rival.taksh-games.eth` | The 0G rival agent: ENSIP-26 records, its own registry, and a server wallet allowed to write three keys and nothing else |
| `round-a56ccebb00.rival.taksh-games.eth` | One round the rival fought. The rival owns it, it expires 2026-12-06, and it can't be transferred |
| `nope-xyz.taksh-games.eth` | Not registered. `/name` shows the Universal Resolver answering through the parent's resolver |

## What the judges look for

| Prize text | What Taksh does | Code | Open on Sepolia |
| --- | --- | --- | --- |
| Hierarchical registry structure | Three registry levels under .eth: the .eth registry holds `taksh-games.eth`, its UserRegistry holds every game and `rival`, and the rival's UserRegistry holds its rounds. `inspectName` walks that chain label by label for any name | `scripts/ens-setup.mjs:69`, `:88`; `scripts/ens-rival.mjs:103`, `:105`; `src/lib/ens/chain.js:299` | Parent [`0x12128e2d…`](https://sepolia.etherscan.io/tx/0x12128e2da3dc7986f88381e84a419883d86d3ec93aac658da49f38c813bb26ca). Rival registry attached in [`0xf26d9285…`](https://sepolia.etherscan.io/tx/0xf26d928546778d63e99205d440bb97967a26446054ca62781a9132d179d57ad9). `/name/round-a56ccebb00.rival.taksh-games.eth` lists all four levels |
| Wildcard resolution (resolve subnames off a parent's resolver) | **Not used to serve anything.** Games and rounds each have their own registry entry. `/name` only reports it when the Universal Resolver falls back to an ancestor's resolver for an unregistered name | `src/app/name/[name]/page.js:78` | `/name/nope-xyz.taksh-games.eth` |
| Your own subname registry, subnames tokenized under your own rules | Two UserRegistry proxies through the Verifiable Factory. Games register with `CREATOR_TOKEN_ROLES` (set resolver, set subregistry, transfer). Rounds register with role bitmap `0` | `chain.js:45`, `:182`, `:255` | Game [`0xce6e72a4…`](https://sepolia.etherscan.io/tx/0xce6e72a4075b48ac925a024e4ec3f5f8007957732f9c22a0c10dd750bf309d0f). Round [`0xb9d51652…`](https://sepolia.etherscan.io/tx/0xb9d516527a908a6f5d0ad2c49cc0bd79d7e0447aa4caf387c17d124e5b8a4b06) |
| Enhanced Access Control: an account limited to certain text records | The server wallet holds `ROLE_SET_TEXT` on exactly three keys of the rival's resolver (`taksh.rival.last-episode`, `taksh.round.episode`, `taksh.round.score`), granted with `grantSetterRoles`. A `setText` from it on `agent-context` reverts. It writes them in one `multicall`. On both registries it holds only `ROLE_REGISTRAR`. The app reads roles back live with `roles()` and `hasRoles()` | `scripts/ens-rival.mjs:116`; `chain.js:262`, `:326`, `:337`, `:278` | Grants [`0x7f1ff9e9…`](https://sepolia.etherscan.io/tx/0x7f1ff9e928e3825f205e76dd73b2db8288696b438f7d804f8f314d6c7d1edaa6), [`0x6bf9e238…`](https://sepolia.etherscan.io/tx/0x6bf9e2384e7e3c97ae62e98b290563a8b2b31e5f160dcef8026b0ac36a4a85fa), [`0xb462c30a…`](https://sepolia.etherscan.io/tx/0xb462c30aac93b22262dadd401d890c83462eb6bc42ff0204e5ad8e990e542e5b). `/name/rival.taksh-games.eth` marks each key writable or not |
| Give subnames their own Permissioned Resolver so they fully own their data | Every game gets its own Permissioned Resolver. `initialize()` grants the creator every role and writes the records in the same transaction, so the server holds no role on it afterwards | `chain.js:172` | Resolver deploy [`0x97c7c642…`](https://sepolia.etherscan.io/tx/0x97c7c6420b70318fca358877b29ebaea67becfa39a62174a3f2173d95ce0e59b). `/name/ens-split-mw5jtipa.taksh-games.eth` shows the server can set no key |
| Record aliasing at the resolver level | **Not used.** No `linkToNode` or `linkToRecord` | | |
| Namespace aliasing via a shared registry | **Not used.** No registry is mounted under two names | | |
| Expiring subnames | Round names expire 30 days after the round | `chain.js:213`, `:255` | `/name/round-a56ccebb00.rival.taksh-games.eth`: expires 2026-12-06 |
| Revocable subnames | **Not used.** Both registries are emancipated, so no name can be revoked before it expires | | `isEmancipated()` is true on `0xcA36D4cA…ecD43` (games) and `0x1337DfE7…0D5E` (rounds) |
| Non-transferable vs. transferable | Rounds carry no token roles, so a transfer reverts with `TransferDisallowed`. Games carry the transfer role, and their owner can move them. Both were checked on an anvil fork of Sepolia | `chain.js:45`, `:255` | `/name/<round>` shows "Transferable: no", `/name/<game>` shows "yes" |
| Forever names with no parent control | **Partly.** No account holds a root role on the game registry that could unregister a game or change its resolver (emancipated, owner keeps only registrar and renew). But a game expires with `taksh-games.eth` on 2027-11-06, so these are not forever names | `scripts/ens-setup.mjs:69`, `chain.js:182` | `/name/mumbai-monsoon-bout.taksh-games.eth`, "Can it be taken back?" |
| Bonus: AI agents as namespaces, each with identity and permissions | `rival.taksh-games.eth` is the 0G rival's identity: ENSIP-26 `agent-context` and `agent-endpoint[web]`, plus its model, trust tier and 0G provider. It is a namespace, with its own registry holding one name per round it fought, written after each round by `writeRivalEpisode`. Its permissions are the three-key grant above. The app shows round blocks only for names under the rival that use its resolver. The parent's `agent-context` describes the game generator agent | `chain.js:225`, `:348`; `src/app/api/rival/episode/route.js:54`; `scripts/ens-setup.mjs:63` | Rival [`0x50f56a05…`](https://sepolia.etherscan.io/tx/0x50f56a05616630fe272d2af00ae0a4787f9e2cc89b862d7c46289f8a36175946). Round records [`0xec67edc0…`](https://sepolia.etherscan.io/tx/0xec67edc01600f4d02dc98bbe529c92ddc36e64735fd6ccdc7e84b10d88ea6d61) |

## Qualification requirements

| Requirement | Proof |
| --- | --- |
| Built on ENSv2 on Ethereum mainnet or Sepolia | Sepolia, with the ETH Registry, ETH Registrar, Verifiable Factory, Permissioned Resolver and UserRegistry addresses from the Sepolia (ENSv2) table, `src/lib/ens/chain.js:14`. The parent was registered through the ENSv2 ETH Registrar, [`0x12128e2d…`](https://sepolia.etherscan.io/tx/0x12128e2da3dc7986f88381e84a419883d86d3ec93aac658da49f38c813bb26ca) |
| ENSv2 central, not cosmetic | A published game is only its ENS records. `/play/<name>` resolves them through the Universal Resolver on every visit and validates them before loading, `src/app/play/[name]/page.js:24`. Change `taksh.world` in any ENS app and the game moves to that world. Break the name and the game stops loading |
| Functional demo, no hard-coded values | Publishing from the result screen sends two Sepolia transactions, `src/app/api/ens/route.js:41`. `/play` and `/name` read the chain on every request; `/name` prints the block it read at. Round names are minted from each real 0G Storage root hash. Contract addresses are constants from the ENS docs, and the parent name and keys come from env |
| Link to a live demo | **Not yet.** There is no public deploy link. When there is one, set `TAKSH_URL` and run `npm run ens:rival` again so the `url` and `agent-endpoint[web]` records point at it |
| Open source | https://github.com/timbresociety/Taksh is public, under the MIT license |

## What a publish costs

Measured on Sepolia on 2026-11-07. The resolver proxy costs 0.8M gas. Text records cost about 3,600 gas per byte plus 44k per record, so `taksh.spec` stores only the fields that have no record of their own (`src/lib/ens/records.js:45`). A publish with a `url` record now costs about 4.4M gas, down from 5.1M. Sepolia gas was 17 wei that day, so a publish cost under 0.0000001 ETH. At 20 gwei it would cost about 0.09 ETH.

A shared resolver per creator would save the 0.8M deploy. But on a Permissioned Resolver, a text grant covers every name that resolver serves, so the server would need a standing role over all of that creator's games. Taksh keeps one resolver per game so the server holds no role on any game after it is published.

## Try it

1. Play any game to the end and press Publish to ENS on the result screen. About 20 seconds later the panel links the new name.
2. Open that name's `/name/<name>` page. The owner, token roles and per-key server grants come from the chain at that moment.
3. Play Counter Bout. When the round ends, the result screen names the round's ENS name. About half a minute later, `/name/<round name>` shows it, and `rival.taksh-games.eth` points at it.
