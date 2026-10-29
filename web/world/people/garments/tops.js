// Tops: tees, shirts, blouses, knits, sweatshirts and hoodies, sports and swim
// tops, the gi and the chef's jacket; and the kit every garment in tops.js,
// outer.js and dresses.js is made with.
//
// The kit (exports ending in Shell, Tree or Helper, so garments/index.js skips them):
//   bodyShell(ctx, it, s)   the garment's body: a wear.js shell cut along a cover made
//                           of named edges (neck, hem, front opening, sleeve ends, armholes,
//                           legs), with an offset that can puff sleeves, gather elastic hems,
//                           quilt a down jacket or stand a collar off the neck. It returns the
//                           piece and, for every vertex, how far it is (on the reference body)
//                           from each kind of edge, so collars, lapels, plackets, cuffs, rib
//                           bands and pockets can be laid along those edges.
//   overlayHelper(ctx, base, region, o)  a piece cut out of a garment's own surface and
//                           lifted off it (collars, lapels, plackets, pockets, cuffs, yokes,
//                           rib bands, straps): it follows the garment exactly, folds back at
//                           its edges so it reads as a thick layer, and costs a few ms.
//   tubeHelper(ctx, o)      cloth hung round the hips and legs (dress skirts, coat skirts,
//                           apron panels, tails): rings round the body and whatever was worn
//                           under it, flared, pleated, tiered, ruffled or scalloped, closed or
//                           open at the front, or only a sector (front panel, back tails).
//   hoodPiecesHelper        a hood lying down: a thick roll round the neckline and the crown on
//                           the back, as an overlay (cheap), lined, with cords or ears.
//   bowTree, solidHelper    small solids (sdf.js) where volume reads better than paint: bows,
//                           toggles, cords, a sleepsuit's tail.
//   GLSL makers (buttonsHelper, zipHelper, ribHelper, seamsHelper ...) for crisp painted
//   detail; everything is laid out on the reference body (vCanon), so a button row sits in
//   the same place on a toddler and on a grandparent.
// Pieces are { piece, glsl | extra, noPattern, noDetails, uP, colors } as in basics.js.
import { shell, solid, jointPos, fy, all, below, above, neckline, sstep, clamp, lerp, TAU } from '../wear.js';
import { cutMesh, borderLoops, normals, smoothNormals, compact } from '../mesh.js';
import { P, smin, union, inter, sub } from '../sdf.js';
import { BONE } from '../rig.js';
import { SLEEVE, LEG, topHem, skirtHem, neckOf, noHead, noExt, limbTo } from './common.js';
import { FIT } from './basics.js';

export const f4Helper = (x) => (+x).toFixed(4);
const f = f4Helper;
const has = (p, d) => (p.details || []).includes(d);
export { has as hasHelper };

// ---------- garments worn so far (this person): later layers wrap round them ----------
export function stackHelper(ctx) { if (!ctx.__garmentStack) ctx.__garmentStack = []; return ctx.__garmentStack; }
const remember = (ctx, piece) => { if (piece && piece.mesh) stackHelper(ctx).push(piece.mesh); return piece; };
export { remember as rememberHelper };

// a vertex's place on the reference body (like wear.js' cover functions get it)
export function vOfHelper(m, i) {
  const c = m.canon, p = m.part, s = m.share;
  return { cx: c[3 * i], cy: c[3 * i + 1], cz: c[3 * i + 2], limb: Math.round(p[4 * i]), s: p[4 * i + 1], side: p[4 * i + 2], arm: s[4 * i], leg: s[4 * i + 1], head: s[4 * i + 2], ext: s[4 * i + 3] };
}
const vOf = vOfHelper;

// short necks (children, under a big head): canonical heights above the shoulders are stretched
// before a neckline is cut, so necklines and stand collars sit lower and clear the jaw
export function neckKHelper(ctx) {
  if (ctx.__neckK) return ctx.__neckK;
  const L = ctx.A.L, land = ctx.land, r = ((L.chinY - L.shY) / L.hh) / ((land.chinY - land.shY) / land.hh);
  return (ctx.__neckK = clamp(Math.pow(clamp(r), 0.5), 0.55, 1));
}
export function neckVHelper(ctx, V) {
  const k0 = neckKHelper(ctx), y0 = ctx.land.shY - 0.03;
  if (k0 >= 0.999 || V.cy <= y0) return V;
  // only the neck itself (not the shoulders beside it)
  const k = lerp(k0, 1, sstep(0.045, 0.085, Math.abs(V.cx)));
  return { ...V, cy: y0 + (V.cy - y0) / k };
}

// a neckline on the reference body (o from common.js' neckOf: shape, front, back, width): round the base of
// the neck it follows the neck (a ring a little out from it, higher at the back), so the shoulders beside
// the neck stay covered; v, scoop, square and boat shapes cut deeper or wider on the front.
// > 0 inside the garment
export function necklineHelper(V, land, o) {
  const x = Math.abs(V.cx), t = Math.atan2(x, V.cz + 0.02) / Math.PI;   // 0 front .. 1 back
  const hF = o.front - land.shY, hB = o.back - land.shY;
  // high collars (turtleneck, funnel, mock): straight up the neck
  if (hF > 0.06) return land.shY + lerp(hF, hB, t) - V.cy;
  const rho = Math.hypot(V.cx, V.cz + 0.02);
  const ring = Math.max(land.shY + lerp(Math.min(hF, 0.034), Math.min(hB, 0.05), t) - V.cy, rho - (0.058 + lerp(0.018, 0.01, t)));
  const sh = o.shape || 'crew', w = o.width ?? 0.06, front = V.cz > 0;
  if (sh === 'crew' && hF >= 0.03) return ring;
  const h = front ? o.front : o.back, u = Math.min(x / (sh === 'boat' ? w * 1.9 : w), 1);
  let s = 0;
  if (!front && sh !== 'boat') s = u * u;
  else switch (sh) {
    case 'v': s = u; break;
    case 'scoop': s = Math.pow(u, 2.2); break;
    case 'square': s = u < 1 ? 0 : 1; break;
    case 'boat': s = Math.pow(u, 4); break;
    default: s = u * u;
  }
  const cut = h + s * Math.max(0.14, land.shY + 0.1 - h) - V.cy;
  return Math.min(ring, cut);
}

// keep a body cover clear of the jaw and ears: below a fitted height between the shoulders and the chin
// (a short neck's shoulders rise beside the head). Wraps cover(V) as wear.shell calls it, body vertex by vertex.
export function clearHeadHelper(ctx, cover, room = 0.25) {
  if (room === false) return cover;
  const L = ctx.A.L, B = ctx.body, yLim = L.chinY - (L.chinY - L.shY) * room - 0.008;
  let k = 0;
  return (V) => {
    const g = cover(V);
    if (g <= 0) { k++; return g; }
    if (B.canon[3 * k] !== V.cx || B.canon[3 * k + 1] !== V.cy) {
      k = -1;
      for (let i = 0; i < ctx.n; i++) if (B.canon[3 * i] === V.cx && B.canon[3 * i + 1] === V.cy && B.canon[3 * i + 2] === V.cz) { k = i; break; }
      if (k < 0) return g;
    }
    const y = B.pos[3 * k + 1]; k++;
    return Math.min(g, (yLim - y) * 0.5);
  };
}

// ---------- the body of a garment ----------
// s: { hem (canonical y) | hemAt(V) -> y, neck: neckOf options | (V) => g, sleeve (s along the arm, < 0 none),
//      open (half gap at the front, m) | openAt(cy) -> half gap, legs (s along the leg: one-pieces), legsFrom (0: from the hips),
//      ease, hang, off(V, base) -> extra offset, puff, bell, elastic: { hem, cuff }, quilt: { trunk, arm, depth },
//      neckUp (a collar standing up the neck: canonical height above the neckline), rim, fill, layer, wrapHem }
export function bodyShell(ctx, it, s) {
  const land = ctx.land, p = it.params, [ease0, hang0] = FIT[p.fit] || FIT.regular;
  const ease = s.ease ?? ease0, hang = s.hang ?? hang0 * 0.85;
  const hemAt = s.hemAt || (() => s.hem);
  const neck0 = typeof s.neck === 'function' ? s.neck : (V) => necklineHelper(V, land, s.neck || neckOf(land, 'crew'));
  const neckG = (V) => neck0(neckVHelper(ctx, V));
  const openAt = s.openAt || (s.open ? () => s.open : null);
  const sl = s.sleeve ?? -1;
  const terms = {
    neck: (V) => neckG(V),
    hem: (V) => (s.legs ? 1 : V.cy - hemAt(V)),
    front: (V) => (openAt && V.cz > 0 ? Math.abs(V.cx) - openAt(V.cy) : 1),
    cuff: (V) => (V.limb === 1 ? (sl < 0 ? -0.05 : (sl - V.s) * 0.5) : 1),
    arm: (V) => (V.limb !== 1 && sl < 0 ? (0.36 - V.arm) * 0.2 : 1),
    leg: (V) => (s.legs && V.limb === 2 ? (s.legs - V.s) * 0.5 : 1),
  };
  const cover = s.cover || ((V) => {
    if (V.limb === 3) return -0.1;
    const base = Math.min(terms.neck(V), terms.front(V), noHead(V) * 0.1, noExt(V) * 0.1);
    if (V.limb === 1) return sl < 0 ? -0.05 : Math.min(terms.cuff(V), noExt(V) * 0.1, terms.neck(V) + 0.012, noHead(V) * 0.1);
    if (V.limb === 2) return s.legs ? Math.min(terms.leg(V), noExt(V) * 0.1, terms.front(V)) : Math.min(terms.hem(V), 0.05, terms.front(V));
    return Math.min(base, terms.hem(V), terms.arm(V));
  });
  const q = s.quilt, el = s.elastic || {};
  const off = (V) => {
    let d = it.off + ease * (V.limb === 1 ? 0.6 : 1);
    if (V.limb === 1 && sl > 0) {
      const t = clamp(V.s / Math.max(sl, 0.05));
      if (s.puff) d += s.puff * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1 - 0.6 * t);
      if (s.bell) d += s.bell * sstep(0.35, 1, t);
      if (el.cuff) d -= el.cuff * sstep(0.85, 1, t) - el.cuff * 0.6 * sstep(0.4, 0.85, t);
      if (q && q.arm) d += q.depth * (0.5 - 0.5 * Math.cos(TAU * V.s / q.arm));
    }
    if (V.limb !== 1) {
      const h = V.cy - hemAt(V);
      if (el.hem) d -= el.hem * (1 - sstep(0, 0.05, h)) - el.hem * 0.5 * (sstep(0, 0.05, h) - sstep(0.05, 0.14, h));
      if (q && q.trunk) d += q.depth * (0.5 - 0.5 * Math.cos(TAU * h / q.trunk)) * (1 - sstep(land.shY - 0.03, land.shY + 0.03, V.cy));
    }
    if (s.neckUp && V.cy > land.shY + 0.02 && V.limb === 0) d += 0.006 * sstep(land.shY + 0.02, land.shY + 0.05, V.cy);
    if (s.off) d += s.off(V);
    return Math.max(0.001, d);
  };
  const piece = shell(ctx, { cover: clearHeadHelper(ctx, cover, s.neckRoom), off, fill: s.fill ?? 2 + Math.round(hang * 1.5), hang: hang, hangFrom: s.hangFrom, rim: s.rim ?? 0.0025, layer: it.layer, hideMargin: s.hideMargin });
  if (!piece) return { piece: null };
  smoothNormals(piece.mesh, null, s.nsmooth ?? 4, 0.7);
  regionsHelper(piece.mesh, !s.legs);
  const A = analyseHelper(piece.mesh, terms);
  return { piece, A, terms, cover };
}

