// Paint for generated people: colour is worked out per pixel in the shader from
// where the pixel is on the body or the garment (no textures), so seams, stripes,
// buttons, logos and faces stay crisp at any distance; then the game's cel bands
// (toon.js) light it. A baked texture can be made from the same shaders for export.
//
// Garment materials: clothMaterial({ colors: { main, second, accent, trim }, glsl,
// params: [vec4 x 4], cel }) where glsl is the body of `vec3 paintItem()`, written
// with the varyings and helpers below:
//   vCanon  place on the reference body (metres; x left, y up, z front)
//   vPart   limb (0 trunk 1 arm 2 leg 3 head), s along it, side (1 left -1 right)
//   vShare  how much arm, leg, head, hand/foot
//   vG      the piece's own coordinates (wear.js: shells/tubes u, v (m), region, rim;
//           solids x, y, z in the piece's frame, part id)
//   uMain uSecond uAccent uTrim (colours), uP[4] (vec4 numbers for the item)
//   gl_FrontFacing false = the inside of the garment
import * as THREE from 'three';
import { celify } from '../toon.js';

export const CLOTH_CEL = { bands: [0.12, 0.34, 0.62], deep: [0.46, 0.5, 0.66], shade: [0.68, 0.72, 0.86], lit: [1.05, 1.03, 0.98], litAdd: [0.02, 0.02, 0.0] };
export const SKIN_CEL = { bands: [0.1, 0.32, 0.6], deep: [0.68, 0.56, 0.6], shade: [0.86, 0.74, 0.76], lit: [1.04, 1.02, 0.99], litAdd: [0.02, 0.01, 0] };

// ---------- the helper library (GLSL) ----------
export const LIB = /* glsl */ `
float aa(float d) { float w = max(fwidth(d), 1e-5); return clamp(0.5 - d / w, 0.0, 1.0); }    // 1 inside (d < 0), anti-aliased
float band(float x, float a, float b) { return aa(a - x) * aa(x - b); }                           // a < x < b
float line(float x, float c, float w) { return aa(abs(x - c) - w * 0.5); }                       // a line of width w at c
float stripes(float x, float period, float width) { float f = fract(x / period + 0.5) - 0.5; return aa(abs(f) * period - width * 0.5); }
float dashes(float x, float y, float c, float w, float period, float on) { return line(y, c, w) * aa(abs(fract(x / period) - 0.5) * period - on * 0.5); }
float circle(vec2 p, vec2 c, float r) { return aa(length(p - c) - r); }
float ring(vec2 p, vec2 c, float r, float w) { return aa(abs(length(p - c) - r) - w * 0.5); }
float box2(vec2 p, vec2 c, vec2 h, float rd) { vec2 q = abs(p - c) - h + rd; return aa(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rd); }
float boxLine(vec2 p, vec2 c, vec2 h, float rd, float w) { vec2 q = abs(p - c) - h + rd; float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rd; return aa(abs(d) - w * 0.5); }
float dots(vec2 p, float period, float r) { vec2 q = mod(p + period * 0.5, period) - period * 0.5; return aa(length(q) - r); }
float dotsHex(vec2 p, float period, float r) { vec2 q = p / period; q.x += 0.5 * mod(floor(q.y), 2.0); vec2 f = fract(q) - 0.5; return aa(length(f) * period - r); }
float checker(vec2 p, float s) { vec2 q = floor(p / s); return mod(q.x + q.y, 2.0); }
float gingham(vec2 p, float s) { return 0.5 * (stripes(p.x, s, s * 0.5) + stripes(p.y, s, s * 0.5)); }
// two bands crossing (light bars on a dark ground): 0..1 coverage, crossings count double
float plaid(vec2 p, float s, float w) { return min(1.0, stripes(p.x, s, w) + stripes(p.y, s, w)); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
float camo(vec2 p, float s, float t) { float n = noise2(p / s) * 0.6 + noise2(p / s * 2.3 + 7.1) * 0.4; return aa(t - n); }
// a five-point star (r outer)
float star(vec2 p, vec2 c, float r) {
  p -= c; float a = atan(p.x, p.y), k = 6.2831853 / 5.0; a = mod(a + k * 0.5, k) - k * 0.5;
  vec2 q = length(p) * vec2(cos(a), abs(sin(a))); vec2 A = vec2(r, 0.0), B = vec2(r * 0.42 * cos(k * 0.5), r * 0.42 * sin(k * 0.5));
  vec2 e = B - A, w = q - A; float t = clamp(dot(w, e) / dot(e, e), 0.0, 1.0); float d = length(w - e * t);
  return aa(d * sign(e.x * w.y - e.y * w.x));
}
float heart(vec2 p, vec2 c, float r) { p = (p - c) / r; p.y -= 0.25; p.x = abs(p.x); float d;
  if (p.y + p.x > 1.0) d = sqrt(dot(p - vec2(0.25, 0.75), p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  else d = sqrt(min(dot(p - vec2(0.0, 1.0), p - vec2(0.0, 1.0)), dot(p - 0.5 * max(p.x + p.y, 0.0), p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
  return aa(d * r); }
// a flower of n round petals
float flower(vec2 p, vec2 c, float r, float n) { p -= c; float a = atan(p.y, p.x); float rr = r * (0.62 + 0.38 * abs(cos(a * n * 0.5))); return aa(length(p) - rr); }
// the Snap-Orb emblem (our own capture-ball mark): a circle split by a band, a button in the middle.
// returns 0 outside, 1 top half, 2 band, 3 bottom half, 4 button
float orb(vec2 p, vec2 c, float r) {
  vec2 q = p - c; if (length(q) > r) return 0.0;
  float b = r * 0.12; if (length(q) < r * 0.3) return length(q) < r * 0.2 ? 4.0 : 2.0;
  if (abs(q.y) < b * 0.5) return 2.0; return q.y > 0.0 ? 1.0 : 3.0;
}
float orbMask(vec2 p, vec2 c, float r) { return circle(p, c, r); }
// a zip: teeth along x = c between y0..y1
float zipper(vec2 p, float c, float y0, float y1, float w) { return band(p.y, y0, y1) * line(p.x, c, w) * (0.6 + 0.4 * stripes(p.y, w * 0.9, w * 0.45)); }
// the front of the body: the canonical z sign, softened
float frontness() { return smoothstep(-0.02, 0.02, vCanon.z); }
`;

