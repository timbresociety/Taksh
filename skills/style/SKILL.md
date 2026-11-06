---
name: taksh-new-style
description: Turn a player's request for a new Taksh art style ("make it look like a watercolour", "80s VHS", "black and white noir") into a style built from the renderer's material modes and its one full-screen pass, inside ranges that keep the game readable. Use in production through GLM-5.3 and when a developer adds a style by hand.
---

# A new art style

A style is two things: how every material is redrawn, and one full-screen pass over the finished
picture. It changes how the whole game looks without touching any model.

**Material** (pick one):
- `standard`: lit, glossy 3D, as the models were made.
- `toon`: flat colour bands, good with ink outlines.
- `clay`: matte and soft, nothing shines.
- `neon`: models go dark and their colours glow. Pair it with bloom and a dark sky.

**The pass** (every field is a number; 0 turns an effect off):
- `saturation` 0 to 1.6: 1 is unchanged, 0 is black and white.
- `vignette` 0 to 0.5: darkens the corners.
- `ink` 0 to 1 with `inkColour`: outlines around shapes.
- `posterise` 0, or 3 to 12: fewer colour steps; lower is more poster-like.
- `halftone` 0 to 1: comic-book dots.
- `pixel` 0, or 2 to 8: chunky pixels; above 6 the far scenery turns to mush.
- `grain` 0 to 0.08: film grain.

Then `bloom` 0 to 1 (glow around bright things), `exposure` 0.7 to 1.3 and `light` 0.25 to 1.2 (how
strongly the world is lit).

## How to answer

1. If an existing style already is the look, set `decision` to `reuse` and name it.
2. Otherwise start from the closest `base` style and change only what the request needs.
3. Keep it playable. The player has to see the next obstacle from three metres while moving: do not
   stack heavy pixels, posterise and grain together; keep `exposure × light` at 0.5 or more (neon may
   go darker, because its models glow); a dark style needs bloom or ink so shapes still read.
4. Name it in one or two words. The blurb says how it looks, in under ten words.

## Checks the code runs

Every number is checked against the ranges above, `inkColour` must be a colour, and very dark or very
noisy combinations are refused. A style that fails comes back to you once with the problems.

## When data is not enough

Some looks need a new shader (watercolour bleeding, a CRT curve). Make the closest style the pass
allows and write what is missing in `needs`. A developer adds it as a new uniform in `StylePass`
(`src/lib/stage/styles.js`), adds it to `STYLES` in `src/lib/spec/contract.js` with a preview
(`npm run previews`), and checks a game in every world.
