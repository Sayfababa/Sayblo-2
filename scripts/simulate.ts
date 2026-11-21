/**
 * Headless balancing run: lets a hero play on her own and prints progress.
 * The bot spends points by a build plan, equips better items and sockets fitting gems.
 *
 *   node scripts/simulate.ts [minutes=60] [seed=1] [build=fire|lance|cold|storm, or fire0|cold0|storm0 = old six-skill plans]
 *
 * Rifts (work package C), with a generated end-game hero (scripts/endgame.ts, level --level, default 60):
 *   node scripts/simulate.ts 60 1 fire --rift 20         auto mode from a tier 20 key for 60 minutes: keys, tiers, clear times
 *   node scripts/simulate.ts 60 1 fire --sweep 1,10,25   three runs of each tier with a plain key: clear times and deaths
 *   add --ref 29:1 to anchor tier 1 at another monster level and difficulty (here: Nightmare end) for pacing tests
 */
import { AREAS, DIFFICULTIES, RIFT, SKILLS, SOCKET_LEVELS, type Attr } from '../src/content/index.ts';
import { gemFits, itemScore } from '../src/sim/formulas.ts';
import { Sim } from '../src/sim/sim.ts';
import { canAfford, craftCost, craftableMods, emberBlock } from '../src/sim/crafting.ts';
import { forge, salvage } from '../src/sim/economy.ts';
import { bountyDone } from '../src/sim/bounty.ts';
import { imprintBlock, imprintCost } from '../src/sim/codex.ts';
import { UNIQUES, TYRANTS } from '../src/content/index.ts';
import { isEquip, isGem } from '../src/sim/types.ts';
import { rollKey, riftHpMult, riftDmgMult, riftLevel } from '../src/sim/rift.ts';
import { PLANS, endgameSave, nextSkill, pickMods, planSlots } from './endgame.ts';

const args = process.argv.slice(2), flag = (k: string) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const riftStart = flag('--rift'), sweep = flag('--sweep'), heroLvl = Number(flag('--level') ?? 60), ref = flag('--ref');
// --ref L:D anchors tier 1 at monster level L of difficulty D instead of rift.json (to test pacing while Hell itself is not beatable)
if (ref) { const [L, D] = ref.split(':').map(Number); RIFT.scaling.refLevel = L; RIFT.scaling.refDifficulty = D ?? 2; RIFT.scaling.level.base = L; }
const minutes = Number(args[0] ?? 60), seed = Number(args[1] ?? 1), build = args[2] ?? 'fire';
const riftMode = riftStart != null || sweep != null;
const plan = PLANS[build];
const attrOrder: Attr[] = ['vit', 'power', 'spirit', 'focus', 'vit'];
const sim = new Sim(riftMode ? endgameSave(build, heroLvl, seed) : undefined, { seed, headless: true });
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
    const id = nextSkill(sim, plan);
    if (!id) break;
    sim.learnSkill(id);
  }
  planSlots(sim, plan);
  pickMods(sim, build.replace(/0$/, '-')); // skill modifiers (old plans "fire0" etc. pick option 0)
  // rift runs keep the generated gear (its resistances matter more than the raw item score)
  if (!riftMode) for (const it of s.bag.slice()) if (isEquip(it) && itemScore(it) > itemScore(s.equip[it.slot])) sim.equip(it.id);
  for (const id of Object.keys(s.skills)) {
    if (SKILLS[id].kind === 'passive') continue;
    SOCKET_LEVELS.forEach((_, si) => {
      if (!sim.socketOpen(id, si) || sim.socketsOf(id)[si]) return;
      const g = s.bag.find(x => isGem(x) && gemFits(x.gem, id) && !sim.socketsOf(id).some(o => o?.gem === x.gem));
      if (g) sim.socketGem(id, si, g.id);
    });
  }
  // normal and magic items are sold for gold, rares salvaged for crafting, spare uniques salvaged for the codex
  for (const it of s.bag.slice()) if (isEquip(it)) { if (it.r < 2) sim.sell(it.id); else salvage(sim, it.id); }
  meta();
  craft();
  if (s.hpPot < 5) sim.buyPotions('hp', 5);
  if (s.mpPot < 5) sim.buyPotions('mp', 5);
  if (!riftMode) for (let d = DIFFICULTIES.length - 1; d > s.difficulty; d--) if (s.progress[d]) { sim.setDifficulty(d); break; }
}

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function riftReport() {
  const s = sim.s, R = sim.rift.stats;
  console.log(`Hero: level ${s.lvl} (${build}), life ${sim.st.maxLife}, res ${JSON.stringify(sim.st.rawRes)} before the rift penalty, ${s.deaths} deaths`);
  console.log('tier  mon.lv  hp x   dmg x  runs  median   best    all clear times');
  for (const t of Object.keys(R.times).map(Number).sort((a, b) => a - b)) {
    const ts = R.times[t].slice().sort((a, b) => a - b);
    console.log(`${String(t).padStart(4)}  ${String(riftLevel(t)).padStart(6)}  ${riftHpMult(t).toFixed(1).padStart(5)}  ${riftDmgMult(t).toFixed(2).padStart(5)}  ${String(ts.length).padStart(4)}  ${mmss(ts[Math.floor(ts.length / 2)]).padStart(6)}  ${mmss(ts[0]).padStart(6)}    ${ts.map(mmss).join(' ')}`);
  }
  console.log(`Rifts: ${R.runs} cleared, ${R.fails} failed · keys dropped ${R.keys} · fragments ${R.frags} · highest tier ${s.rift.maxTier} · atlas points ${Math.floor(s.rift.maxTier / 5)}`);
  console.log('Keys in bag:', s.bag.filter(i => i.kind === 'key').map(k => (k as { tier: number }).tier).join(','));
  console.log('Feel:', JSON.stringify(sim.feel.stats));
}

