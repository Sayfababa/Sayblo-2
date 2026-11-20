import { describe, expect, it } from 'vitest';
import {
  afterHeroRes, afterRes, affixValue, calcStats, castTime, damageRange, gemFits, gemValue, hitDamage, itemScore, monsterDmg, monsterHp,
  monsterXp, sellValue, skillCtx, total, xpFactor, xpNeeded,
} from '../src/sim/formulas.ts';
import { newSaveState } from '../src/sim/state.ts';
import type { Item } from '../src/sim/types.ts';

const item = (mods: [string, number][], over: Partial<Item> = {}): Item =>
  ({ id: 1, slot: 'ring', base: 'Ring', name: 'Ring', r: 1, L: 5, imp: 0, mods, ...over });

describe('experience and monsters', () => {
  it('xp curve matches the demo', () => {
    expect(xpNeeded(1)).toBe(50);
    expect(xpNeeded(2)).toBe(Math.round(30 * 1.36 + 40));
    for (let l = 1; l < 50; l++) expect(xpNeeded(l + 1)).toBeGreaterThan(xpNeeded(l));
  });
  it('monster scaling', () => {
    expect(monsterHp('imp', 1, 0)).toBe(18);
    expect(monsterHp('imp', 1, 3)).toBe(18 * 24);
    expect(monsterHp('husk', 7, 0)).toBe(Math.round(18 * 1.17 ** 6 * 1.6));
    expect(monsterDmg('imp', 1, 0)).toBeCloseTo(2.4);
    expect(monsterDmg('imp', 3, 2)).toBeCloseTo(2.4 * 1.15 ** 2 * 1.7);
    expect(monsterXp(1, 0)).toBe(5);
    expect(monsterXp(1, 2)).toBe(30);
  });
});

describe('hero stats', () => {
  it('base stats of a new hero', () => {
    const st = calcStats(newSaveState());
    expect(st.maxLife).toBe(40 + 10 * 3);
    expect(st.maxMana).toBe(20 + 10 * 2);
    expect(st.crit).toBeCloseTo(5 + 5 * 0.4);
    expect(st.spellDmg).toBe(5);
    expect(castTime(st)).toBeCloseTo(1 / 1.05);
  });
  it('resistances add up and cap at 75 %', () => {
    const s = newSaveState();
    s.equip.ring = item([['fireRes', 60], ['allRes', 30]]);
    const st = calcStats(s);
    expect(st.res.fire).toBe(75);
    expect(st.res.cold).toBe(30);
  });
  it('dodge and crit are capped', () => {
    const s = newSaveState();
    s.equip.ring = item([['dodge', 90], ['crit', 90]]);
    const st = calcStats(s);
    expect(st.dodge).toBe(40);
    expect(st.crit).toBe(60);
  });
  it('attributes from items count', () => {
    const s = newSaveState();
    s.equip.amulet = item([['vit', 10], ['life', 7]], { slot: 'amulet' });
    expect(calcStats(s).maxLife).toBe(40 + 20 * 3 + 7);
  });
});

const ctx = (skills: Record<string, number>, id: string, mutate?: (s: ReturnType<typeof newSaveState>) => void) => {
  const s = newSaveState();
  s.skills = skills;
  mutate?.(s);
  return skillCtx(s, calcStats(s), id);
};

