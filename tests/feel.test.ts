import { describe, expect, it } from 'vitest';
import { AFFIXES, AFFIX_ROLL, ELITE_MODS, FEEL, MONSTERS, SHRINES } from '../src/content/index.ts';
import { affixValue } from '../src/sim/formulas.ts';
import { hasPerfect, isPerfect, isUpgrade, itemPower, modPower, perfectThreshold } from '../src/sim/upgrade.ts';
import { migrate } from '../src/sim/save.ts';
import { Sim, TICK } from '../src/sim/sim.ts';
import { DEFAULT_VOLUME, SAVE_VERSION, newSaveState } from '../src/sim/state.ts';
import type { Item, Mod, Monster } from '../src/sim/types.ts';

const item = (mods: Mod[], o: Partial<Item> = {}): Item => ({ id: 1, slot: 'ring', base: 'Ring', name: 'Test', r: 1, L: 10, imp: 0, mods, ...o });

/** A sim standing in a fight with exactly the given monsters. */
function fightWith(mons: (sim: Sim) => Monster[], seed = 11) {
  const sim = new Sim(undefined, { seed, headless: true });
  while (sim.phase !== 'fight') sim.tick();
  sim.monsters = mons(sim);
  sim.feel.objects = [];
  return sim;
}

describe('upgrade arrow (item power)', () => {
  it('measures each affix against its best roll, weighted by kind', () => {
    const best = affixValue('spellDmg', FEEL.upgrade.refLevel, AFFIX_ROLL[1]);
    expect(modPower(['spellDmg', best])).toBeCloseTo(FEEL.upgrade.kindWeight.offense);
    const lifeBest = affixValue('life', FEEL.upgrade.refLevel, AFFIX_ROLL[1]);
    expect(modPower(['life', lifeBest / 2])).toBeCloseTo(FEEL.upgrade.kindWeight.defense / 2, 1);
    expect(modPower(['nope', 50])).toBe(0);
  });
  it('more and bigger mods mean more power; uniques get a bonus', () => {
    const a = item([['spellDmg', 20]]), b = item([['spellDmg', 20], ['crit', 5]]);
    expect(itemPower(b)).toBeGreaterThan(itemPower(a));
    expect(itemPower(item([['spellDmg', 20]], { u: 'gravewhisper', r: 3 }))).toBeCloseTo(itemPower(a) + FEEL.upgrade.uniqueBonus, 1);
    expect(itemPower(null)).toBe(0);
  });
  it('any item is an upgrade for an empty slot, tiny gains are not', () => {
    const cur = item([['spellDmg', 40], ['crit', 6]]);
    expect(isUpgrade(item([['life', 5]]), null)).toBe(true);
    expect(isUpgrade(item([['spellDmg', 41], ['crit', 6]]), cur)).toBe(false);
    expect(isUpgrade(item([['spellDmg', 40], ['crit', 6], ['castSpeed', 10]]), cur)).toBe(true);
    expect(isUpgrade(item([['spellDmg', 10]]), cur)).toBe(false);
    expect(isUpgrade({ id: 2, kind: 'gem', gem: 'echo', lvl: 1 }, null)).toBe(false);
  });
});

describe('perfect rolls', () => {
  it('needs the top tier and 95 % of the roll range', () => {
    const k = 'spellDmg', max = affixValue(k, 38, AFFIX_ROLL[1]), th = perfectThreshold(k);
    expect(th).toBeLessThanOrEqual(max);
    expect(th).toBeGreaterThan(affixValue(k, 38, AFFIX_ROLL[0]));
    expect(isPerfect([k, max, 1])).toBe(true);
    expect(isPerfect([k, th - 1, 1])).toBe(false);
    expect(isPerfect([k, max, 2])).toBe(false);
    expect(isPerfect([k, max])).toBe(false);
    expect(hasPerfect(item([['life', 5, 4], [k, max, 1]]))).toBe(true);
    expect(hasPerfect(item([['life', 5, 4]]))).toBe(false);
  });
  it('every affix has a reachable threshold', () => {
    for (const k of Object.keys(AFFIXES)) expect(perfectThreshold(k), k).toBeLessThanOrEqual(affixValue(k, 38, AFFIX_ROLL[1]));
  });
});

