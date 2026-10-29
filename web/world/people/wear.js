// Garments for generated people, made to fit the body they are for:
//
//   shell(ctx, o)  fitted clothes (tees, shirts, trousers, socks, tights, gloves,
//                  jacket bodies) cut out of the fitted body mesh along a cover
//                  function (positive where the garment is), lifted off the skin by
//                  an offset, smoothed over the body's dips, optionally hung
//                  straight down from the chest like a loose shirt, and given a rim
//                  at every hem so the cloth has thickness. A shell keeps the body's
//                  skin weights, so it moves exactly with it and nothing pokes through.
//   tube(ctx, o)   loose cloth round the hips and legs (skirts, dress skirts, coat
//                  tails): rings hung from the waist outside both legs, flaring and
//                  pleated, the lower part following the thighs half way.
//   solid(ctx, tree, o)  anything else, from a field (sdf.js) in the person's A pose
//                  space: shoes, hats, bags, glasses, collars, hoods, buttons, bows.
//
// Every piece comes back as { mesh: { pos, nrm, idx, skin, wts, canon, part, share,
// gco }, hide (body vertices it covers, Uint8 per body vertex), double, layer }.
// gco (vec4) are the piece's own paint coordinates: shells and tubes (u round the
// body part in metres, v along it in metres, region, rim), solids (x, y, z in the
// piece's frame, part id).
//
// Cover functions get V, one body vertex: cx cy cz (its place on the reference body,
// base.bin's land: the same for every person, so a hem "at the knee" is at the knee
// on a toddler and on a giant), limb (0 trunk 1 arm 2 leg 3 head), s (along the limb:
// arm 0 shoulder .. 1 wrist, leg 0 hip .. 1 ankle; trunk 0 hips .. 1 shoulders; head
// height from the chin in head heights), side (1 left, -1 right), arm leg head ext
// (how much it belongs to an arm, a leg, the head, a hand or foot).
import { cutMesh, borderLoops, normals, neighbours, decimate, surfaceNets, project, relax, pointHash, compact, smoothNormals } from './mesh.js';
import { compile } from './sdf.js';
import { BONE, NB } from './rig.js';
import { clamp, sstep, lerp } from './vmath.js';

export const TAU = Math.PI * 2;

// ---------- context ----------
export function context(built, base) {
  const m = built.mesh, n = m.pos.length / 3;
  const ctx = { A: built.anat, L: built.anat.L, land: base.land, body: m, f: built.field.f, n, base };
  ctx.hash = pointHash(m.pos, 0.02);
  ctx.nb = base.nb || neighbours(m);
  // canonical height -> this person's height, along the trunk's front and each leg (bins of 1 cm)
  const bins = new Map();
  for (let v = 0; v < n; v++) {
    if (m.part[4 * v] === 1 || m.part[4 * v] === 3) continue;
    const k = Math.round(m.canon[3 * v + 1] * 100); let b = bins.get(k); if (!b) bins.set(k, (b = [0, 0])); b[0] += m.pos[3 * v + 1]; b[1]++;
  }
  ctx.fyTable = [...bins].sort((a, b) => a[0] - b[0]).map(([k, b]) => [k / 100, b[0] / b[1]]);
  ctx.V = (i, src = m) => vert(src, i);
  return ctx;
}
// canonical height -> fitted height
export function fy(ctx, cy) {
  const t = ctx.fyTable;
  if (cy <= t[0][0]) return t[0][1] + (cy - t[0][0]);
  for (let i = 1; i < t.length; i++) if (cy <= t[i][0]) { const [a, ya] = t[i - 1], [b, yb] = t[i]; return ya + (yb - ya) * (cy - a) / (b - a); }
  return t[t.length - 1][1];
}
function vert(src, i) {
  const c = src.canon, p = src.part, s = src.share;
  return { cx: c[3 * i], cy: c[3 * i + 1], cz: c[3 * i + 2], limb: Math.round(p[4 * i]), s: p[4 * i + 1], side: p[4 * i + 2], arm: s[4 * i], leg: s[4 * i + 1], head: s[4 * i + 2], ext: s[4 * i + 3] };
}

