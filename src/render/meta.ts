/**
 * Work package D (Meta progression), renderer side: area events (Blood Moon sky, Rift Tear circle,
 * casing around the Trapped Champion), the tyrant's sigil, tint and size, and screen pulses when an
 * event starts or a tyrant arrives. Placeholders drawn in code until the art in docs/asset-requests.md exists.
 * Visual only; Math.random is fine here.
 */
import type { Sprite } from 'pixi.js';
import { ELEMENT_COLORS, META, TYRANTS } from '../content/index.ts';
import type { Sim } from '../sim/sim.ts';
import type { Monster, SimEvent } from '../sim/types.ts';
import { glowTexture } from './textures.ts';
import type { Kit } from './feel.ts';

/** Size factor of a monster (tyrants are bigger). */
export const monScale = (m: Monster) => (m.mt?.ty ? TYRANTS[m.mt.ty]?.scale ?? 1 : 1);
/** Tint the sprite of a tyrant (reused monster art, recoloured). */
export function metaTint(m: Monster, s: Sprite) {
  const T = m.mt?.ty ? TYRANTS[m.mt.ty] : null;
  if (T) s.tint = T.tint;
  return s;
}

interface Pulse { t: number; dur: number; col: string; a: number }

export class MetaFx {
  private pulses: Pulse[] = [];
  /** Blood Moon fade in/out (0..1) */
  private moon = 0;
  private tear = 0;
  private cracks: number[] = Array.from({ length: 9 }, () => Math.random());

  reset() { this.pulses = []; this.moon = 0; this.tear = 0; }

  consume(events: SimEvent[]) {
    for (const e of events) {
      if (e.t !== 'meta') continue;
      if (e.kind === 'event') this.pulses.push({ t: 0, dur: 1.1, col: META.events[e.id as 'bloodmoon']?.color ?? '#ffffff', a: 0.22 });
      else if (e.kind === 'tyrant') this.pulses.push({ t: 0, dur: 1.3, col: '#a8232a', a: 0.3 });
      else if (e.kind === 'feat') this.pulses.push({ t: 0, dur: 0.6, col: '#e8cc5c', a: 0.12 });
    }
  }

  update(real: number) {
    for (const p of this.pulses) p.t += real;
    this.pulses = this.pulses.filter(p => p.t < p.dur);
  }

  /** Additive effects above the darkness (called after the feel effects). */
  drawFx(K: Kit, sim: Sim, real: number) {
    const k = K.k, t = K.time, ev = sim.meta.ev, town = sim.phase === 'town';
    this.moon += ((ev?.id === 'bloodmoon' && !town ? 1 : 0) - this.moon) * Math.min(1, real * 1.5);
    this.tear += ((ev?.id === 'tear' && !town ? 1 : 0) - this.tear) * Math.min(1, real * 2);
    // Blood Moon: red sky wash and a moon glow in the top right corner
    if (this.moon > 0.01) {
      K.labels.graphics(true).rect(0, 0, K.w, K.h).fill({ color: '#6a0a10', alpha: 0.13 * this.moon });
      const g = K.labels.sprite(glowTexture(), true);
      g.position.set(K.w - 70 * k, 90 * k); g.width = g.height = 220 * k; g.tint = '#d0303a'; g.alpha = 0.55 * this.moon;
      K.labels.graphics(true).circle(K.w - 70 * k, 90 * k, 22 * k).fill({ color: '#e0505a', alpha: 0.5 * this.moon });
    }
    // Rift Tear: a violet circle with cracks, growing with every kill inside
    if (this.tear > 0.01 && ev?.id === 'tear' && ev.x != null && ev.r != null) {
      const [px, py] = K.iso(ev.x, ev.y!), rx = ev.r * K.tw / 2, ry = ev.r * K.th / 2, col = META.events.tear.color, a = this.tear;
      const g = K.fx.graphics(true);
      g.ellipse(px, py, rx, ry).fill({ color: col, alpha: 0.08 * a }).stroke({ width: 2.2 * k, color: col, alpha: (0.55 + Math.sin(t * 3) * 0.2) * a });
      g.ellipse(px, py, rx * 0.92, ry * 0.92).stroke({ width: 1 * k, color: '#e6d6ff', alpha: 0.25 * a });
      for (let i = 0; i < this.cracks.length; i++) {
        const ang = (i / this.cracks.length) * Math.PI * 2 + this.cracks[i], l = 0.35 + this.cracks[i] * 0.5;
        g.moveTo(px, py).lineTo(px + Math.cos(ang) * rx * l, py + Math.sin(ang) * ry * l).stroke({ width: 1.4 * k, color: col, alpha: 0.5 * a });
      }
      K.light(px, py, rx * 1.3, col, 0.35 * a, 0.5);
    }
    // monsters: tyrant sigil, champion casing
    for (const m of sim.monsters) {
      if (m.hp <= 0) continue;
      const [px, py] = K.iso(m.x, m.y);
      if (m.mt?.ty) {
        const T = TYRANTS[m.mt.ty], col = ELEMENT_COLORS[T.mechanic.element], g = K.fx.graphics(true), r = 26 * k;
        g.ellipse(px, py, r, r * 0.45).stroke({ width: 2 * k, color: '#a8232a', alpha: 0.75 });
        for (let i = 0; i < 6; i++) {
          const a = t * 0.6 + (i / 6) * Math.PI * 2;
          g.circle(px + Math.cos(a) * r, py + Math.sin(a) * r * 0.45, 2 * k).fill({ color: col, alpha: 0.85 });
        }
        K.light(px, py - 40 * k, 120 * k, col, 0.25);
        // mechanic about to fire: the sigil flares
        const left = m.mt.mechT ?? 9;
        if (left < 1) K.light(px, py, 90 * k, col, 0.4 * (1 - left));
      }
      if (m.mt?.encased && m.ward > 0) {
        const col = ELEMENT_COLORS[m.el], g = K.fx.graphics(true), h = 62 * k, w = 26 * k, f = m.maxWard ? m.ward / m.maxWard : 1;
        g.poly([px - w, py, px - w * 0.7, py - h * 0.75, px - w * 0.15, py - h, px + w * 0.5, py - h * 0.85, px + w, py - h * 0.3, px + w * 0.8, py])
          .fill({ color: col, alpha: 0.14 + 0.1 * f }).stroke({ width: 1.6 * k, color: '#e6f6ff', alpha: 0.35 + 0.35 * f });
        g.moveTo(px - w * 0.4, py - h * 0.2).lineTo(px - w * 0.1, py - h * 0.7).lineTo(px + w * 0.3, py - h * 0.5).stroke({ width: 1 * k, color: '#ffffff', alpha: 0.3 * f });
        K.light(px, py - h * 0.5, 70 * k, col, 0.3 + 0.2 * Math.sin(t * 2.5));
      }
    }
    for (const p of this.pulses) {
      const q = p.t / p.dur;
      K.labels.graphics(true).rect(0, 0, K.w, K.h).fill({ color: p.col, alpha: p.a * (1 - q) * (1 - q) });
    }
  }
}
