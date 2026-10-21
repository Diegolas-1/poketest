// Professor Oak's lab as the anime draws it: a cream hall with a tall arched
// gable under a magenta corrugated barrel roof (white trim rim, deep
// overhang), three tall round-arched windows over a strip window, a portico
// with two white columns, a canopy and stone steps; a long gabled wing to the
// side with square windows and dormers; a brick plinth; and a silver tapered
// tower rising from the back of the roof, topped by a big yellow windmill.
// Cel shaded with painted textures and an ink outline on the main volumes.
// Static parts are merged by material at the end (a handful of draw calls).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from './toon.js';
import { makeBush, TILE } from './foliage.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- painted textures ----------
const texCache = new Map();
function paint(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h, rng(key.length * 97 + w));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
// corrugated sheet: ribs run along v (texture = 2 x 2 m, 14 ribs), faint
// overlap seams across them every metre and a few painted streaks
const corrug = (col) => paint('corrug' + col, 256, 256, (x, w, h, R) => {
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  const n = 14, cw = w / n;
  for (let i = 0; i < n; i++) {
    const g = x.createLinearGradient(i * cw, 0, (i + 1) * cw, 0);
    g.addColorStop(0, shade(col, 0.8)); g.addColorStop(0.3, shade(col, 1.16)); g.addColorStop(0.5, shade(col, 1.04));
    g.addColorStop(0.8, shade(col, 0.88)); g.addColorStop(1, shade(col, 0.74));
    x.fillStyle = g; x.fillRect(i * cw, 0, cw, h);
    x.fillStyle = 'rgba(255,235,240,.35)'; x.fillRect(i * cw + cw * 0.26, 0, 1.4, h);
  }
  x.globalAlpha = 0.5; x.fillStyle = shade(col, 0.66);
  for (const y of [0, 128]) x.fillRect(0, y, w, 2.5);
  x.fillStyle = shade(col, 1.2); for (const y of [3, 131]) x.fillRect(0, y, w, 1.5);
  x.globalAlpha = 0.12;
  for (let k = 0; k < 18; k++) { x.fillStyle = R() < 0.5 ? '#ffffff' : shade(col, 0.6); x.fillRect(R() * w, R() * h, 2 + R() * 5, 30 + R() * 90); }
  x.globalAlpha = 1;
});
const plaster = (col) => paint('plaster' + col, 256, 256, (x, w, h, R) => {
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 46; k++) { x.globalAlpha = 0.07; x.fillStyle = R() < 0.5 ? '#fffbea' : shade(col, 0.82); x.beginPath(); x.arc(R() * w, R() * h, 8 + R() * 30, 0, 6.28); x.fill(); }
  x.globalAlpha = 0.08; x.fillStyle = shade(col, 0.85);
  for (let k = 0; k < 30; k++) x.fillRect(R() * w, R() * h, 1.2, 6 + R() * 22);
  x.globalAlpha = 1;
});
const bricks = (col) => paint('bricks' + col, 256, 256, (x, w, h, R) => {
  x.fillStyle = '#d8ccb4'; x.fillRect(0, 0, w, h);
  const rows = 8, bw = 64, rh = h / rows;
  for (let r = 0; r < rows; r++) for (let c = -1; c < 5; c++) {
    x.fillStyle = shade(col, 0.86 + R() * 0.26);
    x.fillRect(c * bw + (r % 2) * bw / 2 + 3, r * rh + 3, bw - 6, rh - 6);
    x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(c * bw + (r % 2) * bw / 2 + 3, r * rh + 3, bw - 6, 3);
  }
});
const stones = (col) => paint('stones' + col, 256, 256, (x, w, h, R) => {
  x.fillStyle = shade(col, 0.72); x.fillRect(0, 0, w, h);
  for (let k = 0; k < 40; k++) {
    const cx = R() * w, cy = R() * h, rx = 18 + R() * 22, ry = 12 + R() * 14;
    for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      x.fillStyle = shade(col, 0.92 + R() * 0.18);
      x.beginPath(); x.ellipse(cx + ox, cy + oy, rx, ry, R(), 0, 6.28); x.fill();
    }
  }
});
const planks = (col) => paint('planks' + col, 256, 256, (x, w, h, R) => {
  for (let k = 0; k < 8; k++) {
    x.fillStyle = shade(col, 0.9 + R() * 0.18); x.fillRect(k * 32, 0, 32, h);
    x.fillStyle = shade(col, 0.68); x.fillRect(k * 32 + 30, 0, 2, h);
    x.globalAlpha = 0.25; x.fillStyle = shade(col, 0.72);
    for (let j = 0; j < 4; j++) x.fillRect(k * 32 + 6 + R() * 20, R() * h, 1.5, 40 + R() * 80);
    x.globalAlpha = 1;
  }
});
// brushed metal panels for the tower: vertical seams, horizontal rings
const metal = (col) => paint('metal' + col, 256, 256, (x, w, h, R) => {
  const g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, col); g.addColorStop(0.5, shade(col, 1.04)); g.addColorStop(1, col);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.globalAlpha = 0.1;
  for (let k = 0; k < 40; k++) { x.fillStyle = R() < 0.5 ? '#ffffff' : shade(col, 0.7); x.fillRect(R() * w, 0, 1 + R() * 2, h); }
  x.globalAlpha = 1;
  for (let i = 0; i < 4; i++) { x.fillStyle = shade(col, 0.8); x.fillRect(i * 64, 0, 2, h); x.fillStyle = '#ffffff'; x.fillRect(i * 64 + 2, 0, 1.5, h); }
  x.fillStyle = shade(col, 0.82); x.fillRect(0, 126, w, 2.5);
  x.fillStyle = shade(col, 0.75); for (let i = 0; i < 16; i++) { x.beginPath(); x.arc(i * 16 + 8, 122, 1.6, 0, 6.28); x.fill(); }
});
// glass: sky blue with white reflection streaks
const glassTex = () => paint('glass', 128, 128, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#a9dcf6'); g.addColorStop(0.55, '#6aa9db'); g.addColorStop(1, '#3f78b6');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,.72)';
  x.beginPath(); x.moveTo(w * 0.12, h); x.lineTo(w * 0.42, 0); x.lineTo(w * 0.56, 0); x.lineTo(w * 0.26, h); x.fill();
  x.beginPath(); x.moveTo(w * 0.6, h); x.lineTo(w * 0.8, 0); x.lineTo(w * 0.85, 0); x.lineTo(w * 0.65, h); x.fill();
});
function signTexture(text, { bg = '#2f5a4a', fg = '#f6ecd2' } = {}) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 144;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 1024, 144);
  x.strokeStyle = '#e8d9a6'; x.lineWidth = 8; x.strokeRect(10, 10, 1004, 124);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  let fs = 80; x.font = `700 ${fs}px "Pixelify Sans", system-ui, sans-serif`;
  const tw = x.measureText(text).width; if (tw > 920) { fs = Math.floor(fs * 920 / tw); x.font = `700 ${fs}px "Pixelify Sans", system-ui, sans-serif`; }
  x.fillText(text, 512, 76);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------- materials ----------
