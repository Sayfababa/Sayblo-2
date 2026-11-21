import { describe, expect, it } from 'vitest';
import { ATLAS_NODES, COMMON_UNIQUES, KEY_MODS, MONSTERS, MYTHIC_UNIQUES, RIFT, UNIQUES } from '../src/content/index.ts';
import { monsterDmg, monsterHp } from '../src/sim/formulas.ts';
import { genItem } from '../src/sim/items.ts';
import { ailmentMult } from '../src/sim/mythic.ts';
import {
  atlasBlock, atlasEarned, atlasFree, keyReward, keyRisk, pinnacleOpen, riftDmgMult, riftHpMult, riftLevel, riftMonDmg, riftMonHp, rollKey, runFx,
} from '../src/sim/rift.ts';
import { Rng } from '../src/sim/rng.ts';
import { exportCode, importCode, migrate } from '../src/sim/save.ts';
import { Sim } from '../src/sim/sim.ts';
import { SAVE_VERSION, newSaveState } from '../src/sim/state.ts';
import { isKey, type KeyItem, type SimEvent } from '../src/sim/types.ts';


/** A fresh hero with rifts open (headless). */
function riftSim(seed = 3) {
  const s = newSaveState();
  s.rift.open = true;
  return new Sim(s, { seed, headless: true });
}
const key = (sim: Sim, tier: number, mods: string[] = []): KeyItem => {
  const k: KeyItem = { id: sim.itemId(), kind: 'key', tier, mods };
  sim.takeItem(k, true);
  return k;
};
/** Kill everything on the map every tick until the run is over (or time runs out). */
function clearRun(sim: Sim, seconds = 120, until = () => !sim.rift.run) {
  for (let t = 0; t < seconds * 30 && !until(); t++) {
    sim.s.life = sim.st.maxLife;
    for (const m of sim.monsters) if (m.hp > 0) sim.dmgMon(m, m.hp + m.ward + 1);
    sim.tick();
  }
}

describe('rift scaling', () => {
  it('tier 1 matches the reference monsters (start of Nightmare)', () => {
    const S = RIFT.scaling;
    expect(riftLevel(1)).toBe(S.level.base);
    expect(riftHpMult(1)).toBe(1);
    expect(riftMonHp('cultist', 0, 1)).toBeCloseTo(monsterHp('cultist', S.refLevel, 0, S.refDifficulty), -1);
    expect(riftMonDmg('cultist', 2, 1)).toBeCloseTo(monsterDmg('cultist', S.refLevel, 2, S.refDifficulty), 5);
  });
  it('grows smoothly and stays finite and sane at tier 100 and beyond', () => {
    for (let t = 1; t < 200; t++) {
      expect(riftHpMult(t + 1)).toBeGreaterThan(riftHpMult(t));
      expect(riftDmgMult(t + 1)).toBeGreaterThan(riftDmgMult(t));
      expect(riftHpMult(t + 1) / riftHpMult(t)).toBeLessThan(1.06);
      expect(riftLevel(t + 1) - riftLevel(t)).toBeLessThanOrEqual(1);
    }
    const hp = riftMonHp('husk', 3, 100), dmg = riftMonDmg('husk', 3, 100);
    expect(Number.isFinite(hp) && Number.isFinite(dmg)).toBe(true);
    expect(riftHpMult(100)).toBeLessThan(200);
    expect(riftDmgMult(100)).toBeLessThan(25);
    expect(riftLevel(100)).toBeLessThanOrEqual(RIFT.scaling.level.max);
    expect(Number.isFinite(riftMonHp('husk', 3, 1000))).toBe(true);
  });
  it('rift monsters use the tier, not the area', () => {
    const sim = riftSim();
    sim.rift.startKey(key(sim, 10).id);
    const m = sim.mkMon('imp', sim.areaLevel(), 0, 0, 0);
    expect(m.maxHp).toBe(Math.round(riftMonHp('imp', 0, 10)));
    expect(m.L).toBe(riftLevel(10));
    expect(sim.st.res.fire).toBeLessThanOrEqual(RIFT.scaling.resPenalty + sim.st.rawRes.fire + 0.001);
  });
});

