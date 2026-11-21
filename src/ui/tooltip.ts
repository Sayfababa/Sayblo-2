/** Item tooltips with a stat comparison against the equipped item. */
import { AFFIXES, GEMS, RARITIES, SKILLS, SLOT_NAMES, UNIQUES, isPassive } from '../content/index.ts';
import { formatMod, gemFits, gemText, sellValue } from '../sim/formulas.ts';
import { isGem, type BagItem, type Item, type Mod } from '../sim/types.ts';
import { esc, itemPic } from './html.ts';
import { gemColor } from './gemcolor.ts';

function sumMods(it: Item | null): Record<string, number> {
  const m: Record<string, number> = {};
  if (it) for (const [k, v] of it.mods) m[k] = Math.round(((m[k] || 0) + v) * 10) / 10;
  return m;
}

/** Lines like "▲ +12 to Life" for every stat that changes when swapping `cur` for `it`. */
export function compareLines(it: Item, cur: Item | null): string {
  if (!cur) return '<p class="cmpnote">Nothing equipped in this slot.</p>';
  const a = sumMods(it), b = sumMods(cur);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  const rows = keys.map(k => {
    const d = Math.round(((a[k] || 0) - (b[k] || 0)) * 10) / 10;
    if (!d) return '';
    const txt = formatMod([k, Math.abs(d)]).replace(/^\+/, d > 0 ? '+' : '−');
    return `<li class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${txt}</li>`;
  }).filter(Boolean);
  const lost = cur.u ? `<li class="down">▼ loses: ${esc(UNIQUES[cur.u].effect)}</li>` : '';
  if (!rows.length && !lost) return '<p class="cmpnote">Same stats as the equipped item.</p>';
  return `<ul class="cmp">${rows.join('')}${lost}</ul>`;
}

const modLine = (m: Mod, imp: boolean, mark = '') => {
  const t = m[2];
  return `<li class="${imp ? 'imp' : AFFIXES[m[0]]?.group ?? ''} ${mark}">${formatMod(m as [string, number])}${t ? `<span class="tier" title="Tier ${t} of 5 (1 is best)">T${t}</span>` : ''}</li>`;
};
/** Extra class for a mod line: corrupted (added or doubled by the altar) or protected by Sealing Wax. */
export const modMark = (it: Item, i: number) => (i === it.cm ? 'cor' : i === it.wax ? 'waxed' : '');
/** Corruption / seal notes under the mods. */
export const corruptNote = (it: Item) => (it.cor ? `<p class="corrupt">Corrupted${it.seal ? ' · sealed, cannot be crafted' : ''}</p>` : '');

export function itemTooltip(it: BagItem, equipped: Item | null, actions: string, opts: { compare?: boolean; learned?: string[] } = {}): string {
  if (isGem(it)) {
    const fits = (opts.learned ?? []).filter(s => !isPassive(s) && gemFits(it.gem, s)).map(s => SKILLS[s].name);
    const req = GEMS[it.gem].requires;
    return `<div class="tip" style="--rc:${gemColor(it.gem)}">
      <div class="tiphead">${itemPic(it, 'tippic')}<div><b class="tipname" style="color:${gemColor(it.gem)}">${esc(GEMS[it.gem].name)}</b>
        <div class="tipbase">Support gem · level ${it.lvl} · mana ×${GEMS[it.gem].mana}</div></div></div>
      <p class="tiptext">${esc(gemText(it))}</p>
      <p class="tipsub">${req.length ? `Fits skills with: ${req.map(t => `<span class="chip">${t}</span>`).join(' ')}` : 'Fits any active skill.'}</p>
      <p class="tipsub">${fits.length ? `Your skills it fits: ${esc(fits.join(', '))}` : 'None of your learned skills can take it yet.'}</p>
      <p class="tipsub">Socket it in the Skills menu. Three gems of the same kind and level can be fused in Town. Sells for ${sellValue(it)} gold.</p>
      <div class="tipact">${actions}</div></div>`;
  }
  const rar = RARITIES[it.r];
  if (it.unid) return `<div class="tip unid" style="--rc:${rar.color}">
    <div class="tiphead">${itemPic(it, 'tippic')}<div><b class="tipname" style="color:${rar.color}">Unidentified ${SLOT_NAMES[it.slot]}</b>
      <div class="tipbase">${rar.name} ${SLOT_NAMES[it.slot]} · ${esc(it.base)} · item level ${it.L}</div></div></div>
    <ul class="mods">${it.mods.slice(0, it.imp).map(m => modLine(m, true)).join('')}</ul>
    <p class="tipsub">Its affixes are hidden. Identify it to see what you got.</p>
    <div class="tipact">${actions}</div></div>`;
  return `<div class="tip" style="--rc:${rar.color}">
    <div class="tiphead">${itemPic(it, 'tippic')}<div><b class="tipname" style="color:${rar.color}">${esc(it.name)}</b>
      <div class="tipbase">${rar.name} ${SLOT_NAMES[it.slot]}${it.r ? ' · ' + esc(it.base) : ''} · item level ${it.L}</div></div></div>
    <ul class="mods">${it.mods.map((m, i) => modLine(m, i < it.imp, modMark(it, i))).join('')}</ul>
    ${it.u ? `<p class="unique">${esc(UNIQUES[it.u].effect)}</p>` : ''}
    ${corruptNote(it)}
    ${opts.compare ? `<div class="vs"><h4>Compared with equipped</h4>${compareLines(it, equipped)}</div>` : ''}
    <div class="tipact">${actions}</div></div>`;
}
