// Signs of Pallet Town: a small family of sign types, all built as layered
// solid pieces (frames, recessed or raised panels, posts) with real thickness
// and gaps of 1.5 cm or more between faces, so no two faces ever share a
// plane. Lettering is painted into the panel's own texture (never a separate
// plane in front of it) with light and dark edges so it reads as raised.
//
//   welcomeSign   the town sign: wood frame with an arched crown, recessed
//                 slate panels, raised lettering, a rising-sun emblem
//   routeSign     a stout post with an arm and a hanging board
//   nameplate     small house / mailbox plates in several shapes with an icon
//   fingerpost    a post with pointed arrow boards (text on both faces)
//   labPlate      the lab's modern plate: steel frame, teal acrylic panel
//   noticeBoard   a small roofed board: chalkboard tips or a pinned info board
//
// Every builder returns a THREE.Group with its feet at the origin, facing +z
// (front), and userData.posts = [[x, z, r]] (local collider circles).
// Fonts: Lilita One and Fredoka (SIL OFL 1.1, fonts/OFL-*.txt).
import * as THREE from 'three';
import { toon } from './toon.js';

// ---------- fonts ----------
const FONT_DIR = new URL('./fonts/', import.meta.url);
async function loadFonts() {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  const list = [
    new FontFace('Lilita One', `url(${new URL('LilitaOne-Regular.ttf', FONT_DIR)})`),
    new FontFace('Fredoka', `url(${new URL('Fredoka-Variable.ttf', FONT_DIR)})`, { weight: '300 700' }),
  ];
  await Promise.all(list.map((f) => f.load().then((ff) => document.fonts.add(ff))));
}
export const fontsReady = Promise.race([loadFonts().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
await fontsReady;
const HEAD = '"Lilita One", "Pixelify Sans", system-ui, sans-serif';
const BODY = '"Fredoka", system-ui, sans-serif';

// ---------- materials ----------
const CEL = { deep: [0.56, 0.62, 0.82], shade: [0.74, 0.79, 0.94], lit: [1.06, 1.04, 0.98], bands: [0.1, 0.3, 0.58] };
// panels with lettering stay readable in shade: shallower shade bands
const PANEL = { deep: [0.72, 0.76, 0.9], shade: [0.84, 0.87, 0.97], lit: [1.04, 1.03, 0.99], bands: [0.1, 0.3, 0.58] };
const mats = new Map();
const memo = (k, make) => { if (!mats.has(k)) mats.set(k, make()); return mats.get(k); };
const flat = (col) => memo('f' + col, () => toon(col, { cel: CEL }));
const woodM = (col) => memo('w' + col, () => toon('#ffffff', { map: woodTex(col), cel: CEL }));
const panelM = (t) => toon('#ffffff', { map: t, cel: PANEL });

const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5 | 0, ((s ^ (s >>> 13)) >>> 0) / 4294967296)); }
const hash = (str) => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h);
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// warm wood with long grain, a few knots (texture = 1 x 1 m, grain along u)
const woodTexs = new Map();
function woodTex(col) {
  if (woodTexs.has(col)) return woodTexs.get(col);
  const t = canvasTex(512, 512, (x, w, h) => {
    const R = rng(hash(col));
    x.fillStyle = col; x.fillRect(0, 0, w, h);
    for (let b = 0; b < 7; b++) { x.globalAlpha = 0.12; x.fillStyle = shade(col, 0.86 + R() * 0.24); x.fillRect(0, R() * h, w, 20 + R() * 60); }
    x.globalAlpha = 1;
    for (let k = 0; k < 70; k++) {
      const y0 = R() * h, a = 2 + R() * 5, f = 0.004 + R() * 0.01, ph = R() * 6;
      x.strokeStyle = shade(col, 0.68 + R() * 0.12); x.globalAlpha = 0.2 + R() * 0.3; x.lineWidth = 0.8 + R() * 1.6;
      x.beginPath();
      for (let u = -10; u <= w + 10; u += 8) { const y = y0 + Math.sin(u * f + ph) * a; u < 0 ? x.moveTo(u, y) : x.lineTo(u, y); }
      x.stroke();
      // wrap the line so the texture tiles
      x.beginPath();
      for (let u = -10; u <= w + 10; u += 8) { const y = y0 - h + Math.sin(u * f + ph) * a; u < 0 ? x.moveTo(u, y) : x.lineTo(u, y); }
      x.stroke();
    }
    for (let k = 0; k < 3; k++) {
      const cx = 40 + R() * (w - 80), cy = 40 + R() * (h - 80);
      for (let r = 4; r > 0; r--) { x.globalAlpha = 0.25; x.strokeStyle = shade(col, 0.6); x.lineWidth = 1.5; x.beginPath(); x.ellipse(cx, cy, r * 6, r * 2.2, 0, 0, 6.28); x.stroke(); }
      x.globalAlpha = 0.5; x.fillStyle = shade(col, 0.55); x.beginPath(); x.ellipse(cx, cy, 4, 1.8, 0, 0, 6.28); x.fill();
    }
    x.globalAlpha = 1;
  }, true);
  woodTexs.set(col, t);
  return t;
}

