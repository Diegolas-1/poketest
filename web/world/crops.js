// The crop library: field and garden plants modelled with real plant
// structure, for any farm, garden or allotment (Route 1's farm first).
//
//   cropModel(kind, { stage, seed }) -> { parts: [{ geometry, material }], radius, height }
//     kinds   cabbage  corn  tomato  lettuce  carrot  radish  pumpkin  squash
//             wheat  sunflower  beans
//     stage   0 seedling .. 1 young .. 2 grown (some kinds add 3: ripe / dry)
//   plantRows(group, { kind, stage, rows, at, ... }) instances a model over
//             a list of points (one InstancedMesh per part, sharing their
//             matrices, so the native bake keeps a plant's parts together)
//   bedGeometry(spec) furrowed soil: mounded beds with dark furrows between
//
// How a crop is made: solid parts (heads, cupped leaves, stalks, fruit, poles)
// are small meshes with their colours in the vertices, in one swaying solid
// material (plantSolid); fine foliage (carrot fronds, tomato leaflets, bean
// leaves) is leaf cards from foliage.js's own atlas (no new pictures). Every
// leaf is two-sided geometry with a midrib and a darker heel, so the cel
// bands catch its curl. Repeated plants are instanced; the native bake turns
// them into vegetation sets (fade, billboards, wind), like the hedges.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './terrain.js';
import { celify } from './toon.js';
import { leafMaterial, pushCard, toGeometry, cards, TILE, plantWindVertex } from './foliage.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);

// ---------- the swaying solid material (vertex colours) ----------
const solidMats = new Map();
export function plantSolid(wind = 0.3) {
  if (solidMats.has(wind)) return solidMats.get(wind);
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, side: THREE.FrontSide });
  plantWindVertex(m, wind);
  celify(m, { bands: [0.12, 0.34, 0.6], deep: [0.38, 0.52, 0.7], shade: [0.6, 0.74, 0.9], lit: [1.1, 1.07, 0.92], litAdd: [0.03, 0.03, 0], detail: 0.2, mid: 0.4 });
  m.userData.rock = { wind };   // native: a solid vegetation material with vertex colours (veg_solid)
  m.name = 'plant';
  solidMats.set(wind, m);
  return m;
}

