/**
 * Save game: versioned JSON with migrations, stored in localStorage, and a text code for export/import.
 *
 * Code format: "GL<version>." + base64url(deflate-raw(JSON)) + "." + checksum.
 * If the browser has no CompressionStream, the payload is stored uncompressed with prefix "GLU<version>.".
 */
import { AREAS, ATTRS, DIFFICULTIES, GEMS, GEM_MAX_LEVEL, SKILLS, SLOTS, UNIQUES, isPassive } from '../content/index.ts';
import { placeMissing } from './bag.ts';
import { DEFAULT_VOLUME, SAVE_VERSION, newSaveState } from './state.ts';
import type { BagItem, GemItem, Item, SaveState } from './types.ts';

export const STORAGE_KEY = 'grimlight-save';

type Raw = Record<string, unknown>;

/**
 * Migrations: MIGRATIONS[n] turns a version-n save into version n+1.
 * Version 2 is the format of the old single-file demo (prototype/combat-demo.html).
 */
const MIGRATIONS: Record<number, (s: Raw) => Raw> = {
  2: s => {
    const items = [...((s.bag as Item[]) || []), ...Object.values((s.equip as Record<string, Item | null>) || {}).filter((x): x is Item => !!x)];
    return { ...s, v: 3, kite: s.kite !== false, nextId: 1 + Math.max(0, ...items.map(i => i.id || 0)), savedAt: 0 };
  },
  // v4: difficulties, support gems, bag grid, unique effects
  3: s => {
    const byName = new Map(Object.entries(UNIQUES).map(([id, u]) => [u.name, id]));
    const fix = (it: Item) => (it && it.r === 3 && byName.has(it.name) ? { ...it, u: byName.get(it.name) } : it);
    const equip = Object.fromEntries(Object.entries((s.equip as Record<string, Item | null>) || {}).map(([k, v]) => [k, v ? fix(v) : null]));
    return {
      ...s, v: 4, difficulty: 0, progress: [typeof s.unlocked === 'number' ? s.unlocked : 1, 0, 0], sockets: {},
      settings: { dmgNumbers: true, lootLabels: true },
      bag: ((s.bag as Item[]) || []).map(fix), equip,
    };
  },
  // v5: sound settings (work package A)
  4: s => ({ ...s, v: 5, settings: { ...((s.settings as Raw) || {}), sound: true, volume: DEFAULT_VOLUME } }),
};

export class SaveError extends Error {}

/** Bring any known save version up to the current one and fill missing fields with defaults. */
export function migrate(raw: unknown): SaveState {
  if (!raw || typeof raw !== 'object') throw new SaveError('Not a save game.');
  let s = raw as Raw;
  let v = typeof s.v === 'number' ? s.v : NaN;
  if (!Number.isFinite(v)) throw new SaveError('Save has no version.');
  if (v > SAVE_VERSION) throw new SaveError(`This save is from a newer version of the game (v${v}).`);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new SaveError(`Save version ${v} can no longer be loaded.`);
    s = m(s);
    v = s.v as number;
  }
  return sanitize(s);
}

