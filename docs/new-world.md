# Adding a world

A world is data plus props. Games ask it for roles such as `low` and `pickup`, so a finished world works in every game. Work through these steps in order.

## 1. Brief

Write down the place in a few lines: its time of day, its palette, and the things only this place has. Name about ten of those things. They are what make it read as that place rather than as a recolour.

## 2. Map the things to roles

| Role | Used for |
| --- | --- |
| `far`, `behind` | Skyline and big buildings |
| `near` | Things beside the road |
| `lines` | Things at a regular spacing, like lamps or a kerb |
| `low`, `wall` | Obstacles to jump and to dodge |
| `pickup` | What the player collects. It must look nothing like a hazard |
| `hazard` | What the player avoids |
| `train`, `ramp` | Long vehicles and ramps in Local Dash |

## 3. Reuse before building

Use what exists first, in this order:

1. A prop already in `src/lib/stage/props/`. See them all at `/debug/props`.
2. A model from the free kits, as `kit:Model`. Sources and licences are in `assets/README.md`.
3. A new prop in code, as `proc:name`, only for the things from step 1 that nothing else can stand in for.

Never use assets ripped from other games.

## 4. Write the entry

Add the world to `WORLDS` in `src/lib/spec/contract.js` and `WORLD_LOOKS` in `src/lib/stage/worlds.js`. The comment at the top of `WORLD_LOOKS` explains every field. Add its words to `WORLD_WORDS` in `src/lib/pipeline/provider-fixture.js`.

## 5. Check it

```
npm test
PORT=3000 npm run world:check -- <world>
```

The tests check that every role is filled with something real and that lane lines read against the road. `world:check` loads every game in the world, plays it, fails on any error or on scenery blocking the road, and writes a contact sheet to `e2e-shots/world-<world>.png`.

## 6. Look at it

The checks can't judge taste. Open the contact sheet and ask:

- Does it read as this place in one glance, with the name hidden?
- Can you tell pickups from hazards at game speed?
- Does it hold up in neon and pixel, not only bright?

Fix what fails and go back to step 5.

## 7. Finish

Run `PORT=3000 npm run previews` and add the world to the list in the README.
