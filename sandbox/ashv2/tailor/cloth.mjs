// Garments from flat pattern pieces, the way they're really made: each piece a 2D outline in cm
// (as drafted on paper), meshed, wrapped loosely round the body where it goes, its seams sewn
// together in a cloth simulation that also drapes it under gravity against the body, then skinned
// to the bones under it. The pattern coordinates stay on the cloth as its UVs (cm).
import { CM } from './body.mjs';

// ---------- a pattern piece ----------
// left, right: its two long edges as polylines of [x, y] (cm), top to bottom; rows run across
// between them (so the top and bottom edges are straight lines between their ends). Edges named
// by the part of the left/right polyline they cover: { name: [from y, to y] } on each side.
export function piece(name, left, right, o = {}) {
  const rows = o.rows ?? 60, cols = o.cols ?? 22;
  const along = (pl, v) => {                          // the point at fraction v of a polyline's height
    const y0 = pl[0][1], y1 = pl[pl.length - 1][1], y = y0 + (y1 - y0) * v;
    for (let i = 1; i < pl.length; i++) {
      const a = pl[i - 1], b = pl[i];
      if ((y <= a[1] && y >= b[1]) || i === pl.length - 1) { const t = a[1] === b[1] ? 0 : (y - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    }
  };
  const uv = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows, L = along(left, v), R = along(right, v);
    for (let c = 0; c <= cols; c++) { const u = c / cols; uv.push(L[0] + (R[0] - L[0]) * u, L[1] + (R[1] - L[1]) * u); }
  }
  const id = (r, c) => r * (cols + 1) + c;
  const tris = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = id(r, c), b = id(r, c + 1), d = id(r + 1, c), e = id(r + 1, c + 1);
    if ((r + c) % 2) tris.push(a, d, b, b, d, e); else tris.push(a, d, e, a, e, b);
  }
  // the edges: lists of vertex ids top to bottom (left/right) or left to right (top/bottom)
  const col = (c) => Array.from({ length: rows + 1 }, (_, r) => id(r, c));
  const row = (r) => Array.from({ length: cols + 1 }, (_, c) => id(r, c));
  const edges = { left: col(0), right: col(cols), top: row(0), bottom: row(rows) };
  // named parts of the long edges, by the pattern's y
  for (const [side, parts] of [['left', o.leftParts], ['right', o.rightParts]]) for (const [k, [ya, yb]] of Object.entries(parts || {})) {
    edges[k] = edges[side].filter((i) => uv[i * 2 + 1] <= ya + 1e-6 && uv[i * 2 + 1] >= yb - 1e-6);
  }
  return { name, rows, cols, uv: Float32Array.from(uv), tris, edges, n: uv.length / 2, grid: { id, rows, cols } };
}

// ---------- the garment: pieces placed in 3D, seams, the simulation ----------
// place(piece, i) -> [x, y, z] (where vertex i starts, in body space)
export function assemble(pieces, place) {
  const P = [], UV = [], T = [], off = new Map(), triRange = new Map();
  for (const pc of pieces) {
    off.set(pc.name, P.length / 3);
    for (let i = 0; i < pc.n; i++) { P.push(...place(pc, i)); UV.push(pc.uv[i * 2], pc.uv[i * 2 + 1]); }
    triRange.set(pc.name, [T.length, T.length + pc.tris.length]);
    for (const t of pc.tris) T.push(t + off.get(pc.name));
  }
  return { pieces, P: Float32Array.from(P), UV: Float32Array.from(UV), T, off, triRange, seams: [], pins: [], tethers: [], n: P.length / 3 };
}
// a seam: two edges sewn point to point by their length along them (either can run backwards)
export function sew(G, a, ea, b, eb, flip = false) {
  const A = G.pieces.find((p) => p.name === a), Bp = G.pieces.find((p) => p.name === b);
  const la = A.edges[ea].map((i) => i + G.off.get(a)), lb = Bp.edges[eb].map((i) => i + G.off.get(b));
  if (flip) lb.reverse();
  const cum = (l, uvp) => { const c = [0]; for (let i = 1; i < l.length; i++) c.push(c[i - 1] + Math.hypot(G.UV[l[i] * 2] - G.UV[l[i - 1] * 2], G.UV[l[i] * 2 + 1] - G.UV[l[i - 1] * 2 + 1])); return c.map((x) => x / c[c.length - 1]); };
  const ca = cum(la), cb = cum(lb);
  // every point of each edge to the matching place on the other (a point, or between two)
  const at = (l, c, t) => { let k = 1; while (k < c.length - 1 && c[k] < t) k++; const s = (t - c[k - 1]) / (c[k] - c[k - 1] || 1); return [l[k - 1], l[k], Math.min(1, Math.max(0, s))]; };
  for (let i = 0; i < la.length; i++) G.seams.push([la[i], ...at(lb, cb, ca[i])]);
  for (let i = 0; i < lb.length; i++) G.seams.push([lb[i], ...at(la, ca, cb[i])]);
}

