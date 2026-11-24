/**
 * Work package D: the bounty board. Always `META.bounties.open` bounties hang there; they never expire.
 * Generation and texts are pure functions of the save and a seeded Rng; progress and claiming are
 * applied by Meta (meta.ts), which knows about kills, drops and shrines.
 */
import {
  AREAS, DEFAULT_CLASS, DIFFICULTIES, ELEMENT_NAMES, META, MONSTERS, SLOT_NAMES, SLOTS, TYRANTS, UNIQUES,
  type BountyKind, type Element, type Mats,
} from '../content/index.ts';
import { uniqueFits } from './items.ts';
import type { Rng } from './rng.ts';
import type { Bounty } from './meta-types.ts';
import type { SaveState } from './types.ts';

const B = META.bounties;
export const BOUNTY_KINDS = Object.keys(B.templates) as BountyKind[];

/** Areas open on the current difficulty (indices). */
const openAreas = (s: SaveState) => Math.max(1, s.progress[s.difficulty] || 1);

/** Elements of the monsters in a list of areas. */
const elementsIn = (areas: number[]) => [...new Set(areas.flatMap(i => AREAS[i].pool.map(p => MONSTERS[p].element)))] as Element[];

/** Area a bounty is for: often the current one, else any open area (optionally only areas with a tyrant). */
function pickArea(rng: Rng, s: SaveState, ok: (i: number) => boolean = () => true): number {
  const all = Array.from({ length: openAreas(s) }, (_, i) => i).filter(ok);
  if (!all.length) return -1;
  if (all.includes(s.zone) && rng.chance(B.currentAreaChance)) return s.zone;
  return rng.pick(all);
}

/** Level of an area on a difficulty (bounty rewards scale with it). */
export const bountyLevel = (diff: number, area: number) => AREAS[area].level + DIFFICULTIES[diff].levelAdd;

export function bountyReward(rng: Rng, kind: BountyKind, diff: number, L: number, cls: string = DEFAULT_CLASS) {
  const R = B.reward, mult = B.templates[kind].reward, mats: Mats = {};
  for (const [k, [base, per]] of Object.entries(R.mats) as [keyof Mats, [number, number]][]) {
    const n = Math.floor((base + per * L) * mult);
    if (n > 0) mats[k] = n;
  }
  if (rng.chance(R.shardChance)) mats.shard = (mats.shard || 0) + rng.int(R.shards[0], R.shards[1]);
  const table = R.uniqueTable.filter(u => UNIQUES[u] && uniqueFits(u, cls) && (UNIQUES[u].lvl ?? 1) <= L); // loot package: class and item level
  return {
    gold: Math.round(R.goldPerLevel * L * DIFFICULTIES[diff].goldMult * mult),
    mats,
    gem: rng.chance(R.gemChance),
    ...(table.length && rng.chance(R.uniqueChance) ? { unique: rng.pick(table) } : {}),
  };
}

/** A new bounty of a kind that is not on the board yet. */
export function genBounty(rng: Rng, s: SaveState, id: number, taken: Set<BountyKind>): Bounty {
  let kinds = BOUNTY_KINDS.filter(k => !taken.has(k));
  if (!kinds.length) kinds = BOUNTY_KINDS;
  for (;;) {
    let w = rng.next() * kinds.reduce((a, k) => a + B.templates[k].weight, 0), kind = kinds[0];
    for (const k of kinds) { w -= B.templates[k].weight; if (w < 0) { kind = k; break; } }
    const T = B.templates[kind], diff = s.difficulty;
    const area = pickArea(rng, s, kind === 'killTyrant' ? i => !!TYRANTS[AREAS[i].id] : undefined);
    if (area < 0) { kinds = kinds.filter(k => k !== kind); continue; }
    const L = bountyLevel(diff, area);
    const b: Bounty = { id, kind, diff, area, L, need: rng.int(T.n[0], T.n[1]), have: 0, reward: bountyReward(rng, kind, diff, L, s.cls) };
    if (kind === 'killElement') b.el = rng.pick(elementsIn(Array.from({ length: openAreas(s) }, (_, i) => i)));
    if (kind === 'findRare') b.slot = rng.pick(SLOTS);
    return b;
  }
}

/** Fill the board up to the open count. */
export function fillBoard(rng: Rng, s: SaveState): Bounty[] {
  const m = s.meta, added: Bounty[] = [];
  while (m.bounties.length < B.open) {
    const b = genBounty(rng, s, m.nextBounty++, new Set(m.bounties.map(x => x.kind)));
    m.bounties.push(b); added.push(b);
  }
  return added;
}

export const bountyDone = (b: Bounty) => b.have >= b.need;

export function bountyText(b: Bounty): string {
  const area = AREAS[b.area], ty = TYRANTS[area.id];
  const diff = b.diff ? ` (${DIFFICULTIES[b.diff].name})` : '';
  return B.templates[b.kind].text
    .replace('{n}', String(b.need))
    .replace('{area}', area.name + (b.kind === 'killArea' || b.kind === 'killTyrant' ? diff : ''))
    .replace('{element}', b.el ? ELEMENT_NAMES[b.el].toLowerCase() : '')
    .replace('{slot}', b.slot ? SLOT_NAMES[b.slot].toLowerCase() : '')
    .replace('{s}', b.need > 1 ? 's' : '')
    .replace('{tyrant}', ty?.name ?? 'the tyrant');
}

/** Gold to swap a bounty for a new one (the board never forces a bounty on you). */
export const swapCost = (b: Bounty) => B.swapGoldPerLevel * b.L;
