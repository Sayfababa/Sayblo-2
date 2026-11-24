/**
 * Work package C (Rifts), simulation side: endless rift tiers, rift keys with modifiers, the progress bar,
 * the Rift Guardian with telegraphed mechanics, the timer, key and fragment rewards, the atlas, the pinnacle
 * boss, personal bests, auto mode and offline farming. Sim calls the hook methods of the `Rift` class from a
 * few marked lines. All numbers live in src/content/rift.json. Seeded RNG only.
 */
import {
  AREAS, ATLAS_NODES, ELEMENTS, HERO, KEY_MODS, MONSTERS, MYTHIC_UNIQUES, RIFT, type Element, type RiftFx, type RiftLoot, type RiftMechanic,
} from '../content/index.ts';
import { clamp, monsterDmg, monsterHp, type Stats } from './formulas.ts';
import { genGem, genItem, genUnique } from './items.ts';
import type { LootSource } from './drops.ts';
import type { Rng } from './rng.ts';
import type { Sim } from './sim.ts';
import { isEquip, isKey, type BagItem, type KeyItem, type Monster, type RiftResult, type RiftSave, type SaveState } from './types.ts';

const S = RIFT.scaling;

/* ---------- scaling (pure) ---------- */
/** Monster life multiplier of a tier, relative to monsters at the reference level and difficulty. */
export const riftHpMult = (t: number) => Math.pow(S.hpGrowth, t - 1) * (1 + S.hpLinear * (t - 1));
export const riftDmgMult = (t: number) => Math.pow(S.dmgGrowth, t - 1) * (1 + S.dmgLinear * (t - 1));
/** Monster level of a tier (experience, gold, item level). */
export const riftLevel = (t: number) => Math.min(S.level.max, S.level.base + Math.floor((t - 1) * S.level.perTier));
export const riftMonHp = (def: string, rank: number, t: number) => monsterHp(def, S.refLevel, rank, S.refDifficulty) * riftHpMult(t);
export const riftMonDmg = (def: string, rank: number, t: number) => monsterDmg(def, S.refLevel, rank, S.refDifficulty) * riftDmgMult(t);

/* ---------- modifiers (pure) ---------- */
type NumKey = Exclude<keyof RiftFx, 'monRes'>;
/** Add `src` times `n` into `out` (all fx values are additive). */
function addFx(out: RiftFx, src: RiftFx, n = 1) {
  for (const [k, v] of Object.entries(src) as [keyof RiftFx, unknown][]) {
    if (k === 'monRes') {
      const r = (out.monRes ??= {});
      for (const [e, x] of Object.entries(v as Record<Element, number>)) r[e as Element] = (r[e as Element] ?? 0) + x * n;
    } else out[k as NumKey] = (out[k as NumKey] ?? 0) + (v as number) * n;
  }
  return out;
}
export const fxv = (fx: RiftFx, k: NumKey) => fx[k] ?? 0;

/** Sum of all atlas node effects (per rank). */
export function atlasFx(atlas: Record<string, number>): RiftFx {
  const out: RiftFx = {};
  for (const [id, n] of Object.entries(atlas)) if (ATLAS_NODES[id] && n > 0) addFx(out, ATLAS_NODES[id].fx, n);
  return out;
}
export const keyRisk = (mods: string[]) => mods.reduce((a, m) => a + (KEY_MODS[m]?.kind === 'hazard' ? KEY_MODS[m].risk : 0), 0);
/** Extra reward of a key's hazards: item quantity, rarity and experience in percent. */
export function keyReward(mods: string[], atlas: Record<string, number>) {
  const R = RIFT.keys.rewardPerRisk, risk = keyRisk(mods), m = 1 + fxv(atlasFx(atlas), 'rewardMult');
  return { qty: Math.round(risk * R.qty * m), rarity: Math.round(risk * R.rarity * m), xp: Math.round(risk * R.xp * m) };
}
/** Everything that changes a run: key modifiers, their reward and the atlas. */
export function runFx(mods: string[], atlas: Record<string, number>): RiftFx {
  const fx = atlasFx(atlas);
  for (const m of mods) if (KEY_MODS[m]) addFx(fx, KEY_MODS[m].fx);
  const r = keyReward(mods, atlas);
  return addFx(fx, { qty: r.qty, rarity: r.rarity, xp: r.xp });
}

