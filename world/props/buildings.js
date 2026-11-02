// The building kit: parametric houses, cottages, sheds, shops and pavilions
// for every town and route (Route 1 first; Viridian and later towns reuse it).
//
//   building(spec) -> THREE.Group, footprint centred on the origin, the
//   ground floor at y = 0, its front (door side) toward +z.
//
// QUALITY CHECKLIST (every building made here meets it; keep it so):
//  - walls are solid volumes (closed; nothing to see into), on a plinth that
//    runs below the ground, with corner boards or quoins and a darker grime
//    band at the foot (vertex colour; moss on the back face if `moss`)
//  - roofs have thickness, eaves that overhang with fascia boards, bargeboards
//    on the gables, a ridge cap, and real courses (tile / shingle / slate
//    rows stepped in the geometry, thatch as a thick rounded mat, corrugated
//    sheet as a wave), gutters and downpipes where they belong
//  - windows: a frame with a chamfered sill, mullions and transoms, glass
//    with a reflection band over a dim room, curtains; doors: an architrave,
//    raised panels, a handle, a step; shutters and flower boxes on request
//  - chimneys with a corbel band, a cap and pots; porches with posts, rails,
//    balusters and steps; lamps, house numbers and signs as asked
//  - everything cel-shaded from the town's BUILD bands; repeated painted
//    surfaces are the shared neutral pictures of outdoor.js, tinted
//
// spec (all optional):
//   W, D            footprint (x, z) in metres
//   floors, floorH  storeys and their height (2.8)
//   plinth          { h: 0.45, deep: 1.2, kind: 'stone' | 'brick', col }
//   wall            { kind: 'plaster' | 'siding' | 'brick' | 'stone' | 'planks' | 'timber', col, upper: kind for the upper floors, frame: beam colour (timber) }
//   trim            colour of corner boards, frames, fascias
//   roof            { type: 'gable' | 'hip' | 'shed' | 'mansard' | 'flat', cover: 'clay' | 'kawara' | 'shingle' | 'slate' | 'thatch' | 'corrugated' | 'moss',
//                     col, rise, over (eaves), gableOver, axis: 'x' (ridge along x, gables at the sides) | 'z', ridge: colour, gutters, moss }
//   openings        [{ face: 'front'|'back'|'left'|'right', kind: 'window'|'door'|'double'|'round'|'shop'|'vent', x, y, w, h, panes: [cols, rows],
//                     shutters, box (flower box), curtains, lamp, number, step, canopy }]
//   chimney         { x, z, w, col, kind: 'brick' | 'stone' } (or a list)
//   porch           { w, d, x, posts, rail, roof: 'shed' | 'gable', col, steps }
//   awning          { face, x, w, col, col2 } (striped canvas over a shop front)
//   sign            { text, sub, face, y, w, col, fg }
//   dormers         [{ x, w }] on the front slope (gable roofs along x)
//   ivy             [{ face, x, w, h }]   vines: [{ face }] from the eaves
//   seed            variation
import * as THREE from 'three';
import { toon } from '../toon.js';
import * as O from './outdoor.js';
import { leafMaterial, pushCard, toGeometry, cards, TILE } from '../foliage.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const { texm, flat, shade } = O;

// ---------- geometry: solids from corner points ----------
// A slab from a planar quad (p0..p3 counter-clockwise seen from its outside,
// i.e. from where `n` points) pushed `th` back along -n. Flat normals, uvs in
// metres along (e, s) (e.g. along the eave, up the slope). p2 may equal p3
// (a triangle). `butt` lifts the lower edge (p0-p1) by that much outward:
// a tile course's thick lower lip.
function slab(p0, p1, p2, p3, th, { e, s, uvs = 0.66, vs = null, butt = 0, s0 = 0 } = {}) {
  vs = vs ?? uvs;
  const n = p1.clone().sub(p0).cross(p3.clone().sub(p0)).normalize();
  if (!isFinite(n.x)) n.copy(p1.clone().sub(p0).cross(p2.clone().sub(p0)).normalize());
  const top = [p0, p1, p2, p3].map((p) => p.clone());
  if (butt) { top[0].addScaledVector(n, butt); top[1].addScaledVector(n, butt); }
  const bot = [p0, p1, p2, p3].map((p) => p.clone().addScaledVector(n, -th));
  const E = e || p1.clone().sub(p0).normalize(), S = s || n.clone().cross(E).normalize();
  const pos = [], nor = [], uv = [];
  const quad = (a, b, c, d) => {
    const nn = b.clone().sub(a).cross(d.clone().sub(a));
    if (nn.lengthSq() < 1e-12) nn.copy(c.clone().sub(b).cross(d.clone().sub(b)));
    nn.normalize();
    for (const t of [[a, b, c], [a, c, d]]) {
      if (t[1].distanceToSquared(t[2]) < 1e-10 || t[0].distanceToSquared(t[2]) < 1e-10) continue;
      for (const p of t) { pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); uv.push(p.dot(E) * uvs, (p.dot(S) - s0) * vs); }
    }
  };
  quad(top[0], top[1], top[2], top[3]);
  quad(bot[0], bot[3], bot[2], bot[1]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(bot[i], bot[j], top[j], top[i]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
// vertex colours on a geometry: a grime band low down, moss on a face
function grime(g, { y0 = 0, band = 0.7, k = 0.74, moss = null, top = null } = {}) {
  const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) - y0;
    let r = 1, gg = 1, b = 1;
    const t = Math.min(1, Math.max(0, y / band)), f = k + (1 - k) * t * t * (3 - 2 * t);
    r *= f; gg *= f; b *= f * 0.98;
    if (top !== null && p.getY(i) > top - 0.4) { const u = Math.min(1, (p.getY(i) - (top - 0.4)) / 0.4); r *= 1 - 0.1 * u; gg *= 1 - 0.1 * u; b *= 1 - 0.06 * u; }
    if (moss && n && n.getX(i) * moss.x + n.getZ(i) * moss.z > 0.5 && y < 1.6) { const m = 1 - Math.min(1, y / 1.6); r *= 1 - 0.28 * m; gg *= 1 - 0.06 * m; b *= 1 - 0.32 * m; }
    c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const boxG = (w, h, d, uvs = 0.5) => O.put ? wuvBox(w, h, d, uvs) : null;
function wuvBox(w, h, d, uvs = 0.5, segY = 1) {
  const g = new THREE.BoxGeometry(w, h, d, 1, segY, 1).toNonIndexed();
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, p.getX(i) * uvs, p.getZ(i) * uvs);
    else if (ax > 0.5) uv.setXY(i, p.getZ(i) * uvs, p.getY(i) * uvs);
    else uv.setXY(i, p.getX(i) * uvs, p.getY(i) * uvs);
  }
  return g;
}
// add a mesh
function mesh(P, g, m, o = {}) {
  const me = new THREE.Mesh(g, typeof m === 'string' ? flat(m) : m);
  if (o.at) me.position.copy(o.at);
  if (o.ry) me.rotation.y = o.ry;
  me.castShadow = o.shadow !== false; me.receiveShadow = true;
  me.userData.outline = o.line === false ? false : 'solid';
  P.add(me);
  return me;
}
// a chamfered box (a bevel on the vertical edges and the top): posts, frames, sills
function bevelBox(w, h, d, c = 0.03) {
  const s = new THREE.Shape();
  const x = w / 2, z = d / 2; c = Math.min(c, x * 0.45, z * 0.45);
  s.moveTo(-x + c, -z); s.lineTo(x - c, -z); s.lineTo(x, -z + c); s.lineTo(x, z - c); s.lineTo(x - c, z); s.lineTo(-x + c, z); s.lineTo(-x, z - c); s.lineTo(-x, -z + c); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);   // shape in x/z, height up y (0..h)
  g.translate(0, -h / 2, 0);
  return g.toNonIndexed();
}
const wallMat = (kind, col, vc = true) => {
  const t = kind === 'siding' ? O.siding(col) : kind === 'brick' ? O.bricks(col) : kind === 'stone' ? O.stonesTex(col) : kind === 'planks' ? O.planks(col) : O.plaster(col);
  return texm(t, '#ffffff', undefined, vc);
};
const coverMat = (cover, col) => {
  const t = cover === 'kawara' ? O.kawara(col) : cover === 'shingle' ? O.shingles(col) : cover === 'thatch' ? O.thatch(col) : cover === 'slate' ? O.shingles(col) : O.clay(col);
  return texm(t);
};
const FACES = { front: [0, 1], back: [0, -1], right: [1, 0], left: [-1, 0] };
// spec.lod 'far' (scenery a hundred metres off: the city beyond the gate):
// the same shapes without the small parts (courses, mullions, curtains,
// gutters, flowers), so a skyline of houses stays light
let FAR = false;

