// Bakes Ash's V2 model for the game: native/cast/ash2.glb and the "ash2" look in
// native/cast/cast.json (the settings' "Ash's model" row picks it; cast.gd).
//
// The source is the generated model as a rigged, animated glTF (Tripo's "basic" rig:
// 52 Mixamo-named joints, ten clips with root motion, a 1M-triangle mesh with up to
// eight weights a vertex, the head bald and blank, no face). The bake keeps that
// skeleton and those clips and makes them the game's:
//   - the joints get the game's bone names (RENAME below: Hips -> Waist, Spine ->
//     Spine1 .. LeftArm -> LArmA, LeftHandIndex1 -> LFingerB1, LeftUpLeg -> LThigh ...),
//     a "Hips" bone goes in between the waist and the thighs (the old rig's legs-only
//     pivot: crouch, sitting, the limp bend it), so actor.gd, idles.gd, rider.gd,
//     meal.gd and cloth.gd work unchanged; the model is scaled so the Neck joint sits
//     at the old rig's height (the head, the camera and the talk all look there);
//   - the clips are named (CLIPS), their root motion taken out of the Waist track
//     (the game drives the phase by ground speed and keeps the bob), the forward
//     distance per cycle becoming the look's stride and the left footfall its lead;
//   - the mesh is decimated to --tris (meshoptimizer), kept to four weights, the
//     head cut off at the neck (hidden inside the old head), split into skin and
//     cloth by the texture's colour for the two cel profiles, the texture 1024;
//   - the old head rides along: ash.glb's face, eyes, hair, cap and logo meshes with
//     their jaw, lip and hair-chain bones grafted under the new Head, put where the
//     new neck ends; the face and eye textures are recoloured to the body's skin.
//
//   node tools/native/bake_ash2.mjs <dir with base_basic_pbr.glb> [--tris=20000] [--lift=0.012]
//   (the model's zip unpacked into web/world/local/ash2/, say: local/ stays on this
//   machine; npm install in tools/native first)
//
// bake_cast.mjs keeps the ash2 look when it rewrites cast.json.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { weld, simplify, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from '../../web/lib/three/three.module.min.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'native/cast');
const SRC = process.argv[2];
if (!SRC) { console.error('usage: bake_ash2.mjs <dir with base_basic_pbr.glb> [--tris=20000] [--lift=0.012]'); process.exit(1); }
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const TRIS = +arg('tris', 20000);
const LIFT = +arg('lift', 0.012);     // the old head this much higher on the new neck than the old Head joint had it
const GLB = SRC.endsWith('.glb') ? SRC : path.join(SRC, 'base_basic_pbr.glb');

