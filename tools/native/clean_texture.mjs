// Cleans an AI-textured model's colour bleed: the cap's red on the forehead under its brim,
// skin on the hair by the sideburns, hair on the skin. The texturer paints by projection, so
// at a part's edge the neighbouring part's colour spills a few texels over. The mesh knows
// the parts: faces are grouped across smooth surface and split at creases (a brim meets the
// forehead, a hair strand the skull, at a sharp angle; rounded over a few tiny triangles on
// a generated mesh, so a crease is where a face's normal leaves the normal smoothed over
// its surroundings), small groups folded into their neighbours; each group's texels vote on its colour class (skin, hair, red, white, blue,
// green, other) and a group with a clear majority has its stray texels of another class
// repainted, where they lie in a thin band by the majority's own texels: filled from the
// nearest good texels of the group, so the shading carries over. Only the skin's and the
// hair's groups by default (the face is what the camera sees up close).
//
//   node tools/native/clean_texture.mjs <model.glb> <out.png> [--angle=20] [--smooth=10] [--band=14] [--classes=skin,hair] [--debug=diff.png] [--map=map.png]
import fs from 'node:fs';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';

const [GLB, OUT] = process.argv.slice(2);
if (!GLB || !OUT) { console.error('usage: clean_texture.mjs <model.glb> <out.png> [--angle=45] [--band=14] [--classes=skin,hair] [--debug=diff.png]'); process.exit(1); }
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ANGLE = +arg('angle', 20), SMOOTH = +arg('smooth', 10), BAND = +arg('band', 14), FIX = arg('classes', 'skin,hair').split(','), DEBUG = arg('debug', ''), GROUPS = arg('map', '');
// --flatten=skin:0.5,hair:1 : a class's big parts painted in one colour (the part's median),
// keeping this much of their own light and shade (the tints that spilled onto them go)
const FLAT = Object.fromEntries(arg('flatten', 'skin:0.5,hair:1').split(',').filter(Boolean).map((x) => { const [c, k] = x.split(':'); return [c, +(k ?? 1)]; }));
const MIN_FACES = 300;         // groups smaller than this fold into a neighbour
const MAJORITY = 0.6;          // a group's class must hold this much of it
const MINORITY_MAX = 0.35;     // and the strays no more than this (else the group truly holds two parts)
const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const doc = await new NodeIO().read(GLB);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute('POSITION').getArray(), uv = prim.getAttribute('TEXCOORD_0').getArray(), idx = prim.getIndices().getArray();
const NF = idx.length / 3, NV = pos.length / 3;
const img = await sharp(Buffer.from(prim.getMaterial().getBaseColorTexture().getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = img.info, px = img.data;
log(`${NF} faces, ${NV} corners, texture ${W}x${H}`);

// ---------- the parts: faces joined across smooth edges ----------
// corners welded by position (the export splits them at seams)
const wid = new Int32Array(NV);
{ const m = new Map(); for (let i = 0; i < NV; i++) { const k = `${Math.round(pos[i * 3] * 2e4)},${Math.round(pos[i * 3 + 1] * 2e4)},${Math.round(pos[i * 3 + 2] * 2e4)}`; let w = m.get(k); if (w === undefined) { w = m.size; m.set(k, w); } wid[i] = w; } log('welded to', new Set(wid).size, 'points'); }
const nx = new Float32Array(NF), ny = new Float32Array(NF), nz = new Float32Array(NF);
for (let f = 0; f < NF; f++) {
  const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
  const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
  let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx; const l = Math.hypot(x, y, z) || 1; nx[f] = x / l; ny[f] = y / l; nz[f] = z / l;
}
// the smoothed normal at each welded point: the faces' summed, then averaged over the
// neighbours SMOOTH times (a reach of a few millimetres on a dense mesh)
const NW = new Set(wid).size;
let vn = new Float32Array(NW * 3);
for (let f = 0; f < NF; f++) for (let e = 0; e < 3; e++) { const w = wid[idx[f * 3 + e]]; vn[w * 3] += nx[f]; vn[w * 3 + 1] += ny[f]; vn[w * 3 + 2] += nz[f]; }
const nbrs = new Map();   // point -> neighbours (over the edges)
const addN = (a, b) => { let s = nbrs.get(a); if (!s) { s = new Set(); nbrs.set(a, s); } s.add(b); };
for (let f = 0; f < NF; f++) for (let e = 0; e < 3; e++) { const p = wid[idx[f * 3 + e]], q = wid[idx[f * 3 + (e + 1) % 3]]; addN(p, q); addN(q, p); }
const nbArr = new Array(NW); for (const [p, s] of nbrs) nbArr[p] = Int32Array.from(s);
for (let pass = 0; pass < SMOOTH; pass++) {
  const next = new Float32Array(NW * 3);
  for (let p = 0; p < NW; p++) {
    const nb = nbArr[p]; let x = vn[p * 3], y = vn[p * 3 + 1], z = vn[p * 3 + 2];
    if (nb) for (const q of nb) { x += vn[q * 3]; y += vn[q * 3 + 1]; z += vn[q * 3 + 2]; }
    const l = Math.hypot(x, y, z) || 1; next[p * 3] = x / l; next[p * 3 + 1] = y / l; next[p * 3 + 2] = z / l;
  }
  vn = next;
}
// a crease face: its own normal more than ANGLE off the smoothed normal of its corners
const cosT = Math.cos(ANGLE * Math.PI / 180);
const crease = new Uint8Array(NF);
let ncrease = 0;
for (let f = 0; f < NF; f++) {
  let x = 0, y = 0, z = 0;
  for (let e = 0; e < 3; e++) { const w = wid[idx[f * 3 + e]]; x += vn[w * 3]; y += vn[w * 3 + 1]; z += vn[w * 3 + 2]; }
  const l = Math.hypot(x, y, z) || 1;
  if ((nx[f] * x + ny[f] * y + nz[f] * z) / l < cosT) { crease[f] = 1; ncrease++; }
}
log(`crease faces: ${ncrease} of ${NF} (over ${ANGLE}° from the normal smoothed ${SMOOTH} times)`);

// ---------- the faces: a class each, patches of one class across smooth surface ----------
const CLASSES = ['other', 'skin', 'hair', 'red', 'white', 'blue', 'green'];
const classOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, sat = mx ? (mx - mn) / mx : 0;
  if (v < 0.33) return 2;
  if (sat < 0.18 && v > 0.7) return 4;
  let h = mx === r ? 60 * (((g - b) / (mx - mn || 1)) % 6) : mx === g ? 60 * ((b - r) / (mx - mn || 1) + 2) : 60 * ((r - g) / (mx - mn || 1) + 4); if (h < 0) h += 360;
  if (sat >= 0.25 && sat <= 0.85 && h >= 10 && h <= 42) return 1;
  if (sat > 0.45 && (h < 12 || h > 340)) return 3;
  if (sat > 0.3 && h >= 190 && h <= 250) return 5;
  if (sat > 0.3 && h >= 70 && h <= 170) return 6;
  return 0;
};
const sample = (u, v) => {   // the texture at a spot (nearest texel)
  const x = Math.min(W - 1, Math.max(0, Math.floor(u * W))), y = Math.min(H - 1, Math.max(0, Math.floor(v * H))), o = (y * W + x) * 4;
  return [px[o], px[o + 1], px[o + 2]];
};
// a face's class: its centroid's and its corners', the most common (the centroid breaks a tie)
const fcls = new Uint8Array(NF), fcol = new Float32Array(NF * 3);
for (let f = 0; f < NF; f++) {
  const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
  const cu = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3, cv = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3;
  const pts = [sample(cu, cv), sample(uv[a * 2] * 0.8 + cu * 0.2, uv[a * 2 + 1] * 0.8 + cv * 0.2), sample(uv[b * 2] * 0.8 + cu * 0.2, uv[b * 2 + 1] * 0.8 + cv * 0.2), sample(uv[c * 2] * 0.8 + cu * 0.2, uv[c * 2 + 1] * 0.8 + cv * 0.2)];
  const n = [0, 0, 0, 0, 0, 0, 0]; for (const q of pts) n[classOf(...q)]++;
  let best = classOf(...pts[0]); for (let k = 0; k < 7; k++) if (n[k] > n[best]) best = k;
  fcls[f] = best; fcol[f * 3] = pts[0][0]; fcol[f * 3 + 1] = pts[0][1]; fcol[f * 3 + 2] = pts[0][2];
}
const parent = new Int32Array(NF); for (let i = 0; i < NF; i++) parent[i] = i;
const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
const NWp = NW + 1;
const edgeFace = new Map();
const edgeList = [];   // [faceA, faceB] across every edge
for (let f = 0; f < NF; f++) {
  for (let e = 0; e < 3; e++) {
    const p = wid[idx[f * 3 + e]], q = wid[idx[f * 3 + (e + 1) % 3]];
    const k = p < q ? p * NWp + q : q * NWp + p;
    const g = edgeFace.get(k);
    if (g === undefined) { edgeFace.set(k, f); continue; }
    edgeList.push(g, f);
    if (!crease[f] && !crease[g] && fcls[f] === fcls[g]) union(f, g);
  }
}
edgeFace.clear();
const patch = new Int32Array(NF); let NP = 0;
{ const ids = new Map(); for (let f = 0; f < NF; f++) { const r = find(f); let id = ids.get(r); if (id === undefined) { id = ids.size; ids.set(r, id); } patch[f] = id; } NP = ids.size; }
log('patches of one class:', NP);
// each patch: faces, boundary edges, and how much of that border meets each class: across
// smooth surface in full, across a crease (the rounded junction between two parts) at
// CREASE_W, so a strip that runs along a junction leans to the side it continues from
const CREASE_W = 0.3;
const psize = new Int32Array(NP), pbound = new Int32Array(NP), contact = new Float32Array(NP * 7);
for (let f = 0; f < NF; f++) psize[patch[f]]++;
for (let i = 0; i < edgeList.length; i += 2) {
  const a = edgeList[i], b = edgeList[i + 1]; if (patch[a] === patch[b]) continue;
  for (const [x, y] of [[a, b], [b, a]]) { pbound[patch[x]]++; contact[patch[x] * 7 + fcls[y]] += (crease[x] || crease[y]) ? CREASE_W : 1; }
}
// the bleed: a thin patch (small, or long and narrow) whose smooth border runs mostly
// against another class that we fix into -> it takes that class's colour from that border
const MAX_FACES = 40000, MAX_RATIO = 6, BORDER_MIN = 0.3;
const target = new Int8Array(NP).fill(-1);
const fill = new Float32Array(NP * 3), filln = new Int32Array(NP);
let nfix = 0; const fixFaces = new Int32Array(49);
for (let p = 0; p < NP; p++) {
  if (psize[p] > MAX_FACES || psize[p] / Math.max(pbound[p], 1) > MAX_RATIO) continue;
  let best = -1, n = 0;
  for (let k = 0; k < 7; k++) { const v = contact[p * 7 + k]; if (v > n) { n = v; best = k; } }
  if (best < 0 || !FIX.includes(CLASSES[best])) continue;
  target[p] = best; nfix++;
}
// the patch's own class (from any of its faces) must differ from the target
const pclass = new Uint8Array(NP); for (let f = 0; f < NF; f++) pclass[patch[f]] = fcls[f];
nfix = 0;
for (let p = 0; p < NP; p++) { if (target[p] >= 0 && (target[p] === pclass[p] || contact[p * 7 + target[p]] < BORDER_MIN * pbound[p])) target[p] = -1; if (target[p] >= 0) { nfix++; fixFaces[pclass[p] * 7 + target[p]] += psize[p]; } }
log(`patches to repaint: ${nfix}`, CLASSES.flatMap((a, i) => CLASSES.map((b, j) => fixFaces[i * 7 + j] ? `${a}->${b} ${fixFaces[i * 7 + j]} faces` : '')).filter(Boolean).join(', '));
// the colour: the mean of the bordering faces of the target class
for (let i = 0; i < edgeList.length; i += 2) {
  const a = edgeList[i], b = edgeList[i + 1];
  for (const [x, y] of [[a, b], [b, a]]) { const p = patch[x]; if (target[p] >= 0 && patch[y] !== p && fcls[y] === target[p] && target[patch[y]] < 0) { fill[p * 3] += fcol[y * 3]; fill[p * 3 + 1] += fcol[y * 3 + 1]; fill[p * 3 + 2] += fcol[y * 3 + 2]; filln[p]++; } }
}
// the crease faces along a repainted patch, of its old colour, go with it (the rounded
// junction's half on that side), by their neighbours
const fnew = new Int8Array(NF).fill(-1), fnewCol = new Float32Array(NF * 3);
for (let f = 0; f < NF; f++) { const p = patch[f]; if (target[p] >= 0 && filln[p]) { fnew[f] = target[p]; fnewCol[f * 3] = fill[p * 3] / filln[p]; fnewCol[f * 3 + 1] = fill[p * 3 + 1] / filln[p]; fnewCol[f * 3 + 2] = fill[p * 3 + 2] / filln[p]; } }
for (let round = 0; round < 3; round++) {
  const votes = new Map();
  for (let i = 0; i < edgeList.length; i += 2) {
    const a = edgeList[i], b = edgeList[i + 1];
    for (const [c, o] of [[a, b], [b, a]]) if (crease[c] && fnew[c] < 0 && fnew[o] >= 0 && fcls[c] !== fnew[o] && fcls[c] === pclass[patch[o]]) { let m = votes.get(c); if (!m) { m = []; votes.set(c, m); } m.push(o); }
  }
  let n = 0;
  for (const [c, os] of votes) { if (os.length < 2) continue; fnew[c] = fnew[os[0]]; fnewCol[c * 3] = fnewCol[os[0] * 3]; fnewCol[c * 3 + 1] = fnewCol[os[0] * 3 + 1]; fnewCol[c * 3 + 2] = fnewCol[os[0] * 3 + 2]; n++; }
  if (!n) break;
}

// ---------- the big parts of a class in one colour: a tint that spilled over goes ----------
// the class's big patches (the face, the hands; the hair), with the crease faces of that
// class touching them; each texel keeps part of its own brightness (FLAT) over the median
const BIG = { skin: 2000, hair: 20000 };
const flatOf = new Int8Array(NF).fill(-1);   // face -> the flatten set (index into flats)
const flats = [];
for (const cname of Object.keys(FLAT)) {
  const k = CLASSES.indexOf(cname); if (k < 0) continue;
  const big = new Set(); for (let p = 0; p < NP; p++) if (pclass[p] === k && psize[p] >= (BIG[cname] || 2000) && target[p] < 0) big.add(p);
  if (!big.size) continue;
  const id = flats.length; flats.push({ cname, k, keep: FLAT[cname], faces: [] });
  for (let f = 0; f < NF; f++) if (big.has(patch[f]) && fnew[f] < 0) { flatOf[f] = id; flats[id].faces.push(f); }
  for (let i = 0; i < edgeList.length; i += 2) {
    const a = edgeList[i], b = edgeList[i + 1];
    for (const [c, o] of [[a, b], [b, a]]) if (crease[c] && flatOf[c] < 0 && fcls[c] === k && flatOf[o] === id && fnew[c] < 0) { flatOf[c] = id; flats[id].faces.push(c); }
  }
}
for (const fl of flats) {
  const ch = [[], [], []]; for (const f of fl.faces) for (let c = 0; c < 3; c++) ch[c].push(fcol[f * 3 + c]);
  fl.median = ch.map((a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; });
  fl.lum = 0.3 * fl.median[0] + 0.59 * fl.median[1] + 0.11 * fl.median[2];
  log(`${fl.cname}: ${fl.faces.length} faces painted ${fl.median.map((x) => x.toFixed(0)).join(',')} keeping ${fl.keep} of their shading`);
}

// ---------- the texture: the flattened parts' texels, then the repainted faces' ----------
const out = Buffer.from(px);
const touched = new Uint8Array(W * H);
let nfaces = 0, nflat = 0;
const order = []; for (let f = 0; f < NF; f++) if (flatOf[f] >= 0 && fnew[f] < 0) order.push(f); for (let f = 0; f < NF; f++) if (fnew[f] >= 0) order.push(f);
for (const f of order) {
  if (fnew[f] >= 0) nfaces++; else nflat++;
  const fl = fnew[f] < 0 ? flats[flatOf[f]] : null;
  const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
  const ax = uv[a * 2] * W, ay = uv[a * 2 + 1] * H, bx = uv[b * 2] * W, by = uv[b * 2 + 1] * H, cx = uv[c * 2] * W, cy = uv[c * 2 + 1] * H;
  const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (Math.abs(area) < 1e-9) continue;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const qx = x + 0.5, qy = y + 0.5;
    const w0 = ((bx - qx) * (cy - qy) - (cx - qx) * (by - qy)) / area, w1 = ((cx - qx) * (ay - qy) - (ax - qx) * (cy - qy)) / area, w2 = 1 - w0 - w1;
    if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;   // (a little over the edges: the padding between seams)
    const o = y * W + x;
    if (fl) {
      const L = 0.3 * px[o * 4] + 0.59 * px[o * 4 + 1] + 0.11 * px[o * 4 + 2], Lt = fl.lum + (L - fl.lum) * fl.keep, g = Lt / (fl.lum || 1);
      for (let c = 0; c < 3; c++) out[o * 4 + c] = Math.max(0, Math.min(255, Math.round(fl.median[c] * g)));
    } else {
      out[o * 4] = Math.round(fnewCol[f * 3]); out[o * 4 + 1] = Math.round(fnewCol[f * 3 + 1]); out[o * 4 + 2] = Math.round(fnewCol[f * 3 + 2]);
    }
    touched[o] = 1;
  }
}
let nt = 0; for (let o = 0; o < W * H; o++) nt += touched[o];
log(`repainted ${nfaces} faces, flattened ${nflat}, ${nt} texels`);
// --probe=x,y,z,r: the faces about a point of the model, their classes, patches and fate
if (arg('probe', '')) {
  const [qx, qy, qz, qr] = arg('probe', '').split(',').map(Number);
  const seen = new Map();
  for (let f = 0; f < NF; f++) {
    const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
    const x = (pos[a] + pos[b] + pos[c]) / 3, y = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, z = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
    if (Math.hypot(x - qx, y - qy, z - qz) > qr) continue;
    const p = patch[f], k = `${p}`; let e = seen.get(k);
    if (!e) { e = { p, cls: CLASSES[fcls[f]], n: 0, crease: 0, size: psize[p], ratio: +(psize[p] / Math.max(pbound[p], 1)).toFixed(1), contact: CLASSES.map((c2, i) => contact[p * 7 + i] ? `${c2}:${contact[p * 7 + i]}` : '').filter(Boolean).join(' '), bound: pbound[p], fate: target[p] >= 0 ? `-> ${CLASSES[target[p]]}` : '' }; seen.set(k, e); }
    e.n++; if (crease[f]) e.crease++;
  }
  const rows = [...seen.values()].sort((a, b) => b.n - a.n).slice(0, 14);
  log(`probe at ${qx},${qy},${qz} r ${qr}:`); for (const e of rows) console.log(`   patch ${e.p} ${e.cls}: ${e.n} faces here (${e.crease} crease), patch ${e.size} faces, ratio ${e.ratio}, border ${e.bound} [${e.contact}] ${e.fate}`);
}
// --box=x0,x1,y0,y1,z0,z1[,class]: the faces in a box of the model (of a class), by patch
if (arg('box', '')) {
  const bx = arg('box', '').split(','), want = bx[6] ? CLASSES.indexOf(bx[6]) : -1, [x0, x1, y0, y1, z0, z1] = bx.map(Number);
  const seen = new Map();
  for (let f = 0; f < NF; f++) {
    const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
    const x = (pos[a] + pos[b] + pos[c]) / 3, y = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, z = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
    if (x < x0 || x > x1 || y < y0 || y > y1 || z < z0 || z > z1 || (want >= 0 && fcls[f] !== want)) continue;
    const p = patch[f]; let e = seen.get(p);
    if (!e) { e = { p, cls: CLASSES[fcls[f]], n: 0, crease: 0, size: psize[p], ratio: +(psize[p] / Math.max(pbound[p], 1)).toFixed(1), contact: CLASSES.map((c2, i) => contact[p * 7 + i] ? `${c2}:${contact[p * 7 + i].toFixed(0)}` : '').filter(Boolean).join(' '), bound: pbound[p], fate: target[p] >= 0 ? `-> ${CLASSES[target[p]]}` : '', ys: [] }; seen.set(p, e); }
    e.n++; if (crease[f]) e.crease++; e.ys.push(y);
  }
  const rows = [...seen.values()].sort((a, b) => b.n - a.n);
  log(`box ${arg('box', '')}: ${rows.reduce((a, e) => a + e.n, 0)} faces in ${rows.length} patches`);
  for (const e of rows.slice(0, 16)) console.log(`   patch ${e.p} ${e.cls}: ${e.n} faces here (${e.crease} crease) y ${Math.min(...e.ys).toFixed(3)}..${Math.max(...e.ys).toFixed(3)}, patch ${e.size} faces, ratio ${e.ratio}, border ${e.bound} [${e.contact}] ${e.fate}`);
}
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(OUT);
log('wrote', OUT);
if (GROUPS) {
  const gp = Buffer.alloc(W * H * 4);
  const pal = [[80, 80, 80], [230, 160, 100], [30, 30, 50], [220, 40, 40], [240, 240, 240], [60, 90, 220], [60, 180, 80]];
  const cmask = new Uint8Array(W * H), cmap = new Uint8Array(W * H).fill(255);
  for (let f = 0; f < NF; f++) {
    const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
    const ax = uv[a * 2] * W, ay = uv[a * 2 + 1] * H, bx = uv[b * 2] * W, by = uv[b * 2 + 1] * H, cx = uv[c * 2] * W, cy = uv[c * 2 + 1] * H;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const qx = x + 0.5, qy = y + 0.5;
      const w0 = ((bx - qx) * (cy - qy) - (cx - qx) * (by - qy)) / area, w1 = ((cx - qx) * (ay - qy) - (ax - qx) * (cy - qy)) / area, w2 = 1 - w0 - w1;
      if (w0 < -0.003 || w1 < -0.003 || w2 < -0.003) continue;
      cmap[y * W + x] = fcls[f]; if (crease[f]) cmask[y * W + x] = 1;
    }
  }
  for (let o = 0; o < W * H; o++) { const k = cmap[o]; const cr = cmask[o], fx = touched[o]; const c = k === 255 ? [20, 20, 20] : pal[k]; gp[o * 4] = fx ? 255 : cr ? 255 : c[0]; gp[o * 4 + 1] = fx ? 0 : cr ? 255 : c[1]; gp[o * 4 + 2] = fx ? 255 : cr ? 0 : c[2]; gp[o * 4 + 3] = 255; }
  await sharp(gp, { raw: { width: W, height: H, channels: 4 } }).png().toFile(GROUPS);
  log('map picture (face classes, creases yellow, repainted magenta):', GROUPS);
}
if (DEBUG) {
  const dbg = Buffer.alloc(W * H * 4);
  for (let o = 0; o < W * H; o++) { const ch = touched[o]; dbg[o * 4] = ch ? 255 : px[o * 4] >> 1; dbg[o * 4 + 1] = ch ? 0 : px[o * 4 + 1] >> 1; dbg[o * 4 + 2] = ch ? 255 : px[o * 4 + 2] >> 1; dbg[o * 4 + 3] = 255; }
  await sharp(dbg, { raw: { width: W, height: H, channels: 4 } }).png().toFile(DEBUG);
  log('debug picture', DEBUG);
}
