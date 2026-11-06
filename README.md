# Taksh

Type a game idea, or pick one of thirteen games, then play it with your body through a webcam. Every game is a template, so its world, characters and art style can all be changed. 0G, Arkiv and ENS come in a later pass.

## Run it

```bash
npm install
npm run setup          # copies the MediaPipe runtime and fetches the pose models into public/
cp .env.example .env.local   # add ANTHROPIC_API_KEY for real generation
npm run build && npm start   # or: npm run dev
```

Open http://localhost:3000. The input lab is at `/debug`. `/debug/rig` shows the characters, and `/debug/stage?template=hop&world=moon&style=toon` plays any combination with its bot.

Without a key the app runs on fixtures and says so on screen. Fixtures match keywords against the game templates, so they exercise the runtime and UI but show nothing about how well a model reads an idea.

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests, plus regression tests on real-footage landmarks |
| `npm run models` | Lists the Claude models this project's credentials can reach |
| `npm run eval` | Runs the prompt set through the pipeline and saves results to `evals/results/` |
| `npm run eval -- --model <id>` | Runs the same set on a second model |
| `npm run e2e` | Plays every game with real key presses in headless Chrome, across every world and style, and measures the picture. Needs a server on port 3100: `npx next start -p 3100` |
| `npm run assets` | Rebuilds `public/assets` from the source packs. See `assets/README.md` |
| `npm run previews` | Recaptures the stills on the game shelf and pickers from the real renderer. Needs a running app: `PORT=3100 npm run previews` |
| `npm run replay -- <trace.json>` | Replays a trace saved from the input lab |

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
| `matka` | Matka Beats | Slash in four directions, on the beat | `←` `→` `↑` `↓` |
| `harmonium` | Harmonium Hop | One hand up, one leg lift | `D` `F` `J` `K` |
| `chop` | Chop Shop | Fast hand swipes through tossed fruit | `Space`, pointer aims |
| `blades` | Blade March | Slash in four directions, guard, then a boss | `←` `→` `↑` `↓` `Space` |
| `corners` | Four Corners | One hand up, one leg lift, both hands up, jump, then a boss | `Q` `E` `Z` `C` `G` `Space` |

Moves are locked to a small set that reads well from far back on a laptop camera: side step, jump, squat, one hand up, both hands up, one leg lift, slash in four directions, punch, guard and running on the spot. New games are built from these.

The first round of each game teaches its moves. A character shows each one on a loop with its key, with a white skeleton over it: the thick limb is the one that moves, and a thin line is the path it takes. The same white skeleton stands over the player's camera picture at their size, and their own tracked skeleton is yellow, so they match one to the other. A live meter shows how close they are, and a move that nearly fires is set to that player's range. In the boxing games the hero's arms follow the player's arms.

A spec is `template + skin + tuning`. The skin picks one of nine worlds (downtown, forest, station, moon, village, sunset, mumbai, marine_drive, diwali), one of six art styles (bright, toon, neon, pixel, comic, clay), and the look of the hero and rival. Tuning is a set of bounded numbers per template. Levels come from a seed, so a model only ever chooses from these lists and can't produce something unplayable.

The camera only works on `http://localhost` or an HTTPS address. The `Network` address Next.js prints is plain HTTP, so browsers block the camera there. Another device needs an HTTPS address.

## Model and prompts

**Not chosen yet.** No credentials were configured, so no prompt has been sent to a real model.

- Provisional default: `claude-opus-5-5`, set in `src/lib/pipeline/provider-claude.js`. Override it with `TAKSH_MODEL`.
- Effort: `low` for intent, `medium` for generate and revise.
- Prompts: `prompts/intent.v2.md`, `prompts/generate.v2.md`, `prompts/revise.v2.md`. Versions are set in `src/lib/pipeline/prompts.js`. The list of templates, worlds, styles and tuning ranges is injected from `src/lib/spec/contract.js`.
- Requests use server-side refusal fallback (`fallbacks: "default"`). Remove it from `provider-claude.js` if you don't want it.