// the rig's joints -> the game's bone names (actor.gd and friends)
const RENAME = { Hips: 'Waist', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Spine3', Neck: 'Neck', Head: 'Head' };
for (const [S, s] of [['Left', 'L'], ['Right', 'R']]) {
  Object.assign(RENAME, { [S + 'Shoulder']: s + 'Shoulder', [S + 'Arm']: s + 'ArmA', [S + 'ForeArm']: s + 'ForeArm', [S + 'Hand']: s + 'Hand',
    [S + 'UpLeg']: s + 'Thigh', [S + 'Leg']: s + 'Leg', [S + 'Foot']: s + 'Foot', [S + 'ToeBase']: s + 'Toe' });
  for (const [f, k] of [['Thumb', 'A'], ['Index', 'B'], ['Middle', 'C'], ['Ring', 'D'], ['Pinky', 'E']]) for (let i = 1; i <= 3; i++) RENAME[`${S}Hand${f}${i}`] = `${s}Finger${k}${i}`;
}
// the clips, by the start of their ids (the generator names them by uuid)
const CLIPS = { '09b96219': 'walk', '14d6899b': 'jump', '2f46551b': 'sprint', '70a0ed84': 'gesture', '892fb4ae': 'roll',
  'b5fe15d7': 'sneak', 'bdf52c4c': 'jog', 'eac8c0a8': 'sit', '15536454': 'fall', 'fb65f1fa': 'idle' };
// the gaits the game plays (actor.gd), one stride cycle each, named in the file by their
// slot: its walk, and the sprint as its run (the jog's own pace is a walking one; the game
// walks at 4.5 m/s, where the sprint plays near its own tempo); the rest keep their names
const GAME = { walk: 'walk', run: 'sprint' };
const GAITS = ['walk', 'jog', 'sprint', 'sneak'];   // cut to one cycle (two steps), from a left footfall
const KEEP = ['face_on_1', 'face_on_0', 'hair01_on', 'hathun', 'ash_extra', 'ash_logo'];   // the old head
const HEAD_GRAFT = ['FJlipL', 'FJteethL', 'FJlipU', 'FJteethU', 'LFJLipS', 'RFJLipS', 'loc_acchat', 'hrS0', 'hrS1', 'hrS2', 'hrS3', 'hrS4', 'hrS5', 'hrS6'];

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const io = new NodeIO();

// ---------- the old look: its head, numbers and sim ----------
const castPath = path.join(OUT, 'cast.json');
const cast = JSON.parse(fs.readFileSync(castPath, 'utf8'));
const ashLook = cast.looks.ash;
const old = await io.read(path.join(OUT, 'ash.glb'));
const oldBy = new Map(old.getRoot().listNodes().map((n) => [n.getName(), n]));
const oldCalemInv = new THREE.Matrix4().fromArray(oldBy.get('Calem').getWorldMatrix()).invert();
const oldWorld = (n) => new THREE.Matrix4().fromArray(n.getWorldMatrix()).premultiply(oldCalemInv);   // the old model's frame
const NECK_Y = new THREE.Vector3().setFromMatrixPosition(oldWorld(oldBy.get('Neck'))).y;
const oldHeadP = new THREE.Vector3().setFromMatrixPosition(oldWorld(oldBy.get('Head')));

// ---------- the rigged model ----------
log('reading', GLB);
const doc = await io.read(GLB);
const root = doc.getRoot();
const by = new Map(root.listNodes().map((n) => [n.getName(), n]));
const hips = by.get('Hips');
if (!hips) throw new Error('no Hips joint');
const world = (n) => new THREE.Matrix4().fromArray(n.getWorldMatrix());
const S = NECK_Y / new THREE.Vector3().setFromMatrixPosition(world(by.get('Neck'))).y;
log('scale', S.toFixed(4), '(neck to', NECK_Y.toFixed(4) + ')');
const joints = []; (function walk(n) { joints.push(n); n.listChildren().forEach(walk); })(hips);
for (const n of joints) n.setTranslation(n.getTranslation().map((x) => x * S));
const meshNode = root.listNodes().find((n) => n.getMesh());
const prim0 = meshNode.getMesh().listPrimitives()[0];
{ const P = prim0.getAttribute('POSITION'), a = Float32Array.from(P.getArray()); for (let i = 0; i < a.length; i++) a[i] *= S; P.setArray(a); }

// ---------- the clips: names, scale, root motion out, strides and leads ----------
const meta = { idle: { stride: 0, lead: 0 } };
const fkSampler = (anim) => {   // name -> {t, q[]} and the Waist's {t, p[]}
  const rot = new Map(); let pos = null;
  for (const ch of anim.listChannels()) {
    const n = ch.getTargetNode(), s = ch.getSampler(), t = s.getInput().getArray(), v = s.getOutput().getArray();
    if (ch.getTargetPath() === 'rotation') rot.set(n, { t, v });
    else if (ch.getTargetPath() === 'translation' && n === hips) pos = { t, v };
  }
  const at = (tr, time, k) => {   // linear sample of a k-vector track
    const { t, v } = tr; let i = 0; while (i + 1 < t.length && t[i + 1] < time) i++;
    const j = Math.min(i + 1, t.length - 1), f = j === i ? 0 : (time - t[i]) / (t[j] - t[i]);
    const o = new Array(k); for (let c = 0; c < k; c++) o[c] = v[i * k + c] * (1 - f) + v[j * k + c] * f; return o;
  };
  return (time) => {   // model-frame position of each joint at a time (the clip's pose, root motion in)
    const out = new Map();
    const walk = (n, parent) => {
      const r = rot.has(n) ? at(rot.get(n), time, 4) : n.getRotation();
      const q = new THREE.Quaternion(r[0], r[1], r[2], r[3]).normalize();
      const tt = n === hips && pos ? at(pos, time, 3) : n.getTranslation();
      const m = new THREE.Matrix4().compose(V3(tt), q, new THREE.Vector3(1, 1, 1)).premultiply(parent);
      out.set(n, new THREE.Vector3().setFromMatrixPosition(m));
      for (const c of n.listChildren()) walk(c, m);
    };
    walk(hips, new THREE.Matrix4());
    return out;
  };
};
const foot = { L: by.get('LeftFoot'), R: by.get('RightFoot') };
// the left foot's reach ahead of the hips through a clip: its peaks are the left footfalls
const footfalls = (anim) => {
  const sample = fkSampler(anim), T = anim.listSamplers()[0].getInput().getMax([])[0], N = 240, z = [];
  for (let i = 0; i <= N; i++) { const p = sample(T * i / N); z.push(p.get(foot.L).z - p.get(hips).z); }
  const mean = z.reduce((a, b) => a + b) / z.length, hi = mean + 0.4 * (Math.max(...z) - mean), out = [];
  for (let i = 0; i <= N; i++) {
    if (z[i] < hi || (i > 0 && z[i] < z[i - 1]) || (i < N && z[i] < z[i + 1])) continue;
    const t = T * i / N;
    if (out.length && t - out[out.length - 1].t < 0.2) { if (z[i] > out[out.length - 1].z) out[out.length - 1] = { t, z: z[i] }; } else out.push({ t, z: z[i] });
  }
  return { T, times: out.map((o) => o.t) };
};
// a clip cut to [t0, t0 + P]: every channel resampled on its own frames in that span
const trim = (anim, t0, P) => {
  for (const s of anim.listSamplers()) {
    const t = s.getInput().getArray(), v = s.getOutput().getArray(), k = v.length / t.length;
    const times = [t0, ...Array.from(t).filter((x) => x > t0 + 1e-6 && x < t0 + P - 1e-6), t0 + P];
    const at = (time) => { let i = 0; while (i + 1 < t.length && t[i + 1] < time) i++; const j = Math.min(i + 1, t.length - 1), f = j === i ? 0 : (time - t[i]) / (t[j] - t[i]); const o = []; for (let c = 0; c < k; c++) o.push(v[i * k + c] * (1 - f) + v[j * k + c] * f); return o; };
    const nt = Float32Array.from(times.map((x) => x - t0)), nv = new Float32Array(times.length * k);
    times.forEach((time, i) => { const o = at(time); if (k === 4) { const l = Math.hypot(...o) || 1; for (let c = 0; c < 4; c++) o[c] /= l; } nv.set(o, i * k); });
    s.setInput(acc('SCALAR', nt)); s.setOutput(acc(k === 4 ? 'VEC4' : 'VEC3', nv));
  }
};
const buffer = root.listBuffers()[0];
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
const restXZ = [hips.getTranslation()[0], hips.getTranslation()[2]];
for (const anim of root.listAnimations()) {
  const name = CLIPS[anim.getName().slice(0, 8)] || anim.getName();
  const slot = Object.keys(GAME).find((g) => GAME[g] === name);
  anim.setName(slot || name);
  for (const ch of [...anim.listChannels()]) {   // scaled; the other joints' translations are constant
    if (ch.getTargetPath() !== 'translation') continue;
    if (ch.getTargetNode() !== hips) { ch.dispose(); continue; }
    const acc0 = ch.getSampler().getOutput(), v = Float32Array.from(acc0.getArray());
    for (let i = 0; i < v.length; i++) v[i] *= S;
    acc0.setArray(v);
  }
  if (GAITS.includes(name)) {
    const { T, times } = footfalls(anim);
    if (times.length >= 2) {
      const P = (times[times.length - 1] - times[0]) / (times.length - 1);
      log(`clip ${name}: ${times.length} left footfalls in ${T.toFixed(2)}s, a cycle of ${P.toFixed(3)}s from ${times[0].toFixed(3)}s`);
      if (P < T - 1e-3) trim(anim, times[0], P);
    }
  }
  let stride = 0;
  for (const ch of anim.listChannels()) {
    if (ch.getTargetPath() !== 'translation') continue;
    const s = ch.getSampler(), acc0 = s.getOutput(), v = Float32Array.from(acc0.getArray()), t = s.getInput().getArray();
    // the forward and sideways progress out, the bob kept; the progress is the stride
    const n = v.length / 3, T = t[n - 1] - t[0];
    const dx = v[(n - 1) * 3] - v[0], dz = v[(n - 1) * 3 + 2] - v[2];
    stride = Math.hypot(dx, dz);
    for (let i = 0; i < n; i++) { const f = T > 0 ? (t[i] - t[0]) / T : 0; v[i * 3] -= dx * f; v[i * 3 + 2] -= dz * f; }
    if (GAITS.includes(name)) {   // a gait cut from mid-clip: back over the rest pose's hips
      let mx = 0, mz = 0; for (let i = 0; i < n; i++) { mx += v[i * 3]; mz += v[i * 3 + 2]; }
      for (let i = 0; i < n; i++) { v[i * 3] += restXZ[0] - mx / n; v[i * 3 + 2] += restXZ[1] - mz / n; }
    }
    acc0.setArray(v);
  }
  for (const ch of anim.listChannels()) if (ch.getTargetPath() === 'scale') ch.dispose();
  // the left footfall: when the left foot is furthest forward of the hips
  const sample = fkSampler(anim), T = anim.listSamplers()[0].getInput().getMax([])[0];
  let best = -Infinity, lead = 0;
  for (let i = 0; i < 120; i++) {
    const time = T * i / 120, p = sample(time), rel = p.get(foot.L).z - p.get(hips).z;
    if (rel > best) { best = rel; lead = i / 120; }
  }
  const sideways = Math.abs(foot.R && sample(T * ((lead + 0.5) % 1)).get(foot.R).z - sample(T * ((lead + 0.5) % 1)).get(hips).z);
  log(`clip ${name.padEnd(8)}${slot ? ` (the game's ${slot})` : ''} ${T.toFixed(2)}s  moves ${stride.toFixed(3)} / cycle  left footfall at ${lead.toFixed(3)}  (right foot then ${sideways.toFixed(2)} ahead)`);
  // (v: the ground speed, world units a second, at which the clip plays at its own tempo)
  if (slot) meta[slot] = { stride: +stride.toFixed(4), lead: +lead.toFixed(3), v: +(stride * ashLook.scale / T).toFixed(3) };
}
if (!meta.walk || !meta.run) throw new Error('the walk or run clip is missing (CLIPS / GAME)');

// ---------- the bones: the game's names, a Hips pivot for the legs ----------
for (const n of joints) if (RENAME[n.getName()]) n.setName(RENAME[n.getName()]);
const waist = hips;   // (renamed)
const hipsBone = doc.createNode('Hips');
for (const th of ['LThigh', 'RThigh']) { const n = by.get(th === 'LThigh' ? 'LeftUpLeg' : 'RightUpLeg'); waist.removeChild(n); hipsBone.addChild(n); }
waist.addChild(hipsBone);
const B = new Map(root.listNodes().map((n) => [n.getName(), n]));
const restOf = (name) => world(B.get(name));

// ---------- the mesh: decimated, four weights, the head off, skin and cloth apart ----------
await MeshoptSimplifier.ready;
// (without the normals first: the export splits vertices at every shading seam, and the
// simplifier will not collapse across them; smooth normals are made again at the end)
prim0.setAttribute('NORMAL', null);
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: TRIS / (prim0.getIndices().getCount() / 3), error: 1 }));
const prim = meshNode.getMesh().listPrimitives()[0];
let pos = Float32Array.from(prim.getAttribute('POSITION').getArray());
let uv = Float32Array.from(prim.getAttribute('TEXCOORD_0').getArray());
let idx = Uint32Array.from(prim.getIndices().getArray());
let NV = pos.length / 3;
log('decimated to', NV, 'vertices', idx.length / 3, 'triangles');
let J0 = new Uint16Array(NV * 4), W0 = new Float32Array(NV * 4);
{
  const sets = [0, 1].map((k) => [prim.getAttribute('JOINTS_' + k), prim.getAttribute('WEIGHTS_' + k)]).filter(([j]) => j);
  const j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0];
  for (let i = 0; i < NV; i++) {
    const all = [];
    for (const [J, W] of sets) { J.getElement(i, j4); W.getElement(i, w4); for (let k = 0; k < 4; k++) if (w4[k] > 0) all.push([j4[k], w4[k]]); }
    all.sort((a, b) => b[1] - a[1]);
    const top = all.slice(0, 4), s = top.reduce((a, [, w]) => a + w, 0) || 1;
    top.forEach(([j, w], k) => { J0[i * 4 + k] = j; W0[i * 4 + k] = w / s; });
  }
}
const skinJoints = meshNode.getSkin().listJoints();   // the body's JOINTS_0 index into these (52)
// the texture: skin or cloth under each vertex; the 1024 copy
const texImg = prim.getMaterial().getBaseColorTexture();
const texRaw = await sharp(Buffer.from(texImg.getImage())).raw().toBuffer({ resolveWithObject: true });
const texPng = await sharp(Buffer.from(texImg.getImage())).resize(1024, 1024).png({ compressionLevel: 9 }).toBuffer();
const rgbAt = (u, v) => {
  const { width: W, height: H, channels: C } = texRaw.info;
  const x = Math.min(W - 1, Math.max(0, Math.floor(u * W))), y = Math.min(H - 1, Math.max(0, Math.floor(v * H)));
  const o = (y * W + x) * C; return [texRaw.data[o], texRaw.data[o + 1], texRaw.data[o + 2]];
};
const isSkin = ([r, g, b]) => r > 150 && r - b > 60 && g - b > 15 && r - g > 20 && r - g < 110;
let skinV = new Uint8Array(NV);
const skinSum = [0, 0, 0]; let skinN = 0;
for (let i = 0; i < NV; i++) { const c = rgbAt(uv[i * 2], uv[i * 2 + 1]); if (isSkin(c)) { skinV[i] = 1; skinN++; for (let k = 0; k < 3; k++) skinSum[k] += c[k]; } }
const bodySkin = skinSum.map((x) => x / Math.max(1, skinN));
// where the old head goes: its centre over the new Head joint, as it sat over the old one, plus the lift
const newHeadP = new THREE.Vector3().setFromMatrixPosition(restOf('Head'));
const delta = newHeadP.clone().sub(oldHeadP).add(new THREE.Vector3(0, LIFT, 0));
const headCenterY = 1.191 + delta.y;   // (the old head's sphere: centre y 1.191, radius 0.0985)
const cutY = headCenterY - 0.065;
log('head joint', newHeadP.toArray().map((x) => x.toFixed(3)).join(','), 'delta', delta.toArray().map((x) => x.toFixed(3)).join(','), 'neck cut at', cutY.toFixed(3));
{
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const lo = Math.min(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1]), skin = skinV[a] + skinV[b] + skinV[c];
    if ((lo > cutY && skin >= 2) || lo > cutY + 0.05) continue;
    keep.push(a, b, c);
  }
  const map = new Int32Array(NV).fill(-1), np = [], nn = [], nu = [], ns = [], nj = [], nw = [];
  const out = new Uint32Array(keep.length);
  for (let i = 0; i < keep.length; i++) {
    const o = keep[i];
    if (map[o] < 0) {
      map[o] = np.length / 3;
      np.push(pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]); nu.push(uv[o * 2], uv[o * 2 + 1]); ns.push(skinV[o]);
      for (let k = 0; k < 4; k++) { nj.push(J0[o * 4 + k]); nw.push(W0[o * 4 + k]); }
    }
    out[i] = map[o];
  }
  pos = new Float32Array(np); uv = new Float32Array(nu); skinV = new Uint8Array(ns); J0 = new Uint16Array(nj); W0 = new Float32Array(nw); idx = out; NV = pos.length / 3;
  log('head cut:', NV, 'vertices', idx.length / 3, 'triangles left');
}
// smooth normals, shared across the seams (vertices joined by position)
const nrm = new Float32Array(NV * 3);
{
  const vid = new Int32Array(NV), m = new Map();
  for (let i = 0; i < NV; i++) { const k = `${pos[i * 3].toFixed(5)},${pos[i * 3 + 1].toFixed(5)},${pos[i * 3 + 2].toFixed(5)}`; if (!m.has(k)) m.set(k, i); vid[i] = m.get(k); }
  const acc3 = new Float32Array(NV * 3), A = new THREE.Vector3(), Bv = new THREE.Vector3(), C = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    A.fromArray(pos, a * 3); Bv.fromArray(pos, b * 3); C.fromArray(pos, c * 3);
    const n = Bv.sub(A).cross(C.sub(A));
    for (const v of [a, b, c]) { const g = vid[v]; acc3[g * 3] += n.x; acc3[g * 3 + 1] += n.y; acc3[g * 3 + 2] += n.z; }
  }
  for (let i = 0; i < NV; i++) { const n = new THREE.Vector3().fromArray(acc3, vid[i] * 3).normalize(); nrm[i * 3] = n.x; nrm[i * 3 + 1] = n.y; nrm[i * 3 + 2] = n.z; }
}

