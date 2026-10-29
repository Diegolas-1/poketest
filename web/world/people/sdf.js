// Signed distance fields for the people generator: bodies, garments, hair and
// props are trees of primitives joined with smooth unions, so shapes melt into
// each other like modelling clay (a thigh into the hip, a cheek into the jaw).
//
// Leaves: sphere, ellipsoid, rcone (a cone with round ends: limbs, fingers),
// box (rounded), torus, disc, plane, and any of them squashed (sc) and turned (q)
// in their own frame. Nodes: union (k = 0: hard) / smin (k: blend width),
// inter / smax, sub (b cut out of a), shell (a hollow skin), offset, and fn (a
// custom field). Every leaf may carry the bone it belongs to (bone) or a blend
// of two along a segment (ramp: [b0, b1, p0, p1]); evalW folds those through the
// blends, so the skin weights of a surface come out of how it was built.
//
// compile(tree) -> { f(x, y, z), box: [min, max] } with bounding boxes on every
// node: far from a node (farther than what can still blend in) its field is not
// evaluated, the distance to its box stands in for it.
import { qinv, qrot, clamp } from './vmath.js';

// ---------- leaves (each gets a field in its own frame) ----------
const L = {
  sphere: (o) => { const r = o.r; return (x, y, z) => Math.sqrt(x * x + y * y + z * z) - r; },
  // ellipsoid (iq's bound): radii o.r = [rx, ry, rz]
  ellipsoid: (o) => {
    const [a, b, c] = o.r;
    return (x, y, z) => {
      const k0 = Math.sqrt((x / a) ** 2 + (y / b) ** 2 + (z / c) ** 2), k1 = Math.sqrt((x / (a * a)) ** 2 + (y / (b * b)) ** 2 + (z / (c * c)) ** 2);
      return k1 < 1e-9 ? -Math.min(a, b, c) : k0 * (k0 - 1) / k1;
    };
  },
  // a cone with round ends from a (radius ra) to b (radius rb); exact (iq)
  rcone: (o) => {
    const [ax, ay, az] = o.a, bx = o.b[0] - ax, by = o.b[1] - ay, bz = o.b[2] - az, r1 = o.ra, r2 = o.rb;
    const l2 = bx * bx + by * by + bz * bz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
    return (x, y, z) => {
      const px = x - ax, py = y - ay, pz = z - az;
      const yy = px * bx + py * by + pz * bz, zz = yy - l2;
      const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy;
      const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    };
  },
  // box with half sizes o.h = [hx, hy, hz] and rounded edges o.round
  box: (o) => {
    const rd = o.round || 0, hx = o.h[0] - rd, hy = o.h[1] - rd, hz = o.h[2] - rd;
    return (x, y, z) => {
      const qx = Math.abs(x) - hx, qy = Math.abs(y) - hy, qz = Math.abs(z) - hz;
      const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
      return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - rd;
    };
  },
  // torus in the xz plane: ring radius o.R, tube o.r
  torus: (o) => { const R = o.R, r = o.r; return (x, y, z) => Math.hypot(Math.hypot(x, z) - R, y) - r; },
  // a flat round disc in the xz plane: radius o.R, half thickness o.h, rounded o.round
  disc: (o) => {
    const R = o.R - (o.round || 0), h = o.h - (o.round || 0), rd = o.round || 0;
    return (x, y, z) => { const dx = Math.hypot(x, z) - R, dy = Math.abs(y) - h; return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - rd; };
  },
  // the half space below a plane through o.p with normal o.n (outside = where n points)
  plane: (o) => { const [nx, ny, nz] = o.n, d = -(o.n[0] * o.p[0] + o.n[1] * o.p[1] + o.n[2] * o.p[2]); return (x, y, z) => nx * x + ny * y + nz * z + d; },
  // a capped cylinder along y: radius o.r, half height o.h
  cyl: (o) => { const r = o.r, h = o.h; return (x, y, z) => { const dx = Math.hypot(x, z) - r, dy = Math.abs(y) - h; return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)); }; },
};

