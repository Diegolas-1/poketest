# Ash V2's jeans from a ready-made model, fitted to him in Blender:
#   blender -b --python sandbox/ashv2/blender/jeans_fit.py -- path/to/scene.gltf
# "Baggy gray denim jeans" (https://sketchfab.com/3d-models/baggy-gray-denim-jeans-27d6e6a815854a6f8011e16217a31291)
# by jaket vintage, CC-BY-4.0 (license.txt beside this file). The file shows the jeans twice, back
# and front; the pair facing the way he does is kept. Fitted: its waist to his (with room for the
# shirt tucked in), its rise and inseam each to his, each leg hung along his leg, then let out
# ring by ring wherever he would come through it. Skinned like the rest of his clothes (each leg
# its own leg, not his hands, not his feet). Saves jeans.blend, its texture as ../jeans_color.webp,
# and the jeans (and the belt) into ../clothes.json.
import bpy, bmesh, json, math, struct, base64, os, sys
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
GLB = os.path.join(HERE, '..', 'ashv2.glb')
OUT = os.path.join(HERE, '..', 'clothes.json')
SRC = sys.argv[sys.argv.index('--') + 1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
body = bpy.data.objects['model']
arm_obj = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o is not body: bpy.data.objects.remove(o)
P = [v.co.copy() for v in body.data.vertices]
TOP = max(p.z for p in P); S = TOP / 2; CM = TOP / 150; XC = -0.006 * S
def to_stage(v): return (v.x / S, v.z / S - 1, -v.y / S)
gi = {g.index: g.name for g in body.vertex_groups}
arm = [sum(g.weight for g in v.groups if ('Arm' in gi[g.group] or 'Hand' in gi[g.group])) > 0.3 for v in body.data.vertices]

Z_WAIST = S + 0.6 * CM
Z_CROTCH = (-0.271 + 1) * S - 2.0 * CM
Z_HEM = (-0.9 + 1) * S
Z_KNEE = (-0.5 + 1) * S
def groin(p): return abs(p.x - XC) < 6.0 * CM and p.y < 0.0 and Z_CROTCH - 1 * CM < p.z < Z_CROTCH + 13 * CM
LOW = [i for i, p in enumerate(P) if p.z < 0.62 * TOP and not arm[i]]

def hull_girth(pts):
    pts = sorted(set((round(x, 5), round(y, 5)) for x, y in pts))
    if len(pts) < 3: return 0
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for q in pts:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], q) <= 0: lo.pop()
        lo.append(q)
    for q in reversed(pts):
        while len(up) >= 2 and cr(up[-2], up[-1], q) <= 0: up.pop()
        up.append(q)
    h = lo[:-1] + up[:-1]
    return sum(math.dist(h[i], h[(i + 1) % len(h)]) for i in range(len(h)))

def body_slice(z, keep=lambda p: True, band=0.6 * CM):
    return [(P[i].x, P[i].y) for i in LOW if abs(P[i].z - z) < band and keep(P[i])]
def centre(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)

# ---------- the jeans: one pair of the two ----------
bpy.ops.import_scene.gltf(filepath=SRC)
src = [o for o in bpy.data.objects if o.type == 'MESH' and o is not body]
bpy.ops.object.select_all(action='DESELECT')
for o in src: o.select_set(True)
bpy.context.view_layer.objects.active = src[0]
if len(src) > 1: bpy.ops.object.join()
jeans = bpy.context.view_layer.objects.active; jeans.name = 'jeans'
jeans.parent = None
jeans.data.transform(jeans.matrix_world); jeans.matrix_world.identity()
for o in list(bpy.data.objects):
    if o.type == 'EMPTY': bpy.data.objects.remove(o)
bm = bmesh.new(); bm.from_mesh(jeans.data)
# islands; keep those of the pair on +X (it faces -Y, as he does)
bm.verts.ensure_lookup_table()
seen = set(); drop = []
for v in bm.verts:
    if v in seen: continue
    stack, isl = [v], []
    seen.add(v)
    while stack:
        a = stack.pop(); isl.append(a)
        for e in a.link_edges:
            b = e.other_vert(a)
            if b not in seen: seen.add(b); stack.append(b)
    cx = sum(a.co.x for a in isl) / len(isl)
    if cx < 0: drop += isl