// ---------- the old head: its bones under the new Head, its meshes moved with it ----------
const graft = (oldName, newParent, shift) => {
  const o = oldBy.get(oldName), n = doc.createNode(oldName);
  const G = oldWorld(o).premultiply(new THREE.Matrix4().makeTranslation(shift.x, shift.y, shift.z));
  const L = world(newParent).invert().multiply(G), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  L.decompose(p, q, s);
  n.setTranslation(p.toArray()).setRotation(q.toArray()).setScale([1, 1, 1]);
  newParent.addChild(n);
  for (const c of o.listChildren()) graft(c.getName(), n, shift);
  return n;
};
for (const c of oldBy.get('Head').listChildren()) graft(c.getName(), B.get('Head'), delta);
// the ball in his hand (battle, idles): along the fingers, on the palm side
const ballNode = doc.createNode('pc_g_ball').setTranslation([0, 0.045, 0.04]);
B.get('RHand').addChild(ballNode);
const allJoints = [...skinJoints, hipsBone, ...HEAD_GRAFT.map((n) => root.listNodes().find((x) => x.getName() === n)), ballNode];
const jointIx = new Map(allJoints.map((n, i) => [n.getName(), i]));
const ibm = new Float32Array(allJoints.length * 16);
allJoints.forEach((n, i) => world(n).invert().toArray(ibm, i * 16));
const skin = doc.createSkin('ash2').setInverseBindMatrices(acc('MAT4', ibm));
for (const n of allJoints) skin.addJoint(n);

