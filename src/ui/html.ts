/** Small helpers shared by the UI modules. */
import { BASE_ICON, GEMS } from '../content/index.ts';
import { spriteUrl } from '../render/textures.ts';
import { isGem, isKey, type BagItem } from '../sim/types.ts';
import { GEM_ART, gemColor } from './gemcolor.ts';

export const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
export const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const fmt = (n: number) => (n >= 100000 ? Math.round(n / 1000) + 'k' : n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
/** Log messages mark names with **bold**; everything else is escaped. */
export const richText = (msg: string) => esc(msg).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
export const skillIcon = (id: string) => spriteUrl(`icon-${id}.png`);

/** Picture of an item: sprite for equipment, a cut gem drawn in CSS for support gems.
 *  `tall`: staffs stand upright (for the 1×3 bag cell and the weapon slot). */
export function itemPic(it: BagItem, cls = 'pic', tall = false): string {
  if (isGem(it)) {
    const art = GEM_ART.has(it.gem) ? `<img src="${spriteUrl(`gem-${it.gem}.png`)}" alt="">` : '<i></i>';
    return `<span class="${cls} gemicon ${GEM_ART.has(it.gem) ? 'art' : ''}" style="--gc:${gemColor(it.gem)}" title="${esc(GEMS[it.gem].name)}">${art}<b>${it.lvl}</b></span>`;
  }
  if (isKey(it)) return `<span class="${cls} keyicon"><img src="${spriteUrl('item-key.png')}" alt=""><b>${it.tier}</b></span>`;
  if (it.unid) return `<img class="${cls}" src="${spriteUrl('parcel.png')}" alt="Unidentified">`;
  return `<img class="${cls}" src="${spriteUrl(`item-${BASE_ICON[it.base]}${tall && it.slot === 'weapon' ? '-tall' : ''}.png`)}" alt="">`;
}
/** Rarity class of a bag tile: gem, key or r0-r3. */
export const bagCls = (it: BagItem) => (isGem(it) ? 'gem' : isKey(it) ? 'key' : 'r' + it.r);
/** Small painted UI icon (public/sprites/ic-*.png). */
export const ic = (name: string, alt = '', cls = 'ic') => `<img class="${cls}" src="${spriteUrl(`ic-${name}.png`)}" alt="${esc(alt)}">`;
/** Header plaque of a menu panel. */
export const phead = (title: string, right = '') => `<div class="phead"><div class="plate"><h2>${title}</h2>${right ? `<span class="pright">${right}</span>` : ''}</div><button class="close" data-act="close" aria-label="Close menu"></button></div>`;
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
export function duration(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m` : `${Math.round(sec)}s`;
}
