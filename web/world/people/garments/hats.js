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
import { solid, jointPos, fy } from '../wear.js';
import { field, smin2 as sminK, smax2 as smaxK } from '../sdf.js';
import { normals, smoothNormals } from '../mesh.js';
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
  const zF = H.zF(o.yF), zB = H.zB(o.yB), slope = (o.yF - o.yB) / (zF - zB), nrmK = 1 / Math.sqrt(1 + slope * slope);
  const sy = o.sy ?? 1, gB = o.gB ?? 0.008, gT = o.gT ?? 0.018, top = H.top, ct = Math.cos(o.tilt || 0), stt = Math.sin(o.tilt || 0);
  const band = (z) => o.yB + (z - zB) * slope;
  const fn = (x, y, z) => {
    if (o.tilt) { const X = x * ct + y * stt, Y = -x * stt + y * ct; x = X; y = Y; }
    const yb = band(z), up = y - yb;
    const yy = up > 0 ? yb + up / sy : y;
    const g = gB + (gT - gB) * sst(0, Math.max(top - yb, 0.02), up / sy);
    let d = H.f(x, yy, z) * Math.min(1, sy) - g;
    if (o.flat !== undefined) d = smaxK(d, y - o.flat, o.flatR ?? 0.01);
    return Math.max(d, -up * nrmK - (o.under ?? 0));
  };
  fn.band = band; fn.zF = zF; fn.zB = zB; fn.slope = slope;
  return fn;
}
// the top of a crown (local height) for its gap and stretch
export const crownTop = (H, crown, gT, sy = 1) => { const yb = crown.band(0); return yb + (H.top + gT - yb) * sy; };
// a brim round the band: o { yF, yB, zF, zB (the band plane, from a crown), rx, rzF, rzB (outer half sizes), zc,
// t (thickness), droop(q, c, s) -> dy (q 0 centre .. 1 outer edge, c / s cos / sin of the angle from the front), rim }
export function brimHelper(H, o) {
  const slope = (o.yF - o.yB) / (o.zF - o.zB), zc = o.zc ?? 0, t = o.t ?? 0.006, K = o.k ?? 1.6, rim = o.rim || 0;
  return (x, y, z) => {
    const zz = z - zc, rz = zz > 0 ? o.rzF : o.rzB, q = Math.sqrt((x / o.rx) ** 2 + (zz / rz) ** 2), l = Math.hypot(x, zz) || 1e-6;
    const ys = o.yB + (z - o.zB) * slope + (o.droop ? o.droop(q, zz / l, x / l) : 0);
    const m = Math.min(o.rx, rz);
    let d = Math.max((Math.abs(y - ys) - t / 2) / K, (q - 1) * m);
    if (o.inner) d = Math.max(d, (o.inner - q) * m);
    if (rim) d = Math.min(d, Math.hypot((q - 1 + rim / m) * m, y - ys) - rim);
    return d;
  };
}
// a cap's bill: o { y (root height at the front), z (root: the forehead), len (out past the root), w (half width),
// tilt (rad down), curve (how far the sides bend down, m), t }
export function billHelper(H, o) {
  const back = H.hh * 0.12, zc = o.z - back, bl = o.len + back, tn = Math.tan(o.tilt || 0), t = o.t ?? 0.006;
  return (x, y, z) => {
    const ys = o.y - tn * Math.max(z - o.z, 0) - (o.curve || 0) * (x / o.w) ** 2 + (o.lift || 0) * Math.max(z - o.z, 0) ** 2;
    const q = Math.sqrt((x / o.w) ** 2 + ((z - zc) / bl) ** 2);
    return Math.max((Math.abs(y - ys) - t / 2) / 1.5, (q - 1) * Math.min(o.w, bl), zc + back * 0.3 - z);
  };
}
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
export function flowerHelper(c, n, r, o = {}) {
  const ax = frameHelper(n, o.up || [0, 1, 0]), N = o.petals ?? 5, rose = !!o.rose;
  return (X, Y, Z) => {
    const [x, y, z] = toFrameHelper(c, ax, [X, Y, Z]);
    const a = Math.atan2(y, x), rr = Math.hypot(x, y);
    let d;
    if (rose) {
      // a cupped bloom with a spiral of petal edges
      const cup = ellD(x, y, z, r, r, r * 0.6);
      const dent = Math.max(Math.hypot(x, y) - r * 0.82, -(z - r * 0.38));
      const sp = Math.sin(a * 2 + rr / r * 9) * r * 0.05;
      d = Math.max(cup + sp * 0.5, -dent * 0.8);
      d = Math.min(d, ellD(x, y, z - r * 0.25, r * 0.38, r * 0.38, r * 0.4));
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
  const n = parts.length;
  const F = (x, y, z) => {
    let d = parts[0].f(x, y, z);
    for (let i = 1; i < n; i++) { const v = parts[i].f(x, y, z); d = parts[i].k ? sminK(d, v, parts[i].k) : Math.min(d, v); }
    return d;
  };
  let box = [parts[0].box[0].slice(), parts[0].box[1].slice()];
  for (const p of parts) for (let i = 0; i < 3; i++) { box[0][i] = Math.min(box[0][i], p.box[0][i]); box[1][i] = Math.max(box[1][i], p.box[1][i]); }
  const piece = solid(ctx, field(F, box), { cell: o.cell || 0.003, verts: o.verts || 3000, bone: o.bone, weights: o.weights, hide: o.hide, double: o.double, smooth: o.smooth ?? 1, nsmooth: o.nsmooth });
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
    const n = path.length, closed = !!o.closed, seg = o.seg || (o.prof === 'flat' ? 8 : 8), base = this.n;
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
    return this;
  }
  // a lathe round an axis: prof [[r, h], ...] (h along the axis), at c with frame ax (y = axis)
  lathe(c, ax, prof, o = {}) {
    const seg = o.seg || 24, base = this.n;
    for (const [r, h] of prof) for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, l = [Math.cos(a) * r, h, Math.sin(a) * r];
      this.vert(inFrameHelper(c, ax, l), o.g ? o.g(l, r, h, a) : [l[0], l[2], h, o.id ?? 0]);
    }
    for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < seg; j++) {
      const a = base + i * seg + j, b = base + i * seg + (j + 1) % seg, cc = base + (i + 1) * seg + j, d = base + (i + 1) * seg + (j + 1) % seg;
      this.tri(a, cc, b); this.tri(b, cc, d);
    }
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
// shading-friendly variation for cloth (soft weave noise) and knit ribs
export const KNIT = (u, v, s = 0.006) => `col *= 0.93 + 0.07 * stripes(${u}, ${f3(s)}, ${f3(s * 0.5)});`;

// ---------- hats ----------
// the head frame's paint coordinates for a solid's vertex
function headGco(H) {
  const R = H.hw * 0.5;
  return (p, id) => { const x = p[0] - H.O[0], y = p[1] - H.O[1], z = p[2] - H.O[2]; return [Math.atan2(x, z) * R, y, Math.hypot(x, z), id]; };
}
const box3 = (H, hx, ylo, yhi, zlo, zhi) => [[H.O[0] - hx, H.O[1] + ylo, H.O[2] + zlo], [H.O[0] + hx, H.O[1] + yhi, H.O[2] + zhi]];
// a part in the head frame: local field -> world field
const loc = (H, fn) => { const O = H.O; return (x, y, z) => fn(x - O[0], y - O[1], z - O[2]); };
const det = (it) => it.params.details || [];
const has = (it, d) => det(it).includes(d);

// the solid hat -> a piece with its paint; uP[0] = (band, top) local heights
export function hatPieceHelper(ctx, it, H, parts, glsl, o = {}) {
  const piece = sdfHelper(ctx, parts, { cell: o.cell ?? Math.max(0.0025, H.hh * 0.0095), verts: o.verts || 4200, bone: 'Head', gco: headGco(H), double: o.double });
  if (!piece) return [];
  return [{ piece, glsl, noPattern: true, uP: [[o.band ?? H.eye + H.hh * 0.12, H.top + 0.02, H.hw, H.hh], o.uP1 || [0, 0, 0, 0], o.uP2 || [0, 0, 0, 0], o.uP3 || [0, 0, 0, 0]] }];
}
// common paint: a body for paintItem() with the pattern on the crown (part 0) and per-part colours
function hatGLSL(it, body, o = {}) {
  const pat = o.pattern === false ? '' : patternGLSL(it.pattern || { type: 'solid' });
  return `vec2 P = vG.xy; float id = floor(vG.w + 0.5); vec3 col = uMain;
    if (id < 0.5) { ${pat} }
    ${body}
    return col;`;
}
// band heights for a hat that sits at the brow (front) and over the ears / the nape (back)
const bandOf = (H, front, back) => ({ yF: H.eye + H.hh * front, yB: H.eye + H.hh * back });

// a cap: fitted crown (a little taller than the skull), a curved bill, a top button; o: { crown (height x), bill len (x hh), low, tilt }
function capHelper(ctx, it, o = {}) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, o.front ?? 0.15, o.back ?? 0.0);
  const crown = crownHelper(H, { ...b, gB: o.gB ?? 0.005, gT: o.gT ?? 0.016, sy: o.sy ?? 1.08, flat: o.flat });
  const zF = crown.zF, topY = crownTop(H, crown, o.gT ?? 0.016, o.sy ?? 1.08);
  const parts = [{ f: loc(H, crown), box: box3(H, hw * 0.62, b.yB - 0.03, topY + 0.03, crown.zB - 0.04, zF + 0.04), id: 0 }];
  if (o.bill !== false) {
    const len = hh * (o.len ?? 0.36), w = hw * (o.billW ?? 0.44);
    const bill = billHelper(H, { y: b.yF + 0.002, z: zF - 0.004, len, w, tilt: o.billTilt ?? 0.12, curve: hh * (o.curve ?? 0.05), t: o.t ?? Math.max(0.006, hh * 0.022), lift: o.lift || 0 });
    parts.push({ f: loc(H, bill), box: box3(H, w + 0.01, b.yF - hh * 0.25, b.yF + 0.03, zF - hh * 0.2, zF + len + 0.02), id: 1 });
  }
  if (o.button !== false) { const c = [0, topY - 0.002, 0]; parts.push({ f: loc(H, (x, y, z) => ellD(x - c[0], y - c[1], z - c[2], hh * 0.035, hh * 0.018, hh * 0.035)), box: box3(H, 0.03, topY - 0.03, topY + 0.03, -0.03, 0.03), id: 3 }); }
  return { H, parts, b, crown, topY };
}
// panels, seams, eyelets and the bill's stitching (paint snippet for caps)
const CAP_PAINT = (o = {}) => `
    float ang = vG.x / (uP[0].z * 0.5);   // angle round the head (0 front)
    float up = vG.y - uP[0].x;
    if (id < 0.5) {
      ${o.panels ? `col = mix(col, uSecond, step(abs(ang), 0.95) * step(0.0, 1.0));` : ''}
      ${o.mesh ? `float bk = step(1.0, abs(ang)); col = mix(col, uSecond, bk); col = mix(col, col * 0.55, bk * dotsHex(vec2(vG.x, vG.y), 0.006, 0.0018));` : ''}
      float seam = 0.0; for (int i = 0; i < 6; i++) { float a0 = -2.618 + float(i) * 1.0472; seam = max(seam, line(ang, a0 + 0.5236, 0.02)); }
      seam = max(seam, line(ang, 0.0, 0.02));
      col = mix(col, col * 0.7, seam * step(0.004, up) * (1.0 - step(uP[0].y - 0.012, vG.y)));
      col = mix(col, col * 0.75, line(vG.y, uP[0].x + 0.006, 0.0025) * step(1.6, abs(ang)) * 0.0);
      for (int i = 0; i < 6; i++) { float a0 = -2.618 + float(i) * 1.0472 + 0.0; col = mix(col, col * 0.45, circle(vec2(ang * 0.06, vG.y), vec2(a0 * 0.06, uP[0].y - 0.04), 0.0028)); }
    }
    if (id > 0.5 && id < 1.5) {
      col = ${o.bill || 'uMain'};
      float rr = vG.z;
    }
    if (id > 2.5 && id < 3.5) col = ${o.button || 'uMain'};`;

