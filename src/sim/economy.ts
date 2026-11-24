/**
 * Economy actions on a running game: salvage, forge, altar, gambling vendor, stash.
 * The rules themselves are pure functions in crafting.ts; this module applies them to the save
 * and tells the Sim what changed. All randomness comes from the Sim's seeded Rng.
 */
import { ECONOMY, EMBERS, MAT_IDS, SLOT_NAMES, type EmberId, type Mats, type Slot } from '../content/index.ts';
import { autoSort, findSpot } from './bag.ts';
import { unlockCodex } from './codex.ts';
import { addMats, applyEmber, canAfford, corrupt, corruptCost, gambleItem, gamblePrice, salvageYield } from './crafting.ts';
import { sellValue } from './formulas.ts';
import type { Fate } from './loot.ts';
import type { Sim } from './sim.ts';
import { isEquip, type BagItem, type Item, type SaveState } from './types.ts';

export const matText = (m: Mats) => MAT_IDS.filter(k => m[k]).map(k => `${m[k]} ${k}`).join(', ');

function payMats(s: SaveState, cost: Mats) { for (const k of MAT_IDS) s.mats[k] -= cost[k] || 0; }

/** Get rid of an item that is not kept: salvage (gems are always sold) or sell. Returns gold gained. */
export function disposeItem(s: SaveState, it: BagItem, fate: Fate): number {
  if (fate === 'salvage' && isEquip(it)) { s.mats = addMats(s.mats, salvageYield(it)) as SaveState['mats']; unlockCodex(s, it); return 0; }
  const g = sellValue(it);
  s.gold += g;
  return g;
}

/** Find an item the player may work on: equipped or in the bag. */
export function findItem(s: SaveState, id: number): { it: Item; where: 'equip' | 'bag' } | null {
  for (const it of Object.values(s.equip)) if (it && it.id === id) return { it, where: 'equip' };
  const b = s.bag.find(i => i.id === id);
  return b && isEquip(b) ? { it: b, where: 'bag' } : null;
}

function changed(sim: Sim, where: 'equip' | 'bag') {
  if (where === 'equip') { sim.recalc(); sim.dirty.add('hero'); sim.dirty.add('skills'); }
  sim.dirty.add('bag'); sim.dirty.add('town');
}

/* ---------- salvage ---------- */
export function salvage(sim: Sim, id: number): string | null {
  const s = sim.s, i = s.bag.findIndex(x => x.id === id), it = s.bag[i];
  if (!isEquip(it)) return 'Only equipment can be salvaged.';
  const y = salvageYield(it);
  s.bag.splice(i, 1);
  s.mats = addMats(s.mats, y) as SaveState['mats'];
  sim.loot.stats.salvMats = addMats(sim.loot.stats.salvMats, y); sim.loot.stats.fate.salvage[it.r]++; // loot report
  unlockCodex(s, it); // meta: salvaged uniques fill the codex
  sim.log(`Salvaged **${it.name}** into ${matText(y) || 'nothing'}.`);
  changed(sim, 'bag');
  return null;
}
/** Salvage every item in the bag below a rarity (gems stay). Returns the total. */
export function salvageBelow(sim: Sim, r: number): { n: number; mats: Mats } {
  const s = sim.s;
  let mats: Mats = {}, n = 0;
  s.bag = s.bag.filter(it => {
    if (!isEquip(it) || it.r >= r) return true;
    mats = addMats(mats, salvageYield(it)); n++;
    unlockCodex(s, it); // meta: codex
    return false;
  });
  s.mats = addMats(s.mats, mats) as SaveState['mats'];
  sim.loot.stats.salvMats = addMats(sim.loot.stats.salvMats, mats); // loot report
  if (n) sim.log(`Salvaged ${n} item${n > 1 ? 's' : ''} into ${matText(mats) || 'nothing'}.`, 'good');
  changed(sim, 'bag');
  return { n, mats };
}

/* ---------- forge ---------- */
export function forge(sim: Sim, id: number, ember: EmberId, idx: number | null, cost: Mats): string | null {
  const s = sim.s, f = findItem(s, id);
  if (!f) return 'Item not found.';
  if (!canAfford(s.mats, cost)) return `Not enough materials: ${EMBERS[ember].name} needs ${matText(cost)}.`;
  const res = applyEmber(sim.rng, f.it, ember, idx, ascendLevel(sim));
  if (!res.ok) return res.err;
  payMats(s, cost);
  Object.assign(f.it, res.item);
  sim.log(`${EMBERS[ember].name}: ${res.text}`, 'r2');
  changed(sim, f.where);
  return null;
}

