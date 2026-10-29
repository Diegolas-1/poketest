// Basic garments: tees, trousers and shorts, a pleated skirt, low sneakers, a cap.
// The pattern for the rest of garments/*.js: a builder(ctx, it) for each archetype
// (catalog.json's item.base) returns pieces [{ piece (wear.js), glsl? (paint body),
// extra? (glsl added after the pattern and details), uP?, colors? }].
//   it: { item, params (fit, length, sleeve, neckline, ... from the vocabulary), colors, pattern,
//         off (metres off the skin for this layer), layer, has(slot) }
// Set it.hemY / it.topY (canonical heights) so patterns can place themselves.
import { shell, tube, solid, jointPos, boneFrameInv, fy } from '../wear.js';
import { P, smin, union, inter, sub, moved } from '../sdf.js';
import { topCover, bottomCover, topHem, skirtHem, LEG, SLEEVE, neckOf, all, below, above } from './common.js';

// fit -> extra ease (m) and how loosely it hangs from the chest
export const FIT = { tight: [0, 0], fitted: [0.001, 0.15], regular: [0.003, 0.45], relaxed: [0.006, 0.7], loose: [0.01, 0.9], oversized: [0.016, 1], a_line: [0.004, 0.8], flared: [0.004, 0.8], full: [0.006, 1], straight: [0.004, 0.6], tapered: [0.002, 0.4], wide: [0.012, 0.8], 'n/a': [0.003, 0.4] };

// a top's body and sleeves (tees, shirts, sweaters: the shell they all start from)
export function topShell(ctx, it, o = {}) {
  const land = ctx.land, p = it.params, [ease, hang] = FIT[p.fit] || FIT.regular;
  const hem = o.hem ?? topHem(land, p.length);
  it.hemY = hem; it.topY = land.shY + 0.03;
  const cover = o.cover || topCover(land, { neckline: o.neckline ?? p.neckline, sleeve: o.sleeve ?? p.sleeve, hem });
  const sl = SLEEVE[o.sleeve ?? p.sleeve] ?? 0.3;
  return shell(ctx, {
    cover, off: (V) => it.off + ease * (V.limb === 1 ? 0.6 : 1), fill: 2 + Math.round(hang * 3), hang: o.hang ?? hang * 0.85,
    flare: { arm: (sl > 0.5 ? 0.002 : 0.012) * (0.4 + hang), from: 0 }, rim: o.rim ?? 0.004,
  });
}

export const tee = (ctx, it) => [{ piece: topShell(ctx, it) }];

// trousers and shorts: a straight or tapered leg, a waistband
export function pantsShell(ctx, it, o = {}) {
  const land = ctx.land, p = it.params, [ease] = FIT[p.fit] || FIT.regular;
  const s = o.leg ?? LEG[p.length] ?? 0.97;
  it.hemY = land.hipJ - s * (land.hipJ - land.ankleY); it.topY = land.waistY;
  const wide = p.fit === 'wide' || p.fit === 'loose' || p.fit === 'relaxed' ? 0.02 : p.fit === 'flared' ? 0.025 : p.fit === 'tight' || p.fit === 'tapered' ? 0 : 0.008;
  return shell(ctx, {
    cover: bottomCover(land, { leg: s, rise: p.rise }), off: (V) => it.off + ease * (V.limb === 2 ? 1 : 0.5), fill: 3,
    flare: { leg: wide, from: p.fit === 'flared' ? 0.5 : 0.1 }, rim: 0.004,
  });
}
// a waistband, belt loops and a fly for trousers
const PANTS_DETAIL = `
  float wb = step(vG.z, 0.5) * step(uP[0].y - 0.035, P.y);
  col = mix(col, col * 0.86, wb);
  col = mix(col, uTrim, dashes(P.x, P.y, uP[0].y - 0.037, 0.0012, 0.006, 0.0035) * step(vG.z, 0.5));
  col = mix(col, col * 0.8, line(vCanon.x, 0.012, 0.0016) * step(0.0, vCanon.z) * step(vG.z, 0.5) * band(P.y, uP[0].y - 0.15, uP[0].y - 0.035));
  col = mix(col, uTrim, dashes(vG.x, vPart.y, 0.98, 0.0012, 0.006, 0.0035) * step(2.5, vG.z));`;
