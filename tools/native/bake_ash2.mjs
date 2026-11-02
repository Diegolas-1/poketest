// Bakes Ash's V2 model for the game: native/cast/ash2.glb and the "ash2" look in
// native/cast/cast.json (the settings' "Ash's model" row picks it; cast.gd).
//
// The source is the generated model as a rigged, animated glTF (Tripo's "basic" rig:
// 52 Mixamo-named joints, ten clips with root motion, a 1M-triangle mesh with up to
// eight weights a vertex, the head bald and blank, no face). The bake keeps that
// skeleton, that head and those clips and makes them the game's:
//   - the joints get the game's bone names (RENAME below: Hips -> Waist, Spine ->
//     Spine1 .. LeftArm -> LArmA, LeftHandIndex1 -> LFingerB1, LeftUpLeg -> LThigh ...),
//     a "Hips" bone goes in between the waist and the thighs (the old rig's legs-only
//     pivot: crouch, sitting, the limp bend it), so actor.gd, idles.gd, rider.gd,
//     meal.gd and cloth.gd work unchanged; the model is scaled so the Neck joint sits
//     at the old rig's height (the camera and the talk look there);
//   - the clips are named (CLIPS), their root motion taken out of the Waist track
//     (the game drives the phase by ground speed and keeps the bob), the forward
//     distance per cycle becoming the look's stride and the left footfall its lead;
//     clips of several strides are cut to one cycle; each gait's own pace (meta v)
//     lets actor.gd play it near its own tempo;
//   - the mesh is decimated to --tris (meshoptimizer), kept to four weights, split into
//     skin and cloth by the texture's colour for the two cel profiles, the texture 1024;
//   - the face: the model's own head stays (its skin lit and shadowed like the body);
//     the old look's face and eye textures are drawn from the front through their
//     meshes into an atlas (eyes open | eyes shut, for the blink's uv_off), the painted
//     flesh made transparent so only the features remain, and laid over the head's
//     front as a cutout decal (projected from the front, lifted off the surface);
//   - the old hair, cap, hair spikes and cap logo ride along, scaled to the new head
//     with their hair-chain and cap bones grafted under its Head.
//
//   node tools/native/bake_ash2.mjs <dir with base_basic_pbr.glb> [--tris=20000]
//   (the model's zip unpacked into web/world/local/ash2/, say: local/ stays on this
//   machine; npm install in tools/native first)
//
// bake_cast.mjs keeps the ash2 look when it rewrites cast.json.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from '../../web/lib/three/three.module.min.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'native/cast');
const SRC = process.argv[2];
if (!SRC) { console.error('usage: bake_ash2.mjs <dir with base_basic_pbr.glb> [--tris=20000]'); process.exit(1); }
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const TRIS = +arg('tris', 20000);
const HEAD_SCALE = +arg('head', 0.93);   // the model's head shrunk about its centre (the hair, cap and face follow)
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
// slot: its walk, the jog as its run and the sprint as its sprint (each at its own pace:
// actor.gd crosses between them by the speed); the rest keep their names (the sneak is
// the crouch, the jump and the roll the jump's, sit, gesture and fall are idle acts)
const GAME = { walk: 'walk', run: 'jog', sprint: 'sprint' };
const GAITS = ['walk', 'jog', 'sprint', 'sneak'];   // cut to one cycle (two steps), from a left footfall
const KEEP = ['hair01_on', 'hathun', 'ash_extra', 'ash_logo'];   // the old hair, cap, spikes and logo
const FACE = ['face_on_1', 'face_on_0'];                          // the old face and its eye patch: drawn into the decal
const HEAD_GRAFT = ['loc_acchat', 'hrS0', 'hrS1', 'hrS2', 'hrS3', 'hrS4', 'hrS5', 'hrS6'];
const ATLAS = [2048, 1024];   // the projected fallback atlas: eyes open | eyes shut
const LIFT = 0.004;           // the decal this far off the head (model units)
// the face drawn for this head (tools/native/ash2_face.py): the eyes' atlas, eight cells
// four by two, each the head's front two radii wide in the projection's frame (the game
// shows the first, its blink the third, half a texture to the right), and the mouth's,
// one cell. Where they sit and how big is the look's "face" placement (cast.json, the
// tunables over it; dev/face_tool.gd), applied in the shader, so no rebake moves them.
const FACE_DIR = path.join(ROOT, 'tools/native/ash2_face');
const EYES_PNG = arg('eyes', path.join(FACE_DIR, 'atlas.png')), MOUTH_PNG = arg('mouth', path.join(FACE_DIR, 'mouth.png'));
const FACE_PLACE = { eyes: { x: 0, y: 0, scale: 1 }, mouth: { x: 0, y: -0.17, scale: 1 } };

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
const oldPrim = (name) => oldBy.get(name).getMesh().listPrimitives()[0];
// a sphere through points (iterated least squares): the old head's from its face and hair
function sphereFit(pts) {
  const c = new THREE.Vector3(); for (const p of pts) c.add(p); c.divideScalar(pts.length);
  let r = 0;
  for (let it = 0; it < 40; it++) {
    const g = new THREE.Vector3(); r = 0;
    for (const p of pts) r += p.distanceTo(c); r /= pts.length;
    for (const p of pts) { const d = p.clone().sub(c); const l = d.length() || 1; g.add(d.multiplyScalar((l - r) / l)); }
    c.add(g.divideScalar(pts.length));
  }
  return { c, r };
}
const oldHead = sphereFit(['face_on_1', 'hair01_on'].flatMap((n) => { const P = oldPrim(n).getAttribute('POSITION').getArray(); const o = []; for (let i = 0; i < P.length; i += 3) o.push(new THREE.Vector3(P[i], P[i + 1], P[i + 2])); return o; }));
log('old head: centre', oldHead.c.toArray().map((x) => x.toFixed(4)).join(','), 'radius', oldHead.r.toFixed(4));

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
const buffer = root.listBuffers()[0];
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);

