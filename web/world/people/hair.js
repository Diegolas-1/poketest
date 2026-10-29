// Hair for generated people: the material, and buildHair, the page's wrapper round
// the pure geometry builder (hairgen.js, which the people worker also runs).
//
//   buildHair(ctx, hair, { hatOn, look }) -> [{ piece, material }]   (person.js)
//   hairMaterial(paint) -> material; material.userData.set(hairOrPaint) recolours it
//   (a look's hair { color, color2, mix, highlight, tie } or a paint from hairgen.js)
//
// The paint is worked out per pixel from the mesh's paint coordinates (gco: across
// the clump, along it, the clump's id, its kind) and from where the pixel is on the
// head (the bind pose position and normal relative to paint.headC, in head heights),
// so it moves with the head:
//  - two tones with a hard edge (the game's cel bands, toon.js, with the hair's own
//    shade colour instead of a fixed multiplier) and a third, deeper one; the undersides
//    of bangs and clumps sit in shade whatever the light;
//  - an optional second colour: tips, a streak, an ombre towards the ends, or the
//    inner layer;
//  - strand lines: a few short dark lines on each clump from its tip back towards the
//    root (never to the parting), spirals on buns;
//  - the anime highlight band ("angel ring") when paint.highlight: a crescent round the
//    skull a third down from the crown, its edges broken into zig-zags, in the
//    lightened base colour;
//  - ties in their own colour; stubble mixed with the skin tone.
import * as THREE from 'three';
import { SUN_I } from '../toon.js';
import { hairPieces, HAIR_STYLES, HAIR_COLORS, FACIAL_STYLES, FRINGES, resolveStyle } from './hairgen.js';
import { hairColor, shadeOf, lightOf } from './hairstyles.js';

export { HAIR_STYLES, HAIR_COLORS, FACIAL_STYLES, FRINGES, hairPieces, resolveStyle };

export function buildHair(ctx, hair, opts = {}) {
  return hairPieces(ctx, hair, opts).map((h) => ({ piece: h.piece, paint: h.paint, material: hairMaterial(h.paint) }));
}

const WHAT = { hair: 0, facial: 1, stubble: 2 };
const C = (c) => new THREE.Color(c);

