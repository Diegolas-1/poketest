// Bags: messengers and satchels on a cross-body strap, backpacks (school, hiking
// frame, drawstring), totes and small shoulder bags, belt bags (fanny pack, the
// trainer's ball pouch), and things carried in the arms (handbag, basket, briefcase).
//
// Straps that lie on the body are shells (wear.js) cut out of the body mesh along
// a band in canonical coordinates (the reference body's: a strap "from the left
// shoulder to the right hip" is the same band on a toddler and an elder), lifted
// over the outermost clothes (hats.js' outerOffHelper) and hung straight over the
// belly's dip, so they move with the body's own weights and never sink in.
// A bag's body is a direct mesh (a superellipsoid: a box with round edges and
// corners, tapered or bulged per bag), placed from the person's landmarks and the
// body's surface outside the clothes, and weighted rigidly to the bones it hangs
// from: the hips (messengers, belt bags), the upper spine (backpacks), the forearm
// (handbag, basket) or the hand (briefcase).
//
// Paint (gco): x, y, z in the bag's own box frame (m; x across, y up, z out of its
// front face), w part id (0 body, 1 flap, 2 pocket, 3 trim: buckles, zip pulls,
// clips, 4 strap or handle, 5 extras).
import { shell, jointPos, fy } from '../wear.js';
import { BONE } from '../rig.js';
import { all, below, above } from './common.js';
import { MeshHelper, pieceHelper, surfHelper, exitHelper, frameHelper, inFrameHelper, toFrameHelper, addV, subV, nrm, cross, dotV, lerpV, outerOffHelper, hasHelper as has, orbGLSL, starGLSL, fmtHelper as f3 } from './hats.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sgp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const T_ = (ctx) => ctx.A.L.H / 1.7;

// a rounded box (superellipsoid) at c in frame ax (x across, y up, z out), half sizes h, roundness e (0.15 boxy .. 1 round);
// o: { taper (top width scale), bulge (front swell), pinch (top gathers), id, g(l) }
function blob(m, c, ax, h, e = 0.22, o = {}) {
  const nu = o.nu || 28, nv = o.nv || 18, t0 = m.idx.length, rows = [];
  for (let j = 0; j <= nv; j++) {
    const th = -Math.PI / 2 + Math.PI * j / nv, row = [];
    for (let i = 0; i < nu; i++) {
      const ph = -Math.PI + 2 * Math.PI * i / nu;
      let x = h[0] * sgp(Math.cos(th), e) * sgp(Math.cos(ph), e), y = h[1] * sgp(Math.sin(th), e), z = h[2] * sgp(Math.cos(th), e) * sgp(Math.sin(ph), e);
      const ty = (y / h[1] + 1) / 2;
      if (o.taper) x *= 1 + (o.taper - 1) * ty;
      if (o.taperZ) z *= 1 + (o.taperZ - 1) * ty;
      if (o.bulge) z += o.bulge * h[2] * Math.max(0, z / h[2]) * Math.cos((y / h[1]) * Math.PI / 2) * Math.cos((x / h[0]) * Math.PI / 2);
      if (o.pinch) { const k = 1 - o.pinch * Math.pow(Math.max(0, ty - 0.7) / 0.3, 1.5); x *= k; z *= k; }
      const l = [x, y, z], p = inFrameHelper(c, ax, l);
      row.push(m.vert(p, o.g ? o.g(l) : [x, y, z, o.id ?? 0]));
    }
    rows.push(row);
  }
  for (let j = 0; j < nv; j++) m.strip(rows[j], rows[j + 1], true);
  m.orientClosed(t0, m.idx.length);
  return m;
}
// a strap shell: cover(V) on the trunk (canonical) -> a band lifted over the clothes
function strapShell(ctx, it, cover, o = {}) {
  const off = outerOffHelper(it) + (o.extra ?? 0.003);
  return shell(ctx, { cover, off, fill: 3, hang: o.hang ?? 0.5, rim: o.rim ?? 0.003, hides: false });
}
// the distance from a canonical point (on the trunk's front or back, x / y) to a segment, as a band cover of width w
function bandCover(V, a, b, w) {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((V.cx - a[0]) * dx + (V.cy - a[1]) * dy) / (dx * dx + dy * dy));
  return w / 2 - Math.hypot(V.cx - a[0] - dx * t, V.cy - a[1] - dy * t);
}
// a cross-body strap from the side-s shoulder (s 1: the person's left) to the other hip, front and back
function crossStrap(ctx, it, s, w = 0.042) {
  const land = ctx.land;
  const a = [s * 0.075, land.shY + 0.09], b = [-s * 0.16, land.hipJ + 0.02];
  return strapShell(ctx, it, (V) => (V.limb === 0 && V.arm < 0.45 ? bandCover(V, a, b, w) : V.limb === 1 && V.s < 0.08 ? bandCover(V, a, b, w) - 0.01 : -0.05), { hang: 0.6 });
}
const STRAP_PAINT = (o = {}) => `vec3 col = ${o.col || 'uSecond'}; col *= 0.92 + 0.08 * stripes(vG.y, 0.008, 0.004);
  col = mix(col, ${o.edge || 'uTrim'}, 0.0);
  ${o.chain ? 'col = mix(col, uTrim, 0.85); col *= 0.75 + 0.25 * step(0.5, fract(vG.y * 90.0));' : ''}
  return col;`;
