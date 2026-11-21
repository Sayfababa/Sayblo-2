/**
 * Small WebAudio synth for loot and combat sounds. No sound files: every sound is built from
 * oscillators and filtered noise. The AudioContext is created on the first user gesture
 * (browser autoplay rules); before that, events are ignored. Volume and mute come from the
 * save settings. Visual/audio only: never touches the simulation.
 */
import type { Settings, SimEvent } from '../sim/types.ts';

type Wave = OscillatorType;

/** Minimum seconds between two sounds of the same kind (keeps 4x speed and big packs calm). */
const GAP: Record<string, number> = { hit: 0.07, kill: 0.09, gold: 0.08, magic: 0.12, rare: 0.2, unique: 0.6, gem: 0.15, level: 0.5, shrine: 0.4, vault: 1, blink: 0.2 };
/** Overall loudness of the synth before the player's volume. */
const MASTER = 0.55;

export class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private noise: AudioBuffer | null = null;
  private last: Record<string, number> = {};
  private vol = -1;

  constructor() {
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  }

  /** Create or resume the audio context (must run inside a user gesture the first time). */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.comp = this.ctx.createDynamicsCompressor();
        this.comp.threshold.value = -18; this.comp.ratio.value = 4;
        this.out = this.ctx.createGain();
        this.out.gain.value = 0;
        this.out.connect(this.comp).connect(this.ctx.destination);
        const n = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate), d = n.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noise = n;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { this.ctx = null; }
  }

  private ready(set: Settings): boolean {
    if (!this.ctx || !this.out || this.ctx.state !== 'running') return false;
    const v = set.sound ? Math.max(0, Math.min(1, set.volume)) : 0;
    if (v !== this.vol) { this.vol = v; this.out.gain.setTargetAtTime(v * v * MASTER, this.ctx.currentTime, 0.02); }
    return v > 0;
  }
  private gate(kind: string): boolean {
    const t = this.ctx!.currentTime;
    if (t - (this.last[kind] ?? -9) < (GAP[kind] ?? 0.05)) return false;
    this.last[kind] = t;
    return true;
  }

  /** One enveloped oscillator: attack, exponential decay, optional pitch glide. */
  private tone(freq: number, dur: number, o: { type?: Wave; gain?: number; at?: number; to?: number; attack?: number; detune?: number } = {}) {
    const c = this.ctx!, t = c.currentTime + (o.at ?? 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const a = o.attack ?? 0.005, peak = o.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.out!);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  /** Short band-passed noise burst. */
  private hiss(freq: number, dur: number, gain: number, q = 1.2, at = 0) {
    const c = this.ctx!, t = c.currentTime + at;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out!);
    src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.02);
  }

  /* ---------- the sounds ---------- */
  gold() { const p = 1 + (Math.random() - 0.5) * 0.08; this.tone(2350 * p, 0.09, { type: 'triangle', gain: 0.12 }); this.tone(3150 * p, 0.12, { type: 'sine', gain: 0.08, at: 0.035 }); }
  magic() { this.tone(660, 0.45, { type: 'triangle', gain: 0.14 }); this.tone(990, 0.5, { gain: 0.07, at: 0.06, detune: 6 }); }
  rare() { this.tone(784, 0.7, { type: 'triangle', gain: 0.16 }); this.tone(1175, 0.8, { gain: 0.1, at: 0.09 }); this.tone(1568, 0.9, { gain: 0.06, at: 0.18 }); }
  /** Deep bell: low partials with bell-like inharmonic ratios, then a bright chime. */
  unique() {
    const f = 98;
    for (const [r, g, d] of [[1, 0.32, 2.6], [2.0, 0.16, 2.0], [2.76, 0.12, 1.6], [5.4, 0.06, 1.0], [8.93, 0.03, 0.7]] as const) this.tone(f * r, d, { gain: g, attack: 0.004 });
    this.tone(1318, 1.2, { type: 'triangle', gain: 0.08, at: 0.25 }); this.tone(1976, 1.2, { gain: 0.05, at: 0.32 });
  }
  gem() { this.tone(1568, 0.5, { gain: 0.1, detune: -8 }); this.tone(2093, 0.55, { gain: 0.08, at: 0.05, detune: 8 }); this.tone(2637, 0.4, { gain: 0.05, at: 0.1 }); }
  hit() { this.hiss(900 + Math.random() * 500, 0.05, 0.06, 0.9); }
  kill(big: boolean) { this.tone(big ? 120 : 170, big ? 0.35 : 0.14, { to: big ? 45 : 70, gain: big ? 0.3 : 0.12 }); this.hiss(400, big ? 0.3 : 0.1, big ? 0.12 : 0.05, 0.7); }
  level() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', gain: 0.12, at: i * 0.08 })); }
  shrine() { [392, 494, 587].forEach((f, i) => this.tone(f, 1.4, { gain: 0.08, attack: 0.15, at: i * 0.05 })); this.hiss(3000, 0.8, 0.03, 0.5); }
  vault() { this.tone(65, 1.8, { to: 98, gain: 0.25, attack: 0.3 }); [262, 330, 392, 523].forEach((f, i) => this.tone(f, 0.9, { type: 'triangle', gain: 0.09, at: 0.4 + i * 0.12 })); }

  /** Play the sounds for this frame's simulation events. */
  consume(events: SimEvent[], set: Settings) {
    if (!events.length || !this.ready(set)) return;
    let hits = 0;
    for (const e of events) {
      switch (e.t) {
        case 'loot':
          if (e.kind === 'gold') { if (this.gate('gold')) this.gold(); }
          else if (e.kind === 'gem') { if (this.gate('gem')) this.gem(); }
          else if (e.r >= 3) { if (this.gate('unique')) this.unique(); }
          else if (e.r === 2) { if (this.gate('rare')) this.rare(); }
          else if (e.r === 1 || e.up) { if (this.gate('magic')) this.magic(); }
          break;
        case 'monHit': if (hits++ < 1 && this.gate('hit')) this.hit(); break;
        case 'kill': if (this.gate('kill')) this.kill(e.rank >= 2 || e.treasure); break;
        case 'levelup': if (this.gate('level')) this.level(); break;
        case 'shrine': if (this.gate('shrine')) this.shrine(); break;
        case 'vault': if (e.open && this.gate('vault')) this.vault(); break;
      }
    }
  }
}
