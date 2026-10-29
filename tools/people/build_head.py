#!/usr/bin/env python3
"""Head shapes for the people generator (web/world/people/head.bin), from VRoid's
CC0 base models (VRoid Project's Base_Male and Base_Female, public domain: their
own VRM metadata says CC0; mirrored at https://opengameart.org/node/170868):

    curl -LO https://opengameart.org/sites/default/files/base_male.zip
    curl -LO https://opengameart.org/sites/default/files/base_female.zip
    python3 tools/people/build_head.py Base_Male.vrm Base_Female.vrm

Each head (the face's skin with the eye whites closing the eye openings) is turned
into a signed distance grid in head units (the head's height from the chin to the
crown is 1; x left, y up from the chin, z forward from the skull's middle):
inside/outside by ray parity along x and along z (the neck's opening below is
open, so not along y), the distance near the surface from the triangles
themselves, clamped to a narrow band and stored as int8, deflated. Landmarks are
measured on the model (eyes, brows, mouth, nose tip, ears, widths) for the face
paint and the rest of the body. Only numbers derived from the models are written.
"""
import json, struct, sys, zlib
import numpy as np

VOX = 0.009          # grid step, head heights
BAND = 0.16          # distances clamped to +-BAND head heights
BOX = ((-0.62, 0.62), (-0.32, 1.08), (-0.78, 0.66))   # x, y, z in head units


def load_vrm(path):
    d = open(path, 'rb').read()
    n = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + n])
    binoff = 20 + n + 8
    B = d[binoff:]

    def acc(i):
        a = j['accessors'][i]
        bv = j['bufferViews'][a['bufferView']]
        comps = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        arr = np.frombuffer(B, dtype=dt, count=a['count'] * comps, offset=off)
        return arr.reshape(-1, comps) if comps > 1 else arr

    parts = {}
    prims = [p for m in j['meshes'] if m['name'].startswith('Face') for p in m['primitives']]
    # the back of the skull is the base hair cap on the body mesh
    prims += [p for m in j['meshes'] if m['name'].startswith('Body') for p in m['primitives'] if 'HairBack' in j['materials'][p['material']]['name']]
    for p in prims:
        name = j['materials'][p['material']]['name']
        P = acc(p['attributes']['POSITION']).astype(np.float64).copy()
        P[:, 0] *= -1   # VRM 0.x faces -z: turn it round to face +z (x and z both flip)
        P[:, 2] *= -1
        idx = acc(p['indices']).astype(np.int64).reshape(-1, 3)
        key = 'cap' if 'HairBack' in name else 'skin' if 'SKIN' in name else 'white' if 'EyeWhite' in name else 'iris' if 'EyeIris' in name else 'mouth' if 'Mouth' in name else 'brow' if 'Brow' in name else 'lash' if 'Eyelash' in name else 'line' if 'Eyeline' in name else 'other'
        parts.setdefault(key, []).append(P[np.unique(idx)] if key not in ('skin', 'white', 'cap') else (P, idx))
    return parts


def tris(parts, keys):
    out = []
    for k in keys:
        for P, idx in parts.get(k, []):
            out.append(P[idx])
    return np.concatenate(out)          # (n, 3, 3)


