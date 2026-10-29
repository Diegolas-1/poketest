// Gloves and mittens: formal, work, garden and fingerless gloves, winter mittens and
// an oven mitt.
//
// Gloves are thin wear.js shells over the hands from a little above the wrist, so every
// finger is gloved and bends with its own bones; fingerless gloves are cut just past the
// knuckles (and the thumb half way), work gloves stand off more and flare into a
// gauntlet cuff. Their paint works in the reference hand's own frame (handCoordHelper:
// along the hand from the wrist, across it towards the thumb, out of its back), worked
// out from vCanon, so a knuckle pad, a palm patch or three stitched lines on the back
// land in the same place on every hand. Mittens and the oven mitt are solids round the
// hand (sdf.js, in the Hand bone's frame): a mitt, a thumb on the thumb's bone, a cuff;
// the hand inside is hidden.
import { shell, boneWorld, jointPos } from '../wear.js';
import { fastSolidHelper } from './shoes.js';
import { P, smin, inter, moved } from '../sdf.js';
import { clamp, sstep } from '../vmath.js';
import { patternGLSL } from './patterns.js';

const f3 = (x) => (+x).toFixed(4);
const has = (it, d) => (it.params.details || []).includes(d);

// the reference body's left hand (base.bin's skeleton): wrist, the way along the hand and out of its back
// (the A pose: the hand hangs down and out at 45 degrees, palm in), the thumb's base and tip, the knuckles
const REF = { wrist: [0.549, 0.934, -0.01], along: [0.7071, -0.7071, 0], back: [0.7071, 0.7071, 0], thumb0: [0.553, 0.913, 0.015], thumb1: [0.575, 0.856, 0.062], knuckle: 0.083 };
// GLSL: ha (along from the wrist), hb (out of the back of the hand), hc (across: + towards the thumb), on either hand
export const HAND_GLSL = `float sd = sign(vCanon.x); vec3 hp = vCanon - vec3(${f3(REF.wrist[0])} * sd, ${f3(REF.wrist[1])}, ${f3(REF.wrist[2])});
  float ha = dot(hp, vec3(0.7071 * sd, -0.7071, 0.0)), hb = dot(hp, vec3(0.7071 * sd, 0.7071, 0.0)), hc = hp.z;`;
// the same for a cover function's vertex, and the thumb (distance from its bone line, place along it 0..1)
export function handCoordHelper(V) {
  const sd = Math.sign(V.cx) || 1, x = V.cx - REF.wrist[0] * sd, y = V.cy - REF.wrist[1], z = V.cz - REF.wrist[2];
  const ha = x * 0.7071 * sd - y * 0.7071, hb = x * 0.7071 * sd + y * 0.7071;
  const t0 = REF.thumb0, t1 = REF.thumb1, ax = [(t1[0] - t0[0]) * sd, t1[1] - t0[1], t1[2] - t0[2]], l2 = ax[0] ** 2 + ax[1] ** 2 + ax[2] ** 2;
  const px = V.cx - t0[0] * sd, py = V.cy - t0[1], pz = V.cz - t0[2];
  const tt = (px * ax[0] + py * ax[1] + pz * ax[2]) / l2, tc = clamp(tt);
  const thumbD = Math.hypot(px - ax[0] * tc, py - ax[1] * tc, pz - ax[2] * tc);
  return { ha, hb, hc: z, thumbT: tt, thumbD };
}

// a glove's shell: the hand from s0 up the forearm; cut (fingerless) past the knuckles and half way up the thumb
function gloveShell(ctx, it, o = {}) {
  const s0 = o.s0 ?? 0.92;
  return shell(ctx, {
    cover: (V) => {
      if (V.limb !== 1) return -0.1;
      let g = (V.s - s0) * 0.5;
      if (o.cut) {
        const h = handCoordHelper(V);
        const thumb = h.thumbD < 0.016 && h.thumbT > 0.1;
        g = Math.min(g, thumb ? (0.5 - h.thumbT) * 0.03 : (REF.knuckle + 0.012 - h.ha) * 0.5);
      }
      return g;
    },
    off: (V) => it.off + (o.ease ?? 0.0008) + (o.flare || 0) * sstep(s0 + 0.08, s0, V.s), fill: 1, rim: o.rim ?? 0.0025, layer: it.layer, hideMargin: 0.004,
  });
}
const RIM = 'col = mix(col, col * 0.78, step(0.5, vG.w));';

