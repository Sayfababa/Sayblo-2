import { AREAS, HERO, START_SKILL, UNLOCKED_AT_START } from '../content/index.ts';
import type { CastSlot, SaveState } from './types.ts';

export const SAVE_VERSION = 3;

export const emptySlots = (): CastSlot[] => [
  { id: START_SKILL, cond: 'always' }, { id: null, cond: 'always' }, { id: null, cond: 'always' }, { id: null, cond: 'always' },
];

export function newSaveState(): SaveState {
  return {
    v: SAVE_VERSION,
    lvl: 1, xp: 0, gold: HERO.startGold,
    attrs: { ...HERO.startAttributes }, attrPts: 0, skillPts: 1,
    skills: { [START_SKILL]: 1 },
    slots: emptySlots(),
    equip: { weapon: null, helm: null, armor: null, amulet: null, ring: null },
    bag: [], filter: 0,
    hpPot: HERO.potions.start, mpPot: HERO.potions.start, hpTh: HERO.potions.lifeThreshold, mpTh: HERO.potions.manaThreshold,
    zone: 0, unlocked: Math.min(UNLOCKED_AT_START, AREAS.length),
    autoAdvance: true, autoReturn: true, kite: true, speed: 1,
    life: null, mana: null, barrier: 0,
    kills: 0, deaths: 0,
    nextId: 1,
    savedAt: 0,
  };
}
