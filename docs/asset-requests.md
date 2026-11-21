# Asset requests (endless-play packages)

Images the new features need. Until they exist, the game draws placeholders in code (CSS / Pixi).
Same rules as `docs/ui-assets.md` sections 7 and 9: photorealistic pre-rendered dark fantasy, soft light from the top left,
low saturation, **magenta `#FF00FF` background** for props and icons, no text, no frames, no cast shadows.
Sheets are grids with wide spacing so `tools/slice_sheets.py` can cut them (add the sheet to its tables, magenta key).

Shared style sentence:

> photorealistic pre-rendered 3D look, gritty dark medieval fantasy, physically realistic materials, cold moonlit night, soft light from top-left, low saturation, muted tones, high detail but calm, no stylization

Negative prompt (if possible): `cartoon, painterly, stylized, cel shading, outlines, saturated colors, text, frame, cast shadow, ground plane`

## Package B – Economy

Placeholders now: materials are CSS diamonds/dots (`.mat` in `src/ui/economy.css`), embers are CSS glowing coals (`.emb`),
the altar is a CSS slab with five CSS candles, the forge has no picture yet.

### Sheet B1 – `icons-economy.png` (3 × 3, square, magenta) → 96 px icons

> [style sentence], game item icon sprite sheet, 3 columns x 3 rows, each object centered in its cell with wide spacing, nothing touches the cell edges, three-quarter view from slightly above, flat pure magenta #FF00FF background, no ground, no shadows

| Row | Column 1 | Column 2 | Column 3 |
|---|---|---|---|
| 1 | `mat-dust`: small heap of grey-brown grave dust with bone splinters | `mat-essence`: small corked glass vial with thick glowing orange-amber liquid | `mat-shard`: jagged dark red crystal shard, cracked, faint inner glow |
| 2 | `ember-change`: fist-sized glowing coal, orange, swirling cracks | `ember-choice`: glowing coal with a single bright golden eye-shaped crack | `ember-whet`: worn grey whetstone with a faint warm edge |
| 3 | `ember-rise`: glowing coal with an upward flame-shaped crack, pale gold | `ember-bind`: glowing coal bound with thin blackened iron wire, yellow-gold glow | `ember-wax`: round blood-red wax seal stamped with a rune, a short strip of parchment |

Cells hold no pink or violet (magenta key). Glow stays inside the objects, not on the background.
Code use: `<img src="sprites/mat-*.png">` / `ember-*.png` in place of the CSS `.mat` and `.emb` elements.

### Image B2 – `altar.png` (landscape 3:1, e.g. 1536 × 512, magenta)

> [style sentence], wide low stone altar slab seen from the front and slightly above, dark cracked basalt with dried blood running down the sides, a shallow carved basin in the middle, five tall unlit tallow candles standing on the slab at even spacing, iron candle holders, chains hanging from the front edge, flat pure magenta #FF00FF background, no ground, no shadow, no flames

Candles unlit on purpose: the code draws the flames, lets them die and flashes red when an item is corrupted.

### Image B3 – `forge.png` (landscape 3:1, e.g. 1536 × 512, magenta)

> [style sentence], blacksmith's anvil and small stone forge seen from the front and slightly above, glowing coals in the forge mouth, hammer and tongs lying on the anvil, soot-blackened bricks, a leather apron hanging on a hook, flat pure magenta #FF00FF background, no ground, no shadow, no smoke, no sparks

Header picture for the forge view (sparks and heat shimmer in code).

### Image B4 – `vendor-parcel.png` (square 512 × 512, magenta)

> [style sentence], a small bundle wrapped in dark stained cloth and tied with twine, sealed with a red wax seal, a paper tag hanging from it, three-quarter view, flat pure magenta #FF00FF background, no ground, no shadow

Shown on the gambling vendor's slot buttons and for unidentified items.

## Package A – Feel

### A1 – `assets/sheets/mon-wretch.png` (Coin-Wretch, 2 poses, 3:2, e.g. 1536 × 1024, **magenta `#FF00FF`**)

Format exactly like `docs/ui-assets.md` section 9: 2 columns × 1 row, same creature, same size, same baseline, facing bottom-right, full body, wide margins.
Cut with `tools/slice_sheets.py` (`MONSTER_POSES`) to `wretch.png` / `wretch-attack.png`; then set `"sprite": "wretch"` and remove `"placeholder": true` in `src/content/monsters.json`.

> photorealistic pre-rendered 3D character, gritty dark medieval fantasy, physically realistic skin, cloth and leather, cold moonlit night, soft light from top-left, low saturation, muted tones, high detail, no stylization, character sheet with exactly 2 poses of the same creature side by side, 2 columns x 1 row, same size, same scale, feet on the same baseline, each pose full body and centered in its half with wide empty margins, three-quarter view from about 30 degrees above, facing bottom-right. A Coin-Wretch: a small, hunched, knee-high grave-robber creature wrapped in filthy grey burial shrouds, thin grey-brown arms, long fingers, a pale pinched face with greedy yellow eyes, dragging a huge sack sewn from old shroud cloth that bulges with coins, a few tarnished gold coins spilling from a tear in the sack. Left pose: crouched, clutching the sack, looking back over its shoulder. Right pose: running away to the bottom-right in mid-stride, sack swinging. Nothing pink, purple or violet. Flat pure magenta #FF00FF background, evenly lit, no ground, no shadow, no text

Negative: `cartoon, painterly, stylized, cel shading, outlines, cute, chibi, saturated colors, glow, particles, ground, floor, cast shadow, text, frame, cropped`

### A2 – `assets/sheets/props-feel.png` (shrines and vault chest, 4 × 2, landscape 2:1, **magenta `#FF00FF`**)

Props in the isometric 30° view of `docs/ui-assets.md` section 7, object standing centred at the bottom of its cell, wide spacing. Cut like `props-gallows` (add the sheet to `SHEETS` and `MAGENTA` in `tools/slice_sheets.py`). The rune colour per shrine is added by the code as light, so the stone itself stays grey and **not glowing**.

> [style sentence of section 7], isometric view 30 degrees from above, game prop sprite sheet, 4 columns x 2 rows, each object centered in its cell with wide spacing, nothing touches the cell edges, flat pure magenta #FF00FF background, no ground plane, no cast shadows, no glow

| Row | Col 1 | Col 2 | Col 3 | Col 4 |
|---|---|---|---|---|
| 1 | `shrine-embers`: weathered standing stone with a carved flame rune, charred base | `shrine-greed`: stone pillar with a carved coin rune, old offering bowl | `shrine-frenzy`: cracked obelisk with a carved claw rune | `shrine-bulwark`: squat stone with a carved shield rune and iron bands |
| 2 | `shrine-fortune`: stone with a carved eye rune and tiny candle stubs (unlit) | `shrine-lore`: stone lectern with a carved open-book rune | `shrine-fury`: stone with a carved fist rune, spikes on top | `chest-vault`: heavy iron-banded oak chest, closed, rusted lock |

Code then: draw `shrine-<id>.png` / `chest-vault.png` in `FeelFx.drawObject` (`src/render/feel.ts`) instead of the Graphics placeholder, keep the coloured rune light.

### A3 (optional) – small buff icons for shrines

Not needed yet; the buff bar uses a CSS rune in the shrine colour. If wanted later: 7 icons 64 × 64 in the style of the skill icons (`icon-*.png`), one per shrine, magenta background.