// bag weights by name
const WT = { hips: () => [['Hips', 0.7], ['Spine1', 0.3]], back: () => [['Spine2', 0.45], ['Spine3', 0.55]], side: () => [['Spine2', 0.6], ['Spine1', 0.4]] };
// the side of the trunk at a height (world): the body's surface (+ off) coming in from the side s, slightly back (zb)
function sideAt(ctx, s, y, off, zb = 0) { return exitHelper(ctx, [0, y, zb * 0.3], [s, 0, zb ? zb * 3 : 0], off); }
function backAt(ctx, y, off, x = 0) { return exitHelper(ctx, [x, y, 0.02], [0, 0, -1], off); }
const frontAt = (ctx, y, off, x = 0) => exitHelper(ctx, [x, y, -0.02], [0, 0, 1], off);

// the bag paint: body, flap, pockets, buckles, stitching (by part and the box frame coordinates)
function bagGLSL(h, o = {}) {
  const [hx, hy, hz] = h;
  return `float id = floor(vG.w + 0.5); vec3 P3 = vG.xyz; vec3 col = uMain;
    float front = step(${f3(hz * 0.55)}, P3.z);
    // stitching round the front face
    col = mix(col, uTrim, ${o.stitch === false ? '0.0' : `front * (dashes(P3.y, P3.x, ${f3(hx * 0.86)}, 0.0012, 0.007, 0.004) + dashes(P3.y, P3.x, ${f3(-hx * 0.86)}, 0.0012, 0.007, 0.004) + dashes(P3.x, P3.y, ${f3(-hy * 0.86)}, 0.0012, 0.007, 0.004))`});
    ${o.flap ? `{ float fl = front * step(${f3(hy * (1 - 2 * o.flap))}, P3.y - ${f3(-(o.flapCurve || 0))} * (1.0 - pow(abs(P3.x) / ${f3(hx)}, 2.0)) * 0.0); vec3 fc = ${o.flapCol || 'uSecond'};
      col = mix(col, fc, fl + step(${f3(hy * 0.92)}, P3.y) * step(0.0, P3.z));
      col = mix(col, uTrim, fl * (dashes(P3.y, P3.x, ${f3(hx * 0.8)}, 0.0011, 0.006, 0.0035) + dashes(P3.y, P3.x, ${f3(-hx * 0.8)}, 0.0011, 0.006, 0.0035) + dashes(P3.x, P3.y, ${f3(hy * (1 - 2 * o.flap) + 0.008)}, 0.0011, 0.006, 0.0035)));
      col = mix(col, col * 0.6, front * line(P3.y, ${f3(hy * (1 - 2 * o.flap))}, 0.003)); }` : ''}
    ${o.zip ? `col = mix(col, uTrim, line(P3.z * step(0.0, P3.y) + 0.0, 0.0, 0.004) * step(${f3(hy * 0.6)}, P3.y)); col = mix(col, uTrim * 0.6, line(P3.z, 0.0, 0.0012) * step(${f3(hy * 0.6)}, P3.y) * stripes(P3.x, 0.003, 0.0015));` : ''}
    ${o.pocket ? `col = mix(col, uSecond, front * box2(P3.xy, vec2(0.0, ${f3(-hy * 0.35)}), vec2(${f3(hx * 0.62)}, ${f3(hy * 0.42)}), 0.012)); col = mix(col, uTrim, front * boxLine(P3.xy, vec2(0.0, ${f3(-hy * 0.35)}), vec2(${f3(hx * 0.62 - 0.004)}, ${f3(hy * 0.42 - 0.004)}), 0.01, 0.0012) * 0.8);
      col = mix(col, uTrim, front * line(P3.y, ${f3(-hy * 0.0 + 0.0)}, 0.003) * step(abs(P3.x), ${f3(hx * 0.6)}));` : ''}
    ${o.extra || ''}
    if (id > 2.5 && id < 3.5) col = uTrim;
    if (id > 3.5 && id < 4.5) col = uSecond;
    if (id > 4.5) col = uAccent;
    return col;`;
}
// buckles on a flap: small slabs on the front face at local (x, y)
function buckles(m, c, ax, h, xs, y) {
  for (const x of xs) {
    const p = inFrameHelper(c, ax, [x, y, h[2] + 0.002]), bw = h[0] * 0.13, bh = bw * 0.8;
    m.slab(p, ax, [[-bw, -bh], [bw, -bh], [bw, bh], [-bw, bh]], 0.004, { g: (l) => [l[0], l[1], l[2], 3] });
  }
}

