/**
 * Phone layout check: opens every panel, sub-tab and overlay at phone size and fails if anything
 * overflows sideways (page or element wider than the screen, content cut off at a clipping box, or a
 * box that scrolls sideways). Also lists tap targets under 40 px (bag grid cells excepted: ten columns
 * cannot be 40 px wide on a phone) and text cut with an ellipsis as warnings (--verbose prints them),
 * and saves a screenshot of every view.
 *
 *   npm run build && node scripts/ui-check.mjs [--no-build] [--shots <dir>] [--sizes 390x664,390x844]
 *
 * Uses the Chromium that comes with the `playwright` package and serves dist/ itself.
 * The hero is a generated end-game save (scripts/endgame.ts) with a full bag, gems, keys and points to spend.
 */
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { endgameSave } from './endgame.ts';
import { genGem, genItem } from '../src/sim/items.ts';
import { Rng } from '../src/sim/rng.ts';
import { Sim } from '../src/sim/sim.ts';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SHOTS = resolve(opt('--shots', join(tmpdir(), 'grimlight-ui-check')));
const SIZES = opt('--sizes', '390x664,390x844').split(',').map(s => s.split('x').map(Number));
const DIST = resolve('dist');
if (!args.includes('--no-build') || !existsSync(join(DIST, 'index.html'))) execSync('npx vite build', { stdio: 'inherit' });
mkdirSync(SHOTS, { recursive: true });

/* ---------- test hero: end game, full bag, many gems, keys, points to spend ---------- */
function testSave() {
  const s = endgameSave('fire', 60, 3);
  const sim = new Sim(s, { seed: 3, headless: true });
  const rng = new Rng(99);
  for (let i = 0; i < 26; i++) sim.takeItem(genItem(rng, s.nextId++, 55, 0, false), true);
  for (let i = 0; i < 40; i++) sim.takeItem(genGem(rng, s.nextId++, 40), true);
  for (let i = 0; i < 3; i++) sim.takeItem({ id: s.nextId++, kind: 'gem', gem: 'quick', lvl: 2 }, true);
  sim.rift.dev = true;
  for (let i = 0; i < 3; i++) sim.rift.devKey(10 + i * 7);
  sim.rift.dev = false;
  s.attrPts = 23; s.skillPts = 3; s.mats = { dust: 4821, essence: 316, shard: 27 }; s.gold = 1234567;
  s.kills = 123456; s.deaths = 42;
  s.rift.maxTier = 31; s.rift.frags = 2; s.rift.runs = 40; s.rift.best = { 10: 200, 20: 300, 31: 410 };
  s.savedAt = Date.now() - 3 * 3600 * 1000; // offline summary on load
  return JSON.stringify(sim.s);
}
/** Warrior package: an end-game warrior (Cinder plan) with points to spend, loaded for the warrior views. */
function warriorSave() {
  const s = endgameSave('wfire', 60, 2);
  s.attrPts = 12; s.skillPts = 2; s.gold = 54321; s.savedAt = Date.now();
  return JSON.stringify(s);
}

