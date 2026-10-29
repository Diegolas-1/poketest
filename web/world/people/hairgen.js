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
// How a style is made (all in the person's A pose, one mesh of overlapping closed
// parts, like the X/Y hair models: the ink pass draws the clump edges where they cross):
//  - the scalp cap: the head's own skin inside a hairline (wear.js' shell on the fitted
//    body: over the forehead, dipping at the temples, down to a sideburn, over the ear
//    and round to the nape; laid out on the reference body so it sits the same on every
//    head), grown by the hair's thickness (more on top and at the back, thinning to the
//    hairline) with a folded rim;
//  - clumps: flattened tapered tubes swept along curves (a lens cross-section, flatter
//    towards the head) ending in a sharp 20-40 degree point. Each curve is a little
//    strand simulation on the head: it starts in the cap, is pulled down by gravity,
//    rests on the skull where the skull faces up (and hangs free below its widest part,
//    short styles drawn in sideways), stands off the scalp and flicks out at the tip
//    (spikes), never goes into the head or the body (the anatomy's field without the
//    arms and legs pushes it out: neck, shoulders, back, chest);
//  - parts from the style table (hairstyles.js): bangs of several kinds over the forehead
//    that stop above the eye line, side locks, back clumps (shorter over the ears),
//    crown spikes round a whorl, flows over the top (slicked back, side part, quiff),
//    a mohawk crest, long falls down the back (and locks before the shoulders), ponytails
//    and twin tails (one path, clumps opening round it, a tie), braids (plaits leaning in
//    turn), buns, Joy-like loops, an afro, afro puffs and curls (round lumps), an ahoge,
//    a toddler's tuft;
//  - under a hat (its band per catalogue hat, from garments/hats.js) the hair above the
//    band is pressed into the crown's gap over the skull; spikes, tufts and the ahoge
//    go, ties, buns and puffs move below the band, the bangs come out under the brim;
//    bands and visors leave the hair alone;
//  - facial hair (FACIAL_STYLES, adults): the face's skin grown by a few mm inside a
//    region (stubble, beards, chops; the mouth left free) plus clumps (mustaches, a
//    goatee, an elder's long beard), its own colour, on the Head bone.
// Every vertex keeps paint coordinates (gco): across the clump (-1..1), along it (0
// root .. 1 tip), the clump's id (0..1) and its kind (0 cap, 1 clump, 2 hair tie,
// 3 bun, 4 facial, 5 curl lumps) + 0.5 on the clump's outer face; hair.js paints the
// two tones, the second colour, the strand lines and the highlight band from them
// and from the position relative to the head (paint.headC, paint.hh).
// Weights: the head moves the hair (the cap keeps the skin's own weights); below the
// chin it blends to the neck and from the shoulders down to Spine3, so long hair does
// not cut into the back when the head turns.
import { P, smin, compile } from './sdf.js';
import { normals } from './mesh.js';
import { shell } from './wear.js';
import { BONE, BONE_NAMES } from './rig.js';
import { clamp, sstep, lerp, rng } from './vmath.js';
import { HAIR_STYLES, HAIR_COLORS, FACIAL_STYLES, FRINGES, hairColor, lightOf } from './hairstyles.js';

export { HAIR_STYLES, HAIR_COLORS, FACIAL_STYLES, FRINGES };
const PI = Math.PI;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

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
  // the body without its arms and legs (hair rests on the head, shoulders and back; the arms are out in
  // the A pose and come down beside the body when it moves, so they must not push the hair aside)
  if (!ctx._hairBody) {
    const skip = new Set(BONE_NAMES.map((n, i) => (/ArmA|ForeArm|Hand|Finger|Thigh|Leg|Foot|Toe/.test(n) ? i : -1)).filter((i) => i >= 0));
    const strip = (n) => {
      if (n.op && n.kids) {
        const all = (n.kids || []).map(strip), kids = all.filter(Boolean);
        // an intersection (or a cut) that lost a part is gone (the feet are cut by the ground plane)
        if ((n.op === 'smax' && kids.length < all.length) || (n.op === 'sub' && !all[0])) return null;
        return kids.length ? { ...n, kids } : null;
      }
      const b = n.bone !== undefined ? n.bone : n.ramp ? n.ramp[0] : -1, b2 = n.ramp ? n.ramp[1] : b;
      return skip.has(b) && skip.has(b2) ? null : n;
    };
    const t = A.tree ? strip(A.tree) : null;
    ctx._hairBody = t ? compile(t).f : ctx.f;
  }
  const H = { L, hh, hw, hd, C, R, hs, sk: skull.f, chinY: L.chinY + hs[1], eyeY: L.eyeY + hs[1], noseY: L.noseY ?? (L.eyeY - 0.13 * hh), body: ctx._hairBody };
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

// ---------- geometry: everything is appended to one mesh builder ----------
// a builder: positions, paint coordinates (gco), optional skin weights per vertex (from the body,
// for the scalp shell), triangles
function builder() { return { pos: [], gco: [], skin: [], idx: [], n: 0 }; }
function vtx(M, p, g, sk = null) { M.pos.push(p[0], p[1], p[2]); M.gco.push(g[0], g[1], g[2], g[3]); M.skin.push(sk); return M.n++; }

// a clump: a tapered, flattened tube swept along a curve (resampled by length) with a sharp
// tip; the cross-section is a lens, flatter on the side towards the head
const PROF = {
  spike: (s, b) => (1 - s) * (1 + b * s),
  blunt: (s) => (s < 0.86 ? 1 - 0.1 * s : 0.9 * Math.sqrt(Math.max(0, 1 - ((s - 0.86) / 0.14) ** 2)) * 0.8 + 0.1),
  ribbon: (s) => (s < 0.6 ? 1 - 0.15 * s : 0.91 * (1 - s) / 0.4),
  tail: (s) => (s < 0.2 ? 0.6 + 2 * s : (1 - s) / 0.8 * (1 + 0.5 * (1 - s)) * 0.72),
  round: (s) => Math.min(1, Math.min(s, 1 - s) * 10 + 0.45),
  lump: (s) => Math.sqrt(Math.max(0, 1 - (2 * s - 1) ** 2)) * 0.6 + 0.4,
};
let IDS = 0;
const nextId = () => ((IDS++) * 0.61803398875 + 0.1) % 1;
function clump(M, H, pts, o = {}) {
  if (!pts || pts.length < 2) return;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + V.len(V.sub(pts[i], pts[i - 1])));
  const total = cum[cum.length - 1];
  if (total < 0.004) return;
  const at = (s) => { const L0 = s * total; let i = 1; while (i < cum.length - 1 && cum[i] < L0) i++; return V.lerp(pts[i - 1], pts[i], clamp((L0 - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]))); };
  const prof = PROF[o.prof || 'spike'], w0 = o.w, flat = o.flat ?? 0.45, bul = o.bulge ?? 0.6, K = o.K || (w0 > 0.11 * H.hh ? 10 : 8), inner = o.inner ?? 0.55;
  const nr = o.rings || clamp(Math.round(total / (0.04 * H.hh)) + 3, 4, 26);
  const id = o.id ?? nextId(), kind = o.kind ?? 1;
  const sharp = (o.prof || 'spike') === 'spike' || o.prof === 'ribbon' || o.prof === 'tail';
  const rings = [];
  let prevN = null;
  for (let i = 0; i <= nr; i++) {
    const s = i / nr, c = at(s), t = V.norm(V.sub(at(Math.min(1, s + 0.5 / nr)), at(Math.max(0, s - 0.5 / nr))));
    let n = o.normal ? (typeof o.normal === 'function' ? o.normal(c, s) : o.normal) : H.out(c);
    n = V.madd(n, t, -V.dot(n, t));
    if (V.len(n) < 1e-4) n = prevN || (Math.abs(t[1]) < 0.9 ? V.cross(t, UP) : [1, 0, 0]);
    n = V.norm(n);
    if (prevN && V.dot(n, prevN) < 0.2) n = V.norm(V.lerp(prevN, n, 0.3));
    prevN = n;
    const w = V.cross(t, n), r = Math.max(0, w0 * prof(s, bul));
    if (i === nr && sharp) { rings.push([vtx(M, c, [0, 1, id, kind + 0.5])]); break; }
    const ring = [];
    for (let k = 0; k < K; k++) {
      const th = (k / K) * 2 * PI, cs = Math.cos(th), sn = Math.sin(th);
      const x = Math.sign(cs) * Math.pow(Math.abs(cs), 0.85) * r, y = sn * r * flat * (sn < 0 ? inner : 1);
      ring.push(vtx(M, V.madd(V.madd(c, w, x), n, y), [cs, s, id, kind + (sn > 0 ? 0.5 : 0)]));
    }
    rings.push(ring);
  }
  // faces: the tube is wound so its normals point out ((w, n, t) is left-handed: w = t x n)
  const I = M.idx;
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < K; k++) {
      const k1 = (k + 1) % K;
      if (B.length === 1) I.push(A[k], B[0], A[k1]);
      else I.push(A[k], B[k], A[k1], A[k1], B[k], B[k1]);
    }
  }
  // close the root (and a blunt end)
  const cap = (R, c, flip, s) => { const m = vtx(M, c, [0, s, id, kind + 0.5]); for (let k = 0; k < K; k++) { const k1 = (k + 1) % K; if (flip) I.push(R[k], R[k1], m); else I.push(R[k1], R[k], m); } };
  cap(rings[0], at(0), true, 0);
  const last = rings[rings.length - 1];
  if (last.length > 1) cap(last, at(1), false, 1);
}

