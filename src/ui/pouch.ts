/**
 * Gem pouch view in the bag panel: support gems stacked by kind + level ("×3"), and the tooltip
 * actions for a stack (socket into a fitting skill, fuse three, sell one). Data: SaveState.gems (sim/pouch.ts).
 */
import { GEMS, GEM_MAX_LEVEL, POUCH_SIZE, SKILLS, isPassive } from '../content/index.ts';
import { gemFits, sellValue } from '../sim/formulas.ts';
import { gemStacks } from '../sim/pouch.ts';
import type { Sim } from '../sim/sim.ts';
import type { GemItem } from '../sim/types.ts';
import { esc, fmt, ic, itemPic } from './html.ts';
import { itemTooltip } from './tooltip.ts';
import { gemColor } from './gemcolor.ts';

/** "12 / 150" for the panel header. */
export const pouchCount = (sim: Sim) => `${sim.s.gems.length} / ${POUCH_SIZE}`;

/** Stack key of a gem: "quick|2". */
export const stackKey = (g: { gem: string; lvl: number }) => `${g.gem}|${g.lvl}`;

/** The pouch: a wrapping grid of gem tiles, each with level and count. */
export function pouchHtml(sim: Sim, sel: string | null): string {
  const stacks = gemStacks(sim.s.gems);
  if (!stacks.length) return '<p class="hint pouchempty">No support gems yet. Champions, elites and bosses drop them more often. They go into this pouch, never into the bag grid.</p>';
  return `<div class="pouch">${stacks.map(st => `<button class="gstack ${stackKey(st) === sel ? 'sel' : ''}" style="--gc:${gemColor(st.gem)}" data-act="gstack:${stackKey(st)}"
    aria-label="${esc(GEMS[st.gem].name)} level ${st.lvl}, ${st.n}">${itemPic(st.top, 'pic')}${st.n > 1 ? `<b class="gn">×${st.n}</b>` : ''}</button>`).join('')}</div>`;
}

/** Tooltip for the selected stack, or '' if it is gone. */
export function pouchTip(sim: Sim, key: string | null): string {
  if (!key) return '';
  const s = sim.s, g = s.gems.find(x => stackKey(x) === key);
  if (!g) return '';
  const n = s.gems.filter(x => stackKey(x) === key).length;
  const learned = Object.keys(s.skills);
  const quick = learned.filter(k => !isPassive(k) && gemFits(g.gem, k)).flatMap(k => {
    const i = sim.socketsOf(k).findIndex((o, j) => !o && sim.socketOpen(k, j));
    if (i < 0 || sim.socketsOf(k).some(o => o?.gem === g.gem)) return [];
    return [`<button class="btn primary" data-act="sock:${k}:${i}:${g.id}">Socket into ${esc(SKILLS[k].name)}</button>`];
  }).join('');
  const fuse = n >= 3 && g.lvl < GEM_MAX_LEVEL
    ? `<button class="btn" data-act="fuse:${g.gem}:${g.lvl}" ${s.gold < sim.fuseCost(g.lvl) ? 'disabled' : ''}>Fuse 3 → Lv ${g.lvl + 1} · ${fmt(sim.fuseCost(g.lvl))}g</button>` : '';
  const sell = `<button class="btn" data-act="gsell:${g.id}">${ic('sell')}Sell one · ${sellValue(g)}g</button>`;
  return itemTooltip(g as GemItem, null, `${quick}${fuse}${sell}`, { learned }).replace('<div class="tipbase">', `<div class="tipbase">${n > 1 ? `<b>×${n}</b> · ` : ''}`);
}
