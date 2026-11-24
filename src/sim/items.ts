import { AFFIXES, AFFIX_ROLL, AFFIX_TIERS, COMMON_UNIQUES, GEMS, SLOT_KINDS, GEM_MAX_LEVEL, ITEMS, SLOTS, UNIQUES, RARITIES, getActiveClass, weaponBases, type DropTableId, type Slot } from '../content/index.ts';
import { affixValue } from './formulas.ts';
import type { Rng } from './rng.ts';
import type { GemItem, Item, Mod } from './types.ts';

/**
 * Roll a rarity index (0 Normal … 3 Unique) from a drop table (items.json dropTables). `boost` is magic find:
 * Magic and Rare weights x (1 + boost), Unique x (1 + boost x uniqueBoostShare). `true` = area boss table, `false` = monsters.
 */
export function rollRarity(rng: Rng, table: boolean | DropTableId, boost = 0): number {
  const base = ITEMS.dropTables[typeof table === 'string' ? table : table ? 'boss' : 'monster'];
  const w = base.map((x, i) => x * (i === 0 ? 1 : i === 3 ? 1 + boost * ITEMS.uniqueBoostShare : 1 + boost));
  let t = rng.next() * w.reduce((a, b) => a + b, 0), r = 0;
  for (; r < w.length - 1; r++) { if (t < w[r]) break; t -= w[r]; }
  return r;
}

/** Can a hero of this class find this unique? Class-only uniques (cls) need that class. */
export const uniqueFits = (u: string, cls: string = getActiveClass()) => !UNIQUES[u]?.cls || UNIQUES[u].cls === cls;
/** Uniques that can drop at item level L (optionally of one slot) for a class. Mythics (pinnacle) never. */
export function uniquePool(L: number, slot?: Slot, cls: string = getActiveClass()): string[] {
  return COMMON_UNIQUES.filter(u => (UNIQUES[u].lvl ?? 1) <= L && (!slot || UNIQUES[u].slot === slot) && uniqueFits(u, cls));
}
/** Pick a unique by weight, or null if none fits. A small `offClassUnique` chance allows other classes' uniques. */
export function pickUnique(rng: Rng, L: number, slot?: Slot, cls: string = getActiveClass(), from?: string[]): string | null {
  let pool = (from ?? uniquePool(L, slot, cls)).filter(u => (!slot || UNIQUES[u].slot === slot) && uniqueFits(u, cls));
  if (ITEMS.offClassUnique > 0 && rng.chance(ITEMS.offClassUnique)) pool = (from ?? COMMON_UNIQUES).filter(u => (UNIQUES[u].lvl ?? 1) <= L && (!slot || UNIQUES[u].slot === slot));
  if (!pool.length) return null;
  return weighted(rng, pool, u => UNIQUES[u].weight ?? 1);
}

function weighted<T>(rng: Rng, list: T[], w: (x: T) => number): T {
  let t = rng.next() * list.reduce((a, x) => a + w(x), 0);
  for (const x of list) { t -= w(x); if (t < 0) return x; }
  return list[list.length - 1];
}

/** Tiers an item level can roll (T5 = weakest). */
export const tiersFor = (L: number) => AFFIX_TIERS.filter(t => t.level <= L);
/** Best tier an item level allows (the lowest number) and its level. */
export const topTier = (L: number) => tiersFor(L).reduce((a, b) => (b.tier < a.tier ? b : a), AFFIX_TIERS[0]);

/** Can this affix roll on this slot? */
export const affixFits = (k: string, slot: Slot) => {
  const a = AFFIXES[k];
  return SLOT_KINDS[slot].includes(a.kind) && (!a.slots || a.slots.includes(slot));
};

/** Roll one affix of a group that the item does not have yet. */
export function rollAffix(rng: Rng, slot: Slot, L: number, group: 'prefix' | 'suffix', taken: Set<string>): Mod | null {
  const cls = getActiveClass(); // classes: +tree affixes of the hero's class only
  const pool = Object.entries(AFFIXES).filter(([k, a]) => a.group === group && !taken.has(k) && affixFits(k, slot) && (a.minLevel ?? 0) <= L && (!a.cls || a.cls === cls));
  if (!pool.length) return null;
  const [k] = weighted(rng, pool, ([, a]) => a.rare ?? 1);
  const tier = weighted(rng, tiersFor(L), t => t.weight);
  taken.add(k);
  return [k, affixValue(k, tier.level, rng.range(AFFIX_ROLL[0], AFFIX_ROLL[1])), tier.tier];
}

