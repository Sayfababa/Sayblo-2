import '@fontsource/cinzel/latin-500.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import './ui/styles.css';
import './ui/economy.css';
import './ui/feel.css';
import { Application } from 'pixi.js';
import { registerSW } from 'virtual:pwa-register';
import { Scene } from './render/scene.ts';
import { loadTextures } from './render/textures.ts';
import { clearLocal, loadLocal, saveLocal } from './sim/save.ts';
import { Sim, TICK } from './sim/sim.ts';
import { OFFLINE } from './content/index.ts';
import type { SaveState } from './sim/types.ts';
import { UI } from './ui/ui.ts';
import { Sfx } from './ui/audio.ts';

/** At most this many simulation steps per frame; if the device cannot keep up, the game slows down instead of freezing. */
const MAX_STEPS = 40;

async function boot() {
  const stage = document.getElementById('stage')!;
  const loadTxt = document.getElementById('loadtxt')!;
  let sim: Sim;
  let acc = 0;

  const app = new Application();
  await app.init({
    canvas: document.getElementById('world') as HTMLCanvasElement,
    resizeTo: stage,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
    antialias: true,
    background: '#050405',
    preference: 'webgl',
  });
  await Promise.all([
    loadTextures(p => { loadTxt.textContent = `Loading… ${Math.round(p * 100)}%`; }),
    document.fonts.load('700 12px Cinzel'), document.fonts.load('700 12px "Alegreya Sans"'),
  ]);

  const scene = new Scene(app);
  const sfx = new Sfx();
  const ui = new UI({
    sim: () => sim,
    replaceSave: (s: SaveState) => start(s),
    wipe: () => { clearLocal(); start(null); },
  });

  function start(save: SaveState | null) {
    sim = new Sim(save ?? undefined);
    acc = 0;
    scene.reset(sim);
    ui.clearLog();
    ui.addLog('The sorceress sets out. She fights on her own: spend points in Hero and Skills, and equip loot from the Bag.', 'lvl');
    ui.consume(sim.events); sim.events = [];
    ui.refreshAll();
    saveLocal(sim.s);
  }

  /**
   * Offline progress: the time away is played by the same simulation, headless, at a reduced rate
   * and up to a time limit. Runs in slices so the page stays responsive.
   */
  async function catchUp(awaySec: number) {
    if (awaySec < OFFLINE.minSeconds) return;
    let counted = Math.min(awaySec, OFFLINE.maxHours * 3600) * OFFLINE.rate;
    const before = { lvl: sim.s.lvl };
    sim.collectEvents = false;
    sim.resetRun();
    let left = counted;
    // slow phones: never compute longer than a few seconds, the rest of the time away is dropped
    const t0 = performance.now();
    while (left > 0 && performance.now() - t0 < 8000) {
      const step = Math.min(left, 600);
      sim.advance(step);
      left -= step;
      loadTxt.textContent = `Catching up… ${Math.round((1 - left / counted) * 100)}%`;
      await new Promise(r => setTimeout(r, 0));
    }
    counted -= Math.max(0, left);
    sim.collectEvents = true;
    sim.events = [];
    const run = sim.resetRun();
    scene.reset(sim);
    ui.refreshAll();
    ui.showSummary(awaySec, counted, run, before);
    ui.addLog(`Offline: ${run.kills} kills, ${run.xp} XP, ${run.gold} gold while you were away.`, 'lvl');
    saveLocal(sim.s);
  }

  const loaded = loadLocal();
  const lastSaved = loaded?.savedAt ?? 0;
  start(loaded);
  if (lastSaved) await catchUp((Date.now() - lastSaved) / 1000);
  ui.setTab(null);

  app.ticker.add(t => {
    const real = Math.min(0.1, t.deltaMS / 1000);
    // hit-stop / slow motion only changes how much real time is fed into the fixed-step simulation
    acc += real * sim.s.speed * scene.timeScale;
    let n = 0;
    while (acc >= TICK && n < MAX_STEPS) { sim.tick(TICK); acc -= TICK; n++; }
    if (n >= MAX_STEPS) acc = 0;
    const events = sim.events;
    sim.events = [];
    scene.consume(events);
    ui.consume(events);
    sfx.consume(events, sim.s.settings);
    scene.render(sim, real, acc / TICK, { sheetW: ui.sheetW() });
    ui.frame(real, scene.targetMonster(sim));
  });

  // While the tab is hidden the game pauses; the time away is played back as offline progress.
  const persist = () => { if (!document.hidden) saveLocal(sim.s); };
  let hiddenAt = 0;
  setInterval(persist, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { saveLocal(sim.s); hiddenAt = Date.now(); }
    else if (hiddenAt) {
      const away = (Date.now() - hiddenAt) / 1000;
      hiddenAt = 0;
      if (away >= OFFLINE.minSeconds) {
        const ld = document.getElementById('loading')!;
        ld.hidden = false;
        app.ticker.stop();
        void catchUp(away).then(() => { ld.hidden = true; app.ticker.start(); });
      }
    }
  });
  window.addEventListener('pagehide', () => saveLocal(sim.s));
  document.getElementById('loading')!.hidden = true;
  // debugging and balancing from the browser console
  Object.assign(window, { grimlight: { get sim() { return sim; }, app } });
}

registerSW({ immediate: true });
boot().catch(err => {
  console.error(err);
  const t = document.getElementById('loadtxt');
  if (t) t.textContent = 'The game could not start: ' + (err instanceof Error ? err.message : String(err));
});
