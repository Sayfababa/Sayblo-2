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

### ~~Image B2 – `altar.png`~~ (dropped by the owner: takes too much room on phones; altar.png stays in assets/sheets unused)

<!-- old prompt kept for reference -->
### Image B2 (old) (landscape 3:1, e.g. 1536 × 512, magenta)

> [style sentence], wide low stone altar slab seen from the front and slightly above, dark cracked basalt with dried blood running down the sides, a shallow carved basin in the middle, five tall unlit tallow candles standing on the slab at even spacing, iron candle holders, chains hanging from the front edge, flat pure magenta #FF00FF background, no ground, no shadow, no flames

Candles unlit on purpose: the code draws the flames, lets them die and flashes red when an item is corrupted.

### ~~Image B3 – `forge.png`~~ (dropped by the owner, same reason)

### Image B3 (old) (landscape 3:1, e.g. 1536 × 512, magenta)

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

## Package D – Meta progression

Owner rule: **no banner or header pictures for menus** (bounty board, codex, ember points and feats stay compact; they use existing item icons and CSS).
The codex silhouettes are made in CSS from the existing item icons (`filter: brightness(0)`), so they need no art.
Only world art is requested here. Placeholders now: tyrants reuse the area's monster sprite, scaled up (`scale`) and tinted (`tint`) from
`src/content/meta.json`, with a code-drawn crimson sigil at their feet; the Rift Tear, the Blood Moon and the champion casing are Pixi graphics (`src/render/meta.ts`).

### D1 – Area tyrants: `assets/sheets/mon-tyrant-<id>.png` (6 sheets, 2 poses, 3:2, e.g. 1536 × 1024, **magenta `#FF00FF`**)

Format exactly like A1 / `docs/ui-assets.md` section 9: 2 columns × 1 row, same creature, same size, same baseline, facing bottom-right, full body, wide margins.
Cut with `tools/slice_sheets.py` (`MONSTER_POSES`) to `tyrant-<id>.png` / `tyrant-<id>-attack.png`. Code use: add a monster entry per tyrant in
`monsters.json` (copy of the base monster with the new `sprite`) and point `tyrants.list.<area>.monster` at it; set `scale` to 1 and drop `tint`.

Shared prompt (fill in the creature):

> photorealistic pre-rendered 3D character, gritty dark medieval fantasy, physically realistic skin, cloth, bone and metal, cold moonlit night, soft light from top-left, low saturation, muted tones, high detail, no stylization, character sheet with exactly 2 poses of the same creature side by side, 2 columns x 1 row, same size, same scale, feet (or lowest point) on the same baseline, each pose full body and centered in its half with wide empty margins, three-quarter view from about 30 degrees above, facing bottom-right. [CREATURE]. Left pose: standing, menacing, idle. Right pose: attacking to the bottom-right. Nothing pink, purple or violet. Flat pure magenta #FF00FF background, evenly lit, no ground, no shadow, no text

Negative: `cartoon, painterly, stylized, cel shading, outlines, cute, saturated colors, glow, particles, ground, floor, cast shadow, text, frame, cropped`

| id (area) | Name | [CREATURE] |
|---|---|---|
| `gallows-field` | The Hanged Reeve | a tall gaunt floating corpse of a village reeve, a broken noose still around his stretched neck with a length of frayed rope trailing behind, grey-blue frost-bitten skin, tattered dark wool coat with a tarnished chain of office, hollow pale eyes, long bony hands; below the knees the body ends in torn coat tails hanging down, hovering above the ground. Attack: both hands thrust forward, rope whipping |
| `weeping-mire` | Old Brackwater | a huge armoured bog beetle the size of an ox, black-green shell crusted with peat, moss and dead reeds, small dull blue-white sparks crawling between the shell plates (no glow on the background), heavy mandibles, six thick jointed legs. Attack: rearing up with mandibles open |
| `cinder-hollow` | Ashmaw | a gaunt kiln-hound twice the size of a wolf, body of cracked charcoal-black hide with thin dull orange ember seams, a long jaw full of blackened teeth, a collar of rusted chain, smoke-stained bristles along the spine. Attack: lunging with jaws wide open |
| `stormwatch-ruins` | Corvane the Stormherald | a giant black crow-like bird with a wingspan of a man, ragged storm-torn feathers, a cracked bone mask over its beak, iron rings bound to its legs, faint pale violet-white sparks only on the feather tips. Left pose: perched with wings half spread. Right pose: diving to the bottom-right, talons forward |
| `rimefrost-crypt` | The Rimebound Abbot | a hulking undead abbot, grey-blue frozen flesh, heavy hooded monk's robe stiff with ice, icicles hanging from the hood and sleeves, a cracked stone reliquary chained to his chest, long frost-white beard. Attack: raising both fists to slam the ground |
| `pale-chapel` | Sister Candlewane | a tall emaciated nun in a stained white habit and a black veil, dozens of half-melted tallow candles fused to her shoulders and a crown of candle stubs on her head (unlit, the flames are drawn in code), wax dripping down the robe, a long iron censer in one hand. Attack: swinging the censer forward |

