/**
 * The game simulation. Runs in fixed ticks without any rendering, so the same code can drive
 * the screen, offline progress and balancing scripts. The renderer only reads state and events.
 */
import {
  AREAS, AUTO_ORDER, DIFFICULTIES, ELEMENT_COLORS, ELEMENT_NAMES, ELITE_MODS, ELITE_MOD_COUNT, ELITE_NAMES,
  GEM_MAX_LEVEL, HERO, ITEMS, MONSTERS, MONSTER_SCALING, RANKS, RARITIES, SKILLS, SLOT_NAMES, SOCKET_LEVELS, START_SKILL, STATES, WAVES,
  GEMS, isPassive, skillMaxLevel, type Attr, type Element, type Slot,
} from '../content/index.ts';
import { autoSort, canPlace, findSpot } from './bag.ts';
import {
  afterHeroRes, afterRes, calcStats, clamp, frostArmorBarrier, gemFits, hitDamage, keepValue, mainElement, monsterDmg, monsterHp,
  monsterXp, potionPrice, xpFactor, respecCost, sellValue, skillCtx, total, xpNeeded, type Dmg, type SkillCtx, type Stats,
} from './formulas.ts';
import { Feel } from './feel.ts';
import { LEVEL_CAP, Meta } from './meta.ts';
import { Rift, keyName } from './rift.ts';
import { Mythic } from './mythic.ts';
import { genGem, genItem } from './items.ts';
import { disposeItem } from './economy.ts';
import { lootFate } from './loot.ts';
import { isUpgrade } from './upgrade.ts';
import { Rng } from './rng.ts';
import { emptySlots, newSaveState } from './state.ts';
import {
  isEquip, isGem, isKey, type BagItem, type Drop, type Echo, type GemItem, type Hero, type Monster, type Phase, type Projectile,
  type SaveState, type SimEvent, type SkillShot, type Strike,
} from './types.ts';

/** Length of one simulation step in seconds. */
export const TICK = 1 / 30;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export type DirtyKey = 'hero' | 'skills' | 'bag' | 'town' | 'slots' | 'zones';

/** Summary of what happened, e.g. while the player was away. */
export interface RunStats { kills: number; xp: number; gold: number; items: number; gems: number; levels: number; deaths: number }
const emptyRun = (): RunStats => ({ kills: 0, xp: 0, gold: 0, items: 0, gems: 0, levels: 0, deaths: 0 });

export class Sim {
  s: SaveState;
  rng: Rng;
  st!: Stats;
  /** Set to false for headless runs (offline progress, balancing) to skip collecting visual events. */
  collectEvents = true;
  events: SimEvent[] = [];
  dirty = new Set<DirtyKey>(['hero', 'skills', 'bag', 'town', 'slots', 'zones']);
  /** Counters since the last reset (used for the offline summary). */
  run: RunStats = emptyRun();

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
  strikes: Strike[] = [];
  echoes: Echo[] = [];
  drops: Drop[] = [];
  cd: Record<string, number> = {};
  buffs: Record<string, number> = {};
  buffMax: Record<string, number> = {};
  faAmt = 0;
  kite = 0; kiteCd = 0; kdir = { x: 0, y: 0 };
  castT = 0;
  lastCast: string | null = null;
  lastCastT = 0;
  potH = 0; potM = 0;
  noHit = 9;
  saintCd = 0;
  townT = 0;
  returnZone = 0;
  targetId: number | null = null;
  /** work package A: shrines, treasure creature, vault, monster affixes (see feel.ts) */
  feel = new Feel(this);
  /** work package D: bounties, tyrants, area events, codex, ember points, feats (see meta.ts) */
  meta = new Meta(this);
  /** work package C: rifts, keys, atlas, pinnacle (see rift.ts) and the mythic uniques (mythic.ts) */
  rift = new Rift(this);
  mythic = new Mythic(this);
  private uid = 1;
  private ctxCache = new Map<string, SkillCtx>();

  constructor(save?: SaveState, opts: { seed?: number; headless?: boolean } = {}) {
    this.s = save ?? newSaveState();
    this.rng = new Rng(opts.seed);
    this.collectEvents = !opts.headless;
    this.recalc();
    if (this.s.life == null || this.s.life <= 0) this.s.life = this.st.maxLife;
    if (this.s.mana == null) this.s.mana = this.st.maxMana;
    if (this.blockedSlots().length) this.autoOrder();
    this.meta.init(); // meta: fill the bounty board, first event timer
    this.enterZone(Math.min(this.s.zone, this.unlocked - 1));
    this.rift.resume(); // rift: a run in progress starts again
  }

  /* ---------- helpers ---------- */
  emit(e: SimEvent) { if (this.collectEvents) this.events.push(e); }
  log(msg: string, cls = '') { this.emit({ t: 'log', msg, cls }); }
  float(x: number, y: number, text: string, col: string, big?: boolean, dmg?: boolean) { this.emit({ t: 'float', x, y, text, col, big, dmg }); }
  nextUid() { return this.uid++; }
  itemId() { return this.s.nextId++; }
  get life() { return this.s.life ?? 0; }
  get mana() { return this.s.mana ?? 0; }
  get diff() { return DIFFICULTIES[this.s.difficulty]; }
  get unlocked() { return Math.max(1, this.s.progress[this.s.difficulty] || 1); }
  /** Monster level of an area (no index: where the hero is, a rift tier included). */
  areaLevel(i?: number) { return (i == null ? this.rift.level() : null) ?? AREAS[i ?? this.s.zone].level + this.diff.levelAdd; }
  /** Area whose look the renderer uses (a rift borrows one). */
  get lookZone() { return this.rift.look(); }

  recalc() {
    this.st = calcStats(this.s);
    this.feel.applyStats(this.st); // feel: shrine buffs
    this.rift.applyStats(this.st); this.mythic.applyStats(this.st); // rift: resistance penalty, key mods; mythic uniques
    this.ctxCache.clear();
    if (this.s.life != null) this.s.life = Math.min(this.s.life, this.st.maxLife);
    if (this.s.mana != null) this.s.mana = Math.min(this.s.mana, this.st.maxMana);
    this.s.barrier = Math.min(this.s.barrier, this.maxBarrier());
  }
  /** Cast data for a skill (cached until stats, skills or gems change). */
  ctx(id: string): SkillCtx {
    let c = this.ctxCache.get(id);
    if (!c) { c = skillCtx(this.s, this.st, id); this.ctxCache.set(id, c); }
    return c;
  }
  maxBarrier() { return this.st.barrier + ((this.buffs.frostarmor ?? 0) > 0 ? this.faAmt : 0); }

