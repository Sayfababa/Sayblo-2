/** Loading of sprite textures and small procedural textures (glow, soft circle, darkness). */
import { Assets, Texture } from 'pixi.js';
import { AREAS, BASE_ICON, CLASSES, MONSTERS, PROPS, SHRINES, SKILLS } from '../content/index.ts';

export const spriteUrl = (file: string) => `${import.meta.env.BASE_URL}sprites/${file}`;

export const FX_NAMES = ['fireball', 'iceshard', 'orb', 'meteor', 'fire-burst', 'ice-burst', 'shock', 'fire-ring', 'shock-ring', 'flames', 'frost-aura', 'levelup'] as const;
export const HERO_FRAMES = ['hero-idle', 'hero-cast', 'hero-walk1', 'hero-walk2'] as const;

/** Every image file the game needs before it can start. */
export function spriteFiles(): string[] {
  const files = new Set<string>();
  for (const m of Object.values(MONSTERS)) { files.add(m.sprite + '.png'); if (m.runSprite) files.add(m.runSprite + '.png'); }
  for (const id of Object.keys(SHRINES)) files.add(`shrine-${id}.png`);
  files.add('chest-vault.png');
  for (const f of HERO_FRAMES) files.add(f + '.png');
  // classes with their own painted frames (classes.json sprite): idle, strike, walk1, walk2
  for (const c of Object.values(CLASSES)) if (c.sprite && c.sprite !== 'hero') for (const p of ['idle', 'strike', 'walk1', 'walk2']) files.add(`${c.sprite}-${p}.png`);
  for (const p of Object.values(PROPS)) for (const [n] of p.variants) files.add(n + '.png');
  for (const i of [...Object.values(BASE_ICON), 'gold', 'potion-hp', 'potion-mp']) files.add(`item-${i}.png`);
  for (const f of FX_NAMES) files.add(`fx-${f}.jpg`);
  for (const a of AREAS) {
    files.add(a.ground);
    if (a.path) files.add(a.path);
    for (const [d] of a.decals ?? []) files.add(d + '.png');
  }
  for (const id of Object.keys(SKILLS)) files.add(`icon-${id}.png`);
  for (const f of ['orb-frame-life.png', 'orb-frame-mana.png', 'orb-glass.png', 'orb-globe.png', 'liquid-life.jpg', 'liquid-mana.jpg']) files.add(f);
  return [...files];
}

const TEX = new Map<string, Texture>();

export async function loadTextures(onProgress?: (p: number) => void) {
  const files = spriteFiles();
  const loaded = await Assets.load(files.map(f => ({ alias: f, src: spriteUrl(f) })), onProgress);
  for (const f of files) TEX.set(f, loaded[f] as Texture);
}

/** Texture by file name, e.g. "imp.png" or "fx-orb.jpg". */
export function tex(file: string): Texture {
  return TEX.get(file) ?? Texture.EMPTY;
}

function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, size: number) => void): Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  return Texture.from(cv);
}

let glowTex: Texture | null = null;
/** White radial falloff (alpha 1 in the middle, 0 at the edge), drawn additively with a tint for lights. */
export function glowTexture(): Texture {
  return (glowTex ??= canvasTexture(128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  }));
}

let discTex: Texture | null = null;
/** Solid white disc, scaled into ellipses for shadows. */
export function discTexture(): Texture {
  return (discTex ??= canvasTexture(64, (c, s) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
    c.fill();
  }));
}

let holeTex: Texture | null = null;
/** Light radius cut into the darkness: fully clear up to 45 % of the radius, then a smooth falloff. */
export function holeTexture(): Texture {
  return (holeTex ??= canvasTexture(256, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, u = Math.min(1, Math.max(0, (t - 0.45) / 0.55)), a = 1 - u * u * (3 - 2 * u);
      g.addColorStop(t, `rgba(255,255,255,${a.toFixed(3)})`);
    }
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  }));
}
