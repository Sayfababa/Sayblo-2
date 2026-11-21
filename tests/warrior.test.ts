import { describe, expect, it } from 'vitest';
import {
  AFFIXES, CLASSES, SKILLS, SLOT_NAMES, TREES, classDef, classTrees, getActiveClass, heroFor, isPassive, setActiveClass, skillOfClass,
} from '../src/content/index.ts';
import { calcStats, formatMod, skillCtx } from '../src/sim/formulas.ts';
import { genItemOf } from '../src/sim/items.ts';
import { Rng } from '../src/sim/rng.ts';
import { migrate } from '../src/sim/save.ts';
import { SAVE_VERSION, newSaveState } from '../src/sim/state.ts';
import { Sim } from '../src/sim/sim.ts';
import type { Monster, SaveState } from '../src/sim/types.ts';

const warrior = (skills: Record<string, number>, lvl = 20): SaveState => {
  const s = newSaveState('warrior'); s.lvl = lvl; s.skills = { searblade: 1, ...skills }; s.gold = 10000; return s;
};
/** A warrior in a fight with the given monsters (the wave is replaced). */
function fight(s: SaveState, mons: (sim: Sim) => Monster[], seed = 5) {
  const sim = new Sim(s, { seed, headless: true });
  while (sim.phase !== 'fight') sim.tick();
  sim.monsters = mons(sim);
  sim.feel.objects = [];
  return sim;
}

describe('hero classes', () => {
  it('old saves become sorceresses (v10 → v11), new heroes keep their class', () => {
    const old = { ...newSaveState(), v: 10 } as Record<string, unknown>;
    delete old.cls;
    const s = migrate(old);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.cls).toBe('sorceress');
    expect(s.skills).toEqual({ fireball: 1 });
    const w = migrate(JSON.parse(JSON.stringify(newSaveState('warrior'))));
    expect(w.cls).toBe('warrior');
    expect(w.skills).toEqual({ searblade: 1 });
    expect(w.slots[0].id).toBe('searblade');
    expect(migrate({ ...newSaveState(), cls: 'bard' }).cls).toBe('sorceress');
  });

  it('a save only keeps skills, sockets and slots of its own class', () => {
    const s = { ...newSaveState('warrior'), skills: { searblade: 3, fireball: 5, frostcleave: 2 }, slots: [{ id: 'fireball', cond: 'always' }, { id: 'frostcleave', cond: 'always' }],
      sockets: { fireball: [{ id: 9, kind: 'gem', gem: 'quick', lvl: 1 }, null, null] } };
    const m = migrate(JSON.parse(JSON.stringify(s)));
    expect(m.skills).toEqual({ searblade: 3, frostcleave: 2 });
    expect(m.sockets.fireball).toBeUndefined();
    expect(m.slots.map(x => x.id)).toEqual([null, 'frostcleave', null, null]);
  });

  it('each class has three trees of eight skills (five active, three passive)', () => {
    expect(classTrees('sorceress')).toEqual(['ember', 'frost', 'storm']);
    expect(classTrees('warrior')).toEqual(['cinder', 'rime', 'thunder']);
    for (const t of classTrees('warrior')) {
      const ids = Object.keys(SKILLS).filter(id => SKILLS[id].tree === t);
      expect(ids.length).toBe(8);
      expect(ids.filter(isPassive).length).toBe(3);
      expect(TREES[t].class).toBe('warrior');
    }
    expect(skillOfClass('sunder', 'warrior')).toBe(true);
    expect(skillOfClass('sunder', 'sorceress')).toBe(false);
    for (const c of Object.values(CLASSES)) expect(SKILLS[c.startSkill]?.reqLevel).toBe(1);
    // the warrior never uses spells: no warrior skill has the spell tag, every hit skill is an attack
    for (const id of Object.keys(SKILLS).filter(k => skillOfClass(k, 'warrior') && !isPassive(k))) {
      expect(SKILLS[id].tags).not.toContain('spell');
      expect(SKILLS[id].tags).toContain('attack');
    }
  });

  it('the warrior is tougher: more life, built-in damage reduction, his own attribute texts', () => {
    const w = newSaveState('warrior'), sz = newSaveState(); w.lvl = sz.lvl = 10;
    const a = calcStats(w), b = calcStats(sz);
    expect(a.maxLife).toBeGreaterThan(b.maxLife * 1.5);
    expect(a.elemDR).toBe(heroFor('warrior').innate.elemDR);
    expect(b.elemDR).toBe(0);
    expect(heroFor('warrior').attributes.power.description).toContain('attack');
    expect(heroFor('sorceress').attributes.power.description).toContain('spell');
    expect(classDef('warrior').resource).toBe('Fury');
  });

  it('class words follow the active class: weapon slot, affix names, weapon bases', () => {
    const before = getActiveClass();
    setActiveClass('warrior');
    expect(SLOT_NAMES.weapon).toBe('Weapon');
    expect(formatMod(['spellDmg', 12])).toBe('+12% Attack Damage');
    const bases = classDef('warrior').weaponBases!.map(b => b.name);
    for (let i = 0; i < 10; i++) expect(bases).toContain(genItemOf(new Rng(i), 1, 20, 2, 'weapon').base);
    setActiveClass('sorceress');
    expect(SLOT_NAMES.weapon).toBe('Staff');
    expect(AFFIXES.spellDmg.text).toBe('Spell Damage');
    expect(bases).not.toContain(genItemOf(new Rng(1), 1, 20, 2, 'weapon').base);
    setActiveClass(before);
  });
});