export function gloves_formal(ctx, it) {
  const piece = gloveShell(ctx, it, { s0: 0.9, ease: 0.0006 });
  if (!piece) return [];
  return [{ piece, noPattern: true, noDetails: true, glsl: `vec3 col = uMain; ${HAND_GLSL}
    // three stitched lines down the back, a button at the wrist
    float bk = step(0.0, hb);
    for (int i = -1; i <= 1; i++) col = mix(col, uSecond, line(hc, float(i) * 0.011, 0.0013) * band(ha, 0.012, 0.07) * bk);
    col = mix(col, uTrim, circle(vec2(ha, hc), vec2(-0.018, 0.0), 0.0045) * bk);
    col = mix(col, uSecond * 0.9, line(ha, -0.01, 0.0015));
    ${RIM} return col;` }];
}
export function gloves_work(ctx, it) {
  const piece = gloveShell(ctx, it, { s0: 0.86, ease: 0.0028, flare: 0.007 });
  if (!piece) return [];
  return [{ piece, noPattern: true, noDetails: true, glsl: `vec3 col = uMain; ${HAND_GLSL}
    // a leather palm, padding over the knuckles, a cuff in the second colour
    col = mix(col, uSecond, step(hb, -0.004) * step(-0.005, ha));
    col = mix(col, uSecond * 0.85, band(ha, ${f3(REF.knuckle - 0.012)}, ${f3(REF.knuckle + 0.006)}) * step(0.004, hb));
    col = mix(col, uAccent, step(ha, -0.006));
    col = mix(col, uTrim, line(ha, -0.006, 0.003));
    col = mix(col, mix(col, uTrim, 0.6), dashes(hc, ha, ${f3(REF.knuckle - 0.014)}, 0.0011, 0.006, 0.0035) * step(0.004, hb));
    ${RIM} return col;` }];
}
export function gloves_garden(ctx, it) {
  const piece = gloveShell(ctx, it, { s0: 0.88, ease: 0.0018, flare: 0.004 });
  if (!piece) return [];
  return [{ piece, noPattern: true, noDetails: true, glsl: `vec3 col = uMain; ${HAND_GLSL}
    vec2 P = vec2(hc + hb * 0.5, ha);
    ${patternGLSL(it.pattern || {})}
    // a rubbered palm and an elastic cuff
    col = mix(col, uTrim, step(hb, -0.006) * step(0.0, ha));
    col = mix(col, uTrim * 0.9, step(ha, -0.008));
    col = mix(col, uTrim * 0.7, stripes(hc + hb, 0.006, 0.002) * step(ha, -0.008));
    ${RIM} return col;` }];
}
export function gloves_fingerless(ctx, it) {
  const piece = gloveShell(ctx, it, { s0: 0.9, ease: 0.0015, cut: true });
  if (!piece) return [];
  return [{ piece, noPattern: true, noDetails: true, glsl: `vec3 col = uMain; ${HAND_GLSL}
    // a padded knuckle bar and a strap round the wrist (second colour), the cut edges bound
    col = mix(col, uSecond, box2(vec2(ha, hc), vec2(${f3(REF.knuckle - 0.016)}, -0.002), vec2(0.011, 0.026), 0.006) * step(0.003, hb));
    col = mix(col, uSecond * 0.75, line(ha, ${f3(REF.knuckle - 0.016)}, 0.0016) * box2(vec2(ha, hc), vec2(${f3(REF.knuckle - 0.016)}, -0.002), vec2(0.011, 0.026), 0.006) * step(0.003, hb));
    float strap = band(ha, -0.012, 0.004);
    col = mix(col, uSecond, strap);
    col = mix(col, uTrim, strap * box2(vec2(ha, hc), vec2(-0.004, 0.0), vec2(0.006, 0.01), 0.002) * step(0.0, hb));
    col = mix(col, uAccent, line(ha, -0.013, 0.0014));
    col = mix(col, uTrim, step(0.5, vG.w));
    return col;` }];
}

