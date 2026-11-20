import type { Attr, Element, Slot } from '../content/index.ts';

export type Mod = [string, number];
export interface Item { id: number; slot: Slot; base: string; name: string; r: number; L: number; imp: number; mods: Mod[] }
export interface CastSlot { id: string | null; cond: string }

/** Everything that is saved. Plain JSON, versioned (see save.ts). */
export interface SaveState {
  v: number;
  lvl: number; xp: number; gold: number;
  attrs: Record<Attr, number>; attrPts: number; skillPts: number;
  skills: Record<string, number>;
  slots: CastSlot[];
  equip: Record<Slot, Item | null>;
  bag: Item[];
  filter: number;
  hpPot: number; mpPot: number; hpTh: number; mpTh: number;
  zone: number; unlocked: number;
  autoAdvance: boolean; autoReturn: boolean; kite: boolean;
  speed: number;
  life: number | null; mana: number | null; barrier: number;
  kills: number; deaths: number;
  nextId: number;
  savedAt: number;
}

export interface Vec { x: number; y: number }

export interface Monster {
  id: number; def: string; L: number; rank: number; el: Element; name: string; sub: string;
  hp: number; maxHp: number; dmg: number; atkTime: number; mv: number; range: number; atkT: number;
  chill: number; burn: number; burnDps: number;
  mods: string[]; ward: number; maxWard: number; vamp: number;
  res: Record<Element, number>;
  x: number; y: number; px: number; py: number; f: number; walking: boolean;
  boss?: { phase: number; specT: number };
}

export interface SkillHit { kind: 'skill'; skill: string; n: number; c: boolean }
export interface MonsterHit { kind: 'mon'; mon: number; dmg: number; el: Element; name: string }
export interface Projectile {
  id: number; x: number; y: number; z: number; px: number; py: number; pz: number;
  target: number | 'hero'; spd: number; el: Element; small: boolean; hit: SkillHit | MonsterHit;
}
export interface Meteor { id: number; x: number; y: number; t: number; dur: number; skill: string }
export interface Drop { id: number; x: number; y: number; gold?: number; item?: Item }

export type Phase = 'walk' | 'fight' | 'town';

export interface Hero { x: number; y: number; px: number; py: number; f: number; walking: boolean }

/** Events for the renderer and the UI. The simulation never reads them back. */
export type SimEvent =
  | { t: 'log'; msg: string; cls: string }
  | { t: 'float'; x: number; y: number; text: string; col: string; big?: boolean }
  | { t: 'burst'; x: number; y: number; z: number; el: Element; size: number }
  | { t: 'ring'; x: number; y: number; r0: number; r1: number; dur: number; el: Element | 'gold'; fill?: boolean }
  | { t: 'bolt'; pts: { x: number; y: number; z: number }[] }
  | { t: 'cast'; el: Element }
  | { t: 'heroHit' }
  | { t: 'monHit'; id: number }
  | { t: 'monAttack'; id: number }
  | { t: 'clear' };
