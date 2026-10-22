// Stone, as the anime paints it: chunky faceted rocks cut by a few big flat
// planes, a soft rounded rim along every edge (it catches the light), and a
// painted surface: mottled blotches, small pits and specks, a few thin dark
// cracks. Shapes are made by cutting half-spaces (polytope), so every face is
// truly flat; edges are bevelled by a second set of planes whose vertex
// normals blend into the faces beside them (a rounded edge: no extra ink).
// The surface paint is procedural in object space (stoneGLSL), the same code
// as the native game's shaders/veg_stone.gdshader. Geometry carries
//   color  stone tint per face, darker at the foot / tide line (painted AO)
//   uv     x = rim weight (1 on the bevels), y = a random tone per stone
import * as THREE from 'three';
import { rng } from './terrain.js';
import { celify } from './toon.js';

// ---------- the polytope of a set of half-spaces n.v <= d ----------
// planes: [[nx, ny, nz, d]] with unit normals. Returns the faces, each
// { p: plane index, v: [Vector3] counter-clockwise seen from outside }.
export function polytope(P) {
  const V = [], E = 1e-6;
  const n = P.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    const a = P[i], b = P[j], c = P[k];
    const bc = [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]];
    const det = a[0] * bc[0] + a[1] * bc[1] + a[2] * bc[2];
    if (Math.abs(det) < 1e-9) continue;
    const ca = [c[1] * a[2] - c[2] * a[1], c[2] * a[0] - c[0] * a[2], c[0] * a[1] - c[1] * a[0]];
    const ab = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const x = (a[3] * bc[0] + b[3] * ca[0] + c[3] * ab[0]) / det, y = (a[3] * bc[1] + b[3] * ca[1] + c[3] * ab[1]) / det, z = (a[3] * bc[2] + b[3] * ca[2] + c[3] * ab[2]) / det;
    let ok = true;
    for (let m = 0; m < n && ok; m++) if (P[m][0] * x + P[m][1] * y + P[m][2] * z > P[m][3] + 1e-5) ok = false;
    if (!ok) continue;
    if (V.some((v) => Math.abs(v[0] - x) + Math.abs(v[1] - y) + Math.abs(v[2] - z) < 1e-5)) continue;
    V.push([x, y, z]);
  }
  const faces = [];
  for (let m = 0; m < n; m++) {
    const p = P[m], on = V.filter((v) => Math.abs(p[0] * v[0] + p[1] * v[1] + p[2] * v[2] - p[3]) < 2e-5);
    if (on.length < 3) continue;
    const c = on.reduce((s, v) => [s[0] + v[0] / on.length, s[1] + v[1] / on.length, s[2] + v[2] / on.length], [0, 0, 0]);
    const N = new THREE.Vector3(p[0], p[1], p[2]);
    const u = new THREE.Vector3(1, 0, 0); if (Math.abs(N.x) > 0.9) u.set(0, 1, 0);
    u.sub(N.clone().multiplyScalar(u.dot(N))).normalize();
    const w = N.clone().cross(u);
    const pts = on.map((v) => { const d = new THREE.Vector3(v[0] - c[0], v[1] - c[1], v[2] - c[2]); return { v: new THREE.Vector3(...v), a: Math.atan2(d.dot(w), d.dot(u)) }; });
    pts.sort((A, B) => A.a - B.a);
    faces.push({ p: m, v: pts.map((q) => q.v) });
  }
  void E;
  return faces;
}

// support of an ellipsoid (radii r, centre c) along unit n
const support = (n, r, c) => Math.hypot(n[0] * r[0], n[1] * r[1], n[2] * r[2]) + n[0] * c[0] + n[1] * c[1] + n[2] * c[2];
const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };

