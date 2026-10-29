// Anime hair (and beards) for generated people, as plain geometry: no three.js
// anywhere in this module's imports, so it runs in the people worker (worker.js)
// as well as on the page. hair.js makes the material and is the page's wrapper.
//
//   hairPieces(ctx, hair, { hatOn, look }) -> [{ piece: { mesh }, paint }]
//     hair: { style (hairstyles.js id), color (HAIR_COLORS id or '#hex'), color2, mix
//     ('tips' | 'streak' | 'ombre' | 'under'), highlight (true/false, else the style's),
//     length, volume, spikiness (multipliers / 0..1), bangs (FRINGES id), part ('left' |
//     'right' | 'center'), curl (0..1), ahoge (bool), facial (FACIAL id), facialColor, seed }
//
// How a style is made: everything is a field (sdf.js) in the person's A pose, meshed
// with surface nets and decimated, like wear.js' solids.
//  - the scalp cap: the cranium (rebuilt from the anatomy's landmarks) grown by the
//    hair's thickness (more on top and at the back), cut along a hairline that runs
//    over the forehead, dips at the temples, down to a sideburn, over the ear and
//    round to the nape;
//  - clumps: big flattened tapered cones along curves. Each curve is a little strand
//    simulation on the head: it starts on the scalp, is pulled down by gravity, rests
//    on the skull where the skull faces up (hair lies on the head and hangs free below
//    it), never goes into the head or the body (the body field ctx.f pushes it out,
//    shoulders and back included), can stand off the scalp and flick out at the tip
//    (spikes). The width profile ends in a sharp 20-40 degree point;
//  - bangs (several kinds) over the forehead stop above the eye line; side locks,
//    back clumps, crown spikes, flows over the top (slicked back, side part, quiff),
//    a mohawk crest, long falls down the back, ponytails, twin tails, braids, buns,
//    Joy-like loops, an afro and afro puffs (round lumps), curls, an ahoge, a toddler tuft;
//  - under a hat the hair above the hat's rim is pressed into a thin layer on the
//    skull (crown spikes, buns, tufts go), bangs and the hair at the sides and back
//    stay and stick out from under the brim;
//  - facial hair (FACIAL_STYLES): the face (ctx.f) grown by a few mm inside a region
//    (stubble, beards, chops) plus clumps (mustaches, an elder's long beard).
// Every vertex keeps paint coordinates (gco): across the clump (-1..1), along it (0
// root .. 1 tip), the clump's id (0..1) and its kind (0 cap, 1 clump, 2 hair tie,
// 3 bun, 4 facial, 5 curl lumps) + 0.5 on the clump's outer face; hair.js paints the
// two tones, the second colour, the strand lines and the highlight band from them
// and from the position relative to the head (paint.headC, paint.hh).
// Weights: the head moves the hair; below the chin it blends to the neck and from
// the shoulders down to Spine3, so long hair does not cut into the back when the
// head turns.
import { P, smin, smax, field, compile } from './sdf.js';
import { surfaceNets, project, decimate, relax, normals, smoothNormals } from './mesh.js';
import { BONE } from './rig.js';
import { clamp, sstep, lerp, rng, qfromTo } from './vmath.js';
import { HAIR_STYLES, HAIR_COLORS, FACIAL_STYLES, FRINGES, hairColor, shadeOf, lightOf } from './hairstyles.js';

export { HAIR_STYLES, HAIR_COLORS, FACIAL_STYLES, FRINGES };
const PI = Math.PI;

// ---------- small vector helpers (arrays) ----------
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  madd: (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
const DOWN = [0, -1, 0], UP = [0, 1, 0];
const tangent = (n, v) => V.norm(V.madd(v, n, -V.dot(v, n)));
// rotate v about unit axis k by angle a
const rot = (v, k, a) => { const c = Math.cos(a), s = Math.sin(a), d = V.dot(k, v), x = V.cross(k, v); return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)]; };
function gradOf(f, p, e = 4e-4) {
  const gx = f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]), gy = f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]), gz = f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e);
  return V.norm([gx, gy, gz]);
}

