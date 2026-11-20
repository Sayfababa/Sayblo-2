/**
 * The game simulation. Runs in fixed ticks without any rendering, so the same code can drive
 * the screen, offline progress and balancing scripts. The renderer only reads state and events.
 */
import {
  AREAS, AUTO_ORDER, BAG_SIZE, BURN_DURATION, ELEMENT_COLORS, ELEMENT_NAMES, ELITE_MODS, ELITE_MOD_COUNT, ELITE_NAMES,
  HERO, ITEMS, MONSTERS, MONSTER_SCALING, RANKS, RARITIES, SKILLS, SLOT_NAMES, SPARK, START_SKILL, WAVES,
  type Attr, type Element, type SkillDef, type SparkDef, type Slot,
} from '../content/index.ts';
import {
  calcStats, castTime, clamp, frostArmorBarrier, manaCost, monsterDmg, monsterHp, monsterXp, potionPrice,
  respecCost, sellValue, skillMult, sparkMult, itemScore, xpNeeded, afterMonsterRes, afterHeroRes, type Stats,
} from './formulas.ts';
import { genItem } from './items.ts';
import { Rng } from './rng.ts';
import { emptySlots, newSaveState } from './state.ts';
import type { Drop, Hero, Item, Meteor, Monster, Phase, Projectile, SaveState, SimEvent, SkillHit } from './types.ts';

/** Length of one simulation step in seconds. */
export const TICK = 1 / 30;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
type SkillLike = SkillDef | SparkDef;
const skillDef = (id: string): SkillLike => (id === 'spark' ? SPARK : SKILLS[id]);

export type DirtyKey = 'hero' | 'skills' | 'bag' | 'town' | 'slots' | 'zones';

export class Sim {
  s: SaveState;
  rng: Rng;
  st!: Stats;
  /** Set to false for headless runs (offline progress, balancing) to skip collecting visual events. */
  collectEvents = true;
  events: SimEvent[] = [];
  dirty = new Set<DirtyKey>(['hero', 'skills', 'bag', 'town', 'slots', 'zones']);

  phase: Phase = 'walk';
  time = 0;
  hero: Hero = { x: 0, y: 0, px: 0, py: 0, f: 1, walking: false };
  dir = { x: 0.33, y: -0.94 };
  wps: { x: number; y: number }[] = [];
  waitT = 0;
  wave = 0;
  bossSpawned = false;
  monsters: Monster[] = [];
  projectiles: Projectile[] = [];
  meteors: Meteor[] = [];
  drops: Drop[] = [];
  cd: Record<string, number> = {};
  buffs: Record<string, number> = {};
  faAmt = 0;
  kite = 0; kiteCd = 0; kdir = { x: 0, y: 0 };
  castT = 0;
  lastCast: string | null = null;
  lastCastT = 0;
  potH = 0; potM = 0;
  noHit = 9;
  townT = 0;
  returnZone = 0;
  targetId: number | null = null;
  private uid = 1;

  constructor(save?: SaveState, opts: { seed?: number; headless?: boolean } = {}) {
    this.s = save ?? newSaveState();
    this.rng = new Rng(opts.seed);
    this.collectEvents = !opts.headless;
    this.recalc();
    if (this.s.life == null || this.s.life <= 0) this.s.life = this.st.maxLife;
    if (this.s.mana == null) this.s.mana = this.st.maxMana;
    if (this.blockedSlots().length) this.autoOrder();
    this.enterZone(Math.min(this.s.zone, this.s.unlocked - 1));
  }

  /* ---------- helpers ---------- */
  private emit(e: SimEvent) { if (this.collectEvents) this.events.push(e); }
  log(msg: string, cls = '') { this.emit({ t: 'log', msg, cls }); }
  private float(x: number, y: number, text: string, col: string, big?: boolean) { this.emit({ t: 'float', x, y, text, col, big }); }
  private nextUid() { return this.uid++; }
  private itemId() { return this.s.nextId++; }
  get life() { return this.s.life ?? 0; }
  get mana() { return this.s.mana ?? 0; }

  recalc() {
    this.st = calcStats(this.s);
    if (this.s.life != null) this.s.life = Math.min(this.s.life, this.st.maxLife);
    if (this.s.mana != null) this.s.mana = Math.min(this.s.mana, this.st.maxMana);
    this.s.barrier = Math.min(this.s.barrier, this.maxBarrier());
  }
  maxBarrier() { return this.st.barrier + ((this.buffs.frostarmor ?? 0) > 0 ? this.faAmt : 0); }
  castTime() { return castTime(this.st); }

