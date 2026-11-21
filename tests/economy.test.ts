import { describe, expect, it } from 'vitest';
import { AFFIXES, AFFIX_TIERS, ECONOMY, SLOTS, UNIQUES, type Slot } from '../src/content/index.ts';
import {
  applyEmber, bestTier, canAfford, corrupt, craftCost, craftableMods, emberBlock, gambleItem, gamblePrice, salvageYield,
} from '../src/sim/crafting.ts';
import { fromStash, gamble, identify, salvage, salvageBelow, toStash, forge, corruptItem } from '../src/sim/economy.ts';
import { affixFits, genItemOf } from '../src/sim/items.ts';
import { lootFate } from '../src/sim/loot.ts';
import { Rng } from '../src/sim/rng.ts';
import { migrate } from '../src/sim/save.ts';
import { Sim } from '../src/sim/sim.ts';
import { SAVE_VERSION, defaultLoot, newSaveState } from '../src/sim/state.ts';
import type { GemItem, Item } from '../src/sim/types.ts';

const rare = (slot: Slot = 'ring', L = 30, seed = 1): Item => {
  const rng = new Rng(seed);
  for (;;) { const it = genItemOf(rng, 1, L, 2, slot); if (it.mods.length - it.imp >= 3) return it; }
};
const magic = (slot: Slot = 'amulet', L = 20): Item => genItemOf(new Rng(4), 2, L, 1, slot);
/** every non-implicit mod fits the slot and the prefix/suffix limits of its rarity */
function checkLegal(it: Item) {
  const aff = it.mods.slice(it.imp).filter((_, i) => i + it.imp !== it.cm);
  for (const m of aff) expect(affixFits(m[0], it.slot)).toBe(true);
  expect(new Set(aff.map(m => m[0])).size).toBe(aff.length);
  const lim = it.r === 1 ? 1 : 3;
  expect(aff.filter(m => AFFIXES[m[0]].group === 'prefix').length).toBeLessThanOrEqual(lim);
  expect(aff.filter(m => AFFIXES[m[0]].group === 'suffix').length).toBeLessThanOrEqual(lim);
  for (const m of aff) expect(m[2]! >= bestTier(it.L)).toBe(true);
}

describe('salvage', () => {
  it('gives more for better and higher items', () => {
    const base = { id: 1, slot: 'ring' as Slot, base: 'Ring', name: 'x', imp: 0, mods: [] };
    const n = salvageYield({ ...base, r: 0, L: 10 }), m = salvageYield({ ...base, r: 1, L: 10 }), r = salvageYield({ ...base, r: 2, L: 10 }), u = salvageYield({ ...base, r: 3, L: 10 });
    expect(n.dust).toBeGreaterThan(0);
    expect(m.dust!).toBeGreaterThan(n.dust!);
    expect(r.essence).toBeGreaterThan(0);
    expect(u.shard).toBeGreaterThan(0);
    expect(salvageYield({ ...base, r: 0, L: 60 }).dust!).toBeGreaterThan(n.dust!);
  });
  it('salvages from the bag, never gems', () => {
    const sim = new Sim(undefined, { seed: 3, headless: true });
    const gem: GemItem = { id: 900, kind: 'gem', gem: 'quick', lvl: 1 };
    sim.s.bag = [{ ...rare(), id: 50, bx: 0, by: 0 }, { ...magic(), id: 51, bx: 1, by: 0 }, { ...gem, bx: 2, by: 0 }];
    expect(salvage(sim, 900)).toBeTruthy();
    expect(salvage(sim, 50)).toBeNull();
    expect(sim.s.mats.essence).toBeGreaterThan(0);
    const r = salvageBelow(sim, 3);
    expect(r.n).toBe(1);
    expect(sim.s.bag.map(i => i.id)).toEqual([900]);
  });
});

