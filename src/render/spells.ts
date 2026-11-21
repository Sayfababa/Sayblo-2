/**
 * Skills package, renderer side: Flame Lance beams, hail and burning/icy/crackling ground, Stormwisps,
 * Storm Lanterns, the Rime Shell and Ashen Hex marks. Reads sim.spells state and 'beam' events only.
 * Built from the existing fx sprites plus code particles; visual randomness stays here (Math.random is fine).
 */
import { ELEMENT_COLORS, type Element } from '../content/index.ts';
import { TICK, type Sim } from '../sim/sim.ts';
import type { SimEvent } from '../sim/types.ts';
import type { Kit } from './feel.ts';
import { glowTexture, tex } from './textures.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ELC = ELEMENT_COLORS;
/** Height of one world unit of "z" in screen px at zoom 1 (same as scene.ts). */
const ZPX = 26;
const GROUND_FX: Record<Element, string> = { fire: 'fx-flames.jpg', cold: 'fx-frost-aura.jpg', light: 'fx-shock-ring.jpg' };

interface Arc { x0: number; y0: number; x1: number; y1: number; el: Element; t: number; dur: number }

export class SpellFx {
  private arcs: Arc[] = [];

  consume(events: SimEvent[]) {
    for (const e of events) if (e.t === 'beam') this.arcs.push({ ...e, t: 0 });
    else if (e.t === 'clear') this.arcs = [];
  }
  reset() { this.arcs = []; }

  private img(K: Kit, file: string, x: number, y: number, w: number, h: number, a: number, rot = 0) {
    const s = K.fx.sprite(tex(file), true);
    s.position.set(x, y); s.width = w; s.height = h; s.alpha = Math.max(0, Math.min(1, a)); s.rotation = rot;
  }
  private glow(K: Kit, x: number, y: number, r: number, col: string, a: number, flat = 1) {
    const s = K.fx.sprite(glowTexture(), true);
    s.position.set(x, y); s.width = r * 2; s.height = r * 2 * flat; s.tint = col; s.alpha = Math.max(0, Math.min(1, a));
  }
  /** A glowing line of fire/cold/lightning between two screen points. */
  private line(K: Kit, ax: number, ay: number, bx: number, by: number, col: string, w: number, a: number, jitter = 0) {
    const g = K.fx.graphics(true), n = 8;
    g.moveTo(ax, ay);
    for (let i = 1; i <= n; i++) {
      const q = i / n, j = i < n ? Math.sin(K.time * 37 + i * 2.3) * jitter : 0;
      g.lineTo(lerp(ax, bx, q) + j, lerp(ay, by, q) - j * 0.5);
    }
    g.stroke({ width: w * 2.2, color: col, alpha: a * 0.35, cap: 'round', join: 'round' });
    g.stroke({ width: w, color: col, alpha: a, cap: 'round', join: 'round' });
    g.stroke({ width: w * 0.35, color: '#fff3dc', alpha: a, cap: 'round', join: 'round' });
  }