// ---------- cover helpers (all return metres-ish signed values: > 0 inside) ----------
// combine: inside all / inside any
export const all = (...g) => Math.min(...g);
export const any = (...g) => Math.max(...g);
// below / above a canonical height
export const below = (V, y) => y - V.cy;
export const above = (V, y) => V.cy - y;
// along a limb (arm or leg, by limb code) up to s1 (and from s0)
export const limbTo = (V, limb, s1, s0 = -1) => (V.limb === limb ? Math.min(s1 - V.s, V.s - s0) * 0.5 : -0.05);
// a neckline: inside below a curve over the chest and back. o: { front, back (canonical heights at the middle),
// shape: 'crew' | 'v' | 'scoop' | 'square' | 'boat', width }
export function neckline(V, land, o) {
  const front = V.cz > 0, h = front ? o.front : o.back, x = Math.abs(V.cx), w = o.width ?? 0.07;
  let y = h;
  switch (o.shape || 'crew') {
    case 'v': y = h + Math.min(x / w, 1) * (land.shY + 0.05 - h) * (front ? 1 : 0.3); break;
    case 'scoop': y = h + Math.pow(Math.min(x / (w * 1.3), 1), 2.2) * (land.shY + 0.04 - h); break;
    case 'square': y = x < w ? h : land.shY + 0.06; break;
    case 'boat': y = h + Math.pow(Math.min(x / (w * 1.8), 1), 4) * 0.04; break;
    default: y = h + Math.pow(Math.min(x / w, 1), 2) * (land.shY + 0.05 - h);
  }
  return y - V.cy;
}
// not the head and not the hands / feet
export const noHead = (V) => 0.6 - V.head;
export const noExt = (V) => 0.4 - V.ext;