// cross-body bags ---------------------------------------------------------------
// o: { size: [w, h, d] x torso, s (strap shoulder), fwd (how far round to the front), y (centre, x torso height above the hip joint), flap, buckles, e }
function crossBag(ctx, it, o) {
  const L = ctx.A.L, T = T_(ctx), torso = L.shY - L.hipJ, s = o.s ?? 1;
  const hx = torso * o.size[0] / 2, hy = torso * o.size[1] / 2, hz = torso * o.size[2] / 2;
  const off = outerOffHelper(it) + 0.006 * T;
  const y = L.hipJ + torso * (o.y ?? 0.05);
  const side = sideAt(ctx, -s, y, off + hz, -(o.back ?? 0.3) * L.hipD * 0.5);
  const n = nrm([-s, 0, o.fwd ?? 0.25]), ax = frameHelper(n, [0, 1, 0]);
  const c = addV(side, n, 0.0);
  const m = new MeshHelper(), h = [hx, hy, hz];
  blob(m, c, ax, h, o.e ?? 0.22, { bulge: 0.15, taper: o.taper });
  if (o.buckles) buckles(m, c, ax, h, o.buckles, hy * (1 - 2 * o.flap) + hy * 0.12);
  // the strap's ends: short tabs from the top corners up towards the strap
  const tabs = new MeshHelper();
  for (const k of [-1, 1]) { const p0 = inFrameHelper(c, ax, [k * hx * 0.85, hy * 0.85, 0]), p1 = addV(p0, [0, torso * 0.06, 0]); tabs.sweep([p0, lerpV(p0, p1, 0.5), p1], { prof: 'flat', th: () => [0.018 * T, 0.003 * T], up: () => ax[2], seg: 6, g: () => [0, 0, 0, 4] }); }
  m.add(tabs);
  const out = [{ piece: pieceHelper(ctx, m, { weights: WT.hips }), noPattern: true, glsl: bagGLSL(h, { flap: o.flap, pocket: o.pocket, extra: o.paint }) }];
  out.push({ piece: crossStrap(ctx, it, s, (o.strapW ?? 0.042)), noPattern: true, glsl: STRAP_PAINT({ col: o.strapCol }) });
  return out;
}
export const messenger = (ctx, it) => crossBag(ctx, it, { size: [0.72, 0.5, 0.17], flap: 0.38, buckles: [-0.5, 0.5].map((k) => k * (ctx.A.L.shY - ctx.A.L.hipJ) * 0.36 * 0.9), fwd: 0.15, back: 0.6, y: 0.1,
  paint: `col = mix(col, uAccent, step(0.0, P3.z) * line(P3.y, 0.0, 0.006) * 0.0);` });
export function satchel(ctx, it) {
  const kid = has(it, 'applique_animal'), L = ctx.A.L, torso = L.shY - L.hipJ;
  const size = it.params.length === 'small' ? [0.5, 0.42, 0.16] : [0.62, 0.48, 0.16];
  const app = kid ? `{ vec2 q = P3.xy - vec2(0.0, ${f3(torso * 0.04)}); float f = step(${f3(torso * 0.04)}, P3.z);
    float head = circle(q, vec2(0.0), ${f3(torso * 0.07)}) + circle(vec2(abs(q.x), q.y), vec2(${f3(torso * 0.055)}, ${f3(torso * 0.065)}), ${f3(torso * 0.03)});
    col = mix(col, uAccent, clamp(head, 0.0, 1.0) * f); col = mix(col, vec3(0.12), circle(vec2(abs(q.x), q.y), vec2(${f3(torso * 0.025)}, ${f3(torso * 0.01)}), ${f3(torso * 0.008)}) * f); col = mix(col, uSecond, circle(q, vec2(0.0, ${f3(-torso * 0.018)}), ${f3(torso * 0.009)}) * f); }` : '';
  return crossBag(ctx, it, { size, flap: kid ? 0 : 0.42, buckles: has(it, 'buckle') ? [-0.5, 0.5].map((k) => k * torso * size[0] * 0.5 * 0.8) : null, fwd: 0.3, y: 0.08, paint: app, back: 0.3 });
}
export function camera_bag(ctx, it) {
  const L = ctx.A.L, torso = L.shY - L.hipJ;
  return crossBag(ctx, it, { size: [0.42, 0.34, 0.24], flap: 0.3, buckles: [0], fwd: 0.9, back: -0.4, y: 0.16, e: 0.3,
    paint: `col = mix(col, uSecond, (1.0 - front) * step(0.0, 1.0) * 0.0); col = mix(col, col * 0.85, stripes(P3.y, ${f3(torso * 0.04)}, ${f3(torso * 0.004)}) * (1.0 - front) * ${has(it, 'padding') ? '1.0' : '0.0'});` });
}

