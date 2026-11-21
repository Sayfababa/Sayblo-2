/**
 * Typed access to the content data files. All game content lives in the JSON files next to this one;
 * new skills, monsters, areas, affixes or items are new entries there, not new code.
 */
import skillsJson from './skills.json' with { type: 'json' };
import monstersJson from './monsters.json' with { type: 'json' };
import areasJson from './areas.json' with { type: 'json' };
import affixesJson from './affixes.json' with { type: 'json' };
import itemsJson from './items.json' with { type: 'json' };
import heroJson from './hero.json' with { type: 'json' };
import gemsJson from './gems.json' with { type: 'json' };
import difficultyJson from './difficulty.json' with { type: 'json' };
import feelJson from './feel.json' with { type: 'json' };

export type Element = 'fire' | 'cold' | 'light';
export const ELEMENTS: Element[] = ['fire', 'cold', 'light'];
export const ELEMENT_NAMES: Record<Element, string> = { fire: 'Fire', cold: 'Cold', light: 'Lightning' };
export const ELEMENT_COLORS: Record<Element, string> = { fire: '#ff7a3d', cold: '#8fd8ff', light: '#b48cff' };

export type SkillType = 'projectile' | 'area' | 'meteor' | 'strike' | 'buff' | 'chain' | 'nova';
export interface SkillDef {
  name: string; abbr: string; tree: string; element: Element; kind?: 'passive'; type?: SkillType; tags?: string[];
  mana?: number; cooldown?: number; min?: number; max?: number; reqLevel: number; maxLevel?: number; description: string; row: number;
  projectileSpeed?: number; radius?: number; delay?: number; chill?: number; chillEffect?: number;
  burnChance?: number; freezeChance?: number; shockChance?: number; critBonus?: number;
  duration?: number; barrierBase?: number; barrierPerLevel?: number; meleeChill?: number;
  jumps?: number; jumpRange?: number; jumpFalloff?: number;
  /** passive skills: stat bonus per level */
  stats?: Record<string, number>;
}
export interface SparkDef { name: string; element: Element; type: 'projectile'; min: number; max: number; projectileSpeed: number; perLevel: number; castTimeMult: number }
export interface StatesDef {
  burnRatio: number; burnDuration: number; baseBurnChance: number;
  chillDuration: number; baseChillEffect: number; maxChillEffect: number;
  freezeDuration: number; freezeCooldown: number; heavyHitFreeze: number;
  baseShockChance: number; baseShockEffect: number; maxShockEffect: number; shockDuration: number;
  spreadRadius: number;
}
export interface GemDef { name: string; requires: string[]; mana: number; effects: Record<string, [number, number]>; text: string }
export interface TreeDef { name: string; element: Element; description: string }

export interface BossDef {
  title: string; res: Record<Element, number>; intro: string;
  phases: { belowHp: number; element: Element; res: Record<Element, number>; message: string }[];
  special: { name: string; first: number; every: number; mult: number; radius: number };
}
export interface MonsterDef {
  name: string; element: Element; hp: number; dmg: number; attackTime: number; moveSpeed: number;
  sprite: string; height: number; flying?: boolean; facesLeft?: boolean; ranged?: number; boss?: BossDef;
  /** fleeing treasure creature (never in an area pool) */ treasure?: boolean;
  /** no own sprite yet: the renderer draws a placeholder */ placeholder?: boolean;
}
export interface RankDef { name: string; hp: number; dmg: number; xp: number; gold: number; size: number; color: string }
export interface EliteModDef {
  attackTime?: number; moveSpeed?: number; wardPct?: number; vampPct?: number; ownResAdd?: number; dmg?: number;
  /** explodes after a warning circle when it dies (damage = mult x monster damage) */
  deathBlast?: { delay: number; radius: number; mult: number; element: Element; name: string };
  /** pulses elemental damage and chills the hero nearby (slower casting) */
  aura?: { radius: number; every: number; mult: number; chill: number; chillTime: number; element: Element };
  /** blinks next to the hero when she keeps her distance */
  teleport?: { every: number; minDist: number; near: number };
  /** gives nearby allies a ward (pct of their life, up to max) */
  shield?: { every: number; pct: number; max: number; radius: number };
  /** splits off a weaker copy once below a share of its life */
  mirror?: { below: number; hpPct: number; dmg: number; name: string };
}

