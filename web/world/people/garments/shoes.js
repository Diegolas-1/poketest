// Shoes and boots: every archetype of the catalogue's "shoes" slot, from sneakers and
// school shoes to rain boots, riding boots, clogs, sandals, slippers and roller skates.
//
// A shoe is a solid (wear.js) made from a field (sdf.js) round the left foot, then
// mirrored for the right one (bodies are symmetric; this halves the cost). The foot is
// measured from the fitted body first (footHelper: its length, width, height along it
// and how it splays), so a shoe fits a toddler and a giant alike, a little bigger than
// the foot (X/Y style: round chunky toes, soles about a quarter of the shoe's height).
// It is built in the foot's own frame (u across, + to the outside; y up; w along the
// foot from the back of the shoe), in parts:
//   sole       a slab round the footprint (a tapered capsule), rounded at the edges;
//   upper      the footprint a little narrower, walled straight up and domed over to a
//              height that follows the measured foot (plus a margin, so nothing pokes
//              out), up to the collar at the back and to a round toe box in front;
//   collar     a cone up round the ankle, or for boots a shaft of cones round the leg,
//              measured ring by ring (legRingHelper) and standing clear of it;
//   heel       a block under the back for heeled shoes (low and walkable), the upper
//              lifted over it and an arch under the middle;
//   opening    low-cut shoes (pumps, flats, loafers, clogs, sandals) are cut in plan by an
//              oval from the heel to the vamp, down to a height dipping along the sides;
//              the cut face is painted as the lining and the instep shows.
// Laces, eyelets, toe caps, saddles, stitching, emblems, gores, the lining and treads are
// painted in the shader in the same frame (the piece's gco: u, y, w), so they are crisp.
// Straps, buckles, bows, wheels, ears, fur and pull loops are small solids of their own
// with their own paint.
//
// Weights: the back and middle of the shoe follow the Foot bone, the front the Toe bone
// (blended over the ball of the foot so the shoe bends there without tearing), the
// collar and shafts the Leg (shin) bone, blended over the ankle. The body under a shoe
// is hidden (piece.hide): what is inside it, and the foot below the collar for closed
// shoes, so toes never poke through. Builders leave ctx.shoeFit { top, clear, tuck } for
// bottoms.js: trousers drape over low shoes and ankle boots and tuck into tall boots.
import { jointPos, shell } from '../wear.js';
import { P, smin, union, inter, sub, moved, compile, field } from '../sdf.js';
import { surfaceNets, project, relax, decimate, normals, smoothNormals } from '../mesh.js';
import { BONE, BONE_NAMES } from '../rig.js';
import { clamp, sstep } from '../vmath.js';
import { LEG } from './common.js';
import { patternGLSL } from './patterns.js';

const f3 = (x) => (+x).toFixed(4);
const has = (it, d) => (it.params.details || []).includes(d);
const Q90X = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];   // turns a leaf's y axis onto z (torus rings round the foot)
const Q90Z = [0, 0, Math.SQRT1_2, Math.SQRT1_2];   // turns y onto -x (cylinders across the foot: wheels)
// left bone -> right bone, for mirroring
const MIRROR_BONE = BONE_NAMES.map((n, i) => (/^L[A-Z]/.test(n) ? BONE['R' + n.slice(1)] : /^R[A-Z]/.test(n) ? BONE['L' + n.slice(1)] : i));

// ---------- measuring ----------
// the left foot: length, width and height along it, how it splays, in the foot's frame
export function footHelper(ctx) {
  if (ctx._footM) return ctx._footM;
  const B = ctx.body, Pp = B.pos, ank = jointPos(ctx, 'LFoot'), toe = jointPos(ctx, 'LToe'), L = ctx.A.L;
  const ids = [];
  let z0 = 1e9, z1 = -1e9;
  for (let v = 0; v < ctx.n; v++) {
    if (B.part[4 * v] !== 2 || B.part[4 * v + 2] < 0 || Pp[3 * v + 1] > ank[1] + 0.012) continue;
    ids.push(v); z0 = Math.min(z0, Pp[3 * v + 2]); z1 = Math.max(z1, Pp[3 * v + 2]);
  }
  const NB = 12, fl = z1 - z0, bins = Array.from({ length: NB }, () => [1e9, -1e9, 0]);
  for (const v of ids) {
    const k = clamp(Math.floor((Pp[3 * v + 2] - z0) / fl * NB), 0, NB - 1), b = bins[k], x = Pp[3 * v];
    b[0] = Math.min(b[0], x); b[1] = Math.max(b[1], x); b[2] = Math.max(b[2], Pp[3 * v + 1]);
  }
  const cen = (a, b) => { let s = 0; for (let k = a; k <= b; k++) s += (bins[k][0] + bins[k][1]) / 2; return s / (b - a + 1); };
  const cx0 = cen(1, 3), cx1 = cen(7, 9), zc0 = z0 + 2.5 / NB * fl, a = Math.atan2(cx1 - cx0, 6 / NB * fl);
  const S = fl / 0.297, bm = 0.03 * fl;
  // the frame: origin on the foot's axis at the back of the shoe, w along the foot
  const ow = z0 - bm, O = [cx0 + Math.tan(a) * (ow - zc0), 0, ow];
  const ca = Math.cos(a), sa = Math.sin(a);
  const toLocal = (p) => { const x = p[0] - O[0], z = p[2] - O[2]; return [x * ca - z * sa, p[1], x * sa + z * ca]; };
  const m = new Float64Array([ca, 0, -sa, 0, 0, 1, 0, 0, sa, 0, ca, 0, O[0], 0, O[2], 1]);   // local -> world
  const inv = new Float64Array([ca, 0, sa, 0, 0, 1, 0, 0, -sa, 0, ca, 0, 0, 0, 0, 1]);
  inv[12] = -(ca * O[0] - sa * O[2]); inv[14] = -(sa * O[0] + ca * O[2]);
  // per bin: centre across, half width and top, in the frame
  const prof = bins.map((b, k) => {
    const wz = z0 + (k + 0.5) / NB * fl, c = toLocal([(b[0] + b[1]) / 2, 0, wz]);
    return { u: c[0], w: c[2], hw: (b[1] - b[0]) / 2, top: b[2] };
  });
  const fw = Math.max(...prof.map((p) => p.hw)) * 2;
  return (ctx._footM = { fl, fw, S, bm, prof, m, inv, toLocal, ank, toe, L, ankL: toLocal(ank), toeL: toLocal(toe) });
}
// the left leg's cross-section at a height (A pose): centre and radius, in the foot frame
export function legRingHelper(ctx, y) {
  const F = footHelper(ctx), key = Math.round(y * 500);
  F.rings = F.rings || new Map();
  if (F.rings.has(key)) return F.rings.get(key);
  const B = ctx.body, Pp = B.pos;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, n = 0;
  for (let v = 0; v < ctx.n; v++) {
    if (B.part[4 * v] !== 2 || B.part[4 * v + 2] < 0 || Math.abs(Pp[3 * v + 1] - y) > 0.007) continue;
    if (B.share[4 * v + 3] > 0.6 && y > F.ank[1] + 0.02) continue;
    const x = Pp[3 * v], z = Pp[3 * v + 2];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); n++;
  }
  const r = n ? { c: F.toLocal([(x0 + x1) / 2, y, (z0 + z1) / 2]), r: Math.max(x1 - x0, z1 - z0) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 } : { c: F.toLocal(F.ank), r: 0.03 * F.S, rx: 0.03, rz: 0.03 };
  F.rings.set(key, r);
  return r;
}
// a height on the leg from a length word (LEG: s from the hip)
export function legHeightHelper(ctx, word) { const L = ctx.A.L, s = LEG[word] ?? word; return L.hipJ - s * (L.hipJ - L.ankleY); }