// ---------- windows and doors (built facing +z, the wall's face at z = 0) ----------
export function windowUnit(P, { w = 1.1, h = 1.3, panes = [2, 2], frame = '#fbfaf4', shutters = null, box = null, curtains = '#f2e6c8', arch = false, round = false } = {}) {
  const G = new THREE.Group(); P.add(G);
  const fd = 0.1, fw = 0.09;
  if (round) {
    const ring = new THREE.TorusGeometry(w / 2, 0.06, 6, 20); mesh(G, ring, frame, { at: V(0, 0, 0.04) });
    const gl = new THREE.Mesh(new THREE.CircleGeometry(w / 2 - 0.02, 20), texm(O.glassTex())); gl.position.z = 0.02; gl.userData.outline = false; G.add(gl);
    mesh(G, wuvBox(0.04, w - 0.05, 0.04), frame, { at: V(0, 0, 0.05), line: false }); mesh(G, wuvBox(w - 0.05, 0.04, 0.04), frame, { at: V(0, 0, 0.05), line: false });
    return G;
  }
  if (FAR) {
    mesh(G, wuvBox(w + fw * 2, h + fw * 2, fd), frame, { at: V(0, 0, fd / 2 - 0.02) });
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), texm(O.glassTex())); gl.position.z = fd + 0.0; gl.userData.outline = false; G.add(gl);
    mesh(G, wuvBox(w + fw * 2 + 0.12, 0.07, 0.2), frame, { at: V(0, -h / 2 - 0.035, 0.1), line: false });
    if (shutters) for (const sx of [-1, 1]) mesh(G, wuvBox(w * 0.5, h + 0.1, 0.05), shutters, { at: V(sx * (w / 2 + fw + w * 0.27), 0, 0.04), line: false });
    if (box) mesh(G, wuvBox(w + 0.3, 0.26, 0.3), texm(O.planks(box)), { at: V(0, -h / 2 - 0.25, 0.22), line: false });
    return G;
  }
  // the frame: head, jambs, a sill that juts out with a drip edge
  mesh(G, bevelBox(w + fw * 2 + 0.06, 0.12, fd + 0.04, 0.02), frame, { at: V(0, h / 2 + 0.06, fd / 2) });
  for (const sx of [-1, 1]) mesh(G, bevelBox(fw, h, fd, 0.015), frame, { at: V(sx * (w / 2 + fw / 2), 0, fd / 2) });
  mesh(G, bevelBox(w + fw * 2 + 0.16, 0.07, 0.2, 0.025), frame, { at: V(0, -h / 2 - 0.035, 0.1) });
  mesh(G, wuvBox(w + fw * 2 + 0.04, 0.05, 0.05), shade(frame, 0.82), { at: V(0, -h / 2 - 0.09, 0.04), line: false });
  // the glass over a dim room, mullions and transoms, curtains drawn aside
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), texm(O.glassTex())); gl.position.z = 0.01; gl.userData.outline = false; G.add(gl);
  const [cx, cy] = panes;
  for (let i = 1; i < cx; i++) mesh(G, wuvBox(0.045, h, 0.05), frame, { at: V(-w / 2 + w * i / cx, 0, 0.04), line: false, shadow: false });
  for (let j = 1; j < cy; j++) mesh(G, wuvBox(w, 0.045, 0.05), frame, { at: V(0, -h / 2 + h * j / cy, 0.04), line: false, shadow: false });
  if (curtains) for (const sx of [-1, 1]) {
    const cg = new THREE.CylinderGeometry(0.06, 0.09, h * 0.92, 6, 1, false, 0, Math.PI); cg.scale(1.6, 1, 0.5);
    mesh(G, cg, curtains, { at: V(sx * (w / 2 - 0.12), -0.02, 0.025), line: false, shadow: false });
  }
  if (shutters) for (const sx of [-1, 1]) {
    const S = new THREE.Group(); S.position.set(sx * (w / 2 + fw + w * 0.27), 0, 0.04); G.add(S);
    mesh(S, bevelBox(w * 0.5, h + 0.1, 0.05, 0.012), shutters);
    for (let k = 0; k < 6; k++) mesh(S, wuvBox(w * 0.4, 0.035, 0.03), shade(shutters, 0.8), { at: V(0, -h / 2 + 0.15 + k * (h - 0.2) / 5, 0.035), line: false, shadow: false });
  }
  if (box) {
    // a planter box on brackets, flowers spilling over (instanced by the caller? here: a few solid blooms)
    mesh(G, bevelBox(w + 0.3, 0.26, 0.3, 0.03), texm(O.planks(box)), { at: V(0, -h / 2 - 0.25, 0.22) });
    for (const sx of [-1, 1]) mesh(G, wuvBox(0.05, 0.2, 0.22), shade(box, 0.7), { at: V(sx * (w / 2), -h / 2 - 0.45, 0.14), line: false });
    G.userData.box = V(0, -h / 2 - 0.1, 0.22);
    // flowers and trailing leaves in it (leaf cards, the town's atlas)
    const out = cards(), n = Math.max(3, Math.round((w + 0.3) / 0.22));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 - 0.05 + (w + 0.1) * (i + 0.5) / n, tile = [TILE.flowersR, TILE.flowersY, TILE.bushA][i % 3];
      const p = V(x, -h / 2 - 0.02 + (i % 2) * 0.05, 0.24), c = p.clone().add(V(0, -0.15, -0.05));
      pushCard(out, p, V(0.1 * (i % 2 ? 1 : -1), 0.55, 1).normalize(), 0.36, tile, i * 1.7, c, 0.3);
      pushCard(out, p.clone().add(V(0, -0.02, 0.06)), V(0, 1, 0.35).normalize(), 0.32, tile, i * 2.3, c, 0.3);
      if (i % 2 === 0) pushCard(out, p.clone().add(V(0, -0.18, 0.12)), V(0, 0.1, 1), 0.3, TILE.ivy, i, c, 0.4);
    }
    const fm = new THREE.Mesh(toGeometry(out), leafMaterial('#ffffff', 0.03)); fm.userData.outline = false; fm.castShadow = true; G.add(fm);
  }
  return G;
}
export function doorUnit(P, { w = 1.05, h = 2.15, col = '#7a4a2e', frame = '#fbfaf4', double = false, glass = true, step = '#c9c2b0', handle = '#d8b04a', number = null } = {}) {
  const G = new THREE.Group(); P.add(G);
  // architrave: jambs and a head with a little cornice
  for (const sx of [-1, 1]) mesh(G, bevelBox(0.14, h + 0.08, 0.1, 0.02), frame, { at: V(sx * (w / 2 + 0.07), h / 2 + 0.04, 0.05) });
  mesh(G, bevelBox(w + 0.42, 0.14, 0.14, 0.03), frame, { at: V(0, h + 0.13, 0.07) });
  mesh(G, wuvBox(w + 0.5, 0.05, 0.18), shade(frame, 0.92), { at: V(0, h + 0.22, 0.09) });
  // the leaf (or two), set back, with raised panels and a glazed top
  const leaves = double ? [-w / 4, w / 4] : [0], lw = double ? w / 2 - 0.01 : w;
  for (const lx of leaves) {
    mesh(G, wuvBox(lw, h, 0.06), texm(O.planks(col)), { at: V(lx, h / 2, 0.0) });
    const rows = glass ? [[0.28, 0.5], [0.95, 0.5]] : [[0.3, 0.55], [1.05, 0.55], [1.75, 0.5]];
    for (const [py, ph] of rows) for (const sx of (lw > 0.7 ? [-1, 1] : [0])) mesh(G, bevelBox(lw * (lw > 0.7 ? 0.36 : 0.7), ph, 0.035, 0.012), shade(col, 1.08), { at: V(lx + sx * lw * 0.22, py + ph / 2, 0.045), line: false });
    if (glass) {
      const gw = lw * 0.72, gh = h * 0.3, gl = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), texm(O.glassTex())); gl.position.set(lx, h - gh / 2 - 0.16, 0.035); gl.userData.outline = false; G.add(gl);
      mesh(G, wuvBox(0.035, gh, 0.03), shade(col, 1.1), { at: V(lx, h - gh / 2 - 0.16, 0.05), line: false });
      for (const sy of [-1, 1]) mesh(G, wuvBox(gw + 0.06, 0.04, 0.04), shade(col, 1.1), { at: V(lx, h - gh / 2 - 0.16 + sy * gh / 2, 0.05), line: false });
    }
  }
  // the handle and the letter plate
  const hx = double ? -0.08 : w / 2 - 0.14;
  mesh(G, new THREE.SphereGeometry(0.035, 8, 6), handle, { at: V(hx, 1.0, 0.08), line: false });
  mesh(G, wuvBox(0.05, 0.16, 0.03), handle, { at: V(hx, 1.0, 0.045), line: false });
  if (!double) mesh(G, wuvBox(0.26, 0.06, 0.02), handle, { at: V(0, 0.85, 0.045), line: false });
  // the step
  if (step) mesh(G, bevelBox(w + 0.6, 0.18, 0.5, 0.03), texm(O.stonesTex(step)), { at: V(0, -0.09 + 0.18 / 2 - 0.06, 0.28) });
  if (number) {
    const t = O.words('o_num' + number, 64, 64, (x, W, H) => { x.fillStyle = '#2a3a4a'; x.beginPath(); x.roundRect(2, 2, W - 4, H - 4, 10); x.fill(); x.fillStyle = '#f2ead6'; O.fitFont(x, String(number), 40, W * 0.8, '"Lilita One", sans-serif'); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(number), W / 2, H / 2 + 2); });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), texm(t)); pl.position.set(w / 2 + 0.38, h - 0.2, 0.012); pl.userData.outline = false; G.add(pl);
  }
  return G;
}
// a wall lamp: bracket, a lantern with lit panes
export function wallLamp(P, { col = '#2f3640', glow = '#ffe7a6' } = {}) {
  const G = new THREE.Group(); P.add(G);
  mesh(G, wuvBox(0.12, 0.2, 0.04), col, { at: V(0, 0, 0.02) });
  mesh(G, wuvBox(0.04, 0.04, 0.22), col, { at: V(0, 0.08, 0.13), line: false });
  mesh(G, new THREE.CylinderGeometry(0.1, 0.07, 0.06, 6), col, { at: V(0, 0.2, 0.26) });
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.2, 6), new THREE.MeshBasicMaterial({ color: glow })); lb.position.set(0, 0.07, 0.26); lb.userData.outline = false; G.add(lb);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; mesh(G, wuvBox(0.015, 0.2, 0.015), col, { at: V(Math.cos(a) * 0.068, 0.07, 0.26 + Math.sin(a) * 0.068), line: false, shadow: false }); }
  mesh(G, new THREE.ConeGeometry(0.11, 0.1, 6), col, { at: V(0, 0.27, 0.26) });
  return G;
}

