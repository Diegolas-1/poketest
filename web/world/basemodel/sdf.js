// Signed distance primitives for the base body and the field made of them.
// Every primitive is { d(x, y, z), lo, hi, k, op, bone }: d is the (approximate)
// signed distance in metres, lo/hi its bounds, k the radius it blends into the
// shapes before it with, op 'add' | 'sub', bone the bone(s) it moves with
// (an index, or (x, y, z) => [[index, weight], ...]).
import * as THREE from 'three';

const V3 = THREE.Vector3;

export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export const smax = (a, b, k) => -smin(-a, -b, k);
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

function prim(d, lo, hi, o) { return { d, lo, hi, k: o.k ?? 0.01, op: o.op || 'add', bone: o.bone ?? 0, name: o.name || '' }; }

// ellipsoid at c with radii r; rot (Matrix3, local -> world) optional
export function ellipsoid(c, r, o = {}) {
  const m = o.rot ? o.rot.clone().transpose().elements : null;
  const [rx, ry, rz] = r, R = Math.max(rx, ry, rz);
  return prim((x, y, z) => {
    let px = x - c.x, py = y - c.y, pz = z - c.z;
    if (m) { const qx = m[0] * px + m[3] * py + m[6] * pz, qy = m[1] * px + m[4] * py + m[7] * pz, qz = m[2] * px + m[5] * py + m[8] * pz; px = qx; py = qy; pz = qz; }
    const k0 = Math.hypot(px / rx, py / ry, pz / rz), k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
    return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
  }, [c.x - R, c.y - R, c.z - R], [c.x + R, c.y + R, c.z + R], o);
}

// capsule from a (radius ra) to b (radius rb)
export function roundCone(a, b, ra, rb, o = {}) {
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const l2 = bax * bax + bay * bay + baz * baz, rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2, R = Math.max(ra, rb);
  return prim((x, y, z) => {
    const pax = x - a.x, pay = y - a.y, paz = z - a.z;
    const yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
    const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra;
  }, [Math.min(a.x, b.x) - R, Math.min(a.y, b.y) - R, Math.min(a.z, b.z) - R], [Math.max(a.x, b.x) + R, Math.max(a.y, b.y) + R, Math.max(a.z, b.z) + R], o);
}

// box with rounded edges: centre c, unit axes ax/ay/az, half sizes h (inside the rounding r)
export function roundBox(c, ax, ay, az, h, r, o = {}) {
  const R = Math.hypot(...h) + r;
  return prim((x, y, z) => {
    const px = x - c.x, py = y - c.y, pz = z - c.z;
    const qx = Math.abs(px * ax.x + py * ax.y + pz * ax.z) - h[0];
    const qy = Math.abs(px * ay.x + py * ay.y + pz * ay.z) - h[1];
    const qz = Math.abs(px * az.x + py * az.y + pz * az.z) - h[2];
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  }, [c.x - R, c.y - R, c.z - R], [c.x + R, c.y + R, c.z + R], o);
}

// A solid lofted up the y axis through cross-sections read off the sheets:
// rows { y, cx, cz, w, d, eB, eF, tF, tB } (centre, half width and depth, the
// superellipse exponent behind and in front, and how much the width narrows
// towards the front and back). Rows are interpolated with Catmull-Rom splines.
export function loft(rows, o = {}) {
  rows = [...rows].sort((a, b) => a.y - b.y);
  const keys = ['cx', 'cz', 'w', 'd', 'eB', 'eF', 'tF', 'tB'];
  for (const r of rows) for (const k of keys) r[k] ??= k[0] === 'e' ? 2 : 0;
  const n = rows.length, y0 = rows[0].y, y1 = rows[n - 1].y;
  const at = {};
  const row = (y) => {
    let i = 0;
    while (i < n - 2 && rows[i + 1].y < y) i++;
    const a = rows[Math.max(i - 1, 0)], b = rows[i], c = rows[i + 1], dd = rows[Math.min(i + 2, n - 1)];
    const t = clamp((y - b.y) / (c.y - b.y)), t2 = t * t, t3 = t2 * t;
    for (const k of keys) {
      const p0 = a[k], p1 = b[k], p2 = c[k], p3 = dd[k];
      at[k] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    }
    return at;
  };
  let lo = [Infinity, y0, Infinity], hi = [-Infinity, y1, -Infinity];
  for (const r of rows) { lo[0] = Math.min(lo[0], r.cx - r.w); hi[0] = Math.max(hi[0], r.cx + r.w); lo[2] = Math.min(lo[2], r.cz - r.d); hi[2] = Math.max(hi[2], r.cz + r.d); }
  const mir = o.mirror ? -1 : 1;
  if (o.mirror) [lo[0], hi[0]] = [-hi[0], -lo[0]];
  const p = prim((x, y, z) => {
    const r = row(clamp(y, y0, y1));
    const dx = x * mir - r.cx, dz = z - r.cz;
    const front = dz > 0, e = front ? r.eF : r.eB, uz0 = Math.min(Math.abs(dz) / r.d, 1);
    const w = r.w * (1 - (front ? r.tF : r.tB) * uz0 * Math.sqrt(uz0));
    const ux = Math.abs(dx) / w, uz = Math.abs(dz) / r.d;
    const nn = Math.pow(Math.pow(ux, e) + Math.pow(uz, e), 1 / e), q = Math.hypot(dx, dz);
    const rad = nn > 1e-6 ? q * (1 - 1 / nn) : -Math.min(w, r.d);
    const v = Math.max(y0 - y, y - y1);
    if (v > 0) return rad > 0 ? Math.hypot(rad, v) : v;
    return Math.max(rad, v);
  }, lo, hi, o);
  p.row = row;
  return p;
}

