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

mouth.png is the mouths' atlas, from mouths.png: a sheet in the eyes sheets' template
(the same face blobs on the page, four to a row) with a mouth drawn on each, eight of them:
smile, a small o, relaxed, an open grin, gritted teeth, a wide gasp, clenched teeth, a
laugh (actor.gd MOUTHS, in that order). Each cell's mouth is cut out below the nose (the
page's white and the flat skin made clear; the teeth stay white), the sheet lined up on
the eyes' by the nose, and the cells go four across in 512 cells like the eyes'.
Without mouths.png, the old look's mouth: cut from old_face.png, the old face drawn from
the front into the same frame by bake_ash2.mjs, a single cell, inked dark (MOUTH_INK)
since it is a pale line that would read white on the V2's skin.

Where the eyes and the mouth sit on the head, and how big, is not here: the look's
"face" placement (cast.json, the tunables over it, set live in dev/face_tool.gd).

  python3 tools/native/ash2_face.py [--cell=512] [--eye-line=-0.31] [--mouth-line=-0.78]
"""
import sys, os
import numpy as np
from PIL import Image

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ash2_face')
args = {k.lstrip('-'): float(v) for k, v in (a.split('=') for a in sys.argv[1:] if '=' in a)}
CELL = int(args.get('cell', 512))
EYE_LINE = args.get('eye-line', -0.31)   # cell 0's eyes' centre line, head radii from the centre
MOUTH_INK = (40, 18, 16)                 # the mouth line's colour (a dark, warm ink, like the eyes' lines)
MOUTH_GAIN = args.get('mouth-gain', 1.6)  # the old mouth's faint alpha, firmed up
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

# ---------- the mouths: the sheet's eight, below the nose ----------
def nose_of(rgb, drawn):
    """a cell's nose mark: the first ink down a narrow middle column, below the eyes (x, y, bottom row)"""
    h, w = drawn.shape
    lum = 0.3 * rgb[..., 0] + 0.59 * rgb[..., 1] + 0.11 * rgb[..., 2]
    ink = (lum < 110) & drawn
    x0, x1 = int(w / 2 - w * 0.04), int(w / 2 + w * 0.04)
    col = ink[:, x0:x1].any(axis=1)
    col[:int(h * 0.55)] = False
    ys = np.where(col)[0]
    end = 0
    while end + 1 < len(ys) and ys[end + 1] - ys[end] <= 3: end += 1   # the first run of rows: the nose, not the mouth under it
    sub = ink[ys[0]:ys[end] + 1, x0:x1]
    yy, xx = np.where(sub)
    return xx.mean() + x0, yy.mean() + ys[0], ys[end]