describe('crafting embers', () => {
  it('Ember of Change rerolls one affix and keeps the item legal', () => {
    const rng = new Rng(9);
    let it = rare('amulet');
    for (let i = 0; i < 40; i++) {
      const res = applyEmber(rng, it, 'change');
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const diff = res.item.mods.filter((m, j) => m[0] !== it.mods[j][0]).length;
      expect(diff).toBe(1);
      checkLegal(res.item);
      expect(res.item.cr).toBe(i + 1);
      it = res.item;
    }
  });
  it('does not change its input', () => {
    const it = rare(), before = JSON.stringify(it);
    applyEmber(new Rng(1), it, 'choice', it.imp);
    applyEmber(new Rng(1), it, 'whet', it.imp);
    expect(JSON.stringify(it)).toBe(before);
  });
  it('Ember of Choice rerolls the chosen affix only', () => {
    const it = rare(), i = it.imp + 1;
    const res = applyEmber(new Rng(2), it, 'choice', i);
    expect(res.ok && res.item.mods[i][0] !== it.mods[i][0]).toBe(true);
    if (res.ok) res.item.mods.forEach((m, j) => { if (j !== i) expect(m).toEqual(it.mods[j]); });
  });
  it('Whetstone stays inside the tier', () => {
    const it = rare(), i = it.imp, rng = new Rng(5), [k, , t] = it.mods[i];
    const lvl = AFFIX_TIERS.find(x => x.tier === t)!.level, a = AFFIXES[k];
    for (let n = 0; n < 30; n++) {
      const res = applyEmber(rng, it, 'whet', i);
      if (!res.ok) throw new Error(res.err);
      const [k2, v, t2] = res.item.mods[i];
      expect(k2).toBe(k); expect(t2).toBe(t);
      expect(v).toBeGreaterThanOrEqual(Math.floor((a.base + a.perLevel * lvl) * 0.8) - 1);
      expect(v).toBeLessThanOrEqual(Math.ceil(a.base + a.perLevel * lvl) + 1);
    }
  });
  it('Rising Ember raises one tier and respects the item level', () => {
    const it = rare('ring', 30), i = it.imp;
    it.mods[i] = ['crit', 2, 4];
    const res = applyEmber(new Rng(1), it, 'rise', i);
    expect(res.ok && res.item.mods[i][2]).toBe(3);
    if (res.ok) expect(res.item.mods[i][1]).toBeGreaterThanOrEqual(2);
    // item level 30 allows T2 at best, not T1
    it.mods[i] = ['crit', 7, 2];
    expect(emberBlock(it, 'rise', i)).toMatch(/item level/i);
    it.mods[i] = ['crit', 7, 1];
    expect(emberBlock(it, 'rise', i)).toMatch(/best tier/);
  });
  it('Binding Ember turns magic into rare and keeps the affixes', () => {
    const it = magic(), res = applyEmber(new Rng(3), it, 'bind');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.item.r).toBe(2);
    for (const m of it.mods) expect(res.item.mods).toContainEqual(m);
    expect(res.item.mods.length - res.item.imp).toBeGreaterThanOrEqual(3);
    checkLegal(res.item);
    expect(emberBlock(res.item, 'bind', null)).toBeTruthy();
  });
  it('Sealing Wax protects an affix from the next reroll, then crumbles', () => {
    const rng = new Rng(8);
    let it = rare('amulet');
    const w = it.imp + 1;
    const waxed = applyEmber(rng, it, 'wax', w);
    if (!waxed.ok) throw new Error(waxed.err);
    it = waxed.item;
    expect(it.wax).toBe(w);
    expect(emberBlock(it, 'choice', w)).toMatch(/wax/);
    const res = applyEmber(rng, it, 'change');
    if (!res.ok) throw new Error(res.err);
    expect(res.item.mods[w]).toEqual(it.mods[w]);
    expect(res.item.wax).toBeUndefined();
  });
  it('blocks normal, unique, sealed and unidentified items', () => {
    const n = genItemOf(new Rng(1), 1, 10, 0, 'helm');
    expect(emberBlock(n, 'change', null)).toBeTruthy();
    expect(emberBlock({ ...rare(), r: 3 }, 'change', null)).toBeTruthy();
    expect(emberBlock({ ...rare(), seal: true }, 'whet', 1)).toMatch(/Sealed/);
    expect(emberBlock({ ...rare(), unid: true }, 'whet', 1)).toMatch(/Identify/);
    expect(emberBlock(rare(), 'whet', null)).toMatch(/Tap an affix/);
  });
  it('costs grow with item level and with every craft', () => {
    const a = rare('ring', 10), b = rare('ring', 50);
    expect(craftCost(b, 'change').dust!).toBeGreaterThan(craftCost(a, 'change').dust!);
    expect(craftCost({ ...a, cr: 10 }, 'change').dust!).toBeGreaterThan(craftCost(a, 'change').dust!);
    expect(canAfford({ dust: 5 }, { dust: 6 })).toBe(false);
    expect(canAfford({ dust: 6, essence: 1 }, { dust: 6 })).toBe(true);
  });
  it('the forge pays materials and changes equipped items in place', () => {
    const sim = new Sim(undefined, { seed: 2, headless: true });
    const it = { ...rare('ring'), id: 77 };
    sim.s.equip.ring = it;
    const cost = craftCost(it, 'whet');
    expect(forge(sim, 77, 'whet', it.imp, cost)).toMatch(/Not enough/);
    sim.s.mats.dust = 1000;
    expect(forge(sim, 77, 'whet', it.imp, cost)).toBeNull();
    expect(sim.s.mats.dust).toBe(1000 - cost.dust!);
    expect(sim.s.equip.ring).toBe(it);
    expect(it.cr).toBe(1);
  });
});

