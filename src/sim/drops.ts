/**
 * Loot package: one place every drop goes through. Sources (monster kills, Coin-Wretch, chests, tyrants,
 * bounties, rift guardian, ...) call `sim.loot.put(source, item, x, y)`; this applies the loot rules
 * (keep on the ground, salvage or sell on the spot) and counts everything for the balancing report
 * (scripts/loot-report.ts). Counters are not saved.
 */
import { ECONOMY, ITEMS, MATERIALS, MAT_IDS, UNIQUES, classDef, type DropTableId, type MatId, type Mats, type Slot } from '../content/index.ts';
import { addMats, salvageYield } from './crafting.ts';
import { disposeItem } from './economy.ts';
import { genItem, genUnique, pickUnique } from './items.ts';
import { lootFate, type Fate } from './loot.ts';
import type { Sim } from './sim.ts';
import { isEquip, isGem, type BagItem, type Drop, type Item } from './types.ts';

/** Rarity tier of a material (0 common … 3 very rare), used for its beam and sound. */
export const matTier = (k: MatId) => MAT_IDS.indexOf(k);

export type LootSource =
  | 'monster' | 'champion' | 'elite' | 'boss' | 'wretch' | 'chest' | 'tear' | 'event'
  | 'tyrant' | 'bounty' | 'guardian' | 'pinnacle' | 'gamble';

/** Counters for the loot report. Rarity arrays are indexed Normal, Magic, Rare, Unique. */
export interface LootStats {
  /** equipment generated per source and rarity */
  gen: Partial<Record<LootSource, number[]>>;
  /** equipment by what happened to it */
  fate: Record<Fate, number[]>;
  /** uniques per source */
  uniques: Partial<Record<LootSource, number>>;
  gems: number;
  /** materials from salvage (auto and manual through disposeItem) and from direct drops */
  salvMats: Mats; dropMats: Mats;
}
export const emptyLootStats = (): LootStats => ({
  gen: {}, fate: { keep: [0, 0, 0, 0], salvage: [0, 0, 0, 0], sell: [0, 0, 0, 0] }, uniques: {}, gems: 0, salvMats: {}, dropMats: {},
});

export class Loot {
  sim: Sim;
  stats: LootStats = emptyLootStats();
  constructor(sim: Sim) { this.sim = sim; }
  resetStats() { const r = this.stats; this.stats = emptyLootStats(); return r; }

  /** Count a freshly generated item of a source. */
  note(source: LootSource, it: BagItem) {
    if (isGem(it)) { this.stats.gems++; return; }
    if (!isEquip(it)) return;
    (this.stats.gen[source] ??= [0, 0, 0, 0])[it.r]++;
    if (it.r === 3) this.stats.uniques[source] = (this.stats.uniques[source] || 0) + 1;
  }

  /** Apply the loot rules to a new item: dispose of it on the spot, or return 'keep'. */
  fate(it: BagItem, gemFate: Fate = 'sell'): Fate {
    const s = this.sim.s, f = lootFate(s.loot, it, s.equip);
    if (f === 'keep') { if (isEquip(it)) this.stats.fate.keep[it.r]++; return f; }
    const how = isGem(it) ? gemFate : f;
    this.sim.run.gold += this.dispose(it, how);
    return how;
  }

  /** Get rid of an item without asking the rules (full bag, manual salvage). Counted like a loot-rule disposal. */
  dispose(it: BagItem, how: Fate): number {
    if (isEquip(it) && how !== 'keep') {
      this.stats.fate[how][it.r]++;
      if (how === 'salvage') this.stats.salvMats = addMats(this.stats.salvMats, salvageYield(it));
    }
    return disposeItem(this.sim.s, it, how);
  }

  /** A new item from a source: counted, then dropped on the ground near (x, y) or disposed of by the loot rules. */
  put(source: LootSource, it: BagItem, x: number, y: number, spread = 1) {
    const sim = this.sim, rng = sim.rng;
    this.note(source, it);
    if (this.fate(it) !== 'keep') return;
    sim.drops.push({ id: sim.nextUid(), x: x + rng.range(-spread, spread), y: y + rng.range(-spread, spread), item: it });
  }

  /** Is this item meant for another class (a weapon base or a class unique of another class)? */
  offClass(it: BagItem, cls: string): boolean {
    if (!isEquip(it)) return false;
    const U = it.u ? UNIQUES[it.u] as { cls?: string } : null;
    if (U?.cls) return U.cls !== cls;
    return it.slot === 'weapon' && !(classDef(cls).weaponBases ?? ITEMS.bases.weapon).some(b => b.name === it.base);
  }

  /** Magic find of the hero right now: shrines, ember points and feats, rift key. */
  boost() { const sim = this.sim; return sim.feel.rarityBoost() + sim.meta.rarityBoost() + sim.rift.rarity(); }

  /** A new random item from a source's drop table (not dropped yet). */
  roll(table: DropTableId, L: number, minR = 0, extraBoost = 0): Item {
    const sim = this.sim;
    return genItem(sim.rng, sim.itemId(), L, minR, table, this.boost() + extraBoost);
  }
  /** A unique for the hero's class (optionally of one slot or from a list), or null if none fits. */
  unique(L: number, slot?: Slot, from?: string[]): Item | null {
    const sim = this.sim, u = pickUnique(sim.rng, L, slot, sim.s.cls, from);
    return u ? genUnique(sim.rng, sim.itemId(), L, u) : null;
  }

  /** Direct material drops of a source (economy.json currencyDrops) around (x, y). */
  currency(source: string, L: number, x: number, y: number, mult = 1) {
    const C = ECONOMY.currencyDrops, table = C[source];
    if (!table || source === 'scale') return;
    const sim = this.sim, rng = sim.rng;
    for (const k of MAT_IDS) {
      const e = table[k];
      if (!e || !rng.chance(e[0] * mult)) continue;
      const n = Math.max(1, Math.round(rng.int(e[1], e[2]) * (1 + (C.scale[k] || 0) * L)));
      sim.drops.push({ id: sim.nextUid(), x: x + rng.range(-1, 1), y: y + rng.range(-1, 1), mat: k, n });
    }
  }
  /** The hero walks over a material pile. */
  pickMat(d: Drop) {
    const sim = this.sim, k = d.mat!, n = d.n || 1;
    sim.s.mats[k] = (sim.s.mats[k] || 0) + n;
    this.stats.dropMats[k] = (this.stats.dropMats[k] || 0) + n;
    sim.float(d.x, d.y, `+${n} ${MATERIALS[k].name}`, MATERIALS[k].color, matTier(k) >= 3);
    if (matTier(k) >= 2) sim.log(`Found **${n} ${MATERIALS[k].name}** (${MATERIALS[k].tier.toLowerCase()} crafting material).`, matTier(k) >= 3 ? 'r3' : 'r2');
    sim.dirty.add('town');
  }

  /** Total materials gained (salvage and drops). */
  matsGained(): Mats {
    const out: Mats = {};
    for (const k of MAT_IDS) { const v = (this.stats.salvMats[k] || 0) + (this.stats.dropMats[k] || 0); if (v) out[k] = v; }
    return out;
  }
}
