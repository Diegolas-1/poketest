// Ash's clothes on the local base model (web/world/local/ash.glb): an open
// jacket that hangs off the body, loose short sleeves and baggy jeans, built in
// code as real garments over the body instead of paint on it.
//
// Every garment is a thin closed slab (outside, lining and edges) so the ink
// hull outlines its rims too, skinned to the body's bones near where it is
// sewn on (weights copied from the body surface underneath) and to extra
// "cloth bones" further out. The cloth bones are driven by a small verlet sim:
// a few particles per garment (the jacket in fifteen panels, each a chest-to-mid
// and a mid-to-hem link; four round each sleeve hem and each trouser hem) hang
// from pins on the body under gravity, feel the air (wind gusts, and the head wind
// of running), keep their lengths, spring back towards their rest shape and are
// pushed out of the body (chest, waist, hips, thighs, arms, shins) at its current
// pose. The jacket is cut to hang straight down from the chest, clear of the body
// beneath, and its panels move as one piece (linked, and smoothed towards each
// other) so the hem stays a clean line; the shirt under it is drawn in a little
// so the body never shows through. So the jacket trails and lifts when running,
// swings on turns and stops, and barely stirs at idle. A few dozen particles,
// solved on the CPU; the meshes are skinned on the GPU like the rest of the body.
//
//   dressAsh(model, base) -> { update(dt, speed, air, t) }
// model: a fresh clone of base.scene, still in its rest pose and not yet
// parented (call before the ink hulls are made, so the garments get theirs).
import * as THREE from 'three';
import { toon } from './toon.js';

const CLOTH = { bands: [0.1, 0.3, 0.62], deep: [0.5, 0.52, 0.7], shade: [0.7, 0.74, 0.9], lit: [1.05, 1.04, 1.0], litAdd: [0.02, 0.02, 0.01] };
const TAU = Math.PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sm = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const lerp = THREE.MathUtils.lerp;
// piecewise linear table lookup: rows [y, ...values], y descending or ascending
function table(rows, y) {
  const asc = rows[0][0] < rows[rows.length - 1][0], r = asc ? rows : [...rows].reverse();
  if (y <= r[0][0]) return r[0].slice(1);
  for (let i = 1; i < r.length; i++) if (y <= r[i][0]) {
    const a = r[i - 1], b = r[i], u = (y - a[0]) / (b[0] - a[0]);
    return a.slice(1).map((v, k) => lerp(v, b[k + 1], u));
  }
  return r[r.length - 1].slice(1);
}

// ---------- the body in its rest pose ----------
function triangles(posOf, count, uvOf, keep) {
  const out = [];
  for (let t = 0; t < count; t += 3) {
    const v = [posOf(t), posOf(t + 1), posOf(t + 2)];
    if (keep && !keep(v)) continue;
    out.push({ v, uv: uvOf ? [uvOf(t), uvOf(t + 1), uvOf(t + 2)] : null });
  }
  return out;
}
function meshTris(mesh, keep) {
  const g = mesh.geometry, p = g.attributes.position, uv = g.attributes.uv, ix = g.index;
  const id = (t) => (ix ? ix.getX(t) : t);
  return triangles((t) => V3().fromBufferAttribute(p, id(t)), ix ? ix.count : p.count,
    uv && ((t) => new THREE.Vector2().fromBufferAttribute(uv, id(t))), keep);
}
// farthest hit of a ray from inside a body part, closer than tMax
const _e1 = V3(), _e2 = V3(), _p = V3(), _t = V3(), _q = V3();
function cast(T, o, d, tMax) {
  let best = null;
  for (const tr of T) {
    const [a, b, c] = tr.v;
    _e1.subVectors(b, a); _e2.subVectors(c, a); _p.crossVectors(d, _e2);
    const det = _e1.dot(_p); if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det; _t.subVectors(o, a);
    const u = _t.dot(_p) * inv; if (u < 0 || u > 1) continue;
    _q.crossVectors(_t, _e1);
    const v = d.dot(_q) * inv; if (v < 0 || u + v > 1) continue;
    const t = _e2.dot(_q) * inv;
    if (t > 0 && t < tMax && (!best || t > best.t)) best = { t, tr, u, v };
  }
  if (best && best.tr.uv) { const [a, b, c] = best.tr.uv; best.uv = a.clone().multiplyScalar(1 - best.u - best.v).addScaledVector(b, best.u).addScaledVector(c, best.v); }
  return best;
}
// fill gaps (no hit) in a ring of radii from their neighbours, then smooth it
function fixRing(r, loop, passes = 0, w = 0.25) {
  const n = r.length;
  for (let k = 0; k < n; k++) if (r[k] == null) {
    let a = k, b = k;
    while (a > 0 && r[a] == null) a--; while (b < n - 1 && r[b] == null) b++;
    r[k] = r[a] ?? r[b] ?? 0.05;
  }
  for (let p = 0; p < passes; p++) {
    const s = r.slice();
    for (let k = 0; k < n; k++) {
      const km = loop ? (k - 1 + n) % n : Math.max(0, k - 1), kp = loop ? (k + 1) % n : Math.min(n - 1, k + 1);
      r[k] = s[k] * (1 - 2 * w) + (s[km] + s[kp]) * w;
    }
  }
  return r;
}
function pixels(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  return { c, x, d: x.getImageData(0, 0, c.width, c.height) };
}
function sample(px, uv) {
  const { width: w, height: h, data } = px.d;
  const i = (Math.min(h - 1, Math.max(0, Math.floor(uv.y * h))) * w + Math.min(w - 1, Math.max(0, Math.floor(uv.x * w)))) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}
const css = ([r, g, b], k = 1) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
function texOf(canvas, like) {
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
  if (like) { t.wrapS = like.wrapS; t.wrapT = like.wrapT; t.anisotropy = like.anisotropy; }
  return t;
}

