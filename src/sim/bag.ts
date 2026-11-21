/** Diablo-2-style bag grid: items take up width × height cells. */
import { BAG_H, BAG_W, ITEM_SIZES } from '../content/index.ts';
import { isEquip, isGem, type BagItem } from './types.ts';

export const itemSize = (it: BagItem): [number, number] => ITEM_SIZES[isEquip(it) ? it.slot : it.kind];

function grid(bag: BagItem[], ignore?: BagItem): (BagItem | null)[][] {
  const g: (BagItem | null)[][] = Array.from({ length: BAG_H }, () => Array(BAG_W).fill(null));
  for (const it of bag) {
    if (it === ignore || it.bx == null || it.by == null) continue;
    const [w, h] = itemSize(it);
    for (let y = it.by; y < it.by + h; y++) for (let x = it.bx; x < it.bx + w; x++) if (g[y]) g[y][x] = it;
  }
  return g;
}

export function canPlace(bag: BagItem[], it: BagItem, x: number, y: number): boolean {
  const [w, h] = itemSize(it);
  if (x < 0 || y < 0 || x + w > BAG_W || y + h > BAG_H) return false;
  const g = grid(bag, it);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy][xx]) return false;
  return true;
}

/** First free spot, scanning columns left to right (tall items stack nicely). */
export function findSpot(bag: BagItem[], it: BagItem): [number, number] | null {
  for (let x = 0; x < BAG_W; x++) for (let y = 0; y < BAG_H; y++) if (canPlace(bag, it, x, y)) return [x, y];
  return null;
}

/** Item at a cell. */
export function itemAt(bag: BagItem[], x: number, y: number): BagItem | null {
  return grid(bag)[y]?.[x] ?? null;
}

/** Re-pack the whole bag: big items first, then by kind. Items that do not fit keep no position. */
export function autoSort(bag: BagItem[]): BagItem[] {
  const order = (it: BagItem) => { const [w, h] = itemSize(it); return -(w * h * 10 + h); };
  const kind = (it: BagItem) => (isGem(it) ? 9 : !isEquip(it) ? 8 : ['weapon', 'armor', 'helm', 'amulet', 'ring'].indexOf(it.slot));
  const sorted = bag.slice().sort((a, b) => order(a) - order(b) || kind(a) - kind(b) || (isEquip(a) && isEquip(b) ? b.r - a.r : !isEquip(a) && !isEquip(b) && !isGem(a) && !isGem(b) ? b.tier - a.tier : 0));
  const out: BagItem[] = [];
  for (const it of sorted) {
    it.bx = it.by = undefined;
    const spot = findSpot(out, it);
    if (spot) { [it.bx, it.by] = spot; out.push(it); }
  }
  return out;
}

/** Give every item without a position a free spot. Returns items that found no room. */
export function placeMissing(bag: BagItem[]): BagItem[] {
  const placed: BagItem[] = [], rest: BagItem[] = [], lost: BagItem[] = [];
  for (const it of bag) (it.bx != null && it.by != null && canPlace(placed, it, it.bx, it.by) ? placed : rest).push(it);
  for (const it of rest) {
    it.bx = it.by = undefined;
    const spot = findSpot(placed, it);
    if (spot) { [it.bx, it.by] = spot; placed.push(it); } else lost.push(it);
  }
  bag.splice(0, bag.length, ...placed);
  return lost;
}