// ---------- the shoe ----------
// a tapered capsule in the ground plane (the footprint): circles r1 at (0, w1) and r2 at (u2, w2); signed distance
function capsule2(u, w, r1, w1, r2, u2, w2) {
  const ax = u2, az = w2 - w1, h = Math.hypot(ax, az), cx = az / h, sx = ax / h;
  // into the capsule's frame: y along it from the heel circle
  const px = Math.abs(u * cx - (w - w1) * sx), py = u * sx + (w - w1) * cx;
  const bb = (r1 - r2) / h, aa = Math.sqrt(1 - bb * bb), k = -bb * px + aa * py;
  if (k < 0) return Math.hypot(px, py) - r1;
  if (k > aa * h) return Math.hypot(px, py - h) - r2;
  return aa * px + bb * py - r1;
}
// spec (lengths in metres for an adult foot, scaled with it): sole (share of the foot's length), soleOut,
// toeLen (share), toeH, toeNarrow, collar (top above the ankle joint) | shaft (height, world) + clear + flare + shaftK,
// heel (height), heelThin, cut: { side, back, backW, start, vampW, wall, backless } (a low-cut opening),
// puff (a rounder, softer upper), dome, round, lift (raise the whole shoe: skates)
export function lastTree(ctx, spec) {
  const F = footHelper(ctx), S = F.S, fl = F.fl, prof = F.prof;
  const puff = (spec.puff || 0) * S;
  const Ls = fl * (1 + 0.03 + (spec.toeLen ?? 0.04)), W = F.fw * 1.04 + 0.008 * S + puff * 2;
  const lift = spec.lift || 0, hS = fl * (spec.sole ?? 0.08), so = (spec.soleOut ?? 0.0032) * S, heel = (spec.heel || 0) * S;
  const base = lift + hS;
  const rH = Math.max(0.42 * W, Math.max(prof[0].hw, prof[1].hw, prof[2].hw) + 0.005 * S + puff), rT = 0.5 * W * (spec.toeNarrow ?? 1);
  const wH = F.bm + rH, wT = Ls - rT, uT = Math.max(0, (prof[9].u + prof[10].u) / 2) * 0.8;
  const ank = F.ankL;
  const toeTop0 = (prof[9].top + prof[10].top + prof[11].top) / 3 + lift;
  const toeTop = toeTop0 + (spec.toeH ?? 0.014) * S + puff;
  const shaftTop = spec.shaft ?? 0, cY = shaftTop || (ank[1] + (spec.collar ?? 0.014) * S + lift);
  const clear = (spec.clear ?? 0.005) * S, m = ((spec.margin ?? 0.007) * S + puff);
  const ring0 = legRingHelper(ctx, Math.min(cY, ank[1] + 0.03 * S));
  const collarR = ring0.r + clear;
  // the height of the upper along the foot: the measured foot (and the leg at the ankle) plus a margin, the heel
  // counter up to the collar, the toe box at its own height; rounded across (a dome)
  const NBp = 24, hw = new Float64Array(NBp + 1), ht = new Float64Array(NBp + 1);
  const topAt = (w) => { const x = clamp((w - F.bm) / fl * 12 - 0.5, 0, 11), i = Math.min(10, Math.floor(x)), t = x - i; return prof[i].top * (1 - t) + prof[i + 1].top * t + lift; };
  const collarTop = Math.min(cY, ank[1] + 0.04 * S + lift), legW = ring0.c[2] + collarR * 0.5;
  for (let i = 0; i <= NBp; i++) {
    const w = i / NBp * Ls;
    let h = topAt(w) + m;
    h = Math.max(h, collarTop - (collarTop - toeTop) * sstep(Ls * 0.3, Ls * 0.62, w) - 0.004 * S);
    if (w > Ls * 0.62) h = Math.max(h, toeTop);
    // in front of the leg the instep falls away from the collar
    ht[i] = Math.max(Math.min(h, collarTop - Math.max(0, w - legW) * (spec.instep ?? 0.3)), Math.min(topAt(w) + m * 0.75, collarTop));
  }
  for (let it = 0; it < 2; it++) for (let i = 1; i < NBp; i++) ht[i] = Math.max(ht[i], (ht[i - 1] + 2 * ht[i] + ht[i + 1]) / 4);
  const hAt = (w) => { const x = clamp(w / Ls * NBp, 0, NBp - 0.001), i = Math.floor(x), t = x - i; return ht[i] * (1 - t) + ht[i + 1] * t; };
  // the dome is steeper at the back: the collar falls away from the leg to the sides
  const dome0 = spec.dome ?? 0.3, rr = (spec.round ?? 0.016) * S + puff;
  const prism = (u, y, w) => {
    const d2 = capsule2(u, w, rH, wH, rT, uT, wT);
    const h = hAt(w), half = Math.max(rT, 0.02), ac = (u - uT * clamp((w - wH) / (wT - wH))) / half;
    const dome = dome0 + (spec.shaft ? 0 : 0.35) * sstep(Ls * 0.45, Ls * 0.2, w);
    const top = y - (h - dome * (h - base) * 0.5 * ac * ac);
    // rounded where the walls meet the top
    const a = d2, b = top * 0.85;
    const e = Math.max(a, b);
    if (a > -rr && b > -rr) { const qa = a + rr, qb = b + rr; return Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) - rr + Math.min(Math.max(qa, qb), 0) * 0; }
    return Math.max(e, lift + 0.0005 - y);
  };
  const box = [[-W, lift - 0.01, -0.02], [W + Math.abs(uT), cY + 0.02, Ls + 0.02]];
  const comps = [field(prism, box)];
  // the collar round the ankle (a low shoe's opening is its flat top)
  if (!spec.backless) comps.push(P.rcone({ a: [ring0.c[0] * 0.6, base + heel, wH], b: [ring0.c[0], Math.min(cY, ank[1] + 0.03 * S), ring0.c[2]], ra: rH * 0.92, rb: collarR }));
  let shaftInfo = null;
  if (shaftTop) {
    // the shaft: rings up the leg, each clear of it, flaring at the top
    const y0 = ank[1] + 0.02 * S, n = Math.max(2, Math.ceil((shaftTop - y0) / (0.05 * S)));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const y = y0 + (shaftTop - y0) * (i / n) + (i === n ? 0.01 * S : 0), rg = legRingHelper(ctx, Math.min(y, shaftTop - 0.004));
      const t = i / n, r = rg.r + clear + (spec.flare || 0) * S * Math.pow(t, 2.5) + (spec.shaftK || 0) * S * Math.sin(Math.PI * t);
      const cur = { c: [rg.c[0], y, rg.c[2]], r };
      if (prev) comps.push(P.rcone({ a: prev.c, b: cur.c, ra: prev.r, rb: cur.r }));
      prev = cur;
    }
    shaftInfo = { top: shaftTop, r: prev.r };
  }
  let upper = comps.length > 1 ? smin(0.012 * S, ...comps) : comps[0];
  // keep it above the sole (rising over a heel: the arch) and below the top
  if (heel) {
    const wa = Ls * 0.52, wb = Ls * 0.3, ya = base * 0.55, yb = base + heel;
    upper = inter(upper, field((u, y, w) => ((w > wa ? ya : w < wb ? yb : ya + (yb - ya) * sstep(wa, wb, w)) - y) * 0.6, box));
  } else upper = inter(upper, P.plane({ p: [0, lift + hS * 0.5, 0], n: [0, -1, 0] }));
  upper = inter(upper, P.plane({ p: [0, cY, 0], n: [0, 1, 0] }));
  // the sole: the footprint a little wider, a slab with rounded edges (forefoot only under a heel)
  const sk = Math.min(hS * 0.35, 0.004 * S);
  let sole = field((u, y, w) => {
    const d2 = capsule2(u, w, rH + so, wH, rT + so, uT, wT), dy = Math.max(y - base, lift - y);
    const qa = d2 + sk, qb = dy + sk;
    return Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0) - sk;
  }, box);
  if (heel) {
    sole = inter(sole, P.plane({ p: [0, 0, Ls * 0.5], n: [0, 0, -1] }));
    const hb = P.rcone({ a: [0, lift + 0.002, wH * 0.95], b: [0, base + heel, wH * 0.9], ra: rH * (spec.heelThin ?? 0.62), rb: rH * 0.86 });
    sole = union(sole, inter(hb, P.plane({ p: [0, lift, 0], n: [0, -1, 0] })));
  }
  let shoe = union(sole, upper);
  // a low-cut opening: in plan an oval from behind the heel to the vamp, a little narrower than the shoe (its
  // walls), cut down to a height that dips along the sides and rises round the heel
  let opening = null, cut = null;
  if (spec.cut) {
    const c = spec.cut, sideH = base + (c.side ?? 0.5) * (Math.max(prof[5].top, prof[6].top) + lift - base), backY = base + heel + (c.back ?? 0.75) * (ank[1] + lift - base) + (c.backAdd || 0) * S;
    const wS = (c.backless ? -0.2 : c.start ?? 0.035) * Ls, wV = (c.vampW ?? 0.62) * Ls, w0 = (wS + wV) / 2, aw = (wV - wS) / 2, au = W / 2 - (c.wall ?? 0.0045) * S, wb = (c.backW ?? 0.3) * Ls;
    const hCut = (w) => sideH + (c.backless ? (w < wb ? base + 0.004 * S - sideH : 0) : (backY - sideH) * sstep(wb, 0, w)) + (toeTop + 0.012 * S - sideH) * sstep(wV - 0.2 * Ls, wV, w);
    const ell = (u, w) => (Math.hypot(u / au, (w - w0) / aw) - 1) * Math.min(au, aw);
    opening = field((u, y, w) => Math.max(ell(u, w), (hCut(w) - y) * 0.8), box);
    shoe = sub(0.003 * S, shoe, opening);
    // for hiding: < 0 where the foot is under the shoe (outside the opening, or below its cut)
    cut = { sideH, backY, c, f: (u, y, w) => (ell(u, w) > -0.002 * S ? -1 : y - hCut(w)) };
  }
  return { legW: ring0.c[2], shoe, sole, upper, opening, cut, cutF: cut ? cut.f : null, Ls, W, hS, base, heel, cY, toeTop, wH, wT, rH, rT, uT, shaft: shaftInfo, collarR, clear, F, S, lift, hAt };
}

