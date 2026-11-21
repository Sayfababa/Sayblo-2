# Asset requests

Images the code currently draws as placeholders. Same rules as `docs/ui-assets.md` sections 7 and 9:
photorealistic pre-rendered dark fantasy, cold moonlight from top-left, no text, no cast shadow, no glow on the background
(light, sparks and particles are done in code).

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
