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

- The registrar wallet holds `ROLE_REGISTRAR` on the game registry and nothing else. It can issue a new name. It can't change, remove or take back a published game.
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

## How it fits together

- `src/lib/spec`: the versioned `GameSpec` contract, its validator, revision comparison and starter specs.
- `src/lib/templates`: the games as pure logic with no drawing or camera, each with a bot, so they can all be played in a test.
- `src/lib/motion`: pose feed, calibration and gesture recognition. Thresholds scale to the player's torso length, or shoulder width when the hips are out of frame, and follow them as they drift closer or further. A punch reads MediaPipe's metric depth and the arm looking short in the image. A game listens only for the moves it binds, and arm games calibrate without seeing the legs.
- `src/lib/pipeline`: clarify, generate and revise, with validation and one repair attempt. Credentials stay on the server.
- `src/lib/stage`: the three.js renderer. `worlds.js` and `styles.js` are data plus one post-processing pass, `views/` draws each template, and `character.js` builds a rigged human whose 65-bone skeleton plays every clip in the animation library.

## Known limits

- A punch at the camera is read from MediaPipe's depth estimate and has not been tried on a real person.
- The base bodies come only in superhero proportions in the free tier, so sportswear is painted on in a shader, and the feet are painted rather than modelled as shoes.
- High knees and jumps are separate gestures, and both can bind to "up". A burpee counts when the hands reach the floor, not when the player stands back up.
- GPT and Google Flow image generation are not wired in. Art comes from the CC0 kits, and only 11 of the 82 CC0 Quaternius packs are in. See `assets/README.md`.
- The game rendering moved from Canvas 2D to three.js, because a human rig needs WebGL. The first load of a game fetches 12 to 15 MB of models.
- Pose inference runs on the main thread.
- The API routes have no rate limit, so add one before any public deployment.
