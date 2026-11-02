// Viridian City, "The Eternally Green Paradise": the layout and the land.
// Pure numbers (no three.js), so terrain.js can use it while it loads.
//
// The city fills a mountain bowl north of Route 1's gate. The road climbs
// through a cutting in the bowl's southern rim (where the earthquake brought
// the slope down: design/research/officer_jenny.md), crests, and the valley
// opens: a round crater lake on the west, the Old Town in the middle (its
// streets in the original map's order: the POKéMON CENTER centre-south facing
// a round plaza, the POKé MART across Mart Street to the east, the Trainer
// School and the nickname house to the north-west on Old Street, which runs
// north to Route 2 and the forest; the GYM on a rise in the north-east),
// downtown's towers to the east, terraces of houses up the slopes, the
// mountains all round.
//
// Walkable: the cutting road, the streets, the plaza, the squares and the
// lakeside promenade with its pier (walkF < 0). Everything else is seen, not
// walked, and every edge of the walkable streets is a real thing: a building
// front, a hedge, a railing, a wall or the water (viridian_city.js lines
// them); the cutting's sides are rock (terrain.js traces them as cliffs).
//
// x east, z south (north is -z), metres. The city's land replaces Route 1's
// mainland north of the gate (terrain.js base: land()); everything south of
// the gate is untouched.
import { PADS } from './viridian_spots.js';
export { PADS, STORY } from './viridian_spots.js';

// ---------- small noise (its own: terrain.js imports this module) ----------
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x, y, oct = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- the big shapes ----------
export const GATE_Z = -438;          // Route 1's gate (terrain.js ROUTE1.gateZ)
export const CITY_Z = -436;          // north of this the city's land and rules apply
export const BOWL = { x: 20, z: -745, rx: 340, rz: 262 };
export const LAKE = { x: -245, z: -730, r: 112, y: 13.0, bed: 11 };
// the crater lake is the quay's round basin joined to a long oval running
// west under the rim's mountains (worker 36): coves and points on the far
// shores, a beach in the north-west; the city's side stays the round quay
export const LAKE2 = { x: -300, z: -738, rx: 132, rz: 168 };
// the water's disc (big enough for both; the land hides what lies outside)
export const LAKE_DISC = { x: -282, z: -738, r: 192 };
// the beach on the north-west shore
export const BEACH = { x: -352, z: -880, r: 62 };
// signed distance to the lake's shore (< 0 on the water), metres-ish
export function lakeSD(x, z) {
  const c = Math.hypot(x - LAKE.x, z - LAKE.z) - LAKE.r;
  const e = (Math.hypot((x - LAKE2.x) / LAKE2.rx, (z - LAKE2.z) / LAKE2.rz) - 1) * Math.min(LAKE2.rx, LAKE2.rz);
  const k = 20, hh = Math.max(k - Math.abs(c - e), 0) / k;
  let d = Math.min(c, e) - hh * hh * k * 0.25;
  // coves and wooded points on the far shores (none on the quay's side)
  d += (fbm2(x * 0.021 + 5.3, z * 0.021 - 3.1, 3) - 0.5) * 36 * smooth(-185, -250, x);
  return d;
}
export const bowlE = (x, z) => Math.hypot((x - BOWL.x) / BOWL.rx, (z - BOWL.z) / BOWL.rz);
// the walk and terrain grids reach this far north (terrain.js, the bakes)
export const NORTH_Z = -940;

