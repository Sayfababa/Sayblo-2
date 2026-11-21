/**
 * Work package C (Rifts), UI side: the Rifts town view (keys, free key, pinnacle, auto mode, personal bests,
 * dev tools), the atlas tree, the key tooltip, the HUD line with timer and progress, and the result card.
 * Owns its own selection state; ui.ts only forwards clicks, events and draws.
 */
import { AREAS, ATLAS_NODES, KEY_MODS, RARITIES, RIFT } from '../content/index.ts';
import {
  atlasBlock, atlasEarned, atlasFx, fxv, atlasFree, atlasRespecCost, atlasSpent, bagKeys, keyName, keyReward, keyRisk, pinnacleOpen, pinnacleTier, riftLevel,
} from '../sim/rift.ts';
import { sellValue } from '../sim/formulas.ts';
import type { Sim } from '../sim/sim.ts';
import type { KeyItem, RiftResult, SaveState, SimEvent } from '../sim/types.ts';
import { $, esc, fmt, itemPic } from './html.ts';

export const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const skulls = (n: number) => (n ? `<span class="skulls" title="Risk ${n}">${'☠'.repeat(Math.min(n, 8))}</span>` : '<span class="skulls safe">no risk</span>');

/** Modifier list of a key: hazards red, boons green, then the reward the hazards pay. */
export function keyModsHtml(mods: string[], s: SaveState): string {
  const rew = keyReward(mods, s.rift.atlas);
  const lines = mods.map(m => {
    const d = KEY_MODS[m];
    return `<li class="${d.kind}">${d.kind === 'hazard' ? '☠'.repeat(d.risk) + ' ' : '✦ '}${esc(d.text)}</li>`;
  }).join('');
  const reward = keyRisk(mods) ? `<p class="krew">Reward for the risk: <b>+${rew.qty}%</b> item quantity · <b>+${rew.rarity}%</b> rarity · <b>+${rew.xp}%</b> experience</p>` : '';
  return `${lines ? `<ul class="kmods">${lines}</ul>` : '<p class="hint">No modifiers: a plain rift.</p>'}${reward}`;
}

/** Bag/stash tooltip of a key. */
export function keyTooltip(k: KeyItem, s: SaveState, actions: string): string {
  return `<div class="tip" style="--rc:${RARITIES[2].color}">
    <div class="tiphead">${itemPic(k, 'tippic')}<div><b class="tipname" style="color:${RARITIES[2].color}">${esc(keyName(k))}</b>
      <div class="tipbase">Monster level ${riftLevel(k.tier)} · ${skulls(keyRisk(k.mods))}</div></div></div>
    ${keyModsHtml(k.mods, s)}
    <p class="tipsub">Open it in Town › Rifts or here. Dying in the rift loses the key. Sells for ${sellValue(k)} gold.</p>
    <div class="tipact">${actions}</div></div>`;
}

/** HUD line and progress bar while in a rift (null outside). */
export function riftHud(sim: Sim): { meta: string; prog: number; late: boolean } | null {
  const r = sim.rift.run;
  if (!r) return null;
  const t = r.done ? r.doneT : r.t;
  const what = r.done ? 'Cleared · collecting loot' : r.guardian != null ? (r.pin ? 'Pinnacle' : 'Guardian!') : `${Math.floor((r.progress / r.need) * 100)}%`;
  const time = r.pin ? mmss(t) : `${mmss(t)} / ${mmss(r.limit)}`;
  return { meta: `${r.pin ? 'Pinnacle' : 'Rift'} · Tier ${r.tier} · ${time} · ${what}`, prog: r.pin || r.guardian != null ? 100 : (r.progress / r.need) * 100, late: !r.pin && t > r.limit };
}
/** Buff chip with the key modifiers of the current run. */
export function riftBuffs(sim: Sim): string[] {
  const r = sim.rift.run;
  if (!r || !r.mods.length) return [];
  const t = r.mods.map(m => KEY_MODS[m].text).join(' · ');
  return [`<span class="buff riftbuff" title="${esc(t)}"><span class="bname">${r.mods.length} mod${r.mods.length > 1 ? 's' : ''}</span><b>${skulls(keyRisk(r.mods))}</b></span>`];
}

