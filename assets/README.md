# Assets

Everything in `public/assets` is by [Quaternius](https://quaternius.com) under CC0 1.0, so it can be committed and shipped with no attribution required. `catalog.mjs` lists each file and the pack it came from. `public/assets/manifest.json` lists every model name.

| File | Models | From |
| --- | --- | --- |
| `character/*` | 2 bodies, 8 hair and brow parts, 4 outfits | Universal Base Characters, Modular Character Outfits Fantasy |
| `anim/*` | 85 clips on one shared skeleton | Universal Animation Library 1 and 2 |
| `kit/nature` | 68 | Stylized Nature MegaKit |
| `kit/props` | 94 | Fantasy Props MegaKit |
| `kit/scifi` | 219 | Sci-Fi Essentials Kit, Modular Sci-Fi MegaKit |
| `kit/city` | 153 | Downtown City MegaKit |
| `kit/village` | 176 | Medieval Village MegaKit |

## Rebuilding

Download the free Standard tier of each pack from itch.io and unzip it to `.asset-src/itch/<pack>/unz`. That folder is ignored by git. Then:

```bash
npm run assets            # everything
npm run assets -- kit/    # only ids starting with kit/
```

The script merges each kit into one GLB with a named node per model, compresses textures to WebP and compresses geometry with meshopt. Worlds reach models by name, as in `city:Prop_Bollard@0.9`.

- `Decal_Line_90` is skipped: its `.bin` is missing from the source zip.
- `kit/city` sets `maskColours`, because that pack uses vertex colour as a weathering mask for an Unreal material. Left in, it draws as red smears.

## What is not here

Quaternius lists 83 packs. 82 are CC0; Bestiary is not, so it is excluded. The paid Source tiers are excluded too.

- **In:** the 11 CC0 packs hosted on itch.io. `3dcardkitfantasy` was downloaded but no game uses it yet.
- **Not in:** the other 71 CC0 packs. They are hosted on Google Drive, which refuses downloads with "Quota exceeded", even for a licence file. Many are FBX or OBJ only and would need converting.

Mixamo clips can't go here: its licence does not allow redistribution in a public repository.
