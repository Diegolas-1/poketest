"""Readers and a writer for the people tools that work from the game's X/Y models
(the doll bases, tools/people/derive_doll.py): SMD (the models' own export, with
bone weights), GLB (web/world/local/ash.glb), and a skinned GLB writer.

Matrices are 4x4 numpy arrays acting on column vectors; quaternions are [x, y, z, w].
"""
import json, struct
import numpy as np


# ---------- maths ----------
def euler_xyz(rx, ry, rz):
    """SMD's rotation: X first, then Y, then Z (R = Rz Ry Rx)"""
    cx, sx, cy, sy, cz, sz = np.cos(rx), np.sin(rx), np.cos(ry), np.sin(ry), np.cos(rz), np.sin(rz)
    X = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Y = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Z = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Z @ Y @ X


def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def mat_quat(m):
    t = np.trace(m)
    if t > 0:
        s = np.sqrt(t + 1) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4]
    else:
        i = int(np.argmax(np.diag(m)))
        j, k = (i + 1) % 3, (i + 2) % 3
        s = np.sqrt(1 + m[i, i] - m[j, j] - m[k, k]) * 2
        q = [0, 0, 0, 0]
        q[i] = s / 4; q[j] = (m[j, i] + m[i, j]) / s; q[k] = (m[k, i] + m[i, k]) / s; q[3] = (m[k, j] - m[j, k]) / s
    q = np.array(q)
    return q / np.linalg.norm(q)


def trs(t=(0, 0, 0), r=np.eye(3), s=1.0):
    m = np.eye(4)
    m[:3, :3] = r * s
    m[:3, 3] = t
    return m


# ---------- SMD ----------
def read_smd(path):
    """{ bones: [(name, parent)], local: [4x4] (bind pose), world: [4x4], tris: { material: [(pos, nrm, uv, [(bone, w)]) x3] } }"""
    lines = open(path, encoding='utf-8', errors='replace').read().splitlines()
    i, bones, local, tris = 0, [], {}, {}
    while i < len(lines):
        ln = lines[i].strip()
        if ln == 'nodes':
            i += 1
            while lines[i].strip() != 'end':
                a = lines[i].split('"')
                idx = int(a[0]); name = a[1]; par = int(a[2])
                bones.append((idx, name, par)); i += 1
        elif ln == 'skeleton':
            i += 1
            while lines[i].strip() != 'end':
                p = lines[i].split()
                if p[0] == 'time':
                    i += 1; continue
                v = list(map(float, p[1:]))
                local.setdefault(int(p[0]), trs(v[:3], euler_xyz(*v[3:6])))
                i += 1
        elif ln == 'triangles':
            i += 1
            while lines[i].strip() != 'end':
                mat = lines[i].strip(); tri = []
                for k in range(3):
                    p = lines[i + 1 + k].split()
                    pos = list(map(float, p[1:4])); nrm = list(map(float, p[4:7])); uv = list(map(float, p[7:9]))
                    links = []
                    if len(p) > 9:
                        n = int(p[9])
                        links = [(int(p[10 + 2 * q]), float(p[11 + 2 * q])) for q in range(n)]
                    if not links:
                        links = [(int(p[0]), 1.0)]
                    tri.append((pos, nrm, uv, links))
                tris.setdefault(mat, []).append(tri)
                i += 4
        else:
            i += 1
    byidx = {b[0]: b for b in bones}
    world = {}
    def wm(k):
        if k not in world:
            par = byidx[k][2]
            world[k] = (wm(par) if par >= 0 else np.eye(4)) @ local.get(k, np.eye(4))
        return world[k]
    for b in bones:
        wm(b[0])
    return {'bones': {b[0]: (b[1], b[2]) for b in bones}, 'local': local, 'world': world, 'tris': tris}


# ---------- GLB ----------
CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8, 5122: np.int16, 5120: np.int8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    g = json.loads(b[20:20 + n])
    binary = b[20 + n + 8:]
    def acc(i):
        a = g['accessors'][i]; v = g['bufferViews'][a['bufferView']]
        k = NC[a['type']]; dt = CT[a['componentType']]
        stride = v.get('byteStride'); off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        if stride and stride != k * np.dtype(dt).itemsize:
            raw = np.frombuffer(binary, np.uint8, stride * a['count'], off).reshape(a['count'], stride)
            return raw[:, :k * np.dtype(dt).itemsize].copy().view(dt).reshape(a['count'], k)
        return np.frombuffer(binary, dt, a['count'] * k, off).reshape(a['count'], k)
    def image(i):
        im = g['images'][i]; v = g['bufferViews'][im['bufferView']]
        return binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']], im.get('mimeType', 'image/png')
    return g, acc, image


