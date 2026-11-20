/**
 * Draws the simulation with PixiJS: isometric ground, props, hero, monsters, loot, spells, lights.
 * Reads the simulation state and its events; never changes the simulation.
 * Positions are interpolated between simulation ticks, so motion stays smooth at any frame rate.
 */
import { Application, ColorMatrixFilter, Container, Graphics, Matrix, Sprite, Text, TextStyle, Texture, TilingSprite } from 'pixi.js';
import { AREAS, BASE_ICON, ELEMENT_COLORS, MONSTERS, PROPS, RANKS, RARITIES, SKILLS, type Element } from '../content/index.ts';
import { TICK, type Sim } from '../sim/sim.ts';
import type { Monster, SimEvent } from '../sim/types.ts';
import { darknessTexture, discTexture, glowTexture, tex } from './textures.ts';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};
const ELC = ELEMENT_COLORS;
const PROJ: Record<Element, string> = { fire: 'fx-fireball.jpg', cold: 'fx-iceshard.jpg', light: 'fx-orb.jpg' };
const BURST: Record<Element, string> = { fire: 'fx-fire-burst.jpg', cold: 'fx-ice-burst.jpg', light: 'fx-shock.jpg' };
const RING: Record<Element, string> = { fire: 'fx-fire-ring.jpg', cold: 'fx-frost-aura.jpg', light: 'fx-shock-ring.jpg' };
const FONT_BODY = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';
const FONT_DISPLAY = 'Cinzel, Georgia, serif';

/** A layer whose children are drawn in the order they are requested each frame. */
class Layer {
  c = new Container({ sortableChildren: true });
  private seq = 0;
  private sprites: Sprite[] = []; private nSprites = 0;
  private gfx: Graphics[] = []; private nGfx = 0;
  private texts = new Map<string, { list: Text[]; n: number }>();
  private bg: Graphics[] = []; private nBg = 0;

  begin() { this.seq = 0; this.nSprites = 0; this.nGfx = 0; this.nBg = 0; for (const v of this.texts.values()) v.n = 0; }
  end() {
    for (let i = this.nSprites; i < this.sprites.length; i++) this.sprites[i].visible = false;
    for (let i = this.nGfx; i < this.gfx.length; i++) this.gfx[i].visible = false;
    for (let i = this.nBg; i < this.bg.length; i++) this.bg[i].visible = false;
    for (const [k, v] of this.texts) {
      for (const t of v.list.splice(v.n)) t.destroy();
      if (!v.n) this.texts.delete(k);
    }
  }
  sprite(texture: Texture, add = false): Sprite {
    let s = this.sprites[this.nSprites++];
    if (!s) { s = new Sprite(); this.sprites.push(s); this.c.addChild(s); }
    s.texture = texture; s.visible = true; s.alpha = 1; s.rotation = 0; s.tint = 0xffffff;
    s.anchor.set(0.5); s.scale.set(1); s.filters = null; s.blendMode = add ? 'add' : 'normal';
    s.zIndex = this.seq++;
    return s;
  }
  graphics(add = false): Graphics {
    let g = this.gfx[this.nGfx++];
    if (!g) { g = new Graphics(); this.gfx.push(g); this.c.addChild(g); }
    g.clear(); g.visible = true; g.alpha = 1; g.blendMode = add ? 'add' : 'normal';
    g.zIndex = this.seq++;
    return g;
  }
  /** Background boxes for labels, kept separate so many boxes share few Graphics objects. */
  box(): Graphics {
    let g = this.bg[this.nBg++];
    if (!g) { g = new Graphics(); this.bg.push(g); this.c.addChild(g); }
    g.clear(); g.visible = true; g.alpha = 1;
    g.zIndex = this.seq++;
    return g;
  }
  /** Cached text: re-created only when its content or style changes. */
  text(str: string, font: string, weight: string, size: number, fill: string, stroke = false): Text {
    const key = `${font}|${weight}|${size}|${fill}|${stroke}|${str}`;
    let v = this.texts.get(key);
    if (!v) { v = { list: [], n: 0 }; this.texts.set(key, v); }
    let t = v.list[v.n];
    if (!t) {
      const style = new TextStyle({ fontFamily: font, fontWeight: weight as '700', fontSize: size, fill, ...(stroke ? { stroke: { color: '#000000', width: 3, alpha: 0.8 } } : {}) });
      t = new Text({ text: str, style, anchor: 0.5 });
      this.c.addChild(t);
      v.list.push(t);
    }
    v.n++;
    t.visible = true; t.alpha = 1; t.zIndex = this.seq++;
    return t;
  }
}

