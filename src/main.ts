import '@fontsource/cinzel/latin-500.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import './ui/styles.css';
import { Application } from 'pixi.js';
import { registerSW } from 'virtual:pwa-register';
import { Scene } from './render/scene.ts';
import { loadTextures } from './render/textures.ts';
import { clearLocal, loadLocal, saveLocal } from './sim/save.ts';
import { Sim, TICK } from './sim/sim.ts';
import type { SaveState } from './sim/types.ts';
import { UI } from './ui/ui.ts';

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
  start(loadLocal());
  ui.setTab(null);

  app.ticker.add(t => {
    const real = Math.min(0.1, t.deltaMS / 1000);
    acc += real * sim.s.speed;
    let n = 0;
    while (acc >= TICK && n < MAX_STEPS) { sim.tick(TICK); acc -= TICK; n++; }
    if (n >= MAX_STEPS) acc = 0;
    const events = sim.events;
    sim.events = [];
    scene.consume(events);
    ui.consume(events);
    scene.render(sim, real, acc / TICK, { sheetW: ui.sheetW() });
    ui.frame(real, scene.targetMonster(sim));
  });

  const persist = () => saveLocal(sim.s);
  setInterval(persist, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
  window.addEventListener('pagehide', persist);
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
