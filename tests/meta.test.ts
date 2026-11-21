import { describe, expect, it } from 'vitest';
import { AREAS, FEATS, HERO, META, TYRANTS, UNIQUES } from '../src/content/index.ts';
import { BOUNTY_KINDS, bountyText, fillBoard, genBounty, swapCost } from '../src/sim/bounty.ts';
import { CODEX_ORDER, imprintBlock, imprintCost, unlockCodex } from '../src/sim/codex.ts';
import { disposeItem, salvage } from '../src/sim/economy.ts';
import { calcStats, skillCtx, xpNeeded } from '../src/sim/formulas.ts';
import { genItemOf, genUnique } from '../src/sim/items.ts';
import { LEVEL_CAP, emberBar, emberFree, featValue, tyrantKey } from '../src/sim/meta.ts';
import { newMeta, sanitizeMeta, type Bounty } from '../src/sim/meta-types.ts';
import { Rng } from '../src/sim/rng.ts';
import { migrate } from '../src/sim/save.ts';
import { Sim } from '../src/sim/sim.ts';
import { SAVE_VERSION, newSaveState } from '../src/sim/state.ts';
import type { Item, Monster, SaveState } from '../src/sim/types.ts';

const headless = (s?: SaveState, seed = 5) => new Sim(s, { seed, headless: true });
function fight(sim: Sim) { while (sim.phase !== 'fight') sim.tick(); sim.feel.objects = []; return sim; }
const mon = (sim: Sim, rank = 0, def = 'imp'): Monster => sim.mkMon(def, 5, rank, sim.hero.x + 3, sim.hero.y);
const kill = (sim: Sim, m: Monster) => { if (!sim.monsters.includes(m)) sim.monsters.push(m); sim.dmgMon(m, m.hp + m.ward + 1); };
const bounty = (o: Partial<Bounty>): Bounty => ({ id: 99, kind: 'killElites', diff: 0, area: 0, L: 5, need: 2, have: 0, reward: { gold: 100, mats: { dust: 7 }, gem: false }, ...o });
const rare = (sim: Sim, slot: Item['slot'] = 'weapon', L = 10) => genItemOf(sim.rng, sim.itemId(), L, 2, slot);