// Bevel: a plane across every edge of the cut shape, set back by b. Returns
// the bevel planes (appended after the main ones).
function bevelPlanes(P, b, only) {
  const faces = polytope(P), out = [];
  const keyOf = (v) => `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
  const at = new Map();
  for (const f of faces) for (const v of f.v) { const k = keyOf(v); if (!at.has(k)) at.set(k, { v, f: new Set() }); at.get(k).f.add(f.p); }
  const seen = new Set();
  for (const f of faces) for (let i = 0; i < f.v.length; i++) {
    const A = at.get(keyOf(f.v[i])), B = at.get(keyOf(f.v[(i + 1) % f.v.length]));
    for (const q of A.f) {
      if (q === f.p || !B.f.has(q)) continue;
      const key = Math.min(q, f.p) + ':' + Math.max(q, f.p);
      if (seen.has(key)) continue; seen.add(key);
      const a = P[f.p], c = P[q];
      if (a[1] < -0.95 || c[1] < -0.95) continue;   // the buried bottom keeps its sharp edges
      if (only && !only(a) && !only(c)) continue;
      const n = unit(a[0] + c[0], a[1] + c[1], a[2] + c[2]);
      const s = Math.max(n[0] * A.v.x + n[1] * A.v.y + n[2] * A.v.z, n[0] * B.v.x + n[1] * B.v.y + n[2] * B.v.z);
      const cosH = Math.sqrt(Math.max(0, (1 + a[0] * c[0] + a[1] * c[1] + a[2] * c[2]) / 2));   // cos of half the turn
      out.push([...n, s - b * Math.sqrt(Math.max(0, 1 - cosH * cosH))]);
    }
  }
  return out;
}

// Geometry of the cut shape: flat faces, bevel faces with normals blended
// into their neighbours. opts: col (THREE.Color), drop(normal) -> true to
// leave a face out (hidden backs of wall stones), ao (foot darkening below y).
function shapeGeometry(P, nMain, R, o = {}) {
  const faces = polytope(P);
  const pos = [], nrm = [], col = [], uv = [];
  const base = o.col || new THREE.Color('#a6ab98'), tone = R();
  const keyOf = (v) => `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
  // which main faces each corner touches (bevel corners take their normal)
  const touch = new Map();
  for (const f of faces) if (f.p < nMain) for (const v of f.v) { const k = keyOf(v); if (!touch.has(k)) touch.set(k, []); touch.get(k).push(f.p); }
  const c = new THREE.Color(), n = new THREE.Vector3();
  let minY = Infinity, maxY = -Infinity;
  for (const f of faces) for (const v of f.v) { minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
  for (const f of faces) {
    const p = P[f.p], rim = f.p >= nMain;
    if (o.drop && o.drop(p)) continue;
    const shade = 0.93 + R() * 0.12;
    const vn = f.v.map((v) => {
      if (!rim) return [p[0], p[1], p[2]];
      const t = touch.get(keyOf(v));
      if (!t) return [p[0], p[1], p[2]];
      let x = 0, y = 0, z = 0; for (const q of t) { x += P[q][0]; y += P[q][1]; z += P[q][2]; }
      return unit(x, y, z);
    });
    for (let i = 1; i + 1 < f.v.length; i++) for (const j of [0, i, i + 1]) {
      const v = f.v[j];
      pos.push(v.x, v.y, v.z); nrm.push(...vn[j]);
      // painted occlusion: darker toward the foot of the stone
      const foot = o.ao === false ? 1 : 0.72 + 0.28 * Math.min(1, Math.max(0, (v.y - minY) / Math.max(0.05, (maxY - minY) * 0.35)));
      c.copy(base).multiplyScalar(shade * foot);
      col.push(c.r, c.g, c.b);
      uv.push(rim ? 1 : 0, tone);
    }
  }
  void n;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// ---------- shapes ----------
// A boulder: w x h x d (metres) standing on y = 0, its foot sunk below.
// kind 'boulder' (chunky, big flat faces), 'pebble' (rounder, small),
// 'slab' (wide and flat topped).
export function boulderGeometry(seed, { w = 1, h = 0.8, d = 0.9, kind = 'boulder', col, bevel, flatTop = false } = {}) {
  const R = rng(seed * 7 + 3);
  const r = [w / 2, h * 0.62, d / 2], c = [0, h - h * 0.62, 0];
  const P = [[0, -1, 0, h * 0.18]];
  const k = kind === 'pebble' ? 8 : kind === 'slab' ? 9 : 10;
  const turn = R() * 6.28;
  for (let i = 0; i < k; i++) {
    // directions spread over the upper sphere (fibonacci), jittered
    const t = (i + 0.5) / k, y = 1 - t * 1.45, s = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + turn;
    const n = unit(Math.cos(a) * s + (R() - 0.5) * 0.35, y + (R() - 0.5) * 0.25, Math.sin(a) * s + (R() - 0.5) * 0.35);
    // a deep cut now and then: one big flat face (the anime look)
    const cut = kind === 'pebble' ? 0.9 + R() * 0.08 : R() < 0.3 ? 0.78 + R() * 0.06 : 0.86 + R() * 0.12;
    P.push([...n, support(n, r, c) * cut + (1 - cut) * (n[0] * c[0] + n[1] * c[1] + n[2] * c[2])]);
  }
  // a broad top, tilted a little (flatTop: level, at h)
  const top = flatTop ? [0, 1, 0] : unit((R() - 0.5) * 0.5, 1, (R() - 0.5) * 0.5);
  P.push([...top, flatTop ? h : support(top, r, c) * (kind === 'slab' ? 0.8 : 0.9)]);
  const nMain = P.length;
  const b = bevel ?? Math.min(w, h, d) * (kind === 'pebble' ? 0.09 : 0.06);
  for (const q of bevelPlanes(P, b)) P.push(q);
  return shapeGeometry(P, nMain, R, { col });
}

// A dressed wall stone: a block of about 1 x 1 x 1 (scaled when placed) with
// its face slightly domed and a corner or two knocked off. The back (-z)
// is left out (it sits against the wall's core).
export function blockGeometry(seed, { aspect = 1.6, col, back = false } = {}) {
  const R = rng(seed * 13 + 5);
  const hx = aspect / 2, hy = 0.5, hz = 0.5;
  const j = () => (R() - 0.5) * 0.12;
  const P = [
    [...unit(1, j(), j()), hx], [...unit(-1, j(), j()), hx],
    [...unit(j(), 1, j()), hy], [...unit(j(), -1, j()), hy],
    [...unit(j() * 2, j() * 2, 1), hz * (0.92 + R() * 0.08)], [0, 0, -1, hz],
  ];
  // the face: one or two shallow facets
  for (let i = 0; i < 1 + Math.floor(R() * 2); i++) {
    const n = unit((R() - 0.5) * 1.4, (R() - 0.5) * 1.4, 1);
    P.push([...n, hz * (0.78 + R() * 0.1) + Math.abs(n[0]) * hx * 0.45 + Math.abs(n[1]) * hy * 0.45]);
  }
  // knocked-off corners on the front
  for (let i = 0; i < (R() < 0.6 ? 1 : 0); i++) {
    const sx = R() < 0.5 ? -1 : 1, sy = R() < 0.5 ? -1 : 1;
    const n = unit(sx * (0.6 + R()), sy * (0.6 + R()), 0.8 + R() * 0.6);
    P.push([...n, (n[0] * sx * hx + n[1] * sy * hy + n[2] * hz) * (0.8 + R() * 0.1)]);
  }
  const nMain = P.length;
  // rounded rims only where they show: round the face
  for (const q of bevelPlanes(P, 0.09, (p) => p[2] > 0.4 || (back && p[1] > 0.7))) P.push(q);
  return shapeGeometry(P, nMain, R, { col, ao: false, drop: back ? (p) => p[1] < -0.7 : (p) => p[2] < -0.7 || p[1] < -0.7 });
}

// ---------- the surface paint (GLSL, shared word for word with Godot) ----------
// p = object position (metres), n = object normal, r = (rim, tone).
// Returns the colour multiplier.
export const STONE_GLSL = `
float st_h(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float st_n(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(st_h(i), st_h(i + vec3(1.0, 0.0, 0.0)), f.x), mix(st_h(i + vec3(0.0, 1.0, 0.0)), st_h(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(st_h(i + vec3(0.0, 0.0, 1.0)), st_h(i + vec3(1.0, 0.0, 1.0)), f.x), mix(st_h(i + vec3(0.0, 1.0, 1.0)), st_h(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
vec3 stone_paint(vec3 p, vec3 n, vec2 r, float px) {
  float k = 1.0;
  // mottled blotches in two painted steps
  float m = st_n(p * 1.4) * 0.6 + st_n(p * 3.3 + 4.1) * 0.4;
  k *= mix(1.0, 0.86, smoothstep(0.58, 0.62, m));
  k *= mix(1.0, 1.07, smoothstep(0.34, 0.3, m));
  // small pits (dark) and light specks
  float s = st_n(p * 13.0);
  k *= mix(1.0, 0.72, smoothstep(0.79, 0.83, s));
  k *= mix(1.0, 1.1, smoothstep(0.2, 0.16, st_n(p * 9.0 + 7.3)));
  // a few thin cracks: edges between big cells (straight, jointed), only
  // here and there
  vec3 q = p * 0.8, qi = floor(q), qf = fract(q);
  float f1 = 8.0, f2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(st_h(qi + g), st_h(qi + g + 11.3), st_h(qi + g + 27.1));
    float d = length(g + o - qf);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  float e = (f2 - f1) / 0.8, w = max(px * 1.1, 0.004);
  float mask = smoothstep(0.6, 0.66, st_n(p * 0.6 + 9.1));
  k *= mix(1.0, 0.42, (1.0 - smoothstep(w * 0.6, w * 1.2, e)) * mask);
  k *= mix(1.0, 1.08, smoothstep(w * 1.2, w * 1.8, e) * (1.0 - smoothstep(w * 2.6, w * 3.4, e)) * mask);
  // the stone's own tone
  k *= 0.94 + r.y * 0.12;
  vec3 col = vec3(k);
  // moss on the tops, in patches
  float moss = smoothstep(0.55, 0.8, n.y) * smoothstep(0.48, 0.56, st_n(p * 0.9 + 1.3));
  col = mix(col, vec3(0.62, 0.86, 0.42) * k, moss * 0.55);
  return col;
}
`;

const CEL = { bands: [0.1, 0.33, 0.62], deep: [0.46, 0.52, 0.7], shade: [0.66, 0.72, 0.88], lit: [1.1, 1.08, 1.0], litAdd: [0.03, 0.03, 0.01] };
const SUN_I = 2.9;
const stoneMats = new Map();
// The stone material (cel bands + paint + lit rim). One per option set.
export function stoneMaterial(key = 'stone') {
  if (stoneMats.has(key)) return stoneMats.get(key);
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.userData.rock = true; m.userData.stone = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSP; varying vec3 vSN; varying vec2 vSU;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float sS = 1.0; vec3 sO = modelMatrix[3].xyz;
          #ifdef USE_INSTANCING
            sS = length(instanceMatrix[0].xyz); sO += instanceMatrix[3].xyz;
          #endif
          vSP = position * sS + sO * 0.37; vSN = normal; vSU = uv;
        }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSP; varying vec3 vSN; varying vec2 vSU;\n' + STONE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= stone_paint(vSP, normalize(vSN), vSU, length(fwidth(vSP)));`);
  };
  celify(m, CEL);
  const cel = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    cel(sh, r);
    // the rounded rims catch the sun: a soft light edge where they face it
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        float lb = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
        float lt = dot(reflectedLight.directDiffuse, vec3(0.2126, 0.7152, 0.0722)) / lb * PI / ${SUN_I.toFixed(2)};
        float rk = vSU.x * smoothstep(0.5, 0.58, lt);
        outgoingLight += (diffuseColor.rgb * 0.3 + vec3(0.05, 0.05, 0.03)) * rk;
      }
      #include <opaque_fragment>`);
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => prevKey() + '|stone';
  stoneMats.set(key, m);
  return m;
}