// the face and eye textures in the body's skin colour (the painted skin tone scaled to it)
const oldMats = [];
async function recolour(png, from, to) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const gain = to.map((v, k) => v / from[k]);
  for (let o = 0; o < data.length; o += 4) {
    const d = Math.hypot(data[o] - from[0], data[o + 1] - from[1], data[o + 2] - from[2]);
    const m = Math.max(0, Math.min(1, (90 - d) / 50));   // the skin tone fully, lines, mouth and eyes not
    if (m <= 0) continue;
    for (let k = 0; k < 3; k++) data[o + k] = Math.round(Math.min(255, data[o + k] * (1 - m) + data[o + k] * gain[k] * m));
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}
const faceSkin = [246, 210, 198];   // the old face texture's skin (measured)
log('skin: body', bodySkin.map((x) => x.toFixed(0)).join(','), 'face', faceSkin.join(','));
const mats = [];
const newMat = (name, src, celSrc, extra = {}) => {
  mats.push({ src, cel: ashLook.mats.find((m) => m.src === celSrc).cel, ds: false, alpha: 0, blend: false, decal: false, vc: false, eyes: false, shadow: true, ink: true, ...extra });
  return doc.createMaterial('c' + (mats.length - 1)).setMetallicFactor(0).setRoughnessFactor(1);
};
const modelRoot = doc.createNode('AshV2');
for (const name of KEEP) {
  const on = oldBy.get(name), op = on.getMesh().listPrimitives()[0], om = op.getMaterial();
  const entry = ashLook.mats[+om.getName().slice(1)];
  mats.push(entry);
  const m = doc.createMaterial('c' + (mats.length - 1)).setMetallicFactor(0).setRoughnessFactor(1).setDoubleSided(om.getDoubleSided()).setAlphaMode(om.getAlphaMode()).setAlphaCutoff(om.getAlphaCutoff());
  const ot = om.getBaseColorTexture();
  if (ot) {
    let png = Buffer.from(ot.getImage());
    if (name === 'face_on_1' || name === 'face_on_0') png = await recolour(png, faceSkin, bodySkin);
    m.setBaseColorTexture(doc.createTexture(name).setImage(png).setMimeType('image/png'));
  } else m.setBaseColorFactor(om.getBaseColorFactor());
  const P = Float32Array.from(op.getAttribute('POSITION').getArray());
  for (let i = 0; i < P.length; i += 3) { P[i] += delta.x; P[i + 1] += delta.y; P[i + 2] += delta.z; }
  const oj = on.getSkin().listJoints().map((j) => jointIx.get(j.getName()));
  const J = Uint16Array.from(op.getAttribute('JOINTS_0').getArray(), (j) => oj[j] ?? 0);
  const np = doc.createPrimitive().setAttribute('POSITION', acc('VEC3', P)).setAttribute('NORMAL', acc('VEC3', Float32Array.from(op.getAttribute('NORMAL').getArray())))
    .setAttribute('TEXCOORD_0', acc('VEC2', Float32Array.from(op.getAttribute('TEXCOORD_0').getArray()))).setAttribute('JOINTS_0', acc('VEC4', J))
    .setAttribute('WEIGHTS_0', acc('VEC4', Float32Array.from(op.getAttribute('WEIGHTS_0').getArray()))).setIndices(acc('SCALAR', Uint32Array.from(op.getIndices().getArray()))).setMaterial(m);
  const nn = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(np)).setSkin(skin);
  if (on.getExtras() && Object.keys(on.getExtras()).length) nn.setExtras(on.getExtras());
  modelRoot.addChild(nn);
}
// the body: cloth and skin surfaces
const tex = doc.createTexture('ash2').setImage(texPng).setMimeType('image/png');
const P = acc('VEC3', pos), N = acc('VEC3', nrm), U = acc('VEC2', uv), JA = acc('VEC4', J0), WA = acc('VEC4', W0);
const cloth = [], skinI = [];
for (let t = 0; t < idx.length; t += 3) ((skinV[idx[t]] + skinV[idx[t + 1]] + skinV[idx[t + 2]] >= 2) ? skinI : cloth).push(idx[t], idx[t + 1], idx[t + 2]);
const bodyMesh = doc.createMesh('ash2_body');
for (const [tris, name, celSrc] of [[cloth, 'ash2_body', 'topsjer'], [skinI, 'ash2_skin', 'face_on_1']]) {
  if (!tris.length) continue;
  bodyMesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION', P).setAttribute('NORMAL', N).setAttribute('TEXCOORD_0', U)
    .setAttribute('JOINTS_0', JA).setAttribute('WEIGHTS_0', WA).setIndices(acc('SCALAR', Uint32Array.from(tris))).setMaterial(newMat(name, name, celSrc).setBaseColorTexture(tex)));
}
modelRoot.addChild(doc.createNode('ash2_body').setMesh(bodyMesh).setSkin(skin));

