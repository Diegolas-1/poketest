// Anime people built in code: a smooth chibi body (big head with a painted
// face, slim limbs, mitten hands) on a bone hierarchy, dressed in real garment
// meshes worn over it (jacket, cap, gloves, jeans with rolled cuffs, sneakers).
// Cel shaded with toon() and a thin inverted-hull ink line; animated by speed:
// idle breathing and blinking, walk, run and jump.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon } from './toon.js';
import { dressAsh } from './ashcloth.js';

const V2 = (x, y) => new THREE.Vector2(x, y), V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const DS = THREE.DoubleSide;

// ---------- materials ----------
const CLOTH = { bands: [0.1, 0.3, 0.62], deep: [0.5, 0.52, 0.7], shade: [0.7, 0.74, 0.9], lit: [1.05, 1.04, 1.0], litAdd: [0.02, 0.02, 0.01] };
const SKIN = { bands: [0.1, 0.3, 0.62], deep: [0.74, 0.6, 0.64], shade: [0.9, 0.78, 0.8], lit: [1.03, 1.02, 0.99], litAdd: [0.02, 0.01, 0] };
const MATS = new Map();
function mat(c, o = {}) {
  const k = c + (o.side === DS ? 'd' : '') + (o.skin ? 's' : '');
  if (!MATS.has(k)) MATS.set(k, toon(c, { side: o.side, cel: o.skin ? SKIN : CLOTH }));
  return MATS.get(k);
}
// ink: back faces pushed out along the normal in view space, a little wider far away
const INK = new THREE.MeshBasicMaterial({ color: '#2f2b36', side: THREE.BackSide });
INK.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    mvPosition.xyz += normalize(normalMatrix * normal) * 0.0075 * clamp(-mvPosition.z / 4.0, 1.0, 4.0);
    gl_Position = projectionMatrix * mvPosition;`);
};
const HULL = new WeakMap();
function hullOf(g) {
  if (!HULL.has(g)) {
    const p = new THREE.BufferGeometry(); p.setAttribute('position', g.attributes.position); if (g.index) p.setIndex(g.index);
    const h = mergeVertices(p, 1e-4); h.computeVertexNormals(); HULL.set(g, h);
  }
  return HULL.get(g);
}

// a mesh (with its ink hull as a sibling) under a bone; m = colour or material
function part(geo, m, parent, x = 0, y = 0, z = 0, o = {}) {
  const mesh = new THREE.Mesh(geo, typeof m === 'string' ? mat(m, o) : m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  if (o.s) Array.isArray(o.s) ? mesh.scale.set(...o.s) : mesh.scale.setScalar(o.s);
  mesh.castShadow = o.shadow ?? true;
  parent.add(mesh);
  if (o.ink ?? true) {
    const h = new THREE.Mesh(hullOf(geo), INK);
    h.position.copy(mesh.position); h.rotation.copy(mesh.rotation); h.scale.copy(mesh.scale);
    parent.add(h);
  }
  return mesh;
}
const bone = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

// ---------- shapes ----------
const sph = (r = 1, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
// surface of revolution from [y, r] pairs, bottom to top; k squashes front to back
function lathe(pts, n = 18, k = 1) {
  const g = new THREE.LatheGeometry(pts.map(([y, r]) => V2(Math.max(r, 0), y)), n);
  if (k !== 1) g.scale(1, 1, k);
  return g;
}
// a tapered capsule hanging down from 0 to -len
function limb(len, r0, r1, n = 12) {
  const p = [];
  for (let i = 0; i <= 4; i++) { const a = -Math.PI / 2 + (i / 4) * Math.PI / 2; p.push([-len + Math.sin(a) * r1, Math.cos(a) * r1]); }
  for (let i = 1; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; p.push([Math.sin(a) * r0, Math.cos(a) * r0]); }
  return lathe(p, n);
}
// a garment surface: rings [y, rx, rz, dz] bottom to top, open at the front by
// gap(y) radians either side (0 = closed, seam at the back); normals face out
function shell(rings, gap = () => 0, n = 30) {
  const pos = [], idx = [];
  for (const [y, rx, rz, dz = 0] of rings) {
    const g = gap(y), a0 = g > 0 ? g : Math.PI, span = Math.PI * 2 - 2 * g;
    for (let j = 0; j <= n; j++) { const a = a0 + span * j / n; pos.push(rx * Math.sin(a), y, rz * Math.cos(a) + dz); }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * (n + 1) + j, b = a + n + 1; idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const p = geo.attributes.position, nn = geo.attributes.normal; let d = 0;
  for (let i = 0; i < p.count; i++) d += p.getX(i) * nn.getX(i) + p.getZ(i) * nn.getZ(i);
  if (d < 0) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; geo.setIndex(idx); geo.computeVertexNormals(); }
  return geo;
}
// a flat outline [x, z] (z forward) extruded downward by depth
function slab(pts, depth, bevel = 0.006) {
  const s = new THREE.Shape(pts.map(([x, z]) => V2(x, z)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  return g.rotateX(Math.PI / 2);
}
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r);

// ---------- painted textures ----------
const TEX = new Map();
function paint(key, w, h, draw) {
  if (!TEX.has(key)) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    TEX.set(key, t);
  }
  return TEX.get(key);
}
// the face, drawn as seen from the front: u, v in head radii (-1..1)
function faceTex(f, closed) {
  return paint('face' + JSON.stringify(f) + closed, 512, 512, (x, S) => {
    const X = (u) => (0.5 + u / 2) * S, Y = (v) => (0.5 - v / 2) * S, U = S / 2;
    const ew = (f.ew || 0.28) * U, eh = (f.eh || 0.38) * U, ink = '#231a1f';
    x.lineCap = x.lineJoin = 'round';
    for (const s of [-1, 1]) {
      const cx = X(s * (f.ex || 0.38)), cy = Y(f.ey ?? -0.19);
      // blush
      const bl = x.createRadialGradient(cx + s * ew * 0.3, cy + eh * 0.95, 1, cx + s * ew * 0.3, cy + eh * 0.95, ew * 0.75);
      bl.addColorStop(0, f.blush || 'rgba(240,120,130,0.42)'); bl.addColorStop(1, 'rgba(240,120,130,0)');
      x.fillStyle = bl; x.fillRect(cx - ew * 1.2, cy, ew * 2.6, eh * 2);
      // brow
      x.strokeStyle = f.brow || ink; x.lineWidth = f.browW || 7;
      x.beginPath(); x.moveTo(cx - s * ew * 0.45, cy - eh * 0.82); x.quadraticCurveTo(cx + s * ew * 0.05, cy - eh * (f.old ? 1.0 : 1.05), cx + s * ew * 0.55, cy - eh * 0.8); x.stroke();
      const xi = cx - s * ew * 0.5, xo = cx + s * ew * 0.55, ti = cy - eh * 0.22, to = cy - eh * 0.12;
      if (closed || f.old) {
        // closed: a happy lid line; old folks get narrow smiling eyes
        x.strokeStyle = ink; x.lineWidth = eh * 0.1;
        x.beginPath(); x.moveTo(xi, cy + eh * 0.02); x.quadraticCurveTo(cx, cy - eh * (f.old && !closed ? 0.3 : 0.18), xo, cy + eh * 0.05); x.stroke();
        if (f.old && !closed) { x.lineWidth = 3; x.beginPath(); x.moveTo(xo + s * 4, cy + eh * 0.15); x.lineTo(xo + s * 14, cy + eh * 0.25); x.stroke(); }
        continue;
      }
      // white of the eye under the lid curve
      x.save(); x.beginPath(); x.moveTo(xi, ti); x.quadraticCurveTo(cx, cy - eh * 0.72, xo, to);
      x.bezierCurveTo(xo + s * ew * 0.04, cy + eh * 0.55, xi - s * ew * 0.02, cy + eh * 0.6, xi, ti); x.closePath();
      x.fillStyle = '#fbfaf7'; x.fill(); x.clip();
      // iris and pupil, tall and clipped by the lid
      const ix = cx + s * ew * 0.03, iy = cy + eh * 0.08;
      const g = x.createLinearGradient(0, iy - eh * 0.5, 0, iy + eh * 0.5);
      g.addColorStop(0, f.eye || '#2a1c18'); g.addColorStop(0.55, f.eye || '#2a1c18'); g.addColorStop(1, f.eye2 || '#6b4630');
      x.fillStyle = g; x.beginPath(); x.ellipse(ix, iy, ew * 0.37, eh * 0.5, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(0,0,0,0.55)'; x.beginPath(); x.ellipse(ix, iy - eh * 0.04, ew * 0.17, eh * 0.25, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(255,230,200,0.35)'; x.lineWidth = 3; x.beginPath(); x.ellipse(ix, iy + eh * 0.05, ew * 0.26, eh * 0.34, 0, 0.35, Math.PI - 0.35); x.stroke();
      x.fillStyle = 'rgba(40,30,60,0.25)'; x.fillRect(xi - ew, cy - eh, ew * 3, eh * 0.42);   // lid shadow
      x.restore();
      // upper lash line with a flick at the outer corner, a short lower lash
      x.strokeStyle = ink; x.fillStyle = ink; x.lineWidth = eh * (f.lash || 0.13);
      x.beginPath(); x.moveTo(xi, ti + 2); x.quadraticCurveTo(cx, cy - eh * 0.74, xo, to); x.stroke();
      x.beginPath(); x.moveTo(xo - s * ew * 0.12, to - eh * 0.1); x.lineTo(xo + s * ew * (f.flick || 0.18), to - eh * 0.02); x.lineTo(xo - s * ew * 0.02, to + eh * 0.12); x.fill();
      x.lineWidth = 3; x.beginPath(); x.moveTo(cx - s * ew * 0.05, cy + eh * 0.57); x.quadraticCurveTo(cx + s * ew * 0.3, cy + eh * 0.55, xo - s * ew * 0.02, cy + eh * 0.36); x.stroke();
      // highlights (both on the same side, like one light)
      x.fillStyle = '#ffffff';
      x.beginPath(); x.ellipse(ix - ew * 0.15, iy - eh * 0.22, ew * 0.13, eh * 0.13, -0.4, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(ix + ew * 0.14, iy + eh * 0.24, ew * 0.06, eh * 0.05, 0, 0, Math.PI * 2); x.fill();
      // Ash's zigzag cheek marks
      if (f.marks) {
        x.strokeStyle = '#9a5444'; x.lineWidth = 3.5;
        const mx = X(s * 0.5), my = Y(-0.5);
        x.beginPath(); x.moveTo(mx - s * 7, my - 9); x.lineTo(mx + s * 4, my - 3); x.lineTo(mx - s * 5, my + 3); x.lineTo(mx + s * 6, my + 10); x.stroke();
      }
    }
    // nose and mouth
    x.strokeStyle = '#c9876f'; x.lineWidth = 3; x.beginPath(); x.moveTo(X(0.015), Y(-0.44)); x.lineTo(X(-0.015), Y(-0.48)); x.stroke();
    x.strokeStyle = ink; x.lineWidth = 3.5;
    if (f.mouth === 'grin') {
      const m = new Path2D(); m.moveTo(X(-0.13), Y(-0.61)); m.quadraticCurveTo(X(0), Y(-0.66), X(0.13), Y(-0.61)); m.quadraticCurveTo(X(0.06), Y(-0.79), X(0), Y(-0.79)); m.quadraticCurveTo(X(-0.06), Y(-0.79), X(-0.13), Y(-0.61)); m.closePath();
      x.fillStyle = '#7c2a33'; x.fill(m); x.save(); x.clip(m); x.fillStyle = '#e8737a'; x.beginPath(); x.ellipse(X(0), Y(-0.80), 0.09 * U, 0.07 * U, 0, 0, Math.PI * 2); x.fill(); x.restore(); x.stroke(m);
    } else if (f.mouth === 'o') {
      x.fillStyle = '#7c2a33'; x.beginPath(); x.ellipse(X(0), Y(-0.66), 0.04 * U, 0.05 * U, 0, 0, Math.PI * 2); x.fill(); x.stroke();
    } else {
      x.beginPath(); x.moveTo(X(-0.09), Y(-0.62)); x.quadraticCurveTo(X(0), Y(-0.70), X(0.09), Y(-0.62)); x.stroke();
    }
    if (f.beard) { x.fillStyle = f.beard; x.beginPath(); x.ellipse(X(0), Y(-0.86), 0.36 * U, 0.2 * U, 0, 0, Math.PI * 2); x.fill(); }
  });
}
// the white front panel of a cap with its logo (sphere UVs)
function panelTex(c) {
  return paint('panel' + c.front + c.logo, 256, 200, (x, w, h) => {
    x.fillStyle = c.front; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(60,60,80,0.35)'; x.lineWidth = 3; x.strokeRect(1, -4, w - 2, h + 8);   // seams
    if (!c.logo) return;
    const cx = w / 2, cy = h * 0.6, r = h * 0.16;
    x.strokeStyle = c.logo; x.lineWidth = r * 0.62; x.lineCap = 'butt';
    x.beginPath(); x.arc(cx, cy, r, 0.55, Math.PI * 2 - 0.55); x.stroke();
    x.fillStyle = c.logo; x.beginPath(); x.moveTo(cx + r * 0.95, cy - r * 0.72); x.lineTo(cx + r * 1.45, cy - r * 0.95); x.lineTo(cx + r * 1.2, cy - r * 0.25); x.fill();
  });
}

// ---------- proportions ----------
const KID = { thigh: 0.35, shin: 0.33, ank: 0.075, hipW: 0.085, R: 0.2, neck: 0.33, headY: 0.215, shX: 0.19, shY: 0.3, up: 0.22, fore: 0.19, hand: 1,
  legR: [0.06, 0.05, 0.045], armR: [0.043, 0.037, 0.032], dz: 0.72, pel: 0.135,
  tor: [[-0.1, 0.132], [0, 0.124], [0.08, 0.128], [0.16, 0.14], [0.24, 0.148], [0.29, 0.146], [0.32, 0.126], [0.345, 0.075], [0.36, 0.04]] };
const ADULT = { thigh: 0.45, shin: 0.43, ank: 0.08, hipW: 0.1, R: 0.19, neck: 0.43, headY: 0.205, shX: 0.235, shY: 0.39, up: 0.29, fore: 0.26, hand: 1.15,
  legR: [0.074, 0.062, 0.054], armR: [0.052, 0.045, 0.038], dz: 0.7, pel: 0.16,
  tor: [[-0.1, 0.158], [0, 0.15], [0.1, 0.155], [0.2, 0.17], [0.3, 0.182], [0.37, 0.18], [0.41, 0.155], [0.44, 0.085], [0.46, 0.05]] };
function rAt(P, y) {
  const t = P.tor;
  if (y <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (y <= t[i][0]) { const k = (y - t[i - 1][0]) / (t[i][0] - t[i - 1][0]); return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * k; }
  return t[t.length - 1][1];
}
// rings round the torso at heights ys, add = thickness (number or fn of y)
const rings = (P, ys, add) => ys.map((y) => { const a = typeof add === 'function' ? add(y) : add, r = rAt(P, y) * P.wide; return [y, r + a, r * P.dz + a]; });

// anime head: round skull, narrower jaw and a soft chin
function headShape(g, r) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) / r, y = p.getY(i) / r, z = p.getZ(i) / r;
    if (y < 0) { const k = -y; x *= 1 - 0.3 * k * k; z *= 1 - 0.1 * k * k; z += 0.08 * k * Math.max(0, z); y *= 1 - 0.06 * k; }
    else { x *= 1.03; y *= 1.02; }
    p.setXYZ(i, x * r, y * r, z * 0.94 * r);
  }
  g.computeVertexNormals();
  return g;
}
const dirOf = (a, e) => V3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
// a hair spike: base on the head at azimuth a (0 = front) and elevation e,
// pointing out along the surface and pulled down by drop
function spike(head, R, col, a, e, len, r, drop = 0.6, flat = 0.55, out = 0) {
  const d = dirOf(a, e), tip = d.clone().multiplyScalar(1 - drop + out).add(V3(0, -drop, 0)).normalize();
  const g = new THREE.ConeGeometry(r, len, 5, 1).translate(0, len / 2, 0).scale(1, 1, flat);
  const m = part(g, col, head), h = head.children[head.children.length - 1];   // mesh, then its ink
  m.position.copy(d).multiplyScalar(R * 0.92); m.position.y *= 1.02;
  m.quaternion.setFromUnitVectors(V3(0, 1, 0), tip).premultiply(new THREE.Quaternion().setFromAxisAngle(tip, a));
  h.position.copy(m.position); h.quaternion.copy(m.quaternion);
  return m;
}
// a hair cap over the skull, with the face (and anything keep() refuses) cut away
function hairShell(R, keep, scale = 1.06) {
  const g = headShape(sph(R, 44, 32), R).toNonIndexed(), p = g.attributes.position, out = [];
  for (let i = 0; i < p.count; i += 3) {
    let ok = true;
    for (let j = 0; j < 3 && ok; j++) ok = keep(p.getX(i + j) / R, p.getY(i + j) / R, p.getZ(i + j) / R);
    if (ok) for (let j = 0; j < 3; j++) out.push(p.getX(i + j) * scale, p.getY(i + j) * scale, p.getZ(i + j) * scale);
  }
  const h = new THREE.BufferGeometry(); h.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  const m = mergeVertices(h); m.computeVertexNormals();
  return m;
}

// ---------- the person ----------
// look: { adult, wide, skin, hair, hairStyle, face, shirt, sleeve, jacket, coat,
//   vest, dress, pants, shorts, cuff, belt, shoes, boots, gloves, cap, hat, bag }
export function makeActor(look = {}) {
  if (look.base === 'calem' && CALEM_ON) return calemActor(look);
  const L = { skin: '#f8d8bc', hair: '#2a2028', hairStyle: 'short', shirt: '#e2443c', sleeve: 'short', pants: '#3b5aa0', shoes: { up: '#e9ecef', sole: '#ffffff' }, face: {}, ...look };
  const P = { ...(L.adult ? ADULT : KID), wide: L.wide || 1 };
  const SK = { skin: true };
  const root = new THREE.Group();
  const body = bone(root);
  const hipY = P.thigh + P.shin + P.ank;
  const hips = bone(body, 0, hipY, 0);
  const pel = P.pel * P.wide;
  part(lathe([[-0.11, 0], [-0.1, pel * 0.6], [-0.05, pel * 0.95], [0.02, pel], [0.07, pel * 0.95], [0.1, 0]], 18, 0.75), L.skin, hips, 0, 0, 0, SK);

  // legs
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = bone(hips, s * P.hipW, 0, 0);
    part(limb(P.thigh, P.legR[0], P.legR[1]), L.skin, hip, 0, 0, 0, SK);
    const knee = bone(hip, 0, -P.thigh, 0);
    part(limb(P.shin, P.legR[1], P.legR[2]), L.skin, knee, 0, 0, 0, SK);
    const ankle = bone(knee, 0, -P.shin, 0);
    legs.push({ hip, knee, ankle, s });
  }
  // torso and neck
  const chest = bone(hips, 0, 0.03, 0);
  const tp = [[-0.08, 0], [-0.07, rAt(P, -0.07) * 0.8], ...P.tor.map(([y, r]) => [y, r]), [P.tor[P.tor.length - 1][0] + 0.005, 0]];
  part(lathe(tp.map(([y, r]) => [y, r * P.wide]), 20, P.dz), L.skin, chest, 0, 0, 0, SK);
  const neck = bone(chest, 0, P.neck, 0);
  part(lathe([[-0.05, 0.036], [0.06, 0.034], [0.13, 0.036]], 12), L.skin, neck, 0, 0, 0, SK);
  // arms
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = bone(chest, s * P.shX * P.wide, P.shY, 0);
    part(sph(P.armR[0] * 1.05, 12, 9), L.skin, sh, 0, 0, 0, SK);
    part(limb(P.up, P.armR[0], P.armR[1]), L.skin, sh, 0, 0, 0, SK);
    const el = bone(sh, 0, -P.up, 0);
    part(limb(P.fore, P.armR[1], P.armR[2]), L.skin, el, 0, 0, 0, SK);
    const wr = bone(el, 0, -P.fore, 0); wr.scale.setScalar(P.hand);
    // mitten hand: palm, fingers, thumb toward the front
    part(sph(1, 12, 9), L.skin, wr, 0, -0.035, 0, { ...SK, s: [0.042, 0.048, 0.026] });
    part(sph(1, 12, 9), L.skin, wr, 0, -0.078, 0.004, { ...SK, s: [0.038, 0.038, 0.023] });
    part(limb(0.035, 0.014, 0.012, 8), L.skin, wr, -s * 0.006, -0.025, 0.02, { ...SK, rx: -0.9, rz: -s * 0.3 });
    arms.push({ sh, el, wr, s });
  }
  // head
  const head = bone(neck, 0, P.headY, 0);
  const R = P.R;
  part(headShape(sph(R, 32, 24), R), L.skin, head, 0, 0, 0, SK);
  for (const s of [-1, 1]) part(sph(1, 10, 8), L.skin, head, s * R * 0.97, -R * 0.12, -R * 0.05, { ...SK, s: [R * 0.12, R * 0.2, R * 0.14], rz: s * 0.2 });
  // the painted face on a patch just over the head (planar UVs from the front)
  const fg = headShape(new THREE.SphereGeometry(R * 1.006, 40, 30, Math.PI / 2 - 1.25, 2.5, 0.85, 1.85), R * 1.006);
  const fp = fg.attributes.position, uv = fg.attributes.uv;
  for (let i = 0; i < fp.count; i++) uv.setXY(i, 0.5 + fp.getX(i) / (2 * R), 0.5 + fp.getY(i) / (2 * R));
  const fOpen = faceTex(L.face, false), fShut = faceTex(L.face, true);
  const faceM = toon('#ffffff', { map: fOpen, cel: SKIN });
  Object.assign(faceM, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const face = part(fg, faceM, head, 0, 0, 0, { ink: false, shadow: false });
  face.renderOrder = 1; face.userData.keep = true;

  hair(L, head, R);
  if (L.cap) cap(L.cap, head, R);
  if (L.hat) hat(L.hat, head, R);
  const wear = clothes(L, P, { hips, chest, neck, legs, arms });

  // shadow blob
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }));
  blob.position.y = 0.02; root.add(blob);
  bake(root);

  let phase = 0, blink = 2 + Math.random() * 3, idleT = Math.random() * 10;
  const actor = {
    root, head, blob,
    // speed in m/s, air = true while jumping
    animate(dt, speed, air, t) {
      const run = Math.min(1, speed / 7), sw = speed > 0.1 ? Math.min(1, speed / 3) : 0;
      phase += dt * (speed > 0.1 ? 2.2 + speed * 1.15 : 0);
      idleT += dt;
      const a = Math.sin(phase) * (0.55 + run * 0.35) * sw;
      const kb = (0.7 + run * 0.6) * sw;
      const [l0, l1] = legs;
      l0.hip.rotation.x = air ? -0.75 : a;
      l1.hip.rotation.x = air ? 0.35 : -a;
      l0.knee.rotation.x = air ? 1.1 : Math.max(0, -Math.sin(phase + 0.6)) * kb + 0.04;
      l1.knee.rotation.x = air ? 0.5 : Math.max(0, Math.sin(phase + 0.6)) * kb + 0.04;
      for (const l of legs) l.ankle.rotation.x = air ? -0.3 : -(l.hip.rotation.x + l.knee.rotation.x) * 0.35 + (l.knee.rotation.x > 0.3 ? 0.25 : 0);
      for (const [i, arm] of arms.entries()) {
        const sgn = i ? 1 : -1;
        arm.sh.rotation.x = air ? -2.4 + i * 0.5 : sgn * a * 0.9 + Math.sin(idleT * 1.3 + i) * 0.02;
        arm.sh.rotation.z = arm.s * (air ? 0.55 : 0.13 + run * 0.08 + Math.sin(idleT * 2) * 0.01);
        arm.el.rotation.x = air ? -0.4 : -0.18 - (0.4 + run * 1.0) * sw;
        arm.wr.rotation.x = -0.1;
      }
      const bob = speed > 0.1 ? Math.abs(Math.sin(phase)) * (0.035 + run * 0.03) * sw : Math.sin(t * 2) * 0.005;
      hips.position.y = hipY + bob - (air ? 0.04 : 0);
      chest.rotation.x = run * 0.25 * sw + (air ? -0.1 : 0);
      chest.rotation.y = Math.sin(phase) * 0.14 * sw;
      chest.scale.set(1, 1 + Math.sin(t * 2) * 0.01 * (1 - sw), 1);
      head.rotation.x = -run * 0.15 * sw + (air ? 0.1 : 0);
      head.rotation.y = -chest.rotation.y * 0.6 + (sw ? 0 : Math.sin(idleT * 0.4) * 0.15);
      wear.anim(sw, run, phase, air, t);
      blink -= dt;
      if (blink < 0) { faceM.map = fShut; if (blink < -0.12) { faceM.map = fOpen; blink = 2 + Math.random() * 4; } }
    },
  };
  return actor;
}

// ---------- hair ----------
// the hairline: low at the nape (back) rising to the forehead (front)
const line = (z, back, front) => back + (front - back) * (z + 1) / 2;
function hair(L, head, R) {
  const c = L.hair, st = L.hairStyle;
  if (st === 'ash') {
    // black spikes poking out under the cap: a thick fan at the back, sides, bangs
    part(hairShell(R, (x, y, z) => y > line(z, -0.74, 0.5) && !(z > 0.3 && y < 0.62)), c, head, 0, 0, 0, { side: DS });
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i - 4) * 0.27, e = 0.12 - Math.abs(i - 4) * 0.05 - (i % 2) * 0.1;
      spike(head, R, c, a, e, 0.15 + (i % 2) * 0.04 - Math.abs(i - 4) * 0.008, 0.06, 0.45, 0.5, 0.35);
    }
    for (const s of [-1, 1]) {
      spike(head, R, c, s * 2.15, 0.12, 0.15, 0.055, 0.35, 0.5, 0.35);   // behind the ears
      spike(head, R, c, s * 1.9, -0.08, 0.12, 0.05, 0.6, 0.5, 0.25);
      spike(head, R, c, s * 1.42, -0.1, 0.07, 0.022, 0.95, 0.3);          // sideburn
      spike(head, R, c, s * 0.38, 0.5, 0.13, 0.05, 0.75, 0.45, 0.25);     // bangs
      spike(head, R, c, s * 0.75, 0.42, 0.12, 0.05, 0.7, 0.45, 0.25);
    }
    spike(head, R, c, 0.06, 0.55, 0.14, 0.05, 0.8, 0.45, 0.3);
    return;
  }
  if (st === 'pony') {
    part(hairShell(R, (x, y, z) => y > line(z, -0.8, 0.45) && !(z > 0.5 && y < 0.42), 1.07), c, head, 0, 0, 0, { side: DS });
    for (let i = -4; i <= 4; i++) spike(head, R, c, i * 0.2, 0.6 - Math.abs(i) * 0.05, 0.12 - Math.abs(i) * 0.008, 0.06, 0.8, 0.4, 0.35);
    for (const s of [-1, 1]) spike(head, R, c, s * 1.15, 0.05, 0.26, 0.06, 0.92, 0.4, 0.15);   // side locks
    // ponytail with a ribbon, swaying on its own bone
    const tail = bone(head, 0, R * 0.55, -R * 0.82); tail.rotation.x = -0.5;
    part(sph(1, 12, 9), L.ribbon || '#e8436a', tail, 0, 0, 0, { s: [0.05, 0.035, 0.035] });
    part(limb(0.32, 0.07, 0.03, 10), c, tail, 0, -0.02, -0.02, { s: [1, 1, 0.8] });
    head.userData.tail = tail;
    return;
  }
  if (st === 'grey') {
    // Oak: swept back, spiky at the back and over the ears
    part(hairShell(R, (x, y, z) => y > line(z, -0.62, 0.42) && !(z > 0.32 && y < 0.45), 1.07), c, head, 0, 0, 0, { side: DS });
    for (let i = -2; i <= 2; i++) spike(head, R, c, i * 0.34, 0.5, 0.13, 0.07, -0.25, 0.5, 0.2);
    for (let i = 0; i < 7; i++) spike(head, R, c, Math.PI + (i - 3) * 0.33, 0.1 - (i % 2) * 0.12, 0.13, 0.065, 0.3, 0.5, 0.4);
    for (const s of [-1, 1]) spike(head, R, c, s * 1.5, 0.15, 0.12, 0.06, 0.4, 0.5, 0.3);
    return;
  }
  // short: a soft mop with a few tufts
  part(hairShell(R, (x, y, z) => y > line(z, -0.66, 0.5) && !(z > 0.25 && y < 0.55), 1.07), c, head, 0, 0, 0, { side: DS });
  for (let i = -2; i <= 2; i++) spike(head, R, c, i * 0.28, 0.58, 0.13, 0.06, 0.8, 0.45, 0.25);
  for (let i = 0; i < 5; i++) spike(head, R, c, Math.PI + (i - 2) * 0.4, -0.1, 0.1, 0.06, 0.6, 0.5, 0.2);
}

// ---------- headwear ----------
// a ball cap: crown, a front panel with a logo, a brim and a button
function cap(c, head, R) {
  const g = bone(head, 0, R * 0.24, -R * 0.03); g.rotation.x = -0.18;
  const Rc = R * 1.055, th = 1.62, sx = 1.03, sz = 0.95;
  part(new THREE.SphereGeometry(Rc, 32, 14, 0, Math.PI * 2, 0, th), c.color, g, 0, 0, 0, { s: [sx, 1, sz], side: DS });
  if (c.front) {
    const pm = toon('#ffffff', { map: panelTex(c), cel: CLOTH });
    Object.assign(pm, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    part(new THREE.SphereGeometry(Rc * 1.006, 24, 12, Math.PI / 2 - 0.82, 1.64, 0.28, th - 0.29), pm, g, 0, 0, 0, { s: [sx, 1, sz], ink: false });
  }
  part(sph(0.022, 10, 6), c.color, g, 0, Rc * 0.99, 0);
  // brim: an arc in front of the rim, tilted down a little
  const pts = [], n = 18, ry = Math.cos(th) * Rc;
  for (let i = 0; i <= n; i++) { const a = -1.35 + 2.7 * i / n; pts.push([Rc * sx * 0.96 * Math.sin(a), Rc * sz * 0.96 * Math.cos(a)]); }
  for (let i = n; i >= 0; i--) {
    const a = -1.35 + 2.7 * i / n, ext = R * 0.95 * Math.pow(Math.max(0, Math.cos(a * 1.12)), 0.8) + 0.008;
    pts.push([(Rc * sx + ext * 0.35) * Math.sin(a), Rc * sz * Math.cos(a) + ext]);
  }
  part(slab(pts, 0.016, 0.004), c.brim || c.color, g, 0, ry + 0.012, 0, { rx: 0.22 });
}
// a floppy bucket hat (the fisher)
function hat(h, head, R) {
  const g = bone(head, 0, R * 0.32, -R * 0.02); g.rotation.x = -0.08;
  part(lathe([[-0.02, R * 1.12], [0.06, R * 1.06], [0.14, R * 0.95], [0.19, R * 0.6], [0.2, 0]], 24, 0.97), h.color, g, 0, 0, 0);
  part(lathe([[-0.06, R * 1.75], [-0.035, R * 1.55], [-0.01, R * 1.1]], 26, 0.97), h.color, g, 0, 0, 0, { side: DS });
  part(lathe([[-0.015, R * 1.125], [0.03, R * 1.1]], 24, 0.97), h.band || '#7a5a3a', g, 0, 0, 0, { ink: false });
}

// ---------- clothes ----------
function clothes(L, P, { hips, chest, legs, arms }) {
  const hem = [];   // garment bones that flutter
  // shirt (T-shirt / long sleeves), tucked in at the waist
  if (L.shirt) {
    const ys = [-0.03, 0.04, 0.12, 0.2, 0.26, P.tor[5][0], P.tor[6][0], P.tor[7][0] - 0.005, P.tor[7][0] + 0.008];
    part(shell(rings(P, ys, 0.012)), L.shirt, chest, 0, 0, 0, { side: DS });
    for (const a of arms) {
      if (L.sleeve === 'long') {
        part(lathe([[-P.up - 0.01, P.armR[1] + 0.012], [-P.up * 0.4, P.armR[0] + 0.012], [0, P.armR[0] + 0.016], [0.035, P.armR[0] + 0.002], [0.062, 0]], 14), L.shirt, a.sh, 0, 0, 0, { side: DS });
        part(lathe([[-P.fore + 0.01, P.armR[2] + 0.014], [-P.fore + 0.025, P.armR[2] + 0.016], [-P.fore * 0.5, P.armR[1] + 0.01], [0.02, P.armR[1] + 0.014]], 14), L.shirt, a.el, 0, 0, 0, { side: DS });
      } else if (L.sleeve === 'short') {
        part(lathe([[-0.1, P.armR[0] + 0.02], [-0.04, P.armR[0] + 0.018], [0, P.armR[0] + 0.018], [0.03, P.armR[0] * 0.9], [0.045, 0]], 14), L.shirt, a.sh, 0, 0, 0, { side: DS });
      }
    }
  }
  // trousers, shorts or nothing (a dress)
  if (L.pants) {
    const pel = P.pel * P.wide + 0.014;
    part(lathe([[-0.135, 0], [-0.125, pel * 0.62], [-0.07, pel * 0.98], [0.02, pel], [0.075, pel * 0.97]], 20, 0.76), L.pants, hips, 0, 0, 0, { side: DS });
    for (const l of legs) {
      const [r0, r1, r2] = P.legR.map((r) => r + 0.013);
      const short = L.shorts ? P.thigh * 0.55 : 0;
      part(lathe([[-(short || P.thigh) - 0.01, r1 + (short ? 0.012 : 0.003)], [-P.thigh * 0.5, r0 + 0.002], [0, r0 + 0.006], [0.05, r0 * 0.9]], 16), L.pants, l.hip, 0, 0, 0, { side: DS });
      if (short) continue;
      part(sph(r1 + 0.002, 12, 9), L.pants, l.knee, 0, 0, 0, { ink: false });
      const bot = L.boots ? -P.shin * 0.45 : -P.shin + 0.035;
      part(lathe([[bot, r2 + 0.006], [-P.shin * 0.5, r2 + 0.004], [0, r1], [0.03, r1 * 0.95]], 16), L.pants, l.knee, 0, 0, 0, { side: DS });
      // rolled cuff: a fat band of the lighter inside of the denim
      if (L.cuff) part(lathe([[bot - 0.012, r2 + 0.004], [bot - 0.006, r2 + 0.016], [bot + 0.04, r2 + 0.017], [bot + 0.046, r2 + 0.006]], 16), L.cuff, l.knee, 0, 0, 0);
    }
  }
  if (L.socks) for (const l of legs) part(lathe([[-P.shin + 0.02, P.legR[2] + 0.006], [-P.shin * 0.62, P.legR[2] + 0.008], [-P.shin * 0.55, P.legR[2] + 0.01]], 14), L.socks, l.knee, 0, 0, 0);
  if (L.belt) {
    const pel = P.pel * P.wide + 0.02;
    part(lathe([[0.03, pel * 0.995], [0.068, pel]], 22, 0.77), L.belt, hips, 0, 0, 0, { side: DS });
    part(rbox(0.05, 0.036, 0.014, 0.005), L.buckle || '#d9dde2', hips, 0, 0.049, pel * 0.77 + 0.004);
  }
  // shoes / boots on the ankle bone
  for (const l of legs) shoe(L.boots || L.shoes, l.ankle, P, !!L.boots);
  // gloves (fingerless: the fingertips stay bare)
  if (L.gloves) for (const a of arms) {
    part(sph(1, 12, 9), L.gloves, a.wr, 0, -0.038, 0, { s: [0.049, 0.052, 0.032] });
    part(lathe([[-0.02, 0.044], [0.025, 0.046], [0.03, 0.04]], 14), L.gloves2 || L.gloves, a.wr, 0, 0, 0, { side: DS });
  }
  // Ash's jacket: blue body open at the front, white collar and short sleeves,
  // yellow hem band and pocket lines; it hangs from its own bone and flares
  if (L.jacket) {
    const j = L.jacket, jb = bone(chest, 0, P.shY + 0.02, 0); hem.push([jb, 0.12]);
    const g = j.gap ?? 0.5, gap = (y) => g + Math.max(0, y - 0.24) * 2.2;
    const fl = (y) => 0.028 + Math.max(0, 0.03 - y) * 0.35;
    const ys = [-0.08, -0.03, 0.04, 0.12, 0.2, 0.26, 0.3, 0.325];
    const off = (r) => r.map(([y, a, b]) => [y - P.shY - 0.02, a, b]);
    part(shell(off(rings(P, ys, fl)), (y) => gap(y + P.shY + 0.02)), j.color, jb, 0, 0, 0, { side: DS });
    if (j.trim) {
      part(shell(off(rings(P, [-0.083, -0.06], (y) => fl(y) + 0.003)), () => g), j.trim, jb, 0, 0, 0, { side: DS, ink: false });
      for (const s of [-1, 1]) {
        const y = 0.03, a = s * (g + 0.42), r = rAt(P, y) + fl(y) + 0.002;
        part(rbox(0.07, 0.012, 0.008, 0.003), j.trim, jb, Math.sin(a) * r, y - P.shY - 0.02, Math.cos(a) * (rAt(P, y) * P.dz + fl(y)) + 0.002, { ry: a, rz: s * -0.12, ink: false });
      }
    }
    if (j.collar) part(shell(off([[0.27, rAt(P, 0.27) + 0.045, rAt(P, 0.27) * P.dz + 0.04], [0.305, rAt(P, 0.305) + 0.04, rAt(P, 0.305) * P.dz + 0.036], [0.335, 0.11, 0.09], [0.36, 0.083, 0.072], [0.39, 0.078, 0.068]]), () => (j.collarGap ?? 0.8)), j.collar, jb, 0, 0, 0, { side: DS });
    for (const a of arms) part(lathe([[-0.12, P.armR[0] + 0.026], [-0.06, P.armR[0] + 0.023], [0, P.armR[0] + 0.022], [0.035, P.armR[0] + 0.004], [0.052, 0]], 16), j.sleeve || j.color, a.sh, 0, 0, 0, { side: DS });
  }
  // a waistcoat with pockets (the fisher)
  if (L.vest) {
    const v = L.vest, ys = [-0.08, 0, 0.1, 0.2, 0.3, 0.37, 0.4];
    part(shell(rings(P, ys, 0.026), (y) => 0.35 + Math.max(0, y - 0.25) * 2), v.color, chest, 0, 0, 0, { side: DS });
    for (const s of [-1, 1]) for (const y of [0.03, 0.2]) {
      const a = s * 0.75, r = rAt(P, y) * P.wide;
      part(rbox(0.08, 0.06, 0.02, 0.006), v.pocket || v.color, chest, Math.sin(a) * (r + 0.03), y, Math.cos(a) * (r * P.dz + 0.03), { ry: a });
    }
  }
  // a lab coat: open front with lapels, long sleeves, skirts to the knee
  if (L.coat) {
    const c = L.coat, top = P.tor[6][0];
    const ys = [-0.03, 0.08, 0.18, 0.28, P.tor[5][0], top, top + 0.02];
    part(shell(rings(P, ys, 0.03), (y) => 0.3 + Math.max(0, y - 0.25) * 2.4), c.color, chest, 0, 0, 0, { side: DS });
    part(shell([[top - 0.12, rAt(P, top - 0.12) * P.wide + 0.042, rAt(P, top - 0.12) * P.wide * P.dz + 0.045], [top - 0.02, rAt(P, top) * P.wide + 0.05, rAt(P, top) * P.wide * P.dz + 0.04], [top + 0.03, 0.1, 0.085], [top + 0.06, 0.088, 0.074]], (y) => 0.5 + Math.max(0, top - y) * 3), c.color, chest, 0, 0, 0, { side: DS });
    const sk = bone(hips, 0, 0.03, 0); hem.push([sk, 0.25]);
    const pr = P.pel * P.wide + 0.04;
    const ry = [[-P.thigh * 1.12, pr * 1.4, pr * 1.15], [-P.thigh * 0.6, pr * 1.22, pr * 0.98], [-0.1, pr * 1.07, pr * 0.85], [0.0, rAt(P, -0.03) * P.wide + 0.032, rAt(P, -0.03) * P.wide * P.dz + 0.032]];
    part(shell(ry, (y) => 0.32 + Math.max(0, -y) * 0.6), c.color, sk, 0, 0, 0, { side: DS });
    for (const s of [-1, 1]) { const a = s * 0.62; part(rbox(0.1, 0.012, 0.012, 0.004), '#d9d9de', sk, Math.sin(a) * pr * 1.16, -P.thigh * 0.4, Math.cos(a) * pr * 0.94, { ry: a, ink: false }); }
    for (const a of arms) {
      part(lathe([[-P.up - 0.02, P.armR[1] + 0.028], [-P.up * 0.4, P.armR[0] + 0.026], [0, P.armR[0] + 0.03], [0.04, P.armR[0] + 0.01], [0.075, 0]], 14), c.color, a.sh, 0, 0, 0, { side: DS });
      part(lathe([[-P.fore + 0.005, P.armR[2] + 0.03], [-P.fore * 0.5, P.armR[1] + 0.026], [0.02, P.armR[1] + 0.03]], 14), c.color, a.el, 0, 0, 0, { side: DS });
    }
  }
  // a dress: bodice on the chest, flared skirt from the hips, puff sleeves
  if (L.dress) {
    const d = L.dress, ys = [-0.03, 0.06, 0.14, 0.22, 0.27, P.tor[6][0], P.tor[7][0] - 0.004, P.tor[7][0] + 0.008];
    part(shell(rings(P, ys, 0.012)), d.color, chest, 0, 0, 0, { side: DS });
    const sk = bone(hips, 0, 0.03, 0); hem.push([sk, 0.2]);
    const pr = P.pel * P.wide;
    part(lathe([[-P.thigh * 0.62, pr * 1.75], [-P.thigh * 0.58, pr * 1.72], [-0.12, pr * 1.3], [-0.03, pr * 1.05], [0.03, rAt(P, -0.0) + 0.012]], 26, 0.85), d.color, sk, 0, 0, 0, { side: DS });
    if (d.trim) part(lathe([[-P.thigh * 0.63, pr * 1.77], [-P.thigh * 0.56, pr * 1.7]], 26, 0.85), d.trim, sk, 0, 0, 0, { side: DS, ink: false });
    if (d.collar) part(shell([[P.tor[6][0] - 0.03, rAt(P, P.tor[6][0] - 0.03) + 0.03, rAt(P, P.tor[6][0] - 0.03) * P.dz + 0.03], [P.tor[7][0], 0.1, 0.085], [P.tor[7][0] + 0.02, 0.07, 0.06]], () => 0.55), d.collar, chest, 0, 0, 0, { side: DS });
    for (const a of arms) part(lathe([[-0.085, P.armR[0] + 0.015], [-0.07, P.armR[0] + 0.032], [-0.02, P.armR[0] + 0.036], [0.03, P.armR[0] + 0.01], [0.05, 0]], 14), d.sleeve || d.color, a.sh, 0, 0, 0, { side: DS });
  }
  // a backpack with straps
  if (L.bag) {
    const z = -rAt(P, 0.18) * P.dz - 0.02;
    part(rbox(0.26, 0.3, 0.13, 0.05), L.bag, chest, 0, 0.17, z - 0.06);
    part(rbox(0.2, 0.1, 0.05, 0.02), L.bag2 || '#f4f1ea', chest, 0, 0.1, z - 0.13);
    for (const s of [-1, 1]) part(new THREE.TorusGeometry(0.11, 0.012, 6, 16, Math.PI * 1.1).rotateY(Math.PI / 2), L.bag2 || L.bag, chest, s * 0.09, 0.2, -0.0, { rx: -0.2, s: [1, 1.1, 0.72] });
  }
  return {
    anim(sw, run, phase, air) {
      for (const [g, k] of hem) g.rotation.x = -(run * sw * k + (air ? k * 0.8 : 0)) + Math.sin(phase * 2) * 0.03 * sw;
    },
  };
}
// sneakers (sole, toe cap, upper, collar, laces, heel tab) or boots
function shoe(s, ankle, P, boot) {
  const y0 = -P.ank, k = P.thigh > 0.4 ? 1.12 : 1;
  const g = bone(ankle); g.scale.setScalar(k);
  const pts = [];
  for (let i = 0; i < 24; i++) { const t = (i / 24) * Math.PI * 2, f = Math.cos(t) > 0; pts.push([Math.sin(t) * (f ? 0.056 : 0.048), 0.035 + Math.cos(t) * (f ? 0.125 : 0.078)]); }
  part(slab(pts, 0.022, 0.006), s.sole || '#ffffff', g, 0, y0 / k + 0.028, 0);
  part(sph(1, 16, 12), s.up, g, 0, y0 / k + 0.05, 0.03, { s: [0.058, 0.055, 0.11] });
  if (s.toe) part(sph(1, 14, 10), s.toe, g, 0, y0 / k + 0.042, 0.08, { s: [0.054, 0.04, 0.075] });
  if (boot) part(lathe([[y0 / k + 0.04, 0.062], [0.0, 0.06], [0.12, 0.062], [0.14, 0.066]], 16), s.up, g, 0, 0, 0, { side: DS });
  else part(lathe([[y0 / k + 0.05, 0.058], [-0.015, 0.054], [0.0, 0.05]], 16, 0.95), s.collar || s.up, g, 0, 0, -0.005, { side: DS });
  if (s.lace) for (let i = 0; i < 3; i++) part(rbox(0.05, 0.008, 0.012, 0.003), s.lace, g, 0, y0 / k + 0.1 - i * 0.012, 0.04 + i * 0.022, { rx: 0.5, ink: false });
  if (s.tab) {
    part(rbox(0.026, 0.05, 0.014, 0.006), s.tab, g, 0, y0 / k + 0.085, -0.05, { rx: -0.15 });
    for (const x of [-1, 1]) part(rbox(0.006, 0.026, 0.07, 0.003), s.tab, g, x * 0.056, y0 / k + 0.05, 0.0, { ink: false });
  }
}

// merge the meshes under each bone that share a material (fewer draw calls)
function bake(root) {
  root.traverse((g) => {
    if (g.isMesh) return;
    const buckets = new Map();
    for (const m of g.children) if (m.isMesh && !m.userData.keep) {
      const k = m.material.uuid + m.castShadow;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(m);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const m0 = list[0], uv = !!m0.material.map;
      const gs = list.map((m) => {
        m.updateMatrix();
        const q = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const n of Object.keys(q.attributes)) if (n !== 'position' && n !== 'normal' && !(uv && n === 'uv')) q.deleteAttribute(n);
        return q.applyMatrix4(m.matrix);
      });
      const one = new THREE.Mesh(mergeGeometries(gs), m0.material);
      one.castShadow = m0.castShadow;
      for (const m of list) g.remove(m);
      g.add(one);
    }
  });
}

// Ash Ketchum (the player), the town girl, the fisher, Prof. Oak, a kid
const ASH = {
  hair: '#1f1a24', hairStyle: 'ash', skin: '#f8d6b8',
  face: { eye: '#2a1a16', eye2: '#6a4128', marks: true, mouth: 'grin', brow: '#1f1a24' },
  cap: { color: '#e0383a', brim: '#e0383a', front: '#f7f6f1', logo: '#2fa24f' },
  shirt: '#1d2a26', sleeve: 'short',
  jacket: { color: '#2f63c9', collar: '#f7f6f1', sleeve: '#f7f6f1', trim: '#f5c433', gap: 0.5 },
  gloves: '#36a24e', gloves2: '#2b8a42',
  pants: '#6f9fdc', cuff: '#dfe9f6', belt: '#c8343a', buckle: '#e9e4d0',
  shoes: { up: '#2f5fc4', sole: '#ffffff', toe: '#f7f6f1', collar: '#f7f6f1', lace: '#f7f6f1', tab: '#e0383a' },
  base: 'calem',   // use the local Calem-based model when this machine has it (see calemActor)
  cloth: 'ash',    // on that model: the open jacket and baggy jeans of ashcloth.js
};
export const LOOKS = {
  red: ASH, ash: ASH,
  girl: {
    hair: '#8a4a2c', hairStyle: 'pony', ribbon: '#e8436a',
    face: { eye: '#4a2a1c', eye2: '#b0703a', lash: 0.16, flick: 0.28, mouth: 'smile', brow: '#6a3a24' },
    shirt: null, pants: null, socks: '#ffffff',
    dress: { color: '#f494b4', collar: '#ffffff', sleeve: '#ffffff', trim: '#ffffff' },
    shoes: { up: '#c84a6e', sole: '#7a2a40', collar: '#c84a6e' },
  },
  fisher: {
    adult: true, wide: 1.22, hair: '#4a3a30', hairStyle: 'short', skin: '#f2c8a2',
    face: { eye: '#2a2020', eye2: '#5a4a3a', ew: 0.22, eh: 0.28, mouth: 'smile', brow: '#3a2a20', browW: 10, beard: 'rgba(90,70,55,0.35)' },
    hat: { color: '#e4d29e', band: '#7a5a3a' },
    shirt: '#3f7fa8', sleeve: 'long', vest: { color: '#c8b07a', pocket: '#b39a64' },
    pants: '#5a5a4f', cuff: '#6c6c60', boots: { up: '#3a3030', sole: '#241e1e' },
  },
  oak: {
    adult: true, hair: '#dcdde4', hairStyle: 'grey', skin: '#f2cba8',
    face: { old: true, mouth: 'smile', brow: '#b8b2a8', browW: 12, blush: 'rgba(230,140,120,0.25)' },
    shirt: '#c9373c', sleeve: 'long', coat: { color: '#f6f6f2' },
    pants: '#8a6a4a', belt: '#4a3428', shoes: { up: '#5a3a28', sole: '#3a2418' },
  },
  kid: {
    hair: '#3a2a20', hairStyle: 'short',
    face: { eye: '#2a2020', eye2: '#5a5a3a', mouth: 'o', brow: '#3a2a20' },
    shirt: '#7fc97f', sleeve: 'short', pants: '#4f6fa0', shorts: true,
    shoes: { up: '#ffd23f', sole: '#ffffff', toe: '#ffffff', lace: '#ffffff' }, bag: '#5fa8d3', bag2: '#3d7fb0',
  },
};

// the others are made from the same base model too, reworked in cast.js
for (const k of ['girl', 'fisher', 'kid', 'oak']) Object.assign(LOOKS[k], { base: 'calem', cast: k });

// ---------- optional local base model ----------
// web/world/local/ash.glb holds a skinned 3D-game body dressed as Ash. When it
// loads, the player look uses it:
// makeActor returns at once with the procedural Ash and swaps in the model when
// it has loaded. web/world/anims/ash.json (made by tools/world/retarget.mjs from
// Mixamo clips) moves it: idle, walk and run blended by speed, with a posed jump.
// Without the clips, bones are driven procedurally about axes taken from the
// rest pose, with the same angles as the procedural rig. ?base=proc turns it off.
const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const CALEM_ON = QS.get('base') !== 'proc';
const CALEM_H = 1.75;   // metres, cap included
let calemP = null, calemBase = null;
function loadCalem() {
  if (!calemP) calemP = (async () => {
    try {
      const url = new URL('./local/ash.glb', import.meta.url).href;
      const [{ GLTFLoader }, SU] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js')]);
      const [g, anims] = await Promise.all([new GLTFLoader().loadAsync(url),
        fetch(new URL('./anims/ash.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
      const base = prepCalem(g.scene, SU);
      if (anims) base.anims = { meta: anims.meta, clips: Object.fromEntries(anims.clips.map((c) => [c.name, THREE.AnimationClip.parse(c)])) };
      return (calemBase = base);
    } catch (e) { if (QS.get('base') === 'calem') console.warn('local base model not loaded:', e); return null; }
  })();
  return calemP;
}
// resolves to true once the local model is ready, false when it is not available
export function calemReady() { return CALEM_ON ? loadCalem().then((b) => !!b) : Promise.resolve(false); }

// ink for skinned meshes: back faces pushed out along the skinned, smoothed normal
const INK_SK = new THREE.MeshBasicMaterial({ color: '#2f2b36', side: THREE.BackSide });
INK_SK.onBeforeCompile = (sh) => {
  sh.vertexShader = 'attribute vec3 inkN;\n' + sh.vertexShader
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = inkN;')
    .replace('#include <project_vertex>', `
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    mvPosition.xyz += normalize(normalMatrix * objectNormal) * 0.0042 * clamp(-mvPosition.z / 4.0, 1.0, 3.5);
    gl_Position = projectionMatrix * mvPosition;`);
};
INK_SK.customProgramCacheKey = () => 'inksk';
// normals averaged over vertices at the same place, so the ink has no cracks at UV seams
function smoothNormals(g) {
  const p = g.attributes.position, n = g.attributes.normal, acc = new Map(), key = (i) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  for (let i = 0; i < p.count; i++) { const k = key(i), a = acc.get(k) || [0, 0, 0]; a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(k, a); }
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const a = acc.get(key(i)), l = Math.hypot(...a) || 1; out.set([a[0] / l, a[1] / l, a[2] / l], i * 3); }
  g.setAttribute('inkN', new THREE.BufferAttribute(out, 3));
}
const SKIN_PARTS = new Set(['face_on_1', 'face_on_0']);
function prepCalem(scene, SU) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const mats = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const m0 = o.material, name = m0.name || o.name;
    if (!mats.has(name)) {
      const m = toon('#ffffff', { map: m0.map, side: m0.side, cel: SKIN_PARTS.has(name) ? SKIN : CLOTH });
      if (m0.alphaTest) { m.alphaTest = m0.alphaTest; m.side = THREE.DoubleSide; }
      m.name = name; mats.set(name, m);
    }
    o.material = mats.get(name);
    o.castShadow = name !== 'face_on_0' && name !== 'ash_logo'; o.frustumCulled = false;
    if (name === 'face_on_0' || name === 'ash_logo') { o.material.polygonOffset = true; o.material.polygonOffsetFactor = -1; o.material.polygonOffsetUnits = -2; }
    else if (name !== 'ash_sleeve') smoothNormals(o.geometry);
  });
  // rest pose: each bone's rest rotation and its rotation relative to the model
  const rest = new Map();
  scene.traverse((b) => { if (b.isBone) rest.set(b.name, { q: b.quaternion.clone(), p: b.position.clone(), w: b.getWorldQuaternion(new THREE.Quaternion()) }); });
  return { scene, SU, rest, k: CALEM_H / (box.max.y - box.min.y), minY: box.min.y };
}

function calemActor(look) {
  const fb = makeActor({ ...look, base: 'proc' });   // the procedural Ash until the model is ready
  const actor = { root: fb.root, head: fb.head, blob: fb.blob, model: null };
  let rig = null, phase = 0, blink = 2 + Math.random() * 3, idleT = Math.random() * 10;
  const attach = (base) => {
    if (!base) return;
    const m = base.SU.clone(base.scene);
    const cloth = look.cloth === 'ash' ? dressAsh(m, base) : null;   // before the ink hulls, so the garments get theirs
    const holder = new THREE.Group(); holder.scale.setScalar(base.k); holder.position.y = -base.minY * base.k; holder.add(m);
    const bones = {}, hulls = [];
    let eyes = null;
    m.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (o.isSkinnedMesh) {
        if (o.material.name === 'face_on_0') {   // own eye texture so blinking is per person
          const m0 = o.material; o.material = m0.clone(); o.material.map = m0.map.clone(); eyes = o.material.map;
          o.material.onBeforeCompile = m0.onBeforeCompile; o.material.customProgramCacheKey = m0.customProgramCacheKey;   // clone() drops the cel shading
        }
        if (o.geometry.attributes.inkN) {
          const h = new THREE.SkinnedMesh(o.geometry, INK_SK); h.bind(o.skeleton, o.bindMatrix); h.frustumCulled = false; hulls.push([o.parent, h]);
        }
      }
    });
    for (const [p, h] of hulls) p.add(h);
    for (const c of fb.root.children) if (c !== fb.blob) c.visible = false;
    fb.root.add(holder);
    actor.model = holder;
    // rotate a bone about an axis given in the model's rest frame, on top of its rest pose
    const R = base.rest, tq = new THREE.Quaternion(), ax = new THREE.Vector3();
    const pose = (name, turns) => {
      const b = bones[name]; if (!b) return;
      const r = R.get(name); b.quaternion.copy(r.q);
      for (const [x, y, z, a] of turns) {
        if (!a) continue;
        ax.set(x, y, z).applyQuaternion(tq.copy(r.w).invert());
        b.quaternion.multiply(tq.setFromAxisAngle(ax, a));
      }
    };
    // the same, on top of the bone's current rotation
    const bend = (name, x, y, z, a) => {
      const b = bones[name]; if (!b) return;
      b.quaternion.multiply(tq.setFromAxisAngle(ax.set(x, y, z).applyQuaternion(tq.copy(R.get(name).w).invert()), a));
    };
    rig = { pose, bend, bones, holder, y0: holder.position.y, eyes, k: base.k, cloth };
    const A = base.anims;
    if (A && A.clips.idle && A.clips.walk && A.clips.run) {
      const mixer = new THREE.AnimationMixer(m), act = {};
      for (const n of ['idle', 'walk', 'run']) {
        act[n] = mixer.clipAction(A.clips[n]).play();
        act[n].setEffectiveWeight(n === 'idle' ? 1 : 0);
        if (n !== 'idle') act[n].timeScale = 0;   // walk and run are timed by the stride
      }
      act.idle.time = Math.random() * A.clips.idle.duration;
      rig.clips = { mixer, act, meta: A.meta, w: { idle: 1, walk: 0, run: 0 } };
    }
  };
  // the town's people are variants of the same model (cast.js), built once per look
  const ready = (base) => (base && look.cast ? import('./cast.js').then((c) => c.castReady(base, look.cast, { SKIN, CLOTH, smoothNormals })).then(attach).catch((e) => console.warn('cast:', e)) : attach(base));
  if (calemBase) ready(calemBase); else loadCalem().then(ready);

  // jump: the posed rig's air pose, blended over whatever the clips play
  const jumpPose = () => {
    // a running leap: left knee driven up, right foot kicked back, arms opposite
    const { pose } = rig;
    const th = [-0.9, 0.5], kn = [1.4, 1.5], ft = [-0.1, 0.5], sw = [0.6, -1.4], ab = [0.4, 0.4], el = [-0.6, -1.2];
    ['L', 'R'].forEach((s, i) => {
      const sg = i ? -1 : 1;
      pose(s + 'Thigh', [[1, 0, 0, th[i]], [0, 0, 1, sg * 0.02]]);
      pose(s + 'Leg', [[1, 0, 0, kn[i]]]);
      pose(s + 'Foot', [[1, 0, 0, ft[i]]]);
      pose(s + 'ArmA', [[1, 0, 0, sw[i]], [0, 0, 1, sg * ab[i]], [0, 0, 1, -sg * Math.PI / 2]]);
      pose(s + 'ForeArm', [[0, 1, 0, sg * el[i]]]);
    });
    pose('Spine2', [[1, 0, 0, 0.15]]);
    pose('Head', [[1, 0, 0, -0.1]]);
  };
  const JUMP_BONES = ['LThigh', 'RThigh', 'LLeg', 'RLeg', 'LFoot', 'RFoot', 'LArmA', 'RArmA', 'LForeArm', 'RForeArm', 'Spine2', 'Head'];
  const saved = JUMP_BONES.map(() => new THREE.Quaternion());
  const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  let airW = 0, wasAir = false, land = 1;
  const TEMPO_MAX = 2;   // fastest a clip plays; past that the stride slides
  const clipAnimate = (dt, speed, air) => {
    const { mixer, act, meta, w } = rig.clips, k = rig.k;
    const dW = act.walk.getClip().duration, dR = act.run.getClip().duration;
    const vW = meta.walk.stride * k / dW, vR = meta.run.stride * k / dR;   // the clips' own speeds, m/s
    // weights: idle -> walk -> run by speed, eased so starts and stops don't snap
    const loco = smooth(0.05, Math.max(0.3, vW * 0.5), speed), rb = smooth(vW * 1.3, vR * 1.15, speed);
    const tw = { idle: 1 - loco, walk: loco * (1 - rb), run: loco * rb }, e = 1 - Math.exp(-dt * 10);
    for (const n in tw) { w[n] += (tw[n] - w[n]) * e; act[n].setEffectiveWeight(w[n]); }
    // one phase for walk and run (0 = left foot forward), advanced so the planted foot keeps pace with the ground
    const stride = THREE.MathUtils.lerp(meta.walk.stride, meta.run.stride, rb) * k;
    const tempo = THREE.MathUtils.lerp(1 / dW, 1 / dR, rb);
    if (!air) phase = (phase + dt * Math.min(Math.max(speed, vW * 0.6) / stride, tempo * TEMPO_MAX)) % 1;
    act.walk.time = ((phase + meta.walk.lead) % 1) * dW;
    act.run.time = ((phase + meta.run.lead) % 1) * dR;
    mixer.update(dt);
    // a sprint past the run clip's own speed leans into it
    const lean = smooth(vR * 1.2, vR * 3.5, speed) * (1 - airW);
    if (lean > 0.001) { rig.bend('Spine2', 1, 0, 0, lean * 0.14); rig.bend('Spine3', 1, 0, 0, lean * 0.07); rig.bend('Head', 1, 0, 0, -lean * 0.12); }
    // the air pose takes over off the ground; a short dip on landing
    airW += ((air ? 1 : 0) - airW) * (1 - Math.exp(-dt * (air ? 14 : 9)));
    if (wasAir && !air) land = 0;
    wasAir = air;
    if (airW > 0.002) {
      JUMP_BONES.forEach((n, i) => rig.bones[n] && saved[i].copy(rig.bones[n].quaternion));
      jumpPose();
      JUMP_BONES.forEach((n, i) => { const b = rig.bones[n]; if (b) b.quaternion.copy(saved[i].slerp(b.quaternion, airW)); });
    }
    land = Math.min(1, land + dt / 0.22);
    rig.holder.position.y = rig.y0 - Math.sin(land * Math.PI) * 0.05 * (land < 1 ? 1 : 0) - airW * 0.03;
  };

  actor.animate = (dt, speed, air, t) => {
    if (!rig) return fb.animate(dt, speed, air, t);
    if (rig.clips) { clipAnimate(dt, speed, air); rig.cloth?.update(dt, speed, air, t); return blinkStep(dt); }
    const { pose } = rig;
    const run = Math.min(1, speed / 7), sw = speed > 0.1 ? Math.min(1, speed / 3) : 0;
    phase += dt * (speed > 0.1 ? 2.2 + speed * 1.15 : 0);
    idleT += dt;
    const a = Math.sin(phase) * (0.55 + run * 0.35) * sw, kb = (0.7 + run * 0.6) * sw;
    // legs: hip swing, knee bend, ankle follow (angles as in the procedural rig)
    const hipA = [air ? -0.75 : a, air ? 0.35 : -a];
    const kneeA = [air ? 1.1 : Math.max(0, -Math.sin(phase + 0.6)) * kb + 0.04, air ? 0.5 : Math.max(0, Math.sin(phase + 0.6)) * kb + 0.04];
    ['L', 'R'].forEach((s, i) => {
      pose(s + 'Thigh', [[1, 0, 0, hipA[i]], [0, 0, 1, (i ? -1 : 1) * 0.02]]);
      pose(s + 'Leg', [[1, 0, 0, kneeA[i]]]);
      pose(s + 'Foot', [[1, 0, 0, air ? -0.3 : -(hipA[i] + kneeA[i]) * 0.35 + (kneeA[i] > 0.3 ? 0.25 : 0)]]);
    });
    // arms: drop from the T pose to the sides, then swing; elbows and relaxed fingers
    ['L', 'R'].forEach((s, i) => {
      const sg = i ? -1 : 1;          // +x is the left side
      const swing = air ? -2.4 + (i ? 0 : 0.5) : -sg * a * 0.9 + Math.sin(idleT * 1.3 + i) * 0.02;
      const abd = sg * (air ? 0.55 : 0.16 + run * 0.08 + Math.sin(idleT * 2) * 0.01);
      pose(s + 'ArmA', [[1, 0, 0, swing], [0, 0, 1, abd], [0, 0, 1, -sg * Math.PI / 2], [1, 0, 0, sg * 0.0]]);
      const el = air ? -0.4 : -0.22 - (0.4 + run * 1.0) * sw;
      pose(s + 'ForeArm', [[0, 1, 0, sg * el]]);
      pose(s + 'Hand', [[0, 1, 0, sg * -0.1]]);
      for (const f of ['B', 'C', 'D']) for (let j = 1; j <= 3; j++) pose(`${s}Finger${f}${j}`, [[0, 0, 1, -sg * (0.25 + j * 0.12 + run * 0.3)]]);
      pose(s + 'FingerA1', [[0, 1, 0, sg * -0.2]]);
    });
    const bob = speed > 0.1 ? Math.abs(Math.sin(phase)) * (0.035 + run * 0.03) * sw : Math.sin(t * 2) * 0.004;
    rig.holder.position.y = rig.y0 + bob - (air ? 0.04 : 0);
    const twist = Math.sin(phase) * 0.14 * sw;
    pose('Hips', [[0, 1, 0, -twist * 0.5]]);
    pose('Spine2', [[1, 0, 0, run * 0.18 * sw + (air ? -0.08 : 0)], [0, 1, 0, twist * 0.6]]);
    pose('Spine3', [[1, 0, 0, run * 0.07 * sw + Math.sin(t * 2) * 0.012 * (1 - sw)], [0, 1, 0, twist * 0.4]]);
    pose('Neck', [[1, 0, 0, -run * 0.06 * sw]]);
    pose('Head', [[1, 0, 0, -run * 0.1 * sw + (air ? 0.1 : 0)], [0, 1, 0, -twist * 0.6 + (sw ? 0 : Math.sin(idleT * 0.4) * 0.15)]]);
    rig.cloth?.update(dt, speed, air, t);
    blinkStep(dt);
  };
  // blink: the eye atlas has closed eyes two cells to the right
  const blinkStep = (dt) => {
    blink -= dt;
    if (rig.eyes) {
      rig.eyes.offset.x = blink < 0 ? 0.5 : 0;
      if (blink < -0.12) blink = 2 + Math.random() * 4;
    }
  };
  return actor;
}
