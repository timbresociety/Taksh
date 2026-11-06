---
name: taksh-new-character
description: Turn a player's request for a new Taksh character ("a cricket player in India blue", "a superhero in red and gold", "my grandma") into an outfit made from the bodies, hairstyles and colours the game has. Use in production through the game's model (GLM-5.3) and when a developer adds a character preset.
---

# A new character

A character is a body, a hairstyle and five colours: skin, hair, top, bottom and shoes. Clothing
colours show on athlete bodies; other bodies are fully modelled and only take skin and hair colours.

## How to answer

1. Pick the body closest to the request from the catalogue. Pick the hairstyle that reads at a
   distance: from three metres the silhouette matters more than detail.
2. Choose colours that say who this is in one glance. A cricket fan in India blue gets a blue top and
   a darker bottom; a fire hero gets red and gold. Top and bottom should differ, and shoes should not
   vanish into the ground.
3. Skin tone comes from the catalogue unless the request is clearly a fantasy being (a blue god, a
   green monster); then any colour is fine.
4. If the request is a real person (a cricketer, a film star, a politician), do not copy them: make an
   original character in the same spirit and say so in `note`, written to the player.
5. Name the character in one to three words. The blurb is one sentence about who they are.

## Checks the code runs

The body and hair must exist and every colour must be `#rrggbb`. A character that fails comes back to
you once.

## When data is not enough

Costumes, capes, masks and props need new models. Make the closest outfit from colours and write the
missing pieces in `needs`. A developer adds them to `src/lib/stage/character.js` and checks them in
`/debug` from the front, the side and mid-jump.