// a unit icosphere (cached by level)
const ICO = new Map();
function icosphere(level) {
  if (ICO.has(level)) return ICO.get(level);
  const t = (1 + Math.sqrt(5)) / 2;
  let P0 = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(V.norm);
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let l = 0; l < level; l++) {
    const mid = new Map(), F2 = [];
    const m = (a, b) => { const k = a < b ? a * 1e5 + b : b * 1e5 + a; if (!mid.has(k)) { mid.set(k, P0.length); P0.push(V.norm(V.lerp(P0[a], P0[b], 0.5))); } return mid.get(k); };
    for (const [a, b, c] of F) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); F2.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    F = F2;
  }
  const r = { P: P0, F };
  ICO.set(level, r);
  return r;
}
// an ellipsoid (radii along axes ex, ey, ez); gco: round its axis, up it
function ball(M, c, r, o = {}) {
  const { P: P0, F } = icosphere(o.level ?? 1), ex = o.ex || [1, 0, 0], ey = o.ey || [0, 1, 0], ez = o.ez || [0, 0, 1];
  const id = o.id ?? nextId(), kind = o.kind ?? 5, base = M.n;
  const rr = Array.isArray(r) ? r : [r, r, r];
  for (const q of P0) {
    const p = V.add(V.add(V.madd(c, ex, q[0] * rr[0]), V.mul(ey, q[1] * rr[1])), V.mul(ez, q[2] * rr[2]));
    vtx(M, p, [Math.atan2(q[0], q[2]) / PI, 0.5 + 0.5 * q[1], id, kind + 0.5]);
  }
  for (const [a, b, cc] of F) M.idx.push(base + a, base + cc, base + b);
}
// a torus round axis ax at c (ring radius R, tube r)
function torus(M, c, ax, R, r, o = {}) {
  const e1 = V.norm(V.cross(ax, Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : UP)), e2 = V.cross(ax, e1), NU = o.NU || 20, NV = o.NV || 8;
  const id = o.id ?? nextId(), kind = o.kind ?? 2, base = M.n;
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const u = (i / NU) * 2 * PI, v = (j / NV) * 2 * PI, d = V.add(V.mul(e1, Math.cos(u)), V.mul(e2, Math.sin(u)));
    vtx(M, V.add(V.madd(c, d, R + r * Math.cos(v)), V.mul(ax, r * Math.sin(v))), [u / PI - 1, j / NV, id, kind + 0.5]);
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = base + i * NV + j, b = base + ((i + 1) % NU) * NV + j, cc = base + i * NV + (j + 1) % NV, d = base + ((i + 1) % NU) * NV + (j + 1) % NV;
    M.idx.push(a, b, cc, cc, b, d);
  }
}
// a piece of the body's own skin grown outwards (the scalp cap, beards): wear.js' shell
function skinShell(M, ctx, o, kind, gcoOf) {
  const sh = shell(ctx, { ...o, hides: false });
  if (!sh) return;
  const m = sh.mesh, n = m.pos.length / 3, base = M.n;
  for (let v = 0; v < n; v++) {
    const p = [m.pos[3 * v], m.pos[3 * v + 1], m.pos[3 * v + 2]];
    const g = gcoOf ? gcoOf(p, m, v) : [0, 0, 0.5, kind + 0.5];
    const sk = [];
    for (let j = 0; j < 4; j++) if (m.wts[4 * v + j] > 0) sk.push([m.skin[4 * v + j], m.wts[4 * v + j]]);
    vtx(M, p, g, sk);
  }
  for (let i = 0; i < m.idx.length; i++) M.idx.push(base + m.idx[i]);
}

