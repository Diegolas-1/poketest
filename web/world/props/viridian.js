// Viridian City's two hero buildings, after the anime's own pictures:
//
//   pokemonCenter()  the POKéMON CENTER: a big glossy red dome (a painted
//                    highlight on it) sitting in a white, curved, swept body;
//                    a blue glass shell sweeps up out of the ground at the
//                    front right, wraps the dome's back like a hood and comes
//                    down on the roof at the back left as a ribbed glass
//                    canopy; a white rim runs along its edge. The ground floor
//                    is a band of blue glass behind white pillars, a red P on
//                    the roof and another on the white band over the doors.
//                    A round, low terrace all round, three-step curved stairs,
//                    a ramp up to the doors (Officer Jenny's motorbike pulls up
//                    there), planters with clipped shrubs, a covered side way.
//   viridianGym()    the VIRIDIAN GYM: a stone-grey classical front (an ashlar
//                    centre block with an arched doorway and orange double
//                    doors, orange wings with recessed panels behind free
//                    standing columns, an entablature with corner finials),
//                    orange curved roof panels sweeping up to a raised crown
//                    with a dark trim edge; it stands on a terrace with
//                    balustrades, two symmetric flights of stairs down to the
//                    street and a stone fountain basin between them (a water
//                    jet, a carved relief wall behind it), conical clipped
//                    trees and round shrubs in planters on both sides.
//
// Both return a THREE.Group with the footprint centred on the origin, the
// lowest ground at y = 0 (the pad's level), the front (doors) toward +z, like
// every prop of the library. Each holds two levels of detail as their own
// groups (userData.keep, so town.js merges nothing across them):
//   near  (meshes named lodN_<id>): every detail, inked (the parts' edges are
//         cut against each other here, outline.js partEdges, as mergeStatic does)
//   far   (meshes named lodF_<id>): the silhouette in a few hundred triangles,
//         no ink, on layer 3 (the web build never draws it; the native game
//         swaps the two by distance: main.gd, LOD_SWAP)
// The clipped shrubs and trees are instanced leaf-card models (the bake makes
// them the town's own plants: billboards and fades like every bush).
//
// userData (local space, before the caller's placement; place() below turns
// them into world space for a town):
//   foot      { hw, hd }  half sizes of the pad it needs
//   colliders [{ box, x, z, hw, hd, rot } | { x, z, r }]
//   walk      [{ x, z, hw, hd, rot, y }]   decks: terraces, steps, ramps
//   markers   { name: [x, y, z, yaw] }     doors (a person stands there, facing
//             in), the bike stop, perches for birds (Spearow), interior anchors
//
//   place(world, G, x, y, z, rot)  adds G to world.group at (x, y, z) turned rot
//   and pushes its colliders, walk decks and noVeg box into world; returns the
//   markers in world space.
import * as THREE from 'three';
import { toon } from '../toon.js';
import { rng } from '../terrain.js';
import { partEdges, inkSolid, inkSkip } from '../outline.js';
import { leafMaterial, pushCard, toGeometry, cards, TILE } from '../foliage.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as O from './outdoor.js';
import * as BK from './buildings.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const BUILD = { deep: [0.56, 0.62, 0.82], shade: [0.74, 0.79, 0.94], lit: [1.06, 1.04, 0.98], bands: [0.1, 0.3, 0.58] };
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const col3 = (h) => new THREE.Color(h);
export const LOD_SWAP = 165;   // metres: near -> far (native main.gd reads the mesh names)

// ---------- geometry builder: vertices with normal, uv, colour ----------
// tri() turns each triangle to face the way its vertex normals point, so
// generated surfaces never come out inside out.
class GB {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
  v(p, n, uv = [0, 0], c = '#ffffff') {
    const cc = typeof c === 'string' ? col3(c) : c;
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(uv[0], uv[1]); this.c.push(cc.r, cc.g, cc.b);
    return this.p.length / 3 - 1;
  }
  t(a, b, c) {
    const P = (k) => V(this.p[k * 3], this.p[k * 3 + 1], this.p[k * 3 + 2]), N = (k) => V(this.n[k * 3], this.n[k * 3 + 1], this.n[k * 3 + 2]);
    const f = P(b).sub(P(a)).cross(P(c).sub(P(a)));
    if (f.lengthSq() < 1e-14) return;
    if (f.dot(N(a).add(N(b)).add(N(c))) < 0) this.i.push(a, c, b); else this.i.push(a, b, c);
  }
  q(a, b, c, d) { this.t(a, b, c); this.t(a, c, d); }
  // a grid of rows x cols vertices from fn(i, j) -> [p, n, uv, col]
  grid(nr, nc, fn) {
    const id = [];
    for (let i = 0; i < nr; i++) { id.push([]); for (let j = 0; j < nc; j++) { const [p, n, uv, c] = fn(i, j); id[i].push(this.v(p, n, uv, c)); } }
    for (let i = 0; i + 1 < nr; i++) for (let j = 0; j + 1 < nc; j++) this.q(id[i][j], id[i + 1][j], id[i + 1][j + 1], id[i][j + 1]);
    return id;
  }
  get empty() { return !this.i.length; }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    return g;
  }
}
// A painted picture in the shared vertex-colour material: its tint (the
// colour that turns the neutral picture into the wanted one, as O.texm works it
// out) rides in the vertices, so every tint of one picture is one material.
const NEU = new THREE.Color(O.NEUTRAL_COL);
function pic(t, col = '#ffffff') {
  const c = new THREE.Color(col);
  if (t.tint) { const k = new THREE.Color(t.col); c.multiply(new THREE.Color(Math.min(1, k.r / NEU.r), Math.min(1, k.g / NEU.g), Math.min(1, k.b / NEU.b))); t = t.t; }
  return { pic: true, mat: O.texm(t, '#ffffff', undefined, true), tint: c };
}
const asMat = (m, mesh) => { if (m && m.pic) { mesh.userData.tint = m.tint; return m.mat; } return m; };
// a mesh in the vertex-colour material (the colours ride in the vertices)
function vcMesh(P, gb, o = {}) {
  if (gb.empty) return null;
  const m = new THREE.Mesh(gb instanceof GB ? gb.geo() : gb, O.vcFlat(o.side));
  if (o.mat) m.material = asMat(o.mat, m);
  m.castShadow = o.shadow !== false; m.receiveShadow = true;
  m.userData.outline = o.line === false ? false : 'solid';
  P.add(m);
  return m;
}
// plain solids (folded into the vertex-colour material by O.foldFlat)
const box = (P, w, h, d, col, x, y, z, o = {}) => O.box(w, h, d, col, x, y, z, P, o);
const cyl = (P, rt, rb, h, col, x, y, z, seg = 12, o = {}) => O.cyl(rt, rb, h, col, x, y, z, P, seg, o);

// ---------- shapes in plan (x, z) ----------
// signed area > 0: the outward normal of an edge (tx, tz) is (tz, -tx)
const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length]; a += x0 * z1 - x1 * z0; } return a / 2; };
const ccw = (pts) => (area(pts) > 0 ? pts : pts.slice().reverse());
// outward unit normals of a closed curve (averaged at the vertices: smooth)
function curveNormals(pts) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[(i - 1 + n) % n], [bx, bz] = pts[(i + 1) % n];
    const tx = bx - ax, tz = bz - az, l = Math.hypot(tx, tz) || 1;
    out.push([tz / l, -tx / l]);
  }
  return out;
}
const offsetCurve = (pts, d) => { const N = curveNormals(pts); return pts.map(([x, z], i) => [x + N[i][0] * d, z + N[i][1] * d]); };
const curveLen = (pts) => { let L = 0; for (let i = 0; i < pts.length; i++) { const [a, b] = pts[i], [c, d] = pts[(i + 1) % pts.length]; L += Math.hypot(c - a, d - b); } return L; };
// a vertical band along a closed curve from y0 to y1 (smooth round, outward)
function wallBand(gb, pts, y0, y1, col, { inward = false, uvs = 0.5 } = {}) {
  const N = curveNormals(pts), n = pts.length;
  let s = 0; const S = [0];
  for (let i = 1; i <= n; i++) { const [a, b] = pts[i - 1], [c, d] = pts[i % n]; s += Math.hypot(c - a, d - b); S.push(s); }
  const id = [];
  for (let i = 0; i <= n; i++) {
    const [x, z] = pts[i % n], [nx, nz] = N[i % n], nn = inward ? V(-nx, 0, -nz) : V(nx, 0, nz);
    const c = typeof col === 'function' ? col : () => col;
    id.push([gb.v(V(x, y0, z), nn, [S[i] * uvs, y0 * uvs], c(0, x, z)), gb.v(V(x, y1, z), nn, [S[i] * uvs, y1 * uvs], c(1, x, z))]);
  }
  for (let i = 0; i < n; i++) gb.q(id[i][0], id[i + 1][0], id[i + 1][1], id[i][1]);
}
// a flat cap over a closed curve (up or down), triangulated
function capCurve(gb, pts, y, col, up = true, holes = []) {
  const ctr = pts.map(([x, z]) => new THREE.Vector2(x, z)), hs = holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
  const tris = THREE.ShapeUtils.triangulateShape(ctr, hs), all = [...pts, ...holes.flat()];
  const n = up ? V(0, 1, 0) : V(0, -1, 0), base = all.map(([x, z]) => gb.v(V(x, y, z), n, [x * 0.5, z * 0.5], col));
  for (const [a, b, c] of tris) gb.t(base[a], base[b], base[c]);
}
// a ring cap between an outer and an inner curve with the same point count
function ringCap(gb, outer, inner, y, col, up = true) {
  const n = up ? V(0, 1, 0) : V(0, -1, 0), m = outer.length;
  const A = outer.map(([x, z]) => gb.v(V(x, y, z), n, [x * 0.5, z * 0.5], col)), B = inner.map(([x, z]) => gb.v(V(x, y, z), n, [x * 0.5, z * 0.5], col));
  for (let i = 0; i < m; i++) { const j = (i + 1) % m; gb.q(A[i], A[j], B[j], B[i]); }
}
// a lathe in bands: profile [[r, y], ...] turned seg times about y (phi0..phi1).
// Each profile step is its own band (hard creases between steps; round about
// the axis). smooth: one shared normal per profile point instead (domes).
function lathe(gb, prof, seg, col, { phi0 = 0, phi1 = TAU, smooth = false, cx = 0, cz = 0, cy = 0 } = {}) {
  const full = Math.abs(phi1 - phi0 - TAU) < 1e-6, cols = full ? seg : seg + 1;
  const ring = (r, y, nr, ny, k, c) => { const a = phi0 + (phi1 - phi0) * k / seg; return [V(cx + Math.sin(a) * r, cy + y, cz + Math.cos(a) * r), V(Math.sin(a) * nr, ny, Math.cos(a) * nr).normalize(), [k / seg, y], c]; };
  const colOf = (i) => (Array.isArray(col) ? col[Math.min(i, col.length - 1)] : col);
  if (smooth) {
    const rows = prof.map(([r, y], i) => {
      const [r0, y0] = prof[Math.max(0, i - 1)], [r1, y1] = prof[Math.min(prof.length - 1, i + 1)];
      const tr = r1 - r0, ty = y1 - y0, l = Math.hypot(tr, ty) || 1;
      return [r, y, ty / l, -tr / l, colOf(i)];
    });
    const id = rows.map(([r, y, nr, ny, c]) => { const row = []; for (let k = 0; k < cols; k++) row.push(gb.v(...ring(r, y, nr, ny, k, c))); return row; });
    for (let i = 0; i + 1 < id.length; i++) for (let k = 0; k < seg; k++) gb.q(id[i][k], id[i][(k + 1) % cols], id[i + 1][(k + 1) % cols], id[i + 1][k]);
    return;
  }
  for (let i = 0; i + 1 < prof.length; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1], tr = r1 - r0, ty = y1 - y0, l = Math.hypot(tr, ty) || 1, nr = ty / l, ny = -tr / l, c = colOf(i);
    const A = [], B = [];
    for (let k = 0; k < cols; k++) { A.push(gb.v(...ring(r0, y0, nr, ny, k, c))); B.push(gb.v(...ring(r1, y1, nr, ny, k, c))); }
    for (let k = 0; k < seg; k++) gb.q(A[k], A[(k + 1) % cols], B[(k + 1) % cols], B[k]);
  }
}
// a sphere patch: centre c, radius r, around the axis `dir`, half angles (au, av)
// along the patch's two tangents (an ellipse on the sphere)
function spherePatch(gb, c, r, dir, au, av, col, seg = 14) {
  const d = dir.clone().normalize(), up = Math.abs(d.y) > 0.95 ? V(1, 0, 0) : V(0, 1, 0);
  const tu = V().crossVectors(up, d).normalize(), tv = V().crossVectors(d, tu).normalize();
  const ctr = gb.v(c.clone().addScaledVector(d, r), d, [0.5, 0.5], col), ringIds = [];
  for (let k = 0; k < seg; k++) {
    const a = k / seg * TAU, u = Math.cos(a) * au, v = Math.sin(a) * av;
    const n = d.clone().addScaledVector(tu, Math.tan(u)).addScaledVector(tv, Math.tan(v)).normalize();
    ringIds.push(gb.v(c.clone().addScaledVector(n, r), n, [0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2], col));
  }
  for (let k = 0; k < seg; k++) gb.t(ctr, ringIds[k], ringIds[(k + 1) % seg]);
}
// a tube along points (closed caps as flat discs)
function tube(gb, pts, r, col, { seg = 8, closed = false, n = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal'), steps = n || Math.max(4, Math.ceil(curve.getLength() / 0.35));
  const fr = curve.computeFrenetFrames(steps, closed), id = [];
  for (let i = 0; i <= steps; i++) {
    const p = curve.getPointAt(i / steps), N = fr.normals[i], B = fr.binormals[i], row = [];
    for (let k = 0; k <= seg; k++) { const a = k / seg * TAU, nn = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a)); row.push(gb.v(p.clone().addScaledVector(nn, r), nn, [k / seg, i / steps * curve.getLength()], col)); }
    id.push(row);
  }
  for (let i = 0; i < steps; i++) for (let k = 0; k < seg; k++) gb.q(id[i][k], id[i + 1][k], id[i + 1][k + 1], id[i][k + 1]);
  if (!closed) for (const [i, s] of [[0, -1], [steps, 1]]) {
    const p = curve.getPointAt(i / steps), t = curve.getTangentAt(i / steps).multiplyScalar(s);
    const c = gb.v(p, t, [0, 0], col), ring = [];
    for (let k = 0; k < seg; k++) ring.push(gb.v(V(gb.p[id[i][k] * 3], gb.p[id[i][k] * 3 + 1], gb.p[id[i][k] * 3 + 2]), t, [0, 0], col));
    for (let k = 0; k < seg; k++) gb.t(c, ring[k], ring[(k + 1) % seg]);
  }
}
// a flat raised ribbon along a polyline [[x, y]...] in the plane z (facing +z):
// width w, standing d proud (front face and its two edges; mitred joints)
function ribbon(gb, pts, z, w, d, col) {
  const n = pts.length, P = pts.map(([x, y]) => new THREE.Vector2(x, y)), off = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], t = b.clone().sub(a).normalize(), nn = new THREE.Vector2(-t.y, t.x);
    let k = 1;
    if (i > 0 && i < n - 1) { const t0 = P[i].clone().sub(P[i - 1]).normalize(), n0 = new THREE.Vector2(-t0.y, t0.x); k = 1 / Math.max(0.35, nn.dot(n0)); }
    off.push(nn.multiplyScalar(w / 2 * k));
  }
  const L = (i, s, zz) => V(P[i].x + off[i].x * s, P[i].y + off[i].y * s, zz);
  for (let i = 0; i + 1 < n; i++) {
    gb.q(gb.v(L(i, -1, z + d), V(0, 0, 1), [0, 0], col), gb.v(L(i + 1, -1, z + d), V(0, 0, 1), [0, 0], col), gb.v(L(i + 1, 1, z + d), V(0, 0, 1), [0, 0], col), gb.v(L(i, 1, z + d), V(0, 0, 1), [0, 0], col));
    for (const s of [-1, 1]) { const e = V(off[i].x * s, off[i].y * s, 0).normalize(); gb.q(gb.v(L(i, s, z), e, [0, 0], col), gb.v(L(i + 1, s, z), e, [0, 0], col), gb.v(L(i + 1, s, z + d), e, [0, 0], col), gb.v(L(i, s, z + d), e, [0, 0], col)); }
  }
}
// a box from its centre, size and turn about y, into a builder (hard faces)
function gbBox(gb, cx, cy, cz, w, h, d, col, ry = 0, faces = 'all') {
  const c = Math.cos(ry), s = Math.sin(ry), T = (x, y, z) => V(cx + x * c + z * s, cy + y, cz - x * s + z * c), Rn = (x, y, z) => V(x * c + z * s, y, -x * s + z * c);
  const hw = w / 2, hh = h / 2, hd = d / 2, cols = typeof col === 'function' ? col : () => col;
  const F = [[[1, 0, 0], [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]]], [[-1, 0, 0], [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]]],
    [[0, 1, 0], [[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]]], [[0, -1, 0], [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]]],
    [[0, 0, 1], [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]]], [[0, 0, -1], [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]]]];
  F.forEach(([n, q], fi) => {
    if (faces !== 'all' && !faces.includes(fi)) return;
    const nn = Rn(...n), ids = q.map(([x, y, z], k) => gb.v(T(x, y, z), nn, [[0, 0], [1, 0], [1, 1], [0, 1]][k], cols(fi, y)));
    gb.q(...ids);
  });
}

