// The land around Pallet Town: heights, roads, the stream, the lab hill, the
// coast and the sea. Units are metres; x runs east, z runs south, y is up.
//
// The town plan (the anime's Pallet valley, not a grid): Route 1 comes down a
// valley from the north and through a cutting in the town's northern rim;
// cottages sit spread out on gentle rises round a small square, joined by
// winding dirt lanes; a stream runs south past the town to the sea; Professor
// Oak's lab stands on a tall wooded hill to the south-east, reached over a
// wooden bridge, through a brick gate and up a long stone staircase; farm
// fields lie at the western edge, and a wide beach with a pier in the south.
import * as THREE from 'three';

// ---------- noise ----------
function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}
// seeded random for placing things, so the town looks the same every visit
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- the sea and the coast ----------
export const SEA_Y = -0.7;
// where the dry beach meets the water (the waterline), as a function of x
export function coastZ(x) {
  return 61 + 5 * Math.sin(0.035 * x + 1.3) + 2.5 * Math.sin(0.09 * x + 0.4) + 1.2 * Math.sin(0.21 * x + 2.0);
}
export const POND = { x: -50, z: 40, r: 7, y: -0.1 };

// ---------- the houses (positions only; town.js builds them) ----------
// rot turns a house about its centre (0 = front door faces +z, south);
// side = the side its garden is on. The yard (fence) is local x +-8.4,
// z -5.2..8.6, and the gate is at (dx, 8.6) with dx = -side * 1.75.
export const HOUSES = [
  { id: 'red', x: -24, z: -28, rot: 0.12, side: -1, rise: 1.2 },
  { id: 'blue', x: 32, z: -31, rot: -0.2, side: 1, rise: 1.0 },
  { id: 'hollis', x: -52, z: -14, rot: 0.35, side: 1, rise: 1.8 },
  { id: 'mae', x: -40, z: 13, rot: -0.3, side: 1, rise: 0.8 },
  { id: 'marina', x: -34, z: 46, rot: 0.15, side: -1, rise: 0.5 },
  { id: 'farmer', x: -72, z: 20, rot: 0.55, side: -1, rise: 1.2 },
  { id: 'oldman', x: -40, z: -48, rot: 0.25, side: -1, rise: 0.6 },
  { id: 'lily', x: -16, z: 27, rot: -0.1, side: 1, rise: 1.4 },
];
export function toWorld(hs, lx, lz) {
  const c = Math.cos(hs.rot), s = Math.sin(hs.rot);
  return [hs.x + lx * c + lz * s, hs.z - lx * s + lz * c];
}
export function toLocal(hs, x, z) {
  const c = Math.cos(hs.rot), s = Math.sin(hs.rot), dx = x - hs.x, dz = z - hs.z;
  return [dx * c - dz * s, dx * s + dz * c];
}
export const YARD = { x0: -8.4, x1: 8.4, z0: -5.2, z1: 8.6 };
export function gateOf(hs) { return toWorld(hs, -hs.side * 1.75, YARD.z1); }
function approach(hs) { return [toWorld(hs, -hs.side * 1.75, YARD.z1 + 2.2), gateOf(hs)]; }
const H = Object.fromEntries(HOUSES.map((h) => [h.id, h]));

// ---------- the lab hill and its stairs ----------
// One straight flight of 26 steps, a landing, and 26 more, climbing east from
// the gate to the plateau the lab stands on.
export const STEP = 0.3;
export const STAIRS = { x0: 19.5, z: 16, run: 0.46, n1: 26, landing: 3.2, n2: 26, hw: 2.0 };
STAIRS.len = STAIRS.n1 * STAIRS.run + STAIRS.landing + (STAIRS.n2 - 1) * STAIRS.run;
STAIRS.x1 = STAIRS.x0 + STAIRS.len;           // where the plateau starts
// the plateau: a rectangle; the hill falls away from it on every side
export const LAB_HILL = { x0: STAIRS.x1, x1: 78, z0: 3, z1: 36, wW: STAIRS.len, wE: 24, wN: 20, wS: 17 };
LAB_HILL.x = (LAB_HILL.x0 + LAB_HILL.x1) / 2; LAB_HILL.z = (LAB_HILL.z0 + LAB_HILL.z1) / 2;
// the sandy plaza before the gate, the bridges over the stream
export const PLAZA = { x0: 11.6, x1: STAIRS.x0, z0: 7, z1: 25 };
export const BRIDGES = [
  { x0: 4.0, x1: 12.4, z: 16, w: 3.6, rails: true, kind: 'lab' },
  { x0: 4.6, x1: 13.8, z: -7.5, w: 3.0, rails: true, kind: 'lane' },
];
export const SQUARE = { x: -3, z: -2, r: 8.5 };