/** Keep only valid values; anything broken falls back to the default of a new game. */
function sanitize(s: Raw): SaveState {
  const d = newSaveState();
  const num = (x: unknown, def: number, min = -Infinity, max = Infinity) =>
    typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def;
  const bool = (x: unknown, def: boolean) => (typeof x === 'boolean' ? x : def);
  const out: SaveState = { ...d };
  out.lvl = Math.floor(num(s.lvl, d.lvl, 1, 999));
  out.xp = num(s.xp, 0, 0); out.gold = Math.floor(num(s.gold, d.gold, 0));
  const attrs = (s.attrs || {}) as Raw;
  for (const k of ATTRS) out.attrs[k] = Math.floor(num(attrs[k], d.attrs[k], 0));
  out.attrPts = Math.floor(num(s.attrPts, 0, 0)); out.skillPts = Math.floor(num(s.skillPts, 0, 0));
  const skills = (s.skills || {}) as Raw;
  out.skills = {};
  for (const k of Object.keys(skills)) if (SKILLS[k]) { const lv = Math.floor(num(skills[k], 0, 0)); if (lv > 0) out.skills[k] = lv; }
  if (!Object.keys(out.skills).length) out.skills = { ...d.skills };
  const slots = Array.isArray(s.slots) ? (s.slots as Raw[]) : [];
  out.slots = d.slots.map((def, i) => {
    const sl = slots[i];
    if (!sl) return i === 0 ? def : { id: null, cond: 'always' };
    const id = typeof sl.id === 'string' && SKILLS[sl.id] && !isPassive(sl.id) && out.skills[sl.id] ? sl.id : null;
    return { id, cond: typeof sl.cond === 'string' ? sl.cond : 'always' };
  });
  const validItem = (x: unknown): x is Item => {
    const i = x as Item;
    return !!i && i.kind !== ('gem' as unknown) && typeof i.id === 'number' && SLOTS.includes(i.slot) && typeof i.name === 'string' && Array.isArray(i.mods)
      && (!i.u || !!UNIQUES[i.u]);
  };
  const validGem = (x: unknown): x is GemItem => {
    const g = x as GemItem;
    return !!g && g.kind === 'gem' && typeof g.id === 'number' && !!GEMS[g.gem] && Number.isInteger(g.lvl) && g.lvl >= 1 && g.lvl <= GEM_MAX_LEVEL;
  };
  const sockets = (s.sockets || {}) as Record<string, unknown>;
  out.sockets = {};
  for (const [k, arr] of Object.entries(sockets)) {
    if (!SKILLS[k] || isPassive(k) || !Array.isArray(arr)) continue;
    out.sockets[k] = [0, 1, 2].map(i => (validGem(arr[i]) ? arr[i] as GemItem : null));
  }
  const equip = (s.equip || {}) as Raw;
  out.equip = { weapon: null, helm: null, armor: null, amulet: null, ring: null };
  for (const k of SLOTS) { const it = equip[k]; if (validItem(it) && it.slot === k) out.equip[k] = it; }
  out.bag = (Array.isArray(s.bag) ? s.bag : []).filter((x): x is BagItem => validItem(x) || validGem(x));
  placeMissing(out.bag);
  out.filter = Math.floor(num(s.filter, 0, 0, 3));
  out.hpPot = Math.floor(num(s.hpPot, d.hpPot, 0)); out.mpPot = Math.floor(num(s.mpPot, d.mpPot, 0));
  out.hpTh = num(s.hpTh, d.hpTh, 0, 100); out.mpTh = num(s.mpTh, d.mpTh, 0, 100);
  const prog = Array.isArray(s.progress) ? s.progress : [];
  out.progress = DIFFICULTIES.map((_, i) => Math.floor(num(prog[i], i ? 0 : 1, i ? 0 : 1, AREAS.length)));
  out.difficulty = Math.floor(num(s.difficulty, 0, 0, DIFFICULTIES.length - 1));
  if (!out.progress[out.difficulty]) out.difficulty = 0;
  out.zone = Math.floor(num(s.zone, 0, 0, out.progress[out.difficulty] - 1));
  const set = (s.settings || {}) as Raw;
  out.settings = { dmgNumbers: bool(set.dmgNumbers, true), lootLabels: bool(set.lootLabels, true), sound: bool(set.sound, true), volume: num(set.volume, DEFAULT_VOLUME, 0, 1) };
  out.autoAdvance = bool(s.autoAdvance, true); out.autoReturn = bool(s.autoReturn, true); out.kite = bool(s.kite, true);
  out.speed = [1, 2, 4].includes(s.speed as number) ? (s.speed as number) : 1;
  out.life = s.life == null ? null : num(s.life, 0);
  out.mana = s.mana == null ? null : num(s.mana, 0, 0);
  out.barrier = num(s.barrier, 0, 0);
  out.kills = Math.floor(num(s.kills, 0, 0)); out.deaths = Math.floor(num(s.deaths, 0, 0));
  const maxId = Math.max(0, ...out.bag.map(i => i.id), ...Object.values(out.equip).filter((i): i is Item => !!i).map(i => i.id),
    ...Object.values(out.sockets).flat().filter((g): g is GemItem => !!g).map(g => g.id));
  out.nextId = Math.max(Math.floor(num(s.nextId, 1, 1)), maxId + 1);
  out.savedAt = num(s.savedAt, 0, 0);
  out.v = SAVE_VERSION;
  return out;
}

/* ---------- local storage ---------- */
export function loadLocal(storage: Storage | undefined = globalThis.localStorage): SaveState | null {
  try {
    const txt = storage?.getItem(STORAGE_KEY);
    return txt ? migrate(JSON.parse(txt)) : null;
  } catch { return null; }
}
export function saveLocal(s: SaveState, storage: Storage | undefined = globalThis.localStorage): boolean {
  try { s.savedAt = Date.now(); storage?.setItem(STORAGE_KEY, JSON.stringify(s)); return true; } catch { return false; }
}
export function clearLocal(storage: Storage | undefined = globalThis.localStorage) {
  try { storage?.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/* ---------- export / import code ---------- */
const b64url = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
/** FNV-1a over the payload text, 6 base36 chars. Catches typos and cut-off codes. */
const checksum = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36).padStart(6, '0').slice(-6);
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
const hasCompression = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export async function exportCode(s: SaveState): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ ...s, savedAt: Date.now() }));
  const [prefix, payload] = hasCompression()
    ? [`GL${SAVE_VERSION}`, b64url(await pipe(json, new CompressionStream('deflate-raw')))]
    : [`GLU${SAVE_VERSION}`, b64url(json)];
  return `${prefix}.${payload}.${checksum(payload)}`;
}

export async function importCode(code: string): Promise<SaveState> {
  const clean = code.replace(/\s+/g, '');
  const m = /^GL(U?)(\d+)\.([A-Za-z0-9_-]+)\.([0-9a-z]{6})$/.exec(clean);
  if (!m) throw new SaveError('This is not a Grimlight save code.');
  const [, plain, , payload, sum] = m;
  if (checksum(payload) !== sum) throw new SaveError('The code is damaged or incomplete. Copy it again in full.');
  let bytes: Uint8Array;
  try {
    bytes = unb64url(payload);
    if (!plain) {
      if (!hasCompression()) throw new SaveError('This browser cannot read compressed save codes.');
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
  } catch (e) {
    if (e instanceof SaveError) throw e;
    throw new SaveError('The code could not be read.');
  }
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new SaveError('The code could not be read.'); }
  return migrate(raw);
}
