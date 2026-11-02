#!/usr/bin/env python3
"""Ash's V2 face: the decal atlas from the two expression sheets in tools/native/ash2_face/.

ref_eyes.jpg has eight faces (two rows of four: determined, surprised, eyes shut,
starry; narrowed, worried, glaring, happy-shut) with brows, eyes, nose and cheek marks
on a flat flesh panel; ref_mouths.jpg the same eight with mouths. This cuts each face's
features out (the panel's flesh and the page go transparent), takes the mouth from the
second sheet and sets it lower (its mouths sit right under the nose), and lays the eight
out as they are in the sheets, each cell a square of the head seen from the front, two
head radii wide, in the frame the bake projects onto the head (u right, v up, the head
sphere's centre at the middle). The game shows cell 0; its blink moves half a texture to
the right, which is cell 2, the shut eyes.

  python3 tools/native/ash2_face.py [--eye-y=-0.40] [--eye-sep=0.72] [--mouth-gap=0.10] [--cell=512]
  -> tools/native/ash2_face/atlas.png (and atlas_preview.png over a skin colour)

eye-y: the eyes' centre line, head radii from the centre (down is negative); eye-sep:
the eyes' centres apart, head radii (the features' size); mouth-gap: from the nose's
bottom to the mouth's top, head radii.
"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ash2_face')
args = {k.lstrip('-'): float(v) for k, v in (a.split('=') for a in sys.argv[1:] if '=' in a)}
EYE_Y = args.get('eye-y', -0.40)
EYE_SEP = args.get('eye-sep', 0.72)
MOUTH_GAP = args.get('mouth-gap', 0.10)
CELL = int(args.get('cell', 512))
COLS, ROWS = 4, 2

def load(name):
    return np.asarray(Image.open(os.path.join(HERE, name)).convert('RGB')).astype(np.int32)

def runs(mask, min_len):
    out, start = [], None
    for i, m in enumerate(mask):
        if m and start is None: start = i
        if not m and start is not None: out.append((start, i)); start = None
    if start is not None: out.append((start, len(mask)))
    return [r for r in out if r[1] - r[0] >= min_len]

def grid(img):
    """the sheet's cells: the non-white column and row spans, each padded a little"""
    nonwhite = img.min(2) < 235
    cs = runs(nonwhite.any(0), 50); rs = runs(nonwhite.any(1), 30)
    assert len(cs) == COLS and len(rs) == ROWS, (cs, rs)
    pad = 12
    return [[(max(0, c0 - pad), max(0, r0 - pad), min(img.shape[1], c1 + pad), min(img.shape[0], r1 + pad)) for (c0, c1) in cs] for (r0, r1) in rs]