// paint regions (gco.z) that interpolate cleanly: the sleeves fade in with the arm share, so a sleeve's
// colour ends on a smooth line at the armhole (not along the mesh's zig-zag of arm vertices); the bit of
// thigh a long top covers counts as the trunk (legsAsTrunk), so no sleeve-coloured sliver at the hips
export function regionsHelper(m, legsAsTrunk = true) {
  const n = m.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const limb = Math.round(m.part[4 * i]);
    if (limb === 3) continue;
    if (limb === 2) { if (legsAsTrunk) m.gco[4 * i + 2] = 0; continue; }
    const t = clamp((m.share[4 * i] - 0.5) * 5 + 0.5);
    m.gco[4 * i + 2] = t * (m.canon[3 * i] >= 0 ? 1 : 2);
  }
}
// per vertex distance (reference body, m) to each kind of edge of a garment surface
export function analyseHelper(m, terms) {
  const n = m.pos.length / 3, rim = (i) => m.gco[4 * i + 3] > 0.5, I = m.idx;
  const isB = new Uint8Array(n);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2], r = rim(a) + rim(b) + rim(c);
    if (r > 0 && r < 3) for (const v of [a, b, c]) if (!rim(v)) isB[v] = 1;
  }
  const names = Object.keys(terms), pts = Object.fromEntries(names.map((k) => [k, []]));
  for (let i = 0; i < n; i++) {
    if (!isB[i]) continue;
    const V = vOf(m, i);
    let best = names[0], bv = Infinity;
    for (const k of names) { const v = Math.abs(terms[k](V)); if (v < bv) { bv = v; best = k; } }
    pts[best].push(m.canon[3 * i], m.canon[3 * i + 1], m.canon[3 * i + 2]);
  }
  const d = {};
  for (const k of names) {
    const B = pts[k], out = new Float32Array(n).fill(9);
    if (B.length) for (let i = 0; i < n; i++) {
      if (rim(i)) continue;
      const x = m.canon[3 * i], y = m.canon[3 * i + 1], z = m.canon[3 * i + 2];
      let best = 81;
      for (let j = 0; j < B.length; j += 3) { const dx = B[j] - x, dy = B[j + 1] - y, dz = B[j + 2] - z, q = dx * dx + dy * dy + dz * dz; if (q < best) best = q; }
      out[i] = Math.sqrt(best);
    }
    d[k] = out;
  }
  return d;
}

// ---------- overlays: a piece of a garment's surface, lifted off it ----------
// region(V, i, pos) > 0 inside (i: the vertex in base.mesh, for analyseHelper's distances);
// o: { d (lift, m), dAt(V, i) -> lift, rim, uv(V, i) -> [u, v] (replaces the paint coordinates vG.xy) }
export function overlayHelper(ctx, base, region, o = {}) {
  if (!base) return null;
  const m = base.mesh, n = m.pos.length / 3, g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = m.gco[4 * i + 3] > 0.5 ? -1 : region(vOf(m, i), i, m.pos);
  const src = new Float32Array(n), uv = o.uv ? new Float32Array(2 * n) : null;
  for (let i = 0; i < n; i++) { src[i] = i; if (uv && g[i] > -0.5) { const [a, b2] = o.uv(vOf(m, i), i); uv[2 * i] = a; uv[2 * i + 1] = b2; } }
  const attrs = { canon: [m.canon, 3], part: [m.part, 4], share: [m.share, 4], gco: [m.gco, 4], nrm: [m.nrm, 3], src: [src, 1] };
  if (uv) attrs.uv = [uv, 2];
  const c = cutMesh(m, g, attrs);
  const k = c.pos.length / 3;
  if (!c.idx.length) return null;
  const N = c.nrm;
  for (let v = 0; v < k; v++) {
    const l = Math.hypot(N[3 * v], N[3 * v + 1], N[3 * v + 2]) || 1; N[3 * v] /= l; N[3 * v + 1] /= l; N[3 * v + 2] /= l;
    const d = o.dAt ? o.dAt(vOf(c, v), Math.round(c.src[v])) : o.d ?? 0.002;
    for (let j = 0; j < 3; j++) c.pos[3 * v + j] += N[3 * v + j] * d;
  }
  let out = { pos: c.pos, idx: c.idx, skin: c.skin, wts: c.wts, canon: c.canon, part: c.part, share: c.share, gco: c.gco };
  for (let v = 0; v < k; v++) { out.gco[4 * v + 3] = 0; if (c.uv) { out.gco[4 * v] = c.uv[2 * v]; out.gco[4 * v + 1] = c.uv[2 * v + 1]; } }
  const rimD = o.rim ?? (o.d ?? 0.002) + 0.0015;
  if (rimD > 0) out = rimHelper(out, N, rimD);
  out.nrm = normals(out);
  smoothNormals(out, null, o.nsmooth ?? 2, 0.6);
  return { mesh: out, hide: new Uint8Array(ctx.n), double: true, layer: base.layer, overlay: o.edge ?? 0.62 };
}

// thickness at the open edges: each border gets a band folded back along -N (wear.js' rim, for any mesh)
export function rimHelper(mesh, N, depth, out = 0) {
  const loops = borderLoops(mesh), n = mesh.pos.length / 3;
  if (!loops.length) return mesh;
  const extra = loops.reduce((a, l) => a + l.length, 0);
  const grow = (arr, w) => { const a = new arr.constructor(arr.length + extra * w); a.set(arr); return a; };
  const r = { pos: grow(mesh.pos, 3), skin: mesh.skin ? grow(mesh.skin, 4) : null, wts: mesh.wts ? grow(mesh.wts, 4) : null, canon: grow(mesh.canon, 3), part: grow(mesh.part, 4), share: grow(mesh.share, 4), gco: grow(mesh.gco, 4) };
  const idx = Array.from(mesh.idx);
  let k = n;
  for (const loop of loops) {
    const first = k;
    for (const v of loop) {
      for (let j = 0; j < 3; j++) r.pos[3 * k + j] = mesh.pos[3 * v + j] - N[3 * v + j] * depth + (j === 1 ? -out : 0);
      for (const [a, w] of [['skin', 4], ['wts', 4], ['canon', 3], ['part', 4], ['share', 4], ['gco', 4]]) if (r[a]) for (let j = 0; j < w; j++) r[a][w * k + j] = mesh[a][w * v + j];
      r.gco[4 * k + 3] = 1;
      k++;
    }
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length], a2 = first + i, b2 = first + (i + 1) % loop.length;
      idx.push(b, a, a2, b, a2, b2);
    }
  }
  return { ...r, idx: new Uint32Array(idx) };
}

// ---------- tubes: skirts, coat skirts, panels ----------
// o: { top, hem (canonical heights), off, flare (m at the hem), pleats, pleatDepth, follow, back,
//      sector: [a0, a1] (angles, 0 = front, + towards the left) for an open strip, wrap (meshes worn under it),
//      arms (s along the arm to wrap round too: ponchos), ruffle: { amp, n, band }, tiers: { n, step },
//      scallop: { n, depth }, step, segments, rim, smoothRound }
export function tubeHelper(ctx, o) {
  const yTop = fy(ctx, o.top), yHem = fy(ctx, o.hem), off = o.off ?? 0.008;
  const NR = o.segments || 80, step = o.step || 0.011, rows = Math.max(3, Math.ceil((yTop - yHem) / step));
  const B = ctx.body;
  let zc = 0, cnt = 0;
  for (let v = 0; v < ctx.n; v++) { const y = B.pos[3 * v + 1]; if (Math.abs(y - yTop) < 0.03 && B.part[4 * v] === 0) { zc += B.pos[3 * v + 2]; cnt++; } }
  zc = cnt ? zc / cnt : 0;
  // what to wrap round: the hips and legs, the arms (ponchos), and the garments already worn
  const src = [];
  const take = (m, own) => {
    const xs = [], n = m.pos.length / 3;
    for (let v = 0; v < n; v++) {
      const l = Math.round(m.part[4 * v]);
      if (l === 3) continue;
      if (l === 1 || m.share[4 * v] >= 0.3) { if (!(o.arms && l === 1 && m.part[4 * v + 1] < o.arms)) continue; }
      xs.push(m.pos[3 * v], m.pos[3 * v + 1], m.pos[3 * v + 2], own);
    }
    src.push(...[xs]);
  };
  take(B, 0);
  for (const m of o.wrap || []) take(m, 1);
  const a0 = o.sector ? o.sector[0] : 0, a1 = o.sector ? o.sector[1] : TAU, open = !!o.sector;
  const cols = open ? NR + 1 : NR;
  const ang = (i) => (open ? a0 + (a1 - a0) * i / NR : i / NR * TAU);
  // outline per angle bin round the full circle (sectors read the bins they cover)
  const NB2 = 96, binOf = (x, z) => ((Math.round((Math.atan2(x, z) / TAU) * NB2) % NB2) + NB2) % NB2;
  // each source point's radius and bin, bucketed by row (a point counts for rows within 1.6 cm of it)
  const rowY = (j) => lerp(yTop, yHem, j / rows), dy = (yTop - yHem) / rows, buckets = Array.from({ length: rows + 1 }, () => []);
  for (const xs of src) for (let j = 0; j < xs.length; j += 4) {
    const y = xs[j + 1]; if (y > yTop + 0.017 || y < yHem - 0.017) continue;
    const x = xs[j], z = xs[j + 2] - zc, r = Math.hypot(x, z) + (xs[j + 3] ? o.wrapOff ?? 0.0045 : off), bb = binOf(x, z);
    const j0 = Math.max(0, Math.ceil((yTop - y - 0.016) / dy)), j1 = Math.min(rows, Math.floor((yTop - y + 0.016) / dy));
    for (let k = j0; k <= j1; k++) buckets[k].push(bb, r);
  }
  const outer = (row, ring) => {
    ring.fill(0);
    const bk = buckets[row];
    for (let j = 0; j < bk.length; j += 2) if (bk[j + 1] > ring[bk[j]]) ring[bk[j]] = bk[j + 1];
    for (let it = 0; it < NB2; it++) { let gap = false; for (let i = 0; i < NB2; i++) if (!ring[i]) { const a = ring[(i + NB2 - 1) % NB2], b = ring[(i + 1) % NB2]; if (a || b) ring[i] = Math.max(a, b); else gap = true; } if (!gap) break; }
    for (let i = 0; i < NB2; i++) if (!ring[i]) ring[i] = 0.05;
    for (let it = 0; it < (o.smoothRound ?? 8); it++) { const c = ring.slice(); for (let i = 0; i < NB2; i++) ring[i] = Math.max(c[i], (c[(i + NB2 - 1) % NB2] + 2 * c[i] + c[(i + 1) % NB2]) / 4); }
  };
  const R = [], Y = [], ring = new Float32Array(NB2);
  let prev = null;
  const sc = o.scallop, tiers = o.tiers, ruf = o.ruffle;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows, y = lerp(yTop, yHem, t), out = new Float32Array(cols);
    outer(j, ring);
    for (let i = 0; i < cols; i++) {
      const th = ang(i), bf = ((th / TAU) * NB2), b0 = Math.floor(bf), w = bf - b0;
      const base = lerp(ring[((b0 % NB2) + NB2) % NB2], ring[(((b0 + 1) % NB2) + NB2) % NB2], w);
      const back = Math.max(0, -Math.cos(th));
      let r = base + (o.flare ?? 0.04) * Math.pow(t, o.flarePow ?? 1.3) + (o.back ?? 0.01) * back * t;
      if (prev) r = Math.max(r, prev[i] - 0.001);
      if (o.pleats) r += (o.pleatDepth ?? 0.008) * sstep(0, 0.45, t) * Math.abs(((th / TAU) * o.pleats * 2) % 2 - 1);
      if (tiers) r += tiers.step * Math.min(tiers.n - 1, Math.floor(t * tiers.n * 0.999));
      if (ruf) r += ruf.amp * sstep(1 - (ruf.band ?? 0.25), 1, t) * (0.6 + 0.4 * Math.sin(th * ruf.n));
      out[i] = r;
    }
    R.push(out); Y.push(y); prev = out;
  }
  // smooth the rings down the skirt (each ring comes from the points near its height: a little noisy)
  for (let it = 0; it < 3; it++) for (let j = 1; j < rows; j++) { const a = R[j - 1], b = R[j], c = R[j + 1]; for (let i = 0; i < cols; i++) b[i] = Math.max(b[i] - 0.0015, (a[i] + 2 * b[i] + c[i]) / 4); }
  const nv = (rows + 1) * cols, pos = new Float32Array(nv * 3), gco = new Float32Array(nv * 4), canon = new Float32Array(nv * 3), part = new Float32Array(nv * 4), share = new Float32Array(nv * 4);
  const skin = new Uint16Array(nv * 4), wts = new Float32Array(nv * 4);
  const hips = BONE.Hips, sp = BONE.Spine1, lt = BONE.LThigh, rt = BONE.RThigh, top0 = o.topBone ? BONE[o.topBone] : sp;
  const ext = yTop - yHem;
  for (let j = 0; j <= rows; j++) for (let i = 0; i < cols; i++) {
    const v = j * cols + i, th = ang(i), t = j / rows;
    let y = Y[j], cy = lerp(o.top, o.hem, t);
    if (sc) { const u = ((th / TAU) * sc.n) % 1, dip = sc.depth * Math.sin(Math.PI * (u < 0 ? u + 1 : u)); y -= dip * t; cy -= dip * t; }
    const r = R[j][i];
    pos[3 * v] = Math.sin(th) * r; pos[3 * v + 1] = y; pos[3 * v + 2] = zc + Math.cos(th) * r;
    gco[4 * v] = th * 0.15 - (th > Math.PI ? TAU * 0.15 : 0); gco[4 * v + 1] = cy; gco[4 * v + 2] = 6; gco[4 * v + 3] = 0;
    canon[3 * v] = Math.sin(th) * 0.16; canon[3 * v + 1] = cy; canon[3 * v + 2] = Math.cos(th) * 0.12;
    part[4 * v] = 0; part[4 * v + 1] = t; part[4 * v + 2] = Math.sin(th) >= 0 ? 1 : -1;
    const a = (o.follow ?? 0.5) * sstep(0.0, o.followRamp ?? 0.3, t * Math.max(1, ext / 0.35)), side = 0.5 + 0.5 * clamp(Math.sin(th) * (o.split ?? 2.5), -1, 1), top = (1 - sstep(0, 0.25, t)) * (o.topW ?? 0.4);
    skin[4 * v] = hips; skin[4 * v + 1] = lt; skin[4 * v + 2] = rt; skin[4 * v + 3] = top0;
    wts[4 * v] = (1 - a) * (1 - top); wts[4 * v + 1] = a * side * (1 - top); wts[4 * v + 2] = a * (1 - side) * (1 - top); wts[4 * v + 3] = top;
  }
  const idx = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < (open ? cols - 1 : cols); i++) {
    const a = j * cols + i, b = j * cols + (i + 1) % cols, c = (j + 1) * cols + i, d = (j + 1) * cols + (i + 1) % cols;
    idx.push(a, c, b, b, c, d);
  }
  let mesh = { pos, idx: new Uint32Array(idx), skin, wts, canon, part, share, gco };
  const N = normals(mesh);
  if ((o.rim ?? 0.004) > 0) mesh = rimHelper(mesh, N, o.rim ?? 0.004);
  mesh.nrm = normals(mesh);
  return { mesh, hide: new Uint8Array(ctx.n), double: true, layer: o.layer ?? 0 };
}

