# Skill system: how a class is defined in data

Everything about skills lives in `src/content/skills.json` (typed in `src/content/index.ts`). The simulation
(`src/sim/formulas.ts`, `src/sim/spells.ts`, `src/sim/skillmods.ts`), the renderer (`src/render/spells.ts`) and the
skills menu (`src/ui/skills.ts`) read it without knowing any class. A second class (Warrior) is built by adding
trees and skills of the same shape. This file is the reference for that.

## 1. Trees

```json
"trees": {
  "ember": { "name": "Ember", "element": "fire", "class": "sorceress", "description": "…" }
}
```

- `element`: `fire`, `cold` or `light` (lightning; shown violet). Colours the tab, page and node frame.
- `class`: the class the tree belongs to (lower case of `hero.json` `className`). For now every tree is shown;
  when the Warrior exists, the menu filters trees by the hero's class (one line in `TREE_IDS` in `src/ui/skills.ts`).
- Each tree is one page in the skills menu (tabs + swipe). Order of the keys = order of the tabs.
- **Synergy**: every point in a skill gives `scaling.synergyPerPoint` % increased damage to the other skills of the same tree.
- Items with `plusEmber` / `plusFrost` / `plusStorm` add levels to a tree (`TREE_PLUS` in `formulas.ts`; add one per new tree).

## 2. Skills

Common fields of every skill:

| Field | Meaning |
|---|---|
| `name`, `abbr`, `description` | In-game text (English). |
| `tree`, `element`, `row` | Tree, element of its damage, row on the tree page (0 = top). Two or three skills per row fit a phone. |
| `reqLevel`, `maxLevel` | Character level to learn it, highest skill level (default `maxSkillLevel` = 20). |
| `kind: "passive"` + `stats` | Passive: `stats` are added per level to the hero's modifiers (any affix id, or a key in `statNames`). |
| `type`, `tags` | Active: the type decides the behaviour (below); tags decide which support gems fit and which item bonuses apply. |
| `mana`, `cooldown`, `min`, `max` | Cost, cooldown in seconds, base damage per hit at level 1 (`scaling.damagePerLevel` per level). |
| `mods` | Modifier tiers (section 4). |

Icon: `public/sprites/icon-<id>.png` (128 px, bronze frame). Missing art: add the id to `PLACEHOLDER_ICONS` in
`tools/slice_sheets.py` (effect sprite + tint) and request the painted icon in `docs/asset-requests.md`.

### Tags

| Group | Tags |
|---|---|
| Element | `fire`, `cold`, `lightning` |
| Form | `projectile`, `area`, `nova`, `chain`, `strike`, `channel`, `orb`, `construct`, `curse` |
| Kind | `spell`, `hit` (deals hits: needed for added damage, echo, spread), `duration`, `buff` |

A Warrior adds its own (e.g. `attack`, `melee`, `shout`) and gems that require them. `spell` gets the Power bonus,
`projectile`/`area` get the matching item affixes.

### Types

| Type | What happens | Own fields |
|---|---|---|
| `projectile` | Flies to the target (and more targets with extra projectiles); pierce, fork. | `projectileSpeed` |
| `area` | Hits everything within `radius` of the target. | `radius` |
| `nova` | Hits everything within `radius` of the hero. | `radius` |
| `meteor`, `strike` | Delayed area hit at the target after `delay` seconds. | `radius`, `delay` |
| `chain` | Jumps from enemy to enemy. | `jumps`, `jumpRange`, `jumpFalloff` |
| `beam` | Channelled: `ticks` pulses over `channel` seconds (scaled by cast speed); every pulse hits all enemies on the line to the target. The hero stands still while channelling. | `ticks`, `channel`, `range`, `width` |
| `curse` | Marks enemies within `radius` of the target for `duration`: they take `curseTaken` % (+`curseTakenPerLevel`) more damage of the skill element. | `radius`, `duration`, `curseTaken`, `curseTakenPerLevel` |
| `field` | Ground patch at the target for `duration`, hits everything inside every `tick` seconds. | `radius`, `duration`, `tick` |
| `ward` | Defensive, no movement: barrier worth `wardPct` % of life (+`wardPctPerLevel`), `wardDR` % less damage taken for `duration`, freezes enemies within `radius` for `freeze` s. | `wardPct`, `wardPctPerLevel`, `wardDR`, `duration`, `radius`, `freeze` |
| `construct` | Elemental construct that floats beside the hero for `duration` and strikes the nearest enemy within `range` every `attackEvery` s; `constructs` at a time. | `duration`, `attackEvery`, `range`, `constructs` |
| `orb` | Slow orb that drifts from the hero towards the target for `duration`, zapping an enemy within `zapRange` every `zapEvery` s. | `speed`, `duration`, `zapEvery`, `zapRange` |
| `buff` | Frost Armor: timed barrier (`barrierBase`, `barrierPerLevel`, `duration`), chills melee attackers (`meleeChill`). | |

`types` in skills.json says how a type behaves in the cast list:

```json
"types": { "projectile": { "filler": true }, "curse": { "cond": "notCursed" }, "ward": { "cond": "lifeLow" } }
```

- `filler: true`: a skill of this type without cooldown may be the last "Always" skill (the priority check warns about
  skills below it, and auto-sort puts one at the bottom).
- `cond`: default condition when the skill is put into a slot.

A new type (for example a Warrior `leap` or `totem`) needs one `case` in `Spells.cast` (`src/sim/spells.ts`), its
drawing in `src/render/spells.ts`, a row set in `SkillsUI.info` (`src/ui/skills.ts`) and an entry in `types`.

## 3. Cast priority conditions

