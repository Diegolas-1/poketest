# Ash V2's T-shirt from a ready-made model, fitted to him in Blender:
#   blender -b --python sandbox/ashv2/blender/shirt_fit.py -- path/to/scene.gltf
# "T-SHIRT" (https://sketchfab.com/3d-models/t-shirt-76240162dcd747d4bb4ca3658b463b0a) by Obridje,
# CC-BY-4.0 (source/t-shirt_license.txt). Its chest logo is left off; otherwise it is kept whole and
# shaped to him by one smooth warp, as the jeans are: the torso height by height onto his (neck to
# his neck, armpits to his armpits, the hem tucked under his belt), sized to his chest with room;
# each sleeve swung about its shoulder onto his upper arm, ending above the elbow, blending into
# the torso round the armhole; then let out wherever he would come through. Skinned to his torso
# and arms. Writes the shirt into ../clothes.json.
import bpy, bmesh, json, math, struct, base64, os, sys
from mathutils import Vector, Quaternion, kdtree
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
def bone_w(v, test): return sum(g.weight for g in v.groups if test(gi[g.group]))
fore = [bone_w(v, lambda n: 'ForeArm' in n or 'Hand' in n) > 0.3 for v in body.data.vertices]
armw = [bone_w(v, lambda n: 'Arm' in n or 'Hand' in n) > 0.3 for v in body.data.vertices]
# his bones, in Blender's space (stage bind space -> Blender)
bones = {}
with open(GLB, 'rb') as f:
    f.read(12); ln, = struct.unpack('<I', f.read(4)); f.read(4); gl = json.loads(f.read(ln))
for b in arm_obj.data.bones: bones[b.name] = arm_obj.matrix_world @ b.head_local
def smoothstep(e0, e1, x):
    t = min(1, max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)

Z_WAIST = S + 0.6 * CM
Z_NECK = (0.47 + 1) * S                  # the base of his neck (back)
Z_PIT = (0.33 + 1) * S                   # his armpits
Z_HEM = Z_WAIST - 3.5 * CM               # tucked in, just under the belt
TORSO = [i for i, p in enumerate(P) if not armw[i] and Z_WAIST - 12 * CM < p.z < Z_NECK + 4 * CM]
def torso_slice(z, band=1.0 * CM): return [(P[i].x, P[i].y) for i in TORSO if abs(P[i].z - z) < band]

# ---------- the shirt: everything but the logo, one object ----------
bpy.ops.import_scene.gltf(filepath=SRC)
src = [o for o in bpy.data.objects if o.type == 'MESH' and o is not body]
# its parts: the collar, the logo (left off), and the body as three layers: the outside, a lining
# exactly 3 mm inside it, and the strips joining them at the hems. Only the outside is ever seen
# (its inside shows through the neck and sleeves), and the layers under it would show through it
# once it is shaped, so the outside and the collar are kept.
for o in src:
    if o.data.materials and 'logo' in o.data.materials[0].name: bpy.data.objects.remove(o); continue
    if o.name in ('Object_5', 'Object_6'): bpy.data.objects.remove(o)
src = [o for o in bpy.data.objects if o.type == 'MESH' and o is not body]
bpy.ops.object.select_all(action='DESELECT')
for o in src: o.select_set(True)
bpy.context.view_layer.objects.active = src[0]
if len(src) > 1: bpy.ops.object.join()
shirt = bpy.context.view_layer.objects.active; shirt.name = 'shirt'; shirt.parent = None
shirt.data.transform(shirt.matrix_world); shirt.matrix_world.identity()
for o in list(bpy.data.objects):
    if o.type == 'EMPTY': bpy.data.objects.remove(o)
bm = bmesh.new(); bm.from_mesh(shirt.data); bm.verts.ensure_lookup_table()
V = list(bm.verts)
X0 = [v.co.copy() for v in V]

# its landmarks (its own units): top, armpits, hem, torso middle; each sleeve's shoulder and cuff
zt = max(p.z for p in X0); zb = min(p.z for p in X0); H = zt - zb
low = [p for p in X0 if p.z < zb + H * 0.3]
cx = (min(p.x for p in low) + max(p.x for p in low)) / 2
cy = (min(p.y for p in low) + max(p.y for p in low)) / 2
half_low = (max(p.x for p in low) - min(p.x for p in low)) / 2
# the armpit: going down, where the cloth stops reaching out past the torso's side on its higher-armed side
# (each side on its own; the higher is the armpit: its sleeves hang differently)
pits = []
for side in (1, -1):
    in_sleeve = False                      # going down: first the sleeve reaching out, then the armpit where it stops
    for k in range(5, 75):
        z = zt - H * k / 100
        sl = [p for p in X0 if abs(p.z - z) < H * 0.01 and side * (p.x - cx) > 0]
        if not sl: continue
        out = max(side * (p.x - cx) for p in sl) > half_low * 1.12
        if out: in_sleeve = True
        elif in_sleeve: pits.append(z); break
