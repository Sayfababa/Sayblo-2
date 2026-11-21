/**
 * Work package D (Meta progression), simulation side: bounty progress and claiming, area tyrants,
 * area events (Blood Moon, Rift Tear, Trapped Champion), codex imprints, ember points after the
 * level cap and feats. The Sim calls the hook methods of this class from a few marked lines.
 * All numbers live in src/content/meta.json. Seeded RNG only.
 */
import {
  AFFIXES, AFFIX_ROLL, AFFIX_TIERS, AREAS, EMBER_TRACKS, EVENT_IDS, FEATS, HERO, META, MONSTERS, SLOTS, TYRANTS, UNIQUES,
  type EmberTrack, type EventId,
} from '../content/index.ts';
import { bountyDone, bountyText, fillBoard, genBounty, swapCost } from './bounty.ts';
import { imprintBlock, imprintCost } from './codex.ts';
import { addMats, bestTier, canAfford } from './crafting.ts';
import { disposeItem, findItem, matText } from './economy.ts';
import { affixValue, xpNeeded } from './formulas.ts';
import { affixFits, genGem, genItem, genItemOf, genUnique, rollAffix } from './items.ts';
import { lootFate } from './loot.ts';
import type { Bounty } from './meta-types.ts';
import { emptyAlloc } from './meta-types.ts';
import type { Sim } from './sim.ts';
import { hasPerfect } from './upgrade.ts';
import { isGem, type BagItem, type Item, type Mod, type Monster, type SaveState } from './types.ts';

const TY = META.tyrants, EV = META.events;

/** The running area event. */
export interface AreaEvent {
  id: EventId; t: number; dur: number;
  /** Rift Tear: centre and radius */
  x?: number; y?: number; r?: number;
  /** Trapped Champion: monster id once spawned */
  mon?: number;
}

/** Counters for balancing runs (scripts/simulate.ts). */
export interface MetaRun { bounties: number; tyrantSpawns: number; tyrantKills: number; events: Record<EventId, number>; feats: number; ember: number; imprints: number }
const emptyRun = (): MetaRun => ({ bounties: 0, tyrantSpawns: 0, tyrantKills: 0, events: { bloodmoon: 0, tear: 0, champion: 0 }, feats: 0, ember: 0, imprints: 0 });

/** Level cap from hero.json (ember points after it). */
export const LEVEL_CAP = HERO.levelCap;
/** XP for one ember point: one full bar of the cap level. */
export const emberBar = () => xpNeeded(LEVEL_CAP);
export const emberFree = (s: SaveState) => s.meta.ember.earned - EMBER_TRACKS.reduce((a, t) => a + (s.meta.ember.alloc[t] || 0), 0);
export const tyrantKey = (diff: number, area: number) => `${diff}:${AREAS[area].id}`;

/** Value a feat type counts (see meta.json feats). */
export function featValue(s: SaveState, type: string): number {
  const m = s.meta, st = m.stats;
  switch (type) {
    case 'kills': return s.kills;
    case 'deaths': return s.deaths;
    case 'level': return s.lvl;
    case 'gold': return s.gold;
    case 'difficulty': return s.progress.reduce((a, p, i) => (p ? i : a), 0);
    case 'codex': return m.codex.length;
    case 'codexAll': return m.codex.length >= Object.keys(UNIQUES).length ? 1 : 0;
    case 'tyrantKinds': return Object.keys(m.slain).length;
    case 'ember': return m.ember.earned;
    default: return st[type] || 0;
  }
}

export class Meta {
  ev: AreaEvent | null = null;
  /** seconds until the next area event may start */
  nextEv = 0;
  /** id of the tyrant monster while it fights */
  tyrantUp: number | null = null;
  run: MetaRun = emptyRun();
  private sim: Sim;
  private featT = 0;
  private scanT = 0;
  private seen = { shrines: 0, vaults: 0, codex: 0 };

  constructor(sim: Sim) { this.sim = sim; }
  private get s() { return this.sim.s; }
  private get m() { return this.sim.s.meta; }
  private bump(k: string, n = 1) { this.m.stats[k] = (this.m.stats[k] || 0) + n; }
  private emit(kind: 'event' | 'eventEnd' | 'tyrant' | 'feat' | 'bounty' | 'ember' | 'codex', id: string, text: string) { this.sim.emit({ t: 'meta', kind, id, text }); }

