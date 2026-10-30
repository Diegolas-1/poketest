#!/usr/bin/env python3
# The forest palette's painted atlas (native/props/forest/forest_atlas.png, read
# by native/props/prop_mats.gd): flat painted cards in the look of the baked
# plants' leaf atlases (world/plants/leaf_*.png: soft-edged shapes, a lighter
# highlight shape inside, no outline). 2 x 2 cells of 256 px:
#   0  leaf litter     fallen leaves, browns, ochres and olive, scattered
#   1  moss            a ragged cushion of moss with lighter tufts
#   2  sun shaft       a soft vertical beam (alpha), faded at both ends
#   3  twigs           fallen twigs and a few green leaves
#   python3 tools/native/props/forest_atlas.py
import math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'native' / 'props' / 'forest' / 'forest_atlas.png'
S = 256
SS = 4   # supersampling


def leaf(d, cx, cy, ln, wd, ang, col, hi, vein):
    pts = []
    for k in range(25):
        t = k / 24.0
        x = (t - 0.5) * ln
        y = math.sin(t * math.pi) ** 0.85 * wd * 0.5
        pts.append((x, y))
    pts += [(x, -y) for (x, y) in reversed(pts)]
    ca, sa = math.cos(ang), math.sin(ang)
    P = [(cx + x * ca - y * sa, cy + x * sa + y * ca) for (x, y) in pts]
    d.polygon(P, fill=col)
    # the highlight: a thinner lighter leaf on one side
    H = [(cx + (x * 0.7) * ca - (y * 0.45 - wd * 0.08) * sa, cy + (x * 0.7) * sa + (y * 0.45 - wd * 0.08) * ca) for (x, y) in pts]
    d.polygon(H, fill=hi)
    a = (cx - ln * 0.5 * ca, cy - ln * 0.5 * sa)
    b = (cx + ln * 0.42 * ca, cy + ln * 0.42 * sa)
    d.line([a, b], fill=vein, width=max(1, int(wd * 0.07)))
    # a stalk
    d.line([a, (a[0] - ln * 0.12 * ca, a[1] - ln * 0.12 * sa)], fill=vein, width=max(1, int(wd * 0.09)))


def litter(r):
    im = Image.new('RGBA', (S * SS, S * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cols = [((150, 98, 52), (184, 132, 70), (110, 70, 36)), ((178, 128, 56), (214, 170, 92), (128, 88, 40)),
            ((122, 120, 52), (156, 152, 74), (88, 84, 36)), ((132, 76, 44), (166, 104, 62), (96, 52, 30)),
            ((196, 150, 70), (226, 190, 110), (150, 108, 50))]
    for k in range(17):
        c = r.choice(cols)
        ln = r.uniform(46, 78) * SS
        cx = r.uniform(0.16, 0.84) * S * SS
        cy = r.uniform(0.16, 0.84) * S * SS
        leaf(d, cx, cy, ln, ln * r.uniform(0.42, 0.55), r.uniform(0, math.tau), c[0] + (255,), c[1] + (255,), c[2] + (255,))
    return im


def moss(r):
    im = Image.new('RGBA', (S * SS, S * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S * SS / 2
    pts = []
    for k in range(64):
        a = k / 64 * math.tau
        rr = (0.36 + 0.06 * math.sin(a * 5 + 1) + 0.04 * math.sin(a * 11) + r.uniform(-0.02, 0.02)) * S * SS
        pts.append((c + math.cos(a) * rr, c + math.sin(a) * rr * 0.8))
    d.polygon(pts, fill=(70, 112, 44, 255))
    for k in range(70):
        a = r.uniform(0, math.tau); rr = math.sqrt(r.random()) * 0.3 * S * SS
        x, y = c + math.cos(a) * rr, c + math.sin(a) * rr * 0.8
        s = r.uniform(6, 16) * SS
        col = r.choice([(96, 146, 56), (118, 168, 66), (84, 128, 48), (140, 184, 80)])
        d.ellipse([x - s, y - s * 0.8, x + s, y + s * 0.8], fill=col + (255,))
    return im


def shaft(r):
    im = Image.new('RGBA', (S * SS, S * SS), (0, 0, 0, 0))
    px = im.load()
    W = S * SS
    for y in range(0, W):
        v = y / W
        fy = min(1.0, v / 0.25) * min(1.0, (1 - v) / 0.45)
        fy = fy * fy * (3 - 2 * fy)
        for x in range(0, W, 1):
            u = x / W
            fx = max(0.0, 1.0 - abs(u - 0.5) / 0.42)
            fx = fx * fx * (3 - 2 * fx)
            # a few streaks along it
            st = 0.75 + 0.25 * math.sin(u * 31.0 + 1.3) * math.sin(u * 13.0)
            a = int(255 * fx * fy * st)
            px[x, y] = (255, 250, 220, a)
    return im


def twigs(r):
    im = Image.new('RGBA', (S * SS, S * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for k in range(9):
        a = r.uniform(0, math.tau); ln = r.uniform(60, 120) * SS
        mx, my = r.uniform(0.32, 0.68) * S * SS, r.uniform(0.32, 0.68) * S * SS
        x0, y0 = mx - math.cos(a) * ln * 0.5, my - math.sin(a) * ln * 0.5
        x1, y1 = mx + math.cos(a) * ln * 0.5, my + math.sin(a) * ln * 0.5
        col = r.choice([(104, 74, 48), (126, 92, 60), (86, 62, 40)])
        d.line([(x0, y0), (x1, y1)], fill=col + (255,), width=int(r.uniform(4, 7) * SS))
        # a side twig
        t = r.uniform(0.3, 0.7); bx, by = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        b = a + r.choice([-1, 1]) * r.uniform(0.5, 0.9)
        d.line([(bx, by), (bx + math.cos(b) * ln * 0.3, by + math.sin(b) * ln * 0.3)], fill=col + (255,), width=int(3 * SS))
    for k in range(5):
        cx, cy = r.uniform(0.2, 0.8) * S * SS, r.uniform(0.2, 0.8) * S * SS
        ln = r.uniform(40, 60) * SS
        g = r.choice([((72, 120, 46), (104, 154, 62), (52, 92, 34)), ((96, 138, 52), (128, 170, 72), (70, 104, 40))])
        leaf(d, cx, cy, ln, ln * 0.5, r.uniform(0, math.tau), g[0] + (255,), g[1] + (255,), g[2] + (255,))
    return im


def main():
    r = random.Random(151)
    atlas = Image.new('RGBA', (S * 2, S * 2), (0, 0, 0, 0))
    for i, f in enumerate([litter, moss, shaft, twigs]):
        cell = f(r).resize((S, S), Image.LANCZOS)
        # (the transparent edge keeps its colour: no dark fringe when the card is filtered)
        atlas.paste(cell, ((i % 2) * S, (i // 2) * S))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT)
    print('wrote', OUT)


if __name__ == '__main__':
    main()
