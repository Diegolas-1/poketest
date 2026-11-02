// Bakes Ash's V2 body onto the game's Ash rig. The V2 model is an unrigged, high-poly
// OBJ with a diffuse texture (a 3D generator's output: body, clothes, backpack, gloves
// and shoes modelled, the head bald and blank). This makes native/cast/ash2.glb from it
// and native/cast/ash.glb: the same skeleton (bone names, rest rotations), the same
// idle / walk / run clips and the old head (face, eyes, hair, cap, logo: their meshes and
// textures as they are), with the new body in their place, and writes the "ash2" look
// into native/cast/cast.json. The game picks it with the settings' "Ash's model" row.
//
//   node tools/native/bake_ash2.mjs <dir with base.obj and texture_diffuse.png> [--tris=20000]
//   (the model's zip unpacked into web/world/local/ash2/, say: local/ stays on this machine;
//   npm install in tools/native first)
//
// How:
//   1. The OBJ is read, put in the rig's frame (scaled so its neck base sits at the rig's
//      Neck joint, its torso centred) and decimated (meshoptimizer) to --tris triangles.
//   2. The rig's joints are moved to the new body's proportions (FIT below: hips, knees,
//      ankles, toes, shoulders, elbows, wrists in the OBJ's own units), rest rotations
//      kept, so the clips still play; the Neck and Head stay where they were, so the old
//      head parts and everything that looks at his head are unchanged. The clips' Waist
//      height track moves with the hips; the gait strides scale with the legs.
//   3. Skin weights come from the old body: its meshes are posed by their own skinning
//      onto the new rest and into the V2 model's A-pose (arms down), each new vertex takes
//      the weights of its nearest old vertices (cloth bones folded into the limb they hang
//      from, hair bones into the head), smoothed over the mesh. The new mesh is then
//      "unposed" into the rest pose through the inverse of its own skinning, so the clips
//      reproduce the A-pose exactly where the rig puts the arms there.
//   4. The head is cut off at the neck (hidden inside the old head), the mesh split into a
//      skin and a cloth surface (by the texture's colour) for the cel profiles, normals
//      recomputed, the texture shrunk to 1024 and embedded.
// bake_cast.mjs keeps the ash2 look when it rewrites cast.json.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { weld, simplify, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from '../../web/lib/three/three.module.min.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'native/cast');
const SRC = process.argv[2];
if (!SRC) { console.error('usage: bake_ash2.mjs <dir with base.obj + texture_diffuse.png> [--tris=20000]'); process.exit(1); }
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const TRIS = +arg('tris', 20000);
const OBJ = path.join(SRC, 'base.obj');
const TEX = path.join(SRC, 'texture_diffuse.png');

// ---------- the fit: where the V2 model's joints are, in the OBJ's own units ----------
// (measured on the model: the legs' and arms' centre lines, the neck's base, the torso's
// middle; x for the left side, the right mirrors it)
const FIT = {
  neckY: 1.40,                      // the neck's base (top of the shoulders): goes to the rig's Neck joint
  zc: 0.05,                         // the torso's middle front-to-back: goes to z = 0
  hip: [0.104, 0.78, 0.05],
  knee: [0.12, 0.475, 0.02],
  ankle: [0.16, 0.17, -0.01],
  toe: [0.16, 0.04, 0.13],
  shoulder: [0.195, 1.385, 0.05],   // the upper arm's root
  wrist: [0.497, 1.039, 0.07],
  fingertip: [0.647, 0.844, 0.10],
  headCutY: 1.125,                  // rig units: the neck is cut here (inside the old head, whose bottom is ~1.08)
};
const CLOTH_PREFIX = /^cl[JSP]/;    // the old cloth bones (jacket panels, sleeve and trouser hems)
const HAIR_PREFIX = /^hr/;

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---------- 1. the OBJ ----------
async function readObj(file) {
  const v = [], vt = [], tri = [];   // tri: [vi, vti] x3
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.charCodeAt(0) === 118 /* v */) {
      if (line.charCodeAt(1) === 32) { const p = line.split(/\s+/); v.push(+p[1], +p[2], +p[3]); }
      else if (line.charCodeAt(1) === 116) { const p = line.split(/\s+/); vt.push(+p[1], +p[2]); }
    } else if (line.charCodeAt(0) === 102 /* f */) {
      const p = line.split(/\s+/).slice(1).map((s) => { const q = s.split('/'); return [(+q[0]) - 1, q[1] ? (+q[1]) - 1 : -1]; });
      for (let i = 1; i + 1 < p.length; i++) tri.push(p[0], p[i], p[i + 1]);
    }
  }
  // one vertex per (position, uv) pair
  const key = new Map(), pos = [], uv = [], idx = new Uint32Array(tri.length);
  for (let i = 0; i < tri.length; i++) {
    const [vi, ti] = tri[i], k = vi * 1048576 + (ti + 1);
    let j = key.get(k);
    if (j === undefined) { j = pos.length / 3; key.set(k, j); pos.push(v[vi * 3], v[vi * 3 + 1], v[vi * 3 + 2]); uv.push(ti >= 0 ? vt[ti * 2] : 0, ti >= 0 ? 1 - vt[ti * 2 + 1] : 0); }
    idx[i] = j;
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), idx };
}
log('reading', OBJ);
const obj = await readObj(OBJ);
log('obj', obj.pos.length / 3, 'vertices', obj.idx.length / 3, 'triangles');

