# SMD (Source studiomdl text) -> skinned GLB, one mesh node per material, Y up,
# facing +Z, metres. Usage: smd2glb.py in.smd texdir out.glb [--drop a,b] [--tex name=path ...]
import sys, struct, json, math, os
import numpy as np

args = sys.argv[1:]
smd, texdir, out = args[0], args[1], args[2]
drop, texover = set(), {}
hook = None
i = 3
while i < len(args):
    if args[i] == '--drop': drop = set(args[i + 1].split(',')); i += 2
    elif args[i] == '--hook': import importlib.util as iu; sp = iu.spec_from_file_location('hk', args[i + 1]); hk = iu.module_from_spec(sp); sp.loader.exec_module(hk); hook = hk.hook; i += 2
    elif args[i] == '--tex': k, v = args[i + 1].split('=', 1); texover[k] = v; i += 2
    else: raise SystemExit('bad arg ' + args[i])

lines = open(smd).read().splitlines()
nodes, skel, tris = [], {}, []
sec = None; j = 0
while j < len(lines):
    l = lines[j].strip(); j += 1
    if l in ('nodes', 'skeleton', 'triangles'): sec = l; continue
    if l == 'end': sec = None; continue
    if sec == 'nodes':
        a = l.split('"'); nodes.append((int(a[0]), a[1], int(a[2])))
    elif sec == 'skeleton':
        if l.startswith('time'): continue
        p = l.split(); skel[int(p[0])] = list(map(float, p[1:7]))
    elif sec == 'triangles':
        mat = l; vs = []
        for k in range(3):
            p = lines[j + k].split(); j
            pos = list(map(float, p[1:4])); nrm = list(map(float, p[4:7])); uv = list(map(float, p[7:9]))
            links = []
            if len(p) > 9:
                n = int(p[9])
                for m in range(n): links.append((int(p[10 + 2 * m]), float(p[11 + 2 * m])))
            if not links: links = [(int(p[0]), 1.0)]
            vs.append((pos, nrm, uv, links))
        j += 3
        tris.append((mat, vs))

def rot(rx, ry, rz):
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    X = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Y = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]); Z = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Z @ Y @ X
S = 0.01
C = np.eye(4); C[:3, :3] = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]])   # (x,y,z) -> (x, z, -y)
parent = {n[0]: n[2] for n in nodes}; names = {n[0]: n[1] for n in nodes}
W = {}
def world(b):
    if b in W: return W[b]
    t = skel[b]; M = np.eye(4); M[:3, :3] = rot(*t[3:6]); M[:3, 3] = np.array(t[:3]) * S
    W[b] = (world(parent[b]) @ M) if parent[b] >= 0 else (C @ M)
    return W[b]
bones = [n[0] for n in nodes if n[0] in skel]
for b in bones: world(b)
# skin joints = every node except the mesh dummy (70)
joints = [b for b in bones if names[b] != 'Calem']
jidx = {b: k for k, b in enumerate(joints)}

# geometry per material
groups = {}
for mat, vs in tris:
    key = os.path.splitext(mat)[0].replace('nb2_', '')
    if key in drop: continue
    groups.setdefault(key, []).append(vs)

def L(b):  # local matrix of joint b in the glTF hierarchy
    p = parent[b]
    return W[b] if p < 0 else np.linalg.inv(W[p]) @ W[b]

