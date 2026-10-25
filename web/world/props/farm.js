// Farm props and planted fields (any farm, garden or allotment; Route 1's
// farm and Pallet's fields first). Builders return a THREE.Group standing on
// y = 0, front toward +z, like outdoor.js; the caller places and turns them.
//
//   cropField(G, field, heightAt, opts)  furrowed beds with crops planted
//                                       along them (crops.js), by kind
//   scarecrow  haybale  squareBale  wheelbarrow  wateringCan  toolRack
//   trough  splitRail(points)  trellis  farmShed  crateStack  sack
import * as THREE from 'three';
import * as O from './outdoor.js';
import * as CR from '../crops.js';
import { building } from './buildings.js';
import { rng } from '../terrain.js';
import { barkMaterial } from '../foliage.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const { texm, flat, shade, box, cyl, ball, beam, rope, put } = O;

// a chamfered post or board (cel rim light catches the bevel)
function bev(w, h, d, c = 0.02) {
  const s = new THREE.Shape(), x = w / 2, z = d / 2; c = Math.min(c, x * 0.45, z * 0.45);
  s.moveTo(-x + c, -z); s.lineTo(x - c, -z); s.lineTo(x, -z + c); s.lineTo(x, z - c); s.lineTo(x - c, z); s.lineTo(-x + c, z); s.lineTo(-x, z - c); s.lineTo(-x, -z + c); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2).translate(0, -h / 2, 0);
  return g;
}
const add = (P, g, m, x = 0, y = 0, z = 0, o = {}) => put(new THREE.Mesh(g, typeof m === 'string' ? flat(m) : m), P, x, y, z, o);

// ---------- planted fields ----------
// What each field kind grows, row by row (cycled): [crop, spacing along the
// row, stage(s)]. 'till' = freshly turned beds with a few seedlings.
const PLANS = {
  // (each kind is one set of instances, so a draw or two: a field grows a
  // handful of kinds, repeated in rows, not one of everything)
  crop: [['cabbage', 0.62, 2], ['cabbage', 0.62, 2], ['lettuce', 0.42, 2], ['corn', 0.5, 2], ['corn', 0.5, 2], ['corn', 0.5, 2],
    ['tomato', 0.75, 2], ['lettuce', 0.42, 2], ['pumpkin', 1.5, 2], ['sunflower', 0.7, 2]],
  wheat: [['wheat', 0.3, 3]],
  till: [['cabbage', 0.7, 0], ['lettuce', 0.5, 0], [null], ['carrot', 0.35, 0], [null]],
};
// field = { x, z, w (across rows), d (along rows), rot, kind }; skip(x, z) leaves gaps (scarecrow, paths)
export function cropField(G, f, heightAt, { rowW = 1.15, plan, skip = () => false, seed = 1, wind = 0.35 } = {}) {
  const rows = Math.max(2, Math.round(f.w / rowW));
  const spec = { cx: f.x, cz: f.z, w: f.w, d: f.d, rot: f.rot, rows, heightAt, mound: f.kind === 'wheat' ? 0.08 : 0.17, seed };
  const bed = new THREE.Mesh(CR.bedGeometry(spec), O.vcFlat());
  bed.receiveShadow = true; bed.castShadow = false; bed.userData.outline = false; bed.name = 'field_beds';
  G.add(bed);
  const P = plan || PLANS[f.kind] || PLANS.crop;
  // wheat is sown thick: several drills per bed
  const lines = f.kind === 'wheat' ? CR.bedRows({ ...spec, rows: rows * 3, spacing: 0.3, jitter: 0.1, seed: seed + 3 }) : null;
  const byKind = new Map();
  const R = rng(seed * 7 + 1);
  const rowsPts = lines || CR.bedRows({ ...spec, spacing: 0.1, seed: seed + 3 });
  rowsPts.forEach((row, i) => {
    const [kind, sp, stage] = P[(lines ? Math.floor(i / 3) : i) % P.length];
    if (!kind) return;
    // re-space along the row
    let acc = 99;
    for (let k = 0; k < row.length; k++) {
      acc += k ? Math.hypot(row[k][0] - row[k - 1][0], row[k][2] - row[k - 1][2]) : 0;
      if (acc < sp) continue;
      acc = 0;
      const p = row[k];
      if (skip(p[0], p[2]) || R() < 0.04) continue;
      const key = kind + '|' + JSON.stringify(stage);
      if (!byKind.has(key)) byKind.set(key, { kind, stage, pts: [] });
      byKind.get(key).pts.push(p);
    }
  });
  for (const { kind, stage, pts } of byKind.values()) CR.plantAt(G, kind, pts, { stage, seeds: 1, wind, fade: [118, 124] });
  return { rows, bed };
}