// into the rig's frame: feet at y = 0 already; the neck's base at the Neck joint, the torso centred
const io = new NodeIO();
const old = await io.read(path.join(OUT, 'ash.glb'));
const byName = new Map(old.getRoot().listNodes().map((n) => [n.getName(), n]));
const calem = byName.get('Calem');
const calemInv = new THREE.Matrix4().fromArray(calem.getWorldMatrix()).invert();
const worldOf = (n) => new THREE.Matrix4().fromArray(n.getWorldMatrix()).premultiply(calemInv);   // in the model's frame
const posOf = (n) => new THREE.Vector3().setFromMatrixPosition(worldOf(n));
const NECK_Y = posOf(byName.get('Neck')).y;
const S = NECK_Y / FIT.neckY;
const fit = (a) => [a[0] * S, a[1] * S, (a[2] - FIT.zc) * S];
for (let i = 0; i < obj.pos.length; i += 3) { obj.pos[i] *= S; obj.pos[i + 1] *= S; obj.pos[i + 2] = (obj.pos[i + 2] - FIT.zc) * S; }
log('scale', S.toFixed(4), 'neck at', NECK_Y.toFixed(4));

// decimate
const tmp = new Document();
{
  const buf = tmp.createBuffer();
  const P = tmp.createAccessor().setType('VEC3').setArray(obj.pos).setBuffer(buf);
  const U = tmp.createAccessor().setType('VEC2').setArray(obj.uv).setBuffer(buf);
  const I = tmp.createAccessor().setType('SCALAR').setArray(obj.idx).setBuffer(buf);
  const prim = tmp.createPrimitive().setAttribute('POSITION', P).setAttribute('TEXCOORD_0', U).setIndices(I);
  tmp.createScene().addChild(tmp.createNode().setMesh(tmp.createMesh().addPrimitive(prim)));
  await MeshoptSimplifier.ready;
  await tmp.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: TRIS / (obj.idx.length / 3), error: 0.05 }));
}
const dprim = tmp.getRoot().listMeshes()[0].listPrimitives()[0];
let pos = Float32Array.from(dprim.getAttribute('POSITION').getArray());
let uv = Float32Array.from(dprim.getAttribute('TEXCOORD_0').getArray());
let idx = Uint32Array.from(dprim.getIndices().getArray());
log('decimated to', pos.length / 3, 'vertices', idx.length / 3, 'triangles');

// ---------- the texture: the colour under each vertex (skin or cloth), the 1024 copy ----------
const texRaw = await sharp(TEX).raw().toBuffer({ resolveWithObject: true });
const texPng = await sharp(TEX).resize(1024, 1024).png({ compressionLevel: 9 }).toBuffer();
const isSkinAt = (u, v) => {
  const { width: W, height: H, channels: C } = texRaw.info;
  const x = Math.min(W - 1, Math.max(0, Math.floor(u * W))), y = Math.min(H - 1, Math.max(0, Math.floor(v * H)));
  const o = (y * W + x) * C, r = texRaw.data[o], g = texRaw.data[o + 1], b = texRaw.data[o + 2];
  return r > 150 && r - b > 60 && g - b > 15 && r - g > 20 && r - g < 110;
};
let skinV = new Uint8Array(pos.length / 3);
for (let i = 0; i < skinV.length; i++) skinV[i] = isSkinAt(uv[i * 2], uv[i * 2 + 1]) ? 1 : 0;

