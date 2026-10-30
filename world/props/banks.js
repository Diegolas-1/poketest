// Stream and creek cut banks: the reusable builder for a designed earth face
// where running water has cut steeply into the land (terrain.js bankRuns,
// planned by bankplan.js). In place of the ground's own steep slope (grass
// stretched down a wall), a face modelled as the anime paints a riverbank:
//   - an overhanging turf lip round the brim: a sod edge that curls over the
//     face, drawn with the ground's own material (so the grass on top runs
//     on without a seam), grass blades hanging over its front;
//   - exposed strata under it: dark loam with root tangles poking out, then
//     orange clay, a recessed pale sand band, silty clay, a gravelly toe;
//     painted streaks, pebbles and root hairs (a canvas picture mapped by arc
//     length and height, so it never stretches), small ledges and grooves
//     where one layer juts out over the next, lumps along the face;
//   - stones: embedded in the face, a stony toe at the waterline, a few
//     boulders in the water (foam: terrain.js fallGeometries), a wet darker
//     band just above the water and moss on the damp lower part;
//   - plants: vines and moss on the face, small ferns and grass on its
//     ledges, ferns in the pockets and at the foot (veg.js sows them: bank
//     plants), exposed tree roots where trees stand near the brim (veg.js
//     calls bankTreeRoots once the trees are placed).
// The face is laid over the ground mesh, always in front of it (the mesh is
// read back where it is drawn: terrain.js meshHeight), so nothing of the
// stretched slope shows; where the bank gets low or gentle the face shrinks
// to a small dirt edge under the turf and sinks into the grass at its ends.
// One cross-section every 0.5 m along a smooth line: no seams where pieces
// join, and the faces follow the water's curves.
//
// buildBanks(runs, o) -> { pieces: [Group], turf: [Mesh], plants: [{x,y,z,s}],
// colliders: [{x, z, r}] }. Each piece (about 20 m of one side) holds the
// earth face (userData.barrier = 'bank': tools/qa/checks.js), its hanging
// grass and roots, its vines and moss, and its stones; the turf meshes go
// into the terrain group (they are ground). town.js merges the pieces per
// 40 m cell like everything else.
import * as THREE from 'three';
import { rng, fbm } from '../terrain.js';
import { boulderGeometry, mergeAll, stoneMesh, STONE } from '../stone.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { leafMaterial, pushCard, toGeometry, cards, TILE } from '../foliage.js';
import { earthMaterial, EARTH_TILES as ET } from './earth.js';
import { lipAlong } from '../grasslip.js';

const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const C = (h) => new THREE.Color(h);

// the strata, top to bottom, and the toe
export const EARTH = {
  loam: C('#6c4e3b'), loamR: C('#82604a'), clay: C('#b0764a'), clayD: C('#96603e'), sand: C('#d9b47c'), silt: C('#8e735c'),
  gravel: C('#9b8a73'), wet: C('#4a4038'), moss: C('#6e9a3e'), mossD: C('#4f7a34'), under: C('#5c4636'),
};
const GRASS = { root: C('#3f7a34'), mid: C('#6cba45'), tip: C('#b6e06a'), dry: C('#c9d873') };
const ROOT = { dark: C('#7d634e'), pale: C('#c2a884'), bark: C('#7a5e48') };
const CEL = { bands: [0.1, 0.32, 0.6], deep: [0.46, 0.5, 0.7], shade: [0.64, 0.68, 0.86], lit: [1.08, 1.05, 0.98], litAdd: [0.02, 0.015, 0] };

let LEAF_MAT = null;
// the faces' material: painted soils from the earth atlas (props/earth.js)
export const earthMat = () => earthMaterial(CEL);
// each layer's soil and the soil it is mixed with (atlas tiles, uv1)
export const LAYER_TILES = { under: [ET.roots, ET.loam], loam: [ET.loam, ET.roots], clay: [ET.clay, ET.eroded], sand: [ET.sand, ET.silt], silt: [ET.silt, ET.eroded], gravel: [ET.gravel, ET.sand] };
const leafMat = () => LEAF_MAT || (LEAF_MAT = leafMaterial('#ffffff', 0.03));

