# Player requests

Players can ask for a new world, art style, character, boss or game from the look screen ("Ask for
something new"). GLM-5.3 drafts it, code checks it, and the player gets something to play.

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

GLM-5.3 always thinks before answering, and at high effort that can take minutes. So a request never
waits on one HTTP response:

1. `POST /api/requests` with `{ text, kind? }` starts the `handleRequest` workflow
   (`src/workflows/request.js`) and answers `202 { id }` at once.
2. The workflow runs its steps (`src/workflows/request-steps.js`), each in its own function call:
   - **triage** (GLM, low effort): which kind, decline anything the shared rules forbid, restate it.
   - **draft** (GLM, high effort): the kind's skill, plus the live catalogue, produces one JSON object.
   - **check** (code): `src/lib/requests/kinds.js` and `made.js` check every field.
   - **repair** (GLM, high effort): once, with the list of problems, if the check failed.
   - **result** (code): ready, queued for a build, declined or failed.
3. The browser polls `GET /api/requests/:id` (2 s, slowing to 8 s). It shows the stage from the run's
   attributes (`reading`, `drafting`, `checking`, `fixing`) and the result when the run completes. A
   pending request id is kept in `localStorage`, so a reload or a closed tab picks it back up.

Waiting is handled at three levels:

- **Each model call** is streamed, so the connection stays busy while GLM thinks, and is cut at
  `GLM_TIMEOUT_MS` (240 s by default, under a Vercel function's 300 s).
- **Each step** is retried up to three times on a timeout, a broken stream, a rate limit (after the
  `Retry-After` the API sends) or a server error. A 4xx other than 429 is not retried. A step that
  has succeeded is never run again, even if the workflow replays.
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

GLM's API has a JSON mode but no schema mode, so each kind's JSON Schema is written into the system
prompt and the answer is checked in code. The schemas live with the checks in `kinds.js`.

## Setup

- `ZAI_API_KEY`: the Z.ai key, server-side only. With it set, GLM-5.3 answers every model call,
  including game ideas, and Claude is not used. Add it on Vercel with
  `vercel env add ZAI_API_KEY production` (and `preview` if previews should use it).
- Optional: `GLM_MODEL` (default `glm-5.3`), `GLM_BASE_URL` (default `https://api.z.ai/api/paas/v4`;
  Z.ai lists a separate base for its coding plan), `GLM_TIMEOUT_MS` (default 240000).
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

- No request has been sent to the real GLM-5.3 API: there was no key. The provider was tested with
  a stand-in server that streams reasoning for eight seconds, refuses with a 401 and so on. Send a
  handful of real requests of each kind before opening this to players, and read what comes back.
- Made worlds and styles are checked by code, not by eye. A model can still pick colours that pass
  the contrast checks and look wrong. `npm run world:check` takes a world id from `WORLD_LOOKS`; it
  does not yet render a made world.
- Nothing limits how many requests one player can send. Each costs two or three GLM calls.
