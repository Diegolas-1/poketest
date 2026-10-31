"""The doll bases (people with only their swimwear for underwear, to be dressed):
derived from the game's own X/Y models the way Ash was derived from Calem.

  python3 tools/people/derive_doll.py <body.smd> <target.smd> <out.glb> [--ash=web/world/local/ash.glb]

  body    an overworld model wearing little (the swimmers): its body, minus head and hands
  target  a battle model (the battle proportions the game uses, its bald head, its hands)

The body is carried onto the target's skeleton bone by bone (each part stretched along
its bone and swelled across it to the target's size; the target's clothes are a little
thicker than skin), the target's head and hands are put on it and the seams at the neck
and wrists are bridged. The ring and little fingers, one chain (D) on this rig, are split
into two fingers that both follow it. The skeleton written is Ash's (web/world/local/ash.glb:
his bones' names and rest rotations, the joints moved to the target's), so Ash's clips play.
"""
import sys, os, io
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from xy import read_smd, read_glb, node_local, mat_quat, quat_mat, trs, write_glb

S_OUT = 0.712 / 64.0     # battle units -> Ash's units (a teen's waist, Shauna 62.3, at Ash's 0.712)
CLOTH = 0.93             # the target's clothes stand off its skin by about this much


def dominant(links):
    return max(links, key=lambda x: x[1])[0]


def flatten(smd, mats=None):
    """an SMD's triangles as arrays: pos (n,3), nrm, uv, bone names (n,4), weights (n,4), material per triangle"""
    B = smd['bones']
    P, N, U, J, W, M = [], [], [], [], [], []
    for mat, tris in smd['tris'].items():
        if mats and not any(k in mat for k in mats):
            continue
        for tr in tris:
            for pos, nrm, uv, links in tr:
                links = sorted(links, key=lambda x: -x[1])[:4]
                s = sum(w for _, w in links) or 1
                P.append(pos); N.append(nrm); U.append([uv[0], 1 - uv[1]])
                J.append([B[b][0] for b, _ in links] + [None] * (4 - len(links)))
                W.append([w / s for _, w in links] + [0] * (4 - len(links)))
            M.append(mat)
    n = len(P)
    return {'pos': np.array(P, float), 'nrm': np.array(N, float), 'uv': np.array(U, float), 'bone': np.array(J, object),
            'w': np.array(W, float), 'mat': M, 'idx': np.arange(n).reshape(-1, 3)}


def weld(m, eps=1e-4):
    """merge the triangle soup's coincident corners that agree on uv (seams stay split), so loops and normals work"""
    key = {}
    remap = np.zeros(len(m['pos']), int)
    keep = []
    for i, (p, u) in enumerate(zip(m['pos'], m['uv'])):
        k = tuple(np.round(p / eps).astype(int)) + tuple(np.round(u / 1e-4).astype(int))
        if k not in key:
            key[k] = len(keep); keep.append(i)
        remap[i] = key[k]
    out = {k: (v[keep] if isinstance(v, np.ndarray) and len(v) == len(m['pos']) else v) for k, v in m.items()}
    out['idx'] = remap[m['idx']]
    return out


def to_frame(m, M):
    m = dict(m)
    m['pos'] = m['pos'] @ M[:3, :3].T + M[:3, 3]
    R = M[:3, :3] / np.cbrt(abs(np.linalg.det(M[:3, :3])))
    m['nrm'] = m['nrm'] @ R.T
    return m


def bone_world(smd):
    """bone name -> world matrix, in the skeleton's Origin frame (Y up)"""
    names = {v[0]: k for k, v in smd['bones'].items()}
    O = np.linalg.inv(smd['world'][names['Origin']])
    return {n: O @ smd['world'][k] for n, k in names.items()}


MAIN_CHILD = {'Hips': None, 'Waist': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Spine3': 'Neck', 'LThigh': 'LLeg', 'LLeg': 'LFoot',
              'LFoot': 'LToe', 'RThigh': 'RLeg', 'RLeg': 'RFoot', 'RFoot': 'RToe', 'LShoulder': 'LArmA', 'LArmA': 'LForeArm',
              'LForeArm': 'LHand', 'RShoulder': 'RArmA', 'RArmA': 'RForeArm', 'RForeArm': 'RHand', 'Neck': 'Head'}