// a strip mesh builder: rows of points along u (a grid), with colours, uvs
export function grid(rowsByCol, R) {
  const pos = [], col = [], uv = [], idx = [];
  const nc = rowsByCol.length;
  for (const rows of rowsByCol) for (const v of rows) { pos.push(v.p[0], v.p[1], v.p[2]); col.push(v.c.r, v.c.g, v.c.b); uv.push(v.uv[0], v.uv[1]); }
  for (let j = 0; j < nc - 1; j++) for (let r = 0; r < R - 1; r++) {
    const a = j * R + r, b = a + R, c = b + 1, d = a + 1;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// make a grid face away from the bank (its outward side: -n): flip if not
export function faceOut(g, nx, nz) {
  g.computeVertexNormals();
  const N = g.attributes.normal;
  let s = 0; for (let i = 0; i < N.count; i += 7) s += -(N.getX(i) * nx + N.getZ(i) * nz);
  if (s < 0) {
    const I = g.index.array;
    for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
    g.index.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

// a ribbon (grass blade) or a three-sided tube (root) along points
export function strand(out, pts, w0, w1, side, c0, c1, tube = false) {
  const n = pts.length, base = out.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), w = lerp(w0, w1, t), c = c0.clone().lerp(c1, t), p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    if (!tube) {
      for (const s of [-1, 1]) { out.pos.push(p[0] + side[0] * w * s, p[1] + side[1] * w * s, p[2] + side[2] * w * s); out.col.push(c.r, c.g, c.b); }
    } else {
      const u = new THREE.Vector3(side[0], side[1], side[2]).cross(d).normalize(), v = d.clone().cross(u).normalize();
      for (let k = 0; k < 3; k++) { const a2 = k / 3 * Math.PI * 2, x = u.x * Math.cos(a2) + v.x * Math.sin(a2), y = u.y * Math.cos(a2) + v.y * Math.sin(a2), z = u.z * Math.cos(a2) + v.z * Math.sin(a2); out.pos.push(p[0] + x * w, p[1] + y * w, p[2] + z * w); out.col.push(c.r * (0.85 + 0.15 * k), c.g * (0.85 + 0.15 * k), c.b * (0.85 + 0.15 * k)); }
    }
  }
  const K = tube ? 3 : 2;
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < (tube ? 3 : 1); k++) {
    const a = base + i * K + k, b = base + i * K + (k + 1) % K, c = a + K, d = b + K;
    out.idx.push(a, c, b, b, c, d);
  }
}
// (both = a second copy turned the other way, for a one-sided material; the
// earth material's detail is read at one spot, so a root is its own colour;
// tile = the atlas soil in uv1)
export function strandGeometry(out, both = false, tile = ET.roots) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  g.setIndex(out.idx);
  g.computeVertexNormals();
  if (!both) {
    const n = out.pos.length / 3, u1 = new Float32Array(n * 2).fill(tile);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2)); g.setAttribute('uv1', new THREE.Float32BufferAttribute(u1, 2));
    return g;
  }
  const n = out.pos.length / 3, P = [], N = [], Cc = [], U = [], I = [];
  const nr = g.attributes.normal.array;
  for (const sg of [1, -1]) for (let i = 0; i < n; i++) {
    P.push(out.pos[i * 3], out.pos[i * 3 + 1], out.pos[i * 3 + 2]);
    N.push(nr[i * 3] * sg, nr[i * 3 + 1] * sg, nr[i * 3 + 2] * sg);
    Cc.push(out.col[i * 3], out.col[i * 3 + 1], out.col[i * 3 + 2]);
    U.push(0.5, 0.5);
  }
  for (const k of out.idx) I.push(k);
  for (let t = 0; t < out.idx.length; t += 3) I.push(out.idx[t] + n, out.idx[t + 2] + n, out.idx[t + 1] + n);
  const h = new THREE.BufferGeometry();
  h.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  h.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  h.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  h.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  h.setAttribute('uv1', new THREE.Float32BufferAttribute(new Float32Array(U.length).fill(tile), 2));
  h.setIndex(I);
  return h;
}

// A grid face (grid(): rows R per column) with its quads apart, so each band
// of rows gets its own pair of soils in uv1 (tiles(col, row) -> [a, b] for the
// quad below that row): a tile number is never blended across a band. Normals
// as the shared grid had them (smooth shading kept).
export function soilBands(g, R, tiles) {
  const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, U = g.attributes.uv, I = g.index.array;
  const pos = [], nrm = [], col = [], uv = [], uv1 = [], idx = [], made = new Map();
  // (a vertex is copied only where quads of different soils meet at it)
  const vert = (v, a, b) => {
    const key = v * 64 + a * 8 + b;
    let k = made.get(key);
    if (k === undefined) {
      k = pos.length / 3; made.set(key, k);
      pos.push(P.getX(v), P.getY(v), P.getZ(v)); nrm.push(N.getX(v), N.getY(v), N.getZ(v)); col.push(C.getX(v), C.getY(v), C.getZ(v)); uv.push(U.getX(v), U.getY(v)); uv1.push(a, b);
    }
    return k;
  };
  for (let t = 0; t < I.length; t += 6) {
    const q = t / 6, r = q % (R - 1), j = (q - r) / (R - 1);
    const [a, b] = tiles(j, r);
    for (let e = 0; e < 6; e++) idx.push(vert(I[t + e], a, b));
  }
  const h = new THREE.BufferGeometry();
  h.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  h.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  h.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  h.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  h.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2));
  h.setIndex(idx);
  return h;
}