  /** Called once from the Sim constructor (state and RNG exist then). */
  init() {
    fillBoard(this.sim.rng, this.s);
    this.nextEv = this.sim.rng.range(EV.every[0], EV.every[1]);
    this.seen = { shrines: this.sim.feel.stats.shrines, vaults: this.sim.feel.stats.vaults, codex: this.m.codex.length };
  }
  resetRun() { const r = this.run; this.run = emptyRun(); return r; }

  /* ---------- stats hooks ---------- */
  goldMult() { return 1 + (this.sim.st.mods.goldPct || 0) / 100; }
  rarityBoost() { return (this.sim.st.mods.rarityPct || 0) / 100; }

  /** New area or death: tyrant and trapped champion leave with the monsters, death also ends the event. */
  reset(death = false) {
    this.tyrantUp = null;
    if (this.ev && (death || this.ev.id === 'champion')) this.endEvent(death ? 'Your death breaks the spell.' : '');
    else if (this.ev?.id === 'tear') { this.ev.x = undefined; this.ev.y = undefined; }
  }

  /* ---------- per tick (outside town) ---------- */
  tick(dt: number) {
    const sim = this.sim, F = sim.feel;
    // shrines and vaults are counted by package A; take the difference
    if (F.stats.shrines !== this.seen.shrines) {
      const n = Math.max(0, F.stats.shrines - this.seen.shrines);
      this.seen.shrines = F.stats.shrines;
      if (n) { this.bump('shrines', n); this.progress(b => b.kind === 'useShrines', n); }
    }
    if (F.stats.vaults !== this.seen.vaults) { this.bump('vaults', Math.max(0, F.stats.vaults - this.seen.vaults)); this.seen.vaults = F.stats.vaults; }
    if (this.m.codex.length > this.seen.codex) {
      for (const u of this.m.codex.slice(this.seen.codex)) {
        sim.log(`Codex: the effect of **${UNIQUES[u].name}** is now yours to imprint.`, 'r3');
        this.emit('codex', u, `Codex: ${UNIQUES[u].name}`);
      }
      this.seen.codex = this.m.codex.length;
    }
    this.featT -= dt;
    if (this.featT <= 0) { this.featT = 1; this.checkFeats(); }
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 5; this.scanCorrupted(); }
    this.tickEvent(dt);
    for (const m of sim.monsters) if (m.mt?.ty && m.hp > 0 && m.frozen <= 0) this.tyrantStep(m, dt);
  }

  /** Monster movement hook: a trapped champion does nothing while its casing holds. Returns true if handled. */
  monStep(m: Monster): boolean {
    if (!m.mt?.encased) return false;
    if (m.ward > 0) { m.walking = false; return true; }
    m.mt.encased = false;
    this.sim.emit({ t: 'ring', x: m.x, y: m.y, r0: 0.3, r1: 2.2, dur: 0.6, el: m.el, fill: true });
    this.sim.log(`The casing shatters: **${m.name}** is free!`, 'r2');
    return false;
  }

  /* ---------- spawning ---------- */
  /** After a wave spawned around (cx, cy): Blood Moon doubles it, the Rift Tear moves there, the trapped champion appears. */
  onWave(cx: number, cy: number) {
    const sim = this.sim, ev = this.ev, rng = sim.rng;
    if (!ev) return;
    if (ev.id === 'bloodmoon') {
      const z = AREAS[sim.s.zone], L = sim.areaLevel(), base = sim.monsters.filter(m => !m.fe?.flee).length;
      const n = Math.round(base * EV.bloodmoon.extraShare), px = -sim.dir.y, py = sim.dir.x;
      for (let i = 0; i < n; i++) {
        const rank = rng.chance(EV.bloodmoon.eliteChance) ? 2 : 0, o = rng.range(-3, 3), f = rng.range(-1.5, 2);
        const m = sim.mkMon(rng.pick(z.pool), L + (rank ? 1 : 0), rank, cx + px * o + sim.dir.x * f, cy + py * o + sim.dir.y * f);
        sim.monsters.push(m);
        if (rank === 2) sim.log(`Under the Blood Moon an elite appears: **${m.name}** (${m.sub})`, 'r2');
      }
    } else if (ev.id === 'tear') { ev.x = cx; ev.y = cy; }
    else if (ev.id === 'champion' && ev.mon == null) {
      const C = EV.champion, z = AREAS[sim.s.zone];
      const m = sim.mkMon(rng.pick(z.pool), sim.areaLevel() + C.levelAdd, 2, cx + sim.dir.x * 1.5, cy + sim.dir.y * 1.5);
      m.maxHp = m.hp = Math.round(m.maxHp * C.hpMult);
      m.ward = m.maxWard = Math.round(m.maxHp * C.casingPct);
      m.mt = { champion: true, encased: true };
      m.sub = `Trapped Champion · ${m.sub}`;
      sim.monsters.push(m);
      ev.mon = m.id;
      sim.log(`**${m.name}** lies sealed in ${m.el === 'fire' ? 'embers' : 'ice'}. Break the casing!`, 'r2');
    }
  }

  /** Instead of the next wave: the area tyrant, once its kill counter is full. Returns true if it spawned. */
  onNextWave(): boolean {
    const sim = this.sim, s = this.s, area = AREAS[s.zone], T = TYRANTS[area.id];
    if (!T || this.tyrantUp != null || (this.m.tyrant[tyrantKey(s.difficulty, s.zone)] || 0) < TY.kills) return false;
    const h = sim.hero, d = 7, cx = h.x + sim.dir.x * d, cy = h.y + sim.dir.y * d, L = sim.areaLevel() + TY.levelAdd;
    const m = sim.mkMon(T.monster, L, 3, cx, cy);
    m.maxHp = m.hp = Math.round(m.maxHp * TY.hpMult);
    m.dmg *= TY.dmgMult; m.name = T.name; m.sub = `${T.title} · ${T.mechanic.name}`;
    m.el = T.mechanic.element;
    // boss stub: halves freeze like a boss, but has no phases or special of its own
    m.boss = { phase: 0, specT: Infinity };
    m.mt = { ty: area.id, mechT: T.mechanic.every * 0.6 };
    sim.monsters = [m];
    for (let i = 0; i < TY.adds; i++) sim.monsters.push(sim.mkMon(sim.rng.pick(area.pool), sim.areaLevel(), 0, cx + sim.rng.range(-2, 2), cy + sim.rng.range(-2, 2)));
    this.tyrantUp = m.id;
    this.run.tyrantSpawns++;
    sim.log(T.intro, 'r3');
    this.emit('tyrant', area.id, `${T.name} has come`);
    sim.phase = 'fight';
    return true;
  }

  /** The tyrant's one mechanic: warning circles (feel.ts blasts) that explode after a delay. */
  private tyrantStep(m: Monster, dt: number) {
    const sim = this.sim, T = TYRANTS[m.mt!.ty!], M = T.mechanic, h = sim.hero, rng = sim.rng;
    m.mt!.mechT = (m.mt!.mechT ?? M.every) - dt * (m.chill > 0 ? 1 - m.chillEff : 1);
    if (m.mt!.mechT! > 0) return;
    m.mt!.mechT = M.every;
    const pts: { x: number; y: number }[] = [], spread = M.spread ?? 2.5;
    if (M.kind === 'target') for (let i = 0; i < M.count; i++) pts.push({ x: h.x + rng.range(-0.3, 0.3), y: h.y + rng.range(-0.3, 0.3) });
    else if (M.kind === 'nova') pts.push({ x: m.x, y: m.y });
    else if (M.kind === 'ring') for (let i = 0; i < M.count; i++) { const a = (i / M.count) * Math.PI * 2 + rng.range(0, 0.5); pts.push({ x: m.x + Math.cos(a) * spread, y: m.y + Math.sin(a) * spread }); }
    else if (M.kind === 'line') {
      const dx = h.x - m.x, dy = h.y - m.y, l = Math.hypot(dx, dy) || 1, step = M.radius * 1.6;
      for (let i = 0; i < M.count; i++) { const o = (i - (M.count - 1) / 2) * step; pts.push({ x: h.x + (dx / l) * o, y: h.y + (dy / l) * o }); }
    } else {
      pts.push({ x: h.x, y: h.y });
      for (let i = 1; i < M.count; i++) { const a = rng.range(0, Math.PI * 2), r = rng.range(M.radius * 1.2, spread); pts.push({ x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r }); }
    }
    for (const p of pts) sim.feel.blasts.push({ x: p.x, y: p.y, t: M.delay, dur: M.delay, r: M.radius, dmg: m.dmg * M.mult, el: M.element, name: m.name, label: M.name });
    sim.emit({ t: 'ring', x: m.x, y: m.y, r0: 0.4, r1: 1.6, dur: 0.5, el: M.element });
  }

  /* ---------- events ---------- */
  private canStartEvent() {
    const sim = this.sim;
    return !this.ev && !sim.feel.vault && this.tyrantUp == null && sim.phase !== 'town';
  }
  private tickEvent(dt: number) {
    const sim = this.sim, ev = this.ev;
    if (!ev) {
      this.nextEv -= dt;
      if (this.nextEv <= 0 && this.canStartEvent()) this.startEvent();
      return;
    }
    ev.t -= dt;
    if (ev.id === 'tear' && ev.r != null) ev.r = Math.max(EV.tear.radius, ev.r - EV.tear.shrinkPerSecond * dt);
    if (ev.id === 'champion' && ev.mon != null && !sim.monsters.some(m => m.id === ev.mon && m.hp > 0)) { this.endEvent(''); return; }
    if (ev.t <= 0) {
      const msg = ev.id === 'champion' ? (ev.mon != null ? 'The champion sinks back into the ground, still sealed.' : '') : `The ${EV[ev.id].name} fades.`;
      if (ev.id === 'champion' && ev.mon != null) sim.monsters = sim.monsters.filter(m => m.id !== ev.mon);
      this.endEvent(msg);
    }
  }
  /** Start an event now (random unless given). */
  startEvent(id?: EventId) {
    const sim = this.sim, rng = sim.rng;
    if (!id) {
      let w = rng.next() * EVENT_IDS.reduce((a, k) => a + EV.weights[k], 0);
      id = EVENT_IDS[0];
      for (const k of EVENT_IDS) { w -= EV.weights[k]; if (w < 0) { id = k; break; } }
    }
    const E = EV[id];
    this.ev = { id, t: E.duration, dur: E.duration };
    if (id === 'tear') { this.ev.r = EV.tear.radius; this.ev.x = sim.hero.x + sim.dir.x * 4; this.ev.y = sim.hero.y + sim.dir.y * 4; }
    this.run.events[id]++;
    sim.log(`**${E.name}**: ${E.text}`, 'r3');
    this.emit('event', id, E.name);
  }
  private endEvent(msg: string) {
    const ev = this.ev;
    if (!ev) return;
    this.ev = null;
    this.bump('events');
    this.nextEv = this.sim.rng.range(EV.every[0], EV.every[1]);
    if (msg) this.sim.log(msg, '');
    this.emit('eventEnd', ev.id, EV[ev.id].name);
  }
  /** Is a point inside the Rift Tear? */
  inTear(p: { x: number; y: number }) {
    const ev = this.ev;
    return !!ev && ev.id === 'tear' && ev.x != null && ev.r != null && Math.hypot(p.x - ev.x, p.y - ev.y!) <= ev.r;
  }

  /* ---------- kills and drops ---------- */
  /**
   * Every monster death (before the normal loot). Counts bounties, feats, the tyrant counter and handles
   * tyrant, trapped champion and Rift Tear loot. Returns false if the normal loot must be skipped.
   */
  onKill(m: Monster): boolean {
    const sim = this.sim, s = this.s, d = MONSTERS[m.def], treasure = !!d.treasure, mirror = !!m.fe?.noLoot;
    if (sim.st.uniques.has('tallow') && s.life != null) s.life = Math.min(sim.st.maxLife, s.life + sim.st.maxLife * 0.03);
    if (treasure) { this.bump('wretches'); this.progress(b => b.kind === 'killWretch'); return true; }
    if (mirror) return true;
    if (m.rank === 2) { this.bump('elites'); this.progress(b => b.kind === 'killElites'); }
    if (m.rank === 3 && d.boss) this.bump('bosses');
    this.progress(b => b.kind === 'killElement' && b.el === m.el);
    this.progress(b => b.kind === 'killArea' && b.area === s.zone && b.diff === s.difficulty);
    if (m.mt?.ty) return this.tyrantDown(m);
    // tyrant counter of this area
    const key = tyrantKey(s.difficulty, s.zone);
    if (TYRANTS[AREAS[s.zone].id] && this.tyrantUp == null) {
      const n = (this.m.tyrant[key] || 0) + 1;
      this.m.tyrant[key] = Math.min(TY.kills, n);
      if (n === TY.kills) sim.log(`The ground trembles. **${TYRANTS[AREAS[s.zone].id].name}** has noticed the slaughter.`, 'r3');
    }
    if (m.mt?.champion) {
      const it = bonusAffixItem(sim, m.L);
      this.drop(m, it);
      sim.log(`The champion's hoard: **${it.name}** with a bonus affix.`, 'r2');
      this.endEvent('');
    }
    if (this.inTear(m)) {
      const T = EV.tear, ev = this.ev!, rng = sim.rng;
      ev.r = Math.min(T.maxRadius, ev.r! + T.growPerKill);
      sim.drops.push({ id: sim.nextUid(), x: m.x + rng.range(-0.6, 0.6), y: m.y + rng.range(-0.6, 0.6), gold: Math.round(m.L * rng.range(1, 3) * T.goldMult * sim.diff.goldMult) });
      if (rng.chance(T.itemChance)) this.drop(m, genItem(rng, sim.itemId(), m.L, 0, false, T.rarityBoost + this.rarityBoost()));
    }
    return true;
  }

  /** Count an item that dropped (bounties, feats). */
  onItem(it: BagItem) {
    if (isGem(it)) return;
    if (it.r === 3) this.bump('uniques');
    if (hasPerfect(it)) this.bump('perfects');
    if (it.r === 2) this.progress(b => b.kind === 'findRare' && b.slot === it.slot);
  }

  /** Put an item on the ground near a monster, through the loot rules. */
  private drop(at: { x: number; y: number }, it: BagItem) {
    const sim = this.sim, s = this.s, rng = sim.rng;
    this.onItem(it);
    const fate = lootFate(s.loot, it, s.equip);
    if (fate !== 'keep') { sim.run.gold += disposeItem(s, it, fate); return; }
    sim.drops.push({ id: sim.nextUid(), x: at.x + rng.range(-1.2, 1.2), y: at.y + rng.range(-1.2, 1.2), item: it });
  }

  private tyrantDown(m: Monster): boolean {
    const sim = this.sim, s = this.s, id = m.mt!.ty!, T = TYRANTS[id], Lt = TY.loot, rng = sim.rng;
    this.tyrantUp = null;
    this.m.tyrant[`${s.difficulty}:${id}`] = 0;
    this.m.slain[id] = (this.m.slain[id] || 0) + 1;
    this.bump('tyrants'); this.run.tyrantKills++;
    this.progress(b => b.kind === 'killTyrant' && AREAS[b.area].id === id && b.diff === s.difficulty);
    sim.log(`**${T.name}** falls. The ${AREAS[s.zone].name} breathes again.`, 'r3');
    sim.emit({ t: 'ring', x: m.x, y: m.y, r0: 0.4, r1: 3.2, dur: 0.8, el: m.el, fill: true });
    for (let i = 0, n = rng.int(Lt.goldPiles[0], Lt.goldPiles[1]); i < n; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(0.4, 1.8);
      sim.drops.push({ id: sim.nextUid(), x: m.x + Math.cos(a) * r, y: m.y + Math.sin(a) * r, gold: Math.round(m.L * rng.range(2, 4) * sim.diff.goldMult * this.goldMult()) });
    }
    for (let i = 0, n = rng.int(Lt.count[0], Lt.count[1]); i < n; i++) this.drop(m, tyrantItem(sim, T.slots, T.affixes, m.L));
    if (rng.chance(Lt.uniqueChance)) {
      const pool = T.uniques.filter(u => UNIQUES[u]);
      if (pool.length) this.drop(m, genUnique(rng, sim.itemId(), m.L, rng.pick(pool)));
    }
    if (rng.chance(Lt.gemChance)) this.drop(m, genGem(rng, sim.itemId(), m.L));
    return false;
  }

  /* ---------- bounties ---------- */
  private progress(match: (b: Bounty) => boolean, n = 1) {
    for (const b of this.m.bounties) {
      if (bountyDone(b) || !match(b)) continue;
      b.have = Math.min(b.need, b.have + n);
      if (bountyDone(b)) {
        this.sim.log(`Bounty done: **${bountyText(b)}**. Claim it at the board in Town.`, 'good');
        this.emit('bounty', String(b.id), `Bounty done: ${bountyText(b)}`);
      }
      this.sim.dirty.add('town');
    }
  }
  /** Claim a finished bounty: rewards go to the hero, a new bounty takes its place. */
  claim(id: number): string | null {
    const sim = this.sim, s = this.s, i = this.m.bounties.findIndex(b => b.id === id), b = this.m.bounties[i];
    if (!b) return 'Bounty not found.';
    if (!bountyDone(b)) return 'Not done yet.';
    const R = b.reward, rng = sim.rng;
    s.gold += R.gold; sim.run.gold += R.gold;
    s.mats = addMats(s.mats, R.mats) as SaveState['mats'];
    const got: string[] = [`${R.gold} gold`];
    if (matText(R.mats)) got.push(matText(R.mats));
    const give = (it: BagItem) => {
      const fate = lootFate(s.loot, it, s.equip);
      if (fate === 'keep') sim.takeItem(it, true); else disposeItem(s, it, fate);
      got.push(sim.itemName(it));
    };
    if (R.gem) give(genGem(rng, sim.itemId(), b.L));
    if (R.unique && UNIQUES[R.unique]) { const u = genUnique(rng, sim.itemId(), b.L, R.unique); this.onItem(u); give(u); }
    this.m.bounties.splice(i, 1, genBounty(rng, s, this.m.nextBounty++, new Set(this.m.bounties.filter(x => x !== b).map(x => x.kind))));
    this.bump('bounties'); this.run.bounties++;
    sim.log(`Bounty claimed: ${got.join(', ')}.`, 'good');
    sim.dirty.add('town'); sim.dirty.add('bag');
    return null;
  }
  /** Swap an open bounty for a new one, for gold. */
  swap(id: number): string | null {
    const sim = this.sim, s = this.s, i = this.m.bounties.findIndex(b => b.id === id), b = this.m.bounties[i];
    if (!b) return 'Bounty not found.';
    const c = swapCost(b);
    if (s.gold < c) return `Swapping costs ${c} gold.`;
    s.gold -= c;
    this.m.bounties.splice(i, 1, genBounty(sim.rng, s, this.m.nextBounty++, new Set(this.m.bounties.map(x => x.kind))));
    sim.dirty.add('town');
    return null;
  }

  /* ---------- codex ---------- */
  imprint(itemId: number, u: string): string | null {
    const sim = this.sim, s = this.s, f = findItem(s, itemId);
    if (!f) return 'Item not found.';
    const why = imprintBlock(s, f.it, u);
    if (why) return why;
    const cost = imprintCost(f.it);
    if (!canAfford(s.mats, cost)) return `Imprinting needs ${matText(cost)}.`;
    for (const [k, v] of Object.entries(cost)) s.mats[k as keyof typeof s.mats] -= v!;
    f.it.ipr = u;
    this.bump('imprints'); this.run.imprints++;
    sim.log(`Imprinted **${UNIQUES[u].name}** on **${f.it.name}**.`, 'r3');
    if (f.where === 'equip') { sim.recalc(); sim.dirty.add('hero'); sim.dirty.add('skills'); }
    sim.dirty.add('bag'); sim.dirty.add('town');
    return null;
  }

  /* ---------- ember points ---------- */
  /** After XP was gained: at the level cap every full bar becomes an ember point. */
  onXp() {
    const sim = this.sim, s = this.s;
    if (s.lvl < LEVEL_CAP) return;
    const need = emberBar();
    while (s.xp >= need) {
      s.xp -= need;
      this.m.ember.earned++; this.run.ember++;
      sim.float(sim.hero.x, sim.hero.y, '+1 Ember point', '#ffb84a', true);
      sim.log(`An **ember point** kindles (${emberFree(s)} to spend in Hero).`, 'lvl');
      this.emit('ember', String(this.m.ember.earned), '+1 Ember point');
      sim.dirty.add('hero');
    }
  }
  /** Put points into a track (negative takes them out again; reallocation is free). */
  emberAdd(t: EmberTrack, n: number) {
    const a = this.m.ember.alloc;
    if (!(t in a)) return;
    n = n > 0 ? Math.min(n, emberFree(this.s)) : Math.max(n, -a[t]);
    if (!n) return;
    a[t] += n;
    this.sim.recalc(); this.sim.dirty.add('hero'); this.sim.dirty.add('skills');
  }
  emberReset() { this.m.ember.alloc = emptyAlloc(); this.sim.recalc(); this.sim.dirty.add('hero'); this.sim.dirty.add('skills'); }

  /* ---------- feats ---------- */
  checkFeats() {
    const s = this.s, m = this.m;
    let bonus = false;
    for (const [id, F] of Object.entries(FEATS)) {
      if (m.feats.includes(id) || featValue(s, F.type) < F.n) continue;
      m.feats.push(id); this.run.feats++;
      if (F.bonus) bonus = true;
      const what = F.bonus ? Object.entries(F.bonus).map(([k, v]) => bonusText(k, v)).join(', ') : `title "${F.title}"`;
      this.sim.log(`Feat: **${F.name}** · ${what}.`, 'lvl');
      this.emit('feat', id, F.name);
      this.sim.dirty.add('hero');
    }
    if (bonus) this.sim.recalc();
  }
  setTitle(id: string | null) {
    this.m.title = id && this.m.feats.includes(id) && FEATS[id]?.title ? id : null;
    this.sim.dirty.add('hero');
  }
  private scanCorrupted() {
    const s = this.s;
    if (this.m.stats.corrupted) return;
    const all = [...Object.values(s.equip), ...s.bag, ...s.stash.flat()];
    if (all.some(it => it && !isGem(it) && it.cor)) this.m.stats.corrupted = 1;
  }
}

