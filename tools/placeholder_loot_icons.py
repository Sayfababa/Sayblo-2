"""Placeholder icons for the loot package until the owner paints them (see docs/asset-requests.md, "Loot package").

Recolours existing icons: mat-pearl from mat-shard (pale sea-green), ember-crown from ember-rise (violet-pink),
ember-ascend from ember-bind (pale sea-green). Writes to public/sprites/ and prototype/sprites/.
Run from the repository root: python3 tools/placeholder_loot_icons.py
"""
import colorsys
from PIL import Image

JOBS = [
    ("mat-shard.png", "mat-pearl.png", 0.45, 0.35, 1.25),
    ("ember-rise.png", "ember-crown.png", 0.83, 0.7, 1.1),
    ("ember-bind.png", "ember-ascend.png", 0.45, 0.45, 1.15),
]


def recolour(src: str, dst: str, hue: float, sat: float, light: float) -> None:
    im = Image.open(f"public/sprites/{src}").convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            r2, g2, b2 = colorsys.hls_to_rgb(hue, min(1, l * light), s * sat + 0.1)
            px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    for folder in ("public/sprites", "prototype/sprites"):
        im.save(f"{folder}/{dst}")


if __name__ == "__main__":
    for job in JOBS:
        recolour(*job)
        print("wrote", job[1])