function weightedIndex(rng: Rng, w: number[]) {
  let t = rng.next() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { t -= w[i]; if (t < 0) return i; }
  return w.length - 1;
}
/** Roll a key of a tier: 0-4 modifiers (more with the atlas), hazards and boons mixed. */
export function rollKey(rng: Rng, id: number, tier: number, atlas: Record<string, number> = {}): KeyItem {
  const K = RIFT.keys, fx = atlasFx(atlas);
  const n = weightedIndex(rng, K.countWeights) + fxv(fx, 'extraSlot');
  const hazards = Object.keys(KEY_MODS).filter(k => KEY_MODS[k].kind === 'hazard'), boons = Object.keys(KEY_MODS).filter(k => KEY_MODS[k].kind === 'boon');
  const mods: string[] = [];
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const boon = !fxv(fx, 'noBoons') && nb < K.maxBoons && !rng.chance(K.hazardShare);
    const pool = (boon ? boons : hazards).filter(k => !mods.includes(k));
    if (!pool.length) break;
    mods.push(rng.pick(pool));
    if (boon) nb++;
  }
  // hazards first, then boons
  mods.sort((a, b) => Number(KEY_MODS[a].kind === 'boon') - Number(KEY_MODS[b].kind === 'boon'));
  return { id, kind: 'key', tier: Math.max(1, Math.floor(tier)), mods };
}
export const keyName = (k: KeyItem) => `Rift Key · Tier ${k.tier}`;

/* ---------- atlas (pure) ---------- */
export const atlasEarned = (rs: RiftSave) => Math.floor(rs.maxTier / RIFT.atlas.pointEvery);
export const atlasSpent = (rs: RiftSave) => Object.values(rs.atlas).reduce((a, b) => a + b, 0);
export const atlasFree = (rs: RiftSave) => atlasEarned(rs) - atlasSpent(rs);
export const atlasRespecCost = (rs: RiftSave) => atlasSpent(rs) * RIFT.atlas.respecPerPoint;
/** Why a node cannot take another point (null = it can). */
export function atlasBlock(rs: RiftSave, id: string): string | null {
  const n = ATLAS_NODES[id];
  if (!n) return 'Unknown node.';
  if ((rs.atlas[id] ?? 0) >= n.max) return 'Fully learned.';
  const above = Object.entries(ATLAS_NODES).find(([, o]) => o.col === n.col && o.row === n.row - 1);
  if (above && !(rs.atlas[above[0]] > 0)) return `Needs ${above[1].name} first.`;
  if (atlasFree(rs) <= 0) return `No atlas points left. Clear new tiers: one point every ${RIFT.atlas.pointEvery}.`;
  return null;
}

/* ---------- pinnacle (pure) ---------- */
/** Highest pinnacle that is open (0 = none yet): one every `every` tiers cleared. */
export const pinnacleOpen = (rs: RiftSave) => Math.floor(rs.maxTier / RIFT.pinnacle.every);
export const pinnacleTier = (k: number) => k * RIFT.pinnacle.every;

/** All act I monsters that walk in areas (rifts mix them). */
export const RIFT_POOL = [...new Set(AREAS.flatMap(a => a.pool))].filter(k => !MONSTERS[k].treasure);

export interface RiftRun {
  tier: number; mods: string[]; theme: number; pin: number; fx: RiftFx;
  /** seconds in the run, progress points and what is needed */
  t: number; progress: number; need: number; limit: number;
  guardian: number | null; done: boolean; doneT: number;
  /** item ids from here on were found in this run; gold at the start */
  firstId: number; gold0: number;
  res: Partial<RiftResult>;
}

/** Counters for balancing runs (scripts/simulate.ts). */
export interface RiftStats { runs: number; fails: number; times: Record<number, number[]>; keys: number; frags: number }

export class Rift {
  run: RiftRun | null = null;
  /** URL flag ?dev: rifts open without beating Hell, free keys of any tier */
  dev = false;
  /** set while offline progress is played: runs repeat without keys and give no keys, fragments or records */
  offline = false;
  /** auto mode after a death: only keys below this tier */
  autoCap = Infinity;
  stats: RiftStats = { runs: 0, fails: 0, times: {}, keys: 0, frags: 0 };
  private sim: Sim;
  constructor(sim: Sim) { this.sim = sim; }
  private get rs() { return this.sim.s.rift; }
  unlocked() { return this.rs.open || this.dev; }
  /** Area whose look (ground, props) is used: the rift theme while in a rift. */
  look() { return this.run ? this.run.theme : this.sim.s.zone; }

