// Small vector, quaternion and matrix helpers on plain arrays, for the people
// generator (people/*.js). No three.js here: the generator also runs in a
// worker and in node (tools/people/), on typed arrays.
//
// vectors [x, y, z], quaternions [x, y, z, w], matrices 4x4 column-major
// Float64Array(16) (three.js' layout, so m.elements can take them as they are).

export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const madd = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
export const mirror = (p) => [-p[0], p[1], p[2]];

// ---------- quaternions ----------
export const qid = () => [0, 0, 0, 1];
export function qmul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz, az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz];
}
export const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
export function qnorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
export function qaxis(ax, ang) { const a = norm(ax), s = Math.sin(ang / 2); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)]; }
export function qrot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
// the shortest rotation taking direction a to direction b
export function qfromTo(a, b) {
  a = norm(a); b = norm(b);
  const d = dot(a, b);
  if (d < -0.999999) { let ax = cross([1, 0, 0], a); if (len(ax) < 1e-6) ax = cross([0, 1, 0], a); return qaxis(ax, Math.PI); }
  const c = cross(a, b);
  return qnorm([c[0], c[1], c[2], 1 + d]);
}

// ---------- matrices ----------
export function mcompose(t, q, s = [1, 1, 1]) {
  const [x, y, z, w] = q, m = new Float64Array(16);
  const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  m[0] = (1 - (yy + zz)) * s[0]; m[1] = (xy + wz) * s[0]; m[2] = (xz - wy) * s[0];
  m[4] = (xy - wz) * s[1]; m[5] = (1 - (xx + zz)) * s[1]; m[6] = (yz + wx) * s[1];
  m[8] = (xz + wy) * s[2]; m[9] = (yz - wx) * s[2]; m[10] = (1 - (xx + yy)) * s[2];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
  return m;
}
export function mmul(a, b) {
  const m = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    m[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return m;
}
export function minv(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06, k = 1 / det, o = new Float64Array(16);
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * k; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * k;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * k; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * k;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * k; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * k;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * k; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * k;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * k; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * k;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * k; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * k;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * k; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * k;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * k; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * k;
  return o;
}
export const mpt = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
export const mdir = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];

// a seeded random generator (mulberry32)
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