// ---------- geometry ----------
// A shape pushed out along +z from z0 to z0 + depth, split into its front
// face, back face and side walls so each can take its own material. Fronts
// get UVs over their bounding box (0..1) for painted panels, or metres for
// wood; side walls get smooth normals round curves and hard ones at corners.
function extrudeParts(shape, depth, z0 = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 20 });
  g.translate(0, 0, z0);
  const P = g.attributes.position, U = g.attributes.uv;
  const sets = { front: [], back: [], side: [] };
  for (const gr of g.groups) for (let i = gr.start; i < gr.start + gr.count; i += 3) {
    let k = 'side';
    if (gr.materialIndex === 0) k = P.getZ(i) > z0 + depth / 2 ? 'front' : 'back';
    sets[k].push(i);
  }
  const out = {};
  for (const [k, list] of Object.entries(sets)) {
    const n = list.length * 3, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let j = 0;
    for (const s of list) for (let v = s; v < s + 3; v++, j++) {
      pos[j * 3] = P.getX(v); pos[j * 3 + 1] = P.getY(v); pos[j * 3 + 2] = P.getZ(v);
      uv[j * 2] = U.getX(v); uv[j * 2 + 1] = U.getY(v);
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (k === 'side') smoothNormals(ng, 40); else ng.computeVertexNormals();
    out[k] = ng;
  }
  g.dispose();
  return out;
}
// per-vertex normals: the average of the faces at that point within `deg`
function smoothNormals(g, deg) {
  const P = g.attributes.position, n = P.count, fn = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
    const f = b.sub(a).cross(c.sub(a)).normalize();
    fn.push(f.x, f.y, f.z);
  }
  const key = (i) => `${Math.round(P.getX(i) * 1e4)},${Math.round(P.getY(i) * 1e4)},${Math.round(P.getZ(i) * 1e4)}`;
  const at = new Map();
  for (let i = 0; i < n; i++) { const k = key(i); if (!at.has(k)) at.set(k, []); at.get(k).push(i); }
  const cos = Math.cos(deg * Math.PI / 180), N = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const f = Math.floor(i / 3) * 3; let x = 0, y = 0, z = 0;
    for (const j of at.get(key(i))) {
      const g2 = Math.floor(j / 3) * 3;
      if (fn[f] * fn[g2] + fn[f + 1] * fn[g2 + 1] + fn[f + 2] * fn[g2 + 2] >= cos) { x += fn[g2]; y += fn[g2 + 1]; z += fn[g2 + 2]; }
    }
    const l = Math.hypot(x, y, z) || 1; N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
}
// UVs of a flat face over its own bounding box (flip = seen from behind)
function boxUV(g, flip = false) {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox, P = g.attributes.position, U = g.attributes.uv;
  for (let i = 0; i < P.count; i++) {
    const u = (P.getX(i) - min.x) / (max.x - min.x), v = (P.getY(i) - min.y) / (max.y - min.y);
    U.setXY(i, flip ? 1 - u : u, v);
  }
  U.needsUpdate = true;
  return g;
}
const scaleUV = (g, s) => { const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * s, U.getY(i) * s); return g; };
function mesh(g, m, parent, { shadow = true } = {}) {
  const o = new THREE.Mesh(g, m); o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o;
}
// one solid piece: front (painted map, or wood), back, sides
//   face: texture for the front (box UVs) or a material
//   backFace: 'same' = the front's texture readable from behind, or a material
function slab(parent, shape, depth, z0, { face, back, side, woodCol, uvs = 1.6, backFace } = {}) {
  const p = extrudeParts(shape, depth, z0);
  const wood = woodCol ? woodM(woodCol) : null;
  const sideM = side ? (typeof side === 'string' ? flat(side) : side) : wood;
  if (wood) { scaleUV(p.side, uvs); }
  let frontM;
  if (face && face.isTexture) { boxUV(p.front); frontM = panelM(face); }
  else if (face) frontM = typeof face === 'string' ? flat(face) : face;
  else { scaleUV(p.front, uvs); frontM = wood; }
  let backM;
  if (backFace === 'same' && face && face.isTexture) { boxUV(p.back, true); backM = frontM; }
  else if (back) backM = typeof back === 'string' ? flat(back) : back;
  else if (wood) { scaleUV(p.back, uvs); backM = wood; }
  else backM = sideM;
  mesh(p.front, frontM, parent); mesh(p.back, backM, parent); mesh(p.side, sideM, parent);
  return p;
}
// boxes and cylinders (posts, arms, caps) with metric UVs for wood
function wuv(g, s = 1.6) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getY(i); v = p.getZ(i); }   // grain runs along the post
    else { u = p.getY(i); v = p.getX(i); }
    uv.setXY(i, u * s, v * s);
  }
  return g;
}
function post(parent, w, h, d, x, y, z, col, { wood = true } = {}) {
  const g = new THREE.BoxGeometry(w, h, d); if (wood) wuv(g);
  const o = mesh(g, wood ? woodM(col) : flat(col), parent); o.position.set(x, y, z); return o;
}
function cyl(parent, rt, rb, h, col, x, y, z, seg = 12) {
  const o = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), flat(col), parent); o.position.set(x, y, z); return o;
}
function ball(parent, r, col, x, y, z) {
  const o = mesh(new THREE.SphereGeometry(r, 14, 10), flat(col), parent); o.position.set(x, y, z); return o;
}
// shapes (metres)
function rrect(w, h, r, cx = 0, cy = 0, P = new THREE.Shape()) {
  const x0 = cx - w / 2, y0 = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  P.moveTo(x0 + r, y0); P.lineTo(x0 + w - r, y0); P.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  P.lineTo(x0 + w, y0 + h - r); P.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  P.lineTo(x0 + r, y0 + h); P.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  P.lineTo(x0, y0 + r); P.quadraticCurveTo(x0, y0, x0 + r, y0);
  return P;
}
function oval(w, h, cx = 0, cy = 0, P = new THREE.Shape()) { P.absellipse(cx, cy, w / 2, h / 2, 0, Math.PI * 2, false); return P; }
// a board with its corners cut off
function notched(w, h, c, cx = 0, cy = 0, P = new THREE.Shape()) {
  const x0 = cx - w / 2, y0 = cy - h / 2;
  P.moveTo(x0 + c, y0); P.lineTo(x0 + w - c, y0); P.lineTo(x0 + w, y0 + c); P.lineTo(x0 + w, y0 + h - c);
  P.lineTo(x0 + w - c, y0 + h); P.lineTo(x0 + c, y0 + h); P.lineTo(x0, y0 + h - c); P.lineTo(x0, y0 + c); P.lineTo(x0 + c, y0);
  return P;
}
// a little house: square body, pointed roof
function gable(w, h, roof, cx = 0, cy = 0, P = new THREE.Shape()) {
  const x0 = cx - w / 2, y0 = cy - h / 2, r = 0.02;
  P.moveTo(x0 + r, y0); P.lineTo(x0 + w - r, y0); P.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  P.lineTo(x0 + w, y0 + h - roof); P.lineTo(cx, y0 + h); P.lineTo(x0, y0 + h - roof);
  P.lineTo(x0, y0 + r); P.quadraticCurveTo(x0, y0, x0 + r, y0);
  return P;
}

// ---------- painting ----------
function font(x, size, fam = HEAD, weight = 400) { x.font = `${weight} ${Math.round(size)}px ${fam}`; }
// the largest size (<= size) at which the text fits maxW
function fit(x, text, size, maxW, fam = HEAD, weight = 400, spacing = 0) {
  for (let s = size; s > 6; s *= 0.95) {
    font(x, s, fam, weight); x.letterSpacing = `${(spacing * s).toFixed(1)}px`;
    if (x.measureText(text).width <= maxW) return s;
  }
  return 6;
}
// raised: a soft cast shadow, a dark lower edge, a light upper edge, the face
function raised(x, draw, { face, hi, lo, d = 3, shadow = 'rgba(10,14,20,.45)' }) {
  const pass = (dx, dy, col) => { x.save(); x.translate(dx, dy); draw(col, true); x.restore(); };
  if (shadow) pass(d * 1.1, d * 1.5, shadow);
  pass(d * 0.55, d * 0.7, lo);
  pass(-d * 0.4, -d * 0.5, hi);
  x.save(); draw(face, false); x.restore();
}
// text centred on (cx, cy) by its ink box
function textAt(x, text, cx, cy, col) {
  const m = x.measureText(text);
  x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = col;
  x.fillText(text, cx, cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
}
function raisedText(x, text, cx, cy, o) { raised(x, (col) => textAt(x, text, cx, cy, col), o); }
// a gradient face for raised wood/brass lettering
const faceGrad = (x, y0, y1, top, bot) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, top); g.addColorStop(1, bot); return g; };
function slateBase(x, w, h, col = '#2c3840', seed = 7) {
  const R = rng(seed);
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 60; k++) { x.globalAlpha = 0.025; x.fillStyle = R() < 0.5 ? '#ffffff' : '#000000'; x.beginPath(); x.ellipse(R() * w, R() * h, 40 + R() * 140, 10 + R() * 30, (R() - 0.5) * 0.4, 0, 6.28); x.fill(); }
  for (let k = 0; k < 1400; k++) { x.globalAlpha = 0.06; x.fillStyle = R() < 0.5 ? '#ffffff' : '#000000'; x.fillRect(R() * w, R() * h, 2, 2); }
  x.globalAlpha = 1;
  // a soft inner shadow from the frame above it (reads as recessed)
  const g = x.createLinearGradient(0, 0, 0, h * 0.18); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h * 0.18);
}
function paintBase(x, w, h, col, seed = 3, grain = 0.06) {
  const R = rng(seed);
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 40; k++) { x.globalAlpha = grain; x.fillStyle = R() < 0.5 ? '#ffffff' : shade(col, 0.7); x.fillRect(0, R() * h, w, 1 + R() * 3); }
  x.globalAlpha = 1;
}

