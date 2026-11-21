/**
 * Skills menu: one page per skill tree (tabs, swipe left/right), a detail card for the selected skill with
 * its numbers, modifier tiers and gem sockets, and the cast priority page. Everything comes from skills.json,
 * so another class's trees show up here without new code. ui.ts only routes clicks and renders the panel.
 */
import {
  CONDITIONS, GEMS, MOD_LEVELS, SKILLS, SKILL_SCALING, SOCKET_LEVELS, STAT_NAMES, TREES, ELEMENT_NAMES, isPassive, skillMaxLevel,
} from '../content/index.ts';
import { calcStats, damageRange, formatMod, frostArmorBarrier, gemFits, gemText, skillCtx, type SkillCtx } from '../sim/formulas.ts';
import { chooseMod, modChoice, modRespecCost, modTierOpen, pendingMods, resetMods } from '../sim/skillmods.ts';
import type { Sim } from '../sim/sim.ts';
import { isGem, type GemItem, type SaveState } from '../sim/types.ts';
import { esc, ic, itemPic, skillIcon } from './html.ts';
import { gemColor } from './gemcolor.ts';

/** Support gems the hero owns and may socket. One place, so the gem pouch (UI package) only changes this line. */
export const ownedGems = (s: SaveState): GemItem[] => s.bag.filter(isGem);

type Dropdown = (key: string, label: string, cur: string, options: [string, string, string?][]) => string;
const TREE_IDS = () => Object.keys(TREES);
const treeSkills = (t: string) => Object.keys(SKILLS).filter(id => SKILLS[id].tree === t);
const one = (v: number) => (Math.round(v * 10) / 10).toString();

/** HUD buff chips of skill effects: Rime Shell and Storm Lanterns. */
export function skillBuffs(sim: Sim): string[] {
  const out: string[] = [], sh = sim.spells.shell;
  if (sh) out.push(`<span class="buff" title="${esc(SKILLS[sh.skill].name)}"><img src="${skillIcon(sh.skill)}" alt="${esc(SKILLS[sh.skill].name)}"><b>${Math.ceil(sh.t)}</b></span>`);
  const by = new Map<string, number>();
  for (const c of sim.spells.constructs) by.set(c.skill, Math.max(by.get(c.skill) ?? 0, c.life - c.t));
  for (const [id, t] of by) {
    const n = sim.spells.constructs.filter(c => c.skill === id).length;
    out.push(`<span class="buff" title="${esc(SKILLS[id].name)}"><img src="${skillIcon(id)}" alt="${esc(SKILLS[id].name)}"><b>${n > 1 ? n + '×' : ''}${Math.ceil(t)}</b></span>`);
  }
  return out;
}

export class SkillsUI {
  sel = 'fireball';
  /** tree id, or 'prio' for the cast priority page */
  page = 'ember';
  pickSocket: number | null = null;
  msg = '';
  /** modifier option tapped once ("skill:tier:opt"), or "reset:skill": a second tap confirms */
  private arm: string | null = null;
  private swipe: { x: number; y: number; id: number } | null = null;
  private swallowClick = false;
  private opened = false;
  private sim: () => Sim;
  private redraw: () => void;

