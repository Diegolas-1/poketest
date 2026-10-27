// Bakes the path graph for the bike's road assist (native/bike/assist.gd) into
// native/bike/paths.json: every rideable road, lane and trail centre line from
// web/world/terrain.js (ROADS, with Route 1's trails and the woodland trails,
// the editor's edits included), split into edges at junctions (a road's end
// meeting another road, two roads crossing, roads meeting at the square), plus
// the short links the roads do not draw themselves: the three bridges' decks
// and the sandy plaza before the lab gate. Each edge: its node ids, its half
// width (the dirt's, terrain.js pathMap), its surface (dirt, gravel, cobble,
// wood) and its points (about 1 m apart). The stepping stones on the tea
// house trail are listed as walk-only (the bike stops before them).
// The native QA (dev/bike_test.tscn --case=paths) checks the graph against the
// baked walk grid: every point rideable, every junction joined.
// Run: node tools/native/bake_paths.mjs   (no browser needed)
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const three = pathToFileURL(path.join(ROOT, 'web/lib/three/three.module.min.js')).href;
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(three)}, shortCircuit: true }; return n(s, c); }`));
const T = await import(pathToFileURL(path.join(ROOT, 'web/world/terrain.js')).href);
const R1 = await import(pathToFileURL(path.join(ROOT, 'web/world/route1land.js')).href);
const ED = (await import(pathToFileURL(path.join(ROOT, 'web/world/editlayer/index.js')).href)).E;
const world = (await import('./regions.mjs')).readWorld(path.join(ROOT, 'native/world'));   // (the colliders, as the game has them)

const r2 = (v) => Math.round(v * 100) / 100;
const JOIN = 4.5;       // a road's end this close to another road joins it
const MERGE = 1.6;      // junction points this close are one node
const STEP = 1.0;       // point spacing along an edge (m)

// ---------- the lines ----------
// [{pts: [[x, z]...], w, kind}]
const lines = [];
const roadW = (ri) => (ED.roadW && ED.roadW[ri]) || (ri <= 1 ? 1.62 : T.TRAILS.has(ri) ? 1.1 : 1.38);
T.ROADS.forEach((r, ri) => { if (r.length >= 2) lines.push({ pts: r.map((p) => [p[0], p[1]]), w: roadW(ri), ri }); });
// the bridges: deck centre lines (the lanes stop at each end)
for (const b of T.BRIDGES) lines.push({ pts: [[b.x0 - 0.6, b.z], [b.x1 + 0.6, b.z]], w: b.w / 2 - 0.25, kind: 'wood' });
// the plaza before the lab gate: the lab bridge's landing to the stream path and the woodland trail
{
  const P = T.PLAZA, c = [(P.x0 + P.x1) / 2 - 1.0, T.BRIDGES[0].z];
  lines.push({ pts: [[T.BRIDGES[0].x1 + 0.6, T.BRIDGES[0].z], c], w: 1.45, kind: 'plaza' });
  lines.push({ pts: [c, [15.5, 24.5]], w: 1.45, kind: 'plaza' });
  lines.push({ pts: [c, [15.5, 8.5]], w: 1.45, kind: 'plaza' });
}
// resample every line at STEP
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    let s = step - carry;
    while (s <= L) { out.push([ax + (bx - ax) * s / L, az + (bz - az) * s / L]); s += step; }
    carry = L - (s - step);
  }
  const e = pts[pts.length - 1], l = out[out.length - 1];
  if (Math.hypot(e[0] - l[0], e[1] - l[1]) > step * 0.3) out.push(e); else out[out.length - 1] = e;
  return out;
}
for (const L of lines) L.pts = resample(L.pts, STEP);
// Route 1 ends at the gate (the walk grid stops there)
for (const L of lines) L.pts = L.pts.filter(([, z]) => z > T.ROUTE1.gateZ + 0.8);
// the centre line kept clear of the world's colliders (a wall's end, a post by a lane):
// pushed out like the game's collide() with a margin, then eased so it stays smooth
const CLEAR = 0.55;
function collide(x, z, r) {
  for (const c of world.colliders) {
    if (Math.abs(x - c[1]) > 14 || Math.abs(z - c[2]) > 14) continue;
    if (c[0] === 1) {
      const dx = x - c[1], dz = z - c[2], cs = Math.cos(c[5]), sn = Math.sin(c[5]);
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, ox = c[3] + r - Math.abs(lx), oz = c[4] + r - Math.abs(lz);
      if (ox > 0 && oz > 0) {
        let mx = 0, mz = 0;
        if (ox < oz) mx = Math.sign(lx) * ox; else mz = Math.sign(lz) * oz;
        x += mx * cs + mz * sn; z += -mx * sn + mz * cs;
      }
    } else {
      const dx = x - c[1], dz = z - c[2], d = Math.hypot(dx, dz), m = c[3] + r;
      if (d < m && d > 1e-4) { x += dx / d * (m - d); z += dz / d * (m - d); }
    }
  }
  return [x, z];
}
// the walk grid's flags (as the game joins them from the regions' tiles)
const G = world.ground, flagTiles = [];
for (const id of world.regions) {
  const rj = JSON.parse(fs.readFileSync(path.join(ROOT, 'native/world/r', id, 'region.json'), 'utf8'));
  const t = rj.tiles && rj.tiles.ground;
  if (!t) continue;
  const b = fs.readFileSync(path.join(ROOT, 'native/world/r', id, 'ground.bin'));
  flagTiles.push({ i0: t[0], j0: t[1], w: t[2], h: t[3], f: b.subarray(t[2] * t[3] * 2) });
}
function flagAt(x, z) {
  const i = Math.floor((x - G.x0) / G.res), j = Math.floor((z - G.z0) / G.res);
  for (const t of flagTiles) if (i >= t.i0 && i < t.i0 + t.w && j >= t.j0 && j < t.j0 + t.h) return t.f[(j - t.j0) * t.w + (i - t.i0)];
  return 255;
}
// rideable: on the grid, not water (a deck over it is fine), not no-walk, clear of colliders
const rideable = (x, z, r) => { const f = flagAt(x, z); if (f === 255 || (f & 2) || ((f & 1) && !(f & 4))) return false; const q = collide(x, z, r); return Math.hypot(q[0] - x, q[1] - z) < 0.01; };
// the nearest rideable spot (rings out to 2.5 m)
function settle(x, z, r) {
  if (rideable(x, z, r)) return [x, z];
  for (let rr = 0.25; rr <= 2.5; rr += 0.25) {
    let best = null, bd = 1e9;
    for (let a = 0; a < 24; a++) {
      const qx = x + Math.cos(a / 24 * Math.PI * 2) * rr, qz = z + Math.sin(a / 24 * Math.PI * 2) * rr;
      if (rideable(qx, qz, r)) { const d = Math.hypot(qx - x, qz - z); if (d < bd) { bd = d; best = [qx, qz]; } }
    }
    if (best) return best;
  }
  return [x, z];
}
let pushed = 0, trimmed = 0;
const segOk = (a, b) => { const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.2)); for (let k = 1; k < n; k++) { const u = k / n; if (!rideable(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 0.3)) return false; } return true; };
// a way from a to b round what is between them: breadth-first over 0.25 m cells near them
function around(a, b) {
  const R = 0.25, pad = 6;
  const x0 = Math.min(a[0], b[0]) - pad, z0 = Math.min(a[1], b[1]) - pad;
  const nx = Math.ceil((Math.abs(b[0] - a[0]) + 2 * pad) / R), nz = Math.ceil((Math.abs(b[1] - a[1]) + 2 * pad) / R);
  const ci = (x, z) => [Math.floor((x - x0) / R), Math.floor((z - z0) / R)];
  const ok = new Uint8Array(nx * nz), prev = new Int32Array(nx * nz).fill(-1);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) ok[j * nx + i] = rideable(x0 + (i + 0.5) * R, z0 + (j + 0.5) * R, 0.4) ? 1 : 0;
  const [ai, aj] = ci(...a), [bi, bj] = ci(...b);
  const s0 = aj * nx + ai, t0 = bj * nx + bi;
  ok[s0] = 1; ok[t0] = 1;
  const q = [s0]; prev[s0] = s0;
  while (q.length) {
    const c = q.shift();
    if (c === t0) break;
    const i = c % nx, j = (c - i) / nx;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const k = jj * nx + ii;
      if (!ok[k] || prev[k] >= 0) continue;
      prev[k] = c; q.push(k);
    }
  }
  if (prev[t0] < 0) return null;
  const cells = [];
  for (let c = t0; c !== s0; c = prev[c]) cells.push(c);
  cells.reverse();
  let pts = cells.map((c) => { const i = c % nx, j = (c - i) / nx; return [x0 + (i + 0.5) * R, z0 + (j + 0.5) * R]; });
  pts[pts.length - 1] = b;
  // eased, then thinned to about 0.5 m
  for (let it = 0; it < 3; it++) pts = pts.map((p, i, A) => (i === 0 || i === A.length - 1 ? p : [(A[i - 1][0] + 2 * p[0] + A[i + 1][0]) / 4, (A[i - 1][1] + 2 * p[1] + A[i + 1][1]) / 4]));
  const thin = pts.filter((_, i) => i % 2 === 1 || i === pts.length - 1);
  return thin;
}
for (const L of lines) {
  if (L.kind === 'wood') continue;   // (the bridges' decks: the grid's deck cells)
  let moved = false;
  for (let pass = 0; pass < 4; pass++) {
    moved = false;
    L.pts = L.pts.map(([x, z]) => { const q = settle(x, z, CLEAR); if (Math.hypot(q[0] - x, q[1] - z) > 0.01) moved = true; return q; });
    if (!moved) break;
    if (pass === 0) { pushed++; L.moved = true; }
    // ease the kinks (ends fixed)
    for (let it = 0; it < 4; it++) L.pts = L.pts.map((q, i, a) => (i === 0 || i === a.length - 1 ? q : [(a[i - 1][0] + 2 * q[0] + a[i + 1][0]) / 4, (a[i - 1][1] + 2 * q[1] + a[i + 1][1]) / 4]));
  }
  if (L.moved && L.pts.length > 2) L.pts = resample(L.pts, STEP / 2);
  L.pts = L.pts.map(([x, z]) => settle(x, z, CLEAR - 0.2));
  // between the points too: a segment that clips a corner or crosses a wall's end is
  // replaced by a way round on the walk grid (a small search); a dead end's last metres
  // that cannot be ridden (past a lookout's rail) are trimmed
  const n0 = L.pts.length;
  const out = [L.pts[0]];
  for (let i = 1; i < L.pts.length; i++) {
    const a = out[out.length - 1], b = L.pts[i];
    if (segOk(a, b)) { out.push(b); continue; }
    const way = around(a, b);
    if (way) { out.push(...way); continue; }
    // no way: the rest of a dead end is dropped (an end within 6 m), else kept and reported by the QA
    if (L.pts.length - i < 7) break;
    out.push(b);
  }
  L.pts = out;
  if (L.pts.length < n0 - 1) trimmed++;
}

// ---------- junctions: cut points on each line ----------
// cuts[li] = Map(index -> [x, z]) ; a line's ends are always cuts
const cuts = lines.map((L) => new Map([[0, L.pts[0]], [L.pts.length - 1, L.pts[L.pts.length - 1]]]));
const links = [];   // extra short edges [[x, z], [x, z]] from an end to where it meets another line
function nearest(L, x, z, skipEnd = -1) {
  let best = 1e9, bi = -1;
  const sp = Math.max(0.2, Math.hypot(L.pts[1][0] - L.pts[0][0], L.pts[1][1] - L.pts[0][1]));
  L.pts.forEach(([px, pz], i) => { if (skipEnd >= 0 && Math.abs(i - skipEnd) * sp < 8) return; const d = Math.hypot(px - x, pz - z); if (d < best) { best = d; bi = i; } });
  return [best, bi];
}
lines.forEach((A, ai) => {
  for (const end of [0, A.pts.length - 1]) {
    const [x, z] = A.pts[end];
    lines.forEach((B, bi) => {
      const [d, k] = nearest(B, x, z, ai === bi ? end : -1);
      if (k < 0 || d > JOIN) return;
      // (a line that only touches B's own end is joined there; else B is cut at k)
      const sp = Math.max(0.2, Math.hypot(B.pts[1][0] - B.pts[0][0], B.pts[1][1] - B.pts[0][1])), nk = Math.round(2.5 / sp);
      const kk = k <= nk ? 0 : k >= B.pts.length - 1 - nk ? B.pts.length - 1 : k;
      cuts[bi].set(kk, B.pts[kk]);
      if (Math.hypot(B.pts[kk][0] - x, B.pts[kk][1] - z) > 0.3) links.push([[x, z], B.pts[kk]]);
    });
  }
});
// two lines crossing mid-way
function segX(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}
for (let ai = 0; ai < lines.length; ai++) for (let bi = ai + 1; bi < lines.length; bi++) {
  const A = lines[ai].pts, B = lines[bi].pts;
  for (let i = 0; i < A.length - 1; i++) for (let j = 0; j < B.length - 1; j++) {
    if (Math.abs(A[i][0] - B[j][0]) > 3 || Math.abs(A[i][1] - B[j][1]) > 3) continue;
    if (!segX(A[i], A[i + 1], B[j], B[j + 1])) continue;
    cuts[ai].set(i, A[i]); cuts[bi].set(j, B[j]);
    links.push([A[i], B[j]]);
  }
}

// ---------- nodes ----------
const nodes = [];
function nodeAt(p) {
  for (let i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i][0] - p[0], nodes[i][1] - p[1]) < MERGE) return i;
  nodes.push([p[0], p[1]]);
  return nodes.length - 1;
}
// junction cuts first (so the nodes sit on the roads), then plain ends
const edges = [];
const surf = (x, z, kind) => {
  if (kind === 'wood') return 'wood';
  if (kind === 'plaza') return 'sand';
  if (Math.abs(x - T.routeX(z)) < 6 && z < -386) return 'cobble';
  if (Math.abs(x - T.routeX(z)) < 6 && z < -335) return 'gravel';
  return 'dirt';
};
lines.forEach((L, li) => {
  const ks = [...cuts[li].keys()].sort((a, b) => a - b);
  for (let c = 0; c < ks.length - 1; c++) {
    const pts = L.pts.slice(ks[c], ks[c + 1] + 1);
    if (pts.length < 2) continue;
    edges.push({ a: nodeAt(pts[0]), b: nodeAt(pts[pts.length - 1]), w: L.w, kind: L.kind, pts });
  }
});
for (const [p, q] of links) {
  const a = nodeAt(p), b = nodeAt(q);
  if (a === b) continue;
  if (edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) continue;
  edges.push({ a, b, w: 1.2, pts: resample([p, q], STEP) });
}
// the edges' ends sit on their nodes exactly
for (const e of edges) { e.pts[0] = nodes[e.a]; e.pts[e.pts.length - 1] = nodes[e.b]; }
let kept = edges.filter((e) => e.a !== e.b || e.pts.length > 4);
// stubs: a dead end under 3 m off a junction (a lane that starts just across another)
for (let pass = 0; pass < 3; pass++) {
  const dg = new Array(nodes.length).fill(0);
  for (const e of kept) { dg[e.a]++; dg[e.b]++; }
  kept = kept.filter((e) => !(e.pts.length <= 4 && ((dg[e.a] === 1 && dg[e.b] >= 3) || (dg[e.b] === 1 && dg[e.a] >= 3))));
}
// renumber the nodes still used
{
  const used = [...new Set(kept.flatMap((e) => [e.a, e.b]))].sort((a, b) => a - b), map = new Map(used.map((n, i) => [n, i]));
  const nn = used.map((n) => nodes[n]);
  nodes.length = 0; nodes.push(...nn);
  for (const e of kept) { e.a = map.get(e.a); e.b = map.get(e.b); }
}

// ---------- the stepping stones (walk only) ----------
const walk = [];
const tea = R1.CREEKS.find((c) => c.id === 'tea');
if (tea) {
  const tr = T.ROADS[T.TRAIL0 + 4];
  for (const [x, z] of resample(tr, 0.5)) {
    const q = R1.creekAt(x, z);
    if (q && T.height(x, z) < q.y + 0.06) walk.push([r2(x), r2(z)]);
  }
}

// ---------- out ----------
let len = 0;
const out = {
  note: 'baked by tools/native/bake_paths.mjs from web/world/terrain.js: the bike road assist graph (bike/assist.gd). nodes [x, z]; edges {a, b, w half width m, s surface, p points [x, z]}; walk: points on walk-only crossings (stepping stones)',
  nodes: nodes.map(([x, z]) => [r2(x), r2(z)]),
  edges: kept.map((e) => {
    for (let i = 0; i < e.pts.length - 1; i++) len += Math.hypot(e.pts[i + 1][0] - e.pts[i][0], e.pts[i + 1][1] - e.pts[i][1]);
    const m = e.pts[e.pts.length >> 1];
    return { a: e.a, b: e.b, w: r2(e.w), s: surf(m[0], m[1], e.kind), p: e.pts.map(([x, z]) => [r2(x), r2(z)]) };
  }),
  walk,
};
const deg = new Array(nodes.length).fill(0);
for (const e of out.edges) { deg[e.a]++; deg[e.b]++; }
const file = path.join(ROOT, 'native/bike/paths.json');
fs.writeFileSync(file, JSON.stringify(out) + '\n');
console.log(`bake_paths: ${pushed} lines eased round colliders, ${trimmed} trimmed at an end; ${out.nodes.length} nodes (${deg.filter((d) => d >= 3).length} junctions, ${deg.filter((d) => d === 1).length} ends), ${out.edges.length} edges, ${(len / 1000).toFixed(2)} km, ${walk.length} walk-only points -> ${path.relative(ROOT, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
