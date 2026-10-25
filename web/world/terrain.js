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

// ---------- the peninsula: where the land meets the sea ----------
// Pallet Town sits at the southern tip of a long hilly peninsula (the old
// Kanto magazine map): the land wraps round the town in two headlands, west
// and east, so the town lies in a bowl at the head of a sheltered bay that
// opens to the open sea in the south (Cinnabar beyond the horizon). The
// harbour is in the bay; the lighthouse islet stands near its mouth. North
// of town Route 1 climbs the peninsula's spine to the mainland, which widens
// out past z -400.
// COAST is the waterline (x, z), a closed loop round the land, smoothed into
// a curve; shoreSD(x, z) is the signed distance to it in metres (positive on
// land, negative at sea), from a 2 m raster made once.
export const COAST = [
  // the town beach at the head of the bay, west to east: it reaches out to
  // the ends of the harbour's piers (the basin between them is cut into the
  // land: see HARBOUR and base())
  [-62, 111.5], [-30, 112], [-5, 112], [20, 110.5], [45, 107], [72, 102],
  // the bay's east side, rocky, down to the east headland
  [100, 99], [115, 110], [125, 132], [129, 158], [126, 182], [119, 199],
  [127, 212], [145, 217], [168, 207],
  // the outer east coast, north to the mainland
  [190, 183], [205, 150], [213, 110], [215, 65], [207, 25], [213, -25], [228, -75], [224, -128], [210, -172], [219, -212],
  [236, -258], [250, -305], [270, -348], [305, -382], [370, -405], [470, -420], [600, -428], [760, -432],
  [760, -1100], [-760, -1100],
  // the mainland's west shore and the outer west coast, back south
  [-760, -445], [-600, -438], [-480, -428], [-380, -412], [-318, -388], [-282, -352], [-262, -306], [-250, -258], [-236, -212],
  [-222, -168], [-228, -124], [-238, -78], [-226, -28], [-214, 22], [-215, 72], [-207, 118], [-190, 160], [-165, 192], [-140, 210],
  // the west headland's tip and the bay's west side, back to the beach
  [-118, 214], [-103, 205], [-100, 188], [-106, 166], [-113, 140], [-109, 121], [-96, 112.5], [-80, 111],
];
// the bay's mouth and the lighthouse islet out in it
export const ISLET = { x: -66, z: 190 };
const SD_RES = 2, SD_X0 = -800, SD_Z0 = -1140, SD_NX = 800, SD_NZ = 720;   // x -800..800, z -1140..300
const SD = (() => {
  // the loop as a dense smooth curve
  const pts = COAST.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
  const poly = curve.getSpacedPoints(Math.ceil(curve.getLength() / 2)).map((p) => [p.x, p.z]);
  // inside / outside per cell (scanlines), then the distance to the other side
  const N = SD_NX * SD_NZ, inside = new Uint8Array(N);
  for (let j = 0; j < SD_NZ; j++) {
    const z = SD_Z0 + (j + 0.5) * SD_RES, xs = [];
    for (let k = 0; k < poly.length; k++) {
      const [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % poly.length];
      if ((az <= z) !== (bz <= z)) xs.push(ax + (z - az) / (bz - az) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - SD_X0) / SD_RES - 0.5)), i1 = Math.min(SD_NX - 1, Math.floor((xs[k + 1] - SD_X0) / SD_RES - 0.5));
      for (let i = i0; i <= i1; i++) inside[j * SD_NX + i] = 1;
    }
  }
  // squared Euclidean distance transform (Felzenszwalb & Huttenlocher)
  const edt = (f, n, m) => {
    const d = new Float64Array(Math.max(n, m)), v = new Int32Array(Math.max(n, m)), zz = new Float64Array(Math.max(n, m) + 1);
    const pass = (get, set, len) => {
      let k = 0; v[0] = 0; zz[0] = -Infinity; zz[1] = Infinity;
      for (let q = 1; q < len; q++) {
        let s;
        do { const p = v[k]; s = ((get(q) + q * q) - (get(p) + p * p)) / (2 * q - 2 * p); if (s <= zz[k]) k--; else break; } while (k >= 0);
        k++; v[k] = q; zz[k] = s; zz[k + 1] = Infinity;
      }
      k = 0;
      for (let q = 0; q < len; q++) { while (zz[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + get(v[k]); }
      for (let q = 0; q < len; q++) set(q, d[q]);
    };
    for (let i = 0; i < n; i++) pass((q) => f[q * n + i], (q, val) => { f[q * n + i] = val; }, m);
    for (let j = 0; j < m; j++) pass((q) => f[j * n + q], (q, val) => { f[j * n + q] = val; }, n);
  };
  const BIG = 1e12, toSea = new Float64Array(N), toLand = new Float64Array(N);
  for (let k = 0; k < N; k++) { toSea[k] = inside[k] ? BIG : 0; toLand[k] = inside[k] ? 0 : BIG; }
  edt(toSea, SD_NX, SD_NZ); edt(toLand, SD_NX, SD_NZ);
  const sd = new Float32Array(N);
  for (let k = 0; k < N; k++) sd[k] = inside[k] ? (Math.sqrt(toSea[k]) - 0.5) * SD_RES : -(Math.sqrt(toLand[k]) - 0.5) * SD_RES;
  return sd;
})();
// signed distance to the waterline: + on land, - at sea (metres), with a
// little wobble so the shore is never a perfect curve
export function shoreSD(x, z) {
  const fx = (x - SD_X0) / SD_RES - 0.5, fz = (z - SD_Z0) / SD_RES - 0.5;
  if (fx < 0 || fz < 0 || fx >= SD_NX - 1 || fz >= SD_NZ - 1) return -400;
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * SD_NX + i;
  const a = SD[k], b = SD[k + 1], c = SD[k + SD_NX], d = SD[k + SD_NX + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz + (fbm(x * 0.045 + 13, z * 0.045 + 2, 3) - 0.5) * 5;
}
// 0 on a sandy shore, 1 where the land ends in cliffs: the town beach at the
// head of the bay is sand, the bay's sides and the headlands rocky, the outer
// coasts mostly cliffs with a few pocket beaches
export function cliffiness(x, z) {
  const bay = 1 - smooth(62, 96, Math.hypot((x + 8) * 0.85, (z - 74) * 1.6));
  let c = smooth(0.38, 0.55, fbm(x * 0.011 + 3.3, z * 0.011 + 9.1, 3));
  // the bay's sides and the headlands rocky, a pocket beach here and there
  const pocket = smooth(0.62, 0.7, fbm(x * 0.03 + 1.7, z * 0.03 + 4.4, 2));
  c = Math.max(c, smooth(78, 112, Math.abs(x + 3)) * smooth(70, 100, z) * (1 - pocket), smooth(150, 195, z) * 0.9, smooth(150, 205, Math.abs(x)) * smooth(0, 60, -z) * 0.6);
  return c * (1 - bay);
}
// The old beach as a line (z of the waterline at x), for the bay head only:
// the shore straight south of x, searched from the town out.
export function coastZ(x) {
  for (let z = 40; z < 140; z += 1) if (shoreSD(x, z) < 0) return z;
  return 140;
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
  { x0: 105.5, x1: 119.5, z: 91, w: 3.0, rails: true, kind: 'lane' },
];
export const SQUARE = { x: -3, z: -2, r: 8.5 };
// The harbour: a square U of timber piers in the bay, open to the sea. A quay
// along the waterline (the cross pier, where the main lane comes down onto
// it), and two long piers out from its ends with a wider head on each; boats
// moored in the basin between them. Deck heights are SEA_Y + y.
export const HARBOUR = {
  quay: { x0: -39.5, x1: -4.5, z0: 69.4, z1: 75.0 },
  arms: [{ x: -37.7, z0: 75.0, z1: 144 }, { x: -6.3, z0: 75.0, z1: 144 }],   // (out past the land at z 111.6, over open water)
  w: 3.6, head: { w: 7.0, d: 5.0 }, y: 1.02,
};
// The land comes out round the harbour: an apron of ground at quay level
// round the piers (its sea front a stone quay wall at z1), and the basin cut
// into it between the piers, open to the sea (its edges under the decks, so
// the mesh's slope down into it is hidden: the decks and their piles are the
// basin's sides, as at any timber quay)
HARBOUR.apron = { x0: -47, x1: -1, z0: 64, z1: 111.6, fade: 7 };
HARBOUR.basin = { x0: HARBOUR.arms[0].x + 0.2, x1: HARBOUR.arms[1].x - 0.2, z0: HARBOUR.quay.z0 + 3.6, floor: -3.4 };
HARBOUR.apronY = SEA_Y + HARBOUR.y - 0.07;
export const BOATHOUSE = { x: -59, z: 101 };

// ---------- roads as control points; smoothed into dense polylines ----------
// Each is a winding dirt lane; the ends of house lanes run to the house gates.
const ROAD_CTRL = [
  // Route 1: from the forest gate at the mainland end, down the valley,
  // weaving round the ledges' ends, and through the cutting in the rim
  [[-2, -446], [-5, -425], [-10, -400], [-16, -380], [-19, -363], [-12, -347], [6, -337], [26, -328], [29, -318], [20, -306],
    [3, -298], [-10, -291], [-8, -280], [6, -270], [18, -263], [21, -255], [12, -243], [-10, -233], [-30, -224], [-29, -212],
    [-10, -201], [5, -191], [2, -178], [-17, -164], [-28, -151], [-21, -139], [3, -128], [20, -117], [22, -108], [15, -96],
    [5, -83], [1, -72], [2, -64], [-1, -56], [-4, -46], [-2, -36], [-5, -26], [-6, -14], [-3, -2]],
  // the main lane south from the square, across the sand to the harbour quay
  [[-3, -2], [-6, 10], [-5, 24], [-8, 38], [-7, 49], [-9, 56], [-13, 62.5], [-19, 68.6]],
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
  // the stream path: from the plaza before the lab gate, south and east round
  // the foot of Oak's hill between the hill and the stream, and up onto the
  // east headland (a footbridge over the stream's last bend joins the beach to it)
  [[15.5, 24.5], [19.5, 38], [26, 51], [40, 57.5], [60, 59.5], [80, 61], [96, 64], [110, 70], [119, 78.5], [124, 85.5], [131, 90.5], [134.5, 93.5]],
  // and the footbridge over the stream's last bend: the beach to that path
  [[BRIDGES[2].x0, 91], [101, 95], [97, 98]],
  [[BRIDGES[2].x1, 91], [123.5, 87.5]],
  // along the back of the beach to Marina's
  [[-7.6, 50], [-14, 55.5], [-22, 57.6], [-28, 57.4], ...approach(H.marina)],
  // woodland trails (TRAILS, narrower): from the plaza north along the stream
  // to the lane to Blue's; then, forking off that lane where it turns to
  // Blue's house, up through the woods behind Oak's hill and round back
  // toward the sea to PALLET HOUSE on its hill above the bay; and from there
  // on along the east headland to a viewpoint over the sea
  [[15.5, 8.5], [17, -1], [19, -9.5]],
  [[24, -13.5], [36, -17.8], [50, -21.8], [66, -23.6], [82, -27], [96, -37], [111, -40], [125, -31], [136, -13], [143, 10], [147, 35], [148, 60], [146.5, 80.5]],
  [[147, 114.5], [150, 130], [152, 150], [153, 166], [155, 181], [156, 186]],
];
export const TRAILS = new Set([ROAD_CTRL.length - 3, ROAD_CTRL.length - 2, ROAD_CTRL.length - 1]);
// the trails' ends: a clearing in the woods behind the lab, a viewpoint on the east headland
export const CLEARINGS = [{ x: 156.5, z: 188, r: 7, name: 'viewpoint' }];
// PALLET HOUSE (Delia's restaurant, with rooms upstairs), on a level hilltop
// above the bay's east side: the trails and the stream path end there.
// door: where an interior will join (a portal stub, locked for now)
export const PALLET_HOUSE = { x: 144, z: 98, r: 17, y: 13.6, rot: -0.6 };
// its named spots, in the house's own frame (x right, z out of the front door,
// toward the bay; terrain.js toWorld turns them): town.js builds at them and
// tools/native/bake_places.mjs writes them for the native town life
// ([lx, lz] or [lx, lz, face]: face = the way a person stands there, radians
// in the house's frame, 0 = facing +z)
PALLET_HOUSE.spots = {
  front_door: [0, 3.5, Math.PI], kitchen_door: [-3.6, -7.5, 0], kitchen_window: [2.6, -7.4, 0],
  tables: [[-5, 5.2], [-1.2, 7.4], [3.2, 5.4], [6.0, 7.8]],
  shed: [-9.6, -10.6, Math.PI / 2], water_butt: [-7.4, -8.4, 0],
  herb_bed: [-9.7, -8.3, 0], veg_patch: [-3.5, -14.3, 0], cottage_garden: [12.2, -1.6, 0],
  view_bench: [5.5, 12.3], cliff_fence: [-13.6, 7.0, -1.0], nook: [-2.5, 3.3, 0],
  cottage_door: [9.7, -3.9, Math.PI - 0.4],
};
const ROAD_W = 1.75;

function dense(ctrl, step = 1) {
  const pts = ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z));
  if (pts.length === 2) pts.splice(1, 0, pts[0].clone().lerp(pts[1], 0.5));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((p) => [p.x, p.z]);
}
export const ROADS = ROAD_CTRL.map((c) => dense(c));
export const STREAM = dense([[17, -62], [15, -48], [12.6, -33], [10.4, -19], [9.5, -7.5], [9.2, 4], [8.2, 16], [7.4, 28], [8.8, 40], [13, 52.5], [24, 61.5], [42, 66.5], [62, 68], [82, 69.5], [97, 75], [107.5, 84], [111.5, 94], [113, 104], [114, 113], [115, 124]]);
// (it runs south past the town, under the two bridges, then bends east round
// the foot of Oak's hill, with a path between it and the hill, and out to sea
// at the bay's east side; a footbridge over its last bend joins the beach
// to the path on the east headland)

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
  // hills beyond the town, except toward the sea; to the west and east they
  // run on south as the two headlands that wrap round the bay
  const r = Math.max(Math.abs(x + 8) / 88, z < 0 ? Math.abs(z) / 64 : 0);
  const hill = smooth(1.0, 2.0, r) * (6 + fbm(x * 0.02, z * 0.02, 4) * 22);
  const head = smooth(96, 128, Math.abs(x - 6));
  h += hill * Math.max(1 - smooth(28, 50, z), head * (0.75 + 0.35 * smooth(60, 150, z)));
  // north of the rim the land is Route 1's valley and the peninsula's spine
  const wr = smooth(-56, -86, z);
  if (wr > 0) h = lerp(h, routeLand(x, z), wr);
  // the coast: a beach eases down to the waterline and on under the sea;
  // where the coast is rocky the land keeps its height to the edge and drops
  // in a cliff, and the sea floor falls away faster
  const sd = shoreSD(x, z), cl = cliffiness(x, z);
  // inland, the ground never dips below the sea (that read as a salt lagoon)
  if (sd > 0) h = Math.max(h, SEA_Y + 0.35 + 0.04 * Math.min(sd, 40));
  const under = sd < 0 ? lerp(0.11, 0.3, cl) : 0.11;
  const beach = Math.max(-14, SEA_Y + under * sd + (fbm(x * 0.08, z * 0.08, 2) - 0.5) * 0.25 * smooth(-2, 6, -sd));
  h = lerp(h, beach, lerp(smooth(26, 9, sd), smooth(6, 0.8, sd), cl));
  // the harbour's apron and basin
  const A = HARBOUR.apron, B = HARBOUR.basin;
  if (x > A.x0 - A.fade && x < A.x1 + A.fade && z > A.z0 - A.fade && z < A.z1 + 14) {
    if (z <= A.z1) {
      const e = Math.max(A.x0 - x, x - A.x1, A.z0 - z, 0);
      h = lerp(HARBOUR.apronY, h, smooth(0, A.fade, e));
    } else if (x > A.x0 - 2 && x < A.x1 + 2) {
      // in front of the quay wall the sea is a couple of metres deep
      h = Math.min(h, lerp(SEA_Y - 2.4, h, smooth(1, 14, z - A.z1)));
    }
    if (x > B.x0 && x < B.x1 && z > B.z0) h = Math.min(h, B.floor);
  }
  // PALLET HOUSE's hilltop: levelled, the hill falling away round it
  {
    const P = PALLET_HOUSE, d = Math.hypot(x - P.x, z - P.z);
    if (d < P.r + 18) h = lerp(P.y, h, smooth(P.r, P.r + 18, d));
  }
  return h;
}
export const baseHeight = base;

