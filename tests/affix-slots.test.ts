import { describe, expect, it } from 'vitest';
import { AFFIXES, SLOT_KINDS, UNIQUES } from '../src/content/index.ts';
import { affixFits, genItem } from '../src/sim/items.ts';
import { Rng } from '../src/sim/rng.ts';

describe('affixes fit their slot', () => {
  it('weapons never roll defense, helm and armor never roll damage, jewellery rolls both', () => {
    expect(SLOT_KINDS.weapon).not.toContain('defense');
    for (const s of ['helm', 'armor'] as const) expect(SLOT_KINDS[s]).not.toContain('offense');
    for (const s of ['ring', 'amulet'] as const) expect(SLOT_KINDS[s]).toEqual(expect.arrayContaining(['offense', 'defense']));
  });

  it('every rolled item only carries affixes its slot allows', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 4000; i++) {
      const it = genItem(rng, i, 1 + (i % 60), 2, false);
      for (const [k] of it.mods.slice(it.imp)) expect(affixFits(k, it.slot), `${it.slot} ${k}`).toBe(true);
    }
  });

  it('helm and armor can roll the new defense prefixes', () => {
    const rng = new Rng(8), seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const it = genItem(rng, i, 40, 2, false);
      if (it.slot === 'helm' || it.slot === 'armor') for (const [k] of it.mods.slice(it.imp)) seen.add(k);
    }
    for (const k of ['lifePct', 'barrierRegen', 'elemDR', 'lifeRegen', 'manaRegen']) expect(seen.has(k), k).toBe(true);
  });

  it('uniques follow the same rule', () => {
    for (const [id, u] of Object.entries(UNIQUES)) for (const k of u.mods) expect(affixFits(k, u.slot), `${id} ${k}`).toBe(true);
  });

  it('every affix has a kind', () => {
    for (const [k, a] of Object.entries(AFFIXES)) expect(['offense', 'defense', 'mana'], k).toContain(a.kind);
  });
});