// ---------- small solids ----------
// a hood lying down: a rolled rim round the neck on the garment (mesh) and the hood's crown flat on
// the upper back; k is the head width, so a child's hood is as big as their head
export function hoodTree(ctx, mesh, o = {}) {
  const L = ctx.A.L, land = ctx.land, k = (o.size ?? 1) * L.hw;
  const pb = surfaceHelper(mesh, 0, land.shY + 0.03, -1), pf = surfaceHelper(mesh, 0, land.shY + 0.02, 1), pc = surfaceHelper(mesh, 0, land.shY - 0.075, -1);
  if (!pb || !pf || !pc) return null;
  const r = k * 0.12, zc = (pb.p[2] + pf.p[2]) / 2, half = (pf.p[2] - pb.p[2]) / 2;
  const tilt = Math.atan2(pb.p[1] - pf.p[1], 2 * half) * 0.8;
  const c = [0, (pb.p[1] + pf.p[1]) / 2 + r * 0.55, zc - r * 0.15];
  const roll = P.torus({ c, R: half + r * 0.5, r, q: [Math.sin(-tilt / 2), 0, 0, Math.cos(tilt / 2)], sc: [1.15, 1, 1] });
  const cc = [pc.p[0] + pc.n[0] * k * 0.05, pc.p[1] + pc.n[1] * k * 0.05 + k * 0.06, pc.p[2] + pc.n[2] * k * 0.05];
  const crown = P.ellipsoid({ c: cc, r: [k * 0.4, k * 0.42, k * 0.11], q: [Math.sin(0.1), 0, 0, Math.cos(0.1)] });
  let t = smin(k * 0.1, roll, crown);
  if (o.frontOpen !== false) t = sub(k * 0.02, t, P.box({ c: [0, c[1], pf.p[2] + r], h: [k * (o.gap ?? 0.06), k * 0.5, r * 1.6] }));
  return { tree: t, c, k, R: half + r * 0.5, r };
}
// a bow: two loops, a knot and two tails; c centre, s size (m), facing +z (or -z with back)
export function bowTree(c, s, o = {}) {
  const z = o.back ? -1 : 1, tilt = o.tilt ?? 0.25;
  const loops = [1, -1].map((m) => P.ellipsoid({ c: [c[0] + m * s * 0.55, c[1] + s * 0.06, c[2]], r: [s * 0.55, s * 0.36, s * 0.16], q: [0, 0, Math.sin(m * tilt / 2), Math.cos(tilt / 2)] }));
  const knot = P.ellipsoid({ c: [c[0], c[1], c[2] + z * s * 0.08], r: [s * 0.2, s * 0.24, s * 0.18] });
  const tails = o.tails === false ? [] : [1, -1].map((m) => P.rcone({ a: [c[0] + m * s * 0.08, c[1] - s * 0.1, c[2] + z * s * 0.04], b: [c[0] + m * s * 0.42, c[1] - s * (o.tailLen ?? 1.1), c[2] + z * s * 0.02], ra: s * 0.13, rb: s * 0.15, sc: [1, 1, 0.4] }));
  return smin(s * 0.08, ...loops, knot, ...tails);
}
// a solid's piece with the body's weights round a place, painted with one glsl
export function solidHelper(ctx, tree, o = {}) { return solid(ctx, tree, { cell: o.cell ?? 0.0028, verts: o.verts ?? 2500, smooth: 1, ...o }); }
// a point on a garment's surface nearest a canonical place (cx, cy, cz sign) -> { p, n }
export function surfaceHelper(mesh, cx, cy, front = 1, side = 0) {
  let best = -1, bd = 1e9;
  const n = mesh.pos.length / 3;
  for (let i = 0; i < n; i++) {
    if (mesh.gco[4 * i + 3] > 0.5 || mesh.canon[3 * i + 2] * front < 0) continue;
    if (side && Math.round(mesh.part[4 * i]) !== 0) continue;
    const dx = mesh.canon[3 * i] - cx, dy = mesh.canon[3 * i + 1] - cy, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) return null;
  return { p: [mesh.pos[3 * best], mesh.pos[3 * best + 1], mesh.pos[3 * best + 2]], n: [mesh.nrm[3 * best], mesh.nrm[3 * best + 1], mesh.nrm[3 * best + 2]], i: best };
}

// ---------- paint (GLSL snippets; vCanon is the reference body: x left, y up, z front) ----------
// buttons at canonical (x, y) on the front (front = -1: on the back): a disc, its rim and two holes
export function buttonsHelper(pts, r = 0.0065, color = 'uTrim', o = {}) {
  if (!pts.length) return '';
  const fr = o.front === -1 ? 'step(vCanon.z, 0.0)' : o.any ? '1.0' : 'step(0.0, vCanon.z)';
  const where = o.where || 'step(vG.z, 0.5)';
  return `{ vec2 q = vCanon.xy; float bb = 0.0, br = 0.0, bh = 0.0; vec2 bc;
    ${pts.map(([x, y]) => `bc = vec2(${f(x)}, ${f(y)}); bb = max(bb, circle(q, bc, ${f(r)})); br = max(br, ring(q, bc, ${f(r * 0.72)}, ${f(r * 0.16)})); bh = max(bh, circle(q, bc + vec2(${f(r * 0.28)}, 0.0), ${f(r * 0.14)}) + circle(q, bc - vec2(${f(r * 0.28)}, 0.0), ${f(r * 0.14)}));`).join('\n')}
    float bm = ${fr} * ${where}; vec3 bcol = ${color};
    col = mix(col, bcol, bb * bm); col = mix(col, bcol * 0.72, br * bm); col = mix(col, bcol * 0.45, bh * bm * ${o.holes === false ? '0.0' : '1.0'}); }`;
}
// a column of n buttons from y0 down to y1 at x
export const buttonRowHelper = (x, y0, y1, n) => Array.from({ length: n }, (_, i) => [x, n > 1 ? lerp(y0, y1, i / (n - 1)) : y0]);
// a zip down the front at x (teeth, tape, a pull at the top)
export function zipHelper(x, y0, y1, o = {}) {
  const tape = o.tape ?? 'col * 0.82', teeth = o.teeth ?? 'uTrim';
  return `{ vec2 q = vCanon.xy; float fz = step(0.0, vCanon.z) * step(vG.z, 0.5);
    col = mix(col, ${tape}, band(q.x, ${f(x - 0.0045)}, ${f(x + 0.0045)}) * band(q.y, ${f(y0)}, ${f(y1)}) * fz);
    col = mix(col, ${teeth}, zipper(q, ${f(x)}, ${f(y0)}, ${f(y1)}, 0.0042) * fz);
    col = mix(col, ${o.pull ?? 'uTrim'}, box2(q, vec2(${f(x + 0.002)}, ${f(y1 - 0.016)}), vec2(0.0035, 0.011), 0.002) * fz);
    col = mix(col, ${o.pull ?? 'uTrim'} * 0.6, boxLine(q, vec2(${f(x + 0.002)}, ${f(y1 - 0.016)}), vec2(0.0035, 0.011), 0.002, 0.0012) * fz); }`;
}
// stitching: a dashed line along a canonical line (horizontal at y or vertical at x) on a region
export const stitchHHelper = (y, where = 'step(vG.z, 0.5)', c = 'uTrim', w = 0.0011) => `col = mix(col, ${c}, dashes(vG.x, vCanon.y, ${f(y)}, ${f(w)}, 0.008, 0.005) * ${where});`;
export const stitchVHelper = (x, y0, y1, where = 'step(vG.z, 0.5) * step(0.0, vCanon.z)', c = 'uTrim', w = 0.0011) => `col = mix(col, ${c}, dashes(vCanon.y, vCanon.x, ${f(x)}, ${f(w)}, 0.008, 0.005) * band(vCanon.y, ${f(y0)}, ${f(y1)}) * ${where});`;
// knit rib (vertical lines) over a band of the body or sleeves: where = mask expression
export const ribHelper = (where, k = 0.82, period = 0.007) => `col = mix(col, col * ${k}, stripes(vG.x, ${f(period)}, ${f(period * 0.4)}) * (${where}));`;
// seams: side seams, shoulder seams and the armholes, slightly darker lines
export function seamsHelper(o = {}) {
  const out = [];
  out.push(`col = mix(col, col * 0.78, line(abs(vG.x), 0.218, 0.0016) * step(vG.z, 0.5));`);
  if (o.armhole !== false) out.push(`col = mix(col, col * 0.78, line(vShare.x, 0.5, 0.05) * step(0.2, vShare.x) * step(vShare.x, 0.8) * step(vG.z, 2.5));`);
  if (o.yoke) out.push(`col = mix(col, col * 0.8, line(vCanon.y, ${f(o.yoke)}, 0.0016) * step(vCanon.z, 0.0) * step(vG.z, 0.5) * step(vShare.x, 0.4));`);
  if (o.sleeve) out.push(`col = mix(col, col * 0.8, line(vG.x, 0.0, 0.0014) * step(0.5, vG.z) * step(vG.z, 2.5) * step(0.12, vPart.y));`);
  return out.join('\n');
}
// the inside of the cloth in another colour (linings)
export const liningHelper = (c = 'uSecond') => `if (!gl_FrontFacing) return ${c};`;
// a patch pocket's outline + stitching, canonical box centre c, half sizes h, round rd
export const pocketPaintHelper = (cx, cy, hx, hy, rd = 0.006, c = 'col * 0.7', front = 1) => `{ vec2 q = vCanon.xy; float fp = ${front > 0 ? 'step(0.0, vCanon.z)' : 'step(vCanon.z, 0.0)'};
  col = mix(col, ${c}, boxLine(q, vec2(${f(cx)}, ${f(cy)}), vec2(${f(hx - 0.004)}, ${f(hy - 0.004)}), ${f(Math.max(0.001, rd - 0.003))}, 0.0011) * stripes(q.x + q.y, 0.007, 0.0045) * fp);
  col = mix(col, col * 0.75, boxLine(q, vec2(${f(cx)}, ${f(cy)}), vec2(${f(hx)}, ${f(hy)}), ${f(rd)}, 0.0014) * fp); }`;

