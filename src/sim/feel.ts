/**
 * Work package A (Feel), simulation side: shrines, the fleeing Coin-Wretch and its vault,
 * monster affix behaviour (via elitemods.ts), hero chill, death blasts, loot and kill events.
 * Sim calls the hook methods of this class from a few clearly marked lines; all numbers are in
 * src/content/feel.json and monsters.json. Seeded RNG only.
 */
import { ELITE_MODS, FEEL, HERO, MONSTERS, SHRINES, type Element } from '../content/index.ts';
import type { Stats } from './formulas.ts';
import { genGem, genItem } from './items.ts';
import type { LootSource } from './drops.ts';
import { modsStep, onModDamaged, onModDeath, rollChampionMod } from './elitemods.ts';
import { hasPerfect, isUpgrade } from './upgrade.ts';
import type { Sim } from './sim.ts';
import { isEquip, isGem, isKey, type BagItem, type Monster } from './types.ts';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Something on the ground the hero uses by walking past it. */
export interface FeelObject { id: number; kind: 'shrine' | 'chest'; type: string; x: number; y: number }
/** Pending explosion of a Fire-Enchanted monster: warning circle until t reaches 0. */
export interface Blast { x: number; y: number; t: number; dur: number; r: number; dmg: number; el: Element; name: string; label: string }

/** Counters for balancing runs (scripts/simulate.ts). */
export interface FeelStats { shrines: number; wretches: number; wretchKills: number; vaults: number; chests: number; mirrors: number; blasts: number; blastHits: number }

export class Feel {
  objects: FeelObject[] = [];
  /** active shrine buffs: shrine id → seconds left (and full duration for the HUD) */
  buffs: Record<string, number> = {};
  buffMax: Record<string, number> = {};
  blasts: Blast[] = [];
  vault: { t: number; dur: number } | null = null;
  /** Frost Aura on the hero: seconds left and slow (0..1) */
  heroChill = 0; heroChillEff = 0;
  stats: FeelStats = { shrines: 0, wretches: 0, wretchKills: 0, vaults: 0, chests: 0, mirrors: 0, blasts: 0, blastHits: 0 };
  private lastDrop = 0;
  private sim: Sim;

  constructor(sim: Sim) { this.sim = sim; }

  /* ---------- shrine buffs as stats ---------- */
  private eff(key: string): number {
    let v = 0;
    for (const id in this.buffs) if (this.buffs[id] > 0) v += SHRINES[id]?.effects[key] ?? 0;
    return v;
  }
  /** Add the active shrine buffs to freshly calculated stats (called from Sim.recalc). */
  applyStats(st: Stats) {
    for (const id in this.buffs) {
      if (!(this.buffs[id] > 0) || !SHRINES[id]) continue;
      for (const [k, v] of Object.entries(SHRINES[id].effects)) {
        if (k === 'goldPct' || k === 'xpPct' || k === 'rarityPct') continue;
        if (k === 'barrierLifePct') st.barrier += Math.round(st.maxLife * v / 100);
        else if (typeof (st as unknown as Record<string, unknown>)[k] === 'number') (st as unknown as Record<string, number>)[k] += v;
        else st.mods[k] = (st.mods[k] || 0) + v;
      }
    }
  }
  goldMult() { return (1 + this.eff('goldPct') / 100) * (this.vault ? FEEL.vault.goldMult : 1); }
  xpMult() { return 1 + this.eff('xpPct') / 100; }
  rarityBoost() { return this.eff('rarityPct') / 100; }
  goldChanceAdd() { return this.vault ? FEEL.vault.goldChanceAdd : 0; }
  itemChanceAdd() { return this.vault ? FEEL.vault.itemChanceAdd : 0; }
  /** Hero cast speed factor (Frost Aura chill). */
  heroCastRate() { return this.heroChill > 0 ? 1 - this.heroChillEff : 1; }
  chillHero(eff: number, time: number) { this.heroChill = Math.max(this.heroChill, time); this.heroChillEff = Math.max(this.heroChill > 0 ? this.heroChillEff : 0, eff); }
  /** The fight is not over while a death blast is pending. */
  busy() { return this.blasts.length > 0; }
  /** Targeting order: the treasure creature first, it is worth it. */
  prio(m: Monster) { return MONSTERS[m.def].treasure ? 1 : 0; }