// ---------- garment geometry ----------
// grows one BufferGeometry: positions, uvs and 4 bone weights per vertex
class Build {
  constructor() { this.pos = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; }
  v(p, uv, w) {
    this.pos.push(p.x, p.y, p.z); this.uv.push(uv[0], uv[1]);
    for (let k = 0; k < 4; k++) { this.si.push(w[k] ? w[k][0] : 0); this.sw.push(w[k] ? w[k][1] : 0); }
    return this.pos.length / 3 - 1;
  }
  tri(a, b, c, n) {   // a triangle facing along n
    const P = (i) => V3(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
    const pa = P(a), f = P(b).sub(pa).cross(P(c).sub(pa));
    if (f.dot(n) >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx); g.computeVertexNormals();
    // ink normals averaged over vertices at the same place (rims meet the faces)
    const p = g.attributes.position, n = g.attributes.normal, acc = new Map(), key = (i) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    for (let i = 0; i < p.count; i++) { const k = key(i), a = acc.get(k) || [0, 0, 0]; a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(k, a); }
    const out = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const a = acc.get(key(i)), l = Math.hypot(...a) || 1; out.set([a[0] / l, a[1] / l, a[2] / l], i * 3); }
    g.setAttribute('inkN', new THREE.BufferAttribute(out, 3));
    g.computeBoundingSphere();
    return g;
  }
}
// a cloth slab from a grid of outside points P[i][j]: the outside, a lining
// th further in, and edge strips along the rims asked for. o.loop: the last
// column repeats the first (a tube). o.out(p): roughly outwards.
function slab(B, P, W, th, o) {
  const NI = P.length, NJ = P[0].length;
  const N = P.map((row, i) => row.map((p, j) => {
    let jm = j - 1, jp = j + 1;
    if (o.loop) { if (jm < 0) jm = NJ - 2; if (jp > NJ - 1) jp = 1; } else { jm = Math.max(0, jm); jp = Math.min(NJ - 1, jp); }
    const du = P[i][jp].clone().sub(P[i][jm]), dv = P[Math.min(NI - 1, i + 1)][j].clone().sub(P[Math.max(0, i - 1)][j]);
    const n = du.cross(dv).normalize();
    return n.dot(o.out(p, i, j)) < 0 ? n.negate() : n;
  }));
  const Q = P.map((row, i) => row.map((p, j) => p.clone().addScaledVector(N[i][j], -th)));
  const O = P.map((row, i) => row.map((p, j) => B.v(p, o.uvO(i, j), W[i][j])));
  const I = Q.map((row, i) => row.map((p, j) => B.v(p, o.uvI(i, j), W[i][j])));
  for (let i = 0; i < NI - 1; i++) for (let j = 0; j < NJ - 1; j++) {
    const n = N[i][j].clone().add(N[i + 1][j + 1]), m = n.clone().negate();
    B.tri(O[i][j], O[i][j + 1], O[i + 1][j + 1], n); B.tri(O[i][j], O[i + 1][j + 1], O[i + 1][j], n);
    B.tri(I[i][j], I[i][j + 1], I[i + 1][j + 1], m); B.tri(I[i][j], I[i + 1][j + 1], I[i + 1][j], m);
  }
  // rims: a strip from outside to lining along one boundary, facing away from the cloth
  const rim = (pts, inward) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [i0, j0] = pts[k], [i1, j1] = pts[k + 1];
      const a = B.v(P[i0][j0], o.rimUV, W[i0][j0]), b = B.v(P[i1][j1], o.rimUV, W[i1][j1]);
      const c = B.v(Q[i1][j1], o.rimUV, W[i1][j1]), d = B.v(Q[i0][j0], o.rimUV, W[i0][j0]);
      const [ii, jj] = inward(i0, j0), away = P[i0][j0].clone().sub(P[ii][jj]);
      B.tri(a, b, c, away); B.tri(a, c, d, away);
    }
  };
  const row = (i) => Array.from({ length: NJ }, (_, j) => [i, j]), col = (j) => Array.from({ length: NI }, (_, i) => [i, j]);
  if (o.rims.bottom) rim(row(NI - 1), (i, j) => [i - 1, j]);
  if (o.rims.top) rim(row(0), (i, j) => [i + 1, j]);
  if (o.rims.left) rim(col(0), (i, j) => [i, j + 1]);
  if (o.rims.right) rim(col(NJ - 1), (i, j) => [i, j - 1]);
}

// ---------- the kit: geometry, materials and sim layout, made once per base ----------
const ZC = 0.004;   // the torso's axis, front to back (model units)
// jacket rows, top (sewn into the painted yoke) to hem; pins, mid and hem rows of the sim
// (the hem just over the belt, at the top of the hip, as on the anime jacket)
const JY = [0.958, 0.945, 0.93, 0.91, 0.89, 0.87, 0.85, 0.83, 0.81, 0.79, 0.77, 0.75, 0.73, 0.712, 0.695];
const J_PIN = 3, J_MID = 8, J_HEM = 14, J_NC = 42, J_NS = 15, J_STEP = 3;
// sleeve rings along the arm (T pose, model x), and their looseness
const SX = [0.074, 0.086, 0.10, 0.12, 0.145, 0.17, 0.195, 0.215, 0.236];
const S_OFF = [-0.007, 0.0, 0.004, 0.008, 0.011, 0.014, 0.017, 0.020, 0.024];
const S_MIN = [0, 0, 0, 0.042, 0.045, 0.048, 0.051, 0.054, 0.057];
const S_PIN = 5, S_NC = 16, ARM_Y = 1.02, ARM_Z = -0.008;
// trousers: rings top to hem; leg section [y, cx, cz, out, in, front, back] and hip section [y, rx, front, back]
const PY = [0.745, 0.725, 0.705, 0.685, 0.665, 0.645, 0.625, 0.605, 0.58, 0.55, 0.52, 0.49, 0.46, 0.43, 0.405, 0.38, 0.355, 0.33, 0.31, 0.29, 0.272, 0.256, 0.242, 0.229, 0.217, 0.205, 0.19];
const LEG = [[0.60, 0.06, 0.006, 0.072, 0.057, 0.074, 0.068], [0.52, 0.06, 0.006, 0.068, 0.053, 0.069, 0.064], [0.44, 0.06, 0.008, 0.064, 0.051, 0.065, 0.060],
  [0.38, 0.06, 0.010, 0.062, 0.050, 0.064, 0.058], [0.30, 0.06, 0.009, 0.062, 0.051, 0.064, 0.059], [0.24, 0.06, 0.011, 0.066, 0.055, 0.070, 0.064], [0.19, 0.06, 0.013, 0.069, 0.058, 0.075, 0.066]];
const HIP = [[0.745, 0.121, 0.087, 0.079], [0.70, 0.124, 0.084, 0.08], [0.66, 0.129, 0.081, 0.084], [0.60, 0.131, 0.079, 0.083]];
const P_PIN = 16, P_NC = 24;

