/** Loot package: drop tables, class-aware loot, unique upgrade paths, currency drops, default rules, save v12. */
import { afterEach, describe, expect, it } from 'vitest';
import { AFFIXES, CLASSES, ECONOMY, ITEMS, META, SLOTS, UNIQUES, setActiveClass, type MatId } from '../src/content/index.ts';
import { bountyReward } from '../src/sim/bounty.ts';
import { applyEmber, corrupt, craftCost, emberBlock, gambleItem } from '../src/sim/crafting.ts';
import { forge } from '../src/sim/economy.ts';
import { genItem, genItemOf, genUnique, pickUnique, rollRarity, topTier, uniquePool } from '../src/sim/items.ts';
import { lootFate } from '../src/sim/loot.ts';
import { Rng } from '../src/sim/rng.ts';
import { migrate } from '../src/sim/save.ts';
import { Sim } from '../src/sim/sim.ts';
import { SAVE_VERSION, defaultLoot, newSaveState } from '../src/sim/state.ts';
import type { Item, Mod } from '../src/sim/types.ts';
import { itemPower } from '../src/sim/upgrade.ts';

const SORC_WEAPONS = ITEMS.bases.weapon.map(b => b.name);
const WAR_WEAPONS = CLASSES.warrior.weaponBases!.map(b => b.name);
afterEach(() => setActiveClass('sorceress'));

describe('drop tables', () => {
  it('monster rarity matches the table; uniques are rare', () => {
    const rng = new Rng(9), n = 200000, c = [0, 0, 0, 0], w = ITEMS.dropTables.monster, sum = w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) c[rollRarity(rng, 'monster')]++;
    for (let r = 0; r < 3; r++) expect(c[r] / n).toBeCloseTo(w[r] / sum, 2);
    expect(c[3] / n).toBeGreaterThan(w[3] / sum * 0.7);
    expect(c[3] / n).toBeLessThan(w[3] / sum * 1.3);
    expect(c[3] / n).toBeLessThan(0.005); // well under one in 200 monster items
  });
  it('magic find helps uniques only at half strength', () => {
    const rng = new Rng(3), n = 200000, plain = [0, 0, 0, 0], mf = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) { plain[rollRarity(rng, 'boss')]++; mf[rollRarity(rng, 'boss', 1)]++; }
    // +100 % magic find: rares x2, uniques x1.5, so the unique share of boss drops falls to about three quarters
    const share = (c: number[]) => c[3] / c[2];
    expect(share(mf) / share(plain)).toBeCloseTo(0.75, 1);
  });
  it('every source has a table with no normal-only flood of uniques', () => {
    for (const [k, w] of Object.entries(ITEMS.dropTables)) {
      const share = w[3] / w.reduce((a, b) => a + b, 0);
      expect(share, k).toBeLessThanOrEqual(k === 'pinnacle' ? 0.15 : 0.08);
    }
  });
  it('uniques need their item level', () => {
    for (const u of uniquePool(1)) expect(UNIQUES[u].lvl ?? 1).toBeLessThanOrEqual(1);
    expect(uniquePool(60).length).toBeGreaterThan(uniquePool(10).length);
    const rng = new Rng(4);
    for (let i = 0; i < 2000; i++) { const it = genItem(rng, i, 5, 3, 'boss'); if (it.u) expect(UNIQUES[it.u].lvl ?? 1).toBeLessThanOrEqual(5); }
  });
  it('the rift guardian drops only its own burst, not boss loot on top', async () => {
    const { RIFT } = await import('../src/content/index.ts');
    expect(RIFT.guardian.loot.items[1]).toBeLessThanOrEqual(3);
  });
});