// backpacks -----------------------------------------------------------------------
// shoulder straps (shells): over each shoulder from the front of the chest to the pack's top at the back
function packStraps(ctx, it, top, o = {}) {
  const land = ctx.land, w = o.w ?? 0.045, xf = o.xf ?? 0.085, xb = o.xb ?? 0.07, yF = o.yF ?? land.chestY - 0.055;
  return strapShell(ctx, it, (V) => {
    if (V.limb !== 0 || V.arm > 0.5) return -0.05;
    const front = V.cz > 0;
    const x = front ? xf : xb, d = w / 2 - Math.abs(Math.abs(V.cx) - x);
    const lim = front ? V.cy - yF : V.cy - top;
    return Math.min(d, lim);
  }, { hang: 0.2, extra: 0.004 });
}
// o: { size [w, h, d] x torso, y0 (bottom over the hip joint x torso), pocket, zip, frame, bedroll }
function backpackHelper(ctx, it, o) {
  const L = ctx.A.L, land = ctx.land, T = T_(ctx), torso = L.shY - L.hipJ;
  const hx = L.chestW * o.size[0] / 2, hy = torso * o.size[1] / 2, hz = torso * o.size[2] / 2;
  const off = outerOffHelper(it) + 0.008 * T;
  const yc = L.hipJ + torso * (o.y0 ?? 0.2) + hy;
  const bp = backAt(ctx, Math.min(yc, L.chestY), off);
  const c = [0, yc, bp[2] - hz * 0.95];
  const ax = frameHelper([0, 0.08, -1], [0, 1, 0]);
  const m = new MeshHelper(), h = [hx, hy, hz];
  blob(m, c, ax, h, o.e ?? 0.3, { bulge: 0.2, pinch: o.pinch, taper: o.taper, taperZ: o.taperZ });
  if (o.pocket) blob(m, inFrameHelper(c, ax, [0, -hy * 0.38, hz * 0.95]), ax, [hx * 0.72, hy * 0.42, hz * 0.32], 0.3, { id: 2 });
  if (has(it, 'zip_pulls')) for (const k of [-1, 1]) { const p = inFrameHelper(c, ax, [k * hx * 0.25, hy * 0.92, hz * 0.55]); m.slab(p, ax, [[-0.004 * T, -0.012 * T], [0.004 * T, -0.012 * T], [0.004 * T, 0.004 * T], [-0.004 * T, 0.004 * T]], 0.003 * T, { g: (l) => [l[0], l[1], l[2], 3] }); }
  if (o.frame) {
    // two frame tubes up the sides, a bar over the top
    for (const k of [-1, 1]) { const p0 = inFrameHelper(c, ax, [k * hx * 1.04, -hy * 1.0, -hz * 0.6]), p1 = inFrameHelper(c, ax, [k * hx * 1.04, hy * 1.18, -hz * 0.6]); m.sweep([p0, lerpV(p0, p1, 0.5), p1], { r: 0.008 * T, seg: 8, g: () => [0, 0, 0, 3] }); }
    m.sweep([inFrameHelper(c, ax, [-hx * 1.04, hy * 1.18, -hz * 0.6]), inFrameHelper(c, ax, [0, hy * 1.2, -hz * 0.6]), inFrameHelper(c, ax, [hx * 1.04, hy * 1.18, -hz * 0.6])], { r: 0.008 * T, seg: 8, g: () => [0, 0, 0, 3] });
  }
  if (o.bedroll) {
    // the rolled mat on top: a lathe along x
    const rc = inFrameHelper(c, ax, [0, hy + hz * 0.55, 0]), R = hz * 0.62;
    m.lathe(rc, [ax[1], ax[0], ax[2]], [[0.0001, -hx * 1.1], [R * 0.9, -hx * 1.1], [R, -hx * 1.05], [R, hx * 1.05], [R * 0.9, hx * 1.1], [0.0001, hx * 1.1]], { seg: 20, g: (l, r, hh) => [l[0], hh, l[2], 5] });
  }
  if (o.carabiner) { const kc = inFrameHelper(c, ax, [hx * 0.7, -hy * 0.6, hz * 1.02]); const fr = frameHelper(ax[2], ax[1]); const ring = []; for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; ring.push(inFrameHelper(kc, fr, [Math.cos(a) * 0.012 * T, Math.sin(a) * 0.02 * T, 0])); } m.sweep(ring, { r: 0.0022 * T, seg: 6, closed: true, g: () => [0, 0, 0, 3] }); }
  if (has(it, 'charm')) { const kc = inFrameHelper(c, ax, [-hx * 0.4, hy * 0.75, hz * 1.0]); m.sweep([kc, addV(kc, [0, -0.025 * T, 0.004 * T])], { r: 0.0012 * T, seg: 5, g: () => [0, 0, 0, 3] }); const bc = addV(kc, [0, -0.035 * T, 0.006 * T]); blob(m, bc, ax, [0.01 * T, 0.01 * T, 0.01 * T], 1, { id: 6, nu: 12, nv: 8, g: (l) => [l[0], l[1], l[2], 6] }); }
  const top = fy(ctx, land.shY - 0.03) > 0 ? (yc + hy - (L.shY - land.shY)) : land.shY - 0.03;
  // the straps meet the pack's top: in canonical heights (the reference body: its shY matches L.shY up to scale)
  const topC = land.shY - (L.shY - (yc + hy * 0.85)) * (land.H / L.H);
  const out = [{ piece: pieceHelper(ctx, m, { weights: WT.back }), noPattern: true, glsl: bagGLSL(h, { zip: o.zip, stitch: false, extra: `
      if (id > 1.5 && id < 2.5) { col = uSecond; col = mix(col, uTrim, line(P3.y, ${f3(-hy * 0.0)}, 0.003)); }
      ${has(it, 'reflective_dots') ? `col = mix(col, vec3(0.95), circle(vec2(abs(P3.x), P3.y), vec2(${f3(hx * 0.7)}, ${f3(-hy * 0.75)}), 0.006) * step(0.0, P3.z));` : ''}
      ${o.bedroll ? 'if (id > 4.5 && id < 5.5) { col = uAccent; col = mix(col, uTrim, line(abs(P3.y), 0.0, 0.0) * 0.0); col = mix(col, uSecond, band(abs(vG.y), ' + f3(hx * 0.6) + ', ' + f3(hx * 0.68) + ')); }' : ''}
      if (id > 5.5) { col = uAccent; }` }) }];
  void top;
  out.push({ piece: packStraps(ctx, it, topC, o.straps), noPattern: true, glsl: STRAP_PAINT({ col: o.strapCol || 'uSecond' }) });
  if (o.hipBelt) out.push({ piece: shell(ctx, { cover: (V) => (V.limb === 0 ? all(below(V, land.waistY - 0.015), above(V, land.waistY - 0.055), 0.6 - V.arm, V.cz > 0.02 ? 0.06 - Math.abs(V.cx) * 0.0 : 1) : -0.05), off: outerOffHelper(it) + 0.006, fill: 3, rim: 0.004, hides: false }), noPattern: true, glsl: STRAP_PAINT({}) });
  return out;
}
export const backpack = (ctx, it) => backpackHelper(ctx, it, { size: [0.92, 0.62, 0.3], y0: 0.22, pocket: true, zip: true });
export const backpack_frame = (ctx, it) => backpackHelper(ctx, it, { size: [1.0, 0.95, 0.4], y0: 0.0, pocket: true, frame: true, bedroll: has(it, 'bedroll'), carabiner: has(it, 'carabiner'), hipBelt: true, pinch: 0.15, strapCol: 'uTrim * 0.4 + uSecond * 0.6' });
export function drawstring_bag(ctx, it) {
  const out = backpackHelper(ctx, it, { size: [0.85, 0.66, 0.12], y0: 0.25, pinch: 0.35, e: 0.45, straps: { w: 0.008, xf: 0.06, xb: 0.05 }, strapCol: 'uSecond' });
  const L = ctx.A.L, torso = L.shY - L.hipJ;
  if (has(it, 'emblem_ball')) out[0].glsl = out[0].glsl.replace('return col;', `${orbGLSL('P3.xy', `vec2(0.0, ${f3(-torso * 0.03)})`, f3(torso * 0.11), 'step(0.0, P3.z)', 'uAccent', 'uSecond')} return col;`);
  return out;
}

