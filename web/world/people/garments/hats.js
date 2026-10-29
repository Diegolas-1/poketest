// Hats, and the toolkit every accessory file (eyewear.js, bags.js, accessories.js) shares.
//
// Everything that sits on the head is built in the head's frame: the skull the
// anatomy made (anatomy.js: a cranium ellipsoid melted into a face ellipsoid,
// moved by the elder's stoop) is rebuilt here as a fast analytic field, so a
// crown can be the skull grown by a gap (snug at the band, roomier over the top
// where the flattened hair sits), cut by a tilted band plane that runs low over
// the forehead and drops behind the ears. Brims are thin sheets round that band
// (an ellipse 1.3-1.6x the head's width, drooping or snapped per hat), caps get a
// curved bill, and extras (pompoms, earflaps, bows, flowers, feathers, ears) are
// more fields in the same frame. A hat is one solid (wear.js) rigid on the Head
// bone, so it fits every age and slider and never slides in a clip.
//
// Paint: solids get their gco rewritten to the head frame: x = arc round the
// head from the front (m, + to the person's left), y = height over the
// cranium's centre (m), z = horizontal distance from the head's axis (m),
// w = part id (0 crown, 1 brim / bill, 2 band, 3 button / pompom, 4 flaps,
// 5..7 extras). The catalogue's pattern (patterns.js) runs on (x, y) with uP[0]
// = (band, top) so band placements land on the hat.
//
// Toolkit (exported with Helper / Tree names so garments/index.js skips them):
//   headHelper(ctx)        the head frame: skull field, extents, eyes, ears
//   sdfHelper(ctx, parts, o)  a solid from field parts [{ f(x,y,z) world, box, id }]
//   MeshHelper             direct meshes: swept tubes and ribbons, lathes, discs
//   pieceHelper(ctx, raw, o)  raw mesh -> a wear.js piece (skin weights, canon, gco)
//   surfHelper(ctx, p, dir, off)  the body's surface (+ off) along a ray
//   bow / flower / star / feather / pompom fields for every file.
import { jointPos, fy } from '../wear.js';
import { smin2 as sminK, smax2 as smaxK } from '../sdf.js';
import { normals, smoothNormals, surfaceNets, project, decimate, relax } from '../mesh.js';
import { BONE } from '../rig.js';
import { patternGLSL } from './patterns.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sst = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const f3 = (x) => (+x).toFixed(4);
export const fmtHelper = f3;

// ---------- fields ----------
// ellipsoid (iq's bound, as sdf.js) centred at the origin
function ellD(x, y, z, a, b, c) {
  const k0 = Math.sqrt((x / a) ** 2 + (y / b) ** 2 + (z / c) ** 2), k1 = Math.sqrt((x / (a * a)) ** 2 + (y / (b * b)) ** 2 + (z / (c * c)) ** 2);
  return k1 < 1e-9 ? -Math.min(a, b, c) : k0 * (k0 - 1) / k1;
}
export const ellHelper = ellD;
// a segment with round ends: distance from p to segment a-b minus r (r may taper ra -> rb)
export function capsHelper(px, py, pz, a, b, ra, rb = ra) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], qx = px - a[0], qy = py - a[1], qz = pz - a[2];
  const t = clamp((qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz || 1));
  return Math.hypot(qx - bx * t, qy - by * t, qz - bz * t) - (ra + (rb - ra) * t);
}
// a rounded box in a frame (c centre, axes u v w unit, h half sizes, rd rounding)
export function boxHelper(px, py, pz, c, ax, h, rd = 0) {
  const dx = px - c[0], dy = py - c[1], dz = pz - c[2];
  const qx = Math.abs(dx * ax[0][0] + dy * ax[0][1] + dz * ax[0][2]) - h[0] + rd, qy = Math.abs(dx * ax[1][0] + dy * ax[1][1] + dz * ax[1][2]) - h[1] + rd, qz = Math.abs(dx * ax[2][0] + dy * ax[2][1] + dz * ax[2][2]) - h[2] + rd;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rd;
}
// a frame (three unit axes) from a forward direction and an up hint
export function frameHelper(fwd, up = [0, 1, 0]) {
  const w = nrm(fwd); let u = cross(up, w); if (Math.hypot(...u) < 1e-6) u = cross([1, 0, 0], w); u = nrm(u);
  return [u, cross(w, u), w];
}
export const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const addV = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const subV = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dotV = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const lerpV = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// local point in a frame -> world
export const inFrameHelper = (c, ax, l) => [c[0] + ax[0][0] * l[0] + ax[1][0] * l[1] + ax[2][0] * l[2], c[1] + ax[0][1] * l[0] + ax[1][1] * l[1] + ax[2][1] * l[2], c[2] + ax[0][2] * l[0] + ax[1][2] * l[1] + ax[2][2] * l[2]];
// world point -> a frame's local coordinates
export const toFrameHelper = (c, ax, p) => { const d = subV(p, c); return [dotV(d, ax[0]), dotV(d, ax[1]), dotV(d, ax[2])]; };

// 2D five-point star (iq's sdStar5), r outer, rf inner ratio
export function star2Helper(px, py, r, rf = 0.45) {
  const k1x = 0.809016994375, k1y = -0.587785252292, k2x = -k1x, k2y = k1y;
  px = Math.abs(px);
  let d = 2 * Math.max(k1x * px + k1y * py, 0); px -= d * k1x; py -= d * k1y;
  d = 2 * Math.max(k2x * px + k2y * py, 0); px -= d * k2x; py -= d * k2y;
  px = Math.abs(px); py -= r;
  const bax = rf * -k1y, bay = rf * k1x - 1;
  const h = clamp((px * bax + py * bay) / (bax * bax + bay * bay), 0, r);
  return Math.hypot(px - bax * h, py - bay * h) * Math.sign(py * bax - px * bay);
}

// ---------- surfaces of the body ----------
// the body's surface plus off, coming from far along dir towards p (the first hit from outside)
export function surfHelper(ctx, p, dir, off = 0, far = 0.25) {
  const f = ctx.f; dir = nrm(dir);
  let t = far;
  for (let i = 0; i < 200; i++) {
    const q = addV(p, dir, t), d = f(q[0], q[1], q[2]) - off;
    if (d < 2e-4) return q;
    t -= Math.max(d * 0.9, 3e-4);
    if (t < -far) break;
  }
  return addV(p, dir, Math.max(t, 0));
}

// the body's surface (+ off) going out from a point inside it along dir (the first way out: arms beside the body are not hit)
export function exitHelper(ctx, p, dir, off = 0, max = 0.6) {
  const f = ctx.f; dir = nrm(dir);
  let t = 0;
  for (let i = 0; i < 300; i++) { const q = addV(p, dir, t), v = f(q[0], q[1], q[2]) - off; if (v >= 0 || t > max) break; t += Math.max(-v * 0.9, 3e-4); }
  return addV(p, dir, t);
}

// ---------- the head frame ----------
export function headHelper(ctx) {
  if (ctx._head) return ctx._head;
  const A = ctx.A, L = A.L, p = A.p || {}, hh = L.hh, hw = L.hw, hd = L.hd, sh = L.headShift || [0, 0, 0];
  const hhs = hh * (1 + 0.07 * (p.headH || 0)), fh = 1 + 0.05 * (p.forehead || 0);
  const jawK = (0.2 + 0.72 * clamp((L.age - 2) / 18)) * (1 - 0.28 * L.fem * clamp((L.age - 8) / 10)) * (1 + 0.35 * (p.jawLine || 0));
  const faceW = hw * (0.45 + 0.04 * (p.jaw || 0)) * (1 - 0.06 * jawK);
  const O = [0, L.chinY + hh - 0.4 * hhs + sh[1], -0.03 * hh + sh[2]];
  const cr = [hw * 0.5, 0.4 * hhs * fh, hd * 0.52], fc = [faceW, 0.38 * hh, 0.37 * hh];
  const fcC = [0, L.chinY + 0.38 * hh + sh[1] - O[1], 0.09 * hh + sh[2] - O[2]];
  const k = hw * (0.14 - 0.05 * jawK);
  // the skull (no ears or nose) in the head's local frame (origin O, the cranium's centre)
  const f = (x, y, z) => sminK(ellD(x, y, z, cr[0], cr[1], cr[2]), ellD(x - fcC[0], y - fcC[1], z - fcC[2], fc[0], fc[1], fc[2]), k);
  const march = (o, d, far = 0.3) => { let t = far; for (let i = 0; i < 120; i++) { const q = addV(o, d, t), v = f(q[0], q[1], q[2]); if (v < 1e-4) return t; t -= Math.max(v * 0.9, 2e-4); } return t; };
  const H = {
    ctx, L, O, hh, hw, hd, cr, f, k,
    W: (l) => [l[0] + O[0], l[1] + O[1], l[2] + O[2]],
    top: cr[1],
    eye: L.eyeY + sh[1] - O[1],
    chin: L.chinY + sh[1] - O[1],
    // the skull's front / back / side at a local height (and, for the front, a local x)
    zF: (y, x = 0) => march([x, y, 0], [0, 0, 1]),
    zB: (y, x = 0) => -march([x, y, 0], [0, 0, -1]),
    xS: (y, z = 0) => march([0, y, z], [1, 0, 0]),
    // the skull's surface along a local direction from the centre
    dirR: (d) => march([0, 0, 0], nrm(d)),
    march,
  };
  // eyes and ears (local)
  H.eyeX = 0.3 * hw;
  H.ear = [hw * 0.5, L.eyeY + sh[1] - 0.06 * hh - O[1], -0.035 * hh + sh[2] - O[2]];
  H.faceZ = L.faceZ - O[2];
  ctx._head = H;
  return H;
}

// a crown fitted to the skull: o { yF, yB (band heights at the front / back), gB (gap at the band), gT (gap over
// the top), sy (height stretch above the band), flat (a flat top at this local height), tilt (rad, about z) }
export function crownHelper(H, o) {
  const zF = H.zF(o.yF), zB = H.zB(o.yB), slope = (o.yF - o.yB) / (zF - zB);
  const sy = o.sy ?? 1, gB = o.gB ?? 0.008, gT = o.gT ?? 0.018, top = H.top, ct = Math.cos(o.tilt || 0), stt = Math.sin(o.tilt || 0);
  const band = (z) => o.yB + (z - zB) * slope;
  const fn = (x, y, z) => {
    if (o.tilt) { const X = x * ct + y * stt, Y = -x * stt + y * ct; x = X; y = Y; }
    const yb = band(z), up = y - yb;
    const yy = up > 0 ? yb + up / sy : y;
    const g = gB + (gT - gB) * sst(0, Math.max(top - yb, 0.02), up / sy);
    let d = H.f(x, yy, z) * Math.min(1, sy) - g;
    if (o.flat !== undefined) d = smaxK(d, y - o.flat, o.flatR ?? 0.01);
    return d;
  };
  fn.band = band; fn.zF = zF; fn.zB = zB; fn.slope = slope;
  return fn;
}
// the top of a crown (local height) for its gap and stretch
export const crownTop = (H, crown, gT, sy = 1) => { const yb = crown.band(0); return yb + (H.top + gT - yb) * sy; };
// a fuzzy ball (pompoms)
export function pompomHelper(c, r, bump = 0.12) {
  return (x, y, z) => {
    const dx = x - c[0], dy = y - c[1], dz = z - c[2], l = Math.hypot(dx, dy, dz) || 1e-6;
    const n = Math.sin(dx / l * 9.1 + 1.3) * Math.sin(dy / l * 8.3 + 0.4) * Math.sin(dz / l * 8.7 + 2.1);
    return (l - r * (1 + bump * n)) * 0.8;
  };
}
// a bow: two puffy loops, a knot and two tails. c centre, ax frame (x across, y up, z out of the face), s width
export function bowHelper(c, ax, s, o = {}) {
  const tails = o.tails ?? 0.9, loopH = o.loopH ?? 0.36, puff = o.puff ?? 0.16;
  return (X, Y, Z) => {
    const [x, y, z] = toFrameHelper(c, ax, [X, Y, Z]);
    const ax0 = Math.abs(x);
    // a loop: a flattened ellipsoid with a dent towards the knot
    const lx = ax0 - s * 0.26, loop = ellD(lx, y, z, s * 0.26, s * loopH * (0.6 + 0.4 * clamp(ax0 / (s * 0.3))), s * puff);
    const dent = ellD(lx + s * 0.04, y, z - s * puff * 0.9, s * 0.16, s * loopH * 0.45, s * puff * 0.6);
    let d = Math.max(loop, -dent);
    d = Math.min(d, ellD(x, y, z - s * 0.02, s * 0.1, s * 0.13, s * puff * 1.15));
    if (tails > 0) {
      const tl = s * 0.55 * tails, ty = y + s * 0.08, tx = ax0 - (s * 0.06 + (-ty) * 0.45);
      if (ty < 0) d = Math.min(d, Math.max(Math.abs(tx) - s * 0.09 * (1 + (-ty) / tl * 0.4), Math.abs(z + s * 0.02) - s * 0.03, -ty - tl + Math.abs(tx) * 0.5, ty));
      else d = Math.min(d, Math.max(Math.hypot(tx, ty) - s * 0.09, Math.abs(z + s * 0.02) - s * 0.03));
    }
    return d * 0.8;
  };
}
// a flower: n round petals round a centre (c, normal n), r radius; rose: two rings of cupped petals
const rr0 = (x, y) => Math.hypot(x, y);
export function flowerHelper(c, n, r, o = {}) {
  const ax = frameHelper(n, o.up || [0, 1, 0]), N = o.petals ?? 5, rose = !!o.rose;
  return (X, Y, Z) => {
    const [x, y, z] = toFrameHelper(c, ax, [X, Y, Z]);
    const a = Math.atan2(y, x), rr = Math.hypot(x, y);
    let d;
    if (rose) {
      // three rings of cupped petals opening out, round a tight bud
      d = ellD(x, y, z - r * 0.32, r * 0.2, r * 0.2, r * 0.26);
      const rings = [[6, 0.6, 0.0, 0.9, 0.42], [5, 0.36, 0.14, 0.55, 0.34], [4, 0.17, 0.24, 0.25, 0.26]];
      for (const [n, rr, zk, tl, sz] of rings) {
        const k = (2 * Math.PI) / n, off = rr * 3.1, sa = (((a + off) % k) + k) % k - k / 2;
        const u = rr0(x, y) * Math.cos(sa) - rr * r, v = rr0(x, y) * Math.sin(sa), w = z - zk * r;
        const ct = Math.cos(tl), st = Math.sin(tl), U = u * ct + w * st, W = -u * st + w * ct;
        d = Math.min(d, ellD(U, v, W - r * 0.04, r * sz, r * sz * 0.95, r * 0.07));
      }
    } else {
      const k = (2 * Math.PI) / N, sa = ((a % k) + k) % k - k / 2, px = rr * Math.cos(sa), py = rr * Math.sin(sa);
      d = ellD(px - r * 0.55, py, z, r * 0.5, r * 0.3, r * 0.12);
      d = Math.min(d, ellD(x, y, z - r * 0.08, r * 0.25, r * 0.25, r * 0.16));
    }
    return d * 0.85;
  };
}
// a feather: a curved, flattened leaf along a path a -> b bending by bend (vector), w width
export function featherHelper(a, b, bend, w) {
  const mid = addV(lerpV(a, b, 0.5), bend);
  return (x, y, z) => {
    const d1 = capsHelper(x, y, z, a, mid, w * 0.25, w), d2 = capsHelper(x, y, z, mid, b, w, w * 0.15);
    return Math.min(d1, d2);
  };
}
// a five point star slab: c, normal n, r, thickness t
export function starHelper(c, n, r, t, up = [0, 1, 0]) {
  const ax = frameHelper(n, up);
  return (X, Y, Z) => {
    const [x, y, z] = toFrameHelper(c, ax, [X, Y, Z]);
    const d2 = star2Helper(x, y, r, 0.5);
    const dz = Math.abs(z) - t / 2;
    return Math.hypot(Math.max(d2 + t * 0.3, 0), Math.max(dz, 0)) + Math.min(Math.max(d2 + t * 0.3, dz), 0) - t * 0.3;
  };
}