// ---------- geometry kit ----------
// every part: indexed geometry with position, normal and color, merged at the end
function finish(g, col) {
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) {
    const n = g.attributes.position.count, a = new Float32Array(n * 3), c = typeof col === 'function' ? null : C(col);
    const p = g.attributes.position;
    for (let i = 0; i < n; i++) { const cc = c || col(p.getX(i), p.getY(i), p.getZ(i), i); a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
// a grid surface P(u, v) -> [x, y, z], colours c(u, v) -> Color; twoSided adds
// the back (wound the other way, its normals flipped, a hair behind)
export function surface(nu, nv, P, c, twoSided = true) {
  const pos = [], col = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv;
    pos.push(...P(u, v)); const cc = c(u, v); col.push(cc.r, cc.g, cc.b);
  }
  const W = nu + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * W + i; idx.push(a, a + 1, a + W + 1, a, a + W + 1, a + W); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  if (!twoSided) return g;
  const b = g.clone(), bi = [];
  for (let k = 0; k < idx.length; k += 3) bi.push(idx[k], idx[k + 2], idx[k + 1]);
  b.setIndex(bi);
  const bp = b.attributes.position, bn = b.attributes.normal;
  for (let i = 0; i < bp.count; i++) {
    bn.setXYZ(i, -bn.getX(i), -bn.getY(i), -bn.getZ(i));
    bp.setXYZ(i, bp.getX(i) + bn.getX(i) * 0.004, bp.getY(i) + bn.getY(i) * 0.004, bp.getZ(i) + bn.getZ(i) * 0.004);
  }
  // the underside a little paler and bluer (leaves are lighter beneath)
  const bc = b.attributes.color;
  for (let i = 0; i < bc.count; i++) bc.setXYZ(i, bc.getX(i) * 0.95 + 0.03, bc.getY(i) * 0.97 + 0.03, bc.getZ(i) * 0.95 + 0.04);
  return mergeGeometries([g, b]);
}
// A leaf: from the origin along +z, length L, half width W; arch lifts the
// middle, droop bends the tip down (0..1 of L), curl cups the sides up
// (negative: rolls them down), wave ripples the edge, lobes (0 = plain).
// Coloured from `base` at the heel to `tip`, the midrib paler.
export function leaf(L, W, { arch = 0.2, droop = 0.2, curl = 0.3, wave = 0, waveN = 5, lobes = 0, base = '#5a9a3a', tip = '#8ccc5a', rib = 0.18, nu = 8, nv = 4, shape = 'oval', twist = 0 } = {}) {
  const cb = C(base), ct = C(tip), white = C(tip).lerp(C('#f0f6c0'), 0.5);
  const width = (u) => {
    let w = shape === 'strap' ? Math.min(1, u * 6) * (1 - Math.pow(u, 3)) : shape === 'heart' ? Math.sin(Math.PI * Math.pow(u, 0.75)) * (1 + 0.25 * (1 - u)) : Math.sin(Math.PI * Math.pow(u, 0.8));
    if (lobes) w *= 0.78 + 0.22 * Math.abs(Math.cos(u * Math.PI * lobes));
    return W * Math.max(0, w);
  };
  return surface(nu, nv, (u, v) => {
    const s = v * 2 - 1, w = width(u);
    const z = u * L, tw = twist * u;
    let x = s * w, y = Math.sin(u * Math.PI) * arch * L - Math.pow(u, 2.2) * droop * L + curl * s * s * w;
    y += wave ? Math.sin(u * Math.PI * waveN * 2 + s * 1.3) * wave * Math.abs(s) * w : 0;
    const xr = x * Math.cos(tw) - (y - 0) * Math.sin(tw) * 0.3;
    return [xr, y, z];
  }, (u, v) => {
    const s = Math.abs(v * 2 - 1);
    const c = cb.clone().lerp(ct, Math.pow(u, 0.7));
    if (s < 0.2) c.lerp(white, rib * (1 - s / 0.2));
    return c.multiplyScalar(0.85 + 0.15 * s);
  });
}
// a tube along points with radii, coloured per point
export function tube(pts, radii, cols, seg = 6) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const n = Math.max(2, pts.length * 3), frames = curve.computeFrenetFrames(n, false);
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t), N = frames.normals[i], B = frames.binormals[i];
    const fi = t * (radii.length - 1), k = Math.min(radii.length - 2, Math.floor(fi)), f = fi - k;
    const r = radii[k] * (1 - f) + radii[k + 1] * f;
    const cc = C(cols[Math.min(cols.length - 1, Math.round(t * (cols.length - 1)))]);
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2, nx = Math.cos(a), ny = Math.sin(a);
      pos.push(p.x + (N.x * nx + B.x * ny) * r, p.y + (N.y * nx + B.y * ny) * r, p.z + (N.z * nx + B.z * ny) * r);
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// a lathed body: profile [[r, y]...], `ribs` radial bulges (pumpkins), colours by height
export function body(prof, { seg = 12, ribs = 0, ribK = 0.12, col = '#ffffff', col2 = null, sx = 1, sz = 1 } = {}) {
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
  const p = g.attributes.position, c1 = C(col), c2 = col2 ? C(col2) : c1;
  const y0 = prof[0][1], y1 = prof[prof.length - 1][1];
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
    let k = 1;
    if (ribs) k = 1 - ribK + ribK * Math.pow(Math.abs(Math.cos(a * ribs / 2)), 0.6);
    p.setX(i, x * k * sx); p.setZ(i, z * k * sz);
    const t = (p.getY(i) - y0) / ((y1 - y0) || 1), cc = c1.clone().lerp(c2, t);
    if (ribs) cc.multiplyScalar(0.84 + 0.2 * k);
    cols.set([cc.r, cc.g, cc.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); g.computeVertexNormals();
  return g;
}
const ball = (r, col, seg = 8, rings = 6) => finish(new THREE.SphereGeometry(r, seg, rings), col);
// place a geometry: rotations (radians) applied y, then x, then z; then moved
const at = (g, x, y, z, { rx = 0, ry = 0, rz = 0, s = 1 } = {}) => {
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V(s, s, s));
  return g.applyMatrix4(m);
};
const merge = (list) => mergeGeometries(list.filter(Boolean).map((g) => finish(g.index ? g : g, '#ffffff')));