// ---------- Route 1 ----------
// The route climbs the peninsula's spine from the town's northern rim to the
// mainland: a broad grassy valley between forested hills, rising gently and
// in terraces (one-way ledges, as in the games: you can hop down them going
// south, toward Pallet, but must walk round their ends going north).
// RC: the valley's centre line, x at each z (it winds); FLOOR at z.
const RC_CTRL = [[-3, -40], [2, -75], [6, -100], [0, -130], [-12, -165], [-18, -200], [-10, -235], [6, -270], [14, -305], [8, -340], [-4, -375], [-8, -405], [-2, -440], [4, -480], [0, -560], [-20, -700], [0, -900]];
const RC = (() => {
  const c = new THREE.CatmullRomCurve3(RC_CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const pts = c.getSpacedPoints(2000), out = new Float32Array(1001);   // x at z = -40 - i
  let k = 0;
  for (let i = 0; i <= 1000; i++) {
    const z = -40 - i;
    while (k < pts.length - 2 && pts[k + 1].z > z) k++;
    const a = pts[k], b = pts[k + 1], t = b.z === a.z ? 0 : (z - a.z) / (b.z - a.z);
    out[i] = a.x + (b.x - a.x) * Math.min(1, Math.max(0, t));
  }
  return out;
})();
export function routeX(z) {
  const f = Math.min(1000, Math.max(0, -40 - z)), i = Math.min(999, Math.floor(f)), t = f - i;
  return RC[i] + (RC[i + 1] - RC[i]) * t;
}
// the end of the route for now: a gate in the forest, Viridian City beyond
export const ROUTE1 = { z0: -60, z1: -445, gateZ: -438 };
export function routeHalfWidth(z) { return 34 + 7 * Math.sin(z * 0.021 + 1.2) + 4 * Math.sin(z * 0.057); }
// the ledges: a line at z (with a wobble) from x0 to x1, `drop` metres high
// on its south face. Outside its ends the step spreads into a gentle ramp, so
// the way round a ledge is an easy slope.
export const LEDGES = [
  { z: -112, x0: -46, x1: 12 }, { z: -150, x0: -17, x1: 34 }, { z: -188, x0: -58, x1: -6 }, { z: -222, x0: -23, x1: 28 },
  { z: -258, x0: -44, x1: 9 }, { z: -290, x0: 0, x1: 50 }, { z: -325, x0: -32, x1: 19 }, { z: -360, x0: -7, x1: 44 },
].map((L, i) => ({ ...L, drop: 1.0, i }));
const ledgeLine = (L, x) => L.z + Math.sin(x * 0.11 + L.i) * 0.9 + Math.sin(x * 0.31 + L.i * 2) * 0.3;
// how far past the ledge's ends (0 inside)
const ledgeOut = (L, x) => Math.max(0, L.x0 - x, x - L.x1);
// the ledge's step at (x, z): 1 north of its line (the high side), 0 south;
// `shift` moves the line north (the terrain mesh's step sits under the ledge's
// own top, so it is hidden: see buildTerrain)
function ledgeStep(L, x, z, shift = 0) {
  const e = ledgeOut(L, x), t = ledgeLine(L, x) - shift * (1 - smooth(0, 4, e)) - z;
  const w = 0.12 + Math.min(16, e * 1.25);
  return smooth(-w, w, t);
}
let ledgeShift = 0;   // buildTerrain: where the mesh puts the steps
function ledgeSum(x, z) {
  if (z > -88) return 0;
  let s = 0;
  for (const L of LEDGES) {
    const dz = L.z - z;                 // > 0: north of the ledge, its high side
    if (dz < -20) continue;
    s += dz > 20 ? L.drop : L.drop * ledgeStep(L, x, z, ledgeShift);
  }
  return s;
}
// the ledge whose sharp step is at (x, z) within m metres, or null
export function ledgeAt(x, z, m = 0.5) {
  for (const L of LEDGES) {
    if (x < L.x0 || x > L.x1 || Math.abs(L.z - z) > 3) continue;
    if (Math.abs(ledgeLine(L, x) - z) <= m) return L;
  }
  return null;
}
export const ledgeLineZ = ledgeLine;
// Route 1's tall grass, between its ledges [x0, z0, x1, z1]
export const TALL_GRASS = [[-22, -104, -4, -86], [10, -145, 30, -122], [-48, -182, -22, -158], [8, -216, 30, -194], [-40, -252, -14, -230],
  [16, -284, 40, -264], [-28, -318, -4, -298], [22, -354, 44, -334], [-34, -400, -12, -372]];
export const inTallGrass = (x, z) => TALL_GRASS.some(([a, b, c, d]) => x > a && x < c && z > b && z < d);
// the valley floor and the hills either side of it
function routeLand(x, z) {
  const c = routeX(z), d = Math.abs(x - c), fw = routeHalfWidth(z);
  const n = fbm(x * 0.035 + 2, z * 0.035 + 7, 3);
  // the floor: rising gently north, hummocky
  let h = 3.2 + 0.03 * Math.max(0, -62 - z) + (n - 0.5) * 2.4 + ledgeSum(x, z);
  // the valley's sides: forested hills, then the higher ground of the spine
  h += smooth(fw - 6, fw + 26, d) * (6 + fbm(x * 0.02 + 5, z * 0.02 + 1, 4) * 18);
  h += smooth(fw + 30, fw + 140, d) * 7;
  // the mainland past the route's end: rolling, wooded, higher
  h += smooth(-430, -520, z) * (6 + fbm(x * 0.01, z * 0.01, 3) * 20) * smooth(fw, fw + 40, d);
  return h;
}

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
// 1 on the dirt (roads, the square, the plaza), 0 off it, with a ragged edge
export function roadMask(x, z) {
  const d = pathSD(x, z) + (fbm(x * 0.6, z * 0.6, 2) - 0.5) * 0.5;
  return 1 - smooth(-0.4, 0.5, d);
}

// ---------- the path map ----------
// Every dirt surface in town as ONE shape: the roads (each a little wider or
// narrower as it wanders), the square and the plaza before the lab gate,
// joined with a smooth union so forks and crossings fillet into each other
// like one worn track. Baked once on a 0.25 m grid over the town; the terrain
// shader paints the dirt from it (no separate meshes, so nothing z-fights)
// and the grass and flowers keep off it.
//   sd    signed distance to the dirt's edge in metres (negative on the dirt)
//   lat   distance from the nearest road's centre line (for the ruts)
//   rut   how much the ruts show (fades at forks, the square and the plaza)
//   pale  the square and the plaza: paler, packed sand
const PM_RES = 0.25, PM_CLAMP = 4;
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
let PM = null;
export function pathMap() {
  if (PM) return PM;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const r of ROADS) for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  x0 = Math.min(x0, SQUARE.x - SQUARE.r, PLAZA.x0) - 5; x1 = Math.max(x1, SQUARE.x + SQUARE.r, PLAZA.x1) + 5;
  z0 = Math.min(z0, SQUARE.z - SQUARE.r, PLAZA.z0) - 5; z1 = Math.max(z1, SQUARE.z + SQUARE.r, PLAZA.z1) + 5;
  const nx = Math.ceil((x1 - x0) / PM_RES), nz = Math.ceil((z1 - z0) / PM_RES), N = nx * nz;
  const best = new Float32Array(N).fill(99), second = new Float32Array(N).fill(99), lat = new Float32Array(N).fill(9);
  const one = new Float32Array(N).fill(99), oneLat = new Float32Array(N), wob = new Float32Array(N);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) wob[j * nx + i] = fbm((x0 + (i + 0.5) * PM_RES) * 0.15 + 5, (z0 + (j + 0.5) * PM_RES) * 0.15, 2);
  const R = 3.2, touched = [];
  ROADS.forEach((road, ri) => {
    touched.length = 0;
    const w = ri <= 1 ? 1.62 : TRAILS.has(ri) ? 1.1 : 1.38;
    for (let k = 0; k < road.length - 1; k++) {
      const [ax, az] = road[k], [bx, bz] = road[k + 1];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - x0) / PM_RES)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + R - x0) / PM_RES));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R - z0) / PM_RES)), j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz) + R - z0) / PM_RES));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) * PM_RES, z = z0 + (j + 0.5) * PM_RES, id = j * nx + i;
        const d = Math.sqrt(segDist2(x, z, ax, az, bx, bz)[0]);
        const sd = d - w * (0.9 + wob[id] * 0.24);
        if (one[id] === 99) touched.push(id);
        if (sd < one[id]) { one[id] = sd; oneLat[id] = d; }
      }
    }
    for (const id of touched) {
      const v = one[id];
      if (v < best[id]) { second[id] = best[id]; best[id] = v; lat[id] = oneLat[id]; } else if (v < second[id]) second[id] = v;
      one[id] = 99;
    }
  });
  const sd = new Float32Array(N), data = new Uint8Array(N * 4);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const id = j * nx + i, x = x0 + (i + 0.5) * PM_RES, z = z0 + (j + 0.5) * PM_RES;
    // roads: the two nearest, filleted together where they meet
    let d = best[id] < 98 ? smin(best[id], second[id], 1.4) : 99;
    // the square: a round of packed sand, a little uneven at its rim
    const a = Math.atan2(z - SQUARE.z, x - SQUARE.x);
    const sq = Math.hypot(x - SQUARE.x, z - SQUARE.z) - (4.4 + Math.sin(a * 3 + 1) * 0.4 + Math.sin(a * 7) * 0.2);
    // the plaza before the lab gate: a rounded rectangle
    // (its east side stops short of the retaining wall at the hill's foot and
    // the gate leaves swung open before it; a band between the leaves runs on
    // to the foot of the stairs)
    const P = PLAZA, PX1 = P.x1 - 2.0, qx = Math.abs(x - (P.x0 + PX1) / 2) - (PX1 - P.x0) / 2 + 1.2, qz = Math.abs(z - (P.z0 + P.z1) / 2) - (P.z1 - P.z0) / 2 + 1.2;
    const pl = Math.min(Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - 1.2 + 0.4,
      Math.sqrt(segDist2(x, z, PX1 - 2.5, STAIRS.z, STAIRS.x0 + 0.3, STAIRS.z)[0]) - 1.35);
    // the lab bridge lands on the plaza: a short worn stretch joins them
    const LB = BRIDGES[0], lb = Math.sqrt(segDist2(x, z, LB.x1 - 1, LB.z, PLAZA.x0 + 2.5, LB.z)[0]) - 1.45 * (0.9 + wob[id] * 0.24);
    const open = Math.min(sq, pl, lb);
    d = smin(d, open, 2.6);
    sd[id] = d;
    const rut = smooth(0.6, 2.2, second[id] - best[id]) * smooth(-1, 2.5, open) * (1 - smooth(-0.2, 0.4, best[id]));
    const pale = 1 - smooth(-2.5, 1.5, open);
    const k = id * 4;
    data[k] = Math.round(Math.min(1, Math.max(0, (d + PM_CLAMP) / (2 * PM_CLAMP))) * 255);
    data[k + 1] = Math.round(Math.min(1, lat[id] / 3) * 255);
    data[k + 2] = Math.round(rut * 255);
    data[k + 3] = Math.round(pale * 255);
  }
  PM = { x0, z0, nx, nz, w: nx * PM_RES, d: nz * PM_RES, sd, data };
  return PM;
}
// the signed distance to the dirt's edge (bilinear, like the shader sees it)
export function pathSD(x, z) {
  const M = pathMap();
  const fx = (x - M.x0) / PM_RES - 0.5, fz = (z - M.z0) / PM_RES - 0.5;
  if (fx < 0 || fz < 0 || fx >= M.nx - 1 || fz >= M.nz - 1) return PM_CLAMP;
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * M.nx + i;
  const a = M.sd[k], b = M.sd[k + 1], c = M.sd[k + M.nx], d = M.sd[k + M.nx + 1];
  return Math.min(PM_CLAMP, (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz);
}
// true when something of footprint radius r at (x, z) would stand on the dirt
// or within m of its edge (the painted edge wobbles about 0.25 m either way).
// The baked distance is only exact within ~1.5 m of the dirt (farther off it
// reads PM_CLAMP), so a wide footprint is tested on rings out to its rim.
export function onPath(x, z, r = 0, m = 0.4) {
  if (r + m <= 1.2) return pathSD(x, z) < r + m;
  for (const f of [0, 1 / 3, 2 / 3, 1]) {
    const ri = r * f, n = f === 0 ? 1 : Math.max(12, Math.ceil(ri * 12.6));
    for (let a = 0; a < n; a++) {
      const t = a / n * Math.PI * 2;
      if (pathSD(x + Math.cos(t) * ri, z + Math.sin(t) * ri) < m + r - ri) return true;
    }
  }
  return false;
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
// and the world has edges: the cliffs where the coast is rocky, the forest
// past the town's hills, and the hillsides either side of Route 1 up to its
// gate in the forest at the mainland end
export const WALK = { x0: -186, x1: 186, z0: -452, z1: 230 };
export function outOfBounds(x, z) {
  if (x < WALK.x0 || x > WALK.x1 || z < WALK.z0 || z > WALK.z1) return true;
  const sd = shoreSD(x, z);
  if (sd > -4 && sd < 4.5 && cliffiness(x, z) > 0.45 && base(x, z) > SEA_Y + 1.4) return true;
  if (z > -70) return false;
  if (z < ROUTE1.gateZ) return true;
  return Math.abs(x - routeX(z)) > routeHalfWidth(z) + 8;
}
export function noWalk(x, z) {
  const u = hillU(x, z);
  if (u > 0.002 && u <= 0.985 && !onStairs(x, z, -0.15)) return true;
  return outOfBounds(x, z);
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
  // a deeper green along the dirt's edge (the dirt itself is painted by the
  // terrain shader from the path map)
  const ps = pathSD(x, z);
  if (ps < 1.4) out.lerp(GRASS_C, (1 - smooth(0.2, 1.4, ps)) * 0.4);
  // under the stairs
  if (onStairs(x, z, 0.3)) out.lerp(DIRT_D, 0.8);
  // soil under the fields (their painted rows cover it)
  if (fieldAt(x, z, 1.5)) out.lerp(SOIL, fieldAt(x, z, 0.2) ? 0.9 : 0.35);
  // muddy banks
  const pd2 = Math.hypot(x - POND.x, z - POND.z);
  out.lerp(MUD, (1 - smooth(POND.r - 1, POND.r + 2.5, pd2)) * 0.6);
  const st = streamAt(x, z);
  if (st.d < 3.6) out.lerp(ROCK.clone().lerp(MUD, 0.4), (1 - smooth(2.2, 3.6, st.d)) * 0.7);
  // the beach: dry pale sand up top, warm sand, dark wet sand at the water
  const sdc = shoreSD(x, z);
  const sandK = smooth(17, 12, sdc + (n - 0.5) * 3) * (1 - smooth(1.8, 3.5, h - SEA_Y)) ;
  if (sandK > 0) {
    const s = SAND.clone().lerp(SAND_DRY, smooth(0.6, 1.4, h - SEA_Y)).lerp(SAND_W, 1 - smooth(0.05, 0.35, h - SEA_Y));
    out.lerp(s, sandK);
  }
  return out;
}

// ---------- meshes ----------
// The ground is cut into 45 m chunks: fine (1.5 m cells) round where you can
// walk, coarse (4.5 m) out on the far hills and the mainland, and none at all
// out under the deep sea (the opaque deep water hides the floor there). Fine
// edges next to coarse chunks follow the coarse edge, so they meet without
// cracks; normals come from the same height grid either side of a seam.
// Chunks are merged into blocks of 4 x 4 (one mesh each, for culling).
// the sea's depth map and fine mesh cover this square (native: seabed.bin)
export const SEA_BOX = { x0: -460, z0: -640, n: 920 };
export const TB = { x0: -495, x1: 495, z0: -900, z1: 315, chunk: 45, fine: 1.5, coarse: 4.5 };
const FINE_ZONE = { x0: -240, x1: 240, z0: -500, z1: 250 };
let TCH = null;   // per chunk: { step, n, y (heights, (n+1)^2) } or null (dropped)
function chunkInfo() {
  if (TCH) return TCH;
  const C = TB.chunk, ncx = Math.round((TB.x1 - TB.x0) / C), ncz = Math.round((TB.z1 - TB.z0) / C);
  const info = [];
  for (let cj = 0; cj < ncz; cj++) for (let ci = 0; ci < ncx; ci++) {
    const x0 = TB.x0 + ci * C, z0 = TB.z0 + cj * C;
    // fine where you can walk, or within ~35 m of it (and the shallows round it)
    let fine = false;
    if (x0 + C > FINE_ZONE.x0 && x0 < FINE_ZONE.x1 && z0 + C > FINE_ZONE.z0 && z0 < FINE_ZONE.z1) {
      for (let a = 0; a <= 8 && !fine; a++) for (let b = 0; b <= 8 && !fine; b++) {
        const x = x0 - 35 + a * (C + 70) / 8, z = z0 - 35 + b * (C + 70) / 8;
        if (!outOfBounds(x, z) && shoreSD(x, z) > -25) fine = true;
      }
    }
    // drop chunks that lie wholly under the deep sea (with a margin round them)
    let deep = true;
    for (let a = -1; a <= 11 && deep; a++) for (let b = -1; b <= 11 && deep; b++) if (base(x0 + a * C / 10, z0 + b * C / 10) > SEA_Y - 2.6) deep = false;
    info.push({ ci, cj, x0, z0, fine, keep: !deep });
  }
  TCH = { ncx, ncz, info };
  return TCH;
}
// the ground the mesh draws at (x, z): the ledges' steps sit under their tops
function meshY(x, z) {
  let y = height(x, z);
  // under the stairs the ground sinks out of sight (the stone flights cover it)
  // At the two ends the grid's last vertex is not sunk (that left a deep
  // wedge in front of the first riser and behind the top tread): the plaza
  // runs flat to the first riser, and under the top tread the ground sits
  // 4 cm below its face (not on it, where the two fought).
  if (onStairs(x, z, 0.6)) {
    if (x <= STAIRS.x0 + 0.05) y = Math.min(y, PLAZA.y);
    else if (x >= STAIRS.x1 - 0.01) y = Math.min(y, PLAT_Y - 0.04);
    else y -= 1.4;
  }
  return y;
}
const LEDGE_MESH_SHIFT = 1.9;
export function buildTerrain() {
  const T = chunkInfo(), C = TB.chunk, group = new THREE.Group();
  group.name = 'terrain';
  const at = (ci, cj) => (ci < 0 || cj < 0 || ci >= T.ncx || cj >= T.ncz ? null : T.info[cj * T.ncx + ci]);
  ledgeShift = LEDGE_MESH_SHIFT;
  const tmp = new THREE.Color();
  const blocks = new Map();
  for (const ch of T.info) {
    if (!ch.keep) continue;
    const step = ch.fine ? TB.fine : TB.coarse, n = Math.round(C / step), W = n + 3;
    // heights with a one-cell border (for normals)
    const Y = new Float32Array(W * W);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) Y[j * W + i] = meshY(ch.x0 + (i - 1) * step, ch.z0 + (j - 1) * step);
    // a fine chunk's edge next to a coarse one follows the coarse edge
    if (ch.fine) {
      const k = Math.round(TB.coarse / TB.fine);
      const coarseAt = (dc, dj) => { const o = at(ch.ci + dc, ch.cj + dj); return o && o.keep && !o.fine; };
      const fix = (idx) => { for (let m = 0; m <= n; m++) { if (m % k === 0) continue; const m0 = m - (m % k), t = (m % k) / k; const [a, b, c] = [idx(m0), idx(m0 + k), idx(m)]; Y[c] = Y[a] + (Y[b] - Y[a]) * t; } };
      if (coarseAt(-1, 0)) fix((m) => (m + 1) * W + 1);
      if (coarseAt(1, 0)) fix((m) => (m + 1) * W + n + 1);
      if (coarseAt(0, -1)) fix((m) => W + m + 1);
      if (coarseAt(0, 1)) fix((m) => (n + 1) * W + m + 1);
    }
    const pos = [], nrm = [], col = [], uv = [], idx = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = ch.x0 + i * step, z = ch.z0 + j * step, y = Y[(j + 1) * W + i + 1];
      const dx = (Y[(j + 1) * W + i + 2] - Y[(j + 1) * W + i]) / (2 * step), dz = (Y[(j + 2) * W + i + 1] - Y[j * W + i + 1]) / (2 * step);
      const l = Math.hypot(dx, 1, dz);
      pos.push(x, y, z); nrm.push(-dx / l, 1 / l, -dz / l); uv.push(x / 4, z / 4);
      groundColor(x, z, y, 1 - 1 / l, tmp);
      col.push(tmp.r, tmp.g, tmp.b);
    }
    // cells split along the (0,1)-(1,0) diagonal, as three's PlaneGeometry
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + n + 1, c = b + 1, d = a + 1;
      idx.push(a, b, d, b, c, d);
    }
    ch.step = step; ch.n = n; ch.y = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) ch.y[j * (n + 1) + i] = Y[(j + 1) * W + i + 1];
    const key = Math.floor(ch.ci / 4) + ',' + Math.floor(ch.cj / 4);
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push({ pos, nrm, col, uv, idx });
  }
  ledgeShift = 0;
  for (const [key, parts] of blocks) {
    const P = [], N = [], Cc = [], U = [], I = [];
    for (const p of parts) { const o = P.length / 3; P.push(...p.pos); N.push(...p.nrm); Cc.push(...p.col); U.push(...p.uv); for (const k of p.idx) I.push(k + o); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g);
    m.name = 'terrain_' + key.replace(',', '_');
    m.receiveShadow = true;
    group.add(m);
  }
  // the ledges: one mesh for all of them (one draw)
  {
    const gs = LEDGES.map((L) => ledgeMesh(L).geometry), P = [], N = [], Cc = [], U = [], I = [];
    for (const g of gs) { const o = P.length / 3; P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); Cc.push(...g.attributes.color.array); U.push(...g.attributes.uv.array); for (const k of g.index.array) I.push(k + o); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    const m = new THREE.Mesh(g); m.name = 'ledges'; m.receiveShadow = true;
    group.add(m);
  }
  return group;
}
// the ground as the terrain mesh draws it (for the ink's ground cuts)
export function meshHeight(x, z) {
  const T = chunkInfo(), C = TB.chunk;
  const ci = Math.floor((x - TB.x0) / C), cj = Math.floor((z - TB.z0) / C);
  const ch = ci >= 0 && cj >= 0 && ci < T.ncx && cj < T.ncz ? T.info[cj * T.ncx + ci] : null;
  if (!ch || !ch.y) return SEA_Y - 30;
  const u = (x - ch.x0) / ch.step, w = (z - ch.z0) / ch.step, n = ch.n;
  const i = Math.min(n - 1, Math.floor(u)), j = Math.min(n - 1, Math.floor(w)), fx = u - i, fz = w - j;
  const H = (a, b) => ch.y[b * (n + 1) + a];
  const ha = H(i, j), hb = H(i, j + 1), hc = H(i + 1, j + 1), hd = H(i + 1, j);
  return fx + fz <= 1 ? ha + fz * (hb - ha) + fx * (hd - ha) : hc + (1 - fx) * (hb - hc) + (1 - fz) * (hd - hc);
}
// A ledge as part of the ground: its grassy top (over the hidden step of the
// terrain mesh, which sits LEDGE_MESH_SHIFT north of the edge), a rounded lip
// and a rocky face down to the low side, running a few metres past its ends
// where it fades into the ramp. Same material as the ground.
const LEDGE_FACE = new THREE.Color('#a4805a'), LEDGE_FACE_D = new THREE.Color('#7a5a42'), LEDGE_LIP = new THREE.Color('#4a3a2c');
function ledgeMesh(L) {
  // rows across: [t (m north of the edge), dy over the ground there, face colour k (-1 = ground colour)]
  const ROWS = [[-1.6, 0, -1], [-0.7, 0, -1], [-0.06, -0.12, 2], [-0.02, 0, 1], [0.04, 0.05, 3], [0.2, 0.05, -1], [1.0, 0.04, -1], [2.0, 0.04, -1], [3.0, 0.04, -1], [4.0, 0.03, -1], [4.7, -0.03, -1]];
  const pos = [], nrm = [], col = [], uv = [], idx = [], tmp = new THREE.Color();
  const xa = L.x0 - 3, xb = L.x1 + 3, n = Math.ceil((xb - xa) / 0.5);
  const R = ROWS.length;
  for (let k = 0; k <= n; k++) {
    const x = xa + (xb - xa) * k / n, zl = ledgeLine(L, x), e = ledgeOut(L, x);
    const lo = height(x, zl + 0.35), hi = height(x, zl - 0.35);
    for (const [t, dy, ck] of ROWS) {
      const z = zl - t;
      let y;
      if (t < -0.1) y = height(x, z) + (e > 0.3 ? 0.04 : -0.06);   // in front: only past the ends, where the ramp starts
      else if (ck === 2) y = Math.min(lo, height(x, z)) + dy;          // the foot of the face, a little sunk
      else if (ck === 1 || ck === 3) y = Math.max(hi, height(x, z)) + dy;
      else y = height(x, z) + dy;
      pos.push(x, y, z); uv.push(x / 4, z / 4);
      if (ck < 0) { groundColor(x, z, y, 0.05, tmp); col.push(tmp.r, tmp.g, tmp.b); }
      else { const c = ck === 3 ? LEDGE_LIP : ck === 1 ? LEDGE_FACE : LEDGE_FACE_D; col.push(c.r, c.g, c.b); }
      nrm.push(0, 1, 0);
    }
  }
  for (let k = 0; k < n; k++) for (let r = 0; r < R - 1; r++) {
    const a = k * R + r, b = a + 1, c = a + R, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the top keeps the ground's normals (up, as the mesh under it), the face its own
  const N = g.attributes.normal;
  for (let k = 0; k <= n; k++) for (let r = 0; r < R; r++) if (ROWS[r][2] < 0) {
    const x = pos[(k * R + r) * 3], z = pos[(k * R + r) * 3 + 2];
    const dx = (height(x + 0.75, z) - height(x - 0.75, z)) / 1.5, dz = (height(x, z + 0.75) - height(x, z - 0.75)) / 1.5, l = Math.hypot(dx, 1, dz);
    N.setXYZ(k * R + r, -dx / l, 1 / l, -dz / l);
  }
  const m = new THREE.Mesh(g);
  m.name = 'ledge_' + L.i;
  m.receiveShadow = true;
  return m;
}

// The water as the anime paints it: turquoise over sand, deep blue further
// out, crisp white bands of foam rolling onto the beach, a white edge where
// it laps the sand, a slow swell and glints of sun. A depth map of the sea
// floor (baked once) tells the shader how deep the water is.
export function buildWater(uTime, fog = { color: '#cfe6f2', near: 160, far: 900 }) {
  const group = new THREE.Group();
  // depth map over the whole coast (SEA_BOX): 1 texel = 2 m
  const { x0: DX0, z0: DZ0, n: DN } = SEA_BOX, DW = DN, DD = DN, R2 = 2;
  const TW = DW / R2, TD = DD / R2;
  const data = new Uint8Array(TW * TD * 4);
  for (let j = 0; j < TD; j++) for (let i = 0; i < TW; i++) {
    const x = DX0 + (i + 0.5) * R2, z = DZ0 + (j + 0.5) * R2;
    const sd = shoreSD(x, z), d = sd > 30 ? -8 : SEA_Y - (sd < -40 ? base(x, z) : height(x, z));
    const k = (j * TW + i) * 4;
    data[k] = Math.max(0, Math.min(255, Math.round((0.5 + d / 32) * 255)));
    data[k + 1] = data[k + 2] = 0; data[k + 3] = 255;
  }
  const depthTex = new THREE.DataTexture(data, TW, TD, THREE.RGBAFormat);
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
      float depth = mix(30.0, (texture2D(uDepth, clamp(uv, 0.0, 1.0)).r - 0.5) * 32.0, inside);
      depth = mix(depth, 30.0, smoothstep(0.9, 1.0, max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0));
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
  // one 4 m grid over the coast (SEA_BOX; the native game leaves out what lies
  // under the land and splits the rest into deep and shallow), then a vast
  // flat sea round it to the horizon
  const near = new THREE.Mesh(new THREE.PlaneGeometry(DN, DN, DN / 4, DN / 4).rotateX(-Math.PI / 2), seaMat);
  near.position.set(DX0 + DN / 2, SEA_Y, DZ0 + DN / 2);
  near.renderOrder = 1;
  group.add(near);
  const farG = new THREE.BufferGeometry();
  {
    const X0 = DX0, X1 = DX0 + DN, Z0 = DZ0, Z1 = DZ0 + DN, F = 3000;
    const quads = [[-F, Z1, F, F], [-F, -F, F, Z0], [-F, Z0, X0, Z1], [X1, Z0, F, Z1]];
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
    // grass stops at the dirt's edge (a few blades lean over it)
    let g = smooth(-0.15, 0.55, pathSD(x, z));
    if (isWater(x, z) || h < SEA_Y + 1.6 && shoreSD(x, z) < 16) g = 0;
    if (onStairs(x, z, 0.4) || fieldAt(x, z, 0.3)) g = 0;
    if (streamAt(x, z).d < 3.2) g = 0;
    // no grass on a ledge's edge (the clumps would float off its face)
    if (z < -90 && z > -380 && ledgeAt(x, z, 1.7)) g = 0;
    // none under PALLET HOUSE and its terrace deck
    if (Math.abs(x - PALLET_HOUSE.x) < 20 && Math.abs(z - PALLET_HOUSE.z) < 20) {
      const [lx, lz] = toLocal(PALLET_HOUSE, x, z);
      if (Math.abs(lx) < 8.2 && lz > -7.2 && lz < 10.4) g = 0;
    }
    // patchy: tufts and drifts, open lawn between
    g *= 0.12 + smooth(0.42, 0.68, fbm(x * 0.11 + 3, z * 0.11, 3)) * 0.88;
    // Route 1's tall grass: density + 2 marks it (the grass shaders grow it
    // tall there), its edge a little ragged
    if (g > 0.02) {
      const e = (fbm(x * 0.3 + 8, z * 0.3, 2) - 0.5) * 2.4;
      if (TALL_GRASS.some(([a, b, c, d]) => x > a - e && x < c + e && z > b - e && z < d + e)) g = 2 + Math.max(0.85, g);
    }
    const k = (j * nx + i) * 4;
    data[k] = h; data[k + 1] = g > 1.5 ? Math.min(3, g) : Math.max(0, Math.min(1, g)); data[k + 3] = 1;
  }
  const t = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.FloatType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