LIMB = {'LThigh', 'LLeg', 'RThigh', 'RLeg', 'LArmA', 'LForeArm', 'RArmA', 'RForeArm'}


DIR = {'Waist': (0, 1, 0), 'Spine1': (0, 1, 0), 'Hips': (0, -1, 0), 'Head': (0, 1, 0), 'LToe': (0, 0, 1), 'RToe': (0, 0, 1),
       'LHand': (1, 0, 0), 'RHand': (-1, 0, 0), 'LHandEX': (1, 0, 0), 'RHandEX': (-1, 0, 0)}


def canon(W, b):
    """a frame for bone b that both rigs agree on (their bones' own axes differ): x along the bone
    (to its main child), z as near the body's forward (+z) as that allows, at the joint"""
    p = W[b][:3, 3]
    c = MAIN_CHILD.get(b)
    if b in DIR or c not in W:
        x = np.array(DIR.get(b, (0, 1, 0)), float)
    else:
        x = W[c][:3, 3] - p; x /= max(np.linalg.norm(x), 1e-9)
    ref = np.array([0, 0, 1.0]) if abs(x[2]) < 0.8 else np.array([0, 1.0, 0])
    z = ref - x * (ref @ x); z /= np.linalg.norm(z); y = np.cross(z, x)
    F = np.eye(4); F[:3, 0], F[:3, 1], F[:3, 2], F[:3, 3] = x, y, z, p
    return F


def local_extent(m, F, bone):
    """the 10th..90th percentile box of the vertices a bone carries most, in frame F"""
    sel = np.array([b[0] == bone and w[0] > 0.5 for b, w in zip(m['bone'], m['w'])])
    if sel.sum() < 6:
        return None
    L = (m['pos'][sel] - F[:3, 3]) @ F[:3, :3]
    return np.percentile(L, 10, 0), np.percentile(L, 90, 0)


def carry(body, src, tgt, tgt_mesh):
    """the body (in its own skeleton's frame) moved bone by bone onto the target's skeleton (tgt: world matrices, output units)"""
    M = {}
    g = tgt['Waist'][1, 3] / src['Waist'][1, 3]   # the overall change of size
    for b in src:
        if b not in tgt:
            continue
        Fs, Ft = canon(src, b), canon(tgt, b)
        s = np.ones(3)
        es, et = local_extent(body, Fs, b), local_extent(tgt_mesh, Ft, b)
        if es is not None and et is not None:
            ds, dt = es[1] - es[0], et[1] - et[0]
            s = np.clip(np.where(ds > 1e-6, dt / np.maximum(ds, 1e-6), g), 0.3 * g, 3 * g)
            s[1:] *= CLOTH
        else:
            s *= g
        c = MAIN_CHILD.get(b)
        if b in LIMB and c in src and c in tgt:
            s[0] = np.linalg.norm(tgt[c][:3, 3] - tgt[b][:3, 3]) / max(1e-6, np.linalg.norm(src[c][:3, 3] - src[b][:3, 3]))
        M[b] = Ft @ np.diag(list(s) + [1]) @ np.linalg.inv(Fs)
        print(f'  {b:10s} scale {np.round(s / g, 2)}', file=sys.stderr)
    out = dict(body)
    P = np.zeros_like(body['pos'])
    for i, (p, bs, ws) in enumerate(zip(body['pos'], body['bone'], body['w'])):
        acc, tot = np.zeros(3), 0
        for b, w in zip(bs, ws):
            if b is None or w <= 0 or b not in M:
                continue
            acc += w * (M[b][:3, :3] @ p + M[b][:3, 3]); tot += w
        P[i] = acc / tot if tot else p
    out['pos'] = P
    return out


