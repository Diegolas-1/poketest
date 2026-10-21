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
// under its own name, lowercased. --calm walk=0.5 scales the hips' and spine's
// swing about their average over the cycle (the spine half as much).
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
  scene.traverse((o) => { if (o.isBone) rest.set(o, { q: o.quaternion.clone(), p: o.position.clone(), w: o.getWorldQuaternion(new THREE.Quaternion()) }); });
  return rest;
}
const short = (n) => n.replace(/^mixamorig\d*:?/, '');

// ---------- arguments ----------
const args = process.argv.slice(2), sources = [], rename = new Map(), calm = new Map();
let out = resolve(ROOT, 'web/world/anims/ash.json');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--clip') { const [a, b] = args[++i].split('='); rename.set(a, b); }
  else if (args[i] === '--calm') { const [a, b] = args[++i].split('='); calm.set(a, +b); }
  else if (args[i] === '--out') out = resolve(args[++i]);
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
    const rot = new Map(pairs.map(([, d]) => [d, []])), pos = [], feet = [];
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
      dst.scene.updateMatrixWorld(true);
      feet.push(['LFoot', 'RFoot'].map((n) => dBy[n].getWorldPosition(new THREE.Vector3())));
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
    const r4 = (a) => a.map((x) => Math.round(x * 1e4) / 1e4);
    const tracks = [new THREE.VectorKeyframeTrack('Waist.position', times, r4(pos))];
    for (const [, d] of pairs) tracks.push(new THREE.QuaternionKeyframeTrack(`${d.name}.quaternion`, times, r4(rot.get(d))));
    clips.push(THREE.AnimationClip.toJSON(new THREE.AnimationClip(name, clip.duration, tracks)));

    // stride: how far the planted (lower) foot slides back per cycle; and when the left foot leads
    const sp = [];
    for (let f = 1; f < n; f++) {
      const i = feet[f][0].y < feet[f][1].y ? 0 : 1;
      if ((feet[f - 1][0].y < feet[f - 1][1].y ? 0 : 1) === i) sp.push((feet[f - 1][i].z - feet[f][i].z) * FPS);
    }
    sp.sort((a, b) => a - b);
    const speed = sp[sp.length >> 1] || 0;
    let lead = 0;
    for (let f = 0; f < n; f++) if (feet[f][0].z - feet[f][1].z > feet[lead][0].z - feet[lead][1].z) lead = f;
    meta[name] = { stride: Math.round(speed * clip.duration * 1e4) / 1e4, lead: Math.round(lead / FPS / clip.duration * 1e3) / 1e3 };
    console.log(`${name.padEnd(10)} ${clip.duration.toFixed(2)}s  stride ${meta[name].stride} (model units)  left foot leads at ${meta[name].lead}`);
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ meta, clips }));
console.log('wrote', out);