// The cross-section of one sample: the turf rows (back to front, over the
// lip) and the earth rows (under the lip, down the strata to the toe).
// meshAt: the ground as drawn; f: per-sample noise.
function section(o, meshAt, yRef = o.yB) {
  const kk = sm(0.05, 0.35, o.k), full = sm(0.25, 0.8, o.k);
  const P = (d, y) => [o.x + o.nx * d, y, o.z + o.nz * d];
  // the ground as drawn along the section (highest of three probes across 0.5 m along the line)
  const d0 = o.dT - 1.4, d1 = o.dB + 1.6, DS = 0.05, M = Math.ceil((d1 - d0) / DS);
  const hm = new Float32Array(M + 1);
  for (let q = 0; q <= M; q++) {
    const d = d0 + q * DS, x = o.x + o.nx * d, z = o.z + o.nz * d;
    hm[q] = Math.max(meshAt(x, z), meshAt(x + o.tx * 0.26, z + o.tz * 0.26), meshAt(x - o.tx * 0.26, z - o.tz * 0.26));
  }
  // running max from the water outward: where the drawn ground first reaches y
  const mx = new Float32Array(M + 1); mx[0] = hm[0]; for (let q = 1; q <= M; q++) mx[q] = Math.max(mx[q - 1], hm[q]);
  const dm = (y) => {
    if (y <= mx[0]) return d0;
    for (let q = 1; q <= M; q++) if (mx[q] >= y) { const t = (y - mx[q - 1]) / Math.max(1e-6, mx[q] - mx[q - 1]); return d0 + (q - 1 + t) * DS; }
    return d1;
  };
  const hmax = (a, b) => { let m = -1e9; for (let q = Math.max(0, Math.floor((a - d0) / DS)); q <= Math.min(M, Math.ceil((b - d0) / DS)); q++) m = Math.max(m, hm[q]); return m; };
  const yB = o.yB, H = o.H;
  // noise along the bank (world position, so it runs on across pieces)
  const n1 = fbm(o.x * 0.13 + 4.1, o.z * 0.13 - 2.3, 2), n2 = fbm(o.x * 0.09 - 7.7, o.z * 0.09 + 1.9, 2), n3 = fbm(o.x * 0.21 + 13, o.z * 0.21, 2), n4 = fbm(o.x * 0.17, o.z * 0.17 + 21, 2);
  // the lip: thickness and overhang
  const lipT = lerp(0.07, 0.17 + 0.12 * n3, kk), ov = lerp(0.03, 0.16 + 0.22 * n1, kk) * (H > 1.0 ? 1 : 0.7);
  const lift = lerp(-0.06, 0.04, kk);
  const aAt = (a) => lerp(-0.1, a, kk);
  // the strata depths below the brim (collapse where the bank is low)
  const Hc = lerp(Math.min(0.6, H * 0.8), H + 0.4, full);
  // (the topsoil follows the ground; the layers under it lie level, at
  // heights read off the run's brim smoothed over 30 m, gently dipping)
  const yE0 = yB + lift - lipT;
  const lvl = (dy) => yE0 - (yRef - dy);
  const L1 = Math.min(Hc, 0.3 + 0.28 * n2 + lipT);
  const L2 = Math.min(Hc, Math.max(L1 + 0.12, lvl(0.95 + 0.5 * n1)));
  const L3 = Math.min(Hc, Math.max(L2 + 0.06, lvl(1.3 + 0.5 * n1 + 0.25 * n4)));
  const L4 = Math.min(Hc, Math.max(L3 + 0.1, lvl(2.2 + 0.5 * n1 + 0.6 * n3)));
  // how far each layer stands out in front of the slope
  const bulge = (y) => Math.max(0, fbm(o.x * 0.55 + y * 0.9, o.z * 0.55 - y * 0.7, 2) - 0.42) * 0.62;
  const A = { loam: 0.26 + 0.12 * n4, clay: 0.15, sand: 0.07, silt: 0.18, gravel: 0.2 };
  // the lip's front over the loam
  const yS = yB + lift, y0 = yS - lipT;
  const dLoam = dm(y0 - 0.03) - aAt(A.loam);
  const dLip = dLoam - ov;
  const dmB = dm(yB - 0.04);
  const yTop = Math.max(hmax(dLip, dmB + 0.3), yB) + 0.045 + (lift - 0.04);
  // ---- turf rows (back to front): [d, y, kind]
  // (the sod is a rounded cushion, as a mossy shelf's: it swells a little
  // above the ground behind and rolls over the brim in a soft curve)
  const bul = kk * (0.035 + 0.05 * n2);
  const turf = [
    [dmB + 1.15, null, 0], [dmB + 0.7, hmax(dmB + 0.45, dmB + 0.95) + lift, 1], [dmB + 0.28, hmax(dmB + 0.05, dmB + 0.5) + lift + bul * 0.4, 2],
    [dLip + 0.24, yTop + bul, 3], [dLip + 0.1, yTop + bul * 0.75, 3], [dLip + 0.035, yTop + bul * 0.2 - 0.025, 4], [dLip + 0.0, yTop - lipT * 0.4, 5],
    [dLip + 0.012, yTop - lipT * 0.75, 5], [dLip + 0.045, yTop - lipT, 6],
  ];
  // (the back row: just under the drawn ground, so the turf rises out of it)
  { const [x, , z] = P(turf[0][0], 0); turf[0][1] = meshAt(x, z) - 0.05; }
  for (let r = 1; r < 3; r++) turf[r][1] = Math.max(turf[r][1], turf[r - 1][1] + 0.0);
  // (the crown never dips under the drawn ground just behind it)
  turf[3][1] = Math.max(turf[3][1], turf[2][1]); turf[4][1] = Math.max(turf[4][1], turf[3][1] - bul * 0.4);
  // ---- earth rows (top to bottom): [d, y, layer, depth]
  const yE = yTop - lipT;
  const rows = [[dLip + 0.045, yE, 'under', 0], [dLoam + 0.02, yE - 0.03, 'loam', 0.03]];
  const depthRows = [];
  const add = (dp, layer, a) => depthRows.push([dp, layer, a]);
  const mid = (a, b, t) => a + (b - a) * t;
  const band = (dp) => (dp < L1 ? 'loam' : dp < L2 ? 'clay' : dp < L3 ? 'sand' : dp < L4 ? 'silt' : 'gravel');
  add(mid(0.05, L1, 0.5), 'loam'); add(Math.max(0.06, L1 - 0.03), 'loam');
  add(L1 + 0.03, 'clay'); add(mid(L1, L2, 0.35), 'clay'); add(mid(L1, L2, 0.7), 'clay'); add(L2 - 0.03, 'clay');
  add(L2 + 0.03, 'sand'); add(mid(L2, L3, 0.5), 'sand'); add(L3 - 0.03, 'sand');
  add(L3 + 0.03, 'silt'); add(mid(L3, L4, 0.5), 'silt'); add(L4 - 0.03, 'silt');
  add(L4 + 0.03, 'gravel'); add(mid(L4, Hc, 0.5), 'gravel'); add(Hc - 0.1, 'gravel');
  let prev = 0.03;
  for (const [dp0, layer] of depthRows) {
    const dp = Math.min(Hc - 0.1, Math.max(prev + 0.001, dp0)); prev = dp;
    const y = yE - dp;
    let a = A[layer] + (layer === 'sand' ? 0 : bulge(y));
    if (layer === 'gravel') a += Math.max(0, dp - L4) * 0.14;
    rows.push([dm(y) - aAt(a), y, band(dp) === layer ? layer : band(dp), dp]);
  }
  // the foot: tucked into the ground (under the water, or into the grass)
  { const y = yE - Hc, last = rows[rows.length - 1]; rows.push([Math.min(dm(y) + 0.16, last[0] + 0.35), y - 0.05, 'gravel', Hc]); }
  // keep every straight piece between rows in front of the drawn ground
  for (let it = 0; it < 3; it++) for (let r = 1; r < rows.length - 2; r++) {
    const [da, ya] = rows[r], [db, yb] = rows[r + 1];
    let v = 0;
    for (const t of [0.25, 0.5, 0.75]) { const y = lerp(ya, yb, t), d = lerp(da, db, t); v = Math.max(v, d - (dm(y) - 0.04 * kk)); }
    if (v > 0) { rows[r][0] -= v; rows[r + 1][0] -= v; }
  }
  // the loam row may not stand out past the lip's underside
  rows[1][0] = Math.max(rows[1][0], dLip + 0.08);
  return { P, turf, rows, kk, full, yTop, lipT, dLip, dLoam, dm, yE, Hc, bul, L: [L1, L2, L3, L4] };
}