def drop(m, test):
    """the mesh without the triangles any of whose corners test true (by dominant bone)"""
    bad = np.array([test(b[0]) for b in m['bone']])
    keep = ~bad[m['idx']].any(1)
    out = dict(m); out['idx'] = m['idx'][keep]; out['mat'] = [x for x, k in zip(m['mat'], keep) if k]
    return compact(out)


def take(m, test):
    """only the triangles all of whose corners test true"""
    good = np.array([test(b[0]) for b in m['bone']])
    keep = good[m['idx']].all(1)
    out = dict(m); out['idx'] = m['idx'][keep]; out['mat'] = [x for x, k in zip(m['mat'], keep) if k]
    return compact(out)


def compact(m):
    used = np.unique(m['idx'])
    remap = -np.ones(len(m['pos']), int); remap[used] = np.arange(len(used))
    out = {k: (v[used] if isinstance(v, np.ndarray) and len(v) == len(m['pos']) else v) for k, v in m.items()}
    out['idx'] = remap[m['idx']]
    return out


def boundary_loops(m):
    """open boundary loops (by position, so uv seams do not count as edges)"""
    key = {}
    pid = np.array([key.setdefault(tuple(np.round(p, 4)), len(key)) for p in m['pos']])
    E = {}
    for t in m['idx']:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            pa, pb = pid[a], pid[b]
            E.setdefault((min(pa, pb), max(pa, pb)), []).append((a, b))
    nxt = {}
    for (pa, pb), es in E.items():
        if len(es) == 1:
            a, b = es[0]
            nxt[pid[a]] = (pid[b], a, b)
    rep = {}
    for v, p in enumerate(pid):
        rep.setdefault(p, v)
    loops, seen = [], set()
    for s in list(nxt):
        if s in seen:
            continue
        loop, v = [], s
        while v in nxt and v not in seen:
            seen.add(v); loop.append(nxt[v][1]); v = nxt[v][0]
        if len(loop) >= 3:
            loops.append(loop)
    return loops


def components(m):
    """connected pieces (by position) of a mesh: an id per triangle"""
    key = {}
    pid = np.array([key.setdefault(tuple(np.round(p, 4)), len(key)) for p in m['pos']])
    par = list(range(len(key)))
    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]; a = par[a]
        return a
    for t in m['idx']:
        x, y, z = pid[t]
        par[find(x)] = find(y); par[find(y)] = find(z)
    return np.array([find(pid[t[0]]) for t in m['idx']])


def keep_tris(m, keep):
    out = dict(m); out['idx'] = m['idx'][keep]; out['mat'] = [x for x, k in zip(m['mat'], keep) if k]
    return compact(out)


def concat(parts):
    out = {'pos': [], 'nrm': [], 'uv': [], 'bone': [], 'w': [], 'idx': [], 'mat': []}
    off = 0
    for m in parts:
        for k in ('pos', 'nrm', 'uv', 'bone', 'w'):
            out[k].append(m[k])
        out['idx'].append(m['idx'] + off); out['mat'] += list(m['mat']); off += len(m['pos'])
    for k in ('pos', 'nrm', 'uv', 'w', 'idx'):
        out[k] = np.concatenate(out[k])
    out['bone'] = np.concatenate(out['bone'])
    return out


def loop_near(m, centre, exclude=()):
    best = None
    for L in boundary_loops(m):
        if any(v in exclude for v in L):
            continue
        d = np.linalg.norm(m['pos'][L].mean(0) - centre)
        if best is None or d < best[0]:
            best = (d, L)
    return best[1]