### D2 – Rift Tear decal: `fx-rift-tear.jpg` (square 1024 × 1024, **black background**, effect image like the other `fx-*.jpg`)

> top-down view of a circular crack torn into dark earth, jagged fissures radiating from the centre, a faint cold violet light deep inside the cracks, small floating stone fragments at the rim, seen from straight above, centred, round overall shape, pure black background outside the circle, no ground texture outside, no text

Code use: drawn additively as an ellipse decal at the tear's centre and radius, replacing the Pixi crack lines in `src/render/meta.ts`.

### D3 – Champion casings: `props-casing.png` (2 × 1, landscape 2:1, **magenta `#FF00FF`**)

> [style sentence], two game prop sprites side by side, 2 columns x 1 row, each centered with wide spacing, three-quarter view from about 30 degrees above. Left: a tall jagged shell of clear blue-white ice crystals, hollow, open in the middle so a figure inside shows through, frost at the base. Right: a tall jagged shell of black cooling lava rock with dull orange glowing cracks, hollow in the middle. Flat pure magenta #FF00FF background, no ground, no shadow, no text

Code use: drawn semi-transparent in front of the trapped champion while its casing holds (`m.mt.encased`), ice for cold/lightning monsters, lava for fire.

### D4 – Blood Moon: `fx-blood-moon.jpg` (square 512 × 512, **black background**)

> a large full moon tinted deep blood red, faint dark craters, thin red haze around it, centred, pure black background, no stars, no clouds, no text

Code use: shown in the top right corner of the scene during a Blood Moon, additive, replacing the glow circle.

## Package C – Rifts

Placeholders now: Rift Guardians are act I monsters drawn 1.9× bigger (`guardian.scale` in `src/content/rift.json`), which reads well and needs no new art.
The pinnacle boss **The Hollow Matriarch** reuses Mother Vesper's sprite tinted violet (`"tint"` in `src/content/monsters.json`).
Keys use the existing `item-key.png` with the tier printed on top. No banner or header pictures for the menus (owner feedback: they take too much room on phones).

### C1 – `assets/sheets/mon-matriarch.png` (pinnacle boss, 2 poses, 3:2, e.g. 1536 × 1024, **magenta `#FF00FF`**)

Format exactly like `docs/ui-assets.md` section 9 and A1 above: 2 columns × 1 row, same figure, same size, same baseline, facing bottom-right, full body, wide margins.
Cut with `tools/slice_sheets.py` (`MONSTER_POSES`) to `matriarch.png` / `matriarch-attack.png`; then set `"sprite": "matriarch"` and remove `"tint"` for `matriarch` in `src/content/monsters.json`.
She changes element in code (fire → cold → lightning, the light around her is added by the renderer), so the figure itself stays neutral and dark.

> photorealistic pre-rendered 3D character, gritty dark medieval fantasy, physically realistic cloth, bone and metal, cold moonlit night, soft light from top-left, low saturation, muted tones, high detail, no stylization, character sheet with exactly 2 poses of the same figure side by side, 2 columns x 1 row, same size, same scale, feet on the same baseline, each pose full body and centered in its half with wide empty margins, three-quarter view from about 30 degrees above, facing bottom-right. The Hollow Matriarch: a towering, gaunt abbess-like figure twice the height of a man, in long tattered grey-black ceremonial robes with a high stiff collar, a cracked porcelain-white mask with empty eye holes, a tall crown of broken iron spikes, very long thin arms with black-nailed fingers, a hollow cavity in her chest framed by ribs of dark iron, the robe's hem dissolving into dark smoke-like rags. Left pose: standing tall, arms half raised, palms open. Right pose: casting, leaning forward, one arm thrust out towards the bottom-right, fingers spread. Nothing pink, purple or violet. Flat pure magenta #FF00FF background, evenly lit, no ground, no shadow, no text

Negative: `cartoon, painterly, stylized, cel shading, outlines, saturated colors, glow, particles, fire, ice, lightning, ground, floor, cast shadow, text, frame, cropped`

### C2 (optional) – `assets/sheets/props-rift.png` (rift tear, 2 × 1, landscape 2:1, **magenta `#FF00FF`**)

Not used by the code yet. A world prop for the start and the end of a rift run (where the hero steps in and the loot portal after the guardian).
Isometric 30° view like A2, object standing centred at the bottom of its cell.

> [style sentence of section 7], isometric view 30 degrees from above, game prop sprite sheet, 2 columns x 1 row, each object centered in its cell with wide spacing, nothing touches the cell edges, flat pure magenta #FF00FF background, no ground plane, no cast shadows, no glow. Column 1 `rift-arch`: a broken ring of ancient black standing stones, man-high, two of them cracked, carved with worn runes, empty dark space between them. Column 2 `rift-arch-lit`: the same ring of stones, unchanged (the code adds the swirling light).