const mats = new Map();
function M(key, make) { if (!mats.has(key)) mats.set(key, make()); return mats.get(key); }
const BUILD = { deep: [0.56, 0.62, 0.82], shade: [0.74, 0.79, 0.94], lit: [1.06, 1.04, 0.98], bands: [0.1, 0.3, 0.58] };
const flat = (col) => M('c' + col, () => toon(col, { cel: BUILD }));
const tex = (t, col = '#ffffff') => M(t.uuid + col, () => toon(col, { map: t, cel: BUILD }));
const glass = () => M('glass', () => new THREE.MeshBasicMaterial({ map: glassTex() }));

// UVs in metres, projected along the face's main axis
function wuv(g, s = 0.5) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getZ(i); v = p.getX(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * s; uv[i * 2 + 1] = v * s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// Ink lines come from the screen-space outline pass (outline.js), which draws
// constant-width lines on every silhouette, crease and part edge. ink() is kept
// so callers still work; it only tags the mesh as a solid for that pass.
const INK = new THREE.MeshBasicMaterial({ color: '#2f2b36', side: THREE.BackSide });
function ink(mesh, w = 0.035) {
  const g = mesh.geometry; g.computeBoundingBox();
  const b = g.boundingBox, s = b.getSize(V(0, 0, 0)), c = b.getCenter(V(0, 0, 0));
  const o = new THREE.Mesh(g, INK);
  o.position.copy(c).multiplyScalar(-1);
  const pivot = new THREE.Group();
  pivot.position.copy(c);
  pivot.scale.set((s.x + 2 * w) / Math.max(s.x, 1e-3), (s.y + 2 * w) / Math.max(s.y, 1e-3), (s.z + 2 * w) / Math.max(s.z, 1e-3));
  pivot.add(o);
  mesh.add(pivot);
  return mesh;
}
function add(mesh, parent, x = 0, y = 0, z = 0, { shadow = true, line = true, inkW } = {}) {
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  if (line) ink(mesh, inkW);
  parent.add(mesh);
  return mesh;
}
const mat = (m) => (typeof m === 'string' ? flat(m) : m);
function box(w, h, d, m, x, y, z, parent, o) {
  const g = wuv(new THREE.BoxGeometry(w, h, d), (o && o.uvs) || 0.5);
  return add(new THREE.Mesh(g, mat(m)), parent, x, y, z, o);
}
function cyl(rt, rb, h, m, x, y, z, parent, seg = 14, o) {
  return add(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(m)), parent, x, y, z, o);
}
function sphere(r, m, x, y, z, parent, o) {
  return add(new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat(m)), parent, x, y, z, o);
}
function plant(model, parent, x, y, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
  for (const p of model.parts) { const m = new THREE.Mesh(p.geometry, p.material); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  parent.add(g);
  return g;
}

const TRIM = '#fbf9f0';
// A window facing +z: white frame, blue glass, mullions, a sill.
function windowAt(parent, x, y, z, w, h, cols, rows, frame = TRIM) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  box(w + 0.24, h + 0.24, 0.1, frame, 0, 0, 0, g, { inkW: 0.025 });
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass()); gl.position.z = 0.06; g.add(gl);
  for (let c = 1; c < cols; c++) box(0.07, h, 0.06, frame, -w / 2 + (w * c) / cols, 0, 0.08, g, { line: false, shadow: false });
  for (let r = 1; r < rows; r++) box(w, 0.07, 0.06, frame, 0, -h / 2 + (h * r) / rows, 0.08, g, { line: false, shadow: false });
  box(w + 0.44, 0.1, 0.24, frame, 0, -h / 2 - 0.16, 0.1, g, { inkW: 0.02 });
  return g;
}
// A round-arched window facing +z
function archWindow(parent, x, y, z, w, h, { frame = TRIM, fw = 0.14, sill = true, transom = true } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const r = w / 2, shape = (k) => {
    const s = new THREE.Shape(); const rw = r + k;
    s.moveTo(-rw, -h / 2 - k); s.lineTo(rw, -h / 2 - k); s.lineTo(rw, h / 2 - r); s.absarc(0, h / 2 - r, rw, 0, Math.PI, false); s.lineTo(-rw, -h / 2 - k);
    return s;
  };
  const outer = shape(fw); outer.holes.push(new THREE.Path(shape(0).getPoints(24).reverse()));
  const fr = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.14, bevelEnabled: false, curveSegments: 20 }), flat(frame));
  add(fr, g, 0, 0, 0, { inkW: 0.025 });
  const gg = new THREE.ShapeGeometry(shape(0), 20);
  { const p = gg.attributes.position, uv = gg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5); }
  const gl = new THREE.Mesh(gg, glass()); gl.position.z = 0.04; g.add(gl);
  box(0.07, h, 0.06, frame, 0, 0, 0.09, g, { line: false, shadow: false });
  if (transom) box(w, 0.07, 0.06, frame, 0, h / 2 - r, 0.09, g, { line: false, shadow: false });
  if (sill) box(w + 0.42, 0.1, 0.24, frame, 0, -h / 2 - fw - 0.04, 0.1, g, { inkW: 0.02 });
  return g;
}
// round porthole facing +z
function porthole(parent, x, y, z, r, rotY = 0, tilt = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(tilt, rotY, 0, 'YXZ'); parent.add(g);
  const gl = new THREE.Mesh(new THREE.CircleGeometry(r, 20), glass()); gl.position.z = 0.03; g.add(gl);
  add(new THREE.Mesh(new THREE.TorusGeometry(r + 0.06, 0.08, 6, 22), flat('#9fa9b3')), g, 0, 0, 0.04, { inkW: 0.02 });
  return g;
}
// gable roof with its ridge along z over a w (x) by d (z) box, eaves at y0
function gableRoofZ(parent, w, d, y0, rise, roofMat, ox = 0.35, oz = 0.35, th = 0.18) {
  const half = w / 2, ang = Math.atan2(rise, half), slope = Math.hypot(half, rise) + ox / Math.cos(ang);
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); parent.add(g);
    const mx = s * (slope / 2) * Math.cos(ang), my = y0 + rise - (slope / 2) * Math.sin(ang);
    g.position.set(mx, my + th / 2 / Math.cos(ang), 0); g.rotation.z = -s * ang;
    const geo = new THREE.BoxGeometry(slope, th, d + oz * 2);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * s * 0.5, p.getZ(i) * 0.5);
    add(new THREE.Mesh(geo, roofMat), g, 0, 0, 0, { inkW: 0.025 });
    for (const e of [-1, 1]) box(slope + 0.04, th + 0.1, 0.1, TRIM, 0, -0.02, e * (d / 2 + oz), g, { line: false });
  }
  box(0.22, 0.16, d + oz * 2 + 0.06, TRIM, 0, y0 + rise + th * 0.9, 0, parent, { line: false });
}
function gableWall(parent, w, rise, y0, z, m) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, rise); s.lineTo(-w / 2, 0);
  const mesh = new THREE.Mesh(wuv(new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false }), 0.5), m);
  mesh.position.set(0, y0, z - 0.1); mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// ---------- the arch of the main hall ----------
