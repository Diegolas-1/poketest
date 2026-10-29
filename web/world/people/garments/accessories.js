// Small things: hair accessories, neckwear, belts, wrist wear, jewellery and pins.
//
// They are made with hats.js' toolkit: direct meshes (tubes and ribbons swept
// along paths found on the body, lathes, slabs) and small fields (bows, flowers,
// knots, stars) meshed on their own. Everything is placed from the person's own
// landmarks and the body's surface (the body field, ctx.f, marched along rays),
// standing off it by what is worn there (outerOffHelper: the outermost trunk
// layer), so the same item fits a toddler and an elder.
//   - hair accessories sit on the hair (hairLift: the hair is not pressed down
//     for them), at the back / side of the head (ribbons, bows, scrunchies,
//     bobbles) or over the temple (clips, flowers); rigid on the Head bone;
//   - neckwear follows the neck's base and the collar line: scarves wrap round
//     it with hanging ends, ties start under the chin and run down the chest's
//     front, bows sit at the throat; weighted like the body under them;
//   - belts are shells (wear.js) cut out of the body round the waistband, with a
//     buckle; braces run up over the shoulders; an obi ties in a big bow at the back;
//   - wrist wear rings the forearm just above the wrist (rigid on the forearm),
//     the Bond Band's stone and a watch's face on the back of the wrist;
//   - pins sit on the left chest (on a hat's band for a feather when a hat is worn).
import { shell, jointPos, fy } from '../wear.js';
import { BONE } from '../rig.js';
import {
  headHelper, MeshHelper, pieceHelper, sdfHelper, surfHelper, exitHelper, frameHelper, inFrameHelper, toFrameHelper, addV, subV, nrm, cross, dotV, lerpV,
  bowHelper, flowerHelper, starHelper, pompomHelper, featherHelper, capsHelper, ellHelper as ellD, boxAroundHelper, hasHelper as has, hairLift, hoopHelper,
  outerOffHelper, rampHelper, starGLSL, orbGLSL, KNIT, fmtHelper as f3, hatPieceHelper,
} from './hats.js';
import { all, below, above } from './common.js';
import { patternGLSL } from './patterns.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const T_ = (ctx) => ctx.A.L.H / 1.7;     // size scale (1 for an adult)

// ---------- placement helpers ----------
// a point on the head's surface (+ lift) along a local direction; returns world point and the outward normal
function onHead(H, d, lift) { d = nrm(d); const r = H.dirR(d) + lift; return { p: H.W([d[0] * r, d[1] * r, d[2] * r]), n: d }; }
// a solid piece from a field, rigid on a bone (or body weights), with a flat paint
function fieldPiece(ctx, f, box, o = {}) {
  const size = Math.max(...box[1].map((v, i) => v - box[0][i]));
  return sdfHelper(ctx, [{ f, box, id: o.id ?? 0 }], { cell: o.cell || clamp(size / 40, 0.0009, 0.003), verts: o.verts || 2500, bone: o.bone, weights: o.weights, gco: o.gco });
}
const local = (c, ax) => (p, id) => { const l = toFrameHelper(c, ax, p); return [l[0], l[1], l[2], id]; };

// the neck: its axis at a height, and the point on the body (+ off) round it at angle a (0 front, + to the left)
function neckOf(ctx) {
  if (ctx._neck) return ctx._neck;
  const L = ctx.A.L, H = L.H, st = L.stoop || 0, sh = L.headShift || [0, 0, 0];
  const a = [0, L.shY - 0.02 * H, -0.014 * H + 0.03 * H * st], b = [0, L.chinY + 0.2 * L.hh + sh[1], -0.05 * L.hh + sh[2]];
  const axis = (y) => { const t = (y - a[1]) / (b[1] - a[1]); return lerpV(a, b, t); };
  // from the neck's axis outwards to the surface (+ off): the first way out, so the shoulders are not hit
  const at = (y, ang, off, tilt = 0) => {
    const c = axis(y), d = nrm([Math.sin(ang), tilt, Math.cos(ang)]), f = ctx.f;
    let t = 0;
    for (let i = 0; i < 200; i++) { const q = addV(c, d, t), v = f(q[0], q[1], q[2]) - off; if (v >= 0) break; t += Math.max(-v * 0.9, 3e-4); }
    return addV(c, d, t);
  };
  // where the neck meets the shoulders / chest at angle a: going down the neck until it widens
  const nr = L.neckR;
  // the base's height per angle (16 around, found once per person, then interpolated)
  const NA = 16, baseY = [];
  for (let k = 0; k < NA; k++) {
    const a = (k / NA) * Math.PI * 2;
    let y = L.chinY + 0.005 * H / 1.7, prev = null, rmin = Infinity;
    for (let i = 0; i < 60; i++) {
      const p = at(y, a, 0), c = axis(y), r = Math.hypot(p[0] - c[0], p[2] - c[2]);
      rmin = Math.min(rmin, r);
      if ((prev !== null && r > rmin * 1.3 + 0.003 * H / 1.7) || y < L.shY - 0.03 * H) break;
      prev = y; y -= 0.004 * H / 1.7;
    }
    baseY.push(Math.max(prev ?? y, L.shY + 0.012 * H / 1.7));
  }
  const base = (a, off, up = 0) => {
    const u = ((a / (Math.PI * 2)) * NA % NA + NA) % NA, i = Math.floor(u), t = u - i;
    const q = at(baseY[i] * (1 - t) + baseY[(i + 1) % NA] * t + up, a, 0);
    return addV(q, bodyN(ctx, q), off);
  };
  ctx._neck = { axis, at, base, L };
  return ctx._neck;
}
// a ring round the neck's base (sitting on the collar / the top of the shoulders): n points, y at the front and back
function collarRing(ctx, up, off, n = 36, drop = 0) {
  const N = neckOf(ctx), pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a);
    let p = N.base(a, off, up);
    if (drop) { const y = p[1] - drop * Math.max(c, 0) ** 2, q = exitHelper(ctx, [0, y, -0.01], nrm([p[0], 0, p[2] + 0.01]), 0); p = addV(q, bodyN(ctx, q), off); }
    pts.push(p);
  }
  return pts;
}
// a path down the chest's front from y0 to y1 at x (world), off the body
function chestPath(ctx, x0, x1, y0, y1, off, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push(onBody(ctx, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, off)); }
  return pts;
}
// the body's front / back surface (+ off along its normal) from inside: dir 1 front, -1 back
function onBody(ctx, x, y, off, dir = 1) { const q = exitHelper(ctx, [x, y, -0.02 * dir], [0, 0, dir], 0); return addV(q, bodyN(ctx, q), off); }
// the body's outward normal at a point (the field's gradient)
function bodyN(ctx, p) { const e = 1e-3, f = ctx.f; return nrm([f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]), f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]), f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e)]); }
// a forearm frame near the wrist: centre, axis (towards the hand), dorsal (the back of the wrist), radius there
function wristOf(ctx, side = 1, at = 0.86) {
  const S = side > 0 ? 'L' : 'R', e = jointPos(ctx, S + 'ForeArm'), w = jointPos(ctx, S + 'Hand');
  const c = lerpV(e, w, at), ax = nrm(subV(w, e));
  // the back of the wrist: the T pose's up, carried into the A pose by the forearm's turn
  const m = ctx.A.ad[BONE[S + 'ForeArm']];
  const dors = nrm([m[4], m[5], m[6]]);
  const u = nrm(subV(dors, ax.map((v) => v * dotV(dors, ax)))), v = cross(ax, u);
  let r = 0;
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, d = addV(u.map((x) => x * Math.cos(a)), v, Math.sin(a)); const p = exitHelper(ctx, c, d, 0, 0.1); r = Math.max(r, Math.hypot(...subV(p, c))); }
  return { c, ax, u, v, r, bone: S + 'ForeArm', side, e, w };
}
// a ring round the forearm: profile [[r, h]] (r out from the arm's surface, h along the arm, m) -> lathe in the wrist frame
function wristRing(m, W, prof, o = {}) {
  const frame = [W.u, W.ax, cross(W.u, W.ax)];
  m.lathe(W.c, frame, prof.map(([r, h]) => [W.r + r, h]), { seg: o.seg || 28, g: o.g || ((l, r, h, a) => [a, h, r, o.id ?? 0]) });
  return m;
}