// ---------- the walkable streets ----------
// polylines [[x, z, y?]...] with a half width (kerb to kerb plus pavements);
// kind: 'road' (asphalt with pavements), 'old' (cobbles), 'cut' (the cutting's
// cobbled road), 'prom' (the promenade's paving), 'lane' (a narrow lane)
// y: the road's level at each point (the cutting); else the land's own
export const CUT = { pts: [[-2.3, -434, 22.05], [-1.5, -452, 23.1], [-0.6, -470, 24.6], [0.8, -484, 26.2], [1.6, -497, 27.0], [3.4, -512, 26.6], [5.0, -530, 24.9], [6.0, -547, 23.2], [6.2, -562, 21.9], [6.0, -576, 20.9], [6.0, -588, 20.4]], hw: 5.2, kind: 'cut' };
export const STREETS = [
  CUT,
  // Route 1 Avenue: the South Square to the Center's plaza
  { id: 'r1ave', pts: [[6, -588], [8, -606], [10, -616]], hw: 8, kind: 'road' },
  // Evergreen Avenue: the main avenue, east from the plaza between the towers
  { id: 'evergreen', pts: [[24, -624], [60, -624], [110, -625], [150, -624], [178, -624]], hw: 10, kind: 'road' },
  // Lakeside Road: west from the plaza down to the promenade
  { id: 'lakeside', pts: [[-6, -627], [-30, -629], [-60, -632], [-95, -638], [-128, -646], [-150, -654]], hw: 6.5, kind: 'road' },
  // Mart Street: north from the avenue past the MART up to the GYM's square
  { id: 'mart', pts: [[48, -620], [48, -660], [48, -700], [48, -740], [50, -764]], hw: 6, kind: 'road' },
  // the short climb from Mart Street's top into the GYM's square
  { id: 'gymrise', pts: [[50, -764], [62, -769]], hw: 6, kind: 'road' },
  // Old Street: the old man's street, north from Lakeside Road to Route 2's gate
  { id: 'old', pts: [[-22, -628], [-22, -680], [-22, -730], [-22, -790], [-22, -840], [-22, -880]], hw: 6.2, kind: 'old' },
  // School Lane: Old Street across to Mart Street behind the Center
  { id: 'school', pts: [[-22, -727], [0, -727], [26, -728], [48, -729]], hw: 4.6, kind: 'lane' },
  // the promenade along the lake's east shore, to the Route 22 gate
  { id: 'prom', pts: [[-150, -654], [-141, -670], [-132, -690], [-127, -712], [-126, -735], [-128, -758], [-135, -780], [-146, -800], [-160, -815]], hw: 5.5, kind: 'prom' },
];
// round places: the South Square, the Center's plaza, the GYM's square
export const ROUNDS = [
  { id: 'south', x: 6, z: -590, r: 15, kind: 'square' },
  { id: 'plaza', x: 10, z: -624, r: 21, kind: 'plaza' },
  { id: 'gymsq', x: 75, z: -770, r: 12.5, kind: 'square' },
];
// walkable rectangles: the Center's hedge-lined approach, the pier
export const RECTS = [
  { id: 'approach', x0: 4, x1: 16, z0: -653.5, z1: -642 },
  { id: 'pier', x0: -164, x1: -126, z0: -737.4, z1: -732.6, deck: true },
  // forecourts from the pavement to the doors
  { id: 'mart', x0: 52, x1: 59.3, z0: -694, z1: -686 },
  { id: 'school', x0: -36.2, x1: -27, z0: -709, z1: -701 },
  { id: 'nickname', x0: -37.7, x1: -27, z0: -755, z1: -749 },
  { id: 'police', x0: -11.3, x1: -7, z0: -590.5, z1: -585.5 },
];
export const PIER = { x0: -164, x1: -128, z: -735, w: 4.8, y: 14.55 };
// the overlook at the crest: a terrace on the road's west side, at the road's
// level, a parapet round it (the lining's walls), the whole valley below
export const OVERLOOK = { id: 'overlook', x0: -21, x1: -2.2, z0: -522, z1: -503, y: 26.75 };
RECTS.push(OVERLOOK);
const rectDist = (R, x, z) => Math.hypot(Math.max(0, R.x0 - x, x - R.x1), Math.max(0, R.z0 - z, z - R.z1));