// ---------- the common pieces ----------
// lengths: a top's hem (canonical) from the item's length, the hem a little lower for layers worn over others
export function hemOfHelper(ctx, it, def = 'hip') { return topHem(ctx.land, it.params.length && it.params.length !== 'n/a' ? it.params.length : def); }
// the neck for a collar word / neckline word
export function neckForHelper(land, p) {
  const nk = p.neckline && p.neckline !== 'n/a' ? p.neckline : 'crew';
  if (nk === 'hood') return neckOf(land, 'crew');
  if (nk === 'collar') return neckOf(land, 'collar');
  return neckOf(land, nk);
}
// shirttail and other hem shapes: hemAt(V)
export function hemShapeHelper(land, hem, kind) {
  switch (kind) {
    case 'curved_shirttail': return (V) => hem - 0.03 + 0.042 * Math.pow(Math.abs(Math.sin(Math.atan2(V.cx, V.cz))), 6);
    case 'side_split': return (V) => hem + 0.06 * Math.exp(-Math.pow((Math.abs(Math.atan2(V.cx, V.cz)) - Math.PI / 2) / 0.09, 2));
    case 'points': return (V) => hem - (V.cz > 0 ? 0.035 * sstep(0.0, 0.05, Math.abs(V.cx)) * (1 - sstep(0.05, 0.11, Math.abs(V.cx))) : 0);
    default: return () => hem;
  }
}

// rib / contrast bands at the hem, cuffs and neck as one overlay; kinds: { hem, cuff, neck } widths (m)
export function bandsHelper(ctx, b, w, o = {}) {
  if (!b.piece) return null;
  const A = b.A;
  const ks = Object.keys(w).filter((k) => w[k]);
  const t = (i) => Math.min(...ks.map((k) => A[k][i] / w[k]));
  return overlayHelper(ctx, b.piece, (V, i) => 1 - t(i), { d: o.d ?? 0.0018, uv: (V, i) => [b.piece.mesh.gco[4 * i], t(i)], ...o });
}
const RIB = (base = 'uMain') => `vec3 col = ${base}; ${ribHelper('1.0', 0.84, 0.0055)} return col;`;

// a collar laid on the shoulders round the neckline: kind -> width round the back, the front's shape
// (point, button_down, camp, polo, peter_pan, round_flat, sailor, frilled, notched, shawl, wing)
export function collarHelper(ctx, b, kind, o = {}) {
  if (!b.piece) return null;
  const A = b.A, land = ctx.land;
  const wBack = o.w ?? ({ peter_pan: 0.032, round_flat: 0.045, sailor: 0.09, frilled: 0.03, camp: 0.034, polo: 0.03, point: 0.03, button_down: 0.03, wing: 0.012, notched: 0.03, shawl: 0.03 }[kind] ?? 0.03);
  const width = (V, i) => {
    const dn = A.neck[i];
    let w = wBack;
    const fx = Math.abs(V.cx), front = V.cz > 0.02;
    if (kind === 'sailor') {
      // a square flap on the back, narrowing to a V in front
      if (!front) return dn + Math.min(0.105 - fx, V.cy - (land.shY - 0.125), 0.16 - dn);
      return dn + Math.min(0.03 - dn + 0.04 * sstep(land.shY - 0.1, land.shY, V.cy), V.cy - (land.shY - 0.135));
    }
    if (front) {
      const drop = clamp((land.shY + 0.04 - V.cy) / 0.08);
      if (kind === 'point' || kind === 'button_down' || kind === 'polo' || kind === 'camp') {
        // points falling onto the chest beside the centre front
        const pt = kind === 'camp' ? 0.04 : kind === 'polo' ? 0.045 : 0.05, sx = kind === 'camp' ? 0.04 : 0.035;
        w = wBack + pt * Math.exp(-Math.pow((fx - sx) / 0.03, 2)) * (1 - 0.3 * drop);
        if (fx < 0.008) w = Math.min(w, 0.012);
      } else if (kind === 'peter_pan' || kind === 'round_flat') {
        // round ends meeting at the centre front
        w = wBack * (0.7 + 0.5 * Math.sqrt(clamp(fx / 0.05)));
      } else if (kind === 'frilled') w = wBack * (1 + 0.25 * Math.sin(Math.atan2(V.cx, V.cz) * 22));
    } else if (kind === 'frilled') w = wBack * (1 + 0.25 * Math.sin(Math.atan2(V.cx, V.cz) * 22));
    return w;
  };
  // paint coordinates: u round the neck, v = 0 at the neckline .. 1 at the collar's outer edge
  return overlayHelper(ctx, b.piece, (V, i) => (A.neck[i] > 0.2 ? -1 : width(V, i) - A.neck[i]), { d: o.d ?? 0.0028, uv: (V, i) => [Math.atan2(V.cx, V.cz) * 0.14, A.neck[i] / Math.max(0.005, width(V, i))] });
}
// a collar standing up the neck (mandarin, stand, band rib, funnel, mock, turtleneck): a body shell
// round the neck from the neckline up h (canonical), lifted a little more than the garment
export function standShell(ctx, it, b, h, o = {}) {
  const land = ctx.land, neck = o.neck || neckOf(land, 'crew'), extra = o.extra ?? 0.004;
  const open = o.open || 0;
  const cover = (V0) => {
    if (V0.limb !== 0 || V0.head > 0.5) return -0.1;
    const V = neckVHelper(ctx, V0);
    const top = land.shY + 0.035 + h - (V.cz > 0 ? (o.drop ?? 0) * Math.pow(clamp(V.cz / 0.06), 2) : 0);
    const g = Math.min(top - V.cy, -necklineHelper(V, land, neck) + 0.02, open && V.cz > 0 ? Math.abs(V.cx) - open : 1);
    return g;
  };
  return shell(ctx, { cover: clearHeadHelper(ctx, cover, o.room ?? 0.12), off: (V) => it.off + extra + (FIT[it.params.fit] || FIT.regular)[0] * 0.5 + 0.006 * sstep(land.shY + 0.03, land.shY + 0.06, V.cy), fill: 2, rim: o.rim ?? 0.004, hideMargin: 0.004 });
}
// a front placket strip (buttons or a henley / polo opening): canonical x half width w, from y0 down to y1
export function placketHelper(ctx, b, w, y0, y1, o = {}) {
  return overlayHelper(ctx, b.piece, (V) => (V.cz > 0 ? Math.min(w - Math.abs(V.cx - (o.x ?? 0)), y0 - V.cy, V.cy - y1) : -1), { d: o.d ?? 0.0016 });
}
// patch pockets as one overlay: boxes [cx, cy, hx, hy, round?, front?]
export function pocketsHelper(ctx, b, boxes, o = {}) {
  if (!b.piece || !boxes.length) return null;
  return overlayHelper(ctx, b.piece, (V) => {
    let g = -1;
    for (const [cx, cy, hx, hy, rd = 0.006, fr = 1] of boxes) {
      if (V.cz * fr <= 0.01) continue;
      const qx = Math.abs(V.cx - cx) - hx + rd, qy = Math.abs(V.cy - cy) - hy + rd;
      g = Math.max(g, -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rd));
    }
    return g;
  }, { d: o.d ?? 0.0022 });
}
// pocket boxes for a pockets word on a garment spanning hem..top, opening half gap `open`
export function pocketBoxesHelper(land, kind, hem, o = {}) {
  const top = land.shY, chest = land.chestY + 0.03, mid = (hem + land.waistY) / 2;
  const hip = Math.max(hem + 0.075, Math.min(land.waistY - 0.02, mid));
  const x0 = Math.max(0.065, (o.open || 0) + 0.045);
  switch (kind) {
    case 'chest_patch': return { patch: [[0.07, chest, 0.033, 0.038, 0.008]] };
    case 'zip_chest': return { zips: [[0.07, chest + 0.01]] };
    case 'chest_welt': return { welts: [[0.075, chest, 0.03]] };
    case 'pen_slot': return { welts: [[0.075, chest + 0.02, 0.012]] };
    case 'kangaroo': return { kangaroo: [hem + 0.035, Math.min(land.waistY + 0.03, hem + 0.19)] };
    case 'patch_hip': return { patch: [[x0 + 0.01, hip, 0.045, 0.048, 0.01], [-(x0 + 0.01), hip, 0.045, 0.048, 0.01]] };
    case 'slash': return { slash: [[x0 + 0.01, hip]] };
    case 'flap_cargo': return { patch: [[x0 + 0.012, hip, 0.047, 0.05, 0.005], [-(x0 + 0.012), hip, 0.047, 0.05, 0.005]], flaps: true };
    case 'utility_multi': return { patch: [[0.075, chest, 0.034, 0.036, 0.004], [-0.075, chest, 0.034, 0.036, 0.004], [x0 + 0.012, hip, 0.045, 0.045, 0.004], [-(x0 + 0.012), hip, 0.045, 0.045, 0.004]], flaps: true };
    case 'apron_front': return { patch: [[0, Math.max(hem + 0.07, land.waistY - 0.07), 0.07, 0.05, 0.012]] };
    default: return {};
  }
}
// the pockets of a garment: overlays (patch, flaps) + paint (welts, slashes, zips, stitching)
export function pocketsOfHelper(ctx, it, b, kind, hem, o = {}) {
  const land = ctx.land, pk = pocketBoxesHelper(land, kind, hem, o), pieces = [], paint = [];
  if (pk.patch) {
    const boxes = pk.patch.map(([x, y, hx, hy, rd]) => [x, y, hx * (o.scale ?? 1), hy * (o.scale ?? 1), rd]);
    const pc = pocketsHelper(ctx, b, boxes);
    if (pc) pieces.push({ piece: pc, extra: boxes.map(([x, y, hx, hy, rd]) => pocketPaintHelper(x, y, hx, hy, rd, o.stitch || 'col * 0.7')).join('\n') + (o.pocketColor ? `col = ${o.pocketColor};` : '') });
    if (pk.flaps) {
      const flaps = boxes.map(([x, y, hx, hy]) => [x, y + hy - 0.012, hx + 0.003, 0.015, 0.004]);
      const fl = pocketsHelper(ctx, b, flaps, { d: 0.0045 });
      if (fl) pieces.push({ piece: fl, extra: flaps.map(([x, y, hx, hy]) => pocketPaintHelper(x, y, hx, hy, 0.004, o.stitch || 'col * 0.7')).join('\n') + (o.flapColor ? `col = mix(col, ${o.flapColor}, 1.0);` : '') + buttonsHelper(flaps.map(([x, y]) => [x, y - 0.004]), 0.0045, o.button || 'uTrim') });
    }
  }
  if (pk.welts) for (const [x, y, w] of pk.welts) paint.push(`col = mix(col, col * 0.7, box2(vCanon.xy, vec2(${f(x)}, ${f(y)}), vec2(${f(w)}, 0.0035), 0.001) * step(0.0, vCanon.z) * step(vG.z, 0.5)); col = mix(col, col * 0.55, line(vCanon.y, ${f(y)}, 0.0012) * band(vCanon.x, ${f(x - w)}, ${f(x + w)}) * step(0.0, vCanon.z) * step(vG.z, 0.5));`);
  if (pk.slash) for (const [x, y] of pk.slash) for (const sx of [1, -1]) paint.push(`{ vec2 q = vCanon.xy - vec2(${f(sx * x)}, ${f(y)}); q = mat2(0.9, ${f(sx * 0.42)}, ${f(-sx * 0.42)}, 0.9) * q; col = mix(col, col * 0.62, box2(q, vec2(0.0), vec2(0.0025, 0.045), 0.001) * step(0.0, vCanon.z) * step(vG.z, 0.5)); col = mix(col, col * 0.85, box2(q, vec2(-0.004 * ${sx}.0, 0.0), vec2(0.004, 0.048), 0.002) * step(0.0, vCanon.z) * step(vG.z, 0.5)); }`);
  if (pk.zips) for (const [x, y] of pk.zips) paint.push(`{ vec2 q = vCanon.xy; float fz = step(0.0, vCanon.z) * step(vG.z, 0.5); col = mix(col, uTrim, zipper(q.yx, ${f(y)}, ${f(x - 0.03)}, ${f(x + 0.03)}, 0.003) * fz); col = mix(col, uAccent, box2(q, vec2(${f(x + 0.03)}, ${f(y - 0.008)}), vec2(0.003, 0.008), 0.0015) * fz); }`);
  if (pk.kangaroo) {
    const [y0, y1] = pk.kangaroo;
    const kp = overlayHelper(ctx, b.piece, (V) => (V.cz > 0.02 ? Math.min(V.cy - y0, y1 - V.cy, 0.085 + (V.cy - y0) * 0.35 * 0 - Math.abs(V.cx) - Math.max(0, V.cy - (y0 + y1) / 2) * 0.5) : -1), { d: 0.0024 });
    if (kp) pieces.push({ piece: kp, extra: `col = mix(col, col * 0.7, line(abs(vCanon.x) - (0.085 - max(0.0, vCanon.y - ${f((y0 + y1) / 2)}) * 0.5), -0.006, 0.0012) * band(vCanon.y, ${f((y0 + y1) / 2)}, ${f(y1)}));
      col = mix(col, uTrim, dashes(vG.x, vCanon.y, ${f(y0 + 0.006)}, 0.001, 0.008, 0.005));` });
  }
  return { pieces, paint: paint.join('\n') };
}

