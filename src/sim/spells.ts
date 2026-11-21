/**
 * Skills package, simulation side: the newer skill types (beam, curse, field, ward, construct, orb) and the
 * behaviour keys of skill modifiers (explode, ground, repeat, extra, killBlast, Frost Armor extras).
 * Sim calls the hook methods of this class from a few clearly marked lines; all numbers live in skills.json.
 * Everything here is class-agnostic: a Warrior skill of type "field" or with "explode" works the same way.
 * Seeded RNG only, no DOM.
 */
import { ELEMENT_COLORS, ELEMENTS, RANKS, SKILLS, STATES, type Element } from '../content/index.ts';
import { afterRes, total, type Dmg, type SkillCtx } from './formulas.ts';
import type { Sim } from './sim.ts';
import type { Monster } from './types.ts';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
/** Distance of point p from the segment a-b. */
function segDist(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Channelled beam (Flame Lance): pulses at an interval while the hero channels. */
export interface Beam { id: number; skill: string; target: number; left: number; every: number; next: number; t: number; x1: number; y1: number }
/** Ground patch that pulses damage (Hailstorm, or burning/icy ground from a modifier). */
export interface Field { id: number; skill: string; x: number; y: number; r: number; t: number; dur: number; every: number; next: number; mult: number; el: Element; ground: boolean }
/** Slow drifting orb that zaps enemies near it (Stormwisp). */
export interface Orb { id: number; skill: string; x: number; y: number; px: number; py: number; dx: number; dy: number; t: number; life: number; next: number }
/** Elemental construct that floats beside the hero and attacks (Storm Lantern). */
export interface Construct { id: number; skill: string; x: number; y: number; px: number; py: number; ang: number; t: number; life: number; next: number }
/** Ice shell (Rime Shell): seconds left, full time, damage reduction 0..1, barrier it added. */
export interface Shell { skill: string; t: number; max: number; dr: number; amt: number }
interface Delayed { t: number; skill: string; x: number; y: number; mult: number; kind: string }

/** Kill blasts deal at most this many "normal monster lives" (keeps boss deaths from wiping the screen twice). */
const BLAST_RANK_CAP = 3;
const BLAST_RADIUS = 1.6;
const REPEAT_GAP = 0.4;
const MAX_FIELDS = 14;
const BREAK_NOVA_CD = 3;

export class Spells {
  beams: Beam[] = [];
  fields: Field[] = [];
  orbs: Orb[] = [];
  constructs: Construct[] = [];
  shell: Shell | null = null;
  private delayed: Delayed[] = [];
  private breakCd = 0;
  private sim: Sim;
  constructor(sim: Sim) { this.sim = sim; }

  /* ---------- casting the new types ---------- */
  /** Cast a skill of one of the newer types. Returns false for the classic types (sim.ts handles those). */
  cast(c: SkillCtx, t: Monster, alive: Monster[]): boolean {
    const sim = this.sim, h = sim.hero, type = c.def.type, uid = () => sim.nextUid();
    switch (type) {
      case 'beam': {
        const n = Math.max(1, c.ticks), every = c.castTime / n;
        this.beams.push({ id: uid(), skill: c.id, target: t.id, left: n, every, next: every * 0.5, t: 0, x1: t.x, y1: t.y });
        return true;
      }
      case 'curse': {
        const r = c.radius;
        sim.emit({ t: 'ring', x: t.x, y: t.y, r0: 0.3, r1: r, dur: 0.6, el: c.el, fill: true });
        for (const m of alive) if (dist(m, t) <= r) this.hexMon(m, c);
        return true;
      }
      case 'field': {
        this.addField(c, t.x, t.y, c.radius, c.duration, (c.def.tick || 0.5) / c.rate, 1, false);
        for (const o of this.others(t, alive, c.extra)) this.addField(c, o.x, o.y, c.radius, c.duration, (c.def.tick || 0.5) / c.rate, c.extraDmg, false);
        return true;
      }
      case 'ward': {
        const st = sim.st, s = sim.s, amt = Math.round(st.maxLife * c.wardPct / 100);
        if (this.shell) s.barrier = Math.max(0, s.barrier - this.shell.amt);
        this.shell = { skill: c.id, t: c.duration, max: c.duration, dr: c.wardDR / 100, amt };
        sim.buffs[c.id] = c.duration; sim.buffMax[c.id] = c.duration;
        s.barrier = Math.min(sim.maxBarrier(), s.barrier + amt);
        const r = c.def.radius || 2.5, nova = (c.g.wardNova || 0) / 100;
        sim.emit({ t: 'ring', x: h.x, y: h.y, r0: 0.3, r1: r, dur: 0.5, el: c.el, fill: true });
        for (const m of alive) if (dist(m, h) <= r) {
          if (nova) sim.hitMon(m, c, nova, true);
          if (m.hp > 0 && m.freezeCd <= 0) sim.freeze(m, (c.def.freeze || 1) * c.freezeMult);
        }
        if (c.g.wardMana) s.mana = Math.min(st.maxMana, sim.mana + st.maxMana * c.g.wardMana / 100);
        if (c.g.wardHeal) s.life = Math.min(st.maxLife, sim.life + st.maxLife * c.g.wardHeal / 100);
        sim.float(h.x, h.y, `+${amt} barrier`, '#a6dcf0');
        return true;
      }
      case 'construct': {
        const n = this.constructs.filter(k => k.skill === c.id);
        const ang = sim.rng.range(0, Math.PI * 2);
        this.constructs.push({ id: uid(), skill: c.id, x: h.x, y: h.y, px: h.x, py: h.y, ang, t: 0, life: c.duration, next: 0.4 });
        if (n.length + 1 > Math.max(1, c.constructs)) this.constructs.splice(this.constructs.indexOf(n.sort((a, b) => (a.life - a.t) - (b.life - b.t))[0]), 1);
        sim.emit({ t: 'ring', x: h.x, y: h.y, r0: 0.2, r1: 1, dur: 0.4, el: c.el });
        return true;
      }
      case 'orb': {
        const base = Math.atan2(t.y - h.y, t.x - h.x), n = Math.max(1, c.orbs), spd = c.def.speed || 2.5;
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.45;
          this.orbs.push({ id: uid(), skill: c.id, x: h.x, y: h.y, px: h.x, py: h.y, dx: Math.cos(a) * spd, dy: Math.sin(a) * spd, t: 0, life: c.duration, next: 0.15 });
        }
        return true;
      }
    }
    return false;
  }

  /** Extra meteors / bolts on other enemies (modifier "extra"). Called when a strike-type skill is cast. */
  extraStrikes(c: SkillCtx, t: Monster, alive: Monster[], kind: 'meteor' | 'strike', echo: boolean) {
    const sim = this.sim;
    this.others(t, alive, c.extra).forEach((o, i) => {
      sim.strikes.push({ id: sim.nextUid(), x: o.x, y: o.y, t: -0.15 * (i + 1), dur: c.def.delay || 0.5, skill: c.id, kind, echo, mult: c.extraDmg, sub: true });
      if (kind === 'strike') sim.emit({ t: 'bolt', pts: [{ x: o.x + 0.4, y: o.y - 0.4, z: 14 }, { x: o.x, y: o.y, z: 0.2 }] });
    });
  }

  /** An area impact happened (area, nova, meteor, strike): ground patch and repeats from modifiers. */
  onImpact(c: SkillCtx, x: number, y: number, kind: string, sub = false) {
    if (c.ground) this.addField(c, x, y, c.ground, c.groundDur, 0.5, c.groundDmg, true);
    if (!sub) for (let i = 1; i <= c.repeat; i++) this.delayed.push({ t: REPEAT_GAP * i, skill: c.id, x, y, mult: c.repeatDmg, kind });
  }

  /** A single-target hit landed (projectile, chain jump, beam pulse, construct strike): explosion modifier. */
  onDirectHit(c: SkillCtx, m: Monster) {
    if (!c.explode || c.def.type === 'orb') return;
    this.burst(c, m.x, m.y, c.explode, c.explodeDmg, m);
  }

  private burst(c: SkillCtx, x: number, y: number, r: number, mult: number, skip?: Monster) {
    const sim = this.sim;
    sim.emit({ t: 'ring', x, y, r0: 0.2, r1: r, dur: 0.35, el: c.el, fill: true });
    sim.emit({ t: 'burst', x, y, z: 0.5, el: c.el, size: 60 + r * 30 });
    for (const o of sim.monsters) if (o !== skip && o.hp > 0 && Math.hypot(o.x - x, o.y - y) <= r) sim.hitMon(o, c, mult, true);
  }

  /* ---------- per-hit and per-kill effects ---------- */
  /** Target-dependent damage layers: hex (more damage taken) and "% more against burning/chilled/shocked". */
  preHit(m: Monster, c: SkillCtx, d: Dmg) {
    let k = 1;
    if (c.vs.burning && m.burn > 0) k *= 1 + c.vs.burning / 100;
    if (c.vs.chilled && (m.chill > 0 || m.frozen > 0)) k *= 1 + c.vs.chilled / 100;
    if (c.vs.shocked && m.shock > 0) k *= 1 + c.vs.shocked / 100;
    for (const e of ELEMENTS) d[e] *= k * (m.hex ? 1 + m.hex.taken[e] : 1);
    m.lastSkill = c.id;
  }
  /** Movement/attack speed factor of a monster from a slowing hex. */
  monSlow(m: Monster) { return m.hex ? 1 - m.hex.slow : 1; }

  private hexMon(m: Monster, c: SkillCtx) {
    const v = c.curse / 100, all = (c.g.curseAll || 0) > 0;
    const taken = { fire: 0, cold: 0, light: 0 } as Record<Element, number>;
    for (const e of ELEMENTS) taken[e] = e === c.el ? v : all ? v / 2 : 0;
    m.hex = { t: c.duration, taken, slow: (c.g.curseSlow || 0) / 100, skill: c.id };
  }

  /** A monster died: kill blasts (modifier or hex) and hex contagion. */
  onKill(m: Monster) {
    const sim = this.sim;
    const pct = Math.max(m.lastSkill && SKILLS[m.lastSkill] ? sim.ctx(m.lastSkill).killBlast : 0, m.hex ? sim.ctx(m.hex.skill).killBlast : 0);
    if (pct > 0) {
      const el = m.hex && sim.ctx(m.hex.skill).killBlast >= pct ? sim.ctx(m.hex.skill).el : m.lastSkill ? sim.ctx(m.lastSkill).el : 'fire';
      const life = Math.min(m.maxHp, (m.maxHp / RANKS[m.rank].hp) * Math.min(RANKS[m.rank].hp, BLAST_RANK_CAP));
      const amt = life * pct / 100;
      sim.emit({ t: 'ring', x: m.x, y: m.y, r0: 0.3, r1: BLAST_RADIUS, dur: 0.4, el, fill: true });
      sim.emit({ t: 'burst', x: m.x, y: m.y, z: 0.6, el, size: 100 });
      for (const o of sim.monsters) if (o !== m && o.hp > 0 && dist(o, m) <= BLAST_RADIUS) {
        const d: Dmg = { fire: 0, cold: 0, light: 0 };
        d[el] = amt * (o.hex ? 1 + o.hex.taken[el] : 1);
        const v = Math.max(1, Math.round(total(afterRes(d, o.res, sim.st.pen, o.shock > 0 ? 1 + o.shockEff : 1))));
        sim.float(o.x, o.y, String(v), ELEMENT_COLORS[el], false, true);
        sim.dmgMon(o, v);
      }
    }
    if (m.hex && (sim.ctx(m.hex.skill).g.curseSpread || 0) > 0) {
      for (const o of sim.monsters) if (o !== m && o.hp > 0 && !o.hex && dist(o, m) <= 2.5) o.hex = { ...m.hex, taken: { ...m.hex.taken } };
    }
  }

  /* ---------- Frost Armor modifiers ---------- */
  private armorCtx() { const sim = this.sim; return (sim.buffs.frostarmor ?? 0) > 0 && sim.s.skills.frostarmor ? sim.ctx('frostarmor') : null; }
  /** A melee monster hit the hero (Ice Spikes, Cold Grip). */
  onMelee(m: Monster) {
    const c = this.armorCtx(), sim = this.sim;
    if (!c || m.hp <= 0) return;
    if (c.g.retaliate) sim.hitMon(m, c, c.g.retaliate / 100, true);
    if (c.g.wardFreeze && m.hp > 0 && m.freezeCd <= 0 && sim.rng.next() * 100 < c.g.wardFreeze) sim.freeze(m, STATES.freezeDuration * c.freezeMult);
  }
  /** The barrier just broke (Shatter Armor). */
  onBarrierBreak() {
    const c = this.armorCtx(), sim = this.sim, h = sim.hero;
    if (!c || !c.g.breakNova || this.breakCd > 0) return;
    this.breakCd = BREAK_NOVA_CD;
    sim.emit({ t: 'ring', x: h.x, y: h.y, r0: 0.3, r1: 3, dur: 0.5, el: 'cold', fill: true });
    for (const m of sim.monsters) if (m.hp > 0 && dist(m, h) <= 3) sim.hitMon(m, c, c.g.breakNova / 100, true);
  }

  /* ---------- hero defence ---------- */
  /** Factor on damage the hero takes (Rime Shell). */
  heroTaken() { return this.shell ? 1 - this.shell.dr : 1; }
  /** Extra barrier capacity while the shell lasts. */
  shellBarrier() { return this.shell ? this.shell.amt : 0; }

  /* ---------- priority list ---------- */
  /** "When not active" for constructs: fewer than the allowed number, or the last one is about to fade. */
  notActive(id: string): boolean | undefined {
    if (SKILLS[id]?.type !== 'construct') return undefined;
    const mine = this.constructs.filter(k => k.skill === id);
    return mine.length < Math.max(1, this.sim.ctx(id).constructs) || mine.some(k => k.life - k.t < 2);
  }
  /** Conditions of the newer skills (undefined = not one of mine). */
  cond(cond: string, alive: Monster[]): boolean | undefined {
    const sim = this.sim;
    switch (cond) {
      case 'notCursed': return alive.some(m => !m.hex);
      case 'burning': return alive.some(m => m.burn > 0);
      case 'chilled': return alive.some(m => m.chill > 0 || m.frozen > 0);
      case 'barrierLow': return sim.s.barrier < sim.maxBarrier() * 0.5;
      case 'enemies5': return alive.length >= 5;
    }
    return undefined;
  }
  pick(cond: string, alive: Monster[]): Monster | undefined {
    const f = cond === 'notCursed' ? (m: Monster) => !m.hex : cond === 'burning' ? (m: Monster) => m.burn > 0
      : cond === 'chilled' ? (m: Monster) => m.chill > 0 || m.frozen > 0 : null;
    return f ? alive.find(f) : undefined;
  }

  /* ---------- per tick ---------- */
  tick(dt: number) {
    const sim = this.sim, h = sim.hero, fight = sim.phase === 'fight';
    if (this.breakCd > 0) this.breakCd -= dt;
    if (this.shell) {
      this.shell.t -= dt; sim.buffs[this.shell.skill] = this.shell.t;
      if (this.shell.t <= 0) { this.shell = null; sim.s.barrier = Math.min(sim.s.barrier, sim.maxBarrier()); }
    }
    for (const m of sim.monsters) if (m.hex) { m.hex.t -= dt; if (m.hex.t <= 0) m.hex = undefined; }
    // Frost Aura modifier
    const fa = this.armorCtx();
    if (fa?.g.chillAura) for (const m of sim.monsters) if (m.hp > 0 && dist(m, h) <= fa.g.chillAura) { m.chill = Math.max(m.chill, 0.3); m.chillEff = Math.max(m.chillEff, fa.chillEff); }
    // delayed repeats
    for (const d of this.delayed.slice()) {
      d.t -= dt;
      if (d.t > 0) continue;
      this.delayed.splice(this.delayed.indexOf(d), 1);
      if (!fight) continue;
      const c = sim.ctx(d.skill);
      if (d.kind === 'nova') {
        sim.emit({ t: 'ring', x: h.x, y: h.y, r0: 0.4, r1: c.radius, dur: 0.35, el: c.el });
        for (const m of sim.monsters) if (m.hp > 0 && dist(m, h) <= c.radius) sim.hitMon(m, c, d.mult);
      } else if (d.kind === 'area') sim.areaHit(c, d.x, d.y, d.mult);
      else sim.strikeImpact({ id: 0, x: d.x, y: d.y, t: 0, dur: 0, skill: d.skill, kind: d.kind === 'meteor' ? 'meteor' : 'strike', echo: false, mult: d.mult, sub: true });
    }
    // beams
    for (const b of this.beams.slice()) {
      b.t += dt; b.next -= dt;
      if (b.next > 0) continue;
      b.next += b.every; b.left--;
      if (b.left <= 0) this.beams.splice(this.beams.indexOf(b), 1);
      if (fight) this.beamPulse(b);
    }
    // fields
    for (const f of this.fields.slice()) {
      f.t += dt; f.next -= dt;
      if (f.t >= f.dur) { this.fields.splice(this.fields.indexOf(f), 1); continue; }
      if (f.next > 0) continue;
      f.next += f.every;
      if (!fight) continue;
      const c = sim.ctx(f.skill);
      for (const m of sim.monsters) if (m.hp > 0 && Math.hypot(m.x - f.x, m.y - f.y) <= f.r) sim.hitMon(m, c, f.mult, true);
    }
    // orbs
    for (const o of this.orbs.slice()) {
      o.px = o.x; o.py = o.y; o.t += dt; o.x += o.dx * dt; o.y += o.dy * dt; o.next -= dt;
      const c = sim.ctx(o.skill);
      if (o.t >= o.life) {
        this.orbs.splice(this.orbs.indexOf(o), 1);
        if (fight && c.explode) this.burst(c, o.x, o.y, c.explode, c.explodeDmg);
        continue;
      }
      if (o.next > 0 || !fight) continue;
      o.next += (c.def.zapEvery || 0.4) / c.rate;
      const ts = this.nearest(o, c.def.zapRange || 2.5, 1 + c.arcs);
      for (const m of ts) {
        sim.emit({ t: 'bolt', pts: [{ x: o.x, y: o.y, z: 1.1 }, { x: m.x, y: m.y, z: 0.8 }] });
        sim.hitMon(m, c, 1, true);
      }
    }
    // constructs float beside the hero
    for (const k of this.constructs.slice()) {
      k.px = k.x; k.py = k.y; k.t += dt; k.ang += dt * 0.9;
      if (k.t >= k.life) { this.constructs.splice(this.constructs.indexOf(k), 1); continue; }
      const i = this.constructs.indexOf(k), a = k.ang + i * 2.1;
      const tx = h.x + Math.cos(a) * 1.3, ty = h.y + Math.sin(a) * 1.3;
      k.x += (tx - k.x) * Math.min(1, dt * 6); k.y += (ty - k.y) * Math.min(1, dt * 6);
      k.next -= dt;
      if (k.next > 0 || !fight) continue;
      const c = sim.ctx(k.skill), t = this.nearest(k, c.def.range || 5, 1)[0];
      if (!t) { k.next = 0.1; continue; }
      k.next = (c.def.attackEvery || 1) / c.rate;
      const chain = [t];
      let cur = t;
      for (let j = 0; j < c.arcs; j++) {
        const nx = sim.monsters.filter(m => m.hp > 0 && !chain.includes(m) && dist(m, cur) <= 3).sort((a2, b2) => dist(a2, cur) - dist(b2, cur))[0];
        if (!nx) break;
        chain.push(nx); cur = nx;
      }
      sim.emit({ t: 'bolt', pts: [{ x: k.x, y: k.y, z: 2.2 }, ...chain.map(m => ({ x: m.x, y: m.y, z: 0.8 }))] });
      let mult = 1;
      chain.forEach((m, j) => { sim.hitMon(m, c, mult); if (!j) this.onDirectHit(c, m); mult *= 0.8; });
    }
  }

  private beamPulse(b: Beam) {
    const sim = this.sim, h = sim.hero, c = sim.ctx(b.skill), range = c.def.range || 7;
    let t = sim.monsters.find(m => m.id === b.target && m.hp > 0);
    if (!t || dist(t, h) > range) { t = this.nearest(h, range, 1)[0]; if (t) b.target = t.id; }
    if (!t) return;
    const d = dist(t, h) || 1, len = Math.min(range, d + 1);
    const end = { x: h.x + (t.x - h.x) / d * len, y: h.y + (t.y - h.y) / d * len };
    b.x1 = end.x; b.y1 = end.y;
    const hit = sim.monsters.filter(m => m.hp > 0 && segDist(m, h, end) <= (c.def.width || 0.6));
    if (!hit.includes(t)) hit.push(t);
    for (const m of hit) sim.hitMon(m, c, 1, m !== t);
    for (const o of sim.monsters.filter(m => m.hp > 0 && !hit.includes(m) && dist(m, t!) <= 3).sort((a, b2) => dist(a, t!) - dist(b2, t!)).slice(0, c.arcs)) {
      sim.emit({ t: 'beam', x0: t.x, y0: t.y, x1: o.x, y1: o.y, el: c.el, dur: b.every });
      sim.hitMon(o, c, 1, true);
    }
    this.onDirectHit(c, t);
    sim.face(t);
  }

  private addField(c: SkillCtx, x: number, y: number, r: number, dur: number, every: number, mult: number, ground: boolean) {
    if (dur <= 0 || r <= 0) return;
    this.fields.push({ id: this.sim.nextUid(), skill: c.id, x, y, r, t: 0, dur, every, next: ground ? every : 0.15, mult, el: c.el, ground });
    if (this.fields.length > MAX_FIELDS) this.fields.shift();
  }
  private nearest(p: { x: number; y: number }, r: number, n: number) {
    return this.sim.monsters.filter(m => m.hp > 0 && dist(m, p) <= r).sort((a, b) => dist(a, p) - dist(b, p)).slice(0, n);
  }
  private others(t: Monster, alive: Monster[], n: number) { return n > 0 ? alive.filter(m => m !== t && m.hp > 0).slice(0, n) : []; }

  /** Is the hero channelling right now (beam)? */
  channelling() { return this.beams.length > 0; }
  /** Wave over: beams, orbs, fields and pending repeats end; constructs and the shell stay. */
  clearFight() { this.beams = []; this.orbs = []; this.fields = []; this.delayed = []; }
  /** New area or death: everything goes. */
  reset() {
    this.clearFight(); this.constructs = []; this.breakCd = 0;
    if (this.shell) { delete this.sim.buffs[this.shell.skill]; this.shell = null; }
  }
}
