/**
 * Work package C: effects of the three mythic uniques that only drop from the rift pinnacle boss
 * (items.json, pinnacle: true). Numbers in rift.json "mythic". Sim calls these hooks from marked lines.
 *  - Pyrewright's Rod (weapon, offense): more damage per ailment on the target.
 *  - Mantle of the Unburied (armor, defense): cheats death once a minute.
 *  - Seal of the Endless Stair (ring, both): kills stack cast speed and restore barrier.
 */
import { RIFT } from '../content/index.ts';
import type { Stats } from './formulas.ts';
import type { Sim } from './sim.ts';
import type { Monster } from './types.ts';

const M = RIFT.mythic;

/** Damage factor of Pyrewright's Rod against a target (pure, for tests). */
export const ailmentMult = (m: Pick<Monster, 'burn' | 'chill' | 'frozen' | 'shock'>) =>
  1 + M.pyrewright.perAilment * ((m.burn > 0 ? 1 : 0) + (m.chill > 0 || m.frozen > 0 ? 1 : 0) + (m.shock > 0 ? 1 : 0));

export class Mythic {
  /** Mantle: seconds untouchable, seconds until it works again */
  untouchable = 0; cooldown = 0;
  /** Seal: expiry of each stack (seconds left) */
  stacks: number[] = [];
  private sim: Sim;
  constructor(sim: Sim) { this.sim = sim; }
  private has(u: string) { return this.sim.st?.uniques.has(u) ?? false; }

  applyStats(st: Stats) { if (st.uniques.has('stair')) st.castSpeed += M.stair.castSpeed * this.stacks.length; }
  hitMult(m: Monster) { return this.has('pyrewright') ? ailmentMult(m) : 1; }

  tick(dt: number) {
    if (this.untouchable > 0) this.untouchable -= dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (!this.stacks.length) return;
    const n = this.stacks.length;
    this.stacks = this.stacks.map(t => t - dt).filter(t => t > 0);
    if (this.stacks.length !== n) this.sim.recalc();
  }

  onKill() {
    if (!this.has('stair')) return;
    const S = M.stair, sim = this.sim;
    this.stacks.push(S.time);
    if (this.stacks.length > S.max) this.stacks.sort((a, b) => b - a).length = S.max;
    sim.recalc();
    sim.s.barrier = Math.min(sim.maxBarrier(), sim.s.barrier + sim.maxBarrier() * S.barrier);
  }

  /** The hero would die now. Returns true if the Mantle saves her. */
  cheatDeath(): boolean {
    if (!this.has('unburied') || this.cooldown > 0) return false;
    const U = M.unburied, sim = this.sim, h = sim.hero;
    this.untouchable = U.time; this.cooldown = U.cooldown;
    sim.s.life = Math.max(1, Math.round(sim.st.maxLife * U.life));
    sim.s.barrier = sim.maxBarrier();
    sim.emit({ t: 'ring', x: h.x, y: h.y, r0: 0.3, r1: 2.5, dur: 0.8, el: 'cold', fill: true });
    sim.float(h.x, h.y, 'Unburied!', '#a6dcf0', true);
    sim.log('**Mantle of the Unburied**: death lets go of you. Untouchable for a moment.', 'r3');
    return true;
  }

  reset() { this.untouchable = 0; if (this.stacks.length) { this.stacks = []; this.sim.recalc(); } }
}