def fill_outside(nonpanel):
    """pixels connected to the border through white page: the outside (the eyes' whites inside stay)"""
    h, w = nonpanel.shape
    out = np.zeros_like(nonpanel)
    stack = [(y, x) for x in range(w) for y in (0, h - 1) if nonpanel[y, x]] + [(y, x) for y in range(h) for x in (0, w - 1) if nonpanel[y, x]]
    for y, x in stack: out[y, x] = True
    while stack:
        y, x = stack.pop()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and nonpanel[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True; stack.append((ny, nx))
    return out

def features(cell):
    """RGBA of a cell's drawn features: the page and the flesh transparent (the panel's
    rim, a blend of flesh and page, eroded away with it)"""
    white = cell.min(2) >= 228
    outside = fill_outside(white)
    panel = ~outside
    panel = np.asarray(Image.fromarray(panel.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(7))) > 0
    flesh = np.median(cell[panel & (cell.sum(2) > 300) & (cell.min(2) < 228)].reshape(-1, 3), axis=0)
    d = np.sqrt(((cell - flesh) ** 2).sum(2))
    a = np.clip((d - 30) / 35, 0, 1) * panel
    rgba = np.concatenate([cell, (a * 255)[..., None]], axis=2).astype(np.uint8)
    return rgba, panel

def nose(cell, panel):
    """the nose mark: the first narrow run of dark rows down the panel's middle column in
    its lower half (a mouth below it is wider) -> (x, y of its centre, y of its bottom)"""
    h, w = panel.shape
    lum = 0.3 * cell[..., 0] + 0.59 * cell[..., 1] + 0.11 * cell[..., 2]
    dark = (lum < 120) & panel
    cols = np.where(panel.any(0))[0]; cx = (cols.min() + cols.max()) / 2
    top = np.where(panel.any(1))[0].min(); bot = np.where(panel.any(1))[0].max()
    band = dark[:, int(cx - 0.05 * w):int(cx + 0.05 * w)]
    width = band.sum(1)
    rows = [y for y in range(int(top + 0.5 * (bot - top)), h) if 0 < width[y] <= 10]
    if not rows: return cx, top + 0.78 * (bot - top), top + 0.82 * (bot - top)
    run = [rows[0]]
    for y in rows[1:]:
        if y - run[-1] <= 3: run.append(y)
        else: break
    ys, xs = np.where(band[run[0]:run[-1] + 1])
    return int(cx - 0.05 * w) + xs.mean(), run[0] + ys.mean(), run[-1]

def pupils(cell, panel):
    """the two pupils' centres in a cell with open eyes"""
    lum = 0.3 * cell[..., 0] + 0.59 * cell[..., 1] + 0.11 * cell[..., 2]
    dark = (lum < 90) & panel
    ys, xs = np.where(dark)
    cx = np.median(xs)
    top = np.where(panel.any(1))[0].min(); bot = np.where(panel.any(1))[0].max()
    mid = (ys > top + 0.2 * (bot - top)) & (ys < top + 0.75 * (bot - top))   # not the brows, not the nose
    L = (xs < cx - 0.06 * panel.shape[1]) & mid; R = (xs > cx + 0.06 * panel.shape[1]) & mid
    return (xs[L].mean(), ys[L].mean()), (xs[R].mean(), ys[R].mean())

def place(layer, ax, ay, u0, v0, s, size):
    """the layer (RGBA, source pixels) drawn so that source (ax, ay) sits at (u0, v0) in a
    size x size cell of u, v in [-1, 1], s head radii a source pixel"""
    img = Image.fromarray(layer, 'RGBA')
    k = 2.0 / size / s   # source pixels an output pixel
    # x_in = ax + (u - u0) / s, u = x_out * 2 / size - 1 ; y_in = ay - (v - v0) / s, v = 1 - y_out * 2 / size
    data = (k, 0, ax + (-1 - u0) / s, 0, k, ay - (1 - v0) / s)
    return img.transform((size, size), Image.AFFINE, data, resample=Image.BICUBIC)

eyes_img, mouth_img = load('ref_eyes.jpg'), load('ref_mouths.jpg')
ge, gm = grid(eyes_img), grid(mouth_img)
# the scale from cell 0's eyes: their centres EYE_SEP apart
c0 = eyes_img[ge[0][0][1]:ge[0][0][3], ge[0][0][0]:ge[0][0][2]]
f0, p0 = features(c0)
(lx, ly), (rx, ry) = pupils(c0, p0)
s = EYE_SEP / (rx - lx)
nx0, ny0, nb0 = nose(c0, p0)
NOSE_V = EYE_Y - (ny0 - (ly + ry) / 2) * s   # the nose this far below the eye line, in every cell
MOUTH_TOP_V = EYE_Y - (nb0 - (ly + ry) / 2) * s - MOUTH_GAP
print(f'scale {s:.5f} radii/px  eye line y {(ly + ry) / 2:.1f}  nose at v {NOSE_V:.3f}  mouths from v {MOUTH_TOP_V:.3f}')

atlas = Image.new('RGBA', (CELL * COLS, CELL * ROWS), (0, 0, 0, 0))
for r in range(ROWS):
    for c in range(COLS):
        x0, y0, x1, y1 = ge[r][c]
        cell = eyes_img[y0:y1, x0:x1]
        f, p = features(cell)
        nx, ny, _ = nose(cell, p)
        out = place(f, nx, ny, 0.0, NOSE_V, s, CELL)
        # the mouth: the second sheet's features below its nose, round the middle, its top
        # set MOUTH_GAP under the nose
        mx0, my0, mx1, my1 = gm[r][c]
        mcell = mouth_img[my0:my1, mx0:mx1]
        mf, mp = features(mcell)
        mnx, mny, mnb = nose(mcell, mp)
        keep = np.zeros(mp.shape, bool)
        ys, xs = np.mgrid[0:mp.shape[0], 0:mp.shape[1]]
        keep[(ys > mnb + 3) & (np.abs(xs - mnx) < 0.36 * mp.shape[1])] = True
        mf = mf.copy(); mf[..., 3] = (mf[..., 3] * keep).astype(np.uint8)
        a = mf[..., 3] > 100
        if a.sum() > 20:
            mtop = np.where(a)[0].min(); mcx = np.where(a)[1].mean()
            mouth = place(mf, mcx, mtop, 0.0, MOUTH_TOP_V, s, CELL)
            out.alpha_composite(mouth)
        atlas.alpha_composite(out, (c * CELL, r * CELL))
        print(f'cell {r},{c}: nose ({nx:.0f},{ny:.0f}) mouth sheet nose bottom {mnb} mouth pixels {int(a.sum())}')
atlas.save(os.path.join(HERE, 'atlas.png'), optimize=True)
bg = Image.new('RGBA', atlas.size, (212, 145, 88, 255)); bg.alpha_composite(atlas)
bg.convert('RGB').save(os.path.join(HERE, 'atlas_preview.png'))
print('wrote', os.path.join(HERE, 'atlas.png'), atlas.size)