export function cap_baseball(ctx, it) {
  const c = capHelper(ctx, it, { sy: 1.12 });
  const pt = it.pattern || {};
  const panels = pt.type === 'colour_block' && pt.layout === 'panels';
  const logo = has(it, 'emblem_ball') || pt.type === 'colour_block';
  const swoosh = pt.type === 'print_motif';
  const body = CAP_PAINT({ panels, bill: panels ? 'uMain' : 'uMain' }) + `
    if (id < 0.5) {
      ${logo ? orbGLSL('vec2(vG.x, vG.y)', `vec2(0.0, uP[0].x + ${f3(c.H.hh * 0.16)})`, f3(c.H.hh * 0.1), 'step(abs(ang), 0.8)', 'uAccent', 'uTrim') : ''}
      ${swoosh ? `{ vec2 q = vec2(vG.x, vG.y - uP[0].x - ${f3(c.H.hh * 0.12)}); float s = aa(abs(q.y - 0.4 * q.x * q.x / ${f3(c.H.hh * 0.2)} + q.x * 0.25) - ${f3(c.H.hh * 0.03)} * (1.0 - abs(q.x) / ${f3(c.H.hh * 0.42)})) * step(abs(q.x), ${f3(c.H.hh * 0.4)}); col = mix(col, uAccent, s); }` : ''}
    }`;
  return hatPieceHelper(ctx, it, c.H, c.parts, hatGLSL(it, body, { pattern: !panels && !swoosh }), { band: c.b.yF });
}
export function cap_trucker(ctx, it) {
  const c = capHelper(ctx, it, { sy: 1.2, len: 0.38, curve: 0.04 });
  const body = CAP_PAINT({ mesh: true }) + `
    if (id < 0.5) col = mix(col, uAccent, box2(vec2(vG.x, vG.y), vec2(0.0, uP[0].x + ${f3(c.H.hh * 0.17)}), vec2(${f3(c.H.hh * 0.11)}, ${f3(c.H.hh * 0.07)}), 0.004) * step(abs(ang), 0.8));
    if (id < 0.5) col = mix(col, uTrim, boxLine(vec2(vG.x, vG.y), vec2(0.0, uP[0].x + ${f3(c.H.hh * 0.17)}), vec2(${f3(c.H.hh * 0.11)}, ${f3(c.H.hh * 0.07)}), 0.004, 0.0025) * step(abs(ang), 0.8));`;
  return hatPieceHelper(ctx, it, c.H, c.parts, hatGLSL(it, body, { pattern: false }), { band: c.b.yF });
}
export function cap_soft(ctx, it) {
  const c = capHelper(ctx, it, { sy: 0.98, len: 0.27, curve: 0.03, gT: 0.014, billTilt: 0.16, button: false });
  const body = CAP_PAINT({ bill: 'mix(uMain, vec3(0.0), 0.3)' });
  return hatPieceHelper(ctx, it, c.H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function cap_cycling(ctx, it) {
  const c = capHelper(ctx, it, { sy: 0.95, len: 0.2, curve: 0.01, gT: 0.01, gB: 0.004, billTilt: -0.35, button: false, front: 0.17 });
  const body = CAP_PAINT({}) + `if (id > 0.5 && id < 1.5) col = uSecond;
    if (id < 0.5) col = mix(col, uSecond, band(vG.y, uP[0].x + 0.012, uP[0].x + 0.022) + line(vG.x, 0.0, 0.008) * step(uP[0].x + 0.02, vG.y));
    if (id < 0.5) col = mix(col, uAccent, line(vG.x, 0.0, 0.003) * step(uP[0].x + 0.02, vG.y));`;
  return hatPieceHelper(ctx, it, c.H, c.parts, hatGLSL(it, body, { pattern: false }), { band: c.b.yF });
}
export function school_cap(ctx, it) {
  const c = capHelper(ctx, it, { sy: 1.15, len: 0.3, curve: 0.06, gT: 0.02, front: 0.17, back: -0.06 });
  addChinstrap(ctx, c.H, c.parts, c.b, 7);
  const body = CAP_PAINT({}) + `if (id > 6.5) col = uSecond;
    if (id < 0.5) col = mix(col, uAccent, circle(vec2(vG.x, vG.y), vec2(0.0, uP[0].x + ${f3(c.H.hh * 0.15)}), ${f3(c.H.hh * 0.06)}) * step(0.0, 1.0));
    if (id < 0.5) col = mix(col, uTrim, star(vec2(vG.x, vG.y), vec2(0.0, uP[0].x + ${f3(c.H.hh * 0.15)}), ${f3(c.H.hh * 0.045)}));
    if (id < 0.5) col = mix(col, vec3(0.92), band(vG.y, uP[0].x + 0.004, uP[0].x + 0.012) * 0.8);`;
  return hatPieceHelper(ctx, it, c.H, c.parts, hatGLSL(it, body, { pattern: false }), { band: c.b.yF });
}
// a chin strap from the band over each ear down under the chin (a thin field)
function addChinstrap(ctx, H, parts, b, id, o = {}) {
  const L = H.L, ctxf = ctx.f, hh = H.hh;
  const pts = [];
  const yTop = (o.from ?? b.yB + (b.yF - b.yB) * 0.6) + 0.004;
  const zE = H.ear[2] + hh * 0.07;
  for (const s of [1, -1]) {
    const seq = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, y = yTop + (H.chin + hh * 0.06 - yTop) * t, z = zE + (hh * 0.17 - zE) * Math.pow(t, 1.5);
      const w = H.W([0, y, z]);
      seq.push(surfHelper(ctx, w, [s, -0.15 * t, 0.15 * t], 0.004, 0.2));
    }
    pts.push(seq);
  }
  // under the chin
  const under = surfHelper(ctx, H.W([0, H.chin + hh * 0.02, hh * 0.12]), [0, -1, 0.15], 0.004, 0.12);
  const r = Math.max(0.002, hh * 0.008);
  const segs = [];
  for (const seq of pts) { for (let i = 0; i < seq.length - 1; i++) segs.push([seq[i], seq[i + 1]]); segs.push([seq[seq.length - 1], under]); }
  const f = (x, y, z) => { let d = Infinity; for (const [a, c] of segs) d = Math.min(d, capsHelper(x, y, z, a, c, r)); return d; };
  const all = segs.flat();
  const bx = [[Math.min(...all.map((p) => p[0])) - 0.01, Math.min(...all.map((p) => p[1])) - 0.01, Math.min(...all.map((p) => p[2])) - 0.01], [Math.max(...all.map((p) => p[0])) + 0.01, Math.max(...all.map((p) => p[1])) + 0.01, Math.max(...all.map((p) => p[2])) + 0.01]];
  parts.push({ f, box: bx, id });
  void L; void ctxf;
}

// full-brim hats ---------------------------------------------------------
// crown + brim: o { front, back (band), gB, gT, sy, flat, crownF (a replacement crown field, local), brim: { w (outer half width x hw),
// d (front-back, x hd), droop(q, c, s) }, rim }
function brimHat(ctx, it, o = {}) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, o.front ?? 0.2, o.back ?? 0.02);
  const crown = crownHelper(H, { ...b, gB: o.gB ?? 0.008, gT: o.gT ?? 0.02, sy: o.sy ?? 1.0, flat: o.flat, flatR: o.flatR });
  const parts = [];
  const cf = o.crownF ? o.crownF(H, b, crown) : crown;
  const top = o.top ?? crownTop(H, crown, o.gT ?? 0.02, o.sy ?? 1) + 0.02;
  parts.push({ f: loc(H, cf), box: box3(H, hw * 0.75, b.yB - 0.04, top + 0.03, crown.zB - 0.06, crown.zF + 0.06), id: 0 });
  if (o.brim) {
    const rx = hw * o.brim.w, rzF = (o.brim.dF ?? o.brim.w) * hw * 1.05, rzB = (o.brim.dB ?? o.brim.w) * hw;
    const fr = brimHelper(H, { yF: b.yF + (o.brim.lift ?? 0), yB: b.yB + (o.brim.lift ?? 0), zF: crown.zF, zB: crown.zB, rx, rzF, rzB, zc: (crown.zF + crown.zB) / 2, t: o.brim.t ?? Math.max(0.006, hh * 0.022), droop: o.brim.droop, rim: o.brim.rim, inner: 0.35 });
    const dmax = o.brim.dmax ?? hh * 0.3;
    parts.push({ f: loc(H, fr), box: box3(H, rx + 0.02, Math.min(b.yB, b.yF) - dmax - 0.03, Math.max(b.yF, b.yB) + 0.05 + (o.brim.up ?? 0), (crown.zF + crown.zB) / 2 - rzB - 0.02, (crown.zF + crown.zB) / 2 + rzF + 0.02), id: 1 });
  }
  if (o.band) {
    // a raised ribbon band just above the brim
    const bw = hh * (o.band.w ?? 0.09), bo = o.band.out ?? 0.003;
    const bf = (x, y, z) => { const yb = crown.band(z) + (o.band.at ?? 0.012); return Math.max(cf(x, y, z) - bo, Math.abs(y - yb - bw / 2) - bw / 2); };
    parts.push({ f: loc(H, bf), box: box3(H, hw * 0.75, b.yB - 0.03, Math.max(b.yF, b.yB) + bw + 0.04, crown.zB - 0.06, crown.zF + 0.06), id: 2 });
  }
  return { H, parts, b, crown, cf, top };
}
const BRIM_PAINT = `
    float ang = vG.x / (uP[0].z * 0.5);
    if (id > 0.5 && id < 1.5) col = mix(uMain, uMain * 0.96, step(0.0, 1.0));
    if (id > 1.5 && id < 2.5) col = uAccent;`;
