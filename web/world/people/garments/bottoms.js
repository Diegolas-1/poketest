// Bottoms: trousers, jeans, shorts, joggers, leggings and the rest of the catalogue's
// "bottom" slot, and the skirts (pleated, A-line, pencil, tiered, maxi, a skort).
//
// Trousers are wear.js shells cut from the body from the waist down each leg to the
// length the item asks for; the fit sets how far they stand off the skin and whether
// the leg flares (wide, culottes) or tapers into a cuff (joggers). Their construction
// is painted crisply in the shader (pantsPaintHelper): waistband with top stitching,
// belt loops, button and fly, drawcords or a gathered elastic band, front pockets
// (slash, jeans scoop, patch), back pockets (patch, jeans shield, welt), side and
// inside leg seams, creases, side stripes, knee patches, whiskers, turn-ups and cuffs.
// Turn-ups and rib cuffs are thicker bands (a second, slightly looser shell), cargo
// pockets thick patches (a small shell over the thigh with its own rim). Paint uses
// the reference body's coordinates (vCanon) and the shells' own u/v (wear.js), so a
// pocket sits in the same place on a toddler and on an adult.
//
// Skirts are wear.js tubes hung from the waist; skirtTubeHelper reshapes a tube's
// rings after it is made: knife pleats (a saw tooth round the hem), gathers (waves),
// a scalloped or ruffled hem edge. Tiered skirts are several tubes, each a little
// fuller and further out than the one above, each hem ruffled. Children's skirts get
// the catalogue's built-in shorts under them.
//
// Shoes are built before bottoms (outfit.js' slot order): a shoe builder (shoes.js)
// leaves ctx.shoeFit { top, r, tuck } so trouser hems drape over a low shoe or an
// ankle boot and are tucked into tall boots.
import { shell, tube, fy, TAU } from '../wear.js';
import { normals } from '../mesh.js';
import { clamp, sstep } from '../vmath.js';
import { bottomCover, LEG, skirtHem, all, below, above } from './common.js';
import { FIT } from './basics.js';
import { patternGLSL, detailsGLSL } from './patterns.js';

const f3 = (x) => (+x).toFixed(4);
const has = (it, d) => (it.params.details || []).includes(d);

// the leg's u round it (0 at the outside seam, + to the front) and v down from the hip (m, reference body),
// as wear.js gives shells in gco, from a cover function's vertex
export function legUVHelper(V, land) {
  const ang = Math.atan2(V.cz, (V.cx - land.hipJx * V.side) * V.side);
  return [ang * 0.065, V.s * (land.hipJ - land.ankleY)];
}

// trousers' paint coordinates, continuous from the hips down each leg: u round the nearer leg's
// axis (0 at the outside seam, + to the front; the angle times a thigh's radius, so stripes and checks
// run on from the hip into the leg without a break), v the reference height.
// (wear.js gives the trunk and the legs separate u/v, which tear patterns at the top of the thigh.)
// Blotchy prints (camo, splatter) need no direction and take a seamless slanted projection instead.
export function pantsUVHelper(piece, land, planar = false) {
  if (!piece) return piece;
  const m = piece.mesh, n = m.pos.length / 3, C = m.canon, G = m.gco;
  for (let v = 0; v < n; v++) {
    const dx = Math.abs(C[3 * v]) - land.hipJx, z = C[3 * v + 2];
    G[4 * v] = planar ? C[3 * v] + 0.8 * z : Math.atan2(z, dx) * 0.075;
    G[4 * v + 1] = C[3 * v + 1];
  }
  return piece;
}
// the same leg coordinates in GLSL from vCanon (lu as wear.js' leg u, lv down from the hip, tu round the trunk)
const LEGCO = (land) => `float lang = atan(vCanon.z, abs(vCanon.x) - ${f3(land.hipJx)}), lu = lang * 0.065, lv = ${f3(land.hipJ)} - vCanon.y, tu = atan(vCanon.x, vCanon.z) * 0.14;`;

// ---------- trousers ----------
// o: { leg (s), ease, flare, from, taper (m less at the ankle), blouse (m more above the hem), rise,
// turnUp (m of cuff), cuff ('rib' | 'band': a tight band at the hem), cargo: [v0, v1] }
export function pantsShell(ctx, it, o = {}) {
  const land = ctx.land, p = it.params, [ease0] = FIT[p.fit] || FIT.regular;
  let s = o.leg ?? LEG[p.length] ?? 0.97;
  const LL = land.hipJ - land.ankleY;
  const ease = o.ease ?? ease0;
  const flare = o.flare ?? (p.fit === 'wide' ? 0.03 : p.fit === 'loose' ? 0.016 : p.fit === 'relaxed' ? 0.01 : p.fit === 'flared' ? 0.025 : p.fit === 'tight' || p.fit === 'tapered' ? 0 : 0.006);
  const from = o.from ?? (p.fit === 'flared' ? 0.5 : 0.15);
  // shoes (built first) say how high they reach: trousers drape over a low shoe or an ankle boot (the hem
  // stands out round its top), or end inside a tall boot, narrowed to fit in its shaft
  const sf = ctx.shoeFit, L = ctx.A.L, sTop = sf ? (L.hipJ - sf.top) / (L.hipJ - L.ankleY) : 2;
  const overShoe = sf && !sf.tuck && s > sTop - 0.04, tuck = sf && sf.tuck && s > sTop + 0.03;
  if (tuck) s = Math.min(s, sTop + 0.07);
  const offOf = (V) => {
    let d = it.off + ease * (V.limb === 2 ? 1 : 0.5);
    if (V.limb === 2) {
      // flares stand out to the front, back and outside, less between the legs
      const dx = Math.abs(V.cx) - land.hipJx, cosA = dx / (Math.hypot(dx, V.cz) || 1);
      d += flare * sstep(from, 1, V.s) * (flare > 0.012 ? 0.3 + 0.7 * clamp(0.6 + 0.6 * cosA) : 1);
      if (o.taper) d -= o.taper * sstep(0.45, 0.95, V.s);
      if (o.blouse) d += o.blouse * Math.exp(-(((V.s - (s - 0.1)) / 0.08) ** 2));
      if (overShoe) d = Math.max(d, (sf.clear + 0.0045) * sstep(sTop - 0.1, sTop - 0.01, V.s));
      if (tuck) d = Math.min(d, d * (1 - sstep(sTop - 0.12, sTop - 0.02, V.s)) + Math.max(sf.clear * 0.6, 0.002) * sstep(sTop - 0.12, sTop - 0.02, V.s));
    }
    return Math.max(d, 0.0015);
  };
  it.hemY = land.hipJ - Math.min(s, 1) * LL; it.topY = riseHelper(land, p.rise);
  it.hemV = s * LL; it.legS = s;
  const planar = ['camo', 'splatter'].includes((it.pattern || {}).type);
  const piece = pantsUVHelper(shell(ctx, { cover: bottomCover(land, { leg: s, rise: p.rise }), off: offOf, fill: 3, rim: o.rim ?? 0.004, layer: it.layer }), land, planar);
  return { piece, offOf, s };
}
export function riseHelper(land, rise) { return rise === 'high' ? land.waistY + 0.03 : rise === 'low' ? land.hipJ + 0.07 : land.waistY - 0.01; }