// stone colours
export const STONE = {
  grey: '#a9ae9c',     // grey-green field stone
  beach: '#b4b2a4',    // paler, sun-bleached
  bank: '#9e9a98',     // the stream's damp banks
  wall: '#b9b6a4',     // dressed wall stone
  sea: '#9fa59a',      // the lighthouse islet
};

// A rock model as foliage.js models are: { parts, height, radius }. Boulders
// get a few pebbles at their foot (same mesh, so still one draw).
const rockCache = new Map();
export function rockModel(seed, size = 1, { kind = 'boulder', col = STONE.grey, foot = true } = {}) {
  const key = [seed, size, kind, col, foot].join();
  if (rockCache.has(key)) return rockCache.get(key);
  const R = rng(seed * 31 + 11);
  const C = new THREE.Color(col);
  const w = size * (0.95 + R() * 0.35), d = size * (0.8 + R() * 0.3), h = size * (kind === 'slab' ? 0.45 : kind === 'pebble' ? 0.55 : 0.7 + R() * 0.25);
  const geos = [boulderGeometry(seed, { w, h, d, kind, col: C })];
  if (foot && kind !== 'pebble') {
    const n = 2 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, r = 0.5 + R() * 0.15, s = size * (0.1 + R() * 0.12);
      const g = boulderGeometry(seed * 17 + i, { w: s * 1.3, h: s * 0.8, d: s, kind: 'pebble', col: C.clone().multiplyScalar(0.95) });
      g.rotateY(R() * 6.28).translate(Math.cos(a) * w * r, -s * 0.15, Math.sin(a) * d * r);
      geos.push(g);
    }
  }
  const g = geos.length > 1 ? mergeAll(geos) : geos[0];
  const model = { parts: [{ geometry: g, material: stoneMaterial() }], height: h, radius: Math.max(w, d) * 0.65 };
  rockCache.set(key, model);
  return model;
}