def landmarks(parts):
    skin = np.concatenate([P[np.unique(i)] for P, i in parts['skin']])
    cap = np.concatenate([P[np.unique(i)] for P, i in parts.get('cap', [])]) if parts.get('cap') else skin[:0]
    whole = np.concatenate([skin, cap])
    # the chin: the lowest point of the face's front (near the middle, forward)
    front = skin[(np.abs(skin[:, 0]) < 0.012) & (skin[:, 2] > np.percentile(skin[:, 2], 70))]
    chin_y = front[:, 1].min() if len(front) else skin[:, 1].min()
    crown = whole[:, 1].max()
    hh = crown - chin_y
    zmid = (whole[:, 2].max() + whole[:, 2].min()) / 2
    iris = np.concatenate(parts['iris'])
    L = {}
    for side, s in (('l', 1), ('r', -1)):
        e = iris[iris[:, 0] * s > 0]
        L['eye_' + side] = [float(e[:, 0].mean()), float(e[:, 1].mean()), float(e[:, 2].max())]
        L['iris_h_' + side] = float(e[:, 1].max() - e[:, 1].min())
        L['iris_w_' + side] = float(e[:, 0].max() - e[:, 0].min())
    lash = np.concatenate(parts.get('lash', parts['iris']))
    L['eye_top'] = float(lash[:, 1].max())
    brow = np.concatenate(parts['brow'])
    L['brow_y'] = float(brow[:, 1].mean())
    mouth = np.concatenate(parts['mouth'])
    L['mouth'] = [0.0, float(mouth[:, 1].mean()), float(mouth[:, 2].max())]
    mid = skin[np.abs(skin[:, 0]) < 0.004]
    tip = mid[np.argmax(mid[:, 2])]
    L['nose_tip'] = [0.0, float(tip[1]), float(tip[2])]
    # ears: the farthest out at the sides
    side = skin[np.abs(skin[:, 0]) > np.abs(skin[:, 0]).max() - 0.01]
    L['ear'] = [float(np.abs(side[:, 0]).mean()), float(side[:, 1].mean()), float(side[:, 2].mean())]
    # half widths by height (for the body's neck and the garments' collars)
    rows = []
    for t in np.linspace(0, 1, 21):
        y = chin_y + t * hh
        s = whole[np.abs(whole[:, 1] - y) < hh * 0.025]
        rows.append([float(t), float(np.abs(s[:, 0]).max() / hh) if len(s) else 0.0, float((s[:, 2].max() - zmid) / hh) if len(s) else 0.0, float((s[:, 2].min() - zmid) / hh) if len(s) else 0.0])
    norm = lambda p: [p[0] / hh, (p[1] - chin_y) / hh, (p[2] - zmid) / hh]
    out = {
        'hh_m': float(hh), 'width': float((whole[:, 0].max() - whole[:, 0].min()) / hh), 'depth': float((whole[:, 2].max() - whole[:, 2].min()) / hh),
        'eye': norm(L['eye_l']), 'iris_h': L['iris_h_l'] / hh, 'iris_w': L['iris_w_l'] / hh, 'eye_top': (L['eye_top'] - chin_y) / hh,
        'brow': (L['brow_y'] - chin_y) / hh, 'mouth': norm(L['mouth']), 'nose': norm(L['nose_tip']), 'ear': norm(L['ear']), 'rows': rows,
    }
    return out, chin_y, hh, zmid


def cap_holes(parts, keys, min_len=0.25):
    """triangle fans closing the big open loops of the meshes (the jaw line where the face's skin
    ends, the nape where the skull cap does), so the head is a closed surface"""
    fans = []
    for k in keys:
        for P, idx in parts.get(k, []):
            edges = {}
            for t in idx:
                for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
                    key = (min(a, b), max(a, b))
                    edges[key] = edges.get(key, 0) + 1
            nxt = {}
            for t in idx:
                for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
                    if edges[(min(a, b), max(a, b))] == 1:
                        nxt[a] = b
            seen = set()
            for s0 in list(nxt):
                if s0 in seen:
                    continue
                loop, v = [], s0
                while v in nxt and v not in seen:
                    seen.add(v); loop.append(v); v = nxt[v]
                if len(loop) < 3:
                    continue
                pts = P[loop]
                per = np.linalg.norm(np.diff(np.vstack([pts, pts[:1]]), axis=0), axis=1).sum()
                if per < min_len:
                    continue
                c = pts.mean(0)
                fan = [[c, pts[i], pts[(i + 1) % len(pts)]] for i in range(len(pts))]
                # face away from the head's middle (below the jaw: downwards)
                n = sum(np.cross(f[1] - f[0], f[2] - f[0]) for f in fan)
                mid = P[np.unique(idx)].mean(0)
                if n @ (c - mid) < 0:
                    fan = [[f[0], f[2], f[1]] for f in fan]
                fans += fan
    return np.array(fans) if fans else np.zeros((0, 3, 3))


