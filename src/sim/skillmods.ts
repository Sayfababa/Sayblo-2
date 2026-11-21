/**
 * Skill modifiers: every active skill has a few tiers (skills.json "mods"), each with two choices.
 * A tier opens when the skill has MOD_LEVELS[tier] points (without +skill items). The choice stays
 * until the player pays gold to reset the modifiers of that skill (or does a full respec).
 * Pure functions on the save state: no randomness, no DOM.
 */
import { MOD_LEVELS, MOD_RESPEC_PER_LEVEL, SKILLS, isPassive, type SkillModDef } from '../content/index.ts';
import type { SaveState } from './types.ts';

export const modTiers = (id: string) => SKILLS[id]?.mods?.length ?? 0;
/** Is tier i of a skill open (enough points spent in the skill)? */
export const modTierOpen = (s: SaveState, id: string, i: number) => (s.skills[id] || 0) >= MOD_LEVELS[i];
/** Chosen option of a tier: 0, 1 or -1 (none). */
export const modChoice = (s: SaveState, id: string, i: number) => s.skillMods[id]?.[i] ?? -1;

/** Modifiers that are chosen and whose tier is open. */
export function activeMods(s: SaveState, id: string): SkillModDef[] {
  const tiers = SKILLS[id]?.mods;
  if (!tiers) return [];
  const out: SkillModDef[] = [];
  tiers.forEach((opts, i) => { const c = modChoice(s, id, i); if (c >= 0 && modTierOpen(s, id, i)) out.push(opts[c]); });
  return out;
}

/** Open tiers without a choice yet (for the red dot in the skills menu). */
export const pendingMods = (s: SaveState, id: string) =>
  (SKILLS[id]?.mods ?? []).filter((_, i) => modTierOpen(s, id, i) && modChoice(s, id, i) < 0).length;

/** Pick option `opt` of tier `i`. Returns an error text or null. */
export function chooseMod(s: SaveState, id: string, i: number, opt: number): string | null {
  const tiers = SKILLS[id]?.mods;
  if (!tiers || !tiers[i] || (opt !== 0 && opt !== 1)) return 'Unknown modifier.';
  if (!modTierOpen(s, id, i)) return `Opens at skill level ${MOD_LEVELS[i]}.`;
  if (modChoice(s, id, i) >= 0) return 'Already chosen. Reset the modifiers of this skill to change it.';
  const arr = s.skillMods[id] ?? (s.skillMods[id] = tiers.map(() => -1));
  while (arr.length < tiers.length) arr.push(-1);
  arr[i] = opt;
  return null;
}

export const modRespecCost = (lvl: number) => lvl * MOD_RESPEC_PER_LEVEL;
/** Clear the modifier choices of one skill for gold. Returns an error text or null. */
export function resetMods(s: SaveState, id: string): string | null {
  if (!(s.skillMods[id] ?? []).some(c => c >= 0)) return 'No modifiers chosen.';
  const c = modRespecCost(s.lvl);
  if (s.gold < c) return `Resetting costs ${c} gold.`;
  s.gold -= c;
  delete s.skillMods[id];
  return null;
}

/** Keep only valid choices of known active skills. */
export function sanitizeSkillMods(raw: unknown, skills: Record<string, number>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, arr] of Object.entries(raw as Record<string, unknown>)) {
    const tiers = SKILLS[id]?.mods;
    if (!tiers || isPassive(id) || !skills[id] || !Array.isArray(arr)) continue;
    const v = tiers.map((_, i) => (arr[i] === 0 || arr[i] === 1 ? arr[i] as number : -1));
    if (v.some(c => c >= 0)) out[id] = v;
  }
  return out;
}