const SE_P = 2.5;
// a superellipse arch: t 0 (right eave) .. PI (left eave)
function se(A, B, t) {
  const c = Math.cos(t), s = Math.sin(t);
  return [A * Math.sign(c) * Math.pow(Math.abs(c), 2 / SE_P), B * Math.pow(Math.abs(s), 2 / SE_P)];
}
function archPts(A, B, n = 48) { const out = []; for (let i = 0; i <= n; i++) out.push(se(A, B, (i / n) * Math.PI)); return out; }
// the barrel surface between z0 and z1; uv u = arc length (ribs along z)
function barrelGeo(A, B, z0, z1, inward = false, n = 48) {
  const pts = archPts(A, B, n), pos = [], uv = [], idx = [];
  let L = 0;
  for (let i = 0; i <= n; i++) {
    if (i) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    for (const z of [z0, z1]) { pos.push(pts[i][0], pts[i][1], z); uv.push(L * 0.5, z * 0.5); }
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    if (inward) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// closed arch-topped wall outline (rectangle up to eave + arch)
function archWallShape(hw, eave, B) {
  const s = new THREE.Shape(); s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, eave);
  for (const [x, y] of archPts(hw, B).slice(1)) s.lineTo(x, eave + y);
  s.lineTo(-hw, 0);
  return s;
}
function bandShape(A0, B0, A1, B1) {
  const s = new THREE.Shape(), o = archPts(A0, B0), i = archPts(A1, B1).reverse();
  s.moveTo(o[0][0], o[0][1]); for (const [x, y] of o.slice(1)) s.lineTo(x, y);
  for (const [x, y] of i) s.lineTo(x, y);
  return s;
}

// ---------- the lab ----------
export const LAB_FOOTPRINT = { w: 26, d: 18 };
// hall layout (local, before rotation; +z = front)
const HX = -7, HW = 5, ZF = 6.4, ZB = -7.8, PL = 0.6, EAVE = 5.0, RB = 5.6, OH = 0.75, RTH = 0.28;
export const LAB_DOOR = { x: HX, z: ZF };

export function buildLab(world, { x = 0, z = 0, y = 0, facing = 0 } = {}) {
  const G = new THREE.Group(); G.position.set(x, y, z); G.rotation.y = facing;
  world.group.add(G);
  const S = new THREE.Group();     // static parts, merged at the end
  const CREAM = '#f4d98a';
  const wall = tex(plaster(CREAM)), roofMat = tex(corrug('#b8324f')), under = flat('#4a3c68');
  const brick = tex(bricks('#c48a62')), stoneM = tex(stones('#d4cdbd'));
  const A = HW + 0.35, B = RB;          // roof outer half-width and rise

  // --- main hall ---
  const hall = new THREE.Group(); hall.position.x = HX; S.add(hall);
  const D = ZF - ZB, zc = (ZF + ZB) / 2;
  box(2 * HW + 0.36, PL, D + 0.36, brick, 0, PL / 2, zc, hall, { uvs: 0.7 });
  box(2 * HW, EAVE - PL, D - 0.6, wall, 0, PL + (EAVE - PL) / 2, zc, hall);   // meets the 0.3 gable walls, no coplanar overlap
  for (const [zz, flip] of [[ZF, 1], [ZB, -1]]) {
    const gw = new THREE.Mesh(wuv(new THREE.ExtrudeGeometry(archWallShape(HW, EAVE, B - RTH - 0.05), { depth: 0.3, bevelEnabled: false, curveSegments: 4 }), 0.5), wall);
    gw.position.set(0, 0, flip > 0 ? zz - 0.3 : zz + 0.3); if (flip < 0) gw.rotation.y = Math.PI;
    add(gw, hall, gw.position.x, gw.position.y, gw.position.z, { line: false });
  }
  // the barrel roof: corrugated outside, navy underside, white rim at both ends
  const z0 = ZB - OH, z1 = ZF + OH;
  const roof = new THREE.Mesh(barrelGeo(A, B, z0, z1), roofMat); add(roof, hall, 0, EAVE, 0, { line: false });
  const roofIn = new THREE.Mesh(barrelGeo(A - RTH, B - RTH, z0, z1, true), under); add(roofIn, hall, 0, EAVE, 0, { line: false, shadow: false });
  const roofInk = new THREE.Mesh(barrelGeo(A + 0.06, B + 0.06, z0 - 0.06, z1 + 0.06), INK); roofInk.position.y = EAVE; hall.add(roofInk);
  for (const zz of [z0, z1]) {
    const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(bandShape(A + 0.09, B + 0.09, A - RTH - 0.06, B - RTH - 0.06), { depth: 0.22, bevelEnabled: false }), flat(TRIM));
    add(rim, hall, 0, EAVE, zz - 0.11, { inkW: 0.03 });
  }
  for (const sx of [-1, 1]) box(RTH + 0.12, 0.14, z1 - z0 + 0.2, TRIM, sx * (A - RTH / 2), EAVE - 0.04, zc, hall, { inkW: 0.02 });
  // a few raised seams across the barrel
  for (const zz of [ZB + 2.6, zc, ZF - 2.6]) {
    const seam = new THREE.Mesh(new THREE.ExtrudeGeometry(bandShape(A + 0.05, B + 0.05, A - 0.02, B - 0.02), { depth: 0.1, bevelEnabled: false }), flat('#a32a45'));
    seam.position.set(0, EAVE, zz); seam.castShadow = true; hall.add(seam);
  }

  // front gable: three tall arched windows over a 4-pane strip window
  const fz = ZF + 0.02;
  for (const k of [-1, 0, 1]) archWindow(hall, k * 1.5, 7.9, fz, 1.22, 3.3, { fw: 0.15 });
  windowAt(hall, 0, 5.12, fz, 4.6, 0.9, 4, 1);
  box(5.4, 0.14, 0.3, TRIM, 0, 5.8, fz + 0.06, hall, { inkW: 0.02 });   // ledge between them
  for (const sx of [-1, 1]) windowAt(hall, sx * 3.35, 2.35, fz, 0.78, 1.85, 1, 2);
  // the portico: landing, steps, columns, canopy, door, nameplate
  const PZ = 1.75;  // how far it comes out
  box(4.2, PL + 0.02, PZ + 0.1, stoneM, 0, PL / 2 + 0.01, ZF + PZ / 2, hall, { uvs: 0.6 });   // 2 cm over the plinth's top, not flush
  for (let s = 0; s < 2; s++) { const h = PL * (2 - s) / 3; box(3.4, h, 0.42, stoneM, 0, h / 2, ZF + PZ + 0.26 + s * 0.42, hall, { uvs: 0.6, inkW: 0.02 }); }
  box(2.0, 2.9, 0.18, TRIM, 0, PL + 1.38, ZF + 0.02, hall, { inkW: 0.025 });           // door frame
  box(1.55, 2.6, 0.1, tex(planks('#8a5634')), 0, PL + 1.3, ZF + 0.12, hall, { inkW: 0.02 });
  for (const dx of [-0.39, 0.39]) for (const dy of [0.75, 1.85]) box(0.56, 0.8, 0.05, '#7a4a2c', dx, PL + dy, ZF + 0.18, hall, { line: false, shadow: false });
  sphere(0.07, '#e8c15a', 0.6, PL + 1.25, ZF + 0.22, hall, { line: false });
  box(1.4, 0.03, 0.9, '#a64a3a', 0, PL + 0.035, ZF + 0.75, hall, { line: false });     // mat
  for (const sx of [-1, 1]) {
    const cxp = sx * 1.55, czp = ZF + PZ - 0.3;
    box(0.5, 0.2, 0.5, TRIM, cxp, PL + 0.1, czp, hall, { inkW: 0.02 });
    cyl(0.15, 0.18, 2.55, TRIM, cxp, PL + 1.47, czp, hall, 14, { inkW: 0.025 });
    box(0.46, 0.18, 0.46, TRIM, cxp, PL + 2.83, czp, hall, { inkW: 0.02 });
    box(0.24, 2.6, 0.24, TRIM, sx * 1.55, PL + 1.5, ZF + 0.12, hall, { inkW: 0.02 });   // pilasters
  }
  box(3.9, 0.26, PZ + 0.35, '#e9ebe6', 0, PL + 3.05, ZF + PZ / 2 + 0.05, hall);
  box(3.6, 0.16, PZ + 0.1, '#f7f8f3', 0, PL + 3.25, ZF + PZ / 2 - 0.05, hall, { inkW: 0.02 });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.46), new THREE.MeshBasicMaterial({ map: signTexture('OAK POKéMON RESEARCH LAB') }));
  box(3.46, 0.56, 0.08, '#2a4a3e', 0, PL + 3.62, ZF + PZ - 0.25, hall, { inkW: 0.02 });
  plate.position.set(0, PL + 3.62, ZF + PZ - 0.19); hall.add(plate);
  // drainpipes at the front corners
  for (const sx of [-1, 1]) {
    cyl(0.07, 0.07, EAVE - 0.4, '#e7e9e3', sx * (HW - 0.18), (EAVE - 0.4) / 2 + 0.3, ZF + 0.12, hall, 8, { inkW: 0.015 });
    box(0.24, 0.24, 0.24, '#e7e9e3', sx * (HW - 0.18), EAVE - 0.12, ZF + 0.12, hall, { inkW: 0.015 });
  }
  // left side: arched windows; right side: one tall window before the wing
  for (const zz of [-5.6, -2.6, 0.4, 3.4]) { const w = archWindow(hall, -HW - 0.02, 2.85, zz, 1.0, 2.1); w.rotation.y = -Math.PI / 2; }
  { const w = archWindow(hall, HW + 0.02, 2.85, 4.6, 1.0, 2.1); w.rotation.y = Math.PI / 2; }
  // back gable: a round window and two arched windows below
  porthole(hall, 0, 8.1, ZB - 0.03, 0.75, Math.PI);
  for (const sx of [-1, 1]) { const w = archWindow(hall, sx * 2.2, 2.85, ZB - 0.02, 1.0, 2.1); w.rotation.y = Math.PI; }

  // --- the side wing (to +x), gabled, ridge along x ---
  const WX0 = HX + HW - 1.2, WX1 = 12.4, WZ0 = -5.0, WZ1 = 2.4, WE = 4.2, WR = 3.3;
  const wl = WX1 - WX0, wd = WZ1 - WZ0, wxc = (WX0 + WX1) / 2, wzc = (WZ0 + WZ1) / 2;
  const wing = new THREE.Group(); wing.position.set(wxc, 0, wzc); S.add(wing);
  box(wl + 0.36, PL + 0.015, wd + 0.36, brick, 0.18, (PL + 0.015) / 2, 0, wing, { uvs: 0.7 });   // 1.5 cm over the hall plinth where they overlap
  box(wl, WE - PL, wd, wall, 0, PL + (WE - PL) / 2, 0, wing);
  // the roof: a sub-group turned so its ridge runs along x
  const wr = new THREE.Group(); wr.rotation.y = Math.PI / 2; wing.add(wr);
  gableRoofZ(wr, wd, wl, WE, WR, roofMat, 0.45, 0.4, 0.2);
  const gw = gableWall(wr, wd, WR, WE, wl / 2, wall); gw.position.z = wl / 2 - 0.15;
  ink(gw, 0.02);
  box(wd + 0.3, 0.16, 0.3, TRIM, 0, WE - 0.02, wl / 2 - 0.02, wr, { inkW: 0.02 });   // eave line on the gable end
  // gable end: a window and a round vent
  { const w = windowAt(wing, wl / 2 + 0.02, 2.4, -0.6, 1.25, 1.25, 2, 2); w.rotation.y = Math.PI / 2; }
  porthole(wing, wl / 2 + 0.02, WE + 1.25, 0, 0.4, Math.PI / 2);
  // windows along the front and the back
  for (const xx of [-4.6, -1.0, 2.6, 6.2]) windowAt(wing, xx, 2.45, wd / 2 + 0.02, 1.3, 1.3, 2, 2);
  for (const xx of [-3.4, 0.8, 5.0]) { const w = windowAt(wing, xx, 2.45, -wd / 2 - 0.02, 1.3, 1.3, 2, 2); w.rotation.y = Math.PI; }
  // dormers on the front slope
  const slopeY = (dz) => WE + WR * (1 - dz / (wd / 2));
  for (const xx of [-0.6, 4.6]) {
    const dz = wd / 2 * 0.6, yb = slopeY(dz) - 0.25;
    const dg = new THREE.Group(); dg.position.set(xx, yb, dz); wing.add(dg);
    box(1.6, 1.35, 2.4, wall, 0, 0.675, -1.2, dg);
    const rg = new THREE.Group(); rg.position.z = -1.2; dg.add(rg);
    gableRoofZ(rg, 1.6, 2.4, 1.35, 0.8, roofMat, 0.18, 0.12, 0.12);
    gableWall(dg, 1.6, 0.8, 1.35, 0.0, wall);
    windowAt(dg, 0, 0.72, 0.02, 0.72, 0.72, 2, 2);
  }
  // drainpipes on the wing's front corners
  cyl(0.07, 0.07, WE - 0.4, '#e7e9e3', wl / 2 - 0.18, (WE - 0.4) / 2 + 0.3, wd / 2 + 0.12, wing, 8, { inkW: 0.015 });
  // a small dish on the back slope and a weather vane on the gable end
  {
    const dz = -wd / 2 * 0.45, yb = slopeY(-dz);
    const dish = new THREE.Group(); dish.position.set(3.2, yb + 0.1, dz); dish.rotation.set(-0.5, -0.6, 0, 'YXZ'); wing.add(dish);
    cyl(0.05, 0.07, 0.7, '#cfd4d8', 0, 0.35, 0, dish, 8, { line: false });
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 8, 0, Math.PI * 2, 0, 0.9), flat('#eef0ee'));
    bowl.material = M('dish', () => toon('#eef0ee', { side: THREE.DoubleSide, cel: BUILD }));
    bowl.rotation.x = -Math.PI / 2 - 0.4; add(bowl, dish, 0, 0.85, 0.15, { line: false });
    cyl(0.025, 0.025, 0.55, '#9aa0a6', 0, 0.85, 0.42, dish, 6, { line: false }).rotation.x = 1.2;
  }
  {
    const vx = wl / 2 + 0.25, vy = WE + WR + 0.2;
    cyl(0.04, 0.04, 1.3, '#3a3a44', vx, vy + 0.65, 0, wing, 6, { line: false });
    box(0.06, 0.06, 0.9, '#3a3a44', vx, vy + 1.0, 0, wing, { line: false });
    box(0.9, 0.06, 0.06, '#3a3a44', vx, vy + 1.0, 0, wing, { line: false });
    const arrow = new THREE.Group(); arrow.position.set(vx, vy + 1.35, 0); arrow.rotation.y = 0.5; wing.add(arrow);
    box(1.0, 0.05, 0.05, '#3a3a44', 0, 0, 0, arrow, { line: false });
    box(0.22, 0.24, 0.03, '#3a3a44', -0.5, 0.0, 0, arrow, { line: false });
    sphere(0.07, '#e8c15a', vx, vy + 1.3, 0, wing, { line: false });
  }

  // --- the tower, rising from the back of the hall ---
  const TX = HX, TZ = ZB + 2.3;
  const TU = 0.8, prof = [[1.9, 4.6], [1.86, 9.0], ...[[1.62, 11.6], [1.32, 13.8], [1.08, 15.6], [0.96, 16.5], [0.82, 17.1], [0.58, 17.55], [0.3, 17.82], [0, 17.92]].map(([r, yy]) => [r, yy + TU])];
  const rAt = (yy) => { for (let i = 1; i < prof.length; i++) if (yy <= prof[i][1]) { const [r0, y0] = prof[i - 1], [r1, y1] = prof[i]; return r0 + (r1 - r0) * (yy - y0) / (y1 - y0); } return 0; };
  const lg = new THREE.LatheGeometry(prof.map(([r, yy]) => new THREE.Vector2(r, yy)), 28);
  { const uv = lg.attributes.uv, p = lg.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5, p.getY(i) * 0.5); }
  const tower = new THREE.Mesh(lg, tex(metal('#e4e8ea'))); add(tower, S, TX, 0, TZ, { inkW: 0.05 });
  for (const yy of [11.2 + TU, 14.7 + TU]) {
    const rr = rAt(yy) + 0.04;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr + 0.03, 0.2, 28), flat('#b8c1c9'));
    add(band, S, TX, yy, TZ, { line: false });
  }
  for (const [yy, a, rr] of [[12.2, 0, 0.36], [13.9, 0.25, 0.32], [16.9, 0, 0.24], [12.9, Math.PI, 0.34], [13.6, -1.3, 0.3], [13.6, 1.3, 0.3]]) {
    const rad = rAt(yy) + 0.01, slope = Math.atan2(0.3, 2.2);
    porthole(S, TX + Math.sin(a) * rad, yy, TZ + Math.cos(a) * rad, rr, a, -slope);
  }
  cyl(0.03, 0.05, 0.9, '#9aa3ab', TX, 18.3 + TU, TZ, S, 6, { line: false });   // lightning rod

  // --- the windmill (animated, kept apart) ---
  const HY = 15.0 + TU, hubZ = TZ + rAt(HY) + 0.85;
  cyl(0.24, 0.3, 1.0, '#cfd5da', TX, HY, TZ + rAt(HY) + 0.3, S, 12, { inkW: 0.02 }).rotation.x = Math.PI / 2;
  const rotor = new THREE.Group(); rotor.position.set(TX, HY, hubZ); G.add(rotor);
  const yellow = flat('#ffdc3a'), yellowDk = flat('#e8b32a');
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), yellow); hub.scale.z = 1.25; add(hub, rotor, 0, 0, 0.18, { inkW: 0.03 });
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.22, 16).rotateX(Math.PI / 2), yellowDk), rotor, 0, 0, -0.05, { inkW: 0.025 });
  const blade = new THREE.Shape();
  blade.moveTo(-0.09, 0.3); blade.lineTo(0.09, 0.3); blade.lineTo(0.1, 1.05);
  blade.lineTo(0.3, 1.2); blade.lineTo(0.36, 4.0); blade.quadraticCurveTo(0.36, 4.42, 0.0, 4.46); blade.quadraticCurveTo(-0.36, 4.42, -0.36, 4.0);
  blade.lineTo(-0.26, 1.2); blade.lineTo(-0.1, 1.05); blade.lineTo(-0.09, 0.3);
  const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.07, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 6 });
  bg.translate(0, 0, -0.035);
  for (let b = 0; b < 4; b++) {
    const arm = new THREE.Group(); arm.rotation.z = b * Math.PI / 2 + Math.PI / 4; rotor.add(arm);
    const m = new THREE.Mesh(bg, yellow); m.rotation.y = 0.28; add(m, arm, 0, 0, 0, { inkW: 0.03 });
    box(0.06, 0.05, 3.2, yellowDk, 0, 0, 0, arm, { line: false }).geometry.rotateX(Math.PI / 2).translate(0, 2.6, -0.02);
  }
  const spin = { a: 0 };
  world.anim.push((dt, t) => { spin.a += dt * 0.55; rotor.rotation.z = -spin.a; });

  // --- dressing: potted plants, a lamp ---
  for (const sx of [-1, 1]) {
    const px = HX + sx * 2.45, pz = ZF + PZ + 1.0;
    cyl(0.42, 0.3, 0.6, '#c0643a', px, 0.3, pz, S, 14, { inkW: 0.025 });
    cyl(0.46, 0.46, 0.1, '#a9532f', px, 0.62, pz, S, 14, { line: false });
    plant(makeBush(310 + sx * 7, { size: 0.55, flowers: sx > 0 ? TILE.flowersR : null }), G, px, 0.55, pz);
  }
  // white globe lamp post to the left of the steps
  {
    const lx = HX - 3.4, lz = ZF + PZ + 1.4;
    box(0.4, 0.3, 0.4, '#3d4a44', lx, 0.15, lz, S, { inkW: 0.02 });
    cyl(0.07, 0.09, 2.6, '#3d4a44', lx, 1.6, lz, S, 8, { inkW: 0.02 });
    cyl(0.16, 0.12, 0.14, '#3d4a44', lx, 2.95, lz, S, 10, { line: false });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), M('globe', () => new THREE.MeshBasicMaterial({ color: '#fffaea' })));
    add(glow, S, lx, 3.28, lz, { inkW: 0.02, shadow: false });
  }
  // shrubs along the wing's front
  for (let k = 0; k < 4; k++) plant(makeBush(420 + k * 13, { size: 0.7 + (k % 2) * 0.15, flowers: k % 2 ? null : TILE.flowersR }), G, WX0 + 3.0 + k * 3.4, PL * 0.2, WZ1 + 0.9, 1);

  // --- merge the static parts by material ---
  S.updateMatrixWorld(true);
  const byMat = new Map(), m4 = new THREE.Matrix4();
  S.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    m4.copy(o.matrixWorld); g.applyMatrix4(m4);
    if (!byMat.has(o.material)) byMat.set(o.material, { list: [], cast: false });
    const e = byMat.get(o.material); e.list.push(g); e.cast ||= o.castShadow;
  });
  for (const [m, { list, cast }] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(list, false), m);
    mesh.castShadow = cast && m.type !== 'MeshBasicMaterial'; mesh.receiveShadow = true;
    G.add(mesh);
  }

  // --- colliders, use, solid (world coordinates) ---
  const c = Math.cos(facing), s = Math.sin(facing);
  const W = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const quarter = Math.abs(Math.sin(2 * facing)) < 1e-6;
  const rect = (lx, lz, hw, hd) => {
    if (quarter) {
      const [wx, wz] = W(lx, lz), swap = Math.abs(s) > 0.5;
      world.colliders.push({ box: true, x: wx, z: wz, hw: swap ? hd : hw, hd: swap ? hw : hd });
      return;
    }
    const r = 0.55, step = 0.8;
    const edge = (ax, az, bx, bz) => {
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
      for (let i = 0; i <= n; i++) { const [wx, wz] = W(ax + (bx - ax) * i / n, az + (bz - az) * i / n); world.colliders.push({ x: wx, z: wz, r }); }
    };
    edge(lx - hw, lz - hd, lx + hw, lz - hd); edge(lx + hw, lz - hd, lx + hw, lz + hd);
    edge(lx + hw, lz + hd, lx - hw, lz + hd); edge(lx - hw, lz + hd, lx - hw, lz - hd);
  };
  rect(HX, zc, HW + 0.25, D / 2 + 0.25);
  rect(wxc + 0.2, wzc, wl / 2 + 0.2, wd / 2 + 0.25);
  rect(HX, ZF + (PZ + 1.3) / 2, 2.1, (PZ + 1.3) / 2);
  for (const sx of [-1, 1]) { const [wx, wz] = W(HX + sx * 2.45, ZF + PZ + 1.0); world.colliders.push({ x: wx, z: wz, r: 0.55 }); }
  { const [wx, wz] = W(HX - 3.4, ZF + PZ + 1.4); world.colliders.push({ x: wx, z: wz, r: 0.3 }); }
  const [ux, uz] = W(HX, ZF + PZ + 1.7);
  world.use.push({ x: ux, z: uz, r: 1.6, label: 'Door', lines: ['OAK POKéMON RESEARCH LAB', 'The door is locked. PROF. OAK must be out!'] });
  world.solid.push(G);
  return G;
}