// weights: Foot, Toe in front of the ball (blended), Leg above the ankle (blended)
function weightsHelper(ctx, F, o = {}) {
  const tz = F.toe[2], ay = F.ank[1], S = F.S, lift = o.lift || 0;
  return (q) => {
    const wl = sstep(ay + lift + (o.legFrom ?? 0.012) * S, ay + lift + (o.legTo ?? 0.06) * S, q[1]);
    const wt = (1 - wl) * sstep(tz - 0.012 * S, tz + 0.016 * S, q[2]) * (o.toe ?? 1);
    return [['LFoot', 1 - wl - wt], ['LToe', wt], ['LLeg', wl]];
  };
}
// the right shoe from the left: mirrored across x, its bones swapped
function mirrorPiece(pc) {
  const m = pc.mesh, n = m.pos.length / 3;
  const pos = m.pos.slice(), nrm = m.nrm.slice(), canon = m.canon.slice(), part = m.part.slice(), idx = m.idx.slice();
  for (let v = 0; v < n; v++) { pos[3 * v] = -pos[3 * v]; nrm[3 * v] = -nrm[3 * v]; canon[3 * v] = -canon[3 * v]; part[4 * v + 2] = -part[4 * v + 2]; }
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = a; }
  const skin = m.skin.map((b) => MIRROR_BONE[b]);
  return { mesh: { pos, nrm, idx, skin, wts: m.wts, canon, part, share: m.share, gco: m.gco }, hide: new Uint8Array(pc.hide.length), double: pc.double, layer: pc.layer };
}
// hide the body inside a shoe (both feet): inside the field by a margin and below its top, or
// (closed shoes) the whole foot below the top
function hideHelper(ctx, pcs, tree, o) {
  const c = compile(tree), B = ctx.body, Pp = B.pos, top = o.top - (o.margin ?? 0.01) * o.S;
  for (const [pc, side] of pcs) {
    if (!pc) continue;
    for (let v = 0; v < ctx.n; v++) {
      if (B.part[4 * v] !== 2 || B.part[4 * v + 2] * side < 0) continue;
      const y = Pp[3 * v + 1]; if (y > top) continue;
      const foot = B.share[4 * v + 3] > 0.35 || y < o.ankY, x = Pp[3 * v] * side;
      let h = (o.closed && foot) || c.f(x, y, Pp[3 * v + 2]) < -0.0015 || (foot && y < o.base * 0.7);
      // low-cut shoes: the foot is hidden below the opening, so it cannot show through the walls
      if (!h && o.below && foot) { const l = o.F.toLocal([x, y, Pp[3 * v + 2]]); h = o.below(l[0], l[1], l[2]) < -0.003 * o.S; }
      if (h) pc.hide[v] = 1;
    }
  }
}
// wear.js' solid() made quicker for shoes (and mitts): surface nets on small blocks at a coarser cell, decimated only
// when over the budget (a pair of shoes must build in a few hundred milliseconds)
export function fastSolidHelper(ctx, tree, o) {
  const c = compile(tree);
  let m = surfaceNets(c.f, c.box, o.cell, { B: 4 });
  if (!m.idx.length) return null;
  project(m, c.f, 2);
  if (m.pos.length / 3 > o.verts * 1.5) m = decimate(m, o.verts);
  relax(m, 1, 0.4, c.f);
  const n = m.pos.length / 3, B = ctx.body, F = o.frame;
  const skin = new Uint16Array(n * 4), wts = new Float32Array(n * 4), canon = new Float32Array(n * 3), part = new Float32Array(n * 4), share = new Float32Array(n * 4), gco = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const x = m.pos[3 * v], y = m.pos[3 * v + 1], z = m.pos[3 * v + 2];
    const near = ctx.hash.nearest(x, y, z, 6);
    if (near >= 0) {
      for (let j = 0; j < 3; j++) canon[3 * v + j] = B.canon[3 * near + j] + (m.pos[3 * v + j] - B.pos[3 * near + j]);
      for (let j = 0; j < 4; j++) { part[4 * v + j] = B.part[4 * near + j]; share[4 * v + j] = B.share[4 * near + j]; }
    }
    o.weights([x, y, z]).forEach(([b, w], k) => { skin[4 * v + k] = BONE[b]; wts[4 * v + k] = w; });
    const l = [F[0] * x + F[4] * y + F[8] * z + F[12], F[1] * x + F[5] * y + F[9] * z + F[13], F[2] * x + F[6] * y + F[10] * z + F[14]];
    gco[4 * v] = l[0]; gco[4 * v + 1] = l[1]; gco[4 * v + 2] = l[2]; gco[4 * v + 3] = o.partOf ? o.partOf([x, y, z], l) : 0;
  }
  const mesh = { pos: m.pos, idx: m.idx, skin, wts, canon, part, share, gco };
  mesh.nrm = normals(mesh);
  smoothNormals(mesh, null, 1, 0.5);
  return { mesh, hide: new Uint8Array(ctx.n), double: false, layer: 0 };
}
// a solid of the left shoe in the foot frame (tree in local coords) and its mirror: [left, right, world tree]
function pairHelper(ctx, F, localTree, o = {}) {
  const tree = moved(F.m, localTree);
  const left = fastSolidHelper(ctx, tree, { cell: o.cell ?? 0.0052 * Math.sqrt(Math.max(0.55, F.S)), verts: o.verts ?? 3000, weights: o.weights || weightsHelper(ctx, F, o), frame: F.inv, partOf: o.partOf });
  if (!left) return [];
  return [left, mirrorPiece(left), tree];
}

// ---------- paint ----------
// the frame's numbers for the shader: uP[0] = (Ls, W, sole top, collar top), uP[1] = (toe joint w, laces from, to, toe top),
// uP[2] = (shaft top, heel, base (top of the sole), lift)
function paramsOf(T, o = {}) {
  const F = T.F;
  // laces start in front of the collar round the leg (low shoes) and run at least an eighth of the shoe
  const l0 = T.shaft ? o.l0 ?? T.Ls * 0.42 : Math.max(o.l0 ?? T.Ls * 0.42, T.legW + T.collarR * 0.9), l1 = Math.max(o.l1 ?? T.Ls * 0.7, l0 + 0.14 * T.Ls);
  return [[T.Ls, T.W, T.base, T.cY], [F.toeL[2], l0, l1, T.toeTop], [T.collarR, T.heel, T.legW, T.lift], [T.F.S, T.F.ankL[1], T.cut ? T.cut.sideH : 0, T.cut ? T.cut.backY : 0]];
}
// the shared start of every shoe's paint
const PRE = `vec3 q = vG.xyz; float Ls = uP[0].x, W = uP[0].y, hS = uP[0].z, cY = uP[0].w, tz = uP[1].x, l0 = uP[1].y, l1 = uP[1].z, toeTop = uP[1].w;
  float sT = uP[0].w, cR = uP[2].x, legW = uP[2].z, heel = uP[2].y, lift = uP[2].w, S = uP[3].x, ankY = uP[3].y, sideH = uP[3].z, backY = uP[3].w, nz = q.z / Ls, au = abs(q.x);
  vec3 col = uMain; vec2 P = vec2(q.z, q.y + au * 0.6);`;
