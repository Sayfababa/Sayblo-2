/**
 * Economy rules as pure functions: salvage yields, the six crafting embers, corruption and gambling.
 * Nothing here touches the save or the Sim; callers pass an Rng and get a new item back (inputs are never changed).
 * The Sim-side actions live in economy.ts.
 */
import {
  AFFIXES, AFFIX_ROLL, AFFIX_TIERS, ECONOMY, EMBERS, MAT_IDS, RARITIES, UNIQUES,
  type CorruptOutcome, type EmberId, type MatId, type Mats, type Slot,
  getActiveClass,
} from '../content/index.ts';
import { affixValue } from './formulas.ts';
import { affixFits, genItemOf, genUnique, magicName, rareName, rollAffix, tiersFor } from './items.ts';
import type { Rng } from './rng.ts';
import type { Item, Mod } from './types.ts';

export type CraftResult = { ok: true; item: Item; text: string } | { ok: false; err: string };

/* ---------- materials ---------- */
/** What salvaging an item gives. Deterministic, so the UI can show it before the tap. */
export function salvageYield(it: Item): Mats {
  const out: Mats = {};
  for (const [k, [base, per]] of Object.entries(ECONOMY.salvage[it.r] ?? {}) as [MatId, [number, number]][]) {
    const n = Math.floor(base + per * it.L);
    if (n > 0) out[k] = n;
  }
  return out;
}
export const addMats = (a: Mats, b: Mats, mult = 1): Mats => {
  const out: Mats = { ...a };
  for (const k of MAT_IDS) if (b[k]) out[k] = (out[k] || 0) + b[k]! * mult;
  return out;
};
export const canAfford = (have: Mats, cost: Mats) => MAT_IDS.every(k => (have[k] || 0) >= (cost[k] || 0));
export const matsEmpty = (m: Mats) => MAT_IDS.every(k => !m[k]);

/* ---------- helpers ---------- */
const copy = (it: Item): Item => ({ ...it, mods: it.mods.map(m => m.slice() as Mod) });
const tierLevel = (t: number) => AFFIX_TIERS.find(x => x.tier === t)?.level ?? 1;
/** Best tier the item level allows (lowest number). */
export const bestTier = (L: number) => Math.min(...tiersFor(L).map(t => t.tier));
/** Indices of mods that crafting may touch: not the implicit, not the corrupted one. */
export const craftableMods = (it: Item) => it.mods.map((_, i) => i).filter(i => i >= it.imp && i !== it.cm);
const keysOf = (it: Item, skip = -1) => new Set(it.mods.filter((_, i) => i >= it.imp && i !== skip).map(m => m[0]));
const rename = (it: Item) => { if (it.r === 1) it.name = magicName(it.base, it.mods, it.imp); };
const groupCount = (it: Item, g: 'prefix' | 'suffix') => it.mods.filter((m, i) => i >= it.imp && i !== it.cm && AFFIXES[m[0]]?.group === g).length;

/** Material cost of an ember on this item. Grows with item level and with every craft. */
export function craftCost(it: Item, ember: EmberId): Mats {
  const S = ECONOMY.craftScale, mult = (1 + S.perLevel * it.L) * (1 + S.perCraft * (it.cr || 0)), out: Mats = {};
  for (const [k, v] of Object.entries(EMBERS[ember].cost) as [MatId, number][]) out[k] = Math.ceil(v * mult);
  return out;
}

/** Why this item cannot be crafted at all, or null. */
export function craftBlock(it: Item): string | null {
  if (it.unid) return 'Identify it first.';
  if (it.seal) return 'Sealed by corruption. It can no longer be crafted.';
  if (it.r === 3) return 'Uniques cannot be changed at the forge. Try the altar.';
  if (it.r === 0) return 'Normal items have no affixes. Salvage it for dust.';
  return null;
}

/** Why this ember cannot be used on this item (and chosen mod), or null. */
export function emberBlock(it: Item, ember: EmberId, idx: number | null): string | null {
  const b = craftBlock(it);
  if (b) return b;
  const mods = craftableMods(it);
  if (ember === 'bind') return it.r === 1 ? null : 'Only Magic items can be bound into Rares.';
  if (ember === 'change') return mods.some(i => i !== it.wax) ? null : 'No affix left to reroll.';
  if (idx == null) return 'Tap an affix first.';
  if (idx < it.imp) return 'The base stat of an item cannot be changed.';
  if (idx === it.cm) return 'The corrupted affix cannot be changed.';
  if (!mods.includes(idx)) return 'Tap an affix first.';
  const m = it.mods[idx];
  if (ember === 'choice' && idx === it.wax) return 'This affix is sealed with wax.';
  if (ember === 'wax' && idx === it.wax) return 'This affix is already sealed.';
  if (ember === 'rise') {
    const t = m[2] ?? 1;
    if (t <= 1) return 'Already the best tier.';
    if (t - 1 < bestTier(it.L)) return `Item level ${it.L} allows up to T${bestTier(it.L)}. T${t - 1} needs item level ${tierLevel(t - 1)}.`;
  }
  return null;
}

