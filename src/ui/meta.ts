/**
 * Work package D (Meta progression), DOM side: bounty board and unique codex (town sub-tabs),
 * ember points, feats and titles in the hero panel, the HUD bounty tracker, area-event buffs,
 * the tyrant counter in the area info, and toasts for feats, bounties, tyrants and events.
 * ui.ts only forwards clicks and calls the render helpers from a few marked lines.
 */
import {
  AREAS, BASE_ICON, EMBER_TRACKS, FEATS, META, RARITIES, SLOT_NAMES, TYRANTS, UNIQUES, type EmberTrack,
} from '../content/index.ts';
import { bountyDone, bountyText, swapCost } from '../sim/bounty.ts';
import { CODEX_ORDER, imprintBlock, imprintCost } from '../sim/codex.ts';
import { canAfford } from '../sim/crafting.ts';
import { findItem } from '../sim/economy.ts';
import { xpNeeded } from '../sim/formulas.ts';
import { LEVEL_CAP, bonusText, emberBar, emberFree, featValue, tyrantKey } from '../sim/meta.ts';
import type { Bounty } from '../sim/meta-types.ts';
import type { Sim } from '../sim/sim.ts';
import { isEquip, type Item, type SaveState, type SimEvent } from '../sim/types.ts';
import { spriteUrl } from '../render/textures.ts';
import { esc, fmt, ic, itemPic, richText } from './html.ts';
import { matList } from './economy.ts';
import { itemTooltip } from './tooltip.ts';

const EV = META.events;
const uniquePic = (u: string, cls = 'pic') => `<img class="${cls}" src="${spriteUrl(`item-${BASE_ICON[UNIQUES[u].base]}.png`)}" alt="">`;

/** XP bar text and fill (ember bar after the level cap). */
export function xpBar(s: SaveState): { text: string; pct: number } {
  if (s.lvl >= LEVEL_CAP) {
    const need = emberBar(), free = emberFree(s);
    const pct = Math.min(100, (s.xp / need) * 100);
    return { text: `Ember ${pct < 10 ? pct.toFixed(1) : Math.floor(pct)}%${free ? ` · ${free} pts` : ''}`, pct };
  }
  return { text: `${fmt(s.xp)} / ${fmt(xpNeeded(s.lvl))} XP`, pct: (s.xp / xpNeeded(s.lvl)) * 100 };
}

/** " · Tyrant 87/150" for the area info line (empty in town or in areas without a tyrant). */
export function tyrantInfo(sim: Sim): string {
  const s = sim.s, T = TYRANTS[AREAS[s.zone].id];
  if (!T || sim.phase === 'town') return '';
  if (sim.meta.tyrantUp != null) return ' · Tyrant!';
  const n = s.meta.tyrant[tyrantKey(s.difficulty, s.zone)] || 0;
  return n >= META.tyrants.kills ? ' · Tyrant next' : ` · Tyrant ${n}/${META.tyrants.kills}`;
}

/** Buff bar entry for the running area event. */
export function metaBuffs(sim: Sim): string[] {
  const ev = sim.meta.ev;
  if (!ev) return [];
  const E = EV[ev.id];
  return [`<span class="buff shrinebuff eventbuff" style="--sc:${E.color};--left:${(ev.t / ev.dur).toFixed(3)}" title="${esc(E.name)}: ${esc(E.text)}"><i class="srune" aria-hidden="true"></i><span class="bname">${esc(E.name)}</span><b>${Math.ceil(ev.t)}</b></span>`];
}

/** Title chosen in the hero panel (" · the Reaper"), or ''. */
export const titleText = (s: SaveState) => (s.meta.title && FEATS[s.meta.title]?.title ? FEATS[s.meta.title].title! : '');

export class MetaUI {
  /** codex: selected unique and item for imprinting */
  private selU: string | null = null;
  private selIt: number | null = null;
  private msg = { text: '', cls: '' };
  private toasts: { html: string; cls: string; t: number }[] = [];
  private lastTrack = '';
  private lastToast = '';
  private lastT = 0;
  private getSim: () => Sim;
  constructor(getSim: () => Sim) { this.getSim = getSim; }
  private get sim() { return this.getSim(); }
  private get s() { return this.sim.s; }
  private say(text: string, cls = '') { this.msg = { text: richText(text), cls }; }