// ---------- the clips: names, scale, one cycle, root motion out, strides and leads ----------
const meta = { idle: { stride: 0, lead: 0 } };
const fkSampler = (anim) => {   // model-frame joint positions at a time (the clip's pose, root motion in)
  const rot = new Map(); let pos = null;
  for (const ch of anim.listChannels()) {
    const n = ch.getTargetNode(), s = ch.getSampler(), t = s.getInput().getArray(), v = s.getOutput().getArray();
    if (ch.getTargetPath() === 'rotation') rot.set(n, { t, v });
    else if (ch.getTargetPath() === 'translation' && n === hips) pos = { t, v };
  }
  const at = (tr, time, k) => {
    const { t, v } = tr; let i = 0; while (i + 1 < t.length && t[i + 1] < time) i++;
    const j = Math.min(i + 1, t.length - 1), f = j === i ? 0 : (time - t[i]) / (t[j] - t[i]);
    const o = new Array(k); for (let c = 0; c < k; c++) o[c] = v[i * k + c] * (1 - f) + v[j * k + c] * f; return o;
  };
  return (time) => {
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
const toe = { L: by.get('LeftToeBase'), R: by.get('RightToeBase') };
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
  log(`clip ${name.padEnd(8)}${slot ? ` (the game's ${slot})` : ''} ${T.toFixed(2)}s  moves ${stride.toFixed(3)} / cycle  left footfall at ${lead.toFixed(3)}`);
  // (v: the ground speed, world units a second, at which the clip plays at its own tempo)
  const entry = { stride: +stride.toFixed(4), lead: +lead.toFixed(3), v: +(stride * ashLook.scale / T).toFixed(3) };
  // the game's marks in the clip (actor.gd): the sneak's stance frame (both feet down; a
  // fraction of the clip), the jump's take-off, apex, first touch and landing crouch, the
  // roll's dive (seconds); feet heights over the rest pose's soles
  const restP = fkSampler({ listChannels: () => [] })(0);
  const ground = Math.min(...['L', 'R'].flatMap((s) => [restP.get(foot[s]).y, restP.get(toe[s]).y]));
  const fh = (p, s) => Math.min(p.get(foot[s]).y, p.get(toe[s]).y) - ground;
  const N = 200, F = [];
  for (let i = 0; i <= N; i++) { const p = sample(T * i / N); F.push({ t: T * i / N, l: fh(p, 'L'), r: fh(p, 'R'), h: p.get(hips).y }); }
  if (name === 'sneak') entry.still = +(F.reduce((b, f, i) => (f.l + f.r < F[b].l + F[b].r ? i : b), 0) / N).toFixed(3);
  if (name === 'jump') {
    const iOff = Math.max(0, F.findIndex((f) => Math.min(f.l, f.r) > 0.02 * S));
    const iApex = F.reduce((b, f, i) => (f.h > F[b].h ? i : b), 0);
    const iLand = F.findIndex((f, i) => i > iApex && Math.min(f.l, f.r) < 0.012 * S);
    Object.assign(entry, { off: +F[iOff].t.toFixed(3), apex: +F[iApex].t.toFixed(3), land: +F[iLand < 0 ? iApex : iLand].t.toFixed(3) });
    entry.crouch = +Math.min(T, entry.land + 0.08).toFixed(3);
    log(`clip jump: off the ground at ${entry.off}s, apex ${entry.apex}s, down at ${entry.land}s`);
  }
  if (name === 'roll') {
    const i = F.findIndex((f) => f.h < F[0].h - 0.03 * S);
    entry.dive = +Math.max(0, (i < 0 ? 0 : F[i].t) - 0.04).toFixed(3);
    log(`clip roll: the dive from ${entry.dive}s`);
  }
  meta[slot || name] = entry;
}
if (!meta.walk || !meta.run || !meta.sprint) throw new Error('the walk, jog or sprint clip is missing (CLIPS / GAME)');

// ---------- the bones: the game's names, a Hips pivot for the legs ----------
for (const n of joints) if (RENAME[n.getName()]) n.setName(RENAME[n.getName()]);
const waist = hips;   // (renamed)
const hipsBone = doc.createNode('Hips');
for (const th of ['LeftUpLeg', 'RightUpLeg']) { const n = by.get(th); waist.removeChild(n); hipsBone.addChild(n); }
waist.addChild(hipsBone);
const B = new Map(root.listNodes().map((n) => [n.getName(), n]));
const restOf = (name) => world(B.get(name));

// ---------- the mesh: decimated, four weights, skin and cloth apart ----------
await MeshoptSimplifier.ready;
// (without the normals first: the export splits vertices at every shading seam, and the
// simplifier will not collapse across them; smooth normals are made again below)
prim0.setAttribute('NORMAL', null);
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: TRIS / (prim0.getIndices().getCount() / 3), error: 1 }));
const prim = meshNode.getMesh().listPrimitives()[0];
const pos = Float32Array.from(prim.getAttribute('POSITION').getArray());
const uv = Float32Array.from(prim.getAttribute('TEXCOORD_0').getArray());
const idx = Uint32Array.from(prim.getIndices().getArray());
const NV = pos.length / 3;
log('decimated to', NV, 'vertices', idx.length / 3, 'triangles');
const J0 = new Uint16Array(NV * 4), W0 = new Float32Array(NV * 4);
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
const skinV = new Uint8Array(NV);
for (let i = 0; i < NV; i++) if (isSkin(rgbAt(uv[i * 2], uv[i * 2 + 1]))) skinV[i] = 1;