  /* ---------- starting and leaving ---------- */
  /** Open a rift with a key from the bag. Returns an error text or null. */
  startKey(id: number): string | null {
    const s = this.sim.s, k = s.bag.find(i => i.id === id);
    if (!this.unlocked()) return 'Rifts are sealed until Mother Vesper falls.';
    if (!isKey(k)) return 'Key not found.';
    s.bag.splice(s.bag.indexOf(k), 1);
    this.sim.dirty.add('bag');
    this.begin(k.tier, k.mods, 0);
    return null;
  }
  /** The basic key from town: tier 1, no modifiers. */
  startFree(): string | null {
    if (!this.unlocked()) return 'Rifts are sealed until Mother Vesper falls.';
    this.begin(RIFT.keys.freeTier, [], 0);
    return null;
  }
  startPinnacle(): string | null {
    const rs = this.rs, P = RIFT.pinnacle, k = pinnacleOpen(rs);
    if (!this.unlocked() || k < 1) return `The pinnacle opens after clearing tier ${P.every}.`;
    if (rs.frags < P.frags) return `The pinnacle needs ${P.frags} key fragments. You have ${rs.frags}.`;
    rs.frags -= P.frags;
    this.begin(pinnacleTier(k), [], k);
    return null;
  }
  /** Dev flag only: a rolled key of any tier into the bag. */
  devKey(tier: number): string | null {
    if (!this.dev) return 'Dev mode only.';
    const sim = this.sim, k = rollKey(sim.rng, sim.itemId(), tier, this.rs.atlas);
    sim.takeItem(k);
    return null;
  }

  private begin(tier: number, mods: string[], pin: number, theme?: number) {
    const sim = this.sim, s = sim.s, R = RIFT.run;
    if (this.run) this.leave();
    const fx = runFx(mods, s.rift.atlas);
    const th = theme ?? sim.rng.int(0, AREAS.length - 1);
    this.run = {
      tier, mods: [...mods], theme: th, pin, fx, t: 0, progress: 0,
      need: R.progressNeed, limit: R.timer + fxv(fx, 'timer'),
      guardian: null, done: false, doneT: 0, firstId: s.nextId, gold0: s.gold, res: {},
    };
    s.rift.cur = { tier, mods: [...mods], theme: th, ...(pin ? { pin } : {}) };
    if (sim.phase === 'town') sim.phase = 'walk';
    sim.clearArea();
    sim.recalc();
    sim.dirty.add('town'); sim.dirty.add('hero');
    if (pin) sim.log(`**Pinnacle of tier ${tier}**: the key fragments fuse and the rift tears open. Something vast is waiting.`, 'r3');
    else sim.log(`**Rift · Tier ${tier}** (${AREAS[th].name} echo, monster level ${riftLevel(tier)})${mods.length ? ': ' + mods.map(m => KEY_MODS[m].text).join(' · ') : ''}. Fill the bar to call the guardian.`, 'r2');
  }

  /** Load a save with a run in progress: start it again (the key is already spent). */
  resume() {
    const c = this.rs.cur;
    if (!c || this.run || !this.unlocked()) return;
    this.begin(c.tier, c.mods, c.pin ?? 0, c.theme);
  }

  /** Leaving an unfinished rift (area change, difficulty change): the key is spent. Called from Sim.enterZone. */
  leave() {
    const r = this.run;
    if (!r) return;
    this.run = null; this.rs.cur = null;
    if (!r.done) this.sim.log('You leave the rift. The key crumbles to dust.', 'bad');
    this.sim.recalc();
    this.sim.dirty.add('town'); this.sim.dirty.add('hero'); this.sim.dirty.add('zones');
  }

