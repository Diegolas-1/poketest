"""Ash's base model (bald, barefoot, in briefs) from the concept turnarounds.

  blender -b -P tools/people/ash_base/build.py -- <profiles.json> <out.blend>

profiles.json (tools/people/ash_base/measure.py) holds the concept's silhouettes, row by row:
the front view's spans (body, legs, arms) and the side view's (front and back edges), in
pixels. The body is built from them: rounded cross-sections stacked up the head, neck, torso
and legs (width from the front, depth from the side), tubes for the arms at the A pose's
angle, hands with five fingers and feet with five toes, all joined by a voxel remesh into
one surface and smoothed.
"""
import sys, json, math
import bpy, bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
PROF = json.load(open(argv[0]))
OUT = argv[1]

TOP, GROUND = 100.0, 1025.0          # the head's top and the soles (rows)
S = 1.40 / (GROUND - TOP)            # metres per pixel (Ash: 1.40 m)
FC = 370.0                           # the front view's middle (columns)
SC = 1390.0                          # the side view's middle (columns; the face is to the right)


def zrow(y):
    return (GROUND - y) * S


def front(y):
    return PROF['front'].get(str(int(y)), [])


def side(y):
    return PROF['side'].get(str(int(y)), [])


def span_at(segs, x):
    for a, b in segs:
        if a <= x <= b:
            return a, b
    return None


def smooth(vals, k=3):
    out = []
    for i in range(len(vals)):
        w = vals[max(0, i - k):i + k + 1]
        out.append(sum(w) / len(w))
    return out


# ---------- geometry helpers ----------
def superellipse(n, ru, rv, p):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        pts.append((ru * math.copysign(abs(c) ** (2 / p), c), rv * math.copysign(abs(s) ** (2 / p), s)))
    return pts


def loft(name, rings, n=40, caps=True):
    """rings: [(centre Vector, u Vector, v Vector, ru, rv, p)] -> a closed tube"""
    bm = bmesh.new()
    loops = []
    for c, u, v, ru, rv, p in rings:
        loops.append([bm.verts.new(c + u * a + v * b) for a, b in superellipse(n, ru, rv, p)])
    for L0, L1 in zip(loops, loops[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((L0[i], L0[j], L1[j], L1[i]))
    if caps:
        for L, c in ((loops[0], rings[0][0]), (loops[-1], rings[-1][0])):
            m = bm.verts.new(c)
            for i in range(n):
                bm.faces.new((L[i], L[(i + 1) % n], m))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def capsule(name, pts, radii, n=20, squash=1.0, up=Vector((0, 0, 1))):
    """a tube through pts with radii, rounded at both ends"""
    rings = []
    def frame(d):
        d = d.normalized()
        u = up.cross(d)
        if u.length < 1e-4:
            u = Vector((1, 0, 0)).cross(d)
        u.normalize()
        return u, d.cross(u).normalized()
    for k in range(len(pts)):
        d = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)])
        u, v = frame(d)
        rings.append((pts[k], u, v, radii[k], radii[k] * squash, 2))
    # rounded ends
    def end(k, sgn):
        d = (pts[k] - pts[k - sgn]).normalized() if 0 <= k - sgn < len(pts) else Vector((0, 0, 1))
        u, v = frame(d)
        out = []
        for t in (0.45, 0.75, 0.92, 0.99):
            a = t * math.pi / 2
            out.append((pts[k] + d * math.sin(a) * radii[k], u, v, radii[k] * math.cos(a) + 1e-4, radii[k] * squash * math.cos(a) + 1e-4, 2))
        return out
    rings = end(0, -1)[::-1] + rings + end(len(pts) - 1, 1)
    return loft(name, rings, n)