describe('corruption altar', () => {
  it('has four outcomes of about 25% each and works once per item', () => {
    const rng = new Rng(12), n: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const it = rare('amulet', 40, i % 50 + 1), res = corrupt(rng, it);
      if (!res.ok) throw new Error(res.err);
      n[res.outcome!] = (n[res.outcome!] || 0) + 1;
      expect(res.item.cor).toBeGreaterThan(0);
      expect(corrupt(rng, res.item).ok).toBe(false);
      if (res.outcome === 'seal' || res.outcome === 'replace') expect(res.item.seal).toBe(true);
      if (res.outcome === 'extra') { expect(res.item.mods.length).toBe(it.mods.length + 1); expect(res.item.cm).toBe(it.mods.length); }
      if (res.outcome === 'double') { const i2 = res.item.cm!; expect(res.item.mods[i2][1]).toBeGreaterThanOrEqual(it.mods[i2][1] * 2 - 1); }
      if (res.outcome === 'extra' || res.outcome === 'double') {
        expect(res.item.seal).toBeFalsy();
        expect(craftableMods(res.item)).not.toContain(res.item.cm);
      }
    }
    for (const k of ['extra', 'double', 'seal', 'replace']) { expect(n[k]).toBeGreaterThan(400); expect(n[k]).toBeLessThan(600); }
  });
  it('the altar takes essence and gold', () => {
    const sim = new Sim(undefined, { seed: 2, headless: true });
    sim.s.bag = [{ ...rare(), id: 60, bx: 0, by: 0 }];
    expect(corruptItem(sim, 60).err).toBeTruthy();
    sim.s.mats.essence = 50; sim.s.gold = 100000;
    expect(corruptItem(sim, 60).err).toBeNull();
    expect(sim.s.mats.essence).toBeLessThan(50);
    expect(corruptItem(sim, 60).err).toMatch(/already/);
  });
});

describe('gambling vendor', () => {
  it('price rises with level', () => {
    expect(gamblePrice(40, 'ring')).toBeGreaterThan(gamblePrice(10, 'ring'));
    expect(gamblePrice(10, 'weapon')).toBeGreaterThan(gamblePrice(10, 'helm'));
  });
  it('gives unidentified items of the chosen slot, sometimes uniques', () => {
    const rng = new Rng(4);
    let uniques = 0;
    for (const slot of SLOTS) for (let i = 0; i < 400; i++) {
      const it = gambleItem(rng, i, 20, slot);
      expect(it.slot).toBe(slot); expect(it.unid).toBe(true); expect(it.L).toBe(20);
      expect(it.r).toBeGreaterThanOrEqual(1);
      if (it.r === 3) { uniques++; expect(UNIQUES[it.u!].slot).toBe(slot); }
    }
    expect(uniques).toBeGreaterThan(10); expect(uniques).toBeLessThan(80);
  });
  it('costs gold, lands in the bag and can be identified', () => {
    const sim = new Sim(undefined, { seed: 5, headless: true });
    sim.s.gold = 0;
    expect(gamble(sim, 'helm').err).toBeTruthy();
    sim.s.gold = 100000;
    const r = gamble(sim, 'helm');
    expect(r.err).toBeNull();
    expect(sim.s.gold).toBe(100000 - gamblePrice(sim.areaLevel(), 'helm'));
    const it = sim.s.bag.find(i => i.id === r.item!.id) as Item;
    expect(it.unid).toBe(true);
    sim.equip(it.id);
    expect(sim.s.equip.helm).toBeNull();
    identify(sim, it.id);
    expect(it.unid).toBeFalsy();
  });
});