// shoulder bags and totes ------------------------------------------------------------
// a bag hanging under the arm at the side s from a strap over that shoulder (a ribbon over the shoulder's top)
function shoulderBag(ctx, it, o) {
  const L = ctx.A.L, T = T_(ctx), torso = L.shY - L.hipJ, s = o.s ?? -1;
  const hx = torso * o.size[0] / 2, hy = torso * o.size[1] / 2, hz = torso * o.size[2] / 2;
  const off = outerOffHelper(it) + 0.006 * T;
  const y = L.hipJ + torso * o.y;
  const side = sideAt(ctx, s, y, off + hz, -0.01 * T);
  const n = nrm([s, 0, 0.1]), ax = frameHelper(n, [0, 1, 0]), c = side, h = [hx, hy, hz];
  const m = new MeshHelper();
  blob(m, c, ax, h, o.e ?? 0.25, { taper: o.taper, bulge: 0.1 });
  // the strap: from the top front corner, up over the shoulder, down to the top back corner
  const shx = s * (L.sh * 0.32), top = surfHelper(ctx, [shx, L.shY + 0.1 * T, -0.005 * T], [0, 1, 0], outerOffHelper(it) + 0.004 * T, 0.2);
  const fr = surfHelper(ctx, [shx * 0.95, L.shY - 0.03 * T, 0], [0, 0.3, 1], outerOffHelper(it) + 0.004 * T, 0.3), bk = surfHelper(ctx, [shx * 0.95, L.shY - 0.03 * T, -0.01 * T], [0, 0.3, -1], outerOffHelper(it) + 0.004 * T, 0.3);
  const a0 = inFrameHelper(c, ax, [o.handles ? -hx * 0.4 : -hx * 0.8, hy * 0.95, 0]), a1 = inFrameHelper(c, ax, [o.handles ? hx * 0.4 : hx * 0.8, hy * 0.95, 0]);
  const pA = a0[2] > a1[2] ? a0 : a1, pB = a0[2] > a1[2] ? a1 : a0;
  const path = [pA, lerpV(pA, fr, 0.5), fr, top, bk, lerpV(bk, pB, 0.5), pB];
  const sm = new MeshHelper().sweep(path, { prof: 'flat', th: () => [o.strapW * T, 0.0025 * T], up: (i, p) => (i > 1 && i < 5 ? nrm(subV(p, [shx * 0.6, L.shY - 0.05, -0.005])) : ax[0].map((v) => v * -s)), seg: 8, g: (t) => [0, t, 0, 4] });
  const yS = L.shY - 0.06;
  const out = [{ piece: pieceHelper(ctx, m, { weights: () => [['Spine3', 0.1], ['Spine2', 0.25], ['Spine1', 0.65]] }), noPattern: true, glsl: bagGLSL(h, { flap: o.flap, extra: o.paint }) },
    { piece: pieceHelper(ctx, sm, { weights: (p) => { const t = clamp((p[1] - (y + hy)) / (yS - (y + hy))); return [['Spine3', 0.55 * t + 0.1], ['Spine2', 0.25], ['Spine1', 0.65 - 0.55 * t]]; } }), noPattern: true, glsl: STRAP_PAINT({ chain: o.chain, col: o.strapCol }) }];
  return out;
}
export function shoulder_bag(ctx, it) {
  const out = shoulderBag(ctx, it, { size: [0.36, 0.28, 0.12], y: 0.42, flap: 0.45, strapW: 0.004, chain: has(it, 'chain'), e: 0.3,
    paint: has(it, 'bow') ? `col = mix(col, uSecond, step(0.0, P3.z) * circle(vec2(abs(P3.x) * 1.4 - 0.012, P3.y - 0.01), vec2(0.0), 0.012)); col = mix(col, uSecond, step(0.0, P3.z) * circle(P3.xy, vec2(0.0, 0.01), 0.006));` : '' });
  return out;
}
export function tote(ctx, it) {
  const pt = it.pattern || {};
  const stripes = pt.type === 'stripes_h' ? 'col = mix(col, uSecond, step(P3.y, 0.0) * stripes(P3.y, 0.04, 0.012));' : '';
  return shoulderBag(ctx, it, { size: [0.62, 0.55, 0.12], y: 0.16, handles: true, strapW: 0.011, e: 0.2, taper: 1.1, strapCol: 'uMain',
    paint: `${stripes} col = mix(col, uAccent, step(0.0, P3.z) * circle(P3.xy, vec2(0.0, 0.02), 0.0) );` });
}