// small icons in a box of size s round (cx, cy), one colour (+ detail)
function icon(x, kind, cx, cy, s, col, det) {
  x.save(); x.translate(cx, cy); x.scale(s / 2, s / 2); x.fillStyle = col; x.strokeStyle = det || col;
  const P = (pts) => { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fill(); };
  switch (kind) {
    case 'leaf':
      x.beginPath(); x.moveTo(-0.85, 0.75); x.bezierCurveTo(-0.9, -0.3, 0.1, -0.95, 0.9, -0.85); x.bezierCurveTo(0.85, 0.1, 0.2, 0.9, -0.85, 0.75); x.fill();
      if (det) { x.lineWidth = 0.12; x.beginPath(); x.moveTo(-0.7, 0.6); x.quadraticCurveTo(0.0, 0.0, 0.7, -0.65); x.stroke(); }
      break;
    case 'wave':
      x.lineWidth = 0.28; x.lineCap = 'round'; x.strokeStyle = col;
      for (const yy of [-0.3, 0.35]) { x.beginPath(); for (let u = -0.9; u <= 0.9; u += 0.05) { const y = yy + Math.sin(u * 5.2) * 0.18; u <= -0.89 ? x.moveTo(u, y) : x.lineTo(u, y); } x.stroke(); }
      break;
    case 'star': { const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.42 : 1, a = -Math.PI / 2 + i * Math.PI / 5; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } P(pts); break; }
    case 'sun':
      x.beginPath(); x.arc(0, 0, 0.48, 0, 6.28); x.fill();
      x.lineWidth = 0.16; x.lineCap = 'round'; x.strokeStyle = col;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; x.beginPath(); x.moveTo(Math.cos(a) * 0.66, Math.sin(a) * 0.66); x.lineTo(Math.cos(a) * 0.95, Math.sin(a) * 0.95); x.stroke(); }
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; x.beginPath(); x.ellipse(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.42, 0.3, a, 0, 6.28); x.fill(); }
      if (det) { x.fillStyle = det; } x.beginPath(); x.arc(0, 0, 0.28, 0, 6.28); x.fill();
      break;
    case 'heart':
      x.beginPath(); x.moveTo(0, 0.85); x.bezierCurveTo(-1.1, 0.0, -0.7, -0.95, 0, -0.4); x.bezierCurveTo(0.7, -0.95, 1.1, 0.0, 0, 0.85); x.fill();
      break;
    case 'fish':
      x.beginPath(); x.ellipse(-0.1, 0, 0.62, 0.38, 0, 0, 6.28); x.fill(); P([[0.4, 0], [0.95, -0.42], [0.95, 0.42]]);
      if (det) { x.fillStyle = det; x.beginPath(); x.arc(-0.42, -0.08, 0.08, 0, 6.28); x.fill(); }
      break;
    case 'wheat':
      x.lineWidth = 0.1; x.strokeStyle = col; x.beginPath(); x.moveTo(0, 0.95); x.lineTo(0, -0.7); x.stroke();
      for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(sd * 0.2, -0.55 + i * 0.32, 0.14, 0.26, sd * 0.5, 0, 6.28); x.fill(); }
      x.beginPath(); x.ellipse(0, -0.82, 0.12, 0.2, 0, 0, 6.28); x.fill();
      break;
    case 'house':
      P([[-0.8, 0], [0, -0.8], [0.8, 0], [0.62, 0], [0.62, 0.8], [-0.62, 0.8], [-0.62, 0]]);
      if (det) { x.fillStyle = det; x.fillRect(-0.16, 0.3, 0.32, 0.5); }
      break;
    case 'anchor':
      x.lineWidth = 0.17; x.lineCap = 'round'; x.strokeStyle = col;
      x.beginPath(); x.arc(0, -0.72, 0.17, 0, 6.28); x.stroke();
      x.beginPath(); x.moveTo(0, -0.55); x.lineTo(0, 0.85); x.moveTo(-0.38, -0.3); x.lineTo(0.38, -0.3); x.stroke();
      x.beginPath(); x.arc(0, 0.2, 0.68, 0.25, Math.PI - 0.25); x.stroke();
      break;
    case 'lab': {   // a hexagon with a sprouting leaf: an original research mark
      const pts = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; pts.push([Math.cos(a), Math.sin(a)]); }
      x.lineWidth = 0.14; x.strokeStyle = col; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a * 0.92, b * 0.92) : x.moveTo(a * 0.92, b * 0.92))); x.closePath(); x.stroke();
      x.beginPath(); x.moveTo(0, 0.55); x.lineTo(0, -0.05); x.stroke();
      x.beginPath(); x.moveTo(0, -0.05); x.bezierCurveTo(-0.05, -0.45, 0.3, -0.62, 0.55, -0.55); x.bezierCurveTo(0.5, -0.25, 0.25, -0.05, 0, -0.05); x.fill();
      x.beginPath(); x.moveTo(0, 0.12); x.bezierCurveTo(-0.05, -0.18, -0.35, -0.3, -0.5, -0.22); x.bezierCurveTo(-0.45, 0.02, -0.25, 0.12, 0, 0.12); x.fill();
      break;
    }
    case 'up': P([[0, -0.9], [0.8, 0.1], [0.3, 0.1], [0.3, 0.85], [-0.3, 0.85], [-0.3, 0.1], [-0.8, 0.1]]); break;
    case 'down': P([[0, 0.9], [0.8, -0.1], [0.3, -0.1], [0.3, -0.85], [-0.3, -0.85], [-0.3, -0.1], [-0.8, -0.1]]); break;
    case 'right': P([[0.9, 0], [-0.1, 0.8], [-0.1, 0.3], [-0.85, 0.3], [-0.85, -0.3], [-0.1, -0.3], [-0.1, -0.8]]); break;
    case 'dot': x.beginPath(); x.arc(0, 0, 0.6, 0, 6.28); x.fill(); break;
  }
  x.restore();
}
const raisedIcon = (x, kind, cx, cy, s, o, det) => raised(x, (col, edge) => icon(x, kind, cx, cy, s, col, edge ? null : det), o);