// ---------- roofs ----------
// A roof from faces: each face an eave line (a0, a1) at the eave and a top
// line (b0, b1) higher up (b0 = b1 for a hip's end triangle). Built as a slab
// of thickness th (its underside is the soffit), courses stepped on top
// (rows of tiles / shingles), a fascia board along the eave, and the cover's
// texture. Returns the group.
export function roofFaces(P, faces, { cover = 'clay', col = '#c4553a', th = 0.16, trim = '#fbfaf4', course = 0.32, moss = 0 }) {
  const m = cover === 'corrugated' ? flat(col) : coverMat(cover, col);
  const geos = [], trimG = [], mossG = [];
  for (const { a0, a1, b0, b1, gableEdge } of faces) {
    const E = a1.clone().sub(a0).normalize();
    const mid0 = a0.clone().add(a1).multiplyScalar(0.5), mid1 = b0.clone().add(b1).multiplyScalar(0.5);
    const up = mid1.clone().sub(mid0), L = up.length(); const S = up.clone().normalize();
    // the slab
    geos.push(slab(a0, a1, b1, b0, th, { e: E, s: S, s0: mid0.dot(S) }));
    if (cover === 'thatch') {
      // a thick rounded nose along the eave
      const nose = new THREE.CylinderGeometry(th * 1.6, th * 1.6, a0.distanceTo(a1) + 0.1, 10, 1).rotateZ(Math.PI / 2);
      const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), E);
      nose.applyQuaternion(q).translate(mid0.x, mid0.y - th * 0.4, mid0.z);
      geos.push(nose.toNonIndexed());
    } else if (cover === 'corrugated') {
      // ridges of the sheet: thin half rods down the slope
      const n = Math.max(2, Math.round(a0.distanceTo(a1) / 0.14));
      for (let i = 0; i <= n; i++) {
        const t = i / n, p0 = a0.clone().lerp(a1, t), p1 = b0.clone().lerp(b1, t);
        const r = new THREE.CylinderGeometry(0.03, 0.03, p0.distanceTo(p1), 5, 1, false, 0, Math.PI);
        const nrm = E.clone().cross(S).normalize();
        r.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), S));
        const mid = p0.clone().add(p1).multiplyScalar(0.5).addScaledVector(nrm, -0.01);
        r.translate(mid.x, mid.y, mid.z);
        geos.push(r.toNonIndexed());
      }
    } else if (!FAR) {
      // courses: strips up the slope, each with a lifted lower lip
      // one course per painted row of the cover's picture (clay 7, kawara 6, shingle 8 rows a repeat)
      const rows = cover === 'kawara' ? 6 : cover === 'clay' ? 7 : 8, rowL = 1 / (0.66 * rows);
      const nC = Math.max(2, Math.round(L / rowL)), s0 = mid0.dot(S);
      for (let k = 0; k < nC; k++) {
        const t0 = k / nC, t1 = Math.min(1, (k + 1) / nC + 0.02);
        const p0 = a0.clone().lerp(b0, t0), p1 = a1.clone().lerp(b1, t0), p2 = a1.clone().lerp(b1, t1), p3 = a0.clone().lerp(b0, t1);
        const nrm = p1.clone().sub(p0).cross(p3.clone().sub(p0)).normalize();
        for (const p of [p0, p1, p2, p3]) p.addScaledVector(nrm, 0.012);
        geos.push(slab(p0, p1, p2, p3, 0.03, { e: E, s: S, s0, vs: 1 / (rows * (L / nC)), butt: cover === 'shingle' || cover === 'slate' ? 0.035 : 0.05 }));
      }
    }
    // the fascia along the eave
    if (cover !== 'thatch') {
      const dn = V(0, -1, 0), o = S.clone().multiplyScalar(-0.005);
      const f0 = a0.clone().add(o), f1 = a1.clone().add(o);
      trimG.push(slab(f0.clone().addScaledVector(dn, 0.2), f1.clone().addScaledVector(dn, 0.2), f1.clone().add(V(0, 0.04, 0)), f0.clone().add(V(0, 0.04, 0)), 0.05, {}));
    }
    if (moss > 0) mossG.push({ a0, a1, b0, b1, S, E, L });
    void gableEdge;
  }
  mesh(P, mergeNI(geos), m);
  if (trimG.length) mesh(P, mergeNI(trimG), trim);
  for (const f of mossG) {
    // moss creeping up from the eave on this face
    const g = new THREE.Group(); const c = f.a0.clone().lerp(f.a1, 0.3).addScaledVector(f.S, f.L * 0.18).add(V(0, 0.06, 0));
    g.position.copy(c); g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.E, f.E.clone().cross(f.S).negate().normalize().negate(), f.S.clone().negate()));
    P.add(g); O.mossTop(g, f.a0.distanceTo(f.a1) * 0.35, f.L * 0.3, 0, 0, 0, 0, 501 + Math.round(c.x * 10));
  }
  return P;
}
function mergeNI(list) {
  const pos = [], nor = [], uv = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    if (g.attributes.uv) uv.push(...g.attributes.uv.array); else for (let i = 0; i < g.attributes.position.count; i++) uv.push(0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
// a ridge cap (a rounded roll of ridge tiles) from a to b
export function ridgeCap(P, a, b, col, r = 0.1, cover = 'clay') {
  const L = a.distanceTo(b); if (L < 0.05) return;
  const g = cover === 'thatch' ? new THREE.CylinderGeometry(r * 2.2, r * 2.2, L + 0.3, 10) : new THREE.CylinderGeometry(r, r, L + 0.12, 8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y + (cover === 'thatch' ? 0.05 : 0.02), m.z);
  mesh(P, g, cover === 'thatch' ? texm(O.thatch(col)) : col);
  // the end tiles: a little raised boss at each end
  if (cover !== 'thatch' && cover !== 'corrugated') for (const p of [a, b]) mesh(P, new THREE.SphereGeometry(r * 1.25, 8, 6), col, { at: p.clone().add(V(0, 0.04, 0)) });
}
// bargeboard (rake trim) from eave corner a up to ridge b, on the gable face
function barge(P, a, b, col, w = 0.24, t = 0.07) {
  const d = b.clone().sub(a), L = d.length(); const g = wuvBox(t, w, L + 0.06);
  const me = mesh(P, g, col); me.position.copy(a).add(b).multiplyScalar(0.5); me.position.y -= w * 0.35;
  const Z = d.clone().normalize(), X = V(1, 0, 0), Y = Z.clone().cross(X).normalize();
  if (Y.y < 0) Y.negate();
  me.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Y.clone().cross(Z).normalize(), Y, Z));
}