  /* ---------- world flow ---------- */
  private fwd(d: number) {
    const base = Math.atan2(-0.94, 0.33);
    let a = Math.atan2(this.dir.y, this.dir.x) + this.rng.range(-0.45, 0.45);
    a = clamp(a, base - 0.8, base + 0.8);
    this.dir = { x: Math.cos(a), y: Math.sin(a) };
    return { x: this.hero.x + this.dir.x * d, y: this.hero.y + this.dir.y * d };
  }

  private mkMon(def: string, L: number, rank: number, x: number, y: number): Monster {
    const d = MONSTERS[def], rng = this.rng;
    const hp = monsterHp(def, L, rank);
    const m: Monster = {
      id: this.nextUid(), def, L, rank, el: d.element, name: d.name, sub: '',
      hp, maxHp: hp, dmg: monsterDmg(def, L, rank), atkTime: d.attackTime, mv: d.moveSpeed,
      range: d.ranged || MONSTER_SCALING.meleeRange, atkT: rng.range(0.3, d.attackTime),
      chill: 0, burn: 0, burnDps: 0, mods: [], ward: 0, maxWard: 0, vamp: 0,
      res: { fire: 0, cold: 0, light: 0 }, x, y, px: x, py: y, f: -1, walking: false,
    };
    m.res[d.element] = MONSTER_SCALING.ownElementRes;
    if (rank === 2) {
      m.name = rng.pick(ELITE_NAMES.first) + ' ' + rng.pick(ELITE_NAMES.second);
      m.mods = rng.shuffle(Object.keys(ELITE_MODS)).slice(0, rng.int(ELITE_MOD_COUNT[0], ELITE_MOD_COUNT[1]));
      m.sub = d.name + ' · ' + m.mods.join(', ');
      for (const k of m.mods) {
        const e = ELITE_MODS[k];
        if (e.attackTime) m.atkTime *= e.attackTime;
        if (e.moveSpeed) m.mv *= e.moveSpeed;
        if (e.wardPct) m.ward = m.maxWard = Math.round(hp * e.wardPct);
        if (e.vampPct) m.vamp = e.vampPct;
        if (e.ownResAdd) m.res[d.element] += e.ownResAdd;
        if (e.dmg) m.dmg *= e.dmg;
      }
    }
    if (rank === 3 && d.boss) {
      m.sub = d.boss.title;
      m.res = { ...d.boss.res };
      m.boss = { phase: 0, specT: d.boss.special.first };
    }
    return m;
  }

  private spawnWave() {
    const z = AREAS[this.s.zone], h = this.hero, rng = this.rng;
    const n = 1 + rng.int(0, 2 + Math.min(2, Math.floor(this.s.zone / 2)));
    const sd = WAVES.spawnDistance;
    const cx = h.x + this.dir.x * sd, cy = h.y + this.dir.y * sd, px = -this.dir.y, py = this.dir.x;
    this.monsters = [];
    for (let i = 0; i < n; i++) {
      const r = rng.next();
      const rank = r < WAVES.eliteChance ? 2 : r < WAVES.eliteChance + WAVES.championChance ? 1 : 0;
      const o = rng.range(-2.6, 2.6), f = rng.range(-1, 1.6);
      this.monsters.push(this.mkMon(rng.pick(z.pool), z.level + (rank ? 1 : 0), rank, cx + px * o + this.dir.x * f, cy + py * o + this.dir.y * f));
    }
    for (const m of this.monsters) if (m.rank === 2) this.log(`An elite appears: **${m.name}** (${m.sub})`, 'r2');
  }

  private spawnBoss() {
    const z = AREAS[this.s.zone], h = this.hero, bd = WAVES.bossDistance;
    this.bossSpawned = true;
    const cx = h.x + this.dir.x * bd, cy = h.y + this.dir.y * bd;
    this.monsters = [
      this.mkMon(z.boss!, z.level + 2, 3, cx, cy),
      this.mkMon(this.rng.pick(z.pool), z.level, 0, cx - 1.5, cy + 1),
      this.mkMon(this.rng.pick(z.pool), z.level, 0, cx + 1.5, cy - 1),
    ];
    this.log(MONSTERS[z.boss!].boss!.intro, 'r3');
    this.phase = 'fight';
  }

  private pickup(d: Drop) {
    if (d.gold) { this.s.gold += d.gold; this.float(d.x, d.y, '+' + d.gold + ' gold', '#c9a557'); }
    else if (d.item) this.takeItem(d.item);
    this.drops.splice(this.drops.indexOf(d), 1);
  }

  enterZone(i: number) {
    this.s.zone = i; this.wave = 0; this.bossSpawned = false; this.monsters = []; this.projectiles = []; this.meteors = [];
    while (this.drops.length) this.pickup(this.drops[0]);
    if (this.s.life == null || this.s.life <= 0) { this.s.life = this.st.maxLife; this.s.mana = this.st.maxMana; }
    this.phase = 'walk'; this.wps = [this.fwd(4)];
    this.dirty.add('zones');
    this.emit({ t: 'clear' });
    this.log(`Entering **${AREAS[i].name}** (monster level ${AREAS[i].level}).`);
  }