// ---------- the scarecrow ----------
// A stick frame (post, cross arm, braces) stuffed into an old patched coat
// and dungarees, rope belt, straw tufts at the cuffs, collar and boots, a
// sack head with a stitched face under a wide straw hat with a ribbon, a
// crow-shaped PIDGEY decoy... no: one real bird sits on the hat in the game.
export function scarecrow({ coat = '#5a7ab0', pants = '#6a5a3a', hat = '#e6c86a', ribbon = '#c8312e', seed = 1 } = {}) {
  const G = new THREE.Group(), R = rng(seed);
  const wood = barkMaterial('#8a6a4a', 'smooth', 0);
  const stick = (a, b, r) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r * 0.85, r, d.length(), 7); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize())); const m = a.clone().add(b).multiplyScalar(0.5); return add(G, g, wood, m.x, m.y, m.z); };
  stick(V(0, -0.4, 0), V(0, 2.05, 0), 0.06);
  stick(V(-0.95, 1.62, 0), V(0.95, 1.6, 0), 0.04);
  stick(V(-0.4, 1.62, -0.05), V(0, 1.2, -0.05), 0.025); stick(V(0.4, 1.6, -0.05), V(0, 1.2, -0.05), 0.025);
  // the coat: a stuffed body, sleeves along the arm, lapels, patches, buttons
  const body = new THREE.LatheGeometry([[0.001, 0.98], [0.22, 1.0], [0.27, 1.12], [0.25, 1.35], [0.3, 1.55], [0.22, 1.66], [0.08, 1.7], [0.001, 1.7]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
  body.scale(1, 1, 0.66);
  add(G, body, coat);
  for (const sx of [-1, 1]) {
    const sl = new THREE.CylinderGeometry(0.1, 0.13, 0.62, 8, 1, true).rotateZ(Math.PI / 2);
    add(G, sl, shade(coat, 0.95), sx * 0.52, 1.6, 0, { rz: sx * 0.04 });
    add(G, new THREE.TorusGeometry(0.11, 0.03, 5, 10).rotateY(Math.PI / 2), shade(coat, 0.75), sx * 0.83, 1.6, 0);
    // straw spilling from the cuffs
    for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; const st = new THREE.CylinderGeometry(0.008, 0.012, 0.22 + R() * 0.1, 3); st.rotateZ(sx * (Math.PI / 2 + (R() - 0.5) * 0.8)); add(G, st, '#e8cf74', sx * (0.96 + R() * 0.03), 1.6 + Math.sin(a) * 0.06 - 0.04, Math.cos(a) * 0.06, { line: false, shadow: false }); }
  }
  for (const sx of [-1, 1]) { const l = new THREE.BoxGeometry(0.1, 0.42, 0.03); l.rotateZ(sx * 0.35); add(G, l, shade(coat, 0.8), sx * 0.1, 1.48, 0.19, { rx: -0.15 }); }
  add(G, new THREE.PlaneGeometry(0.18, 0.16), '#d8b04a', 0.13, 1.28, 0.205, { line: false, ry: 0.15 });
  add(G, new THREE.PlaneGeometry(0.14, 0.14), '#c86a5a', -0.16, 1.5, 0.215, { line: false, ry: -0.2 });
  for (let k = 0; k < 3; k++) add(G, new THREE.SphereGeometry(0.022, 6, 4), '#2a1e16', 0.02, 1.52 - k * 0.15, 0.2 + k * 0.01, { line: false });
  add(G, new THREE.TorusGeometry(0.25, 0.022, 4, 14).rotateX(Math.PI / 2).scale(1, 1, 0.68), '#c8a86a', 0, 1.1, 0);
  // dungarees: two stuffed legs hanging, straw at the ankles, old boots
  for (const sx of [-1, 1]) {
    add(G, new THREE.CylinderGeometry(0.1, 0.12, 0.62, 8), pants, sx * 0.12, 0.76, 0.02, { rz: sx * 0.06 });
    for (let k = 0; k < 5; k++) add(G, new THREE.CylinderGeometry(0.006, 0.01, 0.16, 3), '#e8cf74', sx * 0.12 + (R() - 0.5) * 0.12, 0.42, (R() - 0.5) * 0.12, { rz: (R() - 0.5) * 0.9, line: false, shadow: false });
    const boot = new THREE.CapsuleGeometry(0.07, 0.14, 3, 6).rotateX(Math.PI / 2); add(G, boot, '#3a2a20', sx * 0.13, 0.36, 0.06);
  }
  // collar straw and the head: a stuffed sack tied at the neck, a stitched face
  for (let k = 0; k < 10; k++) { const a = k / 10 * 6.28; add(G, new THREE.CylinderGeometry(0.006, 0.01, 0.18, 3), '#e8cf74', Math.cos(a) * 0.1, 1.74, Math.sin(a) * 0.08, { rx: Math.sin(a) * 0.9, rz: -Math.cos(a) * 0.9, line: false, shadow: false }); }
  const head = add(G, new THREE.SphereGeometry(0.21, 12, 9), texm(O.thatch('#e4cfa0')), 0, 1.97, 0); head.scale.set(1, 1.08, 0.95);
  add(G, new THREE.TorusGeometry(0.1, 0.02, 4, 10).rotateX(Math.PI / 2), '#c8a86a', 0, 1.8, 0);
  for (const sx of [-1, 1]) { add(G, new THREE.TorusGeometry(0.035, 0.01, 4, 8), '#2a1e16', sx * 0.075, 2.0, 0.19, { line: false }); add(G, new THREE.BoxGeometry(0.06, 0.01, 0.01), '#2a1e16', sx * 0.075, 2.0, 0.205, { rz: 0.7, line: false }); }
  for (let k = 0; k < 5; k++) add(G, new THREE.BoxGeometry(0.035, 0.008, 0.01), '#2a1e16', -0.08 + k * 0.04, 1.9 - Math.sin(k / 4 * Math.PI) * 0.025, 0.195, { line: false });
  add(G, new THREE.BoxGeometry(0.06, 0.06, 0.01), '#b05a3a', 0.12, 2.06, 0.18, { line: false, rz: 0.4 });   // a patch on the sack
  // the straw hat: a wide floppy brim, a crown, a ribbon band, a frayed edge
  const brim = new THREE.CylinderGeometry(0.42, 0.44, 0.03, 18, 1); const bp = brim.attributes.position;
  for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i), r = Math.hypot(x, z); bp.setY(i, bp.getY(i) - Math.max(0, r - 0.22) * 0.25 + Math.sin(Math.atan2(z, x) * 3) * 0.02 * (r / 0.44)); }
  brim.computeVertexNormals();
  add(G, brim, texm(O.thatch(hat)), 0, 2.15, 0);
  add(G, new THREE.CylinderGeometry(0.17, 0.21, 0.2, 14), texm(O.thatch(hat)), 0, 2.25, 0);
  add(G, new THREE.SphereGeometry(0.17, 12, 6, 0, 6.28, 0, Math.PI / 2), texm(O.thatch(hat)), 0, 2.34, 0).scale.y = 0.4;
  add(G, new THREE.CylinderGeometry(0.212, 0.212, 0.05, 14), ribbon, 0, 2.18, 0, { line: false });
  for (let k = 0; k < 14; k++) { const a = k / 14 * 6.28; add(G, new THREE.CylinderGeometry(0.004, 0.006, 0.06, 3), shade(hat, 0.9), Math.cos(a) * 0.44, 2.07, Math.sin(a) * 0.44, { rx: Math.sin(a) * 0.6, rz: -Math.cos(a) * 0.6, line: false, shadow: false }); }
  G.rotation.y = 0;
  return G;
}