// ---------- 1. the town welcome sign ----------
// A wide wood frame with an arched crown, two recessed slate panels (2.2 cm
// below the frame's face), raised tan lettering and a rising-sun-over-the-
// sea emblem in the crown; two stout posts, stone feet and a flower box.
export function welcomeSign({ title = 'PALLET TOWN', sub = 'WHERE EVERY JOURNEY BEGINS', wood = '#c9965e', slate = '#2c3a41' } = {}) {
  const G = new THREE.Group(); G.userData.sign = 'welcome';
  const W = 2.6, H = 0.92, R = 0.07, CW = 1.24, CH = 0.4, M = 0.085, Y0 = 0.72, FD = 0.075, REC = 0.022;
  const B = new THREE.Group(); B.position.y = Y0; G.add(B);
  // outer outline: rounded body plus the crown arch, with a small shoulder
  const outer = () => {
    const P = new THREE.Shape(), x0 = -W / 2, x1 = W / 2;
    P.moveTo(x0 + R, 0); P.lineTo(x1 - R, 0); P.quadraticCurveTo(x1, 0, x1, R);
    P.lineTo(x1, H - R); P.quadraticCurveTo(x1, H, x1 - R, H);
    P.lineTo(CW / 2 + 0.06, H); P.quadraticCurveTo(CW / 2, H, CW / 2, H + 0.04);
    P.absellipse(0, H + 0.04, CW / 2, CH, 0, Math.PI, false);
    P.quadraticCurveTo(-CW / 2, H, -CW / 2 - 0.06, H);
    P.lineTo(x0 + R, H); P.quadraticCurveTo(x0, H, x0, H - R);
    P.lineTo(x0, R); P.quadraticCurveTo(x0, 0, x0 + R, 0);
    return P;
  };
  const mainHole = (e = 0) => rrect(W - 2 * M + 2 * e, H - 2 * M + 2 * e, 0.04 + e, 0, H / 2, new THREE.Path());
  const crownHole = (e = 0, P = new THREE.Path()) => {
    const cy = H + 0.04, rx = CW / 2 - M + e, ry = CH - M * 0.85 + e, yb = H - M + 0.1 - e;
    P.moveTo(rx, yb); P.lineTo(rx, cy); P.absellipse(0, cy, rx, ry, 0, Math.PI, false); P.lineTo(-rx, yb); P.lineTo(rx, yb);
    return P;
  };
  const frame = outer(); frame.holes.push(mainHole(), crownHole());
  slab(B, frame, FD, -FD / 2, { woodCol: wood });
  // the slate panels: 4 mm bigger than their holes (hidden in the frame),
  // set REC back from the frame's face and 1 cm short of its back
  const mainS = rrect(W - 2 * M + 0.008, H - 2 * M + 0.008, 0.044, 0, H / 2);
  const crownS = crownHole(0.004, new THREE.Shape());
  const zb = -FD / 2 + 0.01, zf = FD / 2 - REC;
  const pw = W - 2 * M, ph = H - 2 * M, ppm = 820;
  const mainT = canvasTex(pw * ppm, ph * ppm, (x, w, h) => {
    slateBase(x, w, h, slate, 11);
    const tan = { face: faceGrad(x, h * 0.18, h * 0.62, '#f3d29e', '#c38a52'), hi: '#fff3d6', lo: '#6b4526', d: 5 };
    // a thin raised rule inside the edge, broken at the corners by small studs
    raised(x, (col) => { x.strokeStyle = col; x.lineWidth = 5; x.strokeRect(26, 26, w - 52, h - 52); }, { ...tan, face: '#d9a96c', d: 2.5 });
    for (const [cx, cy] of [[26, 26], [w - 26, 26], [26, h - 26], [w - 26, h - 26]]) raisedIcon(x, 'dot', cx, cy, 26, { ...tan, face: '#e7bb7f', d: 2 });
    // the name
    fit(x, title, h * 0.4, w * 0.84, HEAD, 400, 0.06);
    raisedText(x, title, w / 2, h * 0.39, tan);
    // a wave line under it, with colour chips at each end
    const ry = h * 0.665, rx0 = w * 0.22, rx1 = w * 0.78;
    raised(x, (col) => {
      x.strokeStyle = col; x.lineWidth = 6; x.lineCap = 'round';
      x.beginPath(); x.moveTo(rx0, ry); x.lineTo(w / 2 - 70, ry); x.stroke();
      x.beginPath(); x.moveTo(w / 2 + 70, ry); x.lineTo(rx1, ry); x.stroke();
      x.beginPath(); for (let u = -60; u <= 60; u += 4) { const y = ry + Math.sin(u / 60 * Math.PI * 2) * 9; u === -60 ? x.moveTo(w / 2 + u, y) : x.lineTo(w / 2 + u, y); } x.stroke();
    }, { ...tan, face: '#ddb07a', d: 2.5 });
    const chips = [['#ef6b4a', '#f3c443', '#3fb3a8'], ['#7cc35a', '#5fa8e0', '#d0507a']];
    chips.forEach((set, sd) => set.forEach((col, i) => {
      const cx = sd ? rx1 + 28 + i * 34 : rx0 - 28 - i * 34;
      raised(x, (c) => { x.fillStyle = c; x.beginPath(); x.roundRect(cx - 12, ry - 9, 24, 18, 9); x.fill(); }, { face: col, hi: shade(col, 1.35), lo: shade(col, 0.55), d: 2.5 });
    }));
    // the line below
    fit(x, sub, h * 0.12, w * 0.7, BODY, 600, 0.12);
    raisedText(x, sub, w / 2, h * 0.83, { ...tan, face: '#e2b47c', d: 3 });
  });
  const crownT = canvasTex((CW - 2 * M) * ppm, (CH - M * 0.85 + 0.04 + M - 0.1) * ppm, (x, w, h) => {
    slateBase(x, w, h, slate, 23);
    const tan = { face: faceGrad(x, h * 0.1, h * 0.8, '#f3d29e', '#c38a52'), hi: '#fff3d6', lo: '#6b4526', d: 4 };
    // a sun rising behind two waves, three small birds
    const cx = w / 2, cy = h * 0.7, r = h * 0.34;
    raised(x, (col) => {
      x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, Math.PI, 0); x.closePath(); x.fill();
      x.strokeStyle = col; x.lineWidth = 9; x.lineCap = 'round';
      for (let i = 0; i < 9; i++) { const a = Math.PI + (i + 0.5) * Math.PI / 9; x.beginPath(); x.moveTo(cx + Math.cos(a) * (r + 18), cy + Math.sin(a) * (r + 18)); x.lineTo(cx + Math.cos(a) * (r + (i % 2 ? 40 : 56)), cy + Math.sin(a) * (r + (i % 2 ? 40 : 56))); x.stroke(); }
    }, tan);
    for (const [yy, amp, ww] of [[cy + 4, 9, 0.62], [cy + 34, 8, 0.5]]) {
      raised(x, (col) => {
        x.strokeStyle = col; x.lineWidth = 11; x.lineCap = 'round'; x.beginPath();
        for (let u = -ww / 2; u <= ww / 2 + 1e-6; u += 0.01) { const px = cx + u * w, py = yy + Math.sin(u * 40) * amp; u === -ww / 2 ? x.moveTo(px, py) : x.lineTo(px, py); }
        x.stroke();
      }, { ...tan, face: '#8fd0d6', hi: '#e4fbfb', lo: '#245a63', d: 3.5 });
    }
    for (const [bx, by, s] of [[0.2, 0.36, 1], [0.27, 0.27, 0.8], [0.79, 0.33, 0.9]]) {
      raised(x, (col) => { x.strokeStyle = col; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); const X = bx * w, Y = by * h, k = 22 * s; x.moveTo(X - k, Y); x.quadraticCurveTo(X - k / 2, Y - k * 0.6, X, Y); x.quadraticCurveTo(X + k / 2, Y - k * 0.6, X + k, Y); x.stroke(); }, { ...tan, d: 2.5 });
    }
  });
  slab(B, mainS, zf - zb, zb, { face: mainT, back: shade(slate, 0.8), side: shade(slate, 0.9) });
  slab(B, crownS, zf - zb, zb, { face: crownT, back: shade(slate, 0.8), side: shade(slate, 0.9) });
  // brass bolt heads on the frame (proud of its face by 1.5 cm)
  for (const [bx, by] of [[-W / 2 + M / 2, M / 2], [W / 2 - M / 2, M / 2], [-W / 2 + M / 2, H - M / 2], [W / 2 - M / 2, H - M / 2]]) {
    const b = cyl(B, 0.018, 0.022, 0.03, '#d8b25a', bx, by, FD / 2, 10); b.rotation.x = Math.PI / 2;
  }
  // posts behind the board, caps, stone feet, a flower box between them
  const PZ = -FD / 2 - 0.09;
  for (const sx of [-1, 1]) {
    const px = sx * (W / 2 - 0.42);
    post(G, 0.15, Y0 + H + 0.12, 0.15, px, (Y0 + H + 0.12) / 2, PZ, shade(wood, 0.82));
    post(G, 0.2, 0.05, 0.2, px, Y0 + H + 0.145, PZ, shade(wood, 0.7));
    cyl(G, 0.0, 0.1, 0.1, shade(wood, 0.7), px, Y0 + H + 0.22, PZ, 4).rotation.y = Math.PI / 4;
    post(G, 0.32, 0.22, 0.32, px, 0.08, PZ, '#cdc5b3', { wood: false });
  }
  const bx = W - 0.84 - 0.15 - 0.06;
  post(G, bx, 0.24, 0.3, 0, 0.12, PZ + 0.02, shade(wood, 0.95));
  post(G, bx - 0.04, 0.03, 0.26, 0, 0.245, PZ + 0.02, '#6b4a33', { wood: false });
  const FL = ['#ef6b4a', '#f3c443', '#f6f2e8', '#d0507a', '#5fa8e0'], Rf = rng(5);
  for (let i = 0; i < 9; i++) {
    const fx = -bx / 2 + 0.08 + i * (bx - 0.16) / 8, fz = PZ + 0.02 + (i % 2 ? 0.06 : -0.06);
    ball(G, 0.07, '#5d9a46', fx, 0.3, fz);
    ball(G, 0.04, FL[Math.floor(Rf() * FL.length)], fx + (Rf() - 0.5) * 0.04, 0.37, fz + 0.03);
  }
  G.userData.posts = [[-(W / 2 - 0.42), PZ, 0.3], [W / 2 - 0.42, PZ, 0.3], [0, PZ, 0.35]];
  return G;
}

