// A generated person as three.js objects: the body (and what they wear) as
// skinned meshes on the shared skeleton (rig.js) in its A pose (the bind pose),
// cel shaded like the rest of the game (toon.js) and outlined by the ink pass
// (outline.js); the game's clips (anims/ash.json) play on it.
import * as THREE from 'three';
import { celify } from '../toon.js';
import { buildBody, loadBase } from './gen.js';
import { BONE_NAMES, PARENT, NB } from './rig.js';

const SKIN_CEL = { bands: [0.12, 0.34, 0.62], deep: [0.66, 0.56, 0.6], shade: [0.84, 0.74, 0.76], lit: [1.04, 1.02, 0.99], litAdd: [0.02, 0.01, 0] };

// bones for a skeleton (local positions sk.t, rotations q)
export function makeBones(sk, q) {
  const bones = [];
  for (let i = 0; i < NB; i++) {
    const b = new THREE.Bone(); b.name = BONE_NAMES[i];
    b.position.fromArray(sk.t[i]); b.quaternion.fromArray(q[i]);
    if (PARENT[i] >= 0) bones[PARENT[i]].add(b);
    bones.push(b);
  }
  return bones;
}

export function geometryOf(mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(mesh.nrm, 3));
  if (mesh.skin) {
    g.setAttribute('skinIndex', new THREE.BufferAttribute(Uint16Array.from(mesh.skin), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(mesh.wts, 4));
  }
  if (mesh.canon) g.setAttribute('canon', new THREE.BufferAttribute(mesh.canon, 3));
  if (mesh.part) g.setAttribute('part', new THREE.BufferAttribute(mesh.part, 4));
  g.setIndex(new THREE.BufferAttribute(mesh.idx, 1));
  return g;
}

let CLIPS = null;
export async function loadClips() {
  if (CLIPS) return CLIPS;
  try {
    const j = await (await fetch(new URL('../anims/ash.json', import.meta.url))).json();
    CLIPS = { meta: j.meta, clips: j.clips.map((c) => THREE.AnimationClip.parse(c)) };
  } catch { CLIPS = { meta: {}, clips: [] }; }
  return CLIPS;
}
// the clips fitted to a person: the waist's bob and sway scaled to their leg length
const CLIP_WAIST = 0.712;
export function clipsFor(waistY) {
  if (!CLIPS) return [];
  const k = waistY / CLIP_WAIST;
  return CLIPS.clips.map((c) => {
    const cc = c.clone();
    for (const t of cc.tracks) if (t.name === 'Waist.position') { t.values = t.values.slice(); for (let i = 0; i < t.values.length; i++) t.values[i] *= k; }
    return cc;
  });
}

export async function makePerson(params = {}, o = {}) {
  if (!o.direct) await loadBase();
  const b = buildBody(params, o);
  const A = b.anat;
  const root = new THREE.Group();
  const g = geometryOf(b.mesh);
  const m = celify(new THREE.MeshLambertMaterial({ color: params.skin || '#f6d2b8' }), SKIN_CEL);
  let body;
  if (b.mesh.skin) {
    const bones = makeBones(A.sk, A.aq);
    body = new THREE.SkinnedMesh(g, m);
    root.add(bones[0]); root.add(body);
    root.updateMatrixWorld(true);
    body.bind(new THREE.Skeleton(bones));
    body.userData.bones = bones;
  } else { body = new THREE.Mesh(g, m); root.add(body); }
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  const person = { root, body, anat: A, H: A.H, params, stats: `${(A.H * 100).toFixed(0)}cm ${b.mesh.pos.length / 3}v ${b.ms}ms` };
  if (o.anim && b.mesh.skin) {
    await loadClips();
    const mixer = new THREE.AnimationMixer(root), clips = clipsFor(A.J ? A.sk.pos[1][1] : 0.7);
    person.mixer = mixer; person.clips = clips;
    person.play = (name) => { mixer.stopAllAction(); const c = clips.find((x) => x.name === name); if (c) mixer.clipAction(c).play(); };
  }
  return person;
}
