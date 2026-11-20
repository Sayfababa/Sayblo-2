/**
 * DOM part of the game: HUD (orbs, skill bar, area, target frame), log and the four menus.
 * Talks to the simulation only through its public state and action methods.
 */
import {
  ACT_NAME, AREAS, ATTRS, BASE_ICON, CONDITIONS, ELEMENT_NAMES, HERO, ITEMS, RANKS, RARITIES, SKILLS, SLOTS, SLOT_NAMES, TREES, BAG_SIZE,
  type Attr, type Slot,
} from '../content/index.ts';
import { damageRange, formatMod, frostArmorBarrier, itemScore, manaCost, potionPrice, respecCost, sellValue, xpNeeded } from '../sim/formulas.ts';
import { SaveError, exportCode, importCode } from '../sim/save.ts';
import type { Sim } from '../sim/sim.ts';
import type { Item, Monster, SaveState, SimEvent } from '../sim/types.ts';
import { spriteUrl } from '../render/textures.ts';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (n: number) => (n >= 100000 ? Math.round(n / 1000) + 'k' : n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
/** Log messages mark names with **bold**; everything else is escaped. */
const richText = (msg: string) => esc(msg).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const iconSrc = (it: Item) => spriteUrl(`item-${BASE_ICON[it.base]}.png`);
const SHEET_W = 460;

type Tab = 'hero' | 'skills' | 'bag' | 'town';

export interface GameHooks {
  sim(): Sim;
  replaceSave(s: SaveState): void;
  wipe(): void;
}

export class UI {
  private game: GameHooks;
  private tab: Tab | null = null;
  private log: { html: string; cls: string }[] = [];
  private logDirty = true;
  private showLog = false;
  private uiT = 0;
  private lastPot = '';
  private resetArm = false;
  private importArm = false;
  private exportText = '';
  private importDraft = '';
  private importMsg: { text: string; cls: string } = { text: '', cls: '' };

  constructor(game: GameHooks) {
    this.game = game;
    document.addEventListener('click', e => this.onClick(e));
    document.addEventListener('change', e => this.onChange(e));
    document.addEventListener('input', e => this.onInput(e));
  }
  private get sim() { return this.game.sim(); }
  private get s() { return this.sim.s; }

  /** Width of the menu sheet that covers the right side of the scene (desktop only). */
  sheetW() { return this.tab && $('#stage').clientWidth >= 820 ? SHEET_W : 0; }

  consume(events: SimEvent[]) {
    for (const e of events) if (e.t === 'log') this.addLog(richText(e.msg), e.cls);
  }
  addLog(html: string, cls = '') {
    this.log.unshift({ html, cls });
    if (this.log.length > 60) this.log.length = 60;
    this.logDirty = true;
  }
  clearLog() { this.log = []; this.logDirty = true; }

  /** Called every frame. Cheap parts run every frame, the rest ten times a second. */
  frame(real: number, target: Monster | null) {
    this.drawTarget(target);
    this.uiT += real;
    if (this.uiT > 0.1) { this.uiT = 0; this.draw(); }
  }

  refreshAll() {
    for (const k of ['hero', 'skills', 'bag', 'town', 'slots', 'zones'] as const) this.sim.dirty.add(k);
    this.lastPot = '';
    this.draw();
  }

  /* ---------- HUD ---------- */
  private drawTarget(tg: Monster | null) {
    const el = $('#target'), sim = this.sim;
    if (!tg || sim.phase !== 'fight') { el.hidden = true; return; }
    const st = $('#stage'), w = st.clientWidth, h = st.clientHeight;
    const k = Math.max(0.9, Math.min(1.3, Math.min(w / 620, h / 560)));
    const cw = w - this.sheetW(), bw = Math.min(cw - 32, 240 * k);
    el.hidden = false;
    el.style.setProperty('--k', String(k));
    el.style.left = `${cw / 2 - bw / 2}px`; el.style.width = `${bw}px`; el.style.top = `${cw < 760 ? 84 : 10}px`;
    const name = $('#tname');
    if (name.textContent !== tg.name) name.textContent = tg.name;
    name.style.color = RANKS[tg.rank].color;
    const sub = $('#tsub');
    if (sub.textContent !== tg.sub) sub.textContent = tg.sub;
    $('#tbar').style.width = `${Math.max(0, tg.hp / tg.maxHp) * 100}%`;
  }

  private renderSkillbar() {
    $('#skillbar').innerHTML = this.s.slots.map((sl, i) => {
      const sk = sl.id && SKILLS[sl.id];
      if (!sk) return `<div class="sk empty"><div class="ab">–</div><div class="nm">Empty</div></div>`;
      return `<div class="sk" id="sk${i}" title="${esc(sk.name)}"><div class="ab ${sk.element}">${sk.abbr}</div><img src="${spriteUrl(`icon-${sl.id}.png`)}" alt="${esc(sk.name)}"><div class="cdv"></div></div>`;
    }).join('');
  }

  draw() {
    const sim = this.sim, s = this.s, st = sim.st, z = AREAS[s.zone];
    const wv = sim.phase === 'town' ? 'In town' : sim.bossSpawned ? 'Boss' : sim.wave ? `Wave ${Math.min(sim.wave, z.waves)}/${z.waves}` : 'Exploring';
    $('#zmeta').textContent = `${ACT_NAME} · monster lv ${z.level} · ${wv}`;
    $('#zprog').style.width = (sim.bossSpawned ? 100 : (Math.max(0, sim.wave - (sim.phase === 'fight' ? 1 : 0)) / z.waves) * 100) + '%';
    $('#overlay').hidden = sim.phase !== 'town';
    if (sim.phase === 'town') {
      $('#towntxt').textContent = s.autoReturn
        ? `You lost some experience and gold. Back to ${AREAS[sim.returnZone].name} in ${Math.max(0, Math.ceil(sim.townT))}s.`
        : 'Auto-return is off. Pick an area or press Return.';
      $('#returnbtn').textContent = 'Return to ' + AREAS[sim.returnZone].name;
    }
    $('#hlvl').textContent = String(s.lvl);
    $('#hgold').textContent = fmt(s.gold) + ' gold';
    $('#xptxt').textContent = `${fmt(s.xp)} / ${fmt(xpNeeded(s.lvl))} XP`;
    $('#xpbar').style.width = (s.xp / xpNeeded(s.lvl)) * 100 + '%';
    const mb = sim.maxBarrier(), bf = mb ? s.barrier / mb : 0;
    $('#barring').style.opacity = s.barrier > 0 ? (0.25 + bf * 0.75).toFixed(2) : '0';
    $('#bartxt').textContent = s.barrier >= 1 ? '+' + Math.round(s.barrier) + ' barrier' : '';
    $('#lifebar').style.height = (Math.max(0, sim.life) / st.maxLife) * 100 + '%';
    $('#lifetxt').textContent = `${Math.max(0, Math.round(sim.life))}/${st.maxLife}`;
    $('#manabar').style.height = (sim.mana / st.maxMana) * 100 + '%';
    $('#manatxt').textContent = `${Math.round(sim.mana)}/${st.maxMana}`;
    const pk = s.hpPot + '/' + s.mpPot;
    if (this.lastPot !== pk) {
      this.lastPot = pk;
      $('#hppot').innerHTML = `<img src="${spriteUrl('item-potion-hp.png')}" alt="Health potions">${s.hpPot}`;
      $('#mppot').innerHTML = `<img src="${spriteUrl('item-potion-mp.png')}" alt="Mana potions">${s.mpPot}`;
    }
    if (sim.dirty.has('slots')) { this.renderSkillbar(); sim.dirty.delete('slots'); }
    s.slots.forEach((sl, i) => {
      const e = document.getElementById('sk' + i);
      if (!e || !sl.id) return;
      const sk = SKILLS[sl.id], cd = sim.cd[sl.id] ?? 0;
      (e.querySelector('.cdv') as HTMLElement).style.height = (sk.cooldown && cd > 0 ? (cd / sk.cooldown) * 100 : s.skills[sl.id] ? 0 : 100) + '%';
      e.classList.toggle('flash', sim.lastCast === sl.id && sim.lastCastT > 0);
    });
    if (this.logDirty && this.showLog) {
      $('#log').innerHTML = this.log.map(l => `<li class="${l.cls}">${l.html}</li>`).join('');
      this.logDirty = false;
    }
    const zs = $<HTMLSelectElement>('#zonesel');
    if (sim.dirty.has('zones')) {
      zs.innerHTML = AREAS.slice(0, s.unlocked).map((a, i) => `<option value="${i}" ${i === s.zone ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
      sim.dirty.delete('zones');
    } else if (+zs.value !== s.zone) zs.value = String(s.zone);
    document.querySelectorAll<HTMLElement>('#speedseg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.act === 'speed:' + s.speed)));
    $('#dot-hero').hidden = !s.attrPts;
    $('#dot-skills').hidden = !s.skillPts;
    const tg = document.getElementById('towngold');
    if (tg) tg.textContent = fmt(s.gold);
    const p = this.tab;
    if (p && sim.dirty.has(p)) { this.renderPanel(p); sim.dirty.delete(p); }
  }

  /* ---------- panels ---------- */
  private renderPanel(p: Tab) {
    ({ hero: () => this.pHero(), skills: () => this.pSkills(), bag: () => this.pBag(), town: () => this.pTown() })[p]();
  }

  private pHero() {
    const s = this.s, st = this.sim.st;
    const eq = SLOTS.map(sl => {
      const it = s.equip[sl];
      return `<div class="eqs"><span class="s">${SLOT_NAMES[sl]}</span>${it
        ? `<span class="rn${it.r}"><img class="eicon" src="${iconSrc(it)}" alt="">${esc(it.name)}</span><button class="btn sm" data-act="unequip:${sl}">Remove</button>`
        : `<span style="color:var(--muted)">Empty</span><span></span>`}</div>`;
    }).join('');
    $('#p-hero').innerHTML = `
      <div class="row"><h2>${HERO.className} · Level ${s.lvl}</h2><span>${s.attrPts ? `<b class="gold">${s.attrPts}</b> points to spend` : 'No points left'}</span></div>
      <div>${ATTRS.map(k => { const A = HERO.attributes[k]; return `<div class="attr"><span>${A.name}</span><span class="v">${st.a[k]}</span><span class="d">${A.description}</span><button class="btn sm" data-act="attr:${k}" ${s.attrPts ? '' : 'disabled'} aria-label="Add point to ${A.name}">+</button></div>`; }).join('')}</div>
      <h3>Character</h3>
      <div class="kv">
        <div><span>Life</span>${st.maxLife}</div><div><span>Mana</span>${st.maxMana}</div>
        <div><span>Mana / s</span>${st.manaRegen.toFixed(1)}</div><div><span>Life / s</span>${st.lifeRegen.toFixed(1)}</div>
        <div><span>Cast time</span>${this.sim.castTime().toFixed(2)}s</div><div><span>Crit chance</span>${st.crit.toFixed(1)}%</div>
        <div><span>Spell damage</span>+${st.spellDmg}%</div><div><span>Barrier (items)</span>${st.barrier}</div>
        <div><span class="fire">Fire damage</span>+${st.el.fire}%</div><div><span class="fire">Fire resist</span>${st.res.fire}%</div>
        <div><span class="cold">Cold damage</span>+${st.el.cold}%</div><div><span class="cold">Cold resist</span>${st.res.cold}%</div>
        <div><span class="light">Lightning damage</span>+${st.el.light}%</div><div><span class="light">Lightning resist</span>${st.res.light}%</div>
        <div><span>Dodge</span>${st.dodge}%</div><div><span>Kills / deaths</span>${s.kills} / ${s.deaths}</div>
      </div>
      <h3>Equipment</h3><div class="eq">${eq}</div>`;
  }

  private pSkills() {
    const s = this.s, sim = this.sim;
    const learned = Object.keys(SKILLS).filter(k => s.skills[k] > 0);
    const trees = Object.entries(TREES).map(([t, T]) => `<div class="tree"><h3><span class="${T.element}">${T.name}</span><span>${ELEMENT_NAMES[T.element]}</span></h3><p class="hint">${T.description}</p>
      ${Object.entries(SKILLS).filter(([, sk]) => sk.tree === t).map(([id, sk]) => {
        const lv = s.skills[id] || 0, can = s.skillPts > 0 && s.lvl >= sk.reqLevel;
        const info = sk.type === 'buff' ? `Barrier ${frostArmorBarrier(Math.max(1, lv))}` : lv ? (() => { const [a, b] = damageRange(s.skills, sim.st, id); return `Damage ${a}–${b}`; })() : '';
        return `<div class="skill ${s.lvl < sk.reqLevel ? 'locked' : ''}"><div class="t"><span><img class="sicon" src="${spriteUrl(`icon-${id}.png`)}" alt=""><b class="${sk.element}">${sk.name}</b></span><span>Lv ${lv}</span></div>
          <div class="d">${sk.description}</div><div class="t"><span class="d">${s.lvl < sk.reqLevel ? 'Needs level ' + sk.reqLevel : `${info}${info ? ' · ' : ''}${manaCost(s.skills, id)} mana`}</span>
          <button class="btn sm" data-act="learn:${id}" ${can ? '' : 'disabled'} aria-label="Level up ${sk.name}">+</button></div></div>`;
      }).join('')}</div>`).join('');
    const opts = (sel: string | null) => `<option value="">Empty</option>` + learned.map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${SKILLS[k].name}</option>`).join('');
    const copts = (sel: string) => Object.entries(CONDITIONS).map(([k, n]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${n}</option>`).join('');
    $('#p-skills').innerHTML = `
      <div class="row"><h2>Skills</h2><span>${s.skillPts ? `<b class="gold">${s.skillPts}</b> skill point${s.skillPts > 1 ? 's' : ''}` : 'No skill points'}</span></div>
      <div class="trees">${trees}</div>
      <p class="hint">Each point in a skill also adds 8% damage to the other skills in the same tree.</p>
      <h3>Cast priority</h3>
      <p class="hint">She checks the slots from top to bottom and casts the first skill that is off cooldown, affordable and whose condition is true. If none fits, she uses Staff Spark (free, weak). Put cheap filler skills set to "Always" at the bottom.</p>
      ${sim.blockedSlots().map(([i, b]) => `<p class="hint" style="color:var(--bad)">Slot ${i + 1} is never cast: slot ${b + 1} is set to "Always" and is always ready.</p>`).join('')}
      <div class="row" style="justify-content:flex-start"><button class="btn sm" data-act="autoorder">Sort automatically</button></div>
      <div class="prio">${s.slots.map((sl, i) => `<div class="prow"><span class="ix">${i + 1}</span>
        <select id="slot${i}" data-slot="${i}" aria-label="Skill in slot ${i + 1}">${opts(sl.id)}</select>
        <select id="cond${i}" data-cond="${i}" aria-label="Condition for slot ${i + 1}">${copts(sl.cond)}</select>
        <span class="updn"><button class="btn sm" data-act="up:${i}" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="btn sm" data-act="down:${i}" ${i < 3 ? '' : 'disabled'} aria-label="Move down">↓</button></span></div>`).join('')}</div>`;
  }

  private itemCard(it: Item, inBag: boolean) {
    const cur = this.s.equip[it.slot], d = Math.round(itemScore(it) - itemScore(cur));
    const cmp = inBag ? (d > 0 ? `<span class="cmp up">▲ ${d} better</span>` : d < 0 ? `<span class="cmp down">▼ ${-d} worse</span>` : '') : '';
    return `<div class="item r${it.r}"><div class="row"><span class="n rn${it.r}"><img class="iicon" src="${iconSrc(it)}" alt="">${esc(it.name)}</span>${cmp}</div>
      <div class="b">${RARITIES[it.r].name} ${SLOT_NAMES[it.slot]}${it.r ? ' · ' + esc(it.base) : ''} · item level ${it.L}</div>
      <ul>${it.mods.map((m, i) => `<li class="${i < it.imp ? 'imp' : ''}">${formatMod(m)}</li>`).join('')}</ul>
      ${inBag ? `<div class="row" style="justify-content:flex-start"><button class="btn sm primary" data-act="equip:${it.id}">Equip</button><button class="btn sm" data-act="sell:${it.id}">Sell · ${sellValue(it)}g</button></div>` : ''}</div>`;
  }

  private pBag() {
    const s = this.s;
    $('#p-bag').innerHTML = `
      <div class="row"><h2>Bag</h2><span>${s.bag.length} / ${BAG_SIZE}</span></div>
      <div class="row"><label class="check" for="filter">Pick up:
        <select class="plain" id="filter">${ITEMS.filterNames.map((n, i) => `<option value="${i}" ${i === s.filter ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="btn sm" data-act="sellLow" ${s.bag.some(i => i.r < 2) ? '' : 'disabled'}>Sell all Normal & Magic</button></div>
      <p class="hint">Loot below the filter is sold on the spot and never shows up on the ground. When the bag is full, the weakest item is sold.</p>
      <div class="items">${s.bag.length ? s.bag.map(it => this.itemCard(it, true)).join('') : '<div class="empty-state">Your bag is empty. The sorceress walks over to loot after each fight; elites and bosses always drop something.</div>'}</div>`;
  }

  private pTown() {
    const s = this.s, price = potionPrice(s.lvl), rc = respecCost(s.lvl), P = HERO.potions;
    $('#p-town').innerHTML = `
      <div class="row"><h2>Town</h2><span class="gold"><span id="towngold">${fmt(s.gold)}</span> gold</span></div>
      <h3>Merchant</h3>
      <div class="kv"><div><span>Health potions</span>${s.hpPot}</div><div><span>Mana potions</span>${s.mpPot}</div></div>
      <div class="row" style="justify-content:flex-start">
        <button class="btn" data-act="buy:hp:5">Buy 5 health · ${price * 5}g</button>
        <button class="btn" data-act="buy:mp:5">Buy 5 mana · ${price * 5}g</button></div>
      <p class="hint" id="townmsg">Health potions restore ${P.life * 100}% life, mana potions ${P.mana * 100}% mana. ${P.cooldown}s cooldown each.</p>
      <h3>Potion belt</h3>
      <label class="range" for="hpTh"><span>Drink health potion below</span><b id="hpThv">${s.hpTh}%</b><input type="range" id="hpTh" min="10" max="90" step="5" value="${s.hpTh}"></label>
      <label class="range" for="mpTh"><span>Drink mana potion below</span><b id="mpThv">${s.mpTh}%</b><input type="range" id="mpTh" min="5" max="90" step="5" value="${s.mpTh}"></label>
      <h3>Behaviour</h3>
      <label class="check" for="autoAdvance"><input type="checkbox" id="autoAdvance" ${s.autoAdvance ? 'checked' : ''}> Move to the next area after clearing one</label>
      <label class="check" for="autoReturn"><input type="checkbox" id="autoReturn" ${s.autoReturn ? 'checked' : ''}> After dying, return to the previous area automatically</label>
      <label class="check" for="kite"><input type="checkbox" id="kite" ${s.kite ? 'checked' : ''}> Keep distance from melee enemies (kiting)</label>
      <h3>Mystic</h3>
      <div class="row"><span class="hint">Reset all attribute and skill points.</span><button class="btn" data-act="respec">Respec · ${rc}g</button></div>
      <h3>Save game</h3>
      <div class="savebox">
        <p class="hint">Progress is saved in this browser. To move your hero to another device or keep a backup, copy the save code and load it there.</p>
        <div class="row" style="justify-content:flex-start"><button class="btn" data-act="export">${this.exportText ? 'New save code' : 'Show save code'}</button>
          <button class="btn" data-act="copy" ${this.exportText ? '' : 'hidden'}>Copy</button></div>
        <textarea class="code" id="exportcode" readonly aria-label="Your save code" ${this.exportText ? '' : 'hidden'}>${esc(this.exportText)}</textarea>
        <label class="hint" for="importcode">Load a save code</label>
        <textarea class="code" id="importcode" placeholder="Paste a save code here" spellcheck="false" autocapitalize="off" autocomplete="off">${esc(this.importDraft)}</textarea>
        <div class="row"><span class="hint ${this.importMsg.cls}" id="importmsg">${esc(this.importMsg.text)}</span>
          <button class="btn" data-act="import">${this.importArm ? 'Tap again to replace your hero' : 'Load code'}</button></div>
      </div>
      <div class="scope"><h3>About this version</h3>
        <ul><li>In: isometric world with walking, visible spells, monsters that close in or shoot, loot on the ground, light radius, auto-combat with cast priority, 3 elements, resistances, barrier, champions, elites, a two-phase boss, auto-potions, death penalty, save codes.</li>
        <li>Not yet: support gems, set items, crafting, Nightmare and Hell, rifts, offline progress. The game pauses while this tab is hidden.</li>
        <li>Numbers are a first guess for testing the feel, not balanced.</li></ul></div>
      <div class="row"><span class="hint">Start a new hero. This deletes the current one.</span><button class="btn sm" data-act="reset">${this.resetArm ? 'Tap again to wipe' : 'Start over'}</button></div>`;
  }

  /* ---------- input ---------- */
  setTab(t: Tab | null) {
    this.tab = t && this.tab !== t ? t : null;
    document.querySelectorAll<HTMLElement>('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.act === 'tab:' + this.tab)));
    $('#sheet').hidden = !this.tab;
    $('#stage').classList.toggle('open', !!this.tab);
    document.querySelectorAll('.panel').forEach(x => x.classList.toggle('active', x.id === 'p-' + this.tab));
    if (this.tab) { this.sim.dirty.add(this.tab); $('#sheet').scrollTop = 0; this.draw(); }
  }
  private townMsg(t: string) { const e = document.getElementById('townmsg'); if (e) e.textContent = t; }
  private setImportMsg(text: string, cls = '') {
    this.importMsg = { text, cls };
    const e = document.getElementById('importmsg');
    if (e) { e.textContent = text; e.className = `hint ${cls}`; }
  }

  private onClick(e: MouseEvent) {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
    if (!b || b.disabled) return;
    const [a, x, y] = (b.dataset.act || '').split(':');
    const sim = this.sim, s = this.s;
    switch (a) {
      case 'tab': this.setTab(x as Tab); break;
      case 'close': this.setTab(null); break;
      case 'autoorder': sim.autoOrder(); this.addLog('Cast order sorted automatically.', 'good'); break;
      case 'log':
        this.showLog = !this.showLog;
        $('#log').hidden = !this.showLog;
        b.setAttribute('aria-pressed', String(this.showLog));
        this.logDirty = true;
        break;
      case 'speed': s.speed = +x; break;
      case 'attr': sim.addAttr(x as Attr); break;
      case 'learn': sim.learnSkill(x); break;
      case 'up': case 'down': sim.moveSlot(+x, a === 'up' ? -1 : 1); break;
      case 'equip': sim.equip(+x); break;
      case 'unequip': sim.unequip(x as Slot); break;
      case 'sell': sim.sell(+x); break;
      case 'sellLow': sim.sellLow(); break;
      case 'buy': { const err = sim.buyPotions(x as 'hp' | 'mp', +y); if (err) this.townMsg(err); break; }
      case 'respec': { const err = sim.respec(); if (err) this.townMsg(err); break; }
      case 'return': sim.returnFromTown(); break;
      case 'export': void this.doExport(); break;
      case 'copy': void this.doCopy(); break;
      case 'import': void this.doImport(); break;
      case 'reset':
        if (!this.resetArm) {
          this.resetArm = true; sim.dirty.add('town');
          setTimeout(() => { this.resetArm = false; this.sim.dirty.add('town'); }, 4000);
          return;
        }
        this.resetArm = false;
        this.game.wipe();
        break;
    }
    this.draw();
  }

  private onChange(e: Event) {
    const t = e.target as HTMLInputElement & HTMLSelectElement, sim = this.sim, s = this.s;
    if (t.id === 'zonesel') sim.selectZone(+t.value);
    else if (t.dataset.slot != null) sim.setSlotSkill(+t.dataset.slot, t.value || null);
    else if (t.dataset.cond != null) sim.setSlotCond(+t.dataset.cond, t.value);
    else if (t.id === 'filter') s.filter = +t.value;
    else if (t.id === 'autoAdvance') s.autoAdvance = t.checked;
    else if (t.id === 'autoReturn') s.autoReturn = t.checked;
    else if (t.id === 'kite') s.kite = t.checked;
    this.draw();
  }

  private onInput(e: Event) {
    const t = e.target as HTMLInputElement;
    if (t.id === 'hpTh' || t.id === 'mpTh') { this.s[t.id] = +t.value; $('#' + t.id + 'v').textContent = t.value + '%'; }
    else if (t.id === 'importcode') {
      this.importDraft = t.value;
      if (this.importArm) { this.importArm = false; this.sim.dirty.add('town'); }
    }
  }

  private async doExport() {
    try {
      this.exportText = await exportCode(this.s);
      this.sim.dirty.add('town');
      this.draw();
      const ta = document.getElementById('exportcode') as HTMLTextAreaElement | null;
      ta?.focus(); ta?.select();
    } catch {
      this.setImportMsg('Could not create a save code.', 'msg-bad');
    }
  }

  private async doCopy() {
    const ta = document.getElementById('exportcode') as HTMLTextAreaElement | null;
    if (!ta) return;
    try {
      await navigator.clipboard.writeText(this.exportText);
      this.setImportMsg('Save code copied.', 'msg-good');
    } catch {
      ta.focus(); ta.select();
      this.setImportMsg('Copy it by hand: the code is selected.', '');
    }
  }

  private async doImport() {
    const code = this.importDraft.trim();
    if (!code) { this.setImportMsg('Paste a save code first.', 'msg-bad'); return; }
    let save: SaveState;
    try { save = await importCode(code); } catch (err) {
      this.importArm = false;
      this.setImportMsg(err instanceof SaveError ? err.message : 'The code could not be read.', 'msg-bad');
      this.sim.dirty.add('town');
      return;
    }
    if (!this.importArm) {
      this.importArm = true;
      this.setImportMsg(`Code is valid: ${HERO.className} level ${save.lvl}, ${fmt(save.gold)} gold.`, 'msg-good');
      this.sim.dirty.add('town');
      this.draw();
      return;
    }
    this.importArm = false;
    this.importDraft = '';
    this.exportText = '';
    this.game.replaceSave(save);
    this.setImportMsg(`Loaded: ${HERO.className} level ${save.lvl}.`, 'msg-good');
    this.addLog(`Save code loaded: ${HERO.className} level ${save.lvl}.`, 'lvl');
  }
}