  /* ---------- toasts ---------- */
  consume(events: SimEvent[]) {
    for (const e of events) {
      if (e.t !== 'meta' || e.kind === 'eventEnd') continue;
      const cls = e.kind === 'feat' ? 'feat' : e.kind === 'tyrant' ? 'tyrant' : e.kind === 'event' ? 'event' : e.kind;
      const head = { feat: 'Feat earned', bounty: 'Bounty', tyrant: 'Tyrant', event: 'Area event', ember: 'Ember', codex: 'Codex' }[e.kind];
      this.toasts.push({ html: `<small>${head}</small><b>${esc(e.text)}</b>`, cls, t: 3.4 });
      if (this.toasts.length > 3) this.toasts.shift();
    }
  }

  /** HUD parts, called from UI.draw (10 times a second). */
  draw() {
    const now = performance.now(), dt = this.lastT ? Math.min(0.5, (now - this.lastT) / 1000) : 0;
    this.lastT = now;
    const stage = document.getElementById('stage');
    if (!stage) return;
    let tr = document.getElementById('mtrack');
    if (!tr) { tr = document.createElement('div'); tr.id = 'mtrack'; tr.className = 'mtrack'; stage.appendChild(tr); }
    let to = document.getElementById('mtoasts');
    if (!to) { to = document.createElement('div'); to.id = 'mtoasts'; to.className = 'mtoasts'; to.setAttribute('aria-live', 'polite'); stage.appendChild(to); }
    const s = this.s, bs = s.meta.bounties;
    const done = bs.filter(bountyDone).length;
    const track = s.meta.tracker
      ? `<button class="mtrk open" data-act="mtrack" aria-label="Hide bounty tracker">${bs.map(b => `<span class="${bountyDone(b) ? 'done' : ''}"><i style="--p:${(b.have / b.need).toFixed(3)}"></i><em>${esc(bountyText(b))}</em> <b>${bountyDone(b) ? '✓' : `${b.have}/${b.need}`}</b></span>`).join('')}</button>`
      : `<button class="mtrk" data-act="mtrack" aria-label="Show bounty tracker">Bounties${done ? ` <b>${done} done</b>` : ''}</button>`;
    if (track !== this.lastTrack) { this.lastTrack = track; tr.innerHTML = track; }
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter(t => t.t > 0);
    const th = this.toasts.map(t => `<div class="mtoast ${t.cls} ${t.t < 0.5 ? 'out' : ''}">${t.html}</div>`).join('');
    if (th !== this.lastToast) { this.lastToast = th; to.innerHTML = th; }
  }

  /* ---------- town views ---------- */
  /** HTML of a meta town view, or null if the view is not one of ours. */
  townView(view: string): string | null {
    if (view === 'board') return this.board();
    if (view === 'codex') return this.codex();
    return null;
  }

  private rewardLine(b: Bounty): string {
    const R = b.reward;
    return `<span class="gold">${fmt(R.gold)}</span>${ic('gold')}${matList(R.mats)}${R.gem ? '<span class="chip">support gem</span>' : ''}${R.unique ? `<span class="chip uchip" style="color:${RARITIES[3].color}">${esc(UNIQUES[R.unique].name)}</span>` : ''}`;
  }

  private board(): string {
    const s = this.s;
    const cards = s.meta.bounties.map(b => {
      const done = bountyDone(b), c = swapCost(b);
      return `<div class="bounty ${done ? 'done' : ''}">
        <div class="btext"><b>${esc(bountyText(b))}</b><span class="bprog"><i style="width:${(b.have / b.need) * 100}%"></i></span><small>${b.have} / ${b.need} · level ${b.L}</small></div>
        <div class="brew">${this.rewardLine(b)}</div>
        <div class="bact">${done
          ? `<button class="btn primary" data-act="bclaim:${b.id}">Claim</button>`
          : `<button class="btn sm" data-act="bswap:${b.id}" ${s.gold < c ? 'disabled' : ''}>Swap · ${fmt(c)}g</button>`}</div></div>`;
    }).join('');
    const st = s.meta.stats;
    return `<p class="hint">Three bounties always hang on the board. They never expire: finish them whenever you like, claim with one tap and a new one takes the spot. Progress also shows at the top left of the map (tap it to hide).</p>
      ${this.msgLine()}<div class="bounties">${cards}</div>
      <p class="hint">Claimed so far: ${st.bounties || 0}. Rewards grow with the area level and difficulty; sometimes a unique is pinned to the notice.</p>`;
  }