// ---------- roads as control points; smoothed into dense polylines ----------
// Each is a winding dirt lane; the ends of house lanes run to the house gates.
const ROAD_CTRL = [
  // Route 1: down the valley from the north and through the cutting in the rim
  [[1, -150], [-5, -128], [4, -104], [-3, -82], [2, -66], [-1, -56], [-4, -46], [-2, -36], [-5, -26], [-6, -14], [-3, -2]],
  // the main lane south from the square to the beach
  [[-3, -2], [-6, 10], [-5, 24], [-8, 38], [-7, 49], [-9, 56]],
  // to Red's house
  [[-5.6, -18], [-12, -15.5], [-18, -16], ...approach(H.red)],
  // east over the little bridge to Blue's house
  [[-3, -2], [1, -5.6], [BRIDGES[1].x0, -7.5]],
  [[BRIDGES[1].x1, -7.5], [19, -9.5], [24, -13.5], ...approach(H.blue)],
  // to the lab: off the main lane, down to the bridge
  [[-5.6, 7], [-1.5, 12.5], [2, 15.6], [BRIDGES[0].x0, 16]],
  // west to Hollis, with the farm lane and Mae's lane off it
  [[-3, -2], [-12, 1], [-22, 3.5], [-32, 1.5], [-41, -1.5], ...approach(H.hollis)],
  [[-22, 3.5], [-27, 12], [-30, 21], [-35, 25.5], ...approach(H.mae)],
  [[-38, -0.6], [-46, 1.5], [-54, 8], [-59, 18], [-61, 29], ...approach(H.farmer)],
  // north-west up onto the rim to the old man's house
  [[-4.2, -44], [-12, -41.5], [-22, -38.5], [-30, -37], ...approach(H.oldman)],
  // Lily's lane off the main lane
  [[-6.2, 37], [-11, 39], [-16, 38.6], ...approach(H.lily)],
  // along the back of the beach to Marina's
  [[-7.6, 50], [-14, 55.5], [-22, 57.6], [-28, 57.4], ...approach(H.marina)],
];
const ROAD_W = 1.75;

function dense(ctrl, step = 1) {
  const pts = ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z));
  if (pts.length === 2) pts.splice(1, 0, pts[0].clone().lerp(pts[1], 0.5));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((p) => [p.x, p.z]);
}
export const ROADS = ROAD_CTRL.map((c) => dense(c));
export const STREAM = dense([[17, -62], [15, -48], [12.6, -33], [10.4, -19], [9.5, -7.5], [9.2, 4], [8.2, 16], [7.4, 28], [8.6, 40], [6, 52], [4, 62], [3, 74], [1, 90]]);

// ---------- polyline distance with a bucket grid ----------
function segDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  const x = ax + dx * t - px, z = az + dz * t - pz;
  return [x * x + z * z, t];
}
class Lines {
  constructor(lines, range = 16, cell = 8) {
    this.lines = lines; this.range = range; this.cell = cell; this.grid = new Map();
    this.cum = lines.map((l) => { const c = [0]; for (let i = 1; i < l.length; i++) c.push(c[i - 1] + Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1])); return c; });
    lines.forEach((l, li) => {
      for (let i = 0; i < l.length - 1; i++) {
        const [ax, az] = l[i], [bx, bz] = l[i + 1];
        const i0 = Math.floor((Math.min(ax, bx) - range) / cell), i1 = Math.floor((Math.max(ax, bx) + range) / cell);
        const j0 = Math.floor((Math.min(az, bz) - range) / cell), j1 = Math.floor((Math.max(az, bz) + range) / cell);
        for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
          const k = a * 4096 + b; let arr = this.grid.get(k); if (!arr) this.grid.set(k, arr = []);
          arr.push(li, i);
        }
      }
    });
    this.best = new Float64Array(lines.length); this.bestS = new Float64Array(lines.length);
  }
  // nearest distance (capped at range) and, per line, distance and arc length
  query(x, z) {
    const arr = this.grid.get(Math.floor(x / this.cell) * 4096 + Math.floor(z / this.cell));
    this.best.fill(this.range * this.range); let any = false;
    if (arr) for (let k = 0; k < arr.length; k += 2) {
      const li = arr[k], i = arr[k + 1], l = this.lines[li];
      const [d2, t] = segDist2(x, z, l[i][0], l[i][1], l[i + 1][0], l[i + 1][1]);
      if (d2 < this.best[li]) { this.best[li] = d2; this.bestS[li] = this.cum[li][i] + t * (this.cum[li][i + 1] - this.cum[li][i]); any = true; }
    }
    let m = this.range * this.range, mi = -1;
    for (let i = 0; i < this.best.length; i++) if (this.best[i] < m) { m = this.best[i]; mi = i; }
    return any ? { d: Math.sqrt(m), i: mi } : { d: this.range, i: -1 };
  }
}
const RL = new Lines(ROADS, 16);
const SL = new Lines([STREAM], 10);