// leaf cards from the town's own atlas (fine foliage)
function cardSet(list) {
  const out = cards();
  for (const [p, n, s, tile, r, flutter = 0.4] of list) pushCard(out, p, n.clone().normalize(), s, tile, r, p.clone().add(n.clone().multiplyScalar(-0.3)), flutter);
  return toGeometry(out);
}

// ---------- the crops ----------
const GREEN = { cab: ['#3f7a52', '#8cbf7a'], cabHead: '#c8e6a0', corn: ['#4a8a34', '#8ac24a'], dry: ['#a88a4a', '#d8c27a'] };

function cabbage(R, stage) {
  const g = [], k = [0.35, 0.7, 1][Math.min(2, stage)];
  // the head: a firm ball wrapped by its inner leaves
  if (stage > 0) {
    g.push(at(body([[0.001, 0], [0.13, 0.03], [0.2, 0.12], [0.19, 0.24], [0.1, 0.32], [0.001, 0.335]], { seg: 10, col: '#a8d488', col2: '#d4eeb0' }), 0, 0.04, 0, { s: k }));
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * 6.28 + R() * 0.4;
      g.push(at(leaf(0.3 * k, 0.17 * k, { arch: 0.5, droop: -0.3, curl: 0.9, base: '#9ccc7a', tip: '#c6e6a4', nu: 4, nv: 2 }), Math.sin(a) * 0.07 * k, 0.05 * k, Math.cos(a) * 0.07 * k, { ry: a, rx: -1.05 }));
    }
  }
  // the outer leaves: broad, cupped, blue-green, their rims curling back
  const n = stage === 0 ? 4 : 8;
  for (let i = 0; i < n; i++) {
    const a = i / n * 6.28 + R() * 0.5, L = (0.34 + R() * 0.1) * (stage === 0 ? 0.45 : k), lift = stage === 0 ? -0.9 : -0.35 - R() * 0.3;
    g.push(at(leaf(L, L * 0.62, { arch: 0.25, droop: 0.15, curl: 0.55, wave: 0.06, waveN: 3, base: GREEN.cab[0], tip: '#6aa47a', rib: 0.35, nu: 5, nv: 3 }), Math.sin(a) * 0.05, 0.02, Math.cos(a) * 0.05, { ry: a, rx: lift }));
  }
  return { solid: merge(g) };
}
function lettuce(R, stage, red = false) {
  const g = [], k = [0.4, 0.75, 1][Math.min(2, stage)], n = stage === 0 ? 5 : 11;
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + R() * 0.3, inner = i / n, L = (0.2 + 0.08 * (1 - inner)) * k;
    g.push(at(leaf(L, L * 0.6, { arch: 0.3, droop: 0.1, curl: 0.4, wave: 0.12, waveN: 4, base: '#5aa034', tip: red ? '#8a2a3a' : '#a8dc5a', rib: 0.3, nu: 5, nv: 3 }), 0, 0.01, 0, { ry: a, rx: -1.2 + inner * 0.8 }));
  }
  return { solid: merge(g) };
}
function corn(R, stage) {
  const g = [], dry = stage >= 3, H = [0.5, 1.2, 2.2, 2.1][Math.min(3, stage)];
  const st = dry ? ['#9a7a3a', '#c8ac62'] : ['#5a8a34', '#8aba4a'];
  g.push(tube([V(0, 0, 0), V(0.01, H * 0.5, 0), V(-0.01, H, 0)], [0.028 * (H / 2.2 + 0.4), 0.02, 0.012], st, 5));
  // nodes (rings) up the stalk
  // long arching leaves, alternate sides, drooping tips
  const nL = Math.max(3, Math.round(H * 5));
  for (let i = 0; i < nL; i++) {
    const y = 0.12 + i / nL * H * 0.82, a = (i % 2 ? Math.PI : 0) + (R() - 0.5) * 0.6 + i * 0.25;
    const L = (0.55 + 0.35 * Math.sin((i + 1) / (nL + 1) * Math.PI)) * Math.min(1, H / 1.6 + 0.3);
    g.push(at(leaf(L, 0.045, { shape: 'strap', arch: 0.25, droop: 0.7, curl: 0.25, wave: 0.03, waveN: 6, base: dry ? '#a88a42' : '#3f7a24', tip: dry ? '#d0b878' : '#7ab43c', rib: 0.35, nu: 7, nv: 1 }), 0, y, 0, { ry: a, rx: -0.75 }));
  }
  if (stage >= 2) {
    // the tassel: a spray of thin branches at the top
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * 6.28 + R(), l = 0.18 + R() * 0.1;
      g.push(tube([V(0, H - 0.02, 0), V(Math.sin(a) * l * 0.4, H + l * 0.6, Math.cos(a) * l * 0.4), V(Math.sin(a) * l * 0.9, H + l * 0.45, Math.cos(a) * l * 0.9)], [0.006, 0.004, 0.002], dry ? ['#c8a860'] : ['#d8c870', '#e8d890'], 3));
    }
    // one or two ears in their husks, silk at the tip
    const ears = R() < 0.5 ? 1 : 2;
    for (let e = 0; e < ears; e++) {
      const y = H * (0.45 + e * 0.12), a = R() * 6.28;
      const ear = body([[0.001, 0], [0.03, 0.03], [0.045, 0.1], [0.04, 0.2], [0.02, 0.26], [0.004, 0.29]], { seg: 8, col: dry ? '#b8a05a' : '#7ab048', col2: dry ? '#d8c890' : '#b8d870' });
      g.push(at(ear, 0.03 * Math.sin(a), y, 0.03 * Math.cos(a), { ry: a, rx: 0.5 }));
      // husk leaves peeling back a little
      for (let h = 0; h < 2; h++) g.push(at(leaf(0.24, 0.035, { arch: 0.1, droop: -0.2, curl: 0.8, base: dry ? '#b09a52' : '#6aa040', tip: dry ? '#d8c890' : '#a8d070', nu: 5, nv: 2 }), 0.03 * Math.sin(a), y, 0.03 * Math.cos(a), { ry: a + (h - 0.5) * 1.2, rx: 0.42 }));
      // silk: a little brush of strands
      const tip = V(0.03 * Math.sin(a), y, 0.03 * Math.cos(a)).add(V(Math.sin(a) * Math.sin(0.5), Math.cos(0.5), Math.cos(a) * Math.sin(0.5)).multiplyScalar(0.29));
      for (let s = 0; s < 2; s++) { const b = a + (s - 0.5) * 0.5; g.push(tube([tip.clone(), tip.clone().add(V(Math.sin(b) * 0.05, 0.03, Math.cos(b) * 0.05)), tip.clone().add(V(Math.sin(b) * 0.09, -0.03, Math.cos(b) * 0.09))], [0.004, 0.003, 0.002], dry ? ['#6a4a2a'] : ['#c87a4a', '#8a4a2a'], 3)); }
    }
  }
  return { solid: merge(g) };
}
function tomato(R, stage) {
  const g = [], H = [0.4, 0.9, 1.45][Math.min(2, stage)], cardsL = [];
  // the stake and its twine ties
  g.push(at(finish(new THREE.CylinderGeometry(0.018, 0.022, 1.7, 5), '#b08a5a'), 0.06, 0.75, 0, {}));
  // the vine: a zig-zag stem tied to the stake, side shoots
  const pts = [V(0, 0, 0)];
  for (let i = 1; i <= 5; i++) pts.push(V((i % 2 ? 0.05 : -0.02) + (R() - 0.5) * 0.03, H * i / 5, (R() - 0.5) * 0.05));
  g.push(tube(pts, [0.016, 0.012, 0.008], ['#5a8a34', '#7aaa44'], 5));
  for (let i = 1; i < 5; i++) {
    const p = pts[i], a = i * 2.3 + R();
    g.push(at(finish(new THREE.TorusGeometry(0.05, 0.005, 3, 8), '#e8dcb0'), 0.04, p.y, 0, { rx: Math.PI / 2 }));
    const tipP = p.clone().add(V(Math.cos(a) * 0.28, 0.06, Math.sin(a) * 0.28));
    g.push(tube([p.clone(), p.clone().add(V(Math.cos(a) * 0.14, 0.06, Math.sin(a) * 0.14)), tipP], [0.008, 0.006, 0.004], ['#6a9a3c'], 4));
    // compound leaves: cards of leaflets along each shoot
    cardsL.push([tipP.clone().add(V(0, 0.02, 0)), V(Math.cos(a), 0.9, Math.sin(a)), 0.36, TILE.bushB, R() * 6]);
    cardsL.push([p.clone().add(V(-Math.cos(a) * 0.12, 0.04, -Math.sin(a) * 0.12)), V(-Math.cos(a), 0.7, -Math.sin(a)), 0.3, TILE.leafC, R() * 6]);
    // fruit trusses: a stem with three to five tomatoes and their green stars
    if (stage >= 2 && i < 4) {
      const fp = p.clone().add(V(Math.cos(a + 1.2) * 0.12, -0.08, Math.sin(a + 1.2) * 0.12));
      const n = 3 + Math.floor(R() * 3);
      for (let f = 0; f < n; f++) {
        const ripe = R(), col = ripe < 0.5 ? '#e0402c' : ripe < 0.75 ? '#f0802c' : '#8abf4a', r = 0.04 + R() * 0.018;
        const q = fp.clone().add(V((R() - 0.5) * 0.12, -f * 0.035 - R() * 0.03, (R() - 0.5) * 0.12));
        const t = at(ball(r, col, 8, 6), q.x, q.y, q.z, {}); t.scale(1, 0.85, 1);
        g.push(t);
        g.push(at(finish(new THREE.ConeGeometry(r * 0.7, r * 0.3, 5, 1), '#3a7a2a'), q.x, q.y + r * 0.8, q.z, { rx: Math.PI }));
      }
      g.push(tube([p.clone(), fp.clone().add(V(0, 0.04, 0))], [0.005, 0.004], ['#6a9a3c'], 3));
    }
  }
  cardsL.push([V(0.02, H + 0.05, 0), V(0, 1, 0.2), 0.34, TILE.bushB, R() * 6]);
  return { solid: merge(g), cards: cardSet(cardsL) };
}
function carrot(R, stage, radish = false) {
  const g = [], k = [0.4, 0.75, 1][Math.min(2, stage)], cl = [];
  if (radish) {
    if (stage > 0) g.push(at(body([[0.001, -0.02], [0.03, 0], [0.04, 0.03], [0.03, 0.06], [0.001, 0.065]], { seg: 9, col: '#f2f0ea', col2: '#d8384a' }), 0, -0.03, 0, { s: k }));
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + R() * 0.4; g.push(at(leaf(0.16 * k, 0.05 * k, { arch: 0.4, droop: 0.3, curl: 0.3, wave: 0.03, lobes: 2, base: '#5a8a34', tip: '#8cc05a', nu: 6, nv: 3 }), 0, 0.02, 0, { ry: a, rx: -0.9 })); }
    return { solid: merge(g) };
  }
  // the orange shoulder showing at the soil, stems, feathery fronds
  if (stage > 0) g.push(at(body([[0.001, -0.05], [0.028, 0], [0.03, 0.02], [0.02, 0.035], [0.001, 0.04]], { seg: 8, col: '#e07020', col2: '#f0902a' }), 0, -0.02, 0, { s: k }));
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + R() * 0.3, top = V(Math.cos(a) * 0.08, 0.2 * k + R() * 0.05, Math.sin(a) * 0.08);
    g.push(tube([V(0, 0.02, 0), top.clone().multiplyScalar(0.5).add(V(0, 0.04, 0)), top], [0.005, 0.004, 0.003], ['#5a8a34'], 3));
    cl.push([top.clone().add(V(Math.cos(a) * 0.05, 0.03, Math.sin(a) * 0.05)), V(Math.cos(a), 0.8, Math.sin(a)), 0.22 * k + 0.05, TILE.fern, a + 1.5, 0.6]);
  }
  return { solid: merge(g), cards: cardSet(cl) };
}
function pumpkin(R, stage, squash = false) {
  const g = [];
  // the vine runs along the ground with big lobed leaves standing up on stems
  const vine = [V(-0.7, 0.03, -0.3), V(-0.3, 0.04, -0.1), V(0.1, 0.03, 0.05), V(0.5, 0.04, 0.25), V(0.85, 0.03, 0.5)];
  g.push(tube(vine, [0.016, 0.02, 0.016], ['#5a8a34', '#6a9a3a'], 5));
  for (let i = 0; i < 5; i++) {
    const p = vine[i].clone(), a = R() * 6.28, h = 0.18 + R() * 0.14;
    const top = p.clone().add(V(Math.cos(a) * 0.06, h, Math.sin(a) * 0.06));
    g.push(tube([p, p.clone().add(V(0, h * 0.6, 0)), top], [0.008, 0.007, 0.006], ['#6a9a3c'], 3));
    g.push(at(leaf(0.42, 0.24, { shape: 'heart', lobes: 2.5, arch: 0.12, droop: 0.25, curl: 0.35, wave: 0.04, base: '#2f6a22', tip: '#5a9a34', rib: 0.3, nu: 8, nv: 5 }), top.x - Math.cos(a) * 0.05, top.y, top.z - Math.sin(a) * 0.05, { ry: a, rx: 0.05 }));
    // a curly tendril
    if (i % 2) { const t0 = p.clone(); g.push(tube([t0, t0.clone().add(V(0.05, 0.05, 0.02)), t0.clone().add(V(0.09, 0.03, 0.06)), t0.clone().add(V(0.07, 0.06, 0.1))], [0.003, 0.003], ['#7aaa44'], 3)); }
    if (stage >= 2 && i === 2) {
      // a yellow trumpet flower
      g.push(at(body([[0.001, 0], [0.012, 0.01], [0.03, 0.05], [0.055, 0.08], [0.05, 0.085]], { seg: 6, col: '#e8b02a', col2: '#f6d84a' }), p.x + 0.12, 0.05, p.z, { rx: -0.9 }));
    }
  }
  if (stage >= 1) {
    const ripe = stage >= 2, r = ripe ? 0.24 + R() * 0.08 : 0.12;
    const col = squash ? (R() < 0.5 ? '#e8c03a' : '#5a8a3a') : ripe ? '#e8782a' : '#9aba4a', col2 = squash ? '#f2d86a' : ripe ? '#f29a3a' : '#c6d870';
    const prof = squash ? [[0.001, 0], [r * 0.45, 0.02], [r * 0.5, r * 0.6], [r * 0.4, r * 1.6], [r * 0.25, r * 2.2], [0.001, r * 2.3]]
      : [[0.001, 0.02], [r * 0.6, 0], [r * 0.95, r * 0.35], [r, r * 0.75], [r * 0.7, r * 1.25], [r * 0.15, r * 1.4], [0.001, r * 1.32]];
    const pb = body(prof, { seg: 16, ribs: squash ? 0 : 10, ribK: 0.14, col, col2, sz: squash ? 1 : 0.92 });
    if (squash) pb.rotateZ(Math.PI / 2).translate(-r * 1.1, r * 0.45, 0);
    g.push(at(pb, 0.15, 0, 0.1, { ry: R() * 6 }));
    if (!squash) g.push(tube([V(0.15, r * 1.3, 0.1), V(0.16, r * 1.5, 0.12), V(0.2, r * 1.58, 0.12)], [0.03, 0.022, 0.018], ['#6a5a2a', '#8a7a3a'], 5));
  }
  return { solid: merge(g) };
}
function wheat(R, stage) {
  // a tuft of wheat: three crossed cards of painted stalks and ears (the
  // crop atlas), so a whole field costs a few triangles a plant
  const H = [0.35, 0.75, 1.0, 1.0][Math.min(3, stage)], tile = stage >= 3 ? TILE.needles : TILE.needles2, cl = [];
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI + R() * 0.3;
    cl.push([V(0, H * 0.5, 0), V(Math.cos(a), 0, Math.sin(a)), H * 1.05, tile, 0, 0.15]);
  }
  return { cards: cardSet(cl), variant: 'crop' };
}
function sunflower(R, stage) {
  const g = [], H = [0.4, 1.2, 2.1][Math.min(2, stage)];
  g.push(tube([V(0, 0, 0), V(0.02, H * 0.5, 0), V(0, H, 0.03)], [0.035, 0.026, 0.02], ['#5a8a30', '#7aaa3a'], 6));
  const nL = stage === 0 ? 3 : 8;
  for (let i = 0; i < nL; i++) {
    const y = 0.1 + i / nL * H * 0.8, a = i * 2.4;
    g.push(at(leaf(0.24 + (1 - i / nL) * 0.08, 0.13, { shape: 'heart', arch: 0.1, droop: 0.35, curl: 0.2, wave: 0.02, base: '#3f7a2a', tip: '#6aa040', rib: 0.35, nu: 7, nv: 4 }), 0, y, 0, { ry: a, rx: -0.4 }));
  }
  if (stage >= 2) {
    // the head nods toward the south-east sun: a seed disk, a ring of petals
    const hp = V(0, H + 0.02, 0.06), F = new THREE.Group();
    const disk = body([[0.001, 0.03], [0.1, 0.035], [0.15, 0.02], [0.16, 0], [0.12, -0.03], [0.04, -0.045], [0.001, -0.04]], { seg: 16, col: '#4a2a14', col2: '#6a3a1a' });
    const parts = [disk];
    for (let p = 0; p < 18; p++) {
      const a = p / 18 * 6.28 + (p % 2) * 0.1;
      parts.push(at(leaf(0.12, 0.03, { arch: 0.05, droop: 0.15, curl: 0.3, base: '#f0b01a', tip: '#f8d84a', rib: 0.2, nu: 4, nv: 2 }), Math.sin(a) * 0.14, 0, Math.cos(a) * 0.14, { ry: a, rx: -0.05 + (p % 2) * 0.08 }));
    }
    const head = merge(parts);
    head.rotateX(Math.PI / 2 - 0.5).translate(hp.x, hp.y, hp.z);
    g.push(head); void F;
  }
  return { solid: merge(g) };
}
function beans(R, stage) {
  // a teepee of four canes tied at the top, vines spiralling up, heart leaves, pods
  const g = [], H = 1.9, cl = [];
  const top = V(0, H, 0), foot = [];
  for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28 + 0.4; foot.push(V(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45)); g.push(tube([foot[i], top.clone().add(V(Math.cos(a) * -0.08, 0.15, Math.sin(a) * -0.08))], [0.016, 0.012], ['#b89a6a', '#d0b888'], 4)); }
  g.push(at(finish(new THREE.TorusGeometry(0.05, 0.012, 4, 8), '#d8c890'), 0, H - 0.05, 0, { rx: Math.PI / 2 }));
  const reach = [0.3, 0.6, 1][Math.min(2, stage)];
  for (let i = 0; i < 4; i++) {
    const pts = [];
    for (let t = 0; t <= 8; t++) { const f = t / 8 * reach, p = foot[i].clone().lerp(top, f * 0.92); p.x += Math.cos(t * 1.6) * 0.035; p.z += Math.sin(t * 1.6) * 0.035; pts.push(p); }
    g.push(tube(pts, [0.006, 0.005, 0.004], ['#5a8a34', '#7aaa44'], 3));
    for (let t = 1; t < pts.length; t++) {
      const p = pts[t], o = V(p.x, 0, p.z).normalize();
      cl.push([p.clone().add(o.clone().multiplyScalar(0.06)), V(o.x, 0.6, o.z), 0.2 + R() * 0.06, TILE.ivy2, R() * 6, 0.5]);
      if (stage >= 2 && t % 2 === 0 && t < 7) for (let k = 0; k < 2; k++) {
        const q = p.clone().add(o.clone().multiplyScalar(0.05)).add(V((R() - 0.5) * 0.06, -0.02, (R() - 0.5) * 0.06));
        g.push(tube([q, q.clone().add(V(0.01, -0.07, 0)), q.clone().add(V(0.025, -0.15, 0.01))], [0.007, 0.008, 0.003], ['#6aaa3a', '#8ac44a'], 4));
      }
    }
  }
  return { solid: merge(g), cards: cardSet(cl) };
}
const MAKERS = { cabbage, lettuce, corn, tomato, carrot, radish: (R, s) => carrot(R, s, true), pumpkin, squash: (R, s) => pumpkin(R, s, true), wheat, sunflower, beans,
  redLettuce: (R, s) => lettuce(R, s, true) };
