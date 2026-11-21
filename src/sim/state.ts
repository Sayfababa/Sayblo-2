import { AREAS, ECONOMY, HERO, START_SKILL, UNLOCKED_AT_START } from '../content/index.ts';
import { newMeta } from './meta-types.ts';
import type { CastSlot, LootRules, RiftSave, SaveState } from './types.ts';

export const SAVE_VERSION = 9;

/** Sounds are on by default, but quiet. */
export const DEFAULT_VOLUME = 0.3;

export const emptySlots = (): CastSlot[] => [
  { id: START_SKILL, cond: 'always' }, { id: null, cond: 'always' }, { id: null, cond: 'always' }, { id: null, cond: 'always' },
];

export const defaultLoot = (minR = 0): LootRules => ({
  minR: { weapon: minR, helm: minR, armor: minR, amulet: minR, ring: minR }, ...ECONOMY.lootDefaults,
});

export const newRiftSave = (): RiftSave => ({ open: false, maxTier: 0, best: {}, atlas: {}, frags: 0, pinnacle: 0, auto: false, cur: null, runs: 0, fails: 0 });

export function newSaveState(): SaveState {
  return {
    v: SAVE_VERSION,
    lvl: 1, xp: 0, gold: HERO.startGold,
    attrs: { ...HERO.startAttributes }, attrPts: 0, skillPts: 1,
    skills: { [START_SKILL]: 1 },
    sockets: {},
    skillMods: {},
    slots: emptySlots(),
    equip: { weapon: null, helm: null, armor: null, amulet: null, ring: null },
    bag: [], loot: defaultLoot(), mats: { dust: 0, essence: 0, shard: 0 },
    stash: Array.from({ length: ECONOMY.stash.tabs }, () => []),
    hpPot: HERO.potions.start, mpPot: HERO.potions.start, hpTh: HERO.potions.lifeThreshold, mpTh: HERO.potions.manaThreshold,
    difficulty: 0, progress: [Math.min(UNLOCKED_AT_START, AREAS.length), 0, 0],
    zone: 0,
    autoAdvance: true, autoReturn: true, kite: true, speed: 1,
    settings: { dmgNumbers: true, lootLabels: true, sound: true, volume: DEFAULT_VOLUME },
    life: null, mana: null, barrier: 0,
    kills: 0, deaths: 0,
    rift: newRiftSave(),
    nextId: 1,
    savedAt: 0,
    meta: newMeta(),
  };
}
