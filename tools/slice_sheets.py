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
# UI pieces (docs/ui-assets.md). Frames keep more pixels because they are stretched as 9-slices.
UI_SHEETS = {
    "ui-frames": (3, 2, ["ui-panel", "ui-header", "ui-well", "ui-tipframe", "ui-divider", "ui-close"]),
    "ui-buttons": (3, 2, ["ui-btn", "ui-btn-on", "ui-btn-off", "ui-tab", "ui-tab-on", "ui-btn-sq"]),
    "ui-sockets": (4, 2, ["ui-eqslot", "ui-node", "ui-node-round", "ui-socket",
                          "ui-socket-locked", "ui-badge", "ui-chevron", "ui-corner"]),
    "ui-glyphs": (3, 3, ["glyph-hero", "glyph-skills", "glyph-bag", "glyph-town", "glyph-weapon", "glyph-helm",
                         "glyph-armor", "glyph-amulet", "glyph-ring"]),
    "ui-icons": (4, 4, ["ic-gold", "ic-skillpt", "ic-attrpt", "ic-normal", "ic-nightmare", "ic-hell", "ic-barrier", "ic-burn",
                        "ic-chill", "ic-freeze", "ic-shock", "ic-settings", "ic-log", "ic-sort", "ic-sell", "ic-lock"]),
    "skill-icons-2": (3, 3, ["icon-searing", "icon-pyromancy", "icon-kindling", "icon-icenova", "icon-coldmastery",
                             "icon-permafrost", "icon-thunder", "icon-conductivity", "icon-stormmastery"]),
    "gems-element": (3, 2, ["gem-searingburn", "gem-addedfire", "gem-deepfreeze", "gem-addedcold", "gem-overcharge", "gem-addedlight"]),
    "gems-general": (4, 3, ["gem-multi", "gem-pierce", "gem-fork", "gem-wider", "gem-concentrated", "gem-chains",
                            "gem-spread", "gem-echo", "gem-quick", "gem-efficiency", "gem-lingering", None]),
    # Gallows Field, realistic set (docs/ui-assets.md section 7)
    "ground-decals": (3, 2, ["decal-puddle", "decal-ash", "decal-blood", "decal-leaves", "decal-cracks", "decal-grass"]),
}
MAGENTA = {"gems-general", "props-gallows", "ground-decals"}
# realistic sheets: brown and grey only, so every trace of magenta can go (no pink fringe on thorns and decal edges)
MAGENTA_STRONG = {"props-gallows", "ground-decals"}
# Sheets whose pieces do not sit on an even grid: name -> [(sprite, (x0, y0, x1, y1) as fractions of the sheet)]
UI_BOXES = {
    "ui-hud": [("ui-console", (0, 0, .65, .5)), ("ui-orbmount", (.65, 0, 1, .5)),
               ("ui-trough", (0, .5, .65, 1)), ("ui-arch", (.65, .5, 1, 1))],
    # rows are uneven: the first row reaches far down (tree roots, gallows feet)
    "props-gallows": [(n, (c * .25, y0, c * .25 + .25, y1)) for row, (y0, y1) in enumerate([(0, .395), (.395, .67), (.67, 1)])
                      for c, n in enumerate([["gf-gallows", "gf-lantern", "gf-gibbet", "gf-deadtree"],
                                             ["gf-fence", "gf-cross", "gf-stone", "gf-bones"],
                                             ["gf-thorn", "gf-cart", "gf-scarecrow", "gf-well"]][row])],
}
# longest side after trimming; anything not listed keeps at most 320 px
UI_SIDE = {"ui-console": 640, "ui-trough": 520, "ui-orbmount": 256, "ui-arch": 320, "ui-panel": 360, "ui-well": 300, "ui-tipframe": 300, "ui-eqslot": 240, "ui-header": 400, "ui-divider": 400,
           "ui-close": 128, "ui-btn-sq": 128, "ui-node": 192, "ui-node-round": 192, "ui-socket": 160, "ui-socket-locked": 160,
           "ui-badge": 96, "ui-chevron": 128, "ui-corner": 192}