export class RiftUI {
  private sub: 'rifts' | 'atlas' = 'rifts';
  private selKey: number | null = null;
  private selNode: string | null = null;
  private msg = '';
  private devTier = 10;
  private leaveArm = false;
  private resT = 0;
  private getSim: () => Sim;
  constructor(getSim: () => Sim) { this.getSim = getSim; }
  private get sim() { return this.getSim(); }
  private get s() { return this.sim.s; }

  /* ---------- result card ---------- */
  consume(events: SimEvent[]) {
    for (const e of events) if (e.t === 'rift') this.showResult(e.res);
  }
  private showResult(r: RiftResult) {
    const el = $('#summary');
    const row = (l: string, v: string, cls = '') => `<li class="${cls}"><span>${l}</span><b>${v}</b></li>`;
    const title = r.ok ? (r.pin ? 'Pinnacle defeated' : `Tier ${r.tier} cleared`) : (r.pin ? 'The pinnacle holds' : `Tier ${r.tier} failed`);
    const items = r.items.map(i => `<li style="color:${RARITIES[i.r].color}">${esc(i.name)}</li>`).join('');
    el.innerHTML = `<div class="sumbox riftres ${r.ok ? 'ok' : 'fail'}"><h2>${title}</h2>
      <ul class="rrows">
        ${row('Time', r.pin ? mmss(r.time) : `${mmss(r.time)} / ${mmss(r.limit)}`, r.beat ? 'good' : '')}
        ${r.ok && !r.pin ? row('Timer', r.beat ? 'beaten ▲' : 'missed', r.beat ? 'good' : 'bad') : ''}
        ${r.best ? row('Personal best', 'new!', 'good') : ''}
        ${r.firstClear ? row('Highest tier', String(r.tier), 'good') : ''}
        ${r.atlasPoint ? row('Atlas point', '+1', 'good') : ''}
        ${r.key != null ? row('Next key', `Tier ${r.key}${r.keys > 1 ? ' + a second key' : ''}`, r.key > r.tier ? 'good' : r.key < r.tier ? 'bad' : '') : ''}
        ${r.frag ? row('Key fragment', `${this.s.rift.frags}/${RIFT.pinnacle.frags}`, 'good') : ''}
        ${r.ok ? row('Loot kept', `${r.itemCount} item${r.itemCount === 1 ? '' : 's'} · ${fmt(r.gold)} gold`) : row('Key', 'lost', 'bad')}
      </ul>
      ${items ? `<ul class="rloot">${items}</ul>` : ''}
      ${r.auto ? '<p class="hint">Auto mode: the next rift opens on its own.</p>' : ''}
      <button class="btn primary" data-act="closesum">Continue</button></div>`;
    el.hidden = false;
    this.resT = r.auto ? 8 : 0;
  }
  /** Auto mode: the result card closes itself after a few seconds. */
  frame(real: number) {
    if (this.resT <= 0) return;
    this.resT -= real;
    if (this.resT <= 0 && document.querySelector('#summary .riftres')) $('#summary').hidden = true;
  }

  /* ---------- town view ---------- */
  render(): string {
    const sim = this.sim, rs = this.s.rift;
    const nav = `<div class="subtabs" role="tablist"><button role="tab" aria-selected="${this.sub === 'rifts'}" data-act="rfsub:rifts">Rifts</button><button role="tab" aria-selected="${this.sub === 'atlas'}" data-act="rfsub:atlas">Atlas${atlasFree(rs) > 0 ? `<small> · ${atlasFree(rs)}</small>` : ''}</button></div>`;
    if (!sim.rift.unlocked()) return `${nav}<p class="hint">The rifts are sealed. Beat <b>Mother Vesper</b> to open endless rift tiers with keys, a timer, the Rift Guardian, the atlas and pinnacle bosses.</p>`;
    return nav + (this.sub === 'atlas' ? this.atlasView() : this.riftView()) + (this.msg ? `<p class="hint bad" role="status">${esc(this.msg)}</p>` : '');
  }

