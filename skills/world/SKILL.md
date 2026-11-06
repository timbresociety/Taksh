---
name: taksh-new-world
description: Turn a player's request for a new Taksh world (a place to play in) into a world made of kit parts the game already has, on top of an existing base world. Use for "make a Goa beach", "a snowy Himalayan road", "a cyberpunk Bandra" and similar requests, in production through GLM-5.3 and when a developer adds a world by hand.
---

# A new world

A world is data: sky and fog colours, light, a road, and which models fill each role a game asks for.
Every game in Taksh works in every world, because games only ask for roles:

| Role | What games do with it |
|---|---|
| far | tall scenery along the horizon and the sides of the road |
| near | small scenery dressing the roadside |
| low | an obstacle the player jumps over |
| high | an overhead bar the player ducks under (optional; the base world's bar stands in) |
| wall | a block the player steps around |
| pickup | the thing the player collects |
| hazard | the thing the player avoids |

## How to answer

1. **Look for a match first.** If an existing world already is the place (a "rainy Mumbai street" is
   `mumbai`), set `decision` to `reuse`, name it in `reuse`, and still fill the world fields with that
   world's look so the player sees what they would get.
2. **Pick the base world** whose layout, roadside lines and backdrop are closest: `marine_drive` for a
   sea front, `forest` or `sunset` for nature, `downtown` for a city, `station` or `moon` for space,
   `village` for old houses, `mumbai` for a busy Indian street, `diwali` for a festival night.
3. **Paint it.** Sky is two colours, top then horizon. The haze matches the horizon. Night worlds keep a
   bright accent and a road line that stands out from the road. The road line and the accent must each
   be clearly lighter or darker than the road colour, or the lanes vanish.
4. **Cast the roles** using only the parts listed for that role in the catalogue, written exactly as
   listed (including any `@height`). A pickup and a hazard must look different. Choose parts that tell
   the place: palms and kulfi carts for a beach, pines and rocks for a mountain.
5. **Light it.** Sun power 0.8 to 4, fill power 0.8 to 2.2. Evening and night lower the sun and
   warm or cool the fill.

Name the world in one to three words. The blurb says what the player will see, in under twelve words.

## Checks the code runs

The id, colours and ranges are checked, every part must come from the catalogue for its role, the
lane lines and accent need contrast against the road, and the pickup and hazard must differ. A world
that fails comes back to you once with the list of problems.

## When data is not enough

If the place needs a model the catalogue does not have (a lighthouse, a specific temple), still make
the closest world from what exists, and write the missing models in `needs`. A developer adds them as
procedural props in `src/lib/stage/props/` following `docs/new-world.md`, checks them with
`npm run world:check -- <world>` and looks at `e2e-shots/world-<world>.png` before shipping.
