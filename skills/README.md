# Request skills

Players ask Taksh for things it does not have yet: a world, an art style, a character, a boss, a whole
new game. Each kind of request has a skill here. A skill is the know-how for that kind of request,
written once and used in two places:

- **In production**, `src/lib/requests/prompt.js` reads `shared.md` and the kind's `SKILL.md` into the
  system prompt for GLM-5.3, adds the live catalogue (worlds, styles, kit parts, gestures, templates),
  and asks for one JSON object. Code checks the object; the model never has the last word.
- **In development**, a coding agent building a queued boss or game reads the same file before it
  writes code, so the person who builds it follows the same rules as the model that drafted it.
  `.claude/skills/` links to these folders, so Claude Code finds them by name.

| Kind | Skill | Result | Playable now? |
|---|---|---|---|
| world | `world/SKILL.md` | a world made of parts the game already has, on top of an existing world | yes |
| style | `style/SKILL.md` | an art style: a material and one full-screen pass, inside safe ranges | yes |
| character | `character/SKILL.md` | a hero outfit from the bodies, hair and colours the game has | yes |
| boss | `boss/SKILL.md` | a boss design for Blade March and Twin Sights, plus the closest boss to fight today | queued for a build |
| game | `game/SKILL.md` | a game design on reliable body moves, plus the closest game to play today | queued for a build |

A request runs as a durable workflow (`src/workflows/request.js`), because a thinking model can take
minutes. The workflow, its steps and its limits are described in `docs/user-requests.md`.

When a skill learns something (a move that tracks badly, a colour pair that disappears, a boss that
nobody understands), change the skill, not just the code, so the next request benefits.
