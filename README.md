# Taksh

Type a game idea, or pick one of twenty-one games, then play it with your body through a webcam. Every game is a template, so its world, characters and art style can all be changed. Games are generated on 0G Private Computer, inside a TEE. Arkiv and ENS come in a later pass.

## Run it

```bash
npm install
npm run setup          # copies the MediaPipe runtime and fetches the pose models into public/
cp .env.example .env.local   # add OG_API_KEY (or ANTHROPIC_API_KEY) for real generation
npm run build && npm start   # or: npm run dev
```

Open http://localhost:3000. The input lab is at `/debug`, and the hand cursor test at `/debug/cursor`. `/debug/rig` shows the characters, and `/debug/stage?template=hop&world=moon&style=toon` plays any combination with its bot, and `&tune=waves:1,boss:1` sets tuning, so a boss can be looked at straight away.

Without a key the app runs on fixtures and says so on screen. Fixtures match keywords against the game templates, so they exercise the runtime and UI but show nothing about how well a model reads an idea.

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests, plus regression tests on real-footage landmarks |
| `npm run models` | Lists the Claude models this project's credentials can reach |
| `npm run eval` | Runs the prompt set through the pipeline and saves results to `evals/results/` |
| `npm run eval -- --model <id>` | Runs the same set on a second model |
| `npm run e2e` | Plays every game with real key presses in headless Chrome, across every world and style, and measures the picture. Needs a server on port 3100: `npx next start -p 3100` |
| `npm run assets` | Rebuilds `public/assets` from the source packs. See `assets/README.md` |
| `npm run previews` | Recaptures the stills on the game shelf and pickers from the real renderer. Needs a running app: `PORT=3100 npm run previews`, or `ONLY=game-keeper` for one still |
| `npm run replay -- <trace.json>` | Replays a trace saved from the input lab |
| `npm run world:check -- <world>` | Checks a world's data, its road and its picture in every game and style, and writes a contact sheet to `e2e-shots/`. Needs a running app: `PORT=3100 npm run world:check -- mumbai` |

## The games

Each game is an original template with its own name, characters, art and levels. Each input is the nearest range-of-motion exercise.

| Template | Game | Your body | Keys |
| --- | --- | --- | --- |
| `lane_runner` | Local Dash | Side step, jump, squat, run on the spot | `←` `→` `↑` `↓` `F` |
| `hop` | Sky Hop | Squat to charge, stand to launch | Hold `Space` |
| `rally` | Baseline Rally | Overhead reach to toss, arm swing | `W` `A` `D` |
| `pads` | Pad Rounds | Jab, cross, hook, uppercut | `J` `K` `U` `I` |
| `bout` | Counter Bout | Punches, side lean, squat | `J` `K` `A` `D` `S` |
| `flyer` | Wing Beat | Lateral arm raise, then beat down | `Space` |
| `poses` | Mirror Match | Hold the pose your character shows | `1` to `0` |
| `guard` | Lane Guard | Side step, run on the spot | `←` `→` `F` |
| `matka` | Matka Beats | Slash left and right, jump and duck, on the beat | `←` `→` `↑` `↓` |
| `harmonium` | Harmonium Hop | One hand up, one leg lift | `D` `F` `J` `K` |
| `chop` | Chop Shop | Fast hand swipes through tossed fruit | `Space`, pointer aims |
| `blades` | Blade March | Slash left and right, jump, duck, guard, then a boss | `←` `→` `↑` `↓` `Space` |
| `keeper` | Last Line | Nine zones of a goal, one move each: a hand up on the diagonal, an arm out, a leg out, both hands up, fists to the chin, squat | `Q` `W` `E` / `A` `S` `D` / `Z` `X` `C` |
| `oars` | Koli Race | Pump your arms to row, bend sideways to steer | `Space`, hold `←` `→` |
| `rickshaw` | Auto Rally | Run on the spot for throttle, bend sideways to steer | `Space`, hold `←` `→` |
| `handi` | Dahi Handi | Jump to climb the tower, both hands up to steady it, jump from the top to smash the pot | `Space` `H` |
| `circuit` | Cardio Circuit | Twenty six exercises called one at a time, covering the whole move library | The key shown for each exercise |
| `sights` | Twin Sights | Ghouls walk up the road; each hand's aim circle shoots the ones on its own half of the screen, squat for a grenade, jump the rolling drum, then a boss | Pointer aims anywhere, `F` sends a sight to each half, `G` `Space` |
| `rangoli` | Rangoli Breaker | A tray on each hand keeps the ball in play until the pattern breaks | Pointer aims, `←` `→` |
| `dabba` | Dabba Catch | A hand reaches falling tiffins of its colour, and keeps clear of trouble | Pointer aims, `Space` |
| `popup` | Pop-Up Patrol | A hand reaches monkeys in windows and potholes before they hide | Pointer aims, `Space` |

