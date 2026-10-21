// Retargets Mixamo clips onto the player model and bakes them for the game.
//
//   node retarget.mjs <source.glb|.fbx>... [--clip from=to]... [--out file]
//
// Each source holds Mixamo clips on the standard mixamorig skeleton (a .glb such
// as three.js' Xbot, or FBX downloads from mixamo.com: Y Bot, "Without Skin",
// "In Place"). Every clip is mapped onto web/world/local/ash.glb by world-space
// rotation from the T pose, sampled at 30 fps and written, with the stride each
// cycle covers and the time the left foot is forward, to web/world/anims/ash.json.
// --clip renames a clip (walk=walk, "Running=run"); without it every clip is kept
// under its own name, lowercased. Clips named in STYLE (below) are restyled for a
// longer, livelier cartoon stride; --raw keeps them as the source has them.
// --calm walk=0.5 first scales the hips' and spine's swing about their average over
// the cycle (the spine half as much).
//
// The clips in ash.json come from three.js' Xbot (idle, run) and Soldier (walk), Mixamo
// characters and Mixamo animations shipped in three.js' examples (Mixamo animations are
// free to use in projects). Remake them with:
//   for m in Xbot Soldier; do curl -sSLo cache/anim/$m.glb https://raw.githubusercontent.com/mrdoob/three.js/r169/examples/models/gltf/$m.glb; done
//   npm install && node retarget.mjs cache/anim/Xbot.glb cache/anim/Soldier.glb --clip idle=idle --clip run=run --clip Walk=walk --calm walk=0.5
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const FPS = 30;

// mixamorig bone (prefix removed) -> player bone
const MAP = {
  Hips: 'Waist', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Spine3', Neck: 'Neck', Head: 'Head',
};
for (const [s, S] of [['L', 'Left'], ['R', 'Right']]) {
  Object.assign(MAP, {
    [S + 'Shoulder']: s + 'Shoulder', [S + 'Arm']: s + 'ArmA', [S + 'ForeArm']: s + 'ForeArm', [S + 'Hand']: s + 'Hand',
    [S + 'UpLeg']: s + 'Thigh', [S + 'Leg']: s + 'Leg', [S + 'Foot']: s + 'Foot', [S + 'ToeBase']: s + 'Toe',
  });
  for (const [f, F] of [['A', 'Thumb'], ['B', 'Index'], ['C', 'Middle'], ['D', 'Ring']]) {
    for (let j = 1; j <= 3; j++) MAP[`${S}Hand${F}${j}`] = `${s}Finger${f}${j}`;
  }
}

// glTF without its textures (Node cannot decode images)
function bare(b) {
  const n = b.readUInt32LE(12), j = JSON.parse(b.toString('utf8', 20, 20 + n));
  delete j.textures; delete j.images; delete j.samplers;
  for (const m of j.materials || []) {
    delete m.normalTexture; delete m.emissiveTexture; delete m.occlusionTexture;
    if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; }
  }
  let t = Buffer.from(JSON.stringify(j));
  t = Buffer.concat([t, Buffer.alloc((4 - t.length % 4) % 4, 32)]);
  const head = Buffer.alloc(20);
  head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(t.length, 12); head.write('JSON', 16);
  const out = Buffer.concat([head, t, b.subarray(20 + n)]);
  out.writeUInt32LE(out.length, 8);
  return out;
}
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
async function load(file) {
  const b = readFileSync(file);
  if (/\.fbx$/i.test(file)) { const s = new FBXLoader().parse(ab(b), ''); return { scene: s, animations: s.animations }; }
  return new Promise((r, j) => new GLTFLoader().parse(ab(bare(b)), '', r, j));
}

// each bone's rest (T) pose, as the file's nodes hold it, and its world rotation
function restOf(scene) {
  scene.updateMatrixWorld(true);
  const rest = new Map();
  scene.traverse((o) => { if (o.isBone) rest.set(o, { q: o.quaternion.clone(), p: o.position.clone(), w: o.getWorldQuaternion(new THREE.Quaternion()), wp: o.getWorldPosition(new THREE.Vector3()) }); });
  return rest;
}
const short = (n) => n.replace(/^mixamorig\d*:?/, '');

