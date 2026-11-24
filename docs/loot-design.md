# Loot design: how the big ARPGs keep loot exciting, and Grimlight's targets

Owner feedback that started this: "Almost only uniques drop, and they can't be replaced. Staves drop for the warrior.
Crafting is pointless: too many drops, too many uniques, no grind, no crafting needed."

Measured before the change (`npm run loot`, 3 seeds, bots, campaign): 150–450 items per hour, **all** shown on the ground,
2–9 uniques per hour (rifts: 10–29 per hour), uniques with every stat rolled at full item level ×1.15–1.35 so no rare could
ever replace them, 20 % of the warrior's weapon drops were sorceress staves, and the forge went idle after hour 2 because every
slot held a unique (the forge cannot touch uniques).

## 1. What the reference games do

**Diablo II.** Volume is high but the *quality* curve is brutal. Most drops are white/grey junk; magic is common, rare is
uncommon, unique and set are genuinely rare (a unique roll needs to beat several earlier rarity checks, and magic find has
diminishing returns for uniques: 250 % MF ≈ +71 % uniques). Every unique and every affix has a *quality level*: an item
only rolls affixes/uniques its item level allows, so the deeper the area, the better the loot can be (Hell areas, level 85
zones). The best-in-slot list is a *mix*: a handful of uniques that change how a build plays (Enigma, Shako, Oculus), plus
crafted and rare rings/amulets/gloves/circlets that beat most uniques on raw stats. Gambling (gold) and the Horadric Cube
(recipes, unique upgrades exceptional → elite) are the deterministic outlets. Pick-up filters in modern mods hide grey/white.

**Diablo IV.** Launch D4 was the cautionary tale: too many yellow items, all looking alike, no target farming — players
called it "loot noise". Season 4 ("Loot Reborn") fixed it with: fewer but better drops, greater affixes (a rare stat
tier), item level and power gates by tier, **Tempering** and **Masterworking** as long crafting projects that turn a good
base into a great one with materials, target farming of uniques from specific bosses, and *Mythic* uniques as the very rare
top chase. Key lesson: the excitement comes from a few items that might be *the one*, not from the number of beams.

**Path of Exile 2.** Drops are mostly bases and **currency**. Currency is a separate drop stream with clear rarity tiers
(Transmutation / Augmentation: common; Regal, Alchemy: uncommon; Exalted: rare; Chaos/Divine: rarer; Perfect/omens and
special uniques: very rare). Currency *is* the progression: players turn white/blue bases of the right item level into
rares with orbs; the best rares are crafted, not found. Item level gates affix tiers, so a high-level base is worth
crafting on. Uniques are build enablers with variable rolls; Divine Orbs reroll their numbers, Vaal Orbs corrupt them
(gamble), so a better copy is always possible. Loot filters (default and custom) hide most of the floor. The reward rate
slows naturally: low tiers are easy to max, high tiers need exponentially rarer currency (Divine vs. Transmute).

**Shared principles**
1. Volume ≠ excitement. Few drops on screen, most of them filtered; a good drop must look and sound special.
2. A steep rarity pyramid: normal ≫ magic > rare ≫ unique; build-defining uniques rarer still; mythics from pinnacle bosses only.
3. Item level gates affix tiers and uniques; later content must drop *better possible* items, not just more.
4. Uniques enable builds; well-rolled or crafted rares win on raw stats. Uniques have roll ranges and an upgrade path
   (reroll, corrupt, re-forge at a higher level), so no unique is a dead end.
5. Crafting currency drops separately in tiers; salvage feeds the common tiers. Crafting is the deterministic finisher:
   it turns "almost" into "perfect" over hours, with rising costs (each craft dearer, top tiers needing rare currency).
6. Smart loot: most drops fit your class (D3/D4 ~85 %), so the screen is not full of things you can never use.
7. Reward rate falls with progress: early an upgrade every few minutes, later every few hours, then the forge, corruption
   and rare chase items carry the long tail.
8. Target farming: specific sources (bosses, tyrants) favour specific uniques; gambling is a gold outlet with a small,
   honest unique chance.