  /* ---------- hooks from Sim ---------- */
  level(): number | null { return this.run ? riftLevel(this.run.tier) : null; }
  monHp(def: string, rank: number): number | null {
    return this.run ? Math.round(riftMonHp(def, rank, this.run.tier) * (1 + fxv(this.run.fx, 'monHp'))) : null;
  }
  monDmg(def: string, rank: number): number | null {
    return this.run ? riftMonDmg(def, rank, this.run.tier) * (1 + fxv(this.run.fx, 'monDmg')) : null;
  }
  /** End of Sim.mkMon: key modifiers on every monster. */
  initMon(m: Monster) {
    const fx = this.run?.fx;
    if (!fx) return;
    for (const e of ELEMENTS) m.res[e] += fx.monRes?.[e] ?? 0;
    const sp = 1 + fxv(fx, 'monSpeed');
    m.mv *= sp; m.atkTime /= sp;
  }
  /** Wave rules inside a rift (mixed monsters, denser packs), or null outside. */
  wave(extra: number): { pool: string[]; n: number; elite: number; champ: number } | null {
    const r = this.run;
    if (!r) return null;
    const R = RIFT.run, rng = this.sim.rng, fx = r.fx;
    const n = Math.max(1, Math.round(rng.int(R.waveSize[0], R.waveSize[1]) * (1 + fxv(fx, 'packSize')))) + extra;
    return { pool: rng.shuffle(RIFT_POOL).slice(0, R.typesPerWave), n, elite: R.eliteChance * (1 + fxv(fx, 'eliteMult')), champ: R.championChance };
  }
  /** Replaces the area wave flow inside a rift. Returns true if it handled the next wave. */
  nextWave(): boolean {
    const r = this.run, sim = this.sim;
    if (!r) return false;
    if (r.done) { this.finish(); return true; }
    if (r.pin && r.guardian == null) { this.spawnGuardian(); return true; }
    sim.spawnWave();
    sim.phase = 'fight';
    return true;
  }
  tick(dt: number) {
    if (!this.run) return;
    if (!this.run.done) this.run.t += dt;
  }
  goldMult() { return this.run ? 1 + fxv(this.run.fx, 'gold') / 100 : 1; }
  xpMult() { return this.run ? 1 + fxv(this.run.fx, 'xp') / 100 : 1; }
  rarity() { return this.run ? fxv(this.run.fx, 'rarity') / 100 : 0; }
  shrineMult() { return this.run ? 1 + fxv(this.run.fx, 'shrineMult') : 1; }
  wretchMult() { return this.run ? 1 + fxv(this.run.fx, 'wretchMult') : 1; }
  /** Item quantity: scale a drop count, rounding randomly. */
  qty(n: number): number {
    if (!this.run || n <= 0) return n;
    const v = n * (1 + fxv(this.run.fx, 'qty') / 100), f = Math.floor(v);
    return f + (this.sim.rng.chance(v - f) ? 1 : 0);
  }
  /** Rift resistance penalty and key modifiers on the hero (end of Sim.recalc). */
  applyStats(st: Stats) {
    const fx = this.run?.fx;
    if (!fx) return;
    const C = HERO.caps, pen = S.resPenalty + fxv(fx, 'heroRes');
    for (const e of ELEMENTS) st.res[e] = clamp(st.rawRes[e] + pen, C.resMin, C.res);
    st.barrierRegen += fxv(fx, 'heroBarrierRegen');
  }

  /** End of Sim.kill: progress, the guardian and elite key drops. */
  onKill(m: Monster) {
    const r = this.run;
    if (!r || r.done) return;
    if (m.id === r.guardian) { this.guardianDown(m); return; }
    if (m.rg) return;
    if (m.rank === 2 && !this.offline && this.sim.rng.chance(RIFT.rewards.eliteKeyChance)) this.dropKey(m.x, m.y, r.tier);
    if (r.guardian != null || r.pin) return;
    const pts = (RIFT.run.points[m.rank] ?? 0) * (1 + fxv(r.fx, 'progress') / 100) * (m.rank === 2 ? 1 + fxv(r.fx, 'elitePoints') : 1);
    r.progress = Math.min(r.need, r.progress + pts);
    if (r.progress >= r.need) this.spawnGuardian();
  }