// ---------- the land before roads and water ----------
// Rolling rises inside the town, a rim of higher ground to the north that
// Route 1 cuts through, hills beyond, the north valley, and the beach.
function base(x, z) {
  let h = (fbm(x * 0.03 + 7, z * 0.03 + 3, 3) - 0.5) * 1.4;
  // broad gentle swells across the valley floor
  h += (fbm(x * 0.013 + 31, z * 0.013 + 17, 3) - 0.42) * 6.5;
  // a soft rise under each house, so they sit on little knolls
  for (const hs of HOUSES) { const d2 = (x - hs.x) ** 2 + (z - hs.z) ** 2; if (d2 < 900) h += hs.rise * Math.exp(-d2 / 260); }
  // the northern rim of the valley
  h += 5.5 * Math.exp(-(((z + 52) / 10) ** 2)) * (1 - smooth(70, 110, Math.abs(x))) * (0.7 + fbm(x * 0.05, 3, 2) * 0.6);
  // hills beyond the town, except toward the sea
  const r = Math.max(Math.abs(x + 8) / 88, z < 0 ? Math.abs(z) / 64 : 0);
  const hill = smooth(1.0, 2.0, r) * (6 + fbm(x * 0.02, z * 0.02, 4) * 22);
  // Route 1 runs north through a valley between the hills
  const valley = 1 - smooth(6, 26, Math.abs(x + Math.sin(z * 0.02) * 6));
  h += hill * (z < -62 ? 1 - valley * 0.85 : 1) * (1 - smooth(28, 50, z));
  // the beach: the land eases down to the waterline and on under the sea
  const c = coastZ(x);
  const beach = Math.max(-7, SEA_Y + 0.11 * (c - z) + (fbm(x * 0.08, z * 0.08, 2) - 0.5) * 0.25 * smooth(c + 2, c - 6, z));
  h = lerp(h, beach, smooth(c - 26, c - 9, z));
  return h;
}
export const baseHeight = base;

// house pads: each house stands level at its knoll's height
for (const hs of HOUSES) hs.y = base(hs.x, hs.z + 1.5) + 0.1;
SQUARE.y = base(SQUARE.x, SQUARE.z);
PLAZA.y = Math.max(0.6, base((PLAZA.x0 + PLAZA.x1) / 2, STAIRS.z));
export const PLAT_Y = PLAZA.y + (STAIRS.n1 + STAIRS.n2) * STEP;
LAB_HILL.y = PLAT_Y;

// the height of each road along its length: the land smoothed out, so lanes
// cut through rises (grassy banks) and run over dips
const PROF = ROADS.map((road) => {
  let p = road.map(([x, z]) => base(x, z));
  // pull the ends to the level of what they join
  for (let pass = 0; pass < 3; pass++) {
    const q = p.slice();
    for (let i = 0; i < p.length; i++) {
      let s = 0, w = 0;
      for (let k = -14; k <= 14; k++) { const j = Math.min(p.length - 1, Math.max(0, i + k)); const ww = 15 - Math.abs(k); s += p[j] * ww; w += ww; }
      q[i] = s / w;
    }
    p = q;
  }
  return p;
});
// pin road ends: at a house gate to the pad, at a bridge to the bridge level
function pinEnds() {
  ROADS.forEach((road, ri) => {
    const pin = (idx, y, n = 10) => { for (let k = 0; k < n && k < road.length; k++) { const i = idx === 0 ? k : road.length - 1 - k; PROF[ri][i] = lerp(y, PROF[ri][i], smooth(0, n, k)); } };
    const end = road[road.length - 1];
    for (const hs of HOUSES) { const g = gateOf(hs); if (Math.hypot(end[0] - g[0], end[1] - g[1]) < 0.5) pin(1, hs.y, 14); }
    if (Math.hypot(road[0][0] - SQUARE.x, road[0][1] - SQUARE.z) < 1) pin(0, SQUARE.y, 10);
    if (Math.hypot(end[0] - SQUARE.x, end[1] - SQUARE.z) < 1) pin(1, SQUARE.y, 10);
  });
}
pinEnds();
// bridges sit level between their banks
for (const b of BRIDGES) {
  const ys = [];
  ROADS.forEach((road, ri) => {
    const a = road[0], e = road[road.length - 1];
    if (Math.abs(e[1] - b.z) < 0.5 && (Math.abs(e[0] - b.x0) < 0.5 || Math.abs(e[0] - b.x1) < 0.5)) ys.push(PROF[ri][road.length - 1]);
    if (Math.abs(a[1] - b.z) < 0.5 && (Math.abs(a[0] - b.x0) < 0.5 || Math.abs(a[0] - b.x1) < 0.5)) ys.push(PROF[ri][0]);
  });
  if (b.kind === 'lab') ys.push(PLAZA.y);
  b.y = Math.max(...ys, 0.3);
  // and the roads ease to that level
  ROADS.forEach((road, ri) => {
    const fix = (fromEnd) => { for (let k = 0; k < 12 && k < road.length; k++) { const i = fromEnd ? road.length - 1 - k : k; PROF[ri][i] = lerp(b.y, PROF[ri][i], smooth(0, 12, k)); } };
    const a = road[0], e = road[road.length - 1];
    if (Math.abs(e[1] - b.z) < 0.5 && (Math.abs(e[0] - b.x0) < 0.5 || Math.abs(e[0] - b.x1) < 0.5)) fix(true);
    if (Math.abs(a[1] - b.z) < 0.5 && (Math.abs(a[0] - b.x0) < 0.5 || Math.abs(a[0] - b.x1) < 0.5)) fix(false);
  });
}