export const CROPS = Object.keys(MAKERS);

const modelCache = new Map();
// wind: crops are short, so they get more of it than trees (the sway grows
// with height from the root, see foliage.js)
export function cropModel(kind, { stage = 2, seed = 1, wind = 0.35 } = {}) {
  const key = [kind, stage, seed, wind].join();
  if (modelCache.has(key)) return modelCache.get(key);
  const R = rng(seed * 977 + kind.length * 31 + stage);
  const r = MAKERS[kind](R, stage);
  const parts = r.solid ? [{ geometry: r.solid, material: plantSolid(wind) }] : [];
  if (r.cards) parts.push({ geometry: r.cards, material: leafMaterial('#ffffff', wind * 0.5, r.variant || 'green') });
  const b = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); b.union(p.geometry.boundingBox); }
  const m = { parts, radius: Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z), height: b.max.y };
  modelCache.set(key, m);
  return m;
}

// Instances of a crop at points [x, y, z, rot, scale]: one InstancedMesh per
// part, all sharing one matrix buffer (the bake groups a plant's parts by it).
// A few seeds give variety: each seed is its own set of instances.
export function plantAt(group, kind, pts, { stage = 2, seeds = 3, wind, fade } = {}) {
  const bySeed = Array.from({ length: seeds }, () => []);
  pts.forEach((p, i) => bySeed[i % seeds].push(p));
  const out = [];
  bySeed.forEach((list, s) => {
    if (!list.length) return;
    const model = cropModel(kind, { stage: Array.isArray(stage) ? stage[s % stage.length] : stage, seed: s + 1, wind });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    let first = null;
    for (const part of model.parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      if (first) im.instanceMatrix = first.instanceMatrix;
      else list.forEach(([x, y, z, r, sc = 1], i) => { m4.compose(V(x, y, z), q.setFromAxisAngle(V(0, 1, 0), r), V(sc, sc, sc)); im.setMatrixAt(i, m4); });
      im.castShadow = true; im.receiveShadow = true;
      im.userData.outline = false;   // hundreds of curled leaves: the cel bands draw them
      if (fade) im.userData.fade = fade;
      im.name = 'crop_' + kind;
      group.add(im);
      first = first || im;
      out.push(im);
    }
    first.computeBoundingSphere();
  });
  return out;
}

