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
import { chooseMod, modChoice, modTierOpen, modTiers } from '../src/sim/skillmods.ts';
import type { Item, SaveState } from '../src/sim/types.ts';

export const PLANS: Record<string, string[]> = {
  // order = learning order and cast slots (first four actives); a skill listed n times gets n shares of the points
  fire: ['fireball', 'pyromancy', 'frostarmor', 'meteor', 'ashenhex', 'searing', 'fireball', 'fireball', 'pyromancy', 'meteor', 'kindling', 'smoulder'],
  lance: ['flamelance', 'pyromancy', 'frostarmor', 'ashenhex', 'fireball', 'flamelance', 'flamelance', 'pyromancy', 'kindling', 'smoulder'],
  cold: ['frostbolt', 'coldmastery', 'frostarmor', 'hailstorm', 'icenova', 'rimeshell', 'frostbolt', 'frostbolt', 'coldmastery', 'hailstorm', 'permafrost', 'brittlefrost'],
  storm: ['chain', 'conductivity', 'stormlantern', 'frostarmor', 'nova', 'stormwisp', 'thunder', 'chain', 'chain', 'conductivity', 'stormmastery', 'capacitor'],
  // the plans from before the skills package (first six skills per element, even spread), for comparison
  fire0: ['fireball', 'pyromancy', 'frostarmor', 'searing', 'meteor', 'fireball', 'pyromancy', 'kindling'],
  cold0: ['frostbolt', 'coldmastery', 'frostarmor', 'icenova', 'frostbolt', 'coldmastery', 'permafrost'],
  storm0: ['chain', 'conductivity', 'frostarmor', 'nova', 'thunder', 'chain', 'stormmastery'],
};
/** Modifier choice per tier (0 = first option, 1 = second) the bots pick; skills not listed take option 0. */
export const MOD_PICKS: Record<string, Record<string, number[]>> = {
  fire: { fireball: [0, 0, 1, 0], searing: [0, 0, 0, 1], meteor: [0, 1, 0, 0], ashenhex: [0, 1, 0, 0], frostarmor: [0, 0, 0, 0] },
  lance: { flamelance: [0, 0, 0, 0], ashenhex: [1, 0, 1, 0] },
  cold: { frostbolt: [0, 1, 0, 1], icenova: [1, 0, 0, 0], hailstorm: [0, 0, 1, 0], rimeshell: [0, 0, 0, 0] },
  storm: { chain: [0, 0, 0, 0], nova: [0, 0, 0, 1], stormwisp: [0, 0, 1, 0], thunder: [0, 0, 0, 0], stormlantern: [0, 0, 1, 0] },
};
/** Next skill to put a point in: unlearned plan skills first, then by weight (times listed in the plan) per level. */
export function nextSkill(sim: Sim, plan: string[]): string | undefined {
  const s = sim.s, w = (k: string) => plan.filter(x => x === k).length;
  return plan.find(k => !s.skills[k] && sim.canLearn(k))
    ?? [...new Set(plan)].filter(k => sim.canLearn(k)).sort((a, b) => w(b) / ((s.skills[b] || 0) + 1) - w(a) / ((s.skills[a] || 0) + 1))[0];
}
/** Cast slots: the first four learned active skills of the plan, sorted automatically. */
export function planSlots(sim: Sim, plan: string[]) {
  const s = sim.s, want = [...new Set(plan)].filter(k => s.skills[k] && !SKILLS[k].kind).slice(0, 4);
  if (!want.length) return;
  const have = s.slots.map(x => x.id).filter(Boolean);
  if (want.every(k => have.includes(k)) && have.length === want.length) return;
  s.slots = [0, 1, 2, 3].map(i => ({ id: want[i] ?? null, cond: 'always' }));
  sim.autoOrder();
}
/** Let the bot pick every open modifier tier of its learned skills. */
export function pickMods(sim: Sim, build: string) {
  const s = sim.s;
  for (const id of Object.keys(s.skills)) for (let i = 0; i < modTiers(id); i++)
    if (modTierOpen(s, id, i) && modChoice(s, id, i) < 0 && !chooseMod(s, id, i, MOD_PICKS[build]?.[id]?.[i] ?? 0)) sim.recalc();
}
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
    const id = nextSkill(sim, plan);
    if (!id) break;
    sim.learnSkill(id);
  }
  planSlots(sim, plan);
  pickMods(sim, build);
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