// ---------- style: a longer, livelier stride ----------
// Applied to each baked cycle named in STYLE (--raw skips it):
//   gain   swings scaled about an axis of the model (x = side to side, so a gain on x
//          spreads the legs or arms further front to back), about the cycle's mean
//          ('mean') or its least bent frame ('min': knees and elbows bend further
//          without overstraightening); no axis scales the whole swing
//   add    a fixed turn on top (forward lean of the chest, the head kept level)
//   feet   how much of each foot's original angle to the ground is kept as the leg swings further
//   ground the hips drop or rise so the lowest foot is as high as in the source, every
//          frame: the longer stride stays on the ground and the body bounces with it
//   warp   the stance (a foot on the ground) plays this much faster than the swing, so
//          the planted foot sweeps back faster for the same cadence
//   bounce extra lift of the hips while both feet are off the ground (model units)
const X = [1, 0, 0], Y = [0, 1, 0];
const LEGS = (th, kn, ft) => [['LThigh', th, X], ['RThigh', th, X], ['LLeg', kn, null, 'min'], ['RLeg', kn, null, 'min'], ['LFoot', ft, X], ['RFoot', ft, X]];
const ARMS = (sw, el) => [['LArmA', sw, X], ['RArmA', sw, X], ['LForeArm', el, null, 'min'], ['RForeArm', el, null, 'min']];
const STYLE = {
  walk: { gain: [...LEGS(1.8, 1.3, 1), ...ARMS(1.6, 1.2), ['Waist', 0.6, Y], ['Spine1', 0.8, Y]],
    add: [['Spine2', X, 0.05], ['Head', X, -0.04]], feet: 0.75 },
  run: { gain: [...LEGS(1.75, 1.4, 1), ...ARMS(1.9, 1.2), ['Waist', 1.3, Y], ['Spine1', 1.25, Y]],
    add: [['Spine1', X, 0.12], ['Spine2', X, 0.12], ['Neck', X, -0.06], ['Head', X, -0.1]], feet: 0.6, warp: 1, bounce: 0.035 },
};
const qv = (a, f) => new THREE.Quaternion(a[f * 4], a[f * 4 + 1], a[f * 4 + 2], a[f * 4 + 3]);
const qput = (a, f, q) => { a[f * 4] = q.x; a[f * 4 + 1] = q.y; a[f * 4 + 2] = q.z; a[f * 4 + 3] = q.w; };
const logq = (q) => { const w = Math.min(1, Math.max(-1, q.w)), s = Math.sqrt(1 - w * w), ang = 2 * Math.acos(w); return s < 1e-6 ? new THREE.Vector3() : new THREE.Vector3(q.x, q.y, q.z).multiplyScalar(ang / s); };
const expq = (r) => { const ang = r.length(); return ang < 1e-9 ? new THREE.Quaternion() : new THREE.Quaternion().setFromAxisAngle(r.clone().divideScalar(ang), ang); };
// pose the target at frame f of baked tracks
function setFrame(R, P, f) {
  for (const [b, a] of R) b.quaternion.set(a[f * 4], a[f * 4 + 1], a[f * 4 + 2], a[f * 4 + 3]);
  waist.position.set(P[f * 3], P[f * 3 + 1], P[f * 3 + 2]);
  dst.scene.updateMatrixWorld(true);
}
const FEET = [['LFoot', 'LToe'], ['RFoot', 'RToe']];
// each foot's height over its rest height (lower of ankle and toe)
function footH() {
  return FEET.map(([a, t]) => Math.min(dBy[a].getWorldPosition(new THREE.Vector3()).y - D0.get(dBy[a]).wp.y,
    dBy[t].getWorldPosition(new THREE.Vector3()).y - D0.get(dBy[t]).wp.y));
}
function style(st, times, rot, pos, dur) {
  const n = times.length;
  const R = new Map([...rot].map(([b, a]) => [b, a.slice()])), P = pos.slice();
  // the source's feet: height and world angle per frame
  const h0 = [], fq0 = [];
  for (let f = 0; f < n; f++) { setFrame(rot, pos, f); h0.push(footH()); fq0.push(FEET.map(([a]) => dBy[a].getWorldQuaternion(new THREE.Quaternion()))); }
  // swings
  for (const [bn, g, axis, about] of st.gain || []) {
    const b = dBy[bn], a = R.get(b); if (!a || g === 1) continue;
    const ax = axis && new THREE.Vector3(...axis).applyQuaternion(D0.get(b.parent).w.clone().invert());
    let ref;
    if (about === 'min') {   // least turned away from the rest pose
      let best = 1e9;
      for (let f = 0; f < n; f++) { const d = qv(a, f).multiply(D0.get(b).q.clone().invert()), ang = 2 * Math.acos(Math.min(1, Math.abs(d.w))); if (ang < best) { best = ang; ref = qv(a, f); } }
    } else {
      const m = new THREE.Vector4();
      for (let f = 0; f < n; f++) m.add(new THREE.Vector4(a[f * 4], a[f * 4 + 1], a[f * 4 + 2], a[f * 4 + 3]));
      m.normalize(); ref = new THREE.Quaternion(m.x, m.y, m.z, m.w);
    }
    const inv = ref.clone().invert();
    for (let f = 0; f < n; f++) {
      const r = logq(qv(a, f).multiply(inv));
      if (ax) r.addScaledVector(ax, (g - 1) * r.dot(ax)); else r.multiplyScalar(g);
      qput(a, f, expq(r).multiply(ref));
    }
  }
  // fixed turns
  for (const [bn, axis, ang] of st.add || []) {
    const b = dBy[bn], a = R.get(b); if (!a) continue;
    const t = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis).applyQuaternion(D0.get(b.parent).w.clone().invert()), ang);
    for (let f = 0; f < n; f++) qput(a, f, t.clone().multiply(qv(a, f)));
  }
  // feet: keep part of the source's angle to the ground; then the hips follow the lowest foot
  const pq = new THREE.Quaternion(), wq = new THREE.Quaternion(), v = new THREE.Vector3();
  const lo = h0.map((h) => Math.min(...h)), floor = Math.min(...lo);
  for (let f = 0; f < n; f++) {
    setFrame(R, P, f);
    FEET.forEach(([fn], i) => {
      const b = dBy[fn];
      b.parent.getWorldQuaternion(pq); b.getWorldQuaternion(wq);
      wq.slerp(fq0[f][i], st.feet ?? 0);
      b.quaternion.copy(pq.invert().multiply(wq)); b.updateMatrixWorld(true);
      qput(R.get(b), f, b.quaternion);
    });
    dst.scene.updateMatrixWorld(true);
    const dy = lo[f] - Math.min(...footH()) + (st.bounce || 0) * Math.min(1, Math.max(0, (lo[f] - floor) / 0.04));
    waist.getWorldPosition(v); v.y += dy; waist.parent.worldToLocal(v);
    P[f * 3] = v.x; P[f * 3 + 1] = v.y; P[f * 3 + 2] = v.z;
  }
  if (!st.warp) return { times, rot: R, pos: P };
  // time warp: stance frames pass faster; resampled back to an even 30 fps over the same duration
  const w = lo.map((h) => 1 + st.warp * Math.min(1, Math.max(0, 1 - (h - floor) / 0.04)));
  const tau = [0];
  for (let f = 1; f < n; f++) tau.push(tau[f - 1] + (times[f] - times[f - 1]) * 2 / (w[f - 1] + w[f]));
  const sc = dur / tau[n - 1];
  const R2 = new Map([...R].map(([b]) => [b, []])), P2 = [];
  let j = 0;
  for (let f = 0; f < n; f++) {
    const t = times[f] / sc;
    while (j < n - 2 && tau[j + 1] < t) j++;
    const u = Math.min(1, Math.max(0, (t - tau[j]) / (tau[j + 1] - tau[j])));
    for (const [b, a] of R) { const q = qv(a, j).slerp(qv(a, j + 1), u); R2.get(b).push(q.x, q.y, q.z, q.w); }
    for (let k = 0; k < 3; k++) P2.push(P[j * 3 + k] + (P[(j + 1) * 3 + k] - P[j * 3 + k]) * u);
  }
  return { times, rot: R2, pos: P2 };
}