/** Replace mod i with a new random affix of the same group. */
function reroll(rng: Rng, it: Item, i: number) {
  const group = AFFIXES[it.mods[i][0]].group, taken = keysOf(it);
  const m = rollAffix(rng, it.slot, it.L, group, taken) ?? rollAffix(rng, it.slot, it.L, group, keysOf(it, i));
  if (m) it.mods[i] = m;
}

/** Use an ember. `idx` is the chosen mod for embers that need one. */
export function applyEmber(rng: Rng, item: Item, ember: EmberId, idx: number | null = null): CraftResult {
  const err = emberBlock(item, ember, idx);
  if (err) return { ok: false, err };
  const it = copy(item);
  let text = '';
  switch (ember) {
    case 'change': {
      const pool = craftableMods(it).filter(i => i !== it.wax), i = rng.pick(pool);
      const old = it.mods[i][0];
      reroll(rng, it, i);
      text = `${AFFIXES[old].text} became ${AFFIXES[it.mods[i][0]].text}.`;
      if (it.wax != null) { text += ' The wax crumbles.'; it.wax = undefined; }
      break;
    }
    case 'choice': {
      const old = it.mods[idx!][0];
      reroll(rng, it, idx!);
      text = `${AFFIXES[old].text} became ${AFFIXES[it.mods[idx!][0]].text}.`;
      if (it.wax != null) { text += ' The wax crumbles.'; it.wax = undefined; }
      break;
    }
    case 'whet': {
      const m = it.mods[idx!], t = m[2] ?? 1, old = m[1];
      m[1] = affixValue(m[0], tierLevel(t), rng.range(AFFIX_ROLL[0], AFFIX_ROLL[1]));
      text = `${AFFIXES[m[0]].text}: ${old} → ${m[1]}.`;
      break;
    }
    case 'rise': {
      const m = it.mods[idx!], t = m[2] ?? 1, a = AFFIXES[m[0]];
      const raw = a.base + a.perLevel * tierLevel(t);
      const roll = Math.min(AFFIX_ROLL[1], Math.max(AFFIX_ROLL[0], m[1] / raw));
      const v = Math.max(affixValue(m[0], tierLevel(t - 1), roll), m[1]);
      text = `${a.text}: T${t} ${m[1]} → T${t - 1} ${v}.`;
      it.mods[idx!] = [m[0], v, t - 1];
      break;
    }
    case 'bind': {
      const rar = RARITIES[2], want = rng.int(ECONOMY.bindAffixes[0], ECONOMY.bindAffixes[1]);
      const taken = keysOf(it);
      let tries = 0;
      while (craftableMods(it).length < want && tries++ < 10) {
        const np = groupCount(it, 'prefix'), ns = groupCount(it, 'suffix');
        let g: 'prefix' | 'suffix' = rng.chance(0.5) ? 'prefix' : 'suffix';
        if (g === 'prefix' && np >= rar.prefixes!) g = 'suffix';
        if (g === 'suffix' && ns >= rar.suffixes!) g = 'prefix';
        if ((g === 'prefix' ? np : ns) >= (g === 'prefix' ? rar.prefixes! : rar.suffixes!)) break;
        const m = rollAffix(rng, it.slot, it.L, g, taken);
        if (m) it.mods.push(m);
      }
      it.r = 2; it.name = rareName(rng);
      text = `Bound into a Rare: **${it.name}**.`;
      break;
    }
    case 'wax':
      it.wax = idx!;
      text = `${AFFIXES[it.mods[idx!][0]].text} is sealed with wax.`;
      break;
  }
  rename(it);
  it.cr = (it.cr || 0) + 1;
  return { ok: true, item: it, text };
}

/* ---------- corruption ---------- */
export const corruptCost = (it: Item): { mats: Mats; gold: number } => ({ mats: { ...ECONOMY.corruption.cost }, gold: ECONOMY.corruption.goldPerLevel * it.L });
export const CORRUPT_ORDER: CorruptOutcome[] = ['extra', 'double', 'seal', 'replace'];
export function corruptBlock(it: Item): string | null {
  if (it.unid) return 'Identify it first.';
  if (it.cor) return 'This item has already been corrupted.';
  return null;
}