describe('shrines', () => {
  it('content has at least five shrines with 30–60 s buffs', () => {
    const ids = Object.keys(SHRINES);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    for (const id of ids) { expect(SHRINES[id].duration).toBeGreaterThanOrEqual(30); expect(SHRINES[id].duration).toBeLessThanOrEqual(60); expect(SHRINES[id].weight).toBeGreaterThan(0); }
  });
  it('the hero uses a shrine she walks past, the buff changes stats and runs out', () => {
    const sim = new Sim(undefined, { seed: 4, headless: true });
    const cs = sim.st.castSpeed;
    sim.feel.objects = [{ id: 999, kind: 'shrine', type: 'frenzy', x: sim.hero.x + 0.2, y: sim.hero.y }];
    sim.phase = 'walk'; sim.wps = [{ x: sim.hero.x + 0.2, y: sim.hero.y }];
    sim.tick();
    expect(sim.feel.objects.length).toBe(0);
    expect(sim.feel.buffs.frenzy).toBeGreaterThan(29);
    expect(sim.st.castSpeed).toBe(cs + SHRINES.frenzy.effects.castSpeed);
    sim.advance(SHRINES.frenzy.duration + 1);
    expect(sim.feel.buffs.frenzy).toBeUndefined();
    expect(sim.st.castSpeed).toBe(cs);
  });
  it('gold, xp and barrier shrines', () => {
    const sim = new Sim(undefined, { seed: 4, headless: true });
    const g0 = sim.feel.goldMult(), b0 = sim.maxBarrier();
    sim.feel.buffs = { greed: 10, lore: 10, bulwark: 10 }; sim.recalc();
    expect(sim.feel.goldMult()).toBeCloseTo(g0 * 2);
    expect(sim.feel.xpMult()).toBeCloseTo(1.5);
    expect(sim.maxBarrier()).toBe(b0 + Math.round(sim.st.maxLife * 0.4));
  });
  it('dying removes shrine buffs', () => {
    const sim = fightWith(() => []);
    sim.feel.buffs = { frenzy: 20 }; sim.recalc();
    sim.s.life = -1; sim.s.hpPot = 0; sim.tick();
    expect(sim.phase).toBe('town');
    expect(sim.feel.buffs.frenzy).toBeUndefined();
  });
});

describe('Coin-Wretch and vault', () => {
  const T = FEEL.treasure;
  const wretch = (sim: Sim) => {
    const m = sim.mkMon(T.monster, 5, 1, sim.hero.x + 4, sim.hero.y);
    m.fe = { flee: T.lifetime, ang: 0.5, turn: 0 };
    return m;
  };
  it('is a treasure monster outside every area pool', () => {
    expect(MONSTERS[T.monster].treasure).toBe(true);
  });
  it('runs away and escapes after its lifetime', () => {
    const sim = fightWith(s => [wretch(s)]);
    sim.s.slots.forEach(sl => (sl.id = null));
    sim.castT = 999;
    const m = sim.monsters[0];
    for (let i = 0; i < 2 / TICK; i++) sim.tick();
    expect(Math.hypot(m.x - sim.hero.x, m.y - sim.hero.y)).toBeGreaterThan(3);
    sim.advance(T.lifetime);
    expect(sim.monsters.includes(m)).toBe(false);
    expect(sim.s.kills).toBe(0);
  });
  it('is targeted first', () => {
    const sim = fightWith(s => [s.mkMon('imp', 3, 0, s.hero.x + 2, s.hero.y), wretch(s)]);
    expect(sim.feel.prio(sim.monsters[1])).toBeGreaterThan(sim.feel.prio(sim.monsters[0]));
  });
  it('drops a gold shower when killed and can open the vault', () => {
    let opened = 0;
    for (let seed = 1; seed < 60; seed++) {
      const sim = fightWith(s => [wretch(s)], seed);
      const m = sim.monsters[0];
      sim.dmgMon(m, m.hp + 1);
      expect(sim.drops.filter(d => d.gold).length).toBeGreaterThanOrEqual(T.goldPiles[0]);
      expect(sim.drops.filter(d => d.item).length).toBeGreaterThanOrEqual(1);
      if (sim.feel.vault) opened++;
    }
    expect(opened).toBeGreaterThan(0);
    expect(opened).toBeLessThan(30);
  });
  it('vault waves are denser, bring chests and do not advance the area', () => {
    const sim = fightWith(() => []);
    sim.feel.vault = { t: 30, dur: 60 };
    const wave = sim.wave;
    sim.monsters = [];
    sim.phase = 'walk'; sim.wps = []; sim.waitT = 0;
    sim.tick();
    expect(sim.phase).toBe('fight');
    expect(sim.wave).toBe(wave);
    expect(sim.monsters.length).toBeGreaterThanOrEqual(1 + FEEL.vault.extraMonsters);
    expect(sim.feel.objects.some(o => o.kind === 'chest')).toBe(true);
    expect(sim.feel.goldMult()).toBeGreaterThanOrEqual(FEEL.vault.goldMult);
    sim.advance(31);
    expect(sim.feel.vault).toBeNull();
  });
});