// the colour of a face vertex: its layer, a few thin laminae, the wet band
// above the water, moss on the damp lower face, dark under the lip
function earthColor(o, layer, dp, y, x, z, out) {
  const n = fbm(x * 0.5 + y * 0.8, z * 0.5 - y * 0.6, 2), f = fbm(x * 0.07, z * 0.07 + y * 0.2, 2);
  switch (layer) {
    case 'under': out.copy(EARTH.under); break;
    case 'loam': out.copy(EARTH.loam).lerp(EARTH.loamR, n); break;
    case 'clay': out.copy(EARTH.clay).lerp(EARTH.clayD, sm(0.35, 0.75, f)); break;
    case 'sand': out.copy(EARTH.sand); break;
    case 'silt': out.copy(EARTH.silt).lerp(EARTH.clayD, 0.25 * n); break;
    default: out.copy(EARTH.gravel);
  }
  out.multiplyScalar(0.93 + 0.12 * Math.sin(y * 29 + n * 4));
  // under the lip: in its shadow
  if (dp < 0.25) out.multiplyScalar(lerp(0.8, 1, dp / 0.25));
  // moss on the damp lower part
  const damp = sm(0.25, 0.5, y - o.wl) * (1 - sm(0.9, 1.7, y - o.wl));
  const moss = damp * sm(0.48, 0.62, fbm(x * 0.35 + 3, z * 0.35 + y * 0.6, 2));
  if (moss > 0) out.lerp(EARTH.moss.clone().lerp(EARTH.mossD, n), moss * 0.85);
  // the wet band just above the water and everything below it
  out.lerp(EARTH.wet, (1 - sm(0.05, 0.42, y - o.wl)) * 0.75);
  return out;
}

