import { describe, expect, it } from 'vitest';
import { AUTO_ORDER, CONDITIONS, GEMS, MOD_LEVELS, SKILLS, SKILL_TYPES, TREES, isFiller, isPassive } from '../src/content/index.ts';
import { calcStats, skillCtx } from '../src/sim/formulas.ts';
import { activeMods, chooseMod, modRespecCost, pendingMods, resetMods, sanitizeSkillMods } from '../src/sim/skillmods.ts';
import { migrate } from '../src/sim/save.ts';
import { SAVE_VERSION, newSaveState } from '../src/sim/state.ts';
import { Sim } from '../src/sim/sim.ts';
import type { Monster } from '../src/sim/types.ts';

/** Effect keys a modifier may use: gem effect keys plus the behaviour keys of docs/skill-system.md. */
const FX_KEYS = new Set([
  ...Object.values(GEMS).flatMap(g => Object.keys(g.effects)), 'manaMore', 'critBonus', 'cdLess', 'projSpeed', 'explode', 'explodeDmg',
  'ground', 'groundDur', 'groundDmg', 'repeat', 'repeatDmg', 'extra', 'extraDmg', 'killBlast', 'critAilment', 'vsBurning', 'vsChilled',
  'vsShocked', 'freezeDur', 'falloffLess', 'ticks', 'arcs', 'curseEffect', 'curseAll', 'curseSpread', 'curseSlow', 'wardPct', 'wardDR',
  'wardNova', 'wardMana', 'wardHeal', 'constructs', 'rate', 'orbs', 'barrierPct', 'retaliate', 'wardFreeze', 'breakNova', 'chillAura',
]);

const save = (skills: Record<string, number>, lvl = 30) => { const s = newSaveState(); s.lvl = lvl; s.skills = skills; s.gold = 10000; return s; };
const ctxOf = (s: ReturnType<typeof newSaveState>, id: string) => skillCtx(s, calcStats(s), id);

describe('skill content', () => {
  it('each tree has about eight skills, actives have modifier tiers with two known choices', () => {
    for (const t of Object.keys(TREES)) expect(Object.values(SKILLS).filter(s => s.tree === t).length).toBe(8);
    for (const [id, s] of Object.entries(SKILLS)) {
      if (isPassive(id)) { expect(s.mods, id).toBeUndefined(); continue; }
      expect(SKILL_TYPES[s.type!], `${id} type`).toBeTruthy();
      expect(s.mods?.length, id).toBe(MOD_LEVELS.length);
      for (const tier of s.mods!) {
        expect(tier.length).toBe(2);
        for (const m of tier) for (const k of Object.keys(m.fx)) expect(FX_KEYS.has(k), `${id}.${m.id}: ${k}`).toBe(true);
      }
    }
    for (const c of Object.values(SKILL_TYPES)) if (c.cond) expect(CONDITIONS[c.cond]).toBeTruthy();
    for (const [id] of AUTO_ORDER) expect(SKILLS[id]).toBeTruthy();
  });
  it('fillers are damage skills without cooldown', () => {
    expect(isFiller('fireball')).toBe(true);
    expect(isFiller('flamelance')).toBe(true);
    expect(isFiller('ashenhex')).toBe(false);
    expect(isFiller('frostarmor')).toBe(false);
    expect(isFiller('stormwisp')).toBe(false);
  });
});