interface MonView { ph: number; hitT: number; lunge: number; deadT: number; dead: boolean; m: Monster; x: number; y: number }
interface Fx { k: 'burst' | 'ring' | 'bolt'; t: number; dur: number; e: SimEvent; seed: number }
interface Float { x: number; y: number; text: string; col: string; big?: boolean; t: number }
interface Light { x: number; y: number; r: number; c: string; a: number }

export interface ViewInfo { /** width covered by the menu sheet on the right (desktop) */ sheetW: number }

export class Scene {
  app: Application;
  private groundC = new Container();
  private groundTile: TilingSprite | null = null;
  private groundPulse: TilingSprite | null = null;
  private groundZone = -1;
  private world = new Layer();
  private dark = new Sprite();
  private darkKey = '';
  private lightL = new Layer();
  private fxL = new Layer();
  private labels = new Layer();

  private V = { tw: 64, th: 32, k: 1, ox: 0, oy: 0 };
  private cam = { x: 0, y: 0 };
  private time = 0;
  private hero = { anim: 0, castA: 0, orb: 'fire' as Element, hit: 0, x: 0, y: 0 };
  private mons = new Map<number, MonView>();
  private fx: Fx[] = [];
  private floats: Float[] = [];
  private lights: Light[] = [];
  private filters = new Map<number, ColorMatrixFilter>();
  private zone = -1;
  /** Screen anchor of each monster this frame, for labels and bars. */
  private anchors = new Map<number, { x: number; y: number; top: number }>();

  constructor(app: Application) {
    this.app = app;
    this.dark.anchor.set(0.5);
    app.stage.addChild(this.groundC, this.world.c, this.dark, this.lightL.c, this.fxL.c, this.labels.c);
  }

  /** Forget everything that belongs to the old run (after import or reset). */
  reset(sim: Sim) {
    this.mons.clear(); this.fx = []; this.floats = []; this.zone = -1;
    this.cam.x = sim.hero.x; this.cam.y = sim.hero.y;
  }

  /** Feed simulation events (call after the ticks of a frame). */
  consume(events: SimEvent[]) {
    for (const e of events) {
      switch (e.t) {
        case 'burst': this.fx.push({ k: 'burst', t: 0, dur: e.size >= 150 ? 0.5 : 0.35, e, seed: 0 }); break;
        case 'ring': this.fx.push({ k: 'ring', t: 0, dur: e.dur, e, seed: 0 }); break;
        case 'bolt': this.fx.push({ k: 'bolt', t: 0, dur: 0.28, e, seed: Math.random() * 1000 }); break;
        case 'float': this.floats.push({ x: e.x + (Math.random() - 0.5) * 0.5, y: e.y + (Math.random() - 0.5) * 0.5, text: e.text, col: e.col, big: e.big, t: 0 }); break;
        case 'cast': this.hero.castA = 0.28; this.hero.orb = e.el; break;
        case 'heroHit': this.hero.hit = 0.15; break;
        case 'monHit': { const v = this.mons.get(e.id); if (v) v.hitT = 0.15; break; }
        case 'monAttack': { const v = this.mons.get(e.id); if (v) v.lunge = 0.22; break; }
        case 'clear': this.mons.clear(); this.fx = this.fx.filter(f => f.k !== 'bolt'); break;
      }
    }
  }

