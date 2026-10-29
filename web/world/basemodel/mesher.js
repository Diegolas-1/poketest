// Field -> triangle mesh: sparse surface nets on a fine grid, relaxed and
// projected back onto the surface, then decimated (quadric error metrics) to a
// game-sized mesh. Also cuts a mesh along the zero line of a scalar field, so
// a material boundary (the briefs) is a clean curve instead of a stair of
// triangle edges.

// ---------- surface nets ----------
// h: cell size in metres. Only blocks of B cells the surface may cross are sampled.
export function surfaceNets(field, h, B = 16) {
  const lo = field.lo.map((v) => v - 2 * h), hi = field.hi.map((v) => v + 2 * h);
  lo[1] = Math.max(lo[1], field.ground - 2 * h);
  const N = hi.map((v, i) => Math.ceil((v - lo[i]) / h));
  const nb = N.map((n) => Math.ceil(n / B));
  const S = B + 1, vals = new Float32Array(S * S * S);
  const cellVert = new Map(), pos = [], edges = [];
  const half = Math.sqrt(3) * B * h / 2;
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const cv = new Float64Array(8);
  for (let bz = 0; bz < nb[2]; bz++) for (let by = 0; by < nb[1]; by++) for (let bx = 0; bx < nb[0]; bx++) {
    const ox = bx * B, oy = by * B, oz = bz * B;
    const cx = lo[0] + (ox + B / 2) * h, cy = lo[1] + (oy + B / 2) * h, cz = lo[2] + (oz + B / 2) * h;
    if (Math.abs(field.d(cx, cy, cz)) > half * 1.25 + 0.012) continue;
    for (let k = 0; k < S; k++) for (let j = 0; j < S; j++) for (let i = 0; i < S; i++)
      vals[i + S * (j + S * k)] = field.d(lo[0] + (ox + i) * h, lo[1] + (oy + j) * h, lo[2] + (oz + k) * h);
    for (let k = 0; k < B; k++) for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
      const gi = ox + i, gj = oy + j, gk = oz + k;
      if (gi >= N[0] || gj >= N[1] || gk >= N[2]) continue;
      let mask = 0;
      for (let c = 0; c < 8; c++) { cv[c] = vals[(i + C[c][0]) + S * ((j + C[c][1]) + S * (k + C[c][2]))]; if (cv[c] < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of E) {
        if ((cv[a] < 0) === (cv[b] < 0)) continue;
        const t = cv[a] / (cv[a] - cv[b]);
        sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++;
      }
      cellVert.set(gi + N[0] * (gj + N[1] * gk), pos.length / 3);
      pos.push(lo[0] + (gi + sx / n) * h, lo[1] + (gj + sy / n) * h, lo[2] + (gk + sz / n) * h);
      // the three edges from this cell's lowest corner
      const v0 = cv[0];
      if ((v0 < 0) !== (cv[1] < 0) && gj > 0 && gk > 0) edges.push(gi, gj, gk, 0, v0 < 0 ? 1 : -1);
      if ((v0 < 0) !== (cv[2] < 0) && gi > 0 && gk > 0) edges.push(gi, gj, gk, 1, v0 < 0 ? 1 : -1);
      if ((v0 < 0) !== (cv[4] < 0) && gi > 0 && gj > 0) edges.push(gi, gj, gk, 2, v0 < 0 ? 1 : -1);
    }
  }
  const tris = [];
  const id = (i, j, k) => cellVert.get(i + N[0] * (j + N[1] * k));
  for (let e = 0; e < edges.length; e += 5) {
    const i = edges[e], j = edges[e + 1], k = edges[e + 2], ax = edges[e + 3], s = edges[e + 4];
    let q;
    if (ax === 0) q = [id(i, j - 1, k - 1), id(i, j, k - 1), id(i, j, k), id(i, j - 1, k)];
    else if (ax === 1) q = [id(i - 1, j, k - 1), id(i, j, k - 1), id(i, j, k), id(i - 1, j, k)];
    else q = [id(i - 1, j - 1, k), id(i, j - 1, k), id(i, j, k), id(i - 1, j, k)];
    if (q.some((v) => v === undefined)) continue;
    // orient so the quad faces out (along +axis when the low corner is inside)
    const P = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const [a, b, c, d] = q.map(P);
    const d1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], d2 = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
    const nrm = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
    if (nrm[ax] * s < 0) q.reverse();
    const [A, Bq, Cq, D] = q;
    const l1 = dist2(pos, A, Cq), l2 = dist2(pos, Bq, D);
    if (l1 < l2) tris.push(A, Bq, Cq, A, Cq, D);
    else tris.push(A, Bq, D, Bq, Cq, D);
  }
  return { pos: new Float64Array(pos), tris: new Int32Array(tris) };
}