// ---------- shells ----------
// o: { cover(V) -> g, off (m or V => m), fill (smoothing passes), hang (0..1: loose from the chest down),
// hangFrom (canonical height), flare: { leg: amount at the ankle, arm: at the wrist }, rim (m), hideMargin, layer, double }
export function shell(ctx, o) {
  const B = ctx.body, n = ctx.n, g = new Float32Array(n);
  for (let v = 0; v < n; v++) g[v] = o.cover(vert(B, v));
  const hide = new Uint8Array(n);
  if (o.hides !== false) for (let v = 0; v < n; v++) if (g[v] > (o.hideMargin ?? 0.02)) hide[v] = 1;
  const c = cutMesh(B, g, { canon: [B.canon, 3], part: [B.part, 4], share: [B.share, 4], nrm: [B.nrm, 3] });
  const m = c.pos.length / 3;
  if (!m) return null;
  const N = c.nrm;
  for (let v = 0; v < m; v++) { const l = Math.hypot(N[3 * v], N[3 * v + 1], N[3 * v + 2]) || 1; N[3 * v] /= l; N[3 * v + 1] /= l; N[3 * v + 2] /= l; }
  const offAt = typeof o.off === 'function' ? o.off : () => o.off ?? 0.006;
  const off = new Float32Array(m), P = c.pos;
  for (let v = 0; v < m; v++) {
    const V = vert(c, v);
    let d = offAt(V);
    if (o.flare && V.limb === 2) d += (o.flare.leg || 0) * sstep(o.flare.from ?? 0.3, 1, V.s);
    if (o.flare && V.limb === 1) d += (o.flare.arm || 0) * sstep(o.flare.from ?? 0.3, 1, V.s);
    off[v] = d;
    P[3 * v] += N[3 * v] * d; P[3 * v + 1] += N[3 * v + 1] * d; P[3 * v + 2] += N[3 * v + 2] * d;
  }
  const mesh = { pos: P, idx: c.idx };
  const nb = neighbours(mesh);
  // smooth over the body's dips (between the shoulder blades, under the bust, the small of the back),
  // never closer to the body than the offset asks
  const lock = c.border;
  for (let it = 0; it < (o.fill ?? 2); it++) {
    smoothLocked(mesh, nb, lock, 0.5);
    keepOff(ctx.f, P, off, 0.85);
  }
  if (o.hang) hangFrom(ctx, c, P, o.hang, o.hangFrom ?? ctx.land.chestY);
  // gco: u round the part, v along it (metres on the reference body), region, rim
  const gco = new Float32Array(m * 4), land = ctx.land;
  for (let v = 0; v < m; v++) {
    const V = vert(c, v);
    let u, w, region;
    if (V.limb === 1 || V.limb === 2) {
      // round the limb: angle in the plane across it (the reference body's A pose)
      const ang = V.limb === 1 ? Math.atan2(V.cz, (V.cy - land.shY) * V.side) : Math.atan2(V.cz, (V.cx - land.hipJx * V.side) * V.side);
      u = ang * (V.limb === 1 ? 0.04 : 0.065); w = V.s * (V.limb === 1 ? land.Lua + land.Lfa : land.hipJ - land.ankleY);
      region = V.limb === 1 ? (V.side > 0 ? 1 : 2) : (V.side > 0 ? 3 : 4);
    } else { u = Math.atan2(V.cx, V.cz) * 0.14; w = V.cy; region = V.limb === 3 ? 5 : 0; }
    gco[4 * v] = u; gco[4 * v + 1] = w; gco[4 * v + 2] = region; gco[4 * v + 3] = 0;
  }
  let out = { pos: P, idx: c.idx, skin: c.skin, wts: c.wts, canon: c.canon, part: c.part, share: c.share, gco };
  if ((o.rim ?? 0.004) > 0) out = addRim(out, c.border, N, o.rim ?? 0.004, o.rimOut ?? 0);
  out.nrm = normals(out);
  smoothNormals(out, null, 3, 0.6);
  return { mesh: out, hide, double: o.double ?? true, layer: o.layer ?? 0, g };
}
function smoothLocked(mesh, nb, lock, k) {
  const P = mesh.pos, n = P.length / 3, Q = new Float32Array(P);
  for (let i = 0; i < n; i++) {
    if (lock[i]) continue;
    const s = nb.start[i], e = nb.start[i + 1]; if (e === s) continue;
    let x = 0, y = 0, z = 0;
    for (let j = s; j < e; j++) { const q = 3 * nb.list[j]; x += P[q]; y += P[q + 1]; z += P[q + 2]; }
    const c = e - s;
    Q[3 * i] = P[3 * i] + (x / c - P[3 * i]) * k; Q[3 * i + 1] = P[3 * i + 1] + (y / c - P[3 * i + 1]) * k; Q[3 * i + 2] = P[3 * i + 2] + (z / c - P[3 * i + 2]) * k;
  }
  P.set(Q);
}
// push points back out to at least frac x their offset from the body (along the field's gradient)
function keepOff(f, P, off, frac) {
  const e = 2e-4;
  for (let v = 0; v < P.length / 3; v++) {
    const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2], d = f(x, y, z), want = off[v] * frac;
    if (d >= want) continue;
    const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e), l = Math.hypot(gx, gy, gz) || 1;
    const k = want - d;
    P[3 * v] += gx / l * k; P[3 * v + 1] += gy / l * k; P[3 * v + 2] += gz / l * k;
  }
}
// a loose garment falls straight from the chest: below it, the trunk's cloth is pushed out
// to the chest's outline at the same angle (amount 0..1)
function hangFrom(ctx, c, P, amount, fromCY) {
  const m = P.length / 3, NB2 = 48, rmax = new Float32Array(NB2), y0 = fy(ctx, fromCY);
  const zc = (() => { let s = 0, k = 0; for (let v = 0; v < m; v++) if (c.part[4 * v] === 0) { s += P[3 * v + 2]; k++; } return k ? s / k : 0; })();
  const bin = (x, z) => ((Math.round((Math.atan2(x, z - zc) / TAU) * NB2) % NB2) + NB2) % NB2;
  for (let v = 0; v < m; v++) {
    if (c.part[4 * v] !== 0 || c.share[4 * v] > 0.3) continue;
    const y = P[3 * v + 1]; if (y < y0 - 0.02 || y > y0 + 0.06) continue;
    const r = Math.hypot(P[3 * v], P[3 * v + 2] - zc), b = bin(P[3 * v], P[3 * v + 2]);
    if (r > rmax[b]) rmax[b] = r;
  }
  // fill empty bins and smooth round
  for (let it = 0; it < 3; it++) for (let b = 0; b < NB2; b++) { const a = rmax[(b + NB2 - 1) % NB2], d = rmax[(b + 1) % NB2]; if (!rmax[b]) rmax[b] = Math.max(a, d); }
  const sm = rmax.map((r, b) => (rmax[(b + NB2 - 1) % NB2] + 2 * r + rmax[(b + 1) % NB2]) / 4);
  for (let v = 0; v < m; v++) {
    if (c.part[4 * v] === 1 || c.part[4 * v] === 3) continue;
    const y = P[3 * v + 1]; if (y >= y0) continue;
    const k = amount * sstep(0, 0.08, y0 - y) * (1 - clamp(c.share[4 * v] * 1.5)) * (1 - clamp(c.share[4 * v + 1] * 0.6));
    if (k <= 0) continue;
    const x = P[3 * v], z = P[3 * v + 2] - zc, r = Math.hypot(x, z) || 1e-6, want = sm[bin(P[3 * v], P[3 * v + 2])];
    if (want <= r) continue;
    const nr = lerp(r, want, k);
    P[3 * v] = x / r * nr; P[3 * v + 2] = z / r * nr + zc;
  }
}
// thickness at the hems: each open edge gets a band folded back towards the body
function addRim(mesh, border, N, depth, out) {
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
      // border edges run a -> b in the faces' winding; the band continues the surface over the edge
      idx.push(b, a, a2, b, a2, b2);
    }
  }
  return { ...r, idx: new Uint32Array(idx) };
}