// ---------- solids from field parts ----------
// parts: [{ f(x, y, z) world, box: [[minx..], [maxx..]], id, k (smooth blend into what came before) }]
// o: { cell, verts, bone | weights, gco(p, id) -> [4], hide(V), double, smooth }
export function sdfHelper(ctx, parts, o = {}) {
  parts = parts.filter(Boolean);
  if (!parts.length) return null;
  const n = parts.length, BX = parts.map((p) => p.box), BD = new Float64Array(n), ord = new Int32Array(n);
  // nearest part first; a part whose box is farther than what was found (plus its blend) is skipped
  const F = (x, y, z) => {
    for (let i = 0; i < n; i++) { const b = BX[i]; BD[i] = Math.hypot(Math.max(b[0][0] - x, 0, x - b[1][0]), Math.max(b[0][1] - y, 0, y - b[1][1]), Math.max(b[0][2] - z, 0, z - b[1][2])); ord[i] = i; }
    for (let a = 1; a < n; a++) { const t = ord[a]; let j = a - 1; while (j >= 0 && BD[ord[j]] > BD[t]) { ord[j + 1] = ord[j]; j--; } ord[j + 1] = t; }
    let d = Infinity;
    for (let a = 0; a < n; a++) {
      const i = ord[a], k = parts[i].k || 0;
      if (BD[i] > d + k) break;
      const v = parts[i].f(x, y, z);
      d = k && d < Infinity ? sminK(d, v, k) : Math.min(d, v);
    }
    return d;
  };
  let box = [parts[0].box[0].slice(), parts[0].box[1].slice()];
  for (const p of parts) for (let i = 0; i < 3; i++) { box[0][i] = Math.min(box[0][i], p.box[0][i]); box[1][i] = Math.max(box[1][i], p.box[1][i]); }
  const T = [Date.now()];
  const e = box[1].map((v, i) => v - box[0][i]), area = 2 * (e[0] * e[1] + e[1] * e[2] + e[0] * e[2]) * 0.45;
  let m = surfaceNets(F, box, Math.max(o.cell || 0.003, Math.sqrt(area / ((o.verts || 3000) * 1.4))));
  T.push(Date.now());
  if (!m.idx.length) return null;
  project(m, F, 2);
  T.push(Date.now());
  const raw = m.pos.length / 3;
  if (o.verts && raw > o.verts * 1.15) m = decimate(m, o.verts);
  T.push(Date.now());
  relax(m, o.smooth ?? 1, 0.4, F);
  T.push(Date.now());
  const piece = pieceHelper(ctx, { pos: m.pos, idx: m.idx, g: new Float32Array(m.pos.length / 3 * 4) }, { bone: o.bone, weights: o.weights, hide: o.hide, double: o.double, smooth: o.nsmooth ?? 1 });
  T.push(Date.now());
  if (globalThis.HX_PROF) { const P = m.pos; let mn = [9, 9, 9], mx = [-9, -9, -9]; for (let i = 0; i < P.length; i += 3) for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], P[i + j]); mx[j] = Math.max(mx[j], P[i + j]); } console.log('bbox', mn.map((v) => v.toFixed(3)), mx.map((v) => v.toFixed(3)), 'box', box.map((b) => b.map((v) => v.toFixed(3)))); }
  if (globalThis.HX_PROF) console.log('sdf', raw, '->', m.pos.length / 3, T.slice(1).map((t, i) => t - T[i]).join(' '));
  if (!piece) return null;
  const idOf = (x, y, z) => { let b = 0, bd = Infinity; for (let i = 0; i < n; i++) { const v = Math.abs(parts[i].f(x, y, z)); if (v < bd) { bd = v; b = i; } } return parts[b].id ?? b; };
  const M = piece.mesh, P = M.pos, G = M.gco;
  for (let v = 0; v < P.length / 3; v++) {
    const q = [P[3 * v], P[3 * v + 1], P[3 * v + 2]], id = idOf(q[0], q[1], q[2]);
    const g = o.gco ? o.gco(q, id) : [q[0], q[1], q[2], id];
    G[4 * v] = g[0]; G[4 * v + 1] = g[1]; G[4 * v + 2] = g[2]; G[4 * v + 3] = g[3] ?? id;
  }
  return piece;
}
export const boxAroundHelper = (c, r) => [[c[0] - r, c[1] - r, c[2] - r], [c[0] + r, c[1] + r, c[2] + r]];

