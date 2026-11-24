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
import economyJson from './economy.json' with { type: 'json' };
import feelJson from './feel.json' with { type: 'json' };
import metaJson from './meta.json' with { type: 'json' };
import riftJson from './rift.json' with { type: 'json' };
import classesJson from './classes.json' with { type: 'json' };

export type Element = 'fire' | 'cold' | 'light';
export const ELEMENTS: Element[] = ['fire', 'cold', 'light'];
export const ELEMENT_NAMES: Record<Element, string> = { fire: 'Fire', cold: 'Cold', light: 'Lightning' };
export const ELEMENT_COLORS: Record<Element, string> = { fire: '#ff7a3d', cold: '#8fd8ff', light: '#b48cff' };

export type SkillType = 'projectile' | 'area' | 'meteor' | 'strike' | 'buff' | 'chain' | 'nova' | 'beam' | 'curse' | 'field' | 'ward' | 'construct' | 'orb'
  /* warrior (melee.ts) */ | 'melee' | 'fissure' | 'leap' | 'cry' | 'aura';
/** One choice of a skill modifier tier: effect keys are the same as support gem effects plus the
 *  behaviour keys listed in docs/skill-system.md (explode, ground, repeat, extra, killBlast, ...). */
export interface SkillModDef { id: string; name: string; text: string; fx: Record<string, number> }
/** How a skill type behaves in the cast priority list: `filler` = may be the last "Always" skill, `cond` = default condition. */
export interface SkillTypeDef { filler?: boolean; cond?: string }
export interface SkillDef {
  name: string; abbr: string; tree: string; element: Element; kind?: 'passive'; type?: SkillType; tags?: string[];
  mana?: number; cooldown?: number; min?: number; max?: number; reqLevel: number; maxLevel?: number; description: string; row: number;
  projectileSpeed?: number; radius?: number; delay?: number; chill?: number; chillEffect?: number;
  burnChance?: number; freezeChance?: number; shockChance?: number; critBonus?: number;
  duration?: number; barrierBase?: number; barrierPerLevel?: number; meleeChill?: number;
  jumps?: number; jumpRange?: number; jumpFalloff?: number;
  /** beam: pulses per channel, channel seconds (scaled by cast speed), reach and width in tiles */
  ticks?: number; channel?: number; range?: number; width?: number;
  /** curse: % more damage taken of the skill element, per level */
  curseTaken?: number; curseTakenPerLevel?: number;
  /** field: seconds between pulses */
  tick?: number;
  /** ward: barrier as % of life (+ per level), % less damage taken, freeze seconds on cast */
  wardPct?: number; wardPctPerLevel?: number; wardDR?: number; freeze?: number;
  /** orb: tiles per second, seconds between zaps, zap reach */
  speed?: number; zapEvery?: number; zapRange?: number;
  /** construct: seconds between attacks, how many at a time */
  attackEvery?: number; constructs?: number;
  /** curse: centred on the hero instead of the target (warrior taunts) */
  self?: boolean;
  /** % more damage against burning / chilled-or-frozen / shocked targets built into the skill */
  vsBurning?: number; vsChilled?: number; vsShocked?: number;
  /** warrior cry: % more damage the hero deals (+ per level) and % less damage taken while it lasts */
  cryMore?: number; cryMorePerLevel?: number; cryDR?: number;
  /** melee skills hit enemies this far from the hero (default: class reach) */
  reach?: number;
  /** active skills: modifier tiers, two choices each (unlocked at MOD_LEVELS) */
  mods?: [SkillModDef, SkillModDef][];
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
export interface TreeDef { name: string; element: Element; description: string; /** class the tree belongs to (hero.json className, lower case) */ class?: string }

export interface BossDef {
  title: string; res: Record<Element, number>; intro: string;
  phases: { belowHp: number; element: Element; res: Record<Element, number>; message: string }[];
  special: { name: string; first: number; every: number; mult: number; radius: number };
}
export interface MonsterDef {
  name: string; element: Element; hp: number; dmg: number; attackTime: number; moveSpeed: number;
  sprite: string; height: number; flying?: boolean; facesLeft?: boolean; ranged?: number; boss?: BossDef;
  /** fleeing treasure creature (never in an area pool) */ treasure?: boolean;
  /** second pose shown while walking/fleeing (e.g. Coin-Wretch running) */ runSprite?: string;
  /** colour the sprite is tinted with (a reused sprite until the monster has its own art) */ tint?: string;
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
export interface AffixDef { group: 'prefix' | 'suffix'; kind: AffixKind; name: string; text: string; percent: boolean; base: number; perLevel: number; weight: number; decimals?: number; slots?: Slot[]; minLevel?: number; rare?: number; /** only rolls for heroes of this class */ cls?: string }
export type Slot = 'weapon' | 'helm' | 'armor' | 'amulet' | 'ring';
export interface RarityDef { name: string; color: string; weight: number; bossWeight: number; affixes?: [number, number]; prefixes?: number; suffixes?: number }
export interface UniqueDef {
  slot: Slot; base: string; name: string; mods: string[]; effect: string; /** mythic: only drops from the rift pinnacle boss */ pinnacle?: boolean;
  /** loot package: lowest item level it drops at, pick weight (default 1), class-only effect, base per class, data-driven skill effect */
  lvl?: number; weight?: number; cls?: string; bases?: Record<string, string>; skillFx?: { tags: string[]; fx: Record<string, number> };
}
export interface DropRule { count: [number, number]; minRarity: number; gemChance: number }

export type Attr = 'power' | 'focus' | 'spirit' | 'vit';

const sk = skillsJson as unknown as {
  trees: Record<string, TreeDef>; skills: Record<string, SkillDef>; spark: SparkDef; startSkill: string;
  autoOrder: [string, string][]; scaling: { damagePerLevel: number; synergyPerPoint: number; manaPerLevel: number };
  states: StatesDef; conditions: Record<string, string>; maxSkillLevel: number; socketLevels: number[];
  modifiers: { levels: number[]; respecPerLevel: number }; types: Record<string, SkillTypeDef>; statNames: Record<string, string>;
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
/** Skill levels (points spent, without +skill items) at which the modifier tiers open. */
export const MOD_LEVELS = sk.modifiers.levels;
export const MOD_RESPEC_PER_LEVEL = sk.modifiers.respecPerLevel;
export const SKILL_TYPES = sk.types;
/** Display names of passive stat keys that are not item affixes. */
export const STAT_NAMES = sk.statNames;
/** May this skill be the bottom "Always" filler of the cast list (no cooldown, a damage type)? */
export const isFiller = (id: string) => { const d = SKILLS[id]; return !!d && !d.cooldown && !!SKILL_TYPES[d.type ?? '']?.filler; };

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
  sizes: Record<Slot | 'gem' | 'key', [number, number]>; bag: { width: number; height: number };
  /** gem pouch: how many support gems it holds (gems never take bag cells) */
  pouch: number;
  sell: { base: number; perLevel: number; perRarity: number; gemBase: number; gemPerLevel: number };
  drops: { goldChance: number; goldPerLevel: [number, number]; itemChance: number; gemChance: number; champion: DropRule; elite: DropRule; boss: DropRule };
  filterNames: string[];
  /** loot package: rarity weights per source, unique share of magic find, off-class unique chance */
  dropTables: Record<DropTableId, [number, number, number, number]>; uniqueBoostShare: number; offClassUnique: number;
};
export type DropTableId = 'monster' | 'champion' | 'elite' | 'boss' | 'wretch' | 'chest' | 'tear' | 'guardian' | 'pinnacle' | 'gamble';
export const ITEMS = it;
export const SLOTS = it.slots;
export const SLOT_NAMES = it.slotNames;
export const RARITIES = it.rarities;
export const UNIQUES = it.uniques;
/** Uniques that drop from monsters, chests and the vendor (mythic pinnacle uniques excluded). */
export const COMMON_UNIQUES = Object.keys(it.uniques).filter(k => !it.uniques[k].pinnacle);
export const MYTHIC_UNIQUES = Object.keys(it.uniques).filter(k => it.uniques[k].pinnacle);
export const ITEM_SIZES = it.sizes;
export const BAG_W = it.bag.width, BAG_H = it.bag.height;
export const POUCH_SIZE = it.pouch;

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
  /** highest character level (ember points after it, see meta.json) */ levelCap: number;
  xpPenalty: { freeLevels: number; perLevel: number; min: number };
  movement: { walkSpeed: number; kiteSpeed: number; kiteTime: number; kiteCooldown: number; kiteTrigger: number; aggroRange: number; pickupRange: number };
};
export const ATTRS = Object.keys(HERO.attributes) as Attr[];

/* ---------- hero classes (classes.json) ---------- */
export type ClassId = 'sorceress' | 'warrior';
type HeroBase = typeof HERO.base;
export interface ClassDef {
  name: string; pronoun: [string, string]; blurb: string; resource: string; startSkill: string; basic: string; melee: boolean;
  reach?: number; furyPerSwing?: number; sprite: string | null;
  attributes?: Record<Attr, { name: string; description: string }>; startAttributes?: Record<Attr, number>;
  base?: Partial<HeroBase>; perLevel?: Partial<{ life: number; mana: number }>; innate?: Record<string, number>;
  basicDef?: { name: string; min: number; max: number; perLevel: number; castTimeMult: number };
  weaponName?: string; weaponBases?: { name: string; icon: string }[];
  affixText: Record<string, string>; statText: Record<string, string>;
}
const cl = classesJson as unknown as { default: ClassId; classes: Record<ClassId, ClassDef> };
export const CLASSES = cl.classes;
export const CLASS_IDS = Object.keys(cl.classes) as ClassId[];
export const DEFAULT_CLASS = cl.default;
export const isClass = (c: unknown): c is ClassId => typeof c === 'string' && c in CLASSES;
export const classDef = (c?: string | null): ClassDef => CLASSES[isClass(c) ? c : DEFAULT_CLASS];
/** Hero numbers of a class: hero.json with the class overrides on top. */
export interface ClassHero { base: HeroBase; perLevel: typeof HERO.perLevel; startAttributes: Record<Attr, number>; attributes: Record<Attr, { name: string; description: string }>; innate: Record<string, number> }
const heroCache = new Map<string, ClassHero>();
export function heroFor(c?: string | null): ClassHero {
  const id = isClass(c) ? c : DEFAULT_CLASS;
  let h = heroCache.get(id);
  if (!h) {
    const C = CLASSES[id];
    h = { base: { ...HERO.base, ...C.base }, perLevel: { ...HERO.perLevel, ...C.perLevel }, startAttributes: { ...HERO.startAttributes, ...C.startAttributes },
      attributes: { ...HERO.attributes, ...C.attributes }, innate: { ...C.innate } };
    heroCache.set(id, h);
  }
  return h;
}
/** Trees of a class, in tab order. */
export const classTrees = (c?: string | null) => Object.keys(TREES).filter(t => (TREES[t].class ?? DEFAULT_CLASS) === (isClass(c) ? c : DEFAULT_CLASS));
/** Does a skill belong to a class (by its tree)? */
export const skillOfClass = (id: string, c?: string | null) => !!SKILLS[id] && (TREES[SKILLS[id].tree]?.class ?? DEFAULT_CLASS) === (isClass(c) ? c : DEFAULT_CLASS);

/**
 * Class whose words the shared texts use (affix names, the weapon slot name, item bases of new drops).
 * Set by the Sim for the hero it plays. Only names and the base of new weapons depend on it, never numbers.
 */
let activeClass: ClassId = DEFAULT_CLASS;
export const getActiveClass = () => activeClass;
const AFFIX_BASE_TEXT: Record<string, string> = {};
export function setActiveClass(c?: string | null) {
  activeClass = isClass(c) ? c : DEFAULT_CLASS;
}
/** Label of a hero-panel line in the words of the active class ("Spell damage" → "Attack damage"). */
export const classText = (label: string) => CLASSES[activeClass].statText[label] ?? label;
/** Weapon bases new drops roll for the active class. */
export const weaponBases = () => CLASSES[activeClass].weaponBases ?? it.bases.weapon;
/** Icon file name (without "item-" prefix) for an item base name (all classes). */
export const BASE_ICON: Record<string, string> = Object.fromEntries(
  [...Object.values(it.bases).flat(), ...Object.values(cl.classes).flatMap(c => c.weaponBases ?? [])].map(b => [b.name, b.icon]),
);
// class words: the weapon slot name and renamed affixes follow the active class (see setActiveClass)
Object.defineProperty(it.slotNames, 'weapon', { get: () => CLASSES[activeClass].weaponName ?? 'Staff', enumerable: true });
for (const c of Object.values(cl.classes)) for (const k of Object.keys(c.affixText)) {
  const a = af.affixes[k];
  if (!a || k in AFFIX_BASE_TEXT) continue;
  AFFIX_BASE_TEXT[k] = a.text;
  Object.defineProperty(a, 'text', { get: () => CLASSES[activeClass].affixText[k] ?? AFFIX_BASE_TEXT[k], enumerable: true });
}


const gm = gemsJson as unknown as { maxLevel: number; gems: Record<string, GemDef> };
export const GEMS = gm.gems;
export const GEM_MAX_LEVEL = gm.maxLevel;

export interface DifficultyDef { name: string; levelAdd: number; resPenalty: number; hpMult: number; dmgMult: number; xpMult: number; goldMult: number }
const df = difficultyJson as unknown as { difficulties: DifficultyDef[]; offline: { rate: number; maxHours: number; minSeconds: number } };
export const DIFFICULTIES = df.difficulties;
export const OFFLINE = df.offline;

/* ---------- economy: salvage, crafting embers, corruption, gambling, stash (economy.json) ---------- */
export type MatId = 'dust' | 'essence' | 'shard' | 'pearl';
export type EmberId = 'change' | 'choice' | 'whet' | 'rise' | 'bind' | 'crown' | 'wax' | 'ascend';
export type Mats = Partial<Record<MatId, number>>;
export interface EmberDef { name: string; short: string; text: string; target: boolean; color: string; cost: Mats; /** also works on uniques / only on uniques */ unique?: boolean; uniqueOnly?: boolean }
/** Direct material drops of one source: material -> [chance, min, max]. */
export type CurrencyDrop = Partial<Record<MatId, [number, number, number]>>;
export type CorruptOutcome = 'extra' | 'double' | 'seal' | 'replace';
const ec = economyJson as unknown as {
  materials: Record<MatId, { name: string; color: string; tier: string; text: string }>;
  salvage: Partial<Record<MatId, [number, number]>>[];
  currencyDrops: { scale: Record<MatId, number> } & Record<string, CurrencyDrop>;
  embers: Record<EmberId, EmberDef>;
  craftScale: { perLevel: number; perCraft: number; uniqueMult: number };
  riseTo: Record<string, Mats>;
  bindAffixes: [number, number];
  corruption: { cost: Mats; goldPerLevel: number; weights: Record<CorruptOutcome, number>; extraRoll: [number, number]; doubleMult: number };
  gamble: { base: number; perLevel: number; perLevelSq: number; slotMult: Record<Slot, number> };
  stash: { tabs: number; names: string[] };
  lootDefaults: { minRarity: number; keepUniques: boolean; keepGems: boolean; keepUpgrades: boolean; autoSalvage: boolean };
};
export const ECONOMY = ec;
export const MATERIALS = ec.materials;
export const MAT_IDS = Object.keys(ec.materials) as MatId[];
export const EMBERS = ec.embers;
export const EMBER_IDS = Object.keys(ec.embers) as EmberId[];
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

/* ---------- work package D (Meta progression) ---------- */
export type BountyKind = 'killArea' | 'killElites' | 'killElement' | 'findRare' | 'killTyrant' | 'killWretch' | 'useShrines';
export interface BountyTemplate { weight: number; n: [number, number]; reward: number; text: string }
export type MechanicKind = 'target' | 'line' | 'ring' | 'scatter' | 'nova';
export interface TyrantDef {
  name: string; title: string; monster: string; scale: number; tint: string; intro: string;
  mechanic: { kind: MechanicKind; name: string; element: Element; every: number; delay: number; radius: number; count: number; mult: number; spread?: number };
  slots: Slot[]; affixes: string[]; uniques: string[];
}
export type EventId = 'bloodmoon' | 'tear' | 'champion';
export type EmberTrack = 'offense' | 'defense' | 'flow' | 'fortune';
export interface FeatDef { name: string; text: string; type: string; n: number; bonus?: Record<string, number>; title?: string }
export interface MetaDef {
  bounties: {
    open: number; currentAreaChance: number; swapGoldPerLevel: number; templates: Record<BountyKind, BountyTemplate>;
    reward: { goldPerLevel: number; mats: Partial<Record<MatId, [number, number]>>; shardChance: number; shards: [number, number]; gemChance: number; uniqueChance: number; uniqueTable: string[] };
  };
  tyrants: {
    kills: number; hpMult: number; dmgMult: number; levelAdd: number; adds: number;
    loot: { count: [number, number]; minRarity: number; affixChance: number; uniqueChance: number; goldPiles: [number, number]; gemChance: number };
    list: Record<string, TyrantDef>;
  };
  events: {
    every: [number, number]; weights: Record<EventId, number>;
    bloodmoon: { name: string; text: string; color: string; duration: number; extraShare: number; eliteChance: number };
    tear: { name: string; text: string; color: string; duration: number; radius: number; growPerKill: number; maxRadius: number; shrinkPerSecond: number; goldMult: number; itemChance: number; rarityBoost: number };
    champion: { name: string; text: string; color: string; duration: number; casingPct: number; levelAdd: number; hpMult: number };
  };
  codex: { imprint: Mats; perLevel: number };
  ember: { tracks: Record<EmberTrack, { name: string; color: string; text: string; per: Record<string, number> }> };
  feats: { list: Record<string, FeatDef> };
}
export const META = metaJson as unknown as MetaDef;
export const TYRANTS = META.tyrants.list;
export const FEATS = META.feats.list;
export const EMBER_TRACKS = Object.keys(META.ember.tracks) as EmberTrack[];
export const EVENT_IDS = Object.keys(META.events.weights) as EventId[];
/* ---------- work package C (Rifts) ---------- */
/** Effects of key modifiers and atlas nodes on a rift run (see rift.json keyMods._doc and atlas._doc). */
export interface RiftFx {
  monRes?: Partial<Record<Element, number>>; eliteMult?: number; monSpeed?: number; monDmg?: number; monHp?: number; packSize?: number;
  heroRes?: number; heroBarrierRegen?: number; qty?: number; rarity?: number; gold?: number; xp?: number; progress?: number;
  shrineMult?: number; wretchMult?: number;
  guardianHp?: number; elitePoints?: number; timer?: number; twinKey?: number; fragChance?: number; extraSlot?: number;
  noBoons?: number; rewardMult?: number; guardianItems?: number; doubleLeap?: number;
}
export interface KeyModDef { kind: 'hazard' | 'boon'; risk: number; text: string; fx: RiftFx }
export interface AtlasNodeDef { col: number; row: number; name: string; max: number; text: string; fx: RiftFx }
export interface RiftMechanic { name: string; label: string; first: number; every: number; radius: number; delay: number; mult: number; count?: number; spread?: number }
export interface RiftLoot { items: [number, number]; minRarity: number; goldPiles: [number, number]; goldPerPile: number; gemChance: number; rarityBoost?: number }
export interface RiftDef {
  unlock: { difficulty: number };
  scaling: { refLevel: number; refDifficulty: number; hpGrowth: number; hpLinear: number; dmgGrowth: number; dmgLinear: number; level: { base: number; perTier: number; max: number }; resPenalty: number };
  run: { progressNeed: number; points: number[]; timer: number; waveSize: [number, number]; typesPerWave: number; championChance: number; eliteChance: number; autoTierAboveBest: number; itemQuantity: number };
  guardian: { pool: string[]; hpMult: number; dmgMult: number; scale: number; sub: string; epithets: string[]; slam: RiftMechanic; rain: RiftMechanic; enrageBelow: number; enrageRate: number; loot: RiftLoot };
  rewards: { lowerChance: number; eliteKeyChance: number; fragChance: number };
  keys: { countWeights: number[]; hazardShare: number; maxBoons: number; rewardPerRisk: { qty: number; rarity: number; xp: number }; freeTier: number; sellBase: number; sellPerTier: number };
  keyMods: Record<string, KeyModDef>;
  atlas: { pointEvery: number; respecPerPoint: number; columns: string[]; nodes: Record<string, AtlasNodeDef> };
  pinnacle: { every: number; frags: number; boss: string; hpMult: number; dmgMult: number; scale: number; adds: number; mechanicRate: number; loot: RiftLoot; mythicChance: number };
  mythic: { pyrewright: { perAilment: number }; unburied: { time: number; cooldown: number; life: number }; stair: { castSpeed: number; time: number; max: number; barrier: number } };
}
const strip = <T>(o: Record<string, T | string>) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_'))) as Record<string, T>;
const rj = riftJson as unknown as RiftDef;
export const RIFT: RiftDef = { ...rj, keyMods: strip(rj.keyMods), atlas: { ...rj.atlas, nodes: strip(rj.atlas.nodes) } };
export const KEY_MODS = RIFT.keyMods;
export const ATLAS_NODES = RIFT.atlas.nodes;