  /** New area (keep shrine buffs) or death (lose them too). */
  reset(death = false) {
    this.objects = []; this.blasts = []; this.heroChill = 0;
    if (this.vault) { this.vault = null; this.sim.emit({ t: 'vault', open: false }); }
    this.lastDrop = 0;
    if (death && Object.keys(this.buffs).length) { this.buffs = {}; this.buffMax = {}; this.sim.recalc(); }
  }

  /* ---------- spawning ---------- */
  /** Called after a normal wave spawned around (cx, cy). */
  onWave(cx: number, cy: number) {
    const sim = this.sim, rng = sim.rng, S = FEEL.shrines, T = FEEL.treasure;
    const px = -sim.dir.y, py = sim.dir.x;
    if (!this.objects.some(o => o.kind === 'shrine') && rng.chance(S.chance * sim.rift.shrineMult())) { // rift: key/atlas shrine bonus
      const ids = Object.keys(SHRINES);
      let w = rng.next() * ids.reduce((a, id) => a + SHRINES[id].weight, 0), pick = ids[0];
      for (const id of ids) { w -= SHRINES[id].weight; if (w < 0) { pick = id; break; } }
      const side = rng.chance(0.5) ? 1 : -1, o = rng.range(2.5, 3.5) * side;
      this.objects.push({ id: sim.nextUid(), kind: 'shrine', type: pick, x: cx + px * o - sim.dir.x, y: cy + py * o - sim.dir.y });
    }
    if (!this.vault && rng.chance(T.chance * sim.rift.wretchMult())) { // rift: key/atlas Coin-Wretch bonus
      const h = sim.hero, m = sim.mkMon(T.monster, sim.areaLevel(), 1, h.x + sim.dir.x * T.spawnDistance + px * 1.5, h.y + sim.dir.y * T.spawnDistance + py * 1.5);
      m.maxHp = m.hp = Math.round(m.maxHp * T.hpMult);
      m.name = T.name; m.sub = T.sub; m.mods = [];
      m.fe = { flee: T.lifetime, ang: rng.range(-1, 1), turn: 0 };
      sim.monsters.push(m);
      this.stats.wretches++;
      sim.log(`A **${T.name}** scurries out, dragging a sack of coins. Kill it before it escapes!`, 'gold');
    }
  }

  /** Vault waves replace the normal wave flow while the vault is open. Returns true if it spawned one. */
  onNextWave(): boolean {
    const sim = this.sim, V = FEEL.vault, rng = sim.rng;
    if (!this.vault) return false;
    const c = sim.spawnWave(V.extraMonsters);
    const n = rng.int(V.chests[0], V.chests[1]), px = -sim.dir.y, py = sim.dir.x;
    for (let i = 0; i < n; i++) {
      const o = rng.range(-3, 3);
      this.objects.push({ id: sim.nextUid(), kind: 'chest', type: 'chest', x: c.x + px * o - sim.dir.x * rng.range(0.5, 2), y: c.y + py * o - sim.dir.y * rng.range(0.5, 2) });
    }
    sim.phase = 'fight';
    return true;
  }

  /* ---------- per tick ---------- */
  tick(dt: number) {
    const sim = this.sim, h = sim.hero;
    let ended = false;
    for (const id in this.buffs) {
      this.buffs[id] -= dt;
      if (this.buffs[id] <= 0) { delete this.buffs[id]; delete this.buffMax[id]; ended = true; }
    }
    if (ended) sim.recalc();
    if (this.heroChill > 0) { this.heroChill -= dt; if (this.heroChill <= 0) this.heroChillEff = 0; }
    if (this.vault) {
      this.vault.t -= dt;
      if (this.vault.t <= 0) { this.vault = null; sim.emit({ t: 'vault', open: false }); sim.log('The vault seals itself again.', 'gold'); }
    }
    for (const b of this.blasts.slice()) {
      b.t -= dt;
      if (b.t > 0) continue;
      this.blasts.splice(this.blasts.indexOf(b), 1);
      sim.emit({ t: 'ring', x: b.x, y: b.y, r0: 0.4, r1: b.r, dur: 0.5, el: b.el, fill: true });
      sim.emit({ t: 'burst', x: b.x, y: b.y, z: 0.6, el: b.el, size: 150 });
      if (dist(b, h) <= b.r) { this.stats.blastHits++; sim.monHit(b.dmg, b.el, b.name, 1, b.label); }
    }
    // step out of a warning circle (the hero cannot be steered, so she does it herself)
    if (sim.phase === 'fight' && sim.kite <= 0) {
      const b = this.blasts.find(x => dist(x, h) < x.r + 0.4);
      if (b) {
        let ax = h.x - b.x, ay = h.y - b.y;
        const l = Math.hypot(ax, ay);
        if (l < 0.05) { ax = -sim.dir.x; ay = -sim.dir.y; } else { ax /= l; ay /= l; }
        sim.kdir = { x: ax, y: ay }; sim.kite = HERO.movement.kiteTime;
      }
    }
    this.scanLoot();
  }