// a leaf's rough bounding box (in its own frame, before q/sc/at)
function leafBox(o) {
  switch (o.t) {
    case 'sphere': return [[-o.r, -o.r, -o.r], [o.r, o.r, o.r]];
    case 'ellipsoid': return [o.r.map((v) => -v), o.r.slice()];
    case 'rcone': {
      const mn = [0, 1, 2].map((i) => Math.min(o.a[i] - o.ra, o.b[i] - o.rb)), mx = [0, 1, 2].map((i) => Math.max(o.a[i] + o.ra, o.b[i] + o.rb));
      return [mn, mx];
    }
    case 'box': return [o.h.map((v) => -v), o.h.slice()];
    case 'torus': return [[-o.R - o.r, -o.r, -o.R - o.r], [o.R + o.r, o.r, o.R + o.r]];
    case 'disc': return [[-o.R, -o.h, -o.R], [o.R, o.h, o.R]];
    case 'cyl': return [[-o.r, -o.h, -o.r], [o.r, o.h, o.r]];
    default: return [[-1e9, -1e9, -1e9], [1e9, 1e9, 1e9]];
  }
}
function boxCorners([a, b]) { const c = []; for (let i = 0; i < 8; i++) c.push([i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]]); return c; }
function boxOf(pts) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); }
  return [mn, mx];
}
const boxUnion = (a, b) => [[0, 1, 2].map((i) => Math.min(a[0][i], b[0][i])), [0, 1, 2].map((i) => Math.max(a[1][i], b[1][i]))];
const boxGrow = (b, k) => [b[0].map((v) => v - k), b[1].map((v) => v + k)];
const boxDist = (b, x, y, z) => {
  const dx = Math.max(b[0][0] - x, 0, x - b[1][0]), dy = Math.max(b[0][1] - y, 0, y - b[1][1]), dz = Math.max(b[0][2] - z, 0, z - b[1][2]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

// ---------- tree builders ----------
// leaves: P.sphere({ c, r }), P.ellipsoid({ c, r: [..], q }), P.rcone({ a, b, ra, rb }), P.box({ c, h, q, round }) ...
// common options: c (centre, not for rcone), q (turn), sc (squash [sx, sy, sz] in the leaf's frame), bone, ramp
export const P = {};
for (const t of Object.keys(L)) P[t] = (o) => ({ ...o, t });
export const union = (...kids) => ({ op: 'smin', k: 0, kids: kids.flat().filter(Boolean) });
export const smin = (k, ...kids) => ({ op: 'smin', k, kids: kids.flat().filter(Boolean) });
export const inter = (...kids) => ({ op: 'smax', k: 0, kids: kids.flat().filter(Boolean) });
export const smax = (k, ...kids) => ({ op: 'smax', k, kids: kids.flat().filter(Boolean) });
export const sub = (k, a, ...cut) => ({ op: 'sub', k, kids: [a, ...cut.flat().filter(Boolean)] });
export const shell = (th, a) => ({ op: 'shell', th, kids: [a] });
export const offset = (d, a) => ({ op: 'offset', d, kids: [a] });
// a custom field: f(x, y, z) and its box [[..], [..]]
export const field = (f, box, o = {}) => ({ op: 'fn', f, box, ...o });
// move a whole subtree by a rigid 4x4 (column-major) matrix: points in the subtree's frame -> world
export const moved = (m, a) => ({ op: 'xform', m, kids: [a] });

// smooth min / max (polynomial) and the blend factor h (share of a)
const sminK = (a, b, k) => { if (k <= 0) return a < b ? a : b; const h = clamp(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); };
const smaxK = (a, b, k) => { if (k <= 0) return a > b ? a : b; const h = clamp(0.5 - 0.5 * (b - a) / k); return b + (a - b) * h + k * h * (1 - h); };
export { sminK as smin2, smaxK as smax2 };

// ---------- compile ----------
// node -> { f(x,y,z) -> d, box }
export function compile(n) {
  if (n.op) return compileOp(n);
  return compileLeaf(n);
}
function leafFrame(n) {
  // world -> leaf: p' = (q^-1 (p - c)) / sc
  const c = n.c || [0, 0, 0], q = n.q || null, sc = n.sc || null, iq = q ? qinv(q) : null;
  return { c, q, iq, sc };
}
function compileLeaf(n) {
  const g = L[n.t](n), { c, q, iq, sc } = leafFrame(n);
  const smin3 = sc ? Math.min(sc[0], sc[1], sc[2]) : 1;
  let f;
  if (!q && !sc) f = c[0] || c[1] || c[2] ? (x, y, z) => g(x - c[0], y - c[1], z - c[2]) : g;
  else {
    const [qx, qy, qz, qw] = iq || [0, 0, 0, 1], s0 = sc ? sc[0] : 1, s1 = sc ? sc[1] : 1, s2 = sc ? sc[2] : 1;
    f = (x, y, z) => {
      let px = x - c[0], py = y - c[1], pz = z - c[2];
      if (iq) {
        const ix = qw * px + qy * pz - qz * py, iy = qw * py + qz * px - qx * pz, iz = qw * pz + qx * py - qy * px, iw = -qx * px - qy * py - qz * pz;
        px = ix * qw + iw * -qx + iy * -qz - iz * -qy; py = iy * qw + iw * -qy + iz * -qx - ix * -qz; pz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
      }
      return g(px / s0, py / s1, pz / s2) * smin3;
    };
  }
  // box in world
  let b = leafBox(n);
  if (sc) b = [b[0].map((v, i) => v * sc[i]), b[1].map((v, i) => v * sc[i])];
  const corners = boxCorners(b).map((p) => { const r = q ? qrot(q, p) : p; return [r[0] + c[0], r[1] + c[1], r[2] + c[2]]; });
  // how much the field may underestimate the true distance (ellipsoids and squashed leaves are bounds)
  let rho = sc ? Math.min(sc[0], sc[1], sc[2]) / Math.max(sc[0], sc[1], sc[2]) : 1;
  if (n.t === 'ellipsoid') rho *= Math.min(...n.r) / Math.max(...n.r);
  return { f, box: n.t === 'plane' ? [[-1e9, -1e9, -1e9], [1e9, 1e9, 1e9]] : boxOf(corners), n, rho };
}
function compileOp(n) {
  if (n.op === 'fn') return { f: n.f, box: n.box, n, rho: n.rho ?? 1 };
  const kids = n.kids.map(compile);
  const r = compileOp2(n, kids);
  r.rho = Math.min(...kids.map((c) => c.rho ?? 1));
  return r;
}
function compileOp2(n, kids) {
  if (n.op === 'xform') {
    const m = n.m, k = kids[0], im = invRigid(m);
    const f = (x, y, z) => k.f(im[0] * x + im[4] * y + im[8] * z + im[12], im[1] * x + im[5] * y + im[9] * z + im[13], im[2] * x + im[6] * y + im[10] * z + im[14]);
    const corners = boxCorners(k.box).map((p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]);
    return { f, box: boxOf(corners), n, kids };
  }
  if (n.op === 'offset') { const k = kids[0], d = n.d; return { f: (x, y, z) => k.f(x, y, z) - d, box: boxGrow(k.box, Math.max(d, 0)), n, kids }; }
  if (n.op === 'shell') { const k = kids[0], h = n.th / 2; return { f: (x, y, z) => Math.abs(k.f(x, y, z) + h) - h, box: k.box, n, kids }; }
  const k = n.k || 0;
  if (n.op === 'smin') {
    let box = kids[0].box; for (const c of kids) box = boxUnion(box, c.box);
    // the kids' values are folded nearest first, so the result does not depend on their
    // order; a kid whose box (times rho: how much its field may underestimate) is a blend
    // width past what was found cannot change it and is not evaluated
    const nk = kids.length, BD = new Float64Array(nk), DV = new Float64Array(nk), RHO = kids.map((c) => c.rho ?? 1), ord = new Int32Array(nk);
    const f = (x, y, z) => {
      let lo = Infinity;
      for (let i = 0; i < nk; i++) { BD[i] = boxDist(kids[i].box, x, y, z) * RHO[i]; DV[i] = NaN; if (BD[i] < lo) lo = BD[i]; }
      let d = Infinity;
      for (let pass = 0; pass < 3; pass++) {
        let more = false, m = 0;
        for (let i = 0; i < nk; i++) {
          if (Number.isNaN(DV[i]) && BD[i] < (d === Infinity ? lo : d) + k + 1e-9) { DV[i] = kids[i].f(x, y, z); more = true; }
          if (!Number.isNaN(DV[i])) ord[m++] = i;
        }
        if (!more && d !== Infinity) break;
        // insertion sort by value, then fold
        for (let a = 1; a < m; a++) { const t = ord[a]; let j = a - 1; while (j >= 0 && DV[ord[j]] > DV[t]) { ord[j + 1] = ord[j]; j--; } ord[j + 1] = t; }
        d = m ? DV[ord[0]] : Infinity;
        for (let a = 1; a < m; a++) d = sminK(d, DV[ord[a]], k);
      }
      return d === Infinity ? lo : d;
    };
    return { f, box, n, kids };
  }
  if (n.op === 'smax') {
    let box = kids[0].box;
    for (const c of kids.slice(1)) box = [[0, 1, 2].map((i) => Math.max(box[0][i], c.box[0][i])), [0, 1, 2].map((i) => Math.min(box[1][i], c.box[1][i]))];
    const nk = kids.length;
    const f = (x, y, z) => { let d = kids[0].f(x, y, z); for (let i = 1; i < nk; i++) d = smaxK(d, kids[i].f(x, y, z), k); return d; };
    return { f, box, n, kids };
  }
  if (n.op === 'sub') {
    const a = kids[0], cuts = kids.slice(1), CB = cuts.map((c) => boxGrow(c.box, k));
    const f = (x, y, z) => {
      let d = a.f(x, y, z);
      for (let i = 0; i < cuts.length; i++) { if (boxDist(CB[i], x, y, z) > 0) continue; d = smaxK(d, -cuts[i].f(x, y, z), k); }
      return d;
    };
    return { f, box: a.box, n, kids };
  }
  throw new Error('sdf: unknown op ' + n.op);
}
function invRigid(m) {
  const o = new Float64Array(16);
  o[0] = m[0]; o[1] = m[4]; o[2] = m[8]; o[4] = m[1]; o[5] = m[5]; o[6] = m[9]; o[8] = m[2]; o[9] = m[6]; o[10] = m[10]; o[15] = 1;
  o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]); o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]); o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
  return o;
}