  private riftView(): string {
    const sim = this.sim, s = this.s, rs = s.rift, r = sim.rift.run, P = RIFT.pinnacle;
    const keys = bagKeys(s);
    if (this.selKey != null && !keys.some(k => k.id === this.selKey)) this.selKey = null;
    const sel = keys.find(k => k.id === this.selKey) ?? null;
    const status = `<div class="kv rstat"><div><span>Highest tier</span>${rs.maxTier || '–'}</div><div><span>Fragments</span>${rs.frags}/${P.frags}</div>
      <div><span>Atlas points</span>${atlasFree(rs)} free</div><div><span>Runs</span>${rs.runs} · ${rs.fails} lost</div></div>`;
    const cur = r ? `<div class="rcur"><span>In <b>${r.pin ? 'the pinnacle' : `Tier ${r.tier}`}</b> (${esc(AREAS[r.theme].name)} echo) · ${mmss(r.done ? r.doneT : r.t)}</span>
      <button class="btn ${this.leaveArm ? 'primary danger' : ''}" data-act="rfleave">${this.leaveArm ? 'Sure? Key is lost' : 'Leave rift'}</button></div>` : '';
    const tiles = keys.map(k => `<button class="ftile rkey ${k.id === this.selKey ? 'sel' : ''}" data-act="rfkey:${k.id}" aria-label="${esc(keyName(k))}, ${k.mods.length} modifiers">${itemPic(k, 'pic')}${keyRisk(k.mods) ? `<b class="ftag">${'☠'.repeat(Math.min(3, keyRisk(k.mods)))}</b>` : ''}</button>`).join('');
    const detail = sel ? `<div class="rkdetail"><div class="row"><b>${esc(keyName(sel))}</b><span class="hint">monster level ${riftLevel(sel.tier)}</span></div>
      ${keyModsHtml(sel.mods, s)}<button class="btn primary wide" data-act="rfopen:${sel.id}">Open rift · Tier ${sel.tier}</button></div>` : '';
    const pk = pinnacleOpen(rs);
    const pin = pk >= 1 ? `<h3>Pinnacle</h3><div class="row"><span class="hint">The Hollow Matriarch waits at tier ${pinnacleTier(pk)}. Costs ${P.frags} fragments. Mythic uniques drop only here.</span>
      <button class="btn ${rs.frags >= P.frags ? 'primary' : ''}" data-act="rfpin" ${rs.frags >= P.frags ? '' : 'disabled'}>Challenge · ${rs.frags}/${P.frags}</button></div>`
      : `<p class="hint">A pinnacle boss opens every ${P.every} tiers cleared (needs ${P.frags} key fragments from guardians).</p>`;
    const best = Object.entries(rs.best).map(([t, v]) => [+t, v] as [number, number]).sort((a, b) => b[0] - a[0]).slice(0, 12);
    const bests = best.length ? `<div class="kv rbest">${best.map(([t, v]) => `<div><span>Tier ${t}</span>${mmss(v)}${v <= RIFT.run.timer + fxv(atlasFx(rs.atlas), 'timer') ? ' ▲' : ''}</div>`).join('')}</div>` : '<p class="hint">No rift cleared yet.</p>';
    const dev = sim.rift.dev ? `<h3>Dev</h3><div class="row devrow"><span class="updn"><button class="btn sq" data-act="rfdev:-5" aria-label="5 tiers lower">−5</button><b>Tier ${this.devTier}</b><button class="btn sq" data-act="rfdev:5" aria-label="5 tiers higher">+5</button></span>
      <span class="updn"><button class="btn" data-act="rfdevkey">Key</button><button class="btn" data-act="rfdevfrag">+3 frag</button><button class="btn" data-act="rfdevclear">Clear tier</button></span></div>` : '';
    return `${status}${cur}
      <h3>Keys</h3>
      ${tiles ? `<div class="ftiles rkeys">${tiles}</div>` : '<p class="hint">No keys in the bag. Guardians always drop the next one.</p>'}
      ${detail}
      <div class="row"><span class="hint">A plain tier ${RIFT.keys.freeTier} key, free, so nobody gets stuck.</span><button class="btn" data-act="rffree">Free key · Tier ${RIFT.keys.freeTier}</button></div>
      <label class="check" for="riftauto"><input type="checkbox" id="riftauto" ${rs.auto ? 'checked' : ''}> Auto: open the next rift with the best key (up to one tier above your best)</label>
      <p class="hint">Fill the bar by killing (elites count ${RIFT.run.points[2]}×), then slay the Rift Guardian. Beat ${mmss(RIFT.run.timer)} and the next key is one tier higher; slower keeps the tier or drops one. Offline in a rift, the hero keeps farming the same tier at 50% without using keys.</p>
      ${pin}
      <h3>Personal bests</h3>${bests}
      ${dev}`;
  }

