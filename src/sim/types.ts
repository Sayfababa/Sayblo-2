import type { Attr, Element, MatId, Slot } from '../content/index.ts';
import type { MetaSave, MonMeta } from './meta-types.ts';

/** Item modifier: [affix id, value] or [affix id, value, tier]. */
export type Mod = [string, number] | [string, number, number];
export interface Item {
  id: number; kind?: 'equip'; slot: Slot; base: string; name: string; r: number; L: number; imp: number; mods: Mod[];
  /** unique id (see items.json), if this is a unique */
  u?: string;
  /** position in the bag grid */
  bx?: number; by?: number;
  /* economy (see crafting.ts): times crafted, mod index protected by Sealing Wax, corruption outcome (1-4),
     index of the mod the corruption added or doubled (never touched by crafting), sealed = no more crafting, unidentified */
  cr?: number; wax?: number; cor?: number; cm?: number; seal?: boolean; unid?: boolean;
  /** meta (meta.ts): unique effect imprinted from the codex (unique id) */
  ipr?: string;
}
export interface GemItem { id: number; kind: 'gem'; gem: string; lvl: number; bx?: number; by?: number }
/** Rift key (work package C): opens a rift of a tier with modifiers (ids in rift.json keyMods). */
export interface KeyItem { id: number; kind: 'key'; tier: number; mods: string[]; bx?: number; by?: number }
export type BagItem = Item | GemItem | KeyItem;
export const isGem = (it: BagItem | null | undefined): it is GemItem => !!it && it.kind === 'gem';
export const isKey = (it: BagItem | null | undefined): it is KeyItem => !!it && it.kind === 'key';
/** Equipment (not a gem and not a key). */
export const isEquip = (it: BagItem | null | undefined): it is Item => !!it && it.kind !== 'gem' && it.kind !== 'key';

export interface CastSlot { id: string | null; cond: string }

/** Saved rift progress (work package C, see rift.ts). */
export interface RiftSave {
  /** Mother Vesper beaten on the unlock difficulty */
  open: boolean;
  /** highest tier cleared, and the best clear time in seconds per tier */
  maxTier: number; best: Record<string, number>;
  /** ranks per atlas node */
  atlas: Record<string, number>;
  /** key fragments for the pinnacle, highest pinnacle beaten (1 = tier 25, ...) */
  frags: number; pinnacle: number;
  /** auto-run the next rift with the best key */
  auto: boolean;
  /** run in progress (resumed on load, farmed while offline) */
  cur: { tier: number; mods: string[]; theme: number; pin?: number } | null;
  /** finished runs and deaths in rifts */
  runs: number; fails: number;
}

export interface Settings { dmgNumbers: boolean; lootLabels: boolean; /** sound effects on/off and volume 0..1 */ sound: boolean; volume: number }

/** Loot filter rules (see loot.ts). minR: lowest rarity kept per slot (0 Normal … 3 Unique). */
export interface LootRules { minR: Record<Slot, number>; keepUniques: boolean; keepGems: boolean; keepUpgrades: boolean; autoSalvage: boolean }

/** Everything that is saved. Plain JSON, versioned (see save.ts). */
export interface SaveState {
  v: number;
  lvl: number; xp: number; gold: number;
  attrs: Record<Attr, number>; attrPts: number; skillPts: number;
  skills: Record<string, number>;
  /** support gems socketed into each skill */
  sockets: Record<string, (GemItem | null)[]>;
  /** chosen skill modifiers: per skill one entry per tier, 0/1 = option, -1 = not chosen yet (see skillmods.ts) */
  skillMods: Record<string, number[]>;
  slots: CastSlot[];
  equip: Record<Slot, Item | null>;
  bag: BagItem[];
  loot: LootRules;
  /** crafting materials from salvage */
  mats: Record<MatId, number>;
  /** town stash: one grid (same size as the bag) per tab */
  stash: BagItem[][];
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
  rift: RiftSave;
  nextId: number;
  savedAt: number;
  /** work package D: bounties, tyrant counters, codex, ember points, feats (see meta.ts) */
  meta: MetaSave;
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
  /** state of monster affixes and the treasure creature (see feel.ts) */
  fe?: MonFeel;
  /** meta: tyrant, trapped champion, rift tear (see meta.ts) */
  mt?: MonMeta;
  /** rift guardian / pinnacle boss (see rift.ts): mechanic timers; render size and tint */
  rg?: { slam: number; rain: number; pin: boolean; el2: Element };
  scale?: number; tint?: string;
  /** skills: hex on the monster and the skill that hit it last (see spells.ts) */
  hex?: Hex; lastSkill?: string;
}
/** Curse on a monster: seconds left, % more damage taken per element, slow (0..1), skill that cast it. */
export interface Hex { t: number; taken: Record<Element, number>; slow: number; skill: string }
export interface MonFeel {
  /** treasure creature: seconds until it escapes, and its current flight angle */
  flee?: number; ang?: number; turn?: number;
  /** mirror image: no loot; split: already split off its image */
  noLoot?: boolean; split?: boolean;
  /** timers of monster affixes by affix name */
  t?: Record<string, number>;
}

export interface SkillShot { kind: 'skill'; skill: string; hit: number[]; pierce: number; fork: number; echo: boolean }
export interface MonsterShot { kind: 'mon'; mon: number; dmg: number; el: Element; name: string }
export interface Projectile {
  id: number; x: number; y: number; z: number; px: number; py: number; pz: number;
  target: number | 'hero'; spd: number; el: Element; small: boolean; shot: SkillShot | MonsterShot;
}
/** Delayed area hit (Meteor, Thunderstrike). */
export interface Strike { id: number; x: number; y: number; t: number; dur: number; skill: string; kind: 'meteor' | 'strike'; echo: boolean;
  /** damage factor and "no follow-ups" for extra strikes and repeats from skill modifiers */ mult?: number; sub?: boolean }
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
  /** short fire/cold/lightning beam between two points (Forked Lance) */
  | { t: 'beam'; x0: number; y0: number; x1: number; y1: number; el: Element; dur: number }
  | { t: 'cast'; el: Element }
  | { t: 'heroHit' }
  | { t: 'monHit'; id: number }
  | { t: 'monAttack'; id: number }
  | { t: 'clear' }
  /** a new drop lies on the ground (sound, beam pulse); up = upgrade for the hero */
  | { t: 'loot'; id: number; x: number; y: number; kind: 'gold' | 'item' | 'gem' | 'key'; r: number; up: boolean; perfect: boolean }
  | { t: 'kill'; id: number; x: number; y: number; rank: number; overkill: number; treasure: boolean }
  | { t: 'levelup' }
  | { t: 'shrine'; x: number; y: number; shrine: string }
  | { t: 'vault'; open: boolean }
  /** meta: event start/end, tyrant arrival, feat earned, bounty done, ember point (toasts, pulses) */
  | { t: 'meta'; kind: 'event' | 'eventEnd' | 'tyrant' | 'feat' | 'bounty' | 'ember' | 'codex'; id: string; text: string }
  /** a rift run ended (work package C) */
  | { t: 'rift'; res: RiftResult };

export interface RiftResult {
  ok: boolean; tier: number; time: number; limit: number; beat: boolean; best: boolean; pin: number;
  key: number | null; keys: number; frag: boolean; firstClear: boolean; atlasPoint: boolean; items: { name: string; r: number }[]; itemCount: number; gold: number; auto: boolean;
}
