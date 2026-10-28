// Meshing for the people generator: a field (sdf.js) to triangles, and the
// clean-up that makes them a good model to skin and to shade with flat light
// bands: surface nets on a sparse grid (only the blocks the surface passes
// through are sampled finely), Newton steps onto the true surface, tangential
// relaxing (even triangles), and quadric decimation (Garland-Heckbert) down to
// a vertex budget, with a density weight so faces and hands keep more.
//
// A mesh here is { pos: Float32Array (x y z ...), idx: Uint32Array (triangles) }.

// ---------- surface nets ----------
// f(x, y, z): field (negative inside); box [[x0, y0, z0], [x1, y1, z1]]; cell size h.
// opts.B: fine cells per block side (8); opts.keep(x, y, z): false drops that cell's vertex (and its quads)
export function surfaceNets(f, box, h, opts = {}) {
  const B = opts.B || 8, pad = 2 * h;
  const o = box[0].map((v) => v - pad), size = box[1].map((v, i) => v + pad - o[i]);
  const nx = Math.ceil(size[0] / h), ny = Math.ceil(size[1] / h), nz = Math.ceil(size[2] / h);
  const bx = Math.ceil(nx / B), by = Math.ceil(ny / B), bz = Math.ceil(nz / B);
  const bh = B * h, reach = bh * 0.8660254 + 1.5 * h;   // block half diagonal (+ a margin)
  // 1. blocks the surface may pass through (centre value within reach), grown by one
  const near = new Uint8Array(bx * by * bz);
  for (let k = 0; k < bz; k++) for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
    const d = f(o[0] + (i + 0.5) * bh, o[1] + (j + 0.5) * bh, o[2] + (k + 0.5) * bh);
    if (Math.abs(d) <= reach) near[i + bx * (j + by * k)] = 1;
  }
  const act = new Uint8Array(near.length);
  for (let k = 0; k < bz; k++) for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
    if (!near[i + bx * (j + by * k)]) continue;
    for (let c = -1; c <= 1; c++) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const I = i + a, J = j + b, K = k + c;
      if (I >= 0 && J >= 0 && K >= 0 && I < bx && J < by && K < bz) act[I + bx * (J + by * K)] = 1;
    }
  }
  // 2. corner values of the active blocks ((B+1)^3 each)
  const B1 = B + 1, vals = new Map();
  for (let bi = 0; bi < act.length; bi++) {
    if (!act[bi]) continue;
    const i0 = (bi % bx) * B, j0 = (Math.floor(bi / bx) % by) * B, k0 = Math.floor(bi / (bx * by)) * B;
    const v = new Float32Array(B1 * B1 * B1);
    let any = false, s0 = 0;
    for (let c = 0, n = 0; c < B1; c++) for (let b = 0; b < B1; b++) for (let a = 0; a < B1; a++, n++) {
      const d = v[n] = f(o[0] + (i0 + a) * h, o[1] + (j0 + b) * h, o[2] + (k0 + c) * h);
      const s = d < 0 ? -1 : 1;
      if (n === 0) s0 = s; else if (s !== s0) any = true;
    }
    if (any) vals.set(bi, v);
  }
  // 3. a vertex in every cell with a sign change: the mean of its edge crossings
  const verts = [], cellV = new Map();
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cx = [0, 1, 0, 1, 0, 1, 0, 1], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1];
  const cv = new Float64Array(8);
  for (const [bi, v] of vals) {
    const i0 = (bi % bx) * B, j0 = (Math.floor(bi / bx) % by) * B, k0 = Math.floor(bi / (bx * by)) * B;
    for (let c = 0; c < B; c++) for (let b = 0; b < B; b++) for (let a = 0; a < B; a++) {
      let inside = 0;
      for (let q = 0; q < 8; q++) { const d = cv[q] = v[(a + cx[q]) + B1 * ((b + cy[q]) + B1 * (c + cz[q]))]; if (d < 0) inside++; }
      if (inside === 0 || inside === 8) continue;
      let sx = 0, sy = 0, sz = 0, m = 0;
      for (const [p, q] of E) {
        const dp = cv[p], dq = cv[q];
        if ((dp < 0) === (dq < 0)) continue;
        const t = dp / (dp - dq);
        sx += cx[p] + (cx[q] - cx[p]) * t; sy += cy[p] + (cy[q] - cy[p]) * t; sz += cz[p] + (cz[q] - cz[p]) * t; m++;
      }
      const x = o[0] + (i0 + a + sx / m) * h, y = o[1] + (j0 + b + sy / m) * h, z = o[2] + (k0 + c + sz / m) * h;
      if (opts.keep && !opts.keep(x, y, z)) continue;
      cellV.set((i0 + a) + nx * ((j0 + b) + ny * (k0 + c)), verts.length / 3);
      verts.push(x, y, z);
    }
  }
  // 4. a quad across every edge with a sign change, between the four cells round it
  const tris = [];
  const P = verts;
  const quad = (a, b, c, d) => {
    // split along the shorter diagonal
    const d1 = (P[3 * a] - P[3 * c]) ** 2 + (P[3 * a + 1] - P[3 * c + 1]) ** 2 + (P[3 * a + 2] - P[3 * c + 2]) ** 2;
    const d2 = (P[3 * b] - P[3 * d]) ** 2 + (P[3 * b + 1] - P[3 * d + 1]) ** 2 + (P[3 * b + 2] - P[3 * d + 2]) ** 2;
    if (d1 < d2) tris.push(a, b, c, a, c, d); else tris.push(a, b, d, b, c, d);
  };
  const cell = (i, j, k) => cellV.get(i + nx * (j + ny * k));
  for (const [bi, v] of vals) {
    const i0 = (bi % bx) * B, j0 = (Math.floor(bi / bx) % by) * B, k0 = Math.floor(bi / (bx * by)) * B;
    for (let c = 0; c < B; c++) for (let b = 0; b < B; b++) for (let a = 0; a < B; a++) {
      const d0 = v[a + B1 * (b + B1 * c)], i = i0 + a, j = j0 + b, k = k0 + c;
      const s0 = d0 < 0;
      // +x edge: cells (i, j-1..j, k-1..k)
      if (j > 0 && k > 0 && ((v[(a + 1) + B1 * (b + B1 * c)] < 0) !== s0)) {
        const q0 = cell(i, j - 1, k - 1), q1 = cell(i, j, k - 1), q2 = cell(i, j, k), q3 = cell(i, j - 1, k);
        if (q0 !== undefined && q1 !== undefined && q2 !== undefined && q3 !== undefined) s0 ? quad(q0, q1, q2, q3) : quad(q3, q2, q1, q0);
      }
      // +y edge: cells (i-1..i, j, k-1..k)
      if (i > 0 && k > 0 && ((v[a + B1 * ((b + 1) + B1 * c)] < 0) !== s0)) {
        const q0 = cell(i - 1, j, k - 1), q1 = cell(i - 1, j, k), q2 = cell(i, j, k), q3 = cell(i, j, k - 1);
        if (q0 !== undefined && q1 !== undefined && q2 !== undefined && q3 !== undefined) s0 ? quad(q0, q1, q2, q3) : quad(q3, q2, q1, q0);
      }
      // +z edge: cells (i-1..i, j-1..j, k)
      if (i > 0 && j > 0 && ((v[a + B1 * (b + B1 * (c + 1))] < 0) !== s0)) {
        const q0 = cell(i - 1, j - 1, k), q1 = cell(i, j - 1, k), q2 = cell(i, j, k), q3 = cell(i - 1, j, k);
        if (q0 !== undefined && q1 !== undefined && q2 !== undefined && q3 !== undefined) s0 ? quad(q0, q1, q2, q3) : quad(q3, q2, q1, q0);
      }
    }
  }
  return { pos: new Float32Array(verts), idx: new Uint32Array(tris) };
}