// a band round the leg at its hem (turn-up, rib cuff, contrast band): a second shell a little looser
function hemBandShell(ctx, it, ps, h, extra) {
  const land = ctx.land, s = ps.s, LL = land.hipJ - land.ankleY, s0 = s - h / LL;
  return pantsUVHelper(shell(ctx, { cover: (V) => (V.limb === 2 ? Math.min(s + 0.004 - V.s, V.s - s0) * 0.5 : -0.1), off: (V) => ps.offOf(V) + extra, fill: 1, rim: 0.004, hides: false, layer: it.layer }), land);
}
// a thick patch over the outside of the thigh (cargo pockets); its paint has a flap and a snap
function cargoShell(ctx, it, ps, v0, v1, u0 = 0.004, hw = 0.034) {
  const land = ctx.land;
  return pantsUVHelper(shell(ctx, {
    cover: (V) => {
      if (V.limb !== 2) return -0.1;
      const [u, v] = legUVHelper(V, land);
      return Math.min(hw - Math.abs(u - u0), v - v0, v1 - v);
    },
    off: (V) => ps.offOf(V) + 0.0035, fill: 1, rim: 0.004, hides: false, layer: it.layer,
  }), land);
}
const cargoGLSL = (land, v0, v1, u0 = 0.004, hw = 0.034) => `vec3 col = uMain * 0.96; ${LEGCO(land)} float u = lu - ${f3(u0)}, v = lv;
  float fl = step(v, ${f3(v0 + 0.032)});
  col = mix(col, uMain * 0.9, fl);
  col = mix(col, uMain * 0.62, line(v, ${f3(v0 + 0.032)}, 0.0022));
  col = mix(col, uTrim, dashes(u, v, ${f3(v0 + 0.006)}, 0.0012, 0.007, 0.004));
  col = mix(col, uTrim, dashes(v, abs(u), ${f3(hw - 0.005)}, 0.0012, 0.007, 0.004) * step(${f3(v0 + 0.036)}, v));
  col = mix(col, uTrim, dashes(u, v, ${f3(v1 - 0.005)}, 0.0012, 0.007, 0.004));
  col = mix(col, uAccent * 0.9, circle(vec2(u, v), vec2(0.0, ${f3(v0 + 0.018)}), 0.0055));
  col = mix(col, uMain * 0.55, ring(vec2(u, v), vec2(0.0, ${f3(v0 + 0.018)}), 0.0055, 0.0012));
  col = mix(col, uMain * 0.7, step(0.5, vG.w));
  return col;`;

