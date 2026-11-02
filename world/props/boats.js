// Boats: lofted wooden hulls (clinker strakes, a rubbing strake, a keel,
// a transom, the inside of the planking), thwarts, rowlocks and oars; the
// fishing boat adds a deck with bulwarks, a planked wheelhouse with framed
// windows, a door and a railed roof, a mast with a crosstree and lamps, an
// exhaust stack, tyre fenders, a net pile, fish boxes and a lifebuoy.
// Every part is vertex coloured and merged into ONE mesh (boats bob, so they
// stay out of the town's static merge: one draw each).
//   rowboat({ hull, trim, seed })   fishingBoat({ hull, trim, name })
// Origin: the waterline under the middle of the boat, bow toward +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as O from './outdoor.js';
import { surface, tube, body } from '../crops.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);
const shade = (h, k) => '#' + C(h).multiplyScalar(k).getHexString();

// ---------- the part list ----------
function kit() {
  const parts = [];
  const add = (g, col, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1 } = {}) => {
    g = g.index ? g.toNonIndexed() : g;
    if (!g.attributes.color) {
      const c = C(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V(s, s, s)));
    parts.push(g);
    return g;
  };
  // a box with chamfered vertical edges (reads as timber in cel light)
  const bbox = (w, h, d, col, o) => {
    const c = Math.min(0.015, w * 0.2, d * 0.2), x = w / 2, z = d / 2, sh = new THREE.Shape();
    sh.moveTo(-x + c, -z); sh.lineTo(x - c, -z); sh.lineTo(x, -z + c); sh.lineTo(x, z - c); sh.lineTo(x - c, z); sh.lineTo(-x + c, z); sh.lineTo(-x, z - c); sh.lineTo(-x, -z + c); sh.closePath();
    return add(new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2).translate(0, -h / 2, 0), col, o);
  };
  const cyl = (rt, rb, h, col, o, seg = 10) => add(new THREE.CylinderGeometry(rt, rb, h, seg), col, o);
  const torus = (R, r, col, o, seg = 16) => add(new THREE.TorusGeometry(R, r, 6, seg), col, o);
  const rod = (a, b, r, col, seg = 6) => add(tube([a, a.clone().lerp(b, 0.5), b], [r, r, r], [col]), col);
  const done = () => {
    const g = mergeGeometries(parts);
    const m = new THREE.Mesh(g, O.vcFlat());
    m.castShadow = true; m.receiveShadow = true; m.userData.outline = 'solid';
    return m;
  };
  return { add, bbox, cyl, torus, rod, done };
}