// ---------- adjacency ----------
// vertex neighbours as CSR: { start: Int32Array(n+1), list: Int32Array }
export function neighbours(mesh) {
  const n = mesh.pos.length / 3, I = mesh.idx, sets = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    sets[a].add(b); sets[a].add(c); sets[b].add(a); sets[b].add(c); sets[c].add(a); sets[c].add(b);
  }
  const start = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + sets[i].size;
  const list = new Int32Array(start[n]);
  for (let i = 0; i < n; i++) { let k = start[i]; for (const j of sets[i]) list[k++] = j; }
  return { start, list };
}

export function normals(mesh) {
  const P = mesh.pos, I = mesh.idx, N = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}

// Newton steps of every vertex onto the zero set of f (steps clamped to maxStep)
export function project(mesh, f, iters = 4, maxStep = 0.02, e = 2e-4) {
  const P = mesh.pos;
  for (let v = 0; v < P.length; v += 3) {
    let x = P[v], y = P[v + 1], z = P[v + 2];
    for (let it = 0; it < iters; it++) {
      const d = f(x, y, z);
      if (Math.abs(d) < 1e-6) break;
      const gx = (f(x + e, y, z) - f(x - e, y, z)) / (2 * e), gy = (f(x, y + e, z) - f(x, y - e, z)) / (2 * e), gz = (f(x, y, z + e) - f(x, y, z - e)) / (2 * e);
      const g2 = gx * gx + gy * gy + gz * gz;
      if (g2 < 1e-12) break;
      let s = d / g2;
      const step = Math.abs(s) * Math.sqrt(g2);
      if (step > maxStep) s *= maxStep / step;
      x -= gx * s; y -= gy * s; z -= gz * s;
    }
    P[v] = x; P[v + 1] = y; P[v + 2] = z;
  }
}

