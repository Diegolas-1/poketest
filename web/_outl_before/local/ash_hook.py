# Ash Ketchum's outfit for the Calem base: every garment texture is repainted
# from the 3D position of each texel (the UVs are mirrored half-body islands, so
# the outfit is defined in model space: metres, Y up, facing +Z, left = +X),
# a few vertices are moved (cap brim, bare forearms, rolled jeans cuffs), and
# extra pieces are modelled and skinned (hair spikes, sleeve hems, cap button,
# the C logo). Called by smd2glb.py --hook.
import io, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def hx(c): return np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255
COL = dict(red=hx('#e0383a'), redd=hx('#b02a30'), white=hx('#f7f6f1'), green=hx('#2fa24f'), shirt=hx('#1d2a26'),
           jacket=hx('#2f63c9'), jacketd=hx('#244ea6'), yellow=hx('#f5c433'), glove=hx('#36a24e'), glove2=hx('#2b8a42'),
           jeans=hx('#6f9fdc'), jeansd=hx('#5583c4'), cuff=hx('#dfe9f6'), belt=hx('#c8343a'), buckle=hx('#e9e4d0'),
           shoe=hx('#2f5fc4'), shoed=hx('#244a9e'), skin=hx('#f9d2b4'), hair=hx('#1f1a26'), ink=hx('#2a2430'), grey=hx('#9aa0aa'))
SAVE = {}

def raster(UV, T, w, h):
    """texel index, triangle, barycentrics for every texel centre inside a triangle (slightly grown)"""
    pix, tri, bar = [], [], []
    U = UV * np.array([w, h])
    for t, (a, b, c) in enumerate(T):
        A, B, C = U[a], U[b], U[c]
        x0, y0 = np.floor(np.minimum(np.minimum(A, B), C) - 1).astype(int); x1, y1 = np.ceil(np.maximum(np.maximum(A, B), C) + 1).astype(int)
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1)); X = xs.ravel() + 0.5; Y = ys.ravel() + 0.5
        d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1])
        if abs(d) < 1e-12: continue
        l0 = ((B[1] - C[1]) * (X - C[0]) + (C[0] - B[0]) * (Y - C[1])) / d
        l1 = ((C[1] - A[1]) * (X - C[0]) + (A[0] - C[0]) * (Y - C[1])) / d
        l2 = 1 - l0 - l1
        tol = -0.8 / max(1.0, np.ptp([A[0], B[0], C[0]]) + np.ptp([A[1], B[1], C[1]]))
        m = (l0 >= tol) & (l1 >= tol) & (l2 >= tol)
        xi, yi = xs.ravel()[m] % w, ys.ravel()[m] % h
        L = np.clip(np.stack([l0[m], l1[m], l2[m]], 1), 0, 1); L /= L.sum(1, keepdims=True)
        pix.append(yi * w + xi); tri.append(np.full(m.sum(), t)); bar.append(L)
    return np.concatenate(pix), np.concatenate(tri), np.concatenate(bar)

def paint(P, N, UV, T, texpath, k, fn, detail=0.0):
    src = Image.open(texpath).convert('RGB'); w, h = src.size[0] * k, src.size[1] * k
    orig = np.asarray(src.resize((w, h), Image.BILINEAR), np.float32) / 255
    out = orig.reshape(-1, 3).copy(); cov = np.zeros(w * h, bool)
    pix, tri, bar = raster(UV, T, w, h)
    tv = T[tri]
    pos = (P[tv] * bar[:, :, None]).sum(1); nrm = (N[tv] * bar[:, :, None]).sum(1)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
    o = orig.reshape(-1, 3)[pix]
    col = fn(pos, nrm, o, tri)
    if detail:   # keep a little of the original folds and seams
        lum = orig.reshape(-1, 3) @ np.array([.3, .59, .11])
        blur = np.asarray(Image.fromarray((lum.reshape(h, w) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3 * k)), np.float32).ravel() / 255
        r = np.clip(lum[pix] / np.maximum(blur[pix], 0.05), 0.82, 1.12)
        col = col * (1 + (r[:, None] - 1) * detail)
    out[pix] = col; cov[pix] = True
    img = out.reshape(h, w, 3); cv = cov.reshape(h, w)
    for _ in range(6 * k):   # bleed into the gutters so filtering never picks up old colours
        if cv.all(): break
        nb = np.zeros_like(img); cnt = np.zeros((h, w))
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sh = np.roll(np.roll(img, dy, 0), dx, 1); sc = np.roll(np.roll(cv, dy, 0), dx, 1)
            nb += sh * sc[..., None]; cnt += sc
        grow = (~cv) & (cnt > 0); img[grow] = nb[grow] / cnt[grow][:, None]; cv = cv | grow
    return png(np.clip(img, 0, 1))

