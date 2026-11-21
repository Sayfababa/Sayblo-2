/**
 * Town economy views (forge, altar, gambling vendor, stash) and the economy parts of the bag panel
 * (materials, salvage, loot rules). Owns its own selection state; ui.ts only forwards clicks and changes.
 */
import {
  BAG_H, BAG_W, ECONOMY, EMBERS, EMBER_IDS, ITEMS, MATERIALS, MAT_IDS, RARITIES, SLOTS, SLOT_NAMES, type EmberId, type Mats, type Slot,
} from '../content/index.ts';
import { itemSize } from '../sim/bag.ts';
import { canAfford, corruptBlock, corruptCost, craftBlock, craftCost, emberBlock, gamblePrice, salvageYield } from '../sim/crafting.ts';
import { corruptItem, findItem, forge, fromStash, gamble, gambleLevel, identify, salvageBelow, sortStash, toStash } from '../sim/economy.ts';
import { formatMod } from '../sim/formulas.ts';
import type { Sim } from '../sim/sim.ts';
import { isGem, type BagItem, type Item, type SaveState } from '../sim/types.ts';
import { spriteUrl } from '../render/textures.ts';
import { esc, fmt, ic, itemPic } from './html.ts';
import { gemColor } from './gemcolor.ts';
import { corruptNote, itemTooltip, modMark } from './tooltip.ts';

export type TownView = 'main' | 'forge' | 'altar' | 'vendor' | 'stash' | 'board' | 'codex';
// board and codex are rendered by meta.ts (work package D)
const VIEWS: [TownView, string][] = [['main', 'Town'], ['forge', 'Forge'], ['altar', 'Altar'], ['vendor', 'Vendor'], ['stash', 'Stash'], ['board', 'Board'], ['codex', 'Codex']];
type Dropdown = (key: string, label: string, cur: string, options: [string, string, string?][]) => string;

/* ---------- small shared pieces ---------- */
/** Material icon (painted, from icons-economy.png). */
export const matIcon = (k: string) => `<img class="mat" src="${spriteUrl(`mat-${k}.png`)}" alt="" title="${esc(MATERIALS[k as keyof typeof MATERIALS].name)}">`;
/** "12 ◆ 3 ◆" list of a material amount; `have` marks what is missing in red. */
export function matList(m: Mats, have?: Mats): string {
  const parts = MAT_IDS.filter(k => m[k]).map(k => `<span class="matn ${have && (have[k] || 0) < m[k]! ? 'short' : ''}">${matIcon(k)}${fmt(m[k]!)}</span>`);
  return parts.join('') || '<span class="matn">–</span>';
}
/** Materials the hero carries, for panel headers. */
export const matsKey = (s: SaveState) => MAT_IDS.map(k => s.mats[k]).join('|');
export const matsHeader = (s: SaveState) => `<span class="matbar" data-k="${matsKey(s)}" aria-label="Materials">${MAT_IDS.map(k => `<span class="matn">${matIcon(k)}${fmt(s.mats[k])}</span>`).join('')}</span>`;
const emberIcon = (e: EmberId) => `<img class="emb" src="${spriteUrl(`ember-${e}.png`)}" alt="">`;
const tile = (it: Item, sel: boolean, tag = '') =>
  `<button class="ftile r${it.r} ${sel ? 'sel' : ''} ${it.cor ? 'cor' : ''}" data-act="fitem:${it.id}" aria-label="${esc(it.unid ? 'Unidentified ' + SLOT_NAMES[it.slot] : it.name)}">${itemPic(it, 'pic')}${tag ? `<b class="ftag">${tag}</b>` : ''}</button>`;

/* ---------- bag panel parts ---------- */
/** Salvage button text for the bag tooltip. */
export const salvageBtn = (it: Item) => `<button class="btn" data-act="salv:${it.id}">Salvage · ${matList(salvageYield(it))}</button>`;

