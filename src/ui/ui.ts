/**
 * DOM part of the game: HUD (orbs, skill bar, area, buffs, target frame), log and the four menus.
 * Talks to the simulation only through its public state and action methods.
 */
import {
  ACT_NAME, AREAS, ATTRS, BAG_H, BAG_W, CONDITIONS, DIFFICULTIES, GEMS, HERO, RANKS, SKILLS, SLOT_NAMES,
  SOCKET_LEVELS, TREES, isPassive, skillMaxLevel, type Attr, type Slot,
} from '../content/index.ts';
import { itemSize, canPlace } from '../sim/bag.ts';
import { damageRange, formatMod, frostArmorBarrier, gemFits, gemText, potionPrice, respecCost, sellValue, skillCtx, calcStats, type SkillCtx } from '../sim/formulas.ts';
import { SaveError, exportCode, importCode } from '../sim/save.ts';
import type { RunStats, Sim } from '../sim/sim.ts';
import { isEquip, isGem, isKey, type Monster, type SaveState, type SimEvent } from '../sim/types.ts';
import { spriteUrl } from '../render/textures.ts';
import { $, bagCls, duration, esc, fmt, ic, itemPic, phead, richText, skillIcon } from './html.ts';
import { RiftUI, riftBuffs, riftHud } from './rift.ts';
import { itemTooltip } from './tooltip.ts';
import { gemColor } from './gemcolor.ts';
import { EconomyUI, lootRulesHtml, matsHeader, matsKey, salvageBtn } from './economy.ts';
import { salvage } from '../sim/economy.ts';
import { bagBadges, feelBuffs, soundInput, soundSettings } from './feel.ts';
import { MetaUI, metaBuffs, titleText, tyrantInfo, xpBar } from './meta.ts';