// cuffs: rib / contrast / button / turn-up / rolled / frilled / striped band, as overlays round the sleeve ends
export function cuffsHelper(ctx, b, kind, o = {}) {
  if (!b.piece || !kind || kind === 'none' || kind === 'n/a') return [];
  const A = b.A;
  const w = { rib: 0.045, contrast_band: 0.022, button: 0.05, turn_up: 0.05, rolled: 0.05, frilled: 0.03, striped_band: 0.045, elastic: 0.02 }[kind] ?? 0.03;
  const d = { rolled: 0.0055, turn_up: 0.004, frilled: 0.003 }[kind] ?? 0.0022;
  const pc = overlayHelper(ctx, b.piece, (V, i) => (V.limb === 1 ? w - A.cuff[i] : -1), { d, rim: d + 0.002 });
  if (!pc) return [];
  let extra = '';
  if (kind === 'rib' || kind === 'elastic') extra = (o.ribColor ? `col = ${o.ribColor};` : '') + ribHelper('1.0', 0.82, 0.006);
  else if (kind === 'contrast_band') extra = `col = ${o.color || 'uSecond'};`;
  else if (kind === 'button') extra = `col = col * 0.96; col = mix(col, col * 0.7, line(vPart.y, ${f(0.97 - w / 0.52)}, 0.004)); col = mix(col, ${o.button || 'uTrim'}, circle(vec2(vG.x, vPart.y), vec2(-0.02, 0.94), 0.006));`;
  else if (kind === 'turn_up' || kind === 'rolled') extra = `col = ${o.color || 'col * 0.92'}; col = mix(col, col * 0.75, line(vPart.y, ${f(0.97 - w / 0.52 * 0.5)}, 0.006));`;
  else if (kind === 'striped_band') extra = `col = mix(${o.color || 'uSecond'}, uTrim, stripes(vPart.y, 0.03, 0.012));`;
  else if (kind === 'frilled') extra = `col = ${o.color || 'uTrim'}; col = mix(col, col * 0.85, stripes(vG.x, 0.012, 0.004));`;
  if (o.tip) extra += `col = mix(col, ${o.tip}, line(vPart.y, ${f(0.97 - w / 0.52 * 0.35)}, 0.006) + line(vPart.y, ${f(0.97 - w / 0.52 * 0.65)}, 0.006));`;
  return [{ piece: pc, extra, noPattern: kind !== 'button' && kind !== 'rolled' }];
}

// a frill: a short flared ring hung off a garment's edge band (sleeve ends, hems, collars)
// as an overlay band whose lift grows towards the edge and waves round
export function frillHelper(ctx, b, edge, w, o = {}) {
  if (!b.piece) return null;
  const A = b.A, amp = o.amp ?? 0.008;
  return overlayHelper(ctx, b.piece, (V, i) => w - A[edge][i], {
    dAt: (V, i) => 0.002 + amp * clamp(1 - A[edge][i] / w) * (0.6 + 0.4 * Math.sin(Math.atan2(V.cx, V.cz) * (o.n ?? 26) + V.s * 60)), rim: 0.003,
  });
}

// ---------- tops (the builders) ----------
// what most tops share: the body shell from the params, its bands, collar, cuffs, pockets and paint
export function topHelper(ctx, it, o = {}) {
  const land = ctx.land, p = { ...it.params, ...(o.params || {}) }, pieces = [];
  const sleeveWord = o.sleeveWord ?? p.sleeve;
  const sl = o.sleeve ?? (SLEEVE[sleeveWord] ?? 0.3);
  let hem = o.hem ?? hemOfHelper(ctx, it);
  if (o.minHem) hem = Math.max(hem, o.minHem);
  const hemAt = o.hemAt || hemShapeHelper(land, hem, o.hemShape ?? p.hem);
  it.hemY = hem; it.topY = land.shY + 0.03;
  const puff = /puff/.test(sleeveWord) ? 0.012 : 0;
  const bell = sleeveWord === 'bell_long' ? 0.03 : sleeveWord === 'kimono_wide' ? 0.045 : 0;
  const b = bodyShell(ctx, it, {
    hem, hemAt, neck: o.neck || neckForHelper(land, p), sleeve: sl, open: o.open, openAt: o.openAt, puff: o.puff ?? puff, bell: o.bell ?? bell,
    elastic: o.elastic, quilt: o.quilt, ease: o.ease, hang: o.hang, off: o.off, legs: o.legs, neckUp: o.neckUp, fill: o.fill, cover: o.cover,
  });
  if (!b.piece) return { pieces, b };
  remember(ctx, b.piece);
  const extra = [o.paint || '', seamsHelper({ yoke: o.yoke, sleeve: o.sleeveSeam })];
  pieces.push({ piece: b.piece, extra: '', _main: true });
  return { pieces, b, hem, sl, extra, p, it };
}
// the catalogue's 'stars' pattern drawn with each star masked to its disc (LIB's star() is not a clean
// field far from its centre, so the shared pattern floods the cell)
export function starsHelper(pt = {}) {
  const role = pt.colour || (pt.colours || [])[0];
  const c = { main: 'uMain', second: 'uSecond', accent: 'uAccent', trim: 'uTrim' }[role] || 'uAccent', per = pt.density === 'sparse' || pt.type === 'print_motif' ? 0.06 : 0.042, r = pt.scale === 'small' ? 0.006 : 0.008;
  return `{ vec2 sp = vG.xy / ${f(per)}; sp.x += 0.5 * mod(floor(sp.y), 2.0); vec2 sq = (fract(sp) - 0.5) * ${f(per)}; col = mix(col, ${c}, star(sq, vec2(0.0), ${f(r)}) * circle(sq, vec2(0.0), ${f(r * 1.05)})); }`;
}
export function finishHelper(r) {
  const main = r.pieces.find((x) => x._main);
  if (main) { main.extra = r.extra.join('\n'); delete main._main; }
  const pt = r.it && r.it.pattern;
  if (pt && (pt.type === 'stars' || (pt.type === 'print_motif' && pt.placement === 'all_over_sparse'))) for (const pc of r.pieces) if (pc && !pc.glsl && !pc.noPattern) { pc.noPattern = true; pc.extra = (pc.extra || '') + starsHelper(pt); }
  return edgesHelper(r.pieces);
}
// overlays get a darker folded edge (it reads as the ink line of a layer of cloth)
export function edgesHelper(pieces) {
  const out = pieces.filter((x) => x && x.piece);
  for (const pc of out) {
    const k = pc.piece.overlay;
    if (!k || pc._edged) continue;
    const e = `col = mix(col, col * ${f(k)}, step(0.5, vG.w));`;
    if (pc.glsl) pc.glsl = pc.glsl.replace(/return col;\s*$/, e + ' return col;');
    else pc.extra = (pc.extra || '') + e;
    pc._edged = true;
  }
  return out;
}
// the parts every top gets from its words: hem band, cuffs, neck band / collar, pockets, closure paint
export function wordsHelper(ctx, it, r, o = {}) {
  const land = ctx.land, p = r.p, b = r.b, P = r.pieces, X = r.extra;
  if (!b.piece) return;
  // hem
  const hemKind = o.hemKind ?? p.hem;
  if (hemKind === 'rib_band' || hemKind === 'contrast_band' || hemKind === 'elastic') {
    const pc = bandsHelper(ctx, b, { hem: hemKind === 'contrast_band' ? 0.028 : 0.045 }, { d: 0.002 });
    if (pc) P.push({ piece: pc, glsl: hemKind === 'contrast_band' ? `vec3 col = ${o.hemColor || 'uSecond'}; return col;` : RIB(o.ribColor || 'uMain'), noPattern: true });
  }
  if (hemKind === 'ruffle' || hemKind === 'scalloped' || hemKind === 'lace_trim') {
    const fr = frillHelper(ctx, b, 'hem', 0.03, { amp: hemKind === 'ruffle' ? 0.01 : 0.004 });
    if (fr) P.push({ piece: fr, glsl: `vec3 col = ${hemKind === 'lace_trim' ? 'uTrim' : 'uMain'}; col = mix(col, col * 0.85, stripes(vG.x, 0.014, 0.004)); return col;`, noPattern: true });
  }
  // cuffs
  if (r.sl > 0) {
    const ck = o.cuffs ?? p.cuffs;
    if (sleeveWordRolled(p.sleeve) && (!ck || ck === 'none' || ck === 'n/a')) P.push(...cuffsHelper(ctx, b, 'rolled', o));
    else P.push(...cuffsHelper(ctx, b, ck, { color: o.cuffColor, ribColor: o.ribColor, button: o.button, tip: o.cuffTip }));
  }
  // neck
  const collar = o.collar ?? (p.collar && p.collar !== 'none' ? p.collar : null);
  const nk = p.neckline;
  if (!collar && (nk === 'crew' || nk === 'scoop' || nk === 'v' || nk === 'boat' || nk === 'jewel' || nk === 'square' || nk === 'henley') && o.neckBand !== false) {
    const pc = bandsHelper(ctx, b, { neck: o.neckBandW ?? 0.016 }, { d: 0.0018 });
    const tipG = o.neckTip ? `col = mix(col, ${o.neckTip}, line(vG.y, 0.35, 0.12) + line(vG.y, 0.65, 0.12));` : '';
    if (pc) P.push({ piece: pc, glsl: `vec3 col = ${has(p, 'collar_contrast') || o.neckColor ? o.neckColor || 'uSecond' : 'uMain'}; ${ribHelper('1.0', 0.86, 0.005)} ${tipG} return col;`, noPattern: true });
  }
  if (!r.sl || r.sl < 0) {
    if (o.armBand) { const pc = bandsHelper(ctx, b, { arm: 0.012 }, { d: 0.0015 }); if (pc) P.push({ piece: pc, glsl: `return ${o.armBand};`, noPattern: true }); }
  }
  // pockets
  const pk = o.pockets ?? p.pockets;
  if (pk && pk !== 'none') {
    const res = pocketsOfHelper(ctx, it, b, pk, r.hem, { open: o.open, ...(o.pocketOpts || {}) });
    P.push(...res.pieces); X.push(res.paint);
  }
}
const sleeveWordRolled = (w) => w === 'rolled_elbow';

