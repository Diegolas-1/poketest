#!/usr/bin/env python3
"""The leaf atlases' smooth alpha (tools/native/bake_leaves.mjs paints them).

For each variant: ref_<v>.png (the web's own 1024 px atlas) finds the files in
native/world that are that atlas (as is, or upside down: the town's copies),
and hi_<v>.png (the same painting at 8192 px) becomes the new atlas:
  alpha = 0.5 + d / spread, d = the signed distance to the leaf's edge in
          output texels (inside > 0), per tile (4 x 4 tiles)
  colour = the painting averaged by coverage over each texel, spread outward
           past the edge from the nearest leaf texel.
"""
import argparse, glob, os, re, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument('--world', required=True)
ap.add_argument('--tmp', required=True)
ap.add_argument('--out', type=int, default=2048)
ap.add_argument('--spread', type=float, default=24.0)
ap.add_argument('--check', action='store_true')
A = ap.parse_args()
VARIANTS = ['green', 'autumn', 'meadow', 'crop']


def load(f):
    return np.asarray(Image.open(f).convert('RGBA'))


def match(img, ref):
    """'up' / 'flip' when img is the 1024 px atlas ref (as is / upside down), else None"""
    if img.shape != ref.shape:
        return None
    a = img[..., 3] >= 128
    for how, r in (('up', ref), ('flip', ref[::-1])):
        ra = r[..., 3] >= 128
        if (a != ra).mean() > 0.02:   # (the canvas's anti-aliasing differs a little between machines)
            continue
        both = a & ra
        if both.any() and np.abs(img[both][:, :3].astype(int) - r[both][:, :3].astype(int)).mean() < 8.0:
            return how
    return None


def atlas(hi, out, spread):
    H = hi.shape[0]
    k = H // out
    a = hi[..., 3].astype(np.float32) / 255.0
    rgb = hi[..., :3].astype(np.float32) / 255.0
    # coverage-weighted colour per output texel (linear light, so edges keep their colour)
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    pm = (lin * a[..., None]).reshape(out, k, out, k, 3).sum((1, 3))
    cov = a.reshape(out, k, out, k).sum((1, 3))
    col = pm / np.maximum(cov, 1e-6)[..., None]
    inside = a >= 0.5
    sd = np.zeros((H, H), np.float32)
    T = H // 4
    o = out // 4
    alpha = np.zeros((out, out), np.float32)
    have = cov > 1e-3
    for ty in range(4):
        for tx in range(4):
            sl = (slice(ty * T, ty * T + T), slice(tx * T, tx * T + T))
            ins = inside[sl]
            # (padded with outside, so a tile's edge counts as the leaf's edge)
            pad = np.pad(ins, 1, constant_values=False)
            if not pad.any():
                d = np.full(ins.shape, -1e4, np.float32)
            else:
                din = ndimage.distance_transform_edt(pad)[1:-1, 1:-1]
                dout = ndimage.distance_transform_edt(~pad)[1:-1, 1:-1]
                # distance to the boundary between pixel centres (half a pixel each side)
                d = np.where(ins, din - 0.5, -(dout - 0.5)).astype(np.float32)
            sd[sl] = d
            osl = (slice(ty * o, ty * o + o), slice(tx * o, tx * o + o))
            # spread the colour from the nearest leaf texel of this tile
            hv = have[osl]
            if hv.any() and not hv.all():
                _, (iy, ix) = ndimage.distance_transform_edt(~hv, return_indices=True)
                c = col[osl]
                col[osl] = c[iy, ix]
    # texel = mean of its k x k pixels' distances, in output texels
    dt = sd.reshape(out, k, out, k).mean((1, 3)) / k
    alpha = np.clip(0.5 + dt / spread, 0.0, 1.0)
    srgb = np.where(col <= 0.0031308, col * 12.92, 1.055 * np.power(np.maximum(col, 0), 1 / 2.4) - 0.055)
    img = np.dstack([np.clip(srgb, 0, 1), alpha[..., None]])
    return (img * 255.0 + 0.5).astype(np.uint8)


cands = [f for f in glob.glob(os.path.join(A.world, '**', '*.png'), recursive=True)
         if Image.open(f).mode == 'RGBA' and Image.open(f).size == (1024, 1024)]
# pictures already rebuilt (no longer 1024 px) are known from tools/native/leaf_atlases.txt
done_list = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'leaf_atlases.txt')
known = {}
if os.path.exists(done_list):
    for line in open(done_list):
        p = line.split()
        if len(p) == 3 and os.path.exists(os.path.join(A.world, p[0])):
            known[p[0]] = (p[1], p[2])
found = dict(known)
for v in VARIANTS:
    ref = load(os.path.join(A.tmp, f'ref_{v}.png'))
    for f in cands:
        rel = os.path.relpath(f, A.world)
        how = match(load(f), ref)
        if how:
            found[rel] = (v, how)
for rel, (v, how) in sorted(found.items()):
    print(f'leaf atlas: {rel} = {v}{" (upside down)" if how == "flip" else ""}{" (rebuilt before)" if rel in known else ""}')
missing = [v for v in VARIANTS if v not in [x[0] for x in found.values()]]
if missing:
    print('leaf atlas: no file is the', ', '.join(missing), 'atlas (not used, or the web painting changed: rebake the world)')
if A.check:
    sys.exit(0)
for v in VARIANTS:
    rels = [r for r, (vv, _) in found.items() if vv == v]
    if not rels:
        continue
    img = atlas(load(os.path.join(A.tmp, f'hi_{v}.png')), A.out, A.spread)
    for rel in rels:
        im = img[::-1] if found[rel][1] == 'flip' else img
        Image.fromarray(im, 'RGBA').save(os.path.join(A.world, rel), optimize=True)
        print(f'leaf atlas: wrote {rel} ({A.out} px, spread {A.spread:g})')
# import: VRAM compressed (ETC2 on the phone, DXT5 on a desktop: 1 byte a texel,
# the distance field keeps well in their interpolated alpha blocks); the town's
# copy was lossless (an uncompressed 2048 px atlas would take 22 MB of GPU memory).
# (Not high quality: BC7 / ASTC take the same memory, but a software renderer
# (lavapipe, the dev machines' tests) samples BC7 several times slower.)
for rel in found:
    imp = os.path.join(A.world, rel + '.import')
    if not os.path.exists(imp):
        continue
    t = open(imp).read()
    t2 = re.sub(r'^compress/mode=\d+$', 'compress/mode=2', t, flags=re.M)
    t2 = re.sub(r'^mipmaps/generate=\w+$', 'mipmaps/generate=true', t2, flags=re.M)
    if t2 != t:
        open(imp, 'w').write(t2)
        print(f'leaf atlas: {rel}.import set to VRAM compressed')
with open(done_list, 'w') as fo:
    for rel, (v, how) in sorted(found.items()):
        fo.write(f'{rel} {v} {how}\n')