// a straw weave (crossed bands) for straw hats
const STRAW = `{ vec2 q = vec2(vG.x, (id > 0.5 && id < 1.5) ? vG.z : vG.y); float w = stripes(q.x + q.y, 0.006, 0.0025) * stripes(q.x - q.y, 0.006, 0.0025);
    col = mix(col, uSecond, 0.18 + 0.2 * w); col = mix(col, uSecond * 0.85, line(fract(q.y / 0.012), 0.5, 0.08) * 0.35); }`;

export function bucket_hat(ctx, it) {
  const wide = has(it, 'brim_wide');
  const c = brimHat(ctx, it, { front: 0.24, back: 0.06, gT: 0.022, sy: 1.0, flat: undefined,
    brim: { w: wide ? 0.82 : 0.72, dF: wide ? 0.86 : 0.76, dB: wide ? 0.82 : 0.74, droop: (q) => -Math.max(q - 0.55, 0) * headHelper(ctx).hh * (wide ? 0.55 : 0.7), dmax: headHelper(ctx).hh * 0.35 },
    band: { w: 0.07, at: 0.004 } });
  if (has(it, 'chinstrap')) addChinstrap(ctx, c.H, c.parts, c.b, 7);
  if (has(it, 'feather')) addFeather(c, 6);
  const body = BRIM_PAINT + `
    if (id > 0.5 && id < 1.5) { col = uMain; col = mix(col, uTrim, (line(fract(vG.z / 0.012), 0.5, 0.12)) * 0.7 * step(uP[0].z * 0.62, vG.z)); }
    if (id < 0.5) col = mix(col, uTrim, line(fract((uP[0].y - vG.y) / 0.012), 0.5, 0.12) * 0.6 * step(uP[0].y - 0.06, vG.y) * 0.0);
    if (id < 0.5) { float ang2 = vG.x / (uP[0].z * 0.5); col = mix(col, col * 0.75, (line(ang2, 0.0, 0.015) + line(abs(ang2), 1.57, 0.015) + line(abs(ang2), 3.14, 0.015)) * 0.8); }
    if (id > 1.5 && id < 2.5) col = uSecond;
    if (id > 5.5 && id < 6.5) col = mix(uAccent, uSecond, step(0.5, fract(vG.y * 120.0)));
    if (id > 6.5) col = uSecond;`;
  return hatPieceHelper(ctx, it, c.H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
function addFeather(c, id, side = 1) {
  const H = c.H, hh = H.hh, y = c.b.yB + (c.b.yF - c.b.yB) * 0.4 + hh * 0.06;
  const zs = (c.crown.zF + c.crown.zB) / 2 - hh * 0.05, xs = side * (H.xS(y, zs) + 0.012);
  const a = H.W([xs, y - hh * 0.02, zs + hh * 0.06]), b = H.W([xs + side * hh * 0.08, y + hh * 0.3, zs - hh * 0.2]);
  c.parts.push({ f: featherHelper(a, b, [side * 0.02, 0, 0.01], hh * 0.05), box: [[Math.min(a[0], b[0]) - 0.05, Math.min(a[1], b[1]) - 0.04, Math.min(a[2], b[2]) - 0.05], [Math.max(a[0], b[0]) + 0.05, Math.max(a[1], b[1]) + 0.04, Math.max(a[2], b[2]) + 0.05]], id });
}
export function sun_hat(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimHat(ctx, it, { front: 0.25, back: 0.04, gT: 0.024, flat: H.top + 0.03, flatR: 0.03,
    brim: { w: 0.85, dF: 0.92, dB: 0.85, droop: (q, cs) => -Math.pow(Math.max(q - 0.5, 0) / 0.5, 1.6) * hh * (0.16 + 0.05 * cs), dmax: hh * 0.25, rim: Math.max(0.004, hh * 0.016) },
    band: { w: 0.09, at: 0.004 } });
  if (has(it, 'chinstrap')) addChinstrap(ctx, H, c.parts, c.b, 7);
  addBow(c, 5, -1, 0.42);
  const body = BRIM_PAINT + STRAW + `if (id > 4.5 && id < 5.5) col = uAccent; if (id > 6.5) col = uAccent;`;
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function straw_hat(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimHat(ctx, it, { front: 0.23, back: 0.04, gT: 0.03, sy: 1.04,
    brim: { w: 0.86, dF: 0.9, dB: 0.86, droop: (q) => -Math.pow(Math.max(q - 0.5, 0) / 0.5, 2) * hh * 0.1, dmax: hh * 0.2, rim: Math.max(0.004, hh * 0.016) },
    band: { w: 0.08, at: 0.004 } });
  if (has(it, 'chinstrap')) addChinstrap(ctx, H, c.parts, c.b, 7);
  const body = BRIM_PAINT + STRAW + `if (id > 6.5) col = uAccent;`;
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function boater(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimHat(ctx, it, { front: 0.22, back: 0.06, gT: 0.02, gB: 0.012,
    crownF: (H2, b, cr) => cylCrown(H2, b, cr, { h: hh * 0.27, rx: H2.hw * 0.56, rz: H2.hd * 0.58, round: 0.008, taper: 0 }),
    top: H.eye + hh * 0.22 + hh * 0.3,
    brim: { w: 0.78, dF: 0.8, dB: 0.76, rim: Math.max(0.004, hh * 0.014) },
    band: { w: 0.11, at: 0.003, out: 0.003 } });
  const body = BRIM_PAINT + `if (id > 1.5 && id < 2.5) { col = uSecond; col = mix(col, uAccent, band(vG.y, uP[0].x + ${f3(hh * 0.035)}, uP[0].x + ${f3(hh * 0.06)})); }
    if (id < 0.5 || (id > 0.5 && id < 1.5)) col *= 0.95 + 0.05 * stripes(vG.x + vG.y * 0.3, 0.005, 0.002);`;
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
// a cylinder-like crown standing on the band: o { h (height over the band's front), rx, rz, round, taper (top narrower by), dentTop, pinch }
function cylCrown(H, b, cr, o) {
  const zc = (cr.zF + cr.zB) / 2 + (o.dz || 0), yTop = b.yF + o.h;
  return (x, y, z) => {
    const t = clamp((y - b.yB) / Math.max(yTop - b.yB, 0.01));
    const k = 1 - (o.taper || 0) * t + (o.bulge || 0) * Math.sin(t * Math.PI);
    let rx = o.rx * k, rz = o.rz * k;
    if (o.pinch) rx *= 1 - o.pinch * sst(0.4, 1, t) * Math.max(0, (z - zc) / o.rz);
    const q = Math.sqrt((x / rx) ** 2 + ((z - zc) / rz) ** 2);
    let top = yTop;
    if (o.dentTop) top -= o.dentTop * Math.exp(-((x / (o.rx * 0.35)) ** 2)) * (1 - 0.6 * Math.abs(z - zc) / o.rz);
    if (o.dents4) top -= o.dents4 * Math.max(0, Math.abs(Math.sin(2 * Math.atan2(x, z - zc))) - 0.3) * clamp(q * 1.5);
    const ds = (q - 1) * Math.min(rx, rz), dt = y - top;
    const r = o.round || 0;
    let d = Math.hypot(Math.max(ds + r, 0), Math.max(dt + r, 0)) + Math.min(Math.max(ds + r, dt + r), 0) - r;
    d = Math.max(d, (cr.band(z) - y) - 0.02);
    return d * 0.9;
  };
}
export function felt_hat(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimHat(ctx, it, { front: 0.22, back: 0.04, gT: 0.03, sy: 1.12,
    brim: { w: 0.76, dF: 0.8, dB: 0.74, droop: (q, cs) => (-Math.pow(Math.max(q - 0.55, 0) / 0.45, 1.5) * hh * 0.06) + Math.max(-cs, 0) * Math.pow(Math.max(q - 0.6, 0) / 0.4, 2) * hh * 0.14, dmax: hh * 0.12, up: hh * 0.15, rim: Math.max(0.0035, hh * 0.012) },
    band: { w: 0.1, at: 0.004 } });
  addBow(c, 5, 1, 0.36);
  const body = BRIM_PAINT + `if (id > 1.5 && id < 2.5) col = uSecond; if (id > 4.5 && id < 5.5) col = uSecond;
    if (id > 4.5 && id < 5.5) col = mix(col, uAccent, 0.0);`;
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
// a bow on the side of a hat's band (side 1 left, -1 right), at angle off the side towards the front
function addBow(c, id, side = 1, s = 0.4, fwd = 0.25) {
  const H = c.H, hh = H.hh, y = c.b.yB + (c.b.yF - c.b.yB) * 0.45 + hh * 0.05;
  const zs = (c.crown.zF + c.crown.zB) / 2 + hh * 0.06 * fwd * 4, xs = side * (H.xS(y, zs) + 0.016 + (c.gap || 0.01));
  const ctr = H.W([xs, y, zs]);
  const ax = frameHelper([side, 0, fwd * 0.6], [0, 1, 0]);
  const size = H.hw * s;
  c.parts.push({ f: bowHelper(ctr, ax, size, { tails: 0.6 }), box: boxAroundHelper(ctr, size * 0.75), id });
}
export function fedora(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimHat(ctx, it, { front: 0.24, back: 0.07, gT: 0.02,
    crownF: (H2, b, cr) => cylCrown(H2, b, cr, { h: hh * 0.36, rx: H2.hw * 0.56, rz: H2.hd * 0.6, round: hh * 0.07, taper: 0.12, dentTop: hh * 0.07, pinch: 0.35 }),
    top: H.eye + hh * 0.24 + hh * 0.4,
    brim: { w: 0.74, dF: 0.8, dB: 0.72, droop: (q, cs) => Math.pow(Math.max(q - 0.55, 0) / 0.45, 1.6) * hh * (cs > 0 ? -0.09 * cs : 0.14 * -cs) + Math.pow(Math.max(q - 0.55, 0) / 0.45, 2) * hh * 0.05 * (1 - Math.abs(cs)), dmax: hh * 0.12, up: hh * 0.15 },
    band: { w: 0.1, at: 0.004, out: 0.004 } });
  const body = BRIM_PAINT + `if (id > 1.5 && id < 2.5) col = uSecond;`;
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function top_hat(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimHat(ctx, it, { front: 0.25, back: 0.1, gB: 0.01,
    crownF: (H2, b, cr) => cylCrown(H2, b, cr, { h: hh * 0.75, rx: H2.hw * 0.54, rz: H2.hd * 0.57, round: 0.006, taper: -0.08 }),
    top: H.eye + hh * 0.25 + hh * 0.8,
    brim: { w: 0.7, dF: 0.72, dB: 0.7, droop: (q, cs, sn) => Math.pow(Math.max(q - 0.6, 0) / 0.4, 2) * hh * 0.1 * Math.abs(sn), up: hh * 0.12, rim: Math.max(0.004, hh * 0.016) },
    band: { w: 0.14, at: 0.004, out: 0.003 } });
  const body = BRIM_PAINT + `if (id > 1.5 && id < 2.5) col = uAccent;`;
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function campaign_hat(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimHat(ctx, it, { front: 0.24, back: 0.07,
    crownF: (H2, b, cr) => cylCrown(H2, b, cr, { h: hh * 0.4, rx: H2.hw * 0.57, rz: H2.hd * 0.6, round: hh * 0.03, taper: 0.38, dents4: hh * 0.08 }),
    top: H.eye + hh * 0.24 + hh * 0.42,
    brim: { w: 0.82, dF: 0.86, dB: 0.82, droop: (q) => -Math.pow(Math.max(q - 0.6, 0) / 0.4, 2) * hh * 0.03, rim: Math.max(0.0035, hh * 0.012) },
    band: { w: 0.07, at: 0.003, out: 0.003 } });
  if (has(it, 'chinstrap')) addChinstrap(ctx, H, c.parts, c.b, 7);
  const body = BRIM_PAINT + `if (id > 1.5 && id < 2.5) col = uSecond; if (id > 6.5) col = uTrim;
    if (id < 0.5) { col = mix(col, uAccent, star(vec2(vG.x, vG.y), vec2(0.0, uP[0].x + ${f3(hh * 0.14)}), ${f3(hh * 0.06)})); }`;
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}
export function cloche(ctx, it) {
  const H = headHelper(ctx), hh = H.hh;
  const c = brimHat(ctx, it, { front: 0.18, back: -0.08, gT: 0.026, gB: 0.012, sy: 1.08,
    brim: { w: 0.66, dF: 0.7, dB: 0.66, droop: (q) => -Math.pow(Math.max(q - 0.6, 0) / 0.4, 1.2) * hh * 0.14, dmax: hh * 0.18, t: Math.max(0.006, hh * 0.02) },
    band: { w: 0.09, at: 0.01 } });
  if (has(it, 'flower')) {
    const y = c.b.yF - hh * 0.05 + hh * 0.08, zs = (c.crown.zF + c.crown.zB) / 2 + hh * 0.16, xs = -(H.xS(y, zs) + 0.016);
    const ctr = H.W([xs, y, zs]), r = hh * 0.11;
    c.parts.push({ f: flowerHelper(ctr, [-1, 0.1, 0.5], r, { petals: 5 }), box: boxAroundHelper(ctr, r * 1.3), id: 5 });
  }
  const body = BRIM_PAINT + `if (id > 1.5 && id < 2.5) col = uSecond; if (id > 4.5 && id < 5.5) col = mix(uAccent, uSecond, step(length(vG.xy - vec2(0.0)) , 0.0));`;
  return hatPieceHelper(ctx, it, H, c.parts, hatGLSL(it, body), { band: c.b.yF });
}

// knit and soft hats --------------------------------------------------------
export function beanie(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const tall = it.params.length === 'medium' ? 1.12 : 1.04;
  const ears = has(it, 'animal_ears'), flaps = has(it, 'earflaps');
  const b = bandOf(H, 0.22, flaps ? -0.04 : -0.08);
  const crown = crownHelper(H, { ...b, gB: 0.009, gT: 0.022, sy: tall });
  const topY = crownTop(H, crown, 0.022, tall);
  const parts = [{ f: loc(H, crown), box: box3(H, hw * 0.65, b.yB - 0.03, topY + 0.03, crown.zB - 0.04, crown.zF + 0.04), id: 0 }];
  // the turned-up ribbed cuff
  if (!ears) {
    const cw = hh * 0.13;
    parts.push({ f: loc(H, (x, y, z) => Math.max(crown(x, y, z) - 0.004, y - crown.band(z) - cw)), box: box3(H, hw * 0.7, b.yB - 0.03, Math.max(b.yF, b.yB) + cw + 0.03, crown.zB - 0.05, crown.zF + 0.05), id: 2 });
  }
  if (has(it, 'pompom')) { const r = hh * 0.13, c = [0, topY + r * 0.6, -hh * 0.02]; parts.push({ f: loc(H, pompomHelper(c, r)), box: box3(H, r * 1.4, c[1] - r * 1.4, c[1] + r * 1.4, c[2] - r * 1.4, c[2] + r * 1.4), id: 3 }); }
  if (flaps) addFlaps(H, parts, crown, b, 4);
  if (ears) addEars(H, parts, topY, 5, it.params.details.includes('leaf_sprig'));
  const embro = has(it, 'embroidery_small');
  const body = `float ang = vG.x / (uP[0].z * 0.5);
    ${KNIT('vG.x', 'vG.y', 0.007)}
    if (id > 1.5 && id < 2.5) { col = uMain; ${KNIT('vG.x', 'vG.y', 0.005)} col = mix(col, col * 0.8, stripes(vG.x, 0.005, 0.0016)); }
    if (id > 2.5 && id < 3.5) col = uSecond * (0.9 + 0.1 * noise2(vG.xy / 0.004));
    if (id > 3.5 && id < 4.5) { col = uMain; ${KNIT('vG.x', 'vG.y', 0.007)} }
    if (id > 4.5 && id < 5.5) col = mix(uMain, uSecond, step(0.0, -1.0));
    ${embro ? `if (id > 1.5 && id < 2.5) col = mix(col, uAccent, box2(vec2(vG.x, vG.y), vec2(${f3(-hh * 0.18)}, uP[0].x + ${f3(hh * 0.06)}), vec2(${f3(hh * 0.05)}, ${f3(hh * 0.03)}), 0.003));` : ''}
    ${ears ? `if (id > 4.5 && id < 5.5) col = mix(uMain, uSecond, step(vG.z, 0.0) * 0.0); if (id > 5.5) col = uSecond;
      if (id < 0.5) { vec2 q = vec2(vG.x, vG.y - uP[0].x - ${f3(hh * 0.17)}); col = mix(col, vec3(0.13), circle(vec2(abs(q.x), q.y), vec2(${f3(hh * 0.11)}, 0.0), ${f3(hh * 0.035)}) * step(abs(ang), 1.0)); col = mix(col, vec3(1.0), circle(vec2(abs(q.x), q.y), vec2(${f3(hh * 0.1)}, ${f3(hh * 0.012)}), ${f3(hh * 0.011)}) * step(abs(ang), 1.0)); col = mix(col, uAccent, circle(vec2(abs(q.x), q.y), vec2(${f3(hh * 0.19)}, ${f3(-hh * 0.05)}), ${f3(hh * 0.03)}) * step(abs(ang), 1.2) * 0.6); }` : ''}`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body), { band: b.yF });
}
// earflaps: a slab of the crown's shell hanging over each ear
function addFlaps(H, parts, crown, b, id, o = {}) {
  const hh = H.hh, e = H.ear, th = o.th ?? Math.max(0.007, hh * 0.026), gap = o.gap ?? 0.012;
  for (const s of [1, -1]) {
    const cy = e[1] - hh * (o.drop ?? 0.06), cz = e[2] + hh * 0.01, ry = hh * (o.len ?? 0.3), rz = hh * 0.17;
    const f = (x, y, z) => {
      if (x * s < 0) return 0.05;
      const sh = Math.abs(H.f(x, y, z) - gap - th / 2) - th / 2;
      const yy = (y - cy) / ry, zz = (z - cz) / rz;
      const reg = (Math.sqrt(zz * zz + Math.max(-yy, 0) ** 2 * 1.4) - 1) * rz;
      return Math.max(sh, reg, y - crown.band(z) - 0.01);
    };
    parts.push({ f: loc(H, f), box: box3(H, H.hw * 0.75, cy - ry - 0.03, b.yF + 0.02, cz - rz - 0.03, cz + rz + 0.03), id });
  }
}
// round creature ears on top (and a leaf sprig)
function addEars(H, parts, topY, id, sprig) {
  const hh = H.hh;
  for (const s of [1, -1]) {
    const c = [s * H.hw * 0.36, topY - hh * 0.06, -hh * 0.02], r = hh * 0.13;
    const f = (x, y, z) => Math.max(ellD(x - c[0], y - c[1], z - c[2], r, r, r * 0.45), -(y - c[1] + r * 0.65));
    parts.push({ f: loc(H, f), box: box3(H, Math.abs(c[0]) + r + 0.02, c[1] - r - 0.02, c[1] + r + 0.02, -r - 0.03, r + 0.03), id });
  }
  if (sprig) {
    const a = [0, topY - 0.01, 0.0], b2 = [hh * 0.04, topY + hh * 0.12, hh * 0.02];
    const f = (x, y, z) => Math.min(capsHelper(x, y, z, a, b2, hh * 0.012), ellD(x - hh * 0.1, y - topY - hh * 0.13, z - hh * 0.02, hh * 0.09, hh * 0.035, hh * 0.05), ellD(x + hh * 0.03, y - topY - hh * 0.15, z - hh * 0.02, hh * 0.06, hh * 0.025, hh * 0.035));
    parts.push({ f: loc(H, f), box: box3(H, hh * 0.25, topY - 0.03, topY + hh * 0.25, -hh * 0.12, hh * 0.15), id: id + 1 });
  }
}
export function trapper(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, 0.22, -0.04);
  const crown = crownHelper(H, { ...b, gB: 0.01, gT: 0.024, sy: 1.08 });
  const topY = crownTop(H, crown, 0.024, 1.08);
  const parts = [{ f: loc(H, crown), box: box3(H, hw * 0.65, b.yB - 0.03, topY + 0.03, crown.zB - 0.04, crown.zF + 0.04), id: 0 }];
  // the fur front, folded up
  const fw = hh * 0.14;
  parts.push({ f: loc(H, (x, y, z) => Math.max(crown(x, y, z) - 0.012, y - crown.band(z) - fw, -z + crown.zF * 0.1)), box: box3(H, hw * 0.75, b.yB - 0.02, b.yF + fw + 0.04, crown.zB, crown.zF + 0.05), id: 7 });
  addFlaps(H, parts, crown, b, 4, { th: Math.max(0.012, hh * 0.04), len: 0.34 });
  if (has(it, 'pompom')) { const r = hh * 0.11, c = [0, topY + r * 0.6, -hh * 0.02]; parts.push({ f: loc(H, pompomHelper(c, r)), box: box3(H, r * 1.4, c[1] - r * 1.4, c[1] + r * 1.4, c[2] - r * 1.4, c[2] + r * 1.4), id: 3 }); }
  const body = `${KNIT('vG.x', 'vG.y', 0.008)}
    if (id > 2.5 && id < 3.5) col = uSecond;
    if (id > 3.5 && id < 4.5) { col = uMain; if (vG.z < 0.0) col = uTrim; }
    if (id > 6.5) col = uTrim * (0.88 + 0.12 * noise2(vG.xy / 0.003));`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body), { band: b.yF });
}
export function aviator_cap(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, 0.24, -0.06);
  const crown = crownHelper(H, { ...b, gB: 0.008, gT: 0.016, sy: 1.0 });
  const topY = H.top + 0.016;
  const parts = [{ f: loc(H, crown), box: box3(H, hw * 0.65, b.yB - 0.03, topY + 0.03, crown.zB - 0.04, crown.zF + 0.04), id: 0 }];
  const fw = hh * 0.05;
  parts.push({ f: loc(H, (x, y, z) => Math.max(crown(x, y, z) - 0.004, y - crown.band(z) - fw)), box: box3(H, hw * 0.7, b.yB - 0.03, b.yF + fw + 0.03, crown.zB - 0.05, crown.zF + 0.05), id: 7 });
  addFlaps(H, parts, crown, b, 4, { len: 0.3 });
  if (has(it, 'chinstrap')) addChinstrap(ctx, H, parts, b, 6, { from: H.ear[1] - hh * 0.2 });
  const body = `float ang = vG.x / (uP[0].z * 0.5);
    col = mix(col, col * 0.75, (line(ang, 0.0, 0.015) + line(abs(ang), 1.4, 0.015)) * step(uP[0].x + 0.02, vG.y));
    col = mix(col, uTrim, dashes(vG.y, ang * 0.05, 0.004, 0.0012, 0.006, 0.0035) * 0.0);
    if (id > 3.5 && id < 4.5) col = uMain * 0.94;
    if (id > 5.5 && id < 6.5) col = uTrim;
    if (id > 6.5) col = uSecond * (0.9 + 0.1 * noise2(vG.xy / 0.003));`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body), { band: b.yF });
}
export function beret(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, 0.3, 0.12);
  const crown = crownHelper(H, { ...b, gB: 0.006, gT: 0.012 });
  const tilt = 0.26;   // 15 degrees to the right
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const cy = H.top * 0.55, R = hw * 0.62, Ry = hh * 0.16;
  const puff = (x, y, z) => {
    const X = x * ct + (y - cy) * st, Y = -x * st + (y - cy) * ct;
    return ellD(X + hw * 0.02, Y - hh * 0.05, z + hh * 0.02, R, Ry, R * 1.02);
  };
  const f = (x, y, z) => Math.max(Math.min(puff(x, y, z), crown(x, y, z)), crown.band(z) - y - 0.002);
  const parts = [{ f: loc(H, f), box: box3(H, R + 0.04, b.yB - 0.03, H.top + Ry + 0.06, -R - 0.05, R + 0.05), id: 0 }];
  const tp = [-st * (Ry + hh * 0.05) - hw * 0.02, cy + ct * (Ry + hh * 0.05), -hh * 0.02];
  parts.push({ f: loc(H, (x, y, z) => capsHelper(x, y, z, [tp[0] + st * 0.01, tp[1] - 0.01, tp[2]], [tp[0] - st * hh * 0.05, tp[1] + hh * 0.05, tp[2]], hh * 0.012)), box: box3(H, hw * 0.6, 0, H.top + hh * 0.5, -0.05, 0.05), id: 3 });
  const body = `if (id > 2.5) col = uMain * 0.9; col *= 0.95 + 0.05 * noise2(vG.xy / 0.01);
    col = mix(col, uSecond, line(vG.y, uP[0].x + 0.006, 0.006) * step(vG.z, 0.0) * 0.0);`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body), { band: b.yF });
}
export function flat_cap(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, 0.17, 0.02);
  const crown = crownHelper(H, { ...b, gB: 0.007, gT: 0.014 });
  // the top: a flattened pad sloping forward over the bill
  const topY = H.top + 0.014;
  const pad = (x, y, z) => {
    const yy = y - (topY - hh * 0.12) + (z - crown.zF) * 0.35;
    return ellD(x, yy, z - hh * 0.06, hw * 0.6, hh * 0.13, hh * 0.56);
  };
  const f = (x, y, z) => Math.max(sminK(crown(x, y, z), pad(x, y, z), 0.01), crown.band(z) - y);
  const parts = [{ f: loc(H, f), box: box3(H, hw * 0.7, b.yB - 0.03, topY + 0.04, crown.zB - 0.04, crown.zF + hh * 0.35), id: 0 }];
  const len = hh * 0.2, w = hw * 0.46;
  parts.push({ f: loc(H, billHelper(H, { y: b.yF + 0.001, z: crown.zF - 0.004, len, w, tilt: 0.25, curve: hh * 0.03, t: Math.max(0.006, hh * 0.02) })), box: box3(H, w + 0.01, b.yF - hh * 0.25, b.yF + 0.03, crown.zF - hh * 0.2, crown.zF + len + 0.02), id: 1 });
  const body = `if (id > 0.5) col = col * 0.92;`;
  return hatPieceHelper(ctx, it, H, parts, `vec2 P = vG.xy; float id = floor(vG.w + 0.5); vec3 col = uMain; ${patternGLSL(it.pattern || {})} ${body} return col;`, { band: b.yF });
}
export function sailor_cap(ctx, it) {
  // a round flat sailor cap (a tam with a band) and two ribbon tails at the back
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, 0.24, 0.06);
  const crown = crownHelper(H, { ...b, gB: 0.008, gT: 0.016 });
  const bh = hh * 0.12;
  const bandF = (x, y, z) => Math.max(crown(x, y, z), y - crown.band(z) - bh);
  const tc = [0, b.yF + bh + hh * 0.08, crown.zF * 0.0 - hh * 0.05];
  const top = (x, y, z) => ellD(x - tc[0], y - tc[1], z - tc[2], hw * 0.66, hh * 0.1, hd2(H) * 0.66);
  const f = (x, y, z) => Math.max(Math.min(bandF(x, y, z), sminK(top(x, y, z), crown(x, y, z) - 0.01, 0.02)), crown.band(z) - y);
  const parts = [{ f: loc(H, f), box: box3(H, hw * 0.75, b.yB - 0.03, H.top + hh * 0.3, crown.zB - 0.1, crown.zF + 0.1), id: 0 }];
  // band (ribbon) as a raised ring
  parts.push({ f: loc(H, (x, y, z) => Math.max(crown(x, y, z) - 0.003, Math.abs(y - crown.band(z) - bh * 0.5) - bh * 0.5)), box: box3(H, hw * 0.7, b.yB - 0.03, b.yF + bh + 0.03, crown.zB - 0.04, crown.zF + 0.04), id: 2 });
  // ribbon tails down the back
  for (const s of [1, -1]) {
    const y0 = b.yB + bh * 0.4, z0 = crown.zB - 0.004, a = [s * hw * 0.06, y0, z0], c2 = [s * hw * 0.14, y0 - hh * 0.4, z0 - hh * 0.04];
    parts.push({ f: loc(H, (x, y, z) => { const t = clamp((y0 - y) / (y0 - c2[1])); const cx = a[0] + (c2[0] - a[0]) * t, cz = a[2] + (c2[2] - a[2]) * t; return Math.max(Math.abs(x - cx) - hh * 0.04, Math.abs(z - cz) - 0.002, y - y0, c2[1] - y + (Math.abs(x - cx) * 0.6)) * 0.9; }), box: box3(H, hw * 0.3, c2[1] - 0.02, y0 + 0.02, z0 - hh * 0.12, z0 + 0.02), id: 5 });
  }
  const body = `if (id > 1.5 && id < 2.5) col = uSecond; if (id > 4.5 && id < 5.5) col = uSecond;
    if (id > 1.5 && id < 2.5) col = mix(col, uAccent, step(0.0, vG.x) * step(vG.x, 0.0));
    if (id < 0.5) col = mix(col, uSecond, line(vG.z, ${f3(hw * 0.6)}, 0.004) * step(uP[0].x + ${f3(bh + 0.02)}, vG.y));`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body), { band: b.yF });
}
const hd2 = (H) => H.hd;
export function peaked_cap(ctx, it) {
  // captain / police: a band, a flat round top wider than the head, a shiny bill, a badge
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, 0.2, 0.04);
  const crown = crownHelper(H, { ...b, gB: 0.008, gT: 0.016 });
  const bh = hh * 0.13, zc = (crown.zF + crown.zB) / 2;
  const topY = b.yF + bh + hh * 0.2;
  const topF = (x, y, z) => {
    // a drum flaring out from the band to a flat top (front higher)
    const yt = topY + (z - zc) * 0.18;
    const t = clamp((y - (crown.band(z) + bh)) / (yt - crown.band(z) - bh));
    const rx = hw * (0.56 + 0.12 * t), rz = H.hd * (0.6 + 0.16 * t) ;
    const q = Math.sqrt((x / rx) ** 2 + ((z - zc - 0.01 * t) / rz) ** 2);
    const ds = (q - 1) * Math.min(rx, rz), dt = y - yt;
    return Math.max(ds, dt) * 0.85;
  };
  const f = (x, y, z) => Math.max(Math.min(Math.max(crown(x, y, z), y - crown.band(z) - bh - 0.01), topF(x, y, z)), crown.band(z) - y);
  const parts = [{ f: loc(H, f), box: box3(H, hw * 0.8, b.yB - 0.03, topY + 0.06, crown.zB - 0.1, crown.zF + 0.1), id: 0 }];
  parts.push({ f: loc(H, (x, y, z) => Math.max(crown(x, y, z) - 0.003, Math.abs(y - crown.band(z) - bh * 0.5) - bh * 0.5)), box: box3(H, hw * 0.7, b.yB - 0.03, b.yF + bh + 0.03, crown.zB - 0.04, crown.zF + 0.04), id: 2 });
  const len = hh * 0.22, w = hw * 0.44;
  parts.push({ f: loc(H, billHelper(H, { y: b.yF + 0.001, z: crown.zF - 0.004, len, w, tilt: 0.45, curve: hh * 0.02, t: Math.max(0.006, hh * 0.02) })), box: box3(H, w + 0.01, b.yF - hh * 0.25, b.yF + 0.03, crown.zF - hh * 0.2, crown.zF + len + 0.02), id: 1 });
  const starE = has(it, 'star_emblem');
  const body = `if (id > 0.5 && id < 1.5) col = vec3(0.1, 0.1, 0.12); if (id > 1.5 && id < 2.5) col = uTrim * 0.4 + uMain * 0.4;
    if (id > 1.5 && id < 2.5) col = mix(col, uAccent, line(vG.y, uP[0].x + ${f3(bh * 0.9)}, 0.0025) + line(vG.y, uP[0].x + 0.003, 0.0025));
    { vec2 q = vec2(vG.x, vG.y - uP[0].x - ${f3(bh * 1.3)}); float m = step(abs(vG.x), 0.05) * step(0.0, 1.0);
      ${starE ? `col = mix(col, uAccent, star(q, vec2(0.0), ${f3(hh * 0.075)}) * m); col = mix(col, uSecond, star(q, vec2(0.0), ${f3(hh * 0.035)}) * m);` : `col = mix(col, uAccent, (circle(q, vec2(0.0), ${f3(hh * 0.055)}) - circle(q, vec2(0.0), ${f3(hh * 0.04)}) + circle(q, vec2(0.0), ${f3(hh * 0.02)})) * m); col = mix(col, uAccent, box2(q, vec2(0.0, ${f3(-hh * 0.07)}), vec2(${f3(hh * 0.09)}, ${f3(hh * 0.008)}), 0.002) * m);`} }`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