// ---------- 2. route sign ----------
// A tall post with an arm; the board hangs from two rods: a wood board with a
// raised painted panel (1.6 cm proud), a route badge and the destinations.
export function routeSign({ num = '1', north = 'VIRIDIAN CITY', south = 'PALLET TOWN', panel = '#2f6b52', wood = '#b98552' } = {}) {
  const G = new THREE.Group(); G.userData.sign = 'route';
  const BW = 1.36, BH = 0.6, BD = 0.05, TOP = 2.55, ARM = 1.0, PX = -0.78;
  post(G, 0.17, TOP, 0.17, PX, TOP / 2, 0, shade(wood, 0.85));
  cyl(G, 0.0, 0.13, 0.14, shade(wood, 0.62), PX, TOP + 0.07, 0, 4).rotation.y = Math.PI / 4;
  post(G, 0.32, 0.18, 0.32, PX, 0.06, 0, '#cdc5b3', { wood: false });
  const ay = TOP - 0.2;
  post(G, ARM + 0.12, 0.11, 0.11, PX + ARM / 2 + 0.06, ay, 0, shade(wood, 0.85));
  // a diagonal brace
  const br = post(G, 0.07, 0.5, 0.07, PX + 0.24, ay - 0.2, 0, shade(wood, 0.8)); br.rotation.z = -0.8;
  const cy = ay - 0.06 - 0.16 - BH / 2, cx = PX + ARM / 2 + 0.12;
  for (const sx of [-1, 1]) { cyl(G, 0.012, 0.012, 0.18, '#3a3a40', cx + sx * BW * 0.36, ay - 0.06 - 0.09, 0, 6); }
  const B = new THREE.Group(); B.position.set(cx, cy, 0); G.add(B);
  slab(B, rrect(BW, BH, 0.06), BD, -BD / 2, { woodCol: wood });
  const PW = BW - 0.1, PH = BH - 0.1, ppm = 900;
  const T = canvasTex(PW * ppm, PH * ppm, (x, w, h) => {
    paintBase(x, w, h, panel, 9, 0.05);
    const cream = { face: '#f6edd3', hi: '#ffffff', lo: shade(panel, 0.45), d: 3.5, shadow: 'rgba(0,0,0,.35)' };
    // route badge: a rounded shield with the number
    const bw = h * 0.62, bx = h * 0.12, by = h * 0.17, bh = h * 0.66;
    const badge = (col) => { x.fillStyle = col; x.beginPath(); x.moveTo(bx, by + 20); x.quadraticCurveTo(bx, by, bx + 20, by); x.lineTo(bx + bw - 20, by); x.quadraticCurveTo(bx + bw, by, bx + bw, by + 20); x.lineTo(bx + bw, by + bh * 0.62); x.quadraticCurveTo(bx + bw, by + bh * 0.86, bx + bw / 2, by + bh); x.quadraticCurveTo(bx, by + bh * 0.86, bx, by + bh * 0.62); x.closePath(); x.fill(); };
    raised(x, badge, cream);
    font(x, bh * 0.62, HEAD); x.letterSpacing = '0px'; textAt(x, num, bx + bw / 2, by + bh * 0.45, panel);
    const tx = bx + bw + h * 0.12, tw = w - tx - h * 0.08;
    fit(x, `ROUTE ${num}`, h * 0.36, tw, HEAD, 400, 0.05);
    x.textAlign = 'left';
    const head = `ROUTE ${num}`;
    raised(x, (col) => { const m = x.measureText(head); x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillStyle = col; x.fillText(head, tx, h * 0.27 + m.actualBoundingBoxAscent / 2); }, cream);
    // a thin rule, then the two ways
    raised(x, (col) => { x.fillStyle = col; x.fillRect(tx, h * 0.48, tw, 5); }, { ...cream, d: 2 });
    const row = (kind, label, yy, col) => {
      raisedIcon(x, kind, tx + h * 0.07, yy, h * 0.13, { ...cream, face: col, d: 2.5 });
      fit(x, label, h * 0.13, tw - h * 0.2, BODY, 600, 0.06);
      raised(x, (c) => { const m = x.measureText(label); x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillStyle = c; x.fillText(label, tx + h * 0.18, yy + m.actualBoundingBoxAscent / 2); }, { ...cream, d: 2.5 });
    };
    row('up', north, h * 0.64, '#f3c443');
    row('down', south, h * 0.84, '#ef8a5a');
  });
  slab(B, rrect(PW, PH, 0.04), 0.016, BD / 2, { face: T, side: shade(panel, 0.8) });
  // the back carries the same panel (readable from the other side)
  slab(B, rrect(PW, PH, 0.04), 0.016, -BD / 2 - 0.016, { face: shade(panel, 0.8), back: panelM(T), side: shade(panel, 0.8) });
  // fix the back panel's UVs so the lettering reads from behind
  { const back = B.children[B.children.length - 2]; boxUV(back.geometry, true); }
  G.userData.posts = [[PX, 0, 0.3]];
  return G;
}