// ---------- strands: a curve over the head ----------
// o: { p0, d0, len, steps, stopY (number or (p) => y), h0 (standoff over the skull at the root), rise (more at
// the tip, m), risePow, hug (0..1: pulled onto the skull where it faces up), grav (0..1), flick (bend out
// towards the tip), flickFrom, clear (s) -> distance to keep from the body }
function strand(H, o) {
  const len = o.len, steps = o.steps || clamp(Math.ceil(len / (0.03 * H.hh)), 6, 160), ds = len / steps, f = H.sk, B = H.body;
  const kd = ds / (0.1 * H.hh);   // turning per step, per 0.1 head heights of length
  const pts = [o.p0];
  let p = o.p0, d = V.norm(o.d0);
  const grav = o.grav ?? 0.5, hug = o.hug ?? 0.5, hugLow = o.hugLow ?? 0, flickDown = o.flickDown ?? 0.35, h0 = o.h0 ?? 0, rise = o.rise ?? 0, rp = o.risePow ?? 2, flick = o.flick ?? 0, ff = o.flickFrom ?? 0.5;
  for (let i = 1; i <= steps; i++) {
    const s = i / steps;
    if (grav) d = V.norm(V.madd(d, DOWN, grav * kd * 0.5));
    if (flick && s > ff) d = V.norm(V.madd(d, V.norm(V.madd(H.out(p), DOWN, flickDown)), flick * kd * 1.5));
    let q = V.madd(p, d, ds);
    // rest on the scalp / stand off it
    const want = h0 + rise * Math.pow(s, rp), e = f(q[0], q[1], q[2]), n = H.grad(q);
    if (e < want) q = V.madd(q, n, want - e);
    else if (hug > 0 && e - want < 0.3 * H.hh && q[1] > H.chinY) {
      // lies on the head where the head faces up; below its widest it hangs, only drawn in sideways
      // (never round under the jaw or the back of the head)
      const k = clamp(0.3 + n[1] * 1.5);
      q = V.madd(q, n, -(e - want) * hug * k);
      if (hugLow > 0 && n[1] < 0.1 && q[1] > H.chinY + 0.12 * H.hh) { const nh = V.norm([n[0], 0, n[2]]); q = V.madd(q, nh, -(e - want) * hug * hugLow * (1 - k) * Math.max(0, 0.3 - d[1]) * 0.6); }
    }
    // out of the body (face, ears, neck, shoulders, back)
    // (round the skull the hair's own standoff rules; the body only pushes below it: neck, shoulders, back)
    let need = o.clear ? o.clear(s) : 0.004;
    if (q[1] > H.chinY) need = Math.min(need, lerp(Math.max(0.002, want * 0.8), need, sstep(H.chinY + 0.25 * H.hh, H.chinY, q[1])));
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

// the scalp cap: the head's own skin inside the hairline, grown by the hair's thickness (more on top and
// at the back, thinning towards the hairline), with a folded rim at its edge. The hairline is laid out on
// the reference body (ctx.land), so it sits the same on every head.
function capPart(M, H, ctx, o, S) {
  const land = ctx.land, lh = land.hh, lw = land.hw, Cc = [0, land.chinY + 0.6 * lh, -0.03 * lh];
  const line = o.line || 'std', t = (o.t ?? 0.07) * S.vol, top = (o.top ?? 0.04) * S.vol, back = (o.back ?? 0.03) * S.vol;
  const tab = LINES[line] || LINES.std, LY = new Float64Array(181);
  for (let i = 0; i <= 180; i++) {
    const a = (i / 180) * PI; let j = 1; while (j < tab.length - 1 && a > tab[j][0]) j++;
    const [a0, v0] = tab[j - 1], [a1, v1] = tab[j];
    LY[i] = land.eyeY + (v0 + (v1 - v0) * sstep(0, 1, (a - a0) / (a1 - a0)) + (o.front ?? 0) * Math.max(0, 1 - i / 60) + (o.nape ?? 0) * sstep(100, 180, i)) * lh;
  }
  const earY = land.eyeY - 0.06 * lh;
  const g = (V) => {
    if (V.limb === 1 || V.limb === 2 || V.arm > 0.3) return -1;
    const dz = V.cz - Cc[2], a = Math.abs(Math.atan2(V.cx, dz)) / PI * 180, i = Math.min(179, Math.floor(a));
    let d = V.cy - (LY[i] + (LY[i + 1] - LY[i]) * (a - i));
    const ear = 1 - Math.hypot((Math.abs(V.cx) - 0.5 * lw - 0.02 * lh) / (0.085 * lh), (V.cy - earY) / (0.11 * lh), (V.cz + 0.04 * lh) / (0.085 * lh));
    if (ear > 0) d = Math.min(d, -ear * 0.03);
    if (line === 'horseshoe') d = Math.min(d, Cc[1] + 0.1 * lh - V.cy);
    return d;
  };
  const off = (V) => {
    const dx = V.cx, dy = V.cy - Cc[1], dz = V.cz - Cc[2], l = Math.hypot(dx, dy, dz) || 1;
    return H.hh * (t + top * Math.max(0, dy / l) + back * Math.max(0, -dz / l)) * (0.32 + 0.68 * sstep(0, 0.1 * lh, g(V)));
  };
  skinShell(M, ctx, { cover: g, off, fill: 3, rim: Math.max(0.003, t * 0.3 * H.hh * 0.8) }, 0, (p) => [Math.atan2(p[0], p[2] - H.C[2]) / PI, 0, 0.5, 0.5]);
}

function fringePart(M, H, o, S) {
  const hh = H.hh, hw = H.hw, R = S.rand, kind = o.kind || 'straight';
  const F = { ...(FRINGES[kind] || FRINGES.straight), ...o };
  if (!F.n) return;
  const n = F.n, spread = F.spread ?? 0.75, side = S.part === 'right' ? -1 : 1;
  for (let i = 0; i < n; i++) {
    let u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    if (F.parted) u = Math.sign(u || 1) * (0.28 + 0.72 * Math.abs(u));
    const az = u * spread + (F.shift ?? 0) * side + (R() - 0.5) * 0.06;
    const el = (F.el ?? 0.95) - 0.12 * u * u;
    const sp = spot(H, az, el, -0.01 * hh);
    let sweep = (F.sweep ?? 0) * side;
    if (F.parted) sweep = Math.sign(u) * (F.partSweep ?? 0.45);
    sweep += (F.fan ?? 0.25) * u + (R() - 0.5) * (F.jitter ?? 0.1);
    const d0 = rot(sp.south, sp.n, -sweep);
    // where it stops: above the eyes in front, lower at the sides (beside the eyes)
    const lenK = 1 + (R() - 0.5) * (F.vary ?? 0.15);
    const to = F.to ?? 0.12, toSide = F.toSide ?? to - 0.12;
    const stopY = (q) => {
      const ax = Math.abs(q[0]) / hw;
      let y = H.eyeY + lerp(to, toSide, sstep(0.36, 0.56, ax)) * hh;
      if (F.parted) y += (F.centre ?? 0.1) * hh * (1 - sstep(0.05, 0.25, ax));
      if (F.longSide) y -= F.longSide * hh * sstep(-0.3, 0.5, (q[0] * side) / hw);
      return y + (lenK - 1) * 0.5 * hh;
    };
    const w = (F.w ?? 0.12) * hh * S.vol * (1 + (R() - 0.5) * 0.25);
    const pts = strand(H, { p0: sp.p, d0, len: (F.len ?? 0.8) * hh, stopY, h0: S.t * hh * 0.5, rise: (F.lift ?? 0.02) * hh, hug: F.hug ?? 0.85, grav: F.grav ?? 0.25, flick: (F.flick ?? 0.05) + 0.25 * S.spiky * (F.spikyK ?? 1), flickFrom: 0.6, clear: (s) => 0.003 + w * (F.flat ?? 0.42) * (1 - s) * 0.5 });
    clump(M, H, pts, { w, flat: F.flat ?? 0.42, prof: F.prof || 'spike', bulge: F.bulge ?? 0.6 });
  }
}

function sidesPart(M, H, o, S) {
  const hh = H.hh, R = S.rand, n = o.n ?? 2;
  for (const m of [1, -1]) for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    const az = m * lerp(o.az0 ?? 1.0, o.az1 ?? 1.45, k), el = lerp(o.el0 ?? 0.75, o.el1 ?? 0.55, k);
    const sp = spot(H, az, el, -0.01 * hh);
    const to = lenTo(o.to ?? 0.25, S) + (R() - 0.5) * 0.08 + (o.stagger ?? 0) * k;
    const d0 = rot(sp.south, sp.n, m * (o.sweep ?? -0.1));
    const w = (o.w ?? 0.13) * hh * S.vol * (1 + (R() - 0.5) * 0.2);
    const pts = strand(H, { p0: sp.p, d0, len: 3 * hh, stopY: H.Y(to), hugLow: o.hugLow ?? (to > -0.1 ? 0.7 : 0.15), h0: S.t * hh * 0.5, rise: (o.lift ?? 0.02) * hh, hug: o.hug ?? 0.7, grav: o.grav ?? 0.6, flick: (o.flare ?? 0.1) + 0.5 * S.spiky * (o.spikyK ?? 1), flickFrom: o.flickFrom ?? 0.55, clear: (s) => 0.004 + w * 0.4 * (1 - s) });
    clump(M, H, pts, { w, flat: o.flat ?? 0.45, prof: o.prof || 'spike', bulge: o.bulge ?? 0.5 });
  }
}

function backPart(M, H, o, S) {
  const hh = H.hh, R = S.rand, n = o.n ?? 5, rows = o.rows ?? 1, a0 = o.az0 ?? 1.55;
  for (let row = 0; row < rows; row++) for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    // from the left side round the back to the right side
    const a = a0 + (2 * PI - 2 * a0) * (row ? (i + 0.5) / n : k) + (R() - 0.5) * 0.08;
    const ang = Math.abs(((a + PI) % (2 * PI)) - PI), back = sstep(a0 + 0.1, 2.4, ang);
    // over the ears the clumps start higher (longer, lying flat), at the back lower
    const el = lerp(o.elSide ?? 0.85, row ? (o.el2 ?? 0.95) : (o.el ?? 0.5), back) + (R() - 0.5) * 0.08;
    const sp = spot(H, a, el, -0.01 * hh);
    // shorter at the sides (over the ears) than at the nape, unless the style says otherwise
    const toBack = lenTo((o.to ?? 0) + (row ? (o.to2 ?? 0.08) : 0), S), toSide = o.toSide !== undefined ? lenTo(o.toSide, S) : toBack < 0.05 ? toBack + 0.12 : Math.max(toBack, 0.3);
    const to = lerp(toSide, toBack, sstep(a0 + 0.1, 2.5, ang)) + (R() - 0.5) * (o.vary ?? 0.08) - (o.mid ?? 0) * (1 - Math.abs(k * 2 - 1));
    const d0 = rot(sp.south, sp.n, (R() - 0.5) * 0.2);
    const w = (o.w ?? 0.15) * hh * S.vol * (1 + (R() - 0.5) * 0.2) * lerp(0.8, 1, back);
    const pts = strand(H, { p0: sp.p, d0, len: 3.5 * hh, stopY: H.Y(to), hugLow: o.hugLow ?? (to > -0.1 ? 0.7 : 0.15), h0: S.t * hh * 0.5, rise: (o.lift ?? 0.03) * hh, hug: o.hug ?? 0.7, grav: o.grav ?? 0.55, flick: ((o.flare ?? 0.06) + 0.6 * S.spiky * (o.spikyK ?? 1)) * lerp(o.sideFlare ?? 0.15, 1, back), flickFrom: o.flickFrom ?? 0.5, clear: (s) => 0.004 + w * 0.4 * (1 - s) });
    clump(M, H, pts, { w, flat: o.flat ?? 0.45, prof: o.prof || 'spike', bulge: o.bulge ?? 0.5 });
  }
}