Moves are locked to a small set that reads well from far back on a laptop camera: side step, jump, squat, one hand up, both hands up, one leg lift, slash in four directions, punch, guard and running on the spot. New games are built from these.

The first round of each game teaches its moves. A character shows each one on a loop with its key, with a white skeleton over it: the thick limb is the one that moves, and a thin line is the path it takes. The same white skeleton stands over the player's camera picture at their size, and their own tracked skeleton is yellow, so they match one to the other. A live meter shows how close they are, and a move that nearly fires is set to that player's range. In the boxing games the hero's arms follow the player's arms.

### Inputs

A game reads the body in five ways. There are no clicks, because the tracker can't see fingers, so anything aimed fires by itself.

| Input | What it reads | Used for |
| --- | --- | --- |
| Button | One move, fired once per rep | Every exercise the character can show, from a squat to a wood chop |
| Hold | How long a pose lasts | Squat to charge, guard to block |
| Speed | Beats per second over the last 1.5 s, on three limbs only: running legs, flapping arms, pumping arms | Going faster |
| Tilt | Leaning left or right, from -1 to 1 | Steering |
| Cursor | Each hand as its own pointer, or nothing when that hand is lost | Aiming, swiping, catching, with one hand or both |

`src/lib/motion/catalogue.js` lists every recorded clip against the move it shows. Mountain climbers, plank jacks, push-ups, sit-ups, bear crawls and inchworms are left out on purpose, because a front camera can't read them.

To add a world, follow [docs/new-world.md](docs/new-world.md).

A spec is `template + skin + tuning`. The skin picks one of nine worlds (downtown, forest, station, moon, village, sunset, mumbai, marine_drive, diwali), one of six art styles (bright, toon, neon, pixel, comic, clay), and the look of the hero and rival. Tuning is a set of bounded numbers per template. Levels come from a seed, so a model only ever chooses from these lists and can't produce something unplayable.

The camera only works on `http://localhost` or an HTTPS address. The `Network` address Next.js prints is plain HTTP, so browsers block the camera there. Another device needs an HTTPS address.

## Model and prompts

Games are generated on **0G Private Computer** with `glm-5.3`, on the `private` trust tier. Only TeeML providers can serve those requests, so the model runs inside a TEE and the prompt never leaves the enclave. The provider is `src/lib/pipeline/provider-0g.js`. It calls the 0G Router (`https://router-api.0g.ai/v1`, OpenAI-compatible) with plain `fetch` and needs no SDK.

The idea can also be spoken. "Say it" records up to 15 s in the browser, and `/api/transcribe` sends it to `whisper-large-v3` on the same private tier. The words land in the idea box to read and fix before "Make my game". A 4 s idea costs $0.00052. The button shows only when 0G is the provider. The route refuses non-audio and anything over 1 MB, and allows 20 a minute.

