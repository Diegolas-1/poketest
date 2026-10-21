// Real garments for the town's people (cast.js): clothes built in code as thin
// slabs of cloth over the body instead of paint on it, so they hang from the
// shoulders with volume of their own (a lab coat, a dress, a vest, a loose tee
// and shorts). The machinery follows the player's jacket (ashcloth.js), made
// general so each person's outfit is a few lines of setup:
//
//   - hangGrid: a garment round the trunk, rows from the chest to its hem, each
//     column falling straight down from the chest outside everything beneath it
//     (like a curtain, not following the body's dips), open in front or closed,
//     with a stand-off, a flare and the sides taken in under the arms;
//   - slab: the cloth itself, an outside, a lining and edge strips (so the ink
//     hull outlines the rims too);
//   - paintGrid: its texture, painted texel by texel by where the texel sits on
//     the garment in the rest pose (pockets, seams, lapels);
//   - clothSim: long or loose garments get "cloth bones" in panels, driven by a
//     small verlet sim: they hang from pins on the body, keep their lengths,
//     spring back towards their hang, feel the air and are pushed out of the
//     body (chest, waist, hips, thighs, shins and the arms) at its current pose.
//
// Coordinates are the base model's rest pose (model units, 1.34 tall, facing +z,
// left = +x, arms out along x), like the rest of cast.js.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sm = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const lerp = THREE.MathUtils.lerp;
// a smooth maximum (k: how wide the blend is)
export const smax = (a, b, k) => (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2;
export const ZC = 0.004;   // the trunk's axis, front to back
export const ARM_Y = 1.02, ARM_Z = -0.008;   // the arms' axis in the T pose

// ---------- the body ----------
// triangles of a mesh's geometry as it stands; keep([i0, i1, i2], [p0, p1, p2])
export function trisOf(mesh, keep) {
  const g = mesh.geometry, P = g.attributes.position, ix = g.index, n = ix ? ix.count : P.count, out = [];
  for (let t = 0; t < n; t += 3) {
    const i = [0, 1, 2].map((k) => (ix ? ix.getX(t + k) : t + k)), v = i.map((k) => V3().fromBufferAttribute(P, k));
    if (!keep || keep(i, v)) out.push({ v });
  }
  return out;
}
// farthest hit of a ray from inside the body, closer than tMax
const _e1 = V3(), _e2 = V3(), _p = V3(), _t = V3(), _q = V3();
export function cast(T, o, d, tMax) {
  let best = null;
  for (const tr of T) {
    const [a, b, c] = tr.v;
    _e1.subVectors(b, a); _e2.subVectors(c, a); _p.crossVectors(d, _e2);
    const det = _e1.dot(_p); if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det; _t.subVectors(o, a);
    const u = _t.dot(_p) * inv; if (u < 0 || u > 1) continue;
    _q.crossVectors(_t, _e1);
    const v = d.dot(_q) * inv; if (v < 0 || u + v > 1) continue;
    const t = _e2.dot(_q) * inv;
    if (t > 0 && t < tMax && (best === null || t > best)) best = t;
  }
  return best;
}
// fill gaps (no hit) in a ring of radii from their neighbours, then smooth it
export function fixRing(r, loop, passes = 0, w = 0.25) {
  const n = r.length;
  for (let k = 0; k < n; k++) if (r[k] == null) {
    let a = k, b = k;
    while (a > 0 && r[a] == null) a--; while (b < n - 1 && r[b] == null) b++;
    r[k] = r[a] ?? r[b] ?? 0.05;
  }
  for (let p = 0; p < passes; p++) {
    const s = r.slice();
    for (let k = 0; k < n; k++) {
      const km = loop ? (k - 1 + n) % n : Math.max(0, k - 1), kp = loop ? (k + 1) % n : Math.min(n - 1, k + 1);
      r[k] = s[k] * (1 - 2 * w) + (s[km] + s[kp]) * w;
    }
  }
  return r;
}
const dirOf = (th) => V3(Math.sin(th), 0, Math.cos(th));
// the body's girth all round at height y (48 radii from the trunk's axis, from the front round by the left)
export const ringOf = (T, y, n = 48) => fixRing(Array.from({ length: n }, (_, k) => cast(T, V3(0, y, ZC), dirOf(k / n * TAU), 0.4)), true, 1);
// convex hull of 2D points [x, z] (counter-clockwise)
function hull2(P) {
  const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// the convex outline of the body round the trunk's axis at height y (bridging its hollows,
// as cloth stretched over it does): th -> radius
export function hullRing(T, y, tMax = 0.2, n = 96) {
  const r = fixRing(Array.from({ length: n }, (_, k) => cast(T, V3(0, y, ZC), dirOf(k / n * TAU), tMax)), true, 1);
  const H = hull2(r.map((v, k) => [v * Math.sin(k / n * TAU), v * Math.cos(k / n * TAU)]));
  return (th) => {
    const dx = Math.sin(th), dz = Math.cos(th); let best = 0;
    for (let k = 0; k < H.length; k++) {
      const [ax, az] = H[k], [bx, bz] = H[(k + 1) % H.length], ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (ax * ez - az * ex) / den, u = (ax * dz - az * dx) / den;
      if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.max(best, t);
    }
    return best;
  };
}
// skin weights near a point, by bone name: from the closest vertices of the
// meshes (each { mesh, keep(x, y, z, i) }), by inverse square distance
export function nearW(list) {
  const pts = [];
  for (const { mesh, keep } of list) {
    const g = mesh.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, B = mesh.skeleton.bones;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (keep && !keep(x, y, z, i)) continue;
      const w = [];
      for (let c = 0; c < 4; c++) { const ww = SW.getComponent(i, c); if (ww > 0) w.push([B[SI.getComponent(i, c)].name, ww]); }
      pts.push(x, y, z); pts.push(w);
    }
  }
  return (p, k = 4, most = 4) => {
    const near = [];
    for (let i = 0; i < pts.length; i += 4) {
      const d = (pts[i] - p.x) ** 2 + (pts[i + 1] - p.y) ** 2 + (pts[i + 2] - p.z) ** 2;
      if (near.length < k || d < near[near.length - 1][0]) { near.push([d, i]); near.sort((a, b) => a[0] - b[0]); if (near.length > k) near.pop(); }
    }
    const m = {};
    for (const [d, i] of near) for (const [n, w] of pts[i + 3]) m[n] = (m[n] || 0) + w / (d + 1e-7);
    const e = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, most), s = e.reduce((a, [, w]) => a + w, 0);
    return Object.fromEntries(e.map(([n, w]) => [n, w / s]));
  };
}
export const mixW = (...parts) => { const m = {}; for (const [k, src] of parts) if (k > 0) for (const n in src) m[n] = (m[n] || 0) + src[n] * k; return m; };