// The roof over a W x D rectangle with eaves at y0. Returns { top (ridge y), gableTris }.
export function roof(P, W, D, y0, { type = 'gable', cover = 'clay', col = '#c4553a', rise = null, over = 0.55, gableOver = 0.4, axis = 'x', ridge = null, trim = '#fbfaf4', gutters = true, moss = 0, th = 0.16, wall = null } = {}) {
  const G = new THREE.Group(); P.add(G);
  // work with the ridge along x: turn the group for axis z
  let w = W, d = D;
  if (axis === 'z') { G.rotation.y = Math.PI / 2; w = D; d = W; }
  const rc = ridge || shade(col, 0.82);
  const hd = d / 2 + over, hw = w / 2 + (type === 'gable' ? gableOver : over);
  const R = rise ?? (type === 'shed' ? d * 0.25 : d * 0.42);
  const opts = { cover, col, trim, th, moss };
  const faces = [];
  if (type === 'gable') {
    for (const s of [1, -1]) faces.push({ a0: V(-s * hw, y0 - over * R / (d / 2), s * hd), a1: V(s * hw, y0 - over * R / (d / 2), s * hd), b1: V(s * hw, y0 + R, 0), b0: V(-s * hw, y0 + R, 0) });
    roofFaces(G, faces, opts);
    ridgeCap(G, V(-hw, y0 + R + th * 0.6, 0), V(hw, y0 + R + th * 0.6, 0), rc, Math.min(0.11, R * 0.2), cover);
    // the gable walls (solid triangles, thick) and their bargeboards
    if (wall) for (const sx of [-1, 1]) {
      const sh = new THREE.Shape(); sh.moveTo(-d / 2, 0); sh.lineTo(d / 2, 0); sh.lineTo(0, R - th * 1.4); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false }).toNonIndexed(); g.rotateY(Math.PI / 2); g.translate(sx * (w / 2) - 0.15 + 0.0, y0, 0);
      const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) * 0.5, p.getY(i) * 0.5);
      grime(g, { y0: y0 - 10, band: 0.1, k: 1 });
      mesh(G, g, wall);
    }
    if (cover !== 'thatch') for (const sx of [-1, 1]) for (const sz of [-1, 1]) barge(G, V(sx * (hw + 0.03), y0 - over * R / (d / 2) + 0.05, sz * hd), V(sx * (hw + 0.03), y0 + R + 0.12, 0), trim, Math.min(0.24, R * 0.3), Math.min(0.07, R * 0.08));
  } else if (type === 'shed') {
    faces.push({ a0: V(-hw, y0, hd), a1: V(hw, y0, hd), b1: V(hw, y0 + R, -hd), b0: V(-hw, y0 + R, -hd) });
    roofFaces(G, faces, opts);
    mesh(G, wuvBox(2 * hw + 0.06, 0.22, 0.07), trim, { at: V(0, y0 + R - 0.03, -hd - 0.03) });
    for (const sx of [-1, 1]) barge(G, V(sx * (hw + 0.03), y0 + 0.05, hd), V(sx * (hw + 0.03), y0 + R + 0.05, -hd), trim, 0.2);
  } else if (type === 'hip' || type === 'mansard') {
    const lw = hw, ld = hd, rl = Math.max(0.05, lw - ld);
    const top = y0 + R;
    if (type === 'hip') {
      const e = [V(-lw, y0, ld), V(lw, y0, ld), V(lw, y0, -ld), V(-lw, y0, -ld)], r0 = V(-rl, top, 0), r1 = V(rl, top, 0);
      faces.push({ a0: e[0], a1: e[1], b1: r1, b0: r0 }, { a0: e[2], a1: e[3], b1: r0, b0: r1 }, { a0: e[1], a1: e[2], b1: r1, b0: r1 }, { a0: e[3], a1: e[0], b1: r0, b0: r0 });
      roofFaces(G, faces, opts);
      ridgeCap(G, r0.clone().add(V(0, th * 0.6, 0)), r1.clone().add(V(0, th * 0.6, 0)), rc, 0.11, cover);
      for (const [a, b] of [[e[0], r0], [e[1], r1], [e[2], r1], [e[3], r0]]) ridgeCap(G, a.clone().add(V(0, th * 0.5, 0)), b.clone().add(V(0, th * 0.6, 0)), rc, 0.08, cover);
    } else {
      // mansard: steep lower slopes to a curb, a low hip above
      const k = 0.62, cy = y0 + R * 0.75, iw = lw - d * 0.18, id = ld - d * 0.18;
      const e = [V(-lw, y0, ld), V(lw, y0, ld), V(lw, y0, -ld), V(-lw, y0, -ld)], c = [V(-iw, cy, id), V(iw, cy, id), V(iw, cy, -id), V(-iw, cy, -id)];
      for (let i = 0; i < 4; i++) faces.push({ a0: e[i], a1: e[(i + 1) % 4], b1: c[(i + 1) % 4], b0: c[i] });
      const rl2 = Math.max(0.05, iw - id), r0 = V(-rl2, top, 0), r1 = V(rl2, top, 0);
      faces.push({ a0: c[0], a1: c[1], b1: r1, b0: r0 }, { a0: c[2], a1: c[3], b1: r0, b0: r1 }, { a0: c[1], a1: c[2], b1: r1, b0: r1 }, { a0: c[3], a1: c[0], b1: r0, b0: r0 });
      roofFaces(G, faces, opts);
      for (let i = 0; i < 4; i++) ridgeCap(G, c[i].clone().add(V(0, 0.05, 0)), c[(i + 1) % 4].clone().add(V(0, 0.05, 0)), trim, 0.06, cover);
      ridgeCap(G, r0, r1, rc, 0.09, cover); void k;
    }
  } else if (type === 'flat') {
    mesh(G, wuvBox(w + 0.3, 0.3, d + 0.3), trim, { at: V(0, y0 + 0.15, 0) });
    mesh(G, wuvBox(w - 0.1, 0.06, d - 0.1), shade(col, 0.8), { at: V(0, y0 + 0.31, 0), line: false });
    return { G, top: y0 + 0.35 };
  }
  // gutters along the long eaves, downpipes at two corners
  if (gutters && !FAR && cover !== 'thatch' && type !== 'flat') {
    const gy = y0 - over * (type === 'gable' ? R / (d / 2) : 0) - 0.06, gc = shade(trim, 0.9);
    for (const sz of type === 'shed' ? [1] : [1, -1]) {
      const g = new THREE.CylinderGeometry(0.075, 0.075, 2 * hw, 8, 1, true, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2);
      mesh(G, g, gc, { at: V(0, gy, sz * (hd + 0.06)) });
      // downpipe from the gutter's end to the plinth, with an offset bend and a shoe
      const x = (w / 2 - 0.12) * (sz > 0 ? 1 : -1), zz = sz * (d / 2 + 0.08);
      mesh(G, new THREE.CylinderGeometry(0.045, 0.045, 0.32, 6), gc, { at: V(x, gy - 0.12, sz * (hd - 0.03)), line: false }).rotation.x = sz * 0.9;
      const ph = gy - 0.28;
      mesh(G, new THREE.CylinderGeometry(0.045, 0.045, ph + 0.2, 6), gc, { at: V(x, (gy - 0.28) / 2 - 0.1 + 0.05, zz) });
      for (let y = 0.6; y < ph; y += 1.2) mesh(G, new THREE.CylinderGeometry(0.06, 0.06, 0.05, 6), gc, { at: V(x, y, zz), line: false });
      mesh(G, new THREE.CylinderGeometry(0.045, 0.06, 0.2, 6), gc, { at: V(x, 0.1, zz + sz * 0.07), line: false }).rotation.x = sz * 0.8;
    }
  }
  return { G, top: y0 + R };
}

