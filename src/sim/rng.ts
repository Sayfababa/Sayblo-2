/** Small seeded random generator (mulberry32). The simulation only uses this, never Math.random. */
export class Rng {
  state: number;
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) { this.state = seed >>> 0; }
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** float in [a, b) */
  range(a: number, b: number): number { return a + this.next() * (b - a); }
  /** integer in [a, b] */
  int(a: number, b: number): number { return Math.floor(this.range(a, b + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]; }
  shuffle<T>(a: readonly T[]): T[] {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    return r;
  }
}