// ---------- the head: the model's own, measured; the old hair and cap scaled to it ----------
const neckY = new THREE.Vector3().setFromMatrixPosition(restOf('Neck')).y;
const headOf = () => { const pts = []; for (let i = 0; i < NV; i++) if (skinV[i] && pos[i * 3 + 1] > neckY + 0.085) pts.push(new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])); return sphereFit(pts); };
if (HEAD_SCALE !== 1) {   // the head drawn toward its centre, easing in up the neck
  const c0 = headOf().c;
  for (let i = 0; i < NV; i++) {
    if (!skinV[i]) continue;
    const y = pos[i * 3 + 1], t = Math.max(0, Math.min(1, (y - (neckY + 0.015)) / 0.06)), w = t * t * (3 - 2 * t);
    const k = 1 - w * (1 - HEAD_SCALE);
    pos[i * 3] = c0.x + (pos[i * 3] - c0.x) * k; pos[i * 3 + 1] = c0.y + (y - c0.y) * k; pos[i * 3 + 2] = c0.z + (pos[i * 3 + 2] - c0.z) * k;
  }
  log('head scaled', HEAD_SCALE, 'about', c0.toArray().map((x) => x.toFixed(3)).join(','));
}
const head = headOf();
const kHead = head.r / oldHead.r;
// the old head's things onto the new one: scaled about its centre, moved to the new centre
const onHead = (p) => p.clone().sub(oldHead.c).multiplyScalar(kHead).add(head.c);
log('new head: centre', head.c.toArray().map((x) => x.toFixed(4)).join(','), 'radius', head.r.toFixed(4), 'x', kHead.toFixed(3), 'over the old');

