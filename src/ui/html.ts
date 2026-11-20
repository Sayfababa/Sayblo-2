/** Small helpers shared by the UI modules. */
import { BASE_ICON, GEMS } from '../content/index.ts';
import { spriteUrl } from '../render/textures.ts';
import { isGem, type BagItem } from '../sim/types.ts';
import { gemColor } from './gemcolor.ts';

export const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
export const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const fmt = (n: number) => (n >= 100000 ? Math.round(n / 1000) + 'k' : n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
/** Log messages mark names with **bold**; everything else is escaped. */
export const richText = (msg: string) => esc(msg).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
export const skillIcon = (id: string) => spriteUrl(`icon-${id}.png`);

/** Picture of an item: sprite for equipment, a cut gem drawn in CSS for support gems. */
export function itemPic(it: BagItem, cls = 'pic'): string {
  if (isGem(it)) return `<span class="${cls} gemicon" style="--gc:${gemColor(it.gem)}" title="${esc(GEMS[it.gem].name)}"><i></i><b>${it.lvl}</b></span>`;
  return `<img class="${cls}" src="${spriteUrl(`item-${BASE_ICON[it.base]}.png`)}" alt="">`;
}
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
export function duration(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m` : `${Math.round(sec)}s`;
}