sheet_m = os.path.join(HERE, 'mouths.png')
MOUTH_LINE = args.get('mouth-line', -0.78)   # the smile's centre line (cell 0), head radii from the centre
if os.path.exists(sheet_m) and sheets:
    from PIL import ImageDraw, ImageFilter
    msheet = np.asarray(Image.open(sheet_m).convert('RGB'))
    H, W = msheet.shape[:2]; size = W // COLS
    page = np.median(np.concatenate([msheet[:8, :8].reshape(-1, 3), msheet[-8:, -8:].reshape(-1, 3)]), axis=0)
    # the page: what is near white and reaches the border (flooded from it; the teeth, white
    # inside a mouth, stay), grown two pixels over the faces' soft edges; the skin: the flat
    # colour under the mouths
    near_page = np.sqrt(((msheet.astype(np.int32) - page) ** 2).sum(2)) < 60
    flood = Image.fromarray(np.where(near_page[..., None], 255, 0).astype(np.uint8).repeat(3, 2), 'RGB')
    for x in range(0, W, 16):
        for y in (0, H - 1):
            if near_page[y, x]: ImageDraw.floodfill(flood, (x, y), (255, 0, 255))
    for y in range(0, H, 16):
        for x in (0, W - 1):
            if near_page[y, x]: ImageDraw.floodfill(flood, (x, y), (255, 0, 255))
    fl = np.asarray(flood)
    is_page = (fl[..., 0] == 255) & (fl[..., 1] == 0) & (fl[..., 2] == 255)
    blob = ~is_page
    skin = np.median(msheet[blob & (np.abs(msheet.astype(int) - page).sum(2) > 60)].reshape(-1, 3), axis=0)
    layer = clear_flat(msheet, skin)
    grown = np.asarray(Image.fromarray((is_page * 255).astype(np.uint8), 'L').filter(ImageFilter.MaxFilter(5))) > 0
    layer[..., 3] = np.where(grown, 0, layer[..., 3])
    mdrawn = layer[..., 3] > 128
    # the rows of faces: bands of rows with any face in them (the sheet's cells need not be square)
    has = blob.any(axis=1)
    bands, y0 = [], None
    for y in range(H + 1):
        on = y < H and has[y]
        if on and y0 is None: y0 = y
        if not on and y0 is not None:
            if bands and y0 - bands[-1][1] < 6: bands[-1][1] = y
            else: bands.append([y0, y])
            y0 = None
    bands = [b for b in bands if b[1] - b[0] > size * 0.2]
    kk = size / CELL
    noses = [nose_of(msheet[top:bot, 0:size], mdrawn[top:bot, 0:size]) for top, bot in bands]
    top0, bot0 = bands[0]; mx0, my0, mbot0 = noses[0]
    ys, xs = np.where(mdrawn[top0:bot0, 0:size] & (np.arange(bot0 - top0)[:, None] > mbot0 + 2) & (np.abs(np.arange(size)[None, :] - mx0) < size * 0.21))
    under = ys.mean() - my0                                            # the smile's centre below the nose (band rows)
    y_line = kk * (1 - MOUTH_LINE) / 2 * CELL                          # where that goes in a cell (source pixels)
    print(f'mouths.png: {W}x{H}, {len(bands)} rows of {COLS}, cells {size} wide; the smile {under:.0f} px under the nose, to {MOUTH_LINE} head radii')
    rgba = Image.fromarray(layer, 'RGBA')
    matlas = Image.new('RGBA', (CELL * COLS, CELL * len(bands)), (0, 0, 0, 0))
    yy, xx = np.mgrid[0:CELL, 0:CELL]
    for r, (top, bot) in enumerate(bands):
        mx, my, mbot = noses[r]
        dx, dy = size / 2 - mx, y_line - (my + under)                  # each row's own nose: to the middle, the mouth to the line
        print(f'  row {r}: rows {top}..{bot}, nose at ({mx:.0f}, {my:.0f}), moved ({dx:+.0f}, {dy:+.0f}) px')
        for c in range(COLS):
            cell = rgba.transform((CELL, CELL), Image.AFFINE, (kk, 0, c * size - dx, 0, kk, top - dy), resample=Image.BICUBIC)
            a = np.asarray(cell).copy()
            src_y = kk * yy + top - dy                                 # the source row and column each output pixel came from
            src_x = kk * xx + c * size - dx
            # under the nose: below its bottom, or beside it (a wide mouth's corners rise past it), never above its middle; this row's face; between the cheek marks
            keep = (src_y > top + my) & ((src_y > top + mbot + 2) | (np.abs(src_x - (c * size + mx)) > size * 0.06)) & (src_y < bot - 2) & (np.abs(xx / CELL * 2 - 1) < 0.42)
            a[..., 3] = (a[..., 3] * keep).astype(np.uint8)
            matlas.alpha_composite(Image.fromarray(a, 'RGBA'), (c * CELL, r * CELL))
    matlas.save(os.path.join(HERE, 'mouth.png'), optimize=True)
    print(f'mouth.png {matlas.size}: {COLS * len(bands)} mouths, {COLS} across')

old = os.path.join(HERE, 'old_face.png')
if os.path.exists(sheet_m) and sheets:
    pass
elif os.path.exists(old):
    im = Image.open(old).convert('RGBA')
    half = im.height                   # the left half: eyes open; a square of two head radii
    a = np.asarray(im.crop((0, 0, half, half))).copy()
    ys, xs = np.mgrid[0:half, 0:half]
    u = xs / half * 2 - 1; v = 1 - ys / half * 2
    keep = (v < -0.52) & (v > -0.95) & (np.abs(u) < 0.42)
    a[..., 3] = np.clip(a[..., 3].astype(float) * keep * MOUTH_GAIN, 0, 255).astype(np.uint8)
    a[..., :3] = MOUTH_INK                 # (its shape, inked)
    mouth = Image.fromarray(a, 'RGBA').resize((CELL, CELL), Image.LANCZOS)
    mouth.save(os.path.join(HERE, 'mouth.png'), optimize=True)
    rows = np.where(a[..., 3] > 128)[0]
    print(f'mouth: cut from old_face.png, v {1 - rows.max() / half * 2:.2f}..{1 - rows.min() / half * 2:.2f} -> mouth.png {mouth.size}')
else:
    print('mouth: no old_face.png yet (bake_ash2.mjs writes it); run the bake, then this again')

# a look at both over a skin colour: the eyes' cells, then the mouths' below them
pv = Image.new('RGBA', atlas.size, (212, 145, 88, 255)); pv.alpha_composite(atlas)
if os.path.exists(os.path.join(HERE, 'mouth.png')):
    m = Image.open(os.path.join(HERE, 'mouth.png')).convert('RGBA')
    if m.width == m.height:
        for c in range(COLS): pv.alpha_composite(m, (c * CELL, 0))   # (the one mouth under the first row)
    else:
        e0 = atlas.crop((0, 0, CELL, CELL))
        pm = Image.new('RGBA', m.size, (212, 145, 88, 255))
        for r in range(m.height // CELL):
            for c in range(COLS): pm.alpha_composite(e0, (c * CELL, r * CELL))
        pm.alpha_composite(m)
        both = Image.new('RGBA', (pv.width, pv.height + pm.height)); both.paste(pv, (0, 0)); both.paste(pm, (0, pv.height)); pv = both
pv.convert('RGB').save(os.path.join(HERE, 'atlas_preview.png'))
