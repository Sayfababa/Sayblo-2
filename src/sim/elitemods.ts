/**
 * Behaviour of champion and elite affixes (src/content/monsters.json, eliteMods).
 * Stat affixes (Fast, Warded, ...) change numbers once at spawn; behaviour affixes
 * (Fire-Enchanted, Frost Aura, Teleporting, Shielding, Mirrored) act every tick or on death.
 * All their damage is elemental. Called by feel.ts; uses only the seeded RNG.
 */
import { CHAMPION_MODS, ELITE_MODS, MONSTERS } from '../content/index.ts';
import type { Sim } from './sim.ts';
import type { Monster } from './types.ts';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Apply the stat part of an affix (the same rules the elite spawn uses). */
export function applyModStats(m: Monster, k: string) {
  const e = ELITE_MODS[k];
  if (!e) return;
  if (e.attackTime) m.atkTime *= e.attackTime;
  if (e.moveSpeed) m.mv *= e.moveSpeed;
  if (e.wardPct) m.ward = m.maxWard = Math.round(m.maxHp * e.wardPct);
  if (e.vampPct) m.vamp = e.vampPct;
  if (e.ownResAdd) m.res[MONSTERS[m.def].element] += e.ownResAdd;
  if (e.dmg) m.dmg *= e.dmg;
}

/** Champions sometimes get one affix from a smaller pool. */
export function rollChampionMod(sim: Sim, m: Monster) {
  if (m.rank !== 1 || MONSTERS[m.def].treasure || !sim.rng.chance(CHAMPION_MODS.chance)) return;
  const k = sim.rng.pick(CHAMPION_MODS.pool);
  m.mods = [k];
  applyModStats(m, k);
  m.sub = `${MONSTERS[m.def].name} · ${k}`;
}

const timer = (sim: Sim, m: Monster, k: string, every: number, dt: number): boolean => {
  const fe = (m.fe ??= {}), t = (fe.t ??= {});
  if (t[k] == null) t[k] = every * sim.rng.range(0.4, 1);
  t[k] -= dt;
  if (t[k] > 0) return false;
  t[k] = every;
  return true;
};

/** Per-tick behaviour of a monster's affixes (only for living, not frozen monsters). */
export function modsStep(sim: Sim, m: Monster, dt: number) {
  if (!m.mods.length) return;
  const h = sim.hero;
  for (const k of m.mods) {
    const e = ELITE_MODS[k];
    if (!e) continue;
    if (e.aura && timer(sim, m, k, e.aura.every, dt)) {
      const A = e.aura;
      sim.emit({ t: 'ring', x: m.x, y: m.y, r0: 0.4, r1: A.radius, dur: 0.5, el: A.element });
      if (dist(m, h) <= A.radius) {
        sim.feel.chillHero(A.chill, A.chillTime);
        sim.monHit(m.dmg, A.element, m.name, A.mult);
      }
    }
    if (e.teleport && timer(sim, m, k, e.teleport.every, dt)) {
      const T = e.teleport;
      if (dist(m, h) > T.minDist) {
        sim.emit({ t: 'ring', x: m.x, y: m.y, r0: 0.2, r1: 1.2, dur: 0.35, el: 'light' });
        const a = Math.atan2(m.y - h.y, m.x - h.x) + sim.rng.range(-0.9, 0.9);
        m.x = m.px = h.x + Math.cos(a) * T.near; m.y = m.py = h.y + Math.sin(a) * T.near;
        sim.emit({ t: 'ring', x: m.x, y: m.y, r0: 1.2, r1: 0.2, dur: 0.35, el: 'light' });
      }
    }
    if (e.shield && timer(sim, m, k, e.shield.every, dt)) {
      const S = e.shield;
      let any = false;
      for (const o of sim.monsters) {
        if (o === m || o.hp <= 0 || dist(o, m) > S.radius || MONSTERS[o.def].treasure) continue;
        const cap = Math.round(o.maxHp * S.max);
        if (o.ward >= cap) continue;
        o.ward = Math.min(cap, o.ward + Math.round(o.maxHp * S.pct)); o.maxWard = Math.max(o.maxWard, o.ward);
        any = true;
      }
      if (any) sim.emit({ t: 'ring', x: m.x, y: m.y, r0: 0.3, r1: S.radius, dur: 0.6, el: 'cold' });
    }
  }
}

/** After a monster took damage: Mirrored splits off its image once. */
export function onModDamaged(sim: Sim, m: Monster) {
  if (m.hp <= 0 || !m.mods.length) return;
  for (const k of m.mods) {
    const M = ELITE_MODS[k]?.mirror;
    if (!M || m.fe?.split || m.hp >= m.maxHp * M.below) continue;
    (m.fe ??= {}).split = true;
    const a = sim.rng.range(0, Math.PI * 2);
    const c = sim.mkMon(m.def, m.L, 0, m.x + Math.cos(a) * 1.1, m.y + Math.sin(a) * 1.1);
    c.rank = 1; c.maxHp = c.hp = Math.max(1, Math.round(m.maxHp * M.hpPct));
    c.dmg = m.dmg * M.dmg; c.atkTime = m.atkTime; c.mv = m.mv; c.res = { ...m.res }; c.el = m.el;
    c.name = M.name; c.sub = `Reflection of ${m.name}`; c.fe = { noLoot: true };
    sim.monsters.push(c);
    sim.emit({ t: 'ring', x: c.x, y: c.y, r0: 0.2, r1: 1.6, dur: 0.45, el: 'light' });
    sim.log(`**${m.name}** splits off a ${M.name}!`, 'r2');
    sim.feel.stats.mirrors++;
  }
}

/** On death: Fire-Enchanted leaves a warning circle that explodes after a delay. */
export function onModDeath(sim: Sim, m: Monster) {
  for (const k of m.mods) {
    const B = ELITE_MODS[k]?.deathBlast;
    if (!B) continue;
    sim.feel.addBlast({ x: m.x, y: m.y, t: B.delay, dur: B.delay, r: B.radius, dmg: m.dmg * B.mult, el: B.element, name: m.name, label: B.name });
  }
}