// ---------- materials ----------
const BASE = (k) => O.flat(k);
// a painted mark that sits on another surface (the dome's highlight): its own
// material with a polygon offset (the bake names it _decal, lifted in the
// native toon shader; outline.js leaves it without ink)
function decalMat(col) {
  const m = toon(col, { cel: BUILD });
  m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -6;
  return m;
}
const DECALS = new Map();
const decal = (col) => { if (!DECALS.has(col)) DECALS.set(col, decalMat(col)); return DECALS.get(col); };
// painted pictures (neutral, tinted by the material)
const paving = (col) => O.tinted(col, O.paint('v_paving', 256, 256, (x, w, h, R) => {
  x.fillStyle = O.shade(O.NEUTRAL_COL, 1.0); x.fillRect(0, 0, w, h);
  const n = 4, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    x.fillStyle = O.shade(O.NEUTRAL_COL, 0.94 + R() * 0.1); x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(i * s + 3, j * s + 3, s - 8, 3);
  }
  x.fillStyle = O.shade(O.NEUTRAL_COL, 0.78);
  for (let i = 0; i <= n; i++) { x.fillRect(i * s - 1.5, 0, 3, h); x.fillRect(0, i * s - 1.5, w, 3); }
}));
// ashlar: big squared blocks in courses with thin pale joints (2 x 2 m)
const ashlar = (col) => O.tinted(col, O.paint('v_ashlar', 256, 256, (x, w, h, R) => {
  x.fillStyle = O.shade(O.NEUTRAL_COL, 1.16); x.fillRect(0, 0, w, h);
  const rows = 7, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let px = r % 2 ? -36 : 0;
    while (px < w) {
      const bw = 64 + Math.floor(R() * 2) * 16;
      x.fillStyle = O.shade(O.NEUTRAL_COL, 0.9 + R() * 0.14); x.fillRect(px + 2, r * rh + 2, bw - 4, rh - 4);
      x.fillStyle = 'rgba(255,255,255,.22)'; x.fillRect(px + 3, r * rh + 3, bw - 7, 2.5);
      x.fillStyle = 'rgba(0,0,0,.07)'; x.fillRect(px + 3, r * rh + rh - 6, bw - 7, 3);
      px += bw;
    }
    if (px - w > 0) { /* wraps */ }
  }
}));
// the carved relief behind the fountain: swirling clouds and waves cut in
// blue-grey stone, darker hollows and light ridges (one picture, 4:1)
const relief = () => O.paint('v_relief', 512, 128, (x, w, h, R) => {
  x.fillStyle = '#5d6b92'; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 60; k++) {
    const cx = R() * w, cy = R() * h, r = 8 + R() * 26;
    x.strokeStyle = R() < 0.5 ? '#36426a' : '#46527a'; x.lineWidth = 4 + R() * 6;
    x.beginPath(); x.arc(cx, cy, r, R() * 6, R() * 6 + 3 + R() * 2); x.stroke();
    x.strokeStyle = '#a9b4d4'; x.lineWidth = 2; x.beginPath(); x.arc(cx - 1.5, cy - 2, r, R() * 6, R() * 6 + 2); x.stroke();
  }
  for (let k = 0; k < 7; k++) {   // waves along the foot
    x.strokeStyle = '#b8c2e0'; x.lineWidth = 3; x.beginPath();
    for (let i = 0; i <= 40; i++) { const px = i / 40 * w, py = h * 0.62 + k * 6 + Math.sin(i * 0.9 + k) * 6; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
  }
  x.strokeStyle = '#3e4a6c'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
}, false);
// still water in a basin: a deep-to-light gradient with painted ripples and glints
const waterTex = () => O.paint('v_water', 256, 256, (x, w, h, R) => {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#63b4e6'); g.addColorStop(1, '#3d8fd0');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 26; k++) { x.strokeStyle = `rgba(230,248,255,${0.25 + R() * 0.35})`; x.lineWidth = 2 + R() * 2; const cx = R() * w, cy = R() * h; x.beginPath(); x.ellipse(cx, cy, 14 + R() * 30, 3 + R() * 4, 0, 0, Math.PI); x.stroke(); }
});

// ---------- clipped shrubs (instanced leaf-card models) ----------
// dense small cards hugging a clipped shape, so it reads as a trimmed shrub
function clipped(kind, seed) {
  const R = rng(seed), out = cards(), tiles = [TILE.bushA, TILE.bushB, TILE.leafC];
  let n = 0, centre;
  const at = (p, nrm, s) => { pushCard(out, p, nrm.clone().lerp(V(R() - 0.5, R() - 0.5, R() - 0.5), 0.2).normalize(), s, tiles[Math.floor(R() * 3)], R() * TAU, centre, 0.15); n++; };
  if (kind === 'ball') {
    centre = V(0, 0.55, 0);
    for (let i = 0; i < 90; i++) {
      const u = R() * 2 - 1, a = R() * TAU, rr = Math.sqrt(1 - u * u), d = V(rr * Math.cos(a), u * 0.9 + 0.1, rr * Math.sin(a)).normalize();
      out.ao = Math.min(1, 0.55 + (d.y + 1) * 0.24);
      at(centre.clone().add(V(d.x * 0.62, d.y * 0.52, d.z * 0.62).multiplyScalar(0.86 + R() * 0.16)), d, 0.34 + R() * 0.14);
    }
  } else if (kind === 'cone') {
    // a tall clipped cone on a short trunk (the trunk is hidden by the planter rim)
    const H = 3.1, r0 = 0.92, y0 = 0.35;
    centre = V(0, y0 + H * 0.35, 0);
    for (let i = 0; i < 190; i++) {
      const t = Math.pow(R(), 0.8), y = y0 + t * H, r = r0 * (1 - t) * (0.9 + R() * 0.14) + 0.04, a = R() * TAU;
      const d = V(Math.cos(a), r0 / H * 1.2, Math.sin(a)).normalize();
      out.ao = Math.min(1, 0.5 + t * 0.4 + d.y * 0.2);
      at(V(Math.cos(a) * r, y, Math.sin(a) * r), d, 0.3 + (1 - t) * 0.16);
    }
  } else {   // 'hedge': a clipped box hedge 1 x 0.7 x 1 (scaled by the instance)
    centre = V(0, 0.3, 0);
    for (let i = 0; i < 70; i++) {
      const f = Math.floor(R() * 5), u = R() - 0.5, v = R() - 0.5;
      const [p, nrm] = f === 0 ? [V(u, 0.62, v), V(0, 1, 0)] : f === 1 ? [V(0.5, 0.3 + v * 0.6, u), V(1, 0.2, 0)] : f === 2 ? [V(-0.5, 0.3 + v * 0.6, u), V(-1, 0.2, 0)] : f === 3 ? [V(u, 0.3 + v * 0.6, 0.5), V(0, 0.2, 1)] : [V(u, 0.3 + v * 0.6, -0.5), V(0, 0.2, -1)];
      out.ao = f === 0 ? 1 : 0.7 + v * 0.4;
      at(p, nrm.normalize(), 0.32 + R() * 0.12);
    }
  }
  out.ao = 1;
  // a solid core under the cards: the trimmed mass shows through the gaps and
  // gives the shrub its clean, clipped outline
  let core;
  if (kind === 'ball') core = new THREE.IcosahedronGeometry(1, 2).scale(0.54, 0.45, 0.54).translate(0, 0.55, 0);
  else if (kind === 'cone') core = new THREE.ConeGeometry(0.82, 3.0, 12, 3).translate(0, 0.35 + 1.5, 0);
  else core = new THREE.BoxGeometry(0.9, 0.56, 0.9, 2, 1, 2).translate(0, 0.3, 0);
  { core.deleteAttribute('normal'); core = mergeVertices(core, 1e-4); const p = core.attributes.position, R2 = rng(seed + 9);
    const ph = R2() * 6; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.05 * Math.sin(x * 7 + ph) * Math.cos(z * 6 + y * 5); p.setXYZ(i, x * k, y, z * k); }
    core.computeVertexNormals(); }
  return { geometry: toGeometry(out), material: leafMaterial('#ffffff', 0.012), cards: n, core };
}
const SHRUBS = new Map();
const shrub = (kind) => { if (!SHRUBS.has(kind)) SHRUBS.set(kind, clipped(kind, { ball: 7101, cone: 7102, hedge: 7103 }[kind])); return SHRUBS.get(kind); };
// copies: [[x, y, z, ry, s, sy?]]
function plants(P, kind, list) {
  if (!list.length) return null;
  const m = shrub(kind), im = new THREE.InstancedMesh(m.geometry, m.material, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  list.forEach(([x, y, z, ry, s, sy, sz], i) => { q.setFromAxisAngle(V(0, 1, 0), ry || 0); m4.compose(V(x, y, z), q, V(s, sy || s, sz || s)); im.setMatrixAt(i, m4); });
  im.castShadow = true; im.receiveShadow = true; im.userData.outline = false;
  P.add(im);
  const ic = new THREE.InstancedMesh(m.core, O.flat(kind === 'cone' ? '#3f7f36' : '#468a3a'), list.length);
  for (let i = 0; i < list.length; i++) { im.getMatrixAt(i, m4); ic.setMatrixAt(i, m4); }
  ic.castShadow = true; ic.receiveShadow = true; ic.userData.outline = 'solid';
  P.add(ic);
  return im;
}

// ---------- levels of detail ----------
// Fold every plain colour of a level into the vertex-colour material, merge it
// by material into one mesh each, cut the parts' ink edges against each other
// (outline.js partEdges, kept for addEdgeLines as the level's inkEdges), name
// the merged meshes for the native game's swap.
function mergeLevel(src, name, { ink = true, layer = 0, shadow = true } = {}) {
  O.foldFlat(src);
  src.updateMatrixWorld(true);
  const L = new THREE.Group(); L.name = name; L.userData.keep = true; L.userData.lod = name.slice(0, 4);
  const groups = new Map(), parts = [], inst = [];
  src.traverse((o) => {
    if (o.isInstancedMesh) { inst.push(o); return; }
    if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (o.material.vertexColors && !g.attributes.color) { const c = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    if (!o.material.vertexColors && g.attributes.color) g.deleteAttribute('color');
    if (o.userData.tint && g.attributes.color) { const c = g.attributes.color, t = o.userData.tint; for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * t.r, c.getY(i) * t.g, c.getZ(i) * t.b); }
    g.applyMatrix4(o.matrixWorld);
    const cast = shadow && o.castShadow, key = o.material.uuid + (cast ? 's' : '');
    if (!groups.has(key)) groups.set(key, { mat: o.material, cast, list: [] });
    groups.get(key).list.push(g);
    if (ink && o.userData.outline !== false && !inkSkip(o.material)) parts.push({ g: o.geometry, m: o.matrixWorld.clone() });
  });
  let k = 0, tris = 0;
  for (const { mat, cast, list } of groups.values()) {
    const g = mergeGeometries(list, false);
    const m = new THREE.Mesh(g, mat);
    m.name = `${name}_${k++}`; m.castShadow = cast; m.receiveShadow = true;
    m.userData.lod = L.userData.lod;
    if (!ink) m.userData.outline = false;
    m.layers.set(layer);
    tris += g.attributes.position.count / 3;
    L.add(m);
  }
  if (ink && parts.length) {
    const solids = parts.map((p) => inkSolid(p.g, p.m)), all = { pos: [], n1: [], n2: [], k: [] };
    parts.forEach((p, i) => { const e = partEdges(p.g, p.m, solids, i); for (const kk of ['pos', 'n1', 'n2', 'k']) for (const x of e[kk]) all[kk].push(x); });
    L.userData.inkEdges = all;
  }
  // instanced plants stay as they are (the bake makes them town plants)
  for (const o of inst) { o.updateMatrix(); const c = o.clone(); c.matrix.copy(o.matrixWorld); c.matrix.decompose(c.position, c.quaternion, c.scale); L.add(c); }
  L.userData.tris = tris;
  return L;
}
function pack(id, near, far) {
  const G = new THREE.Group(); G.name = id;
  const N = mergeLevel(near, 'lodN_' + id), F = mergeLevel(far, 'lodF_' + id, { ink: false, layer: 3, shadow: false });
  F.userData.outline = false;
  G.add(N, F);
  G.userData.lod = { near: N.userData.tris, far: F.userData.tris, swap: LOD_SWAP };
  return G;
}

// ---------- placing into a town ----------
export function place(world, G, x, y, z, rot = 0) {
  G.position.set(x, y, z); G.rotation.y = rot; world.group.add(G);
  const c = Math.cos(rot), s = Math.sin(rot), W = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const u = G.userData;
  for (const k of u.colliders || []) {
    const [wx, wz] = W(k.x, k.z);
    world.colliders.push(k.r !== undefined ? { x: wx, z: wz, r: k.r } : { box: true, x: wx, z: wz, hw: k.hw, hd: k.hd, rot: (k.rot || 0) + rot });
  }
  for (const d of u.walk || []) { const [wx, wz] = W(d.x, d.z); world.walk.push({ x: wx, z: wz, hw: d.hw, hd: d.hd, rot: (d.rot || 0) + rot, y: y + d.y }); }
  if (world.noVeg && u.foot) world.noVeg.push({ box: true, x, z, hw: u.foot.hw, hd: u.foot.hd, rot });
  const out = {};
  for (const [k, [mx, my, mz, yaw]] of Object.entries(u.markers || {})) { const [wx, wz] = W(mx, mz); out[k] = [+wx.toFixed(3), +(y + my).toFixed(3), +wz.toFixed(3), +((yaw || 0) + rot).toFixed(4)]; }
  return out;
}

// =====================================================================
//                         THE POKéMON CENTER
// =====================================================================
const PC = {
  RT: 16.6, TY: 0.45, STEP: 0.15, TREAD: 0.42,          // terrace radius and top, stair steps
  RY: 5.4, GLASS: 3.35,                                  // roof deck top, glass band top
  C1: [-3.6, 1.2, 8.6],                                  // the front-left lobe: centre x, z, radius
  S: V(2.4, 3.4, -3.6), RS: 10.2,                        // the shell's sphere
  D: V(1.8, 4.6, -3.0), RD: 7.0,                         // the dome
  B0: 12, B1: 305,                                       // the shell's span (degrees round S, 0 = front, 90 = east)
  white: '#f7f5ef', white2: '#e9e6dd', red: '#d8222a', redD: '#9e141c', blue: '#2f7fd0', blueL: '#64b0ec', glassPale: '#cfe8f4',
  rib: '#f4f6f8', planter: '#c2735a', planterCap: '#efe9dc', terrace: '#ebe7df', stairs: '#e3ded4', lampCol: '#3d6a8a',
  // openings in the terrace's edge (degrees round the origin, 0 = front, 90 = east)
  gaps: [[-50, -28, 'stairs'], [-11, 11, 'ramp'], [28, 48, 'stairs'], [93, 112, 'way'], [-118, -98, 'stairs']],
};
const rad = (d) => d * Math.PI / 180;
// the body's plan: a smooth union of the front-left lobe and the shell's circle
function pcPlan(r2 = 9.7, n = 120) {
  const [ax, az, ar] = PC.C1, bx = PC.S.x, bz = PC.S.z, k = 1.6;
  // polar march round a point inside both: distance where the smooth-min field crosses 0
  const cx = (ax + bx) / 2, cz = (az + bz) / 2, f = (x, z) => {
    const a = Math.hypot(x - ax, z - az) - ar, b = Math.hypot(x - bx, z - bz) - r2;
    const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
    return lerp(b, a, h) - k * h * (1 - h);
  };
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / n * TAU, dx = Math.sin(t), dz = Math.cos(t);
    let lo = 0, hi = 20;
    for (let s = 0; s < 40; s++) { const m = (lo + hi) / 2; if (f(cx + dx * m, cz + dz * m) < 0) lo = m; else hi = m; }
    pts.push([cx + dx * lo, cz + dz * lo]);
  }
  return ccw(pts);
}
// the shell: a point on its sphere at azimuth b (deg round S) and height y
const shellAt = (b, y, r = PC.RS) => { const h = Math.sqrt(Math.max(0, r * r - (y - PC.S.y) ** 2)), a = rad(b); return V(PC.S.x + Math.sin(a) * h, y, PC.S.z + Math.cos(a) * h); };
// the rim's height along the shell (Catmull-Rom through hand-placed keys)
const RIM = [[PC.B0, PC.TY], [38, 7.2], [72, 10.9], [112, 12.3], [165, 12.1], [215, 10.8], [255, 8.6], [282, 6.9], [PC.B1, PC.RY + 0.2]];
function rimY(b) {
  const K = RIM; let i = 0;
  while (i < K.length - 2 && b > K[i + 1][0]) i++;
  const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(K.length - 1, i + 2)], t = (b - p1[0]) / (p2[0] - p1[0]);
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
}
// where the shell, coming round from the back, passes over the front-left lobe
// (there it stops coming down to the ground and lands on the roof instead)
function shellBT() {
  const [ax, az, ar] = PC.C1;
  for (let b = 180; b < PC.B1; b += 0.25) { const p = shellAt(b, PC.RY); if (Math.hypot(p.x - ax, p.z - az) < ar - 0.15) return b; }
  return PC.B1 - 20;
}
const inGap = (a, m = 0) => PC.gaps.find(([a0, a1]) => a >= a0 - m && a <= a1 + m);