def png(img, mode='RGB'):
    b = io.BytesIO(); Image.fromarray((img * 255).round().astype(np.uint8), mode).save(b, 'PNG', optimize=True); return b.getvalue()

def mixc(a, b, t): t = np.clip(t, 0, 1)[:, None]; return a * (1 - t) + b * t
def band(v, lo, hi, s=0.0015): return np.clip((v - lo) / s + 0.5, 0, 1) * np.clip((hi - v) / s + 0.5, 0, 1)
def where(m, c, base): m = np.asarray(m, np.float32); return mixc(base, np.broadcast_to(c, base.shape), m)
def noise(pos, f, seed=0):
    p = pos * f + seed
    return (np.sin(p[:, 0] * 12.9898 + p[:, 1] * 78.233 + p[:, 2] * 37.719) * 43758.5453) % 1

# ---------- garments ----------
def top(P, N, UV, T, tp):
    ax = np.abs(P[:, 0])
    # bare forearms: Calem's sleeve is thick; slim the arm past Ash's short sleeve toward the bone
    arm = (ax > 0.215) & (P[:, 1] > 0.9)
    k = np.clip((ax - 0.215) / 0.04, 0, 1) * np.clip((0.44 - ax) / 0.03, 0, 1)
    s = 1 - 0.22 * k
    P = P.copy(); P[arm, 1] = 1.029 + (P[arm, 1] - 1.029) * s[arm]; P[arm, 2] = -0.004 + (P[arm, 2] + 0.004) * s[arm]
    ring = arm | ((ax > 0.19) & (P[:, 1] > 0.9))
    sel = (ax > 0.16) & (ax < 0.27) & (P[:, 1] > 0.9)
    SAVE['armR'] = float(np.median(np.hypot(P[sel, 1] - 1.029, P[sel, 2] + 0.004))); print('armR', SAVE['armR'])
    # drop Calem's zip pull (a little disc at the throat): fold it flat behind the collar
    hv = np.where((UV[:, 0] > 0.88) & (UV[:, 1] > 0.55) & (np.abs(P[:, 0]) < 0.025) & (P[:, 1] > 1.045) & (P[:, 2] > 0.035))[0]
    print('zip pull verts', len(hv))
    if len(hv): P[hv] = [0, 1.07, 0.03]
    # a lower collar: Ash's stands up at the back and opens at the front
    col = (ax < 0.13) & (P[:, 1] > 1.035)
    f = np.clip(0.85 - np.clip(P[:, 2] / 0.06, 0, 1) * 0.6, 0.25, 0.85)
    P[col, 1] = 1.035 + (P[col, 1] - 1.035) * f[col]
    def fn(pos, nrm, o, tri):
        x, y, z = pos.T; ax = np.abs(x)
        c = np.broadcast_to(COL['jacket'], pos.shape).copy()
        isarm = (ax > 0.13) & (y > 0.93)
        body = ~isarm
        # open front: the black T-shirt shows between the jacket's front edges
        half = 0.028 + np.clip(1.0 - y, 0, 0.3) * 0.1
        opening = body & (z > 0.02) & (ax < half)
        edge = body & (z > 0.02) & (np.abs(ax - half) < 0.004)
        c = where(opening, COL['shirt'], c)
        c = where(edge & (y > 0.72), COL['jacketd'], c)
        # T-shirt crew neck under the open collar
        # white collar: the high neck turns into Ash's white collar, open at the front
        coll = body & (y > 1.028)
        c = where(coll, COL['white'], c)
        c = where(coll & (z > 0.02) & (ax < 0.034 - (y - 1.028) * 0.8), COL['shirt'], c)
        c = where(body & (y > 1.024) & (y < 1.03) & ~((z > 0.03) & (ax < 0.03)), COL['grey'] * 0.9 + 0.1, c)
        # yellow hem band and the yellow pocket line on each side of the front
        hem = body & (y < 0.735) & ~opening
        c = where(hem, COL['yellow'], c)
        c = where(body & ~opening & (y >= 0.735) & (y < 0.739), COL['jacketd'], c)
        pk = body & (z > 0.03) & ~opening & ~edge & (ax > half + 0.012) & (ax < 0.1) & (np.abs(y - 0.81) < 0.0055)
        c = where(pk, COL['yellow'], c)
        # red belt at the open front, with its buckle
        bel = opening & (y < 0.728)
        c = where(bel, COL['belt'], c)
        c = where(bel & (ax < 0.011) & (y > 0.705) & (y < 0.722), hx('#c9ccd2'), c)
        c = where(bel & (ax < 0.006) & (y > 0.709) & (y < 0.718), hx('#7d828c'), c)
        # arms: short white sleeves (a fold line near the hem), skin, green fingerless gloves with white cuffs
        sl = isarm & (ax < 0.215)
        c = where(sl, COL['white'], c)
        c = where(isarm & (ax > 0.13) & (ax < 0.142), COL['white'] * 0.88, c)   # shoulder seam
        c = where(isarm & (ax > 0.2) & (ax < 0.204), COL['white'] * 0.86, c)   # hem fold
        c = where(isarm & (ax >= 0.215), COL['skin'], c)
        gl = isarm & (ax > 0.418)
        c = where(gl & (ax < 0.44), COL['white'], c)
        c = where(gl & (ax >= 0.44) & (ax < 0.528), COL['glove'], c)
        c = where(gl & (ax >= 0.44) & (ax < 0.528) & (y > 1.038), COL['glove2'], c)   # back-of-hand panel
        c = where(gl & (ax >= 0.526) & (ax < 0.532), COL['glove2'] * 0.8, c)          # finger hole rims
        # fold shading: a touch darker under the arms and at the back
        c = c * (1 - 0.06 * (body & (z < -0.04)))[:, None]
        return c
    return P, paint(P, N, UV, T, tp, 4, fn, detail=0.5)