describe('class-aware loot', () => {
  it('a warrior never finds staves or sorceress uniques', () => {
    setActiveClass('warrior');
    const rng = new Rng(7);
    for (let i = 0; i < 6000; i++) {
      const it = genItem(rng, i, 50, i % 3 ? 0 : 3, i % 2 === 0);
      if (it.slot === 'weapon') expect(WAR_WEAPONS, it.name).toContain(it.base);
      if (it.u) expect(UNIQUES[it.u].cls ?? 'warrior').toBe('warrior');
    }
    for (let i = 0; i < 2000; i++) {
      const it = gambleItem(rng, i, 40, 'weapon');
      expect(WAR_WEAPONS).toContain(it.base);
      if (it.u) expect(UNIQUES[it.u].cls ?? 'warrior').toBe('warrior');
    }
  });
  it('a sorceress never finds warrior weapons or warrior uniques', () => {
    setActiveClass('sorceress');
    const rng = new Rng(8);
    for (let i = 0; i < 6000; i++) {
      const it = genItem(rng, i, 50, i % 3 ? 0 : 3, false);
      if (it.slot === 'weapon') expect(SORC_WEAPONS).toContain(it.base);
      if (it.u) expect(UNIQUES[it.u].cls ?? 'sorceress').toBe('sorceress');
    }
  });
  it('class-neutral weapon uniques take a base of the class', () => {
    setActiveClass('warrior');
    expect(WAR_WEAPONS).toContain(genUnique(new Rng(1), 1, 60, 'pyrewright').base);
    setActiveClass('sorceress');
    expect(SORC_WEAPONS).toContain(genUnique(new Rng(1), 1, 60, 'pyrewright').base);
  });
  it('the warrior has weapon uniques of his own; bounties and tyrants respect the class', () => {
    const rng = new Rng(2);
    expect(uniquePool(60, 'weapon', 'warrior').length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 3000; i++) {
      const r = bountyReward(rng, 'killTyrant', 1, 40, 'warrior');
      if (r.unique) expect(UNIQUES[r.unique].cls ?? 'warrior').toBe('warrior');
      const u = pickUnique(rng, 40, undefined, 'warrior', META.tyrants.list['cinder-hollow'].uniques);
      if (u) expect(UNIQUES[u].cls ?? 'warrior').toBe('warrior');
    }
  });
  it('a warrior unique changes his skills through skillFx', async () => {
    const { calcStats, skillCtx } = await import('../src/sim/formulas.ts');
    const s = newSaveState('warrior');
    const before = skillCtx(s, calcStats(s), 'searblade');
    s.equip.weapon = genUnique(new Rng(1), 1, 20, 'ashfang');
    const after = skillCtx(s, calcStats(s), 'searblade');
    expect(after.vs.burning).toBe(before.vs.burning + 35);
    expect(after.burnMult).toBeGreaterThan(before.burnMult);
  });
});