export function lootRulesHtml(s: SaveState, dropdown: Dropdown): string {
  const L = s.loot, names = ITEMS.filterNames;
  const opts = names.map((n, i) => [String(i), n] as [string, string]);
  const same = SLOTS.every(k => L.minR[k] === L.minR.weapon);
  const rows = SLOTS.map(k => `<div class="lrow"><img class="glyph" src="${spriteUrl(`glyph-${k}.png`)}" alt=""><span>${SLOT_NAMES[k]}</span>${dropdown(`lootr:${k}`, `Keep ${SLOT_NAMES[k]}`, String(L.minR[k]), opts)}</div>`).join('');
  const chk = (id: keyof typeof L, label: string) => `<label class="check" for="loot-${id}"><input type="checkbox" id="loot-${id}" ${L[id] ? 'checked' : ''}> ${label}</label>`;
  return `<h3>Loot rules</h3>
    <div class="row filterrow"><span>All slots</span>${dropdown('lootall', 'Keep for all slots', same ? String(L.minR.weapon) : '', [...(same ? [] : [['', 'Mixed'] as [string, string]]), ...opts])}</div>
    <div class="lootgrid">${rows}</div>
    ${chk('keepUniques', 'Always keep Uniques')}
    ${chk('keepGems', 'Always keep support gems')}
    ${chk('keepUpgrades', 'Keep items better than what you wear')}
    ${chk('autoSalvage', 'Salvage what is not kept (instead of selling it)')}
    <p class="hint">Items that are not kept are ${L.autoSalvage ? 'salvaged into materials' : 'sold'} where they drop. When the bag is full, the weakest item is ${L.autoSalvage ? 'salvaged' : 'sold'}. Gems are never salvaged, only sold.</p>`;
}

export class EconomyUI {
  view: TownView = 'main';
  private sel: number | null = null;
  private selMod: number | null = null;
  private msg = { text: '', cls: '' };
  private flash = false;
  private bought: number | null = null;
  private tab = 0;
  private stSel: { id: number; from: 'stash' | 'bag' } | null = null;
  private salvArm: number | null = null;

  private getSim: () => Sim;
  constructor(getSim: () => Sim) { this.getSim = getSim; }
  private get sim() { return this.getSim(); }
  private get s() { return this.sim.s; }

  nav(): string {
    return `<div class="subtabs towntabs" role="tablist">${VIEWS.map(([v, n]) => `<button role="tab" aria-selected="${this.view === v}" data-act="tview:${v}">${n}</button>`).join('')}</div>`;
  }

  /** HTML of the current town view, or null for the main town view (rendered by ui.ts). */
  render(): string | null {
    switch (this.view) {
      case 'forge': return this.forgeView();
      case 'altar': return this.altarView();
      case 'vendor': return this.vendorView();
      case 'stash': return this.stashView();
      default: return null;
    }
  }