// tethers from a piece's top row: each point hangs from the top of its column
export function tether(G, name) {
  const pc = G.pieces.find((p) => p.name === name), o = G.off.get(name), { id, rows, cols } = pc.grid;
  for (let c = 0; c <= cols; c++) for (let r = 1; r <= rows; r++) {
    const i = id(r, c), a = id(0, c);
    G.tethers.push([o + i, o + a, Math.hypot(pc.uv[i * 2] - pc.uv[a * 2], pc.uv[i * 2 + 1] - pc.uv[a * 2 + 1]) * CM * 1.01]);
  }
}

// the simulation: position based dynamics. Stretch (the pattern's own lengths) and shear along the
// mesh, bending across it, seams closing, pinned points, gravity, and the body pushing the cloth out.
export function simulate(G, body, o = {}) {
  const n = G.n, X = Float32Array.from(G.P), V = new Float32Array(n * 3);
  // what it rests on: the body (less any skin it ignores, o.collideOk), or that and the clothes under it
  const K = o.collider || body, okK = o.collideOk || null, deep = o.deep ?? 0.05;
  const thick = o.thick ?? 0.25 * CM, steps = o.steps ?? 160, iters = o.iters ?? 24, g = (o.gravity ?? 9.8) / 0.75;
  const dt = 1 / 60;
  // constraints from the pattern: every mesh edge, and each vertex to the one two along (bending)
  const C = [], key = new Set();
  const addC = (a, b, k) => {
    const h = a < b ? a * 1e6 + b : b * 1e6 + a; if (key.has(h)) return; key.add(h);
    C.push([a, b, Math.hypot(G.UV[a * 2] - G.UV[b * 2], G.UV[a * 2 + 1] - G.UV[b * 2 + 1]) * CM, k]);
  };
  for (let t = 0; t < G.T.length; t += 3) for (let e = 0; e < 3; e++) addC(G.T[t + e], G.T[t + (e + 1) % 3], 1);
  for (const pc of G.pieces) {
    if (!pc.grid) {
      // bending across each inner edge: the two corners facing it
      const o0 = G.off.get(pc.name), opp = new Map();
      for (let t = 0; t < pc.tris.length; t += 3) for (let e = 0; e < 3; e++) {
        const a = pc.tris[t + e], b = pc.tris[t + (e + 1) % 3], c = pc.tris[t + (e + 2) % 3], h = a < b ? a * 1e6 + b : b * 1e6 + a;
        if (opp.has(h)) addC(o0 + opp.get(h), o0 + c, o.bend ?? 0.15); else opp.set(h, c);
      }
      continue;
    }
    const o0 = G.off.get(pc.name), { id, rows, cols } = pc.grid;
    // bending at several spans (stiff cloth like denim tents over a knee rather than wrapping it)
    for (const [span, k] of o.spans || [[2, o.bend ?? 0.15]]) for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      if (c + span <= cols) addC(o0 + id(r, c), o0 + id(r, c + span), k);
      if (r + span <= rows) addC(o0 + id(r, c), o0 + id(r + span, c), k);
    }
  }
  const pins = G.pins;                                  // [i, x?, y?, z?] (null: free on that axis)
  const seam = (k) => {
    for (const [a, b0, b1, s] of G.seams) {
      // a towards its place on the other edge, that place towards a
      for (let c = 0; c < 3; c++) {
        const q = X[b0 * 3 + c] * (1 - s) + X[b1 * 3 + c] * s, d = (q - X[a * 3 + c]) * 0.5 * k;
        X[a * 3 + c] += d; X[b0 * 3 + c] -= d * (1 - s); X[b1 * 3 + c] -= d * s;
      }
    }
  };
  const collide = () => {
    for (let i = 0; i < n; i++) {
      const j = K.grid.nearest(X[i * 3], X[i * 3 + 1], X[i * 3 + 2], 1, okK); if (j < 0) continue;
      const nx = K.N[j * 3], ny = K.N[j * 3 + 1], nz = K.N[j * 3 + 2];
      const d = (X[i * 3] - K.P[j * 3]) * nx + (X[i * 3 + 1] - K.P[j * 3 + 1]) * ny + (X[i * 3 + 2] - K.P[j * 3 + 2]) * nz;
      // only skin close by counts, and the push is gentle (a point that ends up deep in a crease
      // shouldn't be thrown out the far side)
      if (d < thick && d > -deep) { const k = Math.min(0.004, thick - d); X[i * 3] += nx * k; X[i * 3 + 1] += ny * k; X[i * 3 + 2] += nz * k; }
    }
  };
  const prev = new Float32Array(n * 3);
  for (let s = 0; s < steps; s++) {
    // the seams close over the first part of the run, so the pieces come together gently
    const sk = Math.min(1, (s + 1) / (steps * 0.35));
    prev.set(X);
    for (let i = 0; i < n; i++) { V[i * 3 + 1] -= g * dt * (o.gravityOn ? o.gravityOn(s) : 1); for (let c = 0; c < 3; c++) X[i * 3 + c] += V[i * 3 + c] * dt; }
    for (let it = 0; it < iters; it++) {
      for (const [a, b, L, k] of C) {
        const dx = X[b * 3] - X[a * 3], dy = X[b * 3 + 1] - X[a * 3 + 1], dz = X[b * 3 + 2] - X[a * 3 + 2], l = Math.hypot(dx, dy, dz) || 1e-9;
        // cloth stretches very little, and compresses (buckles) freely-ish
        const e = (l - L) / l * 0.5 * (l > L ? k : k * 0.3);
        X[a * 3] += dx * e; X[a * 3 + 1] += dy * e; X[a * 3 + 2] += dz * e;
        X[b * 3] -= dx * e; X[b * 3 + 1] -= dy * e; X[b * 3 + 2] -= dz * e;
      }
      seam(sk);
      // tethers: no point further from where it hangs than the pattern allows (stops a long
      // piece stretching under its own weight)
      for (const [i, a, L] of G.tethers) {
        const dx = X[i * 3] - X[a * 3], dy = X[i * 3 + 1] - X[a * 3 + 1], dz = X[i * 3 + 2] - X[a * 3 + 2], l = Math.hypot(dx, dy, dz);
        if (l > L) { const k = (l - L) / l; X[i * 3] -= dx * k; X[i * 3 + 1] -= dy * k; X[i * 3 + 2] -= dz * k; }
      }
      for (const [i, x, y, z] of pins) { if (x != null) X[i * 3] = x; if (y != null) X[i * 3 + 1] = y; if (z != null) X[i * 3 + 2] = z; }
      collide();
      if (o.keep) for (let i = 0; i < n; i++) o.keep(i, X);
    }
    // friction: cloth resting on him doesn't slide off (a jacket hangs on the shoulders)
    const fr = o.friction ?? 0.6;
    if (fr) for (let i = 0; i < n; i++) {
      const j = K.grid.nearest(X[i * 3], X[i * 3 + 1], X[i * 3 + 2], 1, okK); if (j < 0) continue;
      const nx = K.N[j * 3], ny = K.N[j * 3 + 1], nz = K.N[j * 3 + 2];
      const d = (X[i * 3] - K.P[j * 3]) * nx + (X[i * 3 + 1] - K.P[j * 3 + 1]) * ny + (X[i * 3 + 2] - K.P[j * 3 + 2]) * nz;
      if (d > thick * 1.6 || d < -deep) continue;
      const dx = X[i * 3] - prev[i * 3], dy = X[i * 3 + 1] - prev[i * 3 + 1], dz = X[i * 3 + 2] - prev[i * 3 + 2], dn = dx * nx + dy * ny + dz * nz;
      X[i * 3] -= (dx - nx * dn) * fr; X[i * 3 + 1] -= (dy - ny * dn) * fr; X[i * 3 + 2] -= (dz - nz * dn) * fr;
    }
    const vmax = o.vmax ?? 1.5;
    for (let i = 0; i < n * 3; i++) V[i] = Math.max(-vmax, Math.min(vmax, (X[i] - prev[i]) / dt * (1 - (o.damp ?? 0.04))));
    if (o.log && s % (o.logEvery ?? 40) === 0) o.log(s, X);
  }
  G.X = X;
  return G;
}