describe('uniques are not dead ends', () => {
  it('deeper copies roll better tiers; rolls vary', () => {
    const rng = new Rng(5), lo = genUnique(rng, 1, 10, 'tallow'), hi = genUnique(rng, 2, 45, 'tallow');
    expect(lo.mods[1][2]).toBe(topTier(10).tier);
    expect(hi.mods[1][2]).toBe(1);
    expect(itemPower(hi)).toBeGreaterThan(itemPower(lo));
    const vals = new Set(Array.from({ length: 40 }, (_, i) => genUnique(rng, 10 + i, 45, 'tallow').mods[1][1]));
    expect(vals.size).toBeGreaterThan(5);
  });
  it('a well crafted rare beats a unique on raw stats', () => {
    const rng = new Rng(6), u = genUnique(rng, 1, 45, 'tallow');
    const rare: Item = genItemOf(rng, 2, 45, 2, 'armor');
    rare.mods = [rare.mods[0], ...(['life', 'lifePct', 'barrier', 'fireRes', 'coldRes', 'allRes'] as const).map((k): Mod => [k, Math.round((AFFIXES[k].base + AFFIXES[k].perLevel * 38) * 0.9), 1])];
    expect(itemPower(rare)).toBeGreaterThan(itemPower(u)); // even with the unique bonus
  });
  it('Whetstone rerolls a unique value inside its range, at a higher price', () => {
    const rng = new Rng(7), u = genUnique(rng, 1, 30, 'saint'), i = 2;
    expect(emberBlock(u, 'whet', i)).toBeNull();
    expect(emberBlock(u, 'rise', i)).toMatch(/Uniques only/);
    expect(emberBlock(u, 'choice', i)).toMatch(/Uniques only/);
    const rare = genItemOf(rng, 2, 30, 2, 'armor');
    expect(craftCost(u, 'whet').dust!).toBeGreaterThan(craftCost({ ...rare, L: 30, cr: 0 }, 'whet').dust! * 2);
    const A = AFFIXES[u.mods[i][0]], lvl = 26;
    for (let n = 0; n < 30; n++) {
      const r = applyEmber(rng, u, 'whet', i);
      if (!r.ok) throw new Error(r.err);
      const v = r.item.mods[i][1];
      expect(v).toBeGreaterThanOrEqual(Math.floor((A.base + A.perLevel * lvl) * ITEMS.uniqueRoll[0]) - 1);
      expect(v).toBeLessThanOrEqual(Math.ceil((A.base + A.perLevel * lvl) * ITEMS.uniqueRoll[1]) + 1);
    }
  });
  it('Ember of Ascension re-forges a unique at the deepest level, needs a pearl, never on corrupted ones', () => {
    const rng = new Rng(8), u = genUnique(rng, 1, 12, 'saint');
    expect(craftCost(u, 'ascend').pearl).toBeGreaterThanOrEqual(1);
    expect(emberBlock(genItemOf(rng, 2, 12, 2, 'armor'), 'ascend', null)).toMatch(/Only for Unique/);
    const r = applyEmber(rng, u, 'ascend', null, 45);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item.L).toBe(45);
    expect(r.item.mods[1][2]).toBe(1);
    expect(itemPower(r.item)).toBeGreaterThan(itemPower(u));
    expect(r.item.u).toBe('saint'); expect(r.item.id).toBe(u.id);
    let c = corrupt(rng, u);
    for (let seed = 100; seed < 200 && c.ok && c.item.seal; seed++) c = corrupt(new Rng(seed), u);
    expect(c.ok && !c.item.seal).toBe(true);
    if (c.ok) expect(emberBlock(c.item, 'ascend', null)).toMatch(/corrupted/);
  });
  it('the forge uses the deepest area level for Ascension', () => {
    const sim = new Sim(undefined, { seed: 2, headless: true });
    sim.s.progress = [6, 6, 0]; sim.s.difficulty = 1;
    const u = genUnique(sim.rng, sim.itemId(), 5, 'tallow');
    sim.s.equip.armor = u;
    sim.s.mats = { dust: 0, essence: 0, shard: 99, pearl: 9 };
    expect(forge(sim, u.id, 'ascend', null, craftCost(u, 'ascend'))).toBeNull();
    expect(sim.s.equip.armor!.L).toBe(sim.areaLevel(5));
    expect(sim.s.mats.pearl).toBe(8);
  });
});

describe('crafting', () => {
  it('Crowning Ember adds an affix to a rare with room, not to a full one', () => {
    const rng = new Rng(9);
    let it = genItemOf(rng, 1, 30, 2, 'ring');
    while (it.mods.length - it.imp >= 6) it = genItemOf(rng, 1, 30, 2, 'ring');
    const n = it.mods.length, r = applyEmber(rng, it, 'crown');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item.mods.length).toBe(n + 1);
    let full = r.item;
    for (let i = 0; i < 6; i++) { const x = applyEmber(rng, full, 'crown'); if (!x.ok) break; full = x.item; }
    expect(full.mods.length - full.imp).toBe(6);
    expect(emberBlock(full, 'crown', null)).toMatch(/No free affix/);
    expect(emberBlock(genItemOf(rng, 2, 30, 1, 'ring'), 'crown', null)).toMatch(/Only Rare/);
  });
  it('rising to T2 takes a relic shard, to T1 a gloam pearl', () => {
    const rng = new Rng(10), it = genItemOf(rng, 1, 45, 2, 'ring');
    it.mods[0] = ['crit', 5, 3]; it.mods[1] = ['spirit', 5, 2];
    expect(craftCost(it, 'rise', 0).shard).toBe(1);
    expect(craftCost(it, 'rise', 1).pearl).toBe(1);
    expect(craftCost(it, 'rise', null).pearl).toBeUndefined();
  });
});