function dist2(p, a, b) { const x = p[a * 3] - p[b * 3], y = p[a * 3 + 1] - p[b * 3 + 1], z = p[a * 3 + 2] - p[b * 3 + 2]; return x * x + y * y + z * z; }

export function neighbours(nv, tris) {
  const nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) { const a = tris[t + e], b = tris[t + (e + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  return nb.map((s) => [...s]);
}

// move vertices onto the zero level along the field's gradient
export function project(field, pos, steps = 3) {
  for (let v = 0; v < pos.length; v += 3) for (let s = 0; s < steps; s++) {
    const x = pos[v], y = pos[v + 1], z = pos[v + 2], d = field.d(x, y, z);
    if (Math.abs(d) < 1e-6) break;
    const [gx, gy, gz] = field.grad(x, y, z);
    pos[v] -= d * gx; pos[v + 1] -= d * gy; pos[v + 2] -= d * gz;
  }
}

// even the vertices out over the surface (Laplacian, then back onto the surface)
export function relax(field, pos, tris, iters = 2, k = 0.5) {
  const nb = neighbours(pos.length / 3, tris);
  const tmp = new Float64Array(pos.length);
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < nb.length; v++) {
      const L = nb[v];
      if (!L.length) { tmp[v * 3] = pos[v * 3]; tmp[v * 3 + 1] = pos[v * 3 + 1]; tmp[v * 3 + 2] = pos[v * 3 + 2]; continue; }
      let x = 0, y = 0, z = 0;
      for (const u of L) { x += pos[u * 3]; y += pos[u * 3 + 1]; z += pos[u * 3 + 2]; }
      tmp[v * 3] = pos[v * 3] + (x / L.length - pos[v * 3]) * k;
      tmp[v * 3 + 1] = pos[v * 3 + 1] + (y / L.length - pos[v * 3 + 1]) * k;
      tmp[v * 3 + 2] = pos[v * 3 + 2] + (z / L.length - pos[v * 3 + 2]) * k;
    }
    pos.set(tmp);
    project(field, pos, 2);
  }
}

// ---------- quadric decimation ----------
class Heap {
  constructor() { this.a = []; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; }
    }
    return top;
  }
  get size() { return this.a.length; }
}