// One piece: samples s[a..b] of one run
function buildPiece(run, a, b, o) {
  const { meshAt, groundColor, meshColor, meshNormal, plants, colliders } = o;
  const S = run.s.slice(a, b + 1), R = rng(run.id * 7919 + a * 31 + 1);
  const secs = S.map((s, j) => section(s, meshAt, run.yRef[a + j]));
  // each row's distance smoothed along the line (never further back than
  // before: the face stays in front of the ground), so the toe and the
  // ledges run on evenly from one section to the next
  for (let r = 1; r < secs[0].rows.length - 1; r++) {
    const d = secs.map((X) => X.rows[r][0]), lo = d.map((_, j) => Math.min(d[Math.max(0, j - 1)], d[j], d[Math.min(d.length - 1, j + 1)]));
    secs.forEach((X, j) => { const a2 = lo[Math.max(0, j - 1)], b2 = lo[Math.min(lo.length - 1, j + 1)]; X.rows[r][0] = Math.min(d[j], (a2 + lo[j] * 2 + b2) / 4 + 0.02); });
  }
  run.__sec = run.__sec || [];
  secs.forEach((X, j) => { run.__sec[a + j] = X; });
  const tmp = new THREE.Color(), up = [0, 1, 0];
  // ---------- the turf (terrain material) ----------
  const tcols = S.map((s, j) => {
    const X = secs[j];
    // the grass colour a little back from the brim (fresh, not the muddy bank)
    const gb = X.P(X.turf[0][0] + 0.8, 0); groundColor(gb[0], gb[2], meshAt(gb[0], gb[2]), 0.0, tmp); const grass = tmp.clone();
    return X.turf.map(([d, y, kind], r) => {
      const p = X.P(d, y);
      let c, nrm;
      if (kind <= 1) { c = meshColor(p[0], p[2], new THREE.Color()); nrm = meshNormal(p[0], p[2]); }
      else if (kind === 2) { c = meshColor(p[0], p[2], new THREE.Color()).lerp(grass, 0.5); const m = meshNormal(p[0], p[2]); nrm = [m[0] * 0.6, m[1] * 0.6 + 0.4, m[2] * 0.6]; }
      else {
        c = grass.clone().multiplyScalar(kind === 6 ? 0.62 : kind === 5 ? 0.8 : kind === 4 ? 0.94 : 1);
        // (the front stays under ~33 degrees for the ground's shader, so it is
        // painted as grass, not as its bare earth for steep slopes)
        const out = [-s.nx, 0, -s.nz], k = kind === 3 ? 0.15 : kind === 4 ? 0.45 : 0.35;
        nrm = kind === 6 ? [out[0] * 0.6, -0.8, out[2] * 0.6] : [lerp(up[0], out[0], k), lerp(up[1], out[1], k), lerp(up[2], out[2], k)];
      }
      const l = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
      return { p, c, n: [nrm[0] / l, nrm[1] / l, nrm[2] / l], uv: [p[0] / 4, p[2] / 4] };
    });
  });
  const tg = grid(tcols, tcols[0].length);
  { const N = []; for (const col of tcols) for (const v of col) N.push(...v.n); tg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); }
  // (winding: the turf faces up)
  { const I = tg.index.array, Pa = tg.attributes.position; const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(); let s = 0;
    for (let i = 0; i < I.length; i += 3 * 9) { va.fromBufferAttribute(Pa, I[i]); vb.fromBufferAttribute(Pa, I[i + 1]); vc.fromBufferAttribute(Pa, I[i + 2]); s += vb.sub(va).cross(vc.sub(va)).y; }
    if (s < 0) { for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } } }
  tg.computeBoundingSphere(); tg.computeBoundingBox();
  const turf = new THREE.Mesh(tg);
  turf.name = `terrain_bank_${run.line}_${run.side > 0 ? 'r' : 'l'}_${a}`;
  turf.receiveShadow = true;
  turf.userData.eid = `edges/bank/${run.line}/${run.side}/${a}/turf`;
  // ---------- the earth face ----------
  const ecols = S.map((s, j) => {
    const X = secs[j];
    return X.rows.map(([d, y, layer, dp]) => {
      const p = X.P(d, y);
      return { p, c: earthColor(s, layer, dp, y, p[0], p[2], new THREE.Color()), uv: [s.u * run.side, y], layer };
    });
  });
  // (the first row is the turf's last: the sod's front-bottom edge)
  const eR = ecols[0].length;
  const eg = soilBands(faceOut(grid(ecols, eR), S[0].nx, S[0].nz), eR, (j, r) => LAYER_TILES[ecols[j][Math.min(eR - 1, r + 1)].layer] || LAYER_TILES.gravel);
  const G = new THREE.Group();
  G.name = 'streambank';
  G.userData.keep = true;   // (not unindexed by town.js mergeStatic: cellMerge joins it by cell)
  G.userData.eid = `edges/bank/${run.line}/${run.side}/${a}`;
  G.userData.barrier = 'bank';
  G.userData.qa = { k: 'ground', why: 'a stream\'s cut bank: an earth face laid over the ground, one-sided like the ground' };
  const face = new THREE.Mesh(eg, earthMat());
  face.name = 'bank_face'; face.castShadow = false; face.receiveShadow = true;
  face.userData.barrier = 'bank'; face.userData.outline = false;
  G.add(face);
  // a point on the face at height y of sample j (and the face's outward normal there)
  const faceAt = (j, y) => {
    const X = secs[j], rows = X.rows;
    for (let r = 1; r < rows.length - 2; r++) {
      const [da, ya] = rows[r], [db, yb] = rows[r + 1];
      if (y <= ya && y >= yb) { const t = (ya - y) / Math.max(1e-6, ya - yb); return X.P(lerp(da, db, t), y); }
    }
    return null;
  };
  // ---------- the grass lip: fluffy clusters of the field's grass along the
  // brim, rolling over it and hanging down the face (grasslip.js) ----------
  lipAlong(S.map((s, j) => {
    const X = secs[j], p = X.P(X.dLip + 0.07, X.yTop + X.bul * 0.5);
    return { x: p[0], y: p[1], z: p[2], nx: -s.nx, nz: -s.nz, k: sm(0.12, 0.5, X.kk), j };
  }), { seed: run.id * 7919 + a * 31 + 5, face: (smp, dep) => { const X = secs[smp.j]; return X.Hc > 0.6 ? faceAt(smp.j, X.yE - dep * Math.min(1, X.Hc * 0.6)) : null; }, faceMax: 0.9 });
  // ---------- roots ----------
  const st = { pos: [], col: [], idx: [] };
  const lc = cards();
  for (let j = 0; j < S.length - 1; j++) {
    const s = S[j], X = secs[j], kk = X.kk;
    if (kk < 0.2) continue;
    const out = [-s.nx, 0, -s.nz], side = [s.tx, 0, s.tz];
    // root tangles in the loam (and the top of the clay)
    if (X.Hc > 0.5 && R() < 0.62 * kk) {
      const nr = 2 + Math.floor(R() * 4), al0 = R() * 0.5, y0 = X.yE - 0.06 - R() * Math.min(0.75, X.L[1] * 0.8);
      for (let i = 0; i < nr; i++) {
        const fp = faceAt(j, y0 - (R() - 0.3) * 0.15); if (!fp) continue;
        const al = al0 + (R() - 0.5) * 0.35, pts = [];
        let p = [fp[0] + side[0] * al + s.nx * 0.05, fp[1], fp[2] + side[2] * al + s.nz * 0.05];
        const L = 0.25 + R() * 0.6, outK = 0.08 + R() * 0.12, sw = (R() - 0.5) * 0.3;
        pts.push(p);
        for (let q = 1; q <= 5; q++) {
          const t = q / 5;
          p = [p[0] + out[0] * outK * (q < 3 ? 0.6 : 0.12) + side[0] * sw * 0.2 + (R() - 0.5) * 0.03, p[1] - L * 0.2 * (q < 2 ? 0.35 : 1) + (R() - 0.5) * 0.02, p[2] + out[2] * outK * (q < 3 ? 0.6 : 0.12) + side[2] * sw * 0.2 + (R() - 0.5) * 0.03];
          // (never back into the face)
          const fq = faceAt(j, p[1]);
          if (fq) { const into = (p[0] - fq[0]) * s.nx + (p[2] - fq[2]) * s.nz; if (into > -0.03) { p[0] -= s.nx * (into + 0.03); p[2] -= s.nz * (into + 0.03); } }
          pts.push(p); void t;
        }
        strand(st, pts, 0.022 + R() * 0.016, 0.006, side, ROOT.dark, ROOT.pale, true);
      }
    }
    // ---------- plants on the face (leaf cards) ----------
    const nrmOut = new THREE.Vector3(out[0], 0.15, out[2]).normalize();
    // vines from under the lip, following the face down
    if (X.Hc > 1.2 && R() < 0.2 * kk) {
      const strands = 1 + Math.floor(R() * 3);
      for (let v = 0; v < strands; v++) {
        const al = R() * 0.5 + v * 0.25, Lv = Math.min(X.Hc - 0.5, 0.6 + R() * 1.8);
        for (let y = 0.05; y < Lv; y += 0.15) {
          const fp = faceAt(j, X.yE - y); if (!fp || X.yE - y < s.wl + 0.35) break;
          const w = Math.sin(y * 4 + v) * 0.05;
          const p = new THREE.Vector3(fp[0] + side[0] * (al + w) - s.nx * 0.08, fp[1], fp[2] + side[2] * (al + w) - s.nz * 0.08);
          pushCard(lc, p, new THREE.Vector3(out[0] + (R() - 0.5) * 0.6, (R() - 0.5) * 0.4, out[2] + (R() - 0.5) * 0.6).normalize(), (0.26 + R() * 0.1) * (1 - y / Lv * 0.4), R() < 0.5 ? TILE.ivy : TILE.ivy2, R() * 6.28, p.clone().add(new THREE.Vector3(s.nx, 0, s.nz)), 0.4);
        }
      }
    }
    // moss on the damp lower face
    if (X.Hc > 0.7 && R() < 0.3 * kk) {
      const n = 1 + Math.floor(R() * 2), yb = s.wl + 0.35 + R() * Math.min(0.9, (X.yE - s.wl) * 0.4);
      for (let i = 0; i < n; i++) {
        const fp = faceAt(j, yb + (R() - 0.5) * 0.3); if (!fp) continue;
        const al = R() * 0.5, p = new THREE.Vector3(fp[0] + side[0] * al - s.nx * 0.04, fp[1], fp[2] + side[2] * al - s.nz * 0.04);
        pushCard(lc, p, nrmOut.clone().add(new THREE.Vector3(0, 0.3, 0)).normalize(), 0.13 + R() * 0.1, R() < 0.6 ? TILE.bushA : TILE.bushB, R() * 6.28, p.clone().add(new THREE.Vector3(s.nx * 0.6, -0.2, s.nz * 0.6)), 0.1);
      }
    }
    // small ferns and grass on the ledge where the clay steps out under the loam
    if (X.Hc > 1.0 && R() < 0.16 * kk) {
      const fp = faceAt(j, X.yE - X.L[0] - 0.05);
      if (fp) {
        const p = new THREE.Vector3(fp[0] - s.nx * 0.1, fp[1] + 0.06, fp[2] - s.nz * 0.1);
        for (let i = 0; i < 4; i++) { const a = R() * 6.28; pushCard(lc, p.clone().add(new THREE.Vector3(Math.cos(a) * 0.06, 0.08, Math.sin(a) * 0.06)), new THREE.Vector3(out[0] + Math.cos(a) * 0.5, 0.9, out[2] + Math.sin(a) * 0.5).normalize(), 0.3 + R() * 0.12, TILE.fern, R() * 6.28, p.clone().add(new THREE.Vector3(0, -0.3, 0)), 0.5); }
      }
    }
    // ferns (veg.js) in a pocket on the tall faces' lower half and at the foot
    if (X.Hc > 1.6 && R() < 0.05 * kk) {
      const fp = faceAt(j, s.wl + 0.5 + R() * Math.min(1.2, X.Hc * 0.3));
      if (fp) plants.push({ x: fp[0] - s.nx * 0.18, y: fp[1] - 0.05, z: fp[2] - s.nz * 0.18, s: 0.55 + R() * 0.3 });
    }
  }
  // (the hanging grass and roots join the face: one mesh, one draw)
  if (st.idx.length) face.geometry = mergeGeometries([eg, strandGeometry(st, true)], false);
  if (lc.idx.length) {
    const m = new THREE.Mesh(toGeometry(lc), leafMat());
    m.name = 'bank_plants'; m.castShadow = false; m.receiveShadow = true;
    m.userData.outline = false; m.userData.qa = { k: 'hung', why: 'vines, moss and ferns on the bank\'s face' };
    G.add(m);
  }
  // ---------- stones ----------
  const geos = [];
  const stone = (x, y, z, s, kind, col, yaw) => {
    const g = boulderGeometry(Math.floor(R() * 1e6), { w: s * (1.1 + R() * 0.4), h: s * (kind === 'slab' ? 0.55 : 0.8), d: s, kind, col });
    g.rotateY(yaw).translate(x, y, z); geos.push(g);
  };
  const rock = C(STONE.bank), tone = new THREE.Color();
  for (let j = 0; j < S.length - 1; j++) {
    const s = S[j], X = secs[j], kk = X.kk;
    if (kk < 0.3) continue;
    // embedded in the clay, silt and gravel
    if (X.Hc > 1.0 && R() < 0.45 * kk) {
      const y = X.yE - lerp(X.L[0] + 0.2, X.Hc - 0.3, R()), fp = faceAt(j, y);
      if (fp) {
        const sz = 0.18 + Math.pow(R(), 1.6) * 0.42;
        tone.copy(rock).multiplyScalar(0.86 + R() * 0.2);
        if (y - s.wl < 0.4) tone.lerp(EARTH.wet, 0.4);
        stone(fp[0] + s.nx * sz * 0.42, y - sz * 0.45, fp[2] + s.nz * sz * 0.42, sz, R() < 0.3 ? 'slab' : 'boulder', tone, R() * 6.28);
      }
    }
    // the stony toe at the waterline
    if (X.full > 0.4 && R() < 0.75 * kk) {
      const fp = faceAt(j, s.wl + 0.12);
      if (fp) {
        const sz = 0.12 + Math.pow(R(), 1.8) * 0.3, al = R() * 0.5;
        tone.copy(rock).multiplyScalar(0.8 + R() * 0.22).lerp(EARTH.wet, 0.35);
        stone(fp[0] - s.nx * (0.04 + R() * 0.16) + s.tx * al, s.wl - sz * 0.42, fp[2] - s.nz * (0.04 + R() * 0.16) + s.tz * al, sz, R() < 0.25 ? 'pebble' : 'boulder', tone, R() * 6.28);
      }
    }
  }
  const out = { G, turf, geos };
  return out;
}

