// Outdoor props for the open world (Route 1 first; any town or route may use
// them). One builder per prop: builder(params) -> THREE.Group with its
// footprint centred on the origin, standing on y = 0, its front toward +z;
// the caller places and turns it (route1.js). Painted in the town's cel look
// (the BUILD bands of town.js); the screen-space and vector ink outline them
// like every other building. Overgrowth (ivy, moss, vines) comes from
// foliage.js's leaf cards, so a building can be "taken back by the green".
//
// Catalog (params in each builder's signature):
//   teaHouse  shogiBench  parasol  chochin  stoneLantern  shrine  torii
//   menuBoard  kettleStove  furin  vendingMachine  picnicTable  coinTelescope
//   birdhouse  scarecrow  shed  haybale  martCart  telegraphPole  streetLamp
//   busShelter  postbox  stoneBridge  footbridge  waterTower  windmill
//   cottage  viridianGate  cityBlock  clockTower  fallenLog  mushroomRing
//   welcomeArch (see route1.js for the "VIRIDIAN CITY" sign: signs.js)
import * as THREE from 'three';
import { toon } from '../toon.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../terrain.js';
import { HEAD, BODY } from './kit.js';
let KIT = null;
export const setBuildingKit = (k) => { KIT = k; };
const BK = () => KIT;
import { leafMaterial, ivyGeometry, vineGeometry, greenRoofGeometry, barkMaterial, pushCard, toGeometry, cards, TILE } from '../foliage.js';

const BUILD = { deep: [0.56, 0.62, 0.82], shade: [0.74, 0.79, 0.94], lit: [1.06, 1.04, 0.98], bands: [0.1, 0.3, 0.58] };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const memo = new Map();
const M = (k, f) => { if (!memo.has(k)) memo.set(k, f()); return memo.get(k); };
const FLATS = new Set();
export const flat = (col, side) => M('c' + col + (side || ''), () => { const m = toon(col, { cel: BUILD, side }); FLATS.add(m); return m; });
// Fold every plain-coloured part of a group into one vertex-colour material
// (a building or prop then costs one draw for all its painted trim, posts,
// buttons...). Parts marked userData.keep (moving parts) are left alone.
export function foldFlat(G) {
  G.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !FLATS.has(o.material)) return;
    for (let q = o; q && q !== G; q = q.parent) if (q.userData.keep) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(), n = g.attributes.position.count, c = o.material.color, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    o.geometry = g; o.material = vcFlat(o.material.side === THREE.FrontSide ? undefined : o.material.side);
  });
  return G;
}
// one material for many plain colours: the colours ride in the vertices
export const vcFlat = (side) => M('vc' + (side || ''), () => toon('#ffffff', { cel: BUILD, side, vertexColors: true }));
export function texm(t, col = '#ffffff', side, vc = false) {
  if (t.tint) {
    // the tint that turns the neutral picture into the wanted colour
    const n = new THREE.Color(NEUTRAL), c = new THREE.Color(t.col).multiply(new THREE.Color(col));
    col = '#' + new THREE.Color(Math.min(1, c.r / n.r), Math.min(1, c.g / n.g), Math.min(1, c.b / n.b)).getHexString();
    t = t.t;
  }
  return M('t' + t.uuid + col + (side || '') + (vc ? 'vc' : ''), () => toon(col, { map: t, cel: BUILD, side, vertexColors: vc }));
}
function mergeNI(list) {
  const P = [], N = [], C = [];
  for (const g of list) { P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); if (g.attributes.color) C.push(...g.attributes.color.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  if (C.length) g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2));
  return g;
}
const asM = (m) => (typeof m === 'string' ? flat(m) : m);
// Painted surfaces (wood, tiles, thatch, plaster, stone) are painted once in a
// neutral colour and tinted by the material: one picture per kind, however
// many colours use it (fewer textures to load on the phone).
const NEUTRAL = '#e8e4dc';
export const tinted = (col, t) => ({ tint: true, t, col });
export const NEUTRAL_COL = '#e8e4dc';
export const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

// ---------- painted textures ----------
const texCache = new Map();
export function paint(key, w, h, draw, repeat = true) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  let hsh = 7; for (const ch of key) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  draw(c.getContext('2d'), w, h, rng(hsh));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.name = key;
  texCache.set(key, t);
  return t;
}
// wood boards (texture = 2 x 2 m)
export const planks = (col) => tinted(col, paint('o_planks', 256, 256, (x, w, h, R) => { const col = NEUTRAL;
  for (let k = 0; k < 8; k++) {
    x.fillStyle = shade(col, 0.9 + R() * 0.18); x.fillRect(0, k * 32, w, 32);
    x.fillStyle = shade(col, 0.68); x.fillRect(0, k * 32 + 30, w, 2);
    x.globalAlpha = 0.25; x.fillStyle = shade(col, 0.75);
    for (let j = 0; j < 4; j++) x.fillRect(R() * w, k * 32 + 6 + R() * 20, 40 + R() * 80, 1.5);
    x.globalAlpha = 1;
  }
}));
// Japanese roof tiles (kawara): rounded ridges in rows (1.5 x 1.5 m)
export const kawara = (col) => tinted(col, paint('o_kawara', 256, 256, (x, w, h, R) => { const col = NEUTRAL;
  x.fillStyle = shade(col, 0.65); x.fillRect(0, 0, w, h);
  const cols = 8, cw = w / cols;
  for (let c = 0; c < cols; c++) {
    const g = x.createLinearGradient(c * cw, 0, c * cw + cw, 0);
    g.addColorStop(0, shade(col, 0.78)); g.addColorStop(0.45, shade(col, 1.18)); g.addColorStop(1, shade(col, 0.82));
    x.fillStyle = g; x.fillRect(c * cw + 2, 0, cw - 4, h);
  }
  for (let r = 0; r < 6; r++) { x.fillStyle = shade(col, 0.55); x.fillRect(0, r * h / 6 + h / 6 - 3, w, 3); }
}));
// thatch: long straw strokes (2 x 2 m)
export const thatch = (col) => tinted(col, paint('o_thatch', 256, 256, (x, w, h, R) => { const col = NEUTRAL;
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 900; k++) {
    const px = R() * w, py = R() * h, L = 18 + R() * 30;
    x.strokeStyle = shade(col, 0.7 + R() * 0.5); x.lineWidth = 1.2 + R() * 1.5;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (R() - 0.5) * 4, py + L); x.stroke();
  }
}));
export const clay = (col) => tinted(col, paint('o_clay', 256, 256, (x, w, h, R) => { const col = NEUTRAL;
  x.fillStyle = shade(col, 0.72); x.fillRect(0, 0, w, h);
  const rows = 7, cols = 9, rh = h / rows, cw = w / cols;
  for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
    const cx = (c + (r % 2) * 0.5) * cw, y = r * rh;
    const g = x.createLinearGradient(cx, 0, cx + cw, 0);
    g.addColorStop(0, shade(col, 1.12)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, 0.82));
    x.fillStyle = g;
    x.beginPath(); x.moveTo(cx + 1.5, y); x.lineTo(cx + cw - 1.5, y); x.lineTo(cx + cw - 1.5, y + rh * 0.7);
    x.quadraticCurveTo(cx + cw / 2, y + rh * 1.12, cx + 1.5, y + rh * 0.7); x.fill();
    // moss in the joints, here and there
    if (R() < 0.12) { x.fillStyle = 'rgba(92,140,60,.55)'; x.beginPath(); x.ellipse(cx + cw / 2, y + rh * 0.8, cw * 0.5, rh * 0.25, 0, 0, 6.28); x.fill(); }
  }
}));
export const plaster = (col) => tinted(col, paint('o_plaster', 256, 256, (x, w, h, R) => { const col = NEUTRAL;
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 50; k++) { x.globalAlpha = 0.07; x.fillStyle = R() < 0.5 ? '#ffffff' : shade(col, 0.78); x.beginPath(); x.arc(R() * w, R() * h, 10 + R() * 30, 0, 6.28); x.fill(); }
  // damp at the foot
  const g = x.createLinearGradient(0, h, 0, h * 0.75); g.addColorStop(0, 'rgba(70,90,60,.35)'); g.addColorStop(1, 'rgba(70,90,60,0)');
  x.globalAlpha = 1; x.fillStyle = g; x.fillRect(0, 0, w, h);
}));
export const stonesTex = (col) => tinted(col, paint('o_stones', 256, 256, (x, w, h, R) => { const col = NEUTRAL;
  x.fillStyle = shade(col, 0.55); x.fillRect(0, 0, w, h);
  for (let k = 0; k < 44; k++) {
    const cx = R() * w, cy = R() * h, rx = 16 + R() * 22, ry = 11 + R() * 14;
    for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      x.fillStyle = shade(col, 0.88 + R() * 0.26);
      x.beginPath(); x.ellipse(cx + ox, cy + oy, rx, ry, R(), 0, 6.28); x.fill();
      if (R() < 0.15) { x.fillStyle = 'rgba(96,140,64,.5)'; x.beginPath(); x.ellipse(cx + ox, cy + oy + ry * 0.5, rx * 0.6, ry * 0.3, 0, 0, 6.28); x.fill(); }
    }
  }
}));
// clapboard siding: overlapping horizontal boards, a shadow under each lap (2 x 2 m)
export const siding = (col) => tinted(col, paint('o_siding', 256, 256, (x, w, h, R) => { const col = NEUTRAL;
  const n = 10, bh = h / n;
  for (let k = 0; k < n; k++) {
    const g = x.createLinearGradient(0, k * bh, 0, k * bh + bh);
    g.addColorStop(0, shade(col, 0.86)); g.addColorStop(0.25, shade(col, 1.0)); g.addColorStop(1, shade(col, 1.06));
    x.fillStyle = g; x.fillRect(0, k * bh, w, bh);
    x.fillStyle = shade(col, 0.62); x.fillRect(0, k * bh, w, 2.5);
    x.globalAlpha = 0.16; x.fillStyle = shade(col, 0.75);
    for (let j = 0; j < 3; j++) x.fillRect(R() * w, k * bh + 5 + R() * (bh - 9), 30 + R() * 60, 1.2);
    x.globalAlpha = 1;
    if (R() < 0.5) { x.fillStyle = shade(col, 0.7); x.fillRect(Math.floor(R() * 4) * 64 + 20, k * bh, 2, bh); }
  }
}));
// bricks in stretcher bond, pale mortar (2 x 2 m: 30 courses)
export const bricks = (col) => tinted(col, paint('o_bricks', 256, 256, (x, w, h, R) => { const col = NEUTRAL;
  x.fillStyle = shade(col, 1.18); x.fillRect(0, 0, w, h);
  const rows = 24, rh = h / rows, bw = w / 6;
  for (let r = 0; r < rows; r++) for (let c = -1; c < 7; c++) {
    const bx = c * bw + (r % 2) * bw / 2;
    x.fillStyle = shade(col, 0.82 + R() * 0.24);
    x.fillRect(bx + 1.5, r * rh + 1.5, bw - 3, rh - 3);
    x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(bx + 2, r * rh + 2, bw - 5, 2);
  }
}));
// wooden shingles: staggered rows, butt shadows (1.5 x 1.5 m)
export const shingles = (col) => tinted(col, paint('o_shingles', 256, 256, (x, w, h, R) => { const col = NEUTRAL;
  x.fillStyle = shade(col, 0.6); x.fillRect(0, 0, w, h);
  const rows = 8, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let px = -R() * 30;
    while (px < w) {
      const sw = 22 + R() * 26;
      const g = x.createLinearGradient(0, r * rh, 0, r * rh + rh);
      const v = 0.86 + R() * 0.24;
      g.addColorStop(0, shade(col, v * 0.85)); g.addColorStop(1, shade(col, v * 1.08));
      x.fillStyle = g; x.fillRect(px + 1.5, r * rh, sw - 3, rh - 3);
      x.fillStyle = shade(col, 0.5); x.fillRect(px + 1.5, r * rh + rh - 4, sw - 3, 3);
      px += sw;
    }
  }
}));
// window glass: a dim room behind, a bright diagonal reflection band, the
// sky's light on the upper panes (1 texture = one pane, 0..1)
export const glassTex = () => paint('o_glass', 128, 128, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#6a9ac0'); g.addColorStop(0.45, '#35577a'); g.addColorStop(1, '#1e3048');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(230,245,255,.55)';
  x.beginPath(); x.moveTo(w * 0.55, 0); x.lineTo(w * 0.85, 0); x.lineTo(w * 0.3, h); x.lineTo(w * 0.0, h); x.fill();
  x.fillStyle = 'rgba(230,245,255,.3)';
  x.beginPath(); x.moveTo(w * 0.92, 0); x.lineTo(w, 0); x.lineTo(w * 0.5, h); x.lineTo(w * 0.42, h); x.fill();
}, false);
// shoji: white paper in a wooden lattice (1 x 1 m)
const shoji = () => paint('o_shoji', 128, 128, (x, w, h) => {
  x.fillStyle = '#f6f0de'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#9a7048';
  for (let k = 0; k <= 4; k++) x.fillRect(k * w / 4 - 2, 0, 4, h);
  for (let k = 0; k <= 4; k++) x.fillRect(0, k * h / 4 - 2, w, 4);
}, true);
// a painted panel with words (clamped, one picture)
export function words(key, W, H, draw) { return paint(key, W, H, draw, false); }
export const fitFont = (x, text, size, maxW, font, weight = 400) => {
  let s = size;
  do { x.font = `${weight} ${s}px ${font}`; s -= 2; } while (x.measureText(text).width > maxW && s > 8);
};