`conditions` maps an id to its text. The checks live in `Sim.condOk` (classic ones) and `Spells.cond` (newer ones);
the target the skill aims at comes from `Sim.target` / `Spells.pick`.

| Condition | True when | Target |
|---|---|---|
| `always`, `enemies2/3/5`, `enemyClose`, `elite` | as named | nearest / the elite |
| `notActive` | buff has ≤ 3 s left; construct: fewer than allowed or one about to fade | – |
| `manaHigh`, `lifeLow`, `barrierLow` | resource above/below 50 % | – |
| `notChilled`, `notBurning`, `notShocked`, `shocked`, `burning`, `chilled`, `notCursed` | an enemy in that state exists | that enemy |

`autoOrder` lists `[skill, condition]` pairs in the order "Sort automatically" uses.

## 4. Skill modifiers

Every active skill has `mods`: one entry per tier, two choices per tier. The tiers open at the skill levels in
`modifiers.levels` (`[3, 6, 10, 15]`, points spent, +skill items do not count). A choice stays until the player
pays `modifiers.respecPerLevel` × character level in gold to reset that skill's modifiers (the full respec in town
resets them for free). Saved as `skillMods: { skillId: [0|1|-1, …] }` (`src/sim/skillmods.ts`).

```json
"mods": [
  [ { "id": "twin", "name": "Twin Flame", "text": "+1 projectile, 15% less damage.", "fx": { "projectiles": 1, "more": -15 } },
    { "id": "core", "name": "Searing Core", "text": "…", "fx": { "burnChance": 40, "burnMore": 30 } } ],
  …
]
```

`fx` keys are merged with the support gem effects of the skill (`skillCtx` in `formulas.ts`): numbers add up,
`more` multiplies (`-15` = 15 % less), `manaMore` multiplies the mana cost. `text` is shown as written: keep it in
sync with the numbers.

### Effect keys

Same as support gems: `projectiles`, `pierce`, `fork`, `chains`, `radius` (%), `more` (%), `castSpeed` (%),
`manaLess` (%), `duration` (%), `burnChance`, `burnMore`, `burnDuration` (s), `freezeChance`, `chillEffect`,
`shockChance`, `shockEffect`, `addFire/addCold/addLight`, `spread`, `echo`.

Modifier keys (any skill type that makes sense):

| Key | Effect |
|---|---|
| `manaMore` | % more mana cost |
| `critBonus` | + crit chance (percentage points) |
| `cdLess` | % shorter cooldown |
| `projSpeed` | % faster projectiles |
| `critAilment` | crits always apply burn / shock (cold always chills) |
| `vsBurning`, `vsChilled`, `vsShocked` | % more damage against enemies in that state (also passive `stats`) |
| `freezeDur` | % longer freezes (also passive `stats`) |
| `explode` + `explodeDmg` | direct hits (projectile, chain jump, beam pulse, construct strike) burst: radius in tiles, % damage. Orbs burst when they fade. |
| `ground` + `groundDur` + `groundDmg` | impact leaves a ground patch: radius, seconds, % damage per pulse (0.5 s) |
| `repeat` + `repeatDmg` | area/nova/meteor/strike impact happens again 0.4 s later (n times, % damage) |
| `extra` + `extraDmg` | n more meteors/bolts/fields on other enemies (% damage) |
| `killBlast` | enemies killed by the skill (or dying while hexed by it) explode for % of their life (capped at 3 normal-monster lives) |
| `ticks` | beam: more pulses (channel gets longer) |
| `arcs` | beam/orb/construct: hits that many more enemies near the target |
| `rate` | field/orb/construct: % faster pulses, zaps or strikes |
| `orbs`, `constructs` | more orbs per cast, more constructs at a time |
| `curseEffect`, `curseAll`, `curseSpread`, `curseSlow` | curse: % stronger, half value on other elements, jumps on death, % slower enemies |
| `wardPct`, `wardDR`, `wardNova`, `wardMana`, `wardHeal` | ward: + % life as barrier, + % less damage, burst damage % on cast, % mana / life restored |
| `barrierPct`, `retaliate`, `wardFreeze`, `breakNova`, `chillAura` | Frost Armor: % more barrier, melee attackers take % damage, % chance to freeze them, nova (% damage) when the barrier breaks, chill aura radius |

A new behaviour key: add the field to `SkillCtx` (formulas.ts) and its use in `spells.ts`, list it here and in
`FX_KEYS` in `tests/skills.test.ts` (the content test refuses unknown keys).

## 5. Visual effects

The sim emits events (`ring`, `burst`, `bolt`, `beam`, `cast`, …) and keeps state the renderer reads
(`sim.spells.beams/fields/orbs/constructs/shell`, `monster.hex`). `src/render/spells.ts` draws them from the existing
fx sprites (`public/sprites/fx-*.jpg`, additive) plus code particles; element colours come from `ELEMENT_COLORS`.
A new class mostly reuses `ring`/`burst`; give each new type one drawing block in `SpellFx.drawFx`.

## 6. Checklist for a new class (Warrior)

1. `hero.json`: class name and attributes (a second hero file once classes can be picked).
2. `skills.json`: 3 trees with `class: "warrior"`, ~8 skills each (5 actives with 4 modifier tiers, 3 passives),
   start skill, `autoOrder` entries, any new tags, types and conditions.
3. Gems for new tags in `gems.json`; `plusX` affixes for the new trees.
4. Icons: placeholders in `tools/slice_sheets.py`, prompts in `docs/asset-requests.md`.
5. New types/keys: code as described above, with tests in `tests/skills.test.ts`.
6. Balance with `npm run sim -- 60 <seed> <plan>` after adding plans to `scripts/endgame.ts` (`PLANS`, `MOD_PICKS`).