// the lining: the top face of a collar or shaft, or the face of a low-cut opening (the same surface as lastTree's)
function liningGLSL(cut) {
  if (!cut) return 'float lin = aa(cY - 0.0016 * S - q.y) * aa(length(vec2(q.x, q.z - legW)) - cR - 0.003 * S);';
  const wS = cut.backless ? -0.2 : cut.start ?? 0.035, wV = cut.vampW ?? 0.62, wb = cut.backW ?? 0.3;
  const back = cut.backless ? `(q.z < ${f3(wb)} * Ls ? hS + 0.004 * S - sideH : 0.0)` : `(backY - sideH) * (1.0 - smoothstep(0.0, ${f3(wb)} * Ls, q.z))`;
  return `float ou = W * 0.5 - ${f3(cut.wall ?? 0.0045)} * S, ow = ${f3((wV - wS) / 2)} * Ls, ow0 = ${f3((wS + wV) / 2)} * Ls;
    float ell = (length(vec2(q.x / ou, (q.z - ow0) / ow)) - 1.0) * min(ou, ow);
    float cutH = sideH + ${back} + (toeTop + 0.012 * S - sideH) * smoothstep(${f3(wV - 0.2)} * Ls, ${f3(wV)} * Ls, q.z);
    float lin = max(aa(ell - 0.0015 * S) * aa(cutH - 0.0016 * S - q.y), aa(cY - 0.0016 * S - q.y) * aa(length(vec2(q.x, q.z - legW)) - cR - 0.003 * S));`;
}
// pieces of paint, put together per archetype. o: { sole: role, soleLine, tread, toeCap: role, laces: role,
// eyelets, tongue, heelTab: role, emblem, stripe: role, velcro, mesh, dots, gore, saddle: role, apron, penny,
// lining: role, welt: role, zip, pattern }
export function shoePaintHelper(o = {}) {
  const out = [PRE, liningGLSL(o.cut)];
  if (o.pattern) out.push(o.pattern);

  if (o.toeCap) out.push(`{ float tc = smoothstep(-0.002, 0.002, q.z - (Ls * ${f3(o.toeCapAt ?? 0.78)} + q.x * q.x / W * 1.6));
    col = mix(col, ${o.toeCap}, tc * step(hS, q.y));
    col = mix(col, col * 0.62, line(q.z - (Ls * ${f3(o.toeCapAt ?? 0.78)} + q.x * q.x / W * 1.6), 0.0, 0.0022 * S) * step(hS, q.y)); }`);
  if (o.saddle) out.push(`{ float sd = band(q.z - q.x * q.x / W * 0.8, Ls * 0.36, Ls * 0.64) * step(hS, q.y);
    col = mix(col, ${o.saddle}, sd); col = mix(col, col * 0.6, sd * (line(q.z - q.x * q.x / W * 0.8, Ls * 0.365, 0.002 * S) + line(q.z - q.x * q.x / W * 0.8, Ls * 0.635, 0.002 * S))); }`);
  if (o.mesh) out.push(`col = mix(col, ${o.mesh}, dotsHex(vec2(q.z, q.y + au), 0.006 * S, 0.0014 * S) * step(Ls * 0.62, q.z) * step(hS + 0.004 * S, q.y) * 0.6);`);
  if (o.stripe) out.push(`{ float y0 = hS + (cY - hS) * 0.28; float d = abs(q.y - y0 - (q.z - Ls * 0.25) * 0.28) - (0.005 + 0.003 * smoothstep(Ls * 0.6, Ls * 0.25, q.z)) * S;
    col = mix(col, ${o.stripe}, aa(d) * band(q.z, Ls * 0.18, Ls * 0.62) * step(0.3 * W, au)); }`);
  if (o.emblem) out.push(`{ vec2 e = vec2(q.z, q.y); vec2 c = vec2(Ls * 0.3, hS + (cY - hS) * 0.42); float r = 0.012 * S;
    float o = orb(e, c, r) * step(0.3 * W, q.x);
    col = o > 0.5 ? (o < 1.5 ? uAccent : o < 2.5 ? vec3(0.13) : o < 3.5 ? vec3(0.96) : vec3(0.96)) : col; }`);
  // an elastic gore up each side of the ankle (chelsea boots), widening to the top
  if (o.gore) out.push(`{ float g = aa(abs(q.z - Ls * 0.26) - (0.012 * S) * smoothstep(ankY - 0.01 * S, cY, q.y)) * step(0.32 * W, au) * step(ankY - 0.01 * S, q.y);
    col = mix(col, ${o.gore}, g); col = mix(col, col * 0.75, g * stripes(q.y, 0.0035 * S, 0.0012 * S)); }`);
  if (o.apron) out.push(`{ float d = length(vec2(q.x / (W * 0.36), (q.z - Ls * 0.78) / (Ls * 0.24))) - 1.0;
    col = mix(col, mix(col, uAccent, 0.5), dashes(q.z + q.x, d * 0.02, 0.0, 0.0011 * S, 0.004 * S, 0.0024 * S) * step(Ls * 0.62, q.z) * step(hS + 0.003 * S, q.y));
    col = mix(col, col * 0.7, line(d * 0.02, 0.0025 * S, 0.0016 * S) * step(Ls * 0.62, q.z) * step(hS + 0.003 * S, q.y)); }`);
  if (o.penny) out.push(`{ float b = band(q.z, Ls * 0.5, Ls * 0.58) * step(q.y, toeTop + 0.01) * step(hS + (cY - hS) * 0.25, q.y);
    col = mix(col, ${o.penny}, b); col = mix(col, col * 0.6, b * (line(q.z, Ls * 0.502, 0.0018 * S) + line(q.z, Ls * 0.578, 0.0018 * S)));
    col = mix(col, vec3(0.12), box2(vec2(q.x, q.z), vec2(0.0, Ls * 0.54), vec2(W * 0.12, 0.0035 * S), 0.0025 * S) * step(toeTop - 0.012 * S, q.y)); }`);
  // laces: rows of crossed laces on the top of the instep, eyelets either side, a tongue under them
  if (o.laces) {
    const rows = o.rows ?? 5;
    out.push(`{ float top = step(min(hS + (cY - hS) * 0.45, toeTop - 0.012 * S), q.y) * step(au, W * 0.3) * band(q.z, l0, l1) * (1.0 - lin);
      float lw = W * ${f3(o.laceW ?? 0.15)};
      col = mix(col, ${o.tongue || 'col * 0.82'}, top * step(au, lw * 0.9));
      float t = (q.z - l0) / (l1 - l0) * ${rows}.0, fr = fract(t) - 0.5;
      float dx = au / lw;
      float x1 = line(fr * (l1 - l0) / ${rows}.0, (dx - 0.5) * (l1 - l0) / ${rows}.0 * 0.9, 0.0042 * S) * step(dx, 1.0);
      float bar = line(fr * (l1 - l0) / ${rows}.0, 0.0, 0.0045 * S) * step(dx, 1.0);
      col = mix(col, ${o.laces}, top * clamp(${o.cross === false ? 'bar' : 'x1 + line(fr * (l1 - l0) / ' + rows + '.0, -(dx - 0.5) * (l1 - l0) / ' + rows + '.0 * 0.9, 0.0042 * S) * step(dx, 1.0)'}, 0.0, 1.0) * step(t, ${rows}.0 - 0.15) * step(0.15, t));
      ${o.eyelets !== false ? `float ey = ring(vec2(au, fract(t) * (l1 - l0) / ${rows}.0), vec2(lw * 1.08, (l1 - l0) / ${rows}.0 * 0.5), 0.0022 * S, 0.0012 * S) * step(t, ${rows}.0 - 0.1) * step(0.1, t);
      col = mix(col, ${o.eyeletColor || 'vec3(0.78, 0.78, 0.8)'}, top * ey);` : ''} }`);
  }
  if (o.velcro) out.push(`{ float top = step(hS + (cY - hS) * 0.4, q.y);
    float s1 = band(q.z, Ls * 0.42, Ls * 0.5), s2 = band(q.z, Ls * 0.56, Ls * 0.64);
    float st = clamp(s1 + s2, 0.0, 1.0) * top * step(q.x, W * 0.36);
    col = mix(col, ${o.velcro}, st);
    col = mix(col, ${o.velcro} * 0.7, st * (line(q.z, Ls * 0.425, 0.0012 * S) + line(q.z, Ls * 0.495, 0.0012 * S) + line(q.z, Ls * 0.565, 0.0012 * S) + line(q.z, Ls * 0.635, 0.0012 * S)));
    col = mix(col, ${o.velcro} * 0.85, st * step(W * 0.22, q.x)); }`);
  if (o.heelTab) out.push(`col = mix(col, ${o.heelTab}, step(q.z, Ls * 0.07) * step(cY - (cY - hS) * 0.45, q.y) * step(au, W * 0.2));`);
  if (o.dots) out.push(`col = mix(col, vec3(0.92, 0.95, 0.9), (circle(vec2(q.z, q.y), vec2(Ls * 0.04, cY - (cY - hS) * 0.35), 0.0022 * S) + circle(vec2(q.z, q.y), vec2(Ls * 0.04, cY - (cY - hS) * 0.55), 0.0022 * S)) * step(0.25 * W, au));`);
  if (o.zip) out.push(`col = mix(col, ${o.zip}, zipper(vec2(q.z, q.y), Ls * 0.12, ankY + 0.005 * S, sT - 0.004 * S, 0.004 * S) * step(q.x, -0.3 * W));`);
  if (o.extra) out.push(o.extra);
  // the sole: its colour, a line round it, a tread at the bottom; a heel block
  out.push(`{ float sol = step(q.y, hS + 0.0006);
    vec3 sc = ${o.sole || 'uTrim'};
    ${o.soleLine !== false ? `sc = mix(sc, ${o.soleLineColor || 'sc * 0.72'}, line(q.y, lift + (hS - lift) * 0.55, 0.0018 * S));` : ''}
    ${o.tread ? `sc = mix(sc, sc * 0.6, step(q.y, lift + (hS - lift) * 0.25) * (0.6 + 0.4 * stripes(q.z + au * 0.5, 0.008 * S, 0.004 * S)));` : ''}
    col = mix(col, sc, sol);
    ${o.welt ? `col = mix(col, ${o.welt}, dashes(q.z, q.y, hS + 0.0035 * S, 0.0012 * S, 0.005 * S, 0.003 * S) * (1.0 - sol));` : ''}
    col = mix(col, col * 0.62, line(q.y, hS + 0.0004, 0.0016 * S));
    if (heel > 0.0) col = mix(col, ${o.heelColor || 'sc * 0.85'}, step(q.z, Ls * 0.42) * step(q.y, hS + heel - 0.0005)); }`);
  out.push(`col = mix(col, ${o.lining || 'mix(uMain, vec3(0.18, 0.16, 0.2), 0.55)'}, lin);`);
  out.push('return col;');
  return out.join('\n');
}