def sdf(T, L=None, nfan=0):
    """signed distances on the grid for triangles T (n, 3, 3) in head units, the last nfan of them
    the closing fans (walls for the fill only: through the head they would draw sheets)"""
    xs = np.arange(BOX[0][0], BOX[0][1] + 1e-9, VOX)
    ys = np.arange(BOX[1][0], BOX[1][1] + 1e-9, VOX)
    zs = np.arange(BOX[2][0], BOX[2][1] + 1e-9, VOX)
    nx, ny, nz = len(xs), len(ys), len(zs)

    # distance to the triangles near them
    dist = np.full((nx, ny, nz), BAND, np.float64)
    reach = BAND
    for t in T:
        lo = t.min(0) - reach; hi = t.max(0) + reach
        i0, j0, k0 = [max(0, int(np.floor((lo[q] - BOX[q][0]) / VOX))) for q in range(3)]
        i1, j1, k1 = [min(n - 1, int(np.ceil((hi[q] - BOX[q][0]) / VOX))) for q, n in zip(range(3), (nx, ny, nz))]
        if i1 < i0 or j1 < j0 or k1 < k0:
            continue
        g = np.stack(np.meshgrid(xs[i0:i1 + 1], ys[j0:j1 + 1], zs[k0:k1 + 1], indexing='ij'), -1).reshape(-1, 3)
        dd = point_tri(g, t[0], t[1], t[2]).reshape(i1 - i0 + 1, j1 - j0 + 1, k1 - k0 + 1)
        np.minimum(dist[i0:i1 + 1, j0:j1 + 1, k0:k1 + 1], dd, out=dist[i0:i1 + 1, j0:j1 + 1, k0:k1 + 1])
    # inside: what the outside cannot reach. The surface is a wall a voxel and a half thick (sealing
    # small gaps where the face meets the skull cap); the neck's opening below the jaw is closed with
    # a floor across the neck.
    wall = dist < VOX * 1.35
    Pall = T.reshape(-1, 3)
    def flood(block, seed=None):
        out = np.zeros_like(block)
        if seed is None:
            out[0, :, :] = out[-1, :, :] = True; out[:, 0, :] = out[:, -1, :] = True; out[:, :, 0] = out[:, :, -1] = True
        else:
            out[seed] = True
        out &= ~block
        for it in range(600):
            grow = out.copy()
            grow[1:] |= out[:-1]; grow[:-1] |= out[1:]; grow[:, 1:] |= out[:, :-1]; grow[:, :-1] |= out[:, 1:]; grow[:, :, 1:] |= out[:, :, :-1]; grow[:, :, :-1] |= out[:, :, 1:]
            grow &= ~block
            if (grow == out).all():
                break
            out = grow
        return out
    def solid(s):
        s = s.copy()
        s[~flood(s <= 0) & (s > 0)] = -VOX
        c = np.unravel_index(np.argmin(s), s.shape)
        s[(s < 0) & ~flood(s >= 0, c)] = VOX
        return s
    # first with a thick wall (it seals the gaps round the eyes) for the core, then the outside again with
    # the thin wall, kept out of that core: small gaps only dent the surface, they cannot flood the head
    core = ~flood(dist < VOX * 2.6) & ~(dist < VOX * 2.6)
    inside = ~flood(wall | core)
    # distances again, from the models' own triangles on the outside only
    outside = ~inside
    keep = []
    for t in T[:len(T) - nfan]:
        lo = t.min(0) - 1.5 * VOX; hi = t.max(0) + 1.5 * VOX
        i0, j0, k0 = [max(0, int(np.floor((lo[q] - BOX[q][0]) / VOX))) for q in range(3)]
        i1, j1, k1 = [min(n - 1, int(np.ceil((hi[q] - BOX[q][0]) / VOX))) for q, n in zip(range(3), (nx, ny, nz))]
        if outside[i0:i1 + 1, j0:j1 + 1, k0:k1 + 1].any():
            keep.append(t)
    # near the surface the side comes from the closest triangle's own facing (the models' triangles face
    # outwards), far from it (and across the closed openings) from the fill
    centre = np.array([0.0, 0.5, 0.0])
    dist = np.full((nx, ny, nz), BAND, np.float64)
    side = np.zeros((nx, ny, nz), np.float64)
    for t in keep:
        nrm = np.cross(t[1] - t[0], t[2] - t[0]); ln = np.linalg.norm(nrm)
        if ln < 1e-14:
            continue
        nrm /= ln
        lo = t.min(0) - reach; hi = t.max(0) + reach
        i0, j0, k0 = [max(0, int(np.floor((lo[q] - BOX[q][0]) / VOX))) for q in range(3)]
        i1, j1, k1 = [min(n - 1, int(np.ceil((hi[q] - BOX[q][0]) / VOX))) for q, n in zip(range(3), (nx, ny, nz))]
        if i1 < i0 or j1 < j0 or k1 < k0:
            continue
        g = np.stack(np.meshgrid(xs[i0:i1 + 1], ys[j0:j1 + 1], zs[k0:k1 + 1], indexing='ij'), -1).reshape(-1, 3)
        shp = (i1 - i0 + 1, j1 - j0 + 1, k1 - k0 + 1)
        dd = point_tri(g, t[0], t[1], t[2]).reshape(shp)
        sd = ((g - t[0]) @ nrm).reshape(shp)
        sub = dist[i0:i1 + 1, j0:j1 + 1, k0:k1 + 1]
        better = dd < sub
        sub[better] = dd[better]
        side[i0:i1 + 1, j0:j1 + 1, k0:k1 + 1][better] = sd[better]
    near = dist < 2.5 * VOX
    inside = np.where(near, side < 0, inside)
    dist = np.maximum(dist, VOX * 0.05)   # never exactly on a grid point (the sign must decide)
    s = np.where(inside, -dist, dist)
    # one solid: sheets of outside the outside cannot reach (a skull cap's edge tucked under the
    # forehead's skin) are filled, and specks of inside apart from the head are dropped
    s = solid(s)
    # the eye sockets filled flush with the lids (the eyes are painted on): a smooth union with an
    # ellipsoid over each eye
    if L:
        X, Y, Z = np.meshgrid(xs, ys, zs, indexing='ij')
        ex, ey, ez = L['eye']; rx, ry = L['iris_w'] * 1.25, L['iris_h'] * 1.15
        for sx in (1, -1):
            cx, cz = sx * ex, ez - 0.075
            k0 = np.sqrt(((X - cx) / rx) ** 2 + ((Y - ey) / ry) ** 2 + ((Z - cz) / 0.08) ** 2)
            e = (k0 - 1) * min(rx, ry)
            kk = 0.03
            h = np.clip(0.5 + 0.5 * (e - s) / kk, 0, 1)
            s = e + (s - e) * h - kk * h * (1 - h)
    s = redistance(s)
    # a light blur (the voxels' last steps); above the brows (under the hair) a strong one, so where
    # the skull cap meets the face's skin, and the cap's own seam, leave no crease
    for ax in range(3):
        s = 0.25 * np.roll(s, 1, ax) + 0.5 * s + 0.25 * np.roll(s, -1, ax)
    if L:
        Yg = np.broadcast_to(ys[None, :, None], s.shape)
        m = np.clip((Yg - (L['brow'] + 0.04)) / 0.08, 0, 1)
        b = s.copy()
        for it in range(6):
            for ax in range(3):
                b = 0.25 * np.roll(b, 1, ax) + 0.5 * b + 0.25 * np.roll(b, -1, ax)
        s = s + (b - s) * m
    s = solid(s)   # again: the blur closes the slits some of those sheets reached the outside by
    return np.clip(np.round(s / BAND * 127), -127, 127).astype(np.int8), (nx, ny, nz)