z_pit = max(pits) if pits else zt - H * 0.45
sleeve = {}
for s in (1, -1):
    piv = Vector((cx + s * half_low * 0.85, cy, zt - H * 0.08))
    d0 = Vector((s, 0, -1)).normalized()
    cand = sorted((p for p in X0 if s * (p.x - cx) > half_low * 1.1 and p.z > z_pit - H * 0.25), key=lambda p: -(p - piv).dot(d0))
    tip = cand[:max(20, len(cand) // 25)]
    cuff = sum(tip, Vector()) / len(tip)
    axis = (cuff - piv); L = axis.length; axis.normalize()
    near = [p for p in X0 if abs((p - piv).dot(axis) - L * 0.85) < L * 0.06 and s * (p.x - cx) > half_low * 0.9]
    r = sorted(((p - piv) - axis * (p - piv).dot(axis)).length for p in near)[len(near) // 2] if near else L * 0.3
    sleeve[s] = dict(piv=piv, axis=axis, L=L, r=r)
print('shirt: height %.0f, armpits %.2f down, sleeves %.0f / %.0f long' % (H, (zt - z_pit) / H, sleeve[1]['L'], sleeve[-1]['L']))

# ---------- the torso: height by height onto his ----------
def zmap(z):                              # its top, armpits, hem -> his neck, armpits, the tuck
    if z >= z_pit: return Z_PIT + (z - z_pit) / (zt - z_pit) * (Z_NECK + 1.5 * CM - Z_PIT)
    return Z_HEM + (z - zb) / (z_pit - zb) * (Z_PIT - Z_HEM)
STEPS = 60
fit = {}
for k in range(STEPS + 1):
    z = zb + H * k / STEPS
    sl = [p for p in X0 if abs(p.z - z) < H / STEPS and abs(p.x - cx) < half_low * 1.15]
    if len(sl) < 6: continue
    sx0, sx1 = min(p.x for p in sl), max(p.x for p in sl); sy0, sy1 = min(p.y for p in sl), max(p.y for p in sl)
    za = zmap(z); bs = torso_slice(min(za, Z_NECK - 1 * CM)) or torso_slice(Z_PIT)
    bx0, bx1 = min(x for x, _ in bs), max(x for x, _ in bs); by0, by1 = min(y for _, y in bs), max(y for _, y in bs)
    ease = 2.2 * CM if za < Z_PIT else 1.4 * CM
    fit[k] = ((sx0 + sx1) / 2, (sy0 + sy1) / 2, (sx1 - sx0) / 2, (sy1 - sy0) / 2,
              (bx0 + bx1) / 2, (by0 + by1) / 2, (bx1 - bx0) / 2 + ease, (by1 - by0) / 2 + ease)
ks = sorted(fit)
sm = {}
for k in ks:                               # smoothed up and down
    near = [fit[j] for j in range(k - 3, k + 4) if j in fit]
    sm[k] = tuple(sum(c) / len(near) for c in zip(*near))
def fit_at(z):
    kf = (z - zb) / H * STEPS; k0 = max(ks[0], min(ks[-1], math.floor(kf))); k1 = min(ks[-1], k0 + 1)
    a = sm.get(k0) or sm[min(ks, key=lambda j: abs(j - k0))]; b = sm.get(k1) or a; t = max(0, min(1, kf - k0))
    return tuple(x + (y - x) * t for x, y in zip(a, b))
def torso(p):
    f = fit_at(p.z)
    return Vector((f[4] + (p.x - f[0]) * f[6] / f[2], f[5] + (p.y - f[1]) * f[7] / f[3], zmap(p.z)))

# ---------- the sleeves: swung about the shoulder onto his upper arm ----------
for s, sv in sleeve.items():
    A = bones['LeftArm' if s > 0 else 'RightArm']; F = bones['LeftForeArm' if s > 0 else 'RightForeArm']
    piv_a = torso(sv['piv'])
    cuff_a = A + (F - A) * 0.5                                     # above the elbow
    ax_a = (cuff_a - piv_a); La = ax_a.length; ax_a.normalize()
    sv['piv_a'] = piv_a; sv['rot'] = sv['axis'].rotation_difference(ax_a); sv['k_len'] = La / sv['L']
    sv['k_r'] = (4.6 * CM + 2.4 * CM) / sv['r']                      # his upper arm and room
def sleeve_map(p, sv):
    q = p - sv['piv']; t = q.dot(sv['axis']); radial = q - sv['axis'] * t
    q2 = sv['axis'] * (t * sv['k_len']) + radial * sv['k_r']
    return sv['piv_a'] + sv['rot'] @ q2
def sleeve_w(p, s):
    sv = sleeve[s]
    if s * (p.x - cx) <= 0: return 0
    t = (p - sv['piv']).dot(sv['axis']) / sv['L']
    # a sleeve is what reaches out past the torso's side (the back and front below the shoulder lie
    # along a steep sleeve's direction too, and must stay with the torso)
    out = s * (p.x - cx) - half_low * 0.9
    return smoothstep(-0.05, 0.3, t) * smoothstep(-0.06 * half_low, 0.12 * half_low, out)

for v, p in zip(V, X0):
    q = torso(p)
    for s in (1, -1):
        w = sleeve_w(p, s)
        if w: q = q * (1 - w) + sleeve_map(p, sleeve[s]) * w
    v.co = q

# ---------- tucked: the hem inside his jeans ----------
for v in V:
    w = smoothstep(Z_WAIST + 3 * CM, Z_WAIST - 1 * CM, v.co.z)
    if not w: continue
    bs = torso_slice(max(v.co.z, Z_HEM + 1 * CM));
    if not bs: continue
    bx = sum(x for x, _ in bs) / len(bs); by = sum(y for _, y in bs) / len(bs)
    d = Vector((v.co.x - bx, v.co.y - by, 0)); r = d.length or 1
    rb = max(((x - bx) * d.x + (y - by) * d.y) / r for x, y in bs) + 0.25 * CM
    if r > rb: v.co.x = bx + d.x / r * (rb + (r - rb) * (1 - w)); v.co.y = by + d.y / r * (rb + (r - rb) * (1 - w))

# ---------- let out wherever he would come through (his upper arms included, not forearms or hands) ----------
bvh = BVHTree.FromPolygons(P, [list(p.vertices) for p in body.data.polygons if not any(fore[i] for i in p.vertices)])
GAP, SIG = 0.4 * CM, 2.0 * CM
for rnd in range(6):
    src = []
    for v in V:
        hit = bvh.find_nearest(v.co, 6 * CM)
        if hit[0] is None: continue
        d = (v.co - hit[0]).dot(hit[1])
        if d < GAP: src.append((v.co.copy(), hit[1] * (GAP - d)))
    if not src: break
    kd = kdtree.KDTree(len(src))
    for i, (co, _) in enumerate(src): kd.insert(co, i)
    kd.balance()
    for v in V:
        acc = Vector(); ws = 0
        for co, i, d in kd.find_range(v.co, 2.5 * SIG):
            w = math.exp(-(d / SIG) ** 2); acc += src[i][1] * w; ws += w
        if ws: v.co += acc / max(1.0, ws)
    print('round', rnd, 'points let out', len(src))

# smooth normals facing out of him (the same for points in the same place)
OUTN = [Vector() for _ in V]
for f in bm.faces:
    c = f.calc_center_median(); n = f.normal * f.calc_area()
    # out from his body's middle, or from his arm on a sleeve
    ref = Vector((XC, sum(y for _, y in torso_slice(min(max(c.z, Z_HEM), Z_NECK - 1 * CM)) or [(0, 0)]) / max(1, len(torso_slice(min(max(c.z, Z_HEM), Z_NECK - 1 * CM)))), c.z))
    for s in (1, -1):
        if s * (c.x - XC) > 0:
            A = bones['LeftArm' if s > 0 else 'RightArm']; F = bones['LeftForeArm' if s > 0 else 'RightForeArm']
            ax = (F - A).normalized(); t = (c - A).dot(ax)
            if t > -2 * CM and ((c - A) - ax * t).length < 9 * CM: ref = A + ax * t
    if n.dot(c - ref) < 0: n = -n
    for v in f.verts: OUTN[v.index] += n
kdn = kdtree.KDTree(len(V))
for v in V: kdn.insert(v.co, v.index)
kdn.balance()
OUTN = [sum((OUTN[j] for co, j, d in kdn.find_range(v.co, 0.08 * CM)), Vector()).normalized() for v in V]
bm.to_mesh(shirt.data); bm.free()
for p in shirt.data.polygons: p.use_smooth = True

# ---------- skinning: the torso from his torso, the sleeves from his arms ----------
joints = [gl['nodes'][j]['name'] for j in gl['skins'][0]['joints']]
jidx = {n: i for i, n in enumerate(joints)}
REMAP = {'LeftUpLeg': 'Hips', 'RightUpLeg': 'Hips'}
weights = []
for v in body.data.vertices:
    w = {}
    for g in v.groups:
        n = REMAP.get(gi[g.group], gi[g.group])
        if g.weight > 0: w[n] = w.get(n, 0) + g.weight
    weights.append(w)
def tree(keep):
    ids = [i for i in range(len(P)) if keep(i)]; t = kdtree.KDTree(len(ids))
    for i in ids: t.insert(P[i], i)
    t.balance(); return t
t_all = tree(lambda i: not fore[i])
vs = shirt.data.vertices
W = []
for v in vs:
    acc = {}
    for co, i, d in t_all.find_n(v.co, 6):
        k = 1 / (d + 1e-4)
        for n, w in weights[i].items(): acc[n] = acc.get(n, 0) + w * k
    W.append(acc)
adj = [[] for _ in vs]
for e in shirt.data.edges: a, b = e.vertices; adj[a].append(b); adj[b].append(a)
same = [[j for co, j, d in kdn.find_range(v.co, 0.08 * CM) if j != v.index] for v in vs]
for i, g in enumerate(same): adj[i] += g
for _ in range(8):
    W2 = []
    for i in range(len(vs)):
        acc = dict(W[i])
        for j in adj[i]:
            for n, w in W[j].items(): acc[n] = acc.get(n, 0) + w
        W2.append(acc)
    W = W2
SK = []
for acc in W:
    top = sorted(acc.items(), key=lambda x: -x[1])[:4]; s = sum(w for _, w in top) or 1
    SK.append([(jidx[n], w / s) for n, w in top])
for n in joints: shirt.vertex_groups.new(name=n)
for i, ws in enumerate(SK):
    for j, w in ws: shirt.vertex_groups[joints[j]].add([i], w, 'REPLACE')
shirt.parent = arm_obj; m = shirt.modifiers.new('Armature', 'ARMATURE'); m.object = arm_obj

# ---------- out to the stage ----------
me = shirt.data; me.calc_loop_triangles()
uvl = me.uv_layers.active.data if me.uv_layers else None
key, verts, idx = {}, [], []
for t in me.loop_triangles:
    for li, vi in zip(t.loops, t.vertices):
        uv = tuple(uvl[li].uv) if uvl else (0.0, 0.0)
        k = (vi, round(uv[0], 5), round(uv[1], 5))
        if k not in key: key[k] = len(verts); verts.append((vi, uv))
        idx.append(key[k])
pos, nrm, uvs, J, Wt = [], [], [], [], []
for vi, uv in verts:
    v = me.vertices[vi]; pos += list(to_stage(v.co)); nn = OUTN[vi]; nrm += [nn.x, nn.z, -nn.y]
    uvs += [uv[0], 1 - uv[1]]
    ws = SK[vi] + [(0, 0)] * (4 - len(SK[vi])); J += [j for j, _ in ws]; Wt += [w for _, w in ws]
b = lambda fmt, a: base64.b64encode(struct.pack('<%d%s' % (len(a), fmt), *a)).decode()
g = {'name': 'shirt', 'color': '#1f4d3a', 'outward': True, 'count': len(verts), 'position': b('f', pos), 'normal': b('f', nrm), 'uv': b('f', uvs),
     'index': b('I', idx), 'skinIndex': b('H', J), 'skinWeight': b('f', Wt), 'pieces': [{'name': 'shirt', 'start': 0, 'n': len(verts)}],
     'credit': '"T-SHIRT" by Obridje (sketchfab.com/Obridje), CC-BY-4.0'}
data = json.load(open(OUT)) if os.path.exists(OUT) else {'garments': []}
gs = [x for x in data['garments'] if x['name'] != 'shirt']
gs.insert(2 if len(gs) >= 2 else len(gs), g)
data['garments'] = gs
json.dump(data, open(OUT, 'w'))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'shirt.blend'))
print('FIT', len(verts), 'shirt vertices')