export function hard_hat(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, 0.22, 0.04);
  const crown = crownHelper(H, { ...b, gB: 0.016, gT: 0.03, sy: 1.08 });
  const topY = crownTop(H, crown, 0.03, 1.08);
  const ridge = (x, y, z) => Math.max(Math.abs(x) - hh * 0.04, crown(x, y, z) - 0.009);
  const parts = [{ f: loc(H, crown), box: box3(H, hw * 0.7, b.yB - 0.03, topY + 0.03, crown.zB - 0.04, crown.zF + 0.04), id: 0 },
    { f: loc(H, ridge), box: box3(H, hh * 0.06, b.yB - 0.03, topY + 0.04, crown.zB - 0.05, crown.zF + 0.05), id: 2 }];
  const fr = brimHelper(H, { yF: b.yF, yB: b.yB, zF: crown.zF, zB: crown.zB, rx: hw * 0.64, rzF: H.hd * 0.86, rzB: H.hd * 0.66, zc: (crown.zF + crown.zB) / 2, t: Math.max(0.007, hh * 0.024), droop: (q) => -Math.max(q - 0.7, 0) * hh * 0.15, inner: 0.4 });
  parts.push({ f: loc(H, fr), box: box3(H, hw * 0.7, b.yB - 0.06, b.yF + 0.03, crown.zB - 0.05, crown.zF + hh * 0.3), id: 1 });
  const body = `if (id > 1.5 && id < 2.5) col = uMain * 0.95;
    ${has(it, 'reflective_tape') ? `if (id < 0.5) col = mix(col, uAccent, band(vG.y, uP[0].x + ${f3(hh * 0.12)}, uP[0].x + ${f3(hh * 0.17)}) * step(0.2, abs(vG.x)));` : ''}
    if (id < 0.5) col = mix(col, uSecond, circle(vec2(vG.x, vG.y), vec2(0.0, uP[0].x + ${f3(hh * 0.13)}), ${f3(hh * 0.05)}) * 0.0);`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