// ---------- 3. house nameplates ----------
// Small plates (about 0.5 m): a wood backing piece and a painted face piece
// 1.6 cm proud of it, in one of several shapes, with a small icon.
const PLATE = {
  RED: { shape: 'rrect', face: '#f6efe0', ink: '#c8473a', icon: 'star' },
  BLUE: { shape: 'oval', face: '#2f6f9a', ink: '#f6efe0', icon: 'wave' },
  HOLLIS: { shape: 'notched', face: '#f2e3c2', ink: '#5a7a4a', icon: 'leaf' },
  'GRANNY MAE': { shape: 'house', face: '#f9e1e4', ink: '#b8405a', icon: 'heart' },
  MARINA: { shape: 'oval', face: '#eaf4f7', ink: '#3d6fa8', icon: 'fish' },
  'FARMER BEN': { shape: 'notched', face: '#e7d9a8', ink: '#7a4f2c', icon: 'wheat' },
  'OLD TOM': { shape: 'rrect', face: '#3f5f45', ink: '#f2e6c6', icon: 'sun' },
  LILY: { shape: 'house', face: '#fff6ea', ink: '#e07a3a', icon: 'flower' },
  BOATHOUSE: { shape: 'notched', face: '#f4efe2', ink: '#2f5f8a', icon: 'anchor' },
};
export function nameplate(name, { shape, face, ink, icon: ic, w, h = 0.2, wood = '#a7774a' } = {}) {
  const st = PLATE[name] || {};
  w = w || Math.min(0.66, Math.max(0.44, 0.3 + 0.034 * name.length));
  const kinds = ['rrect', 'oval', 'notched', 'house'], icons = ['star', 'leaf', 'flower', 'sun', 'wave', 'heart'];
  shape = shape || st.shape || kinds[hash(name) % kinds.length];
  face = face || st.face || '#f6efe0'; ink = ink || st.ink || '#4a3524'; ic = ic || st.icon || icons[hash(name + 'i') % icons.length];
  if (shape === 'oval') { w *= 1.05; h *= 1.25; }
  if (shape === 'house') h *= 1.35;
  const G = new THREE.Group(); G.userData.sign = 'plate:' + name;
  const mk = (ww, hh) => shape === 'oval' ? oval(ww, hh) : shape === 'notched' ? notched(ww, hh, Math.min(ww, hh) * 0.2) : shape === 'house' ? gable(ww, hh, hh * 0.32) : rrect(ww, hh, Math.min(ww, hh) * 0.28);
  const e = 0.032, BD = 0.022, FD = 0.016;
  slab(G, mk(w + 2 * e, h + 2 * e), BD, 0, { woodCol: wood });
  const ppm = 1100;
  const T = canvasTex(w * ppm, h * ppm, (x, W, H) => {
    paintBase(x, W, H, face, hash(name), 0.05);
    const o = { face: ink, hi: shade(ink, 1.6), lo: shade(ink, 0.45), d: 2.5, shadow: 'rgba(0,0,0,.28)' };
    // a painted rim band inside the edge
    x.save(); x.strokeStyle = shade(face, 0.82); x.lineWidth = 10;
    if (shape === 'oval') { x.beginPath(); x.ellipse(W / 2, H / 2, W / 2 - 16, H / 2 - 16, 0, 0, 6.28); x.stroke(); }
    else if (shape === 'house') { x.strokeRect(16, H * 0.34, W - 32, H * 0.66 - 16); }
    else { x.beginPath(); x.roundRect(14, 14, W - 28, H - 28, 18); x.stroke(); }
    x.restore();
    const top = shape === 'house' ? H * 0.32 : 0, mid = (top + H) / 2 + (shape === 'house' ? -4 : 0);
    const isz = (H - top) * 0.5, left = shape === 'oval' ? W * 0.17 : W * 0.12;
    raisedIcon(x, ic, left + isz / 2, mid, isz, o, shade(face, 0.95));
    if (shape === 'house') raisedIcon(x, 'dot', W / 2, H * 0.2, H * 0.08, o);
    const tx0 = left + isz + W * 0.03, tw = W - tx0 - (shape === 'oval' ? W * 0.12 : W * 0.06);
    fit(x, name, (H - top) * 0.52, tw, HEAD, 400, 0.04);
    raisedText(x, name, tx0 + tw / 2, mid, o);
  });
  slab(G, mk(w, h), FD, BD, { face: T, side: shade(face, 0.85) });
  // two screw heads on the backing, left and right
  if (shape !== 'house') for (const sx of [-1, 1]) { const s = cyl(G, 0.01, 0.01, 0.02, '#b8b2a2', sx * (w / 2 + e / 2), 0, BD + 0.004, 8); s.rotation.x = Math.PI / 2; }
  G.userData.size = [w + 2 * e, h + 2 * e];
  return G;
}

