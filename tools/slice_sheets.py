"""Cut green-screen sprite sheets into single transparent sprites.

Usage: python3 tools/slice_sheets.py
Reads assets/sheets/*.png, writes prototype/sprites/*.png (trimmed, max 256 px high).
"""
import numpy as np
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "prototype" / "sprites"

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
            if name in MAX_SIDE:
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
    g = Image.open(ROOT / "assets" / "sheets" / "ground-gallows-field.png").convert("RGB").resize((512, 512), Image.LANCZOS)
    g.save(OUT / "ground-gallows-field.jpg", quality=85)


if __name__ == "__main__":
    main()