  private iso(x: number, y: number): [number, number] {
    const V = this.V;
    return [(x - y) * V.tw / 2 + V.ox, (x + y) * V.th / 2 + V.oy];
  }
  private unIso(sx: number, sy: number): [number, number] {
    const V = this.V, a = (sx - V.ox) / (V.tw / 2), b = (sy - V.oy) / (V.th / 2);
    return [(a + b) / 2, (b - a) / 2];
  }
  private hash(x: number, y: number, s = 0) {
    const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7 + this.zone * 17.3) * 43758.5453;
    return v - Math.floor(v);
  }
  private light(x: number, y: number, r: number, c: string, a: number) { this.lights.push({ x, y, r, c, a }); }

  private glow(layer: Layer, x: number, y: number, r: number, col: string, a: number) {
    const s = layer.sprite(glowTexture(), true);
    s.position.set(x, y); s.width = s.height = r * 2; s.tint = col; s.alpha = clamp(a, 0, 1);
  }
  private shadow(x: number, y: number, rx: number, ry: number, a: number) {
    const s = this.world.sprite(discTexture());
    s.position.set(x, y); s.width = rx * 2; s.height = ry * 2; s.tint = 0x000000; s.alpha = a;
  }
  private fxImg(file: string, x: number, y: number, w: number, o: { h?: number; rot?: number; alpha?: number } = {}) {
    const t = tex(file), s = this.fxL.sprite(t, true);
    s.position.set(x, y); s.width = w; s.height = o.h ?? w * t.height / t.width;
    s.rotation = o.rot ?? 0; s.alpha = clamp(o.alpha ?? 1, 0, 1);
  }

  /** Sprite with feet at (px, py) and height H. flash/chill blend the sprite towards white/ice blue. */
  private figure(file: string, px: number, py: number, H: number, id: number,
    o: { flip?: boolean; rot?: number; sx?: number; sy?: number; alpha?: number; flash?: number; fs?: number; chill?: boolean } = {}) {
    const t = tex(file), s = this.world.sprite(t);
    s.anchor.set(0.5, 1); s.position.set(px, py);
    const sc = H / t.height;
    s.scale.set(sc * (o.flip ? -1 : 1) * (o.sx ?? 1), sc * (o.sy ?? 1));
    s.rotation = o.rot ?? 0; s.alpha = o.alpha ?? 1;
    const a2 = o.flash && o.flash > 0 ? Math.min(1, o.flash) * (o.fs ?? 0.45) : 0, a1 = o.chill ? 0.35 : 0;
    if (a1 || a2) {
      let f = this.filters.get(id);
      if (!f) { f = new ColorMatrixFilter(); this.filters.set(id, f); }
      const c = rgb('#7fd0ff'), k = (1 - a1) * (1 - a2), off = (i: number) => a1 * (1 - a2) * c[i] + a2;
      f.matrix = [k, 0, 0, 0, off(0), 0, k, 0, 0, off(1), 0, 0, k, 0, off(2), 0, 0, 0, 1, 0];
      s.filters = [f];
    }
    return s;
  }

  /** Draw one frame. `real` is the real time since the last frame, `alpha` the position between two ticks. */
  render(sim: Sim, real: number, alpha: number, view: ViewInfo) {
    const sdt = real * sim.s.speed;
    this.time += sdt;
    const w = this.app.screen.width, h = this.app.screen.height;
    if (!w || !h) return;
    const k = clamp(Math.min(w / 620, h / 560), 0.9, 1.3), V = this.V;
    V.k = k; V.tw = 64 * k; V.th = 32 * k;
    if (sim.s.zone !== this.zone) { this.zone = sim.s.zone; }

    // interpolated hero position and camera
    const H0 = sim.hero, hx = lerp(H0.px, H0.x, alpha), hy = lerp(H0.py, H0.y, alpha);
    this.hero.x = hx; this.hero.y = hy;
    const l = Math.min(1, real * 5);
    this.cam.x += (hx - this.cam.x) * l; this.cam.y += (hy - this.cam.y) * l;
    V.ox = (w - view.sheetW) / 2 - (this.cam.x - this.cam.y) * V.tw / 2;
    V.oy = (h - 40) * 0.52 - (this.cam.x + this.cam.y) * V.th / 2;

    // timers
    const hv = this.hero;
    hv.anim += sdt;
    if (hv.castA > 0) hv.castA -= sdt;
    if (hv.hit > 0) hv.hit -= sdt;
    const alive = new Set<number>();
    for (const m of sim.monsters) {
      alive.add(m.id);
      let v = this.mons.get(m.id);
      if (!v) { v = { ph: Math.random() * 6, hitT: 0, lunge: 0, deadT: 0, dead: false, m, x: m.x, y: m.y }; this.mons.set(m.id, v); }
      v.m = m; v.x = lerp(m.px, m.x, alpha); v.y = lerp(m.py, m.y, alpha);
    }
    for (const [id, v] of this.mons) {
      v.ph += sdt;
      if (v.lunge > 0) v.lunge -= sdt;
      if (v.hitT > 0) v.hitT -= sdt;
      if (!alive.has(id)) { v.dead = true; v.deadT += sdt; if (v.deadT >= 1.5) this.mons.delete(id); }
    }
    for (const f of this.fx) f.t += sdt;
    this.fx = this.fx.filter(f => f.t < f.dur);
    for (const f of this.floats) f.t += sdt;
    this.floats = this.floats.filter(f => f.t < 1);

    this.world.begin(); this.lightL.begin(); this.fxL.begin(); this.labels.begin();
    this.lights = [];
    this.anchors.clear();

    // visible tile range
    const cs = [this.unIso(0, 0), this.unIso(w, 0), this.unIso(0, h), this.unIso(w, h)];
    const x0 = Math.floor(Math.min(...cs.map(c => c[0]))) - 1, x1 = Math.ceil(Math.max(...cs.map(c => c[0]))) + 1;
    const y0 = Math.floor(Math.min(...cs.map(c => c[1]))) - 1, y1 = Math.ceil(Math.max(...cs.map(c => c[1]))) + 1;
    this.drawGround(sim, x0, y0, x1, y1);

    // depth-sorted world objects
    type Item = { z: number; kind: 'decor' | 'drop' | 'mon' | 'hero'; x: number; y: number; type?: string; v?: number; o?: unknown };
    const items: Item[] = [];
    const area = AREAS[sim.s.zone];
    for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
      const [ax, ay] = this.iso(tx, ty);
      if (ax < -V.tw || ax > w + V.tw || ay < -V.th * 2 || ay > h + V.th) continue;
      const dv = this.hash(tx, ty, 9);
      let acc = 0;
      for (const [type, p] of area.decor) {
        acc += p;
        if (dv < acc) {
          if (type === 'grass') break; // the painted ground already has grass
          items.push({ z: tx + ty + 1, kind: 'decor', type, x: tx + 0.5 + (this.hash(tx, ty, 4) - 0.5) * 0.6, y: ty + 0.5 + (this.hash(tx, ty, 5) - 0.5) * 0.6, v: this.hash(tx, ty, 6) });
          break;
        }
      }
    }
    for (const d of sim.drops) items.push({ z: d.x + d.y - 0.5, kind: 'drop', o: d, x: d.x, y: d.y });
    for (const v of this.mons.values()) items.push({ z: v.x + v.y, kind: 'mon', o: v, x: v.x, y: v.y });
    const town = sim.phase === 'town';
    if (!town) items.push({ z: hx + hy, kind: 'hero', x: hx, y: hy });
    items.sort((a, b) => a.z - b.z);
    const [hsx, hsy] = this.iso(hx, hy), hz = hx + hy;
    for (const it of items) {
      const [px, py] = this.iso(it.x, it.y);
      if (it.kind === 'decor') this.drawDecor(it.type!, px, py, it.v!, !town && it.z > hz && Math.abs(px - hsx) < 60 * k && py - hsy > 0 && py - hsy < 140 * k);
      else if (it.kind === 'mon') this.drawMon(it.o as MonView, px, py);
      else if (it.kind === 'drop') this.drawDrop(it.o as (typeof sim.drops)[number], px, py);
      else this.drawHero(sim, px, py);
    }

    // darkness with a light radius around the hero
    const [dhx, dhy] = this.iso(hx, hy);
    const inner = 90 * k, outer = Math.max(w, h) * 0.7, half = Math.max(w, h) * 1.1;
    const dk = `${Math.round(inner)}|${Math.round(outer)}`;
    if (dk !== this.darkKey) { if (this.darkKey) this.dark.texture.destroy(true); this.dark.texture = darknessTexture(inner, outer, half); this.darkKey = dk; }
    this.dark.position.set(dhx, dhy - 20 * k); this.dark.width = this.dark.height = half * 2;

    // lights and spells (additive)
    for (const L of this.lights) this.glow(this.lightL, L.x, L.y, L.r, L.c, L.a);
    this.drawSpells(sim, alpha);
    for (const v of this.mons.values()) {
      const a = this.anchors.get(v.m.id);
      if (!v.dead && v.m.burn > 0 && a) this.fxImg('fx-flames.jpg', a.x, a.y - 14 * k, 40 * k * (1 + Math.sin(this.time * 14 + v.m.id) * 0.08), { alpha: 0.85 });
    }
    if ((sim.buffs.frostarmor ?? 0) > 0 && !town) this.fxImg('fx-frost-aura.jpg', dhx, dhy - 2 * k, 78 * k, { h: 40 * k, alpha: 0.45 + Math.sin(this.time * 3) * 0.12 });

    this.drawLabels(sim);

    this.world.end(); this.lightL.end(); this.fxL.end(); this.labels.end();
  }

  private drawGround(sim: Sim, x0: number, y0: number, x1: number, y1: number) {
    const V = this.V, area = AREAS[sim.s.zone];
    if (this.groundZone !== sim.s.zone) {
      this.groundZone = sim.s.zone;
      this.groundC.removeChildren().forEach(c => c.destroy());
      const t = tex(area.ground);
      this.groundTile = new TilingSprite({ texture: t, width: 1, height: 1 });
      this.groundC.addChild(this.groundTile);
      this.groundPulse = null;
      if (area.groundPulse) {
        this.groundPulse = new TilingSprite({ texture: t, width: 1, height: 1 });
        this.groundPulse.blendMode = 'add';
        this.groundC.addChild(this.groundPulse);
      }
    }
    this.groundC.setFromMatrix(new Matrix(V.tw / 2, V.th / 2, -V.tw / 2, V.th / 2, V.ox, V.oy));
    for (const g of [this.groundTile, this.groundPulse]) {
      if (!g) continue;
      const size = g.texture.width || 512;
      g.position.set(x0, y0); g.width = x1 - x0 + 1; g.height = y1 - y0 + 1;
      g.tileScale.set(5 / size); g.tilePosition.set(-x0, -y0);
    }
    if (this.groundPulse) this.groundPulse.alpha = 0.1 + Math.sin(this.time * 1.7) * 0.07;
  }

  private drawDecor(type: string, px: number, py: number, v: number, front: boolean) {
    const k = this.V.k, P = PROPS[type];
    if (P) {
      const [n, hh] = P.variants[Math.floor(v * P.variants.length) % P.variants.length];
      const t = tex(n + '.png');
      const H = hh * k * (0.9 + v * 0.25), w = t.width * H / t.height;
      this.shadow(px, py, w * 0.42, w * 0.16, 0.4);
      this.figure(n + '.png', px, py, H, -1, { flip: !P.noFlip && v > 0.5, alpha: front ? 0.45 : 1 });
      const L = P.light;
      if (L) this.light(px, py - H * L.y, L.radius * k, L.color, L.alpha + (L.flicker ? Math.sin(this.time * 13 + v * 9) * L.flicker : 0));
      return;
    }
    const g = this.world.graphics();
    if (type === 'puddle') {
      g.ellipse(px, py, 16 * k, 6 * k).fill({ color: '#0f1c25' });
      g.ellipse(px - 3 * k, py - 1 * k, 8 * k, 2.5 * k).fill({ color: 'rgb(120,160,190)', alpha: 0.12 });
    } else if (type === 'ember') {
      g.moveTo(px - 12 * k, py).lineTo(px - 3 * k, py - 2 * k).lineTo(px + 4 * k, py + 1 * k).lineTo(px + 12 * k, py - 1 * k)
        .stroke({ width: 1.6 * k, color: '#ff6a2a' });
      this.light(px, py, 40 * k, '#ff5a1a', 0.35 + Math.sin(this.time * 3 + v * 7) * 0.1);
    }
  }

  private drawHero(sim: Sim, px: number, py: number) {
    const k = this.V.k, H0 = sim.hero, hv = this.hero, f = H0.f;
    const bob = H0.walking ? Math.abs(Math.sin(hv.anim * 10)) * 1.5 * k : 0;
    const fr = hv.castA > 0 ? 'hero-cast' : H0.walking ? (Math.floor(hv.anim * 5) % 2 ? 'hero-walk1' : 'hero-walk2') : 'hero-idle';
    const H = 88 * k, armor = (sim.buffs.frostarmor ?? 0) > 0;
    if (armor) this.world.graphics().ellipse(px, py, 18 * k, 8 * k).stroke({ width: 1.5 * k, color: '#a6dcf0', alpha: 0.55 });
    this.shadow(px, py, 15 * k, 6 * k, 0.5);
    this.figure(fr + '.png', px, py - bob * 1.5, H, 0, { flip: f < 0, flash: hv.hit / 0.15, fs: 0.3, sy: H0.walking ? 1 : 1 + Math.sin(hv.anim * 2.2) * 0.012 });
    const casting = hv.castA > 0;
    this.light(px + f * H * 0.18, py - H * (casting ? 0.95 : 0.72), (casting ? 80 : 40) * k, casting ? ELC[hv.orb] : '#a36bff', casting ? 0.6 : 0.35);
    if (armor) this.light(px, py - H * 0.5, 45 * k, '#8fd8ff', 0.18);
  }

  private drawMon(v: MonView, px: number, py: number) {
    const m = v.m, d = MONSTERS[m.def], k = this.V.k, rk = RANKS[m.rank], s = k * rk.size, f = m.f, t = v.ph;
    const a = v.dead ? Math.max(0, 1 - v.deadT / 1.5) : 1;
    if (a <= 0) return;
    if (v.dead) py += v.deadT * 4 * k;
    const lg = v.lunge > 0 ? Math.sin(v.lunge / 0.22 * Math.PI) * 5 * s * f : 0;
    px += lg;
    if (m.rank >= 1 && !v.dead) this.world.graphics().ellipse(px, py, 15 * s, 6 * s).stroke({ width: 1.5 * k, color: rk.color, alpha: 0.7 * a });
    this.shadow(px, py, 11 * s, 4.5 * s, 0.45 * a);
    const H = d.height * k * rk.size;
    const walking = m.walking && !v.dead;
    const lift = d.flying ? (6 + Math.sin(t * 2.5) * 4) * k : (walking ? Math.abs(Math.sin(t * 8)) * 3 * k : 0);
    const rot = v.dead ? f * Math.min(1, v.deadT * 3) * 1.2 : (walking && !d.flying ? Math.sin(t * 8) * 0.05 : 0) + (v.lunge > 0 ? 0.14 * f : 0);
    this.figure(d.sprite + '.png', px, py - lift, H, m.id, {
      flip: f !== (d.facesLeft ? -1 : 1), rot, alpha: a, flash: v.hitT / 0.15, chill: m.chill > 0 && !v.dead, sy: walking ? 1 : 1 + Math.sin(t * 2.2) * 0.015,
    });
    const eye = ELC[m.el];
    if (d.flying) this.light(px, py - H * 0.5 - lift, 45 * k, eye, 0.14 * a);
    if (m.boss) this.light(px, py - H * 0.6, 130 * k, ELC[m.el], 0.3 * a);
    if (m.burn > 0 && !v.dead) this.light(px, py - H * 0.4, 35 * k, '#ff6a2a', 0.5);
    if (!v.dead) this.anchors.set(m.id, { x: px, y: py, top: py - H - lift });
  }

  private drawDrop(d: Sim['drops'][number], px: number, py: number) {
    const k = this.V.k, sz = (d.gold ? 22 : 30) * k;
    const file = d.gold ? 'item-gold.png' : `item-${BASE_ICON[d.item!.base]}.png`;
    this.shadow(px, py, sz * 0.35, sz * 0.14, 0.45);
    if (d.item) this.light(px, py - sz * 0.4, (18 + d.item.r * 8) * k, RARITIES[d.item.r].color, d.item.r ? 0.45 : 0.15);
    const s = this.world.sprite(tex(file));
    s.anchor.set(0.5, 0); s.position.set(px, py - sz * 0.85); s.width = s.height = sz;
  }

  private drawSpells(sim: Sim, alpha: number) {
    const k = this.V.k, V = this.V;
    for (const p of sim.projectiles) {
      const [px, py] = this.iso(lerp(p.px, p.x, alpha), lerp(p.py, p.y, alpha));
      const y = py - lerp(p.pz, p.z, alpha) * 26 * k, c = ELC[p.el];
      const tgt = p.target === 'hero' ? this.hero : this.mons.get(p.target);
      const [tx, ty] = tgt ? this.iso(tgt.x, tgt.y) : [px, py];
      const ang = Math.atan2(ty - 26 * k - y, tx - px);
      this.glow(this.fxL, px, y, (p.small ? 16 : 28) * k, c, 0.45);
      if (p.el === 'light') this.fxImg(PROJ.light, px, y, (p.small ? 24 : 34) * k, { rot: this.time * 9 });
      else this.fxImg(PROJ[p.el], px, y, (p.small ? 32 : 58) * k, { rot: ang });
    }
    for (const mt of sim.meteors) {
      const [px, py] = this.iso(mt.x, mt.y), p = Math.min(1, (mt.t + alpha * TICK) / mt.dur);
      const mx = px + (1 - p) * 110 * k, my = py - (1 - p) * 280 * k, rad = SKILLS[mt.skill].radius || 2.5;
      this.fxL.graphics(true).ellipse(px, py, Math.max(0.1, rad * V.tw / 2 * p), Math.max(0.1, rad * V.th / 2 * p)).stroke({ width: 1.5 * k, color: '#ff7a3d', alpha: 0.4 });
      this.glow(this.fxL, mx, my, 40 * k, '#ff7a3d', 0.6);
      this.fxImg('fx-meteor.jpg', mx + 14 * k, my - 14 * k, 90 * k);
    }
    for (const f of this.fx) {
      const e = f.e, p = f.t / f.dur;
      if (e.t === 'burst') {
        const [px, py] = this.iso(e.x, e.y);
        this.fxImg(BURST[e.el], px, py - e.z * 26 * k, e.size * k * (0.55 + 0.6 * p), { alpha: Math.max(0, 1 - p * p) });
      } else if (e.t === 'ring') {
        const [px, py] = this.iso(e.x, e.y), r = e.r0 + (e.r1 - e.r0) * Math.sqrt(p);
        if (e.el === 'gold') { this.fxImg('fx-levelup.jpg', px, py - 40 * k, 140 * k * (0.4 + p), { alpha: 1 - p }); continue; }
        const w2 = r * V.tw * 1.15;
        this.fxImg(RING[e.el], px, py, w2, { h: w2 * 0.55, alpha: Math.min(1, (1 - p) * 1.6) });
      } else if (e.t === 'bolt') {
        const a = 1 - p, g = this.fxL.graphics(true);
        let sd = f.seed, first = true;
        for (let i = 0; i < e.pts.length - 1; i++) {
          const p1 = e.pts[i], p2 = e.pts[i + 1];
          const [ax, ay] = this.iso(p1.x, p1.y), [bx, by] = this.iso(p2.x, p2.y);
          const ay2 = ay - p1.z * 26 * k, by2 = by - p2.z * 26 * k;
          if (first) { g.moveTo(ax, ay2); first = false; }
          for (let j = 1; j <= 6; j++) {
            sd += 1.7;
            const q = j / 6, jit = j < 6 ? Math.sin(sd * 12.9 + this.time * 40) * 10 * k : 0;
            g.lineTo(ax + (bx - ax) * q + jit, ay2 + (by2 - ay2) * q + jit * 0.6);
          }
        }
        g.stroke({ width: 3 * k, color: ELC.light, alpha: a, cap: 'round', join: 'round' });
        g.stroke({ width: 1.2 * k, color: '#ffffff', alpha: a, cap: 'round', join: 'round' });
        for (const q of e.pts.slice(1)) { const [bx, by] = this.iso(q.x, q.y); this.glow(this.fxL, bx, by - q.z * 26 * k, 30 * k, ELC.light, a * 0.6); }
      }
    }
  }

  private drawLabels(sim: Sim) {
    const k = this.V.k, L = this.labels;
    // loot names on the ground
    const lsz = Math.round(11 * k + 1);
    for (const d of sim.drops) {
      const [px, py] = this.iso(d.x, d.y);
      const txt = d.gold ? d.gold + ' Gold' : d.item!.name;
      const box = L.box();
      const t = L.text(txt, FONT_BODY, '700', lsz, d.gold ? '#d8d0c2' : RARITIES[d.item!.r].color);
      const tw = t.width + 8;
      box.rect(px - tw / 2, py - 22 * k, tw, 14 * k + 2).fill({ color: '#000000', alpha: 0.72 });
      t.position.set(px, py - 15 * k + 1);
    }
    // health bars and names
    for (const v of this.mons.values()) {
      const m = v.m, a = this.anchors.get(m.id);
      if (v.dead || !a) continue;
      const bw = (m.rank === 3 ? 60 : 34) * k, by = a.top - 6 * k;
      if (m.hp < m.maxHp || m.rank > 0) {
        const g = L.box();
        g.rect(a.x - bw / 2 - 1, by - 1, bw + 2, 5 * k + 2).fill({ color: '#000000', alpha: 0.7 });
        g.rect(a.x - bw / 2, by, bw * Math.max(0, m.hp) / m.maxHp, 5 * k).fill({ color: '#b3262b' });
        if (m.ward > 0) g.rect(a.x - bw / 2, by, bw * m.ward / m.maxHp, 2 * k).fill({ color: '#a6dcf0' });
      }
      if (m.rank > 0) L.text(m.name, FONT_DISPLAY, '700', lsz, RANKS[m.rank].color).position.set(a.x, by - 9 * k);
    }
    // floating numbers
    for (const fl of this.floats) {
      const [px, py] = this.iso(fl.x, fl.y);
      const t = L.text(fl.text, FONT_BODY, '700', Math.round((fl.big ? 17 : 13) * k + 1), fl.col, true);
      t.position.set(px, py - (40 + fl.t * 34) * k);
      t.alpha = Math.max(0, 1 - fl.t);
    }
  }

  /** Monster the hero is shooting at, or an elite on screen (for the target frame in the HUD). */
  targetMonster(sim: Sim): Monster | null {
    return sim.monsters.find(m => m.id === sim.targetId && m.hp > 0) || sim.monsters.find(m => m.hp > 0 && m.rank >= 2) || null;
  }
}