// ---------- the cloth ----------
// grows one BufferGeometry: positions, uvs and 4 bone weights per vertex
// (weights given as {bone name: w}, turned into skeleton slots by slot(name))
export class Build {
  constructor(slot) { this.slot = slot; this.pos = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; }
  v(p, uv, w) {
    this.pos.push(p.x, p.y, p.z); this.uv.push(uv[0], uv[1]);
    const e = Object.entries(w).filter(([, x]) => x > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4), s = e.reduce((a, [, x]) => a + x, 0) || 1;
    for (let k = 0; k < 4; k++) { this.si.push(e[k] ? this.slot(e[k][0]) : 0); this.sw.push(e[k] ? e[k][1] / s : 0); }
    return this.pos.length / 3 - 1;
  }
  tri(a, b, c, n) {   // a triangle facing along n
    const P = (i) => V3(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
    const pa = P(a), f = P(b).sub(pa).cross(P(c).sub(pa));
    if (f.dot(n) >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx); g.computeVertexNormals();
    return g;
  }
}
// a cloth slab from a grid of outside points P[i][j] and weights W[i][j]: the outside,
// a lining th further in, and edge strips along the rims asked for. o.loop: the last
// column repeats the first (a tube). o.out(p, i, j): roughly outwards. The outside's
// uvs are (j / (NJ - 1) * 0.5, i / (NI - 1)), the lining's the same shifted by 0.5,
// the rims' (0.75, 0.5).
export function slab(B, P, W, th, o) {
  const NI = P.length, NJ = P[0].length;
  const N = P.map((row, i) => row.map((p, j) => {
    let jm = j - 1, jp = j + 1;
    if (o.loop) { if (jm < 0) jm = NJ - 2; if (jp > NJ - 1) jp = 1; } else { jm = Math.max(0, jm); jp = Math.min(NJ - 1, jp); }
    const du = P[i][jp].clone().sub(P[i][jm]), dv = P[Math.min(NI - 1, i + 1)][j].clone().sub(P[Math.max(0, i - 1)][j]);
    const n = du.cross(dv).normalize();
    return n.dot(o.out(p, i, j)) < 0 ? n.negate() : n;
  }));
  const uvO = (i, j) => [j / (NJ - 1) * 0.5, i / (NI - 1)], uvI = (i, j) => [0.5 + j / (NJ - 1) * 0.5, i / (NI - 1)], rimUV = [0.75, 0.5];
  const Q = P.map((row, i) => row.map((p, j) => p.clone().addScaledVector(N[i][j], -th)));
  const O = P.map((row, i) => row.map((p, j) => B.v(p, uvO(i, j), W[i][j])));
  const I = Q.map((row, i) => row.map((p, j) => B.v(p, uvI(i, j), W[i][j])));
  for (let i = 0; i < NI - 1; i++) for (let j = 0; j < NJ - 1; j++) {
    const n = N[i][j].clone().add(N[i + 1][j + 1]), m = n.clone().negate();
    B.tri(O[i][j], O[i][j + 1], O[i + 1][j + 1], n); B.tri(O[i][j], O[i + 1][j + 1], O[i + 1][j], n);
    B.tri(I[i][j], I[i][j + 1], I[i + 1][j + 1], m); B.tri(I[i][j], I[i + 1][j + 1], I[i + 1][j], m);
  }
  const rim = (pts, inward) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [i0, j0] = pts[k], [i1, j1] = pts[k + 1];
      const a = B.v(P[i0][j0], rimUV, W[i0][j0]), b = B.v(P[i1][j1], rimUV, W[i1][j1]);
      const c = B.v(Q[i1][j1], rimUV, W[i1][j1]), d = B.v(Q[i0][j0], rimUV, W[i0][j0]);
      const [ii, jj] = inward(i0, j0), away = P[i0][j0].clone().sub(P[ii][jj]);
      B.tri(a, b, c, away); B.tri(a, c, d, away);
    }
  };
  const row = (i) => Array.from({ length: NJ }, (_, j) => [i, j]), col = (j) => Array.from({ length: NI }, (_, i) => [i, j]);
  if (o.rims.bottom) rim(row(NI - 1), (i, j) => [i - 1, j]);
  if (o.rims.top) rim(row(0), (i, j) => [i + 1, j]);
  if (o.rims.left) rim(col(0), (i, j) => [i, j + 1]);
  if (o.rims.right) rim(col(NJ - 1), (i, j) => [i, j - 1]);
}