To settle this, add a key and run `npm run eval`. It checks each case for idea preservation, validity, playability and speed, against a budget of 8s for intent and 30s for generate or revise. If Opus misses the time budget, that is the reason to compare a second model with `npm run eval -- --model claude-haiku-5-5`.

## What was tested

**No person has played this on a webcam yet.** The FaceTime camera on the build machine was not used. Movement was tested by feeding video files to Chrome as a fake camera, which runs the real capture, local MediaPipe, calibration and gesture code.

**The exercises the new games depend on are only proven on synthetic bodies:** squat, lean, punch, hook, uppercut, swing, overhead reach, flap, arm pump, guard and all ten poses. Run the drill below before trusting them. Punches depend on MediaPipe's depth estimate, which is the weakest of these.

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

- Keyboard flow: every game played with real key presses across all six worlds and styles, with each picture measured so a blank canvas fails. Also a full round, a revision with a measured change, an idea setting its world and style, one clarifying question, and an unsupported idea both accepted and changed.
- Camera flow on footage, through Lane Guard: calibration, tracking through a full round with no false pause, revise, and replay without recalibrating. The footage is burpees and jumping jacks, so it proves the path, not the new exercises. The pause and resume check from the first slice was not repeated on the new stage.
- Pose tracking reported 27 to 31 frames per second and about 15ms inference on the GPU delegate. Those figures came from headless Chrome on the build machine and a 640x360 feed. Measure again on the demo laptop.

## Measure on the demo laptop

1. Open `/debug`, start the camera, and stand two to three metres back.
2. Run the drill. Each move is prompted six times, and the table counts missed inputs, double counts, wrong moves and moves between prompts.
3. Save the trace. It holds what was prompted, when, what fired, and the totals. A trace can be replayed with `npm run replay`. Traces are for local debugging and record a real body, so keep them in `traces/`, which git ignores. `test/traces/` holds only landmarks from openly licensed footage.
4. Tune `THRESHOLDS` in `src/lib/motion/gestures.js` if needed.

## How it fits together

- `src/lib/spec`: the versioned `GameSpec` contract, its validator, revision comparison and starter specs.
- `src/lib/templates`: the games as pure logic with no drawing or camera, each with a bot, so they can all be played in a test.
- `src/lib/motion`: pose feed, calibration and gesture recognition. Thresholds scale to the player's torso length, or shoulder width when the hips are out of frame, and follow them as they drift closer or further. A punch reads MediaPipe's metric depth and the arm looking short in the image. A game listens only for the moves it binds, and arm games calibrate without seeing the legs.
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

MIT, see `LICENSE`. The code and docs were written with Claude Code, with a person choosing the design and reviewing the result. The Arkiv integration was written by a Claude agent working from Arkiv's docs, and `arkiv/friction.md` is its log. In the app, Claude turns a typed idea into a game spec.

## Known limits

- A punch at the camera is read from MediaPipe's depth estimate and has not been tried on a real person.
- The base bodies come only in superhero proportions in the free tier, so sportswear is painted on in a shader, and the feet are painted rather than modelled as shoes.
- High knees and jumps are separate gestures, and both can bind to "up". A burpee counts when the hands reach the floor, not when the player stands back up.
- GPT and Google Flow image generation are not wired in. Art comes from the CC0 kits, and only 11 of the 82 CC0 Quaternius packs are in. See `assets/README.md`.
- The game rendering moved from Canvas 2D to three.js, because a human rig needs WebGL. The first load of a game fetches 12 to 15 MB of models.
- Pose inference runs on the main thread.
- The API routes have no rate limit, so add one before any public deployment. The Arkiv write routes allow one post every 4 seconds per client, held in memory on one server.
- Scores are what the browser reports. The server checks the spec is a real game, but it can't replay the round.