export function hairMaterial(paint = {}) {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const u = {
    uBase: { value: C(paint.base || '#884A34') }, uShade: { value: C(paint.shade || '#5A2E22') }, uHi: { value: C(paint.hi || '#B87A60') },
    uC2: { value: C(paint.color2 || paint.base || '#884A34') }, uS2: { value: C(paint.shade2 || paint.shade || '#5A2E22') },
    uTie: { value: C(paint.tie || '#e04848') }, uSkin: { value: C(paint.skin || '#f6d2b8') },
    uMix: { value: paint.mix || 0 }, uHiOn: { value: paint.highlight ? 1 : 0 }, uLines: { value: paint.lines ?? 1 }, uWhat: { value: WHAT[paint.what] || 0 },
    uHeadC: { value: new THREE.Vector3(...(paint.headC || [0, 1.5, 0])) }, uHH: { value: paint.hh || 0.28 },
    uEye: { value: paint.eyeY !== undefined && paint.headC ? (paint.eyeY - paint.headC[1]) / (paint.hh || 0.28) : -0.15 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 gco; varying vec4 vG; varying vec3 vHp; varying vec3 vHn;
        uniform vec3 uHeadC; uniform float uHH;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vG = gco; vHp = (position - uHeadC) / uHH; vHn = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vG; varying vec3 vHp; varying vec3 vHn;
        uniform vec3 uBase, uShade, uHi, uC2, uS2, uTie, uSkin; uniform float uMix, uHiOn, uLines, uWhat, uEye;
        vec3 gLit, gSh; float gHi, gUnder;
        float aaH(float d) { float w = max(fwidth(d), 1e-5); return clamp(0.5 - d / w, 0.0, 1.0); }
        float hsh(float x) { return fract(sin(x * 91.17) * 43758.55); }
        void hairPaint() {
          float kind = floor(vG.w + 0.01), outer = step(0.25, fract(vG.w));
          float across = vG.x, along = vG.y, id = vG.z;
          vec3 col = uBase, sh = uShade;
          // the second colour
          float m2 = 0.0;
          if (uMix > 0.5 && uMix < 1.5) m2 = kind == 1.0 ? aaH(0.7 + 0.07 * abs(fract(across * 1.5 + id * 5.0) - 0.5) * 2.0 - along) : 0.0;
          else if (uMix > 1.5 && uMix < 2.5) m2 = max(step(id, 0.13) * step(0.5, kind) * step(kind, 1.5), aaH(abs(vHp.x - 0.17) - 0.07) * step(0.0, vHp.z));
          else if (uMix > 2.5 && uMix < 3.5) m2 = aaH(vHp.y - (uEye - 0.42 + 0.04 * sin(atan(vHp.x, vHp.z) * 9.0)));
          else if (uMix > 3.5) m2 = 1.0 - outer;
          if (kind > 4.5 && uMix > 0.5 && uMix < 1.5) m2 = 0.0;
          col = mix(col, uC2, m2); sh = mix(sh, uS2, m2);
          // strand lines: from near the tip back towards the root, on the clump's outer face
          float L = 0.0;
          if (kind > 0.5 && kind < 1.5) {
            for (int i = 0; i < 3; i++) {
              float fi = float(i), c = -0.55 + 1.1 * fract(id * 7.31 + fi * 0.381), a0 = 0.22 + 0.4 * hsh(id * 13.0 + fi), a1 = 0.9 - 0.08 * hsh(id + fi * 3.0);
              float w = 0.05 * (1.0 - 0.6 * along);
              L = max(L, aaH(abs(across - c) - w) * aaH(a0 - along) * aaH(along - a1) * outer);
            }
          } else if (kind > 2.5 && kind < 3.5) {
            L = aaH(abs(fract(across * 2.0 + along * 2.5) - 0.5) - 0.06) * aaH(abs(along - 0.5) - 0.42);
          }
          L *= uLines;
          col = mix(col, mix(col, sh, 0.85), L); sh = mix(sh, sh * 0.72, L);
          // ties
          if (kind > 1.5 && kind < 2.5) { col = uTie; sh = uTie * vec3(0.66, 0.68, 0.8); }
          // stubble: the skin darkened by the hair colour, a few dots
          if (uWhat > 1.5) { col = mix(uSkin, uBase, 0.28); sh = col * vec3(0.8, 0.76, 0.82); }
          // the highlight band
          gHi = 0.0;
          if (uHiOn > 0.5 && kind < 3.5) {
            // a band round the skull a third down from the crown; its lower edge in sharp teeth, broken at
            // the clumps' edges
            float r = length(vHp), el = asin(clamp(vHp.y / max(r, 1e-4), -1.0, 1.0)), az = atan(vHp.x, vHp.z);
            float cell = floor(az * 2.2 + 0.5 * id), tooth = abs(fract(az * 2.2 + 0.5 * id) - 0.5) * 2.0 * (0.5 + hsh(cell + 3.0));
            float top = 0.93 - 0.03 * tooth, bot = 0.72 + 0.13 * tooth;
            float face = smoothstep(0.3, 0.55, dot(normalize(vHn), vHp / max(r, 1e-4)));
            float edge = kind > 0.5 ? aaH(abs(across) - 0.78) : 1.0;
            gHi = aaH(el - top) * aaH(bot - el) * face * edge * aaH(abs(az) - 1.75 + 0.25 * tooth) * step(0.3, r);
          }
          gUnder = (kind > 0.5 && kind < 1.5 || kind < 0.5) ? smoothstep(-0.35, -0.65, normalize(vHn).y) : 0.0;
          gLit = col; gSh = sh;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        hairPaint(); diffuseColor.rgb = gLit;`)
      .replace('#include <opaque_fragment>', `
        {
          float lumB = dot(gLit, vec3(0.2126, 0.7152, 0.0722));
          float t = dot(reflectedLight.directDiffuse, vec3(0.2126, 0.7152, 0.0722)) / max(lumB, 1e-4) * PI / ${SUN_I.toFixed(2)};
          t = mix(t, min(t, 0.3), gUnder);
          float s0 = smoothstep(0.05, 0.08, t), s1 = smoothstep(0.25, 0.29, t), s2 = smoothstep(0.62, 0.66, t);
          vec3 deep = gSh * vec3(0.86, 0.88, 0.97);
          vec3 c = mix(deep, gSh, s0);
          c = mix(c, gLit, s1);
          c = mix(c, gLit * 1.04 + vec3(0.015, 0.015, 0.0), s2);
          c = mix(c, mix(gSh, uHi, 0.55 + 0.45 * s1), gHi);
          outgoingLight = c + totalEmissiveRadiance;
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'hair1';
  // stubble is painted on the skin: a decal (no ink line round it, no fighting with the skin)
  if (paint.what === 'stubble') { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; }
  m.userData.u = u;
  // recolour without a rebuild: a look's hair ({ color, color2, mix, highlight, tie }) or a paint
  m.userData.set = (h = {}) => {
    let p = h;
    if (!h.base) {
      const c = hairColor(h.color || paint.base), c2 = h.color2 ? hairColor(h.color2) : null;
      p = { base: c.base, shade: c.shade, hi: c.hi, color2: c2 ? c2.base : c.base, shade2: c2 ? c2.shade : c.shade, mix: c2 ? ({ tips: 1, streak: 2, ombre: 3, under: 4 }[h.mix || 'tips'] ?? 1) : 0, highlight: h.highlight, tie: h.tie };
      if (paint.what === 'facial' || paint.what === 'stubble') { const fc = hairColor(h.facialColor || h.color || paint.base); Object.assign(p, { base: fc.base, shade: fc.shade, hi: fc.hi, mix: 0 }); }
    }
    if (p.base) u.uBase.value.set(p.base);
    u.uShade.value.set(p.shade || shadeOf(p.base || paint.base));
    u.uHi.value.set(p.hi || lightOf(p.base || paint.base));
    if (p.color2) u.uC2.value.set(p.color2);
    if (p.shade2) u.uS2.value.set(p.shade2);
    if (p.mix !== undefined) u.uMix.value = p.mix;
    if (p.highlight !== undefined && paint.what === 'hair') u.uHiOn.value = p.highlight ? 1 : 0;
    if (p.tie) u.uTie.value.set(p.tie);
  };
  m.setColors = m.userData.set;
  return m;
}