// merge non-indexed geometries with the same attributes
export function mergeAll(list) {
  const keys = ['position', 'normal', 'color', 'uv'];
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const k of keys) {
    const sz = list[0].attributes[k].itemSize, a = new Float32Array(n * sz);
    let o = 0; for (const g of list) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(a, sz));
  }
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

// ---------- dry-stone walls ----------
// A library of dressed blocks (aspect = length / height), made once.
const BLOCKS = [];
function blocks() {
  if (!BLOCKS.length) {
    const asp = [1.0, 1.3, 1.6, 2.0, 2.5, 3.0];
    for (let i = 0; i < 24; i++) {
      const a = asp[i % asp.length];
      BLOCKS.push({ a, front: blockGeometry(100 + i, { aspect: a }), all: blockGeometry(100 + i, { aspect: a, back: true }) });
    }
  }
  return BLOCKS;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
// a block scaled to len x h x dep, its face toward +n (unit, horizontal),
// centred at (cx, cy, cz), turned by `tilt` (slope along the run)
function putBlock(out, R, b, len, h, dep, cx, cy, cz, n, tilt, tint) {
  const g = b.geometry.clone();
  // block: x along its length, z out of its face
  const ang = Math.atan2(n[0], n[2]);
  _e.set((R() - 0.5) * 0.03, ang + (R() - 0.5) * 0.04, tilt + (R() - 0.5) * 0.035, 'YXZ');
  _q.setFromEuler(new THREE.Euler(0, ang, 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.03, (R() - 0.5) * 0.04, tilt + (R() - 0.5) * 0.035)));
  _m.compose(_p.set(cx, cy, cz), _q, _s.set(len / b.a, h, dep));
  g.applyMatrix4(_m);
  { const c = g.attributes.color, hue = R(), sh = hue < 0.25 ? [1.04, 1.0, 0.92] : hue < 0.45 ? [0.95, 1.02, 0.94] : [1, 1, 1];
    for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * tint * sh[0], c.getY(i) * tint * sh[1], c.getZ(i) * tint * sh[2]); }
  const u = g.attributes.uv; const tone = R(); for (let i = 0; i < u.count; i++) u.setY(i, tone);
  out.push(g);
}
const pick = (R, a, back) => {
  const L = blocks();
  let best = null, bd = 1e9;
  for (let k = 0; k < 6; k++) { const c = L[Math.floor(R() * L.length)], d = Math.abs(Math.log(c.a / a)); if (d < bd) { bd = d; best = c; } }
  return { a: best.a, geometry: back ? best.all : best.front };
};