// ---------- the head ----------
// the cranium as the anatomy builds it (anatomy.js: head), the face below it, the
// hairline and helpers to place things on the scalp
function headOf(ctx) {
  const A = ctx.A, L = A.L, p = A.p || {}, hh = L.hh, hw = L.hw, hd = L.hd || hh * 0.9, hs = L.headShift || [0, 0, 0];
  const hhs = hh * (1 + 0.07 * (p.headH || 0)), fh = 1 + 0.05 * (p.forehead || 0);
  const C = [0, L.chinY + hh - 0.4 * hhs + hs[1], -0.03 * hh + hs[2]];
  const R = [hw * 0.5, 0.4 * hhs * fh, hd * 0.52];
  const skull = compile(smin(0.1 * hw, P.ellipsoid({ c: C, r: R }), P.ellipsoid({ c: [0, L.chinY + 0.38 * hh + hs[1], 0.09 * hh + hs[2]], r: [hw * 0.44, 0.38 * hh, 0.37 * hh] })));
  const H = { L, hh, hw, hd, C, R, hs, sk: skull.f, chinY: L.chinY + hs[1], eyeY: L.eyeY + hs[1], noseY: L.noseY ?? (L.eyeY - 0.13 * hh), body: ctx.f };
  H.Y = (v) => H.chinY + v * hh;
  H.ey = (H.eyeY - H.chinY) / hh;
  H.grad = (q) => gradOf(skull.f, q);
  // a point on the scalp in a direction from the cranium's centre: az round the head (0 front, + to the
  // person's left), el up from the horizontal
  H.dir = (az, el) => [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
  H.surf = (az, el) => {
    const d = H.dir(az, el);
    let a = 0, b = 1.4 * hh;
    for (let i = 0; i < 26; i++) { const m = (a + b) / 2; if (skull.f(C[0] + d[0] * m, C[1] + d[1] * m, C[2] + d[2] * m) < 0) a = m; else b = m; }
    return V.madd(C, d, (a + b) / 2);
  };
  // the outward direction for a clump's flat side: the scalp's normal near the head, out from
  // the body's axis further away (hair hanging down the back faces backwards)
  H.out = (q) => {
    const g = H.grad(q), e = skull.f(q[0], q[1], q[2]), ax = V.norm([q[0], 0, q[2] - C[2] + 0.02 * hh]);
    const k = sstep(0.02 * hh, 0.25 * hh, e) * sstep(C[1] - 0.1 * hh, C[1] - 0.5 * hh, q[1]);
    return V.norm(V.lerp(g, ax, k));
  };
  return H;
}

// the hairline: its height (hh from the chin) by |az|
const LINES = {
  std: [[0, 0.33], [0.5, 0.32], [0.85, 0.24], [1.12, 0.03], [1.28, -0.06], [1.45, 0.05], [1.7, 0.07], [1.95, -0.04], [2.4, -0.2], [PI, -0.24]],
  low: [[0, 0.29], [0.55, 0.28], [0.9, 0.2], [1.12, 0.01], [1.28, -0.08], [1.45, 0.03], [1.7, 0.05], [1.95, -0.06], [2.4, -0.22], [PI, -0.26]],
  high: [[0, 0.42], [0.35, 0.42], [0.7, 0.44], [1.0, 0.18], [1.25, 0.0], [1.45, 0.06], [1.7, 0.08], [1.95, -0.03], [2.4, -0.18], [PI, -0.22]],
  horseshoe: [[0, 0.9], [0.9, 0.9], [1.15, 0.1], [1.3, 0.0], [1.45, 0.06], [1.7, 0.08], [1.95, -0.03], [2.4, -0.18], [PI, -0.22]],
};
function lineY(H, line, az) {
  const t = LINES[line] || LINES.std, a = Math.min(Math.abs(az), PI);
  let i = 1; while (i < t.length - 1 && a > t[i][0]) i++;
  const [a0, v0] = t[i - 1], [a1, v1] = t[i], u = sstep(0, 1, (a - a0) / (a1 - a0));
  return H.eyeY + (v0 + (v1 - v0) * u) * H.hh;   // relative to the eye line
}

// ---------- elements: clumps and other shapes with paint coordinates ----------
// a clump: a polyline (resampled to `segs` segments by length) with half widths from a profile
const PROF = {
  spike: (s, b) => (1 - s) * (1 + b * s),
  blunt: (s) => (s < 0.8 ? 1 - 0.1 * s : 0.92 * Math.sqrt(Math.max(0, 1 - ((s - 0.8) / 0.2) ** 2)) * 0.85 + 0.07),
  ribbon: (s) => (s < 0.65 ? 1 - 0.2 * s : 0.87 * (1 - s) / 0.35),
  tail: (s) => (s < 0.25 ? 0.6 + 1.6 * s : (1 - s) / 0.75 * (1 + 0.5 * (1 - s))),
  round: (s) => Math.min(1, Math.min(s, 1 - s) * 8 + 0.5),
  lump: () => 1,
};
let IDS = 0;
function clump(H, pts, o = {}) {
  // resample by arc length
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + V.len(V.sub(pts[i], pts[i - 1])));
  const total = cum[cum.length - 1];
  if (total < 1e-4) return null;
  const n = o.segs || Math.max(3, Math.min(10, Math.round(total / (0.08 * H.hh)) + 2));
  const at = (s) => { const L0 = s * total; let i = 1; while (i < cum.length - 1 && cum[i] < L0) i++; const t = (L0 - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]); return V.lerp(pts[i - 1], pts[i], clamp(t)); };
  const prof = PROF[o.prof || 'spike'], w0 = o.w, flat = o.flat ?? 0.5, bul = o.bulge ?? 0.7;
  const S = new Float64Array(n * 18);
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  let rmax = 0;
  for (let k = 0; k < n; k++) {
    const s0 = k / n, s1 = (k + 1) / n, A = at(s0), B = at(s1), t = V.norm(V.sub(B, A));
    const mid = V.lerp(A, B, 0.5);
    let nn = o.normal ? (typeof o.normal === 'function' ? o.normal(mid, (s0 + s1) / 2) : o.normal) : H.out(mid);
    nn = V.madd(nn, t, -V.dot(nn, t));
    if (V.len(nn) < 1e-4) nn = Math.abs(t[1]) < 0.9 ? V.cross(t, UP) : V.cross(t, [1, 0, 0]);
    nn = V.norm(nn);
    const w = V.cross(t, nn);
    const rA = Math.max(0.0004, w0 * prof(s0, bul)), rB = Math.max(0.0004, w0 * prof(s1, bul));
    const ab = V.sub(B, A), l2 = Math.max(1e-12, V.dot(ab, ab));
    S.set([A[0], A[1], A[2], ab[0], ab[1], ab[2], 1 / l2, rA, rB, nn[0], nn[1], nn[2], w[0], w[1], w[2], s0, s1, Math.sqrt(l2)], 18 * k);
    rmax = Math.max(rmax, rA, rB);
    for (const q of [A, B]) for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], q[j]); mx[j] = Math.max(mx[j], q[j]); }
  }
  const box = [mn.map((v) => v - rmax - 0.002), mx.map((v) => v + rmax + 0.002)];
  const el = { kind: o.kind ?? 1, id: o.id ?? (((IDS++) * 0.61803398875) % 1), S, n, flat, box, total };
  el.f = (x, y, z) => clumpEval(el, x, y, z, null);
  el.coords = (x, y, z) => { const r = [0, 0, 0]; clumpEval(el, x, y, z, r); return r; };
  return el;
}
// distance to a clump (an elliptic tapered cone per segment, iq's ellipse bound across);
// out: [across (-1..1), along (0..1), outer (1 on the outer face)]
function clumpEval(el, x, y, z, out) {
  const S = el.S, fl = el.flat;
  let best = 1e9, bk = 0, bt = 0, ba = 0, bb = 0, br = 1;
  for (let k = 0, o = 0; k < el.n; k++, o += 18) {
    const ex = x - S[o], ey = y - S[o + 1], ez = z - S[o + 2];
    const dx = S[o + 3], dy = S[o + 4], dz = S[o + 5];
    let t = (ex * dx + ey * dy + ez * dz) * S[o + 6];
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ex - dx * tc, py = ey - dy * tc, pz = ez - dz * tc;
    const r = S[o + 7] + (S[o + 8] - S[o + 7]) * tc, rn = r * fl;
    const a = px * S[o + 9] + py * S[o + 10] + pz * S[o + 11], b = px * S[o + 12] + py * S[o + 13] + pz * S[o + 14];
    const u = (t - tc) * S[o + 17];
    const k0 = Math.sqrt((a / rn) ** 2 + (b / r) ** 2), k1 = Math.sqrt((a / (rn * rn)) ** 2 + (b / (r * r)) ** 2);
    let d = k1 < 1e-9 ? -rn : k0 * (k0 - 1) / k1;
    if (u !== 0) d = d > 0 ? Math.hypot(d, u) : Math.max(d, Math.abs(u) - 0);
    if (d < best) { best = d; bk = k; bt = tc; ba = a; bb = b; br = r; }
  }
  if (out) { const o = 18 * bk; out[0] = clamp(bb / br, -1, 1); out[1] = S[o + 15] + (S[o + 16] - S[o + 15]) * bt; out[2] = ba > 0 ? 1 : 0; }
  return best;
}
// any field as an element (buns, afro lumps, ties, the cap): coords(x, y, z) -> [u, v, outer]
function fieldEl(f, box, kind, coords, id) {
  return { kind, id: id ?? (((IDS++) * 0.61803398875) % 1), f, box, coords: coords || (() => [0, 0, 1]) };
}
function sdfEl(tree, kind, coords, id) { const c = compile(tree); return fieldEl(c.f, c.box, kind, coords, id); }