// ---------- mesh helpers ----------
function wuv(g, s = 0.5) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * s; uv[i * 2 + 1] = v * s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
export function put(mesh, parent, x = 0, y = 0, z = 0, o = {}) {
  mesh.position.set(x, y, z);
  if (o.rx || o.ry || o.rz) mesh.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'YXZ');
  mesh.castShadow = o.shadow !== false; mesh.receiveShadow = true;
  mesh.userData.outline = o.line === false ? false : 'solid';
  parent.add(mesh);
  return mesh;
}
export const box = (w, h, d, m, x, y, z, P, o = {}) => put(new THREE.Mesh(wuv(new THREE.BoxGeometry(w, h, d), o.uvs || 0.5), asM(m)), P, x, y, z, o);
export const cyl = (rt, rb, h, m, x, y, z, P, seg = 12, o = {}) => put(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open), asM(m)), P, x, y, z, o);
export const ball = (r, m, x, y, z, P, o = {}) => put(new THREE.Mesh(new THREE.SphereGeometry(r, o.seg || 10, Math.max(6, (o.seg || 10) * 0.7 | 0)), asM(m)), P, x, y, z, o);
const cone = (r, h, m, x, y, z, P, seg = 8, o = {}) => put(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), asM(m)), P, x, y, z, o);
// a beam from a to b (square section s)
export function beam(a, b, s, m, P, o = {}) {
  const d = b.clone().sub(a), L = d.length();
  const g = wuv(new THREE.BoxGeometry(s, s, L + (o.over || 0)), 0.5);
  const mesh = put(new THREE.Mesh(g, asM(m)), P, 0, 0, 0, o);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  // turn its length (z) along a -> b in the parent's own frame (Object3D.lookAt
  // works in world space, which went wrong under a placed parent)
  const up = Math.abs(d.y) / (L || 1) > 0.99 ? V(1, 0, 0) : V(0, 1, 0);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(d, V(0, 0, 0), up));
  return mesh;
}
// a rope / wire from a to b sagging by `sag` (a thin tube)
export function rope(a, b, sag, r, m, P, o = {}) {
  const mid = a.clone().add(b).multiplyScalar(0.5); mid.y -= sag;
  const c = new THREE.QuadraticBezierCurve3(a, mid, b);
  return put(new THREE.Mesh(new THREE.TubeGeometry(c, o.seg || 10, r, 4, false), asM(m)), P, 0, 0, 0, { shadow: false, ...o });
}
// a sloped roof plane: w along x, from eave (z = +d/2, y0) up to ridge
// (z = -d/2, y0 + rise), thickness th, in a group turned to face `ry`
function roofSlab(P, w, d, rise, th, m, cx, y0, cz, ry, o = {}) {
  const G = new THREE.Group(); G.position.set(cx, y0, cz); G.rotation.y = ry; P.add(G);
  const L = Math.hypot(d, rise), ang = Math.atan2(rise, d);
  const slab = box(w, th, L, m, 0, rise / 2, 0, G, { uvs: o.uvs || 0.66 });
  slab.rotation.x = ang;
  return G;
}
// overgrowth: ivy on a face (facing +z in the group `P` space at x,y,z,
// turned ry), vines hanging from an edge, moss on a top
export function ivy(P, w, h, x, y, z, ry, seed, dens = 12) {
  const m = new THREE.Mesh(ivyGeometry(w, h, seed, dens), leafMaterial('#ffffff', 0.02));
  m.userData.qa = { k: 'face', w, h };   // tools/qa/scan.mjs: must lie on a wall's face
  return put(m, P, x, y, z, { ry, line: false, shadow: false });
}
export function vines(P, a, b, n, len, seed) {
  const m = new THREE.Mesh(vineGeometry(a, b, n, len, seed), leafMaterial('#ffffff', 0.04));
  return put(m, P, 0, 0, 0, { line: false, shadow: false });
}
export function mossTop(P, w, d, x, y, z, ry, seed) {
  const m = new THREE.Mesh(greenRoofGeometry(w, d, seed), leafMaterial('#ffffff', 0.02));
  m.userData.qa = { k: 'top', w, d };   // tools/qa/scan.mjs: must lie on a top
  return put(m, P, x, y, z, { ry, line: false, shadow: false });
}

