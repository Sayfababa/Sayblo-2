/**
 * Work package D: how ember points, feat bonuses and the stat-like unique effects change the hero's stats.
 * Called from calcStats in two places: `metaMods` adds modifiers before the stats are computed,
 * `metaPost` adjusts finished stats. Pure functions; no Sim, no randomness.
 */
import { ELEMENTS, EMBER_TRACKS, FEATS, HERO, META } from '../content/index.ts';
import type { Stats } from './formulas.ts';
import type { SaveState } from './types.ts';

/** Unique effects that are plain stat changes (the others live where they act: skillCtx, sim, meta.ts). */
const UNIQUE_MODS: Record<string, Record<string, number>> = {
  oathbreaker: { plusEmber: 1, plusFrost: 1, plusStorm: 1, allRes: -15 },
  lamplighter: { barrierRegen: 100 },
  ninthbell: { elemDR: 8 },
  choireye: { firePen: 12, coldPen: 12, lightPen: 12 },
};
/** Raised elemental damage reduction cap of the Gravecloth of the Ninth Bell. */
const NINTH_BELL_CAP = 40;
const LAMPLIGHTER_BARRIER = 1.3;

/** Ember points spent in tracks, as modifiers. */
export function emberMods(s: SaveState): Record<string, number> {
  const out: Record<string, number> = {}, alloc = s.meta?.ember.alloc;
  if (!alloc) return out;
  for (const t of EMBER_TRACKS) {
    const n = alloc[t] || 0;
    if (n) for (const [k, v] of Object.entries(META.ember.tracks[t].per)) out[k] = (out[k] || 0) + v * n;
  }
  return out;
}

/** Add meta modifiers (ember tracks, feat bonuses, stat-like unique effects) to the item modifiers. */
export function metaMods(s: SaveState, uniques: Set<string>, add: (k: string, v: number) => void) {
  for (const [k, v] of Object.entries(emberMods(s))) add(k, v);
  for (const id of s.meta?.feats ?? []) for (const [k, v] of Object.entries(FEATS[id]?.bonus ?? {})) add(k, v);
  for (const u of uniques) for (const [k, v] of Object.entries(UNIQUE_MODS[u] ?? {})) add(k, v);
}

/** Final touches on computed stats. */
export function metaPost(st: Stats): Stats {
  const m = st.mods, U = st.uniques;
  if (m.manaRegenPct) st.manaRegen *= 1 + m.manaRegenPct / 100;
  if (U.has('lamplighter')) st.barrier = Math.round(st.barrier * LAMPLIGHTER_BARRIER);
  if (U.has('mourncowl')) for (const e of ELEMENTS) st.res[e] = Math.max(0, st.res[e]);
  if (U.has('ninthbell')) st.elemDR = Math.min(Math.max(HERO.caps.elemDR, NINTH_BELL_CAP), m.elemDR || 0);
  return st;
}
