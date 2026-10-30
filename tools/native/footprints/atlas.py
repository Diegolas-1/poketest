# The footprint atlas (native/fx/footprints.png, read by native/footprints.gd):
# 4 x 3 cells of 128 px, one print each, drawn from signed distances at 4x and
# averaged down. Grey = how deep the print is (white the deepest; the shader
# darkens the ground by it). Each print points up (the toe at the top) and is a
# left foot (the big toe on the right as seen from above); the right is the
# mirror. The two trails (slither, slime) tile top to bottom (see PAD).
#   python3 tools/native/footprints/atlas.py
import os
import numpy as np
from PIL import Image

CELL = 128
SS = 4
COLS, ROWS = 4, 3
KINDS = ["sneaker", "boot", "foot", "paw", "bird", "hoof", "claw", "webbed", "stub", "slither", "slime", "glint"]
N = CELL * SS
ax = (np.arange(N) + 0.5) / N
X, V = np.meshgrid(ax * 2.0 - 1.0, ax)   # x -1..1 left to right, v 0 (toe, top) .. 1
Y = 1.0 - V * 2.0                         # y -1 (heel) .. 1 (toe)
# the trails' cells hold a little more than one period, so the shader can keep
# off their top and bottom rows (mixed with the next cell's in the mipmaps) and
# still tile: row v holds the trail at (v * (1 + 2 PAD) - PAD)
PAD = 0.0625
VT = V * (1.0 + 2.0 * PAD) - PAD


