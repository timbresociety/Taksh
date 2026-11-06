# Player requests

Players can ask for a new world, art style, character, boss or game from the look screen ("Ask for
something new"). The game's model drafts it, code checks it, and the player gets something to play.
In production that model is GLM-5.3 on the 0G Router's private tier, from the 0G pull request (#1);
the request workflow uses whatever provider `getProvider()` picks, as game generation does.

## What a player gets

| Kind | Result | Playable |
|---|---|---|
| World | a world on top of a base world, cast only from kit parts already used for that role | now |
| Art style | a material mode and one full-screen pass, inside ranges that keep the game readable | now |
| Character | a body, a hairstyle and five colours | now |
| Boss | a design: figure, parts, attacks, tells, phases; plus the closest boss to fight today | after a build |
| Game | a design on reliable body moves, with onboarding, scoring and ramp; plus the closest game | after a build |

Made worlds and styles travel inside the spec (`spec.made.world`, `spec.made.style`), so nothing is
stored on the server. `validateSpec` checks them again on every load, so a client cannot slip in a
world that references a model that does not exist. The browser keeps a small library of what a
player made (`localStorage`, key `taksh.made`), shown beside the built-in worlds and styles.

## How a request runs

A request makes two or three model calls, and any one of them can be slow: a busy private provider, a
rate limit, a long answer. So a request never waits on one HTTP response:

1. `POST /api/requests` with `{ text, kind? }` starts the `handleRequest` workflow
   (`src/workflows/request.js`) and answers `202 { id }` at once.
2. The workflow runs its steps (`src/workflows/request-steps.js`), each in its own function call:
   - **triage** (the provider's short `intent` stage): which kind, decline anything the shared rules
     forbid, restate it.
   - **draft** (the provider's careful `generate` stage): the kind's skill, plus the live catalogue,
     produces one JSON object.
   - **check** (code): `src/lib/requests/kinds.js` and `made.js` check every field.
   - **repair** (`generate` again): once, with the list of problems, if the check failed.
   - **result** (code): ready, queued for a build, declined or failed.
3. The browser polls `GET /api/requests/:id` (2 s, slowing to 8 s). It shows the stage from the run's
   attributes (`reading`, `drafting`, `checking`, `fixing`) and the result when the run completes. A
   pending request id is kept in `localStorage`, so a reload or a closed tab picks it back up.

Waiting is handled at three levels:

- **Each model call** has the provider's own timeout (120 s on 0G, which also retries a 429, 502 or
  503 once by itself) inside a Vercel function's 300 s.
- **Each step** is retried up to three times, ten seconds apart, on a timeout, a rate limit, a busy
  provider, a server error or malformed JSON. A key or balance problem (401, 402, 403) or another
  4xx is not retried (`classify` in `request-steps.js`). A step that has succeeded is never run
  again, even if the workflow replays.
- **The player** sees each stage as it happens and can keep playing; after 20 minutes the panel
  stops polling and says so, while the run finishes on its own.

Failures reach the player as what to do next, never as provider detail. The reason is in the run's
log: a key or account problem says making is switched off, a refused request says to ask for
something else, and anything else says to try other words.

## Skills

The know-how for each kind lives in `skills/` (see `skills/README.md`): `shared.md` holds the rules
for every request (originality, reuse before build, reliable body moves, onboarding), and each kind
has a `SKILL.md`. Production reads them into the system prompt, without their front matter; Claude
Code finds them through `.claude/skills/taksh-new-*`. Change the skill when a lesson is learned.

Each kind's answer has a strict JSON Schema, sent through the provider's structured output. The
schemas use only `type`, `properties`, `required`, `additionalProperties`, `items` and `enum`, which
both Claude and the 0G router accept; colours, ranges and counts are checked in code instead. The
schemas live with the checks in `kinds.js`.

## Setup

- The provider comes from `getProvider()`: with the 0G pull request merged, `OG_API_KEY` selects
  GLM-5.3 on 0G's private tier; otherwise Claude with `ANTHROPIC_API_KEY`; otherwise fixtures.
  Neither key is set on the Vercel project today, so the live site runs on fixtures.
- Without a key, everything runs on labelled fixtures. `TAKSH_FIXTURE_DELAY_MS=4000` makes each
  fixture call slow, to try the waiting screens.

Workflow runs on Vercel need no database: the Workflow SDK keeps runs, steps and results. Locally
they live in `.next/workflow-data`.

## The build queue

Boss and game designs finish with `outcome=queued`. List them, newest first:

```bash
npx workflow inspect runs --attribute outcome=queued --backend vercel --project taksh --team timbresocietys-projects
npx workflow inspect run <run_id> --backend vercel --project taksh --team timbresocietys-projects
```

A developer, or Claude Code with the `taksh-new-boss` or `taksh-new-game` skill, builds a queued
design by following the "Building it" section of that skill. `npx workflow web` shows local runs.

## Not done yet

- No request has been sent to a real model: there was no key. The steps were tested on fixtures,
  slowed down, and against a stand-in that refuses with a 401. Once `OG_API_KEY` is set, send a
  handful of real requests of each kind before opening this to players, and read what comes back.
- Made worlds and styles are checked by code, not by eye. A model can still pick colours that pass
  the contrast checks and look wrong. `npm run world:check` takes a world id from `WORLD_LOOKS`; it
  does not yet render a made world.
- Nothing limits how many requests one player can send. Each costs two or three GLM calls.