export interface AreaDef { id: string; name: string; level: number; waves: number; pool: string[]; boss?: string; ground: string; groundPulse?: boolean; decor: [string, number][];
  /** optional winding path texture blended over the ground, props along its edges, flat decals lying on the ground */
  path?: string; pathDecor?: [string, number][]; decals?: [string, number][] }
export interface PropDef { variants: [string, number][]; noFlip?: boolean; light?: { x?: number; y: number; radius: number; color: string; alpha: number; flicker?: number } }

export type AffixKind = 'offense' | 'defense' | 'mana';
export interface AffixDef { group: 'prefix' | 'suffix'; kind: AffixKind; name: string; text: string; percent: boolean; base: number; perLevel: number; weight: number; decimals?: number; slots?: Slot[]; minLevel?: number; rare?: number }
export type Slot = 'weapon' | 'helm' | 'armor' | 'amulet' | 'ring';
export interface RarityDef { name: string; color: string; weight: number; bossWeight: number; affixes?: [number, number]; prefixes?: number; suffixes?: number }
export interface UniqueDef { slot: Slot; base: string; name: string; mods: string[]; effect: string }
export interface DropRule { count: [number, number]; minRarity: number; gemChance: number }

export type Attr = 'power' | 'focus' | 'spirit' | 'vit';

const sk = skillsJson as unknown as {
  trees: Record<string, TreeDef>; skills: Record<string, SkillDef>; spark: SparkDef; startSkill: string;
  autoOrder: [string, string][]; scaling: { damagePerLevel: number; synergyPerPoint: number; manaPerLevel: number };
  states: StatesDef; conditions: Record<string, string>; maxSkillLevel: number; socketLevels: number[];
};
export const TREES = sk.trees;
export const SKILLS = sk.skills;
export const SPARK = sk.spark;
export const START_SKILL = sk.startSkill;
export const AUTO_ORDER = sk.autoOrder;
export const SKILL_SCALING = sk.scaling;
export const STATES = sk.states;
export const MAX_SKILL_LEVEL = sk.maxSkillLevel;
export const SOCKET_LEVELS = sk.socketLevels;
export const isPassive = (id: string) => SKILLS[id]?.kind === 'passive';
export const skillMaxLevel = (id: string) => SKILLS[id].maxLevel ?? sk.maxSkillLevel;
export const CONDITIONS = sk.conditions;

const mo = monstersJson as unknown as {
  monsters: Record<string, MonsterDef>; ranks: RankDef[]; eliteMods: Record<string, EliteModDef>; eliteModCount: [number, number];
  eliteNames: { first: string[]; second: string[] }; championMods: { chance: number; pool: string[] };
  scaling: { hpBase: number; hpGrowth: number; dmgBase: number; dmgGrowth: number; xpBase: number; xpGrowth: number; ownElementRes: number; meleeRange: number; projectileSpeed: number };
  waves: { championChance: number; eliteChance: number; spawnDistance: number; bossDistance: number };
};
export const MONSTERS = mo.monsters;
export const RANKS = mo.ranks;
export const ELITE_MODS = mo.eliteMods;
export const ELITE_MOD_COUNT = mo.eliteModCount;
export const ELITE_NAMES = mo.eliteNames;
export const CHAMPION_MODS = mo.championMods;
export const MONSTER_SCALING = mo.scaling;
export const WAVES = mo.waves;

const ar = areasJson as unknown as { act: string; areas: AreaDef[]; props: Record<string, PropDef>; unlockedAtStart: number };
export const ACT_NAME = ar.act;
export const AREAS = ar.areas;
export const PROPS = ar.props;
export const UNLOCKED_AT_START = ar.unlockedAtStart;

const af = affixesJson as unknown as { tiers: { tier: number; level: number; weight: number }[]; roll: [number, number]; slotKinds: Record<Slot, AffixKind[]>; affixes: Record<string, AffixDef> };
export const AFFIXES = af.affixes;
export const AFFIX_TIERS = af.tiers;
export const AFFIX_ROLL = af.roll;
/** Weapons roll damage, helm and armor roll defense, jewellery rolls both; mana fits everywhere. */
export const SLOT_KINDS = af.slotKinds;