// ---------- 4. fingerpost ----------
// A post with a cap and finial; each arm is a painted plank with a coloured
// arrow tip, lettered on both faces (the back reads correctly too).
const TIPS = ['#e85a4a', '#3fa7a0', '#f0b13a', '#6aa84f', '#5b86d6'];
export function fingerpost(arms, { wood = '#9a6b42', plank = '#f3e7cb', ink = '#2f4a52' } = {}) {
  const G = new THREE.Group(); G.userData.sign = 'finger';
  const H = 2.3, PW = 0.13;
  post(G, PW, H, PW, 0, H / 2, 0, shade(wood, 0.9));
  post(G, 0.19, 0.05, 0.19, 0, H + 0.025, 0, shade(wood, 0.75));
  ball(G, 0.075, '#e8c15a', 0, H + 0.12, 0);
  post(G, 0.26, 0.16, 0.26, 0, 0.05, 0, '#cdc5b3', { wood: false });
  // one letter size for every arm: the size the longest label fits at
  const ppm = 700, AH = 0.21, Ls = arms.map(([l]) => Math.min(1.08, Math.max(0.72, 0.4 + 0.062 * l.length)));
  const meas = document.createElement('canvas').getContext('2d');
  const size = Math.min(...arms.map(([l], i) => fit(meas, l.toUpperCase(), AH * ppm * 0.62, Ls[i] * ppm * 0.84, HEAD, 400, 0.05)));
  arms.forEach(([label, ang], i) => {
    const A = new THREE.Group(); A.position.y = H - 0.3 - i * 0.29; A.rotation.y = ang - Math.PI / 2; G.add(A);
    const L = Ls[i], D = 0.045, TL = 0.16, x0 = PW / 2 + 0.005;
    const plankS = new THREE.Shape();
    plankS.moveTo(x0, -AH / 2); plankS.lineTo(x0 + L, -AH / 2); plankS.lineTo(x0 + L, AH / 2); plankS.lineTo(x0, AH / 2); plankS.lineTo(x0, -AH / 2);
    const T = canvasTex(L * ppm, AH * ppm, (x, w, h) => {
      paintBase(x, w, h, plank, hash(label), 0.06);
      x.fillStyle = shade(plank, 0.86); x.fillRect(0, 0, w, 7); x.fillRect(0, h - 7, w, 7);
      const o = { face: ink, hi: shade(ink, 1.9), lo: shade(ink, 0.4), d: 2.5, shadow: 'rgba(0,0,0,.25)' };
      font(x, size, HEAD); x.letterSpacing = `${(0.05 * size).toFixed(1)}px`;
      raisedText(x, label.toUpperCase(), w / 2, h / 2 + 1, o);
    });
    slab(A, plankS, D, -D / 2, { face: T, backFace: 'same', side: shade(plank, 0.8) });
    // the arrow tip, a little thicker than the plank (proud by 5 mm a side)
    const tip = new THREE.Shape(), TD = D + 0.01;
    tip.moveTo(x0 + L, -AH / 2 - 0.02); tip.lineTo(x0 + L + TL, 0); tip.lineTo(x0 + L, AH / 2 + 0.02); tip.lineTo(x0 + L, -AH / 2 - 0.02);
    slab(A, tip, TD, -TD / 2, { face: TIPS[i % TIPS.length], side: shade(TIPS[i % TIPS.length], 0.8) });
    // a band clamping the plank to the post
    post(A, 0.04, AH + 0.03, D + 0.016, x0 + 0.03, 0, 0, '#5a5650', { wood: false });
  });
  G.userData.posts = [[0, 0, 0.22]];
  return G;
}

// ---------- 5. the lab's plate ----------
// Modern: a brushed steel frame, a teal acrylic panel 1.8 cm proud of it,
// clean white lettering and the research mark; mount 'wall' (standoffs
// behind), 'top' (two feet below, to stand on a canopy) or 'posts' (two slim
// steel posts to the ground, with a second line).
export function labPlate(text = 'OAK POKéMON RESEARCH LAB', { w = 3.0, h = 0.5, mount = 'wall', line2 = '', height = 1.0, panel = '#1f8a86' } = {}) {
  const G = new THREE.Group(); G.userData.sign = 'lab';
  const B = new THREE.Group(); G.add(B);
  const FD = 0.03, e = 0.045;
  const steel = canvasTex(256, 256, (x, W, H) => { const R = rng(4); x.fillStyle = '#c9d0d2'; x.fillRect(0, 0, W, H); for (let k = 0; k < 160; k++) { x.globalAlpha = 0.08; x.fillStyle = R() < 0.5 ? '#ffffff' : '#7a8487'; x.fillRect(0, R() * H, W, 1); } x.globalAlpha = 1; }, true);
  const steelM = memo('steel', () => toon('#ffffff', { map: steel, cel: CEL }));
  slab(B, rrect(w + 2 * e, h + 2 * e, 0.07), FD, 0, { face: steelM, back: steelM, side: flat('#aab3b6') });
  const ppm = 700;
  const T = canvasTex(w * ppm, h * ppm, (x, W, H) => {
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, shade(panel, 1.18)); g.addColorStop(1, shade(panel, 0.86));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // a glossy sheen across the top and a slim light line
    x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(0, 0, W, H * 0.4);
    x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(H * 0.12, H * 0.84, W - H * 0.24, 3);
    const o = { face: '#ffffff', hi: '#ffffff', lo: shade(panel, 0.45), d: 2, shadow: 'rgba(0,30,30,.35)' };
    const isz = H * (line2 ? 0.5 : 0.62);
    raisedIcon(x, 'lab', H * 0.18 + isz / 2, H * (line2 ? 0.36 : 0.47), isz, o);
    const tx0 = H * 0.3 + isz, tw = W - tx0 - H * 0.2;
    fit(x, text, H * (line2 ? 0.3 : 0.44), tw, BODY, 700, 0.04);
    raisedText(x, text, tx0 + tw / 2, H * (line2 ? 0.36 : 0.47), o);
    if (line2) { fit(x, line2, H * 0.17, tw, BODY, 500, 0.06); raisedText(x, line2, tx0 + tw / 2, H * 0.68, { ...o, face: '#d9f3ef' }); }
  });
  slab(B, rrect(w, h, 0.05), 0.018, FD, { face: T, side: shade(panel, 0.75) });
  if (mount === 'wall') {
    B.position.z = 0.03;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const s = cyl(G, 0.016, 0.016, 0.035, '#8d9699', sx * (w / 2 + e * 0.5), sy * (h / 2 + e * 0.5), 0.015, 10); s.rotation.x = Math.PI / 2; }
  } else if (mount === 'top') {
    // two short feet under the plate (its centre is at y = 0); the feet end
    // at y = -(h/2 + e + 0.03), which the caller sets on the ledge
    for (const sx of [-1, 1]) post(G, 0.16, 0.035, 0.05, sx * w * 0.32, -h / 2 - e - 0.0125, FD / 2, '#8d9699', { wood: false });
  } else {
    B.position.y = height;
    for (const sx of [-1, 1]) {
      cyl(G, 0.035, 0.035, height + h / 2, '#8d9699', sx * (w / 2 - 0.12), (height + h / 2) / 2, -0.04, 12);
      cyl(G, 0.07, 0.08, 0.06, '#7a8285', sx * (w / 2 - 0.12), 0.03, -0.04, 12);
    }
    G.userData.posts = [[-(w / 2 - 0.12), -0.04, 0.15], [w / 2 - 0.12, -0.04, 0.15]];
  }
  return G;
}