/** Short text for a stat bonus ("+2% spell damage"). */
export function bonusText(k: string, v: number): string {
  const special: Record<string, string> = { goldPct: '% gold', rarityPct: '% magic find', manaRegenPct: '% mana regeneration' };
  if (special[k]) return `+${v}${special[k]}`;
  const a = AFFIXES[k];
  return a ? `+${v}${a.percent ? '%' : ''} ${a.text.toLowerCase()}` : `+${v} ${k}`;
}

/** Add an affix the item does not have, at the best tier its level allows. Returns false if none fits. */
function addAffix(sim: Sim, it: Item, keys: string[], replace: boolean): boolean {
  const rng = sim.rng, have = new Set(it.mods.slice(it.imp).map(m => m[0]));
  const pool = keys.filter(k => AFFIXES[k] && affixFits(k, it.slot) && !have.has(k));
  if (!pool.length) return false;
  const k = rng.pick(pool), tier = bestTier(it.L);
  const lvl = AFFIX_TIERS.find(t => t.tier === tier)?.level ?? it.L;
  const mod: Mod = [k, affixValue(k, lvl, rng.range((AFFIX_ROLL[0] + AFFIX_ROLL[1]) / 2, AFFIX_ROLL[1])), tier];
  const idx = replace ? it.mods.findIndex((m, i) => i >= it.imp && AFFIXES[m[0]]?.group === AFFIXES[k].group) : -1;
  if (idx >= 0) it.mods[idx] = mod; else it.mods.push(mod);
  return true;
}

/** Tyrant loot: a Rare of one of its slots, usually carrying one of its favoured affixes. */
export function tyrantItem(sim: Sim, slots: string[], affixes: string[], L: number): Item {
  const rng = sim.rng, slot = rng.pick(slots.filter(x => SLOTS.includes(x as Item['slot']))) as Item['slot'];
  const it = genItemOf(rng, sim.itemId(), L, Math.min(2, TY.loot.minRarity), slot);
  if (rng.chance(TY.loot.affixChance)) addAffix(sim, it, affixes, true);
  return it;
}

/** Trapped champion loot: a Rare with one affix beyond the normal limits. */
export function bonusAffixItem(sim: Sim, L: number): Item {
  const rng = sim.rng, it = genItemOf(rng, sim.itemId(), L, 2, rng.pick(SLOTS));
  const taken = new Set(it.mods.slice(it.imp).map(m => m[0]));
  const extra = rollAffix(rng, it.slot, L, rng.chance(0.5) ? 'prefix' : 'suffix', taken) ?? rollAffix(rng, it.slot, L, 'suffix', taken);
  if (extra) it.mods.push(extra);
  return it;
}

