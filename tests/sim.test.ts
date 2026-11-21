import { describe, expect, it } from 'vitest';
import { Sim, TICK } from '../src/sim/sim.ts';
import { genItem, rollRarity } from '../src/sim/items.ts';
import { Rng } from '../src/sim/rng.ts';

describe('simulation runs headless', () => {
  it('is deterministic for the same seed', () => {
    const run = () => { const s = new Sim(undefined, { seed: 42, headless: true }); s.advance(120); return JSON.stringify(s.s); };
    expect(run()).toBe(run());
  });
  it('a fresh hero clears Gallows Field and levels up within 20 minutes', () => {
    const sim = new Sim(undefined, { seed: 1, headless: true });
    for (let t = 0; t < 20 * 60 && sim.unlocked < 2; t += 10) sim.advance(10);
    expect(sim.unlocked).toBeGreaterThanOrEqual(2);
    expect(sim.s.lvl).toBeGreaterThan(1);
    expect(sim.s.kills).toBeGreaterThan(10);
  });
  it('emits visual events only when collecting', () => {
    const sim = new Sim(undefined, { seed: 3 });
    for (let i = 0; i < 30 / TICK; i++) sim.tick();
    expect(sim.events.some(e => e.t === 'cast')).toBe(true);
    const quiet = new Sim(undefined, { seed: 3, headless: true });
    quiet.advance(30);
    expect(quiet.events.length).toBe(0);
  });
  it('death costs xp and gold and sends the hero to town', () => {
    const sim = new Sim(undefined, { seed: 5, headless: true });
    sim.s.gold = 100; sim.s.xp = 40;
    while (sim.phase !== 'fight') sim.tick();
    sim.s.life = -1; sim.s.hpPot = 0;
    sim.tick();
    expect(sim.phase).toBe('town');
    expect(sim.monsters.length).toBe(0);
    expect(sim.s.xp).toBe(36);
    expect(sim.s.life).toBe(sim.st.maxLife);
    expect(sim.s.deaths).toBe(1);
    expect(sim.s.gold).toBe(80);
  });
});

describe('loot', () => {
  it('rarity weights roughly match the data', () => {
    const rng = new Rng(9), n = 20000, c = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) c[rollRarity(rng, false)]++;
    expect(c[0] / n).toBeCloseTo(62 / 100.2, 1);
    expect(c[1] / n).toBeCloseTo(30 / 100.2, 1);
    expect(c[3]).toBeGreaterThan(0);
  });
  it('boss drops are rare or unique', () => {
    const rng = new Rng(2);
    for (let i = 0; i < 200; i++) expect(genItem(rng, i, 12, 2, true).r).toBeGreaterThanOrEqual(2);
  });
  it('magic items have 1-2 affixes plus implicit', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 300; i++) {
      const it = genItem(rng, i, 5, 0, false);
      if (it.r === 1) { expect(it.mods.length - it.imp).toBeGreaterThanOrEqual(1); expect(it.mods.length - it.imp).toBeLessThanOrEqual(2); }
      if (it.r === 3) { expect(it.u).toBeTruthy(); expect(it.mods.length - it.imp).toBe(4); }
    }
  });
});

describe('bag grid and gems', () => {
  it('places items by size and sells the weakest when full', async () => {
    const { genItem: gi, genGem } = await import('../src/sim/items.ts');
    const sim = new Sim(undefined, { seed: 11, headless: true });
    sim.s.loot.autoSalvage = false;
    const rng = new Rng(3);
    for (let i = 0; i < 60; i++) sim.takeItem(i % 4 ? gi(rng, 1000 + i, 10, 0, false) : genGem(rng, 1000 + i, 10), true);
    const cells = new Set<string>();
    for (const it of sim.s.bag) {
      const [w, h] = it.kind === 'gem' ? [1, 1] : ({ weapon: [1, 3], helm: [2, 2], armor: [2, 3], amulet: [1, 1], ring: [1, 1] } as const)[it.slot];
      for (let y = it.by!; y < it.by! + h; y++) for (let x = it.bx!; x < it.bx! + w; x++) {
        expect(cells.has(`${x},${y}`)).toBe(false);
        cells.add(`${x},${y}`);
        expect(x < 10 && y < 6).toBe(true);
      }
    }
    expect(sim.s.gold).toBeGreaterThan(30);
    // gems never take bag cells: all 15 went into the pouch
    expect(sim.s.bag.some(x => x.kind === 'gem')).toBe(false);
    expect(sim.s.gems).toHaveLength(15);
  });
  it('sockets only fitting gems and fuses three into one', () => {
    const sim = new Sim(undefined, { seed: 12, headless: true });
    const g = (id: number, gem: string, lvl = 1) => ({ id, kind: 'gem' as const, gem, lvl });
    sim.takeItem(g(500, 'wider'), true);
    sim.takeItem(g(501, 'multi'), true);
    expect(sim.socketGem('fireball', 0, 500)).toMatch(/does not fit/);
    expect(sim.socketGem('fireball', 1, 501)).toMatch(/opens at skill level/);
    expect(sim.socketGem('fireball', 0, 501)).toBe(null);
    expect(sim.ctx('fireball').projectiles).toBe(3);
    for (let i = 0; i < 3; i++) sim.takeItem(g(600 + i, 'quick', 2), true);
    sim.s.gold = 1000;
    expect(sim.fuseGems('quick', 2)).toBe(null);
    expect(sim.s.gems.filter(x => x.gem === 'quick').map(x => x.lvl)).toEqual([3]);
    expect(sim.s.bag.some(x => x.kind === 'gem')).toBe(false);
  });
});
