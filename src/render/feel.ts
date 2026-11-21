/**
 * Work package A (Feel), renderer side: loot beams in rarity colour, unique screen pulse,
 * hit-stop and slow motion on elite/boss kills, shrines and vault chests, death-blast warning
 * circles, Frost Aura rings, the vault glow and a code-drawn Coin-Wretch placeholder.
 * Visual only. Hit-stop works through `timeScale`, which main.ts applies to the real time fed
 * into the fixed-step simulation, so the simulation itself (ticks, TICK, RNG) is unchanged.
 */
import type { Graphics, Sprite, Text, Texture } from 'pixi.js';
import { ELEMENT_COLORS, ELITE_MODS, FEEL, RARITIES, SHRINES } from '../content/index.ts';
import type { Sim } from '../sim/sim.ts';
import type { FeelObject } from '../sim/feel.ts';
import { isGem, isKey, type Drop, type Monster, type SimEvent } from '../sim/types.ts';
import { gemColor } from '../ui/gemcolor.ts';
import { glowTexture } from './textures.ts';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Hit-stop on kills: a short freeze, then slow motion easing back to full speed (real seconds). */
const HITSTOP = {
  elite: { freeze: 0.06, slow: 0.45, min: 0.3 },
  boss: { freeze: 0.12, slow: 1.3, min: 0.18 },
  treasure: { freeze: 0.05, slow: 0.5, min: 0.35 },
};
/** Beam height (px at zoom 1) and width by rarity: magic, rare, unique; gems use `gem`. */
const BEAM = { 1: [80, 12], 2: [125, 15], 3: [210, 24], gem: [95, 12] } as Record<number | 'gem', [number, number]>;

/** What the feel renderer needs from the scene (kept small so scene.ts only gains hook lines). */
export interface LayerLike {
  sprite(t: Texture, add?: boolean): Sprite;
  graphics(add?: boolean): Graphics;
  text(str: string, font: string, weight: string, size: number, fill: string, stroke?: boolean): Text;
}
export interface Kit {
  iso(x: number, y: number): [number, number];
  readonly k: number; readonly kt: number; readonly tw: number; readonly th: number; readonly time: number;
  readonly w: number; readonly h: number;
  world: LayerLike; fx: LayerLike; labels: LayerLike;
  light(x: number, y: number, r: number, c: string, a: number, flat?: number): void;
  shadow(x: number, y: number, rx: number, ry: number, a: number): void;
}

interface Pulse { t: number; dur: number; col: string; a: number }
interface Column { x: number; y: number; t: number; dur: number; col: string }

export class FeelFx {
  /** Factor for the real time that drives the simulation and effects (1 = normal). */
  timeScale = 1;
  shakeX = 0; shakeY = 0;
  private stop: { t: number; freeze: number; slow: number; min: number } | null = null;
  private shake = 0;
  private pulses: Pulse[] = [];
  private columns: Column[] = [];
  /** first time a drop was seen (for the beam's rise) */
  private born = new Map<number, number>();
  private clock = 0;

  reset() { this.stop = null; this.pulses = []; this.columns = []; this.born.clear(); this.timeScale = 1; this.shake = 0; }

  consume(events: SimEvent[]) {
    for (const e of events) {
      if (e.t === 'kill') {
        const H = e.rank === 3 ? HITSTOP.boss : e.rank === 2 ? HITSTOP.elite : e.treasure ? HITSTOP.treasure : null;
        if (H && (!this.stop || this.stop.slow < H.slow)) this.stop = { t: 0, ...H };
        if (e.rank === 3) { this.shake = Math.max(this.shake, 0.45); this.pulses.push({ t: 0, dur: 0.9, col: '#e0913f', a: 0.2 }); }
      } else if (e.t === 'loot' && e.kind === 'item' && e.r >= 3) {
        this.pulses.push({ t: 0, dur: 0.7, col: RARITIES[3].color, a: 0.26 });
        this.shake = Math.max(this.shake, 0.25);
      } else if (e.t === 'shrine') {
        this.columns.push({ x: e.x, y: e.y, t: 0, dur: 0.9, col: SHRINES[e.shrine]?.color ?? '#ffffff' });
        this.pulses.push({ t: 0, dur: 0.5, col: SHRINES[e.shrine]?.color ?? '#ffffff', a: 0.1 });
      } else if (e.t === 'vault' && e.open) {
        this.pulses.push({ t: 0, dur: 1.2, col: '#e8cc5c', a: 0.25 });
        this.shake = Math.max(this.shake, 0.35);
      } else if (e.t === 'clear') { this.born.clear(); }
    }
  }