// ---------- chimney ----------
export function chimney(P, { x = 0, z = 0, y0 = 0, h = 3, w = 0.8, d = 0.7, col = '#b7604a', kind = 'brick', cap = '#d9cfbd', pots = 2 } = {}) {
  const t = kind === 'stone' ? O.stonesTex(col) : O.bricks(col);
  const g = wuvBox(w, h, d, 0.5); g.translate(0, h / 2, 0);
  mesh(P, g, texm(t), { at: V(x, y0, z) });
  mesh(P, bevelBox(w + 0.14, 0.12, d + 0.14, 0.03), texm(t), { at: V(x, y0 + h - 0.32, z) });
  mesh(P, bevelBox(w + 0.2, 0.1, d + 0.2, 0.03), cap, { at: V(x, y0 + h + 0.05, z) });
  for (let i = 0; i < pots; i++) {
    const px = x + (pots > 1 ? (i - (pots - 1) / 2) * w * 0.45 : 0);
    mesh(P, new THREE.CylinderGeometry(0.1, 0.13, 0.36, 10), '#c46a3e', { at: V(px, y0 + h + 0.28, z) });
    mesh(P, new THREE.CylinderGeometry(0.12, 0.12, 0.05, 10), '#a85a34', { at: V(px, y0 + h + 0.46, z), line: false });
  }
}