// ---------- the tea house (a roadside chaya) ----------
// A timber rest house under a deep hipped roof of dark kawara tiles (real
// tile courses, a ridge with end tiles, hip ridges). In front, under the
// eaves, a raised plank veranda (engawa) to sit on. The front wall stands
// behind it, three bays between timber posts: on the left shoji screens over
// a plastered dado with a lattice; in the middle the way in, its lattice
// doors slid half open under the indigo noren; on the right the serving
// counter, its top shutter propped up as an awning, the keeper behind it
// with the kettle and a shelf of tea jars. The inside is a closed dim room
// (nothing to see through to); the TEA HOUSE board hangs under the eave,
// red paper lanterns along it. Front toward +z, W x D the floor.
export function teaHouse({ W = 8.4, D = 5.6, wood = '#8a5b38', roof = '#46566a', name = 'TEA HOUSE', sub = 'ROUTE 1 · REST & TEA' } = {}) {
  const G = new THREE.Group(); G.name = 'teahouse';
  const pw = texm(planks(wood)), pale = texm(planks('#c8a272')), dark = shade(wood, 0.7), FH = 0.48, WH = 2.5;
  const FZ = D / 2 - 1.3;   // the front wall; the veranda runs from it to the front posts
  const pl = texm(plaster('#efe6d2'));
  // the stone footing (down into the ground) and the raised plank floor
  box(W + 0.5, 0.9, D + 0.5, texm(stonesTex('#b4ad98')), 0, -0.15, 0, G);
  box(W + 0.62, 0.08, D + 0.62, shade('#b4ad98', 1.05), 0, 0.31, 0, G);
  box(W, 0.18, D, pale, 0, FH - 0.09, 0, G, { uvs: 0.5 });
  // floor joist ends along the veranda's front edge
  for (let i = 0; i < 14; i++) box(0.1, 0.1, 0.06, dark, -W / 2 + 0.3 + i * (W - 0.6) / 13, FH - 0.2, D / 2 + 0.02, G, { line: false });
  // the room inside: a closed box seen from within (dim, warm), tatami on its floor
  {
    const ig = new THREE.BoxGeometry(W - 0.56, WH - 0.1, FZ + D / 2 - 0.5);
    const room = put(new THREE.Mesh(ig, flat('#4a382a', THREE.BackSide)), G, 0, FH + WH / 2 - 0.02, (FZ - D / 2) / 2, { shadow: false, line: false });
    room.userData.noShadow = true;
    const tat = words('o_tatami', 256, 128, (x, w, h) => {
      x.fillStyle = '#b8bf7a'; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(110,120,60,.35)'; for (let k = 0; k < w; k += 4) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, h); x.stroke(); }
      x.fillStyle = '#2f3d2a'; x.fillRect(0, 0, w, 10); x.fillRect(0, h - 10, w, 10);
    });
    for (let i = 0; i < 3; i++) put(new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9).rotateX(-Math.PI / 2), texm(tat, '#8a8a7a')), G, -2.6 + i * 1.95, FH + 0.01, -0.6, { line: false, shadow: false });
  }
  // posts: the veranda's front, the corners, the front wall's bays
  const bays = [-W / 2 + 0.12, -W / 6, W / 6, W / 2 - 0.12];
  const post = (x, z, h = WH) => { box(0.22, h, 0.22, pw, x, FH + h / 2, z, G); box(0.3, 0.1, 0.3, texm(stonesTex('#c4bca8')), x, FH + 0.05 - 0.12, z, G); };
  for (const px of bays) { post(px, D / 2 - 0.15); post(px, FZ); }
  for (const px of [-W / 2 + 0.12, W / 2 - 0.12]) { post(px, -D / 2 + 0.12); post(px, (FZ - D / 2) / 2); }
  post(0, -D / 2 + 0.12);
  // the head beams (and the tie beams over the veranda)
  for (const z of [D / 2 - 0.15, FZ, -D / 2 + 0.12]) box(W + 0.3, 0.26, 0.22, pw, 0, FH + WH + 0.05, z, G);
  for (const px of bays) box(0.2, 0.2, D / 2 - FZ, pw, px, FH + WH - 0.05, (FZ + D / 2 - 0.15) / 2, G);
  for (const sx of [-1, 1]) box(0.22, 0.22, D, pw, sx * (W / 2 - 0.12), FH + WH + 0.05, 0, G);
  // a tie beam (nuki) through the posts at door height, all round
  for (const z of [FZ, -D / 2 + 0.12]) box(W - 0.1, 0.12, 0.1, dark, 0, FH + 2.0, z + (z > 0 ? 0.07 : -0.07), G, { line: false });
  // --- the front wall, bay by bay ---
  const bw = W / 3 - 0.24;
  // left bay: shoji screens above a plaster dado with a slatted lattice (koshi)
  {
    const cx = (bays[0] + bays[1]) / 2;
    box(bw, 0.75, 0.12, pl, cx, FH + 0.375, FZ, G);
    for (let k = 0; k < 12; k++) box(0.04, 0.7, 0.04, dark, cx - bw / 2 + 0.1 + k * (bw - 0.2) / 11, FH + 0.38, FZ + 0.08, G, { line: false });
    box(bw, 0.06, 0.08, dark, cx, FH + 0.76, FZ + 0.08, G, { line: false });
    for (let k = 0; k < 2; k++) {
      const sw = bw / 2 - 0.02, sx = cx - bw / 4 + k * bw / 2 + (k ? -0.04 : 0.04);
      box(sw, WH - 0.95 - 0.5, 0.06, dark, sx, FH + 0.8 + (WH - 1.45) / 2, FZ + 0.01 - k * 0.07, G);
      put(new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.12, WH - 1.57), texm(shoji())), G, sx, FH + 0.8 + (WH - 1.45) / 2, FZ + 0.045 - k * 0.07, { line: false });
    }
    box(bw, 0.45, 0.12, pl, cx, FH + WH - 0.23, FZ, G);
  }
  // middle bay: the way in, lattice doors slid half open, the noren over it
  {
    const cx = (bays[1] + bays[2]) / 2;
    box(bw, 0.4, 0.12, pl, cx, FH + WH - 0.2, FZ, G);
    box(bw + 0.05, 0.08, 0.16, dark, cx, FH + 0.04, FZ, G);   // the threshold
    for (const [k, dx] of [[0, -bw / 4 - bw * 0.28], [1, bw / 4]]) {
      const dw = bw / 2, dh = WH - 0.42, x = cx + dx, z = FZ + 0.08 - k * 0.07;
      const DG = new THREE.Group(); DG.position.set(x, FH + 0.04 + dh / 2, z); G.add(DG);
      box(dw, dh, 0.06, dark, 0, 0, 0, DG);
      put(new THREE.Mesh(new THREE.PlaneGeometry(dw - 0.14, dh - 0.5), texm(shoji(), '#d8cdb0')), DG, 0, 0.1, 0.035, { line: false });
      for (let j = 0; j < 5; j++) box(0.03, dh - 0.5, 0.03, dark, -dw / 2 + 0.12 + j * (dw - 0.24) / 4, 0.1, 0.05, DG, { line: false });
      box(dw - 0.1, 0.3, 0.04, shade(wood, 0.85), 0, -dh / 2 + 0.2, 0.04, DG, { line: false });
      box(0.03, 0.12, 0.03, '#2a1e16', (k ? -1 : 1) * (dw / 2 - 0.06), 0, 0.05, DG, { line: false });
    }
    // the noren: three indigo cloth strips with the white tea cup, on a rod
    const noren = words('o_noren', 256, 192, (x, w, h) => {
      x.fillStyle = '#2b3f6e'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#f2ead6';
      x.beginPath(); x.ellipse(w / 2, h * 0.5, 34, 26, 0, 0, Math.PI); x.lineTo(w / 2 - 34, h * 0.5); x.fill();
      x.fillRect(w / 2 - 40, h * 0.47, 80, 8);
      x.strokeStyle = '#f2ead6'; x.lineWidth = 5; x.beginPath(); x.arc(w / 2 + 40, h * 0.58, 12, -1.4, 1.4); x.stroke();
      for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(w / 2 - 14 + k * 14, h * 0.4); x.bezierCurveTo(w / 2 - 22 + k * 14, h * 0.3, w / 2 - 6 + k * 14, h * 0.25, w / 2 - 14 + k * 14, h * 0.14); x.stroke(); }
    });
    for (let i = 0; i < 3; i++) {
      const strip = new THREE.PlaneGeometry(0.62, 1.0, 1, 4);
      const uv = strip.attributes.uv, sp = strip.attributes.position;
      for (let k = 0; k < uv.count; k++) { uv.setX(k, (uv.getX(k) + i) / 3); sp.setZ(k, Math.pow((0.5 - sp.getY(k)), 2) * 0.12); }
      strip.computeVertexNormals();
      put(new THREE.Mesh(strip, texm(noren, '#ffffff', THREE.DoubleSide)), G, cx - 0.66 + i * 0.66, FH + WH - 0.55, FZ + 0.22, { line: false });
    }
    cyl(0.025, 0.025, 2.2, '#5a3a22', cx, FH + WH - 0.03, FZ + 0.22, G, 6).rotation.z = Math.PI / 2;
  }
  // right bay: the serving counter, its shutter propped up as an awning
  {
    const cx = (bays[2] + bays[3]) / 2, cy = FH + 0.95;
    box(bw, 0.95, 0.12, pl, cx, FH + 0.475, FZ, G);
    box(bw + 0.2, 0.08, 0.62, pale, cx, cy + 0.04, FZ + 0.1, G);   // the counter top, over the wall both sides
    box(bw, 0.34, 0.12, pl, cx, FH + WH - 0.17, FZ, G);
    // the shutter (shitomido): a slatted panel hinged at the top, held out on two sticks
    const SH = new THREE.Group(); SH.position.set(cx, FH + WH - 0.34, FZ + 0.08); SH.rotation.x = -1.05; G.add(SH);
    box(bw, 0.05, 1.15, dark, 0, 0, 0.575, SH);
    for (let k = 0; k < 6; k++) box(bw - 0.06, 0.03, 0.04, shade(wood, 0.95), 0, -0.035, 0.1 + k * 0.19, SH, { line: false });
    for (const sx of [-1, 1]) beam(V(cx + sx * (bw / 2 - 0.15), cy + 0.08, FZ + 0.3), V(cx + sx * (bw / 2 - 0.15), FH + WH - 0.34 - Math.cos(1.05) * 1.0 * 0 + 0.48, FZ + 0.08 + Math.sin(1.05) * 0.98), 0.04, dark, G);
    // on the counter: cups, a tray of dumplings, a little bell
    for (let i = 0; i < 4; i++) cyl(0.06, 0.05, 0.08, i % 2 ? '#e8e2d2' : '#7a9a6a', cx - 0.8 + i * 0.32, cy + 0.12, FZ + 0.18, G, 8);
    box(0.4, 0.03, 0.26, '#3a2a1c', cx + 0.6, cy + 0.095, FZ + 0.15, G);
    for (let i = 0; i < 3; i++) for (const c of ['#f4b6c8', '#f6f2e8', '#9ac46a']) ball(0.035, c, cx + 0.48 + i * 0.12, cy + 0.14 + ['#f4b6c8', '#f6f2e8', '#9ac46a'].indexOf(c) * 0.045, FZ + 0.15, G, { seg: 6, line: false });
    // inside, behind the keeper: the shelf of tea jars and the brazier with the kettle
    box(bw - 0.2, 0.05, 0.3, pw, cx, FH + 1.75, FZ - 1.35, G);
    for (let i = 0; i < 5; i++) cyl(0.1, 0.11, 0.26, ['#b05a3a', '#e6d7b0', '#55707a', '#b05a3a', '#7a6a4a'][i], cx - 0.9 + i * 0.45, FH + 1.91, FZ - 1.35, G, 10);
    cyl(0.22, 0.2, 0.55, texm(stonesTex('#8a8070')), cx + 0.9, FH + 0.28, FZ - 1.1, G, 10);
    ball(0.17, '#2c2a2a', cx + 0.9, FH + 0.68, FZ - 1.1, G, { seg: 10 }).scale.y = 0.8;
  }
  // side and back walls: plaster between the posts, a timber frame, a round window west
  for (const sx of [-1, 1]) {
    box(0.14, WH, FZ + D / 2 - 0.25, pl, sx * (W / 2 - 0.12), FH + WH / 2, (FZ - D / 2) / 2 + 0.02, G);
    for (const y of [FH + 1.0, FH + 2.0]) box(0.1, 0.12, FZ + D / 2 - 0.2, dark, sx * (W / 2 - 0.04), y, (FZ - D / 2) / 2, G, { line: false });
  }
  box(W - 0.3, WH, 0.14, pl, 0, FH + WH / 2, -D / 2 + 0.12, G);
  for (const y of [FH + 1.0, FH + 2.0]) box(W - 0.2, 0.12, 0.1, dark, 0, y, -D / 2 + 0.03, G, { line: false });
  put(new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.06, 6, 20), flat('#5a3a22')), G, -W / 2 + 0.03, FH + 1.5, -0.6, { ry: Math.PI / 2 });
  put(new THREE.Mesh(new THREE.CircleGeometry(0.43, 20), texm(shoji())), G, -W / 2 + 0.04, FH + 1.5, -0.6, { ry: -Math.PI / 2, line: false });
  for (let k = -1; k <= 1; k++) box(0.03, 0.86, 0.03, '#5a3a22', -W / 2 + 0.02, FH + 1.5, -0.6 + k * 0.2, G, { line: false });
  // the roof: a deep hip of dark kawara tiles on all four sides
  const OV = 1.25, RT = FH + WH + 0.18;
  roofHip(G, W, D, RT, { over: OV, rise: 1.9, col: roof, trim: shade(wood, 0.8) });
  const RW = W + OV * 2, RD = D + OV * 2;
  // rafter ends under the eaves (front and back)
  for (const sz of [-1, 1]) for (let i = 0; i < 18; i++) box(0.09, 0.09, OV + 0.2, dark, -W / 2 - 0.4 + i * (W + 0.8) / 17, RT - 0.12, sz * (D / 2 + OV / 2 - 0.05), G, { line: false });
  // the name board under the front eave
  const board = words('o_teaboard' + name, 512, 128, (x, w, h) => {
    x.fillStyle = '#3a2a1c'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f2e3c0'; x.fillRect(8, 8, w - 16, h - 16);
    x.fillStyle = '#6a2a20'; fitFont(x, name, 64, w * 0.86, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, w / 2, h * 0.44);
    x.fillStyle = '#5a4a3a'; fitFont(x, sub, 22, w * 0.8, BODY, 600); x.fillText(sub, w / 2, h * 0.82);
  });
  const bx = (bays[0] + bays[1]) / 2, by = FH + WH - 0.42, bz = D / 2 - 0.15 + 0.13;
  box(2.5, 0.72, 0.06, '#3a2a1c', bx, by, bz - 0.01, G);
  put(new THREE.Mesh(new THREE.PlaneGeometry(2.36, 0.6), texm(board)), G, bx, by, bz + 0.025, { line: false });
  for (const sx of [-1, 1]) rope(V(bx + sx * 1.0, by + 0.36, bz), V(bx + sx * 0.9, FH + WH - 0.05, bz - 0.02), 0.01, 0.012, '#3a2a1c', G);
  // a stone step up to the veranda
  box(2.2, 0.22, 0.6, texm(stonesTex('#c4bca8')), 0, 0.11, D / 2 + 0.55, G);
  box(1.6, 0.2, 0.5, texm(stonesTex('#c4bca8')), 0, 0.3, D / 2 + 0.3, G);
  // ivy up the west wall, vines off the eave's corner
  ivy(G, 1.8, 2.4, -W / 2 - 0.12, FH, -2.0, -Math.PI / 2, 41, 10);
  vines(G, V(-RW / 2, RT - 0.1, RD / 2 - 0.4), V(-RW / 2 + 1.6, RT - 0.1, RD / 2), 6, 1.1, 43);
  G.userData.foot = { hw: W / 2 + 0.3, hd: D / 2 + 0.3 };
  G.userData.front = FZ;
  G.userData.lantern = [[-RW / 2 + 0.6, RT - 0.1, RD / 2 - 0.15], [RW / 2 - 0.6, RT - 0.1, RD / 2 - 0.15], [-RW / 2 + 0.6, RT - 0.1, -0.5]];
  return G;
}
// a hipped kawara roof (the tea house, the shrine): the building kit's roof
// with Japanese tiles, a heavy ridge and end tiles (onigawara)
function roofHip(G, W, D, y0, { over = 1, rise = 1.6, col = '#46566a', trim = '#5a3a22' } = {}) {
  const R = BK().roof(G, W, D, y0, { type: 'hip', cover: 'kawara', col, rise, over, ridge: shade(col, 0.75), trim, gutters: false, th: 0.2 });
  const rl = Math.max(0.05, (W - D) / 2);
  for (const sx of [-1, 1]) { const o = box(0.34, 0.46, 0.4, shade(col, 0.7), sx * (rl + 0.1), y0 + rise + 0.32, 0, G); o.rotation.z = sx * 0.25; }
  box(rl * 2 + 0.3, 0.2, 0.34, shade(col, 0.72), 0, y0 + rise + 0.2, 0, G);
  return R;
}
// a low bench with a red felt cloth (shogi), L long
export function shogiBench({ L = 1.9, felt = '#c8312e', wood = '#8a5b38' } = {}) {
  const G = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.08, 0.42, 0.08, wood, sx * (L / 2 - 0.12), 0.21, sz * 0.24, G);
  box(L, 0.07, 0.62, texm(planks(wood)), 0, 0.45, 0, G);
  // the felt drapes over the front and back edges
  box(L + 0.04, 0.03, 0.66, felt, 0, 0.5, 0, G);
  for (const sz of [-1, 1]) box(L + 0.04, 0.16, 0.025, felt, 0, 0.43, sz * 0.34, G);
  return G;
}
// a big paper parasol (nodate-gasa): ribs under a shallow red canopy
export function parasol({ r = 1.6, h = 2.5, col = '#d23a34' } = {}) {
  const G = new THREE.Group();
  cyl(0.035, 0.04, h, '#c8a26a', 0, h / 2, 0, G, 6);
  // the paper canopy: 24 folds (alternately lit and shaded by their ridges), a rim, a band
  const can = new THREE.ConeGeometry(r, 0.55, 48, 2, true); { const p = can.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.025 * Math.abs(Math.sin(a * 12)); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } can.computeVertexNormals(); }
  put(new THREE.Mesh(can, flat(col, THREE.DoubleSide)), G, 0, h + 0.05, 0);
  put(new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 4, 48).rotateX(Math.PI / 2), flat(shade(col, 0.7))), G, 0, h - 0.22, 0, { line: false });
  put(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.42, r * 0.5, 0.06, 32, 1, true), flat('#f2e6c8', THREE.DoubleSide)), G, 0, h + 0.12, 0, { line: false });
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; beam(V(0, h - 0.5, 0), V(Math.cos(a) * r * 0.62, h - 0.12, Math.sin(a) * r * 0.62), 0.018, '#e8d4a8', G, { line: false }); }
  cone(0.08, 0.16, '#3a2a1c', 0, h + 0.38, 0, G, 6);
  // the stand: a stone weight
  cyl(0.22, 0.26, 0.24, '#8f8a7c', 0, 0.12, 0, G, 10);
  return G;
}
// a café market parasol: a pole with a crank, eight ribs under a canvas of
// eight panels (alternating light and dark), a scalloped valance, a finial
export function marketParasol({ r = 1.45, h = 2.35, col = '#e8402e', col2 = '#f4f1e6' } = {}) {
  const G = new THREE.Group(), n = 8, rise = 0.5;
  cyl(0.03, 0.035, h + 0.2, '#d8d0c0', 0, (h + 0.2) / 2, 0, G, 8);
  cyl(0.06, 0.06, 0.12, '#9a9aa2', 0, 1.2, 0, G, 8);
  for (let k = 0; k < n; k++) {
    const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, c = k % 2 ? col2 : col;
    const p0 = V(Math.cos(a0) * r, h, Math.sin(a0) * r), p1 = V(Math.cos(a1) * r, h, Math.sin(a1) * r), ap = V(0, h + rise, 0);
    const g = new THREE.BufferGeometry().setFromPoints([p0, ap, p1, p0, p1, ap]);   // both sides
    g.computeVertexNormals();
    put(new THREE.Mesh(g, flat(c)), G, 0, 0, 0);
    // the valance: a scalloped flap hanging under each panel's edge
    const m = p0.clone().add(p1).multiplyScalar(0.5), L = p0.distanceTo(p1);
    const sh = new THREE.Shape(); sh.moveTo(-L / 2, 0); sh.lineTo(L / 2, 0); sh.lineTo(L / 2, -0.1);
    for (let q = 2; q >= 0; q--) sh.quadraticCurveTo(-L / 2 + (q + 0.5) * L / 3, -0.24, -L / 2 + q * L / 3, -0.1);
    sh.closePath();
    put(new THREE.Mesh(new THREE.ShapeGeometry(sh, 4), flat(c, THREE.DoubleSide)), G, m.x, h + 0.005, m.z, { ry: -(a0 + a1) / 2 + Math.PI / 2, line: false });
    beam(V(0, h - 0.55, 0), V(Math.cos(a0) * r * 0.6, h + rise * 0.38, Math.sin(a0) * r * 0.6), 0.015, '#e8e2d2', G, { line: false });
  }
  ball(0.05, '#d8d0c0', 0, h + rise + 0.04, 0, G, { seg: 8 });
  return G;
}
// a bistro table and chairs (round top with a lip, a pedestal, slat chairs)
export function bistroSet({ wood = '#c99a62', iron = '#3a3d46', chairs = 3, top = '#fbf3e0' } = {}) {
  const G = new THREE.Group();
  cyl(0.5, 0.5, 0.05, top, 0, 0.75, 0, G, 20); cyl(0.51, 0.49, 0.03, shade(top, 0.85), 0, 0.715, 0, G, 20, { line: false });
  cyl(0.035, 0.05, 0.7, iron, 0, 0.38, 0, G, 8);
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; beam(V(0, 0.1, 0), V(Math.cos(a) * 0.32, 0.01, Math.sin(a) * 0.32), 0.035, iron, G); }
  const pw = texm(planks(wood));
  for (let c = 0; c < chairs; c++) {
    const a = c / chairs * Math.PI * 2 + 0.3, C = new THREE.Group(); C.position.set(Math.cos(a) * 0.82, 0, Math.sin(a) * 0.82); C.rotation.y = -a - Math.PI / 2; G.add(C);
    for (let i = 0; i < 4; i++) bev(0.42, 0.03, 0.09, pw, 0, 0.45, -0.15 + i * 0.1, C, 0.01);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(V(sx * 0.18, 0.44, sz * 0.17), V(sx * 0.2, 0, sz * 0.2), 0.025, iron, C);
    for (const sx of [-1, 1]) beam(V(sx * 0.18, 0.44, -0.2), V(sx * 0.19, 0.95, -0.25), 0.025, iron, C);
    for (let i = 0; i < 3; i++) bev(0.4, 0.07, 0.025, pw, 0, 0.62 + i * 0.11, -0.22 - i * 0.012, C, 0.008);
  }
  return G;
}
// a paper lantern (chochin) hanging from y = 0 downward
export function chochin({ col = '#e0402c', s = 1 } = {}) {
  const G = new THREE.Group();
  cyl(0.008, 0.008, 0.18 * s, '#3a2a1c', 0, -0.09 * s, 0, G, 4, { line: false, shadow: false });
  const b = ball(0.2 * s, col, 0, -0.4 * s, 0, G, { seg: 12, shadow: false }); b.scale.y = 1.3;
  for (const y of [-0.15, -0.65]) cyl(0.12 * s, 0.12 * s, 0.06 * s, '#2a1e16', 0, y * s, 0, G, 10, { shadow: false });
  // a white band with a dark mark
  cyl(0.205 * s, 0.205 * s, 0.08 * s, '#f6ecd4', 0, -0.4 * s, 0, G, 12, { shadow: false, line: false });
  return G;
}
// a stone lantern (toro): base, post, fire box, roof, jewel
export function stoneLantern({ s = 1, col = '#a9a592' } = {}) {
  const G = new THREE.Group(), st = texm(stonesTex(col));
  cyl(0.34 * s, 0.4 * s, 0.22 * s, st, 0, 0.11 * s, 0, G, 6);
  cyl(0.11 * s, 0.13 * s, 0.75 * s, st, 0, 0.6 * s, 0, G, 8);
  cyl(0.3 * s, 0.24 * s, 0.14 * s, st, 0, 1.02 * s, 0, G, 6);
  box(0.42 * s, 0.34 * s, 0.42 * s, st, 0, 1.26 * s, 0, G);
  box(0.2 * s, 0.18 * s, 0.44 * s, '#f6d98a', 0, 1.27 * s, 0, G, { line: false });   // the light window
  cone(0.46 * s, 0.32 * s, st, 0, 1.6 * s, 0, G, 6);
  ball(0.08 * s, st, 0, 1.82 * s, 0, G, { seg: 8 });
  mossTop(G, 0.5 * s, 0.5 * s, 0, 1.5 * s, 0, 0.4, 77);
  return G;
}
// a wayside shrine (hokora) on a stone plinth, a tiny torii before it
export function shrine({ wood = '#9a6a42', roof = '#3f4f5f' } = {}) {
  const G = new THREE.Group(), st = texm(stonesTex('#aaa694'));
  box(1.4, 0.5, 1.2, st, 0, 0.25, 0, G);
  box(1.0, 0.75, 0.8, texm(planks(wood)), 0, 0.88, -0.05, G);
  box(0.5, 0.5, 0.05, '#2a1e16', 0, 0.85, 0.36, G);   // the little doors, shut
  box(0.04, 0.5, 0.06, '#c9a24a', 0, 0.85, 0.39, G);
  { const RG = new THREE.Group(); RG.position.z = -0.05; G.add(RG);
    BK().roof(RG, 1.0, 0.8, 1.25, { type: 'gable', cover: 'kawara', col: roof, rise: 0.42, over: 0.32, gableOver: 0.22, gutters: false, th: 0.07, trim: shade(wood, 0.75), wall: texm(planks(wood)) }); }
  for (const sx of [-1, 1]) box(0.08, 0.75, 0.08, shade(wood, 0.75), sx * 0.5, 0.88, 0.37, G);
  // offerings: a rice cake, a cup, a tiny vase of flowers
  ball(0.08, '#f6f2e8', -0.25, 0.56, 0.42, G); cyl(0.05, 0.04, 0.07, '#e8e2d2', 0.1, 0.54, 0.42, G, 8);
  cyl(0.04, 0.05, 0.14, '#55707a', 0.32, 0.57, 0.42, G, 8); ball(0.06, '#f2c94a', 0.32, 0.68, 0.42, G);
  // a straw rope (shimenawa) with paper zigzags
  rope(V(-0.55, 1.22, 0.38), V(0.55, 1.22, 0.38), 0.08, 0.035, '#d8c27a', G);
  for (const x of [-0.25, 0.25]) box(0.07, 0.18, 0.01, '#ffffff', x, 1.06, 0.4, G, { line: false });
  // the torii
  const TG = new THREE.Group(); TG.position.set(0, 0, 1.6); G.add(TG);
  for (const sx of [-1, 1]) cyl(0.07, 0.08, 1.7, '#d2402e', sx * 0.6, 0.85, 0, TG, 8);
  box(1.7, 0.12, 0.16, '#2a1e16', 0, 1.74, 0, TG);
  box(1.45, 0.09, 0.1, '#d2402e', 0, 1.5, 0, TG);
  mossTop(G, 1.3, 0.6, 0, 1.5, -0.2, 0, 78);
  ivy(G, 1.2, 0.5, 0, 0.0, 0.61, 0, 79, 8);
  return G;
}
// a menu board (a standing A-board) with the day's teas
export function menuBoard({ title = 'TODAY\'S TEA', lines = ['GREEN TEA ....... 50', 'BARLEY TEA ...... 40', 'SWEET DUMPLINGS .. 80', 'LEMONADE ....... 60'] } = {}) {
  const G = new THREE.Group();
  const t = words('o_menu' + title, 256, 384, (x, w, h) => {
    x.fillStyle = '#2f3b33'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f2e9cf'; fitFont(x, title, 40, w * 0.86, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(title, w / 2, 44);
    x.strokeStyle = '#e2a53c'; x.lineWidth = 3; x.beginPath(); x.moveTo(30, 74); x.lineTo(w - 30, 74); x.stroke();
    x.textAlign = 'left'; lines.forEach((l, i) => { x.fillStyle = ['#bfe6c8', '#ffe1a8', '#ffc4c0', '#cfe2ff'][i % 4]; fitFont(x, l, 22, w * 0.88, BODY, 600); x.fillText(l, 16, 112 + i * 58); });
    x.fillStyle = '#f2e9cf'; x.font = `600 18px ${BODY}`; x.textAlign = 'center'; x.fillText('~ please rest a while ~', w / 2, h - 30);
  });
  for (const sz of [-1, 1]) {
    const P = new THREE.Group(); P.rotation.x = sz * 0.17; P.position.z = sz * 0.0; G.add(P);
    box(0.62, 0.92, 0.04, '#7a5234', 0, 0.5, sz * 0.02, P);
    if (sz > 0) put(new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.8), texm(t)), P, 0, 0.5, 0.045, { line: false });
  }
  return G;
}
// a charcoal brazier with an iron kettle on it (steam in the native game)
export function kettleStove() {
  const G = new THREE.Group();
  cyl(0.3, 0.25, 0.45, texm(stonesTex('#8a8070')), 0, 0.22, 0, G, 10);
  cyl(0.26, 0.26, 0.04, '#e86a2c', 0, 0.45, 0, G, 10, { line: false });
  const k = ball(0.22, '#2c2a2a', 0, 0.62, 0, G, { seg: 12 }); k.scale.y = 0.8;
  cyl(0.03, 0.05, 0.25, '#2c2a2a', 0.22, 0.66, 0, G, 6).rotation.z = -0.8;
  rope(V(-0.15, 0.75, 0), V(0.15, 0.75, 0), -0.18, 0.015, '#2c2a2a', G);
  return G;
}
// a glass wind chime (furin) hanging from y = 0
export function furin() {
  const G = new THREE.Group();
  cyl(0.004, 0.004, 0.1, '#444', 0, -0.05, 0, G, 3, { shadow: false, line: false });
  const b = ball(0.07, '#bfe6f2', 0, -0.12, 0, G, { seg: 10, shadow: false }); b.scale.y = 0.85;
  box(0.06, 0.16, 0.005, '#f2f0e6', 0, -0.3, 0, G, { shadow: false, line: false });
  return G;
}

