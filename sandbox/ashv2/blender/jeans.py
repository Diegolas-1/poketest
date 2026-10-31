# Ash V2's jeans (and belt), modelled in Blender round his own legs:
#   blender -b --python sandbox/ashv2/blender/jeans.py
# Builds them the way trousers are modelled: rings of cloth round his hips that split at the crotch
# into a tube per leg (one surface, the crotch seam shared by both legs). Each ring is his body's
# own cross-section there (from his mesh) plus ease; from the thigh down the leg falls straight to
# the shoe instead of following his calf. Then smoothed (subdivision), given thickness (hollow,
# with a rim at the waist and hems), and skinned: every point follows the skin of its own leg (or
# the hips above the seat), never his hands, never his feet. Saves jeans.blend and writes the
# jeans and belt into ../clothes.json for the stage.
import bpy, bmesh, json, math, struct, base64, os
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
GLB = os.path.join(HERE, '..', 'ashv2.glb')
OUT = os.path.join(HERE, '..', 'clothes.json')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
body = bpy.data.objects['model']
arm_obj = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o is not body: bpy.data.objects.remove(o)

# Blender's import of his mesh: Z up, front -Y, 1.902 tall from his feet at 0. The stage's bind
# space: Y up, front +Z, 2 tall from -1. (Stage = Blender / S, with Y/Z swapped, less 1.)
P = [v.co.copy() for v in body.data.vertices]
TOP = max(p.z for p in P); S = TOP / 2
LOW = [i for i, p in enumerate(P) if p.z < 0.62 * TOP]
CM = TOP / 150                      # he stands 150 cm
XC = -0.006 * S                     # his centre line
def to_stage(v): return (v.x / S, v.z / S - 1, -v.y / S)

# his arms and hands (they hang by his hips: the jeans neither rest on them nor follow them)
gi = {g.index: g.name for g in body.vertex_groups}
arm = [False] * len(P)
for v in body.data.vertices:
    w = sum(g.weight for g in v.groups if ('Arm' in gi[g.group] or 'Hand' in gi[g.group]))
    arm[v.index] = w > 0.3

# ---------- measurements, as heights on him ----------

Z_WAIST = 0.0 * S + S + 0.6 * CM    # where the waistband's top sits (stage y 0, a little above)
Z_CROTCH = (-0.271 + 1) * S - 2.0 * CM
Z_KNEE = (-0.5 + 1) * S
Z_HEM = (-0.9 + 1) * S              # over the top of his sneakers
# the front of his groin (his briefs bulge there): the jeans bridge straight across it
def groin(p): return abs(p.x - XC) < 6.0 * CM and p.y < 0.0 and Z_CROTCH - 1 * CM < p.z < Z_CROTCH + 13 * CM
GROIN = [groin(p) for p in P]
HEM_C = 42 * CM                     # loose straight leg: 42 cm round at the hem (and the knee)
N, M = 24, 8                        # ring points round each half of the hips; across the crotch
K = N + M                           # ring points round a leg

# ---------- his body's outline at a height, as a radius at every angle round a centre ----------
BINS = 120
def outline(z, keep, centre, band=0.6 * CM):
    r = [0.0] * BINS
    for i in LOW:
        p = P[i]
        if abs(p.z - z) > band or arm[i] or GROIN[i] or not keep(p): continue
        dx, dy = p.x - centre[0], p.y - centre[1]
        a = math.atan2(dx, -dy) % (2 * math.pi)      # 0: straight ahead (-Y), pi/2: his left (+X)
        b = int(a / (2 * math.pi) * BINS) % BINS
        r[b] = max(r[b], math.hypot(dx, dy))
    # fill gaps (no skin at that angle) from neighbours, then smooth round the ring
    for _ in range(BINS):
        if all(r): break
        r = [x if x else max(r[(i - 1) % BINS], r[(i + 1) % BINS]) for i, x in enumerate(r)]
    for _ in range(3): r = [(r[(i - 2) % BINS] + 2 * r[(i - 1) % BINS] + 3 * r[i] + 2 * r[(i + 1) % BINS] + r[(i + 2) % BINS]) / 9 for i in range(BINS)]
    return lambda a: r[int((a % (2 * math.pi)) / (2 * math.pi) * BINS) % BINS]