describe('rift keys', () => {
  it('roll 0-4 modifiers, no duplicates, at most two boons, hazards first', () => {
    const rng = new Rng(5), counts = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const k = rollKey(rng, i, 7);
      counts.add(k.mods.length);
      expect(k.tier).toBe(7);
      expect(new Set(k.mods).size).toBe(k.mods.length);
      expect(k.mods.filter(m => KEY_MODS[m].kind === 'boon').length).toBeLessThanOrEqual(RIFT.keys.maxBoons);
      const firstBoon = k.mods.findIndex(m => KEY_MODS[m].kind === 'boon');
      if (firstBoon >= 0) expect(k.mods.slice(firstBoon).every(m => KEY_MODS[m].kind === 'boon')).toBe(true);
    }
    expect([...counts].sort()).toEqual([0, 1, 2, 3, 4]);
  });
  it('more risk pays more reward', () => {
    expect(keyReward([], {}).qty).toBe(0);
    const one = keyReward(['fireWard'], {}), three = keyReward(['fireWard', 'brutal'], {});
    expect(keyRisk(['fireWard', 'brutal', 'bounty'])).toBe(3);
    expect(three.qty).toBe(3 * one.qty);
    expect(three.rarity).toBeGreaterThan(one.rarity);
    expect(keyReward(['bounty', 'shrines'], {}).qty).toBe(0);
    const fx = runFx(['brutal', 'bounty', 'fireWard'], {});
    expect(fx.monDmg).toBeCloseTo(0.3);
    expect(fx.qty).toBe(60 + three.qty);
    expect(fx.monRes?.fire).toBeCloseTo(0.4);
  });
  it('key modifiers change monsters', () => {
    const sim = riftSim();
    sim.rift.startKey(key(sim, 5, ['stormWard', 'hasted', 'stout']).id);
    const m = sim.mkMon('husk', sim.areaLevel(), 0, 0, 0);
    expect(m.res.light).toBeCloseTo(0.25 + 0.4);
    expect(m.mv).toBeCloseTo(MONSTERS.husk.moveSpeed * 1.25);
    expect(m.maxHp).toBe(Math.round(riftMonHp('husk', 0, 5) * 1.4));
  });
});

describe('atlas', () => {
  it('gives a point every five tiers and needs the node above', () => {
    const s = newSaveState().rift;
    s.maxTier = 12;
    expect(atlasEarned(s)).toBe(2);
    expect(atlasBlock(s, 'scent')).toMatch(/Glinting Dust/);
    expect(atlasBlock(s, 'dust')).toBeNull();
    s.atlas.dust = 2;
    expect(atlasFree(s)).toBe(0);
    expect(atlasBlock(s, 'scent')).toMatch(/No atlas points/);
    s.maxTier = 15;
    expect(atlasBlock(s, 'scent')).toBeNull();
    s.atlas.dust = ATLAS_NODES.dust.max; s.maxTier = 100;
    expect(atlasBlock(s, 'dust')).toMatch(/Fully/);
  });
  it('has about 15 nodes in three columns with one top node each', () => {
    const n = Object.values(ATLAS_NODES);
    expect(n.length).toBeGreaterThanOrEqual(12);
    for (let c = 0; c < RIFT.atlas.columns.length; c++) expect(n.filter(x => x.col === c && x.row === 0)).toHaveLength(1);
  });
  it('nodes change rifts: shrines, keys, item quantity, extra key modifier, respec', () => {
    const sim = riftSim();
    const rs = sim.s.rift;
    rs.maxTier = 60;
    for (const id of ['tally', 'paths', 'paths', 'dust', 'wager', 'seal']) expect(sim.rift.learnNode(id)).toBeNull();
    sim.rift.startKey(key(sim, 3).id);
    expect(sim.rift.shrineMult()).toBeCloseTo(2);
    expect(sim.rift.run!.fx.qty).toBe(30);
    // Sixth Seal: one more modifier on every new key
    const rng = new Rng(9);
    const n0 = Array.from({ length: 300 }, (_, i) => rollKey(rng, i, 1).mods.length).reduce((a, b) => a + b, 0);
    const n1 = Array.from({ length: 300 }, (_, i) => rollKey(rng, i, 1, rs.atlas).mods.length).reduce((a, b) => a + b, 0);
    expect(n1).toBeGreaterThan(n0 + 200);
    // Bold Wager: more reward per hazard
    expect(keyReward(['brutal'], rs.atlas).qty).toBeGreaterThan(keyReward(['brutal'], {}).qty);
    sim.s.gold = 0;
    expect(sim.rift.respecAtlas()).toMatch(/gold/);
    sim.s.gold = 1e6;
    expect(sim.rift.respecAtlas()).toBeNull();
    expect(atlasFree(rs)).toBe(12);
  });
});