  /* ---------- world flow ---------- */
  private fwd(d: number) {
    const base = Math.atan2(-0.94, 0.33);
    let a = Math.atan2(this.dir.y, this.dir.x) + this.rng.range(-0.45, 0.45);
    a = clamp(a, base - 0.8, base + 0.8);
    this.dir = { x: Math.cos(a), y: Math.sin(a) };
    return { x: this.hero.x + this.dir.x * d, y: this.hero.y + this.dir.y * d };
  }

  mkMon(def: string, L: number, rank: number, x: number, y: number): Monster {
    const d = MONSTERS[def], rng = this.rng, diff = this.s.difficulty;
    const hp = this.rift.monHp(def, rank) ?? monsterHp(def, L, rank, diff); // rift: tier scaling
    const m: Monster = {
      id: this.nextUid(), def, L, rank, el: d.element, name: d.name, sub: '',
      hp, maxHp: hp, dmg: this.rift.monDmg(def, rank) ?? monsterDmg(def, L, rank, diff), atkTime: d.attackTime, mv: d.moveSpeed,
      range: d.ranged || MONSTER_SCALING.meleeRange, atkT: rng.range(0.3, d.attackTime),
      chill: 0, chillEff: 0, burn: 0, burnDps: 0, frozen: 0, freezeCd: 0, shock: 0, shockEff: 0,
      mods: [], ward: 0, maxWard: 0, vamp: 0,
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
    this.feel.initMon(m); // feel: champion affixes
    this.rift.initMon(m); // rift: key modifiers
    return m;
  }

  /** Spawn a wave ahead of the hero (`extra` more monsters in a vault). Returns its centre. */
  spawnWave(extra = 0) {
    const z = AREAS[this.s.zone], h = this.hero, rng = this.rng, L = this.areaLevel();
    const rw = this.rift.wave(extra); // rift: mixed monsters, bigger packs
    const n = rw ? rw.n : 1 + rng.int(0, 2 + Math.min(2, Math.floor(this.s.zone / 2))) + extra;
    const eliteC = rw ? rw.elite : WAVES.eliteChance, champC = rw ? rw.champ : WAVES.championChance;
    const sd = WAVES.spawnDistance;
    const cx = h.x + this.dir.x * sd, cy = h.y + this.dir.y * sd, px = -this.dir.y, py = this.dir.x;
    this.monsters = [];
    for (let i = 0; i < n; i++) {
      const r = rng.next();
      const rank = r < eliteC ? 2 : r < eliteC + champC ? 1 : 0;
      const o = rng.range(-2.6, 2.6), f = rng.range(-1, 1.6);
      this.monsters.push(this.mkMon(rng.pick(rw ? rw.pool : z.pool), L + (rank ? 1 : 0), rank, cx + px * o + this.dir.x * f, cy + py * o + this.dir.y * f));
    }
    for (const m of this.monsters) if (m.rank === 2) this.log(`An elite appears: **${m.name}** (${m.sub})`, 'r2');
    if (!extra) this.feel.onWave(cx, cy); // feel: shrines and treasure creature
    this.meta.onWave(cx, cy); // meta: Blood Moon, Rift Tear, Trapped Champion
    return { x: cx, y: cy };
  }

  private spawnBoss() {
    const z = AREAS[this.s.zone], h = this.hero, bd = WAVES.bossDistance, L = this.areaLevel();
    this.bossSpawned = true;
    const cx = h.x + this.dir.x * bd, cy = h.y + this.dir.y * bd;
    this.monsters = [
      this.mkMon(z.boss!, L + 2, 3, cx, cy),
      this.mkMon(this.rng.pick(z.pool), L, 0, cx - 1.5, cy + 1),
      this.mkMon(this.rng.pick(z.pool), L, 0, cx + 1.5, cy - 1),
    ];
    this.log(MONSTERS[z.boss!].boss!.intro, 'r3');
    this.phase = 'fight';
  }

  private pickup(d: Drop) {
    if (d.gold) { this.s.gold += d.gold; this.run.gold += d.gold; this.float(d.x, d.y, '+' + d.gold + ' gold', '#c9a557'); }
    else if (d.item) this.takeItem(d.item);
    this.drops.splice(this.drops.indexOf(d), 1);
  }

  enterZone(i: number) {
    this.rift.leave(); // rift: leaving an unfinished rift spends the key
    this.s.zone = i;
    this.clearArea();
    const dn = this.s.difficulty ? ` · ${this.diff.name}` : '';
    this.log(`Entering **${AREAS[i].name}**${dn} (monster level ${this.areaLevel(i)}).`);
  }
  /** Empty the current map (also used when a rift starts). */
  clearArea() {
    this.wave = 0; this.bossSpawned = false; this.monsters = []; this.projectiles = []; this.strikes = []; this.echoes = [];
    this.feel.reset(); // feel
    this.meta.reset(); // meta: tyrant and trapped champion leave
    while (this.drops.length) this.pickup(this.drops[0]);
    if (this.s.life == null || this.s.life <= 0) { this.s.life = this.st.maxLife; this.s.mana = this.st.maxMana; }
    this.phase = 'walk'; this.wps = [this.fwd(4)];
    this.dirty.add('zones');
    this.emit({ t: 'clear' });
  }

  private startWalk() {
    this.phase = 'walk';
    const route: { x: number; y: number }[] = [];
    let cur: { x: number; y: number } = { x: this.hero.x, y: this.hero.y };
    const left: { x: number; y: number }[] = [...this.drops, ...this.feel.routePoints()]; // feel: walk past shrines and chests
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
    if (this.feel.onNextWave()) return; // feel: vault waves
    if (this.rift.nextWave()) return; // rift: progress bar and guardian instead of area waves
    if (this.meta.onNextWave()) return; // meta: the area tyrant
    this.wave++;
    if (this.wave > z.waves) {
      if (z.boss && !this.bossSpawned) { this.spawnBoss(); return; }
      this.zoneCleared(); return;
    }
    this.spawnWave(); this.phase = 'fight';
  }

  private zoneCleared() {
    const z = AREAS[this.s.zone], s = this.s, d = s.difficulty;
    this.log(`**${z.name}** cleared.`, 'good');
    if (s.zone + 1 >= this.unlocked && s.zone + 1 < AREAS.length) {
      s.progress[d] = s.zone + 2;
      this.log(`New area unlocked: **${AREAS[s.zone + 1].name}**.`, 'lvl');
      this.dirty.add('zones');
    }
    if (z.boss) {
      this.rift.onActBoss(d); // rift: Mother Vesper on Hell opens the rifts
      const next = DIFFICULTIES[d + 1];
      if (next && !s.progress[d + 1]) {
        s.progress[d + 1] = 1;
        this.log(`Act I is complete on ${this.diff.name}. **${next.name}** is now open: pick it in Town. Monsters are much stronger there and your resistances drop by ${-next.resPenalty}%.`, 'lvl');
        this.dirty.add('town'); this.dirty.add('zones');
      } else this.log(`Act I is complete on ${this.diff.name}. Keep farming for loot.`, 'lvl');
    }
    this.enterZone(s.autoAdvance && s.zone + 1 < this.unlocked ? s.zone + 1 : s.zone);
  }

  /* ---------- combat ---------- */
  private regen(dt: number) {
    const st = this.st, s = this.s;
    s.mana = Math.min(st.maxMana, this.mana + st.manaRegen * dt);
    s.life = Math.min(st.maxLife, this.life + st.lifeRegen * dt);
    this.noHit += dt;
    const mb = this.maxBarrier();
    if (this.noHit > HERO.barrier.regenDelay && s.barrier < mb) s.barrier = Math.min(mb, s.barrier + mb * HERO.barrier.regenPerSecond * (1 + this.st.barrierRegen / 100) * dt);
  }

  private condOk(c: string, id: string, alive: Monster[]) {
    const h = this.hero;
    switch (c) {
      case 'notActive': return !((this.buffs[id] ?? 0) > 3);
      case 'enemies2': return alive.length >= 2;
      case 'enemies3': return alive.length >= 3;
      case 'enemyClose': return alive.some(m => dist(m, h) <= 3);
      case 'elite': return alive.some(m => m.rank >= 2);
      case 'manaHigh': return this.mana / this.st.maxMana > 0.5;
      case 'lifeLow': return this.life / this.st.maxLife < 0.5;
      case 'notChilled': return alive.some(m => m.chill <= 0);
      case 'notBurning': return alive.some(m => m.burn <= 0);
      case 'notShocked': return alive.some(m => m.shock <= 0);
      case 'shocked': return alive.some(m => m.shock > 0);
      default: return true;
    }
  }
  private target(c: string, alive: Monster[]) {
    const pick = (f: (m: Monster) => boolean) => alive.find(f) || alive[0];
    switch (c) {
      case 'elite': return pick(m => m.rank >= 2);
      case 'notChilled': return pick(m => m.chill <= 0);
      case 'notBurning': return pick(m => m.burn <= 0);
      case 'notShocked': return pick(m => m.shock <= 0);
      case 'shocked': return pick(m => m.shock > 0);
      default: return alive[0];
    }
  }
  private aliveNear() {
    const h = this.hero;
    return this.monsters.filter(m => m.hp > 0 && dist(m, h) <= HERO.movement.aggroRange).sort((a, b) => this.feel.prio(b) - this.feel.prio(a) || dist(a, h) - dist(b, h));
  }

  private heroAct() {
    const alive = this.aliveNear();
    if (!alive.length) { this.castT = 0.1; return; }
    for (const sl of this.s.slots) {
      if (!sl.id || isPassive(sl.id) || !(this.s.skills[sl.id] > 0)) continue;
      const id = sl.id, c = this.ctx(id);
      if ((this.cd[id] || 0) > 0) continue;
      if (this.mana < c.mana) continue;
      if (c.def.type === 'buff' && (this.buffs[id] ?? 0) > 3) continue;
      if (!this.condOk(sl.cond, id, alive)) continue;
      this.s.mana = this.mana - c.mana; this.cd[id] = c.cooldown;
      this.cast(id, sl.cond, alive, false);
      if (c.echo) this.echoes.push({ t: 0.25, skill: id, cond: sl.cond });
      this.castT = c.castTime; this.lastCast = id; this.lastCastT = 0.35;
      return;
    }
    this.cast('spark', 'always', alive, false);
    this.castT = this.ctx('spark').castTime; this.lastCast = 'spark';
  }

  private face(t: { x: number; y: number }) {
    const h = this.hero, dx = (t.x - t.y) - (h.x - h.y);
    if (Math.abs(dx) > 0.05) h.f = dx > 0 ? 1 : -1;
  }

  private shoot(c: SkillCtx, from: { x: number; y: number; z: number }, t: Monster, hit: number[], pierce: number, fork: number, echo: boolean) {
    this.projectiles.push({
      id: this.nextUid(), x: from.x, y: from.y, z: from.z, px: from.x, py: from.y, pz: from.z, target: t.id,
      spd: c.def.projectileSpeed || 10, el: c.el, small: c.id === 'spark',
      shot: { kind: 'skill', skill: c.id, hit, pierce, fork, echo },
    });
  }

  private cast(id: string, cond: string, alive: Monster[], echo: boolean) {
    const c = this.ctx(id), h = this.hero, type = c.def.type;
    this.emit({ t: 'cast', el: c.el });
    if (type === 'buff') {
      const lv = c.lvl;
      this.faAmt = frostArmorBarrier(lv);
      const dur = (c.def.duration || 0) * c.durMult;
      this.buffs[id] = dur; this.buffMax[id] = dur;
      this.s.barrier = Math.min(this.maxBarrier(), this.s.barrier + this.faAmt);
      this.emit({ t: 'ring', x: h.x, y: h.y, r0: 0.3, r1: 1.6, dur: 0.5, el: 'cold' });
      this.float(h.x, h.y, '+' + this.faAmt + ' barrier', '#a6dcf0');
      return;
    }
    if (type === 'nova') {
      this.emit({ t: 'ring', x: h.x, y: h.y, r0: 0.4, r1: c.radius, dur: 0.35, el: c.el });
      for (const m of alive) if (dist(m, h) <= c.radius) this.hitMon(m, c, 1);
      return;
    }
    const t = this.target(cond, alive);
    this.face(t); this.targetId = t.id;
    if (type === 'projectile') {
      const from = { x: h.x, y: h.y, z: 1.5 };
      const others = alive.filter(m => m !== t);
      this.shoot(c, from, t, [], c.pierce, c.fork, echo);
      for (let i = 1; i < c.projectiles && others.length; i++) this.shoot(c, from, others.shift()!, [], c.pierce, c.fork, echo);
      return;
    }
    if (type === 'area') {
      this.areaHit(c, t.x, t.y);
      return;
    }
    if (type === 'meteor' || type === 'strike') {
      this.strikes.push({ id: this.nextUid(), x: t.x, y: t.y, t: 0, dur: c.def.delay || 0.5, skill: id, kind: type, echo });
      if (type === 'strike') this.emit({ t: 'bolt', pts: [{ x: t.x + 0.4, y: t.y - 0.4, z: 14 }, { x: t.x, y: t.y, z: 0.2 }] });
      return;
    }
    if (type === 'chain') {
      const ts = [t];
      let cur = t;
      for (let j = 1; j < c.chains; j++) {
        const nx = this.monsters.filter(m => m.hp > 0 && !ts.includes(m) && dist(m, cur) <= (c.def.jumpRange || 4)).sort((a, b) => dist(a, cur) - dist(b, cur))[0];
        if (!nx) break;
        ts.push(nx); cur = nx;
      }
      this.emit({ t: 'bolt', pts: [{ x: h.x, y: h.y, z: 1.5 }, ...ts.map(m => ({ x: m.x, y: m.y, z: 0.8 }))] });
      let mult = 1;
      for (const m of ts) { this.hitMon(m, c, mult); mult *= c.jumpFalloff; }
    }
  }

  private areaHit(c: SkillCtx, x: number, y: number) {
    this.emit({ t: 'ring', x, y, r0: 0.3, r1: c.radius, dur: 0.45, el: c.el, fill: true });
    this.emit({ t: 'burst', x, y, z: 0.5, el: c.el, size: 70 + c.radius * 30 });
    for (const m of this.monsters) if (m.hp > 0 && Math.hypot(m.x - x, m.y - y) <= c.radius) this.hitMon(m, c, 1, true);
  }

  private strikeImpact(st: Strike) {
    const c = this.ctx(st.skill);
    if (st.kind === 'meteor') {
      this.emit({ t: 'ring', x: st.x, y: st.y, r0: 0.6, r1: c.radius, dur: 0.6, el: 'fire', fill: true });
      this.emit({ t: 'burst', x: st.x, y: st.y, z: 0.6, el: 'fire', size: 150 });
    } else {
      this.emit({ t: 'ring', x: st.x, y: st.y, r0: 0.3, r1: c.radius * 1.4, dur: 0.4, el: c.el });
      this.emit({ t: 'burst', x: st.x, y: st.y, z: 0.4, el: c.el, size: 110 });
    }
    for (const m of this.monsters) if (m.hp > 0 && Math.hypot(m.x - st.x, m.y - st.y) <= c.radius) this.hitMon(m, c, 1, true);
    if (c.meteorNova) {
      const n = this.ctx('nova');
      this.emit({ t: 'ring', x: st.x, y: st.y, r0: 0.4, r1: n.radius, dur: 0.35, el: 'light' });
      for (const m of this.monsters) if (m.hp > 0 && Math.hypot(m.x - st.x, m.y - st.y) <= n.radius) this.hitMon(m, n, 1, true);
    }
  }

  /** Roll a hit of a skill and apply it to a monster, including burn, chill, freeze and shock. */
  private hitMon(m: Monster, c: SkillCtx, mult: number, small = false) {
    if (m.hp <= 0) return;
    const r = () => this.rng.next();
    const { dmg, crit } = hitDamage(c, r, mult * this.mythic.hitMult(m)); // mythic: Pyrewright's Rod
    if (m.shock > 0 && c.shockedCold) dmg.cold += total(dmg) * c.shockedCold;
    const fin = afterRes(dmg, m.res, c.pen, m.shock > 0 ? 1 + m.shockEff : 1);
    const n = Math.max(1, Math.round(total(fin)));
    this.emit({ t: 'monHit', id: m.id });
    const el = mainElement(fin);
    this.emit({ t: 'burst', x: m.x, y: m.y, z: 0.9, el, size: small ? 44 : 58 });
    this.float(m.x, m.y, n + (crit ? '!' : ''), ELEMENT_COLORS[el], crit, true);
    this.applyStates(m, fin, c, true);
    this.dmgMon(m, n);
  }

  private applyStates(m: Monster, fin: Dmg, c: SkillCtx, spread: boolean) {
    if (m.hp <= 0) return;
    const S = STATES, rng = this.rng;
    let any = false;
    if (fin.fire > 0 && rng.next() * 100 < c.burnChance) {
      const dps = (fin.fire * c.burnMult) / S.burnDuration;
      if (m.burn <= 0 || dps >= m.burnDps) { m.burnDps = dps; m.burn = c.burnDur; }
      else m.burn = Math.max(m.burn, c.burnDur);
      any = true;
    }
    if (fin.cold > 0) {
      m.chill = Math.max(m.chill, c.chillDur); m.chillEff = Math.max(m.chill > 0 ? m.chillEff : 0, c.chillEff);
      const heavy = (fin.cold / m.maxHp) * 100 * S.heavyHitFreeze;
      if (m.freezeCd <= 0 && rng.next() * 100 < c.freezeChance + heavy) this.freeze(m, S.freezeDuration * c.durMult);
      any = true;
    }
    if (fin.light > 0 && rng.next() * 100 < c.shockChance) {
      m.shock = S.shockDuration * c.durMult; m.shockEff = Math.max(m.shockEff, c.shockEff);
      any = true;
    }
    if (spread && any && c.spread) {
      for (const o of this.monsters) if (o !== m && o.hp > 0 && dist(o, m) <= S.spreadRadius) {
        if (m.burn > 0 && o.burnDps < m.burnDps) { o.burn = m.burn; o.burnDps = m.burnDps; }
        if (m.chill > 0) { o.chill = Math.max(o.chill, m.chill); o.chillEff = Math.max(o.chillEff, m.chillEff); }
        if (m.frozen > 0 && o.freezeCd <= 0) this.freeze(o, m.frozen);
        if (m.shock > 0) { o.shock = Math.max(o.shock, m.shock); o.shockEff = Math.max(o.shockEff, m.shockEff); }
      }
    }
  }

  private freeze(m: Monster, dur: number) {
    m.frozen = m.boss ? dur * 0.5 : dur;
    m.freezeCd = STATES.freezeCooldown + m.frozen;
  }

  dmgMon(m: Monster, amt: number) {
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
    this.feel.onDamaged(m); // feel: Mirrored
    if (m.hp <= 0) this.kill(m);
  }

  monHit(dmg: number, el: Element, name: string, mult = 1, label?: string, vampMon?: Monster) {
    if (this.phase !== 'fight' || this.mythic.untouchable > 0) return; // mythic: Mantle of the Unburied
    const st = this.st, h = this.hero, s = this.s;
    if (!label && this.rng.next() * 100 < st.dodge) { this.float(h.x, h.y, 'Dodge', '#86c46f'); return; }
    let d = afterHeroRes(dmg * this.rng.range(0.85, 1.15) * mult, st.res[el]) * (1 - st.elemDR / 100);
    const tot = d;
    this.noHit = 0;
    const hadBarrier = s.barrier > 0;
    if (s.barrier > 0) { const a = Math.min(s.barrier, d); s.barrier -= a; d -= a; }
    if (hadBarrier && s.barrier <= 0 && st.uniques.has('saint') && this.saintCd <= 0) {
      this.saintCd = 5;
      this.emit({ t: 'ring', x: h.x, y: h.y, r0: 0.3, r1: 3, dur: 0.6, el: 'cold', fill: true });
      for (const m of this.monsters) if (m.hp > 0 && dist(m, h) <= 3) this.freeze(m, 1.2);
    }
    s.life = this.life - d;
    this.emit({ t: 'heroHit' });
    this.float(h.x, h.y, '-' + Math.max(1, Math.round(tot)), '#ff6a5e');
    if (vampMon && vampMon.vamp && vampMon.hp > 0) vampMon.hp = Math.min(vampMon.maxHp, vampMon.hp + tot * vampMon.vamp);
    if (label) this.log(`**${name}** casts ${label} for ${Math.round(tot)} ${ELEMENT_NAMES[el]} damage!`, 'bad');
  }

  private monAttack(m: Monster) {
    const d = MONSTERS[m.def];
    if (d.ranged) {
      this.projectiles.push({
        id: this.nextUid(), x: m.x, y: m.y, z: 1.1, px: m.x, py: m.y, pz: 1.1, target: 'hero',
        spd: MONSTER_SCALING.projectileSpeed, el: m.el, small: true,
        shot: { kind: 'mon', mon: m.id, dmg: m.dmg, el: m.el, name: m.name },
      });
    } else {
      this.emit({ t: 'monAttack', id: m.id });
      this.monHit(m.dmg, m.el, m.name, 1, undefined, m);
      if ((this.buffs.frostarmor ?? 0) > 0 && m.hp > 0) { m.chill = Math.max(m.chill, SKILLS.frostarmor.meleeChill || 0); m.chillEff = Math.max(m.chillEff, STATES.baseChillEffect / 100); }
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
    const burning = m.burn > 0, overkill = Math.max(0, -m.hp);
    m.hp = 0;
    const s = this.s, rk = RANKS[m.rank], rng = this.rng, D = ITEMS.drops, diff = this.diff, F = this.feel;
    s.kills++; this.run.kills++;
    const R = this.rift; // rift: key rewards (experience, gold, rarity, item quantity)
    this.gainXp(Math.round(monsterXp(m.L, m.rank, s.difficulty) * xpFactor(s.lvl, m.L) * F.xpMult() * R.xpMult()));
    const metaLoot = this.meta.onKill(m); // meta: bounties, feats, tyrant counter and loot, events
    if (!F.onKill(m, overkill) || !metaLoot) return; // feel: treasure creature, mirror images, death blasts
    if (m.rank >= 1) this.log(`${rk.name} **${m.name}** slain.`, m.rank >= 2 ? 'r2' : '');
    if (m.rank > 0 || rng.chance(D.goldChance + F.goldChanceAdd()))
      this.drops.push({ id: this.nextUid(), x: m.x + rng.range(-0.5, 0.5), y: m.y + rng.range(-0.5, 0.5), gold: Math.round(m.L * rng.range(D.goldPerLevel[0], D.goldPerLevel[1]) * rk.gold * diff.goldMult * F.goldMult() * this.meta.goldMult() * R.goldMult()) });
    let n = 0, minR = 0, gemChance = D.gemChance;
    if (m.rank === 0) n = rng.chance(D.itemChance + F.itemChanceAdd()) ? 1 : 0;
    else {
      const rule = m.rank === 1 ? D.champion : m.rank === 2 ? D.elite : D.boss;
      n = rng.int(rule.count[0], rule.count[1]); minR = rule.minRarity; gemChance = rule.gemChance;
    }
    n = R.qty(n);
    for (let i = 0; i < n; i++) {
      const it = genItem(rng, this.itemId(), m.L, minR, m.rank === 3, F.rarityBoost() + this.meta.rarityBoost() + R.rarity());
      this.meta.onItem(it); // meta: found items for bounties and feats
      // loot filter rules (loot.ts): items not kept are sold or salvaged on the spot
      const fate = lootFate(s.loot, it, s.equip);
      if (fate !== 'keep') { this.run.gold += disposeItem(s, it, fate); continue; }
      this.drops.push({ id: this.nextUid(), x: m.x + rng.range(-1, 1), y: m.y + rng.range(-1, 1), item: it });
    }
    if (rng.chance(gemChance)) {
      const d: Drop = { id: this.nextUid(), x: m.x + rng.range(-1, 1), y: m.y + rng.range(-1, 1), item: genGem(rng, this.itemId(), m.L) };
      if (lootFate(s.loot, d.item!, s.equip) === 'keep') this.drops.push(d); else this.run.gold += disposeItem(s, d.item!, 'sell');
    }
    if (burning && this.st.uniques.has('cinders')) {
      this.emit({ t: 'ring', x: m.x, y: m.y, r0: 0.3, r1: 2, dur: 0.45, el: 'fire', fill: true });
      this.emit({ t: 'burst', x: m.x, y: m.y, z: 0.6, el: 'fire', size: 110 });
      const amt = m.maxHp * 0.2;
      for (const o of this.monsters) if (o !== m && o.hp > 0 && dist(o, m) <= 2) {
        const fin = afterRes({ fire: amt, cold: 0, light: 0 }, o.res, this.st.pen, o.shock > 0 ? 1 + o.shockEff : 1);
        const v = Math.max(1, Math.round(total(fin)));
        this.float(o.x, o.y, String(v), ELEMENT_COLORS.fire, false, true);
        this.dmgMon(o, v);
      }
    }
    R.onKill(m); this.mythic.onKill(); // rift: progress, guardian, keys; mythic: Seal of the Endless Stair
  }

  private gainXp(x: number) {
    const s = this.s;
    s.xp += x; this.run.xp += x;
    while (s.lvl < LEVEL_CAP && s.xp >= xpNeeded(s.lvl)) {
      s.xp -= xpNeeded(s.lvl); s.lvl++; this.run.levels++;
      s.attrPts += HERO.perLevel.attributePoints; s.skillPts += HERO.perLevel.skillPoints;
      this.recalc(); s.life = this.st.maxLife; s.mana = this.st.maxMana;
      this.emit({ t: 'ring', x: this.hero.x, y: this.hero.y, r0: 0.2, r1: 2, dur: 0.8, el: 'gold' });
      this.float(this.hero.x, this.hero.y, 'Level up!', '#e8cc5c', true);
      this.emit({ t: 'levelup' });
      this.log(`Level ${s.lvl}! +${HERO.perLevel.attributePoints} attribute points, +${HERO.perLevel.skillPoints} skill point.`, 'lvl');
      this.dirty.add('hero'); this.dirty.add('skills');
    }
    this.meta.onXp(); // meta: ember points after the level cap
  }

  private die() {
    const s = this.s, D = HERO.death;
    this.rift.onDeath(); this.mythic.reset(); // rift: the run fails, the key is lost
    s.deaths++; this.run.deaths++;
    const xl = Math.floor(s.xp * D.xpLoss), gl = Math.floor(s.gold * D.goldLoss);
    s.xp -= xl; s.gold -= gl;
    this.log(`You died. Lost ${xl} XP and ${gl} gold.`, 'bad');
    this.phase = 'town'; this.townT = D.townTime; this.returnZone = Math.max(0, s.zone - 1);
    this.monsters = []; this.projectiles = []; this.strikes = []; this.echoes = []; this.drops = []; this.buffs = {}; this.faAmt = 0; this.cd = {};
    this.feel.reset(true); // feel: lose shrine buffs
    this.meta.reset(true); // meta: the event ends
    s.life = this.st.maxLife; s.mana = this.st.maxMana; s.barrier = 0;
    this.emit({ t: 'clear' });
  }

  private onProjectileHit(p: Projectile, m: Monster, shot: SkillShot) {
    const c = this.ctx(shot.skill);
    this.hitMon(m, c, 1, shot.echo);
    shot.hit.push(m.id);
    const next = (from: Monster) => this.monsters
      .filter(o => o.hp > 0 && !shot.hit.includes(o.id) && dist(o, from) <= 5)
      .sort((a, b) => dist(a, from) - dist(b, from));
    if (shot.fork > 0) {
      const ts = next(m).slice(0, shot.fork);
      for (const t of ts) this.shoot(c, { x: m.x, y: m.y, z: 0.9 }, t, [...shot.hit], shot.pierce, 0, shot.echo);
      return false;
    }
    if (shot.pierce > 0) {
      const t = next(m)[0];
      if (t) { shot.pierce--; p.target = t.id; return true; }
    }
    return false;
  }

  private updProjectiles(dt: number) {
    for (const p of this.projectiles.slice()) {
      p.px = p.x; p.py = p.y; p.pz = p.z;
      let t: { x: number; y: number };
      let mon: Monster | undefined;
      if (p.target === 'hero') t = this.hero;
      else {
        mon = this.monsters.find(mm => mm.id === p.target);
        if (!mon || mon.hp <= 0) { this.projectiles.splice(this.projectiles.indexOf(p), 1); continue; }
        t = mon;
      }
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy), s = p.spd * dt;
      if (d <= s + 0.15) {
        if (p.shot.kind === 'skill' && mon) {
          if (!this.onProjectileHit(p, mon, p.shot)) this.projectiles.splice(this.projectiles.indexOf(p), 1);
        } else if (p.shot.kind === 'mon') {
          this.projectiles.splice(this.projectiles.indexOf(p), 1);
          const sh = p.shot;
          this.monHit(sh.dmg, sh.el, sh.name, 1, undefined, this.monsters.find(mm => mm.id === sh.mon));
        }
        continue;
      }
      p.x += (dx / d) * s; p.y += (dy / d) * s;
      p.z += ((p.target === 'hero' ? 1.2 : 0.8) - p.z) * Math.min(1, dt * 4);
    }
    for (const st of this.strikes.slice()) {
      st.t += dt;
      if (st.t >= st.dur) { this.strikes.splice(this.strikes.indexOf(st), 1); this.strikeImpact(st); }
    }
    for (const e of this.echoes.slice()) {
      e.t -= dt;
      if (e.t > 0) continue;
      this.echoes.splice(this.echoes.indexOf(e), 1);
      const alive = this.aliveNear();
      if (alive.length && this.phase === 'fight') this.cast(e.skill, e.cond, alive, true);
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
      if (s.autoReturn) { this.townT -= dt; if (this.townT <= 0 && !this.rift.townDone()) this.enterZone(this.returnZone); } // rift: auto mode
      return;
    }
    this.regen(dt);
    this.feel.tick(dt); // feel: shrine buffs, vault timer, death blasts, loot events
    this.meta.tick(dt); // meta: events, tyrant mechanics, feats, shrine bounties
    this.rift.tick(dt); this.mythic.tick(dt); // rift: timer; mythic: stacks
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] -= dt;
    if ((this.buffs.frostarmor ?? 0) > 0) {
      this.buffs.frostarmor -= dt;
      if (this.buffs.frostarmor <= 0) { this.faAmt = 0; s.barrier = Math.min(s.barrier, this.maxBarrier()); }
    }
    this.potH -= dt; this.potM -= dt; this.lastCastT -= dt; this.saintCd -= dt;
    if (this.phase === 'walk') {
      if (!this.wps.length) { h.walking = false; this.waitT -= dt; if (this.waitT <= 0) this.nextWave(); return; }
      const wp = this.wps[0], dx = wp.x - h.x, dy = wp.y - h.y, d = Math.hypot(dx, dy), st = M.walkSpeed * dt;
      h.walking = true;
      if (Math.abs(dx - dy) > 0.01) h.f = dx - dy > 0 ? 1 : -1;
      if (d <= st) { h.x = wp.x; h.y = wp.y; this.wps.shift(); if (!this.wps.length) this.waitT = 0.3; }
      else { h.x += (dx / d) * st; h.y += (dy / d) * st; }
      for (const dr of this.drops.slice()) if (dist(dr, h) < M.pickupRange) this.pickup(dr);
      this.feel.walkStep(); // feel: use shrines and chests
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
      const near = alive.filter(m => !MONSTERS[m.def].ranged && !MONSTERS[m.def].treasure && m.frozen <= 0 && dist(m, h) < M.kiteTrigger);
      if (s.kite !== false && near.length && this.kiteCd <= 0 && this.castT <= 0.2) {
        let ax = 0, ay = 0;
        for (const m of near) { const d = Math.max(0.3, dist(m, h)); ax += (h.x - m.x) / (d * d); ay += (h.y - m.y) / (d * d); }
        const l = Math.hypot(ax, ay) || 1;
        ax /= l; ay /= l;
        const side = (this.rng.chance(0.5) ? -1 : 1) * 0.45;
        const kx = ax - ay * side, ky = ay + ax * side, kl = Math.hypot(kx, ky);
        this.kdir = { x: kx / kl, y: ky / kl }; this.kite = M.kiteTime; this.kiteCd = M.kiteCooldown;
      } else {
        this.castT -= dt * this.feel.heroCastRate(); // feel: Frost Aura chill
        if (this.castT <= 0) this.heroAct();
      }
    }
    for (const m of alive) {
      if (m.hp <= 0) continue;
      if (m.chill > 0) { m.chill -= dt; if (m.chill <= 0) m.chillEff = 0; }
      if (m.shock > 0) { m.shock -= dt; if (m.shock <= 0) m.shockEff = 0; }
      if (m.freezeCd > 0) m.freezeCd -= dt;
      if (m.burn > 0) { m.burn -= dt; this.dmgMon(m, m.burnDps * dt); if (m.hp <= 0) continue; }
      const bd = MONSTERS[m.def].boss;
      if (m.frozen > 0) { m.frozen -= dt; m.walking = false; continue; }
      if (this.meta.monStep(m)) continue; // meta: trapped champion stays in its casing
      if (this.feel.monStep(m, dt)) continue; // feel: treasure creature flees; monster affixes
      this.rift.monStep(m, dt); // rift: guardian mechanics
      const d = dist(m, h), slow = m.chill > 0 ? 1 - m.chillEff : 1;
      const dsx = (h.x - h.y) - (m.x - m.y);
      if (Math.abs(dsx) > 0.05) m.f = dsx > 0 ? 1 : -1;
      if (d > m.range) { m.walking = true; const st = m.mv * slow * dt; m.x += ((h.x - m.x) / d) * st; m.y += ((h.y - m.y) / d) * st; }
      else { m.walking = false; m.atkT -= dt * slow; if (m.atkT <= 0) { m.atkT = m.atkTime; this.monAttack(m); } }
      if (m.boss && bd) {
        m.boss.specT -= dt * slow;
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
    if (this.life <= 0 && !this.mythic.cheatDeath()) { this.die(); return; } // mythic: Mantle of the Unburied
    this.monsters = this.monsters.filter(m => m.hp > 0);
    if (!this.monsters.length && !this.strikes.length && !this.feel.busy()) { this.echoes = []; this.startWalk(); }
  }

  /** Run many ticks at once (headless). */
  advance(seconds: number) {
    const n = Math.round(seconds / TICK);
    for (let i = 0; i < n; i++) this.tick(TICK);
  }
  resetRun() { const r = this.run; this.run = emptyRun(); return r; }

  /* ---------- bag ---------- */
  /** Put an item into the bag. If there is no room, the least valuable item (maybe the new one) is sold. */
  takeItem(it: BagItem, quiet = false) {
    const s = this.s;
    if (isGem(it)) this.run.gems++; else this.run.items++;
    let spot = findSpot(s.bag, it);
    if (!spot) { s.bag = autoSort(s.bag); spot = findSpot(s.bag, it); }
    while (!spot) {
      const worst = [...s.bag, it].sort((a, b) => keepValue(a) - keepValue(b))[0];
      const how = s.loot.autoSalvage && !isGem(worst) ? 'salvaged' : `sold for ${sellValue(worst)} gold`;
      disposeItem(s, worst, s.loot.autoSalvage ? 'salvage' : 'sell');
      if (worst === it) { if (!quiet) this.log(`Bag full: ${how} **${this.itemName(it)}**.`); this.dirty.add('bag'); return; }
      s.bag.splice(s.bag.indexOf(worst), 1);
      if (!quiet) this.log(`Bag full: ${how} **${this.itemName(worst)}**.`);
      spot = findSpot(s.bag, it);
    }
    [it.bx, it.by] = spot;
    s.bag.push(it);
    this.dirty.add('bag');
    if (!quiet) {
      if (isGem(it)) this.log(`Picked up **${this.itemName(it)}** (support gem).`, 'gem');
      else if (isKey(it)) this.log(`Picked up a **${keyName(it)}**${it.mods.length ? ` (${it.mods.length} modifier${it.mods.length > 1 ? 's' : ''})` : ''}.`, 'r2');
      else this.log(`Picked up **${it.name}** (${RARITIES[it.r].name} ${SLOT_NAMES[it.slot]}).${isUpgrade(it, s.equip[it.slot]) ? ' ▲ Upgrade' : ''}`, 'r' + it.r);
    }
  }
  itemName(it: BagItem) { return isGem(it) ? `${GEMS[it.gem].name} (Lv ${it.lvl})` : isKey(it) ? keyName(it) : it.name; }
  private bagRoomFor(it: BagItem) { return !!findSpot(this.s.bag, it) || !!findSpot(autoSort(this.s.bag.slice().map(x => ({ ...x }))), it); }
  /** Place an item into the bag without selling anything. Returns false if there is no room. */
  private putInBag(it: BagItem): boolean {
    let spot = findSpot(this.s.bag, it);
    if (!spot) { this.s.bag = autoSort(this.s.bag); spot = findSpot(this.s.bag, it); }
    if (!spot) return false;
    [it.bx, it.by] = spot;
    this.s.bag.push(it);
    this.dirty.add('bag');
    return true;
  }
  moveItem(itemId: number, x: number, y: number): boolean {
    const it = this.s.bag.find(i => i.id === itemId);
    if (!it || !canPlace(this.s.bag, it, x, y)) return false;
    it.bx = x; it.by = y; this.dirty.add('bag');
    return true;
  }
  sortBag() { this.s.bag = autoSort(this.s.bag); this.dirty.add('bag'); }

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
    const order: { id: string | null; cond: string }[] = [];
    for (const [id, cond] of AUTO_ORDER) if (have.includes(id) && !order.some(o => o.id === id)) order.push({ id, cond });
    for (const id of have) if (!order.some(o => o.id === id)) order.push({ id, cond: 'always' });
    // the last skill becomes the filler: make sure something always fires
    const lastIdx = order.length - 1;
    if (lastIdx >= 0 && !order.some(o => o.cond === 'always' && !SKILLS[o.id!].cooldown && SKILLS[o.id!].type !== 'buff')) {
      const filler = order.findIndex(o => !SKILLS[o.id!].cooldown && SKILLS[o.id!].type !== 'buff');
      if (filler >= 0) { const [f] = order.splice(filler, 1); order.push({ id: f.id, cond: 'always' }); }
    }
    while (order.length < 4) order.push({ id: null, cond: 'always' });
    this.s.slots = order.slice(0, 4);
    this.dirty.add('skills'); this.dirty.add('slots');
  }

  addAttr(k: Attr, n = 1) {
    n = Math.min(n, this.s.attrPts);
    if (n <= 0) return;
    this.s.attrs[k] += n; this.s.attrPts -= n;
    this.recalc(); this.dirty.add('hero'); this.dirty.add('skills');
  }

  canLearn(id: string) {
    const s = this.s, sk = SKILLS[id];
    return !!sk && s.skillPts > 0 && s.lvl >= sk.reqLevel && (s.skills[id] || 0) < skillMaxLevel(id);
  }
  learnSkill(id: string) {
    if (!this.canLearn(id)) return;
    const s = this.s, first = !s.skills[id];
    s.skills[id] = (s.skills[id] || 0) + 1; s.skillPts--;
    if (first && !isPassive(id)) {
      const e = s.slots.find(sl => !sl.id);
      if (e) { e.id = id; this.autoOrder(); }
    }
    this.recalc();
    this.dirty.add('skills'); this.dirty.add('slots'); this.dirty.add('hero');
  }

  setSlotSkill(i: number, id: string | null) {
    const sl = this.s.slots[i];
    if (id) { const other = this.s.slots.findIndex(o => o.id === id); if (other >= 0 && other !== i) this.s.slots[other] = { id: sl.id, cond: this.s.slots[other].cond }; }
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
    const s = this.s, it = s.bag.find(i => i.id === itemId);
    if (!isEquip(it) || it.unid) return;
    s.bag.splice(s.bag.indexOf(it), 1);
    const old = s.equip[it.slot];
    s.equip[it.slot] = it;
    const bx = it.bx, by = it.by;
    it.bx = it.by = undefined;
    if (old) {
      old.bx = bx; old.by = by;
      if (old.bx == null || !canPlace(s.bag, old, old.bx, old.by!)) { old.bx = old.by = undefined; this.takeItem(old, true); }
      else s.bag.push(old);
    }
    this.recalc(); this.dirty.add('bag'); this.dirty.add('hero'); this.dirty.add('skills');
  }
  unequip(slot: Slot): boolean {
    const s = this.s, it = s.equip[slot];
    if (!it || !this.bagRoomFor(it)) return false;
    s.equip[slot] = null;
    this.putInBag(it);
    this.recalc(); this.dirty.add('bag'); this.dirty.add('hero'); this.dirty.add('skills');
    return true;
  }
  sell(itemId: number) {
    const s = this.s, i = s.bag.findIndex(it => it.id === itemId);
    if (i < 0) return;
    s.gold += sellValue(s.bag[i]); s.bag.splice(i, 1); this.dirty.add('bag');
  }
  sellLow() {
    const s = this.s;
    let g = 0, n = 0;
    s.bag = s.bag.filter(it => { if (isEquip(it) && it.r < 2) { g += sellValue(it); n++; return false; } return true; });
    s.gold += g; this.dirty.add('bag');
    this.log(`Sold ${n} items for ${g} gold.`);
  }

  /* ---------- gems ---------- */
  socketsOf(id: string): (GemItem | null)[] {
    const arr = this.s.sockets[id] ?? [];
    while (arr.length < SOCKET_LEVELS.length) arr.push(null);
    this.s.sockets[id] = arr;
    return arr;
  }
  socketOpen(id: string, i: number) { return (this.s.skills[id] || 0) >= SOCKET_LEVELS[i]; }
  /** Put a gem from the bag into a skill socket. Returns an error text or null. */
  socketGem(skill: string, i: number, gemItemId: number): string | null {
    const s = this.s, g = s.bag.find(x => x.id === gemItemId);
    if (!g || !isGem(g)) return 'Gem not found.';
    if (!this.socketOpen(skill, i)) return `This socket opens at skill level ${SOCKET_LEVELS[i]}.`;
    if (!gemFits(g.gem, skill)) return `${GEMS[g.gem].name} does not fit ${SKILLS[skill].name}.`;
    const arr = this.socketsOf(skill);
    if (arr.some((o, j) => o && j !== i && o.gem === g.gem)) return 'The same gem is already in this skill.';
    s.bag.splice(s.bag.indexOf(g), 1);
    const old = arr[i];
    g.bx = g.by = undefined;
    arr[i] = g;
    if (old) this.takeItem(old, true);
    this.recalc(); this.dirty.add('skills'); this.dirty.add('bag'); this.dirty.add('slots');
    return null;
  }
  unsocket(skill: string, i: number): string | null {
    const arr = this.socketsOf(skill), g = arr[i];
    if (!g) return null;
    if (!this.putInBag(g)) return 'No room in the bag.';
    arr[i] = null;
    this.recalc(); this.dirty.add('skills'); this.dirty.add('bag'); this.dirty.add('slots');
    return null;
  }
  /** Gems that three of a kind can be fused from: [gem, level, count]. */
  fusable(): [string, number, number][] {
    const n = new Map<string, number>();
    for (const g of this.s.bag) if (isGem(g) && g.lvl < GEM_MAX_LEVEL) n.set(`${g.gem}|${g.lvl}`, (n.get(`${g.gem}|${g.lvl}`) || 0) + 1);
    return [...n].filter(([, c]) => c >= 3).map(([k, c]) => { const [g, l] = k.split('|'); return [g, +l, c] as [string, number, number]; });
  }
  fuseGems(gem: string, lvl: number): string | null {
    const s = this.s, list = s.bag.filter((g): g is GemItem => isGem(g) && g.gem === gem && g.lvl === lvl).slice(0, 3);
    if (list.length < 3) return 'You need three gems of the same kind and level.';
    const cost = 25 * lvl * lvl;
    if (s.gold < cost) return `Fusing costs ${cost} gold.`;
    s.gold -= cost;
    s.bag = s.bag.filter(x => !list.includes(x as GemItem));
    const g: GemItem = { id: this.itemId(), kind: 'gem', gem, lvl: lvl + 1 };
    this.putInBag(g);
    this.log(`Fused three gems into **${this.itemName(g)}**.`, 'gem');
    this.dirty.add('town');
    return null;
  }
  fuseCost(lvl: number) { return 25 * lvl * lvl; }

  /* ---------- town ---------- */
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
    for (const [id, arr] of Object.entries(s.sockets)) {
      if (id === START_SKILL) continue;
      arr.forEach((g, i) => { if (g && this.putInBag(g)) arr[i] = null; });
    }
    s.skills = { [START_SKILL]: 1 };
    s.slots = emptySlots();
    this.recalc();
    for (const k of ['town', 'hero', 'skills', 'slots', 'bag'] as DirtyKey[]) this.dirty.add(k);
    this.log('Points reset. Spend them in Hero and Skills. Gems went back to the bag.', 'lvl');
    return null;
  }
  setDifficulty(d: number) {
    if (!DIFFICULTIES[d] || !this.s.progress[d]) return;
    this.s.difficulty = d;
    this.recalc();
    this.enterZone(Math.min(this.s.zone, this.unlocked - 1));
    this.dirty.add('town'); this.dirty.add('hero'); this.dirty.add('zones');
  }
  returnFromTown() { this.enterZone(this.returnZone); }
  selectZone(i: number) { if (i >= 0 && i < this.unlocked) this.enterZone(i); }
}

