/**
 * Headless balancing run: lets a hero play on her own and prints progress.
 * The bot spends points by a build plan, equips better items and sockets fitting gems.
 *
 *   node scripts/simulate.ts [minutes=60] [seed=1] [build=fire|cold|storm]
 */
import { AREAS, DIFFICULTIES, SKILLS, SOCKET_LEVELS, type Attr } from '../src/content/index.ts';
import { gemFits, itemScore } from '../src/sim/formulas.ts';
import { Sim } from '../src/sim/sim.ts';
import { canAfford, craftCost, craftableMods, emberBlock } from '../src/sim/crafting.ts';
import { forge, salvage } from '../src/sim/economy.ts';
import { isGem } from '../src/sim/types.ts';
import { bountyDone } from '../src/sim/bounty.ts';
import { imprintBlock, imprintCost } from '../src/sim/codex.ts';
import { UNIQUES, TYRANTS } from '../src/content/index.ts';

const minutes = Number(process.argv[2] ?? 60), seed = Number(process.argv[3] ?? 1), build = process.argv[4] ?? 'fire';
const PLANS: Record<string, string[]> = {
  fire: ['fireball', 'pyromancy', 'frostarmor', 'searing', 'meteor', 'fireball', 'pyromancy', 'kindling'],
  cold: ['frostbolt', 'coldmastery', 'frostarmor', 'icenova', 'frostbolt', 'coldmastery', 'permafrost'],
  storm: ['chain', 'conductivity', 'frostarmor', 'nova', 'thunder', 'chain', 'stormmastery'],
};
const plan = PLANS[build];
const attrOrder: Attr[] = ['vit', 'power', 'spirit', 'focus', 'vit'];
const sim = new Sim(undefined, { seed, headless: true });
const crafts: Record<string, number> = {};

/** Simple crafting: bind magic gear into rares, then raise affix tiers on equipped items while materials last. */
function craft() {
  const s = sim.s;
  for (const it of Object.values(s.equip)) {
    if (!it) continue;
    const tries: [ 'bind' | 'rise', number | null][] = [['bind', null], ...craftableMods(it).map(i => ['rise', i] as ['rise', number])];
    for (const [e, i] of tries) {
      const cost = craftCost(it, e);
      if (emberBlock(it, e, i) || !canAfford(s.mats, cost)) continue;
      if (!forge(sim, it.id, e, i, cost)) crafts[e] = (crafts[e] || 0) + 1;
    }
  }
}

function spend() {
  const s = sim.s;
  let i = 0;
  while (s.attrPts > 0) sim.addAttr(attrOrder[i++ % attrOrder.length]);
  while (s.skillPts > 0) {
    const id = plan.find(k => !s.skills[k] && sim.canLearn(k)) ?? plan.filter(k => sim.canLearn(k)).sort((a, b) => (s.skills[a] || 0) - (s.skills[b] || 0))[0];
    if (!id) break;
    sim.learnSkill(id);
  }
  for (const it of s.bag.slice()) if (!isGem(it) && itemScore(it) > itemScore(s.equip[it.slot])) sim.equip(it.id);
  for (const id of Object.keys(s.skills)) {
    if (SKILLS[id].kind === 'passive') continue;
    SOCKET_LEVELS.forEach((_, si) => {
      if (!sim.socketOpen(id, si) || sim.socketsOf(id)[si]) return;
      const g = s.gems.find(x => gemFits(x.gem, id) && !sim.socketsOf(id).some(o => o?.gem === x.gem));
      if (g) sim.socketGem(id, si, g.id);
    });
  }
  // normal and magic items are sold for gold, rares salvaged for crafting, spare uniques salvaged for the codex
  for (const it of s.bag.slice()) if (!isGem(it)) { if (it.r < 2) sim.sell(it.id); else salvage(sim, it.id); }
  meta();
  craft();
  if (s.hpPot < 5) sim.buyPotions('hp', 5);
  if (s.mpPot < 5) sim.buyPotions('mp', 5);
  for (let d = DIFFICULTIES.length - 1; d > s.difficulty; d--) if (s.progress[d]) { sim.setDifficulty(d); break; }
}

/** Meta: claim finished bounties, swap those for other areas, imprint codex effects on equipped rares. */
function meta() {
  const s = sim.s, M = sim.meta;
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

const reached: string[] = [];
const seen = new Set<string>();
for (let t = 0; t < minutes * 60; t += 5) {
  sim.advance(5);
  spend();
  const key = `${sim.s.difficulty}:${sim.unlocked}`;
  if (!seen.has(key)) { seen.add(key); reached.push(`  ${(t / 60).toFixed(1).padStart(6)} min  lv ${String(sim.s.lvl).padStart(2)}  ${DIFFICULTIES[sim.s.difficulty].name} – ${AREAS[sim.unlocked - 1].name}`); }
}
const s = sim.s;
console.log(`After ${minutes} min (seed ${seed}, ${build}): level ${s.lvl}, ${s.kills} kills, ${s.deaths} deaths, ${s.gold} gold`);
console.log('Unlocked:'); console.log(reached.join('\n'));
console.log('Skills:', JSON.stringify(s.skills));
console.log('Gems:', Object.entries(s.sockets).map(([k, a]) => `${k}: ${a.filter(Boolean).map(g => g!.gem + g!.lvl).join(',')}`).join(' | '));
console.log('Materials:', JSON.stringify(s.mats), 'crafts:', JSON.stringify(crafts));
console.log('Res:', JSON.stringify(sim.st.res), 'life', sim.st.maxLife);
console.log('Feel:', JSON.stringify(sim.feel.stats));
const mr = sim.meta.run, mt = s.meta;
console.log('Meta:', JSON.stringify({ bounties: mr.bounties, tyrantSpawns: mr.tyrantSpawns, tyrantKills: mr.tyrantKills, events: mr.events, feats: mt.feats.length, codex: mt.codex.length, imprints: mr.imprints, ember: mr.ember }));
console.log('Tyrant counters:', JSON.stringify(mt.tyrant), 'slain:', JSON.stringify(mt.slain), `(${Object.keys(TYRANTS).length} tyrants)`);
