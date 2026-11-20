# Project context

Diablo-like semi-idle ARPG for phone and PC (browser/PWA). Working title **Grimlight** (placeholder name).
The owner writes in **German**; answer in German. In-game text is **English**.

## Where things are

- `docs/ROADMAP.md` – the plan (phases 0–6) and all design decisions. Read it first.
- `src/content/*.json` – all game content (skills incl. passives and tags, gems, monsters, areas, affixes with tiers, items and uniques, difficulties, hero balance). Typed in `src/content/index.ts`.
- `src/sim/` – simulation: fixed ticks (`TICK`), seeded RNG, no DOM, no rendering. Emits `SimEvent`s for renderer/UI. `save.ts` = versioned save + migrations + export/import code.
- `src/render/` – PixiJS renderer (reads sim state + events, interpolates between ticks).
- `src/ui/` – DOM HUD and menus (`ui.ts`, `styles.css`).
- `tests/` – vitest (`npm test`). `scripts/simulate.ts` – headless balancing run (`npm run sim -- 60 1`).
- `public/sprites/` – sprites used by the game (written by `tools/slice_sheets.py`, mirrored to `prototype/sprites/`).
- `docs/assets.md` – art rules for AI-generated images.
- Playtest build: `node scripts/build-artifact.mjs` → `dist-artifact/`, published as artifact https://claude.ai/artifact/LBgXfG93fk3jLj1qnTwc7k (republish after changes so the owner can test).
- `prototype/combat-demo.html` – old single-file demo, kept as reference (reference for feel, numbers and rendering). Published as artifact https://claude.ai/artifact/XcpRjWihoFu52av5PEiG2R
- `prototype/sprites/` – cut sprites used by the demo.
- `assets/sheets/` – original sprite sheets from the owner (green screen; effects on black).
- `tools/slice_sheets.py` – cuts sheets into sprites (green key, trim, seamless grounds). Add new sheets to its tables.

## Decisions already made (do not re-ask)

- Semi-idle: the hero walks, fights and loots fully automatically. No manual movement.
- One class for now: Sorceress. Skill trees Ember (fire), Frost (cold), Storm (lightning). Only these 3 elements, **no physical damage** anywhere (monsters too). Lightning colour is violet.
- Defense: resistances (cap 75 %, −40 % Nightmare, −80 % Hell), Barrier (regenerating shield), dodge. No armour stat.
- Stats: 5 attribute points + 1 skill point per level (Power, Focus, Spirit, Vitality). Respec costs gold.
- Cast priority list: 4 active skill slots, each with a condition; first ready skill top-down is cast.
- Support gems sit **inside the skill** (up to 3 slots, unlocked at skill level 1/5/10), restricted by skill tags.
- Equipment: **5 slots** (weapon, helm, armor, amulet, ring).
- Inventory: **Diablo-2-style grid with item sizes**, tap-to-place and an auto-sort button for phones.
- Death: lose 10 % of current-level XP and 20 % gold, back to town, auto-return to previous area.
- Offline progress: reduced (50 %), with a time cap.
- Endgame: endless rifts. Act I has 6 areas; boss Mother Vesper (fire → cold at 50 %).
- Save: local in browser + export/import code. No backend.
- Art: owner generates images with AI. Characters are single poses; motion, spells particles and light are done in code. Fight screen is fullscreen, no scrolling; life/mana orbs and skill bar in the scene; menus open over the map.
- Do not copy names, characters or art from Diablo or other games; the world is original dark fantasy.

## Tech (phase 0 done)

Vite + TypeScript + PixiJS 8, PWA (vite-plugin-pwa). `npm run dev`, `npm run build`, `npm test`.
Rules: the simulation never uses `Math.random`, the DOM or Pixi; visual-only randomness lives in the renderer.
Imports use explicit `.ts` extensions so scripts run with plain `node`. New save fields need a migration in `src/sim/save.ts` (bump `SAVE_VERSION`).