export function sport_helmet(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, 0.24, -0.08);
  const crown = crownHelper(H, { ...b, gB: 0.018, gT: 0.03, sy: 1.04 });
  const topY = crownTop(H, crown, 0.03, 1.04);
  // an aero shell: the crown with a slight tail at the back
  const tail = (x, y, z) => ellD(x, y - topY * 0.3, z - crown.zB * 0.75, hw * 0.4, hh * 0.18, hh * 0.24);
  const f = (x, y, z) => Math.max(sminK(crown(x, y, z), tail(x, y, z), 0.03), crown.band(z) - y - 0.01 * 0);
  const parts = [{ f: loc(H, f), box: box3(H, hw * 0.75, b.yB - 0.04, topY + 0.04, crown.zB - 0.08, crown.zF + 0.05), id: 0 }];
  if (has(it, 'chinstrap')) addChinstrap(ctx, H, parts, b, 7, { from: H.ear[1] + hh * 0.05 });
  const body = `float ang = vG.x / (uP[0].z * 0.5);
    col = mix(col, uSecond, band(vG.x, -0.012, 0.012) * step(uP[0].x + 0.03, vG.y));
    col = mix(col, uAccent, (line(vG.x, -0.018, 0.004) + line(vG.x, 0.018, 0.004)) * step(uP[0].x + 0.03, vG.y));
    ${has(it, 'vents') ? `for (int i = 0; i < 3; i++) { float a0 = 0.35 + float(i) * 0.4; col = mix(col, vec3(0.1), box2(vec2(abs(ang), vG.y), vec2(a0, uP[0].x + ${f3(hh * 0.3)}), vec2(0.1, ${f3(hh * 0.1)}), 0.005)); }` : ''}
    ${has(it, 'reflective_dots') ? `col = mix(col, vec3(0.92), circle(vec2(abs(ang), vG.y), vec2(2.4, uP[0].x + ${f3(hh * 0.12)}), 0.006));` : ''}
    col = mix(col, uTrim * 0.3, band(vG.y, uP[0].x - 0.05, uP[0].x + 0.008) * 0.6);
    if (id > 6.5) col = vec3(0.15);`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