def bottoms(P, N, UV, T, tp):
    def fn(pos, nrm, o, tri):
        x, y, z = pos.T
        c = np.broadcast_to(COL['jeans'], pos.shape).copy()
        n = noise(pos, 300) - 0.5
        c = c * (1 + 0.04 * n)[:, None]
        lx = np.abs(x) - 0.056
        # side seams and the front fly, in a darker blue
        c = where((np.abs(np.abs(lx) - 0.05) < 0.0016) & (y < 0.65), COL['jeansd'], c)
        c = where((np.abs(x) < 0.003) & (z > 0) & (y > 0.6), COL['jeansd'], c)
        c = where((np.abs(lx + 0.018) < 0.0016) & (z > 0) & (y > 0.62) & (y < 0.67), COL['jeansd'], c)   # front pocket line
        c = where((y > 0.7), COL['belt'], c)   # belt, under the jacket
        return c
    return P, paint(P, N, UV, T, tp, 4, fn, detail=0.55)

def shoes(P, N, UV, T, tp):
    # boots become: jeans down to a white rolled cuff, then low sneakers
    P = P.copy(); y = P[:, 1]; cx = np.sign(P[:, 0]) * 0.056
    k = band(y, 0.118, 0.17, 0.02) * 0.1
    P[:, 0] = cx + (P[:, 0] - cx) * (1 + k); P[:, 2] = 0.0 + (P[:, 2] - 0.0) * (1 + k)
    def fn(pos, nrm, o, tri):
        x, y, z = pos.T; lx = x - np.sign(x) * 0.056
        c = np.broadcast_to(COL['shoe'], pos.shape).copy()
        c = where(y > 0.165, COL['jeans'], c)
        cuff = (y > 0.115) & (y <= 0.165)
        c = where(cuff, COL['cuff'], c)
        c = where(cuff & (np.abs(y - 0.14) < 0.002), COL['cuff'] * 0.86, c)
        c = where(np.abs(y - 0.1155) < 0.0025, COL['cuff'] * 0.8, c)
        sh = y <= 0.115
        c = where(sh & (y < 0.032), COL['white'], c)                              # sole
        c = where(sh & (y < 0.034) & (y > 0.029), COL['grey'], c)
        c = where(sh & (z > 0.075) & (y < 0.07), COL['white'], c)                   # toe cap
        c = where(sh & (np.abs(y - 0.05) < 0.006) & (z < 0.075), COL['white'], c)   # side band
        c = where(sh & (z > 0.02) & (z < 0.08) & (np.abs(lx) < 0.022) & (y > 0.06), COL['white'], c)   # laces panel
        lace = sh & (z > 0.02) & (z < 0.08) & (np.abs(lx) < 0.022) & (y > 0.06) & ((((z - 0.02) / 0.012) % 1) < 0.3)
        c = where(lace, COL['grey'], c)
        c = where(sh & (z < -0.035) & (np.abs(lx) < 0.016) & (y > 0.04), COL['red'], c)   # red heel tab
        c = where(sh & (y > 0.104), COL['shoed'], c)   # collar
        return c
    return P, paint(P, N, UV, T, tp, 4, fn, detail=0.3)