function crownPart(M, H, o, S) {
  const hh = H.hh, R = S.rand, n = o.n ?? 8;
  const wz = H.surf(o.az ?? PI, o.el ?? 1.2);   // the whorl
  for (let i = 0; i < n; i++) {
    const ph = (i / n) * 2 * PI + (R() - 0.5) * 0.4;
    const el = Math.min(1.45, (o.el ?? 1.2) + (o.ring ?? 0.35) * (0.6 + 0.4 * R()) * Math.cos(ph) * 0.8);
    const az = (o.az ?? PI) + (o.ring ?? 0.35) * 1.4 * Math.sin(ph) / Math.max(0.3, Math.cos(el));
    const sp = spot(H, az, el, -0.005 * hh);
    let away = V.sub(sp.p, wz); away = V.len(away) < 1e-3 ? sp.south : tangent(sp.n, away);
    const up = o.up ?? 0.5;
    const d0 = V.norm(V.add(V.mul(sp.n, up), V.mul(V.norm(V.add(away, V.mul(sp.south, 0.4))), 1 - up)));
    const len = (o.len ?? 0.3) * hh * (0.75 + 0.5 * R()) * S.lenK;
    const pts = strand(H, { p0: V.madd(sp.p, sp.n, -0.02 * hh), d0, len, h0: 0, hug: 0, grav: o.grav ?? 0.15, flick: 0.1 * S.spiky });
    clump(M, H, pts, { w: (o.w ?? 0.1) * hh * S.vol, flat: o.flat ?? 0.6, prof: 'spike', bulge: 0.4, inner: 0.8 });
  }
}

function topPart(M, H, o, S) {
  const hh = H.hh, R = S.rand, n = o.n ?? 5, flow = o.flow || 'back', side = S.part === 'right' ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1), u = k * 2 - 1;
    let sp, d0;
    if (flow === 'side') {
      // from the parting line over the top towards the other side and down
      const el = lerp(0.85, 1.3, k), az = side * Math.min(1.4, (o.partAz ?? 0.42) / Math.max(0.3, Math.cos(el - 0.5)));
      sp = spot(H, az, el, -0.005 * hh);
      d0 = V.norm(V.add(V.mul(sp.east, -side), V.mul(sp.south, 0.25)));
    } else {
      const az = u * (o.spread ?? 0.65), el = (o.el ?? 0.82) - 0.1 * u * u;
      sp = spot(H, az, el, -0.005 * hh);
      const back = V.mul(sp.south, -1);
      d0 = flow === 'up' ? V.norm(V.add(V.mul(sp.n, o.up ?? 0.9), back)) : flow === 'forward' ? V.norm(V.add(sp.south, V.mul(sp.east, u * 0.3))) : V.norm(V.add(back, V.mul(sp.east, u * 0.25)));
    }
    const len = (o.len ?? 0.8) * hh * (0.9 + 0.2 * R());
    const w = (o.w ?? 0.13) * hh * S.vol;
    const pts = strand(H, { p0: sp.p, d0, len, h0: S.t * hh * 0.55, rise: (o.lift ?? 0.03) * hh, risePow: o.risePow ?? 2, hug: o.hug ?? 0.9, grav: o.grav ?? 0.12, flick: (o.flick ?? 0.08) + 0.4 * S.spiky, flickFrom: 0.6, stopY: H.Y(o.to ?? 0.15), clear: () => 0.004 + w * 0.3 });
    clump(M, H, pts, { w, flat: o.flat ?? 0.42, prof: o.prof || 'spike', bulge: 0.6 });
  }
}

function mohawkPart(M, H, o, S) {
  const hh = H.hh, R = S.rand, n = o.n ?? 6;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1), ang = lerp(0.95, PI - 0.6, k);   // over the top, front to back
    const el = ang <= PI / 2 ? ang : PI - ang, az = ang <= PI / 2 ? 0 : PI;
    const sp = spot(H, az, el, -0.005 * hh);
    const d0 = V.norm(V.add(sp.n, V.mul(sp.south, (ang <= PI / 2 ? -1 : 1) * 0.7)));
    const pts = strand(H, { p0: V.madd(sp.p, sp.n, -0.02 * hh), d0, len: (o.len ?? 0.22) * hh * (0.85 + 0.3 * R()) * (1 - 0.3 * Math.abs(k - 0.4)), h0: 0, hug: 0, grav: 0.2 });
    clump(M, H, pts, { w: (o.w ?? 0.12) * hh * S.vol, flat: 0.35, prof: 'spike', bulge: 0.5, normal: [1, 0, 0], inner: 1 });
  }
}

function fallPart(M, H, o, S) {
  const hh = H.hh, R = S.rand, n = o.n ?? 7, to = lenTo(o.to ?? -1.2, S);
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    const a = (o.az0 ?? 1.35) + (2 * PI - 2 * (o.az0 ?? 1.35)) * k;
    const sp = spot(H, a, (o.el ?? 0.55) + (R() - 0.5) * 0.1, -0.01 * hh);
    const d0 = rot(sp.south, sp.n, (k - 0.5) * (o.fan ?? -0.3));
    const tipY = H.Y(to + (R() - 0.5) * 0.12 - (o.v ?? 0.15) * (1 - Math.abs(k * 2 - 1)));
    const w = (o.w ?? 0.2) * hh * S.vol * (0.9 + 0.2 * R());
    const pts = strand(H, { p0: sp.p, d0, len: 6 * hh, stopY: tipY, h0: S.t * hh * 0.4, rise: 0.02 * hh, hug: 0.7, grav: 0.7, flick: (o.flare ?? 0.03) + 0.2 * S.spiky, flickFrom: 0.75, clear: (s) => 0.006 + w * (o.flat ?? 0.32) * (1 - 0.5 * s) });
    if (o.wave) wave(H, pts, o.wave * hh, k * 7);
    clump(M, H, pts, { w, flat: o.flat ?? 0.32, prof: o.prof || 'ribbon' });
  }
  // locks falling in front of the shoulders
  for (let j = 0; j < (o.front ?? 0); j++) for (const m of [1, -1]) {
    const sp = spot(H, m * (1.25 + 0.15 * j), 0.5, -0.01 * hh), w = (o.w ?? 0.2) * hh * 0.75 * S.vol;
    const pts = strand(H, { p0: sp.p, d0: V.norm(V.add(sp.south, [0, 0, 0.3])), len: 6 * hh, stopY: H.Y(to + 0.25 + 0.1 * j), h0: S.t * hh * 0.4, rise: 0.02 * hh, hug: 0.6, grav: 0.7, flick: 0.04, flickFrom: 0.75, clear: () => 0.008 + w * 0.3 });
    if (o.wave) wave(H, pts, o.wave * hh, j * 3 + m);
    clump(M, H, pts, { w, flat: o.flat ?? 0.35, prof: 'ribbon' });
  }
}
// waves: the curve swings from side to side, more towards the end
function wave(H, pts, amp, ph) {
  const n = pts.length;
  for (let j = 1; j < n; j++) {
    const s = j / (n - 1), q = pts[j], t = V.norm(V.sub(q, pts[j - 1])), sd = V.norm(V.cross(t, H.out(q)));
    pts[j] = V.madd(q, sd, amp * Math.sin(s * 14 + ph) * sstep(0.1, 0.5, s));
  }
}