UI_SIDE.update({n: 320 for n in ["gf-gallows", "gf-gibbet", "gf-deadtree", "gf-lantern"]})
UI_SIDE.update({n: 256 for n in ["gf-fence", "gf-cross", "gf-stone", "gf-bones", "gf-thorn", "gf-cart", "gf-scarecrow", "gf-well"]})
UI_SIDE.update({n: 256 for n in ["decal-puddle", "decal-ash", "decal-blood", "decal-leaves", "decal-cracks", "decal-grass"]})
UI_SMALL = ("glyph-", "ic-", "gem-")  # 96 px icons
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


def key_magenta(img):
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b)
    spill = np.clip((m - g - 40) / 90, 0, 1)
    alpha = 1 - spill
    # despill: pull red and blue down towards green on edge pixels
    k = np.clip((m - g) / 80, 0, 1)
    r2 = np.where(m > g, r - (r - g) * k * 0.6, r)
    b2 = np.where(m > g, b - (b - g) * k * 0.6, b)
    out = np.dstack([r2, g, b2, alpha * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def key_magenta_strong(img):
    """The screen is magenta in every brightness (shaded near objects), so key on hue, not on value.
    The art is brown and grey: any blue-and-red-over-green is screen."""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    ex = np.clip(np.minimum(r, b) - g, 0, None)          # magenta part of the colour
    ratio = ex / np.maximum(np.maximum(r, b), 1)
    alpha = 1 - np.clip((ratio - 0.06) / 0.3, 0, 1)
    out = np.dstack([r - ex, g, b - ex, alpha * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def despill_red(cell):
    """Pink edge pixels on brown art: clamp red and blue to what a brown or grey can have and fade the rest out."""
    a = np.asarray(cell).astype(np.float32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    rmax, bmax = g * 1.45 + 14, g * 1.1 + 10
    over = np.clip(r - rmax, 0, None) + np.clip(b - bmax, 0, None)
    al = al * (1 - np.clip(over / 90, 0, 1))
    out = np.dstack([np.minimum(r, rmax), g, np.minimum(b, bmax), al]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def key_for(sheet, img):
    if sheet in MAGENTA_STRONG:
        return key_magenta_strong(img)
    return key_magenta(img) if sheet in MAGENTA else key_green(img)


def cut_cells(img, cols, rows, names):
    """Yield (name, trimmed RGBA cell) for every named grid cell."""
    cw, ch = img.width / cols, img.height / rows
    for i, name in enumerate(names):
        if not name:
            continue
        c, r = i % cols, i // cols
        cell = img.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
        a = np.array(cell)
        m = 4  # ignore a thin border: neighbours that poke over the cell line by a pixel
        a[:m, :, 3] = 0; a[-m:, :, 3] = 0; a[:, :m, 3] = 0; a[:, -m:, 3] = 0
        cell = Image.fromarray(a, "RGBA")
        solid = a[..., 3] > 24
        # rows/columns with only a few stray pixels do not count
        xs = np.where(solid.sum(0) >= 3)[0]
        ys = np.where(solid.sum(1) >= 3)[0]
        if not len(xs):
            print("empty", name)
            continue
        yield name, cell.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def fit(cell, side):
    f = side / max(cell.size)
    if f >= 1:
        return cell
    return cell.resize((max(1, round(cell.width * f)), max(1, round(cell.height * f))), Image.LANCZOS)


def cut_boxes(img, boxes):
    for name, (x0, y0, x1, y1) in boxes:
        cell = img.crop((round(x0 * img.width), round(y0 * img.height), round(x1 * img.width), round(y1 * img.height)))
        solid = np.asarray(cell)[..., 3] > 24
        xs, ys = np.where(solid.sum(0) >= 3)[0], np.where(solid.sum(1) >= 3)[0]
        yield name, cell.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def slice_ui():
    for sheet, boxes in UI_BOXES.items():
        src = ROOT / "assets" / "sheets" / f"{sheet}.png"
        if not src.exists():
            print("missing sheet (skipped):", src.name)
            continue
        for name, cell in cut_boxes(key_for(sheet, Image.open(src)), boxes):
            if sheet in MAGENTA_STRONG:
                cell = despill_red(cell)
            cell = fit(cell, UI_SIDE.get(name, 320))
            cell.save(OUT / f"{name}.png", optimize=True)
            print(name, cell.size)
    for sheet, (cols, rows, names) in UI_SHEETS.items():
        src = ROOT / "assets" / "sheets" / f"{sheet}.png"
        if not src.exists():
            print("missing sheet (skipped):", src.name)
            continue
        img = Image.open(src)
        img = key_for(sheet, img)
        for name, cell in cut_cells(img, cols, rows, names):
            if sheet in MAGENTA_STRONG and name != "decal-blood":
                cell = despill_red(cell)
            if name.startswith("icon-"):
                cell = cell.resize((128, 128), Image.LANCZOS)
            elif name.startswith(UI_SMALL):
                cell = fit(cell, 96)
            else:
                cell = fit(cell, UI_SIDE.get(name, 320))
            cell.save(OUT / f"{name}.png", optimize=True)
            print(name, cell.size)
            if name.startswith("icon-"):
                PLACEHOLDER_ICONS.pop(name[5:], None)


def slice_hero():
    """All poses share one scale and one foot point (bottom centre of the canvas), so switching
    between idle, cast and walk does not make the heroine jump or shrink. Prints the staff tip
    of every pose (as a fraction of the canvas height, x from the feet) for src/render/scene.ts."""
    names = ["hero-idle", "hero-cast", "hero-walk1", "hero-walk2"]
    cells = dict(cut_cells(key_green(Image.open(ROOT / "assets" / "sheets" / "hero.png")), 4, 1, names))
    feet = {}
    for n, c in cells.items():
        a = np.asarray(c)[..., 3] > 128
        # horizontal centre of the body: median of the opaque pixels between shoulders and ankles
        # (the robe dominates, the thin staff hardly moves the median)
        band = a[int(c.height * 0.3):int(c.height * 0.95)]
        feet[n] = float(np.median(np.where(band)[1]))
    hmax = max(c.height for c in cells.values())
    half = max(max(feet[n], c.width - feet[n]) for n, c in cells.items())
    W = int(np.ceil(half * 2))
    f = 256 / hmax
    for n, c in cells.items():
        canvas = Image.new("RGBA", (W, hmax), (0, 0, 0, 0))
        canvas.paste(c, (round(W / 2 - feet[n]), hmax - c.height), c)
        # staff crystal: violet pixels
        a = np.asarray(canvas).astype(np.float32)
        r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
        m = (al > 128) & (b > g + 25) & (r > g + 10) & (b > 70)
        ys, xs = np.where(m)
        top = ys < ys.min() + hmax * 0.08 if len(ys) else None
        tip = (round((xs[top].mean() - W / 2) / hmax, 3), round(1 - ys[top].mean() / hmax, 3)) if len(ys) else None
        out = canvas.resize((round(W * f), 256), Image.LANCZOS)
        out.save(OUT / f"{n}.png", optimize=True)
        print(n, out.size, "staff tip (x, height) in canvas heights:", tip)


def make_tall_weapons():
    """Staffs lie diagonally in their icon. For the 1x3 bag cell and the weapon slot they are turned upright."""
    cols, rows, names = SHEETS["items"]
    full = dict(cut_cells(key_green(Image.open(ROOT / "assets" / "sheets" / "items.png")), cols, rows, names))
    for name in ["gnarled-staff", "bone-wand", "ritual-staff"]:
        im = full[f"item-{name}"]
        # main axis of the opaque pixels -> rotate it to vertical
        ys, xs = np.where(np.asarray(im)[..., 3] > 60)
        cov = np.cov(np.vstack([xs - xs.mean(), ys - ys.mean()]))
        vx, vy = np.linalg.eigh(cov)[1][:, -1]
        ang = np.degrees(np.arctan2(vy, vx))  # angle of the axis in image coordinates (y down)
        rot = -(90 - ang) if ang > 0 else -(-90 - ang)
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
        al = np.asarray(im)[..., 3]
        ys, xs = np.where(al > 24)
        im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        im = fit(im, 240) if im.height > 240 else im
        im.save(OUT / f"item-{name}-tall.png", optimize=True)
        print(f"item-{name}-tall", im.size)


def make_stone_texture():
    """Panel background. Uses the painted texture when the owner has generated it, otherwise procedural granite."""
    src = ROOT / "assets" / "sheets" / "ui-bg-stone.png"
    if src.exists():
        im = Image.open(src).convert("RGB")
        side = min(im.size)
        im = im.crop(((im.width - side) // 2, (im.height - side) // 2, (im.width + side) // 2, (im.height + side) // 2))
        save_seamless(im.resize((512, 512), Image.LANCZOS), OUT / "ui-stone.jpg", 0.85)
        return
    rng = np.random.default_rng(7)
    n, acc = 512, np.zeros((512, 512), np.float32)
    for octave, amp in [(8, 0.5), (16, 0.25), (32, 0.14), (64, 0.08), (128, 0.05), (512, 0.05)]:
        g = rng.random((octave, octave)).astype(np.float32)
        acc += np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC), np.float32) / 255 * amp
    acc = (acc - acc.min()) / (acc.max() - acc.min())
    base = 20 + acc * 26
    rgb = np.dstack([base * 1.0, base * 0.97, base * 0.95])
    Image.fromarray(rgb.clip(0, 255).astype(np.uint8)).save(OUT / "ui-stone.jpg", quality=86)


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
    # realistic Gallows Field: painted tiles are already seamless, keep more pixels so mipmaps stay crisp
    for name, sh in [("ground-gallows-base", .72), ("ground-gallows-path", 1.35)]:
        src = ROOT / "assets" / "sheets" / f"{name}.png"
        if src.exists():
            g = Image.open(src).convert("RGB").resize((1024, 1024), Image.LANCZOS)
            Image.fromarray((np.asarray(g).astype(np.float32) * sh).clip(0, 255).astype(np.uint8)).save(OUT / f"{name}.jpg", quality=86)
    make_app_icons()
    slice_hero()
    slice_ui()
    make_tall_weapons()
    make_stone_texture()
    make_placeholder_skill_icons()
    MIRROR.mkdir(parents=True, exist_ok=True)
    for f in OUT.iterdir():
        # the old demo only needs the scene sprites, not the new interface pieces
        if f.name.startswith(("ui-", "glyph-", "ic-", "gem-", "gf-", "decal-", "ground-gallows-")) or "-tall" in f.name:
            continue
        shutil.copy2(f, MIRROR / f.name)


# Skills without painted icons yet: built from effect sprites until the owner generates real ones.
PLACEHOLDER_ICONS = {
    "searing": "fx-fire-ring", "pyromancy": "fx-flames", "kindling": "fx-fire-burst",
    "icenova": "fx-ice-burst", "coldmastery": "fx-iceshard", "permafrost": "fx-frost-aura",
    "thunder": "fx-shock", "conductivity": "fx-orb", "stormmastery": "fx-shock-ring",
}


def make_placeholder_skill_icons():
    size = 128
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    r = np.hypot(xx - size / 2, yy - size / 2) / (size / 2)
    bg = np.dstack([18 + 22 * (1 - r).clip(0, 1), 14 + 14 * (1 - r).clip(0, 1), 16 + 18 * (1 - r).clip(0, 1)])
    for skill, fx in PLACEHOLDER_ICONS.items():
        out = OUT / f"icon-{skill}.png"
        src = Image.open(OUT / f"{fx}.jpg").convert("RGB")
        f = size * 0.92 / max(src.size)
        src = src.resize((max(1, round(src.width * f)), max(1, round(src.height * f))), Image.LANCZOS)
        layer = np.zeros((size, size, 3), np.float32)
        ox, oy = (size - src.width) // 2, (size - src.height) // 2
        layer[oy:oy + src.height, ox:ox + src.width] = np.asarray(src, np.float32)
        img = np.clip(bg + layer, 0, 255)
        # bronze frame
        frame = (np.maximum(np.abs(xx - size / 2), np.abs(yy - size / 2)) > size / 2 - 5)
        img[frame] = img[frame] * 0.2 + np.array([120, 92, 52]) * 0.8
        inner = (np.maximum(np.abs(xx - size / 2), np.abs(yy - size / 2)) > size / 2 - 7) & ~frame
        img[inner] = img[inner] * 0.4
        Image.fromarray(img.astype(np.uint8)).save(out, optimize=True)


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