  private startWalk() {
    this.phase = 'walk';
    const route: { x: number; y: number }[] = [];
    let cur: { x: number; y: number } = { x: this.hero.x, y: this.hero.y };
    const left = this.drops.slice();
    while (left.length) {
      let bi = 0;
      left.forEach((d, i) => { if (dist(d, cur) < dist(left[bi], cur)) bi = i; });
      cur = left.splice(bi, 1)[0];
      route.push({ x: cur.x, y: cur.y });
    }
    this.wps = route;
    const last = route.length ? route[route.length - 1] : this.hero;
    const ox = this.hero.x, oy = this.hero.y;
    this.hero.x = last.x; this.hero.y = last.y;
    const f = this.fwd(5);
    this.hero.x = ox; this.hero.y = oy;
    this.wps.push(f);
  }

  private nextWave() {
    const z = AREAS[this.s.zone];
    this.wave++;
    if (this.wave > z.waves) {
      if (z.boss && !this.bossSpawned) { this.spawnBoss(); return; }
      this.zoneCleared(); return;
    }
    this.spawnWave(); this.phase = 'fight';
  }

  private zoneCleared() {
    const z = AREAS[this.s.zone], s = this.s;
    this.log(`**${z.name}** cleared.`, 'good');
    if (s.zone + 1 >= s.unlocked && s.zone + 1 < AREAS.length) {
      s.unlocked = s.zone + 2;
      this.log(`New area unlocked: **${AREAS[s.zone + 1].name}**.`, 'lvl');
      this.dirty.add('zones');
    }
    if (z.boss) this.log('Act I is complete. This is the end of the demo. Keep farming for loot.', 'lvl');
    this.enterZone(s.autoAdvance && s.zone + 1 < s.unlocked ? s.zone + 1 : s.zone);
  }

  /* ---------- combat ---------- */
  private regen(dt: number) {
    const st = this.st, s = this.s;
    s.mana = Math.min(st.maxMana, this.mana + st.manaRegen * dt);
    s.life = Math.min(st.maxLife, this.life + st.lifeRegen * dt);
    this.noHit += dt;
    const mb = this.maxBarrier();
    if (this.noHit > HERO.barrier.regenDelay && s.barrier < mb) s.barrier = Math.min(mb, s.barrier + mb * HERO.barrier.regenPerSecond * dt);
  }

  private condOk(c: string, id: string, alive: Monster[]) {
    switch (c) {
      case 'notActive': return !((this.buffs[id] ?? 0) > 0);
      case 'enemies2': return alive.length >= 2;
      case 'enemies3': return alive.length >= 3;
      case 'elite': return alive.some(m => m.rank >= 2);
      case 'manaHigh': return this.mana / this.st.maxMana > 0.5;
      case 'notChilled': return alive.some(m => m.chill <= 0);
      default: return true;
    }
  }
  private target(c: string, alive: Monster[]) {
    if (c === 'elite') return alive.find(m => m.rank >= 2) || alive[0];
    if (c === 'notChilled') return alive.find(m => m.chill <= 0) || alive[0];
    return alive[0];
  }

  private heroAct() {
    const h = this.hero;
    const alive = this.monsters.filter(m => m.hp > 0 && dist(m, h) <= HERO.movement.aggroRange).sort((a, b) => dist(a, h) - dist(b, h));
    if (!alive.length) { this.castT = 0.1; return; }
    for (const sl of this.s.slots) {
      if (!sl.id) continue;
      const id = sl.id, sk = SKILLS[id];
      if (!(this.s.skills[id] > 0)) continue;
      if ((this.cd[id] || 0) > 0) continue;
      const cost = manaCost(this.s.skills, id);
      if (this.mana < cost) continue;
      if (sk.type === 'buff' && (this.buffs[id] ?? 0) > 3) continue;
      if (!this.condOk(sl.cond, id, alive)) continue;
      this.s.mana = this.mana - cost; this.cd[id] = sk.cooldown;
      this.cast(id, sl.cond, alive);
      this.castT = this.castTime(); this.lastCast = id; this.lastCastT = 0.35;
      return;
    }
    this.cast('spark', 'always', alive);
    this.castT = this.castTime() * SPARK.castTimeMult; this.lastCast = 'spark';
  }