// ---------- building ----------
// a whole pair: the shoe (spec), hide, shoeFit, the paint, and any accessories (local trees with their paint)
function pairOf(ctx, it, spec, paintOpts, o = {}) {
  const T = lastTree(ctx, spec), F = T.F;
  const paint = shoePaintHelper({ ...paintOpts, cut: spec.cut });
  const wo = { lift: T.lift, legFrom: spec.shaft ? 0.008 : 0.016, legTo: spec.shaft ? 0.05 : 0.08 };
  const [L, R, tree] = pairHelper(ctx, F, T.shoe, { ...wo, verts: spec.shaft ? 4000 : 3200, cell: spec.cell ?? (spec.shaft && spec.shaft - F.ank[1] > 0.15 * F.S ? 0.006 * Math.sqrt(Math.max(0.55, F.S)) : undefined) });
  if (!L) return [];
  hideHelper(ctx, [[L, 1], [R, -1]], tree, { top: T.cY, S: F.S, ankY: F.ank[1] + 0.005, closed: !spec.cut && !spec.open, base: T.base, margin: spec.hideMargin, below: T.cutF, F });
  const top = spec.shaft ? T.shaft.top : T.cY;
  ctx.shoeFit = { top, clear: (spec.shaft ? T.shaft.r - legRingHelper(ctx, top - 0.004).r : T.collarR - legRingHelper(ctx, Math.min(T.cY, F.ank[1] + 0.03 * F.S)).r) + 0.002, tuck: !!o.tuck, kind: it.item.base };
  it.hemY = 0; it.topY = top;
  const uP = paramsOf(T, o);
  const pieces = [{ piece: L, glsl: paint, uP, noPattern: true, noDetails: true }, { piece: R, glsl: paint, uP, noPattern: true, noDetails: true }];
  for (const acc of (o.acc ? o.acc(T) : [])) {
    if (!acc) continue;
    const [a, b] = pairHelper(ctx, F, acc.tree, { ...wo, ...acc.o, cell: acc.cell ?? 0.0028 * Math.max(0.8, F.S), verts: acc.verts ?? 2000, partOf: acc.partOf });
    if (!a) continue;
    for (const p of [a, b]) pieces.push({ piece: p, glsl: PRE + acc.glsl, uP, noPattern: true, noDetails: true });
  }
  return pieces;
}

// ---------- accessories (local trees) ----------
// a band round the foot at w (a strap): an elliptical ring over the top, flattened along the foot
function strapTree(T, w, o = {}) {
  const F = T.F, S = F.S, p = F.prof[clamp(Math.round((w - F.bm) / F.fl * 12 - 0.5), 0, 11)];
  const hw = (o.hw ?? p.hw + 0.006 * S), top = (o.top ?? p.top + 0.006 * S + T.lift), yc = T.base;
  const R = hw, ky = (top - yc) / R;
  const ring = P.torus({ c: [o.u ?? p.u, yc, w], R, r: (o.th ?? 0.0022) * S, q: Q90X, sc: [1, o.width ?? 2.6, ky] });
  return inter(ring, P.plane({ p: [0, yc + 0.002, 0], n: [0, -1, 0] }));
}
// a ring round the leg at a height (ankle straps, fur trims, padded collars)
function legBandTree(ctx, T, y, o = {}) {
  const rg = legRingHelper(ctx, y), S = T.F.S;
  return P.torus({ c: [rg.c[0], y, rg.c[2]], R: rg.r + (o.clear ?? T.clear / S) * S + (o.out ?? 0) * S, r: (o.th ?? 0.003) * S, sc: [1, o.height ?? 1.8, 1] });
}
// a buckle: a rounded frame standing off a surface point, facing out along u
function buckleTree(c, s, S) {
  const outer = P.box({ c, h: [0.0016 * S, s * 0.75, s], round: 0.0012 * S });
  return sub(0, outer, P.box({ c: [c[0], c[1], c[2] + s * 0.18], h: [0.004 * S, s * 0.45, s * 0.55], round: 0.001 * S }));
}

// ---------- the archetypes ----------
const SOLE = (it, d = 'uTrim') => (has(it, 'sole_contrast') ? 'uTrim' : d);