export function pokemonCenter({ id = 'pkc' } = {}) {
  const near = new THREE.Group(), far = new THREE.Group();
  const { TY, RY, RT, GLASS } = PC;
  const plan = pcPlan(9.7), roofPlan = pcPlan(10.05), inner = offsetCurve(plan, -0.9);
  const BT = shellBT();
  const markers = {}, colliders = [], walk = [];

  // ---------- the terrace: a round deck with a low white wall, its stairs and ramp ----------
  {
    const gb = new THREE.Group(); near.add(gb);
    const N = 160, ring = [], foot = [];
    for (let i = 0; i < N; i++) { const a = i / N * TAU; ring.push([Math.sin(a) * RT, Math.cos(a) * RT]); foot.push([Math.sin(a) * (RT - 0.02), Math.cos(a) * (RT - 0.02)]); }
    const deck = new GB();
    capCurve(deck, ccw(ring), TY, '#ffffff', true);
    vcMesh(gb, deck, { mat: pic(paving(PC.terrace)), line: false });
    // the deck's edge: a white curb band (coping) round the rim, the wall down to below the ground
    // (open arcs between the gaps: the stairs and the ramp have their own edges)
    const w = new GB(), g2 = PC.gaps.map(([p, q]) => [p, q]).sort((p, q) => p[0] - q[0]);
    for (let i = 0; i < g2.length; i++) {
      const a0 = g2[i][1], a1 = i + 1 < g2.length ? g2[i + 1][0] : g2[0][0] + 360, n = Math.max(2, Math.round((a1 - a0) / 2.2));
      const at = (k, r, y) => { const a = rad(lerp(a0, a1, k / n)); return V(Math.sin(a) * r, y, Math.cos(a) * r); };
      const nr = (k) => { const a = rad(lerp(a0, a1, k / n)); return V(Math.sin(a), 0, Math.cos(a)); };
      for (let k = 0; k < n; k++) {
        // the wall down to below the ground, the coping's face, its top
        w.q(w.v(at(k, RT, -0.5), nr(k), [0, 0], '#d9d4c8'), w.v(at(k + 1, RT, -0.5), nr(k + 1), [0, 0], '#d9d4c8'), w.v(at(k + 1, RT, TY - 0.08), nr(k + 1), [0, 0], PC.white2), w.v(at(k, RT, TY - 0.08), nr(k), [0, 0], PC.white2));
        w.q(w.v(at(k, RT + 0.08, TY - 0.1), nr(k), [0, 0], PC.white), w.v(at(k + 1, RT + 0.08, TY - 0.1), nr(k + 1), [0, 0], PC.white), w.v(at(k + 1, RT + 0.08, TY + 0.06), nr(k + 1), [0, 0], PC.white), w.v(at(k, RT + 0.08, TY + 0.06), nr(k), [0, 0], PC.white));
        const up = V(0, 1, 0);
        w.q(w.v(at(k, RT + 0.08, TY + 0.06), up, [0, 0], PC.white), w.v(at(k + 1, RT + 0.08, TY + 0.06), up, [0, 0], PC.white), w.v(at(k + 1, RT - 0.3, TY + 0.06), up, [0, 0], PC.white), w.v(at(k, RT - 0.3, TY + 0.06), up, [0, 0], PC.white));
        w.q(w.v(at(k, RT - 0.3, TY - 0.01), nr(k).negate(), [0, 0], PC.white2), w.v(at(k + 1, RT - 0.3, TY - 0.01), nr(k + 1).negate(), [0, 0], PC.white2), w.v(at(k + 1, RT - 0.3, TY + 0.06), nr(k + 1).negate(), [0, 0], PC.white2), w.v(at(k, RT - 0.3, TY + 0.06), nr(k).negate(), [0, 0], PC.white2));
      }
      for (const [k, s] of [[0, -1], [n, 1]]) { const a = rad(lerp(a0, a1, k / n)), t = V(Math.cos(a) * s, 0, -Math.sin(a) * s); w.q(w.v(at(k, RT - 0.3, TY - 0.01), t), w.v(at(k, RT + 0.08, TY - 0.1), t), w.v(at(k, RT + 0.08, TY + 0.06), t, [0, 0], PC.white), w.v(at(k, RT - 0.3, TY + 0.06), t, [0, 0], PC.white)); }
    }
    vcMesh(gb, w);
    // walk: the deck as strips (the building's colliders keep people out of it)
    for (let z = -RT + 1; z < RT; z += 2) { const hw = Math.sqrt(Math.max(0, RT * RT - (Math.abs(z) + 1) ** 2)) - 0.2; if (hw > 0.5) walk.push({ x: 0, z, hw, hd: 1.0, rot: 0, y: TY + 0.02 }); }
  }
  // curved stairs: three steps down off the rim in each stairs gap
  const stepsOut = (a0, a1) => {
    const gb = new GB(), n = Math.max(6, Math.round((a1 - a0) / 2.5));
    for (let k = 0; k < 3; k++) {
      const r0 = RT + k * PC.TREAD - 0.02, r1 = RT + (k + 1) * PC.TREAD, y = TY - (k + 1) * PC.STEP;
      const A = [], B = [], C = [];
      for (let i = 0; i <= n; i++) {
        const a = rad(lerp(a0, a1, i / n)), sx = Math.sin(a), sz = Math.cos(a);
        A.push(gb.v(V(sx * r0, y, sz * r0), V(0, 1, 0), [sx * r0 * 0.5, sz * r0 * 0.5], PC.stairs));
        B.push(gb.v(V(sx * r1, y, sz * r1), V(0, 1, 0), [sx * r1 * 0.5, sz * r1 * 0.5], PC.stairs));
        C.push([gb.v(V(sx * r1, y, sz * r1), V(sx, 0, sz), [i, 0], PC.white), gb.v(V(sx * r1, y - PC.STEP - 0.4, sz * r1), V(sx, 0, sz), [i, 1], '#d9d4c8')]);
      }
      for (let i = 0; i < n; i++) { gb.q(A[i], A[i + 1], B[i + 1], B[i]); gb.q(C[i][0], C[i + 1][0], C[i + 1][1], C[i][1]); }
      // walk: a box per few degrees per step
      for (let i = 0; i < n; i += 2) { const am = rad(lerp(a0, a1, (i + 1) / n)), rm = (r0 + r1) / 2; walk.push({ x: Math.sin(am) * rm, z: Math.cos(am) * rm, hw: rm * rad((a1 - a0) / n) * 1.1 + 0.05, hd: PC.TREAD / 2, rot: am, y: y + 0.02 }); }
    }
    // the side ends: white cheek blocks
    for (const a of [a0, a1]) {
      const am = rad(a), c = RT + 1.5 * PC.TREAD, sx = Math.sin(am), sz = Math.cos(am);
      gbBox(gb, sx * c, (TY - 0.5) / 2 + 0.03, sz * c, 0.36, TY + 0.5 + 0.06, 3 * PC.TREAD + 0.04, PC.white, am);
      colliders.push({ box: true, x: sx * c, z: sz * c, hw: 0.2, hd: 1.4 * PC.TREAD, rot: am });
    }
    vcMesh(near, gb);
  };
  for (const [a0, a1, k] of PC.gaps) if (k === 'stairs') stepsOut(a0, a1);
  // the side way's stairs (east): straight steps down under the covered way
  {
    const gb = new GB(), z0 = -5.4, z1 = -1.8, x0 = Math.sqrt(RT * RT - 5.4 * 5.4) - 0.3;
    for (let k = 0; k < 3; k++) {
      const xa = x0 + k * PC.TREAD, y = TY - (k + 1) * PC.STEP;
      gbBox(gb, xa + PC.TREAD / 2, (y - 0.5) / 2, (z0 + z1) / 2, PC.TREAD + 0.01, y + 0.5, z1 - z0, (f) => (f === 2 ? PC.stairs : f === 0 ? PC.white : '#d9d4c8'));
      walk.push({ x: xa + PC.TREAD / 2, z: (z0 + z1) / 2, hw: PC.TREAD / 2 + 0.02, hd: (z1 - z0) / 2, rot: 0, y: y + 0.02 });
    }
    for (const z of [z0 - 0.18, z1 + 0.18]) { gbBox(gb, x0 + 1.0, (TY - 0.5) / 2 + 0.03, z, 2.6, TY + 0.56, 0.36, PC.white); colliders.push({ box: true, x: x0 + 1.0, z, hw: 1.3, hd: 0.18 }); }
    vcMesh(near, gb);
  }
  // the ramp to the doors: 6.4 m wide, from the rim down to the plaza (1 : 7)
  {
    const gb = new GB(), hw = 3.2, z0 = Math.sqrt(RT * RT - hw * hw) - 0.4, z1 = 19.7, L = z1 - z0;
    const top = (z) => TY * (1 - (z - z0) / L);
    const pts = [V(-hw, top(z0), z0), V(hw, top(z0), z0), V(hw, 0.0, z1), V(-hw, 0.0, z1)], n = V(0, L, TY).normalize();
    gb.q(...pts.map((p) => gb.v(p, n, [p.x * 0.5, p.z * 0.5], PC.stairs)));
    // grooves across the ramp (a non-slip finish): thin raised strips
    for (let z = z0 + 0.6; z < z1 - 0.2; z += 0.55) gbBox(gb, 0, top(z) + 0.012, z, hw * 2 - 0.3, 0.03, 0.08, PC.white2);
    // its curbs, sloping with it
    for (const s of [-1, 1]) {
      const a = gb.v(V(s * (hw + 0.25), top(z0) + 0.12, z0), V(s, 0, 0), [0, 0], PC.white), b = gb.v(V(s * (hw + 0.25), 0.12, z1), V(s, 0, 0), [1, 0], PC.white);
      const c = gb.v(V(s * (hw + 0.25), -0.3, z1), V(s, 0, 0), [1, 1], '#d9d4c8'), d = gb.v(V(s * (hw + 0.25), -0.3, z0), V(s, 0, 0), [0, 1], '#d9d4c8');
      gb.q(a, b, c, d);
      const a2 = gb.v(V(s * hw, top(z0) + 0.12, z0), V(0, 1, 0), [0, 0], PC.white), b2 = gb.v(V(s * hw, 0.12, z1), V(0, 1, 0), [0, 0], PC.white);
      const a3 = gb.v(V(s * (hw + 0.25), top(z0) + 0.12, z0), V(0, 1, 0), [0, 0], PC.white), b3 = gb.v(V(s * (hw + 0.25), 0.12, z1), V(0, 1, 0), [0, 0], PC.white);
      gb.q(a2, b2, b3, a3);
      const a4 = gb.v(V(s * hw, top(z0) + 0.12, z0), V(-s, 0, 0), [0, 0], PC.white), b4 = gb.v(V(s * hw, 0.12, z1), V(-s, 0, 0), [0, 0], PC.white);
      const c4 = gb.v(V(s * hw, 0.0, z1), V(-s, 0, 0), [0, 0], PC.white), d4 = gb.v(V(s * hw, top(z0), z0), V(-s, 0, 0), [0, 0], PC.white);
      gb.q(a4, b4, c4, d4);
      colliders.push({ box: true, x: s * (hw + 0.12), z: (z0 + z1) / 2, hw: 0.14, hd: L / 2 });
    }
    // under the ramp's sides: the terrace wall continues as a wedge
    for (let i = 0; i < 6; i++) { const z = z0 + (i + 0.5) / 6 * L; walk.push({ x: 0, z, hw, hd: L / 12 + 0.03, rot: 0, y: top(z) + 0.02 }); }
    vcMesh(near, gb);
  }
  // ---------- planters on the rim with clipped shrubs, two by the doors ----------
  {
    const gb = new GB(), balls = [], hedges = [], cones = [];
    const PH = 0.62, PW = 1.25;
    const arcs = [];   // [a0, a1] between the gaps (degrees), with margins
    const g = PC.gaps.map(([a, b]) => [a, b]).sort((p, q) => p[0] - q[0]);
    for (let i = 0; i < g.length; i++) { const a0 = g[i][1] + 1.2, a1 = (i + 1 < g.length ? g[i + 1][0] : g[0][0] + 360) - 1.2; if (a1 > a0 + 2) arcs.push([a0, a1]); }
    for (const [a0, a1] of arcs) {
      // split long runs into planters of about 9 m with a 1.2 m path between
      const L = rad(a1 - a0) * (RT - PW / 2), n = Math.max(1, Math.round(L / 10)), step = (a1 - a0) / n, gapA = 1.3 / (RT - PW / 2) * 180 / Math.PI;
      for (let k = 0; k < n; k++) {
        const b0 = a0 + k * step + (k ? gapA / 2 : 0), b1 = a0 + (k + 1) * step - (k < n - 1 ? gapA / 2 : 0), m = Math.max(4, Math.round((b1 - b0) / 2));
        const ro = RT - 0.32, ri = ro - PW, outerP = [], innerP = [];
        for (let i = 0; i <= m; i++) { const a = rad(lerp(b0, b1, i / m)); outerP.push([Math.sin(a) * ro, Math.cos(a) * ro]); innerP.push([Math.sin(a) * ri, Math.cos(a) * ri]); }
        // the box: terracotta walls, a pale cap, earth in the top
        const wall = (pts, out) => {
          for (let i = 0; i < m; i++) {
            const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], am = rad(lerp(b0, b1, (i + 0.5) / m)), nn = V(Math.sin(am) * out, 0, Math.cos(am) * out);
            const ids = [[x0, TY - 0.02, z0], [x1, TY - 0.02, z1], [x1, TY + PH - 0.08, z1], [x0, TY + PH - 0.08, z0]].map(([x, y, z], j) => gb.v(V(x, y, z), nn, [j % 2, j > 1 ? 1 : 0], j > 1 ? PC.planter : O.shade(PC.planter, 0.86)));
            gb.q(...ids);
          }
        };
        wall(outerP, 1); wall(innerP, -1);
        // ends
        for (const [a, s] of [[b0, -1], [b1, 1]]) { const am = rad(a), nn = V(Math.cos(am) * s, 0, -Math.sin(am) * s); const p = [[ro, TY - 0.02], [ri, TY - 0.02], [ri, TY + PH - 0.08], [ro, TY + PH - 0.08]].map(([r, y]) => gb.v(V(Math.sin(am) * r, y, Math.cos(am) * r), nn, [0, 0], PC.planter)); gb.q(...p); }
        // the cap: a pale coping all round, a little proud
        const capO = [], capI = [], earthO = [], earthI = [];
        for (let i = 0; i <= m; i++) { const a = rad(lerp(b0, b1, i / m)); capO.push([Math.sin(a) * (ro + 0.06), Math.cos(a) * (ro + 0.06)]); capI.push([Math.sin(a) * (ri - 0.06), Math.cos(a) * (ri - 0.06)]); earthO.push([Math.sin(a) * (ro - 0.16), Math.cos(a) * (ro - 0.16)]); earthI.push([Math.sin(a) * (ri + 0.16), Math.cos(a) * (ri + 0.16)]); }
        const cy = TY + PH;
        const capBand = (A, B, y, col) => { for (let i = 0; i < m; i++) { const ids = [A[i], A[i + 1], B[i + 1], B[i]].map(([x, z]) => gb.v(V(x, y, z), V(0, 1, 0), [x * 0.5, z * 0.5], col)); gb.q(...ids); } };
        capBand(capO, earthO, cy, PC.planterCap); capBand(earthI, capI, cy, PC.planterCap); capBand(earthO, earthI, cy - 0.1, '#6b4a34');
        for (const [P2, s] of [[capO, 1], [capI, -1]]) for (let i = 0; i < m; i++) {
          const am = rad(lerp(b0, b1, (i + 0.5) / m)), nn = V(Math.sin(am) * s, 0, Math.cos(am) * s), [x0, z0] = P2[i], [x1, z1] = P2[i + 1];
          gb.q(...[[x0, cy - 0.08, z0], [x1, cy - 0.08, z1], [x1, cy, z1], [x0, cy, z0]].map(([x, y, z]) => gb.v(V(x, y, z), nn, [0, 0], PC.planterCap)));
        }
        for (const [a, s] of [[b0, -1], [b1, 1]]) { const am = rad(a), nn = V(Math.cos(am) * s, 0, -Math.sin(am) * s); const p = [[ro + 0.06, cy - 0.08], [ri - 0.06, cy - 0.08], [ri - 0.06, cy], [ro + 0.06, cy]].map(([r, y]) => gb.v(V(Math.sin(am) * r + Math.cos(am) * s * 0.0, y, Math.cos(am) * r), nn, [0, 0], PC.planterCap)); gb.q(...p); }
        // shrubs: a clipped hedge along it and round balls standing out of it
        const rm = (ro + ri) / 2, Lk = rad(b1 - b0) * rm;
        const nh = Math.max(1, Math.round(Lk / 1.05));
        for (let i = 0; i < nh; i++) { const a = rad(lerp(b0, b1, (i + 0.5) / nh)); hedges.push([Math.sin(a) * rm, cy - 0.12, Math.cos(a) * rm, a, 1.1, 0.75, PW * 0.78]); }
        const nb = Math.max(1, Math.floor(Lk / 3.2));
        for (let i = 0; i < nb; i++) { const a = rad(lerp(b0, b1, (i + 0.5) / nb)); balls.push([Math.sin(a) * rm, cy + 0.15, Math.cos(a) * rm, a, 1.15]); }
        // a collider per few metres
        for (let i = 0; i < m; i += 2) { const a = rad(lerp(b0, b1, (i + 1) / m)), w = rm * rad(b1 - b0) / m; colliders.push({ box: true, x: Math.sin(a) * rm, z: Math.cos(a) * rm, hw: w + 0.05, hd: PW / 2 + 0.06, rot: a }); }
      }
    }
    // two round planters by the doors, a clipped cone in each
    for (const sx of [-1, 1]) {
      const x = sx * 7.6, z = 12.3;
      lathe(gb, [[0.82, TY - 0.02], [0.92, TY + 0.66], [1.0, TY + 0.66], [1.0, TY + 0.78], [0.95, TY + 0.84], [0.8, TY + 0.84], [0.8, TY + 0.76]], 28, [PC.planter, PC.planterCap, PC.planterCap, PC.planterCap, PC.planterCap, PC.planterCap], { cx: x, cz: z });
      lathe(gb, [[0.8, TY + 0.76], [0.001, TY + 0.76]], 20, '#6b4a34', { cx: x, cz: z });
      cones.push([x, TY + 0.55, z, 0, 0.85]);
      colliders.push({ x, z, r: 1.0 });
    }
    vcMesh(near, gb);
    plants(near, 'hedge', hedges); plants(near, 'ball', balls); plants(near, 'cone', cones);
  }

  // ---------- the body: glass band behind white pillars, the white fascia, the roof ----------
  {
    const gb = new GB(), gl = new GB();
    const base = offsetCurve(plan, -0.95);
    // a white plinth under the glass, the glass band, a dark head rail over it
    wallBand(gb, base, TY - 0.2, TY + 0.32, PC.white2);
    // glass: panes between mullions, each pane its own 0..1 (the picture is one pane)
    {
      const n = base.length, Nn = curveNormals(base), y0 = TY + 0.32, y1 = GLASS;
      // panes: about 1.6 m each along the curve
      let acc = 0; const S = [0]; for (let i = 1; i <= n; i++) { const [a, b] = base[i - 1], [c, d] = base[i % n]; acc += Math.hypot(c - a, d - b); S.push(acc); }
      const pw = acc / Math.round(acc / 1.6);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, [x0, z0] = base[i], [x1, z1] = base[j], u0 = (S[i] % pw) / pw, u1 = u0 + (S[i + 1] - S[i]) / pw;
        const [nx0, nz0] = Nn[i], [nx1, nz1] = Nn[j];
        // (a pane that crosses its end splits at the mullion)
        if (u1 > 1.0001) {
          const t = (1 - u0) / (u1 - u0), xm = lerp(x0, x1, t), zm = lerp(z0, z1, t), nm = V(lerp(nx0, nx1, t), 0, lerp(nz0, nz1, t)).normalize();
          gl.q(gl.v(V(x0, y0, z0), V(nx0, 0, nz0), [u0, 0]), gl.v(V(xm, y0, zm), nm, [1, 0]), gl.v(V(xm, y1, zm), nm, [1, 1]), gl.v(V(x0, y1, z0), V(nx0, 0, nz0), [u0, 1]));
          gl.q(gl.v(V(xm, y0, zm), nm, [0, 0]), gl.v(V(x1, y0, z1), V(nx1, 0, nz1), [u1 - 1, 0]), gl.v(V(x1, y1, z1), V(nx1, 0, nz1), [u1 - 1, 1]), gl.v(V(xm, y1, zm), nm, [0, 1]));
        } else gl.q(gl.v(V(x0, y0, z0), V(nx0, 0, nz0), [u0, 0]), gl.v(V(x1, y0, z1), V(nx1, 0, nz1), [u1, 0]), gl.v(V(x1, y1, z1), V(nx1, 0, nz1), [u1, 1]), gl.v(V(x0, y1, z0), V(nx0, 0, nz0), [u0, 1]));
      }
      // mullions at each pane's end (thin white posts just proud of the glass)
      const mullion = (s) => {
        let i = 0; while (i < n - 1 && S[i + 1] < s) i++;
        const t = (s - S[i]) / Math.max(1e-6, S[i + 1] - S[i]), [x0, z0] = base[i], [x1, z1] = base[(i + 1) % n], x = lerp(x0, x1, t), z = lerp(z0, z1, t);
        const a = Math.atan2(Nn[i][0], Nn[i][1]);
        gbBox(gb, x + Nn[i][0] * 0.04, (y0 + y1) / 2, z + Nn[i][1] * 0.04, 0.09, y1 - y0, 0.08, PC.white, a);
      };
      for (let s = 0; s < acc - 0.01; s += pw) mullion(s);
      // a transom rail at 2.45 m
      wallBand(gb, offsetCurve(base, 0.04), TY + 2.42, TY + 2.52, PC.white);
    }
    vcMesh(near, gl, { mat: pic(O.glassTex(), '#9fd0f4'), line: false });
    // the soffit between the glass and the fascia's front, and the fascia band
    const top = plan, soff = new GB();
    ringCap(soff, top, base, GLASS, PC.white2, false);
    wallBand(soff, base, GLASS - 0.05, GLASS + 0.02, PC.white2);
    vcMesh(near, soff, { shadow: false });
    // the fascia: a thick white band, its lower edge slightly rounded out
    wallBand(gb, plan, GLASS, RY - 0.25, (t, x, z) => (t ? PC.white : PC.white2));
    wallBand(gb, offsetCurve(plan, 0.08), RY - 0.25, RY + 0.28, PC.white);
    wallBand(gb, offsetCurve(plan, 0.08), GLASS - 0.02, GLASS + 0.16, PC.white);
    ringCap(gb, offsetCurve(plan, 0.08), plan, GLASS + 0.16, PC.white, true);
    ringCap(gb, offsetCurve(plan, 0.08), plan, GLASS - 0.02, PC.white2, false);
    // the parapet's top and inner face, the roof deck inside it
    const parIn = offsetCurve(plan, -0.42);
    ringCap(gb, offsetCurve(plan, 0.08), parIn, RY + 0.28, PC.white, true);
    wallBand(gb, parIn, RY - 0.02, RY + 0.28, PC.white2, { inward: true });
    capCurve(gb, parIn, RY, '#e4e1da', true);
    // pillars: round, white, every ~3.2 m along the front of the glass
    {
      const n = plan.length; let acc = 0; const S = [0];
      for (let i = 1; i <= n; i++) { const [a, b] = plan[i - 1], [c, d] = plan[i % n]; acc += Math.hypot(c - a, d - b); S.push(acc); }
      const np = Math.round(acc / 3.3), Nn = curveNormals(plan);
      for (let k = 0; k < np; k++) {
        const s = (k + 0.5) * acc / np; let i = 0; while (i < n - 1 && S[i + 1] < s) i++;
        const t = (s - S[i]) / Math.max(1e-6, S[i + 1] - S[i]), x = lerp(plan[i][0], plan[(i + 1) % n][0], t) - Nn[i][0] * 0.45, z = lerp(plan[i][1], plan[(i + 1) % n][1], t) - Nn[i][1] * 0.45;
        // skip the pillars that would stand in the doors (front) or under the shell
        if (Math.abs(x) < 2.4 && z > 0) continue;
        { const b = ((Math.atan2(x - PC.S.x, z - PC.S.z) * 180 / Math.PI) + 360) % 360;
          if (Math.hypot(x - PC.S.x, z - PC.S.z) > 8.9 && Math.hypot(x - PC.C1[0], z - PC.C1[1]) > PC.C1[2] - 0.6 && b > PC.B0 - 4 && b < BT + 4) continue; }
        lathe(gb, [[0.001, TY], [0.3, TY], [0.3, TY + 0.12], [0.22, TY + 0.2], [0.2, GLASS - 0.12], [0.26, GLASS - 0.04], [0.26, GLASS + 0.02]], 14, PC.white, { cx: x, cz: z });
      }
    }
    vcMesh(near, gb);
    // the doors: a pair of glass sliding doors in a white frame, a mat, a canopy edge
    {
      const D = new GB(), dz = (() => { let best = -1e9; for (const [x, z] of base) if (Math.abs(x) < 1.6) best = Math.max(best, z); return best; })() + 0.02;
      const dw = 3.4, dh = 2.7;
      gbBox(D, 0, TY + dh / 2, dz + 0.06, dw + 0.4, dh + 0.2, 0.12, PC.white, 0, [0, 1, 2, 4]);
      for (const sx of [-1, 1]) { gbBox(D, sx * dw / 4, TY + dh / 2 - 0.05, dz + 0.13, dw / 2 - 0.16, dh - 0.25, 0.04, '#d9eef8'); gbBox(D, sx * 0.08, TY + 1.2, dz + 0.17, 0.05, 0.5, 0.05, '#8a96a6'); }
      gbBox(D, 0, TY + 0.01, dz + 1.1, dw, 0.02, 1.4, '#9a3a34');
      vcMesh(near, D);
      // a glass panel band over the doors, shown with the glass picture
      const gp = new GB(); gp.q(gp.v(V(-dw / 2, TY + 0.05, dz + 0.15), V(0, 0, 1), [0, 0]), gp.v(V(dw / 2, TY + 0.05, dz + 0.15), V(0, 0, 1), [1, 0]), gp.v(V(dw / 2, TY + dh - 0.18, dz + 0.15), V(0, 0, 1), [1, 1]), gp.v(V(-dw / 2, TY + dh - 0.18, dz + 0.15), V(0, 0, 1), [0, 1]));
      vcMesh(near, gp, { mat: pic(O.glassTex(), '#bfe2f6'), line: false });
      markers.door = [0, TY, dz + 1.0, Math.PI];
      markers.door_inside = [0, TY, dz - 1.5, 0];
      markers.bike = [3.6, TY, dz + 3.2, -Math.PI / 2];
      markers.ramp_foot = [0, 0, 20.5, Math.PI];
      // wall lamps either side
      for (const sx of [-1, 1]) { const L = BK.wallLamp(near); L.position.set(sx * (dw / 2 + 0.55), TY + 2.4, dz + 0.1); }
      // the red P on the white band over the doors
      const fz = (() => { let best = -1e9; for (const [x, z] of offsetCurve(plan, 0.08)) if (Math.abs(x) < 0.8) best = Math.max(best, z); return best; })();
      const P = pEmblem(1.3, 0.12); P.position.set(0, (GLASS + RY) / 2 + 0.02, fz + 0.01); near.add(P);
    }
    // the side door (east) under the covered way: in the shell
    markers.door_side = [shellAt(90, TY).x + 1.6, TY, shellAt(90, TY).z, -Math.PI / 2];
    // the body's colliders: the two circles (the shell's covers the east side)
    colliders.push({ x: PC.C1[0], z: PC.C1[1], r: PC.C1[2] - 0.6 }, { x: PC.S.x, z: PC.S.z, r: 9.95 });
    // the red P lying on the roof (front left), as in the picture
    { const P = pEmblem(3.6, 0.16, true); P.position.set(-6.5, RY + 0.01, 4.6); P.rotation.set(-Math.PI / 2, 0.42, 0, 'YXZ'); near.add(P); }
  }

  // ---------- the dome: glossy red, a painted highlight ----------
  {
    const gb = new GB(), D = PC.D, R = PC.RD, th = Math.acos((PC.RY - 0.3 - D.y) / R), rows = 22, cols = 56;
    const prof = [];
    for (let i = 0; i <= rows; i++) { const t = i / rows * th; prof.push([Math.sin(t) * R, Math.cos(t) * R]); }
    // shade toward the foot (a deeper red low down, as painted)
    const cs = prof.map(([, y]) => col3(PC.redD).lerp(col3(PC.red), sstep(-1.5, 2.5, y)));
    lathe(gb, prof.reverse(), cols, cs.reverse(), { smooth: true, cx: D.x, cz: D.z, cy: D.y });
    vcMesh(near, gb);
    // the highlight: a soft pink ring and a white core, toward the sun's side
    const hd = V(-0.42, 0.6, 0.68).normalize();
    const h1 = new GB(); spherePatch(h1, D, R + 0.02, hd, 0.2, 0.16, '#ffffff', 24);
    const h2 = new GB(); spherePatch(h2, D, R + 0.04, hd.clone().add(V(-0.03, 0.04, 0)).normalize(), 0.15, 0.115, '#ffffff', 24);
    for (const h of [h1, h2]) { const m = new THREE.Mesh(h.geo(), decal(h === h1 ? '#f2645e' : '#fffaf6')); m.geometry.deleteAttribute('color'); m.userData.outline = false; m.castShadow = false; near.add(m); }
    markers.perch_dome = [D.x, D.y + R, D.z, 0];
    const pd = D.clone().add(V(-0.5, 0.75, 0.42).normalize().multiplyScalar(R));
    markers.perch_dome_front = [pd.x, pd.y, pd.z, 0];
  }

  // ---------- the shell: blue glass from the ground at the front right, round the back, onto the roof ----------
  {
    const gb = new GB(), inner = new GB(), ribs = new GB(), pale = new GB();
    const rows = 14, eOf = (y) => Math.asin(Math.min(1, Math.max(-1, (y - PC.S.y) / PC.RS)));
    // blue part: from the ground up to the rim, B0 .. BT
    const nb = 72, blue = (b, t) => col3('#2a72c4').lerp(col3(PC.blueL), sstep(0.35, 1.0, t)).lerp(col3('#8cc8f2'), Math.max(0, Math.sin(rad(b) * 1.3 + 0.4)) * 0.18 * t);
    const part = (G0, b0, b1, n, r, out, colf) => {
      const low = b0 < BT ? PC.TY - 0.05 : PC.RY - 0.02;
      G0.grid(n + 1, rows + 1, (i, j) => {
        const b = lerp(b0, b1, i / n), y0 = low, y1 = Math.max(y0 + 0.02, rimY(b) - 0.05);
        const t = j / rows, e = lerp(eOf(y0), eOf(y1), t), a = rad(b);
        const nr = V(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
        const p = PC.S.clone().addScaledVector(nr, r);
        return [p, out ? nr : nr.clone().negate(), [i / n * 8, t], colf(b, t)];
      });
    };
    part(gb, PC.B0, BT, nb, PC.RS, true, blue);
    part(inner, PC.B0, BT, nb, PC.RS - 0.14, false, (b, t) => col3('#5c9ad6').lerp(col3('#cfe6f6'), t * 0.6));
    vcMesh(near, gb); vcMesh(near, inner, { line: false });
    // the ribbed glass canopy: BT .. B1, pale glass between white ribs
    const nr2 = Math.max(8, Math.round((PC.B1 - BT) / 1.2));
    part(pale, BT, PC.B1, nr2, PC.RS - 0.08, true, (b, t) => col3(PC.glassPale).lerp(col3('#eef7fb'), t * 0.5));
    part(pale, BT, PC.B1, nr2, PC.RS - 0.16, false, () => col3('#dcecf4'));
    vcMesh(near, pale, { line: false });
    const nRib = Math.max(4, Math.round((PC.B1 - BT) / 4.5));
    for (let k = 0; k <= nRib; k++) {
      const b = lerp(BT, PC.B1, k / nRib), y0 = PC.RY, y1 = rimY(b);
      if (y1 - y0 < 0.3) continue;
      const pts = []; for (let j = 0; j <= 8; j++) pts.push(shellAt(b, lerp(y0, y1, j / 8), PC.RS + 0.02));
      tube(ribs, pts, 0.07, PC.rib, { seg: 5 });
    }
    // two rings across the canopy
    for (const t of [0.36, 0.7]) {
      const pts = []; for (let k = 0; k <= 24; k++) { const b = lerp(BT, PC.B1 - 3, k / 24); pts.push(shellAt(b, lerp(PC.RY, rimY(b), t), PC.RS + 0.02)); }
      tube(ribs, pts, 0.055, PC.rib, { seg: 5 });
    }
    // the rim: a thick white tube along the top edge, tip to tip, and down the
    // blue part's end at BT
    const rimPts = []; for (let k = 0; k <= 90; k++) { const b = lerp(PC.B0, PC.B1, k / 90); rimPts.push(shellAt(b, rimY(b), PC.RS - 0.07)); }
    rimPts[0] = shellAt(PC.B0, PC.TY + 0.05, PC.RS - 0.07);
    tube(ribs, rimPts, 0.3, PC.white, { seg: 10, n: 180 });
    { const pts = []; for (let j = 0; j <= 10; j++) pts.push(shellAt(BT, lerp(PC.TY, rimY(BT) - 0.2, j / 10), PC.RS - 0.07)); tube(ribs, pts, 0.24, PC.white, { seg: 8 }); }
    // a white kerb where the shell meets the ground and where the canopy sits on the roof
    { const pts = []; for (let k = 0; k <= 40; k++) pts.push(shellAt(lerp(PC.B0, BT, k / 40), PC.TY + 0.08, PC.RS - 0.07)); tube(ribs, pts, 0.16, PC.white, { seg: 6 }); }
    { const pts = []; for (let k = 0; k <= 14; k++) pts.push(shellAt(lerp(BT, PC.B1, k / 14), PC.RY + 0.06, PC.RS - 0.07)); tube(ribs, pts, 0.14, PC.white, { seg: 6 }); }
    vcMesh(near, ribs);
    // perches on the rim (the marked Spearow sits up here)
    for (const [k, b] of [['perch_rim_back', 140], ['perch_rim_east', 80], ['perch_rim_west', 240]]) { const p = shellAt(b, rimY(b) + 0.3, PC.RS - 0.07); markers[k] = [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3), rad(b)]; }
    // the side door in the shell (east, under the covered way): a glass pair in a white frame
    {
      const S0 = shellAt(90, PC.TY), D = new GB();
      gbBox(D, S0.x + 0.2, PC.TY + 1.45, S0.z, 0.9, 2.9, 2.9, PC.white);
      gbBox(D, S0.x + 0.66, PC.TY + 1.35, S0.z, 0.04, 2.5, 2.3, '#d9eef8');
      gbBox(D, S0.x + 0.69, PC.TY + 1.2, S0.z, 0.03, 2.3, 0.06, '#8a96a6');
      vcMesh(near, D);
    }
  }
  // ---------- the covered way to the east: a flat white roof on slim posts ----------
  {
    const gb = new GB(), x0 = shellAt(90, PC.TY).x - 0.2, x1 = 19.6, z0 = -5.6, z1 = -1.6, h = 3.1;
    gbBox(gb, (x0 + x1) / 2, h, (z0 + z1) / 2, x1 - x0, 0.32, z1 - z0, (f) => (f === 2 ? '#dfe4ea' : f === 3 ? PC.white2 : PC.white));
    gbBox(gb, (x0 + x1) / 2, h + 0.2, z1 - 0.06, x1 - x0, 0.12, 0.14, '#3a78c0');
    gbBox(gb, (x0 + x1) / 2, h + 0.2, z0 + 0.06, x1 - x0, 0.12, 0.14, '#3a78c0');
    for (const x of [x0 + 4.2, x1 - 0.4]) for (const z of [z0 + 0.3, z1 - 0.3]) { const y0 = x > RT - 1 ? TY - 3 * PC.STEP : TY; lathe(gb, [[0.001, y0], [0.16, y0], [0.12, y0 + 0.12], [0.1, h - 0.16], [0.001, h - 0.16]], 10, PC.white, { cx: x, cz: z }); colliders.push({ x, z, r: 0.2 }); }
    vcMesh(near, gb);
  }
  // ---------- lamps either side of the ramp's top ----------
  for (const sx of [-1, 1]) { const L = O.streetLamp({ h: 3.4, col: PC.lampCol }); L.position.set(sx * 4.3, TY, 15.1); near.add(L); colliders.push({ x: sx * 4.3, z: 15.1, r: 0.3 }); }
  markers.perch_lamp = [4.3, TY + 3.4 + 1.2, 15.1, 0];
  // interior anchors (the interior is not built yet; the doors are shut)
  markers.lobby = [-2.0, TY, 2.5, Math.PI];
  markers.counter = [-2.0, TY, -2.6, 0];
  markers.phones = [-8.4, TY, 1.0, Math.PI / 2];
  markers.generator = [6.5, TY, -9.5, 0];

  // ---------- far level: the same silhouette in a few hundred triangles ----------
  {
    const gb = new GB(), plan2 = pcPlan(9.7, 28), ring = [];
    for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; ring.push([Math.sin(a) * RT, Math.cos(a) * RT]); }
    const rg = ccw(ring);
    capCurve(gb, rg, TY, '#e6e2da', true); wallBand(gb, rg, -0.3, TY, '#dcd7cc');
    wallBand(gb, offsetCurve(plan2, -0.9), TY, GLASS, '#5d95c8');
    wallBand(gb, plan2, GLASS, RY + 0.28, PC.white); capCurve(gb, plan2, RY + 0.28, '#e4e1da', true); ringCap(gb, plan2, offsetCurve(plan2, -0.9), GLASS, PC.white2, false);
    const D = PC.D, R = PC.RD, th = Math.acos((PC.RY - 0.3 - D.y) / R), prof = [];
    for (let i = 0; i <= 7; i++) { const t = (1 - i / 7) * th; prof.push([Math.sin(t) * R, Math.cos(t) * R]); }
    lathe(gb, prof, 18, PC.red, { smooth: true, cx: D.x, cz: D.z, cy: D.y });
    const sh = new GB();
    sh.grid(19, 4, (i, j) => {
      const b = lerp(PC.B0, BT, i / 18), y0 = PC.TY, y1 = rimY(b), e = lerp(Math.asin((y0 - PC.S.y) / PC.RS), Math.asin((y1 - PC.S.y) / PC.RS), j / 3), a = rad(b);
      const n = V(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
      return [PC.S.clone().addScaledVector(n, PC.RS), n, [0, 0], col3('#2a72c4').lerp(col3(PC.blueL), j / 3)];
    });
    sh.grid(7, 3, (i, j) => {
      const b = lerp(BT, PC.B1, i / 6), y0 = PC.RY, y1 = Math.max(PC.RY + 0.05, rimY(b)), e = lerp(Math.asin((y0 - PC.S.y) / PC.RS), Math.asin((y1 - PC.S.y) / PC.RS), j / 2), a = rad(b);
      const n = V(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
      return [PC.S.clone().addScaledVector(n, PC.RS), n, [0, 0], PC.glassPale];
    });
    const rimPts = []; for (let k = 0; k <= 20; k++) { const b = lerp(PC.B0, PC.B1, k / 20); rimPts.push(shellAt(b, rimY(b), PC.RS - 0.07)); }
    tube(sh, rimPts, 0.34, PC.white, { seg: 4, n: 30 });
    vcMesh(far, gb); vcMesh(far, sh, { side: THREE.DoubleSide });
  }

  const G = pack(id, near, far);
  G.userData.foot = { hw: 20, hd: 20 };
  G.userData.colliders = colliders; G.userData.walk = walk; G.userData.markers = markers;
  G.userData.kind = 'pokemonCenter';
  return G;
}

