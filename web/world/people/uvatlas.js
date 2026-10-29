// UVs for any generated mesh (the body, garments, hair), made when a person is
// exported with baked textures (export.js): the triangles are grouped into charts
// by which way they face (six directions) and by touching each other, each chart
// laid flat by projecting it on its direction's plane, and the charts packed into
// the unit square on shelves, all at one texel density. Vertices on a chart's
// border are split (one copy per chart), so the mesh comes back with more of them.
//
// atlas(mesh, { pad, weight(face centre) -> texel density factor }) -> { mesh: the
// mesh with vertices split and every per-vertex array carried over, uv: Float32Array }
export function atlas(mesh, o = {}) {
  const P = mesh.pos, I = mesh.idx, nf = I.length / 3, nv = P.length / 3;
  // 1. each face's direction (0..5: +x -x +y -y +z -z)
  const dir = new Uint8Array(nf), area = new Float64Array(nf);
  for (let t = 0; t < nf; t++) {
    const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    area[t] = Math.hypot(nx, ny, nz) / 2;
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    dir[t] = ax >= ay && ax >= az ? (nx > 0 ? 0 : 1) : ay >= az ? (ny > 0 ? 2 : 3) : (nz > 0 ? 4 : 5);
  }
  // 2. charts: faces of one direction joined across shared edges
  const edgeFaces = new Map();
  for (let t = 0; t < nf; t++) for (let k = 0; k < 3; k++) {
    const a = I[3 * t + k], b = I[3 * t + (k + 1) % 3], key = a < b ? a * nv + b : b * nv + a;
    const l = edgeFaces.get(key); if (l) l.push(t); else edgeFaces.set(key, [t]);
  }
  const chart = new Int32Array(nf).fill(-1);
  let nc = 0;
  for (let s = 0; s < nf; s++) {
    if (chart[s] >= 0) continue;
    const stack = [s]; chart[s] = nc;
    while (stack.length) {
      const t = stack.pop();
      for (let k = 0; k < 3; k++) {
        const a = I[3 * t + k], b = I[3 * t + (k + 1) % 3], key = a < b ? a * nv + b : b * nv + a;
        for (const u of edgeFaces.get(key)) if (chart[u] < 0 && dir[u] === dir[t]) { chart[u] = nc; stack.push(u); }
      }
    }
    nc++;
  }
  // 3. split vertices per chart and project
  const AX = [[2, 1], [2, 1], [0, 2], [0, 2], [0, 1], [0, 1]], FLIP = [true, false, false, true, false, true];
  const newOf = new Map(), src = [], uv2 = [], idx = new Uint32Array(I.length), cof = [];
  for (let t = 0; t < nf; t++) for (let k = 0; k < 3; k++) {
    const v = I[3 * t + k], c = chart[t], key = v * nc + c;
    let n = newOf.get(key);
    if (n === undefined) {
      n = src.length; newOf.set(key, n); src.push(v); cof.push(c);
      const [i, j] = AX[dir[t]];
      uv2.push(FLIP[dir[t]] ? -P[3 * v + i] : P[3 * v + i], P[3 * v + j]);
    }
    idx[3 * t + k] = n;
  }
  // 4. chart boxes, scaled by their texel density, packed on shelves
  const w = o.weight || null, dens = new Float64Array(nc).fill(1);
  if (w) {
    const acc = new Float64Array(nc), cnt = new Float64Array(nc);
    for (let t = 0; t < nf; t++) { const a = 3 * I[3 * t]; acc[chart[t]] += w(P[a], P[a + 1], P[a + 2]); cnt[chart[t]]++; }
    for (let c = 0; c < nc; c++) dens[c] = Math.sqrt(acc[c] / cnt[c]);
  }
  const box = Array.from({ length: nc }, () => [Infinity, Infinity, -Infinity, -Infinity]);
  for (let n = 0; n < src.length; n++) { const b = box[cof[n]], u = uv2[2 * n] * dens[cof[n]], v = uv2[2 * n + 1] * dens[cof[n]]; if (u < b[0]) b[0] = u; if (v < b[1]) b[1] = v; if (u > b[2]) b[2] = u; if (v > b[3]) b[3] = v; }
  const order = [...Array(nc).keys()].sort((a, b) => (box[b][3] - box[b][1]) - (box[a][3] - box[a][1]));
  let tot = 0; for (const b of box) tot += (b[2] - b[0]) * (b[3] - b[1]);
  const pack = (side, pad) => {
    const at = new Float64Array(nc * 2);
    let x = 0, y = 0, rowH = 0;
    for (const c of order) {
      const bw = box[c][2] - box[c][0] + pad, bh = box[c][3] - box[c][1] + pad;
      if (x + bw > side) { x = 0; y += rowH; rowH = 0; }
      if (bw > side) return null;
      at[2 * c] = x; at[2 * c + 1] = y; x += bw; rowH = Math.max(rowH, bh);
    }
    return y + rowH <= side ? at : null;
  };
  // the smallest square side (in metres of surface) the charts fit in, with a padding of a few texels
  let side = Math.sqrt(tot) * 1.1, at = null, padT = o.pad ?? 4 / (o.size || 1024);
  for (let i = 0; i < 40 && !at; i++) { at = pack(side, side * padT); if (!at) side *= 1.06; }
  const pad = side * padT, uv = new Float32Array(src.length * 2);
  for (let n = 0; n < src.length; n++) {
    const c = cof[n];
    uv[2 * n] = (uv2[2 * n] * dens[c] - box[c][0] + at[2 * c] + pad / 2) / side;
    uv[2 * n + 1] = (uv2[2 * n + 1] * dens[c] - box[c][1] + at[2 * c + 1] + pad / 2) / side;
  }
  // 5. carry every per-vertex array over to the split vertices
  const out = { idx, uv };
  for (const [k, arr] of Object.entries(mesh)) {
    if (k === 'idx' || !arr || !arr.length || arr.length % nv) continue;
    const wdt = arr.length / nv, a = new arr.constructor(src.length * wdt);
    for (let n = 0; n < src.length; n++) for (let j = 0; j < wdt; j++) a[n * wdt + j] = arr[src[n] * wdt + j];
    out[k] = a;
  }
  return { mesh: out, uv, charts: nc };
}
