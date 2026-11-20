/**
 * Headless balancing run: lets a hero play on her own and prints progress.
 * The hero spends points automatically (attributes evenly, skills in a fixed order) and equips better items.
 *
 *   node scripts/simulate.ts [minutes=60] [seed=1]
 */
import { AREAS, SKILLS, type Attr } from '../src/content/index.ts';
import { itemScore } from '../src/sim/formulas.ts';
import { Sim } from '../src/sim/sim.ts';

const minutes = Number(process.argv[2] ?? 60), seed = Number(process.argv[3] ?? 1);
const sim = new Sim(undefined, { seed, headless: true });
const plan = ['frostbolt', 'chain', 'frostarmor', 'nova', 'meteor', 'fireball'];
const attrOrder: Attr[] = ['vit', 'power', 'spirit', 'focus', 'vit'];

function spend() {
  const s = sim.s;
  let i = 0;
  while (s.attrPts > 0) sim.addAttr(attrOrder[i++ % attrOrder.length]);
  while (s.skillPts > 0) {
    const id = plan.find(k => !s.skills[k] && s.lvl >= SKILLS[k].reqLevel) ?? plan.filter(k => s.lvl >= SKILLS[k].reqLevel).sort((a, b) => (s.skills[a] || 0) - (s.skills[b] || 0))[0];
    sim.learnSkill(id);
  }
  for (const it of s.bag.slice()) if (itemScore(it) > itemScore(s.equip[it.slot])) sim.equip(it.id);
  s.bag = s.bag.filter(it => { if (it.r < 2) { s.gold += 1; return false; } return true; });
  if (s.hpPot < 5) sim.buyPotions('hp', 5);
  if (s.mpPot < 5) sim.buyPotions('mp', 5);
}

const reached: Record<number, number> = {};
for (let t = 0; t < minutes * 60; t += 5) {
  sim.advance(5);
  spend();
  if (reached[sim.s.unlocked - 1] == null) reached[sim.s.unlocked - 1] = t;
}
const s = sim.s;
console.log(`After ${minutes} min (seed ${seed}): level ${s.lvl}, ${s.kills} kills, ${s.deaths} deaths, ${s.gold} gold`);
console.log('Area unlocked after:');
for (const [i, t] of Object.entries(reached)) console.log(`  ${AREAS[+i].name.padEnd(18)} ${(t / 60).toFixed(1)} min`);
console.log('Skills:', JSON.stringify(s.skills));
