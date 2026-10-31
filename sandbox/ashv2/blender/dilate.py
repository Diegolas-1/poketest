# The jeans texture for the stage: the model's texture (its unused background is black), with the
# cloth's colour grown out past the edge of every piece of it, so the edges of the pieces (and
# their mipmaps) never pick up black. 2048 webp.
#   python3 sandbox/ashv2/blender/dilate.py path/to/material_0_emissive.png sandbox/ashv2/jeans_color.webp
import sys
import numpy as np
from PIL import Image

im = Image.open(sys.argv[1]).convert('RGB')
if im.size[0] > 2048: im = im.resize((2048, 2048), Image.LANCZOS)
a = np.asarray(im).astype(np.float32)
filled = a.max(axis=2) > 14
for _ in range(48):
    if filled.all(): break
    acc = np.zeros_like(a); cnt = np.zeros(filled.shape, np.float32)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
        m = np.roll(filled, (dy, dx), (0, 1)); acc += np.roll(a, (dy, dx), (0, 1)) * m[..., None]; cnt += m
    grow = ~filled & (cnt > 0)
    a[grow] = acc[grow] / cnt[grow][:, None]; filled |= grow
Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(sys.argv[2], 'WEBP', quality=86, method=6)
print('filled', filled.mean())