describe('bounty board', () => {
  it('always has three bounties of different kinds with readable texts', () => {
    const sim = headless();
    const b = sim.s.meta.bounties;
    expect(b.length).toBe(META.bounties.open);
    expect(new Set(b.map(x => x.kind)).size).toBe(b.length);
    for (const x of b) { expect(bountyText(x)).not.toMatch(/[{}]/); expect(x.reward.gold).toBeGreaterThan(0); }
  });
  it('generates every kind, and rewards grow with difficulty', () => {
    const s = newSaveState(), rng = new Rng(3);
    s.progress = [6, 6, 0];
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(genBounty(rng, s, i, new Set()).kind);
    expect([...seen].sort()).toEqual([...BOUNTY_KINDS].sort());
    const gold = (d: number) => { s.difficulty = d; let g = 0; for (let i = 0; i < 50; i++) g += genBounty(new Rng(i), s, i, new Set()).reward.gold; return g; };
    expect(gold(1)).toBeGreaterThan(gold(0) * 2);
  });
  it('tyrant bounties name an area that has a tyrant', () => {
    const s = newSaveState(), rng = new Rng(9);
    s.progress = [6, 0, 0];
    for (let i = 0; i < 200; i++) { const b = genBounty(rng, s, i, new Set()); if (b.kind === 'killTyrant') expect(TYRANTS[AREAS[b.area].id]).toBeTruthy(); }
  });
  it('counts kills, is claimed with one tap and replaced', () => {
    const sim = fight(headless());
    sim.s.meta.bounties = [bounty({})];
    fillBoard(sim.rng, sim.s);
    kill(sim, mon(sim, 2));
    expect(sim.s.meta.bounties[0].have).toBe(1);
    expect(sim.meta.claim(99)).toBe('Not done yet.');
    kill(sim, mon(sim, 2));
    const gold = sim.s.gold, dust = sim.s.mats.dust;
    expect(sim.meta.claim(99)).toBeNull();
    expect(sim.s.gold).toBe(gold + 100);
    expect(sim.s.mats.dust).toBe(dust + 7);
    expect(sim.s.meta.bounties.length).toBe(3);
    expect(sim.s.meta.bounties.some(b => b.id === 99)).toBe(false);
    expect(sim.s.meta.stats.bounties).toBe(1);
  });
  it('counts area kills, elements, rares and shrines', () => {
    const sim = fight(headless());
    sim.s.meta.bounties = [
      bounty({ id: 1, kind: 'killArea', area: sim.s.zone, need: 5 }),
      bounty({ id: 2, kind: 'killElement', el: 'cold', need: 5 }),
      bounty({ id: 3, kind: 'useShrines', need: 3 }),
    ];
    kill(sim, mon(sim, 0, 'imp')); kill(sim, mon(sim, 0, 'wraith'));
    const [a, e, sh] = sim.s.meta.bounties;
    expect(a.have).toBe(2); expect(e.have).toBe(1);
    sim.feel.stats.shrines += 2; sim.meta.tick(0);
    expect(sh.have).toBe(2);
    sim.s.meta.bounties = [bounty({ id: 4, kind: 'findRare', slot: 'ring', need: 1 })];
    sim.meta.onItem(rare(sim, 'helm')); expect(sim.s.meta.bounties[0].have).toBe(0);
    sim.meta.onItem(rare(sim, 'ring')); expect(sim.s.meta.bounties[0].have).toBe(1);
  });
  it('a bounty can be swapped for gold', () => {
    const sim = headless(), b = sim.s.meta.bounties[0];
    sim.s.gold = 0;
    expect(sim.meta.swap(b.id)).toMatch(/costs/);
    sim.s.gold = swapCost(b);
    expect(sim.meta.swap(b.id)).toBeNull();
    expect(sim.s.gold).toBe(0);
    expect(sim.s.meta.bounties.some(x => x.id === b.id)).toBe(false);
  });
});

describe('area tyrants', () => {
  it('every area has a tyrant using an existing monster', () => {
    for (const a of AREAS) expect(TYRANTS[a.id], a.id).toBeTruthy();
  });
  it('the kill counter fills per area and difficulty and brings the tyrant', () => {
    const sim = fight(headless()), key = tyrantKey(0, sim.s.zone);
    sim.s.meta.tyrant[key] = META.tyrants.kills - 2;
    kill(sim, mon(sim));
    expect(sim.meta.onNextWave()).toBe(false);
    kill(sim, mon(sim));
    expect(sim.s.meta.tyrant[key]).toBe(META.tyrants.kills);
    expect(sim.s.meta.tyrant[tyrantKey(1, sim.s.zone)]).toBeUndefined();
    expect(sim.meta.onNextWave()).toBe(true);
    const t = sim.monsters[0];
    expect(t.mt?.ty).toBe(AREAS[sim.s.zone].id);
    expect(t.rank).toBe(3);
    expect(t.name).toBe(TYRANTS[t.mt!.ty!].name);
    // its kills do not count while it is up; it does not spawn twice
    expect(sim.meta.onNextWave()).toBe(false);
    const before = sim.drops.length;
    kill(sim, t);
    expect(sim.s.meta.tyrant[key]).toBe(0);
    expect(sim.s.meta.slain[t.mt!.ty!]).toBe(1);
    expect(sim.drops.length).toBeGreaterThan(before);
  });
  it('the mechanic puts warning circles down', () => {
    const sim = fight(headless());
    sim.s.meta.tyrant[tyrantKey(0, sim.s.zone)] = META.tyrants.kills;
    sim.meta.onNextWave();
    sim.feel.blasts = [];
    sim.monsters[0].mt!.mechT = 0.01;
    sim.meta.tick(0.05);
    expect(sim.feel.blasts.length).toBeGreaterThan(0);
    expect(sim.feel.blasts[0].label).toBe(TYRANTS[AREAS[sim.s.zone].id].mechanic.name);
  });
  it('tyrant loot favours its slots', () => {
    const sim = fight(headless(undefined, 21));
    sim.s.loot.minR = { weapon: 0, helm: 0, armor: 0, amulet: 0, ring: 0 };
    let ok = 0, n = 0;
    for (let i = 0; i < 20; i++) {
      sim.drops = []; sim.monsters = [];
      sim.s.meta.tyrant[tyrantKey(0, sim.s.zone)] = META.tyrants.kills;
      sim.meta.onNextWave();
      const T = TYRANTS[sim.monsters[0].mt!.ty!];
      kill(sim, sim.monsters[0]);
      for (const d of sim.drops) if (d.item && !('kind' in d.item && d.item.kind === 'gem') && (d.item as Item).r === 2) { n++; if (T.slots.includes((d.item as Item).slot)) ok++; }
    }
    expect(n).toBeGreaterThan(20);
    expect(ok).toBe(n);
  });
});