def hat(P, N, UV, T, tp):
    P = P.copy(); x, y, z = P.T
    # Ash's cap has a longer, rounder brim: stretch the brim forward and curve its corners down
    brim = (z > 0.085) & (y < 1.262)
    t = np.clip((z - 0.085) / 0.07, 0, 1)
    P[brim, 2] = 0.085 + (z[brim] - 0.085) * 1.35
    P[brim, 1] = y[brim] - (t[brim] * 0.006 + (x[brim] / 0.1) ** 2 * 0.012 * t[brim])
    P[brim, 0] = x[brim] * (1 + 0.08 * t[brim])
    SAVE['hat'] = (P, T)
    def fn(pos, nrm, o, tri):
        x, y, z = pos.T
        c = np.broadcast_to(COL['red'], pos.shape).copy()
        isbrim = (z > 0.082) & (y < 1.27) & (np.abs(nrm[:, 1]) > 0.5)
        front = (z > 0.035) & ~isbrim & (y > 1.235)
        c = where(front, COL['white'], c)
        c = where(~isbrim & ~front & (np.abs(x) < 0.0025) & (y > 1.27), COL['redd'], c)    # centre seam
        c = where(isbrim & (nrm[:, 1] < 0), COL['redd'], c)                       # under the brim
        return c
    return P, paint(P, N, UV, T, tp, 8, fn, detail=0.25)

def hair(P, N, UV, T, tp):
    src = np.asarray(Image.open(tp).convert('RGB'), np.float32) / 255
    lum = src @ np.array([.3, .59, .11]); l = (lum - lum.min()) / (np.ptp(lum) + 1e-6)
    dark, hi = hx('#141219'), hx('#3d4058')
    img = dark * (1 - l[..., None]) + hi * l[..., None]
    SAVE['hair'] = (P, T)
    return P, png(np.clip(img, 0, 1))

def face(P, N, UV, T, tp):
    # Ash's zigzag cheek marks
    def fn(pos, nrm, o, tri):
        x, y, z = pos.T; ax = np.abs(x)
        pts = np.array([[-0.009, 0.004], [0.004, 0.0035], [-0.003, -0.002], [0.009, -0.003]]) + [0.046, 1.149]
        d = np.full(len(pos), 1.0)
        q = np.stack([ax, y], 1)
        for a, b in zip(pts[:-1], pts[1:]):
            ab = b - a; t = np.clip(((q - a) @ ab) / (ab @ ab), 0, 1); d = np.minimum(d, np.linalg.norm(q - (a + t[:, None] * ab), axis=1))
        m = np.clip((0.0011 - d) / 0.0004 + 0.5, 0, 1) * (z > 0.04) * (nrm[:, 2] > 0.2)
        o = np.clip(o * np.array([1.0, 0.955, 0.9]) + [0.0, 0.0, -0.01], 0, 1)   # a warmer, sunnier skin than Calem's
        return mixc(o, np.broadcast_to(hx('#8a4a3a'), o.shape), m)
    return P, paint(P, N, UV, T, tp, 8, fn)

def eyes(P, N, UV, T, tp):
    src = np.asarray(Image.open(tp).convert('RGB'), np.float32) / 255
    r, g, b = src[..., 0], src[..., 1], src[..., 2]
    blue = np.clip((b - r) * 3, 0, 1)[..., None]   # Calem's blue irises -> Ash's warm dark brown
    lum = (src @ np.array([.3, .59, .11]))[..., None]
    brown = np.clip(hx('#3a2418') + (lum - 0.3) * hx('#b07a50') * 1.4, 0, 1)
    return P, png(src * (1 - blue) + brown * blue)