// the stream's water level along its course: always falling toward the sea
const SPROF = (() => {
  const raw = STREAM.map(([x, z]) => base(x, z));
  const p = raw.map((_, i) => { let s = 0, w = 0; for (let k = -8; k <= 8; k++) { const j = Math.min(raw.length - 1, Math.max(0, i + k)); s += raw[j]; w++; } return s / w - 1.0; });
  for (let i = 1; i < p.length; i++) p[i] = Math.min(p[i], p[i - 1] - 0.01);
  for (let i = 0; i < p.length; i++) p[i] = Math.max(p[i], SEA_Y);
  return p;
})();
const profAt = (prof, s) => { const i = Math.max(0, Math.min(prof.length - 2, Math.floor(s))), t = Math.min(1, Math.max(0, s - i)); return prof[i] + (prof[i + 1] - prof[i]) * t; };
// the line arc length is ~1 m per sample, so s indexes the profiles directly
const sIdx = (lines, li, s) => s / (lines.cum[li][lines.cum[li].length - 1] / (lines.lines[li].length - 1));
export function streamAt(x, z) {
  const q = SL.query(x, z);
  if (q.i < 0) return { d: 99, y: SEA_Y, s: 0 };
  return { d: q.d, y: profAt(SPROF, sIdx(SL, 0, SL.bestS[0])), s: SL.bestS[0] };
}
export const STREAM_LEVELS = SPROF;

// ---------- roads ----------
export function roadDist(x, z) { return RL.query(x, z).d; }
// 1 on a road, 0 off it, with a ragged painted edge
export function roadMask(x, z) {
  const d = roadDist(x, z) + (fbm(x * 0.6, z * 0.6, 2) - 0.5) * 0.9;
  return 1 - smooth(ROAD_W - 0.4, ROAD_W + 0.5, d);
}
// how far a point is from anything built: roads, yards, the square
export function townDist(x, z) {
  let d = roadDist(x, z);
  for (const hs of HOUSES) {
    const [lx, lz] = toLocal(hs, x, z);
    const dx = Math.max(YARD.x0 - lx, 0, lx - YARD.x1), dz = Math.max(YARD.z0 - lz, 0, lz - YARD.z1);
    d = Math.min(d, Math.hypot(dx, dz));
  }
  return Math.min(d, Math.hypot(x - SQUARE.x, z - SQUARE.z) - SQUARE.r);
}
export function inYard(x, z, m = 0) {
  return HOUSES.some((hs) => { const [lx, lz] = toLocal(hs, x, z); return lx > YARD.x0 - m && lx < YARD.x1 + m && lz > YARD.z0 - m && lz < YARD.z1 + m; });
}

// ---------- farm fields (rows painted in paths.js) ----------
// [x, z, length along rows, width, rotation, kind]
export const FIELDS = [
  { x: -80, z: -8, w: 26, d: 18, rot: 0.25, kind: 'till' },
  { x: -95, z: 22, w: 18, d: 24, rot: 0.55, kind: 'crop' },
  { x: -62, z: -32, w: 18, d: 13, rot: -0.2, kind: 'crop' },
  { x: -84, z: -34, w: 16, d: 14, rot: 0.1, kind: 'wheat' },
  { x: 40, z: -50, w: 20, d: 12, rot: -0.12, kind: 'till' },
];
export function fieldAt(x, z, m = 0) {
  for (const f of FIELDS) {
    const c = Math.cos(f.rot), s = Math.sin(f.rot), dx = x - f.x, dz = z - f.z;
    const u = dx * c - dz * s, v = dx * s + dz * c;
    if (Math.abs(u) < f.w / 2 + m && Math.abs(v) < f.d / 2 + m) return f;
  }
  return null;
}

