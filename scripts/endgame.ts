/**
 * A generated end-game hero for balancing rifts (scripts/simulate.ts --rift). Seeded, no Math.random.
 * Level `lvl`, points spent by a build plan, five rare items picked from many rolls (resistances valued
 * highly because rifts take 80 % off them, like Hell), fitting support gems of a solid level in every skill.
 */
import { GEMS, SKILLS, SLOTS, SOCKET_LEVELS, type Attr, type Slot } from '../src/content/index.ts';
import { gemFits, itemScore } from '../src/sim/formulas.ts';
import { genItemOf } from '../src/sim/items.ts';
import { Rng } from '../src/sim/rng.ts';
import { Sim } from '../src/sim/sim.ts';
import { newSaveState } from '../src/sim/state.ts';
import type { Item, SaveState } from '../src/sim/types.ts';

export const PLANS: Record<string, string[]> = {
  fire: ['fireball', 'pyromancy', 'frostarmor', 'searing', 'meteor', 'fireball', 'pyromancy', 'kindling'],
  cold: ['frostbolt', 'coldmastery', 'frostarmor', 'icenova', 'frostbolt', 'coldmastery', 'permafrost'],
  storm: ['chain', 'conductivity', 'frostarmor', 'nova', 'thunder', 'chain', 'stormmastery'],
};
const ATTR_SHARE: [Attr, number][] = [['vit', 0.4], ['power', 0.3], ['focus', 0.2], ['spirit', 0.1]];
const RES = ['fireRes', 'coldRes', 'lightRes'];

/** Item score for the generator: resistances up to the cap (rifts take 80 % off them, like Hell) and life matter most. */
function gearScore(it: Item, build: string, res: Record<string, number>) {
  const el = build === 'fire' ? 'fire' : build === 'cold' ? 'cold' : 'light';
  const need = (k: string) => Math.max(0, 160 - (res[k] ?? 0));
  let v = itemScore(it);
  for (const [k, x] of it.mods) {
    if (RES.includes(k)) v += Math.min(x, need(k)) * 6;
    if (k === 'allRes') v += RES.reduce((a, r) => a + Math.min(x, need(r)), 0) * 6;
    if (k === 'life') v += x * 3;
    if (k === 'lifePct') v += x * 20;
    if (k === `${el}Dmg` || k === `${el}Pen`) v += x * 1.5;
  }
  return v;
}

export function endgameSave(build = 'fire', lvl = 60, seed = 1, itemLevel = 60, rolls = 400, gemLvl = 6): SaveState {
  const s = newSaveState(), rng = new Rng(seed * 7919 + 13);
  s.lvl = lvl; s.difficulty = 2; s.progress = [6, 6, 6]; s.zone = 5;
  s.gold = 50000; s.hpPot = 30; s.mpPot = 30;
  s.rift.open = true;
  const sim = new Sim(s, { seed, headless: true });
  // attributes and skills
  const pts = (lvl - 1) * 5;
  for (const [k, share] of ATTR_SHARE) sim.addAttr(k, Math.floor(pts * share));
  sim.addAttr('vit', s.attrPts);
  s.skillPts = lvl;
  const plan = PLANS[build];
  while (s.skillPts > 0) {
    const id = plan.find(k => !s.skills[k] && sim.canLearn(k)) ?? plan.filter(k => sim.canLearn(k)).sort((a, b) => (s.skills[a] || 0) - (s.skills[b] || 0))[0];
    if (!id) break;
    sim.learnSkill(id);
  }
  // gear: the best of many rares per slot
  const res: Record<string, number> = {};
  for (const slot of SLOTS as Slot[]) {
    let best: Item | null = null;
    for (let i = 0; i < rolls; i++) {
      const it = genItemOf(rng, s.nextId++, itemLevel, 2, slot);
      if (!best || gearScore(it, build, res) > gearScore(best, build, res)) best = it;
    }
    s.equip[slot] = best;
    for (const [k, x] of best!.mods) { if (RES.includes(k)) res[k] = (res[k] ?? 0) + x; if (k === 'allRes') for (const r of RES) res[r] = (res[r] ?? 0) + x; }
  }
  // gems: the first fitting gems in a fixed preference order
  const prefs = ['echo', 'spread', 'multi', 'wider', 'concentrated', 'chains', `added${build === 'storm' ? 'light' : build}`, 'quick', 'efficiency', 'lingering', 'searingburn', 'deepfreeze', 'overcharge', 'pierce', 'fork'];
  for (const id of Object.keys(s.skills)) {
    if (SKILLS[id].kind === 'passive') continue;
    const arr = sim.socketsOf(id);
    let i = 0;
    for (const g of prefs) {
      if (i >= SOCKET_LEVELS.length || !sim.socketOpen(id, i)) break;
      if (!GEMS[g] || !gemFits(g, id)) continue;
      arr[i++] = { id: s.nextId++, kind: 'gem', gem: g, lvl: gemLvl };
    }
  }
  sim.recalc();
  s.life = sim.st.maxLife; s.mana = sim.st.maxMana;
  return structuredClone(sim.s);
}