def redistance(s):
    """distances again from where the sign changes only (triangles inside the head, the closing fans
    and the eyes' and mouth's backs, left valleys of near-zero distance inside that would catch a
    projection): seeded where a neighbour's sign differs, then a chamfer sweep"""
    big = BAND * 4
    d = np.full(s.shape, big)
    neg = s < 0
    for ax in range(3):
        for sh in (1, -1):
            o = np.roll(s, sh, ax)
            flip = (np.roll(neg, sh, ax) != neg)
            est = VOX * np.abs(s) / np.maximum(np.abs(s) + np.abs(o), 1e-12)
            d = np.where(flip, np.minimum(d, est), d)
    offs = [(a, b, c) for a in (-1, 0, 1) for b in (-1, 0, 1) for c in (-1, 0, 1) if (a, b, c) != (0, 0, 0)]
    for it in range(int(BAND / VOX) + 3):
        prev = d
        for o in offs:
            d = np.minimum(d, np.roll(d, o, (0, 1, 2)) + VOX * np.sqrt(o[0] ** 2 + o[1] ** 2 + o[2] ** 2))
        if (d == prev).all():
            break
    d = np.minimum(d, BAND)
    return np.where(neg, -d, d)


def point_tri(p, a, b, c):
    """distances from points p (n, 3) to the triangle abc (Ericson's closest point)"""
    ab, ac, ap = b - a, c - a, p - a
    d1, d2 = ap @ ab, ap @ ac
    bp = p - b; d3, d4 = bp @ ab, bp @ ac
    cp = p - c; d5, d6 = cp @ ab, cp @ ac
    va = d3 * d6 - d5 * d4; vb = d5 * d2 - d1 * d6; vc = d1 * d4 - d3 * d2
    den = np.where(np.abs(va + vb + vc) < 1e-20, 1e-20, va + vb + vc)
    v = vb / den; w = vc / den
    q = a + np.outer(v, ab) + np.outer(w, ac)          # inside the face
    # the regions round it
    r1 = (d1 <= 0) & (d2 <= 0); q[r1] = a
    r2 = (d3 >= 0) & (d4 <= d3); q[r2] = b
    r3 = (vc <= 0) & (d1 >= 0) & (d3 <= 0) & ~r1 & ~r2
    t3 = d1 / np.where(np.abs(d1 - d3) < 1e-20, 1e-20, d1 - d3); q[r3] = a + np.outer(t3[r3], ab)
    r4 = (d6 >= 0) & (d5 <= d6) & ~r1 & ~r2
    q[r4] = c
    r5 = (vb <= 0) & (d2 >= 0) & (d6 <= 0) & ~r1 & ~r2 & ~r4
    t5 = d2 / np.where(np.abs(d2 - d6) < 1e-20, 1e-20, d2 - d6); q[r5] = a + np.outer(t5[r5], ac)
    r6 = (va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0) & ~r1 & ~r2 & ~r4
    t6 = (d4 - d3) / np.where(np.abs((d4 - d3) + (d5 - d6)) < 1e-20, 1e-20, (d4 - d3) + (d5 - d6)); q[r6] = b + np.outer(t6[r6], c - b)
    return np.linalg.norm(p - q, axis=1)


