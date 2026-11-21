/** Loot filter rules: what the hero keeps, sells or salvages when an item drops. */
import type { Slot } from '../content/index.ts';
import { itemScore } from './formulas.ts';
import { isGem, type BagItem, type Item, type LootRules } from './types.ts';

export type Fate = 'keep' | 'sell' | 'salvage';

/** Better than what is equipped in its slot (same score as the bot and the compare view use). */
export const isUpgrade = (it: Item, equip: Record<Slot, Item | null>) => itemScore(it) > itemScore(equip[it.slot]);

export function lootFate(rules: LootRules, it: BagItem, equip: Record<Slot, Item | null>): Fate {
  if (isGem(it)) return rules.keepGems ? 'keep' : 'sell';
  if (it.r >= rules.minR[it.slot]) return 'keep';
  if (rules.keepUniques && it.r === 3) return 'keep';
  if (rules.keepUpgrades && isUpgrade(it, equip)) return 'keep';
  return rules.autoSalvage ? 'salvage' : 'sell';
}