// a tie point on the scalp: point, out direction
function tiePoint(H, az, el, S, lift = 0.04) { const sp = spot(H, az, el, 0); return { ...sp, p: V.madd(sp.p, sp.n, (S.t * 0.8 + lift) * H.hh) }; }
// a hair tie: a short fat band round the start of a tail
function tie(M, H, at, dir, r) { clump(M, H, [V.madd(at, dir, -0.03 * H.hh), V.madd(at, dir, 0.025 * H.hh)], { w: r, flat: 1, inner: 1, prof: 'round', kind: 2, rings: 3, K: 12, normal: Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : UP }); }

function tailPart(M, H, o, S) {
  const hh = H.hh, R = S.rand, tp = tiePoint(H, o.az ?? PI, o.el ?? 0.6, S, o.out ?? 0.03), n = o.n ?? 5;
  const dir = o.dir ? V.norm([o.dir[0] * Math.sign(o.az || 1), o.dir[1], o.dir[2]]) : V.norm(V.add(tp.n, V.mul(UP, o.lift ?? 0.3)));
  const w = (o.w ?? 0.12) * hh * S.vol;
  if (o.tie !== false) tie(M, H, tp.p, dir, w * 0.62);
  // a bundle from the scalp into the tie
  clump(M, H, [V.madd(tp.p, tp.n, -(S.t + 0.06) * hh), V.madd(tp.p, dir, 0.01 * hh)], { w: w * 0.55, flat: 0.9, inner: 1, prof: 'round', rings: 3 });
  const to = lenTo(o.to ?? -0.4, S);
  // one path for the whole tail, the clumps round it, opening out a little towards the ends
  const path = strand(H, { p0: tp.p, d0: dir, len: Math.max(0.35, (to < 0 ? 1.0 - to : 0.55)) * hh * (o.lenK ?? 1.4), stopY: H.Y(to), h0: 0.02 * hh, hug: 0, grav: o.grav ?? 0.45, flick: (o.flare ?? 0.04) + 0.2 * S.spiky, flickFrom: 0.75, clear: () => 0.008 + w * 0.8 });
  if (path.length < 2) return;
  for (let i = 0; i < n; i++) {
    const ph = (i / n) * 2 * PI + R() * 0.6, sp = (o.fanK ?? 1) * (0.25 + 0.35 * R());
    const wi = w * (0.8 + 0.3 * R()), lenCut = 1 - R() * 0.2;
    const m = Math.max(2, Math.round(path.length * lenCut));
    const pts = path.slice(0, m).map((q, j) => {
      const s = j / (path.length - 1), t = V.norm(V.sub(path[Math.min(path.length - 1, j + 1)], path[Math.max(0, j - 1)]));
      const sd = V.norm(V.cross(t, Math.abs(t[1]) > 0.95 ? [1, 0, 0] : UP)), u2 = V.norm(V.cross(sd, t));
      const r = w * (0.3 + sp * s * 2.4);
      return V.add(q, V.add(V.mul(sd, Math.cos(ph) * r), V.mul(u2, Math.sin(ph) * r * 0.7)));
    });
    clump(M, H, pts, { w: wi, flat: o.flat ?? 0.6, prof: 'tail', inner: 0.9 });
  }
}

function braidPart(M, H, o, S) {
  const hh = H.hh, tp = tiePoint(H, o.az ?? PI, o.el ?? 0.3, S, 0.0), to = lenTo(o.to ?? -0.9, S), w = (o.w ?? 0.075) * hh * S.vol;
  const dir = V.norm(V.add(tp.n, V.mul(DOWN, 0.6)));
  const path = strand(H, { p0: tp.p, d0: dir, len: 5 * hh, stopY: H.Y(to), h0: 0.02 * hh, hug: 0.5, grav: 0.8, clear: () => 0.008 + w });
  const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + V.len(V.sub(path[i], path[i - 1])));
  const total = cum[cum.length - 1], at = (L0) => { let i = 1; while (i < cum.length - 1 && cum[i] < L0) i++; return V.lerp(path[i - 1], path[i], clamp((L0 - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]))); };
  if (total < 0.02) return;
  const step = w * 1.3, id = S.rand();
  // the plaits: lumps leaning left and right in turn
  for (let L0 = 0, k = 0; L0 < total - step * 0.8; L0 += step, k++) {
    const s = L0 / total, a = at(L0), b = at(Math.min(total, L0 + step * 1.7)), t = V.norm(V.sub(b, a));
    const n = H.out(a), sd = V.norm(V.cross(t, n)), m = k % 2 ? 1 : -1, r = w * (1 - 0.3 * s);
    clump(M, H, [V.madd(a, sd, m * r * 0.45), V.madd(b, sd, -m * r * 0.4)], { w: r, flat: 0.6, inner: 0.9, prof: 'lump', rings: 4, id, normal: n });
  }
  const end = at(total), t = V.norm(V.sub(end, at(Math.max(0, total - step))));
  tie(M, H, end, t, w * 0.6);
  for (const m of [-1, 0, 1]) clump(M, H, [V.madd(end, t, 0.0), V.madd(end, V.norm(V.add(t, [m * 0.25, 0, 0])), 0.16 * hh)], { w: w * 0.6, flat: 0.6, prof: 'spike', rings: 4, id });
  // the root: a bundle from the scalp into the braid
  clump(M, H, [V.madd(tp.p, tp.n, -(S.t + 0.05) * hh), at(Math.min(total, step))], { w: w * 1.05, flat: 0.75, inner: 1, prof: 'round', rings: 4, id });
}

function bunPart(M, H, o, S) {
  const hh = H.hh, r = (o.r ?? 0.2) * hh * S.vol, tp = tiePoint(H, o.az ?? PI, o.el ?? 1.0, S, 0);
  const ax = tp.n, ex = V.norm(V.cross(ax, Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : UP)), ez = V.cross(ex, ax);
  const c = V.madd(tp.p, ax, r * 0.55);
  ball(M, c, [r, r * 0.8, r], { level: 2, ex, ey: ax, ez, kind: 3 });
  torus(M, V.madd(c, ax, -r * 0.35), ax, r * 0.7, r * 0.34, { kind: 3, NU: 22, NV: 10 });
  if (o.tie) torus(M, V.madd(c, ax, -r * 0.62), ax, r * 0.62, 0.025 * hh, { kind: 2 });
}

