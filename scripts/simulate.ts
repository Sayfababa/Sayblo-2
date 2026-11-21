/**
 * Headless balancing run: lets a hero play on her own and prints progress.
 * The bot spends points by a build plan, equips better items and sockets fitting gems.
 *
 *   node scripts/simulate.ts [minutes=60] [seed=1] [build=fire|cold|storm]
 */
import { AREAS, DIFFICULTIES, SKILLS, SOCKET_LEVELS, type Attr } from '../src/content/index.ts';
import { gemFits, itemScore } from '../src/sim/formulas.ts';
import { Sim } from '../src/sim/sim.ts';
import { isGem } from '../src/sim/types.ts';

const minutes = Number(process.argv[2] ?? 60), seed = Number(process.argv[3] ?? 1), build = process.argv[4] ?? 'fire';
const PLANS: Record<string, string[]> = {
  fire: ['fireball', 'pyromancy', 'frostarmor', 'searing', 'meteor', 'fireball', 'pyromancy', 'kindling'],
  cold: ['frostbolt', 'coldmastery', 'frostarmor', 'icenova', 'frostbolt', 'coldmastery', 'permafrost'],
  storm: ['chain', 'conductivity', 'frostarmor', 'nova', 'thunder', 'chain', 'stormmastery'],
};
const plan = PLANS[build];
const attrOrder: Attr[] = ['vit', 'power', 'spirit', 'focus', 'vit'];
const sim = new Sim(undefined, { seed, headless: true });

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
      const g = s.bag.find(x => isGem(x) && gemFits(x.gem, id) && !sim.socketsOf(id).some(o => o?.gem === x.gem));
      if (g) sim.socketGem(id, si, g.id);
    });
  }
  for (const it of s.bag.slice()) if (!isGem(it) && it.r < 3) sim.sell(it.id);
  if (s.hpPot < 5) sim.buyPotions('hp', 5);
  if (s.mpPot < 5) sim.buyPotions('mp', 5);
  for (let d = DIFFICULTIES.length - 1; d > s.difficulty; d--) if (s.progress[d]) { sim.setDifficulty(d); break; }
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
console.log('Res:', JSON.stringify(sim.st.res), 'life', sim.st.maxLife);
console.log('Feel:', JSON.stringify(sim.feel.stats));
