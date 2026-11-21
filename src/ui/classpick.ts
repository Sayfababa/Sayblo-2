/**
 * Class choice (Warrior package): shown for a new game and after "New hero" in Town. There is one save slot, so
 * picking a class from Town replaces the current hero (Town already asked for a confirming second tap).
 * Everything shown comes from classes.json and the class's skill trees.
 */
import { CLASSES, CLASS_IDS, ELEMENT_COLORS, TREES, classTrees, type ClassId } from '../content/index.ts';
import { spriteUrl } from '../render/textures.ts';
import { esc } from './html.ts';

export class ClassPick {
  /** the picker is open (the game waits behind it on a first start) */
  open = false;
  private cancelable = false;
  private onPick: (c: ClassId) => void;
  constructor(onPick: (c: ClassId) => void) { this.onPick = onPick; }

  private el() {
    let el = document.getElementById('classpick');
    if (!el) {
      el = document.createElement('div');
      el.id = 'classpick'; el.className = 'summary classpick'; el.hidden = true;
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Choose your hero');
      document.getElementById('stage')!.appendChild(el);
    }
    return el;
  }

  /** Open the picker. `cancelable`: from Town, the current hero can be kept. */
  show(cancelable: boolean) {
    this.open = true; this.cancelable = cancelable;
    const card = (c: ClassId) => {
      const C = CLASSES[c], art = C.sprite ? spriteUrl(`${C.sprite}-idle.png`) : spriteUrl('hero-idle.png');
      const trees = classTrees(c).map(t => `<span class="chip" style="color:${ELEMENT_COLORS[TREES[t].element]}">${esc(TREES[t].name)}</span>`).join('');
      return `<button class="clscard" data-act="clspick:${c}" aria-label="Play the ${esc(C.name)}">
        <span class="clsart ${C.sprite ? '' : 'ph-' + c}"><img src="${art}" alt="">${C.sprite ? '' : '<small>placeholder art</small>'}</span>
        <b>${esc(C.name)}</b><span class="chips">${trees}</span><small class="d">${esc(C.blurb)}</small>
        <span class="btn primary sm">Play ${esc(C.name)}</span></button>`;
    };
    const el = this.el();
    el.innerHTML = `<div class="sumbox clsbox"><h2>Choose your hero</h2>
      ${cancelable ? '<p class="hint bad">Your current hero will be deleted. Export a save code in Town first to keep a copy.</p>' : '<p class="hint">Fights on their own. Pick a class; you can start a new hero later in Town.</p>'}
      <div class="clsgrid">${CLASS_IDS.map(card).join('')}</div>
      ${cancelable ? '<button class="btn" data-act="clscancel">Keep my hero</button>' : ''}</div>`;
    el.hidden = false;
  }
  hide() { this.open = false; this.el().hidden = true; }

  /** Clicks of the picker. Returns true if it was one. */
  click(a: string, x: string): boolean {
    if (a === 'clscancel') { if (this.cancelable) this.hide(); return true; }
    if (a !== 'clspick' || !(x in CLASSES)) return a === 'clspick';
    this.hide();
    this.onPick(x as ClassId);
    return true;
  }
}
