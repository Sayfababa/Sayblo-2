import { AFFIXES, AFFIX_ROLL, AFFIX_TIERS, GEMS, SLOT_KINDS, GEM_MAX_LEVEL, ITEMS, RARITIES, SLOTS, UNIQUES, type Slot } from '../content/index.ts';
import { affixValue } from './formulas.ts';
import type { Rng } from './rng.ts';
import type { GemItem, Item, Mod } from './types.ts';

/** Roll a rarity index from weights. Boss drops use bossWeight. `boost` makes magic and better more likely (0.75 = +75 %). */
export function rollRarity(rng: Rng, boss: boolean, boost = 0): number {
  const w = RARITIES.map((r, i) => (boss ? r.bossWeight : r.weight) * (i ? 1 + boost : 1));
  let t = rng.next() * w.reduce((a, b) => a + b, 0), r = 0;
  for (; r < w.length - 1; r++) { if (t < w[r]) break; t -= w[r]; }
  return r;
}

function weighted<T>(rng: Rng, list: T[], w: (x: T) => number): T {
  let t = rng.next() * list.reduce((a, x) => a + w(x), 0);
  for (const x of list) { t -= w(x); if (t < 0) return x; }
  return list[list.length - 1];
}

/** Tiers an item level can roll (T5 = weakest). */
export const tiersFor = (L: number) => AFFIX_TIERS.filter(t => t.level <= L);

/** Can this affix roll on this slot? */
export const affixFits = (k: string, slot: Slot) => {
  const a = AFFIXES[k];
  return SLOT_KINDS[slot].includes(a.kind) && (!a.slots || a.slots.includes(slot));
};

/** Roll one affix of a group that the item does not have yet. */
export function rollAffix(rng: Rng, slot: Slot, L: number, group: 'prefix' | 'suffix', taken: Set<string>): Mod | null {
  const pool = Object.entries(AFFIXES).filter(([k, a]) => a.group === group && !taken.has(k) && affixFits(k, slot) && (a.minLevel ?? 0) <= L);
  if (!pool.length) return null;
  const [k] = weighted(rng, pool, ([, a]) => a.rare ?? 1);
  const tier = weighted(rng, tiersFor(L), t => t.weight);
  taken.add(k);
  return [k, affixValue(k, tier.level, rng.range(AFFIX_ROLL[0], AFFIX_ROLL[1])), tier.tier];
}

export function genItem(rng: Rng, id: number, L: number, minR: number, boss: boolean, boost = 0): Item {
  const r = Math.max(rollRarity(rng, boss, boost), minR);
  if (r === 3) return genUnique(rng, id, L, rng.pick(Object.keys(UNIQUES)));
  return genItemOf(rng, id, L, r, rng.pick(SLOTS));
}

/** Name of a magic item from its first prefix and suffix. */
export function magicName(base: string, mods: Mod[], imp: number): string {
  const aff = mods.slice(imp), pre = aff.find(m => AFFIXES[m[0]]?.group === 'prefix'), suf = aff.find(m => AFFIXES[m[0]]?.group === 'suffix');
  return [pre && AFFIXES[pre[0]].name, base, suf && `of ${AFFIXES[suf[0]].name}`].filter(Boolean).join(' ');
}

/** Non-unique item of a given rarity (0-2) and slot. */
export function genItemOf(rng: Rng, id: number, L: number, r: number, slot: Slot): Item {
  const base = rng.pick(ITEMS.bases[slot]).name, mods: Mod[] = [];
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

export function genUnique(rng: Rng, id: number, L: number, u: string): Item {
  const U = UNIQUES[u], mods: Mod[] = [];
  const impl = ITEMS.implicits[U.slot];
  let imp = 0;
  if (impl) { mods.push([impl.affix, Math.round((impl.base + impl.perLevel * L) * ITEMS.implicitRoll[1])]); imp = 1; }
  for (const k of U.mods) mods.push([k, affixValue(k, L, rng.range(ITEMS.uniqueRoll[0], ITEMS.uniqueRoll[1]))]);
  return { id, slot: U.slot, base: U.base, name: U.name, r: 3, L, imp, mods, u };
}

/** Random support gem; higher item level allows higher gem levels, low levels stay more common. */
export function genGem(rng: Rng, id: number, L: number): GemItem {
  const max = Math.max(1, Math.min(GEM_MAX_LEVEL, 1 + Math.floor(L / 6)));
  return { id, kind: 'gem', gem: rng.pick(Object.keys(GEMS)), lvl: 1 + Math.floor(rng.next() ** 2 * max) };
}