export function visor(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, 0.16, 0.06);
  const crown = crownHelper(H, { ...b, gB: 0.01, gT: 0.016 });
  const bh = hh * 0.1;
  const parts = [{ f: loc(H, (x, y, z) => Math.max(Math.abs(crown(x, y, z) + 0.004) - 0.004, crown.band(z) - y, y - crown.band(z) - bh)), box: box3(H, hw * 0.65, b.yB - 0.03, b.yF + bh + 0.03, crown.zB - 0.04, crown.zF + 0.04), id: 0 }];
  const len = hh * 0.4, w = hw * 0.46;
  parts.push({ f: loc(H, billHelper(H, { y: b.yF + 0.002, z: crown.zF - 0.006, len, w, tilt: 0.14, curve: hh * 0.06, t: Math.max(0.006, hh * 0.022) })), box: box3(H, w + 0.01, b.yF - hh * 0.25, b.yF + 0.03, crown.zF - hh * 0.2, crown.zF + len + 0.02), id: 1 });
  const body = `if (id > 0.5) col = uMain; if (id < 0.5) col = mix(uSecond, uMain, 0.0);
    if (id < 0.5) col = mix(col, uAccent, circle(vec2(vG.x, vG.y), vec2(0.0, uP[0].x + ${f3(bh * 0.5)}), ${f3(bh * 0.32)}));`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF, double: true });
}
export function headband(ctx, it) {
  // a sports headband over the forehead, or (girl, bow) an Alice band over the top
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const alice = it.item.slot === 'hair_acc' || has(it, 'bow');
  if (alice) return aliceBand(ctx, it, H);
  const b = bandOf(H, 0.24, 0.1);
  const crown = crownHelper(H, { ...b, gB: 0.012, gT: 0.012 });
  const bh = hh * 0.12;
  const parts = [{ f: loc(H, (x, y, z) => Math.max(crown(x, y, z), Math.abs(y - crown.band(z) - bh / 2) - bh / 2, -crown(x, y, z) - 0.012) * 0.95), box: box3(H, hw * 0.65, b.yB - 0.03, b.yF + bh + 0.03, crown.zB - 0.04, crown.zF + 0.04), id: 0 }];
  const body = `${KNIT('vG.x', 'vG.y', 0.005)}
    col = mix(col, uSecond, (band(vG.y, uP[0].x + 0.003, uP[0].x + 0.007) + band(vG.y, uP[0].x + ${f3(bh - 0.007)}, uP[0].x + ${f3(bh - 0.003)})));
    ${has(it, 'embroidery_small') ? `col = mix(col, uAccent, star(vec2(vG.x, vG.y), vec2(0.0, uP[0].x + ${f3(bh / 2)}), ${f3(bh * 0.3)}));` : ''}`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
// an Alice band: a hoop over the top of the head (on the hair) from ear to ear, a bow on one side
function aliceBand(ctx, it, H) {
  const hh = H.hh, hw = H.hw, lift = hh * 0.07, r = Math.max(0.004, hh * 0.018), w = hh * 0.045;
  // the hoop in the plane a little in front of the crown, tilted back
  const z0 = hh * 0.12, tilt = -0.35;
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const a = -1.45 + (2.9 * i) / 24, dir = [Math.sin(a), Math.cos(a), Math.cos(a) * Math.tan(tilt) + z0 / (H.top)];
    const R = H.dirR(dir) + lift * (0.6 + 0.4 * Math.cos(a));
    pts.push(H.W(addV([0, 0, 0], nrm(dir), R)));
  }
  const m = new MeshHelper().sweep(pts, { th: () => [w, r], up: (i, p) => nrm(subV(p, H.O)), prof: 'flat', seg: 10, id: 0, g: (t, a) => [t, Math.cos(a), 0, 0] });
  const piece = pieceHelper(ctx, m, { bone: 'Head' });
  const out = [{ piece, glsl: `vec3 col = uMain; col = mix(col, uSecond, line(vG.y, 0.0, 0.3) * 0.0); return col;`, noPattern: true }];
  if (has(it, 'bow')) {
    const p = pts[17], ax = frameHelper(nrm(subV(p, H.O)), [0, 0, 1]), s = hw * 0.4;
    const bow = sdfHelper(ctx, [{ f: bowHelper(addV(p, ax[2], 0.006), ax, s, { tails: 0 }), box: boxAroundHelper(p, s * 0.8), id: 5 }], { cell: Math.max(0.0015, s / 30), verts: 1600, bone: 'Head' });
    if (bow) out.push({ piece: bow, glsl: 'return uSecond;', noPattern: true, colors: { second: it.colors.second === it.colors.main ? it.colors.accent : it.colors.second } });
  }
  return out;
}
export function headband_tied(ctx, it) {
  // a hachimaki: a band round the forehead, knotted at the back with two tails
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, 0.22, 0.12);
  const crown = crownHelper(H, { ...b, gB: 0.012, gT: 0.012 });
  const bh = hh * 0.1;
  const parts = [{ f: loc(H, (x, y, z) => Math.max(crown(x, y, z), Math.abs(y - crown.band(z) - bh / 2) - bh / 2, -crown(x, y, z) - 0.01) * 0.95), box: box3(H, hw * 0.65, b.yB - 0.03, b.yF + bh + 0.03, crown.zB - 0.04, crown.zF + 0.04), id: 0 }];
  const ky = b.yB + bh * 0.5, kz = crown.zB - 0.008;
  parts.push({ f: loc(H, (x, y, z) => ellD(x, y - ky, z - kz, hh * 0.05, hh * 0.05, hh * 0.035)), box: box3(H, hh * 0.08, ky - 0.04, ky + 0.04, kz - 0.04, kz + 0.04), id: 5 });
  for (const s of [1, -1]) {
    const a = [s * hh * 0.03, ky, kz - 0.004], c = [s * hh * 0.16, ky - hh * 0.38, kz - hh * 0.1];
    parts.push({ f: loc(H, (x, y, z) => { const t = clamp((a[1] - y) / (a[1] - c[1])); const cx = a[0] + (c[0] - a[0]) * t, cz = a[2] + (c[2] - a[2]) * t; return Math.max(Math.abs(x - cx) - bh * 0.42, Math.abs(z - cz) - 0.0025, y - a[1], c[1] - y) * 0.85; }), box: box3(H, hw * 0.3, c[1] - 0.02, a[1] + 0.02, c[2] - 0.03, a[2] + 0.02), id: 6 });
  }
  const body = `col *= 0.95 + 0.05 * stripes(vG.y, 0.006, 0.003);
    if (id < 0.5) { col = mix(col, uSecond, circle(vec2(vG.x, vG.y), vec2(0.0, uP[0].x + ${f3(bh / 2)}), ${f3(bh * 0.33)})); col = mix(col, uMain, circle(vec2(vG.x, vG.y), vec2(0.0, uP[0].x + ${f3(bh / 2)}), ${f3(bh * 0.18)})); }`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
