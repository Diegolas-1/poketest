// The body's material: skin, the doll's painted-on underwear and the anime face
// (face.js), all worked out per pixel in the shader from where the pixel is on
// the reference body (canon: base.bin's own positions, the same for everyone),
// so nothing blurs at any zoom and the paint keeps its place on every body.
//
// skinMaterial(look, land) -> a MeshLambertMaterial (onBeforeCompile, then the
// game's cel bands from toon.js). land: the reference body's landmarks (base.bin
// land). The body geometry carries canon, part (limb 0 trunk 1 arm 2 leg 3 head,
// s along the limb, side), share (arm, leg, head, hand/foot) and hide (> 0.99
// under a garment: discarded). Everything else is uniforms:
//   material.userData.set(look)                 a changed look (skin, underwear, face, body landmarks)
//   material.userData.setExpression(name, k)    face.js EXPRESSIONS, k 0..1 (default 1)
//   material.userData.setBlink(t)               eyelids 0 open .. 1 closed
//
// Skin: a tone (SKIN_TONES, or any '#hex', its shade and blush derived), a soft
// blush on the cheeks (face.js), on knees, elbows and knuckles for children,
// fingernails a lighter tint on the backs of the fingertips (found once on the
// reference hands), soft inner shading in the ears and the shadow under the
// chin. Underwear (UNDERWEAR): tank top / sports top / undershirt with cap
// sleeves / one-piece, with shorts or briefs; edges are curves on the reference
// body (an elliptic neck opening and armholes, so straps run cleanly over the
// shoulders), with bound edges, a waistband and side seams. Region tests use
// continuous quantities only (canonical heights, shares), never the limb id,
// which is interpolated across triangles on limb borders.
import * as THREE from 'three';
import { celify } from '../toon.js';
import { LIB } from './paint.js';
import { anatomy } from './anatomy.js';
import { base } from './gen.js';
import { BONE } from './rig.js';
import { FACE_GLSL, FACE_UNIFORMS, faceParams, exprParams, faceDefaults, FACE_OPTIONS, EXPRESSIONS, EXPRESSION_TABLE, isHex } from './face.js';

export { FACE_OPTIONS, EXPRESSIONS, EXPRESSION_TABLE, faceDefaults };

// anime skin tones, very fair to deep brown: base, cel shade, blush
export const SKIN_TONES = [
  { id: 'porcelain', name: 'Porcelain', color: '#fbe8d8', shade: '#e6c2b0', blush: '#f4a2a0' },
  { id: 'ivory', name: 'Ivory', color: '#f8e0c8', shade: '#dfb89e', blush: '#f29c94' },
  { id: 'fair_pink', name: 'Fair pink', color: '#ffd6c2', shade: '#e9ad98', blush: '#f5958c' },
  { id: 'fair_peach', name: 'Fair peach', color: '#f9dcb4', shade: '#d9ae8e', blush: '#f2a08a' },
  { id: 'light_peach', name: 'Light peach', color: '#fccfa6', shade: '#dfa482', blush: '#f1957f' },
  { id: 'warm_peach', name: 'Warm peach', color: '#ffc394', shade: '#e0996c', blush: '#f08a72' },
  { id: 'peach_tan', name: 'Peach tan', color: '#f6b28a', shade: '#cf8a64', blush: '#ec7f6e' },
  { id: 'golden', name: 'Golden', color: '#edc08e', shade: '#c9955f', blush: '#e58f78' },
  { id: 'honey', name: 'Honey', color: '#e6ad78', shade: '#be8254', blush: '#dc7f68' },
  { id: 'tan', name: 'Tan', color: '#dc9f66', shade: '#b27643', blush: '#d0745f' },
  { id: 'caramel', name: 'Caramel', color: '#cc8f5a', shade: '#a3693b', blush: '#c36a56' },
  { id: 'bronze', name: 'Bronze', color: '#bb7f4f', shade: '#915a33', blush: '#b4604e' },
  { id: 'brown', name: 'Brown', color: '#a46c45', shade: '#7c4d2e', blush: '#a25446' },
  { id: 'chestnut', name: 'Chestnut', color: '#8f5d3b', shade: '#694029', blush: '#8f4a3e' },
  { id: 'deep_brown', name: 'Deep brown', color: '#784d33', shade: '#573423', blush: '#7c4136' },
  { id: 'espresso', name: 'Espresso', color: '#613e2a', shade: '#45291c', blush: '#683832' },
];
const DEFAULT_TONE = SKIN_TONES[3];

