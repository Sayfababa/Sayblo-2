import type { Attr, Element, Slot } from '../content/index.ts';

/** Item modifier: [affix id, value] or [affix id, value, tier]. */
export type Mod = [string, number] | [string, number, number];
export interface Item {
  id: number; kind?: 'equip'; slot: Slot; base: string; name: string; r: number; L: number; imp: number; mods: Mod[];
  /** unique id (see items.json), if this is a unique */
  u?: string;
  /** position in the bag grid */
  bx?: number; by?: number;
}
export interface GemItem { id: number; kind: 'gem'; gem: string; lvl: number; bx?: number; by?: number }
export type BagItem = Item | GemItem;
export const isGem = (it: BagItem | null | undefined): it is GemItem => !!it && it.kind === 'gem';

export interface CastSlot { id: string | null; cond: string }

export interface Settings { dmgNumbers: boolean; lootLabels: boolean }

/** Everything that is saved. Plain JSON, versioned (see save.ts). */
export interface SaveState {
  v: number;
  lvl: number; xp: number; gold: number;
  attrs: Record<Attr, number>; attrPts: number; skillPts: number;
  skills: Record<string, number>;
  /** support gems socketed into each skill */
  sockets: Record<string, (GemItem | null)[]>;
  slots: CastSlot[];
  equip: Record<Slot, Item | null>;
  bag: BagItem[];
  filter: number;
  hpPot: number; mpPot: number; hpTh: number; mpTh: number;
  difficulty: number;
  /** areas unlocked per difficulty (0 = difficulty locked) */
  progress: number[];
  zone: number;
  autoAdvance: boolean; autoReturn: boolean; kite: boolean;
  speed: number;
  settings: Settings;
  life: number | null; mana: number | null; barrier: number;
  kills: number; deaths: number;
  nextId: number;
  savedAt: number;
}

export interface Vec { x: number; y: number }

export interface Monster {
  id: number; def: string; L: number; rank: number; el: Element; name: string; sub: string;
  hp: number; maxHp: number; dmg: number; atkTime: number; mv: number; range: number; atkT: number;
  chill: number; chillEff: number; burn: number; burnDps: number;
  frozen: number; freezeCd: number; shock: number; shockEff: number;
  mods: string[]; ward: number; maxWard: number; vamp: number;
  res: Record<Element, number>;
  x: number; y: number; px: number; py: number; f: number; walking: boolean;
  boss?: { phase: number; specT: number };
}

export interface SkillShot { kind: 'skill'; skill: string; hit: number[]; pierce: number; fork: number; echo: boolean }
export interface MonsterShot { kind: 'mon'; mon: number; dmg: number; el: Element; name: string }
export interface Projectile {
  id: number; x: number; y: number; z: number; px: number; py: number; pz: number;
  target: number | 'hero'; spd: number; el: Element; small: boolean; shot: SkillShot | MonsterShot;
}
/** Delayed area hit (Meteor, Thunderstrike). */
export interface Strike { id: number; x: number; y: number; t: number; dur: number; skill: string; kind: 'meteor' | 'strike'; echo: boolean }
export interface Echo { t: number; skill: string; cond: string }
export interface Drop { id: number; x: number; y: number; gold?: number; item?: BagItem }

export type Phase = 'walk' | 'fight' | 'town';

export interface Hero { x: number; y: number; px: number; py: number; f: number; walking: boolean }

/** Events for the renderer and the UI. The simulation never reads them back. */
export type SimEvent =
  | { t: 'log'; msg: string; cls: string }
  | { t: 'float'; x: number; y: number; text: string; col: string; big?: boolean; dmg?: boolean }
  | { t: 'burst'; x: number; y: number; z: number; el: Element; size: number }
  | { t: 'ring'; x: number; y: number; r0: number; r1: number; dur: number; el: Element | 'gold'; fill?: boolean }
  | { t: 'bolt'; pts: { x: number; y: number; z: number }[] }
  | { t: 'cast'; el: Element }
  | { t: 'heroHit' }
  | { t: 'monHit'; id: number }
  | { t: 'monAttack'; id: number }
  | { t: 'clear' };