// ---------- arguments ----------
const args = process.argv.slice(2), sources = [], rename = new Map(), calm = new Map();
let out = resolve(ROOT, 'web/world/anims/ash.json'), noStyle = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--clip') { const [a, b] = args[++i].split('='); rename.set(a, b); }
  else if (args[i] === '--calm') { const [a, b] = args[++i].split('='); calm.set(a, +b); }
  else if (args[i] === '--out') out = resolve(args[++i]);
  else if (args[i] === '--raw') noStyle = true;
  else sources.push(args[i]);
}
if (!sources.length) { console.error('usage: node retarget.mjs <source.glb|.fbx>... [--clip from=to]... [--out file]'); process.exit(1); }

// ---------- target ----------
const dst = await load(resolve(ROOT, 'web/world/local/ash.glb'));
const D0 = restOf(dst.scene);
const dBones = [];
dst.scene.traverse((o) => { if (o.isBone) dBones.push(o); });   // parents before children
const dBy = Object.fromEntries(dBones.map((b) => [b.name, b]));
const waist = dBy.Waist, waistW = waist.getWorldPosition(new THREE.Vector3());

const clips = [], meta = {};
for (const file of sources) {
  const src = await load(file);
  // face +Z like the player: turn the source round if its toes point the other way
  src.scene.updateMatrixWorld(true);
  const fz = {};
  src.scene.traverse((o) => { if (o.isBone) fz[short(o.name)] = o.getWorldPosition(new THREE.Vector3()).z; });
  if (fz.LeftToeBase < fz.LeftFoot) { src.scene.rotation.y += Math.PI; console.log(file, 'faces -Z: turned round'); }
  const S0 = restOf(src.scene);
  const sBy = {};
  src.scene.traverse((o) => { if (o.isBone) sBy[short(o.name)] = o; });
  const sHips = sBy.Hips, hipsW = sHips.getWorldPosition(new THREE.Vector3());
  const k = waistW.y / hipsW.y;   // hip height, target over source
  const pairs = Object.entries(MAP).filter(([s, d]) => sBy[s] && dBy[d]).map(([s, d]) => [sBy[s], dBy[d]]);
  const bySrc = new Map(pairs.map(([s, d]) => [d, s]));
  const mixer = new THREE.AnimationMixer(src.scene);

  for (const clip of src.animations) {
    const name = rename.size ? rename.get(clip.name) : clip.name.toLowerCase();
    if (!name) continue;
    mixer.stopAllAction();
    for (const [b, r] of S0) { b.quaternion.copy(r.q); b.position.copy(r.p); }
    mixer.clipAction(clip).play();
    const n = Math.max(2, Math.round(clip.duration * FPS) + 1), times = [];
    const rot = new Map(pairs.map(([, d]) => [d, []])), pos = [];
    const dw = new Map(), q = new THREE.Quaternion(), v = new THREE.Vector3(), pq = new THREE.Quaternion();
    for (let f = 0; f < n; f++) {
      const t = Math.min(clip.duration, f / FPS);
      times.push(t);
      mixer.setTime(t);
      src.scene.updateMatrixWorld(true);
      // rotations: the source's change from rest, in world space, applied to the target's rest
      for (const b of dBones) {
        const r = D0.get(b), s = bySrc.get(b);
        b.parent.getWorldQuaternion(pq);
        if (s) {
          s.getWorldQuaternion(q).multiply(S0.get(s).w.clone().invert()).multiply(r.w);
          b.quaternion.copy(pq.invert().multiply(q));
        } else b.quaternion.copy(r.q);
        b.updateMatrixWorld(true);
        dw.set(b, b.getWorldQuaternion(new THREE.Quaternion()));
      }
      // hips travel, scaled to the target's height
      sHips.getWorldPosition(v).sub(hipsW).multiplyScalar(k).add(waistW);
      waist.parent.worldToLocal(v);
      waist.position.copy(v);
      pos.push(v.x, v.y, v.z);
      for (const [, d] of pairs) { const a = rot.get(d), c = d.quaternion, l = a.length; if (l && a[l - 4] * c.x + a[l - 3] * c.y + a[l - 2] * c.z + a[l - 1] * c.w < 0) a.push(-c.x, -c.y, -c.z, -c.w); else a.push(c.x, c.y, c.z, c.w); }
    }
    // in place: take out any drift along the ground over the cycle
    for (const ax of [0, 2]) {
      const d = (pos[(n - 1) * 3 + ax] - pos[ax]) / (n - 1);
      for (let f = 0; f < n; f++) pos[f * 3 + ax] -= d * f;
    }
    // calmer: hips and spine swing less about their average over the cycle
    if (calm.has(name)) {
      const f = calm.get(name), mean = new THREE.Quaternion(), k0 = new THREE.Quaternion();
      for (const [nm, g] of [['Waist', f], ['Spine1', (1 + f) / 2], ['Spine2', (1 + f) / 2], ['Spine3', (1 + f) / 2]]) {
        const a = rot.get(dBy[nm]); if (!a) continue;
        let x = 0, y = 0, z = 0, w = 0;
        for (let i = 0; i < a.length; i += 4) { x += a[i]; y += a[i + 1]; z += a[i + 2]; w += a[i + 3]; }
        mean.set(x, y, z, w).normalize();
        for (let i = 0; i < a.length; i += 4) { k0.fromArray(a, i); k0.copy(mean.clone().slerp(k0, g)).toArray(a, i); }
      }
      let mx = 0;
      for (let f2 = 0; f2 < n; f2++) mx += pos[f2 * 3] / n;
      for (let f2 = 0; f2 < n; f2++) pos[f2 * 3] = mx + (pos[f2 * 3] - mx) * f;
    }
    let T = times, R = rot, P = pos;
    const st = noStyle ? null : STYLE[name];
    if (st) ({ times: T, rot: R, pos: P } = style(st, times, rot, pos, clip.duration));
    const N = T.length;
    const r4 = (a) => a.map((x) => Math.round(x * 1e4) / 1e4);
    const tracks = [new THREE.VectorKeyframeTrack('Waist.position', T, r4(P))];
    for (const [, d] of pairs) tracks.push(new THREE.QuaternionKeyframeTrack(`${d.name}.quaternion`, T, r4(R.get(d))));
    const baked = new THREE.AnimationClip(name, clip.duration, tracks);
    clips.push(THREE.AnimationClip.toJSON(baked));

    // stride: how fast a foot on the ground sweeps back, times the cycle (the ground covered per
    // cycle when played at its own speed); and when the left foot leads. Sampled finely from the
    // baked clip, a foot counting as planted within 1.5 cm of its lowest.
    const M = 480, dm = new THREE.AnimationMixer(dst.scene), feet = [], fh = [];
    dm.clipAction(baked).play();
    for (let f = 0; f <= M; f++) {
      dm.setTime(f / M * clip.duration * 0.99999); dst.scene.updateMatrixWorld(true);
      // each foot's lower point (ankle or toe, over their rest heights) and its height
      feet.push(FEET.map(([a, t]) => {
        const A = dBy[a].getWorldPosition(new THREE.Vector3()), B = dBy[t].getWorldPosition(new THREE.Vector3());
        return [A, B, A.y - D0.get(dBy[a]).wp.y < B.y - D0.get(dBy[t]).wp.y ? 0 : 1];
      }));
      fh.push(footH());
    }
    dm.stopAllAction(); dm.uncacheRoot(dst.scene);
    const sp = [], dtm = clip.duration / M;
    for (const i of [0, 1]) {
      const lo = Math.min(...fh.map((h) => h[i])) + 0.015;
      for (let f = 1; f <= M; f++) {
        const [a, b] = [feet[f - 1][i], feet[f][i]];
        if (fh[f][i] < lo && fh[f - 1][i] < lo && a[2] === b[2]) sp.push((a[a[2]].z - b[b[2]].z) / dtm);
      }
    }
    sp.sort((a, b) => a - b);
    const speed = sp[sp.length >> 1] || 0;
    let lead = 0;
    for (let f = 0; f <= M; f++) if (feet[f][0][0].z - feet[f][1][0].z > feet[lead][0][0].z - feet[lead][1][0].z) lead = f;
    meta[name] = { stride: Math.round(speed * clip.duration * 1e4) / 1e4, lead: Math.round(lead / M * 1e3) / 1e3 };
    console.log(`${name.padEnd(10)} ${clip.duration.toFixed(2)}s  stride ${meta[name].stride} (model units)  left foot leads at ${meta[name].lead}`);
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ meta, clips }));
console.log('wrote', out);
