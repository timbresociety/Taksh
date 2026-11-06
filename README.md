# Taksh

Type a game idea, then play it with your body through a webcam. This is the first playable slice: type an idea, clarify when needed, generate, calibrate, play, revise and replay. 0G, Arkiv and ENS come in a later pass.

## Run it

```bash
npm install
npm run setup          # copies the MediaPipe runtime and fetches the pose models into public/
cp .env.example .env.local   # add ANTHROPIC_API_KEY for real generation
npm run build && npm start   # or: npm run dev
```

Open http://localhost:3000. The input lab is at `/debug` and the art review is at `/debug/art`.

Without a key the app runs on fixtures and says so on screen. Fixtures match keywords against four canned games, so they exercise the runtime and UI but show nothing about how well a model reads an idea.

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests, plus regression tests on real-footage landmarks |
| `npm run models` | Lists the Claude models this project's credentials can reach |
| `npm run eval` | Runs the prompt set through the pipeline and saves results to `evals/results/` |
| `npm run eval -- --model <id>` | Runs the same set on a second model |
| `npm run e2e` | Plays the keyboard flow in headless Chrome. Needs a server on port 3100: `npx next start -p 3100` |
| `npm run replay -- <trace.json>` | Replays a trace saved from the input lab |

Keyboard controls are always on: `←` `→` move, `A` `D` strike, `↑` up, `↓` down.

The camera only works on `http://localhost` or an HTTPS address. The `Network` address Next.js prints is plain HTTP, so browsers block the camera there. Another device needs an HTTPS address.

## Model and prompts

**Not chosen yet.** No credentials were configured, so no prompt has been sent to a real model.

- Provisional default: `claude-opus-5-5`, set in `src/lib/pipeline/provider-claude.js`. Override it with `TAKSH_MODEL`.
- Effort: `low` for intent, `medium` for generate and revise.
- Prompts: `prompts/intent.v1.md`, `prompts/generate.v1.md`, `prompts/revise.v1.md`. Versions are set in `src/lib/pipeline/prompts.js`. The list of supported gestures, rules and pacing bounds is injected from `src/lib/spec/contract.js`.
- Requests use server-side refusal fallback (`fallbacks: "default"`). Remove it from `provider-claude.js` if you don't want it.

To settle this, add a key and run `npm run eval`. It checks each case for idea preservation, validity, playability and speed, against a budget of 8s for intent and 30s for generate or revise. If Opus misses the time budget, that is the reason to compare a second model with `npm run eval -- --model claude-haiku-5-5`.

## What was tested

**No person has played this on a webcam yet.** The FaceTime camera on the build machine was not used. Movement was tested by feeding video files to Chrome as a fake camera, which runs the real capture, local MediaPipe, calibration and gesture code.

| Movement | Evidence | Result |
| --- | --- | --- |
| Burpee | Real footage, two people | 7 of 7 counted once, none lost tracking |
| Hand out | Real footage, arms during jumping jacks | Fires, but this is not a deliberate punch test |
| Step left and right | Real person's image panned by ffmpeg | Correct order, small sway ignored |
| Jump | Real person's image panned by ffmpeg | 2 of 2 |
| Kick, high knee | Synthetic bodies only | Passes in tests, unproven on real movement |
| Holds and hovering count once | Synthetic bodies, confirmed to fail without hysteresis | Pass |

Also confirmed on the production build:

- Keyboard flow: 12 of 12 checks, covering a clear idea, a perfect round, a revision with measured change, an idle loss on the revised round, one clarifying question, and an unsupported idea both accepted and changed.
- Camera flow on footage: calibration in about 3 seconds, gestures reaching the game, unbound moves shown but ignored, a pause when the person vanished, gestures ignored while paused, resume after a countdown, and revise and replay without recalibrating.
- Pose tracking reported 27 to 31 frames per second and about 15ms inference on the GPU delegate. Those figures came from headless Chrome on the build machine and a 640x360 feed. Measure again on the demo laptop.

## Measure on the demo laptop

1. Open `/debug`, start the camera, and stand two to three metres back.
2. Run the drill. Each move is prompted six times, and the table counts missed inputs, double counts, wrong moves and moves between prompts.
3. Save the results and the trace. A trace can be replayed with `npm run replay` and added to `test/traces/` as a regression test.
4. Tune `THRESHOLDS` in `src/lib/motion/gestures.js` if needed.

## How it fits together

- `src/lib/spec`: the versioned `GameSpec` contract, its validator and revision comparison.
- `src/lib/runtime`: the round engine, plus a simulated player that proves a spec can be cleared and that a revision changed the game.
- `src/lib/motion`: pose feed, calibration and gesture recognition. Thresholds scale to the player's torso length.
- `src/lib/pipeline`: clarify, generate and revise, with validation and one repair attempt. Credentials stay on the server.
- `src/lib/render`: Canvas 2D with six art presets (neon, pixel, comic, papercut, chalk, watercolor) and eight settings.

## Known limits

- Hand strikes are read out to the side. A punch straight at the camera is not detected.
- High knees and jumps are separate gestures, and both can bind to "up". A burpee counts when the hands reach the floor, not when the player stands back up.
- Art is procedural Canvas 2D. GPT and Google Flow image generation are not wired in.
- Pose inference runs on the main thread.
- The API routes have no rate limit, so add one before any public deployment.