  private msgLine() { return this.msg.text ? `<p class="hint ${this.msg.cls}" role="status">${this.msg.text}</p>` : ''; }

  private codex(): string {
    const s = this.s, have = new Set(s.meta.codex), total = CODEX_ORDER.length;
    const entries = CODEX_ORDER.map(u => {
      const U = UNIQUES[u], got = have.has(u), sel = this.selU === u;
      return `<button class="centry ${got ? 'got' : 'unknown'} ${sel ? 'sel' : ''}" data-act="cpick:${u}" ${got ? '' : 'aria-disabled="true"'} aria-label="${got ? esc(U.name) : 'Unknown ' + SLOT_NAMES[U.slot]}">
        <span class="cpic">${uniquePic(u)}</span><span class="cname"><b>${got ? esc(U.name) : '? ? ?'}</b><small>${SLOT_NAMES[U.slot]}</small></span>
        ${got ? `<span class="ceff">${esc(U.effect)}</span>` : '<span class="ceff">Salvage this unique to learn its secret.</span>'}</button>`;
    }).join('');
    let imp = '';
    if (this.selU && have.has(this.selU)) {
      const U = UNIQUES[this.selU];
      const list: { it: Item; eq: boolean }[] = [
        ...(s.equip[U.slot] ? [{ it: s.equip[U.slot]!, eq: true }] : []),
        ...s.bag.filter((x): x is Item => isEquip(x) && x.slot === U.slot).map(it => ({ it, eq: false })),
      ];
      const tiles = list.map(({ it, eq }) => {
        const why = imprintBlock(s, it, this.selU!);
        return `<span class="${why ? 'dim' : ''}"><button class="ftile r${it.r} ${it.id === this.selIt ? 'sel' : ''}" data-act="cimp:${it.id}" aria-label="${esc(it.name)}">${itemPic(it, 'pic')}${eq ? '<b class="ftag">E</b>' : ''}${it.ipr ? '<b class="ftag ipr">◆</b>' : ''}</button></span>`;
      }).join('');
      const f = this.selIt != null ? findItem(s, this.selIt) : null;
      let detail = '';
      if (f && f.it.slot === U.slot) {
        const why = imprintBlock(s, f.it, this.selU), cost = imprintCost(f.it), ok = !why && canAfford(s.mats, cost);
        detail = itemTooltip(f.it, null, `<button class="btn primary" data-act="cdo" ${ok ? '' : 'disabled'}>Imprint · ${matList(cost, s.mats)}</button>`)
          + (why ? `<p class="hint bad">${esc(why)}</p>` : '');
      } else this.selIt = null;
      imp = `<h3>Imprint ${esc(U.name)}</h3>
        <p class="hint">Pick a Rare ${SLOT_NAMES[U.slot].toLowerCase()} without an imprint. It keeps its affixes and gains this effect for good.</p>
        ${tiles ? `<div class="ftiles">${tiles}</div>` : `<p class="hint">You carry no ${SLOT_NAMES[U.slot].toLowerCase()}. Rares you wear or carry show up here.</p>`}
        ${this.msgLine()}${detail}`;
    }
    return `<div class="row"><h3>Unique codex</h3><span class="ccount"><b>${have.size}</b> / ${total}</span></div>
      <p class="hint">Salvaging a unique unlocks its effect here for good. An unlocked effect can be imprinted on a Rare item of the same slot, once per item. Tap a found entry to imprint it.</p>
      <div class="codex">${entries}</div>${imp}`;
  }

