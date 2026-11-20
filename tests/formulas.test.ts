import { describe, expect, it } from 'vitest';
import {
  afterHeroRes, afterMonsterRes, affixValue, calcStats, castTime, damageRange, itemScore, manaCost, monsterDmg, monsterHp,
  monsterXp, sellValue, skillMult, xpNeeded,
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

describe('damage', () => {
  it('skill level and synergy', () => {
    expect(skillMult({ fireball: 1 }, 'fireball')).toBeCloseTo(1);
    expect(skillMult({ fireball: 3 }, 'fireball')).toBeCloseTo(1.44);
    expect(skillMult({ fireball: 1, meteor: 2 }, 'fireball')).toBeCloseTo(1.16);
    // other trees do not give synergy
    expect(skillMult({ fireball: 1, chain: 5 }, 'fireball')).toBeCloseTo(1);
  });
  it('damage range uses spell and element damage', () => {
    const s = newSaveState();
    s.equip.weapon = item([['spellDmg', 15], ['fireDmg', 80]], { slot: 'weapon' });
    const st = calcStats(s);
    expect(damageRange(s.skills, st, 'fireball')).toEqual([Math.round(6 * 2), Math.round(11 * 2)]);
  });
  it('mana cost grows with level', () => {
    expect(manaCost({ fireball: 1 }, 'fireball')).toBe(5);
    expect(manaCost({ meteor: 11 }, 'meteor')).toBe(Math.round(16 * 1.6));
  });
  it('resistance reduces damage', () => {
    expect(afterMonsterRes(100, 0.25)).toBe(75);
    expect(afterMonsterRes(0.2, 0.5)).toBe(1);
    expect(afterHeroRes(100, 75)).toBe(25);
    expect(afterHeroRes(100, -40)).toBe(140);
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