// ---------- direct meshes ----------
// accumulate triangles (pos, idx, gco) from sweeps, lathes and discs, then pieceHelper() it
export class MeshHelper {
  constructor() { this.pos = []; this.idx = []; this.g = []; }
  get n() { return this.pos.length / 3; }
  vert(p, g) { this.pos.push(p[0], p[1], p[2]); this.g.push(g[0] ?? 0, g[1] ?? 0, g[2] ?? 0, g[3] ?? 0); return this.n - 1; }
  tri(a, b, c) { this.idx.push(a, b, c); }
  // a tube or a ribbon along a path. o: { r (number | (t) => r), prof: 'round' | 'flat', w, th ((t) => [half width, half thickness]),
  //   up: (i) => outward normal (ribbons: the face looks along it), seg, closed, caps, id, g(t, a) -> gco }
  sweep(path, o = {}) {
    const n = path.length, closed = !!o.closed, seg = o.seg || (o.prof === 'flat' ? 8 : 8), base = this.n, t0 = this.idx.length;
    const T = path.map((p, i) => nrm(subV(path[closed ? (i + 1) % n : Math.min(i + 1, n - 1)], path[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)])));
    // frames: given normals, or parallel transported
    const N = [];
    if (o.up) for (let i = 0; i < n; i++) { const u = typeof o.up === 'function' ? o.up(i, path[i]) : o.up; N.push(nrm(cross(T[i], cross(u, T[i])))); }
    else {
      let a = Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      N.push(nrm(cross(T[0], cross(a, T[0]))));
      for (let i = 1; i < n; i++) { const b = cross(T[i], cross(N[i - 1], T[i])); N.push(nrm(Math.hypot(...b) > 1e-6 ? b : N[i - 1])); }
    }
    let len = 0; const S = [0];
    for (let i = 1; i < n; i++) { len += Math.hypot(...subV(path[i], path[i - 1])); S.push(len); }
    for (let i = 0; i < n; i++) {
      const t = len ? S[i] / len : 0, B = cross(T[i], N[i]);
      let rw, rt;
      if (o.th) [rw, rt] = o.th(t, i); else { const r = typeof o.r === 'function' ? o.r(t, i) : o.r ?? 0.003; rw = rt = r; }
      for (let j = 0; j < seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        let cx = Math.cos(a), cy = Math.sin(a);
        if (o.prof === 'flat') { const e = 0.35; cx = Math.sign(cx) * Math.pow(Math.abs(cx), e); cy = Math.sign(cy) * Math.pow(Math.abs(cy), e); }
        // B across (width), N out (thickness)
        const p = addV(addV(path[i], B, cx * rw), N[i], cy * rt);
        this.vert(p, o.g ? o.g(t, a, S[i], i) : [S[i], cx * rw, 0, o.id ?? 0]);
      }
    }
    const rows = closed ? n : n - 1;
    for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) {
      const a = base + i * seg + j, b = base + i * seg + (j + 1) % seg, c = base + ((i + 1) % n) * seg + j, d = base + ((i + 1) % n) * seg + (j + 1) % seg;
      this.tri(a, b, c); this.tri(b, d, c);
    }
    if (!closed && o.caps !== false) for (const [i, s] of [[0, -1], [n - 1, 1]]) {
      const c = this.vert(path[i], o.g ? o.g(i ? 1 : 0, 0, S[i], i) : [S[i], 0, 0, o.id ?? 0]);
      for (let j = 0; j < seg; j++) { const a = base + i * seg + j, b = base + i * seg + (j + 1) % seg; if (s > 0) this.tri(a, b, c); else this.tri(b, a, c); }
    }
    // the rings run round B -> N: turn the triangles outwards
    for (let t = t0; t < this.idx.length; t += 3) { const x = this.idx[t + 1]; this.idx[t + 1] = this.idx[t + 2]; this.idx[t + 2] = x; }
    return this;
  }
  // a lathe round an axis: prof [[r, h], ...] (h along the axis), at c with frame ax (y = axis)
  lathe(c, ax, prof, o = {}) {
    const seg = o.seg || 24, base = this.n;
    for (const [r, h] of prof) for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, l = [Math.cos(a) * r, h, Math.sin(a) * r];
      this.vert(inFrameHelper(c, ax, l), o.g ? o.g(l, r, h, a) : [l[0], l[2], h, o.id ?? 0]);
    }
    const t0 = this.idx.length;
    for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < seg; j++) {
      const a = base + i * seg + j, b = base + i * seg + (j + 1) % seg, cc = base + (i + 1) * seg + j, d = base + (i + 1) * seg + (j + 1) % seg;
      this.tri(a, cc, b); this.tri(b, cc, d);
    }
    this.orientClosed(t0, this.idx.length, o.out);
    return this;
  }
  // a flat outline extruded: pts2 [[x, y], ...] (counter-clockwise) in frame ax at c, thickness t (along ax z)
  slab(c, ax, pts2, t, o = {}) {
    const n = pts2.length, base = this.n;
    for (const zz of [t / 2, -t / 2]) for (const [x, y] of pts2) { const l = [x, y, zz]; this.vert(inFrameHelper(c, ax, l), o.g ? o.g(l) : [x, y, zz, o.id ?? 0]); }
    const cf = this.vert(inFrameHelper(c, ax, [0, 0, t / 2]), o.g ? o.g([0, 0, t / 2]) : [0, 0, t / 2, o.id ?? 0]);
    const cb = this.vert(inFrameHelper(c, ax, [0, 0, -t / 2]), o.g ? o.g([0, 0, -t / 2]) : [0, 0, -t / 2, o.id ?? 0]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.tri(base + i, base + j, cf); this.tri(base + n + j, base + n + i, cb);
      this.tri(base + i, base + n + i, base + j); this.tri(base + j, base + n + i, base + n + j);
    }
    return this;
  }
  // a grid of rows (j = 0..nv) of columns (i = 0..nu-1 closed, or 0..nu open): P(i, j) world; returns rows of indices
  grid(nu, nv, P, closed, g) {
    const rows = [];
    for (let j = 0; j <= nv; j++) { const r = []; for (let i = 0; i < (closed ? nu : nu + 1); i++) { const p = P(i, j); r.push(this.vert(p, g(p))); } rows.push(r); }
    for (let j = 0; j < nv; j++) this.strip(rows[j], rows[j + 1], closed);
    return rows;
  }
  // triangles between two rows of vertex indices (a row of one: a fan)
  strip(A, B, closed) {
    if (A.length === 1 || B.length === 1) { const [c, R] = A.length === 1 ? [A[0], B] : [B[0], A]; for (let i = 0; i < R.length - (closed ? 0 : 1); i++) this.tri(c, R[i], R[(i + 1) % R.length]); return; }
    const n = A.length;
    for (let i = 0; i < n - (closed ? 0 : 1); i++) { const i2 = (i + 1) % n; this.tri(A[i], A[i2], B[i]); this.tri(A[i2], B[i2], B[i]); }
  }
  // turn triangles [t0, t1) outwards: away from their vertices' centroid (closed shapes), or along out(q)
  orientClosed(t0, t1, out) {
    if (out) return this.orient(t0, t1, out);
    const P = this.pos, I = this.idx; let c = [0, 0, 0], k = 0;
    for (let t = t0; t < t1; t++) { c = addV(c, [P[3 * I[t]], P[3 * I[t] + 1], P[3 * I[t] + 2]]); k++; }
    c = c.map((v) => v / (k || 1));
    return this.orient(t0, t1, (q) => subV(q, c));
  }
  // turn triangles [t0, t1) of idx so they face along out(centroid) on the whole
  orient(t0, t1, out) {
    const P = this.pos, I = this.idx;
    let s = 0;
    for (let t = t0; t < t1; t += 3) {
      const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
      const n = cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]);
      s += dotV(n, out([(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3]));
    }
    if (s < 0) for (let t = t0; t < t1; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; }
  }
  // a small field meshed (surface nets) into this mesh: f world, box, cell; g(p) -> gco
  field(f, box, cell, g, budget = 1600) {
    // no finer than the budget needs (about half the box's surface is the shape's)
    const e = box[1].map((v, i) => v - box[0][i]), area = 2 * (e[0] * e[1] + e[1] * e[2] + e[0] * e[2]) * 0.45;
    cell = Math.max(cell, Math.sqrt(area / (budget * 1.4)));
    let m = surfaceNets(f, box, cell);
    if (!m.idx.length) return this;
    project(m, f, 3);
    if (m.pos.length / 3 > budget * 1.2) m = decimate(m, budget);
    relax(m, 1, 0.4, f);
    const b = this.n;
    for (let v = 0; v < m.pos.length / 3; v++) { const p = [m.pos[3 * v], m.pos[3 * v + 1], m.pos[3 * v + 2]]; this.vert(p, g(p)); }
    for (const i of m.idx) this.idx.push(i + b);
    return this;
  }
  add(m) { const b = this.n; this.pos.push(...m.pos); this.g.push(...m.g); for (const i of m.idx) this.idx.push(i + b); return this; }
}
// a raw mesh -> a wear.js piece. o: { bone | weights(p) -> [[bone, w]..] (default: the nearest body vertex's), hide(V), double, layer, smooth }
export function pieceHelper(ctx, raw, o = {}) {
  if (!raw || !raw.idx.length) return null;
  const n = raw.pos.length / 3, B = ctx.body;
  const pos = Float32Array.from(raw.pos), idx = Uint32Array.from(raw.idx), gco = Float32Array.from(raw.g);
  const skin = new Uint16Array(n * 4), wts = new Float32Array(n * 4), canon = new Float32Array(n * 3), part = new Float32Array(n * 4), share = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2], near = ctx.hash.nearest(x, y, z, 6);
    if (near >= 0) {
      for (let j = 0; j < 3; j++) canon[3 * v + j] = B.canon[3 * near + j] + (pos[3 * v + j] - B.pos[3 * near + j]);
      for (let j = 0; j < 4; j++) { part[4 * v + j] = B.part[4 * near + j]; share[4 * v + j] = B.share[4 * near + j]; }
    }
    if (o.bone !== undefined) { skin[4 * v] = typeof o.bone === 'string' ? BONE[o.bone] : o.bone; wts[4 * v] = 1; }
    else if (o.weights) { let s = 0; const ws = o.weights([x, y, z], v).slice(0, 4); for (const [, w] of ws) s += w; ws.forEach(([b, w], k) => { skin[4 * v + k] = typeof b === 'string' ? BONE[b] : b; wts[4 * v + k] = w / (s || 1); }); }
    else if (near >= 0) for (let j = 0; j < 4; j++) { skin[4 * v + j] = B.skin[4 * near + j]; wts[4 * v + j] = B.wts[4 * near + j]; }
  }
  const mesh = { pos, idx, skin, wts, canon, part, share, gco };
  mesh.nrm = normals(mesh);
  if (o.smooth) smoothNormals(mesh, null, o.smooth, 0.5);
  const hide = new Uint8Array(ctx.n);
  if (o.hide) for (let v = 0; v < ctx.n; v++) if (o.hide(ctx.V(v)) > 0) hide[v] = 1;
  return { mesh, hide, double: o.double ?? false, layer: o.layer ?? 0 };
}
// blend weights between two bones along a parameter
export const rampHelper = (b0, b1, t) => (t <= 0 ? [[b0, 1]] : t >= 1 ? [[b1, 1]] : [[b0, 1 - t], [b1, t]]);

// the offset clothes on the trunk reach (for straps, pins and bags to sit on): from what is worn
export function outerOffHelper(it) {
  const lay = (l) => 0.0025 + 0.0042 * l;
  if (it.has('outer')) return lay(4) + 0.008;
  if (it.has('dress') || it.has('onepiece')) return lay(2) + 0.007;
  if (it.has('top')) return lay(2) + 0.006;
  if (it.has('apron')) return lay(3.2) + 0.004;
  return 0.004;
}

// ---------- GLSL bits (strings for paint bodies) ----------
// the Snap-Orb emblem at q (vec2) centred c with radius r: sets col
export const orbGLSL = (q, c, r, mask = '1.0', top = 'uAccent', bot = 'uTrim') => `{ float e_ = orb(${q}, ${c}, ${r}) * (${mask}); col = e_ > 0.5 ? (e_ < 1.5 ? ${top} : e_ < 2.5 ? vec3(0.13) : e_ < 3.5 ? ${bot} : vec3(0.95)) : col; col = mix(col, vec3(0.13), ring(${q}, ${c}, ${r}, ${r} * 0.12) * (${mask})); }`;
// a five-point star mask at q (vec2 expr) centred c (vec2 expr), radius r (paint.js' star() misbehaves far from its centre)
export const starGLSL = (q, c, r) => `aa(length((${q}) - (${c})) - (${r}) * mix(0.44, 1.0, pow(abs(cos(2.5 * atan((${q}).x - (${c}).x, (${q}).y - (${c}).y))), 3.0)))`;
// shading-friendly variation for cloth (soft weave noise) and knit ribs
export const KNIT = (u, v, s = 0.006) => `col *= 0.93 + 0.07 * stripes(${u}, ${f3(s)}, ${f3(s * 0.5)});`;


// ---------- hats ----------
// the head frame's paint coordinates for a vertex
function headGco(H) {
  const R = H.hw * 0.5;
  return (p, id) => { const x = p[0] - H.O[0], y = p[1] - H.O[1], z = p[2] - H.O[2]; return [Math.atan2(x, z) * R, y, Math.hypot(x, z), id]; };
}
const box3 = (H, hx, ylo, yhi, zlo, zhi) => [[H.O[0] - hx, H.O[1] + ylo, H.O[2] + zlo], [H.O[0] + hx, H.O[1] + yhi, H.O[2] + zhi]];
// a local field -> a world one
const loc = (H, fn) => { const O = H.O; return (x, y, z) => fn(x - O[0], y - O[1], z - O[2]); };
const det = (it) => it.params.details || [];
const has = (it, d) => det(it).includes(d);
export { has as hasHelper };

// a star-shaped surface round c (local) on a local field fl, cast ray by ray, kept between the bounds
// hi (cut away where > 0, from the top) and lo (cut away where > 0, below); rim folds the open edges inwards
function radialMesh(H, P, m, g) {
  const c = P.c || [0, 0, 0], nu = P.nu || 72, nv = P.nv || 26, fl = P.fl, far = P.far || H.hh * 1.6;
  const at = (th, ph) => {
    const d = [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)];
    let t = far;
    for (let i = 0; i < 240; i++) { const v = fl(c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t); if (v < 3e-5) break; t -= Math.max(v * 0.95, 3e-5); if (t < 0) { t = 0; break; } }
    return [c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t];
  };
  const edge = (th, fn, ph0, want) => {
    const N = 32; let a = ph0, b = null;
    for (let i = 1; i <= N; i++) { const ph = ph0 + (Math.PI * 0.995 - ph0) * i / N; if ((fn(...at(th, ph)) > 0) === want) { b = ph; break; } a = ph; }
    if (b === null) return Math.PI * 0.995;
    for (let k = 0; k < 14; k++) { const mid = (a + b) / 2; if ((fn(...at(th, mid)) > 0) === want) b = mid; else a = mid; }
    return (a + b) / 2;
  };
  const TH = Array.from({ length: nu }, (_, i) => (i / nu) * Math.PI * 2);
  const lim = TH.map((th) => { const a = P.hi ? edge(th, P.hi, 0, false) : 0; return [a, P.lo ? edge(th, P.lo, a + 1e-3, true) : Math.PI * 0.995]; });
  const t0 = m.idx.length, rows = [];
  const V = (l) => { const w = H.W(l); return m.vert(w, g(w)); };
  if (!P.hi) rows.push([V(at(0, 0))]);
  for (let j = P.hi ? 0 : 1; j <= nv; j++) rows.push(TH.map((th, i) => { const [a, b] = lim[i], s = j / nv; return V(at(th, a + (b - a) * s)); }));
  for (let j = 0; j < rows.length - 1; j++) m.strip(rows[j], rows[j + 1], true);
  const Wc = H.W(c);
  m.orient(t0, m.idx.length, (q) => subV(q, Wc));
  // rims: the open edges folded in towards the head
  const rim = (row, out, depth) => {
    const t1 = m.idx.length, inner = row.map((v) => { const p = [m.pos[3 * v], m.pos[3 * v + 1], m.pos[3 * v + 2]], h = nrm([Wc[0] - p[0], 0, Wc[2] - p[2]]); const q = addV(addV(p, h, depth), [0, out, 0], depth * 0.3); return m.vert(q, g(q)); });
    m.strip(row, inner, true);
    m.orient(t1, m.idx.length, () => [0, out, 0]);
  };
  if (P.rim) { rim(rows[rows.length - 1], -1, P.rim); if (P.hi) rim(rows[0], 1, P.rim); }
  return m;
}
// a brim round a band: P { yF, yB, zF, zB (band plane), rx, rzF, rzB (outer half sizes), zc, t, droop(q, cos, sin), rim, inner }
function brimMesh(H, P, m, g) {
  const nu = P.nu || 96, nq = P.nq || 9, t = P.t, slope = (P.yF - P.yB) / (P.zF - P.zB), zc = P.zc, qin = P.inner ?? 0.45;
  const pt = (i, j, side) => {
    const th = (i / nu) * Math.PI * 2, q = qin + (1 - qin) * j / nq, cs = Math.cos(th), sn = Math.sin(th), rz = cs > 0 ? P.rzF : P.rzB;
    const x = q * P.rx * sn, z = zc + q * rz * cs, ys = P.yB + (z - P.zB) * slope + (P.droop ? P.droop(q, cs, sn) : 0);
    return H.W([x, ys + side * t / 2, z]);
  };
  const t0 = m.idx.length;
  const top = m.grid(nu, nq, (i, j) => pt(i, j, 1), true, g);
  m.orient(t0, m.idx.length, () => [0, 1, 0]);
  const t1 = m.idx.length;
  const bot = m.grid(nu, nq, (i, j) => pt(i, j, -1), true, g);
  m.orient(t1, m.idx.length, () => [0, -1, 0]);
  const Wc = H.W([0, 0, zc]);
  for (const [j, s] of [[nq, 1], [0, -1]]) { const t2 = m.idx.length; m.strip(top[j], bot[j], true); m.orient(t2, m.idx.length, (q) => { const d = subV(q, Wc); return [d[0] * s, 0, d[2] * s]; }); }
  if (P.rim) {
    const loop = top[nq].map((v, i) => { const a = pt(i, nq, 0); return a; });
    m.sweep(loop, { r: Math.max(P.rim, t * 0.55), closed: true, seg: 8, g: (tt, a, S, i) => g(loop[i]) });
  }
  return m;
}
// a cap's bill: P { y (root height at the front), z (root), len, w (half width), tilt (rad down), curve (m the sides bend down), lift, t }
function billMesh(H, P, m, g) {
  const back = H.hh * 0.12, zc = P.z - back, bl = P.len + back, tn = Math.tan(P.tilt || 0), t = P.t, nu = 30, nv = 9, r0 = 0.25;
  const pt = (i, j, side) => {
    const al = -Math.PI / 2 + Math.PI * i / nu, r = r0 + (1 - r0) * j / nv;
    const x = r * P.w * Math.sin(al), z = zc + r * bl * Math.cos(al), dz = Math.max(z - P.z, 0);
    const ys = P.y - tn * dz - (P.curve || 0) * (x / P.w) ** 2 + (P.lift || 0) * dz * dz;
    return H.W([x, ys + side * t / 2, z]);
  };
  const t0 = m.idx.length;
  const top = m.grid(nu, nv, (i, j) => pt(i, j, 1), false, g);
  m.orient(t0, m.idx.length, () => [0, 1, 0]);
  const t1 = m.idx.length;
  const bot = m.grid(nu, nv, (i, j) => pt(i, j, -1), false, g);
  m.orient(t1, m.idx.length, () => [0, -1, 0]);
  const Wc = H.W([0, P.y, zc]);
  const sides = [[top[nv], bot[nv]], [top[0], bot[0]], [top.map((r) => r[0]), bot.map((r) => r[0])], [top.map((r) => r[nu]), bot.map((r) => r[nu])]];
  sides.forEach(([A, B], k) => { const t2 = m.idx.length; m.strip(A, B, false); m.orient(t2, m.idx.length, (q) => { const d = subV(q, Wc); return k === 1 ? [-d[0], 0, -d[2]] : [d[0], 0, d[2]]; }); });
  return m;
}