export function sneaker_low(ctx, it) {
  const high = it.item.base === 'sneaker_high' || it.params.length === 'ankle_boot', velcro = it.params.closure === 'velcro' || has(it, 'velcro_straps');
  const thick = has(it, 'thick_sole');
  const spec = high ? { sole: thick ? 0.095 : 0.085, collar: 0.075, clear: 0.006, toeH: 0.012 } : { sole: thick ? 0.095 : 0.08, collar: 0.016, clear: 0.0045, toeH: 0.012 };
  const paint = ({
    sole: 'uTrim', tread: has(it, 'grip_sole'), toeCap: has(it, 'toe_cap') ? (high ? 'uTrim' : 'uSecond') : null, toeCapAt: 0.8,
    laces: velcro ? null : has(it, 'laces_contrast') ? 'uAccent' : 'uTrim', tongue: 'mix(uMain, uSecond, 0.35)', rows: high ? 6 : 4,
    velcro: velcro ? 'uSecond' : null, heelTab: 'uSecond', emblem: has(it, 'emblem_ball'), stripe: has(it, 'emblem_ball') || velcro ? null : 'uAccent',
  });
  return pairOf(ctx, it, spec, paint, { l0: footHelper(ctx).fl * (high ? 0.36 : 0.44), l1: footHelper(ctx).fl * 0.74 });
}
export const sneaker_high = sneaker_low;
export function runner(ctx, it) {
  const spec = { sole: 0.095, collar: 0.014, clear: 0.0045, toeH: 0.008, toeLen: 0.07 };
  const paint = ({ sole: 'uTrim', soleLineColor: 'uSecond', tread: true, mesh: has(it, 'mesh_panel') ? 'uSecond' : null, laces: 'uTrim', tongue: 'mix(uMain, uSecond, 0.3)', rows: 5,
    heelTab: 'uSecond', stripe: 'uSecond', dots: has(it, 'reflective_dots') });
  return pairOf(ctx, it, spec, paint);
}
export function slip_on(ctx, it) {
  const pt = it.pattern || {};
  const spec = { sole: 0.085, collar: 0.006, clear: 0.004, toeH: 0.008, cut: { side: 0.75, back: 0.75, vampW: 0.52 } };
  const pat = pt.type === 'checker' ? `col = mix(uMain, uSecond, checker(vec2(q.z, q.y + au), 0.01 * S));` : patternGLSL(pt);
  const paint = ({ pattern: pat, sole: 'uTrim', soleLineColor: 'uMain', lining: 'mix(uSecond, vec3(0.3), 0.3)',
    extra: `col = mix(col, uTrim, line(q.z, Ls * 0.03, 0.002 * S) * step(hS, q.y));` });
  return pairOf(ctx, it, spec, paint);
}
export function saddle_shoe(ctx, it) {
  const spec = { sole: 0.075, collar: 0.008, clear: 0.0045, toeH: 0.008 };
  const paint = ({ sole: 'mix(uTrim, vec3(0.75, 0.3, 0.25), 0.0)', saddle: 'uSecond', laces: 'uSecond * 0.8 + 0.2', rows: 3, cross: false, laceW: 0.13, eyeletColor: 'uMain', welt: 'uMain * 0.7' });
  return pairOf(ctx, it, spec, paint, { l0: footHelper(ctx).fl * 0.42, l1: footHelper(ctx).fl * 0.62 });
}
export function derby(ctx, it) {
  const dress = it.item.base === 'dress_shoe';
  const spec = { sole: 0.055, collar: 0.004, clear: 0.004, toeH: 0.003, toeNarrow: 0.9, margin: 0.0045, instep: 0.45, dome: 0.4, heel: has(it, 'heel_low') ? 0.012 : 0, heelThin: 0.85 };
  const paint = ({ sole: 'uTrim', soleLine: false, laces: 'mix(uMain, uAccent, 0.5)', rows: dress ? 4 : 3, cross: false, laceW: dress ? 0.1 : 0.14, eyeletColor: 'uMain * 0.6', tongue: 'uMain * 0.9',
    toeCap: has(it, 'toe_cap') ? 'uMain' : null, toeCapAt: 0.72, welt: has(it, 'stitch_contrast') ? 'uAccent' : 'uMain * 0.7', heelColor: 'uTrim * 0.8' });
  return pairOf(ctx, it, spec, paint, { l0: footHelper(ctx).fl * 0.44, l1: footHelper(ctx).fl * 0.64 });
}
export const dress_shoe = derby;
export function boat_shoe(ctx, it) {
  const spec = { sole: 0.06, collar: 0.002, clear: 0.004, toeH: 0.006, cut: { side: 0.82, back: 0.7, vampW: 0.46 } };
  const paint = ({ sole: 'vec3(0.95, 0.94, 0.9)', soleLineColor: 'uMain * 0.5', apron: true, laces: 'uAccent', rows: 2, cross: false, laceW: 0.14, eyeletColor: 'vec3(0.8, 0.7, 0.4)',
    l0: 0, welt: 'uAccent',
    extra: `col = mix(col, uAccent, line(q.y, cY - 0.006 * S - (1.0 - smoothstep(0.0, Ls * 0.4, q.z)) * 0.0, 0.0022 * S) * step(q.z, Ls * 0.45));` });
  return pairOf(ctx, it, spec, paint, { l0: footHelper(ctx).fl * 0.42, l1: footHelper(ctx).fl * 0.54 });
}
export function loafer(ctx, it) {
  const spec = { sole: 0.055, collar: 0.0, clear: 0.004, toeH: 0.006, toeNarrow: 0.92, margin: 0.0045, heel: 0.01, heelThin: 0.85, cut: { side: 0.8, back: 0.62, vampW: 0.5 } };
  const paint = ({ sole: 'uTrim', soleLine: false, apron: true, penny: 'uMain * 0.85', welt: has(it, 'stitch_contrast') ? 'uAccent' : 'uMain * 0.7', heelColor: 'uTrim * 0.8' });
  return pairOf(ctx, it, spec, paint);
}
export function ballet_flat(ctx, it) {
  const spec = { sole: 0.035, collar: 0.0, clear: 0.003, toeH: 0.004, toeNarrow: 0.95, margin: 0.0035, round: 0.012, cut: { side: 0.55, back: 0.55, vampW: 0.66 } };
  const paint = ({ sole: 'uMain * 0.6', soleLine: false, lining: 'mix(uMain, vec3(1.0), 0.45)' });
  return pairOf(ctx, it, spec, paint, { acc: has(it, 'bow') ? (T) => [bowAcc(T)] : null });
}
// a bow on the vamp
function bowAcc(T) {
  const S = T.F.S, w = T.Ls * (T.cut ? T.cut.c.vampW : 0.62) + 0.004 * S, y = T.hAt(w) + 0.001 * S, s = 0.011 * S;
  const tree = union(
    P.ellipsoid({ c: [s * 0.9, y, w], r: [s, s * 0.55, s * 0.45], q: [0, 0, Math.sin(0.15), Math.cos(0.15)] }),
    P.ellipsoid({ c: [-s * 0.9, y, w], r: [s, s * 0.55, s * 0.45], q: [0, 0, Math.sin(-0.15), Math.cos(-0.15)] }),
    P.sphere({ c: [0, y, w], r: s * 0.38 }),
  );
  return { tree, glsl: 'col = mix(uAccent, uAccent * 0.75, step(abs(q.x), 0.004 * S)); return col;' };
}
export function pump(ctx, it) {
  const mid = has(it, 'heel_mid');
  const spec = { sole: 0.03, collar: 0.0, clear: 0.003, toeH: 0.003, toeNarrow: 0.86, toeLen: 0.05, margin: 0.0035, round: 0.01, heel: mid ? 0.03 : 0.018, heelThin: 0.5, cut: { side: 0.55, back: 0.6, vampW: 0.64 } };
  const paint = ({ sole: 'uSecond * 0.7', soleLine: false, heelColor: 'uSecond', lining: 'mix(uMain, vec3(0.9, 0.8, 0.75), 0.5)' });
  return pairOf(ctx, it, spec, paint);
}
export function mary_jane(ctx, it) {
  const spec = { sole: 0.055, collar: 0.0, clear: 0.003, toeH: 0.008, margin: 0.0042, heel: has(it, 'heel_block') ? 0.008 : 0, heelThin: 0.8, cut: { side: 0.6, back: 0.65, vampW: 0.64 } };
  const paint = ({ sole: 'uTrim', soleLine: false, heelColor: 'uTrim', lining: 'mix(uMain, vec3(1.0), 0.35)', welt: 'uMain * 0.7' });
  return pairOf(ctx, it, spec, paint, {
    acc: (T) => {
      const S = T.F.S, w = T.F.prof[5].w;
      const strap = strapTree(T, w, { width: 3.4, th: 0.0028 });
      const btn = P.disc({ c: [T.F.prof[5].hw + 0.009 * S, T.base + (T.F.prof[5].top - T.base) * 0.55, w], R: 0.0045 * S, h: 0.0016 * S, round: 0.0012 * S, q: Q90Z });
      return [{ tree: strap, glsl: 'col = uMain * 0.92; return col;' }, { tree: btn, glsl: 'return uAccent;' }];
    },
  });
}
export function clog(ctx, it) {
  const spec = { sole: 0.1, collar: 0.0, clear: 0.005, toeH: 0.016, puff: 0.004, cut: { side: 0.95, back: 0.3, backW: 0.36, vampW: 0.5, backless: true }, open: true };
  const paint = ({ sole: 'uMain * 0.85', soleLineColor: 'uMain * 0.6', tread: true, lining: 'uMain * 0.75',
    extra: has(it, 'vents') ? `col = mix(col, uMain * 0.45, dotsHex(vec2(q.z, q.x), 0.011 * S, 0.0028 * S) * step(Ls * 0.6, q.z) * step(toeTop - 0.016 * S, q.y));` : '' });
  return pairOf(ctx, it, spec, paint, {
    acc: (T) => {
      const S = T.F.S, rg = legRingHelper(ctx, T.F.ank[1] - 0.005 * S);
      // the strap round the back of the heel, riveted at the sides
      const strap = inter(P.torus({ c: [rg.c[0], T.base + 0.015 * S, T.wH + T.rH * 0.6], R: T.rH * 1.08, r: 0.0035 * S, sc: [1, 2.2, 1.1] }), P.plane({ p: [0, 0, T.wH + T.rH * 0.6], n: [0, 0, 1] }));
      return [{ tree: strap, glsl: 'return uMain * 0.9;' }];
    },
  });
}
export function slipper(ctx, it) {
  const spec = { sole: 0.06, collar: 0.006, clear: 0.007, toeH: 0.02, puff: 0.006, toeLen: 0.09 };
  const paint = ({ sole: 'uSecond', soleLine: false, lining: 'uSecond',
    extra: `{ // a creature's face on the toe: eyes, a nose, cheeks
      vec2 f = vec2(q.x, q.y); float front = step(Ls * 0.82, q.z);
      float ey = circle(vec2(au, q.y), vec2(W * 0.17, toeTop - 0.012 * S), 0.0042 * S) * front;
      col = mix(col, vec3(0.12, 0.1, 0.14), ey);
      col = mix(col, vec3(1.0), circle(vec2(au, q.y), vec2(W * 0.17 - 0.0012 * S, toeTop - 0.0105 * S), 0.0013 * S) * front);
      col = mix(col, uAccent, circle(vec2(q.x, q.y), vec2(0.0, toeTop - 0.02 * S), 0.0032 * S) * step(Ls * 0.9, q.z));
      col = mix(col, mix(col, vec3(1.0, 0.5, 0.55), 0.6), circle(vec2(au, q.y), vec2(W * 0.3, toeTop - 0.022 * S), 0.004 * S) * front);
      col = mix(col, uSecond, smoothstep(cY - 0.008 * S, cY, q.y)); }` });
  return pairOf(ctx, it, spec, paint, {
    acc: has(it, 'animal_ears') ? (T) => {
      const S = T.F.S, w = T.Ls * 0.7, y = T.hAt(T.Ls * 0.7) - 0.004 * S, out = [];
        for (const s of [1, -1]) out.push(P.ellipsoid({ c: [s * T.W * 0.22, y + 0.014 * S, w], r: [0.011 * S, 0.02 * S, 0.005 * S], q: [0, 0, Math.sin(-s * 0.3), Math.cos(-s * 0.3)] }));
      return [{ tree: union(...out), glsl: 'return mix(uMain, mix(uAccent, vec3(1.0), 0.3), smoothstep(-0.001, 0.001, q.z - Ls * 0.7 - 0.0035 * S) * step(toeTop + 0.006 * S, q.y));' }];
    } : null,
  });
}
export function sandal(ctx, it) {
  const spec = { sole: 0.075, collar: -0.03, clear: 0.004, toeH: 0.006, cut: { side: 0.35, back: 0.2, backW: 0.5, vampW: 0.82 }, open: true };
  const paint = ({ sole: 'uSecond', tread: true, lining: 'uMain * 0.7', soleLineColor: 'uMain' });
  return pairOf(ctx, it, spec, paint, {
    acc: (T) => {
      const S = T.F.S, F = T.F;
      const straps = [strapTree(T, F.prof[6].w, { width: 3.0, th: 0.003 })];
      if (has(it, 'cross_strap')) straps.push(strapTree(T, F.prof[4].w, { width: 3.0, th: 0.003 }));
      // round the ankle and down the back of the heel
      straps.push(inter(legBandTree(ctx, T, F.ank[1] + 0.012 * S, { th: 0.003, height: 2.2, clear: 0.004 }), P.plane({ p: [0, 0, 0], n: [0, -1, 0] })));
      straps.push(P.box({ c: [0, (T.base + F.ank[1]) / 2 + 0.004 * S, F.bm + 0.002 * S], h: [0.007 * S, (F.ank[1] - T.base) / 2 + 0.008 * S, 0.0024 * S], round: 0.0018 * S }));
      return [{ tree: union(...straps), glsl: `col = uMain; col = mix(col, uSecond, step(0.3 * W, q.x) * step(q.y, ankY + 0.005 * S) * step(Ls * 0.3, q.z) * 0.0); col = mix(col, col * 0.75, stripes(q.z + q.y, 0.004 * S, 0.0015 * S) * 0.3); return col;` }];
    },
  });
}