  private roll(m: Monster, id: string, mult: number): SkillHit {
    const sk = skillDef(id), st = this.st;
    const sm = id === 'spark' ? sparkMult(this.s.lvl) : skillMult(this.s.skills, id);
    let d = this.rng.range(sk.min || 0, sk.max || 0) * sm * (1 + (st.spellDmg + st.el[sk.element]) / 100) * mult;
    const c = this.rng.next() * 100 < st.crit;
    if (c) d *= HERO.base.critMult;
    return { kind: 'skill', skill: id, n: afterMonsterRes(d, m.res[sk.element]), c };
  }

  private applyHit(m: Monster, r: SkillHit) {
    if (m.hp <= 0) return;
    const sk = skillDef(r.skill) as SkillDef;
    if (sk.chill) m.chill = sk.chill;
    if (sk.burn) { m.burn = BURN_DURATION; m.burnDps = (r.n * sk.burn) / BURN_DURATION; }
    this.emit({ t: 'monHit', id: m.id });
    this.emit({ t: 'burst', x: m.x, y: m.y, z: 0.9, el: sk.element, size: sk.type === 'single' ? 58 : 44 });
    this.float(m.x, m.y, r.n + (r.c ? '!' : ''), ELEMENT_COLORS[sk.element], r.c);
    this.dmgMon(m, r.n);
  }

  private face(t: { x: number; y: number }) {
    const h = this.hero, dx = (t.x - t.y) - (h.x - h.y);
    if (Math.abs(dx) > 0.05) h.f = dx > 0 ? 1 : -1;
  }

  private cast(id: string, cond: string, alive: Monster[]) {
    const sk = skillDef(id), h = this.hero;
    this.emit({ t: 'cast', el: sk.element });
    if (sk.type === 'buff') {
      const lv = this.s.skills[id];
      this.faAmt = frostArmorBarrier(lv);
      this.buffs[id] = (sk as SkillDef).duration || 0;
      this.s.barrier = Math.min(this.maxBarrier(), this.s.barrier + this.faAmt);
      this.emit({ t: 'ring', x: h.x, y: h.y, r0: 0.3, r1: 1.6, dur: 0.5, el: 'cold' });
      this.float(h.x, h.y, '+' + this.faAmt + ' barrier', '#a6dcf0');
      return;
    }
    if (sk.type === 'single') {
      const t = this.target(cond, alive);
      this.face(t); this.targetId = t.id;
      this.projectiles.push({
        id: this.nextUid(), x: h.x, y: h.y, z: 1.5, px: h.x, py: h.y, pz: 1.5, target: t.id,
        spd: sk.projectileSpeed || 10, el: sk.element, small: id === 'spark', hit: this.roll(t, id, 1),
      });
      return;
    }
    const s = sk as SkillDef;
    if (s.type === 'nova') {
      this.emit({ t: 'ring', x: h.x, y: h.y, r0: 0.4, r1: s.radius || 4, dur: 0.35, el: 'light' });
      for (const m of alive) if (dist(m, h) <= (s.radius || 0)) this.applyHit(m, this.roll(m, id, 1));
      return;
    }
    if (s.type === 'meteor') {
      const t = this.target(cond, alive);
      this.face(t); this.targetId = t.id;
      this.meteors.push({ id: this.nextUid(), x: t.x, y: t.y, t: 0, dur: s.delay || 0.7, skill: id });
      return;
    }
    if (s.type === 'chain') {
      const t = this.target(cond, alive);
      this.face(t); this.targetId = t.id;
      const ts = [t];
      let cur = t;
      for (let j = 1; j < (s.jumps || 1); j++) {
        const nx = alive.filter(m => !ts.includes(m) && dist(m, cur) <= (s.jumpRange || 4)).sort((a, b) => dist(a, cur) - dist(b, cur))[0];
        if (!nx) break;
        ts.push(nx); cur = nx;
      }
      this.emit({ t: 'bolt', pts: [{ x: h.x, y: h.y, z: 1.5 }, ...ts.map(m => ({ x: m.x, y: m.y, z: 0.8 }))] });
      let mult = 1;
      for (const m of ts) { this.applyHit(m, this.roll(m, id, mult)); mult *= s.jumpFalloff || 0.85; }
    }
  }

  private meteorImpact(mt: Meteor) {
    const s = SKILLS[mt.skill];
    this.emit({ t: 'ring', x: mt.x, y: mt.y, r0: 0.6, r1: s.radius || 2.5, dur: 0.6, el: 'fire', fill: true });
    this.emit({ t: 'burst', x: mt.x, y: mt.y, z: 0.6, el: 'fire', size: 150 });
    for (const m of this.monsters) if (m.hp > 0 && Math.hypot(m.x - mt.x, m.y - mt.y) <= (s.radius || 0)) this.applyHit(m, this.roll(m, mt.skill, 1));
  }