// a shirt collar of any kind on a body (stand + fall, or a flat collar), with its paint
export function collarPiecesHelper(ctx, it, r, kind, o = {}) {
  const land = ctx.land, b = r.b, P = r.pieces;
  if (!b.piece || !kind || kind === 'none') return;
  const color = o.color || (has(r.p, 'collar_contrast') ? 'uSecond' : null);
  const paint = (base) => `vec3 col = ${color || base}; ${o.collarPaint || ''} return col;`;
  if (['mandarin', 'stand', 'band_rib', 'funnel', 'mock', 'turtleneck', 'wing'].includes(kind)) {
    const h = { mandarin: 0.03, stand: 0.035, band_rib: 0.022, funnel: 0.05, mock: 0.03, turtleneck: 0.06, wing: 0.03 }[kind];
    const st = standShell(ctx, it, b, h, { open: o.open, drop: o.drop ?? (kind === 'mandarin' ? 0.01 : 0) });
    if (st) P.push({ piece: st, glsl: kind === 'band_rib' || kind === 'turtleneck' || kind === 'mock' ? `vec3 col = ${color || 'uMain'}; ${ribHelper('1.0', 0.84, 0.006)} ${o.collarPaint || ''} return col;` : paint('uMain'), noPattern: kind !== 'mandarin' && kind !== 'stand' });
    if (kind === 'wing') { const c = collarHelper(ctx, b, 'wing', { w: 0.012 }); if (c) P.push({ piece: c, glsl: paint('uMain'), noPattern: true }); }
    return;
  }
  if (kind === 'point' || kind === 'button_down' || kind === 'polo' || kind === 'camp' || kind === 'notched' || kind === 'shawl') {
    if (kind !== 'camp' && kind !== 'notched' && kind !== 'shawl') {
      const st = standShell(ctx, it, b, 0.016, { open: 0.006 });
      if (st) P.push({ piece: st, glsl: paint('uMain'), noPattern: !!color });
    }
  }
  const c = collarHelper(ctx, b, kind === 'notched' || kind === 'shawl' ? 'point' : kind, o);
  if (c) P.push({ piece: c, glsl: o.collarGlsl || paint('uMain') + '', noPattern: !!color || !!o.collarGlsl, extra: '' });
  if (kind === 'button_down') r.extra.push(buttonsHelper([[0.075, land.shY - 0.012], [-0.075, land.shY - 0.012]], 0.0035, 'uTrim'));
}