// ---------- the building ----------
export function building(spec = {}) {
  const S = {
    W: 7, D: 5.6, floors: 1, floorH: 2.8, trim: '#fbfaf4', seed: 1,
    plinth: { h: 0.45, deep: 1.2, kind: 'stone', col: '#b4ad98' },
    wall: { kind: 'siding', col: '#efe2c8' },
    roof: { type: 'gable', cover: 'clay', col: '#c4553a' },
    openings: [], ...spec,
  };
  const G = new THREE.Group(); G.name = spec.name || 'building';
  const { W, D, floors, floorH, trim } = S;
  const wasFar = FAR; FAR = spec.lod === 'far';
  try { return buildingIn(G, S, spec); } finally { FAR = wasFar; }
}
function buildingIn(G, S, spec) {
  const { W, D, floors, floorH, trim } = S;
  const pl = { h: 0.45, deep: 1.2, kind: 'stone', col: '#b4ad98', ...S.plinth };
  const wl = { kind: 'siding', col: '#efe2c8', ...S.wall };
  const rf = { type: 'gable', cover: 'clay', col: '#c4553a', axis: 'x', ...S.roof };
  const y0 = pl.h, wallTop = y0 + floors * floorH;
  // the plinth: a stone / brick base running down into the ground, a chamfered coping
  {
    const g = wuvBox(W + 0.24, pl.h + pl.deep, D + 0.24, 0.5); g.translate(0, (pl.h - pl.deep) / 2, 0);
    mesh(G, g, texm(pl.kind === 'brick' ? O.bricks(pl.col) : O.stonesTex(pl.col)));
    if (!FAR) mesh(G, bevelBox(W + 0.34, 0.08, D + 0.34, 0.04), shade(pl.col, 1.05), { at: V(0, pl.h - 0.02, 0) });
  }
  // the walls: one closed volume per storey (the upper may differ)
  const moss = spec.moss ? V(0, 0, -1) : null;
  for (let f = 0; f < floors; f++) {
    const kind = f > 0 && wl.upper ? wl.upper : wl.kind, col = f > 0 && wl.upperCol ? wl.upperCol : wl.col;
    const g = wuvBox(W, floorH, D, 0.5, FAR ? 1 : 3); g.translate(0, y0 + f * floorH + floorH / 2, 0);
    grime(g, { y0, band: 0.8, k: f === 0 ? 0.74 : 1, moss: f === 0 ? moss : null, top: f === floors - 1 ? wallTop : null });
    mesh(G, g, wallMat(kind === 'timber' ? 'plaster' : kind, col));
    if (kind === 'timber') {
      // timber framing: sole and head plates, posts, angled braces (all faces)
      const fr = wl.frame || '#6b4a33', yb = y0 + f * floorH;
      for (const [fw, fd, ry] of [[W, D, 0], [W, D, Math.PI], [D, W, Math.PI / 2], [D, W, -Math.PI / 2]]) {
        const F = new THREE.Group(); F.rotation.y = ry; G.add(F);
        const z = fd / 2 + 0.03;
        for (const y of [yb + 0.1, yb + floorH - 0.1]) mesh(F, bevelBox(fw + 0.06, 0.18, 0.08, 0.02), fr, { at: V(0, y, z) });
        const n = Math.max(2, Math.round(fw / 1.4));
        for (let i = 0; i <= n; i++) mesh(F, bevelBox(0.16, floorH - 0.3, 0.07, 0.02), fr, { at: V(-fw / 2 + 0.08 + (fw - 0.16) * i / n, yb + floorH / 2, z), line: i === 0 || i === n });
        for (let i = 0; i < n; i += 2) {
          const xa = -fw / 2 + (fw - 0.16) * i / n + 0.08, xb = -fw / 2 + (fw - 0.16) * (i + 1) / n + 0.08;
          const br = mesh(F, wuvBox(0.12, Math.hypot(xb - xa, floorH - 0.4), 0.06), fr, { at: V((xa + xb) / 2, yb + floorH / 2, z), line: false });
          br.rotation.z = Math.atan2(xb - xa, floorH - 0.4) * ((xa + xb) / 2 < 0 ? -1 : 1);   // each foot toward its wall's end (the frame splays out)
        }
      }
    }
    // a string course between storeys
    if (f > 0) mesh(G, bevelBox(W + 0.16, 0.14, D + 0.16, 0.03), wl.kind === 'timber' ? (wl.frame || '#6b4a33') : trim, { at: V(0, y0 + f * floorH, 0) });
  }
  // corner boards / quoins
  if (FAR) { /* (no corner boards or quoins at a distance) */ } else if (wl.kind === 'siding' || wl.kind === 'planks' || wl.kind === 'plaster') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(G, bevelBox(0.18, wallTop - y0, 0.18, 0.025), wl.kind === 'plaster' && !spec.cornerBoards ? shade(wl.col, 0.94) : trim, { at: V(sx * W / 2, (y0 + wallTop) / 2, sz * D / 2), line: wl.kind !== 'plaster' });
  } else if (wl.kind === 'brick' || wl.kind === 'stone') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let y = y0 + 0.15, k = 0; y < wallTop - 0.1; y += 0.42, k++) {
      const big = k % 2 === 0;
      mesh(G, bevelBox(big ? 0.46 : 0.3, 0.36, big ? 0.3 : 0.46, 0.04), texm(O.stonesTex('#d8d0bc')), { at: V(sx * (W / 2 - (big ? 0.2 : 0.12)) + sx * 0.04, y + 0.18, sz * (D / 2 - (big ? 0.12 : 0.2)) + sz * 0.04), line: false });
    }
  }
  // the frieze board under the eaves
  mesh(G, bevelBox(W + 0.12, 0.22, D + 0.12, 0.03), trim, { at: V(0, wallTop - 0.11, 0) });
  // the roof
  const R = roof(G, W, D, wallTop, { ...rf, trim: rf.trim || trim, wall: wallMat((wl.upper || wl.kind) === 'timber' ? 'plaster' : (wl.upper || wl.kind), wl.upperCol || wl.col, false), moss: 0 });
  G.userData.top = R.top; G.userData.wallTop = wallTop; G.userData.floor = y0;
  // dormers in the front slope (ridge along x)
  for (const dm of spec.dormers || []) {
    const rise = rf.rise ?? D * 0.42, k = rise / (D / 2);
    const dz = D / 2 - 1.25, dy = wallTop + (D / 2 - dz) * k;
    const DG = new THREE.Group(); DG.position.set(dm.x || 0, 0, 0); G.add(DG);
    const dw = dm.w || 1.4, dh = 1.3, back = 1.6;
    const g = wuvBox(dw, dh + 0.6, back); g.translate(0, dy - 0.25 + (dh + 0.6) / 2, dz - back / 2 + 0.2);
    mesh(DG, g, wallMat(wl.kind === 'timber' ? 'plaster' : wl.kind, wl.col, false));
    const WG = new THREE.Group(); WG.position.set(0, dy + dh / 2 + 0.1, dz + 0.2); DG.add(WG);
    windowUnit(WG, { w: dw - 0.55, h: dh - 0.45, panes: [2, 2], frame: trim, curtains: '#f2e6c8' });
    const RG = new THREE.Group(); RG.position.set(0, 0, dz - back / 2 + 0.2); RG.rotation.y = Math.PI / 2; DG.add(RG);
    roof(RG, back + 0.2, dw, dy + dh + 0.35, { type: 'gable', cover: rf.cover, col: rf.col, rise: 0.55, over: 0.18, gableOver: 0.15, axis: 'x', trim: rf.trim || trim, gutters: false, th: 0.1 });
  }
  // openings on each face
  for (const op of S.openings) {
    const [fx, fz] = FACES[op.face || 'front'];
    const F = new THREE.Group(); G.add(F);
    const half = fz ? D / 2 : W / 2;
    F.rotation.y = fz ? (fz > 0 ? 0 : Math.PI) : (fx > 0 ? Math.PI / 2 : -Math.PI / 2);
    F.position.set(fx * half, 0, fz * half);
    const OG = new THREE.Group(); OG.position.set(op.x || 0, 0, 0.002); F.add(OG);
    if (op.kind === 'door' || op.kind === 'double') {
      const dg = doorUnit(OG, { w: op.w || (op.kind === 'double' ? 1.7 : 1.05), h: op.h || 2.15, col: op.col || '#7a4a2e', frame: trim, double: op.kind === 'double', glass: op.glass !== false, step: op.step === false ? null : (op.step || '#c9c2b0'), number: op.number });
      dg.position.y = y0 + (op.floor || 0) * floorH;
      if (op.lamp) { const l = wallLamp(OG, {}); l.position.set((op.lamp === 'left' ? -1 : 1) * ((op.w || 1.05) / 2 + 0.45), y0 + 1.9, 0); }
      if (op.canopy) {
        // (under the main eaves: lower on a low single storey)
        const cy = Math.min(y0 + 2.42, y0 + floorH - 0.5, y0 + (op.h || 2.15) + 0.3);
        const CG = new THREE.Group(); CG.position.set(0, 0, 0.55); OG.add(CG);
        roof(CG, (op.w || 1.05) + 0.9, 1.0, cy, { type: 'gable', cover: rf.cover === 'thatch' ? 'shingle' : rf.cover, col: rf.col, rise: 0.45, over: 0.12, gableOver: 0.12, axis: 'z', trim: rf.trim || trim, gutters: false, th: 0.1 });
        for (const sx of [-1, 1]) {   // curved brackets under it
          const br = new THREE.TorusGeometry(0.28, 0.035, 4, 8, Math.PI / 2); br.rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2);
          mesh(OG, br, trim, { at: V(sx * ((op.w || 1.05) / 2 + 0.3), cy - 0.28, 0.28), line: false });
        }
      }
    } else if (op.kind === 'shop') {
      // a shop front: stall riser, a big display window, pilasters, a fascia
      const w = op.w || 3, h = op.h || 1.9, by = y0 + 0.55;
      mesh(OG, bevelBox(w, 0.55, 0.12, 0.02), op.col || trim, { at: V(0, y0 + 0.275, 0.06) });
      const WG = new THREE.Group(); WG.position.set(0, by + h / 2, 0); OG.add(WG);
      windowUnit(WG, { w, h, panes: [3, 1], frame: op.col || trim, curtains: null });
      for (const sx of [-1, 1]) mesh(OG, bevelBox(0.24, h + 0.9, 0.16, 0.03), op.col || trim, { at: V(sx * (w / 2 + 0.12), y0 + (h + 0.9) / 2, 0.08) });
    } else if (op.kind === 'vent') {
      mesh(OG, bevelBox(0.5, 0.36, 0.06, 0.015), trim, { at: V(0, y0 + (op.y ?? 2.0), 0.03) });
      for (let k = 0; k < 4; k++) mesh(OG, wuvBox(0.42, 0.04, 0.05), shade(trim, 0.7), { at: V(0, y0 + (op.y ?? 2.0) - 0.12 + k * 0.08, 0.06), line: false });
    } else {
      const w = op.w || 1.1, h = op.h || 1.3, y = y0 + (op.floor || 0) * floorH + (op.y ?? 0.95) + h / 2;
      const WG = new THREE.Group(); WG.position.set(0, y, 0); OG.add(WG);
      const wu = windowUnit(WG, { w, h, panes: op.panes || [2, 2], frame: op.frame || trim, shutters: op.shutters, box: op.box, curtains: op.curtains === undefined ? '#f2e6c8' : op.curtains, round: op.kind === 'round' });
      if (op.box && op.flowers !== false) { (G.userData.boxes ||= []).push({ g: WG, p: wu.userData.box, w }); }
    }
  }
  // chimneys
  for (const c of [].concat(S.chimney || [])) chimney(G, { y0: wallTop - 1.2, h: (R.top - wallTop) + 2.1, ...c });
  // the porch: a deck, posts, a railing with balusters, a roof, steps
  if (S.porch) {
    const pr = { w: 3.2, d: 1.8, x: 0, posts: 2, rail: true, roof: 'shed', col: trim, steps: true, deck: '#b98a5a', ...S.porch };
    const PG = new THREE.Group(); PG.position.set(pr.x, 0, D / 2); G.add(PG);
    const dy = y0 - 0.05;
    mesh(PG, wuvBox(pr.w, 0.12, pr.d), texm(O.planks(pr.deck)), { at: V(0, dy, pr.d / 2) });
    { const g = wuvBox(pr.w, dy + 0.4, 0.06); g.translate(0, (dy - 0.4) / 2 - 0.05, pr.d - 0.03); mesh(PG, g, trim, { line: false }); }
    const ph = 2.55, pxs = []; for (let i = 0; i < pr.posts; i++) pxs.push(-pr.w / 2 + 0.12 + (pr.w - 0.24) * (pr.posts > 1 ? i / (pr.posts - 1) : 0.5));
    for (const px of pxs) {
      mesh(PG, bevelBox(0.16, ph, 0.16, 0.03), pr.col, { at: V(px, dy + ph / 2, pr.d - 0.12) });
      mesh(PG, bevelBox(0.24, 0.12, 0.24, 0.03), pr.col, { at: V(px, dy + 0.12, pr.d - 0.12) });
      mesh(PG, bevelBox(0.24, 0.1, 0.24, 0.03), pr.col, { at: V(px, dy + ph - 0.05, pr.d - 0.12) });
    }
    mesh(PG, bevelBox(pr.w + 0.1, 0.2, 0.14, 0.03), pr.col, { at: V(0, dy + ph + 0.06, pr.d - 0.12) });
    if (pr.rail) {
      const gap = pr.stepW || 1.3;
      for (const [a, b] of [[-pr.w / 2 + 0.12, -gap / 2], [gap / 2, pr.w / 2 - 0.12]]) {
        if (b - a < 0.3) continue;
        mesh(PG, bevelBox(b - a, 0.08, 0.12, 0.02), pr.col, { at: V((a + b) / 2, dy + 0.9, pr.d - 0.12) });
        mesh(PG, wuvBox(b - a, 0.06, 0.08), pr.col, { at: V((a + b) / 2, dy + 0.2, pr.d - 0.12), line: false });
        const n = Math.round((b - a) / 0.16);
        for (let i = 1; i < n; i++) mesh(PG, wuvBox(0.05, 0.66, 0.05), pr.col, { at: V(a + (b - a) * i / n, dy + 0.55, pr.d - 0.12), line: false, shadow: false });
      }
      for (const sx of [-1, 1]) { mesh(PG, bevelBox(0.12, 0.08, pr.d - 0.2, 0.02), pr.col, { at: V(sx * (pr.w / 2 - 0.12), dy + 0.9, pr.d / 2) }); const n = Math.round((pr.d - 0.3) / 0.16); for (let i = 1; i < n; i++) mesh(PG, wuvBox(0.05, 0.66, 0.05), pr.col, { at: V(sx * (pr.w / 2 - 0.12), dy + 0.55, 0.1 + (pr.d - 0.3) * i / n), line: false, shadow: false }); }
    }
    if (pr.steps) for (let s = 0; s < 3; s++) { const sy = dy - 0.18 * (s + 1) + 0.04; if (sy < -0.3) break; mesh(PG, bevelBox(pr.stepW || 1.3, 0.18, 0.34, 0.025), texm(O.planks(pr.deck)), { at: V(0, sy, pr.d + 0.17 + s * 0.32) }); }
    const RG = new THREE.Group(); RG.position.set(0, 0, pr.d / 2); PG.add(RG);
    if (pr.roof === 'gable') roof(RG, pr.w + 0.2, pr.d + 0.1, dy + ph + 0.15, { type: 'gable', cover: rf.cover === 'thatch' ? 'shingle' : rf.cover, col: rf.col, rise: 0.8, over: 0.25, gableOver: 0.2, axis: 'z', trim: rf.trim || trim, gutters: false, th: 0.12, wall: flat(pr.col) });
    else { const r = roof(RG, pr.w + 0.2, pr.d + 0.1, dy + ph + 0.15, { type: 'shed', cover: rf.cover === 'thatch' ? 'shingle' : rf.cover, col: rf.col, rise: 0.5, over: 0.2, gableOver: 0.12, trim: rf.trim || trim, gutters: true, th: 0.12 }); r.G.rotation.y = 0; }
    G.userData.porch = { w: pr.w, d: pr.d, x: pr.x, y: dy + 0.06 };
  }
  // an awning over a shop front: a striped canvas with a scalloped valance
  if (S.awning) {
    const a = { face: 'front', x: 0, w: 3.4, col: '#3a74c8', col2: '#ffffff', y: y0 + 2.75, d: 1.2, ...S.awning };
    const AG = new THREE.Group(); AG.position.set(a.x, a.y, D / 2); G.add(AG);
    const n = 10, sw = a.w / n;
    for (let i = 0; i < n; i++) {
      const c = i % 2 ? a.col2 : a.col;
      mesh(AG, slab(V(-a.w / 2 + i * sw, -0.6, a.d), V(-a.w / 2 + (i + 1) * sw, -0.6, a.d), V(-a.w / 2 + (i + 1) * sw, 0, 0.02), V(-a.w / 2 + i * sw, 0, 0.02), 0.025), c);
      const sc = new THREE.CylinderGeometry(sw / 2, sw / 2, 0.025, 10, 1, false, 0, Math.PI); sc.rotateX(Math.PI / 2); sc.rotateZ(Math.PI);
      mesh(AG, sc, c, { at: V(-a.w / 2 + (i + 0.5) * sw, -0.6, a.d), line: false });
      mesh(AG, wuvBox(sw, 0.22, 0.025), c, { at: V(-a.w / 2 + (i + 0.5) * sw, -0.71, a.d), line: false });
    }
    for (const sx of [-1, 1]) mesh(AG, new THREE.CylinderGeometry(0.02, 0.02, Math.hypot(a.d, 0.6), 5), '#3a3a3a', { at: V(sx * (a.w / 2 - 0.05), -0.3, a.d / 2), line: false }).rotation.x = Math.atan2(a.d, 0.6);
  }
  // a sign board on the front
  if (S.sign) {
    const s = { y: wallTop - 0.55, w: 2.6, h: 0.6, col: '#2f5a4a', fg: '#f6ecd0', sub: '', ...S.sign };
    const t = O.words('o_bsign' + s.text + s.sub + s.col, 512, 128, (x, w, h) => {
      x.fillStyle = s.col; x.fillRect(0, 0, w, h); x.strokeStyle = '#d8c27a'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16);
      x.fillStyle = s.fg; O.fitFont(x, s.text, s.sub ? 54 : 64, w * 0.84, '"Lilita One", sans-serif'); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s.text, w / 2, s.sub ? h * 0.4 : h / 2 + 2);
      if (s.sub) { O.fitFont(x, s.sub, 22, w * 0.8, '"Fredoka", sans-serif', 600); x.fillText(s.sub, w / 2, h * 0.78); }
    });
    mesh(G, bevelBox(s.w + 0.16, s.h + 0.16, 0.08, 0.03), shade(s.col, 0.7), { at: V(s.x || 0, s.y, D / 2 + 0.06) });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), texm(t)); pl.position.set(s.x || 0, s.y, D / 2 + 0.105); pl.userData.outline = false; G.add(pl);
  }
  // overgrowth
  for (const iv of S.ivy || []) {
    const [fx, fz] = FACES[iv.face || 'front'];
    const half = fz ? D / 2 : W / 2, ry = fz ? (fz > 0 ? 0 : Math.PI) : (fx > 0 ? Math.PI / 2 : -Math.PI / 2);
    const c = Math.cos(ry), s = Math.sin(ry), lx = iv.x || 0;
    O.ivy(G, iv.w || 2, Math.min(iv.h || wallTop, wallTop - y0), fx * (half + 0.08) + lx * c, y0 + 0.02, fz * (half + 0.08) - lx * s, ry, (S.seed * 13 + (iv.x || 0) * 7) | 0, iv.dens || 12);
  }
  G.userData.foot = { hw: W / 2 + 0.2, hd: D / 2 + 0.2 };
  return G;
}