def main(paths, out):
    heads, grids = [], []
    for path in paths:
        parts = load_vrm(path)
        L, chin, hh, zmid = landmarks(parts)
        T = tris(parts, ['skin', 'white', 'cap'])
        # where the skull cap lies over the face's skin (above the hairline) only the cap is kept:
        # two surfaces a few millimetres apart would crease
        capP = np.concatenate([P[np.unique(i)] for P, i in parts.get('cap', [])])
        def under_cap(t):
            c = t.mean(0)
            return np.min(np.linalg.norm(capP - c, axis=1)) < 0.018 * hh
        skinT = tris(parts, ['skin'])
        keepS = np.array([not under_cap(t) for t in skinT])
        T = np.concatenate([skinT[keepS], tris(parts, ['white']), tris(parts, ['cap'])])
        print(path, 'skin triangles under the cap dropped', int((~keepS).sum()), file=sys.stderr)
        F = cap_holes(parts, ['skin', 'cap'], min_len=0.25 * hh)
        print(path, 'closing', len(F), 'fan triangles', file=sys.stderr)
        T = np.concatenate([T, F]).copy()
        T[..., 0] /= hh; T[..., 1] = (T[..., 1] - chin) / hh; T[..., 2] = (T[..., 2] - zmid) / hh
        g, dims = sdf(T, L, len(F))
        heads.append(L); grids.append(g)
        print(path, 'head', round(hh, 4), 'm, grid', dims, 'inside voxels', int((g < 0).sum()), file=sys.stderr)
    meta = {'box': BOX, 'vox': VOX, 'band': BAND, 'dims': list(grids[0].shape), 'heads': heads, 'names': ['male', 'female'][:len(paths)],
            'source': "VRoid Project's Base_Male / Base_Female (CC0)"}
    raw = b''.join(g.tobytes() for g in grids)   # x fastest? no: numpy C order (x, y, z): z fastest
    comp = zlib.compress(raw, 9)
    js = json.dumps(meta).encode()
    with open(out, 'wb') as f:
        f.write(b'PPLH' + struct.pack('<I', len(js)) + js + comp)
    print('wrote', out, len(comp) // 1024, 'KB', file=sys.stderr)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--out=')]
    out = next((a[6:] for a in sys.argv[1:] if a.startswith('--out=')), 'web/world/people/head.bin')
    main(args, out)