  private atlasView(): string {
    const rs = this.s.rift, A = RIFT.atlas;
    const cols = A.columns.map((c, ci) => {
      const nodes = Object.entries(ATLAS_NODES).filter(([, n]) => n.col === ci).sort((a, b) => a[1].row - b[1].row);
      return `<div class="acol"><h4>${esc(c)}</h4>${nodes.map(([id, n]) => {
        const have = rs.atlas[id] ?? 0, open = !atlasBlock(rs, id), full = have >= n.max;
        return `<button class="anode ${have ? 'on' : ''} ${full ? 'full' : ''} ${open ? 'can' : ''} ${this.selNode === id ? 'sel' : ''}" data-act="rfnode:${id}"><span>${esc(n.name)}</span><i>${'●'.repeat(have)}${'○'.repeat(n.max - have)}</i></button>`;
      }).join('')}</div>`;
    }).join('');
    const n = this.selNode ? ATLAS_NODES[this.selNode] : null;
    const block = this.selNode ? atlasBlock(rs, this.selNode) : null;
    const detail = n ? `<div class="adetail"><b>${esc(n.name)}</b> <span class="hint">${rs.atlas[this.selNode!] ?? 0}/${n.max}</span><p>${esc(n.text)}${n.max > 1 ? ' (per point)' : ''}</p>
      <button class="btn primary wide" data-act="rflearn:${this.selNode}" ${block ? 'disabled' : ''}>${block ? esc(block) : 'Learn · 1 point'}</button></div>` : '<p class="hint">Tap a node. Each column goes top to bottom: a node needs one point in the node above.</p>';
    return `<div class="row"><span>Points: <b class="gold">${atlasFree(rs)}</b> free of ${atlasEarned(rs)}</span><span class="hint">1 point per ${A.pointEvery} tiers cleared</span></div>
      <div class="atlas">${cols}</div>${detail}
      <div class="row"><span class="hint">Reset all ${atlasSpent(rs)} points.</span><button class="btn" data-act="rfrespec" ${atlasSpent(rs) ? '' : 'disabled'}>Reset · ${fmt(atlasRespecCost(rs))}g</button></div>`;
  }

  /* ---------- input ---------- */
  /** Handle a click. Returns true if it was a rift action. */
  click(a: string, x: string): boolean {
    const sim = this.sim, R = sim.rift, D = sim.dirty;
    const done = (err: string | null = null) => { this.msg = err ?? ''; D.add('town'); D.add('bag'); return true; };
    if (a !== 'rfleave') this.leaveArm = false;
    switch (a) {
      case 'rfsub': this.sub = x as 'rifts' | 'atlas'; this.msg = ''; return done();
      case 'rfkey': this.selKey = this.selKey === +x ? null : +x; return done();
      case 'rfopen': case 'riftkey': { const err = R.startKey(+x); if (!err) this.selKey = null; return done(err); }
      case 'rffree': return done(R.startFree());
      case 'rfpin': return done(R.startPinnacle());
      case 'rfleave':
        if (!this.leaveArm) { this.leaveArm = true; return done(); }
        this.leaveArm = false; sim.enterZone(sim.s.zone); return done();
      case 'rfnode': this.selNode = this.selNode === x ? null : x; return done();
      case 'rflearn': return done(R.learnNode(x));
      case 'rfrespec': return done(R.respecAtlas());
      case 'rfdev': this.devTier = Math.max(1, this.devTier + +x); return done();
      case 'rfdevkey': return done(R.devKey(this.devTier));
      case 'rfdevfrag': if (R.dev) sim.s.rift.frags += 3; return done();
      case 'rfdevclear': if (R.dev) sim.s.rift.maxTier = Math.max(sim.s.rift.maxTier, this.devTier); return done();
      default: return false;
    }
  }
  /** Checkbox changes. Returns true if handled. */
  change(t: HTMLInputElement): boolean {
    if (t.id !== 'riftauto') return false;
    this.s.rift.auto = t.checked;
    if (t.checked) this.sim.rift.autoCap = Infinity;
    return true;
  }
}