// round lumps (afro, puffs, curls) over an ellipsoid
function lumpsOver(M, H, centre, rad, n, br, S, keep, level = 1) {
  const ga = PI * (3 - Math.sqrt(5)), id = S.rand();
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), th = ga * i;
    const p = [centre[0] + Math.cos(th) * rr * rad[0], centre[1] + y * rad[1], centre[2] + Math.sin(th) * rr * rad[2]];
    if (keep && !keep(p)) continue;
    ball(M, p, br * (0.85 + 0.3 * S.rand()), { level, kind: 5, id });
  }
}
function afroPart(M, H, o, S) {
  const hh = H.hh, k = (o.r ?? 1) * S.vol, C = H.C;
  const centre = [0, C[1] + 0.12 * hh * k, C[2] - 0.12 * hh * k], rad = [H.R[0] + 0.24 * hh * k, H.R[1] + 0.2 * hh * k, H.R[2] + 0.17 * hh * k];
  const keep = (p) => p[1] > lineY(H, 'std', Math.atan2(p[0], p[2] - C[2])) - 0.03 * hh && (!S.band || S.band(p));
  if (!S.band) ball(M, centre, rad, { level: 3, kind: 5 });
  lumpsOver(M, H, centre, V.mul(rad, 0.95), o.bumps ?? 34, 0.16 * hh * k, S, keep);
  M.afro = { lineH: (p) => lineY(H, 'std', Math.atan2(p[0], p[2] - C[2])), C };
}
function puffPart(M, H, o, S) {
  const hh = H.hh, tp = tiePoint(H, o.az ?? 1.3, o.el ?? 0.9, S, 0), r = (o.r ?? 0.26) * hh * S.vol;
  const centre = V.madd(tp.p, tp.n, r * 0.85);
  ball(M, centre, [r * 0.92, r * 0.86, r * 0.92], { level: 2, kind: 5 });
  lumpsOver(M, H, centre, [r * 0.9, r * 0.84, r * 0.9], 24, r * 0.34, S);
  torus(M, V.madd(tp.p, tp.n, r * 0.05), tp.n, r * 0.4, 0.028 * hh, { kind: 2 });
}
function curlsPart(M, H, o, S) {
  const hh = H.hh, C = H.C, line = S.line, br = (o.r ?? 0.1) * hh, t = S.t * S.vol;
  const rad = [H.R[0] + t * hh * 0.8, H.R[1] + t * hh * 0.95 + 0.015 * hh, H.R[2] + t * hh * 0.8];
  const keep = (p) => p[1] > lineY(H, line, Math.atan2(p[0], p[2] - C[2])) + 0.05 * hh && (!S.band || S.band(p));
  lumpsOver(M, H, [C[0], C[1] + 0.01 * hh, C[2] - 0.005 * hh], rad, o.n ?? 60, br, S, keep);
}
// Joy-like loops: a lock from behind each temple down past the jaw and up again into a ring
function loopsPart(M, H, o, S) {
  const hh = H.hh, r = (o.r ?? 0.34) * hh * S.lenK ** 0.5, w = (o.w ?? 0.085) * hh * S.vol;
  for (const m of [1, -1]) {
    const sp = spot(H, m * (o.az ?? 1.75), o.el ?? 0.35, S.t * 0.4 * hh);
    // a teardrop hanging beside the face: down the inner side, round the bottom, up the outer side
    const c = V.add(sp.p, [m * (r * 0.42 + 0.02 * hh), -r * 0.95, 0.03 * hh]);
    const pts = [V.madd(sp.p, sp.n, -0.03 * hh)];
    for (let i = 0; i <= 30; i++) {
      const th = PI / 2 + m * 0.25 - m * (i / 30) * 2 * PI * 0.94;
      const top = Math.max(0, Math.sin(th));
      let q = V.add(c, [Math.cos(th) * r * 0.5 * (1 - 0.45 * top), Math.sin(th) * r, 0]);
      const fb = H.body(q[0], q[1], q[2]);
      if (fb < w) q = V.madd(q, gradOf(H.body, q), w - fb);
      pts.push(q);
    }
    clump(M, H, pts, { w, flat: 0.62, inner: 0.9, prof: 'round', rings: 30, normal: [m, 0, 0] });
  }
}
function ahogePart(M, H, o, S) {
  const hh = H.hh, sp = spot(H, o.az ?? 0.25, o.el ?? 1.25, S.t * hh * 0.5), f = V.mul(sp.south, -1);
  const pts = [V.madd(sp.p, sp.n, -0.04 * hh), V.madd(V.madd(sp.p, sp.n, 0.1 * hh), f, -0.02 * hh), V.madd(V.madd(sp.p, sp.n, 0.2 * hh), f, 0.04 * hh), V.madd(V.madd(sp.p, sp.n, 0.2 * hh), f, 0.12 * hh), V.madd(V.madd(sp.p, sp.n, 0.13 * hh), f, 0.17 * hh)];
  clump(M, H, pts, { w: (o.w ?? 0.045) * hh, flat: 0.5, prof: 'spike', bulge: 0.3, rings: 10, normal: sp.east, inner: 1 });
}

// lengths below the chin scale with the length slider
const lenTo = (to, S) => (to < 0 ? to * S.lenK : to - (1 - S.lenK) * 0.15);

// ---------- facial hair ----------
function facialParts(M, H, ctx, id) {
  const F = FACIAL_STYLES.find((f) => f.id === id);
  if (!F || F.kind === 'none') return;
  const hh = H.hh, hw = H.hw, B = H.body, o = F.params || {}, kind = F.kind;
  const land = ctx.land, lh = land.hh, lw = land.hw;
  const mouthY = H.chinY + (o.mouthK ?? 0.2) * hh, noseY = H.noseY;
  // the region on the reference face: under a line from the sideburn under the cheekbone to beside the
  // nose, round the jaw and under the chin, not the mouth
  if (kind === 'stubble' || kind === 'beard' || kind === 'chops' || kind === 'long') {
    const lm = land.chinY + 0.2 * lh, ln = land.noseY ?? land.eyeY - 0.13 * lh, Cz = -0.03 * lh;
    const cover = (V) => {
      if (V.limb !== 3 && V.head < 0.5) return -1;
      const ax = Math.abs(V.cx) / lw;
      let g = lerp(ln - 0.05 * lh, land.eyeY - 0.05 * lh, sstep(0.22, 0.44, ax)) - V.cy;
      g = Math.min(g, V.cy - (land.chinY - 0.08 * lh) + Math.min(0, V.cz - Cz) * 0.6, V.cz - (Cz - 0.02 * lh));
      if (kind === 'chops') g = Math.min(g, ax - 0.3);
      else g = Math.min(g, Math.hypot(V.cx / (0.21 * lw), (V.cy - lm) / (0.055 * lh)) - 1);
      return g;
    };
    const t = kind === 'stubble' ? 0.0012 : (o.t ?? 0.035) * hh;
    skinShell(M, ctx, { cover, off: (V) => t * (0.3 + 0.7 * sstep(0, 0.07 * lh, cover(V))), fill: 2, rim: kind === 'stubble' ? 0 : Math.max(0.002, t * 0.4) }, 4, () => [0, 0.5, 0.5, 4.5]);
  }
  // the face's front at (x, y): marched in from the front (the cheek's side if the ray misses)
  const fz = (x, y) => {
    let z = H.C[2] + 0.8 * hh;
    for (let i = 0; i < 60; i++) { const d = B(x, y, z); if (d < 1e-4) return z; z -= Math.max(d, 1e-4); if (z < H.C[2]) break; }
    return H.C[2] + 0.25 * hh;
  };
  const onFace = (x, y, off) => [x, y, fz(x, y) + off];
  if (kind === 'mustache' || kind === 'beard' || kind === 'long' || o.mustache) {
    for (const m of [1, -1]) {
      const pts = [onFace(m * 0.0 * hw, noseY - 0.05 * hh, 0.0), onFace(m * 0.12 * hw, noseY - 0.065 * hh, 0.004), onFace(m * 0.22 * hw, mouthY + 0.01 * hh, 0.004), onFace(m * (o.wide ?? 0.3) * hw, mouthY - (o.droop ?? 0.06) * hh, 0.002)];
      clump(M, H, pts, { w: (o.mw ?? 0.05) * hh, flat: 0.5, prof: 'spike', bulge: 0.8, kind: 4, normal: [0, 0, 1], inner: 0.8 });
    }
  }
  if (kind === 'goatee' || o.goatee) {
    const z0 = fz(0, H.chinY + 0.04 * hh);
    const pts = [onFace(0, mouthY - 0.06 * hh, 0.0), onFace(0, H.chinY + 0.03 * hh, 0.004), [0, H.chinY - 0.04 * hh, z0 - 0.01 * hh], [0, H.chinY - (o.len ?? 0.1) * hh, z0 - 0.02 * hh]];
    clump(M, H, pts, { w: 0.09 * hh, flat: 0.55, prof: 'spike', bulge: 0.5, kind: 4, normal: [0, 0, 1], inner: 0.8 });
  }
  if (kind === 'long') {
    const z0 = fz(0, H.chinY + 0.08 * hh);
    const pts = [[0, H.chinY + 0.12 * hh, z0 - 0.08 * hh], [0, H.chinY - 0.05 * hh, z0], [0, H.chinY - 0.35 * hh, z0 + 0.03 * hh], [0, H.chinY - (o.len ?? 0.75) * hh, z0]];
    for (const q of pts) { const fb = B(q[0], q[1], q[2]); if (fb < 0.03 * hh) q[2] += 0.03 * hh - fb; }
    clump(M, H, pts, { w: 0.26 * hh, flat: 0.45, prof: 'spike', bulge: 0.5, kind: 4, normal: [0, 0, 1] });
  }
}

