// One body mesh for everybody: the base (tools/people/build_base.mjs makes it
// once, from a reference body, finely meshed and cut down to clean, even
// triangles, with its skin weights) is fitted to any person's field:
//   1. every vertex is carried by its bones from the reference skeleton to the
//      person's, each bone also stretched along itself and swelled across by
//      how much longer and thicker that part of this person is;
//   2. Newton steps put it on this person's surface exactly;
//   3. tangential relaxing evens the triangles out again (and back onto the surface).
// The vertices keep their place on the body (the tip of the nose stays the tip of
// the nose), so the base's UVs, paint coordinates and weights hold for everyone,
// and the sliders can be dragged live.
import { NB, PARENT } from './rig.js';
import { mmul, minv } from './vmath.js';
import { project, relax, normals } from './mesh.js';

const col = (m, i) => [m[4 * i], m[4 * i + 1], m[4 * i + 2]];
// first child of each bone (for its length)
const CHILD = (() => { const c = new Array(NB).fill(-1); for (let i = NB - 1; i >= 0; i--) if (PARENT[i] >= 0) c[PARENT[i]] = i; return c; })();
// the bones that make the main line of a limb, where the "first child" is not the one to measure to
const MAIN = { Spine3: 'Neck', LHand: 'LFingerC1', RHand: 'RFingerC1', Hips: null };

// how far from p along d the surface is, leaving the inside (or null)
function exitDist(f, p, d, maxT) {
  if (f(p[0], p[1], p[2]) > 0) return null;
  let t = 0;
  for (let i = 0; i < 200 && t < maxT; i++) {
    const x = p[0] + d[0] * t, y = p[1] + d[1] * t, z = p[2] + d[2] * t, v = f(x, y, z);
    if (v > 0) {   // bisect back to the surface
      let a = t - Math.max(Math.abs(v), 1e-4) * 2, b = t;
      a = Math.max(0, a);
      for (let k = 0; k < 20; k++) { const m = (a + b) / 2; if (f(p[0] + d[0] * m, p[1] + d[1] * m, p[2] + d[2] * m) > 0) b = m; else a = m; }
      return (a + b) / 2;
    }
    t += Math.max(-v, 5e-4);
  }
  return null;
}

// per bone: [length along x, half thickness along y, along z] in the posed field f (world matrices aw)
export function measureBones(f, aw, names) {
  const out = new Float64Array(NB * 3).fill(0);
  for (let b = 0; b < NB; b++) {
    const m = aw[b], o = [m[12], m[13], m[14]], X = col(m, 0), Y = col(m, 1), Z = col(m, 2);
    let c = CHILD[b];
    if (names && MAIN[names[b]] !== undefined) c = MAIN[names[b]] === null ? -1 : names.indexOf(MAIN[names[b]]);
    let len;
    if (c >= 0) { const q = aw[c]; len = Math.hypot(q[12] - o[0], q[13] - o[1], q[14] - o[2]); }
    else len = exitDist(f, o, X, 0.6) || 0.05;
    const mid = [o[0] + X[0] * len * 0.5, o[1] + X[1] * len * 0.5, o[2] + X[2] * len * 0.5];
    const r = (d) => { const a = exitDist(f, mid, d, 0.5), b2 = exitDist(f, mid, d.map((v) => -v), 0.5); return a && b2 ? (a + b2) / 2 : a || b2 || 0; };
    out[3 * b] = len; out[3 * b + 1] = r(Y); out[3 * b + 2] = r(Z);
  }
  return out;
}

// the base fitted to a person: base { pos, idx, skin (Uint16 x4), wts (Float32 x4), aw0, meas0 }, A (anatomy), field (compiled posed field)
export function fit(base, A, field, o = {}) {
  const meas = measureBones(field.f, A.aw, o.names);
  // per bone: reference A pose -> scaled in the bone's frame -> person's A pose
  const M = [];
  for (let b = 0; b < NB; b++) {
    const m0 = base.aw0.subarray(16 * b, 16 * b + 16);
    const k = (i) => { const a = base.meas0[3 * b + i], c = meas[3 * b + i]; return a > 1e-5 && c > 1e-5 ? Math.min(4, Math.max(0.25, c / a)) : 1; };
    const s = [k(0), k(1) || 1, k(2) || 1];
    const S = new Float64Array([s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, 0, 0, 0, 1]);
    M.push(mmul(A.aw[b], mmul(S, minv(m0))));
  }
  const n = base.pos.length / 3, P = new Float32Array(base.pos.length), src = base.pos, J = base.skin, W = base.wts;
  for (let v = 0; v < n; v++) {
    const x = src[3 * v], y = src[3 * v + 1], z = src[3 * v + 2];
    let ox = 0, oy = 0, oz = 0;
    for (let k = 0; k < 4; k++) {
      const w = W[4 * v + k]; if (!w) continue;
      const m = M[J[4 * v + k]];
      ox += w * (m[0] * x + m[4] * y + m[8] * z + m[12]); oy += w * (m[1] * x + m[5] * y + m[9] * z + m[13]); oz += w * (m[2] * x + m[6] * y + m[10] * z + m[14]);
    }
    P[3 * v] = ox; P[3 * v + 1] = oy; P[3 * v + 2] = oz;
  }
  const mesh = { pos: P, idx: base.idx };
  project(mesh, field.f, o.steps ?? 5, 0.03);
  if ((o.relax ?? 2) > 0) relax(mesh, o.relax ?? 2, 0.4, field.f, base.nb || null, base.lock || null);
  mesh.nrm = normals(mesh);
  return mesh;
}
