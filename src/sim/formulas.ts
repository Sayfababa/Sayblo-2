/** Pure game formulas. No state, no randomness: easy to test and to use in balancing scripts. */
import {
  AFFIXES, DIFFICULTIES, RIFT, ELEMENTS, GEMS, HERO, ITEMS, MONSTERS, MONSTER_SCALING, RANKS, SKILLS, SKILL_SCALING, SPARK, STATES,
  TREES, isPassive, type Attr, type Element, type SkillDef,
} from '../content/index.ts';
import { isEquip, isGem, type BagItem, type GemItem, type Item, type SaveState } from './types.ts';

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const xpNeeded = (lvl: number) =>
  Math.round(HERO.xpCurve.base * Math.pow(HERO.xpCurve.growth, lvl - 1) + HERO.xpCurve.linear * lvl);

export const monsterHp = (def: string, L: number, rank: number, diff = 0) =>
  Math.round(MONSTER_SCALING.hpBase * Math.pow(MONSTER_SCALING.hpGrowth, L - 1) * MONSTERS[def].hp * RANKS[rank].hp * DIFFICULTIES[diff].hpMult);
export const monsterDmg = (def: string, L: number, rank: number, diff = 0) =>
  MONSTER_SCALING.dmgBase * Math.pow(MONSTER_SCALING.dmgGrowth, L - 1) * MONSTERS[def].dmg * RANKS[rank].dmg * DIFFICULTIES[diff].dmgMult;
export const monsterXp = (L: number, rank: number, diff = 0) =>
  Math.round(MONSTER_SCALING.xpBase * Math.pow(MONSTER_SCALING.xpGrowth, L - 1) * RANKS[rank].xp * DIFFICULTIES[diff].xpMult);

const EL_KEY: Record<Element, string> = { fire: 'fire', cold: 'cold', light: 'light' };
const TREE_PLUS: Record<string, string> = { ember: 'plusEmber', frost: 'plusFrost', storm: 'plusStorm' };

/** Experience is reduced when the hero is far above the monster level. */
export const xpFactor = (heroLvl: number, monLvl: number) =>
  Math.max(HERO.xpPenalty.min, 1 - HERO.xpPenalty.perLevel * Math.max(0, heroLvl - monLvl - HERO.xpPenalty.freeLevels));

export interface Stats {
  /** every modifier from items and passive skills, by affix id */
  mods: Record<string, number>;
  a: Record<Attr, number>;
  maxLife: number; maxMana: number; manaRegen: number; lifeRegen: number;
  castSpeed: number; crit: number; critMulti: number; spellDmg: number;
  el: Record<Element, number>; res: Record<Element, number>; rawRes: Record<Element, number>; pen: Record<Element, number>;
  barrier: number; dodge: number;
  /** % faster barrier recharge, % less elemental damage taken (capped) */
  barrierRegen: number; elemDR: number;
  /** +levels to skill trees */
  plus: Record<string, number>;
  /** ids of equipped uniques */
  uniques: Set<string>;
}

/** Skill level including +skill items (0 if not learned). */
export function effLevel(s: SaveState, plus: Record<string, number>, id: string): number {
  const base = s.skills[id] || 0;
  return base > 0 ? base + (plus[SKILLS[id].tree] || 0) : 0;
}