// ---------- hay ----------
// a round bale: soft rounded edges, straw texture, wrapped in net with twine
// bands, a few loose wisps; lies on its side (axis along x)
export function haybale({ r = 0.62, L = 1.2, col = '#e2c46a', seed = 1 } = {}) {
  const G = new THREE.Group(), R = rng(seed);
  const prof = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10, a = (t - 0.5) * Math.PI; prof.push(new THREE.Vector2(r * (0.88 + 0.12 * Math.cos(a) ** 0.35), L / 2 * Math.sin(a) * 1.0)); }
  prof.unshift(new THREE.Vector2(0.001, -L / 2)); prof.push(new THREE.Vector2(0.001, L / 2));
  const g = new THREE.LatheGeometry(prof, 18).rotateZ(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const n = 1 + (R() - 0.5) * 0.025; p.setY(i, p.getY(i) * n); p.setZ(i, p.getZ(i) * n); }
  g.computeVertexNormals();
  const m = add(G, g, texm(O.thatch(col)), 0, r * 0.97, 0); void m;
  // the spiral of the roll on its ends
  for (const sx of [-1, 1]) for (let k = 1; k <= 3; k++) add(G, new THREE.TorusGeometry(r * k / 3.6, 0.012, 3, 18).rotateY(Math.PI / 2), shade(col, 0.72), sx * (L / 2 + 0.005), r * 0.97, 0, { line: false, shadow: false });
  // twine bands round it
  for (let k = 0; k < 4; k++) add(G, new THREE.TorusGeometry(r * 1.002, 0.012, 4, 24).rotateY(Math.PI / 2), '#d8763a', -L * 0.36 + k * L * 0.24, r * 0.97, 0, { line: false, shadow: false });
  // loose wisps at its foot
  for (let k = 0; k < 8; k++) add(G, new THREE.CylinderGeometry(0.006, 0.01, 0.3, 3), shade(col, 0.9 + R() * 0.2), (R() - 0.5) * L * 1.2, 0.02, (R() < 0.5 ? -1 : 1) * (r * 0.7 + R() * 0.3), { rz: Math.PI / 2 + (R() - 0.5) * 0.4, ry: R() * 3, line: false, shadow: false });
  return G;
}
// a square bale with two strings
export function squareBale({ col = '#e8cc72' } = {}) {
  const G = new THREE.Group();
  add(G, bev(0.9, 0.42, 0.48, 0.05), texm(O.thatch(col)), 0, 0.21, 0);
  for (const sx of [-0.22, 0.22]) add(G, new THREE.TorusGeometry(0.33, 0.01, 3, 4).rotateY(Math.PI / 2).rotateX(Math.PI / 4).scale(1, 0.67, 0.77), '#d8763a', sx, 0.21, 0, { line: false, shadow: false });
  return G;
}

