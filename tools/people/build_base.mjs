// Makes the base body every generated person is fitted from (web/world/people/base.bin):
// the reference body (anatomy.js, REF below) meshed finely from its field, cut
// down to a budget of clean, even triangles (more on the face, ears, hands and
// feet), its skin weights taken from how the field was built (sdf.js evalW) and
// smoothed, and the paint coordinates (part) for paint.js.
//   node tools/people/build_base.mjs [--cell=0.0025] [--verts=20000] [--preview=out.png]
import fs from 'node:fs';
import path from 'node:path';
import { anatomy, posed } from '../../web/world/people/anatomy.js';
import { compile, evalW } from '../../web/world/people/sdf.js';
import { surfaceNets, project, relax, decimate, dropSpecks, neighbours, normals } from '../../web/world/people/mesh.js';
import { measureBones } from '../../web/world/people/fit.js';
import { packBase } from '../../web/world/people/base.js';
import { BONE, BONE_NAMES, NB } from '../../web/world/people/rig.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const CELL = +arg('cell', 0.0025), VERTS = +arg('verts', 24000);
// the reference: a young adult between the two sexes, average in everything
export const REF = { age: 22, sex: 0.5 };
const t0 = Date.now(), log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a);

const A = anatomy(REF), L = A.L;
const tree = posed(A.tree, A.ad), F = compile(tree);
let m = surfaceNets(F.f, F.box, CELL);
m = dropSpecks(m, 100);
log('surface nets', m.pos.length / 3, 'verts');
project(m, F.f, 3);
relax(m, 1, 0.5, F.f);

// where detail matters (A pose positions)
const J = (n) => { const w = A.aw[BONE[n]]; return [w[12], w[13], w[14]]; };
const near = (p, q, r) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < r;
const hands = ['LHand', 'RHand'].map(J), feet = ['LFoot', 'RFoot'].map(J);
const ears = [1, -1].map((s) => [s * L.hw * 0.5, L.eyeY - 0.06 * L.hh, -0.04 * L.hh]);
const weight = (x, y, z) => {
  const p = [x, y, z];
  for (const h of hands) if (near(p, [h[0] + Math.sign(h[0]) * L.handL * 0.35, h[1] - L.handL * 0.35, h[2]], L.handL * 0.75)) return 9;
  for (const e of ears) if (near(p, e, L.hh * 0.16)) return 6;
  if (y > L.chinY - 0.01 && z > 0.05 * L.hh) return 4;    // the face
  if (y > L.chinY - 0.02) return 1.6;                       // the rest of the head
  for (const f of feet) if (y < L.ankleY + 0.03 && Math.abs(x - f[0]) < 0.08) return 2;
  return 1;
};
const maxEdge = (x, y, z) => (weight(x, y, z) > 3 ? 0.012 : 0.03);
m = decimate(m, VERTS, { weight, maxEdge });
log('decimated', m.pos.length / 3, 'verts', m.idx.length / 3, 'tris');
const nb = neighbours(m);
for (let i = 0; i < 4; i++) { relax(m, 1, 0.5, F.f, nb); }
project(m, F.f, 4);
log('relaxed');

// skin weights from the field, smoothed over the surface, the four strongest kept
const nv = m.pos.length / 3, Wd = new Float32Array(nv * NB);
for (let v = 0; v < nv; v++) {
  const r = evalW(F, m.pos[3 * v], m.pos[3 * v + 1], m.pos[3 * v + 2]);
  let s = 0; for (const [, w] of r.w) s += w;
  for (const [b, w] of r.w) Wd[v * NB + b] = w / (s || 1);
}
const fingers = new Uint8Array(NB); BONE_NAMES.forEach((n, i) => { if (/Finger|Hand/.test(n)) fingers[i] = 1; });
for (let it = 0; it < 3; it++) {
  const Wn = new Float32Array(Wd.length);
  for (let v = 0; v < nv; v++) {
    const s = nb.start[v], e = nb.start[v + 1];
    // hands keep their own (sharp) weights: the fingers are close together
    let onHand = 0; for (let b = 0; b < NB; b++) if (fingers[b]) onHand += Wd[v * NB + b];
    const k = onHand > 0.5 ? 0.15 : 0.5;
    for (let b = 0; b < NB; b++) {
      let a = 0; for (let j = s; j < e; j++) a += Wd[nb.list[j] * NB + b];
      Wn[v * NB + b] = Wd[v * NB + b] * (1 - k) + (a / Math.max(1, e - s)) * k;
    }
  }
  Wd.set(Wn);
}
// the head is rigid: anything mostly on the head (ears, jaw, the back of the skull) follows it alone
for (let v = 0; v < nv; v++) {
  const h = Wd[v * NB + BONE.Head];
  if (h > 0.62) { for (let b = 0; b < NB; b++) Wd[v * NB + b] = 0; Wd[v * NB + BONE.Head] = 1; }
  else if (h > 0.3) { const k = (h - 0.3) / 0.32; for (let b = 0; b < NB; b++) Wd[v * NB + b] *= (1 - k * 0.6); Wd[v * NB + BONE.Head] += k * 0.6; }
}
// no vertex is left without a bone: take the neighbours' weights
for (let pass = 0; pass < 4; pass++) for (let v = 0; v < nv; v++) {
  let s = 0; for (let b = 0; b < NB; b++) s += Wd[v * NB + b];
  if (s > 1e-6) continue;
  for (let j = nb.start[v]; j < nb.start[v + 1]; j++) for (let b = 0; b < NB; b++) Wd[v * NB + b] += Wd[nb.list[j] * NB + b];
}
const skin = new Uint8Array(nv * 4), wts = new Float32Array(nv * 4);
for (let v = 0; v < nv; v++) {
  const top = [];
  for (let b = 0; b < NB; b++) { const w = Wd[v * NB + b]; if (w > 0.002) top.push([w, b]); }
  top.sort((a, b) => b[0] - a[0]); top.length = Math.min(4, top.length);
  const s = top.reduce((a, t) => a + t[0], 0) || 1;
  top.forEach(([w, b], k) => { skin[4 * v + k] = b; wts[4 * v + k] = w / s; });
}
log('weights');