function buildKit(base) {
  const meshes = {};
  base.scene.traverse((o) => { if (o.isSkinnedMesh) meshes[o.material.name] = o; });
  const top = meshes.topsjer, bot = meshes.btmsskin;
  // rest matrices of the body's bones (model space)
  const restM = {}, restQ = {};
  base.scene.traverse((b) => { if (b.isBone) { restM[b.name] = b.matrixWorld.clone(); restQ[b.name] = b.getWorldQuaternion(new THREE.Quaternion()); } });
  const names = [], slot = (n) => { let i = names.indexOf(n); if (i < 0) { i = names.length; names.push(n); } return i; };
  // weights: {bone: w} -> the 4 biggest as [[slot, w]], normalised
  const pack = (m) => {
    const e = Object.entries(m).filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4), s = e.reduce((a, [, w]) => a + w, 0) || 1;
    return e.map(([n, w]) => [slot(n), w / s]);
  };
  const mix = (...parts) => { const m = {}; for (const [k, src] of parts) if (k > 0) for (const n in src) m[n] = (m[n] || 0) + src[n] * k; return m; };
  // the body's own weights near a point: the closest vertices, by inverse square distance
  const tp = top.geometry.attributes.position, tsi = top.geometry.attributes.skinIndex, tsw = top.geometry.attributes.skinWeight, tb = top.skeleton.bones;
  const bodyW = (p, keep, k = 4, most = 4) => {
    const near = [];
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i);
      if (keep && !keep(x, y, z)) continue;
      const d = (x - p.x) ** 2 + (y - p.y) ** 2 + (z - p.z) ** 2;
      if (near.length < k || d < near[near.length - 1][0]) { near.push([d, i]); near.sort((a, b) => a[0] - b[0]); if (near.length > k) near.pop(); }
    }
    const m = {};
    for (const [d, i] of near) for (let c = 0; c < 4; c++) { const w = tsw.getComponent(i, c); if (w > 0) { const n = tb[tsi.getComponent(i, c)].name; m[n] = (m[n] || 0) + w / (d + 1e-7); } }
    const e = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, most), s = e.reduce((a, [, w]) => a + w, 0);
    return Object.fromEntries(e.map(([n, w]) => [n, w / s]));
  };

  // ----- colours from the body's own textures -----
  const topPx = pixels(top.material.map.image), botPx = pixels(bot.material.map.image);
  const torsoT = meshTris(top, (v) => v.every((p) => Math.abs(p.x) < 0.13));
  const ray = (T, y, th, tMax = 0.2) => cast(T, V3(0, y, ZC), V3(Math.sin(th), 0, Math.cos(th)), tMax);
  const shirtC = sample(topPx, ray(torsoT, 0.85, 0).uv);
  const blueC = sample(topPx, ray(torsoT, 0.86, 2.4).uv);
  const armT = (s) => meshTris(top, (v) => v.every((p) => p.x * s > 0.03 && p.x * s < 0.3 && p.y > 0.93));
  const armTL = armT(1), armTR = armT(-1);
  const armRay = (T, s, x, ps, tMax = 0.08) => cast(T, V3(s * x, ARM_Y, ARM_Z), V3(0, Math.cos(ps), Math.sin(ps)), tMax);
  const whiteC = sample(topPx, armRay(armTL, 1, 0.15, 0).uv), skinC = sample(topPx, armRay(armTL, 1, 0.27, 0).uv);
  const legT = meshTris(bot, (v) => v.every((p) => p.x > 0.01));
  const jeanHit = cast(legT, V3(0.058, 0.5, 0.005), V3(0, 0, 1), 0.2);
  const jeanC = jeanHit ? sample(botPx, jeanHit.uv) : [122, 168, 226];
  // where the painted yoke opens at the front, at the jacket's top
  let gTop = 0.3;
  for (let th = 0.05; th < 1.2; th += 0.01) {
    const h = ray(torsoT, 0.952, th); if (!h) continue;
    const [r, g, b] = sample(topPx, h.uv);
    if (b > r + 50 && b > 120) { gTop = th; break; }
  }

  // ----- the body under the jacket: paint the old vest and sleeves as the black shirt -----
  {
    const { c, x, d } = topPx, w = c.width, h = c.height, px = d.data;
    const p = top.geometry.attributes.position, uv = top.geometry.attributes.uv, ix = top.geometry.index;
    const n = ix ? ix.count : p.count, id = (t) => (ix ? ix.getX(t) : t);
    const P = [V3(), V3(), V3()], U = [V3(), V3(), V3()], q = V3();
    for (let t = 0; t < n; t += 3) {
      for (let k = 0; k < 3; k++) { P[k].fromBufferAttribute(p, id(t + k)); U[k].set(uv.getX(id(t + k)) * w, uv.getY(id(t + k)) * h, 0); }
      const x0 = Math.floor(Math.min(U[0].x, U[1].x, U[2].x)) - 1, x1 = Math.ceil(Math.max(U[0].x, U[1].x, U[2].x)) + 1;
      const y0 = Math.floor(Math.min(U[0].y, U[1].y, U[2].y)) - 1, y1 = Math.ceil(Math.max(U[0].y, U[1].y, U[2].y)) + 1;
      const den = (U[1].y - U[2].y) * (U[0].x - U[2].x) + (U[2].x - U[1].x) * (U[0].y - U[2].y);
      if (Math.abs(den) < 1e-9) continue;
      for (let yy = Math.max(0, y0); yy <= Math.min(h - 1, y1); yy++) for (let xx = Math.max(0, x0); xx <= Math.min(w - 1, x1); xx++) {
        const sx = xx + 0.5, sy = yy + 0.5;
        const a = ((U[1].y - U[2].y) * (sx - U[2].x) + (U[2].x - U[1].x) * (sy - U[2].y)) / den;
        const b = ((U[2].y - U[0].y) * (sx - U[2].x) + (U[0].x - U[2].x) * (sy - U[2].y)) / den, cc = 1 - a - b;
        const tol = -1.2 / Math.max(8, Math.abs(den) ** 0.5);
        if (a < tol || b < tol || cc < tol) continue;
        q.copy(P[0]).multiplyScalar(a).addScaledVector(P[1], b).addScaledVector(P[2], cc);
        const ax = Math.abs(q.x);
        const col = ax < 0.125 && q.y < 0.94 ? shirtC : ax > 0.1 && ax < 0.21 && q.y > 0.95 ? skinC : null;
        if (!col) continue;
        const o = (yy * w + xx) * 4; px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2];
      }
    }
    x.putImageData(d, 0, 0);
  }
  const m0 = top.material;
  const topMat = toon('#ffffff', { map: texOf(topPx.c, m0.map), side: m0.side, cel: CLOTH }); topMat.name = 'topsjer';
  // and the shirt under the jacket's back and sides drawn in a little, so the body
  // cannot reach through the cloth when the spine bends (the opening keeps its shape)
  const gap = (y) => gTop + 0.28 * sm(JY[0], JY[J_HEM], y);
  const topGeo = top.geometry.clone();
  {
    const p = topGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i) - ZC;
      if (Math.abs(x) > 0.14) continue;
      const w = sm(0.94, 0.91, y) * sm(0.665, 0.70, y) * sm(gap(y) - 0.02, gap(y) + 0.35, Math.abs(Math.atan2(x, z)));
      const r = Math.hypot(x, z); if (w <= 0 || r < 1e-4) continue;
      const k = Math.max(0.8, 1 - 0.013 * w / r);
      p.setX(i, x * k); p.setZ(i, ZC + z * k);
    }
    p.needsUpdate = true; topGeo.computeBoundingSphere();
  }

  // ----- textures for the new garments -----
  const canvas = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return c; };
  const navy = css(blueC, 0.62), ink = '#2f2b36';
  const jacketTex = texOf(canvas(256, 128, (g, w, h) => {
    g.fillStyle = css(blueC); g.fillRect(0, 0, w / 2, h);
    g.fillStyle = navy; g.fillRect(w / 2, 0, w / 2, h);
    // the yellow flap pockets on the chest, one on each front panel
    const vOf = (y) => (JY[0] - y) / (JY[0] - JY[J_HEM]);
    g.fillStyle = '#f5c433';
    for (const u of [0.07, 0.93]) g.fillRect(u * w / 2 - 6, vOf(0.80) * h - 2, 12, 4);
    // a darker seam down each side and the hem's stitch line
    g.fillStyle = css(blueC, 0.8);
    for (const u of [0.25, 0.75]) g.fillRect(u * w / 2 - 0.5, vOf(0.93) * h, 1, h);
    g.fillRect(0, h - 5, w / 2, 1);
  }), null);
  const sleeveTex = texOf(canvas(64, 64, (g, w, h) => {
    g.fillStyle = css(whiteC); g.fillRect(0, 0, w / 2, h);
    g.fillStyle = css(whiteC, 0.8); g.fillRect(w / 2, 0, w / 2, h);
    g.fillStyle = css(whiteC, 0.86); g.fillRect(0, h - 6, w / 2, 1);   // hem stitch
  }), null);
  const pantsTex = texOf(canvas(256, 256, (g, w, h) => {
    const W2 = w / 2, vOf = (y) => (PY[0] - y) / (PY[0] - 0.18) * h, uOf = (ph) => ph / TAU * W2;
    g.fillStyle = css(jeanC); g.fillRect(0, 0, W2, h);
    g.fillStyle = css(jeanC, 0.66); g.fillRect(W2, 0, W2, h);
    g.strokeStyle = css(jeanC, 0.78); g.lineWidth = 1.4; g.lineCap = 'round';
    const line = (pts) => { g.beginPath(); pts.forEach(([ph, y], i) => (i ? g.lineTo(uOf(ph), vOf(y)) : g.moveTo(uOf(ph), vOf(y)))); g.stroke(); };
    line([[Math.PI / 2, 0.73], [Math.PI / 2, 0.19]]);           // outer seam
    line([[1.5 * Math.PI, 0.6], [1.5 * Math.PI, 0.19]]);        // inner seam
    line([[0.02, 0.73], [0.05, 0.64]]);                        // fly
    line([[0.35, 0.735], [0.75, 0.69], [1.25, 0.70]]);          // front pocket
    line([[2.6, 0.725], [2.65, 0.66], [3.0, 0.65], [3.05, 0.715]]);   // back pocket
    // creases: behind the knee, and the folds bunched over the shoe
    g.strokeStyle = css(jeanC, 0.82); g.lineWidth = 1.1;
    line([[2.7, 0.4], [3.1, 0.385], [3.5, 0.4]]);
    line([[0.3, 0.45], [0.6, 0.43]]);
    for (const [y, a, b] of [[0.31, 0.2, 1.1], [0.285, 3.6, 4.6], [0.262, 0.8, 1.9], [0.25, 4.8, 5.9], [0.232, 2.2, 3.3], [0.278, 5.4, 6.2]]) line([[a, y], [(a + b) / 2, y - 0.008], [b, y]]);
    // belt, under the jacket, and the hem line
    g.fillStyle = '#c8343a'; g.fillRect(0, 0, W2, vOf(0.728));
    g.fillStyle = '#e9e4d0'; g.fillRect(0, 0, 4, vOf(0.729)); g.fillRect(W2 - 4, 0, 4, vOf(0.729));
    g.fillStyle = ink; g.fillRect(0, h - 3, W2, 3);
  }), null);
  const mat = (map, name) => { const m = toon('#ffffff', { map, cel: CLOTH }); m.name = name; return m; };

  // ----- trousers -----
  const pantPoint = (s, y, ph) => {
    const [cx, cz, ro, ri, rf, rb] = table(LEG, y), [hx, hf, hb] = table(HIP, y);
    const sn = Math.sin(ph), cs = Math.cos(ph);
    // folds bunched over the shoes, slanting a little round the leg
    let bunch = 0;
    [[0.212, 1], [0.24, 0.85], [0.268, 0.6], [0.297, 0.35]].forEach(([fy, a], k) => {
      const dy = (y - fy - 0.007 * Math.sin(2 * ph + k * 1.7)) / 0.009;
      bunch += a * Math.exp(-dy * dy) * (0.65 + 0.35 * Math.sin(3 * ph + k * 2.1));
    });
    const grow = 1 + bunch * 0.11;
    const leg = V3(s * (cx + (sn > 0 ? ro : ri) * grow * sn), y, cz + (cs > 0 ? rf : rb) * grow * cs);
    const hip = V3(s * Math.max(hx * sn, -0.012), y, ZC + (cs > 0 ? hf : hb) * cs);
    const p = hip.lerp(leg, sm(0.70, 0.575, y));
    p.y += 0.016 * cs * sm(0.26, 0.19, y);   // the hem breaks lower at the heel
    return p;
  };
  const pantSecs = 4;
  const PB = new Build(), pantChains = [];
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    const P = PY.map((y) => Array.from({ length: P_NC + 1 }, (_, j) => pantPoint(s, y, j / P_NC * TAU)));
    const W = PY.map((y) => Array.from({ length: P_NC + 1 }, (_, j) => {
      const tH = sm(0.745, 0.70, y), tT = sm(0.70, 0.60, y), tK = sm(0.43, 0.34, y), dyn = sm(PY[P_PIN] - 0.005, 0.31, y);
      const f = (j / P_NC) * pantSecs, s0 = Math.floor(f) % pantSecs, s1 = (s0 + 1) % pantSecs, u = f - Math.floor(f);
      return pack(mix([1 - tH, { Spine1: 0.25, Waist: 0.45, Hips: 0.3 }], [tH * (1 - tT), { Hips: 1 }],
        [tH * tT * (1 - dyn), { [L + 'Thigh']: 1 - tK, [L + 'Leg']: tK }],
        [dyn * (1 - u), { [`clP${L}${s0}`]: 1 }], [dyn * u, { [`clP${L}${s1}`]: 1 }]));
    }));
    const ctr = (p) => V3(s * lerp(0.05, 0.06, sm(0.70, 0.575, p.y)), p.y, ZC);
    slab(PB, P, W, 0.004, {
      loop: true, out: (p) => p.clone().sub(ctr(p)),
      uvO: (i, j) => [j / P_NC * 0.5, (PY[0] - PY[i]) / (PY[0] - 0.18)], uvI: (i, j) => [0.5 + j / P_NC * 0.5, (PY[0] - PY[i]) / (PY[0] - 0.18)],
      rimUV: [0.75, 0.5], rims: { top: true, bottom: true },
    });
    for (let k = 0; k < pantSecs; k++) {
      const ph = k / pantSecs * TAU;
      pantChains.push({
        parent: L + 'Leg', bones: [`clP${L}${k}`], rest: [pantPoint(s, PY[P_PIN], ph), pantPoint(s, PY[PY.length - 1], ph)],
        ks: [160], drag: [0.5], flut: 0.25, cone: [0.22],
        coll: [{ bone: L + 'Leg', axis: [V3(s * 0.056, 0.381, 0.005), V3(s * 0.056, 0.083, -0.005)], r: 0.056 }],
      });
    }
  }

  // ----- jacket -----
  const pantT = triangles((t) => V3(PB.pos[PB.idx[t] * 3], PB.pos[PB.idx[t] * 3 + 1], PB.pos[PB.idx[t] * 3 + 2]), PB.idx.length);
  const bodyT = torsoT.concat(pantT);
  const thOf = (i, j) => { const g = gap(JY[i]); return g + (j / J_NC) * (TAU - 2 * g); };
  const ringAt = (y, i) => fixRing(Array.from({ length: J_NC + 1 }, (_, j) => ray(bodyT, y, thOf(i, j))?.t ?? null), false);
  const RB = JY.map((y, i) => ringAt(y, i));
  // the cloth hangs from the chest: below it, each column falls straight down
  // outside everything beneath it (to a little under the hem, the hips it has to
  // clear), like a curtain, instead of following the body's dips in and out.
  // Sewn on at the yoke, it eases from the body's shape into that fall by the mid row.
  const CU = RB.map((r) => r.slice()), under = [JY[J_HEM] - 0.012, JY[J_HEM] - 0.024].map((y) => ringAt(y, J_HEM));
  for (let j = 0; j <= J_NC; j++) {
    let m = Math.max(...under.map((r) => r[j]));
    for (let i = J_HEM; i >= 0; i--) { m = Math.max(m, RB[i][j]); CU[i][j] = m; }
  }
  for (const r of CU) fixRing(r, false, 3);
  const RD = RB.map((r, i) => r.map((v, j) => Math.max(v, lerp(v, CU[i][j], sm(JY[J_PIN] + 0.012, JY[J_MID] + 0.01, JY[i])))));
  // standing off the shirt: tucked into the painted yoke at the top, a finger's width clear further down
  const offJ = (y) => (y > 0.945 ? lerp(-0.007, 0, (0.958 - y) / 0.013) : y > 0.93 ? lerp(0, 0.004, (0.945 - y) / 0.015) : 0.004 + 0.009 * sm(0.93, JY[J_MID], y));
  const JP = JY.map((y, i) => Array.from({ length: J_NC + 1 }, (_, j) => { const th = thOf(i, j), r = RD[i][j] + offJ(y); return V3(r * Math.sin(th), y, ZC + r * Math.cos(th)); }));
  const torsoKeep = (x) => Math.abs(x) < 0.13;
  const JW = JY.map((y, i) => Array.from({ length: J_NC + 1 }, (_, j) => {
    const rig = sm(JY[J_PIN] - 0.026, JY[J_PIN], y), toB = sm(JY[J_MID] + 0.03, JY[J_MID] - 0.04, y);
    const f = j / J_STEP, s0 = Math.min(Math.floor(f), J_NS - 2), u = f - s0;
    return pack(mix([rig, rig > 0 ? bodyW(JP[i][j], torsoKeep, 4, 2) : {}],
      [(1 - rig) * (1 - toB) * (1 - u), { [`clJ${s0}a`]: 1 }], [(1 - rig) * (1 - toB) * u, { [`clJ${s0 + 1}a`]: 1 }],
      [(1 - rig) * toB * (1 - u), { [`clJ${s0}b`]: 1 }], [(1 - rig) * toB * u, { [`clJ${s0 + 1}b`]: 1 }]));
  }));
  const JB = new Build();
  slab(JB, JP, JW, 0.0045, {
    out: (p) => V3(p.x, 0, p.z - ZC),
    uvO: (i, j) => [j / J_NC * 0.5, (JY[0] - JY[i]) / (JY[0] - JY[J_HEM])], uvI: (i, j) => [0.5 + j / J_NC * 0.5, (JY[0] - JY[i]) / (JY[0] - JY[J_HEM])],
    rimUV: [0.75, 0.5], rims: { bottom: true, left: true, right: true },
  });
  // the body's girth all round, for the sim's collisions: the chest at the mid row,
  // the waist between mid and hem, and the hips under the hem
  const ringProf = (y) => fixRing(Array.from({ length: 48 }, (_, k) => ray(bodyT, y, k / 48 * TAU)?.t ?? null), true, 1);
  const profMid = ringProf(JY[J_MID]), profWaist = ringProf(0.75), profHem = ringProf(JY[J_HEM] - 0.01);
  const thighCaps = ['L', 'R'].map((L, i) => { const s = i ? -1 : 1; return { bone: L + 'Thigh', seg: [V3(s * 0.058, 0.69, 0.004), V3(s * 0.06, 0.42, 0.008)], r: 0.079 }; });
  const jacketChains = [];
  for (let s = 0; s < J_NS; s++) {
    const j = s * J_STEP, edge = s === 0 || s === J_NS - 1;
    // a medium-weight cloth: held near its hang by a firm spring (ks) with damping
    // relative to the body (damp), its swing speed off the body capped (vmax), the
    // air's pull modest (drag), within a cone round the hang. The targets ride
    // partly with the hips (hang), as cloth resting on them would.
    jacketChains.push({
      parent: 'Spine2', bones: [`clJ${s}a`, `clJ${s}b`], rest: [JP[J_PIN][j], JP[J_MID][j], JP[J_HEM][j]],
      ks: [42, 30], drag: [0.5, edge ? 0.95 : 0.8], damp: 5, vmax: 1.5, flut: edge ? 0.7 : 0.5, cone: edge ? [0.5, 0.65] : [0.42, 0.55],
      hangBone: 'Hips', hang: [0, 0.2, 0.45], quad: true,
      coll: [{ bone: 'Spine1', ring: profMid, pad: 0.008 },
        { bone: 'Hips', ring: profHem, pad: 0.011, caps: thighCaps, mid: { bone: 'Spine1', ring: profWaist, pad: 0.009 } }],
    });
  }

  // ----- sleeves -----
  const SB = new Build(), sleeveChains = [];
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R', T = s > 0 ? armTL : armTR;
    const psOf = (j) => j / S_NC * TAU;   // 0 = up, then towards the front
    const R = SX.map((x, i) => {
      const r = fixRing(Array.from({ length: S_NC }, (_, j) => armRay(T, s, x, psOf(j))?.t ?? null), true, 2);
      return r.map((v) => Math.max(v + S_OFF[i], S_MIN[i]));
    });
    const point = (i, j) => { const r = R[i][j % S_NC], ps = psOf(j); return V3(s * SX[i], ARM_Y + r * Math.cos(ps), ARM_Z + r * Math.sin(ps)); };
    const P = SX.map((x, i) => Array.from({ length: S_NC + 1 }, (_, j) => point(i, j)));
    const side = (x, y) => x * s > 0.04 && y > 0.9;
    const W = SX.map((x, i) => Array.from({ length: S_NC + 1 }, (_, j) => {
      const dyn = sm(SX[S_PIN] - 0.012, SX[S_PIN] + 0.014, x);
      const f = j / S_NC * 4, s0 = Math.floor(f) % 4, s1 = (s0 + 1) % 4, u = f - Math.floor(f);
      return pack(mix([1 - dyn, bodyW(P[i][j], side, 4, dyn > 0 ? 2 : 4)], [dyn * (1 - u), { [`clS${L}${s0}`]: 1 }], [dyn * u, { [`clS${L}${s1}`]: 1 }]));
    }));
    slab(SB, P, W, 0.004, {
      loop: true, out: (p) => V3(0, p.y - ARM_Y, p.z - ARM_Z),
      uvO: (i, j) => [j / S_NC * 0.5, i / (SX.length - 1)], uvI: (i, j) => [0.5 + j / S_NC * 0.5, i / (SX.length - 1)],
      rimUV: [0.75, 0.5], rims: { bottom: true },
    });
    for (let k = 0; k < 4; k++) {
      const j = k * S_NC / 4;
      sleeveChains.push({
        parent: L + 'ArmA', bones: [`clS${L}${k}`], rest: [P[S_PIN][j], P[SX.length - 1][j]],
        ks: [80], drag: [1.1], flut: 0.6, cone: [0.4],
        coll: [{ bone: L + 'ArmA', axis: [V3(s * 0.098, ARM_Y, ARM_Z), V3(s * 0.4, ARM_Y, ARM_Z)], r: 0.043 }],
      });
    }
  }

  const chains = [...jacketChains, ...sleeveChains, ...pantChains];
  // neighbouring jacket panels stay together (not across the open front)
  const links = [];
  for (let s = 0; s < J_NS - 1; s++) for (const k of [1, 2]) links.push([s, k, s + 1, k, jacketChains[s].rest[k].distanceTo(jacketChains[s + 1].rest[k])]);
  const panels = J_NS;   // the first chains: the jacket's panels round from the right front edge
  // the cloth bones: each hangs from its pin, at rest in the model's frame (no rotation)
  const newBones = [];
  for (const c of chains) c.bones.forEach((n, k) => {
    const parent = k ? c.bones[k - 1] : c.parent;
    const pm = k ? new THREE.Matrix4().makeTranslation(c.rest[k - 1]) : restM[parent];
    newBones.push({ name: n, parent, local: pm.clone().invert().multiply(new THREE.Matrix4().makeTranslation(c.rest[k])) });
    slot(n);
  });
  const parts = [
    { name: 'ash_pants', geo: PB.geometry(), mat: mat(pantsTex, 'ash_pants') },
    { name: 'ash_jacket', geo: JB.geometry(), mat: mat(jacketTex, 'ash_jacket') },
    { name: 'ash_sleeves', geo: SB.geometry(), mat: mat(sleeveTex, 'ash_sleeves') },
  ];
  const restInv = {};
  for (const n in restM) restInv[n] = restM[n].clone().invert();
  return { names, newBones, parts, chains, links, panels, topMat, topGeo, restInv, restQ };
}