  /** Start of Sim.die: the run fails, the key is lost. */
  onDeath() {
    const r = this.run;
    if (!r) return;
    this.run = null; this.rs.cur = null;
    this.stats.fails++;
    if (!this.offline) {
      this.rs.fails++;
      if (this.rs.auto) this.autoCap = Math.max(1, r.tier - 1);
    }
    this.sim.log(r.pin ? 'The pinnacle swallows you. The fragments are gone.' : `The rift collapses around you. The tier ${r.tier} key is lost.`, 'bad');
    this.sim.emit({ t: 'rift', res: this.result(r, false) });
    this.sim.recalc();
    this.sim.dirty.add('town'); this.sim.dirty.add('zones');
  }
  /** When the town timer after a death runs out: auto mode opens the next rift. Returns true if it did. */
  townDone(): boolean {
    if (this.offline || !this.rs.auto || !this.unlocked()) return false;
    return this.autoNext();
  }

  /* ---------- guardian ---------- */
  private spawnGuardian() {
    const sim = this.sim, r = this.run!, G = RIFT.guardian, P = RIFT.pinnacle, rng = sim.rng, h = sim.hero, L = riftLevel(r.tier);
    const pin = r.pin > 0, def = pin ? P.boss : rng.pick(G.pool), d = MONSTERS[def];
    const bd = 8, x = h.x + sim.dir.x * bd, y = h.y + sim.dir.y * bd;
    const m = sim.mkMon(def, L, 3, x, y);
    const hp = Math.round(m.maxHp * (pin ? P.hpMult : G.hpMult) * (1 + fxv(r.fx, 'guardianHp')));
    m.hp = m.maxHp = hp;
    m.dmg *= pin ? P.dmgMult : G.dmgMult;
    m.scale = pin ? P.scale : G.scale;
    if (d.tint) m.tint = d.tint;
    if (!pin) { m.name = `${d.name}, ${rng.pick(G.epithets)}`; m.sub = G.sub; }
    const others = ELEMENTS.filter(e => e !== m.el);
    m.rg = { slam: G.slam.first, rain: G.rain.first, pin, el2: rng.pick(others) };
    r.guardian = m.id;
    if (pin) {
      sim.monsters = [m];
      for (let i = 0; i < P.adds; i++) sim.monsters.push(sim.mkMon(rng.pick(RIFT_POOL), L, 1, x + rng.range(-2, 2), y + rng.range(-2, 2)));
      sim.log(d.boss!.intro, 'r3');
    } else {
      sim.monsters.push(m);
      sim.log(`The rift shudders. **${m.name}** appears!`, 'r3');
    }
    sim.emit({ t: 'ring', x, y, r0: 0.3, r1: 3.5, dur: 0.8, el: m.el });
    sim.phase = 'fight';
    sim.dirty.add('town');
  }

  /** Telegraphed guardian mechanics: warning circles the hero steps out of (Sim tick, per monster). */
  monStep(m: Monster, dt: number) {
    const g = m.rg;
    if (!g || m.hp <= 0) return;
    const G = RIFT.guardian, slow = m.chill > 0 ? 1 - m.chillEff : 1;
    const rate = slow * (m.hp < m.maxHp * G.enrageBelow ? G.enrageRate : 1) * (g.pin ? RIFT.pinnacle.mechanicRate : 1);
    g.slam -= dt * rate;
    if (g.slam <= 0) { g.slam = G.slam.every; this.blast(m, m.x, m.y, G.slam, m.el); }
    g.rain -= dt * rate;
    if (g.rain <= 0) {
      g.rain = G.rain.every;
      const h = this.sim.hero, rng = this.sim.rng, sp = G.rain.spread ?? 2;
      for (let i = 0; i < (G.rain.count ?? 1); i++) {
        const a = rng.range(0, Math.PI * 2), d = i ? rng.range(sp * 0.5, sp) : 0;
        this.blast(m, h.x + Math.cos(a) * d, h.y + Math.sin(a) * d, G.rain, g.el2, i > 0);
      }
    }
  }
  private blast(m: Monster, x: number, y: number, M: RiftMechanic, el: Element, quiet = false) {
    const sim = this.sim;
    sim.feel.blasts.push({ x, y, t: M.delay, dur: M.delay, r: M.radius, dmg: m.dmg * M.mult, el, name: m.name, label: M.label });
    if (!quiet) sim.log(`**${m.name}** calls ${M.name}. Get clear!`, 'bad');
  }