// the construction of trousers and shorts, painted. o: { waist: 'band' | 'elastic' | 'drawstring',
// loops, fly: 'button' | 'zip' | false, front: 'slash' | 'scoop' | 'patch' | false, coin, back: 'patch' | 'shield' | 'welt' | false,
// seams, denim (contrast top stitching, rivets), crease, stripes (count), hem: 'turn_up' | 'rib' | 'band' | 'elastic' | 'split' | 'plain',
// knee (patches), reflective, whiskers, patches (distressed), tab, piping, panel ('left_right'), cords }
export function pantsPaintHelper(land, it, o) {
  const top = riseHelper(land, it.params.rise), WB = o.waist === 'elastic' || o.waist === 'drawstring' ? 0.038 : 0.032, hemV = it.hemV;
  const hx = land.hipJx, flyB = land.crotchY + 0.05, out = [];
  const st = o.denim ? 'uTrim' : 'mix(uMain, uTrim, 0.55)';   // top stitching
  out.push(`{ float trunk = step(vG.z, 0.5), leg = step(2.5, vG.z) * step(vG.z, 4.5), rim = step(0.5, vG.w);
    float y = vCanon.y, ax = abs(vCanon.x), fr = step(0.0, vCanon.z), cz = vCanon.z; ${LEGCO(land)}
    float outer = leg * step(${f3(hx)}, ax) + trunk * step(0.07, ax), inner = leg * step(ax, ${f3(hx)});
    vec3 base = col;`);
  // seams: side (outside leg), inside leg, the rise down the middle front and back
  if (o.seams !== false) {
    out.push(`col = mix(col, base * 0.72, line(cz, 0.0, 0.0022) * max(outer, inner) * step(lv, ${f3(hemV - 0.01)} + trunk));
      col = mix(col, base * 0.72, line(vCanon.x, 0.0, 0.0022) * trunk * step(y, ${f3(top - WB)}) * (1.0 - fr * step(${f3(flyB)}, y) * ${o.fly ? '1.0' : '0.0'}));`);
    if (o.denim) out.push(`col = mix(col, ${st}, dashes(lv, cz, 0.0045, 0.0012, 0.007, 0.0042) * outer);
      col = mix(col, ${st}, dashes(lv, cz, -0.0045, 0.0012, 0.007, 0.0042) * inner);`);
  }
  // waistband
  if (o.waist !== false) {
    out.push(`float wb = trunk * step(${f3(top - WB)}, y);
      col = mix(col, ${o.waistColor || 'base * 0.9'}, wb);
      col = mix(col, base * 0.62, line(y, ${f3(top - WB)}, 0.0022) * trunk);`);
    if (o.waist === 'elastic' || o.waist === 'drawstring') out.push(`col = mix(col, base * 0.78, wb * stripes(tu, 0.009, 0.0026));`);
    else out.push(`col = mix(col, ${st}, dashes(tu, y, ${f3(top - WB + 0.006)}, 0.0012, 0.008, 0.0048) * trunk);
      col = mix(col, ${st}, dashes(tu, y, ${f3(top - 0.005)}, 0.0012, 0.008, 0.0048) * trunk);`);
    if (o.waist === 'drawstring' || o.cords) out.push(`{ vec2 q = vec2(vCanon.x, y);
      float cord = (line(q.x - 0.012 - (${f3(top - WB * 0.5)} - q.y) * 0.08, 0.0, 0.0034) + line(q.x + 0.012 + (${f3(top - WB * 0.5)} - q.y) * 0.08, 0.0, 0.0034)) * band(q.y, ${f3(top - WB - 0.075)}, ${f3(top - WB * 0.5)});
      float tip = (box2(q, vec2(0.0185, ${f3(top - WB - 0.07)}), vec2(0.0028, 0.008), 0.0015) + box2(q, vec2(-0.0185, ${f3(top - WB - 0.07)}), vec2(0.0028, 0.008), 0.0015));
      float eye = ring(q, vec2(0.012, ${f3(top - WB * 0.5)}), 0.004, 0.0016) + ring(q, vec2(-0.012, ${f3(top - WB * 0.5)}), 0.004, 0.0016);
      col = mix(col, ${o.cordColor || 'uTrim'}, clamp(cord, 0.0, 1.0) * fr * trunk);
      col = mix(col, ${o.cordColor || 'uTrim'} * 0.7, clamp(tip, 0.0, 1.0) * fr * trunk);
      col = mix(col, vec3(0.75), clamp(eye, 0.0, 1.0) * fr * trunk); }`);
  }
  if (o.loops) out.push(`{ float lx = abs(tu); float lp = 0.0;
      lp += box2(vec2(lx, y), vec2(0.078, ${f3(top - WB * 0.5)}), vec2(0.0045, ${f3(WB * 0.5 + 0.003)}), 0.0012);
      lp += box2(vec2(lx, y), vec2(0.205, ${f3(top - WB * 0.5)}), vec2(0.0045, ${f3(WB * 0.5 + 0.003)}), 0.0012);
      lp += box2(vec2(lx, y), vec2(0.335, ${f3(top - WB * 0.5)}), vec2(0.0045, ${f3(WB * 0.5 + 0.003)}), 0.0012);
      lp += box2(vec2(lx, y), vec2(0.44, ${f3(top - WB * 0.5)}), vec2(0.0045, ${f3(WB * 0.5 + 0.003)}), 0.0012);
      col = mix(col, base * 0.55, clamp(lp, 0.0, 1.0) * trunk);
      lp = 0.0;
      lp += box2(vec2(lx, y), vec2(0.078, ${f3(top - WB * 0.5)}), vec2(0.0032, ${f3(WB * 0.5 + 0.0015)}), 0.001);
      lp += box2(vec2(lx, y), vec2(0.205, ${f3(top - WB * 0.5)}), vec2(0.0032, ${f3(WB * 0.5 + 0.0015)}), 0.001);
      lp += box2(vec2(lx, y), vec2(0.335, ${f3(top - WB * 0.5)}), vec2(0.0032, ${f3(WB * 0.5 + 0.0015)}), 0.001);
      lp += box2(vec2(lx, y), vec2(0.44, ${f3(top - WB * 0.5)}), vec2(0.0032, ${f3(WB * 0.5 + 0.0015)}), 0.001);
      col = mix(col, base * 0.95, clamp(lp, 0.0, 1.0) * trunk); }`);
  // fly and button
  if (o.fly) {
    out.push(`{ vec2 q = vec2(vCanon.x, y); float h = ${f3((top - WB - flyB) / 2)}; float c = ${f3((top - WB + flyB) / 2)};
      float j = boxLine(q, vec2(0.0, c + 0.01), vec2(0.026, h + 0.01), 0.02, 0.0018) * step(0.0, q.x) * step(q.y, ${f3(top - WB)});
      col = mix(col, ${o.denim ? st : 'base * 0.66'}, j * fr * trunk);
      col = mix(col, base * 0.62, line(q.x, 0.0, 0.0024) * band(q.y, ${f3(flyB)}, ${f3(top - WB)}) * fr * trunk); }`);
    if (o.fly === 'button') out.push(`{ vec2 q = vec2(vCanon.x, y); vec2 c = vec2(0.0, ${f3(top - WB * 0.5)});
      float b = circle(q, c, 0.0065) * fr * trunk;
      col = mix(col, ${o.denim ? 'vec3(0.78, 0.6, 0.32)' : 'uMain * 0.6'}, b);
      col = mix(col, ${o.denim ? 'vec3(0.5, 0.36, 0.18)' : 'uMain * 0.4'}, ring(q, c, 0.0042, 0.0012) * fr * trunk); }`);
  }
  // front pockets
  if (o.front === 'slash') out.push(`{ vec2 q = vec2(ax, y), A = vec2(0.072, ${f3(top - WB)}), B = vec2(0.135, ${f3(top - WB - 0.105)}); vec2 pa = q - A, ba = B - A;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); float d = length(pa - ba * h);
      col = mix(col, base * 0.6, aa(d - 0.0013) * fr * trunk);
      col = mix(col, ${st}, aa(abs(d - 0.0045) - 0.0006) * step(0.02, h) * step(h, 0.98) * fr * trunk * 0.9); }`);
  if (o.front === 'scoop') out.push(`{ vec2 q = vec2(ax, y); vec2 c = vec2(0.16, ${f3(top)}); float r = length(q - c);
      float m = fr * trunk * step(q.x, 0.16) * step(q.y, ${f3(top - WB)});
      col = mix(col, base * 0.6, aa(abs(r - 0.085) - 0.0011) * m);
      col = mix(col, ${st}, aa(abs(r - 0.091) - 0.0006) * m);
      ${o.rivets ? `col = mix(col, vec3(0.8, 0.6, 0.3), circle(q, vec2(0.078, ${f3(top - WB - 0.004)}), 0.0035) * fr * trunk);` : ''} }`);
  if (o.coin) out.push(`{ vec2 q = vec2(-vCanon.x, y); float m = fr * trunk * step(0.0, q.x);
      col = mix(col, ${st}, boxLine(q, vec2(0.11, ${f3(top - WB - 0.03)}), vec2(0.018, 0.022), 0.002, 0.0011) * m * step(q.y, ${f3(top - WB - 0.004)})); }`);
  if (o.front === 'patch') out.push(`{ vec2 q = vec2(ax, y); vec2 c = vec2(0.115, ${f3(top - WB - 0.07)});
      float pk = box2(q, c, vec2(0.04, 0.045), 0.008) * fr * trunk;
      col = mix(col, base * 0.93, pk);
      col = mix(col, ${st}, boxLine(q, c, vec2(0.034, 0.039), 0.006, 0.0011) * fr * trunk);
      col = mix(col, base * 0.6, boxLine(q, c, vec2(0.04, 0.045), 0.008, 0.0016) * fr * trunk);
      col = mix(col, base * 0.65, line(q.y, ${f3(top - WB - 0.04)}, 0.0016) * band(q.x, 0.075, 0.155) * fr * trunk); }`);
  // back pockets
  if (o.back === 'patch' || o.back === 'shield') {
    const pt = o.back === 'shield' ? 0.6 : 0.25;
    out.push(`{ vec2 q = vec2(ax, y) - vec2(0.072, ${f3(top - WB - 0.065)}); vec2 hb = vec2(0.038, 0.042);
      float d = max(max(abs(q.x) - hb.x, q.y - hb.y), (-q.y - hb.y + abs(q.x) * ${f3(pt)}) * 0.9);
      float m = (1.0 - fr) * trunk;
      col = mix(col, base * 0.92, aa(d) * m);
      col = mix(col, base * 0.6, aa(abs(d) - 0.0011) * m);
      col = mix(col, ${st}, aa(abs(d + 0.005) - 0.0006) * m);
      ${o.back === 'shield' ? `col = mix(col, ${st}, aa(abs(length(vec2(q.x * 0.9, q.y + 0.075)) - 0.075) - 0.0006) * step(abs(q.x), 0.03) * step(-0.02, q.y) * aa(d + 0.006) * m);` : ''}
      col = mix(col, ${st}, aa(abs(q.y - hb.y + 0.008) - 0.0006) * aa(d + 0.002) * m); }`);
  }
  if (o.back === 'welt') out.push(`{ vec2 q = vec2(ax, y) - vec2(0.072, ${f3(top - WB - 0.04)});
      col = mix(col, base * 0.55, box2(q, vec2(0.0), vec2(0.032, 0.0022), 0.001) * (1.0 - fr) * trunk);
      col = mix(col, base * 0.75, circle(q, vec2(0.0, -0.01), 0.004) * (1.0 - fr) * trunk); }`);
  // a crease down the front of each leg
  if (o.crease) out.push(`col = mix(col, base * 1.1, line(lu, 0.1, 0.0016) * leg * step(0.06, lv) * 0.8);
      col = mix(col, base * 0.82, line(lu, 0.104, 0.0014) * leg * step(0.06, lv) * 0.7);`);
  // side stripes from the waist to the hem
  if (o.stripes) {
    const n = o.stripes, w = o.stripeW ?? 0.0055, g = o.stripeGap ?? 0.0035, c0 = -((n - 1) * (w + g)) / 2, ln = [];
    for (let i = 0; i < n; i++) ln.push(`line(cz, ${f3(c0 + i * (w + g))}, ${f3(w)})`);
    out.push(`col = mix(col, ${o.stripeColor || 'uSecond'}, clamp(${ln.join(' + ')}, 0.0, 1.0) * outer * (1.0 - rim) * step(y, ${f3(top - WB)} + leg));`);
  }
  if (o.piping) out.push(`col = mix(col, uTrim, line(cz, 0.0, 0.003) * outer * (1.0 - rim));`);
  if (o.panel === 'left_right') out.push(`col = mix(col, ${o.panelColor || 'uSecond'}, step(0.0, vCanon.x) * (1.0 - rim) * (1.0 - step(${f3(top - WB)}, y) * trunk));
      col = mix(col, uAccent, line(cz, 0.0, 0.006) * outer * (1.0 - rim));`);
  // knee patches (appliques), reflective bands, whiskers, faded patches
  if (o.knee) out.push(`{ vec2 q = vec2(lu, lv), c = vec2(0.098, ${f3(0.5 * (land.hipJ - land.ankleY))});
      float k = box2(q, c, vec2(0.04, 0.05), 0.016) * leg;
      col = mix(col, ${o.kneeColor || 'uSecond'}, k);
      col = mix(col, ${o.knee === 'applique' ? 'uTrim' : 'uMain * 0.6'}, boxLine(q, c, vec2(0.034, 0.044), 0.012, 0.0012) * leg * ${o.knee === 'applique' ? '1.0' : '0.8'});
      col = mix(col, uMain * 0.55, boxLine(q, c, vec2(0.04, 0.05), 0.016, 0.0016) * leg); }`);
  if (o.reflective) out.push(`col = mix(col, vec3(0.86, 0.88, 0.86), (band(lv, ${f3(hemV - 0.16)}, ${f3(hemV - 0.135)}) + band(lv, ${f3(hemV - 0.11)}, ${f3(hemV - 0.085)})) * leg);
      col = mix(col, uSecond, (band(lv, ${f3(hemV - 0.135)}, ${f3(hemV - 0.11)})) * leg);`);
  if (o.whiskers) out.push(`{ float fade = leg * smoothstep(0.08, 0.0, abs(lu - 0.1)) * (smoothstep(0.02, 0.14, lv) * smoothstep(0.34, 0.2, lv) + smoothstep(0.34, 0.39, lv) * smoothstep(0.46, 0.4, lv));
      col = mix(col, uSecond, fade * 0.32);
      float wh = 0.0; for (int i = 0; i < 4; i++) { float c = 0.035 + float(i) * 0.014; wh += line(lv - (lu - 0.1) * 0.35, c, 0.0016) * band(lu, 0.07, 0.14); }
      col = mix(col, uSecond, clamp(wh, 0.0, 1.0) * leg * 0.55); }`);
  if (o.patches) out.push(`{ float pz = leg * box2(vec2(lu, lv), vec2(0.075, 0.2), vec2(0.022, 0.016), 0.006) + leg * box2(vec2(lu, lv), vec2(0.115, 0.58), vec2(0.018, 0.012), 0.005) * step(vG.z, 3.5);
      col = mix(col, mix(uSecond, vec3(0.95), 0.45), pz);
      col = mix(col, uMain * 0.85, pz * stripes(lv, 0.004, 0.0012)); }`);
  if (o.tab) out.push(`{ vec2 q = vec2(vCanon.x, y); col = mix(col, uAccent, box2(q, vec2(0.13, ${f3(top - WB - 0.006)}), vec2(0.006, 0.011), 0.002) * fr * trunk); }`);
  // the hem: turn-ups, bands, rib cuffs, a split at the side
  if (o.hem === 'split') out.push(`{ float sp = leg * outer * band(lv, ${f3(hemV - 0.04)}, ${f3(hemV + 0.01)});
      col = mix(col, base * 0.45, sp * aa(abs(cz) - 0.0025 + (lv - ${f3(hemV - 0.04)}) * 0.08));
      col = mix(col, uTrim, sp * aa(abs(abs(cz) - 0.007) - 0.0006) * step(lv, ${f3(hemV - 0.006)})); }`);
  if (o.hem !== 'turn_up' && o.hem !== 'rib' && o.hem !== 'band' && o.hemStitch !== false) out.push(`col = mix(col, ${st}, dashes(lu, lv, ${f3(hemV - 0.012)}, 0.0012, 0.008, 0.0048) * leg);`);
  if (o.hem === 'elastic') out.push(`col = mix(col, base * 0.75, leg * band(lv, ${f3(hemV - 0.03)}, ${f3(hemV)}) * stripes(lu, 0.01, 0.003));`);
  out.push('col = mix(col, col * 0.8, rim); }');
  return out.join('\n');
}