def bridge(m, A, B, axis, mat):
    """triangles joining loops A and B of mesh m (vertex ids), marched round `axis` by angle; faced outwards"""
    ax = axis / np.linalg.norm(axis)
    c = (m['pos'][A].mean(0) + m['pos'][B].mean(0)) / 2
    r1 = np.cross(ax, [0, 0, 1.0] if abs(ax[2]) < 0.9 else [1.0, 0, 0]); r1 /= np.linalg.norm(r1); r2 = np.cross(ax, r1)
    def angles(L):
        d = m['pos'][L] - c
        return np.arctan2(d @ r2, d @ r1)
    def prep(L):
        a = angles(L)
        if np.sum(np.diff(np.unwrap(np.r_[a, a[0]]))) < 0:   # make both run the same way round
            L = L[::-1]; a = a[::-1]
        i = int(np.argmin(np.mod(a, 2 * np.pi)))
        L = L[i:] + L[:i]
        a = np.mod(angles(L) - np.mod(angles(L)[0], 2 * np.pi) * 0, 2 * np.pi)
        a = np.unwrap(angles(L)); a = a - a[0] + np.mod(angles(L)[0], 2 * np.pi)
        return L, a
    A, aa = prep(list(A)); B, bb = prep(list(B))
    A2 = A + [A[0]]; aa = np.r_[aa, aa[0] + 2 * np.pi]
    B2 = B + [B[0]]; bb = np.r_[bb, bb[0] + 2 * np.pi]
    i = j = 0; tris = []
    while i < len(A) or j < len(B):
        if j >= len(B) or (i < len(A) and aa[i + 1] <= bb[j + 1]):
            tris.append([A2[i], A2[i + 1], B2[j]]); i += 1
        else:
            tris.append([A2[i], B2[j + 1], B2[j]]); j += 1
    tris = np.array(tris)
    # outwards: away from the axis
    P = m['pos']
    nrm = np.cross(P[tris[:, 1]] - P[tris[:, 0]], P[tris[:, 2]] - P[tris[:, 0]])
    mid = P[tris].mean(1) - c; mid -= np.outer(mid @ ax, ax)
    if np.sum(np.einsum('ij,ij->i', nrm, mid)) < 0:
        tris = tris[:, ::-1]
    out = dict(m); out['idx'] = np.concatenate([m['idx'], tris]); out['mat'] = list(m['mat']) + [mat] * len(tris)
    return out


def split_d(m, W, side):
    """the rig's fourth finger chain (D) carries the ring and little fingers as one: its geometry made into
    two thinner fingers forking at the knuckle (the little one shorter and a touch lower), both on chain D"""
    D = [side + 'FingerD%d' % k for k in (1, 2, 3)]
    o = W[D[0]][:3, 3]
    ax = W[D[2]][:3, 3] - o; length = np.linalg.norm(ax) * 1.6; ax /= np.linalg.norm(ax)
    lat = W[side + 'FingerC1'][:3, 3] - o; lat -= ax * (lat @ ax); lat /= np.linalg.norm(lat)   # towards the middle finger
    up = np.cross(ax, lat)
    isd = np.array([b[0] in D for b in m['bone']])
    rel = m['pos'] - o
    sa, sl, su = rel @ ax, rel @ lat, rel @ up
    width = np.ptp(sl[isd & (sa > 0)])
    # split down to the web, where the middle finger parts from its neighbours (its own vertices begin there)
    isc = np.array([b[0] == side + 'FingerC1' for b in m['bone']])
    web = np.percentile(((m['pos'][isc] - o) @ ax), 3) if isc.any() else 0.0
    t = np.clip((sa - (web - 0.06 * length)) / (0.06 * length), 0, 1) * isd   # 0 in the palm, 1 from the web on
    def shape(k_len, centre, drop):
        sl2 = sl + (sl * 0.48 + centre * width - sl) * t
        sa2 = sa + (np.maximum(sa, 0) * (k_len - 1)) * t
        su2 = su - drop * width * t
        return o + np.outer(sa2, ax) + np.outer(sl2, lat) + np.outer(su2, up)
    ring = shape(0.97, 0.26 - np.mean(sl[isd & (sa > 0)]) / width * 0, 0.0)
    pinky = shape(0.84, -0.26, 0.08)
    # centre the pair on the old finger's middle line
    mid = np.mean(sl[isd & (sa > 0)])
    ring = o + np.outer(sa + (np.maximum(sa, 0) * (0.97 - 1)) * t, ax) + np.outer(sl + ((sl - mid) * 0.44 + mid + 0.28 * width - sl) * t, lat) + np.outer(su, up)
    pinky = o + np.outer(sa + (np.maximum(sa, 0) * (0.84 - 1)) * t, ax) + np.outer(sl + ((sl - mid) * 0.44 + mid - 0.28 * width - sl) * t, lat) + np.outer(su - 0.08 * width * t, up)
    moved = t > 0
    out = dict(m)
    P = m['pos'].copy(); P[moved] = ring[moved]
    # the little finger: copies of the moved vertices, the triangles touching them copied onto those
    cp = np.where(moved)[0]; newid = -np.ones(len(P), int); newid[cp] = len(P) + np.arange(len(cp))
    out['pos'] = np.concatenate([P, pinky[cp]])
    for k in ('nrm', 'uv', 'w'):
        out[k] = np.concatenate([m[k], m[k][cp]])
    out['bone'] = np.concatenate([m['bone'], m['bone'][cp]])
    touch = moved[m['idx']].any(1)
    dup = m['idx'][touch].copy()
    dup = np.where(moved[dup], newid[dup], dup)
    out['idx'] = np.concatenate([m['idx'], dup]); out['mat'] = list(m['mat']) + [m['mat'][i] for i in np.where(touch)[0]]
    return out