// tangential relaxing: each vertex towards its neighbours' mean, in its tangent
// plane only (so the shape stays), then back onto the surface when f is given
export function relax(mesh, iters = 3, k = 0.5, f = null, nb = null, lock = null) {
  nb = nb || neighbours(mesh);
  const P = mesh.pos, n = P.length / 3, Q = new Float32Array(P.length);
  for (let it = 0; it < iters; it++) {
    const N = normals(mesh);
    for (let i = 0; i < n; i++) {
      const s = nb.start[i], e = nb.start[i + 1];
      if (e === s || (lock && lock[i])) { Q[3 * i] = P[3 * i]; Q[3 * i + 1] = P[3 * i + 1]; Q[3 * i + 2] = P[3 * i + 2]; continue; }
      let mx = 0, my = 0, mz = 0;
      for (let j = s; j < e; j++) { const q = 3 * nb.list[j]; mx += P[q]; my += P[q + 1]; mz += P[q + 2]; }
      const c = e - s; mx = mx / c - P[3 * i]; my = my / c - P[3 * i + 1]; mz = mz / c - P[3 * i + 2];
      const nx = N[3 * i], ny = N[3 * i + 1], nz = N[3 * i + 2], dn = mx * nx + my * ny + mz * nz;
      Q[3 * i] = P[3 * i] + (mx - nx * dn) * k; Q[3 * i + 1] = P[3 * i + 1] + (my - ny * dn) * k; Q[3 * i + 2] = P[3 * i + 2] + (mz - nz * dn) * k;
    }
    P.set(Q);
    if (f) project(mesh, f, 2);
  }
  return nb;
}

// plain Laplacian smoothing (shrinks a little; for soft shapes such as hair before projecting)
export function smooth(mesh, iters = 1, k = 0.5, nb = null) {
  nb = nb || neighbours(mesh);
  const P = mesh.pos, n = P.length / 3, Q = new Float32Array(P.length);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      const s = nb.start[i], e = nb.start[i + 1];
      let mx = 0, my = 0, mz = 0;
      for (let j = s; j < e; j++) { const q = 3 * nb.list[j]; mx += P[q]; my += P[q + 1]; mz += P[q + 2]; }
      const c = Math.max(1, e - s);
      for (let a = 0; a < 3; a++) Q[3 * i + a] = P[3 * i + a] + ((a === 0 ? mx : a === 1 ? my : mz) / c - P[3 * i + a]) * (e > s ? k : 0);
    }
    P.set(Q);
  }
  return nb;
}