def node_local(nd):
    if 'matrix' in nd:
        return np.array(nd['matrix']).reshape(4, 4).T
    return trs(nd.get('translation', [0, 0, 0]), quat_mat(nd.get('rotation', [0, 0, 0, 1])), 1.0) @ np.diag(list(nd.get('scale', [1, 1, 1])) + [1])


# ---------- writer ----------
def write_glb(path, bones, meshes, images):
    """bones: [{name, parent (index or -1), t, q}] (bind pose = rest pose);
    meshes: [{name, pos (n,3), nrm, uv, joints (n,4), weights (n,4), idx (m,3), image (index or None), color}];
    images: [png bytes]"""
    blob = bytearray(); views = []; accs = []
    def add(arr, target=None, kind=None, minmax=False):
        arr = np.ascontiguousarray(arr)
        while len(blob) % 4:
            blob.append(0)
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': arr.nbytes, **({'target': target} if target else {})})
        blob.extend(arr.tobytes())
        ct = {np.float32: 5126, np.uint16: 5123, np.uint32: 5125, np.uint8: 5121}[arr.dtype.type]
        a = {'bufferView': len(views) - 1, 'componentType': ct, 'count': int(arr.shape[0]), 'type': kind}
        if minmax:
            a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a)
        return len(accs) - 1
    nodes = []
    root = len(bones)   # the bones, then the armature root holding the root bones and the meshes
    for i, b in enumerate(bones):
        nodes.append({'name': b['name'], 'translation': [float(x) for x in b['t']], 'rotation': [float(x) for x in b['q']],
                      'children': [j for j, c in enumerate(bones) if c['parent'] == i]})
    for nd in nodes:
        if not nd['children']:
            del nd['children']
    world = []
    for i, b in enumerate(bones):
        m = trs(b['t'], quat_mat(b['q']))
        world.append(world[b['parent']] @ m if b['parent'] >= 0 else m)
    ibm = np.array([np.linalg.inv(w).T.reshape(-1) for w in world], np.float32)
    skin = {'joints': list(range(len(bones))), 'inverseBindMatrices': add(ibm, None, 'MAT4'), 'skeleton': [i for i, b in enumerate(bones) if b['parent'] < 0][0]}
    gm, mats, texs = [], [], []
    img_idx = []
    for im in images:
        while len(blob) % 4:
            blob.append(0)
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(im)})
        blob.extend(im)
        img_idx.append({'bufferView': len(views) - 1, 'mimeType': 'image/png'})
    mesh_nodes = []
    for m in meshes:
        attrs = {'POSITION': add(m['pos'].astype(np.float32), 34962, 'VEC3', True),
                 'NORMAL': add(m['nrm'].astype(np.float32), 34962, 'VEC3'),
                 'JOINTS_0': add(m['joints'].astype(np.uint16), 34962, 'VEC4'),
                 'WEIGHTS_0': add(m['weights'].astype(np.float32), 34962, 'VEC4')}
        if m.get('uv') is not None:
            attrs['TEXCOORD_0'] = add(m['uv'].astype(np.float32), 34962, 'VEC2')
        idx = add(m['idx'].reshape(-1).astype(np.uint32), 34963, 'SCALAR')
        mat = {'name': m['name'], 'pbrMetallicRoughness': {'baseColorFactor': list(m.get('color', [1, 1, 1, 1])), 'metallicFactor': 0, 'roughnessFactor': 1}}
        if m.get('image') is not None:
            texs.append({'source': m['image'], 'sampler': 0})
            mat['pbrMetallicRoughness']['baseColorTexture'] = {'index': len(texs) - 1}
        mats.append(mat)
        gm.append({'name': m['name'], 'primitives': [{'attributes': attrs, 'indices': idx, 'material': len(mats) - 1}]})
        nodes.append({'name': m['name'], 'mesh': len(gm) - 1, 'skin': 0})
        mesh_nodes.append(len(nodes) - 1)
    nodes.append({'name': 'armature', 'children': [i for i, b in enumerate(bones) if b['parent'] < 0] + mesh_nodes})
    g = {'asset': {'version': '2.0', 'generator': 'tools/people/xy.py'}, 'scene': 0, 'scenes': [{'nodes': [len(nodes) - 1]}],
         'nodes': nodes, 'meshes': gm, 'skins': [skin], 'materials': mats, 'accessors': accs, 'bufferViews': views,
         'buffers': [{'byteLength': len(blob)}]}
    if images:
        g['images'] = img_idx; g['textures'] = texs; g['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    js = json.dumps(g).encode()
    js += b' ' * (-len(js) % 4)
    while len(blob) % 4:
        blob.append(0)
    with open(path, 'wb') as f:
        f.write(b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(blob)))
        f.write(struct.pack('<I', len(js)) + b'JSON' + js)
        f.write(struct.pack('<I', len(blob)) + b'BIN\0' + bytes(blob))