// where the arms hang against the sides (a little behind the side seam, from the
// armpit to the elbow), 0..1 at a direction th round the trunk and height y
export const underArm = (th, y, top = 0.962) => {
  const a = Math.atan2(Math.abs(Math.sin(th)), Math.cos(th));
  return Math.exp(-(((a - 1.72) / 0.5) ** 2)) * sm(top, top - 0.027, y) * sm(0.79, 0.84, y);
};

// a garment hanging round the trunk. o: { T: the body (and anything under it) to clear,
// ys: rows top to hem, nc: columns, gap(y): half angle of the opening in front (none: closed),
// pin, mid: rows from which it hangs, and by which it hangs straight; under: heights below
// the hem it must clear too (or floor: no lower than this); off(y, th): stand-off; min(y, th): a smallest radius (a flare),
// tuck: how far the sides are taken in under the arms }
// -> { P: outside points [row][col], th(i, j), r(i, j) }
export function hangGrid(o) {
  const { ys, nc } = o, closed = !o.gap, NJ = nc + 1, hem = ys.length - 1;
  const thOf = (y, j) => { const g = closed ? 0 : o.gap(y); return g + j / nc * (TAU - 2 * g); };
  const ring = (y, yTh = y) => {
    const r = fixRing(Array.from({ length: NJ }, (_, j) => cast(o.T, V3(0, y, ZC), dirOf(thOf(yTh, j)), 0.4)), false);
    if (closed) r[nc] = r[0];
    return r;
  };
  // below o.floor (if given) nothing more is cleared: the cloth falls straight from there
  const RB = ys.map((y) => (o.floor && y < o.floor ? null : ring(y)));
  for (let i = 1; i < RB.length; i++) if (!RB[i]) RB[i] = RB[i - 1].slice();
  const under = (o.under || []).map((y) => ring(y, ys[hem]));
  // below the chest, each column falls straight down outside everything beneath it
  const CU = RB.map((r) => r.slice());
  for (let j = 0; j <= nc; j++) {
    let m = Math.max(0, ...under.map((r) => r[j]));
    for (let i = hem; i >= 0; i--) { m = Math.max(m, RB[i][j]); CU[i][j] = m; }
  }
  for (const r of CU) { fixRing(r, closed, 3); if (closed) r[nc] = r[0]; }
  const yp = ys[o.pin], ym = ys[o.mid];
  const R = ys.map((y, i) => RB[i].map((v, j) => {
    const th = thOf(y, j);
    let r = Math.max(v, lerp(v, CU[i][j], sm(yp + 0.012, ym + 0.01, y))) + (o.off ? o.off(y, th) : 0);
    if (o.min) r = smax(r, o.min(y, th), 0.012);
    return r - (o.tuck || 0) * underArm(th, y);
  }));
  const P = ys.map((y, i) => Array.from({ length: NJ }, (_, j) => {
    const th = thOf(y, j), r = R[i][closed && j === nc ? 0 : j];
    return V3(r * Math.sin(th), y, ZC + r * Math.cos(th));
  }));
  return { P, th: (i, j) => thOf(ys[i], j), r: (i, j) => R[i][j], closed };
}
// weights for a garment grid: rows down to `rig` follow the body (body(p) -> weights),
// further down they go over to the cloth bones of the panels (sim), or follow the body
// all the way (no sim). sim: { tag, ns: panels, rows: the particle rows (pin first), loop }
export function gridWeights(P, body, sim) {
  const NI = P.length, NJ = P[0].length, nc = NJ - 1;
  if (!sim) return P.map((row) => row.map((p) => body(p)));
  const ys = sim.rows.map((i) => P[i][0].y), y0 = ys[0], nb = ys.length - 1;
  return P.map((row, i) => row.map((p, j) => {
    const y = P[i][0].y, rig = sm(y0 - 0.026, y0, y);
    // which segment (fractional): over to the next one round each particle row
    let f = 0; for (let k = 1; k < nb; k++) f += sm(ys[k] + 0.03, ys[k] - 0.04, y);
    const k0 = Math.min(nb - 1, Math.floor(f)), k1 = Math.min(nb - 1, k0 + 1), v = f - k0;
    const step = sim.loop ? nc / sim.ns : nc / (sim.ns - 1), g = j / step;
    let s0 = Math.floor(g), u = g - s0, s1 = s0 + 1;
    if (sim.loop) { s0 %= sim.ns; s1 %= sim.ns; } else if (s0 >= sim.ns - 1) { s0 = sim.ns - 2; s1 = sim.ns - 1; u = 1; }
    const nm = (s, k) => `cl${sim.tag}${s}_${k}`;
    return mixW([rig, rig > 0 ? body(p) : {}],
      [(1 - rig) * (1 - u) * (1 - v), { [nm(s0, k0)]: 1 }], [(1 - rig) * u * (1 - v), { [nm(s1, k0)]: 1 }],
      [(1 - rig) * (1 - u) * v, { [nm(s0, k1)]: 1 }], [(1 - rig) * u * v, { [nm(s1, k1)]: 1 }]);
  }));
}
// the panels' chains for a sim grid: rest points down each panel's column
export function gridChains(P, sim) {
  const nc = P[0].length - 1, step = sim.loop ? nc / sim.ns : nc / (sim.ns - 1), out = [];
  for (let s = 0; s < sim.ns; s++) {
    const j = Math.round(s * step);
    out.push({ bones: sim.rows.slice(0, -1).map((_, k) => `cl${sim.tag}${s}_${k}`), rest: sim.rows.map((i) => P[i][j].clone()), edge: !sim.loop && (s === 0 || s === sim.ns - 1) });
  }
  return out;
}