// ---------- hats ----------
// where each hat's crown meets the head (garments/hats.js: band heights over the eye line at the front and
// the back, in head heights, and the crown's gap over the skull at the band and on top, x hh/0.28): above
// that line the hair is pressed into the gap. null: the hat leaves the hair as it is (bands, visors, caps
// that sit on top).
const HAT_BANDS = {
  hat_cap_logo: [0.13, -0.02, 0.005, 0.016], hat_cap_swoosh: [0.13, -0.02, 0.005, 0.016], hat_cap_trucker: [0.13, -0.02, 0.005, 0.016],
  hat_camp_cap: [0.13, -0.02, 0.005, 0.016], hat_cycling: [0.15, -0.02, 0.005, 0.012], hat_school_cap: [0.15, -0.08, 0.005, 0.02],
  hat_bucket: [0.22, 0.04, 0.008, 0.022], hat_fisher: [0.22, 0.04, 0.008, 0.022], hat_sun: [0.24, 0.03, 0.008, 0.024], hat_straw_farmer: [0.22, 0.03, 0.008, 0.03],
  hat_boater: [0.22, 0.06, 0.012, 0.02], hat_felt_round: [0.22, 0.04, 0.008, 0.03], hat_fedora: [0.22, 0.06, 0.008, 0.02], hat_top_hat: [0.24, 0.08, 0.01, 0.02],
  hat_ranger: [0.22, 0.06, 0.008, 0.02], hat_cloche: [0.17, -0.1, 0.012, 0.026], hat_beanie: [0.2, -0.08, 0.009, 0.022], hat_bobble: [0.2, -0.08, 0.009, 0.022],
  hat_camo_beanie: [0.2, -0.08, 0.009, 0.022], hat_animal_hood: [0.2, -0.08, 0.009, 0.022], hat_earflap: [0.2, -0.04, 0.009, 0.022], hat_goggles_cap: [0.22, -0.06, 0.008, 0.02],
  hat_beret: [0.28, 0.1, 0.008, 0.02], hat_flat_cap: [0.15, 0.0, 0.006, 0.016], hat_sailor: [0.22, 0.05, 0.008, 0.02], hat_captain: [0.19, 0.03, 0.008, 0.02],
  hat_police: [0.19, 0.03, 0.008, 0.02], hat_hard: [0.2, 0.02, 0.01, 0.024], hat_sport_helmet: [0.22, -0.1, 0.01, 0.024], hat_chef_toque: [0.2, 0.06, 0.008, 0.02],
  hat_baker_cap: [0.2, 0.03, 0.008, 0.02], hat_sunbonnet: [0.22, -0.06, 0.008, 0.02], hat_sprig: [0.2, 0.0, 0.008, 0.02],
  hat_visor: null, hat_headband_sport: null, hat_hachimaki: null, hat_nurse_cap: null, hat_maid_headdress: null,
};
function hatOf(opts) {
  const ids = ((opts.look && opts.look.outfit) || []).map((o) => o && o.id).filter((id) => id && id.startsWith('hat_'));
  for (const id of ids) if (id in HAT_BANDS) return HAT_BANDS[id];
  return opts.hatOn ? [0.18, 0.0, 0.007, 0.018] : null;
}

// ---------- assembling ----------
function weightsOf(H, ctx) {
  const L = ctx.A.L, hb = BONE.Head, nb = BONE.Neck, sb = BONE.Spine3;
  const yH = H.chinY - 0.1 * H.hh, yS = L.shY + 0.01;
  return (x, y) => {
    const t = sstep(yS, yH, y), u = sstep(yS - 0.12 * H.hh, yS + 0.05, y);
    const wh = t, wn = (1 - t) * u * 0.6;
    return [[hb, wh], [nb, wn], [sb, 1 - wh - wn]];
  };
}

// the builder -> a mesh: kept off the body and the eyes, pressed under a hat, weighted
function finish(M, H, ctx, o) {
  const n = M.n, hh = H.hh;
  if (!n) return null;
  const pos = Float32Array.from(M.pos), gco = Float32Array.from(M.gco), B = H.body, sk = H.sk;
  // the hat's band: a line round the head from yF at the front to yB at the back
  const hat = o.hat, hzF = H.C[2] + H.R[2], hzB = H.C[2] - H.R[2], T = hh / 0.28;
  const band = hat ? (z) => H.eyeY + hh * (hat[1] + (hat[0] - hat[1]) * clamp((z - hzB) / (hzF - hzB))) : null;
  const gy0 = H.eyeY - 0.1 * hh, gy1 = H.eyeY + 0.085 * hh, gx = 0.46 * H.hw, gz = H.C[2] + 0.12 * hh;
  for (let v = 0; v < n; v++) {
    let p = [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];
    const kind = Math.floor(gco[4 * v + 3]);
    // an afro's lumps stop at the hairline in front of the face
    if (M.afro && kind === 5 && Math.abs(Math.atan2(p[0], p[2] - H.C[2])) < 1.25) { const ly = M.afro.lineH(p) + 0.02 * hh; if (p[1] < ly) p[1] = ly; }
    // under a hat: above the rim only a thin layer on the skull
    if (band) {
      const up = p[1] - band(p[2]);
      if (up > -0.01 * hh) {
        const gap = lerp(hat[2], hat[3], sstep(0, H.C[1] + H.R[1] - band(p[2]), up)) * T;
        const tf = gap * (kind === 0 ? 0.4 : 0.65) * sstep(-0.01 * hh, 0.015 * hh, up) + (1 - sstep(-0.01 * hh, 0.015 * hh, up)) * 1, e = sk(p[0], p[1], p[2]);
        if (e > tf) p = V.madd(p, H.grad(p), tf - e);
      }
    }
    // never over the eyes
    if (o.eyeGuard && kind === 1 && Math.abs(p[0]) < gx && p[1] > gy0 && p[1] < gy1 && p[2] > gz) p[1] = gy1;
    // out of the body by a hair's breadth
    const d = B(p[0], p[1], p[2]);
    if (d < 0.0015) p = V.madd(p, gradOf(B, p), 0.0015 - d);
    pos[3 * v] = p[0]; pos[3 * v + 1] = p[1]; pos[3 * v + 2] = p[2];
  }
  const skin = new Uint16Array(n * 4), wts = new Float32Array(n * 4);
  const canon = new Float32Array(n * 3), part = new Float32Array(n * 4), share = new Float32Array(n * 4);
  const W = o.weights || weightsOf(H, ctx);
  for (let v = 0; v < n; v++) {
    const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2];
    const w = M.skin[v] || W(x, y, z);
    let s = 0; w.slice(0, 4).forEach(([bn, wt], k) => { skin[4 * v + k] = bn; wts[4 * v + k] = Math.max(0, wt); s += Math.max(0, wt); });
    for (let k = 0; k < 4; k++) wts[4 * v + k] /= s || 1;
    canon[3 * v] = x; canon[3 * v + 1] = y; canon[3 * v + 2] = z;
    part[4 * v] = 3; part[4 * v + 1] = (y - H.chinY) / hh; share[4 * v + 2] = 1;
  }
  const mesh = { pos, idx: Uint32Array.from(M.idx), skin, wts, canon, part, share, gco };
  mesh.nrm = normals(mesh);
  return mesh;
}

