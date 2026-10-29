// Legwear: socks (ankle, crew, knee, over-knee, tube, hiking, frilled), tights and
// leg warmers.
//
// All are thin wear.js shells over the legs: socks from their top down over the foot
// (the body under them is hidden, so a toe never pokes through), tights from the waist,
// leg warmers a slouchy tube round the calf. The knit is painted: a ribbed top band in
// the second colour (the X/Y socks' coloured or white band), bands of stripes counted
// down from the top, a darker heel and toe. Paint works in the leg's own u (round it,
// 0 at the outside, + to the front, as wear.js gives legs) and lv, metres down from the
// hip on the reference body, so a band "two centimetres under the top" is the same on
// every leg. Frilled socks get a little ruffle (a shell standing out from the leg,
// waved round it); hiking socks a thick rolled top; leg warmers rings of slouch.
import { shell } from '../wear.js';
import { clamp, sstep } from '../vmath.js';
import { LEG, legCover } from './common.js';
import { patternGLSL } from './patterns.js';

const f3 = (x) => (+x).toFixed(4);
const has = (it, d) => (it.params.details || []).includes(d);
// the leg's coordinates in GLSL (lu round the leg, lv down from the hip, foot: on the foot)
// (sv: along the leg and on over the foot, so a band "under the top" of an ankle sock stays round the ankle)
const LEGCO = (land) => `float lang = atan(vCanon.z, abs(vCanon.x) - ${f3(land.hipJx)}), lu = lang * 0.065, lv = ${f3(land.hipJ)} - vCanon.y, foot = step(0.5, vShare.w), sv = vPart.y * ${f3(land.hipJ - land.ankleY)};`;

// stripes_h counted from the top of a sock (the catalogue gives width and gap as shares of its height)
function sockStripes(pt, v0, span, rib, colour) {
  if (!pt || (pt.type !== 'stripes_h' && pt.type !== 'breton')) return '';
  const w = (pt.width ?? 0.06) * span, g = (pt.gap ?? pt.width ?? 0.06) * span, c = colour || { main: 'uMain', second: 'uSecond', accent: 'uAccent', trim: 'uTrim' }[pt.colour] || 'uSecond';
  if (pt.count === 'all' || !pt.count) return `col = mix(col, ${c}, stripes(sv - ${f3(v0)}, ${f3(w + g)}, ${f3(w)}) * step(${f3(v0 + rib)}, sv) * (1.0 - foot));`;
  const n = +pt.count, out = [];
  for (let i = 0; i < n; i++) { const a = v0 + rib + 0.006 + i * (w + g); out.push(`band(sv, ${f3(a)}, ${f3(a + w)})`); }
  return `col = mix(col, ${c}, clamp(${out.join(' + ')}, 0.0, 1.0));`;
}

// a sock: the leg from s0 over the foot
export function sockShell(ctx, it, s0, o = {}) {
  const land = ctx.land;
  // on the foot it stays close (a shoe goes over it)
  const off = o.off ?? (it.off + (o.ease ?? 0.0006));
  return shell(ctx, { cover: legCover(land, s0, true), off: (V) => off - (off - 0.0015) * clamp((V.ext - 0.3) * 2.5), fill: 1, rim: o.rim ?? 0.003, layer: it.layer, hideMargin: 0.004 });
}