// ---------- tools and odds ----------
export function wheelbarrow({ col = '#4f7a6a' } = {}) {
  const G = new THREE.Group();
  // the tray: a tapered open box of sheet metal
  const tray = new THREE.CylinderGeometry(0.5, 0.36, 0.34, 4, 1, true).rotateY(Math.PI / 4).scale(1.25, 1, 0.82);
  add(G, tray, flat(col, THREE.DoubleSide), 0, 0.62, 0);
  add(G, new THREE.TorusGeometry(0.5, 0.018, 4, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4).scale(1.25, 1, 0.82), shade(col, 0.8), 0, 0.79, 0);
  add(G, new THREE.BoxGeometry(0.62, 0.02, 0.4), shade(col, 0.6), 0, 0.46, 0, { line: false });
  // soil in it
  add(G, new THREE.SphereGeometry(0.4, 10, 6, 0, 6.28, 0, Math.PI / 2).scale(1.3, 0.35, 0.8), '#6a4a30', 0, 0.62, 0, { line: false });
  // the wheel at the front, the handles and legs at the back
  add(G, new THREE.TorusGeometry(0.2, 0.05, 6, 16), '#2c2c30', 0.72, 0.22, 0);
  add(G, new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8).rotateX(Math.PI / 2), '#8a8a90', 0.72, 0.22, 0, { line: false });
  for (const sz of [-1, 1]) {
    beam(V(0.72, 0.22, sz * 0.06), V(-0.95, 0.68, sz * 0.26), 0.04, '#9a6a42', G);
    add(G, new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6).rotateZ(Math.PI / 2), '#3a2a20', -1.0, 0.69, sz * 0.27, { line: false });
    beam(V(-0.4, 0.5, sz * 0.18), V(-0.45, 0.0, sz * 0.2), 0.035, '#9a6a42', G);
  }
  return G;
}
export function wateringCan({ col = '#5f8fb0' } = {}) {
  const G = new THREE.Group();
  add(G, new THREE.CylinderGeometry(0.13, 0.14, 0.26, 12), col, 0, 0.13, 0);
  add(G, new THREE.TorusGeometry(0.13, 0.015, 4, 12).rotateX(Math.PI / 2), shade(col, 0.8), 0, 0.26, 0, { line: false });
  add(G, new THREE.TorusGeometry(0.1, 0.015, 4, 10, Math.PI), shade(col, 0.85), 0, 0.27, 0, { ry: Math.PI / 2 });
  const sp = add(G, new THREE.CylinderGeometry(0.018, 0.03, 0.34, 6), col, 0.2, 0.2, 0, { rz: -0.95 }); void sp;
  add(G, new THREE.CylinderGeometry(0.05, 0.025, 0.06, 8), shade(col, 0.85), 0.33, 0.31, 0, { rz: -0.95, line: false });
  return G;
}
// a tool rack against a wall or fence: a board on posts, a rake, a hoe, a spade, a fork
export function toolRack() {
  const G = new THREE.Group(), w = barkMaterial('#9a7a4a', 'smooth', 0);
  for (const sx of [-1, 1]) add(G, bev(0.08, 1.6, 0.08), '#7a5a3e', sx * 0.6, 0.8 - 0.2, 0);
  add(G, bev(1.4, 0.12, 0.05), '#8a6a4a', 0, 1.35, 0.03);
  const tools = [['rake', -0.42], ['hoe', -0.14], ['spade', 0.14], ['fork', 0.42]];
  for (const [k, x] of tools) {
    const T = new THREE.Group(); T.position.set(x, 0, 0.1); T.rotation.z = (x > 0 ? -1 : 1) * 0.06; G.add(T);
    add(T, new THREE.CylinderGeometry(0.018, 0.02, 1.45, 6), w, 0, 0.72 + 0.22, 0);
    const steel = '#9aa2a8';
    if (k === 'rake') { add(T, bev(0.36, 0.04, 0.04, 0.008), steel, 0, 0.22, 0); for (let i = 0; i < 9; i++) add(T, new THREE.CylinderGeometry(0.006, 0.004, 0.09, 3), steel, -0.16 + i * 0.04, 0.17, 0.02, { line: false }); }
    if (k === 'hoe') add(T, bev(0.14, 0.12, 0.012, 0.004), steel, 0, 0.25, 0.04, { rx: 0.3 });
    if (k === 'spade') { add(T, bev(0.17, 0.26, 0.015, 0.03), steel, 0, 0.12, 0); add(T, new THREE.TorusGeometry(0.06, 0.012, 4, 8, Math.PI), w, 0, 1.68, 0, { line: false }); }
    if (k === 'fork') { add(T, bev(0.16, 0.04, 0.02, 0.006), steel, 0, 0.3, 0); for (let i = 0; i < 4; i++) add(T, new THREE.CylinderGeometry(0.007, 0.004, 0.26, 4), steel, -0.06 + i * 0.04, 0.16, 0, { line: false }); }
  }
  return G;
}
// a stone water trough with a hand pump
export function trough({ L = 1.6 } = {}) {
  const G = new THREE.Group(), st = texm(O.stonesTex('#b4ad98'));
  add(G, bev(L, 0.55, 0.6, 0.06), st, 0, 0.28, 0);
  add(G, new THREE.BoxGeometry(L - 0.2, 0.02, 0.42), new THREE.MeshBasicMaterial({ color: '#4f8aa0' }), 0, 0.5, 0, { line: false, shadow: false });
  const P = new THREE.Group(); P.position.set(L / 2 - 0.15, 0, -0.42); G.add(P);
  add(P, new THREE.CylinderGeometry(0.07, 0.09, 1.1, 8), '#3f5a50', 0, 0.55, 0);
  add(P, new THREE.CylinderGeometry(0.03, 0.03, 0.32, 6).rotateX(Math.PI / 2), '#3f5a50', 0, 0.95, 0.16);
  add(P, new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), '#3f5a50', -0.15, 1.15, 0, { rz: 0.9 });
  add(P, new THREE.SphereGeometry(0.09, 8, 6), '#3f5a50', 0, 1.14, 0);
  return G;
}
// a split-rail fence along points [[x, z]...] (world or local, ground by heightAt)
export function splitRail(points, heightAt, { col = '#8a6a4a', post = 2.4 } = {}) {
  const G = new THREE.Group(), wood = barkMaterial(col, 'smooth', 0);
  const posts = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / post));
    for (let k = 0; k < n; k++) posts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  posts.push(points[points.length - 1]);
  posts.forEach(([x, z], i) => {
    const y = heightAt(x, z), g = new THREE.CylinderGeometry(0.07, 0.085, 1.25, 6);
    put(new THREE.Mesh(g, wood), G, x, y + 0.5, z, { ry: i * 1.3 });
    if (i) {
      const [px, pz] = posts[i - 1], py = heightAt(px, pz);
      for (const h of [0.45, 0.85]) {
        const a = V(px, py + h, pz), b = V(x, y + h + (i % 2 ? 0.04 : -0.03), z);
        const r = new THREE.CylinderGeometry(0.045, 0.055, a.distanceTo(b) + 0.2, 5);
        r.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()));
        const m = a.clone().add(b).multiplyScalar(0.5);
        put(new THREE.Mesh(r, wood), G, m.x, m.y, m.z);
      }
    }
  });
  return G;
}
// a sack of grain and a stack of crates of produce
export function sack({ col = '#d8c49a' } = {}) {
  const G = new THREE.Group();
  const g = new THREE.SphereGeometry(0.28, 10, 8); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y < 0 ? y * 0.7 : y * 1.4); p.setX(i, p.getX(i) * (y > 0.2 ? 0.7 : 1)); p.setZ(i, p.getZ(i) * (y > 0.2 ? 0.7 : 0.85)); }
  g.computeVertexNormals();
  add(G, g, texm(O.thatch(col)), 0, 0.22, 0);
  add(G, new THREE.TorusGeometry(0.08, 0.02, 4, 8).rotateX(Math.PI / 2), '#a8763a', 0, 0.5, 0, { line: false });
  return G;
}
export function crateStack({ produce = ['#e0402c', '#8fce5a', '#f0902a'], seed = 1 } = {}) {
  const G = new THREE.Group(), R = rng(seed), pw = texm(O.planks('#c8a272'));
  produce.forEach((c, i) => {
    const C = new THREE.Group(); C.position.set((i % 2) * 0.62 - 0.3, Math.floor(i / 2) * 0.36, (R() - 0.5) * 0.1); C.rotation.y = (R() - 0.5) * 0.2; G.add(C);
    for (const sz of [-1, 1]) for (const y of [0.07, 0.24]) add(C, bev(0.56, 0.1, 0.03, 0.01), pw, 0, y, sz * 0.2);
    for (const sx of [-1, 1]) for (const y of [0.07, 0.24]) add(C, bev(0.03, 0.1, 0.4, 0.01), pw, sx * 0.27, y, 0);
    add(C, new THREE.BoxGeometry(0.52, 0.02, 0.38), pw, 0, 0.02, 0, { line: false });
    if (Math.floor(i / 2) === Math.floor((produce.length - 1) / 2) || i >= produce.length - 2) for (let k = 0; k < 9; k++) add(C, new THREE.SphereGeometry(0.07, 7, 5), c, -0.17 + (k % 3) * 0.17, 0.3, -0.12 + Math.floor(k / 3) * 0.12, { line: false });
  });
  return G;
}
// a bean / pea trellis: posts, a top rail, a net of string, climbing vines
export function trellis({ L = 3, h = 1.8 } = {}) {
  const G = new THREE.Group(), wood = barkMaterial('#9a7a4a', 'smooth', 0);
  for (const sx of [-1, 1]) add(G, new THREE.CylinderGeometry(0.04, 0.05, h + 0.3, 6), wood, sx * L / 2, h / 2, 0);
  add(G, new THREE.CylinderGeometry(0.03, 0.03, L, 6).rotateZ(Math.PI / 2), wood, 0, h, 0);
  for (let i = 1; i < 10; i++) add(G, new THREE.CylinderGeometry(0.004, 0.004, h - 0.1, 3), '#e8dcb0', -L / 2 + L * i / 10, h / 2, 0, { line: false, shadow: false });
  for (let j = 1; j < 5; j++) add(G, new THREE.CylinderGeometry(0.004, 0.004, L, 3).rotateZ(Math.PI / 2), '#e8dcb0', 0, h * j / 5, 0, { line: false, shadow: false });
  O.vines(G, V(-L / 2, h, 0.02), V(L / 2, h, 0.02), 8, h * 0.85, 77);
  return G;
}
// the farm shed: plank walls on a stone footing, a corrugated lean-to roof
// with gutters, a ledged and braced door, a four-pane window, a tool rack and
// a water butt against it
export function farmShed({ W = 3.4, D = 2.6, wood = '#9a6a42', roof = '#8a9a9a', seed = 1 } = {}) {
  const G = building({ W, D, floors: 1, floorH: 2.3, trim: shade(wood, 0.72), seed,
    plinth: { h: 0.22, deep: 1.0, kind: 'stone', col: '#a8a290' },
    wall: { kind: 'planks', col: wood }, cornerBoards: true,
    roof: { type: 'shed', cover: 'corrugated', col: roof, rise: 0.55, over: 0.4, gableOver: 0.3, trim: shade(wood, 0.72) },
    openings: [{ face: 'front', kind: 'door', x: 0.55, w: 1.1, h: 1.95, col: shade(wood, 0.8), glass: false, step: '#b4ad98' }, { face: 'front', kind: 'window', x: -0.95, w: 0.7, h: 0.6, y: 0.95, panes: [2, 2], curtains: null },
      { face: 'right', kind: 'window', x: 0, w: 0.7, h: 0.6, y: 0.95, panes: [2, 2], curtains: null }],
    moss: true, ivy: [{ face: 'left', x: 0.2, w: 1.6, h: 2.0 }] });
  // the door's ledges and Z brace
  const DG = new THREE.Group(); DG.position.set(0.55, 0.22, D / 2 + 0.04); G.add(DG);
  for (const y of [0.35, 1.0, 1.65]) add(DG, bev(1.0, 0.1, 0.04, 0.01), shade(wood, 0.7), 0, y, 0.0, { line: false });
  add(DG, new THREE.BoxGeometry(0.09, 0.85, 0.035), shade(wood, 0.7), 0, 0.68, 0.0, { rz: -0.95, line: false });
  add(DG, new THREE.BoxGeometry(0.09, 0.85, 0.035), shade(wood, 0.7), 0, 1.33, 0.0, { rz: -0.95, line: false });
  const tr = toolRack(); tr.position.set(-W / 2 - 0.12, 0, 0.1); tr.rotation.y = -Math.PI / 2; G.add(tr);
  const wb = new THREE.Group(); wb.position.set(W / 2 + 0.4, 0, -D / 2 + 0.5); G.add(wb);
  add(wb, new THREE.CylinderGeometry(0.38, 0.34, 0.9, 12), texm(O.planks('#8a5a36')), 0, 0.45, 0);
  for (const y of [0.15, 0.75]) add(wb, new THREE.TorusGeometry(0.37, 0.02, 4, 16).rotateX(Math.PI / 2), '#3a3d46', 0, y, 0, { line: false });
  add(wb, new THREE.CircleGeometry(0.34, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#2e5e74' }), 0, 0.86, 0, { line: false, shadow: false });
  G.userData.foot = { hw: W / 2 + 0.4, hd: D / 2 + 0.3 };
  return G;
}

// ---------- preview scenes (kit.html) ----------
export const PREVIEW = {
  farm_props: (G, put) => {
    put(scarecrow(), -3, 0, 0.2); put(haybale(), -0.8, 0.4, 0.3); put(haybale({ seed: 2 }), 0.8, -0.6, 1.4); put(squareBale(), 2.2, 0.8, 0.2);
    put(wheelbarrow(), 3.8, 0.6, 2.4); put(wateringCan(), 1.5, 1.6, 0.4); put(toolRack(), 5.2, -1, 0); put(trough(), -5.2, 0.3, 0.3); put(sack(), 2.8, 1.8); put(crateStack(), 6.5, 1.2, -0.3);
    put(trellis(), 0, -3, 0);
    return '0.5,2.4,7.2,0.5,0.9,0';
  },
  farm_shed: (G, put) => { put(farmShed(), 0, 0, 0.3); return '2.5,2.6,6.5,0,1.3,0'; },
  scarecrow: (G, put) => { put(scarecrow(), 0, 0, 0.2); return '0.6,1.8,3.0,0,1.5,0'; },
};
void cyl; void ball; void rope; void box; void bev;