export function toque(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, 0.22, 0.06);
  const crown = crownHelper(H, { ...b, gB: 0.01, gT: 0.02 });
  const bh = hh * 0.16, zc = (crown.zF + crown.zB) / 2;
  const bandF = (x, y, z) => Math.max(crown(x, y, z) - 0.003, y - crown.band(z) - bh);
  // the puffed, pleated top: a mushroom of radius ~0.7 hw, 1.4x head height in all
  const yT = b.yF + bh + hh * 0.55, R = hw * 0.64;
  const puff = (x, y, z) => {
    const a = Math.atan2(x, z - zc), pl = 1 + 0.035 * Math.cos(a * 16);
    const t = clamp((y - b.yF - bh * 0.5) / (yT - b.yF));
    const r = R * pl * (0.82 + 0.25 * Math.sin(t * 2.6));
    const ds = Math.hypot(x, z - zc) - r, dt = y - yT;
    const k = hh * 0.12;
    return (Math.hypot(Math.max(ds + k, 0), Math.max(dt + k, 0)) + Math.min(Math.max(ds + k, dt + k), 0) - k) * 0.85;
  };
  const f = (x, y, z) => Math.max(Math.min(bandF(x, y, z), Math.max(puff(x, y, z), b.yF + bh * 0.4 - y + (z - crown.zF) * crown.slope)), crown.band(z) - y);
  const parts = [{ f: loc(H, f), box: box3(H, R * 1.2, b.yB - 0.03, yT + 0.04, zc - R * 1.2, zc + R * 1.2), id: 0 },
    { f: loc(H, bandF), box: box3(H, hw * 0.7, b.yB - 0.03, b.yF + bh + 0.03, crown.zB - 0.04, crown.zF + 0.04), id: 2 }];
  const body = `if (id > 1.5) { col = uMain; col = mix(col, uAccent, band(vG.y, uP[0].x + 0.004, uP[0].x + 0.01) * 0.0); }
    if (id < 0.5) col *= 0.93 + 0.07 * sin(atan(vG.x, 1.0) * 0.0 + vG.x / (uP[0].z * 0.5) * 16.0);`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