  /** Advance real-time effects; call once per frame before drawing. */
  update(real: number) {
    this.clock += real;
    const s = this.stop;
    if (s) {
      s.t += real;
      if (s.t < s.freeze) this.timeScale = 0.04;
      else if (s.t < s.freeze + s.slow) { const p = (s.t - s.freeze) / s.slow; this.timeScale = s.min + (1 - s.min) * p * p; }
      else { this.timeScale = 1; this.stop = null; }
    } else this.timeScale = 1;
    this.shake = Math.max(0, this.shake - real);
    const a = this.shake * 14;
    this.shakeX = a ? Math.sin(this.clock * 71) * a : 0; this.shakeY = a ? Math.cos(this.clock * 53) * a * 0.6 : 0;
    for (const p of this.pulses) p.t += real;
    this.pulses = this.pulses.filter(p => p.t < p.dur);
    for (const c of this.columns) c.t += real;
    this.columns = this.columns.filter(c => c.t < c.dur);
  }

  /* ---------- world objects (depth-sorted by the scene) ---------- */
  drawObject(K: Kit, o: FeelObject, px: number, py: number) {
    const k = K.k, g = K.world.graphics(), t = K.time;
    if (o.kind === 'shrine') {
      const col = SHRINES[o.type]?.color ?? '#ffffff', H = 58 * k, W = 16 * k;
      K.shadow(px, py, 20 * k, 8 * k, 0.5);
      // stepped base and a leaning obelisk of dark stone
      g.poly([px - 20 * k, py, px, py + 8 * k, px + 20 * k, py, px, py - 8 * k]).fill({ color: '#2c2a2b' }).stroke({ width: 1 * k, color: '#4a4644' });
      g.poly([px - W / 2, py - 2 * k, px + W / 2, py - 2 * k, px + W * 0.3, py - H, px, py - H - 8 * k, px - W * 0.3, py - H]).fill({ color: '#3a3736' }).stroke({ width: 1.2 * k, color: '#5a5552' });
      g.poly([px, py - 2 * k, px + W / 2, py - 2 * k, px + W * 0.3, py - H, px, py - H - 8 * k]).fill({ color: '#000000', alpha: 0.25 });
      const pulse = 0.65 + Math.sin(t * 3 + o.id) * 0.25;
      g.circle(px, py - H * 0.55, 4.5 * k).stroke({ width: 1.6 * k, color: col, alpha: pulse });
      g.moveTo(px, py - H * 0.78).lineTo(px, py - H * 0.32).stroke({ width: 1.2 * k, color: col, alpha: pulse });
      K.light(px, py - H * 0.55, 60 * k, col, 0.45 * pulse);
      K.light(px, py, 70 * k, col, 0.18, 0.45);
    } else {
      const w = 22 * k, h = 13 * k, d = 9 * k;
      K.shadow(px, py, 18 * k, 7 * k, 0.5);
      g.poly([px - w / 2, py - d, px + w / 2, py - d, px + w / 2, py - d - h, px - w / 2, py - d - h]).fill({ color: '#4a2f1c' }).stroke({ width: 1 * k, color: '#2a1a10' });
      g.poly([px - w / 2, py - d - h, px + w / 2, py - d - h, px + w / 2 - 3 * k, py - d - h - 6 * k, px - w / 2 + 3 * k, py - d - h - 6 * k]).fill({ color: '#5c3b22' });
      g.poly([px - w / 2, py - d, px + w / 2, py - d, px + w / 2 - 2 * k, py, px - w / 2 + 2 * k, py]).fill({ color: '#2e1d12' });
      for (const x of [-0.3, 0.3]) g.rect(px + x * w - 1.5 * k, py - d - h - 5 * k, 3 * k, h + 5 * k).fill({ color: '#c9a557' });
      g.rect(px - 2.5 * k, py - d - h + 2 * k, 5 * k, 5 * k).fill({ color: '#e8cc5c' });
      K.light(px, py - d - h, 50 * k, '#e8cc5c', 0.3 + Math.sin(t * 4 + o.id) * 0.1);
    }
  }