// belt bags --------------------------------------------------------------------------
function beltShell(ctx, it, y0, y1, extra = 0.006) {
  return shell(ctx, { cover: (V) => (V.limb === 0 || (V.limb === 2 && V.s < 0.08)) ? all(below(V, y1), above(V, y0), 0.6 - V.arm) : -0.05, off: Math.max(it.off * 0.6, 0.012) + extra, fill: 3, rim: 0.003, hides: false });
}
export function fanny_pack(ctx, it) {
  const L = ctx.A.L, land = ctx.land, T = T_(ctx), torso = L.shY - L.hipJ;
  const y0 = land.waistY - 0.045, y1 = land.waistY - 0.022;
  const out = [{ piece: beltShell(ctx, it, y0, y1), noPattern: true, glsl: STRAP_PAINT({ col: 'uMain * 0.6 + uTrim * 0.1' }) }];
  const hx = torso * 0.3, hy = torso * 0.13, hz = torso * 0.09;
  const yy = fy(ctx, (y0 + y1) / 2) - hy * 0.2, p = frontAt(ctx, yy, Math.max(it.off * 0.6, 0.012) + 0.006 + hz * 0.9);
  const ax = frameHelper([0, -0.1, 1], [0, 1, 0]), m = new MeshHelper(), h = [hx, hy, hz];
  // a crescent: bent round the belly by tapering the depth at the ends
  blob(m, p, ax, h, 0.4, { bulge: 0.25 });
  if (has(it, 'buckle')) { const bp = frontAt(ctx, fy(ctx, (y0 + y1) / 2), Math.max(it.off * 0.6, 0.012) + 0.008, -L.waistW * 0.48); m.slab(bp, frameHelper(nrm([-0.6, 0, 1]), [0, 1, 0]), [[-0.014 * T, -0.012 * T], [0.014 * T, -0.012 * T], [0.014 * T, 0.012 * T], [-0.014 * T, 0.012 * T]], 0.006 * T, { g: (l) => [l[0], l[1], l[2], 3] }); }
  out.push({ piece: pieceHelper(ctx, m, { weights: WT.hips }), noPattern: true, glsl: bagGLSL(h, { zip: true, extra: `col = mix(col, uSecond, step(0.0, P3.z) * band(P3.y, ${f3(-hy * 0.2)}, ${f3(hy * 0.05)}));
      ${has(it, 'zip_pulls') ? `col = mix(col, uAccent, step(0.0, P3.z) * box2(P3.xy, vec2(${f3(hx * 0.5)}, ${f3(hy * 0.55)}), vec2(0.004, 0.009), 0.002));` : ''}` }) });
  return out;
}
// the trainer's belt: a belt with clips holding our Snap-Orbs and a small snap pouch at the hip
export function belt_pouch(ctx, it) {
  const L = ctx.A.L, land = ctx.land, T = T_(ctx), torso = L.shY - L.hipJ;
  const y1 = land.waistY - 0.014, y0 = y1 - 0.03;
  const out = [{ piece: beltShell(ctx, it, y0, y1, 0.004), noPattern: true, glsl: `vec3 col = uMain; col = mix(col, uTrim, dashes(vG.x, vG.y, ${f3(y1 - 0.005)}, 0.0011, 0.006, 0.0035) + dashes(vG.x, vG.y, ${f3(y0 + 0.005)}, 0.0011, 0.006, 0.0035)); return col;` }];
  const yy = fy(ctx, (y0 + y1) / 2), offB = Math.max(it.off * 0.6, 0.012) + 0.006;
  const m = new MeshHelper();
  // the pouch on the right hip
  const hx = torso * 0.13, hy = torso * 0.14, hz = torso * 0.06;
  const sp = sideAt(ctx, -1, yy - hy * 0.55, offB + hz, 0.0), n = nrm([-1, 0, 0.35]), ax = frameHelper(n, [0, 1, 0]);
  blob(m, addV(sp, n, 0.002 * T), ax, [hx, hy, hz], 0.25, { bulge: 0.15, g: (l) => [l[0], l[1], l[2], 0] });
  // orbs: four on clips along the left front of the belt
  const r = 0.017 * T;
  const orbs = new MeshHelper();
  for (let k = 0; k < 4; k++) {
    const x = L.waistW * (0.12 + 0.13 * k);
    const bp = frontAt(ctx, yy, offB + 0.004 * T + r, x), bn = nrm([x / (L.waistW * 0.5) * 0.9, 0, 1]);
    const c = addV(bp, bn, 0.0), fr = frameHelper(bn, [0, 1, 0]);
    blob(orbs, c, fr, [r, r, r], 1, { nu: 16, nv: 12, g: (l) => [l[0], l[1], l[2], 7] });
    orbs.slab(addV(bp, bn, -r * 0.9), fr, [[-r * 0.5, -r * 0.2], [r * 0.5, -r * 0.2], [r * 0.5, r * 1.1], [-r * 0.5, r * 1.1]], 0.003 * T, { g: (l) => [l[0], l[1], l[2], 3] });
  }
  out.push({ piece: pieceHelper(ctx, m, { weights: WT.hips }), noPattern: true, glsl: bagGLSL([hx, hy, hz], { flap: 0.5, flapCol: 'uMain * 0.85', extra: `col = mix(col, uTrim, step(0.0, P3.z) * circle(P3.xy, vec2(0.0, ${f3(hy * 0.05)}), 0.004));` }) });
  out.push({ piece: pieceHelper(ctx, orbs, { weights: WT.hips }), noPattern: true, glsl: `float id = floor(vG.w + 0.5); vec3 col = uTrim; if (id > 6.5) { vec2 q = vG.xy; col = q.y > 0.0 ? uSecond : vec3(0.96); col = mix(col, vec3(0.12), line(q.y, 0.0, ${f3(r * 0.16)})); col = mix(col, vec3(0.12), circle(q, vec2(0.0), ${f3(r * 0.32)}) * step(0.0, vG.z)); col = mix(col, vec3(0.96), circle(q, vec2(0.0), ${f3(r * 0.2)}) * step(0.0, vG.z)); col = mix(col, vec3(1.0), smoothstep(${f3(r * 0.35)}, 0.0, length(q - vec2(${f3(-r * 0.4)}, ${f3(r * 0.45)}))) * 0.6); } return col;` });
  return out;
}