## 2. Grimlight's targets (semi-idle, 2–3 h per day, phone)

Stages as the bot plays them: Act I Normal ≈ first 15 min, Nightmare from ≈ 15 min to several hours, rifts tier 1–30+ after.
"Shown" = kept by the default loot rules (normal items are auto-salvaged).

| per hour of play | Act I Normal | Nightmare | Rift T1–10 | Rift T30 |
|---|---|---|---|---|
| equipment generated (all rarities) | 60–120 | 60–110 | 120–220 | 120–220 |
| shown on the ground | 25–50 | 25–50 | 50–100 | 50–100 |
| magic | 25–45 | 20–40 | 40–90 | 40–90 |
| rare | 4–9 | 5–10 | 10–22 | 10–22 |
| unique (all sources) | 0.3–0.8 | 0.3–0.8 | 0.6–1.5 | 0.8–1.8 |
| real upgrades equipped | 6–15 (filling slots) | 1–4 hour 2–3, then 0.3–2 | 0.3–1.5 | 0.2–1 |
| crafts done by the bot | some | 3–15 | 5–20 | 5–20 |

- Unique roughly **1 per 1–3 hours** in the campaign; class-only, build-defining uniques (skill-changing effects) need a
  minimum item level and have a lower weight, so they come after several hours; mythics only from the pinnacle.
- **Class**: ≥ 95 % of weapon drops and 100 % of class-tagged uniques fit the hero's class (gambling, bounties and
  tyrants included). A warrior never gets a staff.
- **Uniques not dead ends**: unique stats roll at the best affix tier the item level allows with a roll range
  (0.75–1.1), so a deeper copy or a better roll exists; a crafted 5–6-affix rare beats a unique on raw stats.
  Upgrade paths: Whetstone works on uniques (expensive), *Ember of Ascension* re-forges a unique at the level of the deepest
  area reached, the altar corrupts it, and the codex imprints its effect on a rare.
- **Crafting**: four material tiers — Grave Dust (common), Ember Essence (uncommon), Relic Shard (rare), Gloam Pearl
  (very rare, drops only). Per hour in Nightmare roughly 250–500 dust, 20–45 essence, 1–3 shards, 0.1–0.3 pearls.
  A "good rare" project (bind, 3–4 rises, a crowning affix, a couple of rerolls) costs ~80–120 essence and 2–4 shards,
  i.e. **2–4 hours** of play; a full five-slot crafted kit is a multi-day goal. Pearls (Ascension, top-tier rises) are the
  long-tail chase.
- **Item level gating**: affix tiers T5…T1 open at item levels 1/8/16/26/38 (Nightmare reaches T2, Hell and rift
  tier 28+ reach T1). The tooltip shows the item level and the best tier it allows.
- **Default loot rules**: normal items are salvaged on the spot (not shown); magic and better, uniques, gems and upgrades
  stay.
- **Progress must not collapse**: levels and areas reached after 6 h within ~10 % of before; the bot uses the forge.

## 3. What was built

See section 4 (results) for the measured numbers; tables are in `npm run loot` output.

- All drop sources go through `src/sim/drops.ts` (`sim.loot`): per-source rarity tables and counts in
  `items.json › dropTables`, class-aware base and unique choice, currency drops (`economy.json › currencyDrops`),
  loot rules and counters for the report.
- Rarity weights rebuilt for every source (monsters, champions, elites, area bosses, Coin-Wretch, chests, Rift Tear,
  tyrants, bounties, rift guardian, pinnacle, gambling); the rift guardian no longer drops normal boss loot on top of its
  burst; magic find affects uniques at half strength.
- Uniques: `lvl` (minimum item level), `weight`, `cls` (class-only effect), `bases` (per-class base for class-neutral
  weapons), `skillFx` (data-driven effect for the three new warrior weapon uniques).
- Crafting: Gloam Pearl, Crowning Ember (add an affix to a rare), Ember of Ascension (re-forge a unique), Whetstone on
  uniques; salvage and costs retuned; the bot crafts.