// the old hair-chain and cap bones under the new Head, where the hair and cap now are
const graft = (oldName, newParent) => {
  const o = oldBy.get(oldName), n = doc.createNode(oldName);
  const G = oldWorld(o), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  G.decompose(p, q, s);
  const Gn = new THREE.Matrix4().compose(onHead(p), q, new THREE.Vector3(1, 1, 1));
  const L = world(newParent).invert().multiply(Gn);
  L.decompose(p, q, s);
  n.setTranslation(p.toArray()).setRotation(q.toArray()).setScale([1, 1, 1]);
  newParent.addChild(n);
  for (const c of o.listChildren()) graft(c.getName(), n);
  return n;
};
for (const name of HEAD_GRAFT) graft(name, B.get('Head'));
// the ball in his hand (battle, idles): along the fingers, on the palm side
const ballNode = doc.createNode('pc_g_ball').setTranslation([0, 0.045, 0.04]);
B.get('RHand').addChild(ballNode);
const allJoints = [...skinJoints, hipsBone, ...HEAD_GRAFT.map((n) => root.listNodes().find((x) => x.getName() === n)), ballNode];
const jointIx = new Map(allJoints.map((n, i) => [n.getName(), i]));
const ibm = new Float32Array(allJoints.length * 16);
allJoints.forEach((n, i) => world(n).invert().toArray(ibm, i * 16));
const skin = doc.createSkin('ash2').setInverseBindMatrices(acc('MAT4', ibm));
for (const n of allJoints) skin.addJoint(n);