const SHEET_W = 460;
const DIFF_ICON = ['normal', 'nightmare', 'hell'];
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
  private lastBuffs = '';
  private resetArm = false;
  private importArm = false;
  private exportText = '';
  private importDraft = '';
  private importMsg: { text: string; cls: string } = { text: '', cls: '' };
  // menu selections
  private selBag: number | null = null;
  private selEq: Slot | null = null;
  private moveMode = false;
  private bagMsg = '';
  private selSkill = 'fireball';
  private pickSocket: number | null = null;
  private skillMsg = '';
  private skillView: 'tree' | 'prio' = 'tree';
  /** open custom dropdown, e.g. "slot:2", "cond:0", "filter" */
  private openDD: string | null = null;
  private sellMode = false;
  private sellSel = new Set<number>();
  private drag: { from: number; to: number; id: number; y0: number } | null = null;
  /** forge, altar, vendor, stash and the economy parts of the bag (economy.ts) */
  private eco = new EconomyUI(() => this.sim);
  /** bounty board, codex, ember points, feats, HUD tracker and toasts (meta.ts) */
  private meta = new MetaUI(() => this.sim);
  /** rifts and atlas (rift.ts) */
  private rift = new RiftUI(() => this.sim);

  constructor(game: GameHooks) {
    this.game = game;
    document.addEventListener('click', e => this.onClick(e));
    document.addEventListener('pointerdown', e => this.onPointerDown(e));
    document.addEventListener('pointermove', e => this.onPointerMove(e));
    document.addEventListener('pointerup', e => this.onPointerUp(e));
    document.addEventListener('pointercancel', () => this.endDrag(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (this.openDD) { this.openDD = null; this.sim.dirty.add(this.tab ?? 'skills'); this.draw(); } else if (this.tab) this.setTab(null); } });
    document.addEventListener('change', e => this.onChange(e));
    document.addEventListener('input', e => this.onInput(e));
  }
  private get sim() { return this.game.sim(); }
  private get s() { return this.sim.s; }

  /** Width of the menu sheet that covers the right side of the scene (desktop only). */
  sheetW() { return this.tab && $('#stage').clientWidth >= 820 ? SHEET_W : 0; }

  consume(events: SimEvent[]) {
    for (const e of events) if (e.t === 'log') this.addLog(richText(e.msg), e.cls);
    this.meta.consume(events); // meta: toasts
    this.rift.consume(events); // rift: result card
  }
  addLog(html: string, cls = '') {
    this.log.unshift({ html, cls });
    if (this.log.length > 80) this.log.length = 80;
    this.logDirty = true;
  }
  clearLog() { this.log = []; this.logDirty = true; }

  /** Called every frame. Cheap parts run every frame, the rest ten times a second. */
  frame(real: number, target: Monster | null) {
    this.drawTarget(target);
    this.rift.frame(real);
    this.uiT += real;
    if (this.uiT > 0.1) { this.uiT = 0; this.draw(); }
  }

  refreshAll() {
    for (const k of ['hero', 'skills', 'bag', 'town', 'slots', 'zones'] as const) this.sim.dirty.add(k);
    this.lastPot = ''; this.lastBuffs = '';
    this.selBag = null; this.selEq = null; this.moveMode = false;
    this.draw();
  }

  /** Popup after offline progress or after coming back to the tab. */
  showSummary(away: number, counted: number, r: RunStats, before: { lvl: number }) {
    const el = $('#summary');
    const line = (v: number, t: string) => (v ? `<li><b>${fmt(v)}</b> ${t}</li>` : '');
    el.innerHTML = `<div class="sumbox"><h2>While you were away</h2>
      <p class="hint">Away for ${duration(away)}. Offline time counts at ${Math.round((counted / Math.max(1, away)) * 100)}%: ${duration(counted)} of fighting.</p>
      <ul class="sumlist">${line(r.kills, 'monsters slain')}${line(r.xp, 'experience')}${r.levels ? `<li><b>+${r.levels}</b> level${r.levels > 1 ? 's' : ''} (now ${before.lvl + r.levels})</li>` : ''}
        ${line(r.gold, 'gold')}${line(r.items, 'items picked up')}${line(r.gems, 'support gems found')}${r.deaths ? `<li class="bad"><b>${r.deaths}</b> death${r.deaths > 1 ? 's' : ''}</li>` : ''}</ul>
      ${r.kills ? '' : '<p class="hint">Nothing happened. Maybe the hero was waiting in town.</p>'}
      <button class="btn primary" data-act="closesum">Continue</button></div>`;
    el.hidden = false;
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
    el.style.left = `${cw / 2 - bw / 2}px`; el.style.width = `${bw}px`; el.style.top = `${cw < 760 ? 92 : 10}px`;
    const name = $('#tname');
    if (name.textContent !== tg.name) name.textContent = tg.name;
    name.style.color = RANKS[tg.rank].color;
    const states = [tg.frozen > 0 ? 'Frozen' : tg.chill > 0 ? 'Chilled' : '', tg.burn > 0 ? 'Burning' : '', tg.shock > 0 ? 'Shocked' : ''].filter(Boolean).join(' · ');
    const subTxt = [tg.sub, states].filter(Boolean).join(' — ');
    const sub = $('#tsub');
    if (sub.textContent !== subTxt) sub.textContent = subTxt;
    $('#tbar').style.width = `${Math.max(0, tg.hp / tg.maxHp) * 100}%`;
  }

  private renderSkillbar() {
    $('#skillbar').innerHTML = this.s.slots.map((sl, i) => {
      const sk = sl.id && SKILLS[sl.id];
      if (!sk) return `<div class="sk empty"><div class="ab">–</div></div>`;
      const gems = this.sim.socketsOf(sl.id!).filter(Boolean).map(g => `<i style="--gc:${gemColor(g!.gem)}"></i>`).join('');
      return `<button class="sk" id="sk${i}" title="${esc(sk.name)}: ${esc(CONDITIONS[sl.cond])}" data-act="skillsel:${sl.id}"><img src="${skillIcon(sl.id!)}" alt="${esc(sk.name)}"><div class="cdv"></div><span class="skgems">${gems}</span></button>`;
    }).join('');
  }

  private drawBuffs() {
    const sim = this.sim, b: string[] = [];
    const fa = sim.buffs.frostarmor ?? 0;
    if (fa > 0) b.push(`<span class="buff" title="Frost Armor"><img src="${skillIcon('frostarmor')}" alt="Frost Armor"><b>${Math.ceil(fa)}</b></span>`);
    b.push(...feelBuffs(sim)); // feel: shrines, vault, chill
    b.push(...metaBuffs(sim)); // meta: area event
    b.push(...riftBuffs(sim)); // rift: key modifiers
    if (sim.s.difficulty) b.push(`<span class="buff diff d${sim.s.difficulty}" title="${DIFFICULTIES[sim.s.difficulty].name}">${ic(DIFF_ICON[sim.s.difficulty])}${DIFFICULTIES[sim.s.difficulty].name}</span>`);
    const key = b.join('');
    if (key !== this.lastBuffs) { this.lastBuffs = key; $('#buffs').innerHTML = key; }
  }

  draw() {
    const sim = this.sim, s = this.s, st = sim.st, z = AREAS[s.zone];
    const wv = sim.phase === 'town' ? 'In town' : sim.bossSpawned ? 'Boss' : sim.wave ? `Wave ${Math.min(sim.wave, z.waves)}/${z.waves}` : 'Exploring';
    const rh = riftHud(sim); // rift: timer and progress bar
    $('#zmeta').textContent = rh ? rh.meta : `${ACT_NAME} · monster lv ${sim.areaLevel()} · ${wv}${tyrantInfo(sim)}`;
    $('#zmeta').classList.toggle('late', !!rh?.late);
    $('#zprog').style.width = (rh ? rh.prog : sim.bossSpawned ? 100 : (Math.max(0, sim.wave - (sim.phase === 'fight' ? 1 : 0)) / z.waves) * 100) + '%';
    $('#zprog').classList.toggle('rift', !!rh);
    $('#overlay').hidden = sim.phase !== 'town';
    if (sim.phase === 'town') {
      $('#towntxt').textContent = s.autoReturn
        ? `You lost some experience and gold. Back to ${AREAS[sim.returnZone].name} in ${Math.max(0, Math.ceil(sim.townT))}s.`
        : 'Auto-return is off. Pick an area or press Return.';
      $('#returnbtn').textContent = 'Return to ' + AREAS[sim.returnZone].name;
    }
    $('#hlvl').textContent = String(s.lvl);
    $('#hgold').textContent = fmt(s.gold);
    const xb = xpBar(s); // meta: ember bar after the level cap
    $('#xptxt').textContent = xb.text;
    $('#xpbar').style.width = xb.pct + '%';
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
    this.drawBuffs();
    this.meta.draw(); // meta: bounty tracker, toasts
    if (sim.dirty.has('slots')) { this.renderSkillbar(); sim.dirty.delete('slots'); }
    s.slots.forEach((sl, i) => {
      const e = document.getElementById('sk' + i);
      if (!e || !sl.id) return;
      const c = sim.ctx(sl.id), cd = sim.cd[sl.id] ?? 0;
      (e.querySelector('.cdv') as HTMLElement).style.height = (c.cooldown && cd > 0 ? (cd / c.cooldown) * 100 : 0) + '%';
      e.classList.toggle('flash', sim.lastCast === sl.id && sim.lastCastT > 0);
      e.classList.toggle('nomana', sim.mana < c.mana);
    });
    if (this.logDirty && this.showLog) {
      $('#log').innerHTML = this.log.map(l => `<li class="${l.cls}">${l.html}</li>`).join('');
      this.logDirty = false;
    }
    const zs = $<HTMLSelectElement>('#zonesel');
    if (sim.dirty.has('zones')) {
      const rr = sim.rift.run; // rift: the current rift is the selected entry; picking an area leaves it
      zs.innerHTML = (rr ? `<option value="-1" selected>${rr.pin ? 'Pinnacle' : `Rift · Tier ${rr.tier}`}</option>` : '')
        + AREAS.slice(0, sim.unlocked).map((a, i) => `<option value="${i}" ${i === s.zone && !rr ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
      sim.dirty.delete('zones');
    } else if (+zs.value !== (sim.rift.run ? -1 : s.zone)) zs.value = String(sim.rift.run ? -1 : s.zone);
    document.querySelectorAll<HTMLElement>('#speedseg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.act === 'speed:' + s.speed)));
    $('#dot-hero').hidden = !s.attrPts;
    $('#dot-skills').hidden = !s.skillPts;
    const tg = document.getElementById('towngold');
    if (tg) tg.textContent = fmt(s.gold);
    for (const mb of document.querySelectorAll<HTMLElement>('.matbar')) if (mb.dataset.k !== matsKey(s)) mb.outerHTML = matsHeader(s);
    const p = this.tab;
    if (p && sim.dirty.has(p)) { this.renderPanel(p); sim.dirty.delete(p); }
  }

  /* ---------- panels ---------- */
  private renderPanel(p: Tab) {
    const sheet = $('#sheet'), top = sheet.scrollTop;
    ({ hero: () => this.pHero(), skills: () => this.pSkills(), bag: () => this.pBag(), town: () => this.pTown() })[p]();
    sheet.scrollTop = top;
  }

  private pHero() {
    const s = this.s, sim = this.sim, st = sim.st, M = st.mods, g = (k: string) => M[k] || 0;
    const row = (label: string, v: string, cls = '') => `<div><span class="${cls}">${label}</span>${v}</div>`;
    const res = (e: 'fire' | 'cold' | 'light') => `${st.res[e]}%${st.rawRes[e] + sim.diff.resPenalty > st.res[e] ? ` <small class="over">(${st.rawRes[e] + sim.diff.resPenalty})</small>` : ''}`;
    const plus = Object.entries(st.plus).filter(([, v]) => v).map(([t, v]) => row(`+ ${TREES[t].name} skills`, `+${v}`)).join('');
    $('#p-hero').innerHTML = `
      ${phead(`${HERO.className}${titleText(s) ? ` <small class="htitle">${esc(titleText(s))}</small>` : ''} · Level ${s.lvl}`, s.attrPts ? `${ic('attrpt', 'Attribute points')}<b class="gold">${s.attrPts}</b> to spend` : 'No points left')}
      <div class="well attrs">${ATTRS.map(k => { const A = HERO.attributes[k]; const dis = s.attrPts ? '' : 'disabled'; return `<div class="attr"><span>${A.name}</span><span class="v">${st.a[k]}</span><span class="d">${A.description}</span>
        <span class="updn"><button class="btn sq" data-act="attr:${k}:1" ${dis} aria-label="Add point to ${A.name}">+</button><button class="btn sq" data-act="attr:${k}:5" ${s.attrPts >= 5 ? '' : 'disabled'} aria-label="Add 5 points to ${A.name}">+5</button></span></div>`; }).join('')}</div>
      <details class="grp" open><summary>Offense</summary><div class="kv">
        ${row('Spell damage', `+${st.spellDmg}%`)}${row('Cast time', `${sim.ctx('fireball').castTime.toFixed(2)}s`)}
        ${row('Fire damage', `+${st.el.fire}%`, 'fire')}${row('Fire penetration', `${st.pen.fire}%`, 'fire')}
        ${row('Cold damage', `+${st.el.cold}%`, 'cold')}${row('Cold penetration', `${st.pen.cold}%`, 'cold')}
        ${row('Lightning damage', `+${st.el.light}%`, 'light')}${row('Lightning pen.', `${st.pen.light}%`, 'light')}
        ${row('Projectile damage', `+${g('projDmg')}%`)}${row('Area damage', `+${g('areaDmg')}%`)}
        ${row('Crit chance', `${st.crit.toFixed(1)}%`)}${row('Crit damage', `${st.critMulti}%`)}
        ${g('addFire') ? row('Added fire', `+${g('addFire')}`, 'fire') : ''}${g('addCold') ? row('Added cold', `+${g('addCold')}`, 'cold') : ''}${g('addLight') ? row('Added lightning', `+${g('addLight')}`, 'light') : ''}
        ${plus}
      </div></details>
      <details class="grp" open><summary>Defense</summary><div class="kv">
        ${row('Life', String(st.maxLife))}${row('Life / s', st.lifeRegen.toFixed(1))}
        ${row('Mana', String(st.maxMana))}${row('Mana / s', st.manaRegen.toFixed(1))}
        ${row('Barrier (items)', String(st.barrier))}${row('Dodge', `${st.dodge}%`)}
        ${st.barrierRegen ? row('Barrier recharge', `+${st.barrierRegen}%`) : ''}${st.elemDR ? row('Damage reduction', `${st.elemDR}%`) : ''}
        ${row('Fire resist', res('fire'), 'fire')}${row('Cold resist', res('cold'), 'cold')}
        ${row('Lightning resist', res('light'), 'light')}${row('Resist cap', `${HERO.caps.res}%`)}
      </div>${sim.diff.resPenalty ? `<p class="hint">${sim.diff.name}: ${sim.diff.resPenalty}% to all resistances (already included). Small numbers in brackets show resistance above the cap.</p>` : ''}</details>
      <details class="grp"><summary>Ailments</summary><div class="kv">
        ${row('Chance to burn', `+${g('burnChance')}%`, 'fire')}${row('Burn damage', `+${g('burnDmg')}%`, 'fire')}
        ${row('Chance to freeze', `+${g('freezeChance')}%`, 'cold')}${row('Chill effect', `+${g('chillEffect')}%`, 'cold')}
        ${row('Chance to shock', `+${g('shockChance')}%`, 'light')}${row('Shock effect', `+${g('shockEffect')}%`, 'light')}
      </div><p class="hint">Burn deals fire damage over time. Chill slows, freeze stops an enemy for a moment (heavy cold hits freeze more often). Shocked enemies take more damage from everything.</p></details>
      ${this.meta.heroHtml()}
      <details class="grp"><summary>Record</summary><div class="kv">
        ${row('Kills', fmt(s.kills))}${row('Deaths', String(s.deaths))}${row('Difficulty', sim.diff.name)}${row('Gold', fmt(s.gold))}
      </div></details>`;
  }

  /* ----- skills ----- */
  private ctxAt(id: string, add: number): SkillCtx {
    const s2 = structuredClone(this.s) as SaveState;
    s2.skills[id] = (s2.skills[id] || 0) + add;
    return skillCtx(s2, calcStats(s2), id);
  }
  private skillInfo(id: string): string {
    const sk = SKILLS[id], sim = this.sim, lv = this.s.skills[id] || 0;
    if (isPassive(id)) {
      const eff = sim.st.plus[sk.tree] || 0, total = lv ? lv + eff : 0;
      return `<div class="kv one">${total ? `<div><span>Now</span>${esc(this.passiveText(id, total))}</div>` : ''}<div><span>Next level</span>${esc(this.passiveText(id, total ? total + 1 : 1 + eff))}</div></div>`;
    }
    const c = lv ? sim.ctx(id) : this.ctxAt(id, 1), rows: string[] = [];
    const add = (l: string, v: string) => rows.push(`<div><span>${l}</span>${v}</div>`);
    if (sk.type === 'buff') add('Barrier', String(frostArmorBarrier(c.lvl)));
    else { const [a, b] = damageRange(c); add('Damage', `${a}–${b}`); }
    add('Mana', String(c.mana));
    add('Cast time', `${c.castTime.toFixed(2)}s`);
    if (c.cooldown) add('Cooldown', `${c.cooldown}s`);
    if (sk.type === 'buff') add('Duration', `${((sk.duration || 0) * c.durMult).toFixed(0)}s`);
    if (c.radius) add('Radius', `${c.radius.toFixed(1)} tiles`);
    if (sk.type === 'projectile') add('Projectiles', String(c.projectiles));
    if (c.pierce) add('Pierce', String(c.pierce));
    if (c.fork) add('Fork', `into ${c.fork}`);
    if (sk.type === 'chain') add('Targets', String(c.chains));
    if (sk.type !== 'buff') {
      add('Crit', `${c.critChance.toFixed(0)}% · ${c.critMulti}%`);
      if (c.inc.fire !== c.inc.cold || sk.element === 'fire') add('Increased', `+${Math.round(c.inc[sk.element])}%`);
      if (c.more !== 1) add('More / less', `${c.more > 1 ? '+' : ''}${Math.round((c.more - 1) * 100)}%`);
      add('Burn', `${Math.min(100, c.burnChance).toFixed(0)}%`);
      if (sk.element === 'cold' || c.freezeChance) add('Freeze', `${c.freezeChance.toFixed(0)}% + heavy hits`);
      add('Shock', `${Math.min(100, c.shockChance).toFixed(0)}%`);
    }
    let next = '';
    if (lv && lv < skillMaxLevel(id) && sk.type !== 'buff') { const [a, b] = damageRange(this.ctxAt(id, 1)); next = `<p class="hint">Next level: damage ${a}–${b}, mana ${this.ctxAt(id, 1).mana}.</p>`; }
    if (lv && sk.type === 'buff') next = `<p class="hint">Next level: barrier ${frostArmorBarrier(c.lvl + 1)}.</p>`;
    return `<div class="kv">${rows.join('')}</div>${next}`;
  }
  private passiveText(id: string, n: number) {
    const names: Record<string, string> = { burnDmg: 'Burn Damage', chillEffect: 'Chill Effect', shockEffect: 'Shock Effect' };
    return Object.entries(SKILLS[id].stats!).map(([k, v]) => names[k] ? `+${v * n}% ${names[k]}` : formatMod([k, v * n])).join(', ');
  }

  private pSkills() {
    const s = this.s, sim = this.sim, sel = SKILLS[this.selSkill] ? this.selSkill : 'fireball';
    const view = this.skillView;
    const sub = `<div class="subtabs" role="tablist">
      <button role="tab" data-act="sview:tree" aria-selected="${view === 'tree'}">Tree</button>
      <button role="tab" data-act="sview:prio" aria-selected="${view === 'prio'}">Priority${sim.blockedSlots().length ? '<i class="dot"></i>' : ''}</button></div>`;
    const head = phead('Skills', s.skillPts ? `${ic('skillpt', 'Skill points')}<b class="gold">${s.skillPts}</b> point${s.skillPts > 1 ? 's' : ''}` : 'No skill points');
    if (view === 'prio') { $('#p-skills').innerHTML = head + sub + this.prioView(); return; }
    const trees = Object.entries(TREES).map(([t, T]) => {
      const ids = Object.keys(SKILLS).filter(id => SKILLS[id].tree === t);
      const rows = [0, 1, 2, 3].map(r => ids.filter(id => SKILLS[id].row === r));
      return `<div class="stree t-${T.element}"><h3 class="${T.element}">${T.name}</h3>${rows.map((ids2, r) => `<div class="srow">${ids2.map(id => {
        const sk = SKILLS[id], lv = s.skills[id] || 0, locked = s.lvl < sk.reqLevel, can = sim.canLearn(id);
        const eff = lv ? lv + (sim.st.plus[t] || 0) : 0;
        return `<button class="snode ${isPassive(id) ? 'passive' : ''} ${locked ? 'locked' : ''} ${lv ? 'learned' : ''} ${can ? 'can' : ''} ${id === sel ? 'sel' : ''}" data-act="skillsel:${id}" aria-label="${esc(sk.name)}, level ${lv}">
          <span class="art"><img src="${skillIcon(id)}" alt=""></span><b class="lv">${eff > lv ? `<em>${eff}</em>` : lv}</b>${locked ? `<i class="req">${sk.reqLevel}</i>` : ''}</button>`;
      }).join('')}</div>${r < 3 ? '<div class="sline"></div>' : ''}`).join('')}</div>`;
    }).join('');
    const sk = SKILLS[sel], lv = s.skills[sel] || 0, passive = isPassive(sel);
    const sockets = passive ? '' : `<h4>Support gems</h4><div class="sockets">${SOCKET_LEVELS.map((need, i) => {
      const g = sim.socketsOf(sel)[i], open = lv >= need;
      if (g) return `<button class="sock full ${this.pickSocket === i ? 'sel' : ''}" data-act="sockpick:${i}" style="--gc:${gemColor(g.gem)}"><span class="hole">${itemPic(g, 'sockpic')}</span><span><b>${esc(GEMS[g.gem].name)}</b> <small>Lv ${g.lvl}</small><br><small>${esc(gemText(g))}</small></span></button>`;
      return `<button class="sock ${open ? '' : 'closed'} ${this.pickSocket === i ? 'sel' : ''}" data-act="sockpick:${i}" ${open ? '' : 'disabled'}><span class="hole"></span><span>${open ? 'Empty socket: tap to insert a gem' : `Opens at skill level ${need}`}</span></button>`;
    }).join('')}</div>${this.pickSocket != null && lv >= SOCKET_LEVELS[this.pickSocket] ? this.gemPicker(sel, this.pickSocket) : ''}`;
    $('#p-skills').innerHTML = `${head}${sub}
      <div class="strees">${trees}</div>
      <div class="sdetail framed">
        <div class="row"><span class="sdname"><span class="snode mini ${passive ? 'passive' : ''} learned"><span class="art"><img src="${skillIcon(sel)}" alt=""></span></span><span><b class="${sk.element}">${esc(sk.name)}</b><br><small>${passive ? 'Passive' : 'Active'} · Lv ${lv}/${skillMaxLevel(sel)}${lv && sim.st.plus[sk.tree] ? ` (+${sim.st.plus[sk.tree]})` : ''}</small></span></span>
          <button class="btn primary" data-act="learn:${sel}" ${sim.canLearn(sel) ? '' : 'disabled'}>${lv ? 'Level up' : 'Learn'}</button></div>
        ${sk.tags ? `<div class="chips">${sk.tags.filter(t => t !== 'hit').map(t => `<span class="chip">${t}</span>`).join('')}</div>` : ''}
        <p class="d">${esc(sk.description)}</p>
        ${s.lvl < sk.reqLevel ? `<p class="hint bad">${ic('lock')} Needs character level ${sk.reqLevel}.</p>` : ''}
        ${this.skillInfo(sel)}
        ${sockets}
        ${this.skillMsg ? `<p class="hint bad">${esc(this.skillMsg)}</p>` : ''}
      </div>
      <p class="hint">Each point in a skill adds ${8}% increased damage to the other skills of its tree. Passive skills work on their own.</p>`;
  }

  /** Custom dropdown: a button with the current value, and the option list while it is open. */
  private dropdown(key: string, label: string, cur: string, options: [string, string, string?][]): string {
    const open = this.openDD === key;
    const curOpt = options.find(o => o[0] === cur) ?? options[0];
    const pic = (o: [string, string, string?]) => (o[2] ? `<img src="${o[2]}" alt="">` : '');
    return `<div class="dd ${open ? 'open' : ''}"><button class="ddbtn" data-act="dd:${key}" aria-haspopup="listbox" aria-expanded="${open}" aria-label="${esc(label)}">${pic(curOpt)}<span>${esc(curOpt[1])}</span><i class="chev"></i></button>
      ${open ? `<div class="ddlist" role="listbox">${options.map(o => `<button role="option" aria-selected="${o[0] === cur}" data-act="ddpick:${key}:${o[0]}">${pic(o)}<span>${esc(o[1])}</span></button>`).join('')}</div>` : ''}</div>`;
  }

  private prioView(): string {
    const s = this.s, sim = this.sim;
    const learned = Object.keys(SKILLS).filter(k => s.skills[k] > 0 && !isPassive(k));
    const skillOpts: [string, string, string?][] = [['', 'Empty'], ...learned.map(k => [k, SKILLS[k].name, skillIcon(k)] as [string, string, string])];
    const condOpts: [string, string][] = Object.entries(CONDITIONS);
    return `<p class="hint">She checks the slots from top to bottom and casts the first skill that is ready, affordable and whose condition is true. If none fits, she uses Staff Spark (free, weak). Drag a card by its handle to reorder.</p>
      ${sim.blockedSlots().map(([i, b]) => `<p class="hint bad">Slot ${i + 1} is never cast: slot ${b + 1} is set to "Always" and is always ready.</p>`).join('')}
      <div class="prio">${s.slots.map((sl, i) => `<div class="pcard" data-slot="${i}">
        <span class="grip" data-grip="${i}" aria-hidden="true"><b>${i + 1}</b></span>
        <span class="snode mini ${sl.id ? 'learned' : 'empty'}"><span class="art">${sl.id ? `<img src="${skillIcon(sl.id)}" alt="">` : ''}</span></span>
        <span class="psel">${this.dropdown(`slot:${i}`, `Skill in slot ${i + 1}`, sl.id ?? '', skillOpts)}${this.dropdown(`cond:${i}`, `Condition for slot ${i + 1}`, sl.cond, condOpts)}</span>
        <span class="updn vert"><button class="btn sq" data-act="up:${i}" ${i ? '' : 'disabled'} aria-label="Move up">▲</button><button class="btn sq" data-act="down:${i}" ${i < 3 ? '' : 'disabled'} aria-label="Move down">▼</button></span></div>`).join('')}</div>
      <div class="row" style="justify-content:flex-start"><button class="btn" data-act="autoorder">${ic('sort')}Sort automatically</button></div>`;
  }

  private gemPicker(skill: string, i: number): string {
    const sim = this.sim, cur = sim.socketsOf(skill)[i];
    const gems = this.s.bag.filter(isGem).sort((a, b) => Number(gemFits(b.gem, skill)) - Number(gemFits(a.gem, skill)) || b.lvl - a.lvl);
    const list = gems.map(g => {
      const fits = gemFits(g.gem, skill), dup = sim.socketsOf(skill).some((o, j) => o && j !== i && o.gem === g.gem);
      return `<button class="gemopt" data-act="sock:${skill}:${i}:${g.id}" ${fits && !dup ? '' : 'disabled'} style="--gc:${gemColor(g.gem)}">${itemPic(g, 'sockpic')}
        <span><b>${esc(GEMS[g.gem].name)}</b> <small>Lv ${g.lvl}</small><br><small>${fits ? (dup ? 'Already in this skill.' : esc(gemText(g))) : `Does not fit: needs ${GEMS[g.gem].requires.join(', ')}`}</small></span></button>`;
    }).join('');
    return `<div class="picker">${cur ? `<button class="btn sm" data-act="unsock:${skill}:${i}">Take ${esc(GEMS[cur.gem].name)} out</button>` : ''}
      ${list || '<p class="hint">No support gems in the bag yet. Champions, elites and bosses drop them more often.</p>'}</div>`;
  }

  /* ----- bag ----- */
  private pBag() {
    const s = this.s, sim = this.sim;
    const sel = this.selBag != null ? s.bag.find(i => i.id === this.selBag) ?? null : null;
    if (!sel) { this.selBag = null; this.moveMode = false; }
    for (const id of this.sellSel) if (!s.bag.some(i => i.id === id)) this.sellSel.delete(id);
    const eqSlot = (slot: Slot) => {
      const it = s.equip[slot];
      return `<button class="eqslot e-${slot} ${it ? 'r' + it.r : 'empty'} ${this.selEq === slot ? 'sel' : ''}" data-act="eqsel:${slot}" aria-label="${SLOT_NAMES[slot]}${it ? ': ' + esc(it.name) : ', empty'}">
        ${it ? itemPic(it, 'pic', true) : `<img class="glyph" src="${spriteUrl(`glyph-${slot}.png`)}" alt="">`}</button>`;
    };
    const cells = this.moveMode && sel ? (() => {
      const out: string[] = [];
      for (let y = 0; y < BAG_H; y++) for (let x = 0; x < BAG_W; x++)
        if (canPlace(s.bag, sel, x, y)) out.push(`<button class="cell ok" style="--x:${x};--y:${y}" data-act="bagcell:${x}:${y}" aria-label="Place here"></button>`);
      return out.join('');
    })() : '';
    const items = s.bag.map(it => {
      const [w, h] = itemSize(it), r = bagCls(it);
      const picked = this.sellMode && this.sellSel.has(it.id);
      return `<button class="bi ${r} ${it.id === this.selBag ? 'sel' : ''} ${picked ? 'picked' : ''}" style="--x:${it.bx};--y:${it.by};--w:${w};--h:${h}${isGem(it) ? `;--gc:${gemColor(it.gem)}` : ''}" data-act="bagsel:${it.id}" aria-label="${esc(sim.itemName(it))}" ${this.sellMode ? `aria-pressed="${picked}"` : ''}>${itemPic(it, 'pic', true)}${bagBadges(it, s.equip)}</button>`;
    }).join('');
    let tip = '';
    if (this.sellMode) tip = '';
    else if (sel) {
      const learned = Object.keys(s.skills);
      if (isGem(sel)) {
        const quick = learned.filter(k => !isPassive(k) && gemFits(sel.gem, k)).flatMap(k => {
          const i = sim.socketsOf(k).findIndex((g, j) => !g && sim.socketOpen(k, j));
          if (i < 0 || sim.socketsOf(k).some(g => g?.gem === sel.gem)) return [];
          return [`<button class="btn primary" data-act="sock:${k}:${i}:${sel.id}">Socket into ${esc(SKILLS[k].name)}</button>`];
        }).join('');
        tip = itemTooltip(sel, null, `${quick}<button class="btn" data-act="move">${this.moveMode ? 'Cancel move' : 'Move'}</button><button class="btn" data-act="sell:${sel.id}">${ic('sell')}Sell · ${sellValue(sel)}g</button>`, { learned });
      } else if (isKey(sel)) {
        tip = itemTooltip(sel, null, `${sim.rift.unlocked() ? `<button class="btn primary" data-act="riftkey:${sel.id}">Open rift</button>` : ''}<button class="btn" data-act="move">${this.moveMode ? 'Cancel move' : 'Move'}</button><button class="btn" data-act="sell:${sel.id}">${ic('sell')}Sell · ${sellValue(sel)}g</button>`, { save: s });
      } else {
        tip = itemTooltip(sel, s.equip[sel.slot], `${sel.unid ? `<button class="btn primary" data-act="ident:${sel.id}">Identify</button>` : `<button class="btn primary" data-act="equip:${sel.id}">Equip</button>`}<button class="btn" data-act="move">${this.moveMode ? 'Cancel move' : 'Move'}</button><button class="btn" data-act="sell:${sel.id}">${ic('sell')}Sell · ${sellValue(sel)}g</button>${salvageBtn(sel)}`, { compare: !sel.unid });
      }
    } else if (this.selEq && s.equip[this.selEq]) {
      tip = itemTooltip(s.equip[this.selEq]!, null, `<button class="btn" data-act="unequip:${this.selEq}">Take off</button>`);
    }
    this.showTip(tip);
    const used = s.bag.reduce((n, it) => { const [w, h] = itemSize(it); return n + w * h; }, 0);
    const sellSum = [...this.sellSel].reduce((n, id) => { const it = s.bag.find(i => i.id === id); return n + (it ? sellValue(it) : 0); }, 0);
    const tools = this.sellMode
      ? `<div class="sellbar"><span>${this.sellSel.size ? `<b>${this.sellSel.size}</b> selected · <span class="gold">${fmt(sellSum)}</span>` : 'Tap items to select them'}</span>
          <span class="updn"><button class="btn" data-act="sellpick:low">Select Normal & Magic</button><button class="btn" data-act="sellmode">Cancel</button>
          <button class="btn primary" data-act="sellsel" ${this.sellSel.size ? '' : 'disabled'}>${ic('sell')}Sell ${this.sellSel.size || ''}</button></span></div>`
      : `<div class="bagmats"><span class="hint">Materials</span>${matsHeader(s)}</div><div class="row"><span class="hint">${used} / ${BAG_W * BAG_H} cells${this.moveMode ? ' · tap a green spot to place the item' : ' · tap an item for details'}</span>
          <span class="updn"><button class="btn" data-act="sortbag">${ic('sort')}Sort</button><button class="btn" data-act="sellmode" ${s.bag.length ? '' : 'disabled'}>${ic('sell')}Sell…</button></span></div>`;
    $('#p-bag').innerHTML = `
      ${phead('Inventory', `${ic('gold', 'Gold')}<span class="gold">${fmt(s.gold)}</span>`)}
      <div class="doll" style="--hero:url('${spriteUrl('hero-idle.png')}')">${eqSlot('weapon')}${eqSlot('helm')}${eqSlot('armor')}${eqSlot('amulet')}${eqSlot('ring')}</div>
      ${tools}
      <div class="bagwell"><div class="bag ${this.sellMode ? 'selling' : ''}" style="--cols:${BAG_W};--rows:${BAG_H}">${items}${cells}</div></div>
      ${this.bagMsg ? `<p class="hint bad">${esc(this.bagMsg)}</p>` : ''}
      <p class="hint">Staffs take 1×3 cells, armor 2×3, helms 2×2, amulets, rings and gems 1×1.</p>
      ${this.sellMode ? '' : this.eco.salvageRow()}
      ${lootRulesHtml(s, (k, l, c, o) => this.dropdown(k, l, c, o))}`;
    this.placeTip();
  }

  /** Item tooltip: floats next to the menu on wide screens, card above the tab bar on phones. */
  private showTip(html: string) {
    const el = $('#tipfloat');
    if (!html) { el.hidden = true; el.innerHTML = ''; $('#sheet').classList.remove('tipopen'); return; }
    el.innerHTML = `<button class="close sm" data-act="tipclose" aria-label="Close details"></button>${html}`;
    el.hidden = false;
    $('#sheet').classList.toggle('tipopen', true);
  }
  private placeTip() {
    const el = $('#tipfloat');
    if (el.hidden) return;
    const st = $('#stage');
    if (st.clientWidth < 820) { el.style.top = ''; $('#sheet').style.setProperty('--tiph', el.offsetHeight + 'px'); return; }
    const anchor = document.querySelector<HTMLElement>('#p-bag .bi.sel, #p-bag .eqslot.sel');
    const sr = st.getBoundingClientRect(), h = el.offsetHeight;
    const y = anchor ? anchor.getBoundingClientRect().top - sr.top - 20 : 60;
    el.style.top = `${Math.max(8, Math.min(st.clientHeight - h - 8, y))}px`;
  }

  /* ----- town ----- */
  private pTown() {
    const s = this.s, sim = this.sim, price = potionPrice(s.lvl), rc = respecCost(s.lvl), P = HERO.potions;
    const diffs = DIFFICULTIES.map((d, i) => `<button class="btn diffbtn ${i === s.difficulty ? 'primary' : ''}" data-act="diff:${i}" ${s.progress[i] ? '' : 'disabled'} aria-pressed="${i === s.difficulty}">${ic(s.progress[i] ? DIFF_ICON[i] : 'lock')}${d.name}</button>`).join('');
    const fuse = sim.fusable().map(([g, l, n]) => `<div class="row"><span style="color:${gemColor(g)}">${esc(GEMS[g].name)} Lv ${l} ×${n}</span><button class="btn" data-act="fuse:${g}:${l}">Fuse 3 → Lv ${l + 1} · ${sim.fuseCost(l)}g</button></div>`).join('');
    const head = `${phead('Town', `${matsHeader(s)}${ic('gold', 'Gold')}<span class="gold" id="towngold">${fmt(s.gold)}</span>`)}${this.eco.nav()}`;
    const eco = this.eco.view === 'rift' ? this.rift.render() : this.meta.townView(this.eco.view) ?? this.eco.render(); // rift, meta: board, codex
    if (eco != null) { $('#p-town').innerHTML = head + eco; return; }
    $('#p-town').innerHTML = `
      ${head}
      <h3>Difficulty</h3>
      <div class="row" style="justify-content:flex-start">${diffs}</div>
      <p class="hint">${DIFFICULTIES.map(d => `${d.name}: monsters +${d.levelAdd} levels, resistances ${d.resPenalty}%`).join(' · ')}. Beat Mother Vesper to open the next one.</p>
      <h3>Merchant</h3>
      <div class="kv"><div><span>Health potions</span>${s.hpPot}</div><div><span>Mana potions</span>${s.mpPot}</div></div>
      <div class="row" style="justify-content:flex-start">
        <button class="btn" data-act="buy:hp:5">Buy 5 health · ${price * 5}g</button>
        <button class="btn" data-act="buy:mp:5">Buy 5 mana · ${price * 5}g</button></div>
      <p class="hint" id="townmsg">Health potions restore ${P.life * 100}% life, mana potions ${P.mana * 100}% mana. ${P.cooldown}s cooldown each.</p>
      <h3>Gem cutter</h3>
      ${fuse || '<p class="hint">Bring three support gems of the same kind and level to fuse them into one of the next level.</p>'}
      <h3>Potion belt</h3>
      <label class="range" for="hpTh"><span>Drink health potion below</span><b id="hpThv">${s.hpTh}%</b><input type="range" id="hpTh" min="10" max="90" step="5" value="${s.hpTh}"></label>
      <label class="range" for="mpTh"><span>Drink mana potion below</span><b id="mpThv">${s.mpTh}%</b><input type="range" id="mpTh" min="5" max="90" step="5" value="${s.mpTh}"></label>
      <h3>Behaviour</h3>
      <label class="check" for="autoAdvance"><input type="checkbox" id="autoAdvance" ${s.autoAdvance ? 'checked' : ''}> Move to the next area after clearing one</label>
      <label class="check" for="autoReturn"><input type="checkbox" id="autoReturn" ${s.autoReturn ? 'checked' : ''}> After dying, return to the previous area automatically</label>
      <label class="check" for="kite"><input type="checkbox" id="kite" ${s.kite ? 'checked' : ''}> Keep distance from melee enemies (kiting)</label>
      <h3>${ic('settings')}Display</h3>
      <label class="check" for="dmgNumbers"><input type="checkbox" id="dmgNumbers" ${s.settings.dmgNumbers ? 'checked' : ''}> Show damage numbers</label>
      <label class="check" for="lootLabels"><input type="checkbox" id="lootLabels" ${s.settings.lootLabels ? 'checked' : ''}> Show loot names on the ground</label>
      ${soundSettings(s)}
      <h3>Mystic</h3>
      <div class="row"><span class="hint">Reset all attribute and skill points. Gems go back to the bag.</span><button class="btn" data-act="respec">Respec · ${rc}g</button></div>
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
        <ul><li>New: 15 skills incl. passives, burn/chill/freeze/shock, 17 support gems with sockets and gem fusing, affix tiers, +skill items, 7 uniques with special effects, bag grid, Nightmare and Hell, offline progress (50%, up to 8 hours).</li>
        <li>New: salvage, crafting embers at the forge, corruption altar, gambling vendor, loot rules, stash.</li>
        <li>New: bounty board, area tyrants, area events, unique codex with imprints, ember points after level 60, feats and titles.</li>
                <li>New: endless rifts with keys and modifiers, timer, Rift Guardian, atlas, pinnacle boss with mythic uniques (Town › Rifts, open after Mother Vesper; add ?dev to the URL to test).</li>
        <li>Not yet: sets. Numbers are a first guess for testing, not balanced.</li></ul></div>
      <div class="row"><span class="hint">Start a new hero. This deletes the current one.</span><button class="btn sm" data-act="reset">${this.resetArm ? 'Tap again to wipe' : 'Start over'}</button></div>`;
  }

  /* ---------- input ---------- */
  setTab(t: Tab | null) {
    this.tab = t && this.tab !== t ? t : null;
    document.querySelectorAll<HTMLElement>('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.act === 'tab:' + this.tab)));
    $('#sheet').hidden = !this.tab;
    $('#stage').classList.toggle('open', !!this.tab);
    document.querySelectorAll('.panel').forEach(x => x.classList.toggle('active', x.id === 'p-' + this.tab));
    this.moveMode = false; this.bagMsg = ''; this.skillMsg = '';
    this.openDD = null; this.sellMode = false; this.sellSel.clear();
    if (this.tab !== 'bag') this.showTip('');
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
    if (this.openDD && !(e.target as HTMLElement).closest('.dd')) { this.openDD = null; this.sim.dirty.add(this.tab ?? 'skills'); if (!b) this.draw(); }
    if (!b || b.disabled) return;
    const [a, x, y, z] = (b.dataset.act || '').split(':');
    const sim = this.sim, s = this.s, D = sim.dirty;
    switch (a) {
      case 'sview': this.skillView = x as 'tree' | 'prio'; this.openDD = null; D.add('skills'); break;
      case 'dd': { const key = y != null ? `${x}:${y}` : x; this.openDD = this.openDD === key ? null : key; D.add(this.tab ?? 'skills'); break; }
      case 'ddpick': {
        // ddpick:slot:2:fireball · ddpick:cond:2:always · ddpick:filter:3
        if (x === 'slot') sim.setSlotSkill(+y, z || null);
        else if (x === 'cond') sim.setSlotCond(+y, z);
        else this.eco.pick(x, y, z);
        this.openDD = null; D.add(this.tab ?? 'skills');
        break;
      }
      case 'sellmode': this.sellMode = !this.sellMode; this.sellSel.clear(); this.selBag = null; this.selEq = null; this.moveMode = false; D.add('bag'); break;
      case 'sellpick': for (const it of s.bag) if (isEquip(it) && it.r < 2) this.sellSel.add(it.id); D.add('bag'); break;
      case 'sellsel': {
        let n = 0, g = 0;
        for (const id of this.sellSel) { const it = s.bag.find(i => i.id === id); if (it) { g += sellValue(it); n++; sim.sell(id); } }
        if (n) this.addLog(`Sold ${n} item${n > 1 ? 's' : ''} for ${fmt(g)} gold.`, 'good');
        this.sellSel.clear(); this.sellMode = false; D.add('bag');
        break;
      }
      case 'tipclose': this.selBag = null; this.selEq = null; this.moveMode = false; D.add('bag'); break;
      case 'tab': this.setTab(x as Tab); break;
      case 'close': this.setTab(null); break;
      case 'closesum': $('#summary').hidden = true; break;
      case 'autoorder': sim.autoOrder(); this.addLog('Cast order sorted automatically.', 'good'); break;
      case 'log':
        this.showLog = !this.showLog;
        $('#log').hidden = !this.showLog;
        b.setAttribute('aria-pressed', String(this.showLog));
        this.logDirty = true;
        break;
      case 'speed': s.speed = +x; break;
      case 'attr': sim.addAttr(x as Attr, +(y || 1)); break;
      case 'skillsel':
        if (this.selSkill !== x) this.pickSocket = null;
        this.selSkill = x; this.skillMsg = '';
        if (this.tab !== 'skills') this.setTab('skills');
        D.add('skills');
        break;
      case 'learn': sim.learnSkill(x); break;
      case 'sockpick': this.pickSocket = this.pickSocket === +x ? null : +x; this.skillMsg = ''; D.add('skills'); break;
      case 'sock': {
        const err = sim.socketGem(x, +y, +z);
        if (this.tab === 'bag') { this.bagMsg = err ?? ''; if (!err) this.selBag = null; D.add('bag'); }
        else { this.skillMsg = err ?? ''; if (!err) this.pickSocket = null; D.add('skills'); }
        D.add('slots');
        break;
      }
      case 'unsock': { const err = sim.unsocket(x, +y); this.skillMsg = err ?? ''; if (!err) this.pickSocket = null; D.add('skills'); D.add('slots'); break; }
      case 'up': case 'down': sim.moveSlot(+x, a === 'up' ? -1 : 1); break;
      case 'bagsel':
        if (this.sellMode) { if (this.sellSel.has(+x)) this.sellSel.delete(+x); else this.sellSel.add(+x); D.add('bag'); break; }
        this.selBag = this.selBag === +x ? null : +x; this.selEq = null; this.moveMode = false; this.bagMsg = ''; D.add('bag'); break;
      case 'eqsel': this.selEq = this.selEq === x ? null : (x as Slot); this.selBag = null; this.moveMode = false; this.bagMsg = ''; D.add('bag'); break;
      case 'move': this.moveMode = !this.moveMode; D.add('bag'); break;
      case 'bagcell': if (this.selBag != null) sim.moveItem(this.selBag, +x, +y); this.moveMode = false; D.add('bag'); break;
      case 'sortbag': sim.sortBag(); break;
      case 'equip': sim.equip(+x); this.selBag = null; D.add('slots'); break;
      case 'unequip': if (!sim.unequip(x as Slot)) this.bagMsg = 'No room in the bag.'; else this.selEq = null; D.add('bag'); break;
      case 'sell': sim.sell(+x); this.selBag = null; break;
      case 'salv': salvage(sim, +x); this.selBag = null; break;
      case 'sellLow': sim.sellLow(); break;
      case 'buy': { const err = sim.buyPotions(x as 'hp' | 'mp', +y); if (err) this.townMsg(err); break; }
      case 'fuse': { const err = sim.fuseGems(x, +y); if (err) this.townMsg(err); D.add('town'); break; }
      case 'diff': sim.setDifficulty(+x); break;
      case 'respec': { const err = sim.respec(); if (err) this.townMsg(err); break; }
      case 'return': sim.returnFromTown(); break;
      case 'export': void this.doExport(); break;
      case 'copy': void this.doCopy(); break;
      case 'import': void this.doImport(); break;
      case 'reset':
        if (!this.resetArm) {
          this.resetArm = true; D.add('town');
          setTimeout(() => { this.resetArm = false; this.sim.dirty.add('town'); }, 4000);
          break;
        }
        this.resetArm = false;
        this.game.wipe();
        break;
      default: if (!this.rift.click(a, x) && !this.eco.click(a, x, y)) this.meta.click(a, x, y);
    }
    this.draw();
  }

  /* ----- drag to reorder the cast priority ----- */
  private onPointerDown(e: PointerEvent) {
    const g = (e.target as HTMLElement).closest<HTMLElement>('[data-grip]');
    if (!g) return;
    e.preventDefault();
    const from = +g.dataset.grip!;
    this.drag = { from, to: from, id: e.pointerId, y0: e.clientY };
    g.setPointerCapture(e.pointerId);
    document.querySelector(`.pcard[data-slot="${from}"]`)?.classList.add('dragging');
  }
  private onPointerMove(e: PointerEvent) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const cards = [...document.querySelectorAll<HTMLElement>('.pcard')];
    const src = cards[this.drag.from];
    if (!src) return;
    const dy = e.clientY - this.drag.y0, step = src.offsetHeight + 6;
    const to = Math.max(0, Math.min(cards.length - 1, this.drag.from + Math.round(dy / step)));
    this.drag.to = to;
    src.style.transform = `translateY(${dy}px)`;
    cards.forEach((c, i) => {
      if (i === this.drag!.from) return;
      const shift = this.drag!.from < i && i <= to ? -step : to <= i && i < this.drag!.from ? step : 0;
      c.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }
  private onPointerUp(e: PointerEvent) { if (this.drag && e.pointerId === this.drag.id) this.endDrag(true); }
  private endDrag(apply: boolean) {
    if (!this.drag) return;
    const { from, to } = this.drag;
    this.drag = null;
    if (apply && to !== from) { const d = to > from ? 1 : -1; for (let i = from; i !== to; i += d) this.sim.moveSlot(i, d); }
    this.sim.dirty.add('skills');
    this.draw();
  }

  private onChange(e: Event) {
    const t = e.target as HTMLInputElement & HTMLSelectElement, sim = this.sim, s = this.s;
    if (t.id === 'zonesel') sim.selectZone(+t.value);
    else if (t.dataset.slot != null) sim.setSlotSkill(+t.dataset.slot, t.value || null);
    else if (t.dataset.cond != null) sim.setSlotCond(+t.dataset.cond, t.value);
    else if (this.eco.change(t)) { /* loot rules */ }
    else if (this.rift.change(t)) { /* rift auto mode */ }
    else if (t.id === 'autoAdvance') s.autoAdvance = t.checked;
    else if (t.id === 'autoReturn') s.autoReturn = t.checked;
    else if (t.id === 'kite') s.kite = t.checked;
    else if (t.id === 'dmgNumbers') s.settings.dmgNumbers = t.checked;
    else if (t.id === 'lootLabels') s.settings.lootLabels = t.checked;
    else soundInput(t, s);
    this.draw();
  }

  private onInput(e: Event) {
    const t = e.target as HTMLInputElement;
    if (t.id === 'hpTh' || t.id === 'mpTh') { this.s[t.id] = +t.value; $('#' + t.id + 'v').textContent = t.value + '%'; }
    else if (soundInput(t, this.s)) { /* feel: volume slider */ }
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