// a hat from parts -> one piece rigid on the Head bone, painted by glsl; uP[0] = (band, top, hw, hh) local
//   parts: { kind: 'radial' | 'brim' | 'bill' | 'tube' (path world, r) | field (f world, box, cell), id, ... }
export function hatPieceHelper(ctx, it, H, parts, glsl, o = {}) {
  const m = new MeshHelper(), G = headGco(H);
  for (const P of parts.filter(Boolean)) {
    const g = (p) => G(p, P.id ?? 0);
    if (P.kind === 'radial') radialMesh(H, P, m, g);
    else if (P.kind === 'brim') brimMesh(H, P, m, g);
    else if (P.kind === 'bill') billMesh(H, P, m, g);
    else if (P.kind === 'tube') m.sweep(P.path, { r: P.r, seg: P.seg || 8, prof: P.prof, th: P.th, up: P.up, g: (t, a, S, i) => g(P.path[i]) });
    else if (P.kind === 'mesh') m.add(P.mesh);
    else m.field(P.f, P.box, P.cell || Math.max(0.0012, Math.min(0.0032, Math.max(...P.box[1].map((v, i) => v - P.box[0][i])) / 45)), g);
  }
  const piece = pieceHelper(ctx, m, { bone: 'Head', double: o.double ?? true, smooth: 0 });
  if (!piece) return [];
  return [{ piece, glsl, noPattern: true, uP: [[o.band ?? H.eye + H.hh * 0.12, H.top + 0.02, H.hw, H.hh], o.uP1 || [0, 0, 0, 0], o.uP2 || [0, 0, 0, 0], o.uP3 || [0, 0, 0, 0]], inside: 0.45 }];
}
// common paint: a body for paintItem() with the pattern on the crown (part 0) and per-part colours
function hatGLSL(it, body, o = {}) {
  const pat = o.pattern === false ? '' : patternGLSL(it.pattern || { type: 'solid' });
  return `vec2 P = vG.xy; float id = floor(vG.w + 0.5); vec3 col = uMain;
    float ang = vG.x / (uP[0].z * 0.5);   // angle round the head (0: the front)
    if (id < 0.5) { ${pat} }
    ${body}
    return col;`;
}
// band heights for a hat: front at the brow, back over the nape (in head heights over the eye line)
const bandOf = (H, front, back) => ({ yF: H.eye + H.hh * front, yB: H.eye + H.hh * back });
const lowOf = (crown) => (x, y, z) => crown.band(z) - y;
// a crown part cast round the skull, cut at the band
const crownPart = (crown, id = 0, o = {}) => ({ kind: 'radial', fl: crown, lo: o.lo || lowOf(crown), hi: o.hi, rim: o.rim ?? 0.004, c: o.c, id, nu: o.nu, nv: o.nv });
// a raised band (ribbon) round a crown field cf: from at over the band line, w tall, out proud of the crown
const bandPart = (cf, crown, at, w, out, id = 2) => ({ kind: 'radial', fl: (x, y, z) => cf(x, y, z) - out, lo: (x, y, z) => crown.band(z) + at - y, hi: (x, y, z) => y - (crown.band(z) + at + w), rim: out + 0.001, id, nv: 4 });

// a cap: a fitted crown a little taller than the skull, a curved bill, a top button
function capKit(ctx, it, o = {}) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const b = bandOf(H, o.front ?? 0.13, o.back ?? -0.02);
  const sy = o.sy ?? 1.08, gT = o.gT ?? 0.016 * T;
  const crown = crownHelper(H, { ...b, gB: o.gB ?? 0.005 * T, gT, sy, flat: o.flat });
  const topY = crownTop(H, crown, gT, sy);
  const parts = [crownPart(crown)];
  if (o.bill !== false) parts.push({ kind: 'bill', y: b.yF + 0.002 * T, z: crown.zF - 0.006 * T, len: hh * (o.len ?? 0.36), w: hw * (o.billW ?? 0.45), tilt: o.billTilt ?? 0.14, curve: hh * (o.curve ?? 0.06), t: o.t ?? 0.0065 * T, lift: o.lift || 0, id: 1 });
  if (o.button !== false) { const c = H.W([0, topY - 0.002, 0]); parts.push({ f: (x, y, z) => ellD(x - c[0], y - c[1], z - c[2], hh * 0.035, hh * 0.016, hh * 0.035), box: boxAroundHelper(c, hh * 0.05), id: 3 }); }
  return { H, hh, hw, T, parts, b, crown, topY };
}
// panels, seams and eyelets of a six-panel cap
const CAP_PAINT = (o = {}) => `
    float up = vG.y - uP[0].x;
    if (id < 0.5) {
      ${o.panels ? 'col = mix(col, uSecond, step(abs(ang), 1.05));' : ''}
      ${o.mesh ? 'float bk = step(1.05, abs(ang)); col = mix(col, uSecond, bk); col = mix(col, col * 0.5, bk * dotsHex(vec2(vG.x, vG.y), 0.006, 0.0017));' : ''}
      float seam = line(ang, 0.0, 0.025);
      for (int i = 0; i < 3; i++) seam = max(seam, line(abs(ang), 1.0472 * float(i + 1), 0.025));
      col = mix(col, col * 0.68, seam * step(0.006, up) * (1.0 - step(uP[0].y - 0.01, vG.y)));
      for (int i = 0; i < 6; i++) { float a0 = -2.618 + float(i) * 1.0472; col = mix(col, col * 0.4, circle(vec2(ang * 0.06, vG.y), vec2(a0 * 0.06, uP[0].y - 0.045), 0.0026)); }
      col = mix(col, col * 0.8, line(up, 0.006, 0.0015));
    }
    if (id > 0.5 && id < 1.5) { col = ${o.bill || 'uMain'}; col = mix(col, col * 0.7, (line(vG.z, uP[1].x, 0.0012) + line(vG.z, uP[1].x - 0.006, 0.0012)) * 0.0); }
    if (id > 2.5 && id < 3.5) col = ${o.button || 'uMain'};`;

export function cap_baseball(ctx, it) {
  const c = capKit(ctx, it, { sy: 1.12 });
  const pt = it.pattern || {}, hh = c.hh;
  const panels = pt.type === 'colour_block';
  const logo = has(it, 'emblem_ball') || panels;
  const swoosh = pt.type === 'print_motif';
  const body = CAP_PAINT({ panels }) + `
    if (id < 0.5) {
      ${logo ? orbGLSL('vec2(vG.x, vG.y)', `vec2(0.0, uP[0].x + ${f3(hh * 0.17)})`, f3(hh * 0.105), 'step(abs(ang), 0.8)', 'uAccent', panels ? 'uMain' : 'uTrim') : ''}
      ${swoosh ? `{ vec2 q = vec2(vG.x, vG.y - uP[0].x - ${f3(hh * 0.15)}); float w = ${f3(hh * 0.035)} * (1.0 - abs(q.x + ${f3(hh * 0.1)}) / ${f3(hh * 0.36)}); col = mix(col, uAccent, aa(abs(q.y - 0.9 * q.x * q.x / ${f3(hh * 0.4)} + q.x * 0.35) - max(w, 0.0)) * step(abs(q.x + ${f3(hh * 0.05)}), ${f3(hh * 0.3)})); }` : ''}
    }`;
  return hatPieceHelper(ctx, it, c.H, c.parts, hatGLSL(it, body, { pattern: !panels && !swoosh }), { band: c.b.yF });
}
export function cap_trucker(ctx, it) {
  const c = capKit(ctx, it, { sy: 1.22, len: 0.38, curve: 0.04, front: 0.14 });
  const hh = c.hh;
  const body = CAP_PAINT({ mesh: true }) + `
    if (id < 0.5) { vec2 q = vec2(vG.x, vG.y - uP[0].x - ${f3(hh * 0.18)}); float m = step(abs(ang), 0.9);
      col = mix(col, uAccent, box2(q, vec2(0.0), vec2(${f3(hh * 0.12)}, ${f3(hh * 0.07)}), 0.005) * m);
      col = mix(col, uTrim, boxLine(q, vec2(0.0), vec2(${f3(hh * 0.12)}, ${f3(hh * 0.07)}), 0.005, 0.002) * m);
      col = mix(col, uTrim, ${starGLSL('q', 'vec2(0.0)', f3(hh * 0.045))} * m); }`;
  return hatPieceHelper(ctx, it, c.H, c.parts, hatGLSL(it, body, { pattern: false }), { band: c.b.yF });
}
export function cap_soft(ctx, it) {
  const c = capKit(ctx, it, { sy: 0.96, len: 0.27, curve: 0.035, billTilt: 0.2, button: false });
  const body = CAP_PAINT({ bill: 'uMain * 0.72' });
  return hatPieceHelper(ctx, it, c.H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function cap_cycling(ctx, it) {
  const c = capKit(ctx, it, { sy: 0.94, len: 0.2, curve: 0.012, billTilt: -0.4, button: false, front: 0.15, gT: 0.012 * headHelper(ctx).hh / 0.28 });
  const body = CAP_PAINT({}) + `if (id > 0.5 && id < 1.5) col = uSecond;
    if (id < 0.5) col = mix(col, uSecond, band(abs(vG.x), 0.0, 0.009) * step(uP[0].x + 0.012, vG.y));
    if (id < 0.5) col = mix(col, uAccent, band(abs(vG.x), 0.0, 0.003) * step(uP[0].x + 0.012, vG.y));
    if (id < 0.5) col = mix(col, uSecond, band(vG.y, uP[0].x + 0.002, uP[0].x + 0.01));`;
  return hatPieceHelper(ctx, it, c.H, c.parts, hatGLSL(it, body, { pattern: false }), { band: c.b.yF });
}
export function school_cap(ctx, it) {
  const c = capKit(ctx, it, { sy: 1.14, len: 0.3, curve: 0.07, front: 0.15, back: -0.08, gT: 0.02 * headHelper(ctx).hh / 0.28 });
  if (has(it, 'chinstrap')) c.parts.push(chinstrapPart(ctx, c.H, c.b, 7));
  const hh = c.hh;
  const body = CAP_PAINT({}) + `if (id > 6.5) col = uTrim * 0.3 + uAccent * 0.7;
    if (id < 0.5) { vec2 q = vec2(vG.x, vG.y - uP[0].x - ${f3(hh * 0.16)}); float m = step(abs(ang), 0.8);
      col = mix(col, uAccent, circle(q, vec2(0.0), ${f3(hh * 0.07)}) * m); col = mix(col, uTrim, ${starGLSL('q', 'vec2(0.0)', f3(hh * 0.052))} * m); }
    if (id < 0.5) col = mix(col, uTrim, band(vG.y, uP[0].x + 0.003, uP[0].x + 0.009) * step(1.6, abs(ang)) * 0.9);`;
  return hatPieceHelper(ctx, it, c.H, c.parts, hatGLSL(it, body, { pattern: false }), { band: c.b.yF });
}
// a chin strap from over the ears down under the chin (tubes on the body's surface)
function chinstrapPart(ctx, H, b, id, o = {}) {
  const hh = H.hh, T = hh / 0.28;
  const yTop = o.from ?? (b.yB + (b.yF - b.yB) * 0.55 + 0.004);
  const zE = H.ear[2] + hh * (o.fwd ?? 0.08);
  const off = o.off ?? 0.003;
  const path = [];
  for (const s of [1, -1]) {
    const seq = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, y = yTop + (H.chin + hh * 0.08 - yTop) * t, z = zE + (hh * 0.16 - zE) * Math.pow(t, 1.6);
      seq.push(surfHelper(ctx, H.W([0, y, z]), [s, -0.25 * t, 0.12 * t], off, 0.22));
    }
    if (s > 0) path.push(...seq); else path.push(...seq.reverse());
    if (s > 0) for (let i = 1; i < 6; i++) { const a = -Math.PI / 2 + Math.PI * i / 6; path.push(surfHelper(ctx, H.W([0, H.chin + hh * 0.03, hh * 0.12]), [Math.sin(a) * -1, -Math.cos(a) * 0 - 0.9, 0.2], off, 0.12)); }
  }
  // the under-chin points went in the right order only for s>0 then s<0; sort the middle by x descending
  return { kind: 'tube', path, r: Math.max(0.0018, 0.0026 * T), seg: 6, prof: 'flat', th: () => [Math.max(0.003, 0.0045 * T), 0.0013 * T], up: (i, p) => nrm(subV(p, H.W([0, H.chin + hh * 0.3, 0]))), id };
}

// full-brim hats ---------------------------------------------------------
// crown + brim + band: o { front, back, gB, gT, sy, flat, crownF(H, b, crown) (a replacement crown field), c (casting centre),
// brim: { w (outer half width x hw), dF, dB (front / back x hw), droop(q, cos, sin), t, rim, lift }, band: { w (x hh), at, out } }
function brimKit(ctx, it, o = {}) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const b = bandOf(H, o.front ?? 0.2, o.back ?? 0.02);
  const gT = (o.gT ?? 0.02) * T, sy = o.sy ?? 1;
  const crown = crownHelper(H, { ...b, gB: (o.gB ?? 0.008) * T, gT, sy, flat: o.flat, flatR: o.flatR });
  const cf = o.crownF ? o.crownF(H, b, crown) : crown;
  const parts = [crownPart(cf, 0, { lo: lowOf(crown), c: o.c })];
  const zc = (crown.zF + crown.zB) / 2;
  if (o.brim) {
    const B = o.brim;
    parts.push({ kind: 'brim', yF: b.yF + (B.lift ?? 0), yB: b.yB + (B.lift ?? 0), zF: crown.zF, zB: crown.zB, rx: hw * B.w, rzF: (B.dF ?? B.w) * hw * 1.04, rzB: (B.dB ?? B.w) * hw, zc, t: B.t ?? 0.006 * T, droop: B.droop, rim: B.rim, inner: B.inner ?? 0.5, id: 1 });
  }
  if (o.band) parts.push(bandPart(cf, crown, (o.band.at ?? 0.004) * T, hh * (o.band.w ?? 0.09), (o.band.out ?? 0.0025) * T, 2));
  return { H, hh, hw, T, parts, b, crown, cf, zc };
}
const BRIM_PAINT = `
    if (id > 0.5 && id < 1.5) col = uMain;
    if (id > 1.5 && id < 2.5) col = uAccent;`;