// ---------- after the run: one surface (the seams joined), skinned ----------
export function finish(G, body, o = {}) {
  const n = G.n, X = G.X;
  // join the seams: each point with the point it's sewn to (union-find over the seam pairs that
  // land on a point)
  const up = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  for (const [a, b0, b1, s] of G.seams) { const b = s < 0.5 ? b0 : b1; if (Math.min(s, 1 - s) < 0.25) up[find(a)] = find(b); }
  const sum = new Float32Array(n * 3), cnt = new Float32Array(n);
  for (let i = 0; i < n; i++) { const r = find(i); for (let c = 0; c < 3; c++) sum[r * 3 + c] += X[i * 3 + c]; cnt[r]++; }
  for (let i = 0; i < n; i++) { const r = find(i); for (let c = 0; c < 3; c++) X[i * 3 + c] = sum[r * 3 + c] / cnt[r]; }
  // which way is out, piece by piece (a mirrored piece, or one wrapped the other way round, starts
  // inside out): most of a piece faces away from the body
  for (const [, [t0, t1]] of G.triRange) {
    let out = 0;
    for (let t = t0; t < t1; t += 9) {
      const [a, b, c] = [G.T[t], G.T[t + 1], G.T[t + 2]];
      const e1 = [0, 1, 2].map((k) => X[b * 3 + k] - X[a * 3 + k]), e2 = [0, 1, 2].map((k) => X[c * 3 + k] - X[a * 3 + k]);
      const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const j = body.grid.nearest(X[a * 3], X[a * 3 + 1], X[a * 3 + 2], 2);
      if (j >= 0) out += f[0] * body.N[j * 3] + f[1] * body.N[j * 3 + 1] + f[2] * body.N[j * 3 + 2];
    }
    if (out < 0) for (let t = t0; t < t1; t += 3) { const k = G.T[t + 1]; G.T[t + 1] = G.T[t + 2]; G.T[t + 2] = k; }
  }
  // normals over the joined surface
  const N = new Float32Array(n * 3);
  for (let t = 0; t < G.T.length; t += 3) {
    const [a, b, c] = [G.T[t], G.T[t + 1], G.T[t + 2]];
    const e1 = [0, 1, 2].map((k) => X[b * 3 + k] - X[a * 3 + k]), e2 = [0, 1, 2].map((k) => X[c * 3 + k] - X[a * 3 + k]);
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) { const r = find(v); for (let k = 0; k < 3; k++) N[r * 3 + k] += f[k]; }
  }
  for (let i = 0; i < n; i++) { const r = find(i); const l = Math.hypot(N[r * 3], N[r * 3 + 1], N[r * 3 + 2]) || 1; for (let k = 0; k < 3; k++) N[i * 3 + k] = N[r * 3 + k] / l; }
  // skinning: the nearest skin's, then smoothed across the cloth (so it bends as cloth, not as skin)
  const Wf = Array.from({ length: n }, () => new Map());
  // o.allow(piece, skin point): which skin a piece may follow (a trouser leg its own leg only);
  // o.remap: bones whose share goes to another (a trouser hem follows the shin, not the foot)
  const pieceOf = new Array(n);
  for (const pc of G.pieces) { const s = G.off.get(pc.name); for (let i = s; i < s + pc.n; i++) pieceOf[i] = pc; }
  const remap = {};
  for (const [a, b] of Object.entries(o.remap || {})) remap[body.names.indexOf(a)] = body.names.indexOf(b);
  for (let i = 0; i < n; i++) {
    const ok = o.allow ? (j) => o.allow(pieceOf[i], j) : null;
    // o.anchor: where to look for its skin from (loose cloth: in towards the limb it hangs round)
    const q = o.anchor ? o.anchor(pieceOf[i], [X[i * 3], X[i * 3 + 1], X[i * 3 + 2]]) : [X[i * 3], X[i * 3 + 1], X[i * 3 + 2]];
    let j = body.grid.nearest(q[0], q[1], q[2], 1, ok); if (j < 0) j = body.grid.nearest(q[0], q[1], q[2], 4, ok);
    for (let c = 0; c < 4; c++) if (body.W[j * 4 + c] > 0) { const k = remap[body.J[j * 4 + c]] ?? body.J[j * 4 + c]; Wf[i].set(k, (Wf[i].get(k) || 0) + body.W[j * 4 + c]); }
  }
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < G.T.length; t += 3) for (let e = 0; e < 3; e++) { const a = find(G.T[t + e]), b = find(G.T[t + (e + 1) % 3]); nb[a].add(b); nb[b].add(a); }
  for (let it = 0; it < (o.smoothWeights ?? 10); it++) {
    const next = Wf.map((m, i) => {
      if (find(i) !== i) return m;
      const acc = new Map(m); for (const [k, w] of m) acc.set(k, w);
      for (const j of nb[i]) { if (o.apart && o.apart(pieceOf[i], pieceOf[j], X[i * 3 + 1])) continue; for (const [k, w] of Wf[j]) acc.set(k, (acc.get(k) || 0) + w); }
      return acc;
    });
    for (let i = 0; i < n; i++) Wf[i] = next[find(i)];
  }
  const J = new Uint16Array(n * 4), W = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const top = [...Wf[find(i)]].sort((a, b) => b[1] - a[1]).slice(0, 4), s = top.reduce((a, b) => a + b[1], 0) || 1;
    top.forEach(([k, w], c) => { J[i * 4 + c] = k; W[i * 4 + c] = w / s; });
  }
  return { P: X, N, UV: G.UV, T: G.T, J, W, pieces: G.pieces.map((p) => ({ name: p.name, start: G.off.get(p.name), n: p.n })) };
}
