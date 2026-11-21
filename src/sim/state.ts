import { AREAS, ECONOMY, HERO, START_SKILL, UNLOCKED_AT_START } from '../content/index.ts';
import type { CastSlot, LootRules, SaveState } from './types.ts';

export const SAVE_VERSION = 5;

export const emptySlots = (): CastSlot[] => [
  { id: START_SKILL, cond: 'always' }, { id: null, cond: 'always' }, { id: null, cond: 'always' }, { id: null, cond: 'always' },
];

export const defaultLoot = (minR = 0): LootRules => ({
  minR: { weapon: minR, helm: minR, armor: minR, amulet: minR, ring: minR }, ...ECONOMY.lootDefaults,
});

export function newSaveState(): SaveState {
  return {
    v: SAVE_VERSION,
    lvl: 1, xp: 0, gold: HERO.startGold,
    attrs: { ...HERO.startAttributes }, attrPts: 0, skillPts: 1,
    skills: { [START_SKILL]: 1 },
    sockets: {},
    slots: emptySlots(),
    equip: { weapon: null, helm: null, armor: null, amulet: null, ring: null },
    bag: [], loot: defaultLoot(), mats: { dust: 0, essence: 0, shard: 0 },
    stash: Array.from({ length: ECONOMY.stash.tabs }, () => []),
    hpPot: HERO.potions.start, mpPot: HERO.potions.start, hpTh: HERO.potions.lifeThreshold, mpTh: HERO.potions.manaThreshold,
    difficulty: 0, progress: [Math.min(UNLOCKED_AT_START, AREAS.length), 0, 0],
    zone: 0,
    autoAdvance: true, autoReturn: true, kite: true, speed: 1,
    settings: { dmgNumbers: true, lootLabels: true },
    life: null, mana: null, barrier: 0,
    kills: 0, deaths: 0,
    nextId: 1,
    savedAt: 0,
  };
}