export const trousers = (ctx, it) => [{ piece: pantsShell(ctx, it), extra: PANTS_DETAIL }];
export const jeans = (ctx, it) => [{ piece: pantsShell(ctx, it), extra: PANTS_DETAIL + `
  col = mix(col, vec3(0.83, 0.62, 0.25), dashes(vG.x, vPart.y, 0.2, 0.001, 0.006, 0.0035) * step(2.5, vG.z) * 0.0);
  col = mix(col, uTrim, line(vG.x, 0.035, 0.0012) * step(2.5, vG.z) * 0.6);` }];
export const shorts = (ctx, it) => [{ piece: pantsShell(ctx, it, { leg: LEG[it.params.length] ?? 0.32 }), extra: PANTS_DETAIL }];

// a pleated skirt hung from the waist (with shorts under it for children: the catalogue's built_in_shorts)
export function skirt_pleated(ctx, it) {
  const land = ctx.land, p = it.params, hem = skirtHem(land, p.length || 'above_knee'), top = land.waistY + 0.005;
  it.hemY = hem; it.topY = top;
  const pieces = [];
  const pl = (p.details || []).includes('pleats_box') ? 16 : 24;
  pieces.push({ piece: tube(ctx, { top, hem, off: it.off + 0.004, flare: 0.05 + (p.fit === 'full' ? 0.04 : 0), pleats: pl, pleatDepth: 0.009, follow: 0.45, layer: it.layer }), uP: [[hem, top, 0, 0], [pl, 0, 0, 0]] });
  // the waistband
  pieces.push({ piece: shell(ctx, { cover: (V) => all(below(V, top + 0.012), above(V, top - 0.02), V.limb === 0 ? 0.05 : -0.05), off: it.off + 0.005, rim: 0.003 }), glsl: 'return uMain * 0.92;' });
  if ((p.details || []).includes('built_in_shorts')) pieces.push({ piece: shell(ctx, { cover: bottomCover(land, { leg: 0.12 }), off: it.off * 0.5, rim: 0.002 }), glsl: 'return uSecond * 0.5 + uMain * 0.3;' });
  return pieces;
}