// distance from (x, z) to a polyline; also its param and nearest segment
function polyNear(pts, x, z) {
  let best = 1e9, bi = 0, bt = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1), qx = ax + dx * t - x, qz = az + dz * t - z, d = qx * qx + qz * qz;
    if (d < best) { best = d; bi = i; bt = t; }
  }
  return { d: Math.sqrt(best), i: bi, t: bt };
}
export const streetNear = polyNear;
// the cutting road's level at (x, z) (the nearest point of its centre line)
export function cutY(x, z) {
  const q = polyNear(CUT.pts, x, z), a = CUT.pts[q.i], b = CUT.pts[q.i + 1];
  return { y: a[2] + (b[2] - a[2]) * q.t, d: q.d };
}

// ---------- the land ----------
const inRect = (P, x, z, m = 0) => {
  const c = Math.cos(P.rot || 0), s = Math.sin(P.rot || 0), dx = x - P.x, dz = z - P.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;   // (into the pad's own frame)
  return Math.max(Math.abs(lx) - P.w / 2, Math.abs(lz) - P.d / 2) - m;
};
export const padDist = (P, x, z) => {
  const c = Math.cos(P.rot || 0), s = Math.sin(P.rot || 0), dx = x - P.x, dz = z - P.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const ex = Math.max(0, Math.abs(lx) - P.w / 2), ez = Math.max(0, Math.abs(lz) - P.d / 2);
  return Math.hypot(ex, ez);
};
// the valley floor where the town stands (before the pads): level enough to
// build on, rising to the GYM's rise in the north-east and toward the forest
// in the north, falling to the lake on the west
export function floorY(x, z) {
  let h = 20.0;
  h += 6.0 * smooth(18, 78, x) * smooth(-690, -790, z);
  h -= 5.4 * smooth(-60, -136, x);
  h += 4.4 * smooth(-800, -890, z) * (1 - smooth(10, 60, x));
  h -= 0.6 * smooth(-600, -560, z) * smooth(30, 120, x);
  h += (vnoise(x * 0.03 + 4, z * 0.03 - 9) - 0.5) * 0.7;
  return h;
}
// the bowl's sides: terraces of houses up the slopes, then the mountains
function slopes(x, z) {
  const e = bowlE(x, z);
  if (e < 0.74) return 0;
  // the bowl's sides: an even rise (the terraces are built on it: their
  // platforms and retaining walls, viridian_city.js terraces())
  let h = smooth(0.74, 1.04, e) * 34;
  // Route 1's pass: the rim is lower where the road comes over it
  h *= 1 - 0.55 * (1 - smooth(50, 170, Math.abs(x - 5))) * smooth(-600, -500, z);
  h += (fbm2(x * 0.02 + 2, z * 0.02 - 5, 3) - 0.5) * 6 * smooth(0.8, 1.0, e);
  // the mountains: rounded, then craggy summits
  // (slopes kept under ~35 degrees: green and wooded, not bare earth; the
  // ridge line inside the terrain's edge)
  const m = smooth(0.95, 1.6, e) * (1 - 0.5 * smooth(1.65, 2.0, e));
  if (m > 0) {
    const n = fbm2(x * 0.0065 + 11, z * 0.0065 + 3, 5), r = Math.abs(fbm2(x * 0.018 - 7, z * 0.018 + 1, 3) - 0.5) * 2;
    // ridges and spurs (a ridged noise), and a second, higher range behind
    const rid = 1 - Math.abs(fbm2(x * 0.009 + 4, z * 0.009 - 6, 4) * 2 - 1);
    // (worker 36: lower and gentler near the valley, so the walls read as
    // wooded mountainsides, not a quarry; the painted ranges stand behind)
    h += (m * (35 + n * 120 + rid * rid * 70 + (1 - r) * 20 * m) + smooth(1.35, 1.8, e) * (60 + rid * 90)) * lerp(0.62, 0.85, smooth(1.2, 1.7, e));
  }
  return h;
}
// the cutting: the road's level, the land rising steeply either side of it
function cutting(x, z, h) {
  if (z > -432 || z < -600) return h;
  const c = cutY(x, z);
  if (c.d > 40) return h;
  // south of -470 the old land: the road eases onto it; north of it the rim,
  // cut through with steep sides (the cliffs come from the walk edge)
  const steep = smooth(-466, -480, z);
  const w0 = CUT.hw + 0.4, w1 = lerp(CUT.hw + 7, CUT.hw + 1.6, steep);
  return lerp(h, lerp(c.y, h, smooth(w0, w1, c.d)), smooth(-447, -453, z));
}
// the crater lake: a round basin with a stone quay on the city side
export function lakeDepth(x, z) {
  return lakeSD(x, z) < 0 ? 1 : 0;
}
function lake(x, z, h) {
  if (Math.hypot(x - LAKE_DISC.x, z - LAKE_DISC.z) > LAKE_DISC.r + 90) return h;
  const d = lakeSD(x, z);
  if (d > 80) return h;
  // (the quay's side: the old round bank, its little wobble)
  const q = (vnoise(Math.atan2(z - LAKE.z, x - LAKE.x) * 3 + 9, 3) - 0.5) * 5 * (1 - smooth(-185, -230, x));
  const sd = d - q;
  if (sd < 0) return Math.min(h, LAKE.y - 1.2 - LAKE.bed * smooth(-3, -60, sd) - 6 * smooth(-40, -120, sd));
  // the shore: a steep bank up out of the water on the city side (the quay is
  // built over it); on the far side the crater's wooded walls rise from a
  // narrow shelf, and in the north-west a beach shelves gently
  const bw = 6 + 44 * smooth(0.62, 0.95, bowlE(x, z));
  const lip = LAKE.y - 0.45 + Math.min(sd, 3) * 0.27;   // (out of the water within a couple of metres)
  let o = lerp(lip, Math.max(h, lip), smooth(3, bw, sd));
  const bk = 1 - smooth(BEACH.r * 0.6, BEACH.r, Math.hypot(x - BEACH.x, z - BEACH.z));
  if (bk > 0) o = lerp(o, Math.min(Math.max(h, LAKE.y + 0.5), LAKE.y - 0.25 + sd * 0.09 + Math.max(0, sd - 22) * 0.5), bk);
  return Math.min(h, o);
}
// is (x, z) on the beach's sand (terrain.js paints it)
export function beachSand(x, z) {
  const d = lakeSD(x, z), bk = 1 - smooth(BEACH.r * 0.5, BEACH.r * 0.95, Math.hypot(x - BEACH.x, z - BEACH.z));
  return bk * (1 - smooth(16, 24, d)) * smooth(-6, -1, d);
}
// pads: level at their own height, the land easing back to its own
function pads(x, z, h) {
  for (const P of Object.values(PADS)) {
    const d = padDist(P, x, z);
    if (d < 9) h = lerp(P.y, h, smooth(0.5, 9, d));
  }
  return h;
}
// the streets: the land under them smoothed toward the floor (no bumps)
function streetsLevel(x, z, h) {
  return h;
}
// the city's land at (x, z), given Route 1's land there (legacy) for the blend
export function land(x, z, legacy) {
  if (z > CITY_Z) return legacy;
  const wv = smooth(-466, -520, z);
  let h = legacy;
  if (wv > 0) {
    const city = floorY(x, z) + slopes(x, z);
    // (the rim south of the bowl rises from Route 1's mainland)
    h = lerp(legacy, Math.max(city, wv < 1 ? legacy : city), wv);
  }
  // the ridge the road cuts through, just north of the gate's woods
  // (a plateau from -462 to -490 the road cuts deep into, falling away north of the crest)
  // (nothing changes south of -447: Route 1's edges and plants were seeded on the land as it was)
  // (worker 36: the ridge ends before the crest, which stands out over the
  // valley as a promontory: the land falls away either side of the road,
  // with the overlook's terrace on its west side; the view from the top is open)
  if (z < -447 && z > -540) h += 15 * smooth(-448, -466, z) * smooth(-495, -483, z) * (0.8 + 0.4 * vnoise(x * 0.04 + 3, 7));
  if (z < -486 && z > -620) {
    const c = cutY(x, z), w = smooth(-486, -497, z) * (1 - smooth(-585, -615, z)) * (1 - smooth(70, 130, c.d));
    if (w > 0) h = lerp(h, Math.min(h, Math.max(floorY(x, z) - 0.6, c.y - 0.5 - 0.3 * Math.max(0, c.d - CUT.hw - 0.6))), w);
    const od = rectDist(OVERLOOK, x, z);
    if (od < 4) h = lerp(OVERLOOK.y, h, smooth(0.4, 4, od));
  }
  h = lake(x, z, h);
  h = pads(x, z, h);
  h = streetsLevel(x, z, h);
  h = cutting(x, z, h);
  return h;
}
export function isLake(x, z, h) { return lakeSD(x, z) < 8 && h < LAKE.y - 0.05; }

