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
# its panels (the model is cut and sewn: each leg panel belongs to one leg)
bm.verts.ensure_lookup_table()
PANEL = [-1] * len(V); npan = 0
for v in V:
    if PANEL[v.index] >= 0: continue
    stack = [v]; PANEL[v.index] = npan
    while stack:
        a = stack.pop()
        for e in a.link_edges:
            b = e.other_vert(a)
            if PANEL[b.index] < 0: PANEL[b.index] = npan; stack.append(b)
    npan += 1
print('panels', npan)

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

# which leg each point is: below the seat the cloth falls apart into tubes (the legs; outer
# shell and lining alike), each a leg by where it is; above the seat, by his side
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
# each leg along his leg: shift by (his leg's centre - its leg's centre) at each height, from the seat down
def smoothstep(e0, e1, x):
    t = min(1, max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
shift = {}
for s in (1, -1):
    for k in range(60):
        z = Z_CROTCH - (Z_CROTCH - Z_HEM) * k / 59
        js = [(v.co.x, v.co.y) for v in V if abs(v.co.z - z) < 1.0 * CM and s * (v.co.x - XC) > 0]
        bs = body_slice(min(z, Z_CROTCH - 3 * CM), lambda p: s * (p.x - XC) > 0, 1.0 * CM) or body_slice(Z_HEM + 4 * CM, lambda p: s * (p.x - XC) > 0, 1.0 * CM)
        if js and bs:
            jc, bc = centre(js), centre(bs)
            shift[(s, k)] = (bc[0] - jc[0], bc[1] - jc[1])
def shift_at(s, z):
    k = (Z_CROTCH - z) / (Z_CROTCH - Z_HEM) * 59
    k0 = int(max(0, min(59, math.floor(k)))); k1 = min(59, k0 + 1); t = max(0, min(1, k - k0))
    a = shift.get((s, k0), (0, 0)); b = shift.get((s, k1), a)
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
def leg_line(s, z):
    a = centre(body_slice(Z_CROTCH - 4 * CM, lambda p: s * (p.x - XC) > 0, 1.0 * CM))
    b = centre(body_slice(Z_HEM + 4 * CM, lambda p: s * (p.x - XC) > 0, 1.0 * CM))
    t = max(0, min(1, (Z_CROTCH - 4 * CM - z) / (Z_CROTCH - Z_HEM - 8 * CM)))
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
for v in V:
    s = SIDE[v.index]
    w = smoothstep(Z_CROTCH + 4 * CM, Z_CROTCH - 6 * CM, v.co.z)
    d = shift_at(s, min(v.co.z, Z_CROTCH))
    v.co.x += d[0] * w; v.co.y += d[1] * w

# the shape Ash wears: straight legs (as wide at the shin as at the thigh, a little bag at the
# feet) and hips not much wider than his own
def thigh_r(s):
    sl = body_slice(Z_CROTCH - 4 * CM, lambda p: s * (p.x - XC) > 0, 1.0 * CM); c = centre(sl)
    return max(math.hypot(x - c[0], y - c[1]) for x, y in sl)
TARGET = {s: thigh_r(s) + 2.0 * CM for s in (1, -1)}
def leg_target(s, z):
    bag = smoothstep(Z_HEM + 16 * CM, Z_HEM, z)
    return TARGET[s] * (1 + 0.12 * bag)
side_now = {v.index: SIDE[v.index] for v in V}
bands = {}
for v in V:
    if v.co.z >= Z_CROTCH: continue
    s = side_now[v.index]; c = leg_line(s, v.co.z)
    bands.setdefault((s, round(v.co.z / CM)), []).append(math.hypot(v.co.x - c[0], v.co.y - c[1]))
med = {k: sorted(r)[len(r) // 2] * 1.25 for k, r in bands.items()}   # (a ring's points: its median radius, scaled to its outer edge)
for v in V:
    w = smoothstep(Z_CROTCH + 1 * CM, Z_CROTCH - 7 * CM, v.co.z)
    if not w: continue
    s = side_now[v.index]; c = leg_line(s, v.co.z)
    m = med.get((s, round(v.co.z / CM)))
    if not m: continue
    k = 1 + (leg_target(s, v.co.z) / m - 1) * w
    v.co.x = c[0] + (v.co.x - c[0]) * k; v.co.y = c[1] + (v.co.y - c[1]) * k
# hips: no wider at the sides than his hips and 2.5 cm
for z_cm in range(int(Z_CROTCH / CM) - 2, int(Z_WAIST / CM) + 2):
    z = z_cm * CM
    ring = [v for v in V if abs(v.co.z - z) < 0.5 * CM]
    if not ring: continue
    sl = body_slice(max(z, Z_CROTCH + 2 * CM), band=1.0 * CM)
    if not sl: continue
    half_b = max(abs(x - XC) for x, _ in sl) + 2.5 * CM
    half_j = max(abs(v.co.x - XC) for v in ring)
    if half_j <= half_b: continue
    k = half_b / half_j
    for v in ring: v.co.x = XC + (v.co.x - XC) * k
# ---------- let it out wherever he would come through: each such point pushed off him, and the
# push spread smoothly through the cloth round it (so it lifts as cloth would, not in dents) ----------
bvh = BVHTree.FromPolygons(P, [list(p.vertices) for p in body.data.polygons if not any(arm[i] or groin(P[i]) for i in p.vertices)])
GAP = 0.6 * CM
bm.verts.ensure_lookup_table(); V = list(bm.verts)
nbr = [[e.other_vert(v).index for e in v.link_edges] for v in V]
for rnd in range(5):
    src = {}
    for v in V:
        hit = bvh.find_nearest(v.co, 8 * CM)
        if hit[0] is None: continue
        d = (v.co - hit[0]).dot(hit[1])
        if d < GAP: src[v.index] = hit[1] * (GAP - d)
    if not src: break
    D = [src.get(i, Vector()) for i in range(len(V))]
    for it in range(30):
        D2 = []
        for i in range(len(V)):
            if i in src: D2.append(src[i]); continue
            nb = nbr[i]
            D2.append(sum((D[j] for j in nb), Vector()) / len(nb) * 0.97 if nb else Vector())
        D = D2
    # layers move together: a pocket bag or the waistband's lining can't be pushed through the denim
    # over it (each point moves as far as the most-moved point within 1.2 cm)
    kd = kdtree.KDTree(len(V))
    for v in V: kd.insert(v.co, v.index)
    kd.balance()
    D3 = []
    for v in V:
        best = D[v.index]
        for co, j, d in kd.find_range(v.co, 1.2 * CM):
            if D[j].length > best.length: best = D[j]
        D3.append(best)
    for i, v in enumerate(V): v.co += D3[i]
    print('round', rnd, 'points pushed off him', len(src))
bm.to_mesh(jeans.data); bm.free()
for p in jeans.data.polygons: p.use_smooth = True

# ---------- the belt: round the waistband ----------
def belt_obj():
    zs = [(Z_WAIST - 0.8 * CM), (Z_WAIST - 3.2 * CM)]
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
    bpy.ops.mesh.primitive_cube_add(size=1, location=(f[0], f[1] - 0.6 * CM, Z_WAIST - 2.0 * CM))
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
    for _ in range(8):
        W2 = []
        for i, v in enumerate(vs):
            acc = dict(W[i])
            for j in adj[i]:
                if legs_apart and v.co.z < z_split and side[j] != side[i]: continue
                for n, w in W[j].items(): acc[n] = acc.get(n, 0) + w
            W2.append(acc)
        W = W2
    out = []
    for acc in W:
        top = sorted(acc.items(), key=lambda x: -x[1])[:4]; s = sum(w for _, w in top) or 1
        out.append([(jidx[n], w / s) for n, w in top])
    for n in joints: o.vertex_groups.new(name=n)
    for i, ws in enumerate(out):
        for j, w in ws: o.vertex_groups[joints[j]].add([i], w, 'REPLACE')
    o.parent = arm_obj; mod = o.modifiers.new('Armature', 'ARMATURE'); mod.object = arm_obj
    return out

def record(o, sk, color, uv_layer=True, sort_key=None, **extra):
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
        v = me.vertices[vi]; pos += list(to_stage(v.co)); nn = v.normal; nrm += [nn.x, nn.z, -nn.y]
        uvs += [uv[0], 1 - uv[1]]
        ws = sk[vi] + [(0, 0)] * (4 - len(sk[vi])); J += [j for j, _ in ws]; Wt += [w for _, w in ws]
    b = lambda fmt, a: base64.b64encode(struct.pack('<%d%s' % (len(a), fmt), *a)).decode()
    g = {'color': color, 'count': len(verts), 'position': b('f', pos), 'normal': b('f', nrm), 'uv': b('f', uvs),
         'index': b('I', idx), 'skinIndex': b('H', J), 'skinWeight': b('f', Wt)}
    g.update(extra)
    return g, verts

sk_j = skin(jeans)
sk_b = skin(belt, legs_apart=False)
gj, _ = record(jeans, sk_j, '#b8d6f8', texture='jeans_color.webp', credit='"Baggy gray denim jeans" by jaket vintage (sketchfab.com/biasagadianggap1266), CC-BY-4.0',
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