# ---------- head ----------
def head():
    rows = list(range(101, 300))
    hw, zf, zb = [], [], []
    for y in rows:
        f = front(y)
        seg = max(f, key=lambda s: s[1] - s[0]) if f else (FC, FC)
        hw.append((seg[1] - seg[0]) / 2)
        sd = side(y)
        a = min(s[0] for s in sd) if sd else SC
        b = max(s[1] for s in sd) if sd else SC
        zb.append(a); zf.append(b)
    # the ears widen the front view (rows ~212..272): bridged by a smooth curve
    def bridge(arr, y0, y1):
        i0, i1 = rows.index(y0), rows.index(y1)
        for i in range(i0, i1 + 1):
            t = (i - i0) / (i1 - i0)
            arr[i] = arr[i0] + (arr[i1] - arr[i0]) * (3 * t * t - 2 * t * t * t)
    bridge(hw, 208, 262)
    # below the ears the jaw narrows to the chin as drawn (the front view's span still holds the ear lobes here)
    for y in range(262, 279):
        hw[rows.index(y)] = 66 - (66 - 54) * (y - 262) / 16
    # the nose and lips stand out of the face's front edge (rows ~236..296): bridged; the nose added apart
    bridge(zf, 234, 270)
    hw = smooth(hw, 2); zf = smooth(zf, 2); zb = smooth(zb, 2)
    rings = []
    for i, y in enumerate(rows):
        back = zb[i]
        if y > 262:   # below the ears the jaw stands in front of the neck, its underside rising to the chin
            t = min(1, (y - 262) / 14)
            back = zb[i] + (1392 - zb[i]) * t * t * (3 - 2 * t)
            if y > 276:
                k = (y - 276) / (299 - 276)
                back = 1392 + (zf[i] - 8 - 1392) * k ** 2.4
        cz = zrow(y)
        cy = -((zf[i] + back) / 2 - SC) * S
        rings.append((Vector((0, cy, cz)), Vector((1, 0, 0)), Vector((0, -1, 0)), max(hw[i] * S, 0.002), max((zf[i] - back) / 2 * S, 0.002), 2.2))
    loft('head', rings, 56)
    # the nose: a small wedge at the face's front
    ny = -((1474 - SC) * S)
    capsule('nose', [Vector((0, ny + 0.012, zrow(244))), Vector((0, ny + 0.002, zrow(258)))], [0.006, 0.007], squash=0.8)
    # the ears: flush with the cheek at their front edge, opening out from the head towards the back rim
    # (as drawn: no line where the ear's front meets the head)
    for sx in (1, -1):
        rings = []
        y_front, y_back = -((1398 - SC) * S), -((1364 - SC) * S)
        for k in range(15):
            t = k / 14
            y = y_front + (y_back - y_front) * t
            h = 0.029 * math.sin(math.pi * (0.06 + 0.88 * t)) ** 0.55 + 0.002   # half height: a C, fullest at the back
            zc = zrow(243) + 0.004 * t
            x = (66 + 12 * t ** 0.8) * S
            rings.append((Vector((sx * x, y, zc)), Vector((1, 0, 0)), Vector((0, 0, 1)), (0.0045 + 0.004 * t), h, 2.2))
        loft('ear', rings, 24)


# ---------- neck and torso ----------
def torso():
    rows = list(range(250, 650, 2))
    rings = []
    data = []
    for y in rows:
        f = front(y)
        seg = span_at(f, 372) or max(f, key=lambda s: s[1] - s[0])
        sd = side(y)
        a = min(s[0] for s in sd); b = max(s[1] for s in sd)
        if y < 330:   # the neck: only the neck's own span in the side view (the jaw is in front)
            a, b = 1352, 1411 + max(0, 322 - y) * 0.45
            if y < 322:
                seg = (370 - 26, 370 + 26)
        data.append(((seg[1] - seg[0]) / 2, (seg[0] + seg[1]) / 2, a, b))
    hw = smooth([d[0] for d in data], 2); za = smooth([d[2] for d in data], 2); zb = smooth([d[3] for d in data], 2)
    for i, y in enumerate(rows):
        p = 2.0 if y < 330 else 2.6
        rings.append((Vector((0, -((za[i] + zb[i]) / 2 - SC) * S, zrow(y))), Vector((1, 0, 0)), Vector((0, -1, 0)), hw[i] * S, (zb[i] - za[i]) / 2 * S, p))
    loft('torso', rings, 56)