// ---------- roadside things ----------
// a chamfered block (the cel rim light catches the bevels)
function bevel(w, h, d, c = 0.03) {
  const sh = new THREE.Shape(), x = w / 2, z = d / 2; c = Math.min(c, x * 0.45, z * 0.45);
  sh.moveTo(-x + c, -z); sh.lineTo(x - c, -z); sh.lineTo(x, -z + c); sh.lineTo(x, z - c); sh.lineTo(x - c, z); sh.lineTo(-x + c, z); sh.lineTo(-x, z - c); sh.lineTo(-x, -z + c); sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2).translate(0, -h / 2, 0);
}
const bev = (w, h, d, m, x, y, z, P, c = 0.03, o = {}) => put(new THREE.Mesh(bevel(w, h, d, c), asM(m)), P, x, y, z, o);
// a drinks vending machine: a chamfered cabinet on a plinth, a lit brand
// header, the product window (cans on three shelves behind glass, a price
// and a pick button under each), the control column (coin slot, note slot,
// display, coin return), the drop bay with its flap, vents down the side
export function vendingMachine({ col = '#d23a34', brand = 'POKé COLA' } = {}) {
  const G = new THREE.Group(), dk = shade(col, 0.62);
  bev(1.06, 0.1, 0.8, '#3a3a3e', 0, 0.05, 0, G, 0.03);
  bev(1.0, 1.78, 0.74, col, 0, 0.98, 0, G, 0.06);
  bev(1.04, 0.1, 0.78, dk, 0, 1.9, 0, G, 0.05);
  // the brand header: a lit panel in a frame
  const head = words('o_vendhead' + brand, 256, 64, (x, w, h) => { x.fillStyle = '#fff8e8'; x.fillRect(0, 0, w, h); x.fillStyle = col; fitFont(x, brand, 40, w * 0.9, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(brand, w / 2, h / 2 + 2); });
  bev(0.9, 0.22, 0.06, dk, 0, 1.71, 0.37, G, 0.02);
  put(new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.17), new THREE.MeshBasicMaterial({ map: head })), G, 0, 1.71, 0.404, { line: false });
  // the product window: the painted cans behind a glass in a frame
  const t = words('o_vend' + brand, 256, 400, (x, w, h, R) => {
    x.fillStyle = '#eef2f4'; x.fillRect(0, 0, w, h);
    const cans = ['#e84a3a', '#3a8ae8', '#f2c94a', '#5ac46a', '#f28a3a', '#b05ad8'];
    for (let r = 0; r < 3; r++) {
      x.fillStyle = '#c8d0d6'; x.fillRect(0, 96 + r * 128, w, 6);
      for (let c = 0; c < 6; c++) {
        const cx = 22 + c * 42, cy = 50 + r * 128;
        x.fillStyle = cans[(r * 2 + c) % cans.length]; x.beginPath(); x.roundRect(cx - 13, cy - 38, 26, 76, 5); x.fill();
        x.fillStyle = 'rgba(255,255,255,.6)'; x.fillRect(cx - 8, cy - 32, 4, 64);
        x.fillStyle = '#9aa2a8'; x.fillRect(cx - 11, cy - 41, 22, 5);
        x.fillStyle = '#ffffff'; x.fillRect(cx - 14, cy + 44, 28, 14); x.fillStyle = '#2a2a2a'; x.font = `600 11px ${BODY}`; x.textAlign = 'center'; x.fillText(String(100 + ((r * 6 + c) % 4) * 20), cx, cy + 55);
      }
    }
  });
  bev(0.72, 1.12, 0.05, dk, -0.1, 1.08, 0.37, G, 0.02);
  put(new THREE.Mesh(new THREE.PlaneGeometry(0.64, 1.02), new THREE.MeshBasicMaterial({ map: t })), G, -0.1, 1.08, 0.4, { line: false });
  put(new THREE.Mesh(new THREE.PlaneGeometry(0.64, 1.02), texm(glassTex(), '#ffffff')), G, -0.1, 1.08, 0.402, { line: false }).material = new THREE.MeshBasicMaterial({ map: glassTex(), transparent: true, opacity: 0.22, depthWrite: false });
  // a pick button under each can (three rows of six)
  const btnG = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) btnG.push(new THREE.CapsuleGeometry(0.012, 0.03, 2, 6).rotateZ(Math.PI / 2).translate(-0.1 - 0.32 + 0.0525 + c * 0.1067, 1.08 + 0.51 - 0.31 - r * 0.327, 0.405));
  for (const g of btnG) put(new THREE.Mesh(g, flat('#48d870')), G, 0, 0, 0, { line: false, shadow: false });
  // the control column: a little display, coin and note slots, coin return
  const cx = 0.38;
  bev(0.16, 0.62, 0.04, '#2e2e34', cx, 1.15, 0.38, G, 0.015);
  box(0.11, 0.05, 0.01, '#58f088', cx, 1.4, 0.402, G, { line: false });
  bev(0.08, 0.1, 0.02, '#b8bcc0', cx, 1.27, 0.405, G, 0.01); box(0.012, 0.06, 0.02, '#111', cx, 1.27, 0.412, G, { line: false });
  bev(0.11, 0.05, 0.02, '#b8bcc0', cx, 1.15, 0.405, G, 0.01); box(0.08, 0.008, 0.02, '#111', cx, 1.15, 0.412, G, { line: false });
  cyl(0.02, 0.02, 0.02, '#c8c8cc', cx, 1.05, 0.41, G, 10).rotation.x = Math.PI / 2;
  bev(0.1, 0.07, 0.04, '#2a2a2e', cx, 0.92, 0.39, G, 0.01);
  // the drop bay: a dark recess with a hinged clear flap
  bev(0.64, 0.24, 0.06, dk, -0.05, 0.36, 0.37, G, 0.02);
  box(0.54, 0.16, 0.04, '#141418', -0.05, 0.36, 0.385, G, { line: false });
  const fl = box(0.54, 0.15, 0.015, '#3a3a40', -0.05, 0.38, 0.41, G, { line: false }); fl.rotation.x = -0.25;
  // vents along the side, a recycling slot box beside it
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) box(0.01, 0.025, 0.4, dk, sx * 0.505, 0.3 + k * 0.06, -0.05, G, { line: false });
  ivy(G, 0.9, 1.0, 0, 0.0, -0.39, Math.PI, 91, 8);
  return G;
}
// a picnic table with its benches on two A-frames: legs splay outward to
// the ground (wider at the foot), a cross brace and a tie to the benches
export function picnicTable({ wood = '#a87a4c' } = {}) {
  const G = new THREE.Group(), pw = texm(planks(wood)), fr = texm(planks(shade(wood, 0.85)));
  const top = 0.76, seat = 0.45, L = 1.9;
  // the top: five boards with gaps, the seats: two boards each
  for (let i = 0; i < 5; i++) bev(L, 0.06, 0.15, pw, 0, top, -0.34 + i * 0.17, G, 0.015);
  for (const sz of [-1, 1]) for (let i = 0; i < 2; i++) bev(L, 0.05, 0.14, pw, 0, seat, sz * (0.62 + i * 0.16), G, 0.015);
  for (const sx of [-0.68, 0.68]) {
    // the frame's cross pieces under the top and under the seats
    bev(0.07, 0.08, 0.86, fr, sx, top - 0.07, 0, G, 0.012);
    bev(0.07, 0.08, 1.62, fr, sx, seat - 0.065, 0, G, 0.012);
    // the A legs: from under the top's middle out to the ground past the seats
    for (const sz of [-1, 1]) beam(V(sx, top - 0.08, sz * 0.14), V(sx, 0.0, sz * 0.82), 0.075, fr, G);
    // the brace from the seat rail's middle up to the top's middle
    beam(V(sx, seat - 0.06, 0), V(sx * 0.15, top - 0.09, 0), 0.06, fr, G);
  }
  // the thermos and a bento left on it
  cyl(0.06, 0.06, 0.26, '#3a8a7a', 0.4, top + 0.16, 0.1, G, 10); cyl(0.065, 0.065, 0.05, '#2a2a2a', 0.4, top + 0.3, 0.1, G, 10);
  bev(0.3, 0.09, 0.22, '#c8312e', -0.3, top + 0.075, -0.1, G, 0.02); box(0.32, 0.015, 0.02, '#f2ead6', -0.3, top + 0.125, -0.1, G, { line: false });
  return G;
}
// a coin-operated telescope on a pedestal: a flared iron foot bolted to a
// plinth, a fluted column, a yoke, the binocular head with its eyepiece
// hood, sun visor and lenses (looking toward +z), a coin box on the side
export function coinTelescope({ col = '#3f7a74' } = {}) {
  const G = new THREE.Group(), dk = shade(col, 0.7);
  bev(0.5, 0.08, 0.5, '#8f8a7c', 0, 0.04, 0, G, 0.04);
  put(new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.24, 0], [0.24, 0.04], [0.16, 0.1], [0.09, 0.22], [0.075, 0.3]].map(([r, y]) => new THREE.Vector2(r, y)), 14), flat(col)), G, 0, 0.08, 0);
  cyl(0.065, 0.075, 0.78, col, 0, 0.75, 0, G, 10);
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; box(0.014, 0.7, 0.014, dk, Math.cos(a) * 0.068, 0.75, Math.sin(a) * 0.068, G, { line: false, shadow: false }); }
  cyl(0.09, 0.07, 0.06, dk, 0, 1.16, 0, G, 10);
  // the yoke and the head, tipped down a little toward the view
  for (const sx of [-1, 1]) bev(0.04, 0.22, 0.08, dk, sx * 0.21, 1.27, 0, G, 0.01);
  const H = new THREE.Group(); H.position.set(0, 1.32, 0); H.rotation.x = 0.1; G.add(H);
  bev(0.38, 0.26, 0.4, col, 0, 0, 0, H, 0.06);
  cyl(0.02, 0.02, 0.48, '#c9b26a', 0, 0, 0, H, 6).rotation.z = Math.PI / 2;
  for (const sx of [-0.09, 0.09]) {
    const b = cyl(0.075, 0.09, 0.36, shade(col, 0.88), sx, 0.02, 0.28, H, 12); b.rotation.x = Math.PI / 2;
    const l = cyl(0.07, 0.07, 0.01, '#bfe6f2', sx, 0.02, 0.465, H, 12, { line: false }); l.rotation.x = Math.PI / 2;
    const e = cyl(0.04, 0.05, 0.1, '#202020', sx, 0.04, -0.24, H, 10); e.rotation.x = Math.PI / 2;
  }
  bev(0.34, 0.14, 0.1, '#2a2a2a', 0, 0.05, -0.25, H, 0.03);   // the eyepiece hood
  const vz = bev(0.42, 0.03, 0.22, dk, 0, 0.15, 0.38, H, 0.02); vz.rotation.x = -0.15;   // the visor over the lenses
  // the coin box with its slot and the turning handle
  bev(0.12, 0.16, 0.1, dk, 0.24, -0.04, -0.06, H, 0.02); box(0.015, 0.07, 0.03, '#e2c25a', 0.3, -0.02, -0.06, H, { line: false });
  for (const sx of [-1, 1]) { const hd = cyl(0.016, 0.016, 0.22, '#2a2a2a', sx * 0.15, -0.03, -0.32, H, 6); hd.rotation.x = Math.PI / 2 - 0.4; }
  return G;
}
// a birdhouse on a pole: a little gabled house with a shingle roof (kit
// courses), a round door with a perch, trim on the eaves, on a post with a
// bracket
export function birdhouse({ h = 2.4, col = '#e8d6a8', roof = '#c4553a', s = 1 } = {}) {
  const G = new THREE.Group();
  cyl(0.045, 0.06, h + 0.3, '#8a6a4a', 0, (h + 0.3) / 2 - 0.3, 0, G, 7);
  bev(0.26 * s, 0.04, 0.26 * s, '#8a6a4a', 0, h + 0.02, 0, G, 0.01);
  beam(V(0, h - 0.35, 0), V(0, h - 0.02, 0.1 * s), 0.035, '#8a6a4a', G);
  const B = new THREE.Group(); B.position.y = h + 0.04; G.add(B);
  bev(0.3 * s, 0.34 * s, 0.28 * s, texm(planks(col)), 0, 0.17 * s, 0, B, 0.015);
  BK().roof(B, 0.3 * s, 0.28 * s, 0.34 * s, { type: 'gable', axis: 'z', cover: 'shingle', col: roof, rise: 0.14 * s, over: 0.06 * s, gableOver: 0.06 * s, gutters: false, th: 0.025, trim: shade(col, 0.85), wall: texm(planks(col)) });
  put(new THREE.Mesh(new THREE.CircleGeometry(0.05 * s, 12), flat('#2a1e16')), B, 0, 0.22 * s, 0.145 * s, { line: false });
  put(new THREE.Mesh(new THREE.TorusGeometry(0.055 * s, 0.01, 4, 12), flat(shade(col, 0.8))), B, 0, 0.22 * s, 0.145 * s, { line: false });
  cyl(0.008, 0.008, 0.1, '#8a6a4a', 0, 0.12 * s, 0.18 * s, B, 4).rotation.x = Math.PI / 2;
  return G;
}
// a scarecrow: crossed poles, a sack head with a straw hat, a patched coat
export function scarecrow({ coat = '#5a7ab0' } = {}) {
  const G = new THREE.Group();
  cyl(0.05, 0.06, 2.3, '#8a6a4a', 0, 1.15, 0, G, 6);
  box(1.7, 0.08, 0.08, '#8a6a4a', 0, 1.6, 0, G);
  box(0.6, 0.8, 0.28, coat, 0, 1.35, 0, G);
  for (const sx of [-1, 1]) box(0.48, 0.18, 0.2, coat, sx * 0.5, 1.58, 0, G);
  box(0.16, 0.16, 0.02, '#d8b04a', 0.12, 1.4, 0.15, G, { line: false });   // a patch
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) box(0.03, 0.18, 0.03, '#e6c86a', sx * (0.8 + k * 0.03), 1.52, (k - 1) * 0.04, G, { line: false });
  ball(0.22, '#d8c49a', 0, 1.98, 0, G, { seg: 10 });
  for (const sx of [-0.07, 0.07]) box(0.04, 0.04, 0.02, '#2a1e16', sx, 2.02, 0.21, G, { line: false });
  cyl(0.38, 0.4, 0.05, '#e6c86a', 0, 2.16, 0, G, 14); cyl(0.17, 0.2, 0.18, '#e6c86a', 0, 2.26, 0, G, 12);
  cyl(0.2, 0.2, 0.05, '#c8312e', 0, 2.2, 0, G, 12, { line: false });
  return G;
}
// a little timber shed with a tin roof, a door and a cart wheel by it
export function shed({ W = 3.2, D = 2.6, wood = '#9a6a42', roof = '#7a8a8a' } = {}) {
  const G = new THREE.Group();
  box(W, 2.1, D, texm(planks(wood)), 0, 1.05, 0, G);
  box(1.0, 1.7, 0.06, shade(wood, 0.75), 0.4, 0.88, D / 2 + 0.02, G);
  box(0.6, 0.5, 0.06, '#f2e2b0', -0.8, 1.35, D / 2 + 0.02, G);   // a window
  const r = box(W + 0.5, 0.06, D + 0.7, roof, 0, 2.35, 0, G); r.rotation.x = -0.18;
  const wh = put(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 16), flat('#6a4a30')), G, W / 2 + 0.08, 0.45, 0.2, { ry: Math.PI / 2 });
  void wh;
  ivy(G, 1.4, 1.6, -W / 2 - 0.02, 0, 0.3, -Math.PI / 2, 93, 9);
  return G;
}
export function haybale({ r = 0.6 } = {}) {
  const G = new THREE.Group();
  const t = paint('o_hay', 128, 128, (x, w, h, R) => { x.fillStyle = '#e2c46a'; x.fillRect(0, 0, w, h); for (let k = 0; k < 300; k++) { x.strokeStyle = shade('#e2c46a', 0.75 + R() * 0.5); x.beginPath(); const px = R() * w, py = R() * h; x.moveTo(px, py); x.lineTo(px + 12, py + (R() - 0.5) * 4); x.stroke(); } });
  const c = cyl(r, r, 1.2, texm(t), 0, r, 0, G, 14); c.rotation.z = Math.PI / 2;
  return G;
}
// the POKé MART clerk's sample cart: a two-wheeled hand cart with a
// chamfered counter, the shop's blue trim and name plate, a striped awning
// on posts with a scalloped valance, a push bar, the box of POTION samples
export function martCart({ col = '#3a74c8' } = {}) {
  const G = new THREE.Group();
  bev(1.5, 0.78, 0.72, '#f4f2ea', 0, 0.62, 0, G, 0.04);
  bev(1.58, 0.06, 0.8, shade('#f4f2ea', 0.92), 0, 1.04, 0, G, 0.02);
  bev(1.52, 0.12, 0.74, col, 0, 0.29, 0, G, 0.03);
  for (const sx of [-1, 1]) {
    put(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 6, 18), flat('#3a3a3a')), G, sx * 0.55, 0.26, 0.4);
    cyl(0.07, 0.07, 0.06, '#c8c8c0', sx * 0.55, 0.26, 0.42, G, 10).rotation.x = Math.PI / 2;
    for (let k = 0; k < 6; k++) { const sp = box(0.025, 0.46, 0.02, '#8a8a90', sx * 0.55, 0.26, 0.4, G, { line: false }); sp.rotation.z = k / 6 * Math.PI; }
  }
  beam(V(-0.75, 0.95, -0.38), V(-1.05, 1.0, -0.38), 0.04, '#c8c8c0', G); beam(V(-0.75, 0.95, 0.38), V(-1.05, 1.0, 0.38), 0.04, '#c8c8c0', G);
  beam(V(-1.05, 1.0, -0.42), V(-1.05, 1.0, 0.42), 0.05, '#3a3a3a', G);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(0.025, 0.025, 1.25, '#c8c8c0', sx * 0.7, 1.68, sz * 0.32, G, 6);
  const n = 8, aw = 1.7;
  for (let i = 0; i < n; i++) {
    const c = i % 2 ? '#ffffff' : col, x0 = -aw / 2 + i * aw / n;
    box(aw / n, 0.03, 1.0, c, x0 + aw / n / 2, 2.32, 0.05, G).rotation.x = 0.22;
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(aw / n, 0); sh.lineTo(aw / n, -0.08); sh.quadraticCurveTo(aw / n / 2, -0.2, 0, -0.08); sh.closePath();
    put(new THREE.Mesh(new THREE.ShapeGeometry(sh, 4), flat(c, THREE.DoubleSide)), G, x0, 2.21, 0.54, { line: false });
  }
  const label = words('o_martlabel', 256, 64, (x, w, h) => { x.fillStyle = col; x.fillRect(0, 0, w, h); x.fillStyle = '#ffffff'; fitFont(x, 'POKé MART', 40, w * 0.9, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('POKé MART', w / 2, h / 2); });
  bev(1.26, 0.34, 0.04, shade(col, 0.75), 0, 0.68, 0.37, G, 0.015);
  put(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), texm(label)), G, 0, 0.68, 0.392, { line: false });
  // the sample box and a few purple POTIONs
  bev(0.5, 0.2, 0.35, texm(planks('#e8d6a8')), -0.3, 1.17, 0, G, 0.02);
  for (let i = 0; i < 4; i++) {
    const px = 0.15 + (i % 2) * 0.13, pz = -0.08 + (i >> 1) * 0.15;
    put(new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.05, 0], [0.055, 0.08], [0.03, 0.13], [0.02, 0.16], [0.001, 0.16]].map(([a, b]) => new THREE.Vector2(a, b)), 10), flat('#8a5ad0')), G, px, 1.07, pz);
    cyl(0.022, 0.022, 0.04, '#f2f2f2', px, 1.25, pz, G, 6);
  }
  const fs = words('o_freesample', 256, 96, (x, w, h) => { x.fillStyle = '#fff6c8'; x.fillRect(0, 0, w, h); x.fillStyle = '#c8312e'; fitFont(x, 'FREE SAMPLE!', 44, w * 0.9, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('FREE SAMPLE!', w / 2, h / 2); });
  const st = put(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), texm(fs, '#ffffff', THREE.DoubleSide)), G, -0.3, 1.38, 0.15, { line: false }); st.rotation.x = -0.2;
  return G;
}