def hook(key, P, N, UV, T, J, WT, jn, tp):
    if key in ('bagbag', 'pointglasses', 'bangle01'): return None
    f = {'topsjer': top, 'btmsskin': bottoms, 'shoessboots': shoes, 'hathun': hat, 'hair01_on': hair, 'face_on_1': face, 'face_on_0': eyes}[key]
    P2, img = f(P.copy(), N, UV, T, tp)
    if key == 'face_on_1': SAVE['jn'] = jn
    return P2, N, img

# ---------- modelled extras ----------
PAL = ['hair', 'white', 'red', 'jacket', 'green', 'cuff']
def pal_uv(name, v=0.5): return [(PAL.index(name) + 0.5) / len(PAL), v]
def palette():
    w = len(PAL) * 8; img = np.zeros((32, w, 3), np.float32)
    for i, n in enumerate(PAL):
        for r in range(32):
            t = r / 31
            c = COL[n] if n != 'hair' else hx('#3a3d54') * (1 - t) + hx('#121017') * t   # hair: lit root to dark tip
            img[r, i * 8:(i + 1) * 8] = c
    return png(img)

def ray_hit(o, d, P, T):
    A, B, C = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]; e1, e2 = B - A, C - A
    pv = np.cross(d, e2); det = e1 @ np.zeros(3) if False else np.einsum('ij,ij->i', e1, pv)
    ok = np.abs(det) > 1e-12; inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
    tv = o - A; u = np.einsum('ij,ij->i', tv, pv) * inv; qv = np.cross(tv, e1); v = (qv @ d) * inv; t = np.einsum('ij,ij->i', e2, qv) * inv
    m = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
    if not m.any(): return None
    i = np.argmin(np.where(m, t, 1e9)); n = np.cross(e1[i], e2[i]); n /= np.linalg.norm(n)
    return o + d * t[i], (n if n @ d < 0 else -n)

