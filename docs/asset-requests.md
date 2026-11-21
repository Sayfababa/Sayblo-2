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