export function calcStats(s: SaveState): Stats {
  const m: Record<string, number> = {};
  const add = (k: string, v: number) => { m[k] = (m[k] || 0) + v; };
  const uniques = new Set<string>();
  for (const it of Object.values(s.equip)) if (it) { for (const [k, v] of it.mods) add(k, v); if (it.u) uniques.add(it.u); }
  const plus: Record<string, number> = {};
  for (const t of Object.keys(TREES)) plus[t] = m[TREE_PLUS[t]] || 0;
  for (const [id, sk] of Object.entries(SKILLS)) {
    if (!isPassive(id) || !sk.stats) continue;
    const lv = effLevel(s, plus, id);
    if (lv) for (const [k, v] of Object.entries(sk.stats)) add(k, v * lv);
  }
  const g = (k: string) => m[k] || 0, B = HERO.base, C = HERO.caps, pen = DIFFICULTIES[s.difficulty]?.resPenalty ?? 0;
  const a = { power: s.attrs.power + g('power'), focus: s.attrs.focus + g('focus'), spirit: s.attrs.spirit + g('spirit'), vit: s.attrs.vit + g('vit') };
  const raw = (k: Element) => g(EL_KEY[k] + 'Res') + g('allRes');
  const res = (k: Element) => clamp(raw(k) + pen, C.resMin, C.res);
  return {
    mods: m, a, plus, uniques,
    maxLife: Math.round((B.life + a.vit * B.lifePerVit + (s.lvl - 1) * HERO.perLevel.life + g('life')) * (1 + g('lifePct') / 100)),
    maxMana: Math.round(B.mana + a.spirit * B.manaPerSpirit + (s.lvl - 1) * HERO.perLevel.mana + g('mana')),
    manaRegen: B.manaRegen + a.spirit * B.manaRegenPerSpirit + g('manaRegen'),
    lifeRegen: B.lifeRegen + a.vit * B.lifeRegenPerVit + g('lifeRegen'),
    castSpeed: a.focus + g('castSpeed'),
    crit: Math.min(C.crit, B.crit + a.focus * B.critPerFocus + g('crit')),
    critMulti: B.critMult * 100 + g('critMulti'),
    spellDmg: a.power + g('spellDmg'),
    el: { fire: g('fireDmg'), cold: g('coldDmg'), light: g('lightDmg') },
    res: { fire: res('fire'), cold: res('cold'), light: res('light') },
    rawRes: { fire: raw('fire'), cold: raw('cold'), light: raw('light') },
    pen: { fire: g('firePen'), cold: g('coldPen'), light: g('lightPen') },
    barrier: g('barrier'),
    dodge: Math.min(C.dodge, g('dodge')),
    barrierRegen: g('barrierRegen'),
    elemDR: Math.min(C.elemDR, g('elemDR')),
  };
}

export const castTime = (st: Stats) => 1 / (1 + st.castSpeed / 100);

/** Value of a gem effect at a gem level. */
export const gemValue = (gem: string, key: string, lvl: number) => {
  const e = GEMS[gem].effects[key];
  return e ? Math.round((e[0] + e[1] * (lvl - 1)) * 10) / 10 : 0;
};
export const gemFits = (gem: string, skill: string) => {
  const tags = SKILLS[skill].tags || [];
  return !isPassive(skill) && GEMS[gem].requires.every(t => tags.includes(t));
};
export function gemText(g: GemItem): string {
  return GEMS[g.gem].text.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = gemValue(g.gem, k, g.lvl);
    if (k === 'addFire' || k === 'addCold' || k === 'addLight') return `${Math.round(v * 0.6)}–${Math.round(v * 1.4)}`;
    return String(Math.abs(v));
  });
}

/** Everything needed to cast one skill: computed from level, items, passives and socketed gems. */
export interface SkillCtx {
  id: string; def: SkillDef; lvl: number; tags: Set<string>; el: Element;
  mana: number; castTime: number; cooldown: number;
  levelMult: number; inc: Record<Element, number>; more: number; added: Record<Element, [number, number]>;
  critChance: number; critMulti: number; pen: Record<Element, number>;
  burnChance: number; burnMult: number; burnDur: number;
  chillDur: number; chillEff: number; freezeChance: number; shockChance: number; shockEff: number;
  radius: number; projectiles: number; pierce: number; fork: number; chains: number; jumpFalloff: number;
  spread: boolean; echo: boolean; durMult: number;
  /** Ember Heart: part of the cold damage dealt as extra fire */
  extraFire: number;
  /** Gravewhisper: extra cold damage vs shocked enemies */
  shockedCold: number;
  /** Stormcaller's Band: meteor releases a nova */
  meteorNova: boolean;
}