  /** Emit a loot event for every new drop (sound, beam pulse, upgrade float). */
  private scanLoot() {
    const sim = this.sim;
    for (const d of sim.drops) {
      if (d.id <= this.lastDrop) continue;
      this.lastDrop = d.id;
      if (!sim.collectEvents) continue;
      const it = d.item as BagItem | undefined;
      const kind = d.gold ? 'gold' : isGem(it) ? 'gem' : isKey(it) ? 'key' : 'item';
      const up = isEquip(it) && isUpgrade(it, sim.s.equip[it.slot]);
      sim.emit({ t: 'loot', id: d.id, x: d.x, y: d.y, kind, r: isEquip(it) ? it.r : isKey(it) ? 2 : 0, up, perfect: hasPerfect(it) });
      if (up) sim.float(d.x, d.y, '▲ Upgrade', '#6fe36a');
    }
  }

  /** While walking: use shrines and chests the hero passes. */
  walkStep() {
    const sim = this.sim, h = sim.hero, R = FEEL.shrines.useRange;
    for (const o of this.objects.slice()) {
      if (dist(o, h) > R) continue;
      this.objects.splice(this.objects.indexOf(o), 1);
      if (o.kind === 'shrine') this.useShrine(o);
      else this.openChest(o);
    }
  }
  routePoints(): { x: number; y: number }[] { return this.objects.map(o => ({ x: o.x, y: o.y })); }

  private useShrine(o: FeelObject) {
    const sim = this.sim, S = SHRINES[o.type];
    this.buffs[o.type] = S.duration; this.buffMax[o.type] = S.duration;
    sim.recalc();
    if (S.effects.barrierLifePct) sim.s.barrier = sim.maxBarrier();
    this.stats.shrines++;
    sim.emit({ t: 'shrine', x: o.x, y: o.y, shrine: o.type });
    sim.float(sim.hero.x, sim.hero.y, S.name, S.color, true);
    sim.log(`**${S.name}**: ${S.text} for ${S.duration}s.`, 'lvl');
  }

  private openChest(o: FeelObject) {
    const sim = this.sim, V = FEEL.vault, rng = sim.rng;
    this.stats.chests++;
    sim.emit({ t: 'ring', x: o.x, y: o.y, r0: 0.2, r1: 1.8, dur: 0.6, el: 'gold' });
    const before = sim.drops.length;
    this.goldShower(o.x, o.y, rng.int(V.chestGoldPiles[0], V.chestGoldPiles[1]), 1);
    this.lootItems('chest', o.x, o.y, rng.int(V.chestItems[0], V.chestItems[1]), V.chestMinRarity, 0);
    // walk over the new loot before going on
    const fresh = sim.drops.slice(before), route: { x: number; y: number }[] = [];
    let cur: { x: number; y: number } = sim.hero;
    while (fresh.length) {
      let bi = 0;
      fresh.forEach((d, i) => { if (dist(d, cur) < dist(fresh[bi], cur)) bi = i; });
      cur = fresh.splice(bi, 1)[0];
      route.push({ x: cur.x, y: cur.y });
    }
    sim.wps.unshift(...route);
    sim.log('You pry open a vault chest.', 'gold');
  }

  private goldShower(x: number, y: number, piles: number, perPile: number) {
    const sim = this.sim, rng = sim.rng, L = sim.areaLevel();
    for (let i = 0; i < piles; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(0.4, 1.7);
      const g = Math.max(1, Math.round(L * perPile * rng.range(1, 3) * sim.diff.goldMult * this.goldMult()));
      sim.drops.push({ id: sim.nextUid(), x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, gold: g });
    }
  }
  private lootItems(src: LootSource, x: number, y: number, n: number, minR: number, gemChance: number) {
    const sim = this.sim, rng = sim.rng, L = sim.areaLevel();
    for (let i = 0; i < n; i++) {
      sim.loot.put(src, genItem(rng, sim.itemId(), L, minR, false, this.rarityBoost()), x, y);
    }
    if (rng.chance(gemChance)) sim.loot.put(src, genGem(rng, sim.itemId(), L), x, y);
  }