// ---------- 6. notice boards ----------
// A framed board on two legs under a little plank roof. style 'chalk' = a
// green chalkboard with chalk lines and doodles; 'pinned' = a painted board
// with paper notes and coloured pins.
export function noticeBoard(title, lines, { style = 'chalk', frame = '#8a5a3a', roof = '#c4553a', accent = '#3fa7a0' } = {}) {
  const G = new THREE.Group(); G.userData.sign = 'board:' + title;
  const W = 1.3, H = 0.86, Y0 = 0.82, FD = 0.06, M = 0.07, REC = 0.02;
  const B = new THREE.Group(); B.position.y = Y0; G.add(B);
  const fr = rrect(W, H, 0.04, 0, H / 2); fr.holes.push(rrect(W - 2 * M, H - 2 * M, 0.02, 0, H / 2, new THREE.Path()));
  slab(B, fr, FD, -FD / 2, { woodCol: frame });
  const PW = W - 2 * M, PH = H - 2 * M, ppm = 900;
  const T = canvasTex(PW * ppm, PH * ppm, (x, w, h) => {
    const R = rng(hash(title));
    if (style === 'chalk') {
      slateBase(x, w, h, '#2f4f40', 31);
      // smudges of old chalk
      for (let k = 0; k < 14; k++) { x.globalAlpha = 0.05; x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(R() * w, R() * h, 60 + R() * 120, 14 + R() * 20, R() - 0.5, 0, 6.28); x.fill(); }
      x.globalAlpha = 1;
      const chalk = (col) => ({ face: col, hi: 'rgba(255,255,255,.0)', lo: 'rgba(0,0,0,.0)', d: 0, shadow: null });
      fit(x, title, h * 0.17, w * 0.8, HEAD, 400, 0.08);
      raisedText(x, title, w / 2, h * 0.15, chalk('#fff4d6'));
      x.strokeStyle = '#f3c443'; x.lineWidth = 5; x.lineCap = 'round';
      x.beginPath(); for (let u = 0.2; u <= 0.8; u += 0.01) { const px = u * w, py = h * 0.27 + Math.sin(u * 50) * 4; u === 0.2 ? x.moveTo(px, py) : x.lineTo(px, py); } x.stroke();
      const cols = ['#9ee0d8', '#ffd27a', '#ffb3a6', '#c8e6a0'];
      lines.forEach((l, i) => {
        const yy = h * (0.43 + i * 0.19);
        icon(x, 'star', w * 0.07, yy, h * 0.08, cols[i % cols.length]);
        fit(x, l, h * 0.11, w * 0.84, BODY, 600, 0.01);
        x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(250,248,240,.92)'; x.fillText(l, w * 0.12, yy);
      });
      // chalk tray dust
      x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(0, h - 10, w, 10);
    } else {
      paintBase(x, w, h, '#f1e4c4', 41, 0.05);
      // a header ribbon
      raised(x, (c) => { x.fillStyle = c; x.beginPath(); x.roundRect(w * 0.06, h * 0.05, w * 0.88, h * 0.22, 18); x.fill(); }, { face: accent, hi: shade(accent, 1.4), lo: shade(accent, 0.5), d: 3, shadow: 'rgba(0,0,0,.25)' });
      fit(x, title, h * 0.15, w * 0.78, HEAD, 400, 0.08);
      raisedText(x, title, w / 2, h * 0.16, { face: '#ffffff', hi: '#ffffff', lo: shade(accent, 0.4), d: 2, shadow: null });
      const papers = ['#ffffff', '#fff3b8', '#e1f3ff', '#ffe1e6'], pins = ['#e85a4a', '#3f7fd6', '#f0b13a', '#6aa84f'];
      lines.forEach((l, i) => {
        const yy = h * (0.42 + i * 0.19), rot = (R() - 0.5) * 0.05;
        x.save(); x.translate(w / 2, yy); x.rotate(rot);
        x.fillStyle = 'rgba(60,40,20,.22)'; x.fillRect(-w * 0.44 + 6, -h * 0.08 + 7, w * 0.88, h * 0.16);
        x.fillStyle = papers[i % papers.length]; x.fillRect(-w * 0.44, -h * 0.08, w * 0.88, h * 0.16);
        fit(x, l, h * 0.105, w * 0.78, BODY, 600, 0.01);
        x.fillStyle = '#3b3530'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(l, 0, 2);
        x.restore();
        raisedIcon(x, 'dot', w / 2 - w * 0.4, yy - h * 0.05, 22, { face: pins[i % pins.length], hi: '#ffffff', lo: shade(pins[i % pins.length], 0.5), d: 2 });
      });
    }
  });
  const zb = -FD / 2 + 0.01, zf = FD / 2 - REC;
  slab(B, rrect(PW + 0.008, PH + 0.008, 0.024, 0, H / 2), zf - zb, zb, { face: T, back: '#5a4a3a', side: '#5a4a3a' });
  // a chalk tray / ledge under the board
  post(B, W * 0.8, 0.03, 0.09, 0, -0.015, 0.02, shade(frame, 0.9));
  // legs and the little roof
  const LZ = -FD / 2 - 0.06, LH = Y0 + H + 0.22;
  for (const sx of [-1, 1]) post(G, 0.09, LH, 0.09, sx * (W / 2 - 0.12), LH / 2, LZ, shade(frame, 0.9));
  post(G, W - 0.1, 0.07, 0.07, 0, Y0 + H + 0.16, LZ, shade(frame, 0.85));
  const rw = W + 0.36, rs = 0.3, rt = Y0 + H + 0.32;
  for (const sz of [-1, 1]) {
    const r = post(G, rw, 0.035, rs, 0, rt - 0.06, LZ + sz * rs * 0.43, roof, { wood: false });
    r.rotation.x = sz * 0.52;
  }
  post(G, rw + 0.02, 0.05, 0.06, 0, rt + 0.02, LZ, shade(roof, 0.75), { wood: false });
  G.userData.posts = [[-(W / 2 - 0.12), LZ, 0.18], [W / 2 - 0.12, LZ, 0.18]];
  return G;
}