// paint coordinates (part): limb (0 trunk, 1 arm, 2 leg, 3 head), place along it (arm: 0 shoulder .. 1 wrist, more on the hand;
// leg: 0 hip .. 1 ankle, more on the foot; head: height from the chin in head heights), side (-1 right, 1 left), region
const part = new Float32Array(nv * 4), share = new Float32Array(nv * 4);
const seg = (p, a, b) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2; return Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / l2)); };
const chainS = (p, pts) => {   // nearest point on a polyline, as distance along it / its length to the last point
  let best = Infinity, bs = 0, acc = 0;
  const lens = []; for (let i = 0; i < pts.length - 1; i++) lens.push(Math.hypot(...pts[i + 1].map((v, k) => v - pts[i][k])));
  const total = lens.slice(0, 2).reduce((a, b) => a + b, 0);
  for (let i = 0; i < pts.length - 1; i++) {
    const t = seg(p, pts[i], pts[i + 1]), q = pts[i].map((v, k) => v + (pts[i + 1][k] - v) * t), d = Math.hypot(...q.map((v, k) => v - p[k]));
    if (d < best) { best = d; bs = (acc + t * lens[i]) / total; }
    acc += lens[i];
  }
  return bs;
};
for (let v = 0; v < nv; v++) {
  const p = [m.pos[3 * v], m.pos[3 * v + 1], m.pos[3 * v + 2]];
  // shares from the smoothed (all-bone) weights, so they change smoothly over the body
  let arm = 0, leg = 0, head = 0, ext = 0;
  for (let b = 0; b < NB; b++) {
    const n = BONE_NAMES[b], w = Wd[v * NB + b];
    if (/ArmA|ForeArm|Hand|Finger/.test(n)) arm += w;
    if (/Thigh|Leg|Foot|Toe/.test(n)) leg += w;
    if (n === 'Head') head += w;
    if (/Hand|Finger|Foot|Toe/.test(n)) ext += w;
  }
  share[4 * v] = arm; share[4 * v + 1] = leg; share[4 * v + 2] = head; share[4 * v + 3] = ext;
  const side = p[0] >= 0 ? 1 : -1, S = side > 0 ? 'L' : 'R';
  let limb = 0, s = 0;
  if (arm > 0.5) { limb = 1; s = chainS(p, [J(S + 'ArmA'), J(S + 'ForeArm'), J(S + 'Hand'), J(S + 'FingerC3')]); }
  else if (leg > 0.5) { limb = 2; s = chainS(p, [J(S + 'Thigh'), J(S + 'Leg'), J(S + 'Foot'), J(S + 'Toe')]); }
  else if (head > 0.5) { limb = 3; s = (p[1] - L.chinY) / L.hh; }
  else s = (p[1] - L.hipJ) / (L.shY - L.hipJ);   // trunk: 0 at the hip joints, 1 at the shoulders
  part[4 * v] = limb; part[4 * v + 1] = s; part[4 * v + 2] = side; part[4 * v + 3] = 0;
}

const aw0 = new Float64Array(16 * NB); A.aw.forEach((w, i) => aw0.set(w, 16 * i));
const meas0 = measureBones(F.f, A.aw, BONE_NAMES);
const idx = nv < 65536 ? Uint16Array.from(m.idx) : m.idx;
const meta = { version: 1, params: REF, nv, nf: m.idx.length / 3, bones: BONE_NAMES, H: L.H, land: Object.fromEntries(Object.entries(L).filter(([, v]) => typeof v === 'number' || Array.isArray(v))) };
const buf = packBase(meta, { pos: m.pos, idx, skin, wts, aw0, meas0, part, share });
fs.writeFileSync(path.join(ROOT, 'web/world/people/base.bin'), buf);
log('wrote base.bin', (buf.length / 1024).toFixed(0), 'KB');

const pv = arg('preview', '');
if (pv) {
  const { sheet, closeup } = await import('./raster.mjs');
  fs.writeFileSync(pv, sheet([{ meshes: [m] }], { views: ['front', 'q34', 'side'], ppm: 300, cw: 300, ch: 560, wire: true }));
  fs.writeFileSync(pv.replace('.png', '_head.png'), closeup([m], 'q34', [-0.13, L.chinY - 0.04, 0.13, L.crown + 0.02], 600, true));
  const h = hands[0];
  fs.writeFileSync(pv.replace('.png', '_hand.png'), closeup([m], { yaw: 0, pitch: Math.PI / 2 - 0.2, pivot: h }, [h[0] - 0.05, h[1] - 0.2, h[0] + 0.25, h[1] + 0.05], 600, true));
}
