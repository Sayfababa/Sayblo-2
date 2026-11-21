/**
 * Work package D (Meta progression): saved state, its defaults and its sanitizer.
 * Kept apart from meta.ts so types.ts, state.ts and save.ts can use it without pulling in the Sim.
 */
import {
  AREAS, DIFFICULTIES, ELEMENTS, EMBER_TRACKS, FEATS, MAT_IDS, META, SLOTS, TYRANTS, UNIQUES,
  type BountyKind, type Element, type EmberTrack, type Mats, type Slot,
} from '../content/index.ts';

export interface BountyReward { gold: number; mats: Mats; gem: boolean; unique?: string }
export interface Bounty {
  id: number; kind: BountyKind;
  /** difficulty and area index the bounty was made for (its rewards scale with that area level) */
  diff: number; area: number; L: number;
  el?: Element; slot?: Slot;
  need: number; have: number;
  reward: BountyReward;
}

export interface MetaSave {
  bounties: Bounty[]; nextBounty: number;
  /** kills since the last tyrant, by "difficulty:areaId" */
  tyrant: Record<string, number>;
  /** tyrants defeated, by area id */
  slain: Record<string, number>;
  /** unique ids whose effect is unlocked (by salvaging one) */
  codex: string[];
  /** ember points after the level cap: earned in total, and spent per track */
  ember: { earned: number; alloc: Record<EmberTrack, number> };
  feats: string[]; title: string | null;
  /** counters for feats (elites, bosses, tyrants, wretches, vaults, uniques, perfects, imprints, corrupted, bounties, events, shrines) */
  stats: Record<string, number>;
  /** HUD bounty tracker visible */
  tracker: boolean;
}

/** Per-monster state of meta features. */
export interface MonMeta {
  /** area id of the tyrant this monster is, and its mechanic timer */
  ty?: string; mechT?: number;
  /** trapped champion: inert while its casing (ward) holds */
  champion?: boolean; encased?: boolean;
}

export const emptyAlloc = (): Record<EmberTrack, number> => Object.fromEntries(EMBER_TRACKS.map(t => [t, 0])) as Record<EmberTrack, number>;

export function newMeta(): MetaSave {
  return {
    bounties: [], nextBounty: 1, tyrant: {}, slain: {}, codex: [],
    ember: { earned: 0, alloc: emptyAlloc() }, feats: [], title: null, stats: {}, tracker: true,
  };
}

type Raw = Record<string, unknown>;
const num = (x: unknown, def: number, min = 0, max = Infinity) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def);
const int = (x: unknown, def = 0, min = 0, max = Infinity) => Math.floor(num(x, def, min, max));
const counters = (x: unknown, ok: (k: string) => boolean) => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries((x && typeof x === 'object' ? x : {}) as Raw)) if (ok(k)) { const n = int(v); if (n > 0) out[k] = n; }
  return out;
};

function sanitizeBounty(x: unknown): Bounty | null {
  const b = x as Raw;
  if (!b || typeof b !== 'object' || typeof b.kind !== 'string' || !(b.kind in META.bounties.templates)) return null;
  const diff = int(b.diff, 0, 0, DIFFICULTIES.length - 1), area = int(b.area, 0, 0, AREAS.length - 1);
  const r = (b.reward || {}) as Raw, rm = (r.mats || {}) as Raw, mats: Mats = {};
  for (const k of MAT_IDS) { const n = int(rm[k]); if (n) mats[k] = n; }
  const out: Bounty = {
    id: int(b.id, 0), kind: b.kind as BountyKind, diff, area, L: int(b.L, 1, 1),
    need: int(b.need, 1, 1), have: int(b.have, 0),
    reward: { gold: int(r.gold), mats, gem: r.gem === true, ...(typeof r.unique === 'string' && UNIQUES[r.unique] ? { unique: r.unique } : {}) },
  };
  out.have = Math.min(out.have, out.need);
  if (out.kind === 'killElement') { if (!ELEMENTS.includes(b.el as Element)) return null; out.el = b.el as Element; }
  if (out.kind === 'findRare') { if (!SLOTS.includes(b.slot as Slot)) return null; out.slot = b.slot as Slot; }
  if (out.kind === 'killTyrant' && !TYRANTS[AREAS[area].id]) return null;
  return out;
}

/** Keep only valid values; anything broken falls back to the defaults. */
export function sanitizeMeta(x: unknown): MetaSave {
  const d = newMeta();
  if (!x || typeof x !== 'object') return d;
  const m = x as Raw;
  const bounties = (Array.isArray(m.bounties) ? m.bounties : []).map(sanitizeBounty).filter((b): b is Bounty => !!b).slice(0, META.bounties.open);
  const ids = new Set<number>();
  for (const b of bounties) { if (!b.id || ids.has(b.id)) b.id = 0; ids.add(b.id); }
  let next = int(m.nextBounty, 1, 1);
  for (const b of bounties) { if (!b.id) b.id = next++; next = Math.max(next, b.id + 1); }
  const e = (m.ember || {}) as Raw, alloc = (e.alloc || {}) as Raw;
  const ember = { earned: int(e.earned), alloc: emptyAlloc() };
  for (const t of EMBER_TRACKS) ember.alloc[t] = int(alloc[t]);
  // never more points spent than earned
  if (EMBER_TRACKS.reduce((a, t) => a + ember.alloc[t], 0) > ember.earned) ember.alloc = emptyAlloc();
  const feats = [...new Set((Array.isArray(m.feats) ? m.feats : []).filter((f): f is string => typeof f === 'string' && !!FEATS[f]))];
  const title = typeof m.title === 'string' && feats.includes(m.title) && FEATS[m.title].title ? m.title : null;
  return {
    bounties, nextBounty: next,
    tyrant: counters(m.tyrant, k => /^\d+:/.test(k) && !!TYRANTS[k.slice(k.indexOf(':') + 1)]),
    slain: counters(m.slain, k => !!TYRANTS[k]),
    codex: [...new Set((Array.isArray(m.codex) ? m.codex : []).filter((u): u is string => typeof u === 'string' && !!UNIQUES[u]))],
    ember, feats, title,
    stats: counters(m.stats, () => true),
    tracker: m.tracker !== false,
  };
}
