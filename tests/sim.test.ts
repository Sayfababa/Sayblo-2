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
    for (let t = 0; t < 20 * 60 && sim.s.unlocked < 2; t += 10) sim.advance(10);
    expect(sim.s.unlocked).toBeGreaterThanOrEqual(2);
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
      if (it.r === 3) expect(it.mods.length - it.imp).toBe(5);
    }
  });
});