// ---------- the scene: holder (the look's scale and y0) -> model -> skeleton and meshes ----------
meshNode.getMesh().dispose(); meshNode.dispose();
for (const n of root.listNodes()) if (n.getName() === 'Armature') n.dispose();
const scene = root.listScenes()[0];
for (const c of [...scene.listChildren()]) scene.removeChild(c);
modelRoot.addChild(waist);
const holder = doc.createNode('holder').setScale([ashLook.scale, ashLook.scale, ashLook.scale]).setTranslation([0, ashLook.y0, 0]);
holder.addChild(modelRoot);
scene.addChild(holder);
for (const sk of root.listSkins()) if (sk !== skin) sk.dispose();
await doc.transform(prune());
await io.write(path.join(OUT, 'ash2.glb'), doc);
log('wrote ash2.glb:', cloth.length / 3, 'cloth and', skinI.length / 3, 'skin triangles,', allJoints.length, 'bones, clips', root.listAnimations().map((a) => a.getName()).join(' '));

// ---------- the look ----------
const sim = JSON.parse(JSON.stringify(ashLook.sim));
const hair = sim.chains.map((c, i) => [c, i]).filter(([c]) => c.bones.every((b) => /^hr/.test(b)));
const first = hair.length ? hair[0][1] : 0;
sim.chains = hair.map(([c]) => ({ ...c, rest: c.rest.map((p) => [p[0] + delta.x, p[1] + delta.y, p[2] + delta.z].map((x) => +x.toFixed(5))) }));
sim.links = sim.links.filter((l) => l[0] >= first && l[2] >= first).map((l) => [l[0] - first, l[1], l[2] - first, l[3], l[4]]);
sim.groups = sim.chains.length ? [[0, sim.chains.length, false]] : [];
for (const c of sim.caps) if (c.bone === 'Head' || c.bone === 'Neck') for (const k of ['a', 'b']) c[k] = [c[k][0] + delta.x, c[k][1] + delta.y, c[k][2] + delta.z].map((x) => +x.toFixed(5));
cast.looks.ash2 = { mats, meta, scale: ashLook.scale, y0: ashLook.y0, sim };
fs.writeFileSync(castPath, JSON.stringify(cast));
log('cast.json: looks.ash2 written; meta', JSON.stringify(meta));