// ---------- strands: a curve over the head ----------
// o: { p0, d0, len, steps, stopY (number or (p) => y), h0 (standoff over the skull at the root), rise (more at
// the tip, m), risePow, hug (0..1: pulled onto the skull where it faces up), grav (0..1), flick (bend out
// towards the tip), flickFrom, clear (s) -> distance to keep from the body }
function strand(H, o) {
  const steps = o.steps || 22, len = o.len, ds = len / steps, f = H.sk, B = H.body;
  const pts = [o.p0];
  let p = o.p0, d = V.norm(o.d0);
  const grav = o.grav ?? 0.5, hug = o.hug ?? 0.5, h0 = o.h0 ?? 0, rise = o.rise ?? 0, rp = o.risePow ?? 2, flick = o.flick ?? 0, ff = o.flickFrom ?? 0.5;
  for (let i = 1; i <= steps; i++) {
    const s = i / steps;
    if (grav) d = V.norm(V.madd(d, DOWN, grav * 3 / steps));
    if (flick && s > ff) d = V.norm(V.madd(d, H.out(p), flick * 3 / steps));
    let q = V.madd(p, d, ds);
    // rest on the scalp / stand off it
    const want = h0 + rise * Math.pow(s, rp), e = f(q[0], q[1], q[2]), n = H.grad(q);
    if (e < want) q = V.madd(q, n, want - e);
    else if (hug > 0 && e - want < 0.3 * H.hh) q = V.madd(q, n, -(e - want) * hug * clamp(0.3 + n[1] * 1.5));
    // out of the body (face, ears, neck, shoulders, back)
    const need = o.clear ? o.clear(s) : 0.004;
    for (let it = 0; it < 3; it++) {
      const fb = B(q[0], q[1], q[2]);
      if (fb >= need) break;
      q = V.madd(q, gradOf(B, q), need - fb);
    }
    const stopY = typeof o.stopY === 'function' ? o.stopY(q) : o.stopY;
    if (stopY !== undefined && q[1] < stopY) {
      const t = (p[1] - stopY) / Math.max(1e-6, p[1] - q[1]);
      if (t > 0.05) pts.push(V.lerp(p, q, t));
      break;
    }
    d = V.norm(V.sub(q, p));
    p = q; pts.push(q);
  }
  return pts;
}
// the frame on the scalp at (az, el): point, normal, east (round the head, +az), south (down the meridian)
function spot(H, az, el, lift = 0) {
  let p = H.surf(az, el);
  const n = H.grad(p);
  p = V.madd(p, n, lift);
  let east = V.cross(UP, n); if (V.len(east) < 1e-3) east = [Math.cos(az), 0, -Math.sin(az)];
  east = V.norm(east);
  const south = V.norm(V.cross(east, n));
  return { p, n, east, south };
}

// ---------- the parts of a style ----------
// all sizes in head heights (hh), heights `to` in hh from the chin (negative: below the chin)
function capPart(H, o, S) {
  const hh = H.hh, C = H.C, t = (o.t ?? 0.07) * S.vol, top = (o.top ?? 0.04) * S.vol, back = (o.back ?? 0.03) * S.vol, line = o.line || 'std';
  const sk = H.sk, lineOff = (o.front ?? 0) * hh;
  const LY = new Float64Array(181);
  for (let i = 0; i <= 180; i++) LY[i] = lineY(H, line, (i / 180) * PI) + (i < 60 ? lineOff * (1 - i / 60) : 0) + (o.nape ?? 0) * hh * sstep(100, 180, i);
  const ly = (x, z) => { const a = Math.abs(Math.atan2(x, z - C[2])) / PI * 180, i = Math.min(179, Math.floor(a)); return LY[i] + (LY[i + 1] - LY[i]) * (a - i); };
  const horse = line === 'horseshoe';
  const f = (x, y, z) => {
    const dx = x - C[0], dy = y - C[1], dz = z - C[2], l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const yl = ly(x, z);
    const T = hh * (t + top * Math.max(0, dy / l) + back * Math.max(0, -dz / l)) * (0.3 + 0.7 * sstep(0, 0.12 * hh, y - yl));
    let d = sk(x, y, z) - T;
    d = Math.max(d, yl - y);
    if (horse) d = Math.max(d, y - (C[1] + 0.12 * hh));
    return d;
  };
  const r = Math.max(...H.R) + hh * (t + top + back) + 0.02;
  return fieldEl(f, [[C[0] - r, H.chinY - 0.3 * hh, C[2] - r], [C[0] + r, C[1] + r, C[2] + r]], 0, (x, y, z) => [Math.atan2(x, z - C[2]) / PI, 0, 1], 0.5);
}

function fringePart(H, o, S, out) {
  const hh = H.hh, hw = H.hw, R = S.rand, kind = o.kind || 'straight';
  const F = { ...(FRINGES[kind] || FRINGES.straight), ...o };
  if (F.n === 0) return;
  const n = F.n, spread = F.spread ?? 0.75, side = S.part === 'right' ? -1 : 1;
  for (let i = 0; i < n; i++) {
    let u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    if (F.parted && Math.abs(u) < 0.2) u = Math.sign(u || 1) * 0.2;
    const az = u * spread + (F.shift ?? 0) * side + (R() - 0.5) * 0.06;
    const el = (F.el ?? 0.95) - 0.12 * u * u;
    const sp = spot(H, az, el, -0.01 * hh);
    // sweep: rotate the downward flow round the normal
    let sweep = (F.sweep ?? 0) * side;
    if (F.parted) sweep = Math.sign(u) * (F.partSweep ?? 0.45);
    sweep += (F.fan ?? 0.25) * u + (R() - 0.5) * (F.jitter ?? 0.1);
    const d0 = rot(sp.south, sp.n, -sweep);
    // where it stops: above the eyes in front, lower at the sides (beside the eyes)
    const lenK = 1 + (R() - 0.5) * (F.vary ?? 0.15);
    const to = F.to ?? 0.12, toSide = F.toSide ?? to - 0.12;
    const stopY = (q) => {
      const ax = Math.abs(q[0]) / hw;
      const k = sstep(0.32, 0.55, ax);
      let y = H.eyeY + lerp(to, toSide, k) * hh;
      if (F.parted) y += (F.centre ?? 0.1) * hh * (1 - sstep(0.05, 0.25, ax));
      if (F.longSide) y += -F.longSide * hh * sstep(0, 1, (q[0] * side) / hw + 0.3);
      return y + (lenK - 1) * 0.5 * hh;
    };
    const pts = strand(H, { p0: sp.p, d0, len: (F.len ?? 0.7) * hh, stopY, h0: S.t * hh * 0.55, rise: (F.lift ?? 0.02) * hh, hug: F.hug ?? 0.85, grav: F.grav ?? 0.25, flick: (F.flick ?? 0.05) + 0.25 * S.spiky * (F.spikyK ?? 1), flickFrom: 0.6, clear: (s) => 0.003 + (F.w ?? 0.12) * hh * (F.flat ?? 0.45) * (1 - s) * 0.6 });
    const w = (F.w ?? 0.12) * hh * S.vol * (1 + (R() - 0.5) * 0.25) * (Math.abs(u) > 0.7 ? 0.9 : 1);
    out.push(clump(H, pts, { w, flat: F.flat ?? 0.42, prof: F.prof || 'spike', bulge: F.bulge ?? 0.6 }));
  }
}