  private dmgMon(m: Monster, amt: number) {
    if (m.hp <= 0) return;
    if (m.ward > 0) { const a = Math.min(m.ward, amt); m.ward -= a; amt -= a; }
    m.hp -= amt;
    const bd = m.boss && MONSTERS[m.def].boss;
    if (m.boss && bd) {
      const ph = bd.phases[m.boss.phase];
      if (ph && m.hp < m.maxHp * ph.belowHp && m.hp > 0) {
        m.boss.phase++; m.el = ph.element; m.res = { ...ph.res };
        this.emit({ t: 'ring', x: m.x, y: m.y, r0: 0.3, r1: 3, dur: 0.6, el: ph.element });
        this.log(ph.message, 'r3');
      }
    }
    if (m.hp <= 0) this.kill(m);
  }

  private monHit(dmg: number, el: Element, name: string, mult = 1, label?: string, vampMon?: Monster) {
    if (this.phase !== 'fight') return;
    const st = this.st, h = this.hero, s = this.s;
    if (!label && this.rng.next() * 100 < st.dodge) { this.float(h.x, h.y, 'Dodge', '#86c46f'); return; }
    let d = afterHeroRes(dmg * this.rng.range(0.85, 1.15) * mult, st.res[el]);
    const total = d;
    this.noHit = 0;
    if (s.barrier > 0) { const a = Math.min(s.barrier, d); s.barrier -= a; d -= a; }
    s.life = this.life - d;
    this.emit({ t: 'heroHit' });
    this.float(h.x, h.y, '-' + Math.max(1, Math.round(total)), '#ff6a5e');
    if (vampMon && vampMon.vamp && vampMon.hp > 0) vampMon.hp = Math.min(vampMon.maxHp, vampMon.hp + total * vampMon.vamp);
    if (label) this.log(`**${name}** casts ${label} for ${Math.round(total)} ${ELEMENT_NAMES[el]} damage!`, 'bad');
  }

  private monAttack(m: Monster) {
    const d = MONSTERS[m.def];
    if (d.ranged) {
      this.projectiles.push({
        id: this.nextUid(), x: m.x, y: m.y, z: 1.1, px: m.x, py: m.y, pz: 1.1, target: 'hero',
        spd: MONSTER_SCALING.projectileSpeed, el: m.el, small: true,
        hit: { kind: 'mon', mon: m.id, dmg: m.dmg, el: m.el, name: m.name },
      });
    } else {
      this.emit({ t: 'monAttack', id: m.id });
      this.monHit(m.dmg, m.el, m.name, 1, undefined, m);
      if ((this.buffs.frostarmor ?? 0) > 0 && m.hp > 0) m.chill = Math.max(m.chill, SKILLS.frostarmor.meleeChill || 0);
    }
  }

  private potions() {
    const st = this.st, h = this.hero, s = this.s, P = HERO.potions;
    if (s.hpPot > 0 && this.potH <= 0 && (this.life / st.maxLife) * 100 < s.hpTh) {
      s.hpPot--;
      const v = Math.round(st.maxLife * P.life);
      s.life = Math.min(st.maxLife, this.life + v); this.potH = P.cooldown;
      this.float(h.x, h.y, '+' + v, '#86c46f');
      this.log(`Drank a health potion (+${v}). ${s.hpPot} left.`, 'good');
    }
    if (s.mpPot > 0 && this.potM <= 0 && (this.mana / st.maxMana) * 100 < s.mpTh) {
      s.mpPot--;
      const v = Math.round(st.maxMana * P.mana);
      s.mana = Math.min(st.maxMana, this.mana + v); this.potM = P.cooldown;
      this.log(`Drank a mana potion (+${v}). ${s.mpPot} left.`, 'good');
    }
  }

  private kill(m: Monster) {
    m.hp = 0;
    const s = this.s, rk = RANKS[m.rank], rng = this.rng, D = ITEMS.drops;
    s.kills++;
    this.gainXp(monsterXp(m.L, m.rank));
    if (m.rank >= 1) this.log(`${rk.name} **${m.name}** slain.`, m.rank >= 2 ? 'r2' : '');
    if (m.rank > 0 || rng.chance(D.goldChance))
      this.drops.push({ id: this.nextUid(), x: m.x + rng.range(-0.5, 0.5), y: m.y + rng.range(-0.5, 0.5), gold: Math.round(m.L * rng.range(D.goldPerLevel[0], D.goldPerLevel[1]) * rk.gold) });
    let n = 0, minR = 0;
    if (m.rank === 0) n = rng.chance(D.itemChance) ? 1 : 0;
    else {
      const rule = m.rank === 1 ? D.champion : m.rank === 2 ? D.elite : D.boss;
      n = rng.int(rule.count[0], rule.count[1]); minR = rule.minRarity;
    }
    for (let i = 0; i < n; i++) {
      const it = genItem(rng, this.itemId(), m.L, minR, m.rank === 3);
      if (it.r < s.filter) { s.gold += sellValue(it); continue; }
      this.drops.push({ id: this.nextUid(), x: m.x + rng.range(-1, 1), y: m.y + rng.range(-1, 1), item: it });
    }
  }