// ---------- boots ----------
const BOOT_PAINT = (it, o = {}) => ({ sole: o.sole || 'uTrim', soleLine: o.soleLine ?? false, tread: has(it, 'grip_sole'), welt: o.welt ?? 'uMain * 0.68', lining: o.lining || 'mix(uMain, vec3(0.15), 0.6)', heelColor: 'uTrim', ...o });
// a pull loop at the back of a boot's top
function pullTabAcc(T, S, col = 'uSecond') {
  const top = T.shaft ? T.shaft.top : T.cY, rg = legRingHelper(T.ctx, top - 0.01 * S);
  const z = rg.c[2] - rg.r - T.clear - 0.0015 * S;
  const tree = inter(P.torus({ c: [rg.c[0], top, z], R: 0.008 * S, r: 0.0022 * S, q: Q90Z, sc: [1, 1, 1] }), P.plane({ p: [0, top - 0.004 * S, 0], n: [0, -1, 0] }));
  return { tree, glsl: `return ${col};` };
}
function bootPair(ctx, it, spec, paint, o = {}) {
  return pairOf(ctx, it, spec, paint, { ...o, acc: (T) => { T.ctx = ctx; return o.acc ? o.acc(T) : []; } });
}
export function hiking_boot(ctx, it) {
  const spec = { sole: 0.1, shaft: legHeightHelper(ctx, 'ankle_boot'), clear: 0.007, toeH: 0.012, soleOut: 0.004 };
  const paint = BOOT_PAINT(it, { sole: 'uTrim', soleLine: true, soleLineColor: 'uSecond', toeCap: 'uSecond', toeCapAt: 0.8, laces: has(it, 'laces_contrast') ? 'vec3(0.78, 0.18, 0.15)' : 'uAccent', rows: 7, tongue: 'uSecond',
    eyeletColor: 'vec3(0.82, 0.74, 0.5)', heelTab: 'uSecond',
    extra: `col = mix(col, uSecond, smoothstep(sT - 0.016 * S, sT - 0.012 * S, q.y)); col = mix(col, col * 0.7, line(q.y, sT - 0.014 * S, 0.0016 * S));` });
  return bootPair(ctx, it, spec, paint, { tuck: false, l0: footHelper(ctx).fl * 0.4, l1: footHelper(ctx).fl * 0.86, acc: (T) => [has(it, 'tabs_pull') ? pullTabAcc(T, T.F.S, 'uAccent') : null] });
}
export function work_boot(ctx, it) {
  const spec = { sole: has(it, 'thick_sole') ? 0.11 : 0.095, shaft: legHeightHelper(ctx, 'ankle_boot'), clear: 0.007, toeH: 0.014, soleOut: 0.005, toeLen: 0.07 };
  const paint = BOOT_PAINT(it, { sole: 'uSecond * 0.8', soleLine: true, soleLineColor: 'uTrim', toeCap: has(it, 'toe_cap') ? 'uSecond' : null, toeCapAt: 0.78, laces: 'uAccent', rows: 7, tongue: 'uMain * 0.85',
    eyeletColor: 'vec3(0.8, 0.7, 0.4)', welt: 'vec3(0.95, 0.85, 0.55)',
    extra: `col = mix(col, uMain * 0.82, smoothstep(sT - 0.016 * S, sT - 0.012 * S, q.y));` });
  return bootPair(ctx, it, spec, paint, { l0: footHelper(ctx).fl * 0.42, l1: footHelper(ctx).fl * 0.86, acc: (T) => [has(it, 'tabs_pull') ? pullTabAcc(T, T.F.S, 'uAccent') : null] });
}
export function chelsea_boot(ctx, it) {
  const spec = { sole: 0.06, shaft: legHeightHelper(ctx, 'ankle_boot'), clear: 0.0055, toeH: 0.006, toeNarrow: 0.92, heel: has(it, 'heel_low') ? 0.012 : 0, heelThin: 0.85 };
  const paint = BOOT_PAINT(it, { sole: 'uTrim', gore: 'uSecond * 0.6', welt: 'uMain * 0.6' });
  return bootPair(ctx, it, spec, paint, { acc: (T) => [has(it, 'tabs_pull') ? pullTabAcc(T, T.F.S, 'uSecond') : null] });
}
export function ankle_boot(ctx, it) {
  const spec = { sole: 0.04, shaft: legHeightHelper(ctx, 'ankle_boot'), clear: 0.006, toeH: 0.005, toeNarrow: 0.88, toeLen: 0.07, heel: has(it, 'heel_block') ? 0.03 : 0.012, heelThin: 0.6 };
  const paint = BOOT_PAINT(it, { sole: 'uTrim', zip: it.params.closure === 'side_zip' ? 'vec3(0.75, 0.72, 0.6)' : null, welt: false });
  return bootPair(ctx, it, spec, paint);
}
export function short_boot(ctx, it) {
  const spec = { sole: 0.085, shaft: legHeightHelper(ctx, it.params.length === 'mid_calf' ? 0.8 : 'ankle_boot'), clear: 0.008, toeH: 0.012 };
  const paint = BOOT_PAINT(it, { sole: 'uTrim', toeCap: 'uSecond', toeCapAt: 0.8 });
  return bootPair(ctx, it, spec, paint, { tuck: true, acc: (T) => {
    const S = T.F.S, out = [];
    if (has(it, 'buckle') || it.params.closure === 'buckle') {
      const y = T.F.ank[1] + 0.03 * S;
      out.push({ tree: legBandTree(ctx, T, y, { th: 0.0022, height: 2.6, clear: 0.0015 + T.clear / S }), glsl: 'return uSecond;' });
      const rg = legRingHelper(ctx, y);
      out.push({ tree: buckleTree([rg.c[0] + rg.r + T.clear + 0.0055 * S, y, rg.c[2]], 0.0065 * S, S), glsl: 'return vec3(0.82, 0.75, 0.5);' });
    }
    if (has(it, 'tabs_pull')) out.push(pullTabAcc(T, S, 'uSecond'));
    return out;
  } });
}
export function riding_boot(ctx, it) {
  const spec = { sole: 0.05, shaft: legHeightHelper(ctx, 'below_knee_boot'), clear: 0.006, toeH: 0.006, toeNarrow: 0.92, heel: has(it, 'heel_low') ? 0.014 : 0, heelThin: 0.85 };
  const paint = BOOT_PAINT(it, { sole: 'uTrim', zip: it.params.closure === 'side_zip' ? 'vec3(0.7, 0.66, 0.55)' : null,
    extra: `col = mix(col, uSecond, smoothstep(sT - 0.03 * S, sT - 0.027 * S, q.y)); col = mix(col, col * 0.65, line(q.y, sT - 0.0285 * S, 0.0016 * S));` });
  return bootPair(ctx, it, spec, paint, { tuck: true, acc: (T) => {
    const S = T.F.S, out = [];
    if (has(it, 'buckle')) {
      const y = T.F.ank[1] + 0.035 * S, rg = legRingHelper(ctx, y);
      out.push({ tree: inter(legBandTree(ctx, T, y, { th: 0.0022, height: 2.6, clear: 0.0015 + T.clear / S }), P.plane({ p: [rg.c[0], 0, 0], n: [-1, 0, 0] })), glsl: 'return uMain * 0.7;' });
      out.push({ tree: buckleTree([rg.c[0] + rg.r + T.clear + 0.004 * S, y, rg.c[2]], 0.006 * S, S), glsl: 'return vec3(0.85, 0.8, 0.6);' });
    }
    return out;
  } });
}
export function lace_boot(ctx, it) {
  const spec = { sole: 0.05, shaft: legHeightHelper(ctx, 'below_knee_boot'), clear: 0.006, toeH: 0.006, toeNarrow: 0.92, heel: has(it, 'heel_low') ? 0.014 : 0, heelThin: 0.85 };
  const F = footHelper(ctx);
  // laces all the way up the front of the shaft: painted in the leg's frame (y up the front)
  const paint = BOOT_PAINT(it, { sole: 'uTrim', laces: 'uAccent', rows: 4, l0: F.fl * 0.45, tongue: 'uMain * 0.8', extra: `{
      float fr = step(0.0, q.z - Ls * 0.32) * step(ankY, q.y) * step(q.y, sT - 0.01 * S) * step(au, W * 0.2);
      float rowH = 0.016 * S, t = fract((q.y - ankY) / rowH) - 0.5, dx = au / (W * 0.13);
      float x = line(t * rowH, (dx - 0.5) * rowH * 0.9, 0.0026 * S) + line(t * rowH, -(dx - 0.5) * rowH * 0.9, 0.0026 * S);
      col = mix(col, uMain * 0.78, fr * step(dx, 0.9));
      col = mix(col, uAccent, fr * clamp(x, 0.0, 1.0) * step(dx, 1.0));
      col = mix(col, vec3(0.8, 0.76, 0.6), fr * ring(vec2(au, t * rowH), vec2(W * 0.14, 0.0), 0.0018 * S, 0.0011 * S)); }` });
  return bootPair(ctx, it, spec, paint, { tuck: true, l0: F.fl * 0.45, l1: F.fl * 0.75 });
}
export function rain_boot(ctx, it) {
  const spec = { sole: 0.075, shaft: legHeightHelper(ctx, it.params.length || 'mid_calf'), clear: 0.011, flare: 0.012, toeH: 0.014, puff: 0.002 };
  const paint = BOOT_PAINT(it, { sole: 'uSecond', soleLine: true, soleLineColor: 'uSecond * 0.7', welt: false, lining: 'uSecond * 0.6',
    extra: `col = mix(col, uSecond, smoothstep(sT - 0.012 * S, sT - 0.009 * S, q.y));
      col = mix(col, mix(col, vec3(1.0), 0.35), smoothstep(0.004 * S, 0.0, abs(q.x - W * 0.2)) * step(ankY, q.y) * 0.0);` });
  return bootPair(ctx, it, spec, paint, { tuck: true, acc: (T) => [has(it, 'tabs_pull') ? pullTabAcc(T, T.F.S, 'uSecond') : null] });
}
export function wader_boot(ctx, it) {
  const spec = { sole: 0.08, shaft: legHeightHelper(ctx, 'below_knee_boot') + 0.02 * footHelper(ctx).S, clear: 0.012, flare: 0.006, toeH: 0.014, puff: 0.002 };
  const paint = BOOT_PAINT(it, { sole: 'uSecond', soleLine: true, welt: false, lining: 'uSecond * 0.5',
    extra: `col = mix(col, uSecond, smoothstep(sT - 0.02 * S, sT - 0.017 * S, q.y)); col = mix(col, uAccent, line(q.y, sT - 0.026 * S, 0.003 * S));` });
  return bootPair(ctx, it, spec, paint, { tuck: true });
}
export function snow_boot(ctx, it) {
  const spec = { sole: 0.1, shaft: legHeightHelper(ctx, it.params.length || 'mid_calf') - 0.015 * footHelper(ctx).S, clear: 0.011, shaftK: 0.004, toeH: 0.016, puff: 0.004, soleOut: 0.005 };
  const paint = BOOT_PAINT(it, { sole: 'uSecond', soleLine: true, soleLineColor: 'uAccent', toeCap: 'uSecond', toeCapAt: 0.74, laces: 'uTrim', rows: 4, tongue: 'uMain * 0.85', welt: false,
    extra: `col = mix(col, col * 0.82, line(fract((q.y - ankY) / (0.024 * S)), 0.5, 0.06) * step(ankY + 0.01 * S, q.y) * step(q.z, Ls * 0.5));` });
  return bootPair(ctx, it, spec, paint, { tuck: true, l0: footHelper(ctx).fl * 0.45, l1: footHelper(ctx).fl * 0.75, acc: (T) => {
    if (!has(it, 'fur_trim')) return [];
    // a fluffy cuff round the top: a ring of soft lumps
    const S = T.F.S, y = T.shaft.top - 0.004 * S, rg = legRingHelper(ctx, y - 0.004 * S), R = rg.r + T.clear + 0.003 * S, lumps = [];
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; lumps.push(P.sphere({ c: [rg.c[0] + Math.sin(a) * R, y + (i % 2) * 0.003 * S, rg.c[2] + Math.cos(a) * R], r: 0.0085 * S })); }
    return [{ tree: smin(0.004 * S, P.torus({ c: [rg.c[0], y, rg.c[2]], R, r: 0.007 * S, sc: [1, 1.3, 1] }), ...lumps), glsl: 'return mix(uTrim, vec3(1.0), 0.3) * (0.92 + 0.08 * noise2(q.xz * 900.0));', verts: 1600 }];
  } });
}
export function roller_skate(ctx, it) {
  const F = footHelper(ctx), S = F.S, lift = 0.045 * S;
  const spec = { sole: 0.035, lift, shaft: legHeightHelper(ctx, 'ankle_boot') + 0.01 * S, clear: 0.008, toeH: 0.012, noTopLining: false };
  const paint = BOOT_PAINT(it, { sole: 'uSecond', laces: has(it, 'laces_contrast') ? 'uAccent' : 'uTrim', rows: 7, tongue: 'uSecond', welt: false,
    extra: `col = mix(col, uSecond, smoothstep(sT - 0.016 * S, sT - 0.012 * S, q.y));` });
  return bootPair(ctx, it, spec, paint, { tuck: false, l0: F.fl * 0.42, l1: F.fl * 0.88, acc: (T) => {
    const S2 = T.F.S, plate = P.box({ c: [T.uT * 0.5, lift - 0.004 * S2, T.Ls * 0.5], h: [T.W * 0.3, 0.004 * S2, T.Ls * 0.4], round: 0.002 * S2 });
    const wheels = [], r = 0.0185 * S2, hw = 0.009 * S2;
    for (const w of [0.2, 0.8]) for (const s of [1, -1]) wheels.push(P.cyl({ c: [s * (T.W * 0.34), r, T.Ls * w], r, h: hw, q: Q90Z }));
    const stop = P.rcone({ a: [0, lift - 0.004 * S2, T.Ls * 0.97], b: [0, 0.009 * S2, T.Ls * 1.0], ra: 0.011 * S2, rb: 0.009 * S2 });
    return [
      { tree: union(plate, P.box({ c: [0, lift - 0.014 * S2, T.Ls * 0.2], h: [0.006 * S2, 0.012 * S2, 0.008 * S2], round: 0.002 * S2 }), P.box({ c: [0, lift - 0.014 * S2, T.Ls * 0.8], h: [0.006 * S2, 0.012 * S2, 0.008 * S2], round: 0.002 * S2 })), glsl: 'return vec3(0.72, 0.74, 0.78);' },
      { tree: union(...wheels), glsl: 'float hub = step(length(vec2(q.y - 0.0185 * S, q.z - (q.z > Ls * 0.5 ? Ls * 0.8 : Ls * 0.2))), 0.009 * S); return mix(uAccent, vec3(0.85), hub);', verts: 1400 },
      { tree: stop, glsl: 'return vec3(0.2, 0.2, 0.22);' },
    ];
  } });
}

