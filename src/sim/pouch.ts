/**
 * Gem pouch: support gems never go into the bag grid. They sit in a list (SaveState.gems) that holds up to
 * POUCH_SIZE gems and is shown stacked by gem + level. Each gem keeps its own id (sockets hold the gem itself).
 */
import { GEMS, POUCH_SIZE } from '../content/index.ts';
import { keepValue } from './formulas.ts';
import type { GemItem, SaveState } from './types.ts';

export interface GemStack { gem: string; lvl: number; n: number; /** one gem of the stack (the first one) */ top: GemItem }

/** Gems grouped by kind and level: higher level first, then by name. */
export function gemStacks(gems: GemItem[]): GemStack[] {
  const m = new Map<string, GemStack>();
  for (const g of gems) {
    const k = `${g.gem}|${g.lvl}`, st = m.get(k);
    if (st) st.n++; else m.set(k, { gem: g.gem, lvl: g.lvl, n: 1, top: g });
  }
  return [...m.values()].sort((a, b) => b.lvl - a.lvl || GEMS[a.gem].name.localeCompare(GEMS[b.gem].name));
}

/** One gem per kind + level (identical gems are interchangeable), e.g. for the socket picker. */
export const pouchPick = (gems: GemItem[]): GemItem[] => gemStacks(gems).map(st => st.top);

/**
 * Put a gem into the pouch. When it is full, the least valuable gem (maybe the new one) has to go:
 * it is returned so the caller can sell it. Returns null if nothing had to go.
 */
export function addGem(s: SaveState, g: GemItem): GemItem | null {
  g.bx = g.by = undefined;
  s.gems.push(g);
  if (s.gems.length <= POUCH_SIZE) return null;
  const worst = s.gems.slice().sort((a, b) => keepValue(a) - keepValue(b) || b.id - a.id)[0];
  s.gems.splice(s.gems.indexOf(worst), 1);
  return worst;
}

/** Take a gem out of the pouch by id. */
export function takeGem(s: SaveState, id: number): GemItem | null {
  const i = s.gems.findIndex(g => g.id === id);
  return i < 0 ? null : s.gems.splice(i, 1)[0];
}