// ---------- where you may walk ----------
// signed: < 0 walkable. Only north of the gate (the gate's opening joins it
// to Route 1). Smooth corners where streets meet.
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export function walkF(x, z) {
  if (z > GATE_Z + 3) return 50;
  if (x < -200 || x > 200 || z < NORTH_Z + 20) return 50;
  let f = 50;
  for (const S of STREETS) {
    const q = polyNear(S.pts, x, z);
    f = smin(f, q.d - S.hw, 2.5);
  }
  for (const R of ROUNDS) f = smin(f, Math.hypot(x - R.x, z - R.z) - R.r, 3);
  for (const R of RECTS) { const dx = Math.max(R.x0 - x, x - R.x1), dz = Math.max(R.z0 - z, z - R.z1); f = Math.min(f, Math.max(dx, dz)); }
  return f;
}
export const walkable = (x, z) => walkF(x, z) < 0;
// is (x, z) in the city's part of the world (its rules apply: no cliffs but
// the cutting's, its own lining, its own plants)
export const inCityZone = (x, z) => z < CITY_Z;
// the cutting's sides that are bare rock (terrain.js draws them as cliffs)
export const cutRock = (x, z) => z < -478 && z > -493 && cutY(x, z).d < CUT.hw + 6;
// ---------- the terraces (worker 36) ----------
// Streets of houses up the bowl's sides, each a level platform cut into the
// slope along a contour (rings of bowlE): its uphill edge flush with the hill,
// its downhill edge a stone retaining wall; a lane along the wall's top, the
// houses behind it, trees between. viridian_city.js builds them; the grass
// and the plants keep off them.
export const TERR = { rings: [0.795, 0.86, 0.925, 0.99, 1.055], W: 11 };
export function terraceSkip(x, z) {
  if (lakeSD(x, z) < 24) return true;
  if (z > -590 && Math.abs(x - 5) < 120) return true;   // (the pass and the view from the crest)
  if (z < -868 && Math.abs(x + 20) < 165) return true;  // (the forest past Route 2's gate)
  return false;
}
// metres per unit of bowlE, along the outward normal at (x, z)
export function bowlScale(x, z) {
  const g = Math.hypot((x - BOWL.x) / (BOWL.rx * BOWL.rx), (z - BOWL.z) / (BOWL.rz * BOWL.rz)) / Math.max(bowlE(x, z), 1e-3);
  return 1 / Math.max(g, 1e-6);
}
// which platform (x, z) is on: { k, d } (d metres downhill from its uphill edge), or null
export function terraceAt(x, z, m = 0) {
  const e = bowlE(x, z);
  if (e < TERR.rings[0] - 0.06 || e > TERR.rings[TERR.rings.length - 1] + 0.01) return null;
  const sc = bowlScale(x, z);
  for (let k = 0; k < TERR.rings.length; k++) {
    const d = (TERR.rings[k] - e) * sc;
    if (d > -m - 0.4 && d < TERR.W + m) return terraceSkip(x, z) ? null : { k, d };
  }
  return null;
}
// no grass on the paving, the pads, the lake's quay, the terraces
export function grassOff(x, z) {
  if (walkF(x, z) < 0.5) return true;
  if (terraceAt(x, z, 0.6)) return true;
  for (const P of Object.values(PADS)) if (padDist(P, x, z) < 0.8) return true;
  return false;
}