def ell(cx, cy, rx, ry):
    q = np.sqrt(((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2)
    return (q - 1.0) * min(rx, ry)


def seg(ax_, ay, bx, by, r0, r1=None):
    r1 = r0 if r1 is None else r1
    px, py = X - ax_, Y - ay
    dx, dy = bx - ax_, by - ay
    h = np.clip((px * dx + py * dy) / (dx * dx + dy * dy), 0.0, 1.0)
    return np.hypot(px - dx * h, py - dy * h) - (r0 + (r1 - r0) * h)


def box(cx, cy, hx, hy, r):
    qx = np.abs(X - cx) - hx + r
    qy = np.abs(Y - cy) - hy + r
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def u(*ds):
    out = ds[0]
    for d in ds[1:]:
        out = np.minimum(out, d)
    return out


rng = np.random.default_rng(7)
grain = rng.random((N, N))


def press(sd, floor=0.62, wall=0.07, soft=0.025):
    # an impressed shape: the floor, a deeper wall just inside the edge, soft outside
    inside = floor + (1.0 - floor) * np.clip(1.0 + sd / wall, 0.0, 1.0) ** 2
    out = np.where(sd < 0, inside, np.clip(1.0 - sd / soft, 0.0, 1.0) * 0.9)
    return out * (0.9 + 0.1 * grain)


def cell(k):
    if k == "sneaker":
        sd = smin(smin(ell(0.05, 0.36, 0.30, 0.52), ell(0.0, -0.58, 0.24, 0.34), 0.25), seg(-0.06, 0.0, -0.04, -0.3, 0.16), 0.1)
        img = press(sd, 0.5)
        tread = (np.sin(Y * 46.0) > 0.25) & (sd < -0.05)   # the sole's bars
        return np.where(tread, img * 0.7, img)
    if k == "boot":
        fore = ell(0.04, 0.34, 0.33, 0.56)
        heel = box(0.0, -0.66, 0.26, 0.22, 0.12)
        img = press(u(fore, heel), 0.55)
        chev = (np.sin((Y - np.abs(X) * 0.9) * 30.0) > 0.3) & (u(fore, heel) < -0.05)   # chevron lugs
        return np.where(chev, img * 0.6, img)
    if k == "foot":
        sole = smin(ell(0.06, 0.12, 0.30, 0.42), ell(0.0, -0.55, 0.22, 0.30), 0.25)
        toes = u(ell(0.24, 0.72, 0.13, 0.15), ell(0.0, 0.76, 0.09, 0.1), ell(-0.17, 0.7, 0.08, 0.09), ell(-0.31, 0.6, 0.07, 0.08), ell(-0.42, 0.47, 0.065, 0.07))
        return press(u(sole, toes), 0.6)
    if k == "paw":
        pad = smin(smin(ell(-0.25, -0.32, 0.22, 0.24), ell(0.25, -0.32, 0.22, 0.24), 0.2), ell(0.0, -0.2, 0.26, 0.24), 0.2)
        toes = u(ell(-0.56, 0.24, 0.15, 0.2), ell(-0.2, 0.52, 0.16, 0.21), ell(0.2, 0.52, 0.16, 0.21), ell(0.56, 0.24, 0.15, 0.2))
        return press(u(pad, toes), 0.66)
    if k == "bird":
        sd = u(seg(0.0, -0.2, -0.62, 0.72, 0.1, 0.035), seg(0.0, -0.2, 0.0, 0.92, 0.11, 0.035), seg(0.0, -0.2, 0.62, 0.72, 0.1, 0.035),
               seg(0.0, -0.2, 0.06, -0.86, 0.09, 0.03), ell(0.0, -0.2, 0.15, 0.15))
        return press(sd, 0.7, 0.05)
    if k == "hoof":
        img = press(ell(0.0, 0.02, 0.62, 0.74), 0.45, 0.16)
        frog = seg(0.0, 0.2, 0.0, -0.7, 0.04, 0.17)   # the split / frog: shallower
        return np.where(frog < 0, img * 0.55, img)
    if k == "claw":
        pad = smin(ell(0.0, -0.3, 0.5, 0.45), ell(0.0, 0.05, 0.36, 0.3), 0.2)
        toes = u(ell(-0.5, 0.36, 0.17, 0.25), ell(0.0, 0.5, 0.18, 0.26), ell(0.5, 0.36, 0.17, 0.25))
        claws = u(seg(-0.6, 0.58, -0.74, 0.88, 0.05, 0.012), seg(0.0, 0.76, 0.0, 1.0, 0.055, 0.012), seg(0.6, 0.58, 0.74, 0.88, 0.05, 0.012))
        return np.maximum(press(u(pad, toes), 0.62), press(claws, 1.0, 0.02, 0.015))
    if k == "webbed":
        toes = u(seg(0.0, -0.55, -0.72, 0.62, 0.11, 0.06), seg(0.0, -0.55, 0.0, 0.88, 0.11, 0.06), seg(0.0, -0.55, 0.72, 0.62, 0.11, 0.06), ell(0.0, -0.55, 0.2, 0.2))
        # the web: the fan between the toes, its front edge scalloped
        ang = np.arctan2(X, Y + 0.55)
        rad = np.hypot(X, Y + 0.55)
        web_r = 1.1 - 0.16 * np.abs(np.sin(ang * 2.6))
        web = (np.abs(ang) < 0.95) & (rad < web_r)
        return np.maximum(press(toes, 0.75), np.where(web, 0.5 * (0.9 + 0.1 * grain), 0.0))
    if k == "stub":
        sd = u(ell(0.0, -0.08, 0.5, 0.64), ell(-0.3, 0.55, 0.12, 0.12), ell(0.0, 0.64, 0.12, 0.12), ell(0.3, 0.55, 0.12, 0.12))
        return press(sd, 0.6, 0.1)
    if k == "slither":
        c = 0.42 * np.sin(VT * 2.0 * np.pi)
        d = np.abs(X - c) / 0.24
        img = np.clip(1.0 - d * d, 0.0, 1.0) ** 0.6
        scales = 0.88 + 0.12 * np.sin(VT * 2 * np.pi * 9.0)   # the belly scales' faint ridges
        return img * scales * (0.9 + 0.1 * grain)
    if k == "slime":
        edge = 0.62 + 0.09 * np.sin(VT * 2 * np.pi * 2.0 + 1.3) + 0.06 * np.sin(VT * 2 * np.pi * 5.0)
        edge_r = 0.62 + 0.08 * np.sin(VT * 2 * np.pi * 3.0 + 0.4) + 0.05 * np.sin(VT * 2 * np.pi * 7.0 + 2.0)
        cx = 0.06 * np.sin(VT * 2 * np.pi)
        inside = np.where(X < cx, (cx - X) / edge, (X - cx) / edge_r)
        img = np.clip((1.0 - inside) / 0.12, 0.0, 1.0) * 0.62
        blob = np.sin(X * 9.0 + np.sin(VT * 2 * np.pi * 3) * 2.0) * np.sin(VT * 2 * np.pi * 4.0)
        img = img * (0.85 + 0.25 * (blob > 0.4))
        rim = np.clip(1.0 - np.abs(inside - 0.97) / 0.06, 0.0, 1.0) * 0.4
        return np.clip(img + rim, 0, 1) * (0.92 + 0.08 * grain)
    if k == "glint":
        r = np.hypot(X, Y)
        star = np.maximum(np.clip(1.0 - np.abs(X) / 0.05, 0, 1) * np.clip(1.0 - np.abs(Y), 0, 1) ** 2,
                          np.clip(1.0 - np.abs(Y) / 0.05, 0, 1) * np.clip(1.0 - np.abs(X), 0, 1) ** 2)
        return np.clip(star + np.clip(1.0 - r / 0.28, 0, 1) ** 2, 0, 1)
    raise ValueError(k)


out = np.zeros((ROWS * CELL, COLS * CELL), np.float32)
for i, k in enumerate(KINDS):
    a = np.clip(cell(k), 0.0, 1.0)
    if k != "glint": a = a ** 0.75   # (deeper floors: they read on the pebbly dirt)
    a = a.reshape(CELL, SS, CELL, SS).mean(axis=(1, 3))
    r, c = divmod(i, COLS)
    out[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = a
here = os.path.dirname(os.path.abspath(__file__))
dst = os.path.normpath(os.path.join(here, "..", "..", "..", "native", "fx", "footprints.png"))
Image.fromarray((out * 255.0 + 0.5).astype(np.uint8), "L").save(dst, optimize=True)
print("wrote", dst, out.shape)