def close_skull(m, keep_lowest=True):
    """holes in the head where hair was (no scalp under it) filled: rings drawn in from the hole's edge,
    put on a sphere fitted to the scalp round it"""
    loops = sorted(boundary_loops(m), key=lambda L: m['pos'][L][:, 1].mean())
    if keep_lowest:
        loops = loops[1:]   # the neck's opening, bridged to the body later
    for L in loops:
        if len(L) < 5:
            continue
        P = m['pos']
        ring = P[L]; c0 = ring.mean(0)
        # the scalp near the hole: vertices within twice its radius
        r0 = np.linalg.norm(ring - c0, axis=1).mean()
        near = P[np.linalg.norm(P - c0, axis=1) < 2.5 * r0]
        A = np.c_[2 * near, np.ones(len(near))]; b = (near ** 2).sum(1)
        sol = np.linalg.lstsq(A, b, rcond=None)[0]; sc = sol[:3]; sr = np.sqrt(sol[3] + sc @ sc)
        R = max(3, int(np.ceil(r0 / (np.linalg.norm(np.diff(ring, axis=0), axis=1).mean() + 1e-9))))
        ids = [list(L)]; newP = []; base = len(P)
        for k in range(1, R):
            t = k / R
            pts = ring + (c0 - ring) * t
            d = pts - sc; pts = sc + d / np.linalg.norm(d, axis=1, keepdims=True) * sr
            ids.append(list(range(base + len(newP), base + len(newP) + len(L)))); newP += list(pts)
        d = c0 - sc; tip = sc + d / np.linalg.norm(d) * sr
        tip_id = base + len(newP); newP.append(tip)
        tris = []
        for k in range(len(ids) - 1):
            a, b2 = ids[k], ids[k + 1]
            for i in range(len(L)):
                j = (i + 1) % len(L)
                tris += [[a[i], a[j], b2[j]], [a[i], b2[j], b2[i]]]
        last = ids[-1]
        tris += [[last[i], last[(i + 1) % len(L)], tip_id] for i in range(len(L))]
        tris = np.array(tris)
        n_new = len(newP)
        # attributes of the new vertices: the nearest edge vertex's
        src = [L[0]] * n_new
        newP = np.array(newP)
        for q, p in enumerate(newP):
            src[q] = L[int(np.argmin(np.linalg.norm(ring - p, axis=1)))]
        out = dict(m)
        out['pos'] = np.concatenate([P, newP])
        for k in ('nrm', 'uv', 'w'):
            out[k] = np.concatenate([m[k], m[k][src]])
        out['nrm'][len(P):] = (newP - sc) / sr
        out['bone'] = np.concatenate([m['bone'], m['bone'][src]])
        nrm = np.cross(out['pos'][tris[:, 1]] - out['pos'][tris[:, 0]], out['pos'][tris[:, 2]] - out['pos'][tris[:, 0]])
        if np.sum(np.einsum('ij,ij->i', nrm, out['pos'][tris].mean(1) - sc)) < 0:
            tris = tris[:, ::-1]
        out['idx'] = np.concatenate([m['idx'], tris]); out['mat'] = list(m['mat']) + [m['mat'][0]] * len(tris)
        m = out
        print('  closed a hole of', len(L), 'edges', file=sys.stderr)
    return m