  private gainXp(x: number) {
    const s = this.s;
    s.xp += x;
    while (s.xp >= xpNeeded(s.lvl)) {
      s.xp -= xpNeeded(s.lvl); s.lvl++;
      s.attrPts += HERO.perLevel.attributePoints; s.skillPts += HERO.perLevel.skillPoints;
      this.recalc(); s.life = this.st.maxLife; s.mana = this.st.maxMana;
      this.emit({ t: 'ring', x: this.hero.x, y: this.hero.y, r0: 0.2, r1: 2, dur: 0.8, el: 'gold' });
      this.float(this.hero.x, this.hero.y, 'Level up!', '#e8cc5c', true);
      this.log(`Level ${s.lvl}! +${HERO.perLevel.attributePoints} attribute points, +${HERO.perLevel.skillPoints} skill point.`, 'lvl');
      this.dirty.add('hero'); this.dirty.add('skills');
    }
  }

  private die() {
    const s = this.s, D = HERO.death;
    s.deaths++;
    const xl = Math.floor(s.xp * D.xpLoss), gl = Math.floor(s.gold * D.goldLoss);
    s.xp -= xl; s.gold -= gl;
    this.log(`You died. Lost ${xl} XP and ${gl} gold.`, 'bad');
    this.phase = 'town'; this.townT = D.townTime; this.returnZone = Math.max(0, s.zone - 1);
    this.monsters = []; this.projectiles = []; this.meteors = []; this.drops = []; this.buffs = {}; this.faAmt = 0; this.cd = {};
    s.life = this.st.maxLife; s.mana = this.st.maxMana; s.barrier = 0;
    this.emit({ t: 'clear' });
  }