// ---------- the hull ----------
// L long, B beam, sheer height H above the waterline at the middle, keel D
// below it; strakes = clinker planks (each lap a step out), transom width
// (fraction of B) at the stern, `ink` = the colour bands
function hull(K, { L, B, H, D, strakes = 5, transom = 0.55, sheerUp = 0.22, cols, inside, wl = 0.0, seed = 1 }) {
  const half = (u) => {   // half breadth along the length, u 0 stern .. 1 bow
    const bow = Math.pow(Math.sin(Math.PI / 2 * Math.min(1, (1 - u) / 0.55)), 0.75);
    const st = transom + (1 - transom) * Math.pow(Math.sin(Math.PI / 2 * Math.min(1, u / 0.35)), 0.6);
    return (B / 2) * bow * st;
  };
  const sheer = (u) => H + sheerUp * Math.pow(2 * u - 1, 2) + sheerUp * 0.6 * Math.max(0, 2 * u - 1);
  const keel = (u) => -D * (0.35 + 0.65 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.85 + 0.12)), 0.5));
  // a section point: v 0 port sheer .. 0.5 keel .. 1 starboard sheer
  const at = (u, v, k = 1, dy = 0) => {
    const th = (v * 2 - 1) * Math.PI / 2, s = sheer(u) + dy, kl = keel(u) + (1 - k) * 2.2;
    const t = 1 - Math.cos(th);                       // 0 at the keel, 1 at the sheer
    let x = half(u) * k * Math.sign(th) * Math.pow(Math.abs(Math.sin(th)), 0.55);
    // clinker: each strake laps out a little at its lower edge
    const sk = t * strakes, f = sk - Math.floor(sk);
    x *= 1 + 0.018 * (1 - f) * (k === 1 ? 1 : 0);
    const y = kl + (s - kl) * t;
    return [x, y, (u - 0.5) * L];
  };
  const outer = surface(28, 18, (u, v) => at(u, 1 - v), (u, v) => {
    const p = at(u, 1 - v), t = 1 - Math.cos((v * 2 - 1) * Math.PI / 2), sk = Math.min(strakes - 1, Math.floor(t * strakes));
    if (p[1] < wl + 0.06) return C(cols.bottom);
    if (sk === strakes - 1) return C(cols.top);
    return C(cols.side).multiplyScalar(sk % 2 ? 0.95 : 1.03);
  }, false);
  K.add(outer);
  // the inside of the planking (wound the other way), the timber colour
  const inner = surface(24, 14, (u, v) => at(u, v, 0.94, -0.02), (u, v) => C(inside).multiplyScalar(0.8 + 0.25 * Math.abs(1 - 2 * v)), false);
  K.add(inner);
  // the transom: a flat board closing the stern
  const sh = new THREE.Shape(); const n = 14;
  for (let i = 0; i <= n; i++) { const [x, y] = at(0.0, i / n); i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  const tg = new THREE.ShapeGeometry(sh).rotateY(Math.PI); K.add(tg, cols.top, { z: -L / 2 + 0.005 });
  K.add(new THREE.ShapeGeometry(sh), inside, { z: -L / 2 + 0.03 });
  { const [x, y] = at(0, 0); K.add(new THREE.PlaneGeometry(Math.abs(x) * 1.9, 0.1).rotateY(Math.PI), cols.trim, { y: y - 0.12, z: -L / 2 - 0.004 }); }
  // gunwale caps and the rubbing strake along each sheer, the keel and stem
  for (const sd of [0, 1]) {
    const pts = [], pts2 = [];
    for (let i = 0; i <= 12; i++) { const u = i / 12, [x, y, z] = at(u, sd), [x2, y2] = at(u, sd ? 0.93 : 0.07); pts.push(V(x * 1.01, y + 0.01, z)); pts2.push(V(x2 * 1.02, y2, z)); }
    K.add(tube(pts, [0.045, 0.045], [cols.trim], 6), cols.trim);
    K.add(tube(pts2, [0.03, 0.03], [shade(cols.trim, 0.85)], 5), cols.trim);
  }
  { const pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12, [, y, z] = at(u, 0.5); pts.push(V(0, y - 0.02, z)); }
    const [, ys, zs] = at(1, 0.5); pts.push(V(0, (ys + sheer(1)) / 2, zs + 0.05), V(0, sheer(1) + 0.06, zs - 0.02));
    K.add(tube(pts, [0.05, 0.05, 0.045, 0.04], [shade(cols.bottom, 0.7)], 6), cols.bottom); }
  return { at, half, sheer, keel };
}

// ---------- a rowing boat ----------
export function rowboat({ hull: hc = '#f4f1e6', trim = '#d84a3a', seed = 1, L = 3.8, B = 1.55 } = {}) {
  const K = kit(), wood = '#c99a62';
  const Hh = hull(K, { L, B, H: 0.42, D: 0.28, strakes: 5, transom: 0.6, cols: { bottom: shade(trim, 0.75), side: hc, top: trim, trim: shade(trim, 0.9) }, inside: '#c08a54', seed });
  // floorboards, thwarts on their risers, the stern seat
  for (let i = 0; i < 7; i++) K.bbox(0.11, 0.025, L * 0.62, shade(wood, 0.92 + (i % 2) * 0.08), { x: -0.33 + i * 0.11, y: -0.08, z: -0.05 });
  for (const zz of [-0.55, 0.45]) {
    const w = Hh.half((zz / L) + 0.5) * 2 * 0.9;
    K.bbox(w, 0.04, 0.24, wood, { y: 0.24, z: zz });
    for (const sx of [-1, 1]) K.bbox(0.04, 0.2, 0.05, shade(wood, 0.8), { x: sx * w * 0.32, y: 0.12, z: zz });
  }
  { const w = Hh.half(0.12) * 2 * 0.86; K.bbox(w, 0.04, 0.42, wood, { y: 0.24, z: -L / 2 + 0.42 }); }
  // rowlocks and the oars shipped along the thwarts
  for (const sx of [-1, 1]) {
    const [x, y, z] = Hh.at(0.62, sx < 0 ? 0 : 1);
    K.cyl(0.012, 0.012, 0.12, '#3a3d46', { x: x * 0.98, y: y + 0.08, z });
    K.torus(0.035, 0.008, '#3a3d46', { x: x * 0.98, y: y + 0.15, z, ry: Math.PI / 2 }, 10);
    const a = V(sx * 0.32, 0.32, -L * 0.3), b = V(sx * 0.42, 0.34, L * 0.32);
    K.rod(a, b, 0.022, '#d2b082');
    K.bbox(0.12, 0.015, 0.55, '#d2b082', { x: sx * 0.43, y: 0.34, z: L * 0.32 + 0.25, ry: sx * 0.03 });
    K.bbox(0.12, 0.016, 0.06, trim, { x: sx * 0.43, y: 0.341, z: L * 0.32 + 0.5, ry: sx * 0.03 });
  }
  // the painter: a ring on the stem, a coil of rope in the bow
  const [, ys, zs] = Hh.at(1, 0.5);
  K.torus(0.05, 0.01, '#3a3d46', { y: ys + 0.32, z: zs - 0.04 }, 10);
  for (let k = 0; k < 3; k++) K.torus(0.15 - k * 0.025, 0.018, '#d8c49a', { y: 0.0 + k * 0.03, z: L * 0.33, rx: Math.PI / 2 }, 14);
  // a bailer and a little fishing tackle box
  K.add(body([[0, 0], [0.07, 0.0], [0.08, 0.08], [0.07, 0.1]], { seg: 10, col: '#4a7ab0' }), '#4a7ab0', { x: 0.2, y: -0.06, z: -0.95 });
  K.bbox(0.3, 0.14, 0.18, '#3f7a52', { x: -0.22, y: 0.0, z: -0.9, ry: 0.2 });
  return K.done();
}