  /* ---------- monsters ---------- */
  /** Called at the end of Sim.mkMon. */
  initMon(m: Monster) { rollChampionMod(this.sim, m); }

  /** Movement and affixes of one monster this tick. Returns true if it is fully handled here (treasure creature). */
  monStep(m: Monster, dt: number): boolean {
    if (m.fe?.flee != null) { this.flee(m, dt); return true; }
    modsStep(this.sim, m, dt);
    return false;
  }

  private flee(m: Monster, dt: number) {
    const sim = this.sim, h = sim.hero, T = FEEL.treasure, fe = m.fe!, rng = sim.rng;
    fe.flee! -= dt;
    if (fe.flee! <= 0) {
      m.hp = 0;
      sim.emit({ t: 'ring', x: m.x, y: m.y, r0: 1.2, r1: 0.1, dur: 0.5, el: 'gold' });
      sim.log(`The **${T.name}** escapes with its hoard.`, 'bad');
      return;
    }
    fe.turn = (fe.turn ?? 0) - dt;
    if (fe.turn <= 0) { fe.turn = rng.range(T.turnEvery[0], T.turnEvery[1]); fe.ang = Math.max(-1.6, Math.min(1.6, (fe.ang ?? 0) + rng.range(-1.1, 1.1))); }
    const d = dist(m, h), [lo, hi] = T.keepDistance, away = Math.atan2(m.y - h.y, m.x - h.x);
    const side = (fe.ang ?? 0) >= 0 ? 1 : -1;
    const off = d < lo ? (fe.ang ?? 0) * 0.4 : d > hi ? side * Math.PI * 0.62 : (fe.ang ?? 0);
    const a = away + off, slow = m.chill > 0 ? 1 - m.chillEff : 1, st = m.mv * slow * dt;
    const vx = Math.cos(a), vy = Math.sin(a);
    m.x += vx * st; m.y += vy * st; m.walking = true;
    if (Math.abs(vx - vy) > 0.05) m.f = vx - vy > 0 ? 1 : -1;
  }

  /** After a monster took damage (before death handling). */
  onDamaged(m: Monster) { onModDamaged(this.sim, m); }

  /**
   * When a monster dies. Emits the kill event and handles death blasts, the treasure creature
   * and mirror images. Returns false if the normal loot must be skipped.
   */
  onKill(m: Monster, overkill: number): boolean {
    const sim = this.sim, T = FEEL.treasure, treasure = !!MONSTERS[m.def].treasure;
    sim.emit({ t: 'kill', id: m.id, x: m.x, y: m.y, rank: m.rank, overkill, treasure });
    if (overkill >= 5 && (overkill >= m.maxHp * 0.3 || m.rank >= 2)) sim.float(m.x, m.y, `Overkill ${Math.round(overkill)}`, '#ffcf6a', false, true);
    onModDeath(sim, m);
    if (treasure) {
      this.stats.wretchKills++;
      sim.log(`The **${T.name}** bursts in a shower of gold!`, 'gold');
      sim.emit({ t: 'ring', x: m.x, y: m.y, r0: 0.3, r1: 2.4, dur: 0.7, el: 'gold' });
      this.goldShower(m.x, m.y, sim.rng.int(T.goldPiles[0], T.goldPiles[1]), T.goldPerPile);
      this.lootItems('wretch', m.x, m.y, sim.rng.int(T.items[0], T.items[1]), T.minRarity, T.gemChance);
      if (!this.vault && sim.rng.chance(T.vaultChance)) {
        this.vault = { t: FEEL.vault.duration, dur: FEEL.vault.duration };
        this.stats.vaults++;
        sim.emit({ t: 'vault', open: true });
        sim.log(`**The ${FEEL.vault.name} tears open!** For ${FEEL.vault.duration}s monsters pour out and chests wait in the dark.`, 'r3');
      }
      return false;
    }
    return !m.fe?.noLoot;
  }

  addBlast(b: Blast) {
    this.blasts.push(b); this.stats.blasts++;
    this.sim.log(`**${b.name}** collapses into a ${b.label}. Get clear!`, 'bad');
  }
}

/** Names of the behaviour affixes, for UI hints. */
export const BEHAVIOUR_MODS = Object.keys(ELITE_MODS).filter(k => {
  const e = ELITE_MODS[k];
  return !!(e.deathBlast || e.aura || e.teleport || e.shield || e.mirror);
});