// ---------- tubes (skirts) ----------
// o: { top, hem (canonical heights), off, flare (m of extra radius at the hem), pleats (count), pleatDepth (m),
// fullness (0..1: how much it stands off the legs), follow (0..1 how much the hem follows the thighs), back (extra at the back), rim, layer }
export function tube(ctx, o) {
  const f = ctx.f, yTop = fy(ctx, o.top), yHem = fy(ctx, o.hem), off = o.off ?? 0.008;
  const NR = o.segments || 72, step = o.step || 0.012, rows = Math.max(3, Math.ceil((yTop - yHem) / step));
  // the trunk's axis (front-back) from the body round the hips
  let zc = 0, cnt = 0;
  for (let v = 0; v < ctx.n; v++) { const y = ctx.body.pos[3 * v + 1]; if (Math.abs(y - yTop) < 0.03 && ctx.body.part[4 * v] === 0) { zc += ctx.body.pos[3 * v + 2]; cnt++; } }
  zc = cnt ? zc / cnt : 0;
  const outer = (y, th) => {   // outermost body surface at this height and angle (both legs together), from outside in
    const dx = Math.sin(th), dz = Math.cos(th);
    let r = 0.6;
    for (let i = 0; i < 120; i++) { const d = f(dx * r, y, zc + dz * r); if (d < off) break; r -= Math.max(d - off, 0.002); if (r < 0.01) return 0.01; }
    return r;
  };
  const R = [], Y = [];
  let prev = null;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows, y = lerp(yTop, yHem, t), ring = new Float32Array(NR);
    for (let i = 0; i < NR; i++) ring[i] = outer(y, (i / NR) * TAU);
    // smooth round (no notch between the legs), then flare and never narrower than the ring above
    for (let it = 0; it < 6; it++) { const c = ring.slice(); for (let i = 0; i < NR; i++) ring[i] = Math.max(c[i], (c[(i + NR - 1) % NR] + 2 * c[i] + c[(i + 1) % NR]) / 4); }
    for (let i = 0; i < NR; i++) {
      const th = (i / NR) * TAU, back = Math.max(0, -Math.cos(th));
      let r = ring[i] + (o.flare ?? 0.04) * Math.pow(t, 1.3) + (o.back ?? 0.01) * back * t;
      if (prev) r = Math.max(r, prev[i] - 0.002 + (o.fullness ?? 0.4) * (r - prev[i]) * 0);
      if (o.pleats) r += (o.pleatDepth ?? 0.008) * (0.3 + 0.7 * t) * Math.abs(((i / NR) * o.pleats * 2) % 2 - 1);
      ring[i] = r;
    }
    R.push(ring); Y.push(y); prev = ring;
  }
  // vertices
  const nv = (rows + 1) * NR, pos = new Float32Array(nv * 3), gco = new Float32Array(nv * 4), canon = new Float32Array(nv * 3), part = new Float32Array(nv * 4), share = new Float32Array(nv * 4);
  const skin = new Uint16Array(nv * 4), wts = new Float32Array(nv * 4);
  const hips = BONE.Hips, sp = BONE.Spine1, lt = BONE.LThigh, rt = BONE.RThigh;
  for (let j = 0; j <= rows; j++) for (let i = 0; i < NR; i++) {
    const v = j * NR + i, th = (i / NR) * TAU, r = R[j][i], t = j / rows;
    pos[3 * v] = Math.sin(th) * r; pos[3 * v + 1] = Y[j]; pos[3 * v + 2] = zc + Math.cos(th) * r;
    const cy = lerp(o.top, o.hem, t);
    gco[4 * v] = th * 0.15; gco[4 * v + 1] = cy; gco[4 * v + 2] = 6; gco[4 * v + 3] = 0;
    canon[3 * v] = Math.sin(th) * 0.16; canon[3 * v + 1] = cy; canon[3 * v + 2] = Math.cos(th) * 0.12;
    part[4 * v] = 0; part[4 * v + 1] = 0; part[4 * v + 2] = Math.sin(th) >= 0 ? 1 : -1;
    const a = (o.follow ?? 0.5) * sstep(0.05, 1, t), side = 0.5 + 0.5 * Math.sin(th), top = (1 - sstep(0, 0.25, t)) * 0.4;
    skin[4 * v] = hips; skin[4 * v + 1] = lt; skin[4 * v + 2] = rt; skin[4 * v + 3] = sp;
    wts[4 * v] = (1 - a) * (1 - top); wts[4 * v + 1] = a * side * (1 - top); wts[4 * v + 2] = a * (1 - side) * (1 - top); wts[4 * v + 3] = top;
  }
  const idx = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < NR; i++) {
    const a = j * NR + i, b = j * NR + (i + 1) % NR, c = (j + 1) * NR + i, d = (j + 1) * NR + (i + 1) % NR;
    idx.push(a, c, b, b, c, d);
  }
  let mesh = { pos, idx: new Uint32Array(idx), skin, wts, canon, part, share, gco };
  const N = normals(mesh);
  const border = new Uint8Array(nv); for (let i = 0; i < NR; i++) { border[rows * NR + i] = 1; }
  if ((o.rim ?? 0.004) > 0) {
    // only the hem gets a rim (the waist is under the waistband)
    const rimMesh = addRim(mesh, border, N, o.rim ?? 0.004, 0);
    // drop the band added at the top loop: rebuild using only the hem loop
    mesh = rimOnly(mesh, rimMesh, rows * NR);
  }
  mesh.nrm = normals(mesh);
  // the skirt hides nothing of the body (legs show under it)
  return { mesh, hide: new Uint8Array(ctx.n), double: true, layer: o.layer ?? 0 };
}
function rimOnly(mesh, rimMesh, hemStart) {
  // keep the rim faces whose outer edge is on the hem loop
  const n = mesh.pos.length / 3, I = rimMesh.idx, keep = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (t < mesh.idx.length) { keep.push(a, b, c); continue; }
    const outerV = [a, b, c].filter((v) => v < n);
    if (outerV.every((v) => v >= hemStart)) keep.push(a, b, c);
  }
  return compact({ ...rimMesh, idx: new Uint32Array(keep) }, { skin: [rimMesh.skin, 4], wts: [rimMesh.wts, 4], canon: [rimMesh.canon, 3], part: [rimMesh.part, 4], share: [rimMesh.share, 4], gco: [rimMesh.gco, 4] });
}