// ---------- hair accessories ----------
// ribbon bow: in the hair at the back of the head (slot hair_acc) or at the collar (neckwear)
export function ribbon_bow(ctx, it) {
  if (it.item.slot === 'neckwear') return neckBow(ctx, it, { s: 0.085, tails: 1.1 });
  const H = headHelper(ctx), lift = hairLift(H) * 1.1, s = H.hw * 0.6;
  const { p, n } = onHead(H, [0.38, 0.55, -0.75], lift);
  const ax = frameHelper(n, [0, 1, 0]);
  const piece = fieldPiece(ctx, bowHelper(addV(p, n, s * 0.08), ax, s, { tails: 0.9 }), boxAroundHelper(p, s * 0.9), { bone: 'Head', gco: local(p, ax) });
  return [{ piece, noPattern: true, glsl: `vec3 col = uMain; col *= 0.94 + 0.06 * stripes(vG.y, 0.006, 0.003); col = mix(col, uSecond, step(abs(vG.x), ${f3(s * 0.1)}) * 0.6); return col;` }];
}
// star hair clips over the temple (two, overlapping)
export function hair_clip(ctx, it) {
  const H = headHelper(ctx), lift = hairLift(H) * 0.9, T = T_(ctx), out = [];
  const m = new MeshHelper();
  for (const [k, d] of [[0, [0.72, 0.5, 0.42]], [1, [0.8, 0.3, 0.45]]]) {
    const { p, n } = onHead(H, d, lift), r = H.hh * (k ? 0.085 : 0.1);
    const ax = frameHelper(n, [0, 1, 0]);
    m.field(starHelper(addV(p, n, 0.003 * T), n, r, 0.006 * T), boxAroundHelper(p, r * 1.4), Math.max(0.0008, r / 22), (q) => { const l = toFrameHelper(p, ax, q); return [l[0], l[1], l[2], k]; });
  }
  out.push({ piece: pieceHelper(ctx, m, { bone: 'Head' }), noPattern: true, glsl: `vec3 col = uMain; float k = floor(vG.w + 0.5); if (k > 0.5) col = uSecond; col = mix(col, vec3(1.0), step(0.0025, vG.z) * smoothstep(0.004, 0.0, length(vG.xy + vec2(0.006, -0.006))) * 0.7); return col;` });
  return out;
}
// a scrunchie round a ponytail at the back of the head
export function scrunchie(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, T = T_(ctx);
  const { p, n } = onHead(H, [0, 0.25, -1], hairLift(H) * 0.9);
  const ax = frameHelper([0, -0.35, -0.95], [0, 0, 1]), R = hh * 0.08, r = hh * 0.042;
  const c = addV(p, n, r * 0.6);
  const f = (X, Y, Z) => { const [x, y, z] = toFrameHelper(c, ax, [X, Y, Z]); const a = Math.atan2(y, x), rr = Math.hypot(x, y) - R; return (Math.hypot(rr, z) - r * (1 + 0.18 * Math.sin(a * 11) * Math.cos(z / r * 2))) * 0.8; };
  const piece = fieldPiece(ctx, f, boxAroundHelper(c, R + r * 1.5), { bone: 'Head', gco: local(c, ax) });
  return [{ piece, noPattern: true, glsl: `vec3 col = uMain; float a = atan(vG.y, vG.x); col *= 0.85 + 0.15 * (0.5 + 0.5 * cos(a * 22.0)); return col;` }];
}
// a flower pinned over the ear (hair) or on the lapel (pin slot uses boutonniere)
export function flower_pin(ctx, it) {
  const H = headHelper(ctx), T = T_(ctx);
  const { p, n } = onHead(H, [0.95, 0.4, 0.05], hairLift(H));
  const r = H.hh * 0.13, ax = frameHelper(n, [0, 1, 0]), m = new MeshHelper();
  m.field(flowerHelper(addV(p, n, 0.004 * T), n, r, { petals: 5 }), boxAroundHelper(p, r * 1.5), Math.max(0.001, r / 22), (q) => { const l = toFrameHelper(p, ax, q); return [l[0], l[1], l[2], 0]; });
  // two leaves
  for (const s of [1, -1]) { const a = addV(p, ax[0], s * r * 0.7), b = addV(addV(a, ax[0], s * r * 0.6), ax[1], -r * 0.5); m.field((x, y, z) => capsHelper(x, y, z, a, b, r * 0.18, r * 0.06), boxAroundHelper(lerpV(a, b, 0.5), r), Math.max(0.001, r / 22), (q) => { const l = toFrameHelper(p, ax, q); return [l[0], l[1], l[2], 1]; }); }
  return [{ piece: pieceHelper(ctx, m, { bone: 'Head' }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); vec3 col = mix(uSecond, uMain, smoothstep(0.0, ${f3(r * 0.7)}, length(vG.xy)));
    col = mix(col, uAccent, circle(vG.xy, vec2(0.0), ${f3(r * 0.22)}));
    if (id > 0.5) col = uTrim;
    return col;` }];
}
// bobbles: two hair ties (two round beads each) at the sides of the head, behind the ears
export function hair_tie(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, m = new MeshHelper();
  for (const s of [1, -1]) {
    const { p, n } = onHead(H, [s * 0.85, 0.05, -0.5], hairLift(H) * 1.1);
    const ax = frameHelper(n, [0, 1, 0]), r = hh * 0.048;
    for (const k of [1, -1]) { const c = addV(addV(p, n, r * 0.7), ax[1], k * r * 1.05); m.field((x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r, boxAroundHelper(c, r * 1.3), r / 9, (q) => { const l = toFrameHelper(c, ax, q); return [l[0], l[1], l[2], 0]; }); }
    m.sweep([addV(p, ax[1], r * 0.6), addV(addV(p, n, r * 0.7), [0, 0, 0]), addV(p, ax[1], -r * 0.6)], { r: r * 0.25, seg: 6, g: () => [0, 0, 0, 1] });
  }
  return [{ piece: pieceHelper(ctx, m, { bone: 'Head' }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); vec3 col = uMain; col = mix(col, vec3(1.0), smoothstep(0.004, 0.0, length(vG.xy - vec2(-0.006, 0.006))) * step(0.0, vG.z) * 0.8); if (id > 0.5) col = uTrim; return col;` }];
}
// a barrette: a slim bar clip at the side / back of the head
export function barrette(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, T = T_(ctx);
  const { p, n } = onHead(H, [0.62, 0.45, -0.55], hairLift(H) * 0.95);
  const ax = frameHelper(n, [0.4, 1, 0.6]), L = hh * 0.13, w = hh * 0.022;
  const c = addV(p, n, 0.004 * T);
  const f = (X, Y, Z) => { const [x, y, z] = toFrameHelper(c, ax, [X, Y, Z]); const bend = z + (x / L) ** 2 * 0.004 * T; return Math.hypot(Math.max(Math.abs(x) - L + w, 0), Math.max(Math.abs(y) - w * 0.3, 0)) - w * 0.7 + Math.max(Math.abs(bend) - 0.0025 * T, 0); };
  const piece = fieldPiece(ctx, f, boxAroundHelper(c, L * 1.2), { bone: 'Head', gco: local(c, ax), cell: Math.max(0.0008, w / 6) });
  return [{ piece, noPattern: true, glsl: `vec3 col = uMain; col = mix(col, uAccent, circle(vG.xy, vec2(0.0), ${f3(w * 0.55)}) + circle(vG.xy, vec2(${f3(L * 0.55)}, 0.0), ${f3(w * 0.35)}) + circle(vG.xy, vec2(${f3(-L * 0.55)}, 0.0), ${f3(w * 0.35)})); col = mix(col, vec3(1.0), line(vG.y, ${f3(w * 0.35)}, ${f3(w * 0.2)}) * 0.5); return col;` }];
}
// a headscarf over the hair, knotted at the top front (two little tails)
export function headscarf(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, T = T_(ctx), lift = hairLift(H);
  const yF = H.eye + hh * 0.36, yB = H.eye - hh * 0.3;
  const zF = H.zF(yF), zB = H.zB(yB), slope = (yF - yB) / (zF - zB);
  const fl = (x, y, z) => H.f(x, y, z) - lift * (0.75 + 0.35 * clamp((y + hh * 0.1) / (hh * 0.5)));
  const parts = [{ kind: 'radial', fl, lo: (x, y, z) => yB + (z - zB) * slope - y, rim: 0.004 * T, id: 0 }];
  const out = [];
  // the knot and tails: at the top front
  const { p, n } = onHead(H, [0.15, 0.85, 0.5], lift * 1.15);
  const ax = frameHelper(n, [0, 0, 1]), s = H.hw * 0.42;
  const knot = { f: bowHelper(p, ax, s, { tails: 0.4, loopH: 0.3, puff: 0.2 }), box: boxAroundHelper(p, s), id: 1 };
  const glsl = `vec2 P = vG.xy; float id = floor(vG.w + 0.5); vec3 col = uMain; ${patternGLSL(it.pattern || {})}
    col = mix(col, uSecond, dotsHex(P, 0.03, 0.005) * 0.8);
    col = mix(col, uSecond, step(id, 0.5) * step(vG.y, uP[0].x + 0.012) * 0.0);
    if (id > 0.5) col = uMain * 0.95;
    return col;`;
  out.push(...hatPiece(ctx, it, H, [...parts, knot], glsl));
  return out;
}
// the hat toolkit's piece maker (radial + field parts on the Head bone)
const hatPiece = (ctx, it, H, parts, glsl) => hatPieceHelper(ctx, it, H, parts, glsl, { band: H.eye });
// a little tiara on the hair: a band over the top with points and a star
export function tiara(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, T = T_(ctx);
  const pts = hoopHelper(H, hairLift(H) * 1.05, 0.35, 0.5, 20, 0.9);
  const m = new MeshHelper();
  m.sweep(pts, { prof: 'flat', th: () => [hh * 0.024, 0.003 * T], up: (i, p) => nrm(subV(p, H.O)), seg: 8, g: () => [0, 0, 0, 0] });
  // points rising from the band, the middle one a star
  const mid = pts[10], up = nrm(subV(mid, H.O)), fwd = nrm(cross(nrm(subV(pts[11], pts[9])), up));
  for (const k of [-6, -3, 3, 6]) {
    const b = pts[10 + k], u = nrm(subV(b, H.O)), h = hh * (Math.abs(k) > 4 ? 0.07 : 0.1);
    m.field((x, y, z) => capsHelper(x, y, z, b, addV(b, u, h), hh * 0.012, hh * 0.004), boxAroundHelper(b, h * 1.3), 0.001 * T, () => [0, 0, 0, 1]);
    const tip = addV(b, u, h); m.field((x, y, z) => Math.hypot(x - tip[0], y - tip[1], z - tip[2]) - hh * 0.011, boxAroundHelper(tip, hh * 0.02), 0.0008 * T, () => [0, 0, 0, 2]);
  }
  const sc = addV(mid, up, hh * 0.1);
  m.field(starHelper(sc, fwd, hh * 0.09, 0.006 * T, up), boxAroundHelper(sc, hh * 0.09), 0.0009 * T, (q) => { const l = toFrameHelper(sc, frameHelper(fwd, up), q); return [l[0], l[1], l[2], 3]; });
  return [{ piece: pieceHelper(ctx, m, { bone: 'Head' }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); vec3 col = uMain; if (id > 1.5 && id < 2.5) col = uAccent; if (id > 2.5) { col = uMain; col = mix(col, uAccent, circle(vG.xy, vec2(0.0), ${f3(hh * 0.02)})); col = mix(col, vec3(1.0), smoothstep(0.004, 0.0, length(vG.xy - vec2(-0.008, 0.01))) * 0.7); } return col;` }];
}
// an oversized rose on the side of the head, with leaves
export function flower_headpiece(ctx, it) {
  const H = headHelper(ctx), hh = H.hh, T = T_(ctx);
  const { p, n } = onHead(H, [0.85, 0.5, 0.15], hairLift(H) * 1.1);
  const r = H.hw * 0.36, ax = frameHelper(n, [0, 1, 0]), m = new MeshHelper();
  const c = addV(p, n, r * 0.05);
  m.field(flowerHelper(c, n, r, { rose: true }), boxAroundHelper(c, r * 1.2), Math.max(0.0012, r / 26), (q) => { const l = toFrameHelper(c, ax, q); return [l[0], l[1], l[2], 0]; });
  for (const [s, k] of [[1, 0.2], [-1, -0.5]]) { const a = addV(addV(c, ax[0], s * r * 0.7), ax[1], k * r), b = addV(addV(a, ax[0], s * r * 0.6), ax[1], k * r * 0.6); m.field((x, y, z) => { const d = capsHelper(x, y, z, a, b, r * 0.22, r * 0.05); return Math.max(d, Math.abs(dotV(subV([x, y, z], a), n)) - 0.003 * T); }, boxAroundHelper(lerpV(a, b, 0.5), r), Math.max(0.001, r / 26), () => [0, 0, 0, 1]); }
  return [{ piece: pieceHelper(ctx, m, { bone: 'Head' }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); float rr = length(vG.xy); vec3 col = mix(uSecond, uMain, smoothstep(${f3(r * 0.1)}, ${f3(r * 0.8)}, rr) * (0.75 + 0.25 * sin(atan(vG.y, vG.x) * 2.0 + rr * 300.0)));
    if (id > 0.5) col = vec3(0.2, 0.42, 0.2);
    return col;` }];
}

