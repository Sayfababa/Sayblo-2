/**
 * The balancing bot shared by scripts/simulate.ts and scripts/loot-report.ts: spends points by a build plan,
 * equips upgrades, sockets gems, claims bounties, imprints codex effects and crafts at the forge.
 */
import { DIFFICULTIES, SKILLS, SOCKET_LEVELS, UNIQUES, type Attr, type EmberId, type Slot } from '../src/content/index.ts';
import { gemFits } from '../src/sim/formulas.ts';
import { Sim } from '../src/sim/sim.ts';
import { canAfford, craftCost, craftableMods, emberBlock } from '../src/sim/crafting.ts';
import { forge, salvage } from '../src/sim/economy.ts';
import { bountyDone } from '../src/sim/bounty.ts';
import { imprintBlock, imprintCost } from '../src/sim/codex.ts';
import { isEquip, type Item } from '../src/sim/types.ts';
import { isUpgrade, itemPower } from '../src/sim/upgrade.ts';
import { PLANS, nextSkill, pickMods, planSlots } from './endgame.ts';

const attrOrder: Attr[] = ['vit', 'power', 'spirit', 'focus', 'vit'];
const RES_KEYS = ['fireRes', 'coldRes', 'lightRes'];
/** Sum of resistances of an item (all res counts three times). */
const resOf = (it: Item | null) => (it ? it.mods.reduce((a, [k, v]) => a + (RES_KEYS.includes(k) ? v : k === 'allRes' ? 3 * v : 0), 0) : 0);

export interface BotOpts {
  /** rift mode: keep resistances of the generated gear (only take upgrades that do not lose resistance) */
  rift?: boolean;
}

export class Bot {
  sim: Sim; build: string; plan: string[]; opts: BotOpts;
  crafts: Record<string, number> = {};
  /** items equipped because they were better (found, bought or forged) */
  upgrades = 0;
  /** crafts that made an equipped item better by item power */
  craftUps = 0;
  constructor(sim: Sim, build: string, opts: BotOpts = {}) { this.sim = sim; this.build = build; this.plan = PLANS[build]; this.opts = opts; }

  /** One bot step (every few simulated seconds). */
  step() {
    const sim = this.sim, s = sim.s;
    let i = 0;
    while (s.attrPts > 0) sim.addAttr(attrOrder[i++ % attrOrder.length]);
    while (s.skillPts > 0) {
      const id = nextSkill(sim, this.plan);
      if (!id) break;
      sim.learnSkill(id);
    }
    planSlots(sim, this.plan);
    pickMods(sim, this.build.replace(/0$/, '-'));
    this.equipBest();
    for (const id of Object.keys(s.skills)) {
      if (SKILLS[id].kind === 'passive') continue;
      SOCKET_LEVELS.forEach((_, si) => {
        if (!sim.socketOpen(id, si) || sim.socketsOf(id)[si]) return;
        const g = s.gems.find(x => gemFits(x.gem, id) && !sim.socketsOf(id).some(o => o?.gem === x.gem));
        if (g) sim.socketGem(id, si, g.id);
      });
    }
    // everything left in the bag is salvaged for crafting materials (spare uniques fill the codex)
    for (const it of s.bag.slice()) if (isEquip(it)) salvage(sim, it.id);
    this.meta();
    this.craft();
    if (s.hpPot < 5) sim.buyPotions('hp', 5);
    if (s.mpPot < 5) sim.buyPotions('mp', 5);
    if (!this.opts.rift) for (let d = DIFFICULTIES.length - 1; d > s.difficulty; d--) if (s.progress[d]) { sim.setDifficulty(d); break; }
  }

  private equipBest() {
    const s = this.sim.s;
    for (const it of s.bag.slice()) {
      if (!isEquip(it) || it.unid) continue;
      const cur = s.equip[it.slot as Slot];
      if (!isUpgrade(it, cur)) continue;
      if (this.opts.rift && resOf(it) < resOf(cur) * 0.9) continue;
      this.sim.equip(it.id);
      this.upgrades++;
    }
  }

  /** Claim finished bounties, swap those for other areas, imprint codex effects on equipped rares. */
  private meta() {
    const sim = this.sim, s = sim.s, M = sim.meta;
    for (const b of s.meta.bounties.slice()) {
      if (bountyDone(b)) M.claim(b.id);
      else if ((b.kind === 'killArea' || b.kind === 'killTyrant') && (b.area !== s.zone || b.diff !== s.difficulty)) M.swap(b.id);
    }
    for (const it of Object.values(s.equip)) {
      if (!it || it.ipr) continue;
      const u = s.meta.codex.find(x => UNIQUES[x].slot === it.slot && !imprintBlock(s, it, x));
      if (u && canAfford(s.mats, imprintCost(it))) M.imprint(it.id, u);
    }
  }

  private use(it: Item, e: EmberId, idx: number | null): boolean {
    const sim = this.sim, cost = craftCost(it, e);
    if (emberBlock(it, e, idx) || !canAfford(sim.s.mats, cost)) return false;
    const before = itemPower(it);
    if (forge(sim, it.id, e, idx, cost)) return false;
    this.crafts[e] = (this.crafts[e] || 0) + 1;
    const now = sim.s.equip[it.slot];
    if (now && itemPower(now) > before) this.craftUps++;
    return true;
  }

  /** Simple crafting: bind magic gear into rares, then raise affix tiers on equipped items while materials last. */
  private craft() {
    const s = this.sim.s;
    for (const it of Object.values(s.equip)) {
      if (!it) continue;
      this.use(it, 'bind', null);
      for (const i of craftableMods(it)) this.use(s.equip[it.slot]!, 'rise', i);
    }
  }
}