export const UNDERWEAR = {
  tank: 'Tank and shorts',
  sport: 'Sports top and shorts',
  tee: 'Undershirt and briefs',
  suit: 'One-piece',
};

// ---------- colour helpers (sRGB hex) ----------
const hexRgb = (h) => { const s = String(h).replace('#', ''); const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => v / 255); };
const rgbHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('');
// a tone record for any tone: a palette id or colour, or a hex with its shade and blush derived (style.json's shade rule)
export function skinTone(t) {
  if (t && typeof t === 'object') return skinTone(t.tone || t.color);
  const hit = SKIN_TONES.find((x) => x.id === t || (isHex(t) && x.color.toLowerCase() === ('#' + String(t).replace('#', '')).toLowerCase()));
  if (hit) return hit;
  if (!isHex(t)) return DEFAULT_TONE;
  const c = hexRgb(t);
  const shade = rgbHex([c[0] * 0.85, c[1] * 0.74, c[2] * 0.7]);
  const blush = rgbHex([Math.min(1, c[0] * 0.98 + 0.03), c[1] * 0.62, c[2] * 0.62]);
  return { id: 'custom', name: 'Custom', color: rgbHex(c), shade, blush };
}

// the skin's cel bands: warm skin, shade a little cooler and pinker
export const SKIN_CEL = { bands: [0.1, 0.32, 0.6], deep: [0.7, 0.58, 0.64], shade: [0.88, 0.77, 0.8], lit: [1.035, 1.02, 0.995], litAdd: [0.015, 0.008, 0], soft: 0.02 };

// ---------- fingernails: the reference hands' fingertips ----------
// per finger (thumb, index, middle, ring, little; left hand, mirrored for the right):
// the tip, the finger's direction and the back of the hand's direction
let NAILS = null;
function nails() {
  if (NAILS) return NAILS;
  const b = base();
  const out = { tip: [], dir: [], up: [], r: [] };
  try {
    if (!b || !b.aw0 || !b.nb) throw new Error('no base');
    const col = (i, k) => [b.aw0[16 * i + 4 * k], b.aw0[16 * i + 4 * k + 1], b.aw0[16 * i + 4 * k + 2]];
    const dom = (v) => { let bb = -1, w = -1; for (let k = 0; k < 4; k++) if (b.wts[4 * v + k] > w) { w = b.wts[4 * v + k]; bb = b.skin[4 * v + k]; } return bb; };
    for (const f of ['A', 'B', 'C', 'D']) {
      const bi = BONE['LFinger' + f + '3'];
      const J = col(bi, 3), X = col(bi, 0), Y = col(bi, 1);
      const verts = []; for (let v = 0; v < b.nv; v++) if (b.pos[3 * v] > 0 && dom(v) === bi) verts.push(v);
      // connected pieces (the ring finger's bones carry the little finger too)
      const seen = new Set(), pieces = [];
      const inSet = new Set(verts);
      for (const v of verts) {
        if (seen.has(v)) continue;
        const piece = [], st = [v]; seen.add(v);
        while (st.length) { const x = st.pop(); piece.push(x); for (const y of b.nb[x] || []) if (inSet.has(y) && !seen.has(y)) { seen.add(y); st.push(y); } }
        if (piece.length > 8) pieces.push(piece);
      }
      for (const piece of pieces) {
        // the tip: furthest along the bone; its axis from the piece's middle to the tip
        let best = piece[0], bd = -1e9; const c = [0, 0, 0];
        for (const v of piece) { const p = [b.pos[3 * v], b.pos[3 * v + 1], b.pos[3 * v + 2]]; c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; const d = (p[0] - J[0]) * X[0] + (p[1] - J[1]) * X[1] + (p[2] - J[2]) * X[2]; if (d > bd) { bd = d; best = v; } }
        c[0] /= piece.length; c[1] /= piece.length; c[2] /= piece.length;
        const tip = [b.pos[3 * best], b.pos[3 * best + 1], b.pos[3 * best + 2]];
        let dir = [tip[0] - c[0], tip[1] - c[1], tip[2] - c[2]]; const dl = Math.hypot(...dir); dir = dir.map((x) => x / dl);
        // the finger's radius: mean distance of the piece from its axis
        let r = 0; for (const v of piece) { const p = [b.pos[3 * v] - c[0], b.pos[3 * v + 1] - c[1], b.pos[3 * v + 2] - c[2]]; const t = p[0] * dir[0] + p[1] * dir[1] + p[2] * dir[2]; r += Math.hypot(p[0] - dir[0] * t, p[1] - dir[1] * t, p[2] - dir[2] * t); }
        r /= piece.length;
        // the back of the finger: the bone's y axis made square to the finger
        const t = Y[0] * dir[0] + Y[1] * dir[1] + Y[2] * dir[2]; let up = [Y[0] - dir[0] * t, Y[1] - dir[1] * t, Y[2] - dir[2] * t]; const ul = Math.hypot(...up); up = up.map((x) => x / ul);
        out.tip.push(new THREE.Vector3(...tip)); out.dir.push(new THREE.Vector3(...dir)); out.up.push(new THREE.Vector3(...up)); out.r.push(r);
      }
    }
  } catch (e) { /* no base: no nails */ }
  while (out.tip.length < 5) { out.tip.push(new THREE.Vector3(9, 9, 9)); out.dir.push(new THREE.Vector3(1, 0, 0)); out.up.push(new THREE.Vector3(0, 1, 0)); out.r.push(0.001); }
  out.tip.length = out.dir.length = out.up.length = out.r.length = 5;
  return (NAILS = out);
}

