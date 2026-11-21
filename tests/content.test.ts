import { describe, expect, it } from 'vitest';
import { AFFIXES, STAT_NAMES, AREAS, AUTO_ORDER, CONDITIONS, GEMS, ITEMS, MONSTERS, PROPS, RARITIES, SKILLS, SLOTS, TREES, UNIQUES } from '../src/content/index.ts';
import { existsSync } from 'node:fs';

const sprite = (n: string) => existsSync(new URL(`../public/sprites/${n}`, import.meta.url));

describe('content data is consistent', () => {
  it('skills reference trees and have icons', () => {
    for (const [id, s] of Object.entries(SKILLS)) {
      expect(TREES[s.tree], id).toBeTruthy();
      expect(sprite(`icon-${id}.png`), id).toBe(true);
      if (s.kind === 'passive') { expect(s.stats, id).toBeTruthy(); for (const k of Object.keys(s.stats!)) expect(AFFIXES[k] || STAT_NAMES[k], k).toBeTruthy(); }
      else if (s.type !== 'buff') expect(s.max! >= s.min!, id).toBe(true);
    }
    for (const [id, c] of AUTO_ORDER) { expect(SKILLS[id]).toBeTruthy(); expect(CONDITIONS[c]).toBeTruthy(); }
  });
  it('areas reference monsters, props and grounds', () => {
    for (const a of AREAS) {
      for (const m of a.pool) expect(MONSTERS[m], a.id + ' ' + m).toBeTruthy();
      if (a.boss) expect(MONSTERS[a.boss].boss, a.id).toBeTruthy();
      expect(sprite(a.ground), a.ground).toBe(true);
      for (const [p] of a.decor) expect(PROPS[p] || ['grass', 'puddle', 'ember'].includes(p), p).toBeTruthy();
    }
  });
  it('sprites exist for monsters and props', () => {
    for (const m of Object.values(MONSTERS)) expect(sprite(m.sprite + '.png'), m.sprite).toBe(true);
    for (const p of Object.values(PROPS)) for (const [n] of p.variants) expect(sprite(n + '.png'), n).toBe(true);
  });
  it('items reference affixes and icons', () => {
    for (const slot of SLOTS) {
      for (const b of ITEMS.bases[slot]) expect(sprite(`item-${b.icon}.png`), b.icon).toBe(true);
      const imp = ITEMS.implicits[slot];
      if (imp) expect(AFFIXES[imp.affix]).toBeTruthy();
    }
    for (const u of Object.values(UNIQUES)) {
      expect(SLOTS.includes(u.slot)).toBe(true);
      expect(ITEMS.bases[u.slot].some(b => b.name === u.base), u.name).toBe(true);
      for (const k of u.mods) expect(AFFIXES[k], k).toBeTruthy();
    }
    expect(RARITIES.length).toBe(4);
  });
  it('gems use known tags', () => {
    const tags = new Set(Object.values(SKILLS).flatMap(s => s.tags || []));
    for (const [id, g] of Object.entries(GEMS)) for (const t of g.requires) expect(tags.has(t), `${id}: ${t}`).toBe(true);
  });
});
