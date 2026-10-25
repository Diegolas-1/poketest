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
import { rng } from '../terrain.js';
import { HEAD, BODY } from './kit.js';
import { leafMaterial, ivyGeometry, vineGeometry, greenRoofGeometry, barkMaterial } from '../foliage.js';

const BUILD = { deep: [0.56, 0.62, 0.82], shade: [0.74, 0.79, 0.94], lit: [1.06, 1.04, 0.98], bands: [0.1, 0.3, 0.58] };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const memo = new Map();
const M = (k, f) => { if (!memo.has(k)) memo.set(k, f()); return memo.get(k); };
export const flat = (col, side) => M('c' + col + (side || ''), () => toon(col, { cel: BUILD, side }));
export function texm(t, col = '#ffffff', side) {
  if (t.tint) {
    // the tint that turns the neutral picture into the wanted colour
    const n = new THREE.Color(NEUTRAL), c = new THREE.Color(t.col).multiply(new THREE.Color(col));
    col = '#' + new THREE.Color(Math.min(1, c.r / n.r), Math.min(1, c.g / n.g), Math.min(1, c.b / n.b)).getHexString();
    t = t.t;
  }
  return M('t' + t.uuid + col + (side || ''), () => toon(col, { map: t, cel: BUILD, side }));
}
const asM = (m) => (typeof m === 'string' ? flat(m) : m);
// Painted surfaces (wood, tiles, thatch, plaster, stone) are painted once in a
// neutral colour and tinted by the material: one picture per kind, however
// many colours use it (fewer textures to load on the phone).
const NEUTRAL = '#e8e4dc';
const tinted = (col, t) => ({ tint: true, t, col });
export const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