  drawFx(K: Kit, sim: Sim, alpha: number, real: number) {
    const k = K.k, t = K.time, sp = sim.spells, h = sim.hero;
    const hx = lerp(h.px, h.x, alpha), hy = lerp(h.py, h.y, alpha);
    const [hsx, hsy] = K.iso(hx, hy);
    const town = sim.phase === 'town';

    // ground patches and hail (drawn first, they lie on the ground)
    for (const f of sp.fields) {
      const [px, py] = K.iso(f.x, f.y), rw = f.r * K.tw / 2, rh = f.r * K.th / 2;
      const life = Math.min(1, f.t / 0.25, (f.dur - f.t) / 0.4), col = ELC[f.el];
      const g = K.fx.graphics(true);
      g.ellipse(px, py, rw, rh).fill({ color: col, alpha: 0.07 * life }).stroke({ width: 1.5 * k, color: col, alpha: 0.35 * life });
      if (f.ground) {
        this.img(K, GROUND_FX[f.el], px, py, rw * 2.1, rh * 2.1, 0.32 * life * (0.85 + Math.sin(t * 9 + f.id) * 0.15));
        if (f.el === 'fire') for (let i = 0; i < 4; i++) {
          const a = i * 1.7 + f.id, r = 0.55 * ((i * 0.37 + 0.2) % 1);
          this.img(K, 'fx-flames.jpg', px + Math.cos(a) * rw * r, py + Math.sin(a) * rh * r - 8 * k, 24 * k, 30 * k * (0.8 + Math.sin(t * 11 + i) * 0.2), 0.6 * life);
        }
        K.light(px, py, rw * 1.1, col, 0.22 * life, 0.5);
        continue;
      }
      // hail: streaks falling into the circle, small bursts where they land
      for (let i = 0; i < 14; i++) {
        const q = (t * 1.8 + i * 0.137 + f.id * 0.31) % 1, a = i * 2.39 + f.id, r = ((i * 0.618) % 1) * 0.92;
        const gx = px + Math.cos(a) * rw * r, gy = py + Math.sin(a) * rh * r, sy = gy - (1 - q) * 150 * k;
        const s = K.fx.graphics(true);
        s.moveTo(gx + (1 - q) * 30 * k, sy).lineTo(gx + (1 - q) * 30 * k - 4 * k, sy + 12 * k).stroke({ width: 2 * k, color: '#e6f6ff', alpha: 0.75 * life });
        if (q > 0.85) this.glow(K, gx, gy, 9 * k, col, (q - 0.85) * 5 * life, 0.5);
      }
      this.img(K, 'fx-frost-aura.jpg', px, py, rw * 2, rh * 2, 0.25 * life);
      K.light(px, py, rw, col, 0.18 * life, 0.5);
    }

    // hex marks under hexed monsters: smouldering ash circle and rising embers
    for (const m of sim.monsters) {
      if (!m.hex || m.hp <= 0) continue;
      const [px, py] = K.iso(lerp(m.px, m.x, alpha), lerp(m.py, m.y, alpha)), fade = Math.min(1, m.hex.t / 0.6);
      const g = K.fx.graphics(true);
      g.ellipse(px, py, 17 * k, 7 * k).stroke({ width: 2 * k, color: '#c2461e', alpha: 0.55 * fade });
      g.ellipse(px, py, 11 * k, 4.5 * k).stroke({ width: 1 * k, color: '#ff9a5a', alpha: 0.35 * fade * (0.7 + Math.sin(t * 6 + m.id) * 0.3) });
      for (let i = 0; i < 3; i++) {
        const q = (t * 0.7 + i / 3 + m.id * 0.13) % 1;
        this.glow(K, px + Math.sin(t * 2 + i * 2.1 + m.id) * 10 * k, py - q * 46 * k, 4 * k, '#ff8a3a', (1 - q) * 0.8 * fade);
      }
    }

    // flame lance beams from the staff to the target
    for (const b of sp.beams) {
      if (town) break;
      const [ex, ey] = K.iso(b.x1, b.y1), sx = hsx, sy = hsy - 1.5 * ZPX * k, ty = ey - 0.8 * ZPX * k;
      const pulse = 0.75 + Math.sin(t * 30) * 0.25;
      this.line(K, sx, sy, ex, ty, ELC.fire, 7 * k * pulse, 0.85, 1.5 * k);
      for (let i = 1; i <= 5; i++) this.glow(K, lerp(sx, ex, i / 6), lerp(sy, ty, i / 6), 16 * k, ELC.fire, 0.3);
      this.img(K, 'fx-fire-burst.jpg', ex, ty, 54 * k * pulse, 54 * k * pulse, 0.7, t * 4);
      K.light(ex, ey, 70 * k, ELC.fire, 0.45, 0.6);
      K.light(sx, sy, 50 * k, ELC.fire, 0.4);
    }
    // forked lance arcs
    for (const a of this.arcs) a.t += real;
    this.arcs = this.arcs.filter(a => a.t < a.dur);
    for (const a of this.arcs) {
      const [x0, y0] = K.iso(a.x0, a.y0), [x1, y1] = K.iso(a.x1, a.y1), q = 1 - a.t / a.dur;
      this.line(K, x0, y0 - 0.8 * ZPX * k, x1, y1 - 0.8 * ZPX * k, ELC[a.el], 4 * k, q, 2 * k);
    }

    // stormwisps: crackling violet orbs
    for (const o of sp.orbs) {
      const [px, py] = K.iso(lerp(o.px, o.x, alpha), lerp(o.py, o.y, alpha)), y = py - 1.1 * ZPX * k;
      const fade = Math.min(1, (o.life - o.t) / 0.3, o.t / 0.15);
      this.glow(K, px, y, 30 * k, ELC.light, 0.5 * fade);
      this.img(K, 'fx-orb.jpg', px, y, 34 * k, 34 * k, fade, t * 7 + o.id);
      for (let i = 0; i < 3; i++) {
        const a = t * 9 + i * 2.1 + o.id, r = 16 * k;
        this.line(K, px, y, px + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, ELC.light, 1.5 * k, 0.6 * fade);
      }
      K.light(px, py, 60 * k, ELC.light, 0.35 * fade, 0.6);
    }

    // storm lanterns: iron cage with a violet heart, floating at shoulder height
    for (const c of sp.constructs) {
      if (town) break;
      const [px, py] = K.iso(lerp(c.px, c.x, alpha), lerp(c.py, c.y, alpha));
      const bob = Math.sin(t * 2.4 + c.id) * 4 * k, y = py - 2.2 * ZPX * k + bob, fade = Math.min(1, (c.life - c.t) / 1, c.t / 0.3);
      const flick = (c.life - c.t) < 2 ? 0.5 + 0.5 * Math.abs(Math.sin(t * 12)) : 1;
      K.shadow(px, py, 8 * k, 3 * k, 0.35 * fade);
      this.glow(K, px, y, 34 * k, ELC.light, 0.45 * fade * flick);
      const g = K.fx.graphics(false), w = 7 * k, hh = 11 * k;
      g.poly([px - w, y - hh * 0.6, px + w, y - hh * 0.6, px + w * 0.8, y + hh * 0.7, px - w * 0.8, y + hh * 0.7]).fill({ color: '#b48cff', alpha: 0.35 * fade })
        .stroke({ width: 1.6 * k, color: '#3b3330', alpha: fade });
      g.moveTo(px, y - hh * 0.6).lineTo(px, y + hh * 0.7).stroke({ width: 1.2 * k, color: '#3b3330', alpha: fade });
      g.poly([px - w * 0.6, y - hh * 0.6, px, y - hh * 1.2, px + w * 0.6, y - hh * 0.6]).fill({ color: '#2a2422', alpha: fade });
      g.moveTo(px, y - hh * 1.2).lineTo(px, y - hh * 1.7).stroke({ width: 1.4 * k, color: '#3b3330', alpha: fade });
      this.glow(K, px, y, 10 * k, '#f1e6ff', 0.9 * fade * flick);
      K.light(px, y, 80 * k, ELC.light, 0.4 * fade * flick);
    }

    // rime shell: a dome of ice around the hero
    if (sp.shell && !town) {
      const s = sp.shell, fade = Math.min(1, s.t / 0.5, (s.max - s.t + TICK) / 0.25);
      const g = K.fx.graphics(true);
      g.ellipse(hsx, hsy - 34 * k, 30 * k, 46 * k).fill({ color: '#bfeaff', alpha: 0.1 * fade }).stroke({ width: 2 * k, color: '#d8f3ff', alpha: 0.6 * fade });
      g.ellipse(hsx, hsy, 30 * k, 12 * k).stroke({ width: 2 * k, color: '#8fd8ff', alpha: 0.6 * fade });
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + t * 0.4;
        g.moveTo(hsx + Math.cos(a) * 26 * k, hsy - 34 * k + Math.sin(a) * 40 * k).lineTo(hsx + Math.cos(a + 0.5) * 18 * k, hsy - 34 * k + Math.sin(a + 0.5) * 26 * k)
          .stroke({ width: 1.2 * k, color: '#ffffff', alpha: 0.35 * fade });
      }
      this.img(K, 'fx-frost-aura.jpg', hsx, hsy - 2 * k, 84 * k, 42 * k, 0.5 * fade);
      K.light(hsx, hsy - 30 * k, 70 * k, '#a6dcf0', 0.3 * fade);
    }
  }
}