// the Pokémon Center's P: a stem and a round bowl with a blue eye, extruded
// (standing on the band; flat = lying on the roof, drawn the same way up)
function pEmblem(h, depth, flat = false) {
  const G = new THREE.Group(), s = h / 3;
  const sh = new THREE.Shape();
  // stem from the bottom left, the bowl to the right at the top
  sh.moveTo(-1.1 * s, -1.15 * s); sh.lineTo(-0.35 * s, -1.15 * s); sh.lineTo(-0.35 * s, -0.25 * s);
  sh.lineTo(0.35 * s, -0.25 * s); sh.absarc(0.35 * s, 0.55 * s, 0.8 * s, -Math.PI / 2, Math.PI / 2, false);
  sh.lineTo(-1.1 * s, 1.35 * s); sh.closePath();
  const hole = new THREE.Path(); hole.absarc(0.3 * s, 0.55 * s, 0.34 * s, 0, TAU, true); sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: 0.035 * h, bevelSegments: 1, curveSegments: 14 });
  const m = new THREE.Mesh(g, O.flat(PC.red)); m.castShadow = !flat; m.userData.outline = 'solid'; G.add(m);
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.33 * s, 0.33 * s, depth * 0.6, 16).rotateX(Math.PI / 2).translate(0.3 * s, 0.55 * s, depth * 0.3), O.flat('#3a78c8'));
  eye.userData.outline = 'solid'; G.add(eye);
  return G;
}

