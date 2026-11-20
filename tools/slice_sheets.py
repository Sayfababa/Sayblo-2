"""Cut green-screen sprite sheets into single transparent sprites.

Usage: python3 tools/slice_sheets.py
Reads assets/sheets/*.png, writes public/sprites/* (used by the game, trimmed, max 256 px high)
and mirrors them into prototype/sprites/ so the old single-file demo keeps working.
Also writes the PWA app icons to public/icons/.
"""
import shutil
import numpy as np
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "sprites"
MIRROR = ROOT / "prototype" / "sprites"
ICONS = ROOT / "public" / "icons"

SHEETS = {
    "monsters": (4, 3, ["imp", "wraith", "beetle", "hound",
                        "cultist", "crow", "husk", "shade",
                        "ghoul", "vesper", None, None]),
    "hero": (4, 1, ["hero-idle", "hero-cast", "hero-walk1", "hero-walk2"]),
    "props": (4, 3, ["rock", "rocks", "tree", "stump",
                     "torch", "grave", "pillar", "pillar-broken",
                     "candelabra", "reeds", "crystal", "gallows"]),
    "skill-icons": (4, 2, ["icon-fireball", "icon-meteor", "icon-frostbolt", "icon-frostarmor",
                           "icon-chain", "icon-nova", "icon-spark", None]),
    "items": (5, 4, ["item-gnarled-staff", "item-bone-wand", "item-ritual-staff", "item-hood", "item-circlet",
                     "item-cowl", "item-robe", "item-vestments", "item-shroud", "item-amulet",
                     "item-talisman", "item-locket", "item-ring", "item-band", "item-loop",
                     "item-gold", "item-potion-hp", "item-potion-mp", "item-scroll", "item-key"]),
    "orbs": (4, 1, ["orb-frame-life", "orb-frame-mana", "orb-glass", "orb-globe"]),
}
# Effects are drawn additively, so their black background stays and simply adds nothing.
FX_SHEETS = {
    "effects": (4, 3, ["fx-fireball", "fx-iceshard", "fx-orb", "fx-meteor",
                       "fx-fire-burst", "fx-ice-burst", "fx-shock", "fx-fire-ring",
                       "fx-shock-ring", "fx-flames", "fx-frost-aura", "fx-levelup"]),
}
MAX_H = {"vesper": 384}
MAX_SIDE = {n: 128 for n in ["icon-fireball", "icon-meteor", "icon-frostbolt", "icon-frostarmor", "icon-chain", "icon-nova", "icon-spark"]}