/** Random item from a drop table (see rollRarity). A unique roll with no fitting unique becomes a Rare. */
export function genItem(rng: Rng, id: number, L: number, minR: number, table: boolean | DropTableId, boost = 0): Item {
  const r = Math.max(rollRarity(rng, table, boost), minR);
  if (r === 3) {
    const u = pickUnique(rng, L);
    if (u) return genUnique(rng, id, L, u);
  }
  return genItemOf(rng, id, L, Math.min(r, 2), rng.pick(SLOTS));
}

/** Name of a magic item from its first prefix and suffix. */
export function magicName(base: string, mods: Mod[], imp: number): string {
  const aff = mods.slice(imp), pre = aff.find(m => AFFIXES[m[0]]?.group === 'prefix'), suf = aff.find(m => AFFIXES[m[0]]?.group === 'suffix');
  return [pre && AFFIXES[pre[0]].name, base, suf && `of ${AFFIXES[suf[0]].name}`].filter(Boolean).join(' ');
}

/** Non-unique item of a given rarity (0-2) and slot. */
export function genItemOf(rng: Rng, id: number, L: number, r: number, slot: Slot): Item {
  const base = rng.pick(slot === 'weapon' ? weaponBases() : ITEMS.bases[slot]).name, mods: Mod[] = []; // classes: warrior weapons
  let imp = 0;
  const impl = ITEMS.implicits[slot];
  if (impl) {
    const [a, b] = ITEMS.implicitRoll;
    mods.push([impl.affix, Math.round((impl.base + impl.perLevel * L) * rng.range(a, b))]);
    imp = 1;
  }
  let name = base;
  if (r > 0) {
    const rar = RARITIES[r], [lo, hi] = rar.affixes!;
    const n = rng.int(lo, hi), taken = new Set<string>();
    let np = 0, ns = 0;
    const pre: Mod[] = [], suf: Mod[] = [];
    for (let i = 0; i < n; i++) {
      let group: 'prefix' | 'suffix' = rng.chance(0.5) ? 'prefix' : 'suffix';
      if (group === 'prefix' && np >= rar.prefixes!) group = 'suffix';
      if (group === 'suffix' && ns >= rar.suffixes!) group = 'prefix';
      if ((group === 'prefix' ? np : ns) >= (group === 'prefix' ? rar.prefixes! : rar.suffixes!)) break;
      const m = rollAffix(rng, slot, L, group, taken);
      if (!m) continue;
      if (group === 'prefix') { pre.push(m); np++; } else { suf.push(m); ns++; }
    }
    mods.push(...pre, ...suf);
    name = r === 1 ? magicName(base, mods, imp) : rareName(rng);
  }
  return { id, slot, base, name, r, L, imp, mods };
}

export const rareName = (rng: Rng) => `${rng.pick(ITEMS.rareNames.first)} ${rng.pick(ITEMS.rareNames.second)}`;

/** Base of a unique for a class (class-neutral weapons have one per class). */
export const uniqueBase = (u: string, cls: string = getActiveClass()) => UNIQUES[u].bases?.[cls] ?? UNIQUES[u].base;
/** Value of a unique's stat: the best tier item level L allows, times a roll in uniqueRoll. */
export const uniqueValue = (rng: Rng, k: string, L: number) => affixValue(k, topTier(L).level, rng.range(ITEMS.uniqueRoll[0], ITEMS.uniqueRoll[1]));
export function genUnique(rng: Rng, id: number, L: number, u: string): Item {
  const U = UNIQUES[u], mods: Mod[] = [], tier = topTier(L).tier;
  const impl = ITEMS.implicits[U.slot];
  let imp = 0;
  if (impl) { mods.push([impl.affix, Math.round((impl.base + impl.perLevel * L) * ITEMS.implicitRoll[1])]); imp = 1; }
  for (const k of U.mods) mods.push([k, uniqueValue(rng, k, L), tier]);
  return { id, slot: U.slot, base: uniqueBase(u), name: U.name, r: 3, L, imp, mods, u };
}

/** Random support gem; higher item level allows higher gem levels, low levels stay more common. */
export function genGem(rng: Rng, id: number, L: number): GemItem {
  const max = Math.max(1, Math.min(GEM_MAX_LEVEL, 1 + Math.floor(L / 6)));
  return { id, kind: 'gem', gem: rng.pick(Object.keys(GEMS)), lvl: 1 + Math.floor(rng.next() ** 2 * max) };
}