describe('loot filter rules', () => {
  const equip = { weapon: null, helm: null, armor: null, amulet: null, ring: null };
  it('keeps by rarity per slot, uniques, gems and upgrades', () => {
    const rules = { ...defaultLoot(2), keepUpgrades: false };
    rules.minR.ring = 0;
    expect(lootFate(rules, { ...magic('amulet') }, equip)).toBe('salvage');
    expect(lootFate(rules, { ...magic('ring') }, equip)).toBe('keep');
    expect(lootFate({ ...rules, autoSalvage: false }, magic('amulet'), equip)).toBe('sell');
    expect(lootFate({ ...defaultLoot(3), keepUniques: true }, { ...rare(), r: 3 }, equip)).toBe('keep');
    const gem: GemItem = { id: 1, kind: 'gem', gem: 'quick', lvl: 1 };
    expect(lootFate(rules, gem, equip)).toBe('keep');
    expect(lootFate({ ...rules, keepGems: false }, gem, equip)).toBe('sell');
    expect(lootFate({ ...rules, keepUpgrades: true }, magic('amulet'), equip)).toBe('keep');
  });
  it('the sim salvages filtered drops', () => {
    const sim = new Sim(undefined, { seed: 1, headless: true });
    for (const k of SLOTS) sim.s.loot.minR[k] = 3;
    sim.s.loot.keepUpgrades = false;
    sim.advance(600);
    expect(sim.s.bag.filter(i => i.kind !== 'gem' && i.r < 3)).toHaveLength(0);
    expect(sim.s.mats.dust).toBeGreaterThan(0);
  });
});

describe('stash and save', () => {
  it('moves items between bag and stash tabs', () => {
    const sim = new Sim(undefined, { seed: 1, headless: true });
    sim.s.bag = [{ ...rare(), id: 70, bx: 0, by: 0 }];
    expect(toStash(sim, 70, 2)).toBeNull();
    expect(sim.s.bag).toHaveLength(0);
    expect(sim.s.stash[2].map(i => i.id)).toEqual([70]);
    expect(fromStash(sim, 70, 1)).toBeTruthy();
    expect(fromStash(sim, 70, 2)).toBeNull();
    expect(sim.s.bag.map(i => i.id)).toEqual([70]);
  });
  it('migrates the old pick-up filter into loot rules', () => {
    const old = { ...newSaveState(), v: 4, filter: 2 } as Record<string, unknown>;
    delete old.loot; delete old.mats; delete old.stash;
    const s = migrate(old);
    expect(s.v).toBe(SAVE_VERSION);
    expect(Object.values(s.loot.minR)).toEqual([2, 2, 2, 2, 2]);
    expect(s.loot.autoSalvage).toBe(false);
    expect(s.loot.keepGems).toBe(true);
    expect(s.mats).toEqual({ dust: 0, essence: 0, shard: 0 });
    expect(s.stash).toHaveLength(ECONOMY.stash.tabs);
    expect('filter' in s).toBe(false);
  });
  it('keeps economy fields through a save round trip and repairs bad ones', () => {
    const s = newSaveState();
    s.mats.dust = 12; s.stash[1] = [{ ...rare(), id: 99, bx: 0, by: 0, cor: 2, cm: 3 }];
    const back = migrate(JSON.parse(JSON.stringify(s)));
    expect(back.mats.dust).toBe(12);
    expect(back.stash[1][0].id).toBe(99);
    expect(back.nextId).toBeGreaterThan(99);
    const bad = migrate({ ...JSON.parse(JSON.stringify(s)), mats: { dust: -4, essence: 'x' }, stash: 'no', loot: { minR: { ring: 9 } } });
    expect(bad.mats).toEqual({ dust: 0, essence: 0, shard: 0 });
    expect(bad.stash.every(t => Array.isArray(t) && !t.length)).toBe(true);
    expect(bad.loot.minR.ring).toBe(3);
  });
});