  constructor(sim: () => Sim, redraw: () => void) {
    this.sim = sim; this.redraw = redraw;
    document.addEventListener('pointerdown', e => {
      if (!(e.target as HTMLElement).closest?.('.stpage')) return;
      this.swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    document.addEventListener('pointerup', e => {
      const sw = this.swipe;
      this.swipe = null;
      if (!sw || sw.id !== e.pointerId) return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
      if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const ids = TREE_IDS(), i = ids.indexOf(this.page);
      if (i < 0) return;
      const j = Math.max(0, Math.min(ids.length - 1, i + (dx < 0 ? 1 : -1)));
      if (j === i) return;
      this.swallowClick = true; setTimeout(() => { this.swallowClick = false; }, 80);
      this.openTree(ids[j]);
      this.redraw();
    });
    document.addEventListener('pointercancel', () => { this.swipe = null; });
  }
  private get s() { return this.sim().s; }
  /** Another hero was loaded: start again from its cast list. */
  forget() { this.opened = false; this.arm = null; this.pickSocket = null; this.msg = ''; }

  private openTree(t: string) {
    this.page = t; this.arm = null; this.msg = '';
    if (SKILLS[this.sel]?.tree !== t) { this.sel = treeSkills(t)[0]; this.pickSocket = null; }
    this.sim().dirty.add('skills');
  }
  /** Select a skill (also from the skill bar): jumps to its tree page. */
  select(id: string) {
    if (!SKILLS[id]) return;
    if (this.sel !== id) { this.pickSocket = null; this.arm = null; }
    this.sel = id; this.msg = '';
    this.page = SKILLS[id].tree;
    this.sim().dirty.add('skills');
  }

  /** Handle a click of the skills menu. Returns true if it was one. */
  click(a: string, x: string, y: string, z: string, tab: string | null): boolean {
    if (this.swallowClick) return a === 'skillsel' || a === 'stree';
    const sim = this.sim(), s = sim.s, D = sim.dirty;
    switch (a) {
      case 'stree': if (x === 'prio') { this.page = 'prio'; D.add('skills'); } else this.openTree(x); return true;
      case 'sview': this.page = x === 'prio' ? 'prio' : SKILLS[this.sel].tree; D.add('skills'); return true;
      case 'learn': sim.learnSkill(x); this.arm = null; return true;
      case 'sockpick': this.pickSocket = this.pickSocket === +x ? null : +x; this.msg = ''; D.add('skills'); return true;
      case 'unsock': { const err = sim.unsocket(x, +y); this.msg = err ?? ''; if (!err) this.pickSocket = null; D.add('skills'); D.add('slots'); return true; }
      case 'sock': {
        if (tab === 'bag') return false;
        const err = sim.socketGem(x, +y, +z);
        this.msg = err ?? ''; if (!err) this.pickSocket = null;
        D.add('skills'); D.add('slots');
        return true;
      }
      case 'smod': {
        const key = `${x}:${y}:${z}`;
        if (this.arm !== key) { this.arm = key; this.msg = ''; D.add('skills'); return true; }
        this.arm = null;
        const err = chooseMod(s, x, +y, +z);
        this.msg = err ?? '';
        if (!err) { sim.recalc(); sim.log(`**${SKILLS[x].name}**: ${SKILLS[x].mods![+y][+z].name}.`, 'lvl'); }
        D.add('skills'); D.add('hero');
        return true;
      }
      case 'smodreset': {
        if (this.arm !== 'reset:' + x) { this.arm = 'reset:' + x; this.msg = ''; D.add('skills'); return true; }
        this.arm = null;
        const err = resetMods(s, x);
        this.msg = err ?? '';
        if (!err) { sim.recalc(); D.add('town'); sim.log(`Modifiers of **${SKILLS[x].name}** reset.`, 'lvl'); }
        D.add('skills');
        return true;
      }
    }
    return false;
  }

  /* ---------- rendering ---------- */
  render(dropdown: Dropdown): string {
    const sim = this.sim(), s = sim.s;
    // first open: start on the tree of the top skill of the cast list
    if (!this.opened) { this.opened = true; const top = s.slots.find(x => x.id)?.id; if (top && SKILLS[top]) { this.sel = top; this.page = SKILLS[top].tree; } }
    if (!SKILLS[this.sel]) this.sel = treeSkills(TREE_IDS()[0])[0];
    if (this.page !== 'prio' && !TREES[this.page]) this.page = SKILLS[this.sel].tree;
    const dot = (t: string) => treeSkills(t).some(id => (s.skillPts > 0 && sim.canLearn(id)) || pendingMods(s, id) > 0);
    const tabs = TREE_IDS().map(t => `<button role="tab" class="t-${TREES[t].element}" data-act="stree:${t}" aria-selected="${this.page === t}">${esc(TREES[t].name)}${dot(t) ? '<i class="dot"></i>' : ''}</button>`).join('')
      + `<button role="tab" data-act="stree:prio" aria-selected="${this.page === 'prio'}" title="Cast priority">Order${sim.blockedSlots().length ? '<i class="dot bad"></i>' : ''}</button>`;
    const pts = s.skillPts ? `<span class="skpts" title="Skill points">${ic('skillpt', 'Skill points')}<b>${s.skillPts}</b></span>` : '';
    const head = `<div class="skhead"><div class="sktabs" role="tablist" aria-label="Skill trees">${tabs}</div>${pts}<button class="close" data-act="close" aria-label="Close menu"></button></div>`;
    if (this.page === 'prio') return head + this.prioView(dropdown);
    return head + this.treePage(this.page) + this.detail(this.sel) +
      `<p class="hint">Swipe left or right to change the tree. Each point in a skill adds ${SKILL_SCALING.synergyPerPoint}% increased damage to the other skills of its tree.</p>`;
  }

  private treePage(t: string): string {
    const sim = this.sim(), s = sim.s, T = TREES[t], ids = treeSkills(t);
    const rows = [...new Set(ids.map(id => SKILLS[id].row))].sort((a, b) => a - b);
    const node = (id: string) => {
      const sk = SKILLS[id], lv = s.skills[id] || 0, locked = s.lvl < sk.reqLevel, can = sim.canLearn(id), passive = isPassive(id);
      const eff = lv ? lv + (sim.st.plus[t] || 0) : 0;
      const pips = sk.mods ? `<span class="mpips">${sk.mods.map((_, i) => `<i class="${modChoice(s, id, i) >= 0 && modTierOpen(s, id, i) ? 'on' : modTierOpen(s, id, i) ? 'open' : ''}"></i>`).join('')}</span>` : '';
      return `<button class="scard ${id === this.sel ? 'sel' : ''}" data-act="skillsel:${id}" aria-label="${esc(sk.name)}, level ${lv}${locked ? `, needs level ${sk.reqLevel}` : ''}">
        <span class="snode ${passive ? 'passive' : ''} ${locked ? 'locked' : ''} ${lv ? 'learned' : ''} ${can ? 'can' : ''} ${id === this.sel ? 'sel' : ''}"><span class="art"><img src="${skillIcon(id)}" alt=""></span>
        <b class="lv">${eff > lv ? `<em>${eff}</em>` : lv}</b>${locked ? `<i class="req">${sk.reqLevel}</i>` : ''}</span>
        <span class="sname">${esc(sk.name)}</span>${pips}</button>`;
    };
    return `<div class="stpage t-${T.element}" data-tree="${t}"><p class="stdesc ${T.element}">${esc(T.description)}</p>
      ${rows.map((r, i) => `<div class="srow2">${ids.filter(id => SKILLS[id].row === r).map(node).join('')}</div>${i < rows.length - 1 ? '<div class="sline"></div>' : ''}`).join('')}
      <div class="stdots">${TREE_IDS().map(x => `<i class="${x === t ? 'on' : ''}"></i>`).join('')}</div></div>`;
  }

  private ctxAt(id: string, add: number): SkillCtx {
    const s2 = structuredClone(this.s) as SaveState;
    s2.skills[id] = (s2.skills[id] || 0) + add;
    return skillCtx(s2, calcStats(s2), id);
  }
  private passiveText(id: string, n: number) {
    return Object.entries(SKILLS[id].stats!).map(([k, v]) => STAT_NAMES[k] ? `+${one(v * n)}% ${STAT_NAMES[k]}` : formatMod([k, Math.round(v * n * 10) / 10])).join(', ');
  }

  /** Numbers of a skill: depend on its type, so every type shows what matters for it. */
  private info(id: string): string {
    const sk = SKILLS[id], sim = this.sim(), lv = this.s.skills[id] || 0;
    if (isPassive(id)) {
      const eff = sim.st.plus[sk.tree] || 0, tot = lv ? lv + eff : 0;
      return `<div class="kv one">${tot ? `<div><span>Now</span>${esc(this.passiveText(id, tot))}</div>` : ''}<div><span>Next level</span>${esc(this.passiveText(id, tot ? tot + 1 : 1 + eff))}</div></div>`;
    }
    const c = lv ? sim.ctx(id) : this.ctxAt(id, 1), rows: string[] = [], type = sk.type;
    const add = (l: string, v: string) => rows.push(`<div><span>${l}</span>${v}</div>`);
    const dmg = () => { const [a, b] = damageRange(c); return `${a}–${b}`; };
    switch (type) {
      case 'buff': add('Barrier', String(Math.round(frostArmorBarrier(c.lvl) * (1 + (c.g.barrierPct || 0) / 100)))); add('Duration', `${one(c.duration)}s`); if (c.g.retaliate || c.g.breakNova) add('Cold damage', dmg()); break;
      case 'beam': add('Damage per pulse', dmg()); add('Pulses', `${c.ticks} in ${c.castTime.toFixed(2)}s`); add('Reach', `${sk.range} tiles`); break;
      case 'curse': add('Effect', `+${one(c.curse)}% ${ELEMENT_NAMES[c.el].toLowerCase()} damage taken${c.g.curseAll ? `, +${one(c.curse / 2)}% other elements` : ''}`); add('Duration', `${one(c.duration)}s`); break;
      case 'field': add('Damage per pulse', dmg()); add('Pulses', `every ${one((sk.tick || 0.5) / c.rate)}s for ${one(c.duration)}s`); break;
      case 'ward': add('Barrier', `${one(c.wardPct)}% of life (${Math.round(sim.st.maxLife * c.wardPct / 100)})`); add('Damage taken', `−${one(c.wardDR)}%`); add('Duration', `${one(c.duration)}s`); if (c.g.wardNova) add('Burst damage', dmg()); break;
      case 'construct': add('Damage per strike', dmg()); add('Strikes', `every ${one((sk.attackEvery || 1) / c.rate)}s, ${sk.range} tiles`); add('Lasts', `${one(c.duration)}s · ${c.constructs} at a time`); break;
      case 'orb': add('Damage per zap', dmg()); add('Zaps', `every ${one((sk.zapEvery || 0.4) / c.rate)}s for ${one(c.duration)}s`); add('Wisps', String(c.orbs)); break;
      default: add('Damage', dmg());
    }
    add('Mana', String(c.mana));
    if (type !== 'beam') add('Cast time', `${c.castTime.toFixed(2)}s`);
    if (c.cooldown) add('Cooldown', `${one(c.cooldown)}s`);
    if (c.radius && type !== 'ward') add('Radius', `${c.radius.toFixed(1)} tiles`);
    if (type === 'projectile') add('Projectiles', String(c.projectiles));
    if (c.pierce) add('Pierce', String(c.pierce));
    if (c.fork) add('Fork', `into ${c.fork}`);
    if (type === 'chain') add('Targets', String(c.chains));
    const hits = (sk.max || 0) > 0 && type !== 'buff' && type !== 'ward';
    if (hits) {
      add('Crit', `${c.critChance.toFixed(0)}% · ${c.critMulti}%`);
      add('Increased', `+${Math.round(c.inc[sk.element])}%`);
      if (c.more !== 1) add('More / less', `${c.more > 1 ? '+' : ''}${Math.round((c.more - 1) * 100)}%`);
      add('Burn', `${Math.min(100, c.burnChance).toFixed(0)}%`);
      if (sk.element === 'cold' || c.freezeChance) add('Freeze', `${c.freezeChance.toFixed(0)}% + heavy hits`);
      add('Shock', `${Math.min(100, c.shockChance).toFixed(0)}%`);
      const vs = [c.vs.burning && `burning +${c.vs.burning}%`, c.vs.chilled && `chilled +${c.vs.chilled}%`, c.vs.shocked && `shocked +${c.vs.shocked}%`].filter(Boolean);
      if (vs.length) add('Against', vs.join(', '));
    }
    let next = '';
    if (lv && lv < skillMaxLevel(id)) {
      const n = this.ctxAt(id, 1);
      if (hits) { const [a, b] = damageRange(n); next = `Next level: damage ${a}–${b}, mana ${n.mana}.`; }
      else if (type === 'buff') next = `Next level: barrier ${Math.round(frostArmorBarrier(n.lvl) * (1 + (n.g.barrierPct || 0) / 100))}.`;
      else if (type === 'ward') next = `Next level: barrier ${one(n.wardPct)}% of life.`;
      else if (type === 'curse') next = `Next level: +${one(n.curse)}% damage taken.`;
    }
    return `<div class="kv">${rows.join('')}</div>${next ? `<p class="hint">${next}</p>` : ''}`;
  }

  private mods(id: string): string {
    const sk = SKILLS[id], s = this.s, tiers = sk.mods;
    if (!tiers) return '';
    const lv = s.skills[id] || 0, any = (s.skillMods[id] ?? []).some(c => c >= 0), cost = modRespecCost(s.lvl);
    const rows = tiers.map((opts, i) => {
      const open = modTierOpen(s, id, i), ch = modChoice(s, id, i);
      const btn = (o: number) => {
        const m = opts[o], key = `${id}:${i}:${o}`, armed = this.arm === key, chosen = ch === o;
        const state = chosen ? 'chosen' : ch >= 0 ? 'other' : open ? 'pick' : 'locked';
        return `<button class="mopt ${state} ${armed ? 'armed' : ''}" data-act="smod:${key}" ${open && ch < 0 ? '' : 'disabled'} aria-pressed="${chosen}">
          <b>${esc(m.name)}</b><small>${armed ? 'Tap again to choose' : esc(m.text)}</small></button>`;
      };
      return `<div class="mtier ${open ? '' : 'locked'}"><span class="mlv" title="Opens at skill level ${MOD_LEVELS[i]}">${open ? '' : ic('lock')}${MOD_LEVELS[i]}</span>${btn(0)}${btn(1)}</div>`;
    }).join('');
    const pend = pendingMods(s, id);
    return `<h4>Modifiers${pend ? ` <span class="gold">· ${pend} to choose</span>` : ''}</h4>
      <p class="hint">At skill level ${MOD_LEVELS.join(', ')} pick one of two. ${lv ? '' : 'Learn the skill first.'}</p>
      <div class="mtiers">${rows}</div>
      ${any ? `<div class="row"><span class="hint">Change your mind for gold.</span><button class="btn sm" data-act="smodreset:${id}" ${s.gold >= cost ? '' : 'disabled'}>${this.arm === 'reset:' + id ? 'Tap again to reset' : `Reset modifiers · ${cost}g`}</button></div>` : ''}`;
  }

  private detail(sel: string): string {
    const sim = this.sim(), s = sim.s, sk = SKILLS[sel], lv = s.skills[sel] || 0, passive = isPassive(sel);
    const sockets = passive ? '' : `<h4>Support gems</h4><div class="sockets">${SOCKET_LEVELS.map((need, i) => {
      const g = sim.socketsOf(sel)[i], open = lv >= need;
      if (g) return `<button class="sock full ${this.pickSocket === i ? 'sel' : ''}" data-act="sockpick:${i}" style="--gc:${gemColor(g.gem)}"><span class="hole">${itemPic(g, 'sockpic')}</span><span><b>${esc(GEMS[g.gem].name)}</b> <small>Lv ${g.lvl}</small><br><small>${esc(gemText(g))}</small></span></button>`;
      return `<button class="sock ${open ? '' : 'closed'} ${this.pickSocket === i ? 'sel' : ''}" data-act="sockpick:${i}" ${open ? '' : 'disabled'}><span class="hole"></span><span>${open ? 'Empty socket: tap to insert a gem' : `Opens at skill level ${need}`}</span></button>`;
    }).join('')}</div>${this.pickSocket != null && lv >= SOCKET_LEVELS[this.pickSocket] ? this.gemPicker(sel, this.pickSocket) : ''}`;
    const kind = passive ? 'Passive' : 'Active';
    return `<div class="sdetail framed">
        <div class="row"><span class="sdname"><span class="snode mini ${passive ? 'passive' : ''} learned"><span class="art"><img src="${skillIcon(sel)}" alt=""></span></span><span><b class="${sk.element}">${esc(sk.name)}</b><br><small>${kind} · Lv ${lv}/${skillMaxLevel(sel)}${lv && sim.st.plus[sk.tree] ? ` (+${sim.st.plus[sk.tree]})` : ''}</small></span></span>
          <button class="btn primary" data-act="learn:${sel}" ${sim.canLearn(sel) ? '' : 'disabled'}>${lv ? 'Level up' : 'Learn'}</button></div>
        ${sk.tags ? `<div class="chips">${sk.tags.filter(t => t !== 'hit').map(t => `<span class="chip">${t}</span>`).join('')}</div>` : ''}
        <p class="d">${esc(sk.description)}</p>
        ${s.lvl < sk.reqLevel ? `<p class="hint bad">${ic('lock')} Needs character level ${sk.reqLevel}.</p>` : ''}
        ${this.info(sel)}
        ${this.mods(sel)}
        ${sockets}
        ${this.msg ? `<p class="hint bad">${esc(this.msg)}</p>` : ''}
      </div>`;
  }

  private gemPicker(skill: string, i: number): string {
    const sim = this.sim(), cur = sim.socketsOf(skill)[i];
    const gems = ownedGems(this.s).sort((a, b) => Number(gemFits(b.gem, skill)) - Number(gemFits(a.gem, skill)) || b.lvl - a.lvl);
    const list = gems.map(g => {
      const fits = gemFits(g.gem, skill), dup = sim.socketsOf(skill).some((o, j) => o && j !== i && o.gem === g.gem);
      return `<button class="gemopt" data-act="sock:${skill}:${i}:${g.id}" ${fits && !dup ? '' : 'disabled'} style="--gc:${gemColor(g.gem)}">${itemPic(g, 'sockpic')}
        <span><b>${esc(GEMS[g.gem].name)}</b> <small>Lv ${g.lvl}</small><br><small>${fits ? (dup ? 'Already in this skill.' : esc(gemText(g))) : `Does not fit: needs ${GEMS[g.gem].requires.join(', ')}`}</small></span></button>`;
    }).join('');
    return `<div class="picker">${cur ? `<button class="btn sm" data-act="unsock:${skill}:${i}">Take ${esc(GEMS[cur.gem].name)} out</button>` : ''}
      ${list || '<p class="hint">No support gems yet. Champions, elites and bosses drop them more often.</p>'}</div>`;
  }

  private prioView(dropdown: Dropdown): string {
    const sim = this.sim(), s = sim.s;
    const learned = Object.keys(SKILLS).filter(k => s.skills[k] > 0 && !isPassive(k));
    const skillOpts: [string, string, string?][] = [['', 'Empty'], ...learned.map(k => [k, SKILLS[k].name, skillIcon(k)] as [string, string, string])];
    const condOpts: [string, string][] = Object.entries(CONDITIONS);
    return `<p class="hint">She checks the slots from top to bottom and casts the first skill that is ready, affordable and whose condition is true. If none fits, she uses Staff Spark (free, weak). Drag a card by its handle to reorder.</p>
      ${sim.blockedSlots().map(([i, b]) => `<p class="hint bad">Slot ${i + 1} is never cast: slot ${b + 1} is set to "Always" and is always ready.</p>`).join('')}
      <div class="prio">${s.slots.map((sl, i) => `<div class="pcard" data-slot="${i}">
        <span class="grip" data-grip="${i}" aria-hidden="true"><b>${i + 1}</b></span>
        <span class="snode mini ${sl.id ? 'learned' : 'empty'}"><span class="art">${sl.id ? `<img src="${skillIcon(sl.id)}" alt="">` : ''}</span></span>
        <span class="psel">${dropdown(`slot:${i}`, `Skill in slot ${i + 1}`, sl.id ?? '', skillOpts)}${dropdown(`cond:${i}`, `Condition for slot ${i + 1}`, sl.cond, condOpts)}</span>
        <span class="updn vert"><button class="btn sq" data-act="up:${i}" ${i ? '' : 'disabled'} aria-label="Move up">▲</button><button class="btn sq" data-act="down:${i}" ${i < 3 ? '' : 'disabled'} aria-label="Move down">▼</button></span></div>`).join('')}</div>
      <div class="row" style="justify-content:flex-start"><button class="btn" data-act="autoorder">${ic('sort')}Sort automatically</button></div>`;
  }
}