def quat(m):
    m = m[:3, :3]; t = np.trace(m)
    if t > 0:
        s = math.sqrt(t + 1) * 2; return [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4]
    i = int(np.argmax([m[0, 0], m[1, 1], m[2, 2]]))
    if i == 0: s = math.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; return [s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    if i == 1: s = math.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; return [(m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    s = math.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; return [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4, (m[1, 0] - m[0, 1]) / s]

buf = bytearray(); views = []; accs = []
def add(arr, comp, typ, target=None, minmax=False):
    global buf
    while len(buf) % 4: buf += b'\0'
    data = arr.tobytes(); off = len(buf); buf += data
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: v['target'] = target
    views.append(v)
    a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': int(arr.shape[0]), 'type': typ}
    if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1

gnodes, meshes, materials, textures, images = [], [], [], [], []
# joints first as nodes 0..n-1
for b in joints:
    m = L(b); n = {'name': names[b], 'translation': m[:3, 3].tolist(), 'rotation': quat(m)}
    ch = [jidx[c] for c in joints if parent[c] == b]
    if ch: n['children'] = ch
    gnodes.append(n)
ibm = np.array([np.linalg.inv(W[b]).T.reshape(-1) for b in joints], dtype=np.float32)
ibm_acc = add(ibm, 5126, 'MAT4')
Cr = C[:3, :3]
mesh_nodes = []
for key, tl in groups.items():
    seen = {}; P, N, UV, J, WT, idx = [], [], [], [], [], []
    for vs in tl:
        for pos, nrm, uv, links in vs:
            links = sorted(links, key=lambda x: -x[1])[:4]
            tot = sum(w for _, w in links) or 1
            links = [(jidx.get(bb, jidx[2]), w / tot) for bb, w in links] + [(0, 0.0)] * (4 - len(links))
            k = (tuple(round(x, 5) for x in pos + nrm + uv), tuple(links))
            if k not in seen:
                seen[k] = len(P)
                P.append((Cr @ np.array(pos)) * S); N.append(Cr @ np.array(nrm)); UV.append([uv[0], 1 - uv[1]])
                J.append([l[0] for l in links]); WT.append([l[1] for l in links])
            idx.append(seen[k])
    P = np.array(P, np.float32); N = np.array(N, np.float32); N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-9
    png = None
    if hook:
        r = hook(key, P, N, np.array(UV, np.float32), np.array(idx).reshape(-1, 3), np.array(J), np.array(WT, np.float32), [names[b] for b in joints], os.path.join(texdir, 'nb2_' + key + '.png'))
        if r is None: continue
        P, N, png = r[0].astype(np.float32), r[1].astype(np.float32), r[2]
    prim = {'attributes': {'POSITION': add(P, 5126, 'VEC3', 34962, True), 'NORMAL': add(N, 5126, 'VEC3', 34962),
            'TEXCOORD_0': add(np.array(UV, np.float32), 5126, 'VEC2', 34962), 'JOINTS_0': add(np.array(J, np.uint16), 5123, 'VEC4', 34962),
            'WEIGHTS_0': add(np.array(WT, np.float32), 5126, 'VEC4', 34962)},
            'indices': add(np.array(idx, np.uint32), 5125, 'SCALAR', 34963), 'material': len(materials)}
    tp = texover.get(key, os.path.join(texdir, 'nb2_' + key + '.png'))
    if png is None: png = open(tp, 'rb').read()
    while len(buf) % 4: buf += b'\0'
    views.append({'buffer': 0, 'byteOffset': len(buf), 'byteLength': len(png)}); buf += png
    images.append({'bufferView': len(views) - 1, 'mimeType': 'image/png', 'name': key})
    textures.append({'source': len(images) - 1, 'sampler': 0})
    materials.append({'name': key, 'pbrMetallicRoughness': {'baseColorTexture': {'index': len(textures) - 1}, 'metallicFactor': 0, 'roughnessFactor': 1}})
    meshes.append({'name': key, 'primitives': [prim]})
    gnodes.append({'name': key, 'mesh': len(meshes) - 1, 'skin': 0}); mesh_nodes.append(len(gnodes) - 1)
    print(key, len(P), 'verts', len(idx) // 3, 'tris', 'bbox', P.min(0).round(3), P.max(0).round(3))
if hook and hasattr(hk, 'extras'):
    for key, P, N, UV, idx, J, WT, png, blend in hk.extras([names[b] for b in joints], [W[b] for b in joints]):
        P = np.asarray(P, np.float32); N = np.asarray(N, np.float32)
        prim = {'attributes': {'POSITION': add(P, 5126, 'VEC3', 34962, True), 'NORMAL': add(N, 5126, 'VEC3', 34962),
                'TEXCOORD_0': add(np.asarray(UV, np.float32), 5126, 'VEC2', 34962), 'JOINTS_0': add(np.asarray(J, np.uint16), 5123, 'VEC4', 34962),
                'WEIGHTS_0': add(np.asarray(WT, np.float32), 5126, 'VEC4', 34962)},
                'indices': add(np.asarray(idx, np.uint32).reshape(-1), 5125, 'SCALAR', 34963), 'material': len(materials)}
        while len(buf) % 4: buf += b'\0'
        views.append({'buffer': 0, 'byteOffset': len(buf), 'byteLength': len(png)}); buf += png
        images.append({'bufferView': len(views) - 1, 'mimeType': 'image/png', 'name': key})
        textures.append({'source': len(images) - 1, 'sampler': 0})
        mt = {'name': key, 'pbrMetallicRoughness': {'baseColorTexture': {'index': len(textures) - 1}, 'metallicFactor': 0, 'roughnessFactor': 1}}
        if blend: mt['alphaMode'] = 'MASK'; mt['alphaCutoff'] = 0.5
        if blend in ('double', 'mask'): mt['doubleSided'] = True
        materials.append(mt); meshes.append({'name': key, 'primitives': [prim]})
        gnodes.append({'name': key, 'mesh': len(meshes) - 1, 'skin': 0}); mesh_nodes.append(len(gnodes) - 1)
        print('extra', key, len(P))
rootj = [jidx[b] for b in joints if parent[b] < 0]
gnodes.append({'name': 'Calem', 'children': rootj + mesh_nodes})
gl = {'asset': {'version': '2.0', 'generator': 'smd2glb'}, 'scene': 0, 'scenes': [{'nodes': [len(gnodes) - 1]}], 'nodes': gnodes,
      'meshes': meshes, 'materials': materials, 'textures': textures, 'images': images,
      'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
      'skins': [{'joints': list(range(len(joints))), 'inverseBindMatrices': ibm_acc, 'skeleton': rootj[0]}],
      'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(buf)}]}
while len(buf) % 4: buf += b'\0'
gl['buffers'][0]['byteLength'] = len(buf)
js = json.dumps(gl, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(buf), 0x004E4942)); f.write(buf)
print('joints', len(joints), 'wrote', out, os.path.getsize(out))
for b in [names.index if False else 0]: pass
for nm in [n[1] for n in nodes if n[0] in skel and not n[1].startswith(('RFinger','LFinger','Bag','pc_','FJ','RF','LF'))]:
    b = [n[0] for n in nodes if n[1] == nm][0]; print(nm, W[b][:3, 3].round(3))
