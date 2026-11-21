import { describe, expect, it } from 'vitest';
import { POUCH_SIZE } from '../src/content/index.ts';
import { addGem, gemStacks, pouchPick, takeGem } from '../src/sim/pouch.ts';
import { migrate } from '../src/sim/save.ts';
import { Sim } from '../src/sim/sim.ts';
import { newSaveState } from '../src/sim/state.ts';
import type { GemItem } from '../src/sim/types.ts';

const g = (id: number, gem: string, lvl = 1): GemItem => ({ id, kind: 'gem', gem, lvl });

describe('gem pouch', () => {
  it('stacks gems by kind and level, higher level first', () => {
    const st = gemStacks([g(1, 'quick'), g(2, 'quick'), g(3, 'quick', 2), g(4, 'multi'), g(5, 'quick')]);
    expect(st[0]).toMatchObject({ gem: 'quick', lvl: 2, n: 1 });
    expect(st.find(x => x.gem === 'quick' && x.lvl === 1)).toMatchObject({ n: 3, top: { id: 1 } });
    expect(st).toHaveLength(3);
    expect(pouchPick([g(1, 'quick'), g(2, 'quick')]).map(x => x.id)).toEqual([1]);
  });
  it('sells the least valuable gem when full, and takes gems out by id', () => {
    const s = newSaveState();
    for (let i = 0; i < POUCH_SIZE; i++) expect(addGem(s, g(i + 1, 'quick', 2))).toBe(null);
    expect(addGem(s, g(999, 'multi', 1))?.id).toBe(999);
    expect(s.gems).toHaveLength(POUCH_SIZE);
    expect(addGem(s, g(1000, 'multi', 3))?.lvl).toBe(2);
    expect(takeGem(s, 1000)?.gem).toBe('multi');
    expect(takeGem(s, 1000)).toBe(null);
  });
  it('picking up, socketing, unsocketing and selling use the pouch', () => {
    const sim = new Sim(undefined, { seed: 5, headless: true });
    sim.takeItem(g(700, 'multi'), true);
    expect(sim.s.gems.map(x => x.id)).toEqual([700]);
    expect(sim.s.bag).toHaveLength(0);
    expect(sim.socketGem('fireball', 0, 700)).toBe(null);
    expect(sim.s.gems).toHaveLength(0);
    expect(sim.unsocket('fireball', 0)).toBe(null);
    expect(sim.s.gems.map(x => x.id)).toEqual([700]);
    const gold = sim.s.gold;
    sim.sellGem(700);
    expect(sim.s.gems).toHaveLength(0);
    expect(sim.s.gold).toBeGreaterThan(gold);
  });
  it('migrates gems from the bag and the stash into the pouch (v7 to v8)', () => {
    const s7 = { ...newSaveState(), v: 7 } as Record<string, unknown>;
    delete s7.gems;
    s7.bag = [{ id: 30, slot: 'ring', base: 'Band', name: 'Band', r: 1, L: 3, imp: 0, mods: [['castSpeed', 4]], bx: 0, by: 0 }, { ...g(31, 'quick', 2), bx: 1, by: 0 }];
    s7.stash = [[{ ...g(32, 'multi'), bx: 0, by: 0 }], [], [], []];
    const s = migrate(s7);
    expect(s.bag.map(i => i.id)).toEqual([30]);
    expect(s.stash.flat()).toHaveLength(0);
    expect(s.gems.map(x => [x.id, x.gem, x.lvl, x.bx])).toEqual([[31, 'quick', 2, undefined], [32, 'multi', 1, undefined]]);
    expect(s.nextId).toBeGreaterThan(32);
  });
});