// ---------- the skin and underwear shader ----------
const SKIN_GLSL = /* glsl */ `
uniform vec3 uSkin, uSkinShade, uBlushC, uUnder, uUnder2;
uniform float uStyle, uYoung;
uniform float uLand[12];
uniform vec3 uNailT[5], uNailD[5], uNailU[5];
uniform float uNailR[5];
float gPxC = 1e-4;
float ac(float d) { return clamp(0.5 - d / gPxC, 0.0, 1.0); }
// the underwear's edges: an elliptic opening in the (x, y) plane: < 0 inside the hole
float hole(vec2 p, vec2 c, vec2 r) { vec2 q = (p - c) / r; return (length(q) - 1.0) * min(r.x, r.y); }
// underwear coverage (0..1) and its bound edges / seams (trim)
float underwear(out float trim, out float seam) {
  float chinY = uLand[0], shY = uLand[4], waistY = uLand[5], hipJ = uLand[6], crotchY = uLand[7], chestY = uLand[8];
  vec3 p = vCanon; float x = abs(p.x), y = p.y;
  float fr = smoothstep(-0.03, 0.03, p.z);
  float arm = vShare.x, notArm = 1.0 - smoothstep(0.3, 0.45, arm), leg = vShare.y;
  float st = uStyle;
  trim = 0.0; seam = 0.0;
  float bw = 0.0055;                                     // bound edge width
  // ----- the top -----
  float top = 0.0, topEdge = 1e3;
  {
    float yTop = shY + 0.08;
    // neck opening (front deeper than back) and armholes; straps between them over the shoulder
    float nx = st < 0.5 ? 0.062 : st < 1.5 ? 0.056 : st < 2.5 ? 0.05 : 0.06;
    float nf = st < 0.5 ? shY - 0.04 : st < 1.5 ? shY - 0.035 : st < 2.5 ? shY + 0.018 : shY - 0.045;
    float nb = st < 2.5 && st > 1.5 ? shY + 0.03 : shY - 0.01;
    float neck = hole(vec2(x, y), vec2(0.0, yTop), vec2(nx, yTop - mix(nb, nf, fr)));
    float xs = st < 0.5 ? 0.1 : st < 1.5 ? 0.098 : 0.1;
    float ay = chestY + 0.04;
    float armH = hole(vec2(x, y), vec2(xs + 0.13, yTop), vec2(0.13, yTop - ay));
    float hem = st < 0.5 ? waistY - 0.03 : st < 1.5 ? chestY - 0.06 : st < 2.5 ? waistY - 0.03 : -10.0;
    float d = max(-neck, y < ay + 0.05 ? -1.0 : 0.0);
    d = -neck;
    float body = aa(-neck) * aa(hem - y);
    if (st > 1.5 && st < 2.5) {
      // undershirt: no armholes, tiny cap sleeves: along the arm from the shoulder joint
      vec3 J = vec3(0.179, shY, 0.0), A = normalize(vec3(0.707, -0.707, 0.0));
      float s = dot(vec3(x, y, p.z) - J, A);
      float cap = aa(s - 0.035);
      top = body * mix(1.0, cap, smoothstep(0.2, 0.6, arm));
      topEdge = min(abs(neck), abs(s - 0.035) + step(arm, 0.15) * 1e3);
    } else {
      top = body * aa(-armH) * notArm;
      topEdge = min(abs(neck), abs(armH));
    }
    topEdge = min(topEdge, abs(y - hem));
    trim = max(trim, top * aa(topEdge - bw));
    if (st > 0.5 && st < 1.5) trim = max(trim, top * aa(y - (hem + 0.022)) * 0.0 + top * band(y, hem, hem + 0.02));   // the sports top's elastic band
  }
  // ----- the bottom: shorts / briefs (all heights, so the trunk / leg border never shows) -----
  float bot = 0.0;
  {
    float wTop = waistY - 0.012;
    // leg openings: shorts level, briefs rise towards the hip
    float inner = crotchY - (st < 1.5 ? 0.045 : 0.012);
    float rise = st < 1.5 ? 0.12 : 0.55;
    float hemY = inner + rise * max(x - 0.03, 0.0);
    float shorts = aa(y - wTop) * aa(hemY - y) * notArm;
    if (st > 2.5) shorts = aa(hemY - y) * notArm;      // the one-piece: no waist
    bot = shorts;
    float e = abs(y - hemY);
    trim = max(trim, shorts * aa(e - bw));
    if (st < 2.5) trim = max(trim, shorts * band(y, wTop - 0.024, wTop + 0.001));   // waistband
    // side seams: the outer line of the body and the thighs
    float sideZ = abs(p.z - 0.004);
    seam = max(seam, bot * aa(sideZ - 0.0016) * smoothstep(0.07, 0.09, x) * aa(y - wTop + 0.024));
  }
  if (st > 2.5) {
    // the one-piece joins top and bottom (the top's body runs down into the briefs)
    float t2 = top;
    top = max(t2, 0.0);
    bot = bot * (aa(-hole(vec2(x, y), vec2(0.0, shY + 0.08), vec2(0.06, shY + 0.08 - mix(shY - 0.01, shY - 0.045, fr)))) * aa(-hole(vec2(x, y), vec2(0.1 + 0.13, shY + 0.08), vec2(0.13, shY + 0.08 - chestY - 0.04))));
    seam = max(seam, bot * aa(abs(p.z - 0.004) - 0.0016) * smoothstep(0.07, 0.09, x) * step(chestY, y) * 0.0);
  }
  return max(top, bot);
}
vec3 paintSkin() {
  float chinY = uLand[0], hh = uLand[1], hw = uLand[2], eyeY = uLand[3], shY = uLand[4], waistY = uLand[5], hipJ = uLand[6], crotchY = uLand[7], chestY = uLand[8], kneeY = uLand[10];
  vec3 p = vCanon; float x = abs(p.x), y = p.y;
  vec3 col = uSkin;
  // pixel footprints, taken here outside every branch: canonical metres and face units
  gPxC = max((length(dFdx(p)) + length(dFdy(p))) * 0.6, 1e-7);
  vec2 Fp = vec2(p.x * uFK.x, (p.y - uFK.y) * uFK.z);
  gPx = max((length(dFdx(Fp)) + length(dFdy(Fp))) * 0.6, 1e-7);
  // shadow under the chin onto the neck (anime: a band with a soft V)
  {
    float nk = 1.0 - smoothstep(0.35, 0.75, vShare.z);
    float yS = chinY - 0.02 - 0.012 * max(0.0, 1.0 - pow(x / 0.045, 2.0));
    col = mix(col, mix(uSkin, uSkinShade, 0.75), aa(yS - y) * 0.0 + aa(y - yS) * step(y, chinY + 0.02) * nk * smoothstep(-0.03, 0.0, p.z) * aa(x - 0.06));
  }
  // ears: soft shading in the shell and a curl line
  {
    float ear = smoothstep(0.106, 0.112, x) * smoothstep(0.6, 0.9, vShare.z);
    if (ear > 0.0) {
      vec2 e = vec2(p.z + 0.009, y - (eyeY + 0.01));
      float r = length(e / vec2(0.012, 0.03));
      col = mix(col, mix(uSkin, uSkinShade, 0.85), ear * (1.0 - smoothstep(0.55, 1.0, r)) * 0.8);
      col = mix(col, uSkinShade * 0.85, ear * ac(abs(r - 1.05) * 0.012 - 0.0011) * step(0.0, e.y + e.x * 1.5) * 0.7);
    }
  }
  // young skin: blush on knees, elbows and knuckles
  if (uYoung > 0.01) {
    float b = 0.0;
    float kn = length(vec2((y - (kneeY + 0.012)) / 0.035, (x - 0.085) / 0.04)) ;
    b = max(b, (1.0 - smoothstep(0.3, 1.0, kn)) * smoothstep(0.0, 0.04, p.z) * smoothstep(0.5, 0.8, vShare.y));
    for (int i = 1; i < 5; i++) {
      vec3 k = uNailT[i] - uNailD[i] * 0.075 * hh / 0.28 + uNailU[i] * uNailR[i];
      b = max(b, (1.0 - smoothstep(0.004, 0.014, length(vec3(x, y, p.z) - k))) * 0.8);
    }
    col = mix(col, uBlushC, b * uYoung * 0.35);
  }
  // fingernails: a lighter tint on the backs of the fingertips
  if (vShare.w > 0.5 && vShare.x > 0.5) {
    float n = 0.0;
    vec3 q = vec3(x, y, p.z);
    for (int i = 0; i < 5; i++) {
      vec3 d = q - uNailT[i];
      float al = dot(d, uNailD[i]);
      vec3 lat = d - uNailD[i] * al;
      float r = max(uNailR[i], 1e-4);
      float up = dot(lat, uNailU[i]) / r;
      float L = r * 1.9;
      float sx = length(lat - uNailU[i] * dot(lat, uNailU[i])) / r;
      float dn = max(max(-al - L, al + r * 0.25), sx - 0.75);
      n = max(n, ac(dn) * smoothstep(0.25, 0.55, up));
    }
    col = mix(col, mix(uSkin, vec3(1.0, 0.92, 0.92), 0.4), n * 0.85);
    col = mix(col, uSkin * vec3(0.95, 0.85, 0.85), 0.0);
  }
  // collarbones: two faint strokes above the chest (grown-ups)
  {
    float cb = aa(abs(y - (shY + 0.012 - (x - 0.03) * 0.12)) - 0.0018) * band(x, 0.035, 0.085) * smoothstep(0.02, 0.06, p.z) * (1.0 - uYoung) * smoothstep(0.7, 0.3, vShare.x) * (1.0 - smoothstep(0.2, 0.5, vShare.z));
    col = mix(col, uSkinShade, cb * 0.35 * (1.0 - smoothstep(0.03, 0.09, x)));
  }
  // the face
  col = paintFace(col);
  // underwear
  float trim, seam;
  float u = underwear(trim, seam) * (1.0 - smoothstep(0.3, 0.6, vShare.z));
  col = mix(col, uUnder, u);
  col = mix(col, uUnder2, trim * u);
  col = mix(col, uUnder * 0.82, seam * (1.0 - trim));
  return col;
}
`;