# ---------- legs and feet ----------
def legs():
    rows = list(range(612, 952, 2))
    for sx in (1, -1):
        rings = []
        data = []
        for y in rows:
            f = front(y)
            segs = [s for s in f if s[1] - s[0] < 120]
            if len(segs) < 2:   # above the crotch: the legs inside the hips
                segs = [(f[0][0], (f[0][0] + f[0][1]) / 2 - 4), ((f[0][0] + f[0][1]) / 2 + 4, f[0][1])] if f else [(330, 370), (390, 430)]
            l, r = segs[0], segs[-1]
            w = ((l[1] - l[0]) + (r[1] - r[0])) / 4
            off = ((r[0] + r[1]) / 2 - (l[0] + l[1]) / 2) / 2
            sd = side(min(y, 918))   # below the shin the side view shows the far foot: the ankle keeps the shin's depth
            a = min(s[0] for s in sd); b = max(s[1] for s in sd)
            data.append((w, off, a, b))
        w = smooth([d[0] for d in data], 3); off = smooth([d[1] for d in data], 3)
        za = smooth([d[2] for d in data], 3); zb = smooth([d[3] for d in data], 3)
        for i, y in enumerate(rows):
            rings.append((Vector((sx * off[i] * S, -((za[i] + zb[i]) / 2 - SC) * S, zrow(y))), Vector((1, 0, 0)), Vector((0, -1, 0)),
                          w[i] * S, (zb[i] - za[i]) / 2 * S, 2.1))
        # on down into the foot (the ankle's last ring, carried to the sole)
        c, u, v, ru, rv, p = rings[-1]
        for z in (0.085, 0.06, 0.04):
            rings.append((Vector((c.x, c.y + 0.004, z)), u, v, ru * 1.05, rv * 1.05, p))
        loft('leg', rings, 40)
        foot(sx, sx * off[-1] * S, c.y)


def foot(sx, x0, yank):
    """the foot from the side view's landmarks: a round heel, the ankle, the instep sloping to the ball,
    widening to the toes; five toes, toes turned out a little as drawn"""
    out = math.radians(8) * sx
    def at(x, y, z):   # turned out about the ankle
        dx, dy = x - x0, y - yank
        return Vector((x0 + dx * math.cos(out) - dy * math.sin(out), yank + dx * math.sin(out) + dy * math.cos(out), z))
    def ycol(col):
        return -((col - SC) * S)
    # (column in the side view, top height m, half width m, inner bias m)
    prof = [(1338, 0.046, 0.023, 0.0), (1346, 0.066, 0.027, 0.0), (1360, 0.078, 0.029, 0.0), (1385, 0.082, 0.031, 0.001),
            (1405, 0.072, 0.034, 0.002), (1422, 0.056, 0.038, 0.003), (1436, 0.042, 0.041, 0.004), (1450, 0.032, 0.041, 0.004), (1460, 0.024, 0.037, 0.004)]
    rings = []
    for col, h, w, bias in prof:
        c = at(x0 - sx * bias, ycol(col), h / 2)
        u = (at(x0 + 1, ycol(col), 0) - at(x0, ycol(col), 0)).normalized()
        rings.append((c, u, Vector((0, 0, 1)), w, h / 2, 2.6))
    loft('foot', rings, 36)
    # the heel, round at the back and below
    capsule('heel', [at(x0, ycol(1344), 0.024), at(x0, ycol(1362), 0.022)], [0.024, 0.024], squash=1.0)
    # five toes from the ball to the tips (big toe inside, the others shorter and smaller)
    for k, (lx, base, tip, r) in enumerate([(-0.027, 1438, 1476, 0.0108), (-0.0085, 1442, 1471, 0.0078), (0.0050, 1442, 1466, 0.0072),
                                            (0.0170, 1440, 1460, 0.0066), (0.0280, 1436, 1452, 0.0060)]):
        x = x0 + sx * lx
        p0 = at(x, ycol(base), r * 1.45)
        p1 = at(x + sx * 0.0012 * k, ycol(tip) + r, r * 1.1)
        capsule('toe', [p0, p1], [r, r * 0.95], squash=0.82)