// ---------- neckwear ----------
// the collar line heights (world): where a crew neck sits at the front and the back
function collarY(ctx) { const L = ctx.A.L; return { yF: L.shY + 0.026 * L.H / 1.7 * 1.0, yB: L.shY + 0.05 * L.H / 1.7 }; }
const neckOff = (it, extra = 0) => outerOffHelper(it) * 0.7 + 0.004 + extra;

// a scarf: two chunky wraps round the neck, two ends hanging down the front (one longer), tassels
export function scarf(ctx, it) {
  const L = ctx.A.L, T = T_(ctx), { yF, yB } = collarY(ctx);
  const th = 0.012 * T, w = 0.032 * T, off = neckOff(it, th);
  const m = new MeshHelper();
  const ring1 = collarRing(ctx, 0.004 * T, off, 40), ring2 = collarRing(ctx, 0.03 * T, off * 0.8, 40);
  for (const [k, ring] of [[0, ring1], [1, ring2]]) {
    const c = ring.reduce((a, p) => addV(a, p, 1 / ring.length), [0, 0, 0]);
    m.sweep([...ring, ring[0]], { prof: 'flat', th: () => [w, th], up: (i, p) => nrm([p[0] - c[0], 0, p[2] - c[2]]), seg: 10, g: (t, a) => [t * 0.5, a, k, 0] });
  }
  // the ends: from the front left of the wrap down the chest
  const len = { small: 0.14, medium: 0.22, large: 0.3 }[it.params.length] ?? 0.22;
  for (const [k, x0, x1, l] of [[0, 0.05, 0.07, len], [1, 0.02, 0.0, len * 0.8]]) {
    const y0 = ring1[0][1] - 0.004 * T, path = chestPath(ctx, x0 * T, x1 * T, y0, y0 - l * L.H, outerOffHelper(it) + th * (2.2 - k), 10);
    m.sweep(path, { prof: 'flat', th: (t) => [w * 1.1, th * 0.8], up: (i, p) => bodyN(ctx, p), seg: 8, g: (t, a, S) => [S, Math.cos(a), 2 + k, t] });
  }
  const tassel = has(it, 'tassel');
  const glsl = `vec2 P = vec2(vG.y * 0.01, vG.x); vec3 col = uMain;
    ${patternGLSL({ ...(it.pattern || {}), placement: 'all' }).replace(/P\.y/g, 'vG.x').replace(/P\.x/g, 'vG.y * 0.01')}
    ${has(it, 'rib_knit') ? 'col *= 0.9 + 0.1 * stripes(vG.y, 0.6, 0.3);' : ''}
    ${tassel ? 'col = mix(col, col * 0.7, step(1.5, vG.z) * step(0.93, vG.w) * stripes(vG.y, 0.5, 0.25));' : ''}
    return col;`;
  return [{ piece: pieceHelper(ctx, m, { weights: neckWeights(ctx), double: false }), glsl, noPattern: true }];
}
// neck and chest weights by height: the head's below the chin -> the neck -> Spine3 -> Spine2
function neckWeights(ctx) {
  const L = ctx.A.L;
  return (p) => {
    const y = p[1];
    if (y > L.chinY - 0.01) return [['Neck', 0.6], ['Spine3', 0.4]];
    if (y > L.shY) { const t = clamp((y - L.shY) / (L.chinY - L.shY)); return [['Neck', t * 0.6], ['Spine3', 1 - t * 0.6]]; }
    if (y > L.chestY) return [['Spine3', 1]];
    const t = clamp((L.chestY - y) / 0.15); return [['Spine3', 1 - t * 0.6], ['Spine2', t * 0.6]];
  };
}
// a rolled neckerchief tied at the front: a ring, a knot, two small points
export function neckerchief(ctx, it) { return kerchief(ctx, it, { bib: false }); }
// a bandana round the neck: a rolled band with a triangle hanging on the chest
export function bandana(ctx, it) { return kerchief(ctx, it, { bib: true }); }
function kerchief(ctx, it, o) {
  const L = ctx.A.L, T = T_(ctx), { yF, yB } = collarY(ctx), th = 0.007 * T, off = neckOff(it, th);
  const m = new MeshHelper(), ring = collarRing(ctx, 0.012 * T, off, 36);
  const c = ring.reduce((a, p) => addV(a, p, 1 / ring.length), [0, 0, 0]);
  m.sweep([...ring, ring[0]], { r: 0.008 * T, seg: 8, g: (t, a) => [t, a, 0, 0] });
  const front = ring[0];
  if (o.bib) {
    // the triangle: wide at the neck, a point on the chest
    const path = chestPath(ctx, 0, 0, front[1] - 0.004 * T, front[1] - 0.13 * T, outerOffHelper(it) + 0.006 * T, 8);
    m.sweep(path, { prof: 'flat', th: (t) => [Math.max(0.0015, 0.07 * T * (1 - t)), 0.002 * T], up: (i, p) => bodyN(ctx, p), seg: 8, g: (t, a, S) => [S, Math.cos(a), 1, t] });
  } else {
    // the knot and two short points
    const kc = addV(front, [0, -0.004 * T, 0.004 * T]);
    m.field((x, y, z) => ellD(x - kc[0], y - kc[1], z - kc[2], 0.014 * T, 0.012 * T, 0.009 * T), boxAroundHelper(kc, 0.025 * T), 0.0012 * T, () => [0, 0, 0, 2]);
    for (const s of [1, -1]) { const path = chestPath(ctx, s * 0.004 * T, s * 0.03 * T, kc[1] - 0.006 * T, kc[1] - 0.055 * T, outerOffHelper(it) + 0.008 * T, 5); m.sweep(path, { prof: 'flat', th: (t) => [Math.max(0.001, 0.018 * T * (1 - t * 0.9)), 0.002 * T], up: (i, p) => bodyN(ctx, p), seg: 8, g: (t, a, S) => [S, Math.cos(a), 1, t] }); }
  }
  const glsl = `vec2 P = vec2(vCanon.x, vCanon.y); vec3 col = uMain; ${patternGLSL(it.pattern || {})}
    ${o.bib ? 'col = mix(col, uSecond, (line(vG.y, 0.8, 0.15) + line(vG.y, -0.8, 0.15)) * step(0.5, vG.z));' : ''}
    return col;`;
  void c;
  return [{ piece: pieceHelper(ctx, m, { weights: neckWeights(ctx) }), glsl, noPattern: true }];
}
// a necktie: a knot under the chin (at the collar), the blade down the chest to the waistband
export function necktie(ctx, it) {
  const L = ctx.A.L, T = T_(ctx), { yF } = collarY(ctx);
  const off = 0.0025 + 0.0042 * 2 + 0.005;   // over the shirt (under a jacket)
  const m = new MeshHelper();
  const kc = ctx.ky = onBody(ctx, 0, yF + 0.006 * T, off + 0.006 * T);
  const kw = 0.017 * T;
  m.field((x, y, z) => { const dy = y - kc[1]; return Math.max(ellD(x - kc[0], dy, z - kc[2], kw * (1 + Math.max(dy, 0) * 25 / T), 0.017 * T, 0.009 * T), -dy - 0.016 * T) * 0.9; }, boxAroundHelper(kc, 0.035 * T), 0.0011 * T, (p) => [p[0], p[1] - kc[1], 0, 1]);
  const yEnd = L.waistY + 0.01 * T, w0 = 0.013 * T, w1 = 0.034 * T * (L.age < 12 ? 0.8 : 1);
  const path = chestPath(ctx, 0, 0, kc[1] - 0.012 * T, yEnd, off, 14);
  m.sweep(path, { prof: 'flat', th: (t) => [t > 0.94 ? w1 * Math.max(0.05, (1 - t) / 0.06) : w0 + (w1 - w0) * Math.pow(t, 0.8), 0.0022 * T], up: (i, p) => bodyN(ctx, p), seg: 8, g: (t, a, S, i) => [path[i][0] * 0 + Math.cos(a), path[i][1], 0, 0] });
  const angled = it.pattern && it.pattern.type === 'stripes_h' && it.pattern.angle_deg;
  const glsl = `float id = floor(vG.w + 0.5); vec3 col = uMain;
    ${angled ? `col = mix(col, uSecond, stripes(vCanon.y + vCanon.x * 1.0, 0.024, 0.008));` : patternGLSL(it.pattern || {}).replace(/P\b/g, 'vec2(vCanon.x, vCanon.y)')}
    if (id > 0.5) col *= 0.92;
    return col;`;
  return [{ piece: pieceHelper(ctx, m, { weights: neckWeights(ctx) }), glsl, noPattern: true }];
}
// a bow at the throat: bow_tie (crisp, small), ribbon bow at the collar (bigger, with tails)
function neckBow(ctx, it, o) {
  const L = ctx.A.L, T = T_(ctx), { yF } = collarY(ctx);
  const off = (it.has('outer') ? outerOffHelper(it) - 0.006 : 0.0025 + 0.0042 * 2 + 0.006);
  const c = onBody(ctx, 0, yF + 0.004 * T, off + 0.009 * T);
  const n = bodyN(ctx, c), ax = frameHelper([0, n[1] * 0.3, 1], [0, 1, 0]), s = o.s * L.H * (L.age < 10 ? 1.15 : 1);
  const piece = fieldPiece(ctx, bowHelper(c, ax, s, { tails: o.tails ?? 0, loopH: o.loopH ?? 0.32, puff: o.puff ?? 0.14 }), boxAroundHelper(c, s * 1.1), { weights: neckWeights(ctx), gco: local(c, ax) });
  return [{ piece, noPattern: true, glsl: `vec3 col = uMain; col = mix(col, uSecond, step(abs(vG.x), ${f3(s * 0.11)}) * 0.5); col *= 0.95 + 0.05 * stripes(vG.y, 0.006, 0.003); return col;` }];
}
export const bow_tie = (ctx, it) => neckBow(ctx, it, { s: 0.055, tails: 0, loopH: 0.3, puff: 0.12 });
// a cravat: soft folds puffed at the throat, tucked into the shirt, a pearl pin
export function cravat(ctx, it) {
  const L = ctx.A.L, T = T_(ctx), { yF } = collarY(ctx), off = 0.0025 + 0.0042 * 2 + 0.006;
  const c = onBody(ctx, 0, yF - 0.01 * T, off), n = bodyN(ctx, c);
  const folds = [[0, 0.012, 0.03, 0.022, 0.013], [0.004, -0.018, 0.034, 0.026, 0.016], [-0.003, -0.045, 0.03, 0.026, 0.014]].map(([x, y, rx, ry, rz]) => [addV(c, [x * T, y * T, 0]), rx * T, ry * T, rz * T]);
  const f = (x, y, z) => { let d = Infinity; for (const [p, rx, ry, rz] of folds) d = Math.min(d, ellD(x - p[0], y - p[1], z - p[2] - rz * 0.4, rx, ry, rz)); return d; };
  const m = new MeshHelper();
  m.field(f, [[c[0] - 0.05 * T, c[1] - 0.08 * T, c[2] - 0.03 * T], [c[0] + 0.05 * T, c[1] + 0.04 * T, c[2] + 0.04 * T]], 0.0013 * T, (p) => [p[0], p[1] - c[1], 0, 0]);
  if (has(it, 'pearls')) { const pc = addV(c, [0, -0.012 * T, 0.03 * T]); m.field((x, y, z) => Math.hypot(x - pc[0], y - pc[1], z - pc[2]) - 0.0055 * T, boxAroundHelper(pc, 0.01 * T), 0.0007 * T, () => [0, 0, 0, 1]); }
  void n;
  return [{ piece: pieceHelper(ctx, m, { weights: neckWeights(ctx) }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); vec3 col = uMain; col *= 0.9 + 0.1 * (0.5 + 0.5 * sin(vG.x * 500.0 + vG.y * 200.0)); col = mix(col, uSecond, dotsHex(vG.xy, 0.012, 0.0018) * 0.5); if (id > 0.5) col = vec3(0.96, 0.94, 0.9); return col;` }];
}
// a sailor tie: a soft knot low on the chest (in the sailor collar's V), two tails
export function sailor_tie(ctx, it) {
  const L = ctx.A.L, T = T_(ctx), off = outerOffHelper(it) + 0.004;
  const y = L.shY - 0.065 * L.H;
  const c = onBody(ctx, 0, y, off + 0.008 * T), n = bodyN(ctx, c), ax = frameHelper(n, [0, 1, 0]);
  const s = 0.075 * L.H;
  const m = new MeshHelper();
  m.field(bowHelper(c, ax, s, { tails: 0, loopH: 0.22, puff: 0.12 }), boxAroundHelper(c, s), Math.max(0.001, s / 30), (p) => { const l = toFrameHelper(c, ax, p); return [l[0], l[1], l[2], 0]; });
  for (const sd of [1, -1]) { const path = chestPath(ctx, sd * 0.006 * T, sd * 0.03 * T, y - 0.01 * T, y - 0.11 * T, off + 0.002 * T, 6); m.sweep(path, { prof: 'flat', th: (t) => [0.016 * T * (1 + t * 0.6), 0.002 * T], up: (i, p) => bodyN(ctx, p), seg: 8, g: (t) => [0, -t, 0, 1] }); }
  return [{ piece: pieceHelper(ctx, m, { weights: neckWeights(ctx) }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); vec3 col = uMain; if (id > 0.5) col = mix(uMain, uSecond, 0.15); return col;` }];
}
// a lanyard: a cord round the back of the neck, down the front in a V to an ID card
export function lanyard(ctx, it) {
  const L = ctx.A.L, T = T_(ctx), { yF, yB } = collarY(ctx), off = outerOffHelper(it) + 0.003;
  const m = new MeshHelper();
  const ring = collarRing(ctx, 0.0, off, 40);
  // the back half of the ring, then down the chest to the card
  const back = ring.filter((p, i) => { const a = (i / 40) * Math.PI * 2; return Math.cos(a) < 0.25; });
  const i0 = ring.findIndex((p, i) => Math.cos((i / 40) * Math.PI * 2) < 0.25);
  const ordered = [...ring.slice(i0), ...ring.slice(0, i0)].filter((p, i, arr) => back.includes(p));
  const cardY = L.chestY - 0.02 * T;
  const left = chestPath(ctx, ordered[0][0], 0.008 * T, ordered[0][1], cardY + 0.05 * T, off, 6), right = chestPath(ctx, ordered[ordered.length - 1][0], -0.008 * T, ordered[ordered.length - 1][1], cardY + 0.05 * T, off, 6);
  const path = [...right.reverse(), ...ordered.slice().reverse(), ...left];
  const g = (t) => [t, 0, 0, 0];
  m.sweep(path.length > 3 ? dedupe(path) : path, { prof: 'flat', th: () => [0.007 * T, 0.0012 * T], up: (i, p) => bodyN(ctx, p), seg: 6, g });
  // the card (a slab facing out), its clip
  const cc = onBody(ctx, 0, cardY, off + 0.004 * T), n = bodyN(ctx, cc), ax = frameHelper(n, [0, 1, 0]);
  const cw = 0.03 * T, ch = 0.042 * T;
  m.slab(cc, ax, [[-cw, -ch], [cw, -ch], [cw, ch], [-cw, ch]], 0.0025 * T, { g: (l) => [l[0], l[1], l[2], 1] });
  return [{ piece: pieceHelper(ctx, m, { weights: neckWeights(ctx) }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); vec3 col = uMain;
    col = mix(col, uSecond, step(id, 0.5) * line(fract(vG.x * 18.0), 0.5, 0.25) * 0.0);
    if (id > 0.5) { vec2 q = vG.xy; col = uSecond; col = mix(col, uMain, step(${f3(ch * 0.55)}, q.y)); col = mix(col, uAccent, box2(q, vec2(${f3(-cw * 0.45)}, ${f3(-ch * 0.05)}), vec2(${f3(cw * 0.32)}, ${f3(ch * 0.3)}), 0.002) * 0.6);
      col = mix(col, uAccent, (line(q.y, ${f3(-ch * 0.0)}, 0.0016) + line(q.y, ${f3(-ch * 0.25)}, 0.0016)) * step(${f3(cw * 0.0)}, q.x) * step(q.x, ${f3(cw * 0.8)}));
      col = mix(col, uTrim, box2(q, vec2(0.0, ${f3(ch * 1.05)}), vec2(${f3(cw * 0.25)}, ${f3(ch * 0.12)}), 0.002)); }
    return col;` }];
}
const dedupe = (pts) => pts.filter((p, i) => i === 0 || Math.hypot(...subV(p, pts[i - 1])) > 1e-4);
// a string of pearls resting round the neck's base, dipping in front
export function necklace(ctx, it) {
  const T = T_(ctx), { yF, yB } = collarY(ctx), off = outerOffHelper(it) * 0.6 + 0.004;
  const ring = collarRing(ctx, -0.004 * T, off, 48, 0.035 * T);
  const r = 0.0045 * T, n = 60;
  const m = new MeshHelper().sweep([...ring, ring[0]], { r: (t) => r * (0.45 + 0.55 * Math.abs(Math.sin(t * Math.PI * n))), seg: 8, g: (t) => [t, 0, 0, 0] });
  return [{ piece: pieceHelper(ctx, m, { weights: neckWeights(ctx) }), noPattern: true, glsl: 'vec3 col = uMain; col = mix(col * 0.82, vec3(1.0), smoothstep(0.3, 1.0, abs(sin(vG.x * 188.5))) * 0.5); return col;' }];
}

// ---------- belts ----------
// a band round the waist (a shell cut out of the body): canonical heights y0 .. y1
function waistBand(ctx, it, y0, y1, o = {}) {
  return shell(ctx, { cover: (V) => (V.limb === 0 || (V.limb === 2 && V.s < 0.1)) ? all(below(V, y1), above(V, y0), 0.6 - V.arm) : -0.05, off: o.off ?? it.off, fill: 3, rim: o.rim ?? 0.003, hides: false });
}
const waistH = (ctx) => ctx.land.waistY - 0.012;
// the front centre of the waistband at a canonical height (world point, normal)
function waistFront(ctx, cy, off) { const L = ctx.A.L; const yy = fyW(ctx, cy); const p = onBody(ctx, 0, yy, off); return { p, n: bodyN(ctx, p) }; }
const fyW = (ctx, cy) => fy(ctx, cy);
const hipsW = (p) => [['Hips', 0.6], ['Spine1', 0.4]];

export function belt(ctx, it) {
  const T = T_(ctx), top = waistH(ctx), w = 0.032;
  const band = waistBand(ctx, it, top - w, top);
  const out = [{ piece: band, noPattern: true, glsl: `vec3 col = uMain; col = mix(col, uSecond, (line(vG.y, ${f3(top - 0.005)}, 0.0012) + line(vG.y, ${f3(top - w + 0.005)}, 0.0012)) * 0.0);
    col = mix(col, uTrim, dashes(vG.x, vG.y, ${f3(top - 0.005)}, 0.0011, 0.006, 0.0035) + dashes(vG.x, vG.y, ${f3(top - w + 0.005)}, 0.0011, 0.006, 0.0035));
    col = mix(col, vec3(0.1), circle(vec2(vG.x, vG.y), vec2(-0.04, ${f3(top - w / 2)}), 0.0025) + circle(vec2(vG.x, vG.y), vec2(-0.055, ${f3(top - w / 2)}), 0.0025));
    return col;` }];
  out.push(buckle(ctx, it, top - w / 2, w * T));
  return out;
}
// a buckle: a rounded frame with a prong on the belt's front
function buckle(ctx, it, cy, h) {
  const T = T_(ctx), { p, n } = waistFront(ctx, cy, it.off + 0.004 * T), ax = frameHelper(n, [0, 1, 0]);
  const hx = h * 0.62, hy = h * 0.62, t = 0.004 * T, bw = h * 0.16;
  const f = (X, Y, Z) => { const [x, y, z] = toFrameHelper(p, ax, [X, Y, Z]); const qx = Math.abs(x) - hx + bw, qy = Math.abs(y) - hy + bw; const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - bw; const inner = Math.abs(out + bw * 0.5) - bw * 0.6; return Math.max(Math.min(inner, Math.max(Math.abs(y) - h * 0.05, Math.abs(x + hx * 0.2) - hx * 0.6)), Math.abs(z) - t / 2) * 0.9; };
  const piece = fieldPiece(ctx, f, boxAroundHelper(p, h), { weights: hipsW, gco: local(p, ax), cell: Math.max(0.0007, bw / 4) });
  return { piece, noPattern: true, glsl: 'vec3 col = uAccent; col = mix(col, vec3(1.0), step(0.0, vG.z) * smoothstep(0.004, 0.0, abs(vG.x + vG.y - 0.004)) * 0.5); return col;', colors: { accent: it.colors.trim && it.item.id === 'bl_belt' ? '#d8d2c0' : it.colors.accent } };
}
// braces: two bands from the waistband up over the shoulders, crossing at the back; clips at the front
export function suspenders(ctx, it) {
  const land = ctx.land, T = T_(ctx), top = waistH(ctx), w = 0.03, xf = 0.06;
  const cover = (V) => {
    if (V.limb !== 0) return -0.05;
    if (V.cy < top - 0.03 || V.cy > land.shY + 0.12) return -0.05;
    const t = clamp((V.cy - (top - 0.03)) / (land.shY + 0.06 - (top - 0.03)));
    const x = V.cz > 0 ? xf + 0.01 * t : xf * (2 * t - 1) * 1.1;    // the back: an X
    return Math.max(w / 2 - Math.abs(Math.abs(V.cx) - Math.abs(x)) , -0.05) * (V.cz > 0 || Math.abs(x) > 0.006 || true ? 1 : 1) - (V.arm > 0.4 ? 0.05 : 0);
  };
  const band = shell(ctx, { cover, off: it.off + 0.002, fill: 2, rim: 0.0025, hides: false });
  const out = [{ piece: band, noPattern: true, glsl: `vec3 col = uMain; col = mix(col, col * 0.75, line(abs(abs(vCanon.x) - ${f3(xf)}), 0.012, 0.0012) * 0.0); col *= 0.94 + 0.06 * stripes(vG.y, 0.006, 0.003); return col;` }];
  // clips: small boxes at the waistband
  const m = new MeshHelper();
  for (const s of [1, -1]) {
    const p = onBody(ctx, s * xf * T_(ctx) * 1.0, fyW(ctx, top + 0.005), it.off + 0.004 * T), ax = frameHelper(bodyN(ctx, p), [0, 1, 0]);
    m.slab(p, ax, [[-0.013 * T, -0.012 * T], [0.013 * T, -0.012 * T], [0.013 * T, 0.012 * T], [-0.013 * T, 0.012 * T]], 0.004 * T, { g: (l) => [l[0], l[1], l[2], 0] });
  }
  out.push({ piece: pieceHelper(ctx, m, { weights: hipsW }), noPattern: true, glsl: 'return uSecond;' });
  return out;
}
// a martial arts belt: wrapped twice, a square knot at the front, two tails
export function gi_belt(ctx, it) {
  const T = T_(ctx), top = waistH(ctx) + 0.005, w = 0.04;
  const out = [{ piece: waistBand(ctx, it, top - w, top, { off: it.off + 0.004 }), noPattern: true, glsl: `vec3 col = uMain; col = mix(col, col * 0.8, dashes(vG.x, vG.y, ${f3(top - 0.008)}, 0.0012, 0.008, 0.005) + dashes(vG.x, vG.y, ${f3(top - w + 0.008)}, 0.0012, 0.008, 0.005)); return col;` }];
  const { p, n } = waistFront(ctx, top - w / 2, it.off + 0.012 * T), ax = frameHelper(n, [0, 1, 0]), m = new MeshHelper();
  m.field((X, Y, Z) => { const [x, y, z] = toFrameHelper(p, ax, [X, Y, Z]); return ellD(x, y, z, 0.022 * T, 0.02 * T, 0.011 * T); }, boxAroundHelper(p, 0.03 * T), 0.0012 * T, () => [0, 0, 0, 0]);
  for (const s of [1, -1]) {
    const path = []; for (let i = 0; i <= 6; i++) { const t = i / 6; path.push(addV(addV(addV(p, ax[0], s * (0.01 + 0.035 * t) * T), ax[1], -(0.005 + 0.14 * t) * T * (s > 0 ? 1 : 0.85)), ax[2], (0.004 + 0.012 * t) * T)); }
    m.sweep(path, { prof: 'flat', th: () => [w * 0.48 * T, 0.003 * T], up: () => ax[2], seg: 8, g: () => [0, 0, 0, 1] });
  }
  out.push({ piece: pieceHelper(ctx, m, { weights: (q) => (q[1] < p[1] - 0.04 * T ? [['Hips', 0.8], ['Spine1', 0.2]] : hipsW(q)) }), noPattern: true, glsl: 'return uMain * 0.97;' });
  return out;
}
// an obi: a wide sash from the waist up under the chest, a cord, a big bow at the back
export function obi(ctx, it) {
  const T = T_(ctx), land = ctx.land, top = land.chestY - 0.015, bot = waistH(ctx) - 0.025;
  const out = [{ piece: waistBand(ctx, it, bot, top, { off: it.off + 0.003, rim: 0.004 }), noPattern: true, glsl: `vec3 col = uMain;
    col = mix(col, uSecond, band(vG.y, ${f3(bot + 0.008)}, ${f3(top - 0.008)}) * 0.0);
    col = mix(col, uSecond, line(vG.y, ${f3(bot + 0.006)}, 0.005) + line(vG.y, ${f3(top - 0.006)}, 0.005));
    col = mix(col, uAccent, line(vG.y, ${f3((top + bot) / 2)}, 0.006));
    col = mix(col, uTrim, line(vG.y, ${f3((top + bot) / 2)}, 0.0015));
    col = mix(col, uSecond, flower(fract(vec2(vG.x, vG.y) / 0.05) * 0.05, vec2(0.025), 0.01, 5.0) * band(vG.y, ${f3(bot + 0.015)}, ${f3(top - 0.015)}) * 0.7);
    return col;` }];
  // the bow at the back
  const yy = fyW(ctx, (top + bot) / 2), p = onBody(ctx, 0, yy, it.off + 0.02 * T, -1), ax = frameHelper([0, 0, -1], [0, 1, 0]);
  const s = 0.12 * ctx.A.L.H;
  const piece = fieldPiece(ctx, bowHelper(p, ax, s, { tails: 0.9, loopH: 0.42, puff: 0.18 }), boxAroundHelper(p, s * 1.1), { weights: (q) => [['Spine1', 0.6], ['Hips', 0.4]], gco: local(p, ax) });
  out.push({ piece, noPattern: true, glsl: `vec3 col = uSecond; col = mix(col, uAccent, step(abs(vG.x), ${f3(s * 0.1)})); col = mix(col, uTrim, line(abs(vG.y), ${f3(s * 0.05)}, 0.002) * step(abs(vG.x), ${f3(s * 0.1)})); return col;` });
  return out;
}

// ---------- wrist ----------
// the Bond Band: a chunky bangle with an oval stone (a swirl from the accent to the second colour) on the back of the wrist
export function bond_band(ctx, it) {
  const T = T_(ctx), W = wristOf(ctx, 1, 0.8), m = new MeshHelper();
  const h = 0.03 * T, th = 0.011 * T;
  wristRing(m, W, [[0.002 * T, -h / 2], [th * 0.8, -h / 2], [th, -h * 0.3], [th, h * 0.3], [th * 0.8, h / 2], [0.002 * T, h / 2]], { id: 0 });
  // the stone: a domed oval on the back of the wrist
  const c = addV(W.c, W.u, W.r + th + 0.002 * T), ax = [W.ax, cross(W.u, W.ax), W.u].map(nrm);
  const fr = [ax[1], ax[0], ax[2]];
  const f = (X, Y, Z) => { const [x, y, z] = toFrameHelper(c, fr, [X, Y, Z]); return Math.min(ellD(x, y, z, 0.016 * T, 0.013 * T, 0.007 * T), Math.max(ellD(x, y, z + 0.003 * T, 0.021 * T, 0.018 * T, 0.006 * T), -z - 0.004 * T)); };
  m.field(f, boxAroundHelper(c, 0.025 * T), 0.0007 * T, (q) => { const l = toFrameHelper(c, fr, q); return [l[0], l[1], l[2], ellD(l[0], l[1], l[2], 0.016 * T, 0.013 * T, 0.007 * T) < 0.0005 ? 1 : 2]; });
  return [{ piece: pieceHelper(ctx, m, { bone: W.bone }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); vec3 col = uMain;
    if (id < 0.5) { col = mix(col, uSecond, line(vG.y, 0.0, 0.004)); col = mix(col, uTrim, (line(vG.y, ${f3(h * 0.38)}, 0.0015) + line(vG.y, ${f3(-h * 0.38)}, 0.0015))); }
    if (id > 1.5) col = uTrim;
    if (id > 0.5 && id < 1.5) { vec2 q = vG.xy / ${f3(0.016 * T)}; float a = atan(q.y, q.x) + length(q) * 5.0; float sw = 0.5 + 0.5 * sin(a * 2.0);
      col = mix(uAccent, uSecond, sw); col = mix(col, vec3(1.0), smoothstep(0.35, 0.0, length(q - vec2(-0.35, 0.4))) * 0.8); col = mix(col, col * 0.6, smoothstep(0.75, 1.0, length(q))); }
    return col;` }];
}
export function sweatband(ctx, it) {
  const T = T_(ctx), out = [];
  for (const s of [1, -1]) {
    const W = wristOf(ctx, s, 0.82), m = new MeshHelper(), h = 0.045 * T, th = 0.007 * T;
    wristRing(m, W, [[0.001 * T, -h / 2], [th, -h / 2 + 0.003 * T], [th, h / 2 - 0.003 * T], [0.001 * T, h / 2]]);
    out.push({ piece: pieceHelper(ctx, m, { bone: W.bone }), noPattern: true, glsl: `vec3 col = uMain; col *= 0.9 + 0.1 * stripes(vG.x * ${f3(W.r)}, 0.004, 0.0016); col = mix(col, uSecond, band(abs(vG.y), ${f3(h * 0.22)}, ${f3(h * 0.32)})); return col;` });
  }
  return out;
}
export function bangle(ctx, it) {
  const T = T_(ctx), W = wristOf(ctx, -1, 0.84), m = new MeshHelper(), th = 0.008 * T, h = 0.008 * T;
  const prof = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + Math.PI * i / 10; prof.push([0.004 * T + Math.cos(a) * th * 0.5, Math.sin(a) * h]); }
  wristRing(m, W, prof);
  return [{ piece: pieceHelper(ctx, m, { bone: W.bone }), noPattern: true, glsl: 'vec3 col = uMain; col = mix(col * 0.8, vec3(1.0), smoothstep(0.6, 1.0, sin(vG.x * 3.0) * 0.5 + 0.5) * 0.4); return col;' }];
}
export function watch(ctx, it) {
  const T = T_(ctx), W = wristOf(ctx, 1, 0.84), m = new MeshHelper(), h = 0.016 * T, th = 0.0035 * T;
  wristRing(m, W, [[0.0008 * T, -h / 2], [th, -h / 2], [th, h / 2], [0.0008 * T, h / 2]], { id: 0 });
  // the face: a short drum on the back of the wrist
  const c = addV(W.c, W.u, W.r + th), fr = [cross(W.u, W.ax), W.u, W.ax].map(nrm), R = 0.015 * T;
  m.lathe(c, [fr[0], fr[1], fr[2]], [[0.0001, 0.008 * T], [R * 0.9, 0.008 * T], [R, 0.006 * T], [R, 0], [R * 0.8, -0.001 * T]], { seg: 28, g: (l, r, hh2) => [l[0], l[2], r, hh2 > 0.0075 * T ? 1 : 2] });
  return [{ piece: pieceHelper(ctx, m, { bone: W.bone }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); vec3 col = uMain;
    if (id > 1.5) col = uAccent;
    if (id > 0.5 && id < 1.5) { vec2 q = vG.xy; col = uSecond; col = mix(col, uAccent, ring(q, vec2(0.0), ${f3(R * 0.82)}, 0.0012));
      for (int i = 0; i < 12; i++) { float a = float(i) * 0.5236; col = mix(col, vec3(0.2), circle(q, vec2(cos(a), sin(a)) * ${f3(R * 0.68)}, 0.0007)); }
      col = mix(col, vec3(0.15), line(q.x, 0.0, 0.0012) * step(0.0, q.y) * step(q.y, ${f3(R * 0.55)}) + line(q.y, 0.0, 0.0012) * step(0.0, q.x) * step(q.x, ${f3(R * 0.4)})); }
    return col;` }];
}
export function charm_bracelet(ctx, it) {
  const T = T_(ctx), W = wristOf(ctx, -1, 0.85), m = new MeshHelper();
  const fr = [W.u, W.ax, cross(W.u, W.ax)];
  const ring = []; for (let i = 0; i <= 32; i++) { const a = (i / 32) * Math.PI * 2; ring.push(inFrameHelper(W.c, fr, [Math.cos(a) * (W.r + 0.004 * T), Math.sin(a * 3) * 0.001 * T, Math.sin(a) * (W.r + 0.004 * T)])); }
  m.sweep(ring, { r: (t) => 0.0018 * T * (0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * 24))), seg: 6, g: () => [0, 0, 0, 0] });
  // charms hanging off it: a star, a heart disc, an orb
  for (const [k, a] of [[1, 0.6], [2, 2.3], [3, 4.2]]) {
    const at = inFrameHelper(W.c, fr, [Math.cos(a) * (W.r + 0.007 * T), 0, Math.sin(a) * (W.r + 0.007 * T)]);
    const out = nrm(subV(at, W.c)), c = addV(at, out, 0.006 * T), fwd = out;
    if (k === 1) m.field(starHelper(c, fwd, 0.007 * T, 0.003 * T, W.ax), boxAroundHelper(c, 0.01 * T), 0.0006 * T, () => [0, 0, 0, 1]);
    else m.field((x, y, z) => Math.max(Math.hypot(x - c[0], y - c[1], z - c[2]) - 0.006 * T, Math.abs(dotV(subV([x, y, z], c), fwd)) - 0.0015 * T * (k === 3 ? 2 : 1)), boxAroundHelper(c, 0.009 * T), 0.0006 * T, () => [0, 0, 0, k]);
  }
  return [{ piece: pieceHelper(ctx, m, { bone: W.bone }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); vec3 col = uMain; if (id > 1.5 && id < 2.5) col = uAccent; if (id > 2.5) col = uSecond; return col;` }];
}
export function woven_bracelet(ctx, it) {
  const T = T_(ctx), W = wristOf(ctx, -1, 0.84), m = new MeshHelper(), h = 0.011 * T, th = 0.0035 * T;
  wristRing(m, W, [[0.0005 * T, -h / 2], [th, -h / 2 + 0.001 * T], [th, h / 2 - 0.001 * T], [0.0005 * T, h / 2]]);
  return [{ piece: pieceHelper(ctx, m, { bone: W.bone }), noPattern: true, glsl: `vec3 col = uMain; float u = vG.x * ${f3(W.r)}; float zz = abs(fract(u / 0.008) - 0.5) * 0.008;
    col = mix(col, uSecond, step(abs(vG.y - zz + 0.002), 0.0016)); col = mix(col, uAccent, step(abs(vG.y + zz - 0.002), 0.0012)); col *= 0.9 + 0.1 * stripes(u + vG.y, 0.002, 0.001); return col;` }];
}
// the ranger's device: a broad cuff on the forearm with a hexagonal screen and a dial
export function device_gauntlet(ctx, it) {
  const T = T_(ctx), W = wristOf(ctx, 1, 0.62), m = new MeshHelper(), h = 0.075 * T, th = 0.008 * T;
  wristRing(m, W, [[0.001 * T, -h / 2], [th, -h / 2 + 0.003 * T], [th * 1.2, 0], [th, h / 2 - 0.003 * T], [0.001 * T, h / 2]], { id: 0 });
  const c = addV(W.c, W.u, W.r + th * 1.2), fr = [cross(W.u, W.ax), W.ax, W.u].map(nrm), R = 0.024 * T;
  const hex = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; hex.push([Math.cos(a) * R, Math.sin(a) * R]); }
  m.slab(addV(c, W.u, 0.002 * T), fr, hex, 0.006 * T, { g: (l) => [l[0], l[1], l[2], 1] });
  const dc = addV(addV(c, W.ax, -0.03 * T), W.u, 0.002 * T);
  m.lathe(dc, [fr[0], fr[2], fr[1]], [[0.0001, 0.007 * T], [0.008 * T, 0.007 * T], [0.009 * T, 0.003 * T], [0.009 * T, -0.002 * T]], { seg: 16, g: () => [0, 0, 0, 2] });
  return [{ piece: pieceHelper(ctx, m, { bone: W.bone }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); vec3 col = uMain;
    if (id < 0.5) { col = mix(col, uSecond, band(abs(vG.y), ${f3(h * 0.3)}, ${f3(h * 0.5)})); ${has(it, 'reflective_dots') ? `col = mix(col, vec3(0.95), circle(vec2(vG.x * ${f3(W.r)}, vG.y), vec2(${f3(-W.r * 1.6)}, ${f3(h * 0.4)}), 0.003));` : ''} }
    if (id > 0.5 && id < 1.5) { col = uSecond; if (vG.z > 0.0) { col = mix(vec3(0.3, 0.75, 0.85), vec3(0.15, 0.4, 0.6), smoothstep(${f3(-R)}, ${f3(R)}, vG.y)); col = mix(col, vec3(1.0), line(vG.x + vG.y, 0.0, 0.003) * 0.5); col = mix(col, uAccent, line(length(vG.xy), ${f3(R * 0.5)}, 0.0012)); } }
    if (id > 1.5) col = uAccent;
    return col;` }];
}
// a ring on the left ring finger
export function ring(ctx, it) {
  const T = T_(ctx), a = jointPos(ctx, 'LFingerD1'), b = jointPos(ctx, 'LFingerD2'), c = lerpV(a, b, 0.45), ax = nrm(subV(b, a));
  const up = nrm([ctx.A.ad[BONE.LFingerD1][4], ctx.A.ad[BONE.LFingerD1][5], ctx.A.ad[BONE.LFingerD1][6]]), u = nrm(subV(up, ax.map((v) => v * dotV(up, ax))));
  let r = 0; for (let k = 0; k < 8; k++) { const ang = (k / 8) * Math.PI * 2, d = addV(u.map((x) => x * Math.cos(ang)), cross(ax, u), Math.sin(ang)); r = Math.max(r, Math.hypot(...subV(exitHelper(ctx, c, d, 0, 0.03), c))); }
  const m = new MeshHelper(), fr = [u, ax, cross(u, ax)], th = 0.0022 * T, h = 0.0035 * T;
  const prof = []; for (let i = 0; i <= 8; i++) { const t = -Math.PI / 2 + Math.PI * i / 8; prof.push([r + 0.0006 * T + Math.cos(t) * th, Math.sin(t) * h]); }
  m.lathe(c, fr, prof, { seg: 20, g: () => [0, 0, 0, 0] });
  const gc = addV(c, u, r + th * 1.6);
  m.field((x, y, z) => Math.hypot(x - gc[0], y - gc[1], z - gc[2]) - 0.0028 * T, boxAroundHelper(gc, 0.005 * T), 0.0005 * T, () => [0, 0, 0, 1]);
  return [{ piece: pieceHelper(ctx, m, { bone: 'LFingerD1' }), noPattern: true, glsl: 'float id = floor(vG.w + 0.5); vec3 col = uMain; if (id > 0.5) col = mix(uAccent, vec3(1.0), 0.15); return col;' }];
}

// ---------- pins ----------
// the left chest, on the outermost layer: point, normal, frame
function chestSpot(ctx, it, dx = 0, dy = 0) {
  const L = ctx.A.L, T = T_(ctx);
  const p = onBody(ctx, L.chestW * 0.28 + dx * T, L.shY - 0.075 * L.H + dy * T, outerOffHelper(it) + 0.002 * T);
  const n = bodyN(ctx, p);
  return { p, n, ax: frameHelper(n, [0, 1, 0]), T };
}
const chestW = () => [['Spine3', 1]];
export function button_badge(ctx, it) {
  const { p, ax, T } = chestSpot(ctx, it), R = 0.017 * T, m = new MeshHelper();
  m.lathe(p, [ax[0], ax[2], ax[1].map((v) => -v)], [[0.0001, 0.004 * T], [R * 0.8, 0.0038 * T], [R, 0.0022 * T], [R, 0]], { seg: 28, g: (l) => [l[0], l[2], 0, 0] });
  const s3 = R * 2 / 3;
  return [{ piece: pieceHelper(ctx, m, { weights: chestW }), noPattern: true, glsl: `vec2 q = vG.xy; vec3 col = mix(uMain, uSecond, mod(floor(q.x / ${f3(s3)} + 1.5) + floor(q.y / ${f3(s3)} + 1.5), 2.0));
    col = mix(col, vec3(1.0), smoothstep(${f3(R * 0.5)}, 0.0, length(q - vec2(${f3(-R * 0.4)}, ${f3(R * 0.4)}))) * 0.35); col = mix(col, uTrim, line(length(q), ${f3(R * 0.96)}, 0.0012)); return col;` }];
}
// an enamel pin: a star (star_emblem) or one of our gym badges (a hexagon leaf, a wave drop, a bolt shield)
export function enamel_pin(ctx, it) {
  const { p, n, ax, T } = chestSpot(ctx, it), r = 0.018 * T, m = new MeshHelper();
  const g = (q) => { const l = toFrameHelper(p, ax, q); return [l[0], l[1], l[2], 0]; };
  if (has(it, 'star_emblem')) m.field(starHelper(p, n, r, 0.004 * T), boxAroundHelper(p, r * 1.3), 0.0007 * T, g);
  else {
    const hex = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; hex.push([Math.cos(a) * r, Math.sin(a) * r]); }
    m.slab(p, ax, hex, 0.004 * T, { g: (l) => [l[0], l[1], l[2], 0] });
  }
  const star = has(it, 'star_emblem');
  return [{ piece: pieceHelper(ctx, m, { weights: chestW }), noPattern: true, glsl: `vec2 q = vG.xy; vec3 col = uMain;
    ${star ? `col = mix(col, uAccent, ${starGLSL('q', 'vec2(0.0)', f3(r * 0.5))});` : `col = mix(col, uAccent, step(length(q), ${f3(r * 0.75)}));
      { vec2 l = q / ${f3(r * 0.6)}; float leaf = step(length(l - vec2(0.35, 0.0)), 0.75) * step(length(l + vec2(0.35, 0.0)), 0.75); col = mix(col, uSecond, leaf); col = mix(col, uAccent, line(l.y + l.x * 0.15, 0.0, 0.1) * leaf); }`}
    col = mix(col, vec3(1.0), step(0.0015, vG.z) * smoothstep(0.003, 0.0, abs(q.x + q.y - ${f3(r * 0.3)})) * 0.5);
    return col;` }];
}
// a feather: tucked in a hat's band when a hat is worn, else on the lapel
export function hat_feather(ctx, it) {
  const T = T_(ctx);
  if (it.has('hat')) {
    const H = headHelper(ctx), hh = H.hh, y = H.eye + hh * 0.2, z = -hh * 0.02, x = H.xS(y, z) + 0.024 * T;
    const a = H.W([x, y - hh * 0.03, z + hh * 0.05]), b = H.W([x + hh * 0.06, y + hh * 0.34, z - hh * 0.22]);
    const piece = fieldPiece(ctx, featherHelper(a, b, [0.012 * T, 0, 0.012 * T], hh * 0.05), [[Math.min(a[0], b[0]) - 0.04, Math.min(a[1], b[1]) - 0.03, Math.min(a[2], b[2]) - 0.04], [Math.max(a[0], b[0]) + 0.04, Math.max(a[1], b[1]) + 0.03, Math.max(a[2], b[2]) + 0.04]], { bone: 'Head', gco: (q) => [q[0], q[1] - a[1], q[2], 0] });
    return [{ piece, noPattern: true, glsl: `vec3 col = mix(uMain, uSecond, smoothstep(0.0, ${f3(hh * 0.35)}, vG.y)); col = mix(col, uAccent, line(fract(vG.y * 90.0), 0.5, 0.08) * 0.5); return col;` }];
  }
  const { p, n, ax } = chestSpot(ctx, it, -0.012, 0.02), a = p, b = addV(addV(p, ax[1], 0.11 * T), ax[0], 0.025 * T);
  const piece = fieldPiece(ctx, featherHelper(a, b, addV(n.map((v) => v * 0.006 * T), ax[0], 0.008 * T), 0.012 * T), [a.map((v, i) => Math.min(v, b[i]) - 0.03 * T), a.map((v, i) => Math.max(v, b[i]) + 0.03 * T)], { weights: chestW, gco: (q) => [q[0], q[1] - a[1], q[2], 0] });
  return [{ piece, noPattern: true, glsl: `vec3 col = mix(uMain, uSecond, smoothstep(0.0, 0.1, vG.y)); col = mix(col, uAccent, line(fract(vG.y * 90.0), 0.5, 0.08) * 0.5); return col;` }];
}
// a rose on the lapel with a leaf
export function boutonniere(ctx, it) {
  const { p, n, ax, T } = chestSpot(ctx, it, -0.005, 0.012), r = 0.02 * T, m = new MeshHelper(), c = addV(p, n, r * 0.35);
  m.field(flowerHelper(c, n, r, { rose: true }), boxAroundHelper(c, r * 1.3), 0.0008 * T, (q) => { const l = toFrameHelper(c, ax, q); return [l[0], l[1], l[2], 0]; });
  const a = addV(c, ax[1], -r * 0.6), b = addV(addV(a, ax[1], -r * 1.3), ax[0], r * 0.5);
  m.field((x, y, z) => Math.max(capsHelper(x, y, z, a, b, r * 0.35, r * 0.08), Math.abs(dotV(subV([x, y, z], a), n)) - 0.002 * T), boxAroundHelper(lerpV(a, b, 0.5), r * 1.4), 0.0008 * T, () => [0, 0, 0, 1]);
  return [{ piece: pieceHelper(ctx, m, { weights: chestW }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); float rr = length(vG.xy); vec3 col = mix(uMain * 0.6, uMain, smoothstep(0.0, ${f3(r * 0.8)}, rr) * (0.75 + 0.25 * sin(atan(vG.y, vG.x) * 2.0 + rr * 900.0)));
    if (id > 0.5) col = uSecond;
    return col;` }];
}