describe('damage', () => {
  it('skill level raises base damage, same-tree points add increased damage', () => {
    expect(ctx({ fireball: 1 }, 'fireball').levelMult).toBeCloseTo(1);
    expect(ctx({ fireball: 3 }, 'fireball').levelMult).toBeCloseTo(1.44);
    // power 5 = +5% spell damage, 2 points in meteor = +16%
    expect(ctx({ fireball: 1, meteor: 2 }, 'fireball').inc.fire).toBe(5 + 16);
    expect(ctx({ fireball: 1, chain: 5 }, 'fireball').inc.fire).toBe(5);
  });
  it('increased damage adds up, more damage multiplies', () => {
    const c = ctx({ fireball: 1 }, 'fireball', s => {
      s.equip.weapon = item([['spellDmg', 15], ['fireDmg', 80]], { slot: 'weapon' });
      s.sockets.fireball = [{ id: 9, kind: 'gem', gem: 'concentrated', lvl: 1 }, { id: 10, kind: 'gem', gem: 'multi', lvl: 1 }, null];
    });
    expect(c.inc.fire).toBe(5 + 15 + 80);
    // concentrated power only fits area skills, multiple projectiles: 30% less
    expect(c.more).toBeCloseTo(0.7);
    expect(c.projectiles).toBe(3);
    const lo = total(hitDamage({ ...c, critChance: -1 }, () => 0).dmg);
    expect(lo).toBeCloseTo(6 * 2 * 0.7);
  });
  it('added damage of another element keeps its own element', () => {
    const c = ctx({ fireball: 1 }, 'fireball', s => { s.sockets.fireball = [{ id: 9, kind: 'gem', gem: 'addedcold', lvl: 1 }, null, null]; });
    const d = hitDamage({ ...c, critChance: -1 }, () => 0.5).dmg;
    expect(d.cold).toBeGreaterThan(0);
    expect(d.fire).toBeGreaterThan(0);
  });
  it('crits use the crit multiplier', () => {
    const c = ctx({ fireball: 1 }, 'fireball');
    const a = total(hitDamage({ ...c, critChance: -1 }, () => 0).dmg), b = total(hitDamage({ ...c, critChance: 101 }, () => 0).dmg);
    expect(b / a).toBeCloseTo(1.5);
  });
  it('resistance, penetration and shock', () => {
    const d = { fire: 100, cold: 0, light: 0 };
    expect(afterRes(d, { fire: 0.25, cold: 0, light: 0 }, { fire: 0, cold: 0, light: 0 }).fire).toBeCloseTo(75);
    expect(afterRes(d, { fire: 0.25, cold: 0, light: 0 }, { fire: 10, cold: 0, light: 0 }).fire).toBeCloseTo(85);
    expect(afterRes(d, { fire: 0, cold: 0, light: 0 }, { fire: 0, cold: 0, light: 0 }, 1.2).fire).toBeCloseTo(120);
    expect(afterHeroRes(100, 75)).toBe(25);
    expect(afterHeroRes(100, -40)).toBe(140);
  });
  it('mana cost grows with level and gems', () => {
    expect(ctx({ fireball: 1 }, 'fireball').mana).toBe(5);
    expect(ctx({ meteor: 11 }, 'meteor').mana).toBe(Math.round(16 * 1.6));
    expect(ctx({ fireball: 1 }, 'fireball', s => { s.sockets.fireball = [{ id: 9, kind: 'gem', gem: 'efficiency', lvl: 1 }, null, null]; }).mana).toBe(4);
  });
  it('+skill items raise skill and passive levels', () => {
    const c = ctx({ fireball: 1, pyromancy: 1 }, 'fireball', s => { s.equip.amulet = item([['plusEmber', 2]], { slot: 'amulet' }); });
    expect(c.lvl).toBe(3);
    expect(c.inc.fire).toBe(5 + 8 + 3 * 8);
  });
  it('damage range in the tooltip', () => {
    const [a, b] = damageRange(ctx({ fireball: 1 }, 'fireball'));
    expect(a).toBe(Math.round(6 * 1.05));
    expect(b).toBe(Math.round(11 * 0.999 * 1.05 + 0.5 * 0) || b);
  });
});

describe('gems', () => {
  it('only fit skills with the right tags', () => {
    expect(gemFits('multi', 'fireball')).toBe(true);
    expect(gemFits('multi', 'nova')).toBe(false);
    expect(gemFits('wider', 'nova')).toBe(true);
    expect(gemFits('addedfire', 'frostarmor')).toBe(false);
    expect(gemFits('efficiency', 'frostarmor')).toBe(true);
    expect(gemFits('efficiency', 'pyromancy')).toBe(false);
  });
  it('scale with gem level', () => {
    expect(gemValue('wider', 'radius', 1)).toBe(30);
    expect(gemValue('wider', 'radius', 6)).toBe(40);
  });
});

describe('experience penalty', () => {
  it('kicks in above two levels over the monster', () => {
    expect(xpFactor(5, 5)).toBe(1);
    expect(xpFactor(7, 5)).toBe(1);
    expect(xpFactor(10, 5)).toBeCloseTo(0.7);
    expect(xpFactor(50, 1)).toBe(0.1);
  });
});

describe('items', () => {
  it('affix values', () => {
    expect(affixValue('life', 10, 1)).toBe(25);
    expect(affixValue('manaRegen', 10, 1)).toBe(1.5);
    expect(affixValue('crit', 1, 0.1)).toBe(1);
  });
  it('sell value and score', () => {
    expect(sellValue(item([], { L: 5, r: 0 }))).toBe(15);
    expect(sellValue(item([], { L: 5, r: 2 }))).toBe(90);
    expect(itemScore(item([['life', 10], ['crit', 2]]))).toBeCloseTo(10 + 6);
    expect(itemScore(null)).toBe(0);
  });
});