export function baker_cap(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, 0.22, 0.04);
  const crown = crownHelper(H, { ...b, gB: 0.008, gT: 0.016 });
  const bh = hh * 0.11, zc = (crown.zF + crown.zB) / 2;
  const tc = [0, H.top * 0.65, zc - hh * 0.04];
  const puff = (x, y, z) => ellD(x - tc[0], y - tc[1], z - tc[2], hw * 0.62, hh * 0.24, H.hd * 0.64);
  const f = (x, y, z) => Math.max(Math.min(Math.max(crown(x, y, z) - 0.002, y - crown.band(z) - bh), sminK(puff(x, y, z), crown(x, y, z), 0.02)), crown.band(z) - y);
  const parts = [{ f: loc(H, f), box: box3(H, hw * 0.75, b.yB - 0.03, H.top + hh * 0.2, crown.zB - 0.08, crown.zF + 0.08), id: 0 },
    { f: loc(H, (x, y, z) => Math.max(crown(x, y, z) - 0.004, Math.abs(y - crown.band(z) - bh / 2) - bh / 2)), box: box3(H, hw * 0.7, b.yB - 0.03, b.yF + bh + 0.03, crown.zB - 0.04, crown.zF + 0.04), id: 2 }];
  const body = `if (id > 1.5) col = uMain * 0.97; col *= 0.95 + 0.05 * noise2(vG.xy / 0.01);
    if (id > 1.5) col = mix(col, uAccent, line(vG.y, uP[0].x + 0.004, 0.003));`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
export function nurse_cap(ctx, it) {
  // a small folded cap perched on the top front of the head, a band at its front, our heart-in-leaf mark
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, lift = hh * 0.06;
  const c = H.W([0, H.top * 0.72 + lift, hh * 0.12]);
  const ax = frameHelper([0, 0.55, 1], [0, 1, 0]);
  const f = (X, Y, Z) => {
    const [x, y, z] = toFrameHelper(c, ax, [X, Y, Z]);
    const w = hw * 0.36 - Math.max(y, 0) * 0.5;
    const front = Math.max(Math.abs(x) - w, Math.abs(z) - 0.004, Math.abs(y) - hh * 0.12);
    const fold = Math.max(Math.abs(x) - w * 0.95, Math.abs(z + hh * 0.07 - y * 0.2) - 0.004, Math.abs(y + 0.0) - hh * 0.1);
    return Math.min(front, fold) * 0.9;
  };
  const parts = [{ f, box: boxAroundHelper(c, hw * 0.5), id: 0 }];
  const piece = sdfHelper(ctx, parts, { cell: Math.max(0.0018, hh * 0.007), verts: 2200, bone: 'Head', gco: (p) => { const l = toFrameHelper(c, ax, p); return [l[0], l[1], l[2], 0]; } });
  if (!piece) return [];
  return [{ piece, noPattern: true, glsl: `vec3 col = uMain; vec2 q = vG.xy;
    col = mix(col, uSecond, step(vG.z, -0.006));
    col = mix(col, uSecond, band(q.y, ${f3(-hh * 0.12)}, ${f3(-hh * 0.09)}));
    col = mix(col, uAccent, heart(q, vec2(0.0, ${f3(hh * 0.0)}), ${f3(hh * 0.05)}) * step(0.0, vG.z));
    col = mix(col, vec3(0.3, 0.6, 0.3), circle(vec2(abs(q.x), q.y), vec2(${f3(hh * 0.05)}, ${f3(-hh * 0.035)}), ${f3(hh * 0.02)}) * step(0.0, vG.z));
    return col;` }];
}
export function headdress(ctx, it) {
  // a maid's frilled headpiece: a ruffled band over the top of the head with a ribbon
  const H = headHelper(ctx), hh = H.hh, hw = H.hw, lift = hh * 0.08;
  const pts = [], tilt = -0.25;
  for (let i = 0; i <= 28; i++) {
    const a = -1.3 + (2.6 * i) / 28, dir = nrm([Math.sin(a), Math.cos(a), Math.cos(a) * Math.tan(tilt) + 0.35]);
    pts.push(H.W(addV([0, 0, 0], dir, H.dirR(dir) + lift)));
  }
  const m = new MeshHelper();
  m.sweep(pts, { th: (t) => [hh * 0.075, 0.003], up: (i, p) => { const tt = i / 28; return nrm(addV(nrm(subV(p, H.O)), [0, 0, 1], 0.6 + 0.1 * Math.sin(tt * 60))); }, prof: 'flat', seg: 10, id: 0, g: (t, a) => [t, Math.sin(a), 0, 0] });
  const piece = pieceHelper(ctx, m, { bone: 'Head', double: true });
  const out = [];
  if (piece) out.push({ piece, noPattern: true, glsl: `vec3 col = uMain; col *= 0.92 + 0.08 * sin(vG.x * 180.0); col = mix(col, uSecond, step(0.7, abs(vG.y)) * 0.5); return col;` });
  if (has(it, 'band_ribbon')) {
    const pts2 = pts.map((p) => addV(p, nrm(subV(p, H.O)), -0.002));
    const m2 = new MeshHelper().sweep(pts2, { th: () => [hh * 0.02, 0.003], up: (i, p) => nrm(subV(p, H.O)), prof: 'flat', seg: 8 });
    out.push({ piece: pieceHelper(ctx, m2, { bone: 'Head' }), noPattern: true, glsl: 'return uAccent;' });
  }
  return out;
}
export function bonnet(ctx, it) {
  // a toddler's sun bonnet: a soft hood over the top and back, a wide ruffled brim framing the face, ties under the chin
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = { yF: H.eye + hh * 0.3, yB: H.eye - hh * 0.25 };
  // cut by a plane leaning back: the brim's root runs over the top front and down beside the cheeks
  const zcut = H.faceZ - hh * 0.22;
  const hood = (x, y, z) => {
    const d = H.f(x, y * 0.98, z) - (0.016 + 0.006 * clamp((y - b.yB) / hh));
    return Math.max(d, z - zcut - (y - H.eye) * 0.35, b.yB - y - Math.max(z, 0) * 0.6);
  };
  const parts = [{ f: loc(H, hood), box: box3(H, hw * 0.7, b.yB - hh * 0.25, H.top + 0.04, -H.hd * 0.7, H.hd * 0.6), id: 0 }];
  // the brim: a band standing out round the face opening
  const brim = (x, y, z) => {
    const pl = z - zcut - (y - H.eye) * 0.35;
    const sh = H.f(x, y, z) - 0.016;
    const reach = hh * 0.2 * (0.5 + 0.5 * clamp((y - H.chin) / (H.top - H.chin)));
    return Math.max(Math.abs(pl - 0.0) - 0.004, sh - reach, -sh - 0.004, b.yB - hh * 0.05 - y) * 0.85;
  };
  parts.push({ f: loc(H, brim), box: box3(H, hw * 0.85, b.yB - hh * 0.2, H.top + hh * 0.25, -H.hd * 0.3, H.hd * 0.9), id: 1 });
  if (has(it, 'chinstrap')) addChinstrap(ctx, H, parts, b, 7, { from: H.ear[1] - hh * 0.1 });
  const body = `if (id > 0.5 && id < 1.5) { col = uSecond; col = mix(col, uMain, 0.0); col *= 0.92 + 0.08 * stripes(vG.x, 0.008, 0.004); }
    if (id < 0.5) col = mix(col, uSecond, dotsHex(vG.xy, 0.02, 0.003) * 0.6);
    if (id > 6.5) col = uSecond;`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
export function plush_hat(ctx, it) {
  // the creature hat: a big round plush head over the head, face on the front, round ears and a leaf sprig
  const H = headHelper(ctx), hh = H.hh, hw = H.hw;
  const b = bandOf(H, 0.24, -0.06);
  const crown = crownHelper(H, { ...b, gB: 0.012, gT: 0.03 });
  const R = hw * 0.64, c = [0, H.top * 0.35, -hh * 0.03];
  const ball = (x, y, z) => ellD(x - c[0], y - c[1], z - c[2], R, hh * 0.5, H.hd * 0.62);
  const f = (x, y, z) => Math.max(sminK(ball(x, y, z), crown(x, y, z), 0.02), crown.band(z) - y);
  const topY = c[1] + hh * 0.5;
  const parts = [{ f: loc(H, f), box: box3(H, R + 0.03, b.yB - 0.03, topY + 0.03, c[2] - H.hd * 0.7, c[2] + H.hd * 0.7), id: 0 }];
  addEars(H, parts, topY, 5, true);
  const body = `float ang = vG.x / (uP[0].z * 0.5);
    col *= 0.96 + 0.04 * noise2(vG.xy / 0.004);
    vec2 q = vec2(vG.x, vG.y - uP[0].x - ${f3(hh * 0.2)});
    float fr = step(abs(ang), 1.2) * step(id, 0.5);
    col = mix(col, vec3(0.12), circle(vec2(abs(q.x), q.y), vec2(${f3(hh * 0.12)}, 0.0), ${f3(hh * 0.045)}) * fr);
    col = mix(col, vec3(1.0), circle(vec2(abs(q.x), q.y), vec2(${f3(hh * 0.11)}, ${f3(hh * 0.016)}), ${f3(hh * 0.014)}) * fr);
    col = mix(col, uAccent, line(length(q - vec2(0.0, ${f3(hh * 0.02)})), ${f3(hh * 0.05)}, 0.004) * step(q.y, ${f3(-hh * 0.01)}) * fr);
    col = mix(col, uSecond * 1.2 + 0.2, circle(vec2(abs(q.x), q.y), vec2(${f3(hh * 0.2)}, ${f3(-hh * 0.06)}), ${f3(hh * 0.035)}) * fr * 0.5);
    if (id > 4.5 && id < 5.5) col = uMain;
    if (id > 5.5) col = uSecond;`;
  return hatPieceHelper(ctx, it, H, parts, hatGLSL(it, body, { pattern: false }), { band: b.yF });
}