def subdivide(m, levels=1):
    """Loop subdivision (positions smoothed over the surface by position, so uv seams stay closed;
    uv, normals and weights interpolated)"""
    for _ in range(levels):
        P = m['pos']; n = len(P)
        key = {}
        pid = np.array([key.setdefault(tuple(np.round(p, 5)), len(key)) for p in P])
        npid = len(key)
        # position-level neighbours and boundary edges
        E = {}
        for t in m['idx']:
            for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
                k = (min(pid[a], pid[b]), max(pid[a], pid[b]))
                E.setdefault(k, set()).update((t[0], t[1], t[2]))
        nb = [set() for _ in range(npid)]
        for (a, b) in E:
            nb[a].add(b); nb[b].add(a)
        rep = np.zeros((npid, 3))
        cnt = np.zeros(npid)
        for v in range(n):
            rep[pid[v]] = P[v]
        # new edge points
        mids = {}
        newpos, src = [], []
        def opp(a, b):
            # the far corners of the triangles sharing edge a-b (by position)
            k = (min(pid[a], pid[b]), max(pid[a], pid[b]))
            return [v for v in E[k] if pid[v] not in k]
        def mid(a, b):
            k = (min(a, b), max(a, b))
            if k in mids:
                return mids[k]
            o = opp(a, b)
            ops = {pid[v]: P[v] for v in o}
            if len(ops) == 2:
                p = 0.375 * (P[a] + P[b]) + 0.125 * sum(ops.values())
            else:
                p = 0.5 * (P[a] + P[b])
            mids[k] = n + len(newpos); newpos.append(p); src.append((a, b))
            return mids[k]
        tris = []
        for t in m['idx']:
            a, b, c = t
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            tris += [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]
        # even points
        even = P.copy()
        for q in range(npid):
            k = len(nb[q])
            if k < 3:
                continue
            beta = 3 / 16 if k == 3 else 3 / (8 * k)
            s = sum(rep[j] for j in nb[q])
            rep_new = rep[q] * (1 - k * beta) + beta * s
            cnt[q] = 1; rep[q] = rep_new if False else rep[q]
            even_q = rep_new
            even[pid == q] = even_q
        out = {}
        sa = np.array([s[0] for s in src]); sb = np.array([s[1] for s in src])
        out['pos'] = np.concatenate([even, np.array(newpos)])
        for k in ('nrm', 'uv'):
            out[k] = np.concatenate([m[k], (m[k][sa] + m[k][sb]) / 2])
        # weights: the two ends' blended (as bone -> weight), the four strongest kept
        bones, ws = [], []
        for a, b in src:
            d = {}
            for bb, ww in zip(m['bone'][a], m['w'][a]):
                if bb is not None and ww > 0:
                    d[bb] = d.get(bb, 0) + ww / 2
            for bb, ww in zip(m['bone'][b], m['w'][b]):
                if bb is not None and ww > 0:
                    d[bb] = d.get(bb, 0) + ww / 2
            top = sorted(d.items(), key=lambda x: -x[1])[:4]
            tot = sum(w for _, w in top)
            bones.append([x for x, _ in top] + [None] * (4 - len(top))); ws.append([w / tot for _, w in top] + [0] * (4 - len(top)))
        out['bone'] = np.concatenate([m['bone'], np.array(bones, object)])
        out['w'] = np.concatenate([m['w'], np.array(ws)])
        out['idx'] = np.array(tris); out['mat'] = [x for x in m['mat'] for _ in range(4)]
        m = out
    return m