bmesh.ops.delete(bm, geom=drop, context='VERTS')
V = list(bm.verts)
print('kept', len(V), 'vertices')
# its measurements: waistband top, hems, crotch (the highest height its two legs are apart)
zt = max(v.co.z for v in V); zb = min(v.co.z for v in V); H = zt - zb
jx = (min(v.co.x for v in V) + max(v.co.x for v in V)) / 2
jy = (min(v.co.y for v in V) + max(v.co.y for v in V)) / 2
def jslice(z, band): return [(v.co.x, v.co.y) for v in V if abs(v.co.z - z) < band]
# the crotch: the height where its cloth leaves the middle for good going down (the two legs
# part there; above it, the seams down the front and back are on the middle). The model is made
# of separate panels, so this is found from where its points are, not how they connect.
def near_mid(z): sl = jslice(z, H * 0.006); return min((abs(x - jx) for x, _ in sl), default=1)
prof = [(zt - H * k / 120, near_mid(zt - H * k / 120)) for k in range(12, 90)]
zc = zt - H * 0.35
for i in range(len(prof) - 8):
    if all(m > H * 0.005 for _, m in prof[i:i + 8]): zc = prof[i][0]; break
j_waist = hull_girth(jslice(zt - H * 0.01, H * 0.006))
a_waist = hull_girth(body_slice(Z_WAIST - 1 * CM)) + 3.5 * CM      # room for his shirt tucked in
k_xy = a_waist / j_waist
print('jeans: height %.3f crotch at %.2f of it, waist %.3f -> his %.3f (x%.3f)' % (H, (zt - zc) / H, j_waist, a_waist, k_xy))

# rise to his rise, inseam to his inseam; waist to his waist; centred on him
a_c = centre(body_slice(Z_WAIST - 2 * CM))
for v in V:
    z = v.co.z
    nz = Z_CROTCH + (z - zc) / (zt - zc) * (Z_WAIST - Z_CROTCH) if z >= zc else Z_HEM + (z - zb) / (zc - zb) * (Z_CROTCH - Z_HEM)
    v.co = Vector((XC + (v.co.x - jx) * k_xy, a_c[1] + (v.co.y - jy) * k_xy, nz))

