// Route 1's land beyond the old valley: the side pockets (the farm, the flower
// meadow on the east plateau, the berry orchard, the tea house dell, the rest
// area, the Viridian outskirts), the trails into them, two creeks and the
// farm field. Pure numbers and functions (no imports from terrain.js, which
// imports this): terrain.js calls the hooks below from routeLand, height,
// waterLevel, outOfBounds, groundColor and buildWater; veg.js asks treeDensity.
// The props standing in these places are route1.js.
//
// Units as terrain.js: metres, x east, z south (Route 1 runs north = -z).
import * as THREE from 'three';

// ---------- a little noise of its own ----------
function hash(x, y) {
  let h = x * 374761393 + y * 668265263 + 9127;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function n2(x, y, oct = 3) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vn(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- the pockets ----------
// Each is an ellipse (cx, cz, rx, rz, turned by rot) opening off the valley;
// inside it the land is the valley floor (the `floor` terrain.js passes, with
// its slope north and the ledges' ramps) plus `rise`, which climbs from the
// valley side (u = 0) to the back (u = 1) over [r0, r1] of u, plus gentle
// rolls. `edge` metres of falloff into the hills; `trees` the forest density
// inside (veg.js); `walk` = the player may roam it.
// zone: 1 Pallet's fields, 2 the hills, 3 the dells, 4 Viridian's edge
export const POCKETS = [
  // the farm: Pallet's last field and a little ranch below the first ledge
  { id: 'farm', zone: 1, cx: -58, cz: -98, rx: 36, rz: 22, rot: 0.1, side: -1, rise: 4.5, r0: 0.25, r1: 1.25, roll: 0.8, edge: 24, trees: 0.0 },
  // the flower meadow: up on the east plateau, rolling, a lone tree on its
  // crest and a lookout on its southern rim over Pallet and the sea
  { id: 'meadow', zone: 2, cx: 70, cz: -152, rx: 58, rz: 50, rot: -0.12, side: 1, rise: 15.5, r0: 0.02, r1: 0.5, roll: 2.2, edge: 24, trees: 0.0 },
  // the berry orchard on a gentle terrace, west
  { id: 'orchard', zone: 2, cx: -86, cz: -190, rx: 40, rz: 24, rot: 0.08, side: -1, rise: 7, r0: 0.2, r1: 1.25, roll: 0.6, edge: 24, trees: 0.0 },
  // the tea house dell, west, where the creek comes off the hill
  { id: 'tea', zone: 3, cx: -72, cz: -250, rx: 36, rz: 25, rot: -0.05, side: -1, rise: 6, r0: 0.3, r1: 1.3, roll: 0.5, edge: 24, trees: 0.03 },
  // the rest area, east: picnic tables, a vending machine, the old oak
  { id: 'rest', zone: 3, cx: 80, cz: -294, rx: 32, rz: 27, rot: 0.1, side: 1, rise: 7, r0: 0.25, r1: 1.3, roll: 0.6, edge: 24, trees: 0.04 },
  // the outskirts of Viridian: a cottage garden west, the water tower east
  { id: 'west_end', zone: 4, cx: -62, cz: -404, rx: 32, rz: 26, rot: 0.0, side: -1, rise: 7, r0: 0.25, r1: 1.3, roll: 0.5, edge: 24, trees: 0.06 },
  { id: 'east_end', zone: 4, cx: 56, cz: -404, rx: 30, rz: 26, rot: 0.0, side: 1, rise: 7, r0: 0.25, r1: 1.3, roll: 0.5, edge: 24, trees: 0.06 },
];
export const POCKET = Object.fromEntries(POCKETS.map((p) => [p.id, p]));
for (const p of POCKETS) { p.c = Math.cos(p.rot); p.s = Math.sin(p.rot); }
// local coordinates: a along x (east), b along z, both in units of the radii
function local(p, x, z) {
  const dx = x - p.cx, dz = z - p.cz;
  return [(dx * p.c - dz * p.s) / p.rx, (dx * p.s + dz * p.c) / p.rz];
}
// 1 inside the pocket, falling to 0 over `edge` metres outside (a wobbly rim)
export function pocketMask(p, x, z) {
  const [a, b] = local(p, x, z), q = Math.hypot(a, b);
  const r = Math.min(p.rx, p.rz), wob = (n2(x * 0.06 + p.cx, z * 0.06 + p.cz, 2) - 0.5) * 0.24;
  return 1 - sm(1 + wob - 0.12, 1 + wob + p.edge / r, q);
}
// u: 0 at the valley side of the pocket, 1 at its back
function pocketU(p, x, z) { const [a] = local(p, x, z); return (p.side > 0 ? a + 1 : 1 - a) / 2; }
export function pocketAt(x, z, m = 0.5) {
  for (const p of POCKETS) if (pocketMask(p, x, z) > m) return p;
  return null;
}
// the land in the pockets: called by terrain.js routeLand with the valley's
// own height `h` and its floor `floor` (no side hills) at (x, z)
export function land(x, z, h, floor) {
  if (z > -60 || z < -460) return h;
  for (const p of POCKETS) {
    const w = pocketMask(p, x, z);
    if (w <= 0) continue;
    const u = pocketU(p, x, z);
    let H = floor + p.rise * sm(p.r0, p.r1, u) + (n2(x * 0.045 + 3, z * 0.045 - 2, 3) - 0.5) * 2 * p.roll;
    if (p.id === 'meadow') {
      // the crest the lone tree stands on, and the lookout's knoll on the rim
      H += 2.2 * Math.exp(-((x - TREE.x) ** 2 + (z - TREE.z) ** 2) / 260);
      H += 1.6 * Math.exp(-((x - LOOKOUT.x) ** 2 + (z - LOOKOUT.z) ** 2) / 90);
    }
    h = lerp(h, H, w);
  }
  return h;
}
export function walkable(x, z) {
  for (const p of POCKETS) if (pocketMask(p, x, z) > 0.3) return true;
  return false;
}
// forest density inside the pockets (veg.js): `d` the valley's own
export function treeDensity(x, z, d) {
  for (const p of POCKETS) { const w = pocketMask(p, x, z); if (w > 0) d = lerp(d, p.trees, Math.min(1, w * 1.4)); }
  return d;
}

// ---------- places in the pockets (route1.js builds them; veg keeps clear) ----------
export const TREE = { x: 98, z: -160 };             // the meadow's lone tree (with a swing)
export const LOOKOUT = { x: 98, z: -114 };          // the lookout and its coin telescope
export const TEA = { x: -76, z: -262, rot: Math.PI / 2 - 0.25 };   // the tea house (front toward the path, east)
export const SHRINE = { x: -40, z: -265 };
export const REST = { x: 78, z: -292 };
export const ORCHARD = { x0: -116, x1: -64, z0: -206, z1: -176 };
export const FARM_FIELD = { x: -64, z: -100, w: 24, d: 14, rot: 0.12, kind: 'crop' };
export const COTTAGE = { x: -70, z: -412, rot: Math.PI / 2 + 0.15 };
export const TOWER = { x: 66, z: -414 };
// keep the forest and the bushes off these (veg.js free): [x, z, r]
export const CLEAR = [
  [TREE.x, TREE.z, 9], [LOOKOUT.x, LOOKOUT.z, 7], [TEA.x, TEA.z, 13], [SHRINE.x, SHRINE.z, 4], [REST.x, REST.z, 12],
  [COTTAGE.x, COTTAGE.z, 12], [TOWER.x, TOWER.z, 7],
];
// the lookout's view: no trees in a wedge south of it, down to the town
const inView = (x, z) => { const dx = x - LOOKOUT.x, dz = z - LOOKOUT.z, d = Math.hypot(dx, dz); return d > 4 && z < -45 && dz > 0 && Math.abs(Math.atan2(dx, dz) + 0.55) < 0.42; };
export const cleared = (x, z, r = 0) => inView(x, z) || CLEAR.some(([cx, cz, cr]) => (x - cx) ** 2 + (z - cz) ** 2 < (cr + r) ** 2)
  || (x > ORCHARD.x0 - 3 && x < ORCHARD.x1 + 3 && z > ORCHARD.z0 - 3 && z < ORCHARD.z1 + 3);

// ---------- trails: dirt lanes off the road (terrain.js adds them to ROADS) ----------
export const TRAILS = [
  // to the farm gate
  [[4, -80], [-10, -83], [-26, -88], [-40, -94], [-50, -96]],
  // up onto the meadow, past the lone tree, to the lookout
  [[20, -114], [32, -121], [46, -129], [60, -133], [74, -136], [84, -142], [89, -149]],
  [[74, -136], [84, -128], [92, -120], [96, -116]],
  // into the orchard
  [[-29, -209], [-44, -201], [-60, -194], [-72, -191]],
  // to the tea house, over the creek's stepping stones
  [[-27, -226], [-38, -233], [-48, -242], [-56, -251], [-62, -258], [-66, -261]],
  // the rest area
  [[30, -300], [44, -297], [58, -294], [68, -292]],
  // the outskirts: the cottage's lane and the water tower's
  [[-14, -398], [-30, -401], [-46, -405], [-58, -410]],
  [[-4, -410], [14, -409], [32, -409], [50, -411], [58, -413]],
];

// ---------- creeks ----------
// A creek: a line from its spring to the pool it ends in; its water falls
// along it (the bed is cut into the land; terrain.js height). `w` its half
// width, `pool` the pond at its end (radius).
export const CREEKS = [
  // off the west hill above the tea house, a little fall, past the tea house,
  // under the road's footbridge and out to a lily pool in the east nook
  { id: 'tea', w: 1.5, pool: 6.5, ctrl: [[-112, -232], [-102, -236], [-92, -241], [-80, -244], [-66, -244], [-52, -242], [-38, -241],
    [-22, -240], [-8, -238], [4, -240], [16, -245], [26, -250], [33, -252]] },
  // a brook under the little stone bridge near Viridian
  { id: 'brook', w: 1.1, pool: 4.5, ctrl: [[64, -366], [52, -369], [40, -372], [26, -374], [12, -376], [-2, -379], [-14, -381],
    [-28, -383], [-40, -388], [-48, -392]] },
];
for (const c of CREEKS) {
  const pts = c.ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  c.line = curve.getSpacedPoints(Math.ceil(curve.getLength())).map((p) => [p.x, p.z]);
  c.end = c.line[c.line.length - 1];
  const xs = c.ctrl.map((q) => q[0]), zs = c.ctrl.map((q) => q[1]);
  c.box = [Math.min(...xs) - 12, Math.max(...xs) + 12, Math.min(...zs) - 12, Math.max(...zs) + 12];
}
// nearest point of a creek: distance, arc index (1 m steps)
function near(c, x, z) {
  let best = 1e9, bi = 0;
  const L = c.line;
  // coarse then fine
  for (let i = 0; i < L.length; i += 4) { const d = (L[i][0] - x) ** 2 + (L[i][1] - z) ** 2; if (d < best) { best = d; bi = i; } }
  for (let i = Math.max(0, bi - 4); i <= Math.min(L.length - 1, bi + 4); i++) { const d = (L[i][0] - x) ** 2 + (L[i][1] - z) ** 2; if (d < best) { best = d; bi = i; } }
  // between the two segments round bi
  let d = Math.sqrt(best), t = bi;
  for (const j of [bi - 1, bi]) {
    if (j < 0 || j + 1 >= L.length) continue;
    const [ax, az] = L[j], [bx, bz] = L[j + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const dd = Math.hypot(ax + dx * k - x, az + dz * k - z);
    if (dd < d) { d = dd; t = j + k; }
  }
  return { d, t };
}
// the water level profile (from the land without the creek): set by init()
let baseH = null;
export function init(base) { baseH = base; for (const c of CREEKS) c.prof = null; }
function prof(c) {
  if (c.prof) return c.prof;
  const raw = c.line.map(([x, z]) => baseH(x, z));
  const p = raw.map((_, i) => { let s = 0, n = 0; for (let k = -5; k <= 5; k++) { const j = Math.min(raw.length - 1, Math.max(0, i + k)); s += Math.min(raw[j], raw[i] + 0.4); n++; } return s / n - 0.9; });
  for (let i = 1; i < p.length; i++) p[i] = Math.min(p[i], p[i - 1] - 0.012);
  c.prof = p;
  c.poolY = p[p.length - 1];
  return p;
}
const profAt = (p, t) => { const i = Math.max(0, Math.min(p.length - 2, Math.floor(t))), k = Math.min(1, Math.max(0, t - i)); return p[i] + (p[i + 1] - p[i]) * k; };
// the creek (or its pool) at (x, z): {d: distance from the water's middle,
// y: the water level, c: the creek} or null when none is within 7 m
export function creekAt(x, z) {
  if (z > -220 || z < -405) return null;
  let best = null;
  for (const c of CREEKS) {
    const [ex, ez] = c.end;
    const [bx0, bx1, bz0, bz1] = c.box;
    if (x < bx0 || x > bx1 || z < bz0 || z > bz1) continue;
    const P = prof(c);
    const pd = Math.hypot(x - ex, z - ez) - (c.pool - c.w);
    const q = near(c, x, z);
    let d = q.d, y = profAt(P, q.t);
    if (pd < d) { d = pd; y = c.poolY; }
    if (d < 7 && (!best || d < best.d)) best = { d, y, c, t: q.t };
  }
  return best;
}
// the bed cut into the land (terrain.js height, after the roads)
export function carve(x, z, h) {
  const q = creekAt(x, z);
  if (!q) return h;
  const w = q.c.w, bed = q.y - 0.55 - (1 - sm(0, w, q.d)) * 0.25;
  return Math.min(h, lerp(bed, Math.max(h, q.y + 0.4), sm(w + 0.3, w + 3.2, q.d)));
}
// the water level here (terrain.js waterLevel), or null
export function creekLevel(x, z) {
  const q = creekAt(x, z);
  return q && q.d < q.c.w + 1.2 ? q.y : null;
}
// ribbon meshes for the creeks and pools (terrain.js buildWater gives them
// the flowing fresh-water material: native fresh1_*)
export function creekGeometries() {
  const out = [];
  for (const c of CREEKS) {
    const P = prof(c), L = c.line, pos = [], uv = [], idx = [];
    const HW = c.w + 0.7;
    for (let i = 0; i < L.length; i++) {
      const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      for (const s of [-1, 1]) { pos.push(L[i][0] + nx * HW * s, P[i] + 0.02, L[i][1] + nz * HW * s); uv.push((s + 1) / 2, i); }
      if (i > 0) { const p = (i - 1) * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    out.push({ g, flow: 1 });
    // the pool at its end: still water
    const pg = new THREE.CircleGeometry(c.pool + 0.8, 32).rotateX(-Math.PI / 2);
    pg.translate(c.end[0], c.poolY + 0.03, c.end[1]);
    out.push({ g: pg, flow: 0 });
  }
  return out;
}

// ---------- ground colour (terrain.js groundColor) ----------
const MEADOW_HUES = [new THREE.Color('#f2c94a'), new THREE.Color('#e86a8a'), new THREE.Color('#b59cf0'), new THREE.Color('#f6f2e8'), new THREE.Color('#ef7a3c')];
const CLOVER = new THREE.Color('#8fd25c'), PATCH = new THREE.Color();
// the meadow's drifts read as colour from afar (the flowers themselves fade
// out past ~55 m); the orchard and the farm a fresher green
export function tint(x, z, out) {
  if (z > -70 || z < -440) return out;
  const m = pocketMask(POCKET.meadow, x, z);
  if (m > 0) {
    const k = drift(x, z);
    if (k.s >= 0) out.lerp(PATCH.copy(MEADOW_HUES[k.s]), m * k.w * 0.32);
    out.lerp(CLOVER, m * 0.12);
  }
  const o = pocketMask(POCKET.orchard, x, z), f = pocketMask(POCKET.farm, x, z);
  if (o + f > 0) out.lerp(CLOVER, (o + f) * 0.1);
  return out;
}
// The meadow's flower drifts: species s (0 yellow, 1 pink, 2 lavender, 3
// white, 4 poppy) and how strong (w 0..1) at (x, z): broad bands of one kind
// at a time, as drifts grow, with a little mixing at their edges.
export function drift(x, z) {
  const a = n2(x * 0.035 + 12, z * 0.035 - 4, 3), b = n2(x * 0.05 - 7, z * 0.05 + 21, 2);
  const s = Math.floor(a * 9 + b * 3) % 5;
  const w = sm(0.38, 0.62, n2(x * 0.08 + 31, z * 0.08 + 9, 2));
  return { s: w > 0.02 ? s : -1, w };
}