// The field: the primitives' smooth union (then the cuts), clipped at the
// ground (y = 0). Primitives are looked up through a coarse grid of lists.
export class Field {
  constructor(prims, o = {}) {
    this.prims = prims;
    this.ground = o.ground ?? 0;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of prims) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p.lo[i] - p.k); hi[i] = Math.max(hi[i], p.hi[i] + p.k); }
    this.lo = lo; this.hi = hi;
    const c = this.cell = o.cell ?? 0.02, pad = o.pad ?? 0.02;
    this.n = lo.map((l, i) => Math.ceil((hi[i] - l) / c) + 1);
    this.lists = new Array(this.n[0] * this.n[1] * this.n[2]).fill(null);
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i], a = [], b = [];
      for (let j = 0; j < 3; j++) { a[j] = Math.max(0, Math.floor((p.lo[j] - p.k - pad - lo[j]) / c)); b[j] = Math.min(this.n[j] - 1, Math.floor((p.hi[j] + p.k + pad - lo[j]) / c)); }
      for (let z = a[2]; z <= b[2]; z++) for (let y = a[1]; y <= b[1]; y++) for (let x = a[0]; x <= b[0]; x++) {
        const id = x + this.n[0] * (y + this.n[1] * z);
        (this.lists[id] ||= []).push(i);
      }
    }
  }
  list(x, y, z) {
    const c = this.cell, i = Math.floor((x - this.lo[0]) / c), j = Math.floor((y - this.lo[1]) / c), k = Math.floor((z - this.lo[2]) / c);
    if (i < 0 || j < 0 || k < 0 || i >= this.n[0] || j >= this.n[1] || k >= this.n[2]) return null;
    return this.lists[i + this.n[0] * (j + this.n[1] * k)];
  }
  // distance outside the field's bounds, for points with no primitive near
  far(x, y, z) {
    const dx = Math.max(this.lo[0] - x, x - this.hi[0], 0), dy = Math.max(this.lo[1] - y, y - this.hi[1], 0), dz = Math.max(this.lo[2] - z, z - this.hi[2], 0);
    return Math.max(Math.hypot(dx, dy, dz), this.cell);
  }
  d(x, y, z) {
    const L = this.list(x, y, z);
    if (!L) return this.far(x, y, z);
    let d = Infinity, cut = -Infinity, ck = 0;
    for (const i of L) {
      const p = this.prims[i];
      if (p.op === 'sub') { const v = -p.d(x, y, z); if (v > cut) { cut = v; ck = p.k; } continue; }
      d = smin(d, p.d(x, y, z), p.k);
    }
    if (d === Infinity) return this.cell;
    if (cut > -Infinity) d = smax(d, cut, ck);
    return smax(d, this.ground - y, 0.003);
  }
  grad(x, y, z, e = 0.0007) {
    const gx = this.d(x + e, y, z) - this.d(x - e, y, z), gy = this.d(x, y + e, z) - this.d(x, y - e, z), gz = this.d(x, y, z + e) - this.d(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l, l / (2 * e)];
  }
  // bone weights at a surface point: each primitive near it pulls its bones in,
  // the more the closer it comes to the surface there
  weights(x, y, z, nb, tau = 0.005) {
    const L = this.list(x, y, z), acc = new Float64Array(nb);
    if (!L) return acc;
    const ds = [];
    let dmin = Infinity;
    for (const i of L) { const p = this.prims[i]; if (p.op !== 'add') continue; const v = p.d(x, y, z); ds.push([p, v]); dmin = Math.min(dmin, v); }
    for (const [p, v] of ds) {
      const c = Math.exp(-Math.max(0, v - dmin) / tau);
      if (c < 1e-4) continue;
      if (typeof p.bone === 'function') for (const [b, w] of p.bone(x, y, z)) acc[b] += c * w;
      else acc[p.bone] += c;
    }
    return acc;
  }
}

export { V3 };