// details the generic painter (patterns.js) draws well on any piece; ours handle the rest
const GENERIC_DETAILS = ['emblem_ball', 'logo_small_hem', 'logo_small_chest', 'embroidery_small', 'patch_flag'];
function genericDetails(it) { return detailsGLSL((it.params.details || []).filter((d) => GENERIC_DETAILS.includes(d))); }
// the item's pattern, unless it is one the builder draws itself (side seam stripes, left/right blocks)
function patternOf(it) {
  const pt = it.pattern || {};
  if ((pt.type === 'stripes_v' && pt.placement === 'side_seam') || (pt.type === 'colour_block' && pt.layout === 'left_right')) return '';
  return patternGLSL(pt);
}

// a whole pair of trousers: shell, bands, pockets and paint. o: pantsShell's options + the painter's
function pantsHelper(ctx, it, o = {}) {
  const p = it.params, land = ctx.land, LL = land.hipJ - land.ankleY;
  const ps = pantsShell(ctx, it, o);
  if (!ps.piece) return [];
  const pt = it.pattern || {};
  const paint = {
    waist: o.waist ?? (p.closure === 'elastic' ? 'elastic' : p.closure === 'drawstring' ? 'drawstring' : 'band'),
    loops: o.loops ?? has(it, 'belt_loops'), fly: o.fly ?? (p.closure === 'buttons_single' ? 'button' : p.closure === 'zip' ? 'zip' : false),
    front: o.front ?? ({ slash: 'slash', patch_hip: 'patch', flap_cargo: 'slash', shield_back: 'slash', back_patch: 'slash' }[p.pockets] || false),
    back: o.back ?? ({ back_patch: 'patch', shield_back: 'shield', flap_cargo: 'patch', slash: 'welt' }[p.pockets] || false),
    hem: o.hem ?? ({ turn_up: 'turn_up', rib_band: 'rib', contrast_band: 'band', elastic: 'elastic', side_split: 'split' }[p.hem] || 'plain'),
    knee: o.knee ?? (has(it, 'kneepads') ? 'pad' : false), reflective: has(it, 'reflective_tape'), whiskers: has(it, 'whiskers_wash'),
    patches: has(it, 'distressed_patches_safe'), tab: has(it, 'tabs_pull'), piping: has(it, 'piping'),
    stripes: o.stripes ?? (pt.type === 'stripes_v' && pt.placement === 'side_seam' ? (+pt.count || 2) : has(it, 'side_stripes') ? 2 : 0),
    panel: pt.type === 'colour_block' && pt.layout === 'left_right' ? 'left_right' : false,
    cords: has(it, 'drawcords'), ...o,
  };
  it.hemV = ps.s * LL;
  const pieces = [{ piece: ps.piece, noPattern: true, noDetails: true, extra: patternOf(it) + genericDetails(it) + pantsPaintHelper(land, it, paint), uP: [[it.hemY, it.topY, it.hemV, 0]] }];
  // a turn-up (with its lining showing), a rib cuff or a contrast band at the hem
  const hemV = it.hemV;
  if (paint.hem === 'turn_up') {
    const h = o.turnUp ?? (ps.s < 0.7 ? 0.03 : 0.04);
    const lining = has(it, 'turnup_lining');
    pieces.push({ piece: hemBandShell(ctx, it, ps, h, 0.003), noPattern: !!lining, noDetails: true, extra: `{ ${LEGCO(land)}
      ${lining ? `col = mix(uSecond, uSecond * 0.85, stripes(lu, 0.012, 0.004)); col = mix(col, uTrim, line(lv, ${f3(hemV - h + 0.008)}, 0.003));` : 'col *= 0.95;'}
      col = mix(col, col * 0.62, line(lv, ${f3(hemV - h + 0.002)}, 0.0022));
      col = mix(col, col * 0.8, step(0.5, vG.w)); }`, uP: [[it.hemY, it.topY, hemV, 0]] });
  }
  if (paint.hem === 'rib' || paint.hem === 'band') {
    const h = o.cuffH ?? (paint.hem === 'rib' ? 0.045 : 0.035);
    pieces.push({ piece: hemBandShell(ctx, it, ps, h, 0.0022), noPattern: true, noDetails: true,
      extra: `{ ${LEGCO(land)} ` + (paint.hem === 'rib' ? `col = mix(${o.cuffColor || 'uMain * 0.92'}, ${o.cuffColor || 'uMain'} * 0.72, stripes(lu, 0.008, 0.0028)); col = mix(col, col * 0.8, step(0.5, vG.w));`
        : `col = ${o.cuffColor || 'uSecond'}; col = mix(col, uTrim, line(lv, ${f3(hemV - h + 0.006)}, 0.002)); col = mix(col, col * 0.8, step(0.5, vG.w));`) + ' }' });
  }
  // cargo pockets on the outside of each thigh
  if (o.cargo || p.pockets === 'flap_cargo') {
    const [v0, v1] = o.cargo || (ps.s < 0.7 ? [Math.min(0.17, hemV - 0.16), Math.min(0.29, hemV - 0.05)] : [0.25, 0.37]);
    const cp = cargoShell(ctx, it, ps, v0, v1);
    if (cp) pieces.push({ piece: cp, glsl: cargoGLSL(land, v0, v1) });
  }
  return pieces;
}