// ---------- the top archetypes ----------
function shirtLike(ctx, it, o = {}) {
  const land = ctx.land, r = topHelper(ctx, it, o);
  if (!r.b.piece) return [];
  wordsHelper(ctx, it, r, o);
  return r;
}
export function tee(ctx, it) {
  const r = shirtLike(ctx, it);
  if (!r.b) return [];
  const p = r.p;
  if (p.pockets === 'chest_patch') r.extra.push(`col = mix(col, uAccent, band(vCanon.y, ${f(r.hem + 0.012)}, ${f(r.hem + 0.02)}) * step(vG.z, 0.5));`);
  return finishHelper(r);
}
export function tee_longsleeve(ctx, it) {
  const r = shirtLike(ctx, it, { cuffs: it.params.cuffs === 'contrast_band' ? 'rib' : it.params.cuffs });
  if (!r.b) return [];
  // the layered look: a tee's short sleeve over the long one
  if (it.pattern && it.pattern.type === 'colour_block' && it.pattern.layout === 'sleeves_contrast') {
    const sh = overlayHelper(ctx, r.b.piece, (V) => (V.limb === 1 ? 0.3 - V.s : V.arm - 0.38), { d: 0.003 });
    if (sh) r.pieces.push({ piece: sh, glsl: 'vec3 col = uMain; return col;' });
  }
  return finishHelper(r);
}
export function tee_raglan(ctx, it) {
  const r = shirtLike(ctx, it);
  if (!r.b) return [];
  // raglan seams: from the neck to the underarm
  r.extra.push(`{ float rs = abs(abs(vCanon.x) - (0.06 + (${f(ctx.land.shY + 0.04)} - vCanon.y) * 0.9)); col = mix(col, col * 0.75, aa(rs - 0.0015) * step(vG.z, 0.5) * band(vCanon.y, ${f(ctx.land.shY - 0.11)}, ${f(ctx.land.shY + 0.05)})); }`);
  if (has(r.p, 'raglan_contrast')) r.extra.push(`col = mix(col, uMain, step(0.5, vG.z) * step(vG.z, 2.5) + step(vG.z, 0.5) * step(abs(vCanon.x), 0.3) * step(0.06 + (${f(ctx.land.shY + 0.04)} - vCanon.y) * 0.9, abs(vCanon.x)) * step(${f(ctx.land.shY - 0.11)}, vCanon.y));`);
  return finishHelper(r);
}
export function tank(ctx, it) {
  const r = shirtLike(ctx, it, { sleeve: -1, armBand: has(it.params, 'piping') ? 'uTrim' : 'uMain * 0.9', neckColor: has(it.params, 'piping') ? 'uTrim' : null });
  return r.b ? finishHelper(r) : [];
}
export function henley(ctx, it) {
  const land = ctx.land, r = shirtLike(ctx, it, { params: { neckline: 'crew' } });
  if (!r.b) return [];
  const y0 = land.shY + 0.03, y1 = land.shY - 0.1;
  const pl = placketHelper(ctx, r.b, 0.014, y0, y1);
  const btn = has(r.p, 'buttons_wood') ? 'vec3(0.55, 0.38, 0.22)' : 'uTrim';
  if (pl) r.pieces.push({ piece: pl, extra: `col = mix(col, col * 0.7, line(vCanon.x, 0.0, 0.0012) * step(${f(y1 + 0.012)}, vCanon.y));` + stitchVHelper(0.011, y1, y0) + stitchVHelper(-0.011, y1, y0) + buttonsHelper(buttonRowHelper(0, y0 - 0.025, y1 + 0.015, 3), 0.0048, btn) });
  return finishHelper(r);
}
export function polo(ctx, it) {
  const tip = has(it.params, 'tipping_stripes');
  const land = ctx.land, r = shirtLike(ctx, it, { params: { neckline: 'crew' }, collar: 'none', neckBand: false, cuffTip: tip ? 'uAccent' : null });
  if (!r.b) return [];
  collarPiecesHelper(ctx, it, r, 'polo', { collarPaint: tip ? 'col = mix(col, uAccent, line(vG.y, 0.8, 0.07) + line(vG.y, 0.62, 0.07));' : '' });
  if (has(r.p, 'embroidery_small')) r.extra.push(`col = mix(col, uAccent, flower(vCanon.xy, vec2(0.075, ${f(land.chestY + 0.04)}), 0.01, 5.0) * step(0.0, vCanon.z) * step(vG.z, 0.5));`);
  const y0 = land.shY + 0.03, y1 = land.shY - 0.085;
  const pl = placketHelper(ctx, r.b, 0.015, y0, y1);
  if (pl) r.pieces.push({ piece: pl, extra: `col = mix(col, col * 0.7, line(vCanon.x, 0.0, 0.0012) * step(${f(y1 + 0.012)}, vCanon.y));` + stitchVHelper(0.012, y1, y0) + stitchVHelper(-0.012, y1, y0) + buttonsHelper(buttonRowHelper(0, y0 - 0.03, y1 + 0.016, 2), 0.0045, 'uTrim') });
  return finishHelper(r);
}
// shirts: a collar (point / button-down / camp / peter pan), a button placket, cuffs, yoke, pockets
export function shirtHelper(ctx, it, o = {}) {
  const land = ctx.land, p = it.params;
  const r = shirtLike(ctx, it, { yoke: land.shY - 0.06, collar: 'none', neckBand: false, ...o });
  if (!r.b) return r;
  const kind = o.collar ?? (p.collar && p.collar !== 'none' ? p.collar : 'point');
  collarPiecesHelper(ctx, it, r, kind, o.collarOpts || {});
  const y0 = land.shY + 0.025, y1 = r.hem + 0.01, btn = o.button || (has(p, 'buttons_contrast') ? 'uAccent' : has(p, 'buttons_brass') ? 'vec3(0.86, 0.7, 0.32)' : has(p, 'buttons_wood') ? 'vec3(0.55, 0.38, 0.22)' : has(p, 'buttons_pearl') ? 'vec3(0.96, 0.94, 0.9)' : 'uTrim');
  if (o.placket !== false) {
    const pl = placketHelper(ctx, r.b, 0.015, y0, y1 - 0.02, { d: 0.0013 });
    const n = Math.max(4, Math.round((y0 - y1) / 0.075));
    if (pl) r.pieces.push({ piece: pl, extra: `${o.placketColor ? `col = ${o.placketColor};` : ''} col = mix(col, col * 0.72, line(vCanon.x, 0.015, 0.0012));` + stitchVHelper(0.011, y1, y0, 'step(0.0, vCanon.z)', 'col * 0.7') + stitchVHelper(-0.011, y1, y0, 'step(0.0, vCanon.z)', 'col * 0.7') + buttonsHelper(buttonRowHelper(0, y0 - 0.04, y1 + 0.03, n), 0.0045, btn, { where: '1.0' }) });
  }
  return r;
}
export function button_shirt(ctx, it) {
  const r = shirtHelper(ctx, it);
  if (!r.b) return [];
  const p = r.p, land = ctx.land;
  if (has(p, 'patch_flag')) r.extra.push(`{ vec2 q = vCanon.xy - vec2(0.075, ${f(land.chestY + 0.06)}); float fl = box2(q, vec2(0.0), vec2(0.012, 0.008), 0.001) * step(0.0, vCanon.z) * step(vG.z, 0.5); col = mix(col, mix(uSecond, uTrim, step(0.0, q.x)), fl); }`);
  if (has(p, 'name_badge')) r.extra.push(`{ vec2 q = vCanon.xy - vec2(-0.075, ${f(land.chestY + 0.035)}); float nb = box2(q, vec2(0.0), vec2(0.03, 0.011), 0.003) * step(0.0, vCanon.z) * step(vG.z, 0.5); col = mix(col, uAccent, nb); col = mix(col, uMain * 0.6, nb * stripes(q.x, 0.005, 0.0025) * band(q.y, -0.002, 0.002) * band(q.x, -0.022, 0.022)); }`);
  if (has(p, 'stitch_contrast')) r.extra.push(stitchHHelper(r.hem + 0.008, 'step(vG.z, 0.5)', 'uAccent'));
  if (has(p, 'zip_pulls')) r.extra.push(`col = mix(col, uAccent, box2(vCanon.xy, vec2(0.10, ${f(land.chestY + 0.035)}), vec2(0.003, 0.009), 0.0015) * step(0.0, vCanon.z) * step(vG.z, 0.5));`);
  return finishHelper(r);
}
export function camp_shirt(ctx, it) { const r = shirtHelper(ctx, it, { collar: 'camp', params: { neckline: 'v' }, neck: { shape: 'v', front: ctx.land.shY - 0.05, back: ctx.land.shY + 0.045, width: 0.05 } }); return r.b ? finishHelper(r) : []; }
export function pyjama_shirt(ctx, it) {
  const land = ctx.land, r = shirtHelper(ctx, it, { collar: 'notched', neck: { shape: 'v', front: land.shY - 0.07, back: land.shY + 0.045, width: 0.055 }, button: 'uSecond' });
  if (!r.b) return [];
  if (has(r.p, 'piping')) { const pc = bandsHelper(ctx, r.b, { neck: 0.006, hem: 0.006 }, { d: 0.0024 }); if (pc) r.pieces.push({ piece: pc, glsl: 'vec3 col = uSecond; return col;', noPattern: true }); }
  return finishHelper(r);
}
// blouses: peter pan collar or a bow at the neck, puff sleeves
export function blouse(ctx, it) {
  const land = ctx.land, p = it.params;
  const kind = p.collar === 'peter_pan' ? 'peter_pan' : p.neckline === 'bow_neck' ? 'mandarin' : p.collar && p.collar !== 'none' ? p.collar : 'peter_pan';
  const r = shirtHelper(ctx, it, { collar: kind, collarOpts: { color: kind === 'peter_pan' ? 'uTrim' : null, collarPaint: kind === 'peter_pan' ? `col = mix(col, uAccent, step(0.5, vG.w));` : '' }, button: has(p, 'buttons_contrast') ? 'uSecond' : 'uTrim', params: { neckline: 'collar' } });
  if (!r.b) return [];
  if (p.neckline === 'bow_neck' || has(p, 'bow')) {
    const L = ctx.A.L, at = surfaceHelper(r.b.piece.mesh, 0, land.shY + 0.03, 1);
    if (at) {
      const s = L.hw * 0.2;
      const pc = solidHelper(ctx, bowTree([at.p[0], at.p[1] - s * 0.2, at.p[2] + s * 0.25], s, { tailLen: 1.6 }), { cell: Math.max(0.003, s * 0.05), verts: 4000 });
      if (pc) r.pieces.push({ piece: pc, glsl: 'vec3 col = uSecond; return col;', noPattern: true });
    }
  }
  if (/puff/.test(p.sleeve)) r.extra.push(`col = mix(col, col * 0.86, stripes(vG.x, 0.016, 0.003) * step(0.5, vG.z) * step(vG.z, 2.5) * (1.0 - smoothstep(0.02, 0.12, abs(vPart.y - ${f(0.12)}))));`);
  return finishHelper(r);
}
// a smock blouse: gathered from a yoke, a white V inset, a ribbon tie at the waist
export function blouse_smock(ctx, it) {
  const land = ctx.land, p = it.params, yoke = land.shY - 0.07;
  const r = shirtLike(ctx, it, { hang: 0.95, ease: 0.01 });
  if (!r.b) return [];
  r.extra.push(`col = mix(col, col * 0.84, stripes(vG.x, 0.014, 0.004) * step(vG.z, 0.5) * step(vCanon.y, ${f(yoke)}) * smoothstep(${f(yoke - 0.12)}, ${f(yoke)}, vCanon.y));`);
  r.extra.push(`col = mix(col, col * 0.7, line(vCanon.y, ${f(yoke)}, 0.0015) * step(vG.z, 0.5));`);
  if (has(p, 'lace_collar')) {
    const pc = overlayHelper(ctx, r.b.piece, (V, i) => (V.cz > 0 ? 0.014 - r.b.A.neck[i] : -1), { d: 0.002 });
    if (pc) r.pieces.push({ piece: pc, glsl: `vec3 col = uTrim; col = mix(col, col * 0.8, dotsHex(vCanon.xy, 0.008, 0.0016)); return col;`, noPattern: true });
  }
  if (has(p, 'ribbon_sash')) sashHelper(ctx, it, r, land.waistY + 0.01, 0.014, { bow: true });
  return finishHelper(r);
}
// a sash / waistband round a garment at canonical y (half height h), optional bow at the front or back
export function sashHelper(ctx, it, r, y, h, o = {}) {
  const b = r.b;
  const pc = overlayHelper(ctx, b.piece, (V) => (V.limb === 0 ? h - Math.abs(V.cy - y) : -1), { d: o.d ?? 0.003 });
  if (pc) r.pieces.push({ piece: pc, glsl: `vec3 col = ${o.color || 'uAccent'}; ${o.paint || ''} return col;`, noPattern: true });
  if (o.bow) {
    const at = surfaceHelper(b.piece.mesh, o.back ? 0 : 0.05, y, o.back ? -1 : 1);
    if (at) {
      const s = ctx.A.L.hw * (o.bowSize ?? 0.2), z = o.back ? -1 : 1;
      const bp = solidHelper(ctx, bowTree([at.p[0], at.p[1], at.p[2] + z * (s * 0.2 + (o.d ?? 0.003))], s, { back: o.back, tailLen: 1.4 }), { cell: Math.max(0.003, s * 0.05), verts: 4000 });
      if (bp) r.pieces.push({ piece: bp, glsl: `vec3 col = ${o.color || 'uAccent'}; return col;`, noPattern: true });
    }
  }
  return pc;
}
// babydoll: a short bodice and a skirt flaring from under the bust
export function tee_babydoll(ctx, it) {
  const land = ctx.land, under = land.chestY - 0.035;
  const r = shirtLike(ctx, it, { hang: 0.3 });
  if (!r.b) return [];
  const sk = tubeHelper(ctx, { top: under, hem: r.hem - 0.01, off: it.off + 0.004, flare: 0.045, follow: 0.2, wrap: [r.b.piece.mesh], layer: it.layer, topBone: 'Spine2', rim: 0.003 });
  if (sk) r.pieces.push({ piece: remember(ctx, sk), extra: `col = mix(col, col * 0.86, stripes(vG.x, 0.016, 0.004) * smoothstep(${f(under - 0.07)}, ${f(under)}, vCanon.y));` });
  r.extra.push(`col = mix(col, col * 0.75, line(vCanon.y, ${f(under)}, 0.0015) * step(vG.z, 0.5));`);
  return finishHelper(r);
}
// ruffle top: cap sleeves, square neck, three scalloped tiers from under the bust
export function ruffle_top(ctx, it) {
  const land = ctx.land, under = land.chestY - 0.02;
  const r = shirtLike(ctx, it, { hang: 0.4, hemKind: 'plain' });
  if (!r.b) return [];
  const n = 3, top = under, hem = r.hem - 0.015, wrap = [r.b.piece.mesh];
  for (let k = 0; k < n; k++) {
    const t0 = lerp(top, hem, k / n) + 0.012, t1 = lerp(top, hem, (k + 1) / n) - (k === n - 1 ? 0 : -0.008);
    const tb = tubeHelper(ctx, { top: t0, hem: t1, off: it.off + 0.004 + k * 0.004, flare: 0.022, follow: 0.15, wrap, scallop: has(it.params, 'scallop_edge') ? { n: 18, depth: 0.012 } : null, ruffle: { amp: 0.004, n: 30, band: 0.6 }, layer: it.layer, topBone: 'Spine2', rim: 0.003 });
    if (tb) { wrap.push(tb.mesh); r.pieces.push({ piece: tb, uP: [[hem, top, 0, 0], [0, 0, 0, 0]] }); }
  }
  for (const tb of r.pieces.slice(-n)) remember(ctx, tb.piece);
  return finishHelper(r);
}
// a sailor blouse: the square sailor collar with stripes, a bow at the V
export function sailor_blouse(ctx, it) { const r = sailorHelper(ctx, it, shirtLike(ctx, it, { params: { neckline: 'sailor' }, neckBand: false, collar: 'none' })); return r.b ? finishHelper(r) : []; }
export function sailorHelper(ctx, it, r) {
  if (!r.b || !r.b.piece) return r;
  const land = ctx.land, p = it.params;
  const c = collarHelper(ctx, r.b, 'sailor', { d: 0.003 });
  // two stripes in the trim colour round the flap's edge (distance to the edge from the canonical box)
  if (c) r.pieces.push({ piece: c, glsl: `vec3 col = uSecond; vec2 q = vCanon.xy;
    float bk = step(vCanon.z, 0.0);
    float e = min(0.105 - abs(q.x), q.y - ${f(land.shY - 0.125)});
    vec3 st = distance(uTrim, uSecond) < 0.1 ? uMain : uTrim;
    col = mix(col, st, (line(e, 0.011, 0.0035) + line(e, 0.019, 0.0035)) * bk);
    col = mix(col, st, (line(vG.y, 0.72, 0.06) + line(vG.y, 0.86, 0.06)) * (1.0 - bk));
    return col;`, noPattern: true });
  // the bow at the V
  {
    const at = surfaceHelper(r.b.piece.mesh, 0, land.shY - 0.1, 1);
    if (at) {
      const s = ctx.A.L.hw * 0.19;
      const pc = solidHelper(ctx, bowTree([at.p[0], at.p[1] + s * 0.1, at.p[2] + s * 0.28], s, { tailLen: 1.5 }), { cell: Math.max(0.003, s * 0.05), verts: 4000 });
      if (pc) r.pieces.push({ piece: pc, glsl: 'return uAccent;', noPattern: true });
    }
  }
  return r;
}
// knits: rib bands everywhere, knit texture, cables, a turtleneck fold
export function sweater(ctx, it) {
  const land = ctx.land, p = it.params, turtle = p.neckline === 'turtleneck';
  const tip = has(p, 'tipping_stripes') ? 'uAccent' : null;
  const r = shirtLike(ctx, it, { neckBand: !turtle, params: turtle ? { neckline: 'crew' } : {}, neckTip: tip, cuffTip: tip });
  if (!r.b) return [];
  knitPaintHelper(ctx, r, p);
  if (turtle) collarPiecesHelper(ctx, it, r, 'turtleneck');
  return finishHelper(r);
}
export function knitPaintHelper(ctx, r, p) {
  const land = ctx.land;
  if (has(p, 'rib_knit') || has(p, 'cable_knit')) r.extra.push(`col = mix(col, col * 0.93, stripes(vG.x, 0.009, 0.003));`);
  if (has(p, 'cable_knit')) r.extra.push(`{ vec2 q = vCanon.xy; float fr = step(0.0, vCanon.z) * step(vG.z, 0.5); float cab = 0.0;
    for (int i = -1; i <= 1; i++) { float x = float(i) * 0.055; float w = abs(q.x - x);
      float lob = abs(w - 0.008 * abs(sin(q.y / 0.03 * 3.14159))) ; cab = max(cab, aa(lob - 0.0022) * step(w, 0.016));
      cab = max(cab, (line(w, 0.017, 0.0016)) * 0.8); }
    col = mix(col, col * 0.78, cab * fr * step(vCanon.y, ${f(land.shY - 0.02)})); }`);
}
export function turtleneck(ctx, it) {
  const p = it.params, r = shirtLike(ctx, it, { neckBand: false, params: { neckline: 'crew' }, armBand: 'uMain * 0.92' });
  if (!r.b) return [];
  knitPaintHelper(ctx, r, { details: ['rib_knit'] });
  collarPiecesHelper(ctx, it, r, 'turtleneck');
  return finishHelper(r);
}
export function sweatshirt(ctx, it) {
  const r = shirtLike(ctx, it);
  if (!r.b) return [];
  // the little rib V under the neck band
  r.extra.push(`col = mix(col, col * 0.85, aa(abs(abs(vCanon.x) * 1.4 - (vCanon.y - ${f(ctx.land.shY + 0.0)})) - 0.002) * band(vCanon.y, ${f(ctx.land.shY - 0.005)}, ${f(ctx.land.shY + 0.03)}) * step(0.0, vCanon.z) * step(vG.z, 0.5));`);
  return finishHelper(r);
}
// a hoodie: the hood down on the back (lining in the second colour), drawcords, kangaroo pocket
export function hoodie(ctx, it) {
  const land = ctx.land, p = it.params;
  const r = shirtLike(ctx, it, { neckBand: false, params: { neckline: 'crew' }, hemColor: has(p, 'hood_lining_contrast') ? 'uSecond' : null });
  if (!r.b) return [];
  hoodPiecesHelper(ctx, it, r, { frontOpen: false, cords: has(p, 'drawcords') });
  return finishHelper(r);
}
// the hood (+ cords) on any garment
export function hoodPiecesHelper(ctx, it, r, o = {}) {
  const p = it.params, A = r.b.A, land = ctx.land, L = ctx.A.L;
  const lining = has(p, 'hood_lining_contrast') || has(p, 'lining_contrast') ? 'uSecond' : 'uMain * 0.8';
  // the hood lies down as a cheap overlay of the garment: a thick roll round the neckline (its lining on
  // the inner half) running into the hood's crown, a pillow on the upper back. Sized by the head.
  const k = (o.size ?? 1) * L.hw / (L.H / land.H), w = 0.05, amp = 0.09 * k * (L.H / land.H);
  const yb = land.shY - 0.03, front = (i) => (A.front[i] < 5 ? A.front[i] : 1);
  const crown = (V) => (V.cz < 0 ? Math.min(0.11 - Math.abs(V.cx) * (1 + 0.6 * clamp((yb - V.cy) / 0.12)), V.cy - (land.shY - 0.17)) : -1);
  const region = (V, i) => Math.max(w - A.neck[i], crown(V)) * (o.frontOpen !== false && front(i) < 0.012 ? -1 : 1);
  const lift = (V, i) => {
    const t = clamp(A.neck[i] / w), roll = Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)) * (V.cz > 0 ? 0.75 : 1);
    const cr = crown(V), pil = cr > 0 ? Math.sin(Math.PI * 0.5 * clamp(cr / 0.035)) * 0.75 : 0;
    return 0.002 + amp * Math.max(roll, pil);
  };
  const pc = overlayHelper(ctx, r.b.piece, region, { dAt: lift, rim: amp * 0.5, uv: (V, i) => [Math.atan2(V.cx, V.cz) * 0.14, A.neck[i] / w], nsmooth: 4 });
  if (pc) {
    const ears = has(p, 'animal_ears');
    r.pieces.push({ piece: pc, glsl: `vec3 col = uMain; col = mix(col, ${lining}, step(vG.y, 0.42) * step(-0.01, vCanon.z + 0.2)); col = mix(col, col * 0.7, line(vG.y, 0.42, 0.04)); return col;`, noPattern: true, _hood: true });
    if (ears) {
      const at = surfaceHelper(r.b.piece.mesh, 0.075, land.shY + 0.02, -1), at2 = surfaceHelper(r.b.piece.mesh, -0.075, land.shY + 0.02, -1);
      if (at && at2) {
        const kk = L.hw, t = union(...[at, at2].map((a) => P.ellipsoid({ c: [a.p[0] + a.n[0] * amp, a.p[1] + amp * 0.9 + kk * 0.06, a.p[2] + a.n[2] * amp], r: [kk * 0.09, kk * 0.12, kk * 0.05] })));
        const ep = solidHelper(ctx, t, { cell: Math.max(0.003, kk * 0.016), verts: 3000, nsmooth: 1 });
        if (ep) r.pieces.push({ piece: ep, glsl: `vec3 col = uMain; return col;`, noPattern: true });
      }
    }
  }
  if (o.cords) {
    const k = L.hw;
    const at = surfaceHelper(r.b.piece.mesh, 0, ctx.land.shY + 0.01, 1);
    if (at) {
      const t = union(...[1, -1].map((m) => {
        const a = [m * k * 0.08, at.p[1] + k * 0.02, at.p[2] + 0.004], b = [m * k * 0.1, at.p[1] - k * 0.42, at.p[2] + 0.012 + k * 0.03];
        return smin(0.003, P.rcone({ a, b, ra: k * 0.018, rb: k * 0.018 }), P.ellipsoid({ c: [b[0], b[1] - k * 0.04, b[2]], r: [k * 0.025, k * 0.05, k * 0.025] }));
      }));
      const cp = solidHelper(ctx, t, { cell: Math.max(0.0022, k * 0.012), verts: 900 });
      if (cp) r.pieces.push({ piece: cp, glsl: `vec3 col = uTrim; return col;`, noPattern: true });
    }
  }
}
// a team jersey: V neck in a contrast band, yoke, number on the back, mesh side panels
export function jersey(ctx, it) {
  const r = shirtLike(ctx, it, { neckColor: 'uSecond', neckBandW: 0.02 });
  if (!r.b) return [];
  if (has(r.p, 'mesh_panel')) r.extra.push(`col = mix(col, col * 0.8, dotsHex(vCanon.xy, 0.008, 0.0018) * aa(abs(abs(vG.x) - 0.218) - 0.03) * step(vG.z, 0.5));`);
  return finishHelper(r);
}
// a folk tunic: loose, thigh long, a jewel neck with a slit, side splits, woven bands, zigzag sleeve trim
export function tunic(ctx, it) {
  const land = ctx.land, hemT = Math.min(hemOfHelper(ctx, it), land.crotchY - 0.04), top = land.hipJ + 0.03;
  const r = shirtLike(ctx, it, { hem: land.hipJ - 0.005, neckBand: false, hang: 0.9 });
  if (!r.b) return [];
  it.hemY = hemT;
  // below the hips: a front and a back panel, split at the sides
  const wrap = stackHelper(ctx).slice();
  for (const sec of [[-1.32, 1.32], [Math.PI - 1.32, Math.PI + 1.32]]) {
    const tb = tubeHelper(ctx, { top, hem: hemT, off: it.off + 0.006, flare: 0.03, follow: 0.45, back: 0.005, wrap, sector: sec, layer: it.layer, rim: 0.004, segments: 50 });
    if (tb) { remember(ctx, tb); r.pieces.push({ piece: tb, extra: '' }); }
  }
  const pc = bandsHelper(ctx, r.b, { neck: 0.014 }, { d: 0.0018 });
  if (pc) r.pieces.push({ piece: pc, glsl: 'vec3 col = uAccent; col = mix(col, uSecond, stripes(vG.x, 0.01, 0.004)); return col;', noPattern: true });
  r.extra.push(`col = mix(col, col * 0.6, aa(abs(vCanon.x) - 0.0012) * band(vCanon.y, ${f(land.shY - 0.04)}, ${f(land.shY + 0.04)}) * step(0.0, vCanon.z) * step(vG.z, 0.5));`);
  r.extra.push(`{ float y = vPart.y - ${f(SLEEVE[it.params.sleeve] ?? 0.3)} + 0.04; float zz = abs(fract(vG.x / 0.012) - 0.5) * 0.012; col = mix(col, uAccent, aa(abs(y - zz) - 0.0025) * step(0.5, vG.z) * step(vG.z, 2.5)); }`);
  return finishHelper(r);
}
// the shirt-with-waistcoat combo: a shirt (second colour) with a pointed waistcoat (main) and a narrow tie (accent)
export function waistcoat_shirt_combo(ctx, it) {
  const land = ctx.land;
  const r = shirtHelper(ctx, it, { button: 'uTrim', placket: false });
  if (!r.b) return [];
  // the shirt is the second colour: everything so far paints uSecond as its main
  for (const pc of r.pieces) { pc.colors = { main: it.colors.second || '#f4f2f4', second: it.colors.main }; pc.noPattern = true; }
  const vY = land.shY - 0.1, hemAt = hemShapeHelper(land, r.hem + 0.005, 'points');
  const wc = overlayHelper(ctx, r.b.piece, (V) => {
    if (V.limb === 1 || V.limb === 3) return -1;
    const vneck = V.cz > 0 ? Math.abs(V.cx) - Math.max(0, (V.cy - vY)) * 0.55 - 0.004 : 1;
    return Math.min(vneck, V.cy - hemAt(V), (V.cz > 0 ? land.shY - 0.02 : land.shY - 0.03) - V.cy + 0.03 * clamp(1 - Math.abs(V.cx) / 0.1), (0.3 - V.arm) * 0.2);
  }, { d: 0.004 });
  if (wc) r.pieces.push({ piece: wc, extra: `col = mix(col, col * 0.7, line(vCanon.x, 0.0, 0.0012) * step(0.0, vCanon.z));` + buttonsHelper(buttonRowHelper(0.004, vY - 0.02, r.hem + 0.03, 4), 0.004, 'uTrim') + `col = mix(col, col * 0.75, box2(vCanon.xy, vec2(0.07, ${f(land.waistY + 0.01)}), vec2(0.022, 0.003), 0.001) * step(0.0, vCanon.z));` });
  // the tie: a narrow strip down the front from the collar
  const tie = overlayHelper(ctx, r.b.piece, (V) => (V.cz > 0 ? Math.min(0.009 + (land.shY - V.cy) * 0.05 - Math.abs(V.cx), land.shY + 0.03 - V.cy, V.cy - (vY - 0.07)) : -1), { d: 0.0055 });
  if (tie) r.pieces.push({ piece: tie, glsl: `vec3 col = uAccent; col = mix(col, col * 0.75, box2(vCanon.xy, vec2(0.0, ${f(land.shY + 0.018)}), vec2(0.008, 0.008), 0.002) * 0.5); return col;`, noPattern: true });
  return finishHelper(r);
}
// swim tops: fitted, a mock neck with a half zip (or a crew), panels and a chest stripe from the pattern
export function rash_guard(ctx, it) {
  const land = ctx.land, p = it.params, mock = p.neckline === 'mock';
  const r = shirtLike(ctx, it, { neckBand: !mock, params: mock ? { neckline: 'crew' } : {} });
  if (!r.b) return [];
  if (mock) {
    collarPiecesHelper(ctx, it, r, 'mock', { collarPaint: zipHelper(0, land.shY - 0.02, land.shY + 0.08, { tape: 'col', pull: 'uTrim' }) });
    if (p.closure === 'half_zip') r.extra.push(zipHelper(0, land.shY - 0.1, land.shY + 0.06, { tape: 'col * 0.85' }));
  }
  r.extra.push(`col = mix(col, uTrim, line(abs(vG.x), 0.2, 0.0018) * step(vG.z, 0.5));`);
  return finishHelper(r);
}
// a gi jacket: a heavy wrapped lapel band from the neck crossing to the waist, wide three-quarter sleeves
export function gi_jacket(ctx, it) {
  const r = wrapTopHelper(ctx, it, { band: 0.032, bandColor: has(it.params, 'collar_contrast') ? 'uSecond' : 'uMain * 0.95' });
  return r.b ? finishHelper(r) : [];
}
// the wrap fronts (gi, happi, festival robe): the left panel over the right, its edge a band from the
// back of the neck down across the chest; the opening is a deep V crossing to the waist
export function wrapTopHelper(ctx, it, o = {}) {
  const land = ctx.land, yV = o.vY ?? land.chestY - 0.01, yW = o.crossY ?? land.waistY;
  const r = shirtLike(ctx, it, { neck: { shape: 'v', front: yV, back: land.shY + 0.045, width: 0.075 }, neckBand: false, ...o });
  if (!r.b) return r;
  // the lapel band round the neck and down both edges of the V
  const band = o.band ?? 0.03;
  const pc = bandsHelper(ctx, r.b, { neck: band }, { d: o.bandD ?? 0.004 });
  if (pc) r.pieces.push({ piece: pc, glsl: `vec3 col = ${o.bandColor || 'uSecond'}; col = mix(col, col * 0.82, line(vG.y, 0.5, 0.04) * 0.6); return col;`, noPattern: true });
  // below the V, the top panel's edge crossing to the side (a darker line)
  r.extra.push(`col = mix(col, col * 0.6, line(vCanon.x, -(${f(yV)} - vCanon.y) * 0.9, 0.0018) * band(vCanon.y, ${f(yW - 0.06)}, ${f(yV + 0.004)}) * step(0.0, vCanon.z) * step(vG.z, 0.5));
    col = mix(col, col * 0.6, line(vCanon.x, ${f(-(yV - yW + 0.06) * 0.9)}, 0.0018) * step(vCanon.y, ${f(yW - 0.06)}) * step(0.0, vCanon.z) * step(vG.z, 0.5));`);
  return r;
}
// a chef's jacket: mandarin collar, a double-breasted front panel crossing to the left, two rows of buttons
export function chef_jacket(ctx, it) {
  const land = ctx.land, p = it.params;
  const r = shirtLike(ctx, it, { params: { neckline: 'collar' }, neckBand: false, collar: 'none', cuffs: p.cuffs });
  if (!r.b) return [];
  collarPiecesHelper(ctx, it, r, 'mandarin');
  // the overlapping panel's edge: a raised strip from the collar down the front at x = 0.075
  const pl = overlayHelper(ctx, r.b.piece, (V) => (V.cz > 0 && V.limb === 0 ? Math.min(0.075 - V.cx, V.cx - 0.03) : -1), { d: 0.0025 });
  const btn = has(p, 'buttons_contrast') ? 'uAccent' : 'uTrim', ys = [land.shY - 0.025, r.hem + 0.06];
  if (pl) r.pieces.push({ piece: pl, extra: buttonsHelper([...buttonRowHelper(0.05, ys[0] - 0.02, ys[1], 5), ...buttonRowHelper(-0.05, ys[0] - 0.02, ys[1], 5)], 0.0058, btn) });
  if (has(p, 'pen_pocket')) r.extra.push(`col = mix(col, col * 0.75, boxLine(vec2(vG.x, vPart.y), vec2(0.0, 0.18), vec2(0.012, 0.035), 0.002, 0.0016) * step(0.5, vG.z) * step(vG.z, 1.5)); col = mix(col, uAccent, box2(vec2(vG.x, vPart.y), vec2(-0.005, 0.12), vec2(0.0025, 0.02), 0.001) * step(0.5, vG.z) * step(vG.z, 1.5));`);
  return finishHelper(r);
}
export { shirtLike as shirtLikeHelper };