describe('a rift run', () => {
  it('fills the bar with kills, calls the guardian, drops the next key and records the best time', () => {
    const sim = riftSim(4);
    const events: SimEvent[] = [];
    sim.collectEvents = true;
    sim.rift.startKey(key(sim, 4).id);
    expect(sim.s.bag.some(isKey)).toBe(false);
    expect(sim.s.rift.cur?.tier).toBe(4);
    const r = sim.rift.run!;
    // elites count more than normal monsters
    const before = r.progress;
    const n = sim.mkMon('imp', sim.areaLevel(), 0, 0, 0), e = sim.mkMon('imp', sim.areaLevel(), 2, 0, 0);
    sim.monsters.push(n, e);
    sim.dmgMon(n, n.hp + 1);
    const p1 = r.progress - before;
    sim.dmgMon(e, e.hp + e.ward + 1);
    expect(r.progress - before - p1).toBeCloseTo(p1 * RIFT.run.points[2]);
    // fill the bar: the guardian appears
    r.progress = r.need - 0.5;
    const last = sim.mkMon('imp', sim.areaLevel(), 0, 0, 0);
    sim.monsters.push(last);
    sim.dmgMon(last, last.hp + 1);
    const g = sim.monsters.find(m => m.id === r.guardian)!;
    expect(g).toBeTruthy();
    expect(g.rank).toBe(3);
    expect(g.scale).toBeGreaterThan(1);
    // its mechanics put warning circles down
    for (let i = 0; i < 30 * 8; i++) sim.rift.monStep(g, 1 / 30);
    expect(sim.feel.blasts.length).toBeGreaterThan(0);
    sim.feel.blasts = [];
    sim.rift.run!.t = 30; // well under the timer
    sim.dmgMon(g, g.hp + 1);
    expect(r.done).toBe(true);
    clearRun(sim);
    expect(sim.rift.run).toBeNull();
    for (const ev of sim.events) events.push(ev);
    const res = events.find(x => x.t === 'rift');
    expect(res && res.t === 'rift' && res.res.ok).toBe(true);
    expect(sim.s.rift.maxTier).toBe(4);
    expect(sim.s.rift.best['4']).toBeLessThan(40);
    expect(sim.s.rift.cur).toBeNull();
    const keys = sim.s.bag.filter(isKey);
    expect(keys.some(k => k.tier === 5)).toBe(true);
  });
  it('dying ends the run and the key is lost', () => {
    const sim = riftSim(5);
    sim.rift.startKey(key(sim, 2).id);
    while (sim.phase !== 'fight') sim.tick();
    sim.s.life = -1; sim.s.hpPot = 0;
    sim.tick();
    expect(sim.phase).toBe('town');
    expect(sim.rift.run).toBeNull();
    expect(sim.s.rift.fails).toBe(1);
    expect(sim.s.bag.some(isKey)).toBe(false);
  });
  it('leaving for an area spends the key; the free key always works', () => {
    const sim = riftSim(6);
    expect(sim.rift.startFree()).toBeNull();
    expect(sim.rift.run?.tier).toBe(RIFT.keys.freeTier);
    sim.selectZone(0);
    expect(sim.rift.run).toBeNull();
  });
  it('stays sealed until Mother Vesper falls (or ?dev)', () => {
    const sim = new Sim(undefined, { seed: 1, headless: true });
    expect(sim.rift.startFree()).toMatch(/sealed/);
    sim.rift.onActBoss(RIFT.unlock.difficulty);
    expect(sim.s.rift.open).toBe(true);
    const dev = new Sim(undefined, { seed: 1, headless: true });
    dev.rift.dev = true;
    expect(dev.rift.startFree()).toBeNull();
  });
  it('auto mode opens the next rift with the best key; offline repeats the tier without keys', () => {
    const sim = riftSim(7);
    sim.s.rift.auto = true;
    sim.s.rift.maxTier = 5;
    key(sim, 3); key(sim, 6); key(sim, 9);
    expect(sim.rift.bestKey()!.tier).toBe(6);
    sim.rift.startKey(key(sim, 2).id);
    sim.rift.run!.progress = sim.rift.run!.need;
    sim.rift.nextWave(); // the guardian
    clearRun(sim, 120, () => sim.rift.run?.tier !== 2);
    // a new run started on its own with the tier 6 key
    expect(sim.rift.run?.tier).toBe(6);
    expect(sim.s.bag.filter(isKey).map(k => k.tier).sort()).toEqual([3, 3, 9].sort());
    // offline: the same tier again, no key used, no key dropped
    sim.rift.offline = true;
    const keysBefore = sim.s.bag.filter(isKey).length;
    sim.rift.run!.progress = sim.rift.run!.need;
    sim.monsters = [];
    sim.rift.nextWave();
    const first = sim.rift.run!;
    clearRun(sim, 60, () => sim.rift.run !== first);
    expect(sim.rift.run?.tier).toBe(6);
    expect(sim.s.bag.filter(isKey).length).toBe(keysBefore);
    expect(sim.s.rift.best['6']).toBeUndefined();
  });
  it('the pinnacle needs fragments and opens every 25 tiers; mythic uniques drop only there', () => {
    const sim = riftSim(8);
    expect(sim.rift.startPinnacle()).toMatch(/tier 25/);
    sim.s.rift.maxTier = 26;
    expect(pinnacleOpen(sim.s.rift)).toBe(1);
    expect(sim.rift.startPinnacle()).toMatch(/fragments/);
    sim.s.rift.frags = 3;
    expect(sim.rift.startPinnacle()).toBeNull();
    expect(sim.s.rift.frags).toBe(0);
    expect(sim.rift.run!.tier).toBe(25);
    sim.rift.nextWave();
    const boss = sim.monsters.find(m => m.id === sim.rift.run!.guardian)!;
    expect(boss.def).toBe(RIFT.pinnacle.boss);
    expect(boss.boss).toBeTruthy();
    expect(boss.tint).toBeTruthy();
    sim.s.loot.keepUniques = true;
    sim.dmgMon(boss, boss.hp + 1);
    const mythic = sim.drops.find(d => d.item && !isKey(d.item) && 'u' in d.item && MYTHIC_UNIQUES.includes(d.item.u!));
    expect(mythic).toBeTruthy();
    expect(sim.s.rift.pinnacle).toBe(1);
    // never from normal drops
    const rng = new Rng(2);
    for (let i = 0; i < 3000; i++) { const it = genItem(rng, i, 50, 3, true); expect(MYTHIC_UNIQUES).not.toContain(it.u); }
    expect(COMMON_UNIQUES.length + MYTHIC_UNIQUES.length).toBe(Object.keys(UNIQUES).length);
  });
});