describe('warrior skill formulas', () => {
  it('attacks use Power like spells, melee skills have the class reach', () => {
    const s = warrior({ searblade: 1 }), st = calcStats(s);
    const c = skillCtx(s, st, 'searblade');
    expect(c.inc.fire).toBe(st.spellDmg);
    expect(c.reach).toBe(classDef('warrior').reach);
    expect(c.radius).toBeCloseTo(1.1);
  });
  it('Kindling Roar: damage bonus per level and from Battle Fury', () => {
    const s = warrior({ kindleroar: 6 }), c = skillCtx(s, calcStats(s), 'kindleroar');
    expect(c.cryMore).toBeCloseTo(15 + 5 * 1); // 15% + 1% per level above 1
    s.skillMods.kindleroar = [0, 0, -1, -1]; // Bellow, Battle Fury
    const c2 = skillCtx(s, calcStats(s), 'kindleroar');
    expect(c2.cryMore).toBeCloseTo(20 * 1.4);
    expect(c2.radius).toBeCloseTo(3 * 1.4);
  });
  it('Shatterstrike hits chilled foes 50% harder; Weapon Swing takes the element of the first slot', () => {
    const s = warrior({ shatterstrike: 1 });
    expect(skillCtx(s, calcStats(s), 'shatterstrike').vs.chilled).toBe(50);
    s.skills.thundermaul = 1; s.slots[0] = { id: 'thundermaul', cond: 'always' };
    expect(skillCtx(s, calcStats(s), 'swing').el).toBe('light');
    s.slots[0] = { id: 'searblade', cond: 'always' };
    expect(skillCtx(s, calcStats(s), 'swing').el).toBe('fire');
  });
  it('a cry raises the hero\'s damage while it lasts', () => {
    const s = warrior({ kindleroar: 1 });
    const sim = fight(s, x => [x.mkMon('imp', 3, 0, x.hero.x + 1, x.hero.y)]);
    expect(sim.melee.dmgMult()).toBe(1);
    sim.cast('kindleroar', 'always', sim.monsters, false);
    expect(sim.melee.dmgMult()).toBeCloseTo(1.15);
    sim.advance(9);
    expect(sim.melee.dmgMult()).toBe(1);
  });
});

describe('warrior in the simulation', () => {
  it('never kites: walks towards a distant foe and hits it', () => {
    const s = warrior({}); s.kite = true;
    const sim = fight(s, x => [x.mkMon('imp', 1, 0, x.hero.x + 6, x.hero.y)]);
    const m = sim.monsters[0]; m.hp = m.maxHp = 1e6; m.mv = 0; // a training dummy
    const d0 = Math.hypot(m.x - sim.hero.x, m.y - sim.hero.y);
    sim.advance(3);
    const d1 = Math.hypot(m.x - sim.hero.x, m.y - sim.hero.y);
    expect(d1).toBeLessThan(d0 - 3);
    expect(d1).toBeLessThanOrEqual(classDef('warrior').reach!);
    expect(m.hp).toBeLessThan(1e6);
    expect(sim.kite).toBeLessThanOrEqual(0);
  });
  it('a leap moves the hero onto the target and hits around the landing', () => {
    const s = warrior({ skyleap: 1 }, 10);
    const sim = fight(s, x => [x.mkMon('imp', 1, 0, x.hero.x + 6, x.hero.y + 1), x.mkMon('imp', 1, 0, x.hero.x + 6.5, x.hero.y + 2)]);
    for (const m of sim.monsters) { m.hp = m.maxHp = 1e6; m.mv = 0; }
    const [a, b] = sim.monsters;
    sim.cast('skyleap', 'always', sim.monsters, false);
    expect(sim.melee.leap).not.toBeNull();
    for (let i = 0; i < 15; i++) sim.tick();
    expect(sim.melee.leap).toBeNull();
    expect(Math.hypot(a.x - sim.hero.x, a.y - sim.hero.y)).toBeLessThan(1);
    expect(a.hp).toBeLessThan(1e6);
    expect(b.hp).toBeLessThan(1e6);
  });
  it('leaps are deterministic: the same seed gives the same run', () => {
    const run = () => {
      const s = warrior({ thundermaul: 5, skyleap: 5, hurledhammer: 3, tempestmantle: 3, stormblood: 3 }, 12);
      s.slots = [{ id: 'skyleap', cond: 'always' }, { id: 'tempestmantle', cond: 'notActive' }, { id: 'hurledhammer', cond: 'enemies2' }, { id: 'thundermaul', cond: 'always' }];
      const sim = new Sim(s, { seed: 42, headless: true });
      const path: number[] = [];
      for (let t = 0; t < 90; t++) { sim.advance(1); path.push(Math.round(sim.hero.x * 1000), Math.round(sim.hero.y * 1000)); }
      return { path, kills: sim.s.kills, xp: sim.s.xp, dealt: sim.spells.dealt.skyleap ?? 0 };
    };
    const a = run(), b = run();
    expect(a.dealt).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });
  it('a fresh warrior clears the first area on his own', () => {
    const sim = new Sim(newSaveState('warrior'), { seed: 3, headless: true });
    sim.advance(240);
    expect(sim.s.kills).toBeGreaterThan(10);
    expect(sim.s.lvl).toBeGreaterThan(1);
  });
});