// ---------- cut the head off: skin above the cut (the neck's top sits inside the old head) ----------
{
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ys = [pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1]], lo = Math.min(...ys);
    const skin = skinV[a] + skinV[b] + skinV[c];
    if ((lo > FIT.headCutY && skin >= 2) || lo > FIT.headCutY + 0.05) continue;
    keep.push(a, b, c);
  }
  const map = new Int32Array(pos.length / 3).fill(-1), np = [], nu = [], ns = [];
  const out = new Uint32Array(keep.length);
  for (let i = 0; i < keep.length; i++) {
    const o = keep[i];
    if (map[o] < 0) { map[o] = np.length / 3; np.push(pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]); nu.push(uv[o * 2], uv[o * 2 + 1]); ns.push(skinV[o]); }
    out[i] = map[o];
  }
  pos = new Float32Array(np); uv = new Float32Array(nu); skinV = new Uint8Array(ns); idx = out;
  log('head cut:', pos.length / 3, 'vertices', idx.length / 3, 'triangles left');
}
const NV = pos.length / 3;

// ---------- 2. the rig: the old rest, then the joints moved to the new body ----------
// node tree in the model's frame (Calem's children down), for forward kinematics
const nodes = old.getRoot().listNodes();
const restOld = new Map();   // name -> Matrix4 (model frame)
for (const n of nodes) if (n.getName()) restOld.set(n.getName(), worldOf(n));
const nameOf = (n) => n.getName();

// a joint's new place in the model's frame; its local translation follows (rotation kept)
function setGlobal(name, p) {
  const n = byName.get(name), par = n.getParentNode();
  const pw = worldOf(par).invert();
  const l = p.clone().applyMatrix4(pw);
  n.setTranslation([l.x, l.y, l.z]);
}
const L = (a) => V3(fit(a)), R = (a) => { const v = V3(fit(a)); v.x = -v.x; return v; };
const oldHip = posOf(byName.get('LThigh')), oldAnkle = posOf(byName.get('LFoot'));
const oldWaistY = posOf(byName.get('Waist')).y, oldHandX = posOf(byName.get('LHand')).x;
const hipsY = fit(FIT.hip)[1];
const waistY = hipsY + (posOf(byName.get('Waist')).y - posOf(byName.get('Hips')).y);
const spine1Y = waistY + (posOf(byName.get('Spine1')).y - posOf(byName.get('Waist')).y);
const fr = (n) => (posOf(byName.get(n)).y - posOf(byName.get('Spine1')).y) / (NECK_Y - posOf(byName.get('Spine1')).y);
const f2 = fr('Spine2'), f3 = fr('Spine3');
const pinned = ['Neck', 'Head', 'LShoulder', 'RShoulder'].map((n) => [n, posOf(byName.get(n))]);
const zOf = (n) => posOf(byName.get(n)).z;
// top down, so each parent's new frame is in place for its children
setGlobal('Waist', new THREE.Vector3(0, waistY, zOf('Waist')));
setGlobal('Hips', new THREE.Vector3(0, hipsY, zOf('Hips')));
setGlobal('Spine1', new THREE.Vector3(0, spine1Y, zOf('Spine1')));
setGlobal('Spine2', new THREE.Vector3(0, spine1Y + f2 * (NECK_Y - spine1Y), zOf('Spine2')));
setGlobal('Spine3', new THREE.Vector3(0, spine1Y + f3 * (NECK_Y - spine1Y), zOf('Spine3')));
for (const [n, p] of pinned) setGlobal(n, p);
const armLen = L(FIT.wrist).distanceTo(L(FIT.shoulder));
for (const [side, P] of [['L', L], ['R', R]]) {
  const sh = P(FIT.shoulder); sh.z = 0;
  const dx = side === 'L' ? 1 : -1;
  setGlobal(side + 'ArmA', sh);                                         // (ArmB rides with it)
  setGlobal(side + 'ForeArm', sh.clone().add(new THREE.Vector3(dx * armLen / 2, 0, 0)));
  setGlobal(side + 'Hand', sh.clone().add(new THREE.Vector3(dx * armLen, 0, 0)));
  setGlobal(side + 'Thigh', P(FIT.hip));
  setGlobal(side + 'Leg', P(FIT.knee));
  setGlobal(side + 'Foot', P(FIT.ankle));
  setGlobal(side + 'Toe', P(FIT.toe));
}
// the hand's bones (fingers, the ball in his hand) stretch to the new hand
const handK = L(FIT.fingertip).distanceTo(L(FIT.wrist)) / (0.597 - oldHandX);   // (0.597: the old fingertips)
for (const side of ['L', 'R']) {
  const stack = [...byName.get(side + 'Hand').listChildren()];
  while (stack.length) { const n = stack.pop(); n.setTranslation(n.getTranslation().map((x) => x * handK)); stack.push(...n.listChildren()); }
}
const legK = L(FIT.ankle).distanceTo(L(FIT.hip)) / oldAnkle.distanceTo(oldHip);
const dWaist = waistY - oldWaistY;
log('hips', hipsY.toFixed(3), 'waist', waistY.toFixed(3), 'legK', legK.toFixed(3), 'handK', handK.toFixed(3), 'arm', armLen.toFixed(3));
// the clips' Waist height follows the hips
for (const anim of old.getRoot().listAnimations()) for (const ch of anim.listChannels()) {
  if (ch.getTargetNode() !== byName.get('Waist') || ch.getTargetPath() !== 'translation') continue;
  const acc = ch.getSampler().getOutput(), a = Float32Array.from(acc.getArray());
  for (let i = 1; i < a.length; i += 3) a[i] += dWaist;
  acc.setArray(a);
}
const restNew = new Map();
for (const n of nodes) if (n.getName()) restNew.set(n.getName(), worldOf(n));

