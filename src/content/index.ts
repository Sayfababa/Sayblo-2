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

export type Element = 'fire' | 'cold' | 'light';
export const ELEMENTS: Element[] = ['fire', 'cold', 'light'];
export const ELEMENT_NAMES: Record<Element, string> = { fire: 'Fire', cold: 'Cold', light: 'Lightning' };
export const ELEMENT_COLORS: Record<Element, string> = { fire: '#ff7a3d', cold: '#8fd8ff', light: '#b48cff' };

export type SkillType = 'single' | 'meteor' | 'buff' | 'chain' | 'nova';
export interface SkillDef {
  name: string; abbr: string; tree: string; element: Element; type: SkillType;
  mana: number; cooldown: number; min?: number; max?: number; reqLevel: number; description: string;
  projectileSpeed?: number; burn?: number; radius?: number; delay?: number; chill?: number;
  duration?: number; barrierBase?: number; barrierPerLevel?: number; meleeChill?: number;
  jumps?: number; jumpRange?: number; jumpFalloff?: number;
}
export interface SparkDef { name: string; element: Element; type: 'single'; min: number; max: number; projectileSpeed: number; perLevel: number; castTimeMult: number }
export interface TreeDef { name: string; element: Element; description: string }

export interface BossDef {
  title: string; res: Record<Element, number>; intro: string;
  phases: { belowHp: number; element: Element; res: Record<Element, number>; message: string }[];
  special: { name: string; first: number; every: number; mult: number; radius: number };
}
export interface MonsterDef {
  name: string; element: Element; hp: number; dmg: number; attackTime: number; moveSpeed: number;
  sprite: string; height: number; flying?: boolean; facesLeft?: boolean; ranged?: number; boss?: BossDef;
}
export interface RankDef { name: string; hp: number; dmg: number; xp: number; gold: number; size: number; color: string }
export interface EliteModDef { attackTime?: number; moveSpeed?: number; wardPct?: number; vampPct?: number; ownResAdd?: number; dmg?: number }

export interface AreaDef { id: string; name: string; level: number; waves: number; pool: string[]; boss?: string; ground: string; groundPulse?: boolean; decor: [string, number][] }
export interface PropDef { variants: [string, number][]; noFlip?: boolean; light?: { y: number; radius: number; color: string; alpha: number; flicker?: number } }

export interface AffixDef { text: string; percent: boolean; base: number; perLevel: number; weight: number; suffix: string; decimals?: number }
export type Slot = 'weapon' | 'helm' | 'armor' | 'amulet' | 'ring';
export interface RarityDef { name: string; color: string; weight: number; bossWeight: number; affixes?: [number, number]; roll?: [number, number] }
export interface DropRule { count: [number, number]; minRarity: number }

export type Attr = 'power' | 'focus' | 'spirit' | 'vit';

const sk = skillsJson as unknown as {
  trees: Record<string, TreeDef>; skills: Record<string, SkillDef>; spark: SparkDef; startSkill: string;
  autoOrder: [string, string][]; scaling: { damagePerLevel: number; synergyPerPoint: number; manaPerLevel: number };
  burnDuration: number; conditions: Record<string, string>;
};
export const TREES = sk.trees;
export const SKILLS = sk.skills;
export const SPARK = sk.spark;
export const START_SKILL = sk.startSkill;
export const AUTO_ORDER = sk.autoOrder;
export const SKILL_SCALING = sk.scaling;
export const BURN_DURATION = sk.burnDuration;
export const CONDITIONS = sk.conditions;

const mo = monstersJson as unknown as {
  monsters: Record<string, MonsterDef>; ranks: RankDef[]; eliteMods: Record<string, EliteModDef>; eliteModCount: [number, number];
  eliteNames: { first: string[]; second: string[] };
  scaling: { hpBase: number; hpGrowth: number; dmgBase: number; dmgGrowth: number; xpBase: number; xpGrowth: number; ownElementRes: number; meleeRange: number; projectileSpeed: number };
  waves: { championChance: number; eliteChance: number; spawnDistance: number; bossDistance: number };
};
export const MONSTERS = mo.monsters;
export const RANKS = mo.ranks;
export const ELITE_MODS = mo.eliteMods;
export const ELITE_MOD_COUNT = mo.eliteModCount;
export const ELITE_NAMES = mo.eliteNames;
export const MONSTER_SCALING = mo.scaling;
export const WAVES = mo.waves;

const ar = areasJson as unknown as { act: string; areas: AreaDef[]; props: Record<string, PropDef>; unlockedAtStart: number };
export const ACT_NAME = ar.act;
export const AREAS = ar.areas;
export const PROPS = ar.props;
export const UNLOCKED_AT_START = ar.unlockedAtStart;

export const AFFIXES = affixesJson as unknown as Record<string, AffixDef>;

const it = itemsJson as unknown as {
  slots: Slot[]; slotNames: Record<Slot, string>; bases: Record<Slot, { name: string; icon: string }[]>;
  implicits: Partial<Record<Slot, { affix: string; base: number; perLevel: number }>>; implicitRoll: [number, number];
  rarities: RarityDef[]; uniques: Record<Slot, { name: string; mods: string[] }>; rareNames: { first: string[]; second: string[] };
  sell: { base: number; perLevel: number; perRarity: number }; bagSize: number;
  drops: { goldChance: number; goldPerLevel: [number, number]; itemChance: number; champion: DropRule; elite: DropRule; boss: DropRule };
  filterNames: string[];
};
export const ITEMS = it;
export const SLOTS = it.slots;
export const SLOT_NAMES = it.slotNames;
export const RARITIES = it.rarities;
export const BAG_SIZE = it.bagSize;

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
  caps: { res: number; resMin: number; crit: number; dodge: number };
  xpCurve: { base: number; growth: number; linear: number };
  barrier: { regenDelay: number; regenPerSecond: number };
  potions: { start: number; life: number; mana: number; cooldown: number; priceBase: number; pricePerLevel: number; lifeThreshold: number; manaThreshold: number };
  death: { xpLoss: number; goldLoss: number; townTime: number };
  respecPerLevel: number;
  movement: { walkSpeed: number; kiteSpeed: number; kiteTime: number; kiteCooldown: number; kiteTrigger: number; aggroRange: number; pickupRange: number };
};
export const ATTRS = Object.keys(HERO.attributes) as Attr[];