describe('skill modifiers', () => {
  it('open at skill levels, are picked once and change the skill', () => {
    const s = save({ fireball: 2 });
    expect(chooseMod(s, 'fireball', 0, 0)).toMatch(/Opens at skill level 3/);
    s.skills.fireball = 3;
    expect(pendingMods(s, 'fireball')).toBe(1);
    expect(chooseMod(s, 'fireball', 0, 0)).toBe(null);
    expect(chooseMod(s, 'fireball', 0, 1)).toMatch(/Already chosen/);
    expect(pendingMods(s, 'fireball')).toBe(0);
    const c = ctxOf(s, 'fireball');
    expect(c.projectiles).toBe(2);
    expect(c.more).toBeCloseTo(0.85);
    expect(activeMods(s, 'fireball').map(m => m.id)).toEqual(['twin']);
  });
  it('mana, cooldown, crit and behaviour keys reach the cast data', () => {
    const s = save({ meteor: 15 });
    s.skillMods.meteor = [1, 1, 1, 1]; // swift fall, falling star, heavy stone, cataclysm
    const c = ctxOf(s, 'meteor'), base = ctxOf(save({ meteor: 15 }), 'meteor');
    expect(c.cooldown).toBeCloseTo(base.cooldown * 0.75);
    expect(c.extra).toBe(1);
    expect(c.extraDmg).toBeCloseTo(0.5);
    expect(c.more).toBeCloseTo(1.25 * 1.3);
    expect(c.mana).toBe(Math.round(base.mana * 1.3));
    const f = save({ fireball: 15 });
    f.skillMods.fireball = [0, 0, 0, 1];
    const fc = ctxOf(f, 'fireball');
    expect(fc.explode).toBe(1.4);
    expect(fc.critAilment).toBe(true);
  });
  it('tiers above the current skill level have no effect', () => {
    const s = save({ fireball: 3 });
    s.skillMods.fireball = [0, 0, 0, 0];
    expect(activeMods(s, 'fireball').length).toBe(1);
  });
  it('reset costs gold per character level and frees the choices', () => {
    const s = save({ fireball: 6 });
    chooseMod(s, 'fireball', 0, 1);
    const gold = s.gold;
    expect(resetMods(s, 'fireball')).toBe(null);
    expect(s.gold).toBe(gold - modRespecCost(s.lvl));
    expect(s.skillMods.fireball).toBeUndefined();
    expect(resetMods(s, 'fireball')).toMatch(/No modifiers/);
    s.gold = 0; chooseMod(s, 'fireball', 0, 1);
    expect(resetMods(s, 'fireball')).toMatch(/costs/);
  });
  it('a full respec clears all modifier choices', () => {
    const sim = new Sim(save({ fireball: 6, searing: 4 }), { seed: 1, headless: true });
    chooseMod(sim.s, 'searing', 0, 0);
    expect(sim.respec()).toBe(null);
    expect(sim.s.skillMods).toEqual({});
    expect(sim.s.skillPts).toBe(1 + 6 + 4 - 1);
  });
});

describe('save migration', () => {
  it('older saves keep their skill points and get empty modifier choices', () => {
    const old = { v: 9, lvl: 12, skills: { fireball: 5, meteor: 3 }, skillPts: 2, gems: [], bag: [], stash: [] };
    const s = migrate(old);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.skills).toEqual({ fireball: 5, meteor: 3 });
    expect(s.skillPts).toBe(2);
    expect(s.skillMods).toEqual({});
  });
  it('drops broken modifier entries', () => {
    expect(sanitizeSkillMods({ fireball: [1, 7, 'x'], pyromancy: [0], nope: [0], meteor: [0] }, { fireball: 4, pyromancy: 2 }))
      .toEqual({ fireball: [1, -1, -1, -1] });
  });
});

/** A sim standing in a fight with a pack of monsters around a point in front of the hero. */
function arena(skills: Record<string, number>, n = 4, mods: Record<string, number[]> = {}) {
  const s = save(skills);
  s.skillMods = mods;
  const sim = new Sim(s, { seed: 3, headless: true });
  sim.monsters = [];
  for (let i = 0; i < n; i++) sim.monsters.push(sim.mkMon('husk', 10, 0, sim.hero.x + 3 + i * 0.6, sim.hero.y + (i % 2) * 0.5));
  sim.phase = 'fight';
  for (const m of sim.monsters) { m.hp = m.maxHp = 100000; m.mv = 0; m.atkT = 99; }
  return sim;
}
const hurt = (ms: Monster[]) => ms.filter(m => m.hp < m.maxHp).length;
const run = (sim: Sim, sec: number) => { for (let t = 0; t < sec; t += 1 / 30) { sim.tick(1 / 30); sim.monsters.forEach(m => { m.atkT = 99; }); } };