function sidesPart(H, o, S, out) {
  const hh = H.hh, R = S.rand, n = o.n ?? 2;
  for (const m of [1, -1]) for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    const az = m * lerp(o.az0 ?? 1.0, o.az1 ?? 1.45, k), el = lerp(o.el0 ?? 0.75, o.el1 ?? 0.55, k);
    const sp = spot(H, az, el, -0.01 * hh);
    const to = lenTo(o.to ?? 0.25, S) + (R() - 0.5) * 0.08 + (o.stagger ?? 0) * k;
    const d0 = rot(sp.south, sp.n, m * (o.sweep ?? -0.1));
    const pts = strand(H, { p0: sp.p, d0, len: 3 * hh, stopY: H.Y(to), h0: S.t * hh * 0.5, rise: (o.lift ?? 0.02) * hh, hug: o.hug ?? 0.6, grav: o.grav ?? 0.6, flick: (o.flare ?? 0.1) + 0.5 * S.spiky * (o.spikyK ?? 1), flickFrom: o.flickFrom ?? 0.55, clear: (s) => 0.004 + (o.w ?? 0.13) * hh * 0.4 * (1 - s) });
    out.push(clump(H, pts, { w: (o.w ?? 0.13) * hh * S.vol * (1 + (R() - 0.5) * 0.2), flat: o.flat ?? 0.45, prof: o.prof || 'spike', bulge: o.bulge ?? 0.5 }));
  }
}

function backPart(H, o, S, out) {
  const hh = H.hh, R = S.rand, n = o.n ?? 5, rows = o.rows ?? 1;
  for (let row = 0; row < rows; row++) for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    const az = lerp(o.az0 ?? 1.55, -(o.az0 ?? 1.55), k) + PI * (lerp(o.az0 ?? 1.55, -(o.az0 ?? 1.55), k) >= 0 ? 0 : 0) ;
    // spread across the back: from the left side round the back to the right side
    const a = (o.az0 ?? 1.55) + (2 * PI - 2 * (o.az0 ?? 1.55)) * k + (row ? 0.5 / n : 0) * PI + (R() - 0.5) * 0.08;
    const el = (row ? (o.el2 ?? 0.95) : (o.el ?? 0.5)) + (R() - 0.5) * 0.08;
    void az;
    const sp = spot(H, a, el, -0.01 * hh);
    const to = lenTo((o.to ?? 0) + (row ? (o.to2 ?? 0.08) : 0), S) + (R() - 0.5) * (o.vary ?? 0.08) - (o.mid ?? 0) * (1 - Math.abs(k * 2 - 1));
    const d0 = rot(sp.south, sp.n, (R() - 0.5) * 0.2);
    const pts = strand(H, { p0: sp.p, d0, len: 3.5 * hh, stopY: H.Y(to), h0: S.t * hh * 0.5, rise: (o.lift ?? 0.03) * hh, hug: o.hug ?? 0.6, grav: o.grav ?? 0.55, flick: (o.flare ?? 0.12) + 0.6 * S.spiky * (o.spikyK ?? 1), flickFrom: o.flickFrom ?? 0.5, clear: (s) => 0.004 + (o.w ?? 0.15) * hh * 0.4 * (1 - s) });
    out.push(clump(H, pts, { w: (o.w ?? 0.15) * hh * S.vol * (1 + (R() - 0.5) * 0.2), flat: o.flat ?? 0.45, prof: o.prof || 'spike', bulge: o.bulge ?? 0.5 }));
  }
}

function crownPart(H, o, S, out) {
  const hh = H.hh, R = S.rand, n = o.n ?? 8;
  const wz = H.surf(o.az ?? PI, o.el ?? 1.2);   // the whorl
  for (let i = 0; i < n; i++) {
    const ph = (i / n) * 2 * PI + (R() - 0.5) * 0.4;
    const el = (o.el ?? 1.2) - (o.ring ?? 0.35) * (0.6 + 0.4 * R()) * (0.5 + 0.5 * Math.cos(ph));
    const az = (o.az ?? PI) + (o.ring ?? 0.35) * 1.6 * Math.sin(ph);
    const sp = spot(H, az, el, -0.005 * hh);
    const away = tangent(sp.n, V.sub(sp.p, wz));
    const up = o.up ?? 0.5;
    const d0 = V.norm(V.add(V.mul(sp.n, up), V.mul(V.norm(V.add(away, V.mul(sp.south, 0.4))), 1 - up)));
    const len = (o.len ?? 0.3) * hh * (0.75 + 0.5 * R()) * S.lenK;
    const pts = strand(H, { p0: sp.p, d0, len, steps: 10, h0: 0, hug: 0, grav: o.grav ?? 0.15, flick: 0.1 * S.spiky });
    out.push(clump(H, pts, { w: (o.w ?? 0.1) * hh * S.vol, flat: o.flat ?? 0.6, prof: 'spike', bulge: 0.4, segs: 4 }));
  }
}

function topPart(H, o, S, out) {
  const hh = H.hh, R = S.rand, n = o.n ?? 5, flow = o.flow || 'back', side = S.part === 'right' ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1), u = k * 2 - 1;
    let sp, d0;
    if (flow === 'side') {
      // from the parting line over the top towards the other side and down
      const el = lerp(0.9, 1.35, k), az = side * (o.partAz ?? 0.42) / Math.max(0.3, Math.cos(el - 0.6));
      sp = spot(H, az, el, -0.005 * hh);
      d0 = V.norm(V.add(V.mul(sp.east, -side), V.mul(sp.south, 0.15)));
    } else {
      const az = u * (o.spread ?? 0.65), el = (o.el ?? 0.82) - 0.1 * u * u;
      sp = spot(H, az, el, -0.005 * hh);
      const back = V.mul(sp.south, -1);
      d0 = flow === 'up' ? V.norm(V.add(V.mul(sp.n, o.up ?? 0.9), back)) : flow === 'forward' ? V.norm(V.add(sp.south, V.mul(sp.east, u * 0.3))) : V.norm(V.add(back, V.mul(sp.east, u * 0.25)));
    }
    const len = (o.len ?? 0.8) * hh * (0.9 + 0.2 * R()) * (flow === 'side' ? 1 : S.lenK ** 0.3);
    const pts = strand(H, { p0: sp.p, d0, len, h0: S.t * hh * 0.6, rise: (o.lift ?? 0.03) * hh, risePow: o.risePow ?? 2, hug: o.hug ?? 0.9, grav: o.grav ?? 0.12, flick: (o.flick ?? 0.08) + 0.4 * S.spiky, flickFrom: 0.6, stopY: H.Y(o.to ?? 0.2) });
    out.push(clump(H, pts, { w: (o.w ?? 0.13) * hh * S.vol, flat: o.flat ?? 0.42, prof: o.prof || 'spike', bulge: 0.6 }));
  }
}

function mohawkPart(H, o, S, out) {
  const hh = H.hh, R = S.rand, n = o.n ?? 6;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1), ang = lerp(0.95, PI - 0.6, k);   // over the top, front to back
    const el = ang <= PI / 2 ? ang : PI - ang, az = ang <= PI / 2 ? 0 : PI;
    const sp = spot(H, az, el, -0.005 * hh);
    const d0 = V.norm(V.add(sp.n, V.mul(sp.south, ang <= PI / 2 ? -0.7 : 0.7)));
    const pts = strand(H, { p0: sp.p, d0, len: (o.len ?? 0.22) * hh * (0.85 + 0.3 * R()) * (1 - 0.3 * Math.abs(k - 0.4)), steps: 8, h0: 0, hug: 0, grav: 0.2 });
    out.push(clump(H, pts, { w: (o.w ?? 0.12) * hh * S.vol, flat: 0.35, prof: 'spike', bulge: 0.5, normal: [1, 0, 0], segs: 4 }));
  }
}