// Walls of fitted stones in courses, with cap stones and a dark core
// (the mortar seen in the joints). runs: [{ a: [x, z], b: [x, z],
//   top(u) -> y of the wall's top at u metres from a (cap included),
//   faces: [{ side: +1 | -1, bottom(u) -> lowest y worth building }],
//   t: thickness, cap: true, col }]  side +1 = the left of a -> b.
// Returns the merged geometry (same space as the points).
export function wallGeometry(runs, seed = 1, split = false) {
  const R = rng(seed), out = [], caps = [];
  for (const run of runs) {
    const [ax, az] = run.a, [bx, bz] = run.b, L = Math.hypot(bx - ax, bz - az);
    if (L < 0.2) continue;
    const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;   // left normal
    const t = run.t || 0.7, capH = run.cap === false ? 0 : 0.17, base = new THREE.Color(run.col || STONE.wall);
    const P = (u, off) => [ax + dx * u + nx * off, az + dz * u + nz * off];
    const slope = (u0, u1) => Math.atan2(run.top(u1) - run.top(u0), u1 - u0);
    let lo = Infinity, hi = -Infinity;
    for (let u = 0; u <= L + 0.01; u += 0.25) { hi = Math.max(hi, run.top(Math.min(u, L))); for (const f of run.faces) lo = Math.min(lo, f.bottom(Math.min(u, L))); }
    // faces: courses of blocks
    for (const f of run.faces) {
      const s = f.side, n = [nx * s, 0, nz * s], dep = 0.3;
      let y0 = lo - R() * 0.1;
      while (y0 < hi - capH - 0.08) {
        const ch = 0.24 + R() * 0.18;
        let u = -R() * 0.4;
        while (u < L) {
          const len = Math.min(0.42 + R() * 0.62, ch * 3.2);
          const u0 = Math.max(0, u), u1 = Math.min(L, u + len);
          u += len;
          if (u1 - u0 < 0.18) continue;
          const T = Math.min(run.top(u0), run.top(u1)) - capH, B = Math.max(f.bottom(u0), f.bottom(u1));
          let top = y0 + ch;
          if (T - top < 0.14) top = T;
          if (top <= B || y0 > T - 0.08) continue;
          const yb = y0, h = top - yb;
          if (h < 0.08) continue;
          const um = (u0 + u1) / 2, [cx, cz] = P(um, s * (t / 2 - dep / 2 + 0.02 + (R() - 0.5) * 0.04));
          const ln = u1 - u0 - 0.04, hh = h - 0.035;
          const tint = () => 0.84 + R() * 0.24;
          if (h > 0.3 && ln > 0.5 && R() < 0.3) {
            // two smaller stones stacked, the joint not in line with the course
            const f = 0.4 + R() * 0.2, l2 = ln * (0.55 + R() * 0.45), o2 = (ln - l2) * (R() - 0.5);
            const d2 = [dx * o2, dz * o2];
            putBlock(out, R, pick(R, ln / (hh * f), false), ln, hh * f - 0.02, dep, cx, yb + (hh * f) / 2, cz, n, 0, tint());
            putBlock(out, R, pick(R, l2 / (hh * (1 - f)), false), l2, hh * (1 - f) - 0.02, dep, cx + d2[0], yb + hh * f + (hh * (1 - f)) / 2 + 0.01, cz + d2[1], n, 0, tint());
          } else putBlock(out, R, pick(R, ln / hh, false), ln, hh, dep, cx, yb + h / 2, cz, n, 0, tint());
        }
        y0 += ch;
      }
    }
    // cap stones following the top
    if (capH) {
      let u = -R() * 0.3;
      while (u < L) {
        const len = 0.5 + R() * 0.5, u0 = Math.max(0, u), u1 = Math.min(L, u + len);
        u += len;
        if (u1 - u0 < 0.15) continue;
        const um = (u0 + u1) / 2, [cx, cz] = P(um, 0);
        const b = pick(R, (u1 - u0) / capH, true);
        const ty = (run.top(u0) + run.top(u1)) / 2;
        putBlock(caps, R, b, u1 - u0 - 0.03, capH, t + 0.12, cx, ty - capH / 2, cz, [nx, 0, nz], slope(u0, u1) * (dx * nz - dz * nx > 0 ? 1 : 1), 1.04 + R() * 0.08);
      }
    }
    // the core: a dark strip seen through the joints
    const core = [], ins = t / 2 - 0.12, mc = base.clone().multiplyScalar(0.42);
    const sides = run.faces.map((f) => f.side);
    const step = 0.5, us = [];
    for (let u = 0; u < L; u += step) us.push(u); us.push(L);
    const quad = (A, B, C, D, nn) => { for (const v of [A, B, C, A, C, D]) { core.push(v); } return nn; };
    const pos = [], nrm = [];
    const pushQ = (A, B, C, D) => {
      const e1 = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]), e2 = new THREE.Vector3(D[0] - A[0], D[1] - A[1], D[2] - A[2]);
      const nn = e1.cross(e2).normalize();
      for (const v of [A, B, C, A, C, D]) { pos.push(...v); nrm.push(nn.x, nn.y, nn.z); }
    };
    void quad; void core;
    for (let i = 0; i + 1 < us.length; i++) {
      const u0 = us[i], u1 = us[i + 1], t0 = run.top(u0) - capH + 0.02, t1 = run.top(u1) - capH + 0.02;
      for (const s of [1, -1]) {
        if (!sides.includes(s)) continue;
        const [x0, z0] = P(u0, s * ins), [x1, z1] = P(u1, s * ins);
        const A = [x0, lo - 0.3, z0], B = [x1, lo - 0.3, z1], C = [x1, t1, z1], D = [x0, t0, z0];
        if (s > 0) pushQ(A, B, C, D); else pushQ(B, A, D, C);
      }
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      const n = pos.length / 3, col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { col[i * 3] = mc.r; col[i * 3 + 1] = mc.g; col[i * 3 + 2] = mc.b; uv[i * 2 + 1] = 0.5; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      out.push(g);
    }
  }
  const M = (l) => (l.length ? mergeAll(l) : null);
  return split ? { faces: M(out), caps: M(caps) } : M(out.concat(caps));
}