describe('monster affixes', () => {
  const elite = (sim: Sim, mods: string[], dx = 1.2) => {
    const m = sim.mkMon('imp', 5, 0, sim.hero.x + dx, sim.hero.y);
    m.rank = 2; m.mods = mods; m.fe = undefined;
    return m;
  };
  it('there are at least four behaviour affixes, all elemental', () => {
    const b = Object.entries(ELITE_MODS).filter(([, e]) => e.deathBlast || e.aura || e.teleport || e.shield || e.mirror);
    expect(b.length).toBeGreaterThanOrEqual(4);
    for (const [, e] of b) for (const el of [e.deathBlast?.element, e.aura?.element]) if (el) expect(['fire', 'cold', 'light']).toContain(el);
  });
  it('Fire-Enchanted leaves a warning circle and the hero steps out of it', () => {
    const sim = fightWith(s => [elite(s, ['Fire-Enchanted'], 0.5)]);
    sim.s.kite = false;
    const m = sim.monsters[0];
    sim.dmgMon(m, m.hp + 1);
    expect(sim.feel.blasts.length).toBe(1);
    const b = sim.feel.blasts[0];
    sim.advance(b.dur + 0.2);
    expect(sim.feel.blasts.length).toBe(0);
    expect(Math.hypot(sim.hero.x - b.x, sim.hero.y - b.y)).toBeGreaterThan(b.r);
    expect(sim.feel.stats.blastHits).toBe(0);
  });
  it('the death blast hurts if the hero is still inside', () => {
    const sim = fightWith(() => []);
    sim.s.barrier = 0;
    const life = sim.life;
    sim.feel.blasts.push({ x: sim.hero.x, y: sim.hero.y, t: 0.01, dur: 1, r: 2, dmg: 30, el: 'fire', name: 'X', label: 'Death Pyre' });
    sim.kite = 1; // already moving, no time to escape
    sim.tick();
    expect(sim.life).toBeLessThan(life);
  });
  it('Frost Aura chills the hero and slows her casting', () => {
    const sim = fightWith(s => [elite(s, ['Frost Aura'])]);
    sim.advance(1.2);
    expect(sim.feel.heroCastRate()).toBeLessThan(1);
  });
  it('Shielding gives allies a ward, not itself', () => {
    const sim = fightWith(s => [elite(s, ['Shielding'], 3), s.mkMon('imp', 5, 0, s.hero.x + 3.5, s.hero.y + 0.5)]);
    sim.castT = 999; sim.s.slots.forEach(sl => (sl.id = null));
    const [m, ally] = sim.monsters;
    for (let i = 0; i < 6 / TICK && ally.ward === 0; i++) sim.tick();
    expect(ally.ward).toBeGreaterThan(0);
    expect(m.ward).toBe(0);
  });
  it('Mirrored splits once below half life; the image drops nothing', () => {
    const sim = fightWith(s => [elite(s, ['Mirrored'], 4)]);
    const m = sim.monsters[0];
    sim.dmgMon(m, m.maxHp * 0.6);
    expect(sim.monsters.length).toBe(2);
    sim.dmgMon(m, 1);
    expect(sim.monsters.length).toBe(2);
    const img = sim.monsters[1];
    expect(img.fe?.noLoot).toBe(true);
    const drops = sim.drops.length;
    sim.dmgMon(img, img.hp + 1);
    expect(sim.drops.length).toBe(drops);
  });
  it('Teleporting blinks next to a distant hero', () => {
    const sim = fightWith(s => [elite(s, ['Teleporting'], 8)]);
    sim.castT = 999; sim.s.slots.forEach(sl => (sl.id = null));
    const m = sim.monsters[0];
    sim.advance(ELITE_MODS.Teleporting.teleport!.every + 0.1);
    expect(Math.hypot(m.x - sim.hero.x, m.y - sim.hero.y)).toBeLessThan(3);
  });
});

describe('events and save', () => {
  it('drops and kills emit events for the renderer and sounds', () => {
    const sim = new Sim(undefined, { seed: 3 });
    for (let i = 0; i < 60 / TICK; i++) sim.tick();
    expect(sim.events.some(e => e.t === 'kill')).toBe(true);
    expect(sim.events.some(e => e.t === 'loot')).toBe(true);
  });
  it('v4 saves get sound settings', () => {
    const s = newSaveState() as unknown as Record<string, unknown>;
    s.v = 4; s.settings = { dmgNumbers: false, lootLabels: true };
    const m = migrate(s);
    expect(m.v).toBe(SAVE_VERSION);
    expect(m.settings).toEqual({ dmgNumbers: false, lootLabels: true, sound: true, volume: DEFAULT_VOLUME });
  });
  it('the simulation stays deterministic', () => {
    const run = () => { const s = new Sim(undefined, { seed: 77, headless: true }); s.advance(400); return JSON.stringify([s.s, s.feel.stats]); };
    expect(run()).toBe(run());
  });
});