// ---------- civilization: Viridian's edge ----------
// a telegraph pole with a cross arm and four glass insulators; the wires'
// ends (for route1.js) in G.userData.ends, local
export function telegraphPole({ h = 7.2 } = {}) {
  const G = new THREE.Group(), wood = texm(planks('#7a5a3e'));
  cyl(0.11, 0.15, h, wood, 0, h / 2, 0, G, 8);
  box(1.8, 0.12, 0.12, '#6a4a30', 0, h - 0.5, 0, G);
  box(0.9, 0.1, 0.1, '#6a4a30', 0, h - 1.1, 0, G);
  const ends = [];
  for (const [x, y] of [[-0.8, h - 0.36], [-0.3, h - 0.36], [0.3, h - 0.36], [0.8, h - 0.36], [-0.35, h - 0.97], [0.35, h - 0.97]]) { cyl(0.04, 0.05, 0.12, '#7ac8b4', x, y, 0, G, 6); ends.push([x, y + 0.06]); }
  // ivy climbing the pole's foot
  vines(G, V(-0.12, 2.2, 0.12), V(0.12, 2.2, 0.12), 3, 2.1, 51);
  G.userData.ends = ends;
  return G;
}
// a cast-iron street lamp: a fluted post on a moulded base, a scrolled
// bracket collar, a four-sided lantern (glass panes in a frame, lit inside),
// a hipped cap and finial, ivy winding up the post
export function streetLamp({ h = 3.6, col = '#2f4a40' } = {}) {
  const G = new THREE.Group();
  put(new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.24, 0], [0.24, 0.08], [0.18, 0.14], [0.17, 0.4], [0.12, 0.48], [0.09, 0.62], [0.001, 0.62]].map(([a, b]) => new THREE.Vector2(a, b)), 10), flat(col)), G, 0, 0, 0);
  cyl(0.06, 0.08, h - 0.4, col, 0, 0.62 + (h - 0.4) / 2, 0, G, 10);
  for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; box(0.014, h - 0.7, 0.014, shade(col, 0.75), Math.cos(a) * 0.065, 0.62 + (h - 0.4) / 2, Math.sin(a) * 0.065, G, { line: false, shadow: false }); }
  cyl(0.1, 0.07, 0.12, col, 0, h + 0.18, 0, G, 10);
  for (let k = 0; k < 4; k++) { const sc = put(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.014, 4, 10, Math.PI * 1.3), flat(col)), G, Math.cos(k * 1.57) * 0.1, h + 0.05, Math.sin(k * 1.57) * 0.1, { ry: -k * 1.57 + Math.PI / 2, line: false }); void sc; }
  // the lantern
  bev(0.34, 0.05, 0.34, col, 0, h + 0.27, 0, G, 0.02);
  put(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.4, 0.24), new THREE.MeshBasicMaterial({ color: '#fff1c4' })), G, 0, h + 0.5, 0, { line: false });
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(0.035, 0.46, 0.035, col, sx * 0.14, h + 0.5, sz * 0.14, G);
  for (const y of [h + 0.3, h + 0.71]) for (const r of [0, Math.PI / 2]) { const b = box(0.3, 0.025, 0.02, col, 0, y, 0, G, { line: false }); b.rotation.y = r; b.position.x = r ? 0.14 : 0; b.position.z = r ? 0 : 0.14; const b2 = b.clone(); b2.position.x *= -1; b2.position.z *= -1; G.add(b2); }
  put(new THREE.Mesh(new THREE.ConeGeometry(0.29, 0.26, 4).rotateY(Math.PI / 4), flat(col)), G, 0, h + 0.86, 0);
  bev(0.4, 0.04, 0.4, col, 0, h + 0.74, 0, G, 0.02);
  put(new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.04, 0], [0.025, 0.06], [0.04, 0.1], [0.001, 0.16]].map(([a, b]) => new THREE.Vector2(a, b)), 8), flat(col)), G, 0, h + 0.98, 0);
  vines(G, V(-0.1, h - 0.4, 0.1), V(0.1, h - 0.4, 0.1), 2, h - 0.6, 61);
  return G;
}
// a bus stop shelter: a timber frame on a concrete pad, plank back and side
// walls with a window each, a curved tiled roof with real courses on a
// fascia, a bench, the timetable, the BUS sign on its own post
export function busShelter({ col = '#4f8a6a', roof = '#c4553a' } = {}) {
  const G = new THREE.Group(), pw = texm(planks('#a87a4c'));
  bev(3.0, 0.12, 1.6, texm(stonesTex('#c9c3b0')), 0, 0.06, 0, G, 0.03);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bev(0.12, 2.3, 0.12, col, sx * 1.3, 1.27, sz * 0.6, G, 0.02);
  for (const sz of [-1, 1]) bev(2.8, 0.14, 0.14, col, 0, 2.38, sz * 0.6, G, 0.02);
  for (const sx of [-1, 1]) bev(0.14, 0.14, 1.36, col, sx * 1.3, 2.38, 0, G, 0.02);
  // the back wall: boards below, a long window above
  bev(2.6, 1.0, 0.06, pw, 0, 0.62, -0.6, G, 0.01);
  bev(2.6, 0.12, 0.1, col, 0, 1.17, -0.6, G, 0.02);
  put(new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.95), texm(glassTex())), G, 0, 1.7, -0.6, { line: false });
  for (let k = 1; k < 4; k++) bev(0.05, 0.95, 0.06, col, -1.25 + k * 0.625, 1.7, -0.59, G, 0.01, { line: false });
  for (const sx of [-1, 1]) { bev(0.06, 1.0, 1.1, pw, sx * 1.33, 0.62, 0, G, 0.01); put(new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.9).rotateY(Math.PI / 2), texm(glassTex())), G, sx * 1.33, 1.65, 0, { line: false }); }
  // the roof: a shallow curve of tile courses over a fascia
  {
    const R = 2.4, a0 = -0.42, a1 = 0.42, n = 7, L = 3.4;
    for (let i = 0; i < n; i++) {
      const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n;
      const p0 = V(-L / 2, Math.cos(t0) * R - R + 2.62, Math.sin(t0) * R), p1 = V(L / 2, p0.y, p0.z), p2 = V(L / 2, Math.cos(t1) * R - R + 2.62, Math.sin(t1) * R), p3 = V(-L / 2, p2.y, p2.z);
      const ord = p0.z > 0 ? [p1, p0, p3, p2] : [p0, p1, p2, p3];
      const strip = BK().roofFaces ? null : null; void strip; void ord;
      const g = new THREE.BufferGeometry().setFromPoints([p0, p1, p2, p0, p2, p3, p0, p2, p1, p0, p3, p2]); g.computeVertexNormals();
      put(new THREE.Mesh(g, texm(clay(roof))), G, 0, 0, 0);
      const c = new THREE.CylinderGeometry(0.04, 0.04, L, 6).rotateZ(Math.PI / 2); put(new THREE.Mesh(c, flat(shade(roof, 0.75))), G, 0, p0.y + 0.02, p0.z, { line: false });
    }
    for (const sz of [-1, 1]) bev(L + 0.06, 0.16, 0.06, col, 0, Math.cos(0.42) * R - R + 2.55, sz * Math.sin(0.42) * R, G, 0.015);
  }
  // the bench along the back
  for (let k = 0; k < 3; k++) bev(2.4, 0.04, 0.12, pw, 0, 0.5, -0.45 + k * 0.13, G, 0.01);
  for (const sx of [-1, 1]) bev(0.06, 0.48, 0.34, col, sx * 1.0, 0.36, -0.32, G, 0.01);
  // the sign on its own post: the route's bus to VIRIDIAN CITY
  const st = words('o_busstop', 128, 128, (x, w, h) => {
    x.fillStyle = '#f6f2e6'; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 2, 0, 6.28); x.fill();
    x.fillStyle = '#2e6ac8'; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 10, 0, 6.28); x.fill();
    x.fillStyle = '#ffffff'; fitFont(x, 'BUS', 44, w * 0.7, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('BUS', w / 2, h / 2);
  });
  cyl(0.04, 0.05, 2.4, '#c8c8c0', 1.75, 1.2, 0.4, G, 8);
  cyl(0.33, 0.33, 0.04, '#c8c8c0', 1.75, 2.35, 0.4, G, 18).rotation.x = Math.PI / 2;
  for (const sz of [1, -1]) put(new THREE.Mesh(new THREE.CircleGeometry(0.3, 18), texm(st)), G, 1.75, 2.35, 0.4 + sz * 0.025, { ry: sz > 0 ? 0 : Math.PI, line: false });
  const tt = words('o_timetable', 128, 192, (x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); x.fillStyle = '#2e6ac8'; x.fillRect(0, 0, w, 28); x.fillStyle = '#ffffff'; x.font = `600 16px ${BODY}`; x.textAlign = 'center'; x.fillText('VIRIDIAN', w / 2, 20); x.fillStyle = '#333'; for (let i = 0; i < 7; i++) x.fillText(`${7 + i * 2}:15   ${7 + i * 2}:45`, w / 2, 52 + i * 20); });
  bev(0.36, 0.52, 0.03, col, -0.9, 0.85, -0.565, G, 0.01);
  put(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.45), texm(tt)), G, -0.9, 0.85, -0.548, { line: false });
  vines(G, V(-1.4, 2.4, 0.62), V(-0.4, 2.4, 0.62), 4, 1.0, 64);
  return G;
}
// a red pillar postbox with a rounded cap
export function postbox({ col = '#c8312e' } = {}) {
  const G = new THREE.Group();
  cyl(0.24, 0.26, 1.15, col, 0, 0.6, 0, G, 14);
  const cap = ball(0.27, col, 0, 1.18, 0, G, { seg: 14 }); cap.scale.y = 0.45;
  box(0.26, 0.04, 0.05, '#2a1e16', 0, 0.95, 0.24, G, { line: false });
  box(0.2, 0.12, 0.02, '#f6f2e6', 0, 0.75, 0.25, G, { line: false });
  cyl(0.28, 0.3, 0.1, '#2a2a2a', 0, 0.05, 0, G, 14);
  return G;
}
// a little arched stone bridge over a brook, deck along z, L long, w wide;
// y0 = the deck's top above the origin at its ends, arch rise `rise`
export function stoneBridge({ L = 8, w = 3.6, rise = 0.5, col = '#b4ad98' } = {}) {
  const G = new THREE.Group(), st = texm(stonesTex(col));
  const n = 10;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, z0 = -L / 2 + t0 * L, z1 = -L / 2 + t1 * L;
    const y0 = Math.sin(t0 * Math.PI) * rise, y1 = Math.sin(t1 * Math.PI) * rise;
    const seg = box(w, 0.35, Math.hypot(z1 - z0, y1 - y0) + 0.05, st, 0, (y0 + y1) / 2 - 0.17, (z0 + z1) / 2, G);
    seg.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
    for (const sx of [-1, 1]) { const p = box(0.3, 0.55, Math.hypot(z1 - z0, y1 - y0) + 0.05, st, sx * (w / 2 - 0.15), (y0 + y1) / 2 + 0.27, (z0 + z1) / 2, G); p.rotation.x = seg.rotation.x; }
  }
  // the arch underneath (a half ring) and the abutments
  // the arch's ring stones on both faces, under the deck (its crown just below it)
  const AR = Math.min(2.0, L * 0.24);
  for (const sx of [-1, 1]) { const arch = new THREE.TorusGeometry(AR, 0.28, 6, 16, Math.PI).rotateY(Math.PI / 2); put(new THREE.Mesh(arch, st), G, sx * (w / 2 - 0.2), -0.62 - AR, 0); }
  for (const sz of [-1, 1]) box(w + 0.4, 1.4, 1.2, st, 0, -0.7, sz * (L / 2 - 0.4), G);
  // ivy over the deck's edge and up the parapets (outer faces at x = +-w / 2)
  for (const sx of [-1, 1]) { ivy(G, 2.4, 1.0, sx * (w / 2 + 0.02), -0.12, 0, sx * Math.PI / 2, 71 + sx, 9); mossTop(G, 0.3, L * 0.6, sx * (w / 2 - 0.15), rise + 0.55, 0, 0, 73 + sx); }
  return G;
}
// a wooden footbridge (gently arched), deck along z
export function footbridge({ L = 6.5, w = 2.2, rise = 0.35, wood = '#9a6a42', rails = true } = {}) {
  const G = new THREE.Group(), pw = texm(planks(wood));
  const n = 9, ys = [];
  for (let i = 0; i <= n; i++) ys.push(Math.sin(i / n * Math.PI) * rise);
  for (let i = 0; i < n; i++) {
    const z0 = -L / 2 + i / n * L, z1 = -L / 2 + (i + 1) / n * L;
    const s = box(w, 0.1, Math.hypot(z1 - z0, ys[i + 1] - ys[i]) + 0.04, pw, 0, (ys[i] + ys[i + 1]) / 2 - 0.05, (z0 + z1) / 2, G);
    s.rotation.x = -Math.atan2(ys[i + 1] - ys[i], z1 - z0);
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i <= n; i += 3) { const z = -L / 2 + i / n * L; box(0.1, rails ? 1.0 : 0.3, 0.1, shade(wood, 0.85), sx * (w / 2 - 0.05), ys[i] + (rails ? 0.4 : 0.05), z, G); }
    if (rails) for (let i = 0; i < n; i++) {
      const z0 = -L / 2 + i / n * L, z1 = -L / 2 + (i + 1) / n * L;
      beam(V(sx * (w / 2 - 0.05), ys[i] + 0.88, z0), V(sx * (w / 2 - 0.05), ys[i + 1] + 0.88, z1), 0.08, shade(wood, 0.9), G, { over: 0.06 });
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.16, 1.3, 0.16, shade(wood, 0.7), sx * (w / 2 - 0.1), -0.6, sz * (L / 2 - 0.3), G);
  // stringers under the deck, stone abutments on the banks at both ends
  for (const sx of [-0.7, 0.7]) for (let i = 0; i < n; i++) {
    const z0 = -L / 2 + i / n * L, z1 = -L / 2 + (i + 1) / n * L;
    beam(V(sx * w / 2, ys[i] - 0.16, z0), V(sx * w / 2, ys[i + 1] - 0.16, z1), 0.14, shade(wood, 0.75), G, { over: 0.05 });
  }
  const st = texm(stonesTex('#b4ad98'));
  for (const sz of [-1, 1]) { box(w + 0.5, 1.6, 1.1, st, 0, -1.02, sz * (L / 2 - 0.35), G); box(w + 0.6, 0.12, 1.2, '#c4bca8', 0, -0.17, sz * (L / 2 - 0.35), G); }
  return G;
}
// a wooden water tower: a stave tank bound with iron hoops on a timber
// trestle (four battered legs on stone footings, two tiers of girts and X
// braces), a joist deck with a railed walkway round the tank, a conical
// shingle roof with a finial and a vent, the supply pipe, a caged ladder,
// the painted name, ivy
export function waterTower({ h = 7, r = 2.0, wood = '#8a6a4a' } = {}) {
  const G = new THREE.Group(), pw = texm(planks(wood)), dk = shade(wood, 0.78);
  const legAt = (y) => r * (0.9 - 0.3 * y / h);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    beam(V(sx * r * 0.9, -0.2, sz * r * 0.9), V(sx * r * 0.6, h, sz * r * 0.6), 0.24, dk, G);
    bev(0.6, 0.4, 0.6, texm(stonesTex('#a8a290')), sx * r * 0.9, 0.0, sz * r * 0.9, G, 0.06);
  }
  for (const y of [h * 0.33, h * 0.66]) for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
    const k = legAt(y);
    beam(V(a[0] * k, y, a[1] * k), V(b[0] * k, y, b[1] * k), 0.14, dk, G, { over: 0.1 });
    const y2 = y - h * 0.33, k2 = legAt(y2);
    beam(V(a[0] * k2, y2 + 0.1, a[1] * k2), V(b[0] * k, y - 0.1, b[1] * k), 0.08, dk, G);
    beam(V(b[0] * k2, y2 + 0.1, b[1] * k2), V(a[0] * k, y - 0.1, a[1] * k), 0.08, dk, G);
  }
  // the deck, its joists and the walkway rail
  cyl(r + 0.55, r + 0.55, 0.12, pw, 0, h + 0.06, 0, G, 20);
  for (let k = 0; k < 8; k++) { const j = box(0.12, 0.18, (r + 0.5) * 2, dk, 0, h - 0.09, 0, G, { line: false }); j.rotation.y = k * Math.PI / 8; }
  for (let k = 0; k < 16; k++) { const a = k / 16 * 6.28; cyl(0.035, 0.035, 0.95, dk, Math.cos(a) * (r + 0.48), h + 0.6, Math.sin(a) * (r + 0.48), G, 5); }
  put(new THREE.Mesh(new THREE.TorusGeometry(r + 0.48, 0.035, 4, 32).rotateX(Math.PI / 2), flat(dk)), G, 0, h + 1.08, 0);
  // the tank: staves, iron hoops, the name painted on it
  const tank = put(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r, 2.8, 28, 1), texm(planks(shade(wood, 1.05)))), G, 0, h + 1.52, 0);
  tank.geometry.rotateY(0.1);
  for (let k = 0; k < 28; k++) { const a = k / 28 * 6.28; box(0.02, 2.75, 0.03, shade(wood, 0.72), Math.cos(a) * r * 0.985, h + 1.52, Math.sin(a) * r * 0.985, G, { line: false, shadow: false }).rotation.y = -a; }
  for (const y of [h + 0.4, h + 1.0, h + 1.6, h + 2.2, h + 2.75]) put(new THREE.Mesh(new THREE.TorusGeometry(r * (1.0 - (y - h) * 0.01) + 0.02, 0.03, 4, 32).rotateX(Math.PI / 2), flat('#3a3a3a')), G, 0, y, 0, { line: false });
  const nm = words('o_waterworks', 512, 96, (x, w, hh) => { x.clearRect(0, 0, w, hh); x.fillStyle = 'rgba(245,238,220,.85)'; fitFont(x, 'VIRIDIAN WATER WORKS', 60, w * 0.95, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('VIRIDIAN WATER WORKS', w / 2, hh / 2); });
  { const g = new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.55, 24, 1, true, -0.9, 1.8); const m = new THREE.MeshLambertMaterial({ map: nm, transparent: true, depthWrite: false }); put(new THREE.Mesh(g, m), G, 0, h + 1.7, 0, { line: false, shadow: false }); }
  // the roof: a shingle cone with courses, a vent and a ball finial
  { const n = 10, rr = r + 0.4, top = V(0, h + 4.2, 0), ey = h + 2.95, faces = [];
    for (let k = 0; k < n; k++) { const a0 = k / n * 6.28, a1 = (k + 1) / n * 6.28; faces.push({ a0: V(Math.cos(a1) * rr, ey, Math.sin(a1) * rr), a1: V(Math.cos(a0) * rr, ey, Math.sin(a0) * rr), b1: top.clone(), b0: top.clone() }); }
    for (const f of faces) { const nn = f.a1.clone().sub(f.a0).cross(f.b0.clone().sub(f.a0)); if (nn.y < 0) { const t = f.a0; f.a0 = f.a1; f.a1 = t; } }
    BK().roofFaces(G, faces, { cover: 'shingle', col: '#4f7a8a', th: 0.1, trim: dk });
    cyl(0.18, 0.22, 0.4, '#3a4a50', 0, h + 4.25, 0, G, 8); ball(0.12, '#c9a24a', 0, h + 4.55, 0, G, { seg: 8 }); }
  // the supply pipe and the caged ladder
  cyl(0.14, 0.14, h + 0.3, '#4a5a60', -r * 0.3, (h + 0.3) / 2, -r * 0.3, G, 10);
  for (let y = 0.4; y < h + 2.4; y += 0.36) box(0.5, 0.04, 0.04, '#5a4a3a', 0, y, r * 0.92 + 0.62, G, { line: false });
  for (const sx of [-1, 1]) beam(V(sx * 0.25, 0, r * 0.95 + 0.62), V(sx * 0.25, h + 2.5, r + 0.6), 0.06, '#5a4a3a', G);
  for (let y = 2.2; y < h + 2.2; y += 0.7) put(new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.015, 3, 12, Math.PI).rotateX(Math.PI / 2), flat('#3a3a3a')), G, 0, y, r * 0.95 + 0.62, { line: false, shadow: false });
  ivy(G, 2.2, 3.4, 0, h, r + 0.02, 0, 81, 9);
  vines(G, V(-r, h + 2.8, r * 0.5), V(r * 0.2, h + 2.8, r), 5, 1.5, 82);
  return G;
}
// a windmill: a tapering tower of whitewashed stone on a plinth, a stone
// band at each floor, arched windows and a door with a canopy, a gallery
// with a railing, a boat-shaped thatched cap that turns, four lattice
// sails (stocks, whips, bars, cloth) and a tail pole (mesh 'r1_sails' turns
// in the native game: route1.gd)
export function windmill({ h = 9, col = '#d9d0b8' } = {}) {
  const G = new THREE.Group(), st = texm(stonesTex('#b0a690')), pl = texm(plaster(col), '#ffffff', undefined, true);
  const rb = 2.4, rt = 1.6, rAt = (y) => rb + (rt - rb) * y / h;
  bev(rb * 2 + 0.4, 0.6, rb * 2 + 0.4, st, 0, 0.0, 0, G, 0.4);
  { const g = new THREE.CylinderGeometry(rt, rb, h, 16, 4); g.translate(0, h / 2, 0);
    const p = g.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const k = 0.78 + 0.22 * Math.min(1, p.getY(i) / 1.2); c.set([k, k, k * 0.98], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    put(new THREE.Mesh(g, pl), G, 0, 0, 0); }
  for (const y of [h * 0.36, h * 0.7]) cyl(rAt(y) + 0.08, rAt(y) + 0.1, 0.18, st, 0, y, 0, G, 16);
  // the door under a little canopy, arched windows up the tower
  const front = (y, wid, hgt, ry = 0) => { const F = new THREE.Group(); F.rotation.y = ry; G.add(F); const z = rAt(y) + 0.02; const W = new THREE.Group(); W.position.set(0, y, z - 0.02); W.rotation.x = Math.atan2(rb - rt, h); F.add(W); return W; };
  { const W = front(0.2, 1, 2, 0); BK().doorUnit(W, { w: 0.95, h: 1.9, col: '#5a3a22', frame: '#e8e0cc', glass: false }); }
  for (const [y, ry] of [[h * 0.5, 0], [h * 0.82, 0.3], [h * 0.55, Math.PI * 0.6], [h * 0.55, -Math.PI * 0.6]]) { const W = front(y, 0.6, 0.8, ry); BK().windowUnit(W, { w: 0.55, h: 0.75, panes: [1, 2], frame: '#e8e0cc', curtains: '#f2e6c8' }); }
  // the gallery: a ring deck on brackets, a rail with posts
  const gy = h * 0.62, gr = rAt(gy) + 0.9;
  cyl(gr, gr, 0.1, texm(planks('#8a6a4a')), 0, gy, 0, G, 24);
  for (let k = 0; k < 12; k++) { const a = k / 12 * 6.28; beam(V(Math.cos(a) * (rAt(gy - 0.8)), gy - 0.8, Math.sin(a) * rAt(gy - 0.8)), V(Math.cos(a) * gr * 0.95, gy - 0.05, Math.sin(a) * gr * 0.95), 0.08, '#6a4a30', G); cyl(0.03, 0.03, 0.9, '#6a4a30', Math.cos(a) * (gr - 0.05), gy + 0.45, Math.sin(a) * (gr - 0.05), G, 5); }
  put(new THREE.Mesh(new THREE.TorusGeometry(gr - 0.05, 0.035, 4, 32).rotateX(Math.PI / 2), flat('#6a4a30')), G, 0, gy + 0.9, 0);
  // the cap: a boat-shaped thatched hood with a ridge, on a curb
  cyl(rt + 0.15, rt + 0.15, 0.2, '#6a4a30', 0, h + 0.1, 0, G, 16);
  { const g = new THREE.SphereGeometry(rt + 0.35, 16, 10, 0, 6.28, 0, Math.PI / 2); g.scale(1, 1.15, 1.25); put(new THREE.Mesh(g, texm(thatch('#9a7a4a'))), G, 0, h + 0.18, -0.15);
    const rg = new THREE.CylinderGeometry(0.16, 0.16, (rt + 0.35) * 2.4, 8).rotateX(Math.PI / 2); put(new THREE.Mesh(rg, texm(thatch('#7a5a34'))), G, 0, h + 0.18 + (rt + 0.35) * 1.13, -0.15);
    beam(V(0, h + 0.2, -rt), V(0, 0.9, -rb - 2.6), 0.14, '#6a4a30', G);   // the tail pole down to the ground
    box(0.5, 0.5, 0.5, '#6a4a30', 0, 0.75, -rb - 2.6, G); }
  const S = new THREE.Group(); S.name = 'r1_sails'; S.position.set(0, h + 0.5, rt + 0.7); S.userData.keep = true; G.add(S);
  cyl(0.22, 0.26, 0.9, '#5a3a22', 0, 0, -0.3, S, 10).rotation.x = Math.PI / 2;
  cyl(0.3, 0.3, 0.16, '#3a3a3a', 0, 0, 0.12, S, 10).rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const A = new THREE.Group(); A.rotation.z = i * Math.PI / 2 + 0.3; S.add(A);
    bev(0.16, 5.4, 0.14, '#6a4a30', 0, 2.75, 0.2, A, 0.03);              // the whip
    for (const x of [0.2, 1.1]) bev(0.05, 4.2, 0.05, '#8a6a4a', x, 3.2, 0.24, A, 0.01);   // the frame's long rails
    for (let k = 0; k < 13; k++) box(1.1, 0.05, 0.045, '#8a6a4a', 0.6, 1.1 + k * 0.33, 0.24, A, { line: false });
    // the sail cloth, furled on two of them, spread on the others
    const spread = i % 2 === 0;
    const cl = box(0.9, spread ? 3.9 : 3.9, 0.02, '#f2ead6', spread ? 0.65 : 0.32, 3.2, 0.27, A, { line: false });
    if (!spread) { cl.scale.x = 0.25; cyl(0.06, 0.06, 3.8, '#e8dcc0', 0.3, 3.2, 0.29, A, 6); }
  }
  ivy(G, 2.4, 3.6, 0, 0, rb - 0.05, 0, 85, 10);
  return G;
}
// a cottage on Viridian's edge (the building kit): plaster walls on a stone
// plinth, a clay tile roof with real courses, a stone chimney with pots, a
// panelled door under a little gabled canopy, shuttered windows with flower
// boxes, gutters and downpipes, moss low on the back, ivy over half the front
// and down the side, vines off the eaves
export function cottage({ W = 6.4, D = 5.2, wall = '#efe2c8', roof = '#c4553a', trim = '#5f8a7a', seed = 1 } = {}) {
  const R = rng(seed);
  const G = BK().building({ W, D, floors: 1, floorH: 2.8, trim: '#f6f0e2', seed,
    plinth: { h: 0.4, deep: 1.4, kind: 'stone', col: '#b4ad98' },
    wall: { kind: 'plaster', col: wall },
    roof: { type: 'gable', cover: 'clay', col: roof, rise: 2.0, over: 0.5, gableOver: 0.45 },
    chimney: { x: -W / 2 + 1.2, z: -0.6, kind: 'stone', col: '#b0a08a', w: 0.75, d: 0.7 },
    openings: [{ face: 'front', kind: 'door', x: 0.9, col: trim, glass: true, canopy: true, lamp: 'right' },
      { face: 'front', kind: 'window', x: -1.6, w: 1.1, h: 1.0, panes: [2, 2], shutters: trim, box: '#8a5a3a' },
      { face: 'back', kind: 'window', x: 1.2, w: 1.0, h: 1.0 }, { face: 'back', kind: 'window', x: -1.4, w: 0.8, h: 0.8, y: 1.2 },
      { face: 'left', kind: 'window', x: 0.4, w: 0.9, h: 1.0, shutters: trim }, { face: 'right', kind: 'round', x: 0, w: 0.7, y: 1.4 }],
    moss: true, ivy: [{ face: 'front', x: -W * 0.22, w: W * 0.5, h: 3.4 }, { face: 'right', x: 0, w: D * 0.8, h: 4.0 }] });
  vines(G, V(-W / 2 - 0.4, 0.4 + 2.8 - 0.2, D / 2 + 0.6), V(0.0, 0.4 + 2.8 - 0.2, D / 2 + 0.6), 7, 1.3, seed + 11);
  void R;
  return G;
}
// a stretch of a far city (Viridian beyond the gate, seen in the haze): a
// house of a few floors from the building kit, a gable or hip roof or a
// flat roof with a garden on it, vines down its walls
export function cityBlock({ W = 6, D = 6, floors = 2, wall = '#efe2c8', roof = '#3d7a6a', seed = 1, garden = true } = {}) {
  const R = rng(seed), type = R() < 0.35 ? 'flat' : R() < 0.6 ? 'hip' : 'gable';
  const per = Math.max(1, Math.floor(W / 2)), openings = [];
  for (let f = 0; f < floors; f++) for (let k = 0; k < per; k++) {
    const x = per === 1 ? 0 : -W / 2 + 1.1 + k * (W - 2.2) / (per - 1);
    if (f === 0 && k === Math.floor(per / 2)) openings.push({ face: 'front', kind: 'door', x, step: false, glass: true });
    else openings.push({ face: 'front', kind: 'window', x, floor: f, w: 0.9, h: 1.1, panes: [2, 2], box: R() < 0.4 ? '#8a5a3a' : null, shutters: R() < 0.3 ? roof : null, curtains: R() < 0.5 ? '#f2e6c8' : '#e8b8a0' });
  }
  const G = BK().building({ W, D, floors, floorH: 2.8, trim: '#f6f0e2', seed, lod: 'far',
    plinth: { h: 0.35, deep: 1.5, kind: 'stone', col: '#c4bca6' }, wall: { kind: R() < 0.3 ? 'brick' : 'plaster', col: R() < 0.3 ? '#c4785a' : wall },
    roof: { type, cover: R() < 0.5 ? 'clay' : 'slate', col: roof, rise: 1.6 + R(), over: 0.4, gableOver: 0.35, gutters: false },
    chimney: type !== 'flat' && R() < 0.6 ? { x: W / 2 - 1.0, z: -0.5, pots: 1 } : null, openings, ivy: garden ? [{ face: 'front', x: (R() - 0.5) * W * 0.3, w: W * 0.6, h: floors * 2.8, dens: 5 }] : [] });
  if (type === 'flat' && garden) mossTop(G, W - 0.4, D - 0.4, 0, 0.35 + floors * 2.8 + 0.35, 0, 0, seed + 3);
  return G;
}
// Viridian's clock tower: a tall stone shaft on a plinth with quoins and
// string courses, a belfry stage with arched openings, a clock face each
// side in a frame, a cornice, a green copper spire with lucarnes, a vane
export function clockTower({ h = 18, w = 4 } = {}) {
  const G = new THREE.Group(), st = texm(stonesTex('#c9bfa8'));
  bev(w + 0.8, 1.2, w + 0.8, st, 0, 0.3, 0, G, 0.12);
  bev(w, h, w, st, 0, h / 2, 0, G, 0.25);
  for (const y of [h * 0.3, h * 0.6, h - 3.4]) bev(w + 0.3, 0.3, w + 0.3, '#b0a690', 0, y, 0, G, 0.08);
  const face = words('o_clock', 256, 256, (x, w2, h2) => {
    x.fillStyle = '#f6f0dc'; x.beginPath(); x.arc(w2 / 2, h2 / 2, w2 / 2 - 4, 0, 6.28); x.fill();
    x.strokeStyle = '#2a2a2a'; x.lineWidth = 8; x.stroke();
    x.lineWidth = 6; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.28; x.beginPath(); x.moveTo(w2 / 2 + Math.cos(a) * 100, h2 / 2 + Math.sin(a) * 100); x.lineTo(w2 / 2 + Math.cos(a) * 115, h2 / 2 + Math.sin(a) * 115); x.stroke(); }
    x.lineWidth = 10; x.beginPath(); x.moveTo(w2 / 2, h2 / 2); x.lineTo(w2 / 2, h2 / 2 - 80); x.stroke();
    x.lineWidth = 7; x.beginPath(); x.moveTo(w2 / 2, h2 / 2); x.lineTo(w2 / 2 + 60, h2 / 2 + 20); x.stroke();
  });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, F = new THREE.Group(); F.rotation.y = a; G.add(F);
    put(new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 6, 24), flat('#b0a690')), F, 0, h - 2, w / 2 + 0.05);
    put(new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), texm(face)), F, 0, h - 2, w / 2 + 0.04, { line: false });
    // arched windows low and in the belfry
    for (const [y, ww, hh] of [[h * 0.45, 0.6, 1.4], [h + 1.4, 1.0, 1.8]]) {
      const sh = new THREE.Shape(); sh.moveTo(-ww / 2, -hh / 2); sh.lineTo(ww / 2, -hh / 2); sh.lineTo(ww / 2, hh / 2 - ww / 2); sh.absarc(0, hh / 2 - ww / 2, ww / 2, 0, Math.PI, false); sh.closePath();
      put(new THREE.Mesh(new THREE.ShapeGeometry(sh, 8), flat('#2a3038')), F, 0, y, (y > h ? (w - 0.6) / 2 : w / 2) + 0.03, { line: false });
      put(new THREE.Mesh(new THREE.TorusGeometry(ww / 2 + 0.06, 0.07, 4, 10, Math.PI), flat('#b0a690')), F, 0, y + hh / 2 - ww / 2, (y > h ? (w - 0.6) / 2 : w / 2) + 0.05, { line: false });
    }
  }
  // the belfry stage and its cornice
  bev(w - 0.6, 3.2, w - 0.6, st, 0, h + 1.6, 0, G, 0.15);
  bev(w + 0.2, 0.35, w + 0.2, '#b0a690', 0, h + 3.3, 0, G, 0.1);
  // the spire: four steep copper faces with courses, lucarnes, a vane
  { const S = w * 0.62, top = V(0, h + 3.5 + 5, 0), ey = h + 3.5, c = [V(-S, ey, S), V(S, ey, S), V(S, ey, -S), V(-S, ey, -S)];
    BK().roofFaces(G, [0, 1, 2, 3].map((i) => ({ a0: c[i], a1: c[(i + 1) % 4], b1: top.clone(), b0: top.clone() })), { cover: 'slate', col: '#5aa08a', th: 0.12, trim: '#4a8a76' });
    for (let i = 0; i < 4; i++) BK().ridgeCap(G, c[i].clone().add(V(0, 0.1, 0)), top.clone(), '#4a8a76', 0.08, 'slate');
    cyl(0.04, 0.04, 1.2, '#2a2a2a', 0, top.y + 0.5, 0, G, 5); box(0.6, 0.25, 0.02, '#2a2a2a', 0.2, top.y + 0.9, 0, G, { line: false }); ball(0.12, '#c9a24a', 0, top.y + 0.1, 0, G); }
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ivy(G, w * 0.6, h * 0.55, Math.sin(a) * (w / 2 + 0.04), 0, Math.cos(a) * (w / 2 + 0.04), a, 120 + i, 6); }
  return G;
}
// Viridian's gate: two stone piers with lamps and tiled caps, an arch with
// a green-tiled roof and the city's name, iron gates shut, ivy and vines.
// Front toward +z (Route 1, the south); W the opening.
export function viridianGate({ W = 6.2, name = 'VIRIDIAN CITY' } = {}) {
  const G = new THREE.Group(), st = texm(stonesTex('#c4bca6'));
  const PH = 4.6;
  for (const sx of [-1, 1]) {
    box(1.4, PH, 1.4, st, sx * (W / 2 + 0.7), PH / 2, 0, G);
    box(1.7, 0.3, 1.7, '#b0a690', sx * (W / 2 + 0.7), PH + 0.15, 0, G);
    const L = streetLamp({ h: 0.6 }); L.position.set(sx * (W / 2 + 0.7), PH + 0.3, 0); L.scale.setScalar(0.9); G.add(L);
    ivy(G, 1.3, PH * 0.85, sx * (W / 2 + 0.7), 0, 0.72, 0, 130 + sx, 13);
    ivy(G, 1.3, PH * 0.6, sx * (W / 2 + 0.7) + sx * 0.72, 0, 0, sx * Math.PI / 2, 132 + sx, 11);
    mossTop(G, 1.4, 1.4, sx * (W / 2 + 0.7), PH + 0.3, 0, 0, 134 + sx);
  }
  // the arch beam with the name and a green tiled roof over it
  const AY = PH + 0.9;
  box(W + 3.2, 0.9, 0.9, st, 0, AY, 0, G);
  const plate = words('o_gate' + name, 512, 96, (x, w, h) => {
    x.fillStyle = '#2f5a4a'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#d8c27a'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16);
    x.fillStyle = '#f6ecd0'; fitFont(x, name, 60, w * 0.84, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, w / 2, h / 2 + 2);
  });
  for (const sz of [-1, 1]) put(new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.66), texm(plate)), G, 0, AY, sz * 0.46, { ry: sz > 0 ? 0 : Math.PI, line: false });
  const rm = texm(kawara('#3f7a5a'));
  BK().roof(G, W + 3.2, 0.9, AY + 0.45, { type: 'gable', cover: 'kawara', col: '#3f7a5a', rise: 0.6, over: 0.45, gableOver: 0.5, gutters: false, th: 0.1, trim: '#2f5a4a', wall: st }); void rm;
  box(W + 4.4, 0.2, 0.25, '#2f5a4a', 0, AY + 1.18, 0, G);
  mossTop(G, W + 2, 0.8, 0, AY + 1.0, 0.3, 0, 137);
  vines(G, V(-W / 2 - 1.6, AY - 0.45, 0.5), V(W / 2 + 1.6, AY - 0.45, 0.5), 16, 1.6, 138);
  // the iron gates, shut
  for (const sx of [-1, 1]) {
    const L = new THREE.Group(); L.position.set(sx * W / 2, 0, 0); G.add(L);
    for (let k = 0; k < 8; k++) { const x = -sx * (0.2 + k * 0.38); cyl(0.025, 0.025, 3.2, '#2a3a34', x, 1.65, 0, L, 5); cone(0.06, 0.16, '#c9a24a', x, 3.32, 0, L, 5); }
    for (const y of [0.4, 1.6, 2.9]) box(W / 2, 0.06, 0.05, '#2a3a34', -sx * W / 4, y, 0, L);
    put(new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 5, 18), flat('#c9a24a')), L, -sx * W / 4, 2.2, 0.02);
    vines(L, V(-sx * W / 2, 3.0, 0.05), V(-sx * 0.3, 3.0, 0.05), 6, 2.4, 140 + sx);
  }
  G.userData.foot = { hw: W / 2 + 1.4, hd: 0.8 };
  return G;
}
// a fallen tree: a long trunk lying half sunk in the ground (bark, moss on
// its upper side, bracket fungi and ferns growing on it, snapped branch
// stubs, a splintered break at the top end), and at its foot the upturned
// root plate: thick roots twisting out of the trunk's base, tapering and
// splitting, earth clods and stones caught in them, strands dangling, and
// the torn hollow it left beside it. hollow = a short hollow log instead.
export function fallenLog({ L = 7, r = 0.45, seed = 1, hollow = false } = {}) {
  const G = new THREE.Group(), bark = barkMaterial('#6a4a34', 'ridged', 0);
  const R = rng(seed), cy = r * 0.62;   // sunk: the ground cuts the trunk's lower third
  const T = put(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r, L, 14, 6, hollow), bark), G, 0, cy, 0, { rz: Math.PI / 2 });
  { const p = T.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + Math.sin(p.getY(i) * 1.7 + Math.atan2(p.getZ(i), p.getX(i)) * 2) * 0.04; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } T.geometry.computeVertexNormals(); }
  if (hollow) {
    cyl(r * 0.62, r * 0.8, L * 0.98, '#3a2a1c', 0, cy, 0, G, 12, { open: true }).rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) put(new THREE.Mesh(new THREE.RingGeometry(r * 0.62 * (sx > 0 ? 1 : 1.25), r * (sx > 0 ? 0.78 : 1), 14), flat('#b08a5a', THREE.DoubleSide)), G, sx * L / 2, cy, 0, { ry: Math.PI / 2, line: false });
  } else {
    // the broken top end: a ring of splinters round a torn face
    const tx = L / 2;
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * 6.28, l = 0.2 + R() * 0.45, w = 0.09 + R() * 0.06;
      const sp = new THREE.ConeGeometry(w, l, 4); sp.rotateZ(-Math.PI / 2).translate(l / 2, 0, 0);
      put(new THREE.Mesh(sp, flat(R() < 0.5 ? '#c8a272' : '#a8865a')), G, tx - 0.02, cy + Math.sin(a) * r * 0.62, Math.cos(a) * r * 0.62, { ry: (R() - 0.5) * 0.4, rz: (R() - 0.5) * 0.4 });
    }
    put(new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 12), flat('#c8a272')), G, tx - 0.03, cy, 0, { ry: Math.PI / 2, line: false });
  }
  // snapped branches: stubs and one bigger limb still attached
  for (let k = 0; k < 4; k++) {
    const x = (R() - 0.35) * L * 0.7, a = (k % 2 ? 1 : -1) * (0.7 + R() * 0.7), len = k === 0 ? 1.3 : 0.35 + R() * 0.3;
    const b = V(x, cy + Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85), e = b.clone().add(V((R() - 0.5) * 0.4, Math.cos(a) * len, Math.sin(a) * len));
    const g = new THREE.CylinderGeometry(0.05 + (k ? 0 : 0.03), 0.09 + (k ? 0 : 0.05), len, 7);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), e.clone().sub(b).normalize()));
    put(new THREE.Mesh(g, bark), G, (b.x + e.x) / 2, (b.y + e.y) / 2, (b.z + e.z) / 2);
    put(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 5), flat('#c8a272')), G, e.x, e.y, e.z, { line: false });
  }
  // moss over the upper side, bracket fungi, a few ferns
  mossTop(G, L * 0.85, r * 1.2, 0, cy + r * 0.86, 0, 0, seed + 20);
  for (let k = 0; k < 7; k++) {
    const x = (R() - 0.5) * L * 0.8, side = R() < 0.5 ? 1 : -1, s = 0.7 + R() * 0.6;
    const m = put(new THREE.Mesh(new THREE.CylinderGeometry(0.13 * s, 0.16 * s, 0.04, 10, 1, false, 0, Math.PI), flat(R() < 0.5 ? '#e8c48a' : '#d8a86a')), G, x, cy + (R() - 0.2) * r * 0.5, side * r * 0.92, { ry: side > 0 ? 0 : Math.PI });
    m.scale.z = 1.2; m.rotation.x = 0.15 * side;
  }
  { const out = cards(); for (let k = 0; k < 6; k++) { const x = (R() - 0.5) * L * 0.75, p = V(x, cy + r * 0.9, (R() - 0.5) * r); pushCard(out, p, V((R() - 0.5) * 0.6, 1, (R() - 0.5) * 0.6).normalize(), 0.5 + R() * 0.3, TILE.fern, R() * 6, p.clone().add(V(0, -0.2, 0)), 0.3); }
    put(new THREE.Mesh(toGeometry(out), leafMaterial('#ffffff', 0.04)), G, 0, 0, 0, { line: false, shadow: false }); }
  if (!hollow) rootPlate(G, -L / 2, cy, r, seed);
  return G;
}
// the upturned root plate at the trunk's foot (x = x0), facing -x
function rootPlate(G, x0, cy, r, seed) {
  const R = rng(seed * 13 + 5), geos = [];
  const C = (h) => new THREE.Color(h);
  const tubeG = (pts, r0, r1, c0, c1) => {
    const curve = new THREE.CatmullRomCurve3(pts), n = pts.length * 2, seg = 5, fr = curve.computeFrenetFrames(n, false);
    const pos = [], col = [], idx = [], ca = C(c0), cb = C(c1);
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = curve.getPointAt(t), rr = r0 + (r1 - r0) * Math.pow(t, 0.8), c = ca.clone().lerp(cb, t);
      for (let j = 0; j <= seg; j++) { const a = j / seg * 6.28; const N = fr.normals[i], B = fr.binormals[i]; pos.push(p.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * rr, p.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * rr, p.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * rr); col.push(c.r, c.g, c.b); }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    geos.push(g.toNonIndexed());
  };
  // main roots: out of the trunk's base in a ragged fan across the plate,
  // twisting, then splitting into smaller roots, tips thin and pale
  const base = V(x0 + 0.1, cy, 0);
  const grow = (p, dir, len, rad, depth) => {
    const pts = [p.clone()]; let q = p.clone(), d = dir.clone();
    for (let k = 0; k < 4; k++) { d.add(V(-0.06 - R() * 0.1, (R() - 0.5) * 0.4, (R() - 0.5) * 0.4)).normalize(); q = q.clone().addScaledVector(d, len / 4); pts.push(q); }
    tubeG(pts, rad, rad * 0.25, '#5a4030', depth ? '#8a7058' : '#6a5038');
    if (depth < 2) for (let b = 0; b < 2 + (depth ? 0 : 1); b++) {
      const at = pts[1 + Math.floor(R() * 3)], nd = d.clone().add(V((R() - 0.5) * 0.8, (R() - 0.5) * 0.9, (R() - 0.5) * 0.9)).normalize();
      grow(at, nd, len * (0.45 + R() * 0.2), rad * 0.45, depth + 1);
    }
  };
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * 6.28 + R() * 0.4, out = V(-0.18, Math.sin(a) * 0.8 - 0.15, Math.cos(a)).normalize();
    grow(base.clone().add(V(-0.45, Math.sin(a) * r * 0.9, Math.cos(a) * r * 0.9)), out, 1.1 + R() * 0.7, 0.14 + R() * 0.05, 0);
  }
  // dangling strands from the plate's lower edge
  for (let k = 0; k < 5; k++) { const z = (R() - 0.5) * 2.2, y = cy - 0.2 + R() * 0.6, p = V(x0 - 0.3 - R() * 0.4, y, z); tubeG([p, p.clone().add(V(-0.05, -0.3, 0.05)), p.clone().add(V(-0.02, -0.55 - R() * 0.3, 0.1))], 0.025, 0.006, '#6a5038', '#9a8068'); }
  put(new THREE.Mesh(mergeNI(geos), vcFlat()), G, 0, 0, 0);
  // earth clods and stones caught among the roots, a mound of torn soil
  const lump = (s, sx = 1, sy = 0.8, sz = 1) => {
    let g = new THREE.IcosahedronGeometry(s, 1); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
    const p = g.attributes.position, ph = R() * 10;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) / s, y = p.getY(i) / s, z = p.getZ(i) / s, k = 0.82 + 0.22 * Math.sin(x * 4.1 + ph) * Math.cos(z * 3.7 + y * 2.3 + ph) + 0.08 * Math.sin(y * 9 + x * 7); p.setXYZ(i, p.getX(i) * k * sx, p.getY(i) * k * sy, p.getZ(i) * k * sz); }
    g.computeVertexNormals(); return g;
  };
  const soil = (s, col) => [lump(s), col];
  // the plate itself: a ragged slab of root-bound earth standing on edge
  put(new THREE.Mesh(lump(1.25, 0.32, 1.0, 1.15), flat('#5e4430')), G, x0 - 0.12, cy + 0.15, 0);
  put(new THREE.Mesh(lump(0.9, 0.22, 0.8, 0.95), flat('#6e5038')), G, x0 - 0.42, cy + 0.2, 0.1);
  for (let k = 0; k < 9; k++) { const [g, c] = soil(0.18 + R() * 0.2, R() < 0.7 ? '#6a4a30' : '#7a5a3a'); put(new THREE.Mesh(g, flat(c)), G, x0 - 0.15 - R() * 0.5, cy + (R() - 0.3) * 1.0, (R() - 0.5) * 1.6); }
  for (let k = 0; k < 5; k++) { const [g] = soil(0.1 + R() * 0.12); put(new THREE.Mesh(g, flat(R() < 0.5 ? '#9a968a' : '#b0aa9a')), G, x0 - 0.3 - R() * 0.5, cy + (R() - 0.4) * 0.9, (R() - 0.5) * 1.8); }
  // the torn hollow: a crescent of heaped soil round a dark scoop, irregular
  {
    const pts = []; for (let k = 0; k <= 16; k++) { const a = -Math.PI * 0.85 + k / 16 * Math.PI * 1.7; pts.push(V(x0 - 1.1 + Math.cos(a) * 1.0 * (0.85 + R() * 0.3), 0, Math.sin(a) * 1.3 * (0.85 + R() * 0.3))); }
    const rim = new THREE.CatmullRomCurve3(pts);
    const tg = new THREE.TubeGeometry(rim, 32, 0.16, 6, false); const p = tg.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, Math.max(-0.05, p.getY(i)) * 0.8);
    tg.computeVertexNormals();
    put(new THREE.Mesh(tg, flat('#6e4e34')), G, 0, 0.0, 0, { shadow: false });
    const sh = new THREE.Shape(); pts.forEach((q, i) => (i ? sh.lineTo(q.x, -q.z) : sh.moveTo(q.x, -q.z))); sh.closePath();
    const sg = new THREE.ShapeGeometry(sh, 2).rotateX(-Math.PI / 2);
    put(new THREE.Mesh(sg, flat('#4a3424')), G, 0, 0.03, 0, { line: false, shadow: false });
  }
}
// a fairy ring of red-capped mushrooms (one mesh)
// ground(x, z): the ground's height at a local point relative to the origin
// (each mushroom stands on it, so a ring on a slope does not float)
export function mushroomRing({ r = 1.4, n = 14, seed = 1, ground = () => 0 } = {}) {
  const G = new THREE.Group(), R = rng(seed);
  const stems = [], caps = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * 6.28 + R() * 0.3, d = r + (R() - 0.5) * 0.3, s = 0.6 + R() * 0.7;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, gy = ground(x, z) - 0.02;
    stems.push(new THREE.CylinderGeometry(0.04 * s, 0.05 * s, 0.18 * s, 6).translate(x, gy + 0.09 * s, z));
    const c = new THREE.SphereGeometry(0.12 * s, 8, 5, 0, 6.28, 0, Math.PI / 2).translate(x, gy + 0.17 * s, z);
    caps.push(c);
  }
  const merge = (l) => { const g = new THREE.BufferGeometry(); const P = [], N = []; for (const gg of l) { const h = gg.toNonIndexed(); P.push(...h.attributes.position.array); N.push(...h.attributes.normal.array); } g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return wuv(g); };
  put(new THREE.Mesh(merge(stems), flat('#f2ead6')), G, 0, 0, 0, { shadow: false });
  put(new THREE.Mesh(merge(caps), flat('#d8402e')), G, 0, 0, 0, { shadow: false });
  return G;
}
// a rope swing hanging from a branch at height h (mesh 'r1_swing' sways in
// the native game)
export function swing({ h = 4.2 } = {}) {
  const G = new THREE.Group(); G.name = 'r1_swing'; G.position.y = h; G.userData.keep = true;
  for (const sx of [-0.3, 0.3]) cyl(0.015, 0.015, h - 0.55, '#d8c49a', sx, -(h - 0.55) / 2, 0, G, 4, { shadow: false });
  box(0.75, 0.06, 0.28, '#9a6a42', 0, -h + 0.52, 0, G);
  return G;
}