// A wall as meshes: the coursed faces (ink only where something stands in
// front: outline 'ground', no vector ink of their own, which would cost a
// line round every stone) and the cap stones (a full outline: the wall's
// top edge against the sky and the ground).
export function wallMeshes(runs, seed, o = {}) {
  const { faces, caps } = wallGeometry(runs, seed, true), out = [];
  if (faces) { const m = stoneMesh(faces, o); m.userData.outline = 'ground'; out.push(m); }
  if (caps) out.push(stoneMesh(caps, o));
  return out;
}

// One mesh of stone (a wall, the islet) as an InstancedMesh of one copy, so
// it is drawn and baked like the other stones (native: veg_stone, chunked by
// where it stands). geometry in world space; it is moved to its centre.
export function stoneMesh(geometry, { fade, shadow = true, key } = {}) {
  geometry.computeBoundingBox();
  const c = geometry.boundingBox.getCenter(new THREE.Vector3());
  c.y = geometry.boundingBox.min.y;
  geometry.translate(-c.x, -c.y, -c.z);
  geometry.computeBoundingSphere();
  const m = new THREE.InstancedMesh(geometry, stoneMaterial(key), 1);
  m.setMatrixAt(0, new THREE.Matrix4().makeTranslation(c.x, c.y, c.z));
  m.computeBoundingSphere();
  m.castShadow = shadow; m.receiveShadow = true;
  if (fade) m.userData.fade = fade;
  m.userData.stone = true;
  return m;
}

// Fewer draws: every one-copy stone mesh under root (walls, foundations,
// the islet) joins the others of its 40 m cell that share its material,
// outline kind, fade and shadow, as one mesh in root's space.
export function mergeStones(root, cell = 40) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), groups = new Map(), list = [];
  root.traverse((o) => { if (o.isInstancedMesh && o.userData.stone && o.count === 1) list.push(o); });
  const im = new THREE.Matrix4(), c = new THREE.Vector3();
  for (const o of list) {
    o.getMatrixAt(0, im);
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).multiply(im);
    c.setFromMatrixPosition(m);
    const key = [Math.floor(c.x / cell), Math.floor(c.z / cell), o.material.uuid, o.userData.outline, String(o.userData.fade), o.castShadow].join('|');
    if (!groups.has(key)) groups.set(key, { o, geos: [] });
    groups.get(key).geos.push(o.geometry.clone().applyMatrix4(m));
    o.parent.remove(o);
  }
  for (const { o, geos } of groups.values()) {
    const n = stoneMesh(mergeAll(geos), { fade: o.userData.fade, shadow: o.castShadow });
    n.material = o.material;
    if (o.userData.outline !== undefined) n.userData.outline = o.userData.outline;
    root.add(n);
  }
  return groups.size;
}
