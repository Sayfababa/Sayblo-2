/** Work package A (Feel), DOM side: shrine/vault buffs in the HUD, bag badges, sound settings. */
import { FEEL, SHRINES, type Slot } from '../content/index.ts';
import type { Sim } from '../sim/sim.ts';
import { isGem, type BagItem, type Item, type SaveState } from '../sim/types.ts';
import { hasPerfect, isUpgrade } from '../sim/upgrade.ts';
import { esc } from './html.ts';

/** Extra entries for the buff bar: active shrines, the vault and the Frost Aura chill. */
export function feelBuffs(sim: Sim): string[] {
  const out: string[] = [], F = sim.feel;
  for (const [id, t] of Object.entries(F.buffs)) {
    const S = SHRINES[id];
    if (!S || t <= 0) continue;
    const left = F.buffMax[id] ? t / F.buffMax[id] : 1;
    out.push(`<span class="buff shrinebuff" style="--sc:${S.color};--left:${left.toFixed(3)}" title="${esc(S.name)}: ${esc(S.text)}"><i class="srune" aria-hidden="true"></i><span class="bname">${esc(S.name.replace(/^Shrine of /, ''))}</span><b>${Math.ceil(t)}</b></span>`);
  }
  if (F.vault) out.push(`<span class="buff vaultbuff" title="${esc(FEEL.vault.name)}: denser waves, chests and more gold"><i class="srune" aria-hidden="true"></i><span class="bname">Vault</span><b>${Math.ceil(F.vault.t)}</b></span>`);
  if (F.heroChill > 0) out.push(`<span class="buff chillbuff" title="Chilled by a Frost Aura: slower casting"><span class="bname">Chilled</span></span>`);
  return out;
}

/** Small corner badges on a bag item: green upgrade arrow, perfect-roll star. */
export function bagBadges(it: BagItem, equip: Record<Slot, Item | null>): string {
  if (isGem(it)) return '';
  return (isUpgrade(it, equip[it.slot]) ? '<i class="upg" title="Upgrade over your equipped item"></i>' : '')
    + (hasPerfect(it) ? '<i class="perf" title="Has a perfect roll"></i>' : '');
}

/** Sound options for the Display section in Town. */
export function soundSettings(s: SaveState): string {
  const v = Math.round(s.settings.volume * 100);
  return `<label class="check" for="sound"><input type="checkbox" id="sound" ${s.settings.sound ? 'checked' : ''}> Sound effects</label>
    <label class="range" for="volume"><span>Volume</span><b id="volumev">${v}%</b><input type="range" id="volume" min="0" max="100" step="5" value="${v}"></label>`;
}
/** Handles the sound inputs; returns true if the element was one of them. */
export function soundInput(t: HTMLInputElement, s: SaveState): boolean {
  if (t.id === 'sound') { s.settings.sound = t.checked; return true; }
  if (t.id === 'volume') {
    s.settings.volume = Math.max(0, Math.min(1, +t.value / 100));
    const l = document.getElementById('volumev');
    if (l) l.textContent = t.value + '%';
    return true;
  }
  return false;
}