// ---------- furrowed soil ----------
// Raised beds across a field: a w x d rectangle (local x across the rows,
// z along them) centred on (cx, cz), turned rot, `rows` mounded beds with
// furrows between; heightAt(x, z) gives the ground (world). Returns a mesh
// (vertex colours: damp dark furrows, drier crests, a straw mulch edge).
export function bedGeometry({ cx, cz, w, d, rot = 0, rows = 8, mound = 0.16, heightAt, seed = 1, soil = '#7a5236', dry = '#a07a52' }) {
  const R = rng(seed), nu = rows * 6, nv = Math.max(4, Math.round(d / 0.85));
  const c = Math.cos(rot), s = Math.sin(rot), cs = C(soil), cd = C(dry), dark = C(soil).multiplyScalar(0.62);
  const jit = Array.from({ length: (nu + 1) * (nv + 1) }, () => R());
  let k = 0;
  const g = surface(nu, nv, (u, v) => {
    const lx = (u - 0.5) * w, lz = (v - 0.5) * d;
    const ph = u * rows, f = ph - Math.floor(ph);
    // a rounded bed between two furrows, fading out at the ends of the rows
    const edge = Math.min(1, Math.min(v, 1 - v) * d / 0.6, Math.min(u, 1 - u) * w / 0.3);
    const y = (Math.pow(Math.sin(f * Math.PI), 0.7) * mound + (jit[k++] - 0.5) * 0.025) * edge;
    const x = cx + lx * c + lz * s, z = cz - lx * s + lz * c;
    return [x, heightAt(x, z) + y - 0.02, z];
  }, (u, v) => {
    const f = (u * rows) % 1, crest = Math.pow(Math.sin(f * Math.PI), 2);
    return dark.clone().lerp(cs, 0.35 + crest * 0.5).lerp(cd, crest * crest * 0.5 * (0.6 + 0.4 * Math.sin(v * 37 + u * 11)));
  }, false);
  return g;
}

// the centre lines of the beds (local u per row, for planting along them)
export function bedRows({ cx, cz, w, d, rot = 0, rows = 8, spacing = 0.5, margin = 0.5, heightAt, mound = 0.16, jitter = 0.06, seed = 2 }) {
  const R = rng(seed), c = Math.cos(rot), s = Math.sin(rot), out = [];
  for (let r = 0; r < rows; r++) {
    const lx = ((r + 0.5) / rows - 0.5) * w, row = [];
    for (let lz = -d / 2 + margin; lz <= d / 2 - margin + 1e-6; lz += spacing) {
      const jx = (R() - 0.5) * jitter, jz = (R() - 0.5) * jitter;
      const x = cx + (lx + jx) * c + (lz + jz) * s, z = cz - (lx + jx) * s + (lz + jz) * c;
      row.push([x, heightAt(x, z) + mound * 0.85, z, R() * 6.28, 0.85 + R() * 0.3]);
    }
    out.push(row);
  }
  return out;
}
void THREE;