// a straw weave (crossed bands) for straw hats
const STRAW = `{ vec2 q = vec2(vG.x, (id > 0.5 && id < 1.5) ? vG.z : vG.y); float w = stripes(q.x + q.y, 0.0065, 0.0028) * stripes(q.x - q.y, 0.0065, 0.0028);
    if (id < 1.5) { col = mix(col, uSecond, 0.12 + 0.16 * w); col = mix(col, uSecond * 0.85, line(fract(q.y / 0.012), 0.5, 0.06) * 0.35); } }`;
// a cylinder-like crown standing on the band: o { h (over the band's front), rx, rz, round, taper (top narrower by), bulge, dentTop, pinch, dents4 }
function cylCrown(H, b, cr, o) {
  const zc = (cr.zF + cr.zB) / 2 + (o.dz || 0), yTop = b.yF + o.h;
  return (x, y, z) => {
    const t = clamp((y - b.yB) / Math.max(yTop - b.yB, 0.01));
    const k = 1 - (o.taper || 0) * t + (o.bulge || 0) * Math.sin(t * Math.PI);
    let rx = o.rx * k;
    const rz = o.rz * k;
    if (o.pinch) rx *= 1 - o.pinch * sst(0.35, 1, t) * Math.max(0, (z - zc) / o.rz);
    const q = Math.sqrt((x / rx) ** 2 + ((z - zc) / rz) ** 2);
    let top = yTop;
    if (o.dentTop) top -= o.dentTop * Math.exp(-((x / (o.rx * 0.32)) ** 2)) * (1 - 0.5 * clamp(Math.abs(z - zc) / o.rz));
    if (o.dents4) top -= o.dents4 * Math.max(0, Math.abs(Math.sin(2 * Math.atan2(x, z - zc))) - 0.25) * clamp(q * 1.6);
    const ds = (q - 1) * Math.min(rx, rz), dt = y - top, r = o.round || 0;
    return (Math.hypot(Math.max(ds + r, 0), Math.max(dt + r, 0)) + Math.min(Math.max(ds + r, dt + r), 0) - r) * 0.9;
  };
}
// a bow on the side of a hat's band (side 1 left, -1 right), turned fwd towards the front
function bowPart(c, id, side = 1, s = 0.4, fwd = 0.25, lift = 0.05) {
  const H = c.H, hh = H.hh, y = c.b.yB + (c.b.yF - c.b.yB) * 0.5 + hh * lift;
  const zs = c.zc + hh * fwd * 0.3, xs = side * (H.xS(y, zs) + 0.02 * c.T);
  const ctr = H.W([xs, y, zs]), ax = frameHelper([side, 0, fwd * 0.5], [0, 1, 0]), size = H.hw * s;
  return { f: bowHelper(ctr, ax, size, { tails: 0.6 }), box: boxAroundHelper(ctr, size * 0.8), id };
}
function featherPart(c, id, side = 1) {
  const H = c.H, hh = H.hh, y = c.b.yB + (c.b.yF - c.b.yB) * 0.45 + hh * 0.07;
  const zs = c.zc - hh * 0.05, xs = side * (H.xS(y, zs) + 0.016 * c.T);
  const a = H.W([xs, y - hh * 0.03, zs + hh * 0.06]), b = H.W([xs + side * hh * 0.07, y + hh * 0.3, zs - hh * 0.2]);
  return { f: featherHelper(a, b, [side * 0.015, 0, 0.01], hh * 0.05), box: [[Math.min(a[0], b[0]) - 0.05, Math.min(a[1], b[1]) - 0.04, Math.min(a[2], b[2]) - 0.05], [Math.max(a[0], b[0]) + 0.05, Math.max(a[1], b[1]) + 0.04, Math.max(a[2], b[2]) + 0.05]], id };
}