// target: triangle count. lenK: cost per squared edge length, so flat areas still
// keep triangles of a reasonable size (for skinning and shading). keep(v) > 1
// makes collapses near v dearer (more detail there).
export function decimate(pos, tris, target, o = {}) {
  const lenK = o.lenK ?? 2e-5, keep = o.keep || null;
  const nv = pos.length / 3, nt = tris.length / 3;
  const P = Float64Array.from(pos), T = Int32Array.from(tris), dead = new Uint8Array(nt);
  const Q = new Float64Array(nv * 10), ver = new Uint32Array(nv), gone = new Uint8Array(nv);
  const vt = Array.from({ length: nv }, () => []);
  const wv = new Float64Array(nv).fill(1);
  if (keep) for (let v = 0; v < nv; v++) wv[v] = keep(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
  const plane = (t) => {
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-14) return null;
    nx /= l; ny /= l; nz /= l;
    return [nx, ny, nz, -(nx * P[a * 3] + ny * P[a * 3 + 1] + nz * P[a * 3 + 2]), l / 2];
  };
  for (let t = 0; t < nt; t++) {
    for (let e = 0; e < 3; e++) vt[T[t * 3 + e]].push(t);
    const p = plane(t); if (!p) continue;
    const [a, b, c, d] = p;
    const q = [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d];
    for (let e = 0; e < 3; e++) { const v = T[t * 3 + e]; for (let i = 0; i < 10; i++) Q[v * 10 + i] += q[i]; }
  }
  const qerr = (q, x, y, z) => q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
  const qs = new Float64Array(10);
  const best = (u, v) => {
    for (let i = 0; i < 10; i++) qs[i] = Q[u * 10 + i] + Q[v * 10 + i];
    const ux = P[u * 3], uy = P[u * 3 + 1], uz = P[u * 3 + 2], vx = P[v * 3], vy = P[v * 3 + 1], vz = P[v * 3 + 2];
    const cands = [[(ux + vx) / 2, (uy + vy) / 2, (uz + vz) / 2], [ux, uy, uz], [vx, vy, vz]];
    // optimal point, if the system is well conditioned and it lands near the edge
    const a = qs[0], b = qs[1], c = qs[2], d = qs[4], e = qs[5], f = qs[7];
    const det = a * (d * f - e * e) - b * (b * f - c * e) + c * (b * e - c * d);
    if (Math.abs(det) > 1e-12) {
      const r0 = -qs[3], r1 = -qs[6], r2 = -qs[8];
      const x = (r0 * (d * f - e * e) - b * (r1 * f - e * r2) + c * (r1 * e - d * r2)) / det;
      const y = (a * (r1 * f - e * r2) - r0 * (b * f - c * e) + c * (b * r2 - r1 * c)) / det;
      const z = (a * (d * r2 - r1 * e) - b * (b * r2 - r1 * c) + r0 * (b * e - c * d)) / det;
      const mx = (ux + vx) / 2, my = (uy + vy) / 2, mz = (uz + vz) / 2;
      const L2 = (ux - vx) ** 2 + (uy - vy) ** 2 + (uz - vz) ** 2;
      if ((x - mx) ** 2 + (y - my) ** 2 + (z - mz) ** 2 < L2) cands.unshift([x, y, z]);
    }
    let bc = Infinity, bp = null;
    for (const p of cands) { const c2 = qerr(qs, p[0], p[1], p[2]); if (c2 < bc) { bc = c2; bp = p; } }
    const L2 = (ux - vx) ** 2 + (uy - vy) ** 2 + (uz - vz) ** 2;
    return [Math.max(bc, 0) * Math.max(wv[u], wv[v]) + lenK * L2, bp];
  };
  const heap = new Heap();
  const pushEdge = (u, v) => { const [c, p] = best(u, v); heap.push([c, u, v, ver[u], ver[v], p]); };
  for (let t = 0; t < nt; t++) for (let e = 0; e < 3; e++) { const a = T[t * 3 + e], b = T[t * 3 + (e + 1) % 3]; if (a < b) pushEdge(a, b); }
  const ring = (v) => { const s = new Set(); for (const t of vt[v]) if (!dead[t]) for (let e = 0; e < 3; e++) s.add(T[t * 3 + e]); s.delete(v); return s; };
  let live = nt;
  const nrm = (a, b, c, pa) => {
    const A = a === -1 ? pa : [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], Bp = b === -1 ? pa : [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], Cp = c === -1 ? pa : [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]];
    const ux = Bp[0] - A[0], uy = Bp[1] - A[1], uz = Bp[2] - A[2], vx = Cp[0] - A[0], vy = Cp[1] - A[1], vz = Cp[2] - A[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], l = Math.hypot(...n);
    const per = Math.hypot(ux, uy, uz) + Math.hypot(vx, vy, vz) + Math.hypot(Cp[0] - Bp[0], Cp[1] - Bp[1], Cp[2] - Bp[2]);
    return [n[0] / (l || 1), n[1] / (l || 1), n[2] / (l || 1), l / (per * per + 1e-30)];
  };
  while (live > target && heap.size) {
    const [, u, v, su, sv, p] = heap.pop();
    if (gone[u] || gone[v] || ver[u] !== su || ver[v] !== sv) continue;
    // link condition: the shared neighbours are exactly the two triangles' tips
    const ru = ring(u), rv = ring(v);
    let shared = 0; for (const x of ru) if (rv.has(x)) shared++;
    const both = vt[u].filter((t) => !dead[t] && (T[t * 3] === v || T[t * 3 + 1] === v || T[t * 3 + 2] === v));
    if (shared !== 2 || both.length !== 2) continue;
    // no flipped or sliver triangles
    let ok = true;
    for (const w of [u, v]) {
      for (const t of vt[w]) {
        if (dead[t] || both.includes(t)) continue;
        const ids = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]];
        const n0 = nrm(ids[0], ids[1], ids[2]);
        const n1 = nrm(...ids.map((x) => (x === u || x === v ? -1 : x)), p);
        if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0.35 || n1[3] < 0.012) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) { ver[u]++; ver[v]++; continue; }
    // collapse v into u
    for (const t of both) { dead[t] = 1; live--; }
    for (const t of vt[v]) {
      if (dead[t]) continue;
      for (let e = 0; e < 3; e++) if (T[t * 3 + e] === v) T[t * 3 + e] = u;
      vt[u].push(t);
    }
    vt[u] = vt[u].filter((t) => !dead[t]);
    vt[v] = []; gone[v] = 1;
    P[u * 3] = p[0]; P[u * 3 + 1] = p[1]; P[u * 3 + 2] = p[2];
    for (let i = 0; i < 10; i++) Q[u * 10 + i] += Q[v * 10 + i];
    wv[u] = Math.max(wv[u], wv[v]);
    ver[u]++;
    for (const w of ring(u)) pushEdge(Math.min(u, w), Math.max(u, w));
  }
  // compact
  const remap = new Int32Array(nv).fill(-1), outP = [], outT = [];
  for (let t = 0; t < nt; t++) {
    if (dead[t]) continue;
    for (let e = 0; e < 3; e++) {
      const v = T[t * 3 + e];
      if (remap[v] < 0) { remap[v] = outP.length / 3; outP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); }
      outT.push(remap[v]);
    }
  }
  return { pos: new Float64Array(outP), tris: new Int32Array(outT) };
}

