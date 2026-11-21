/**
 * Warrior package, simulation side: melee reach and closing in, and the warrior skill types
 *   melee   – blow at a foe in reach, cleaving everything within `radius` of it
 *   fissure – a line of fire/ice/lightning from the hero towards the target (`range`, `width`)
 *   leap    – the hero jumps onto the target (up to `range` tiles, `delay` s in the air) and lands with an area hit
 *   cry     – burst around the hero plus a timed bonus: `cryMore` % more damage dealt, `cryDR` % less taken
 *   aura    – pulses around the hero every `tick` s for `duration`
 * The hero is never steered: a melee hero walks to the nearest foe when no skill can reach one, and never kites.
 * Leaps move him in fixed steps from the tick, so runs stay deterministic. Sim calls the hooks from marked lines;
 * all numbers live in skills.json and classes.json. Seeded RNG only, no DOM.
 */
import { HERO, classDef } from '../content/index.ts';
import type { SkillCtx } from './formulas.ts';
import type { Sim } from './sim.ts';
import type { Monster } from './types.ts';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
function segDist(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** A leap in the air: from, to, seconds flown, flight time. */
export interface Leap { skill: string; x0: number; y0: number; x1: number; y1: number; t: number; dur: number }
/** Storm around the hero (Tempest Mantle). */
export interface Aura { id: number; skill: string; t: number; dur: number; every: number; next: number }
/** Bonus of a cry: seconds left, more damage dealt (0..), less damage taken (0..1). */
export interface Cry { skill: string; t: number; dur: number; more: number; dr: number }
interface Again { t: number; skill: string; x: number; y: number; mult: number }

/** Keep this far inside the reach when closing in, so a foe that steps back stays in reach. */
const CLOSE_IN = 0.75;
const REPEAT_GAP = 0.4;
/** How close to the target a leap lands. */
const LEAP_STOP = 0.7;
/** Conditions that name a kind of target: a melee skill set to them only swings at such a foe. */
const TARGETED = new Set(['elite', 'notChilled', 'notBurning', 'notShocked', 'shocked', 'burning', 'chilled', 'notCursed']);

export class Melee {
  leap: Leap | null = null;
  auras: Aura[] = [];
  cries: Cry[] = [];
  /** monster the hero walks to because nothing is in reach */
  chase: number | null = null;
  private again: Again[] = [];
  private sim: Sim;
  constructor(sim: Sim) { this.sim = sim; }

  /** Does the hero's class fight in melee (no kiting, closes in)? */
  get on() { return classDef(this.sim.s.cls).melee; }
  /** Reach of the class's weapon in tiles. */
  get reach() { return classDef(this.sim.s.cls).reach ?? 1.9; }

  /* ---------- targets and the priority list ---------- */
  private inReach(c: SkillCtx, alive: Monster[]) {
    const h = this.sim.hero;
    return alive.filter(m => m.hp > 0 && dist(m, h) <= c.reach).sort((a, b) => dist(a, h) - dist(b, h));
  }
  /** Target of a melee skill or leap (undefined = not one of mine, or nothing it can reach). */
  aim(c: SkillCtx, cond: string, alive: Monster[]): Monster | undefined {
    const sim = this.sim, h = sim.hero, type = c.def.type;
    if (type !== 'melee' && type !== 'leap') return undefined;
    const t = sim.target(cond, alive);
    if (type === 'leap') {
      const range = c.def.range || 8;
      if (cond === 'enemyFar') return alive.filter(m => dist(m, h) > this.reach && dist(m, h) <= range).sort((a, b) => dist(a, h) - dist(b, h))[0];
      return t && dist(t, h) <= range ? t : alive.filter(m => dist(m, h) <= range).sort((a, b) => dist(a, h) - dist(b, h))[0];
    }
    if (t && dist(t, h) <= c.reach) return t;
    return TARGETED.has(cond) ? undefined : this.inReach(c, alive)[0];
  }
  /** Can this skill be used now? Melee skills need a foe in reach, leaps one in range, nothing while in the air. */
  canCast(c: SkillCtx, cond: string, alive: Monster[]): boolean {
    if (this.leap) return false;
    const type = c.def.type;
    if (type === 'melee' || type === 'leap') return !!this.aim(c, cond, alive);
    return true;
  }
  /** Conditions of the warrior skills (undefined = not mine). */
  cond(cond: string, id: string, alive: Monster[]): boolean | undefined {
    const sim = this.sim, h = sim.hero;
    if (cond === 'enemyFar') return !alive.some(m => dist(m, h) <= this.reach);
    if (cond === 'notCursed') {
      const c = sim.ctx(id);
      if (c.def.type === 'curse' && c.def.self) return alive.some(m => !m.hex && dist(m, h) <= c.radius);
    }
    return undefined;
  }
  pick(cond: string, alive: Monster[]): Monster | undefined {
    if (cond !== 'enemyFar') return undefined;
    const h = this.sim.hero;
    return alive.filter(m => dist(m, h) > this.reach).sort((a, b) => dist(a, h) - dist(b, h))[0];
  }

  /**
   * Nothing in the cast list fired: a melee hero swings his weapon at a foe in reach (free, gains fury)
   * or walks towards the first foe. Returns false for ranged classes (Staff Spark).
   */
  basic(alive: Monster[]): boolean {
    const sim = this.sim;
    if (!this.on) return false;
    if (this.leap) { sim.castT = 0.05; return true; }
    const c = sim.ctx('swing');
    if (this.aim(c, 'always', alive)) {
      sim.cast('swing', 'always', alive, false);
      sim.castT = c.castTime; sim.lastCast = 'swing';
      return true;
    }
    this.chase = alive[0]?.id ?? null;
    sim.castT = 0;
    return true;
  }
  /** Seconds the hero is busy after a cast (a leap lasts its flight). */
  busy() { return this.leap ? this.leap.dur - this.leap.t : 0; }

  /** Walk towards the chased foe (fight phase, nothing cast this tick). */
  step(dt: number) {
    const sim = this.sim, h = sim.hero;
    if (!this.on || this.chase == null || this.leap) return;
    const t = sim.monsters.find(m => m.id === this.chase && m.hp > 0);
    const d = t ? dist(t, h) : 0;
    if (!t || d <= this.reach * CLOSE_IN) { this.chase = null; return; }
    const st = Math.min(HERO.movement.walkSpeed * dt, d - this.reach * CLOSE_IN);
    h.x += ((t.x - h.x) / d) * st; h.y += ((t.y - h.y) / d) * st;
    h.walking = true;
    sim.face(t);
  }

  /* ---------- damage layers ---------- */
  /** Factor on all damage the hero deals (cries). */
  dmgMult() { let k = 1; for (const c of this.cries) k *= 1 + c.more; return k; }
  /** Factor on damage the hero takes (cries). */
  heroTaken() { let k = 1; for (const c of this.cries) k *= 1 - c.dr; return k; }

  /* ---------- casting ---------- */
  /** Cast a warrior skill type. Returns false for every other type. */
  cast(c: SkillCtx, t: Monster, alive: Monster[]): boolean {
    const sim = this.sim, h = sim.hero, s = sim.s, st = sim.st;
    switch (c.def.type) {
      case 'melee': {
        if (dist(t, h) > c.reach + 0.3) return true; // an echo whose foe stepped away: a miss
        sim.emit({ t: 'swing', x: h.x, y: h.y, tx: t.x, ty: t.y, el: c.el, r: c.radius });
        sim.hitMon(t, c, 1);
        if (c.radius > 0) for (const m of alive) if (m !== t && m.hp > 0 && dist(m, t) <= c.radius) sim.hitMon(m, c, 1, true);
        sim.spells.onDirectHit(c, t); // explode
        sim.spells.onImpact(c, t.x, t.y, 'area'); // ground, repeat
        if (c.id === 'swing') s.mana = Math.min(st.maxMana, sim.mana + (classDef(s.cls).furyPerSwing ?? 0));
        return true;
      }
      case 'fissure': {
        const k = Math.max(0.3, 1 + (c.g.radius || 0) / 100);
        this.fissure(c, t.x, t.y, k, 1);
        alive.filter(m => m !== t && m.hp > 0).slice(0, c.extra).forEach(o => this.fissure(c, o.x, o.y, k, c.extraDmg));
        for (let i = 1; i <= c.repeat; i++) this.again.push({ t: REPEAT_GAP * i, skill: c.id, x: t.x, y: t.y, mult: c.repeatDmg });
        return true;
      }
      case 'leap': {
        if (this.leap) return true; // a second leap (echo) while in the air does nothing
        const d = dist(t, h) || 1, go = Math.max(0, d - LEAP_STOP);
        this.leap = { skill: c.id, x0: h.x, y0: h.y, x1: h.x + ((t.x - h.x) / d) * go, y1: h.y + ((t.y - h.y) / d) * go, t: 0, dur: c.def.delay || 0.4 };
        this.chase = null;
        return true;
      }
      case 'cry': {
        const r = c.radius;
        sim.emit({ t: 'ring', x: h.x, y: h.y, r0: 0.4, r1: r, dur: 0.5, el: c.el, fill: true });
        sim.emit({ t: 'burst', x: h.x, y: h.y, z: 1.4, el: c.el, size: 90 });
        if ((c.def.max || 0) > 0) for (const m of alive) if (m.hp > 0 && dist(m, h) <= r) sim.hitMon(m, c, 1, true);
        this.cries = this.cries.filter(x => x.skill !== c.id);
        this.cries.push({ skill: c.id, t: c.duration, dur: c.duration, more: c.cryMore / 100, dr: c.cryDR / 100 });
        sim.buffs[c.id] = c.duration; sim.buffMax[c.id] = c.duration;
        if (c.g.wardHeal) s.life = Math.min(st.maxLife, sim.life + st.maxLife * c.g.wardHeal / 100);
        if (c.g.wardMana) s.mana = Math.min(st.maxMana, sim.mana + st.maxMana * c.g.wardMana / 100);
        sim.float(h.x, h.y, `+${Math.round(c.cryMore)}% damage`, '#e8cc5c');
        return true;
      }
      case 'aura': {
        this.auras = this.auras.filter(a => a.skill !== c.id);
        this.auras.push({ id: sim.nextUid(), skill: c.id, t: 0, dur: c.duration, every: (c.def.tick || 0.7) / c.rate, next: 0.2 });
        sim.buffs[c.id] = c.duration; sim.buffMax[c.id] = c.duration;
        sim.emit({ t: 'ring', x: h.x, y: h.y, r0: 0.3, r1: c.radius, dur: 0.5, el: c.el });
        return true;
      }
    }
    return false;
  }

  /** One fissure from the hero towards (tx, ty): hits everything on the line. */
  private fissure(c: SkillCtx, tx: number, ty: number, k: number, mult: number) {
    const sim = this.sim, h = sim.hero, d = Math.hypot(tx - h.x, ty - h.y) || 1, len = (c.def.range || 6) * k, w = (c.def.width || 0.8) * k;
    const a = { x: h.x, y: h.y }, b = { x: h.x + ((tx - h.x) / d) * len, y: h.y + ((ty - h.y) / d) * len };
    sim.emit({ t: 'beam', x0: a.x, y0: a.y, x1: b.x, y1: b.y, el: c.el, dur: 0.45 });
    for (let q = 0.15; q <= 1; q += 1.1 / len) sim.emit({ t: 'burst', x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q, z: 0.2, el: c.el, size: 52 });
    for (const m of sim.monsters) if (m.hp > 0 && segDist(m, a, b) <= w) sim.hitMon(m, c, mult, true);
    sim.spells.groundAt(c, b.x, b.y);
  }

  /* ---------- per tick ---------- */
  tick(dt: number) {
    const sim = this.sim, h = sim.hero, fight = sim.phase === 'fight';
    for (const c of this.cries.slice()) {
      c.t -= dt; sim.buffs[c.skill] = c.t;
      if (c.t <= 0) { this.cries.splice(this.cries.indexOf(c), 1); delete sim.buffs[c.skill]; }
    }
    for (const a of this.auras.slice()) {
      a.t += dt; a.next -= dt; sim.buffs[a.skill] = a.dur - a.t;
      if (a.t >= a.dur) { this.auras.splice(this.auras.indexOf(a), 1); delete sim.buffs[a.skill]; continue; }
      if (a.next > 0) continue;
      a.next += a.every;
      if (!fight) continue;
      const c = sim.ctx(a.skill);
      for (const m of sim.monsters) if (m.hp > 0 && dist(m, h) <= c.radius) {
        sim.emit({ t: 'bolt', pts: [{ x: h.x, y: h.y, z: 1.6 }, { x: m.x, y: m.y, z: 0.8 }] });
        sim.hitMon(m, c, 1, true);
      }
    }
    for (const g of this.again.slice()) {
      g.t -= dt;
      if (g.t > 0) continue;
      this.again.splice(this.again.indexOf(g), 1);
      if (fight) this.fissure(sim.ctx(g.skill), g.x, g.y, Math.max(0.3, 1 + (sim.ctx(g.skill).g.radius || 0) / 100), g.mult);
    }
    const L = this.leap;
    if (L) {
      L.t += dt;
      const q = Math.min(1, L.t / L.dur);
      h.x = L.x0 + (L.x1 - L.x0) * q; h.y = L.y0 + (L.y1 - L.y0) * q;
      h.walking = false;
      if (q >= 1) {
        this.leap = null;
        if (fight) {
          const c = sim.ctx(L.skill);
          sim.areaHit(c, L.x1, L.y1);
          sim.emit({ t: 'bolt', pts: [{ x: L.x1 + 0.3, y: L.y1 - 0.3, z: 12 }, { x: L.x1, y: L.y1, z: 0.2 }] });
          sim.spells.onImpact(c, L.x1, L.y1, 'area'); // ground, repeat
        }
      }
    }
  }
  /** Height of the hero above the ground while leaping (world units, for the renderer). */
  leapZ() { const L = this.leap; return L ? Math.sin(Math.min(1, L.t / L.dur) * Math.PI) * 2.2 : 0; }

  /** Wave over: pending fissures and the chase end; cries, auras and a leap in the air stay. */
  clearFight() { this.again = []; this.chase = null; }
  /** New area or death: everything goes. */
  reset() {
    this.clearFight(); this.leap = null;
    for (const x of [...this.cries, ...this.auras]) delete this.sim.buffs[x.skill];
    this.cries = []; this.auras = [];
  }
}