// ---------- the face decal: the old face drawn from the front, its flesh made clear ----------
// the old face and eye meshes are rasterised orthographically from the front into an atlas
// (left: eyes open, right: shut, which the game shows with uv_off 0.5), in head radii; then
// each source's painted flesh colour (its median) becomes transparent, so only the features
// stay; the atlas goes on the new head's front with the same frontal projection
async function faceAtlas() {
  const [W, H] = ATLAS, half = W / 2;
  const rgb = new Float32Array(W * H * 3), alpha = new Float32Array(W * H), depth = new Float32Array(W * H).fill(-Infinity), srcOf = new Int8Array(W * H).fill(-1);
  const sources = [];
  for (const name of FACE) {
    const op = oldPrim(name), om = op.getMaterial(), img = await sharp(Buffer.from(om.getBaseColorTexture().getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    sources.push({ name, P: op.getAttribute('POSITION').getArray(), UV: op.getAttribute('TEXCOORD_0').getArray(), I: op.getIndices().getArray(), img, eyes: name === 'face_on_0' });
  }
  const sampleTex = (img, u, v) => {   // bilinear, wrapping
    const { width: w, height: h } = img.info, data = img.data;
    const x = ((u % 1) + 1) % 1 * w - 0.5, y = ((v % 1) + 1) % 1 * h - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, out = [0, 0, 0, 0];
    for (const [dx, dy, wgt] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const o = ((((y0 + dy) % h) + h) % h * w + (((x0 + dx) % w) + w) % w) * 4;
      for (let c = 0; c < 4; c++) out[c] += data[o + c] * wgt;
    }
    return out;
  };
  for (let state = 0; state < 2; state++) {
    const xoff = state * half;
    sources.forEach((s, si) => {
      const { P, UV, I, img, eyes } = s;
      const px = (i) => xoff + (0.5 + (P[i * 3] - oldHead.c.x) / oldHead.r / 2) * half;
      const py = (i) => (0.5 - (P[i * 3 + 1] - oldHead.c.y) / oldHead.r / 2) * H;
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t], b = I[t + 1], c = I[t + 2];
        const ax = px(a), ay = py(a), bx = px(b), by = py(b), cx = px(c), cy = py(c);
        const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        if (Math.abs(area) < 1e-9) continue;
        const x0 = Math.max(xoff, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(xoff + half - 1, Math.ceil(Math.max(ax, bx, cx)));
        const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const qx = x + 0.5, qy = y + 0.5;
          let w0 = ((bx - qx) * (cy - qy) - (cx - qx) * (by - qy)) / area, w1 = ((cx - qx) * (ay - qy) - (ax - qx) * (cy - qy)) / area, w2 = 1 - w0 - w1;
          if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
          const z = w0 * P[a * 3 + 2] + w1 * P[b * 3 + 2] + w2 * P[c * 3 + 2], o = y * W + x;
          if (z <= depth[o]) continue;
          const u = w0 * UV[a * 2] + w1 * UV[b * 2] + w2 * UV[c * 2] + (eyes && state ? 0.5 : 0), v = w0 * UV[a * 2 + 1] + w1 * UV[b * 2 + 1] + w2 * UV[c * 2 + 1];
          const [r, g, bb, al] = sampleTex(img, u, v);
          depth[o] = z; srcOf[o] = si; rgb[o * 3] = r; rgb[o * 3 + 1] = g; rgb[o * 3 + 2] = bb; alpha[o] = al / 255;
        }
      }
    });
  }
  // each source's flesh: the median colour of what it drew
  const flesh = sources.map((_, si) => {
    const ch = [[], [], []];
    for (let o = 0; o < W * H; o++) if (srcOf[o] === si) for (let c = 0; c < 3; c++) ch[c].push(rgb[o * 3 + c]);
    return ch.map((a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; });
  });
  log('face flesh:', sources.map((s, i) => `${s.name} ${flesh[i].map((x) => x.toFixed(0)).join(',')}`).join('  '));
  // what stays: dark lines and pupils, and anything off the flesh's own hue (the whites of
  // the eyes, the mouth, the cheek marks). The painted flesh and all its shading lie along
  // one line through black in colour space, so a pixel's distance from that line, not from
  // one flesh colour, tells the two apart.
  // Thin lines painted in a darker flesh (the mouth, the nose) lie on that line too: they
  // show by local contrast, darker along it than their blurred surroundings, where the
  // broad shading is not.
  const sm = (lo, hi, x) => Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  const tt = new Float32Array(W * H), offs = new Float32Array(W * H);
  for (let o = 0; o < W * H; o++) {
    const si = srcOf[o]; if (si < 0) continue;
    const r = rgb[o * 3], g = rgb[o * 3 + 1], bb = rgb[o * 3 + 2], f = flesh[si];
    tt[o] = (r * f[0] + g * f[1] + bb * f[2]) / (f[0] * f[0] + f[1] * f[1] + f[2] * f[2]);
    offs[o] = Math.hypot(r - tt[o] * f[0], g - tt[o] * f[1], bb - tt[o] * f[2]);
  }
  // the surroundings' brightness along the flesh line: a box blur over the pixels of the
  // same source (the face and the eye patch are painted in different flesh: across their
  // seam there is no contrast to find)
  const R = Math.round(H / 80), blur = (src, si) => {
    const tmp = new Float32Array(W * H), cnt = new Float32Array(W * H), out2 = new Float32Array(W * H);
    for (let y = 0; y < H; y++) { let s = 0, n = 0; for (let x = -R; x < W; x++) { const i = x + R; if (i < W && srcOf[y * W + i] === si) { s += src[y * W + i]; n++; } const j = x - R - 1; if (j >= 0 && srcOf[y * W + j] === si) { s -= src[y * W + j]; n--; } if (x >= 0) { tmp[y * W + x] = s; cnt[y * W + x] = n; } } }
    for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let y = -R; y < H; y++) { const i = y + R; if (i < H) { s += tmp[i * W + x]; n += cnt[i * W + x]; } const j = y - R - 1; if (j >= 0) { s -= tmp[j * W + x]; n -= cnt[j * W + x]; } if (y >= 0) out2[y * W + x] = n > 0 ? s / n : 0; } }
    return out2;
  };
  const blurs = sources.map((_, si) => blur(tt, si));
  const tBlur = new Float32Array(W * H);
  for (let o = 0; o < W * H; o++) if (srcOf[o] >= 0) tBlur[o] = blurs[srcOf[o]][o];
  const out = Buffer.alloc(W * H * 4);
  for (let o = 0; o < W * H; o++) {
    const si = srcOf[o]; if (si < 0) continue;
    const r = rgb[o * 3], g = rgb[o * 3 + 1], bb = rgb[o * 3 + 2], lum = 0.3 * r + 0.59 * g + 0.11 * bb;
    const a = Math.max(sm(150, 120, lum), sm(16, 30, offs[o]), sm(0.045, 0.09, tBlur[o] - tt[o])) * alpha[o];
    out[o * 4] = r; out[o * 4 + 1] = g; out[o * 4 + 2] = bb; out[o * 4 + 3] = Math.round(a * 255);
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}
// the old face's projection: the compositor cuts the mouth out of it (and it stands in
// for the eyes' atlas while there is none)
const oldFacePng = await faceAtlas();
fs.mkdirSync(FACE_DIR, { recursive: true });
fs.writeFileSync(path.join(FACE_DIR, 'old_face.png'), oldFacePng);
const decals = [];
if (fs.existsSync(EYES_PNG)) { const m = await sharp(EYES_PNG).metadata(); decals.push({ key: 'eyes', name: 'ash2_face', png: fs.readFileSync(EYES_PNG), grid: [4, Math.round(m.height / (m.width / 4))], eyes: true }); }
else { log('face: no', path.relative(ROOT, EYES_PNG), '(run tools/native/ash2_face.py): the old face projected instead'); decals.push({ key: 'eyes', name: 'ash2_face', png: oldFacePng, grid: [2, 1], eyes: true }); }
if (fs.existsSync(MOUTH_PNG)) decals.push({ key: 'mouth', name: 'ash2_mouth', png: fs.readFileSync(MOUTH_PNG), grid: [1, 1], eyes: false });
else log('face: no', path.relative(ROOT, MOUTH_PNG), '(run tools/native/ash2_face.py): no mouth decal');