// ---------- textures ----------
// a canvas for a slab: the outside painted texel by texel with fn(p, i, j) (p the
// rest-pose point there, i and j fractional row and column), the lining and rims lining
export function paintGrid(P, w, h, fn, lining) {
  const NI = P.length, NJ = P[0].length, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), d = g.createImageData(w, h), px = d.data, p = V3(), a = V3(), b = V3();
  const half = w / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * 4;
    let col;
    if (x < half) {
      const fi = clamp01((y + 0.5) / h) * (NI - 1), fj = clamp01((x + 0.5) / half) * (NJ - 1);
      const i0 = Math.min(NI - 2, Math.floor(fi)), j0 = Math.min(NJ - 2, Math.floor(fj)), u = fi - i0, v = fj - j0;
      a.copy(P[i0][j0]).lerp(P[i0][j0 + 1], v); b.copy(P[i0 + 1][j0]).lerp(P[i0 + 1][j0 + 1], v); p.copy(a).lerp(b, u);
      col = fn(p, fi, fj);
    } else col = lining;
    px[k] = col[0]; px[k + 1] = col[1]; px[k + 2] = col[2]; px[k + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- the sim ----------
// kit: { chains: [{ parent, bones, rest, ks, drag, damp, vmax, flut, cone, hangBone, hang, quad, coll }],
//   links: [[chain a, particle, chain b, particle, length]], groups: [{ from, n, loop }] (panels
//   smoothed together), restInv, restQ: by bone name, caps: { name: { bone, a, b, r0, r1 } } }
// coll per particle: { ring: { bone, ring, pad }, mid: { bone, ring, pad }, caps: [names], seg: [names] }
const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const LOW = QS.get('q') === 'low';
// where along a link it is checked against the limbs too (the legs, which the long cloth wraps, more closely)
const SEG = [0.5], SEG_LEG = [0.4, 0.65, 0.88];
export function clothSim(m, kit, meshes) {
  const bones = {};
  m.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  // off screen, the cloth is not worked on: the garments are culled with a fixed sphere
  // round the body, and a frame drawn without them pauses the sim (it settles again on return)
  let seen = -1, ren = null;
  for (const g of meshes) {
    g.frustumCulled = true; g.boundingSphere = new THREE.Sphere(V3(0, 0.75, 0), 0.75);
    g.onBeforeRender = (r) => { ren = r; seen = r.info.render.frame; };
  }
  const C = kit.chains.map((c) => ({
    c, pin: V3(), pw: c.rest.map(() => V3()),
    x: c.rest.slice(1).map(() => V3()), xp: c.rest.slice(1).map(() => V3()), tg: c.rest.slice(1).map(() => V3()),
    tp: c.rest.slice(1).map(() => V3()), vt: c.rest.slice(1).map(() => V3()),
    ph: Math.random() * TAU,
  }));
  const used = new Set();
  for (const c of kit.chains) {
    used.add(c.parent); if (c.hangBone) used.add(c.hangBone);
    for (const k of c.coll) { if (k.ring) used.add(k.ring.bone); if (k.mid) used.add(k.mid.bone); }
  }
  for (const n in kit.caps) used.add(kit.caps[n].bone);
  used.add('Hips');
  const S = {}, Si = {}, Pq = {}, sc = {};
  for (const n of used) { S[n] = new THREE.Matrix4(); Si[n] = new THREE.Matrix4(); Pq[n] = new THREE.Quaternion(); sc[n] = 1; }
  // the capsules in the world, each frame
  const W = {}; for (const n in kit.caps) W[n] = { a: V3(), b: V3(), r0: 0, r1: 0, ab: V3(), l2: 1, out: !!kit.caps[n].out, inn: !!kit.caps[n].inn };
  const hipW = V3(), ro = V3();
  const tv = V3(), ts = V3(), a = V3(), b = V3(), q = V3(), mp = V3(), wind = V3(), vAir = V3(), rootP = V3(), rootPrev = V3(), vRoot = V3(), fwd = V3(), rv = V3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qr = new THREE.Quaternion(), qd = new THREE.Quaternion();
  let ready = false, clock = Math.random() * 100;
  const G = -9.8, H = 1 / 60, ITER = LOW ? 2 : 3;
  const offs = kit.groups.map((g) => [0, 1, 2, 3].map(() => Array.from({ length: g.n }, () => V3())));

  const frames = () => {
    for (const n of used) {
      const bn = bones[n]; S[n].multiplyMatrices(bn.matrixWorld, kit.restInv[n]); Si[n].copy(S[n]).invert();
      bn.matrixWorld.decompose(tv, Pq[n], ts); sc[n] = ts.x;
    }
    hipW.setFromMatrixPosition(bones.Hips.matrixWorld);
    for (const n in kit.caps) {
      const cp = kit.caps[n], w = W[n], s = sc[cp.bone];
      w.a.copy(cp.a).applyMatrix4(S[cp.bone]); w.b.copy(cp.b).applyMatrix4(S[cp.bone]);
      w.ab.subVectors(w.b, w.a); w.l2 = w.ab.lengthSq() || 1e-9; w.r0 = cp.r0 * s; w.r1 = cp.r1 * s;
    }
  };
  const follow = () => {
    for (const P of C) {
      const M = S[P.c.parent], hg = P.c.hang;
      P.c.rest.forEach((r, k) => {
        P.pw[k].copy(r).applyMatrix4(M);
        if (hg && hg[k]) P.pw[k].lerp(b.copy(r).applyMatrix4(S[P.c.hangBone]), hg[k]);
      });
      P.pin.copy(P.pw[0]);
      for (let k = 0; k < P.x.length; k++) P.tg[k].copy(P.pw[k + 1]);
    }
  };
  // a point in a bone's rest frame pushed out to a ring of the body's girth (+pad)
  const ringOut = (v, ring, pad, push = 1) => {
    const dx = v.x, dz = v.z - ZC, d = Math.hypot(dx, dz) || 1e-6;
    let ang = Math.atan2(dx, dz); if (ang < 0) ang += TAU;
    const f = ang / TAU * ring.length, i0 = Math.floor(f) % ring.length, i1 = (i0 + 1) % ring.length;
    const rmin = lerp(ring[i0], ring[i1], f - Math.floor(f)) + pad;
    if (d >= rmin) return false;
    v.x += dx / d * (rmin - d) * push; v.z += dz / d * (rmin - d) * push;
    return true;
  };
  // out of a tapered capsule (world); true if it moved. A leg (out) is always under the cloth:
  // a point caught on its inner side (between it and the trunk) goes round to its outer side
  const capsule = (x, w) => {
    const u = clamp01(b.subVectors(x, w.a).dot(w.ab) / w.l2);
    a.copy(w.a).addScaledVector(w.ab, u); b.subVectors(x, a);
    let d = b.length(); const r = lerp(w.r0, w.r1, u);
    if (d >= r || d < 1e-7) return false;
    if (w.out || w.inn) {
      ro.set(a.x - hipW.x, 0, a.z - hipW.z); const l = ro.length();
      if (l > 1e-6) { ro.divideScalar(l); const k = b.dot(ro); if (w.out ? k < 0 : k > 0) { b.addScaledVector(ro, -2 * k); d = b.length(); } }
    }
    x.copy(a).addScaledVector(b, r / d);
    return true;
  };
  const collide = (x, k, prev) => {
    // off the arms (and the legs), and points along the link too (its end pushed as far as needs be)
    for (const n of k.caps) capsule(x, W[n]);
    if (prev) for (const n of k.seg) for (const f of W[n].out ? SEG_LEG : SEG) {
      mp.copy(prev).lerp(x, f); ts.copy(mp);
      if (capsule(mp, W[n])) x.addScaledVector(ts.subVectors(mp, ts), 1 / f);
    }
    if (k.ring) { q.copy(x).applyMatrix4(Si[k.ring.bone]); if (ringOut(q, k.ring.ring, k.ring.pad)) x.copy(q).applyMatrix4(S[k.ring.bone]); }
    if (k.mid && prev) {
      b.copy(x).add(prev).multiplyScalar(0.5).applyMatrix4(Si[k.mid.bone]); ts.copy(b);
      if (ringOut(b, k.mid.ring, k.mid.pad, 2)) { q.copy(x).applyMatrix4(Si[k.mid.bone]).add(b.sub(ts)); x.copy(q).applyMatrix4(S[k.mid.bone]); }
    }
    for (const n of k.after || []) capsule(x, W[n]);
  };
  // panels bend together: each offset from its hang eased towards its neighbours'
  const smoothPanels = (wgt) => {
    kit.groups.forEach((g, gi) => {
      const np = C[g.from].x.length;
      for (let k = 0; k < np; k++) {
        const o = offs[gi][k];
        for (let s = 0; s < g.n; s++) o[s].subVectors(C[g.from + s].x[k], C[g.from + s].tg[k]);
        for (let s = 0; s < g.n; s++) {
          const l = o[g.loop ? (s - 1 + g.n) % g.n : Math.max(0, s - 1)], r = o[g.loop ? (s + 1) % g.n : Math.min(g.n - 1, s + 1)];
          C[g.from + s].x[k].copy(C[g.from + s].tg[k]).addScaledVector(o[s], 1 - wgt).addScaledVector(l, wgt / 2).addScaledVector(r, wgt / 2);
        }
      }
    });
  };
  const lenOf = (P, k) => P.c.rest[k].distanceTo(P.c.rest[k + 1]) * sc[P.c.parent];
  const step = (h, speed, t) => {
    const gust = 0.55 + 0.3 * Math.sin(t * 0.63) + 0.2 * Math.sin(t * 1.71 + 1.3) + 0.12 * Math.sin(t * 3.9);
    wind.set(0.8, 0.05, 0.45).normalize().multiplyScalar(gust);
    const head = Math.max(0, speed - Math.max(0, vRoot.dot(fwd)));
    for (const P of C) {
      const c = P.c, damp = c.damp ?? 2, vmax = c.vmax ?? 3;
      for (let k = 0; k < P.x.length; k++) {
        const x = P.x[k], xp = P.xp[k], vt = P.vt[k];
        tv.subVectors(x, xp).divideScalar(h);
        rv.subVectors(tv, vt); if (rv.lengthSq() > vmax * vmax) rv.setLength(vmax);
        vAir.copy(wind).addScaledVector(fwd, -head).sub(vt).sub(rv);
        const fl = c.flut * (0.25 + speed * 0.22), w = t * (7 + k * 2.3) + P.ph;
        vAir.x += fl * Math.sin(w); vAir.y += fl * 0.6 * Math.sin(w * 1.37 + 1); vAir.z += fl * Math.sin(w * 0.83 + 2);
        a.copy(vAir).multiplyScalar(c.drag[k] * (c.quad ? 0.4 + vAir.length() / 8 : 1));
        a.y += G;
        a.addScaledVector(b.subVectors(P.tg[k], x), c.ks[k]).addScaledVector(rv, -damp);
        xp.copy(x);
        x.addScaledVector(vt, h).addScaledVector(rv, h * 0.995).addScaledVector(a, h * h);
      }
    }
    for (let it = 0; it < ITER; it++) {
      for (const P of C) {
        let prev = P.pin, prevT = P.pin;
        for (let k = 0; k < P.x.length; k++) {
          const x = P.x[k], L = lenOf(P, k), cone = P.c.cone[k];
          tv.subVectors(x, prev).normalize();
          ts.subVectors(P.tg[k], prevT).normalize();
          const cs = tv.dot(ts);
          if (cs < Math.cos(cone)) {
            tv.addScaledVector(ts, -cs); if (tv.lengthSq() < 1e-10) tv.set(1, 0, 0).cross(ts);
            tv.normalize().multiplyScalar(Math.sin(cone)).addScaledVector(ts, Math.cos(cone));
          }
          x.copy(prev).addScaledVector(tv, L);
          prev = x; prevT = P.tg[k];
        }
      }
      for (const [s0, k0, s1, k1, L0] of kit.links) {
        const xa = C[s0].x[k0], xb = C[s1].x[k1], L = L0 * sc[C[s0].c.parent];
        tv.subVectors(xb, xa); const d = tv.length() || 1e-6;
        const lim = d > L * 1.08 ? L * 1.08 : d < L * 0.92 ? L * 0.92 : d;
        if (lim !== d) { const e = (d - lim) / d * 0.5; xa.addScaledVector(tv, e); xb.addScaledVector(tv, -e); }
      }
      smoothPanels(0.6);
      for (const P of C) P.x.forEach((x, k) => collide(x, P.c.coll[k], k ? P.x[k - 1] : P.pin));
    }
  };
  // turn the cloth bones so each points from its pin at its particle
  const aim = () => {
    for (const P of C) {
      const c = P.c;
      qr.copy(Pq[c.parent]).multiply(qa.copy(kit.restQ[c.parent]).invert());
      let from = P.pin;
      c.bones.forEach((n, k) => {
        const bn = bones[n];
        tv.subVectors(c.rest[k + 1], c.rest[k]).applyQuaternion(qr).normalize();
        ts.subVectors(P.x[k], from).normalize();
        qd.setFromUnitVectors(tv, ts);
        if (k === 0) bn.quaternion.copy(qb.copy(Pq[c.parent]).invert()).multiply(qd).multiply(qr);
        else bn.quaternion.copy(qb.copy(qr).invert()).multiply(qd).multiply(qr);
        qr.premultiply(qd);
        from = P.x[k];
      });
    }
  };

  return {
    update(dt, speed = 0) {
      // drawn before, but not in the last few frames: off screen
      if (ren && ren.info.render.frame - seen > 4) { ready = false; return; }
      const holder = m.parent, root = (holder && holder.parent) || holder || m;
      root.updateWorldMatrix(true, true);
      frames();
      rootP.setFromMatrixPosition(root.matrixWorld);
      fwd.set(0, 0, 1).transformDirection(root.matrixWorld);
      const jump = rootP.distanceTo(rootPrev) > 3;
      if (!ready || jump || dt > 0.25) {
        follow();
        for (const P of C) P.x.forEach((x, k) => { x.copy(P.tg[k]); P.xp[k].copy(x); });
        vRoot.set(0, 0, 0); ready = true;
      } else if (dt > 0) vRoot.subVectors(rootP, rootPrev).divideScalar(dt);
      rootPrev.copy(rootP);
      for (const P of C) P.tg.forEach((g, k) => P.tp[k].copy(g));
      follow();
      for (const P of C) P.tg.forEach((g, k) => (dt > 0 && dt <= 0.25 && ready ? P.vt[k].subVectors(g, P.tp[k]).divideScalar(dt) : P.vt[k].set(0, 0, 0)));
      const n = dt > 0.25 ? 120 : Math.min(LOW ? 2 : 3, Math.max(1, Math.round(dt / H)));
      const h = dt > 0.25 ? H : dt / n;
      if (dt > 0.25) vRoot.set(0, 0, 0);
      for (let i = 0; i < n; i++) { clock += h; step(h, speed, clock); }
      aim();
    },
  };
}