function fallPart(H, o, S, out) {
  const hh = H.hh, R = S.rand, n = o.n ?? 7, to = lenTo(o.to ?? -1.2, S);
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    const a = (o.az0 ?? 1.35) + (2 * PI - 2 * (o.az0 ?? 1.35)) * k;
    const sp = spot(H, a, (o.el ?? 0.55) + (R() - 0.5) * 0.1, -0.01 * hh);
    const d0 = rot(sp.south, sp.n, (k - 0.5) * (o.fan ?? -0.3));
    const tipY = H.Y(to + (R() - 0.5) * 0.12 - (o.v ?? 0.15) * (1 - Math.abs(k * 2 - 1)));
    const pts = strand(H, { p0: sp.p, d0, len: 6 * hh, steps: 30, stopY: tipY, h0: S.t * hh * 0.4, rise: 0.02 * hh, hug: 0.7, grav: 0.7, flick: (o.flare ?? 0.03) + 0.2 * S.spiky, flickFrom: 0.75, clear: (s) => 0.006 + (o.w ?? 0.2) * hh * 0.32 * (1 - 0.5 * s) });
    out.push(clump(H, pts, { w: (o.w ?? 0.2) * hh * S.vol * (0.9 + 0.2 * R()), flat: o.flat ?? 0.32, prof: o.prof || 'ribbon' }));
  }
  // locks falling in front of the shoulders
  for (let j = 0; j < (o.front ?? 0); j++) for (const m of [1, -1]) {
    const sp = spot(H, m * (1.25 + 0.15 * j), 0.5, -0.01 * hh);
    const pts = strand(H, { p0: sp.p, d0: V.norm(V.add(sp.south, [0, 0, 0.3])), len: 6 * hh, steps: 30, stopY: H.Y(to + 0.25 + 0.1 * j), h0: S.t * hh * 0.4, rise: 0.02 * hh, hug: 0.6, grav: 0.7, flick: 0.04, flickFrom: 0.75, clear: (s) => 0.008 + (o.w ?? 0.2) * hh * 0.3 });
    out.push(clump(H, pts, { w: (o.w ?? 0.2) * hh * 0.75 * S.vol, flat: o.flat ?? 0.35, prof: 'ribbon' }));
  }
}

// a tie point on the scalp: point, out direction
function tiePoint(H, az, el, S, lift = 0.04) { const sp = spot(H, az, el, 0); return { ...sp, p: V.madd(sp.p, sp.n, (S.t * 0.8 + lift) * H.hh) }; }
function tieEl(H, at, dir, r, S) {
  const a = V.madd(at, dir, -0.035 * H.hh), b = V.madd(at, dir, 0.02 * H.hh);
  return clump(H, [a, b], { w: r, flat: 1, prof: 'lump', kind: 2, segs: 1, normal: Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : UP });
}
function tailPart(H, o, S, out) {
  const hh = H.hh, R = S.rand, tp = tiePoint(H, o.az ?? PI, o.el ?? 0.6, S, o.out ?? 0.03), n = o.n ?? 5;
  const dir = V.norm(V.add(tp.n, V.mul(UP, o.lift ?? 0.3)));
  if (o.tie !== false) out.push(tieEl(H, tp.p, dir, (o.w ?? 0.12) * hh * 0.62, S));
  const to = lenTo(o.to ?? -0.4, S);
  const side = V.norm(V.cross(dir, UP)), up2 = V.norm(V.cross(side, dir));
  for (let i = 0; i < n; i++) {
    const ph = (i / n) * 2 * PI + R() * 0.5, sp = 0.4 * (o.fanK ?? 1);
    const d0 = V.norm(V.add(dir, V.add(V.mul(side, Math.cos(ph) * sp), V.mul(up2, Math.sin(ph) * sp * 0.6 + 0.15))));
    const p0 = V.madd(V.madd(tp.p, side, Math.cos(ph) * 0.02 * hh), up2, Math.sin(ph) * 0.02 * hh);
    const pts = strand(H, { p0, d0, len: Math.max(0.3, (to < 0 ? 1.0 - to : 0.6)) * hh * (o.lenK ?? 1.4), steps: 24, stopY: H.Y(to + (R() - 0.5) * 0.15), h0: 0.02 * hh, hug: 0, grav: o.grav ?? 0.45, flick: (o.flare ?? 0.06) + 0.4 * S.spiky, flickFrom: 0.7, clear: (s) => 0.006 + (o.w ?? 0.12) * hh * 0.5 });
    out.push(clump(H, pts, { w: (o.w ?? 0.12) * hh * S.vol * (0.85 + 0.3 * R()), flat: o.flat ?? 0.6, prof: 'tail' }));
  }
}

function braidPart(H, o, S, out) {
  const hh = H.hh, tp = tiePoint(H, o.az ?? PI, o.el ?? 0.3, S, 0.0), to = lenTo(o.to ?? -0.9, S), w = (o.w ?? 0.075) * hh * S.vol;
  const dir = V.norm(V.add(tp.n, V.mul(DOWN, 0.6)));
  const path = strand(H, { p0: tp.p, d0: dir, len: 5 * hh, steps: 36, stopY: H.Y(to), h0: 0.02 * hh, hug: 0.5, grav: 0.8, clear: () => 0.008 + w });
  const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + V.len(V.sub(path[i], path[i - 1])));
  const total = cum[cum.length - 1], at = (L0) => { let i = 1; while (i < cum.length - 1 && cum[i] < L0) i++; return V.lerp(path[i - 1], path[i], clamp((L0 - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]))); };
  const step = w * 1.25, id = S.rand();
  // the plaits: lumps leaning left and right in turn
  for (let L0 = 0, k = 0; L0 < total - step * 0.8; L0 += step, k++) {
    const s = L0 / total, a = at(L0), b = at(Math.min(total, L0 + step * 1.6)), t = V.norm(V.sub(b, a));
    const n = H.out(a), sd = V.norm(V.cross(t, n)), m = k % 2 ? 1 : -1, r = w * (1 - 0.3 * s);
    out.push(clump(H, [V.madd(a, sd, m * r * 0.55), V.madd(b, sd, -m * r * 0.45)], { w: r, flat: 0.62, prof: 'lump', segs: 1, id, normal: n }));
  }
  const end = at(total), t = V.norm(V.sub(end, at(total - step)));
  out.push(tieEl(H, end, t, w * 0.7, S));
  for (const m of [-1, 0, 1]) out.push(clump(H, [V.madd(end, t, 0.01 * hh), V.madd(V.madd(end, t, 0.14 * hh), H.out(end), 0.0), V.madd(end, V.norm(V.add(t, [m * 0.3, 0, 0])), 0.2 * hh)], { w: w * 0.75, flat: 0.6, prof: 'spike', segs: 3, id }));
  // the root: a short tail into the scalp
  out.push(clump(H, [V.madd(tp.p, tp.n, -0.04 * hh), at(Math.min(total, step))], { w: w * 1.05, flat: 0.7, prof: 'lump', segs: 1, id }));
}