// ---------- the materials and meshes ----------
const mats = [];
const celOf = (src) => ashLook.mats.find((m) => m.src === src).cel;
const newMat = (name, src, celSrc, extra = {}) => {
  mats.push({ src, cel: celOf(celSrc), ds: false, alpha: 0, blend: false, decal: false, vc: false, eyes: false, shadow: true, ink: true, ...extra });
  return doc.createMaterial('c' + (mats.length - 1)).setMetallicFactor(0).setRoughnessFactor(1);
};
const modelRoot = doc.createNode('AshV2');
for (const name of KEEP) {
  const on = oldBy.get(name), op = on.getMesh().listPrimitives()[0], om = op.getMaterial();
  mats.push(ashLook.mats[+om.getName().slice(1)]);
  const m = doc.createMaterial('c' + (mats.length - 1)).setMetallicFactor(0).setRoughnessFactor(1).setDoubleSided(om.getDoubleSided()).setAlphaMode(om.getAlphaMode()).setAlphaCutoff(om.getAlphaCutoff());
  const ot = om.getBaseColorTexture();
  if (ot) m.setBaseColorTexture(doc.createTexture(name).setImage(Buffer.from(ot.getImage())).setMimeType('image/png'));
  else m.setBaseColorFactor(om.getBaseColorFactor());
  const P = Float32Array.from(op.getAttribute('POSITION').getArray()), p = new THREE.Vector3();
  for (let i = 0; i < P.length; i += 3) { p.set(P[i], P[i + 1], P[i + 2]); onHead(p).toArray(P, i); }
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
// the face decals: the head's front triangles again, with the frontal projection's UVs
// into the atlas's first cell (the atlases are authored in head radii about the sphere's centre)
for (const dc of decals) {
  const fr = head.r, fcy = head.c.y, [gx, gy] = dc.grid;
  const fu = (i) => (pos[i * 3] - head.c.x) / fr, fv = (i) => (pos[i * 3 + 1] - fcy) / fr;
  const front = (i) => skinV[i] && pos[i * 3 + 1] > head.c.y - 1.1 * head.r && pos[i * 3 + 2] > head.c.z - 0.15 * head.r && Math.abs(fu(i)) <= 1.02 && Math.abs(fv(i)) <= 1.02;
  const map = new Map(), fp = [], fn = [], fuv = [], fj = [], fw = [], fi = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (!(front(a) && front(b) && front(c))) continue;
    for (const o of [a, b, c]) {
      if (!map.has(o)) {
        map.set(o, fp.length / 3);
        fp.push(pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]); fn.push(nrm[o * 3], nrm[o * 3 + 1], nrm[o * 3 + 2]);
        fuv.push((0.5 + fu(o) / 2) / gx, (0.5 - fv(o) / 2) / gy);
        for (let k = 0; k < 4; k++) { fj.push(J0[o * 4 + k]); fw.push(W0[o * 4 + k]); }
      }
      fi.push(map.get(o));
    }
  }
  const fm = newMat(dc.name, dc.name, 'face_on_1', { alpha: 0.5, decal: true, eyes: dc.eyes, shadow: false, ink: false, lift: LIFT, face: dc.key, grid: dc.grid })
    .setBaseColorTexture(doc.createTexture(dc.name).setImage(dc.png).setMimeType('image/png')).setAlphaMode('MASK').setAlphaCutoff(0.5);
  const fprim = doc.createPrimitive().setAttribute('POSITION', acc('VEC3', Float32Array.from(fp))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(fn)))
    .setAttribute('TEXCOORD_0', acc('VEC2', Float32Array.from(fuv))).setAttribute('JOINTS_0', acc('VEC4', Uint16Array.from(fj))).setAttribute('WEIGHTS_0', acc('VEC4', Float32Array.from(fw)))
    .setIndices(acc('SCALAR', Uint32Array.from(fi))).setMaterial(fm);
  modelRoot.addChild(doc.createNode(dc.name).setMesh(doc.createMesh(dc.name).addPrimitive(fprim)).setSkin(skin));
  log(`${dc.name}: ${fi.length / 3} triangles over the head`);
}

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
const r5 = (x) => +x.toFixed(5);
const onHeadA = (a) => onHead(V3(a)).toArray().map(r5);
const hair = sim.chains.map((c, i) => [c, i]).filter(([c]) => c.bones.every((b) => /^hr/.test(b)));
const first = hair.length ? hair[0][1] : 0;
sim.chains = hair.map(([c]) => ({ ...c, rest: c.rest.map(onHeadA) }));
sim.links = sim.links.filter((l) => l[0] >= first && l[2] >= first).map((l) => [l[0] - first, l[1], l[2] - first, l[3], r5(l[4] * kHead)]);
sim.groups = sim.chains.length ? [[0, sim.chains.length, false]] : [];
for (const c of sim.caps) if (c.bone === 'Head' || c.bone === 'Neck') { c.a = onHeadA(c.a); c.b = onHeadA(c.b); c.r0 = r5(c.r0 * kHead); c.r1 = r5(c.r1 * kHead); }
cast.looks.ash2 = { mats, meta, scale: ashLook.scale, y0: ashLook.y0, sim, face: FACE_PLACE };
fs.writeFileSync(castPath, JSON.stringify(cast));
log('cast.json: looks.ash2 written; meta', JSON.stringify(meta));