// ---------- shoes ----------
// a sneaker: a rounded upper round the foot, a chunky sole (a quarter of its height), laces, a toe cap
export function shoeTree(ctx, side, o = {}) {
  const S = side > 0 ? 'L' : 'R', a = jointPos(ctx, S + 'Foot'), t = jointPos(ctx, S + 'Toe'), L = ctx.A.L;
  const fl = L.footL * (o.length ?? 1.08), fw = fl * (o.width ?? 0.42), heelZ = a[2] - L.footL * 0.27, toeZ = heelZ + fl, sole = o.sole ?? fl * 0.12;
  const x = a[0] + side * 0.002;
  const upper = smin(0.012,
    P.ellipsoid({ c: [x, sole + fl * 0.11, heelZ + fl * 0.2], r: [fw * 0.48, fl * 0.15, fl * 0.24] }),
    P.ellipsoid({ c: [x + side * fw * 0.04, sole + fl * 0.085, heelZ + fl * 0.62], r: [fw * 0.52, fl * 0.12, fl * 0.38] }),
    P.rcone({ a: [x, sole + 0.01, a[2] - 0.006], b: [x, a[1] + (o.collar ?? 0.035), a[2] - 0.004], ra: fw * 0.42, rb: fw * 0.38 }),
  );
  const soleT = P.box({ c: [x + side * fw * 0.03, sole * 0.5, (heelZ + toeZ) / 2 - 0.004], h: [fw * 0.55, sole * 0.5, fl * 0.5], round: Math.min(sole * 0.45, 0.012) });
  const shoe = union(inter(upper, P.plane({ p: [0, sole * 0.6, 0], n: [0, -1, 0] })), soleT);
  return { tree: shoe, sole, heelZ, toeZ, fl, fw, x };
}
export function sneaker_low(ctx, it) {
  const p = it.params, d = p.details || [], pieces = [];
  for (const side of [1, -1]) {
    const s = shoeTree(ctx, side, { collar: 0.025 + ((p.length === 'ankle_boot' || it.item.base === 'sneaker_high') ? 0.05 : 0), sole: d.includes('thick_sole') ? 0.032 : undefined });
    const fr = boneFrameInv(ctx, (side > 0 ? 'L' : 'R') + 'Foot');
    const piece = solid(ctx, s.tree, {
      cell: 0.003, verts: 2400, weights: (q) => (q[2] > jointPos(ctx, (side > 0 ? 'L' : 'R') + 'Toe')[2] - 0.01 ? [[side > 0 ? 'LToe' : 'RToe', 0.7], [side > 0 ? 'LFoot' : 'RFoot', 0.3]] : [[side > 0 ? 'LFoot' : 'RFoot', 1]]),
      partOf: (q) => (q[1] < s.sole * 1.02 ? 1 : 0), hide: (V) => (V.limb === 2 && V.s > 0.97 ? 1 : -1),
    });
    if (!piece) continue;
    // paint: the sole (trim), a toe cap and heel tab (second), laces (trim), a side stripe (accent)
    const glsl = `vec3 col = uMain; float y = vG.w;
      if (y > 0.5) return uTrim;
      vec3 w = vCanon; float h = w.y, z = w.z;
      col = mix(col, uSecond, step(${(s.toeZ - 0.045).toFixed(3)}, vG.y) * 0.0);
      col = mix(col, uAccent, band(h, 0.03, 0.045) * step(0.0, abs(w.x) - 0.02));
      return col;`;
    pieces.push({ piece, glsl, noPattern: true });
  }
  return pieces;
}
// ---------- hats ----------
// a cap: a crown over the top of the head and a curved brim at the front
export function cap_baseball(ctx, it) {
  const L = ctx.A.L, c = L.headC, hw = L.hw, hh = L.hh, top = L.crown + 0.012;
  const crownC = [c[0], c[1] + hh * 0.08, c[2] - hh * 0.03];
  const crown = inter(P.ellipsoid({ c: crownC, r: [hw * 0.56, hh * 0.47, hh * 0.53] }), P.plane({ p: [0, c[1] + hh * 0.02, 0], n: [0, -1, 0.35] }));
  const brimZ = c[2] + hh * 0.42;
  const brim = P.ellipsoid({ c: [c[0], c[1] + hh * 0.04, brimZ + hh * 0.08], r: [hw * 0.42, hh * 0.022, hh * 0.24], q: [Math.sin(-0.09), 0, 0, Math.cos(-0.09)] });
  const tree = union(smin(0.004, crown, P.sphere({ c: [0, top - 0.004, crownC[2]], r: 0.008 })), inter(brim, P.plane({ p: [0, 0, c[2] + hh * 0.3], n: [0, 0, -1] })));
  const piece = solid(ctx, tree, { cell: 0.003, verts: 3000, bone: 'Head', partOf: (q) => (q[2] > c[2] + hh * 0.34 && q[1] < c[1] + hh * 0.1 ? 1 : 0) });
  return [{ piece, noPattern: true, glsl: `vec3 col = uMain; if (vG.w > 0.5) col = uSecond;
    float e = orb(vec2(vCanon.x, vCanon.y), vec2(0.0, ${(L.crown - hh * 0.32).toFixed(3)}), 0.03) * step(0.05, vCanon.z) * (1.0 - step(0.5, vG.w));
    col = e > 0.5 ? (e < 1.5 ? uAccent : e < 2.5 ? vec3(0.13) : uTrim) : col;
    return col;` }];
}