const it = itemsJson as unknown as {
  slots: Slot[]; slotNames: Record<Slot, string>; bases: Record<Slot, { name: string; icon: string }[]>;
  implicits: Partial<Record<Slot, { affix: string; base: number; perLevel: number }>>; implicitRoll: [number, number];
  rarities: RarityDef[]; uniques: Record<string, UniqueDef>; uniqueRoll: [number, number]; rareNames: { first: string[]; second: string[] };
  sizes: Record<Slot | 'gem', [number, number]>; bag: { width: number; height: number };
  sell: { base: number; perLevel: number; perRarity: number; gemBase: number; gemPerLevel: number };
  drops: { goldChance: number; goldPerLevel: [number, number]; itemChance: number; gemChance: number; champion: DropRule; elite: DropRule; boss: DropRule };
  filterNames: string[];
};
export const ITEMS = it;
export const SLOTS = it.slots;
export const SLOT_NAMES = it.slotNames;
export const RARITIES = it.rarities;
export const UNIQUES = it.uniques;
export const ITEM_SIZES = it.sizes;
export const BAG_W = it.bag.width, BAG_H = it.bag.height;

/** Icon file name (without "item-" prefix) for an item base name. */
export const BASE_ICON: Record<string, string> = Object.fromEntries(
  Object.values(it.bases).flat().map(b => [b.name, b.icon]),
);

export const HERO = heroJson as unknown as {
  className: string;
  attributes: Record<Attr, { name: string; description: string }>;
  startAttributes: Record<Attr, number>; startGold: number;
  perLevel: { attributePoints: number; skillPoints: number; life: number; mana: number };
  base: { life: number; lifePerVit: number; lifeRegen: number; lifeRegenPerVit: number; mana: number; manaPerSpirit: number; manaRegen: number; manaRegenPerSpirit: number; crit: number; critPerFocus: number; critMult: number };
  caps: { res: number; resMin: number; crit: number; dodge: number; elemDR: number };
  xpCurve: { base: number; growth: number; linear: number };
  barrier: { regenDelay: number; regenPerSecond: number };
  potions: { start: number; life: number; mana: number; cooldown: number; priceBase: number; pricePerLevel: number; lifeThreshold: number; manaThreshold: number };
  death: { xpLoss: number; goldLoss: number; townTime: number };
  respecPerLevel: number;
  xpPenalty: { freeLevels: number; perLevel: number; min: number };
  movement: { walkSpeed: number; kiteSpeed: number; kiteTime: number; kiteCooldown: number; kiteTrigger: number; aggroRange: number; pickupRange: number };
};
export const ATTRS = Object.keys(HERO.attributes) as Attr[];

const gm = gemsJson as unknown as { maxLevel: number; gems: Record<string, GemDef> };
export const GEMS = gm.gems;
export const GEM_MAX_LEVEL = gm.maxLevel;

export interface DifficultyDef { name: string; levelAdd: number; resPenalty: number; hpMult: number; dmgMult: number; xpMult: number; goldMult: number }
const df = difficultyJson as unknown as { difficulties: DifficultyDef[]; offline: { rate: number; maxHours: number; minSeconds: number } };
export const DIFFICULTIES = df.difficulties;
export const OFFLINE = df.offline;

/* ---------- work package A (Feel) ---------- */
export interface ShrineDef { name: string; text: string; color: string; duration: number; weight: number; effects: Record<string, number> }
export interface FeelDef {
  upgrade: { kindWeight: Record<AffixKind, number>; refLevel: number; uniqueBonus: number; minGain: number; minAbs: number };
  perfect: { tier: number; rangeShare: number };
  shrines: { chance: number; useRange: number; types: Record<string, ShrineDef> };
  treasure: {
    monster: string; name: string; sub: string; chance: number; lifetime: number; hpMult: number; spawnDistance: number; keepDistance: [number, number]; turnEvery: [number, number];
    goldPiles: [number, number]; goldPerPile: number; items: [number, number]; minRarity: number; gemChance: number; vaultChance: number;
  };
  vault: {
    name: string; duration: number; extraMonsters: number; chests: [number, number]; chestGoldPiles: [number, number]; chestItems: [number, number];
    chestMinRarity: number; goldMult: number; goldChanceAdd: number; itemChanceAdd: number;
  };
}
export const FEEL = feelJson as unknown as FeelDef;
export const SHRINES = FEEL.shrines.types;