// ---------- the lab hill ----------
// u = 0 on the plateau, 1 at the hill's foot
function hillU(x, z) {
  const L = LAB_HILL;
  const ax = x < L.x0 ? (L.x0 - x) / L.wW : x > L.x1 ? (x - L.x1) / L.wE : 0;
  const az = z < L.z0 ? (L.z0 - z) / L.wN : z > L.z1 ? (z - L.z1) / L.wS : 0;
  return Math.hypot(ax, az);
}
export function labHillU(x, z) { return hillU(x, z); }
function hillProfile(u) { return u <= 0 ? 1 : u >= 1 ? 0 : 1 - (0.55 * u + 0.45 * u * u * (3 - 2 * u)); }
// the stairs: height of the tread at a point along the flight
export function stairY(x) {
  const S = STAIRS, s = x - S.x0;
  if (s < 0) return PLAZA.y;
  const f1 = S.n1 * S.run;
  if (s < f1) return PLAZA.y + (Math.floor(s / S.run) + 1) * STEP;
  const yl = PLAZA.y + S.n1 * STEP;
  if (s < f1 + S.landing) return yl;
  return Math.min(PLAT_Y, yl + (Math.floor((s - f1 - S.landing) / S.run) + 1) * STEP);
}
export function stairDist(x, z) {
  const S = STAIRS, dz = Math.abs(z - S.z);
  const dx = x < S.x0 ? S.x0 - x : x > S.x1 ? x - S.x1 : 0;
  return Math.hypot(dx, dz);
}
export function onStairs(x, z, m = 0) { return x > STAIRS.x0 - 0.4 && x < STAIRS.x1 + 0.6 && Math.abs(z - STAIRS.z) < STAIRS.hw + m; }
// the hill blocks walking everywhere but the stairs and the plateau
export function noWalk(x, z) {
  const u = hillU(x, z);
  if (u <= 0.002 || u > 0.985) return false;
  return !onStairs(x, z, -0.15);
}

// ---------- the height ----------
export function height(x, z) {
  let h = base(x, z);
  // roads: blend toward each nearby road's smoothed level
  const q = RL.query(x, z);
  if (q.i >= 0) {
    let sw = 0, sy = 0, wmax = 0;
    for (let i = 0; i < ROADS.length; i++) {
      const d2 = RL.best[i]; if (d2 >= 225) continue;
      const d = Math.sqrt(d2);
      // the lane, a soft shoulder, then the bank up to the natural ground
      const bank = 3.2 + Math.min(4, Math.abs(h - profAt(PROF[i], sIdx(RL, i, RL.bestS[i])))) * 1.1;
      const w = 1 - smooth(2.4, 2.4 + bank, d);
      if (w <= 0) continue;
      sy += profAt(PROF[i], sIdx(RL, i, RL.bestS[i])) * w; sw += w; wmax = Math.max(wmax, w);
    }
    if (sw > 0) h = lerp(h, sy / sw, wmax);
  }
  // the square, the yards, the plaza before the lab gate
  { const d = Math.hypot(x - SQUARE.x, z - SQUARE.z); if (d < SQUARE.r + 6) h = lerp(h, SQUARE.y, 1 - smooth(SQUARE.r - 1, SQUARE.r + 6, d)); }
  for (const hs of HOUSES) {
    const [lx, lz] = toLocal(hs, x, z);
    const dx = Math.max(-9.4 - lx, lx - 9.4, 0), dz = Math.max(-6.4 - lz, lz - 9.8, 0), d = Math.hypot(dx, dz);
    if (d < 7) h = lerp(h, hs.y, 1 - smooth(0, 7, d));
  }
  {
    const P = PLAZA, dx = Math.max(P.x0 - x, x - P.x1, 0), dz = Math.max(P.z0 - z, z - P.z1, 0), d = Math.hypot(dx, dz);
    if (d < 6) h = lerp(h, P.y, 1 - smooth(0, 6, d));
  }
  // the pond
  const pd = Math.hypot(x - POND.x, z - POND.z);
  if (pd < POND.r + 4) h = Math.min(h, lerp(POND.y - 1.4, h, smooth(POND.r - 3.5, POND.r + 1.5, pd)));
  // the stream: a channel with steep rocky banks
  const st = SL.query(x, z);
  if (st.i >= 0 && st.d < 6) {
    const wl = profAt(SPROF, sIdx(SL, 0, SL.bestS[0]));
    const bed = wl - 0.7 - (1 - smooth(0, 1.6, st.d)) * 0.3;
    h = Math.min(h, lerp(bed, Math.max(h, wl + 0.45), smooth(1.7, 3.4, st.d)));
  }
  // Oak's hill: steep and wooded, with a level top for the lab
  const u = hillU(x, z);
  if (u < 1) {
    const n = (fbm(x * 0.15, z * 0.15, 2) - 0.5) * 1.2 * smooth(0, 0.15, u) * (1 - smooth(0.8, 1, u));
    const foot = Math.max(PLAZA.y, Math.min(h, PLAZA.y + 0.5));
    let hh = foot + (PLAT_Y - foot) * hillProfile(u) + n;
    // the stairs cut a straight, even run into the slope
    const dz = Math.abs(z - STAIRS.z);
    if (x > STAIRS.x0 - 1.5 && x < STAIRS.x1 + 1 && dz < 5) {
      const sy = stairY(x);
      hh = lerp(sy, hh, smooth(STAIRS.hw + 0.05, STAIRS.hw + 2.6, dz));
    }
    h = Math.max(h, hh);
  }
  return h;
}