/** Ember of Ascension: the deepest area reached on this difficulty, or the rift the hero is in. */
export const ascendLevel = (sim: Sim) => Math.max(gambleLevel(sim), sim.areaLevel());

/* ---------- altar ---------- */
export function corruptItem(sim: Sim, id: number): { err: string | null; text?: string; outcome?: string } {
  const s = sim.s, f = findItem(s, id);
  if (!f) return { err: 'Item not found.' };
  const c = corruptCost(f.it);
  if (!canAfford(s.mats, c.mats) || s.gold < c.gold) return { err: `The altar asks for ${matText(c.mats)} and ${c.gold} gold.` };
  const res = corrupt(sim.rng, f.it);
  if (!res.ok) return { err: res.err };
  payMats(s, c.mats); s.gold -= c.gold;
  Object.assign(f.it, res.item);
  sim.log(`Altar: ${res.text}`, res.outcome === 'extra' || res.outcome === 'double' ? 'r3' : 'bad');
  changed(sim, f.where);
  return { err: null, text: res.text, outcome: res.outcome };
}

/* ---------- gambling vendor ---------- */
/** Gambling uses the level of the deepest area reached on the current difficulty. */
export const gambleLevel = (sim: Sim) => sim.areaLevel(sim.unlocked - 1);
export function gamble(sim: Sim, slot: Slot): { err: string | null; item?: Item } {
  const s = sim.s, L = gambleLevel(sim), price = gamblePrice(L, slot);
  if (s.gold < price) return { err: `Not enough gold. You need ${price}.` };
  const it = gambleItem(sim.rng, s.nextId++, L, slot);
  if (!placeIn(s.bag, it)) { s.nextId--; return { err: 'No room in the bag.' }; }
  s.gold -= price;
  sim.log(`Bought an unidentified ${SLOT_NAMES[slot]} for ${price} gold.`);
  changed(sim, 'bag');
  return { err: null, item: it };
}
export function identify(sim: Sim, id: number): void {
  const f = findItem(sim.s, id);
  if (!f || !f.it.unid) return;
  f.it.unid = undefined;
  sim.log(`Identified **${f.it.name}**.`, 'r' + f.it.r);
  changed(sim, f.where);
}

/* ---------- stash ---------- */
/** Place into a grid (re-sorting it once if needed). Mutates the array. */
function placeIn(grid: BagItem[], it: BagItem): boolean {
  let spot = findSpot(grid, it);
  if (!spot) { const sorted = autoSort(grid); grid.splice(0, grid.length, ...sorted); spot = findSpot(grid, it); }
  if (!spot) return false;
  [it.bx, it.by] = spot;
  grid.push(it);
  return true;
}
export function toStash(sim: Sim, id: number, tab: number): string | null {
  const s = sim.s, i = s.bag.findIndex(x => x.id === id), grid = s.stash[tab];
  if (i < 0 || !grid) return 'Item not found.';
  const it = s.bag[i], keep = [it.bx, it.by];
  s.bag.splice(i, 1);
  it.bx = it.by = undefined;
  if (!placeIn(grid, it)) { [it.bx, it.by] = keep; s.bag.push(it); return `Stash tab ${ECONOMY.stash.names[tab]} is full.`; }
  changed(sim, 'bag');
  return null;
}
export function fromStash(sim: Sim, id: number, tab: number): string | null {
  const s = sim.s, grid = s.stash[tab], i = grid ? grid.findIndex(x => x.id === id) : -1;
  if (i < 0) return 'Item not found.';
  const it = grid[i], keep = [it.bx, it.by];
  grid.splice(i, 1);
  it.bx = it.by = undefined;
  if (!placeIn(s.bag, it)) { [it.bx, it.by] = keep; grid.push(it); return 'No room in the bag.'; }
  changed(sim, 'bag');
  return null;
}
export function sortStash(sim: Sim, tab: number) {
  const s = sim.s;
  if (s.stash[tab]) s.stash[tab] = autoSort(s.stash[tab]);
  sim.dirty.add('town');
}