  private guardianDown(m: Monster) {
    const sim = this.sim, r = this.run!, rs = this.rs, rng = sim.rng, free = this.offline;
    r.done = true; r.doneT = r.t;
    const pin = r.pin > 0, P = RIFT.pinnacle, G = RIFT.guardian;
    const res: Partial<RiftResult> = { key: null, keys: 0, frag: false, firstClear: false, atlasPoint: false, best: false };
    sim.emit({ t: 'ring', x: m.x, y: m.y, r0: 0.3, r1: 4, dur: 0.9, el: 'gold' });
    this.burst(m.x, m.y, pin ? P.loot : G.loot, pin ? 0 : fxv(r.fx, 'guardianItems'), pin);
    if (pin) {
      const first = r.pin > rs.pinnacle;
      if (first || rng.chance(P.mythicChance)) {
        const it = genUnique(rng, sim.itemId(), riftLevel(r.tier), rng.pick(MYTHIC_UNIQUES));
        this.dropItem(it, m.x, m.y, 'pinnacle');
        sim.log(`A mythic relic falls from the Matriarch: **${it.name}**!`, 'r3');
      }
      if (!free && first) rs.pinnacle = r.pin;
    }
    if (!free) {
      const beat = r.doneT <= r.limit;
      let next = r.tier;
      if (pin) next = r.tier;
      else if (beat) next = r.tier + 1 + (fxv(r.fx, 'doubleLeap') && r.doneT <= r.limit / 2 ? 1 : 0);
      else if (rng.chance(RIFT.rewards.lowerChance)) next = Math.max(1, r.tier - 1);
      this.dropKey(m.x, m.y, next);
      res.key = next; res.keys = 1;
      if (!pin && rng.chance(fxv(r.fx, 'twinKey'))) { this.dropKey(m.x, m.y, r.tier); res.keys = 2; }
      if (!pin && rng.chance(RIFT.rewards.fragChance + fxv(r.fx, 'fragChance'))) {
        rs.frags++; res.frag = true; this.stats.frags++;
        sim.float(m.x, m.y, 'Key fragment', '#b48cff', true);
        sim.log(`You find a **key fragment** (${rs.frags}/${P.frags} for the pinnacle).`, 'r2');
      }
      if (!pin) {
        if (r.tier > rs.maxTier) {
          res.firstClear = true;
          res.atlasPoint = Math.floor(r.tier / RIFT.atlas.pointEvery) > Math.floor(rs.maxTier / RIFT.atlas.pointEvery);
          rs.maxTier = r.tier;
          if (res.atlasPoint) sim.log('**Atlas point** earned. Spend it in Town › Rifts › Atlas.', 'lvl');
        }
        const b = rs.best[r.tier];
        if (b == null || r.doneT < b) { rs.best[r.tier] = Math.round(r.doneT * 10) / 10; res.best = true; }
      }
      rs.runs++;
      if (this.autoCap <= r.tier) this.autoCap = Infinity;
    }
    (this.stats.times[r.tier] ??= []).push(r.doneT);
    this.stats.runs++;
    r.res = res;
    const mm = Math.floor(r.doneT / 60), ss = Math.floor(r.doneT % 60);
    sim.log(`**${m.name}** falls. ${pin ? 'Pinnacle' : 'Tier ' + r.tier} cleared in ${mm}:${String(ss).padStart(2, '0')}${!pin && !free ? (r.doneT <= r.limit ? ' (timer beaten!)' : ' (too slow for the timer)') : ''}.`, 'good');
    sim.dirty.add('town');
  }

  private dropItem(it: BagItem, x: number, y: number, src: LootSource = 'guardian') {
    this.sim.loot.put(src, it, x, y, 1.2);
  }
  private dropKey(x: number, y: number, tier: number) {
    const sim = this.sim;
    this.dropItem(rollKey(sim.rng, sim.itemId(), tier, this.rs.atlas), x, y);
    this.stats.keys++;
  }
  /** Loot explosion of a guardian or the pinnacle boss (on top of its normal boss drops). */
  private burst(x: number, y: number, L: RiftLoot, extra: number, boss: boolean) {
    const sim = this.sim, rng = sim.rng, lvl = riftLevel(this.run!.tier);
    const gm = sim.diff.goldMult * sim.feel.goldMult() * this.goldMult();
    for (let i = 0, n = rng.int(L.goldPiles[0], L.goldPiles[1]); i < n; i++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(0.5, 2);
      sim.drops.push({ id: sim.nextUid(), x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, gold: Math.max(1, Math.round(lvl * L.goldPerPile * rng.range(1, 3) * gm)) });
    }
    const n = this.qty(rng.int(L.items[0], L.items[1]) + extra);
    const src: LootSource = boss ? 'pinnacle' : 'guardian';
    for (let i = 0; i < n; i++) this.dropItem(genItem(rng, sim.itemId(), lvl, L.minRarity, boss, sim.feel.rarityBoost() + this.rarity() + (L.rarityBoost ?? 0)), x, y, src);
    if (rng.chance(L.gemChance)) this.dropItem(genGem(rng, sim.itemId(), lvl), x, y, src);
  }

