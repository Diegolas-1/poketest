// A generated person as three.js objects: the body and everything they wear as
// skinned meshes on one skeleton (rig.js) in its A pose (the bind pose), cel
// shaded like the rest of the game (toon.js), outlined by the ink pass
// (outline.js); the game's clips (anims/ash.json) play on it.
//
// A look: { body: anatomy sliders (anatomy.js SLIDERS), skin: { tone, ... },
// underwear: { style, color, trim }, face: {...} (skin.js), hair: {...} (hair.js),
// outfit: [{ id, colourway, colors, params, pattern }] (outfit.js, catalog.json) }
import * as THREE from 'three';
import { buildBody, loadBase, base } from './gen.js';
import { BONE_NAMES, PARENT, NB } from './rig.js';
import { skinMaterial } from './skin.js';
import { clothMaterial } from './paint.js';
import { context } from './wear.js';
import { dress } from './outfit.js';

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
    g.setAttribute('skinIndex', new THREE.BufferAttribute(mesh.skin instanceof Uint16Array ? mesh.skin : Uint16Array.from(mesh.skin), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(mesh.wts, 4));
  }
  for (const [k, w] of [['canon', 3], ['part', 4], ['share', 4], ['gco', 4]]) if (mesh[k]) g.setAttribute(k, new THREE.BufferAttribute(mesh[k], w));
  g.setIndex(new THREE.BufferAttribute(mesh.idx, 1));
  return g;
}

let CLIPS = null, CATALOG = null;
export async function loadClips() {
  if (CLIPS) return CLIPS;
  try {
    const j = await (await fetch(new URL('../anims/ash.json', import.meta.url))).json();
    CLIPS = { meta: j.meta, clips: j.clips.map((c) => THREE.AnimationClip.parse(c)) };
  } catch { CLIPS = { meta: {}, clips: [] }; }
  return CLIPS;
}
export async function loadCatalog() {
  if (!CATALOG) CATALOG = await (await fetch(new URL('./catalog.json', import.meta.url))).json();
  return CATALOG;
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

export function lookOf(x = {}) { return x.body || x.outfit || x.skin ? x : { body: x, skin: x.skin ? { tone: x.skin } : undefined }; }

export async function makePerson(input = {}, o = {}) {
  const look = lookOf(input);
  if (!o.direct) await loadBase();
  const b = buildBody(look.body || {}, o);
  const A = b.anat;
  const root = new THREE.Group();
  const person = { root, anat: A, H: A.H, look, meshes: [], built: b };
  // what they wear first: it says which parts of the body are covered
  let worn = [];
  const hide = new Float32Array(b.mesh.pos.length / 3);
  if (!o.direct && look.outfit && look.outfit.length) {
    const cat = await loadCatalog(), ctx = context(b, base());
    const t0 = performance.now();
    worn = dress(ctx, look.outfit, cat);
    person.dressMs = Math.round(performance.now() - t0);
    for (const w of worn) if (w.piece) for (let v = 0; v < hide.length; v++) if (w.piece.hide[v]) hide[v] = 1;
    person.missing = worn.filter((w) => w.missing).map((w) => w.missing);
  }
  const g = geometryOf(b.mesh);
  g.setAttribute('hide', new THREE.BufferAttribute(hide, 1));
  const bodyMat = skinMaterial(look, base() ? base().land : A.L);
  const bones = makeBones(A.sk, A.aq);
  root.add(bones[0]);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const add = (geo, mat, name) => {
    const m = b.mesh.skin ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat);
    m.name = name; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    root.add(m);
    if (m.isSkinnedMesh) m.bind(skeleton);
    person.meshes.push(m);
    return m;
  };
  person.body = add(g, bodyMat, 'body');
  for (const w of worn) {
    if (!w.piece) continue;
    const mat = clothMaterial({ colors: w.paint.colors, glsl: w.paint.glsl, params: w.paint.params, double: w.piece.double, inside: w.paint.inside });
    const m = add(geometryOf(w.piece.mesh), mat, w.item.id);
    m.userData.item = w.item; m.userData.slot = w.slot;
  }
  person.bones = bones; person.skeleton = skeleton;
  person.stats = `${(A.H * 100).toFixed(0)}cm ${b.mesh.pos.length / 3}v ${b.ms}ms` + (person.dressMs !== undefined ? ` +${worn.length} pieces ${person.dressMs}ms` : '');
  if (o.anim && b.mesh.skin) {
    await loadClips();
    const mixer = new THREE.AnimationMixer(root), clips = clipsFor(A.sk.pos[1][1]);
    person.mixer = mixer; person.clips = clips;
    person.play = (name) => { mixer.stopAllAction(); const c = clips.find((x) => x.name === name); if (c) mixer.clipAction(c).play(); };
  }
  person.dispose = () => { for (const m of person.meshes) { m.geometry.dispose(); m.material.dispose(); } };
  return person;
}