// ---------- mitts (solids) ----------
// a mitt round the left hand in the Hand bone's frame (x along the hand, y out of its back, z across to the
// thumb), mirrored onto the right one by building it there too. o: { scale, cuff (length), puff }
function mittTree(ctx, side, o = {}) {
  const S = side > 0 ? 'L' : 'R', L = ctx.A.L, hL = L.handL * (o.scale ?? 1), m = boneWorld(ctx, S + 'Hand');
  const toLocal = (p) => { const d = [p[0] - m[12], p[1] - m[13], p[2] - m[14]]; return [d[0] * m[0] + d[1] * m[1] + d[2] * m[2], d[0] * m[4] + d[1] * m[5] + d[2] * m[6], d[0] * m[8] + d[1] * m[9] + d[2] * m[10]]; };
  const t0 = toLocal(jointPos(ctx, S + 'FingerA1')), t3 = toLocal(jointPos(ctx, S + 'FingerA3'));
  const b1 = toLocal(jointPos(ctx, S + 'FingerB1')), d1 = toLocal(jointPos(ctx, S + 'FingerD1'));
  const puff = (o.puff ?? 0.006) * hL / 0.18, wid = Math.abs(b1[2] - d1[2]) / 2 + 0.011 * hL / 0.18 + puff;
  const zc = (b1[2] + d1[2]) / 2;
  const body = P.ellipsoid({ c: [hL * 0.47, 0, zc], r: [hL * 0.56 + puff, 0.1 * hL + puff, wid] });
  const tdir = [t3[0] - t0[0], t3[1] - t0[1], t3[2] - t0[2]], tl = Math.hypot(...tdir);
  const tip = [t3[0] + tdir[0] / tl * 0.02 * hL / 0.18, t3[1] + tdir[1] / tl * 0.02 * hL / 0.18, t3[2] + tdir[2] / tl * 0.02 * hL / 0.18];
  const thumb = P.rcone({ a: t0, b: tip, ra: 0.016 * hL / 0.18 + puff * 0.7, rb: 0.012 * hL / 0.18 + puff * 0.7 });
  const cuffL = (o.cuff ?? 0.06) * hL / 0.18;
  const wr = 0.028 * hL / 0.18 + puff;
  const cuff = P.rcone({ a: [-cuffL, 0, zc * 0.5], b: [hL * 0.12, 0, zc], ra: wr * (o.flare ?? 1.05), rb: wr * 0.92 });
  const tree = smin(0.012 * hL / 0.18, body, thumb, cuff);
  return { tree: moved(m, inter(tree, P.plane({ p: [-cuffL, 0, 0], n: [-1, 0, 0] }))), hL, cuffL, m, inv: frameInv(m), side, thumbL: [t0, tip] };
}
function frameInv(m) {
  const o = new Float64Array(16);
  o[0] = m[0]; o[1] = m[4]; o[2] = m[8]; o[4] = m[1]; o[5] = m[5]; o[6] = m[9]; o[8] = m[2]; o[9] = m[6]; o[10] = m[10]; o[15] = 1;
  o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]); o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]); o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
  return o;
}
function mittPiece(ctx, side, o) {
  const T = mittTree(ctx, side, o), S = side > 0 ? 'L' : 'R';
  const [t0] = T.thumbL;
  const piece = fastSolidHelper(ctx, T.tree, {
    cell: 0.0042 * Math.max(0.7, T.hL / 0.18), verts: o.verts ?? 2500, frame: T.inv,
    // the thumb follows its own bone, the cuff the forearm, the rest the hand
    weights: (q) => {
      const l = [T.inv[0] * q[0] + T.inv[4] * q[1] + T.inv[8] * q[2] + T.inv[12], T.inv[1] * q[0] + T.inv[5] * q[1] + T.inv[9] * q[2] + T.inv[13], T.inv[2] * q[0] + T.inv[6] * q[1] + T.inv[10] * q[2] + T.inv[14]];
      const th = sstep(0.004, -0.004, Math.hypot(l[0] - (T.thumbL[1][0] + t0[0]) / 2, l[1] - (T.thumbL[1][1] + t0[1]) / 2, l[2] - (T.thumbL[1][2] + t0[2]) / 2) - 0.022 * T.hL / 0.18) * (l[2] > t0[2] * 0.6 ? 1 : 0);
      const fa = sstep(0.0, -0.03 * T.hL / 0.18, l[0]);
      return [[S + 'Hand', 1 - th - fa], [S + 'FingerA1', th], [S + 'ForeArm', fa]];
    },
  });
  // the hand inside is hidden
  if (piece) for (let v = 0; v < ctx.n; v++) if (ctx.body.part[4 * v] === 1 && ctx.body.part[4 * v + 2] * side > 0 && ctx.body.part[4 * v + 1] > 0.95) piece.hide[v] = 1;
  return { piece, T };
}
export function mittens(ctx, it) {
  const pieces = [];
  for (const side of [1, -1]) {
    const { piece, T } = mittPiece(ctx, side, { cuff: 0.06 });
    if (!piece) continue;
    const S = T.hL / 0.18;
    pieces.push({ piece, noPattern: true, noDetails: true, glsl: `vec3 q = vG.xyz; vec3 col = uMain;
      // a ribbed cuff, a snowflake-ish knit band, fur at the top when it has it
      float cuff = step(q.x, ${f3(0.012 * S)});
      col = mix(col, uMain * 0.9, cuff); col = mix(col, uMain * 0.68, cuff * stripes(atan(q.y, q.z - 0.0) * 0.02, 0.006, 0.002));
      col = mix(col, uAccent, band(q.x, ${f3(0.03 * S)}, ${f3(0.042 * S)}) * (0.6 + 0.4 * dotsHex(vec2(atan(q.y, q.z) * 0.03, q.x), 0.006, 0.0018)));
      col = mix(col, uTrim, band(q.x, ${f3(0.024 * S)}, ${f3(0.028 * S)}) + band(q.x, ${f3(0.044 * S)}, ${f3(0.048 * S)}));
      ${has(it, 'fur_trim') ? `col = mix(col, mix(uTrim, vec3(1.0), 0.5) * (0.9 + 0.1 * noise2(q.yz * 900.0)), step(q.x, ${f3(-0.03 * S)}));` : ''}
      return col;` });
    if (has(it, 'fur_trim')) {
      // a fluffy band round the top of the cuff
      const ring = [], R = 0.032 * S;
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; ring.push(P.sphere({ c: [-T.cuffL + 0.006 * S, Math.sin(a) * R, Math.cos(a) * R + 0.002], r: 0.009 * S })); }
      const fur = fastSolidHelper(ctx, moved(T.m, smin(0.004 * S, ...ring)), { cell: 0.0034 * Math.max(0.7, S), verts: 1500, frame: T.inv, weights: () => [[(side > 0 ? 'L' : 'R') + 'ForeArm', 1]] });
      if (fur) pieces.push({ piece: fur, noPattern: true, noDetails: true, glsl: 'return mix(uTrim, vec3(1.0), 0.45) * (0.9 + 0.1 * noise2(vG.yz * 1200.0));' });
    }
  }
  return pieces;
}
// one big quilted mitt on the right hand (a prop for bakers and cooks)
export function oven_mitt(ctx, it) {
  const { piece, T } = mittPiece(ctx, -1, { scale: 1.18, cuff: 0.1, puff: 0.012, flare: 1.35, verts: 4500 });
  if (!piece) return [];
  const S = T.hL / 0.18;
  return [{ piece, noPattern: true, noDetails: true, glsl: `vec3 q = vG.xyz; vec3 col = uMain;
    // a plaid of the colourway, quilted in diamonds, a bound cuff
    vec2 p = vec2(q.x, q.z + q.y * 0.6);
    float a = stripes(p.x, ${f3(0.03 * S)}, ${f3(0.01 * S)}), c = stripes(p.y, ${f3(0.03 * S)}, ${f3(0.01 * S)});
    col = mix(col, uSecond, max(a, c) * 0.55); col = mix(col, uAccent, line(fract(p.x / ${f3(0.03 * S)}), 0.5, 0.06) * 0.7);
    vec2 d = vec2(p.x + p.y, p.x - p.y) / ${f3(0.022 * S)};
    col = mix(col, col * 0.72, (line(fract(d.x), 0.0, 0.08) + line(fract(d.y), 0.0, 0.08)) * 0.6);
    col = mix(col, uTrim, step(q.x, ${f3(-0.075 * S)}));
    col = mix(col, uTrim * 0.8, line(q.x, ${f3(-0.075 * S)}, 0.002));
    return col;` }];
}