const HEX = (c) => new THREE.Color(c || '#888888');
const cache = new Map();   // program per snippet

// a garment's material
export function clothMaterial(o = {}) {
  const c = o.colors || {};
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', side: o.double === false ? THREE.FrontSide : THREE.DoubleSide });
  const u = {
    uMain: { value: HEX(c.main) }, uSecond: { value: HEX(c.second || c.main) }, uAccent: { value: HEX(c.accent || c.second || c.main) }, uTrim: { value: HEX(c.trim || c.second || c.main) },
    uP: { value: (o.params || []).concat([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]).slice(0, 4).map((a) => new THREE.Vector4(...a)) },
    uInside: { value: o.inside ?? 0.7 },
  };
  const body = o.glsl || 'return uMain;';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 canon; attribute vec4 part; attribute vec4 share; attribute vec4 gco;
        varying vec3 vCanon; varying vec4 vPart; varying vec4 vShare; varying vec4 vG;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCanon = canon; vPart = part; vShare = share; vG = gco;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCanon; varying vec4 vPart; varying vec4 vShare; varying vec4 vG;
        uniform vec3 uMain, uSecond, uAccent, uTrim; uniform vec4 uP[4]; uniform float uInside;
        ${LIB}
        vec3 paintItem() { ${body} }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = paintItem() * (gl_FrontFacing ? 1.0 : uInside);`);
  };
  m.customProgramCacheKey = () => 'cloth:' + body;
  m.userData.u = u;
  celify(m, o.cel || CLOTH_CEL);
  // celify chains onBeforeCompile and the key
  m.setColors = (cc) => { for (const k of ['main', 'second', 'accent', 'trim']) if (cc[k]) u['u' + k[0].toUpperCase() + k.slice(1)].value.set(cc[k]); };
  return m;
}

export { HEX };
