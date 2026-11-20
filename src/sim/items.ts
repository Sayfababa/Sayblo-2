import { AFFIXES, ITEMS, RARITIES, SLOTS } from '../content/index.ts';
import { affixValue } from './formulas.ts';
import type { Rng } from './rng.ts';
import type { Item, Mod } from './types.ts';

/** Roll a rarity index from weights. Boss drops use bossWeight. */
export function rollRarity(rng: Rng, boss: boolean): number {
  const w = RARITIES.map(r => (boss ? r.bossWeight : r.weight));
  let t = rng.next() * w.reduce((a, b) => a + b, 0), r = 0;
  for (; r < w.length - 1; r++) { if (t < w[r]) break; t -= w[r]; }
  return r;
}

export function genItem(rng: Rng, id: number, L: number, minR: number, boss: boolean): Item {
  const r = Math.max(rollRarity(rng, boss), minR);
  const slot = rng.pick(SLOTS), base = rng.pick(ITEMS.bases[slot]).name, mods: Mod[] = [];
  let imp = 0;
  const impl = ITEMS.implicits[slot];
  if (impl) {
    const [a, b] = ITEMS.implicitRoll;
    mods.push([impl.affix, Math.round((impl.base + impl.perLevel * L) * rng.range(a, b))]);
    imp = 1;
  }
  let name = base;
  const rar = RARITIES[r];
  if (r === 3) {
    const u = ITEMS.uniques[slot];
    name = u.name;
    for (const k of u.mods) mods.push([k, affixValue(k, L, rng.range(rar.roll![0], rar.roll![1]))]);
  } else if (r > 0) {
    const [lo, hi] = rar.affixes!;
    const keys = rng.shuffle(Object.keys(AFFIXES)).slice(0, rng.int(lo, hi));
    for (const k of keys) mods.push([k, affixValue(k, L, rng.range(rar.roll![0], rar.roll![1]))]);
    name = r === 1 ? `${base} of ${AFFIXES[keys[0]].suffix}` : `${rng.pick(ITEMS.rareNames.first)} ${rng.pick(ITEMS.rareNames.second)}`;
  }
  return { id, slot, base, name, r, L, imp, mods };
}