// ---------- quadric decimation ----------
// down to about `target` vertices. opts.weight(x, y, z) -> how much detail matters
// there (1 normal, more keeps more), opts.maxEdge(x, y, z) -> no collapse makes a
// longer edge, opts.lockBorder keeps open edges where they are.
export function decimate(mesh, target, opts = {}) {
  const P = Float64Array.from(mesh.pos), I = Int32Array.from(mesh.idx);
  const nv = P.length / 3, nf = I.length / 3;
  const Q = new Float64Array(nv * 10), alive = new Uint8Array(nf).fill(1), vAlive = new Uint8Array(nv).fill(1), ver = new Int32Array(nv);
  const vf = Array.from({ length: nv }, () => []);
  for (let t = 0; t < nf; t++) for (let k = 0; k < 3; k++) vf[I[3 * t + k]].push(t);
  const wAt = opts.weight || (() => 1), maxE = opts.maxEdge || null;
  const W = new Float64Array(nv);
  for (let v = 0; v < nv; v++) W[v] = wAt(P[3 * v], P[3 * v + 1], P[3 * v + 2]);
  const fnorm = (t) => {
    const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  };
  const addQ = (v, a, b, c, d, w) => {
    const q = 10 * v;
    Q[q] += w * a * a; Q[q + 1] += w * a * b; Q[q + 2] += w * a * c; Q[q + 3] += w * a * d; Q[q + 4] += w * b * b;
    Q[q + 5] += w * b * c; Q[q + 6] += w * b * d; Q[q + 7] += w * c * c; Q[q + 8] += w * c * d; Q[q + 9] += w * d * d;
  };
  for (let t = 0; t < nf; t++) {
    const n = fnorm(t), l = Math.hypot(...n);
    if (l < 1e-14) continue;
    const a = n[0] / l, b = n[1] / l, c = n[2] / l, p = 3 * I[3 * t], d = -(a * P[p] + b * P[p + 1] + c * P[p + 2]);
    for (let k = 0; k < 3; k++) { const v = I[3 * t + k]; addQ(v, a, b, c, d, (l / 2) * W[v]); }
  }
  // open edges: a strong quadric across them, perpendicular to the face, so they hold their line
  const edgeCount = new Map();
  const ek = (a, b) => (a < b ? a * nv + b : b * nv + a);
  for (let t = 0; t < nf; t++) for (let k = 0; k < 3; k++) { const a = I[3 * t + k], b = I[3 * t + (k + 1) % 3], key = ek(a, b); edgeCount.set(key, (edgeCount.get(key) || 0) + 1); }
  const border = new Uint8Array(nv);
  for (let t = 0; t < nf; t++) for (let k = 0; k < 3; k++) {
    const a = I[3 * t + k], b = I[3 * t + (k + 1) % 3];
    if (edgeCount.get(ek(a, b)) !== 1) continue;
    border[a] = border[b] = 1;
    const n = fnorm(t), e = [P[3 * b] - P[3 * a], P[3 * b + 1] - P[3 * a + 1], P[3 * b + 2] - P[3 * a + 2]];
    const m = [e[1] * n[2] - e[2] * n[1], e[2] * n[0] - e[0] * n[2], e[0] * n[1] - e[1] * n[0]], l = Math.hypot(...m);
    if (l < 1e-14) continue;
    const pa = m[0] / l, pb = m[1] / l, pc = m[2] / l, pd = -(pa * P[3 * a] + pb * P[3 * a + 1] + pc * P[3 * a + 2]), w = Math.hypot(...e) ** 2 * 50;
    addQ(a, pa, pb, pc, pd, w); addQ(b, pa, pb, pc, pd, w);
  }
  // heap
  let cap = 1 << 16, hn = 0, hc = new Float64Array(cap), hu = new Int32Array(cap), hv = new Int32Array(cap), hvu = new Int32Array(cap), hvv = new Int32Array(cap);
  const grow = () => {
    cap *= 2;
    const c2 = new Float64Array(cap); c2.set(hc); hc = c2;
    for (const k of ['u', 'v', 'vu', 'vv']) { const a = new Int32Array(cap); a.set({ u: hu, v: hv, vu: hvu, vv: hvv }[k]); if (k === 'u') hu = a; else if (k === 'v') hv = a; else if (k === 'vu') hvu = a; else hvv = a; }
  };
  const swap = (i, j) => {
    let t = hc[i]; hc[i] = hc[j]; hc[j] = t;
    t = hu[i]; hu[i] = hu[j]; hu[j] = t; t = hv[i]; hv[i] = hv[j]; hv[j] = t;
    t = hvu[i]; hvu[i] = hvu[j]; hvu[j] = t; t = hvv[i]; hvv[i] = hvv[j]; hvv[j] = t;
  };
  const push = (c, u, v) => {
    if (hn === cap) grow();
    let i = hn++; hc[i] = c; hu[i] = u; hv[i] = v; hvu[i] = ver[u]; hvv[i] = ver[v];
    while (i > 0) { const p = (i - 1) >> 1; if (hc[p] <= hc[i]) break; swap(i, p); i = p; }
  };
  const pop = () => {
    const r = [hc[0], hu[0], hv[0], hvu[0], hvv[0]];
    hn--; if (hn > 0) { hc[0] = hc[hn]; hu[0] = hu[hn]; hv[0] = hv[hn]; hvu[0] = hvu[hn]; hvv[0] = hvv[hn]; }
    let i = 0;
    for (;;) { const l = 2 * i + 1, r2 = l + 1; let m = i; if (l < hn && hc[l] < hc[m]) m = l; if (r2 < hn && hc[r2] < hc[m]) m = r2; if (m === i) break; swap(i, m); i = m; }
    return r;
  };
  // best place for the merged vertex: the quadric's minimum if it is well posed, else the best of the ends and the middle
  const Qs = new Float64Array(10);
  const bestOf = (u, v) => {
    for (let k = 0; k < 10; k++) Qs[k] = Q[10 * u + k] + Q[10 * v + k];
    const [q0, q1, q2, q3, q4, q5, q6, q7, q8] = Qs;
    const det = q0 * (q4 * q7 - q5 * q5) - q1 * (q1 * q7 - q5 * q2) + q2 * (q1 * q5 - q4 * q2);
    const ux = P[3 * u], uy = P[3 * u + 1], uz = P[3 * u + 2], vx = P[3 * v], vy = P[3 * v + 1], vz = P[3 * v + 2];
    const cands = [[ux, uy, uz], [vx, vy, vz], [(ux + vx) / 2, (uy + vy) / 2, (uz + vz) / 2]];
    if (border[u] && !border[v]) cands.length = 1; else if (border[v] && !border[u]) cands.splice(0, 1, [vx, vy, vz]), cands.length = 1;
    else if (Math.abs(det) > 1e-18 && !(border[u] && border[v])) {
      const i = 1 / det;
      const x = (-q3 * (q4 * q7 - q5 * q5) + q6 * (q1 * q7 - q2 * q5) - q8 * (q1 * q5 - q2 * q4)) * i;
      const y = (q0 * (-q6 * q7 + q5 * q8) - q1 * (-q3 * q7 + q2 * q8) + q2 * (-q3 * q5 + q2 * q6)) * i;
      const z = (q0 * (-q4 * q8 + q5 * q6) - q1 * (-q1 * q8 + q3 * q5) + q2 * (-q1 * q6 + q3 * q4)) * i;
      // keep it near the edge
      const mx = (ux + vx) / 2, my = (uy + vy) / 2, mz = (uz + vz) / 2, el = Math.hypot(ux - vx, uy - vy, uz - vz);
      if (Math.hypot(x - mx, y - my, z - mz) < el) cands.push([x, y, z]);
    }
    let bc = Infinity, bp = cands[0];
    for (const c of cands) {
      const e = Qs[0] * c[0] * c[0] + 2 * Qs[1] * c[0] * c[1] + 2 * Qs[2] * c[0] * c[2] + 2 * Qs[3] * c[0] + Qs[4] * c[1] * c[1] + 2 * Qs[5] * c[1] * c[2] + 2 * Qs[6] * c[1] + Qs[7] * c[2] * c[2] + 2 * Qs[8] * c[2] + Qs[9];
      if (e < bc) { bc = e; bp = c; }
    }
    const el2 = (ux - vx) ** 2 + (uy - vy) ** 2 + (uz - vz) ** 2;
    return [Math.max(bc, 0) + el2 * 1e-3 * (W[u] + W[v]) * 0.5, bp];
  };
  const pushEdge = (u, v) => { if (u === v) return; const [c] = bestOf(u, v); push(c, u, v); };
  const seen = new Set();
  for (let t = 0; t < nf; t++) for (let k = 0; k < 3; k++) {
    const a = I[3 * t + k], b = I[3 * t + (k + 1) % 3], key = ek(a, b);
    if (seen.has(key)) continue; seen.add(key); pushEdge(Math.min(a, b), Math.max(a, b));
  }
  seen.clear();
  const ring = (v) => { const s = new Set(); for (const t of vf[v]) if (alive[t]) for (let k = 0; k < 3; k++) s.add(I[3 * t + k]); s.delete(v); return s; };
  let live = nv;
  while (live > target && hn > 0) {
    const [, u, v, vu, vv] = pop();
    if (!vAlive[u] || !vAlive[v] || ver[u] !== vu || ver[v] !== vv) continue;
    if (opts.lockBorder && (border[u] || border[v])) continue;
    // link condition (keeps the surface a manifold)
    const ru = ring(u), rv = ring(v);
    if (!ru.has(v)) continue;
    let common = 0; for (const x of ru) if (rv.has(x)) common++;
    const shared = vf[u].filter((t) => alive[t] && (I[3 * t] === v || I[3 * t + 1] === v || I[3 * t + 2] === v)).length;
    if (common !== shared) continue;
    const [, p] = bestOf(u, v);
    if (maxE) {
      const lim = maxE(p[0], p[1], p[2]);
      let bad = false;
      for (const x of ru) if (x !== v && Math.hypot(P[3 * x] - p[0], P[3 * x + 1] - p[1], P[3 * x + 2] - p[2]) > lim) { bad = true; break; }
      if (!bad) for (const x of rv) if (x !== u && Math.hypot(P[3 * x] - p[0], P[3 * x + 1] - p[1], P[3 * x + 2] - p[2]) > lim) { bad = true; break; }
      if (bad) continue;
    }
    // no face may flip or get too thin
    let flip = false;
    for (const w of [u, v]) {
      for (const t of vf[w]) {
        if (!alive[t]) continue;
        const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2];
        if ((a === u || b === u || c === u) && (a === v || b === v || c === v)) continue;
        const n0 = fnorm(t);
        const sv = [P[3 * w], P[3 * w + 1], P[3 * w + 2]];
        P[3 * w] = p[0]; P[3 * w + 1] = p[1]; P[3 * w + 2] = p[2];
        const n1 = fnorm(t);
        P[3 * w] = sv[0]; P[3 * w + 1] = sv[1]; P[3 * w + 2] = sv[2];
        const l0 = Math.hypot(...n0), l1 = Math.hypot(...n1);
        if (l1 < 1e-14 || (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) < 0.3 * l0 * l1) { flip = true; break; }
        // thin triangles: area against the longest edge squared
        const pa = [a, b, c].map((k) => (k === w ? p : [P[3 * k], P[3 * k + 1], P[3 * k + 2]]));
        let le = 0; for (let k = 0; k < 3; k++) { const q = pa[k], r = pa[(k + 1) % 3]; le = Math.max(le, (q[0] - r[0]) ** 2 + (q[1] - r[1]) ** 2 + (q[2] - r[2]) ** 2); }
        if (l1 / 2 < 0.08 * le) { flip = true; break; }
      }
      if (flip) break;
    }
    if (flip) continue;
    // collapse v into u
    P[3 * u] = p[0]; P[3 * u + 1] = p[1]; P[3 * u + 2] = p[2];
    for (let k = 0; k < 10; k++) Q[10 * u + k] += Q[10 * v + k];
    W[u] = Math.max(W[u], W[v]);
    border[u] = border[u] | border[v];
    for (const t of vf[v]) {
      if (!alive[t]) continue;
      let hasU = false;
      for (let k = 0; k < 3; k++) if (I[3 * t + k] === u) hasU = true;
      if (hasU) { alive[t] = 0; continue; }
      for (let k = 0; k < 3; k++) if (I[3 * t + k] === v) I[3 * t + k] = u;
      vf[u].push(t);
    }
    vAlive[v] = 0; live--; ver[u]++;
    vf[u] = vf[u].filter((t) => alive[t]);
    for (const x of ring(u)) pushEdge(Math.min(u, x), Math.max(u, x));
  }
  // compact
  const map = new Int32Array(nv).fill(-1), pos = [], idx = [];
  for (let t = 0; t < nf; t++) {
    if (!alive[t]) continue;
    for (let k = 0; k < 3; k++) {
      const v = I[3 * t + k];
      if (map[v] < 0) { map[v] = pos.length / 3; pos.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); }
      idx.push(map[v]);
    }
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