  /* ---------- the end of a run ---------- */
  private result(r: RiftRun, ok: boolean): RiftResult {
    const s = this.sim.s, found = s.bag.filter(i => i.id >= r.firstId && isEquip(i));
    const items = found.filter(isEquip).sort((a, b) => b.r - a.r).filter(i => i.r >= 2).slice(0, 6).map(i => ({ name: i.name, r: i.r }));
    return {
      ok, tier: r.tier, time: ok ? r.doneT : r.t, limit: r.limit, beat: ok && !r.pin && r.doneT <= r.limit, best: !!r.res.best, pin: r.pin,
      key: r.res.key ?? null, keys: r.res.keys ?? 0, frag: !!r.res.frag, firstClear: !!r.res.firstClear, atlasPoint: !!r.res.atlasPoint,
      items, itemCount: s.bag.filter(i => i.id >= r.firstId && !isKey(i)).length, gold: Math.max(0, s.gold - r.gold0), auto: this.rs.auto && !this.offline,
    };
  }
  /** After the guardian's loot is picked up: result, then the next rift (auto/offline) or back to the area. */
  private finish() {
    const sim = this.sim, r = this.run!;
    sim.emit({ t: 'rift', res: this.result(r, true) });
    this.run = null; this.rs.cur = null;
    sim.recalc();
    if (this.offline && !r.pin) { this.begin(r.tier, r.mods, 0); return; }
    if (!this.offline && this.rs.auto && this.autoNext()) return;
    sim.enterZone(sim.s.zone);
  }

  /** Best key for auto mode: the highest tier up to one above the best clear (lower after a death). */
  bestKey(): KeyItem | null {
    const cap = Math.min(this.autoCap, this.rs.maxTier + RIFT.run.autoTierAboveBest);
    const keys = this.sim.s.bag.filter(isKey);
    const ok = keys.filter(k => k.tier <= cap).sort((a, b) => b.tier - a.tier || keyRisk(b.mods) - keyRisk(a.mods));
    return ok[0] ?? keys.sort((a, b) => a.tier - b.tier)[0] ?? null;
  }
  private autoNext(): boolean {
    const k = this.bestKey();
    return (k ? this.startKey(k.id) : this.startFree()) === null;
  }

  /* ---------- atlas actions ---------- */
  learnNode(id: string): string | null {
    const err = atlasBlock(this.rs, id);
    if (err) return err;
    this.rs.atlas[id] = (this.rs.atlas[id] ?? 0) + 1;
    this.sim.dirty.add('town');
    return null;
  }
  respecAtlas(): string | null {
    const s = this.sim.s, c = atlasRespecCost(s.rift);
    if (!atlasSpent(s.rift)) return 'No atlas points spent.';
    if (s.gold < c) return `Resetting the atlas costs ${c} gold.`;
    s.gold -= c; s.rift.atlas = {};
    this.sim.log('The atlas is blank again. Spend the points anew.', 'lvl');
    this.sim.dirty.add('town');
    return null;
  }

  /** Hook in Sim.zoneCleared: Mother Vesper fell on a difficulty. */
  onActBoss(difficulty: number) {
    if (difficulty < RIFT.unlock.difficulty || this.rs.open) return;
    this.rs.open = true;
    this.sim.log('**The rifts open.** Endless tiers wait. Take a free key in Town › Rifts.', 'r3');
    this.sim.dirty.add('town');
  }
}

/** Keys in a save (bag only), for the UI. */
export const bagKeys = (s: SaveState) => s.bag.filter(isKey).sort((a, b) => b.tier - a.tier || keyRisk(b.mods) - keyRisk(a.mods));