// =====================================================================
//                            THE VIRIDIAN GYM
// =====================================================================
const GY = {
  H: 2.8, RISERS: 16, RUN: 0.34,              // the terrace's height, the stairs
  FRONT: 9.5,                                  // the terrace's front edge (z)
  SX0: 8.6, SX1: 14.8,                         // a flight runs x = +-SX0 .. +-SX1
  TX: 22.6, TZ0: -18,                          // terrace half width, its back
  BW: 14, BZ0: -15, BZ1: 1.5,                  // the building: half width, back, front wall
  WALL: 7.4, ENT: 1.05,                        // wall height to the entablature, its height
  stone: '#b9c1d9', stoneL: '#d4dbec', stoneD: '#8f99b8', orange: '#e98a3c', orangeL: '#f2a65a', orangeD: '#c9682b', door: '#cf6a35',
  navy: '#3a4466', trim: '#cfd5e6', roofTop: '#d97a34', pave: '#cdbfd2', water: '#4f9fd8',
};
export function viridianGym({ id = 'gym' } = {}) {
  const near = new THREE.Group(), far = new THREE.Group();
  const { H, FRONT, SX0, SX1, TX, TZ0, BW, BZ0, BZ1, WALL, ENT } = GY;
  const FY = H + 0.32, EB = FY + WALL, RB = EB + ENT;   // floor of the building, entablature bottom, roof base
  const st = pic(ashlar(GY.stone)), pl = pic(O.plaster(GY.orange)), pv = pic(paving(GY.pave));
  const markers = {}, colliders = [], walk = [];
  let roof = null;
  const LEN = GY.RISERS * GY.RUN, ZB = FRONT + LEN;   // the stairs' foot

  // ---------- the terrace: paving on top, ashlar walls, a coping ----------
  {
    const S = new THREE.Group(); near.add(S);
    const top = new GB();
    const quad = (gb, a, b, c, d, n, col) => gb.q(...[a, b, c, d].map((p) => gb.v(p, n, [p.x * 0.5, p.z * 0.5 + p.y * 0.5], col)));
    quad(top, V(-TX, H, FRONT), V(TX, H, FRONT), V(TX, H, TZ0), V(-TX, H, TZ0), V(0, 1, 0), '#ffffff');
    vcMesh(S, top, { mat: pv, line: false });
    // the lower plaza in front (paving), a little above the ground
    const low = new GB();
    quad(low, V(-TX, 0.06, FRONT), V(TX, 0.06, FRONT), V(TX, 0.06, 18), V(-TX, 0.06, 18), V(0, 1, 0), '#ffffff');
    vcMesh(S, low, { mat: pic(paving('#c6c3cf')), line: false });
    // walls: the front between the flights and outside them, the sides and the back (ashlar)
    const W = new GB(), wq = (x0, z0, x1, z1, y0, y1, n) => { const nn = V(...n); W.q(...[[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]].map(([x, y, z]) => W.v(V(x, y, z), nn, [(x + z) * 0.5, y * 0.5]))); };
    wq(-SX0, FRONT, SX0, FRONT, -0.6, H, [0, 0, 1]);
    for (const s of [-1, 1]) {
      wq(s * SX1, FRONT, s * TX, FRONT, -0.6, H, [0, 0, 1]);
      wq(s * TX, FRONT, s * TX, TZ0, -0.6, H, [s, 0, 0]);
    }
    wq(-TX, TZ0, TX, TZ0, -0.6, H, [0, 0, -1]);
    vcMesh(S, W, { mat: st });
    // the coping: a pale stone band round the top edge, proud
    const C = new GB();
    gbBox(C, 0, H - 0.08, FRONT + 0.05, SX0 * 2, 0.22, 0.26, GY.stoneL);
    for (const s of [-1, 1]) { gbBox(C, s * (SX1 + TX) / 2, H - 0.08, FRONT + 0.05, TX - SX1, 0.22, 0.26, GY.stoneL); gbBox(C, s * (TX + 0.05), H - 0.08, (FRONT + TZ0) / 2, 0.26, 0.22, FRONT - TZ0, GY.stoneL); }
    gbBox(C, 0, H - 0.08, TZ0 - 0.05, TX * 2, 0.22, 0.26, GY.stoneL);
    // a plinth course at the foot of the walls
    gbBox(C, 0, 0.18, FRONT + 0.06, SX0 * 2, 0.36, 0.14, GY.stoneD);
    for (const s of [-1, 1]) gbBox(C, s * (SX1 + TX) / 2, 0.18, FRONT + 0.06, TX - SX1, 0.36, 0.14, GY.stoneD);
    vcMesh(S, C);
    // decks to walk: the terrace (minus nothing: the building's collider keeps people out), the plaza is the ground
    for (let z = TZ0 + 1.5; z < FRONT; z += 3) walk.push({ x: 0, z: Math.min(z, FRONT - 1.5), hw: TX - 0.3, hd: 1.5, rot: 0, y: H + 0.02 });
  }
  // ---------- balustrades: rails on balusters between posts ----------
  const balus = [];   // [x, y, z, h]: one baluster each (merged, low-poly lathes)
  const post = (gb, x, y, z, h, ball = true) => {
    gbBox(gb, x, y + h / 2, z, 0.42, h, 0.42, GY.stoneL);
    gbBox(gb, x, y + h + 0.05, z, 0.5, 0.1, 0.5, GY.trim);
    if (ball) { lathe(gb, [[0.001, y + h + 0.1], [0.12, y + h + 0.1], [0.08, y + h + 0.16], [0.18, y + h + 0.28], [0.17, y + h + 0.4], [0.06, y + h + 0.52], [0.001, y + h + 0.55]], 10, GY.trim, { cx: x, cz: z, smooth: true }); }
  };
  // a straight run from (x0, y0, z0) to (x1, y1, z1) at railing height RH over its base
  const RH = 0.95;
  const railRun = (gb, a, b, { posts = true, ballEnds = [true, true] } = {}) => {
    const d = b.clone().sub(a), L = Math.hypot(d.x, d.z), ry = Math.atan2(d.x, d.z) - Math.PI / 2, slope = d.y / L;
    const n = Math.max(1, Math.floor((L - 0.6) / 0.32));
    // the base plinth and the top rail, sloping with the run
    const seg = (y0, h, w, col) => {
      const ux = d.x / L, uz = d.z / L, px = -uz * w / 2, pz = ux * w / 2;
      const P = (t, dy, s) => V(a.x + d.x * t + px * s, a.y + d.y * t + y0 + dy, a.z + d.z * t + pz * s);
      const pts = [P(0, 0, 1), P(1, 0, 1), P(1, h, 1), P(0, h, 1), P(0, 0, -1), P(1, 0, -1), P(1, h, -1), P(0, h, -1)];
      const f = (i, j, k, l, nn) => gb.q(...[i, j, k, l].map((q) => gb.v(pts[q], nn, [0, 0], col)));
      const side = V(px, 0, pz).normalize(), up = V(-d.x / L * slope, 1, -d.z / L * slope).normalize();
      f(0, 1, 2, 3, side); f(5, 4, 7, 6, side.clone().negate()); f(3, 2, 6, 7, up); f(4, 5, 1, 0, up.clone().negate());
    };
    seg(0, 0.18, 0.36, GY.stoneL);
    seg(RH - 0.08, 0.14, 0.34, GY.trim);
    for (let i = 0; i < n; i++) { const tt = (0.3 + (i + 0.5) * (L - 0.6) / n) / L; balus.push([a.x + d.x * tt, a.y + d.y * tt + 0.18, a.z + d.z * tt, RH - 0.26]); }
    if (posts) { if (ballEnds[0]) post(gb, a.x, a.y, a.z, RH + 0.1); if (ballEnds[1]) post(gb, b.x, b.y, b.z, RH + 0.1); }
    colliders.push({ box: true, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, hw: 0.22, hd: L / 2, rot: Math.atan2(d.x, d.z) });
    void ry;
  };
  {
    const gb = new GB();
    railRun(gb, V(-SX0 + 0.25, H, FRONT), V(SX0 - 0.25, H, FRONT), { ballEnds: [false, false] });
    for (const s of [-1, 1]) {
      railRun(gb, V(s * (SX1 + 0.25), H, FRONT), V(s * (TX - 0.2), H, FRONT), { ballEnds: [false, true] });
      railRun(gb, V(s * (TX - 0.2), H, FRONT), V(s * (TX - 0.2), H, -2), { ballEnds: [false, true] });
      // the stairs' cheek walls: sloping balustrades on both sides of each flight
      for (const x of [s * (SX0 - 0.25), s * (SX1 + 0.25)]) {
        // a stone cheek wall under the rail, sloping with the stairs
        const w = 0.5, top0 = H, top1 = 0.2;
        const pts = [[x - w / 2, FRONT], [x + w / 2, FRONT], [x + w / 2, ZB], [x - w / 2, ZB]];
        for (const [sx, nx] of [[x + w / 2, 1], [x - w / 2, -1]]) gb.q(...[[sx, -0.4, FRONT], [sx, -0.4, ZB + 0.3], [sx, top1, ZB + 0.3], [sx, top0, FRONT]].map(([xx, y, z]) => gb.v(V(xx, y, z), V(nx, 0, 0), [z * 0.5, y * 0.5], GY.stone)));
        gb.q(...[[x - w / 2, top0, FRONT], [x + w / 2, top0, FRONT], [x + w / 2, top1, ZB + 0.3], [x - w / 2, top1, ZB + 0.3]].map(([xx, y, z]) => gb.v(V(xx, y, z), V(0, LEN, H - 0.2).normalize(), [0, 0], GY.stoneL)));
        gb.q(...[[x - w / 2, -0.4, ZB + 0.3], [x + w / 2, -0.4, ZB + 0.3], [x + w / 2, top1, ZB + 0.3], [x - w / 2, top1, ZB + 0.3]].map(([xx, y, z]) => gb.v(V(xx, y, z), V(0, 0, 1), [0, 0], GY.stone)));
        void pts;
        railRun(gb, V(x, top0, FRONT), V(x, top1 + 0.05, ZB + 0.1));
      }
    }
    vcMesh(near, gb);
  }
  // ---------- the two flights ----------
  {
    const gb = new GB();
    for (const s of [-1, 1]) {
      const x0 = s * SX0, x1 = s * SX1, cx = (x0 + x1) / 2, w = Math.abs(x1 - x0);
      for (let k = 0; k < GY.RISERS; k++) {
        const y = H - (k + 1) * (H / GY.RISERS), z0 = FRONT + k * GY.RUN;
        gbBox(gb, cx, (y - 0.5) / 2, z0 + GY.RUN / 2 + 0.01, w, y + 0.5, GY.RUN + 0.02, (f, yy) => (f === 2 ? '#d7dceb' : f === 4 ? GY.stoneL : GY.stone));
        // a nosing: a slightly darker line along the tread's front
        gbBox(gb, cx, y - 0.02, z0 + GY.RUN - 0.02, w, 0.04, 0.05, GY.stoneD, 0, [2, 4]);
        walk.push({ x: cx, z: z0 + GY.RUN / 2, hw: w / 2, hd: GY.RUN / 2, rot: 0, y: y + 0.02 });
      }
      markers[s < 0 ? 'stairs_l_top' : 'stairs_r_top'] = [cx, H, FRONT - 0.6, Math.PI];
      markers[s < 0 ? 'stairs_l_foot' : 'stairs_r_foot'] = [cx, 0, ZB + 0.8, Math.PI];
    }
    vcMesh(near, gb);
  }
  // ---------- the fountain: a basin against the relief wall, a jet ----------
  {
    const gb = new GB(), fz0 = FRONT, fz1 = 13.3, fx = 6.6, ch = 1.1, RIM = 0.55;
    // the basin's outline (chamfered front corners), its rim in two tiers
    const outline = (o) => [[-fx - o, fz0], [-fx - o, fz1 - ch + o * 0.4], [-fx + ch - o * 0.4, fz1 + o], [fx - ch + o * 0.4, fz1 + o], [fx + o, fz1 - ch + o * 0.4], [fx + o, fz0]];
    const ring = (o) => outline(o).map(([x, z]) => [x, z]);
    const walls = (o, y0, y1, col) => { const P = ring(o); for (let i = 0; i + 1 < P.length; i++) { const [x0, z0] = P[i], [x1, z1] = P[i + 1], n = V(z1 - z0, 0, -(x1 - x0)).normalize().negate(); gb.q(...[[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]].map(([x, y, z]) => gb.v(V(x, y, z), n, [0, 0], col))); } };
    const capBetween = (oa, ob, y, col) => { const A = ring(oa), B = ring(ob); for (let i = 0; i + 1 < A.length; i++) gb.q(...[A[i], A[i + 1], B[i + 1], B[i]].map(([x, z]) => gb.v(V(x, y, z), V(0, 1, 0), [0, 0], col))); };
    walls(0.55, -0.2, 0.28, GY.stone); capBetween(0.55, 0.42, 0.28, GY.stoneL); walls(0.42, 0.28, RIM, GY.stoneL);
    capBetween(0.42, 0.0, RIM, GY.trim);
    // the inner wall down to the water
    { const P = ring(0); for (let i = 0; i + 1 < P.length; i++) { const [x0, z0] = P[i], [x1, z1] = P[i + 1], n = V(z1 - z0, 0, -(x1 - x0)).normalize(); gb.q(...[[x0, 0.0, z0], [x1, 0.0, z1], [x1, RIM, z1], [x0, RIM, z0]].map(([x, y, z]) => gb.v(V(x, y, z), n, [0, 0], GY.stoneD))); } }
    vcMesh(near, gb);
    // water
    { const w = new GB(), P = ring(0).map(([x, z]) => [x, z]); capCurve(w, ccw(P), 0.34, '#ffffff', true); vcMesh(near, w, { mat: pic(waterTex()), line: false, shadow: false }); }
    // the jet: a stone spout, a column of water, a splash
    {
      const j = new GB(), jz = 11.5;
      lathe(j, [[0.001, 0.3], [0.32, 0.3], [0.32, 0.45], [0.2, 0.52], [0.16, 0.72], [0.24, 0.8], [0.001, 0.8]], 14, GY.stoneL, { cx: 0, cz: jz });
      vcMesh(near, j);
      const wj = new GB();
      lathe(wj, [[0.001, 0.8], [0.14, 0.8], [0.11, 1.4], [0.13, 1.75], [0.2, 1.92], [0.12, 2.02], [0.001, 2.04]], 12, ['#e8f6ff', '#d4eefc', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], { cx: 0, cz: jz, smooth: true });
      lathe(wj, [[0.001, 0.4], [0.75, 0.36], [0.5, 0.5], [0.22, 0.56], [0.001, 0.56]], 16, '#eaf7ff', { cx: 0, cz: jz, smooth: true });
      vcMesh(near, wj, { line: false, shadow: false });
      markers.fountain = [0, 0, fz1 + 1.2, Math.PI];
    }
    colliders.push({ box: true, x: 0, z: (fz0 + fz1) / 2 + 0.3, hw: fx + 0.6, hd: (fz1 - fz0) / 2 + 0.6 });
    // the relief: a carved panel in the wall over the basin, in a raised frame
    {
      const r = new GB(), y0 = 0.66, y1 = 2.42, rx = 6.2, z = FRONT + 0.03;
      r.q(r.v(V(-rx, y0, z), V(0, 0, 1), [0, 0]), r.v(V(rx, y0, z), V(0, 0, 1), [1, 0]), r.v(V(rx, y1, z), V(0, 0, 1), [1, 1]), r.v(V(-rx, y1, z), V(0, 0, 1), [0, 1]));
      vcMesh(near, r, { mat: pic(relief()), line: false });
      const f = new GB();
      gbBox(f, 0, y1 + 0.08, FRONT + 0.08, rx * 2 + 0.4, 0.16, 0.16, GY.stoneL); gbBox(f, 0, y0 - 0.08, FRONT + 0.08, rx * 2 + 0.4, 0.16, 0.16, GY.stoneL);
      for (const s of [-1, 1]) gbBox(f, s * (rx + 0.12), (y0 + y1) / 2, FRONT + 0.08, 0.16, y1 - y0 + 0.32, 0.16, GY.stoneL);
      vcMesh(near, f);
    }
  }

  // ---------- the building ----------
  {
    const B = new THREE.Group(); near.add(B);
    const gb = new GB();
    // the stylobate: a low platform under the building and the columns, a step at its front
    gbBox(gb, 0, H + 0.16, (BZ0 - 0.4 + 4.6) / 2, BW * 2 + 1.6, 0.32, 4.6 - BZ0 + 0.4, (f) => (f === 2 ? GY.stoneL : GY.stone));
    gbBox(gb, 0, H + 0.08, 4.85, BW * 2 + 1.0, 0.16, 0.5, (f) => (f === 2 ? GY.stoneL : GY.stone));
    walk.push({ x: 0, z: (BZ1 + 4.6) / 2, hw: BW + 0.8, hd: (4.6 - BZ1) / 2, rot: 0, y: FY + 0.02 });
    walk.push({ x: 0, z: 4.85, hw: BW + 0.5, hd: 0.25, rot: 0, y: H + 0.18 });
    vcMesh(B, gb);
    // walls: the wings (ashlar dado, orange plaster above), the centre block (all ashlar)
    const cb = 3.6, DADO = 2.2;
    const st2 = new GB(), pl2 = new GB();
    const wall = (G0, x0, x1, z, y0, y1, n = [0, 0, 1]) => { const nn = V(...n); G0.q(...[[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]].map(([x, y, zz]) => G0.v(V(x, y, zz), nn, [(n[0] ? zz : x) * 0.5, y * 0.5]))); };
    const sideWall = (G0, x, z0, z1, y0, y1, s) => G0.q(...[[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]].map(([xx, y, zz]) => G0.v(V(xx, y, zz), V(s, 0, 0), [zz * 0.5, y * 0.5])));
    for (const s of [-1, 1]) {
      const xa = s * cb, xb = s * BW;
      wall(st2, Math.min(xa, xb), Math.max(xa, xb), BZ1, FY, FY + DADO);
      wall(pl2, Math.min(xa, xb), Math.max(xa, xb), BZ1, FY + DADO, EB);
      sideWall(st2, xb, BZ1, BZ0, FY, FY + DADO, s); sideWall(pl2, xb, BZ1, BZ0, FY + DADO, EB, s);
    }
    wall(st2, -BW, BW, BZ0, FY, FY + DADO, [0, 0, -1]); wall(pl2, -BW, BW, BZ0, FY + DADO, EB, [0, 0, -1]);
    // the centre block: projecting 0.6, ashlar to the entablature, the arched doorway in it
    const cz = BZ1 + 0.6, dw = 2.7, dh = 3.4, ar = dw / 2 + 0.05;
    {
      const sh = new THREE.Shape(); sh.moveTo(-cb, FY); sh.lineTo(-ar - 0.35, FY); sh.lineTo(-ar - 0.35, FY + dh); sh.absarc(0, FY + dh, ar + 0.35, Math.PI, 0, true); sh.lineTo(ar + 0.35, FY); sh.lineTo(cb, FY); sh.lineTo(cb, EB); sh.lineTo(-cb, EB); sh.closePath();
      const g = new THREE.ShapeGeometry(sh, 16); g.translate(0, 0, cz);
      { const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.5, p.getY(i) * 0.5); }
      const m = new THREE.Mesh(g); m.material = asMat(st, m); m.userData.outline = 'solid'; m.castShadow = true; B.add(m);
      for (const s of [-1, 1]) sideWall(st2, s * cb, BZ1, cz, FY, EB, s);
      // the doorway's reveal (the opening's sides and head, going in 0.5)
      const rv = new GB();
      const pr = []; for (let k = 0; k <= 16; k++) { const a = Math.PI - k / 16 * Math.PI; pr.push([Math.cos(a) * (ar + 0.35), FY + dh + Math.sin(a) * (ar + 0.35)]); }
      const path = [[-ar - 0.35, FY], ...pr, [ar + 0.35, FY]];
      for (let i = 0; i + 1 < path.length; i++) {
        const [x0, y0] = path[i], [x1, y1] = path[i + 1], n = V(y1 - y0, -(x1 - x0), 0).normalize().negate();
        rv.q(...[[x0, y0, cz], [x1, y1, cz], [x1, y1, cz - 0.55], [x0, y0, cz - 0.55]].map(([x, y, z]) => rv.v(V(x, y, z), n, [0, 0], GY.stoneD)));
      }
      vcMesh(B, rv);
      // the stone architrave: a moulded band round the arch, a keystone
      const ab = new GB();
      const arc = []; for (let k = 0; k <= 18; k++) { const a = Math.PI - k / 18 * Math.PI; arc.push(V(Math.cos(a) * (ar + 0.5), FY + dh + Math.sin(a) * (ar + 0.5), cz + 0.08)); }
      tube(ab, [V(-ar - 0.5, FY, cz + 0.08), V(-ar - 0.5, FY + dh * 0.5, cz + 0.08), ...arc, V(ar + 0.5, FY + dh * 0.5, cz + 0.08), V(ar + 0.5, FY, cz + 0.08)], 0.15, GY.stoneL, { seg: 6, n: 60 });
      gbBox(ab, 0, FY + dh + ar + 0.55, cz + 0.12, 0.36, 0.5, 0.2, GY.stoneL);
      for (const s of [-1, 1]) gbBox(ab, s * (ar + 0.5), FY + 0.18, cz + 0.12, 0.5, 0.36, 0.3, GY.stoneL);
      vcMesh(B, ab);
      // the door: orange double leaves with raised panels, in a blue-grey frame; the orange tympanum above
      const d = new GB(), dz = cz - 0.5;
      gbBox(d, 0, FY + dh / 2 - 0.02, dz, dw + 0.5, dh, 0.1, '#6f7c9e');
      for (const s of [-1, 1]) {
        gbBox(d, s * (dw / 4 + 0.02), FY + (dh - 0.25) / 2 + 0.02, dz + 0.08, dw / 2 - 0.06, dh - 0.3, 0.08, GY.door);
        for (const y of [FY + 0.75, FY + 2.0]) gbBox(d, s * (dw / 4 + 0.02), y, dz + 0.13, dw / 2 - 0.42, y > FY + 1 ? 1.0 : 0.9, 0.04, O.shade(GY.door, 0.86));
        gbBox(d, s * 0.14, FY + 1.35, dz + 0.17, 0.06, 0.36, 0.06, '#e8c060');
      }
      gbBox(d, 0, FY + dh - 0.12, dz + 0.04, dw + 0.5, 0.2, 0.2, '#6f7c9e');
      vcMesh(B, d);
      const tym = new THREE.Shape(); tym.moveTo(-ar - 0.35, FY + dh); tym.absarc(0, FY + dh, ar + 0.35, Math.PI, 0, true); tym.closePath();
      const tg = new THREE.ShapeGeometry(tym, 16); tg.translate(0, 0, dz + 0.02);
      const tm = new THREE.Mesh(tg, O.texm(gymPlate(), '#ffffff')); tm.userData.outline = 'solid';
      // (uv: the plate's picture over the half disc)
      { const p = tg.attributes.position, uv = tg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + ar + 0.35) / (2 * ar + 0.7), (p.getY(i) - FY - dh) / (ar + 0.35)); }
      B.add(tm);
      markers.door = [0, FY, cz + 1.6, Math.PI];
      markers.door_inside = [0, FY, dz - 1.5, 0];
      for (const s of [-1, 1]) { const L = BK.wallLamp(B); L.position.set(s * (ar + 1.15), FY + 2.6, cz); }
    }
    vcMesh(B, st2, { mat: st }); vcMesh(B, pl2, { mat: pl });
    // recessed panels on the wings: a light frame, a darker sunk field (two per wing, and on the sides)
    const pn = new GB();
    const panel = (x, y0, y1, w, z, n = 1, side = false) => {
      const at = (dx, y, dz2) => (side ? V(x + dz2 * n, y, z + dx) : V(x + dx, y, z + dz2 * n));
      const nn = side ? V(n, 0, 0) : V(0, 0, n);
      const rect = (hw, ya, yb, d, col) => pn.q(...[[-hw, ya], [hw, ya], [hw, yb], [-hw, yb]].map(([dx, y]) => pn.v(at(dx, y, d), nn, [0, 0], col)));
      const fw = 0.16;
      // frame strips proud of the wall
      for (const [ax, ay, bx, by] of [[-w / 2, y0, w / 2, y0 + fw], [-w / 2, y1 - fw, w / 2, y1], [-w / 2, y0, -w / 2 + fw, y1], [w / 2 - fw, y0, w / 2, y1]]) {
        const cxp = (ax + bx) / 2, cyp = (ay + by) / 2;
        const p = at(cxp, cyp, 0.05); gbBox(pn, p.x, p.y, p.z, side ? 0.1 : bx - ax, by - ay, side ? bx - ax : 0.1, GY.orangeL);
      }
      rect(w / 2 - fw, y0 + fw, y1 - fw, 0.02, GY.orangeD);
      rect(w / 2 - fw - 0.16, y0 + fw + 0.16, y1 - fw - 0.16, 0.03, O.shade(GY.orangeD, 0.92));
    };
    for (const s of [-1, 1]) { for (const x of [7.1, 10.7]) panel(s * x, FY + DADO + 0.35, EB - 0.55, 1.9, BZ1 + 0.01); for (const z of [-3.5, -10]) panel(s * (BW + 0.01), FY + DADO + 0.35, EB - 0.55, 2.4, z, s, true); }
    for (const x of [-7, 0, 7]) panel(x, FY + DADO + 0.35, EB - 0.55, 2.2, BZ0 - 0.01, -1);
    vcMesh(B, pn);
    // columns: free standing in front of the wings (base, shaft, flared capital); full height pilasters at the corners
    const cg = new GB();
    const column = (x, z, h, full = false) => {
      const y0 = FY, r = 0.3;
      gbBox(cg, x, y0 + 0.14, z, 0.84, 0.28, 0.84, GY.stoneL);
      lathe(cg, [[0.4, y0 + 0.28], [0.4, y0 + 0.36], [0.34, y0 + 0.44], [r + 0.02, y0 + 0.5], [r, y0 + 0.58], [r * 0.9, y0 + h - 0.62], [r * 0.95, y0 + h - 0.56], [r * 0.88, y0 + h - 0.5], [0.42, y0 + h - 0.22], [0.48, y0 + h - 0.14]], 14, GY.stoneL, { cx: x, cz: z });
      gbBox(cg, x, y0 + h - 0.07, z, 1.0, 0.14, 1.0, GY.trim);
      // the capital's scrolls (volutes), front and back
      for (const sx of [-1, 1]) { const vg = new THREE.TorusGeometry(0.13, 0.05, 5, 12); const m = new THREE.Mesh(vg, O.flat(GY.trim)); m.position.set(x + sx * 0.4, y0 + h - 0.32, z); m.rotation.y = Math.PI / 2; m.userData.outline = 'solid'; m.castShadow = true; B.add(m); }
      if (!full) markers['perch_column' + Math.round(x)] = [x, y0 + h, z, 0];
      colliders.push({ x, z, r: 0.5 });
    };
    for (const s of [-1, 1]) { column(s * 4.0, 2.7, 5.9); column(s * 6.1, 3.25, 5.9); column(s * 8.5, 3.9, 5.9); }
    // corner pilasters, full height, fluted (thin grooves as darker strips)
    for (const s of [-1, 1]) {
      const x = s * (BW - 0.1), z = BZ1 + 0.1;
      gbBox(cg, x, FY + WALL / 2, z, 0.8, WALL, 0.8, GY.stoneL);
      for (const k of [-0.22, 0, 0.22]) gbBox(cg, x + k, FY + WALL / 2, z + 0.405, 0.06, WALL - 1.2, 0.02, GY.stone, 0, [4]);
      gbBox(cg, x, FY + WALL - 0.25, z, 1.0, 0.3, 1.0, GY.trim);
      gbBox(cg, x, FY + 0.2, z, 1.0, 0.4, 1.0, GY.trim);
    }
    vcMesh(B, cg);
    // the entablature: architrave, a frieze of light panels, a projecting cornice; finials at the corners
    const en = new GB(), ez = BZ1 + 0.9, ew = BW + 0.7;
    gbBox(en, 0, EB + 0.18, (BZ0 + ez) / 2 - 0.05, ew * 2, 0.36, ez - BZ0 + 0.5, (f) => (f === 3 ? GY.stoneD : GY.stone));
    gbBox(en, 0, EB + 0.62, (BZ0 + ez) / 2 - 0.05, ew * 2 - 0.1, 0.52, ez - BZ0 + 0.3, GY.stone);
    gbBox(en, 0, EB + 0.96, (BZ0 + ez) / 2 - 0.05, ew * 2 + 0.5, 0.18, ez - BZ0 + 0.8, (f) => (f === 2 ? GY.trim : GY.stoneL));
    gbBox(en, 0, EB + 0.4, (BZ0 + ez) / 2 - 0.05, ew * 2 + 0.2, 0.08, ez - BZ0 + 0.6, GY.stoneL);
    // the frieze's light panels (front and sides)
    for (let x = -ew + 0.7; x < ew - 0.3; x += 1.25) gbBox(en, x + 0.3, EB + 0.62, ez + 0.11, 0.8, 0.28, 0.06, GY.stoneL);
    for (const s of [-1, 1]) for (let z = BZ0 + 0.5; z < ez - 0.3; z += 1.25) gbBox(en, s * (ew - 0.02), EB + 0.62, z + 0.3, 0.06, 0.28, 0.8, GY.stoneL);
    vcMesh(B, en);
    for (const s of [-1, 1]) for (const z of [ez - 0.1, BZ0 + 0.2]) {
      const f = new GB(), x = s * (ew - 0.15), y = RB;
      gbBox(f, x, y + 0.12, z, 0.5, 0.24, 0.5, GY.stoneL);
      lathe(f, [[0.001, y + 0.24], [0.2, y + 0.24], [0.16, y + 0.42], [0.06, y + 0.95], [0.001, y + 1.15]], 8, GY.trim, { cx: x, cz: z });
      vcMesh(B, f);
      if (z > 0) markers[s < 0 ? 'perch_finial_l' : 'perch_finial_r'] = [x, y + 1.15, z, 0];
    }
    // ---------- the roof: two orange curved shells, the big one sweeping up to the crown ----------
    {
      const x0 = -BW - 0.3, xP = 4.0, xB0 = 0.4, x1 = BW + 0.3, hA = 6.6, hB0 = 3.7, hB1 = 0.3, rz0 = BZ1 + 0.55, rz1 = BZ0 - 0.2;
      const A = (x) => RB + 0.15 + hA * Math.sqrt(Math.max(0, 1 - Math.pow(1 - (x - x0) / (xP - x0), 2)));       // rises, flattening to the crown
      const Bc = (x) => RB + hB1 + (hB0 - hB1) * Math.sqrt(Math.max(0, 1 - Math.pow((x - xB0) / (x1 - xB0), 2))); // falls, steep at its end
      const xN = 1.25;   // left edge of the dark crown panel
      // profile outline (front face), x along, y up: the orange part (with the dark panel cut out) and the dark panel
      const nA = 40, nB = 30;
      const ptsA = []; for (let i = 0; i <= nA; i++) { const x = lerp(x0, xP, i / nA); ptsA.push([x, A(x)]); }
      const ptsB = []; for (let i = 0; i <= nB; i++) { const x = lerp(xP, x1, i / nB); ptsB.push([x, Bc(x)]); }
      const orange = [[x0, RB], ...ptsA.filter(([x]) => x <= xN), [xN, A(xN)], [xN, Bc(xN)], ...(() => { const a = []; for (let i = 1; i <= 12; i++) { const x = lerp(xN, xP, i / 12); a.push([x, Bc(x)]); } return a; })(), ...ptsB.slice(1), [x1, RB]];
      const navy = [[xN, Bc(xN)], [xN, A(xN)], ...ptsA.filter(([x]) => x > xN), [xP, Bc(xP)], ...(() => { const a = []; for (let i = 11; i >= 1; i--) { const x = lerp(xN, xP, i / 12); a.push([x, Bc(x)]); } return a; })()];
      const face = (pts, z, nz, mat) => {
        const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
        const g = new THREE.ShapeGeometry(sh, 1); if (nz < 0) { g.scale(1, 1, -1); const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; } g.computeVertexNormals(); }
        g.translate(0, 0, z);
        const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.5, p.getY(i) * 0.5);
        const m = new THREE.Mesh(g); m.material = asMat(mat, m); m.userData.outline = 'solid'; m.castShadow = true; B.add(m); return m;
      };
      face(orange, rz0, 1, pl); face(navy, rz0, 1, O.flat(GY.navy));
      // the back: one outline (A then B)
      face([[x0, RB], ...ptsA, [xP, Bc(xP)], ...ptsB.slice(1), [x1, RB]], rz1, -1, pl);
      // the top surfaces: light metal, A's curve, the step at xP, B's curve; a raised lip along the front and back edges
      const top = new GB(), lip = new GB();
      const strip = (pts, col) => {
        for (let i = 0; i + 1 < pts.length; i++) {
          const [xa, ya] = pts[i], [xb, yb] = pts[i + 1], n = V(-(yb - ya), xb - xa, 0).normalize();
          if (n.y < 0) n.negate();
          top.q(...[[xa, ya, rz0], [xb, yb, rz0], [xb, yb, rz1], [xa, ya, rz1]].map(([x, y, z]) => top.v(V(x, y, z), n, [z * 0.5, x * 0.5], col)));
        }
      };
      strip(ptsA, GY.roofTop);
      top.q(...[[xP, A(xP), rz0], [xP, Bc(xP), rz0], [xP, Bc(xP), rz1], [xP, A(xP), rz1]].map(([x, y, z]) => top.v(V(x, y, z), V(1, 0, 0), [0, 0], GY.navy)));
      strip(ptsB, GY.roofTop);
      // the ends at x0 and x1 (short vertical faces down to the cornice)
      for (const [x, y, s] of [[x0, A(x0), -1], [x1, Bc(x1), 1]]) top.q(...[[x, RB, rz0], [x, y, rz0], [x, y, rz1], [x, RB, rz1]].map(([xx, yy, z]) => top.v(V(xx, yy, z), V(s, 0, 0), [0, 0], GY.orangeD)));
      vcMesh(B, top);
      // the lip: a light grey trim along the top of both shells' front and back edges, a dark under-edge
      for (const z of [rz0 + 0.09, rz1 - 0.09]) {
        tube(lip, ptsA.map(([x, y]) => V(x, y + 0.12, z)), 0.16, GY.trim, { seg: 6, n: 60 });
        tube(lip, ptsB.map(([x, y]) => V(x, y + 0.12, z)), 0.16, GY.trim, { seg: 6, n: 46 });
        tube(lip, ptsA.filter(([x]) => x > -6).map(([x, y]) => V(x, y - 0.12, z)), 0.07, '#2c3352', { seg: 5, n: 30 });
      }
      // standing seams across the curved top, every 1.6 m front to back
      for (let zz = rz0 - 0.9; zz > rz1 + 0.5; zz -= 1.6) {
        const sa = []; for (let i = 0; i <= 20; i++) { const x = lerp(x0 + 0.2, xP - 0.15, i / 20); sa.push(V(x, A(x) + 0.04, zz)); }
        const sb = []; for (let i = 0; i <= 14; i++) { const x = lerp(xP + 0.15, x1 - 0.2, i / 14); sb.push(V(x, Bc(x) + 0.04, zz)); }
        for (const pts of [sa, sb]) for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1], t = b.clone().sub(a), up = V(-t.y, t.x, 0).normalize(); if (up.y < 0) up.negate();
          for (const s of [-1, 1]) lip.q(lip.v(a.clone().add(V(0, 0, s * 0.05)), V(0, 0, s), [0, 0], O.shade(GY.roofTop, 0.86)), lip.v(b.clone().add(V(0, 0, s * 0.05)), V(0, 0, s), [0, 0], O.shade(GY.roofTop, 0.86)), lip.v(b.clone().addScaledVector(up, 0.09).add(V(0, 0, s * 0.03)), V(0, 0, s), [0, 0], O.shade(GY.roofTop, 1.08)), lip.v(a.clone().addScaledVector(up, 0.09).add(V(0, 0, s * 0.03)), V(0, 0, s), [0, 0], O.shade(GY.roofTop, 1.08))); }
      }
      vcMesh(B, lip);
      // inset frames on the gable fronts: light strips tracing the curves, a sunk panel in each
      const fr = new GB(), z = rz0 + 0.04;
      const trace = (pts, col, r = 0.08) => ribbon(fr, pts, z, r * 2, 0.07, col);
      const offA = (x, d) => A(x) - d, offB = (x, d) => Bc(x) - d;
      { const a = []; for (let i = 0; i <= 18; i++) { const x = lerp(-11.4, 0.6, i / 18); a.push([x, offA(x, 0.85)]); } trace(a.concat([[0.6, RB + 0.6], [-11.4, RB + 0.6], a[0]]), GY.orangeL); }
      { const a = []; for (let i = 0; i <= 12; i++) { const x = lerp(-7.6, -1.6, i / 12); a.push([x, offA(x, 2.3)]); } const pnl = [[-7.6, RB + 1.25], ...a, [-1.6, RB + 1.25]]; trace(pnl.concat([pnl[0]]), GY.orangeL, 0.06);
        const sh = new THREE.Shape(pnl.map(([x, y]) => new THREE.Vector2(x, y))), g = new THREE.ShapeGeometry(sh, 1); g.translate(0, 0, z - 0.01); const m = new THREE.Mesh(g, O.flat(GY.orangeD)); m.userData.outline = false; B.add(m); }
      { const a = []; for (let i = 0; i <= 14; i++) { const x = lerp(2.2, 12.2, i / 14); a.push([x, offB(x, 0.8)]); } trace(a.concat([[12.2, RB + 0.55], [2.2, RB + 0.55], a[0]]), GY.orangeL); }
      { const a = []; for (let i = 0; i <= 10; i++) { const x = lerp(3.4, 8.8, i / 10); a.push([x, offB(x, 2.0)]); } const pnl = [[3.4, RB + 1.1], ...a, [8.8, RB + 1.1]]; trace(pnl.concat([pnl[0]]), GY.orangeL, 0.06);
        const sh = new THREE.Shape(pnl.map(([x, y]) => new THREE.Vector2(x, y))), g = new THREE.ShapeGeometry(sh, 1); g.translate(0, 0, z - 0.01); const m = new THREE.Mesh(g, O.flat(GY.orangeD)); m.userData.outline = false; B.add(m); }
      vcMesh(B, fr);
      markers.perch_crown = [xP - 0.5, A(xP - 0.5) + 0.28, (rz0 + rz1) / 2, 0];
      markers.perch_crown_front = [xP - 0.4, A(xP - 0.4) + 0.28, rz0, 0];
      roof = { A, Bc, x0, x1, xP, rz0, rz1 };
    }
    colliders.push({ box: true, x: 0, z: (BZ0 + BZ1) / 2 + 0.3, hw: BW + 0.3, hd: (BZ1 - BZ0) / 2 + 0.3 });
  }
  // the balusters (merged lathes)
  {
    const gb = new GB();
    for (const [x, y, z, h] of balus) lathe(gb, [[0.001, y], [0.1, y], [0.1, y + 0.06], [0.06, y + h * 0.18], [0.12, y + h * 0.45], [0.05, y + h * 0.85], [0.08, y + h * 0.94], [0.08, y + h], [0.001, y + h]], 6, GY.trim, { cx: x, cz: z });
    vcMesh(near, gb);
  }
  // ---------- planters: conical clipped trees down the sides, round shrubs in urns at the corners ----------
  {
    const gb = new GB(), cones = [], balls = [];
    for (const s of [-1, 1]) for (const z of [7.0, 2.2, -2.6, -7.4, -12.2]) {
      const x = s * 18.6;
      gbBox(gb, x, H + 0.4, z, 1.6, 0.8, 1.6, (f) => (f === 2 ? '#6b4a34' : GY.stone));
      for (const [dx, dz, w, d] of [[0, 0.83, 1.78, 0.12], [0, -0.83, 1.78, 0.12], [0.83, 0, 0.12, 1.54], [-0.83, 0, 0.12, 1.54]]) gbBox(gb, x + dx, H + 0.82, z + dz, w, 0.12, d, GY.stoneL);
      cones.push([x, H + 0.7, z, s * 0.7 + z, 1.0, 1.05]);
      colliders.push({ box: true, x, z, hw: 0.9, hd: 0.9 });
    }
    // urns on the terrace's front corners and by the building's front
    for (const [x, z] of [[-17.4, 8.2], [17.4, 8.2], [-16.0, 4.0], [16.0, 4.0]]) {
      lathe(gb, [[0.001, H], [0.45, H], [0.38, H + 0.12], [0.24, H + 0.22], [0.24, H + 0.36], [0.62, H + 0.52], [0.78, H + 0.86], [0.84, H + 1.02], [0.7, H + 1.02]], 18, [GY.stoneL, GY.stoneL, GY.stone, GY.stone, GY.stoneL, GY.stoneL, GY.trim, GY.trim], { cx: x, cz: z });
      lathe(gb, [[0.72, H + 0.98], [0.001, H + 0.98]], 14, '#6b4a34', { cx: x, cz: z });
      balls.push([x, H + 0.95, z, x, 1.25]);
      colliders.push({ x, z, r: 0.85 });
    }
    vcMesh(near, gb);
    plants(near, 'cone', cones); plants(near, 'ball', balls);
  }

  // ---------- far level ----------
  {
    const gb = new GB(), R = roof;
    gbBox(gb, 0, (H - 0.4) / 2, (FRONT + TZ0) / 2, TX * 2, H + 0.4, FRONT - TZ0, (f) => (f === 2 ? GY.pave : GY.stone));
    for (const s of [-1, 1]) {
      const cx = s * (SX0 + SX1) / 2, w = SX1 - SX0;
      const p = [V(cx - w / 2, H, FRONT), V(cx + w / 2, H, FRONT), V(cx + w / 2, 0.05, ZB), V(cx - w / 2, 0.05, ZB)], n = V(0, LEN, H).normalize();
      gb.q(...p.map((q) => gb.v(q, n, [0, 0], '#d7dceb')));
    }
    gbBox(gb, 0, 0.3, 11.1, 14.4, 0.6, 3.4, GY.stoneL);
    gbBox(gb, 0, FY + WALL / 2, (BZ0 + BZ1) / 2, BW * 2, WALL, BZ1 - BZ0, (f) => (f === 4 ? GY.orange : f === 2 ? GY.stone : GY.orange));
    gbBox(gb, 0, FY + WALL / 2, BZ1 + 0.3, 7.2, WALL, 0.6, GY.stone);
    gbBox(gb, 0, FY + 0.9, BZ1 + 0.62, 2.6, 3.0, 0.04, GY.door, 0, [4]);
    gbBox(gb, 0, EB + ENT / 2, (BZ0 + BZ1) / 2 + 0.3, BW * 2 + 1.4, ENT, BZ1 - BZ0 + 1.4, GY.stoneL);
    // the roof profile, extruded (8 + 6 points)
    const pr = []; for (let i = 0; i <= 8; i++) { const x = lerp(R.x0, R.xP, i / 8); pr.push([x, R.A(x)]); } pr.push([R.xP, R.Bc(R.xP)]); for (let i = 1; i <= 6; i++) { const x = lerp(R.xP, R.x1, i / 6); pr.push([x, R.Bc(x)]); }
    const outline = [[R.x0, RB], ...pr, [R.x1, RB]];
    for (const [z, s] of [[R.rz0, 1], [R.rz1, -1]]) {
      const tris = THREE.ShapeUtils.triangulateShape(outline.map(([x, y]) => new THREE.Vector2(x, y)), []);
      const ids = outline.map(([x, y]) => gb.v(V(x, y, z), V(0, 0, s), [0, 0], GY.orange));
      for (const [a, b, c] of tris) gb.t(ids[a], ids[b], ids[c]);
    }
    for (let i = 0; i + 1 < pr.length; i++) { const [xa, ya] = pr[i], [xb, yb] = pr[i + 1], n = V(-(yb - ya), xb - xa, 0).normalize(); if (n.y < 0 && Math.abs(xb - xa) > 1e-3) n.negate(); gb.q(...[[xa, ya, R.rz0], [xb, yb, R.rz0], [xb, yb, R.rz1], [xa, ya, R.rz1]].map(([x, y, z]) => gb.v(V(x, y, z), Math.abs(xb - xa) < 1e-3 ? V(1, 0, 0) : n, [0, 0], GY.roofTop))); }
    vcMesh(far, gb);
  }

  const G = pack(id, near, far);
  G.userData.foot = { hw: 23, hd: 18 };
  G.userData.colliders = colliders; G.userData.walk = walk; G.userData.markers = markers;
  G.userData.kind = 'viridianGym';
  return G;
}
// the plate in the door's tympanum
const gymPlate = () => O.words('v_gymplate', 256, 128, (x, w, h) => {
  x.fillStyle = GY.orange; x.fillRect(0, 0, w, h);
  x.fillStyle = GY.orangeD; x.fillRect(0, h - 10, w, 10);
  x.fillStyle = '#7a3a1c'; x.textAlign = 'center'; x.textBaseline = 'middle';
  O.fitFont(x, 'VIRIDIAN GYM', 30, w * 0.5, 'Georgia', 700); x.fillText('VIRIDIAN GYM', w / 2, h * 0.45);
});

// ---------- preview scenes (kit.html) ----------
export const PREVIEW = {
  pkcenter: (G, put) => { put(pokemonCenter(), 0, 0); return '-30,22,38,0,4,0'; },
  pkcenter_far: (G, put) => { put(pokemonCenter(), 0, 0); return '-140,60,170,0,6,0'; },
  gym: (G, put) => { put(viridianGym(), 0, 0); return '0,9,46,0,6,0'; },
  gym_side: (G, put) => { put(viridianGym(), 0, 0); return '-32,16,34,0,5,0'; },
};