- **Order.** The app picks 0G when `OG_API_KEY` is set, then Claude, then labelled fixtures. `TAKSH_PROVIDER=0g|claude|fixture` forces one. `OG_MODEL` changes the model, which must have a TeeML provider.
- **Receipts.** Every reply carries `x_0g_trace` with a request ID, the provider's on-chain address and the cost. The pipeline returns these as `traces`, and the brief and result screens show the call count, total cost and last request ID.
- **Request shape.** Strict JSON schema output, thinking off, and a price ceiling on every call (`X-0G-Provider-Max-Price-Usd-*`). A `402` (empty balance), `429` or `503` becomes a message the player can act on. `429` and `5xx` are retried once.
- **What breaks without 0G.** Taksh can't turn an idea into a game. You're left with 13 starter games and keyword fixtures.

Eval on 2026-11-06 (`npm run eval -- --provider 0g`, 20 cases, saved in `evals/results/`):

| Setting | Passed | Generate time | Cost per game |
| --- | --- | --- | --- |
| Thinking on, no colour pattern | 7/20 | 21 to 113 s | about $0.014 |
| Thinking off, `#rrggbb` pattern in the schema | 17/20 | 5 to 12 s | about $0.003 |

With thinking on, 8 of 20 games failed validation on the first try, all because of colours that weren't `#rrggbb`. Each one needed a repair call. The three cases still failing are judgment calls. One idea got a question when it should have become a game, one became a game when it needed a question, and one became a game when it should have been marked unsupported.

- Prompts: `prompts/intent.v3.md`, `prompts/generate.v2.md`, `prompts/revise.v2.md`. Versions are set in `src/lib/pipeline/prompts.js`. The list of templates, worlds, styles and tuning ranges is injected from `src/lib/spec/contract.js`.
- The Claude path (`provider-claude.js`, default `claude-opus-5-5`) still works with `ANTHROPIC_API_KEY`. It hasn't been run since the colour pattern was added to the shared schema.

## 0G rival in Counter Bout

With 0G connected, the Counter Bout rival only throws shots its 0G brain planned. This is our Physical AI entry, written up against the track's requirements in `docs/physical-ai.md`. Every few seconds the browser sends the fight so far to `/api/rival/decide`: health, time left, and which recent shots the player dodged. `glm-5.3` on the private tier returns the next three shots, a taunt and a read on the player. Each decision costs about $0.0004 and takes 3 to 5 s. The rival asks again while one shot is still queued.

- **Safe stop.** If 0G errors or takes over 6 s, no plan arrives, so the rival holds its guard and throws nothing. It never makes up a shot, and the HUD says "0G signal lost".
- **Episode log.** `GameSession` records every step's dt, every move and every plan. At the end of a round, `/api/rival/episode` checks each plan against what 0G really returned (by request ID, single use), replays the round, and uploads it to 0G Storage on Galileo testnet. The result screen shows the root hash.
- **Player moves.** The player's keys come from the browser, so the server doesn't take the score on trust. It stores the score from its own replay. It also refuses a round if its decisions come from more than one round ID, if it stops before the round ended, if it leaves out a plan 0G served in time to be played (judged on the server clock), if the game clock runs ahead of the server clock (a fast-forwarded round), if it arrives more than 5 minutes after ending, or if more than 2 dodges land under 120 ms after the windup shows. While the rival guards for lack of a plan, punches don't land, so a browser that stops asking 0G gains nothing. A bot playing at human speed still gets through. Stopping that needs inputs signed on the server as they happen.
- **Ledger.** What 0G returned for each round is kept on Arkiv (`taksh.rival.decisions.v1`), so whichever server instance gets the upload can check it. A stored round gets a `taksh.rival.spent.v1` entity and can't be stored twice. Without `ARKIV_PRIVATE_KEY` the ledger stays in memory, which works on one server.
- **Replay.** `npm run replay-episode -- <rootHash>` downloads the episode with Merkle proof checking, plays it again from the seed, and exits 1 if the score differs.

First stored round (2026-11-06), writer `0x07996A4De073dD64219fb84e05FA048145802aa2`:

| | |
| --- | --- |
| Root hash | `0xd17bfb19d7ae5c2090b8a98aa81abf5e40466d1771372435e973d958aa9dcc7b` |
| Upload tx | [`0x4f56b07a…58bc76`](https://chainscan-galileo.0g.ai/tx/0x4f56b07ab69d300da7783ce7f6de9d398601d4ca33cf7cd7c0899cae0858bc76) |
| 0G decisions | `f3c65784-25cc-4088-a959-d6eda4a6eb5f`, `23aeeff2-d81b-4a5d-aa6d-6e6339d63471` |
| Replay | 873 steps, win, score 3000, matches the stored result |

The rival's second read was "Never dodges left; leads with same head-side tell." The test player never leaned right, and the rival kept throwing left.

## What was tested

**No person has played this on a webcam yet.** The FaceTime camera on the build machine was not used. Movement was tested by feeding video files to Chrome as a fake camera, which runs the real capture, local MediaPipe, calibration and gesture code.

**The exercises the new games depend on are only proven on synthetic bodies:** squat, lean, punch, hook, uppercut, swing, overhead reach, flap, arm pump, guard and all ten poses. Run the drill below before trusting them. Punches depend on MediaPipe's depth estimate, which is the weakest of these.

**Straight punches go at the screen.** The old rule was to never ask for a punch straight at the camera, because the camera reads depth worst, and to send punches out slightly to the side instead. The owner overrode it on 2026-11-07: a jab and a cross go toward the screen, as in real boxing, and Pad Rounds holds their pads in front of the player. Depth is still hard to read, so a punch also counts from what the image shows: from a guard, the elbow comes up fast behind the fist to shoulder height and the forearm looks short. A fist going out to the side from guard still counts too.

| Movement | Evidence | Result |
| --- | --- | --- |
| Burpee | Real footage, two people | 7 of 7 counted once, none lost tracking |
| Hand out | Real footage, arms during jumping jacks | Fires, but this is not a deliberate punch test |
| Step left and right | Real person's image panned by ffmpeg | Correct order, small sway ignored |
| Jump | Real person's image panned by ffmpeg | 2 of 2 |
| Kick, high knee | Synthetic bodies only | Passes in tests, unproven on real movement |
| Every new exercise above | Synthetic bodies only | Passes in tests, unproven on real movement |
| Holds and hovering count once | Synthetic bodies, confirmed to fail without hysteresis | Pass |

Also confirmed on the production build:

- Keyboard flow: every game played with real key presses, each in a different world and style so all nine worlds and six styles are covered, with each picture measured so a blank canvas fails. Also a full round, a revision with a measured change, an idea setting its world and style, one clarifying question, and an unsupported idea both accepted and changed.
- Camera flow on footage, through Lane Guard: calibration, tracking through a full round with no false pause, revise, and replay without recalibrating. The footage is burpees and jumping jacks, so it proves the path, not the new exercises. The pause and resume check from the first slice was not repeated on the new stage.
- Pose tracking reported 27 to 31 frames per second and about 15ms inference on the GPU delegate. Those figures came from headless Chrome on the build machine and a 640x360 feed. Measure again on the demo laptop.

## Measure on the demo laptop

1. Open `/debug`, start the camera, and stand two to three metres back.
2. Run the drill. Each move is prompted three times by default, or six for steadier numbers, and the lab shows how long it will take. "Core moves", "Cardio moves" and "Last Line moves" pick a set. The table counts missed inputs, double counts, wrong moves and moves between prompts.
3. Save the trace. It holds what was prompted, when, what fired, and the totals. A trace can be replayed with `npm run replay`. Traces are for local debugging and record a real body, so keep them in `traces/`, which git ignores. `test/traces/` holds only landmarks from openly licensed footage.
4. Tune `THRESHOLDS` in `src/lib/motion/gestures.js` if needed.
5. Open `/debug/cursor` and touch the 24 dots. It reports dots reached, dots missed and average time for each hand, on its own side and across the body, plus how much a still hand wobbles. Results save as `taksh-drill-cursor-*.json`, which git ignores.

## Games as ENS names

Every published game is an ENSv2 subname on Sepolia, such as `moon-hop.taksh-games.eth`, and the game itself is stored in that name's text records. `/play/<name>` resolves the name through the ENS Universal Resolver on every visit, rebuilds the spec from the records, runs it through `src/lib/spec/validate.js` and loads it. There is no copy of a published game anywhere else, so a name that stops resolving is a game that stops loading.

Records on each game name:

| Key | Holds |
| --- | --- |
| `taksh.spec` | The whole spec as JSON, up to 4096 bytes |
| `taksh.template`, `taksh.world`, `taksh.style`, `taksh.title` | Single fields. When one differs from the spec, it wins, so an owner who changes `taksh.world` to `moon` in the ENS app moves the game to the moon |
| `description`, `url` | The objective and the `/play` link, for ordinary ENS clients |

What happens on publish, from the result screen:

1. The registrar wallet deploys a Permissioned Resolver for this one game through the Verifiable Factory. `initialize()` grants every resolver role to the creator and writes the text records in the same transaction. The registrar holds no role on it afterwards.
2. The registrar registers the label in the parent's UserRegistry, with the creator as owner, that resolver, and the same token roles the .eth registrar gives a registrant: set resolver, set subregistry, and transfer.

The creator enters an owner address when publishing. Left blank, the game goes to the parent name's owner. The private key stays in the API route (`src/app/api/ens/route.js`) and never reaches the browser.

Roles, all from ENSv2 Enhanced Access Control:

- The registrar wallet holds `ROLE_REGISTRAR` on the game registry and one text key on the rival's name, below. It can issue a new name. It can't change, remove or take back a published game.
- The parent owner holds only registrar and renew roles and their admins on the game registry, so the registry reports `isEmancipated() == true`. Nobody can unregister a game or swap its resolver except its owner.
- The parent name's own resolver has an ENSIP-26 `agent-context` record that describes the game generator and the record layout above.

Set it up:

```bash
# put ENS_PARENT_NAME, ENS_OWNER_PRIVATE_KEY and ENS_REGISTRAR_PRIVATE_KEY in .env.local
npm run ens:setup
```

The setup registers the parent through the ENSv2 ETH Registrar (commit, a 60 second wait, register), paid in Sepolia MockUSDC, which anyone can mint. It deploys the parent's resolver and the game registry, grants the registrar its one role and sends it 0.01 ETH for gas. Run it again and it skips whatever the chain shows as done. The owner key needs about 0.02 Sepolia ETH. A publish is two transactions, about 5.1M gas in all: 4.5M to deploy the game's resolver and 0.6M to register the name. At 20 gwei that is about 0.1 ETH, so top up the registrar before a busy demo.

Contract addresses come from the Sepolia (ENSv2) table at https://docs.ens.domains/learn/deployments and live in `src/lib/ens/chain.js`. The Universal Resolver address comes from viem, as the ENS docs ask. The parent name and keys come from env. Without them, or with the RPC down, games still play, the result screen says publishing is unavailable, and `/play/<name>` says ENS could not be reached.

The publish route allows 10 publishes a minute across all callers and refuses a spec over 4 KB. A starter spec is about 600 bytes.

Tested on an anvil fork of Sepolia first: setup, two publishes, `/play/<name>` loading both, a taken name refused, and the role checks above read back from the contracts. Then on live Sepolia (2026-11-06):

| | |
| --- | --- |
| Parent | `taksh-games.eth`, registered in [`0x12128e2d…bb26ca`](https://sepolia.etherscan.io/tx/0x12128e2da3dc7986f88381e84a419883d86d3ec93aac658da49f38c813bb26ca), expires 2027-11-06 |
| Game registry | `0xcA36D4cAbC9A10d3fbeFDBc2D4CA7Fa5ce4ecD43`, `isEmancipated() == true` |
| First game | `mumbai-monsoon-bout.taksh-games.eth`, registered in [`0x1b70d81a…2b8e`](https://sepolia.etherscan.io/tx/0x1b70d81acfa561a7ffb04de9843e09f25277238e0b8874df7f4260f3fa9e2b8e), resolver `0x8c560120F72ceD142cdf19f67C3Fde5C28Bf0100` |
| Play | `/play/mumbai-monsoon-bout.taksh-games.eth` loads the game from its text records |

### The rival's own name

The 0G rival in Counter Bout has its own name, `rival.taksh-games.eth`, so the agent has an identity anyone can look up. Its Permissioned Resolver holds:

| Key | Holds |
| --- | --- |
| `agent-context` | ENSIP-26. What the rival is, how it decides on 0G, and where its rounds go |
| `agent-endpoint[web]`, `url` | Where to play it |
| `taksh.rival.model`, `taksh.rival.trust`, `taksh.rival.provider` | `glm-5.3`, `private`, and the 0G TEE provider's address |
| `taksh.rival.last-episode` | The 0G Storage root hash of the latest stored round |

The owner key holds every role on that resolver. The server's registrar wallet holds `ROLE_SET_TEXT` on one resource, `keccak256("taksh.rival.last-episode")`, granted with `grantSetterRoles`. After each stored round, the episode route writes the new root hash there. A `setText` from the same wallet on `agent-context` or any other key reverts with `EACUnauthorizedAccountRoles`. The resolver serves only this name, so the grant reaches no other name.

Set it up after `ens:setup`, and run it again with `TAKSH_URL=<live url>` to point `agent-endpoint[web]` at the deploy:

```bash
npm run ens:rival
```

Live on Sepolia (2026-11-06), tested on an anvil fork first:

| | |
| --- | --- |
| Name | `rival.taksh-games.eth`, registered in [`0x50f56a05…175946`](https://sepolia.etherscan.io/tx/0x50f56a05616630fe272d2af00ae0a4787f9e2cc89b862d7c46289f8a36175946) |
| Resolver | `0xCaea9600A51CE2796816A04262A8ACBc8ECA059B` |
| One-key grant | [`0x7f1ff9e9…1edaa6`](https://sepolia.etherscan.io/tx/0x7f1ff9e928e3825f205e76dd73b2db8288696b438f7d804f8f314d6c7d1edaa6). `hasRoles` reads true for `last-episode`, false for `agent-context` |
| First pointer | [`0xf9413c69…f370a0`](https://sepolia.etherscan.io/tx/0xf9413c69e8527c64bd1283ca9b6c2c0d5afc0a77e9ca2117a99e65e91ef370a0), set to round `0x9ef7bb08…60b32c`, which `npm run replay-episode` plays back to the same score |

## How it fits together

- `src/lib/spec`: the versioned `GameSpec` contract, its validator, revision comparison and starter specs.
- `src/lib/templates`: the games as pure logic with no drawing or camera, each with a bot, so they can all be played in a test.
- `src/lib/motion`: pose feed, calibration and gesture recognition. Thresholds scale to the player's torso length, or shoulder width when the hips are out of frame, and follow them as they drift closer or further. A punch reads the fist going out from guard, the elbow driving up fast behind a fist thrown at the camera, and MediaPipe's metric depth. A game listens only for the moves it binds, and arm games calibrate without seeing the legs.
- `src/lib/pipeline`: clarify, generate and revise, with validation and one repair attempt. Credentials stay on the server.
- `src/lib/stage`: the three.js renderer. `worlds.js` and `styles.js` are data plus one post-processing pass, `views/` draws each template, and `character.js` builds a rigged human whose 65-bone skeleton plays every clip in the animation library.

## Arkiv

Scores and shared games are stored on Arkiv's Rabdi testnet (chain ID 7794095). When a round ends, the result screen reads the leaderboard live from Arkiv. You can narrow it to the same world and style, to this exact game (by spec hash), or to camera play only. Post your score and it becomes an entity, and the board reads again with your row in bold and your rank. "Publish this game" stores the whole spec as an entity. `/games` lists published games straight from Arkiv, and `/games/<entity key>` opens one to play.

Writes go through `/api/arkiv/scores` and `/api/arkiv/games`, signed on the server with `ARKIV_PRIVATE_KEY`. The key never reaches the browser. Reads keep only entities that wallet owns, because anyone can write entities with our schema tag. With no key the board still reads, and with the RPC down the game still plays and the board says it is unavailable. Details are in `arkiv/`, starting with `arkiv/schema.md`.

Writer wallet: `0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30` (testnet dev wallet, fund it at https://hub.arkiv.network/faucet).

A query to run against testnet, the top ten scores across every game:

```bash
curl -s https://rpc.rabdi.db-chain.testnet.arkiv.network -H "content-type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"arkiv_query\",\"params\":[\"arkiv.schema = str('taksh.scores.v1') AND \$owner = addr(0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30) ORDER BY score:i32 DESC\",{\"select\":{\"key\":true,\"attributes\":true,\"count\":true},\"limit\":\"0xa\"}]}"
```

The same board through the app: `curl 'http://localhost:3000/api/arkiv/scores?template=poses'`. The response includes the exact query text sent to the node.

Live on Rabdi testnet (2026-11-06), written by `0x7b78f1303a0c4916B5c9F8A858CbC04F8f808E30`:

| What | Entity key | Tx |
| --- | --- | --- |
| Score, Sky Hop, 4210 | `0xa101e1a7b4a827df18d1fff911bc75d240c836080b490decd7ab78a9b87282a8` | [`0xccc8fc34…1b507`](https://rabdi.explorer.arkiv.network/tx/0xccc8fc34c2d2b937d1fdaf5e10f61c8ffe59f2922b12db4eba0bd4fd5251b507) |
| Published game, Chop Shop | `0xf596b5687d9e58f37928e08ed49096cec6f1594559720ec591b842b31c66485a` | [`0x2d4baa27…de8c4`](https://rabdi.explorer.arkiv.network/tx/0x2d4baa2784ec63feb0e374cc9f5fef560dc294a8d53d22e40348c9f6aa1de8c4) |

Both were read back through `GET /api/arkiv/scores?template=hop` and `GET /api/arkiv/games`.

## Licence and AI use

MIT, see `LICENSE`. The code and docs were written with Claude Code, with a person choosing the design and reviewing the result. The Arkiv integration was written by a Claude agent working from Arkiv's docs, and `arkiv/friction.md` is its log. In the app, `glm-5.3` on 0G Private Computer turns a typed or spoken idea into a game spec and plans the Counter Bout rival's shots. Claude is the fallback model when no 0G key is set.

## Known limits

- None of the moves added for cardio and the rebuilt jab has been tried on a real person. They are tested on simulated bodies and on public footage of burpees and jumping jacks.
- Hand cursor lag and aim across the body have not been measured. Hands raised overhead leave the frame at normal playing distance.
- The base bodies come only in superhero proportions in the free tier, so sportswear is painted on in a shader, and the feet are painted rather than modelled as shoes.
- High knees and jumps are separate gestures, and both can bind to "up". A burpee counts when the hands reach the floor, not when the player stands back up.
- GPT and Google Flow image generation are not wired in. Art comes from the CC0 kits, and only 11 of the 82 CC0 Quaternius packs are in. See `assets/README.md`.
- The game rendering moved from Canvas 2D to three.js, because a human rig needs WebGL. The first load of a game fetches 12 to 15 MB of models.
- Pose inference runs on the main thread.
- The API routes have no rate limit, so add one before any public deployment. The Arkiv write routes allow one post every 4 seconds per client, held in memory on one server.
- Scores are what the browser reports. The server checks the spec is a real game, but it can't replay the round.
