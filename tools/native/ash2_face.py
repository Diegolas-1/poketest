#!/usr/bin/env python3
"""Ash's V2 face: the decal atlases from tools/native/ash2_face/.

eyes.png, eyes2.png, ... are the eyes sheets, drawn by hand from one template:
expressions on a flat skin colour in square cells, four to a row (the sheet's width over
four is the cell), any number of rows (empty rows at the top or bottom are skipped). The
first sheet's first row is determined, surprised, eyes shut, starry; its second narrowed,
worried, glaring, happy-shut; the rest as drawn. Each cell is the head seen from the front,
two head radii wide (u right, v up). The flat colour goes transparent, every sheet is
shifted alike so that the first sheet's cell 0 eyes are centred at u 0 and sit at
--eye-line (a sheet framed differently puts the face in the same place), and the cells
become atlas.png: 512 a cell, four across, the sheets' rows one after another. The game
shows cell 0; its blink moves half a texture to the right, which is cell 2; the other
cells are expressions for actor.gd set_expression(col, row).

mouth.png is the old look's mouth: cut from old_face.png, the old face drawn from the
front into the same frame by bake_ash2.mjs (run the bake once first), a single cell.

Where the eyes and the mouth sit on the head, and how big, is not here: the look's
"face" placement (cast.json, the tunables over it, set live in dev/face_tool.gd).

  python3 tools/native/ash2_face.py [--cell=512] [--eye-line=-0.31]
"""
import sys, os
import numpy as np
from PIL import Image

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ash2_face')
args = {k.lstrip('-'): float(v) for k, v in (a.split('=') for a in sys.argv[1:] if '=' in a)}
CELL = int(args.get('cell', 512))
EYE_LINE = args.get('eye-line', -0.31)   # cell 0's eyes' centre line, head radii from the centre
COLS = 4

def clear_flat(rgb, bg):
    """RGBA with the flat colour (and whatever is close to it) transparent"""
    d = np.sqrt(((rgb.astype(np.int32) - bg) ** 2).sum(2))
    a = np.clip((d - 28) / 30, 0, 1)
    return np.concatenate([rgb, (a * 255)[..., None].astype(np.uint8)], axis=2)

# ---------- the eyes ----------
sheets = sorted(f for f in os.listdir(HERE) if f.startswith('eyes') and f.endswith('.png'))
cells = []          # (rgba layer, cell size, row, col) in atlas order
shift = None        # the first sheet's cell 0 eyes to (0, EYE_LINE): the same for every sheet
for name in sheets:
    sheet = np.asarray(Image.open(os.path.join(HERE, name)).convert('RGB'))
    H, W = sheet.shape[:2]
    bg = np.median(np.concatenate([sheet[:20, :20].reshape(-1, 3), sheet[-20:, -20:].reshape(-1, 3)]), axis=0)
    layer = clear_flat(sheet, bg)
    size = W // COLS                   # the cells' side
    drawn = layer[..., 3] > 128
    rows = [r for r in range(round(H / size)) if drawn[r * size:(r + 1) * size].any()]
    if shift is None:
        # cell 0's eyes: the dark pupils' centre
        c0 = sheet[rows[0] * size:(rows[0] + 1) * size, 0:size].astype(int)
        lum = 0.3 * c0[..., 0] + 0.59 * c0[..., 1] + 0.11 * c0[..., 2]
        ys, xs = np.where((lum < 90) & drawn[rows[0] * size:(rows[0] + 1) * size, 0:size])
        mid = (ys > ys.min() + 0.25 * (ys.max() - ys.min())) & (ys < ys.min() + 0.8 * (ys.max() - ys.min()))   # not the brows, not the marks
        ex, ey = xs[mid].mean(), ys[mid].mean()
        shift = (size / 2 - ex, (1 - EYE_LINE) / 2 * size - ey)   # source pixels right and down
        print(f'{name}: cell 0 eyes at ({ex:.0f}, {ey:.0f}), every sheet moved ({shift[0]:+.0f}, {shift[1]:+.0f}) px')
    rgba = Image.fromarray(layer, 'RGBA')
    for r in rows:
        for c in range(COLS): cells.append((rgba, size, r, c))
    print(f'{name}: {W}x{H}, cells of {size}, rows {rows}, background {bg.astype(int).tolist()}')
ROWS = len(cells) // COLS
atlas = Image.new('RGBA', (CELL * COLS, CELL * ROWS), (0, 0, 0, 0))
for i, (rgba, size, r, c) in enumerate(cells):
    k = size / CELL
    # x_in = k * x_out + c * size - dx ; y_in = k * y_out + r * size - dy
    cell = rgba.transform((CELL, CELL), Image.AFFINE, (k, 0, c * size - shift[0], 0, k, r * size - shift[1]), resample=Image.BICUBIC)
    atlas.alpha_composite(cell, ((i % COLS) * CELL, (i // COLS) * CELL))
atlas.save(os.path.join(HERE, 'atlas.png'), optimize=True)
print(f'atlas.png {atlas.size}: {len(cells)} cells, {COLS} across')

# ---------- the mouth: the old face's, from its projection ----------
old = os.path.join(HERE, 'old_face.png')
if os.path.exists(old):
    im = Image.open(old).convert('RGBA')
    half = im.height                   # the left half: eyes open; a square of two head radii
    a = np.asarray(im.crop((0, 0, half, half))).copy()
    ys, xs = np.mgrid[0:half, 0:half]
    u = xs / half * 2 - 1; v = 1 - ys / half * 2
    keep = (v < -0.52) & (v > -0.95) & (np.abs(u) < 0.42)
    a[..., 3] = (a[..., 3] * keep).astype(np.uint8)
    mouth = Image.fromarray(a, 'RGBA').resize((CELL, CELL), Image.LANCZOS)
    mouth.save(os.path.join(HERE, 'mouth.png'), optimize=True)
    rows = np.where(a[..., 3] > 128)[0]
    print(f'mouth: cut from old_face.png, v {1 - rows.max() / half * 2:.2f}..{1 - rows.min() / half * 2:.2f} -> mouth.png {mouth.size}')
else:
    print('mouth: no old_face.png yet (bake_ash2.mjs writes it); run the bake, then this again')

# a look at both over a skin colour
pv = Image.new('RGBA', atlas.size, (212, 145, 88, 255)); pv.alpha_composite(atlas)
if os.path.exists(os.path.join(HERE, 'mouth.png')):
    m = Image.open(os.path.join(HERE, 'mouth.png')).convert('RGBA')
    for c in range(COLS): pv.alpha_composite(m, (c * CELL, 0))   # (the mouth under the first row, as placed by default)
pv.convert('RGB').save(os.path.join(HERE, 'atlas_preview.png'))