/* ---------- static server for dist/ ---------- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = join(DIST, p);
  if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) f = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

/* ---------- checks run inside the page ---------- */
function inspect() {
  const W = innerWidth, out = { fail: [], small: [], trunc: [] };
  const vis = el => { const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const name = el => {
    const id = el.id ? '#' + el.id : '', cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const act = el.dataset?.act ? `[${el.dataset.act}]` : '', txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${id}${cls}${act}${txt ? ` "${txt}"` : ''}`;
  };
  if (document.documentElement.scrollWidth > W || document.body.scrollWidth > W) out.fail.push(`page is ${document.documentElement.scrollWidth}px wide (screen ${W}px)`);
  const roots = [...document.querySelectorAll('#sheet:not([hidden]), #tipfloat:not([hidden]), #summary:not([hidden]), #classpick:not([hidden]), #overlay:not([hidden]), .hud-top, .hud-bottom, .mtrack, .mtoasts, .tabs, #target:not([hidden])')];
  const seen = new Set();
  for (const root of roots) for (const el of [root, ...root.querySelectorAll('*')]) {
    if (seen.has(el) || !vis(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    // 1. outside the screen
    if (r.right > W + 0.5 || r.left < -0.5) out.fail.push(`${name(el)} sticks out of the screen (${Math.round(r.left)}..${Math.round(r.right)})`);
    // 2. cut off by a clipping ancestor (horizontal only; vertical scrolling is fine; pictures cropped by their frame are fine)
    else if (el.tagName !== 'IMG') for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox === 'visible') continue;
      const ar = a.getBoundingClientRect(), bl = a.clientLeft, br = ar.width - a.clientWidth - a.clientLeft;
      if (r.right > ar.right - br + 1 || r.left < ar.left + bl - 1) out.fail.push(`${name(el)} is cut off by ${name(a)}`);
      break;
    }
    // 3. scrolls sideways
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) out.fail.push(`${name(el)} scrolls sideways (${el.scrollWidth} > ${el.clientWidth})`);
    // warnings: truncated text, small tap targets
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.trunc.push(name(el));
    if (el.matches('button, select, summary, input[type=checkbox], input[type=range], a[href], textarea') && !el.closest('.tabs, .hud-top .seg') && !el.matches('.bi, .cell') && (r.height < 39.5 || r.width < 39.5)) {
      const target = el.matches('input[type=checkbox]') ? el.closest('label') ?? el : el;
      const tr = target.getBoundingClientRect();
      if (tr.height < 39.5 || tr.width < 39.5) out.small.push(`${name(el)} ${Math.round(tr.width)}×${Math.round(tr.height)}`);
    }
  }
  // the close button of an open panel must be on screen and on top
  const sheet = document.querySelector('#sheet:not([hidden])');
  if (sheet) {
    const c = sheet.querySelector('.panel.active .phead .close');
    if (!c) out.fail.push('open panel has no close button');
    else {
      const r = c.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (r.right > W || r.top < 0 || !(hit === c || c.contains(hit))) out.fail.push(`close button hidden (${Math.round(r.left)},${Math.round(r.top)} hit ${hit ? name(hit) : 'nothing'})`);
    }
  }
  return out;
}

/* ---------- the views ---------- */
const act = a => `[data-act="${a}"]`;
async function click(page, sel) {
  const el = page.locator(sel).first();
  if (!(await el.count())) return false;
  await el.click({ timeout: 2000 }).catch(() => el.dispatchEvent('click'));
  await page.waitForTimeout(160);
  return true;
}
const tab = t => async p => { if (!(await p.locator(`${act('tab:' + t)}[aria-selected="true"]`).count())) await click(p, act('tab:' + t)); };
const town = v => async p => { await tab('town')(p); await click(p, act('tview:' + v)); };
const VIEWS = [
  ['summary', async () => {}],
  ['hud', async p => { await click(p, act('closesum')); await p.evaluate(() => { document.querySelector('#summary').hidden = true; }); }],
  ['hud-log', async p => { await click(p, act('log')); }],
  ['hero', async p => { await click(p, act('log')); await tab('hero')(p); }],
  ['hero-bottom', async p => { await tab('hero')(p); await p.evaluate(() => { document.querySelectorAll('#p-hero details').forEach(d => { d.open = true; }); const s = document.querySelector('#sheet'); s.scrollTop = s.scrollHeight; }); }],
  ['skills', async p => { await tab('skills')(p); }],
  // skills package: one page per tree, detail with modifiers and the gem picker, a long-named skill, an armed modifier
  ['skills-ember', async p => { await tab('skills')(p); await click(p, act('stree:ember')); await click(p, act('skillsel:fireball')); await click(p, act('sockpick:2')); await p.evaluate(() => { const s = document.querySelector('#sheet'); s.scrollTop = s.scrollHeight; }); }],
  ['skills-frost', async p => { await tab('skills')(p); await click(p, act('stree:frost')); await click(p, act('skillsel:rimeshell')); }],
  ['skills-storm', async p => { await tab('skills')(p); await click(p, act('stree:storm')); await click(p, act('skillsel:stormlantern')); await click(p, '.mopt.pick'); await p.evaluate(() => { const s = document.querySelector('#sheet'); s.scrollTop = s.scrollHeight / 2; }); }],
  ['skills-prio', async p => { await tab('skills')(p); await click(p, act('stree:prio')); }],
  ['bag', async p => { await tab('bag')(p); }],
  ['bag-item', async p => { await tab('bag')(p); await click(p, '#p-bag .bi.r2, #p-bag .bi'); }],
  ['bag-equipped', async p => { await tab('bag')(p); await click(p, '#p-bag .eqslot.e-armor'); }],
  ['bag-sell', async p => { await tab('bag')(p); await click(p, act('tipclose')); await click(p, act('sellmode')); await click(p, act('sellpick:low')); }],
  ['bag-bottom', async p => { await tab('bag')(p); await click(p, act('sellmode')); await p.evaluate(() => { const s = document.querySelector('#sheet'); s.scrollTop = s.scrollHeight; }); }],
  ['bag-gems', async p => { await tab('bag')(p); await click(p, act('bview:gems')); }],
  ['bag-gem', async p => { await tab('bag')(p); await click(p, act('bview:gems')); await click(p, '#p-bag .gstack'); }],
  ['town', async p => { await tab('bag')(p); await click(p, act('tipclose')); await click(p, act('bview:items')); await town('main')(p); }],
  ['town-bottom', async p => { await town('main')(p); await p.evaluate(() => { const s = document.querySelector('#sheet'); s.scrollTop = s.scrollHeight; }); }],
  ['forge', async p => { await town('forge')(p); }],
  ['forge-item', async p => { await town('forge')(p); await click(p, '#p-town .ftile'); await click(p, '#p-town button.fmod'); }],
  ['altar', async p => { await town('altar')(p); await click(p, '#p-town .ftile'); }],
  ['vendor', async p => { await town('vendor')(p); await click(p, '#p-town .gslot'); }],
  ['stash', async p => { await town('stash')(p); await click(p, '#p-town .bi'); }],
  ['board', async p => { await town('board')(p); }],
  ['codex', async p => { await town('codex')(p); await click(p, '#p-town .centry:not(.unknown)'); }],
  ['rifts', async p => { await town('rift')(p); await click(p, act('rfsub:rifts')); await click(p, '#p-town .rkey'); }],
  ['atlas', async p => { await town('rift')(p); await click(p, act('rfsub:atlas')); await click(p, '#p-town .anode'); }],
  ['rift-run', async p => { await town('rift')(p); await click(p, act('rfsub:rifts')); await click(p, act('rffree')); await click(p, act('close')); await p.waitForTimeout(600); }],
  ['rift-result', async p => {
    await p.evaluate(() => { const sim = window.grimlight.sim; const r = sim.rift.run; if (r) { r.pts = 1e9; } });
    await p.waitForTimeout(300);
    await p.evaluate(() => {
      const el = document.querySelector('#summary');
      if (!el.hidden && el.querySelector('.riftres')) return;
      el.innerHTML = `<div class="sumbox riftres ok"><h2>Tier 31 cleared</h2><ul class="rrows"><li class="good"><span>Time</span><b>3:12 / 5:00</b></li><li class="good"><span>Timer</span><b>beaten ▲</b></li><li><span>Loot kept</span><b>14 items · 12.3k gold</b></li></ul><ul class="rloot"><li>Gloomweave Vestment of the Long Night</li></ul><p class="hint">Auto mode: the next rift opens on its own.</p><button class="btn primary" data-act="closesum">Continue</button></div>`;
      el.hidden = false;
    });
  }],
  ['death', async p => {
    await click(p, act('closesum'));
    await p.evaluate(() => { const sim = window.grimlight.sim; sim.s.autoReturn = false; sim.die(); });
    await p.waitForTimeout(600);
    await click(p, act('closesum')); // a running rift shows its result card first
    await p.waitForTimeout(300);
  }],
  // warrior package: class choice from Town, then an end-game warrior's menus
  ['class-pick', async p => { await town('main')(p); await click(p, act('reset')); await click(p, act('reset')); }],
  ['w-hud', async p => {
    await click(p, act('clscancel'));
    await p.evaluate(v => { localStorage.setItem('grimlight-save', v); Storage.prototype.setItem = () => {}; location.reload(); }, wsave).catch(() => {}); // the old page must not save over it
    await p.waitForFunction(() => document.getElementById('loading')?.hidden && window.grimlight?.sim?.s?.cls === 'warrior', null, { timeout: 30000 });
    await p.waitForTimeout(1500);
  }],
  ['w-hero', async p => { await tab('hero')(p); }],
  ['w-cinder', async p => { await tab('skills')(p); await click(p, act('stree:cinder')); await click(p, act('skillsel:kindleroar')); await p.evaluate(() => { const s = document.querySelector('#sheet'); s.scrollTop = s.scrollHeight / 2; }); }],
  ['w-rime', async p => { await tab('skills')(p); await click(p, act('stree:rime')); await click(p, act('skillsel:glaciershield')); }],
  ['w-thunder', async p => { await tab('skills')(p); await click(p, act('stree:thunder')); await click(p, act('skillsel:skyleap')); }],
  ['w-prio', async p => { await tab('skills')(p); await click(p, act('stree:prio')); }],
  ['w-bag', async p => { await tab('bag')(p); await click(p, '#p-bag .eqslot.e-weapon'); }],
  ['w-town', async p => { await town('main')(p); await p.evaluate(() => { const s = document.querySelector('#sheet'); s.scrollTop = s.scrollHeight / 3; }); }],
];

/* ---------- run ---------- */
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch();
const save = testSave(), wsave = warriorSave();
let failed = 0;
const report = [];
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('uicheck')) { localStorage.setItem(k, v); sessionStorage.setItem('uicheck', '1'); } }, ['grimlight-save', save]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '?dev');
  await page.waitForFunction(() => document.getElementById('loading')?.hidden, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  for (const [name, go] of VIEWS) {
    await go(page);
    await page.waitForTimeout(250);
    const r = await page.evaluate(inspect);
    const file = join(SHOTS, `${w}x${h}-${name}.png`);
    await page.screenshot({ path: file });
    const uniq = a => [...new Set(a)];
    r.fail = uniq(r.fail); r.small = uniq(r.small); r.trunc = uniq(r.trunc);
    failed += r.fail.length;
    report.push({ size: `${w}x${h}`, name, ...r, file });
  }
  if (errors.length) { failed += errors.length; report.push({ size: `${w}x${h}`, name: 'page errors', fail: errors, small: [], trunc: [], file: '' }); }
  await ctx.close();
}
await browser.close();
server.close();

const verbose = args.includes('--verbose');
for (const r of report) {
  const st = r.fail.length ? 'FAIL' : 'ok  ';
  console.log(`${st} ${r.size} ${r.name.padEnd(13)} ${r.fail.length} overflow · ${r.small.length} small targets · ${r.trunc.length} truncated`);
  for (const f of r.fail) console.log(`       ✗ ${f}`);
  if (verbose) { for (const f of r.small) console.log(`       · small ${f}`); for (const f of r.trunc) console.log(`       · cut ${f}`); }
}
console.log(`\nScreenshots: ${SHOTS}`);
console.log(failed ? `\n${failed} horizontal overflow problem(s).` : '\nNo horizontal overflow.');
process.exit(failed ? 1 : 0);