export function socks(ctx, it) {
  const land = ctx.land, p = it.params, LL = land.hipJ - land.ankleY;
  const s0 = LEG[p.length] ?? 0.86, v0 = s0 * LL, span = Math.max(LL - v0, 0.07);
  const tube = it.item.id === 'lg_tube_socks' || (it.item.notes || '').includes('body is "trim"');
  const loose = p.fit === 'loose';
  const rib = s0 > 0.98 ? 0.016 : s0 > 0.8 ? 0.022 : 0.03;
  const piece = sockShell(ctx, it, s0, { ease: loose ? 0.0025 : 0.0006 });
  if (!piece) return [];
  it.hemY = land.ankleY; it.topY = land.hipJ - v0;
  const pt = it.pattern || {};
  const body = tube ? 'uTrim' : 'uMain', band = tube ? 'uTrim' : 'uSecond';
  const glsl = `vec3 col = ${body}; ${LEGCO(land)}
    vec2 P = vec2(lu, lv);
    ${pt.type && pt.type !== 'solid' && pt.type !== 'stripes_h' && pt.type !== 'breton' ? patternGLSL(pt) : ''}
    ${sockStripes(pt, v0, span, rib, tube ? 'uMain' : null)}
    // ribbed top band, knit ribs down the leg for rib knits
    float top = step(sv, ${f3(v0 + rib)});
    col = mix(col, ${band}, top);
    col = mix(col, col * 0.8, stripes(lu, 0.007, 0.0022) * (top + ${has(it, 'rib_knit') ? '0.55' : '0.0'} * (1.0 - foot)));
    col = mix(col, col * 0.7, line(sv, ${f3(v0 + rib)}, 0.0016));
    // heel and toe
    col = mix(col, col * 0.86, foot * step(vCanon.y, 0.03) * 0.6);
    col = mix(col, col * 0.8, step(0.5, vG.w));
    return col;`;
  const pieces = [{ piece, glsl, noPattern: true, noDetails: true }];
  // a ruffle round the top (frilled socks)
  if (has(it, 'ankle_cuff_frill')) {
    const h = 0.02;
    const fr = shell(ctx, {
      cover: (V) => (V.limb === 2 ? Math.min(V.s - (s0 - 0.004), s0 + h / LL - V.s) * 0.5 : -0.1),
      off: (V) => {
        const ang = Math.atan2(V.cz, (V.cx - land.hipJx * V.side) * V.side), t = clamp((V.s - s0) * LL / h);
        return it.off + 0.002 + 0.009 * (1 - t) * (0.7 + 0.3 * Math.sin(ang * 9));
      }, fill: 0, rim: 0.002, hides: false, layer: it.layer,
    });
    if (fr) pieces.push({ piece: fr, noPattern: true, noDetails: true, glsl: `vec3 col = uSecond; ${LEGCO(land)}
      col = mix(col, uAccent, line(sv, ${f3(v0 + 0.002)}, 0.003));
      col = mix(col, col * 0.85, smoothstep(0.2, 1.0, sin(lang * 9.0)) * 0.6);
      col = mix(col, col * 0.85, step(0.5, vG.w));
      return col;` });
  }
  // a thick rolled top (hiking socks, worn rolled down over a boot)
  if ((it.item.notes || '').toLowerCase().includes('rolled') || (loose && has(it, 'rib_knit'))) {
    const h = 0.03;
    const roll = shell(ctx, {
      cover: (V) => (V.limb === 2 ? Math.min(V.s - (s0 - 0.003), s0 + h / LL - V.s) * 0.5 : -0.1),
      off: (V) => it.off + 0.003 + 0.004 * Math.sin(Math.PI * clamp((V.s - s0) * LL / h)), fill: 1, rim: 0.003, hides: false, layer: it.layer,
    });
    if (roll) pieces.push({ piece: roll, noPattern: true, noDetails: true, glsl: `vec3 col = uMain; ${LEGCO(land)}
      col = mix(col, col * 0.78, stripes(lu, 0.008, 0.0026));
      col = mix(col, uSecond, band(sv, ${f3(v0 + 0.01)}, ${f3(v0 + 0.018)}));
      col = mix(col, col * 0.8, step(0.5, vG.w));
      return col;` });
  }
  return pieces;
}

// tights: from the waist down both legs and over the feet
export function tights(ctx, it) {
  const land = ctx.land, top = land.waistY - 0.012;
  const piece = shell(ctx, {
    cover: (V) => (V.limb === 2 ? 0.1 : V.limb === 0 ? Math.min(top - V.cy, 0.3 - V.arm) : -0.1),
    off: it.off + 0.0004, fill: 1, rim: 0.002, layer: it.layer, hideMargin: 0.004,
  });
  if (!piece) return [];
  it.hemY = land.ankleY; it.topY = top;
  const pt = it.pattern || {};
  return [{ piece, noPattern: true, noDetails: true, glsl: `vec3 col = uMain; ${LEGCO(land)}
    vec2 P = vec2(vG.z < 0.5 ? atan(vCanon.x, vCanon.z) * 0.14 : lu, vCanon.y);
    ${patternGLSL(pt)}
    col = mix(col, uMain * 0.82, step(${f3(top - 0.022)}, vCanon.y) * step(vG.z, 0.5));
    col = mix(col, uMain * 0.68, line(vCanon.y, ${f3(top - 0.022)}, 0.0016) * step(vG.z, 0.5));
    col = mix(col, col * 0.86, foot * step(vCanon.y, 0.03) * 0.5);
    col = mix(col, col * 0.8, step(0.5, vG.w));
    return col;` }];
}

// leg warmers: a loose knitted tube round the calf, slouched into rings
export function leg_warmers(ctx, it) {
  const land = ctx.land, LL = land.hipJ - land.ankleY, s0 = 0.56, s1 = 0.99;
  const piece = shell(ctx, {
    cover: (V) => (V.limb === 2 ? Math.min(V.s - s0, s1 - V.s) * 0.5 : -0.1),
    off: (V) => it.off + 0.006 + 0.0045 * (0.5 + 0.5 * Math.sin(V.s * LL * Math.PI * 2 / 0.034)) * sstep(s0, s0 + 0.12, V.s) + 0.004 * sstep(0.85, 0.99, V.s),
    fill: 1, rim: 0.004, layer: it.layer,
  });
  if (!piece) return [];
  const v0 = s0 * LL, span = (s1 - s0) * LL;
  it.hemY = land.hipJ - s1 * LL; it.topY = land.hipJ - v0;
  return [{ piece, noPattern: true, noDetails: true, glsl: `vec3 col = uMain; ${LEGCO(land)}
    ${sockStripes(it.pattern, v0, span, 0.03)}
    float top = step(sv, ${f3(v0 + 0.03)}) + step(${f3(s1 * LL - 0.025)}, sv);
    col = mix(col, col * 0.86, top);
    col = mix(col, col * 0.76, stripes(lu, 0.008, 0.0026) * (0.55 + 0.45 * top));
    col = mix(col, col * 0.8, step(0.5, vG.w));
    return col;` }];
}
