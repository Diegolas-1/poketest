// The world's edges: the lines where the walkable land ends. terrain.js
// defines where the player may go as a signed field (boundsF: > 0 blocked);
// this module traces its zero line into polylines (marching squares with
// linear interpolation) and answers "how far from an edge, on which side"
// quickly. Every edge is drawn as something you can see (props/cliffs.js:
// cliff faces rising from the grass, or dropping to the sea), never as an
// invisible wall: the walk grid and the rock come from the same line.
//
// A line: { pts: [[x, z]...], n: [[nx, nz]...] (unit, toward the blocked
// side), cum: [arc length...], closed, ...per-vertex data terrain.js adds }.
// Pure numbers (no three.js), so terrain.js can use it at load.

// Trace F's zero line over [x0, x1] x [z0, z1] on a `res` grid. F > 0 is the
// blocked side. Returns polylines (open or closed), points about `res` apart.
export function traceEdges(F, { x0, x1, z0, z1, res = 1 }) {
  const nx = Math.round((x1 - x0) / res) + 1, nz = Math.round((z1 - z0) / res) + 1;
  const v = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    let f = F(x0 + i * res, z0 + j * res);
    if (f === 0) f = 1e-4;   // (no point exactly on the line)
    v[j * nx + i] = f;
  }
  // the crossing on each grid edge: id -> [x, z]
  // horizontal edge (i, j)-(i+1, j): id = (j * nx + i) * 2; vertical (i, j)-(i, j+1): +1
  const pt = new Map();
  const cross = (i, j, horiz) => {
    const id = (j * nx + i) * 2 + (horiz ? 0 : 1);
    if (pt.has(id)) return id;
    const a = v[j * nx + i], b = horiz ? v[j * nx + i + 1] : v[(j + 1) * nx + i];
    const t = a / (a - b);
    pt.set(id, horiz ? [x0 + (i + t) * res, z0 + j * res] : [x0 + i * res, z0 + (j + t) * res]);
    return id;
  };
  // segments as adjacency: each crossing joins at most two others
  const adj = new Map();
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = v[j * nx + i] > 0, b = v[j * nx + i + 1] > 0, c = v[(j + 1) * nx + i + 1] > 0, d = v[(j + 1) * nx + i] > 0;
    const k = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
    if (k === 0 || k === 15) continue;
    const T = () => cross(i, j, true), R = () => cross(i + 1, j, false), B = () => cross(i, j + 1, true), L = () => cross(i, j, false);
    switch (k) {
      case 1: case 14: link(L(), T()); break;
      case 2: case 13: link(T(), R()); break;
      case 3: case 12: link(L(), R()); break;
      case 4: case 11: link(R(), B()); break;
      case 6: case 9: link(T(), B()); break;
      case 7: case 8: link(L(), B()); break;
      case 5: case 10: {
        // a saddle: decide by the centre
        const m = (v[j * nx + i] + v[j * nx + i + 1] + v[(j + 1) * nx + i + 1] + v[(j + 1) * nx + i]) / 4 > 0;
        if ((k === 5) === m) { link(L(), B()); link(T(), R()); } else { link(L(), T()); link(R(), B()); }
        break;
      }
    }
  }
  // walk the chains
  const used = new Set(), lines = [];
  const walk = (start) => {
    const ids = [start]; used.add(start);
    let prev = null, cur = start;
    for (;;) {
      const nb = (adj.get(cur) || []).filter((q) => q !== prev && !used.has(q));
      if (!nb.length) break;
      prev = cur; cur = nb[0]; used.add(cur); ids.push(cur);
    }
    return ids;
  };
  // open chains first (from their ends), then loops
  for (const [id, nb] of adj) if (nb.length === 1 && !used.has(id)) lines.push({ ids: walk(id), closed: false });
  for (const id of adj.keys()) if (!used.has(id)) {
    const ids = walk(id);
    lines.push({ ids, closed: (adj.get(ids[ids.length - 1]) || []).includes(id) && ids.length > 2 });
  }
  return lines.filter((l) => l.ids.length >= 4).map((l) => ({ pts: l.ids.map((id) => pt.get(id)), closed: l.closed }));
}