const V4 = () => ({ value: new THREE.Vector4() });
export function skinMaterial(look = {}, land) {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const nl = nails();
  const u = {
    uSkin: { value: new THREE.Color(DEFAULT_TONE.color) }, uSkinShade: { value: new THREE.Color(DEFAULT_TONE.shade) }, uBlushC: { value: new THREE.Color(DEFAULT_TONE.blush) },
    uUnder: { value: new THREE.Color('#f2f0ee') }, uUnder2: { value: new THREE.Color('#9fb6d8') },
    uStyle: { value: 0 }, uYoung: { value: 0 }, uBlink: { value: 0 },
    uLand: { value: [land.chinY, land.hh, land.hw, land.eyeY, land.shY, land.waistY, land.hipJ, land.crotchY, land.chestY, land.faceZ || 0.1, land.kneeY || 0.47, 0] },
    uNailT: { value: nl.tip }, uNailD: { value: nl.dir }, uNailU: { value: nl.up }, uNailR: { value: nl.r },
  };
  for (const k of FACE_UNIFORMS.vec4) u[k] = V4();
  for (const k of FACE_UNIFORMS.color) u[k] = { value: new THREE.Color() };
  const load = (o) => {
    for (const [k, v] of Object.entries(o)) {
      if (!u[k]) continue;
      if (typeof v === 'string') u[k].value.set(v);
      else if (Array.isArray(v)) u[k].value.fromArray(v);
      else u[k].value = v;
    }
  };
  let state = null, expr = { name: 'neutral', amount: 1 }, lastBody = null, L = null;
  const set = (lk = {}) => {
    const s = lk.skin || {}, uw = lk.underwear || {};
    const tone = skinTone(s.tone);
    u.uSkin.value.set(tone.color); u.uSkinShade.value.set(tone.shade); u.uBlushC.value.set(tone.blush);
    u.uUnder.value.set(uw.color || '#f2f0ee'); u.uUnder2.value.set(uw.trim || '#9fb6d8');
    u.uStyle.value = Math.max(0, Object.keys(UNDERWEAR).indexOf(uw.style || 'tank'));
    const body = lk.body || {};
    const key = JSON.stringify(body);
    if (key !== lastBody) { try { L = anatomy(body).L; } catch { L = land; } lastBody = key; }
    const age = Math.max(2, Math.min(90, +body.age || 11));
    u.uYoung.value = 1 - Math.max(0, Math.min(1, (age - 9) / 8));
    const fp = faceParams(lk, L, land, tone);
    state = fp.state;
    load(fp);
    const f = lk.face || {};
    if (f.expression) expr = { name: f.expression, amount: f.expressionAmount ?? 1 };
    load(exprParams(state, expr.name, expr.amount));
    if (f.blink !== undefined) u.uBlink.value = +f.blink || 0;
  };
  set(look);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 canon; attribute vec4 part; attribute vec4 share; attribute float hide;
        varying vec3 vCanon; varying vec4 vPart; varying vec4 vShare; varying float vHide; varying vec3 vFaceN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCanon = canon; vPart = part; vShare = share; vHide = hide;`)
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        {
          // the face's own direction (forward, tipped up a little), posed with the head: the face is lit as one plane
          vec3 fwd = vec3(0.0, 0.4, 1.0);
          #ifdef USE_SKINNING
            fwd = (skinMatrix * vec4(fwd, 0.0)).xyz;
          #endif
          vFaceN = normalize(normalMatrix * fwd);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCanon; varying vec4 vPart; varying vec4 vShare; varying float vHide; varying vec3 vFaceN; vec4 vG = vec4(0.0);
        ${LIB}
        ${SKIN_GLSL.replace(/vec3 paintSkin\(\)[\s\S]*$/, '')}
        ${FACE_GLSL}
        ${SKIN_GLSL.slice(SKIN_GLSL.indexOf('vec3 paintSkin()'))}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // anime faces are lit flat: the front of the face takes the face's direction, the sides keep their shape
          float fw = smoothstep(0.6, 0.9, vShare.z) * smoothstep(0.03, 0.09, vCanon.z) * (1.0 - smoothstep(uLand[0] + uLand[1] * 0.82, uLand[0] + uLand[1] * 0.98, vCanon.y));
          normal = normalize(mix(normal, normalize(vFaceN), fw * 0.8));
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vHide > 0.99) discard;
        diffuseColor.rgb = paintSkin();`);
  };
  m.customProgramCacheKey = () => 'skin2';
  celify(m, SKIN_CEL);
  m.userData.set = set;
  m.userData.setExpression = (name = 'neutral', amount = 1) => { expr = { name, amount }; if (state) load(exprParams(state, name, amount)); };
  m.userData.setBlink = (t = 0) => { u.uBlink.value = Math.max(0, Math.min(1, +t || 0)); };
  m.userData.expression = () => ({ ...expr });
  m.userData.u = u;
  return m;
}