// ---------- the archetypes ----------
export const trousers = (ctx, it) => pantsHelper(ctx, it, { crease: it.params.fit !== 'loose' && (it.pattern || {}).type !== 'tartan', back: 'welt', front: 'slash' });
export const chinos = (ctx, it) => pantsHelper(ctx, it, { back: 'welt' });
export const jeans = (ctx, it) => {
  const p = it.params, tight = p.fit === 'tight';
  return pantsHelper(ctx, it, { denim: true, front: 'scoop', coin: true, rivets: true, back: 'shield', fly: 'button', loops: true, ease: tight ? 0.0005 : undefined, flare: tight ? -0.002 : undefined,
    knee: has(it, 'kneepads') ? 'applique' : false, kneeColor: 'uAccent' });
};
export const skinny_pants = (ctx, it) => pantsHelper(ctx, it, { ease: 0.0006, flare: -0.002, front: 'slash', back: 'welt' });
export const cargo_pants = (ctx, it) => pantsHelper(ctx, it, { back: 'patch', front: 'slash', blouse: it.params.hem === 'elastic' ? 0.006 : 0 });
export const work_trousers = (ctx, it) => pantsHelper(ctx, it, { back: 'patch', front: 'slash', loops: true, kneeColor: 'uMain * 0.75' });
export const track_pants = (ctx, it) => pantsHelper(ctx, it, { fly: false, front: 'slash', back: false, taper: 0.004, blouse: 0.003, hem: 'elastic', seams: true });
export const joggers = (ctx, it) => pantsHelper(ctx, it, { fly: false, front: 'slash', back: false, leg: 0.95, taper: 0.006, blouse: 0.006, hem: 'rib', cuffH: 0.05, cuffColor: 'uMain', ease: 0.003 });
export const leggings = (ctx, it) => pantsHelper(ctx, it, { ease: 0, flare: -0.0015, fly: false, front: false, back: false, loops: false, waist: 'elastic', seams: true, hemStitch: false });
export const gi_pants = (ctx, it) => pantsHelper(ctx, it, { leg: 0.93, ease: 0.008, flare: 0.012, from: 0.1, fly: false, front: false, back: false, waist: 'drawstring', cordColor: 'uAccent', stripes: 0, hem: 'plain' });
export const pyjama_pants = (ctx, it) => pantsHelper(ctx, it, { ease: 0.008, flare: 0.012, fly: false, front: false, back: false, waist: 'elastic', hem: 'band', cuffH: 0.04, cuffColor: 'uSecond' });
export const capri = (ctx, it) => pantsHelper(ctx, it, { leg: LEG[it.params.length] ?? 0.62, back: 'welt' });
export const breeches = (ctx, it) => pantsHelper(ctx, it, { leg: 0.62, ease: 0.006, blouse: 0.012, hem: 'rib', cuffH: 0.035, cuffColor: 'uMain', back: 'patch' });
export const culottes = (ctx, it) => {
  const pieces = pantsHelper(ctx, it, { leg: LEG[it.params.length] ?? 0.6, ease: 0.006, flare: 0.07, from: 0.0, back: false, fly: false });
  // pressed knife pleats down the front of each leg
  if (pieces[0] && has(it, 'pleats_knife')) pieces[0].extra += `{ ${LEGCO(ctx.land)} col = mix(col, col * 0.78, (line(lu, 0.075, 0.0018) + line(lu, 0.125, 0.0018)) * step(2.5, vG.z) * (1.0 - step(0.5, vG.w))); }`;
  return pieces;
};
// shorts: the same trousers cut at the thigh or knee
export const shorts = (ctx, it) => pantsHelper(ctx, it, {
  leg: LEG[it.params.length] ?? 0.32, denim: it.params.pockets === 'shield_back', front: it.params.pockets === 'shield_back' ? 'scoop' : undefined, coin: it.params.pockets === 'shield_back',
  turnUp: 0.03, back: it.params.pockets === 'shield_back' ? 'shield' : 'welt',
});
export const shorts_cargo = (ctx, it) => pantsHelper(ctx, it, { leg: LEG[it.params.length] ?? 0.5, ease: 0.006, flare: 0.012, back: 'patch' });
export const shorts_sport = (ctx, it) => pantsHelper(ctx, it, { leg: LEG[it.params.length] ?? 0.36, ease: 0.006, flare: 0.016, fly: false, front: false, back: false, hem: 'split', stripeW: 0.007 });
export const swim_shorts = (ctx, it) => pantsHelper(ctx, it, { leg: LEG[it.params.length] ?? 0.48, ease: 0.006, flare: 0.016, fly: false, back: false, front: 'patch', waist: 'drawstring', cordColor: 'uTrim', hem: 'plain' });

