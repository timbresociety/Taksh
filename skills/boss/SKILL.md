---
name: taksh-new-boss
description: Turn a player's request for a new enemy or boss in Taksh ("a ten-armed robot", "a monsoon crocodile", "the traffic police uncle") into a boss design for Blade March and Twin Sights that a developer can build, plus the closest existing boss to fight today. Use in production through GLM-5.3, and as the build guide when a developer codes a queued boss.
---

# A new boss

Blade March and Twin Sights end with a boss. A boss is logic plus a figure:

- **Parts** are marks on the figure, knocked out one at a time in order (Ravana's heads, the giant's
  hands and calves, the serpent's storm knots). The last part is the one that ends the fight, so make
  it the face or heart. Between 3 and 10 parts; more parts is a longer fight.
- **Moods**: it opens by entering (`enter`) or asleep (`sleep`, hit it before it wakes); then it rests
  (`idle`), winds up an attack (`windup`), and may be stunned (`stun`) after a blocked blow. `exposed`
  lists the moods in which its open part can be hit.
- **Attacks** each have one answer the player already knows:
  - `sweep`, `slam`, `wave`: heavy blows. The player guards (both fists up) or, in Blade March,
    jumps or ducks in time.
  - `volley`: something thrown at one side. The player slashes that side to knock it away.
- **Phases**: three lists of attacks, one per third of its parts lost, getting meaner as it breaks.
  `restMs` is the pause before each attack in each phase: three numbers from about 2600 down to no
  less than 1200, because a tired player needs time.
- **Toughness** 1 to 2 multiplies the hits each part takes.

## How to answer

1. If an existing boss is the request (a demon king with many heads is Ravana), set `decision` to
   `reuse` and fill the design with that boss.
2. Make it original. Folklore and mythology are fine; characters from games, films and comics are not.
   A request for a famous villain becomes your own boss in the same spirit.
3. Describe the figure so a modeller can build it: silhouette first (tall, wide, long), then the parts
   in the order they fall, each with where it sits on the body.
4. Every attack must read from three metres before it lands: say what the wind-up looks like (raises
   both arms, coils back, glows on one side) in `tells`.
5. Keep the moves to the four the player already uses in these games: slash left, slash right, guard,
   and in Blade March jump and duck. Never ask for a new move just for a boss.
6. Pick `standIn`: the existing boss (1 Ravana, 2 Kumbhakarna, 3 Monsoon Serpent) that fights most like
   yours, so the player can play something now.

## Checks the code runs

Parts, moods, attacks, phases, rest times and toughness are checked against the ranges above, and the
stand-in must exist. The design is then queued for a build; it is not playable until a developer
builds the figure.

## Building it (for the developer)

1. Add the entry to `BOSSES` in `src/lib/templates/bosses.js` with its parts as `[x, y, bone?]` in a
   box from -1 to 1, and extend the `boss` field of `BOSS_TUNING`.
2. Draw the figure in `src/lib/stage/views/blades.js` and `src/lib/stage/views/sights.js`, with a
   visible tell for each attack and a mark on the open part.
3. Run `npm test`, then play it by keyboard and by camera in both games: the first phase must be
   beatable by someone who has never seen it, and the HUD must name every answer ("Guard", "Slash
   left").
