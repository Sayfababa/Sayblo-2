import { describe, expect, it } from 'vitest';
import { SaveError, exportCode, importCode, migrate } from '../src/sim/save.ts';
import { SAVE_VERSION, newSaveState } from '../src/sim/state.ts';
import { Sim } from '../src/sim/sim.ts';

describe('save games', () => {
  it('export and import round trip', async () => {
    const sim = new Sim(undefined, { seed: 7, headless: true });
    sim.advance(300);
    const code = await exportCode(sim.s);
    expect(code.startsWith(`GL${SAVE_VERSION}.`)).toBe(true);
    const back = await importCode(code);
    expect({ ...back, savedAt: 0 }).toEqual({ ...sim.s, savedAt: 0 });
  });
  it('rejects broken codes', async () => {
    const code = await exportCode(newSaveState());
    await expect(importCode('hello')).rejects.toBeInstanceOf(SaveError);
    await expect(importCode(code.slice(0, -10) + 'aaaaaaaaaa')).rejects.toBeInstanceOf(SaveError);
    const parts = code.split('.');
    await expect(importCode(`${parts[0]}.${parts[1].slice(0, -4)}.${parts[2]}`)).rejects.toBeInstanceOf(SaveError);
  });
  it('accepts codes with whitespace and line breaks', async () => {
    const code = await exportCode(newSaveState());
    const spaced = code.replace(/(.{20})/g, '$1\n ');
    expect((await importCode(spaced)).lvl).toBe(1);
  });
  it('migrates a save from the old demo (v2)', () => {
    const old = {
      v: 2, lvl: 4, xp: 12, gold: 99, attrs: { power: 7, focus: 5, spirit: 10, vit: 12 }, attrPts: 1, skillPts: 0,
      skills: { fireball: 2, frostbolt: 1 }, slots: [{ id: 'frostbolt', cond: 'notChilled' }, { id: 'fireball', cond: 'always' }, { id: null, cond: 'always' }, { id: null, cond: 'always' }],
      equip: { weapon: { id: 12, slot: 'weapon', base: 'Bone Wand', name: 'Bone Wand', r: 0, L: 2, imp: 1, mods: [['spellDmg', 11]] }, helm: null, armor: null, amulet: null, ring: null },
      bag: [{ id: 30, slot: 'ring', base: 'Band', name: 'Band of Haste', r: 1, L: 3, imp: 0, mods: [['castSpeed', 4]] }],
      filter: 1, hpPot: 3, mpPot: 5, hpTh: 40, mpTh: 25, zone: 1, unlocked: 2, autoAdvance: true, autoReturn: false, speed: 2,
      life: 50, mana: 20, barrier: 0, kills: 40, deaths: 1,
    };
    const s = migrate(old);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.nextId).toBe(31);
    expect(s.kite).toBe(true);
    expect(s.autoReturn).toBe(false);
    expect(s.equip.weapon?.name).toBe('Bone Wand');
    expect(s.slots[0]).toEqual({ id: 'frostbolt', cond: 'notChilled' });
    expect(s.progress).toEqual([2, 0, 0]);
    expect(s.bag[0].bx).toBe(0);
  });
  it('refuses unknown or newer versions and repairs bad values', () => {
    expect(() => migrate({ v: SAVE_VERSION + 1 })).toThrow(SaveError);
    expect(() => migrate({ v: 1 })).toThrow(SaveError);
    expect(() => migrate('x')).toThrow(SaveError);
    const s = migrate({ v: SAVE_VERSION, lvl: -3, gold: 'lots', zone: 9, progress: [2, 0, 0], difficulty: 2, slots: [{ id: 'nope', cond: 'always' }], speed: 3 });
    expect(s.lvl).toBe(1);
    expect(s.gold).toBe(newSaveState().gold);
    expect(s.zone).toBe(1);
    expect(s.slots[0].id).toBe(null);
    expect(s.speed).toBe(1);
    expect(s.difficulty).toBe(0);
  });
});