// ---------- the fishing boat ----------
export function fishingBoat({ hull: hc = '#2f6fa8', trim = '#f4f1e6', house = '#f4f1e6', roof = '#d8473a', name = 'PALLET' } = {}) {
  const K = kit(), L = 7.2, B = 3.0, wood = '#c99a62', iron = '#3a3d46';
  const Hh = hull(K, { L, B, H: 0.95, D: 0.55, strakes: 7, transom: 0.7, sheerUp: 0.35, cols: { bottom: '#b8402e', side: hc, top: trim, trim: shade(trim, 0.85) }, inside: '#e8e0cc', wl: -0.02 });
  const deckY = 0.42;
  // the deck: planks (stripes), between the inside of the bulwarks
  for (let i = 0; i < 12; i++) {
    const x = -1.32 + i * 0.24;
    let z0 = null, z1 = null;
    // trim each plank to the hull's width at its line
    for (let k = 0; k < 40; k++) { const u = k / 40; if (Hh.half(u) * 0.9 > Math.abs(x) + 0.12) { z0 = (u - 0.5) * L; break; } }
    for (let k = 40; k > 0; k--) { const u = k / 40; if (Hh.half(u) * 0.9 > Math.abs(x) + 0.12) { z1 = (u - 0.5) * L; break; } }
    if (z0 !== null && z1 !== null && z1 - z0 > 0.3) K.bbox(0.23, 0.04, z1 - z0, shade(wood, 0.9 + (i % 3) * 0.06), { x, y: deckY, z: (z0 + z1) / 2 });
  }
  // the wheelhouse: planked walls, corner posts, framed windows, a door
  const hz = 0.7, hw = 1.7, hd = 1.8, hh = 1.55, y0 = deckY + 0.02;
  for (let i = 0; i < 10; i++) {   // horizontal boards on all four sides
    const y = y0 + 0.08 + i * 0.155, c = shade(house, i % 2 ? 0.96 : 1.02);
    K.bbox(hw, 0.15, 0.05, c, { y, z: hz + hd / 2 });
    K.bbox(hw, 0.15, 0.05, c, { y, z: hz - hd / 2 });
    for (const sx of [-1, 1]) K.bbox(0.05, 0.15, hd, c, { x: sx * hw / 2, y, z: hz });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.bbox(0.09, hh, 0.09, shade(house, 0.88), { x: sx * hw / 2, y: y0 + hh / 2, z: hz + sz * hd / 2 });
  const win = (x, y, z, w, h, ry) => {
    const g = 0.04;
    K.bbox(w, h, 0.02, '#3d6fa8', { x, y, z, ry });
    K.bbox(w + 0.04, 0.12, 0.002, '#eaf4fa', { x: x + Math.cos(ry) * 0.0, y: y + h * 0.18, z: z + Math.cos(ry) * 0.012 + Math.sin(ry) * 0, ry, rz: 0.5 });
    for (const [dx, dy, ww, hh2] of [[0, h / 2, w + g * 2, g], [0, -h / 2, w + g * 2, g], [-w / 2, 0, g, h], [w / 2, 0, g, h], [0, 0, g * 0.6, h]])
      K.bbox(ww, hh2, 0.05, '#fbfaf4', { x: x + Math.cos(ry) * dx, y: y + dy, z: z - Math.sin(ry) * dx + Math.cos(ry) * 0.02, ry });
  };
  win(0, y0 + 1.05, hz + hd / 2 + 0.03, 1.2, 0.5, 0);           // the front window (toward the bow)
  for (const sx of [-1, 1]) win(sx * (hw / 2 + 0.03), y0 + 1.05, hz + 0.35, 0.6, 0.45, sx * Math.PI / 2);
  // the door at the back, ledged, with a brass handle and a porthole
  K.bbox(0.7, 1.3, 0.05, shade(house, 0.92), { x: 0.3, y: y0 + 0.67, z: hz - hd / 2 - 0.03 });
  for (const dy of [0.25, 1.05]) K.bbox(0.62, 0.08, 0.03, shade(house, 0.84), { x: 0.3, y: y0 + dy, z: hz - hd / 2 - 0.06 });
  K.torus(0.12, 0.025, '#d8b04a', { x: 0.3, y: y0 + 0.95, z: hz - hd / 2 - 0.06 }, 14);
  K.add(new THREE.CircleGeometry(0.11, 14).rotateY(Math.PI), '#3d6fa8', { x: 0.3, y: y0 + 0.95, z: hz - hd / 2 - 0.058 });
  K.cyl(0.02, 0.02, 0.1, '#d8b04a', { x: 0.55, y: y0 + 0.65, z: hz - hd / 2 - 0.09, rx: Math.PI / 2 });
  // the roof: an overhanging slab with a drip edge, a rail round it, the horn and a lamp
  const ry0 = y0 + hh + 0.06;
  K.bbox(hw + 0.4, 0.1, hd + 0.4, roof, { y: ry0, z: hz });
  K.bbox(hw + 0.44, 0.04, hd + 0.44, shade(roof, 0.75), { y: ry0 - 0.06, z: hz });
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) K.cyl(0.018, 0.018, 0.3, iron, { x: sx * (hw / 2 + 0.12), y: ry0 + 0.2, z: hz + sz * (hd / 2 + 0.1) });
  for (const sx of [-1, 1]) K.rod(V(sx * (hw / 2 + 0.12), ry0 + 0.34, hz - hd / 2 - 0.1), V(sx * (hw / 2 + 0.12), ry0 + 0.34, hz + hd / 2 + 0.1), 0.02, iron);
  K.add(body([[0, 0], [0.05, 0], [0.07, 0.04], [0.04, 0.2], [0.02, 0.24], [0, 0.24]], { seg: 10, col: '#d8b04a' }), '#d8b04a', { x: -0.5, y: ry0 + 0.05, z: hz + 0.5, rx: Math.PI / 2 - 0.2 });
  // the exhaust stack behind the wheelhouse, banded
  K.cyl(0.11, 0.12, 1.4, '#2f3640', { x: -0.62, y: y0 + 1.9, z: hz - hd / 2 - 0.2 });
  K.cyl(0.13, 0.13, 0.12, roof, { x: -0.62, y: y0 + 2.35, z: hz - hd / 2 - 0.2 });
  K.cyl(0.14, 0.12, 0.06, '#1e2228', { x: -0.62, y: y0 + 2.62, z: hz - hd / 2 - 0.2 });
  // the mast forward: a crosstree, a masthead lamp, stays to the bow and the rails
  const mz = 2.0, mt = deckY + 4.1;
  K.cyl(0.07, 0.1, mt - deckY, '#9a6a42', { y: (deckY + mt) / 2, z: mz }, 10);
  K.bbox(1.4, 0.07, 0.07, '#9a6a42', { y: mt - 0.6, z: mz });
  K.cyl(0.06, 0.06, 0.14, '#f2e6c8', { y: mt + 0.04, z: mz }); K.cyl(0.08, 0.08, 0.04, iron, { y: mt + 0.14, z: mz });
  for (const sx of [-1, 1]) { const [x, y, z] = Hh.at(0.72, sx < 0 ? 0 : 1); K.rod(V(sx * 0.65, mt - 0.6, mz), V(x * 0.95, y + 0.05, z), 0.008, '#d8c49a'); }
  { const [, ys, zs] = Hh.at(1, 0.5); K.rod(V(0, mt - 0.1, mz), V(0, Hh.sheer(1) + 0.05, zs - 0.15), 0.008, '#d8c49a'); void ys; }
  // a boom aft for the nets, its block and a hanging line
  K.rod(V(0, deckY + 1.2, mz - 0.1), V(0.3, deckY + 2.1, -L / 2 + 1.0), 0.05, '#9a6a42');
  K.rod(V(0.3, deckY + 2.1, -L / 2 + 1.0), V(0.3, deckY + 0.7, -L / 2 + 1.0), 0.01, '#d8c49a');
  K.bbox(0.1, 0.16, 0.07, iron, { x: 0.3, y: deckY + 0.65, z: -L / 2 + 1.0 });
  // stern: a heap of green net with corks along its edge, fish boxes, a buoy
  const net = body([[0, 0], [0.55, 0.0], [0.62, 0.12], [0.52, 0.3], [0.3, 0.42], [0, 0.46]], { seg: 14, ribs: 7, ribK: 0.22, col: '#4f8a64', col2: '#6aa47a', sx: 1.2, sz: 0.9 });
  K.add(net, '#4f8a64', { x: -0.45, y: deckY + 0.02, z: -L / 2 + 1.2 });
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; K.add(new THREE.SphereGeometry(0.05, 6, 4), '#e8a33a', { x: -0.45 + Math.cos(a) * 0.62, y: deckY + 0.1, z: -L / 2 + 1.2 + Math.sin(a) * 0.48 }); }
  for (const [x, z, k] of [[0.6, -L / 2 + 0.9, 0], [0.6, -L / 2 + 1.45, 1], [0.62, -L / 2 + 1.15, 2]]) {
    const y = deckY + 0.12 + (k === 2 ? 0.22 : 0);
    K.bbox(0.55, 0.22, 0.42, k === 1 ? '#3a74c8' : '#e8a33a', { x, y, z, ry: 0.1 * k });
    if (k !== 2) K.bbox(0.5, 0.02, 0.37, '#cfd8dc', { x, y: y + 0.1, z, ry: 0.1 * k });
  }
  // tyre fenders hanging over both sides on short ropes, a lifebuoy on the wheelhouse
  for (const sx of [-1, 1]) for (const u of [0.3, 0.55]) {
    const [x, y, z] = Hh.at(u, sx < 0 ? 0 : 1);
    K.rod(V(x * 0.97, y + 0.05, z), V(x * 1.08, y - 0.35, z), 0.01, '#d8c49a');
    K.torus(0.2, 0.08, '#1e2228', { x: x * 1.1, y: y - 0.55, z, ry: Math.PI / 2 }, 14);
  }
  K.torus(0.3, 0.06, '#e8402e', { x: hw / 2 + 0.06, y: y0 + 0.55, z: hz - 0.45, ry: Math.PI / 2 }, 16);
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4; K.bbox(0.07, 0.13, 0.13, '#fbfaf4', { x: hw / 2 + 0.06, y: y0 + 0.55 + Math.sin(a) * 0.3, z: hz - 0.45 + Math.cos(a) * 0.3, rx: -a }); }
  // the name on both bows: a white board with dark letters drawn as small blocks
  for (const sx of [-1, 1]) {
    const [x, y, z] = Hh.at(0.82, sx < 0 ? 0 : 1);
    K.bbox(0.02, 0.18, 0.9, '#fbfaf4', { x: x * 1.0 + sx * 0.02, y: y - 0.28, z, ry: sx * 0.22 });
    for (let i = 0; i < name.length; i++) K.bbox(0.012, 0.1, 0.06, '#24364a', { x: x * 1.0 + sx * 0.032, y: y - 0.28, z: z + (sx > 0 ? -1 : 1) * (0.35 - i * 0.12), ry: sx * 0.22 });
  }
  // stanchions and a rope rail along the bow, the anchor on its chock
  for (const sd of [0, 1]) {
    const pts = [];
    for (const u of [0.72, 0.84, 0.94]) { const [x, y, z] = Hh.at(u, sd); K.cyl(0.015, 0.015, 0.4, iron, { x: x * 0.93, y: y + 0.2, z }); pts.push(V(x * 0.93, y + 0.38, z)); }
    K.add(tube(pts, [0.012, 0.012], ['#d8c49a'], 5), '#d8c49a');
  }
  { const [, y, z] = Hh.at(0.93, 0.5); K.bbox(0.5, 0.06, 0.12, iron, { y: Hh.sheer(0.93) - 0.25, z: z - 0.05 }); K.bbox(0.06, 0.4, 0.06, iron, { y: Hh.sheer(0.93) - 0.1, z: z - 0.05 }); void y; }
  return K.done();
}

export const PREVIEW = {
  boats: (G, put) => { put(fishingBoat(), -2.5, 0, 0.6, 0.0); put(rowboat(), 3.2, 1, -0.5); put(rowboat({ hull: '#f4e7c8', trim: '#3d6fa8' }), 5.2, -1.5, 0.3); return '1,5,12,1,0.8,0'; },
};