  /* ---------- hero panel ---------- */
  heroHtml(): string {
    const s = this.s, m = s.meta, free = emberFree(s), capped = s.lvl >= LEVEL_CAP;
    const tracks = EMBER_TRACKS.map(t => {
      const T = META.ember.tracks[t], n = m.ember.alloc[t] || 0;
      const now = Object.entries(T.per).map(([k, v]) => bonusText(k, Math.round(v * n * 10) / 10)).join(', ');
      return `<div class="etrack" style="--ec:${T.color}"><span class="etname"><b>${T.name}</b> <small>${esc(T.text)} per point</small>${n ? `<small class="enow">Now: ${esc(now)}</small>` : ''}</span>
        <span class="etv">${n}</span>
        <span class="updn"><button class="btn sq" data-act="eadd:${t}:-1" ${n ? '' : 'disabled'} aria-label="Take a point from ${T.name}">−</button><button class="btn sq" data-act="eadd:${t}:1" ${free ? '' : 'disabled'} aria-label="Add a point to ${T.name}">+</button><button class="btn sq" data-act="eadd:${t}:10" ${free >= 2 ? '' : 'disabled'} aria-label="Add up to 10 points to ${T.name}">+10</button></span></div>`;
    }).join('');
    const ember = `<details class="grp" ${capped ? 'open' : ''}><summary>Ember points${m.ember.earned ? ` · ${free} free of ${m.ember.earned}` : ''}</summary>
      <p class="hint">${capped ? `At level ${LEVEL_CAP} every full experience bar kindles one ember point.` : `From level ${LEVEL_CAP} on, every full experience bar kindles one ember point.`} Points go into four tracks with no limit and can be moved freely.</p>
      <div class="etracks">${tracks}</div>
      ${m.ember.earned && free < m.ember.earned ? '<div class="row" style="justify-content:flex-end"><button class="btn sm" data-act="ereset">Take all points back</button></div>' : ''}</details>`;
    const ids = Object.keys(FEATS), got = ids.filter(id => m.feats.includes(id));
    const feats = ids.map(id => {
      const F = FEATS[id], has = m.feats.includes(id), v = Math.min(F.n, featValue(s, F.type));
      const reward = F.bonus ? Object.entries(F.bonus).map(([k, x]) => bonusText(k, x)).join(', ') : `Title: ${F.title}`;
      return `<div class="feat ${has ? 'got' : ''}"><i class="fmark" aria-hidden="true"></i><span><b>${esc(F.name)}</b><small>${esc(F.text)}</small></span><span class="frew">${esc(reward)}${has ? '' : `<small>${fmt(v)} / ${fmt(F.n)}</small>`}</span></div>`;
    }).join('');
    const titles = got.filter(id => FEATS[id].title);
    const titleRow = `<div class="titles">${titles.length
      ? [`<button class="btn sm" data-act="mtitle:" aria-pressed="${!m.title}">No title</button>`, ...titles.map(id => `<button class="btn sm" data-act="mtitle:${id}" aria-pressed="${m.title === id}">${esc(FEATS[id].title!)}</button>`)].join('')
      : '<span class="hint">Some feats grant a title. Earned titles can be shown here.</span>'}</div>`;
    return `${ember}
      <details class="grp"><summary>Feats · ${got.length} / ${ids.length}</summary>${titleRow}<div class="feats">${feats}</div></details>`;
  }

  /* ---------- input ---------- */
  /** Handle a click. Returns true if it was a meta action. */
  click(a: string, x: string, y: string): boolean {
    const sim = this.sim, D = sim.dirty, M = sim.meta;
    switch (a) {
      case 'mtrack': this.s.meta.tracker = !this.s.meta.tracker; this.lastTrack = ''; return true;
      case 'bclaim': { const e = M.claim(+x); if (e) this.say(e, 'bad'); else { const l = sim.events.filter(v => v.t === 'log').pop(); this.say(l && l.t === 'log' ? l.msg : 'Claimed.', 'good'); } D.add('town'); return true; }
      case 'bswap': { const e = M.swap(+x); this.msg = { text: '', cls: '' }; if (e) this.say(e, 'bad'); D.add('town'); return true; }
      case 'cpick': if (!this.s.meta.codex.includes(x)) return true; this.selU = this.selU === x ? null : x; this.selIt = null; this.msg = { text: '', cls: '' }; D.add('town'); return true;
      case 'cimp': this.selIt = this.selIt === +x ? null : +x; this.msg = { text: '', cls: '' }; D.add('town'); return true;
      case 'cdo': {
        if (!this.selU || this.selIt == null) return true;
        const e = M.imprint(this.selIt, this.selU);
        if (e) this.say(e, 'bad'); else this.say(`Imprinted **${UNIQUES[this.selU].name}**.`, 'good');
        D.add('town'); return true;
      }
      case 'eadd': M.emberAdd(x as EmberTrack, +y); return true;
      case 'ereset': M.emberReset(); return true;
      case 'mtitle': M.setTitle(x || null); return true;
    }
    return false;
  }
}