def key_green(img):
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.maximum(r, b)
    # how much green dominates: 0 = not green, 1 = pure screen green
    spill = np.clip((g - m - 20) / 90, 0, 1)
    alpha = 1 - spill
    # despill: pull green down to the other channels on edge pixels
    g2 = np.where(g > m, m + (g - m) * (1 - np.clip((g - m) / 60, 0, 1)), g)
    out = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def save_seamless(tile, path, shade):
    """Blend the tile with a half-offset copy of itself so its edges wrap."""
    a = np.asarray(tile).astype(np.float32)
    h, w = a.shape[:2]
    rolled = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    wy = np.sin(np.linspace(0, np.pi, h))[:, None]
    wx = np.sin(np.linspace(0, np.pi, w))[None, :]
    mask = np.clip((wy * wx) * 1.8, 0, 1)[..., None]
    out = a * mask + rolled * (1 - mask)
    Image.fromarray((out * shade).clip(0, 255).astype(np.uint8)).save(path, quality=86)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for sheet, (cols, rows, names) in SHEETS.items():
        img = key_green(Image.open(ROOT / "assets" / "sheets" / f"{sheet}.png"))
        cw, ch = img.width / cols, img.height / rows
        for i, name in enumerate(names):
            if not name:
                continue
            c, r = i % cols, i // cols
            cell = img.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
            al = np.asarray(cell)[..., 3]
            ys, xs = np.where(al > 24)
            if not len(xs):
                print("empty", name)
                continue
            cell = cell.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
            mh = MAX_H.get(name, 256)
            if name.startswith("item-"):
                f = 112 / max(cell.size)
                cell = cell.resize((max(1, round(cell.width * f)), max(1, round(cell.height * f))), Image.LANCZOS)
                sq = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
                sq.paste(cell, ((128 - cell.width) // 2, (128 - cell.height) // 2), cell)
                cell = sq
            elif name in MAX_SIDE:
                cell = cell.resize((MAX_SIDE[name], MAX_SIDE[name]), Image.LANCZOS)
            elif cell.height > mh:
                cell = cell.resize((round(cell.width * mh / cell.height), mh), Image.LANCZOS)
            cell.save(OUT / f"{name}.png", optimize=True)
            print(name, cell.size)
    for sheet, (cols, rows, names) in FX_SHEETS.items():
        img = Image.open(ROOT / "assets" / "sheets" / f"{sheet}.png").convert("RGB")
        cw, ch = img.width / cols, img.height / rows
        for i, name in enumerate(names):
            c, r = i % cols, i // cols
            cell = img.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
            lum = np.asarray(cell).max(axis=2)
            ys, xs = np.where(lum > 18)
            pad = 6
            cell = cell.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), min(cell.width, xs.max() + pad), min(cell.height, ys.max() + pad)))
            # fade the edges to pure black so the additive draw has no visible box
            a = np.asarray(cell).astype(np.float32)
            a = np.clip((a - 10) * 1.05, 0, 255)
            cell = Image.fromarray(a.astype(np.uint8))
            if max(cell.size) > 256:
                f = 256 / max(cell.size)
                cell = cell.resize((round(cell.width * f), round(cell.height * f)), Image.LANCZOS)
            cell.save(OUT / f"{name}.jpg", quality=88)
            print(name, cell.size)
    for liq in ["liquid-life", "liquid-mana"]:
        Image.open(ROOT / "assets" / "sheets" / f"{liq}.png").convert("RGB").resize((256, 256), Image.LANCZOS).save(OUT / f"{liq}.jpg", quality=86)
    # ground sheet: 3x2 tiles with black gutters -> seamless 512 textures
    grounds = ["ground-weeping-mire", "ground-cinder-hollow", "ground-stormwatch-ruins",
               "ground-rimefrost-crypt", "ground-pale-chapel", "ground-dead-grass"]
    shade = {"ground-pale-chapel": .62, "ground-rimefrost-crypt": .78, "ground-stormwatch-ruins": .72}
    sheet = Image.open(ROOT / "assets" / "sheets" / "grounds.png").convert("RGB")
    cw, ch = sheet.width / 3, sheet.height / 2
    for i, name in enumerate(grounds):
        c, r = i % 3, i // 3
        m = 14
        tile = sheet.crop((round(c * cw) + m, round(r * ch) + m, round((c + 1) * cw) - m, round((r + 1) * ch) - m)).resize((512, 512), Image.LANCZOS)
        save_seamless(tile, OUT / f"{name}.jpg", shade.get(name, .85))
    g = Image.open(ROOT / "assets" / "sheets" / "ground-gallows-field.png").convert("RGB").resize((512, 512), Image.LANCZOS)
    g.save(OUT / "ground-gallows-field.jpg", quality=85)
    make_app_icons()
    MIRROR.mkdir(parents=True, exist_ok=True)
    for f in OUT.iterdir():
        shutil.copy2(f, MIRROR / f.name)


def make_app_icons():
    """App icon: the Static Nova skill icon on the game background colour."""
    ICONS.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(ROOT / "assets" / "sheets" / "skill-icons.png").convert("RGB")
    cols, rows, idx = 4, 2, 5
    cw, ch = sheet.width / cols, sheet.height / rows
    c, r = idx % cols, idx // cols
    cell = sheet.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
    al = np.asarray(key_green(cell))[..., 3]
    ys, xs = np.where(al > 24)
    cell = cell.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    m = round(cell.width * 0.045)  # cut away the green fringe around the painted frame
    cell = cell.crop((m, m, cell.width - m, cell.height - m))
    for size, pad, name in [(192, 0, "icon-192.png"), (512, 0, "icon-512.png"), (180, 0, "apple-touch-icon.png"), (512, 0.12, "icon-maskable-512.png")]:
        bg = Image.new("RGB", (size, size), (19, 15, 16))
        inner = round(size * (1 - 2 * pad))
        bg.paste(cell.resize((inner, inner), Image.LANCZOS), ((size - inner) // 2, (size - inner) // 2))
        bg.save(ICONS / name, optimize=True)


if __name__ == "__main__":
    main()