function bunPart(H, o, S, out) {
  const hh = H.hh, r = (o.r ?? 0.2) * hh * S.vol, tp = tiePoint(H, o.az ?? PI, o.el ?? 1.0, S, 0);
  const c = V.madd(tp.p, tp.n, r * 0.62), q = qfromTo([0, 1, 0], tp.n);
  const tree = smin(0.01 * hh, P.ellipsoid({ c, r: [r, r * 0.82, r], q }), P.torus({ c: V.madd(c, tp.n, -r * 0.1), R: r * 0.72, r: r * 0.36, q }));
  const ax = tp.n, e1 = V.norm(V.cross(ax, Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : UP)), e2 = V.cross(ax, e1);
  out.push(sdfEl(tree, 3, (x, y, z) => { const d = [x - c[0], y - c[1], z - c[2]]; return [Math.atan2(V.dot(d, e2), V.dot(d, e1)) / PI, clamp(0.5 + V.dot(d, ax) / (2 * r)), 1]; }));
  if (o.tie) out.push(sdfEl(P.torus({ c: V.madd(c, tp.n, -r * 0.62), R: r * 0.55, r: 0.022 * hh, q }), 2));
}

// round lumps (afro, puffs, curls): a body plus balls over its surface
function lumpsOver(H, centre, rad, n, br, S, cut) {
  const kids = [P.ellipsoid({ c: centre, r: rad })];
  const ga = PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), th = ga * i;
    const d = [Math.cos(th) * rr, y, Math.sin(th) * rr];
    const p = [centre[0] + d[0] * rad[0] * 0.93, centre[1] + d[1] * rad[1] * 0.93, centre[2] + d[2] * rad[2] * 0.93];
    if (cut && !cut(p)) continue;
    kids.push(P.sphere({ c: p, r: br * (0.85 + 0.3 * S.rand()) }));
  }
  return smin(br * 0.25, kids);
}
function afroPart(H, o, S, out) {
  const hh = H.hh, k = (o.r ?? 1) * S.vol, C = H.C;
  const centre = [0, C[1] + 0.1 * hh * k, C[2] - 0.06 * hh * k], rad = [H.R[0] + 0.24 * hh * k, H.R[1] + 0.2 * hh * k, H.R[2] + 0.2 * hh * k];
  const tree = lumpsOver(H, centre, rad, o.bumps ?? 46, 0.13 * hh * k, S);
  const c = compile(tree), LYf = (x, z) => lineY(H, 'std', Math.atan2(x, z - C[2]));
  const fz = H.C[2] + H.R[2] * 0.55;
  out.push(fieldEl((x, y, z) => Math.max(c.f(x, y, z), LYf(x, z) - y, (z - fz) - (y - (H.eyeY + 0.25 * hh)) * 0.8), c.box, 5));
}
function puffPart(H, o, S, out) {
  const hh = H.hh, tp = tiePoint(H, o.az ?? 1.3, o.el ?? 0.9, S, 0), r = (o.r ?? 0.26) * hh * S.vol;
  const centre = V.madd(tp.p, tp.n, r * 0.8);
  out.push(sdfEl(lumpsOver(H, centre, [r, r * 0.92, r], 22, r * 0.36, S), 5));
  out.push(sdfEl(P.torus({ c: V.madd(tp.p, tp.n, r * 0.05), R: r * 0.42, r: 0.025 * hh, q: qfromTo([0, 1, 0], tp.n) }), 2));
}
function curlsPart(H, o, S, out) {
  const hh = H.hh, C = H.C, line = S.line, br = (o.r ?? 0.1) * hh, t = S.t * S.vol;
  const rad = [H.R[0] + t * hh * 0.85, H.R[1] + t * hh * 0.9 + 0.02 * hh, H.R[2] + t * hh * 0.85];
  const cut = (p) => p[1] > lineY(H, line, Math.atan2(p[0], p[2] - C[2])) + 0.03 * hh;
  const tree = lumpsOver(H, [C[0], C[1] + 0.015 * hh, C[2] - 0.01 * hh], rad, o.n ?? 60, br, S, cut);
  const c = compile(tree);
  out.push(fieldEl((x, y, z) => Math.max(c.f(x, y, z), lineY(H, line, Math.atan2(x, z - C[2])) - y - 0.04 * hh), c.box, 5));
}
// Joy-like loops: a lock from behind each temple down past the jaw and up again into a ring
function loopsPart(H, o, S, out) {
  const hh = H.hh, r = (o.r ?? 0.34) * hh * S.lenK ** 0.5, w = (o.w ?? 0.085) * hh * S.vol;
  for (const m of [1, -1]) {
    const sp = spot(H, m * (o.az ?? 1.75), o.el ?? 0.35, S.t * 0.4 * hh);
    const c = V.add(sp.p, [m * (r * 0.55 + 0.05 * hh), -r * 0.95, 0.04 * hh]);
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const th = PI / 2 + m * 0.35 - m * (i / 28) * 2 * PI * 0.97;
      let q = V.add(c, [Math.cos(th) * r * 0.85, Math.sin(th) * r, 0]);
      const fb = H.body(q[0], q[1], q[2]);
      if (fb < w) q = V.madd(q, gradOf(H.body, q), w - fb);
      pts.push(q);
    }
    pts.unshift(V.madd(sp.p, sp.n, -0.03 * hh));
    out.push(clump(H, pts, { w, flat: 0.62, prof: 'round', segs: 14 }));
  }
}
function ahogePart(H, o, S, out) {
  const hh = H.hh, sp = spot(H, o.az ?? 0.25, o.el ?? 1.25, S.t * hh * 0.5), f = V.mul(sp.south, -1);
  const pts = [V.madd(sp.p, sp.n, -0.03 * hh), V.madd(V.madd(sp.p, sp.n, 0.1 * hh), f, -0.02 * hh), V.madd(V.madd(sp.p, sp.n, 0.2 * hh), f, 0.04 * hh), V.madd(V.madd(sp.p, sp.n, 0.2 * hh), f, 0.12 * hh), V.madd(V.madd(sp.p, sp.n, 0.13 * hh), f, 0.17 * hh)];
  out.push(clump(H, pts, { w: (o.w ?? 0.045) * hh, flat: 0.5, prof: 'spike', bulge: 0.3, segs: 6, normal: sp.east }));
}

// lengths below the chin scale with the length slider
const lenTo = (to, S) => (to < 0 ? to * S.lenK : to - (1 - S.lenK) * 0.15);