// cloth wraps round the arch and ankle for fighters (no shoe): a thin shell, toes and heel bare
export function foot_wrap(ctx, it) {
  const land = ctx.land, LL = land.hipJ - land.ankleY;
  const piece = shell(ctx, {
    cover: (V) => {
      if (V.limb !== 2) return -0.1;
      if (V.s < 0.9) return (V.s - 0.9) * 0.5;
      // on the foot: from behind the toes back, leaving the heel's underside bare
      return Math.min(0.12 - V.cz, V.cy - 0.012 + Math.max(0, V.cz - 0.0) * 0.4);
    },
    off: it.off + 0.0018, fill: 1, rim: 0.0025, layer: it.layer, hideMargin: 0.006,
  });
  if (!piece) return [];
  return [{ piece, noPattern: true, noDetails: true, glsl: `vec3 col = uMain;
    float t = vCanon.y * 1.0 + vCanon.z * 0.55 + atan(vCanon.z, abs(vCanon.x) - ${f3(land.hipJx)}) * 0.006;
    col = mix(col, uSecond, line(fract(t / 0.016), 0.5, 0.08));
    col = mix(col, uAccent, step(${f3(land.ankleY + 0.05)}, vCanon.y) * step(vCanon.y, ${f3(land.ankleY + 0.058)}));
    col = mix(col, col * 0.8, step(0.5, vG.w));
    return col;` }];
}
