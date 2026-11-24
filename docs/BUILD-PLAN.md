# Build plan: endless, addictive Grimlight

Source of the ideas: `docs/IDEAS-endless.md` (German). This file is the working contract for every agent that builds a part.
The coordinator (main session) merges the parts into `claude/ui-assets` and publishes the playtest build.

## Rules for every work package

- Read `CLAUDE.md`, `docs/ROADMAP.md` and `docs/IDEAS-endless.md` first. In-game text is **English**; code comments English.
- Simulation (`src/sim/`) never uses `Math.random`, the DOM or Pixi. All randomness through the seeded `Rng`. Visual-only randomness lives in `src/render/`.
- Content (numbers, names, tables) goes into `src/content/*.json`, typed in `src/content/index.ts`. No magic numbers buried in code.
- **Put new logic in new modules** (`src/sim/<feature>.ts`, `src/ui/<feature>.ts`, `src/render/<feature>.ts`) and keep edits to the big shared files (`sim.ts`, `ui.ts`, `scene.ts`, `types.ts`, `save.ts`) to small, clearly separated hook lines. Several packages run in parallel and are merged afterwards.
- New save fields: add them with defaults in `newSaveState()` and a migration step in `src/sim/save.ts`; bump `SAVE_VERSION` by one. (Parallel packages will each bump; the coordinator renumbers on merge.)
- Imports with explicit `.ts` extensions.
- Phone first: every new UI must work at 390 × 844 with one thumb, no horizontal scroll, tap targets ≥ 40 px. Reuse existing UI pieces (`ui-panel`, `ui-btn`, `ui-tab`, `ui-well`, tooltip) and the stone/iron look from `src/ui/styles.css`.
- No real money, no expiring dailies, no punishment for pausing.
- Original names only. Nothing named after Diablo/PoE things.
- Missing art: draw a decent placeholder in code (Pixi Graphics / CSS) and list the needed image with a prompt in `docs/asset-requests.md` (section per package, same style rules as `docs/ui-assets.md` section 7/9: photorealistic dark fantasy, magenta `#FF00FF` background for props, sheet layout that `tools/slice_sheets.py` can cut).
- Before finishing: `npm test` green, `npx tsc --noEmit -p .` clean, `npm run build` ok, `npm run sim -- 60 1` still progresses sensibly (report numbers). Add vitest tests for new formulas/systems.
- UI changes: `npm run ui-check` (= `node scripts/ui-check.mjs`; add `--no-build` to reuse `dist/`, `--verbose` for small tap targets and truncated text, `--sizes 390x664,360x640`, `--shots <dir>`). It builds, serves `dist/` with an end-game test hero (full bag, gems, keys, points to spend), opens every panel, sub-tab, tooltip and overlay at 390×664 (visible area in the claude.ai viewer) and 390×844 in Chromium, and fails on anything that overflows sideways (page wider than the screen, element outside the screen or cut off by its box, box that scrolls sideways, hidden close button). Screenshots land in the temp folder (`grimlight-ui-check/`); look at them. New views: add a line to `VIEWS` in the script. Phone overrides live in `src/ui/phone.css` (loaded last).
- Commit in small logical commits on your branch. Do **not** push and do not publish artifacts; the coordinator does that.
- Final report: what was built, files touched, save version used, open issues, needed assets.

## Waves

| Wave | Package | Content |
|---|---|---|
| 1 | **A – Feel** | drop beams + rarity sounds (WebAudio synth), upgrade arrow, perfect-roll star, shrines, fleeing treasure creature + vault, more monster affixes, crit/kill feel |
| 1 | **B – Economy** | salvage → materials, 6 crafting embers, corruption altar, gambling vendor, loot filter rules + auto-salvage, stash with tabs |
| 2 | **C – Rifts** | endless rift tiers, keys with modifiers, timer, rift guardian, key drops, atlas tree, pinnacle boss every 25 tiers, personal bests |
| 2 | **D – Meta** | bounty board, area tyrants, area events, ember points after level cap, unique codex + imprint, achievements/feats |
| 3 | **E – Town & idle** | town buildings upgraded with gold (unlock features/automation), expeditions, rested bonus, loadouts, more priority conditions, skill mastery, DPS meter, better offline report, seasons |
| 3 | **F – Polish** | balancing all three elements, onboarding, mobile playtest, performance, asset integration |

## Handoff / current state (keep updated)

Merged into `claude/ui-assets` and published (artifact https://claude.ai/artifact/LBgXfG93fk3jLj1qnTwc7k): wave 1 A (feel) + B (economy), wave 2 C (rifts) + D (meta), wave-1 art (Coin-Wretch, shrines, chest, material/ember icons, parcel). Save version on main: **11**.
Owner decisions since: no big header pictures in menus (altar/forge pictures removed); rifts open after Mother Vesper on any difficulty, tier 1 = start of Nightmare (`src/content/rift.json`); never horizontal scrolling on phones; gems get their own pouch; each skill tree gets its own page with more customisation; a **Warrior** class comes after the sorceress skill rework, built on the same data-driven system (keep elemental damage only unless the owner decides otherwise).

Running / next:
- Merged: UI agent (phone layout, gem pouch v9, `npm run ui-check`), skill agent (24 sorceress skills, modifiers at skill levels 3/6/10/15, one page per tree, `docs/skill-system.md`, v10), **Warrior** (v11 `cls`, class choice on a new game and in Town › New hero, 24 skills Cinder/Rime/Thunder with types melee/fissure/leap/cry/aura in `src/sim/melee.ts`, `src/content/classes.json`, warrior weapons, +tree affixes by class, placeholder look in code).
- Loot economy agent (v12): `docs/loot-design.md`, `src/sim/drops.ts` (`sim.loot`: drop tables per source, class-aware uniques, currency drops), Gloam Pearl, Crowning Ember, Ember of Ascension, normal items hidden by default, `npm run loot` (`scripts/loot-report.ts`, bot in `scripts/bot.ts`).
- Next: **E – Town & idle** and **F – balance/polish** (warrior dies more often than the sorceress; cold warrior a bit strong; uniques with sorceress-only effects also drop for the warrior). The UI agent is the contact for owner UI complaints.

Known balance issues for F: Hell is not reachable (monster curve 1.17/1.15 per level too steep); level cap 60 + ember points unreachable (XP curve 1.36× per level); storm builds clearly slower in rifts.
Art waiting for prompts to the owner: 6 tyrant sheets, `mon-matriarch.png`, rift tear / blood moon / champion casing fx, new skill icons (prompts in `docs/asset-requests.md`). Imp/Wraith prompts: `docs/ui-assets.md` section 9.
Publishing: `node scripts/build-artifact.mjs`, upload every renamed file in `dist-artifact/assets/` plus new/changed sprites, remove old chunks with `null`.