if (sweep != null) {
  // fixed tiers: three runs each with a plain key, at most 15 minutes per run
  for (const t of sweep.split(',').map(Number)) {
    for (let i = 0; i < 3; i++) {
      const before = sim.rift.stats.fails;
      const k = rollKey(sim.rng, sim.itemId(), t);
      k.mods = [];
      sim.takeItem(k, true);
      sim.rift.startKey(k.id);
      for (let el = 0; el < 900 && sim.rift.run; el += 5) { sim.advance(5); spend(); }
      if (sim.rift.run) { console.log(`tier ${t}: run ${i + 1} not done after 15 min (progress ${Math.round(sim.rift.run.progress)}/${sim.rift.run.need})`); sim.enterZone(sim.s.zone); }
      else if (sim.rift.stats.fails > before) console.log(`tier ${t}: run ${i + 1} died`);
      if (sim.phase === 'town') sim.advance(10);
    }
  }
  riftReport();
  process.exit(0);
}
if (riftStart != null) {
  sim.s.rift.auto = true;
  sim.takeItem(rollKey(sim.rng, sim.itemId(), Number(riftStart)), true);
  sim.s.rift.maxTier = Math.max(0, Number(riftStart) - 1);
  sim.rift.startKey(sim.rift.bestKey()!.id);
  for (let t = 0; t < minutes * 60; t += 5) { sim.advance(5); spend(); }
  riftReport();
  process.exit(0);
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
console.log('Mods:', JSON.stringify(s.skillMods));
console.log('Damage by skill:', Object.entries(sim.spells.dealt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v / 1000)}k`).join(', '));
console.log('Gems:', Object.entries(s.sockets).map(([k, a]) => `${k}: ${a.filter(Boolean).map(g => g!.gem + g!.lvl).join(',')}`).join(' | '));
console.log('Materials:', JSON.stringify(s.mats), 'crafts:', JSON.stringify(crafts));
console.log('Res:', JSON.stringify(sim.st.res), 'life', sim.st.maxLife);
console.log('Feel:', JSON.stringify(sim.feel.stats));
const mr = sim.meta.run, mt = s.meta;
console.log('Meta:', JSON.stringify({ bounties: mr.bounties, tyrantSpawns: mr.tyrantSpawns, tyrantKills: mr.tyrantKills, events: mr.events, feats: mt.feats.length, codex: mt.codex.length, imprints: mr.imprints, ember: mr.ember }));
console.log('Tyrant counters:', JSON.stringify(mt.tyrant), 'slain:', JSON.stringify(mt.slain), `(${Object.keys(TYRANTS).length} tyrants)`);