def extras(jn, W):
    out = []
    head = jn.index('Head')
    P, N, UV, I = [], [], [], []
    def add(p, n, uv, tris, base):
        I.extend((np.array(tris) + len(P)).tolist()); P.extend(p); N.extend(n); UV.extend(uv)
    def spike(root, d, length, rw, rh, bend, col='hair', seg=4, sides=7):
        d = np.array(d, float); d /= np.linalg.norm(d)
        up = np.array([0, 1, 0.]); sx = np.cross(d, up); sx /= np.linalg.norm(sx) + 1e-9; sy = np.cross(sx, d)
        pts, nrm, uv, tris = [], [], [], []
        for i in range(seg + 1):
            t = i / seg; r = (1 - t) ** 1.25
            c = np.array(root) + d * length * t - sy * bend * t * t
            for j in range(sides):
                a = j / sides * 2 * math.pi
                off = sx * math.cos(a) * rw * r + sy * math.sin(a) * rh * r
                pts.append(c + off); n = sx * math.cos(a) / rw + sy * math.sin(a) / rh; nrm.append(n / np.linalg.norm(n)); uv.append(pal_uv(col, 0.1 + 0.85 * t))
        tip = np.array(root) + d * length * 1.12 - sy * bend * 1.2
        for i in range(seg):
            for j in range(sides):
                a, b = i * sides + j, i * sides + (j + 1) % sides
                tris += [[a, a + sides, b], [b, a + sides, b + sides]]
        k = len(pts); pts.append(tip); nrm.append(d); uv.append(pal_uv(col, 0.97))
        for j in range(sides): tris.append([seg * sides + j, k, seg * sides + (j + 1) % sides])
        add(pts, nrm, uv, tris, None)
    c0 = np.array([0, 1.2, -0.01])
    # back spikes fanning out under the cap, side spikes over the ears
    for ang, el, L, w in [(180, -25, 0.085, 0.032), (150, -18, 0.08, 0.03), (210, -18, 0.08, 0.03), (125, -8, 0.07, 0.028), (235, -8, 0.07, 0.028),
                          (165, -45, 0.07, 0.03), (195, -45, 0.07, 0.03), (180, -60, 0.055, 0.03), (100, -12, 0.055, 0.024), (260, -12, 0.055, 0.024)]:
        a, e = math.radians(ang), math.radians(el)
        d = np.array([math.sin(a) * math.cos(e), math.sin(e), math.cos(a) * math.cos(e)])
        root = c0 + d * 0.06 + np.array([0, 0.02, 0])
        spike(root, d, L + 0.04, w, w * 0.55, 0.012)
    # front bangs under the brim
    for x, L, tilt in []:
        root = np.array([x, 1.246, 0.078]); d = np.array([tilt * 0.6, -1, 0.42])
        spike(root, d, L, 0.016, 0.007, -0.006)
    nh = len(P)
    # cap button on top
    hp, ht = SAVE['hat']; top_i = np.argmax(hp[:, 1]); tp = hp[top_i]
    sph = []
    pts, nrm, uv, tris = [], [], [], []
    for i in range(5):
        th = i / 4 * math.pi / 2
        for j in range(10):
            a = j / 10 * 2 * math.pi; n = np.array([math.cos(th) * math.cos(a), math.sin(th), math.cos(th) * math.sin(a)])
            pts.append(np.array([0, tp[1] - 0.002, tp[2]]) + n * [0.013, 0.008, 0.013]); nrm.append(n); uv.append(pal_uv('red', 0.2))
    for i in range(4):
        for j in range(10):
            a, b = i * 10 + j, i * 10 + (j + 1) % 10; tris += [[a, b, a + 10], [b, b + 10, a + 10]]
    add(pts, nrm, uv, tris, None)
    J = [[head, 0, 0, 0]] * len(P); WT = [[1, 0, 0, 0]] * len(P)
    out.append(('ash_extra', P, N, UV, I, J, WT, palette(), 'double'))
    P, N, UV, I, J, WT = [], [], [], [], [], []
    # short white sleeve hems: a flared ring at the end of each sleeve, on the upper arm bone
    for side in (1, -1):
        b = jn.index('LArmA' if side > 0 else 'RArmA')
        x0 = side * 0.205; pts, nrm, uv, tris = [], [], [], []
        R0 = SAVE['armR']
        for i, (dx, r) in enumerate([(-0.006, R0 * 0.84), (0.008, R0 * 0.93), (0.0095, R0 * 0.86)]):
            for j in range(14):
                a = j / 14 * 2 * math.pi; n = np.array([0, math.cos(a), math.sin(a)])
                pts.append(np.array([x0 + side * dx, 1.031, -0.004]) + n * r * [1, 1, 0.92]); nrm.append(n); uv.append(pal_uv('white', 0.3 + i * 0.2))
        for i in range(2):
            for j in range(14):
                a, c = i * 14 + j, i * 14 + (j + 1) % 14
                tris += [[a, a + 14, c], [c, a + 14, c + 14]] if side > 0 else [[a, c, a + 14], [c, c + 14, a + 14]]
        s0 = len(P); add(pts, nrm, uv, tris, None)
        J += [[b, 0, 0, 0]] * (len(P) - s0); WT += [[1, 0, 0, 0]] * (len(P) - s0)
    out.append(('ash_sleeve', P, N, UV, I, J, WT, palette(), 'double'))

    # the green C logo on the cap's white front panel: a little patch laid on the crown
    gp, gn, guv, gi = [], [], [], []
    n = 9; cy, cz = 1.291, 0.0
    for i in range(n):
        for j in range(n):
            u, v = i / (n - 1), j / (n - 1)
            o = np.array([(u - 0.5) * 0.06, cy + (0.5 - v) * 0.046, 0.3])
            h = ray_hit(o, np.array([0, 0, -1.0]), hp, ht)
            p, nn = (h if h else (o - [0, 0, 0.22], np.array([0, 0, 1.])))
            gp.append(p + nn * 0.0012); gn.append(nn); guv.append([u, v])
    for i in range(n - 1):
        for j in range(n - 1):
            a = i * n + j; gi += [[a, a + 1, a + n], [a + 1, a + n + 1, a + n]]
    img = Image.new('RGBA', (256, 192), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.arc((40, 10, 216, 182), 40, 320, fill=(255, 255, 255, 255), width=54)
    d.arc((50, 20, 206, 172), 42, 318, fill=tuple(int(v * 255) for v in COL['green']) + (255,), width=34)
    b = io.BytesIO(); img.save(b, 'PNG');
    out.append(('ash_logo', gp, gn, guv, gi, [[head, 0, 0, 0]] * len(gp), [[1, 0, 0, 0]] * len(gp), b.getvalue(), 'mask'))
    return out