// ---------- preview scenes (kit.html) ----------
export const PREVIEW = {
  tea: (G, put) => { put(teaHouse(), 0, 0); return '3,3.2,11,0,1.8,0'; },
  tea_close: (G, put) => { put(teaHouse(), 0, 0); return '2.5,1.9,5.2,1.6,1.3,0'; },
  cottage: (G, put) => { put(cottage({ seed: 401 }), 0, 0); return '4,3.5,12,0,2,0'; },
  city: (G, put) => { for (let i = 0; i < 6; i++) put(cityBlock({ seed: 600 + i, floors: 1 + (i % 3), W: 5 + (i % 3), D: 5.5 }), -13 + i * 6.5, 0); return '0,8,26,0,3,0'; },
  log: (G, put) => { put(fallenLog({ seed: 3 }), 0, 0, 0.3); return '-6,2.6,4.5,-2,0.6,0'; },
  terrace: (G, put) => { put(bistroSet(), 0, 0); put(marketParasol(), 0, 0); put(bistroSet({ chairs: 2 }), 2.6, 0.6); put(marketParasol({ col: '#3d8fb0' }), 2.6, 0.6); return '1.3,2.2,5.4,1.3,1.1,0'; },
  shrine: (G, put) => { put(shrine(), 0, 0); put(stoneLantern({ s: 0.8 }), -1.4, 1.0); put(stoneLantern({ s: 0.8 }), 1.4, 1.0); return '1.5,1.6,4.2,0,0.9,0'; },
  gate: (G, put) => { put(viridianGate(), 0, 0); return '3,4,13,0,3,0'; },
  bridges: (G, put) => { put(footbridge({ L: 7, w: 3, rise: 0.25 }), -3, 0, 0, 1.2); put(stoneBridge({ L: 8, w: 4, rise: 0.3 }), 4, 0, 0, 1.2); return '0,4,11,0,0.8,0'; },
  stage2: (G, put) => { put(windmill(), -9, 0, 0.3); put(waterTower(), 0, 0, -0.4); put(busShelter(), 7, 3); put(streetLamp(), 9.5, 3); put(martCart(), 6, 6.5); put(birdhouse(), 9.5, 6); return '1,9,26,1,5,0'; },
  stage2b: (G, put) => { put(clockTower(), 0, 0); return '6,14,30,0,13,0'; },
  stage2c: (G, put) => { put(busShelter(), 0, 0); put(streetLamp(), 2.2, 0.8); put(martCart(), -2.6, 1.5, 0.4); put(birdhouse(), 3.4, 1.2); return '0.5,2.4,6.5,0.4,1.3,0'; },
  scope: (G, put) => { put(coinTelescope(), 0, 0, 2.6); return '0.9,1.6,1.4,0,1.2,0'; },
  roadside: (G, put) => { put(vendingMachine(), -1.2, 0); put(picnicTable(), 1.4, 0.3, 0.3); return '0.2,1.7,4.4,0.2,0.8,0'; },
};