# ---------- arms and hands ----------
def arms():
    # the left side of the picture (the figure's right arm): the span left of the body, row by row
    pts, wid = [], []
    for y in range(396, 548, 4):
        f = front(y)
        a = [s for s in f if s[1] < 280]
        if not a:
            continue
        s0 = a[0]
        pts.append(((s0[0] + s0[1]) / 2, y)); wid.append(s0[1] - s0[0])
    # the shoulder joint, where the arm comes out of the body
    sh = (FC - 82, 356)
    cl = [sh] + pts
    for sx in (-1, 1):
        P, R = [], []
        for i, ((x, y), w) in enumerate(zip(cl, [wid[0] * 1.05] + wid)):
            j0, j1 = max(0, i - 1), min(len(cl) - 1, i + 1)
            dx, dy = cl[j1][0] - cl[j0][0], cl[j1][1] - cl[j0][1]
            cosang = abs(dy) / math.hypot(dx, dy)
            r = w / 2 * cosang * S
            # the arm hangs a little forward of the chest's middle, more so at the hand
            yy = -((1386 + (y - 356) * 0.18 - SC) * S)
            P.append(Vector((sx * -(x - FC) * S, yy, zrow(y)))); R.append(r)
        R = smooth(R, 2)
        capsule('arm', P, R, n=28, squash=0.92, up=Vector((0, -1, 0)))
        hand(sx, P[-1], (P[-1] - P[-3]).normalized(), R[-1])


def hand(sx, wrist, d, rw):
    """an open hand hanging along the arm's line, turned to face forward and in (as drawn), thumb forward"""
    fwd0 = Vector((0, -1, 0))
    lat = d.cross(fwd0).normalized()
    if lat.x * sx < 0:
        lat = -lat
    ang = math.radians(40)
    across = (fwd0 * math.cos(ang) - lat * math.sin(ang)).normalized()   # along the knuckles: forward and in
    thick = d.cross(across).normalized()
    L, W = 0.074, 0.064
    c0 = wrist + d * 0.004
    rings = []
    for t, w, th in ((0.0, 0.40, 0.0105), (0.35, 0.50, 0.0115), (0.75, 0.52, 0.0105), (1.0, 0.48, 0.0085)):
        rings.append((c0 + d * (L * t), across, thick, W * w, th, 2.4))
    loft('palm', rings, 28)
    knuckle = c0 + d * L
    # four fingers along the knuckles, spread a little, the tips curling slightly towards the palm
    for k, (off, ln, r) in enumerate([(-0.0245, 0.058, 0.0076), (-0.0082, 0.064, 0.0079), (0.0082, 0.059, 0.0076), (0.0235, 0.048, 0.0069)]):
        base = knuckle + across * off
        dir0 = (d + across * (off * 4.0)).normalized()
        p1 = base + dir0 * ln * 0.45
        dir1 = (dir0 - thick * 0.18).normalized()
        p2 = p1 + dir1 * ln * 0.30
        dir2 = (dir0 - thick * 0.35).normalized()
        p3 = p2 + dir2 * ln * 0.25
        capsule('finger', [base - d * 0.010, p1, p2, p3], [r * 1.1, r, r * 0.93, r * 0.86], n=16, squash=0.9, up=thick)
    # the thumb: from the palm's leading edge near the wrist, out and down
    tb = c0 + d * (L * 0.22) + across * (W * 0.40)
    tdir = (d * 0.72 + across * 0.55 - thick * 0.25).normalized()
    capsule('thumb', [tb - tdir * 0.009, tb + tdir * 0.023, tb + tdir * 0.045, tb + tdir * 0.061], [0.011, 0.0099, 0.009, 0.0083], n=16, squash=0.9, up=thick)


def main():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    head(); torso(); legs(); arms()
    obs = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = 'ash_base'
    rm = body.modifiers.new('remesh', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.0028; rm.adaptivity = 0
    bpy.ops.object.modifier_apply(modifier='remesh')
    sm = body.modifiers.new('smooth', 'CORRECTIVE_SMOOTH'); sm.factor = 0.5; sm.iterations = 6; sm.smooth_type = 'SIMPLE'; sm.use_only_smooth = True
    bpy.ops.object.modifier_apply(modifier='smooth')
    bpy.ops.object.shade_smooth()
    print('faces', len(body.data.polygons))
    bpy.ops.wm.save_as_mainfile(filepath=OUT)


main()
