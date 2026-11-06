---
name: taksh-new-game
description: Turn a player's idea for a game Taksh cannot already make into a game design on body moves that track reliably on a webcam, with onboarding, scoring and a difficulty ramp, plus the closest template to play today. Use in production through the game's model (GLM-5.3), and as the build guide when a developer codes a queued game as a new template.
---

# A new game design

Most ideas are an existing template in a new skin; those go through the normal game generator, not
here. This skill is for the rest: a loop no template has.

## How to answer

1. **Try the templates first.** If a template in the catalogue plays the idea with a different world,
   style or tuning, set `decision` to `reuse` and name it in `closest`. Say why in `whyNew` either way.
2. **Pick the moves.** Use only gestures from the catalogue, and only the reliable ones (see the shared
   rules). One to four moves is best; six is the limit. Each move has a job in the game, a one-line cue
   and a keyboard key. Jump means up, squat means down.
3. **Pick the framing.** Any jump, squat, step or leg move needs `full`. Arms only can be `upper`.
4. **Write the loop** in two or three sentences: what comes at the player, what they do, what happens
   when they do it right and wrong.
5. **Write the onboarding** as three to five steps covering the first twenty seconds: what appears,
   which move is named on screen, when the second move is introduced.
6. **Score and ramp.** What earns points, what a combo is, how it gets harder (faster, denser, a
   second move) and when, and how a round ends (a clock, lives or a finish line). Rounds last 30 to 150
   seconds.
7. **Name it** in one to three words, original. The pitch is one sentence to the player.
8. **Risks**: what could go wrong on a real webcam (a move the camera could miss, a pace that wears
   people out) and how the design avoids it.

## Checks the code runs

Every move must be a known, reliable gesture and the framing must fit the moves; keys must be unique;
the closest template must exist; the round length must be in range. The design is then queued for a
build, and the player is offered the closest template to play now.

## Building it (for the developer)

A template is plain logic in `src/lib/templates/<id>.js` with `{ id, name, pitch, kind, space, length,
framing, score, actions, bindings, tuning, create, act, step, hud, result, bot }`, and a view in
`src/lib/stage/views/`. Copy the template closest to the design. Then:

1. Give every action a key and every binding a gesture; reuse `strikeActions` and `strikeBindings` from
   `shared.js` for slash, jump and duck games.
2. Make `hud()` name the next move, and make `bot()` play the game, so `simulate()` can prove a skilled
   player scores and validation accepts generated specs.
3. Add tests next to the others in `test/`, run `npm test` and `npm run e2e`, then play it by keyboard
   and by camera before shipping.