// ---------- per person: the garments on one clone, and their sim ----------
export function dressAsh(m, base) {
  const kit = base.ashKit || (base.ashKit = buildKit(base));
  const bones = {};
  m.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const drop = []; let host = null;
  m.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const n = o.material.name;
    if (n === 'btmsskin' || n === 'ash_sleeve') drop.push(o);   // the painted jeans and sleeve hems give way to the garments
    if (n === 'topsjer') { o.material = kit.topMat; o.geometry = kit.topGeo; host = o.parent; }
  });
  for (const o of drop) o.parent.remove(o);
  for (const nb of kit.newBones) {
    const b = new THREE.Bone(); b.name = nb.name;
    nb.local.decompose(b.position, b.quaternion, b.scale);
    bones[nb.parent].add(b); bones[nb.name] = b;
  }
  m.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(kit.names.map((n) => bones[n]));
  for (const p of kit.parts) {
    const sk = new THREE.SkinnedMesh(p.geo, p.mat);
    sk.name = p.name; sk.castShadow = true; sk.frustumCulled = false;
    host.add(sk); sk.bind(skel, new THREE.Matrix4());
  }

  // particles: every chain point after its pin
  const C = kit.chains.map((c) => ({
    c, pin: V3(), pw: c.rest.map(() => V3()),
    x: c.rest.slice(1).map(() => V3()), xp: c.rest.slice(1).map(() => V3()), tg: c.rest.slice(1).map(() => V3()),
    tp: c.rest.slice(1).map(() => V3()), vt: c.rest.slice(1).map(() => V3()),   // the targets a frame ago, and their speed
    ph: Math.random() * TAU,
  }));
  const S = {}, Si = {}, Pq = {}, sc = {};
  const used = new Set();
  for (const c of kit.chains) {
    used.add(c.parent); if (c.hangBone) used.add(c.hangBone);
    for (const k of c.coll) { used.add(k.bone); if (k.mid) used.add(k.mid.bone); for (const cp of k.caps || []) used.add(cp.bone); }
  }
  for (const n of used) { S[n] = new THREE.Matrix4(); Si[n] = new THREE.Matrix4(); Pq[n] = new THREE.Quaternion(); sc[n] = 1; }
  const tv = V3(), ts = V3(), a = V3(), b = V3(), q = V3(), wind = V3(), vAir = V3(), rootP = V3(), rootPrev = V3(), vRoot = V3(), fwd = V3(), rv = V3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qr = new THREE.Quaternion(), qd = new THREE.Quaternion();
  let ready = false, clock = Math.random() * 100;
  const G = -9.8, H = 1 / 60, NP = kit.panels;
  const off = [0, 1].map(() => Array.from({ length: NP }, () => V3()));

  const frames = () => {
    for (const n of used) {
      const bn = bones[n]; S[n].multiplyMatrices(bn.matrixWorld, kit.restInv[n]); Si[n].copy(S[n]).invert();
      bn.matrixWorld.decompose(tv, Pq[n], ts); sc[n] = ts.x;
    }
  };
  // rigid follow of the pins and rest targets (partly riding with the hips where asked)
  const follow = () => {
    for (const P of C) {
      const M = S[P.c.parent], hg = P.c.hang;
      P.c.rest.forEach((r, k) => {
        P.pw[k].copy(r).applyMatrix4(M);
        if (hg && hg[k]) P.pw[k].lerp(b.copy(r).applyMatrix4(S[P.c.hangBone]), hg[k]);
      });
      P.pin.copy(P.pw[0]);
      for (let k = 0; k < P.x.length; k++) P.tg[k].copy(P.pw[k + 1]);
    }
  };
  // a point in a bone's rest frame pushed out to a ring of the body's girth (+pad); true if it moved
  const ringOut = (v, ring, pad, push = 1) => {
    const dx = v.x, dz = v.z - ZC, d = Math.hypot(dx, dz) || 1e-6;
    let ang = Math.atan2(dx, dz); if (ang < 0) ang += TAU;
    const f = ang / TAU * ring.length, i0 = Math.floor(f) % ring.length, i1 = (i0 + 1) % ring.length;
    const rmin = lerp(ring[i0], ring[i1], f - Math.floor(f)) + pad;
    if (d >= rmin) return false;
    v.x += dx / d * (rmin - d) * push; v.z += dz / d * (rmin - d) * push;
    return true;
  };
  // push a point out of the body near it, at the body's current pose
  const collide = (x, k, prev) => {
    if (k.ring) {
      q.copy(x).applyMatrix4(Si[k.bone]);
      if (ringOut(q, k.ring, k.pad)) x.copy(q).applyMatrix4(S[k.bone]);
      for (const cp of k.caps || []) capsule(x, cp);
      if (k.mid && prev) {
        // the middle of the segment clears the waist too: push the end out twice as far
        b.copy(x).add(prev).multiplyScalar(0.5).applyMatrix4(Si[k.mid.bone]);
        ts.copy(b);
        if (ringOut(b, k.mid.ring, k.mid.pad, 2)) { q.copy(x).applyMatrix4(Si[k.mid.bone]).add(b.sub(ts)); x.copy(q).applyMatrix4(S[k.mid.bone]); }
      }
    } else if (k.axis) {
      q.copy(x).applyMatrix4(Si[k.bone]);
      const [p0, p1] = k.axis;
      a.subVectors(p1, p0); const u = clamp01(b.subVectors(q, p0).dot(a) / a.lengthSq());
      a.multiplyScalar(u).add(p0); b.subVectors(q, a); const d = b.length();
      if (d < k.r && d > 1e-6) { q.copy(a).addScaledVector(b, k.r / d); x.copy(q).applyMatrix4(S[k.bone]); }
    }
  };
  const capsule = (x, cp) => {
    q.copy(x).applyMatrix4(Si[cp.bone]);
    const [p0, p1] = cp.seg;
    a.subVectors(p1, p0); const u = clamp01(b.subVectors(q, p0).dot(a) / a.lengthSq());
    a.multiplyScalar(u).add(p0); b.subVectors(q, a); const d = b.length();
    if (d < cp.r && d > 1e-6) { q.copy(a).addScaledVector(b, cp.r / d); x.copy(q).applyMatrix4(S[cp.bone]); }
  };
  // the jacket's panels bend together: each panel's offset from its hang is eased
  // towards its neighbours', so the hem stays one smooth line instead of zig-zagging
  const smoothPanels = (wgt) => {
    for (let k = 0; k < 2; k++) {
      const o = off[k];
      for (let s = 0; s < NP; s++) o[s].subVectors(C[s].x[k], C[s].tg[k]);
      for (let s = 0; s < NP; s++) {
        const l = o[Math.max(0, s - 1)], r = o[Math.min(NP - 1, s + 1)];
        C[s].x[k].copy(C[s].tg[k]).addScaledVector(o[s], 1 - wgt).addScaledVector(l, wgt / 2).addScaledVector(r, wgt / 2);
      }
    }
  };
  const lenOf = (P, k) => P.c.rest[k].distanceTo(P.c.rest[k + 1]) * sc[P.c.parent];
  const step = (h, speed, t) => {
    // the air: a soft breeze with gusts, plus the head wind of running that the
    // root's own motion does not already give (a preview running on the spot)
    const gust = 0.55 + 0.3 * Math.sin(t * 0.63) + 0.2 * Math.sin(t * 1.71 + 1.3) + 0.12 * Math.sin(t * 3.9);
    wind.set(0.8, 0.05, 0.45).normalize().multiplyScalar(gust);
    const head = Math.max(0, speed - Math.max(0, vRoot.dot(fwd)));
    for (const P of C) {
      const c = P.c, damp = c.damp ?? 2, vmax = c.vmax ?? 3;
      for (let k = 0; k < P.x.length; k++) {
        const x = P.x[k], xp = P.xp[k], vt = P.vt[k];
        tv.subVectors(x, xp).divideScalar(h);   // velocity
        // its speed relative to where it hangs, capped: a stiff cloth swings, it doesn't whip
        rv.subVectors(tv, vt); if (rv.lengthSq() > vmax * vmax) rv.setLength(vmax);
        tv.addVectors(vt, rv);
        vAir.copy(wind).addScaledVector(fwd, -head).sub(tv);
        const fl = c.flut * (0.25 + speed * 0.22), w = t * (7 + k * 2.3) + P.ph;
        vAir.x += fl * Math.sin(w); vAir.y += fl * 0.6 * Math.sin(w * 1.37 + 1); vAir.z += fl * Math.sin(w * 0.83 + 2);
        a.copy(vAir).multiplyScalar(c.drag[k] * (c.quad ? 0.4 + vAir.length() / 8 : 1));   // quad: growing with the air speed, gentle at a walk
        a.y += G;
        a.addScaledVector(b.subVectors(P.tg[k], x), c.ks[k]).addScaledVector(rv, -damp);
        xp.copy(x);
        x.addScaledVector(vt, h).addScaledVector(rv, h * 0.995).addScaledVector(a, h * h);
      }
    }
    for (let it = 0; it < 3; it++) {
      for (const P of C) {
        let prev = P.pin, prevT = P.pin;
        for (let k = 0; k < P.x.length; k++) {
          const x = P.x[k], L = lenOf(P, k), cone = P.c.cone[k];
          tv.subVectors(x, prev).normalize();
          // stay within a cone round the rest direction (the rigid follow)
          ts.subVectors(P.tg[k], prevT).normalize();
          const cs = tv.dot(ts);
          if (cs < Math.cos(cone)) {
            tv.addScaledVector(ts, -cs); if (tv.lengthSq() < 1e-10) tv.set(1, 0, 0).cross(ts);
            tv.normalize().multiplyScalar(Math.sin(cone)).addScaledVector(ts, Math.cos(cone));
          }
          x.copy(prev).addScaledVector(tv, L);
          prev = x; prevT = P.tg[k];
        }
      }
      for (const [s0, k0, s1, k1, L0] of kit.links) {
        const xa = C[s0].x[k0 - 1], xb = C[s1].x[k1 - 1], L = L0 * sc[C[s0].c.parent];
        tv.subVectors(xb, xa); const d = tv.length() || 1e-6;
        const lim = d > L * 1.08 ? L * 1.08 : d < L * 0.92 ? L * 0.92 : d;
        if (lim !== d) { const e = (d - lim) / d * 0.5; xa.addScaledVector(tv, e); xb.addScaledVector(tv, -e); }
      }
      smoothPanels(0.6);
      for (const P of C) P.x.forEach((x, k) => collide(x, P.c.coll[k], k ? P.x[k - 1] : P.pin));
    }
  };
  // turn the cloth bones so each points from its pin at its particle
  const aim = () => {
    for (const P of C) {
      const c = P.c;
      // the parent's rigid turn since the rest pose: Rp = Pq * inv(restQ)
      qr.copy(Pq[c.parent]).multiply(qa.copy(kit.restQ[c.parent]).invert());
      let from = P.pin;
      c.bones.forEach((n, k) => {
        const bn = bones[n];
        tv.subVectors(c.rest[k + 1], c.rest[k]).applyQuaternion(qr).normalize();
        ts.subVectors(P.x[k], from).normalize();
        qd.setFromUnitVectors(tv, ts);
        // local = inv(parent world) * qd * qr
        if (k === 0) bn.quaternion.copy(qb.copy(Pq[c.parent]).invert()).multiply(qd).multiply(qr);
        else bn.quaternion.copy(qb.copy(qr).invert()).multiply(qd).multiply(qr);
        qr.premultiply(qd);
        from = P.x[k];
      });
    }
  };

  return {
    update(dt, speed = 0) {
      const holder = m.parent, root = (holder && holder.parent) || holder || m;
      root.updateWorldMatrix(true, true);
      frames();
      rootP.setFromMatrixPosition(root.matrixWorld);
      fwd.set(0, 0, 1).transformDirection(root.matrixWorld);
      const jump = rootP.distanceTo(rootPrev) > 3;
      if (!ready || jump || dt > 0.25) {
        follow();
        for (const P of C) P.x.forEach((x, k) => { x.copy(P.tg[k]); P.xp[k].copy(x); });
        vRoot.set(0, 0, 0); ready = true;
      } else if (dt > 0) {
        vRoot.subVectors(rootP, rootPrev).divideScalar(dt);
      }
      rootPrev.copy(rootP);
      for (const P of C) P.tg.forEach((g, k) => P.tp[k].copy(g));
      follow();
      // how fast each hang point moves with the body (still for a held preview pose)
      for (const P of C) P.tg.forEach((g, k) => (dt > 0 && dt <= 0.25 && ready ? P.vt[k].subVectors(g, P.tp[k]).divideScalar(dt) : P.vt[k].set(0, 0, 0)));
      // big steps (a still preview) settle the cloth with the pose held; game frames take 1-3 substeps
      const n = dt > 0.25 ? 120 : Math.min(3, Math.max(1, Math.round(dt / H)));
      const h = dt > 0.25 ? H : dt / n;
      if (dt > 0.25) vRoot.set(0, 0, 0);
      for (let i = 0; i < n; i++) { clock += h; step(h, speed, clock); }
      aim();
    },
  };
}