// ---------- skirts ----------
// a tube (wear.js) reshaped after it is made. o: tube's options + knife (pleat count, a saw tooth),
// knifeDepth, gathers (count), gatherAmp, scallops (count round the hem), scallopDepth, ruffle (amp of a
// wave growing towards the hem)
export function skirtTubeHelper(ctx, o) {
  const pc = tube(ctx, o);
  if (!pc) return null;
  const m = pc.mesh, n = m.pos.length / 3, G = m.gco, P = m.pos;
  // the tube's axis, found the way wear.js finds it
  const yTop = fy(ctx, o.top);
  let zc = 0, cnt = 0;
  for (let v = 0; v < ctx.n; v++) { const y = ctx.body.pos[3 * v + 1]; if (Math.abs(y - yTop) < 0.03 && ctx.body.part[4 * v] === 0) { zc += ctx.body.pos[3 * v + 2]; cnt++; } }
  zc = cnt ? zc / cnt : 0;
  const span = o.top - o.hem, rowT = 1.6 * (o.step || 0.012) / Math.max(fy(ctx, o.top) - fy(ctx, o.hem), 0.02);
  for (let v = 0; v < n; v++) {
    const th = G[4 * v] / 0.15, t = clamp((o.top - G[4 * v + 1]) / span);
    let d = 0;
    if (o.knife) { const f = (((th / TAU) * o.knife) % 1 + 1) % 1; d += (o.knifeDepth ?? 0.008) * (f < 0.85 ? f / 0.85 : (1 - f) / 0.15) * sstep(0, 0.35, t); }
    if (o.gathers) d += (o.gatherAmp ?? 0.004) * Math.sin(th * o.gathers) * (0.35 + 0.65 * sstep(0, 0.4, t));
    if (o.ruffle) d += o.ruffle * Math.sin(th * (o.ruffleN || 40)) * sstep(0.55, 1, t);
    if (d) { P[3 * v] += Math.sin(th) * d; P[3 * v + 2] += Math.cos(th) * d; }
    if (o.scallops) {
      const k = sstep(1 - rowT, 1, t);
      if (k > 0) P[3 * v + 1] += (o.scallopDepth ?? 0.008) * k * (1 - Math.sqrt(Math.abs(Math.sin(th * o.scallops / 2))));
    }
  }
  // keep zc in reach for painters
  m.nrm = normals(m);
  pc.zc = zc;
  return pc;
}
// a waistband round the top of a skirt
function waistbandShell(ctx, it, top, h = 0.024) {
  return shell(ctx, { cover: (V) => all(below(V, top + 0.006), above(V, top - h), V.limb === 0 ? 0.05 : -0.05), off: it.off + 0.006, rim: 0.003, fill: 1, layer: it.layer });
}
const WAISTBAND_GLSL = (top, h, elastic, buttons) => `vec3 col = uMain * 0.9; float y = vCanon.y;
  ${elastic ? 'col = mix(col, uMain * 0.72, stripes(vG.x, 0.009, 0.0026));' : `col = mix(col, mix(uMain, uTrim, 0.5), dashes(vG.x, y, ${f3(top - h + 0.005)}, 0.0011, 0.008, 0.0048) + dashes(vG.x, y, ${f3(top + 0.001)}, 0.0011, 0.008, 0.0048));`}
  ${buttons ? `col = mix(col, uAccent, circle(vec2(vCanon.x, y), vec2(0.0, ${f3(top - h / 2 + 0.003)}), 0.0065) * step(0.0, vCanon.z));` : ''}
  col = mix(col, col * 0.75, step(0.5, vG.w));
  return col;`;
// shorts under a child's skirt
function underShortsShell(ctx, it) {
  return shell(ctx, { cover: bottomCover(ctx.land, { leg: 0.13 }), off: it.off * 0.6, rim: 0.002, fill: 2, layer: it.layer });
}
const UNDER_GLSL = 'vec3 col = mix(uMain, uSecond, 0.35) * 0.85; col = mix(col, col * 0.8, step(0.5, vG.w)); return col;';
// built-in shorts (the catalogue's rule for children's skirts; the item's details say so)
const underShorts = (ctx, it) => has(it, 'built_in_shorts');

