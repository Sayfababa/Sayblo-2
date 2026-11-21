import { ELEMENT_COLORS, GEMS } from '../content/index.ts';

/** Label colour for gems on the ground and in lists. */
export const GEM_COLOR = '#5fd3a6';

/** Gems with a painted icon (public/sprites/gem-<id>.png). The rest are drawn in CSS until their sheet exists. */
export const GEM_ART = new Set(['multi', 'pierce', 'fork', 'wider', 'concentrated', 'chains', 'spread', 'echo', 'quick', 'efficiency', 'lingering',
  'searingburn', 'addedfire', 'deepfreeze', 'addedcold', 'overcharge', 'addedlight']);

/** Gem colour by what it needs: fire, cold, lightning or any skill. */
export function gemColor(gem: string): string {
  const r = GEMS[gem]?.requires ?? [];
  if (r.includes('fire')) return ELEMENT_COLORS.fire;
  if (r.includes('cold')) return ELEMENT_COLORS.cold;
  if (r.includes('lightning')) return ELEMENT_COLORS.light;
  if (gem === 'addedfire') return ELEMENT_COLORS.fire;
  if (gem === 'addedcold') return ELEMENT_COLORS.cold;
  if (gem === 'addedlight') return ELEMENT_COLORS.light;
  return GEM_COLOR;
}
