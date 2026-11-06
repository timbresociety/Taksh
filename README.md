# Taksh

Type a game idea, or pick one of thirteen games, then play it with your body through a webcam. Every game is a template, so its world, characters and art style can all be changed. Games are generated on 0G Private Computer, inside a TEE. Arkiv and ENS come in a later pass.

## Run it

```bash
npm install
npm run setup          # copies the MediaPipe runtime and fetches the pose models into public/
cp .env.example .env.local   # add OG_API_KEY (or ANTHROPIC_API_KEY) for real generation
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

Games are generated on **0G Private Computer** with `glm-5.3`, on the `private` trust tier. Only TeeML providers can serve those requests, so the model runs inside a TEE and the prompt never leaves the enclave. The provider is `src/lib/pipeline/provider-0g.js`. It calls the 0G Router (`https://router-api.0g.ai/v1`, OpenAI-compatible) with plain `fetch` and needs no SDK.

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

- Prompts: `prompts/intent.v2.md`, `prompts/generate.v2.md`, `prompts/revise.v2.md`. Versions are set in `src/lib/pipeline/prompts.js`. The list of templates, worlds, styles and tuning ranges is injected from `src/lib/spec/contract.js`.
- The Claude path (`provider-claude.js`, default `claude-opus-5-5`) still works with `ANTHROPIC_API_KEY`. It hasn't been run since the colour pattern was added to the shared schema.

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

## Known limits

- A punch at the camera is read from MediaPipe's depth estimate and has not been tried on a real person.
- The base bodies come only in superhero proportions in the free tier, so sportswear is painted on in a shader, and the feet are painted rather than modelled as shoes.
- High knees and jumps are separate gestures, and both can bind to "up". A burpee counts when the hands reach the floor, not when the player stands back up.
- GPT and Google Flow image generation are not wired in. Art comes from the CC0 kits, and only 11 of the 82 CC0 Quaternius packs are in. See `assets/README.md`.
- The game rendering moved from Canvas 2D to three.js, because a human rig needs WebGL. The first load of a game fetches 12 to 15 MB of models.
- Pose inference runs on the main thread.
- The API routes have no rate limit, so add one before any public deployment.