// the paint of a skirt: hem stitching, side zip, a back vent, the front yoke, buttons, patch pockets
function skirtPaintHelper(it, top, hem, o = {}) {
  const out = [`{ float y = vG.y, a = vG.x / 0.15, fr = step(0.0, cos(a)), rim = step(0.5, vG.w); vec3 base = col; float sx = sin(a), cx = cos(a);`];
  out.push(`col = mix(col, mix(base, uTrim, 0.5), dashes(a, y, ${f3(hem + 0.012)}, 0.0012, 0.05, 0.03));`);
  if (o.zip) out.push(`col = mix(col, base * 0.62, line(a, ${f3(-Math.PI / 2)}, 0.02) * step(${f3(top - 0.14)}, y));`);
  if (o.vent) out.push(`col = mix(col, base * 0.5, line(abs(a), 3.1416, 0.03) * step(y, ${f3(hem + 0.09)}));
    col = mix(col, base * 0.75, line(abs(a), 3.08, 0.012) * step(y, ${f3(hem + 0.09)}));`);
  if (o.inverted) out.push(`col = mix(col, base * 0.6, line(a, 0.0, 0.035) * step(y, ${f3(top - 0.04)}));`);
  if (o.yoke) out.push(`col = mix(col, base * 0.65, line(y, ${f3(top - 0.07)} + 0.04 * (1.0 - cx), 0.0022) * fr);
    col = mix(col, mix(base, uTrim, 0.6), dashes(a, y - 0.04 * (1.0 - cx), ${f3(top - 0.077)}, 0.0011, 0.05, 0.03) * fr);`);
  if (o.buttons) out.push(`{ float bb = 0.0; for (int i = 0; i < 5; i++) { float by = ${f3(top - 0.05)} - float(i) * ${f3((top - hem - 0.08) / 4.5)}; bb += circle(vec2(sx * 0.16, y), vec2(0.0, by), 0.0065); }
    col = mix(col, ${o.buttons}, clamp(bb, 0.0, 1.0) * fr);
    col = mix(col, base * 0.7, line(sx * 0.16, -0.012, 0.0016) * fr * step(y, ${f3(top - 0.024)})); }`);
  if (o.pockets) out.push(`{ vec2 q = vec2(abs(sx) * 0.16, y), c = vec2(0.085, ${f3(top - 0.11)});
    col = mix(col, base * 0.92, box2(q, c, vec2(0.032, 0.036), 0.008) * fr);
    col = mix(col, mix(base, uTrim, 0.6), boxLine(q, c, vec2(0.027, 0.031), 0.006, 0.0011) * fr);
    col = mix(col, base * 0.6, boxLine(q, c, vec2(0.032, 0.036), 0.008, 0.0016) * fr); }`);
  if (o.slash) out.push(`{ vec2 q = vec2(abs(sx) * 0.16, y); col = mix(col, base * 0.6, line(q.x - (${f3(top - 0.03)} - q.y) * 0.45, 0.115, 0.002) * band(q.y, ${f3(top - 0.13)}, ${f3(top - 0.03)}) * fr); }`);
  if (o.belt) out.push(`{ float bt = band(y, ${f3(top - 0.032)}, ${f3(top + 0.002)});
    col = mix(col, uSecond, bt); vec2 q = vec2(sx * 0.16, y);
    col = mix(col, uTrim, boxLine(q, vec2(0.0, ${f3(top - 0.015)}), vec2(0.016, 0.014), 0.003, 0.004) * fr); }`);
  out.push('col = mix(col, col * 0.8, rim); }');
  return out.join('\n');
}