export function bucket_hat(ctx, it) {
  const wide = has(it, 'brim_wide'), H = headHelper(ctx), hh = H.hh;
  const c = brimKit(ctx, it, { front: 0.22, back: 0.04, gT: 0.022, flat: H.top + 0.03 * hh / 0.28, flatR: 0.03,
    brim: { w: wide ? 0.78 : 0.7, dF: wide ? 0.82 : 0.74, dB: wide ? 0.78 : 0.72, inner: 0.55, droop: (q) => -Math.max(q - 0.6, 0) / 0.4 * hh * (wide ? 0.17 : 0.2) },
    band: { w: 0.06, at: 0.002, out: 0.002 } });
  if (has(it, 'chinstrap')) c.parts.push(chinstrapPart(ctx, H, c.b, 7));
  if (has(it, 'feather')) c.parts.push(featherPart(c, 6));
  const body = BRIM_PAINT + `
    if (id > 0.5 && id < 1.5) col = mix(col, uTrim, line(fract(vG.z / 0.009), 0.5, 0.14) * 0.6 * step(uP[0].z * 0.66, vG.z));
    if (id < 0.5) col = mix(col, col * 0.75, (line(ang, 0.0, 0.015) + line(abs(ang), 1.57, 0.015) + line(abs(ang), 3.14, 0.015)) * step(uP[0].x + 0.02, vG.y));
    ${has(it, 'stitch_contrast') ? 'if (id < 0.5) col = mix(col, uTrim, dashes(vG.x, vG.y, uP[0].x + 0.03, 0.0012, 0.006, 0.0035));' : ''}
    if (id > 1.5 && id < 2.5) col = uSecond;
    if (id > 5.5 && id < 6.5) col = mix(uAccent, uSecond, step(0.5, fract(vG.y * 90.0)));
    if (id > 6.5) col = uSecond;`;
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function sun_hat(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimKit(ctx, it, { front: 0.24, back: 0.03, gT: 0.024, flat: H.top + 0.03 * hh / 0.28, flatR: 0.035,
    brim: { w: 0.82, dF: 0.88, dB: 0.82, droop: (q, cs) => -Math.pow(Math.max(q - 0.5, 0) / 0.5, 1.7) * hh * (0.17 + 0.04 * cs), rim: 0.0035 * hh / 0.28 },
    band: { w: 0.09, at: 0.002 } });
  if (has(it, 'chinstrap')) c.parts.push(chinstrapPart(ctx, H, c.b, 7));
  c.parts.push(bowPart(c, 5, -1, 0.38, 0.1));
  const body = BRIM_PAINT + STRAW + 'if (id > 4.5 && id < 5.5) col = uAccent; if (id > 6.5) col = uAccent;';
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function straw_hat(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimKit(ctx, it, { front: 0.22, back: 0.03, gT: 0.03, sy: 1.04,
    brim: { w: 0.84, dF: 0.88, dB: 0.84, droop: (q) => -Math.pow(Math.max(q - 0.5, 0) / 0.5, 2) * hh * 0.1, rim: 0.004 * hh / 0.28 },
    band: { w: 0.08, at: 0.002 } });
  if (has(it, 'chinstrap')) c.parts.push(chinstrapPart(ctx, H, c.b, 7));
  const body = BRIM_PAINT + STRAW + 'if (id > 6.5) col = uAccent;';
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function boater(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimKit(ctx, it, { front: 0.22, back: 0.06, gB: 0.012,
    crownF: (H2, b, cr) => cylCrown(H2, b, cr, { h: hh * 0.26, rx: H2.hw * 0.57, rz: H2.hd * 0.6, round: 0.006 * hh / 0.28 }),
    c: [0, H.top * 0.3, 0],
    brim: { w: 0.76, dF: 0.78, dB: 0.74, rim: 0.0035 * hh / 0.28 },
    band: { w: 0.11, at: 0.002, out: 0.002 } });
  const body = BRIM_PAINT + `if (id > 1.5 && id < 2.5) { col = uSecond; col = mix(col, uAccent, band(vG.y, uP[0].x + ${f3(hh * 0.04)}, uP[0].x + ${f3(hh * 0.07)})); }
    if (id < 1.5) col *= 0.95 + 0.05 * stripes(vG.x + vG.y * 0.3, 0.005, 0.002);`;
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function felt_hat(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimKit(ctx, it, { front: 0.22, back: 0.04, gT: 0.03, sy: 1.14,
    brim: { w: 0.76, dF: 0.8, dB: 0.74, droop: (q, cs) => -Math.pow(Math.max(q - 0.55, 0) / 0.45, 1.5) * hh * 0.07 + Math.max(-cs, 0) * Math.pow(Math.max(q - 0.55, 0) / 0.45, 2) * hh * 0.16, rim: 0.003 * hh / 0.28 },
    band: { w: 0.1, at: 0.002 } });
  c.parts.push(bowPart(c, 5, 1, 0.36, 0.3));
  const body = BRIM_PAINT + 'if (id > 1.5 && id < 2.5) col = uSecond; if (id > 4.5 && id < 5.5) col = uSecond;';
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function fedora(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimKit(ctx, it, { front: 0.22, back: 0.06,
    crownF: (H2, b, cr) => cylCrown(H2, b, cr, { h: hh * 0.36, rx: H2.hw * 0.56, rz: H2.hd * 0.6, round: hh * 0.07, taper: 0.12, dentTop: hh * 0.07, pinch: 0.35 }),
    c: [0, H.top * 0.3, 0],
    brim: { w: 0.72, dF: 0.8, dB: 0.7, droop: (q, cs) => { const e = Math.pow(Math.max(q - 0.55, 0) / 0.45, 1.6); return cs > 0 ? -0.1 * hh * cs * e : 0.14 * hh * -cs * e; } },
    band: { w: 0.1, at: 0.002, out: 0.003 } });
  const body = BRIM_PAINT + 'if (id > 1.5 && id < 2.5) col = uSecond;';
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function top_hat(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimKit(ctx, it, { front: 0.24, back: 0.08, gB: 0.01,
    crownF: (H2, b, cr) => cylCrown(H2, b, cr, { h: hh * 0.72, rx: H2.hw * 0.54, rz: H2.hd * 0.57, round: 0.006 * hh / 0.28, taper: -0.1 }),
    c: [0, H.top * 0.8, 0], 
    brim: { w: 0.7, dF: 0.72, dB: 0.7, droop: (q, cs, sn) => Math.pow(Math.max(q - 0.6, 0) / 0.4, 2) * hh * 0.09 * sn * sn, rim: 0.004 * hh / 0.28 },
    band: { w: 0.14, at: 0.002, out: 0.002 } });
  const body = BRIM_PAINT + 'if (id > 1.5 && id < 2.5) col = uAccent;';
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function campaign_hat(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimKit(ctx, it, { front: 0.22, back: 0.06,
    crownF: (H2, b, cr) => cylCrown(H2, b, cr, { h: hh * 0.42, rx: H2.hw * 0.6, rz: H2.hd * 0.63, round: hh * 0.03, taper: 0.28, dents4: hh * 0.07 }),
    c: [0, H.top * 0.4, 0],
    brim: { w: 0.8, dF: 0.84, dB: 0.8, droop: (q) => -Math.pow(Math.max(q - 0.6, 0) / 0.4, 2) * hh * 0.025, rim: 0.003 * hh / 0.28 },
    band: { w: 0.07, at: 0.002, out: 0.0025 } });
  if (has(it, 'chinstrap')) c.parts.push(chinstrapPart(ctx, H, c.b, 7));
  const body = BRIM_PAINT + `if (id > 1.5 && id < 2.5) col = uSecond; if (id > 6.5) col = uTrim;
    ${has(it, 'star_emblem') ? `if (id < 0.5) col = mix(col, uAccent, ${starGLSL('vG.xy', `vec2(0.0, uP[0].x + ${f3(hh * 0.14)})`, f3(hh * 0.055))});` : ''}`;
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function cloche(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimKit(ctx, it, { front: 0.17, back: -0.1, gT: 0.026, gB: 0.012, sy: 1.08,
    brim: { w: 0.64, dF: 0.68, dB: 0.64, inner: 0.6, droop: (q) => -Math.pow(Math.max(q - 0.65, 0) / 0.35, 1.2) * hh * 0.12, t: 0.007 * hh / 0.28 },
    band: { w: 0.09, at: 0.008 } });
  if (has(it, 'flower')) {
    const y = c.b.yF + hh * 0.05, zs = c.zc + hh * 0.16, xs = -(H.xS(y, zs) + 0.022 * c.T), ctr = H.W([xs, y, zs]), r = hh * 0.1;
    c.parts.push({ f: flowerHelper(ctr, [-1, 0.15, 0.5], r, { petals: 5 }), box: boxAroundHelper(ctr, r * 1.3), id: 5 });
  }
  const body = BRIM_PAINT + 'if (id > 1.5 && id < 2.5) col = uSecond; if (id > 4.5 && id < 5.5) col = mix(uAccent, uSecond * 0.6 + vec3(0.4, 0.35, 0.1), 0.0);';
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}

// knit and soft hats --------------------------------------------------------
export function beanie(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const tall = it.params.length === 'medium' ? 1.12 : 1.04;
  const ears = has(it, 'animal_ears'), flaps = has(it, 'earflaps');
  const b = bandOf(H, 0.2, flaps ? -0.04 : -0.08);
  const crown = crownHelper(H, { ...b, gB: 0.009 * T, gT: 0.022 * T, sy: tall });
  const topY = crownTop(H, crown, 0.022 * T, tall);
  const parts = [crownPart(crown, 0, { rim: 0.005 * T })];
  // the turned-up ribbed cuff
  if (!ears) parts.push(bandPart(crown, crown, 0, hh * 0.13, 0.004 * T, 2));
  if (has(it, 'pompom')) { const r = hh * 0.13, c = H.W([0, topY + r * 0.55, -hh * 0.02]); parts.push({ f: pompomHelper(c, r), box: boxAroundHelper(c, r * 1.4), id: 3 }); }
  if (flaps) flapParts(H, parts, crown, b, 4);
  if (ears) earParts(H, parts, topY, 5, has(it, 'leaf_sprig'));
  const embro = has(it, 'embroidery_small');
  const body = `${KNIT('vG.x', 'vG.y', 0.007)}
    if (id > 1.5 && id < 2.5) { col = mix(col, col * 0.78, stripes(vG.x, 0.0055, 0.0018)); }
    if (id > 2.5 && id < 3.5) col = uSecond * (0.88 + 0.12 * noise2(vG.xy / 0.003));
    ${embro ? `if (id > 1.5 && id < 2.5) col = mix(col, uAccent, box2(vec2(vG.x, vG.y), vec2(${f3(-hh * 0.2)}, uP[0].x + ${f3(hh * 0.065)}), vec2(${f3(hh * 0.05)}, ${f3(hh * 0.03)}), 0.003));` : ''}
    ${ears ? `if (id > 4.5 && id < 5.5) col = mix(uMain, uSecond, step(vG.z, uP[0].z * 0.0));
      if (id > 5.5) col = uSecond;
      if (id < 0.5) { vec2 q = vec2(vG.x, vG.y - uP[0].x - ${f3(hh * 0.16)}); float fr = step(abs(ang), 1.0);
        col = mix(col, vec3(0.13), circle(vec2(abs(q.x), q.y), vec2(${f3(hh * 0.11)}, 0.0), ${f3(hh * 0.035)}) * fr);
        col = mix(col, vec3(1.0), circle(vec2(abs(q.x), q.y), vec2(${f3(hh * 0.1)}, ${f3(hh * 0.012)}), ${f3(hh * 0.011)}) * fr);
        col = mix(col, uAccent, circle(vec2(abs(q.x), q.y), vec2(${f3(hh * 0.19)}, ${f3(-hh * 0.05)}), ${f3(hh * 0.03)}) * fr * 0.6); }` : ''}`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body), { band: b.yF, uP1: [0, 0, 0, 0] });
}
// earflaps: a padded slab over each ear, following the side of the skull (a parametric patch)
function flapParts(H, parts, crown, b, id, o = {}) {
  const hh = H.hh, T = hh / 0.28, e = H.ear, th = (o.th ?? 0.008) * T, gap = (o.gap ?? 0.015) * T;
  const m = new MeshHelper(), G = headGco(H), g = (p) => G(p, id);
  for (const s of [1, -1]) {
    const cz = e[2] + hh * 0.015, len = hh * (o.len ?? 0.3), rz = hh * 0.16, nu = 10, nv = 12;
    const pt = (i, j, side) => {
      const v = j / nv, u = -1 + 2 * i / nu;
      const w = rz * (v < 0.55 ? 1 - 0.1 * v : Math.sqrt(Math.max(1 - ((v - 0.55) / 0.45) ** 2, 0.02)) * 0.95);
      const z = cz + u * w, y0 = crown.band(z) + 0.01 * T, y = y0 - v * (y0 - (e[1] - len + hh * 0.08));
      const x = H.xS(y, z) + gap + (side > 0 ? th : 0) + th * 0.6 * (1 - u * u) * (side > 0 ? 1 : 0);
      return H.W([s * x, y, z]);
    };
    const t0 = m.idx.length, A = m.grid(nu, nv, (i, j) => pt(i, j, 1), false, g); m.orient(t0, m.idx.length, () => [s, 0, 0]);
    const t1 = m.idx.length, B = m.grid(nu, nv, (i, j) => pt(i, j, -1), false, g); m.orient(t1, m.idx.length, () => [-s, 0, 0]);
    const ctr = H.W([s * H.hw * 0.5, e[1], cz]);
    for (const [P, Q] of [[A[nv], B[nv]], [A.map((r) => r[0]), B.map((r) => r[0])], [A.map((r) => r[nu]), B.map((r) => r[nu])], [A[0], B[0]]]) {
      const t2 = m.idx.length; m.strip(P, Q, false); m.orient(t2, m.idx.length, (q) => { const d = subV(q, ctr); return [0, d[1], d[2]]; });
    }
  }
  parts.push({ kind: 'mesh', mesh: m });
}
// round creature ears on top (and a leaf sprig)
function earParts(H, parts, topY, id, sprig) {
  const hh = H.hh;
  for (const s of [1, -1]) {
    const c = [s * H.hw * 0.36, topY - hh * 0.07, -hh * 0.02], r = hh * 0.13;
    const f = (x, y, z) => Math.max(ellD(x - c[0], y - c[1], z - c[2], r, r, r * 0.45), -(y - c[1] + r * 0.6));
    parts.push({ f: loc(H, f), box: box3(H, Math.abs(c[0]) + r + 0.02, c[1] - r - 0.02, c[1] + r + 0.02, -r - 0.03, r + 0.03), id });
  }
  if (sprig) {
    const a = [0, topY - 0.01, 0.0], b2 = [hh * 0.04, topY + hh * 0.12, hh * 0.02];
    const f = (x, y, z) => Math.min(capsHelper(x, y, z, a, b2, hh * 0.012), ellD(x - hh * 0.1, y - topY - hh * 0.13, z - hh * 0.02, hh * 0.09, hh * 0.035, hh * 0.05), ellD(x + hh * 0.03, y - topY - hh * 0.15, z - hh * 0.02, hh * 0.06, hh * 0.025, hh * 0.035));
    parts.push({ f: loc(H, f), box: box3(H, hh * 0.25, topY - 0.03, topY + hh * 0.25, -hh * 0.12, hh * 0.15), id: id + 1 });
  }
}
export function trapper(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, T = hh / 0.28;
  const b = bandOf(H, 0.2, -0.04);
  const crown = crownHelper(H, { ...b, gB: 0.01 * T, gT: 0.024 * T, sy: 1.08 });
  const topY = crownTop(H, crown, 0.024 * T, 1.08);
  const parts = [crownPart(crown), bandPart(crown, crown, 0, hh * 0.14, 0.011 * T, 7)];
  flapParts(H, parts, crown, b, 4, { th: 0.013, len: 0.34 });
  if (has(it, 'pompom')) { const r = hh * 0.11, c = H.W([0, topY + r * 0.55, -hh * 0.02]); parts.push({ f: pompomHelper(c, r), box: boxAroundHelper(c, r * 1.4), id: 3 }); }
  const body = `${KNIT('vG.x', 'vG.y', 0.008)}
    if (id > 2.5 && id < 3.5) col = uSecond * (0.88 + 0.12 * noise2(vG.xy / 0.003));
    if (id > 3.5 && id < 4.5) col = uMain * 0.95;
    if (id > 6.5) col = uTrim * (0.85 + 0.15 * noise2(vG.xy / 0.0025));`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body), { band: b.yF });
}
export function aviator_cap(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, T = hh / 0.28;
  const b = bandOf(H, 0.22, -0.06);
  const crown = crownHelper(H, { ...b, gB: 0.008 * T, gT: 0.016 * T });
  const parts = [crownPart(crown), bandPart(crown, crown, 0, hh * 0.06, 0.004 * T, 7)];
  flapParts(H, parts, crown, b, 4, { len: 0.3 });
  if (has(it, 'chinstrap')) parts.push(chinstrapPart(ctx, H, b, 6, { from: H.ear[1] - hh * 0.2, fwd: 0.04 }));
  const body = `col = mix(col, col * 0.72, (line(ang, 0.0, 0.015) + line(abs(ang), 1.4, 0.015)) * step(uP[0].x + 0.02, vG.y));
    col = mix(col, col * 0.85, dashes(vG.y, ang * 0.05 + 0.0, 0.0, 0.0012, 0.006, 0.0035));
    if (id > 3.5 && id < 4.5) col = uMain * 0.93;
    if (id > 5.5 && id < 6.5) col = uTrim;
    if (id > 6.5) col = uSecond * (0.88 + 0.12 * noise2(vG.xy / 0.003));`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body), { band: b.yF });
}
export function beret(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const b = bandOf(H, 0.28, 0.1);
  const crown = crownHelper(H, { ...b, gB: 0.006 * T, gT: 0.012 * T });
  const tilt = 0.26, ct = Math.cos(tilt), st = Math.sin(tilt);
  const cy = H.top * 0.55, R = hw * 0.62, Ry = hh * 0.15;
  const puff = (x, y, z) => { const X = x * ct + (y - cy) * st, Y = -x * st + (y - cy) * ct; return ellD(X + hw * 0.02, Y - hh * 0.05, z + hh * 0.03, R, Ry, R * 1.02); };
  const f = (x, y, z) => Math.min(puff(x, y, z), crown(x, y, z));
  const tp = [-st * (Ry + hh * 0.05) - hw * 0.02, cy + ct * (Ry + hh * 0.05), -hh * 0.03];
  const a = H.W([tp[0] + st * 0.01, tp[1] - 0.012, tp[2]]), c2 = H.W([tp[0] - st * hh * 0.04, tp[1] + hh * 0.045, tp[2]]);
  const parts = [crownPart(f, 0, { lo: lowOf(crown) }), { f: (x, y, z) => capsHelper(x, y, z, a, c2, hh * 0.013), box: boxAroundHelper(c2, hh * 0.1), id: 3 }];
  const body = 'if (id > 2.5) col = uMain * 0.85; col *= 0.95 + 0.05 * noise2(vG.xy / 0.01);';
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body), { band: b.yF });
}
export function flat_cap(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const b = bandOf(H, 0.15, 0.0);
  const crown = crownHelper(H, { ...b, gB: 0.007 * T, gT: 0.014 * T });
  const topY = H.top + 0.014 * T;
  // the top: a flattened pad sloping forward over the bill
  const pad = (x, y, z) => ellD(x, y - (topY - hh * 0.1) + (z - crown.zF) * 0.22, z - hh * 0.05, hw * 0.58, hh * 0.09, hh * 0.52);
  const f = (x, y, z) => sminK(crown(x, y, z), pad(x, y, z), 0.012 * T);
  const parts = [crownPart(f, 0, { lo: lowOf(crown) }), { kind: 'bill', y: b.yF + 0.001, z: crown.zF - 0.006 * T, len: hh * 0.2, w: hw * 0.46, tilt: 0.25, curve: hh * 0.03, t: 0.006 * T, id: 1 }];
  const body = 'if (id > 0.5) col = col * 0.92; col = mix(col, col * 0.8, line(ang, 0.0, 0.015) * step(0.0, vG.y));';
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body), { band: b.yF });
}
export function sailor_cap(ctx, it) {
  // a round flat sailor cap (a tam on a band) with two ribbon tails at the back
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const b = bandOf(H, 0.22, 0.05);
  const crown = crownHelper(H, { ...b, gB: 0.008 * T, gT: 0.016 * T });
  const bh = hh * 0.12;
  const tc = [0, b.yF + bh + hh * 0.06, -hh * 0.05];
  const top = (x, y, z) => ellD(x - tc[0], y - tc[1], z - tc[2], hw * 0.66, hh * 0.1, H.hd * 0.66);
  const f = (x, y, z) => Math.min(Math.max(crown(x, y, z), y - crown.band(z) - bh), sminK(top(x, y, z), crown(x, y, z) - 0.01, 0.02 * T));
  const parts = [crownPart(f, 0, { lo: lowOf(crown) }), bandPart(crown, crown, 0, bh, 0.003 * T, 2)];
  const m = new MeshHelper();
  for (const s of [1, -1]) {
    const y0 = b.yB + bh * 0.4, z0 = crown.zB - 0.005 * T;
    const path = []; for (let i = 0; i <= 6; i++) { const t = i / 6; path.push(H.W([s * hw * (0.05 + 0.1 * t), y0 - hh * 0.42 * t, z0 - hh * 0.05 * t - hh * 0.04 * Math.sin(t * Math.PI)])); }
    m.sweep(path, { prof: 'flat', th: (t) => [hh * 0.04, 0.0016 * T], up: () => [0, 0, -1], seg: 8, g: (t, a, S, i) => headGco(H)(path[i], 5) });
  }
  parts.push({ kind: 'mesh', mesh: m });
  const body = `if (id > 1.5 && id < 2.5) col = uSecond; if (id > 4.5 && id < 5.5) col = uSecond;
    if (id < 0.5) col = mix(col, uSecond, line(vG.z, ${f3(hw * 0.62)}, 0.004) * step(uP[0].x + ${f3(bh + 0.02 * T)}, vG.y));
    if (id > 1.5 && id < 2.5) col = mix(col, uAccent, line(vG.y, uP[0].x + ${f3(bh * 0.5)}, 0.002));`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body), { band: b.yF });
}
export function peaked_cap(ctx, it) {
  // captain / police: a band, a flat round top wider than the head, a shiny bill, a badge
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const b = bandOf(H, 0.19, 0.03);
  const crown = crownHelper(H, { ...b, gB: 0.008 * T, gT: 0.016 * T });
  const bh = hh * 0.13, zc = (crown.zF + crown.zB) / 2, topY = b.yF + bh + hh * 0.17;
  const topF = (x, y, z) => {
    const yt = topY + (z - zc) * 0.1, y0 = crown.band(z) + bh;
    const t = clamp((y - y0) / Math.max(yt - y0, 0.01));
    const rx = hw * (0.55 + 0.14 * Math.sqrt(t)), rz = H.hd * (0.6 + 0.17 * Math.sqrt(t));
    const q = Math.sqrt((x / rx) ** 2 + ((z - zc - 0.01 * t) / rz) ** 2);
    return Math.max((q - 1) * Math.min(rx, rz), y - yt) * 0.85;
  };
  const f = (x, y, z) => Math.min(Math.max(crown(x, y, z), y - crown.band(z) - bh - 0.01), topF(x, y, z));
  const parts = [crownPart(f, 0, { lo: lowOf(crown), c: [0, H.top * 0.4, 0] }), bandPart(crown, crown, 0, bh, 0.003 * T, 2),
    { kind: 'bill', y: b.yF + 0.001, z: crown.zF - 0.006 * T, len: hh * 0.22, w: hw * 0.44, tilt: 0.45, curve: hh * 0.02, t: 0.006 * T, id: 1 }];
  const starE = has(it, 'star_emblem');
  const body = `if (id > 0.5 && id < 1.5) col = vec3(0.1, 0.1, 0.12); if (id > 1.5 && id < 2.5) col = mix(uMain, vec3(0.08), 0.6);
    if (id > 1.5 && id < 2.5) col = mix(col, uAccent, line(vG.y, uP[0].x + ${f3(bh * 0.9)}, 0.0025) + line(vG.y, uP[0].x + 0.004, 0.0025));
    { vec2 q = vec2(vG.x, vG.y - uP[0].x - ${f3(bh * 1.25)}); float m = step(abs(ang), 0.8);
      ${starE ? `col = mix(col, uAccent, ${starGLSL('q', 'vec2(0.0)', f3(hh * 0.075))} * m); col = mix(col, uSecond, ${starGLSL('q', 'vec2(0.0)', f3(hh * 0.035))} * m);` : `col = mix(col, uAccent, clamp(ring(q, vec2(0.0), ${f3(hh * 0.05)}, ${f3(hh * 0.015)}) + circle(q, vec2(0.0), ${f3(hh * 0.02)}) + box2(q, vec2(0.0, ${f3(-hh * 0.075)}), vec2(${f3(hh * 0.1)}, ${f3(hh * 0.009)}), 0.002), 0.0, 1.0) * m);`} }`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
export function hard_hat(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const b = bandOf(H, 0.2, 0.02);
  const crown = crownHelper(H, { ...b, gB: 0.016 * T, gT: 0.03 * T, sy: 1.06 });
  const ridge = (x, y, z) => Math.max(Math.abs(x) - hh * 0.04, crown(x, y, z) - 0.008 * T);
  const parts = [crownPart((x, y, z) => Math.min(crown(x, y, z), ridge(x, y, z)), 0, { lo: lowOf(crown) }),
    { kind: 'brim', yF: b.yF, yB: b.yB, zF: crown.zF, zB: crown.zB, rx: hw * 0.62, rzF: H.hd * 0.86, rzB: H.hd * 0.66, zc: (crown.zF + crown.zB) / 2, t: 0.007 * T, droop: (q) => -Math.max(q - 0.75, 0) * hh * 0.15, inner: 0.6, id: 1 }];
  const body = `${has(it, 'reflective_tape') ? `if (id < 0.5) col = mix(col, uAccent, band(vG.y, uP[0].x + ${f3(hh * 0.12)}, uP[0].x + ${f3(hh * 0.17)}) * step(0.03, abs(vG.x)));` : ''}
    col = mix(col, col * 0.85, step(abs(vG.x), ${f3(hh * 0.045)}) * step(uP[0].x + 0.04, vG.y) * 0.5);`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
export function sport_helmet(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const b = bandOf(H, 0.22, -0.1);
  const crown = crownHelper(H, { ...b, gB: 0.016 * T, gT: 0.028 * T, sy: 1.04 });
  const topY = crownTop(H, crown, 0.028 * T, 1.04);
  const tail = (x, y, z) => ellD(x, y - topY * 0.3, z - crown.zB * 0.75, hw * 0.4, hh * 0.18, hh * 0.24);
  const parts = [crownPart((x, y, z) => sminK(crown(x, y, z), tail(x, y, z), 0.03 * T), 0, { lo: lowOf(crown), rim: 0.008 * T })];
  if (has(it, 'chinstrap')) parts.push(chinstrapPart(ctx, H, b, 7, { from: H.ear[1] + hh * 0.06, fwd: 0.02 }));
  const body = `col = mix(col, uSecond, band(vG.x, -0.012, 0.012) * step(uP[0].x + 0.03, vG.y));
    col = mix(col, uAccent, (line(vG.x, -0.017, 0.004) + line(vG.x, 0.017, 0.004)) * step(uP[0].x + 0.03, vG.y));
    ${has(it, 'vents') ? `for (int i = 0; i < 3; i++) { float a0 = 0.45 + float(i) * 0.42; col = mix(col, vec3(0.1), box2(vec2(abs(ang) * 0.1, vG.y), vec2(a0 * 0.1, uP[0].x + ${f3(hh * 0.32)}), vec2(0.012, ${f3(hh * 0.09)}), 0.005)); }` : ''}
    ${has(it, 'reflective_dots') ? `col = mix(col, vec3(0.95), circle(vec2(abs(ang) * 0.1, vG.y), vec2(0.27, uP[0].x + ${f3(hh * 0.1)}), 0.006));` : ''}
    col = mix(col, vec3(0.18), step(vG.y, uP[0].x + 0.012) * step(0.0, 1.0) * 0.8);
    if (id > 6.5) col = vec3(0.16);`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
export function visor(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const b = bandOf(H, 0.14, 0.06);
  const crown = crownHelper(H, { ...b, gB: 0.01 * T, gT: 0.016 * T });
  const bh = hh * 0.1;
  const parts = [bandPart(crown, crown, 0, bh, 0, 0), { kind: 'bill', y: b.yF + 0.002, z: crown.zF - 0.008 * T, len: hh * 0.4, w: hw * 0.47, tilt: 0.16, curve: hh * 0.06, t: 0.0065 * T, id: 1 }];
  parts[0].rim = 0.004 * T;
  const body = `if (id < 0.5) { col = uMain; col = mix(col, uSecond, band(vG.y, uP[0].x + 0.002, uP[0].x + 0.006)); col = mix(col, uAccent, circle(vec2(vG.x, vG.y), vec2(0.0, uP[0].x + ${f3(bh * 0.55)}), ${f3(bh * 0.3)})); }
    if (id > 0.5) col = mix(uMain, uSecond, 0.0);`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
export function headband(ctx, it) {
  // a sports headband over the forehead, or (a hair accessory / with a bow) an Alice band over the top
  const H = headHelper(ctx), hh = H.hh, T = hh / 0.28;
  if (it.item.slot === 'hair_acc' || has(it, 'bow')) return aliceBand(ctx, it, H);
  // over the hair: the band stands a hair's thickness off the skull
  const b = bandOf(H, 0.22, 0.08);
  const crown = crownHelper(H, { ...b, gB: 0.026 * T, gT: 0.026 * T });
  const bh = hh * 0.12;
  const parts = [{ ...bandPart(crown, crown, 0, bh, 0, 0), rim: 0.008 * T }];
  const body = `${KNIT('vG.x', 'vG.y', 0.005)}
    col = mix(col, uSecond, band(vG.y, uP[0].x + 0.003, uP[0].x + 0.007) + band(vG.y, uP[0].x + ${f3(bh - 0.007)}, uP[0].x + ${f3(bh - 0.003)}));
    ${has(it, 'embroidery_small') ? `col = mix(col, uAccent, ${starGLSL('vG.xy', `vec2(0.0, uP[0].x + ${f3(bh / 2)})`, f3(bh * 0.32))});` : ''}`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
// an Alice band: a hoop over the top of the head (on the hair) from ear to ear, a bow on one side
function aliceBand(ctx, it, H) {
  const hh = H.hh, hw = H.hw, T = hh / 0.28, lift = hairLift(H) * 1.2, w = hh * 0.05, r = 0.0035 * T;
  const pts = hoopHelper(H, lift, 0.1, 0.22, 24);
  const m = new MeshHelper().sweep(pts, { th: () => [w, r], up: (i, p) => nrm(subV(p, H.O)), prof: 'flat', seg: 10, g: (t) => [t, 0, 0, 0] });
  const out = [{ piece: pieceHelper(ctx, m, { bone: 'Head' }), glsl: 'vec3 col = uMain; col *= 0.94 + 0.06 * stripes(vG.x, 0.04, 0.02); return col;', noPattern: true }];
  if (has(it, 'bow')) {
    const p = pts[17], ax = frameHelper(nrm(subV(p, H.O)), [0, 0, 1]), s = hw * 0.32;
    const bow = sdfHelper(ctx, [{ f: bowHelper(addV(p, ax[2], 0.006 * T), ax, s, { tails: 0 }), box: boxAroundHelper(p, s * 0.8), id: 5 }], { cell: Math.max(0.0012, s / 32), verts: 1800, bone: 'Head' });
    if (bow) out.push({ piece: bow, glsl: 'return uSecond;', noPattern: true, colors: { second: it.colors.second === it.colors.main ? it.colors.accent : it.colors.second } });
  }
  return out;
}
// how far the hair may stand off the skull on top (the hair layer; accessories worn on the hair sit on it)
export const hairLift = (H) => H.hh * 0.1;
// a hoop over the head from ear to ear (local tilt: back lean (rad), fwd: shift of the plane towards the face (x hh))
export function hoopHelper(H, lift, tilt = -0.3, fwd = 0.1, n = 24, span = 1.42) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = -span + (2 * span * i) / n, dir = nrm([Math.sin(a), Math.cos(a), Math.cos(a) * Math.tan(tilt) + fwd]);
    pts.push(H.W(addV([0, 0, 0], dir, H.dirR(dir) + lift * (0.55 + 0.45 * Math.cos(a)))));
  }
  return pts;
}
export function headband_tied(ctx, it) {
  // a hachimaki: a band round the forehead, knotted at the back with two tails
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const b = bandOf(H, 0.2, 0.1);
  const crown = crownHelper(H, { ...b, gB: 0.026 * T, gT: 0.026 * T });
  const bh = hh * 0.1;
  const parts = [{ ...bandPart(crown, crown, 0, bh, 0, 0), rim: 0.006 * T }];
  const ky = b.yB + bh * 0.5, kz = crown.zB - 0.01 * T, kc = H.W([0, ky, kz]);
  parts.push({ f: (x, y, z) => ellD(x - kc[0], y - kc[1], z - kc[2], hh * 0.05, hh * 0.045, hh * 0.035), box: boxAroundHelper(kc, hh * 0.08), id: 5 });
  const m = new MeshHelper();
  for (const s of [1, -1]) {
    const path = []; for (let i = 0; i <= 6; i++) { const t = i / 6; path.push(H.W([s * hh * (0.03 + 0.14 * t), ky - hh * 0.36 * t, kz - 0.004 - hh * 0.08 * t])); }
    m.sweep(path, { prof: 'flat', th: () => [bh * 0.42, 0.0016 * T], up: () => [0, 0, -1], seg: 8, g: (t, a, S, i) => headGco(H)(path[i], 6) });
  }
  parts.push({ kind: 'mesh', mesh: m });
  const body = `col *= 0.95 + 0.05 * stripes(vG.y, 0.006, 0.003);
    if (id < 0.5) { col = mix(col, uSecond, circle(vec2(vG.x, vG.y), vec2(0.0, uP[0].x + ${f3(bh / 2)}), ${f3(bh * 0.34)})); col = mix(col, uMain, circle(vec2(vG.x, vG.y), vec2(0.0, uP[0].x + ${f3(bh / 2)}), ${f3(bh * 0.17)})); }`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
export function toque(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const b = bandOf(H, 0.2, 0.06);
  const crown = crownHelper(H, { ...b, gB: 0.01 * T, gT: 0.02 * T });
  const bh = hh * 0.16, zc = (crown.zF + crown.zB) / 2;
  const yT = b.yF + bh + hh * 0.6, R = hw * 0.64;
  const puff = (x, y, z) => {
    const a = Math.atan2(x, z - zc), pl = 1 + 0.035 * Math.cos(a * 16);
    const t = clamp((y - b.yF - bh * 0.5) / (yT - b.yF));
    const r = R * pl * (0.84 + 0.24 * Math.sin(t * 2.6)), k = hh * 0.12;
    const ds = Math.hypot(x, z - zc) - r, dt = y - yT;
    return (Math.hypot(Math.max(ds + k, 0), Math.max(dt + k, 0)) + Math.min(Math.max(ds + k, dt + k), 0) - k) * 0.85;
  };
  const f = (x, y, z) => Math.min(Math.max(crown(x, y, z) - 0.003, y - crown.band(z) - bh), Math.max(puff(x, y, z), crown.band(z) + bh * 0.4 - y));
  const parts = [crownPart(f, 0, { lo: lowOf(crown), c: [0, b.yF + bh + hh * 0.15, zc] }), bandPart(crown, crown, 0, bh, 0.004 * T, 2)];
  const body = 'if (id > 1.5) col = uMain * 0.98; if (id < 0.5) col *= 0.9 + 0.1 * (0.5 + 0.5 * cos(ang * 16.0));';
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
export function baker_cap(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const b = bandOf(H, 0.2, 0.03);
  const crown = crownHelper(H, { ...b, gB: 0.008 * T, gT: 0.016 * T });
  const bh = hh * 0.11, zc = (crown.zF + crown.zB) / 2, tc = [0, H.top * 0.62, zc - hh * 0.04];
  const puff = (x, y, z) => ellD(x - tc[0], y - tc[1], z - tc[2], hw * 0.62, hh * 0.24, H.hd * 0.64);
  const f = (x, y, z) => Math.min(Math.max(crown(x, y, z) - 0.002, y - crown.band(z) - bh), sminK(puff(x, y, z), crown(x, y, z), 0.02 * T));
  const parts = [crownPart(f, 0, { lo: lowOf(crown) }), bandPart(crown, crown, 0, bh, 0.004 * T, 2)];
  const body = 'if (id > 1.5) { col = uMain * 0.97; col = mix(col, uAccent, line(vG.y, uP[0].x + 0.005, 0.003)); } col *= 0.95 + 0.05 * noise2(vG.xy / 0.01);';
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
export function nurse_cap(ctx, it) {
  // a small folded cap perched on the top front of the head (on the hair), a band, our heart-in-leaf mark
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const dir = nrm([0, 1, 0.75]), base = H.W(addV([0, 0, 0], dir, H.dirR(dir) + 0.012 * T));
  const ax = frameHelper([0, 0.45, 1], [0, 1, 0]), w = hw * 0.36, h = hh * 0.13;
  const m = new MeshHelper(), g = (l) => [l[0], l[1], l[2], 0];
  // the front: a trapezoid standing up; the folded back: a lower band behind it
  const front = [[-w, -h], [w, -h], [w * 0.82, h], [-w * 0.82, h]];
  m.slab(addV(base, ax[1], h * 0.2), ax, front, 0.004 * T, { g });
  m.slab(addV(addV(base, ax[2], -hh * 0.07), ax[1], h * 0.3), ax, [[-w * 0.95, -h * 0.6], [w * 0.95, -h * 0.6], [w * 0.9, h * 0.6], [-w * 0.9, h * 0.6]], 0.004 * T, { g: (l) => [l[0], l[1] - 0.05, l[2], 1] });
  const piece = pieceHelper(ctx, m, { bone: 'Head', double: true });
  return [{ piece, noPattern: true, glsl: `vec3 col = uMain; vec2 q = vG.xy; float id = floor(vG.w + 0.5);
    col = mix(col, uSecond, step(${f3(-h * 0.62)}, -q.y) * step(id, 0.5));
    col = mix(col, uSecond, step(0.5, id) * 0.4);
    float fr = step(id, 0.5) * step(0.0, vG.z);
    col = mix(col, uAccent, heart(q, vec2(0.0, ${f3(h * 0.05)}), ${f3(hh * 0.045)}) * fr);
    col = mix(col, vec3(0.32, 0.62, 0.32), (circle(q, vec2(${f3(hh * 0.05)}, ${f3(-h * 0.25)}), ${f3(hh * 0.018)}) + circle(q, vec2(${f3(-hh * 0.05)}, ${f3(-h * 0.25)}), ${f3(hh * 0.018)})) * fr);
    return col;` }];
}
export function headdress(ctx, it) {
  // a maid's frilled headpiece: a ruffled band over the top of the head with a ribbon
  const H = headHelper(ctx), hh = H.hh, T = hh / 0.28;
  const pts = hoopHelper(H, 0.03 * T, 0.45, 0.25, 32, 1.3);
  const m = new MeshHelper();
  m.sweep(pts, { th: (t) => [hh * 0.095, 0.0025 * T], up: (i, p) => nrm(addV(nrm(subV(p, H.O)), [0, 0, 1], 0.9 + 0.3 * Math.sin(i * 2.2))), prof: 'flat', seg: 10, g: (t, a) => [t, Math.sin(a), 0, 0] });
  const out = [{ piece: pieceHelper(ctx, m, { bone: 'Head', double: true }), noPattern: true, glsl: 'vec3 col = uMain; col *= 0.9 + 0.1 * sin(vG.x * 190.0); col = mix(col, uSecond, step(0.75, abs(vG.y)) * 0.5); return col;' }];
  if (has(it, 'band_ribbon')) {
    const pts2 = pts.map((p) => addV(p, nrm(subV(p, H.O)), -0.002));
    const m2 = new MeshHelper().sweep(pts2, { th: () => [hh * 0.022, 0.003 * T], up: (i, p) => nrm(subV(p, H.O)), prof: 'flat', seg: 8 });
    out.push({ piece: pieceHelper(ctx, m2, { bone: 'Head' }), noPattern: true, glsl: 'return uAccent;' });
  }
  return out;
}
export function bonnet(ctx, it) {
  // a toddler's sun bonnet: a soft hood over the top and back, a ruffled brim framing the face, ties under the chin
  const H = headHelper(ctx), hh = H.hh, T = hh / 0.28;
  const zcut = H.faceZ - hh * 0.2, yB = H.eye - hh * 0.25;
  const open = (x, y, z) => z - zcut - (y - H.eye) * 0.3;    // > 0: the face opening
  const hood = (x, y, z) => H.f(x, y * 0.98, z) - (0.016 + 0.008 * clamp((y - yB) / hh)) * T;
  const lo = (x, y, z) => Math.max(open(x, y, z), yB - y - Math.max(z, 0) * 0.6);
  const parts = [{ kind: 'radial', fl: hood, lo, rim: 0.004 * T, id: 0, nv: 30 }];
  // the brim: a wide ruffle round the opening, leaning forward
  const pts = [];
  for (let i = 0; i <= 30; i++) {
    const a = -1.75 + 3.5 * i / 30, d = nrm([Math.sin(a), Math.cos(a), 0.0]);
    // walk along d from the centre in the opening's plane until the hood
    let p = null;
    for (let k = 0; k < 60; k++) { const t = 0.05 + k * 0.004; const l = [d[0] * t, d[1] * t, zcut + (d[1] * t + 0 - H.eye) * 0.3]; if (hood(...l) > 0) { p = l; break; } }
    if (p) pts.push(H.W(p));
  }
  const m = new MeshHelper();
  m.sweep(pts, { prof: 'flat', th: (t) => [hh * (0.07 + 0.05 * Math.sin(t * Math.PI)), 0.0025 * T], up: (i, p) => nrm(addV(subV(p, H.W([0, H.eye, zcut])), [0, 0, 1], 1.2)), seg: 8, g: (t, a, S, i) => headGco(H)(pts[i], 1) });
  parts.push({ kind: 'mesh', mesh: m });
  if (has(it, 'chinstrap')) parts.push(chinstrapPart(ctx, H, { yF: H.eye, yB: H.eye }, 7, { from: H.ear[1] - hh * 0.12, fwd: 0.12 }));
  const body = `if (id > 0.5 && id < 1.5) { col = uSecond; col *= 0.9 + 0.1 * (0.5 + 0.5 * cos(vG.x * 600.0)); }
    if (id < 0.5) col = mix(col, uSecond, dotsHex(vG.xy, 0.02, 0.003) * 0.7);
    if (id > 6.5) col = uSecond;`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: H.eye + hh * 0.3 });
}
export function plush_hat(ctx, it) {
  // the creature hat: a big round plush head over the head, a face on the front, round ears and a leaf sprig
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, T = hh / 0.28;
  const b = bandOf(H, 0.22, -0.06);
  const crown = crownHelper(H, { ...b, gB: 0.012 * T, gT: 0.03 * T });
  const R = hw * 0.64, c = [0, H.top * 0.35, -hh * 0.03];
  const ball = (x, y, z) => ellD(x - c[0], y - c[1], z - c[2], R, hh * 0.5, H.hd * 0.62);
  const topY = c[1] + hh * 0.5;
  const parts = [crownPart((x, y, z) => sminK(ball(x, y, z), crown(x, y, z), 0.02 * T), 0, { lo: lowOf(crown), rim: 0.008 * T })];
  earParts(H, parts, topY, 5, true);
  const body = `col *= 0.96 + 0.04 * noise2(vG.xy / 0.004);
    vec2 q = vec2(vG.x, vG.y - uP[0].x - ${f3(hh * 0.2)});
    float fr = step(abs(ang), 1.2) * step(id, 0.5);
    col = mix(col, vec3(0.12), circle(vec2(abs(q.x), q.y), vec2(${f3(hh * 0.12)}, 0.0), ${f3(hh * 0.045)}) * fr);
    col = mix(col, vec3(1.0), circle(vec2(abs(q.x), q.y), vec2(${f3(hh * 0.11)}, ${f3(hh * 0.016)}), ${f3(hh * 0.014)}) * fr);
    col = mix(col, uAccent, line(length(q - vec2(0.0, ${f3(hh * 0.02)})), ${f3(hh * 0.05)}, 0.004) * step(q.y, ${f3(-hh * 0.01)}) * fr);
    col = mix(col, vec3(0.95, 0.55, 0.55), circle(vec2(abs(q.x), q.y), vec2(${f3(hh * 0.2)}, ${f3(-hh * 0.06)}), ${f3(hh * 0.035)}) * fr * 0.6);
    if (id > 4.5 && id < 5.5) col = uMain;
    if (id > 5.5) col = uSecond;`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
