/**
 * Work package D: the unique codex. Salvaging a unique unlocks its effect; an unlocked effect can be
 * imprinted on a Rare item of the same slot for materials (once per item). Imprinted items count as
 * having that unique's effect (calcStats adds `ipr` to the set of active unique effects).
 * Pure rules here; the Sim action is Meta.imprint (meta.ts).
 */
import { MAT_IDS, META, SLOT_NAMES, UNIQUES, type Mats } from '../content/index.ts';
import { uniqueFits } from './items.ts';
import type { Item, SaveState } from './types.ts';

/** All codex entries in a stable order (by slot, then as listed in items.json). */
export const CODEX_ORDER = (() => {
  const order = ['weapon', 'helm', 'armor', 'amulet', 'ring'];
  return Object.keys(UNIQUES).sort((a, b) => order.indexOf(UNIQUES[a].slot) - order.indexOf(UNIQUES[b].slot));
})();

/** Codex entries a hero of this class can find (class-only uniques of other classes are left out). */
export const codexFor = (cls: string) => CODEX_ORDER.filter(u => uniqueFits(u, cls));

/** Salvaging (or auto-salvaging) a unique: unlock its effect. Returns true if it was new. */
export function unlockCodex(s: SaveState, it: Item): boolean {
  if (it.r !== 3 || !it.u || !UNIQUES[it.u] || !s.meta || s.meta.codex.includes(it.u)) return false;
  s.meta.codex.push(it.u);
  return true;
}

export const imprintCost = (it: Item): Mats => {
  const out: Mats = {}, mult = 1 + META.codex.perLevel * it.L;
  for (const k of MAT_IDS) if (META.codex.imprint[k]) out[k] = Math.ceil(META.codex.imprint[k]! * mult);
  return out;
};

/** Why this effect cannot be imprinted on this item, or null. */
export function imprintBlock(s: SaveState, it: Item, u: string): string | null {
  const U = UNIQUES[u];
  if (!U) return 'Unknown effect.';
  if (!s.meta.codex.includes(u)) return 'Salvage this unique once to unlock its effect.';
  if (it.unid) return 'Identify it first.';
  if (it.r !== 2) return 'Only Rare items can take an imprint.';
  if (it.ipr) return 'This item already carries an imprint.';
  if (it.slot !== U.slot) return `${U.name} only fits a ${SLOT_NAMES[U.slot]}.`;
  return null;
}

/** Text of the unique effect an item carries (its own or imprinted), or ''. */
export const imprintEffect = (it: Item) => (it.ipr && UNIQUES[it.ipr] ? UNIQUES[it.ipr].effect : '');
