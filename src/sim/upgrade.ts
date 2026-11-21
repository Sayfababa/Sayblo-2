/**
 * Item power for the upgrade arrow, and perfect-roll detection. Pure functions, no state.
 *
 * Item power: every mod (implicit included) counts as a share of the best value its affix can have
 * at `FEEL.upgrade.refLevel` (top tier, full roll), weighted by the affix kind:
 * offense 1, defense 0.8, mana 0.4 (see src/content/feel.json). A unique adds `uniqueBonus` for its effect.
 * So "+40 Life" and "+12% Crit Chance" are measured on the same scale. Damage and defense are
 * both counted because one item slot cannot tell what the build needs; offense weighs a bit more
 * because the hero fights on her own and kills keep her safe.
 */
import { AFFIXES, AFFIX_ROLL, AFFIX_TIERS, FEEL } from '../content/index.ts';
import { affixValue } from './formulas.ts';
import { isEquip, type BagItem, type Item, type Mod } from './types.ts';

const best = new Map<string, number>();
/** Best value an affix can roll at the reference level (cached). */
function bestValue(k: string): number {
  let v = best.get(k);
  if (v == null) { v = Math.max(0.1, affixValue(k, FEEL.upgrade.refLevel, AFFIX_ROLL[1])); best.set(k, v); }
  return v;
}

/** Power of one mod: value as a share of the best roll, times the kind weight. */
export function modPower([k, v]: Mod): number {
  const a = AFFIXES[k];
  if (!a) return 0;
  return (v / bestValue(k)) * (FEEL.upgrade.kindWeight[a.kind] ?? 1);
}

/** Item power (0 for nothing and for gems). */
export function itemPower(it: BagItem | null | undefined): number {
  if (!isEquip(it)) return 0;
  let p = 0;
  for (const m of it.mods) p += modPower(m);
  if (it.u || it.ipr) p += FEEL.upgrade.uniqueBonus; // meta: an imprint counts like a unique effect
  return Math.round(p * 100) / 100;
}

/** Power difference to the equipped item (positive = better). */
export const powerGain = (it: Item, equipped: Item | null | undefined) => Math.round((itemPower(it) - itemPower(equipped)) * 100) / 100;

/** Upgrade arrow: clearly more power than the equipped item of that slot (or the slot is empty). */
export function isUpgrade(it: BagItem | null | undefined, equipped: Item | null | undefined): boolean {
  if (!isEquip(it)) return false;
  if (!equipped) return true;
  const a = itemPower(it), b = itemPower(equipped), U = FEEL.upgrade;
  return a - b > Math.max(U.minAbs, b * U.minGain);
}

/* ---------- perfect rolls ---------- */
const TOP = () => AFFIX_TIERS.find(t => t.tier === FEEL.perfect.tier)!;
/** Lowest value that counts as a perfect roll for an affix at the top tier. */
export function perfectThreshold(k: string): number {
  const [lo, hi] = AFFIX_ROLL;
  return affixValue(k, TOP().level, lo + (hi - lo) * FEEL.perfect.rangeShare);
}
/** Top tier and at least 95 % of the roll range. Mods without a tier (implicits, uniques) never count. */
export function isPerfect(m: Mod): boolean {
  return m.length === 3 && m[2] === FEEL.perfect.tier && !!AFFIXES[m[0]] && m[1] >= perfectThreshold(m[0]);
}
export const hasPerfect = (it: BagItem | null | undefined) => isEquip(it) && it.mods.some(isPerfect);