def centre_of(z, keep, band=0.6 * CM):
    sel = [P[i] for i in LOW if abs(P[i].z - z) < band and not arm[i] and keep(P[i])]
    xs = [p.x for p in sel]; ys = [p.y for p in sel]
    return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)

everything = lambda p: True
side = {1: lambda p: p.x > XC, -1: lambda p: p.x < XC}

# ---------- rings ----------
bm = bmesh.new()
def ring_verts(pts): return [bm.verts.new(Vector(p)) for p in pts]

# the hips: from the waist down to the crotch, round his whole pelvis
hip_rows = []
n_hip = max(4, round((Z_WAIST - Z_CROTCH) / (1.2 * CM)))
for r in range(n_hip + 1):
    z = Z_WAIST - (Z_WAIST - Z_CROTCH) * r / n_hip
    zz = max(z, Z_CROTCH + 1 * CM)                  # his own outline there (low down: the tops of his thighs, so the front and back curve in to the crotch)
    c = centre_of(zz, everything); R = outline(zz, everything, (XC, c[1]))
    # snug at the waist (a belt holds them), roomier over the seat
    ease = (1.2 + 1.6 * min(1, r / (n_hip * 0.5))) * CM
    pts = []
    for k in range(2 * N):
        a = 2 * math.pi * k / (2 * N)
        rr = R(a) + ease
        pts.append((XC + math.sin(a) * rr, c[1] - math.cos(a) * rr, z))
    hip_rows.append(ring_verts(pts))
last = hip_rows[-1]
for a, b in zip(hip_rows, hip_rows[1:]):
    for k in range(2 * N): bm.faces.new((a[k], a[(k + 1) % (2 * N)], b[(k + 1) % (2 * N)], b[k]))

# the crotch seam: under his seat, from the back of the hips to the front, on his centre line
back, front = last[N].co, last[0].co
crotch = []
for j in range(1, M):
    t = j / M
    crotch.append(bm.verts.new(Vector((XC, back.y + (front.y - back.y) * t, Z_CROTCH - 0.6 * CM * math.sin(math.pi * t)))))

# each leg: its first ring is half the hips and the crotch seam, then rings round that leg alone
def leg(s):
    first = (last[0:N + 1] + crotch) if s > 0 else (last[N:2 * N] + [last[0]] + crotch[::-1])
    rows = [first]
    n_leg = max(4, round((Z_CROTCH - Z_HEM) / (1.2 * CM)))
    # the line the leg hangs along: from his thigh at the seat to his ankle
    top_c = centre_of(Z_CROTCH - 4 * CM, side[s]); hem_c = centre_of(Z_HEM + 4 * CM, side[s])
    for r in range(1, n_leg + 1):
        z = Z_CROTCH - (Z_CROTCH - Z_HEM) * r / n_leg
        u = (Z_CROTCH - z) / (Z_CROTCH - Z_HEM)
        c = (top_c[0] + (hem_c[0] - top_c[0]) * u, top_c[1] + (hem_c[1] - top_c[1]) * u)
        R = outline(min(z, Z_CROTCH - 2 * CM), side[s], c)
        # the straight leg: never narrower than the hem's width, never closer than ease to him
        thigh = smooth(Z_CROTCH, Z_KNEE, z)            # 0 at the seat, 1 at the knee
        ease = (2.4 - 0.8 * thigh) * CM
        rmin = HEM_C / (2 * math.pi) * thigh
        pts = []
        for k in range(K):
            if k <= N: a = math.radians(-25 + 230 * k / N)
            else: a = math.radians(205 + 130 * (k - N) / M)
            d = (math.sin(a) * s, -math.cos(a))
            rr = max(R(math.atan2(d[0], -d[1])) + ease, rmin)
            pts.append((c[0] + d[0] * rr, c[1] + d[1] * rr, z))
        if s < 0:                                    # the right leg's ring runs the other way round
            pts = pts[N::-1] + pts[:N:-1]
        # the top of the leg eases out of the hips (the crotch curve) over its first 9 cm
        t = smooth(Z_CROTCH, Z_CROTCH - 9 * CM, z)
        pts = [(f.co.x + (q[0] - f.co.x) * t, f.co.y + (q[1] - f.co.y) * t, z) for f, q in zip(first, pts)]
        rows.append(ring_verts(pts))
    for a, b in zip(rows, rows[1:]):
        for k in range(K): bm.faces.new((a[k], a[(k + 1) % K], b[(k + 1) % K], b[k]))
    return rows