// water level at a point (sea, pond or stream)
export function waterLevel(x, z) {
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 2) return POND.y;
  const s = streamAt(x, z);
  if (s.d < 4) return Math.max(SEA_Y, s.y);
  return SEA_Y;
}
export function isWater(x, z) { return height(x, z) < waterLevel(x, z) - 0.05; }

// ---------- colours ----------
const C = (h) => new THREE.Color(h);
const GRASS_A = C('#72c94a'), GRASS_B = C('#9ad655'), GRASS_C = C('#56b04a'), GRASS_DRY = C('#b8d062');
const DIRT_D = C('#cfa86e'), SAND = C('#f7dc9c'), SAND_W = C('#d9b67a'), SAND_DRY = C('#fde9b8');
const ROCK = C('#a08890'), ROCK_D = C('#7a6070'), MUD = C('#8a7a52'), PLAZA_C = C('#ead7a6'), SOIL = C('#a0644a');

export function groundColor(x, z, h, slope, out) {
  const n = fbm(x * 0.08, z * 0.08, 3), n2 = fbm(x * 0.4 + 11, z * 0.4, 2);
  out.copy(GRASS_A).lerp(GRASS_B, smooth(0.35, 0.7, n)).lerp(GRASS_C, smooth(0.55, 0.85, n2) * 0.5);
  out.lerp(GRASS_DRY, smooth(0.62, 0.8, fbm(x * 0.02 + 40, z * 0.02, 2)) * 0.35);
  // purple-brown rock where banks and hillsides are steep
  out.lerp(ROCK.clone().lerp(ROCK_D, n2), smooth(0.5, 0.8, slope));
  // a darker damp green at the road edges, so the fringe reads as shade
  const rd = roadDist(x, z);
  if (rd < 2.6) out.lerp(GRASS_C, (1 - smooth(1.6, 2.6, rd)) * 0.5);
  // the stairs and the plaza
  if (onStairs(x, z, 0.3)) out.lerp(DIRT_D, 0.8);
  const P = PLAZA, pd = Math.hypot(Math.max(P.x0 - x, x - P.x1, 0), Math.max(P.z0 - z, z - P.z1, 0));
  out.lerp(PLAZA_C, (1 - smooth(0, 1.6, pd + (n2 - 0.5) * 1.2)) * 0.95);
  const sq = Math.hypot(x - SQUARE.x, z - SQUARE.z);
  out.lerp(PLAZA_C, (1 - smooth(SQUARE.r - 2.5, SQUARE.r - 0.5, sq + (n2 - 0.5) * 1.5)) * 0.9);
  // soil under the fields (their painted rows cover it)
  if (fieldAt(x, z, 1.5)) out.lerp(SOIL, fieldAt(x, z, 0.2) ? 0.9 : 0.35);
  // muddy banks
  const pd2 = Math.hypot(x - POND.x, z - POND.z);
  out.lerp(MUD, (1 - smooth(POND.r - 1, POND.r + 2.5, pd2)) * 0.6);
  const st = streamAt(x, z);
  if (st.d < 3.6) out.lerp(ROCK.clone().lerp(MUD, 0.4), (1 - smooth(2.2, 3.6, st.d)) * 0.7);
  // the beach: dry pale sand up top, warm sand, dark wet sand at the water
  const c = coastZ(x);
  const sandK = smooth(c - 17, c - 12, z + (n - 0.5) * 3) * (1 - smooth(1.8, 3.5, h - SEA_Y)) ;
  if (sandK > 0) {
    const s = SAND.clone().lerp(SAND_DRY, smooth(0.6, 1.4, h - SEA_Y)).lerp(SAND_W, 1 - smooth(0.05, 0.35, h - SEA_Y));
    out.lerp(s, sandK);
  }
  return out;
}

