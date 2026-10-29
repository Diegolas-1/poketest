#!/usr/bin/env python3
# Gary's head: the bald skull and neck of Xerosic's model (Pokémon X/Y, a battle model, from the
# asset pack: Xerosic.SMD) fitted to the base model's head, written as web/world/heads/skull.js.
# The base model's head is only a face mask (Ash's hair was the rest of it); this fills the back
# and top of the head and the nape, so a hair cap can sit on a real head.
#   - kept: the skin of his head (the b25_face01_on_1 material) behind his face: the skull, the
#     back of the head and the neck; dropped: his face (in front of the ears, below the brow),
#     his ears, the crest and goatee (red in his texture, standing off the skull) and the headset
#   - fitted: his ears onto the base model's (at the face mask's sides), his brow onto its
#     forehead, the back of his head into the space Ash's hair filled; his stout neck taken in
#     to the base model's neck
#   - axes: his model is Z up and faces -Y; ours is Y up and faces +Z, left = +X
#   python3 tools/world/head_from_xy.py path/to/Xerosic.SMD
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
smd = Path(sys.argv[1])
L = smd.read_text(encoding='latin-1').splitlines()
i = L.index('nodes'); j = L.index('end', i)
names = {int(l.split()[0]): l.split('"')[1] for l in L[i + 1:j]}
tex = np.asarray(Image.open(smd.parent / 'images' / 'b25_face01_on_1.png').convert('RGB'))
TH, TW = tex.shape[:2]

# his landmarks (his units) and ours (model units)
EAR = np.array([12.92, 3.63, 123.94])     # the outer tip of his ear
TOP, BACK = 139.5, 15.8                     # the top of his skull (under the crest), the back of his head
OUR_EAR = np.array([0.087, 1.155, -0.012])
sx = OUR_EAR[0] / EAR[0] * 0.98
sy = (1.285 - OUR_EAR[1]) / (TOP - EAR[2])
sz = (OUR_EAR[2] + 0.1) / (BACK - EAR[1])
def ours(p):
    return np.array([p[0] * sx, OUR_EAR[1] + (p[2] - EAR[2]) * sy, OUR_EAR[2] - (p[1] - EAR[1]) * sz])

i = L.index('triangles') + 1
pos, idx, vmap = [], [], {}
kept = dropped = 0
while L[i].strip() != 'end':
    m = L[i].strip(); vs = []
    for k in range(3):
        f = L[i + 1 + k].split(); n = int(f[9]) if len(f) > 9 else 0
        bones = {names[int(f[10 + 2 * q])] for q in range(n)} if n else {names[int(f[0])]}
        vs.append((np.array(list(map(float, f[1:4]))), np.array(list(map(float, f[7:9]))), bones))
    i += 4
    if 'on_1' not in m: continue
    c = np.mean([v[0] for v in vs], 0)
    u, w = np.mean([v[1] for v in vs], 0); col = tex[int((1 - w) % 1 * (TH - 1)), int(u % 1 * (TW - 1))].astype(int)
    red = col[0] > 150 and col[1] < 110
    # the crest standing up off the back of his head and the goatee: off the skull; the band round
    # it is kept (it is the skull's shape there, under the hair); the headset
    if red and (c[2] > 136 or c[1] > 13 or np.hypot(c[0], c[1] - 2) > 16): dropped += 1; continue
    if any('Mic' in v[2] for v in vs): dropped += 1; continue
    if c[1] < EAR[1] - 2 and c[2] < 133: dropped += 1; continue                                     # his face, his chin and throat
    if abs(c[0]) > 11.3 and abs(c[1] - EAR[1]) < 3.5 and 118 < c[2] < 130: dropped += 1; continue  # his ears
    kept += 1
    for v in vs:
        key = tuple(np.round(v[0], 3))
        if key not in vmap:
            q = ours(v[0])
            # the neck taken in to ours (a tube of radius 0.03 round (0, y, -0.008)) below the jaw
            t = min(1, max(0, (1.13 - q[1]) / 0.04))
            if t > 0:
                d = np.hypot(q[0], q[2] + 0.008)
                want = min(d, 0.036)
                if d > 1e-6: k2 = 1 + (want / d - 1) * t; q[0] *= k2; q[2] = -0.008 + (q[2] + 0.008) * k2
            vmap[key] = len(pos); pos.append(q)
        idx.append(vmap[key])
pos = np.array(pos)
out = ROOT / 'web/world/heads/skull.js'
out.parent.mkdir(parents=True, exist_ok=True)
fmt = lambda a: ','.join(('%.4f' % x).rstrip('0').rstrip('.') for x in a)
out.write_text('// Gary\'s skull and neck: Xerosic\'s bald head (Pokémon X/Y) fitted to the base model\'s head\n'
               '// (tools/world/head_from_xy.py); model units, indexed triangles\n'
               'export const SKULL = {\n  pos: [' + fmt(pos.ravel()) + '],\n  idx: [' + ','.join(map(str, idx)) + '],\n};\n')
print('kept', kept, 'dropped', dropped, 'verts', len(pos), 'bounds', pos.min(0).round(3), pos.max(0).round(3), out.stat().st_size, 'bytes')