// ---------- solids ----------
// tree: a field (sdf.js) in the person's A pose space. o: { cell, verts (decimate to), bone (rigid on that bone) |
// weights: 'body' (the nearest body vertex's) | (p) => [[bone, w], ..], frame: 4x4 world -> piece frame for gco,
// partOf(p) -> id for gco.w, smooth, layer, hide(V) -> g (body cover, like shells) }
export function solid(ctx, tree, o = {}) {
  const c = compile(tree);
  let m = surfaceNets(c.f, c.box, o.cell || 0.004);
  if (!m.idx.length) return null;
  project(m, c.f, 3);
  if (o.verts && m.pos.length / 3 > o.verts) m = decimate(m, o.verts, { weight: o.detail });
  relax(m, o.smooth ?? 1, 0.4, c.f);
  const n = m.pos.length / 3, B = ctx.body;
  const skin = new Uint16Array(n * 4), wts = new Float32Array(n * 4), canon = new Float32Array(n * 3), part = new Float32Array(n * 4), share = new Float32Array(n * 4), gco = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const x = m.pos[3 * v], y = m.pos[3 * v + 1], z = m.pos[3 * v + 2];
    const near = ctx.hash.nearest(x, y, z, 6);
    if (near >= 0) {
      for (let j = 0; j < 3; j++) canon[3 * v + j] = B.canon[3 * near + j] + (m.pos[3 * v + j] - B.pos[3 * near + j]);
      for (let j = 0; j < 4; j++) { part[4 * v + j] = B.part[4 * near + j]; share[4 * v + j] = B.share[4 * near + j]; }
    }
    if (o.bone !== undefined) { skin[4 * v] = typeof o.bone === 'string' ? BONE[o.bone] : o.bone; wts[4 * v] = 1; }
    else if (typeof o.weights === 'function') { o.weights([x, y, z]).slice(0, 4).forEach(([b, w], k) => { skin[4 * v + k] = typeof b === 'string' ? BONE[b] : b; wts[4 * v + k] = w; }); }
    else if (near >= 0) for (let j = 0; j < 4; j++) { skin[4 * v + j] = B.skin[4 * near + j]; wts[4 * v + j] = B.wts[4 * near + j]; }
    const F = o.frame;
    const lx = F ? F[0] * x + F[4] * y + F[8] * z + F[12] : x, ly = F ? F[1] * x + F[5] * y + F[9] * z + F[13] : y, lz = F ? F[2] * x + F[6] * y + F[10] * z + F[14] : z;
    gco[4 * v] = lx; gco[4 * v + 1] = ly; gco[4 * v + 2] = lz; gco[4 * v + 3] = o.partOf ? o.partOf([x, y, z], [lx, ly, lz]) : 0;
  }
  const mesh = { pos: m.pos, idx: m.idx, skin, wts, canon, part, share, gco };
  mesh.nrm = normals(mesh);
  if (o.nsmooth !== 0) smoothNormals(mesh, null, o.nsmooth ?? 1, 0.5);
  const hide = new Uint8Array(ctx.n);
  if (o.hide) for (let v = 0; v < ctx.n; v++) if (o.hide(vert(B, v)) > 0) hide[v] = 1;
  return { mesh, hide, double: !!o.double, layer: o.layer ?? 0 };
}

// a bone's A pose world matrix, and world -> bone frame
export const boneWorld = (ctx, name) => ctx.A.aw[BONE[name]];
export function boneFrameInv(ctx, name) {
  const m = boneWorld(ctx, name), o = new Float64Array(16);
  o[0] = m[0]; o[1] = m[4]; o[2] = m[8]; o[4] = m[1]; o[5] = m[5]; o[6] = m[9]; o[8] = m[2]; o[9] = m[6]; o[10] = m[10]; o[15] = 1;
  o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]); o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]); o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
  return o;
}
// a point given in a bone's frame (A pose) -> world
export function atBone(ctx, name, p) { const m = boneWorld(ctx, name); return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
export const jointPos = (ctx, name) => { const m = boneWorld(ctx, name); return [m[12], m[13], m[14]]; };
export { NB, sstep, clamp, lerp };