describe('area events', () => {
  it('Blood Moon doubles waves', () => {
    const sim = fight(headless());
    sim.meta.startEvent('bloodmoon');
    sim.monsters = [];
    sim.spawnWave();
    const n = sim.monsters.filter(m => !m.fe?.flee).length;
    expect(n % 2).toBe(0);
    expect(n).toBeGreaterThanOrEqual(2);
  });
  it('Rift Tear grows with kills inside and drops more', () => {
    const sim = fight(headless());
    sim.meta.startEvent('tear');
    const ev = sim.meta.ev!, r0 = ev.r!;
    const m = mon(sim); m.x = ev.x!; m.y = ev.y!;
    const before = sim.drops.length;
    kill(sim, m);
    expect(sim.meta.ev!.r).toBeCloseTo(r0 + META.events.tear.growPerKill);
    expect(sim.drops.length).toBeGreaterThan(before);
  });
  it('the Trapped Champion waits in its casing and drops a bonus-affix rare', () => {
    const sim = fight(headless());
    sim.meta.startEvent('champion');
    sim.spawnWave();
    const c = sim.monsters.find(m => m.mt?.champion)!;
    expect(c.mt!.encased).toBe(true);
    expect(sim.meta.monStep(c)).toBe(true);
    c.ward = 0;
    expect(sim.meta.monStep(c)).toBe(false);
    sim.s.loot.minR = { weapon: 0, helm: 0, armor: 0, amulet: 0, ring: 0 };
    sim.drops = [];
    kill(sim, c);
    expect(sim.meta.ev).toBeNull();
    const big = sim.drops.map(d => d.item as Item | undefined).filter(it => it && it.r === 2 && it.mods.length - it.imp >= 4);
    expect(big.length).toBeGreaterThan(0);
  });
  it('only one event at a time, and they come every few minutes', () => {
    const sim = headless(undefined, 8);
    let starts = 0;
    for (let t = 0; t < 1800; t += 1) { const had = sim.meta.ev; sim.advance(1); if (!had && sim.meta.ev) starts++; }
    expect(starts).toBeGreaterThanOrEqual(4);
    expect(starts).toBeLessThanOrEqual(14);
  });
});