/** Random new affix of any group that fits the slot, for corruption. */
function wildAffix(rng: Rng, it: Item, skip: number, best: boolean): Mod | null {
  const taken = keysOf(it, skip), pool = Object.entries(AFFIXES).filter(([k, a]) => !taken.has(k) && affixFits(k, it.slot) && (a.minLevel ?? 0) <= it.L && (!a.cls || a.cls === getActiveClass())); // classes: +tree affixes
  if (!pool.length) return null;
  const [k] = pool[Math.floor(rng.next() * pool.length)];
  const tiers = tiersFor(it.L), t = best ? tiers[tiers.length - 1] : rng.pick(tiers);
  const C = ECONOMY.corruption, roll = best ? rng.range(C.extraRoll[0], C.extraRoll[1]) : rng.range(AFFIX_ROLL[0], AFFIX_ROLL[1]);
  return [k, affixValue(k, t.level, roll), t.tier];
}

/** Put the item on the altar. Once per item; four outcomes by weight. */
export function corrupt(rng: Rng, item: Item): CraftResult & { outcome?: CorruptOutcome } {
  const err = corruptBlock(item);
  if (err) return { ok: false, err };
  const it = copy(item), W = ECONOMY.corruption.weights;
  let t = rng.next() * CORRUPT_ORDER.reduce((s, k) => s + W[k], 0), outcome: CorruptOutcome = 'seal';
  for (const k of CORRUPT_ORDER) { t -= W[k]; if (t < 0) { outcome = k; break; } }
  const own = it.mods.map((_, i) => i).filter(i => i >= it.imp);
  let text = '';
  if (outcome === 'extra') {
    const m = wildAffix(rng, it, -1, true);
    if (m) { it.mods.push(m); it.cm = it.mods.length - 1; text = `The altar grants more than is allowed: **${AFFIXES[m[0]].text}**.`; }
    else { outcome = 'seal'; }
  }
  if (outcome === 'double') {
    const pool = own.length ? own : it.mods.map((_, i) => i);
    if (pool.length) {
      const i = rng.pick(pool), m = it.mods[i], a = AFFIXES[m[0]];
      const v = m[1] * ECONOMY.corruption.doubleMult;
      m[1] = a.decimals ? Math.round(v * 10 ** a.decimals) / 10 ** a.decimals : Math.round(v);
      it.cm = i;
      text = `Blood doubles **${a.text}**.`;
    } else outcome = 'seal';
  }
  if (outcome === 'replace') {
    const i = own.length ? rng.pick(own) : -1, m = wildAffix(rng, it, i, false);
    if (m && i >= 0) { const old = it.mods[i][0]; it.mods[i] = m; text = `${AFFIXES[old].text} twists into **${AFFIXES[m[0]].text}**. The item is sealed.`; }
    else if (m) { it.mods.push(m); text = `A new affix seeps in: **${AFFIXES[m[0]].text}**. The item is sealed.`; }
    else text = 'Nothing changes. The item is sealed.';
    it.seal = true;
  }
  if (outcome === 'seal') { it.seal = true; text = 'The candles gutter. Nothing changes, but the item is sealed.'; }
  it.cor = CORRUPT_ORDER.indexOf(outcome) + 1;
  it.wax = undefined;
  rename(it);
  return { ok: true, item: it, text, outcome };
}

/* ---------- gambling ---------- */
export function gamblePrice(L: number, slot: Slot): number {
  const G = ECONOMY.gamble;
  return Math.round((G.base + G.perLevel * L + G.perLevelSq * L * L) * G.slotMult[slot]);
}
/** Unidentified item of the chosen slot. Small chance for a unique of that slot. */
export function gambleItem(rng: Rng, id: number, L: number, slot: Slot): Item {
  const G = ECONOMY.gamble, uniques = Object.keys(UNIQUES).filter(u => UNIQUES[u].slot === slot && !UNIQUES[u].pinnacle);
  let it: Item;
  if (uniques.length && rng.chance(G.uniqueChance)) it = genUnique(rng, id, L, rng.pick(uniques));
  else {
    const w = G.rarityWeights;
    let t = rng.next() * w.reduce((a, b) => a + b, 0), r = 0;
    for (; r < w.length - 1; r++) { if (t < w[r]) break; t -= w[r]; }
    it = genItemOf(rng, id, L, r, slot);
  }
  it.unid = true;
  return it;
}