// ---------- pavilions ----------
// a garden gazebo: a raised hexagonal deck on a stone base, turned posts,
// a balustrade on five sides (the sixth open, with steps), arched brackets
// between the posts, a six-sided roof of shingle courses with hip rolls, a
// fascia and a finial
export function gazebo({ r = 2.1, h = 2.5, col = '#fbf3e0', roof = '#b5523a', deck = '#c99a62', open = 1, seed = 1 } = {}) {
  const G = new THREE.Group(), n = 6, dy = 0.32;
  const pt = (k, rr, y) => { const a = (k + 0.5) / n * Math.PI * 2; return V(Math.cos(a) * rr, y, Math.sin(a) * rr); };
  // the base and deck
  mesh(G, new THREE.CylinderGeometry(r + 0.18, r + 0.25, dy + 0.6, n, 1).rotateY(Math.PI / n), texm(O.stonesTex('#b4ad98')), { at: V(0, (dy - 0.6) / 2 - 0.02, 0) });
  mesh(G, new THREE.CylinderGeometry(r + 0.1, r + 0.1, 0.1, n, 1).rotateY(Math.PI / n), texm(O.planks(deck)), { at: V(0, dy, 0) });
  // posts (turned: a lathe profile) and their plinths
  const prof = [[0.001, 0], [0.11, 0], [0.11, 0.12], [0.07, 0.2], [0.065, h - 0.35], [0.09, h - 0.25], [0.08, h - 0.15], [0.1, h - 0.1], [0.1, h], [0.001, h]];
  const postG = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 10);
  for (let k = 0; k < n; k++) { const p = pt(k - 0.5, r - 0.05, dy + 0.05); mesh(G, postG, col, { at: p }); }
  // the ring beam, arched brackets between the posts
  for (let k = 0; k < n; k++) {
    const a = pt(k - 0.5, r - 0.05, dy + h), b = pt(k + 0.5, r - 0.05, dy + h), mid = a.clone().add(b).multiplyScalar(0.5), L = a.distanceTo(b);
    const bm = mesh(G, bevelBox(L + 0.2, 0.2, 0.14, 0.03), col, { at: mid.clone().add(V(0, 0.1, 0)) }); bm.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    const arch = new THREE.TorusGeometry(L / 2 - 0.08, 0.04, 4, 12, Math.PI); arch.scale(1, 0.32, 1);
    const am = mesh(G, arch, col, { at: mid.clone().add(V(0, -0.02, 0)), line: false }); am.rotation.set(Math.PI, -Math.atan2(b.z - a.z, b.x - a.x), 0, 'YXZ');
    if (k === open) continue;
    // the balustrade: a top rail, a bottom rail and balusters
    const lo = a.clone().setY(dy + 0.15), hi = a.clone().setY(dy + 0.9), lo2 = b.clone().setY(dy + 0.15), hi2 = b.clone().setY(dy + 0.9);
    for (const [p0, p1, t] of [[hi, hi2, 0.08], [lo, lo2, 0.06]]) { const r1 = mesh(G, bevelBox(L - 0.12, t, 0.1, 0.02), col, { at: p0.clone().add(p1).multiplyScalar(0.5) }); r1.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x); }
    const nb = Math.round(L / 0.16);
    for (let i = 1; i < nb; i++) { const p = a.clone().lerp(b, i / nb); mesh(G, new THREE.CylinderGeometry(0.025, 0.03, 0.72, 6), col, { at: V(p.x, dy + 0.52, p.z), line: false, shadow: false }); }
  }
  // steps up through the open side
  { const c = pt(open, r + 0.25, 0); const ry = -Math.atan2(c.z, c.x) + Math.PI / 2;
    for (let s = 0; s < 2; s++) { const sp = pt(open, r + 0.3 + s * 0.3, 0); const st = mesh(G, bevelBox(1.4, 0.16, 0.32, 0.025), texm(O.stonesTex('#c4bca8')), { at: V(sp.x, dy - 0.12 - s * 0.16, sp.z) }); st.rotation.y = ry; } }
  // the roof: six faces of shingles up to a point, hip rolls, a finial
  const RG = new THREE.Group(); G.add(RG);
  const ro = r + 0.45, ey = dy + h + 0.2, apex = V(0, ey + 1.5, 0), faces = [];
  for (let k = 0; k < n; k++) faces.push({ a0: pt(k - 0.5, ro, ey), a1: pt(k + 0.5, ro, ey), b1: apex.clone(), b0: apex.clone() });
  // (face order: counter-clockwise seen from above, so each face points out)
  for (const f of faces) { const nn = f.a1.clone().sub(f.a0).cross(f.b0.clone().sub(f.a0)); if (nn.y < 0) { const t = f.a0; f.a0 = f.a1; f.a1 = t; } }
  roofFaces(RG, faces, { cover: 'shingle', col: roof, th: 0.12, trim: col });
  for (let k = 0; k < n; k++) ridgeCap(RG, pt(k - 0.5, ro, ey + 0.08), apex.clone().add(V(0, 0.06, 0)), shade(roof, 0.8), 0.06, 'shingle');
  mesh(RG, new THREE.LatheGeometry([[0.001, 0], [0.12, 0], [0.08, 0.15], [0.1, 0.25], [0.04, 0.4], [0.06, 0.5], [0.001, 0.62]].map(([a, b]) => new THREE.Vector2(a, b)), 10), col, { at: apex.clone().add(V(0, 0.02, 0)) });
  O.foldFlat(G);
  G.userData.deck = dy + 0.05;
  return G;
}

