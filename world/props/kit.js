// The shared kit for interiors and props: painted canvas textures, cel
// materials, and small mesh builders. Every builder adds a mesh to a parent
// group and returns it; positions are the mesh's centre unless noted.
//
// Material names carry what the native game needs (tools/native/bake_interior.mjs
// keeps them): 'glow' = unshaded and added on top (lamps, light pools),
// 'unlit' = unshaded and opaque (screens, the views out of the windows,
// glowing fluids). Everything else is cel shaded with the space's palette.
// mesh.userData.outline = false keeps a mesh out of the ink (floors, ceilings,
// light pools); userData.noShadow = no shadow casting (walls, vaults, glass).
import * as THREE from 'three';
import { toon } from '../toon.js';
import { fontsReady } from '../signs.js';

await fontsReady;
export const HEAD = '"Lilita One", "Pixelify Sans", system-ui, sans-serif';
export const BODY = '"Fredoka", system-ui, sans-serif';

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hash = (str) => { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
export const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
export const mixc = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

// ---------- painted textures (cached by key) ----------
const texCache = new Map();
export function paint(key, w, h, draw, { repeat = true } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h, rng(hash(key)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.name = key;
  texCache.set(key, t);
  return t;
}

// ---------- materials ----------
// the space's cel palette (interior.js sets it from the blueprint's lights.palette)
export const CEL = { bands: [0.02, 0.12, 0.6], deep: [0.78, 0.76, 0.92], shade: [0.87, 0.86, 0.97], lit: [1.05, 1.03, 0.97], litAdd: [0.03, 0.025, 0] };
export function setPalette(p) { if (p) for (const k of Object.keys(CEL)) if (p[k]) CEL[k] = p[k]; mats.clear(); }
const mats = new Map();
const memo = (k, make) => { if (!mats.has(k)) mats.set(k, make()); return mats.get(k); };
export const flat = (col, o = {}) => memo('f' + col + (o.side || ''), () => toon(col, { cel: CEL, side: o.side }));
export const texm = (t, col = '#ffffff', o = {}) => memo('t' + t.uuid + col + (o.side || ''), () => toon(col, { map: t, cel: CEL, side: o.side }));
export const unlit = (t, col = '#ffffff') => memo('u' + (t ? t.uuid : '') + col, () => { const m = new THREE.MeshBasicMaterial({ map: t || null, color: col }); m.name = 'unlit'; return m; });
export const glow = (t, col = '#ffffff', opacity = 1) => memo('g' + (t ? t.uuid : '') + col + opacity, () => {
  const m = new THREE.MeshBasicMaterial({ map: t || null, color: col, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  m.name = 'glow'; return m;
});
const asMat = (m) => (typeof m === 'string' ? flat(m) : m);

// UVs in metres, projected along each face's main axis (s = repeats per metre)
export function wuv(g, s = 0.5) {
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

// ---------- mesh builders ----------
export function put(mesh, parent, x = 0, y = 0, z = 0, o = {}) {
  mesh.position.set(x, y, z);
  if (o.rx || o.ry || o.rz) mesh.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'YXZ');
  mesh.castShadow = !o.noShadow; mesh.receiveShadow = true;
  if (o.line === false) mesh.userData.outline = false;
  if (o.noShadow) mesh.userData.noShadow = true;
  parent.add(mesh);
  return mesh;
}
export function box(parent, w, h, d, m, x, y, z, o = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (o.uv !== undefined) wuv(g, o.uv);
  return put(new THREE.Mesh(g, asMat(m)), parent, x, y, z, o);
}
// a box standing on y (its bottom at y)
export const block = (parent, w, h, d, m, x, y, z, o) => box(parent, w, h, d, m, x, y + h / 2, z, o);
export function cyl(parent, rt, rb, h, m, x, y, z, o = {}) {
  const g = new THREE.CylinderGeometry(rt, rb, h, o.seg || 16, 1, !!o.open);
  if (o.uv !== undefined) wuv(g, o.uv);
  return put(new THREE.Mesh(g, asMat(m)), parent, x, y, z, o);
}
export function sphere(parent, r, m, x, y, z, o = {}) {
  const g = new THREE.SphereGeometry(r, o.seg || 16, o.rings || 10, 0, Math.PI * 2, 0, o.theta || Math.PI);
  return put(new THREE.Mesh(g, asMat(m)), parent, x, y, z, o);
}
export function torus(parent, R, r, m, x, y, z, o = {}) {
  return put(new THREE.Mesh(new THREE.TorusGeometry(R, r, o.rs || 8, o.ts || 24, o.arc || Math.PI * 2), asMat(m)), parent, x, y, z, o);
}
export function lathe(parent, prof, m, x, y, z, o = {}) {
  const g = new THREE.LatheGeometry(prof.map(([r, yy]) => new THREE.Vector2(r, yy)), o.seg || 24);
  return put(new THREE.Mesh(g, asMat(m)), parent, x, y, z, o);
}
// a plane facing +z (w x h)
export function plane(parent, w, h, m, x, y, z, o = {}) {
  return put(new THREE.Mesh(new THREE.PlaneGeometry(w, h), asMat(m)), parent, x, y, z, { noShadow: true, ...o });
}
// a 2D shape (THREE.Shape in x/y) extruded along +z by depth, front face at z = depth
export function extrude(parent, shape, depth, m, x, y, z, o = {}) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: o.curve || 12 });
  if (o.uv !== undefined) wuv(g, o.uv);
  return put(new THREE.Mesh(g, asMat(m)), parent, x, y, z, o);
}
// a cylinder between two points (pipes, rods, legs)
export function rod(parent, a, b, r, m, o = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, o.r2 ?? r, len, o.seg || 10, 1, !!o.open);
  const mesh = new THREE.Mesh(g, asMat(m));
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  mesh.castShadow = !o.noShadow; mesh.receiveShadow = true;
  if (o.line === false) mesh.userData.outline = false;
  parent.add(mesh);
  return mesh;
}
export function roundRect(w, h, r, cx = 0, cy = 0, path = new THREE.Shape()) {
  const x0 = cx - w / 2, y0 = cy - h / 2;
  path.moveTo(x0 + r, y0); path.lineTo(x0 + w - r, y0); path.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  path.lineTo(x0 + w, y0 + h - r); path.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  path.lineTo(x0 + r, y0 + h); path.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  path.lineTo(x0, y0 + r); path.quadraticCurveTo(x0, y0, x0 + r, y0);
  return path;
}