// every run in pieces of about 20 m (40 samples), joined on a shared section
export function buildBanks(runs, o) {
  const res = { pieces: [], turf: [], plants: [], colliders: [] };
  BANK_BUILT.plants = res.plants; BANK_BUILT.runs = runs; BANK_BUILT.group = o.group || null;
  // each run's brim smoothed over +-15 m: the level the strata lie at
  for (const run of runs) run.yRef = run.s.map((_, j) => { let a = 0, w = 0; for (let q = -30; q <= 30; q++) { const r = run.s[j + q]; if (!r) continue; const wt = Math.exp(-(q * q) / 300) * (0.2 + r.k); a += r.yB * wt; w += wt; } return a / w; });
  const opts = { ...o, plants: res.plants, colliders: res.colliders };
  for (const run of runs) {
    const N = run.s.length;
    for (let a = 0; a < N - 1; a += 40) {
      const b = Math.min(N - 1, a + 40);
      if (N - 1 - b < 6) { const p = buildPiece(run, a, N - 1, opts); finish(p, res); break; }
      finish(buildPiece(run, a, b, opts), res);
    }
  }
  // the boulders in the water (terrain.js BANK_STONES: their foam is in the water)
  if (o.stones && o.stones.length) {
    const R = rng(8080), geos = [];
    for (const b of o.stones) {
      const h = b.s * 0.82, base = Math.max(b.bed - 0.12, b.wl + 0.16 - h);
      const tone = C(STONE.bank).multiplyScalar(0.84 + R() * 0.16);
      const g = boulderGeometry(b.seed, { w: b.s * 1.35, h, d: b.s * 1.05, col: tone });
      // (the wet lower part: darker below the water line)
      const P = g.attributes.position, Cc = g.attributes.color;
      for (let i = 0; i < P.count; i++) if (P.getY(i) + base < b.wl + 0.06) { Cc.setXYZ(i, Cc.getX(i) * 0.7, Cc.getY(i) * 0.72, Cc.getZ(i) * 0.74); }
      g.rotateY(R() * 6.28).translate(b.x, base, b.z);
      geos.push(g);
      res.colliders.push({ x: b.x, z: b.z, r: b.s * 0.6 });
    }
    // (in pieces by 40 m cell: each stays local)
    const cells = new Map();
    geos.forEach((g, i) => { const b = o.stones[i], k = Math.floor(b.x / 40) + ',' + Math.floor(b.z / 40); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(g); });
    for (const [k, list] of cells) {
      const G = new THREE.Group(); G.name = 'streambank_stones'; G.userData.eid = `edges/bank/stones/${k}`;
      const m = stoneMesh(mergeAll(list), { fade: [180, 186] }); m.userData.outline = 'solid'; m.userData.barrier = 'bank'; G.add(m);
      // (the group where its stones are)
      const im = new THREE.Matrix4(); m.getMatrixAt(0, im); const c = new THREE.Vector3().setFromMatrixPosition(im);
      G.position.copy(c); m.setMatrixAt(0, im.makeTranslation(0, 0, 0)); m.computeBoundingSphere();
      res.pieces.push(G);
    }
  }
  return res;
}
function finish(p, res) {
  if (p.geos.length) {
    const m = stoneMesh(mergeAll(p.geos), { fade: [180, 186] });
    m.userData.outline = 'solid'; m.userData.barrier = 'bank';
    p.G.add(m);
  }
  // (the group stands where its face is, its parts moved to match)
  const box = new THREE.Box3().setFromBufferAttribute(p.G.children[0].geometry.attributes.position), c = box.getCenter(new THREE.Vector3());
  c.y = box.min.y;
  p.G.position.copy(c);
  for (const ch of p.G.children) ch.position.sub(c);
  res.pieces.push(p.G);
  res.turf.push(p.turf);
}

