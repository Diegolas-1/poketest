#!/usr/bin/env python3
# The earth atlas (web/world/tex/earth_atlas.webp): eight CC0 photo soils
# (ambientCG and Poly Haven, listed in web/world/tex/CREDITS.md) turned into
# painted detail for the cel look, packed in one 2048 x 1024 picture of
# 4 x 2 tiles (512 px: 480 of picture and a 16 px wrapped border, so a shader
# can repeat a tile with fract() and mipmaps never bleed into the next one).
#
# Each tile keeps only the photo's shapes and a little of its hue, relative to
# its own average colour: 128 means "the colour the vertex already has"
# (shaders multiply by tex * 2). The luminance is softened (median + blur),
# then posterised into three soft painted tones (shadowed crumbs and cracks,
# the body, lit grains and pebble tops), so faces read as painted earth, not as
# photos. The tile order is the shaders' (EARTH_TILES in web/world/props/earth.js):
#   0 dark loam, 1 sandy soil, 2 clay, 3 gravelly dirt,
#   4 rooty soil, 5 eroded layered silt, 6 eroded dark clay, 7 forest soil
#
#   python3 tools/world/earth_atlas.py [download dir]
import io, os, sys, tempfile, urllib.request, zipfile
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ROOT, 'web', 'world', 'tex', 'earth_atlas.webp')
AMB = 'https://ambientcg.com/get?file={}_1K-JPG.zip'
PH = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{0}/{0}_diff_1k.jpg'
TILES = [
    ('amb', 'Ground048'),                 # dark loam
    ('amb', 'Ground079S'),                # sandy soil
    ('ph', 'red_laterite_soil_stones'),   # clay
    ('ph', 'brown_mud_rocks_01'),         # gravelly dirt
    ('amb', 'Ground084'),                 # rooty soil
    ('amb', 'Ground094A'),                # eroded layered silt
    ('amb', 'Ground100'),                 # eroded dark clay
    ('amb', 'Ground082S'),                # forest soil
]
T, PAD = 512, 16
IN = T - 2 * PAD


def fetch(kind, name, d):
    f = os.path.join(d, name + '.jpg')
    if os.path.exists(f): return f
    if kind == 'ph':
        urllib.request.urlretrieve(PH.format(name), f)
    else:
        z = os.path.join(d, name + '.zip')
        if not os.path.exists(z): urllib.request.urlretrieve(AMB.format(name), z)
        with zipfile.ZipFile(z) as zf:
            col = [n for n in zf.namelist() if n.endswith('_Color.jpg')][0]
            open(f, 'wb').write(zf.read(col))
    return f


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def stylise(path):
    # painted, not photographic: the fine grain gone, the bigger shapes kept
    # (worked at half size, then brought back up smooth, so the tones below
    # cut clean rounded shapes instead of speckle)
    im = Image.open(path).convert('RGB').resize((IN // 2, IN // 2), Image.LANCZOS)
    w2 = Image.new('RGB', (im.width * 3, im.height * 3))
    for ox in range(3):
        for oy in range(3): w2.paste(im, (ox * im.width, oy * im.height))
    w2 = w2.filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(1.0))
    im = w2.resize((IN * 3, IN * 3), Image.BICUBIC).crop((IN, IN, IN * 2, IN * 2))
    a = np.asarray(im).astype(np.float32) / 255.0
    lum = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    mean = a.reshape(-1, 3).mean(0)
    ml = float(lum.mean())
    rel = lum / max(ml, 1e-4)
    # three tones with soft (a few px) edges, from the luminance's own spread
    lo, hi = np.percentile(rel, 22), np.percentile(rel, 80)
    w = 0.025
    tone = 0.74 + 0.26 * smooth(lo - w, lo + w, rel) + 0.2 * smooth(hi - w, hi + w, rel)
    # a little of the photo's hue (pale roots, grey stones, red grains), half strength
    hue = a / np.maximum(lum[..., None], 1e-3) * (ml / np.maximum(mean, 1e-3)) * mean.mean()
    hue = hue / np.maximum(hue.mean(axis=(0, 1)), 1e-3)
    hue = np.clip(1.0 + (hue - 1.0) * 0.3, 0.85, 1.15)
    out = tone[..., None] * hue
    out = out / out.reshape(-1, 3).mean(0)   # average exactly 1 per channel (128 = no change)
    # soften the posterised steps a touch more (no aliasing in the painted tones)
    return Image.fromarray(np.clip(out * 128, 0, 255).astype(np.uint8))


def main():
    d = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='earth-')
    os.makedirs(d, exist_ok=True)
    atlas = Image.new('RGB', (T * 4, T * 2), (128, 128, 128))
    for i, (kind, name) in enumerate(TILES):
        t = stylise(fetch(kind, name, d))
        # the tile, wrapped into its border
        big = Image.new('RGB', (IN * 3, IN * 3))
        for ox in range(3):
            for oy in range(3): big.paste(t, (ox * IN, oy * IN))
        big = big.filter(ImageFilter.GaussianBlur(0.6))   # (on the wrapped copy: no seam at the tile's edge)
        tile = big.crop((IN - PAD, IN - PAD, IN - PAD + T, IN - PAD + T))
        atlas.paste(tile, ((i % 4) * T, (i // 4) * T))
        print(i, name)
    atlas.save(OUT, 'WEBP', quality=88, method=6)
    print(OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