// ---------- painted textures ----------
const texCache = new Map();
function paint(key, w, h, draw, repeat = true) {
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
// shoji: white paper in a wooden lattice (1 x 1 m)
const shoji = () => paint('o_shoji', 128, 128, (x, w, h) => {
  x.fillStyle = '#f6f0de'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#9a7048';
  for (let k = 0; k <= 4; k++) x.fillRect(k * w / 4 - 2, 0, 4, h);
  for (let k = 0; k <= 4; k++) x.fillRect(0, k * h / 4 - 2, w, 4);
}, true);
// a painted panel with words (clamped, one picture)
function words(key, W, H, draw) { return paint(key, W, H, draw, false); }
const fitFont = (x, text, size, maxW, font, weight = 400) => {
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
  mesh.lookAt(mesh.position.clone().add(d));
  if (P.matrixWorld && P.parent) mesh.quaternion.premultiply(new THREE.Quaternion());   // local lookAt (P unrotated while building)
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
// A timber rest house with a deep hipped roof of dark tiles, open across its
// front: a raised plank floor (engawa) to sit on, tatami inside, a counter
// with the kettle, shoji at the back, an indigo noren over the way in and the
// TEA HOUSE board under the eaves; red paper lanterns hang along the eave.
// Front toward +z. W x D the floor.
export function teaHouse({ W = 8.4, D = 5.6, wood = '#8a5b38', roof = '#46566a', name = 'TEA HOUSE', sub = 'ROUTE 1 · REST & TEA' } = {}) {
  const G = new THREE.Group(); G.name = 'teahouse';
  const pw = texm(planks(wood)), pale = texm(planks('#c8a272')), FH = 0.48, WH = 2.5;
  // the stone footing and the raised floor
  box(W + 0.5, 0.3, D + 0.5, texm(stonesTex('#b4ad98')), 0, 0.15, 0, G);
  box(W, 0.18, D, pale, 0, FH - 0.09, 0, G, { uvs: 0.5 });
  // tatami inside (pale green mats with dark borders)
  const tat = words('o_tatami', 256, 128, (x, w, h) => {
    x.fillStyle = '#c9cf8a'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(110,120,60,.35)'; for (let k = 0; k < w; k += 4) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, h); x.stroke(); }
    x.fillStyle = '#2f3d2a'; x.fillRect(0, 0, w, 10); x.fillRect(0, h - 10, w, 10);
  });
  for (let i = 0; i < 3; i++) put(new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9).rotateX(-Math.PI / 2), texm(tat)), G, -2.2 + i * 1.95, FH + 0.005, -1.1, { line: false });
  // posts: corners and the front
  const posts = [];
  for (const px of [-W / 2 + 0.15, -W / 6, W / 6, W / 2 - 0.15]) posts.push([px, D / 2 - 0.15]);
  for (const px of [-W / 2 + 0.15, W / 2 - 0.15]) posts.push([px, -D / 2 + 0.15], [px, 0]);
  posts.push([0, -D / 2 + 0.15]);
  for (const [px, pz] of posts) box(0.2, WH, 0.2, pw, px, FH + WH / 2, pz, G);
  // the back wall: shoji panels between the posts, plaster below
  for (let i = 0; i < 4; i++) {
    const x0 = -W / 2 + 0.25 + i * (W - 0.5) / 4;
    put(new THREE.Mesh(new THREE.PlaneGeometry((W - 0.5) / 4 - 0.06, 1.7), texm(shoji())), G, x0 + (W - 0.5) / 8, FH + 1.35, -D / 2 + 0.16, { line: false });
  }
  box(W - 0.3, 0.5, 0.08, texm(plaster('#efe6d2')), 0, FH + 0.25, -D / 2 + 0.14, G);
  // side walls: plaster with a timber frame, a round window on the west
  for (const sx of [-1, 1]) {
    box(0.1, WH, D - 0.3, texm(plaster('#efe6d2')), sx * (W / 2 - 0.12), FH + WH / 2, 0, G);
    box(0.12, 0.12, D - 0.2, pw, sx * (W / 2 - 0.08), FH + 1.0, 0, G);
  }
  put(new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 20), flat('#5a3a22', THREE.DoubleSide)), G, -W / 2 + 0.06, FH + 1.5, 0.3, { ry: Math.PI / 2 });
  put(new THREE.Mesh(new THREE.CircleGeometry(0.43, 20), texm(shoji(), '#ffffff', THREE.DoubleSide)), G, -W / 2 + 0.07, FH + 1.5, 0.3, { ry: Math.PI / 2, line: false });
  // the head beam and the lintels
  box(W + 0.2, 0.26, 0.22, pw, 0, FH + WH + 0.05, D / 2 - 0.15, G);
  box(W + 0.2, 0.22, 0.22, pw, 0, FH + WH + 0.05, -D / 2 + 0.15, G);
  for (const sx of [-1, 1]) box(0.22, 0.22, D, pw, sx * (W / 2 - 0.15), FH + WH + 0.05, 0, G);
  // the counter inside, with the tea things
  box(2.6, 0.9, 0.6, pw, 1.6, FH + 0.45, -1.6, G);
  box(2.7, 0.06, 0.7, pale, 1.6, FH + 0.93, -1.6, G);
  for (let i = 0; i < 5; i++) cyl(0.07, 0.06, 0.09, i % 2 ? '#e8e2d2' : '#7a9a6a', 0.7 + i * 0.4, FH + 1.0, -1.55, G, 8);
  box(1.6, 0.05, 0.35, pw, 1.6, FH + 1.9, -D / 2 + 0.36, G);   // a shelf of jars
  for (let i = 0; i < 4; i++) cyl(0.12, 0.13, 0.3, ['#b05a3a', '#e6d7b0', '#55707a', '#b05a3a'][i], 1.0 + i * 0.4, FH + 2.08, -D / 2 + 0.36, G, 10);
  // the roof: a deep hip of dark tiles, wide eaves on all sides, a ridge
  const OV = 1.25, RW = W + OV * 2, RD = D + OV * 2, RT = FH + WH + 0.18, rise = 1.9;
  const tm = texm(kawara(roof));
  const RG = new THREE.Group(); RG.position.y = RT; G.add(RG);
  {
    // a hip roof as one geometry: an eave rectangle up to a ridge line
    const rx = RW / 2, rz = RD / 2, ridge = Math.max(0.2, (RW - RD) / 2);
    const P = [[-rx, 0, rz], [rx, 0, rz], [rx, 0, -rz], [-rx, 0, -rz], [-ridge, rise, 0], [ridge, rise, 0]];
    const tris = [[0, 1, 5], [0, 5, 4], [2, 3, 4], [2, 4, 5], [1, 2, 5], [3, 0, 4]];
    const pos = [], uv = [];
    for (const t of tris) for (const k of t) { pos.push(...P[k]); uv.push(P[k][0] * 0.66, (P[k][2] + P[k][1]) * 0.66); }
    let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    // the roof's thickness: a copy just under, facing down
    put(new THREE.Mesh(g, tm), RG, 0, 0, 0);
    const under = g.clone(); under.translate(0, -0.14, 0); const ip = under.index; void ip;
    const ps = under.attributes.position; for (let i = 0; i < ps.count; i += 3) { const ax = ps.getX(i), ay = ps.getY(i), az = ps.getZ(i); ps.setXYZ(i, ps.getX(i + 1), ps.getY(i + 1), ps.getZ(i + 1)); ps.setXYZ(i + 1, ax, ay, az); }
    under.computeVertexNormals();
    put(new THREE.Mesh(under, flat(shade(wood, 0.8))), RG, 0, 0, 0, { line: false });
    // eave fascia and the ridge with its end tiles
    box(RW + 0.1, 0.16, 0.14, shade(roof, 0.75), 0, -0.07, rz, RG); box(RW + 0.1, 0.16, 0.14, shade(roof, 0.75), 0, -0.07, -rz, RG);
    box(0.14, 0.16, RD + 0.1, shade(roof, 0.75), rx, -0.07, 0, RG); box(0.14, 0.16, RD + 0.1, shade(roof, 0.75), -rx, -0.07, 0, RG);
    box(ridge * 2 + 0.5, 0.24, 0.3, shade(roof, 0.8), 0, rise + 0.08, 0, RG);
    for (const sx of [-1, 1]) { const o = box(0.3, 0.42, 0.34, shade(roof, 0.7), sx * (ridge + 0.25), rise + 0.2, 0, RG); o.rotation.z = sx * 0.2; }
    // moss creeping over the low corners
    mossTop(RG, 1.6, 0.8, -rx + 1.0, 0.18, rz - 0.5, 0.0, 11);
    mossTop(RG, 1.2, 0.7, rx - 0.9, 0.15, -rz + 0.5, 0.2, 12);
  }
  // the name board under the eave
  const board = words('o_teaboard' + name, 512, 128, (x, w, h) => {
    x.fillStyle = '#3a2a1c'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f2e3c0'; x.fillRect(8, 8, w - 16, h - 16);
    x.fillStyle = '#6a2a20'; fitFont(x, name, 64, w * 0.86, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, w / 2, h * 0.44);
    x.fillStyle = '#5a4a3a'; fitFont(x, sub, 22, w * 0.8, BODY, 600); x.fillText(sub, w / 2, h * 0.82);
  });
  put(new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), texm(board)), G, 0, FH + WH + 0.55, D / 2 - 0.02, { line: false });
  box(3.0, 0.82, 0.08, '#3a2a1c', 0, FH + WH + 0.55, D / 2 - 0.08, G);
  // the noren: indigo cloth strips with a white tea cup, over the middle bay
  const noren = words('o_noren', 256, 192, (x, w, h) => {
    x.fillStyle = '#2b3f6e'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f2ead6';
    x.beginPath(); x.ellipse(w / 2, h * 0.5, 34, 26, 0, 0, Math.PI); x.lineTo(w / 2 - 34, h * 0.5); x.fill();
    x.fillRect(w / 2 - 40, h * 0.47, 80, 8);
    x.strokeStyle = '#f2ead6'; x.lineWidth = 5; x.beginPath(); x.arc(w / 2 + 40, h * 0.58, 12, -1.4, 1.4); x.stroke();
    for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(w / 2 - 14 + k * 14, h * 0.4); x.bezierCurveTo(w / 2 - 22 + k * 14, h * 0.3, w / 2 - 6 + k * 14, h * 0.25, w / 2 - 14 + k * 14, h * 0.14); x.stroke(); }
  });
  for (let i = 0; i < 3; i++) {
    const strip = new THREE.PlaneGeometry(0.62, 1.05);
    const uv = strip.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + i) / 3);
    put(new THREE.Mesh(strip, texm(noren, '#ffffff', THREE.DoubleSide)), G, -0.66 + i * 0.66, FH + WH - 0.55, D / 2 - 0.05, { line: false, rx: 0.05 });
  }
  box(2.1, 0.05, 0.05, '#5a3a22', 0, FH + WH - 0.02, D / 2 - 0.05, G);
  // a step up in front
  box(2.2, 0.22, 0.6, texm(stonesTex('#c4bca8')), 0, 0.11, D / 2 + 0.55, G);
  // ivy up the west wall, vines off the eave's corner
  ivy(G, 1.8, 2.4, -W / 2 - 0.09, FH, -1.0, -Math.PI / 2, 41, 10);
  vines(G, V(-RW / 2, RT - 0.1, RD / 2 - 0.4), V(-RW / 2 + 1.6, RT - 0.1, RD / 2), 6, 1.1, 43);
  G.userData.foot = { hw: W / 2 + 0.3, hd: D / 2 + 0.3 };
  G.userData.lantern = [[-RW / 2 + 0.6, RT - 0.1, RD / 2 - 0.15], [RW / 2 - 0.6, RT - 0.1, RD / 2 - 0.15], [-RW / 2 + 0.6, RT - 0.1, -0.5]];
  return G;
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
  const can = new THREE.ConeGeometry(r, 0.55, 16, 1, true);
  put(new THREE.Mesh(can, flat(col, THREE.DoubleSide)), G, 0, h + 0.05, 0);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; beam(V(0, h - 0.5, 0), V(Math.cos(a) * r * 0.62, h - 0.12, Math.sin(a) * r * 0.62), 0.018, '#e8d4a8', G, { line: false }); }
  cone(0.08, 0.16, '#3a2a1c', 0, h + 0.38, 0, G, 6);
  // the stand: a stone weight
  cyl(0.22, 0.26, 0.24, '#8f8a7c', 0, 0.12, 0, G, 10);
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
  const R = roofSlab(G, 1.4, 0.75, 0.4, 0.07, texm(kawara(roof)), 0, 1.25, 0.32, 0);
  void R; roofSlab(G, 1.4, 0.75, 0.4, 0.07, texm(kawara(roof)), 0, 1.25, -0.42, Math.PI);
  box(1.5, 0.1, 0.12, shade(roof, 0.8), 0, 1.68, -0.05, G);
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
// a drinks vending machine: lit window of cans, two rows of buttons
export function vendingMachine({ col = '#d23a34', brand = 'POKé COLA' } = {}) {
  const G = new THREE.Group();
  box(1.0, 1.85, 0.75, col, 0, 0.925, 0, G);
  box(1.04, 0.08, 0.79, shade(col, 0.7), 0, 1.86, 0, G);
  const t = words('o_vend' + brand, 256, 400, (x, w, h, R) => {
    x.fillStyle = '#f6f6f0'; x.fillRect(0, 0, w, h);
    const cans = ['#e84a3a', '#3a8ae8', '#f2c94a', '#5ac46a', '#f28a3a', '#b05ad8'];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      const cx = 22 + c * 37, cy = 40 + r * 112;
      x.fillStyle = cans[(r * 2 + c) % cans.length]; x.fillRect(cx - 11, cy - 30, 22, 60);
      x.fillStyle = 'rgba(255,255,255,.6)'; x.fillRect(cx - 7, cy - 26, 4, 50);
      x.fillStyle = '#3a3a3a'; x.fillRect(cx - 8, cy + 40, 16, 8);
    }
    x.fillStyle = col; x.fillRect(0, h - 40, w, 40);
    x.fillStyle = '#ffffff'; fitFont(x, brand, 30, w * 0.9, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(brand, w / 2, h - 20);
  });
  put(new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.12), texm(t)), G, -0.08, 1.2, 0.381, { line: false });
  box(0.16, 0.4, 0.04, '#3a3a3a', 0.38, 1.2, 0.38, G);   // the coin slot panel
  box(0.6, 0.2, 0.08, '#2a2a2a', -0.08, 0.32, 0.36, G);   // the drop
  ivy(G, 0.9, 1.0, 0, 0.0, -0.39, Math.PI, 91, 8);
  return G;
}
// a picnic table with its two benches
export function picnicTable({ wood = '#a87a4c' } = {}) {
  const G = new THREE.Group(), pw = texm(planks(wood));
  box(1.9, 0.07, 0.85, pw, 0, 0.76, 0, G);
  for (const sz of [-1, 1]) box(1.9, 0.06, 0.3, pw, 0, 0.45, sz * 0.72, G);
  for (const sx of [-0.7, 0.7]) for (const sz of [-1, 1]) {
    const leg = box(0.08, 1.0, 0.08, pw, sx, 0.4, sz * 0.38, G); leg.rotation.x = sz * 0.5;
  }
  for (const sx of [-0.7, 0.7]) box(0.08, 0.06, 1.7, pw, sx, 0.4, 0, G);
  // a thermos and a bento left on it
  cyl(0.06, 0.06, 0.26, '#3a8a7a', 0.4, 0.92, 0.1, G, 8); box(0.3, 0.09, 0.22, '#c8312e', -0.3, 0.84, -0.1, G);
  return G;
}
// a coin-operated telescope on a post (it turns to look south)
export function coinTelescope({ col = '#3f7a74' } = {}) {
  const G = new THREE.Group();
  cyl(0.3, 0.35, 0.12, '#8f8a7c', 0, 0.06, 0, G, 10);
  cyl(0.07, 0.09, 1.05, col, 0, 0.62, 0, G, 8);
  const H = new THREE.Group(); H.position.y = 1.25; H.rotation.x = 0.12; G.add(H);
  box(0.36, 0.28, 0.42, col, 0, 0, 0, H);
  for (const sx of [-0.09, 0.09]) cyl(0.07, 0.09, 0.42, shade(col, 0.8), sx, 0.02, 0.3, H, 10).rotation.x = Math.PI / 2;
  for (const sx of [-0.09, 0.09]) cyl(0.05, 0.05, 0.08, '#202020', sx, 0.02, -0.24, H, 8).rotation.x = Math.PI / 2;
  box(0.06, 0.1, 0.02, '#e2c25a', 0.2, -0.04, -0.05, H);   // the coin slot
  return G;
}
// a birdhouse on a pole (a little roof, a round door, a perch)
export function birdhouse({ h = 2.4, col = '#e8d6a8', roof = '#c4553a', s = 1 } = {}) {
  const G = new THREE.Group();
  cyl(0.05, 0.06, h, '#8a6a4a', 0, h / 2, 0, G, 6);
  box(0.34 * s, 0.38 * s, 0.32 * s, col, 0, h + 0.15 * s, 0, G);
  for (const sx of [-1, 1]) { const r = box(0.26 * s, 0.03, 0.42 * s, roof, sx * 0.1 * s, h + 0.42 * s, 0, G); r.rotation.z = -sx * 0.7; }
  put(new THREE.Mesh(new THREE.CircleGeometry(0.06 * s, 10), flat('#2a1e16')), G, 0, h + 0.2 * s, 0.165 * s, { line: false });
  cyl(0.01, 0.01, 0.12, '#8a6a4a', 0, h + 0.08 * s, 0.2 * s, G, 4).rotation.x = Math.PI / 2;
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
// the POKé MART clerk's sample cart: a blue-striped awning over a little
// counter with a box of POTION samples
export function martCart({ col = '#3a74c8' } = {}) {
  const G = new THREE.Group();
  box(1.5, 0.9, 0.7, '#f4f2ea', 0, 0.55, 0, G);
  box(1.5, 0.12, 0.72, col, 0, 0.3, 0, G);
  for (const sx of [-1, 1]) { const w = put(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 14), flat('#3a3a3a')), G, sx * 0.55, 0.2, 0.37); void w; }
  for (const sx of [-1, 1]) box(0.05, 1.3, 0.05, '#c8c8c0', sx * 0.7, 1.6, -0.3, G);
  const aw = paint('o_awning' + col, 128, 64, (x, w, h) => { for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? '#ffffff' : col; x.fillRect(k * 16, 0, 16, h); } });
  const a = box(1.7, 0.04, 1.0, texm(aw), 0, 2.2, 0.05, G); a.rotation.x = 0.25;
  const label = words('o_martlabel', 256, 64, (x, w, h) => { x.fillStyle = col; x.fillRect(0, 0, w, h); x.fillStyle = '#ffffff'; fitFont(x, 'POKé MART', 40, w * 0.9, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('POKé MART', w / 2, h / 2); });
  put(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), texm(label)), G, 0, 0.62, 0.356, { line: false });
  // the sample box and a few purple POTIONs
  box(0.5, 0.2, 0.35, '#e8d6a8', -0.3, 1.1, 0, G);
  for (let i = 0; i < 4; i++) { cyl(0.05, 0.05, 0.16, '#8a5ad0', 0.15 + (i % 2) * 0.13, 1.08, -0.08 + (i >> 1) * 0.15, G, 8); cyl(0.03, 0.03, 0.04, '#f2f2f2', 0.15 + (i % 2) * 0.13, 1.18, -0.08 + (i >> 1) * 0.15, G, 6); }
  const fs = words('o_freesample', 256, 96, (x, w, h) => { x.fillStyle = '#fff6c8'; x.fillRect(0, 0, w, h); x.fillStyle = '#c8312e'; fitFont(x, 'FREE SAMPLE!', 44, w * 0.9, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('FREE SAMPLE!', w / 2, h / 2); });
  const st = put(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), texm(fs, '#ffffff', THREE.DoubleSide)), G, -0.3, 1.32, 0.15, { line: false }); st.rotation.x = -0.2;
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
// a cast-iron street lamp with a glass lantern and an ivy-wound post
export function streetLamp({ h = 3.6, col = '#2f4a40' } = {}) {
  const G = new THREE.Group();
  cyl(0.2, 0.26, 0.42, col, 0, 0.21, 0, G, 8);
  cyl(0.06, 0.09, h, col, 0, h / 2 + 0.2, 0, G, 8);
  box(0.42, 0.06, 0.42, col, 0, h + 0.25, 0, G);
  box(0.3, 0.42, 0.3, '#fff1c4', 0, h + 0.5, 0, G, { line: false });
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(0.03, 0.44, 0.03, col, sx * 0.15, h + 0.5, sz * 0.15, G);
  cone(0.32, 0.3, col, 0, h + 0.86, 0, G, 4).rotation.y = Math.PI / 4;
  ball(0.05, col, 0, h + 1.04, 0, G, { seg: 6 });
  vines(G, V(-0.1, h - 0.4, 0.1), V(0.1, h - 0.4, 0.1), 2, h - 0.6, 61);
  return G;
}
// a bus stop: a little shelter with a curved roof, a bench, the timetable
export function busShelter({ col = '#4f8a6a', roof = '#c4553a' } = {}) {
  const G = new THREE.Group(), pw = texm(planks('#a87a4c'));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.1, 2.3, 0.1, col, sx * 1.3, 1.15, sz * 0.6, G);
  box(2.7, 1.6, 0.06, pw, 0, 1.2, -0.62, G);
  for (const sx of [-1, 1]) box(0.06, 1.2, 1.2, pw, sx * 1.33, 1.0, 0, G);
  const R = new THREE.Group(); R.position.y = 2.32; G.add(R);
  const rg = new THREE.CylinderGeometry(1.0, 1.0, 3.0, 12, 1, true, -0.7, 1.4).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);   // the arc's crown up (it stood on end, a red wall at the front)
  rg.translate(0, -0.78, 0);
  put(new THREE.Mesh(rg, texm(clay(roof), '#ffffff', THREE.DoubleSide)), R, 0, 0, 0);
  box(2.4, 0.06, 0.4, pw, 0, 0.48, -0.36, G);
  for (const sx of [-1, 1]) box(0.06, 0.48, 0.3, col, sx * 1.0, 0.24, -0.36, G);
  // the sign on its own post: the route's bus to VIRIDIAN CITY
  const st = words('o_busstop', 128, 128, (x, w, h) => {
    x.fillStyle = '#f6f2e6'; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 2, 0, 6.28); x.fill();
    x.fillStyle = '#2e6ac8'; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 10, 0, 6.28); x.fill();
    x.fillStyle = '#ffffff'; fitFont(x, 'BUS', 44, w * 0.7, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('BUS', w / 2, h / 2);
  });
  cyl(0.04, 0.04, 2.4, '#c8c8c0', 1.75, 1.2, 0.4, G, 6);
  put(new THREE.Mesh(new THREE.CircleGeometry(0.3, 18), texm(st, '#ffffff', THREE.DoubleSide)), G, 1.75, 2.35, 0.43, { line: false });
  const tt = words('o_timetable', 128, 192, (x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); x.fillStyle = '#2e6ac8'; x.fillRect(0, 0, w, 28); x.fillStyle = '#ffffff'; x.font = `600 16px ${BODY}`; x.textAlign = 'center'; x.fillText('VIRIDIAN', w / 2, 20); x.fillStyle = '#333'; for (let i = 0; i < 7; i++) x.fillText(`${7 + i * 2}:15   ${7 + i * 2}:45`, w / 2, 52 + i * 20); });
  put(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.45), texm(tt)), G, -0.9, 1.5, -0.585, { line: false });
  mossTop(R, 2.2, 1.0, 0.4, 0.25, 0, 0, 63);
  vines(G, V(-1.4, 2.3, 0.62), V(-0.4, 2.3, 0.62), 4, 1.0, 64);
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
  // (its crown just under the deck, its feet down in the banks)
  const AR = L * 0.28;
  const arch = new THREE.TorusGeometry(AR, 0.35, 6, 16, Math.PI).rotateY(Math.PI / 2);
  put(new THREE.Mesh(arch, st), G, 0, -0.42 - AR, 0);
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
  return G;
}
// a wooden water tower on four legs, a conical roof, a ladder, ivy
export function waterTower({ h = 7, r = 2.0, wood = '#8a6a4a' } = {}) {
  const G = new THREE.Group(), pw = texm(planks(wood));
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const l = beam(V(sx * r * 0.9, 0, sz * r * 0.9), V(sx * r * 0.6, h, sz * r * 0.6), 0.22, shade(wood, 0.8), G); void l; }
  for (const y of [h * 0.35, h * 0.7]) for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
    const k = 0.9 - (y / h) * 0.3;
    beam(V(a[0] * r * k, y, a[1] * r * k), V(b[0] * r * k, y, b[1] * r * k), 0.12, shade(wood, 0.75), G);
  }
  cyl(r, r, 2.6, pw, 0, h + 1.3, 0, G, 16);
  for (const y of [h + 0.4, h + 1.3, h + 2.2]) cyl(r + 0.04, r + 0.04, 0.08, '#3a3a3a', 0, y, 0, G, 16, { line: false });
  cone(r + 0.35, 1.3, texm(clay('#4f7a8a')), 0, h + 3.25, 0, G, 16);
  for (let y = 0.4; y < h + 2.4; y += 0.4) box(0.5, 0.05, 0.05, '#5a4a3a', 0, y, r * 0.92 + 0.2, G, { line: false });
  for (const sx of [-1, 1]) beam(V(sx * 0.25, 0, r * 0.95 + 0.2), V(sx * 0.25, h + 2.5, r + 0.25), 0.06, '#5a4a3a', G);
  ivy(G, 2.2, 3.4, 0, h, r + 0.02, 0, 81, 9);
  vines(G, V(-r, h + 2.6, r * 0.5), V(r * 0.2, h + 2.6, r), 5, 1.5, 82);
  return G;
}
// a windmill: a round stone tower, a cap, four lattice sails (mesh 'r1_sails'
// turns in the native game: route1.gd)
export function windmill({ h = 9, col = '#d9d0b8' } = {}) {
  const G = new THREE.Group();
  cyl(1.6, 2.4, h, texm(plaster(col)), 0, h / 2, 0, G, 14);
  const cap = cone(2.0, 2.4, texm(thatch('#9a7a4a')), 0, h + 1.1, 0, G, 14); void cap;
  // the door, the windows and the ivy sit on the tapered wall's face (it
  // narrows from r 2.4 to 1.6): at its radius there, leaning back with it
  const rAt = (y) => 2.4 - 0.8 * y / h, lean = -Math.atan2(0.8, h);
  box(0.9, 1.6, 0.1, '#5a3a22', 0, 0.8, rAt(0.8) + 0.02, G).rotation.x = lean;
  for (const y of [h * 0.45, h * 0.75]) box(0.6, 0.7, 0.1, '#f2e2b0', 0, y, rAt(y) + 0.02, G).rotation.x = lean;
  const S = new THREE.Group(); S.name = 'r1_sails'; S.position.set(0, h + 0.5, 2.2); S.userData.keep = true; G.add(S);
  cyl(0.2, 0.2, 0.6, '#5a3a22', 0, 0, 0, S, 8).rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const A = new THREE.Group(); A.rotation.z = i * Math.PI / 2 + 0.3; S.add(A);
    box(0.14, 5.2, 0.1, '#6a4a30', 0, 2.6, 0.2, A);
    for (let k = 0; k < 6; k++) box(1.1, 0.06, 0.04, '#8a6a4a', 0.55, 1.2 + k * 0.7, 0.22, A, { line: false });
    box(1.0, 4.0, 0.02, '#f2ead6', 0.55, 3.0, 0.25, A, { line: false });
  }
  ivy(G, 1.5, 3.0, 0, 1.65, rAt(1.65), 0, 85, 10).rotation.x = lean;   // over the door
  return G;
}
// a cottage on Viridian's edge: plaster and timber, a clay roof full of
// moss, a chimney, window boxes, ivy over half the front
export function cottage({ W = 6.4, D = 5.2, wall = '#efe2c8', roof = '#c4553a', trim = '#5f8a7a', seed = 1 } = {}) {
  const G = new THREE.Group(), H = 2.8;
  box(W + 0.3, 0.4, D + 0.3, texm(stonesTex('#b4ad98')), 0, 0.2, 0, G);
  box(W, H, D, texm(plaster(wall)), 0, 0.4 + H / 2, 0, G);
  for (const sx of [-1, 1]) box(0.16, H, 0.16, '#6a4a30', sx * (W / 2 - 0.02), 0.4 + H / 2, D / 2 - 0.02, G);
  box(W + 0.1, 0.16, 0.16, '#6a4a30', 0, 0.4 + H, D / 2 - 0.02, G);
  box(1.0, 1.9, 0.08, trim, 0.9, 1.35, D / 2 + 0.02, G);
  for (const wx of [-1.6, 2.4]) {
    if (wx > 2) continue;
    box(1.1, 0.9, 0.06, '#9fd2f2', wx, 1.9, D / 2 + 0.02, G, { line: false });
    box(1.25, 0.08, 0.1, trim, wx, 2.4, D / 2 + 0.05, G); box(1.25, 0.08, 0.1, trim, wx, 1.42, D / 2 + 0.05, G);
    box(1.2, 0.25, 0.3, '#8a5a3a', wx, 1.25, D / 2 + 0.18, G);
    mossTop(G, 1.1, 0.3, wx, 1.36, D / 2 + 0.18, 0, seed + 5);
  }
  const rise = 2.0, rm = texm(clay(roof));
  roofSlab(G, W + 0.9, D / 2 + 0.55, rise, 0.14, rm, 0, 0.4 + H - 0.05, D / 4 + 0.27, 0);
  roofSlab(G, W + 0.9, D / 2 + 0.55, rise, 0.14, rm, 0, 0.4 + H - 0.05, -D / 4 - 0.27, Math.PI);
  // gable ends
  for (const sx of [-1, 1]) {
    const sh = new THREE.Shape(); sh.moveTo(-D / 2, 0); sh.lineTo(D / 2, 0); sh.lineTo(0, rise); sh.lineTo(-D / 2, 0);
    const g = new THREE.ShapeGeometry(sh); g.rotateY(Math.PI / 2);
    put(new THREE.Mesh(wuv(g), texm(plaster(wall), '#ffffff', THREE.DoubleSide)), G, sx * W / 2, 0.4 + H, 0);
  }
  box(0.7, 2.0, 0.7, texm(stonesTex('#b0a08a')), -W / 2 + 1.2, 0.4 + H + 1.4, -0.6, G);
  mossTop(G, W * 0.5, 1.2, -W * 0.18, 0.4 + H + 0.9, D / 4 + 0.2, 0.0, seed + 7);
  mossTop(G, W * 0.4, 1.0, W * 0.2, 0.4 + H + 1.1, -D / 4, 0.1, seed + 8);
  ivy(G, W * 0.55, H + 0.6, -W * 0.22, 0.2, D / 2 + 0.05, 0, seed + 9, 14);
  ivy(G, D * 0.8, H + 1.2, W / 2 + 0.05, 0.2, 0, Math.PI / 2, seed + 10, 12);
  vines(G, V(-W / 2 - 0.4, 0.4 + H + 0.1, D / 2 + 0.55), V(0.2, 0.4 + H + 0.1, D / 2 + 0.55), 7, 1.3, seed + 11);
  G.userData.foot = { hw: W / 2 + 0.2, hd: D / 2 + 0.2 };
  return G;
}
// a stretch of a far city: a house of a few floors, a roof, gardens on the
// roof and balconies, vines down its walls (for the glimpses of Viridian)
export function cityBlock({ W = 6, D = 6, floors = 2, wall = '#efe2c8', roof = '#3d7a6a', seed = 1, garden = true } = {}) {
  const G = new THREE.Group(), H = floors * 2.8, R = rng(seed);
  box(W, H, D, texm(plaster(wall)), 0, H / 2, 0, G);
  for (let f = 0; f < floors; f++) for (let k = 0; k < Math.max(1, Math.floor(W / 2)); k++) {
    const wx = -W / 2 + 1 + k * (W - 2) / Math.max(1, Math.floor(W / 2) - 1 || 1);
    box(0.8, 1.0, 0.06, R() < 0.4 ? '#ffe6a0' : '#6a8aa0', Math.floor(W / 2) === 1 ? 0 : wx, 1.5 + f * 2.8, D / 2 + 0.02, G, { line: false });
  }
  if (R() < 0.6) {
    const rise = 1.6 + R(), rm = texm(clay(roof));
    roofSlab(G, W + 0.6, D / 2 + 0.4, rise, 0.14, rm, 0, H, D / 4 + 0.2, 0);
    roofSlab(G, W + 0.6, D / 2 + 0.4, rise, 0.14, rm, 0, H, -D / 4 - 0.2, Math.PI);
    if (garden) mossTop(G, W * 0.6, 1.2, 0, H + 0.6, D / 4, 0, seed + 3);
  } else {
    box(W + 0.3, 0.3, D + 0.3, '#c9bfa8', 0, H + 0.15, 0, G);
    if (garden) mossTop(G, W - 0.4, D - 0.4, 0, H + 0.3, 0, 0, seed + 3);
  }
  if (garden) ivy(G, W * 0.7, H, (R() - 0.5) * W * 0.3, 0, D / 2 + 0.04, 0, seed + 4, 7);
  return G;
}
// Viridian's clock tower: a tall stone tower, a clock face each side, a
// green copper roof, vines up its sides
export function clockTower({ h = 18, w = 4 } = {}) {
  const G = new THREE.Group(), st = texm(stonesTex('#c9bfa8'));
  box(w, h, w, st, 0, h / 2, 0, G);
  box(w + 0.4, 0.4, w + 0.4, '#b0a690', 0, h, 0, G);
  const face = words('o_clock', 256, 256, (x, w2, h2) => {
    x.fillStyle = '#f6f0dc'; x.beginPath(); x.arc(w2 / 2, h2 / 2, w2 / 2 - 4, 0, 6.28); x.fill();
    x.strokeStyle = '#2a2a2a'; x.lineWidth = 8; x.stroke();
    x.lineWidth = 6; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.28; x.beginPath(); x.moveTo(w2 / 2 + Math.cos(a) * 100, h2 / 2 + Math.sin(a) * 100); x.lineTo(w2 / 2 + Math.cos(a) * 115, h2 / 2 + Math.sin(a) * 115); x.stroke(); }
    x.lineWidth = 10; x.beginPath(); x.moveTo(w2 / 2, h2 / 2); x.lineTo(w2 / 2, h2 / 2 - 80); x.stroke();
    x.lineWidth = 7; x.beginPath(); x.moveTo(w2 / 2, h2 / 2); x.lineTo(w2 / 2 + 60, h2 / 2 + 20); x.stroke();
  });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, m = put(new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), texm(face)), G, Math.sin(a) * (w / 2 + 0.02), h - 2, Math.cos(a) * (w / 2 + 0.02), { ry: a, line: false });
    void m;
  }
  box(w - 0.6, 3, w - 0.6, st, 0, h + 1.7, 0, G);
  cone(w * 0.62, 4.2, texm(clay('#5aa08a')), 0, h + 5.3, 0, G, 4).rotation.y = Math.PI / 4;
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
  roofSlab(G, W + 4.2, 1.0, 0.7, 0.12, rm, 0, AY + 0.45, 0.5, 0);
  roofSlab(G, W + 4.2, 1.0, 0.7, 0.12, rm, 0, AY + 0.45, -0.5, Math.PI);
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
// a fallen tree: a long mossy trunk with a root plate and broken branches
export function fallenLog({ L = 7, r = 0.45, seed = 1, hollow = false } = {}) {
  const G = new THREE.Group(), bark = barkMaterial('#6a4a34', 'ridged', 0);
  const R = rng(seed);
  const t = put(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, L, 10, 1, hollow), bark), G, 0, r * 0.9, 0, { rz: Math.PI / 2 });
  void t;
  if (hollow) cyl(r * 0.6, r * 0.8, L * 0.98, '#3a2a1c', 0, r * 0.9, 0, G, 10, { open: true }).rotation.z = Math.PI / 2;
  else {
    const plate = put(new THREE.Mesh(new THREE.CircleGeometry(r * 2.2, 10), flat('#6a5a40', THREE.DoubleSide)), G, -L / 2, r * 1.4, 0, { ry: Math.PI / 2 });
    void plate;
    for (let k = 0; k < 4; k++) { const a = R() * 6.28; beam(V(-L / 2, r, 0), V(-L / 2 - 0.4, r + Math.sin(a) * 1.4, Math.cos(a) * 1.4), 0.12, '#5a4030', G); }
  }
  for (let k = 0; k < 3; k++) { const x = (R() - 0.5) * L * 0.7; beam(V(x, r * 1.4, 0), V(x + (R() - 0.5), r * 1.4 + 0.8, (R() - 0.5) * 1.8), 0.08, '#5a4030', G); }
  mossTop(G, L * 0.8, r * 1.2, 0, r * 1.75, 0, 0, seed + 20);
  // a few bracket mushrooms on its side
  for (let k = 0; k < 5; k++) { const m = cyl(0.14, 0.18, 0.05, '#e8c48a', (R() - 0.5) * L * 0.8, r * (0.6 + R() * 0.6), r * 0.95, G, 8); m.rotation.x = 0.2; }
  return G;
}
// a fairy ring of red-capped mushrooms (one mesh)
export function mushroomRing({ r = 1.4, n = 14, seed = 1 } = {}) {
  const G = new THREE.Group(), R = rng(seed);
  const stems = [], caps = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * 6.28 + R() * 0.3, d = r + (R() - 0.5) * 0.3, s = 0.6 + R() * 0.7;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    stems.push(new THREE.CylinderGeometry(0.04 * s, 0.05 * s, 0.18 * s, 6).translate(x, 0.09 * s, z));
    const c = new THREE.SphereGeometry(0.12 * s, 8, 5, 0, 6.28, 0, Math.PI / 2).translate(x, 0.17 * s, z);
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
