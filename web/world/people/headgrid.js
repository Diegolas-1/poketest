// The head's shape, from VRoid's CC0 base heads (VRoid Project's Base_Male and
// Base_Female; tools/people/build_head.py made web/world/people/head.bin from
// them): two signed distance grids in head units (chin 0, crown 1, x left, z
// forward from the skull's middle) and the landmarks measured on them (eyes,
// brows, nose, mouth, ears).
//
//   loadHeads(url)            once, before anatomy() (gen.js loadBase does it)
//   heads()                   the loaded data (null before)
//   headField(o)              a person's head: o = { c (the chin's middle, world), hh, hw, hd
//                             (height, width, depth, metres), sex (0..1 blends the two heads),
//                             kid (0..1: a child's rounder, fuller lower face) } -> f(x, y, z)
let HEADS = null;

export async function loadHeads(url = new URL('./head.bin', import.meta.url)) {
  if (HEADS) return HEADS;
  let ab;
  if (typeof fetch !== 'undefined' && !String(url).startsWith('file:')) ab = await (await fetch(url)).arrayBuffer();
  else { const fs = await import('node:fs'); const b = fs.readFileSync(new URL(url)); ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
  const u8 = new Uint8Array(ab), n = new DataView(ab).getUint32(4, true);
  const meta = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + n)));
  const comp = u8.subarray(8 + n);
  let raw;
  if (typeof DecompressionStream !== 'undefined') raw = new Uint8Array(await new Response(new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  else raw = new Uint8Array((await import('node:zlib')).inflateSync(comp));
  const [nx, ny, nz] = meta.dims, size = nx * ny * nz;
  meta.grids = meta.heads.map((_, i) => new Int8Array(raw.buffer, raw.byteOffset + i * size, size));
  HEADS = meta;
  return meta;
}
export const heads = () => HEADS;
export function setHeads(h) { HEADS = h; }

// the two heads' landmarks blended (head units)
export function headLandmarks(sex = 0.5) {
  const [m, f] = HEADS.heads, k = Math.min(1, Math.max(0, sex));
  const mix = (a, b) => (Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * k) : a + (b - a) * k);
  const out = {};
  for (const key of ['width', 'depth', 'eye', 'iris_h', 'iris_w', 'eye_top', 'brow', 'mouth', 'nose', 'ear']) out[key] = mix(m[key], f[key]);
  return out;
}

export function headField(o) {
  const H = HEADS, [nx, ny, nz] = H.dims, vox = H.vox, [bx, by, bz] = H.box, band = H.band;
  const gm = H.grids[0], gf = H.grids[1], k = Math.min(1, Math.max(0, o.sex ?? 0.5)), kid = o.kid || 0;
  const lm = headLandmarks(k);
  const sx = lm.width / (o.hw / o.hh), sz = lm.depth / (o.hd / o.hh);   // person -> grid scale (in head heights)
  const [cx, cy, cz] = o.c, hh = o.hh, q = band / 127;
  const at = (g, i, j, l) => g[(i * ny + j) * nz + l];
  const sample = (u, v, w) => {
    // grid coordinates; outside the grid: the band's edge plus the distance to it
    let fi = (u - bx[0]) / vox, fj = (v - by[0]) / vox, fk = (w - bz[0]) / vox, extra = 0;
    const ci = Math.min(nx - 1.001, Math.max(0, fi)), cj = Math.min(ny - 1.001, Math.max(0, fj)), ck = Math.min(nz - 1.001, Math.max(0, fk));
    extra = Math.hypot(fi - ci, fj - cj, fk - ck) * vox;
    const i = Math.floor(ci), j = Math.floor(cj), l = Math.floor(ck), a = ci - i, b = cj - j, c = ck - l;
    let d = 0;
    for (const [g, wg] of [[gm, 1 - k], [gf, k]]) {
      if (wg < 1e-3) continue;
      const v000 = at(g, i, j, l), v100 = at(g, i + 1, j, l), v010 = at(g, i, j + 1, l), v110 = at(g, i + 1, j + 1, l);
      const v001 = at(g, i, j, l + 1), v101 = at(g, i + 1, j, l + 1), v011 = at(g, i, j + 1, l + 1), v111 = at(g, i + 1, j + 1, l + 1);
      const x00 = v000 + (v100 - v000) * a, x10 = v010 + (v110 - v010) * a, x01 = v001 + (v101 - v001) * a, x11 = v011 + (v111 - v011) * a;
      const y0 = x00 + (x10 - x00) * b, y1 = x01 + (x11 - x01) * b;
      d += (y0 + (y1 - y0) * c) * wg;
    }
    return d * q + extra;
  };
  return (x, y, z) => {
    const v = (y - cy) / hh;
    // a child's lower face is fuller and rounder: below the eyes the head is sampled nearer its middle
    const low = kid * Math.max(0, 1 - v / 0.5);
    const u = (x - cx) / hh * sx * (1 - 0.14 * low), w = (z - cz) / hh * sz * (1 - 0.06 * low);
    return sample(u, v, w) * hh;
  };
}