// ---------- facial hair ----------
function facialParts(H, ctx, id, S) {
  const F = FACIAL_STYLES.find((f) => f.id === id);
  if (!F || id === 'none') return [];
  const hh = H.hh, hw = H.hw, B = H.body, out = [], o = F.params || {};
  const mouthY = H.chinY + (o.mouthK ?? 0.2) * hh, noseY = H.noseY;
  // the face grown by t inside a region
  const region = (t, reg) => {
    const box = [[-0.62 * hw, H.chinY - 0.2 * hh, H.C[2] - 0.1 * hh], [0.62 * hw, noseY + 0.05 * hh, H.C[2] + 0.75 * hh]];
    return fieldEl((x, y, z) => Math.max(B(x, y, z) - t, reg(x, y, z)), box, 4);
  };
  const mouth = (x, y, z) => 1 - Math.hypot(x / (0.2 * hw), (y - mouthY) / (0.05 * hh));   // > 0 inside the mouth area
  const jawLine = (x, y) => {   // the beard's top edge: from the sideburn at the ear, under the cheekbone, to beside the nose
    const ax = Math.abs(x) / hw;
    return lerp(noseY - 0.06 * hh, H.eyeY - 0.04 * hh, sstep(0.22, 0.46, ax)) - y;
  };
  const underChin = (x, y, z) => (H.chinY - 0.1 * hh) - y + Math.max(0, H.C[2] + 0.1 * hh - z) * 0.6;   // not down the neck
  const kind = F.kind;
  if (kind === 'stubble' || kind === 'beard' || kind === 'chops' || kind === 'long') {
    const t = kind === 'stubble' ? 0.0025 : (o.t ?? 0.035) * hh;
    out.push(region(t, (x, y, z) => {
      let d = Math.max(-jawLine(x, y), underChin(x, y, z), (H.C[2] - 0.05 * hh) - z);
      if (kind === 'chops') d = Math.max(d, 0.26 * hw - Math.abs(x));
      else d = Math.max(d, mouth(x, y, z) * 0.01);
      return d;
    }));
  }
  const fz = (x, y) => { let z = H.C[2] + 0.8 * hh; for (let i = 0; i < 40; i++) { const d = B(x, y, z); if (d < 1e-4) break; z -= Math.max(d, 1e-4); } return z; };
  const onFace = (x, y, off) => [x, y, fz(x, y) + off];
  if (kind === 'mustache' || kind === 'beard' || kind === 'long' || o.mustache) {
    for (const m of [1, -1]) {
      const pts = [onFace(m * 0.02 * hw, noseY - 0.05 * hh, 0.004), onFace(m * 0.14 * hw, noseY - 0.07 * hh, 0.006), onFace(m * 0.24 * hw, mouthY + 0.0 * hh, 0.006), onFace(m * (o.wide ?? 0.3) * hw, mouthY - (o.droop ?? 0.06) * hh, 0.006)];
      out.push(clump(H, pts, { w: (o.mw ?? 0.05) * hh, flat: 0.55, prof: 'spike', bulge: 0.8, kind: 4, normal: [0, 0, 1] }));
    }
  }
  if (kind === 'goatee' || o.goatee) {
    const pts = [onFace(0, mouthY - 0.06 * hh, 0.004), onFace(0, H.chinY + 0.03 * hh, 0.006), [0, H.chinY - 0.05 * hh, fz(0, H.chinY + 0.04 * hh) - 0.01 * hh], [0, H.chinY - (o.len ?? 0.1) * hh, fz(0, H.chinY + 0.04 * hh) - 0.025 * hh]];
    out.push(clump(H, pts, { w: 0.09 * hh, flat: 0.55, prof: 'spike', bulge: 0.5, kind: 4, normal: [0, 0, 1] }));
  }
  if (kind === 'long') {
    const z0 = fz(0, H.chinY + 0.08 * hh);
    const pts = [[0, H.chinY + 0.12 * hh, z0 - 0.08 * hh], [0, H.chinY - 0.05 * hh, z0 + 0.0 * hh], [0, H.chinY - 0.35 * hh, z0 + 0.03 * hh], [0, H.chinY - (o.len ?? 0.75) * hh, z0 + 0.0 * hh]];
    for (const q of pts) { const fb = B(q[0], q[1], q[2]); if (fb < 0.02 * hh) q[2] += 0.02 * hh - fb; }
    out.push(clump(H, pts, { w: 0.26 * hh, flat: 0.45, prof: 'spike', bulge: 0.5, kind: 4, normal: [0, 0, 1] }));
  }
  return out.filter(Boolean);
}

// ---------- assembling ----------
function weightsOf(H, ctx) {
  const L = ctx.A.L, hb = BONE.Head, nb = BONE.Neck, sb = BONE.Spine3;
  const yH = H.chinY - 0.1 * H.hh, yS = L.shY + 0.01;
  return (x, y) => {
    const t = sstep(yS, yH, y), u = sstep(yS - 0.12 * H.hh, yS + 0.05, y);
    const wh = t, wn = (1 - t) * u * 0.6, ws = 1 - wh - wn;
    return [[hb, wh], [nb, wn], [sb, ws]];
  };
}

function meshOf(H, ctx, els, o) {
  const hh = H.hh;
  const kids = els.map((e) => field(e.f, e.box));
  let tree = kids.length === 1 ? kids[0] : smin(o.k ?? 0.012 * hh, kids);
  const base = compile(tree);
  let f = base.f;
  const cuts = [];
  // never over the eyes
  if (o.eyeGuard !== false) {
    const gy0 = H.eyeY - 0.11 * hh, gy1 = H.eyeY + 0.085 * hh, gx = 0.46 * H.hw, gz = H.C[2] + 0.1 * hh;
    cuts.push((x, y, z) => -Math.min(gx - Math.abs(x), y - gy0, gy1 - y, z - gz));
  }
  // under a hat: above its rim only a thin layer on the skull
  if (o.hatOn) {
    const L = ctx.A.L, c = L.headC, y0 = c[1] + 0.02 * hh, n = V.norm([0, -1, 0.35]), tf = 0.022 * hh;
    cuts.push((x, y, z) => Math.min(-(n[1] * (y - y0) + n[2] * z), H.sk(x, y, z) - tf));
  }
  if (cuts.length) { const g = f; f = (x, y, z) => { let d = g(x, y, z); for (const c of cuts) { const e = c(x, y, z); if (e > d) d = e; } return d; }; }
  const box = base.box.map((b) => b.slice());
  let m = surfaceNets(f, box, o.cell, { B: 4 });
  if (!m.idx.length) return null;
  project(m, f, 2);
  if (m.pos.length / 3 > o.verts) m = decimate(m, o.verts);
  relax(m, 1, 0.35, f);
  // out of the body by a hair's breadth
  const Pm = m.pos, nv = Pm.length / 3, B = ctx.f;
  for (let v = 0; v < nv; v++) {
    const q = [Pm[3 * v], Pm[3 * v + 1], Pm[3 * v + 2]], d = B(q[0], q[1], q[2]);
    if (d < 0.0015) { const g = gradOf(B, q); for (let j = 0; j < 3; j++) Pm[3 * v + j] += g[j] * (0.0015 - d); }
  }
  // paint coordinates from the nearest element, weights
  const gco = new Float32Array(nv * 4), skin = new Uint16Array(nv * 4), wts = new Float32Array(nv * 4);
  const canon = new Float32Array(nv * 3), part = new Float32Array(nv * 4), share = new Float32Array(nv * 4);
  const W = o.weights || weightsOf(H, ctx);
  for (let v = 0; v < nv; v++) {
    const x = Pm[3 * v], y = Pm[3 * v + 1], z = Pm[3 * v + 2];
    let best = 1e9, be = null;
    for (const e of els) {
      const b = e.box;
      if (x < b[0][0] - 0.01 || y < b[0][1] - 0.01 || z < b[0][2] - 0.01 || x > b[1][0] + 0.01 || y > b[1][1] + 0.01 || z > b[1][2] + 0.01) continue;
      const d = e.f(x, y, z);
      if (d < best) { best = d; be = e; }
    }
    const c = be ? be.coords(x, y, z) : [0, 0, 1];
    gco[4 * v] = c[0]; gco[4 * v + 1] = c[1]; gco[4 * v + 2] = be ? be.id : 0; gco[4 * v + 3] = (be ? be.kind : 0) + (c[2] ? 0.5 : 0);
    const w = W(x, y, z);
    let s = 0; w.forEach(([bn, wt], k) => { skin[4 * v + k] = bn; wts[4 * v + k] = Math.max(0, wt); s += Math.max(0, wt); });
    for (let k = 0; k < 4; k++) wts[4 * v + k] /= s || 1;
    canon[3 * v] = x; canon[3 * v + 1] = y; canon[3 * v + 2] = z;
    part[4 * v] = 3; part[4 * v + 1] = (y - H.chinY) / hh; share[4 * v + 2] = 1;
  }
  const mesh = { pos: Pm, idx: m.idx, skin, wts, canon, part, share, gco };
  mesh.nrm = normals(mesh);
  smoothNormals(mesh, null, 1, 0.4);
  return mesh;
}