  private updProjectiles(dt: number) {
    for (const p of this.projectiles.slice()) {
      p.px = p.x; p.py = p.y; p.pz = p.z;
      let t: { x: number; y: number };
      if (p.target === 'hero') t = this.hero;
      else {
        const m = this.monsters.find(mm => mm.id === p.target);
        if (!m || m.hp <= 0) { this.projectiles.splice(this.projectiles.indexOf(p), 1); continue; }
        t = m;
      }
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy), s = p.spd * dt;
      if (d <= s + 0.15) {
        this.projectiles.splice(this.projectiles.indexOf(p), 1);
        if (p.hit.kind === 'skill') this.applyHit(t as Monster, p.hit);
        else {
          const src = this.monsters.find(mm => mm.id === (p.hit as { mon: number }).mon);
          this.monHit(p.hit.dmg, p.hit.el, p.hit.name, 1, undefined, src);
        }
        continue;
      }
      p.x += (dx / d) * s; p.y += (dy / d) * s;
      p.z += ((p.target === 'hero' ? 1.2 : 0.8) - p.z) * Math.min(1, dt * 4);
    }
    for (const mt of this.meteors.slice()) {
      mt.t += dt;
      if (mt.t >= mt.dur) { this.meteors.splice(this.meteors.indexOf(mt), 1); this.meteorImpact(mt); }
    }
  }

  /** Advance the simulation by one fixed step. */
  tick(dt = TICK) {
    const h = this.hero, s = this.s, M = HERO.movement;
    this.time += dt;
    h.px = h.x; h.py = h.y;
    for (const m of this.monsters) { m.px = m.x; m.py = m.y; }
    this.updProjectiles(dt);
    this.monsters = this.monsters.filter(m => m.hp > 0);
    if (this.phase === 'town') {
      h.walking = false;
      if (s.autoReturn) { this.townT -= dt; if (this.townT <= 0) this.enterZone(this.returnZone); }
      return;
    }
    this.regen(dt);
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] -= dt;
    if ((this.buffs.frostarmor ?? 0) > 0) {
      this.buffs.frostarmor -= dt;
      if (this.buffs.frostarmor <= 0) { this.faAmt = 0; s.barrier = Math.min(s.barrier, this.maxBarrier()); }
    }
    this.potH -= dt; this.potM -= dt; this.lastCastT -= dt;
    if (this.phase === 'walk') {
      if (!this.wps.length) { h.walking = false; this.waitT -= dt; if (this.waitT <= 0) this.nextWave(); return; }
      const wp = this.wps[0], dx = wp.x - h.x, dy = wp.y - h.y, d = Math.hypot(dx, dy), st = M.walkSpeed * dt;
      h.walking = true;
      if (Math.abs(dx - dy) > 0.01) h.f = dx - dy > 0 ? 1 : -1;
      if (d <= st) { h.x = wp.x; h.y = wp.y; this.wps.shift(); if (!this.wps.length) this.waitT = 0.3; }
      else { h.x += (dx / d) * st; h.y += (dy / d) * st; }
      for (const dr of this.drops.slice()) if (dist(dr, h) < M.pickupRange) this.pickup(dr);
      return;
    }
    h.walking = false;
    const alive = this.monsters.filter(m => m.hp > 0);
    this.kiteCd -= dt;
    if (this.kite > 0) {
      this.kite -= dt;
      const st = M.kiteSpeed * dt;
      h.x += this.kdir.x * st; h.y += this.kdir.y * st; h.walking = true;
      const dsx = this.kdir.x - this.kdir.y;
      if (Math.abs(dsx) > 0.05) h.f = dsx > 0 ? 1 : -1;
    } else {
      const near = alive.filter(m => !MONSTERS[m.def].ranged && dist(m, h) < M.kiteTrigger);
      if (s.kite !== false && near.length && this.kiteCd <= 0 && this.castT <= 0.2) {
        let ax = 0, ay = 0;
        for (const m of near) { const d = Math.max(0.3, dist(m, h)); ax += (h.x - m.x) / (d * d); ay += (h.y - m.y) / (d * d); }
        const l = Math.hypot(ax, ay) || 1;
        ax /= l; ay /= l;
        const side = (this.rng.chance(0.5) ? -1 : 1) * 0.45;
        const kx = ax - ay * side, ky = ay + ax * side, kl = Math.hypot(kx, ky);
        this.kdir = { x: kx / kl, y: ky / kl }; this.kite = M.kiteTime; this.kiteCd = M.kiteCooldown;
      } else {
        this.castT -= dt;
        if (this.castT <= 0) this.heroAct();
      }
    }
    for (const m of alive) {
      if (m.hp <= 0) continue;
      if (m.chill > 0) m.chill -= dt;
      if (m.burn > 0) { m.burn -= dt; this.dmgMon(m, m.burnDps * dt); if (m.hp <= 0) continue; }
      const d = dist(m, h), slow = m.chill > 0 ? 0.5 : 1;
      const dsx = (h.x - h.y) - (m.x - m.y);
      if (Math.abs(dsx) > 0.05) m.f = dsx > 0 ? 1 : -1;
      if (d > m.range) { m.walking = true; const st = m.mv * slow * dt; m.x += ((h.x - m.x) / d) * st; m.y += ((h.y - m.y) / d) * st; }
      else { m.walking = false; m.atkT -= dt * slow; if (m.atkT <= 0) { m.atkT = m.atkTime; this.monAttack(m); } }
      const bd = MONSTERS[m.def].boss;
      if (m.boss && bd) {
        m.boss.specT -= dt;
        if (m.boss.specT <= 0) {
          m.boss.specT = bd.special.every;
          this.emit({ t: 'ring', x: m.x, y: m.y, r0: 0.5, r1: bd.special.radius, dur: 0.6, el: m.el });
          this.monHit(m.dmg, m.el, m.name, bd.special.mult, bd.special.name);
        }
      }
      if (this.life <= 0) break;
    }
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      if (d < 0.8) { const p = (0.8 - d) / 2; a.x -= (dx / d) * p; a.y -= (dy / d) * p; b.x += (dx / d) * p; b.y += (dy / d) * p; }
    }
    this.potions();
    if (this.life <= 0) { this.die(); return; }
    this.monsters = this.monsters.filter(m => m.hp > 0);
    if (!this.monsters.length) this.startWalk();
  }

  /** Run many ticks at once (headless). */
  advance(seconds: number) {
    const n = Math.round(seconds / TICK);
    for (let i = 0; i < n; i++) this.tick(TICK);
  }

  /* ---------- items ---------- */
  takeItem(it: Item) {
    const s = this.s;
    if (s.bag.length >= BAG_SIZE) {
      let lo = 0;
      s.bag.forEach((b, i) => { if (itemScore(b) < itemScore(s.bag[lo])) lo = i; });
      const x = s.bag.splice(lo, 1)[0];
      s.gold += sellValue(x);
    }
    s.bag.unshift(it);
    this.dirty.add('bag');
    this.log(`Picked up **${it.name}** (${RARITIES[it.r].name} ${SLOT_NAMES[it.slot]}).`, 'r' + it.r);
  }

  /* ---------- player actions (called by the UI) ---------- */
  blockedSlots(): [number, number][] {
    const out: [number, number][] = [];
    let blocker: number | null = null;
    this.s.slots.forEach((sl, i) => {
      if (!sl.id) return;
      if (blocker != null) out.push([i, blocker]);
      const sk = SKILLS[sl.id];
      if (blocker == null && sl.cond === 'always' && !sk.cooldown && sk.type !== 'buff') blocker = i;
    });
    return out;
  }

  autoOrder() {
    const have = this.s.slots.filter(x => x.id).map(x => x.id as string);
    const order = AUTO_ORDER.filter(([id]) => have.includes(id)).map(([id, cond]) => ({ id: id as string | null, cond }));
    for (const id of have) if (!order.some(o => o.id === id)) order.push({ id, cond: 'always' });
    while (order.length < 4) order.push({ id: null, cond: 'always' });
    this.s.slots = order.slice(0, 4);
    this.dirty.add('skills'); this.dirty.add('slots');
  }

  addAttr(k: Attr) {
    if (this.s.attrPts <= 0) return;
    this.s.attrs[k]++; this.s.attrPts--;
    this.recalc(); this.dirty.add('hero');
  }

  learnSkill(id: string) {
    const s = this.s, sk = SKILLS[id];
    if (!sk || s.skillPts <= 0 || s.lvl < sk.reqLevel) return;
    const first = !s.skills[id];
    s.skills[id] = (s.skills[id] || 0) + 1; s.skillPts--;
    if (first) { const e = s.slots.find(sl => !sl.id); if (e) { e.id = id; this.autoOrder(); } }
    this.dirty.add('skills'); this.dirty.add('slots');
  }

  setSlotSkill(i: number, id: string | null) {
    const sl = this.s.slots[i];
    sl.id = id;
    if (id && SKILLS[id].type === 'buff') sl.cond = 'notActive';
    this.dirty.add('skills'); this.dirty.add('slots');
  }
  setSlotCond(i: number, cond: string) { this.s.slots[i].cond = cond; this.dirty.add('skills'); }
  moveSlot(i: number, dir: -1 | 1) {
    const j = i + dir, sl = this.s.slots;
    if (j < 0 || j >= sl.length) return;
    [sl[i], sl[j]] = [sl[j], sl[i]];
    this.dirty.add('skills'); this.dirty.add('slots');
  }

  equip(itemId: number) {
    const s = this.s, i = s.bag.findIndex(it => it.id === itemId);
    if (i < 0) return;
    const it = s.bag.splice(i, 1)[0], old = s.equip[it.slot];
    s.equip[it.slot] = it;
    if (old) s.bag.unshift(old);
    this.recalc(); this.dirty.add('bag'); this.dirty.add('hero');
  }
  unequip(slot: Slot) {
    const s = this.s, it = s.equip[slot];
    if (!it || s.bag.length >= BAG_SIZE) return;
    s.equip[slot] = null; s.bag.unshift(it);
    this.recalc(); this.dirty.add('bag'); this.dirty.add('hero');
  }
  sell(itemId: number) {
    const s = this.s, i = s.bag.findIndex(it => it.id === itemId);
    if (i < 0) return;
    s.gold += sellValue(s.bag[i]); s.bag.splice(i, 1); this.dirty.add('bag');
  }
  sellLow() {
    const s = this.s;
    let g = 0;
    s.bag = s.bag.filter(it => { if (it.r < 2) { g += sellValue(it); return false; } return true; });
    s.gold += g; this.dirty.add('bag');
    this.log(`Sold items for ${g} gold.`);
  }
  /** Returns an error message, or null on success. */
  buyPotions(kind: 'hp' | 'mp', n: number): string | null {
    const s = this.s, price = potionPrice(s.lvl) * n;
    if (s.gold < price) return `Not enough gold. You need ${price}.`;
    s.gold -= price;
    if (kind === 'hp') s.hpPot += n; else s.mpPot += n;
    this.dirty.add('town');
    return null;
  }
  respec(): string | null {
    const s = this.s, c = respecCost(s.lvl);
    if (s.gold < c) return `Respec costs ${c} gold.`;
    s.gold -= c;
    const startSum = Object.values(HERO.startAttributes).reduce((a, b) => a + b, 0);
    s.attrPts += Object.values(s.attrs).reduce((a, b) => a + b, 0) - startSum;
    s.attrs = { ...HERO.startAttributes };
    s.skillPts += Object.values(s.skills).reduce((a, b) => a + b, 0) - 1;
    s.skills = { [START_SKILL]: 1 };
    s.slots = emptySlots();
    this.recalc();
    for (const k of ['town', 'hero', 'skills', 'slots'] as DirtyKey[]) this.dirty.add(k);
    this.log('Points reset. Spend them in Hero and Skills.', 'lvl');
    return null;
  }
  returnFromTown() { this.enterZone(this.returnZone); }
  selectZone(i: number) { if (i >= 0 && i < this.s.unlocked) this.enterZone(i); }
}
