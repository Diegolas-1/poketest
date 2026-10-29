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
import { evalW } from './sdf.js';
import { project, relax, normals, smoothNormals } from './mesh.js';

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
  const P0 = P.slice();
  project(mesh, field.f, o.steps ?? 5, 0.03);
  guardSnaps(mesh, P0, field, J, W, base.share);
  if ((o.relax ?? 2) > 0) relax(mesh, o.relax ?? 2, 0.4, field.f, base.nb || null, base.lock || null);
  untangle(mesh, field.f, base.nb, o.untangle ?? 4);
  mesh.nrm = normals(mesh);
  smoothNormals(mesh, base.nb, o.nsmooth ?? 2, 0.5);
  return mesh;
}

// triangles folded over (facing against their corners' normals) are smoothed out
// with their neighbourhood and put back on the surface
export function untangle(mesh, f, nb, iters = 4) {
  const P = mesh.pos, I = mesh.idx, n = P.length / 3;
  for (let it = 0; it < iters; it++) {
    const N = normals(mesh), bad = new Uint8Array(n);
    let count = 0;
    for (let t = 0; t < I.length; t += 3) {
      const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
      const mx = N[a] + N[b] + N[c], my = N[a + 1] + N[b + 1] + N[c + 1], mz = N[a + 2] + N[b + 2] + N[c + 2];
      if (l < 1e-12 || (nx * mx + ny * my + nz * mz) < 0.3 * l * Math.hypot(mx, my, mz)) { bad[I[t]] = bad[I[t + 1]] = bad[I[t + 2]] = 1; count++; }
    }
    if (!count) return;
    // grow the region by a ring, smooth it (plain Laplacian), back onto the surface
    const grow = bad.slice();
    for (let v = 0; v < n; v++) if (bad[v]) for (let j = nb.start[v]; j < nb.start[v + 1]; j++) grow[nb.list[j]] = 1;
    for (let k = 0; k < 3; k++) {
      const Q = new Float32Array(P);
      for (let v = 0; v < n; v++) {
        if (!grow[v]) continue;
        let x = 0, y = 0, z = 0; const s = nb.start[v], e = nb.start[v + 1];
        for (let j = s; j < e; j++) { const q = 3 * nb.list[j]; x += P[q]; y += P[q + 1]; z += P[q + 2]; }
        const cnt = e - s; Q[3 * v] = x / cnt; Q[3 * v + 1] = y / cnt; Q[3 * v + 2] = z / cnt;
      }
      P.set(Q);
    }
    projectSome(P, f, grow);
  }
}
function projectSome(P, f, mask, e = 2e-4) {
  for (let v = 0; v < P.length / 3; v++) {
    if (!mask[v]) continue;
    let x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
    for (let it = 0; it < 4; it++) {
      const d = f(x, y, z); if (Math.abs(d) < 1e-6) break;
      const gx = (f(x + e, y, z) - f(x - e, y, z)) / (2 * e), gy = (f(x, y + e, z) - f(x, y - e, z)) / (2 * e), gz = (f(x, y, z + e) - f(x, y, z - e)) / (2 * e), g2 = gx * gx + gy * gy + gz * gz;
      if (g2 < 1e-12) break;
      let s = d / g2; const st = Math.abs(s) * Math.sqrt(g2); if (st > 0.02) s *= 0.02 / st;
      x -= gx * s; y -= gy * s; z -= gz * s;
    }
    P[3 * v] = x; P[3 * v + 1] = y; P[3 * v + 2] = z;
  }
}

// a vertex that moved far onto a part of the body made by other bones (a foot's inside
// onto the other foot, a finger onto its neighbour) is put back and brought onto its
// own part in small steps
function guardSnaps(mesh, P0, field, J, W, share, far = 0.008) {
  const P = mesh.pos, n = P.length / 3;
  for (let v = 0; v < n; v++) {
    // only limbs can land on a neighbour (the trunk and head have none to land on)
    if (share && share[4 * v] < 0.5 && share[4 * v + 1] < 0.5 && share[4 * v + 3] < 0.2) continue;
    const dx = P[3 * v] - P0[3 * v], dy = P[3 * v + 1] - P0[3 * v + 1], dz = P[3 * v + 2] - P0[3 * v + 2];
    if (dx * dx + dy * dy + dz * dz < far * far) continue;
    const r = evalW(field, P[3 * v], P[3 * v + 1], P[3 * v + 2]);
    let own = 0;
    for (let k = 0; k < 4; k++) if (W[4 * v + k]) own += (r.w.get(J[4 * v + k]) || 0) * Math.min(1, W[4 * v + k] * 2);
    if (own > 0.25) continue;
    P[3 * v] = P0[3 * v]; P[3 * v + 1] = P0[3 * v + 1]; P[3 * v + 2] = P0[3 * v + 2];
    project({ pos: P.subarray(3 * v, 3 * v + 3) }, field.f, 8, 0.003);
  }
}