def smooth_normals(m):
    key = {}
    pid = np.array([key.setdefault(tuple(np.round(p, 5)), len(key)) for p in m['pos']])
    acc = np.zeros((len(key), 3))
    P = m['pos']; I = m['idx']
    fn = np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]])
    for k in range(3):
        np.add.at(acc, pid[I[:, k]], fn)
    n = acc[pid]
    m['nrm'] = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return m


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
    body_smd, tgt_smd, out = args
    ash_path = opt.get('ash', os.path.join(os.path.dirname(__file__), '../../web/world/local/ash.glb'))
    S, T = read_smd(body_smd), read_smd(tgt_smd)
    src_w, tgt_w0 = bone_world(S), bone_world(T)
    # the body in its Origin frame; the target in its Origin frame, in output units
    So = np.linalg.inv(S['world'][[k for k, v in S['bones'].items() if v[0] == 'Origin'][0]])
    To = np.linalg.inv(T['world'][[k for k, v in T['bones'].items() if v[0] == 'Origin'][0]])
    U = np.diag([S_OUT, S_OUT, S_OUT, 1.0])
    tgt_w = {n: U @ w for n, w in tgt_w0.items()}
    for n, w in tgt_w.items():
        w[:3, :3] /= S_OUT
    body = to_frame(weld(flatten(S)), So)
    tmesh = to_frame(weld(flatten(T)), U @ To)
    # 1. the body, minus head, neck and hands, carried onto the target's skeleton
    body = drop(body, lambda b: b in ('Head', 'Neck', 'LHand', 'RHand', 'LHandEX', 'RHandEX') or (b or '').startswith('loc_'))
    body = carry(body, src_w, tgt_w, tmesh)
    # 2. the target's head and neck (its biggest piece with the head's texture, no hair, no goggles or earrings:
    #    smaller pieces only on the head bone), and its hands (the pieces with fingers)
    comp = components(tmesh)
    hmat = np.array(['head' in x.lower() for x in tmesh['mat']])
    sizes = {c: int((comp == c).sum()) for c in np.unique(comp[hmat])}
    main_c = max(sizes, key=sizes.get)
    def bones_of(c):
        return set(b for t in tmesh['idx'][comp == c] for v in t for b in tmesh['bone'][v] if b)
    head_c = [c for c in sizes if c == main_c or any(b.startswith('FJ') for b in bones_of(c))]
    head = keep_tris(tmesh, np.isin(comp, head_c) & np.array(['hair' not in x.lower() for x in tmesh['mat']]))
    head = close_skull(head)
    hand_c = [c for c in np.unique(comp) if any('Finger' in b for b in bones_of(c))]
    hands = keep_tris(tmesh, np.isin(comp, hand_c))
    hands = split_d(split_d(hands, tgt_w, 'L'), tgt_w, 'R')
    print('body', len(body['idx']), 'head', len(head['idx']), 'hands', len(hands['idx']), file=sys.stderr)
    # 3. one mesh, the seams bridged (neck: the body's opening and the head's lowest; wrists)
    allm = concat([body, head, hands])
    nb, nh = len(body['pos']), len(head['pos'])
    bodyv = set(range(nb)); headv = set(range(nb, nb + nh)); handv = set(range(nb + nh, len(allm['pos'])))
    skin = body['mat'][0] if 'body' in body['mat'][0] else body['mat'][-1]
    loops = boundary_loops(allm)
    def nearest(vs, centre):
        best = None
        for L in loops:
            if not set(L) <= vs:
                continue
            d = np.linalg.norm(allm['pos'][L].mean(0) - centre)
            if best is None or d < best[0]:
                best = (d, L)
        return best[1]
    neckB = nearest(bodyv, tgt_w['Neck'][:3, 3]); neckH = min((L for L in loops if set(L) <= headv), key=lambda L: allm['pos'][L][:, 1].mean())
    allm = bridge(allm, neckB, neckH, np.array([0, 1.0, 0]), skin)
    for side in 'LR':
        w = tgt_w[side + 'Hand'][:3, 3]
        A = nearest(bodyv, w); B = nearest(handv, w)
        allm = bridge(allm, A, B, w - tgt_w[side + 'ForeArm'][:3, 3], skin)
    allm = smooth_normals(subdivide(allm, int(opt.get('subdiv', 1))))
    src_of = {m: body_smd for m in body['mat']}
    src_of.update({m: tgt_smd for m in head['mat'] + hands['mat']})
    write_parts(out, ash_path, tgt_w, [('doll', allm, src_of)])