// ---------- weights ----------
// evalW(compiled, x, y, z) -> { d, w: Map bone -> weight } (bones from leaves'
// bone / ramp, blended the way the field is)
export function evalW(c, x, y, z) {
  const n = c.n;
  if (!n.op || n.op === 'fn') {
    const d = c.f(x, y, z), w = new Map();
    if (n.ramp) {
      const [b0, b1, p0, p1] = n.ramp, ax = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], l2 = ax[0] ** 2 + ax[1] ** 2 + ax[2] ** 2;
      let t = ((x - p0[0]) * ax[0] + (y - p0[1]) * ax[1] + (z - p0[2]) * ax[2]) / l2;
      t = clamp(t); t = t * t * (3 - 2 * t);
      if (b0 === b1) w.set(b0, 1); else { w.set(b0, 1 - t); w.set(b1, t); }
    } else if (n.bone !== undefined && n.bone >= 0) w.set(n.bone, 1);
    return { d, w };
  }
  if (n.op === 'xform') {
    const im = invRigid(n.m);
    return evalW(c.kids[0], im[0] * x + im[4] * y + im[8] * z + im[12], im[1] * x + im[5] * y + im[9] * z + im[13], im[2] * x + im[6] * y + im[10] * z + im[14]);
  }
  if (n.op === 'offset') { const r = evalW(c.kids[0], x, y, z); r.d -= n.d; return r; }
  if (n.op === 'shell') { const r = evalW(c.kids[0], x, y, z); r.d = Math.abs(r.d + n.th / 2) - n.th / 2; return r; }
  if (n.op === 'sub') { const r = evalW(c.kids[0], x, y, z); r.d = c.f(x, y, z); return r; }
  const k = n.k || 0;
  if (n.op === 'smin') {
    const rs = c.kids.map((kid) => evalW(kid, x, y, z)).sort((p, q) => p.d - q.d);
    let acc = rs[0];
    for (const r of rs.slice(1)) {
      let h = k > 0 ? clamp(0.5 + 0.5 * (r.d - acc.d) / k) : acc.d < r.d ? 1 : 0;
      if (!r.w.size) h = 1; else if (!acc.w.size) h = 0;   // a part with no bone takes no weight
      if (h >= 1) { acc = { d: sminK(acc.d, r.d, k), w: acc.w }; continue; }
      const w = new Map();
      for (const [b, v] of acc.w) w.set(b, (w.get(b) || 0) + v * h);
      for (const [b, v] of r.w) w.set(b, (w.get(b) || 0) + v * (1 - h));
      acc = { d: sminK(acc.d, r.d, k), w };
    }
    return acc;
  }
  // smax (intersection): the share of the larger
  let acc = null;
  for (const kid of c.kids) {
    const r = evalW(kid, x, y, z);
    if (!acc) { acc = r; continue; }
    let h = k > 0 ? clamp(0.5 - 0.5 * (r.d - acc.d) / k) : acc.d > r.d ? 1 : 0;
    if (!r.w.size) h = 1; else if (!acc.w.size) h = 0;   // a cutter with no bone (a plane) takes no weight
    const w = new Map();
    for (const [b, v] of acc.w) w.set(b, (w.get(b) || 0) + v * h);
    for (const [b, v] of r.w) w.set(b, (w.get(b) || 0) + v * (1 - h));
    acc = { d: smaxK(acc.d, r.d, k), w };
  }
  return acc;
}

// gradient by central differences
export function grad(f, x, y, z, e = 1e-4) {
  const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
  return [gx / (2 * e), gy / (2 * e), gz / (2 * e)];
}
