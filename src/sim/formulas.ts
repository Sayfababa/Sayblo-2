/** Pure game formulas. No state, no randomness: easy to test and to use in balancing scripts. */
import {
  AFFIXES, HERO, ITEMS, MONSTERS, MONSTER_SCALING, RANKS, SKILLS, SKILL_SCALING, SPARK,
  type Attr, type Element,
} from '../content/index.ts';
import type { Item, SaveState } from './types.ts';

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const xpNeeded = (lvl: number) =>
  Math.round(HERO.xpCurve.base * Math.pow(HERO.xpCurve.growth, lvl - 1) + HERO.xpCurve.linear * lvl);

export const monsterHp = (def: string, L: number, rank: number) =>
  Math.round(MONSTER_SCALING.hpBase * Math.pow(MONSTER_SCALING.hpGrowth, L - 1) * MONSTERS[def].hp * RANKS[rank].hp);
export const monsterDmg = (def: string, L: number, rank: number) =>
  MONSTER_SCALING.dmgBase * Math.pow(MONSTER_SCALING.dmgGrowth, L - 1) * MONSTERS[def].dmg * RANKS[rank].dmg;
export const monsterXp = (L: number, rank: number) =>
  Math.round(MONSTER_SCALING.xpBase * Math.pow(MONSTER_SCALING.xpGrowth, L - 1) * RANKS[rank].xp);

export interface Stats {
  a: Record<Attr, number>;
  maxLife: number; maxMana: number; manaRegen: number; lifeRegen: number;
  castSpeed: number; crit: number; spellDmg: number;
  el: Record<Element, number>; res: Record<Element, number>;
  barrier: number; dodge: number;
}

/** Sum of all modifiers on equipped items. */
export function equipMods(s: SaveState): Record<string, number> {
  const m: Record<string, number> = {};
  for (const it of Object.values(s.equip)) if (it) for (const [k, v] of it.mods) m[k] = (m[k] || 0) + v;
  return m;
}

export function calcStats(s: SaveState): Stats {
  const m = equipMods(s), g = (k: string) => m[k] || 0, B = HERO.base, C = HERO.caps;
  const a = { power: s.attrs.power + g('power'), focus: s.attrs.focus + g('focus'), spirit: s.attrs.spirit + g('spirit'), vit: s.attrs.vit + g('vit') };
  const res = (k: Element) => clamp(g(k + 'Res') + g('allRes'), C.resMin, C.res);
  return {
    a,
    maxLife: Math.round(B.life + a.vit * B.lifePerVit + (s.lvl - 1) * HERO.perLevel.life + g('life')),
    maxMana: Math.round(B.mana + a.spirit * B.manaPerSpirit + (s.lvl - 1) * HERO.perLevel.mana + g('mana')),
    manaRegen: B.manaRegen + a.spirit * B.manaRegenPerSpirit + g('manaRegen'),
    lifeRegen: B.lifeRegen + a.vit * B.lifeRegenPerVit,
    castSpeed: a.focus + g('castSpeed'),
    crit: Math.min(C.crit, B.crit + a.focus * B.critPerFocus + g('crit')),
    spellDmg: a.power + g('spellDmg'),
    el: { fire: g('fireDmg'), cold: g('coldDmg'), light: g('lightDmg') },
    res: { fire: res('fire'), cold: res('cold'), light: res('light') },
    barrier: g('barrier'),
    dodge: Math.min(C.dodge, g('dodge')),
  };
}

export const castTime = (st: Stats) => 1 / (1 + st.castSpeed / 100);

/** Skill level and same-tree synergy multiplier. */
export function skillMult(skills: Record<string, number>, id: string): number {
  if (id === 'spark') return 1;
  const s = SKILLS[id], lv = skills[id] || 0;
  let syn = 0;
  for (const k in SKILLS) if (k !== id && SKILLS[k].tree === s.tree) syn += skills[k] || 0;
  return (1 + SKILL_SCALING.damagePerLevel * (lv - 1)) * (1 + SKILL_SCALING.synergyPerPoint * syn);
}
export const sparkMult = (lvl: number) => 1 + SPARK.perLevel * (lvl - 1);

export const manaCost = (skills: Record<string, number>, id: string) =>
  Math.round(SKILLS[id].mana * (1 + SKILL_SCALING.manaPerLevel * ((skills[id] || 1) - 1)));

export function damageRange(skills: Record<string, number>, st: Stats, id: string): [number, number] {
  const s = SKILLS[id];
  const f = skillMult(skills, id) * (1 + (st.spellDmg + st.el[s.element]) / 100);
  return [Math.round((s.min || 0) * f), Math.round((s.max || 0) * f)];
}

/** Damage after the target's resistance (fraction, e.g. 0.25 = 25 %). Always at least 1. */
export const afterMonsterRes = (dmg: number, res: number) => Math.max(1, Math.round(dmg * (1 - res)));
/** Damage the hero takes after her resistance in percent (already capped). */
export const afterHeroRes = (dmg: number, resPct: number) => dmg * (1 - resPct / 100);

export const frostArmorBarrier = (lv: number) => {
  const s = SKILLS.frostarmor;
  return (s.barrierBase || 0) + (s.barrierPerLevel || 0) * lv;
};

export function affixValue(k: string, L: number, roll: number): number {
  const a = AFFIXES[k], v = (a.base + a.perLevel * L) * roll;
  return a.decimals ? Math.round(v * 10 ** a.decimals) / 10 ** a.decimals : Math.max(1, Math.round(v));
}
export const formatMod = ([k, v]: [string, number]) => {
  const a = AFFIXES[k];
  return a.percent ? `+${v}% ${a.text}` : `+${v} ${a.text}`;
};
export const itemScore = (it: Item | null) => (it ? it.mods.reduce((s, [k, v]) => s + v * AFFIXES[k].weight, 0) : 0);
export const sellValue = (it: Item) => Math.round((it.L * ITEMS.sell.perLevel + ITEMS.sell.base) * (1 + it.r * ITEMS.sell.perRarity));

export const potionPrice = (lvl: number) => HERO.potions.priceBase + lvl * HERO.potions.pricePerLevel;
export const respecCost = (lvl: number) => lvl * HERO.respecPerLevel;