// ---------- preview scenes (kit.html) ----------
export const PREVIEW = {
  kit_house: (G, put) => {
    put(building({ W: 7, D: 5.6, floors: 1, wall: { kind: 'siding', col: '#a9cbe8' }, roof: { type: 'gable', cover: 'clay', col: '#d8473a' }, chimney: { x: -2, z: -1 },
      openings: [{ face: 'front', kind: 'door', x: -1.6, lamp: 'right', number: 3, canopy: true }, { face: 'front', kind: 'window', x: 1.5, w: 1.6, h: 1.3, panes: [3, 2], box: '#c99a62' },
        { face: 'left', kind: 'window', x: 0 }, { face: 'right', kind: 'window', x: 0, shutters: '#3f7a52' }], dormers: [] }), -9, 0);
    put(building({ W: 6.4, D: 5.2, wall: { kind: 'plaster', col: '#efe2c8' }, roof: { type: 'gable', cover: 'thatch', col: '#b8954e', rise: 2.6 }, moss: true, chimney: { x: 2, z: -0.6, kind: 'stone', col: '#b0a08a' },
      openings: [{ face: 'front', kind: 'door', x: 0.9, col: '#5f8a7a', glass: false }, { face: 'front', kind: 'window', x: -1.6, shutters: '#5f8a7a', box: '#8a5a3a' }], ivy: [{ face: 'front', x: -1.5, w: 3, h: 3 }] }), 0, 0);
    put(building({ W: 8, D: 6, floors: 2, wall: { kind: 'plaster', col: '#f2e2b8', upper: 'timber', frame: '#6b4a33' }, roof: { type: 'hip', cover: 'slate', col: '#5a6a7a', rise: 2.4 }, chimney: [{ x: -2.4, z: 0 }],
      openings: [{ face: 'front', kind: 'double', x: 0, canopy: true, lamp: 'left' }, { face: 'front', kind: 'window', x: -2.6, shutters: '#3f7a52' }, { face: 'front', kind: 'window', x: 2.6, shutters: '#3f7a52' },
        { face: 'front', kind: 'window', x: -2, floor: 1, box: '#c99a62' }, { face: 'front', kind: 'window', x: 2, floor: 1, box: '#c99a62' }] }), 10, 0);
    return '0,6,19,0,2.8,0';
  },
  gazebo: (G, put) => { put(gazebo(), 0, 0); return '3,3,7,0,1.6,0'; },
  kit_shop: (G, put) => {
    put(building({ W: 6, D: 5, floors: 2, wall: { kind: 'brick', col: '#b7604a' }, roof: { type: 'mansard', cover: 'slate', col: '#4a5868', rise: 2.6 }, awning: { col: '#3a74c8' }, sign: { text: 'POKé MART', y: 3.15, col: '#3a74c8' },
      openings: [{ face: 'front', kind: 'shop', x: 0.6, w: 2.8 }, { face: 'front', kind: 'door', x: -2.1, w: 0.95 }, { face: 'front', kind: 'window', x: -1.5, floor: 1 }, { face: 'front', kind: 'window', x: 1.5, floor: 1 }] }), -4, 0);
    put(building({ W: 4, D: 3.2, wall: { kind: 'planks', col: '#9a6a42' }, roof: { type: 'shed', cover: 'corrugated', col: '#8a9a9a', rise: 0.6 }, openings: [{ face: 'front', kind: 'door', x: 0.8, glass: false, col: '#6a4a30' }, { face: 'front', kind: 'window', x: -0.9, w: 0.8, h: 0.6, y: 1.2 }] }), 4, 0);
    return '0,5,13,0,2.5,0';
  },
};
void boxG; void toon;
// outdoor.js builds its tea house and shrine roofs with this kit
O.setBuildingKit({ roof, roofFaces, ridgeCap, building, windowUnit, doorUnit, wallLamp, chimney });