// smooth a polyline a little (keeps its ends), resample it every `step`
// metres, and give each point its normal toward F's blocked side
export function finishLine(L, F, step = 1) {
  let p = L.pts;
  for (let it = 0; it < 2; it++) {
    const q = p.map((a) => a.slice());
    for (let i = 0; i < p.length; i++) {
      if (!L.closed && (i === 0 || i === p.length - 1)) continue;
      const a = p[(i - 1 + p.length) % p.length], b = p[(i + 1) % p.length];
      q[i] = [p[i][0] * 0.5 + (a[0] + b[0]) * 0.25, p[i][1] * 0.5 + (a[1] + b[1]) * 0.25];
    }
    p = q;
  }
  if (L.closed) p = [...p, p[0]];
  // resample
  const out = [p[0]];
  let carry = 0;
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i], l = Math.hypot(bx - ax, bz - az);
    let t = step - carry;
    while (t <= l) { out.push([ax + (bx - ax) * t / l, az + (bz - az) * t / l]); t += step; }
    carry = l - (t - step);
  }
  if (!L.closed) { const e = p[p.length - 1], o = out[out.length - 1]; if (Math.hypot(e[0] - o[0], e[1] - o[1]) > step * 0.3) out.push(e); }
  if (out.length < 4) return null;
  const n = out.map((q, i) => {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    if (L.closed && (i === 0 || i === out.length - 1)) { const a2 = out[out.length - 2], b2 = out[1]; tx = b2[0] - a2[0]; tz = b2[1] - a2[1]; }
    const l = Math.hypot(tx, tz) || 1;
    return [-tz / l, tx / l];
  });
  // flip each normal toward the blocked side (decided along the whole line,
  // by a vote: the side is the same all along a traced line)
  let vote = 0;
  for (let i = 0; i < out.length; i += 3) {
    const [x, z] = out[i], [nx, nz] = n[i];
    vote += (F(x + nx * 0.8, z + nz * 0.8) > 0 ? 1 : -1) - (F(x - nx * 0.8, z - nz * 0.8) > 0 ? 1 : -1);
  }
  if (vote < 0) for (const q of n) { q[0] = -q[0]; q[1] = -q[1]; }
  const cum = [0];
  for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  return { pts: out, n, cum, closed: L.closed, len: cum[cum.length - 1] };
}

// distance queries against many lines: nearest point, the line, its vertex,
// and the signed offset (+ on the blocked side)
export class EdgeIndex {
  constructor(lines, range = 14, cell = 8) {
    this.lines = lines; this.range = range; this.cell = cell; this.grid = new Map();
    lines.forEach((L, li) => {
      for (let i = 0; i < L.pts.length - 1; i++) {
        const [ax, az] = L.pts[i], [bx, bz] = L.pts[i + 1];
        const i0 = Math.floor((Math.min(ax, bx) - range) / cell), i1 = Math.floor((Math.max(ax, bx) + range) / cell);
        const j0 = Math.floor((Math.min(az, bz) - range) / cell), j1 = Math.floor((Math.max(az, bz) + range) / cell);
        for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
          const k = a * 4096 + b; let arr = this.grid.get(k); if (!arr) this.grid.set(k, arr = []);
          arr.push(li, i);
        }
      }
    });
  }
  // {d (unsigned), s (signed: + blocked side), L, i (segment), t, x, z (nearest point)} or null
  near(x, z, filter = null) {
    const arr = this.grid.get(Math.floor(x / this.cell) * 4096 + Math.floor(z / this.cell));
    if (!arr) return null;
    let best = this.range * this.range, bl = -1, bi = 0, bt = 0;
    for (let k = 0; k < arr.length; k += 2) {
      const L = this.lines[arr[k]], i = arr[k + 1];
      if (filter && !filter(L)) continue;
      const [ax, az] = L.pts[i], [bx, bz] = L.pts[i + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const ex = ax + dx * t - x, ez = az + dz * t - z, d2 = ex * ex + ez * ez;
      if (d2 < best) { best = d2; bl = arr[k]; bi = i; bt = t; }
    }
    if (bl < 0) return null;
    const L = this.lines[bl], [ax, az] = L.pts[bi], [bx, bz] = L.pts[bi + 1];
    const px = ax + (bx - ax) * bt, pz = az + (bz - az) * bt;
    const nx = L.n[bi][0] * (1 - bt) + L.n[bi + 1][0] * bt, nz = L.n[bi][1] * (1 - bt) + L.n[bi + 1][1] * bt;
    const d = Math.sqrt(best), s = (x - px) * nx + (z - pz) * nz;
    return { d, s: s >= 0 ? d : -d, L, i: bi, t: bt, x: px, z: pz, u: L.cum[bi] + (L.cum[bi + 1] - L.cum[bi]) * bt };
  }
}
// a per-vertex value of a line at arc position (segment i, t)
export const lineAt = (arr, i, t) => arr[i] + (arr[Math.min(arr.length - 1, i + 1)] - arr[i]) * t;