describe('unique codex and imprint', () => {
  it('salvaging a unique unlocks its effect, also through auto-salvage', () => {
    const sim = headless(), u = genUnique(sim.rng, sim.itemId(), 10, 'lantern');
    sim.s.bag.push(u);
    salvage(sim, u.id);
    expect(sim.s.meta.codex).toEqual(['lantern']);
    disposeItem(sim.s, genUnique(sim.rng, sim.itemId(), 10, 'bell'), 'salvage');
    disposeItem(sim.s, genUnique(sim.rng, sim.itemId(), 10, 'saint'), 'sell');
    expect(sim.s.meta.codex).toEqual(['lantern', 'bell']);
    expect(unlockCodex(sim.s, genUnique(sim.rng, sim.itemId(), 10, 'bell'))).toBe(false);
  });
  it('has at least 14 entries, each with a fitting slot', () => {
    expect(CODEX_ORDER.length).toBeGreaterThanOrEqual(14);
    for (const u of META.bounties.reward.uniqueTable) expect(UNIQUES[u], u).toBeTruthy();
    for (const T of Object.values(TYRANTS)) for (const u of T.uniques) expect(UNIQUES[u], u).toBeTruthy();
  });
  it('imprints an unlocked effect on a rare of the same slot, once', () => {
    const sim = headless(), s = sim.s, it = rare(sim, 'weapon');
    s.bag.push(it); s.meta.codex.push('lantern', 'saint');
    expect(imprintBlock(s, it, 'saint')).toMatch(/fits/);
    expect(imprintBlock(s, it, 'bell')).toMatch(/Salvage/);
    expect(imprintBlock(s, { ...it, r: 1 }, 'lantern')).toMatch(/Rare/);
    s.mats = { dust: 0, essence: 0, shard: 0 };
    expect(sim.meta.imprint(it.id, 'lantern')).toMatch(/needs/);
    const c = imprintCost(it);
    s.mats = { dust: 0, essence: c.essence ?? 0, shard: c.shard ?? 0 };
    expect(sim.meta.imprint(it.id, 'lantern')).toBeNull();
    expect(it.ipr).toBe('lantern');
    expect(s.mats.shard).toBe(0);
    expect(imprintBlock(s, it, 'lantern')).toMatch(/already/);
    // equipped: counts as the unique's effect
    sim.equip(it.id);
    expect(sim.st.uniques.has('lantern')).toBe(true);
    s.skills.fireball = 1;
    expect(skillCtx(s, sim.st, 'fireball').projectiles).toBe(3);
  });
  it('the new unique effects work', () => {
    const s = newSaveState(), base = calcStats(s);
    const wear = (u: string) => { const t = newSaveState(); t.equip[UNIQUES[u].slot] = genUnique(new Rng(1), 1, 10, u); t.equip[UNIQUES[u].slot]!.mods = []; return t; };
    const ob = calcStats(wear('oathbreaker'));
    expect(ob.plus.ember).toBe(1); expect(ob.rawRes.fire).toBe(base.rawRes.fire - 15);
    const mc = wear('mourncowl'); mc.difficulty = 2; mc.progress = [6, 6, 1];
    expect(Math.min(...Object.values(calcStats(mc).res))).toBe(0);
    expect(calcStats(wear('choireye')).pen.cold).toBe(12);
    expect(calcStats(wear('ninthbell')).elemDR).toBe(8);
    expect(calcStats(wear('lamplighter')).barrierRegen).toBe(100);
    const hr = wear('hollowreed'); hr.skills.frostbolt = 1;
    const c = skillCtx(hr, calcStats(hr), 'frostbolt');
    expect(c.projectiles).toBe(2); expect(c.pierce).toBe(2);
    const tc = wear('tidecrook'); tc.skills.icenova = 1;
    expect(skillCtx(tc, calcStats(tc), 'icenova').radius).toBeGreaterThan(skillCtx(s, base, 'icenova').radius);
  });
  it('the Tallow Saint heals on kill', () => {
    const sim = fight(headless());
    sim.s.equip.armor = genUnique(sim.rng, sim.itemId(), 10, 'tallow'); sim.recalc();
    sim.s.life = 10;
    kill(sim, mon(sim));
    expect(sim.s.life).toBeGreaterThan(10);
  });
});

describe('ember points after the level cap', () => {
  const capped = () => { const s = newSaveState(); s.lvl = LEVEL_CAP; return headless(s); };
  const gain = (sim: Sim, x: number) => (sim as unknown as { gainXp(x: number): void }).gainXp(x);
  it('the level stops at the cap', () => {
    expect(HERO.levelCap).toBe(60);
    const s = newSaveState(); s.lvl = LEVEL_CAP - 1;
    const sim = headless(s);
    gain(sim, xpNeeded(LEVEL_CAP - 1) + 10 * emberBar());
    expect(sim.s.lvl).toBe(LEVEL_CAP);
    expect(sim.s.meta.ember.earned).toBe(10);
  });
  it('each full bar gives one point; points are spent and moved freely', () => {
    const sim = capped();
    gain(sim, emberBar() * 3 + 5);
    expect(sim.s.meta.ember.earned).toBe(3);
    expect(sim.s.xp).toBe(5);
    const fire = sim.st.el.fire;
    sim.meta.emberAdd('offense', 10);
    expect(sim.s.meta.ember.alloc.offense).toBe(3);
    expect(emberFree(sim.s)).toBe(0);
    expect(sim.st.el.fire).toBeCloseTo(fire + 1.5);
    sim.meta.emberAdd('offense', -1); sim.meta.emberAdd('fortune', 1);
    expect(sim.st.mods.goldPct).toBeCloseTo(0.5);
    expect(sim.meta.goldMult()).toBeCloseTo(1.005);
    sim.meta.emberReset();
    expect(emberFree(sim.s)).toBe(3);
    expect(sim.st.el.fire).toBe(fire);
  });
  it('keeps working in headless (offline) runs', () => {
    const sim = capped();
    sim.s.xp = emberBar() - 1;
    sim.advance(120);
    expect(sim.s.lvl).toBe(LEVEL_CAP);
    expect(sim.s.meta.ember.earned).toBeGreaterThanOrEqual(1);
  });
});