// ---------- cut along a field ----------
// g(x, y, z): the cut runs where g = 0. Returns the new mesh, each triangle's
// side (1 where g > 0) and each vertex's g.
export function cutAlong(pos, tris, g) {
  const P = Array.from(pos), G = [];
  for (let v = 0; v < pos.length; v += 3) { let x = g(pos[v], pos[v + 1], pos[v + 2]); if (Math.abs(x) < 1e-5) x = 1e-5; G.push(x); }
  const mid = new Map(), out = [], side = [];
  const cut = (a, b) => {
    const k = a < b ? a * 1e7 + b : b * 1e7 + a;
    let m = mid.get(k);
    if (m === undefined) {
      const t = G[a] / (G[a] - G[b]);
      m = P.length / 3;
      P.push(P[a * 3] + (P[b * 3] - P[a * 3]) * t, P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t, P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t);
      G.push(0); mid.set(k, m);
    }
    return m;
  };
  for (let t = 0; t < tris.length; t += 3) {
    const v = [tris[t], tris[t + 1], tris[t + 2]], s = v.map((x) => G[x] > 0);
    if (s[0] === s[1] && s[1] === s[2]) { out.push(...v); side.push(s[0] ? 1 : 0); continue; }
    // the lone vertex (on its own side) first, keeping the winding
    let i = s[0] !== s[1] && s[0] !== s[2] ? 0 : s[1] !== s[0] && s[1] !== s[2] ? 1 : 2;
    const a = v[i], b = v[(i + 1) % 3], c = v[(i + 2) % 3];
    const ab = cut(a, b), ac = cut(a, c), sa = s[i] ? 1 : 0;
    out.push(a, ab, ac); side.push(sa);
    out.push(ab, b, c); side.push(1 - sa);
    out.push(ab, c, ac); side.push(1 - sa);
  }
  return { pos: new Float64Array(P), tris: new Int32Array(out), side, g: G };
}