describe('mythic uniques', () => {
  it('Pyrewright: more damage per ailment', () => {
    expect(ailmentMult({ burn: 0, chill: 0, frozen: 0, shock: 0 })).toBe(1);
    expect(ailmentMult({ burn: 1, chill: 0, frozen: 1, shock: 1 })).toBeCloseTo(1 + 3 * RIFT.mythic.pyrewright.perAilment);
  });
  it('slot kinds fit: weapon offense, armor defense', () => {
    expect(UNIQUES.pyrewright.slot).toBe('weapon');
    expect(UNIQUES.unburied.slot).toBe('armor');
    expect(['ring', 'amulet']).toContain(UNIQUES.stair.slot);
  });
  it('Mantle of the Unburied cheats death once a minute; the Seal stacks cast speed', async () => {
    const { genUnique } = await import('../src/sim/items.ts');
    const sim = new Sim(undefined, { seed: 2, headless: true });
    const rng = new Rng(1);
    sim.s.equip.armor = genUnique(rng, 900, 40, 'unburied');
    sim.s.equip.ring = genUnique(rng, 901, 40, 'stair');
    sim.recalc();
    while (sim.phase !== 'fight') sim.tick();
    sim.s.life = -5; sim.s.hpPot = 0;
    sim.tick();
    expect(sim.phase).not.toBe('town');
    expect(sim.life).toBeGreaterThan(0);
    expect(sim.mythic.untouchable).toBeGreaterThan(0);
    const cs = sim.st.castSpeed, m = sim.mkMon('imp', 1, 0, 0, 0);
    sim.monsters.push(m);
    sim.dmgMon(m, m.hp + 1);
    expect(sim.st.castSpeed).toBe(cs + RIFT.mythic.stair.castSpeed);
  });
});

describe('rift saves', () => {
  it('migrates a v6 save to the current version with empty rift progress', () => {
    const old = { ...newSaveState(), v: 6 } as Record<string, unknown>;
    delete old.rift;
    const s = migrate(old);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.rift).toEqual(newSaveState().rift);
  });
  it('keeps keys, bests, atlas and the run in progress; drops broken values', async () => {
    const sim = riftSim(9);
    key(sim, 12, ['brutal', 'bounty']);
    sim.s.rift.best = { 3: 201.5, x: 5 } as unknown as Record<string, number>;
    sim.s.rift.atlas = { dust: 9, nope: 1 };
    sim.s.rift.maxTier = 30;
    sim.rift.startKey(key(sim, 7, ['fireWard']).id);
    const back = await importCode(await exportCode(sim.s));
    expect(back.bag.filter(isKey).map(k => [k.tier, k.mods])).toEqual([[12, ['brutal', 'bounty']]]);
    expect(back.rift.best).toEqual({ 3: 201.5 });
    expect(back.rift.atlas).toEqual({ dust: ATLAS_NODES.dust.max });
    expect(back.rift.cur).toMatchObject({ tier: 7, mods: ['fireWard'] });
    const bad = migrate({ ...sim.s, bag: [{ id: 99, kind: 'key', tier: 0, mods: [] }, { id: 98, kind: 'key', tier: 3, mods: ['nope'] }] });
    expect(bad.bag.filter(isKey)).toHaveLength(0);
    // loading resumes the run
    const again = new Sim(back, { seed: 1, headless: true });
    expect(again.rift.run?.tier).toBe(7);
  });
});