// carried bags -------------------------------------------------------------------------
// the forearm near the elbow (side s): a point on it and its axis
function forearm(ctx, s, t) {
  const S = s > 0 ? 'L' : 'R', e = jointPos(ctx, S + 'ForeArm'), w = jointPos(ctx, S + 'Hand');
  return { p: lerpV(e, w, t), ax: nrm(subV(w, e)), bone: S + 'ForeArm', S };
}
// a handbag hanging from the left forearm (just below the elbow)
export function handbag(ctx, it) {
  const L = ctx.A.L, T = T_(ctx), torso = L.shY - L.hipJ, F = forearm(ctx, 1, 0.3);
  const hx = torso * 0.2, hy = torso * 0.15, hz = torso * 0.07;
  const R = 0.024 * T * (L.H / 1.7 < 0.8 ? 0.9 : 1) + 0.02;
  const out = hangFrom(ctx, it, F, [hx, hy, hz], { e: 0.25, taper: 0.85, flap: 0.5, clearance: R, handle: 0.0045 });
  return out;
}
// a basket on the right forearm: a wicker tub, a cloth on top, an arched handle
export function basket(ctx, it) {
  const L = ctx.A.L, T = T_(ctx), torso = L.shY - L.hipJ, F = forearm(ctx, -1, 0.4);
  return hangFrom(ctx, it, F, [torso * 0.26, torso * 0.17, torso * 0.17], { e: 0.45, taper: 1.15, clearance: 0.03 * T, handle: 0.006, basket: true });
}
// a bag hung from a forearm: the handle loops over the arm, the bag below it (straight down in the A pose)
function hangFrom(ctx, it, F, h, o) {
  const T = T_(ctx), m = new MeshHelper();
  const down = [0, -1, 0], side = nrm(cross(F.ax, down)), across = nrm(cross(down, side));
  // the bag's frame: x along the forearm's horizontal direction, z out to the side
  const fx = nrm([F.ax[0], 0, F.ax[2]]), ax = frameHelper(nrm(cross(fx, [0, 1, 0])), [0, 1, 0]);
  const top = addV(F.p, down, o.clearance + h[1] * 0.35), c = addV(top, down, h[1]);
  blob(m, c, ax, h, o.e, { taper: o.taper, g: (l) => [l[0], l[1], l[2], 0] });
  // the handle: an arch from the bag's top over the forearm
  const a0 = inFrameHelper(c, ax, [-h[0] * 0.55, h[1] * 0.9, 0]), a1 = inFrameHelper(c, ax, [h[0] * 0.55, h[1] * 0.9, 0]);
  const over = addV(F.p, [0, 1, 0], o.clearance * 0.45);
  const path = [a0, lerpV(a0, addV(over, ax[0], -h[0] * 0.25), 0.6), addV(over, ax[0], -h[0] * 0.15), addV(over, ax[0], h[0] * 0.15), lerpV(a1, addV(over, ax[0], h[0] * 0.25), 0.6), a1];
  m.sweep(path, { r: o.handle * T, seg: 8, g: () => [0, 0, 0, 4] });
  if (o.basket) {
    // the cloth: a puffed cap over the top
    blob(m, inFrameHelper(c, ax, [0, h[1] * 0.95, 0]), ax, [h[0] * 0.95, h[1] * 0.2, h[2] * 0.95], 0.6, { g: (l) => [l[0], l[1], l[2], 5] });
  }
  void across;
  const glsl = o.basket ? `float id = floor(vG.w + 0.5); vec3 P3 = vG.xyz; vec3 col = uMain;
      float w = stripes(atan(P3.z, P3.x) * 0.05 + P3.y * 0.0, 0.012, 0.006); float r = stripes(P3.y, 0.012, 0.006);
      col = mix(uMain, uSecond, abs(w - r)); col = mix(col, uTrim, line(P3.y, ${f3(h[1] * 0.85)}, 0.005));
      if (id > 3.5 && id < 4.5) col = uSecond * 0.9;
      if (id > 4.5) { col = mix(uAccent, vec3(0.96), gingham(P3.xz, 0.012)); }
      return col;`
    : bagGLSL(h, { flap: o.flap, extra: `col = mix(col, uTrim, step(0.0, P3.z) * box2(P3.xy, vec2(0.0, ${f3(h[1] * 0.0)}), vec2(0.007, 0.005), 0.002));` });
  return [{ piece: pieceHelper(ctx, m, { bone: F.bone }), noPattern: true, glsl }];
}
// a briefcase in the right hand: the handle in the hand, the case below it
export function briefcase(ctx, it) {
  const L = ctx.A.L, T = T_(ctx), torso = L.shY - L.hipJ;
  const hand = jointPos(ctx, 'RHand'), k1 = jointPos(ctx, 'RFingerC1'), grip = lerpV(hand, k1, 0.75);
  const hx = torso * 0.42, hy = torso * 0.3, hz = torso * 0.07;
  const fx = nrm([k1[0] - hand[0], 0, k1[2] - hand[2]]);
  // the case stands edge-on beside the leg: its faces look out sideways
  const ax = frameHelper([-1, 0, 0], [0, 1, 0]);
  const c = addV(grip, [0, -1, 0], hy + 0.035 * T);
  const m = new MeshHelper(), h = [hx, hy, hz];
  blob(m, c, ax, h, 0.14, { g: (l) => [l[0], l[1], l[2], 0] });
  const a0 = inFrameHelper(c, ax, [-hx * 0.25, hy, 0]), a1 = inFrameHelper(c, ax, [hx * 0.25, hy, 0]);
  m.sweep([a0, addV(a0, [0, 0.03 * T, 0]), addV(a1, [0, 0.03 * T, 0]), a1], { r: 0.006 * T, seg: 8, g: () => [0, 0, 0, 4] });
  for (const k of [-1, 1]) { const p = inFrameHelper(c, ax, [k * hx * 0.6, hy * 0.82, hz + 0.002]); m.slab(p, ax, [[-0.012 * T, -0.008 * T], [0.012 * T, -0.008 * T], [0.012 * T, 0.008 * T], [-0.012 * T, 0.008 * T]], 0.004 * T, { g: (l) => [l[0], l[1], l[2], 3] }); }
  void fx;
  return [{ piece: pieceHelper(ctx, m, { bone: 'RHand' }), noPattern: true, glsl: bagGLSL(h, { stitch: true, extra: `col = mix(col, uSecond, step(abs(P3.z), ${f3(hz * 0.18)})); if (id > 3.5 && id < 4.5) col = uMain * 0.7;` }).replace('if (id > 2.5 && id < 3.5) col = uTrim;', 'if (id > 2.5 && id < 3.5) col = uAccent;') }];
}