def write_parts(out, ash_path, tgt_w, parts):
    g, acc, image = read_glb(ash_path)
    N = g['nodes']; joints = g['skins'][0]['joints']
    names = [N[j]['name'] for j in joints]
    par = {c: i for i, nd in enumerate(N) for c in nd.get('children', [])}
    jparent = [joints.index(par[j]) if par.get(j) in joints else -1 for j in joints]
    # Ash's rest rotations (world), his joints moved to the target's (bones the target lacks keep Ash's offset
    # from their parent, scaled by the parent's change)
    aw = {}
    for i, j in enumerate(joints):
        m = node_local(N[j]); aw[i] = (aw[jparent[i]] @ m) if jparent[i] >= 0 else m
    # the target's frame is Y up, facing +z like Ash's
    pos = {}
    for i, n in enumerate(names):
        if n in tgt_w:
            pos[i] = tgt_w[n][:3, 3]
        elif jparent[i] >= 0:
            p = jparent[i]
            off = aw[i][:3, 3] - aw[p][:3, 3]
            pos[i] = pos[p] + off * 1.0
        else:
            pos[i] = np.zeros(3)
    bones = []
    wr = {}
    for i, n in enumerate(names):
        R = aw[i][:3, :3] / np.linalg.norm(aw[i][:3, 0])
        wr[i] = R
        if jparent[i] >= 0:
            p = jparent[i]
            t = wr[p].T @ (pos[i] - pos[p]); q = mat_quat(wr[p].T @ R)
        else:
            t = pos[i]; q = mat_quat(R)
        bones.append({'name': n, 'parent': jparent[i], 't': t, 'q': q})
    meshes, images = [], []
    for name, m, src in parts:
        for mat in sorted(set(m['mat'])):
            sel = np.array([x == mat for x in m['mat']])
            sub = dict(m); sub['idx'] = m['idx'][sel]; sub['mat'] = [mat] * int(sel.sum()); sub = compact(sub)
            J = np.zeros((len(sub['pos']), 4), int); W = np.zeros((len(sub['pos']), 4))
            for v, (bs, ws) in enumerate(zip(sub['bone'], sub['w'])):
                k = 0
                for b, w in zip(bs, ws):
                    if b is None or w <= 0:
                        continue
                    nb = b
                    while nb not in names:
                        nb = {'Collar': 'Spine3', 'Spine2': 'Spine2'}.get(nb, 'Spine3')
                    J[v, k] = names.index(nb); W[v, k] = w; k += 1
                if W[v].sum() == 0:
                    W[v, 0] = 1; J[v, 0] = names.index('Spine3')
                W[v] /= W[v].sum()
            png = find_png(src[mat] if isinstance(src, dict) else src, mat)
            img = None
            if png:
                images.append(open(png, 'rb').read()); img = len(images) - 1
            n = sub['nrm'] / np.maximum(np.linalg.norm(sub['nrm'], axis=1, keepdims=True), 1e-9)
            meshes.append({'name': f'{name}_{os.path.splitext(mat)[0]}', 'pos': sub['pos'], 'nrm': n, 'uv': sub['uv'], 'joints': J, 'weights': W,
                           'idx': sub['idx'], 'image': img})
    write_glb(out, bones, meshes, images)
    print('wrote', out, sum(len(m['idx']) for m in meshes), 'triangles', file=sys.stderr)


def find_png(src, mat):
    d = os.path.dirname(src)
    base = mat.replace('Mat', '')
    for root in (d, os.path.join(d, 'images'), os.path.join(d, '..', 'images')):
        for cand in (base, base + '.png', mat):
            p = os.path.join(root, cand)
            if os.path.isfile(p):
                return p
    for root, _, files in os.walk(os.path.join(d, '..')):
        for f in files:
            if f in (base, base + '.png'):
                return os.path.join(root, f)
    return None


if __name__ == '__main__':
    main()