export function skirt_pleated(ctx, it) {
  const land = ctx.land, p = it.params, hem = skirtHem(land, p.length || 'above_knee'), top = land.waistY + 0.005;
  it.hemY = hem; it.topY = top;
  const box = has(it, 'pleats_box');
  const n = box ? 14 : 22;
  const pc = box ? skirtTubeHelper(ctx, { top, hem, off: it.off + 0.004, flare: 0.032 + (p.fit === 'full' ? 0.03 : 0), pleats: n, pleatDepth: 0.009, follow: 0.45, layer: it.layer, segments: 112 })
    : skirtTubeHelper(ctx, { top, hem, off: it.off + 0.004, flare: 0.055 + (p.fit === 'full' ? 0.03 : 0), knife: n, knifeDepth: 0.009, follow: 0.45, layer: it.layer, segments: 132 });
  const pieces = [];
  // pleat folds painted along the tube's seams, so the two-tone pattern and plaid line up with them
  const folds = `{ float a = vG.x / 0.15, fk = fract(a / 6.2831853 * ${n}.0); col = mix(col, col * 0.7, ${box ? 'line(abs(fk - 0.5), 0.25, 0.012)' : 'line(fk, 0.85, 0.01) + line(fk, 0.0, 0.006)'} * smoothstep(${f3(top - 0.03)}, ${f3(top - 0.1)}, vG.y)); }`;
  pieces.push({ piece: pc, noDetails: true, extra: folds + skirtPaintHelper(it, top, hem, { zip: p.closure === 'side_zip', inverted: has(it, 'inverted_pleat') }), uP: [[hem, top, 0, 0], [n, 0, 0, 0]] });
  pieces.push({ piece: waistbandShell(ctx, it, top), glsl: WAISTBAND_GLSL(top, 0.024, p.closure === 'elastic', false) });
  if (underShorts(ctx, it)) pieces.push({ piece: underShortsShell(ctx, it), glsl: UNDER_GLSL });
  return pieces;
}
export function skirt_aline(ctx, it) {
  const land = ctx.land, p = it.params, hem = skirtHem(land, p.length || 'above_knee'), top = land.waistY + 0.005;
  it.hemY = hem; it.topY = top;
  const long = top - hem > 0.4;
  const pc = skirtTubeHelper(ctx, { top, hem, off: it.off + 0.004, flare: long ? 0.1 : 0.06, follow: long ? 0.3 : 0.45, gathers: 7, gatherAmp: 0.0012, layer: it.layer, segments: 96 });
  const pieces = [{ piece: pc, noDetails: true, extra: genericDetails(it) + skirtPaintHelper(it, top, hem, {
    zip: p.closure === 'side_zip', yoke: !long, buttons: has(it, 'buttons_contrast') ? 'uAccent' : p.closure === 'buttons_single' ? 'uMain * 0.6' : false,
    pockets: p.pockets === 'patch_hip', slash: p.pockets === 'slash', belt: has(it, 'belt'),
  }), uP: [[hem, top, 0, 0]] }];
  pieces.push({ piece: waistbandShell(ctx, it, top), glsl: WAISTBAND_GLSL(top, 0.024, p.closure === 'elastic', false) });
  if (underShorts(ctx, it)) pieces.push({ piece: underShortsShell(ctx, it), glsl: UNDER_GLSL });
  return pieces;
}
export function skirt_pencil(ctx, it) {
  const land = ctx.land, p = it.params, hem = skirtHem(land, p.length || 'knee'), top = land.waistY + 0.005;
  it.hemY = hem; it.topY = top;
  const pc = skirtTubeHelper(ctx, { top, hem, off: it.off + 0.003, flare: -0.006, follow: 0.6, back: 0.006, layer: it.layer });
  const pieces = [{ piece: pc, noDetails: true, extra: genericDetails(it) + skirtPaintHelper(it, top, hem, { zip: p.closure === 'side_zip', vent: p.hem === 'side_split' })
    + `col = mix(col, col * 0.75, (line(abs(vG.x / 0.15), 0.55, 0.012) + line(abs(vG.x / 0.15), 2.6, 0.012)) * step(${f3(top - 0.12)}, vG.y) * smoothstep(${f3(top - 0.12)}, ${f3(top - 0.03)}, vG.y));`, uP: [[hem, top, 0, 0]] }];
  pieces.push({ piece: waistbandShell(ctx, it, top, 0.028), glsl: WAISTBAND_GLSL(top, 0.028, false, false) });
  if (underShorts(ctx, it)) pieces.push({ piece: underShortsShell(ctx, it), glsl: UNDER_GLSL });
  return pieces;
}
// tiers: each tube a little further out and fuller than the one above, its hem ruffled (and scalloped)
function tiersHelper(ctx, it, top, hem, n, o = {}) {
  const pieces = [], span = top - hem, scal = has(it, 'scallop_edge') || it.params.hem === 'scalloped';
  const pt = it.pattern || {}, cs = (pt.type === 'tiers_alternating' ? pt.colours : null) || ['main', 'main', 'main'];
  const ROLE = { main: 'uMain', second: 'uSecond', accent: 'uAccent', trim: 'uTrim' };
  for (let k = 0; k < n; k++) {
    const t0 = top - (k === 0 ? 0 : span * (k / n) + 0.012), t1 = top - span * ((k + 1) / n);
    const pc = skirtTubeHelper(ctx, {
      top: t0, hem: t1, off: it.off + 0.004 + k * 0.007 + (o.offK || 0) * k, flare: (o.flare ?? 0.04) * (1 + k * 0.6) + k * 0.012, follow: 0.4, back: 0.008,
      gathers: 18 + 6 * k, gatherAmp: 0.003 + 0.001 * k, ruffle: 0.003, ruffleN: 30 + 10 * k, scallops: scal ? 18 + 6 * k : 0, scallopDepth: 0.008, layer: it.layer + k * 0.1, segments: 120,
    });
    if (!pc) continue;
    const c = ROLE[cs[k % cs.length]] || 'uMain';
    pieces.push({ piece: pc, noPattern: pt.type === 'tiers_alternating', noDetails: true, extra: `{ vec3 base = ${pt.type === 'tiers_alternating' ? c : 'col'}; col = base;
      float a = vG.x / 0.15;
      col = mix(col, col * 0.86, smoothstep(0.3, 1.0, sin(a * ${18 + 6 * k}.0)) * 0.6);
      col = mix(col, ${scal ? 'uTrim' : 'col * 0.8'}, smoothstep(${f3(t1 + 0.016)}, ${f3(t1 + 0.004)}, vG.y) * ${scal ? '1.0' : '0.0'});
      ${scal ? `col = mix(col, mix(base, uTrim, 0.4), dotsHex(vec2(a * 0.16, vG.y), 0.012, 0.0018) * band(vG.y, ${f3(t1 + 0.018)}, ${f3(t1 + 0.03)}));` : ''}
      col = mix(col, col * 0.62, line(vG.y, ${f3(t0 - 0.003)}, 0.003) * ${k ? '1.0' : '0.0'});
      col = mix(col, col * 0.8, step(0.5, vG.w)); }`, uP: [[t1, t0, 0, 0]] });
  }
  return pieces;
}
export function skirt_tiered(ctx, it) {
  const land = ctx.land, p = it.params, hem = skirtHem(land, p.length || 'above_knee'), top = land.waistY + 0.005;
  it.hemY = hem; it.topY = top;
  const pt = it.pattern || {}, n = pt.tiers || 3;
  const pieces = tiersHelper(ctx, it, top, hem, n);
  pieces.push({ piece: waistbandShell(ctx, it, top), glsl: WAISTBAND_GLSL(top, 0.024, true, false) });
  if (underShorts(ctx, it)) pieces.push({ piece: underShortsShell(ctx, it), glsl: UNDER_GLSL });
  return pieces;
}
export function skirt_maxi(ctx, it) {
  const land = ctx.land, p = it.params, hem = skirtHem(land, p.length || 'ankle'), top = land.waistY + 0.005;
  it.hemY = hem; it.topY = top;
  const pieces = [];
  if (p.hem === 'tiered') {
    // a long smooth yoke and two gathered tiers below the knee
    const k1 = land.kneeY + 0.08, k2 = land.kneeY - 0.17;
    const a = skirtTubeHelper(ctx, { top, hem: k1, off: it.off + 0.004, flare: 0.05, follow: 0.35, gathers: 12, gatherAmp: 0.003, layer: it.layer, segments: 96 });
    const b = skirtTubeHelper(ctx, { top: k1 + 0.012, hem: k2, off: it.off + 0.012, flare: 0.04, follow: 0.3, gathers: 16, gatherAmp: 0.0025, ruffle: 0.002, layer: it.layer + 0.1, segments: 120 });
    const c = skirtTubeHelper(ctx, { top: k2 + 0.012, hem, off: it.off + 0.02, flare: 0.06, follow: 0.25, gathers: 20, gatherAmp: 0.003, ruffle: 0.003, layer: it.layer + 0.2, segments: 144 });
    const tierPaint = (t0, t1) => `col = mix(col, col * 0.88, smoothstep(0.3, 1.0, sin(vG.x / 0.15 * 18.0)) * 0.4); col = mix(col, col * 0.62, line(vG.y, ${f3(t0 - 0.003)}, 0.003)); col = mix(col, col * 0.8, step(0.5, vG.w));`;
    if (a) pieces.push({ piece: a, noDetails: true, noPattern: true, extra: skirtPaintHelper(it, top, k1, {}), uP: [[k1, top, 0, 0]] });
    if (b) pieces.push({ piece: b, noDetails: true, noPattern: true, extra: tierPaint(k1 + 0.012, k2), uP: [[k2, k1, 0, 0]] });
    if (c) pieces.push({ piece: c, noDetails: true, extra: tierPaint(k2 + 0.012, hem), uP: [[hem, k2, 0, 0]] });
  } else {
    const pc = skirtTubeHelper(ctx, { top, hem, off: it.off + 0.004, flare: 0.14, follow: 0.3, gathers: 16, gatherAmp: 0.004, layer: it.layer, segments: 112 });
    pieces.push({ piece: pc, noDetails: true, extra: skirtPaintHelper(it, top, hem, {}), uP: [[hem, top, 0, 0]] });
  }
  pieces.push({ piece: waistbandShell(ctx, it, top), glsl: WAISTBAND_GLSL(top, 0.024, p.closure === 'elastic', false) });
  return pieces;
}
// a skort: shorts with two short scalloped ruffle tiers over them
export function skort(ctx, it) {
  const land = ctx.land, top = land.waistY + 0.005, hem = skirtHem(land, 'thigh') - 0.01;
  const pieces = pantsHelper(ctx, it, { leg: 0.16, ease: 0.003, flare: 0.006, fly: false, front: false, back: false, loops: false, waist: 'elastic', hemStitch: false });
  it.hemY = hem; it.topY = top;
  pieces.push(...tiersHelper(ctx, it, top, hem, 2, { flare: 0.045, offK: 0.004 }));
  pieces.push({ piece: waistbandShell(ctx, it, top), glsl: WAISTBAND_GLSL(top, 0.024, true, false) });
  return pieces;
}