export function skillCtx(s: SaveState, st: Stats, id: string): SkillCtx {
  const spark = id === 'spark';
  const def = (spark ? { ...SPARK, tree: '', abbr: '', reqLevel: 1, row: 0, description: '', tags: ['spell', 'projectile', 'lightning'], mana: 0, cooldown: 0 } : SKILLS[id]) as SkillDef;
  const lvl = spark ? 1 : Math.max(1, effLevel(s, st.plus, id));
  const tags = new Set(def.tags || []);
  const g: Record<string, number> = {};
  let manaMult = 1;
  for (const gm of (spark ? [] : s.sockets[id] || [])) {
    if (!gm || !gemFits(gm.gem, id)) continue;
    manaMult *= GEMS[gm.gem].mana;
    for (const k of Object.keys(GEMS[gm.gem].effects)) {
      const v = gemValue(gm.gem, k, gm.lvl);
      g[k] = k === 'more' ? ((g.more ?? 1) * (1 + v / 100)) : (g[k] || 0) + v;
    }
  }
  const G = (k: string) => g[k] || 0, M = st.mods, mod = (k: string) => M[k] || 0;
  const U = st.uniques;
  let syn = 0;
  if (!spark) for (const k in SKILLS) if (k !== id && SKILLS[k].tree === def.tree) syn += s.skills[k] || 0;
  const generic = (tags.has('spell') ? st.spellDmg : 0) + (tags.has('projectile') ? mod('projDmg') : 0) + (tags.has('area') ? mod('areaDmg') : 0) + syn * SKILL_SCALING.synergyPerPoint;
  let more = g.more ?? 1;
  let projectiles = 1 + G('projectiles'), chains = (def.jumps || 0) + Math.round(G('chains'));
  if (id === 'fireball' && U.has('lantern')) { projectiles += 2; manaMult *= 1.5; }
  if (id === 'chain' && U.has('bell')) { chains += 3; more *= 0.7; }
  const durMult = 1 + G('duration') / 100;
  const addRange = (v: number): [number, number] => [v * 0.6, v * 1.4];
  const added: Record<Element, [number, number]> = {
    fire: addRange(G('addFire') + (tags.has('spell') ? mod('addFire') : 0)),
    cold: addRange(G('addCold') + (tags.has('spell') ? mod('addCold') : 0)),
    light: addRange(G('addLight') + (tags.has('spell') ? mod('addLight') : 0)),
  };
  const S = STATES;
  const baseMana = def.mana || 0;
  return {
    id, def, lvl, tags, el: def.element,
    mana: Math.round(baseMana * (1 + SKILL_SCALING.manaPerLevel * (lvl - 1)) * manaMult * (1 - G('manaLess') / 100)),
    castTime: castTime(st) * (spark ? SPARK.castTimeMult : 1) / (1 + G('castSpeed') / 100),
    cooldown: def.cooldown || 0,
    levelMult: spark ? 1 + SPARK.perLevel * (s.lvl - 1) : 1 + SKILL_SCALING.damagePerLevel * (lvl - 1),
    inc: { fire: generic + st.el.fire, cold: generic + st.el.cold, light: generic + st.el.light },
    more, added,
    critChance: Math.min(HERO.caps.crit + 15, st.crit + (def.critBonus || 0)),
    critMulti: st.critMulti,
    pen: { ...st.pen },
    burnChance: S.baseBurnChance + (def.burnChance || 0) + mod('burnChance') + G('burnChance'),
    burnMult: S.burnRatio * (1 + mod('burnDmg') / 100) * (1 + G('burnMore') / 100),
    burnDur: (S.burnDuration + G('burnDuration')) * durMult,
    chillDur: (def.chill || S.chillDuration) * durMult,
    chillEff: Math.min(S.maxChillEffect, S.baseChillEffect + (def.chillEffect || 0) + mod('chillEffect') + G('chillEffect')) / 100,
    freezeChance: (def.freezeChance || 0) + mod('freezeChance') + G('freezeChance'),
    shockChance: S.baseShockChance + (def.shockChance || 0) + mod('shockChance') + G('shockChance'),
    shockEff: Math.min(S.maxShockEffect, S.baseShockEffect + mod('shockEffect') + G('shockEffect')) / 100,
    radius: (def.radius || 0) * Math.max(0.3, 1 + G('radius') / 100),
    projectiles, pierce: Math.floor(G('pierce')), fork: Math.floor(G('fork')), chains, jumpFalloff: def.jumpFalloff || 0.85,
    spread: G('spread') > 0, echo: G('echo') > 0, durMult,
    extraFire: U.has('emberheart') && tags.has('cold') ? 0.3 : 0,
    shockedCold: U.has('gravewhisper') ? 0.25 : 0,
    meteorNova: id === 'meteor' && U.has('stormcaller'),
  };
}