// the style (from the table) with the look's overrides folded in
export function resolveStyle(hair = {}) {
  const st = HAIR_STYLES.find((s) => s.id === hair.style) || HAIR_STYLES.find((s) => s.id === 'swept_side') || HAIR_STYLES[0];
  const p = JSON.parse(JSON.stringify(st.params || {}));
  if (hair.bangs && p.fringe !== undefined) p.fringe = { ...(p.fringe || {}), kind: hair.bangs };
  else if (hair.bangs && hair.bangs !== 'none') p.fringe = { kind: hair.bangs };
  if (hair.bangs === 'none') delete p.fringe;
  if (hair.ahoge !== undefined) p.ahoge = !!hair.ahoge;
  if (hair.curl > 0.05 && !p.afro && !p.curls) p.curls = { r: 0.07 + 0.05 * hair.curl, n: Math.round(40 + 40 * hair.curl) };
  return { style: st, p };
}

export function hairPieces(ctx, hair = {}, opts = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const H = headOf(ctx), hh = H.hh;
  const { style, p } = resolveStyle(hair);
  const seed = hair.seed ?? [...String(style.id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  IDS = 0;
  const S = {
    rand: rng(seed), vol: clamp(hair.volume ?? 1, 0.6, 1.5) * (p.vol ?? 1), lenK: clamp(hair.length ?? 1, 0.4, 2), spiky: clamp((p.spiky ?? 0) + (hair.spikiness ?? 0), 0, 1.2),
    part: hair.part || p.part || 'left', t: (p.cap ? p.cap.t ?? 0.07 : 0.07) * (hair.volume ?? 1), line: p.cap?.line || 'std',
  };
  const hatOn = !!opts.hatOn;
  const els = [];
  if (p.cap && p.cap.line !== 'none') els.push(capPart(H, p.cap, S));
  if (p.fringe) fringePart(H, p.fringe, S, els);
  if (p.sides) sidesPart(H, p.sides, S, els);
  if (p.back) backPart(H, p.back, S, els);
  if (p.top) topPart(H, p.top, S, els);
  if (p.crown && !hatOn) crownPart(H, p.crown, S, els);
  if (p.mohawk && !hatOn) mohawkPart(H, p.mohawk, S, els);
  if (p.fall) fallPart(H, p.fall, S, els);
  for (const t of p.tails || []) tailPart(H, hatOn && (t.el ?? 0.6) > 0.35 && Math.abs(t.az ?? PI) > 2 ? { ...t, el: 0.3 } : t, S, els);
  for (const b of p.braids || []) braidPart(H, b, S, els);
  for (const b of p.buns || []) if (!hatOn || (b.el ?? 1) < 0.3) bunPart(H, b, S, els);
  if (p.loops) loopsPart(H, p.loops, S, els);
  if (p.afro) afroPart(H, p.afro, S, els);
  for (const b of p.puffs || []) puffPart(H, hatOn ? { ...b, el: Math.min(b.el ?? 0.9, 0.35) } : b, S, els);
  if (p.curls) curlsPart(H, p.curls, S, els);
  if (p.ahoge && !hatOn) ahogePart(H, typeof p.ahoge === 'object' ? p.ahoge : {}, S, els);
  const out = [];
  const cell = clamp(hh * 0.0125, 0.003, 0.0042);
  const col = hairColor(hair.color || p.color || 'brown');
  const els2 = els.filter(Boolean);
  if (els2.length) {
    const mesh = meshOf(H, ctx, els2, { cell, verts: p.verts || (p.fall || p.afro || p.loops ? 8000 : 6000), hatOn, k: p.k });
    if (mesh) out.push({ piece: { mesh, hide: null, double: false, layer: 0 }, paint: paintOf(H, ctx, hair, p, col, 'hair', opts) });
  }
  // facial hair (adults)
  if (hair.facial && hair.facial !== 'none' && (ctx.A.L.age ?? 30) >= 15) {
    const fe = facialParts(H, ctx, hair.facial, S);
    if (fe.length) {
      const mesh = meshOf(H, ctx, fe, { cell: hair.facial === 'stubble' ? 0.0025 : clamp(hh * 0.01, 0.0025, 0.0035), verts: 3500, eyeGuard: false, k: 0.008 * hh, weights: () => [[BONE.Head, 1]] });
      if (mesh) {
        const fc = hairColor(hair.facialColor || hair.color || p.color || 'brown');
        out.push({ piece: { mesh, hide: null, double: false, layer: 0 }, paint: paintOf(H, ctx, { ...hair, color2: null }, p, fc, hair.facial === 'stubble' ? 'stubble' : 'facial', opts) });
      }
    }
  }
  hairPieces.lastMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  return out;
}

const MIX = { none: 0, tips: 1, streak: 2, ombre: 3, under: 4 };
function paintOf(H, ctx, hair, p, col, what, opts) {
  const c2 = hair.color2 ? hairColor(hair.color2) : null;
  const gloss = hair.highlight ?? (p.highlight ?? (style0(hair).tags || []).some((t) => t === 'glossy' || t === 'long'));
  const skin = (opts.look && opts.look.skin && opts.look.skin.tone) || '#f6d2b8';
  return {
    what, base: col.base, shade: col.shade, hi: col.hi || lightOf(col.base), deep: shadeOf(col.shade, 0.82),
    color2: c2 ? c2.base : col.base, shade2: c2 ? c2.shade : col.shade, mix: c2 ? MIX[hair.mix || 'tips'] ?? 1 : 0,
    highlight: what === 'hair' && gloss ? 1 : 0, lines: what === 'stubble' ? 0 : 1, tie: hair.tie || p.tie || '#e04848', skin,
    headC: H.C.slice(), hh: H.hh, eyeY: H.eyeY,
  };
}
function style0(hair) { return HAIR_STYLES.find((s) => s.id === hair.style) || {}; }
