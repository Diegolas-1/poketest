#!/usr/bin/env python3
# A sculpted anime head (AnimeHeadBaseMesh.OBJ: ZBrush, about 107k faces, no UVs; a bald
# head with ears and a neck, the eyes as shallow sockets, a hint of a mouth) made into the
# head the base model lacks (its own head is only a low-poly face mask), written as
# web/world/heads/anime_head.js:
#   - reduced to about 6000 triangles (fast-simplification), each vertex keeping the smooth
#     normal of the sculpt round it (so it shades smooth, not faceted);
#   - fitted to the base model's head (model units): its ears onto the face mask's ears, its
#     chin, mouth and eye sockets fall where the base face has them (chin 1.095, mouth 1.118,
#     eyes 1.164); its neck stretched down into the collar;
#   - the sculpt's axes are ours already (Y up, facing +Z, left = +X).
#   python3 tools/world/head_from_obj.py path/to/AnimeHeadBaseMesh.OBJ [--tris=6000]
# Needs numpy and fast-simplification.
import sys
from pathlib import Path
import numpy as np
import fast_simplification

ROOT = Path(__file__).resolve().parents[2]
SX, SY, SZ = 0.12, 0.11, 0.125          # sculpt units -> model units
EAR = (-0.085, -0.08)                    # the sculpt's ear (y, z) -> ours (1.155, -0.012)
NECK_Y = -0.75                           # below this the sculpt is neck: stretched down to NECK_BOT
NECK_BOT = 1.03


def fit(v):
    x, y, z = v[:, 0], v[:, 1], v[:, 2]
    Y = 1.155 + (y - EAR[0]) * SY
    y0 = 1.155 + (NECK_Y - EAR[0]) * SY
    low = y < NECK_Y
    Y[low] = y0 - (NECK_Y - y[low]) / (NECK_Y + 1.0) * (y0 - NECK_BOT)
    return np.stack([x * SX, Y, -0.012 + (z - EAR[1]) * SZ], 1)


def main():
    args = dict(a[2:].split('=', 1) for a in sys.argv[2:] if a.startswith('--') and '=' in a)
    V, F = [], []
    for line in open(sys.argv[1]):
        if line.startswith('v '): V.append([float(t) for t in line.split()[1:4]])
        elif line.startswith('f '):
            ix = [int(t.split('/')[0]) - 1 for t in line.split()[1:]]
            for k in range(1, len(ix) - 1): F.append([ix[0], ix[k], ix[k + 1]])
    V = np.array(V, np.float64); F = np.array(F, np.int64)
    # smooth normals of the sculpt (area weighted)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    N = np.zeros_like(V)
    for k in range(3): np.add.at(N, F[:, k], fn)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    n = int(args.get('tris', 6000))
    v2, f2 = fast_simplification.simplify(V.astype(np.float32), F.astype(np.int32), target_reduction=1 - n / len(F))
    # each kept vertex: the sculpt's normal at its nearest original vertex (a grid search)
    cell = 0.02
    keys = np.floor(V / cell).astype(np.int64)
    grid = {}
    for i, k in enumerate(map(tuple, keys)): grid.setdefault(k, []).append(i)
    n2 = np.zeros((len(v2), 3))
    for i, p in enumerate(v2):
        k0 = np.floor(p / cell).astype(np.int64); best, bd = None, 1e9
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for j in grid.get((k0[0] + dx, k0[1] + dy, k0[2] + dz), ()):
                        d = ((V[j] - p) ** 2).sum()
                        if d < bd: bd, best = d, j
        n2[i] = N[best]
    P = fit(v2.astype(np.float64))
    # normals through the (non-uniform) fit: the inverse transpose of the scale
    n2 = n2 / np.array([SX, SY, SZ]); n2 /= np.linalg.norm(n2, axis=1, keepdims=True)
    # facing out: the winding agrees with the normals
    tri_n = np.cross(P[f2[:, 1]] - P[f2[:, 0]], P[f2[:, 2]] - P[f2[:, 0]])
    if (tri_n * n2[f2].mean(1)).sum() < 0: f2 = f2[:, [0, 2, 1]]
    out = ROOT / 'web/world/heads/anime_head.js'
    fmt = lambda a, d: ','.join(('%.*f' % (d, x)).rstrip('0').rstrip('.') or '0' for x in a)
    out.write_text("// A sculpted anime head (AnimeHeadBaseMesh.OBJ) fitted to the base model's head\n"
                   "// (tools/world/head_from_obj.py): model units, smooth normals, indexed triangles\n"
                   'export const HEAD = {\n  pos: [' + fmt(P.ravel(), 4) + '],\n  nrm: [' + fmt(n2.ravel(), 3) + '],\n  idx: [' + ','.join(map(str, f2.ravel())) + '],\n};\n')
    print(len(v2), 'vertices', len(f2), 'triangles; bounds', P.min(0).round(3), P.max(0).round(3), out.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