// Exposed roots where a tree stands near a brim: a few thick gnarled roots
// come out under the turf lip, arch out over the face and run down into it
// (veg.js, once the trees are placed). trees: [{x, z, trunk}]; group: where
// the meshes go (the town's group, so they bake with it).
export function bankTreeRoots(runs, trees, group) {
  const R = rng(6161), cells = new Map();
  let n = 0;
  for (const run of runs) for (let j = 0; j < run.s.length; j += 2) {
    const s = run.s[j];
    if (s.k < 0.5 || s.H < 1.0) continue;
    const bx = s.x + s.nx * (s.dB + 0.3), bz = s.z + s.nz * (s.dB + 0.3);
    const t = trees.find((q) => !q.off && Math.hypot(q.x - bx, q.z - bz) < 4.2 && Math.hypot(q.x - bx, q.z - bz) > 1.2);
    if (!t || R() < 0.4) continue;
    const X = run.__sec && run.__sec[j];
    if (!X) continue;
    const side = [s.tx, 0, s.tz], ck = Math.floor(s.x / 40) + ',' + Math.floor(s.z / 40);
    if (!cells.has(ck)) cells.set(ck, { pos: [], col: [], idx: [] });
    const out = cells.get(ck);
    const nr = 2 + Math.floor(R() * 3);
    for (let i = 0; i < nr; i++) {
      const al = (R() - 0.5) * 0.9, L = Math.min(X.Hc - 0.3, 0.7 + R() * 1.2), r0 = 0.05 + R() * 0.045;
      if (L < 0.4) continue;
      const pts = [], d0 = X.dLoam + 0.25;
      for (let q = 0; q <= 7; q++) {
        const u = q / 7, y = X.yE - 0.02 - u * L;
        // under the lip, then bowed out from the face, then back into it lower down
        const fd = X.dm(y) - 0.12, bow = Math.sin(u * Math.PI) * (0.14 + r0);
        const d = q === 0 ? d0 : Math.min(fd, d0) - bow;
        pts.push([s.x + s.nx * d + side[0] * (al + Math.sin(u * 5 + i) * 0.06), y, s.z + s.nz * d + side[2] * (al + Math.sin(u * 5 + i) * 0.06)]);
      }
      strand(out, pts, r0, r0 * 0.35, side, ROOT.bark, ROOT.dark, true);
      n++;
    }
  }
  for (const [ck, out] of cells) {
    if (!out.idx.length) continue;
    const g = strandGeometry(out, true);
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    const m = new THREE.Mesh(g, earthMat());
    m.position.copy(c);
    m.name = 'bank_tree_roots'; m.castShadow = true; m.receiveShadow = true;
    m.userData.outline = false; m.userData.qa = { k: 'hung', why: 'tree roots exposed on the bank\'s face' };
    m.userData.eid = `edges/bank/tree_roots/${ck}`;
    group.add(m);
  }
  return n;
}
// what the last buildBanks made, for veg.js: the ferns to sow, the runs (with
// their sections) and the group the tree roots go into
export const BANK_BUILT = { plants: [], runs: [], group: null };
export const bankPlants = () => BANK_BUILT.plants;
export function treeRoots(trees) { return BANK_BUILT.group ? bankTreeRoots(BANK_BUILT.runs, trees, BANK_BUILT.group) : 0; }
