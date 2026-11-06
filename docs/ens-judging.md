# ENSv2 in Taksh, for judges

Taksh turns a typed idea into a fitness game you play with your body. On ENS, a published game is a name: `/play/<name>` rebuilds the game from that name's text records on every visit, so no other copy exists. The 0G rival that boxes you in Counter Bout has its own name, and every round it fights gets a name under it.

Everything below runs on Sepolia against the ENSv2 contracts in the Sepolia (ENSv2) deployment table. Open any name at `/name/<name>` in the app to see its registry path, owner, token roles, emancipation, resolver roles and records, read live. Line numbers are for the commit that added this file.

## Names to open

| Name | What it shows |
| --- | --- |
| `taksh-games.eth` | The parent, bought through the ENSv2 ETH Registrar. Its resolver has an ENSIP-26 `agent-context` for the game generator |
| `mumbai-monsoon-bout.taksh-games.eth` | A published game. `/play/mumbai-monsoon-bout.taksh-games.eth` loads it from the records |
| `ens-split-mw5jtipa.taksh-games.eth` | A game published with the smaller record layout (4.13M gas) |
| `rival.taksh-games.eth` | The 0G rival agent: ENSIP-26 records, its own registry, and a server wallet that can write three keys and nothing else |
| `round-a56ccebb00.rival.taksh-games.eth` | One round the rival fought. Owned by the rival, expires 2026-12-06, can't be transferred |
| `nope-xyz.taksh-games.eth` | Not registered. `/name` shows the Universal Resolver falling back to the parent's resolver |

## Feature map

| ENSv2 feature | Where in the code | On Sepolia |
| --- | --- | --- |
| Hierarchical registry: .eth registry, then a UserRegistry per namespace | `scripts/ens-setup.mjs:69` deploys the game registry and registers it as the parent's subregistry (`:88`). `scripts/ens-rival.mjs:100` deploys the rival's registry and attaches it with `setSubregistry` (`:104`). `inspectName` walks the chain label by label, `src/lib/ens/chain.js:297` | Parent [`0x12128e2d…`](https://sepolia.etherscan.io/tx/0x12128e2da3dc7986f88381e84a419883d86d3ec93aac658da49f38c813bb26ca). Rival registry attached in [`0xf26d9285…`](https://sepolia.etherscan.io/tx/0xf26d928546778d63e99205d440bb97967a26446054ca62781a9132d179d57ad9). A round sits four registries deep |
| Subname registries, tokens with chosen roles | Games: `register` with `CREATOR_TOKEN_ROLES` (set resolver, set subregistry, transfer), `chain.js:45` and `:180`. Rounds: `register` with role bitmap `0`, `chain.js:253` | Game [`0xce6e72a4…`](https://sepolia.etherscan.io/tx/0xce6e72a4075b48ac925a024e4ec3f5f8007957732f9c22a0c10dd750bf309d0f). Round [`0xb9d51652…`](https://sepolia.etherscan.io/tx/0xb9d516527a908a6f5d0ad2c49cc0bd79d7e0447aa4caf387c17d124e5b8a4b06) |
| Subname setups | Games: transferable, live as long as the parent, can't be revoked. Rounds: expiring (30 days, `ROUND_DAYS`, `chain.js:211`) and non-transferable. Both registries are emancipated: the owner holds only registrar and renew, `ens-setup.mjs:69`, `ens-rival.mjs:99` | `isEmancipated()` is true on `0xcA36D4cA…ecD43` (games) and `0x1337DfE7…0D5E` (rounds). A round transfer reverts with `TransferDisallowed`, a game transfer succeeds (anvil fork of Sepolia) |
| Permissioned Resolver through the Verifiable Factory | Each game gets its own resolver; `initialize()` grants the creator every role and writes the records in the same transaction, so the server keeps no role. `chain.js:170` | Resolver deploy [`0x97c7c642…`](https://sepolia.etherscan.io/tx/0x97c7c6420b70318fca358877b29ebaea67becfa39a62174a3f2173d95ce0e59b) |
| Enhanced Access Control, one key per grant | `grantSetterRoles` for `taksh.rival.last-episode`, `taksh.round.episode`, `taksh.round.score`, `ens-rival.mjs:116`. Server writes through `multicall`, `chain.js:260`. Read back with `hasRoles` per key, `chain.js:334` | Grants [`0x7f1ff9e9…`](https://sepolia.etherscan.io/tx/0x7f1ff9e928e3825f205e76dd73b2db8288696b438f7d804f8f314d6c7d1edaa6), [`0x6bf9e238…`](https://sepolia.etherscan.io/tx/0x6bf9e2384e7e3c97ae62e98b290563a8b2b31e5f160dcef8026b0ac36a4a85fa), [`0xb462c30a…`](https://sepolia.etherscan.io/tx/0xb462c30aac93b22262dadd401d890c83462eb6bc42ff0204e5ad8e990e542e5b). `/name/rival.taksh-games.eth` shows `agent-context` as not writable |
| Role bitmaps read live | `roles(resource, owner)` on the registry and `roles(0, owner)` on the resolver, decoded by `roleNames`, `chain.js:276` and `:323` | `/name/<any name>` |
| Universal Resolver | Every game load: `readGame`, `chain.js:190`. The play page builds the game from the records, `src/app/play/[name]/page.js:24` | `/play/mumbai-monsoon-bout.taksh-games.eth` |
| Wildcard resolution | Not used to serve games. `/name` reports when the Universal Resolver answers an unregistered name through its parent's resolver | `/name/nope-xyz.taksh-games.eth` |
| AI agents as namespaces (bonus) | `rival.taksh-games.eth` carries ENSIP-26 `agent-context` and `agent-endpoint[web]`, plus its model, trust tier and 0G provider. Its rounds are names in its own registry, written by `writeRivalEpisode`, `chain.js:223`, called after each stored round in `src/app/api/rival/episode/route.js:54`. The parent's `agent-context` describes the game generator agent, `ens-setup.mjs:63` | Rival [`0x50f56a05…`](https://sepolia.etherscan.io/tx/0x50f56a05616630fe272d2af00ae0a4787f9e2cc89b862d7c46289f8a36175946). Round records [`0xec67edc0…`](https://sepolia.etherscan.io/tx/0xec67edc01600f4d02dc98bbe529c92ddc36e64735fd6ccdc7e84b10d88ea6d61) |
| Record aliasing (`linkToNode`) and namespace aliasing | Not used | |

## What a publish costs

Measured on Sepolia on 2026-11-07. The resolver proxy is 0.8M gas. Text records cost about 3,600 gas per byte plus 44k per record, so `taksh.spec` stores only the fields that have no record of their own (`src/lib/ens/records.js:41`). A publish is about 4.4M gas with a `url` record, down from 5.1M. Sepolia gas was 17 wei that day, so a publish cost under 0.0000001 ETH. At 20 gwei it would be about 0.09 ETH.

A shared resolver per creator would save the 0.8M deploy, but on a Permissioned Resolver a text grant covers every name the resolver serves, so the server would need a standing role over all of that creator's games. Taksh keeps one resolver per game so the server holds no role on any game after it is published.

## Try it

1. Open the app, play any game to the end, and press Publish to ENS on the result screen. About 20 seconds later the panel links the new name.
2. Open that name's `/name/<name>` page. The owner, the token roles and the per-key server grants are read from the chain at that moment.
3. Play Counter Bout. When the round ends, the result screen names the round's ENS name. About half a minute later `/name/<round name>` shows it, and `rival.taksh-games.eth` points at it.