// the A-pose: the arms turned from the rest (+x / -x) toward the model's arm line
function fk(rotate) {   // name -> Matrix4 (model frame) with some bones' local rotations replaced
  const out = new Map();
  const walk = (n, parent) => {
    const t = n.getTranslation(), r = rotate.get(n.getName()) || n.getRotation(), s = n.getScale();
    const m = new THREE.Matrix4().compose(V3(t), new THREE.Quaternion(r[0], r[1], r[2], r[3]), V3(s)).premultiply(parent);
    if (n.getName()) out.set(n.getName(), m);
    for (const c of n.listChildren()) walk(c, m);
  };
  for (const c of calem.listChildren()) walk(c, new THREE.Matrix4());
  return out;
}
const rotate = new Map();
for (const [side, P] of [['L', L], ['R', R]]) {
  const n = byName.get(side + 'ArmA'), par = n.getParentNode();
  const qp = new THREE.Quaternion().setFromRotationMatrix(worldOf(par));
  const dir = P(FIT.wrist).sub(P(FIT.shoulder)).normalize();
  const arc = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(side === 'L' ? 1 : -1, 0, 0), dir);
  const r = n.getRotation(), ql = new THREE.Quaternion(r[0], r[1], r[2], r[3]);
  const q = qp.clone().invert().multiply(arc).multiply(qp).multiply(ql);
  rotate.set(side + 'ArmA', [q.x, q.y, q.z, q.w]);
}
const posed = fk(rotate);

