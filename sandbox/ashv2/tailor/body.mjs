// Ash V2's body, read from ashv2.glb for the tailor: the skin (welded: one point per place on it),
// its normals and skinning, the bones' bind positions; and a quick nearest-point search over it.
// Bind space: Y up, front +Z, his left +X, 2 units tall. 1 unit = 75 cm (he stands 150 cm).
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CM = 1 / 75;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(path.join(process.env.GTX || '', 'node_modules') + '/');

export async function loadBody(file = path.join(HERE, '../ashv2.glb')) {
  const { NodeIO } = req('@gltf-transform/core');
  const { ALL_EXTENSIONS } = req('@gltf-transform/extensions');
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
  const root = doc.getRoot(), prim = root.listMeshes()[0].listPrimitives()[0], skin = root.listSkins()[0];
  const pos = prim.getAttribute('POSITION'), nrm = prim.getAttribute('NORMAL');
  const J0 = prim.getAttribute('JOINTS_0'), W0 = prim.getAttribute('WEIGHTS_0');
  const names = skin.listJoints().map((j) => j.getName());
  const ibm = skin.getInverseBindMatrices();
  const bind = {};
  names.forEach((n, i) => { bind[n] = invertPos(ibm.getElement(i, [])); });
  const key = new Map(), weld = new Int32Array(pos.getCount()), P = [], N = [], J = [], W = [];
  const a = [], b = [], c = [], d = [];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, a); nrm.getElement(i, b);
    const k = Math.round(a[0] * 2e4) + ',' + Math.round(a[1] * 2e4) + ',' + Math.round(a[2] * 2e4);
    let w = key.get(k);
    if (w === undefined) {
      w = P.length / 3; key.set(k, w); P.push(...a); N.push(0, 0, 0);
      J0.getElement(i, c); W0.getElement(i, d); J.push(...c); W.push(...d);
    }
    weld[i] = w; N[w * 3] += b[0]; N[w * 3 + 1] += b[1]; N[w * 3 + 2] += b[2];
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  const idx = prim.getIndices(), T = new Int32Array(idx.getCount());
  for (let i = 0; i < T.length; i++) T[i] = weld[idx.getScalar(i)];
  const body = { P: Float32Array.from(P), N: Float32Array.from(N), J: Uint16Array.from(J), W: Float32Array.from(W), T, n: P.length / 3, names, bind };
  body.grid = grid(body.P, 0.03);
  return body;
}

// a bone's bind position: the translation of the inverse of its inverse bind matrix
function invertPos(m) {
  // m is column-major 4x4 [R|t]; with R orthonormal (scaled), p = -R^-1 t
  const r = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]], t = [m[12], m[13], m[14]];
  const det = r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1]) - r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0]) + r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]);
  const inv = [
    [(r[1][1] * r[2][2] - r[1][2] * r[2][1]) / det, (r[0][2] * r[2][1] - r[0][1] * r[2][2]) / det, (r[0][1] * r[1][2] - r[0][2] * r[1][1]) / det],
    [(r[1][2] * r[2][0] - r[1][0] * r[2][2]) / det, (r[0][0] * r[2][2] - r[0][2] * r[2][0]) / det, (r[0][2] * r[1][0] - r[0][0] * r[1][2]) / det],
    [(r[1][0] * r[2][1] - r[1][1] * r[2][0]) / det, (r[0][1] * r[2][0] - r[0][0] * r[2][1]) / det, (r[0][0] * r[1][1] - r[0][1] * r[1][0]) / det],
  ];
  return [0, 1, 2].map((i) => -(inv[i][0] * t[0] + inv[i][1] * t[1] + inv[i][2] * t[2]));
}