describe('feats', () => {
  it('about thirty feats, all with a goal and a bonus or a title', () => {
    const ids = Object.keys(FEATS);
    expect(ids.length).toBeGreaterThanOrEqual(30);
    const s = newSaveState();
    for (const id of ids) { const F = FEATS[id]; expect(F.n).toBeGreaterThan(0); expect(!!F.bonus !== !!F.title, id).toBe(true); expect(typeof featValue(s, F.type)).toBe('number'); }
  });
  it('are earned once, give their bonus, toast and grant titles', () => {
    const sim = new Sim(undefined, { seed: 4 });
    const life = sim.st.maxLife;
    sim.s.kills = 100;
    sim.meta.checkFeats();
    expect(sim.s.meta.feats).toContain('kills100');
    expect(sim.st.maxLife).toBe(life + FEATS.kills100.bonus!.life);
    expect(sim.events.some(e => e.t === 'meta' && e.kind === 'feat' && e.id === 'kills100')).toBe(true);
    sim.meta.checkFeats();
    expect(sim.s.meta.feats.filter(f => f === 'kills100').length).toBe(1);
    sim.meta.setTitle('kills5000');
    expect(sim.s.meta.title).toBeNull();
    sim.s.kills = 5000; sim.meta.checkFeats(); sim.meta.setTitle('kills5000');
    expect(sim.s.meta.title).toBe('kills5000');
  });
});

describe('save', () => {
  it('v6 saves get empty meta progress', () => {
    const s = newSaveState() as unknown as Record<string, unknown>;
    s.v = 6; delete s.meta;
    const m = migrate(s);
    expect(m.v).toBe(SAVE_VERSION);
    expect(m.meta).toEqual(newMeta());
  });
  it('meta survives a round trip and junk is dropped', () => {
    const sim = headless();
    sim.s.meta.codex.push('lantern'); sim.s.meta.feats.push('kills100'); sim.s.meta.ember = { earned: 4, alloc: { offense: 2, defense: 1, flow: 0, fortune: 0 } };
    sim.s.meta.tyrant['0:gallows-field'] = 40;
    const back = migrate(JSON.parse(JSON.stringify(sim.s)));
    expect(back.meta).toEqual(sim.s.meta);
    const bad = sanitizeMeta({ codex: ['nope', 'bell', 'bell'], feats: ['x'], title: 'kills100', ember: { earned: 1, alloc: { offense: 5 } }, tyrant: { 'zz': 3, '0:nope': 2 }, bounties: [{ kind: 'killTyrant', area: 99 }, { kind: 'bogus' }] });
    expect(bad.codex).toEqual(['bell']);
    expect(bad.feats).toEqual([]);
    expect(bad.title).toBeNull();
    expect(bad.ember.alloc.offense).toBe(0);
    expect(bad.tyrant).toEqual({});
    expect(bad.bounties.length).toBeLessThanOrEqual(1);
  });
  it('a loaded save keeps its bounties', () => {
    const a = headless();
    const ids = a.s.meta.bounties.map(b => b.id);
    const b = headless(migrate(JSON.parse(JSON.stringify(a.s))));
    expect(b.s.meta.bounties.map(x => x.id)).toEqual(ids);
  });
});