describe('new skill types in the simulation', () => {
  it('Flame Lance pulses along a line through several enemies', () => {
    const sim = arena({ flamelance: 5 });
    sim.cast('flamelance', 'always', sim.monsters, false);
    expect(sim.spells.beams.length).toBe(1);
    run(sim, 0.12);
    run(sim, 1.6);
    expect(sim.spells.beams.length).toBe(0);
    expect(hurt(sim.monsters)).toBeGreaterThanOrEqual(2);
  });
  it('Ashen Hex makes enemies take more fire damage', () => {
    const sim = arena({ ashenhex: 1, fireball: 1 });
    const m = sim.monsters[0];
    sim.cast('ashenhex', 'notCursed', sim.monsters, false);
    expect(m.hex?.taken.fire).toBeCloseTo(0.15);
    const d = { fire: 100, cold: 0, light: 0 };
    sim.spells.preHit(m, sim.ctx('fireball'), d);
    expect(d.fire).toBeCloseTo(115);
  });
  it('Hailstorm keeps hitting the area for its duration', () => {
    const sim = arena({ hailstorm: 1 });
    sim.cast('hailstorm', 'always', sim.monsters, false);
    expect(sim.spells.fields.length).toBe(1);
    run(sim, 1.2);
    const hp = sim.monsters[0].hp;
    run(sim, 1);
    expect(sim.monsters[0].hp).toBeLessThan(hp);
    run(sim, 3);
    expect(sim.spells.fields.length).toBe(0);
  });
  it('Rime Shell adds barrier, cuts damage taken and freezes enemies close by', () => {
    const sim = arena({ rimeshell: 1 });
    sim.monsters[0].x = sim.hero.x + 1; sim.monsters[0].y = sim.hero.y;
    const before = sim.maxBarrier();
    sim.cast('rimeshell', 'lifeLow', sim.monsters, false);
    expect(sim.maxBarrier()).toBe(before + Math.round(sim.st.maxLife * 0.2));
    expect(sim.spells.heroTaken()).toBeCloseTo(0.7);
    expect(sim.monsters[0].frozen).toBeGreaterThan(0);
  });
  it('Storm Lantern floats beside the hero and strikes; "when not active" waits for it to fade', () => {
    const sim = arena({ stormlantern: 1 });
    expect(sim.spells.notActive('stormlantern')).toBe(true);
    sim.cast('stormlantern', 'notActive', sim.monsters, false);
    expect(sim.spells.notActive('stormlantern')).toBe(false);
    run(sim, 2);
    expect(hurt(sim.monsters)).toBeGreaterThan(0);
  });
  it('Stormwisp drifts and zaps, more wisps with the Twin Wisps modifier', () => {
    const sim = arena({ stormwisp: 3 }, 4, { stormwisp: [0, -1, -1, -1] });
    sim.cast('stormwisp', 'always', sim.monsters, false);
    expect(sim.spells.orbs.length).toBe(2);
    run(sim, 2);
    expect(hurt(sim.monsters)).toBeGreaterThan(0);
  });
  it('Double Burst repeats the impact, Afterburn leaves burning ground', () => {
    const sim = arena({ searing: 10 }, 4, { searing: [-1, 0, 0, -1] });
    sim.cast('searing', 'always', sim.monsters, false);
    expect(sim.spells.fields.some(f => f.ground)).toBe(true);
    const hp = sim.monsters[0].hp;
    run(sim, 0.5);
    expect(sim.monsters[0].hp).toBeLessThan(hp);
  });
  it('kill blasts hurt the enemies next to the dead one', () => {
    const sim = arena({ icenova: 15 }, 3, { icenova: [-1, -1, -1, 0] });
    const [a, b] = sim.monsters;
    b.x = a.x + 0.5; b.y = a.y;
    a.hp = 1; a.lastSkill = 'icenova';
    sim.dmgMon(a, 5);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
  it('the default condition follows the skill type', () => {
    const sim = arena({ fireball: 1, ashenhex: 1, rimeshell: 1 });
    sim.setSlotSkill(1, 'ashenhex');
    sim.setSlotSkill(2, 'rimeshell');
    expect(sim.s.slots[1].cond).toBe('notCursed');
    expect(sim.s.slots[2].cond).toBe('lifeLow');
  });
});