// ---------- meshes ----------
export function buildTerrain() {
  const size = 420, seg = 280;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let y = height(x, z);
    // under the stairs the ground sinks out of sight (the stone flights cover it)
    if (onStairs(x, z, 0.6)) y -= 1.4;
    pos.setY(i, y);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    groundColor(x, z, pos.getY(i), 1 - nrm.getY(i), tmp);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// The water as the anime paints it: turquoise over sand, deep blue further
// out, crisp white bands of foam rolling onto the beach, a white edge where
// it laps the sand, a slow swell and glints of sun. A depth map of the sea
// floor (baked once) tells the shader how deep the water is.
export function buildWater(uTime, fog = { color: '#cfe6f2', near: 160, far: 900 }) {
  const group = new THREE.Group();
  // depth map over the coast: 1 texel = 1 m
  const DX0 = -210, DZ0 = 20, DW = 420, DD = 160;
  const data = new Uint8Array(DW * DD * 4);
  for (let j = 0; j < DD; j++) for (let i = 0; i < DW; i++) {
    const x = DX0 + i + 0.5, z = DZ0 + j + 0.5;
    const d = SEA_Y - height(x, z);
    const k = (j * DW + i) * 4;
    data[k] = Math.max(0, Math.min(255, Math.round((0.5 + d / 16) * 255)));
    data[k + 1] = data[k + 2] = 0; data[k + 3] = 255;
  }
  const depthTex = new THREE.DataTexture(data, DW, DD, THREE.RGBAFormat);
  depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;
  const seaVert = `
    uniform float uTime; varying vec3 vW;
    void main(){ vec4 w = modelMatrix * vec4(position,1.0);
      float far = smoothstep(80.0, 20.0, w.z);
      w.y += (sin(w.x*0.06 + w.z*0.11 - uTime*0.9)*0.09 + sin(w.x*0.17 - w.z*0.05 + uTime*0.7)*0.04) * (1.0 - far);
      vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const seaFrag = `
    uniform float uTime; uniform sampler2D uDepth; uniform vec4 uDB;
    uniform vec3 fogColor; uniform float fogNear, fogFar;
    varying vec3 vW;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    void main(){
      vec2 uv = (vW.xz - uDB.xy) / uDB.zw;
      float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
      float depth = mix(30.0, (texture2D(uDepth, clamp(uv, 0.0, 1.0)).r - 0.5) * 16.0, inside);
      depth = mix(depth, 30.0, smoothstep(0.85, 1.0, uv.y));
      float wob = n(vW.xz*0.25 + vec2(uTime*0.1, uTime*0.05)) - 0.5;
      float dd = depth + wob * 0.5;
      // painted bands of colour, from the sand out to the deep
      vec3 c0 = vec3(0.47, 0.90, 0.84), c1 = vec3(0.20, 0.74, 0.82), c2 = vec3(0.13, 0.52, 0.78), c3 = vec3(0.10, 0.36, 0.66);
      vec3 c = mix(c0, c1, smoothstep(0.7, 1.0, dd));
      c = mix(c, c2, smoothstep(2.6, 3.1, dd));
      c = mix(c, c3, smoothstep(6.5, 8.0, dd));
      // soft lighter streaks on the swell
      float sw = n(vec2(vW.x*0.05, vW.z*0.2 - uTime*0.15));
      c += vec3(0.05, 0.07, 0.06) * smoothstep(0.62, 0.7, sw) * smoothstep(1.0, 4.0, dd);
      // foam: bands that roll in toward the beach and break up as they go
      float ph = depth * 0.55 + uTime * 0.32 + n(vW.xz*0.12) * 0.6;
      float band = fract(ph);
      float brk = n(vW.xz * vec2(0.35, 0.9) + vec2(0.0, uTime*0.4));
      float foam = step(0.9, band) * step(0.35, brk) * (1.0 - smoothstep(2.2, 3.4, depth));
      foam = max(foam, step(0.955, band) * step(0.55, brk) * (1.0 - smoothstep(3.4, 5.0, depth)));
      // the edge where it laps the sand, sliding up and back
      float lap = 0.16 + 0.1 * sin(uTime*1.1 + vW.x*0.08) + 0.05 * n(vW.xz*0.8 + uTime*0.3);
      foam = max(foam, step(depth, lap));
      float rim = step(depth, lap + 0.22) * step(0.5, n(vW.xz*1.6 + vec2(uTime*0.6, 0.0)));
      foam = max(foam, rim);
      c = mix(c, vec3(0.97, 0.99, 1.0), foam);
      // glints of sun on the open water
      vec2 g = floor(vW.xz * vec2(0.9, 2.2));
      float tw = h(g) ; float on = step(0.985, tw) * step(0.5, fract(uTime*0.35 + tw*7.0));
      vec2 fp = fract(vW.xz * vec2(0.9, 2.2)) - 0.5;
      c = mix(c, vec3(1.0), on * step(length(fp*vec2(1.0, 0.5)), 0.18) * smoothstep(3.0, 6.0, depth));
      float d = length(vW - cameraPosition);
      c = mix(c, fogColor, smoothstep(fogNear, fogFar, d));
      float a = mix(0.72, 1.0, smoothstep(0.2, 1.6, depth));
      gl_FragColor = vec4(c, max(a, foam));
      #include <colorspace_fragment>
    }`;
  const seaMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uDepth: { value: depthTex }, uDB: { value: new THREE.Vector4(DX0, DZ0, DW, DD) },
      fogColor: { value: C(fog.color) }, fogNear: { value: fog.near }, fogFar: { value: fog.far } },
    vertexShader: seaVert, fragmentShader: seaFrag, transparent: true, depthWrite: false,
  });
  // near the coast a fine mesh for the swell, then a vast flat sea to the horizon
  const near = new THREE.Mesh(new THREE.PlaneGeometry(440, 160, 220, 80).rotateX(-Math.PI / 2), seaMat);
  near.position.set(0, SEA_Y, 100);
  near.renderOrder = 1;
  group.add(near);
  const farG = new THREE.BufferGeometry();
  {
    // a big flat ring of sea round the near patch: x -3000..3000, z 0..3000
    const quads = [[-3000, 180, 3000, 3000], [-3000, 20, -220, 180], [220, 20, 3000, 180]];
    const p = [];
    for (const [x0, z0, x1, z1] of quads) p.push(x0, 0, z0, x0, 0, z1, x1, 0, z1, x0, 0, z0, x1, 0, z1, x1, 0, z0);
    farG.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  }
  const far = new THREE.Mesh(farG, seaMat); far.position.y = SEA_Y; far.renderOrder = 1; far.frustumCulled = false;
  group.add(far);

  // the pond and the stream: fresh water, a lighter green-blue, gentle ripples
  const freshVert = `uniform float uTime; varying vec3 vW; varying vec2 vUv;
    void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const freshFrag = `uniform float uTime; uniform float uFlow; uniform vec3 fogColor; uniform float fogNear, fogFar;
    varying vec3 vW; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    void main(){
      float e = abs(vUv.x - 0.5) * 2.0;
      vec3 c = mix(vec3(0.18, 0.55, 0.72), vec3(0.42, 0.82, 0.82), smoothstep(0.2, 0.75, e));
      vec2 q = uFlow > 0.5 ? vec2(vUv.x * 6.0, vUv.y * 0.6 - uTime * 0.9) : vW.xz * 0.6 + uTime * 0.1;
      float s = n(q * vec2(1.0, 1.0));
      c = mix(c, vec3(0.78, 0.95, 0.96), step(0.72, s) * 0.8);
      c = mix(c, vec3(0.97, 1.0, 1.0), step(0.86, e + n(vW.xz*1.3 + uTime*0.5)*0.15) * uFlow);
      float d = length(vW - cameraPosition);
      c = mix(c, fogColor, smoothstep(fogNear, fogFar, d));
      gl_FragColor = vec4(c, 0.9);
      #include <colorspace_fragment>
    }`;
  const fresh = (flow) => new THREE.ShaderMaterial({
    uniforms: { uTime, uFlow: { value: flow }, fogColor: { value: C(fog.color) }, fogNear: { value: 120 }, fogFar: { value: 420 } },
    vertexShader: freshVert, fragmentShader: freshFrag, transparent: true, side: THREE.DoubleSide,
  });
  const pond = new THREE.Mesh(new THREE.CircleGeometry(POND.r + 2.2, 48).rotateX(-Math.PI / 2), fresh(0));
  pond.position.set(POND.x, POND.y, POND.z);
  group.add(pond);
  // the stream ribbon, stepping down toward the sea
  {
    const pos = [], uv = [], idx = [];
    const HW = 2.9;
    for (let i = 0; i < STREAM.length; i++) {
      const a = STREAM[Math.max(0, i - 1)], b = STREAM[Math.min(STREAM.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      const y = SPROF[i];
      if (y <= SEA_Y + 0.02 && i > 0 && SPROF[i - 1] <= SEA_Y + 0.02) break;
      for (const s of [-1, 1]) { pos.push(STREAM[i][0] + nx * HW * s, y, STREAM[i][1] + nz * HW * s); uv.push((s + 1) / 2, i); }
      if (i > 0) { const p = (i - 1) * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    group.add(new THREE.Mesh(g, fresh(1)));
  }
  return group;
}

// Height and grass density over an area, as a float texture for the grass:
// r = ground height, g = how much grass grows there.
export function grassMap(x0, z0, w, d, res) {
  const nx = Math.round(w / res), nz = Math.round(d / res);
  const data = new Float32Array(nx * nz * 4);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + (i + 0.5) * res, z = z0 + (j + 0.5) * res;
    const h = height(x, z);
    let g = smooth(1.55, 2.0, roadDist(x, z));
    if (isWater(x, z) || h < SEA_Y + 1.6 && z > coastZ(x) - 16) g = 0;
    if (onStairs(x, z, 0.4) || fieldAt(x, z, 0.3)) g = 0;
    if (Math.hypot(x - SQUARE.x, z - SQUARE.z) < SQUARE.r - 1) g = 0;
    { const P = PLAZA; if (x > P.x0 - 0.5 && x < P.x1 + 0.5 && z > P.z0 - 0.5 && z < P.z1 + 0.5) g = 0; }
    if (streamAt(x, z).d < 3.2) g = 0;
    // patchy: tufts and drifts, open lawn between
    g *= 0.12 + smooth(0.42, 0.68, fbm(x * 0.11 + 3, z * 0.11, 3)) * 0.88;
    const k = (j * nx + i) * 4;
    data[k] = h; data[k + 1] = Math.max(0, Math.min(1, g)); data[k + 3] = 1;
  }
  const t = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.FloatType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