def smooth(z0, z1, z):
    t = min(1, max(0, (z0 - z) / (z0 - z1))); return t * t * (3 - 2 * t)

legs = {1: leg(1), -1: leg(-1)}
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

# ---------- relax it (rings to rings, the waist and hems stay level), and keep it off his body ----------
bvh = BVHTree.FromPolygons(P, [list(p.vertices) for p in body.data.polygons if not any(GROIN[i] for i in p.vertices)])
waist = set(hip_rows[0]); hems = set(legs[1][-1]) | set(legs[-1][-1])
for it in range(20):
    new = {}
    for v in bm.verts:
        nb = [e.other_vert(v) for e in v.link_edges]
        avg = sum((x.co for x in nb), Vector()) / len(nb)
        p = v.co + (avg - v.co) * 0.5
        if v in waist or v in hems: p.z = v.co.z
        new[v] = p
    for v, p in new.items(): v.co = p
    for v in bm.verts:
        hit = bvh.find_nearest(v.co)
        if hit[0] is None: continue
        loc, nrm = hit[0], hit[1]
        d = (v.co - loc).dot(nrm)
        if d < 0.8 * CM: v.co += nrm * (0.8 * CM - d)

hip_co = [[v.co.copy() for v in row] for row in hip_rows]
mesh = bpy.data.meshes.new('jeans'); bm.to_mesh(mesh); bm.free()
jeans = bpy.data.objects.new('jeans', mesh); bpy.context.collection.objects.link(jeans)
bpy.context.view_layer.objects.active = jeans; jeans.select_set(True)
# make sure the outside faces out
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
sub = jeans.modifiers.new('smooth', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
sol = jeans.modifiers.new('cloth', 'SOLIDIFY'); sol.thickness = 0.35 * CM; sol.offset = 1; sol.use_rim = True
for m in list(jeans.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
for p in jeans.data.polygons: p.use_smooth = True

# ---------- the belt: a strap round the waistband and a buckle at the front ----------
def belt_obj():
    bm = bmesh.new()
    rows = []
    for zrow, src in ((Z_WAIST - 0.6 * CM, hip_co[0]), (Z_WAIST - 3.0 * CM, hip_co[2])):
        cy = sum(c.y for c in src) / len(src)
        pts = []
        for c in src:
            d = Vector((c.x - XC, c.y - cy, 0)).normalized()
            pts.append(bm.verts.new(Vector((c.x, c.y, zrow)) + d * 0.45 * CM))
        rows.append(pts)
    n = len(rows[0])
    for k in range(n): bm.faces.new((rows[0][k], rows[0][(k + 1) % n], rows[1][(k + 1) % n], rows[1][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('belt'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('belt', me); bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    m = o.modifiers.new('leather', 'SOLIDIFY'); m.thickness = 0.35 * CM; m.offset = 1
    bpy.ops.object.modifier_apply(modifier='leather')
    # the buckle: a flat plate at his front, over the strap
    f = hip_co[1][0]
    bpy.ops.mesh.primitive_cube_add(size=1, location=(f.x, f.y - 0.9 * CM, Z_WAIST - 1.8 * CM))
    bk = bpy.context.active_object; bk.name = 'buckle'; bk.scale = (4.0 * CM, 0.5 * CM, 3.0 * CM)
    bpy.ops.object.transform_apply(scale=True)
    return o, bk
belt, buckle = belt_obj()

# ---------- skinning ----------
# glTF joint order (the stage's bone indices)
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

def skin(o, legs_apart=True, z_split=Z_CROTCH + 1 * CM):
    vs = o.data.vertices; W = []
    for v in vs:
        p = v.co
        if legs_apart and p.z < z_split:
            # a leg looks for skin from in towards the middle of that leg, at its own height
            s = 1 if p.x > XC else -1
            c = centre_of_cached(p.z, s)
            q = Vector((c[0] + (p.x - c[0]) * 0.45, c[1] + (p.y - c[1]) * 0.45, p.z))
            hits = trees[s].find_n(q, 6)
        else:
            hits = trees['all'].find_n(p, 6)
        acc = {}
        for (co, i, d) in hits:
            k = 1 / (d + 1e-4)
            for n, w in weights[i].items(): acc[n] = acc.get(n, 0) + w * k
        W.append(acc)
    # smoothed across the cloth (it bends as cloth, not as skin), never across the legs
    adj = [[] for _ in vs]
    for e in o.data.edges: a, b = e.vertices; adj[a].append(b); adj[b].append(a)
    for _ in range(8):
        W2 = []
        for i, v in enumerate(vs):
            acc = dict(W[i])
            for j in adj[i]:
                if legs_apart and v.co.z < z_split and (vs[j].co.x > XC) != (v.co.x > XC): continue
                for n, w in W[j].items(): acc[n] = acc.get(n, 0) + w
            W2.append(acc)
        W = W2
    out = []
    for acc in W:
        top = sorted(acc.items(), key=lambda x: -x[1])[:4]; s = sum(w for _, w in top) or 1
        out.append([(jidx[n], w / s) for n, w in top])
    # Blender's own weights too, so the .blend poses with his armature
    for n in joints: o.vertex_groups.new(name=n)
    for i, ws in enumerate(out):
        for j, w in ws: o.vertex_groups[joints[j]].add([i], w, 'REPLACE')
    o.parent = arm_obj; mod = o.modifiers.new('Armature', 'ARMATURE'); mod.object = arm_obj
    return out

_cc = {}
def centre_of_cached(z, s):
    key = (round(z / CM), s)
    if key not in _cc:
        zz = min(z, Z_CROTCH - 3 * CM)
        try: _cc[key] = centre_of(zz, side[s], band=1.2 * CM)
        except ValueError: _cc[key] = (XC + s * 0.13 * S, 0)
    return _cc[key]

# ---------- out to the stage ----------
def record(o, sk, color, fabric=None, pieces=None, piece_colors=None):
    me = o.data; me.calc_loop_triangles()
    pos, nrm, uv, J, Wt = [], [], [], [], []
    for v in me.vertices:
        x, y, z = to_stage(v.co); pos += [x, y, z]
        n = v.normal; nrm += [n.x, n.z, -n.y]
        # cloth UVs in cm: round him, and up and down
        a = math.atan2(v.co.x - XC, -v.co.y); uv += [a * 12, v.co.z / CM]
        ws = sk[v.index] + [(0, 0)] * (4 - len(sk[v.index]))
        J += [j for j, _ in ws]; Wt += [w for _, w in ws]
    idx = [i for t in me.loop_triangles for i in t.vertices]
    b = lambda fmt, a: base64.b64encode(struct.pack('<%d%s' % (len(a), fmt), *a)).decode()
    g = {'color': color, 'count': len(me.vertices), 'position': b('f', pos), 'normal': b('f', nrm), 'uv': b('f', uv),
         'index': b('I', idx), 'skinIndex': b('H', J), 'skinWeight': b('f', Wt), 'pieces': pieces or [{'name': o.name, 'start': 0, 'n': len(me.vertices)}]}
    if fabric: g['fabric'] = fabric
    if piece_colors: g['pieceColors'] = piece_colors
    return g

sk_jeans = skin(jeans)
# the belt and buckle as one piece (two colours)
bpy.ops.object.select_all(action='DESELECT')
nb = len(belt.data.vertices)
buckle.select_set(True); belt.select_set(True); bpy.context.view_layer.objects.active = belt
bpy.ops.object.join()
sk_belt = skin(belt, legs_apart=False)
nall = len(belt.data.vertices)

data = json.load(open(OUT)) if os.path.exists(OUT) else {'garments': []}
gs = [g for g in data['garments'] if g['name'] not in ('jeans', 'belt')]
gs.insert(0, {'name': 'jeans', **record(jeans, sk_jeans, '#86b0dc', 'denim')})
gs.insert(1, {'name': 'belt', **record(belt, sk_belt, '#1c1c1e', None,
                                         [{'name': 'strap', 'start': 0, 'n': nb}, {'name': 'buckle', 'start': nb, 'n': nall - nb}],
                                         {'strap': '#1c1c1e', 'buckle': '#c9ccd2'})})
data['garments'] = gs
json.dump(data, open(OUT, 'w'))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'jeans.blend'))
print('JEANS', len(jeans.data.vertices), 'verts', len(jeans.data.polygons), 'faces; belt', nall, 'verts')