// ---------- 3. weights from the old body ----------
// the bone a cloth or hair bone's weight goes to
const fold = (name) => {
  if (HAIR_PREFIX.test(name)) return 'Head';
  let n = byName.get(name);
  while (n && CLOTH_PREFIX.test(n.getName())) n = n.getParentNode();
  return n.getName();
};
const jointList = byName.get('face_on_1').getSkin().listJoints().map(nameOf);   // the 70 rig bones, the new skin's order
const jointIx = new Map(jointList.map((n, i) => [n, i]));
const meshNodes = nodes.filter((n) => n.getMesh());
const ref = { pos: [], w: [] };   // posed old vertices and their weights {jointIx: w}
for (const mn of meshNodes) {
  const prim = mn.getMesh().listPrimitives()[0];
  const P = prim.getAttribute('POSITION').getArray(), J = prim.getAttribute('JOINTS_0').getArray(), W = prim.getAttribute('WEIGHTS_0').getArray();
  const joints = mn.getSkin().listJoints().map(nameOf);
  const skinM = joints.map((jn) => posed.get(jn).clone().multiply(restOld.get(jn).clone().invert()));
  for (let i = 0; i < P.length / 3; i++) {
    const v = new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), acc = new THREE.Vector3(), w = {};
    for (let k = 0; k < 4; k++) {
      const wk = W[i * 4 + k]; if (wk <= 0) continue;
      acc.add(v.clone().applyMatrix4(skinM[J[i * 4 + k]]).multiplyScalar(wk));
      const j = jointIx.get(fold(joints[J[i * 4 + k]]));
      w[j] = (w[j] || 0) + wk;
    }
    ref.pos.push(acc.x, acc.y, acc.z); ref.w.push(w);
  }
}
const NR = ref.w.length;
log('reference vertices', NR);
// each new vertex: the 6 nearest old ones, weighted by distance
const K = 6, EPS2 = 0.01 * 0.01;
const rp = Float32Array.from(ref.pos);
let weights = new Array(NV);
for (let i = 0; i < NV; i++) {
  const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
  const bd = new Float64Array(K).fill(Infinity), bi = new Int32Array(K).fill(-1);
  for (let r = 0; r < NR; r++) {
    const dx = rp[r * 3] - x, dy = rp[r * 3 + 1] - y, dz = rp[r * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz;
    if (d >= bd[K - 1]) continue;
    let k = K - 1;
    while (k > 0 && bd[k - 1] > d) { bd[k] = bd[k - 1]; bi[k] = bi[k - 1]; k--; }
    bd[k] = d; bi[k] = r;
  }
  const w = {};
  for (let k = 0; k < K; k++) { const f = 1 / (bd[k] + EPS2); for (const j in ref.w[bi[k]]) w[j] = (w[j] || 0) + f * ref.w[bi[k]][j]; }
  weights[i] = w;
}
// smoothed over the mesh (seam vertices joined by position), then the four strongest
const vid = new Int32Array(NV); { const m = new Map(); for (let i = 0; i < NV; i++) { const k = `${pos[i * 3].toFixed(5)},${pos[i * 3 + 1].toFixed(5)},${pos[i * 3 + 2].toFixed(5)}`; if (!m.has(k)) m.set(k, i); vid[i] = m.get(k); } }
const adj = Array.from({ length: NV }, () => new Set());
for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = vid[idx[t + e]], b = vid[idx[t + (e + 1) % 3]]; adj[a].add(b); adj[b].add(a); }
const norm = (w) => { let s = 0; for (const j in w) s += w[j]; for (const j in w) w[j] /= s; return w; };
for (let i = 0; i < NV; i++) norm(weights[i]);
for (let it = 0; it < 3; it++) {
  const next = new Array(NV);
  for (let i = 0; i < NV; i++) {
    if (vid[i] !== i) continue;
    const w = {}; for (const j in weights[i]) w[j] = weights[i][j] * 0.5;
    const nb = adj[i]; if (nb.size) for (const b of nb) for (const j in weights[b]) w[j] = (w[j] || 0) + 0.5 * weights[b][j] / nb.size;
    next[i] = norm(w);
  }
  for (let i = 0; i < NV; i++) weights[i] = next[vid[i]];
}
const J0 = new Uint16Array(NV * 4), W0 = new Float32Array(NV * 4);
for (let i = 0; i < NV; i++) {
  const top = Object.entries(weights[i]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const s = top.reduce((a, [, w]) => a + w, 0);
  top.forEach(([j, w], k) => { J0[i * 4 + k] = +j; W0[i * 4 + k] = w / s; });
}

// unposed: the new mesh back into the rest pose through its own skinning, inverted
const skinNew = jointList.map((jn) => posed.get(jn).clone().multiply(restNew.get(jn).clone().invert()));
const rest = new Float32Array(NV * 3);
for (let i = 0; i < NV; i++) {
  const M = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  for (let k = 0; k < 4; k++) { const w = W0[i * 4 + k]; if (w > 0) M.elements.forEach((_, e) => { M.elements[e] += w * skinNew[J0[i * 4 + k]].elements[e]; }); }
  const v = new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(M.invert());
  rest[i * 3] = v.x; rest[i * 3 + 1] = v.y; rest[i * 3 + 2] = v.z;
}
// normals of the rest mesh (shared across seams)
const nrm = new Float32Array(NV * 3);
{
  const acc = new Float32Array(NV * 3), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    A.fromArray(rest, a * 3); B.fromArray(rest, b * 3); C.fromArray(rest, c * 3);
    const n = B.sub(A).cross(C.sub(A));
    for (const v of [a, b, c]) { const g = vid[v]; acc[g * 3] += n.x; acc[g * 3 + 1] += n.y; acc[g * 3 + 2] += n.z; }
  }
  for (let i = 0; i < NV; i++) { const g = vid[i], n = new THREE.Vector3().fromArray(acc, g * 3).normalize(); nrm[i * 3] = n.x; nrm[i * 3 + 1] = n.y; nrm[i * 3 + 2] = n.z; }
}