describe('currency drops and loot rules', () => {
  it('bosses always drop materials; piles are picked up into the save', () => {
    const sim = new Sim(undefined, { seed: 4, headless: true });
    const before = { ...sim.s.mats };
    sim.drops = [];
    sim.loot.currency('boss', 30, 0, 0);
    const piles = sim.drops.filter(d => d.mat);
    expect(piles.some(d => d.mat === 'dust')).toBe(true);
    expect(piles.some(d => d.mat === 'essence')).toBe(true);
    for (const d of piles.slice()) sim.loot.pickMat(d);
    for (const d of piles) expect(sim.s.mats[d.mat!]).toBeGreaterThan(before[d.mat!]);
  });
  it('rarity of materials: shards and pearls are rare from plain monsters', () => {
    const sim = new Sim(undefined, { seed: 6, headless: true }), got: Record<MatId, number> = { dust: 0, essence: 0, shard: 0, pearl: 0 };
    for (let i = 0; i < 20000; i++) {
      sim.drops = [];
      sim.loot.currency('monster', 30, 0, 0);
      for (const d of sim.drops) got[d.mat!]++;
    }
    const C = ECONOMY.currencyDrops.monster;
    expect(got.dust / 20000).toBeCloseTo(C.dust![0], 2);
    expect(got.essence).toBeLessThan(got.dust / 3);
    expect(got.shard).toBeLessThan(got.essence);
    expect(got.pearl).toBeLessThanOrEqual(got.shard);
  });
  it('a new hero hides normal items: they are salvaged on the spot', () => {
    const rng = new Rng(1), equip = { weapon: null, helm: null, armor: null, amulet: null, ring: null };
    const rules = defaultLoot(), n = genItemOf(rng, 1, 10, 0, 'ring'), m = genItemOf(rng, 2, 10, 1, 'ring');
    expect(rules.minR.ring).toBe(1);
    expect(lootFate(rules, n, { ...equip, ring: genItemOf(rng, 3, 10, 2, 'ring') })).toBe('salvage');
    expect(lootFate(rules, m, equip)).toBe('keep');
  });
  it('monster kills in the campaign: few uniques, most items magic or normal', () => {
    const sim = new Sim(undefined, { seed: 12, headless: true }), c = [0, 0, 0, 0];
    for (let i = 0; i < 40000; i++) c[sim.loot.roll('monster', 30).r]++;
    expect(c[3] / 40000).toBeLessThan(0.004);
    expect(c[2] / 40000).toBeLessThan(0.07);
  });
});

describe('save v12', () => {
  it('adds pearls, hides normal items for the old default filter and puts old uniques on the new scale', () => {
    const s = newSaveState() as unknown as Record<string, unknown>;
    const old = genUnique(new Rng(1), 7, 30, 'tallow');
    // a v11 unique: every stat at item level x1.25, no tier
    old.mods = old.mods.map((m, i) => (i < old.imp ? m : [m[0], Math.round((AFFIXES[m[0]].base + AFFIXES[m[0]].perLevel * 30) * 1.25)] as Mod));
    const v11 = structuredClone({ ...s, v: 11, mats: { dust: 5, essence: 1, shard: 0 }, loot: { ...defaultLoot(0) }, equip: { ...(s.equip as object), armor: old } });
    const m = migrate(v11);
    expect(m.v).toBe(SAVE_VERSION);
    expect(m.mats.pearl).toBe(0);
    expect(m.mats.dust).toBe(5);
    for (const k of SLOTS) expect(m.loot.minR[k]).toBe(1);
    const u = m.equip.armor!;
    expect(u.mods[1][2]).toBe(topTier(30).tier);
    expect(u.mods[1][1]).toBeLessThan(old.mods[1][1]);
    // a player's own filter stays
    const own = migrate({ ...s, v: 11, loot: { ...defaultLoot(0), minR: { weapon: 2, helm: 0, armor: 0, amulet: 0, ring: 0 } } });
    expect(own.loot.minR.weapon).toBe(2); expect(own.loot.minR.helm).toBe(0);
  });
});