  private msgLine() { return this.msg.text ? `<p class="hint ${this.msg.cls}" role="status">${this.msg.text}</p>` : ''; }
  private say(text: string, cls = '') { this.msg = { text: esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'), cls }; }

  /** Equipped items first, then the bag. */
  private pickable(): { it: Item; eq: boolean }[] {
    const s = this.s;
    return [
      ...SLOTS.map(k => s.equip[k]).filter((x): x is Item => !!x).map(it => ({ it, eq: true })),
      ...s.bag.filter((x): x is Item => !isGem(x)).map(it => ({ it, eq: false })),
    ];
  }
  private selected(): Item | null {
    const f = this.sel != null ? findItem(this.s, this.sel) : null;
    if (!f) { this.sel = null; this.selMod = null; }
    return f?.it ?? null;
  }
  private picker(dim: (it: Item) => boolean): string {
    const list = this.pickable();
    if (!list.length) return '<p class="hint">Nothing to work on. Equipment you wear or carry shows up here.</p>';
    // once an item is chosen the picker shrinks to one scrollable row, so the item and the actions stay in reach
    return `<div class="ftiles ${this.sel != null ? 'strip' : ''}">${list.map(({ it, eq }) => `<span class="${dim(it) && it.id !== this.sel ? 'dim' : ''}">${tile(it, it.id === this.sel, eq ? 'E' : '')}</span>`).join('')}</div>`;
  }

  /* ---------- forge ---------- */
  private forgeView(): string {
    const s = this.s, it = this.selected();
    let body = '<p class="hint">Pick an item. Then tap an affix, then an ember.</p>';
    if (it) {
      const block = craftBlock(it);
      const mods = it.mods.map((m, i) => {
        const fixed = i < it.imp || i === it.cm || !!block;
        const tag = m[2] ? `<span class="tier">T${m[2]}</span>` : '';
        const mark = i === it.wax ? '<span class="waxmark" title="Sealed with wax">wax</span>' : i === it.cm ? '<span class="cormark">corrupted</span>' : '';
        const cls = `fmod ${i < it.imp ? 'imp' : ''} ${modMark(it, i)} ${i === this.selMod ? 'sel' : ''}`;
        return fixed
          ? `<div class="${cls}"><span>${esc(formatMod(m as [string, number]))}</span>${mark}${tag}</div>`
          : `<button class="${cls}" data-act="fmod:${i}" aria-pressed="${i === this.selMod}"><span>${esc(formatMod(m as [string, number]))}</span>${mark}${tag}</button>`;
      }).join('');
      const embers = EMBER_IDS.map(e => {
        const E = EMBERS[e], cost = craftCost(it, e), why = emberBlock(it, e, this.selMod), afford = canAfford(s.mats, cost);
        return `<button class="ember" data-act="ember:${e}" ${why || !afford ? 'disabled' : ''} style="--ec:${E.color}">
          ${emberIcon(e)}<span class="ename">${esc(E.name)}</span><span class="eshort">${esc(why && !block ? why : E.short)}</span><span class="ecost">${matList(cost, s.mats)}</span></button>`;
      }).join('');
      body = `<div class="ftip" style="--rc:${RARITIES[it.r].color}">
          <div class="tiphead">${itemPic(it, 'tippic')}<div><b class="tipname" style="color:${RARITIES[it.r].color}">${esc(it.unid ? 'Unidentified ' + SLOT_NAMES[it.slot] : it.name)}</b>
          <div class="tipbase">${RARITIES[it.r].name} ${SLOT_NAMES[it.slot]} · item level ${it.L}${it.cr ? ` · crafted ${it.cr}×` : ''}</div></div></div>
          ${it.unid ? '' : `<div class="fmods">${mods}</div>`}${corruptNote(it)}
          ${block ? `<p class="hint bad">${esc(block)}</p>` : ''}
          ${it.unid ? `<button class="btn primary" data-act="ident:${it.id}">Identify</button>` : ''}</div>
        ${block ? '' : `<div class="embers">${embers}</div>`}`;
    }
    return `<p class="hint">The smith forges embers from your materials on the spot. Each craft makes the next one on that item a little dearer.</p>
      ${this.picker(i => !!craftBlock(i))}${this.msgLine()}${body}`;
  }

  /* ---------- altar ---------- */
  private altarView(): string {
    const s = this.s, it = this.selected();
    let body = '<p class="hint">Pick an item to lay on the altar.</p>';
    if (it) {
      const c = corruptCost(it), why = corruptBlock(it), afford = canAfford(s.mats, c.mats) && s.gold >= c.gold;
      body = itemTooltip(it, null, `<button class="btn primary danger" data-act="corrupt" ${why || !afford ? 'disabled' : ''}>Offer · ${matList(c.mats, s.mats)} <span class="gold">${fmt(c.gold)}</span>${ic('gold')}</button>`)
        + (why ? `<p class="hint bad">${esc(why)}</p>` : '');
    }
    // no picture (saves room on phones); a short red screen flash marks a corruption
    return `${this.flash ? '<div class="redflash" aria-hidden="true"></div>' : ''}
      <p class="hint">Once per item. A quarter of the time each: an extra strong affix beyond the normal limits · one affix doubled · nothing, but the item is sealed · one affix replaced and the item sealed. Sealed items can no longer be crafted.</p>
      ${this.picker(i => !!i.cor)}${this.msgLine()}${body}`;
  }

  /* ---------- gambling vendor ---------- */
  private vendorView(): string {
    const s = this.s, L = gambleLevel(this.sim);
    const slots = SLOTS.map(k => {
      const p = gamblePrice(L, k);
      return `<button class="gslot" data-act="gamble:${k}" ${s.gold < p ? 'disabled' : ''}><img class="glyph" src="${spriteUrl(`glyph-${k}.png`)}" alt=""><span>${SLOT_NAMES[k]}</span><span class="gold">${fmt(p)}</span></button>`;
    }).join('');
    const f = this.bought != null ? findItem(s, this.bought) : null;
    let last = '';
    if (f) {
      const it = f.it;
      const acts = it.unid
        ? `<button class="btn primary" data-act="ident:${it.id}">Identify</button>${salvageBtn(it)}`
        : `${f.where === 'bag' ? `<button class="btn primary" data-act="eequip:${it.id}">Equip</button>${salvageBtn(it)}` : '<span class="hint">Equipped.</span>'}`;
      last = `<h3>Your purchase</h3>${itemTooltip(it, s.equip[it.slot] === it ? null : s.equip[it.slot], acts, { compare: !it.unid && f.where === 'bag' })}`;
    }
    return `<p class="hint">The vendor sells sealed parcels: pick a slot, pay, and get an unidentified Magic or Rare item of level ${L} (your deepest area). Now and then a Unique hides inside (${Math.round(ECONOMY.gamble.uniqueChance * 100)}%). Prices rise with that level.</p>
      <div class="gslots">${slots}</div>${this.msgLine()}${last}`;
  }

  /* ---------- stash ---------- */
  private grid(items: BagItem[], from: 'stash' | 'bag'): string {
    return `<div class="bagwell"><div class="bag" style="--cols:${BAG_W};--rows:${BAG_H}">${items.map(it => {
      const [w, h] = itemSize(it), r = isGem(it) ? 'gem' : 'r' + it.r, sel = this.stSel?.id === it.id;
      return `<button class="bi ${r} ${sel ? 'sel' : ''}" style="--x:${it.bx};--y:${it.by};--w:${w};--h:${h}${isGem(it) ? `;--gc:${gemColor(it.gem)}` : ''}" data-act="ssel:${from}:${it.id}" aria-label="${esc(this.sim.itemName(it))}">${itemPic(it, 'pic', true)}</button>`;
    }).join('')}</div></div>`;
  }
  private stashView(): string {
    const s = this.s, names = ECONOMY.stash.names, grid = s.stash[this.tab] ?? [];
    const tabs = `<div class="subtabs" role="tablist">${names.map((n, i) => `<button role="tab" aria-selected="${i === this.tab}" data-act="stab:${i}">${n}${s.stash[i]?.length ? `<small> · ${s.stash[i].length}</small>` : ''}</button>`).join('')}</div>`;
    let tip = '';
    const sel = this.stSel;
    if (sel) {
      const list = sel.from === 'stash' ? grid : s.bag, it = list.find(i => i.id === sel.id);
      if (!it) this.stSel = null;
      else {
        const act = sel.from === 'stash'
          ? `<button class="btn primary" data-act="fromstash:${it.id}">To bag</button>`
          : `<button class="btn primary" data-act="tostash:${it.id}">To stash ${names[this.tab]}</button>`;
        tip = itemTooltip(it, null, act, { learned: Object.keys(s.skills) });
      }
    }
    return `${tabs}
      <div class="row"><span class="hint">Tap an item, then move it. Same grid as the bag.</span><button class="btn" data-act="ssort">${ic('sort')}Sort</button></div>
      ${this.grid(grid, 'stash')}${this.msgLine()}${tip}
      <h3>Bag</h3>${this.grid(s.bag, 'bag')}`;
  }

  /* ---------- input ---------- */
  /** Handle a click. Returns true if it was an economy action. */
  click(a: string, x: string, y: string): boolean {
    const sim = this.sim, D = sim.dirty;
    const done = () => { D.add('town'); D.add('bag'); return true; };
    switch (a) {
      case 'tview': this.view = x as TownView; this.msg = { text: '', cls: '' }; this.stSel = null; return done();
      case 'fitem': {
        const id = +x;
        this.sel = this.sel === id ? null : id; this.selMod = null; this.msg = { text: '', cls: '' };
        return done();
      }
      case 'fmod': this.selMod = this.selMod === +x ? null : +x; return done();
      case 'ember': {
        const it = this.selected();
        if (!it) return done();
        const e = x as EmberId, err = forge(sim, it.id, e, EMBERS[e].target ? this.selMod : null, craftCost(it, e));
        if (err) this.say(err, 'bad');
        else {
          const last = sim.events.filter(ev => ev.t === 'log').pop();
          this.say(last && last.t === 'log' ? last.msg : `${EMBERS[e].name} used.`, 'good');
          if (e === 'wax' || e === 'bind') this.selMod = null;
        }
        return done();
      }
      case 'corrupt': {
        const it = this.selected();
        if (!it) return done();
        const r = corruptItem(sim, it.id);
        if (r.err) { this.say(r.err, 'bad'); return done(); }
        this.say(r.text!, r.outcome === 'extra' || r.outcome === 'double' ? 'good' : 'bad');
        this.flash = true;
        setTimeout(() => { this.flash = false; this.sim.dirty.add('town'); }, 900);
        return done();
      }
      case 'gamble': {
        const r = gamble(sim, x as Slot);
        if (r.err) this.say(r.err, 'bad'); else { this.bought = r.item!.id; this.msg = { text: '', cls: '' }; }
        return done();
      }
      case 'ident': identify(sim, +x); return done();
      case 'eequip': sim.equip(+x); D.add('hero'); D.add('slots'); return done();
      case 'stab': this.tab = +x; this.stSel = null; return done();
      case 'ssel': {
        const id = +y;
        this.stSel = this.stSel?.id === id ? null : { id, from: x as 'stash' | 'bag' };
        this.msg = { text: '', cls: '' };
        return done();
      }
      case 'tostash': { const err = toStash(sim, +x, this.tab); if (err) this.say(err, 'bad'); else this.stSel = null; return done(); }
      case 'fromstash': { const err = fromStash(sim, +x, this.tab); if (err) this.say(err, 'bad'); else this.stSel = null; return done(); }
      case 'ssort': sortStash(sim, this.tab); return done();
      case 'salvbelow': {
        const r = +x;
        if (this.salvArm !== r) {
          this.salvArm = r;
          setTimeout(() => { if (this.salvArm === r) { this.salvArm = null; this.sim.dirty.add('bag'); } }, 4000);
          return done();
        }
        this.salvArm = null;
        salvageBelow(sim, r);
        return done();
      }
    }
    return false;
  }

  /** Checkbox changes for the loot rules. Returns true if handled. */
  change(t: HTMLInputElement): boolean {
    const m = /^loot-(keepUniques|keepGems|keepUpgrades|autoSalvage)$/.exec(t.id);
    if (!m) return false;
    this.s.loot[m[1] as 'keepUniques'] = t.checked;
    this.sim.dirty.add('bag');
    return true;
  }
  /** Dropdown picks: lootall:<r> and lootr:<slot>:<r>. */
  pick(x: string, y: string, z: string): boolean {
    const L = this.s.loot;
    if (x === 'lootall') { if (y !== '') for (const k of SLOTS) L.minR[k] = +y; return true; }
    if (x === 'lootr') { L.minR[y as Slot] = +z; return true; }
    return false;
  }

  /** "Salvage all below …" row for the bag. */
  salvageRow(): string {
    const s = this.s;
    const btn = (r: number) => {
      const list = s.bag.filter((i): i is Item => !isGem(i) && i.r < r);
      const armed = this.salvArm === r;
      return `<button class="btn ${armed ? 'primary danger' : ''}" data-act="salvbelow:${r}" ${list.length ? '' : 'disabled'}>${armed ? `Sure? ${list.length}` : `${RARITIES[r].name} (${list.length})`}</button>`;
    };
    return `<div class="salvrow"><span>Salvage everything below</span><div class="salvbtns">${btn(1)}${btn(2)}${btn(3)}</div></div>`;
  }
}