// the style (from the table) with the look's overrides folded in
export function resolveStyle(hair = {}) {
  const st = HAIR_STYLES.find((s) => s.id === hair.style) || HAIR_STYLES.find((s) => s.id === 'swept_side') || HAIR_STYLES[0];
  const p = JSON.parse(JSON.stringify(st.params || {}));
  if (hair.bangs && hair.bangs !== 'none') p.fringe = { ...(p.fringe || {}), kind: hair.bangs };
  if (hair.bangs === 'none') delete p.fringe;
  if (hair.ahoge !== undefined) p.ahoge = !!hair.ahoge;
  if (hair.curl > 0.05 && !p.afro && !p.curls && p.cap) p.curls = { r: 0.07 + 0.05 * hair.curl, n: Math.round(36 + 36 * hair.curl) };
  return { style: st, p };
}

export function hairPieces(ctx, hair = {}, opts = {}) {
  const t0 = now();
  const H = headOf(ctx);
  const { style, p } = resolveStyle(hair);
  const seed = hair.seed ?? [...String(style.id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  IDS = 0;
  const vol = clamp(hair.volume ?? 1, 0.6, 1.5);
  const S = {
    rand: rng(seed), vol: vol * (p.vol ?? 1), lenK: clamp(hair.length ?? 1, 0.4, 2), spiky: clamp((p.spiky ?? 0) + (hair.spikiness ?? 0), 0, 1.2),
    part: hair.part || p.part || 'left', t: (p.cap ? p.cap.t ?? 0.07 : 0.05) * vol, line: p.cap?.line || 'std',
  };
  const hat = hatOf(opts), hatOn = !!hat;
  const M = builder();
  if (p.cap && p.cap.line !== 'none') capPart(M, H, ctx, p.cap, S);
  // under a hat the bangs come out a little lower, from under the brim
  if (p.fringe) fringePart(M, H, hat ? { ...p.fringe, to: Math.min(p.fringe.to ?? (FRINGES[p.fringe.kind || 'straight'] || {}).to ?? 0.12, 0.095) } : p.fringe, S);
  if (p.sides) sidesPart(M, H, p.sides, S);
  if (p.back) backPart(M, H, p.back, S);
  if (p.top) topPart(M, H, p.top, S);
  if (p.crown && !hatOn) crownPart(M, H, p.crown, S);
  if (p.mohawk && !hatOn) mohawkPart(M, H, p.mohawk, S);
  if (p.fall) fallPart(M, H, p.fall, S);
  // under a hat, ties, buns and puffs move below its band
  const below = (az, el, drop = 0.12) => {
    if (!hat) return el;
    const d = H.dir(az, el), z = H.C[2] + d[2] * H.R[2], yb = H.eyeY + H.hh * (hat[1] + (hat[0] - hat[1]) * clamp((z - H.C[2] + H.R[2]) / (2 * H.R[2])));
    return Math.min(el, Math.asin(clamp((yb - H.C[1]) / H.R[1], -1, 1)) - drop);
  };
  S.band = hat ? (q) => q[1] < H.eyeY + H.hh * (hat[1] + (hat[0] - hat[1]) * clamp((q[2] - H.C[2] + H.R[2]) / (2 * H.R[2]))) - 0.03 * H.hh : null;
  for (const t of p.tails || []) { const el = below(t.az ?? PI, t.el ?? 0.6); tailPart(M, H, el < (t.el ?? 0.6) ? { ...t, el, lift: Math.min(t.lift ?? 0.3, -0.1), dir: undefined } : t, S); }
  for (const b of p.braids || []) braidPart(M, H, { ...b, el: below(b.az ?? PI, b.el ?? 0.3) }, S);
  for (const b of p.buns || []) { const el = below(b.az ?? PI, b.el ?? 1, 0.25); if (el > -0.6) bunPart(M, H, { ...b, el, az: el < (b.el ?? 1) - 0.3 && Math.abs(b.az ?? PI) < 2 ? Math.sign(b.az || 1) * 2.4 : b.az }, S); }
  if (p.loops) loopsPart(M, H, p.loops, S);
  if (p.afro) afroPart(M, H, p.afro, S);
  for (const b of p.puffs || []) { const el = below(b.az ?? 1.3, b.el ?? 0.9, 0.3); puffPart(M, H, { ...b, el, az: el < (b.el ?? 0.9) ? Math.sign(b.az || 1) * 1.9 : b.az }, S); }
  if (p.curls) curlsPart(M, H, p.curls, S);
  if (p.ahoge && !hatOn) ahogePart(M, H, typeof p.ahoge === 'object' ? p.ahoge : {}, S);
  const out = [];
  const col = hairColor(hair.color || p.color || 'brown');
  const mesh = finish(M, H, ctx, { hat, eyeGuard: true });
  if (mesh) out.push({ piece: { mesh, hide: null, double: false, layer: 0 }, paint: paintOf(H, hair, p, col, 'hair', opts) });
  // facial hair (adults)
  if (hair.facial && hair.facial !== 'none' && (ctx.A.L.age ?? 30) >= 15) {
    const F = builder();
    facialParts(F, H, ctx, hair.facial);
    const fm = finish(F, H, ctx, { hat: null, weights: () => [[BONE.Head, 1]] });
    if (fm) out.push({ piece: { mesh: fm, hide: null, double: false, layer: 0 }, paint: paintOf(H, { ...hair, color2: null }, p, hairColor(hair.facialColor || hair.color || p.color || 'brown'), hair.facial === 'stubble' ? 'stubble' : 'facial', opts) });
  }
  hairPieces.lastMs = Math.round(now() - t0);
  return out;
}

const lum = (h) => { const n = parseInt(h.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
const MIX = { none: 0, tips: 1, streak: 2, ombre: 3, under: 4 };
function paintOf(H, hair, p, col, what, opts) {
  const c2 = hair.color2 ? hairColor(hair.color2) : null;
  const st = HAIR_STYLES.find((s) => s.id === hair.style) || {};
  // style.json: the band only on glossy hair (and long dark hair)
  const dark = lum(col.base) < 0.25;
  const gloss = hair.highlight ?? p.highlight ?? ((st.tags || []).includes('glossy') && (dark || (st.tags || []).includes('long')));
  const skin = (opts.look && opts.look.skin && opts.look.skin.tone) || '#f6d2b8';
  return {
    what, base: col.base, shade: col.shade, hi: col.hi || lightOf(col.base),
    color2: c2 ? c2.base : col.base, shade2: c2 ? c2.shade : col.shade, mix: c2 ? MIX[hair.mix || 'tips'] ?? 1 : 0,
    highlight: what === 'hair' && gloss ? 1 : 0, lines: what === 'stubble' ? 0 : 1, tie: hair.tie || p.tie || '#e04848', skin,
    headC: H.C.slice(), hh: H.hh, eyeY: H.eyeY,
  };
}