// ---------- common painted surfaces ----------
export const plaster = (col) => paint('plaster' + col, 256, 256, (x, w, h, R) => {
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 50; k++) { x.globalAlpha = 0.06; x.fillStyle = R() < 0.5 ? '#fffbea' : shade(col, 0.86); x.beginPath(); x.arc(R() * w, R() * h, 8 + R() * 34, 0, 6.28); x.fill(); }
  x.globalAlpha = 0.06; x.fillStyle = shade(col, 0.85);
  for (let k = 0; k < 26; k++) x.fillRect(R() * w, R() * h, 1.2, 6 + R() * 22);
  x.globalAlpha = 1;
});
// vertical planks with grooves (u along the board, 1 texture = 2 m)
export const planks = (col, n = 8) => paint('planks' + col + n, 256, 256, (x, w, h, R) => {
  const bw = w / n;
  for (let k = 0; k < n; k++) {
    x.fillStyle = shade(col, 0.92 + R() * 0.14); x.fillRect(k * bw, 0, bw, h);
    x.fillStyle = shade(col, 0.66); x.fillRect(k * bw + bw - 2, 0, 2, h);
    x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(k * bw, 0, 1.5, h);
    x.globalAlpha = 0.22; x.fillStyle = shade(col, 0.7);
    for (let j = 0; j < 5; j++) x.fillRect(k * bw + 3 + R() * (bw - 6), R() * h, 1.2, 30 + R() * 90);
    x.globalAlpha = 1;
  }
});
// wood with long grain along u (1 texture = 1 m)
export const wood = (col) => paint('wood' + col, 256, 128, (x, w, h, R) => {
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 40; k++) {
    x.globalAlpha = 0.12 + R() * 0.12; x.strokeStyle = R() < 0.6 ? shade(col, 0.78) : shade(col, 1.14); x.lineWidth = 1 + R() * 2;
    const y0 = R() * h; x.beginPath(); x.moveTo(0, y0);
    for (let u = 0; u <= w; u += 16) x.lineTo(u, y0 + Math.sin(u * 0.02 + k) * (2 + R() * 3));
    x.stroke();
  }
  x.globalAlpha = 1;
});
export const metal = (col) => paint('metal' + col, 128, 128, (x, w, h, R) => {
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  x.globalAlpha = 0.08;
  for (let k = 0; k < 30; k++) { x.fillStyle = R() < 0.5 ? '#ffffff' : shade(col, 0.7); x.fillRect(0, R() * h, w, 1 + R()); }
  x.globalAlpha = 1;
});
// a soft round light pool (additive): white middle fading to nothing
export const poolTex = () => paint('pool', 128, 128, (x, w, h) => {
  const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}, { repeat: false });
// a soft glow dot for bulbs and beacons (additive)
export const haloTex = () => paint('halo', 64, 64, (x, w, h) => {
  const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}, { repeat: false });
// text in a box, shrunk to fit
export function fitText(x, text, size, maxW, fam = HEAD, weight = 400) {
  let s = size;
  for (; s > 6; s -= 1) { x.font = `${weight} ${s}px ${fam}`; if (x.measureText(text).width <= maxW) break; }
  return s;
}