# ---------- shaped to him by one smooth warp of the space it's in ----------
# Nothing is cut, turned or moved on its own: every point moves by the same smooth rule of where it
# is, so points side by side (the two edges of a seam, a pocket and the denim under it) always move
# alike, and the model stays whole, like clay pressed into shape.
def smoothstep(e0, e1, x):
    t = min(1, max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
def leg_line(s, z):
    a = centre(body_slice(Z_CROTCH - 4 * CM, lambda p: s * (p.x - XC) > 0, 1.0 * CM))
    b = centre(body_slice(Z_HEM + 4 * CM, lambda p: s * (p.x - XC) > 0, 1.0 * CM))
    t = max(0, min(1, (Z_CROTCH - 4 * CM - z) / (Z_CROTCH - Z_HEM - 8 * CM)))
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
def lerp_table(tab, z, step):                        # a table by height, read smoothly between rows
    k = z / step; k0 = math.floor(k); t = k - k0
    a, b = tab.get(k0), tab.get(k0 + 1)
    if a is None: a = b
    if b is None: b = a
    if a is None: return None
    if isinstance(a, tuple): return tuple(x + (y - x) * t for x, y in zip(a, b))
    return a + (b - a) * t
def smoothed(tab, w=3):
    out = {}
    for k in tab:
        vals = [tab[k2] for k2 in range(k - w, k + w + 1) if k2 in tab]
        out[k] = tuple(sum(c) / len(vals) for c in zip(*vals)) if isinstance(vals[0], tuple) else sum(vals) / len(vals)
    return out
STEP = 1.0 * CM
# how much of a point is in each leg (smooth across his centre line), and how far below the seat
wside = lambda p, s: smoothstep(-5 * CM, 5 * CM, s * (p.x - XC))
wleg = lambda z: smoothstep(Z_CROTCH + 8 * CM, Z_CROTCH - 14 * CM, z)
# 1. each leg of the jeans hung along his leg: its middle to his leg's middle, height by height
shift = {}
for s in (1, -1):
    tab = {}
    for k in range(math.floor(Z_HEM / STEP), math.floor(Z_CROTCH / STEP) + 1):
        z = (k + 0.5) * STEP
        js = [(v.co.x, v.co.y) for v in V if abs(v.co.z - z) < STEP and s * (v.co.x - XC) > 0]
        if not js: continue
        jc, bc = centre(js), leg_line(s, z)
        tab[k] = (bc[0] - jc[0], bc[1] - jc[1])
    shift[s] = smoothed(tab)
# 2. straight legs, a little bag at the feet: each leg's width, height by height, to his thigh and 1 cm
def thigh_r(s):
    sl = body_slice(Z_CROTCH - 4 * CM, lambda p: s * (p.x - XC) > 0, 1.0 * CM); c = centre(sl)
    return max(math.hypot(x - c[0], y - c[1]) for x, y in sl)
widen = {}
for s in (1, -1):
    want = thigh_r(s) + 1.0 * CM; tab = {}
    for k in range(math.floor(Z_HEM / STEP), math.floor(Z_CROTCH / STEP) + 1):
        z = (k + 0.5) * STEP; d = lerp_table(shift[s], z, STEP) or (0, 0); c = leg_line(s, z)
        rs = sorted(math.hypot(v.co.x + d[0] - c[0], v.co.y + d[1] - c[1]) for v in V if abs(v.co.z - z) < STEP and s * (v.co.x - XC) > 0)
        if len(rs) < 8: continue
        tab[k] = want * (1 + 0.16 * smoothstep(Z_HEM + 18 * CM, Z_HEM, z)) / (rs[len(rs) // 2] * 1.25)
    widen[s] = smoothed(tab)
# 3. hips no wider at the sides than his and 3.5 cm
hips = {}
for k in range(math.floor(Z_CROTCH / STEP) - 4, math.floor(Z_WAIST / STEP) + 3):
    z = (k + 0.5) * STEP
    ring = [abs(v.co.x - XC) for v in V if abs(v.co.z - z) < STEP]
    sl = body_slice(max(z, Z_CROTCH + 2 * CM), band=1.0 * CM)
    if ring and sl: hips[k] = min(1, (max(abs(x - XC) for x, _ in sl) + 3.5 * CM) / max(ring))
hips = smoothed(hips, 6)
def warp(p):
    q = p.copy()
    hk = lerp_table(hips, p.z, STEP)
    if hk is not None:
        fade = smoothstep(Z_CROTCH - 22 * CM, Z_CROTCH + 4 * CM, p.z)       # taken in, easing off down the thigh
        q.x = XC + (q.x - XC) * (1 + (hk - 1) * fade)
    wl = wleg(p.z)
    if wl:
        dx = dy = 0.0
        for s in (1, -1):
            w = wside(p, s) * wl
            if not w: continue
            d = lerp_table(shift[s], min(p.z, Z_CROTCH), STEP) or (0, 0)
            k = lerp_table(widen[s], min(p.z, Z_CROTCH), STEP) or 1
            c = leg_line(s, p.z)
            x, y = p.x + d[0], p.y + d[1]
            dx += w * (c[0] + (x - c[0]) * k - p.x); dy += w * (c[1] + (y - c[1]) * k - p.y)
        q.x += dx; q.y += dy
    return q
for v in V: v.co = warp(v.co)

# 5. nothing standing out from a leg: past the leg's own width (by its height) the cloth is drawn
# most of the way back in, smoothly (the further out, the more); layers keep their order
limit = {}
for s in (1, -1):
    tab = {}
    for k in range(math.floor(Z_HEM / STEP), math.floor((Z_CROTCH + 4 * CM) / STEP) + 1):
        z = (k + 0.5) * STEP; c = leg_line(s, min(z, Z_CROTCH))
        rs = sorted(math.hypot(v.co.x - c[0], v.co.y - c[1]) for v in V if abs(v.co.z - z) < STEP and s * (v.co.x - XC) > 0)
        if len(rs) >= 8: tab[k] = rs[len(rs) // 2] * 1.3
    limit[s] = smoothed(tab, 4)
for v in V:
    p = v.co; wl = smoothstep(Z_CROTCH + 5 * CM, Z_CROTCH - 6 * CM, p.z)
    if not wl: continue
    dx = dy = 0.0
    for s in (1, -1):
        w = wside(p, s) * wl
        if not w: continue
        R = lerp_table(limit[s], p.z, STEP)
        if R is None: continue
        c = leg_line(s, min(p.z, Z_CROTCH)); r = math.hypot(p.x - c[0], p.y - c[1])
        if r <= R or r == 0: continue
        r2 = R + (r - R) * 0.25
        dx += w * (c[0] + (p.x - c[0]) * r2 / r - p.x); dy += w * (c[1] + (p.y - c[1]) * r2 / r - p.y)
    p.x += dx; p.y += dy

# 6. the outer thigh straight: on the outside of each leg, nothing past the straight line from the
# jeans' own side at his hip down to their side at his knee (drawn most of the way in, and only on
# the outer side: the front, back and inner leg, and the crotch, are left as they are)
Z_HIPLINE = Z_CROTCH + 6 * CM
def side_at(z, s):
    xs = [s * (v.co.x - XC) for v in V if abs(v.co.z - z) < STEP and s * (v.co.x - XC) > 0]
    return max(xs) if xs else None
for s in (1, -1):
    top, bot = side_at(Z_HIPLINE, s), side_at(Z_KNEE, s)
    if top is None or bot is None: continue
    for v in V:
        p = v.co
        if s * (p.x - XC) <= 0 or p.z > Z_HIPLINE + 4 * CM or p.z < Z_KNEE - 4 * CM: continue
        c = leg_line(s, min(p.z, Z_CROTCH))
        r = math.hypot(p.x - c[0], p.y - c[1]) or 1
        outer = smoothstep(0.2, 0.8, s * (p.x - c[0]) / r)                       # how much it faces outward
        t = max(0, min(1, (Z_HIPLINE - p.z) / (Z_HIPLINE - Z_KNEE)))
        line = top + (bot - top) * t
        band = smoothstep(Z_HIPLINE + 4 * CM, Z_HIPLINE, p.z) * smoothstep(Z_KNEE - 4 * CM, Z_KNEE, p.z)
        x = s * (p.x - XC)
        if x <= line: continue
        x2 = line + (x - line) * 0.15
        p.x += s * (x2 - x) * outer * band

# which leg each point follows when he moves: below the seat the cloth is two tubes (outer shell
# and lining alike), each a leg; above it, by his side
SIDE = [0] * len(V)
cut = Z_CROTCH - 1.5 * CM
for v in V:
    if SIDE[v.index] or v.co.z >= cut: continue
    comp, stack = [], [v]; SIDE[v.index] = 2
    while stack:
        a = stack.pop(); comp.append(a)
        for e in a.link_edges:
            b = e.other_vert(a)
            if not SIDE[b.index] and b.co.z < cut: SIDE[b.index] = 2; stack.append(b)
    sx = 1 if sum(a.co.x for a in comp) / len(comp) > XC else -1
    for a in comp: SIDE[a.index] = sx
for v in V:
    if not SIDE[v.index]: SIDE[v.index] = 1 if v.co.x > XC else -1

# 4. let out wherever he would come through: a smooth swelling of the space round those points
# (everything within a few cm moves with them, layers and seams together)
bvh = BVHTree.FromPolygons(P, [list(p.vertices) for p in body.data.polygons if not any(arm[i] or groin(P[i]) for i in p.vertices)])
GAP, SIG = 0.6 * CM, 2.5 * CM
for rnd in range(6):
    # (below the seat a leg's cloth is let out only by its own thigh: his two thighs, close together
    # there, push opposite ways, and between them would fold the cloth over)
    src = []
    for v in V:
        hit = bvh.find_nearest(v.co, 8 * CM)
        if hit[0] is None: continue
        d = (v.co - hit[0]).dot(hit[1])
        if d < GAP: src.append((v.co.copy(), hit[1] * (GAP - d), SIDE[v.index] if v.co.z < cut else 0))
    if not src: break
    kd = kdtree.KDTree(len(src))
    for i, (co, _, _) in enumerate(src): kd.insert(co, i)
    kd.balance()
    for v in V:
        acc = Vector(); ws = 0; mine = SIDE[v.index] if v.co.z < cut else 0
        for co, i, d in kd.find_range(v.co, 2.5 * SIG):
            if mine and src[i][2] and src[i][2] != mine: continue
            w = math.exp(-(d / SIG) ** 2); acc += src[i][1] * w; ws += w
        if ws: v.co += acc / max(1.0, ws)
    print('round', rnd, 'points let out', len(src))

# its lighting: a smooth normal at every point, facing out of him (the same for points in the same
# place, so there are no shading seams where its panels meet; the model's faces don't all wind the
# same way, so a face's facing is taken from where it is, and the faces themselves are left as they are)
OUTN = [Vector() for _ in V]
for f in bm.faces:
    c = f.calc_center_median(); n = f.normal * f.calc_area()
    ax = (XC, a_c[1]) if c.z >= Z_CROTCH else leg_line(SIDE[f.verts[0].index], c.z)
    if n.x * (c.x - ax[0]) + n.y * (c.y - ax[1]) < 0: n = -n
    for v in f.verts: OUTN[v.index] += n
kdn = kdtree.KDTree(len(V))
for v in V: kdn.insert(v.co, v.index)
kdn.balance()
OUTN = [sum((OUTN[j] for co, j, d in kdn.find_range(v.co, 0.08 * CM)), Vector()).normalized() for v in V]
bm.to_mesh(jeans.data); bm.free()
for p in jeans.data.polygons: p.use_smooth = True

# ---------- the belt: round the waistband ----------
def belt_obj():
    zs = [(Z_WAIST + 0.4 * CM), (Z_WAIST - 2.6 * CM)]      # over the waistband's top edge
    ring = []
    for z in zs:
        pts = [(v.co.x, v.co.y) for v in jeans.data.vertices if abs(v.co.z - z) < 0.7 * CM]
        c = centre(pts); R = [0.0] * 64
        for x, y in pts:
            a = math.atan2(x - c[0], -(y - c[1])) % (2 * math.pi); b = int(a / (2 * math.pi) * 64) % 64
            R[b] = max(R[b], math.hypot(x - c[0], y - c[1]))
        for _ in range(64):
            if all(R): break
            R = [x if x else max(R[(i - 1) % 64], R[(i + 1) % 64]) for i, x in enumerate(R)]
        ring.append([(c[0] + math.sin(2 * math.pi * k / 64) * (R[k] + 0.3 * CM), c[1] - math.cos(2 * math.pi * k / 64) * (R[k] + 0.3 * CM), z) for k in range(64)])
    bm = bmesh.new(); rows = [[bm.verts.new(Vector(p)) for p in r] for r in ring]
    for k in range(64): bm.faces.new((rows[0][k], rows[0][(k + 1) % 64], rows[1][(k + 1) % 64], rows[1][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('belt'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('belt', me); bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    m = o.modifiers.new('leather', 'SOLIDIFY'); m.thickness = 0.35 * CM; m.offset = 1
    bpy.ops.object.modifier_apply(modifier='leather')
    f = ring[0][0]
    front_y = min(r[0][1] for r in ring)                 # the belt's most forward point, at his front
    bpy.ops.mesh.primitive_cube_add(size=1, location=(f[0], front_y - 0.5 * CM, Z_WAIST - 1.1 * CM))
    bk = bpy.context.active_object; bk.name = 'buckle'; bk.scale = (4.0 * CM, 0.5 * CM, 3.0 * CM)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.select_all(action='DESELECT'); bk.select_set(True); o.select_set(True); bpy.context.view_layer.objects.active = o
    nb = len(o.data.vertices); bpy.ops.object.join()
    return o, nb
belt, nb = belt_obj()

# ---------- skinning ----------
with open(GLB, 'rb') as f:
    f.read(12); ln, = struct.unpack('<I', f.read(4)); f.read(4); gl = json.loads(f.read(ln))
joints = [gl['nodes'][j]['name'] for j in gl['skins'][0]['joints']]
jidx = {n: i for i, n in enumerate(joints)}
REMAP = {'LeftFoot': 'LeftLeg', 'LeftToeBase': 'LeftLeg', 'LeftToe_End': 'LeftLeg', 'RightFoot': 'RightLeg', 'RightToeBase': 'RightLeg', 'RightToe_End': 'RightLeg'}
weights = []
for v in body.data.vertices:
    w = {}
    for g in v.groups:
        n = REMAP.get(gi[g.group], gi[g.group])
        if g.weight > 0: w[n] = w.get(n, 0) + g.weight
    weights.append(w)
trees = {}
for key, keep in (('all', lambda i, p: not arm[i]), (1, lambda i, p: not arm[i] and p.x > XC), (-1, lambda i, p: not arm[i] and p.x < XC)):
    ids = [i for i, p in enumerate(P) if keep(i, p)]
    t = kdtree.KDTree(len(ids))
    for i in ids: t.insert(P[i], i)
    t.balance(); trees[key] = t
_cc = {}
def leg_centre(z, s):
    key = (round(z / CM), s)
    if key not in _cc: _cc[key] = centre(body_slice(min(z, Z_CROTCH - 3 * CM), lambda p: s * (p.x - XC) > 0, 1.2 * CM) or [(XC + s * 0.13 * S, 0)])
    return _cc[key]

def leg_sides(o, z_cut):
    # each point below z_cut: which leg's cloth it is (the cloth below the seat is two tubes)
    vs = o.data.vertices; adj = [[] for _ in vs]
    for e in o.data.edges: a, b = e.vertices; adj[a].append(b); adj[b].append(a)
    side = [0] * len(vs); seen = [False] * len(vs)
    for i, v in enumerate(vs):
        if seen[i] or v.co.z >= z_cut: continue
        comp, stack = [], [i]; seen[i] = True
        while stack:
            a = stack.pop(); comp.append(a)
            for b in adj[a]:
                if not seen[b] and vs[b].co.z < z_cut: seen[b] = True; stack.append(b)
        sx = 1 if sum(vs[a].co.x for a in comp) / len(comp) > XC else -1
        for a in comp: side[a] = sx
    # above the cut: by which side of him it is
    for i, v in enumerate(vs):
        if not side[i]: side[i] = 1 if v.co.x > XC else -1
    return side

def skin(o, legs_apart=True, z_split=Z_CROTCH + 1 * CM):
    vs = o.data.vertices; W = []
    side = (SIDE if len(SIDE) == len(vs) else leg_sides(o, Z_CROTCH)) if legs_apart else None
    for v in vs:
        p = v.co
        if legs_apart and p.z < z_split:
            s = side[v.index]; c = leg_centre(p.z, s)
            q = Vector((c[0] + (p.x - c[0]) * 0.45, c[1] + (p.y - c[1]) * 0.45, p.z))
            hits = trees[s].find_n(q, 6)
        else:
            hits = trees['all'].find_n(p, 6)
        acc = {}
        for (co, i, d) in hits:
            k = 1 / (d + 1e-4)
            for n, w in weights[i].items(): acc[n] = acc.get(n, 0) + w * k
        W.append(acc)
    adj = [[] for _ in vs]
    for e in o.data.edges: a, b = e.vertices; adj[a].append(b); adj[b].append(a)
    # points in the same place (the two edges of a seam between panels) are one point here: joined
    # in the smoothing, and given the same weights after it, so a seam never opens as he moves
    kd = kdtree.KDTree(len(vs))
    for v in vs: kd.insert(v.co, v.index)
    kd.balance()
    same = [[j for co, j, d in kd.find_range(v.co, 0.08 * CM) if j != v.index] for v in vs]
    for i, g in enumerate(same): adj[i] += g
    for _ in range(8):
        W2 = []
        for i, v in enumerate(vs):
            acc = dict(W[i])
            for j in adj[i]:
                if legs_apart and v.co.z < z_split and side[j] != side[i]: continue
                for n, w in W[j].items(): acc[n] = acc.get(n, 0) + w
            W2.append(acc)
        W = W2
    for i, g in enumerate(same):
        if not g: continue
        acc = dict(W[i])
        for j in g:
            for n, w in W[j].items(): acc[n] = acc.get(n, 0) + w
        W[i] = acc
    out = []
    for acc in W:
        top = sorted(acc.items(), key=lambda x: -x[1])[:4]; s = sum(w for _, w in top) or 1
        out.append([(jidx[n], w / s) for n, w in top])
    for n in joints: o.vertex_groups.new(name=n)
    for i, ws in enumerate(out):
        for j, w in ws: o.vertex_groups[joints[j]].add([i], w, 'REPLACE')
    o.parent = arm_obj; mod = o.modifiers.new('Armature', 'ARMATURE'); mod.object = arm_obj
    return out

def record(o, sk, color, uv_layer=True, sort_key=None, normals=None, **extra):
    me = o.data; me.calc_loop_triangles()
    n = len(me.vertices)
    # one stage vertex per Blender vertex and UV (a UV seam splits a vertex)
    uvl = me.uv_layers.active.data if (uv_layer and me.uv_layers) else None
    key, verts, idx = {}, [], []
    for t in me.loop_triangles:
        for li, vi in zip(t.loops, t.vertices):
            uv = tuple(uvl[li].uv) if uvl else (0.0, 0.0)
            k = (vi, round(uv[0], 5), round(uv[1], 5))
            if k not in key: key[k] = len(verts); verts.append((vi, uv))
            idx.append(key[k])
    if sort_key:                                    # vertices of a piece together (one colour each)
        order = sorted(range(len(verts)), key=lambda k: sort_key(verts[k][0])); inv = [0] * len(order)
        for new, old in enumerate(order): inv[old] = new
        verts = [verts[k] for k in order]; idx = [inv[i] for i in idx]
    pos, nrm, uvs, J, Wt = [], [], [], [], []
    for vi, uv in verts:
        v = me.vertices[vi]; pos += list(to_stage(v.co)); nn = normals[vi] if normals else v.normal; nrm += [nn.x, nn.z, -nn.y]
        uvs += [uv[0], 1 - uv[1]]
        ws = sk[vi] + [(0, 0)] * (4 - len(sk[vi])); J += [j for j, _ in ws]; Wt += [w for _, w in ws]
    b = lambda fmt, a: base64.b64encode(struct.pack('<%d%s' % (len(a), fmt), *a)).decode()
    g = {'color': color, 'count': len(verts), 'position': b('f', pos), 'normal': b('f', nrm), 'uv': b('f', uvs),
         'index': b('I', idx), 'skinIndex': b('H', J), 'skinWeight': b('f', Wt)}
    g.update(extra)
    return g, verts

sk_j = skin(jeans)
sk_b = skin(belt, legs_apart=False)
gj, _ = record(jeans, sk_j, '#b8d6f8', normals=OUTN, outward=True, texture='jeans_color.webp', credit='"Baggy gray denim jeans" by jaket vintage (sketchfab.com/biasagadianggap1266), CC-BY-4.0',
               pieces=[{'name': 'jeans', 'start': 0, 'n': 0}])
gb, bverts = record(belt, sk_b, '#1c1c1e', uv_layer=False, sort_key=lambda vi: vi >= nb)
gj['pieces'][0]['n'] = gj['count']
# the belt's buckle in steel
first_buckle = next((k for k, (vi, _) in enumerate(bverts) if vi >= nb), len(bverts))
gb['pieces'] = [{'name': 'strap', 'start': 0, 'n': first_buckle}, {'name': 'buckle', 'start': first_buckle, 'n': len(bverts) - first_buckle}]
gb['pieceColors'] = {'strap': '#1c1c1e', 'buckle': '#c9ccd2'}

# the texture, for the stage
img = next(i for i in bpy.data.images if i.size[0] > 0)
img.scale(2048, 2048) if img.size[0] > 2048 else None
img.filepath_raw = os.path.join(HERE, '..', 'jeans_color_src.png'); img.file_format = 'PNG'; img.save()

data = json.load(open(OUT)) if os.path.exists(OUT) else {'garments': []}
gs = [g for g in data['garments'] if g['name'] not in ('jeans', 'belt')]
gs.insert(0, {'name': 'jeans', **gj}); gs.insert(1, {'name': 'belt', **gb})
data['garments'] = gs
json.dump(data, open(OUT, 'w'))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'jeans.blend'))
print('FIT', gj['count'], 'jeans vertices;', gb['count'], 'belt vertices')