export type Dmg = Record<Element, number>;

/**
 * Damage of one hit before the target's resistance, in layers:
 * base (skill level) → added flat → increased (sum) → more (product) → crit.
 */
export function hitDamage(c: SkillCtx, r: () => number, mult = 1): { dmg: Dmg; crit: boolean } {
  const d: Dmg = { fire: 0, cold: 0, light: 0 };
  d[c.el] += ((c.def.min || 0) + r() * ((c.def.max || 0) - (c.def.min || 0))) * c.levelMult;
  for (const e of ELEMENTS) { const [a, b] = c.added[e]; if (b > 0) d[e] += a + r() * (b - a); }
  if (c.extraFire) d.fire += d.cold * c.extraFire;
  const crit = r() * 100 < c.critChance;
  for (const e of ELEMENTS) d[e] *= (1 + c.inc[e] / 100) * c.more * mult * (crit ? c.critMulti / 100 : 1);
  return { dmg: d, crit };
}

/** Damage after the target's resistance (fraction) minus penetration (%), times shock. */
export function afterRes(d: Dmg, res: Record<Element, number>, pen: Record<Element, number>, taken = 1): Dmg {
  const out: Dmg = { fire: 0, cold: 0, light: 0 };
  for (const e of ELEMENTS) out[e] = d[e] * (1 - Math.max(-0.5, res[e] - pen[e] / 100)) * taken;
  return out;
}
export const total = (d: Dmg) => d.fire + d.cold + d.light;
export const mainElement = (d: Dmg): Element => (d.fire >= d.cold && d.fire >= d.light ? 'fire' : d.cold >= d.light ? 'cold' : 'light');

/** Average damage of a skill for the tooltip, without crits. */
export function damageRange(c: SkillCtx): [number, number] {
  const n = { ...c, critChance: -1 };
  return [Math.round(total(hitDamage(n, () => 0).dmg)), Math.round(total(hitDamage(n, () => 0.999).dmg))];
}

/** Damage the hero takes after her resistance in percent (already capped). */
export const afterHeroRes = (dmg: number, resPct: number) => dmg * (1 - resPct / 100);

export const frostArmorBarrier = (lv: number) => {
  const s = SKILLS.frostarmor;
  return (s.barrierBase || 0) + (s.barrierPerLevel || 0) * lv;
};

export function affixValue(k: string, tierLevel: number, roll: number): number {
  const a = AFFIXES[k], v = (a.base + a.perLevel * tierLevel) * roll;
  return a.decimals ? Math.round(v * 10 ** a.decimals) / 10 ** a.decimals : Math.max(1, Math.round(v));
}
export const formatMod = ([k, v]: [string, number] | [string, number, number]) => {
  const a = AFFIXES[k];
  return a.percent ? `+${v}% ${a.text}` : `+${v} ${a.text}`;
};
export const gemScore = (g: GemItem) => 20 + g.lvl * 15;
export const itemScore = (it: BagItem | null | undefined): number => {
  if (!it) return 0;
  if (isGem(it)) return gemScore(it);
  if (!isEquip(it)) return 0;
  return it.mods.reduce((s, [k, v]) => s + v * (AFFIXES[k]?.weight ?? 1), 0);
};
/** How much the hero wants to keep an item (for auto-selling when the bag is full). */
export const keepValue = (it: BagItem) => (isGem(it) ? 50 + it.lvl * 30 : !isEquip(it) ? 2000 + it.tier * 10 : itemScore(it) + (it.r >= 3 ? 1000 : it.r * 40));
export const sellValue = (it: BagItem): number => isGem(it)
  ? ITEMS.sell.gemBase + ITEMS.sell.gemPerLevel * it.lvl
  : !isEquip(it) ? RIFT.keys.sellBase + RIFT.keys.sellPerTier * it.tier
  : Math.round((it.L * ITEMS.sell.perLevel + ITEMS.sell.base) * (1 + it.r * ITEMS.sell.perRarity));

export const potionPrice = (lvl: number) => HERO.potions.priceBase + lvl * HERO.potions.pricePerLevel;
export const respecCost = (lvl: number) => lvl * HERO.respecPerLevel;

export type { Item };