// skin his arms and hands move (hands hang by his hips: clothes there mustn't follow or rest on them)
export function armSkin(body, below = 0.3) {
  const a = new Uint8Array(body.n);
  for (let j = 0; j < body.n; j++) { let w = 0; for (let c = 0; c < 4; c++) { const n = body.names[body.J[j * 4 + c]]; if (n.includes('Arm') || n.includes('Hand')) w += body.W[j * 4 + c]; } a[j] = w > below ? 1 : 0; }
  return a;
}
// his body as cloth feels it: smoothed (Taubin, so it doesn't shrink) until small details are gone
// (the bulge of his briefs, his kneecaps, his abs), so stiff cloth bridges them rather than
// wrapping round them; normals and a grid for it
export function smoothBody(body, iters = 40) {
  const n = body.n, P = Float32Array.from(body.P), T = body.T, nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < T.length; t += 3) for (let e = 0; e < 3; e++) { const a = T[t + e], b = T[t + (e + 1) % 3]; if (a !== b) { nb[a].add(b); nb[b].add(a); } }
  const L = nb.map((s) => [...s]), tmp = new Float32Array(n * 3);
  for (let it = 0; it < iters * 2; it++) {
    const k = it % 2 ? -0.53 : 0.5;
    for (let i = 0; i < n; i++) {
      const l = L[i]; if (!l.length) { tmp.set(P.subarray(i * 3, i * 3 + 3), i * 3); continue; }
      let x = 0, y = 0, z = 0; for (const j of l) { x += P[j * 3]; y += P[j * 3 + 1]; z += P[j * 3 + 2]; }
      tmp[i * 3] = P[i * 3] + k * (x / l.length - P[i * 3]); tmp[i * 3 + 1] = P[i * 3 + 1] + k * (y / l.length - P[i * 3 + 1]); tmp[i * 3 + 2] = P[i * 3 + 2] + k * (z / l.length - P[i * 3 + 2]);
    }
    P.set(tmp);
  }
  const N = new Float32Array(n * 3);
  for (let t = 0; t < T.length; t += 3) {
    const [a, b, c] = [T[t], T[t + 1], T[t + 2]];
    const e1 = [0, 1, 2].map((q) => P[b * 3 + q] - P[a * 3 + q]), e2 = [0, 1, 2].map((q) => P[c * 3 + q] - P[a * 3 + q]);
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) for (let q = 0; q < 3; q++) N[v * 3 + q] += f[q];
  }
  // the same way out as the skin's own normals
  for (let i = 0; i < n; i++) {
    let l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
    if (N[i * 3] * body.N[i * 3] + N[i * 3 + 1] * body.N[i * 3 + 1] + N[i * 3 + 2] * body.N[i * 3 + 2] < 0) l = -l;
    for (let q = 0; q < 3; q++) N[i * 3 + q] /= l;
  }
  return { P, N, n, grid: grid(P, 0.03) };
}

// a collider from the body and clothes already on him: points and normals, and a grid over them
export function collider(body, ...meshes) {        // body: the body, or its smoothed form
  const n = body.n + meshes.reduce((s, m) => s + m.P.length / 3, 0), P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  P.set(body.P); N.set(body.N); let o = body.n * 3;
  for (const m of meshes) { P.set(m.P, o); N.set(m.N, o); o += m.P.length; }
  return { P, N, n, grid: grid(P, 0.03), bodyN: body.n };
}

// a hash grid over points, for nearest-point queries
export function grid(P, cell) {
  const m = new Map(), n = P.length / 3;
  const k = (x, y, z) => ((Math.floor(x / cell) * 73856093) ^ (Math.floor(y / cell) * 19349663) ^ (Math.floor(z / cell) * 83492791));
  for (let i = 0; i < n; i++) { const h = k(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); let l = m.get(h); if (!l) m.set(h, (l = [])); l.push(i); }
  return {
    // the nearest point within `reach` cells, or -1
    nearest(x, y, z, reach = 1, ok = null) {
      let best = -1, bd = Infinity;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) for (let dz = -reach; dz <= reach; dz++) {
        const l = m.get(((cx + dx) * 73856093) ^ ((cy + dy) * 19349663) ^ ((cz + dz) * 83492791)); if (!l) continue;
        for (const i of l) { if (ok && !ok(i)) continue; const d = (P[i * 3] - x) ** 2 + (P[i * 3 + 1] - y) ** 2 + (P[i * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = i; } }
      }
      return best;
    },
  };
}

// girth of the body at height y (an outline round the points of a thin slice, per side if `side`)
export function girth(body, y, filter = () => true, band = 0.006) {
  const pts = [];
  for (let i = 0; i < body.n; i++) { const p = body.P.subarray(i * 3, i * 3 + 3); if (Math.abs(p[1] - y) < band && filter(p, i)) pts.push([p[0], p[2]]); }
  if (pts.length < 3) return { c: 0, pts: 0 };
  const h = hull(pts); let c = 0;
  for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; c += Math.hypot(a[0] - b[0], a[1] - b[1]); }
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return { c, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cz: (Math.min(...zs) + Math.max(...zs)) / 2, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs), pts: pts.length };
}
function hull(p) {
  p = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