// connected pieces smaller than minTris dropped (bits of fluff from the grid)
export function dropSpecks(mesh, minTris = 50) {
  const I = mesh.idx, nf = I.length / 3, n = mesh.pos.length / 3;
  const par = new Int32Array(n).map((_, i) => i);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < nf; t++) { const a = find(I[3 * t]), b = find(I[3 * t + 1]), c = find(I[3 * t + 2]); par[b] = a; par[find(c)] = a; }
  const cnt = new Map();
  for (let t = 0; t < nf; t++) { const r = find(I[3 * t]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const keep = [];
  for (let t = 0; t < nf; t++) if (cnt.get(find(I[3 * t])) >= minTris) keep.push(I[3 * t], I[3 * t + 1], I[3 * t + 2]);
  return compact({ pos: mesh.pos, idx: new Uint32Array(keep) });
}

// unreferenced vertices removed; returns the mesh and old -> new index map
export function compact(mesh, extra = {}) {
  const n = mesh.pos.length / 3, map = new Int32Array(n).fill(-1), I = mesh.idx;
  let m = 0;
  for (let t = 0; t < I.length; t++) if (map[I[t]] < 0) map[I[t]] = m++;
  const pos = new Float32Array(3 * m);
  for (let v = 0; v < n; v++) if (map[v] >= 0) pos.set(mesh.pos.subarray(3 * v, 3 * v + 3), 3 * map[v]);
  const out = { pos, idx: I.map((v) => map[v]), map };
  for (const [k, [arr, w]] of Object.entries(extra)) {
    const a = new arr.constructor(m * w);
    for (let v = 0; v < n; v++) if (map[v] >= 0) for (let j = 0; j < w; j++) a[map[v] * w + j] = arr[v * w + j];
    out[k] = a;
  }
  return out;
}

// a uniform spatial hash over points for nearest-vertex queries
export function pointHash(pos, cell = 0.02) {
  const m = new Map(), n = pos.length / 3, key = (i, j, k) => (i * 73856093) ^ (j * 19349663) ^ (k * 83492791);
  for (let v = 0; v < n; v++) {
    const k = key(Math.floor(pos[3 * v] / cell), Math.floor(pos[3 * v + 1] / cell), Math.floor(pos[3 * v + 2] / cell));
    let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(v);
  }
  return {
    // nearest vertex to (x, y, z) within r cells (or -1)
    nearest(x, y, z, r = 2, accept = null) {
      const i0 = Math.floor(x / cell), j0 = Math.floor(y / cell), k0 = Math.floor(z / cell);
      let best = -1, bd = Infinity;
      for (let rr = 0; rr <= r; rr++) {
        for (let i = i0 - rr; i <= i0 + rr; i++) for (let j = j0 - rr; j <= j0 + rr; j++) for (let k = k0 - rr; k <= k0 + rr; k++) {
          if (Math.max(Math.abs(i - i0), Math.abs(j - j0), Math.abs(k - k0)) !== rr) continue;
          const a = m.get(key(i, j, k)); if (!a) continue;
          for (const v of a) {
            if (accept && !accept(v)) continue;
            const d = (pos[3 * v] - x) ** 2 + (pos[3 * v + 1] - y) ** 2 + (pos[3 * v + 2] - z) ** 2;
            if (d < bd) { bd = d; best = v; }
          }
        }
        if (best >= 0 && Math.sqrt(bd) < rr * cell) break;
      }
      return best;
    },
  };
}