  /** Coin-Wretch placeholder until its sprite exists: hunched ragged body with a huge coin sack. */
  drawWretch(K: Kit, m: Monster, px: number, py: number, H: number, alpha: number, dead: boolean, deadT: number) {
    const k = K.k, t = K.time, f = m.f || 1, g = K.world.graphics();
    const escaped = dead && (m.fe?.flee ?? 1) <= 0;
    let s = 1;
    if (escaped) { s = Math.max(0.05, 1 - deadT * 2.5); alpha = s; }
    const bob = m.walking && !dead ? Math.abs(Math.sin(t * 16 + m.id)) * 3 * k : 0;
    const y = py - bob, sc = (H / 54) * s;
    g.alpha = alpha;
    // legs
    const step = m.walking && !dead ? Math.sin(t * 16 + m.id) * 4 * k : 0;
    g.moveTo(px - 4 * sc, y - 8 * sc).lineTo(px - 6 * sc + step, py).stroke({ width: 2.2 * sc, color: '#2a2422' });
    g.moveTo(px + 3 * sc, y - 8 * sc).lineTo(px + 5 * sc - step, py).stroke({ width: 2.2 * sc, color: '#2a2422' });
    // sack on its back
    g.circle(px - f * 9 * sc, y - 26 * sc, 14 * sc).fill({ color: '#a08660' }).stroke({ width: 1.2 * sc, color: '#3b3024' });
    g.moveTo(px - f * 9 * sc - 6 * sc, y - 38 * sc).lineTo(px - f * 9 * sc + 6 * sc, y - 38 * sc).stroke({ width: 2 * sc, color: '#3b3024' });
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + m.id, cx = px - f * 9 * sc + Math.cos(a) * 8 * sc, cy = y - 26 * sc + Math.sin(a) * 7 * sc;
      g.circle(cx, cy, 2 * sc).fill({ color: '#e8cc5c', alpha: 0.6 + Math.sin(t * 9 + i) * 0.3 });
    }
    // ragged shroud body and head
    g.poly([px - 7 * sc, y - 8 * sc, px + 7 * sc, y - 8 * sc, px + f * 9 * sc, y - 28 * sc, px + f * 2 * sc, y - 34 * sc, px - f * 4 * sc, y - 22 * sc])
      .fill({ color: '#7a706a' }).stroke({ width: 1 * sc, color: '#2c2826' });
    g.circle(px + f * 7 * sc, y - 32 * sc, 5.5 * sc).fill({ color: '#8c827a' });
    g.circle(px + f * 9 * sc, y - 33 * sc, 1.3 * sc).fill({ color: '#ffd96a' });
    K.light(px - f * 9 * sc, y - 26 * sc, 46 * k, '#e8cc5c', 0.4 * alpha);
    if (!dead) {
      // remaining time as a thin gold ring at its feet
      const left = clamp((m.fe?.flee ?? 0) / FEEL.treasure.lifetime, 0, 1);
      const r = 15 * k;
      K.fx.graphics(true).arc(px, py, r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2).stroke({ width: 2 * k, color: '#e8cc5c', alpha: 0.7 });
    }
  }

  /* ---------- additive effects above the darkness ---------- */
  drawFx(K: Kit, sim: Sim) {
    const k = K.k, t = K.time;
    // loot beams
    for (const d of sim.drops) this.beam(K, d);
    for (const id of [...this.born.keys()]) if (!sim.drops.some(d => d.id === id)) this.born.delete(id);
    // death blast warning circles
    for (const b of sim.feel.blasts) {
      const [px, py] = K.iso(b.x, b.y), p = 1 - b.t / b.dur, rx = b.r * K.tw / 2, ry = b.r * K.th / 2, col = ELEMENT_COLORS[b.el];
      const blink = 0.55 + 0.45 * Math.abs(Math.sin(t * (6 + p * 14)));
      const g = K.fx.graphics(true);
      g.ellipse(px, py, rx, ry).fill({ color: col, alpha: 0.1 + 0.12 * p }).stroke({ width: 2.4 * k, color: col, alpha: blink });
      g.ellipse(px, py, Math.max(0.1, rx * p), Math.max(0.1, ry * p)).fill({ color: col, alpha: 0.22 });
      K.light(px, py, rx * 1.2, col, 0.25 + 0.3 * p, 0.5);
    }
    // monster auras
    for (const m of sim.monsters) {
      if (m.hp <= 0) continue;
      for (const key of m.mods) {
        const A = ELITE_MODS[key]?.aura;
        if (!A) continue;
        const [px, py] = K.iso(m.x, m.y), col = ELEMENT_COLORS[A.element];
        K.fx.graphics(true).ellipse(px, py, A.radius * K.tw / 2, A.radius * K.th / 2)
          .stroke({ width: 1.5 * k, color: col, alpha: 0.28 + Math.sin(t * 3 + m.id) * 0.1 }).fill({ color: col, alpha: 0.05 });
      }
    }
    // hero chilled by a Frost Aura
    if (sim.feel.heroChill > 0 && sim.phase !== 'town') {
      const [hx, hy] = K.iso(sim.hero.x, sim.hero.y);
      K.light(hx, hy - 30 * k, 50 * k, '#8fd8ff', 0.35);
      K.fx.graphics(true).ellipse(hx, hy, 20 * k, 8 * k).stroke({ width: 2 * k, color: '#bfeaff', alpha: 0.6 });
    }
    // vault: drifting gold motes around the hero
    if (sim.feel.vault && sim.phase !== 'town') {
      const [hx, hy] = K.iso(sim.hero.x, sim.hero.y);
      for (let i = 0; i < 16; i++) {
        const a = i * 2.4 + t * 0.35 * (i % 2 ? 1 : -1), r = (90 + (i * 37) % 160) * k;
        const x = hx + Math.cos(a) * r, y = hy + Math.sin(a) * r * 0.5 - ((t * 20 + i * 13) % 60) * k;
        const g = K.fx.sprite(glowTexture(), true);
        g.position.set(x, y); g.width = g.height = 10 * k; g.tint = '#e8cc5c'; g.alpha = 0.5 + Math.sin(t * 5 + i) * 0.3;
      }
      K.light(hx, hy, 200 * k, '#e8cc5c', 0.12, 0.5);
    }
    // shrine columns
    for (const c of this.columns) {
      const [px, py] = K.iso(c.x, c.y), p = c.t / c.dur, s = K.fx.sprite(glowTexture(), true);
      s.position.set(px, py - 120 * k * (0.5 + p * 0.5)); s.width = 40 * k * (1 - p * 0.5); s.height = 260 * k; s.tint = c.col; s.alpha = (1 - p) * 0.8;
    }
    // full-screen pulses (unique drop, boss kill, vault)
    for (const p of this.pulses) {
      const q = p.t / p.dur, g = K.labels.graphics(true);
      g.rect(0, 0, K.w, K.h).fill({ color: p.col, alpha: p.a * (1 - q) * (1 - q) });
    }
  }

  private beam(K: Kit, d: Drop) {
    const it = d.item;
    if (!it) return;
    const gem = isGem(it), r = gem ? 0 : isKey(it) ? 2 : it.r; // rift keys glow like rares
    if (!gem && r < 1) return;
    if (!this.born.has(d.id)) this.born.set(d.id, this.clock);
    const age = this.clock - this.born.get(d.id)!, rise = clamp(age / 0.35, 0, 1), ease = 1 - (1 - rise) * (1 - rise);
    const [hh, ww] = BEAM[gem ? 'gem' : r], k = K.k, t = K.time;
    const col = gem ? gemColor(it.gem) : RARITIES[r].color;
    const [px, py] = K.iso(d.x, d.y), H = hh * k * ease, flick = 0.85 + Math.sin(t * 5 + d.id) * 0.15;
    const outer = K.fx.sprite(glowTexture(), true);
    outer.anchor.set(0.5, 1); outer.position.set(px, py + 4 * k); outer.width = ww * 2.2 * k; outer.height = H * 1.15; outer.tint = col; outer.alpha = 0.32 * flick;
    const core = K.fx.sprite(glowTexture(), true);
    core.anchor.set(0.5, 1); core.position.set(px, py + 2 * k); core.width = ww * 0.7 * k; core.height = H; core.tint = col; core.alpha = 0.75 * flick;
    // flash when it lands
    if (age < 0.4) {
      const f = K.fx.sprite(glowTexture(), true);
      f.position.set(px, py - 6 * k); f.width = f.height = (40 + r * 18) * k * (0.5 + age * 2); f.tint = col; f.alpha = (1 - age / 0.4) * 0.8;
    }
    K.light(px, py, (30 + r * 10) * k, col, 0.35 * flick, 0.5);
    if (r >= 3) {
      // unique: wider halo and sparks climbing the beam
      const halo = K.fx.sprite(glowTexture(), true);
      halo.anchor.set(0.5, 1); halo.position.set(px, py + 6 * k); halo.width = ww * 5 * k; halo.height = H * 0.7; halo.tint = col; halo.alpha = 0.16 * flick;
      for (let i = 0; i < 5; i++) {
        const q = ((t * 0.6 + i / 5) % 1), s = K.fx.sprite(glowTexture(), true);
        s.position.set(px + Math.sin(t * 3 + i * 2) * ww * 0.6 * k, py - q * H); s.width = s.height = 7 * k; s.tint = '#fff2d0'; s.alpha = (1 - q) * 0.9;
      }
      K.light(px, py - H * 0.4, 80 * k, col, 0.3 * flick);
    }
  }
}