// ---------- 4. the output: the old document less the old body, plus the new one ----------
const KEEP = ['face_on_1', 'face_on_0', 'hair01_on', 'hathun', 'ash_extra', 'ash_logo'];
const castPath = path.join(OUT, 'cast.json');
const cast = JSON.parse(fs.readFileSync(castPath, 'utf8'));
const ashLook = cast.looks.ash;
const matOf = (mn) => mn.getMesh().listPrimitives()[0].getMaterial();
const mats = [];
for (const mn of meshNodes) {
  if (KEEP.includes(mn.getName())) {
    const m = matOf(mn), oldIx = +m.getName().slice(1);
    mats.push(ashLook.mats[oldIx]);
    m.setName('c' + (mats.length - 1));
  } else { mn.getMesh().dispose(); mn.dispose(); }
}
// bind matrices for the rest that moved
for (const sk of old.getRoot().listSkins()) {
  const ibm = new Float32Array(sk.listJoints().length * 16);
  sk.listJoints().forEach((j, i) => { restNew.get(j.getName()).clone().invert().toArray(ibm, i * 16); });
  sk.getInverseBindMatrices().setArray(ibm);
}
const buffer = old.getRoot().listBuffers()[0];
const acc = (type, arr) => old.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
const tex = old.createTexture('ash2').setImage(texPng).setMimeType('image/png');
const cel = (src) => ashLook.mats.find((m) => m.src === src).cel;
const newMat = (name, src, celSrc) => {
  mats.push({ src, cel: cel(celSrc), ds: false, alpha: 0, blend: false, decal: false, vc: false, eyes: false, shadow: true, ink: true });
  return old.createMaterial('c' + (mats.length - 1)).setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(1);
};
const ibm = new Float32Array(jointList.length * 16);
jointList.forEach((jn, i) => restNew.get(jn).clone().invert().toArray(ibm, i * 16));
const skin = old.createSkin('ash2').setInverseBindMatrices(acc('MAT4', ibm));
for (const jn of jointList) skin.addJoint(byName.get(jn));
const P = acc('VEC3', rest), N = acc('VEC3', nrm), U = acc('VEC2', uv), JA = acc('VEC4', J0), WA = acc('VEC4', W0);
const cloth = [], skinI = [];
for (let t = 0; t < idx.length; t += 3) ((skinV[idx[t]] + skinV[idx[t + 1]] + skinV[idx[t + 2]] >= 2) ? skinI : cloth).push(idx[t], idx[t + 1], idx[t + 2]);
const mesh = old.createMesh('ash2_body');
for (const [tris, name, celSrc] of [[cloth, 'ash2_body', 'topsjer'], [skinI, 'ash2_skin', 'face_on_1']]) {
  if (!tris.length) continue;
  mesh.addPrimitive(old.createPrimitive().setAttribute('POSITION', P).setAttribute('NORMAL', N).setAttribute('TEXCOORD_0', U)
    .setAttribute('JOINTS_0', JA).setAttribute('WEIGHTS_0', WA).setIndices(acc('SCALAR', Uint32Array.from(tris))).setMaterial(newMat(name, name, celSrc)));
}
calem.addChild(old.createNode('ash2_body').setMesh(mesh).setSkin(skin));
await old.transform(prune());
await io.write(path.join(OUT, 'ash2.glb'), old);
log('wrote ash2.glb:', cloth.length / 3, 'cloth and', skinI.length / 3, 'skin triangles; materials', mats.map((m) => m.src).join(', '));

// the look: the old one's numbers, strides scaled to the new legs, only the hair simulated
const sim = JSON.parse(JSON.stringify(ashLook.sim));
const hair = sim.chains.map((c, i) => [c, i]).filter(([c]) => c.bones.every((b) => HAIR_PREFIX.test(b)));
const first = hair.length ? hair[0][1] : 0;
sim.chains = hair.map(([c]) => c);
sim.links = sim.links.filter((l) => l[0] >= first && l[2] >= first).map((l) => [l[0] - first, l[1], l[2] - first, l[3], l[4]]);
sim.groups = sim.chains.length ? [[0, sim.chains.length, false]] : [];
const meta = JSON.parse(JSON.stringify(ashLook.meta));
for (const k in meta) if (meta[k].stride) meta[k].stride = +(meta[k].stride * legK).toFixed(4);
cast.looks.ash2 = { mats, meta, scale: ashLook.scale, y0: ashLook.y0, sim };
fs.writeFileSync(castPath, JSON.stringify(cast));
log('cast.json: looks.ash2 written (strides x', legK.toFixed(3) + ')');
